/**
 * attested-commit — stage declared files + invoke `git commit` with a
 * DispatchContext-style attestation footer encoding writer.kind=agent
 * per DEC-0047. The husky pre-commit hook (`npm run check && npm test`)
 * runs as the backup gate; never bypass via --no-verify. The primary
 * gate is run-real-checks (TASK-090) called BEFORE this tool.
 *
 * Refusal gates fire before any git op: missing agent_id, empty files
 * array, or empty message throws CommitAttestedRefusedError. Stages
 * files one-by-one (`git add <file>` per call) to avoid the canon-
 * violating `git add -A` / `git add .` shape. On commit, captures
 * exit_code + stdout + stderr; when committed, captures the short SHA
 * via `git log -1 --format=%h`.
 */

import { spawnSync } from "node:child_process";
import { cleanGitEnv } from "@davidorex/pi-context/git-env";

export interface AttestedCommitOptions {
	files: string[];
	message: string;
	agent_id: string;
	work_order_id?: string;
}

export interface AttestedCommitResult {
	committed: boolean;
	commit_sha?: string;
	exit_code: number;
	stdout: string;
	stderr: string;
}

export class CommitAttestedRefusedError extends Error {
	constructor(reason: string) {
		super(`commit-attested: ${reason}`);
		this.name = "CommitAttestedRefusedError";
	}
}

function composeMessage(message: string, agent_id: string, work_order_id?: string): string {
	const lines = [message.trimEnd(), "", `Attested-by: agent/${agent_id}`];
	if (work_order_id) lines.push(`Work-order: ${work_order_id}`);
	return `${lines.join("\n")}\n`;
}

export async function attestedCommit(cwd: string, options: AttestedCommitOptions): Promise<AttestedCommitResult> {
	if (!options.agent_id || options.agent_id.trim() === "") {
		throw new CommitAttestedRefusedError(
			"agent_id is required to construct the 'Attested-by: agent/<id>' commit footer",
		);
	}
	if (!options.files || options.files.length === 0) {
		throw new CommitAttestedRefusedError("files[] is required (at least one staged file)");
	}
	if (!options.message || options.message.trim() === "") {
		throw new CommitAttestedRefusedError("message is required");
	}

	// per-file `git add` — never `git add -A` / `git add .` per canon
	for (const file of options.files) {
		const addResult = spawnSync("git", ["add", file], { cwd, encoding: "utf-8", env: cleanGitEnv() });
		if (addResult.status !== 0) {
			throw new CommitAttestedRefusedError(
				`git add '${file}' failed (exit ${addResult.status}): ${addResult.stderr || addResult.stdout}`,
			);
		}
	}

	const composed = composeMessage(options.message, options.agent_id, options.work_order_id);
	const commitResult = spawnSync("git", ["commit", "-m", composed], { cwd, encoding: "utf-8", env: cleanGitEnv() });
	const exit_code = commitResult.status ?? 1;
	const stdout = commitResult.stdout ?? "";
	const stderr = commitResult.stderr ?? "";
	const committed = exit_code === 0;

	let commit_sha: string | undefined;
	if (committed) {
		const shaResult = spawnSync("git", ["log", "-1", "--format=%h"], { cwd, encoding: "utf-8", env: cleanGitEnv() });
		if (shaResult.status === 0) {
			commit_sha = (shaResult.stdout ?? "").trim() || undefined;
		}
	}

	return { committed, commit_sha, exit_code, stdout, stderr };
}
