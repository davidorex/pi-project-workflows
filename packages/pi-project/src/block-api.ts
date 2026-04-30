/**
 * Centralized read/write API for .project/*.json project block files.
 * Validates data against schemas before writing; uses atomic writes (tmp + rename).
 * Read-modify-write operations (append, update) use file-level locking via proper-lockfile
 * to prevent data loss from concurrent workflow steps targeting the same block.
 *
 * Reads resolve via two-tier discovery: project tier (`<projectRoot>/.project/`)
 * first, bundled tier (`<package>/defaults/blocks/`) as fallback. Schemas resolve
 * from the bundled tier only — they are contract definitions, not user data.
 * Writes always land in the project tier; first writes lazy-materialize the
 * bundled scaffold. Mirrors the post-v0.14.6 monitor loader pattern in
 * pi-behavior-monitors.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import _lockfile from "proper-lockfile";
import { PROJECT_DIR } from "./project-dir.js";
import { validateFromFile } from "./schema-validator.js";

// Node16 module resolution + CJS interop: default import may be wrapped
const lockfile = (_lockfile as any).default ?? _lockfile;

const EXTENSION_DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * Package root reachable from both runtime (compiled `dist/block-api.js`) and
 * test mode (tsx running `src/block-api.ts`). The basename heuristic accepts
 * both `dist` and `src` because pi-project's source entry lives in `src/`,
 * unlike pi-behavior-monitors whose entry is at the package root.
 */
const PACKAGE_ROOT =
	path.basename(EXTENSION_DIR) === "dist" || path.basename(EXTENSION_DIR) === "src"
		? path.dirname(EXTENSION_DIR)
		: EXTENSION_DIR;

export const DEFAULTS_DIR = path.join(PACKAGE_ROOT, "defaults");
export const DEFAULT_BLOCKS_DIR = path.join(DEFAULTS_DIR, "blocks");
export const DEFAULT_SCHEMAS_DIR = path.join(DEFAULTS_DIR, "schemas");

/**
 * Walk up from `cwd` looking for an ancestor with `.project/`, stopping at the
 * first `.git` boundary so resolution never escapes into a parent repo.
 * Returns the absolute project-root directory or `null` when no `.project/`
 * is found below the boundary. Mirrors `findProjectMonitorsDir` in
 * pi-behavior-monitors.
 */
function findProjectDir(cwd: string): string | null {
	let current = cwd;
	while (true) {
		if (isDir(path.join(current, PROJECT_DIR))) return current;
		if (isDir(path.join(current, ".git"))) return null;
		const parent = path.dirname(current);
		if (parent === current) return null;
		current = parent;
	}
}

function isDir(p: string): boolean {
	try {
		return fs.statSync(p).isDirectory();
	} catch {
		return false;
	}
}

function isFile(p: string): boolean {
	try {
		return fs.statSync(p).isFile();
	} catch {
		return false;
	}
}

/**
 * Resolve where a block lives. Returns the project-tier path if a tier-1 file
 * exists at or above `cwd` (within the .git boundary); else returns the
 * bundled-tier path. The result is the path the caller should read from.
 */
function blockFilePath(cwd: string, blockName: string): string {
	const projectRoot = findProjectDir(cwd);
	if (projectRoot) {
		const tier1 = path.join(projectRoot, PROJECT_DIR, `${blockName}.json`);
		if (isFile(tier1)) return tier1;
	}
	return path.join(DEFAULT_BLOCKS_DIR, `${blockName}.json`);
}

/**
 * Tier-1 path for writes: the `.project/<name>.json` location under the
 * resolved project root, falling back to `<cwd>/.project/<name>.json` when no
 * ancestor `.project/` exists yet (first write in a fresh project creates the
 * directory at `cwd`).
 */
function blockTier1Path(cwd: string, blockName: string): string {
	const projectRoot = findProjectDir(cwd) ?? cwd;
	return path.join(projectRoot, PROJECT_DIR, `${blockName}.json`);
}

/**
 * Schemas resolve from the bundled tier only. The duplicated `.project/schemas/`
 * directory that prior versions copied via `initProject` is vestigial after
 * this migration; readers ignore it. Schema upgrades in the package propagate
 * automatically because no per-project copy intervenes.
 */
function blockSchemaPath(blockName: string): string {
	return path.join(DEFAULT_SCHEMAS_DIR, `${blockName}.schema.json`);
}

