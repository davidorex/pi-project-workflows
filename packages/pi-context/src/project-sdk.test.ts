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
import { appendToBlock, updateItemInBlock } from "./block-api.js";
import { clearLensValidators, getLensValidators, type LensValidator, registerLensValidator } from "./lens-validator.js";
import { writeBootstrapPointer } from "./project-dir.js";
import {
	availableBlocks,
	availableSchemas,
	blockStructure,
	completeTask,
	filterBlockItems,
	type ItemLocation,
	projectState,
	resolveItemsByIds,
	schemaInfo,
	schemaVocabulary,
	validateProject,
} from "./project-sdk.js";
import { ValidationError, validate } from "./schema-validator.js";

function makeTmpDir(prefix: string): string {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `sdk-${prefix}-`));
	writeBootstrapPointer(cwd, ".project");
	return cwd;
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

		// Set up phases as an array-block (DEC-0028): single phase.json holding
		// phases[] with PHASE-NNN ids. Two completed + one in-progress exercises
		// the completed-count `current` measure.
		fs.writeFileSync(
			path.join(wfDir, "phase.json"),
			JSON.stringify({
				phases: [
					{ id: "PHASE-001", name: "foundation", intent: "i", status: "completed" },
					{ id: "PHASE-002", name: "control", intent: "i", status: "completed" },
					{ id: "PHASE-008", name: "automation", intent: "i", status: "in-progress" },
				],
			}),
		);

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
						package: "pi-context",
					},
					{
						id: "g2",
						title: "resolved",
						body: "resolved detail",
						location: "src/mod.ts:20",
						status: "resolved",
						category: "cleanup",
						priority: "low",
						package: "pi-context",
					},
					{
						id: "g3",
						title: "another open",
						body: "another open detail",
						location: "src/mod.ts:30",
						status: "open",
						category: "capability",
						priority: "medium",
						package: "pi-context",
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

		assert.strictEqual(state.phases.total, 3); // phases[].length
		assert.strictEqual(state.phases.current, 2); // count of status==="completed" phases
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

// Edge-model validation (DEC-0013 / DEC-0036): validateProject now checks the
// closure-table edge graph (relations.json) for reference integrity, plus two
// relocated invariants (completed-task verification edge; decision forcing-artifact
// edge). The per-block inline-FK reference checks were dropped. Fixtures therefore
// supply config.json (relation_types registry) + relations.json (edges) + block files.

// Canonical relation_types registry shared across edge-model fixtures. Covers the
// two relocated invariants plus a generic ordering relation for graph cases.
const REL_TYPES = [
	{ canonical_id: "verification_verifies_item", display_name: "verifies", category: "data_flow" as const },
	{ canonical_id: "decision_addresses_gap", display_name: "addresses gap", category: "data_flow" as const },
	{ canonical_id: "task_depends_on_task", display_name: "depends on", category: "ordering" as const },
];

// Canonical config-declared invariants (DEC-0025): the two previously-hardcoded
// substrate invariants relocated into config DATA. Default-injected by
// writeConfig so existing edge-model fixtures fire the SAME invariants as before
// (regression parity). Messages use the {id} token so rendered text contains the
// real id string ('t1' / 'd1') the existing assertions match against.
const CANONICAL_INVARIANTS = [
	{
		id: "completed-task-has-verification",
		class: "requires-edge" as const,
		block: "tasks",
		where: { status: "completed" },
		relation_types: ["verification_verifies_item"],
		direction: "as_child" as const,
		severity: "error" as const,
		message: "Completed task '{id}' has no verification edge (verification_verifies_item)",
	},
	{
		id: "decision-cites-forcing-artifact",
		class: "requires-edge" as const,
		block: "decisions",
		relation_types: ["decision_addresses_issue", "decision_addresses_feature", "decision_addresses_gap"],
		direction: "as_parent" as const,
		severity: "error" as const,
		message: "Decision '{id}' cites no forcing artifact (decision_addresses_issue|feature|gap edge)",
	},
];

/**
 * Write a config.json with the canonical relation_types registry. block_kinds is
 * left empty so buildIdIndex's prefix-vs-block invariant does not constrain the
 * fixtures' ad-hoc ids (t1/d1/etc.) — this isolates the edge-integrity surface
 * under test from prefix enforcement. By default declares the two canonical
 * invariants (DEC-0025) so existing fixtures retain their prior invariant
 * coverage; pass a custom `invariants` array to exercise other invariant shapes.
 */
function writeConfig(
	projectDir: string,
	relationTypes = REL_TYPES,
	invariants: unknown[] = CANONICAL_INVARIANTS,
): void {
	fs.writeFileSync(
		path.join(projectDir, "config.json"),
		JSON.stringify({
			schema_version: "1.0.0",
			root: ".project",
			block_kinds: [],
			relation_types: relationTypes,
			invariants,
		}),
	);
}

/** Write relations.json (top-level Edge[] array). */
function writeRelations(projectDir: string, edges: Record<string, unknown>[]): void {
	fs.writeFileSync(path.join(projectDir, "relations.json"), JSON.stringify(edges));
}

describe("validateProject", () => {
	it("returns clean for a valid edge graph (every decision + completed task has its required edge)", (t) => {
		const tmpDir = makeTmpDir("validate-valid");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		writeConfig(projectDir);

		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({
				tasks: [
					{ id: "t1", description: "first task", status: "completed" },
					{ id: "t2", description: "second task", status: "planned" },
				],
			}),
		);
		fs.writeFileSync(
			path.join(projectDir, "verification.json"),
			JSON.stringify({
				verifications: [{ id: "v1", target: "t1", target_type: "task", status: "passed", method: "test" }],
			}),
		);
		fs.writeFileSync(
			path.join(projectDir, "decisions.json"),
			JSON.stringify({ decisions: [{ id: "d1", decision: "use X", rationale: "because", status: "decided" }] }),
		);
		fs.writeFileSync(
			path.join(projectDir, "framework-gaps.json"),
			JSON.stringify({ gaps: [{ id: "g1", title: "a gap" }] }),
		);

		writeRelations(projectDir, [
			// completed task t1 verified by v1 (child=task)
			{ parent: "v1", child: "t1", relation_type: "verification_verifies_item" },
			// decision d1 addresses gap g1 (parent=decision)
			{ parent: "d1", child: "g1", relation_type: "decision_addresses_gap" },
			// generic ordering edge between the two tasks
			{ parent: "t1", child: "t2", relation_type: "task_depends_on_task" },
		]);

		const result = validateProject(tmpDir);
		assert.strictEqual(result.status, "clean");
		assert.deepStrictEqual(result.issues, []);
	});

	it("reports error for an edge with a dangling parent", (t) => {
		const tmpDir = makeTmpDir("validate-dangling-parent");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		writeConfig(projectDir);

		fs.writeFileSync(path.join(projectDir, "tasks.json"), JSON.stringify({ tasks: [{ id: "t2", status: "planned" }] }));
		// parent "t-missing" resolves to nothing
		writeRelations(projectDir, [{ parent: "t-missing", child: "t2", relation_type: "task_depends_on_task" }]);

		const result = validateProject(tmpDir);
		assert.strictEqual(result.status, "invalid");
		const issue = result.issues.find((i) => i.message.includes("parent 't-missing'"));
		assert.ok(issue, "should report dangling-parent edge error");
		assert.strictEqual(issue!.severity, "error");
		assert.strictEqual(issue!.block, "relations");
	});

	it("reports error for an edge with a dangling child", (t) => {
		const tmpDir = makeTmpDir("validate-dangling-child");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		writeConfig(projectDir);

		fs.writeFileSync(path.join(projectDir, "tasks.json"), JSON.stringify({ tasks: [{ id: "t1", status: "planned" }] }));
		// child "t-missing" resolves to nothing
		writeRelations(projectDir, [{ parent: "t1", child: "t-missing", relation_type: "task_depends_on_task" }]);

		const result = validateProject(tmpDir);
		assert.strictEqual(result.status, "invalid");
		const issue = result.issues.find((i) => i.message.includes("child 't-missing'"));
		assert.ok(issue, "should report dangling-child edge error");
		assert.strictEqual(issue!.severity, "error");
		assert.strictEqual(issue!.block, "relations");
	});

	it("reports error for an edge with an unregistered relation_type", (t) => {
		const tmpDir = makeTmpDir("validate-unregistered-rt");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		writeConfig(projectDir);

		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({
				tasks: [
					{ id: "t1", status: "planned" },
					{ id: "t2", status: "planned" },
				],
			}),
		);
		// relation_type "task_blocks_task" is not in REL_TYPES
		writeRelations(projectDir, [{ parent: "t1", child: "t2", relation_type: "task_blocks_task" }]);

		const result = validateProject(tmpDir);
		assert.strictEqual(result.status, "invalid");
		const issue = result.issues.find((i) => i.message.includes("relation_type 'task_blocks_task'"));
		assert.ok(issue, "should report unregistered relation_type error");
		assert.strictEqual(issue!.severity, "error");
		assert.strictEqual(issue!.block, "relations");
	});

	it("reports error for a decision without a forcing-artifact edge", (t) => {
		const tmpDir = makeTmpDir("validate-dec-no-forcing");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		writeConfig(projectDir);

		fs.writeFileSync(
			path.join(projectDir, "decisions.json"),
			JSON.stringify({ decisions: [{ id: "d1", decision: "use X", rationale: "because", status: "decided" }] }),
		);
		fs.writeFileSync(
			path.join(projectDir, "framework-gaps.json"),
			JSON.stringify({ gaps: [{ id: "g1", title: "a gap" }] }),
		);
		// edge present, but it is NOT a decision_addresses_* edge → invariant fails
		writeRelations(projectDir, [{ parent: "g1", child: "d1", relation_type: "task_depends_on_task" }]);

		const result = validateProject(tmpDir);
		assert.strictEqual(result.status, "invalid");
		const issue = result.issues.find(
			(i) => i.message.includes("Decision 'd1'") && i.message.includes("forcing artifact"),
		);
		assert.ok(issue, "should report decision-missing-forcing-artifact error");
		assert.strictEqual(issue!.severity, "error");
		assert.strictEqual(issue!.block, "decisions");
	});

	it("reports error for a completed task without a verification edge", (t) => {
		const tmpDir = makeTmpDir("validate-task-no-ver");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		writeConfig(projectDir);

		// Two tasks so an edge exists (the edge-check block requires ≥1 edge), but
		// no verification_verifies_item edge targets the completed task t1.
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({
				tasks: [
					{ id: "t1", description: "done task", status: "completed" },
					{ id: "t2", description: "open task", status: "planned" },
				],
			}),
		);
		writeRelations(projectDir, [{ parent: "t1", child: "t2", relation_type: "task_depends_on_task" }]);

		const result = validateProject(tmpDir);
		assert.strictEqual(result.status, "invalid", "completed task without verification edge should be invalid");
		const issue = result.issues.find(
			(i) => i.message.includes("Completed task 't1'") && i.message.includes("verification_verifies_item"),
		);
		assert.ok(issue, "should report completed-task-missing-verification-edge error");
		assert.strictEqual(issue!.severity, "error");
		assert.strictEqual(issue!.block, "tasks");
		assert.ok(issue!.field!.includes("verification"));
	});

	it("returns clean for an empty project directory", (t) => {
		const tmpDir = makeTmpDir("validate-empty");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		const result = validateProject(tmpDir);
		assert.strictEqual(result.status, "clean");
		assert.deepStrictEqual(result.issues, []);
	});

	it("skips edge checks gracefully for a pre-bootstrap project (no config / no relations)", (t) => {
		const tmpDir = makeTmpDir("validate-pre-bootstrap");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		// blocks present but no config.json + no relations.json → edge model absent
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({ tasks: [{ id: "t1", description: "completed but no edges", status: "completed" }] }),
		);
		fs.writeFileSync(
			path.join(projectDir, "decisions.json"),
			JSON.stringify({ decisions: [{ id: "d1", decision: "use X", rationale: "because", status: "decided" }] }),
		);

		const result = validateProject(tmpDir);
		// no config → no edge checks, no relocated invariants → clean
		assert.strictEqual(result.status, "clean");
		assert.deepStrictEqual(result.issues, []);
	});
});

