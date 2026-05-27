/**
 * command-allowlist composite KIND — execute commands restricted to a
 * registration-fixed allowlist.
 *
 * Instance scope (allowed_commands[]) is fixed at registration; per-call
 * args carry the command name + args. Refuses any command not in the
 * allowlist with throw — no return-with-error degradation. spawnSync
 * captures exit_code, stdout, stderr, duration_ms.
 */

import { spawnSync } from "node:child_process";
import { Type } from "@earendil-works/pi-ai";

export interface CommandAllowlistInstance {
	allowed_commands: string[];
}

export interface CommandAllowlistArgs {
	command: string;
	args?: string[];
}

export interface CommandAllowlistResult {
	exit_code: number;
	stdout: string;
	stderr: string;
	duration_ms: number;
}

export const commandAllowlistArgsSchema = Type.Object({
	command: Type.String({ description: "Command name — must be in instance.allowed_commands." }),
	args: Type.Optional(Type.Array(Type.String(), { description: "Command arguments." })),
});

export function runCommandAllowlist(
	cwd: string,
	instance: CommandAllowlistInstance,
	args: CommandAllowlistArgs,
): CommandAllowlistResult {
	if (!instance?.allowed_commands || instance.allowed_commands.length === 0) {
		throw new Error("command-allowlist: instance.allowed_commands is required and must be non-empty.");
	}
	if (!args?.command) {
		throw new Error("command-allowlist: args.command is required.");
	}
	if (!instance.allowed_commands.includes(args.command)) {
		throw new Error(
			`command-allowlist: command '${args.command}' not in allowlist [${instance.allowed_commands.join(", ")}].`,
		);
	}

	const start = Date.now();
	const result = spawnSync(args.command, args.args ?? [], { cwd, encoding: "utf-8" });
	const duration_ms = Date.now() - start;
	return {
		exit_code: result.status ?? -1,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
		duration_ms,
	};
}
