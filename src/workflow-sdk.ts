/**
 * Workflow SDK — single queryable surface for the workflow extension's
 * vocabulary, discovery, and spec introspection. Derives dynamically
 * from source registries and filesystem — add a filter, agent, template,
 * or schema, and it appears here automatically.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { FILTER_NAMES, EXPRESSION_ROOTS } from "./expression.ts";
import { STEP_TYPES } from "./workflow-spec.ts";
import { readBlock } from "./block-api.ts";
import type { StepTypeDescriptor } from "./workflow-spec.ts";
import { discoverWorkflows } from "./workflow-discovery.ts";
import { parseAgentYaml } from "./agent-spec.ts";
import type { AgentSpec, WorkflowSpec, StepSpec } from "./types.ts";

// Re-export for single-import convenience
export { FILTER_NAMES, STEP_TYPES, EXPRESSION_ROOTS };
export type { StepTypeDescriptor };

const EXPR_PATTERN = /\$\{\{\s*(.*?)\s*\}\}/g;

// ── Vocabulary (derived from code registries) ────────────────────────────────

export function filterNames(): string[] { return FILTER_NAMES; }
export function stepTypes(): StepTypeDescriptor[] { return STEP_TYPES; }
export function expressionRoots(): readonly string[] { return EXPRESSION_ROOTS; }

// ── Discovery (derived from filesystem) ──────────────────────────────────────

export function availableAgents(cwd: string, builtinDir?: string): AgentSpec[] {
  const defaultBuiltinDir = builtinDir ?? path.resolve(import.meta.dirname, "..", "demo", "agents");
  const searchDirs = [
    path.join(cwd, ".pi", "agents"),
    path.join(os.homedir(), ".pi", "agent", "agents"),
    defaultBuiltinDir,
  ];
  const seen = new Set<string>();
  const agents: AgentSpec[] = [];

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".agent.yaml")) continue;
      const name = file.replace(".agent.yaml", "");
      if (seen.has(name)) continue; // higher-priority dir already found this agent
      seen.add(name);
      try {
        agents.push(parseAgentYaml(path.join(dir, file)));
      } catch {
        // skip malformed specs
      }
    }
  }
  return agents.sort((a, b) => a.name.localeCompare(b.name));
}

export function availableTemplates(cwd: string, builtinDir?: string): string[] {
  const defaultBuiltinDir = builtinDir ?? path.resolve(import.meta.dirname, "..", "templates");
  const searchDirs = [
    path.join(cwd, ".pi", "templates"),
    path.join(os.homedir(), ".pi", "agent", "templates"),
    defaultBuiltinDir,
  ];
  const seen = new Set<string>();

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    walkFiles(dir, (filePath) => {
      if (filePath.endsWith(".md") || filePath.endsWith(".txt")) {
        const rel = path.relative(dir, filePath);
        if (!seen.has(rel)) seen.add(rel);
      }
    });
  }
  return Array.from(seen).sort();
}

export function availableSchemas(cwd: string, builtinDir?: string): string[] {
  const defaultBuiltinSchemas = builtinDir ?? path.resolve(import.meta.dirname, "..", "demo", "schemas");
  const dirs = [
    path.join(cwd, ".workflow", "schemas"),
    defaultBuiltinSchemas,
  ];
  const schemas: string[] = [];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (file.endsWith(".schema.json")) {
        schemas.push(path.join(dir, file));
      }
    }
  }
  return schemas.sort();
}

export function availableWorkflows(cwd: string): WorkflowSpec[] {
  return discoverWorkflows(cwd);
}

export interface BlockInfo {
  name: string;
  hasSchema: boolean;
}

export function availableBlocks(cwd: string): BlockInfo[] {
  const workflowDir = path.join(cwd, ".workflow");
  const schemasDir = path.join(workflowDir, "schemas");
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

// ── Derived State (computed at query time, never cached) ─────────────────────

interface GapEntry {
  id: string;
  status: string;
  category: string;
  priority: string;
  description: string;
}

interface DecisionEntry {
  id: string;
  decision: string;
  status: string;
}

export interface ProjectState {
  testCount: number;
  lastCommit: string;
  lastCommitMessage: string;
  gaps: { open: number; resolved: number; deferred: number; byCategory: Record<string, number>; byPriority: Record<string, number> };
  decisions: { total: number; decided: number; tentative: number };
  agents: number;
  workflows: number;
  blocks: number;
  openGaps: Array<{ id: string; category: string; priority: string; description: string }>;
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

  // Test count from inventory (authoritative source)
  let testCount = 0;
  try {
    const inv = readBlock(cwd, "inventory") as { test_count?: number };
    testCount = inv.test_count ?? 0;
  } catch { /* no inventory */ }

  // Gaps
  let gapEntries: GapEntry[] = [];
  try {
    const g = readBlock(cwd, "gaps") as { gaps: GapEntry[] };
    gapEntries = g.gaps;
  } catch { /* no gaps */ }

  const openGaps = gapEntries.filter(g => g.status === "open");
  const byCategory: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  for (const g of openGaps) {
    byCategory[g.category] = (byCategory[g.category] ?? 0) + 1;
    byPriority[g.priority] = (byPriority[g.priority] ?? 0) + 1;
  }

  // Decisions
  let decisionEntries: DecisionEntry[] = [];
  try {
    const d = readBlock(cwd, "decisions") as { decisions: DecisionEntry[] };
    decisionEntries = d.decisions;
  } catch { /* no decisions */ }

  return {
    testCount,
    lastCommit,
    lastCommitMessage,
    gaps: {
      open: openGaps.length,
      resolved: gapEntries.filter(g => g.status === "resolved").length,
      deferred: gapEntries.filter(g => g.status === "deferred").length,
      byCategory,
      byPriority,
    },
    decisions: {
      total: decisionEntries.length,
      decided: decisionEntries.filter(d => d.status === "decided").length,
      tentative: decisionEntries.filter(d => d.status === "tentative").length,
    },
    agents: availableAgents(cwd).length,
    workflows: availableWorkflows(cwd).length,
    blocks: availableBlocks(cwd).length,
    openGaps: openGaps.map(g => ({ id: g.id, category: g.category, priority: g.priority, description: g.description })),
  };
}

