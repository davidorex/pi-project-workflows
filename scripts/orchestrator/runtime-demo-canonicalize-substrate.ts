/**
 * Runtime demo (Cycle 10 — the substrate CANONICALIZER + triple-buffer CLI).
 *
 * The orchestrator's rehearsal before the real `.project-migrate` dupe-run-swap.
 * Builds a scratch substrate (depth-3 nested tree + an empty reuse target + a
 * 0-data nested id array) end-to-end and drives it THROUGH THE CLI
 * (`scripts/orchestrator/canonicalize-substrate.ts`) so the actual
 * dupe/verify/swap path is exercised — NOT a library-only call. Scratch fixtures
 * ONLY (mkdtemp); never a real substrate. Console PASS markers + process.exit(1)
 * on the first failed assertion. Proves:
 *
 *   (1) --dry-run prints a CanonicalizeReport + writes NOTHING (tree identical).
 *   (2) a real run (dupe → canonicalize → verify-by-pointer-switch → swap) leaves
 *       a CANONICAL substrate: every nested entity is top-level (oid 32-hex +
 *       content_hash + object on disk), parents de-nested, findNestedIdBearingArrays
 *       over every schema → [], membership edges carry ordinals + original refnames.
 *   (3) the verify pointer-switch is RESTORED (active pointer back to original).
 *   (4) --no-swap leaves the canonical dupe + the original untouched.
 *   (5) idempotency: a second swap-run reports 0 promotions / 0 mints.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { type EdgeEndpoint, loadRelationsForDir } from "@davidorex/pi-context/context";
import { hasObject } from "@davidorex/pi-context/object-store";
import { findNestedIdBearingArrays } from "@davidorex/pi-context/schema-write";

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "canonicalize-substrate.ts");

function fail(msg: string): never {
	console.error(`[runtime-demo] FAIL: ${msg}`);
	process.exit(1);
}
function pass(msg: string): void {
	console.log(`[runtime-demo] ✔ ${msg}`);
}

const IDENTITY_PROPS = {
	oid: { type: "string", pattern: "^[0-9a-f]{32}$" },
	content_hash: { type: "string", pattern: "^[0-9a-f]{64}$" },
	content_parent: { type: "string", pattern: "^[0-9a-f]{64}$" },
};

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
											properties: { id: { type: "string" }, desc: { type: "string" }, ...IDENTITY_PROPS },
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

/** Build a fresh scratch cwd whose `.work` substrate carries the nested tree.
 * The bootstrap pointer is written to a DIFFERENT active dir `.active` (an empty
 * substrate) so the verify pointer-switch is observable + restorable. */
function makeFixture(): { cwd: string; work: string } {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "canon-demo-"));
	// Active substrate `.active` (empty) — proves the verify switch restores it.
	fs.mkdirSync(path.join(cwd, ".active", "schemas"), { recursive: true });
	fs.writeFileSync(
		path.join(cwd, ".active", "config.json"),
		JSON.stringify(
			{ schema_version: "1.0.0", root: ".active", substrate_id: "sub-aaaaaaaaaaaaaaaa", block_kinds: [] },
			null,
			2,
		),
	);
	fs.writeFileSync(
		path.join(cwd, ".pi-context.json"),
		JSON.stringify({ contextDir: ".active", version: "1.0.0", created_at: new Date().toISOString() }, null, 2),
	);

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
	fs.writeFileSync(
		path.join(work, "features.json"),
		JSON.stringify(
			{
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
			},
			null,
			2,
		),
	);
	fs.writeFileSync(path.join(work, "story.json"), JSON.stringify({ stories: [] }, null, 2));
	return { cwd, work };
}

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

function runCli(cwd: string, extra: string[]): string {
	return execFileSync("npx", ["tsx", CLI, "--cwd", cwd, "--substrate", ".work", ...extra], {
		encoding: "utf-8",
		stdio: ["ignore", "pipe", "pipe"],
	});
}

function blockItems(work: string, file: string, arrayKey: string): Record<string, unknown>[] {
	const data = JSON.parse(fs.readFileSync(path.join(work, file), "utf-8")) as Record<string, unknown>;
	return (data[arrayKey] as Record<string, unknown>[]) ?? [];
}

