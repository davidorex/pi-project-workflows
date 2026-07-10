/**
 * Tests for the comment-citation scanner (scripts/scan-comment-citations.ts).
 *
 * Synthetic-fixture cells exercise scanFile directly against in-memory TS
 * source strings (JSDoc / line-comment / zero-citation), asserting exact
 * instances/commentKind shape. A live-repo integration cell originally read
 * the on-disk pi-agent-dispatch files that motivated TASK-107 (issue-012's
 * stale-provenance-id investigation) and pinned FEAT-006/TASK-088/DEC-0047/
 * DEC-0014/TASK-091 as present there as a regression pin.
 *
 * TASK-108 (2026-07-10) rewrote all internal-tracker-ID citations in
 * packages/pi-agent-dispatch/src/ (24 files) as plain English — that IS the
 * pin's original citations now being absent from those files, by design, not
 * a scanner defect. A direct grep confirms packages/pi-agent-dispatch/src/
 * now carries zero comment-trivia citation instances (scanRepo's own report
 * over the live tree returns an empty instance array scoped to that
 * package) — the one FEAT-006-looking token still in
 * work-order-loop.ts:251 lives inside a commit-message template-literal
 * string, not a comment, so scanFile correctly does not surface it.
 *
 * The live-repo integration cells below are repointed at citations verified
 * (by direct grep + a real scanRepo run over this repo, 2026-07-10) to still
 * be genuinely present in packages/pi-context/src/ — a package TASK-108 was
 * explicitly scoped to leave untouched — so the cells keep proving the
 * scanner's detection logic against real, current source rather than only
 * synthetic fixtures.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { classifyComment, scanFile, scanRepo } from "./scan-comment-citations.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

describe("classifyComment", () => {
	it("classifies // as line", () => {
		assert.equal(classifyComment("// see DEC-0044"), "line");
	});
	it("classifies /** ... */ as jsdoc", () => {
		assert.equal(classifyComment("/** FEAT-006 */"), "jsdoc");
	});
	it("classifies /* ... */ (non-jsdoc) as block", () => {
		assert.equal(classifyComment("/* plain block */"), "block");
	});
	it("classifies the degenerate empty /**/ as block, not jsdoc", () => {
		assert.equal(classifyComment("/**/"), "block");
	});
});

describe("scanFile — synthetic fixtures", () => {
	it("finds exactly 2 instances in a JSDoc block citing FEAT-006 and TASK-088", () => {
		const src = [
			"/**",
			" * Some function per FEAT-006 north-star loop.",
			" * Schema declared by TASK-088.",
			" */",
			"function f() {}",
			"",
		].join("\n");
		const instances = scanFile("synthetic-jsdoc.ts", src);
		assert.equal(instances.length, 2);
		const ids = instances.map((i) => i.id).sort();
		assert.deepEqual(ids, ["FEAT-006", "TASK-088"]);
		for (const inst of instances) {
			assert.equal(inst.commentKind, "jsdoc");
			assert.equal(inst.file, "synthetic-jsdoc.ts");
		}
	});

	it("finds exactly 1 instance in a line comment citing DEC-0044", () => {
		const src = ["const x = 1; // see DEC-0044 for governance", "", ""].join("\n");
		const instances = scanFile("synthetic-line.ts", src);
		assert.equal(instances.length, 1);
		assert.equal(instances[0].id, "DEC-0044");
		assert.equal(instances[0].commentKind, "line");
		assert.equal(instances[0].line, 1);
	});

	it("finds zero instances in a file with no citations, without crashing", () => {
		const src = [
			"/**",
			" * A perfectly ordinary doc comment with no ids at all.",
			" */",
			"export function noop(): void {",
			"  // nothing to see here",
			"}",
			"",
		].join("\n");
		const instances = scanFile("synthetic-clean.ts", src);
		assert.deepEqual(instances, []);
	});

	it("reports the correct line number for a citation past the first line", () => {
		const src = ["line one", "line two", "// TASK-088 on line three", "line four"].join("\n");
		const instances = scanFile("synthetic-lines.ts", src);
		assert.equal(instances.length, 1);
		assert.equal(instances[0].line, 3);
	});
});

