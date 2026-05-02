import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { bundledDir } from "./bundled-dirs.js";
import type { WorkflowSpec } from "./types.js";
import { parseWorkflowSpec } from "./workflow-spec.js";
import { WORKFLOWS_DIR } from "./workflows-dir.js";

/**
 * Discover all workflow specs from project, user, and builtin directories.
 *
 * Scans (highest priority first):
 *   1. .workflows/                (project-level, source: "project")
 *   2. ~/.pi/agent/workflows/     (user-level, source: "user")
 *   3. <package>/workflows/       (builtin workflows, source: "user")
 *
 * Higher-priority specs shadow lower-priority specs with the same name.
 *
 * @param cwd - current working directory (project root)
 * @param builtinDir - optional path to builtin workflows (defaults to workflows/ relative to package root)
 * @returns Array of parsed WorkflowSpec objects. Specs that fail parsing are
 *          skipped with a warning (logged to stderr), not thrown.
 */
export function discoverWorkflows(cwd: string, builtinDir?: string): WorkflowSpec[] {
	const projectDir = path.join(cwd, WORKFLOWS_DIR);
	const userDir = path.join(os.homedir(), ".pi", "agent", "workflows");
	const demoDir = builtinDir ?? bundledDir("workflows");

	const projectSpecs = scanDirectory(projectDir, "project");
	const userSpecs = scanDirectory(userDir, "user");
	const builtinSpecs = scanDirectory(demoDir, "user");

	// Deduplicate: project > user > builtin (last write wins, so add lowest priority first)
	const byName = new Map<string, WorkflowSpec>();

	for (const spec of builtinSpecs) {
		byName.set(spec.name, spec);
	}
	for (const spec of userSpecs) {
		byName.set(spec.name, spec);
	}
	for (const spec of projectSpecs) {
		byName.set(spec.name, spec);
	}

	// Return sorted by name
	const result = Array.from(byName.values());
	result.sort((a, b) => a.name.localeCompare(b.name));
	return result;
}

/**
 * Find a workflow by name from discovered workflows.
 * Returns undefined if not found.
 */
export function findWorkflow(name: string, cwd: string, builtinDir?: string): WorkflowSpec | undefined {
	const specs = discoverWorkflows(cwd, builtinDir);
	return specs.find((s) => s.name === name);
}

/**
 * Scan a directory for *.workflow.yaml files and parse them.
 * Non-recursive. Returns parsed specs; logs warnings for parse failures.
 */
function scanDirectory(dirPath: string, source: "user" | "project"): WorkflowSpec[] {
	if (!fs.existsSync(dirPath)) {
		return [];
	}

	let entries: string[];
	try {
		entries = fs.readdirSync(dirPath);
	} catch (err) {
		console.error(`[workflows] failed to scan directory ${dirPath}: ${err instanceof Error ? err.message : err}`);
		return [];
	}

	const specs: WorkflowSpec[] = [];

	for (const entry of entries) {
		if (!entry.endsWith(".workflow.yaml")) {
			continue;
		}

		const filePath = path.join(dirPath, entry);

		// Only process files, not directories
		let stat: fs.Stats;
		try {
			stat = fs.statSync(filePath);
		} catch {
			continue;
		}
		if (!stat.isFile()) {
			continue;
		}

		let content: string;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			console.error(`[pi-workflows] Warning: skipping ${filePath}: could not read file`);
			continue;
		}

		try {
			const spec = parseWorkflowSpec(content, filePath, source);
			specs.push(spec);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error(`[pi-workflows] Warning: skipping ${filePath}: ${msg}`);
		}
	}

	return specs;
}
