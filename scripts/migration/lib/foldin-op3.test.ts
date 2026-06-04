/**
 * Tests for foldin-context OP3 (`promoteCrossSubstrateRefs`) — the fold-in edge
 * rewrite that promotes a bare cross-substrate refname to a STRUCTURED foreign
 * `EdgeEndpoint` (TASK-007 β / Finding A).
 *
 * Scratch-fixture only — never the real repo. A two-substrate project:
 *   - `.work` (active, the fold-in dupe stand-in): a `tasks` block with one local
 *     item `T1` + a relations.json carrying a local edge (T1→T1) and a
 *     cross-substrate edge whose child is the bare refname `EXT-1` (NOT a local id).
 *   - `.foreign` (registered, aliased `project`): a `tasks` block holding `EXT-1`.
 *
 * OP3 resolves the bare cross-ref as `project:EXT-1` against the project-root
 * registry (`cwd`), exactly as OP4's `migrateToContentAddressed` would. We assert
 * the promoted endpoint is a STRUCTURED object (kind:"item", carrying the foreign
 * substrate_id) — NOT a `project:…` string — that relations.json then has zero
 * string-form endpoints, and that OP4 is a no-op / idempotent on the structured
 * result (its `convert` returns already-structured endpoints unchanged).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { type Edge, type EdgeEndpoint, loadRelationsForDir } from "@davidorex/pi-context/context";
import { writeBootstrapPointer } from "@davidorex/pi-context/context-dir";
import { registerSubstrate } from "@davidorex/pi-context/context-registry";
import { localRefnames, promoteCrossSubstrateRefs } from "../foldin-context.js";
import { migrateToContentAddressed } from "./migrate-content-addressed.js";

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

function writeSubstrate(
	cwd: string,
	dirName: string,
	tasks: Array<Record<string, unknown>>,
	relations?: unknown[],
): void {
	const dir = path.join(cwd, dirName);
	fs.mkdirSync(path.join(dir, "schemas"), { recursive: true });
	const config = {
		schema_version: "1.0.0",
		root: dirName,
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
	};
	fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(config, null, 2), "utf-8");
	fs.writeFileSync(
		path.join(dir, "schemas", "tasks.schema.json"),
		JSON.stringify(identitySchema("tasks"), null, 2),
		"utf-8",
	);
	fs.writeFileSync(path.join(dir, "tasks.json"), JSON.stringify({ tasks }, null, 2), "utf-8");
	if (relations !== undefined) {
		fs.writeFileSync(path.join(dir, "relations.json"), JSON.stringify(relations, null, 2), "utf-8");
	}
}

/** A project root: active `.work` (the fold-in dupe stand-in) + a registered
 * `.foreign` substrate aliased `project` holding the cross-substrate item EXT-1. */
function makeFixture(): { cwd: string; workDir: string; foreignId: string } {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "foldin-op3-"));
	writeBootstrapPointer(cwd, ".work");
	writeSubstrate(
		cwd,
		".work",
		[{ id: "T1", title: "local" }],
		[
			// local self-edge (bare local refname → left unchanged by OP3)
			{ parent: "T1", child: "T1", relation_type: "relates_to" },
			// cross-substrate bare ref (NOT a local id → promoted by OP3)
			{ parent: "T1", child: "EXT-1", relation_type: "relates_to" },
		],
	);
	writeSubstrate(cwd, ".foreign", [{ id: "EXT-1", title: "foreign target" }]);
	// Register the foreign substrate under the `project` alias in the project-root
	// registry — the same surface OP3 + OP4 resolve `project:` against.
	const foreignId = "sub-aaaaaaaaaaaaaaaa";
	registerSubstrate(cwd, foreignId, ".foreign", ["project"]);
	return { cwd, workDir: path.join(cwd, ".work"), foreignId };
}

