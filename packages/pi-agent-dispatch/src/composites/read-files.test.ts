import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runReadFiles } from "./read-files.js";

function makeTmpRoot(): string {
	return mkdtempSync(join(tmpdir(), "read-files-"));
}

describe("runReadFiles", () => {
	it("happy path: reads file within allowed_roots", () => {
		const dir = makeTmpRoot();
		mkdirSync(join(dir, "src"), { recursive: true });
		writeFileSync(join(dir, "src", "a.txt"), "hello\n");
		const result = runReadFiles(dir, { allowed_roots: ["src"] }, { path: "src/a.txt" });
		assert.equal(result.content, "hello\n");
	});

	it("refuses path outside allowed_roots", () => {
		const dir = makeTmpRoot();
		mkdirSync(join(dir, "src"), { recursive: true });
		mkdirSync(join(dir, "secret"), { recursive: true });
		writeFileSync(join(dir, "secret", "s.txt"), "secret-data\n");
		assert.throws(
			() => runReadFiles(dir, { allowed_roots: ["src"] }, { path: "secret/s.txt" }),
			/outside allowed_roots/,
		);
	});

	it("throws on empty allowed_roots", () => {
		const dir = makeTmpRoot();
		assert.throws(() => runReadFiles(dir, { allowed_roots: [] }, { path: "x.txt" }), /allowed_roots is required/);
	});
});
