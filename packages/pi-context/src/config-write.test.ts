/**
 * Tests for the config-write surface (FGAP-076): amendConfigEntry in
 * context.ts, the scoped add / replace / remove of one config registry
 * entry layered on writeConfig.
 *
 * Covers each registry kind (keyed-array / map / string-array / value-array),
 * the OP-CORRECTNESS guard tier (add ⇒ key absent, replace/remove ⇒ key
 * present — each leaving config.json byte-unchanged on a guard throw), the SHAPE
 * tier (whole-config AJV via writeConfig), key/entry divergence, mtime-cache
 * invalidation, dry-run inertness, ctx structural-no-op parity, the DEFERRED
 * cross-registry referential integrity (a relation_type remove succeeds even
 * while a relations.json edge still cites it; validateContext is the catch), and
 * empty-after-remove leaving the registry property as [].
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
	amendConfigEntry,
	amendConfigEntryForDir,
	type ConfigBlock,
	loadConfig,
	loadConfigForDir,
	loadContext,
} from "./context.js";
import { writeBootstrapPointer } from "./context-dir.js";
import { validateContext } from "./context-sdk.js";
import { ValidationError } from "./schema-validator.js";

/** mkdtemp + bootstrap pointer at `.project` + ensure the substrate dir exists. */
function makeTmpDir(prefix: string): string {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `config-${prefix}-`));
	writeBootstrapPointer(cwd, ".project");
	fs.mkdirSync(path.join(cwd, ".project"), { recursive: true });
	return cwd;
}

function configFile(cwd: string): string {
	return path.join(cwd, ".project", "config.json");
}

/** Minimal valid ConfigBlock; callers spread overrides. */
function baseConfig(overrides: Partial<ConfigBlock> = {}): ConfigBlock {
	return {
		schema_version: "1.7.0",
		root: ".project",
		block_kinds: [],
		...overrides,
	} as ConfigBlock;
}

/** Direct write of config.json (test seed; bypasses the surface under test). */
function seedConfig(cwd: string, config: ConfigBlock): void {
	fs.writeFileSync(configFile(cwd), JSON.stringify(config));
}

function readRaw(cwd: string): string {
	return fs.readFileSync(configFile(cwd), "utf-8");
}

// ── 1: keyed-array (relation_types) add / replace / remove ────────────────────

describe("amendConfigEntry — keyed-array (relation_types)", () => {
	it("1: add then replace (order + previousValue) then remove", (t) => {
		const cwd = makeTmpDir("1-keyed");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		seedConfig(
			cwd,
			baseConfig({
				relation_types: [{ canonical_id: "a", display_name: "A", category: "ordering" }],
			}),
		);

		// add (appends after the existing "a", preserving order)
		const addRes = amendConfigEntry(cwd, "relation_types", "add", "b", {
			canonical_id: "b",
			display_name: "B",
			category: "data_flow",
		});
		assert.equal(addRes.modified, true);
		assert.equal(addRes.operation, "add");
		assert.equal(addRes.previousValue, undefined);
		let cfg = loadConfig(cwd)!;
		assert.deepEqual(
			cfg.relation_types?.map((r) => r.canonical_id),
			["a", "b"],
		);

		// replace b in place (order preserved, previousValue = old b)
		const repRes = amendConfigEntry(cwd, "relation_types", "replace", "b", {
			canonical_id: "b",
			display_name: "B2",
			category: "membership",
		});
		assert.equal(repRes.modified, true);
		assert.deepEqual(repRes.previousValue, { canonical_id: "b", display_name: "B", category: "data_flow" });
		cfg = loadConfig(cwd)!;
		assert.deepEqual(
			cfg.relation_types?.map((r) => r.canonical_id),
			["a", "b"],
		);
		assert.equal(cfg.relation_types?.find((r) => r.canonical_id === "b")?.display_name, "B2");

		// remove b (previousValue = removed entry)
		const remRes = amendConfigEntry(cwd, "relation_types", "remove", "b");
		assert.equal(remRes.modified, true);
		assert.deepEqual(remRes.previousValue, { canonical_id: "b", display_name: "B2", category: "membership" });
		cfg = loadConfig(cwd)!;
		assert.deepEqual(
			cfg.relation_types?.map((r) => r.canonical_id),
			["a"],
		);
	});
});

