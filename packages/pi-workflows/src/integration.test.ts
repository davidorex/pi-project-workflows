import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import nunjucks from "nunjucks";
import { parseAgentYaml } from "./agent-spec.js";
import { compileAgentSpec } from "./step-shared.js";

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

	// Templates directory
	const templatesDir = path.join(tmpDir, "templates");

	// shared/macros.md — copy from package
	const sharedDir = path.join(templatesDir, "shared");
	fs.mkdirSync(sharedDir, { recursive: true });
	fs.copyFileSync(MACROS_SRC, path.join(sharedDir, "macros.md"));

	// test-base/system.md — base template
	const baseDir = path.join(templatesDir, "test-base");
	fs.mkdirSync(baseDir, { recursive: true });
	fs.writeFileSync(path.join(baseDir, "system.md"), BASE_TEMPLATE);

	// test-child/system.md — child template (extends base)
	const childDir = path.join(templatesDir, "test-child");
	fs.mkdirSync(childDir, { recursive: true });
	fs.writeFileSync(path.join(childDir, "system.md"), CHILD_TEMPLATE);

	return { projectDir, templatesDir };
}

describe("compilation pipeline integration", () => {
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
