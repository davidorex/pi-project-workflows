/**
 * Op-level tests for the five write ops added in TASK-007 (cli-arc β):
 * remove-relation, replace-relation, append-relations, upsert-block-item — driven
 * through the exported `ops` registry entries (the SAME OpDefinition.run the
 * in-pi tool surface and the CLI reflect), plus the FGAP-009 non-exposure
 * allowlist assertions.
 *
 * Each op's `run(cwd, params, ctx)` is exercised against a real on-disk
 * substrate. ctx forwarding is proven where it is observable: for relation ops
 * the relations schema declares no author fields (structural no-op — proven by
 * byte-neutrality in edge-remove.test.ts); for upsert-block-item the block schema
 * declares `created_by`, so a provided ctx stamps it.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { readBlock } from "./block-api.js";
import { endpointKey, loadRelations } from "./context.js";
import { writeBootstrapPointer } from "./context-dir.js";
import { appendRelationByRef, appendRelationsByRef, removeRelationByRef, replaceRelationByRef } from "./context-sdk.js";
import type { DispatchContext } from "./dispatch-context.js";
import { INTENTIONALLY_UNEXPOSED_WRITERS, type OpDefinition, ops, renderOpResultText } from "./ops-registry.js";
import { renderReadText } from "./read-element.js";

function op(name: string): OpDefinition {
	const found = ops.find((o) => o.name === name);
	assert.ok(found, `op '${name}' is registered`);
	return found!;
}

/** Substrate with a `.project` pointer; relations-only (no schemas needed). */
function makeRelDir(prefix: string): string {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `op-edge-${prefix}-`));
	writeBootstrapPointer(cwd, ".project");
	fs.mkdirSync(path.join(cwd, ".project"), { recursive: true });
	return cwd;
}

/** Substrate carrying a `tasks` block schema that declares `created_by`. */
function makeBlockDir(prefix: string): string {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `op-blk-${prefix}-`));
	writeBootstrapPointer(cwd, ".project");
	const sub = path.join(cwd, ".project");
	fs.mkdirSync(path.join(sub, "schemas"), { recursive: true });
	fs.writeFileSync(
		path.join(sub, "config.json"),
		JSON.stringify({ schema_version: "1.7.0", root: ".project", block_kinds: [] }),
	);
	const schema = {
		type: "object",
		properties: {
			tasks: {
				type: "array",
				items: {
					type: "object",
					required: ["id"],
					properties: {
						id: { type: "string" },
						title: { type: "string" },
						created_by: { type: "string" },
					},
				},
			},
		},
	};
	fs.writeFileSync(path.join(sub, "schemas", "tasks.schema.json"), JSON.stringify(schema, null, 2));
	// Seed an empty block file — upsertItemInBlock reads the existing typed file
	// (it does not create it the way appendToBlock does), so the file must exist.
	fs.writeFileSync(path.join(sub, "tasks.json"), JSON.stringify({ tasks: [] }));
	return cwd;
}

describe("op: remove-relation", () => {
	it("removes a matching edge and reports it; absent edge is a no-op message", (t) => {
		const cwd = makeRelDir("remove");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		// Seed via the by-ref porcelain so the stored endpoints are STRUCTURED —
		// exactly how every production write path (ops, orchestrator scripts,
		// promote-item) persists edges. Seeding via the string-endpoint library
		// shortcut would store a different dedup identity than the by-ref remove
		// resolves, which never occurs on a real substrate.
		appendRelationByRef(cwd, { parent: "p1", child: "c1", relation_type: "rel" });
		const msg = op("remove-relation").run(cwd, { parent: "p1", child: "c1", relation_type: "rel" }) as string;
		assert.match(msg, /Removed relation p1 -\[rel\]-> c1/);
		assert.equal(loadRelations(cwd).length, 0);

		const noop = op("remove-relation").run(cwd, { parent: "p1", child: "c1", relation_type: "rel" }) as string;
		assert.match(noop, /no matching relation — no-op/);
	});

	it("is surface:'use' and not authGated (parity with append-relation)", () => {
		const o = op("remove-relation");
		assert.equal(o.surface, "use");
		assert.notEqual(o.authGated, true);
	});
});

