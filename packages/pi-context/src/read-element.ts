/**
 * read-element — ONE pure, DRY element-read primitive every JSON read surface
 * routes through (FGAP-103). No I/O: it operates only on already-loaded JS
 * values (callers do the file/substrate reads, then hand the value in). This
 * keeps the module unit-testable in isolation and mirrors the orientation.ts
 * precedent (pure transform, no substrate coupling).
 *
 * Two responsibilities:
 *
 *   serializeForRead(value, opts?) → ReadEnvelope
 *     Generalizes the ~13 duplicated `JSON.stringify(...) + truncateHead(...) +
 *     "[Truncated: N bytes…]"` blocks scattered across the tool handlers into
 *     a single serialize+cap path. When the value is a collection it pages by
 *     offset/limit and reports total/hasMore; the prose "[Truncated …]" note
 *     is replaced by a STRUCTURED, machine-parseable + human-readable footer
 *     (prefix `[read-element:`) carrying the same signal (FGAP-089).
 *
 *   addressInto(value, addr) → { found, value, resolved }
 *     Element addressing — fetch ONE registry / property / item / path out of
 *     an already-loaded value rather than read-all-or-nothing. Hand-rolled
 *     (no json-path/key getter exists in deps or repo). Never throws on a
 *     miss; returns { found:false, value:undefined, resolved } so callers can
 *     report a clean "not found" rather than crash.
 *
 * `discoverArrayKey` lives here (the lowest pure layer) and is re-imported by
 * context-sdk.ts so there is exactly ONE copy of the single-top-level-array
 * heuristic shared across filterBlockItems / readBlockPage / serializeForRead.
 */
import { truncateHead } from "@earendil-works/pi-coding-agent";

/**
 * Discover the single top-level array key in a block/object payload. Returns
 * null when there are zero array properties; throws when ambiguous (two or
 * more array properties), since callers cannot proceed without an explicit
 * disambiguation policy. The single-array-key assumption is shared across
 * .project/ block writes (inject-context-items.ts) and the block read surface
 * (filterBlockItems / readBlockPage in context-sdk.ts, which imports this).
 */
export function discoverArrayKey(data: Record<string, unknown>): string | null {
	const arrayKeys = Object.entries(data).filter(([, v]) => Array.isArray(v));
	if (arrayKeys.length === 0) return null;
	if (arrayKeys.length === 1) return arrayKeys[0][0];
	throw new Error(
		`discoverArrayKey: payload has multiple top-level array properties (${arrayKeys
			.map(([k]) => k)
			.join(", ")}); single-array assumption violated`,
	);
}

/**
 * The readable envelope every read surface emits. `content` is the text for
 * the AgentToolResult (JSON body plus a structured footer when paged and/or
 * truncated). The structured fields (`total`/`hasMore`/`truncated`/
 * `totalBytes`) generalize readBlockPage's `{items,total,hasMore}` and add the
 * FGAP-089 truncation signal so consumers (or the agent) can react
 * programmatically rather than parse prose.
 */
export interface ReadEnvelope {
	/** Readable text for the tool result: JSON body + optional structured footer. */
	content: string;
	/** Full element count when `value` was treated as a collection (paged); absent for whole-object reads. */
	total?: number;
	/** Whether more elements exist past this page; absent for whole-object reads. */
	hasMore?: boolean;
	/** Whether truncateHead capped the serialized JSON (50KB / line cap). */
	truncated: boolean;
	/** Total bytes of the un-capped serialized JSON. */
	totalBytes: number;
}

/** Stable, greppable footer prefix — keep in sync with consumers/tests. */
export const READ_ELEMENT_FOOTER_PREFIX = "[read-element:";

export interface SerializeForReadOptions {
	/** Force a specific array property to page over (else auto-discovered). */
	itemsKey?: string;
	/** Page start index (default 0). Only meaningful for collections. */
	offset?: number;
	/** Page size (default 50). Only meaningful for collections. */
	limit?: number;
	/** Optional human label included in the footer (e.g. the addressed thing). */
	label?: string;
}

