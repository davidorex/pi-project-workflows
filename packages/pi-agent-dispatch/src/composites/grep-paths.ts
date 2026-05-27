/**
 * grep-paths composite KIND — bounded recursive grep confined to allowed_roots.
 *
 * Instance scope (allowed_roots[]) is registration-fixed; per-call args carry
 * pattern + optional glob (passed to grep as --include). Refusal-by-throw on
 * empty allowed_roots (canon — empty grant ≠ unrestricted). grep exit codes:
 * 0 = matches found, 1 = no matches, 2 = error. We surface 0/1 as success
 * (with empty hits on 1) and throw on 2.
 */

import { spawnSync } from "node:child_process";
import { Type } from "@earendil-works/pi-ai";

export interface GrepPathsInstance {
	allowed_roots: string[];
}

export interface GrepPathsArgs {
	pattern: string;
	glob?: string;
}

export interface GrepPathsResult {
	hits: string;
}

export const grepPathsArgsSchema = Type.Object({
	pattern: Type.String({ description: "grep pattern (BRE)." }),
	glob: Type.Optional(Type.String({ description: "--include glob (e.g. '*.ts')." })),
});

export function runGrepPaths(cwd: string, instance: GrepPathsInstance, args: GrepPathsArgs): GrepPathsResult {
	if (!instance?.allowed_roots || instance.allowed_roots.length === 0) {
		throw new Error("grep-paths: instance.allowed_roots is required and must be non-empty.");
	}
	if (!args?.pattern) {
		throw new Error("grep-paths: args.pattern is required.");
	}

	const cmdArgs = ["-rn"];
	if (args.glob) cmdArgs.push(`--include=${args.glob}`);
	cmdArgs.push(args.pattern);
	cmdArgs.push(...instance.allowed_roots);

	const result = spawnSync("grep", cmdArgs, { cwd, encoding: "utf-8" });
	if (result.status === 2) {
		throw new Error(`grep-paths: grep exited 2 (error): ${result.stderr}`);
	}
	return { hits: result.stdout };
}
