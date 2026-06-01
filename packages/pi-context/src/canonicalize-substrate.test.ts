/**
 * Tests for the Cycle-10 substrate canonicalizer (`canonicalizeSubstrate`).
 *
 * Scratch-fixture ONLY — never the real repo. A single substrate `.work` with:
 *   (a) a depth-3 nested tree: `features` block whose item carries a nested
 *       `stories` array, each story carrying a nested `tasks` array (ids NOT
 *       matching the synthesized prefixes → mint);
 *   (b) a nested array REUSING an existing empty block: a registered empty
 *       `story` block whose id.pattern the nested story ids match → reuse;
 *   (c) a 0-data nested id array (`features.findings`) → schema-de-nest only,
 *       no block synthesized.
 *
 * Post-canonicalize assertions: every nested entity is now a top-level item
 * (oid 32-hex + content_hash + object on disk); membership edges carry correct
 * ordinals + original ids in refname; parents de-nested (no nested array in
 * data OR schema); findNestedIdBearingArrays over every resulting schema → [];
 * item-count conservation; the 0-data array de-nested with no block synthesized;
 * dryRun writes nothing (tree snapshot identical); idempotency (2nd run → zero
 * promotions / mints / new edges); and edges resolve via a pointer-switch
 * validateContext (mkdtemp cwd → 0 nested_id_bearing_array + 0 unresolved).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { canonicalizeSubstrate, type PromotionTargets } from "./canonicalize-substrate.js";
import { type EdgeEndpoint, loadRelationsForDir } from "./context.js";
import { writeBootstrapPointer } from "./context-dir.js";
import { validateContext } from "./context-sdk.js";
import { hasObject } from "./object-store.js";
import { findNestedIdBearingArrays } from "./schema-write.js";

const IDENTITY_PROPS = {
	oid: { type: "string", pattern: "^[0-9a-f]{32}$" },
	content_hash: { type: "string", pattern: "^[0-9a-f]{64}$" },
	content_parent: { type: "string", pattern: "^[0-9a-f]{64}$" },
};

/** Explicit promotion targets for the fixture (NO synthesis):
 *  - `features.stories` REUSES the empty `story` block, keeping the original ids;
 *  - `story.tasks` is a NEW `task` block whose id pattern is GIVEN verbatim
 *    (`^TASK-\d{4}$` — deliberately NOT derivable from any singularization rule).
 * The 0-data `features.findings` array needs NO entry (auto schema-de-nest). */
const TASK_ID_PATTERN = "^TASK-\\d{4}$";
const FIXTURE_TARGETS: PromotionTargets = {
	"features.stories": { blockKind: "story", reuse: true, keepIds: true, relationType: "feature_contains_story" },
	"story.tasks": {
		blockKind: "task",
		prefix: "TASK-",
		idPattern: TASK_ID_PATTERN,
		relationType: "story_contains_task",
	},
};

/** features schema: item has id + a nested `stories` (id-bearing) array whose
 * item carries a nested `tasks` (id-bearing) array, and a 0-data `findings`
 * (id-bearing) array. */
function featuresSchema(): Record<string, unknown> {
	return {
		$schema: "http://json-schema.org/draft-07/schema#",
		$id: "pi-context://schemas/features",
		version: "1.0.0",
		title: "features",
		type: "object",
		required: ["features"],
		properties: {
			features: {
				type: "array",
				items: {
					type: "object",
					required: ["id"],
					properties: {
						id: { type: "string", pattern: "^FEAT-\\d{3}$" },
						title: { type: "string" },
						stories: {
							type: "array",
							items: {
								type: "object",
								required: ["id"],
								properties: {
									id: { type: "string", pattern: "^STORY-\\d{3}$" },
									summary: { type: "string" },
									tasks: {
										type: "array",
										items: {
											type: "object",
											required: ["id"],
											properties: {
												id: { type: "string" },
												desc: { type: "string" },
												...IDENTITY_PROPS,
											},
										},
									},
									...IDENTITY_PROPS,
								},
							},
						},
						findings: {
							type: "array",
							items: {
								type: "object",
								required: ["id"],
								properties: { id: { type: "string" }, note: { type: "string" }, ...IDENTITY_PROPS },
							},
						},
						...IDENTITY_PROPS,
					},
				},
			},
		},
	};
}

/** Empty `story` block schema (the REUSE target — id pattern matches the nested
 * story ids `STORY-00N`). NOTE: deliberately carries NO nested arrays of its own;
 * the nested `tasks` ride INSIDE the promoted story items + are re-detected on
 * the story block when it is processed. */