// ── Config-declared invariants (DEC-0025: vocabulary-neutral generic loop) ────
// validateProject enforces config.invariants[] generically per the requires-edge
// class. These tests drive that loop with CUSTOM invariant data — including
// FOREIGN vocabulary the source has zero literals for — to prove the engine
// commits to no block/status/relation_type vocabulary itself.

describe("config-declared invariants (requires-edge)", () => {
	it("ABSENCE fires: completed task with no satisfying edge is flagged", (t) => {
		const tmpDir = makeTmpDir("inv-absence");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		writeConfig(projectDir, REL_TYPES, [
			{
				id: "req-x",
				class: "requires-edge",
				block: "tasks",
				where: { status: "completed" },
				relation_types: ["verification_verifies_item"],
				direction: "as_child",
			},
		]);

		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({ tasks: [{ id: "t1", status: "completed" }] }),
		);
		writeRelations(projectDir, []); // zero satisfying edges

		const result = validateProject(tmpDir);
		assert.strictEqual(result.status, "invalid");
		const issue = result.issues.find((i) => i.code === "req-x");
		assert.ok(issue, "absent required edge must fire a diagnostic (unit-2.1 false-pass lesson)");
		assert.strictEqual(issue!.severity, "error");
		assert.strictEqual(issue!.block, "tasks");
	});

	it("presence clears: satisfying edge removes the diagnostic", (t) => {
		const tmpDir = makeTmpDir("inv-presence");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		writeConfig(projectDir, REL_TYPES, [
			{
				id: "req-x",
				class: "requires-edge",
				block: "tasks",
				where: { status: "completed" },
				relation_types: ["verification_verifies_item"],
				direction: "as_child",
			},
		]);

		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({ tasks: [{ id: "t1", status: "completed" }] }),
		);
		fs.writeFileSync(
			path.join(projectDir, "verification.json"),
			JSON.stringify({
				verifications: [{ id: "v1", target: "t1", target_type: "task", status: "passed", method: "test" }],
			}),
		);
		writeRelations(projectDir, [{ parent: "v1", child: "t1", relation_type: "verification_verifies_item" }]);

		const result = validateProject(tmpDir);
		assert.ok(!result.issues.some((i) => i.code === "req-x"), "satisfied invariant must produce no diagnostic");
	});

	it("where-filter excludes non-matching items", (t) => {
		const tmpDir = makeTmpDir("inv-where");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		writeConfig(projectDir, REL_TYPES, [
			{
				id: "req-x",
				class: "requires-edge",
				block: "tasks",
				where: { status: "completed" },
				relation_types: ["verification_verifies_item"],
				direction: "as_child",
			},
		]);

		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({
				tasks: [
					{ id: "t1", status: "completed" },
					{ id: "t2", status: "planned" },
				],
			}),
		);
		writeRelations(projectDir, []); // no satisfying edges for either

		const result = validateProject(tmpDir);
		const flaggedT1 = result.issues.some((i) => i.code === "req-x" && i.field?.startsWith("t1."));
		const flaggedT2 = result.issues.some((i) => i.code === "req-x" && i.field?.startsWith("t2."));
		assert.ok(flaggedT1, "completed t1 must be flagged");
		assert.ok(!flaggedT2, "non-matching (where excludes) t2 must NOT be flagged");
	});

	it("direction matters: as_parent requires the item to be edge.parent", (t) => {
		const tmpDir = makeTmpDir("inv-direction");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		const invariants = [
			{
				id: "req-parent",
				class: "requires-edge",
				block: "decisions",
				relation_types: ["decision_addresses_gap"],
				direction: "as_parent",
			},
		];
		writeConfig(projectDir, REL_TYPES, invariants);

		fs.writeFileSync(
			path.join(projectDir, "decisions.json"),
			JSON.stringify({ decisions: [{ id: "d1", status: "decided" }] }),
		);
		fs.writeFileSync(
			path.join(projectDir, "framework-gaps.json"),
			JSON.stringify({ gaps: [{ id: "g1", title: "a gap" }] }),
		);

		// d1 is the CHILD of the right relation_type → does NOT satisfy as_parent.
		writeRelations(projectDir, [{ parent: "g1", child: "d1", relation_type: "decision_addresses_gap" }]);
		const wrong = validateProject(tmpDir);
		assert.ok(
			wrong.issues.some((i) => i.code === "req-parent"),
			"item as child must NOT satisfy as_parent invariant",
		);

		// d1 is now the PARENT → satisfies.
		writeRelations(projectDir, [{ parent: "d1", child: "g1", relation_type: "decision_addresses_gap" }]);
		const right = validateProject(tmpDir);
		assert.ok(!right.issues.some((i) => i.code === "req-parent"), "item as parent satisfies as_parent invariant");
	});

	it("multiple relation_types: any-of satisfies", (t) => {
		const tmpDir = makeTmpDir("inv-anyof");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		writeConfig(
			projectDir,
			[
				{ canonical_id: "ra", display_name: "ra", category: "data_flow" as const },
				{ canonical_id: "rb", display_name: "rb", category: "data_flow" as const },
			],
			[
				{
					id: "req-anyof",
					class: "requires-edge",
					block: "decisions",
					relation_types: ["ra", "rb"],
					direction: "as_parent",
				},
			],
		);

		fs.writeFileSync(
			path.join(projectDir, "decisions.json"),
			JSON.stringify({ decisions: [{ id: "d1", status: "decided" }] }),
		);
		fs.writeFileSync(
			path.join(projectDir, "framework-gaps.json"),
			JSON.stringify({ gaps: [{ id: "g1", title: "a gap" }] }),
		);
		// satisfied by an `rb` edge alone (the second of the any-of set)
		writeRelations(projectDir, [{ parent: "d1", child: "g1", relation_type: "rb" }]);

		const result = validateProject(tmpDir);
		assert.ok(!result.issues.some((i) => i.code === "req-anyof"), "any one matching relation_type satisfies");
	});

	it("severity override: warning yields status 'warnings'", (t) => {
		const tmpDir = makeTmpDir("inv-severity");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		writeConfig(projectDir, REL_TYPES, [
			{
				id: "req-warn",
				class: "requires-edge",
				block: "tasks",
				where: { status: "completed" },
				relation_types: ["verification_verifies_item"],
				direction: "as_child",
				severity: "warning",
			},
		]);

		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({ tasks: [{ id: "t1", status: "completed" }] }),
		);
		writeRelations(projectDir, []);

		const result = validateProject(tmpDir);
		const issue = result.issues.find((i) => i.code === "req-warn");
		assert.ok(issue, "violating item must fire");
		assert.strictEqual(issue!.severity, "warning");
		assert.strictEqual(result.status, "warnings", "warning-only invariant must not push status to invalid");
	});

	it("empty invariants: no invariant-sourced issues", (t) => {
		const tmpDir = makeTmpDir("inv-empty");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		writeConfig(projectDir, REL_TYPES, []); // no invariants declared

		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({ tasks: [{ id: "t1", status: "completed" }] }),
		);
		writeRelations(projectDir, []); // no edges → no dangling-edge errors either

		const result = validateProject(tmpDir);
		assert.strictEqual(result.status, "clean", "no invariants + no edges → clean");
		assert.deepStrictEqual(result.issues, []);
	});

	it("DEC-0025 universalization: enforces a conception shipped with zero source literals", (t) => {
		const tmpDir = makeTmpDir("inv-foreign");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		writeConfig(
			projectDir,
			[{ canonical_id: "note_supports_claim", display_name: "supports", category: "data_flow" as const }],
			[
				{
					id: "draft-note-needs-support",
					class: "requires-edge",
					block: "notes",
					where: { kind: "draft" },
					relation_types: ["note_supports_claim"],
					direction: "as_parent",
				},
			],
		);

		fs.writeFileSync(
			path.join(projectDir, "notes.json"),
			JSON.stringify({
				notes: [
					{ id: "n1", kind: "draft" },
					{ id: "n2", kind: "final" },
				],
			}),
		);
		fs.writeFileSync(path.join(projectDir, "claims.json"), JSON.stringify({ claims: [{ id: "c1" }] }));

		// No edge → draft note n1 flagged; final note n2 (kind≠draft) NOT flagged.
		writeRelations(projectDir, []);
		const before = validateProject(tmpDir);
		assert.ok(
			before.issues.some((i) => i.code === "draft-note-needs-support" && i.field?.startsWith("n1.")),
			"draft note without support must be flagged for a vocabulary the source ships zero literals for",
		);
		assert.ok(
			!before.issues.some((i) => i.code === "draft-note-needs-support" && i.field?.startsWith("n2.")),
			"final note (where excludes) must NOT be flagged",
		);

		// Add the supporting edge → n1 clears.
		writeRelations(projectDir, [{ parent: "n1", child: "c1", relation_type: "note_supports_claim" }]);
		const after = validateProject(tmpDir);
		assert.ok(!after.issues.some((i) => i.code === "draft-note-needs-support"), "supported draft note clears");
	});

	it("code + token substitution: code equals inv.id, message renders the real id", (t) => {
		const tmpDir = makeTmpDir("inv-token");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		writeConfig(projectDir, REL_TYPES, [
			{
				id: "needs-ver",
				class: "requires-edge",
				block: "tasks",
				where: { status: "completed" },
				relation_types: ["verification_verifies_item"],
				direction: "as_child",
				message: "Task '{id}' in '{block}' is unverified",
			},
		]);

		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({ tasks: [{ id: "t1", status: "completed" }] }),
		);
		writeRelations(projectDir, []);

		const result = validateProject(tmpDir);
		const issue = result.issues.find((i) => i.code === "needs-ver");
		assert.ok(issue, "must fire");
		assert.strictEqual(issue!.code, "needs-ver", "code mirrors inv.id");
		assert.ok(issue!.message.includes("'t1'"), "message renders the real id");
		assert.ok(!issue!.message.includes("{id}"), "message must not contain the literal token");
		assert.ok(issue!.message.includes("'tasks'"), "message renders the real block name");
	});
});

