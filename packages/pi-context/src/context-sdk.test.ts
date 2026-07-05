/**
 * Tests for context-sdk: contextState, availableBlocks, availableSchemas,
 * findAppendableBlocks, validateContext, schemaInfo, schemaVocabulary,
 * blockStructure.
 */

import assert from "node:assert";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { appendToBlock, updateItemInBlock } from "./block-api.js";
import type { ConfigBlock, RelationTypeDecl } from "./context.js";
import { writeBootstrapPointer } from "./context-dir.js";
import { registerSubstrate } from "./context-registry.js";
import {
	appendRelationByRef,
	availableBlocks,
	availableSchemas,
	blockStructure,
	buildIdIndex,
	completeTask,
	contextState,
	currentState,
	deriveBootstrapState,
	expectedBlockForId,
	filterBlockItems,
	findAppendableBlocks,
	type ItemLocation,
	joinBlocks,
	readBlockItem,
	readBlockPage,
	resolveItemsByIds,
	schemaInfo,
	schemaVocabulary,
	validateContext,
} from "./context-sdk.js";
import { cleanGitEnv } from "./git-env.js";
import { clearLensValidators, getLensValidators, type LensValidator, registerLensValidator } from "./lens-validator.js";
import { ValidationError, validate } from "./schema-validator.js";

function makeTmpDir(prefix: string): string {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `sdk-${prefix}-`));
	writeBootstrapPointer(cwd, ".project");
	return cwd;
}

// ── Bootstrap state (FGAP-095 P1 / DEC-0042) ─────────────────────────────────

describe("deriveBootstrapState", () => {
	const ctxDir = ".project";
	// Direct config write to <tmp>/<ctxDir>/config.json — the location resolveContextDir
	// resolves under makeTmpDir's pointer. (context-sdk.test.ts's own writeConfig helper
	// has a different positional signature; deriveBootstrapState only needs valid config JSON.)
	const writeCfg = (tmp: string, cfg: Record<string, unknown>): void => {
		fs.writeFileSync(path.join(tmp, ctxDir, "config.json"), JSON.stringify(cfg));
	};
	const declaring = {
		schema_version: "1.8.0",
		root: ctxDir,
		block_kinds: [],
		installed_schemas: ["foo"],
		installed_blocks: ["bar"],
	};

	it("no-pointer when there is no .pi-context.json (and never throws)", (t) => {
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sdk-bootstrap-nopointer-"));
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		const s = deriveBootstrapState(tmp);
		assert.strictEqual(s.state, "no-pointer");
		assert.strictEqual(s.contextDir, null);
		assert.deepStrictEqual(s.missing, { schemas: [], blocks: [] });
	});

	it("no-config when the pointer is present but config.json is absent", (t) => {
		const tmp = makeTmpDir("bootstrap-noconfig");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		fs.mkdirSync(path.join(tmp, ctxDir, "schemas"), { recursive: true });
		const s = deriveBootstrapState(tmp);
		assert.strictEqual(s.state, "no-config");
		assert.strictEqual(s.contextDir, path.join(tmp, ctxDir));
	});

	it("skeleton when the config is present but empty of vocabulary (FGAP-001 / DEC-0001)", (t) => {
		const tmp = makeTmpDir("bootstrap-skeleton");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		fs.mkdirSync(path.join(tmp, ctxDir, "schemas"), { recursive: true });
		// A skeleton config: schema-valid, empty of vocabulary (the shape init / switch -c write).
		writeCfg(tmp, { schema_version: "1.8.0", root: ctxDir, block_kinds: [] });
		const s = deriveBootstrapState(tmp);
		assert.strictEqual(s.state, "skeleton");
		assert.strictEqual(s.contextDir, path.join(tmp, ctxDir));
		assert.deepStrictEqual(s.missing, { schemas: [], blocks: [] });
	});

	it("not-installed when declared assets are absent, reporting the missing lists", (t) => {
		const tmp = makeTmpDir("bootstrap-notinstalled");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		fs.mkdirSync(path.join(tmp, ctxDir, "schemas"), { recursive: true });
		writeCfg(tmp, declaring);
		const s = deriveBootstrapState(tmp);
		assert.strictEqual(s.state, "not-installed");
		assert.deepStrictEqual(s.missing, { schemas: ["foo"], blocks: ["bar"] });
	});

	it("ready once every declared asset is materialized at its projectRoot dest", (t) => {
		const tmp = makeTmpDir("bootstrap-ready-full");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		const schemas = path.join(tmp, ctxDir, "schemas");
		fs.mkdirSync(schemas, { recursive: true });
		writeCfg(tmp, declaring);
		fs.writeFileSync(path.join(schemas, "foo.schema.json"), "{}");
		fs.writeFileSync(path.join(tmp, ctxDir, "bar.json"), "{}");
		const s = deriveBootstrapState(tmp);
		assert.strictEqual(s.state, "ready");
		assert.deepStrictEqual(s.missing, { schemas: [], blocks: [] });
	});

	it("partial materialization stays not-installed, listing only the absent asset", (t) => {
		const tmp = makeTmpDir("bootstrap-partial");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		const schemas = path.join(tmp, ctxDir, "schemas");
		fs.mkdirSync(schemas, { recursive: true });
		writeCfg(tmp, declaring);
		fs.writeFileSync(path.join(schemas, "foo.schema.json"), "{}"); // schema present, block absent
		const s = deriveBootstrapState(tmp);
		assert.strictEqual(s.state, "not-installed");
		assert.deepStrictEqual(s.missing, { schemas: [], blocks: ["bar"] });
	});

	it("propagates (throws) on a corrupt config.json — corruption is not a bootstrap state", (t) => {
		const tmp = makeTmpDir("bootstrap-corrupt");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		fs.mkdirSync(path.join(tmp, ctxDir, "schemas"), { recursive: true });
		// schema-invalid config (missing required schema_version + block_kinds), written directly
		fs.writeFileSync(path.join(tmp, ctxDir, "config.json"), "{}");
		assert.throws(() => deriveBootstrapState(tmp), ValidationError);
	});
});

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

// ── Pointer-less schema-discovery degradation (FGAP-074 C3) ──────────────────
// These functions reach the throwing resolveContextDir indirectly via the
// schemasDir path-builder. With no `.pi-context.json` bootstrap pointer they
// must degrade to [] rather than throwing BootstrapNotFoundError. (NOTE: no
// writeBootstrapPointer here — deliberately pointer-less.)
describe("schema-discovery readers degrade pointer-less", () => {
	it("availableSchemas returns [] with no bootstrap pointer", (t) => {
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sdk-nopointer-schemas-"));
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		assert.deepStrictEqual(availableSchemas(tmp), []);
	});

	it("findAppendableBlocks returns [] with no bootstrap pointer", (t) => {
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sdk-nopointer-appendable-"));
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		assert.deepStrictEqual(findAppendableBlocks(tmp), []);
	});

	it("schemaVocabulary returns [] with no bootstrap pointer", (t) => {
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sdk-nopointer-vocab-"));
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		assert.deepStrictEqual(schemaVocabulary(tmp), []);
	});
});

// ── Derived State ────────────────────────────────────────────────────────────

describe("contextState", () => {
	it("derives state from blocks and git", (t) => {
		const tmpDir = makeTmpDir("state");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		// Set up a minimal git repo
		execSync("git init && git commit --allow-empty -m 'init'", { cwd: tmpDir, stdio: "ignore", env: cleanGitEnv() });

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

		const state = contextState(tmpDir);

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

		const state = contextState(tmpDir);

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

// ── validateContext ─────────────────────────────────────────────────────────

// Edge-model validation (DEC-0013 / DEC-0036): validateContext now checks the
// closure-table edge graph (relations.json) for reference integrity, plus two
// relocated invariants (completed-task verification edge; decision forcing-artifact
// edge). The per-block inline-FK reference checks were dropped. Fixtures therefore
// supply config.json (relation_types registry) + relations.json (edges) + block files.

// Canonical relation_types registry shared across edge-model fixtures. Covers the
// two relocated invariants plus a generic ordering relation for graph cases.
const REL_TYPES = [
	{ canonical_id: "verification_verifies_item", display_name: "verifies", category: "data_flow" as const },
	{ canonical_id: "decision_addresses_gap", display_name: "addresses gap", category: "data_flow" as const },
	{
		canonical_id: "task_depends_on_task",
		display_name: "depends on",
		category: "ordering" as const,
		role_direction: "as_parent" as const,
	},
	// The stock gate relation carries role_direction as_child (the gate/primary at
	// edge.child, the waiting task at edge.parent) so the deriver classifies it as
	// gate-direction from config rather than a source literal (FGAP-113).
	{
		canonical_id: "task_gated_by_item",
		display_name: "gated by",
		category: "ordering" as const,
		role_direction: "as_child" as const,
	},
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
 * The stock `state_derivation` registry (TASK-020 / FGAP-017) — the exact values
 * the packaged catalog ships, mirroring currentState's pre-rewire hardcoded
 * couplings 1:1. Injected by default into `writeConfig` so the existing
 * edge-model + currentState fixtures derive normally (byte-equivalent to the
 * pre-rewire output). The not-configured test passes `null` to omit it.
 */
const STOCK_STATE_DERIVATION = {
	in_flight: { kinds: ["tasks"], bucket: "in_progress" },
	focus_fallback: { kind: "phase", bucket: "in_progress" },
	next_ranked: [
		{ kind: "tasks", label: "task", bucket: "todo", reason_template: "unblocked planned task" },
		{
			kind: "framework-gaps",
			label: "framework-gap",
			bucket: "todo",
			rank_field: "priority",
			rank_order: ["P0", "P1", "P2", "P3"],
			reason_template: "open gap (priority {rank_value})",
		},
	],
	blocked_by: { relation_types: ["task_depends_on_task", "task_gated_by_item"] },
	rollups: [
		{
			kind: "milestone",
			membership_relation: "phase_positioned_in_milestone",
			complete_status: "reached",
			incomplete_status: "planned",
		},
	],
	head_size: 15,
};

/**
 * Write a config.json with the canonical relation_types registry. block_kinds is
 * left empty so buildIdIndex's prefix-vs-block invariant does not constrain the
 * fixtures' ad-hoc ids (t1/d1/etc.) — this isolates the edge-integrity surface
 * under test from prefix enforcement. By default declares the two canonical
 * invariants (DEC-0025) so existing fixtures retain their prior invariant
 * coverage; pass a custom `invariants` array to exercise other invariant shapes.
 * Also injects the stock `state_derivation` registry by default (TASK-020) so
 * currentState derives normally; pass `stateDerivation: null` to OMIT it (the
 * not-configured signal) or a custom object to exercise custom vocabulary.
 */
function writeConfig(
	projectDir: string,
	relationTypes: RelationTypeDecl[] = REL_TYPES,
	invariants: unknown[] = CANONICAL_INVARIANTS,
	statusBuckets?: Record<string, string>,
	stateDerivation: unknown = STOCK_STATE_DERIVATION,
): void {
	fs.writeFileSync(
		path.join(projectDir, "config.json"),
		JSON.stringify({
			schema_version: "1.8.0",
			root: ".project",
			block_kinds: [],
			relation_types: relationTypes,
			invariants,
			...(statusBuckets ? { status_buckets: statusBuckets } : {}),
			...(stateDerivation !== null ? { state_derivation: stateDerivation } : {}),
		}),
	);
}

/** Write relations.json (top-level Edge[] array). */
function writeRelations(projectDir: string, edges: Record<string, unknown>[]): void {
	fs.writeFileSync(path.join(projectDir, "relations.json"), JSON.stringify(edges));
}

describe("validateContext", () => {
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

		const result = validateContext(tmpDir);
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

		const result = validateContext(tmpDir);
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

		const result = validateContext(tmpDir);
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

		const result = validateContext(tmpDir);
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

		const result = validateContext(tmpDir);
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

		const result = validateContext(tmpDir);
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

		const result = validateContext(tmpDir);
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

		const result = validateContext(tmpDir);
		// no config → no edge checks, no relocated invariants → clean
		assert.strictEqual(result.status, "clean");
		assert.deepStrictEqual(result.issues, []);
	});
});

// ── Config-declared invariants (DEC-0025: vocabulary-neutral generic loop) ────
// validateContext enforces config.invariants[] generically per the requires-edge
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

		const result = validateContext(tmpDir);
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

		const result = validateContext(tmpDir);
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

		const result = validateContext(tmpDir);
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
		const wrong = validateContext(tmpDir);
		assert.ok(
			wrong.issues.some((i) => i.code === "req-parent"),
			"item as child must NOT satisfy as_parent invariant",
		);

		// d1 is now the PARENT → satisfies.
		writeRelations(projectDir, [{ parent: "d1", child: "g1", relation_type: "decision_addresses_gap" }]);
		const right = validateContext(tmpDir);
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

		const result = validateContext(tmpDir);
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

		const result = validateContext(tmpDir);
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

		const result = validateContext(tmpDir);
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
		const before = validateContext(tmpDir);
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
		const after = validateContext(tmpDir);
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

		const result = validateContext(tmpDir);
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

		const result = validateContext(tmpDir);
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

		const result = validateContext(tmpDir);
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

		const result = validateContext(tmpDir);
		assert.strictEqual(result.status, "warnings");
		assert.ok(result.issues.length > 0, "should have at least one warning issue");
		assert.ok(
			result.issues.every((i) => i.severity === "warning"),
			"all issues should be warnings",
		);
	});
});

// ── lens-validator dispatch (Step 7) ──────────────────────────────────────

describe("validateContext lens-validator dispatch", () => {
	// Late-bound import to avoid clearing the registry at this file's top scope
	// (other test files in the same tsx --test run rely on module-init
	// registrations). Each test reaches in, snapshots, mutates, restores.
	it("merges issues from a registered lens-validator into validateContext output", (t) => {
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

		const result = validateContext(tmpDir);
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

		const result = validateContext(tmpDir);
		const wrapped = result.issues.find((i) => i.code === "lens_validator_failed:sdk-throwing-validator");
		assert.ok(wrapped, "expected wrapped failure issue from throwing validator");
		assert.strictEqual(wrapped.severity, "warning");
		assert.match(wrapped.message ?? "", /boom from sdk test/);
	});
});

// ── completeTask ───────────────────────────────────────────────────────────

