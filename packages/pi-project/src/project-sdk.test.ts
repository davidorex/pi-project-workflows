/**
 * Tests for project-sdk: projectState, availableBlocks, availableSchemas,
 * findAppendableBlocks, validateProject, schemaInfo, schemaVocabulary,
 * blockStructure.
 */

import assert from "node:assert";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
	availableBlocks,
	availableSchemas,
	blockStructure,
	projectState,
	schemaInfo,
	schemaVocabulary,
	validateProject,
} from "./project-sdk.js";

function makeTmpDir(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), `sdk-${prefix}-`));
}

// ── Discovery ────────────────────────────────────────────────────────────────

describe("availableBlocks", () => {
	it("lists blocks with schema presence", (t) => {
		const tmpDir = makeTmpDir("blocks");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const wfDir = path.join(tmpDir, ".project");
		const schemasDir = path.join(wfDir, "schemas");
		fs.mkdirSync(schemasDir, { recursive: true });
		fs.writeFileSync(path.join(wfDir, "issues.json"), "{}");
		fs.writeFileSync(path.join(schemasDir, "issues.schema.json"), "{}");
		fs.writeFileSync(path.join(wfDir, "model-config.json"), "{}"); // no schema

		const blocks = availableBlocks(tmpDir);
		const issuesBlock = blocks.find((b) => b.name === "issues");
		const config = blocks.find((b) => b.name === "model-config");
		assert.ok(issuesBlock);
		assert.strictEqual(issuesBlock!.hasSchema, true);
		assert.ok(config);
		assert.strictEqual(config!.hasSchema, false);
	});

	it("returns empty array when .project/ does not exist", (t) => {
		const tmpDir = makeTmpDir("blocks-empty");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const blocks = availableBlocks(tmpDir);
		assert.deepStrictEqual(blocks, []);
	});
});

describe("availableSchemas", () => {
	it("finds .project/schemas/*.schema.json", (t) => {
		const tmpDir = makeTmpDir("schemas");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const schemasDir = path.join(tmpDir, ".project", "schemas");
		fs.mkdirSync(schemasDir, { recursive: true });
		fs.writeFileSync(path.join(schemasDir, "issues.schema.json"), "{}");

		const schemas = availableSchemas(tmpDir);
		assert.ok(schemas.some((s) => s.includes("issues.schema.json")));
	});

	it("returns empty array when schemas dir does not exist", (t) => {
		const tmpDir = makeTmpDir("schemas-empty");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const schemas = availableSchemas(tmpDir);
		assert.deepStrictEqual(schemas, []);
	});
});

// ── Derived State ────────────────────────────────────────────────────────────