// ── Validation result status field ──────────────────────────────────────────

describe("validation result status field", () => {
	it("status is 'clean' when zero issues", (t) => {
		const tmpDir = makeTmpDir("status-clean");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		writeConfig(projectDir);

		// Valid graph: completed task verified, decision cites a forcing artifact.
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({ tasks: [{ id: "t1", description: "task", status: "completed" }] }),
		);
		fs.writeFileSync(
			path.join(projectDir, "verification.json"),
			JSON.stringify({
				verifications: [{ id: "v1", target: "t1", target_type: "task", status: "passed", method: "test" }],
			}),
		);
		fs.writeFileSync(
			path.join(projectDir, "decisions.json"),
			JSON.stringify({ decisions: [{ id: "d1", decision: "use X", rationale: "because", status: "decided" }] }),
		);
		fs.writeFileSync(
			path.join(projectDir, "framework-gaps.json"),
			JSON.stringify({ gaps: [{ id: "g1", title: "a gap" }] }),
		);
		writeRelations(projectDir, [
			{ parent: "v1", child: "t1", relation_type: "verification_verifies_item" },
			{ parent: "d1", child: "g1", relation_type: "decision_addresses_gap" },
		]);

		const result = validateProject(tmpDir);
		assert.strictEqual(result.status, "clean");
		assert.deepStrictEqual(result.issues, []);
	});

	it("status is 'invalid' when errors present", (t) => {
		const tmpDir = makeTmpDir("status-invalid");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		writeConfig(projectDir);

		// Edge with a dangling child — produces an error-severity issue.
		fs.writeFileSync(path.join(projectDir, "tasks.json"), JSON.stringify({ tasks: [{ id: "t1", status: "planned" }] }));
		writeRelations(projectDir, [{ parent: "t1", child: "t-nonexistent", relation_type: "task_depends_on_task" }]);

		const result = validateProject(tmpDir);
		assert.strictEqual(result.status, "invalid");
	});

	it("status is 'warnings' when only warnings present", (t) => {
		// Warning-severity issues no longer arise from the built-in edge checks
		// (every edge-integrity + relocated-invariant issue is an error). The
		// remaining warning source is a registered lens-validator; this drives the
		// warningCount>0 → "warnings" derivation honestly through that surface.
		const snapshot: LensValidator[] = [...getLensValidators()];
		t.after(() => {
			clearLensValidators();
			for (const v of snapshot) registerLensValidator(v);
		});
		clearLensValidators();
		registerLensValidator({
			name: "status-warning-validator",
			validate: () => ({
				status: "warnings" as const,
				issues: [
					{ code: "status_warn", severity: "warning" as const, message: "warn", block: "fake", field: "fake.f" },
				],
			}),
		});

		const tmpDir = makeTmpDir("status-warnings");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		fs.mkdirSync(path.join(tmpDir, ".project"), { recursive: true });

		const result = validateProject(tmpDir);
		assert.strictEqual(result.status, "warnings");
		assert.ok(result.issues.length > 0, "should have at least one warning issue");
		assert.ok(
			result.issues.every((i) => i.severity === "warning"),
			"all issues should be warnings",
		);
	});
});