describe("foldin-context OP3: promoteCrossSubstrateRefs", () => {
	it("promotes a bare cross-substrate ref to a STRUCTURED foreign endpoint (object with kind, not a project: string)", (t) => {
		const { cwd, workDir, foreignId } = makeFixture();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		promoteCrossSubstrateRefs(cwd, workDir, localRefnames(workDir));

		const edges = loadRelationsForDir(workDir);
		const crossEdge = edges.find(
			(e) => e.parent === "T1" && e.relation_type === "relates_to" && typeof e.child === "object",
		);
		assert.ok(crossEdge, "the cross-substrate edge survives the rewrite");
		const child = crossEdge.child as EdgeEndpoint;
		// STRUCTURED, not a "project:EXT-1" string.
		assert.notEqual(typeof child, "string", "the promoted endpoint is not a string");
		assert.equal(child.kind, "item", "the promoted endpoint is a structured item endpoint");
		assert.equal((child as { refname?: string }).refname, "EXT-1");
		assert.equal((child as { substrate_id?: string }).substrate_id, foreignId, "carries the foreign substrate_id");

		// The local self-edge bare refname is left unchanged (still a string).
		const localEdge = edges.find((e) => e.child === "T1");
		assert.ok(localEdge, "the local self-edge is preserved");
		assert.equal(typeof localEdge.parent, "string", "local bare refnames are not promoted");
	});

	it("leaves relations.json with zero string-form cross-substrate endpoints (all promoted to structured)", (t) => {
		const { cwd, workDir } = makeFixture();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		promoteCrossSubstrateRefs(cwd, workDir, localRefnames(workDir));

		const edges = loadRelationsForDir(workDir);
		const stringEndpoints = edges.flatMap((e) => [e.parent, e.child]).filter((ep) => typeof ep === "string");
		// No endpoint is a `project:`-prefixed string — the string-endpoint form is
		// eliminated at the source. (Local bare refnames remain plain strings, which
		// OP4 converts to same-substrate structured items; none carry a colon.)
		assert.equal(
			stringEndpoints.some((ep) => (ep as string).includes(":")),
			false,
			"no string endpoint carries an alias colon (no project: string written)",
		);
	});

	it("OP4 (migrateToContentAddressed convert) is a no-op / idempotent on the structured endpoint", (t) => {
		const { cwd, workDir, foreignId } = makeFixture();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		promoteCrossSubstrateRefs(cwd, workDir, localRefnames(workDir));
		const beforeChild = loadRelationsForDir(workDir).find((e) => typeof e.child === "object")?.child as EdgeEndpoint;
		assert.ok(beforeChild && beforeChild.kind === "item");

		// OP4 over only the work substrate (matches foldin's onlySubstrates / register:false).
		const report = migrateToContentAddressed(cwd, { onlySubstrates: [".work"], register: false });

		const afterEdges = loadRelationsForDir(workDir);
		const afterChild = afterEdges.find(
			(e) =>
				typeof e.child === "object" &&
				(e.child as EdgeEndpoint).kind === "item" &&
				"substrate_id" in (e.child as object),
		)?.child as EdgeEndpoint;
		assert.ok(afterChild && afterChild.kind === "item", "the foreign structured endpoint survives OP4");
		// The already-structured foreign endpoint is returned unchanged by convert.
		assert.equal(afterChild.substrate_id, foreignId, "substrate_id unchanged by OP4");
		assert.equal((afterChild as { refname?: string }).refname, "EXT-1", "refname unchanged by OP4");
		assert.deepEqual(afterChild, beforeChild, "OP4 leaves the structured foreign endpoint byte-identical");
		// No edge was dropped as unresolved (the string-form path that OP4 could drop
		// is gone — the endpoint is already structured).
		assert.equal(report.unresolved.length, 0, "no unresolved edges (structured endpoint is not re-resolved)");

		// Second OP3 + OP4 pass changes nothing further — full idempotency.
		promoteCrossSubstrateRefs(cwd, workDir, localRefnames(workDir));
		const idempotent: Edge[] = loadRelationsForDir(workDir);
		const idempotentChild = idempotent.find(
			(e) =>
				typeof e.child === "object" &&
				(e.child as EdgeEndpoint).kind === "item" &&
				"substrate_id" in (e.child as object),
		)?.child as EdgeEndpoint;
		assert.deepEqual(idempotentChild, afterChild, "a second OP3 pass over structured endpoints is a no-op");
	});
});

/**
 * A project root whose `.work` carries a cross-substrate bare ref to a refname
 * that does NOT exist in the registered foreign substrate (`MISSING-1` while
 * `.foreign` holds only `EXT-1`). OP3 resolves `project:MISSING-1` against the
 * registry: the `project` alias resolves, but the foreign substrate has no such
 * item, so resolveRelationSelector falls its oid back to the bare refname,
 * producing the unresolved-foreign sentinel `{ kind:"item", substrate_id,
 * oid:"MISSING-1", refname:"MISSING-1" }`. This is the Finding-A-regression
 * fixture: before the structured-source rewrite, OP3 wrote `project:MISSING-1`
 * (a STRING) and OP4 surfaced it in report.unresolved + dropped the edge; the
 * fix must keep emitting the structured form AND keep that report+drop.
 */
function makeUnresolvableFixture(): { cwd: string; workDir: string; foreignId: string } {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "foldin-op3-unres-"));
	writeBootstrapPointer(cwd, ".work");
	writeSubstrate(
		cwd,
		".work",
		[{ id: "T1", title: "local" }],
		[
			// local self-edge (left unchanged by OP3)
			{ parent: "T1", child: "T1", relation_type: "relates_to" },
			// cross-substrate bare ref to a refname ABSENT from the foreign substrate
			{ parent: "T1", child: "MISSING-1", relation_type: "relates_to" },
		],
	);
	writeSubstrate(cwd, ".foreign", [{ id: "EXT-1", title: "foreign target" }]);
	const foreignId = "sub-bbbbbbbbbbbbbbbb";
	registerSubstrate(cwd, foreignId, ".foreign", ["project"]);
	return { cwd, workDir: path.join(cwd, ".work"), foreignId };
}

