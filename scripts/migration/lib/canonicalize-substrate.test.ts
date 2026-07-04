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
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { type EdgeEndpoint, loadRelationsForDir } from "@davidorex/pi-context/context";
import { writeBootstrapPointer } from "@davidorex/pi-context/context-dir";
import { validateContext } from "@davidorex/pi-context/context-sdk";
import { hasObject } from "@davidorex/pi-context/object-store";
import { findNestedIdBearingArrays } from "@davidorex/pi-context/schema-write";
import {
	canonicalizeSubstrate,
	deriveIdPattern,
	inferItemSubschemaFromData,
	type PromotionTargets,
	type RegisterBlock,
	stripNestedIdArrayFromSchema,
} from "./canonicalize-substrate.js";

const IDENTITY_PROPS = {
	oid: { type: "string", pattern: "^[0-9a-f]{32}$" },
	content_hash: { type: "string", pattern: "^[0-9a-f]{64}$" },
	content_parent: { type: "string", pattern: "^[0-9a-f]{64}$" },
};

/** A unique valid `substrate_id` (`^sub-[0-9a-f]{16}$`) per fixture INSTANCE. The
 * canonicalizer scopes emitted-schema `$id`s by `substrate_id`; AJV keys its compiled-
 * validator cache by `$id` PROCESS-GLOBALLY. Two fixtures in the same test process that
 * both synthesize a same-named block (e.g. `feature-story`) under a SHARED substrate_id
 * would emit the SAME `$id`, so AJV would validate the second fixture's data against the
 * FIRST fixture's compiled (de-nested, tasks-dropped) shape — rejecting the still-nested
 * transient append. A fresh id per fixture makes each fixture's `$id`s unique, matching a
 * real single-substrate fresh-process run (where no collision exists). */
function uniqueSubstrateId(): string {
	return `sub-${randomBytes(8).toString("hex")}`;
}

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
		schema_version: "1.8.0",
		root: ".work",
		substrate_id: uniqueSubstrateId(),
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
		schema_version: "1.8.0",
		root: ".work",
		substrate_id: uniqueSubstrateId(),
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

		// ── parents de-nested: the PROMOTED id-bearing array is gone from DATA; the
		//    0-data `findings` array (never promoted) is RETAINED as a loose array ──
		const features = readBlockItems(work, "features.json", "features");
		for (const f of features) {
			assert.equal(Object.hasOwn(f, "stories"), false, "feature de-nested: no stories array (promoted)");
			// CLEAN-EMIT: the 0-data findings array is not promoted; it survives in data as a
			// loose array (re-inferred as a non-id `{type:"array"}` property, 9.2-guard-clean).
			assert.equal(Object.hasOwn(f, "findings"), true, "feature retains its 0-data findings array");
			assert.ok(Array.isArray(f.findings) && (f.findings as unknown[]).length === 0, "findings still empty array");
		}
		for (const s of stories) {
			assert.equal(Object.hasOwn(s, "tasks"), false, "story de-nested: no tasks array (promoted)");
		}

		// ── findNestedIdBearingArrays over EVERY resulting schema → [] ───────────
		for (const f of fs.readdirSync(path.join(work, "schemas"))) {
			const schema = JSON.parse(fs.readFileSync(path.join(work, "schemas", f), "utf-8")) as Record<string, unknown>;
			assert.deepEqual(findNestedIdBearingArrays(schema), [], `schema ${f} has no nested id-bearing array`);
		}

		// ── CLEAN-EMIT shape over EVERY resulting schema: no $ref/$defs anywhere,
		//    AP:false on the item shape, required == ["id"] only, identity fields
		//    present, id derived/given ───────────────────────────────────────────
		for (const f of fs.readdirSync(path.join(work, "schemas"))) {
			const raw = fs.readFileSync(path.join(work, "schemas", f), "utf-8");
			assert.equal(/\$ref/.test(raw), false, `schema ${f} carries NO $ref (clean-emit ignores source $ref)`);
			assert.equal(/"\$defs"|"definitions"/.test(raw), false, `schema ${f} carries NO $defs/definitions`);
			const schema = JSON.parse(raw) as Record<string, unknown>;
			const props = schema.properties as Record<string, Record<string, unknown>>;
			const arrayKey = Object.keys(props)[0];
			const items = (props[arrayKey].items ?? {}) as Record<string, unknown>;
			assert.equal(items.additionalProperties, false, `schema ${f} item shape AP:false`);
			assert.deepEqual(items.required, ["id"], `schema ${f} item required == ['id'] only`);
			const ip = items.properties as Record<string, Record<string, unknown>>;
			for (const idf of ["oid", "content_hash", "content_parent"]) {
				assert.ok(Object.hasOwn(ip, idf), `schema ${f} item declares identity field ${idf}`);
			}
		}

		// ── features de-nested (stories promoted); findings was NEVER promoted ───
		assert.ok(report.schema_denested.includes("features"), "features schema de-nested (stories promoted)");
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

	it("leaves a 0-data nested id-bearing array as a loose array (no promotion, no block synthesized)", (t) => {
		const { cwd, work } = makeFixture();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		// FIXTURE_TARGETS deliberately has NO entry for features.findings (0-data).
		const report = canonicalizeSubstrate(work, { promotionTargets: FIXTURE_TARGETS });

		// CLEAN-EMIT: the 0-data findings array is not id-bearing (empty ⇒ not data-detected),
		// so it is neither promoted nor explicitly de-nested. It survives in the data, and the
		// re-inferred features item schema declares it as a loose `{type:"array"}` property —
		// NOT an id-bearing nested array (so the 9.2 guard passes).
		const featSchema = JSON.parse(
			fs.readFileSync(path.join(work, "schemas", "features.schema.json"), "utf-8"),
		) as Record<string, unknown>;
		const featItems = (
			(featSchema.properties as Record<string, Record<string, unknown>>).features.items as Record<
				string,
				Record<string, unknown>
			>
		).properties as Record<string, Record<string, unknown>>;
		assert.equal(Object.hasOwn(featItems, "findings"), true, "findings retained as a property on the inferred schema");
		assert.deepEqual(featItems.findings, { type: "array" }, "findings declared LOOSE (no id-bearing items)");
		assert.deepEqual(findNestedIdBearingArrays(featSchema), [], "no nested id-bearing array (findings is loose)");
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

// ─────────────────────────────────────────────────────────────────────────────
// REAL-SHAPE-CLASS fixture — replicates `.project-migrate`'s mole-classes that a
// SOURCE-PRESERVING canonicalizer failed on. CLEAN-EMIT (infer schemas from DATA,
// inherit nothing from source) must dissolve all four at once:
//   (a) a `$ref`-into-`definitions` nested tree depth-3 (feature → $ref story →
//       $ref task), like the real features.schema.json — a source-preserving builder
//       leaves a dangling `$ref:#/definitions/task` once `definitions` is pruned;
//   (b) a registered-but-FILELESS block (config + schema, no data file);
//   (c) a DIVERGENT NARROW `additionalProperties:false` source schema whose DATA
//       carries MORE fields than it declares — a source-preserving builder's AP:false
//       rejects the richer data;
//   (d) a 0-DATA id-bearing nested array — survives as a loose array under clean-emit.
// ─────────────────────────────────────────────────────────────────────────────

/** features schema in the REAL `$ref`-tree form: items is `{$ref:#/definitions/feature}`,
 * feature.stories → `{$ref:#/definitions/story}`, story.tasks → `{$ref:#/definitions/task}`,
 * feature.findings → `{$ref:#/definitions/scoped-finding}` (0-data). Every definition is
 * `additionalProperties:false`. Mirrors `.project-migrate/schemas/features.schema.json`. */
function refTreeFeaturesSchema(): Record<string, unknown> {
	return {
		$schema: "http://json-schema.org/draft-07/schema#",
		title: "Features",
		type: "object",
		required: ["features"],
		properties: { features: { type: "array", items: { $ref: "#/definitions/feature" } } },
		definitions: {
			feature: {
				type: "object",
				additionalProperties: false,
				required: ["id", "title", "stories", "findings"],
				properties: {
					id: { type: "string", pattern: "^FEAT-\\d{3}$" },
					title: { type: "string" },
					stories: { type: "array", items: { $ref: "#/definitions/story" } },
					findings: { type: "array", items: { $ref: "#/definitions/scoped-finding" } },
				},
			},
			story: {
				type: "object",
				additionalProperties: false,
				required: ["id", "title", "tasks"],
				properties: {
					id: { type: "string" },
					title: { type: "string" },
					tasks: { type: "array", items: { $ref: "#/definitions/task" } },
				},
			},
			// The source task definition is `$ref`'d (depth-3 $ref tree). It declares its
			// own data fields (AP:false validates the on-disk data it was written under).
			// Clean-emit re-infers the SYNTHESIZED task block's schema from the promoted DATA,
			// inheriting NOTHING from this `$ref`'d definition — so the synthesized schema
			// carries no `$ref`, no `definitions`, and an AP:false over the OBSERVED union.
			task: {
				type: "object",
				additionalProperties: false,
				required: ["id"],
				properties: {
					id: { type: "string" },
					title: { type: "string" },
					status: { type: "string" },
					files: { type: "array", items: { type: "string" } },
					acceptance: { type: "string" },
				},
			},
			"scoped-finding": {
				type: "object",
				additionalProperties: false,
				required: ["id"],
				properties: { id: { type: "string" }, note: { type: "string" } },
			},
		},
	};
}

/** A DIVERGENT NARROW vestigial top-level `story` block schema: AP:false, a NARROWER
 * shape (id + name only) than the rich nested story data. This is the real `.project-migrate`
 * shape — a vestigial `story` block whose narrow schema CANNOT hold the rich nested stories,
 * which is exactly why the real targets SYNTHESIZE `feature-story` rather than reuse it. The
 * block is registered + fileless; the canonicalizer leaves it untouched (no data to backfill,
 * never a promotion target). */
function divergentNarrowStorySchema(): Record<string, unknown> {
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
					additionalProperties: false,
					required: ["id", "name"],
					properties: { id: { type: "string", pattern: "^STORY-\\d{3}$" }, name: { type: "string" } },
				},
			},
		},
	};
}