describe("projectState", () => {
	it("derives state from blocks and git", (t) => {
		const tmpDir = makeTmpDir("state");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		// Set up a minimal git repo
		execSync("git init && git commit --allow-empty -m 'init'", { cwd: tmpDir, stdio: "ignore" });

		// Set up source files
		const srcDir = path.join(tmpDir, "src");
		fs.mkdirSync(srcDir, { recursive: true });
		fs.writeFileSync(
			path.join(srcDir, "example.test.ts"),
			`
      it("test one", () => {});
      it("test two", () => {});
      it("test three", () => {});
    `,
		);
		fs.writeFileSync(path.join(srcDir, "module-a.ts"), "export function a() {}\nexport function b() {}\n");
		fs.writeFileSync(path.join(srcDir, "module-b.ts"), "export const x = 1;\n");

		// Set up blocks
		const wfDir = path.join(tmpDir, ".project");
		const schemasDir = path.join(wfDir, "schemas");
		fs.mkdirSync(schemasDir, { recursive: true });
		fs.writeFileSync(path.join(schemasDir, "issues.schema.json"), "{}");

		// Set up phases
		const phasesDir = path.join(wfDir, "phases");
		fs.mkdirSync(phasesDir, { recursive: true });
		fs.writeFileSync(path.join(phasesDir, "01-foundation.json"), "{}");
		fs.writeFileSync(path.join(phasesDir, "02-control.json"), "{}");
		fs.writeFileSync(path.join(phasesDir, "08-automation.json"), "{}");

		fs.writeFileSync(
			path.join(wfDir, "issues.json"),
			JSON.stringify({
				issues: [
					{
						id: "g1",
						title: "open issue",
						body: "open issue detail",
						location: "src/mod.ts:10",
						status: "open",
						category: "issue",
						priority: "high",
						package: "pi-project",
					},
					{
						id: "g2",
						title: "resolved",
						body: "resolved detail",
						location: "src/mod.ts:20",
						status: "resolved",
						category: "cleanup",
						priority: "low",
						package: "pi-project",
					},
					{
						id: "g3",
						title: "another open",
						body: "another open detail",
						location: "src/mod.ts:30",
						status: "open",
						category: "capability",
						priority: "medium",
						package: "pi-project",
					},
				],
			}),
		);
		fs.writeFileSync(
			path.join(wfDir, "decisions.json"),
			JSON.stringify({
				decisions: [
					{ id: "d1", decision: "use X", rationale: "because", phase: 1, status: "decided" },
					{ id: "d2", decision: "maybe Y", rationale: "unclear", phase: 1, status: "tentative" },
				],
			}),
		);

		const state = projectState(tmpDir);

		assert.strictEqual(state.testCount, 3); // 3 it() declarations in example.test.ts
		assert.strictEqual(state.sourceFiles, 2); // module-a.ts, module-b.ts (not .test.ts)
		assert.ok(state.sourceLines > 0);
		assert.ok(state.lastCommit.length > 0);
		assert.strictEqual(state.lastCommitMessage, "init");
		assert.ok(state.recentCommits.length > 0);
		assert.ok(state.recentCommits[0].includes("init"));
		// blockSummaries: issues block has an "issues" array with 3 items and status distribution
		assert.ok(state.blockSummaries.issues);
		assert.ok(state.blockSummaries.issues.arrays.issues);
		assert.strictEqual(state.blockSummaries.issues.arrays.issues.total, 3);
		assert.ok(state.blockSummaries.issues.arrays.issues.byStatus);
		assert.strictEqual(state.blockSummaries.issues.arrays.issues.byStatus!.open, 2);
		assert.strictEqual(state.blockSummaries.issues.arrays.issues.byStatus!.resolved, 1);

		// blockSummaries: decisions block has a "decisions" array with 2 items and status distribution
		assert.ok(state.blockSummaries.decisions);
		assert.ok(state.blockSummaries.decisions.arrays.decisions);
		assert.strictEqual(state.blockSummaries.decisions.arrays.decisions.total, 2);
		assert.ok(state.blockSummaries.decisions.arrays.decisions.byStatus);
		assert.strictEqual(state.blockSummaries.decisions.arrays.decisions.byStatus!.decided, 1);
		assert.strictEqual(state.blockSummaries.decisions.arrays.decisions.byStatus!.tentative, 1);

		assert.strictEqual(state.phases.total, 3);
		assert.strictEqual(state.phases.current, 8); // highest number from 08-automation.json
		assert.ok(state.schemas >= 1); // at least issues.schema.json
	});

	it("handles missing blocks gracefully", (t) => {
		const tmpDir = makeTmpDir("state-empty");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const state = projectState(tmpDir);

		assert.strictEqual(state.testCount, 0);
		assert.strictEqual(state.sourceFiles, 0);
		assert.strictEqual(state.sourceLines, 0);
		assert.strictEqual(state.lastCommit, "unknown");
		assert.deepStrictEqual(state.recentCommits, []);
		assert.deepStrictEqual(state.blockSummaries, {}); // no blocks at all
		assert.strictEqual(state.phases.total, 0);
		assert.strictEqual(state.phases.current, 0);
		assert.ok(typeof state.schemas === "number");
	});
});

// ── validateProject ─────────────────────────────────────────────────────────

