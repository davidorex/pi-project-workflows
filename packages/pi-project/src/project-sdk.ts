/**
 * Project SDK — queryable surface for project block state, discovery,
 * and derived metrics. Computes everything dynamically from filesystem
 * and git — no cache, no stale data.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { readBlock } from "./block-api.js";
import { PROJECT_DIR, SCHEMAS_DIR } from "./project-dir.js";

// ── Block discovery ──────────────────────────────────────────────────────────

export interface BlockInfo {
  name: string;
  hasSchema: boolean;
}

export function availableBlocks(cwd: string): BlockInfo[] {
  const workflowDir = path.join(cwd, PROJECT_DIR);
  const schemasDir = path.join(workflowDir, SCHEMAS_DIR);
  if (!fs.existsSync(workflowDir)) return [];

  const blocks: BlockInfo[] = [];
  for (const file of fs.readdirSync(workflowDir)) {
    if (!file.endsWith(".json")) continue;
    const name = file.replace(".json", "");
    const hasSchema = fs.existsSync(path.join(schemasDir, `${name}.schema.json`));
    blocks.push({ name, hasSchema });
  }
  return blocks.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Discover schemas in PROJECT_DIR/SCHEMAS_DIR.
 * Returns sorted list of absolute paths to .schema.json files.
 */
export function availableSchemas(cwd: string): string[] {
  const dir = path.join(cwd, PROJECT_DIR, SCHEMAS_DIR);
  if (!fs.existsSync(dir)) return [];
  const schemas: string[] = [];
  for (const file of fs.readdirSync(dir)) {
    if (file.endsWith(".schema.json")) {
      schemas.push(path.join(dir, file));
    }
  }
  return schemas.sort();
}

/**
 * Discover blocks with array properties by scanning PROJECT_DIR/SCHEMAS_DIR
 * for schemas whose root type has at least one array property.
 * Returns block name, first array key, and schema path for each.
 */
export function findAppendableBlocks(cwd: string): Array<{ block: string; arrayKey: string; schemaPath: string }> {
  const schemasDir = path.join(cwd, PROJECT_DIR, SCHEMAS_DIR);
  if (!fs.existsSync(schemasDir)) return [];
  const results: Array<{ block: string; arrayKey: string; schemaPath: string }> = [];
  for (const file of fs.readdirSync(schemasDir)) {
    if (!file.endsWith(".schema.json")) continue;
    const blockName = file.replace(".schema.json", "");
    try {
      const schema = JSON.parse(fs.readFileSync(path.join(schemasDir, file), "utf-8"));
      if (schema.properties) {
        for (const [key, prop] of Object.entries(schema.properties)) {
          if ((prop as Record<string, unknown>).type === "array") {
            results.push({ block: blockName, arrayKey: key, schemaPath: path.join(schemasDir, file) });
            break; // first array property
          }
        }
      }
    } catch { /* skip malformed schemas */ }
  }
  return results;
}

// ── Derived State ────────────────────────────────────────────────────────────

export interface ArraySummary {
  total: number;
  byStatus?: Record<string, number>;
}

export interface BlockSummary {
  arrays: Record<string, ArraySummary>;
}

export interface ProjectState {
  testCount: number;
  sourceFiles: number;
  sourceLines: number;
  lastCommit: string;
  lastCommitMessage: string;
  recentCommits: string[];
  blockSummaries: Record<string, BlockSummary>;
  phases: { total: number; current: number };
  blocks: number;
  schemas: number;
}

/**
 * Derive project state from authoritative sources at query time.
 * No cache, no stale data — computed fresh on every call.
 */