// ── 2: invariants (keyed-array, oneOf SHAPE) ──────────────────────────────────

describe("amendConfigEntry — invariants (oneOf SHAPE)", () => {
	it("2a: status-consistency invariant add passes AJV", (t) => {
		const cwd = makeTmpDir("2a-inv-ok");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		seedConfig(cwd, baseConfig({ invariants: [] }));

		const res = amendConfigEntry(cwd, "invariants", "add", "inv1", {
			id: "inv1",
			class: "status-consistency",
			block: "tasks",
			relation_types: ["task_depends_on_task"],
			direction: "as_child",
			require_target_bucket: "complete",
		});
		assert.equal(res.modified, true);
		assert.equal(loadConfig(cwd)!.invariants?.length, 1);
	});

	it("2b: malformed invariant (matches no oneOf branch) rejected, config untouched", (t) => {
		const cwd = makeTmpDir("2b-inv-bad");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		seedConfig(cwd, baseConfig({ invariants: [] }));
		const before = readRaw(cwd);

		// Missing required `direction` + unknown class → satisfies neither oneOf branch.
		assert.throws(
			() => amendConfigEntry(cwd, "invariants", "add", "bad", { id: "bad", class: "not-a-class", block: "tasks" }),
			ValidationError,
		);
		assert.equal(readRaw(cwd), before);
	});
});

// ── 3: map (status_buckets) ───────────────────────────────────────────────────

describe("amendConfigEntry — map (status_buckets)", () => {
	it("3: add / replace / remove + out-of-enum value reject", (t) => {
		const cwd = makeTmpDir("3-map");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		seedConfig(cwd, baseConfig({ status_buckets: {} }));

		amendConfigEntry(cwd, "status_buckets", "add", "wip", "in_progress");
		assert.equal(loadConfig(cwd)!.status_buckets?.wip, "in_progress");

		const rep = amendConfigEntry(cwd, "status_buckets", "replace", "wip", "blocked");
		assert.equal(rep.previousValue, "in_progress");
		assert.equal(loadConfig(cwd)!.status_buckets?.wip, "blocked");

		const rem = amendConfigEntry(cwd, "status_buckets", "remove", "wip");
		assert.equal(rem.previousValue, "blocked");
		assert.equal(Object.hasOwn(loadConfig(cwd)!.status_buckets ?? {}, "wip"), false);

		// Out-of-enum value fails the additionalProperties enum (SHAPE).
		const before = readRaw(cwd);
		assert.throws(() => amendConfigEntry(cwd, "status_buckets", "add", "x", "not_a_bucket"), ValidationError);
		assert.equal(readRaw(cwd), before);
	});
});

// ── 4: map (naming) bare-string values ────────────────────────────────────────

describe("amendConfigEntry — map (naming)", () => {
	it("4: bare-string add / replace / remove", (t) => {
		const cwd = makeTmpDir("4-naming");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		seedConfig(cwd, baseConfig({ naming: {} }));

		amendConfigEntry(cwd, "naming", "add", "decisions-block", "Design Decisions");
		assert.equal(loadConfig(cwd)!.naming?.["decisions-block"], "Design Decisions");

		const rep = amendConfigEntry(cwd, "naming", "replace", "decisions-block", "Decisions");
		assert.equal(rep.previousValue, "Design Decisions");
		assert.equal(loadConfig(cwd)!.naming?.["decisions-block"], "Decisions");

		const rem = amendConfigEntry(cwd, "naming", "remove", "decisions-block");
		assert.equal(rem.previousValue, "Decisions");
		assert.equal(Object.hasOwn(loadConfig(cwd)!.naming ?? {}, "decisions-block"), false);
	});
});

