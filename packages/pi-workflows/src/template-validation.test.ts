import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { extractTemplateVariables, validateTemplateAlignment } from "./template-validation.js";
import type { WorkflowSpec } from "./types.js";

// ── extractTemplateVariables ────────────────────────────────────────────────

describe("extractTemplateVariables", () => {
	it("extracts output expressions with dotted paths", () => {
		const vars = extractTemplateVariables("{{ spec.name }}\n{{ spec.description }}");
		assert.strictEqual(vars.length, 2);
		assert.strictEqual(vars[0].path, "spec.name");
		assert.strictEqual(vars[1].path, "spec.description");
		assert.strictEqual(vars[0].root, "spec");
		assert.strictEqual(vars[0].usage, "output");
	});

	it("extracts loop source variables", () => {
		const vars = extractTemplateVariables("{% for f in spec.files %}\n- {{ f }}\n{% endfor %}");
		assert.strictEqual(vars.length, 1);
		assert.strictEqual(vars[0].path, "spec.files");
		assert.strictEqual(vars[0].usage, "loop");
	});

	it("marks guarded variables inside if blocks", () => {
		const vars = extractTemplateVariables("{% if spec.context_needed %}\n{{ spec.context_needed }}\n{% endif %}");
		assert.strictEqual(vars.length, 1);
		assert.strictEqual(vars[0].guarded, true);
	});

	it("marks unguarded variables outside if blocks", () => {
		const vars = extractTemplateVariables("{{ spec.name }}");
		assert.strictEqual(vars.length, 1);
		assert.strictEqual(vars[0].guarded, false);
	});

	it("skips injected variables (output_schema, loop)", () => {
		const vars = extractTemplateVariables("{{ output_schema }}\n{{ loop.index }}");
		assert.strictEqual(vars.length, 0);
	});

	it("skips root-only references without field access", () => {
		const vars = extractTemplateVariables("{{ spec }}");
		assert.strictEqual(vars.length, 0);
	});

	it("deduplicates identical paths", () => {
		const vars = extractTemplateVariables("{{ spec.name }}\n{{ spec.name }}");
		assert.strictEqual(vars.length, 1);
	});

	it("extracts variables with filters", () => {
		const vars = extractTemplateVariables("{{ spec.name | json }}");
		assert.strictEqual(vars.length, 1);
		assert.strictEqual(vars[0].path, "spec.name");
	});

	it("handles multiple roots", () => {
		const vars = extractTemplateVariables("{{ spec.name }}\n{{ architecture.modules }}");
		const roots = new Set(vars.map((v) => v.root));
		assert.ok(roots.has("spec"));
		assert.ok(roots.has("architecture"));
	});
});

// ── validateTemplateAlignment ───────────────────────────────────────────────

function makeTmpDir(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), `tmpl-val-${prefix}-`));
}

function makeSpec(overrides: Partial<WorkflowSpec> & { steps: Record<string, unknown> }): WorkflowSpec {
	return {
		name: "test",
		description: "",
		source: "project" as const,
		filePath: "/tmp/test.workflow.yaml",
		...overrides,
		steps: overrides.steps as WorkflowSpec["steps"],
	};
}

