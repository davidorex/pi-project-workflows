import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import nunjucks from "nunjucks";
import {
	addUsage,
	buildPrompt,
	compileAgentSpec,
	DEFAULT_MAX_ATTEMPTS,
	persistStep,
	resolveSchemaPath,
	SIGKILL_GRACE_MS,
	WIDGET_ID,
	zeroUsage,
} from "./step-shared.js";
import type { AgentSpec, ExecutionState, StepResult, StepUsage } from "./types.js";

describe("constants", () => {
	it("SIGKILL_GRACE_MS is 3000", () => {
		assert.strictEqual(SIGKILL_GRACE_MS, 3000);
	});

	it("WIDGET_ID is 'workflow-progress'", () => {
		assert.strictEqual(WIDGET_ID, "workflow-progress");
	});

	it("DEFAULT_MAX_ATTEMPTS is 3", () => {
		assert.strictEqual(DEFAULT_MAX_ATTEMPTS, 3);
	});
});

describe("zeroUsage", () => {
	it("returns all-zero StepUsage with correct keys", () => {
		const u = zeroUsage();
		assert.strictEqual(u.input, 0);
		assert.strictEqual(u.output, 0);
		assert.strictEqual(u.cacheRead, 0);
		assert.strictEqual(u.cacheWrite, 0);
		assert.strictEqual(u.cost, 0);
		assert.strictEqual(u.turns, 0);
		assert.deepStrictEqual(Object.keys(u).sort(), ["cacheRead", "cacheWrite", "cost", "input", "output", "turns"]);
	});

	it("returns a fresh object each call (no shared reference)", () => {
		const a = zeroUsage();
		const b = zeroUsage();
		assert.notStrictEqual(a, b);
		a.input = 999;
		assert.strictEqual(b.input, 0);
	});
});

describe("addUsage", () => {
	it("accumulates all six fields into total", () => {
		const total = zeroUsage();
		const step: StepUsage = { input: 10, output: 20, cacheRead: 30, cacheWrite: 40, cost: 0.5, turns: 2 };
		addUsage(total, step);
		assert.strictEqual(total.input, 10);
		assert.strictEqual(total.output, 20);
		assert.strictEqual(total.cacheRead, 30);
		assert.strictEqual(total.cacheWrite, 40);
		assert.strictEqual(total.cost, 0.5);
		assert.strictEqual(total.turns, 2);
	});

	it("handles adding zero usage (no change)", () => {
		const total: StepUsage = { input: 5, output: 10, cacheRead: 15, cacheWrite: 20, cost: 0.1, turns: 1 };
		addUsage(total, zeroUsage());
		assert.strictEqual(total.input, 5);
		assert.strictEqual(total.output, 10);
		assert.strictEqual(total.cacheRead, 15);
		assert.strictEqual(total.cacheWrite, 20);
		assert.strictEqual(total.cost, 0.1);
		assert.strictEqual(total.turns, 1);
	});

	it("accumulates across multiple additions", () => {
		const total = zeroUsage();
		addUsage(total, { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, cost: 0.1, turns: 1 });
		addUsage(total, { input: 20, output: 15, cacheRead: 5, cacheWrite: 3, cost: 0.2, turns: 2 });
		addUsage(total, { input: 30, output: 25, cacheRead: 10, cacheWrite: 7, cost: 0.3, turns: 3 });
		assert.strictEqual(total.input, 60);
		assert.strictEqual(total.output, 45);
		assert.strictEqual(total.cacheRead, 15);
		assert.strictEqual(total.cacheWrite, 10);
		assert.strictEqual(total.cost, 0.1 + 0.2 + 0.3);
		assert.strictEqual(total.turns, 6);
	});
});

describe("resolveSchemaPath", () => {
	it("returns absolute path unchanged", () => {
		assert.strictEqual(resolveSchemaPath("/abs/path/schema.json", "/some/spec.yaml"), "/abs/path/schema.json");
	});

	it("resolves relative path against spec file directory", () => {
		const result = resolveSchemaPath("schema.json", "/project/specs/workflow.yaml");
		assert.strictEqual(result, path.resolve("/project/specs", "schema.json"));
	});

	it("handles spec file in nested directory", () => {
		const result = resolveSchemaPath("schemas/output.json", "/a/b/c/spec.yaml");
		assert.strictEqual(result, path.resolve("/a/b/c", "schemas/output.json"));
	});

	it("handles schema path with parent traversal (../schemas/out.json)", () => {
		const result = resolveSchemaPath("../schemas/out.json", "/project/specs/workflow.yaml");
		assert.strictEqual(result, path.resolve("/project/specs", "../schemas/out.json"));
	});

	it("resolves block: prefix to .project/schemas/<name>.schema.json from cwd", () => {
		const result = resolveSchemaPath("block:project", "/any/spec.yaml", "/my/project");
		assert.strictEqual(result, path.join("/my/project", ".project", "schemas", "project.schema.json"));
	});

	it("resolves block: prefix with hyphenated name", () => {
		const result = resolveSchemaPath("block:conformance-reference", "/any/spec.yaml", "/cwd");
		assert.strictEqual(result, path.join("/cwd", ".project", "schemas", "conformance-reference.schema.json"));
	});

	it("block: prefix falls back to process.cwd when cwd not provided", () => {
		const result = resolveSchemaPath("block:gaps", "/any/spec.yaml");
		assert.strictEqual(result, path.join(process.cwd(), ".project", "schemas", "gaps.schema.json"));
	});

	it("non-block relative paths are unaffected by cwd parameter", () => {
		const result = resolveSchemaPath("schemas/out.json", "/a/b/spec.yaml", "/some/cwd");
		assert.strictEqual(result, path.resolve("/a/b", "schemas/out.json"));
	});
});