function storySchema(): Record<string, unknown> {
	return {
		$schema: "http://json-schema.org/draft-07/schema#",
		$id: "pi-context://schemas/story",
		version: "1.0.0",
		title: "story",
		type: "object",
		required: ["stories"],
		properties: {
			stories: {
				type: "array",
				items: {
					type: "object",
					required: ["id"],
					properties: {
						id: { type: "string", pattern: "^STORY-\\d{3}$" },
						summary: { type: "string" },
						tasks: {
							type: "array",
							items: {
								type: "object",
								required: ["id"],
								properties: { id: { type: "string" }, desc: { type: "string" }, ...IDENTITY_PROPS },
							},
						},
						...IDENTITY_PROPS,
					},
				},
			},
		},
	};
}

function makeFixture(): { cwd: string; work: string } {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "canon-"));
	writeBootstrapPointer(cwd, ".work");
	const work = path.join(cwd, ".work");
	fs.mkdirSync(path.join(work, "schemas"), { recursive: true });

	const config = {
		schema_version: "1.0.0",
		root: ".work",
		substrate_id: "sub-0123456789abcdef",
		block_kinds: [
			{
				canonical_id: "features",
				display_name: "Features",
				prefix: "FEAT",
				schema_path: "schemas/features.schema.json",
				array_key: "features",
				data_path: "features.json",
			},
			{
				canonical_id: "story",
				display_name: "Story",
				prefix: "STORY",
				schema_path: "schemas/story.schema.json",
				array_key: "stories",
				data_path: "story.json",
			},
		],
		relation_types: [],
		invariants: [],
	};
	fs.writeFileSync(path.join(work, "config.json"), JSON.stringify(config, null, 2));
	fs.writeFileSync(path.join(work, "schemas", "features.schema.json"), JSON.stringify(featuresSchema(), null, 2));
	fs.writeFileSync(path.join(work, "schemas", "story.schema.json"), JSON.stringify(storySchema(), null, 2));

	// features data: 1 feature with 2 stories (STORY-001 carries 2 tasks), 0 findings.
	const features = {
		features: [
			{
				id: "FEAT-001",
				title: "Auth",
				stories: [
					{
						id: "STORY-001",
						summary: "login",
						tasks: [
							{ id: "T1", desc: "form" },
							{ id: "T2", desc: "api" },
						],
					},
					{ id: "STORY-002", summary: "logout", tasks: [{ id: "T3", desc: "endpoint" }] },
				],
				findings: [],
			},
		],
	};
	fs.writeFileSync(path.join(work, "features.json"), JSON.stringify(features, null, 2));
	// story block starts empty (the reuse target).
	fs.writeFileSync(path.join(work, "story.json"), JSON.stringify({ stories: [] }, null, 2));
	return { cwd, work };
}

/** Fixture variant mirroring the real `.project-migrate` failure: the reuse target
 * `story` is a registered block_kind (config + schema present) with NO data file —
 * `story.json` is deliberately absent (a "registered-but-fileless" block, 0 prior
 * data). The depth-3 `features`→stories→tasks tree is identical to makeFixture; the
 * only difference is that `story.json` is never written, so the FIRST append into the
 * reuse block must seed the file or throw `Block file not found`. */
function makeFilelessReuseFixture(): { cwd: string; work: string } {
	const { cwd, work } = makeFixture();
	// Remove the seeded reuse-block data file → registered-but-fileless reuse target.
	fs.rmSync(path.join(work, "story.json"));
	return { cwd, work };
}

/** Explicit promotion targets for the SYNTH-INTERMEDIATE depth-3 path — the depth-2
 * parent of the depth-3 tree is SYNTHESIZED (a NEW `feature-story` block), NOT reused.
 * This is the real `.project-migrate` shape (after `features.stories` was switched from
 * reusing `story` to synthesizing `feature-story`): the deepest `feature-story.tasks`
 * level rides inside the synthesized block's DATA (its written schema drops the deeper
 * array per the 9.2 guard) and must be detected by data-observation when the synthesized
 * block is processed. The deepest key is keyed on the SYNTH parent's canonical_id. */
const STORY_TASK_ID_PATTERN = "^STORY-TASK-\\d{4}$";
const SYNTH_INTERMEDIATE_TARGETS: PromotionTargets = {
	"features.stories": {
		blockKind: "feature-story",
		prefix: "FSTORY-",
		idPattern: "^FSTORY-\\d{3}$",
		relationType: "feature_contains_story",
	},
	"feature-story.tasks": {
		blockKind: "story-task",
		prefix: "STORY-TASK-",
		idPattern: STORY_TASK_ID_PATTERN,
		relationType: "story_contains_task",
	},
};

