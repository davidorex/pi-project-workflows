import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import {
  filterNames, stepTypes, expressionRoots,
  availableAgents, availableTemplates, availableSchemas, availableBlocks,
  projectState,
  extractExpressions, declaredSteps, declaredAgentRefs, declaredSchemaRefs,
  FILTER_NAMES, STEP_TYPES,
} from "./workflow-sdk.ts";
import type { WorkflowSpec, StepSpec } from "./types.ts";

function makeTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `sdk-${prefix}-`));
}

// ── Vocabulary ───────────────────────────────────────────────────────────────

describe("vocabulary", () => {
  it("filterNames returns current filter set", () => {
    const names = filterNames();
    assert.ok(names.includes("json"));
    assert.ok(names.includes("duration"));
    assert.ok(names.includes("currency"));
    assert.ok(names.includes("length"));
    assert.ok(names.includes("keys"));
    assert.ok(names.includes("filter"));
  });

  it("filterNames length matches FILTER_NAMES export", () => {
    assert.strictEqual(filterNames().length, FILTER_NAMES.length);
  });

  it("stepTypes returns descriptors with required fields", () => {
    const types = stepTypes();
    assert.ok(types.length >= 7);
    for (const t of types) {
      assert.ok(typeof t.name === "string");
      assert.ok(typeof t.field === "string");
      assert.ok(typeof t.retryable === "boolean");
      assert.ok(typeof t.supportsInput === "boolean");
      assert.ok(typeof t.supportsOutput === "boolean");
    }
  });

  it("stepTypes field names match STEP_TYPES export", () => {
    const fromFn = stepTypes().map(t => t.field).sort();
    const fromExport = STEP_TYPES.map(t => t.field).sort();
    assert.deepStrictEqual(fromFn, fromExport);
  });

  it("expressionRoots includes input and steps", () => {
    const roots = expressionRoots();
    assert.ok(roots.includes("input"));
    assert.ok(roots.includes("steps"));
  });
});

// ── Discovery ────────────────────────────────────────────────────────────────

describe("discovery", () => {
  it("availableAgents finds agents in .pi/agents/", (t) => {
    const tmpDir = makeTmpDir("agents");
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const agentDir = path.join(tmpDir, ".pi", "agents");
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(path.join(agentDir, "test-agent.agent.yaml"), "name: test-agent\ntools: [read]\n");

    const agents = availableAgents(tmpDir, "/nonexistent"); // no builtins
    assert.ok(agents.some(a => a.name === "test-agent"));
  });

  it("availableAgents skips malformed YAML", (t) => {
    const tmpDir = makeTmpDir("agents-bad");
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const agentDir = path.join(tmpDir, ".pi", "agents");
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(path.join(agentDir, "good.agent.yaml"), "name: good\ntools: [read]\n");
    fs.writeFileSync(path.join(agentDir, "bad.agent.yaml"), ":::invalid yaml{{{\n");

    const agents = availableAgents(tmpDir, "/nonexistent");
    assert.ok(agents.some(a => a.name === "good"));
    assert.ok(!agents.some(a => a.name === "bad"));
  });

  it("availableTemplates finds .md files", (t) => {
    const tmpDir = makeTmpDir("templates");
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const tplDir = path.join(tmpDir, ".pi", "templates", "my-agent");
    fs.mkdirSync(tplDir, { recursive: true });
    fs.writeFileSync(path.join(tplDir, "task.md"), "# Task\n");

    const templates = availableTemplates(tmpDir, "/nonexistent");
    assert.ok(templates.includes(path.join("my-agent", "task.md")));
  });

  it("availableSchemas finds .workflow/schemas/*.schema.json", (t) => {
    const tmpDir = makeTmpDir("schemas");
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const schemasDir = path.join(tmpDir, ".workflow", "schemas");
    fs.mkdirSync(schemasDir, { recursive: true });
    fs.writeFileSync(path.join(schemasDir, "gaps.schema.json"), "{}");

    const schemas = availableSchemas(tmpDir, "/nonexistent");
    assert.ok(schemas.some(s => s.includes("gaps.schema.json")));
  });

  it("availableBlocks lists blocks with schema presence", (t) => {
    const tmpDir = makeTmpDir("blocks");
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const wfDir = path.join(tmpDir, ".workflow");
    const schemasDir = path.join(wfDir, "schemas");
    fs.mkdirSync(schemasDir, { recursive: true });
    fs.writeFileSync(path.join(wfDir, "gaps.json"), "{}");
    fs.writeFileSync(path.join(schemasDir, "gaps.schema.json"), "{}");
    fs.writeFileSync(path.join(wfDir, "model-config.json"), "{}"); // no schema

    const blocks = availableBlocks(tmpDir);
    const gaps = blocks.find(b => b.name === "gaps");
    const config = blocks.find(b => b.name === "model-config");
    assert.ok(gaps);
    assert.strictEqual(gaps!.hasSchema, true);
    assert.ok(config);
    assert.strictEqual(config!.hasSchema, false);
  });
});

