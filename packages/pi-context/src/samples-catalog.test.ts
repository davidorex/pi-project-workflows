/**
 * Tests for the samples-catalog discovery surface (FGAP-068 / DEC-0037).
 *
 * The catalog reads the extension's OWN bundled samples/ — it is
 * package-intrinsic (no cwd). These cases pin the live conception:
 *   - structural completeness (16 kinds; 28 relation_types; registries present)
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

	it("exposes the full top-level registries (28 relation_types; lenses/invariants/layers/status_buckets defined)", () => {
		const c = samplesCatalog();
		assert.strictEqual(c.relationTypes.length, 28);
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

	it("citation-rot regression — shipped artifacts contain zero pi-project-workflows canonical_id references", () => {
		// Aim: shipped pi-context artifacts (samples/**/*.json description text
		// + user-facing strings in src/index.ts and src/orientation.ts) carry no
		// references to this repo's substrate canonical_ids (FGAP-NNN, DEC-NNNN,
		// FEAT-NNN, TASK-NNN, VER-NNN, REVIEW-NNN, RAT-NNN, CTX-NNN, WO-NNN,
		// STORY-NNN, PLAN-NNN, REQ-NNN, R-NNNN, ISSUE-NNN, PHASE-NNN+). Such ids
		// are meaningful only in pi-project-workflows' own .project/ substrate;
		// downstream consumers cannot resolve them.
		//
		// Exclusions:
		//   - samples/blocks/*.json: seed-data item id fields are STRUCTURAL
		//     (each block's own id like {"id":"FGAP-001"}); whole-file path-suffix
		//     exclude.
		//   - any string-valued property at key 'id': structural ID values, not
		//     citations.
		//   - in source-file text scan: comment-only lines (leading // or *) and
		//     strings containing both 'e.g.' and 'NNN' (ID-format placeholder
		//     illustrations).
		const CITATION_RE =
			/\b(FGAP-\d{3}|DEC-\d{4}|FEAT-\d{3}|TASK-\d{3}|VER-\d{3}|REVIEW-\d+|RAT-\d+|CTX-\d+|WO-\d+|STORY-\d+|PLAN-\d+|REQ-\d+|R-\d{4}|ISSUE-\d+|issue-\d+|PHASE-\d{3,})\b/;

		const walk = (dir: string, acc: string[] = []): string[] => {
			for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
				const full = path.join(dir, entry.name);
				if (entry.isDirectory()) walk(full, acc);
				else if (entry.isFile() && full.endsWith(".json")) acc.push(full);
			}
			return acc;
		};

		// Path-suffix exclude: samples/blocks/*.json carries structural seed-data
		// item IDs as legitimate content.
		const blocksPrefix = path.join(SAMPLES_DIR, "blocks") + path.sep;
		const jsonFiles = walk(SAMPLES_DIR).filter((p) => !p.startsWith(blocksPrefix));

		const samplesHits: Array<{ file: string; jsonPath: string; value: string; matched: string }> = [];

		const visit = (node: unknown, jsonPath: string, file: string, parentKey: string | null) => {
			if (typeof node === "string") {
				// Property name 'id' at any depth: structural ID value (allowed).
				if (parentKey === "id") return;
				const m = node.match(CITATION_RE);
				if (!m) return;
				// ID-format illustration carve-out: a string carrying "e.g." that
				// then names a canonical_id-shaped token is illustrative format
				// documentation, not a citation to a specific substrate item. This
				// preserves the documented PHASE-NNN / WO-NNN pattern in schema
				// description fields. Same shape as the source-file scan exclusion.
				if (node.includes("e.g.") && node.indexOf("e.g.") < (m.index ?? 0)) return;
				samplesHits.push({ file, jsonPath, value: node, matched: m[0] });
				return;
			}
			if (Array.isArray(node)) {
				node.forEach((v, i) => {
					visit(v, `${jsonPath}[${i}]`, file, null);
				});
				return;
			}
			if (node && typeof node === "object") {
				for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
					visit(v, jsonPath ? `${jsonPath}.${k}` : k, file, k);
				}
			}
		};

		for (const f of jsonFiles) {
			const parsed = JSON.parse(fs.readFileSync(f, "utf-8"));
			visit(parsed, "", path.relative(SAMPLES_DIR, f), null);
		}

		assert.deepStrictEqual(
			samplesHits,
			[],
			`citation-rot in shipped samples — ${samplesHits.length} hit(s):\n${samplesHits
				.map((h) => `  ${h.file} :: ${h.jsonPath} :: ${h.matched} (in: ${h.value.slice(0, 120)})`)
				.join("\n")}`,
		);

		// Source-file scan: line-by-line, exclude pure comment lines (leading //
		// or *) and lines whose string content carries both 'e.g.' and 'NNN'
		// (ID-format placeholder illustration).
		const SRC_DIR = path.resolve(__dirname);
		const sourceFiles = [path.join(SRC_DIR, "index.ts"), path.join(SRC_DIR, "orientation.ts")];
		const srcHits: Array<{ file: string; line: number; text: string; matched: string }> = [];
		for (const f of sourceFiles) {
			const lines = fs.readFileSync(f, "utf-8").split("\n");
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				const trimmed = line.trimStart();
				if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
				if (line.includes("e.g.") && line.includes("NNN")) continue;
				const m = line.match(CITATION_RE);
				if (m) srcHits.push({ file: path.basename(f), line: i + 1, text: line.trim(), matched: m[0] });
			}
		}

		assert.deepStrictEqual(
			srcHits,
			[],
			`citation-rot in user-facing source strings — ${srcHits.length} hit(s):\n${srcHits
				.map((h) => `  ${h.file}:${h.line} :: ${h.matched} :: ${h.text.slice(0, 160)}`)
				.join("\n")}`,
		);
	});
});
