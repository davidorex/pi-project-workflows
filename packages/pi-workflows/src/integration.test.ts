import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import nunjucks from "nunjucks";
import { createAgentLoader, parseAgentYaml } from "./agent-spec.js";
import { executeAgentStep } from "./step-agent.js";
import { compileAgentSpec } from "./step-shared.js";
import { createTemplateEnv } from "./template.js";
import type { AgentSpec, StepResult } from "./types.js";
import { executeWorkflow } from "./workflow-executor.js";
import { parseWorkflowSpec } from "./workflow-spec.js";

/**
 * Integration test: compilation pipeline proving contextBlocks + macros +
 * template inheritance + user-defined schemas work end-to-end.
 *
 * Creates a mock user project with .project/ blocks + schemas, writes
 * agent YAML specs and Nunjucks templates with inheritance, then asserts
 * the compiled systemPrompt contains data from every layer.
 */

const CONFORMANCE_SCHEMA_SRC = path.resolve(
	import.meta.dirname,
	"..",
	"..",
	"pi-project",
	"defaults",
	"schemas",
	"conformance-reference.schema.json",
);

const REQUIREMENTS_SCHEMA_SRC = path.resolve(
	import.meta.dirname,
	"..",
	"..",
	"pi-project",
	"defaults",
	"schemas",
	"requirements.schema.json",
);

const MACROS_SRC = path.resolve(import.meta.dirname, "..", "templates", "shared", "macros.md");
const ITEMS_DIR_SRC = path.resolve(import.meta.dirname, "..", "templates", "items");

/** Conformance-reference block data. */
const CONFORMANCE_BLOCK = {
	name: "Test Standards",
	scope: { type: "test" },
	principles: [
		{
			id: "P1",
			name: "Error Handling",
			rules: [{ id: "P1.1", rule: "all functions must have error handling", severity: "error" }],
		},
	],
};

/** Requirements block data. */
const REQUIREMENTS_BLOCK = {
	requirements: [
		{
			id: "REQ-001",
			description: "must produce valid JSON output",
			type: "functional",
			status: "accepted",
			priority: "must",
		},
	],
};

/** User-defined custom-standards block data. */
const CUSTOM_STANDARDS_BLOCK = {
	standards: [{ id: "CS-001", rule: "no inline styles", severity: "warning" }],
};

/** User-defined custom-standards schema (no bundled macro support). */
const CUSTOM_STANDARDS_SCHEMA = {
	type: "object",
	required: ["standards"],
	properties: {
		standards: {
			type: "array",
			items: {
				type: "object",
				required: ["id", "rule", "severity"],
				properties: {
					id: { type: "string" },
					rule: { type: "string" },
					severity: { type: "string" },
				},
			},
		},
	},
};

/** Base template — renders conformance, requirements, and custom-standards when present. */
const BASE_TEMPLATE = `You are a {{ role }} agent.
{% block task_description %}Perform analysis.{% endblock %}
{% if _conformance_reference %}
{% from "shared/macros.md" import render_conformance %}
{{ render_conformance(_conformance_reference) }}
{% endif %}
{% if _requirements %}
{% from "shared/macros.md" import render_requirements %}
{{ render_requirements(_requirements) }}
{% endif %}
{% if _custom_standards %}
## Custom Standards
{% for s in _custom_standards.standards %}
- [{{ s.severity }}] {{ s.id }}: {{ s.rule }}
{% endfor %}
{% endif %}`;

/** Child template — extends base, overrides task_description block. */
const CHILD_TEMPLATE = `{% extends "test-base/system.md" %}
{% block task_description %}Analyze code quality at {{ path }}.{% endblock %}`;

/**
 * Scaffold a mock project directory with .project/ blocks and schemas,
 * plus a templates directory with macros, base, and child templates.
 *
 * Returns { projectDir, templatesDir } — both inside the given tmpDir.
 */