// ── lens-validator dispatch (Step 7) ──────────────────────────────────────

describe("validateProject lens-validator dispatch", () => {
	// Late-bound import to avoid clearing the registry at this file's top scope
	// (other test files in the same tsx --test run rely on module-init
	// registrations). Each test reaches in, snapshots, mutates, restores.
	it("merges issues from a registered lens-validator into validateProject output", (t) => {
		// Snapshot the existing registry so we can restore after the test —
		// must not strand permanent test-only validators in the module-level
		// registry that other tests would observe.
		const snapshot: LensValidator[] = [...getLensValidators()];
		t.after(() => {
			clearLensValidators();
			for (const v of snapshot) registerLensValidator(v);
		});

		clearLensValidators();
		registerLensValidator({
			name: "sdk-test-validator",
			validate: () => ({
				status: "warnings" as const,
				issues: [
					{
						code: "sdk_dispatch_diagnostic",
						severity: "warning" as const,
						message: "merged from registered validator",
						block: "sdk-fake-block",
						field: "sdk.field",
					},
				],
			}),
		});

		const tmpDir = makeTmpDir("sdk-dispatch");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		fs.mkdirSync(path.join(tmpDir, ".project"), { recursive: true });

		const result = validateProject(tmpDir);
		const merged = result.issues.find((i) => i.code === "sdk_dispatch_diagnostic");
		assert.ok(merged, "expected sdk_dispatch_diagnostic to surface via dispatch");
		assert.strictEqual(merged.block, "sdk-fake-block");
		assert.strictEqual(merged.field, "sdk.field");
	});

	it("wraps a throwing lens-validator as a warning issue (defensive try/catch)", (t) => {
		const snapshot: LensValidator[] = [...getLensValidators()];
		t.after(() => {
			clearLensValidators();
			for (const v of snapshot) registerLensValidator(v);
		});

		clearLensValidators();
		registerLensValidator({
			name: "sdk-throwing-validator",
			validate: () => {
				throw new Error("boom from sdk test");
			},
		});

		const tmpDir = makeTmpDir("sdk-dispatch-throw");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		fs.mkdirSync(path.join(tmpDir, ".project"), { recursive: true });

		const result = validateProject(tmpDir);
		const wrapped = result.issues.find((i) => i.code === "lens_validator_failed:sdk-throwing-validator");
		assert.ok(wrapped, "expected wrapped failure issue from throwing validator");
		assert.strictEqual(wrapped.severity, "warning");
		assert.match(wrapped.message ?? "", /boom from sdk test/);
	});
});

