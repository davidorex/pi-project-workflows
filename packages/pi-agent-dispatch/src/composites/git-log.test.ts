import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runGitLog } from "./git-log.js";

function makeRepo(): string {
	const dir = mkdtempSync(join(tmpdir(), "git-log-"));
	spawnSync("git", ["init", "-q"], { cwd: dir, encoding: "utf-8" });
	spawnSync("git", ["config", "user.email", "t@example.com"], { cwd: dir, encoding: "utf-8" });
	spawnSync("git", ["config", "user.name", "Tester"], { cwd: dir, encoding: "utf-8" });
	spawnSync("git", ["config", "commit.gpgsign", "false"], { cwd: dir, encoding: "utf-8" });
	return dir;
}

function commit(dir: string, file: string, content: string, msg: string): void {
	writeFileSync(join(dir, file), content);
	spawnSync("git", ["add", file], { cwd: dir });
	spawnSync("git", ["commit", "-m", msg, "--no-verify"], { cwd: dir, encoding: "utf-8" });
}

describe("runGitLog", () => {
	it("happy path: returns commits in newest-first order with sha + author + date + message", () => {
		const dir = makeRepo();
		commit(dir, "a.txt", "a\n", "first commit");
		commit(dir, "b.txt", "b\n", "second commit");
		const result = runGitLog(dir, {}, {});
		assert.equal(result.commits.length, 2);
		assert.equal(result.commits[0].message, "second commit");
		assert.equal(result.commits[1].message, "first commit");
		assert.equal(result.commits[0].author, "Tester");
		assert.match(result.commits[0].sha, /^[0-9a-f]{40}$/);
	});

	it("limit arg caps return count", () => {
		const dir = makeRepo();
		commit(dir, "a.txt", "a\n", "one");
		commit(dir, "b.txt", "b\n", "two");
		commit(dir, "c.txt", "c\n", "three");
		const result = runGitLog(dir, {}, { limit: 2 });
		assert.equal(result.commits.length, 2);
	});

	it("throws on non-git cwd", () => {
		const dir = mkdtempSync(join(tmpdir(), "git-log-no-init-"));
		assert.throws(() => runGitLog(dir, {}, {}), /git-log: git exited/);
	});
});
