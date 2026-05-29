import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { attestedCommit, CommitAttestedRefusedError } from "./attested-commit.js";

function makeRepo(): string {
	const dir = mkdtempSync(join(tmpdir(), "attested-commit-"));
	const init = spawnSync("git", ["init", "-q"], { cwd: dir, encoding: "utf-8" });
	assert.equal(init.status, 0, `git init failed: ${init.stderr}`);
	spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: dir, encoding: "utf-8" });
	spawnSync("git", ["config", "user.name", "Test"], { cwd: dir, encoding: "utf-8" });
	spawnSync("git", ["config", "commit.gpgsign", "false"], { cwd: dir, encoding: "utf-8" });
	return dir;
}

describe("attestedCommit", () => {
	it("missing agent_id throws CommitAttestedRefusedError naming the Attested-by footer concern", async () => {
		const dir = makeRepo();
		await assert.rejects(
			attestedCommit(dir, { files: ["file.txt"], message: "msg", agent_id: "" }),
			(err: Error) =>
				err instanceof CommitAttestedRefusedError &&
				/agent_id is required/.test(err.message) &&
				/Attested-by/.test(err.message),
		);
	});

	it("missing files throws", async () => {
		const dir = makeRepo();
		await assert.rejects(
			attestedCommit(dir, { files: [], message: "msg", agent_id: "a" }),
			(err: Error) => err instanceof CommitAttestedRefusedError && /files\[\] is required/.test(err.message),
		);
	});

	it("missing message throws", async () => {
		const dir = makeRepo();
		await assert.rejects(
			attestedCommit(dir, { files: ["x"], message: "   ", agent_id: "a" }),
			(err: Error) => err instanceof CommitAttestedRefusedError && /message is required/.test(err.message),
		);
	});

	it("happy path: writes file in tmp git repo + commits + commit_sha captured + footer present", async () => {
		const dir = makeRepo();
		const filePath = join(dir, "hello.txt");
		writeFileSync(filePath, "hello-attested\n");

		const result = await attestedCommit(dir, {
			files: ["hello.txt"],
			message: "feat: hello",
			agent_id: "spec-impl-001",
			work_order_id: "WO-042",
		});

		assert.equal(result.committed, true, `expected committed; stderr=${result.stderr} stdout=${result.stdout}`);
		assert.ok(result.commit_sha, "expected commit_sha captured");
		const sha = spawnSync("git", ["log", "-1", "--format=%h"], { cwd: dir, encoding: "utf-8" });
		assert.equal(result.commit_sha, sha.stdout.trim());

		const body = spawnSync("git", ["log", "-1", "--format=%B"], { cwd: dir, encoding: "utf-8" });
		assert.ok(body.stdout.includes("Attested-by: agent/spec-impl-001"), `body=${body.stdout}`);
		assert.ok(body.stdout.includes("Work-order: WO-042"), `body=${body.stdout}`);
	});

	it("husky-style hook fail path: committed=false + exit_code captured + stderr preserved", async () => {
		const dir = makeRepo();
		const filePath = join(dir, "blocked.txt");
		writeFileSync(filePath, "content\n");
		// install a pre-commit hook that always fails
		const hookPath = join(dir, ".git", "hooks", "pre-commit");
		writeFileSync(hookPath, "#!/bin/sh\necho HOOK_FAILED_MARKER 1>&2\nexit 1\n", { mode: 0o755 });

		const result = await attestedCommit(dir, {
			files: ["blocked.txt"],
			message: "feat: blocked",
			agent_id: "spec-impl-002",
		});

		assert.equal(result.committed, false);
		assert.notEqual(result.exit_code, 0);
		const combined = `${result.stdout}${result.stderr}`;
		assert.ok(combined.includes("HOOK_FAILED_MARKER"), `expected hook stderr preserved; combined=${combined}`);
	});
});
