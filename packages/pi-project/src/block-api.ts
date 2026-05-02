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
		const updatedNested = { ...nestedArr[nestedIdx], ...updates };
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
): { removed: number } {
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
): { removed: number } {
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
