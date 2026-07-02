import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type ConfigBlock, mergeCatalogRegistries } from "./context.js";

// Focused unit coverage for the PURE merge helper (TASK-038 — FEAT-006 T5).
// mergeCatalogRegistries reads each registry's identity field from
// REGISTRY_DESCRIPTORS (relation_types / block_kinds keyed by canonical_id;
// invariants / lenses keyed by id) and ADDITIVELY brings catalog-new entries
// current without ever replacing a present id.

// Minimal schema-shaped registry entries (only the fields the helper reads + the
// body fields the tests inspect; the helper itself never validates shape).
function rt(canonical_id: string, display_name = canonical_id) {
	return { canonical_id, display_name, category: "ordering" as const };
}
function bk(canonical_id: string) {
	return {
		canonical_id,
		display_name: canonical_id,
		prefix: canonical_id.toUpperCase(),
		schema_path: `schemas/${canonical_id}.schema.json`,
		array_key: canonical_id,
		data_path: `${canonical_id}.json`,
	};
}
function inv(id: string) {
	return {
		id,
		class: "requires-edge" as const,
		block: "tasks",
		relation_types: ["x"],
		direction: "as_parent" as const,
	};
}
function lens(id: string, bins = ["a"]) {
	return { id, bins };
}

function cfg(partial: Partial<ConfigBlock>): ConfigBlock {
	return { schema_version: "1.7.0", root: ".project", block_kinds: [], ...partial } as ConfigBlock;
}

describe("mergeCatalogRegistries (TASK-038)", () => {
	it("additively adds an absent entry and records it under additions", () => {
		const existing = cfg({ relation_types: [rt("present")] });
		const catalog = cfg({ relation_types: [rt("present"), rt("newcomer")] });
		const { merged, additions } = mergeCatalogRegistries(existing, catalog);
		assert.deepEqual(
			(merged.relation_types ?? []).map((r) => r.canonical_id),
			["present", "newcomer"],
			"the absent catalog entry is appended after the existing ones",
		);
		assert.deepEqual(additions.relation_types, ["newcomer"], "only the added id is recorded");
		assert.deepEqual(additions.block_kinds, []);
		assert.deepEqual(additions.invariants, []);
		assert.deepEqual(additions.lenses, []);
	});

	it("leaves a present id alone even when the catalog body diverges (additive-only)", () => {
		const existing = cfg({ relation_types: [rt("shared", "LOCAL-NAME")] });
		const catalog = cfg({ relation_types: [rt("shared", "CATALOG-NAME")] });
		const { merged, additions } = mergeCatalogRegistries(existing, catalog);
		assert.equal(
			(merged.relation_types ?? [])[0].display_name,
			"LOCAL-NAME",
			"a present id's existing body is never overwritten by the catalog",
		);
		assert.equal((merged.relation_types ?? []).length, 1, "no duplicate is appended for a present id");
		assert.deepEqual(additions.relation_types, [], "a present id is not recorded as an addition");
	});

	it("keys block_kinds / relation_types by canonical_id and invariants / lenses by id", () => {
		const existing = cfg({ relation_types: [], invariants: [], block_kinds: [], lenses: [] });
		const catalog = cfg({
			relation_types: [rt("r1")],
			block_kinds: [bk("b1")],
			invariants: [inv("i1")],
			lenses: [lens("l1")],
		});
		const { merged, additions } = mergeCatalogRegistries(existing, catalog);
		assert.deepEqual(additions.relation_types, ["r1"], "relation_types keyed by canonical_id");
		assert.deepEqual(additions.block_kinds, ["b1"], "block_kinds keyed by canonical_id");
		assert.deepEqual(additions.invariants, ["i1"], "invariants keyed by id");
		assert.deepEqual(additions.lenses, ["l1"], "lenses keyed by id");
		assert.deepEqual(
			(merged.block_kinds ?? []).map((b) => b.canonical_id),
			["b1"],
		);
		assert.deepEqual(
			(merged.invariants ?? []).map((i) => i.id),
			["i1"],
		);
		assert.deepEqual(
			(merged.lenses ?? []).map((l) => l.id),
			["l1"],
		);
	});

	it("handles an empty / missing registry array on either side", () => {
		// existing carries no relation_types / invariants / lenses keys at all.
		const existing = cfg({});
		const catalog = cfg({ relation_types: [rt("only")], lenses: [lens("solo")] });
		const { merged, additions } = mergeCatalogRegistries(existing, catalog);
		assert.deepEqual(additions.relation_types, ["only"], "a missing existing array is treated as []");
		assert.deepEqual(additions.lenses, ["solo"]);
		assert.deepEqual(
			(merged.relation_types ?? []).map((r) => r.canonical_id),
			["only"],
		);

		// catalog carries nothing for a registry the existing config populates.
		const existing2 = cfg({ lenses: [lens("keep")] });
		const catalog2 = cfg({});
		const { merged: merged2, additions: additions2 } = mergeCatalogRegistries(existing2, catalog2);
		assert.deepEqual(additions2.lenses, [], "an empty catalog array adds nothing");
		assert.deepEqual(
			(merged2.lenses ?? []).map((l) => l.id),
			["keep"],
			"the existing entry is preserved",
		);
	});

	it("does not mutate the input existing config (operates on a deep clone)", () => {
		const existing = cfg({ relation_types: [rt("a")] });
		const catalog = cfg({ relation_types: [rt("a"), rt("b")] });
		mergeCatalogRegistries(existing, catalog);
		assert.deepEqual(
			(existing.relation_types ?? []).map((r) => r.canonical_id),
			["a"],
			"the input existing config must be untouched",
		);
	});
});