describe("completeTask", () => {
	// FGAP-014: completeTask gates on the verification_verifies_item closure-table
	// edge (verification=parent, task=child), NOT the removed verification.target/
	// target_type fields. Seeds therefore (a) write schema-valid verifications with
	// no removed fields, (b) write a config.json registering verification_verifies_item
	// so appendRelationByRef + findReferencesInRepo operate against a real relation_type,
	// and (c) file the linking edge via appendRelationByRef — the real porcelain path.

	/** Helper: write a minimal tasks block */
	function writeTasks(dir: string, tasks: Record<string, unknown>[]) {
		fs.writeFileSync(path.join(dir, ".project", "tasks.json"), JSON.stringify({ tasks }));
	}

	/** Helper: write a minimal, schema-valid verification block (no removed target/target_type fields) */
	function writeVerifications(dir: string, verifications: Record<string, unknown>[]) {
		fs.writeFileSync(path.join(dir, ".project", "verification.json"), JSON.stringify({ verifications }));
	}

	/**
	 * Write a config.json that registers verification_verifies_item in relation_types[]
	 * (empty block_kinds so buildIdIndex's prefix-vs-block invariant does not constrain
	 * the fixtures' ad-hoc t1/v1 ids — appendRelationByRef resolves bare refnames through it).
	 */
	function writeEdgeConfig(projectDir: string) {
		fs.writeFileSync(
			path.join(projectDir, "config.json"),
			JSON.stringify({
				schema_version: "1.8.0",
				root: ".project",
				block_kinds: [],
				relation_types: [
					{ canonical_id: "verification_verifies_item", display_name: "verifies", category: "data_flow" },
				],
			}),
		);
	}

	/** File the canonical verification → task link via the real porcelain (appendRelationByRef). */
	function fileVerifiesEdge(dir: string, verId: string, taskId: string) {
		appendRelationByRef(dir, { parent: verId, child: taskId, relation_type: "verification_verifies_item" });
	}

	it("completes a task with a passing verification and filed verifies edge (happy path)", (t) => {
		const tmpDir = makeTmpDir("ct-happy");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		writeEdgeConfig(projectDir);

		writeTasks(tmpDir, [{ id: "t1", description: "build it", status: "planned" }]);
		writeVerifications(tmpDir, [{ id: "v1", status: "passed", method: "test" }]);
		fileVerifiesEdge(tmpDir, "v1", "t1");

		const result = completeTask(tmpDir, "t1", "v1");
		assert.strictEqual(result.taskId, "t1");
		assert.strictEqual(result.verificationId, "v1");
		assert.strictEqual(result.verificationStatus, "passed");
		assert.strictEqual(result.previousStatus, "planned");

		// Read back: task completed, and NO verification field embedded (the edge is the linkage).
		const data = JSON.parse(fs.readFileSync(path.join(projectDir, "tasks.json"), "utf-8"));
		const task = data.tasks.find((t: Record<string, unknown>) => t.id === "t1");
		assert.strictEqual(task.status, "completed");
		assert.ok(!("verification" in task), "no verification field should be embedded — the edge is the linkage");
	});

	it("throws when verification entry does not exist", (t) => {
		const tmpDir = makeTmpDir("ct-no-ver");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		writeEdgeConfig(projectDir);

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

	it("throws when no verifies edge links this verification to this task", (t) => {
		const tmpDir = makeTmpDir("ct-edge-elsewhere");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		writeEdgeConfig(projectDir);

		writeTasks(tmpDir, [
			{ id: "t1", description: "build it", status: "planned" },
			{ id: "t-other", description: "other", status: "planned" },
		]);
		writeVerifications(tmpDir, [{ id: "v1", status: "passed", method: "test" }]);
		// v1 verifies a DIFFERENT task — no edge links v1→t1.
		fileVerifiesEdge(tmpDir, "v1", "t-other");

		assert.throws(
			() => completeTask(tmpDir, "t1", "v1"),
			(err: Error) => {
				assert.ok(err.message.includes("does not verify task"));
				assert.ok(err.message.includes("verification_verifies_item"));
				return true;
			},
		);
	});

	it("throws when a passing verification has NO verifies edge at all (FGAP-014 real-substrate scenario)", (t) => {
		const tmpDir = makeTmpDir("ct-no-edge");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		writeEdgeConfig(projectDir);

		writeTasks(tmpDir, [{ id: "t1", description: "build it", status: "planned" }]);
		writeVerifications(tmpDir, [{ id: "v1", status: "passed", method: "test" }]);
		// No edge filed at all — the old field-smuggling tests masked exactly this.

		assert.throws(
			() => completeTask(tmpDir, "t1", "v1"),
			(err: Error) => {
				assert.ok(err.message.includes("does not verify task"));
				return true;
			},
		);
	});

	it("throws when verification status is failed", (t) => {
		const tmpDir = makeTmpDir("ct-ver-failed");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		writeEdgeConfig(projectDir);

		writeTasks(tmpDir, [{ id: "t1", description: "build it", status: "planned" }]);
		writeVerifications(tmpDir, [{ id: "v1", status: "failed", method: "test" }]);
		fileVerifiesEdge(tmpDir, "v1", "t1");

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
		writeEdgeConfig(projectDir);

		writeTasks(tmpDir, [{ id: "t1", description: "build it", status: "planned" }]);
		writeVerifications(tmpDir, [{ id: "v1", status: "partial", method: "test" }]);
		fileVerifiesEdge(tmpDir, "v1", "t1");

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
		writeEdgeConfig(projectDir);

		writeTasks(tmpDir, [{ id: "t1", description: "build it", status: "planned" }]);
		writeVerifications(tmpDir, [{ id: "v1", status: "skipped", method: "test" }]);
		fileVerifiesEdge(tmpDir, "v1", "t1");

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
		writeEdgeConfig(projectDir);

		writeTasks(tmpDir, [{ id: "t1", description: "build it", status: "completed" }]);
		writeVerifications(tmpDir, [{ id: "v1", status: "passed", method: "test" }]);
		fileVerifiesEdge(tmpDir, "v1", "t1");

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
		writeEdgeConfig(projectDir);

		writeTasks(tmpDir, [{ id: "t1", description: "build it", status: "cancelled" }]);
		writeVerifications(tmpDir, [{ id: "v1", status: "passed", method: "test" }]);
		fileVerifiesEdge(tmpDir, "v1", "t1");

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
		writeEdgeConfig(projectDir);

		writeTasks(tmpDir, [{ id: "t1", description: "build it", status: "planned" }]);
		writeVerifications(tmpDir, [{ id: "v1", status: "passed", method: "test" }]);
		fileVerifiesEdge(tmpDir, "v1", "t-missing");

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
		writeEdgeConfig(projectDir);

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
		writeEdgeConfig(projectDir);

		// No tasks.json
		writeVerifications(tmpDir, [{ id: "v1", status: "passed", method: "test" }]);
		fileVerifiesEdge(tmpDir, "v1", "t1");

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

	it("(h) validateContext returns error severity for completed task without verification (bypassed via fs)", (t) => {
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

		const result = validateContext(tmpDir);
		assert.strictEqual(result.status, "invalid", "validateContext should report invalid for corrupted state");

		const issue = result.issues.find((i) => i.message.includes("no verification edge") && i.message.includes("t1"));
		assert.ok(issue, "should find the completed-without-verification-edge issue");
		assert.strictEqual(issue!.severity, "error", "severity should be error, not warning");
	});

	it("(i) completeTask happy path works with real schema installed", (t) => {
		const tmpDir = makeTmpDir("gate-complete-task");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		// FGAP-014: completeTask now targets the canonical edge model — task is
		// completed by setting { status: "completed" } with NO embedded verification
		// field; the verification_verifies_item edge is the linkage. So validate
		// against the CANONICAL tasks schema shape (samples/.context), which has no
		// `verification` field and no if/then gate — NOT the legacy defaults/ copy
		// (installTasksSchema), whose if/then requires a `verification` field that
		// the edge model deliberately no longer writes. additionalProperties is
		// permissive and id is unconstrained so this test's ad-hoc `t1` id validates,
		// mirroring the migrated completeTask suite's permissive fixture setup.
		const schemasDir = path.join(projectDir, "schemas");
		fs.mkdirSync(schemasDir, { recursive: true });
		fs.writeFileSync(
			path.join(schemasDir, "tasks.schema.json"),
			JSON.stringify({
				type: "object",
				required: ["tasks"],
				properties: {
					tasks: {
						type: "array",
						items: {
							type: "object",
							required: ["id"],
							properties: {
								id: { type: "string" },
								description: { type: "string" },
								status: {
									type: "string",
									enum: ["planned", "in-progress", "completed", "blocked", "cancelled"],
								},
							},
						},
					},
				},
			}),
		);
		// completeTask gates on the verification_verifies_item edge, not the removed
		// verification.target/target_type fields. Register the relation_type
		// (writeConfig defaults to REL_TYPES, which declares verification_verifies_item)
		// so appendRelationByRef operates against a real relation_type.
		writeConfig(projectDir);
		writeTasksRaw(tmpDir, [{ id: "t1", description: "build it", status: "planned" }]);

		// Write verification block (completeTask reads this) — schema-valid, no removed fields.
		fs.writeFileSync(
			path.join(projectDir, "verification.json"),
			JSON.stringify({
				verifications: [{ id: "v1", status: "passed", method: "test" }],
			}),
		);

		// File the canonical verification → task link via the real porcelain (appendRelationByRef).
		appendRelationByRef(tmpDir, { parent: "v1", child: "t1", relation_type: "verification_verifies_item" });

		// completeTask sets { status: "completed" } and validates against the
		// canonical schema; the verifies edge (not a field) is the linkage.
		const result = completeTask(tmpDir, "t1", "v1");
		assert.strictEqual(result.taskId, "t1");
		assert.strictEqual(result.verificationId, "v1");
		assert.strictEqual(result.verificationStatus, "passed");
		assert.strictEqual(result.previousStatus, "planned");

		// Read back: task completed, and NO verification field embedded (edge model).
		const data = JSON.parse(fs.readFileSync(path.join(projectDir, "tasks.json"), "utf-8"));
		assert.strictEqual(data.tasks[0].status, "completed");
		assert.ok(!("verification" in data.tasks[0]), "no verification field should be embedded — the edge is the linkage");
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

// ── readBlockItem / readBlockPage (item-level reads, FGAP-045) ───────────────

/**
 * Build N items with ids ITEM-001..ITEM-NNN (1-indexed, zero-padded to 3).
 */
function makeItems(n: number): { id: string; n: number }[] {
	return Array.from({ length: n }, (_, i) => ({ id: `ITEM-${String(i + 1).padStart(3, "0")}`, n: i + 1 }));
}

/**
 * Write a block whose payload carries TWO top-level array properties — exercises
 * the discoverArrayKey ambiguity throw shared with filterBlockItems.
 */
function setupMultiArrayBlock(tmpDir: string, blockName: string): void {
	const wfDir = path.join(tmpDir, ".project");
	const schemasDir = path.join(wfDir, "schemas");
	fs.mkdirSync(schemasDir, { recursive: true });
	const schema = { type: "object", properties: { a: { type: "array" }, b: { type: "array" } } };
	fs.writeFileSync(path.join(schemasDir, `${blockName}.schema.json`), JSON.stringify(schema));
	fs.writeFileSync(path.join(wfDir, `${blockName}.json`), JSON.stringify({ a: [{ id: "X-1" }], b: [{ id: "Y-1" }] }));
}

/**
 * Write a block whose payload carries ZERO top-level array properties.
 */
function setupNoArrayBlock(tmpDir: string, blockName: string): void {
	const wfDir = path.join(tmpDir, ".project");
	const schemasDir = path.join(wfDir, "schemas");
	fs.mkdirSync(schemasDir, { recursive: true });
	const schema = { type: "object", properties: { meta: { type: "object" } } };
	fs.writeFileSync(path.join(schemasDir, `${blockName}.schema.json`), JSON.stringify(schema));
	fs.writeFileSync(path.join(wfDir, `${blockName}.json`), JSON.stringify({ meta: { version: 1 } }));
}

describe("readBlockItem", () => {
	it("returns the item when its id is present", (t) => {
		const tmpDir = makeTmpDir("rbi-found");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupFilterBlock(tmpDir, "tasks", "tasks", makeItems(5));

		const result = readBlockItem(tmpDir, "tasks", "ITEM-003");
		assert.notStrictEqual(result, null);
		assert.strictEqual((result as Record<string, unknown>).id, "ITEM-003");
	});

	it("returns null when no item carries the id", (t) => {
		const tmpDir = makeTmpDir("rbi-missing");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupFilterBlock(tmpDir, "tasks", "tasks", makeItems(5));

		assert.strictEqual(readBlockItem(tmpDir, "tasks", "ITEM-999"), null);
	});

	it("throws when the block file is missing (readBlock throw propagates)", (t) => {
		const tmpDir = makeTmpDir("rbi-no-block");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		assert.throws(() => readBlockItem(tmpDir, "nonexistent", "ITEM-001"));
	});

	it("returns null for a block with no top-level array property", (t) => {
		const tmpDir = makeTmpDir("rbi-no-array");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupNoArrayBlock(tmpDir, "config-ish");

		assert.strictEqual(readBlockItem(tmpDir, "config-ish", "ITEM-001"), null);
	});

	it("throws for a block with multiple top-level array properties", (t) => {
		const tmpDir = makeTmpDir("rbi-multi-array");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupMultiArrayBlock(tmpDir, "ambiguous");

		assert.throws(() => readBlockItem(tmpDir, "ambiguous", "X-1"));
	});
});

describe("readBlockPage", () => {
	it("returns a window slice with full total and hasMore (offset 10 limit 20 over 100)", (t) => {
		const tmpDir = makeTmpDir("rbp-window");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupFilterBlock(tmpDir, "framework-gaps", "gaps", makeItems(100));

		const page = readBlockPage(tmpDir, "framework-gaps", { offset: 10, limit: 20 });
		assert.strictEqual(page.items.length, 20);
		assert.strictEqual((page.items[0] as Record<string, unknown>).id, "ITEM-011");
		assert.strictEqual((page.items[19] as Record<string, unknown>).id, "ITEM-030");
		assert.strictEqual(page.total, 100);
		assert.strictEqual(page.hasMore, true);
	});

	it("applies default limit 50 / offset 0 when opts omitted", (t) => {
		const tmpDir = makeTmpDir("rbp-default");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupFilterBlock(tmpDir, "framework-gaps", "gaps", makeItems(100));

		const page = readBlockPage(tmpDir, "framework-gaps");
		assert.strictEqual(page.items.length, 50);
		assert.strictEqual((page.items[0] as Record<string, unknown>).id, "ITEM-001");
		assert.strictEqual(page.total, 100);
		assert.strictEqual(page.hasMore, true);
	});

	it("returns a partial last page with hasMore false (offset 95 limit 20 over 100)", (t) => {
		const tmpDir = makeTmpDir("rbp-last");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupFilterBlock(tmpDir, "framework-gaps", "gaps", makeItems(100));

		const page = readBlockPage(tmpDir, "framework-gaps", { offset: 95, limit: 20 });
		assert.strictEqual(page.items.length, 5);
		assert.strictEqual(page.total, 100);
		assert.strictEqual(page.hasMore, false);
		// ADVERSARIAL: total is the FULL item count, not the page length.
		assert.notStrictEqual(page.total, page.items.length);
	});

	it("returns empty items with correct total when offset >= total", (t) => {
		const tmpDir = makeTmpDir("rbp-beyond");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupFilterBlock(tmpDir, "framework-gaps", "gaps", makeItems(100));

		const page = readBlockPage(tmpDir, "framework-gaps", { offset: 200, limit: 50 });
		assert.deepStrictEqual(page.items, []);
		assert.strictEqual(page.total, 100);
		assert.strictEqual(page.hasMore, false);
	});

	it("returns {items:[],total:0,hasMore:false} for a block with no top-level array", (t) => {
		const tmpDir = makeTmpDir("rbp-no-array");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupNoArrayBlock(tmpDir, "config-ish");

		const page = readBlockPage(tmpDir, "config-ish");
		assert.deepStrictEqual(page, { items: [], total: 0, hasMore: false });
	});

	it("throws when the block file is missing (readBlock throw propagates)", (t) => {
		const tmpDir = makeTmpDir("rbp-no-block");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		assert.throws(() => readBlockPage(tmpDir, "nonexistent"));
	});

	it("throws for a block with multiple top-level array properties", (t) => {
		const tmpDir = makeTmpDir("rbp-multi-array");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupMultiArrayBlock(tmpDir, "ambiguous");

		assert.throws(() => readBlockPage(tmpDir, "ambiguous"));
	});
});

// ── joinBlocks (cross-block HYBRID join, FGAP-043) ───────────────────────────

/**
 * relation_types registry for the edge-mode join fixtures. Two relation types so
 * one fixture can exercise relation-type filtering + a 3rd-block exclusion case.
 */
const JOIN_REL_TYPES = [
	{ canonical_id: "task_verified_by", display_name: "verified by", category: "data_flow" as const },
	{ canonical_id: "task_depends_on_task", display_name: "depends on", category: "ordering" as const },
];

describe("joinBlocks", () => {
	// ── FIELD mode ──────────────────────────────────────────────────────────
	it("field mode: pairs left items with right items on a shared field value (left pre-filtered)", (t) => {
		const tmpDir = makeTmpDir("join-field-basic");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupFilterBlock(tmpDir, "tasks", "tasks", [
			{ id: "t1", status: "completed", verification: "VER-1" },
			{ id: "t2", status: "completed", verification: "VER-missing" },
			{ id: "t3", status: "planned", verification: "VER-1" },
		]);
		setupFilterBlock(tmpDir, "verification", "verifications", [{ id: "VER-1", target: "t1" }]);

		const result = joinBlocks(tmpDir, {
			leftBlock: "tasks",
			rightBlock: "verification",
			leftField: "verification",
			rightField: "id",
			leftPredicate: { field: "status", op: "eq", value: "completed" },
		});

		// leftPredicate excludes t3 (planned) → only t1 + t2 participate.
		assert.strictEqual(result.length, 2);
		const byId = new Map(result.map((r) => [r.left.id, r]));
		const t1 = byId.get("t1");
		assert.strictEqual(t1?.right.length, 1);
		assert.strictEqual((t1?.right[0] as Record<string, unknown>).id, "VER-1");
		// t2 references a non-existent verification id → empty array (not null).
		const t2 = byId.get("t2");
		assert.deepStrictEqual(t2?.right, []);
	});

	it("field mode one-to-many: a left value shared by 2 right items → right.length === 2", (t) => {
		const tmpDir = makeTmpDir("join-field-multi");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupFilterBlock(tmpDir, "tasks", "tasks", [{ id: "t1", phase: "P-1" }]);
		setupFilterBlock(tmpDir, "notes", "notes", [
			{ id: "n1", phase: "P-1" },
			{ id: "n2", phase: "P-1" },
			{ id: "n3", phase: "P-2" },
		]);

		const result = joinBlocks(tmpDir, {
			leftBlock: "tasks",
			rightBlock: "notes",
			leftField: "phase",
			rightField: "phase",
		});
		assert.strictEqual(result.length, 1);
		assert.strictEqual(result[0].right.length, 2);
		const ids = (result[0].right.map((r) => (r as Record<string, unknown>).id) as string[]).sort();
		assert.deepStrictEqual(ids, ["n1", "n2"]);
	});

	it("field mode: a left item missing the join field → right:[]", (t) => {
		const tmpDir = makeTmpDir("join-field-missing");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupFilterBlock(tmpDir, "tasks", "tasks", [{ id: "t1" }]); // no `verification` field
		setupFilterBlock(tmpDir, "verification", "verifications", [{ id: "VER-1" }]);

		const result = joinBlocks(tmpDir, {
			leftBlock: "tasks",
			rightBlock: "verification",
			leftField: "verification",
			rightField: "id",
		});
		assert.strictEqual(result.length, 1);
		assert.deepStrictEqual(result[0].right, []);
	});

	// ── EDGE mode ───────────────────────────────────────────────────────────
	it("edge mode leftEndpoint=parent: left=parent items, right=resolved child-block items", (t) => {
		const tmpDir = makeTmpDir("join-edge-parent");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		writeConfig(projectDir, JOIN_REL_TYPES, []);
		setupFilterBlock(tmpDir, "tasks", "tasks", [{ id: "t1" }, { id: "t2" }]);
		setupFilterBlock(tmpDir, "verification", "verifications", [{ id: "v1" }, { id: "v2" }]);
		// edges: task (parent) → verification (child)
		writeRelations(projectDir, [
			{ parent: "t1", child: "v1", relation_type: "task_verified_by" },
			{ parent: "t2", child: "v2", relation_type: "task_verified_by" },
		]);

		const result = joinBlocks(tmpDir, {
			leftBlock: "tasks",
			rightBlock: "verification",
			relationType: "task_verified_by",
			leftEndpoint: "parent",
		});
		const byId = new Map(result.map((r) => [r.left.id, r]));
		assert.strictEqual((byId.get("t1")?.right[0] as Record<string, unknown>).id, "v1");
		assert.strictEqual((byId.get("t2")?.right[0] as Record<string, unknown>).id, "v2");
	});

	it("edge mode leftEndpoint=child: same edges but left=child items → right=parent-block items (opposite side)", (t) => {
		const tmpDir = makeTmpDir("join-edge-child");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		writeConfig(projectDir, JOIN_REL_TYPES, []);
		setupFilterBlock(tmpDir, "tasks", "tasks", [{ id: "t1" }]);
		setupFilterBlock(tmpDir, "verification", "verifications", [{ id: "v1" }]);
		writeRelations(projectDir, [{ parent: "t1", child: "v1", relation_type: "task_verified_by" }]);

		// leftEndpoint=parent: tasks (parent) → verification right
		const asParent = joinBlocks(tmpDir, {
			leftBlock: "tasks",
			rightBlock: "verification",
			relationType: "task_verified_by",
			leftEndpoint: "parent",
		});
		assert.strictEqual((asParent[0].right[0] as Record<string, unknown>).id, "v1");

		// leftEndpoint=child: verification (child) → tasks right (THE OPPOSITE side)
		const asChild = joinBlocks(tmpDir, {
			leftBlock: "verification",
			rightBlock: "tasks",
			relationType: "task_verified_by",
			leftEndpoint: "child",
		});
		assert.strictEqual(asChild[0].left.id, "v1");
		assert.strictEqual((asChild[0].right[0] as Record<string, unknown>).id, "t1");
		// Adversarial direction proof: parent-side right ids ≠ child-side right ids.
		assert.notDeepStrictEqual(
			asParent.map((r) => (r.right[0] as Record<string, unknown>).id),
			asChild.map((r) => (r.right[0] as Record<string, unknown>).id),
		);
	});

	it("edge mode one-to-many: a left with 2 matching edges → right.length === 2", (t) => {
		const tmpDir = makeTmpDir("join-edge-multi");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		writeConfig(projectDir, JOIN_REL_TYPES, []);
		setupFilterBlock(tmpDir, "tasks", "tasks", [{ id: "t1" }]);
		setupFilterBlock(tmpDir, "verification", "verifications", [{ id: "v1" }, { id: "v2" }]);
		writeRelations(projectDir, [
			{ parent: "t1", child: "v1", relation_type: "task_verified_by" },
			{ parent: "t1", child: "v2", relation_type: "task_verified_by" },
		]);

		const result = joinBlocks(tmpDir, {
			leftBlock: "tasks",
			rightBlock: "verification",
			relationType: "task_verified_by",
		});
		assert.strictEqual(result.length, 1);
		assert.strictEqual(result[0].right.length, 2);
		const ids = (result[0].right.map((r) => (r as Record<string, unknown>).id) as string[]).sort();
		assert.deepStrictEqual(ids, ["v1", "v2"]);
	});

	it("edge mode rightBlock scoping: an edge resolving to a 3rd block is excluded", (t) => {
		const tmpDir = makeTmpDir("join-edge-scope");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		writeConfig(projectDir, JOIN_REL_TYPES, []);
		setupFilterBlock(tmpDir, "tasks", "tasks", [{ id: "t1" }]);
		setupFilterBlock(tmpDir, "verification", "verifications", [{ id: "v1" }]);
		setupFilterBlock(tmpDir, "notes", "notes", [{ id: "n1" }]);
		// t1 connects to BOTH a verification (target rightBlock) and a note (3rd block).
		writeRelations(projectDir, [
			{ parent: "t1", child: "v1", relation_type: "task_verified_by" },
			{ parent: "t1", child: "n1", relation_type: "task_verified_by" },
		]);

		const result = joinBlocks(tmpDir, {
			leftBlock: "tasks",
			rightBlock: "verification",
			relationType: "task_verified_by",
		});
		assert.strictEqual(result.length, 1);
		// n1 (notes block) excluded; only v1 (verification block) survives scoping.
		assert.strictEqual(result[0].right.length, 1);
		assert.strictEqual((result[0].right[0] as Record<string, unknown>).id, "v1");
	});

	it("edge mode unknown relationType: every right:[] (permissive, no throw)", (t) => {
		const tmpDir = makeTmpDir("join-edge-unknown-rt");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		writeConfig(projectDir, JOIN_REL_TYPES, []);
		setupFilterBlock(tmpDir, "tasks", "tasks", [{ id: "t1" }]);
		setupFilterBlock(tmpDir, "verification", "verifications", [{ id: "v1" }]);
		writeRelations(projectDir, [{ parent: "t1", child: "v1", relation_type: "task_verified_by" }]);

		const result = joinBlocks(tmpDir, {
			leftBlock: "tasks",
			rightBlock: "verification",
			relationType: "no_such_relation",
		});
		assert.strictEqual(result.length, 1);
		assert.deepStrictEqual(result[0].right, []);
	});

	// ── mode validation ─────────────────────────────────────────────────────
	it("mode validation: relationType + leftField together throws", (t) => {
		const tmpDir = makeTmpDir("join-mode-both");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupFilterBlock(tmpDir, "tasks", "tasks", [{ id: "t1" }]);
		setupFilterBlock(tmpDir, "verification", "verifications", [{ id: "v1" }]);
		assert.throws(() =>
			joinBlocks(tmpDir, {
				leftBlock: "tasks",
				rightBlock: "verification",
				relationType: "task_verified_by",
				leftField: "verification",
				rightField: "id",
			}),
		);
	});

	it("mode validation: neither relationType nor field mode throws", (t) => {
		const tmpDir = makeTmpDir("join-mode-neither");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupFilterBlock(tmpDir, "tasks", "tasks", [{ id: "t1" }]);
		setupFilterBlock(tmpDir, "verification", "verifications", [{ id: "v1" }]);
		assert.throws(() => joinBlocks(tmpDir, { leftBlock: "tasks", rightBlock: "verification" }));
	});

	it("mode validation: leftField without rightField throws", (t) => {
		const tmpDir = makeTmpDir("join-mode-half-field");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupFilterBlock(tmpDir, "tasks", "tasks", [{ id: "t1" }]);
		setupFilterBlock(tmpDir, "verification", "verifications", [{ id: "v1" }]);
		assert.throws(() =>
			joinBlocks(tmpDir, { leftBlock: "tasks", rightBlock: "verification", leftField: "verification" }),
		);
	});

	it("missing block throws (readBlock throw propagates)", (t) => {
		const tmpDir = makeTmpDir("join-missing-block");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		assert.throws(() =>
			joinBlocks(tmpDir, { leftBlock: "nonexistent", rightBlock: "verification", leftField: "x", rightField: "id" }),
		);
	});

	it("invariant: every JoinResult.right is an Array (never null)", (t) => {
		const tmpDir = makeTmpDir("join-invariant-array");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		writeConfig(projectDir, JOIN_REL_TYPES, []);
		setupFilterBlock(tmpDir, "tasks", "tasks", [{ id: "t1" }, { id: "t2", verification: "VER-1" }]);
		setupFilterBlock(tmpDir, "verification", "verifications", [{ id: "VER-1" }]);
		writeRelations(projectDir, []);

		const field = joinBlocks(tmpDir, {
			leftBlock: "tasks",
			rightBlock: "verification",
			leftField: "verification",
			rightField: "id",
		});
		for (const pair of field) assert.ok(Array.isArray(pair.right));
		const edge = joinBlocks(tmpDir, {
			leftBlock: "tasks",
			rightBlock: "verification",
			relationType: "task_verified_by",
		});
		for (const pair of edge) assert.ok(Array.isArray(pair.right));
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

// ── currentState (zero-loss "where are we + what's next") ─────────────────────
// Fixtures reuse the writeConfig (empty block_kinds → no prefix-vs-block
// enforcement on ad-hoc ids) + writeRelations helpers. Block files are written
// raw via fs.writeFileSync as elsewhere in this suite; buildIdIndex reads them
// via readBlock and loadRelations AJV-validates the relations array.
describe("currentState", () => {
	function setup(tmpDir: string): string {
		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		writeConfig(projectDir);
		return projectDir;
	}

	it("inFlight contains only in-progress tasks (planned excluded)", (t) => {
		const tmpDir = makeTmpDir("cs-inflight");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = setup(tmpDir);
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({
				tasks: [
					{ id: "TASK-A", description: "active one", status: "in-progress" },
					{ id: "TASK-B", description: "queued one", status: "planned" },
				],
			}),
		);

		const state = currentState(tmpDir);
		assert.strictEqual(state.inFlight.length, 1);
		assert.strictEqual(state.inFlight[0].id, "TASK-A");
		assert.strictEqual(state.inFlight[0].block, "tasks");
		assert.strictEqual(state.inFlight[0].description, "active one");
	});

	it("blocked when a task_depends_on_task parent is not completed; ready once it is", (t) => {
		const tmpDir = makeTmpDir("cs-blocked");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = setup(tmpDir);
		// edge parent=TASK-A child=TASK-B ⇒ TASK-B depends on TASK-A
		fs.writeFileSync(
			path.join(projectDir, "relations.json"),
			JSON.stringify([{ parent: "TASK-A", child: "TASK-B", relation_type: "task_depends_on_task" }]),
		);

		// Phase 1: TASK-A planned (not completed) → TASK-B blocked by TASK-A.
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({
				tasks: [
					{ id: "TASK-A", description: "prereq", status: "planned" },
					{ id: "TASK-B", description: "dependent", status: "planned" },
				],
			}),
		);
		let state = currentState(tmpDir);
		const bEntry = state.blocked.find((b) => b.id === "TASK-B");
		assert.ok(bEntry, "TASK-B should be blocked");
		assert.deepStrictEqual(bEntry!.blockedBy, ["TASK-A"]);
		// TASK-B must not appear as a ready next-action while blocked.
		assert.ok(!state.nextActions.some((a) => a.id === "TASK-B"));
		// TASK-A has no incomplete deps → it is itself a ready next-action.
		assert.ok(state.nextActions.some((a) => a.id === "TASK-A" && a.kind === "task"));

		// Phase 2: complete TASK-A → TASK-B unblocked → ready next-action.
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({
				tasks: [
					{ id: "TASK-A", description: "prereq", status: "completed" },
					{ id: "TASK-B", description: "dependent", status: "planned" },
				],
			}),
		);
		state = currentState(tmpDir);
		assert.ok(!state.blocked.some((b) => b.id === "TASK-B"), "TASK-B should no longer be blocked");
		assert.ok(
			state.nextActions.some((a) => a.id === "TASK-B" && a.kind === "task"),
			"TASK-B should be a ready next-action",
		);
	});

	it("task_gated_by_item: gate-blocked while target incomplete; released once target completes", (t) => {
		const tmpDir = makeTmpDir("cs-gate");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = setup(tmpDir);
		// edge parent=TASK-G child=FGAP-1 ⇒ TASK-G is gated by FGAP-1.
		fs.writeFileSync(
			path.join(projectDir, "relations.json"),
			JSON.stringify([{ parent: "TASK-G", child: "FGAP-1", relation_type: "task_gated_by_item" }]),
		);
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({ tasks: [{ id: "TASK-G", description: "gated", status: "planned" }] }),
		);

		// Phase 1: gap identified (todo bucket, not complete) → TASK-G blocked by FGAP-1.
		fs.writeFileSync(
			path.join(projectDir, "framework-gaps.json"),
			JSON.stringify({ gaps: [{ id: "FGAP-1", title: "gate", status: "identified" }] }),
		);
		let state = currentState(tmpDir);
		const gEntry = state.blocked.find((b) => b.id === "TASK-G");
		assert.ok(gEntry, "TASK-G should be gate-blocked");
		assert.deepStrictEqual(gEntry!.blockedBy, ["FGAP-1"]);
		assert.ok(!state.nextActions.some((a) => a.id === "TASK-G"), "gate-blocked task absent from nextActions");

		// Phase 2: gap closed (complete bucket) → gate releases → TASK-G ready.
		fs.writeFileSync(
			path.join(projectDir, "framework-gaps.json"),
			JSON.stringify({ gaps: [{ id: "FGAP-1", title: "gate", status: "closed" }] }),
		);
		state = currentState(tmpDir);
		assert.ok(!state.blocked.some((b) => b.id === "TASK-G"), "TASK-G should no longer be blocked");
		assert.ok(
			state.nextActions.some((a) => a.id === "TASK-G" && a.kind === "task"),
			"TASK-G should be a ready next-action",
		);
	});

	it("task_gated_by_item: cross-kind gate targets release at their complete bucket", (t) => {
		const tmpDir = makeTmpDir("cs-gate-crosskind");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = setup(tmpDir);
		// Three tasks, each gated by a different kind of target: a decision, a
		// feature, and another task. Each target sits at its complete-bucket status
		// (decision→enacted, feature→complete, task→completed) ⇒ all gates released.
		fs.writeFileSync(
			path.join(projectDir, "relations.json"),
			JSON.stringify([
				{ parent: "TASK-D", child: "DEC-1", relation_type: "task_gated_by_item" },
				{ parent: "TASK-F", child: "FEAT-1", relation_type: "task_gated_by_item" },
				{ parent: "TASK-T", child: "TASK-P", relation_type: "task_gated_by_item" },
			]),
		);
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({
				tasks: [
					{ id: "TASK-D", description: "gated-by-decision", status: "planned" },
					{ id: "TASK-F", description: "gated-by-feature", status: "planned" },
					{ id: "TASK-T", description: "gated-by-task", status: "planned" },
					{ id: "TASK-P", description: "prereq task", status: "completed" },
				],
			}),
		);
		fs.writeFileSync(
			path.join(projectDir, "decisions.json"),
			JSON.stringify({ decisions: [{ id: "DEC-1", title: "d", status: "enacted" }] }),
		);
		fs.writeFileSync(
			path.join(projectDir, "features.json"),
			JSON.stringify({ features: [{ id: "FEAT-1", title: "f", status: "complete" }] }),
		);

		let state = currentState(tmpDir);
		assert.deepStrictEqual(state.blocked, [], "no gate should block when every target is complete-bucketed");
		for (const id of ["TASK-D", "TASK-F", "TASK-T"]) {
			assert.ok(
				state.nextActions.some((a) => a.id === id && a.kind === "task"),
				`${id} should be ready`,
			);
		}

		// Flip the decision to a non-complete bucket (open→todo) ⇒ TASK-D re-blocks,
		// the other two stay ready (kind-general bucket check, no special-casing).
		fs.writeFileSync(
			path.join(projectDir, "decisions.json"),
			JSON.stringify({ decisions: [{ id: "DEC-1", title: "d", status: "open" }] }),
		);
		state = currentState(tmpDir);
		const dEntry = state.blocked.find((b) => b.id === "TASK-D");
		assert.ok(dEntry, "TASK-D should re-block when its decision gate is open");
		assert.deepStrictEqual(dEntry!.blockedBy, ["DEC-1"]);
		assert.ok(
			state.nextActions.some((a) => a.id === "TASK-F"),
			"TASK-F stays ready",
		);
		assert.ok(
			state.nextActions.some((a) => a.id === "TASK-T"),
			"TASK-T stays ready",
		);
	});

	it("task with BOTH a dep and a gate: blockedBy is the union of unsatisfied dep-parents and gate-targets", (t) => {
		const tmpDir = makeTmpDir("cs-dep-gate-union");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = setup(tmpDir);
		// TASK-X depends on TASK-A (incomplete) AND is gated by FGAP-1 (incomplete).
		fs.writeFileSync(
			path.join(projectDir, "relations.json"),
			JSON.stringify([
				{ parent: "TASK-A", child: "TASK-X", relation_type: "task_depends_on_task" },
				{ parent: "TASK-X", child: "FGAP-1", relation_type: "task_gated_by_item" },
			]),
		);
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({
				tasks: [
					{ id: "TASK-A", description: "prereq", status: "planned" },
					{ id: "TASK-X", description: "dep+gate", status: "planned" },
				],
			}),
		);
		fs.writeFileSync(
			path.join(projectDir, "framework-gaps.json"),
			JSON.stringify({ gaps: [{ id: "FGAP-1", title: "gate", status: "identified" }] }),
		);

		let state = currentState(tmpDir);
		const xEntry = state.blocked.find((b) => b.id === "TASK-X");
		assert.ok(xEntry, "TASK-X should be blocked");
		// Dep parents discovered first, then gate targets (de-duplicated, order-preserving).
		assert.deepStrictEqual(xEntry!.blockedBy, ["TASK-A", "FGAP-1"]);
		assert.ok(!state.nextActions.some((a) => a.id === "TASK-X"));

		// Complete only the dep → gate still holds → TASK-X stays blocked by FGAP-1 alone.
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({
				tasks: [
					{ id: "TASK-A", description: "prereq", status: "completed" },
					{ id: "TASK-X", description: "dep+gate", status: "planned" },
				],
			}),
		);
		state = currentState(tmpDir);
		const xEntry2 = state.blocked.find((b) => b.id === "TASK-X");
		assert.ok(xEntry2, "TASK-X still blocked by its gate");
		assert.deepStrictEqual(xEntry2!.blockedBy, ["FGAP-1"]);
	});

	it("rollup-kind gate: releases on member completion regardless of stored status, and milestones[] agrees in the same read", (t) => {
		// The FGAP-116 live case: milestone stored status lags at the incomplete
		// value while its members are all complete. Gate satisfaction must consult
		// the rollup (released), and the milestones[] entry must report the SAME
		// verdict — no split-brain within one currentState payload.
		const tmpDir = makeTmpDir("cs-rollup-gate");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = setup(tmpDir);
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({ tasks: [{ id: "TASK-G", description: "gated on milestone", status: "planned" }] }),
		);
		fs.writeFileSync(
			path.join(projectDir, "phase.json"),
			JSON.stringify({ phases: [{ id: "PHASE-1", name: "done", intent: "i", status: "completed" }] }),
		);
		fs.writeFileSync(
			path.join(projectDir, "milestone.json"),
			JSON.stringify({ milestones: [{ id: "MILE-001", name: "m", status: "planned" }] }), // stored value LAGS
		);
		fs.writeFileSync(
			path.join(projectDir, "relations.json"),
			JSON.stringify([
				{ parent: "PHASE-1", child: "MILE-001", relation_type: "phase_positioned_in_milestone" },
				{ parent: "TASK-G", child: "MILE-001", relation_type: "task_gated_by_item" },
			]),
		);

		const state = currentState(tmpDir);
		assert.ok(!state.blocked.some((b) => b.id === "TASK-G"), "the rollup-complete milestone must release the gate");
		assert.ok(
			state.nextActions.some((a) => a.id === "TASK-G" && a.kind === "task"),
			"TASK-G should be a ready next-action",
		);
		assert.deepStrictEqual(
			state.milestones,
			[{ id: "MILE-001", status: "reached", phaseCount: 1 }],
			"milestones[] must report the same rollup verdict the gate consulted",
		);
	});

	it("rollup-kind gate: held while members are incomplete even when stored status claims complete; zero members never complete", (t) => {
		// No over-release: the stored value lying AHEAD (stored 'reached', member
		// in-progress) must not satisfy the gate — the rollup is the truth. A
		// member-less rollup item is likewise never complete (>=1 rule).
		const tmpDir = makeTmpDir("cs-rollup-held");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = setup(tmpDir);
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({
				tasks: [
					{ id: "TASK-G", description: "gated on lagging milestone", status: "planned" },
					{ id: "TASK-H", description: "gated on member-less milestone", status: "planned" },
				],
			}),
		);
		fs.writeFileSync(
			path.join(projectDir, "phase.json"),
			JSON.stringify({ phases: [{ id: "PHASE-1", name: "wip", intent: "i", status: "in-progress" }] }),
		);
		fs.writeFileSync(
			path.join(projectDir, "milestone.json"),
			JSON.stringify({
				milestones: [
					{ id: "MILE-001", name: "m", status: "reached" }, // stored value lies AHEAD
					{ id: "MILE-002", name: "empty", status: "reached" }, // zero members
				],
			}),
		);
		fs.writeFileSync(
			path.join(projectDir, "relations.json"),
			JSON.stringify([
				{ parent: "PHASE-1", child: "MILE-001", relation_type: "phase_positioned_in_milestone" },
				{ parent: "TASK-G", child: "MILE-001", relation_type: "task_gated_by_item" },
				{ parent: "TASK-H", child: "MILE-002", relation_type: "task_gated_by_item" },
			]),
		);

		const state = currentState(tmpDir);
		assert.deepStrictEqual(
			state.blocked.find((b) => b.id === "TASK-G")?.blockedBy,
			["MILE-001"],
			"an incomplete rollup must hold the gate despite the stored 'reached'",
		);
		assert.deepStrictEqual(
			state.blocked.find((b) => b.id === "TASK-H")?.blockedBy,
			["MILE-002"],
			"a member-less rollup item is never complete",
		);
		assert.deepStrictEqual(
			state.milestones.map((m) => m.status),
			["planned", "planned"],
			"milestones[] agrees with the gate verdicts",
		);
	});

	it("rollup-kind membership cycle: derives not-complete (guarded), never recurses forever", (t) => {
		// Two rollup-kind items each a member of the other — the visiting-set guard
		// must terminate the recursion and derive both not-complete.
		const tmpDir = makeTmpDir("cs-rollup-cycle");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = setup(tmpDir);
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({ tasks: [{ id: "TASK-G", description: "gated on cyclic milestone", status: "planned" }] }),
		);
		fs.writeFileSync(
			path.join(projectDir, "milestone.json"),
			JSON.stringify({
				milestones: [
					{ id: "MILE-001", name: "a", status: "planned" },
					{ id: "MILE-002", name: "b", status: "planned" },
				],
			}),
		);
		fs.writeFileSync(
			path.join(projectDir, "relations.json"),
			JSON.stringify([
				{ parent: "MILE-002", child: "MILE-001", relation_type: "phase_positioned_in_milestone" },
				{ parent: "MILE-001", child: "MILE-002", relation_type: "phase_positioned_in_milestone" },
				{ parent: "TASK-G", child: "MILE-001", relation_type: "task_gated_by_item" },
			]),
		);

		const state = currentState(tmpDir);
		assert.deepStrictEqual(
			state.blocked.find((b) => b.id === "TASK-G")?.blockedBy,
			["MILE-001"],
			"a cyclic rollup derives not-complete and holds the gate",
		);
		assert.deepStrictEqual(state.milestones.map((m) => m.status).sort(), ["planned", "planned"]);
	});

	it("task_gated_by_item: a dangling gate target (unknown id) is treated as satisfied (non-blocking)", (t) => {
		const tmpDir = makeTmpDir("cs-gate-dangling");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = setup(tmpDir);
		// Gate target GHOST-1 resolves to no item — mirror the dangling-dep guard.
		fs.writeFileSync(
			path.join(projectDir, "relations.json"),
			JSON.stringify([{ parent: "TASK-G", child: "GHOST-1", relation_type: "task_gated_by_item" }]),
		);
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({ tasks: [{ id: "TASK-G", description: "gated", status: "planned" }] }),
		);

		const state = currentState(tmpDir);
		assert.ok(!state.blocked.some((b) => b.id === "TASK-G"), "dangling gate target must not block");
		assert.ok(
			state.nextActions.some((a) => a.id === "TASK-G" && a.kind === "task"),
			"TASK-G should be ready",
		);
	});

	it("task_gated_by_item: a terminal-abandoned gate target (wontfix) keeps the task blocked", (t) => {
		const tmpDir = makeTmpDir("cs-gate-abandoned");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = setup(tmpDir);
		fs.writeFileSync(
			path.join(projectDir, "relations.json"),
			JSON.stringify([{ parent: "TASK-G", child: "FGAP-1", relation_type: "task_gated_by_item" }]),
		);
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({ tasks: [{ id: "TASK-G", description: "gated", status: "planned" }] }),
		);
		// wontfix buckets to "unknown" (terminal-but-not-complete) → gate NOT released.
		fs.writeFileSync(
			path.join(projectDir, "framework-gaps.json"),
			JSON.stringify({ gaps: [{ id: "FGAP-1", title: "gate", status: "wontfix" }] }),
		);

		const state = currentState(tmpDir);
		const gEntry = state.blocked.find((b) => b.id === "TASK-G");
		assert.ok(gEntry, "TASK-G stays blocked: wontfix is not the complete bucket");
		assert.deepStrictEqual(gEntry!.blockedBy, ["FGAP-1"]);
		assert.ok(!state.nextActions.some((a) => a.id === "TASK-G"));
	});

	it("scope confinement: decision_gated_by_item does NOT alter currentState (only task_gated_by_item)", (t) => {
		const tmpDir = makeTmpDir("cs-gate-scope");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = setup(tmpDir);
		// A decision_gated_by_item edge (and an unrelated gate kind) must be inert:
		// currentState buckets only tasks, and the gate filter matches the literal
		// "task_gated_by_item" — not a prefix/suffix.
		fs.writeFileSync(
			path.join(projectDir, "relations.json"),
			JSON.stringify([
				{ parent: "DEC-1", child: "FGAP-1", relation_type: "decision_gated_by_item" },
				{ parent: "FEAT-1", child: "FGAP-1", relation_type: "feature_gated_by_item" },
			]),
		);
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({ tasks: [{ id: "TASK-G", description: "ungated task", status: "planned" }] }),
		);
		fs.writeFileSync(
			path.join(projectDir, "framework-gaps.json"),
			JSON.stringify({ gaps: [{ id: "FGAP-1", title: "incomplete gate", status: "identified" }] }),
		);

		const state = currentState(tmpDir);
		assert.deepStrictEqual(state.blocked, [], "no task is gated by task_gated_by_item, so nothing is blocked");
		assert.ok(
			state.nextActions.some((a) => a.id === "TASK-G" && a.kind === "task"),
			"TASK-G unaffected by decision/feature gate edges",
		);
	});

	it("gate sibling (FGAP-113): a feature_gated_by_item in blocked_by, declared as_child, reads gate=child — the latent-sibling fix", (t) => {
		const tmpDir = makeTmpDir("cs-gate-sibling");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		// feature_gated_by_item shares the gate SHAPE of task_gated_by_item
		// (as_child: the gate/primary at edge.child, the waiter at edge.parent). The
		// pre-FGAP-113 deriver keyed the gate direction off the single literal
		// "task_gated_by_item", so this sibling — if placed in blocked_by — read the
		// SWAPPED (dependency) direction. Driven from role_direction it now reads
		// gate=child by construction.
		const rels = [
			...REL_TYPES,
			{
				canonical_id: "feature_gated_by_item",
				display_name: "feature gated by",
				category: "ordering" as const,
				role_direction: "as_child" as const,
			},
		];
		const sd = { ...STOCK_STATE_DERIVATION, blocked_by: { relation_types: ["feature_gated_by_item"] } };
		writeConfig(projectDir, rels, CANONICAL_INVARIANTS, undefined, sd);
		// edge parent=TASK-W (the waiter, counter endpoint) child=FEAT-G (the gate,
		// primary endpoint). The waiting task is gated by the feature.
		fs.writeFileSync(
			path.join(projectDir, "relations.json"),
			JSON.stringify([{ parent: "TASK-W", child: "FEAT-G", relation_type: "feature_gated_by_item" }]),
		);
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({ tasks: [{ id: "TASK-W", description: "waits on a feature", status: "planned" }] }),
		);
		// FEAT-G incomplete (planning buckets non-complete) → gate unsatisfied.
		fs.writeFileSync(
			path.join(projectDir, "features.json"),
			JSON.stringify({ features: [{ id: "FEAT-G", title: "gate feature", status: "planning" }] }),
		);

		let state = currentState(tmpDir);
		const wEntry = state.blocked.find((b) => b.id === "TASK-W");
		assert.ok(wEntry, "TASK-W is gate-blocked by FEAT-G (gate=child, not swapped)");
		assert.deepStrictEqual(wEntry!.blockedBy, ["FEAT-G"]);
		assert.ok(!state.nextActions.some((a) => a.id === "TASK-W"), "gate-blocked task absent from nextActions");
		// FEAT-G is NOT itself read as blocked — it sits at the gate (child) end, not
		// the waiting (parent) end (proves the direction is not swapped).
		assert.ok(!state.blocked.some((b) => b.id === "FEAT-G"), "the gate endpoint is not itself blocked");

		// Complete the feature → gate releases → TASK-W ready.
		fs.writeFileSync(
			path.join(projectDir, "features.json"),
			JSON.stringify({ features: [{ id: "FEAT-G", title: "gate feature", status: "complete" }] }),
		);
		state = currentState(tmpDir);
		assert.ok(!state.blocked.some((b) => b.id === "TASK-W"), "TASK-W released once its feature gate completes");
		assert.ok(
			state.nextActions.some((a) => a.id === "TASK-W" && a.kind === "task"),
			"TASK-W ready",
		);
	});

	it("unset role_direction (FGAP-113): a blocked_by relation with no declared role_direction reads as the dependency default", (t) => {
		const tmpDir = makeTmpDir("cs-gate-unset");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		// task_needs_task carries NO role_direction → the deriver classifies it as
		// the DEPENDENCY default (prerequisite at edge.parent, dependent at
		// edge.child), never the gate direction.
		const rels = [
			...REL_TYPES,
			{ canonical_id: "task_needs_task", display_name: "needs", category: "ordering" as const },
		];
		const sd = { ...STOCK_STATE_DERIVATION, blocked_by: { relation_types: ["task_needs_task"] } };
		writeConfig(projectDir, rels, CANONICAL_INVARIANTS, undefined, sd);
		// edge parent=TASK-P (prerequisite) child=TASK-C (dependent).
		fs.writeFileSync(
			path.join(projectDir, "relations.json"),
			JSON.stringify([{ parent: "TASK-P", child: "TASK-C", relation_type: "task_needs_task" }]),
		);
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({
				tasks: [
					{ id: "TASK-P", description: "prereq", status: "planned" },
					{ id: "TASK-C", description: "dependent", status: "planned" },
				],
			}),
		);

		const state = currentState(tmpDir);
		const cEntry = state.blocked.find((b) => b.id === "TASK-C");
		assert.ok(cEntry, "TASK-C blocked by its prerequisite (dependency default for an unset relation)");
		assert.deepStrictEqual(cEntry!.blockedBy, ["TASK-P"]);
		// The parent (TASK-P) is NOT itself blocked — unset reads dependency, not
		// gate; a gate misread would have blocked TASK-P by TASK-C.
		assert.ok(!state.blocked.some((b) => b.id === "TASK-P"), "the parent endpoint is not gate-blocked");
	});

	it("nextActions ranks open framework-gaps by priority (P1 before P3)", (t) => {
		const tmpDir = makeTmpDir("cs-gap-priority");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = setup(tmpDir);
		// Author P3 first to prove the sort, not file order, decides ranking.
		fs.writeFileSync(
			path.join(projectDir, "framework-gaps.json"),
			JSON.stringify({
				gaps: [
					{ id: "FGAP-LOW", title: "low", status: "identified", priority: "P3" },
					{ id: "FGAP-HIGH", title: "high", status: "identified", priority: "P1" },
				],
			}),
		);

		const state = currentState(tmpDir);
		const gapActions = state.nextActions.filter((a) => a.kind === "framework-gap");
		assert.deepStrictEqual(
			gapActions.map((a) => a.id),
			["FGAP-HIGH", "FGAP-LOW"],
		);
		assert.strictEqual(gapActions[0].priority, "P1");
	});

	it("focus reflects in-flight task; falls back to in-progress phase; else 'no active focus.'", (t) => {
		const tmpDir = makeTmpDir("cs-focus");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = setup(tmpDir);

		// (a) in-progress task → focus mentions it.
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({ tasks: [{ id: "TASK-A", description: "x", status: "in-progress" }] }),
		);
		assert.match(currentState(tmpDir).focus, /TASK-A/);

		// (b) no in-flight task + an in-progress phase → focus mentions the phase.
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({ tasks: [{ id: "TASK-A", description: "x", status: "planned" }] }),
		);
		fs.writeFileSync(
			path.join(projectDir, "phase.json"),
			JSON.stringify({ phases: [{ id: "PHASE-1", name: "groundwork", intent: "i", status: "in-progress" }] }),
		);
		assert.match(currentState(tmpDir).focus, /PHASE-1/);

		// (c) neither → "no active focus."
		fs.writeFileSync(
			path.join(projectDir, "phase.json"),
			JSON.stringify({ phases: [{ id: "PHASE-1", name: "groundwork", intent: "i", status: "planned" }] }),
		);
		assert.strictEqual(currentState(tmpDir).focus, "no active focus.");
	});

	it("configured-but-empty (state_derivation present, no block items) → all arrays empty, focus 'no active focus.', no throw", (t) => {
		const tmpDir = makeTmpDir("cs-empty");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		// Config present (stock state_derivation) but no block files: the deriver
		// runs over an empty index → empty arrays + 'no active focus.', DISTINCT
		// from the not-configured signal (which requires an ABSENT registry).
		setup(tmpDir);
		const state = currentState(tmpDir);
		assert.deepStrictEqual(state.inFlight, []);
		assert.deepStrictEqual(state.nextActions, []);
		assert.deepStrictEqual(state.blocked, []);
		assert.deepStrictEqual(state.milestones, []);
		assert.strictEqual(state.focus, "no active focus.");
	});

	it("milestone phase-rollup: reached iff ≥1 positioned phase and every parent phase complete (parent=phase/child=milestone)", (t) => {
		const tmpDir = makeTmpDir("cs-milestone");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = setup(tmpDir);
		// Edge orientation under test: parent=phase, child=milestone — the phase is
		// positioned IN the milestone. block resolves from filename: phase.json →
		// "phase", milestone.json → "milestone" (the deriver gates on those names).
		const milestonePath = path.join(projectDir, "milestone.json");
		const phasePath = path.join(projectDir, "phase.json");
		const relationsPath = path.join(projectDir, "relations.json");
		const mileItem = (id: string) => ({ id, name: id, status: "planned" });

		const writeRels = (edges: Record<string, unknown>[]) => fs.writeFileSync(relationsPath, JSON.stringify(edges));
		const writePhases = (phases: Record<string, unknown>[]) => fs.writeFileSync(phasePath, JSON.stringify({ phases }));
		fs.writeFileSync(milestonePath, JSON.stringify({ milestones: [mileItem("MILE-001")] }));
		const positioned = (phaseId: string) => ({
			parent: phaseId,
			child: "MILE-001",
			relation_type: "phase_positioned_in_milestone",
		});

		// (a) all placed phases complete → milestone derives reached.
		writeRels([positioned("PHASE-1"), positioned("PHASE-2")]);
		writePhases([
			{ id: "PHASE-1", name: "a", intent: "i", status: "completed" },
			{ id: "PHASE-2", name: "b", intent: "i", status: "completed" },
		]);
		let mile = currentState(tmpDir).milestones.find((m) => m.id === "MILE-001");
		assert.ok(mile, "MILE-001 should be derived");
		assert.strictEqual(mile!.status, "reached");
		assert.strictEqual(mile!.phaseCount, 2);

		// (b) a placed parent phase incomplete → planned.
		writePhases([
			{ id: "PHASE-1", name: "a", intent: "i", status: "completed" },
			{ id: "PHASE-2", name: "b", intent: "i", status: "in-progress" },
		]);
		mile = currentState(tmpDir).milestones.find((m) => m.id === "MILE-001");
		assert.strictEqual(mile!.status, "planned");
		assert.strictEqual(mile!.phaseCount, 2);

		// (c) no placed phases (no edges) → planned, phaseCount 0.
		writeRels([]);
		mile = currentState(tmpDir).milestones.find((m) => m.id === "MILE-001");
		assert.strictEqual(mile!.status, "planned");
		assert.strictEqual(mile!.phaseCount, 0);

		// (d) a dangling parent-phase endpoint (no such phase item) → does not throw,
		// counts the edge, derives planned (the unknown phase cannot bucket complete).
		writeRels([positioned("PHASE-MISSING")]);
		assert.doesNotThrow(() => currentState(tmpDir));
		mile = currentState(tmpDir).milestones.find((m) => m.id === "MILE-001");
		assert.strictEqual(mile!.status, "planned");
		assert.strictEqual(mile!.phaseCount, 1);
	});

	it("membership rollup orientation (FGAP-113): a container-at-parent (as_parent) membership relation reads container=parent/member=child", (t) => {
		const tmpDir = makeTmpDir("cs-rollup-asparent");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		// A `contains`-shaped membership relation: role_direction as_parent, so the
		// CONTAINER (milestone) is the edge PARENT and the MEMBER (phase) the CHILD —
		// the mirror image of the stock phase_positioned_in_milestone (as_child)
		// layout. Under the pre-FGAP-113 hardcoded container=child rollup this edge
		// would find zero members (the milestone is the parent, never scanned as the
		// child); driven from role_direction the member is correctly read at the
		// child endpoint.
		const rels = [
			...REL_TYPES,
			{
				canonical_id: "milestone_contains_phase",
				display_name: "contains phase",
				category: "membership" as const,
				role_direction: "as_parent" as const,
			},
		];
		const sd = {
			...STOCK_STATE_DERIVATION,
			rollups: [
				{
					kind: "milestone",
					membership_relation: "milestone_contains_phase",
					complete_status: "reached",
					incomplete_status: "planned",
				},
			],
		};
		writeConfig(projectDir, rels, CANONICAL_INVARIANTS, undefined, sd);
		fs.writeFileSync(
			path.join(projectDir, "milestone.json"),
			JSON.stringify({ milestones: [{ id: "MILE-001", name: "m", status: "planned" }] }),
		);
		// container=parent (MILE-001), member=child (PHASE-1).
		fs.writeFileSync(
			path.join(projectDir, "relations.json"),
			JSON.stringify([{ parent: "MILE-001", child: "PHASE-1", relation_type: "milestone_contains_phase" }]),
		);
		fs.writeFileSync(
			path.join(projectDir, "phase.json"),
			JSON.stringify({ phases: [{ id: "PHASE-1", name: "a", intent: "i", status: "completed" }] }),
		);
		let mile = currentState(tmpDir).milestones.find((m) => m.id === "MILE-001");
		assert.ok(mile, "MILE-001 derived");
		assert.strictEqual(mile!.phaseCount, 1, "member read at the CHILD endpoint under an as_parent container");
		assert.strictEqual(mile!.status, "reached", "complete member → reached");

		// An incomplete member flips it to the incomplete status.
		fs.writeFileSync(
			path.join(projectDir, "phase.json"),
			JSON.stringify({ phases: [{ id: "PHASE-1", name: "a", intent: "i", status: "in-progress" }] }),
		);
		mile = currentState(tmpDir).milestones.find((m) => m.id === "MILE-001");
		assert.strictEqual(mile!.status, "planned", "incomplete member → planned");
	});

	// ── TASK-020: config-driven state_derivation rewire ─────────────────────────

	it("STOCK byte-equivalence: stock state_derivation reproduces the pre-rewire output shape", (t) => {
		const tmpDir = makeTmpDir("cs-stock");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = setup(tmpDir); // writeConfig injects the stock state_derivation
		// A populated substrate exercising every coupling at once: an in-flight task,
		// an in-progress phase fallback (shadowed by the in-flight focus), a planned
		// dependent task blocked by a planned prereq, priority-ranked open gaps, and a
		// milestone over a positioned complete phase.
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({
				tasks: [
					{ id: "TASK-A", description: "active", status: "in-progress" },
					{ id: "TASK-P", description: "prereq", status: "planned" },
					{ id: "TASK-D", description: "dependent", status: "planned" },
				],
			}),
		);
		fs.writeFileSync(
			path.join(projectDir, "framework-gaps.json"),
			JSON.stringify({
				"framework-gaps": [
					{ id: "FGAP-3", title: "low", status: "identified", priority: "P3" },
					{ id: "FGAP-1", title: "high", status: "identified", priority: "P1" },
				],
			}),
		);
		fs.writeFileSync(
			path.join(projectDir, "phase.json"),
			JSON.stringify({ phases: [{ id: "PHASE-1", name: "now", intent: "i", status: "in-progress" }] }),
		);
		fs.writeFileSync(
			path.join(projectDir, "milestone.json"),
			JSON.stringify({ milestones: [{ id: "MILE-001", name: "m", status: "planned" }] }),
		);
		fs.writeFileSync(
			path.join(projectDir, "relations.json"),
			JSON.stringify([
				{ parent: "TASK-P", child: "TASK-D", relation_type: "task_depends_on_task" },
				{ parent: "PHASE-1", child: "MILE-001", relation_type: "phase_positioned_in_milestone" },
			]),
		);

		const state = currentState(tmpDir);
		// focus: in-flight wins over the in-progress-phase fallback.
		assert.strictEqual(state.focus, "in-flight: TASK-A");
		assert.deepStrictEqual(state.inFlight, [{ id: "TASK-A", block: "tasks", description: "active" }]);
		// nextActions: ready tasks (topo over planned) THEN gaps (P1 before P3). TASK-D
		// is blocked by planned TASK-P; only TASK-P is ready.
		assert.deepStrictEqual(state.nextActions, [
			{ id: "TASK-P", kind: "task", reason: "unblocked planned task" },
			{ id: "FGAP-1", kind: "framework-gap", priority: "P1", reason: "open gap (priority P1)" },
			{ id: "FGAP-3", kind: "framework-gap", priority: "P3", reason: "open gap (priority P3)" },
		]);
		assert.deepStrictEqual(state.blocked, [{ id: "TASK-D", block: "tasks", blockedBy: ["TASK-P"] }]);
		assert.deepStrictEqual(state.milestones, [{ id: "MILE-001", status: "planned", phaseCount: 1 }]);
	});

	it("UNSET rank value: a field-ranked item missing its rank_field emits the stock '... priority unset' template", (t) => {
		const tmpDir = makeTmpDir("cs-unset");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = setup(tmpDir); // stock state_derivation (reason_template "open gap (priority {rank_value})")
		// A framework-gap with NO `priority` field → {rank_value} resolves to "unset",
		// reproducing the pre-rewire `priority ${s.value ?? "unset"}` literal.
		fs.writeFileSync(
			path.join(projectDir, "framework-gaps.json"),
			JSON.stringify({ "framework-gaps": [{ id: "FGAP-X", title: "no priority", status: "identified" }] }),
		);
		const state = currentState(tmpDir);
		const fgap = state.nextActions.find((a) => a.id === "FGAP-X");
		assert.ok(fgap, "FGAP-X should surface in nextActions");
		assert.strictEqual(fgap!.reason, "open gap (priority unset)");
	});

	it("NOT-CONFIGURED signal: a config WITHOUT state_derivation reports the not-configured state exactly", (t) => {
		const tmpDir = makeTmpDir("cs-notconfigured");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		writeConfig(projectDir, REL_TYPES, CANONICAL_INVARIANTS, undefined, null); // OMIT state_derivation
		// Even with block items present, an absent registry short-circuits to the signal.
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({ tasks: [{ id: "TASK-A", description: "active", status: "in-progress" }] }),
		);
		const state = currentState(tmpDir);
		assert.deepStrictEqual(state, {
			focus: "state-derivation not configured",
			inFlight: [],
			nextActions: [],
			blocked: [],
			milestones: [],
		});
	});

	it("CUSTOM-vocabulary: focus/nextActions/blocked/milestones derive from non-stock declarations", (t) => {
		const tmpDir = makeTmpDir("cs-custom");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		// Custom registry: in-flight over `issues` at in_progress; a single next_ranked
		// over `issues` at todo (topo, no rank_field); blocked_by a custom relation
		// `issue_blocks_issue` (dependency direction); a rollup over `epic` via
		// `issue_in_epic` with custom done/open status strings; head 1.
		const customSd = {
			in_flight: { kinds: ["issues"], bucket: "in_progress" },
			focus_fallback: { kind: "epic", bucket: "in_progress" },
			next_ranked: [{ kind: "issues", label: "issue", bucket: "todo", reason_template: "ready issue {id}" }],
			blocked_by: { relation_types: ["issue_blocks_issue"] },
			rollups: [
				{ kind: "epic", membership_relation: "issue_in_epic", complete_status: "done", incomplete_status: "open" },
			],
			head_size: 1,
		};
		writeConfig(projectDir, REL_TYPES, CANONICAL_INVARIANTS, undefined, customSd);
		fs.writeFileSync(
			path.join(projectDir, "issues.json"),
			JSON.stringify({
				issues: [
					{ id: "ISS-A", description: "active", status: "in-progress" },
					{ id: "ISS-P", description: "prereq", status: "open" },
					{ id: "ISS-D", description: "dependent", status: "open" },
				],
			}),
		);
		fs.writeFileSync(
			path.join(projectDir, "epic.json"),
			JSON.stringify({ epics: [{ id: "EPIC-1", name: "e", status: "planned" }] }),
		);
		fs.writeFileSync(
			path.join(projectDir, "relations.json"),
			JSON.stringify([
				{ parent: "ISS-P", child: "ISS-D", relation_type: "issue_blocks_issue" },
				{ parent: "ISS-D", child: "EPIC-1", relation_type: "issue_in_epic" },
			]),
		);
		const state = currentState(tmpDir);
		// in-flight over issues (raw "in-progress" buckets in_progress); focus reflects it.
		assert.deepStrictEqual(state.inFlight, [{ id: "ISS-A", block: "issues", description: "active" }]);
		assert.strictEqual(state.focus, "in-flight: ISS-A");
		// ISS-D blocked by ISS-P via the custom dependency relation; ISS-D excluded from ready.
		assert.deepStrictEqual(state.blocked, [{ id: "ISS-D", block: "issues", blockedBy: ["ISS-P"] }]);
		assert.ok(state.nextActions.every((a) => a.id !== "ISS-D"));
		// reason is the configured custom template ({id} substituted) — NOT the stock
		// kind-coupled "unblocked planned task"; proves no reason literal survives.
		assert.ok(
			state.nextActions.some((a) => a.id === "ISS-P" && a.kind === "issue" && a.reason === "ready issue ISS-P"),
		);
		assert.ok(state.nextActions.every((a) => a.reason !== "unblocked planned task"));
		// rollup over epic via issue_in_epic: member ISS-D ("open") not complete → incomplete_status.
		assert.deepStrictEqual(state.milestones, [{ id: "EPIC-1", status: "open", phaseCount: 1 }]);

		// focus-fallback uses the CUSTOM focus_fallback.kind prefix ("epic: "), not the
		// stock "phase: ": demote ISS-A out of in_progress so nothing is in-flight, and
		// give EPIC-1 the fallback bucket.
		fs.writeFileSync(
			path.join(projectDir, "issues.json"),
			JSON.stringify({
				issues: [
					{ id: "ISS-A", description: "active", status: "open" },
					{ id: "ISS-P", description: "prereq", status: "open" },
					{ id: "ISS-D", description: "dependent", status: "open" },
				],
			}),
		);
		fs.writeFileSync(
			path.join(projectDir, "epic.json"),
			JSON.stringify({ epics: [{ id: "EPIC-1", name: "e", status: "in-progress" }] }),
		);
		const fallbackState = currentState(tmpDir);
		assert.strictEqual(fallbackState.focus, "epic: EPIC-1 (e)");
	});

	it("HEAD-SIZE honored: ranked head truncates at the configured size; a lower kind is not hidden when head accommodates it", (t) => {
		const tmpDir = makeTmpDir("cs-headsize");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		// head_size 2 over the stock next_ranked (tasks then gaps).
		const sd2 = { ...STOCK_STATE_DERIVATION, head_size: 2 };
		writeConfig(projectDir, REL_TYPES, CANONICAL_INVARIANTS, undefined, sd2);
		fs.writeFileSync(
			path.join(projectDir, "framework-gaps.json"),
			JSON.stringify({
				"framework-gaps": [
					{ id: "FGAP-1", title: "a", status: "identified", priority: "P0" },
					{ id: "FGAP-2", title: "b", status: "identified", priority: "P1" },
					{ id: "FGAP-3", title: "c", status: "identified", priority: "P2" },
				],
			}),
		);
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({ tasks: [{ id: "TASK-A", description: "ready", status: "planned" }] }),
		);
		// head_size 2 truncates the 1 task + 3 gaps to the task then the first gap; the
		// two lower gaps are hidden.
		let state = currentState(tmpDir);
		assert.strictEqual(state.nextActions.length, 2);
		assert.deepStrictEqual(
			state.nextActions.map((a) => a.id),
			["TASK-A", "FGAP-1"],
		);

		// With head_size 15 (stock) the same substrate surfaces the task AND all gaps —
		// the lower-ranked framework-gaps kind is NOT hidden when the head accommodates it.
		writeConfig(projectDir, REL_TYPES, CANONICAL_INVARIANTS, undefined, STOCK_STATE_DERIVATION);
		state = currentState(tmpDir);
		assert.deepStrictEqual(
			state.nextActions.map((a) => a.id),
			["TASK-A", "FGAP-1", "FGAP-2", "FGAP-3"],
		);
	});

	it("BLOCKED-BY SET: both task_depends_on_task and task_gated_by_item contribute to the unioned blockedBy", (t) => {
		const tmpDir = makeTmpDir("cs-blockedset");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = setup(tmpDir); // stock blocked_by = both relations
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({
				tasks: [
					{ id: "TASK-DEP", description: "prereq", status: "planned" },
					{ id: "TASK-T", description: "doubly blocked", status: "planned" },
				],
			}),
		);
		fs.writeFileSync(
			path.join(projectDir, "framework-gaps.json"),
			JSON.stringify({ "framework-gaps": [{ id: "FGAP-G", title: "gate", status: "identified", priority: "P1" }] }),
		);
		fs.writeFileSync(
			path.join(projectDir, "relations.json"),
			JSON.stringify([
				// dependency direction: parent=TASK-DEP child=TASK-T ⇒ TASK-T depends on TASK-DEP.
				{ parent: "TASK-DEP", child: "TASK-T", relation_type: "task_depends_on_task" },
				// gate direction: parent=TASK-T child=FGAP-G ⇒ TASK-T gated by FGAP-G.
				{ parent: "TASK-T", child: "FGAP-G", relation_type: "task_gated_by_item" },
			]),
		);
		const state = currentState(tmpDir);
		const t1 = state.blocked.find((b) => b.id === "TASK-T");
		assert.ok(t1, "TASK-T should be blocked");
		// union, deps-before-gates discovery order.
		assert.deepStrictEqual(t1!.blockedBy, ["TASK-DEP", "FGAP-G"]);
		assert.ok(state.nextActions.every((a) => a.id !== "TASK-T"));
	});

	it("ROLLUP from config: complete/incomplete status strings come from the rollup declaration", (t) => {
		const tmpDir = makeTmpDir("cs-rollup");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		// A rollup with NON-default status strings, proving the strings are config-driven.
		const sd = {
			...STOCK_STATE_DERIVATION,
			rollups: [
				{
					kind: "milestone",
					membership_relation: "phase_positioned_in_milestone",
					complete_status: "SHIPPED",
					incomplete_status: "PENDING",
				},
			],
		};
		writeConfig(projectDir, REL_TYPES, CANONICAL_INVARIANTS, undefined, sd);
		fs.writeFileSync(
			path.join(projectDir, "milestone.json"),
			JSON.stringify({
				milestones: [
					{ id: "MILE-A", name: "a", status: "planned" },
					{ id: "MILE-B", name: "b", status: "planned" },
				],
			}),
		);
		fs.writeFileSync(
			path.join(projectDir, "phase.json"),
			JSON.stringify({
				phases: [
					{ id: "PHASE-1", name: "p1", intent: "i", status: "completed" },
					{ id: "PHASE-2", name: "p2", intent: "i", status: "in-progress" },
				],
			}),
		);
		fs.writeFileSync(
			path.join(projectDir, "relations.json"),
			JSON.stringify([
				{ parent: "PHASE-1", child: "MILE-A", relation_type: "phase_positioned_in_milestone" }, // complete member → SHIPPED
				{ parent: "PHASE-2", child: "MILE-B", relation_type: "phase_positioned_in_milestone" }, // incomplete member → PENDING
			]),
		);
		const state = currentState(tmpDir);
		assert.deepStrictEqual(state.milestones, [
			{ id: "MILE-A", status: "SHIPPED", phaseCount: 1 },
			{ id: "MILE-B", status: "PENDING", phaseCount: 1 },
		]);
	});
});