describe("validateTemplateAlignment", () => {
	it("catches field mismatch between template and schema", () => {
		const tmpDir = makeTmpDir("field-mismatch");

		// Create agent under .pi/ (matches cwd-based search paths)
		const agentsDir = path.join(tmpDir, ".pi", "agents");
		fs.mkdirSync(agentsDir, { recursive: true });
		fs.writeFileSync(
			path.join(agentsDir, "test-agent.agent.yaml"),
			"name: test-agent\nprompt:\n  task: test-agent/task.md\n",
		);

		// Create template that references spec.intent (wrong field)
		const templatesDir = path.join(tmpDir, ".pi", "templates", "test-agent");
		fs.mkdirSync(templatesDir, { recursive: true });
		fs.writeFileSync(
			path.join(templatesDir, "task.md"),
			"## {{ spec.name }}\n{{ spec.intent }}\n{% for f in spec.files_to_change %}\n{{ f }}\n{% endfor %}",
		);

		// Create schema with 'description' and 'files' (not 'intent' and 'files_to_change')
		const schemasDir = path.join(tmpDir, "schemas");
		fs.mkdirSync(schemasDir, { recursive: true });
		fs.writeFileSync(
			path.join(schemasDir, "decomp.schema.json"),
			JSON.stringify({
				type: "object",
				properties: {
					specs: {
						type: "array",
						items: {
							type: "object",
							required: ["name", "description", "files"],
							properties: {
								name: { type: "string" },
								description: { type: "string" },
								files: { type: "array", items: { type: "string" } },
							},
						},
					},
				},
			}),
		);

		const spec = makeSpec({
			filePath: path.join(tmpDir, "test.workflow.yaml"),
			steps: {
				decompose: {
					agent: "decomposer",
					output: { schema: path.join(schemasDir, "decomp.schema.json") },
				},
				implement: {
					forEach: "${{ steps.decompose.output.specs }}",
					as: "spec",
					agent: "test-agent",
					input: {
						spec: "${{ spec }}",
					},
					output: { format: "json" },
				},
			},
		});

		const issues = validateTemplateAlignment(spec, tmpDir);

		// Should find mismatches for 'intent' and 'files_to_change'
		const fieldErrors = issues.filter((i) => i.message.includes("schema has no field"));
		assert.ok(
			fieldErrors.length >= 2,
			`Expected at least 2 field errors, got ${fieldErrors.length}: ${JSON.stringify(fieldErrors)}`,
		);

		const intentError = fieldErrors.find((i) => i.message.includes("intent"));
		assert.ok(intentError, "Should flag spec.intent as missing from schema");
		assert.ok(intentError.message.includes("description"), "Should suggest 'description' as closest match");

		const filesError = fieldErrors.find((i) => i.message.includes("files_to_change"));
		assert.ok(filesError, "Should flag spec.files_to_change as missing from schema");
		assert.ok(filesError.message.includes("files"), "Should suggest 'files' as closest match");
	});

	it("catches forEach as-name mismatch with template variables", () => {
		const tmpDir = makeTmpDir("foreach-mismatch");

		const agentsDir = path.join(tmpDir, ".pi", "agents");
		fs.mkdirSync(agentsDir, { recursive: true });
		fs.writeFileSync(
			path.join(agentsDir, "test-agent.agent.yaml"),
			"name: test-agent\nprompt:\n  task: test-agent/task.md\n",
		);

		const templatesDir = path.join(tmpDir, ".pi", "templates", "test-agent");
		fs.mkdirSync(templatesDir, { recursive: true });
		// Template uses spec.* but forEach says `as: plan`
		fs.writeFileSync(path.join(templatesDir, "task.md"), "{{ spec.name }}\n{{ spec.description }}");

		const spec = makeSpec({
			filePath: path.join(tmpDir, "test.workflow.yaml"),
			steps: {
				decompose: { command: "echo test", output: { format: "json" } },
				implement: {
					forEach: "${{ steps.decompose.output.specs }}",
					as: "plan",
					agent: "test-agent",
					input: {
						plan: "${{ plan }}",
					},
					output: { format: "json" },
				},
			},
		});

		const issues = validateTemplateAlignment(spec, tmpDir);

		// Template uses spec.* but input only has plan — spec is an undeclared root
		const mismatchError = issues.find((i) => i.message.includes("spec") && i.message.includes("does not declare"));
		assert.ok(
			mismatchError,
			`Should catch that template uses 'spec' when input has 'plan'. Issues: ${JSON.stringify(issues)}`,
		);
		assert.strictEqual(mismatchError.severity, "error");
	});

	it("reports missing root variables not in input", () => {
		const tmpDir = makeTmpDir("missing-root");

		const agentsDir = path.join(tmpDir, ".pi", "agents");
		fs.mkdirSync(agentsDir, { recursive: true });
		fs.writeFileSync(
			path.join(agentsDir, "test-agent.agent.yaml"),
			"name: test-agent\nprompt:\n  task: test-agent/task.md\n",
		);

		const templatesDir = path.join(tmpDir, ".pi", "templates", "test-agent");
		fs.mkdirSync(templatesDir, { recursive: true });
		fs.writeFileSync(
			path.join(templatesDir, "task.md"),
			"{{ spec.name }}\n{% for m in architecture.modules %}\n{{ m }}\n{% endfor %}",
		);

		const spec = makeSpec({
			filePath: path.join(tmpDir, "test.workflow.yaml"),
			steps: {
				implement: {
					agent: "test-agent",
					input: {
						spec: "${{ input.spec }}",
						// architecture is NOT provided
					},
				},
			},
		});

		const issues = validateTemplateAlignment(spec, tmpDir);

		const missingRoot = issues.find(
			(i) => i.message.includes("architecture") && i.message.includes("does not declare"),
		);
		assert.ok(missingRoot, `Should report missing 'architecture' root. Issues: ${JSON.stringify(issues)}`);
	});

	it("returns no issues for correctly aligned template", () => {
		const tmpDir = makeTmpDir("aligned");

		const agentsDir = path.join(tmpDir, ".pi", "agents");
		fs.mkdirSync(agentsDir, { recursive: true });
		fs.writeFileSync(
			path.join(agentsDir, "test-agent.agent.yaml"),
			"name: test-agent\nprompt:\n  task: test-agent/task.md\n",
		);

		const schemasDir = path.join(tmpDir, "schemas");
		fs.mkdirSync(schemasDir, { recursive: true });
		fs.writeFileSync(
			path.join(schemasDir, "items.schema.json"),
			JSON.stringify({
				type: "object",
				properties: {
					items: {
						type: "array",
						items: {
							type: "object",
							required: ["name", "description"],
							properties: {
								name: { type: "string" },
								description: { type: "string" },
							},
						},
					},
				},
			}),
		);

		const templatesDir = path.join(tmpDir, ".pi", "templates", "test-agent");
		fs.mkdirSync(templatesDir, { recursive: true });
		fs.writeFileSync(path.join(templatesDir, "task.md"), "{{ item.name }}\n{{ item.description }}");

		const spec = makeSpec({
			filePath: path.join(tmpDir, "test.workflow.yaml"),
			steps: {
				produce: {
					command: "echo test",
					output: { schema: path.join(schemasDir, "items.schema.json") },
				},
				consume: {
					forEach: "${{ steps.produce.output.items }}",
					as: "item",
					agent: "test-agent",
					input: {
						item: "${{ item }}",
					},
					output: { format: "json" },
				},
			},
		});

		const issues = validateTemplateAlignment(spec, tmpDir);
		const errors = issues.filter((i) => i.severity === "error");
		assert.strictEqual(errors.length, 0, `Expected no errors but got: ${JSON.stringify(errors)}`);
	});

	it("skips unverifiable sources (no schema)", () => {
		const tmpDir = makeTmpDir("no-schema");

		const agentsDir = path.join(tmpDir, ".pi", "agents");
		fs.mkdirSync(agentsDir, { recursive: true });
		fs.writeFileSync(
			path.join(agentsDir, "test-agent.agent.yaml"),
			"name: test-agent\nprompt:\n  task: test-agent/task.md\n",
		);

		const templatesDir = path.join(tmpDir, ".pi", "templates", "test-agent");
		fs.mkdirSync(templatesDir, { recursive: true });
		fs.writeFileSync(path.join(templatesDir, "task.md"), "{{ data.anything }}\n{{ data.whatever }}");

		const spec = makeSpec({
			filePath: path.join(tmpDir, "test.workflow.yaml"),
			steps: {
				load: { command: "echo test", output: { format: "json" } },
				process: {
					agent: "test-agent",
					input: {
						data: "${{ steps.load.output }}",
					},
				},
			},
		});

		const issues = validateTemplateAlignment(spec, tmpDir);
		// Should not produce field-level errors since there's no schema to check against
		const fieldErrors = issues.filter((i) => i.message.includes("schema has no field"));
		assert.strictEqual(fieldErrors.length, 0, `Should skip unverifiable sources: ${JSON.stringify(fieldErrors)}`);
	});
});