// ── 5: string-array (installed_schemas) ───────────────────────────────────────

describe("amendConfigEntry — string-array (installed_schemas)", () => {
	it("5: add + dup-add collision + remove + replace-rejected", (t) => {
		const cwd = makeTmpDir("5-strarr");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		seedConfig(cwd, baseConfig({ installed_schemas: [] }));

		amendConfigEntry(cwd, "installed_schemas", "add", "decisions");
		assert.deepEqual(loadConfig(cwd)!.installed_schemas, ["decisions"]);

		// dup add → collision (OP-CORRECTNESS), config unchanged
		const before = readRaw(cwd);
		assert.throws(() => amendConfigEntry(cwd, "installed_schemas", "add", "decisions"), /add collision/);
		assert.equal(readRaw(cwd), before);

		// replace is meaningless for string-array → throw, config unchanged
		assert.throws(() => amendConfigEntry(cwd, "installed_schemas", "replace", "decisions", "decisions"), /meaningless/);
		assert.equal(readRaw(cwd), before);

		// remove
		const rem = amendConfigEntry(cwd, "installed_schemas", "remove", "decisions");
		assert.equal(rem.previousValue, "decisions");
		assert.deepEqual(loadConfig(cwd)!.installed_schemas, []);
	});
});

// ── 6: value-array (hierarchy) ────────────────────────────────────────────────

describe("amendConfigEntry — value-array (hierarchy)", () => {
	it("6: add (key=JSON triple) + dup collision + remove-by-deep-equality + replace", (t) => {
		const cwd = makeTmpDir("6-hier");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		seedConfig(cwd, baseConfig({ hierarchy: [] }));

		const triple = { parent_block: "decisions", child_block: "tasks", relation_type: "decision_addresses_gap" };
		const key = JSON.stringify(triple);

		amendConfigEntry(cwd, "hierarchy", "add", key, triple);
		assert.deepEqual(loadConfig(cwd)!.hierarchy, [triple]);

		// dup add → collision
		const before = readRaw(cwd);
		assert.throws(() => amendConfigEntry(cwd, "hierarchy", "add", key, triple), /add collision/);
		assert.equal(readRaw(cwd), before);

		// replace in place (same identity triple, schema permits no extra fields so
		// the replacement equals the original — proves the splice-in-place path)
		const rep = amendConfigEntry(cwd, "hierarchy", "replace", key, triple);
		assert.deepEqual(rep.previousValue, triple);
		assert.deepEqual(loadConfig(cwd)!.hierarchy, [triple]);

		// remove by deep-equality on the identity join
		const rem = amendConfigEntry(cwd, "hierarchy", "remove", key);
		assert.deepEqual(rem.previousValue, triple);
		assert.deepEqual(loadConfig(cwd)!.hierarchy, []);
	});
});

// ── 7: OP-CORRECTNESS errors leave config byte-unchanged ──────────────────────

describe("amendConfigEntry — OP-CORRECTNESS (file byte-unchanged on throw)", () => {
	it("7: add-collision / replace-missing / remove-missing each leave config unchanged", (t) => {
		const cwd = makeTmpDir("7-opcorrect");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		seedConfig(
			cwd,
			baseConfig({
				relation_types: [{ canonical_id: "a", display_name: "A", category: "ordering" }],
			}),
		);
		const before = readRaw(cwd);

		// add collision on existing "a"
		assert.throws(
			() =>
				amendConfigEntry(cwd, "relation_types", "add", "a", {
					canonical_id: "a",
					display_name: "A",
					category: "ordering",
				}),
			/add collision/,
		);
		assert.equal(readRaw(cwd), before);

		// replace missing "z"
		assert.throws(
			() =>
				amendConfigEntry(cwd, "relation_types", "replace", "z", {
					canonical_id: "z",
					display_name: "Z",
					category: "ordering",
				}),
			/replace target missing/,
		);
		assert.equal(readRaw(cwd), before);

		// remove missing "z"
		assert.throws(() => amendConfigEntry(cwd, "relation_types", "remove", "z"), /remove target missing/);
		assert.equal(readRaw(cwd), before);
	});
});