// ── status-consistency invariants (DEC-0040 / FGAP-073) ───────────────────────
// validateContext's second config-invariants consumer: cross-block status drift.
// A qualifying item (block + optional when_bucket gate) whose related item across
// an edge has a target bucket that violates require_target_bucket /
// forbid_target_bucket is flagged. Like the requires-edge suite, the SOURCE loop
// commits to no block/status/relation_type vocabulary — every literal is DATA in
// the config invariant + status_buckets override. relation_types used here are
// registered in the fixture so edge-integrity does not error on them.
describe("status-consistency invariants", () => {
	// relation_types registry covering the status-consistency edges + a generic
	// ordering type (kept for parity with edge-model fixtures elsewhere).
	const SC_REL_TYPES = [
		{ canonical_id: "task_addresses_gap", display_name: "addresses gap", category: "data_flow" as const },
		{
			canonical_id: "task_governed_by_decision",
			display_name: "governed by decision",
			category: "data_flow" as const,
		},
	];

	function projDir(tmpDir: string): string {
		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		return projectDir;
	}

	it("require fires: completed task addressing a still-open gap is flagged", (t) => {
		const tmpDir = makeTmpDir("sc-require-fires");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = projDir(tmpDir);
		writeConfig(projectDir, SC_REL_TYPES, [
			{
				id: "completed-task-closes-gap",
				class: "status-consistency",
				block: "tasks",
				relation_types: ["task_addresses_gap"],
				direction: "as_parent",
				when_bucket: "complete",
				require_target_bucket: "complete",
				severity: "error",
			},
		]);
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({ tasks: [{ id: "t1", status: "completed" }] }),
		);
		// gap g1 status "identified" → bucket todo (≠ require complete) → violation.
		fs.writeFileSync(
			path.join(projectDir, "framework-gaps.json"),
			JSON.stringify({ gaps: [{ id: "g1", title: "open gap", status: "identified" }] }),
		);
		writeRelations(projectDir, [{ parent: "t1", child: "g1", relation_type: "task_addresses_gap" }]);

		const result = validateContext(tmpDir);
		const issue = result.issues.find((i) => i.code === "completed-task-closes-gap");
		assert.ok(issue, "completed task + open gap must fire the require invariant");
		assert.strictEqual(issue!.severity, "error");
		assert.strictEqual(issue!.block, "tasks");
		assert.ok(issue!.field?.startsWith("t1."), "field anchors the violating item id");
	});

	it("require clears: when target gap is closed (bucket complete) no issue", (t) => {
		const tmpDir = makeTmpDir("sc-require-clears");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = projDir(tmpDir);
		writeConfig(projectDir, SC_REL_TYPES, [
			{
				id: "completed-task-closes-gap",
				class: "status-consistency",
				block: "tasks",
				relation_types: ["task_addresses_gap"],
				direction: "as_parent",
				when_bucket: "complete",
				require_target_bucket: "complete",
			},
		]);
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({ tasks: [{ id: "t1", status: "completed" }] }),
		);
		// gap g1 status "implemented" → bucket complete (matches require) → clean.
		fs.writeFileSync(
			path.join(projectDir, "framework-gaps.json"),
			JSON.stringify({ gaps: [{ id: "g1", title: "closed gap", status: "implemented" }] }),
		);
		writeRelations(projectDir, [{ parent: "t1", child: "g1", relation_type: "task_addresses_gap" }]);

		const result = validateContext(tmpDir);
		assert.ok(
			!result.issues.some((i) => i.code === "completed-task-closes-gap"),
			"satisfied require invariant must produce no diagnostic",
		);
	});

	it("forbid fires: task governed by a superseded decision (bucket unknown) is flagged", (t) => {
		const tmpDir = makeTmpDir("sc-forbid-fires");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = projDir(tmpDir);
		writeConfig(projectDir, SC_REL_TYPES, [
			{
				id: "no-superseded-governance",
				class: "status-consistency",
				block: "tasks",
				relation_types: ["task_governed_by_decision"],
				direction: "as_parent",
				forbid_target_bucket: "unknown",
				severity: "error",
			},
		]);
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({ tasks: [{ id: "t1", status: "in-progress" }] }),
		);
		// decision d1 status "superseded" → bucket unknown (forbidden) → violation.
		fs.writeFileSync(
			path.join(projectDir, "decisions.json"),
			JSON.stringify({ decisions: [{ id: "d1", status: "superseded" }] }),
		);
		writeRelations(projectDir, [{ parent: "t1", child: "d1", relation_type: "task_governed_by_decision" }]);

		const result = validateContext(tmpDir);
		const issue = result.issues.find((i) => i.code === "no-superseded-governance");
		assert.ok(issue, "forbidden target bucket must fire the forbid invariant");
		assert.strictEqual(issue!.severity, "error");
	});

	it("edge-gated silent: invariant present but no matching edge → no issue", (t) => {
		const tmpDir = makeTmpDir("sc-edge-gated");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = projDir(tmpDir);
		writeConfig(projectDir, SC_REL_TYPES, [
			{
				id: "completed-task-closes-gap",
				class: "status-consistency",
				block: "tasks",
				relation_types: ["task_addresses_gap"],
				direction: "as_parent",
				when_bucket: "complete",
				require_target_bucket: "complete",
			},
		]);
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({ tasks: [{ id: "t1", status: "completed" }] }),
		);
		fs.writeFileSync(
			path.join(projectDir, "framework-gaps.json"),
			JSON.stringify({ gaps: [{ id: "g1", title: "open gap", status: "identified" }] }),
		);
		writeRelations(projectDir, []); // no edge → invariant cannot inspect a target

		const result = validateContext(tmpDir);
		assert.ok(
			!result.issues.some((i) => i.code === "completed-task-closes-gap"),
			"status-consistency is edge-gated — no edge means no check, no diagnostic",
		);
	});

	it("when_bucket filter: non-matching item bucket is not checked", (t) => {
		const tmpDir = makeTmpDir("sc-when-bucket");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = projDir(tmpDir);
		writeConfig(projectDir, SC_REL_TYPES, [
			{
				id: "completed-task-closes-gap",
				class: "status-consistency",
				block: "tasks",
				relation_types: ["task_addresses_gap"],
				direction: "as_parent",
				when_bucket: "complete",
				require_target_bucket: "complete",
			},
		]);
		// task t1 status "planned" → bucket todo (≠ when_bucket complete) → not checked.
		fs.writeFileSync(path.join(projectDir, "tasks.json"), JSON.stringify({ tasks: [{ id: "t1", status: "planned" }] }));
		fs.writeFileSync(
			path.join(projectDir, "framework-gaps.json"),
			JSON.stringify({ gaps: [{ id: "g1", title: "open gap", status: "identified" }] }),
		);
		writeRelations(projectDir, [{ parent: "t1", child: "g1", relation_type: "task_addresses_gap" }]);

		const result = validateContext(tmpDir);
		assert.ok(
			!result.issues.some((i) => i.code === "completed-task-closes-gap"),
			"when_bucket gate excludes the item — no diagnostic despite the open gap",
		);
	});

	it("vocabulary-neutral: a config status_buckets override changes the verdict", (t) => {
		const tmpDir = makeTmpDir("sc-vocab-neutral");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = projDir(tmpDir);
		// Custom status "done2" is unknown to STATUS_VOCABULARY_DEFAULTS; mapped to
		// "complete" here. If any literal were hardcoded in the consumer, this gap
		// would still read as not-complete and the require invariant would fire.
		writeConfig(
			projectDir,
			SC_REL_TYPES,
			[
				{
					id: "completed-task-closes-gap",
					class: "status-consistency",
					block: "tasks",
					relation_types: ["task_addresses_gap"],
					direction: "as_parent",
					when_bucket: "complete",
					require_target_bucket: "complete",
				},
			],
			{ done2: "complete" },
		);
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({ tasks: [{ id: "t1", status: "completed" }] }),
		);
		// gap g1 status "done2" → bucket complete ONLY via the config override.
		fs.writeFileSync(
			path.join(projectDir, "framework-gaps.json"),
			JSON.stringify({ gaps: [{ id: "g1", title: "custom-closed gap", status: "done2" }] }),
		);
		writeRelations(projectDir, [{ parent: "t1", child: "g1", relation_type: "task_addresses_gap" }]);

		const result = validateContext(tmpDir);
		assert.ok(
			!result.issues.some((i) => i.code === "completed-task-closes-gap"),
			"config status_buckets override must bucket 'done2' → complete and clear the require invariant",
		);
	});
});

