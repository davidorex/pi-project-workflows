/**
 * Centralized read/write API for .project/*.json project block files.
 * Validates data against schemas before writing; uses atomic writes (tmp + rename).
 * Read-modify-write operations (append, update) use file-level locking via proper-lockfile
 * to prevent data loss from concurrent workflow steps targeting the same block.
 *
 * DispatchContext (FGAP-004): every write function accepts an optional final
 * argument `ctx?: DispatchContext`. When provided AND the target block's
 * schema declares any of {created_by, created_at, modified_by, modified_at},
 * items are stamped via `stampItem` from `./dispatch-context` before AJV
 * validation. When `ctx` is undefined, behavior is byte-identical to the
 * pre-step-3 surface — the parameter is purely additive. The has-author-fields
 * decision is mtime-cached per (cwd, blockName) to avoid re-reading the
 * schema on every write; mirrors the `getProjectContext` cache pattern from
 * `project-context.ts`.
 *
 * Future extraction seam for pi-project extension.
 */
import fs from "node:fs";
import path from "node:path";
import _lockfile from "proper-lockfile";
import type { DispatchContext } from "./dispatch-context.js";
import { stampItem } from "./dispatch-context.js";
import { PROJECT_DIR, SCHEMAS_DIR } from "./project-dir.js";
import { validateFromFile } from "./schema-validator.js";

// Node16 module resolution + CJS interop: default import may be wrapped
const lockfile = (_lockfile as any).default ?? _lockfile;

/**
 * Acquire a file-level lock, run fn(), release lock in finally.
 * Skips locking if the target file does not yet exist (first write — no contention possible).
 * Uses proper-lockfile's lockSync/unlockSync for synchronous read-modify-write safety.
 */
function withBlockLock<T>(filePath: string, fn: () => T): T {
	if (!fs.existsSync(filePath)) {
		return fn();
	}
	lockfile.lockSync(filePath, { stale: 10000 });
	try {
		return fn();
	} finally {
		lockfile.unlockSync(filePath);
	}
}

function blockFilePath(cwd: string, blockName: string): string {
	return path.join(cwd, PROJECT_DIR, `${blockName}.json`);
}

function blockSchemaPath(cwd: string, blockName: string): string {
	return path.join(cwd, PROJECT_DIR, SCHEMAS_DIR, `${blockName}.schema.json`);
}

// ── Schema introspection cache (DispatchContext support, FGAP-004) ───────────

/**
 * Author fields recognized by `stampItem`. If the target schema's
 * (top-level array item, or top-level object) `properties` declares any of
 * these, ctx-stamping runs before AJV validation; otherwise stamping is
 * skipped so an `additionalProperties: false` schema does not fail
 * validation on injected fields.
 */
const AUTHOR_FIELDS = ["created_by", "created_at", "modified_by", "modified_at"] as const;

interface SchemaCacheEntry {
	mtimeMs: number;
	/** True when the schema declares ANY author field anywhere — top-level
	 * envelope OR any nested array item shape. Used for the cheap "could
	 * stamping ever happen for this block?" check. Derived from
	 * `envelopeDeclares.size > 0 || any perArrayKey value has size > 0`. */
	hasAuthorFields: boolean;
	/** Subset of `AUTHOR_FIELDS` declared on the TOP-LEVEL envelope's
	 * `properties`. Distinguished from per-array-key state so `writeBlock`'s
	 * envelope-stamp does not fire merely because some nested array's items
	 * carry author fields. Empty set = "no envelope-level stamping". */
	envelopeDeclares: ReadonlySet<string>;
	/** Per-array-key declared subset — keyed by the array property name (NOT
	 * a dotted path). Built by recursing through the schema so nested arrays
	 * (e.g. `properties.reviews.items.properties.findings`) appear under
	 * their own key. Lookup miss = "no entry for this key" = stamping is
	 * skipped (safe default for unrecognised keys). The Set value carries
	 * the SUBSET of `AUTHOR_FIELDS` that the array's items declare so
	 * `stampItem` only touches schema-declared fields and does not trip
	 * `additionalProperties: false`. Empty set = "key catalogued but no
	 * author fields declared on its items". */
	perArrayKey: Map<string, ReadonlySet<string>>;
}

const schemaCache = new Map<string, SchemaCacheEntry>();

function safeStat(p: string): fs.Stats | null {
	try {
		return fs.statSync(p);
	} catch {
		return null;
	}
}

/**
 * Subset of `AUTHOR_FIELDS` that the schema's TOP-LEVEL `properties` object
 * declares. Used by `writeBlock`'s envelope-stamp question — whole-block
 * writes stamp on the envelope, not on every nested item. Empty set = "no
 * envelope-level author fields declared, skip stamping."
 */
function schemaTopLevelDeclaredAuthorFields(schema: unknown): ReadonlySet<string> {
	const out = new Set<string>();
	if (!schema || typeof schema !== "object") return out;
	const s = schema as Record<string, unknown>;
	const props = s.properties as Record<string, unknown> | undefined;
	if (!props) return out;
	for (const f of AUTHOR_FIELDS) {
		if (Object.hasOwn(props, f)) out.add(f);
	}
	return out;
}