// ── completeTask ───────────────────────────────────────────────────────────

describe("completeTask", () => {
	/** Helper: write a minimal tasks block */
	function writeTasks(dir: string, tasks: Record<string, unknown>[]) {
		fs.writeFileSync(path.join(dir, ".project", "tasks.json"), JSON.stringify({ tasks }));
	}

	/** Helper: write a minimal verification block */
	function writeVerifications(dir: string, verifications: Record<string, unknown>[]) {
		fs.writeFileSync(path.join(dir, ".project", "verification.json"), JSON.stringify({ verifications }));
	}

	it("completes a task with passing verification (happy path)", (t) => {
		const tmpDir = makeTmpDir("ct-happy");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		writeTasks(tmpDir, [{ id: "t1", description: "build it", status: "planned" }]);
		writeVerifications(tmpDir, [{ id: "v1", target: "t1", target_type: "task", status: "passed", method: "test" }]);

		const result = completeTask(tmpDir, "t1", "v1");
		assert.strictEqual(result.taskId, "t1");
		assert.strictEqual(result.verificationId, "v1");
		assert.strictEqual(result.verificationStatus, "passed");
		assert.strictEqual(result.previousStatus, "planned");

		// Read back and verify the task was updated
		const data = JSON.parse(fs.readFileSync(path.join(projectDir, "tasks.json"), "utf-8"));
		const task = data.tasks.find((t: Record<string, unknown>) => t.id === "t1");
		assert.strictEqual(task.status, "completed");
		assert.strictEqual(task.verification, "v1");
	});

	it("throws when verification entry does not exist", (t) => {
		const tmpDir = makeTmpDir("ct-no-ver");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		writeTasks(tmpDir, [{ id: "t1", description: "build it", status: "planned" }]);
		writeVerifications(tmpDir, []);

		assert.throws(
			() => completeTask(tmpDir, "t1", "v-missing"),
			(err: Error) => {
				assert.ok(err.message.includes("not found"));
				return true;
			},
		);
	});

	it("throws when verification targets wrong task", (t) => {
		const tmpDir = makeTmpDir("ct-wrong-target");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		writeTasks(tmpDir, [{ id: "t1", description: "build it", status: "planned" }]);
		writeVerifications(tmpDir, [
			{ id: "v1", target: "other-task", target_type: "task", status: "passed", method: "test" },
		]);

		assert.throws(
			() => completeTask(tmpDir, "t1", "v1"),
			(err: Error) => {
				assert.ok(err.message.includes("targets"));
				return true;
			},
		);
	});

	it("throws when verification targets wrong type", (t) => {
		const tmpDir = makeTmpDir("ct-wrong-type");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		writeTasks(tmpDir, [{ id: "t1", description: "build it", status: "planned" }]);
		writeVerifications(tmpDir, [{ id: "v1", target: "t1", target_type: "phase", status: "passed", method: "test" }]);

		assert.throws(
			() => completeTask(tmpDir, "t1", "v1"),
			(err: Error) => {
				assert.ok(err.message.includes("targets"));
				return true;
			},
		);
	});

	it("throws when verification status is failed", (t) => {
		const tmpDir = makeTmpDir("ct-ver-failed");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		writeTasks(tmpDir, [{ id: "t1", description: "build it", status: "planned" }]);
		writeVerifications(tmpDir, [{ id: "v1", target: "t1", target_type: "task", status: "failed", method: "test" }]);

		assert.throws(
			() => completeTask(tmpDir, "t1", "v1"),
			(err: Error) => {
				assert.ok(err.message.includes("not 'passed'"));
				return true;
			},
		);
	});

	it("throws when verification status is partial", (t) => {
		const tmpDir = makeTmpDir("ct-ver-partial");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		writeTasks(tmpDir, [{ id: "t1", description: "build it", status: "planned" }]);
		writeVerifications(tmpDir, [{ id: "v1", target: "t1", target_type: "task", status: "partial", method: "test" }]);

		assert.throws(
			() => completeTask(tmpDir, "t1", "v1"),
			(err: Error) => {
				assert.ok(err.message.includes("not 'passed'"));
				return true;
			},
		);
	});

	it("throws when verification status is skipped", (t) => {
		const tmpDir = makeTmpDir("ct-ver-skipped");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		writeTasks(tmpDir, [{ id: "t1", description: "build it", status: "planned" }]);
		writeVerifications(tmpDir, [{ id: "v1", target: "t1", target_type: "task", status: "skipped", method: "test" }]);

		assert.throws(
			() => completeTask(tmpDir, "t1", "v1"),
			(err: Error) => {
				assert.ok(err.message.includes("not 'passed'"));
				return true;
			},
		);
	});

	it("throws when task is already completed", (t) => {
		const tmpDir = makeTmpDir("ct-already-done");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		writeTasks(tmpDir, [{ id: "t1", description: "build it", status: "completed", verification: "v-old" }]);
		writeVerifications(tmpDir, [{ id: "v1", target: "t1", target_type: "task", status: "passed", method: "test" }]);

		assert.throws(
			() => completeTask(tmpDir, "t1", "v1"),
			(err: Error) => {
				assert.ok(err.message.includes("already completed"));
				return true;
			},
		);
	});

	it("throws when task is already cancelled", (t) => {
		const tmpDir = makeTmpDir("ct-cancelled");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		writeTasks(tmpDir, [{ id: "t1", description: "build it", status: "cancelled" }]);
		writeVerifications(tmpDir, [{ id: "v1", target: "t1", target_type: "task", status: "passed", method: "test" }]);

		assert.throws(
			() => completeTask(tmpDir, "t1", "v1"),
			(err: Error) => {
				assert.ok(err.message.includes("already cancelled"));
				return true;
			},
		);
	});

	it("throws when task is not found", (t) => {
		const tmpDir = makeTmpDir("ct-no-task");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		writeTasks(tmpDir, [{ id: "t1", description: "build it", status: "planned" }]);
		writeVerifications(tmpDir, [
			{ id: "v1", target: "t-missing", target_type: "task", status: "passed", method: "test" },
		]);

		assert.throws(
			() => completeTask(tmpDir, "t-missing", "v1"),
			(err: Error) => {
				assert.ok(err.message.includes("not found"));
				return true;
			},
		);
	});

	it("throws when verification block is missing", (t) => {
		const tmpDir = makeTmpDir("ct-no-ver-block");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		writeTasks(tmpDir, [{ id: "t1", description: "build it", status: "planned" }]);
		// No verification.json

		assert.throws(
			() => completeTask(tmpDir, "t1", "v1"),
			(err: Error) => {
				assert.ok(err.message.includes("Verification block not found"));
				return true;
			},
		);
	});

	it("throws when tasks block is missing", (t) => {
		const tmpDir = makeTmpDir("ct-no-task-block");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		// No tasks.json
		writeVerifications(tmpDir, [{ id: "v1", target: "t1", target_type: "task", status: "passed", method: "test" }]);

		assert.throws(
			() => completeTask(tmpDir, "t1", "v1"),
			(err: Error) => {
				assert.ok(err.message.includes("Tasks block not found"));
				return true;
			},
		);
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

// ── Schema-enforced verification gate (if/then) ───────────────────────────

/** Path to the real tasks.schema.json shipped as a default */
const REAL_TASKS_SCHEMA = path.join(
	path.dirname(new URL(import.meta.url).pathname),
	"..",
	"defaults",
	"schemas",
	"tasks.schema.json",
);

/**
 * Install the real tasks.schema.json into a test's .project/schemas/ directory.
 * Every enforcement test MUST call this — testing against an empty schema would
 * prove nothing about the if/then gate.
 */
function installTasksSchema(tmpDir: string): void {
	const schemasDir = path.join(tmpDir, ".project", "schemas");
	fs.mkdirSync(schemasDir, { recursive: true });
	fs.copyFileSync(REAL_TASKS_SCHEMA, path.join(schemasDir, "tasks.schema.json"));
}

/** Write a tasks block file directly (bypassing schema validation). */
function writeTasksRaw(tmpDir: string, tasks: Record<string, unknown>[]): void {
	const projectDir = path.join(tmpDir, ".project");
	fs.mkdirSync(projectDir, { recursive: true });
	fs.writeFileSync(path.join(projectDir, "tasks.json"), JSON.stringify({ tasks }));
}

describe("verification gate — AJV if/then enforcement", () => {
	it("(a) AJV if/then fires: validate() rejects closed-without-reason, accepts with-reason", () => {
		const schema = {
			type: "object",
			properties: {
				status: { type: "string", enum: ["open", "closed"] },
				reason: { type: "string" },
			},
			if: {
				properties: { status: { const: "closed" } },
				required: ["status"],
			},
			// biome-ignore lint/suspicious/noThenProperty: JSON Schema if/then is not Promise.then
			then: {
				required: ["reason"],
			},
		};

		// Should pass: open without reason
		validate(schema, { status: "open" }, "test-open");

		// Should fail: closed without reason
		assert.throws(
			() => validate(schema, { status: "closed" }, "test-closed-no-reason"),
			(err: unknown) => err instanceof ValidationError,
		);

		// Should pass: closed with reason
		validate(schema, { status: "closed", reason: "done" }, "test-closed-with-reason");
	});

	it("(b) updateItemInBlock rejects completed without verification", (t) => {
		const tmpDir = makeTmpDir("gate-update-reject");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		installTasksSchema(tmpDir);
		writeTasksRaw(tmpDir, [{ id: "t1", description: "a task", status: "in-progress" }]);

		// Attempt to set status=completed without verification — should fail
		assert.throws(
			() =>
				updateItemInBlock(tmpDir, "tasks", "tasks", (item) => item.id === "t1", {
					status: "completed",
				}),
			(err: unknown) => err instanceof ValidationError,
		);

		// Verify the file was not modified (atomic write rolled back)
		const data = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "tasks.json"), "utf-8"));
		assert.strictEqual(data.tasks[0].status, "in-progress", "task should remain in-progress after failed update");
	});

	it("(c) updateItemInBlock accepts completed WITH verification", (t) => {
		const tmpDir = makeTmpDir("gate-update-accept");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		installTasksSchema(tmpDir);
		writeTasksRaw(tmpDir, [{ id: "t1", description: "a task", status: "in-progress" }]);

		updateItemInBlock(tmpDir, "tasks", "tasks", (item) => item.id === "t1", {
			status: "completed",
			verification: "v1",
		});

		const data = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "tasks.json"), "utf-8"));
		assert.strictEqual(data.tasks[0].status, "completed");
		assert.strictEqual(data.tasks[0].verification, "v1");
	});

	it("(d) appendToBlock rejects completed item without verification", (t) => {
		const tmpDir = makeTmpDir("gate-append-reject");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		installTasksSchema(tmpDir);
		writeTasksRaw(tmpDir, []);

		assert.throws(
			() =>
				appendToBlock(tmpDir, "tasks", "tasks", {
					id: "t2",
					description: "new task",
					status: "completed",
				}),
			(err: unknown) => err instanceof ValidationError,
		);

		// Verify the file still has an empty array
		const data = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "tasks.json"), "utf-8"));
		assert.strictEqual(data.tasks.length, 0, "no task should have been appended");
	});

	it("(e) appendToBlock accepts completed item WITH verification", (t) => {
		const tmpDir = makeTmpDir("gate-append-accept");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		installTasksSchema(tmpDir);
		writeTasksRaw(tmpDir, []);

		appendToBlock(tmpDir, "tasks", "tasks", {
			id: "t2",
			description: "new task",
			status: "completed",
			verification: "v1",
		});

		const data = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "tasks.json"), "utf-8"));
		assert.strictEqual(data.tasks.length, 1);
		assert.strictEqual(data.tasks[0].status, "completed");
		assert.strictEqual(data.tasks[0].verification, "v1");
	});

	it("(f) non-completed statuses work without verification field", (t) => {
		const tmpDir = makeTmpDir("gate-non-completed");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		installTasksSchema(tmpDir);
		writeTasksRaw(tmpDir, [{ id: "t1", description: "a task", status: "planned" }]);

		// Each non-completed status should succeed without verification
		for (const status of ["in-progress", "blocked", "cancelled"]) {
			updateItemInBlock(tmpDir, "tasks", "tasks", (item) => item.id === "t1", { status });
			const data = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "tasks.json"), "utf-8"));
			assert.strictEqual(data.tasks[0].status, status, `status '${status}' should be accepted without verification`);
		}
	});

	it("(g) two-update sequence: first fails (no verification), second succeeds (with verification)", (t) => {
		const tmpDir = makeTmpDir("gate-two-step");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		installTasksSchema(tmpDir);
		writeTasksRaw(tmpDir, [{ id: "t1", description: "a task", status: "in-progress" }]);

		// First attempt: no verification — fails
		assert.throws(
			() =>
				updateItemInBlock(tmpDir, "tasks", "tasks", (item) => item.id === "t1", {
					status: "completed",
				}),
			(err: unknown) => err instanceof ValidationError,
		);

		// Read back: still in-progress
		const beforeData = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "tasks.json"), "utf-8"));
		assert.strictEqual(beforeData.tasks[0].status, "in-progress", "should remain in-progress after rejection");

		// Second attempt: with verification — succeeds
		updateItemInBlock(tmpDir, "tasks", "tasks", (item) => item.id === "t1", {
			status: "completed",
			verification: "v1",
		});

		const afterData = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "tasks.json"), "utf-8"));
		assert.strictEqual(afterData.tasks[0].status, "completed");
		assert.strictEqual(afterData.tasks[0].verification, "v1");
	});

	it("(h) validateProject returns error severity for completed task without verification (bypassed via fs)", (t) => {
		const tmpDir = makeTmpDir("gate-validate-severity");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		// Write directly via fs.writeFileSync — bypasses schema validation.
		// Edge-model (DEC-0036): completed task requires a verification_verifies_item
		// edge (child=task); config + relations present so the relocated invariant runs.
		writeConfig(projectDir);
		writeRelations(projectDir, []);
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({
				tasks: [{ id: "t1", description: "corrupted task", status: "completed" }],
			}),
		);

		const result = validateProject(tmpDir);
		assert.strictEqual(result.status, "invalid", "validateProject should report invalid for corrupted state");

		const issue = result.issues.find((i) => i.message.includes("no verification edge") && i.message.includes("t1"));
		assert.ok(issue, "should find the completed-without-verification-edge issue");
		assert.strictEqual(issue!.severity, "error", "severity should be error, not warning");
	});

	it("(i) completeTask happy path works with real schema installed", (t) => {
		const tmpDir = makeTmpDir("gate-complete-task");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		installTasksSchema(tmpDir);
		writeTasksRaw(tmpDir, [{ id: "t1", description: "build it", status: "planned" }]);

		// Write verification block (completeTask reads this)
		fs.writeFileSync(
			path.join(projectDir, "verification.json"),
			JSON.stringify({
				verifications: [{ id: "v1", target: "t1", target_type: "task", status: "passed", method: "test" }],
			}),
		);

		// completeTask sets both status and verification atomically — the if/then gate is satisfied
		const result = completeTask(tmpDir, "t1", "v1");
		assert.strictEqual(result.taskId, "t1");
		assert.strictEqual(result.previousStatus, "planned");

		// Read back and verify
		const data = JSON.parse(fs.readFileSync(path.join(projectDir, "tasks.json"), "utf-8"));
		assert.strictEqual(data.tasks[0].status, "completed");
		assert.strictEqual(data.tasks[0].verification, "v1");
	});
});