// ── Edge endpoint-kind check (FGAP-086 / DEC-0037) ───────────────────────────
// validateContext flags an edge whose endpoint's resolved block is not in the
// relation_type's declared source_kinds / target_kinds (unless the set is the
// "*" wildcard). Presence-gated: a relation_type with neither field is
// unchecked, so the frozen .project substrate (no endpoint metadata) is never
// retroactively failed. loc.block is the data-file basename; source/target_kinds
// name block_kind canonical_ids — fixtures keep block_kinds empty so ad-hoc ids
// (t1/g1) index by file basename without prefix enforcement.
describe("edge endpoint-kind check (FGAP-086)", () => {
	function writeKindFixtures(projectDir: string): void {
		fs.writeFileSync(path.join(projectDir, "tasks.json"), JSON.stringify({ tasks: [{ id: "t1", status: "planned" }] }));
		fs.writeFileSync(
			path.join(projectDir, "framework-gaps.json"),
			JSON.stringify({ gaps: [{ id: "g1", title: "a gap" }] }),
		);
	}

	it("flags an edge whose source block is not in source_kinds (metadata present)", (t) => {
		const tmpDir = makeTmpDir("endpoint-source-mismatch");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		writeConfig(
			projectDir,
			[
				{
					canonical_id: "task_addresses_gap",
					display_name: "addresses gap",
					category: "data_flow" as const,
					source_kinds: ["tasks"],
					target_kinds: ["framework-gaps"],
				},
			],
			[],
		);
		writeKindFixtures(projectDir);
		// parent g1 lives in framework-gaps → source kind 'framework-gaps' ∉ ["tasks"].
		writeRelations(projectDir, [{ parent: "g1", child: "t1", relation_type: "task_addresses_gap" }]);

		const result = validateContext(tmpDir);
		assert.strictEqual(result.status, "invalid");
		const issue = result.issues.find((i) => i.message.includes("source kind 'framework-gaps' not in source_kinds"));
		assert.ok(issue, "should report a source-kind-mismatch issue");
		assert.strictEqual(issue!.severity, "error");
		assert.strictEqual(issue!.block, "relations");
	});

	it("does NOT check endpoint kinds when the relation_type carries no source_kinds/target_kinds (gate)", (t) => {
		const tmpDir = makeTmpDir("endpoint-gate");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		// Same edge as the mismatch case, but the relation_type has no endpoint
		// metadata → presence gate skips the check entirely.
		writeConfig(
			projectDir,
			[{ canonical_id: "task_addresses_gap", display_name: "addresses gap", category: "data_flow" as const }],
			[],
		);
		writeKindFixtures(projectDir);
		writeRelations(projectDir, [{ parent: "g1", child: "t1", relation_type: "task_addresses_gap" }]);

		const result = validateContext(tmpDir);
		assert.strictEqual(result.status, "clean");
		assert.ok(
			!result.issues.some(
				(i) => i.message.includes("not in source_kinds") || i.message.includes("not in target_kinds"),
			),
			"no endpoint-kind issue should fire when metadata is absent",
		);
	});

	it("accepts any target block when target_kinds is the '*' wildcard", (t) => {
		const tmpDir = makeTmpDir("endpoint-wildcard");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		writeConfig(
			projectDir,
			[
				{
					canonical_id: "verification_verifies_item",
					display_name: "verifies",
					category: "data_flow" as const,
					source_kinds: ["verification"],
					target_kinds: ["*"],
				},
			],
			[],
		);
		// source v1 in verification (matches source_kinds); target g1 in framework-gaps (any kind ok via "*").
		fs.writeFileSync(
			path.join(projectDir, "verification.json"),
			JSON.stringify({ verifications: [{ id: "v1", status: "passed" }] }),
		);
		fs.writeFileSync(
			path.join(projectDir, "framework-gaps.json"),
			JSON.stringify({ gaps: [{ id: "g1", title: "a gap" }] }),
		);
		writeRelations(projectDir, [{ parent: "v1", child: "g1", relation_type: "verification_verifies_item" }]);

		const result = validateContext(tmpDir);
		assert.ok(
			!result.issues.some((i) => i.message.includes("not in target_kinds")),
			"'*' target wildcard must accept any child block",
		);
		assert.strictEqual(result.status, "clean");
	});
});