describe("buildPrompt", () => {
	it("includes task template when agentSpec.taskTemplate is set", () => {
		const step = { agent: "test" };
		const agentSpec: AgentSpec = { name: "test", taskTemplate: "Do this task with {{ data }}" };
		const prompt = buildPrompt(step, agentSpec, {}, "/tmp/run", "step1");
		assert.ok(prompt.includes("Do this task with {{ data }}"));
	});

	it("serializes non-empty object input as JSON code block when no task template", () => {
		const step = { agent: "test" };
		const agentSpec: AgentSpec = { name: "test" };
		const prompt = buildPrompt(step, agentSpec, { key: "value" }, "/tmp/run", "step1");
		assert.ok(prompt.includes("## Input"));
		assert.ok(prompt.includes("```json"));
		assert.ok(prompt.includes('"key": "value"'));
		assert.ok(prompt.includes("```"));
	});

	it("passes through string input directly when no task template", () => {
		const step = { agent: "test" };
		const agentSpec: AgentSpec = { name: "test" };
		const prompt = buildPrompt(step, agentSpec, "raw string input", "/tmp/run", "step1");
		assert.ok(prompt.includes("raw string input"));
		assert.ok(!prompt.includes("## Input"));
	});

	it("produces empty-ish prompt for empty object input with no task template", () => {
		const step = { agent: "test" };
		const agentSpec: AgentSpec = { name: "test" };
		const prompt = buildPrompt(step, agentSpec, {}, "/tmp/run", "step1");
		assert.ok(!prompt.includes("## Input"));
		assert.ok(!prompt.includes("```json"));
	});

	it("appends output instructions when output.format is json", () => {
		const step = { agent: "test", output: { format: "json" as const } };
		const agentSpec: AgentSpec = { name: "test" };
		const prompt = buildPrompt(step, agentSpec, {}, "/tmp/run", "step1");
		assert.ok(prompt.includes("**Output:**"));
		assert.ok(prompt.includes("step1.json"));
	});

	it("appends output instructions with schema path when output.schema is set", () => {
		const step = { agent: "test", output: { schema: "schemas/out.json" } };
		const agentSpec: AgentSpec = { name: "test" };
		const prompt = buildPrompt(step, agentSpec, {}, "/tmp/run", "step1");
		assert.ok(prompt.includes("**Output:**"));
		assert.ok(prompt.includes("JSON Schema"));
		assert.ok(prompt.includes("schemas/out.json"));
	});

	it("omits output instructions when no output spec", () => {
		const step = { agent: "test" };
		const agentSpec: AgentSpec = { name: "test" };
		const prompt = buildPrompt(step, agentSpec, {}, "/tmp/run", "step1");
		assert.ok(!prompt.includes("**Output:**"));
	});

	it("combines task template with output instructions", () => {
		const step = { agent: "test", output: { format: "json" as const } };
		const agentSpec: AgentSpec = { name: "test", taskTemplate: "Analyze this" };
		const prompt = buildPrompt(step, agentSpec, {}, "/tmp/run", "step1");
		assert.ok(prompt.includes("Analyze this"));
		assert.ok(prompt.includes("**Output:**"));
	});
});