/**
 * Acquire a file-level lock on the tier-1 path, run fn(), release in finally.
 * The lock target may not exist yet (first write to a never-materialized
 * block); `realpath: false` lets proper-lockfile lock the path-as-string
 * without resolving it. The parent directory is created eagerly so the
 * adjacent `.lock` placeholder has somewhere to live. This closes the
 * concurrent-first-append race that the prior file-existence guard left open.
 */
function withBlockLock<T>(filePath: string, fn: () => T): T {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	lockfile.lockSync(filePath, { stale: 10000, realpath: false });
	try {
		return fn();
	} finally {
		lockfile.unlockSync(filePath, { realpath: false });
	}
}

/**
 * Read and parse a block file. Resolves tier-1 (`.project/{name}.json`) first
 * and falls through to tier-2 (bundled `defaults/blocks/{name}.json`). Throws
 * if neither tier has the block, naming both paths in the error.
 *
 * Optional filter: when provided, returns a shallow copy of the block with
 * only matching items in the specified array key. Non-array or missing keys
 * return the block unchanged. The filter is applied after parsing.
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
		const tier1 = blockTier1Path(cwd, blockName);
		const tier2 = path.join(DEFAULT_BLOCKS_DIR, `${blockName}.json`);
		throw new Error(`Block file not found: tried ${tier1} and ${tier2}`);
	}

	let data: unknown;
	try {
		data = JSON.parse(content);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(`Invalid JSON in block file: ${filePath}: ${msg}`);
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
 * Validate data against its schema (if one exists in bundled tier) and write
 * atomically to the tier-1 location `<projectRoot>/.project/{name}.json`.
 * Writes never touch the bundled tier. Throws ValidationError on schema
 * failure. Files without a corresponding bundled schema are written without
 * validation.
 */
export function writeBlock(cwd: string, blockName: string, data: unknown): void {
	const filePath = blockTier1Path(cwd, blockName);
	const schemaFile = blockSchemaPath(blockName);

	// Validate before write (if bundled schema exists)
	if (fs.existsSync(schemaFile)) {
		validateFromFile(schemaFile, data, `block file '${blockName}.json'`);
	}

	// Ensure tier-1 directory exists
	fs.mkdirSync(path.dirname(filePath), { recursive: true });

	// Atomic write: tmp + rename
	const tmpPath = `${filePath}.block-api-${process.pid}.tmp`;
	try {
		fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
		fs.renameSync(tmpPath, filePath);
	} catch (err) {
		// Best-effort cleanup of partial tmp file
		try {
			fs.unlinkSync(tmpPath);
		} catch {
			/* ignore cleanup failure */
		}
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(`Failed to write block file ${filePath}: ${msg}`);
	}
}

/**
 * Read current block (resolves tier-1 or tier-2 via fall-through), append item
 * onto data[arrayKey], validate against schema, write atomically to tier-1.
 * On first append to a never-materialized block, the bundled scaffold is
 * read from tier-2 and the resulting tier-1 file preserves all sibling
 * fields (e.g. `conformance-reference.json`'s `name`/`scope` siblings of
 * `principles`). Throws if neither tier has the block, if arrayKey is
 * missing or not an array, or if validation fails.
 */
export function appendToBlock(cwd: string, blockName: string, arrayKey: string, item: unknown): void {
	withBlockLock(blockTier1Path(cwd, blockName), () => {
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

		record[arrayKey] = [...(record[arrayKey] as unknown[]), item];
		writeBlock(cwd, blockName, record);
	});
}

/**
 * Find an item in data[arrayKey] by predicate, shallow-merge updates onto it,
 * validate whole file against schema, write atomically to tier-1. Lazy
 * materialization applies on first update to a never-materialized block.
 * Throws if no item matches, if arrayKey is missing or not an array, or
 * if validation fails.
 */
export function updateItemInBlock(
	cwd: string,
	blockName: string,
	arrayKey: string,
	predicate: (item: Record<string, unknown>) => boolean,
	updates: Record<string, unknown>,
): void {
	withBlockLock(blockTier1Path(cwd, blockName), () => {
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
		const updated = { ...arr[idx], ...updates };
		const patched = [...arr];
		patched[idx] = updated;
		record[arrayKey] = patched;
		writeBlock(cwd, blockName, record);
	});
}