// ── 8: key / entry divergence guard ───────────────────────────────────────────

describe("amendConfigEntry — key/entry divergence", () => {
	it("8: keyed-array entry id != key throws; config unchanged", (t) => {
		const cwd = makeTmpDir("8-divergence");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		seedConfig(cwd, baseConfig({ relation_types: [] }));
		const before = readRaw(cwd);

		assert.throws(
			() =>
				amendConfigEntry(cwd, "relation_types", "add", "x", {
					canonical_id: "y",
					display_name: "Y",
					category: "ordering",
				}),
			/must equal key/,
		);
		assert.equal(readRaw(cwd), before);
	});
});

// ── 9: SHAPE reject (relation_type missing required category) ─────────────────

describe("amendConfigEntry — SHAPE reject", () => {
	it("9: relation_type missing required `category` rejected; config untouched", (t) => {
		const cwd = makeTmpDir("9-shape");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		seedConfig(cwd, baseConfig({ relation_types: [] }));
		const before = readRaw(cwd);

		assert.throws(
			// entry.canonical_id matches key (passes divergence guard) but lacks category (SHAPE)
			() => amendConfigEntry(cwd, "relation_types", "add", "a", { canonical_id: "a", display_name: "A" }),
			ValidationError,
		);
		assert.equal(readRaw(cwd), before);
	});
});

// ── 10: mtime-cache invalidation ──────────────────────────────────────────────

describe("amendConfigEntry — mtime-cache invalidation", () => {
	it("10: loadContext invalidates after an amend; new value reflects the change", async (t) => {
		const cwd = makeTmpDir("10-cache");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		seedConfig(cwd, baseConfig({ naming: {} }));

		const a = loadContext(cwd);
		await new Promise((res) => setTimeout(res, 15));
		amendConfigEntry(cwd, "naming", "add", "decisions-block", "Design Decisions");
		const b = loadContext(cwd);

		assert.notStrictEqual(a, b, "cache invalidates on config.json mtime change after amend");
		assert.equal(b.config?.naming?.["decisions-block"], "Design Decisions");
	});
});

// ── 11: dry-run inertness ─────────────────────────────────────────────────────

describe("amendConfigEntry — dry-run", () => {
	it("11: dryRun returns modified:true but writes nothing (loadConfig + mtime unchanged)", async (t) => {
		const cwd = makeTmpDir("11-dryrun");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		seedConfig(cwd, baseConfig({ naming: {} }));
		const beforeRaw = readRaw(cwd);
		const beforeMtime = fs.statSync(configFile(cwd)).mtimeMs;

		await new Promise((res) => setTimeout(res, 15));
		const res = amendConfigEntry(cwd, "naming", "add", "x", "X", undefined, { dryRun: true });
		assert.equal(res.modified, true);
		assert.equal(readRaw(cwd), beforeRaw, "config bytes unchanged under dryRun");
		assert.equal(fs.statSync(configFile(cwd)).mtimeMs, beforeMtime, "config mtime unchanged under dryRun");
		assert.equal(Object.hasOwn(loadConfig(cwd)!.naming ?? {}, "x"), false);
	});
});

// ── 12: ctx structural-no-op (byte-identical) ─────────────────────────────────