/**
 * Walk every `items.properties` reachable from a schema by recursing through
 * `properties.*` and `items.*`. For each visited array property, record
 * whether its items' properties declare any author field. The result map is
 * keyed by the array property name; nested arrays (e.g.
 * `properties.reviews.items.properties.findings`) appear under their own key
 * (`findings`) so the caller's question — "do the items of array
 * '<arrayKey>' declare author fields?" — gets the right answer regardless of
 * nesting depth. Mutates `into` in place.
 *
 * Recursion is bounded by the schema's structural depth — there is no risk
 * of cycles unless the schema uses `$ref` cycles (which AJV would reject as
 * malformed during data validation, and step-3 schemas use no $ref).
 */
function collectArrayItemAuthorDecisions(schema: unknown, into: Map<string, ReadonlySet<string>>): void {
	if (!schema || typeof schema !== "object") return;
	const s = schema as Record<string, unknown>;
	const props = s.properties as Record<string, unknown> | undefined;
	if (!props) return;
	for (const [propKey, propSpecRaw] of Object.entries(props)) {
		if (!propSpecRaw || typeof propSpecRaw !== "object") continue;
		const spec = propSpecRaw as Record<string, unknown>;
		if (spec.type === "array") {
			const items = spec.items as Record<string, unknown> | undefined;
			if (items && typeof items === "object") {
				const itemProps = items.properties as Record<string, unknown> | undefined;
				if (itemProps) {
					const declared = new Set<string>();
					for (const f of AUTHOR_FIELDS) {
						if (Object.hasOwn(itemProps, f)) declared.add(f);
					}
					// "Union" if the same key appears at multiple nesting
					// depths — the recorded set is the union of declared
					// fields across all reachable shapes for the key. This
					// preserves the earlier "stamp on positive declaration
					// if any reachable shape carries the field" behavior
					// without losing the per-field grain.
					const prior = into.get(propKey);
					if (prior) {
						const merged = new Set<string>(prior);
						for (const f of declared) merged.add(f);
						into.set(propKey, merged);
					} else {
						into.set(propKey, declared);
					}
					// Recurse into items so deeper nested arrays are catalogued too.
					collectArrayItemAuthorDecisions(items, into);
				}
			}
		} else {
			// Recurse into nested object properties (covers `type: "object"`
			// without a literal `type` field — JSON Schema permits omitting
			// `type` so long as `properties` is present).
			collectArrayItemAuthorDecisions(spec, into);
		}
	}
}

/**
 * Load the cached schema-introspection answer for a schema file, refreshing
 * the cache when the file's mtime changes (or it appears / disappears).
 * Returns `null` when no schema exists at the path — callers treat that as
 * "no author fields declared" and skip ctx-stamping silently.
 *
 * Cache key is the absolute schema path (globally unique across cwds and
 * block names), enabling reuse for arbitrary (filePath, schemaPath) pairs
 * outside `.project/` — e.g., monitor side-car list schemas resolved from
 * `import.meta.url` in pi-behavior-monitors.
 */
function getSchemaCacheEntry(schemaPath: string | null): SchemaCacheEntry | null {
	if (!schemaPath) return null;
	const key = path.resolve(schemaPath);
	const stat = safeStat(key);
	if (!stat) {
		// Missing schema — drop any stale cache entry and signal absence.
		schemaCache.delete(key);
		return null;
	}
	const mtimeMs = stat.mtimeMs;
	const hit = schemaCache.get(key);
	if (hit && hit.mtimeMs === mtimeMs) return hit;

	let schema: unknown;
	try {
		schema = JSON.parse(fs.readFileSync(key, "utf-8"));
	} catch {
		// Unreadable / invalid JSON — treat as "no author fields declared" so
		// stamping is skipped; the existing AJV validation path will surface the
		// real problem on the next write.
		const entry: SchemaCacheEntry = {
			mtimeMs,
			hasAuthorFields: false,
			envelopeDeclares: new Set<string>(),
			perArrayKey: new Map(),
		};
		schemaCache.set(key, entry);
		return entry;
	}
	const perArrayKey = new Map<string, ReadonlySet<string>>();
	collectArrayItemAuthorDecisions(schema, perArrayKey);
	const envelopeDeclares = schemaTopLevelDeclaredAuthorFields(schema);
	let anyArrayItemDeclares = false;
	for (const v of perArrayKey.values()) {
		if (v.size > 0) {
			anyArrayItemDeclares = true;
			break;
		}
	}
	const entry: SchemaCacheEntry = {
		mtimeMs,
		hasAuthorFields: envelopeDeclares.size > 0 || anyArrayItemDeclares,
		envelopeDeclares,
		perArrayKey,
	};
	schemaCache.set(key, entry);
	return entry;
}

/**
 * Subset of `AUTHOR_FIELDS` declared at the schema's top-level envelope.
 * Used by `writeTypedFile` to decide which envelope fields to stamp on a
 * whole-file write — distinct from per-item stamping which uses
 * `declaredAuthorFieldsForArray`. Empty set = "no envelope-level stamping."
 */
function declaredAuthorFieldsForEnvelope(schemaPath: string | null): ReadonlySet<string> {
	const entry = getSchemaCacheEntry(schemaPath);
	return entry?.envelopeDeclares ?? new Set<string>();
}

/**
 * Subset of `AUTHOR_FIELDS` declared on the items of the array reached by
 * `arrayKey` — at any nesting depth. Used by the array-grained writers to
 * thread the per-field stamping decision into `stampItem`. An array key not
 * catalogued by the schema returns the empty set — stamping a key the schema
 * does not describe is the path that triggers `additionalProperties: false`
 * AJV failures, so the safe default is "skip" rather than "trust the envelope
 * answer." Empty set = "no per-item stamping."
 */
