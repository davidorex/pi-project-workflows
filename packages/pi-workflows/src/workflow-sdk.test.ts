import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import type { StepSpec, WorkflowSpec } from "./types.js";
import {
	availableAgents,
	availableSchemas,
	availableTemplates,
	declaredAgentRefs,
	declaredSchemaRefs,
	declaredSteps,
	expressionRoots,
	extractExpressions,
	FILTER_NAMES,
	filterNames,
	STEP_TYPES,
	stepTypes,
	validateWorkflow,
} from "./workflow-sdk.js";

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