describe("amendConfigEntry — ctx structural no-op", () => {
	it("12: amend with ctx vs without yields byte-identical config.json", (t) => {
		const cwdCtx = makeTmpDir("12-ctx");
		const cwdNo = makeTmpDir("12-noctx");
		t.after(() => fs.rmSync(cwdCtx, { recursive: true, force: true }));
		t.after(() => fs.rmSync(cwdNo, { recursive: true, force: true }));
		seedConfig(cwdCtx, baseConfig({ naming: {} }));
		seedConfig(cwdNo, baseConfig({ naming: {} }));

		amendConfigEntry(cwdCtx, "naming", "add", "k", "V", { writer: { kind: "agent", agent_id: "x" } });
		amendConfigEntry(cwdNo, "naming", "add", "k", "V");

		assert.equal(readRaw(cwdCtx), readRaw(cwdNo));
	});
});

// ── 13: DEFERRED cross-ref proof ──────────────────────────────────────────────

describe("amendConfigEntry — deferred cross-ref integrity", () => {
	it("13: remove a still-referenced relation_type SUCCEEDS; validateContext is the catch", (t) => {
		const cwd = makeTmpDir("13-deferred");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const projectDir = path.join(cwd, ".project");

		seedConfig(
			cwd,
			baseConfig({
				relation_types: [{ canonical_id: "rel", display_name: "rel", category: "data_flow" }],
			}),
		);
		// Endpoint items + an edge that cites "rel".
		fs.writeFileSync(path.join(projectDir, "items.json"), JSON.stringify({ items: [{ id: "p1" }, { id: "c1" }] }));
		fs.writeFileSync(
			path.join(projectDir, "relations.json"),
			JSON.stringify([{ parent: "p1", child: "c1", relation_type: "rel" }]),
		);

		// The write surface does NOT check that "rel" is still referenced.
		const res = amendConfigEntry(cwd, "relation_types", "remove", "rel");
		assert.equal(res.modified, true);
		assert.deepEqual(loadConfig(cwd)!.relation_types, []);

		// validateContext catches the now-unregistered relation_type on the edge.
		// (validateContext's own edge-integrity loop emits this as a message-only issue —
		// the `edge_unknown_relation_type` CODE belongs to validateRelations, which
		// validateContext filters to cycle-detection only; context-sdk.ts:1089-1096.)
		const result = validateContext(cwd);
		assert.equal(result.status, "invalid");
		const issue = result.issues.find((i) => i.message.includes("not registered") && i.message.includes("rel"));
		assert.ok(issue, "validateContext should flag the now-unregistered relation_type 'rel' on the edge");
	});
});

// ── 15: amendConfigEntryForDir (Cycle-10 dir-targeted twin) ───────────────────