function declaredAuthorFieldsForArray(schemaPath: string | null, arrayKey: string): ReadonlySet<string> {
	const entry = getSchemaCacheEntry(schemaPath);
	if (!entry) return new Set<string>();
	return entry.perArrayKey.get(arrayKey) ?? new Set<string>();
}

/**
 * Conditionally stamp `item` when `ctx` is provided AND the schema declares
 * author fields on the relevant array items. Returns the (possibly stamped)
 * item — callers downstream feed it to AJV validation as usual.
 *
 * `mode` tracks "is this a fresh insertion or a mutation of an existing
 * item?" so `created_by` / `created_at` are not refreshed on update.
 */
function maybeStampItem(
	schemaPath: string | null,
	arrayKey: string,
	item: Record<string, unknown>,
	ctx: DispatchContext | undefined,
	mode: "create" | "update",
): Record<string, unknown> {
	if (!ctx) return item;
	const declared = declaredAuthorFieldsForArray(schemaPath, arrayKey);
	if (declared.size === 0) return item;
	return stampItem(item, ctx, mode, declared);
}

/**
 * Read and parse a .project/{blockName}.json file.
 * Throws if the file does not exist or contains invalid JSON.
 *
 * Optional filter: when provided, returns a shallow copy of the block with only
 * matching items in the specified array key. Non-array or missing keys return the
 * block unchanged. The filter is applied after parsing, before returning.
 */
export function readBlock(
	cwd: string,
	blockName: string,
	filter?: { arrayKey: string; predicate: (item: Record<string, unknown>) => boolean },
): unknown {
	const filePath = blockFilePath(cwd, blockName);
	let content: string;
	try {
		content = fs.readFileSync(filePath, "utf-8");
	} catch {
		throw new Error(`Block file not found: .project/${blockName}.json`);
	}

	let data: unknown;
	try {
		data = JSON.parse(content);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(`Invalid JSON in block file: .project/${blockName}.json: ${msg}`);
	}

	if (filter) {
		const record = data as Record<string, unknown>;
		const arr = record[filter.arrayKey];
		if (Array.isArray(arr)) {
			return { ...record, [filter.arrayKey]: arr.filter(filter.predicate) };
		}
	}

	return data;
}

/**
 * Resolve the existing schema path for a block (or null when no schema
 * file is present at the conventional location). Used by every wrapper
 * that delegates to the typed-file primitives.
 */
function existingBlockSchemaPath(cwd: string, blockName: string): string | null {
	const schemaFile = blockSchemaPath(cwd, blockName);
	return fs.existsSync(schemaFile) ? schemaFile : null;
}

/**
 * Read raw file content as a parsed value, throwing labeled errors
 * matching the prior `readBlock` semantics. Generalised so the typed-file
 * primitives can read arbitrary paths (not only `.project/<name>.json`).
 * `errorLabel` typically ends up like `block file '<name>.json'` or
 * `monitor '<name>' patterns`.
 */
function readTypedFile(filePath: string, errorLabel: string): unknown {
	let content: string;
	try {
		content = fs.readFileSync(filePath, "utf-8");
	} catch {
		throw new Error(`File not found: ${errorLabel} (${filePath})`);
	}
	try {
		return JSON.parse(content);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(`Invalid JSON in ${errorLabel} (${filePath}): ${msg}`);
	}
}

/**
 * Validated whole-file write to an arbitrary `(filePath, schemaPath)` pair.
 * The `.project/`-targeting `writeBlock` becomes a thin wrapper over this.
 * `schemaPath = null` skips AJV validation entirely (matches `writeBlock`'s
 * "no schema file present" semantic).
 *
 * `ctx` (FGAP-004): when provided AND the schema declares author fields at
 * the top-level envelope (and `data` is object-shaped, NOT array-shaped),
 * the envelope is stamped before AJV runs. Top-level array files (e.g.
 * monitor pattern lists) skip envelope-stamping silently — the envelope
 * lookup returns an empty set for array schemas because their top-level
 * `properties` is undefined.
 *
 * Atomic write via tmp + rename. Does NOT itself acquire a `withBlockLock`
 * — whole-file overwrite has no read-modify-write race that locking would
 * protect against. Callers performing read-modify-write (e.g.
 * `appendToTypedFile`, `appendToBlock`, …) wrap the surrounding critical
 * section in `withBlockLock` themselves; `writeTypedFile` is then called
 * from inside that section. This matches the prior `writeBlock` /
 * `appendToBlock` split exactly — preserves byte-identical lock semantics
 * for existing callers.
 */