const DEFAULT_LIMIT = 50;

/**
 * Resolve the array to page over: the value itself if it is an array, else the
 * `itemsKey` property if given and array-valued, else the single discoverable
 * top-level array. Returns { collection: false } for whole-object values.
 * `discoverArrayKey` may throw on ambiguity; serializeForRead lets that
 * propagate (the caller's value is malformed for paging).
 */
function resolveCollection(
	value: unknown,
	itemsKey?: string,
): { collection: true; arr: unknown[] } | { collection: false } {
	if (Array.isArray(value)) return { collection: true, arr: value };
	if (value !== null && typeof value === "object") {
		const obj = value as Record<string, unknown>;
		if (itemsKey !== undefined) {
			const candidate = obj[itemsKey];
			if (Array.isArray(candidate)) return { collection: true, arr: candidate };
			return { collection: false };
		}
		const key = discoverArrayKey(obj);
		if (key !== null) return { collection: true, arr: obj[key] as unknown[] };
	}
	return { collection: false };
}

/**
 * Serialize an already-loaded value for a read tool result. Collections are
 * paged (offset/limit) and report total/hasMore; non-collections serialize
 * whole. JSON text is capped via truncateHead. A structured footer is appended
 * ONLY when paged and/or truncated (prefix `[read-element:`), never as a
 * prose-only note; when neither paged nor truncated there is no footer.
 */
export function serializeForRead(value: unknown, opts: SerializeForReadOptions = {}): ReadEnvelope {
	const offset = opts.offset ?? 0;
	const limit = opts.limit ?? DEFAULT_LIMIT;
	const resolved = resolveCollection(value, opts.itemsKey);

	let serialized: unknown;
	let total: number | undefined;
	let hasMore: boolean | undefined;
	let paged = false;

	if (resolved.collection) {
		total = resolved.arr.length;
		const slice = resolved.arr.slice(offset, offset + limit);
		hasMore = offset + limit < total;
		serialized = slice;
		// Page-footer only when the page does not show the whole collection.
		paged = offset > 0 || hasMore;
	} else {
		serialized = value;
	}

	const jsonStr = JSON.stringify(serialized, null, 2);
	const cap = truncateHead(jsonStr);

	const footers: string[] = [];
	if (paged && total !== undefined) {
		// shown range is 1-based inclusive over the served slice
		const shownCount = Array.isArray(serialized) ? serialized.length : 0;
		const from = total === 0 ? 0 : offset + 1;
		const to = offset + shownCount;
		const labelSuffix = opts.label ? ` · ${opts.label}` : "";
		footers.push(
			`\n\n${READ_ELEMENT_FOOTER_PREFIX} showing ${from}-${to} of ${total} · hasMore=${hasMore}${labelSuffix} · narrow with an address]`,
		);
	}
	if (cap.truncated) {
		footers.push(`\n\n${READ_ELEMENT_FOOTER_PREFIX} truncated at ${cap.totalBytes} bytes · address a sub-element]`);
	}

	return {
		content: cap.content + footers.join(""),
		total,
		hasMore,
		truncated: cap.truncated,
		totalBytes: cap.totalBytes,
	};
}

export interface AddressSpec {
	/** Find an element by `.id` (or `.canonical_id`) inside an array / single-array object. */
	id?: string;
	/** Object-property lookup (also matches a config-registry array entry by canonical_id). */
	key?: string;
	/** Dotted/bracket path walk, e.g. `a.b.c` or `a[0].b`. */
	path?: string;
}

export interface AddressResult {
	found: boolean;
	value: unknown;
	/** Human string describing what was addressed (for tool result / footer label). */
	resolved: string;
}

function asArrayOrSingleArray(value: unknown): unknown[] | null {
	if (Array.isArray(value)) return value;
	if (value !== null && typeof value === "object") {
		const key = discoverArrayKey(value as Record<string, unknown>);
		if (key !== null) return (value as Record<string, unknown>)[key] as unknown[];
	}
	return null;
}