// ── expectedBlockForId empty-prefix guard (FGAP-062) ─────────────────────────

describe("expectedBlockForId", () => {
	const bk = (canonical_id: string, prefix: string) => ({
		canonical_id,
		display_name: canonical_id,
		prefix,
		schema_path: `schemas/${canonical_id}.schema.json`,
		array_key: canonical_id,
		data_path: `${canonical_id}.json`,
	});
	const cfg = {
		schema_version: "1.8.0",
		root: ".project",
		block_kinds: [bk("empty", ""), bk("decisions", "DEC-")],
	} as ConfigBlock;

	it("does not let an empty-prefix block_kind act as a catch-all", () => {
		// "DEC-001" matches the real DEC- prefix, not the empty catch-all
		assert.strictEqual(expectedBlockForId("DEC-001", cfg), "decisions");
		// an unprefixed id matches nothing now (empty prefix skipped) instead of "empty"
		assert.strictEqual(expectedBlockForId("X-999", cfg), null);
	});

	it("returns null for a null config", () => {
		assert.strictEqual(expectedBlockForId("DEC-001", null), null);
	});
});

// ── validateContext cross-block status-vocabulary check (FGAP-025) ────────────

describe("validateContext status-vocabulary", () => {
	it("warns on a status value absent from the vocabulary; clean for known statuses", (t) => {
		const tmpDir = makeTmpDir("validate-status-vocab");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		writeConfig(projectDir);
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({
				tasks: [
					{ id: "t1", description: "known status", status: "completed" }, // in vocab -> no warning
					{ id: "t2", description: "unknown status", status: "zzz-bogus" }, // not a vocab key -> warning
					{ id: "t3", description: "cancelled maps to unknown BUCKET but is a key", status: "cancelled" }, // key -> no warning
				],
			}),
		);
		const result = validateContext(tmpDir);
		const statusIssues = result.issues.filter((i) => i.code === "status_unknown_value");
		assert.strictEqual(statusIssues.length, 1, "exactly one unknown-status warning");
		assert.strictEqual(statusIssues[0].block, "tasks");
		assert.strictEqual(statusIssues[0].field, "status");
		assert.ok(statusIssues[0].message.includes("t2") && statusIssues[0].message.includes("zzz-bogus"));
		assert.strictEqual(statusIssues[0].severity, "warning");
	});

	it("does not flag items that have no status field", (t) => {
		const tmpDir = makeTmpDir("validate-status-none");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		writeConfig(projectDir);
		fs.writeFileSync(
			path.join(projectDir, "framework-gaps.json"),
			JSON.stringify({ gaps: [{ id: "g1", title: "a gap, no status field" }] }),
		);
		const result = validateContext(tmpDir);
		assert.strictEqual(
			result.issues.filter((i) => i.code === "status_unknown_value").length,
			0,
			"status-less items are skipped",
		);
	});
});

