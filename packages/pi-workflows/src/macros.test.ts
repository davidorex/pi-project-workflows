import assert from "node:assert";
import path from "node:path";
import { describe, it } from "node:test";
import nunjucks from "nunjucks";

const templatesDir = path.resolve(import.meta.dirname, "..", "templates");
const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(templatesDir), {
	autoescape: false,
	throwOnUndefined: false,
});

function renderMacro(macroName: string, data: unknown): string {
	const template = `{% from "shared/macros.md" import ${macroName} %}{{ ${macroName}(data) }}`;
	return env.renderString(template, { data });
}

describe("shared macros", () => {
	describe("render_project", () => {
		it("renders project identity fields", () => {
			const data = {
				name: "test-project",
				description: "A test project",
				core_value: "Testing macros",
				status: "development",
				target_users: ["developers", "testers"],
				constraints: [{ type: "runtime", description: "Node 22+" }],
				scope_boundaries: { in: ["unit tests"], out: ["e2e tests"] },
				goals: [{ id: "G-001", description: "Pass all tests", success_criteria: ["0 failures"] }],
			};
			const result = renderMacro("render_project", data);
			assert.ok(result.includes("test-project"));
			assert.ok(result.includes("A test project"));
			assert.ok(result.includes("Testing macros"));
			assert.ok(result.includes("developers, testers"));
			assert.ok(result.includes("[runtime] Node 22+"));
			assert.ok(result.includes("unit tests"));
			assert.ok(result.includes("e2e tests"));
			assert.ok(result.includes("G-001"));
			assert.ok(result.includes("0 failures"));
		});

		it("renders nothing for null data", () => {
			const result = renderMacro("render_project", null);
			assert.strictEqual(result.trim(), "");
		});
	});

	describe("render_architecture", () => {
		it("renders modules, patterns, boundaries", () => {
			const data = {
				overview: "Monorepo architecture",
				modules: [
					{ name: "core", file: "src/core.ts", responsibility: "Core logic", lines: 200, dependencies: ["utils"] },
				],
				patterns: [{ name: "registry", description: "Central registry", used_in: ["core"] }],
				boundaries: ["No direct DB access from UI"],
			};
			const result = renderMacro("render_architecture", data);
			assert.ok(result.includes("Monorepo architecture"));
			assert.ok(result.includes("**core**"));
			assert.ok(result.includes("`src/core.ts`"));
			assert.ok(result.includes("200 lines"));
			assert.ok(result.includes("deps: utils"));
			assert.ok(result.includes("**registry**"));
			assert.ok(result.includes("used in: core"));
			assert.ok(result.includes("No direct DB access from UI"));
		});

		it("renders nothing for null data", () => {
			assert.strictEqual(renderMacro("render_architecture", null).trim(), "");
		});
	});

	describe("render_requirements", () => {
		it("renders requirements with priority and criteria", () => {
			const data = {
				requirements: [
					{
						id: "REQ-001",
						description: "Must produce valid JSON",
						type: "functional",
						priority: "must",
						status: "accepted",
						acceptance_criteria: ["Output parses as JSON"],
					},
				],
			};
			const result = renderMacro("render_requirements", data);
			assert.ok(result.includes("REQ-001"));
			assert.ok(result.includes("[must]"));
			assert.ok(result.includes("functional"));
			assert.ok(result.includes("Output parses as JSON"));
		});

		it("renders nothing for null data", () => {
			assert.strictEqual(renderMacro("render_requirements", null).trim(), "");
		});

		it("renders nothing for empty requirements array", () => {
			assert.strictEqual(renderMacro("render_requirements", { requirements: [] }).trim(), "");
		});
	});

	describe("render_conformance", () => {
		it("renders principles and rules", () => {
			const data = {
				name: "Pi Extension Standards",
				principles: [
					{
						id: "P1",
						name: "Type Safety",
						description: "All exports must be typed",
						rules: [
							{ id: "P1.1", rule: "No any types", severity: "error", check_method: "grep", anti_patterns: ["as any"] },
						],
					},
				],
			};
			const result = renderMacro("render_conformance", data);
			assert.ok(result.includes("Pi Extension Standards"));
			assert.ok(result.includes("P1: Type Safety"));
			assert.ok(result.includes("All exports must be typed"));
			assert.ok(result.includes("**P1.1**"));
			assert.ok(result.includes("No any types"));
			assert.ok(result.includes("[error]"));
			assert.ok(result.includes("check: grep"));
			assert.ok(result.includes("as any"));
		});

		it("renders nothing for null data", () => {
			assert.strictEqual(renderMacro("render_conformance", null).trim(), "");
		});
	});

	describe("render_domain", () => {
		it("renders domain entries", () => {
			const data = {
				entries: [
					{
						id: "D-001",
						title: "REST conventions",
						content: "Use PATCH for partial updates",
						category: "reference",
						tags: ["api", "http"],
					},
				],
			};
			const result = renderMacro("render_domain", data);
			assert.ok(result.includes("D-001"));
			assert.ok(result.includes("REST conventions"));
			assert.ok(result.includes("Use PATCH for partial updates"));
			assert.ok(result.includes("tags: api, http"));
		});

		it("renders nothing for null data", () => {
			assert.strictEqual(renderMacro("render_domain", null).trim(), "");
		});
	});

	describe("render_decisions", () => {
		it("renders decisions with rationale", () => {
			const data = {
				decisions: [
					{
						id: "DEC-001",
						decision: "Use Nunjucks",
						rationale: "Template inheritance support",
						status: "decided",
						context: "Template engine selection",
					},
				],
			};
			const result = renderMacro("render_decisions", data);
			assert.ok(result.includes("DEC-001"));
			assert.ok(result.includes("Use Nunjucks"));
			assert.ok(result.includes("Template inheritance support"));
			assert.ok(result.includes("decided"));
			assert.ok(result.includes("context: Template engine selection"));
		});

		it("renders nothing for null data", () => {
			assert.strictEqual(renderMacro("render_decisions", null).trim(), "");
		});
	});

	describe("render_tasks", () => {
		it("renders tasks with status and phase", () => {
			const data = {
				tasks: [
					{ id: "T-001", description: "Implement macros", status: "in-progress", phase: 1, files: ["src/macros.ts"] },
				],
			};
			const result = renderMacro("render_tasks", data);
			assert.ok(result.includes("T-001"));
			assert.ok(result.includes("Implement macros"));
			assert.ok(result.includes("[in-progress]"));
			assert.ok(result.includes("phase 1"));
			assert.ok(result.includes("files: src/macros.ts"));
		});

		it("renders nothing for null data", () => {
			assert.strictEqual(renderMacro("render_tasks", null).trim(), "");
		});
	});

	describe("render_issues", () => {
		it("renders issues with priority and body", () => {
			const data = {
				issues: [
					{
						id: "ISS-001",
						title: "Template underuse",
						body: "Only analyzers use composition",
						status: "open",
						priority: "high",
						location: "templates/",
						package: "pi-workflows",
					},
				],
			};
			const result = renderMacro("render_issues", data);
			assert.ok(result.includes("ISS-001"));
			assert.ok(result.includes("[high, open]"));
			assert.ok(result.includes("Template underuse"));
			assert.ok(result.includes("Only analyzers use composition"));
			assert.ok(result.includes("(pi-workflows)"));
		});

		it("renders nothing for null data", () => {
			assert.strictEqual(renderMacro("render_issues", null).trim(), "");
		});
	});

	describe("render_exploration", () => {
		it("renders files and types", () => {
			const data = {
				files: [{ path: "src/index.ts", lines: 100, exports: ["a", "b"] }],
				types: [{ name: "AgentSpec", kind: "interface", file: "types.ts" }],
			};
			const result = renderMacro("render_exploration", data);
			assert.ok(result.includes("`src/index.ts`"));
			assert.ok(result.includes("100 lines"));
			assert.ok(result.includes("2 exports"));
			assert.ok(result.includes("`AgentSpec`"));
			assert.ok(result.includes("interface"));
		});

		it("renders nothing for null data", () => {
			assert.strictEqual(renderMacro("render_exploration", null).trim(), "");
		});
	});

	describe("render_exploration_full", () => {
		it("renders files, types, dependencies, entry points", () => {
			const data = {
				files: [{ path: "src/index.ts", language: "typescript", lines: 100 }],
				types: [{ name: "Foo", kind: "class", file: "foo.ts" }],
				dependencies: [{ from: "index.ts", to: "foo.ts", type: "import" }],
				entryPoints: ["src/index.ts"],
			};
			const result = renderMacro("render_exploration_full", data);
			assert.ok(result.includes("typescript"));
			assert.ok(result.includes("`index.ts` → `foo.ts`"));
			assert.ok(result.includes("Entry Points"));
		});

		it("renders nothing for null data", () => {
			assert.strictEqual(renderMacro("render_exploration_full", null).trim(), "");
		});
	});

	describe("render_gap", () => {
		it("renders single gap object", () => {
			const data = {
				id: "gap-001",
				description: "Missing tests",
				category: "missing",
				priority: "high",
				details: "No test file for block-api",
			};
			const result = renderMacro("render_gap", data);
			assert.ok(result.includes("gap-001"));
			assert.ok(result.includes("Missing tests"));
			assert.ok(result.includes("missing"));
			assert.ok(result.includes("high"));
			assert.ok(result.includes("No test file for block-api"));
		});

		it("renders nothing for null data", () => {
			assert.strictEqual(renderMacro("render_gap", null).trim(), "");
		});
	});
});