// ── filterBlockItems ─────────────────────────────────────────────────────────

/**
 * Fixture helper: write a block file + companion minimal schema. Schema is
 * intentionally permissive — filterBlockItems is a pure read-side query and
 * does not exercise write-time schema validation; the schema file's
 * presence keeps readBlock's normal substrate shape intact.
 */
function setupFilterBlock(tmpDir: string, blockName: string, arrayKey: string, items: unknown[]): void {
	const wfDir = path.join(tmpDir, ".project");
	const schemasDir = path.join(wfDir, "schemas");
	fs.mkdirSync(schemasDir, { recursive: true });
	const schema = {
		type: "object",
		required: [arrayKey],
		properties: {
			[arrayKey]: { type: "array", items: { type: "object" } },
		},
	};
	fs.writeFileSync(path.join(schemasDir, `${blockName}.schema.json`), JSON.stringify(schema));
	fs.writeFileSync(path.join(wfDir, `${blockName}.json`), JSON.stringify({ [arrayKey]: items }, null, 2));
}

describe("filterBlockItems", () => {
	it("filters by eq on a single field (framework-gaps status=identified)", (t) => {
		const tmpDir = makeTmpDir("filter-eq");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupFilterBlock(tmpDir, "framework-gaps", "gaps", [
			{ id: "FGAP-001", status: "closed", priority: "P1" },
			{ id: "FGAP-002", status: "identified", priority: "P0" },
			{ id: "FGAP-003", status: "identified", priority: "P2" },
		]);

		const result = filterBlockItems(tmpDir, "framework-gaps", { field: "status", op: "eq", value: "identified" });
		assert.strictEqual(result.length, 2);
		const ids = result.map((r) => (r as Record<string, unknown>).id);
		assert.deepStrictEqual(ids.sort(), ["FGAP-002", "FGAP-003"]);
	});

	it("filters by neq returning all non-matching items (tasks status!=completed)", (t) => {
		const tmpDir = makeTmpDir("filter-neq");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupFilterBlock(tmpDir, "tasks", "tasks", [
			{ id: "TASK-001", status: "completed" },
			{ id: "TASK-002", status: "planned" },
			{ id: "TASK-003", status: "in_progress" },
			{ id: "TASK-004", status: "completed" },
		]);

		const result = filterBlockItems(tmpDir, "tasks", { field: "status", op: "neq", value: "completed" });
		assert.strictEqual(result.length, 2);
		const ids = result.map((r) => (r as Record<string, unknown>).id);
		assert.deepStrictEqual(ids.sort(), ["TASK-002", "TASK-003"]);
	});

	it("filters by in against an array of values (decisions status in enacted|superseded)", (t) => {
		const tmpDir = makeTmpDir("filter-in");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupFilterBlock(tmpDir, "decisions", "decisions", [
			{ id: "DEC-0001", status: "enacted" },
			{ id: "DEC-0002", status: "open" },
			{ id: "DEC-0003", status: "superseded" },
			{ id: "DEC-0004", status: "open" },
		]);

		const result = filterBlockItems(tmpDir, "decisions", {
			field: "status",
			op: "in",
			value: ["enacted", "superseded"],
		});
		assert.strictEqual(result.length, 2);
		const ids = (result.map((r) => (r as Record<string, unknown>).id) as string[]).sort();
		assert.deepStrictEqual(ids, ["DEC-0001", "DEC-0003"]);
	});

	it("filters by matches via regexp against a string field (description partial match)", (t) => {
		const tmpDir = makeTmpDir("filter-matches");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupFilterBlock(tmpDir, "tasks", "tasks", [
			{ id: "TASK-001", description: "filter-block-items library" },
			{ id: "TASK-002", description: "resolve-items-by-id bulk lookup" },
			{ id: "TASK-003", description: "walk-ancestors closure-table traversal" },
		]);

		const result = filterBlockItems(tmpDir, "tasks", { field: "description", op: "matches", value: "block-items" });
		assert.strictEqual(result.length, 1);
		assert.strictEqual((result[0] as Record<string, unknown>).id, "TASK-001");
	});

	it("returns empty array when predicate matches nothing", (t) => {
		const tmpDir = makeTmpDir("filter-empty");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupFilterBlock(tmpDir, "tasks", "tasks", [
			{ id: "TASK-001", status: "planned" },
			{ id: "TASK-002", status: "in_progress" },
		]);

		const result = filterBlockItems(tmpDir, "tasks", { field: "status", op: "eq", value: "completed" });
		assert.deepStrictEqual(result, []);
	});

	it("excludes items missing the predicate field (documented uniform policy — no throw)", (t) => {
		const tmpDir = makeTmpDir("filter-missing");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupFilterBlock(tmpDir, "tasks", "tasks", [
			{ id: "TASK-001", status: "planned" },
			{ id: "TASK-002" }, // missing status
			{ id: "TASK-003", status: "planned" },
		]);

		// eq against the value the present items carry → only items with the
		// field present participate; the field-missing item is excluded
		// regardless of operator (uniform per FilterPredicate docstring).
		const eqResult = filterBlockItems(tmpDir, "tasks", { field: "status", op: "eq", value: "planned" });
		assert.strictEqual(eqResult.length, 2);
		const eqIds = (eqResult.map((r) => (r as Record<string, unknown>).id) as string[]).sort();
		assert.deepStrictEqual(eqIds, ["TASK-001", "TASK-003"]);

		// neq against a sentinel value: the field-missing item must NOT appear
		// in the result (would be a true "filter, not schema assertion" violation).
		const neqResult = filterBlockItems(tmpDir, "tasks", { field: "status", op: "neq", value: "blocked" });
		assert.strictEqual(neqResult.length, 2);
		const neqIds = (neqResult.map((r) => (r as Record<string, unknown>).id) as string[]).sort();
		assert.deepStrictEqual(neqIds, ["TASK-001", "TASK-003"]);
	});
});