// ── Introspection (derived from parsed spec) ─────────────────────────────────

export interface ExpressionRef {
  expression: string;
  field: string;
  stepRefs: string[];
  filterName?: string;
}

/**
 * Extract all ${{ }} expressions from a workflow spec with their source locations.
 * Walks the entire spec tree including nested steps in loops and parallel blocks.
 */
export function extractExpressions(spec: WorkflowSpec): ExpressionRef[] {
  const refs: ExpressionRef[] = [];

  // Walk top-level steps
  for (const [stepName, step] of Object.entries(spec.steps)) {
    extractFromStep(step, `steps.${stepName}`, refs);
  }

  // Walk completion
  if (spec.completion) {
    if (spec.completion.template) {
      extractFromString(spec.completion.template, "completion.template", refs);
    }
    if (spec.completion.message) {
      extractFromString(spec.completion.message, "completion.message", refs);
    }
    if (spec.completion.include) {
      for (const inc of spec.completion.include) {
        extractFromString(inc, "completion.include", refs);
      }
    }
  }

  // Walk artifacts
  if (spec.artifacts) {
    for (const [name, art] of Object.entries(spec.artifacts)) {
      extractFromString(art.path, `artifacts.${name}.path`, refs);
      extractFromString(art.from, `artifacts.${name}.from`, refs);
    }
  }

  return refs;
}