export function writeTypedFile(
	filePath: string,
	schemaPath: string | null,
	data: unknown,
	ctx?: DispatchContext,
	errorLabel?: string,
): void {
	const label = errorLabel ?? filePath;

	// Optional ctx-stamping: only when the schema declares author fields at
	// the top-level envelope, and only on object-shaped data. Per-field
	// declared subset is threaded into `stampItem` so partial declarations
	// (e.g. envelope declares `created_by` only) do not inject the other
	// three fields and trip `additionalProperties: false`.
	let toWrite = data;
	if (ctx && schemaPath && data && typeof data === "object" && !Array.isArray(data)) {
		const declared = declaredAuthorFieldsForEnvelope(schemaPath);
		if (declared.size > 0) {
			toWrite = stampItem(data as Record<string, unknown>, ctx, "create", declared);
		}
	}

	// Validate before write (if a schema is supplied)
	if (schemaPath) {
		validateFromFile(schemaPath, toWrite, label);
	}

	// Ensure directory exists
	fs.mkdirSync(path.dirname(filePath), { recursive: true });

	// Atomic write: tmp + rename. Callers needing read-modify-write atomicity
	// hold `withBlockLock(filePath, ...)` around the broader critical section.
	const tmpPath = `${filePath}.block-api-${process.pid}.tmp`;
	try {
		fs.writeFileSync(tmpPath, JSON.stringify(toWrite, null, 2), "utf-8");
		fs.renameSync(tmpPath, filePath);
	} catch (err) {
		try {
			fs.unlinkSync(tmpPath);
		} catch {
			/* ignore cleanup failure */
		}
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(`Failed to write ${label}: ${msg}`);
	}
}

/**
 * Validated atomic append to an array within a `(filePath, schemaPath)` pair.
 * `arrayPath = null` means "the file IS the array" (top-level array shape,
 * e.g. monitor patterns / instructions); `arrayPath = string` means
 * "data[arrayPath] is the target array" (object-with-array-field shape, the
 * `.project/` block convention).
 *
 * `ctx` (FGAP-004): when provided AND the schema declares author fields on
 * the items reached by `arrayPath` (or, for the flat-array case, on the
 * array's `items.properties.*`), the appended item is stamped via
 * `stampItem` in create-mode before AJV validation. For the flat-array
 * case the array key passed to the per-array-key cache lookup is the
 * arbitrary token `__top__` — `collectArrayItemAuthorDecisions` only
 * traverses `properties.*` paths and never visits a top-level array
 * schema, so the lookup will always miss; flat-array stamping is
 * intentionally a no-op until a schema actually declares author fields
 * on a top-level array shape (no current consumer does so).
 */
export function appendToTypedFile(
	filePath: string,
	schemaPath: string | null,
	arrayPath: string | null,
	item: unknown,
	ctx?: DispatchContext,
	errorLabel?: string,
): void {
	const label = errorLabel ?? filePath;
	withBlockLock(filePath, () => {
		const data = readTypedFile(filePath, label);

		if (arrayPath === null) {
			// Flat top-level array shape: file content IS the array.
			if (!Array.isArray(data)) {
				throw new Error(`${label}: expected top-level array, got ${typeof data}`);
			}
			const itemToAppend =
				ctx && item && typeof item === "object" && !Array.isArray(item)
					? maybeStampItem(schemaPath, "__top__", item as Record<string, unknown>, ctx, "create")
					: item;
			const next = [...data, itemToAppend];
			// Validate the WHOLE array against schemaPath, then write.
			writeTypedFile(filePath, schemaPath, next, undefined, label);
			return;
		}

		// Object-with-array-field shape (the .project/ block convention).
		if (!data || typeof data !== "object" || Array.isArray(data)) {
			throw new Error(`${label}: expected object with array field '${arrayPath}'`);
		}
		const record = data as Record<string, unknown>;
		if (!(arrayPath in record)) {
			throw new Error(`${label} has no key '${arrayPath}'`);
		}
		if (!Array.isArray(record[arrayPath])) {
			throw new Error(`${label} key '${arrayPath}' is not an array`);
		}
		const itemToAppend =
			ctx && item && typeof item === "object" && !Array.isArray(item)
				? maybeStampItem(schemaPath, arrayPath, item as Record<string, unknown>, ctx, "create")
				: item;
		record[arrayPath] = [...(record[arrayPath] as unknown[]), itemToAppend];
		writeTypedFile(filePath, schemaPath, record, undefined, label);
	});
}

/**
 * Validate `data` against its schema (if one exists) and write atomically
 * to `.project/{blockName}.json`. Throws `ValidationError` on schema failure.
 * Files without a corresponding schema are written without validation.
 *
 * Thin wrapper over `writeTypedFile` — see that function for full semantics.
 * `ctx` (FGAP-004): whole-block writes are treated as create-mode envelope
 * stamping; callers wanting per-item attribution should prefer the
 * array-grained writers.
 */
export function writeBlock(cwd: string, blockName: string, data: unknown, ctx?: DispatchContext): void {
	const filePath = blockFilePath(cwd, blockName);
	const schemaPath = existingBlockSchemaPath(cwd, blockName);
	writeTypedFile(filePath, schemaPath, data, ctx, `block file '${blockName}.json'`);
}

/**
 * Read current file, push item onto data[arrayKey], validate whole file
 * against schema, write atomically. Throws if file doesn't exist, if
 * arrayKey is missing or not an array, or if validation fails.
 *
 * `ctx` (FGAP-004): when provided AND the schema declares author fields on
 * `properties.<arrayKey>.items.properties.*`, the appended item is stamped
 * via `stampItem` in create-mode before AJV validation. Schemas that don't
 * declare author fields fall through unstamped — guards against
 * `additionalProperties: false` AJV failures on blocks whose item shape
 * doesn't carry author markers yet.
 */