// ── resolveItemsByIds (bulk) ────────────────────────────────────────────────

/**
 * Fixture helper for bulk-resolve tests: write a block file + a minimal
 * permissive schema (mirrors setupFilterBlock). Block content carries
 * objects with a top-level `id` field — the buildIdIndex contract that
 * resolveItemsByIds wraps. Schema presence keeps readBlock's substrate
 * shape intact; no schema-validation pressure here because the resolver
 * is a pure read-side index over already-on-disk data.
 */
function setupResolveBlock(tmpDir: string, blockName: string, arrayKey: string, items: unknown[]): void {
	const wfDir = path.join(tmpDir, ".project");
	const schemasDir = path.join(wfDir, "schemas");
	fs.mkdirSync(schemasDir, { recursive: true });
	const schema = {
		type: "object",
		required: [arrayKey],
		properties: {
			[arrayKey]: { type: "array", items: { type: "object" } },
		},
	};
	fs.writeFileSync(path.join(schemasDir, `${blockName}.schema.json`), JSON.stringify(schema));
	fs.writeFileSync(path.join(wfDir, `${blockName}.json`), JSON.stringify({ [arrayKey]: items }, null, 2));
}

describe("resolveItemsByIds", () => {
	it("returns ItemLocation entries for all-found ids across multiple blocks", (t) => {
		const tmpDir = makeTmpDir("resolve-all-found");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupResolveBlock(tmpDir, "decisions", "decisions", [
			{ id: "DEC-0001", title: "first" },
			{ id: "DEC-0002", title: "second" },
		]);
		setupResolveBlock(tmpDir, "tasks", "tasks", [{ id: "TASK-001", description: "first task" }]);

		const result = resolveItemsByIds(tmpDir, ["DEC-0001", "DEC-0002", "TASK-001"]);
		assert.strictEqual(result.size, 3);
		const decLoc = result.get("DEC-0001") as ItemLocation | null;
		assert.notStrictEqual(decLoc, null);
		assert.strictEqual(decLoc?.block, "decisions");
		assert.strictEqual(decLoc?.arrayKey, "decisions");
		assert.strictEqual((decLoc?.item as Record<string, unknown>).id, "DEC-0001");
		const taskLoc = result.get("TASK-001") as ItemLocation | null;
		assert.notStrictEqual(taskLoc, null);
		assert.strictEqual(taskLoc?.block, "tasks");
	});

	it("returns null entries for missing ids while resolving present ones (partial-found)", (t) => {
		const tmpDir = makeTmpDir("resolve-partial");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupResolveBlock(tmpDir, "decisions", "decisions", [{ id: "DEC-0001", title: "first" }]);

		const result = resolveItemsByIds(tmpDir, ["DEC-0001", "DEC-9999", "FGAP-9999"]);
		assert.strictEqual(result.size, 3);
		assert.notStrictEqual(result.get("DEC-0001"), null);
		assert.strictEqual(result.get("DEC-9999"), null);
		assert.strictEqual(result.get("FGAP-9999"), null);
	});

	it("returns null for every id when none exist in the index (none-found)", (t) => {
		const tmpDir = makeTmpDir("resolve-none");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupResolveBlock(tmpDir, "decisions", "decisions", [{ id: "DEC-0001", title: "first" }]);

		const result = resolveItemsByIds(tmpDir, ["FGAP-001", "TASK-999"]);
		assert.strictEqual(result.size, 2);
		assert.strictEqual(result.get("FGAP-001"), null);
		assert.strictEqual(result.get("TASK-999"), null);
	});

	it("resolves ids across 3+ block kinds in one call (cross-block)", (t) => {
		const tmpDir = makeTmpDir("resolve-cross-block");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupResolveBlock(tmpDir, "decisions", "decisions", [{ id: "DEC-0001" }]);
		setupResolveBlock(tmpDir, "framework-gaps", "gaps", [{ id: "FGAP-001" }]);
		setupResolveBlock(tmpDir, "tasks", "tasks", [{ id: "TASK-001" }]);

		const result = resolveItemsByIds(tmpDir, ["DEC-0001", "FGAP-001", "TASK-001"]);
		assert.strictEqual(result.size, 3);
		const decLoc = result.get("DEC-0001") as ItemLocation | null;
		const fgapLoc = result.get("FGAP-001") as ItemLocation | null;
		const taskLoc = result.get("TASK-001") as ItemLocation | null;
		assert.strictEqual(decLoc?.block, "decisions");
		assert.strictEqual(fgapLoc?.block, "framework-gaps");
		assert.strictEqual(taskLoc?.block, "tasks");
		// arrayKey per fixture
		assert.strictEqual(decLoc?.arrayKey, "decisions");
		assert.strictEqual(fgapLoc?.arrayKey, "gaps");
		assert.strictEqual(taskLoc?.arrayKey, "tasks");
	});

	it("dedups duplicate input ids per Map semantics — one entry, single resolution", (t) => {
		const tmpDir = makeTmpDir("resolve-dedup");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupResolveBlock(tmpDir, "decisions", "decisions", [{ id: "DEC-0001", title: "first" }]);

		const result = resolveItemsByIds(tmpDir, ["DEC-0001", "DEC-0001", "DEC-0001"]);
		assert.strictEqual(result.size, 1);
		assert.notStrictEqual(result.get("DEC-0001"), null);
	});

	it("returns an empty Map for empty input ids", (t) => {
		const tmpDir = makeTmpDir("resolve-empty");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupResolveBlock(tmpDir, "decisions", "decisions", [{ id: "DEC-0001" }]);

		const result = resolveItemsByIds(tmpDir, []);
		assert.strictEqual(result.size, 0);
	});
});
