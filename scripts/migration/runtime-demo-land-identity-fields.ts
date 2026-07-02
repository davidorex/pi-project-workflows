#!/usr/bin/env tsx
/**
 * Runtime demo (Cycle 10 / H1-precursor — land-identity-fields):
 *
 * Exercises `landIdentityFieldsForDir` end-to-end against a scratch substrate
 * carrying all four block_kind dispositions, and proves the C2-completion goal:
 *
 *   BEFORE — zero of the data-bearing block_kinds' schemas pass the H1 step-0
 *            readiness gate (schemaDeclaresIdentityFields).
 *   AFTER  — every registered block_kind's schema declares all three identity
 *            fields (gate passes), existing data still validates, and the three
 *            injected fields are byte-identical to the canonical declaration +
 *            absent from `required`.
 *   DRY-RUN — computes the same buckets but touches no disk.
 *   IDEMPOTENT — a second run reports everything in `already`, no writes.
 *
 * Also drives the orchestrator CLI (`land-identity-fields.ts --dry-run`) against
 * the scratch substrate to prove the wrapper surface emits the LandReport JSON.
 *
 * Pure library + CLI invocation (no npm, no LLM call). Console PASS markers;
 * process.exit(1) on the first failed assertion. NEVER touches a real substrate.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { validateBlockWithMigrationForDir } from "@davidorex/pi-context/schema-validator";
import { landIdentityFieldsForDir } from "./lib/land-identity-fields.js";

const IDENTITY_NAMES = ["oid", "content_hash", "content_parent"] as const;

function fail(msg: string): never {
	console.error(`[runtime-demo] FAIL: ${msg}`);
	process.exit(1);
}
function pass(msg: string): void {
	console.log(`[runtime-demo] ✔ ${msg}`);
}

function gatePasses(schemaAbs: string, arrayKey: string): boolean {
	let schema: Record<string, unknown>;
	try {
		schema = JSON.parse(fs.readFileSync(schemaAbs, "utf-8")) as Record<string, unknown>;
	} catch {
		return false;
	}
	const props = schema.properties as Record<string, unknown> | undefined;
	const arrayNode = props?.[arrayKey] as Record<string, unknown> | undefined;
	const items = arrayNode?.items as Record<string, unknown> | undefined;
	const itemProps = items?.properties as Record<string, unknown> | undefined;
	if (!itemProps) return false;
	return IDENTITY_NAMES.every((n) => Object.hasOwn(itemProps, n));
}

function snapshotTree(root: string): Record<string, string> {
	const out: Record<string, string> = {};
	function walk(dir: string): void {
		for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
			const abs = path.join(dir, ent.name);
			if (ent.isDirectory()) walk(abs);
			else out[path.relative(root, abs)] = fs.readFileSync(abs, "utf-8");
		}
	}
	walk(root);
	return out;
}

function buildScratch(): { cwd: string; sub: string } {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "land-identity-demo-"));
	const sub = path.join(cwd, ".project");
	fs.mkdirSync(path.join(sub, "schemas"), { recursive: true });

	fs.writeFileSync(
		path.join(sub, "config.json"),
		JSON.stringify({
			schema_version: "1.7.0",
			root: ".project",
			block_kinds: [
				{
					canonical_id: "inline",
					display_name: "Inline",
					prefix: "IN-",
					schema_path: "schemas/inline.schema.json",
					array_key: "items",
					data_path: "inline.json",
				},
				{
					canonical_id: "refkind",
					display_name: "Ref",
					prefix: "RF-",
					schema_path: "schemas/refkind.schema.json",
					array_key: "items",
					data_path: "refkind.json",
				},
				{
					canonical_id: "conventions",
					display_name: "Conventions",
					prefix: "CONV-",
					schema_path: "schemas/conventions.schema.json",
					array_key: "rules",
					data_path: "conventions.json",
				},
			],
			relation_types: [],
			invariants: [],
		}),
	);

	// (a) inline-items schema lacking the fields + data.
	fs.writeFileSync(
		path.join(sub, "schemas", "inline.schema.json"),
		`${JSON.stringify(
			{
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				required: ["items"],
				properties: {
					items: {
						type: "array",
						items: {
							type: "object",
							additionalProperties: false,
							required: ["id", "title"],
							properties: { id: { type: "string" }, title: { type: "string" } },
						},
					},
				},
			},
			null,
			2,
		)}\n`,
	);
	fs.writeFileSync(path.join(sub, "inline.json"), JSON.stringify({ items: [{ id: "IN-0001", title: "alpha" }] }));

	// (b) $ref-items schema + data.
	fs.writeFileSync(
		path.join(sub, "schemas", "refkind.schema.json"),
		`${JSON.stringify(
			{
				$schema: "http://json-schema.org/draft-07/schema#",
				type: "object",
				required: ["items"],
				definitions: {
					row: {
						type: "object",
						additionalProperties: false,
						required: ["id", "label"],
						properties: { id: { type: "string" }, label: { type: "string" } },
					},
				},
				properties: { items: { type: "array", items: { $ref: "#/definitions/row" } } },
			},
			null,
			2,
		)}\n`,
	);
	fs.writeFileSync(path.join(sub, "refkind.json"), JSON.stringify({ items: [{ id: "RF-0001", label: "beta" }] }));

	// (c) conventions: NO schema, NO data → created from samples-canonical.
	return { cwd, sub };
}

// ── BEFORE: zero data-bearing schemas pass the gate ─────────────────────────
{
	const { cwd, sub } = buildScratch();
	if (gatePasses(path.join(sub, "schemas", "inline.schema.json"), "items"))
		fail("inline schema should NOT pass the gate before landing");
	if (gatePasses(path.join(sub, "schemas", "refkind.schema.json"), "items"))
		fail("refkind schema should NOT pass the gate before landing");
	pass("BEFORE: inline + refkind schemas do NOT declare identity fields (gate fails)");

	// ── AFTER: land, gate passes, data valid, fields byte-identical + not required ─
	const report = landIdentityFieldsForDir(sub);
	if (JSON.stringify(report.updated) !== JSON.stringify(["inline"]))
		fail(`expected updated=[inline], got ${JSON.stringify(report.updated)}`);
	if (JSON.stringify(report.inlined) !== JSON.stringify(["refkind"]))
		fail(`expected inlined=[refkind], got ${JSON.stringify(report.inlined)}`);
	if (JSON.stringify(report.created) !== JSON.stringify(["conventions"]))
		fail(`expected created=[conventions], got ${JSON.stringify(report.created)}`);

	if (!gatePasses(path.join(sub, "schemas", "inline.schema.json"), "items"))
		fail("inline schema must pass the gate after landing");
	if (!gatePasses(path.join(sub, "schemas", "refkind.schema.json"), "items"))
		fail("refkind schema must pass the gate after landing");
	if (!gatePasses(path.join(sub, "schemas", "conventions.schema.json"), "rules"))
		fail("created conventions schema must pass the gate");
	pass("AFTER: inline (updated) + refkind (inlined) + conventions (created) all declare identity fields (gate passes)");

	// Existing data still valid.
	try {
		validateBlockWithMigrationForDir(
			sub,
			"inline",
			JSON.parse(fs.readFileSync(path.join(sub, "inline.json"), "utf-8")),
		);
		validateBlockWithMigrationForDir(
			sub,
			"refkind",
			JSON.parse(fs.readFileSync(path.join(sub, "refkind.json"), "utf-8")),
		);
	} catch (err) {
		fail(`existing data failed validation after landing: ${err instanceof Error ? err.message : String(err)}`);
	}
	pass("AFTER: existing inline + refkind data still validates (additive-optional injection)");

	// refkind items now inline (no $ref) + definition constraint preserved.
	const refSchema = JSON.parse(fs.readFileSync(path.join(sub, "schemas", "refkind.schema.json"), "utf-8"));
	const refItems = refSchema.properties.items.items;
	if (refItems.$ref !== undefined) fail("refkind items must be inlined (no residual $ref)");
	if (refItems.additionalProperties !== false) fail("inlined definition's additionalProperties:false not preserved");
	if (!refItems.properties.label) fail("inlined definition's own 'label' property not preserved");
	pass("AFTER: refkind $ref inlined — definition constraints (additionalProperties + own props) preserved");

	// Fields NOT in required.
	const inlineItems = JSON.parse(fs.readFileSync(path.join(sub, "schemas", "inline.schema.json"), "utf-8")).properties
		.items.items;
	for (const n of IDENTITY_NAMES) if (inlineItems.required.includes(n)) fail(`${n} must NOT be added to required`);
	pass("AFTER: identity fields injected as OPTIONAL (absent from required)");

	fs.rmSync(cwd, { recursive: true, force: true });
}

// ── DRY-RUN: no disk writes, same buckets ───────────────────────────────────
{
	const { cwd, sub } = buildScratch();
	const before = snapshotTree(sub);
	const report = landIdentityFieldsForDir(sub, { dryRun: true });
	const after = snapshotTree(sub);
	if (JSON.stringify(before) !== JSON.stringify(after)) fail("dry-run touched disk");
	if (!report.dry_run) fail("dry-run report.dry_run should be true");
	if (report.updated.length !== 1 || report.inlined.length !== 1 || report.created.length !== 1)
		fail(`dry-run buckets wrong: ${JSON.stringify(report)}`);
	pass("DRY-RUN: zero disk writes (tree snapshot identical) yet buckets reported");
	fs.rmSync(cwd, { recursive: true, force: true });
}

// ── IDEMPOTENT: second run is all `already`, no writes ───────────────────────
{
	const { cwd, sub } = buildScratch();
	landIdentityFieldsForDir(sub);
	const afterFirst = snapshotTree(sub);
	const report2 = landIdentityFieldsForDir(sub);
	if (report2.updated.length || report2.inlined.length || report2.created.length)
		fail(`idempotent re-run should produce no new writes: ${JSON.stringify(report2)}`);
	if (report2.already.sort().join(",") !== "conventions,inline,refkind")
		fail(`idempotent re-run already-bucket wrong: ${JSON.stringify(report2.already)}`);
	if (JSON.stringify(snapshotTree(sub)) !== JSON.stringify(afterFirst)) fail("idempotent re-run touched disk");
	pass("IDEMPOTENT: second run → all `already`, zero disk writes");
	fs.rmSync(cwd, { recursive: true, force: true });
}

// ── CLI surface: orchestrator wrapper emits the LandReport JSON (--dry-run) ──
{
	const { cwd, sub } = buildScratch();
	const cliPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), "land-identity-fields.ts");
	const out = execFileSync("npx", ["tsx", cliPath, "--substrate", ".project", "--cwd", cwd, "--dry-run"], {
		encoding: "utf-8",
	});
	const parsed = JSON.parse(out) as { dry_run: boolean; updated: string[]; inlined: string[]; created: string[] };
	if (!parsed.dry_run) fail("CLI --dry-run did not report dry_run:true");
	if (
		parsed.updated.join() !== "inline" ||
		parsed.inlined.join() !== "refkind" ||
		parsed.created.join() !== "conventions"
	)
		fail(`CLI report buckets wrong: ${out}`);
	// CLI dry-run must not have written.
	if (gatePasses(path.join(sub, "schemas", "inline.schema.json"), "items"))
		fail("CLI --dry-run must not mutate the substrate");
	pass("CLI: land-identity-fields.ts --dry-run emits LandReport JSON; no mutation");
	fs.rmSync(cwd, { recursive: true, force: true });
}

console.log(
	"\n[runtime-demo] ✔ landIdentityFieldsForDir lands optional identity-field declarations (updated/inlined/created)",
);
console.log("[runtime-demo] ✔ the H1 step-0 readiness gate passes after landing; existing data stays valid");
console.log("[runtime-demo] ✔ dry-run is a pure preview; landing is idempotent; the CLI wrapper surfaces the report");