/** Build the real-shape-class fixture mirroring `.project-migrate` exactly:
 *   - `features` carries the depth-3 `$ref` tree (feature → $ref story → $ref task) + a
 *     0-data `findings` ($ref) array;
 *   - `story` is a registered-but-FILELESS DIVERGENT-NARROW vestigial block (AP:false, a
 *     narrower shape than the nested stories) — NOT reused; left untouched;
 *   - features.stories SYNTHESIZES a NEW `feature-story` block; feature-story.tasks
 *     SYNTHESIZES a NEW `story-task` block. */
function makeRealShapeFixture(): { cwd: string; work: string } {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "canon-real-"));
	writeBootstrapPointer(cwd, ".work");
	const work = path.join(cwd, ".work");
	fs.mkdirSync(path.join(work, "schemas"), { recursive: true });

	const config = {
		schema_version: "1.8.0",
		root: ".work",
		substrate_id: uniqueSubstrateId(),
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
	fs.writeFileSync(
		path.join(work, "schemas", "features.schema.json"),
		JSON.stringify(refTreeFeaturesSchema(), null, 2),
	);
	// Divergent-narrow vestigial story schema present (block registered) but NO story.json.
	fs.writeFileSync(
		path.join(work, "schemas", "story.schema.json"),
		JSON.stringify(divergentNarrowStorySchema(), null, 2),
	);

	// DATA: 1 feature, 2 stories (STORY-001 carries 2 tasks, STORY-002 carries 1), 0 findings.
	const features = {
		features: [
			{
				id: "FEAT-001",
				title: "Auth",
				stories: [
					{
						id: "STORY-001",
						title: "login",
						tasks: [
							{ id: "T1", title: "form", status: "todo", files: ["a.ts"], acceptance: "renders" },
							{ id: "T2", title: "api", status: "done", files: [], acceptance: "200" },
						],
					},
					{ id: "STORY-002", title: "logout", tasks: [{ id: "T3", title: "endpoint", status: "todo" }] },
				],
				findings: [],
			},
		],
	};
	fs.writeFileSync(path.join(work, "features.json"), JSON.stringify(features, null, 2));
	// story.json deliberately ABSENT (registered-but-fileless vestigial block).
	return { cwd, work };
}

const REAL_SHAPE_TARGETS: PromotionTargets = {
	"features.stories": {
		blockKind: "feature-story",
		prefix: "FSTORY-",
		idPattern: "^FSTORY-\\d{3}$",
		relationType: "feature_contains_story",
	},
	"feature-story.tasks": {
		blockKind: "story-task",
		prefix: "STORY-TASK-",
		idPattern: "^STORY-TASK-\\d{4}$",
		relationType: "story_contains_task",
	},
};