describe("context-sdk pointer-less degradation (tryResolveContextDir class fix)", () => {
	// Deliberately NO writeBootstrapPointer — every read/classify surface must
	// degrade to empty/zero rather than hard-throw BootstrapNotFoundError. The
	// git/source-derived fields of contextState stay pointer-independent.
	function makePointerlessDir(prefix: string): string {
		return fs.mkdtempSync(path.join(os.tmpdir(), `sdk-noptr-${prefix}-`));
	}

	it("availableBlocks returns [] when no pointer exists", (t) => {
		const tmp = makePointerlessDir("availableblocks");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		assert.deepEqual(availableBlocks(tmp), []);
	});

	it("blockStructure returns [] when no pointer exists", (t) => {
		const tmp = makePointerlessDir("blockstructure");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		assert.deepEqual(blockStructure(tmp), []);
	});

	it("buildIdIndex returns an empty SubstrateIndex when no pointer exists", (t) => {
		const tmp = makePointerlessDir("buildidindex");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		const index = buildIdIndex(tmp);
		// F1 (Cycle 7): empty SubstrateIndex — empty lookup maps + empty items.
		assert.ok(index.byRefname instanceof Map);
		assert.strictEqual(index.byRefname.size, 0);
		assert.ok(index.byOid instanceof Map);
		assert.strictEqual(index.byOid.size, 0);
		assert.deepEqual(index.items, []);
	});

	it("contextState does not throw and reports blocks===0 while git fields remain populated", (t) => {
		const tmp = makePointerlessDir("contextstate");
		t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
		let state: ReturnType<typeof contextState> | undefined;
		assert.doesNotThrow(() => {
			state = contextState(tmp);
		});
		assert.ok(state);
		assert.strictEqual(state.blocks, 0);
		// git/source-derived fields are pointer-independent — lastCommit is a string
		// ("unknown" when the tmp dir is not a git repo), proving the non-block
		// portions still run after the substrate scan degrades.
		assert.strictEqual(typeof state.lastCommit, "string");
		assert.strictEqual(state.hasHandoff, false);
	});

	it("validateContext does not throw and reports status 'clean' when no pointer exists", (t) => {
		const tmp = makePointerlessDir("validatecontext");
		// Clear any lens validators a prior test registered so the dispatch loop
		// cannot inject a warning that flips status off "clean" for an empty substrate.
		clearLensValidators();
		t.after(() => {
			fs.rmSync(tmp, { recursive: true, force: true });
			clearLensValidators();
		});
		let result: ReturnType<typeof validateContext> | undefined;
		assert.doesNotThrow(() => {
			result = validateContext(tmp);
		});
		assert.ok(result);
		assert.strictEqual(result.status, "clean");
	});
});