describe("scanRepo — live-repo integration (TASK-108 regression pin)", () => {
	it("finds FGAP-004, FEAT-011, TASK-089, and FGAP-136 in the real pi-context/src/block-api.ts file", () => {
		// block-api.ts is in packages/pi-context, a package TASK-108 explicitly
		// did not touch (it was scoped to pi-agent-dispatch only) — these four
		// ids were confirmed present (grep + a real scanRepo run, 2026-07-10) at
		// the time this cell was written. Repoints the prior pi-agent-dispatch
		// assertion (now false by design post-TASK-108) at a still-genuine
		// live-repo example so this cell keeps proving the scanner's detection
		// logic against real source, not a synthetic-only fixture.
		const rel = "packages/pi-context/src/block-api.ts";
		const abs = path.join(repoRoot, rel);
		const text = fs.readFileSync(abs, "utf-8");
		const instances = scanFile(rel, text);
		const ids = new Set(instances.map((i) => i.id));
		assert.ok(ids.has("FGAP-004"), "expected FGAP-004 among block-api.ts's instances");
		assert.ok(ids.has("FEAT-011"), "expected FEAT-011 among block-api.ts's instances");
		assert.ok(ids.has("TASK-089"), "expected TASK-089 among block-api.ts's instances");
		assert.ok(ids.has("FGAP-136"), "expected FGAP-136 among block-api.ts's instances");
	});

	it("finds TASK-089 across multiple pi-context/src files (not confined to block-api.ts)", () => {
		// Mirrors this cell's prior purpose (proving a full-package scan surfaces
		// an id beyond a single named file) against a still-genuine example:
		// TASK-089 is present in block-api.ts AND in context-sdk.ts and index.ts
		// (confirmed via a real scanRepo run, 2026-07-10).
		const report = scanRepo(repoRoot);
		const files = new Set(
			report.instances
				.filter((i) => i.id === "TASK-089" && i.file.startsWith("packages/pi-context/src/"))
				.map((i) => i.file),
		);
		assert.ok(files.has("packages/pi-context/src/block-api.ts"), "expected TASK-089 in block-api.ts");
		assert.ok(
			files.size > 1,
			`expected TASK-089 in more than one packages/pi-context/src/ file, found: ${[...files].join(", ")}`,
		);
	});

	it("finds zero comment-citation instances under packages/pi-agent-dispatch/src/ (proves TASK-108's cleanup held)", () => {
		// TASK-108 rewrote all internal-tracker-ID citations in
		// packages/pi-agent-dispatch/src/ as plain English. A before/after
		// regression pin in the OTHER direction from this describe block's other
		// cells: asserts the scanner now finds none of the ids TASK-107's
		// original pin named (FEAT-006, TASK-088, DEC-0047, DEC-0014, TASK-091)
		// anywhere under this package's src/ tree.
		const report = scanRepo(repoRoot);
		const adInstances = report.instances.filter((i) => i.file.startsWith("packages/pi-agent-dispatch/src/"));
		assert.deepEqual(
			adInstances,
			[],
			`expected zero comment-citation instances under packages/pi-agent-dispatch/src/, found: ${JSON.stringify(adInstances)}`,
		);
	});
});

describe("scanRepo — full monorepo run", () => {
	it("runs clean over the real repo and produces a well-shaped report", () => {
		const report = scanRepo(repoRoot);
		assert.ok(report.scannedPackages.includes("packages/pi-agent-dispatch"));
		assert.equal(report.totalInstances, report.instances.length);
		assert.equal(report.totalFiles, Object.keys(report.byFile).length);
		for (const [id, count] of Object.entries(report.byId)) {
			assert.equal(report.instances.filter((i) => i.id === id).length, count);
		}
	});
});
