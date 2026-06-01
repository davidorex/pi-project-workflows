/**
 * Tests for the §H content-addressing migration (Cycle 10 / Phase H1).
 *
 * Scratch-fixture only — never the real repo. A two-substrate project:
 *   - subA (".subA", active source): a `tasks` block with 2 items + a
 *     relations.json carrying a `legacy:REF-1` foreign-string edge, a bare-refname
 *     edge, and a lens-bin edge.
 *   - subB (".subB", foreign target): a `tasks` block holding item id `REF-1`.
 *
 * Each substrate's schema declares the identity fields; config carries
 * block_kinds (data_path / array_key / schema_path). After migrate we assert:
 * substrate_ids minted + registered, the `legacy` alias → subB, every item
 * stamped (oid 32-hex + content_hash 64-hex + an object on disk), endpoint
 * conversions (foreign → structured w/ substrate_id; bare → structured no
 * substrate_id; lens-bin unchanged), validateContext 0 edge_endpoint_unregistered,
 * dryRun writes nothing, idempotency, zero item loss, and an unresolvable
 * `missing:NOPE` edge lands in report.unresolved rather than as a broken edge.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { type EdgeEndpoint, loadRelationsForDir } from "./context.js";
import { writeBootstrapPointer } from "./context-dir.js";
import { loadRegistry, registerSubstrate, resolveAlias, resolveSubstrateDir } from "./context-registry.js";
import { validateContext } from "./context-sdk.js";
import { migrateToContentAddressed } from "./migrate-content-addressed.js";
import { hasObject } from "./object-store.js";

const RELATION_TYPES = [{ canonical_id: "relates_to", display_name: "relates to", category: "membership" }];

function identitySchema(arrayKey: string): Record<string, unknown> {
	return {
		type: "object",
		properties: {
			[arrayKey]: {
				type: "array",
				items: {
					type: "object",
					properties: {
						id: { type: "string" },
						title: { type: "string" },
						oid: { type: "string", pattern: "^[0-9a-f]{32}$" },
						content_hash: { type: "string", pattern: "^[0-9a-f]{64}$" },
						content_parent: { type: "string", pattern: "^[0-9a-f]{64}$" },
					},
					required: ["id"],
				},
			},
		},
	};
}

interface SubstrateSpec {
	dirName: string;
	tasks: Array<Record<string, unknown>>;
	relations?: unknown[];
	lenses?: Array<{ id: string; relation_type: string; bins: string[] }>;
}

function writeSubstrate(cwd: string, spec: SubstrateSpec): void {
	const dir = path.join(cwd, spec.dirName);
	fs.mkdirSync(path.join(dir, "schemas"), { recursive: true });
	const config: Record<string, unknown> = {
		schema_version: "1.0.0",
		root: spec.dirName,
		block_kinds: [
			{
				canonical_id: "tasks",
				display_name: "Tasks",
				prefix: "",
				schema_path: "schemas/tasks.schema.json",
				array_key: "tasks",
				data_path: "tasks.json",
			},
		],
		relation_types: RELATION_TYPES,
		invariants: [],
		...(spec.lenses ? { lenses: spec.lenses } : {}),
	};
	fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(config, null, 2), "utf-8");
	fs.writeFileSync(
		path.join(dir, "schemas", "tasks.schema.json"),
		JSON.stringify(identitySchema("tasks"), null, 2),
		"utf-8",
	);
	fs.writeFileSync(path.join(dir, "tasks.json"), JSON.stringify({ tasks: spec.tasks }, null, 2), "utf-8");
	if (spec.relations !== undefined) {
		fs.writeFileSync(path.join(dir, "relations.json"), JSON.stringify(spec.relations, null, 2), "utf-8");
	}
}

function makeFixture(opts?: { extraRelations?: unknown[] }): string {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "migrate-ca-"));
	writeBootstrapPointer(cwd, ".subA");
	// subA is active; uses a `backlog` lens bin so a bare lens-bin label is a real
	// declared bin (not just an unmatched string).
	writeSubstrate(cwd, {
		dirName: ".subA",
		tasks: [
			{ id: "T1", title: "one" },
			{ id: "T2", title: "two" },
		],
		lenses: [{ id: "board", relation_type: "relates_to", bins: ["backlog"] }],
		relations: [
			{ parent: "T1", child: "legacy:REF-1", relation_type: "relates_to" },
			{ parent: "T1", child: "T2", relation_type: "relates_to" },
			{ parent: "backlog", child: "T2", relation_type: "relates_to" },
			...(opts?.extraRelations ?? []),
		],
	});
	writeSubstrate(cwd, {
		dirName: ".subB",
		tasks: [{ id: "REF-1", title: "target" }],
	});
	return cwd;
}

const ALIASES = { project: ".subA", legacy: ".subB" };

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

describe("migrate-content-addressed: full migration", () => {
	it("mints + registers substrate_ids, the legacy alias, and stamps every item", (t) => {
		const cwd = makeFixture();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const report = migrateToContentAddressed(cwd, { legacyAliases: ALIASES });

		// Both substrates registered with valid ids.
		const reg = loadRegistry(cwd);
		assert.ok(reg);
		const subAId = resolveAlias(cwd, "project");
		const subBId = resolveAlias(cwd, "legacy");
		assert.ok(subAId && /^sub-[0-9a-f]{16}$/.test(subAId), "subA id minted + project alias");
		assert.ok(subBId && /^sub-[0-9a-f]{16}$/.test(subBId), "subB id minted + legacy alias");
		assert.equal(resolveSubstrateDir(cwd, subBId), ".subB");

		// Every item stamped with oid + content_hash + an object on disk.
		for (const dirName of [".subA", ".subB"]) {
			const block = JSON.parse(fs.readFileSync(path.join(cwd, dirName, "tasks.json"), "utf-8")) as {
				tasks: Array<{ oid: string; content_hash: string }>;
			};
			for (const item of block.tasks) {
				assert.match(item.oid, /^[0-9a-f]{32}$/, `${dirName} item oid 32-hex`);
				assert.match(item.content_hash, /^[0-9a-f]{64}$/, `${dirName} item content_hash 64-hex`);
				assert.ok(hasObject(path.join(cwd, dirName), item.content_hash), `${dirName} object on disk`);
			}
		}

		// Report counts.
		assert.equal(report.dry_run, false);
		assert.equal(report.unresolved.length, 0);
		const aRep = report.substrates.find((s) => s.dir === ".subA");
		assert.equal(aRep?.items_oid_minted, 2);
		const bRep = report.substrates.find((s) => s.dir === ".subB");
		assert.equal(bRep?.items_oid_minted, 1);
	});

	it("converts foreign, bare, and lens-bin endpoints correctly", (t) => {
		const cwd = makeFixture();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		migrateToContentAddressed(cwd, { legacyAliases: ALIASES });

		const subBId = resolveAlias(cwd, "legacy");
		const refOid = (
			JSON.parse(fs.readFileSync(path.join(cwd, ".subB", "tasks.json"), "utf-8")) as {
				tasks: Array<{ id: string; oid: string }>;
			}
		).tasks.find((it) => it.id === "REF-1")?.oid;

		const edges = loadRelationsForDir(path.join(cwd, ".subA"));

		// legacy:REF-1 → structured foreign with substrate_id + the backfilled oid.
		const foreign = edges.find(
			(e) => typeof e.child === "object" && (e.child as EdgeEndpoint).kind === "item" && "substrate_id" in e.child,
		)?.child as EdgeEndpoint;
		assert.ok(foreign && foreign.kind === "item");
		assert.equal(foreign.substrate_id, subBId);
		assert.equal(foreign.refname, "REF-1");
		assert.equal(foreign.oid, refOid);

		// bare T1→T2 edge: both endpoints structured items with NO substrate_id.
		const bare = edges.find(
			(e) =>
				typeof e.parent === "object" &&
				(e.parent as EdgeEndpoint).kind === "item" &&
				typeof e.child === "object" &&
				(e.child as EdgeEndpoint).kind === "item" &&
				!("substrate_id" in (e.child as object)) &&
				(e.child as EdgeEndpoint).kind === "item" &&
				(e.child as { refname?: string }).refname === "T2",
		);
		assert.ok(bare, "bare T1->T2 edge present");
		const bp = bare.parent as EdgeEndpoint;
		const bc = bare.child as EdgeEndpoint;
		assert.ok(bp.kind === "item" && bp.substrate_id === undefined && bp.refname === "T1");
		assert.ok(bc.kind === "item" && bc.substrate_id === undefined && bc.refname === "T2");

		// lens-bin edge: parent unchanged as lens_bin.
		const binEdge = edges.find((e) => typeof e.parent === "object" && (e.parent as EdgeEndpoint).kind === "lens_bin");
		assert.ok(binEdge, "lens_bin edge present");
		assert.equal((binEdge.parent as { bin: string }).bin, "backlog");
	});

	it("validateContext (active=subA) reports 0 edge_endpoint_unregistered after migrate", (t) => {
		const cwd = makeFixture();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		migrateToContentAddressed(cwd, { legacyAliases: ALIASES });
		const v = validateContext(cwd);
		const unreg = v.issues.filter((i) => i.code === "edge_endpoint_unregistered");
		assert.equal(unreg.length, 0, `expected 0 edge_endpoint_unregistered, got ${JSON.stringify(unreg)}`);
	});

	it("dryRun writes NOTHING (tree byte-identical before/after)", (t) => {
		const cwd = makeFixture();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const before = snapshotTree(cwd);
		const report = migrateToContentAddressed(cwd, { dryRun: true, legacyAliases: ALIASES });
		const after = snapshotTree(cwd);
		assert.equal(report.dry_run, true);
		assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort(), "no new files");
		for (const [k, v] of before) assert.equal(after.get(k), v, `file ${k} unchanged`);
		// Counts still computed accurately under dryRun.
		assert.equal(report.substrates.find((s) => s.dir === ".subA")?.items_oid_minted, 2);
		assert.equal(report.cross_substrate_edges, 1);
		assert.equal(report.lens_bin_edges_preserved, 1);
		assert.equal(report.unresolved.length, 0);
	});

	it("is idempotent: a second run mints 0 oids + stores 0 objects + rewrites 0 edges", (t) => {
		const cwd = makeFixture();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		migrateToContentAddressed(cwd, { legacyAliases: ALIASES });
		const second = migrateToContentAddressed(cwd, { legacyAliases: ALIASES });
		for (const s of second.substrates) {
			assert.equal(s.items_oid_minted, 0, `${s.dir} mints 0 on re-run`);
			assert.equal(s.objects_stored, 0, `${s.dir} stores 0 on re-run`);
		}
		assert.equal(second.edges_rewritten, 0, "no edges rewritten on re-run (already structured)");
	});

	it("preserves item counts (zero loss) across migration", (t) => {
		const cwd = makeFixture();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const countBefore = (dirName: string) =>
			(JSON.parse(fs.readFileSync(path.join(cwd, dirName, "tasks.json"), "utf-8")) as { tasks: unknown[] }).tasks
				.length;
		const aBefore = countBefore(".subA");
		const bBefore = countBefore(".subB");
		migrateToContentAddressed(cwd, { legacyAliases: ALIASES });
		assert.equal(countBefore(".subA"), aBefore);
		assert.equal(countBefore(".subB"), bBefore);
	});

	it("an unresolvable foreign edge lands in report.unresolved and is NOT written as a broken edge", (t) => {
		const cwd = makeFixture({
			extraRelations: [{ parent: "T1", child: "missing:NOPE", relation_type: "relates_to" }],
		});
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const report = migrateToContentAddressed(cwd, { legacyAliases: ALIASES });
		assert.equal(report.unresolved.length, 1);
		assert.deepEqual(report.unresolved[0], { substrate: ".subA", ref: "missing:NOPE" });
		// The broken edge is dropped — no relation child names "NOPE".
		const edges = loadRelationsForDir(path.join(cwd, ".subA"));
		const hasNope = edges.some(
			(e) =>
				(typeof e.child === "object" && (e.child as { refname?: string }).refname === "NOPE") ||
				e.child === "missing:NOPE",
		);
		assert.ok(!hasNope, "broken edge to NOPE must not be written");
	});

	it("fail-fast: a schema lacking identity fields throws before any write", (t) => {
		const cwd = makeFixture();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		// Overwrite subB's schema with one lacking the identity fields.
		fs.writeFileSync(
			path.join(cwd, ".subB", "schemas", "tasks.schema.json"),
			JSON.stringify(
				{
					type: "object",
					properties: { tasks: { type: "array", items: { type: "object", properties: { id: { type: "string" } } } } },
				},
				null,
				2,
			),
			"utf-8",
		);
		const before = snapshotTree(cwd);
		assert.throws(
			() => migrateToContentAddressed(cwd, { legacyAliases: ALIASES }),
			/does not declare the identity fields/,
		);
		const after = snapshotTree(cwd);
		for (const [k, v] of before) assert.equal(after.get(k), v, `fail-fast left ${k} untouched`);
	});
});

describe("migrate-content-addressed: onlySubstrates scoping + registry-fallback foreign resolution", () => {
	it("onlySubstrates processes ONLY the named substrate (an identity-less sibling is never discovered → no step-0 throw)", (t) => {
		const cwd = makeFixture();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		// Make the sibling (.subB) schema-illegal: strip its identity fields. If it
		// were discovered, the step-0 fail-fast gate would throw. Scoping to .subA
		// must exclude it from discovery so no throw occurs.
		fs.writeFileSync(
			path.join(cwd, ".subB", "schemas", "tasks.schema.json"),
			JSON.stringify(
				{
					type: "object",
					properties: { tasks: { type: "array", items: { type: "object", properties: { id: { type: "string" } } } } },
				},
				null,
				2,
			),
			"utf-8",
		);
		let report!: ReturnType<typeof migrateToContentAddressed>;
		assert.doesNotThrow(() => {
			report = migrateToContentAddressed(cwd, { onlySubstrates: [".subA"] });
		}, "identity-less sibling was scoped out → no step-0 throw");
		// Only the named substrate appears in the report.
		assert.deepEqual(
			report.substrates.map((s) => s.dir),
			[".subA"],
			"report.substrates holds only the scoped substrate",
		);
	});

	it("registry-fallback resolves a project:<refname> edge into a NON-discovered registered substrate, read-only", (t) => {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "migrate-ca-fallback-"));
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		writeBootstrapPointer(cwd, ".active");
		// Active substrate carries a STRING `project:REF-9` edge (no discovered
		// target — the foreign substrate is scoped out below).
		writeSubstrate(cwd, {
			dirName: ".active",
			tasks: [{ id: "A1", title: "one" }],
			relations: [{ parent: "A1", child: "project:REF-9", relation_type: "relates_to" }],
		});
		// Foreign target substrate: already content-addressed (its item carries an
		// oid). It is REGISTERED under alias `project` but is NOT in onlySubstrates,
		// so the migration never discovers it.
		const targetOid = "abcdef0123456789abcdef0123456789";
		writeSubstrate(cwd, {
			dirName: ".target",
			tasks: [{ id: "REF-9", title: "target", oid: targetOid }],
		});
		const targetSid = "sub-00112233aabbccdd";
		registerSubstrate(cwd, targetSid, ".target", ["project"]);

		// Snapshot the target dir to prove read-only.
		const targetBefore = snapshotTree(path.join(cwd, ".target"));

		const report = migrateToContentAddressed(cwd, { onlySubstrates: [".active"] });

		// The string edge converted to a structured foreign endpoint.
		const edges = loadRelationsForDir(path.join(cwd, ".active"));
		const foreign = edges.find((e) => typeof e.child === "object" && (e.child as EdgeEndpoint).kind === "item")
			?.child as EdgeEndpoint;
		assert.ok(foreign && foreign.kind === "item", "child converted to structured item");
		assert.equal(foreign.substrate_id, targetSid);
		assert.equal(foreign.oid, targetOid);
		assert.equal(foreign.refname, "REF-9");

		// Report counts: one cross-substrate edge, nothing unresolved.
		assert.equal(report.cross_substrate_edges, 1);
		assert.equal(report.unresolved.length, 0);

		// The foreign target was read-only: byte-identical tree before/after.
		const targetAfter = snapshotTree(path.join(cwd, ".target"));
		assert.deepEqual([...targetAfter.keys()].sort(), [...targetBefore.keys()].sort(), "no new files in target");
		for (const [k, v] of targetBefore) assert.equal(targetAfter.get(k), v, `target file ${k} unchanged`);
	});

	it("register:false mints config.substrate_id but writes NO registry entry; default run DOES register", (t) => {
		const cwd = makeFixture();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const registryPath = path.join(cwd, ".pi-context-registry.json");

		// register:false — mint must land on the target config, registry must not.
		const report = migrateToContentAddressed(cwd, { onlySubstrates: [".subA"], register: false });
		assert.deepEqual(
			report.substrates.map((s) => s.dir),
			[".subA"],
			"only the scoped substrate processed",
		);
		const config = JSON.parse(fs.readFileSync(path.join(cwd, ".subA", "config.json"), "utf-8")) as {
			substrate_id?: string;
		};
		assert.ok(typeof config.substrate_id === "string", "substrate_id minted onto config");
		assert.match(config.substrate_id, /^sub-[0-9a-f]{16}$/, "minted id matches substrate-id pattern");
		const mintedId = config.substrate_id;
		// No registry entry for the minted id — the project-root registry file is
		// absent, or present without an entry keyed by the minted id.
		if (fs.existsSync(registryPath)) {
			const reg = loadRegistry(cwd);
			assert.ok(!reg?.substrates?.[mintedId], `register:false must not write a registry entry for ${mintedId}`);
		}

		// Control: a default-register run over the SAME (now-minted) substrate DOES
		// register it under the id already on its config (mint is idempotent).
		migrateToContentAddressed(cwd, { onlySubstrates: [".subA"] });
		const reg2 = loadRegistry(cwd);
		assert.ok(reg2?.substrates?.[mintedId], "default run registers the substrate under its minted id");
		assert.equal(resolveSubstrateDir(cwd, mintedId), ".subA", "registry entry resolves to the substrate dir");
	});

	it("scoped dryRun writes nothing to the named substrate (no oid + no objects/ entries)", (t) => {
		const cwd = makeFixture();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const before = snapshotTree(path.join(cwd, ".subA"));
		const report = migrateToContentAddressed(cwd, { onlySubstrates: [".subA"], dryRun: true });
		assert.equal(report.dry_run, true);
		// The named substrate's block file is byte-unchanged: no oid/content_hash stamped.
		const after = snapshotTree(path.join(cwd, ".subA"));
		assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort(), "no new files under .subA");
		for (const [k, v] of before) assert.equal(after.get(k), v, `.subA file ${k} unchanged under scoped dryRun`);
		// No objects/ directory entries were added.
		assert.ok(!fs.existsSync(path.join(cwd, ".subA", "objects")), "no objects/ dir created under scoped dryRun");
	});
});