/** Find an array element whose `.id` or `.canonical_id` equals `id`. */
function findById(arr: unknown[], id: string): unknown | undefined {
	return arr.find((el) => {
		if (el === null || typeof el !== "object") return false;
		const o = el as Record<string, unknown>;
		return o.id === id || o.canonical_id === id;
	});
}

/**
 * Parse a dotted/bracket path into segments. `a.b[0].c` →
 * ["a","b","0","c"]. Array indices arrive as numeric-string segments.
 */
function parsePath(path: string): string[] {
	const segments: string[] = [];
	for (const dotPart of path.split(".")) {
		if (dotPart === "") continue;
		// split out bracket indices: `b[0][1]` → "b", "0", "1"
		const bracketRe = /\[([^\]]*)\]/g;
		const base = dotPart.replace(bracketRe, "");
		if (base !== "") segments.push(base);
		for (const m of dotPart.matchAll(bracketRe)) {
			segments.push(m[1]);
		}
	}
	return segments;
}

/**
 * Element addressing over an already-loaded value. Mutually-exclusive address
 * forms (id | key | path); the first present form wins. Never throws on a
 * miss — returns { found:false, value:undefined, resolved } so callers report
 * a clean "not found".
 */
export function addressInto(value: unknown, addr: AddressSpec): AddressResult {
	if (addr.id !== undefined) {
		const arr = asArrayOrSingleArray(value);
		if (arr === null) {
			return { found: false, value: undefined, resolved: `id=${addr.id} (value has no addressable array)` };
		}
		const hit = findById(arr, addr.id);
		return hit === undefined
			? { found: false, value: undefined, resolved: `id=${addr.id} (not found)` }
			: { found: true, value: hit, resolved: `id=${addr.id}` };
	}

	if (addr.key !== undefined) {
		if (value !== null && typeof value === "object" && !Array.isArray(value)) {
			const o = value as Record<string, unknown>;
			if (addr.key in o) return { found: true, value: o[addr.key], resolved: `key=${addr.key}` };
		}
		// Config-registry-style array: match an entry by canonical_id.
		const arr = asArrayOrSingleArray(value);
		if (arr !== null) {
			const hit = arr.find(
				(el) => el !== null && typeof el === "object" && (el as Record<string, unknown>).canonical_id === addr.key,
			);
			if (hit !== undefined) return { found: true, value: hit, resolved: `key=${addr.key} (by canonical_id)` };
		}
		return { found: false, value: undefined, resolved: `key=${addr.key} (not found)` };
	}

	if (addr.path !== undefined) {
		const segments = parsePath(addr.path);
		let cursor: unknown = value;
		const traversed: string[] = [];
		for (const seg of segments) {
			const at = traversed.join(".") || "(root)";
			if (cursor === null || cursor === undefined) {
				return { found: false, value: undefined, resolved: `path=${addr.path} (stopped at ${at})` };
			}
			if (Array.isArray(cursor)) {
				const idx = Number.parseInt(seg, 10);
				if (Number.isNaN(idx) || idx < 0 || idx >= cursor.length) {
					return { found: false, value: undefined, resolved: `path=${addr.path} (no index ${seg} at ${at})` };
				}
				cursor = cursor[idx];
			} else if (typeof cursor === "object") {
				const o = cursor as Record<string, unknown>;
				if (!(seg in o)) {
					return { found: false, value: undefined, resolved: `path=${addr.path} (no key ${seg} at ${at})` };
				}
				cursor = o[seg];
			} else {
				return { found: false, value: undefined, resolved: `path=${addr.path} (scalar at ${at})` };
			}
			traversed.push(seg);
		}
		return { found: true, value: cursor, resolved: `path=${addr.path}` };
	}

	return { found: false, value: undefined, resolved: "(no address provided)" };
}