/** Fixture mirroring the real `.project-migrate` failure exactly: ONLY the `features`
 * block is registered (NO `story` block, no `story.json`). The depth-2 parent of the
 * depth-3 tree (`features`→stories→tasks) is therefore SYNTHESIZED, not reused — so the
 * deepest `tasks` level is observable only from the synthesized `feature-story` block's
 * in-memory (dry) / on-disk (real) DATA, never from a pre-registered schema. This is the
 * path that masked the dry-run depth-3 drop: when the depth-2 parent is reused (other
 * fixtures), its schema is already on disk and the dry run reads it; when synthesized,
 * the dry run wrote no schema, so the deeper array went undetected. */
function makeSynthIntermediateFixture(): { cwd: string; work: string } {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "canon-synth-"));
	writeBootstrapPointer(cwd, ".work");
	const work = path.join(cwd, ".work");
	fs.mkdirSync(path.join(work, "schemas"), { recursive: true });

	const config = {
		schema_version: "1.0.0",
		root: ".work",
		substrate_id: "sub-0123456789abcdef",
		block_kinds: [
			{
				canonical_id: "features",
				display_name: "Features",
				prefix: "FEAT",
				schema_path: "schemas/features.schema.json",
				array_key: "features",
				data_path: "features.json",
			},
		],
		relation_types: [],
		invariants: [],
	};
	fs.writeFileSync(path.join(work, "config.json"), JSON.stringify(config, null, 2));
	fs.writeFileSync(path.join(work, "schemas", "features.schema.json"), JSON.stringify(featuresSchema(), null, 2));
	// 1 feature, 2 stories (STORY-001 carries 2 tasks; STORY-002 carries 1) → 2 stories
	// + 3 tasks, 0 findings. Identical tree to makeFixture's data.
	const features = {
		features: [
			{
				id: "FEAT-001",
				title: "Auth",
				stories: [
					{
						id: "STORY-001",
						summary: "login",
						tasks: [
							{ id: "T1", desc: "form" },
							{ id: "T2", desc: "api" },
						],
					},
					{ id: "STORY-002", summary: "logout", tasks: [{ id: "T3", desc: "endpoint" }] },
				],
				findings: [],
			},
		],
	};
	fs.writeFileSync(path.join(work, "features.json"), JSON.stringify(features, null, 2));
	return { cwd, work };
}

/** Snapshot every file under `dir` as path → bytes (sorted), for dryRun no-write proof. */
function snapshotTree(dir: string): Map<string, string> {
	const out = new Map<string, string>();
	const walk = (d: string): void => {
		for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
			const full = path.join(d, e.name);
			if (e.isDirectory()) walk(full);
			else out.set(path.relative(dir, full), fs.readFileSync(full, "utf-8"));
		}
	};
	walk(dir);
	return out;
}

function readBlockItems(work: string, file: string, arrayKey: string): Record<string, unknown>[] {
	const data = JSON.parse(fs.readFileSync(path.join(work, file), "utf-8")) as Record<string, unknown>;
	return (data[arrayKey] as Record<string, unknown>[]) ?? [];
}

function readConfig(work: string): Record<string, unknown> {
	return JSON.parse(fs.readFileSync(path.join(work, "config.json"), "utf-8")) as Record<string, unknown>;
}