function main(): void {
	// ── (1) --dry-run: report + zero writes ────────────────────────────────────
	{
		const { cwd, work } = makeFixture();
		try {
			const before = snapshotTree(work);
			const out = runCli(cwd, ["--dry-run"]);
			const report = JSON.parse(out) as { dry_run: boolean; promotions: unknown[] };
			if (!report.dry_run) fail("--dry-run report.dry_run !== true");
			if (report.promotions.length !== 2) fail(`--dry-run expected 2 promotions, got ${report.promotions.length}`);
			const after = snapshotTree(work);
			if (JSON.stringify([...after.entries()].sort()) !== JSON.stringify([...before.entries()].sort())) {
				fail("--dry-run mutated the substrate tree");
			}
			pass("(1) --dry-run prints a CanonicalizeReport (2 promotions) and writes nothing");
		} finally {
			fs.rmSync(cwd, { recursive: true, force: true });
		}
	}

	// ── (2)+(3) real run: dupe → canonicalize → verify → swap ──────────────────
	{
		const { cwd, work } = makeFixture();
		try {
			const contextDirBefore = (
				JSON.parse(fs.readFileSync(path.join(cwd, ".pi-context.json"), "utf-8")) as { contextDir: string }
			).contextDir;
			runCli(cwd, []);

			// Pointer restored after the verify switch (contextDir back to the original
			// active dir; the writer re-stamps created_at, so compare the field, not bytes).
			const contextDirAfter = (
				JSON.parse(fs.readFileSync(path.join(cwd, ".pi-context.json"), "utf-8")) as { contextDir: string }
			).contextDir;
			if (contextDirAfter !== contextDirBefore) {
				fail(`(3) verify pointer-switch left contextDir='${contextDirAfter}' (expected '${contextDirBefore}')`);
			}
			pass("(3) verify pointer-switch restored the original active pointer (contextDir)");

			// Substrate is canonical.
			const stories = blockItems(work, "story.json", "stories");
			if (stories.length !== 2) fail(`expected 2 promoted stories, got ${stories.length}`);
			const taskCfgBlocks = (
				JSON.parse(fs.readFileSync(path.join(work, "config.json"), "utf-8")).block_kinds as Record<string, unknown>[]
			).filter((b) => String(b.canonical_id).includes("task"));
			if (taskCfgBlocks.length !== 1) fail("expected exactly 1 synthesized task block");
			const taskCfg = taskCfgBlocks[0];
			const tasks = blockItems(work, taskCfg.data_path as string, taskCfg.array_key as string);
			if (tasks.length !== 3) fail(`expected 3 promoted tasks, got ${tasks.length}`);

			for (const it of [...stories, ...tasks, ...blockItems(work, "features.json", "features")]) {
				if (!/^[0-9a-f]{32}$/.test(it.oid as string)) fail(`item ${String(it.id)} oid not 32-hex`);
				if (!/^[0-9a-f]{64}$/.test(it.content_hash as string)) fail(`item ${String(it.id)} content_hash not 64-hex`);
				if (!hasObject(work, it.content_hash as string)) fail(`item ${String(it.id)} object missing on disk`);
			}
			for (const f of blockItems(work, "features.json", "features")) {
				if (Object.hasOwn(f, "stories") || Object.hasOwn(f, "findings")) fail("feature not de-nested");
			}
			for (const s of stories) if (Object.hasOwn(s, "tasks")) fail("story not de-nested");

			for (const sf of fs.readdirSync(path.join(work, "schemas"))) {
				const schema = JSON.parse(fs.readFileSync(path.join(work, "schemas", sf), "utf-8")) as Record<string, unknown>;
				const nested = findNestedIdBearingArrays(schema);
				if (nested.length) fail(`schema ${sf} still has nested id array: ${nested.join(", ")}`);
			}

			const edges = loadRelationsForDir(work);
			const taskEdges = edges.filter((e) => {
				const c = e.child;
				return (
					typeof c === "object" &&
					c.kind === "item" &&
					/^T\d$/.test((c as EdgeEndpoint & { refname?: string }).refname ?? "")
				);
			});
			if (taskEdges.length !== 3) fail(`expected 3 task membership edges, got ${taskEdges.length}`);
			const t1 = taskEdges.find((e) => (e.child as EdgeEndpoint & { refname?: string }).refname === "T1");
			const t2 = taskEdges.find((e) => (e.child as EdgeEndpoint & { refname?: string }).refname === "T2");
			if (t1?.ordinal !== 0 || t2?.ordinal !== 1) fail("task edge ordinals wrong");
			pass("(2) swap left a CANONICAL substrate (5 entities promoted, content-addressed, de-nested, edges ordinaled)");
		} finally {
			fs.rmSync(cwd, { recursive: true, force: true });
		}
	}

	// ── (4) --no-swap leaves the dupe + original untouched ─────────────────────
	{
		const { cwd, work } = makeFixture();
		try {
			const originalSchemas = fs.readFileSync(path.join(work, "schemas", "features.schema.json"), "utf-8");
			runCli(cwd, ["--no-swap"]);
			// Original substrate untouched (still has the nested schema).
			if (fs.readFileSync(path.join(work, "schemas", "features.schema.json"), "utf-8") !== originalSchemas) {
				fail("(4) --no-swap mutated the ORIGINAL substrate");
			}
			// A canonical dupe was left under tmp/.
			const dupes = fs.readdirSync(path.join(cwd, "tmp")).filter((d) => d.startsWith("canonicalize-work-"));
			if (dupes.length !== 1) fail(`(4) --no-swap expected 1 leftover dupe, got ${dupes.length}`);
			const dupeWork = path.join(cwd, "tmp", dupes[0]);
			const dupeStories = blockItems(dupeWork, "story.json", "stories");
			if (dupeStories.length !== 2) fail("(4) --no-swap dupe not canonicalized");
			pass("(4) --no-swap left a canonical dupe + the original untouched");
		} finally {
			fs.rmSync(cwd, { recursive: true, force: true });
		}
	}

	// ── (5) idempotency: second swap-run reports 0 promotions / 0 mints ─────────
	{
		const { cwd } = makeFixture();
		try {
			runCli(cwd, []); // first canonicalization (swap)
			const out = runCli(cwd, []); // second run on the now-canonical substrate
			const report = JSON.parse(out) as { promotions: unknown[]; items_oid_minted: number };
			if (report.promotions.length !== 0) fail(`(5) second run promoted ${report.promotions.length} (expected 0)`);
			if (report.items_oid_minted !== 0) fail(`(5) second run minted ${report.items_oid_minted} oids (expected 0)`);
			pass("(5) idempotent: a second swap-run reports 0 promotions / 0 oid mints");
		} finally {
			fs.rmSync(cwd, { recursive: true, force: true });
		}
	}

	console.log("[runtime-demo] ALL PASS — canonicalizer + triple-buffer CLI");
}

main();