describe("op: replace-relation", () => {
	it("atomically swaps old for new; unrelated siblings untouched", (t) => {
		const cwd = makeRelDir("replace");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		appendRelationByRef(cwd, { parent: "p1", child: "c1", relation_type: "rel" });
		appendRelationByRef(cwd, { parent: "p9", child: "c9", relation_type: "rel" });

		const msg = op("replace-relation").run(cwd, {
			old_parent: "p1",
			old_child: "c1",
			old_relation_type: "rel",
			parent: "p2",
			child: "c2",
			relation_type: "rel",
			ordinal: 4,
		}) as string;
		assert.match(msg, /Replaced relation/);

		// Stored endpoints are STRUCTURED objects — compare via endpointKey (the
		// resolved bare selector survives as the endpoint refname).
		const stored = loadRelations(cwd);
		assert.equal(stored.length, 2);
		assert.ok(!stored.some((e) => endpointKey(e.parent) === "p1"));
		const added = stored.find((e) => endpointKey(e.parent) === "p2")!;
		assert.equal(added.ordinal, 4);
		assert.ok(stored.some((e) => endpointKey(e.parent) === "p9"));
	});

	it("is surface:'use' and not authGated", () => {
		const o = op("replace-relation");
		assert.equal(o.surface, "use");
		assert.notEqual(o.authGated, true);
	});
});

describe("op: append-relations (bulk)", () => {
	it("appends new edges, skips duplicates; reports counts; parses a JSON-string edges param", (t) => {
		const cwd = makeRelDir("bulk");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		appendRelationByRef(cwd, { parent: "p1", child: "c1", relation_type: "rel" }); // pre-existing dup (structured, as the bulk op stores)

		const edges = [
			{ parent: "p1", child: "c1", relation_type: "rel" }, // dup → skipped
			{ parent: "p2", child: "c2", relation_type: "rel" }, // new → appended
			{ parent: "p2", child: "c2", relation_type: "rel" }, // intra-batch dup → skipped
		];
		// JSON-string form (mirrors how Type.Unknown params can arrive).
		const msg = op("append-relations").run(cwd, { edges: JSON.stringify(edges) }) as string;
		assert.match(msg, /appended 1, skipped 2 \(duplicates\)/);
		assert.equal(loadRelations(cwd).length, 2);
	});

	it("is surface:'use' and not authGated", () => {
		const o = op("append-relations");
		assert.equal(o.surface, "use");
		assert.notEqual(o.authGated, true);
	});
});

describe("op: upsert-block-item", () => {
	it("appends then replaces by id; reports the mode", (t) => {
		const cwd = makeBlockDir("upsert");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		const m1 = op("upsert-block-item").run(cwd, {
			block: "tasks",
			arrayKey: "tasks",
			item: { id: "T1", title: "first" },
		}) as string;
		assert.match(m1, /Upserted item 'T1' \(appended\) to tasks\.tasks/);

		const m2 = op("upsert-block-item").run(cwd, {
			block: "tasks",
			arrayKey: "tasks",
			item: { id: "T1", title: "second" },
		}) as string;
		assert.match(m2, /Upserted item 'T1' \(updated\) to tasks\.tasks/);

		const block = readBlock(cwd, "tasks") as { tasks: { id: string; title: string }[] };
		assert.equal(block.tasks.length, 1);
		assert.equal(block.tasks[0].title, "second");
	});

	it("forwards ctx — the schema-declared created_by author field is stamped", (t) => {
		const cwd = makeBlockDir("upsert-ctx");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		const ctx: DispatchContext = { writer: { kind: "agent", agent_id: "op-test-agent" } };
		op("upsert-block-item").run(cwd, { block: "tasks", arrayKey: "tasks", item: { id: "T1", title: "x" } }, ctx);

		const block = readBlock(cwd, "tasks") as { tasks: { id: string; created_by?: string }[] };
		assert.ok(block.tasks[0].created_by, "created_by stamped from ctx");
		assert.match(block.tasks[0].created_by!, /op-test-agent/);
	});

	it("parses a JSON-string item param", (t) => {
		const cwd = makeBlockDir("upsert-jsonstr");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		const msg = op("upsert-block-item").run(cwd, {
			block: "tasks",
			arrayKey: "tasks",
			item: JSON.stringify({ id: "T9", title: "z" }),
		}) as string;
		assert.match(msg, /Upserted item 'T9' \(appended\)/);
	});

	it("is surface:'use' and not authGated", () => {
		const o = op("upsert-block-item");
		assert.equal(o.surface, "use");
		assert.notEqual(o.authGated, true);
	});
});