// ── SoT-drift invariant (content-addressed substrate identity, Cycle 4) ──────
//
// When config.substrate_id is present, validateContext requires a project-root
// registry (.pi-context-registry.json) entry whose dir resolves to the active
// substrate. Missing entry → substrate_id_unregistered; dir mismatch →
// substrate_id_registry_mismatch; substrate_id absent → SKIP (clean).
describe("validateContext: substrate_id SoT-drift invariant", () => {
	const SUB = "sub-abc1230000000def";

	/** Write a minimal schema-valid config.json, optionally carrying substrate_id. */
	function writeIdentityConfig(projectDir: string, substrate_id?: string): void {
		fs.writeFileSync(
			path.join(projectDir, "config.json"),
			JSON.stringify({
				schema_version: "1.8.0",
				root: ".project",
				block_kinds: [],
				...(substrate_id ? { substrate_id } : {}),
			}),
		);
	}

	it("clean when substrate_id present + a registry entry matches the active dir", (t) => {
		const tmpDir = makeTmpDir("drift-clean");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		writeIdentityConfig(projectDir, SUB);
		registerSubstrate(tmpDir, SUB, ".project", []);
		const result = validateContext(tmpDir);
		assert.strictEqual(result.status, "clean");
		assert.deepStrictEqual(result.issues, []);
	});

	it("error (substrate_id_registry_mismatch) when the registry entry dir differs from the active dir", (t) => {
		const tmpDir = makeTmpDir("drift-mismatch");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		writeIdentityConfig(projectDir, SUB);
		// Registry points the SAME substrate_id at a DIFFERENT dir than the active
		// substrate (the pointer names .project).
		registerSubstrate(tmpDir, SUB, ".some-other-dir", []);
		const result = validateContext(tmpDir);
		assert.strictEqual(result.status, "invalid");
		const issue = result.issues.find((i) => i.code === "substrate_id_registry_mismatch");
		assert.ok(issue, "expected a substrate_id_registry_mismatch issue");
		assert.strictEqual(issue!.severity, "error");
		assert.strictEqual(issue!.block, "config");
	});

	it("error (substrate_id_unregistered) when substrate_id present but no registry entry", (t) => {
		const tmpDir = makeTmpDir("drift-unregistered");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		writeIdentityConfig(projectDir, SUB);
		// No registry file at all → entry missing.
		const result = validateContext(tmpDir);
		assert.strictEqual(result.status, "invalid");
		const issue = result.issues.find((i) => i.code === "substrate_id_unregistered");
		assert.ok(issue, "expected a substrate_id_unregistered issue");
		assert.strictEqual(issue!.severity, "error");
		assert.strictEqual(issue!.block, "config");
	});

	// Regression: a RELATIVE cwd ('.') must not drive a false-positive drift
	// error. resolveContextDir returns path.join(cwd, contextDir) — relative
	// when cwd is relative — while the registered side is path.resolve'd to
	// absolute. Pre-fix the two differed only in absoluteness, so a correctly
	// registered substrate spuriously reported substrate_id_registry_mismatch.
	// The fix absolutizes both sides before comparing.
	it("clean with a RELATIVE cwd ('.') when the substrate is correctly registered (no false-positive drift)", (t) => {
		const tmpDir = makeTmpDir("drift-relcwd");
		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		writeIdentityConfig(projectDir, SUB);
		registerSubstrate(tmpDir, SUB, ".project", []);
		// Exercise the relative-cwd path: chdir into the project root, then
		// validate with cwd '.'. Save/restore the original cwd so sibling tests
		// (which rely on process.cwd()) are unaffected.
		const originalCwd = process.cwd();
		t.after(() => {
			process.chdir(originalCwd);
			fs.rmSync(tmpDir, { recursive: true, force: true });
		});
		// macOS tmpdir is symlinked (/var → /private/var); chdir into the real
		// path so process.cwd() and the resolved tmpDir agree.
		process.chdir(fs.realpathSync(tmpDir));
		const result = validateContext(".");
		const driftIssue = result.issues.find((i) => i.code?.startsWith("substrate_id_"));
		assert.strictEqual(
			driftIssue,
			undefined,
			`relative cwd must not produce a substrate_id_* drift issue; got: ${JSON.stringify(driftIssue)}`,
		);
		assert.strictEqual(result.status, "clean");
	});

	it("skips (clean) when config.substrate_id is absent (pre-identity substrate)", (t) => {
		const tmpDir = makeTmpDir("drift-absent");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		writeIdentityConfig(projectDir); // no substrate_id
		// No registry; must NOT error — the check is gated on substrate_id presence.
		const result = validateContext(tmpDir);
		assert.strictEqual(result.status, "clean");
		assert.deepStrictEqual(result.issues, []);
	});
});