describe("validateProject", () => {
	it("returns valid for a project with consistent cross-references", (t) => {
		const tmpDir = makeTmpDir("validate-valid");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		const phasesDir = path.join(projectDir, "phases");
		fs.mkdirSync(phasesDir, { recursive: true });

		// Phase file with number and name
		fs.writeFileSync(path.join(phasesDir, "01-foundation.json"), JSON.stringify({ number: 1, name: "foundation" }));

		// Tasks referencing the existing phase
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({
				tasks: [
					{ id: "t1", description: "first task", status: "planned", phase: "foundation" },
					{ id: "t2", description: "second task", status: "planned", phase: 1 },
				],
			}),
		);

		// Decisions referencing the existing phase
		fs.writeFileSync(
			path.join(projectDir, "decisions.json"),
			JSON.stringify({
				decisions: [{ id: "d1", decision: "use X", rationale: "because", phase: 1 }],
			}),
		);

		const result = validateProject(tmpDir);
		assert.strictEqual(result.valid, true);
		assert.deepStrictEqual(result.issues, []);
	});

	it("reports broken phase reference from tasks", (t) => {
		const tmpDir = makeTmpDir("validate-phase-ref");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		// No phases directory — phase references will be broken

		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({
				tasks: [{ id: "t1", description: "task with missing phase", status: "planned", phase: "phase-1" }],
			}),
		);

		const result = validateProject(tmpDir);
		// Broken phase references are warnings, so valid may still be true
		// but there should be an issue about the missing phase
		assert.ok(result.issues.length > 0);
		const phaseIssue = result.issues.find((i) => i.message.includes("phase") && i.message.includes("phase-1"));
		assert.ok(phaseIssue, "should report issue about missing phase reference");
		assert.strictEqual(phaseIssue!.block, "tasks");
	});

	it("reports missing task dependency", (t) => {
		const tmpDir = makeTmpDir("validate-task-dep");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({
				tasks: [{ id: "task-a", description: "depends on nonexistent", status: "planned", depends_on: ["task-b"] }],
			}),
		);

		const result = validateProject(tmpDir);
		assert.strictEqual(result.valid, false, "missing depends_on target should cause error-level issue");
		const depIssue = result.issues.find((i) => i.message.includes("task-b") && i.message.includes("depends on"));
		assert.ok(depIssue, "should report issue about missing task dependency");
		assert.strictEqual(depIssue!.severity, "error");
		assert.strictEqual(depIssue!.block, "tasks");
	});

	it("reports issue with broken resolved_by reference", (t) => {
		const tmpDir = makeTmpDir("validate-issue-ref");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		fs.writeFileSync(
			path.join(projectDir, "issues.json"),
			JSON.stringify({
				issues: [
					{
						id: "g1",
						title: "resolved issue",
						body: "resolved issue body",
						location: "test.ts:1",
						status: "resolved",
						category: "issue",
						priority: "high",
						package: "test",
						resolved_by: "nonexistent-spec-42",
					},
				],
			}),
		);

		const result = validateProject(tmpDir);
		const issueRef = result.issues.find(
			(i) => i.message.includes("resolved_by") && i.message.includes("nonexistent-spec-42"),
		);
		assert.ok(issueRef, "should report issue about broken resolved_by reference");
		assert.strictEqual(issueRef!.block, "issues");
	});

	it("returns valid for an empty project directory", (t) => {
		const tmpDir = makeTmpDir("validate-empty");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		const result = validateProject(tmpDir);
		assert.strictEqual(result.valid, true);
		assert.deepStrictEqual(result.issues, []);
	});

	it("returns valid for partial project with only tasks (no phases or decisions)", (t) => {
		const tmpDir = makeTmpDir("validate-partial");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		// Tasks with no phase reference — no cross-ref to check
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({
				tasks: [
					{ id: "t1", description: "standalone task", status: "planned" },
					{ id: "t2", description: "another task", status: "in-progress", depends_on: ["t1"] },
				],
			}),
		);

		const result = validateProject(tmpDir);
		assert.strictEqual(result.valid, true, "partial project with valid internal refs should be valid");
		assert.deepStrictEqual(result.issues, []);
	});
});

// ── schemaInfo ──────────────────────────────────────────────────────────────

describe("schemaInfo", () => {
	it("extracts property metadata from a valid schema", (t) => {
		const tmpDir = makeTmpDir("schema-info");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const schemasDir = path.join(tmpDir, ".project", "schemas");
		fs.mkdirSync(schemasDir, { recursive: true });

		fs.writeFileSync(
			path.join(schemasDir, "widget.schema.json"),
			JSON.stringify({
				title: "Widget",
				type: "object",
				required: ["name", "parts"],
				properties: {
					name: { type: "string", description: "Widget name" },
					count: { type: "integer" },
					parts: {
						type: "array",
						items: {
							type: "object",
							required: ["id"],
							properties: {
								id: { type: "string" },
								label: { type: "string" },
							},
						},
					},
				},
			}),
		);

		const info = schemaInfo(tmpDir, "widget");
		assert.ok(info, "should return SchemaInfo for existing schema");
		assert.strictEqual(info!.name, "widget");
		assert.strictEqual(info!.title, "Widget");

		// Check properties
		const nameProp = info!.properties.find((p) => p.name === "name");
		assert.ok(nameProp);
		assert.strictEqual(nameProp!.type, "string");
		assert.strictEqual(nameProp!.required, true);
		assert.strictEqual(nameProp!.description, "Widget name");

		const countProp = info!.properties.find((p) => p.name === "count");
		assert.ok(countProp);
		assert.strictEqual(countProp!.type, "integer");
		assert.strictEqual(countProp!.required, false);

		// Check array keys
		assert.deepStrictEqual(info!.arrayKeys, ["parts"]);

		// Check item properties for the array
		assert.ok(info!.itemProperties);
		assert.ok(info!.itemProperties!.parts);
		const idItemProp = info!.itemProperties!.parts.find((p) => p.name === "id");
		assert.ok(idItemProp);
		assert.strictEqual(idItemProp!.required, true);
	});

	it("returns null for nonexistent schema", (t) => {
		const tmpDir = makeTmpDir("schema-info-missing");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const result = schemaInfo(tmpDir, "does-not-exist");
		assert.strictEqual(result, null);
	});

	it("extracts enum values from schema properties", (t) => {
		const tmpDir = makeTmpDir("schema-info-enum");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const schemasDir = path.join(tmpDir, ".project", "schemas");
		fs.mkdirSync(schemasDir, { recursive: true });

		fs.writeFileSync(
			path.join(schemasDir, "status-block.schema.json"),
			JSON.stringify({
				title: "Status Block",
				type: "object",
				required: ["status"],
				properties: {
					status: {
						type: "string",
						enum: ["open", "closed", "deferred"],
					},
					priority: {
						type: "string",
						enum: ["low", "medium", "high"],
					},
				},
			}),
		);

		const info = schemaInfo(tmpDir, "status-block");
		assert.ok(info);
		const statusProp = info!.properties.find((p) => p.name === "status");
		assert.ok(statusProp);
		assert.deepStrictEqual(statusProp!.enum, ["open", "closed", "deferred"]);

		const priorityProp = info!.properties.find((p) => p.name === "priority");
		assert.ok(priorityProp);
		assert.deepStrictEqual(priorityProp!.enum, ["low", "medium", "high"]);
	});
});