// ── contextBlocks-injected variables ───────────────────────────────────────

describe("contextBlocks-injected variables", () => {
	it("recognizes contextBlocks variables as valid template roots", () => {
		const tmpDir = makeTmpDir("ctx-blocks-valid");

		const agentsDir = path.join(tmpDir, ".pi", "agents");
		fs.mkdirSync(agentsDir, { recursive: true });
		fs.writeFileSync(
			path.join(agentsDir, "ctx-agent.agent.yaml"),
			"name: ctx-agent\ntools: [read]\ncontextBlocks: [conventions]\nprompt:\n  task: ctx-agent/task.md\n",
		);

		const templatesDir = path.join(tmpDir, ".pi", "templates", "ctx-agent");
		fs.mkdirSync(templatesDir, { recursive: true });
		fs.writeFileSync(path.join(templatesDir, "task.md"), "{{ _conventions.rules }}");

		const spec = makeSpec({
			filePath: path.join(tmpDir, "test.workflow.yaml"),
			steps: {
				review: {
					agent: "ctx-agent",
					input: {
						topic: "test",
					},
				},
			},
		});

		const issues = validateTemplateAlignment(spec, tmpDir);
		const conventionIssues = issues.filter((i) => i.message.includes("_conventions"));
		assert.strictEqual(
			conventionIssues.length,
			0,
			`Should not flag _conventions when agent declares contextBlocks: [conventions]. Issues: ${JSON.stringify(conventionIssues)}`,
		);
	});

	it("handles hyphen-to-underscore mapping for contextBlocks", () => {
		const tmpDir = makeTmpDir("ctx-blocks-hyphen");

		const agentsDir = path.join(tmpDir, ".pi", "agents");
		fs.mkdirSync(agentsDir, { recursive: true });
		fs.writeFileSync(
			path.join(agentsDir, "hyphen-agent.agent.yaml"),
			"name: hyphen-agent\ntools: [read]\ncontextBlocks: [conformance-reference]\nprompt:\n  task: hyphen-agent/task.md\n",
		);

		const templatesDir = path.join(tmpDir, ".pi", "templates", "hyphen-agent");
		fs.mkdirSync(templatesDir, { recursive: true });
		fs.writeFileSync(path.join(templatesDir, "task.md"), "{{ _conformance_reference.rules }}");

		const spec = makeSpec({
			filePath: path.join(tmpDir, "test.workflow.yaml"),
			steps: {
				review: {
					agent: "hyphen-agent",
					input: {
						topic: "test",
					},
				},
			},
		});

		const issues = validateTemplateAlignment(spec, tmpDir);
		const refIssues = issues.filter((i) => i.message.includes("_conformance_reference"));
		assert.strictEqual(
			refIssues.length,
			0,
			`Should not flag _conformance_reference when agent declares contextBlocks: [conformance-reference]. Issues: ${JSON.stringify(refIssues)}`,
		);
	});

	it("flags unknown variable when agent has no contextBlocks", () => {
		const tmpDir = makeTmpDir("ctx-blocks-none");

		const agentsDir = path.join(tmpDir, ".pi", "agents");
		fs.mkdirSync(agentsDir, { recursive: true });
		fs.writeFileSync(
			path.join(agentsDir, "no-ctx-agent.agent.yaml"),
			"name: no-ctx-agent\ntools: [read]\nprompt:\n  task: no-ctx-agent/task.md\n",
		);

		const templatesDir = path.join(tmpDir, ".pi", "templates", "no-ctx-agent");
		fs.mkdirSync(templatesDir, { recursive: true });
		fs.writeFileSync(path.join(templatesDir, "task.md"), "{{ _conventions.rules }}");

		const spec = makeSpec({
			filePath: path.join(tmpDir, "test.workflow.yaml"),
			steps: {
				review: {
					agent: "no-ctx-agent",
					input: {
						topic: "test",
					},
				},
			},
		});

		const issues = validateTemplateAlignment(spec, tmpDir);
		const conventionIssues = issues.filter((i) => i.message.includes("_conventions"));
		assert.ok(
			conventionIssues.length > 0,
			`Should flag _conventions when agent has no contextBlocks. Issues: ${JSON.stringify(issues)}`,
		);
	});

	it("flags variable not in contextBlocks list", () => {
		const tmpDir = makeTmpDir("ctx-blocks-partial");

		const agentsDir = path.join(tmpDir, ".pi", "agents");
		fs.mkdirSync(agentsDir, { recursive: true });
		fs.writeFileSync(
			path.join(agentsDir, "partial-agent.agent.yaml"),
			"name: partial-agent\ntools: [read]\ncontextBlocks: [conventions]\nprompt:\n  task: partial-agent/task.md\n",
		);

		const templatesDir = path.join(tmpDir, ".pi", "templates", "partial-agent");
		fs.mkdirSync(templatesDir, { recursive: true });
		fs.writeFileSync(path.join(templatesDir, "task.md"), "{{ _nonexistent.field }}");

		const spec = makeSpec({
			filePath: path.join(tmpDir, "test.workflow.yaml"),
			steps: {
				review: {
					agent: "partial-agent",
					input: {
						topic: "test",
					},
				},
			},
		});

		const issues = validateTemplateAlignment(spec, tmpDir);
		const nonexistentIssues = issues.filter((i) => i.message.includes("_nonexistent"));
		assert.ok(
			nonexistentIssues.length > 0,
			`Should flag _nonexistent when it's not in contextBlocks. Issues: ${JSON.stringify(issues)}`,
		);
	});
});