// ── Derived State ────────────────────────────────────────────────────────────

describe("projectState", () => {
  it("derives state from blocks and git", (t) => {
    const tmpDir = makeTmpDir("state");
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    // Set up a minimal git repo
    execSync("git init && git commit --allow-empty -m 'init'", { cwd: tmpDir, stdio: "ignore" });

    // Set up blocks
    const wfDir = path.join(tmpDir, ".workflow");
    const schemasDir = path.join(wfDir, "schemas");
    fs.mkdirSync(schemasDir, { recursive: true });
    fs.writeFileSync(path.join(wfDir, "inventory.json"), JSON.stringify({ test_count: 42 }));
    fs.writeFileSync(path.join(wfDir, "gaps.json"), JSON.stringify({
      gaps: [
        { id: "g1", description: "open gap", status: "open", category: "issue", priority: "high" },
        { id: "g2", description: "resolved", status: "resolved", category: "cleanup", priority: "low" },
        { id: "g3", description: "another open", status: "open", category: "capability", priority: "medium" },
      ],
    }));
    fs.writeFileSync(path.join(wfDir, "decisions.json"), JSON.stringify({
      decisions: [
        { id: "d1", decision: "use X", rationale: "because", phase: 1, status: "decided" },
        { id: "d2", decision: "maybe Y", rationale: "unclear", phase: 1, status: "tentative" },
      ],
    }));

    const state = projectState(tmpDir);

    assert.strictEqual(state.testCount, 42);
    assert.ok(state.lastCommit.length > 0);
    assert.strictEqual(state.lastCommitMessage, "init");
    assert.strictEqual(state.gaps.open, 2);
    assert.strictEqual(state.gaps.resolved, 1);
    assert.strictEqual(state.gaps.byCategory.issue, 1);
    assert.strictEqual(state.gaps.byCategory.capability, 1);
    assert.strictEqual(state.gaps.byPriority.high, 1);
    assert.strictEqual(state.gaps.byPriority.medium, 1);
    assert.strictEqual(state.decisions.total, 2);
    assert.strictEqual(state.decisions.decided, 1);
    assert.strictEqual(state.decisions.tentative, 1);
    assert.strictEqual(state.openGaps.length, 2);
    assert.ok(state.openGaps.some(g => g.id === "g1"));
  });

  it("handles missing blocks gracefully", (t) => {
    const tmpDir = makeTmpDir("state-empty");
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const state = projectState(tmpDir);

    assert.strictEqual(state.testCount, 0);
    assert.strictEqual(state.lastCommit, "unknown");
    assert.strictEqual(state.gaps.open, 0);
    assert.strictEqual(state.decisions.total, 0);
    assert.strictEqual(state.openGaps.length, 0);
  });
});

// ── Introspection ────────────────────────────────────────────────────────────

function makeSpec(steps: Record<string, StepSpec>, extras?: Partial<WorkflowSpec>): WorkflowSpec {
  return {
    name: "test",
    description: "test",
    steps,
    source: "project",
    filePath: "/tmp/test.workflow.yaml",
    ...extras,
  };
}