describe("amendConfigEntryForDir — dir-targeted", () => {
	it("15a: registers block_kind + relation_type into a NON-active substrate dir; active pointer unmoved", (t) => {
		// cwd's active pointer is `.project`; target a DIFFERENT dir `.work` directly.
		const cwd = makeTmpDir("15a-fordir");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const workDir = path.join(cwd, ".work");
		fs.mkdirSync(workDir, { recursive: true });
		fs.writeFileSync(path.join(workDir, "config.json"), JSON.stringify(baseConfig({ relation_types: [] })));

		// Seed the ACTIVE substrate so we can prove it stays untouched.
		seedConfig(cwd, baseConfig({ block_kinds: [] }));
		const activeBefore = readRaw(cwd);
		const pointerBefore = fs.readFileSync(path.join(cwd, ".pi-context.json"), "utf-8");

		amendConfigEntryForDir(workDir, "block_kinds", "add", "story", {
			canonical_id: "story",
			display_name: "Story",
			prefix: "STORY",
			schema_path: "schemas/story.schema.json",
			array_key: "stories",
			data_path: "story.json",
		});
		amendConfigEntryForDir(workDir, "relation_types", "add", "feature_contains_story", {
			canonical_id: "feature_contains_story",
			display_name: "feature contains story",
			category: "membership",
			source_kinds: ["feature"],
			target_kinds: ["story"],
		});

		const workCfg = loadConfigForDir(workDir)!;
		assert.deepEqual(
			workCfg.block_kinds.map((b) => b.canonical_id),
			["story"],
		);
		assert.deepEqual(
			workCfg.relation_types?.map((r) => r.canonical_id),
			["feature_contains_story"],
		);

		// Active substrate + pointer both unmoved.
		assert.equal(readRaw(cwd), activeBefore, "active substrate config byte-unchanged");
		assert.equal(fs.readFileSync(path.join(cwd, ".pi-context.json"), "utf-8"), pointerBefore, "active pointer unmoved");
	});

	it("15b: AJV SHAPE guard fires (relation_type missing category) — dir config byte-unchanged", (t) => {
		const cwd = makeTmpDir("15b-fordir-shape");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const workDir = path.join(cwd, ".work");
		fs.mkdirSync(workDir, { recursive: true });
		fs.writeFileSync(path.join(workDir, "config.json"), JSON.stringify(baseConfig({ relation_types: [] })));
		const before = fs.readFileSync(path.join(workDir, "config.json"), "utf-8");

		assert.throws(
			() => amendConfigEntryForDir(workDir, "relation_types", "add", "a", { canonical_id: "a", display_name: "A" }),
			ValidationError,
		);
		assert.equal(fs.readFileSync(path.join(workDir, "config.json"), "utf-8"), before);
	});

	it("15c: op-guard (add collision) fires on the dir form — dir config byte-unchanged", (t) => {
		const cwd = makeTmpDir("15c-fordir-op");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const workDir = path.join(cwd, ".work");
		fs.mkdirSync(workDir, { recursive: true });
		fs.writeFileSync(
			path.join(workDir, "config.json"),
			JSON.stringify(baseConfig({ relation_types: [{ canonical_id: "x", display_name: "X", category: "ordering" }] })),
		);
		const before = fs.readFileSync(path.join(workDir, "config.json"), "utf-8");
		assert.throws(
			() =>
				amendConfigEntryForDir(workDir, "relation_types", "add", "x", {
					canonical_id: "x",
					display_name: "X",
					category: "ordering",
				}),
			/add collision/,
		);
		assert.equal(fs.readFileSync(path.join(workDir, "config.json"), "utf-8"), before);
	});

	it("15d: cwd form is byte-identical to ForDir-on-resolved-dir (wrapper parity)", (t) => {
		// cwd form: pointer → `.project`, amend via cwd.
		const cwdA = makeTmpDir("15d-cwd");
		t.after(() => fs.rmSync(cwdA, { recursive: true, force: true }));
		seedConfig(cwdA, baseConfig({ naming: {} }));
		amendConfigEntry(cwdA, "naming", "add", "k", "V");

		// ForDir form: amend the resolved `.project` dir directly.
		const cwdB = makeTmpDir("15d-fordir");
		t.after(() => fs.rmSync(cwdB, { recursive: true, force: true }));
		seedConfig(cwdB, baseConfig({ naming: {} }));
		amendConfigEntryForDir(path.join(cwdB, ".project"), "naming", "add", "k", "V");

		assert.equal(readRaw(cwdA), readRaw(cwdB), "cwd amend == ForDir amend on the resolved dir");
	});
});

// ── 14: empty-after-remove leaves [] ──────────────────────────────────────────

describe("amendConfigEntry — empty-after-remove", () => {
	it("14: removing the last invariant leaves config.invariants === []", (t) => {
		const cwd = makeTmpDir("14-empty");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		seedConfig(
			cwd,
			baseConfig({
				invariants: [
					{
						id: "inv1",
						class: "status-consistency",
						block: "tasks",
						relation_types: ["task_depends_on_task"],
						direction: "as_child",
						require_target_bucket: "complete",
					},
				],
			}),
		);

		amendConfigEntry(cwd, "invariants", "remove", "inv1");
		const cfg = loadConfig(cwd)!;
		assert.deepEqual(cfg.invariants, []);
	});
});
