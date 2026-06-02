/**
 * git-log composite KIND — bounded git history read.
 *
 * Instance scope (paths[] / since) is fixed at registration time;
 * per-call args carry only limit. Wraps `git log --format=%H%x00%an%x00%aI%x00%s`
 * (null-byte field separator avoids parsing ambiguity on subjects containing
 * whitespace) and returns a structured commit list. Non-zero git exit
 * throws — refusal-by-throw parity with other KINDs.
 */

import { spawnSync } from "node:child_process";
import { cleanGitEnv } from "@davidorex/pi-context/git-env";
import { Type } from "@earendil-works/pi-ai";

export interface GitLogInstance {
	paths?: string[];
	since?: string;
}

export interface GitLogArgs {
	limit?: number;
}

export interface GitLogCommit {
	sha: string;
	author: string;
	date: string;
	message: string;
}

export interface GitLogResult {
	commits: GitLogCommit[];
}

export const gitLogArgsSchema = Type.Object({
	limit: Type.Optional(Type.Number({ description: "Maximum commits to return." })),
});

export function runGitLog(cwd: string, instance: GitLogInstance, args: GitLogArgs): GitLogResult {
	const cmdArgs = ["log", "--format=%H%x00%an%x00%aI%x00%s"];
	if (instance?.since) cmdArgs.push(`--since=${instance.since}`);
	if (args?.limit !== undefined) cmdArgs.push(`-${args.limit}`);
	if (instance?.paths && instance.paths.length > 0) {
		cmdArgs.push("--");
		cmdArgs.push(...instance.paths);
	}

	const result = spawnSync("git", cmdArgs, { cwd, encoding: "utf-8", env: cleanGitEnv() });
	if (result.status !== 0) {
		throw new Error(`git-log: git exited ${result.status}: ${result.stderr}`);
	}

	const commits: GitLogCommit[] = result.stdout
		.split("\n")
		.filter((line) => line.length > 0)
		.map((line) => {
			const [sha, author, date, message] = line.split("\x00");
			return { sha, author, date, message };
		});
	return { commits };
}