describe("introspection", () => {
  it("extractExpressions finds step references", () => {
    const spec = makeSpec({
      load: { command: "echo hello" },
      process: { agent: "coder", when: "${{ steps.load.output.ready }}" },
    });
    const exprs = extractExpressions(spec);
    assert.ok(exprs.some(e => e.stepRefs.includes("load")));
  });

  it("extractExpressions finds filter names", () => {
    const spec = makeSpec({
      s1: { agent: "coder", input: "Data: ${{ steps.load.output | json }}" },
    });
    const exprs = extractExpressions(spec);
    const jsonExpr = exprs.find(e => e.filterName === "json");
    assert.ok(jsonExpr);
  });

  it("extractExpressions scans when, forEach, command, gate.check, completion", () => {
    const spec = makeSpec({
      load: { command: "echo '${{ input.x }}'" },
      check: { gate: { check: "test '${{ steps.load.output.ok }}' = 'true'" } },
      iter: { agent: "a", forEach: "${{ steps.load.output.items }}", as: "item" },
      cond: { agent: "b", when: "${{ steps.check.output.passed }}" },
    }, {
      completion: {
        message: "Done: ${{ steps.iter.output | json }}",
        include: ["steps.load.output"],
      },
    });
    const exprs = extractExpressions(spec);
    const fields = exprs.map(e => e.field);
    assert.ok(fields.some(f => f.includes("command")));
    assert.ok(fields.some(f => f.includes("gate.check")));
    assert.ok(fields.some(f => f.includes("forEach")));
    assert.ok(fields.some(f => f.includes("when")));
    assert.ok(fields.some(f => f.includes("completion.message")));
  });

  it("extractExpressions handles nested loop steps", () => {
    const spec = makeSpec({
      outer: {
        loop: {
          maxAttempts: 3,
          steps: {
            inner: { agent: "coder", when: "${{ steps.outer.output.retry }}" },
          },
        },
      },
    });
    const exprs = extractExpressions(spec);
    assert.ok(exprs.some(e => e.field.includes("loop.steps.inner")));
  });

  it("declaredSteps returns step names", () => {
    const spec = makeSpec({ a: { command: "echo" }, b: { agent: "x" }, c: { pause: true } });
    assert.deepStrictEqual(declaredSteps(spec), ["a", "b", "c"]);
  });

  it("declaredAgentRefs extracts agent names", () => {
    const spec = makeSpec({
      s1: { agent: "investigator" },
      s2: { command: "echo" },
      s3: { agent: "decomposer" },
    });
    const refs = declaredAgentRefs(spec);
    assert.ok(refs.includes("investigator"));
    assert.ok(refs.includes("decomposer"));
    assert.strictEqual(refs.length, 2);
  });

  it("declaredAgentRefs finds agents in nested forEach/loop/parallel", () => {
    const spec = makeSpec({
      outer: {
        agent: "outer-agent",
        loop: {
          maxAttempts: 2,
          steps: {
            inner: { agent: "inner-agent" },
          },
        },
      },
      par: {
        parallel: {
          a: { agent: "par-agent" },
          b: { command: "echo" },
        },
      },
    });
    const refs = declaredAgentRefs(spec);
    assert.ok(refs.includes("outer-agent"));
    assert.ok(refs.includes("inner-agent"));
    assert.ok(refs.includes("par-agent"));
  });

  it("declaredSchemaRefs extracts output.schema and artifact.schema paths", () => {
    const spec = makeSpec({
      s1: { agent: "a", output: { schema: "schemas/findings.schema.json" } },
      s2: { command: "echo", output: { schema: "schemas/results.schema.json" } },
    }, {
      artifacts: {
        report: { path: "./report.json", from: "steps.s1.output", schema: "schemas/report.schema.json" },
      },
    });
    const refs = declaredSchemaRefs(spec);
    assert.ok(refs.includes("schemas/findings.schema.json"));
    assert.ok(refs.includes("schemas/results.schema.json"));
    assert.ok(refs.includes("schemas/report.schema.json"));
    assert.strictEqual(refs.length, 3);
  });
});
