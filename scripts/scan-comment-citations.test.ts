/**
 * Tests for the comment-citation scanner (scripts/scan-comment-citations.ts).
 *
 * Synthetic-fixture cells exercise scanFile directly against in-memory TS
 * source strings (JSDoc / line-comment / zero-citation), asserting exact
 * instances/commentKind shape.
 *
 * The scanRepo cells (directory-walk + aggregation across a full tree) were
 * originally pinned against real, on-disk files:
 *   - TASK-107's original cells read packages/pi-agent-dispatch/src/, pinning
 *     FEAT-006/TASK-088/DEC-0047/DEC-0014/TASK-091 as present there.
 *   - TASK-108 (2026-07-10) rewrote all internal-tracker-ID citations in that
 *     package's src/ (24 files) as plain English, making that pin's citations
 *     absent by design — a scanner-external event, not a scanner defect.
 *   - The cells were then repointed at packages/pi-context/src/ citations
 *     (FGAP-004/FEAT-011/TASK-089/FGAP-136), a package TASK-108 was scoped to
 *     leave untouched, to keep proving scanRepo against real source.
 *
 * TASK-109 converts the scanRepo cells to synthetic in-memory fixtures (temp
 * packages/<pkg>/src/ trees built by makeTempRepo(), mirroring the scanFile
 * synthetic-fixture cells' style below), because pi-context's own comment
 * citations are named as the target of an upcoming de-jargoning task — the
 * same failure mode that broke the TASK-107 pin during TASK-108 would
 * otherwise repeat here once that task lands. The cells still exercise
 * scanRepo's real directory-walk + aggregation logic (multi-file citation
 * discovery, byId/byFile/instances shape, node_modules/dist/*.test.ts
 * exclusion) — only the source content is synthetic, so no cell depends on
 * any specific real file's citations continuing to exist.
 *
 * The "scanRepo — full monorepo run" describe block below is unaffected: its
 * assertions are structural invariants (report shape, count reconciliation)
 * that hold regardless of which citations are actually present, so it is left
 * running against the real repo.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { classifyComment, scanFile, scanRepo } from "./scan-comment-citations.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

/**
 * Build a synthetic package tree under a fresh temp directory, shaped like
 * packages/<pkgName>/src/<relPath>, and return the temp dir's path for use as
 * scanRepo's repoRoot argument. `pkgFiles` maps "pkgName/relPath.ts" (or a
 * deeper "pkgName/sub/dir/relPath.ts") -> file content. Lets the scanRepo
 * cells below exercise the real directory-walk + aggregation logic without
 * depending on any real repo file's content remaining unchanged.
 */
function makeTempRepo(pkgFiles: Record<string, string>): string {
	const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "scan-comment-citations-test-"));
	for (const [relKey, content] of Object.entries(pkgFiles)) {
		const [pkgName, ...restParts] = relKey.split("/");
		const full = path.join(repoDir, "packages", pkgName, "src", ...restParts);
		fs.mkdirSync(path.dirname(full), { recursive: true });
		fs.writeFileSync(full, content, "utf-8");
	}
	return repoDir;
}

/** Recursively remove a temp repo tree built by makeTempRepo(). */
function removeTempRepo(repoDir: string): void {
	fs.rmSync(repoDir, { recursive: true, force: true });
}

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

describe("scanRepo — synthetic fixtures (directory-walk + aggregation)", () => {
	it("walks a synthetic package's src/ tree via the full scanRepo entry point and finds the citations scanFile itself would find", () => {
		const src = [
			"/**",
			" * Some function per FGAP-901 remediation.",
			" * Schema declared by FEAT-902.",
			" */",
			"function f() {}",
			"const g = 1; // see TASK-903 for follow-up",
			"",
		].join("\n");
		const repoDir = makeTempRepo({ "pkg-a/thing.ts": src });
		try {
			const report = scanRepo(repoDir);
			const rel = "packages/pkg-a/src/thing.ts";
			const ids = new Set(report.instances.filter((i) => i.file === rel).map((i) => i.id));
			assert.ok(ids.has("FGAP-901"), "expected FGAP-901 among thing.ts's instances");
			assert.ok(ids.has("FEAT-902"), "expected FEAT-902 among thing.ts's instances");
			assert.ok(ids.has("TASK-903"), "expected TASK-903 among thing.ts's instances");
		} finally {
			removeTempRepo(repoDir);
		}
	});

	it("finds a repeated id across multiple files within a synthetic package and aggregates it into byId/instances", () => {
		const repoDir = makeTempRepo({
			"pkg-b/one.ts": "// cross-referenced by TASK-903 in one.ts\nexport const a = 1;\n",
			"pkg-b/two.ts": "/** Also touches TASK-903, from two.ts. */\nexport const b = 2;\n",
		});
		try {
			const report = scanRepo(repoDir);
			const files = new Set(
				report.instances
					.filter((i) => i.id === "TASK-903" && i.file.startsWith("packages/pkg-b/src/"))
					.map((i) => i.file),
			);
			assert.ok(files.has("packages/pkg-b/src/one.ts"), "expected TASK-903 in one.ts");
			assert.ok(files.has("packages/pkg-b/src/two.ts"), "expected TASK-903 in two.ts");
			assert.equal(files.size, 2, `expected TASK-903 in exactly 2 files, found: ${[...files].join(", ")}`);
			assert.equal(report.byId["TASK-903"], 2);
		} finally {
			removeTempRepo(repoDir);
		}
	});

	it("excludes node_modules/, dist/, and *.test.ts files from the walk while still finding citations in a sibling real source file", () => {
		const repoDir = makeTempRepo({
			"pkg-c/good.ts": "// genuine citation FGAP-901 in a real source file\nexport const ok = true;\n",
			"pkg-c/node_modules/vendored/foo.ts": "// FGAP-901 inside node_modules — must not be scanned\n",
			"pkg-c/dist/bar.ts": "// FGAP-901 inside dist — must not be scanned\n",
			"pkg-c/thing.test.ts": "// FGAP-901 inside a *.test.ts file — must not be scanned\n",
		});
		try {
			const report = scanRepo(repoDir);
			const pkgCFiles = report.instances.filter((i) => i.file.startsWith("packages/pkg-c/src/")).map((i) => i.file);
			assert.deepEqual(
				pkgCFiles,
				["packages/pkg-c/src/good.ts"],
				`expected only good.ts to be scanned, found: ${JSON.stringify(pkgCFiles)}`,
			);
		} finally {
			removeTempRepo(repoDir);
		}
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