export function appendToBlock(
	cwd: string,
	blockName: string,
	arrayKey: string,
	item: unknown,
	ctx?: DispatchContext,
): void {
	withBlockLock(blockFilePath(cwd, blockName), () => {
		const data = readBlock(cwd, blockName);

		if (!data || typeof data !== "object") {
			throw new Error(`Block '${blockName}' is not an object`);
		}

		const record = data as Record<string, unknown>;
		if (!(arrayKey in record)) {
			throw new Error(`Block '${blockName}' has no key '${arrayKey}'`);
		}
		if (!Array.isArray(record[arrayKey])) {
			throw new Error(`Block '${blockName}' key '${arrayKey}' is not an array`);
		}

		// Optional ctx-stamping for object-shaped items (skipped silently for
		// scalar items even when the schema technically permits author fields —
		// stamping a string / number is meaningless).
		const schemaPath = existingBlockSchemaPath(cwd, blockName);
		const itemToAppend =
			ctx && item && typeof item === "object" && !Array.isArray(item)
				? maybeStampItem(schemaPath, arrayKey, item as Record<string, unknown>, ctx, "create")
				: item;

		record[arrayKey] = [...(record[arrayKey] as unknown[]), itemToAppend];
		writeBlock(cwd, blockName, record);
	});
}

/**
 * Find an item in data[arrayKey] by predicate, shallow-merge updates onto it,
 * validate whole file against schema, write atomically. Throws if no item
 * matches, if arrayKey is missing or not an array, or if validation fails.
 *
 * `ctx` (FGAP-004): when provided AND the schema declares author fields on
 * the array's items, the merged item is run through `stampItem` in
 * update-mode after the shallow merge — `created_by` / `created_at` are
 * preserved, `modified_by` / `modified_at` refresh.
 */
export function updateItemInBlock(
	cwd: string,
	blockName: string,
	arrayKey: string,
	predicate: (item: Record<string, unknown>) => boolean,
	updates: Record<string, unknown>,
	ctx?: DispatchContext,
): void {
	withBlockLock(blockFilePath(cwd, blockName), () => {
		const data = readBlock(cwd, blockName);

		if (!data || typeof data !== "object") {
			throw new Error(`Block '${blockName}' is not an object`);
		}

		const record = data as Record<string, unknown>;
		if (!(arrayKey in record)) {
			throw new Error(`Block '${blockName}' has no key '${arrayKey}'`);
		}
		if (!Array.isArray(record[arrayKey])) {
			throw new Error(`Block '${blockName}' key '${arrayKey}' is not an array`);
		}

		const arr = record[arrayKey] as Record<string, unknown>[];
		const idx = arr.findIndex(predicate);
		if (idx === -1) {
			throw new Error(`No matching item in block '${blockName}' key '${arrayKey}'`);
		}

		// Count total matches to warn if predicate is ambiguous
		let matchCount = 1;
		for (let i = idx + 1; i < arr.length; i++) {
			if (predicate(arr[i])) matchCount++;
		}
		if (matchCount > 1) {
			console.error(`[block-api] updateItemInBlock: ${matchCount} items matched predicate, only first updated`);
		}

		// Clone the matched item with updates applied — avoid mutating in-memory
		// before validation. If writeBlock fails, the original array is unmodified.
		const merged: Record<string, unknown> = { ...arr[idx], ...updates };
		const schemaPath = existingBlockSchemaPath(cwd, blockName);
		const updated = ctx ? maybeStampItem(schemaPath, arrayKey, merged, ctx, "update") : merged;
		const patched = [...arr];
		patched[idx] = updated;
		record[arrayKey] = patched;
		writeBlock(cwd, blockName, record);
	});
}

/**
 * Atomically find-or-append a single item in `data[arrayKey]` keyed by
 * `idField`. Acquires the block lock; reads the array; locates the first
 * existing item where `existingItem[idField] === item[idField]`; if found
 * the item at that index is REPLACED (not shallow-merged) by the supplied
 * `item` and stamping runs in `"update"` mode; otherwise `item` is pushed
 * onto the array and stamping runs in `"create"` mode. AJV validates the
 * whole file against the schema after mutation, before write.
 *
 * Composing existing `updateItemInBlock` + `appendToBlock` from a caller
 * would release the block lock between the read-check and the mutating
 * write, which is race-prone for concurrent monitor/LLM writes against the
 * same block — this primitive holds the lock for both halves of the
 * find-or-append decision in one atomic critical section.
 *
 * Throws when `item[idField]` is missing or empty (defensive — surfaces a
 * malformed call site early instead of silently appending a duplicate
 * that would never match on a subsequent upsert). Throws on the usual
 * block / arrayKey / not-array invariants and on AJV validation failure.
 *
 * Replacement semantics (vs. updateItemInBlock's shallow-merge): upsert is
 * the call surface for monitor write-actions where the template produces
 * the FULL item shape per classification — there is no prior partial state
 * to merge against. Callers that need merge-on-update should continue to
 * use `updateItemInBlock`.
 */