describe("canonicalizeSubstrate: full canonicalization", () => {
	it("promotes a depth-3 tree, reuses an empty block, de-nests a 0-data array, content-addresses all items", (t) => {
		const { cwd, work } = makeFixture();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		const report = canonicalizeSubstrate(work, { promotionTargets: FIXTURE_TARGETS });

		// ── stories promoted into the REUSED `story` block (kept STORY-00N ids) ──
		const stories = readBlockItems(work, "story.json", "stories");
		assert.equal(stories.length, 2, "2 stories promoted");
		assert.deepEqual(
			stories.map((s) => s.id).sort(),
			["STORY-001", "STORY-002"],
			"original story ids preserved (reuse + keepIds)",
		);
		const storyPromo = report.promotions.find((p) => p.path === "features.stories");
		assert.ok(storyPromo?.reused, "features.stories reused the empty story block");
		assert.equal(storyPromo?.block_kind, "story", "explicit target block_kind = story");

		// ── tasks promoted into the GIVEN `task` block (ids minted via given prefix) ─
		const taskPromo = report.promotions.find((p) => p.path === "story.tasks");
		assert.ok(taskPromo, "story.tasks promoted (depth-3, after stories)");
		assert.equal(taskPromo?.reused, false, "task block is new, not reused");
		const taskBlockKind = taskPromo!.block_kind;
		assert.equal(taskBlockKind, "task", "explicit target block_kind = task (no synthesis)");
		assert.ok(report.kinds_registered.includes(taskBlockKind), "the given task kind registered");
		const taskCfg = (readConfig(work).block_kinds as Record<string, unknown>[]).find(
			(b) => b.canonical_id === taskBlockKind,
		)!;
		const tasks = readBlockItems(work, taskCfg.data_path as string, taskCfg.array_key as string);
		assert.equal(tasks.length, 3, "3 tasks promoted across both stories");
		for (const t of tasks) {
			assert.match(t.id as string, /^TASK-\d{4}$/, `task id ${String(t.id)} minted via the GIVEN prefix/idPattern`);
		}

		// ── the synthesized task schema uses the GIVEN id.pattern VERBATIM ───────
		const taskSchema = JSON.parse(fs.readFileSync(path.join(work, taskCfg.schema_path as string), "utf-8")) as Record<
			string,
			unknown
		>;
		const taskArr = (taskSchema.properties as Record<string, Record<string, unknown>>)[taskCfg.array_key as string];
		const taskItemProps = (taskArr.items as Record<string, Record<string, unknown>>).properties as Record<
			string,
			Record<string, unknown>
		>;
		assert.equal(
			taskItemProps.id.pattern,
			TASK_ID_PATTERN,
			"task schema id.pattern == the operator-given idPattern (not derived)",
		);

		// ── the explicit membership relation_types were registered VERBATIM ──────
		assert.ok(report.relation_types_registered.includes("story_contains_task"), "story_contains_task registered");
		const relCfg = readConfig(work).relation_types as Record<string, unknown>[];
		assert.ok(
			relCfg.some((r) => r.canonical_id === "story_contains_task"),
			"story_contains_task in config (no truncation)",
		);

		// ── every promoted/backfilled item is content-addressed ─────────────────
		for (const it of [...stories, ...tasks, ...readBlockItems(work, "features.json", "features")]) {
			assert.match(it.oid as string, /^[0-9a-f]{32}$/, `item ${String(it.id)} oid 32-hex`);
			assert.match(it.content_hash as string, /^[0-9a-f]{64}$/, `item ${String(it.id)} content_hash 64-hex`);
			assert.ok(hasObject(work, it.content_hash as string), `item ${String(it.id)} object on disk`);
		}

		// ── parents de-nested: no nested array in DATA or SCHEMA ─────────────────
		const features = readBlockItems(work, "features.json", "features");
		for (const f of features) {
			assert.equal(Object.hasOwn(f, "stories"), false, "feature de-nested: no stories array");
			assert.equal(Object.hasOwn(f, "findings"), false, "feature de-nested: no findings array");
		}
		for (const s of stories) {
			assert.equal(Object.hasOwn(s, "tasks"), false, "story de-nested: no tasks array");
		}

		// ── findNestedIdBearingArrays over EVERY resulting schema → [] ───────────
		for (const f of fs.readdirSync(path.join(work, "schemas"))) {
			const schema = JSON.parse(fs.readFileSync(path.join(work, "schemas", f), "utf-8")) as Record<string, unknown>;
			assert.deepEqual(findNestedIdBearingArrays(schema), [], `schema ${f} has no nested id-bearing array`);
		}

		// ── 0-data array (findings) de-nested from schema, NO block synthesized ──
		assert.ok(report.schema_denested.includes("features"), "features schema de-nested (stories + findings)");
		assert.equal(
			(readConfig(work).block_kinds as Record<string, unknown>[]).some((b) =>
				String(b.canonical_id).includes("finding"),
			),
			false,
			"no finding block synthesized for the 0-data array",
		);

		// ── membership edges carry ordinals + original ids in refname ────────────
		const edges = loadRelationsForDir(work);
		const storyEdges = edges.filter((e) => e.relation_type.includes("story"));
		assert.ok(storyEdges.length >= 2, "feature→story membership edges filed");
		// The task→story edges (deepest) carry ordinals 0/1 within STORY-001, 0 within STORY-002.
		const taskEdges = edges.filter((e) => {
			const c = e.child;
			return typeof c === "object" && c.kind === "item" && /^T\d$/.test(c.refname ?? "");
		});
		assert.equal(taskEdges.length, 3, "3 task membership edges");
		const t1Edge = taskEdges.find((e) => (e.child as EdgeEndpoint & { refname?: string }).refname === "T1")!;
		assert.equal(t1Edge.ordinal, 0, "T1 ordinal 0");
		const t2Edge = taskEdges.find((e) => (e.child as EdgeEndpoint & { refname?: string }).refname === "T2")!;
		assert.equal(t2Edge.ordinal, 1, "T2 ordinal 1");
		// Each task edge's parent oid is its story's oid.
		for (const te of taskEdges) {
			const parent = te.parent as EdgeEndpoint;
			assert.equal(parent.kind, "item");
			if (parent.kind === "item") {
				const story = stories.find((s) => s.id === parent.refname);
				assert.ok(story, `task edge parent ${parent.refname ?? ""} is a story`);
				assert.equal(parent.oid, story!.oid, "task edge parent oid == story oid");
			}
		}

		// ── item-count conservation: every original nested item is now top-level ─
		// originals: 2 stories + 3 tasks = 5 promoted entities; 1 feature stays.
		assert.equal(
			report.promotions.reduce((n, p) => n + p.entities, 0),
			5,
			"5 entities promoted",
		);

		// ── edges resolve via pointer-switch validateContext ─────────────────────
		const original = JSON.parse(fs.readFileSync(path.join(cwd, ".pi-context.json"), "utf-8")) as { contextDir: string };
		try {
			writeBootstrapPointer(cwd, ".work");
			const result = validateContext(cwd);
			const nested = result.issues.filter((i) => i.code === "nested_id_bearing_array");
			assert.deepEqual(nested, [], "validateContext: 0 nested_id_bearing_array");
			const dangling = result.issues.filter(
				(i) => i.code === "edge_endpoint_dangling" || i.code === "edge_endpoint_unregistered",
			);
			assert.deepEqual(dangling, [], "validateContext: 0 dangling/unregistered edge endpoints");
		} finally {
			writeBootstrapPointer(cwd, original.contextDir);
		}
	});

	it("converts a seeded bare-refname original edge to structured {kind:item, oid, refname}", (t) => {
		const { cwd, work } = makeFixture();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		// Register a relation_type + seed a BARE-refname edge between two stories
		// (top-level after promotion). We pre-promote by running once, then seed a
		// bare edge against the now-top-level story ids, then re-run to convert it.
		canonicalizeSubstrate(work, { promotionTargets: FIXTURE_TARGETS });
		// Seed a bare-string edge (the legacy on-disk form) + register its reltype.
		const cfg = readConfig(work);
		(cfg.relation_types as Record<string, unknown>[]).push({
			canonical_id: "story_relates_to_story",
			display_name: "story relates to story",
			category: "ordering",
		});
		fs.writeFileSync(path.join(work, "config.json"), JSON.stringify(cfg, null, 2));
		const edges = loadRelationsForDir(work);
		edges.push({ parent: "STORY-001", child: "STORY-002", relation_type: "story_relates_to_story" });
		fs.writeFileSync(path.join(work, "relations.json"), JSON.stringify(edges, null, 2));

		const report = canonicalizeSubstrate(work, { promotionTargets: FIXTURE_TARGETS });
		assert.ok(report.edges_structured >= 1, "the seeded bare edge was structured");

		const after = loadRelationsForDir(work);
		const seeded = after.find((e) => e.relation_type === "story_relates_to_story")!;
		assert.equal(typeof seeded.parent, "object", "parent endpoint now structured");
		const parent = seeded.parent as EdgeEndpoint;
		assert.equal(parent.kind, "item");
		if (parent.kind === "item") {
			assert.equal(parent.refname, "STORY-001", "refname preserved");
			assert.match(parent.oid, /^[0-9a-f]{32}$/, "structured oid attached");
		}
	});

	it("dryRun writes nothing (tree snapshot identical) yet reports accurate counts", (t) => {
		const { cwd, work } = makeFixture();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		const before = snapshotTree(work);
		const report = canonicalizeSubstrate(work, { dryRun: true, promotionTargets: FIXTURE_TARGETS });
		const after = snapshotTree(work);

		assert.deepEqual([...after.entries()].sort(), [...before.entries()].sort(), "dryRun: every byte unchanged");
		assert.equal(report.dry_run, true);
		// Same shape as the real run: 2 promotions (stories reuse + tasks synth),
		// 5 entities, features schema de-nested.
		assert.equal(report.promotions.length, 2, "dryRun reports 2 promotions");
		assert.equal(
			report.promotions.reduce((n, p) => n + p.entities, 0),
			5,
			"dryRun reports 5 entities",
		);
		assert.ok(report.schema_denested.includes("features"), "dryRun reports features de-nested");
		assert.ok(report.kinds_registered.length >= 1, "dryRun reports a synthesized kind");
		assert.ok(report.items_oid_minted > 0, "dryRun reports oids would be minted");
	});

	it("is idempotent: a second run promotes nothing, mints nothing, files no new edges", (t) => {
		const { cwd, work } = makeFixture();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		canonicalizeSubstrate(work, { promotionTargets: FIXTURE_TARGETS });
		const edgesAfter1 = loadRelationsForDir(work).length;
		const report2 = canonicalizeSubstrate(work, { promotionTargets: FIXTURE_TARGETS });

		assert.equal(report2.promotions.length, 0, "2nd run: 0 promotions");
		assert.equal(report2.items_oid_minted, 0, "2nd run: 0 oids minted");
		assert.deepEqual(report2.schema_denested, [], "2nd run: 0 schemas de-nested");
		assert.deepEqual(report2.kinds_registered, [], "2nd run: 0 kinds registered");
		assert.deepEqual(report2.relation_types_registered, [], "2nd run: 0 relation_types registered");
		assert.equal(report2.edges_structured, 0, "2nd run: 0 edges newly structured (all already structured)");
		assert.equal(loadRelationsForDir(work).length, edgesAfter1, "2nd run: edge count unchanged");
	});

	it("THROWS for a data-bearing nested array with no promotionTargets entry (explicit-or-fail; no synthesis)", (t) => {
		const { cwd, work } = makeFixture();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		// Map only features.stories → story.tasks (data-bearing) is unmapped → throw.
		const partial: PromotionTargets = {
			"features.stories": { blockKind: "story", reuse: true, keepIds: true, relationType: "feature_contains_story" },
		};
		assert.throws(
			() => canonicalizeSubstrate(work, { promotionTargets: partial }),
			/no promotionTargets entry for data-bearing nested array 'story\.tasks'/,
			"unmapped story.tasks throws naming the path",
		);
	});

	it("auto-de-nests a 0-data nested id-bearing array with NO mapping entry required", (t) => {
		const { cwd, work } = makeFixture();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		// FIXTURE_TARGETS deliberately has NO entry for features.findings (0-data).
		const report = canonicalizeSubstrate(work, { promotionTargets: FIXTURE_TARGETS });

		// findings de-nested from the features schema, no block synthesized, no
		// promotion recorded for findings, no edges filed for it.
		assert.ok(report.schema_denested.includes("features"), "features schema de-nested (incl. 0-data findings)");
		const featSchema = JSON.parse(
			fs.readFileSync(path.join(work, "schemas", "features.schema.json"), "utf-8"),
		) as Record<string, unknown>;
		const featItems = (
			(featSchema.properties as Record<string, Record<string, unknown>>).features.items as Record<
				string,
				Record<string, unknown>
			>
		).properties as Record<string, unknown>;
		assert.equal(Object.hasOwn(featItems, "findings"), false, "findings dropped from the features item schema");
		assert.equal(
			report.promotions.some((p) => p.path === "features.findings"),
			false,
			"no promotion recorded for the 0-data findings array",
		);
		assert.equal(
			(readConfig(work).block_kinds as Record<string, unknown>[]).some((b) =>
				String(b.canonical_id).includes("finding"),
			),
			false,
			"no finding block synthesized",
		);
	});

	it("THROWS when keepIds is requested but a nested id collides in the reuse target", (t) => {
		const { cwd, work } = makeFixture();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		// Pre-seed the reuse `story` block with STORY-001 so keepIds collides.
		fs.writeFileSync(
			path.join(work, "story.json"),
			JSON.stringify({ stories: [{ id: "STORY-001", summary: "pre-existing" }] }, null, 2),
		);
		assert.throws(
			() => canonicalizeSubstrate(work, { promotionTargets: FIXTURE_TARGETS }),
			/keepIds on 'features\.stories': nested id 'STORY-001' collides/,
			"keepIds collision throws",
		);
	});

	it("seeds + promotes into a registered-but-fileless REUSE target (no story.json on disk)", (t) => {
		const { cwd, work } = makeFilelessReuseFixture();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		// Precondition: the reuse `story` block is registered (config + schema) but has
		// NO data file — exactly the real `.project-migrate` shape that threw
		// `Block file not found: <dupe>/story.json` before the seed fix.
		assert.equal(fs.existsSync(path.join(work, "story.json")), false, "precondition: story.json absent");
		const storyCfg = (readConfig(work).block_kinds as Record<string, unknown>[]).find(
			(b) => b.canonical_id === "story",
		);
		assert.ok(storyCfg, "story block_kind registered in config");
		assert.ok(fs.existsSync(path.join(work, "schemas", "story.schema.json")), "story schema present");

		// Must NOT throw — the canonicalizer seeds the absent reuse-block file then promotes.
		const report = canonicalizeSubstrate(work, { promotionTargets: FIXTURE_TARGETS });

		// The seed created story.json; the 2 nested stories were promoted into it (ids kept).
		assert.ok(fs.existsSync(path.join(work, "story.json")), "story.json seeded by the canonicalizer");
		const stories = readBlockItems(work, "story.json", "stories");
		assert.equal(stories.length, 2, "2 stories promoted into the seeded reuse block");
		assert.deepEqual(
			stories.map((s) => s.id).sort(),
			["STORY-001", "STORY-002"],
			"original story ids preserved (reuse + keepIds) into the seeded file",
		);
		for (const s of stories) {
			assert.match(s.oid as string, /^[0-9a-f]{32}$/, `story ${String(s.id)} oid 32-hex`);
			assert.match(s.content_hash as string, /^[0-9a-f]{64}$/, `story ${String(s.id)} content_hash 64-hex`);
			assert.ok(hasObject(work, s.content_hash as string), `story ${String(s.id)} object on disk`);
			assert.equal(Object.hasOwn(s, "tasks"), false, "promoted story de-nested (no tasks array)");
		}
		const storyPromo = report.promotions.find((p) => p.path === "features.stories");
		assert.ok(storyPromo?.reused, "features.stories reused the fileless story block");
		assert.equal(storyPromo?.entities, 2, "2 entities promoted into the reuse block");

		// The depth-3 SYNTH `task` block (whose data file likewise never pre-existed)
		// still works: its file is seeded + the 3 tasks promoted.
		const taskCfg = (readConfig(work).block_kinds as Record<string, unknown>[]).find((b) => b.canonical_id === "task")!;
		assert.ok(taskCfg, "synth task block registered");
		assert.ok(fs.existsSync(path.join(work, taskCfg.data_path as string)), "synth task data file seeded");
		const tasks = readBlockItems(work, taskCfg.data_path as string, taskCfg.array_key as string);
		assert.equal(tasks.length, 3, "3 tasks promoted into the seeded synth block");
		for (const tk of tasks) {
			assert.match(tk.id as string, /^TASK-\d{4}$/, `synth task id ${String(tk.id)} minted via given prefix`);
		}

		// No nested id-bearing array survives in any resulting schema.
		for (const f of fs.readdirSync(path.join(work, "schemas"))) {
			const schema = JSON.parse(fs.readFileSync(path.join(work, "schemas", f), "utf-8")) as Record<string, unknown>;
			assert.deepEqual(findNestedIdBearingArrays(schema), [], `schema ${f} has no nested id-bearing array`);
		}
	});

	it("promotes a full depth-3 tree through a SYNTHESIZED intermediate, dry-run counts == real-run counts", (t) => {
		// REGRESSION GUARD for the depth-3-through-synth-intermediate drop. When the
		// depth-2 parent of a depth-3 tree is SYNTHESIZED (not reused), the deepest level
		// rides inside the synthesized block's DATA (its written schema drops the deeper
		// array per the 9.2 guard). The dry run wrote no schema for the synthesized block,
		// so the worklist's on-disk schema read found nothing → the synthesized block was
		// SKIPPED → the deepest `feature-story.tasks` promotion (and its mints/edges) was
		// MISSING from the dry-run report while the REAL run promoted it. This test asserts
		// (a) the REAL run promotes the full depth-3 tree on disk, AND (b) the dry-run
		// report's counts match the real run's EXACTLY — so the operator's pre-apply
		// checkpoint is trustworthy.

		// ── Real run on a fresh fixture ──────────────────────────────────────────
		const real = makeSynthIntermediateFixture();
		t.after(() => fs.rmSync(real.cwd, { recursive: true, force: true }));
		const realReport = canonicalizeSubstrate(real.work, { promotionTargets: SYNTH_INTERMEDIATE_TARGETS });

		// feature-story is SYNTHESIZED (not reused), 2 stories promoted.
		const fsPromo = realReport.promotions.find((p) => p.path === "features.stories");
		assert.ok(fsPromo, "features.stories promoted");
		assert.equal(fsPromo?.reused, false, "feature-story is SYNTHESIZED, not reused");
		assert.equal(fsPromo?.block_kind, "feature-story", "explicit synth target = feature-story");
		assert.equal(fsPromo?.entities, 2, "2 stories promoted");

		// The DEEPEST level: feature-story.tasks promoted (this is the level that vanished
		// from the dry run before the fix) — 3 tasks into a synth story-task block.
		const taskPromo = realReport.promotions.find((p) => p.path === "feature-story.tasks");
		assert.ok(taskPromo, "feature-story.tasks promoted (the depth-3 level through the synth intermediate)");
		assert.equal(taskPromo?.reused, false, "story-task is synthesized");
		assert.equal(taskPromo?.block_kind, "story-task", "explicit synth target = story-task");
		assert.equal(taskPromo?.entities, 3, "all 3 deepest-level tasks promoted");
		assert.equal(taskPromo?.edges, 3, "3 membership edges for the deepest level");

		// On disk: the synth story-task block exists with 3 de-nested, content-addressed items.
		const stCfg = (readConfig(real.work).block_kinds as Record<string, unknown>[]).find(
			(b) => b.canonical_id === "story-task",
		);
		assert.ok(stCfg, "story-task block_kind registered (synth)");
		const stTasks = readBlockItems(real.work, stCfg!.data_path as string, stCfg!.array_key as string);
		assert.equal(stTasks.length, 3, "3 tasks on disk in the synth story-task block");
		for (const tk of stTasks) {
			assert.match(tk.id as string, /^STORY-TASK-\d{4}$/, `task ${String(tk.id)} minted via given prefix`);
			assert.match(tk.oid as string, /^[0-9a-f]{32}$/, `task ${String(tk.id)} oid 32-hex`);
			assert.ok(hasObject(real.work, tk.content_hash as string), `task ${String(tk.id)} object on disk`);
		}

		// The synthesized feature-story items are DE-NESTED (no embedded tasks array).
		const fsCfg = (readConfig(real.work).block_kinds as Record<string, unknown>[]).find(
			(b) => b.canonical_id === "feature-story",
		)!;
		const fsItems = readBlockItems(real.work, fsCfg.data_path as string, fsCfg.array_key as string);
		assert.equal(fsItems.length, 2, "2 feature-story items on disk");
		for (const s of fsItems) {
			assert.equal(Object.hasOwn(s, "tasks"), false, "feature-story de-nested: no embedded tasks array");
		}

		// The feature-story SCHEMA ends with NO nested id-bearing array (tasks de-nested),
		// and so does every resulting schema.
		const fsSchema = JSON.parse(fs.readFileSync(path.join(real.work, fsCfg.schema_path as string), "utf-8")) as Record<
			string,
			unknown
		>;
		assert.deepEqual(findNestedIdBearingArrays(fsSchema), [], "feature-story schema has no nested id-bearing array");
		for (const f of fs.readdirSync(path.join(real.work, "schemas"))) {
			const schema = JSON.parse(fs.readFileSync(path.join(real.work, "schemas", f), "utf-8")) as Record<
				string,
				unknown
			>;
			assert.deepEqual(findNestedIdBearingArrays(schema), [], `schema ${f} has no nested id-bearing array`);
		}

		// Deepest membership edges: 3 task edges, ordinals 0/1 within STORY-001, 0 within STORY-002.
		const realEdges = loadRelationsForDir(real.work);
		const taskEdges = realEdges.filter((e) => {
			const c = e.child;
			return typeof c === "object" && c.kind === "item" && /^T\d$/.test(c.refname ?? "");
		});
		assert.equal(taskEdges.length, 3, "3 deepest-level membership edges on disk");
		assert.equal(
			taskEdges.filter((e) => e.relation_type === "story_contains_task").length,
			3,
			"all story_contains_task",
		);

		// Total promoted entities across both levels = 2 stories + 3 tasks = 5.
		assert.equal(
			realReport.promotions.reduce((n, p) => n + p.entities, 0),
			5,
			"5 entities promoted across the full depth-3 tree",
		);

		// ── Dry run on a SEPARATE fresh fixture: counts must match the real run EXACTLY ──
		const dry = makeSynthIntermediateFixture();
		t.after(() => fs.rmSync(dry.cwd, { recursive: true, force: true }));
		const before = snapshotTree(dry.work);
		const dryReport = canonicalizeSubstrate(dry.work, { dryRun: true, promotionTargets: SYNTH_INTERMEDIATE_TARGETS });
		const after = snapshotTree(dry.work);

		// dryRun is non-destructive (every byte unchanged).
		assert.deepEqual([...after.entries()].sort(), [...before.entries()].sort(), "dryRun: every byte unchanged");

		// The dry run reports the DEEPEST level (the regression: it was absent before the fix).
		const dryTaskPromo = dryReport.promotions.find((p) => p.path === "feature-story.tasks");
		assert.ok(dryTaskPromo, "dry run reports the feature-story.tasks depth-3 promotion (regression guard)");
		assert.equal(dryTaskPromo?.entities, 3, "dry run reports all 3 deepest-level entities");

		// EXACT count parity: promotions (path/block_kind/reused/entities/edges) + every numeric field.
		assert.deepEqual(
			dryReport.promotions,
			realReport.promotions,
			"dry-run promotions identical to real-run promotions (paths, kinds, entities, edges)",
		);
		assert.equal(dryReport.items_oid_minted, realReport.items_oid_minted, "dry minted == real minted");
		assert.equal(dryReport.items_hashed, realReport.items_hashed, "dry hashed == real hashed");
		assert.equal(dryReport.objects_stored, realReport.objects_stored, "dry objects_stored == real objects_stored");
		assert.equal(
			dryReport.edges_structured,
			realReport.edges_structured,
			"dry edges_structured == real edges_structured",
		);
		assert.deepEqual(
			dryReport.schema_denested.sort(),
			realReport.schema_denested.sort(),
			"dry schema_denested == real schema_denested (both features + feature-story)",
		);
		assert.deepEqual(
			dryReport.kinds_registered.sort(),
			realReport.kinds_registered.sort(),
			"dry kinds_registered == real kinds_registered (both feature-story + story-task)",
		);
		assert.deepEqual(
			dryReport.relation_types_registered.sort(),
			realReport.relation_types_registered.sort(),
			"dry relation_types_registered == real relation_types_registered",
		);
	});
});
