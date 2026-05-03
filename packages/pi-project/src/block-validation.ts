/**
 * Post-step block validation — snapshot .project/*.json contents before step
 * execution, then validate any changed files against their schemas after.
 * Supports rollback of block files to pre-step state on validation failure.
 * Covers top-level .project/*.json and known subdirectories (phases/, audits/).
 */
import fs from "node:fs";
import path from "node:path";
import { projectRoot } from "./project-context.js";
import { SCHEMAS_DIR } from "./project-dir.js";
import { validateFromFile } from "./schema-validator.js";

export interface BlockFileSnapshot {
	mtime: number;
	content: string;
}
export type BlockSnapshot = Map<string, BlockFileSnapshot>;

/**
 * Known subdirectories of .project/ that contain JSON block files.
 * Each maps plural directory name → singular schema name:
 *   phases/*.json → phase.schema.json
 *   audits/*.json → audit.schema.json
 */
const BLOCK_SUBDIRS: { dir: string; schemaBase: string }[] = [
	{ dir: "phases", schemaBase: "phase" },
	{ dir: "audits", schemaBase: "audit" },
];

/**
 * Snapshot a single directory's .json files into the result map.
 * Tolerates missing directories (returns without error).
 */
function snapshotDir(dirPath: string, result: BlockSnapshot): void {
	try {
		const entries = fs.readdirSync(dirPath);
		for (const entry of entries) {
			if (!entry.endsWith(".json")) continue;
			const fullPath = path.join(dirPath, entry);
			try {
				const stat = fs.statSync(fullPath);
				if (stat.isFile()) {
					const content = fs.readFileSync(fullPath, "utf-8");
					result.set(fullPath, { mtime: stat.mtimeMs, content });
				}
			} catch {
				// File disappeared between readdir and stat — skip
			}
		}
	} catch {
		// Directory doesn't exist — nothing to snapshot
	}
}

/**
 * Snapshot mtimes and contents of all .project/*.json files, including
 * known subdirectories (phases/, audits/).
 * Returns a Map of absolute filepath → { mtime, content }.
 * If .project/ doesn't exist, returns an empty map.
 */
export function snapshotBlockFiles(cwd: string): BlockSnapshot {
	const result: BlockSnapshot = new Map();
	const projectDir = path.join(cwd, projectRoot(cwd));

	// Top-level .project/*.json
	snapshotDir(projectDir, result);

	// Known subdirectories
	for (const sub of BLOCK_SUBDIRS) {
		snapshotDir(path.join(projectDir, sub.dir), result);
	}

	return result;
}

/**
 * Validate changed .json files in a single directory against schemas.
 * For top-level files, schema is derived from filename: foo.json → foo.schema.json.
 * For subdirectory files, a fixed schemaBase is used: phases/01.json → phase.schema.json.
 * Appends validation errors to the provided errors array.
 */
function validateChangedInDir(
	dirPath: string,
	schemasDir: string,
	before: BlockSnapshot,
	errors: string[],
	schemaBase?: string,
): void {
	let currentEntries: string[];
	try {
		currentEntries = fs.readdirSync(dirPath).filter((e) => e.endsWith(".json"));
	} catch {
		return; // directory doesn't exist
	}

	for (const entry of currentEntries) {
		const fullPath = path.join(dirPath, entry);

		let stat: fs.Stats;
		try {
			stat = fs.statSync(fullPath);
		} catch {
			continue;
		}
		if (!stat.isFile()) continue;

		const prev = before.get(fullPath);
		const isChanged = prev === undefined || stat.mtimeMs !== prev.mtime;
		if (!isChanged) continue;

		// Changed or new file — look for a schema
		const baseName = schemaBase ?? entry.replace(/\.json$/, "");
		const schemaPath = path.join(schemasDir, `${baseName}.schema.json`);

		if (!fs.existsSync(schemaPath)) {
			console.error(`[block-validation] skipping ${baseName}: no schema found`);
			continue;
		}

		// Validate
		const label = schemaBase ? `${schemaBase}/${entry}` : entry;
		try {
			const content = fs.readFileSync(fullPath, "utf-8");
			const data = JSON.parse(content);
			validateFromFile(schemaPath, data, `block file '${label}'`);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			errors.push(`${label}: ${msg}`);
		}
	}
}

/**
 * Compare current .project/*.json mtimes against a prior snapshot.
 * Validate any changed or newly created files against their schemas.
 * Also checks known subdirectories (phases/, audits/).
 *
 * Schema path convention:
 *   .project/foo.json → .project/schemas/foo.schema.json
 *   .project/phases/*.json → .project/schemas/phase.schema.json
 *   .project/audits/*.json → .project/schemas/audit.schema.json
 *
 * Files with no corresponding schema are silently skipped.
 *
 * @throws Error if any changed block file fails schema validation
 */
export function validateChangedBlocks(cwd: string, before: BlockSnapshot): void {
	const projectDir = path.join(cwd, projectRoot(cwd));
	const schemasDir = path.join(projectDir, SCHEMAS_DIR);

	const errors: string[] = [];

	// Top-level .project/*.json
	validateChangedInDir(projectDir, schemasDir, before, errors);

	// Known subdirectories
	for (const sub of BLOCK_SUBDIRS) {
		validateChangedInDir(path.join(projectDir, sub.dir), schemasDir, before, errors, sub.schemaBase);
	}

	if (errors.length > 0) {
		throw new Error(`Block validation failed:\n${errors.join("\n")}`);
	}
}

/**
 * Rollback .json files in a single directory to their pre-step state.
 * - Files that existed in the snapshot and changed: restore content via atomic write (tmp + rename)
 * - New files (not in snapshot): delete them
 * Appends rolled-back file paths to the provided array.
 */
function rollbackDir(dirPath: string, before: BlockSnapshot, rolledBack: string[]): void {
	let currentEntries: string[];
	try {
		currentEntries = fs.readdirSync(dirPath).filter((e) => e.endsWith(".json"));
	} catch {
		return;
	}

	for (const entry of currentEntries) {
		const fullPath = path.join(dirPath, entry);

		let stat: fs.Stats;
		try {
			stat = fs.statSync(fullPath);
		} catch {
			continue;
		}
		if (!stat.isFile()) continue;

		const prev = before.get(fullPath);

		if (prev === undefined) {
			// New file — delete it
			try {
				fs.unlinkSync(fullPath);
				rolledBack.push(fullPath);
			} catch {
				// best effort
			}
		} else if (stat.mtimeMs !== prev.mtime) {
			// Changed file — restore content via atomic write
			try {
				const tmpPath = `${fullPath}.rollback-${process.pid}.tmp`;
				fs.writeFileSync(tmpPath, prev.content);
				fs.renameSync(tmpPath, fullPath);
				rolledBack.push(fullPath);
			} catch {
				// best effort
			}
		}
	}
}

/**
 * Rollback .project/*.json files (including known subdirectories) to their pre-step state.
 * Returns list of rolled-back file paths.
 */
export function rollbackBlockFiles(cwd: string, before: BlockSnapshot): string[] {
	const projectDir = path.join(cwd, projectRoot(cwd));
	const rolledBack: string[] = [];

	// Top-level .project/*.json
	rollbackDir(projectDir, before, rolledBack);

	// Known subdirectories
	for (const sub of BLOCK_SUBDIRS) {
		rollbackDir(path.join(projectDir, sub.dir), before, rolledBack);
	}

	return rolledBack;
}