export function upsertItemInBlock(
	cwd: string,
	blockName: string,
	arrayKey: string,
	item: Record<string, unknown>,
	idField: string,
	ctx?: DispatchContext,
): { mode: "appended" | "updated" } {
	const idValue = item[idField];
	if (idValue === undefined || idValue === null || idValue === "") {
		throw new Error(
			`upsertItemInBlock: item is missing required idField '${idField}' (got: ${JSON.stringify(idValue)})`,
		);
	}
	return withBlockLock(blockFilePath(cwd, blockName), () => {
		const data = readBlock(cwd, blockName);
		if (!data || typeof data !== "object") {
			throw new Error(`Block '${blockName}' is not an object`);
		}
		const record = data as Record<string, unknown>;
		if (!(arrayKey in record)) {
			throw new Error(`Block '${blockName}' has no key '${arrayKey}'`);
		}
		if (!Array.isArray(record[arrayKey])) {
			throw new Error(`Block '${blockName}' key '${arrayKey}' is not an array`);
		}
		const arr = record[arrayKey] as Record<string, unknown>[];
		const idx = arr.findIndex((existing) => existing && existing[idField] === idValue);
		const mode: "appended" | "updated" = idx === -1 ? "appended" : "updated";
		const stampMode: "create" | "update" = mode === "appended" ? "create" : "update";
		const schemaPath = existingBlockSchemaPath(cwd, blockName);

		// FGAP-018 fix: on update branch, pre-merge create-time attestation fields
		// from the existing on-disk item onto the supplied item if absent. stampItem
		// in update-mode does not touch created_*; this carries them forward across
		// replacement so attestation integrity (FGAP-004) holds.
		let itemForStamp = item;
		if (idx !== -1 && schemaPath) {
			const declared = declaredAuthorFieldsForArray(schemaPath, arrayKey);
			const existing = arr[idx];
			const carriedFields: Record<string, unknown> = {};
			for (const field of ["created_by", "created_at"]) {
				if (declared.has(field) && !(field in item) && existing && field in existing) {
					carriedFields[field] = existing[field];
				}
			}
			if (Object.keys(carriedFields).length > 0) {
				itemForStamp = { ...carriedFields, ...item };
			}
		}

		const stamped = ctx ? maybeStampItem(schemaPath, arrayKey, itemForStamp, ctx, stampMode) : itemForStamp;
		const patched = [...arr];
		if (idx === -1) {
			patched.push(stamped);
		} else {
			patched[idx] = stamped;
		}
		record[arrayKey] = patched;
		writeBlock(cwd, blockName, record);
		return { mode };
	});
}

/**
 * Atomically append an item to a nested array inside a parent-array item.
 *
 * Read current file, locate parent-array item by predicate, push `item` onto
 * `data[parentArrayKey][matchedIndex][nestedArrayKey]`, validate whole file
 * against schema, write atomically. Throws if file doesn't exist; if
 * parentArrayKey is missing or not an array; if no parent item matches the
 * predicate; if the matched parent item has no `nestedArrayKey` or it is not
 * an array; or if validation fails. Mirrors updateItemInBlock's structure:
 * file lock, predicate findIndex, multi-match warning, clone-before-write so
 * the original array remains unmodified if writeBlock throws.
 */
export function appendToNestedArray(
	cwd: string,
	blockName: string,
	parentArrayKey: string,
	predicate: (item: Record<string, unknown>) => boolean,
	nestedArrayKey: string,
	item: unknown,
	ctx?: DispatchContext,
): void {
	withBlockLock(blockFilePath(cwd, blockName), () => {
		const data = readBlock(cwd, blockName);
		if (!data || typeof data !== "object") {
			throw new Error(`Block '${blockName}' is not an object`);
		}
		const record = data as Record<string, unknown>;
		if (!(parentArrayKey in record)) {
			throw new Error(`Block '${blockName}' has no key '${parentArrayKey}'`);
		}
		if (!Array.isArray(record[parentArrayKey])) {
			throw new Error(`Block '${blockName}' key '${parentArrayKey}' is not an array`);
		}
		const arr = record[parentArrayKey] as Record<string, unknown>[];
		const idx = arr.findIndex(predicate);
		if (idx === -1) {
			throw new Error(`No matching item in block '${blockName}' key '${parentArrayKey}'`);
		}
		let matchCount = 1;
		for (let i = idx + 1; i < arr.length; i++) {
			if (predicate(arr[i])) matchCount++;
		}
		if (matchCount > 1) {
			console.error(`[block-api] appendToNestedArray: ${matchCount} items matched predicate, only first updated`);
		}
		const parent = arr[idx];
		if (!(nestedArrayKey in parent)) {
			throw new Error(`Matched item in '${blockName}.${parentArrayKey}' has no nested key '${nestedArrayKey}'`);
		}
		if (!Array.isArray(parent[nestedArrayKey])) {
			throw new Error(
				`Matched item in '${blockName}.${parentArrayKey}' nested key '${nestedArrayKey}' is not an array`,
			);
		}
		// Clone parent (and replace its nested array) before validation to keep
		// the original array unmodified if writeBlock fails — mirrors
		// updateItemInBlock's clone-then-write pattern.
		const schemaPath = existingBlockSchemaPath(cwd, blockName);
		const itemToAppend =
			ctx && item && typeof item === "object" && !Array.isArray(item)
				? maybeStampItem(schemaPath, nestedArrayKey, item as Record<string, unknown>, ctx, "create")
				: item;
		const updatedParent = {
			...parent,
			[nestedArrayKey]: [...(parent[nestedArrayKey] as unknown[]), itemToAppend],
		};
		const patched = [...arr];
		patched[idx] = updatedParent;
		record[parentArrayKey] = patched;
		writeBlock(cwd, blockName, record);
	});
}

/**
 * Atomically update a single item inside a nested array on a parent-array
 * item: locate parent by parentPredicate, locate nested by nestedPredicate,
 * shallow-merge `updates` onto the matched nested item, validate the whole
 * file against schema, write atomically. Throws on missing block / missing
 * parent key / parent key not array / no parent match / matched parent
 * missing nestedKey / nested key not array / no nested match / validation
 * failure. Multi-match warnings emit at both parent and nested levels via
 * console.error (mirrors the established appendToNestedArray /
 * updateItemInBlock convention). Clone-then-write keeps the original arrays
 * unmodified if writeBlock throws.
 */