function scaffoldMockProject(tmpDir: string): { projectDir: string; templatesDir: string } {
	const projectDir = tmpDir;
	const dotProject = path.join(projectDir, ".project");
	const schemasDir = path.join(dotProject, "schemas");
	fs.mkdirSync(schemasDir, { recursive: true });

	// Schemas — copy bundled + add user-defined
	fs.copyFileSync(CONFORMANCE_SCHEMA_SRC, path.join(schemasDir, "conformance-reference.schema.json"));
	fs.copyFileSync(REQUIREMENTS_SCHEMA_SRC, path.join(schemasDir, "requirements.schema.json"));
	fs.writeFileSync(
		path.join(schemasDir, "custom-standards.schema.json"),
		JSON.stringify(CUSTOM_STANDARDS_SCHEMA, null, 2),
	);

	// Block data files
	fs.writeFileSync(path.join(dotProject, "conformance-reference.json"), JSON.stringify(CONFORMANCE_BLOCK, null, 2));
	fs.writeFileSync(path.join(dotProject, "requirements.json"), JSON.stringify(REQUIREMENTS_BLOCK, null, 2));
	fs.writeFileSync(path.join(dotProject, "custom-standards.json"), JSON.stringify(CUSTOM_STANDARDS_BLOCK, null, 2));

	// Templates directory — placed at .pi/templates/ for three-tier resolution (project tier)
	// AND as a standalone dir for unit tests that create their own Nunjucks env
	const templatesDir = path.join(tmpDir, "templates");
	const piTemplatesDir = path.join(tmpDir, ".pi", "templates");

	for (const tplDir of [templatesDir, piTemplatesDir]) {
		// shared/macros.md — copy from package
		const sharedDir = path.join(tplDir, "shared");
		fs.mkdirSync(sharedDir, { recursive: true });
		fs.copyFileSync(MACROS_SRC, path.join(sharedDir, "macros.md"));

		// items/*.md — Plan 8 (Wave 4) restructured macros.md to delegate to
		// per-item macros under items/. The whole-block macros render_conformance
		// and render_requirements that this fixture's BASE_TEMPLATE consumes
		// now `{% from "items/<kind>.md" import ... %}` internally, so the
		// tmp template tree must include the items/ directory or the
		// Nunjucks loader fails with "template not found: items/<kind>.md".
		const itemsDir = path.join(tplDir, "items");
		fs.mkdirSync(itemsDir, { recursive: true });
		for (const entry of fs.readdirSync(ITEMS_DIR_SRC)) {
			fs.copyFileSync(path.join(ITEMS_DIR_SRC, entry), path.join(itemsDir, entry));
		}

		// test-base/system.md — base template
		const baseDir = path.join(tplDir, "test-base");
		fs.mkdirSync(baseDir, { recursive: true });
		fs.writeFileSync(path.join(baseDir, "system.md"), BASE_TEMPLATE);

		// test-child/system.md — child template (extends base)
		const childDir = path.join(tplDir, "test-child");
		fs.mkdirSync(childDir, { recursive: true });
		fs.writeFileSync(path.join(childDir, "system.md"), CHILD_TEMPLATE);
	}

	return { projectDir, templatesDir };
}