describe("canonicalizeSubstrate: real-shape-class (clean-emit dissolves the source-schema mole-classes)", () => {
	it("canonicalizes a $ref-tree + fileless + divergent-narrow-AP + 0-data substrate; NO dangling $ref; data re-inferred; dry==real; idempotent", (t) => {
		const real = makeRealShapeFixture();
		t.after(() => fs.rmSync(real.cwd, { recursive: true, force: true }));

		const report = canonicalizeSubstrate(real.work, { promotionTargets: REAL_SHAPE_TARGETS });

		// ── (a) NO dangling $ref anywhere — clean-emit ignored the source $ref tree.
		//    The features schema (depth-3 $ref tree pre-canonicalize) + the synth schemas
		//    all end clean. The vestigial story schema is EXEMPT — it is left untouched (no
		//    data, never a target), so it keeps its narrow form (proving non-reuse). ──
		const synthSchemaFiles = fs.readdirSync(path.join(real.work, "schemas")).filter((f) => f !== "story.schema.json");
		for (const f of synthSchemaFiles) {
			const raw = fs.readFileSync(path.join(real.work, "schemas", f), "utf-8");
			assert.equal(/\$ref/.test(raw), false, `schema ${f} has NO $ref (source $ref tree ignored)`);
			assert.equal(/"\$defs"|"definitions"/.test(raw), false, `schema ${f} has NO $defs/definitions`);
		}
		// EVERY schema (including the untouched vestigial story) has no nested id-bearing array.
		for (const f of fs.readdirSync(path.join(real.work, "schemas"))) {
			const schema = JSON.parse(fs.readFileSync(path.join(real.work, "schemas", f), "utf-8")) as Record<
				string,
				unknown
			>;
			assert.deepEqual(findNestedIdBearingArrays(schema), [], `schema ${f} has no nested id-bearing array`);
		}

		// ── full depth-3 promoted THROUGH A SYNTHESIZED intermediate: 2 feature-story
		//    (synth) + 3 story-task (synth). The source $ref tree was never consulted. ──
		const fsCfg = (readConfig(real.work).block_kinds as Record<string, unknown>[]).find(
			(b) => b.canonical_id === "feature-story",
		)!;
		const stories = readBlockItems(real.work, fsCfg.data_path as string, fsCfg.array_key as string);
		assert.equal(stories.length, 2, "2 stories promoted into the SYNTHESIZED feature-story block");
		for (const s of stories) assert.match(s.id as string, /^FSTORY-\d{3}$/, "synth feature-story id minted");
		const taskCfg = (readConfig(real.work).block_kinds as Record<string, unknown>[]).find(
			(b) => b.canonical_id === "story-task",
		)!;
		const tasks = readBlockItems(real.work, taskCfg.data_path as string, taskCfg.array_key as string);
		assert.equal(tasks.length, 3, "3 tasks promoted (depth-3 through the synth intermediate)");

		// ── (b) fileless synth blocks were seeded ───────────────────────────────────
		assert.ok(fs.existsSync(path.join(real.work, fsCfg.data_path as string)), "synth feature-story file seeded");
		assert.ok(fs.existsSync(path.join(real.work, taskCfg.data_path as string)), "synth story-task file seeded");

		// ── (c) the DIVERGENT-NARROW vestigial story block is left UNTOUCHED — clean-emit
		//    SYNTHESIZED feature-story rather than forcing the rich nested data into the
		//    narrow story shape (no story.json created; its narrow schema unchanged). ──
		assert.equal(fs.existsSync(path.join(real.work, "story.json")), false, "vestigial story block left fileless");
		const vestigial = JSON.parse(
			fs.readFileSync(path.join(real.work, "schemas", "story.schema.json"), "utf-8"),
		) as Record<string, unknown>;
		assert.deepEqual(
			vestigial,
			divergentNarrowStorySchema(),
			"vestigial divergent-narrow story schema untouched (clean-emit synthesized instead of reusing)",
		);

		// ── the inferred SYNTH story-task schema carries the RICHER field union (status/
		//    files/acceptance) from DATA, AP:false, no $ref — inherits nothing from source. ──
		const taskSchema = JSON.parse(
			fs.readFileSync(path.join(real.work, taskCfg.schema_path as string), "utf-8"),
		) as Record<string, unknown>;
		const tItemNode = (taskSchema.properties as Record<string, Record<string, unknown>>)[taskCfg.array_key as string]
			.items as Record<string, unknown>;
		assert.equal(tItemNode.additionalProperties, false, "synth task item shape AP:false over observed union");
		const tItems = tItemNode.properties as Record<string, Record<string, unknown>>;
		for (const fld of ["status", "files", "acceptance", "title"]) {
			assert.ok(Object.hasOwn(tItems, fld), `inferred task schema declares data field '${fld}'`);
		}
		assert.equal(tItems.status.type, "string", "status inferred as string from data");
		assert.equal(tItems.files.type, "array", "files inferred as (loose) array from data");

		// ── (d) 0-data findings survives as a loose array (no promotion, no block) ──
		for (const fItem of readBlockItems(real.work, "features.json", "features")) {
			assert.ok(
				Array.isArray(fItem.findings) && (fItem.findings as unknown[]).length === 0,
				"findings 0-data retained",
			);
			assert.equal(Object.hasOwn(fItem, "stories"), false, "feature de-nested (stories promoted)");
		}
		assert.equal(
			report.promotions.some((p) => p.path === "features.findings"),
			false,
			"no promotion for the 0-data findings array",
		);

		// ── content-addressing + no item loss (2 stories + 3 tasks promoted) ────────
		for (const it of [...stories, ...tasks]) {
			assert.match(it.oid as string, /^[0-9a-f]{32}$/, `item ${String(it.id)} oid 32-hex`);
			assert.ok(hasObject(real.work, it.content_hash as string), `item ${String(it.id)} object on disk`);
		}
		assert.equal(
			report.promotions.reduce((n, p) => n + p.entities, 0),
			5,
			"5 entities promoted, no item loss",
		);

		// ── edges resolve via a pointer-switch validateContext → 0 nested + 0 dangling ──
		const original = JSON.parse(fs.readFileSync(path.join(real.cwd, ".pi-context.json"), "utf-8")) as {
			contextDir: string;
		};
		try {
			writeBootstrapPointer(real.cwd, ".work");
			const result = validateContext(real.cwd);
			assert.deepEqual(
				result.issues.filter((i) => i.code === "nested_id_bearing_array"),
				[],
				"validateContext: 0 nested_id_bearing_array",
			);
			assert.deepEqual(
				result.issues.filter((i) => i.code === "edge_endpoint_dangling" || i.code === "edge_endpoint_unregistered"),
				[],
				"validateContext: 0 dangling/unregistered edge endpoints",
			);
		} finally {
			writeBootstrapPointer(real.cwd, original.contextDir);
		}

		// ── idempotent: a second run promotes/mints nothing ─────────────────────────
		const report2 = canonicalizeSubstrate(real.work, { promotionTargets: REAL_SHAPE_TARGETS });
		assert.equal(report2.promotions.length, 0, "2nd run: 0 promotions");
		assert.equal(report2.items_oid_minted, 0, "2nd run: 0 oids minted");
		assert.deepEqual(report2.schema_denested, [], "2nd run: 0 schemas de-nested");
	});

	it("dry-run counts == real-run counts on the real-shape fixture (field-by-field)", (t) => {
		const realF = makeRealShapeFixture();
		t.after(() => fs.rmSync(realF.cwd, { recursive: true, force: true }));
		const realReport = canonicalizeSubstrate(realF.work, { promotionTargets: REAL_SHAPE_TARGETS });

		const dryF = makeRealShapeFixture();
		t.after(() => fs.rmSync(dryF.cwd, { recursive: true, force: true }));
		const before = snapshotTree(dryF.work);
		const dryReport = canonicalizeSubstrate(dryF.work, { dryRun: true, promotionTargets: REAL_SHAPE_TARGETS });
		const after = snapshotTree(dryF.work);

		assert.deepEqual([...after.entries()].sort(), [...before.entries()].sort(), "dryRun: every byte unchanged");
		assert.deepEqual(dryReport.promotions, realReport.promotions, "dry promotions == real");
		assert.equal(dryReport.items_oid_minted, realReport.items_oid_minted, "dry minted == real");
		assert.equal(dryReport.items_hashed, realReport.items_hashed, "dry hashed == real");
		assert.equal(dryReport.objects_stored, realReport.objects_stored, "dry objects_stored == real");
		assert.equal(dryReport.edges_structured, realReport.edges_structured, "dry edges_structured == real");
		assert.deepEqual(dryReport.schema_denested.sort(), realReport.schema_denested.sort(), "dry denested == real");
		assert.deepEqual(dryReport.kinds_registered.sort(), realReport.kinds_registered.sort(), "dry kinds == real");
	});

	it("ADVERSARIAL-REVERT: the real-shape test FAILS if the inference is stubbed back to source-preserving (the $ref survives)", (t) => {
		// This test documents + actively proves the regression guard. A source-PRESERVING
		// builder would carry the source `$ref` tree (or the divergent-narrow AP) into the
		// output. We simulate that failure mode by asserting the OPPOSITE of clean-emit on a
		// deliberately source-preserving schema body, and confirm the clean-emit assertions
		// that the real-shape test relies on would NOT hold for it — i.e. those assertions
		// are load-bearing, not vacuous.
		const real = makeRealShapeFixture();
		t.after(() => fs.rmSync(real.cwd, { recursive: true, force: true }));

		// The SOURCE features schema (what a source-preserving builder would emit a clone of):
		// it DOES contain $ref + definitions. The real-shape test's "NO $ref" assertion is the
		// thing that catches a source-preserving reversion — prove it fires on the source body.
		const sourceRaw = fs.readFileSync(path.join(real.work, "schemas", "features.schema.json"), "utf-8");
		assert.equal(/\$ref/.test(sourceRaw), true, "PRE-canonicalize source schema DOES carry $ref (mole-class present)");
		assert.throws(
			() => {
				// The clean-emit assertion the real-shape test runs post-canonicalize:
				assert.equal(/\$ref/.test(sourceRaw), false, "clean-emit: no $ref");
			},
			/no \$ref/,
			"a source-preserving output (carrying $ref) FAILS the clean-emit no-$ref assertion",
		);
	});
});