export function updateNestedArrayItem(
	cwd: string,
	blockName: string,
	parentArrayKey: string,
	parentPredicate: (item: Record<string, unknown>) => boolean,
	nestedArrayKey: string,
	nestedPredicate: (item: Record<string, unknown>) => boolean,
	updates: Record<string, unknown>,
	ctx?: DispatchContext,
): void {
	withBlockLock(blockFilePath(cwd, blockName), () => {
		const data = readBlock(cwd, blockName);
		if (!data || typeof data !== "object") {
			throw new Error(`Block '${blockName}' is not an object`);
		}
		const record = data as Record<string, unknown>;
		if (!(parentArrayKey in record)) {
			throw new Error(`Block '${blockName}' has no key '${parentArrayKey}'`);
		}
		if (!Array.isArray(record[parentArrayKey])) {
			throw new Error(`Block '${blockName}' key '${parentArrayKey}' is not an array`);
		}
		const arr = record[parentArrayKey] as Record<string, unknown>[];
		const parentIdx = arr.findIndex(parentPredicate);
		if (parentIdx === -1) {
			throw new Error(`No matching item in block '${blockName}' key '${parentArrayKey}'`);
		}
		let parentMatchCount = 1;
		for (let i = parentIdx + 1; i < arr.length; i++) {
			if (parentPredicate(arr[i])) parentMatchCount++;
		}
		if (parentMatchCount > 1) {
			console.error(
				`[block-api] updateNestedArrayItem: ${parentMatchCount} parent items matched predicate, only first updated`,
			);
		}
		const parent = arr[parentIdx];
		if (!(nestedArrayKey in parent)) {
			throw new Error(`Matched item in '${blockName}.${parentArrayKey}' has no nested key '${nestedArrayKey}'`);
		}
		if (!Array.isArray(parent[nestedArrayKey])) {
			throw new Error(
				`Matched item in '${blockName}.${parentArrayKey}' nested key '${nestedArrayKey}' is not an array`,
			);
		}
		const nestedArr = parent[nestedArrayKey] as Record<string, unknown>[];
		const nestedIdx = nestedArr.findIndex(nestedPredicate);
		if (nestedIdx === -1) {
			throw new Error(
				`No matching nested item in block '${blockName}.${parentArrayKey}[${parentIdx}].${nestedArrayKey}'`,
			);
		}
		let nestedMatchCount = 1;
		for (let i = nestedIdx + 1; i < nestedArr.length; i++) {
			if (nestedPredicate(nestedArr[i])) nestedMatchCount++;
		}
		if (nestedMatchCount > 1) {
			console.error(
				`[block-api] updateNestedArrayItem: ${nestedMatchCount} nested items matched predicate, only first updated`,
			);
		}
		// Clone nested item with updates applied; clone nested array; clone parent
		// with replaced nested array; clone parent array with replaced parent.
		// Original arrays remain untouched until writeBlock succeeds.
		const mergedNested: Record<string, unknown> = { ...nestedArr[nestedIdx], ...updates };
		const schemaPath = existingBlockSchemaPath(cwd, blockName);
		const updatedNested = ctx ? maybeStampItem(schemaPath, nestedArrayKey, mergedNested, ctx, "update") : mergedNested;
		const patchedNested = [...nestedArr];
		patchedNested[nestedIdx] = updatedNested;
		const updatedParent = { ...parent, [nestedArrayKey]: patchedNested };
		const patchedParents = [...arr];
		patchedParents[parentIdx] = updatedParent;
		record[parentArrayKey] = patchedParents;
		writeBlock(cwd, blockName, record);
	});
}

/**
 * Atomically remove all items matching `predicate` from a top-level array
 * inside `data[arrayKey]`, validate the whole file against schema, write
 * atomically. Returns `{ removed: <count> }`. Throws on missing block /
 * missing key / key not array / validation failure (e.g., schema requires
 * minItems and removal violates it). Returns `{ removed: 0 }` on no match
 * without throwing — removal of a non-existent item is treated as an
 * idempotent successful no-op, distinct from update which throws on miss.
 */
export function removeFromBlock(
	cwd: string,
	blockName: string,
	arrayKey: string,
	predicate: (item: Record<string, unknown>) => boolean,
	ctx?: DispatchContext,
): { removed: number } {
	// Removal does not produce a new item to stamp; the parameter is accepted
	// for signature parity with the other write functions per FGAP-004 so a
	// caller threading `ctx` through the surface uniformly need not branch on
	// "is this a remove?". Future work (e.g. an audit-log block written by
	// removeFromBlock alongside the deletion) can read the writer identity
	// off this parameter without further plumbing.
	void ctx;
	return withBlockLock(blockFilePath(cwd, blockName), () => {
		const data = readBlock(cwd, blockName);
		if (!data || typeof data !== "object") {
			throw new Error(`Block '${blockName}' is not an object`);
		}
		const record = data as Record<string, unknown>;
		if (!(arrayKey in record)) {
			throw new Error(`Block '${blockName}' has no key '${arrayKey}'`);
		}
		if (!Array.isArray(record[arrayKey])) {
			throw new Error(`Block '${blockName}' key '${arrayKey}' is not an array`);
		}
		const arr = record[arrayKey] as Record<string, unknown>[];
		const remaining = arr.filter((item) => !predicate(item));
		const removed = arr.length - remaining.length;
		if (removed === 0) {
			// Idempotent — no match means no work, no write, no throw.
			return { removed: 0 };
		}
		if (removed > 1) {
			console.error(`[block-api] removeFromBlock: ${removed} items matched predicate, all removed`);
		}
		record[arrayKey] = remaining;
		writeBlock(cwd, blockName, record);
		return { removed };
	});
}

