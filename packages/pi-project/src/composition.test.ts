/**
 * Composition lens tests — resolveComposition + loadLensView dispatch
 * on kind="composition". Closes FGAP-012 implementation per step 3 of
 * the roadmap/plan substrate envelope.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { loadLensView } from "./lens-view.js";
import { type ConfigBlock, type LensSpec, resolveComposition } from "./project-context.js";

let tmpRoot: string;

interface MakeProjectOpts {
	lenses: LensSpec[];
	issues?: Array<Record<string, unknown>>;
	decisions?: Array<Record<string, unknown>>;
}

function makeProject(opts: MakeProjectOpts): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-project-composition-"));
	fs.mkdirSync(path.join(dir, ".project", "schemas"), { recursive: true });
	const config: ConfigBlock = {
		schema_version: "0.2.0",
		root: ".project",
		lenses: opts.lenses,
	};
	fs.writeFileSync(path.join(dir, ".project", "config.json"), JSON.stringify(config, null, 2));
	if (opts.issues) {
		fs.writeFileSync(path.join(dir, ".project", "issues.json"), JSON.stringify({ issues: opts.issues }, null, 2));
	}
	if (opts.decisions) {
		fs.writeFileSync(
			path.join(dir, ".project", "decisions.json"),
			JSON.stringify({ decisions: opts.decisions }, null, 2),
		);
	}
	return dir;
}

describe("resolveComposition", () => {
	afterEach(() => {
		if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	it("aggregates items from two {from, where} members across different blocks", () => {
		tmpRoot = makeProject({
			lenses: [
				{
					id: "active-work",
					kind: "composition",
					targets: ["issues", "decisions"],
					members: [
						{ from: "issues", where: { status: "open" } },
						{ from: "decisions", where: { status: "enacted" } },
					],
					bins: ["all"],
				},
			],
			issues: [
				{ id: "issue-001", status: "open" },
				{ id: "issue-002", status: "resolved" },
			],
			decisions: [
				{ id: "DEC-0001", status: "enacted" },
				{ id: "DEC-0002", status: "open" },
			],
		});
		const lens: LensSpec = {
			id: "active-work",
			kind: "composition",
			targets: ["issues", "decisions"],
			members: [
				{ from: "issues", where: { status: "open" } },
				{ from: "decisions", where: { status: "enacted" } },
			],
			bins: ["all"],
		};
		const result = resolveComposition(tmpRoot, lens);
		assert.equal(result.members.length, 2);
		assert.equal(result.unionedItems.length, 2);
		const ids = result.unionedItems.map((i) => i.id).sort();
		assert.deepEqual(ids, ["DEC-0001", "issue-001"]);
		assert.equal(result.perItemOrigin.get("issue-001"), "issues");
		assert.equal(result.perItemOrigin.get("DEC-0001"), "decisions");
	});

	it("resolves a {lens} member that points at a target sub-lens", () => {
		tmpRoot = makeProject({
			lenses: [
				{
					id: "by-package",
					target: "issues",
					relation_type: "package-membership",
					derived_from_field: "package",
					bins: ["pi-project"],
				},
				{
					id: "compose-via-sublens",
					kind: "composition",
					targets: ["issues"],
					members: [{ lens: "by-package" }],
					bins: ["all"],
				},
			],
			issues: [
				{ id: "issue-001", package: "pi-project" },
				{ id: "issue-002", package: "pi-project" },
			],
		});
		const compositionLens: LensSpec = {
			id: "compose-via-sublens",
			kind: "composition",
			targets: ["issues"],
			members: [{ lens: "by-package" }],
			bins: ["all"],
		};
		const result = resolveComposition(tmpRoot, compositionLens);
		assert.equal(result.unionedItems.length, 2);
		assert.equal(result.perItemOrigin.get("issue-001"), "issues");
	});

	it("recurses through composition sub-lens references", () => {
		tmpRoot = makeProject({
			lenses: [
				{
					id: "inner-composition",
					kind: "composition",
					targets: ["issues"],
					members: [{ from: "issues", where: { status: "open" } }],
					bins: ["all"],
				},
				{
					id: "outer-composition",
					kind: "composition",
					targets: ["issues"],
					members: [{ lens: "inner-composition" }],
					bins: ["all"],
				},
			],
			issues: [
				{ id: "issue-001", status: "open" },
				{ id: "issue-002", status: "resolved" },
			],
		});
		const outerLens: LensSpec = {
			id: "outer-composition",
			kind: "composition",
			targets: ["issues"],
			members: [{ lens: "inner-composition" }],
			bins: ["all"],
		};
		const result = resolveComposition(tmpRoot, outerLens);
		assert.equal(result.unionedItems.length, 1);
		assert.equal(result.unionedItems[0]?.id, "issue-001");
	});

	it("throws composition_cycle_detected on direct two-lens cycle", () => {
		tmpRoot = makeProject({
			lenses: [
				{
					id: "lens-a",
					kind: "composition",
					targets: ["issues"],
					members: [{ lens: "lens-b" }],
					bins: ["a"],
				},
				{
					id: "lens-b",
					kind: "composition",
					targets: ["issues"],
					members: [{ lens: "lens-a" }],
					bins: ["b"],
				},
			],
			issues: [],
		});
		const lensA: LensSpec = {
			id: "lens-a",
			kind: "composition",
			targets: ["issues"],
			members: [{ lens: "lens-b" }],
			bins: ["a"],
		};
		assert.throws(
			() => resolveComposition(tmpRoot, lensA),
			(err: Error) => err.message.includes("composition_cycle_detected"),
		);
	});

	it("throws composition_cycle_detected on self-cycle", () => {
		tmpRoot = makeProject({
			lenses: [
				{
					id: "self-cycle",
					kind: "composition",
					targets: ["issues"],
					members: [{ lens: "self-cycle" }],
					bins: ["a"],
				},
			],
			issues: [],
		});
		const lens: LensSpec = {
			id: "self-cycle",
			kind: "composition",
			targets: ["issues"],
			members: [{ lens: "self-cycle" }],
			bins: ["a"],
		};
		assert.throws(
			() => resolveComposition(tmpRoot, lens),
			(err: Error) => err.message.includes("composition_cycle_detected"),
		);
	});

	it("throws when a member references an unknown sub-lens", () => {
		tmpRoot = makeProject({
			lenses: [
				{
					id: "broken",
					kind: "composition",
					targets: ["issues"],
					members: [{ lens: "nonexistent" }],
					bins: ["a"],
				},
			],
			issues: [],
		});
		const lens: LensSpec = {
			id: "broken",
			kind: "composition",
			targets: ["issues"],
			members: [{ lens: "nonexistent" }],
			bins: ["a"],
		};
		assert.throws(() => resolveComposition(tmpRoot, lens), /unknown lens 'nonexistent'/);
	});

	it("throws when called on a non-composition lens", () => {
		tmpRoot = makeProject({
			lenses: [
				{
					id: "target-lens",
					target: "issues",
					relation_type: "x",
					derived_from_field: null,
					bins: ["a"],
				},
			],
			issues: [],
		});
		const lens: LensSpec = {
			id: "target-lens",
			target: "issues",
			relation_type: "x",
			derived_from_field: null,
			bins: ["a"],
		};
		assert.throws(() => resolveComposition(tmpRoot, lens), /not kind=composition/);
	});

	it("dedupes items present in multiple members by item.id", () => {
		tmpRoot = makeProject({
			lenses: [
				{
					id: "overlap",
					kind: "composition",
					targets: ["issues"],
					members: [
						{ from: "issues", where: { package: "pi-project" } },
						{ from: "issues", where: { status: "open" } },
					],
					bins: ["all"],
				},
			],
			issues: [
				{ id: "issue-001", package: "pi-project", status: "open" }, // matches both members
				{ id: "issue-002", package: "pi-project", status: "resolved" }, // matches first only
				{ id: "issue-003", package: "other", status: "open" }, // matches second only
			],
		});
		const lens: LensSpec = {
			id: "overlap",
			kind: "composition",
			targets: ["issues"],
			members: [
				{ from: "issues", where: { package: "pi-project" } },
				{ from: "issues", where: { status: "open" } },
			],
			bins: ["all"],
		};
		const result = resolveComposition(tmpRoot, lens);
		assert.equal(result.unionedItems.length, 3);
		assert.equal(result.members[0]?.items.length, 2);
		assert.equal(result.members[1]?.items.length, 2);
	});
});

describe("loadLensView dispatch on kind", () => {
	afterEach(() => {
		if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	it("routes kind='target' lens through the existing target path", () => {
		tmpRoot = makeProject({
			lenses: [
				{
					id: "by-package",
					kind: "target",
					target: "issues",
					relation_type: "package-membership",
					derived_from_field: "package",
					bins: ["pi-project"],
				},
			],
			issues: [{ id: "issue-001", package: "pi-project" }],
		});
		const view = loadLensView(tmpRoot, "by-package");
		assert.ok(!("error" in view));
		assert.equal(view.lens.kind, "target");
		assert.equal(view.items.length, 1);
	});

	it("routes kind='composition' lens through resolveComposition", () => {
		tmpRoot = makeProject({
			lenses: [
				{
					id: "comp",
					kind: "composition",
					targets: ["issues", "decisions"],
					members: [
						{ from: "issues", where: { status: "open" } },
						{ from: "decisions", where: { status: "enacted" } },
					],
					bins: ["all"],
				},
			],
			issues: [{ id: "issue-001", status: "open" }],
			decisions: [{ id: "DEC-0001", status: "enacted" }],
		});
		const view = loadLensView(tmpRoot, "comp");
		assert.ok(!("error" in view));
		assert.equal(view.lens.kind, "composition");
		assert.equal(view.items.length, 2);
	});

	it("returns error on composition cycle through loadLensView", () => {
		tmpRoot = makeProject({
			lenses: [
				{ id: "a", kind: "composition", targets: ["issues"], members: [{ lens: "b" }], bins: ["x"] },
				{ id: "b", kind: "composition", targets: ["issues"], members: [{ lens: "a" }], bins: ["x"] },
			],
			issues: [],
		});
		const view = loadLensView(tmpRoot, "a");
		assert.ok("error" in view);
		assert.match(view.error, /composition_cycle_detected/);
	});

	it("kind=target lens missing target field returns structured error", () => {
		tmpRoot = makeProject({
			lenses: [{ id: "broken", kind: "target", relation_type: "r", derived_from_field: null, bins: ["a"] }],
		});
		const view = loadLensView(tmpRoot, "broken");
		assert.ok("error" in view);
		assert.match(view.error, /missing required field 'target'/);
	});
});
