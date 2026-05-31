/**
 * Tests for the samples-catalog discovery surface (FGAP-068 / DEC-0037).
 *
 * The catalog reads the extension's OWN bundled samples/ — it is
 * package-intrinsic (no cwd). These cases pin the live conception:
 *   - structural completeness (16 kinds; 29 relation_types; registries present)
 *   - DEC-0023 live-data guard (every kind has title + description + shape)
 *   - endpoint-participation semantics (wildcard, alias/split, convergence)
 *   - per-kind invariant / lens attachment
 *   - filter + unknown-kind behavior (warning, never throw)
 *   - ADVERSARIAL: the authored source/target_kinds name only real kinds (no
 *     catalog "unknown kind" warnings) and the conception validates against the
 *     (bumped) config.schema.json — guards EDIT-1 + EDIT-2.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { scanForCitationRot } from "./citation-rot-scanner.js";
import { samplesCatalog } from "./samples-catalog.js";
import { validate } from "./schema-validator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = path.resolve(__dirname, "..", "samples");
const FRAMEWORK_CONFIG_SCHEMA = path.resolve(__dirname, "..", "schemas", "config.schema.json");

describe("samplesCatalog", () => {
	it("enumerates all 16 packaged block kinds", () => {
		assert.strictEqual(samplesCatalog().kinds.length, 16);
	});

	it("every kind carries a non-null title and description (DEC-0023 live-data guard)", () => {
		for (const k of samplesCatalog().kinds) {
			assert.notStrictEqual(k.title, null, `kind '${k.canonical_id}' title is null`);
			assert.notStrictEqual(k.description, null, `kind '${k.canonical_id}' description is null`);
		}
	});

	it("every kind has a non-null shape with at least one array key", () => {
		for (const k of samplesCatalog().kinds) {
			assert.notStrictEqual(k.shape, null, `kind '${k.canonical_id}' shape is null`);
			assert.ok((k.shape?.arrayKeys.length ?? 0) >= 1, `kind '${k.canonical_id}' has no array keys`);
		}
	});

	it("exposes the full top-level registries (29 relation_types; lenses/invariants/layers/status_buckets defined)", () => {
		const c = samplesCatalog();
		assert.strictEqual(c.relationTypes.length, 29);
		assert.ok(Array.isArray(c.lenses));
		assert.ok(Array.isArray(c.invariants));
		assert.ok(Array.isArray(c.layers));
		assert.ok(c.status_buckets !== undefined && typeof c.status_buckets === "object");
	});

	it("WILDCARD: verification_verifies_item is as_target for tasks and as_source for verification", () => {
		const c = samplesCatalog();
		const tasks = c.kinds.find((k) => k.canonical_id === "tasks");
		const verification = c.kinds.find((k) => k.canonical_id === "verification");
		assert.ok(tasks, "tasks kind present");
		assert.ok(verification, "verification kind present");
		assert.ok(
			tasks?.relation_types.as_target.some((r) => r.canonical_id === "verification_verifies_item"),
			"tasks should be a verification target via the '*' wildcard",
		);
		assert.ok(
			verification?.relation_types.as_source.some((r) => r.canonical_id === "verification_verifies_item"),
			"verification should be the source of verification_verifies_item",
		);
	});

	it("ALIAS/SPLIT: task_addresses_gap is as_source for tasks AND as_target for framework-gaps", () => {
		const c = samplesCatalog();
		const tasks = c.kinds.find((k) => k.canonical_id === "tasks");
		const gaps = c.kinds.find((k) => k.canonical_id === "framework-gaps");
		assert.ok(tasks?.relation_types.as_source.some((r) => r.canonical_id === "task_addresses_gap"));
		assert.ok(gaps?.relation_types.as_target.some((r) => r.canonical_id === "task_addresses_gap"));
	});

	it("CONVERGENCE: decisions is as_target for the four decision-governing relations", () => {
		const decisions = samplesCatalog().kinds.find((k) => k.canonical_id === "decisions");
		const targets = new Set((decisions?.relation_types.as_target ?? []).map((r) => r.canonical_id));
		for (const id of [
			"gap_addressed_by_decision",
			"feature_governed_by_decision",
			"task_governed_by_decision",
			"rationale_supports_decision",
		]) {
			assert.ok(targets.has(id), `decisions.as_target should include '${id}'`);
		}
	});

	it("INVARIANTS: per-kind invariants attach to their declared block", () => {
		const c = samplesCatalog();
		const tasks = c.kinds.find((k) => k.canonical_id === "tasks");
		const decisions = c.kinds.find((k) => k.canonical_id === "decisions");
		assert.ok(tasks?.invariants.some((inv) => inv.id === "completed-task-has-verification"));
		assert.ok(decisions?.invariants.some((inv) => inv.id === "decision-cites-forcing-artifact"));
	});

	it("LENSES: per-kind lenses attach to their target block", () => {
		const c = samplesCatalog();
		const tasks = c.kinds.find((k) => k.canonical_id === "tasks");
		const gaps = c.kinds.find((k) => k.canonical_id === "framework-gaps");
		assert.ok(tasks?.lenses.some((l) => l.id === "tasks-by-status"));
		assert.ok(gaps?.lenses.some((l) => l.id === "gaps-by-status"));
	});

	it("FILTER: opts.kind narrows kinds[] to the single matching kind", () => {
		const c = samplesCatalog({ kind: "tasks" });
		assert.strictEqual(c.kinds.length, 1);
		assert.strictEqual(c.kinds[0].canonical_id, "tasks");
	});

	it("UNKNOWN: opts.kind with no match returns empty kinds + a warning (never throws)", () => {
		const c = samplesCatalog({ kind: "nope" });
		assert.strictEqual(c.kinds.length, 0);
		assert.ok(c.warnings.some((w) => /unknown kind 'nope'/.test(w)));
	});

	it("ADVERSARIAL: the real conception names no unknown kinds in any source/target_kinds", () => {
		const c = samplesCatalog();
		const unknownKindWarnings = c.warnings.filter((w) => /names unknown kind/.test(w));
		assert.deepStrictEqual(
			unknownKindWarnings,
			[],
			`unexpected unknown-kind warnings: ${unknownKindWarnings.join("; ")}`,
		);
	});

	it("ADVERSARIAL: conception.json validates against the (bumped) config.schema.json", () => {
		const schema = JSON.parse(fs.readFileSync(FRAMEWORK_CONFIG_SCHEMA, "utf-8")) as Record<string, unknown>;
		const conception = JSON.parse(fs.readFileSync(path.join(SAMPLES_DIR, "conception.json"), "utf-8"));
		// validate throws ValidationError on failure; passing means the new
		// source_kinds/target_kinds fields are accepted under additionalProperties:false.
		assert.doesNotThrow(() => validate(schema, conception, "samples/conception.json"));
	});

	it("FGAP-094 / DEC-0041: the packaged conception ships NO substrate-dir default (no 'root' key)", () => {
		// The conception is a template, not an instance. Shipping a concrete root
		// (e.g. '.project') would be a hidden default — DEC-0015 (no default
		// substrate dir) + DEC-0011 (ship-no-defaults). adoptConception sets root
		// at accept-all from the .pi-context.json pointer; resolveContextDir resolves via
		// the pointer when root is absent. Regression guard against re-introduction.
		const conception = JSON.parse(fs.readFileSync(path.join(SAMPLES_DIR, "conception.json"), "utf-8"));
		assert.ok(!("root" in conception), "conception.json must not ship a 'root' key");
		// The catalog projection of the template must not surface a root either.
		assert.ok(!("root" in samplesCatalog()), "samplesCatalog() must not surface a 'root'");
	});

	// FGAP-131 + FGAP-132: rigorous AST + JSON + markdown/YAML scanner replaces
	// the FGAP-130 naive line-by-line CITATION_RE scan (commit 4fd28a6).
	//
	// Scope: scans every monorepo package (pi-context including its legacy
	// registry/ + defaults/ fixtures; pi-workflows; pi-behavior-monitors;
	// pi-agent-dispatch; pi-jit-agents; pi-project-workflows META). Carve-outs
	// (item-level structural id under samples/blocks/ + registry/blocks/ +
	// defaults/blocks/ + .project/; schema pattern + enum string values in
	// *.schema.json; JSDoc + line-comment trivia in .ts files; node_modules +
	// dist + .test.ts files) are coded inside the scanner per its failure-mode
	// contract — the call site here supplies no exclusion list.
	it("citation-rot regression — AST scanner across all monorepo packages (FGAP-131/132)", () => {
		const projectRoot = path.resolve(__dirname, "..", "..", "..");
		const hits = scanForCitationRot({
			projectRoot,
			packageDirs: [
				"packages/pi-context",
				"packages/pi-workflows",
				"packages/pi-behavior-monitors",
				"packages/pi-agent-dispatch",
				"packages/pi-jit-agents",
				"packages/pi-project-workflows",
			],
		});
		assert.deepStrictEqual(
			hits,
			[],
			`citation-rot across monorepo — ${hits.length} hit(s):\n${hits
				.map(
					(h) =>
						`  [${h.surface}] ${path.relative(projectRoot, h.file)}:${h.line}${
							h.path ? ` (${h.path})` : ""
						} :: ${h.matched} (in: ${h.value.slice(0, 120)})`,
				)
				.join("\n")}`,
		);
	});
});
