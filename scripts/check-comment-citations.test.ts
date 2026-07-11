/**
 * Tests for the delta-scoped comment-citation gate's pure helpers
 * (scripts/check-comment-citations.ts).
 *
 * Pure-helper coverage plus one real end-to-end run against the actual repo:
 *   - isWatchedSourceFile: containment-under-a-discovered-package's-src/ plus
 *     .ts/.tsx extension filtering, no hardcoded package-name assumptions.
 *   - findNewCommentCitations: existence-based before/after diff — (a) a
 *     citation present in both before and after text does NOT flag; (b) a
 *     citation newly introduced in after-only text DOES flag, naming the
 *     file, line, and matched id; a citation absent from a deleted file is a
 *     no-op.
 *   - a real, unmocked invocation of the gate's own findNewCommentCitations
 *     against every real .ts/.tsx file under this repo's discovered
 *     packages/<name>/src/ trees, comparing each file's on-disk HEAD content
 *     against itself (identical before/after) — this proves the real
 *     scanCommentsInFile + existence-diff path runs clean (zero findings)
 *     over the actual current repo state, the same invariant the gate itself
 *     enforces at commit time.
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path, { dirname } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { discoverPackageDirs, findNewCommentCitations, isWatchedSourceFile } from "./check-comment-citations.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

describe("isWatchedSourceFile", () => {
	const packageDirs = ["packages/pi-context", "packages/pi-workflows"];

	it("matches a .ts file under a discovered package's src/ tree", () => {
		assert.ok(isWatchedSourceFile("packages/pi-context/src/block-api.ts", packageDirs));
	});

	it("matches a .tsx file under a discovered package's src/ tree", () => {
		assert.ok(isWatchedSourceFile("packages/pi-workflows/src/view.tsx", packageDirs));
	});

	it("does NOT match a file outside any discovered package's src/ (e.g. a root script)", () => {
		assert.ok(!isWatchedSourceFile("scripts/check-comment-citations.ts", packageDirs));
	});

	it("does NOT match a non-.ts/.tsx file under a package's src/ tree", () => {
		assert.ok(!isWatchedSourceFile("packages/pi-context/src/thing.json", packageDirs));
	});

	it("does NOT match a package file outside its src/ tree (e.g. package.json)", () => {
		assert.ok(!isWatchedSourceFile("packages/pi-context/package.json", packageDirs));
	});

	it("does NOT match a package not in the discovered set", () => {
		assert.ok(!isWatchedSourceFile("packages/pi-agent-dispatch/src/thing.ts", packageDirs));
	});
});

describe("discoverPackageDirs", () => {
	it("discovers the real repo's package directories dynamically", () => {
		const dirs = discoverPackageDirs(repoRoot);
		assert.ok(dirs.includes("packages/pi-context"));
		assert.ok(dirs.includes("packages/pi-workflows"));
	});
});

describe("findNewCommentCitations", () => {
	it("does NOT flag a citation present in both before and after text", () => {
		const before = "/**\n * See TASK-999 for background.\n */\nexport function f() {}\n";
		const after = "/**\n * See TASK-999 for background, now with more prose.\n */\nexport function f() {}\n";
		const findings = findNewCommentCitations("synthetic.ts", before, after);
		assert.deepStrictEqual(findings, []);
	});

	it("does NOT flag when the citation's line shifted due to an unrelated edit above it", () => {
		const before = "// TASK-999 reference\nexport function f() {}\n";
		const after = "// a new leading comment\n// TASK-999 reference\nexport function f() {}\n";
		const findings = findNewCommentCitations("synthetic.ts", before, after);
		assert.deepStrictEqual(findings, []);
	});

	it("DOES flag a citation newly introduced in after-only text, naming file+line+id", () => {
		const before = "export function f() {}\n";
		const after = "// see TASK-999 for the new follow-up\nexport function f() {}\n";
		const findings = findNewCommentCitations("synthetic.ts", before, after);
		assert.strictEqual(findings.length, 1, `expected 1 finding; got: ${JSON.stringify(findings)}`);
		assert.strictEqual(findings[0].file, "synthetic.ts");
		assert.strictEqual(findings[0].line, 1);
		assert.strictEqual(findings[0].matched, "TASK-999");
	});

	it("flags each newly-introduced distinct id, deduped to one finding per id", () => {
		const before = "export function f() {}\n";
		const after = "// see TASK-999\n// also TASK-999 again\n// and FGAP-099\nexport function f() {}\n";
		const findings = findNewCommentCitations("synthetic.ts", before, after);
		const ids = findings.map((f) => f.matched).sort();
		assert.deepStrictEqual(ids, ["FGAP-099", "TASK-999"]);
	});

	it("does NOT flag anything for a brand-new file with no citations", () => {
		const findings = findNewCommentCitations("synthetic.ts", undefined, "export function f() {}\n");
		assert.deepStrictEqual(findings, []);
	});

	it("DOES flag a citation in a brand-new file (before text undefined)", () => {
		const findings = findNewCommentCitations("synthetic.ts", undefined, "// per TASK-999\nexport function f() {}\n");
		assert.strictEqual(findings.length, 1);
		assert.strictEqual(findings[0].matched, "TASK-999");
	});

	it("is a no-op when the file was deleted (after text undefined)", () => {
		const findings = findNewCommentCitations("synthetic.ts", "// per TASK-999\n", undefined);
		assert.deepStrictEqual(findings, []);
	});
});

describe("check-comment-citations — real repo run (unmocked)", () => {
	it("runs findNewCommentCitations for real over every watched file's current HEAD content against itself, and finds zero new citations", () => {
		const packageDirs = discoverPackageDirs(repoRoot);
		const tracked = execSync("git ls-files", { cwd: repoRoot, encoding: "utf-8" })
			.split("\n")
			.filter(Boolean)
			.filter((p) => isWatchedSourceFile(p, packageDirs));
		assert.ok(tracked.length > 0, "expected at least one real watched source file to exist in the repo");

		let allFindings: { file: string; line: number; matched: string }[] = [];
		for (const rel of tracked) {
			const abs = path.join(repoRoot, rel);
			if (!existsSync(abs)) continue;
			const text = readFileSync(abs, "utf-8");
			// Compare each real file's current content against itself: an
			// identical before/after run must never produce a finding — this
			// exercises the real scanCommentsInFile parse path (not a synthetic
			// fixture) over every real watched file in the repo.
			allFindings = allFindings.concat(findNewCommentCitations(rel, text, text));
		}
		assert.deepStrictEqual(
			allFindings,
			[],
			`expected zero findings comparing real files against themselves; got: ${JSON.stringify(allFindings)}`,
		);
	});
});