describe("foldin-context OP3→OP4: unresolvable cross-substrate ref (Finding A regression)", () => {
	it("OP3 still emits a STRUCTURED endpoint for an unresolvable foreign ref (no project: string)", (t) => {
		const { cwd, workDir, foreignId } = makeUnresolvableFixture();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		promoteCrossSubstrateRefs(cwd, workDir, localRefnames(workDir));

		const edges = loadRelationsForDir(workDir);
		const crossChild = edges.find((e) => typeof e.child === "object" && (e.child as EdgeEndpoint).kind === "item")
			?.child as EdgeEndpoint;
		assert.ok(crossChild, "the unresolvable cross-ref is promoted to a structured endpoint");
		// STRUCTURED sentinel: substrate_id set, oid fell back to the bare refname.
		assert.equal((crossChild as { substrate_id?: string }).substrate_id, foreignId);
		assert.equal((crossChild as { refname?: string }).refname, "MISSING-1");
		assert.equal(crossChild.oid, "MISSING-1", "oid fell back to the refname — the unresolved sentinel");
		// No string endpoint carries an alias colon — the project: string form is gone.
		const stringEndpoints = edges.flatMap((e) => [e.parent, e.child]).filter((ep) => typeof ep === "string");
		assert.equal(
			stringEndpoints.some((ep) => (ep as string).includes(":")),
			false,
			"no project: string written for the unresolvable ref",
		);
	});

	it("OP4 reports the unresolved-foreign sentinel in report.unresolved and drops the edge", (t) => {
		const { cwd, workDir } = makeUnresolvableFixture();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		promoteCrossSubstrateRefs(cwd, workDir, localRefnames(workDir));
		const report = migrateToContentAddressed(cwd, { onlySubstrates: [".work"], register: false });

		// The unresolvable cross-ref surfaces in report.unresolved — exactly as the
		// pre-fix `project:MISSING-1` STRING path did.
		assert.equal(report.unresolved.length, 1, "the unresolvable foreign ref is reported");
		assert.equal(report.unresolved[0].substrate, ".work");
		assert.equal(report.unresolved[0].ref, "project:MISSING-1");

		// The edge with the unresolvable endpoint is dropped (a broken edge is never
		// written); only the local self-edge survives, converted to same-substrate
		// structured form.
		const afterEdges = loadRelationsForDir(workDir);
		const survivingForeign = afterEdges.find(
			(e) => typeof e.child === "object" && "substrate_id" in (e.child as object),
		);
		assert.equal(survivingForeign, undefined, "the unresolvable cross-substrate edge was dropped");
		assert.ok(
			afterEdges.every((e) => {
				const child = e.child as EdgeEndpoint;
				return typeof child !== "object" || !("substrate_id" in child);
			}),
			"no foreign endpoint remains on disk",
		);
	});

	it("the RESOLVABLE foreign endpoint is NOT reported and stays byte-exact (no false-positive sentinel match)", (t) => {
		// Sanity contrast: a genuinely-resolvable ref (EXT-1, present in .foreign,
		// carrying a real backfilled oid) must NOT match the oid===refname sentinel
		// and must survive OP4 unreported. Uses the resolvable fixture above.
		const { cwd, workDir, foreignId } = makeFixture();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		// Backfill the foreign substrate so EXT-1 carries a real (non-refname) oid —
		// then OP3 resolves project:EXT-1 to that oid, not the refname fallback.
		migrateToContentAddressed(cwd, { onlySubstrates: [".foreign"], register: false });

		promoteCrossSubstrateRefs(cwd, workDir, localRefnames(workDir));
		// Select the FOREIGN edge specifically (carries substrate_id). After OP4 the
		// local self-edge T1→T1 is also promoted to a structured item endpoint, so a
		// bare `typeof child === "object"` find would non-deterministically match it
		// (it sorts first in relations.json) — match on substrate_id to isolate EXT-1.
		const foreignChild = (edges: Edge[]): EdgeEndpoint =>
			edges.find((e) => typeof e.child === "object" && "substrate_id" in (e.child as object))?.child as EdgeEndpoint;
		const beforeChild = foreignChild(loadRelationsForDir(workDir));
		assert.ok(beforeChild && beforeChild.kind === "item");
		assert.notEqual(beforeChild.oid, beforeChild.refname, "resolvable endpoint carries a real oid, not the refname");

		const report = migrateToContentAddressed(cwd, { onlySubstrates: [".work"], register: false });
		assert.equal(report.unresolved.length, 0, "the resolvable foreign endpoint is not reported");

		const afterChild = foreignChild(loadRelationsForDir(workDir));
		assert.deepEqual(afterChild, beforeChild, "the resolvable structured endpoint is byte-exact through OP4");
		assert.equal(afterChild.substrate_id, foreignId);
	});
});