describe("compilation pipeline integration", () => {
	it("inputSchema rejects missing required field before dispatch", async (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-integ-schema-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const runDir = path.join(tmpDir, ".workflows", "runs", "test", "runs", "run-1");
		fs.mkdirSync(runDir, { recursive: true });

		const agentWithSchema: AgentSpec = {
			name: "schema-test-agent",
			inputSchema: {
				type: "object",
				required: ["path"],
				properties: { path: { type: "string" } },
			},
		};

		const dispatchFn = async (): Promise<StepResult> => {
			throw new Error("dispatch should not be called when inputSchema rejects");
		};

		const result = await executeAgentStep(
			"test-step",
			{ agent: "schema-test-agent", input: {} },
			{ input: {}, steps: {}, status: "running" },
			{
				ctx: { cwd: tmpDir, hasUI: false, ui: { setWidget: () => {}, notify: () => {} } } as any,
				loadAgent: () => agentWithSchema,
				runDir,
				specFilePath: path.join(tmpDir, "test.yaml"),
				widgetState: {
					spec: { name: "test", description: "", steps: {}, source: "project" as const, filePath: "" },
					state: { input: {}, steps: {}, status: "running" },
					startTime: Date.now(),
					stepStartTimes: new Map(),
					activities: new Map(),
					outputSummaries: new Map(),
					liveUsage: new Map(),
				},
				dispatchFn,
			},
		);

		assert.strictEqual(result.status, "failed", "step should fail when required input is missing");
		assert.ok(result.error, "should have error message");
		assert.ok(result.error!.includes("path"), "error should mention the missing required field");
	});

	it("full pipeline: parseAgentYaml → compileAgentSpec with contextBlocks + inheritance + macros", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-integ-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const { projectDir, templatesDir } = scaffoldMockProject(tmpDir);

		// Write agent YAML spec
		const specPath = path.join(tmpDir, "test.agent.yaml");
		fs.writeFileSync(
			specPath,
			[
				"name: test-agent",
				"role: quality",
				"tools: [read, bash]",
				"input:",
				"  type: object",
				"  required: [path]",
				"  properties:",
				"    path: { type: string }",
				"    role: { type: string }",
				"contextBlocks: [conformance-reference, requirements, custom-standards]",
				"output:",
				"  format: json",
				"prompt:",
				"  system:",
				"    template: test-child/system.md",
			].join("\n"),
		);

		// Parse the agent YAML
		const spec = parseAgentYaml(specPath);
		assert.deepStrictEqual(spec.contextBlocks, ["conformance-reference", "requirements", "custom-standards"]);

		// Create Nunjucks env pointing at the temp templates dir
		const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(templatesDir), {
			autoescape: false,
			throwOnUndefined: false,
		});

		// Compile with block injection
		const compiled = compileAgentSpec(spec, { path: "/src", role: "quality analyst" }, env, projectDir);

		const prompt = compiled.systemPrompt!;
		assert.ok(prompt, "systemPrompt should be defined after compilation");

		// Child template variable: role from input
		assert.ok(prompt.includes("quality analyst"), "should contain role from input variable in child template");

		// Child block override: task_description
		assert.ok(
			prompt.includes("Analyze code quality at /src"),
			"should contain child template's task_description override with path",
		);

		// Conformance-reference block via render_conformance macro
		assert.ok(prompt.includes("P1: Error Handling"), "should contain conformance principle id and name");
		assert.ok(
			prompt.includes("all functions must have error handling"),
			"should contain conformance rule text from block",
		);

		// Requirements block via render_requirements macro
		assert.ok(prompt.includes("REQ-001"), "should contain requirement id from block");
		assert.ok(prompt.includes("must produce valid JSON output"), "should contain requirement description from block");

		// Custom-standards block — user-defined, no bundled macro
		assert.ok(prompt.includes("CS-001"), "should contain custom standard id from user-defined block");
		assert.ok(prompt.includes("no inline styles"), "should contain custom standard rule from user-defined block");
	});

	it("custom block with no bundled support flows through framework", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-integ-custom-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		// Minimal project — only custom-standards
		const dotProject = path.join(tmpDir, ".project");
		const schemasDir = path.join(dotProject, "schemas");
		fs.mkdirSync(schemasDir, { recursive: true });
		fs.writeFileSync(
			path.join(schemasDir, "custom-standards.schema.json"),
			JSON.stringify(CUSTOM_STANDARDS_SCHEMA, null, 2),
		);
		fs.writeFileSync(path.join(dotProject, "custom-standards.json"), JSON.stringify(CUSTOM_STANDARDS_BLOCK, null, 2));

		// Minimal template that directly references _custom_standards
		const templatesDir = path.join(tmpDir, "templates");
		const tplDir = path.join(templatesDir, "custom-only");
		fs.mkdirSync(tplDir, { recursive: true });
		fs.writeFileSync(
			path.join(tplDir, "system.md"),
			[
				"You are a standards checker.",
				"{% if _custom_standards %}",
				"## Standards",
				"{% for s in _custom_standards.standards %}",
				"- [{{ s.severity }}] {{ s.id }}: {{ s.rule }}",
				"{% endfor %}",
				"{% endif %}",
			].join("\n"),
		);

		const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(templatesDir), {
			autoescape: false,
			throwOnUndefined: false,
		});

		const spec = {
			name: "custom-only-agent",
			promptTemplate: "custom-only/system.md",
			contextBlocks: ["custom-standards"],
		};

		const compiled = compileAgentSpec(spec, {}, env, tmpDir);
		const prompt = compiled.systemPrompt!;

		assert.ok(prompt.includes("standards checker"), "should contain template preamble");
		assert.ok(prompt.includes("CS-001"), "should contain custom standard id — user-defined block flows through");
		assert.ok(
			prompt.includes("no inline styles"),
			"should contain custom standard rule — no code changes needed for new block type",
		);
	});

	it("missing block renders gracefully", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-integ-missing-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		// Create .project/ directory but no block file for the declared block
		const dotProject = path.join(tmpDir, ".project");
		fs.mkdirSync(dotProject, { recursive: true });

		// Template with an if-guard around the missing block
		const templatesDir = path.join(tmpDir, "templates");
		const tplDir = path.join(templatesDir, "guarded");
		fs.mkdirSync(tplDir, { recursive: true });
		fs.writeFileSync(
			path.join(tplDir, "system.md"),
			[
				"You are a test agent.",
				"{% if _nonexistent %}",
				"This section should NOT appear.",
				"{% endif %}",
				"End of prompt.",
			].join("\n"),
		);

		const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(templatesDir), {
			autoescape: false,
			throwOnUndefined: false,
		});

		const spec = {
			name: "missing-block-agent",
			promptTemplate: "guarded/system.md",
			contextBlocks: ["nonexistent"],
		};

		// Should not throw
		const compiled = compileAgentSpec(spec, {}, env, tmpDir);
		const prompt = compiled.systemPrompt!;

		assert.ok(prompt.includes("You are a test agent."), "should contain template preamble");
		assert.ok(prompt.includes("End of prompt."), "should contain template epilogue");
		assert.ok(!prompt.includes("This section should NOT appear"), "guarded section for missing block should be absent");
	});

	it("no .project/ directory skips injection entirely", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-integ-noproject-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		// No .project/ directory created — tmpDir is empty

		// Template referencing block variables
		const templatesDir = path.join(tmpDir, "templates");
		const tplDir = path.join(templatesDir, "noproj");
		fs.mkdirSync(tplDir, { recursive: true });
		fs.writeFileSync(
			path.join(tplDir, "system.md"),
			[
				"You are a test agent.",
				"{% if _conformance_reference %}",
				"CONF: {{ _conformance_reference.name }}",
				"{% endif %}",
				"{% if _requirements %}",
				"REQ: present",
				"{% endif %}",
				"Done.",
			].join("\n"),
		);

		const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(templatesDir), {
			autoescape: false,
			throwOnUndefined: false,
		});

		const spec = {
			name: "no-project-agent",
			promptTemplate: "noproj/system.md",
			contextBlocks: ["conformance-reference", "requirements"],
		};

		const compiled = compileAgentSpec(spec, {}, env, tmpDir);
		const prompt = compiled.systemPrompt!;

		assert.ok(prompt.includes("You are a test agent."), "should render template preamble");
		assert.ok(prompt.includes("Done."), "should render template epilogue");
		assert.ok(!prompt.includes("CONF:"), "should not contain conformance data when no .project/ exists");
		assert.ok(!prompt.includes("REQ:"), "should not contain requirements data when no .project/ exists");
	});
});

