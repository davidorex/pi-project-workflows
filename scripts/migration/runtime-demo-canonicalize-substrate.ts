/**
 * Runtime demo (the substrate CANONICALIZER + triple-buffer CLI).
 *
 * The orchestrator's rehearsal before the real `.project-migrate` dupe-run-swap.
 * Builds a scratch substrate (depth-3 nested tree promoted THROUGH A SYNTHESIZED
 * intermediate `feature-story` block — matching the CLI's PROJECT_MIGRATE_TARGETS —
 * plus a 0-data nested id array) end-to-end and drives it THROUGH THE CLI
 * (`scripts/migration/canonicalize-substrate.ts`) so the actual
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

/** features schema in the REAL `.project-migrate` `$ref`-tree form: `features.items`
 * is `{$ref:#/definitions/feature}`; `feature.stories` → `{$ref:#/definitions/story}`;
 * `story.tasks` → `{$ref:#/definitions/task}`; `feature.findings` →
 * `{$ref:#/definitions/scoped-finding}` (0-data). EVERY definition is
 * `additionalProperties:false` AND declares NO identity fields (`oid`/`content_hash`/
 * `content_parent`). This is the mole-class the clean-emit canonicalizer must dissolve:
 *   - the source `$ref`/`definitions` tree must be IGNORED (clean-emit infers each
 *     emitted schema from DATA, so no `$ref`/`$defs` survives + nothing dangles);
 *   - the parent (`features`) source schema omits identity fields, so the framework's
 *     identity-stamp gate is a NO-OP until the canonicalizer re-emits the parent schema
 *     declaring them (otherwise parent oids never mint + the membership-edge parent-oid
 *     lookup throws);
 *   - the depth-3 `task` definition's AP:false over a NARROWER field set than the on-disk
 *     data must NOT be carried forward — the synthesized `story-task` schema is inferred
 *     from the promoted DATA's richer field union. */