// ── schemaVocabulary ────────────────────────────────────────────────────────

describe("schemaVocabulary", () => {
	it("returns all schemas sorted by name", (t) => {
		const tmpDir = makeTmpDir("schema-vocab");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const schemasDir = path.join(tmpDir, ".project", "schemas");
		fs.mkdirSync(schemasDir, { recursive: true });

		fs.writeFileSync(
			path.join(schemasDir, "zebra.schema.json"),
			JSON.stringify({ title: "Zebra", type: "object", properties: { name: { type: "string" } } }),
		);
		fs.writeFileSync(
			path.join(schemasDir, "alpha.schema.json"),
			JSON.stringify({ title: "Alpha", type: "object", properties: { id: { type: "string" } } }),
		);
		fs.writeFileSync(
			path.join(schemasDir, "middle.schema.json"),
			JSON.stringify({ title: "Middle", type: "object", properties: { value: { type: "integer" } } }),
		);

		const vocab = schemaVocabulary(tmpDir);
		assert.strictEqual(vocab.length, 3);
		// Sorted by name (derived from filename)
		assert.strictEqual(vocab[0].name, "alpha");
		assert.strictEqual(vocab[1].name, "middle");
		assert.strictEqual(vocab[2].name, "zebra");
	});

	it("returns empty array when schemas directory does not exist", (t) => {
		const tmpDir = makeTmpDir("schema-vocab-none");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const vocab = schemaVocabulary(tmpDir);
		assert.deepStrictEqual(vocab, []);
	});
});

// ── blockStructure ──────────────────────────────────────────────────────────

describe("blockStructure", () => {
	it("reports array structure for populated blocks", (t) => {
		const tmpDir = makeTmpDir("block-struct");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		const schemasDir = path.join(projectDir, "schemas");
		fs.mkdirSync(schemasDir, { recursive: true });

		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({
				tasks: [
					{ id: "t1", description: "one", status: "planned" },
					{ id: "t2", description: "two", status: "completed" },
					{ id: "t3", description: "three", status: "planned" },
				],
			}),
		);
		fs.writeFileSync(path.join(schemasDir, "tasks.schema.json"), "{}");

		const structures = blockStructure(tmpDir);
		assert.strictEqual(structures.length, 1);

		const tasksBlock = structures.find((s) => s.name === "tasks");
		assert.ok(tasksBlock);
		assert.strictEqual(tasksBlock!.exists, true);
		assert.strictEqual(tasksBlock!.hasSchema, true);
		const tasksArray = tasksBlock!.arrays.find((a) => a.key === "tasks");
		assert.ok(tasksArray);
		assert.strictEqual(tasksArray!.itemCount, 3);
	});

	it("reports zero-length arrays for empty block arrays", (t) => {
		const tmpDir = makeTmpDir("block-struct-empty");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		fs.writeFileSync(path.join(projectDir, "items.json"), JSON.stringify({ items: [] }));

		const structures = blockStructure(tmpDir);
		assert.strictEqual(structures.length, 1);

		const itemsBlock = structures.find((s) => s.name === "items");
		assert.ok(itemsBlock);
		assert.strictEqual(itemsBlock!.exists, true);
		const itemsArray = itemsBlock!.arrays.find((a) => a.key === "items");
		assert.ok(itemsArray);
		assert.strictEqual(itemsArray!.itemCount, 0);
	});

	it("returns empty array when no blocks exist", (t) => {
		const tmpDir = makeTmpDir("block-struct-none");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const structures = blockStructure(tmpDir);
		assert.deepStrictEqual(structures, []);
	});
});
