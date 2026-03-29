/**
 * Block step executor — performs validated, in-process block I/O.
 * No LLM call, no subprocess — calls the block API directly.
 *
 * Operations:
 * - read: single or multi-block read via readBlock()
 * - readDir: directory enumeration for .project/ subdirectories
 * - write: validated write via writeBlock()
 * - append: array append via appendToBlock()
 * - update: item update via updateItemInBlock()
 */

import fs from "node:fs";
import path from "node:path";
import { appendToBlock, readBlock, updateItemInBlock, writeBlock } from "@davidorex/pi-project/block-api";
import { PROJECT_DIR } from "@davidorex/pi-project/project-dir";
import { validateFromFile } from "@davidorex/pi-project/schema-validator";
import { resolveExpressions } from "./expression.js";
import { persistStepOutput } from "./output.js";
import { zeroUsage } from "./step-shared.js";
import type { BlockSpec, StepResult } from "./types.js";

/**
 * Execute a block step: performs block I/O using the block API.
 * All block names and values are expression-resolved before API calls.
 */
export function executeBlock(
	blockSpec: BlockSpec,
	stepName: string,
	scope: Record<string, unknown>,
	cwd: string,
	runDir?: string,
	outputPath?: string,
): StepResult {
	const startTime = Date.now();
	try {
		// Resolve expressions in the block spec
		const resolved = resolveExpressions(blockSpec, scope) as BlockSpec;

		let output: unknown;

		if ("read" in resolved) {
			output = executeRead(resolved.read, resolved.optional, cwd);
		} else if ("readDir" in resolved) {
			output = executeReadDir(resolved.readDir, cwd);
		} else if ("write" in resolved) {
			output = executeWrite(resolved.write, cwd);
		} else if ("append" in resolved) {
			output = executeAppend(resolved.append, cwd);
		} else if ("update" in resolved) {
			output = executeUpdate(resolved.update, cwd);
		} else {
			throw new Error("Block spec must have one of: read, readDir, write, append, update");
		}

		const result: StepResult = {
			step: stepName,
			agent: "block",
			status: "completed",
			output,
			textOutput: JSON.stringify(output, null, 2),
			usage: zeroUsage(),
			durationMs: Date.now() - startTime,
		};
		if (runDir) {
			result.outputPath = persistStepOutput(runDir, stepName, output, undefined, outputPath);
		}
		return result;
	} catch (err) {
		return {
			step: stepName,
			agent: "block",
			status: "failed",
			usage: zeroUsage(),
			durationMs: Date.now() - startTime,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

/**
 * Read one or more blocks. Single string → single block content.
 * Array → object keyed by block name.
 */
function executeRead(read: string | string[], optional: string[] | undefined, cwd: string): unknown {
	const optionalSet = new Set(optional ?? []);

	if (typeof read === "string") {
		// Single block read
		try {
			return readBlock(cwd, read);
		} catch (err) {
			if (optionalSet.has(read)) return null;
			throw err;
		}
	}

	// Multi-block read
	const result: Record<string, unknown> = {};
	for (const name of read) {
		try {
			result[name] = readBlock(cwd, name);
		} catch (err) {
			if (optionalSet.has(name)) {
				result[name] = null;
			} else {
				throw err;
			}
		}
	}
	return result;
}

/**
 * Read all JSON files in a .project/ subdirectory.
 * Returns sorted array of parsed contents.
 * Missing directories return [] (on-demand subdirectories).
 */
function executeReadDir(subdir: string, cwd: string): unknown[] {
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

/**
 * Write a block via writeBlock (schema validation + atomic write).
 * Supports optional path override for subdirectory writes.
 */
function executeWrite(spec: { name: string; data: unknown; path?: string }, cwd: string): Record<string, string> {
	if (spec.path) {
		return executeSubdirWrite(spec.name, spec.data, spec.path, cwd);
	}

	writeBlock(cwd, spec.name, spec.data);
	return { written: spec.name, path: `${PROJECT_DIR}/${spec.name}.json` };
}

/**
 * Write to a subdirectory path (.project/{path}.json) with schema
 * validation from `name`. Provides atomic writes and directory creation.
 */
function executeSubdirWrite(schemaName: string, data: unknown, subPath: string, cwd: string): Record<string, string> {
	const filePath = path.join(cwd, PROJECT_DIR, `${subPath}.json`);
	const schemaFile = path.join(cwd, PROJECT_DIR, "schemas", `${schemaName}.schema.json`);

	// Validate against schema if it exists
	if (fs.existsSync(schemaFile)) {
		validateFromFile(schemaFile, data, `block file '${subPath}.json'`);
	}

	// Ensure parent directory exists
	fs.mkdirSync(path.dirname(filePath), { recursive: true });

	// Atomic write
	const tmpPath = `${filePath}.block-step-${process.pid}.tmp`;
	try {
		fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
		fs.renameSync(tmpPath, filePath);
	} catch (err) {
		try {
			fs.unlinkSync(tmpPath);
		} catch {
			/* cleanup best-effort */
		}
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(`Failed to write ${PROJECT_DIR}/${subPath}.json: ${msg}`);
	}

	return { written: schemaName, path: `${PROJECT_DIR}/${subPath}.json` };
}

/**
 * Append an item to a block array via appendToBlock.
 */
function executeAppend(spec: { name: string; key: string; item: unknown }, cwd: string): Record<string, string> {
	appendToBlock(cwd, spec.name, spec.key, spec.item);
	return { appended: spec.name, key: spec.key };
}

/**
 * Update an item in a block array via updateItemInBlock.
 * The `match` object is converted to a predicate.
 */
function executeUpdate(
	spec: { name: string; key: string; match: Record<string, unknown>; set: Record<string, unknown> },
	cwd: string,
): Record<string, unknown> {
	const predicate = (item: Record<string, unknown>) => {
		return Object.entries(spec.match).every(([k, v]) => item[k] === v);
	};

	updateItemInBlock(cwd, spec.name, spec.key, predicate, spec.set);
	return { updated: spec.name, key: spec.key, matched: spec.match };
}