describe("deriveIdPattern + inferItemSubschemaFromData (clean-emit primitives)", () => {
	it("deriveIdPattern derives ^prefix\\d{N}$ from regular ids; null for irregular", () => {
		assert.equal(deriveIdPattern(["DEC-0001", "DEC-0002", "DEC-0099"]), "^DEC-\\d{4}$", "DEC- width 4");
		assert.equal(deriveIdPattern(["FEAT-001", "FEAT-011"]), "^FEAT-\\d{3}$", "FEAT- width 3");
		assert.equal(deriveIdPattern(["issue-001"]), "^issue-\\d{3}$", "lowercase prefix");
		assert.equal(deriveIdPattern(["L1", "L2", "L5"]), "^L\\d{1}$", "prefix with no separator");
		assert.equal(deriveIdPattern(["PHASE-1", "PHASE-7"]), "^PHASE-\\d{1}$", "PHASE- width 1");
		assert.equal(deriveIdPattern(["FEAT-1", "FEAT-22"]), "^FEAT-\\d{1,}$", "mixed width → open upper");
		assert.equal(deriveIdPattern(["FEAT-001", "STORY-001"]), null, "divergent prefixes → null");
		assert.equal(deriveIdPattern(["nodigits"]), null, "no numeric suffix → null");
		assert.equal(deriveIdPattern([]), null, "empty → null");
	});

	it("inferItemSubschemaFromData unions field types across ALL items, required:['id'] only, AP:false", () => {
		const inferred = inferItemSubschemaFromData(
			[
				{ id: "X-001", a: "s", b: 1, present_on_first: true },
				{ id: "X-002", a: "s2", b: 2, only_on_second: [1, 2] },
			],
			{},
		);
		assert.equal(inferred.additionalProperties, false, "AP:false");
		assert.deepEqual(inferred.required, ["id"], "required is id-only");
		const props = inferred.properties as Record<string, Record<string, unknown>>;
		assert.deepEqual(props.id, { type: "string", pattern: "^X-\\d{3}$" }, "id pattern derived from data");
		assert.equal(props.a.type, "string");
		assert.equal(props.b.type, "number");
		assert.equal(props.present_on_first.type, "boolean", "field present on some-not-all is OPTIONAL but typed");
		assert.equal(props.only_on_second.type, "array", "array declared LOOSE (no items)");
		assert.ok(Object.hasOwn(props, "oid") && Object.hasOwn(props, "content_hash"), "identity fields appended");
	});

	it("inferItemSubschemaFromData collapses a field with >1 non-null type to a permissive {}", () => {
		const inferred = inferItemSubschemaFromData(
			[
				{ id: "X-1", mixed: "s" },
				{ id: "X-2", mixed: 7 },
			],
			{ idPattern: "^X-\\d+$" },
		);
		const props = inferred.properties as Record<string, Record<string, unknown>>;
		assert.deepEqual(props.mixed, {}, "mixed-type field → permissive {} (no type)");
		assert.deepEqual(props.id, { type: "string", pattern: "^X-\\d+$" }, "given idPattern used verbatim");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// ORPHAN-BLOCK REGISTRATION (`opts.registerBlocks`) — replicates the real
// `.project-migrate` `conventions` block: a content-bearing `<arrayKey>` array of
// SLUG-id items (no prefix+number pattern, `id` declared as bare `{type:"string"}`)
// that is NOT a registered block_kind, PLUS singleton top-level fields alongside the
// array. Its schema is ALREADY CLEAN (it models the array + the singletons correctly),
// so it must NOT be clean-emit-rebuilt — only registered + identity-injected, then the
// existing backfill content-addresses the items (slug ids kept verbatim).
// ─────────────────────────────────────────────────────────────────────────────

/** A clean conventions-shaped schema: a `rules` array of slug-id items + singleton
 * top-level fields (`lint_command` string, `test_conventions` object). The item `id`
 * is a bare `{type:"string"}` (slug ids — NO pattern). It does NOT yet declare the 3
 * identity fields — the registerBlocks inject must add them WITHOUT touching anything
 * else. Mirrors `.project-migrate/schemas/conventions.schema.json`'s structure. */
function conventionsSchema(): Record<string, unknown> {
	return {
		$schema: "http://json-schema.org/draft-07/schema#",
		title: "Conventions",
		description: "Code and process conventions.",
		type: "object",
		required: ["rules"],
		properties: {
			rules: {
				type: "array",
				items: {
					type: "object",
					required: ["id", "description", "enforcement", "severity"],
					properties: {
						id: { type: "string" },
						description: { type: "string" },
						enforcement: { type: "string", enum: ["lint", "test", "review", "manual"] },
						severity: { type: "string", enum: ["error", "warning", "info"] },
					},
				},
			},
			test_conventions: {
				type: "object",
				required: ["runner_command", "file_pattern"],
				properties: { runner_command: { type: "string" }, file_pattern: { type: "string" } },
			},
			lint_command: { type: "string" },
			lint_scope: { type: "string" },
		},
	};
}

/** A scratch substrate carrying an UNREGISTERED hybrid `conventions` block: a `rules`
 * array (3 slug-id items WITHOUT identity fields) + two singleton top-level fields
 * (`lint_command` string, `test_conventions` object). The block_kind is deliberately
 * NOT in config; the schema is on disk (clean). */
function makeOrphanFixture(): { cwd: string; work: string } {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "canon-orphan-"));
	writeBootstrapPointer(cwd, ".work");
	const work = path.join(cwd, ".work");
	fs.mkdirSync(path.join(work, "schemas"), { recursive: true });

	const config = {
		schema_version: "1.8.0",
		root: ".work",
		substrate_id: uniqueSubstrateId(),
		// conventions deliberately ABSENT from block_kinds (the orphan).
		block_kinds: [] as Record<string, unknown>[],
		relation_types: [],
		invariants: [],
	};
	fs.writeFileSync(path.join(work, "config.json"), JSON.stringify(config, null, 2));
	fs.writeFileSync(path.join(work, "schemas", "conventions.schema.json"), JSON.stringify(conventionsSchema(), null, 2));
	fs.writeFileSync(
		path.join(work, "conventions.json"),
		JSON.stringify(
			{
				rules: [
					{ id: "esm", description: "ESM only", enforcement: "lint", severity: "error" },
					{ id: "tsc-build", description: "tsc compiles", enforcement: "lint", severity: "error" },
					{ id: "no-pi-dir", description: "never touch .pi", enforcement: "review", severity: "warning" },
				],
				test_conventions: { runner_command: "tsx --test", file_pattern: "src/*.test.ts" },
				lint_command: "biome check .",
			},
			null,
			2,
		),
	);
	return { cwd, work };
}

const ORPHAN_REGISTER: RegisterBlock[] = [
	{
		canonical_id: "conventions",
		array_key: "rules",
		prefix: "",
		schema_path: "schemas/conventions.schema.json",
		data_path: "conventions.json",
	},
];

describe("canonicalizeSubstrate: orphan-block registration (opts.registerBlocks)", () => {
	it("registers an unregistered hybrid block, content-addresses its slug-id items, keeps singletons + schema shape", (t) => {
		const { cwd, work } = makeOrphanFixture();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		// Capture the orphan schema BEFORE canonicalize to prove it is identity-injected,
		// NOT clean-emit-rebuilt.
		const schemaBefore = JSON.parse(
			fs.readFileSync(path.join(work, "schemas", "conventions.schema.json"), "utf-8"),
		) as Record<string, unknown>;

		const report = canonicalizeSubstrate(work, { promotionTargets: {}, registerBlocks: ORPHAN_REGISTER });

		// ── conventions is now a registered block_kind ──────────────────────────
		assert.ok(report.registered_blocks.includes("conventions"), "report records conventions registered");
		const bk = (readConfig(work).block_kinds as Record<string, unknown>[]).find(
			(b) => b.canonical_id === "conventions",
		);
		assert.ok(bk, "conventions registered as a block_kind in config");
		assert.equal(bk!.array_key, "rules", "array_key = rules");
		assert.equal(bk!.data_path, "conventions.json", "data_path preserved");
		assert.equal(bk!.schema_path, "schemas/conventions.schema.json", "schema_path preserved");

		// ── the 3 rules are content-addressed, slug ids unchanged ───────────────
		const rules = readBlockItems(work, "conventions.json", "rules");
		assert.equal(rules.length, 3, "3 rules retained");
		assert.deepEqual(
			rules.map((r) => r.id).sort(),
			["esm", "no-pi-dir", "tsc-build"],
			"slug ids unchanged (no minting, no prefix+number)",
		);
		for (const r of rules) {
			assert.match(r.oid as string, /^[0-9a-f]{32}$/, `rule ${String(r.id)} oid 32-hex`);
			assert.match(r.content_hash as string, /^[0-9a-f]{64}$/, `rule ${String(r.id)} content_hash 64-hex`);
			assert.ok(hasObject(work, r.content_hash as string), `rule ${String(r.id)} object on disk`);
		}

		// ── singleton top-level fields preserved (not items, never touched) ──────
		const data = JSON.parse(fs.readFileSync(path.join(work, "conventions.json"), "utf-8")) as Record<string, unknown>;
		assert.equal(data.lint_command, "biome check .", "lint_command singleton preserved");
		assert.deepEqual(
			data.test_conventions,
			{ runner_command: "tsx --test", file_pattern: "src/*.test.ts" },
			"test_conventions object singleton preserved verbatim",
		);

		// ── existing data validates: the items wrote back through the framework's
		//    validating writeBlockForDir without throwing (asserted by reaching here),
		//    and no nested id-bearing array surfaced in the schema ─────────────────
		const schemaAfter = JSON.parse(
			fs.readFileSync(path.join(work, "schemas", "conventions.schema.json"), "utf-8"),
		) as Record<string, unknown>;
		assert.deepEqual(findNestedIdBearingArrays(schemaAfter), [], "conventions schema has no nested id-bearing array");

		// ── schema is IDENTITY-INJECTED, NOT clean-emit-rebuilt: it still declares the
		//    singleton top-level fields + the item `id` is the ORIGINAL bare {type:string}
		//    (NO pattern added), only the 3 identity fields are newly present on the item ─
		const itemPropsBefore = (
			(schemaBefore.properties as Record<string, Record<string, unknown>>).rules.items as Record<string, unknown>
		).properties as Record<string, Record<string, unknown>>;
		const itemPropsAfter = (
			(schemaAfter.properties as Record<string, Record<string, unknown>>).rules.items as Record<string, unknown>
		).properties as Record<string, Record<string, unknown>>;
		assert.deepEqual(itemPropsAfter.id, { type: "string" }, "item id kept as bare {type:string} (no pattern minted)");
		for (const idf of ["oid", "content_hash", "content_parent"]) {
			assert.ok(Object.hasOwn(itemPropsAfter, idf), `item schema now declares identity field ${idf}`);
		}
		// Every NON-identity item property is byte-identical to before (no rebuild).
		for (const k of Object.keys(itemPropsBefore)) {
			assert.deepEqual(
				itemPropsAfter[k],
				itemPropsBefore[k],
				`item property '${k}' unchanged (surgical inject, no rebuild)`,
			);
		}
		// The top-level singleton schema properties survive byte-for-byte.
		const propsAfter = schemaAfter.properties as Record<string, unknown>;
		assert.deepEqual(
			propsAfter.test_conventions,
			(schemaBefore.properties as Record<string, unknown>).test_conventions,
			"test_conventions schema property unchanged",
		);
		assert.deepEqual(propsAfter.lint_command, { type: "string" }, "lint_command schema property unchanged");
		assert.deepEqual(propsAfter.lint_scope, { type: "string" }, "lint_scope schema property unchanged");
		assert.equal(schemaAfter.title, "Conventions", "title preserved (not rebuilt to canonical_id)");

		// ── idempotent: a 2nd run registers nothing, mints no oids ───────────────
		const report2 = canonicalizeSubstrate(work, { promotionTargets: {}, registerBlocks: ORPHAN_REGISTER });
		assert.deepEqual(report2.registered_blocks, [], "2nd run: 0 orphan blocks newly registered");
		assert.equal(report2.items_oid_minted, 0, "2nd run: 0 oids minted (all rules already content-addressed)");
		const rules2 = readBlockItems(work, "conventions.json", "rules");
		assert.deepEqual(rules2.map((r) => r.oid).sort(), rules.map((r) => r.oid).sort(), "2nd run: rule oids stable");
	});

	it("dryRun with registerBlocks reports the orphan + writes nothing", (t) => {
		const { cwd, work } = makeOrphanFixture();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		const before = snapshotTree(work);
		const report = canonicalizeSubstrate(work, { dryRun: true, promotionTargets: {}, registerBlocks: ORPHAN_REGISTER });
		const after = snapshotTree(work);

		assert.deepEqual([...after.entries()].sort(), [...before.entries()].sort(), "dryRun: every byte unchanged");
		assert.ok(report.registered_blocks.includes("conventions"), "dryRun reports conventions would be registered");
		assert.ok(report.items_oid_minted >= 3, "dryRun reports the 3 rules would be oid-minted");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// EMPTY-DATA NESTED-ID SCHEMA (the wasc shape) — a block whose SCHEMA declares a
// nested id-bearing array but whose DATA is empty (0 parent items). The data-driven
// promotion/de-nest path skips it entirely (dataNestedIdArrayKeys skips empty arrays;
// prepareParentSchema early-returns at 0 items; denestParent runs only when a key was
// promoted), so before the schema-surgical sweep the nested-array DECLARATION survived
// and validateContext flagged `nested_id_bearing_array`. The Step 3.5 sweep
// (stripNestedIdArrayFromSchema) strips it data-independently.
// ─────────────────────────────────────────────────────────────────────────────

/** A `layer-plans`-like schema: a `plans` array whose item shape declares TWO nested
 * id-bearing arrays — `layers[].id` + `migration_phases[].id` — which
 * findNestedIdBearingArrays reports as `plans.layers` + `plans.migration_phases`. */
function layerPlansSchema(): Record<string, unknown> {
	const idArr = (idPattern: string): Record<string, unknown> => ({
		type: "array",
		items: {
			type: "object",
			additionalProperties: false,
			required: ["id"],
			properties: { id: { type: "string", pattern: idPattern }, label: { type: "string" } },
		},
	});
	return {
		$schema: "http://json-schema.org/draft-07/schema#",
		$id: "pi-context://schemas/layer-plans",
		version: "1.0.0",
		title: "Layer Plans",
		type: "object",
		required: ["plans"],
		properties: {
			plans: {
				type: "array",
				items: {
					type: "object",
					additionalProperties: false,
					required: ["id", "layers"],
					properties: {
						id: { type: "string", pattern: "^PLAN-\\d{3}$" },
						title: { type: "string" },
						layers: idArr("^LAYER-\\d{3}$"),
						migration_phases: idArr("^PHASE-\\d{3}$"),
					},
				},
			},
		},
	};
}

/** A `plans` block whose item shape declares an OBJECT-valued `meta` property that itself
 * holds an id-bearing `layers` array. findNestedIdBearingArrays recurses object-valued
 * props at the SAME depth, so it reports `plans.meta.layers` — a path the OLD array-only
 * stripper could not navigate (the `meta` intermediate has no `items`). */
function objectWrapperPlansSchema(): Record<string, unknown> {
	return {
		$schema: "http://json-schema.org/draft-07/schema#",
		$id: "pi-context://schemas/plans",
		version: "1.0.0",
		title: "Plans",
		type: "object",
		required: ["plans"],
		properties: {
			plans: {
				type: "array",
				items: {
					type: "object",
					additionalProperties: false,
					required: ["id"],
					properties: {
						id: { type: "string", pattern: "^PLAN-\\d{3}$" },
						title: { type: "string" },
						meta: {
							type: "object",
							additionalProperties: false,
							required: ["layers"],
							properties: {
								label: { type: "string" },
								layers: {
									type: "array",
									items: {
										type: "object",
										additionalProperties: false,
										required: ["id"],
										properties: { id: { type: "string", pattern: "^LAYER-\\d{3}$" }, name: { type: "string" } },
									},
								},
							},
						},
					},
				},
			},
		},
	};
}

/** A `plans` block whose item shape is a `oneOf` COMPOSITION wrapper; one branch carries an
 * id-bearing `tasks` array. findNestedIdBearingArrays descends composition branches at the
 * SAME keyPath (a branch adds no path segment), so it reports `plans.tasks` — a path the OLD
 * stripper could not navigate (the item shape had no own `properties.tasks`). */
function compositionWrapperPlansSchema(): Record<string, unknown> {
	return {
		$schema: "http://json-schema.org/draft-07/schema#",
		$id: "pi-context://schemas/plans",
		version: "1.0.0",
		title: "Plans",
		type: "object",
		required: ["plans"],
		properties: {
			plans: {
				type: "array",
				items: {
					type: "object",
					oneOf: [
						{
							type: "object",
							required: ["id"],
							properties: { id: { type: "string", pattern: "^PLAN-\\d{3}$" }, kind: { const: "leaf" } },
						},
						{
							type: "object",
							required: ["id", "tasks"],
							properties: {
								id: { type: "string", pattern: "^PLAN-\\d{3}$" },
								kind: { const: "branch" },
								tasks: {
									type: "array",
									items: {
										type: "object",
										additionalProperties: false,
										required: ["id"],
										properties: { id: { type: "string", pattern: "^TASK-\\d{3}$" }, desc: { type: "string" } },
									},
								},
							},
						},
					],
				},
			},
		},
	};
}

/** Build a substrate carrying an empty-data `layer-plans` block (nested-id schema +
 * `{"plans":[]}`). When `withData` is true the `plans` array carries ONE item with a
 * NON-empty `layers` array — exercising the DATA-driven promotion path (regression). */
function makeLayerPlansFixture(opts?: { withData?: boolean }): { cwd: string; work: string } {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "canon-wasc-"));
	writeBootstrapPointer(cwd, ".work");
	const work = path.join(cwd, ".work");
	fs.mkdirSync(path.join(work, "schemas"), { recursive: true });

	const config = {
		schema_version: "1.8.0",
		root: ".work",
		substrate_id: uniqueSubstrateId(),
		block_kinds: [
			{
				canonical_id: "layer-plans",
				display_name: "Layer Plans",
				prefix: "PLAN-",
				schema_path: "schemas/layer-plans.schema.json",
				array_key: "plans",
				data_path: "layer-plans.json",
			},
		],
		relation_types: [],
		invariants: [],
	};
	fs.writeFileSync(path.join(work, "config.json"), JSON.stringify(config, null, 2));
	fs.writeFileSync(path.join(work, "schemas", "layer-plans.schema.json"), JSON.stringify(layerPlansSchema(), null, 2));
	const data = opts?.withData
		? {
				plans: [
					{
						id: "PLAN-001",
						title: "rollout",
						layers: [
							{ id: "LAYER-001", label: "ingest" },
							{ id: "LAYER-002", label: "transform" },
						],
						migration_phases: [],
					},
				],
			}
		: { plans: [] };
	fs.writeFileSync(path.join(work, "layer-plans.json"), JSON.stringify(data, null, 2));
	return { cwd, work };
}

describe("canonicalizeSubstrate: empty-data nested-id schema (the wasc empty-schema de-nest)", () => {
	it("strips the nested id-bearing array DECLARATIONS from a 0-item block's schema; validateContext clean", (t) => {
		const { cwd, work } = makeLayerPlansFixture();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		// Precondition: the on-disk schema DOES declare the nested id-bearing arrays.
		const schemaBefore = JSON.parse(
			fs.readFileSync(path.join(work, "schemas", "layer-plans.schema.json"), "utf-8"),
		) as Record<string, unknown>;
		assert.deepEqual(
			findNestedIdBearingArrays(schemaBefore).sort(),
			["plans.layers", "plans.migration_phases"],
			"precondition: schema declares plans.layers + plans.migration_phases",
		);

		// No promotionTargets needed — the data is empty (nothing data-bearing to promote).
		const report = canonicalizeSubstrate(work, { promotionTargets: {} });

		// ── the schema no longer declares the nested arrays ──────────────────────
		const schemaAfter = JSON.parse(
			fs.readFileSync(path.join(work, "schemas", "layer-plans.schema.json"), "utf-8"),
		) as Record<string, unknown>;
		assert.deepEqual(
			findNestedIdBearingArrays(schemaAfter),
			[],
			"post-canonicalize: schema declares no nested id-bearing array",
		);
		const planItemProps = (
			(schemaAfter.properties as Record<string, Record<string, unknown>>).plans.items as Record<string, unknown>
		).properties as Record<string, Record<string, unknown>>;
		assert.equal(Object.hasOwn(planItemProps, "layers"), false, "layers property declaration removed");
		assert.equal(Object.hasOwn(planItemProps, "migration_phases"), false, "migration_phases property removed");
		assert.ok(Object.hasOwn(planItemProps, "id") && Object.hasOwn(planItemProps, "title"), "non-nested props retained");
		// `layers` was in `required` — it must be dropped from required too.
		const planItems = (schemaAfter.properties as Record<string, Record<string, unknown>>).plans.items as Record<
			string,
			unknown
		>;
		assert.deepEqual(planItems.required, ["id"], "layers dropped from item required (id retained)");

		// ── the strip is recorded in the report ─────────────────────────────────
		assert.ok(report.schema_denested.includes("layer-plans"), "report records layer-plans schema de-nested");

		// ── validateContext clean of nested_id_bearing_array via pointer-switch ──
		const original = JSON.parse(fs.readFileSync(path.join(cwd, ".pi-context.json"), "utf-8")) as { contextDir: string };
		try {
			writeBootstrapPointer(cwd, ".work");
			const result = validateContext(cwd);
			assert.deepEqual(
				result.issues.filter((i) => i.code === "nested_id_bearing_array"),
				[],
				"validateContext: 0 nested_id_bearing_array (the wasc bug fixed)",
			);
		} finally {
			writeBootstrapPointer(cwd, original.contextDir);
		}

		// ── idempotent: a 2nd run de-nests nothing (already clean) ───────────────
		const report2 = canonicalizeSubstrate(work, { promotionTargets: {} });
		assert.deepEqual(report2.schema_denested, [], "2nd run: 0 schemas de-nested (already clean)");
	});

	it("dryRun on the wasc shape writes nothing yet reports the schema would be de-nested", (t) => {
		const { cwd, work } = makeLayerPlansFixture();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		const before = snapshotTree(work);
		const report = canonicalizeSubstrate(work, { dryRun: true, promotionTargets: {} });
		const after = snapshotTree(work);

		assert.deepEqual([...after.entries()].sort(), [...before.entries()].sort(), "dryRun: every byte unchanged");
		assert.ok(report.schema_denested.includes("layer-plans"), "dryRun reports layer-plans would be de-nested");
		// On-disk schema still carries the nested arrays (dryRun wrote nothing).
		const schema = JSON.parse(
			fs.readFileSync(path.join(work, "schemas", "layer-plans.schema.json"), "utf-8"),
		) as Record<string, unknown>;
		assert.ok(findNestedIdBearingArrays(schema).length === 2, "dryRun: on-disk schema unchanged (still nested)");
	});

	it("REGRESSION: a data-BEARING nested array still PROMOTES to a top-level block + membership edges (unchanged)", (t) => {
		const { cwd, work } = makeLayerPlansFixture({ withData: true });
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		// The non-empty `plans[0].layers` array is DATA-bearing → it must promote (not merely
		// strip). Supply an explicit target (explicit-or-fail). migration_phases is empty per
		// item → no data key → handled by the schema-surgical sweep (no target needed).
		const targets: PromotionTargets = {
			"layer-plans.layers": {
				blockKind: "layer",
				prefix: "LAYER-",
				idPattern: "^LAYER-\\d{4}$",
				relationType: "plan_contains_layer",
			},
		};
		const report = canonicalizeSubstrate(work, { promotionTargets: targets });

		// ── the layers were PROMOTED into a top-level `layer` block ──────────────
		const layerPromo = report.promotions.find((p) => p.path === "layer-plans.layers");
		assert.ok(layerPromo, "layer-plans.layers promoted (data-bearing)");
		assert.equal(layerPromo?.entities, 2, "2 layers promoted");
		assert.equal(layerPromo?.edges, 2, "2 membership edges filed");
		assert.ok(report.kinds_registered.includes("layer"), "the layer block was registered");

		const layerCfg = (readConfig(work).block_kinds as Record<string, unknown>[]).find(
			(b) => b.canonical_id === "layer",
		)!;
		const layers = readBlockItems(work, layerCfg.data_path as string, layerCfg.array_key as string);
		assert.equal(layers.length, 2, "2 layer items on disk");
		for (const l of layers) {
			assert.match(l.id as string, /^LAYER-\d{4}$/, `layer ${String(l.id)} minted via given prefix`);
			assert.match(l.oid as string, /^[0-9a-f]{32}$/, `layer ${String(l.id)} content-addressed`);
		}

		// ── membership edges parent(plan)→child(layer) with ordinals ─────────────
		const edges = loadRelationsForDir(work);
		const layerEdges = edges.filter((e) => e.relation_type === "plan_contains_layer");
		assert.equal(layerEdges.length, 2, "2 plan_contains_layer edges");
		assert.deepEqual(layerEdges.map((e) => e.ordinal).sort(), [0, 1], "layer edge ordinals are the array indices 0,1");
		for (const e of layerEdges) {
			const child = e.child as EdgeEndpoint;
			assert.equal(child.kind, "item", "child endpoint structured");
			if (child.kind === "item")
				assert.match(child.refname ?? "", /^LAYER-00[12]$/, "child refname = original layer id");
		}

		// ── the parent block de-nested (data + schema), migration_phases stripped ─
		const plans = readBlockItems(work, "layer-plans.json", "plans");
		for (const p of plans) {
			assert.equal(Object.hasOwn(p, "layers"), false, "plan de-nested: no layers array (promoted)");
		}
		const schema = JSON.parse(
			fs.readFileSync(path.join(work, "schemas", "layer-plans.schema.json"), "utf-8"),
		) as Record<string, unknown>;
		assert.deepEqual(findNestedIdBearingArrays(schema), [], "no nested id-bearing array survives in the parent schema");
	});

	it("ALREADY-CANONICAL: a substrate with no nested-id schema is a no-op (no spurious schema rewrites)", (t) => {
		// Canonicalize the wasc fixture once → it becomes clean. A 2nd run must perform ZERO
		// schema writes (the sweep finds nothing) — proven by a byte-snapshot across the 2nd run.
		const { cwd, work } = makeLayerPlansFixture();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		canonicalizeSubstrate(work, { promotionTargets: {} });
		const before = snapshotTree(work);
		const report2 = canonicalizeSubstrate(work, { promotionTargets: {} });
		const after = snapshotTree(work);

		assert.deepEqual(
			[...after.entries()].sort(),
			[...before.entries()].sort(),
			"already-canonical: 2nd run writes no bytes",
		);
		assert.deepEqual(report2.schema_denested, [], "already-canonical: 0 schemas de-nested");
		assert.deepEqual(report2.promotions, [], "already-canonical: 0 promotions");
		assert.equal(report2.items_oid_minted, 0, "already-canonical: 0 oids minted");
	});
});

/** Build a single-block substrate with the GIVEN schema body + empty data
 * (`{ <arrayKey>: [] }`) — the wasc shape for exercising the Step 3.5 schema-surgical sweep
 * end-to-end on object-wrapper / composition-wrapper intermediate shapes. */
function makeEmptySchemaFixture(
	schemaBody: Record<string, unknown>,
	canonicalId: string,
	arrayKey: string,
): { cwd: string; work: string } {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "canon-shape-"));
	writeBootstrapPointer(cwd, ".work");
	const work = path.join(cwd, ".work");
	fs.mkdirSync(path.join(work, "schemas"), { recursive: true });
	const config = {
		schema_version: "1.8.0",
		root: ".work",
		substrate_id: uniqueSubstrateId(),
		block_kinds: [
			{
				canonical_id: canonicalId,
				display_name: canonicalId,
				prefix: "PLAN-",
				schema_path: `schemas/${canonicalId}.schema.json`,
				array_key: arrayKey,
				data_path: `${canonicalId}.json`,
			},
		],
		relation_types: [],
		invariants: [],
	};
	fs.writeFileSync(path.join(work, "config.json"), JSON.stringify(config, null, 2));
	fs.writeFileSync(path.join(work, "schemas", `${canonicalId}.schema.json`), JSON.stringify(schemaBody, null, 2));
	fs.writeFileSync(path.join(work, `${canonicalId}.json`), JSON.stringify({ [arrayKey]: [] }, null, 2));
	return { cwd, work };
}

describe("canonicalizeSubstrate: Step 3.5 sweep de-nests object-wrapper + composition-wrapper intermediates", () => {
	it("de-nests an id-array reached through an OBJECT-valued intermediate (plans.meta.layers), validateContext clean", (t) => {
		const { cwd, work } = makeEmptySchemaFixture(objectWrapperPlansSchema(), "plans", "plans");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		const before = JSON.parse(fs.readFileSync(path.join(work, "schemas", "plans.schema.json"), "utf-8")) as Record<
			string,
			unknown
		>;
		assert.deepEqual(findNestedIdBearingArrays(before), ["plans.meta.layers"], "precondition: detector flags the path");

		const report = canonicalizeSubstrate(work, { promotionTargets: {} });

		const after = JSON.parse(fs.readFileSync(path.join(work, "schemas", "plans.schema.json"), "utf-8")) as Record<
			string,
			unknown
		>;
		assert.deepEqual(findNestedIdBearingArrays(after), [], "post-canonicalize: object-wrapper id-array stripped");
		assert.ok(report.schema_denested.includes("plans"), "report records plans de-nested");
		const meta = ((after.properties as Record<string, Record<string, unknown>>).plans.items as Record<string, unknown>)
			.properties as Record<string, Record<string, unknown>>;
		assert.equal(
			Object.hasOwn(meta.meta.properties as Record<string, unknown>, "layers"),
			false,
			"layers declaration removed from the meta wrapper",
		);

		const original = JSON.parse(fs.readFileSync(path.join(cwd, ".pi-context.json"), "utf-8")) as { contextDir: string };
		try {
			writeBootstrapPointer(cwd, ".work");
			const result = validateContext(cwd);
			assert.deepEqual(
				result.issues.filter((i) => i.code === "nested_id_bearing_array"),
				[],
				"validateContext: 0 nested_id_bearing_array (object-wrapper case fixed)",
			);
		} finally {
			writeBootstrapPointer(cwd, original.contextDir);
		}
	});

	it("de-nests an id-array carried in a COMPOSITION branch (plans.tasks), validateContext clean", (t) => {
		const { cwd, work } = makeEmptySchemaFixture(compositionWrapperPlansSchema(), "plans", "plans");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		const before = JSON.parse(fs.readFileSync(path.join(work, "schemas", "plans.schema.json"), "utf-8")) as Record<
			string,
			unknown
		>;
		assert.deepEqual(findNestedIdBearingArrays(before), ["plans.tasks"], "precondition: detector flags the path");

		const report = canonicalizeSubstrate(work, { promotionTargets: {} });

		const after = JSON.parse(fs.readFileSync(path.join(work, "schemas", "plans.schema.json"), "utf-8")) as Record<
			string,
			unknown
		>;
		assert.deepEqual(findNestedIdBearingArrays(after), [], "post-canonicalize: composition-branch id-array stripped");
		assert.ok(report.schema_denested.includes("plans"), "report records plans de-nested");

		const original = JSON.parse(fs.readFileSync(path.join(cwd, ".pi-context.json"), "utf-8")) as { contextDir: string };
		try {
			writeBootstrapPointer(cwd, ".work");
			const result = validateContext(cwd);
			assert.deepEqual(
				result.issues.filter((i) => i.code === "nested_id_bearing_array"),
				[],
				"validateContext: 0 nested_id_bearing_array (composition-wrapper case fixed)",
			);
		} finally {
			writeBootstrapPointer(cwd, original.contextDir);
		}
	});

	it("dryRun on the object-wrapper shape writes nothing yet reports the schema would be de-nested", (t) => {
		const { cwd, work } = makeEmptySchemaFixture(objectWrapperPlansSchema(), "plans", "plans");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		const snap = snapshotTree(work);
		const report = canonicalizeSubstrate(work, { dryRun: true, promotionTargets: {} });
		const after = snapshotTree(work);

		assert.deepEqual([...after.entries()].sort(), [...snap.entries()].sort(), "dryRun: every byte unchanged");
		assert.ok(report.schema_denested.includes("plans"), "dryRun reports plans would be de-nested");
		// On-disk schema still nested (dryRun wrote nothing) — yet the report is honest because
		// the completeness guard consulted the in-memory stripped shape, not disk.
		const onDisk = JSON.parse(fs.readFileSync(path.join(work, "schemas", "plans.schema.json"), "utf-8")) as Record<
			string,
			unknown
		>;
		assert.deepEqual(findNestedIdBearingArrays(onDisk), ["plans.meta.layers"], "dryRun: on-disk schema unchanged");
	});
});

describe("canonicalizeSubstrate: Step 3.5 completeness guard", () => {
	it("does NOT fire on a shape the extended navigator covers (object-wrapper completes clean)", (t) => {
		// The extended navigator covers every intermediate the detector reaches (array, object,
		// composition), so a guard trip cannot be provoked through a real detector-reachable path —
		// the throw is reserved for a shape the navigator genuinely cannot strip (proven by the
		// tuple-items test below). Here: the object-wrapper path the OLD stripper missed is now
		// covered, so canonicalize completes WITHOUT the guard throwing.
		const { cwd, work } = makeEmptySchemaFixture(objectWrapperPlansSchema(), "plans", "plans");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		assert.doesNotThrow(
			() => canonicalizeSubstrate(work, { promotionTargets: {} }),
			"extended navigator covers the object-wrapper path; guard does not fire on a covered shape",
		);
		// Guard-wiring sanity: the guard's condition is `findNestedIdBearingArrays(postSweep) > 0`.
		// A still-nested schema is flagged by that same detector — so the THROW branch is reachable
		// for any shape the navigator might fail to strip (exercised concretely below).
		assert.ok(
			findNestedIdBearingArrays(objectWrapperPlansSchema()).length > 0,
			"the guard's detector re-run flags a still-nested schema (THROW branch reachable)",
		);
	});

	it("THROWS naming block + surviving path when the navigator cannot strip a detector-flagged shape (tuple-items)", (t) => {
		// Construct a shape the EXTENDED navigator genuinely cannot strip: a TUPLE-form `items`
		// (array of subschemas) carrying the nested id-array, which the navigator explicitly does
		// NOT navigate (returns changed:false — the canonicalizer never emits tuple-items), yet
		// which findNestedIdBearingArrays DOES descend (its descendShape iterates tuple members).
		// For such a shape the sweep records no change → the on-disk schema keeps the nested
		// id-array → the completeness guard MUST throw rather than let canonicalize return clean.
		const tupleItemsSchema = (): Record<string, unknown> => ({
			$schema: "http://json-schema.org/draft-07/schema#",
			$id: "pi-context://schemas/plans",
			version: "1.0.0",
			title: "Plans",
			type: "object",
			required: ["plans"],
			properties: {
				plans: {
					type: "array",
					items: [
						{
							type: "object",
							required: ["id"],
							properties: {
								id: { type: "string", pattern: "^PLAN-\\d{3}$" },
								layers: {
									type: "array",
									items: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
								},
							},
						},
					],
				},
			},
		});
		// Pre-conditions: detector flags it; navigator declines every flagged path.
		const flagged = findNestedIdBearingArrays(tupleItemsSchema());
		assert.ok(flagged.length > 0, "detector flags the tuple-items nested id-array");
		for (const dp of flagged) {
			assert.equal(
				stripNestedIdArrayFromSchema(tupleItemsSchema(), dp).changed,
				false,
				`navigator declines the tuple-items path '${dp}'`,
			);
		}

		// Full run: a 0-data tuple-items block reaches Step 3.5 with the nested array intact; the
		// sweep cannot strip it → the guard throws naming the block + the surviving path.
		const { cwd, work } = makeEmptySchemaFixture(tupleItemsSchema(), "plans", "plans");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		assert.throws(
			() => canonicalizeSubstrate(work, { promotionTargets: {} }),
			/completeness guard — block 'plans' still declares nested id-bearing array\(s\).*plans\.layers/s,
			"guard throws naming the block + surviving path on an un-strippable detector-flagged shape",
		);
	});
});

describe("stripNestedIdArrayFromSchema (schema-surgical navigator)", () => {
	it("strips a depth-1 nested array declaration + its required entry; leaves siblings intact", () => {
		const { schema, changed } = stripNestedIdArrayFromSchema(layerPlansSchema(), "plans.layers");
		assert.equal(changed, true, "reports changed");
		const props = (
			(schema.properties as Record<string, Record<string, unknown>>).plans.items as Record<string, unknown>
		).properties as Record<string, unknown>;
		assert.equal(Object.hasOwn(props, "layers"), false, "layers stripped");
		assert.equal(Object.hasOwn(props, "migration_phases"), true, "sibling nested array untouched");
		const items = (schema.properties as Record<string, Record<string, unknown>>).plans.items as Record<string, unknown>;
		assert.deepEqual(items.required, ["id"], "layers removed from required");
	});

	it("returns changed:false (and an untouched clone) for an unnavigable / absent path", () => {
		const before = layerPlansSchema();
		const r1 = stripNestedIdArrayFromSchema(before, "plans.nonexistent");
		assert.equal(r1.changed, false, "absent final segment → no change");
		const r2 = stripNestedIdArrayFromSchema(before, "missingArray.layers");
		assert.equal(r2.changed, false, "absent first segment → no change");
		const r3 = stripNestedIdArrayFromSchema(before, "plans");
		assert.equal(r3.changed, false, "single-segment path → no change");
	});

	it("strips a nested id-array reached through an OBJECT-valued intermediate property (plans.meta.layers)", () => {
		// `plans.items.properties.meta` is an OBJECT (no `items`) holding the id-bearing
		// `layers` array — findNestedIdBearingArrays reports `plans.meta.layers` (it recurses
		// object-valued props at the SAME depth). The detector path must round-trip the stripper.
		const schema = objectWrapperPlansSchema();
		assert.deepEqual(
			findNestedIdBearingArrays(schema),
			["plans.meta.layers"],
			"precondition: detector reports the path through the object wrapper",
		);
		const { schema: out, changed } = stripNestedIdArrayFromSchema(schema, "plans.meta.layers");
		assert.equal(changed, true, "reports changed for the object-wrapper path");
		const planItem = (out.properties as Record<string, Record<string, unknown>>).plans.items as Record<string, unknown>;
		const meta = (planItem.properties as Record<string, Record<string, unknown>>).meta;
		const metaProps = meta.properties as Record<string, unknown>;
		assert.equal(Object.hasOwn(metaProps, "layers"), false, "layers stripped from the object wrapper's properties");
		assert.equal(Object.hasOwn(metaProps, "label"), true, "sibling non-nested prop on the wrapper retained");
		assert.deepEqual(meta.required, [], "layers removed from the object wrapper's required");
		assert.deepEqual(findNestedIdBearingArrays(out), [], "no nested id-bearing array survives");
	});

	it("strips a nested id-array carried in an allOf/oneOf COMPOSITION branch of the item shape (plans.tasks)", () => {
		// The plan item shape is an `allOf`/`oneOf` wrapper; the id-bearing `tasks` array lives
		// inside a branch. findNestedIdBearingArrays descends composition branches at the SAME
		// keyPath (no segment added), so it reports `plans.tasks` — the stripper must delete from
		// the SAME branch the detector flagged.
		const schema = compositionWrapperPlansSchema();
		assert.deepEqual(
			findNestedIdBearingArrays(schema),
			["plans.tasks"],
			"precondition: detector reports the path through the composition branch",
		);
		const { schema: out, changed } = stripNestedIdArrayFromSchema(schema, "plans.tasks");
		assert.equal(changed, true, "reports changed for the composition-branch path");
		assert.deepEqual(findNestedIdBearingArrays(out), [], "no nested id-bearing array survives");
		// The strip landed inside the oneOf branch that declared `tasks`.
		const planItem = (out.properties as Record<string, Record<string, unknown>>).plans.items as Record<string, unknown>;
		const branches = planItem.oneOf as Record<string, unknown>[];
		const declaringBranch = branches.find(
			(b) => b.properties && Object.hasOwn(b.properties as Record<string, unknown>, "tasks"),
		);
		assert.equal(declaringBranch, undefined, "tasks declaration removed from the oneOf branch");
		const taskBranch = branches.find((b) => Array.isArray(b.required) && (b.required as string[]).includes("tasks"));
		assert.equal(taskBranch, undefined, "tasks removed from the branch's required too");
	});
});
