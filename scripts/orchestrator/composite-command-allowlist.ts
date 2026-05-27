#!/usr/bin/env tsx
/**
 * composite-command-allowlist — Claude-Code-side CLI wrapper for the
 * command-allowlist composite KIND library function (FEAT-010 / TASK-092).
 *
 * Per DEC-0019/0020: every composite KIND lands as a TRIPLE (library +
 * Pi tool + CLI script). Same library underneath as the registered
 * Pi tool; different consumer wrapper.
 *
 * Usage:
 *   tsx scripts/orchestrator/composite-command-allowlist.ts \
 *     --allowed-commands echo,ls --command echo --args hi,there [--cwd .]
 */
import { runCommandAllowlist } from "../../packages/pi-agent-dispatch/src/composites/command-allowlist.js";

interface Args {
	cwd: string;
	allowedCommands: string[];
	command: string;
	args?: string[];
}

function parseArgs(argv: string[]): Args {
	const out: Partial<Args> = { cwd: process.cwd() };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--cwd" && argv[i + 1]) {
			out.cwd = argv[i + 1];
			i++;
		} else if (a === "--allowed-commands" && argv[i + 1]) {
			out.allowedCommands = argv[i + 1]
				.split(",")
				.map((s) => s.trim())
				.filter((s) => s.length > 0);
			i++;
		} else if (a === "--command" && argv[i + 1]) {
			out.command = argv[i + 1];
			i++;
		} else if (a === "--args" && argv[i + 1]) {
			out.args = argv[i + 1]
				.split(",")
				.map((s) => s.trim())
				.filter((s) => s.length > 0);
			i++;
		}
	}
	if (!out.allowedCommands || out.allowedCommands.length === 0) {
		console.error("Missing --allowed-commands <csv>");
		process.exit(2);
	}
	if (!out.command) {
		console.error("Missing --command <name>");
		process.exit(2);
	}
	return out as Args;
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	try {
		const result = runCommandAllowlist(
			args.cwd,
			{ allowed_commands: args.allowedCommands },
			{ command: args.command, args: args.args },
		);
		process.stdout.write(JSON.stringify(result, null, 2) + "\n");
	} catch (err) {
		console.error((err as Error).message);
		process.exit(1);
	}
}

main();