describe("TASK-012 / FGAP-013 structured OpResult", () => {
	it("a data (JSON.stringify) op returns { json } and renderOpResultText reproduces the old text", (t) => {
		const cwd = makeBlockDir("opresult-json");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		// context-validate is a `return { json: validateContext(cwd) }` data op.
		// (resolve-item-by-id / promote-item moved to { read } under TASK-013/FGAP-015,
		// so context-validate is now the representative still-{json} op here.)
		const r = op("context-validate").run(cwd, {});
		assert.ok(typeof r === "object" && r !== null && "json" in r, "data op returns { json }");
		// THE point: the structured value is the un-stringified object (single value),
		// not a JSON string — so the CLI --json envelope does not double-encode.
		const json = (r as { json: unknown }).json as { status?: string };
		assert.ok(typeof json === "object" && json !== null, "json is a real object, not a string");
		// Text surface is byte-identical to the prior JSON.stringify(result, null, 2).
		assert.equal(renderOpResultText(r), JSON.stringify(json, null, 2));
	});

	it("a read op returns { read } whose renderReadText equals renderOpResultText (old serializeForRead().content)", (t) => {
		const cwd = makeBlockDir("opresult-read");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		op("upsert-block-item").run(cwd, { block: "tasks", arrayKey: "tasks", item: { id: "T1", title: "x" } });
		// read-block-item was a `return serializeForRead(x, {whole}).content` op.
		const r = op("read-block-item").run(cwd, { block: "tasks", id: "T1" });
		assert.ok(typeof r === "object" && r !== null && "read" in r, "read op returns { read }");
		const read = (r as { read: { data: unknown; truncated: boolean } }).read;
		// The structured value carries the un-stringified item as `data`.
		assert.deepEqual((read.data as { id: string }).id, "T1");
		assert.equal(read.truncated, false);
		// Text surface is byte-identical to the prior serializeForRead().content.
		assert.equal(renderOpResultText(r), renderReadText(read));
	});

	it("a prose op still returns a plain string", (t) => {
		const cwd = makeRelDir("opresult-prose");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		appendRelationByRef(cwd, { parent: "p1", child: "c1", relation_type: "rel" });
		const r = op("remove-relation").run(cwd, { parent: "p1", child: "c1", relation_type: "rel" });
		assert.equal(typeof r, "string");
		assert.equal(renderOpResultText(r), r as string);
	});
});

describe("FGAP-009 non-exposure allowlist", () => {
	it("INTENTIONALLY_UNEXPOSED_WRITERS is exported and every entry has a justification", () => {
		assert.ok(Array.isArray(INTENTIONALLY_UNEXPOSED_WRITERS));
		assert.ok(INTENTIONALLY_UNEXPOSED_WRITERS.length > 0);
		for (const entry of INTENTIONALLY_UNEXPOSED_WRITERS) {
			assert.ok(typeof entry.libraryFn === "string" && entry.libraryFn.length > 0, "libraryFn non-empty");
			assert.ok(
				typeof entry.reason === "string" && entry.reason.length > 0,
				`entry ${entry.libraryFn} reason non-empty`,
			);
		}
	});

	it("names each of the seven canonical withheld writers", () => {
		const fns = new Set(INTENTIONALLY_UNEXPOSED_WRITERS.map((e) => e.libraryFn));
		for (const f of [
			"writeConfig",
			"writeSchema",
			"updateSchema",
			"writeBootstrapPointer",
			"flipBootstrapPointer",
			"writeRegistry",
			"registerSubstrate",
		]) {
			assert.ok(fns.has(f), `allowlist names ${f}`);
		}
	});

	it("safeOp citations resolve to registered ops", () => {
		const opNames = new Set(ops.map((o) => o.name));
		for (const entry of INTENTIONALLY_UNEXPOSED_WRITERS) {
			if (entry.safeOp) assert.ok(opNames.has(entry.safeOp), `safeOp ${entry.safeOp} is a registered op`);
		}
	});
});

