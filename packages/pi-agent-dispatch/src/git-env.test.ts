/**
 * git-env regression tests — proves cleanGitEnv() scrubs the repo-redirecting
 * GIT_* family so a child git determines its target repo from cwd alone, even
 * when the parent process inherited an outer repo's GIT_DIR / GIT_INDEX_FILE
 * (the husky-pre-commit hook-leak scenario).
 *
 * The isolation case exercises the real attestedCommit() path against two
 * distinct tmp repos: with foreign GIT_DIR/GIT_INDEX_FILE injected into
 * process.env, the commit must land in the TARGET (selected by cwd) and NOT
 * in the FOREIGN repo. beforeEach/afterEach snapshot+restore process.env so
 * the injected GIT_* never leak to sibling test files in the same process.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { cleanGitEnv } from "@davidorex/pi-context/git-env";
import { attestedCommit } from "./attested-commit.js";

function makeRepo(prefix: string): string {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	spawnSync("git", ["init", "-q"], { cwd: dir, encoding: "utf-8", env: cleanGitEnv() });
	spawnSync("git", ["config", "user.email", "iso@example.com"], { cwd: dir, encoding: "utf-8", env: cleanGitEnv() });
	spawnSync("git", ["config", "user.name", "Iso"], { cwd: dir, encoding: "utf-8", env: cleanGitEnv() });
	spawnSync("git", ["config", "commit.gpgsign", "false"], { cwd: dir, encoding: "utf-8", env: cleanGitEnv() });
	return dir;
}

function gitLog(dir: string): string {
	const out = spawnSync("git", ["log", "--format=%s"], { cwd: dir, encoding: "utf-8", env: cleanGitEnv() });
	return out.stdout ?? "";
}

describe("cleanGitEnv", () => {
	let snapshot: NodeJS.ProcessEnv;

	beforeEach(() => {
		snapshot = { ...process.env };
	});

	afterEach(() => {
		// delete keys not present in the snapshot, then re-apply the snapshot —
		// so any GIT_* injected during a test never leaks to sibling test files.
		for (const key of Object.keys(process.env)) {
			if (!(key in snapshot)) delete process.env[key];
		}
		for (const [key, value] of Object.entries(snapshot)) {
			if (value !== undefined) process.env[key] = value;
		}
	});

	it("scrubs repo-redirecting GIT_* while preserving PATH", () => {
		process.env.GIT_DIR = "/some/foreign/.git";
		process.env.GIT_INDEX_FILE = "/some/foreign/.git/index";

		const env = cleanGitEnv();
		assert.equal(env.GIT_DIR, undefined);
		assert.equal(env.GIT_INDEX_FILE, undefined);
		assert.equal(env.PATH, process.env.PATH);
	});

	it("isolation: injected foreign GIT_DIR/GIT_INDEX_FILE do not redirect attestedCommit away from cwd-selected target", async () => {
		const foreign = makeRepo("git-env-foreign-");
		const target = makeRepo("git-env-target-");

		writeFileSync(join(target, "iso.txt"), "iso\n");

		// Simulate the hook leak: parent process carries the FOREIGN repo's
		// GIT_DIR / GIT_INDEX_FILE. A naive child git would write there.
		process.env.GIT_DIR = join(foreign, ".git");
		process.env.GIT_INDEX_FILE = join(foreign, ".git", "index");

		const result = await attestedCommit(target, {
			files: ["iso.txt"],
			message: "iso",
			agent_id: "tester",
		});

		assert.equal(result.committed, true, `expected committed; stderr=${result.stderr} stdout=${result.stdout}`);
		assert.ok(result.commit_sha, "expected commit_sha captured");

		assert.ok(gitLog(target).includes("iso"), "TARGET repo must contain the 'iso' commit");
		assert.ok(!gitLog(foreign).includes("iso"), "FOREIGN repo must NOT contain the 'iso' commit");
	});
});
