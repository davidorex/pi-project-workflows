import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import type { StepSpec, WorkflowSpec } from "./types.js";
import {
	agentContracts,
	availableAgents,
	availableSchemas,
	availableTemplates,
	declaredAgentRefs,
	declaredMonitorRefs,
	declaredSchemaRefs,
	declaredSteps,
	expressionRoots,
	extractExpressions,
	FILTER_NAMES,
	filterNames,
	STEP_TYPES,
	stepTypes,
	validateWorkflow,
	validationChecks,
} from "./workflow-sdk.js";
import { parseWorkflowSpec } from "./workflow-spec.js";

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
		const fromFn = stepTypes()
			.map((t) => t.field)
			.sort();
		const fromExport = STEP_TYPES.map((t) => t.field).sort();
		assert.deepStrictEqual(fromFn, fromExport);
	});

	it("expressionRoots includes input and steps", () => {
		const roots = expressionRoots();
		assert.ok(roots.includes("input"));
		assert.ok(roots.includes("steps"));
	});
});

describe("validationChecks", () => {
	it("returns descriptors for all validation checks", () => {
		const checks = validationChecks();
		assert.strictEqual(checks.length, 11);
	});

	it("each descriptor has required fields", () => {
		const checks = validationChecks();
		for (const c of checks) {
			assert.ok(typeof c.id === "string", `id should be string, got ${typeof c.id}`);
			assert.ok(typeof c.name === "string", `name should be string, got ${typeof c.name}`);
			assert.ok(
				c.severity === "error" || c.severity === "warning",
				`severity should be 'error' or 'warning', got '${c.severity}'`,
			);
			assert.ok(typeof c.description === "string", `description should be string, got ${typeof c.description}`);
		}
	});

	it("IDs are unique", () => {
		const checks = validationChecks();
		assert.strictEqual(new Set(checks.map((c) => c.id)).size, checks.length);
	});

	it("includes the four new checks", () => {
		const checks = validationChecks();
		const ids = checks.map((c) => c.id);
		assert.ok(ids.includes("steptype-metadata"), "should include steptype-metadata");
		assert.ok(ids.includes("inputschema-required"), "should include inputschema-required");
		assert.ok(ids.includes("contextblocks-existence"), "should include contextblocks-existence");
		assert.ok(ids.includes("template-alignment"), "should include template-alignment");
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
		assert.ok(agents.some((a) => a.name === "test-agent"));
	});

	it("availableAgents skips malformed YAML", (t) => {
		const tmpDir = makeTmpDir("agents-bad");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const agentDir = path.join(tmpDir, ".pi", "agents");
		fs.mkdirSync(agentDir, { recursive: true });
		fs.writeFileSync(path.join(agentDir, "good.agent.yaml"), "name: good\ntools: [read]\n");
		fs.writeFileSync(path.join(agentDir, "bad.agent.yaml"), ":::invalid yaml{{{\n");

		const agents = availableAgents(tmpDir, "/nonexistent");
		assert.ok(agents.some((a) => a.name === "good"));
		assert.ok(!agents.some((a) => a.name === "bad"));
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

	it("availableSchemas finds builtin schemas", (t) => {
		const tmpDir = makeTmpDir("schemas");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const schemasDir = path.join(tmpDir, "test-schemas");
		fs.mkdirSync(schemasDir, { recursive: true });
		fs.writeFileSync(path.join(schemasDir, "result.schema.json"), "{}");

		const schemas = availableSchemas(tmpDir, schemasDir);
		assert.ok(schemas.some((s) => s.includes("result.schema.json")));
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
		assert.ok(exprs.some((e) => e.stepRefs.includes("load")));
	});

	it("extractExpressions finds filter names", () => {
		const spec = makeSpec({
			s1: { agent: "coder", input: "Data: ${{ steps.load.output | json }}" },
		});
		const exprs = extractExpressions(spec);
		const jsonExpr = exprs.find((e) => e.filterName === "json");
		assert.ok(jsonExpr);
	});

	it("extractExpressions scans when, forEach, command, gate.check, completion", () => {
		const spec = makeSpec(
			{
				load: { command: "echo '${{ input.x }}'" },
				check: { gate: { check: "test '${{ steps.load.output.ok }}' = 'true'" } },
				iter: { agent: "a", forEach: "${{ steps.load.output.items }}", as: "item" },
				cond: { agent: "b", when: "${{ steps.check.output.passed }}" },
			},
			{
				completion: {
					message: "Done: ${{ steps.iter.output | json }}",
					include: ["steps.load.output"],
				},
			},
		);
		const exprs = extractExpressions(spec);
		const fields = exprs.map((e) => e.field);
		assert.ok(fields.some((f) => f.includes("command")));
		assert.ok(fields.some((f) => f.includes("gate.check")));
		assert.ok(fields.some((f) => f.includes("forEach")));
		assert.ok(fields.some((f) => f.includes("when")));
		assert.ok(fields.some((f) => f.includes("completion.message")));
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
		assert.ok(exprs.some((e) => e.field.includes("loop.steps.inner")));
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

	it("declaredMonitorRefs extracts monitor names", () => {
		const spec = makeSpec({
			impl: { agent: "builder" },
			check: { monitor: "work-quality" },
			verify: { monitor: "fragility" },
		});
		const refs = declaredMonitorRefs(spec);
		assert.ok(refs.includes("work-quality"));
		assert.ok(refs.includes("fragility"));
		assert.strictEqual(refs.length, 2);
	});

	it("declaredMonitorRefs finds monitors in nested loop/parallel", () => {
		const spec = makeSpec({
			outer: {
				agent: "a",
				loop: {
					maxAttempts: 2,
					steps: {
						inner: { monitor: "nested-check" },
					},
				},
			},
			par: {
				parallel: {
					a: { monitor: "par-check" },
					b: { agent: "b" },
				},
			},
		});
		const refs = declaredMonitorRefs(spec);
		assert.ok(refs.includes("nested-check"));
		assert.ok(refs.includes("par-check"));
	});

	it("declaredSchemaRefs extracts output.schema and artifact.schema paths", () => {
		const spec = makeSpec(
			{
				s1: { agent: "a", output: { schema: "schemas/findings.schema.json" } },
				s2: { command: "echo", output: { schema: "schemas/results.schema.json" } },
			},
			{
				artifacts: {
					report: { path: "./report.json", from: "steps.s1.output", schema: "schemas/report.schema.json" },
				},
			},
		);
		const refs = declaredSchemaRefs(spec);
		assert.ok(refs.includes("schemas/findings.schema.json"));
		assert.ok(refs.includes("schemas/results.schema.json"));
		assert.ok(refs.includes("schemas/report.schema.json"));
		assert.strictEqual(refs.length, 3);
	});
});

// ── Validation ───────────────────────────────────────────────────────────────

describe("validateWorkflow", () => {
	it("valid workflow with no agent/schema refs passes", () => {
		const spec = makeSpec({
			greet: { command: "echo hello" },
			process: { transform: { mapping: { result: "${{ steps.greet.output }}" } } },
		});
		const result = validateWorkflow(spec, "/tmp");
		assert.strictEqual(result.valid, true);
		assert.strictEqual(result.issues.length, 0);
	});

	it("reports error for non-existent agent", () => {
		const spec = makeSpec({
			investigate: { agent: "nonexistent-agent-xyz" },
		});
		const result = validateWorkflow(spec, "/tmp");
		assert.strictEqual(result.valid, false);
		const agentIssues = result.issues.filter((i) => i.message.includes("nonexistent-agent-xyz"));
		assert.ok(agentIssues.length > 0);
		assert.strictEqual(agentIssues[0].severity, "error");
		assert.ok(agentIssues[0].field.includes("agent"));
	});

	it("reports error for non-existent schema file", () => {
		const spec = makeSpec({
			analyze: {
				agent: "investigator",
				output: { schema: "schemas/does-not-exist.schema.json" },
			},
		});
		// Use a cwd that has the bundled agents but not this schema
		const result = validateWorkflow(spec, "/tmp");
		const schemaIssues = result.issues.filter((i) => i.message.includes("Schema file not found"));
		assert.ok(schemaIssues.length > 0);
		assert.strictEqual(schemaIssues[0].severity, "error");
	});

	it("reports error for expression referencing undeclared step", () => {
		const spec = makeSpec({
			analyze: {
				command: "echo hello",
				input: { data: "${{ steps.nonexistent.output }}" },
			},
		});
		const result = validateWorkflow(spec, "/tmp");
		assert.strictEqual(result.valid, false);
		const stepIssues = result.issues.filter((i) => i.message.includes("undeclared step"));
		assert.ok(stepIssues.length > 0);
		assert.strictEqual(stepIssues[0].severity, "error");
	});

	it("reports error for forward step reference", () => {
		const spec = makeSpec({
			first: {
				command: "echo",
				input: { data: "${{ steps.second.output }}" },
			},
			second: { command: "echo hello" },
		});
		const result = validateWorkflow(spec, "/tmp");
		const orderIssues = result.issues.filter((i) => i.message.includes("declared at or after"));
		assert.ok(orderIssues.length > 0);
		assert.strictEqual(orderIssues[0].severity, "error");
	});

	it("reports error for context referencing undeclared step", () => {
		const spec = makeSpec({
			fix: {
				agent: "fixer",
				context: ["nonexistent"],
			},
		});
		const result = validateWorkflow(spec, "/tmp");
		assert.strictEqual(result.valid, false);
		const ctxIssues = result.issues.filter((i) => i.message.includes("context") && i.message.includes("undeclared"));
		assert.ok(ctxIssues.length > 0);
		assert.strictEqual(ctxIssues[0].severity, "error");
		assert.ok(ctxIssues[0].field.includes("context"));
	});

	it("passes for context referencing valid step", () => {
		const spec = makeSpec({
			scan: { command: "echo hello" },
			fix: {
				agent: "fixer",
				context: ["scan"],
			},
		});
		const result = validateWorkflow(spec, "/tmp");
		const ctxIssues = result.issues.filter((i) => i.field?.includes("context"));
		assert.strictEqual(ctxIssues.length, 0);
	});

	it("reports warning for unknown filter name", () => {
		const spec = makeSpec({
			load: { command: "echo hello" },
			show: {
				transform: { mapping: { result: "${{ steps.load.output | bogusfilter }}" } },
			},
		});
		const result = validateWorkflow(spec, "/tmp");
		const filterIssues = result.issues.filter((i) => i.message.includes("Unknown filter"));
		assert.ok(filterIssues.length > 0);
		assert.strictEqual(filterIssues[0].severity, "warning");
		// Warnings don't make it invalid
		assert.strictEqual(result.valid, true);
	});

	it("valid agents from bundled dir resolve correctly", (t) => {
		// Use the actual package's agents dir
		const cwd = makeTmpDir("validate-agents");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		const spec = makeSpec(
			{ investigate: { agent: "investigator" } },
			{ filePath: path.join(cwd, "test.workflow.yaml") },
		);
		const result = validateWorkflow(spec, cwd);
		// The bundled investigator agent should resolve
		const agentErrors = result.issues.filter((i) => i.message.includes("Agent") && i.severity === "error");
		assert.strictEqual(agentErrors.length, 0);
	});
});

// ── StepType Metadata Validation ─────────────────────────────────────────────

describe("StepType metadata validation", () => {
	it("reports error for retry on non-retryable step type", () => {
		const spec = makeSpec({
			check: { gate: { check: "test -f /tmp/flag" }, retry: { maxAttempts: 3 } },
		});
		const result = validateWorkflow(spec, "/tmp");
		const issues = result.issues.filter((i) => i.message.includes("not retryable"));
		assert.ok(issues.length > 0);
		assert.strictEqual(issues[0].severity, "error");
	});

	it("allows retry on retryable step type", () => {
		const spec = makeSpec({
			investigate: { agent: "investigator", retry: { maxAttempts: 3 } },
		});
		const result = validateWorkflow(spec, "/tmp");
		const retryIssues = result.issues.filter((i) => i.message.includes("not retryable"));
		assert.strictEqual(retryIssues.length, 0);
	});

	it("reports warning for input on step type that does not support it", () => {
		const spec = makeSpec({
			check: { gate: { check: "test -f /tmp/flag" }, input: { x: "y" } },
		});
		const result = validateWorkflow(spec, "/tmp");
		const issues = result.issues.filter((i) => i.message.includes("does not support input"));
		assert.ok(issues.length > 0);
		assert.strictEqual(issues[0].severity, "warning");
	});

	it("reports warning for output on step type that does not support it", () => {
		const spec = makeSpec({
			wait: { pause: true, output: { format: "json" } },
		});
		const result = validateWorkflow(spec, "/tmp");
		const issues = result.issues.filter((i) => i.message.includes("does not support output"));
		assert.ok(issues.length > 0);
		assert.strictEqual(issues[0].severity, "warning");
	});

	it("no type-metadata issues for agent step with input and output", () => {
		const spec = makeSpec({
			investigate: {
				agent: "investigator",
				input: { topic: "security" },
				output: { format: "json" },
			},
		});
		const result = validateWorkflow(spec, "/tmp");
		const metaIssues = result.issues.filter(
			(i) => i.message.includes("not retryable") || i.message.includes("does not support"),
		);
		assert.strictEqual(metaIssues.length, 0);
	});

	it("reports warning for input on transform step", () => {
		const spec = makeSpec({
			process: {
				transform: { mapping: { result: "${{ input.x }}" } },
				input: { x: "z" },
			},
		});
		const result = validateWorkflow(spec, "/tmp");
		const issues = result.issues.filter((i) => i.message.includes("does not support input"));
		assert.ok(issues.length > 0);
		assert.strictEqual(issues[0].severity, "warning");
	});
});

// ── inputSchema Validation ────────────────────────────────────────────────────

describe("inputSchema validation", () => {
	it("no error when step provides all required input keys", (t) => {
		const tmpDir = makeTmpDir("inputschema-pass");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const agentDir = path.join(tmpDir, ".pi", "agents");
		fs.mkdirSync(agentDir, { recursive: true });
		fs.writeFileSync(
			path.join(agentDir, "typed-agent.agent.yaml"),
			`${[
				"name: typed-agent",
				"tools: [read]",
				"input:",
				"  type: object",
				"  required:",
				"    - topic",
				"  properties:",
				"    topic:",
				"      type: string",
				"    depth:",
				"      type: number",
			].join("\n")}\n`,
		);

		const spec = makeSpec(
			{
				run: { agent: "typed-agent", input: { topic: "${{ input.topic }}" } },
			},
			{ filePath: path.join(tmpDir, "test.workflow.yaml") },
		);
		const result = validateWorkflow(spec, tmpDir);
		const inputSchemaIssues = result.issues.filter((i) => i.message.includes("missing required input"));
		assert.strictEqual(inputSchemaIssues.length, 0);
	});

	it("reports error when step is missing required input key", (t) => {
		const tmpDir = makeTmpDir("inputschema-missing");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const agentDir = path.join(tmpDir, ".pi", "agents");
		fs.mkdirSync(agentDir, { recursive: true });
		fs.writeFileSync(
			path.join(agentDir, "typed-agent.agent.yaml"),
			`${[
				"name: typed-agent",
				"tools: [read]",
				"input:",
				"  type: object",
				"  required:",
				"    - topic",
				"    - format",
				"  properties:",
				"    topic:",
				"      type: string",
				"    format:",
				"      type: string",
			].join("\n")}\n`,
		);

		const spec = makeSpec(
			{
				run: { agent: "typed-agent", input: { topic: "${{ input.topic }}" } },
			},
			{ filePath: path.join(tmpDir, "test.workflow.yaml") },
		);
		const result = validateWorkflow(spec, tmpDir);
		const inputSchemaIssues = result.issues.filter((i) => i.message.includes("missing required input"));
		assert.ok(inputSchemaIssues.length > 0);
		assert.ok(inputSchemaIssues.some((i) => i.message.includes("format")));
		assert.strictEqual(inputSchemaIssues[0].severity, "error");
	});

	it("reports error when step has no input but agent requires fields", (t) => {
		const tmpDir = makeTmpDir("inputschema-noinput");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const agentDir = path.join(tmpDir, ".pi", "agents");
		fs.mkdirSync(agentDir, { recursive: true });
		fs.writeFileSync(
			path.join(agentDir, "typed-agent.agent.yaml"),
			`${[
				"name: typed-agent",
				"tools: [read]",
				"input:",
				"  type: object",
				"  required:",
				"    - topic",
				"  properties:",
				"    topic:",
				"      type: string",
			].join("\n")}\n`,
		);

		const spec = makeSpec(
			{
				run: { agent: "typed-agent" },
			},
			{ filePath: path.join(tmpDir, "test.workflow.yaml") },
		);
		const result = validateWorkflow(spec, tmpDir);
		const inputSchemaIssues = result.issues.filter((i) => i.message.includes("missing required input"));
		assert.ok(inputSchemaIssues.length > 0);
		assert.ok(inputSchemaIssues.some((i) => i.message.includes("topic")));
		assert.strictEqual(inputSchemaIssues[0].severity, "error");
	});

	it("no error when agent has no inputSchema", (t) => {
		const tmpDir = makeTmpDir("inputschema-untyped");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const agentDir = path.join(tmpDir, ".pi", "agents");
		fs.mkdirSync(agentDir, { recursive: true });
		fs.writeFileSync(
			path.join(agentDir, "untyped-agent.agent.yaml"),
			`${["name: untyped-agent", "tools: [read]"].join("\n")}\n`,
		);

		const spec = makeSpec(
			{
				run: { agent: "untyped-agent", input: { anything: "goes" } },
			},
			{ filePath: path.join(tmpDir, "test.workflow.yaml") },
		);
		const result = validateWorkflow(spec, tmpDir);
		const inputSchemaIssues = result.issues.filter((i) => i.message.includes("missing required input"));
		assert.strictEqual(inputSchemaIssues.length, 0);
	});

	it("no error when inputSchema has no required array", (t) => {
		const tmpDir = makeTmpDir("inputschema-norequired");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const agentDir = path.join(tmpDir, ".pi", "agents");
		fs.mkdirSync(agentDir, { recursive: true });
		fs.writeFileSync(
			path.join(agentDir, "optional-agent.agent.yaml"),
			`${[
				"name: optional-agent",
				"tools: [read]",
				"input:",
				"  type: object",
				"  properties:",
				"    x:",
				"      type: string",
			].join("\n")}\n`,
		);

		const spec = makeSpec(
			{
				run: { agent: "optional-agent", input: {} },
			},
			{ filePath: path.join(tmpDir, "test.workflow.yaml") },
		);
		const result = validateWorkflow(spec, tmpDir);
		const inputSchemaIssues = result.issues.filter((i) => i.message.includes("missing required input"));
		assert.strictEqual(inputSchemaIssues.length, 0);
	});
});

// ── contextBlocks Validation ─────────────────────────────────────────────────

describe("contextBlocks validation", () => {
	it("no issue when contextBlocks blocks exist in .project/", (t) => {
		const tmpDir = makeTmpDir("ctx-blocks-pass");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const agentsDir = path.join(tmpDir, ".pi", "agents");
		fs.mkdirSync(agentsDir, { recursive: true });
		fs.writeFileSync(
			path.join(agentsDir, "ctx-agent.agent.yaml"),
			"name: ctx-agent\ntools: [read]\ncontextBlocks: [conventions]\n",
		);

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		fs.writeFileSync(path.join(projectDir, "conventions.json"), "{}");

		const spec = makeSpec({ run: { agent: "ctx-agent" } }, { filePath: path.join(tmpDir, "test.workflow.yaml") });
		const result = validateWorkflow(spec, tmpDir);
		const ctxIssues = result.issues.filter(
			(i) => i.message.includes("contextBlocks") || i.message.includes("Context block"),
		);
		assert.strictEqual(ctxIssues.length, 0);
	});

	it("warns when contextBlocks block file is missing", (t) => {
		const tmpDir = makeTmpDir("ctx-blocks-missing");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const agentsDir = path.join(tmpDir, ".pi", "agents");
		fs.mkdirSync(agentsDir, { recursive: true });
		fs.writeFileSync(
			path.join(agentsDir, "ctx-agent.agent.yaml"),
			"name: ctx-agent\ntools: [read]\ncontextBlocks: [conventions]\n",
		);

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		// No conventions.json created

		const spec = makeSpec({ run: { agent: "ctx-agent" } }, { filePath: path.join(tmpDir, "test.workflow.yaml") });
		const result = validateWorkflow(spec, tmpDir);
		const ctxIssues = result.issues.filter((i) => i.message.includes("conventions") && i.message.includes("not found"));
		assert.ok(ctxIssues.length > 0);
		assert.strictEqual(ctxIssues[0].severity, "warning");
	});

	it("warns when no .project/ directory exists", (t) => {
		const tmpDir = makeTmpDir("ctx-blocks-noproject");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const agentsDir = path.join(tmpDir, ".pi", "agents");
		fs.mkdirSync(agentsDir, { recursive: true });
		fs.writeFileSync(
			path.join(agentsDir, "ctx-agent.agent.yaml"),
			"name: ctx-agent\ntools: [read]\ncontextBlocks: [conventions]\n",
		);
		// No .project/ directory created

		const spec = makeSpec({ run: { agent: "ctx-agent" } }, { filePath: path.join(tmpDir, "test.workflow.yaml") });
		const result = validateWorkflow(spec, tmpDir);
		const ctxIssues = result.issues.filter((i) => i.message.includes(".project"));
		assert.ok(ctxIssues.length > 0);
		assert.strictEqual(ctxIssues[0].severity, "warning");
	});

	it("no issue when agent has no contextBlocks", (t) => {
		const tmpDir = makeTmpDir("ctx-blocks-none");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const agentsDir = path.join(tmpDir, ".pi", "agents");
		fs.mkdirSync(agentsDir, { recursive: true });
		fs.writeFileSync(path.join(agentsDir, "plain-agent.agent.yaml"), "name: plain-agent\ntools: [read]\n");

		const spec = makeSpec({ run: { agent: "plain-agent" } }, { filePath: path.join(tmpDir, "test.workflow.yaml") });
		const result = validateWorkflow(spec, tmpDir);
		const ctxIssues = result.issues.filter(
			(i) => i.message.includes("contextBlocks") || i.message.includes("Context block"),
		);
		assert.strictEqual(ctxIssues.length, 0);
	});

	it("warns only for missing blocks when some exist", (t) => {
		const tmpDir = makeTmpDir("ctx-blocks-partial");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const agentsDir = path.join(tmpDir, ".pi", "agents");
		fs.mkdirSync(agentsDir, { recursive: true });
		fs.writeFileSync(
			path.join(agentsDir, "ctx-agent.agent.yaml"),
			"name: ctx-agent\ntools: [read]\ncontextBlocks: [conventions, requirements]\n",
		);

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		fs.writeFileSync(path.join(projectDir, "conventions.json"), "{}");
		// No requirements.json created

		const spec = makeSpec({ run: { agent: "ctx-agent" } }, { filePath: path.join(tmpDir, "test.workflow.yaml") });
		const result = validateWorkflow(spec, tmpDir);
		const ctxIssues = result.issues.filter(
			(i) => i.message.includes("Context block") && i.message.includes("not found"),
		);
		assert.strictEqual(ctxIssues.length, 1);
		assert.ok(ctxIssues[0].message.includes("requirements"));
		assert.strictEqual(ctxIssues[0].severity, "warning");
	});
});

// ── agentContracts ──────────────────────────────────────────────────────────

describe("agentContracts", () => {
	const pkgDir = path.resolve(import.meta.dirname, "..");

	it("returns contracts for bundled agents", () => {
		const contracts = agentContracts(pkgDir);
		assert.ok(contracts.length > 0, "should return at least one contract");
		for (const c of contracts) {
			assert.ok(typeof c.name === "string", "each contract should have a string name");
		}
	});

	it("includes inputSchema with required and properties for typed agents", () => {
		const contracts = agentContracts(pkgDir);
		const taskWorker = contracts.find((c) => c.name === "task-worker");
		assert.ok(taskWorker, "should find task-worker agent");
		assert.ok(taskWorker.inputSchema, "task-worker should have inputSchema");
		assert.ok(taskWorker.inputSchema!.required.includes("task"), "inputSchema.required should include 'task'");
		assert.ok(taskWorker.inputSchema!.properties.includes("task"), "inputSchema.properties should include 'task'");
		assert.ok(
			taskWorker.inputSchema!.properties.includes("context"),
			"inputSchema.properties should include 'context'",
		);
	});

	it("returns undefined inputSchema for agents without it", () => {
		const contracts = agentContracts(pkgDir);
		// investigator is a bundled agent that has no input: field
		const investigator = contracts.find((c) => c.name === "investigator");
		assert.ok(investigator, "should find investigator agent");
		assert.strictEqual(investigator.inputSchema, undefined, "investigator should have no inputSchema");
	});

	it("includes contextBlocks when declared", (t) => {
		const tmpDir = makeTmpDir("contracts-ctx");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const agentDir = path.join(tmpDir, ".pi", "agents");
		fs.mkdirSync(agentDir, { recursive: true });
		fs.writeFileSync(
			path.join(agentDir, "ctx-agent.agent.yaml"),
			"name: ctx-agent\ntools: [read]\ncontextBlocks: [conventions, requirements]\n",
		);

		const contracts = agentContracts(tmpDir);
		const ctxAgent = contracts.find((c) => c.name === "ctx-agent");
		assert.ok(ctxAgent, "should find ctx-agent");
		assert.deepStrictEqual(ctxAgent.contextBlocks, ["conventions", "requirements"]);
	});

	it("result is sorted by name", () => {
		const contracts = agentContracts(pkgDir);
		const names = contracts.map((c) => c.name);
		const sorted = [...names].sort((a, b) => a.localeCompare(b));
		assert.deepStrictEqual(names, sorted, "contracts should be sorted by name");
	});
});

// ── Bundled Workflow Validation ─────────────────────────────────────────────

describe("execute-task workflow validation", () => {
	const workflowPath = path.resolve(import.meta.dirname, "..", "workflows", "execute-task.workflow.yaml");
	const pkgDir = path.resolve(import.meta.dirname, "..");

	it("parses and validates with no error-severity issues", () => {
		const yaml = fs.readFileSync(workflowPath, "utf-8");
		const spec = parseWorkflowSpec(yaml, workflowPath, "project");
		const result = validateWorkflow(spec, pkgDir);
		const errors = result.issues.filter((i) => i.severity === "error");
		assert.strictEqual(errors.length, 0, `Unexpected validation errors: ${JSON.stringify(errors, null, 2)}`);
		assert.strictEqual(result.valid, true);
	});

	it("references task-worker and task-verifier agents that resolve", () => {
		const yaml = fs.readFileSync(workflowPath, "utf-8");
		const spec = parseWorkflowSpec(yaml, workflowPath, "project");
		const agentRefs = declaredAgentRefs(spec);
		assert.ok(agentRefs.includes("task-worker"), "should reference task-worker agent");
		assert.ok(agentRefs.includes("task-verifier"), "should reference task-verifier agent");

		// Validate that both agents actually resolve (no agent-related errors)
		const result = validateWorkflow(spec, pkgDir);
		const agentErrors = result.issues.filter((i) => i.message.includes("Agent") && i.severity === "error");
		assert.strictEqual(agentErrors.length, 0, `Agent resolution errors: ${JSON.stringify(agentErrors, null, 2)}`);
	});
});