export function projectState(cwd: string): ProjectState {
  // Git state
  let lastCommit = "unknown";
  let lastCommitMessage = "";
  try {
    lastCommit = execSync("git log -1 --format=%h", { cwd, encoding: "utf-8" }).trim();
    lastCommitMessage = execSync("git log -1 --format=%s", { cwd, encoding: "utf-8" }).trim();
  } catch { /* not a git repo or no commits */ }

  // Recent commits
  let recentCommits: string[] = [];
  try {
    const log = execSync("git log --oneline -5", { cwd, encoding: "utf-8" }).trim();
    if (log) recentCommits = log.split("\n");
  } catch { /* not a git repo */ }

  // Resolve src dirs — workspace-aware: if cwd has a package.json with
  // "workspaces" globs, collect src/ from each matched package directory;
  // otherwise fall back to the single cwd/src/ directory.
  const srcDirs: string[] = [];
  try {
    const rootPkg = path.join(cwd, "package.json");
    if (fs.existsSync(rootPkg)) {
      const pkg = JSON.parse(fs.readFileSync(rootPkg, "utf-8"));
      if (Array.isArray(pkg.workspaces) && pkg.workspaces.length > 0) {
        for (const pattern of pkg.workspaces as string[]) {
          // Support trailing /* glob (e.g. "packages/*")
          const base = pattern.replace(/\/?\*$/, "");
          const baseDir = path.join(cwd, base);
          if (fs.existsSync(baseDir) && fs.statSync(baseDir).isDirectory()) {
            for (const entry of fs.readdirSync(baseDir)) {
              const pkgSrc = path.join(baseDir, entry, "src");
              if (fs.existsSync(pkgSrc) && fs.statSync(pkgSrc).isDirectory()) {
                srcDirs.push(pkgSrc);
              }
            }
          }
        }
      }
    }
  } catch { /* failed to read/parse package.json — fall through */ }
  // Fallback: if no workspace dirs found, use cwd/src as before
  if (srcDirs.length === 0) {
    const single = path.join(cwd, "src");
    if (fs.existsSync(single)) srcDirs.push(single);
  }

  // Source file count and line count (non-test .ts files)
  let sourceFiles = 0;
  let sourceLines = 0;
  for (const srcDir of srcDirs) {
    try {
      for (const file of fs.readdirSync(srcDir)) {
        if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
        sourceFiles++;
        const content = fs.readFileSync(path.join(srcDir, file), "utf-8");
        sourceLines += content.split("\n").length;
      }
    } catch { /* unreadable src dir */ }
  }

  // Test count derived from static scan of it() declarations in test files
  let testCount = 0;
  for (const srcDir of srcDirs) {
    try {
      for (const file of fs.readdirSync(srcDir)) {
        if (!file.endsWith(".test.ts")) continue;
        const content = fs.readFileSync(path.join(srcDir, file), "utf-8");
        const matches = content.match(/^\s*it\s*\(/gm);
        if (matches) testCount += matches.length;
      }
    } catch { /* unreadable src dir */ }
  }

  // Block summaries — scan all blocks, report item counts and status distribution
  const blockSummaries: Record<string, BlockSummary> = {};
  const blockDir = path.join(cwd, PROJECT_DIR);
  try {
    if (fs.existsSync(blockDir)) {
      for (const file of fs.readdirSync(blockDir)) {
        if (!file.endsWith(".json")) continue;
        const blockName = file.replace(".json", "");
        try {
          const data = readBlock(cwd, blockName) as Record<string, unknown>;
          const arrays: Record<string, ArraySummary> = {};
          for (const [key, val] of Object.entries(data)) {
            if (!Array.isArray(val)) continue;
            const items = val as Record<string, unknown>[];
            const arrSummary: ArraySummary = { total: items.length };
            // Aggregate by status if items have a status field
            if (items.length > 0 && typeof items[0] === "object" && items[0] !== null && "status" in items[0]) {
              const byStatus: Record<string, number> = {};
              for (const item of items) {
                const s = String((item as Record<string, unknown>).status ?? "unknown");
                byStatus[s] = (byStatus[s] ?? 0) + 1;
              }
              arrSummary.byStatus = byStatus;
            }
            arrays[key] = arrSummary;
          }
          if (Object.keys(arrays).length > 0) {
            blockSummaries[blockName] = { arrays };
          }
        } catch { /* skip unreadable blocks */ }
      }
    }
  } catch { /* no block dir */ }

  // Phases from PROJECT_DIR/phases/*.json
  let phaseTotal = 0;
  let phaseCurrent = 0;
  try {
    const phasesDir = path.join(cwd, PROJECT_DIR, "phases");
    if (fs.existsSync(phasesDir)) {
      const files = fs.readdirSync(phasesDir).filter(f => f.endsWith(".json")).sort();
      phaseTotal = files.length;
      if (files.length > 0) {
        const last = files[files.length - 1];
        phaseCurrent = parseInt(last.split("-")[0], 10) || 0;
      }
    }
  } catch { /* no phases dir */ }

  return {
    testCount,
    sourceFiles,
    sourceLines,
    lastCommit,
    lastCommitMessage,
    recentCommits,
    blockSummaries,
    phases: { total: phaseTotal, current: phaseCurrent },
    blocks: availableBlocks(cwd).length,
    schemas: availableSchemas(cwd).length,
  };
}