function extractFromStep(step: StepSpec, prefix: string, refs: ExpressionRef[]): void {
  if (step.when) extractFromString(step.when, `${prefix}.when`, refs);
  if (step.forEach) extractFromString(step.forEach, `${prefix}.forEach`, refs);
  if (step.input) extractFromString(step.input as string, `${prefix}.input`, refs);
  if (step.command) extractFromString(step.command, `${prefix}.command`, refs);

  // Gate check
  if (step.gate?.check) extractFromString(step.gate.check, `${prefix}.gate.check`, refs);

  // Transform mapping
  if (step.transform?.mapping) {
    extractFromValue(step.transform.mapping, `${prefix}.transform.mapping`, refs);
  }

  // Nested loop steps
  if (step.loop?.steps) {
    for (const [subName, subStep] of Object.entries(step.loop.steps)) {
      extractFromStep(subStep, `${prefix}.loop.steps.${subName}`, refs);
    }
  }

  // Nested parallel steps
  if (step.parallel) {
    for (const [subName, subStep] of Object.entries(step.parallel)) {
      extractFromStep(subStep, `${prefix}.parallel.${subName}`, refs);
    }
  }
}

function extractFromValue(value: unknown, field: string, refs: ExpressionRef[]): void {
  if (typeof value === "string") {
    extractFromString(value, field, refs);
  } else if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      extractFromValue(value[i], `${field}[${i}]`, refs);
    }
  } else if (value && typeof value === "object") {
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      extractFromValue(val, `${field}.${key}`, refs);
    }
  }
}

function extractFromString(str: string, field: string, refs: ExpressionRef[]): void {
  EXPR_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = EXPR_PATTERN.exec(str)) !== null) {
    const raw = match[1].trim();
    const pipeIdx = raw.indexOf("|");
    const exprPart = pipeIdx >= 0 ? raw.slice(0, pipeIdx).trim() : raw;
    const filterName = pipeIdx >= 0 ? raw.slice(pipeIdx + 1).trim() : undefined;

    // Extract step references: steps.X.anything → step name is X
    const stepRefs: string[] = [];
    const stepRefPattern = /\bsteps\.(\w+)/g;
    let stepMatch: RegExpExecArray | null;
    while ((stepMatch = stepRefPattern.exec(exprPart)) !== null) {
      if (!stepRefs.includes(stepMatch[1])) {
        stepRefs.push(stepMatch[1]);
      }
    }

    refs.push({ expression: raw, field, stepRefs, filterName });
  }
}

export function declaredSteps(spec: WorkflowSpec): string[] {
  return Object.keys(spec.steps);
}

export function declaredAgentRefs(spec: WorkflowSpec): string[] {
  const agents: string[] = [];
  collectAgentRefs(spec.steps, agents);
  return [...new Set(agents)];
}

function collectAgentRefs(steps: Record<string, StepSpec>, agents: string[]): void {
  for (const step of Object.values(steps)) {
    if (step.agent) agents.push(step.agent);
    if (step.loop?.steps) collectAgentRefs(step.loop.steps, agents);
    if (step.parallel) collectAgentRefs(step.parallel, agents);
  }
}

export function declaredSchemaRefs(spec: WorkflowSpec): string[] {
  const schemas: string[] = [];
  collectSchemaRefs(spec.steps, schemas);
  if (spec.artifacts) {
    for (const art of Object.values(spec.artifacts)) {
      if (art.schema) schemas.push(art.schema);
    }
  }
  return [...new Set(schemas)];
}

function collectSchemaRefs(steps: Record<string, StepSpec>, schemas: string[]): void {
  for (const step of Object.values(steps)) {
    if (step.output?.schema) schemas.push(step.output.schema);
    if (step.loop?.steps) collectSchemaRefs(step.loop.steps, schemas);
    if (step.parallel) collectSchemaRefs(step.parallel, schemas);
  }
}

// ── Utility ──────────────────────────────────────────────────────────────────

function walkFiles(dir: string, callback: (filePath: string) => void): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, callback);
    } else if (entry.isFile()) {
      callback(full);
    }
  }
}