function featuresSchema(): Record<string, unknown> {
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
			{ schema_version: "1.8.0", root: ".active", substrate_id: "sub-aaaaaaaaaaaaaaaa", block_kinds: [] },
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
		schema_version: "1.8.0",
		root: ".work",
		substrate_id: "sub-0123456789abcdef",
		// ONLY the `features` block is registered. Per the CLI's PROJECT_MIGRATE_TARGETS
		// constant, `features.stories` SYNTHESIZES a NEW `feature-story` block (it does NOT
		// reuse a `story` block — there is none), and the deepest `feature-story.tasks`
		// SYNTHESIZES a NEW `story-task` block. This mirrors the real `.project-migrate`
		// shape after the reuse→synthesis switch, so the demo exercises the depth-3
		// promotion THROUGH A SYNTHESIZED INTERMEDIATE (the dry-run/real divergence path).
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
	// Orphan content-bearing `conventions` block — UNREGISTERED (absent from
	// block_kinds) but with a clean schema (`rules` array of slug-id items + singleton
	// fields) + data. The CLI's PROJECT_MIGRATE_REGISTER_BLOCKS directs the canonicalizer
	// to register it + content-address its rules (slug ids kept), mirroring the real
	// `.project-migrate/conventions` orphan. Exercises the registerBlocks path end-to-end.
	fs.writeFileSync(
		path.join(work, "schemas", "conventions.schema.json"),
		JSON.stringify(
			{
				$schema: "http://json-schema.org/draft-07/schema#",
				title: "Conventions",
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
					lint_command: { type: "string" },
				},
			},
			null,
			2,
		),
	);
	fs.writeFileSync(
		path.join(work, "conventions.json"),
		JSON.stringify(
			{
				rules: [
					{ id: "esm", description: "ESM only", enforcement: "lint", severity: "error" },
					{ id: "no-pi-dir", description: "never touch .pi", enforcement: "review", severity: "warning" },
				],
				lint_command: "biome check .",
			},
			null,
			2,
		),
	);
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
			},
			null,
			2,
		),
	);
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

			// Substrate is canonical. Stories were promoted into the SYNTHESIZED
			// `feature-story` block; the deepest tasks into the SYNTHESIZED `story-task`
			// block. Resolve both from the post-swap config (data_path / array_key) since
			// they were minted by the canonicalizer.
			const cfgBlocks = JSON.parse(fs.readFileSync(path.join(work, "config.json"), "utf-8")).block_kinds as Record<
				string,
				unknown
			>[];
			const storyCfg = cfgBlocks.find((b) => b.canonical_id === "feature-story");
			if (!storyCfg) fail("expected a synthesized feature-story block");
			const stories = blockItems(work, storyCfg!.data_path as string, storyCfg!.array_key as string);
			if (stories.length !== 2) fail(`expected 2 promoted stories, got ${stories.length}`);
			const taskCfg = cfgBlocks.find((b) => b.canonical_id === "story-task");
			if (!taskCfg) fail("expected a synthesized story-task block");
			const tasks = blockItems(work, taskCfg!.data_path as string, taskCfg!.array_key as string);
			if (tasks.length !== 3) fail(`expected 3 promoted tasks, got ${tasks.length}`);

			for (const it of [...stories, ...tasks, ...blockItems(work, "features.json", "features")]) {
				if (!/^[0-9a-f]{32}$/.test(it.oid as string)) fail(`item ${String(it.id)} oid not 32-hex`);
				if (!/^[0-9a-f]{64}$/.test(it.content_hash as string)) fail(`item ${String(it.id)} content_hash not 64-hex`);
				if (!hasObject(work, it.content_hash as string)) fail(`item ${String(it.id)} object missing on disk`);
			}
			for (const f of blockItems(work, "features.json", "features")) {
				// stories was data-bearing → promoted → de-nested (gone). findings is a 0-DATA
				// id array → NEVER promoted; clean-emit RETAINS it in the data as a loose empty
				// array (re-inferred as `{type:"array"}`, 9.2-guard-clean), so it must REMAIN.
				if (Object.hasOwn(f, "stories")) fail("feature not de-nested (stories should be promoted away)");
				if (!Object.hasOwn(f, "findings")) fail("feature should RETAIN its 0-data findings array (clean-emit)");
				if (!Array.isArray(f.findings) || (f.findings as unknown[]).length !== 0) {
					fail("feature findings should be an empty array (0-data, unpromoted)");
				}
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

			// ── (2b) orphan `conventions` block registered + its slug-id rules content-addressed ─
			const conventionsBk = cfgBlocks.find((b) => b.canonical_id === "conventions");
			if (!conventionsBk) fail("(2b) conventions orphan block not registered as a block_kind");
			const rules = blockItems(work, conventionsBk!.data_path as string, conventionsBk!.array_key as string);
			if (rules.length !== 2) fail(`(2b) expected 2 conventions rules, got ${rules.length}`);
			if (
				rules
					.map((r) => r.id)
					.sort()
					.join(",") !== "esm,no-pi-dir"
			)
				fail("(2b) conventions slug ids changed");
			for (const r of rules) {
				if (!/^[0-9a-f]{32}$/.test(r.oid as string)) fail(`(2b) conventions rule ${String(r.id)} oid not 32-hex`);
				if (!hasObject(work, r.content_hash as string)) fail(`(2b) conventions rule ${String(r.id)} object missing`);
			}
			const convData = JSON.parse(
				fs.readFileSync(path.join(work, conventionsBk!.data_path as string), "utf-8"),
			) as Record<string, unknown>;
			if (convData.lint_command !== "biome check .") fail("(2b) conventions singleton lint_command not preserved");
			pass("(2b) orphan `conventions` block registered + its 2 slug-id rules content-addressed (singletons preserved)");
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
			// Stories were promoted into the SYNTHESIZED `feature-story` block (array_key
			// `feature-story`, data file `feature-story.json`) — not a reused `story` block.
			const dupeStories = blockItems(dupeWork, "feature-story.json", "feature-story");
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
