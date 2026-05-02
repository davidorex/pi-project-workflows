/**
 * Centralized read/write API for .project/*.json project block files.
 * Validates data against schemas before writing; uses atomic writes (tmp + rename).
 * Read-modify-write operations (append, update) use file-level locking via proper-lockfile
 * to prevent data loss from concurrent workflow steps targeting the same block.
 * Future extraction seam for pi-project extension.
 */
import fs from "node:fs";
import path from "node:path";
import _lockfile from "proper-lockfile";
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
 * Validate data against its schema (if one exists) and write atomically
 * to .project/{blockName}.json. Throws ValidationError on schema failure.
 * Files without a corresponding schema are written without validation.
 */
export function writeBlock(cwd: string, blockName: string, data: unknown): void {
	const filePath = blockFilePath(cwd, blockName);
	const schemaFile = blockSchemaPath(cwd, blockName);

	// Validate before write (if schema exists)
	if (fs.existsSync(schemaFile)) {
		validateFromFile(schemaFile, data, `block file '${blockName}.json'`);
	}

	// Ensure directory exists
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
		throw new Error(`Failed to write block file .project/${blockName}.json: ${msg}`);
	}
}

/**
 * Read current file, push item onto data[arrayKey], validate whole file
 * against schema, write atomically. Throws if file doesn't exist, if
 * arrayKey is missing or not an array, or if validation fails.
 */
export function appendToBlock(cwd: string, blockName: string, arrayKey: string, item: unknown): void {
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

		record[arrayKey] = [...(record[arrayKey] as unknown[]), item];
		writeBlock(cwd, blockName, record);
	});
}

/**
 * Find an item in data[arrayKey] by predicate, shallow-merge updates onto it,
 * validate whole file against schema, write atomically. Throws if no item
 * matches, if arrayKey is missing or not an array, or if validation fails.
 */
export function updateItemInBlock(
	cwd: string,
	blockName: string,
	arrayKey: string,
	predicate: (item: Record<string, unknown>) => boolean,
	updates: Record<string, unknown>,
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
		const updated = { ...arr[idx], ...updates };
		const patched = [...arr];
		patched[idx] = updated;
		record[arrayKey] = patched;
		writeBlock(cwd, blockName, record);
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
		const updatedParent = {
			...parent,
			[nestedArrayKey]: [...(parent[nestedArrayKey] as unknown[]), item],
		};
		const patched = [...arr];
		patched[idx] = updatedParent;
		record[parentArrayKey] = patched;
		writeBlock(cwd, blockName, record);
	});
}
