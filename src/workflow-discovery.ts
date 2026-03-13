import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { WorkflowSpec } from "./types.ts";
import { parseWorkflowSpec } from "./workflow-spec.ts";

/**
 * Discover all workflow specs from project and user directories.
 *
 * Scans:
 *   1. .pi/workflows/             (project-level, source: "project")
 *   2. ~/.pi/agent/workflows/     (user-level, source: "user")
 *
 * Project-level specs take precedence over user-level specs with the same name.
 *
 * @param cwd - current working directory (project root)
 * @returns Array of parsed WorkflowSpec objects. Specs that fail parsing are
 *          skipped with a warning (logged to stderr), not thrown.
 */
export function discoverWorkflows(cwd: string): WorkflowSpec[] {
  const projectDir = path.join(cwd, ".pi", "workflows");
  const userDir = path.join(os.homedir(), ".pi", "agent", "workflows");

  const projectSpecs = scanDirectory(projectDir, "project");
  const userSpecs = scanDirectory(userDir, "user");

  // Deduplicate: project-level specs shadow user-level specs with the same name
  const byName = new Map<string, WorkflowSpec>();

  // Add user specs first, then project specs overwrite
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
export function findWorkflow(name: string, cwd: string): WorkflowSpec | undefined {
  const specs = discoverWorkflows(cwd);
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
  } catch {
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