// ── End-to-end workflow execution (requires pi on PATH) ──

let hasPi = false;
if (process.env.RUN_INTEGRATION === "1") {
	try {
		const { execSync } = await import("node:child_process");
		execSync("pi --version", { stdio: "ignore" });
		hasPi = true;
	} catch {}
}

describe("end-to-end workflow with contextBlocks", {
	skip: !hasPi ? "RUN_INTEGRATION=1 and pi required" : undefined,
}, () => {
	it(
		"dispatches agent with contextBlocks, macros, inheritance, inputSchema — validates full pipeline",
		async (t) => {
			const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-e2e-"));
			t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

			const { templatesDir } = scaffoldMockProject(tmpDir);

			// Create .workflows/ run state directory
			fs.mkdirSync(path.join(tmpDir, ".workflows"), { recursive: true });

			// Agent YAML — with inputSchema, contextBlocks, template inheritance
			const agentsDir = path.join(tmpDir, "agents");
			fs.mkdirSync(agentsDir, { recursive: true });
			fs.writeFileSync(
				path.join(agentsDir, "e2e-agent.agent.yaml"),
				[
					"name: e2e-agent",
					"role: quality",
					"tools: [read]",
					"input:",
					"  type: object",
					"  required: [path]",
					"  properties:",
					"    path: { type: string }",
					"    role: { type: string }",
					"contextBlocks: [conformance-reference, requirements, custom-standards]",
					"output:",
					"  format: json",
					"prompt:",
					"  system:",
					"    template: test-child/system.md",
					"  task:",
					'    inline: "Respond with a JSON object: {\\"status\\": \\"ok\\", \\"path\\": \\"{{ path }}\\"}. Raw JSON only, no markdown fences."',
				].join("\n"),
			);

			// Workflow YAML
			const workflowPath = path.join(tmpDir, "e2e-test.workflow.yaml");
			fs.writeFileSync(
				workflowPath,
				[
					"name: e2e-context-blocks",
					"description: End-to-end test of contextBlocks framework",
					"input:",
					"  type: object",
					"  required: [path]",
					"  properties:",
					"    path: { type: string }",
					"steps:",
					"  analyze:",
					"    agent: e2e-agent",
					"    input:",
					"      path: ${{ input.path }}",
					'      role: "quality analyst"',
					"    output:",
					"      format: json",
				].join("\n"),
			);

			const spec = parseWorkflowSpec(fs.readFileSync(workflowPath, "utf-8"), workflowPath, "project");

			const ctx = {
				cwd: tmpDir,
				hasUI: false,
				ui: { setWidget: () => {}, notify: () => {}, setStatus: () => {} },
			} as any;

			const pi = {
				sendMessage: () => {},
			} as any;

			const result = await executeWorkflow(
				spec,
				{ path: "." },
				{
					ctx,
					pi,
					loadAgent: createAgentLoader(tmpDir, agentsDir),
					templateEnv: createTemplateEnv(tmpDir, templatesDir),
				},
			);

			// Workflow completed
			assert.strictEqual(result.status, "completed", `workflow should complete, got: ${result.steps?.analyze?.error}`);

			// Step completed
			const step = result.steps.analyze;
			assert.ok(step, "analyze step should exist");
			assert.strictEqual(step.status, "completed", `step should complete, error: ${step.error}`);

			// Output validated as JSON
			assert.ok(step.output, "step should have parsed output");
			assert.strictEqual(typeof step.output, "object", "output should be an object");
		},
		{ timeout: 60_000 },
	);

	it(
		"rejects workflow when inputSchema required field is missing",
		async (t) => {
			const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-e2e-reject-"));
			t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

			fs.mkdirSync(path.join(tmpDir, ".workflows"), { recursive: true });
			fs.mkdirSync(path.join(tmpDir, ".project"), { recursive: true });

			const agentsDir = path.join(tmpDir, "agents");
			fs.mkdirSync(agentsDir, { recursive: true });
			fs.writeFileSync(
				path.join(agentsDir, "strict-agent.agent.yaml"),
				[
					"name: strict-agent",
					"role: quality",
					"tools: [read]",
					"input:",
					"  type: object",
					"  required: [path, depth]",
					"  properties:",
					"    path: { type: string }",
					"    depth: { type: number }",
					"output:",
					"  format: json",
				].join("\n"),
			);

			const workflowPath = path.join(tmpDir, "reject-test.workflow.yaml");
			fs.writeFileSync(
				workflowPath,
				[
					"name: reject-test",
					"description: Test inputSchema rejection",
					"steps:",
					"  analyze:",
					"    agent: strict-agent",
					"    input:",
					'      path: "/src"',
					"    output:",
					"      format: json",
				].join("\n"),
			);

			const spec = parseWorkflowSpec(fs.readFileSync(workflowPath, "utf-8"), workflowPath, "project");

			const ctx = {
				cwd: tmpDir,
				hasUI: false,
				ui: { setWidget: () => {}, notify: () => {}, setStatus: () => {} },
			} as any;

			const pi = { sendMessage: () => {} } as any;

			const result = await executeWorkflow(
				spec,
				{},
				{
					ctx,
					pi,
					loadAgent: createAgentLoader(tmpDir, agentsDir),
				},
			);

			assert.strictEqual(result.status, "failed", "workflow should fail when required input missing");
			const step = result.steps.analyze;
			assert.strictEqual(step.status, "failed");
			assert.ok(step.error, "should have error");
			assert.ok(step.error!.includes("depth"), "error should mention missing required field 'depth'");
		},
		{ timeout: 30_000 },
	);
});
