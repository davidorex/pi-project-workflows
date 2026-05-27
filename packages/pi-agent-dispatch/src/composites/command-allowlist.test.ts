import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runCommandAllowlist } from "./command-allowlist.js";

function makeTmpRoot(): string {
	return mkdtempSync(join(tmpdir(), "cmd-allowlist-"));
}

describe("runCommandAllowlist", () => {
	it("happy path: runs allowed command + returns exit_code/stdout/duration_ms", () => {
		const dir = makeTmpRoot();
		const result = runCommandAllowlist(dir, { allowed_commands: ["echo"] }, { command: "echo", args: ["hi"] });
		assert.equal(result.exit_code, 0);
		assert.match(result.stdout, /hi/);
		assert.ok(result.duration_ms >= 0);
	});

	it("refuses command not in allowlist", () => {
		const dir = makeTmpRoot();
		assert.throws(
			() => runCommandAllowlist(dir, { allowed_commands: ["echo"] }, { command: "rm", args: ["-rf", "/"] }),
			/not in allowlist/,
		);
	});

	it("throws on empty allowed_commands", () => {
		const dir = makeTmpRoot();
		assert.throws(
			() => runCommandAllowlist(dir, { allowed_commands: [] }, { command: "echo" }),
			/allowed_commands is required/,
		);
	});
});
