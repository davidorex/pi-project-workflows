import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { writeBootstrapPointer } from "./context-dir.js";
import { ops } from "./ops-registry.js";

// Local seeder mirroring lens-view.test.ts's makeProject — a config.json with
// declared lenses plus optional target block files. Kept independent so this
// op-level suite does not depend on the sibling test file's internals.
function makeProject(opts: {
	lenses: Array<{
		id: string;
		target?: string;
		relation_type?: string;
		derived_from_field?: string | null;
		bins: string[];
		kind?: "target" | "composition";
		render_uncategorized?: boolean;
	}>;
	blocks?: Record<string, { key: string; items: Array<Record<string, unknown>> }>;
}): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-context-lens-view-op-"));
	writeBootstrapPointer(dir, ".project");
	fs.mkdirSync(path.join(dir, ".project", "schemas"), { recursive: true });
	const config = {
		schema_version: "1.0.0",
		root: ".project",
		block_kinds: [],
		lenses: opts.lenses,
	};
	fs.writeFileSync(path.join(dir, ".project", "config.json"), JSON.stringify(config, null, 2));
	for (const [block, { key, items }] of Object.entries(opts.blocks ?? {})) {
		fs.writeFileSync(path.join(dir, ".project", `${block}.json`), JSON.stringify({ [key]: items }, null, 2));
	}
	return dir;
}

function findOp(name: string) {
	const op = ops.find((o) => o.name === name);
	assert.ok(op, `op '${name}' not registered`);
	return op as NonNullable<typeof op>;
}

function run(cwd: string, params: Record<string, unknown>) {
	const op = findOp("context-lens-view");
	const result = op.run(cwd, params as never);
	return (result as { read: { data: unknown; complete: boolean; total?: number; hasMore?: boolean } }).read;
}

describe("context-lens-view op", () => {
	let tmpRoot: string;
	afterEach(() => {
		if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	it("summary: bin->count over every declared bin (incl. empty), uncategorized + total", () => {
		tmpRoot = makeProject({
			lenses: [
				{
					id: "by-package",
					target: "issues",
					relation_type: "package-membership",
					derived_from_field: "package",
					bins: ["pi-context", "pi-jit-agents", "empty-bin"],
				},
			],
			blocks: {
				issues: {
					key: "issues",
					items: [
						{ id: "issue-001", package: "pi-context" },
						{ id: "issue-002", package: "pi-context" },
						{ id: "issue-003", package: "pi-jit-agents" },
						{ id: "issue-004", package: "uncat-package" },
					],
				},
			},
		});
		const read = run(tmpRoot, { lensId: "by-package" });
		assert.equal(read.complete, true);
		const data = read.data as {
			lens: string;
			kind: string;
			bins: Record<string, number>;
			uncategorized: number;
			total: number;
		};
		assert.equal(data.lens, "by-package");
		assert.equal(data.kind, "target");
		assert.equal(data.bins["pi-context"], 2);
		assert.equal(data.bins["pi-jit-agents"], 1);
		assert.equal(data.bins["empty-bin"], 0);
		assert.equal(typeof data.uncategorized, "number");
		assert.equal(data.uncategorized, 1);
		assert.equal(data.total, 4);
	});

	it("per-bin paging: limit + offset over a bin's items, total = full bin size", () => {
		tmpRoot = makeProject({
			lenses: [
				{
					id: "by-package",
					target: "issues",
					relation_type: "package-membership",
					derived_from_field: "package",
					bins: ["pi-context", "other"],
				},
			],
			blocks: {
				issues: {
					key: "issues",
					items: [
						{ id: "issue-001", package: "pi-context" },
						{ id: "issue-002", package: "pi-context" },
						{ id: "issue-003", package: "pi-context" },
						{ id: "issue-099", package: "other" },
					],
				},
			},
		});
		const first = run(tmpRoot, { lensId: "by-package", bin: "pi-context", limit: 1 });
		const firstData = first.data as { items: Array<{ id: string }>; total: number; hasMore: boolean };
		assert.equal(firstData.items.length, 1);
		assert.equal(firstData.total, 3);
		assert.equal(firstData.hasMore, true);
		assert.equal(firstData.items[0]?.id, "issue-001");

		const second = run(tmpRoot, { lensId: "by-package", bin: "pi-context", offset: 1, limit: 1 });
		const secondData = second.data as { items: Array<{ id: string }>; total: number; hasMore: boolean };
		assert.equal(secondData.items.length, 1);
		assert.equal(secondData.total, 3);
		assert.equal(secondData.hasMore, true);
		assert.equal(secondData.items[0]?.id, "issue-002");
	});

	it("unknown lensId throws", () => {
		tmpRoot = makeProject({
			lenses: [
				{
					id: "by-package",
					target: "issues",
					relation_type: "x",
					derived_from_field: "package",
					bins: ["a"],
				},
			],
			blocks: { issues: { key: "issues", items: [] } },
		});
		assert.throws(() => run(tmpRoot, { lensId: "nope" }));
	});

	it("unknown bin throws", () => {
		tmpRoot = makeProject({
			lenses: [
				{
					id: "by-package",
					target: "issues",
					relation_type: "x",
					derived_from_field: "package",
					bins: ["a"],
				},
			],
			blocks: { issues: { key: "issues", items: [{ id: "issue-001", package: "a" }] } },
		});
		assert.throws(() => run(tmpRoot, { lensId: "by-package", bin: "nope" }));
	});

	it("over-cap per-bin page fails closed (complete:false/data:null) while summary stays complete", () => {
		// Seed one bin with enough large items that its serialized page exceeds the
		// 50KB read cap. Each item carries a ~4KB blob; 30 items > 100KB.
		const blob = "x".repeat(4096);
		const big: Array<Record<string, unknown>> = [];
		for (let i = 0; i < 30; i++) big.push({ id: `issue-${String(i).padStart(3, "0")}`, package: "heavy", blob });
		tmpRoot = makeProject({
			lenses: [
				{
					id: "by-package",
					target: "issues",
					relation_type: "package-membership",
					derived_from_field: "package",
					bins: ["heavy"],
				},
			],
			blocks: { issues: { key: "issues", items: big } },
		});
		const page = run(tmpRoot, { lensId: "by-package", bin: "heavy" });
		assert.equal(page.complete, false);
		assert.equal(page.data, null);

		const summary = run(tmpRoot, { lensId: "by-package" });
		assert.equal(summary.complete, true);
		const data = summary.data as { bins: Record<string, number>; total: number };
		assert.equal(data.bins.heavy, 30);
		assert.equal(data.total, 30);
	});
});