/**
 * Atomically remove all items matching `nestedPredicate` from a nested array
 * inside the parent-array item matched by `parentPredicate`. Validates and
 * writes atomically. Returns `{ removed: <count> }`. Throws on missing block
 * / missing parent key / parent key not array / no parent match / matched
 * parent missing nestedKey / nested key not array / validation failure.
 * Returns `{ removed: 0 }` on no nested match without throwing (idempotent,
 * mirrors removeFromBlock semantics). Multi-match warning at parent level
 * via console.error.
 */
export function removeFromNestedArray(
	cwd: string,
	blockName: string,
	parentArrayKey: string,
	parentPredicate: (item: Record<string, unknown>) => boolean,
	nestedArrayKey: string,
	nestedPredicate: (item: Record<string, unknown>) => boolean,
	ctx?: DispatchContext,
): { removed: number } {
	// See note in removeFromBlock: ctx is accepted for surface parity; no
	// items remain to stamp. Reserving the slot keeps future audit-log
	// integrations a single-line change.
	void ctx;
	return withBlockLock(blockFilePath(cwd, blockName), () => {
		const data = readBlock(cwd, blockName);
		if (!data || typeof data !== "object") {
			throw new Error(`Block '${blockName}' is not an object`);
		}
		const record = data as Record<string, unknown>;
		if (!(parentArrayKey in record)) {
			throw new Error(`Block '${blockName}' has no key '${parentArrayKey}'`);
		}
		if (!Array.isArray(record[parentArrayKey])) {
			throw new Error(`Block '${blockName}' key '${parentArrayKey}' is not an array`);
		}
		const arr = record[parentArrayKey] as Record<string, unknown>[];
		const parentIdx = arr.findIndex(parentPredicate);
		if (parentIdx === -1) {
			throw new Error(`No matching item in block '${blockName}' key '${parentArrayKey}'`);
		}
		let parentMatchCount = 1;
		for (let i = parentIdx + 1; i < arr.length; i++) {
			if (parentPredicate(arr[i])) parentMatchCount++;
		}
		if (parentMatchCount > 1) {
			console.error(
				`[block-api] removeFromNestedArray: ${parentMatchCount} parent items matched predicate, only first targeted`,
			);
		}
		const parent = arr[parentIdx];
		if (!(nestedArrayKey in parent)) {
			throw new Error(`Matched item in '${blockName}.${parentArrayKey}' has no nested key '${nestedArrayKey}'`);
		}
		if (!Array.isArray(parent[nestedArrayKey])) {
			throw new Error(
				`Matched item in '${blockName}.${parentArrayKey}' nested key '${nestedArrayKey}' is not an array`,
			);
		}
		const nestedArr = parent[nestedArrayKey] as Record<string, unknown>[];
		const nestedRemaining = nestedArr.filter((item) => !nestedPredicate(item));
		const removed = nestedArr.length - nestedRemaining.length;
		if (removed === 0) {
			return { removed: 0 };
		}
		if (removed > 1) {
			console.error(`[block-api] removeFromNestedArray: ${removed} nested items matched predicate, all removed`);
		}
		const updatedParent = { ...parent, [nestedArrayKey]: nestedRemaining };
		const patched = [...arr];
		patched[parentIdx] = updatedParent;
		record[parentArrayKey] = patched;
		writeBlock(cwd, blockName, record);
		return { removed };
	});
}

/**
 * Read all `.json` files in a `.project/<subdir>/` directory and return the
 * parsed contents as a sorted array. Sort order is filesystem-name ascending
 * (matches Array.sort default on the basename strings). Missing directories
 * return `[]` — on-demand `.project/` subdirectories are valid and represent
 * "no items yet". Throws on filesystem read failure of a present file or on
 * invalid JSON, with file-relative path in the error message. Behavior must
 * match the previous private `executeReadDir` in pi-workflows step-block.ts
 * byte-identically; both pi-workflows and the `read-block-dir` registered
 * tool consume this single export.
 */
export function readBlockDir(cwd: string, subdir: string): unknown[] {
	const dirPath = path.join(cwd, PROJECT_DIR, subdir);

	let entries: string[];
	try {
		entries = fs
			.readdirSync(dirPath)
			.filter((f) => f.endsWith(".json"))
			.sort();
	} catch {
		// Missing directory = "no items yet" for on-demand .project/ subdirectories
		return [];
	}

	const results: unknown[] = [];
	for (const filename of entries) {
		const filePath = path.join(dirPath, filename);
		let content: string;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			throw new Error(`Cannot read file: ${PROJECT_DIR}/${subdir}/${filename}`);
		}
		try {
			results.push(JSON.parse(content));
		} catch {
			throw new Error(`Invalid JSON in: ${PROJECT_DIR}/${subdir}/${filename}`);
		}
	}
	return results;
}