// ── validateContext: nested id-bearing array warning (Cycle 9.2) ─────────────
//
// Schema-level lint independent of block data + config: every array property at
// nesting depth ≥ 1 whose item shape carries an `id` warns (one per offending
// dotted key-path), non-fatal — status must not flip to "invalid" by it alone.
describe("validateContext: nested id-bearing array warning", () => {
	// A carrier schema shaped like layer-plans: top-level `plans[]` whose items
	// embed two id-bearing arrays (layers, migration_phases). Two offending paths.
	const carrierSchema = {
		type: "object",
		properties: {
			plans: {
				type: "array",
				items: {
					type: "object",
					properties: {
						id: { type: "string" },
						layers: {
							type: "array",
							items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" } } },
						},
						migration_phases: {
							type: "array",
							items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" } } },
						},
					},
				},
			},
		},
	};

	// A clean schema: top-level id array (depth 0) + a nested NON-id array. No hit.
	const cleanSchema = {
		type: "object",
		properties: {
			items: {
				type: "array",
				items: {
					type: "object",
					properties: {
						id: { type: "string" },
						tags: { type: "array", items: { type: "object", properties: { name: { type: "string" } } } },
					},
				},
			},
		},
	};

	function seedSchema(projectDir: string, name: string, schema: unknown): void {
		const schemasDir = path.join(projectDir, "schemas");
		fs.mkdirSync(schemasDir, { recursive: true });
		fs.writeFileSync(path.join(schemasDir, `${name}.schema.json`), JSON.stringify(schema, null, 2));
	}

	it("emits one warning per offending nested id-bearing key; non-fatal (status not 'invalid')", (t) => {
		const tmpDir = makeTmpDir("nested-id-warn");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		seedSchema(projectDir, "layer-plans", carrierSchema);

		const result = validateContext(tmpDir);

		const warns = result.issues.filter((i) => i.code === "nested_id_bearing_array");
		assert.strictEqual(warns.length, 2, "two offending nested id-bearing arrays");
		assert.ok(
			warns.every((w) => w.severity === "warning"),
			"all nested-id issues are warnings",
		);
		assert.ok(
			warns.every((w) => w.block === "layer-plans"),
			"block names the schema (no .schema.json suffix)",
		);
		const fields = warns.map((w) => w.field).sort();
		assert.deepStrictEqual(fields, ["plans.layers", "plans.migration_phases"]);
		// Non-fatal on its own: with no errors present the status is "warnings", never "invalid".
		assert.notStrictEqual(result.status, "invalid");
		assert.strictEqual(result.status, "warnings");
	});

	it("emits no nested_id_bearing_array warning for a clean schema set", (t) => {
		const tmpDir = makeTmpDir("nested-id-clean");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		seedSchema(projectDir, "clean-block", cleanSchema);

		const result = validateContext(tmpDir);
		assert.ok(!result.issues.some((i) => i.code === "nested_id_bearing_array"));
	});

	it("skips cleanly when the schemas dir is absent (no throw, no nested-id warning)", (t) => {
		const tmpDir = makeTmpDir("nested-id-noschemas");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true }); // no schemas/ subdir

		const result = validateContext(tmpDir);
		assert.ok(!result.issues.some((i) => i.code === "nested_id_bearing_array"));
	});
});

// ── Substrate-wide block schema-validity sweep in validateContext ────────────

describe("validateContext block schema-validity sweep", () => {
	let cwd: string;
	beforeEach(() => {
		cwd = makeTmpDir("validity-sweep");
		fs.mkdirSync(path.join(cwd, ".project", "schemas"), { recursive: true });
		fs.writeFileSync(
			path.join(cwd, ".project", "config.json"),
			JSON.stringify({ schema_version: "1.8.0", root: ".project", block_kinds: [] }, null, 2),
		);
	});
	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	const THING_SCHEMA = {
		version: "1.0.0",
		type: "object",
		required: ["things"],
		additionalProperties: false,
		properties: {
			schema_version: { type: "string" },
			things: {
				type: "array",
				items: {
					type: "object",
					additionalProperties: false,
					required: ["id"],
					properties: { id: { type: "string" }, note: { type: "string" } },
				},
			},
		},
	};

	function writeThing(schema: unknown, block: unknown): void {
		fs.writeFileSync(path.join(cwd, ".project", "schemas", "thing.schema.json"), JSON.stringify(schema, null, 2));
		fs.writeFileSync(path.join(cwd, ".project", "thing.json"), JSON.stringify(block, null, 2));
	}

	it("a schema-valid block (unstamped envelope) produces no sweep findings", () => {
		writeThing(THING_SCHEMA, { things: [{ id: "T-1", note: "ok" }] });
		const result = validateContext(cwd);
		assert.ok(!result.issues.some((i) => i.code === "block_schema_invalid"));
	});

	it("an item invalid against the installed schema surfaces as an ERROR naming block + item id + keyword", () => {
		writeThing(THING_SCHEMA, { things: [{ id: "T-1", rogue_field: true }] });
		const result = validateContext(cwd);
		const finding = result.issues.find((i) => i.code === "block_schema_invalid");
		assert.ok(finding, "sweep must surface the invalid block");
		assert.equal(finding?.severity, "error");
		assert.equal(finding?.block, "thing");
		assert.equal(finding?.field, "T-1");
		assert.match(finding?.message ?? "", /additionalProperties/);
		assert.equal(result.status, "invalid");
	});

	it("a STAMPED envelope validates migration-aware: matching version passes; unresolvable version surfaces as an error", () => {
		writeThing(THING_SCHEMA, { schema_version: "1.0.0", things: [{ id: "T-1" }] });
		assert.ok(!validateContext(cwd).issues.some((i) => i.code === "block_schema_invalid"));
		// Now claim a version with no chain to the schema's 1.0.0 — the sweep's
		// migration-aware path throws (no path) and surfaces it, rather than
		// silently skipping the block.
		writeThing(THING_SCHEMA, { schema_version: "0.9.0", things: [{ id: "T-1" }] });
		const result = validateContext(cwd);
		const finding = result.issues.find((i) => i.code === "block_schema_invalid");
		assert.ok(finding, "an unresolvable stamped version must surface, not skip");
		assert.equal(finding?.severity, "error");
	});
});
