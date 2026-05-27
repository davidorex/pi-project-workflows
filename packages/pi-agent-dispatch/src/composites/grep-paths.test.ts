import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runGrepPaths } from "./grep-paths.js";

function makeTmpRoot(): string {
	return mkdtempSync(join(tmpdir(), "grep-paths-"));
}

describe("runGrepPaths", () => {
	it("happy path: returns matching lines from allowed_roots", () => {
		const dir = makeTmpRoot();
		mkdirSync(join(dir, "src"), { recursive: true });
		writeFileSync(join(dir, "src", "a.ts"), "needle here\nother line\n");
		writeFileSync(join(dir, "src", "b.ts"), "no match\n");
		const result = runGrepPaths(dir, { allowed_roots: ["src"] }, { pattern: "needle" });
		assert.match(result.hits, /needle here/);
		assert.doesNotMatch(result.hits, /no match/);
	});

	it("empty hits on no matches (grep exit 1)", () => {
		const dir = makeTmpRoot();
		mkdirSync(join(dir, "src"), { recursive: true });
		writeFileSync(join(dir, "src", "a.ts"), "nothing here\n");
		const result = runGrepPaths(dir, { allowed_roots: ["src"] }, { pattern: "zzz-not-present" });
		assert.equal(result.hits, "");
	});

	it("throws on empty allowed_roots", () => {
		const dir = makeTmpRoot();
		assert.throws(
			() => runGrepPaths(dir, { allowed_roots: [] }, { pattern: "x" }),
			/allowed_roots is required/,
		);
	});
});