describe("persistStep", () => {
	it("writes result into state.steps[stepName]", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-persist-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const state: ExecutionState = { input: {}, steps: {}, status: "running" };
		const result: StepResult = {
			step: "myStep",
			agent: "test-agent",
			status: "completed",
			usage: zeroUsage(),
			durationMs: 100,
		};
		const widgetState = {
			spec: { name: "test", description: "", steps: {}, source: "project" as const, filePath: "" },
			state,
			startTime: Date.now(),
		};
		const ctx = { hasUI: false, ui: { setWidget: () => {}, notify: () => {} } };

		persistStep(state, "myStep", result, tmpDir, widgetState, ctx);
		assert.strictEqual(state.steps.myStep, result);
	});

	it("calls writeState (state.json is written to disk)", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-persist-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const state: ExecutionState = { input: {}, steps: {}, status: "running" };
		const result: StepResult = {
			step: "s1",
			agent: "agent",
			status: "completed",
			usage: zeroUsage(),
			durationMs: 50,
		};
		const widgetState = {
			spec: { name: "test", description: "", steps: {}, source: "project" as const, filePath: "" },
			state,
			startTime: Date.now(),
		};
		const ctx = { hasUI: false, ui: { setWidget: () => {}, notify: () => {} } };

		persistStep(state, "s1", result, tmpDir, widgetState, ctx);
		assert.ok(fs.existsSync(path.join(tmpDir, "state.json")));
		const written = JSON.parse(fs.readFileSync(path.join(tmpDir, "state.json"), "utf-8"));
		assert.ok(written.steps.s1);
		assert.strictEqual(written.steps.s1.status, "completed");
	});

	it("calls ctx.ui.setWidget when ctx.hasUI is true", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-persist-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const state: ExecutionState = { input: {}, steps: {}, status: "running" };
		const result: StepResult = {
			step: "s1",
			agent: "agent",
			status: "completed",
			usage: zeroUsage(),
			durationMs: 50,
		};
		const widgetState = {
			spec: { name: "test", description: "", steps: {}, source: "project" as const, filePath: "" },
			state,
			startTime: Date.now(),
		};
		let widgetCalled = false;
		const ctx = {
			hasUI: true,
			ui: {
				setWidget: (id: string, _w: unknown) => {
					widgetCalled = true;
					assert.strictEqual(id, WIDGET_ID);
				},
				notify: () => {},
			},
		};

		persistStep(state, "s1", result, tmpDir, widgetState, ctx);
		assert.ok(widgetCalled, "setWidget should have been called");
	});

	it("does not call ctx.ui.setWidget when ctx.hasUI is false", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-persist-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const state: ExecutionState = { input: {}, steps: {}, status: "running" };
		const result: StepResult = {
			step: "s1",
			agent: "agent",
			status: "completed",
			usage: zeroUsage(),
			durationMs: 50,
		};
		const widgetState = {
			spec: { name: "test", description: "", steps: {}, source: "project" as const, filePath: "" },
			state,
			startTime: Date.now(),
		};
		let widgetCalled = false;
		const ctx = {
			hasUI: false,
			ui: {
				setWidget: () => {
					widgetCalled = true;
				},
				notify: () => {},
			},
		};

		persistStep(state, "s1", result, tmpDir, widgetState, ctx);
		assert.ok(!widgetCalled, "setWidget should not have been called");
	});
});

describe("compileAgentSpec", () => {
	it("returns agentSpec unchanged when no templateEnv", () => {
		const agentSpec: AgentSpec = { name: "test", systemPrompt: "Hello {{ name }}" };
		const result = compileAgentSpec(agentSpec, { name: "world" });
		assert.strictEqual(result, agentSpec);
		assert.strictEqual(result.systemPrompt, "Hello {{ name }}");
	});

	it("renders inline systemPrompt through Nunjucks with input context", () => {
		const env = new nunjucks.Environment(undefined, { autoescape: false, throwOnUndefined: false });
		const agentSpec: AgentSpec = { name: "test", systemPrompt: "Hello {{ name }}" };
		const result = compileAgentSpec(agentSpec, { name: "world" }, env);
		assert.strictEqual(result.systemPrompt, "Hello world");
	});

	it("renders promptTemplate file path through Nunjucks (replaces with rendered text, clears promptTemplate)", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-compile-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		fs.writeFileSync(path.join(tmpDir, "system.md"), "System for {{ role }}");
		const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(tmpDir), {
			autoescape: false,
			throwOnUndefined: false,
		});

		const agentSpec: AgentSpec = { name: "test", promptTemplate: "system.md" };
		const result = compileAgentSpec(agentSpec, { role: "analyzer" }, env);
		assert.strictEqual(result.systemPrompt, "System for analyzer");
		assert.strictEqual(result.promptTemplate, undefined);
	});

	it("renders taskTemplate file path through Nunjucks", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-compile-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		fs.writeFileSync(path.join(tmpDir, "task.md"), "Analyze {{ target }}");
		const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(tmpDir), {
			autoescape: false,
			throwOnUndefined: false,
		});

		const agentSpec: AgentSpec = { name: "test", taskTemplate: "task.md" };
		const result = compileAgentSpec(agentSpec, { target: "codebase" }, env);
		assert.strictEqual(result.taskTemplate, "Analyze codebase");
	});

	it("handles non-object resolvedInput (uses empty context)", () => {
		const env = new nunjucks.Environment(undefined, { autoescape: false, throwOnUndefined: false });
		const agentSpec: AgentSpec = { name: "test", systemPrompt: "Hello {{ name }}" };
		const result = compileAgentSpec(agentSpec, "string input", env);
		// {{ name }} renders to "" with throwOnUndefined: false
		assert.strictEqual(result.systemPrompt, "Hello ");
	});

	it("handles null resolvedInput", () => {
		const env = new nunjucks.Environment(undefined, { autoescape: false, throwOnUndefined: false });
		const agentSpec: AgentSpec = { name: "test", systemPrompt: "Hello {{ name }}" };
		const result = compileAgentSpec(agentSpec, null, env);
		assert.strictEqual(result.systemPrompt, "Hello ");
	});
});