describe("TASK-010 relation byRef dryRun preview (shared library path)", () => {
	it("appendRelationByRef dryRun returns appended + dryRun:true and writes nothing; non-dryRun writes", (t) => {
		const cwd = makeRelDir("dry-append");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		// Empty substrate → the prospective append is NOT a duplicate.
		const before = loadRelations(cwd);
		const preview = appendRelationByRef(cwd, { parent: "p1", child: "c1", relation_type: "rel" }, undefined, {
			dryRun: true,
		});
		assert.equal(preview.appended, true, "would append (not a duplicate)");
		assert.equal(preview.dryRun, true);
		assert.deepEqual(loadRelations(cwd), before, "dryRun wrote nothing (relations unchanged)");

		// Seed, then a dryRun of the same edge previews a duplicate-no-op.
		appendRelationByRef(cwd, { parent: "p1", child: "c1", relation_type: "rel" });
		const afterWrite = loadRelations(cwd);
		assert.equal(afterWrite.length, 1, "non-dryRun DID write");
		const dupPreview = appendRelationByRef(cwd, { parent: "p1", child: "c1", relation_type: "rel" }, undefined, {
			dryRun: true,
		});
		assert.equal(dupPreview.appended, false, "would no-op (duplicate)");
		assert.equal(dupPreview.dryRun, true);
		assert.deepEqual(loadRelations(cwd), afterWrite, "dryRun wrote nothing");
	});

	it("removeRelationByRef dryRun returns removed + dryRun:true and writes nothing; non-dryRun writes", (t) => {
		const cwd = makeRelDir("dry-remove");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		appendRelationByRef(cwd, { parent: "p1", child: "c1", relation_type: "rel" });
		const before = loadRelations(cwd);
		assert.equal(before.length, 1);

		const preview = removeRelationByRef(cwd, { parent: "p1", child: "c1", relation_type: "rel" }, undefined, {
			dryRun: true,
		});
		assert.equal(preview.removed, true, "matching edge would be removed");
		assert.equal(preview.dryRun, true);
		assert.deepEqual(loadRelations(cwd), before, "dryRun wrote nothing");

		// Absent edge → would no-op.
		const absent = removeRelationByRef(cwd, { parent: "pX", child: "cX", relation_type: "rel" }, undefined, {
			dryRun: true,
		});
		assert.equal(absent.removed, false, "no matching edge → would no-op");
		assert.deepEqual(loadRelations(cwd), before, "dryRun wrote nothing");

		// Non-dryRun DOES write.
		removeRelationByRef(cwd, { parent: "p1", child: "c1", relation_type: "rel" });
		assert.equal(loadRelations(cwd).length, 0, "non-dryRun removed the edge");
	});

	it("replaceRelationByRef dryRun returns replaced/removed + dryRun:true and writes nothing; non-dryRun writes", (t) => {
		const cwd = makeRelDir("dry-replace");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		appendRelationByRef(cwd, { parent: "p1", child: "c1", relation_type: "rel" });
		const before = loadRelations(cwd);

		const preview = replaceRelationByRef(
			cwd,
			{
				old: { parent: "p1", child: "c1", relation_type: "rel" },
				new: { parent: "p2", child: "c2", relation_type: "rel" },
			},
			undefined,
			{ dryRun: true },
		);
		assert.equal(preview.removed, true, "old edge present → would remove");
		assert.equal(preview.replaced, true, "new edge does not collide → would write");
		assert.equal(preview.dryRun, true);
		assert.deepEqual(loadRelations(cwd), before, "dryRun wrote nothing");

		// Non-dryRun DOES write the swap.
		replaceRelationByRef(cwd, {
			old: { parent: "p1", child: "c1", relation_type: "rel" },
			new: { parent: "p2", child: "c2", relation_type: "rel" },
		});
		const after = loadRelations(cwd);
		assert.equal(after.length, 1);
		assert.ok(!after.some((e) => endpointKey(e.parent) === "p1"));
		assert.ok(after.some((e) => endpointKey(e.parent) === "p2"));
	});

	it("appendRelationsByRef dryRun counts on-disk AND in-batch dedup, dryRun:true, writes nothing; non-dryRun writes", (t) => {
		const cwd = makeRelDir("dry-bulk");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		appendRelationByRef(cwd, { parent: "p1", child: "c1", relation_type: "rel" }); // pre-existing dup
		const before = loadRelations(cwd);

		const edges = [
			{ parent: "p1", child: "c1", relation_type: "rel" }, // on-disk dup → skip
			{ parent: "p2", child: "c2", relation_type: "rel" }, // new → append
			{ parent: "p2", child: "c2", relation_type: "rel" }, // in-batch dup → skip
		];
		const preview = appendRelationsByRef(cwd, edges, undefined, { dryRun: true });
		assert.equal(preview.appended, 1, "one genuinely-new edge");
		assert.equal(preview.skipped, 2, "one on-disk + one in-batch duplicate skipped");
		assert.equal(preview.dryRun, true);
		assert.deepEqual(loadRelations(cwd), before, "dryRun wrote nothing");

		// Non-dryRun DOES write (matching counts).
		const real = appendRelationsByRef(cwd, edges);
		assert.equal(real.appended, 1);
		assert.equal(real.skipped, 2);
		assert.equal(loadRelations(cwd).length, 2, "non-dryRun appended the one new edge");
	});
});
