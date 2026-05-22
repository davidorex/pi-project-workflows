#!/usr/bin/env tsx
/**
 * bootstrap-state — derive the substrate bootstrap state for a dir
 *
 * Wraps the canonical `deriveBootstrapState` library function from
 * @davidorex/pi-context/project-sdk. State is DERIVED purely from the
 * filesystem (DEC-0040 — nothing stored): the four-state progression
 *   no-pointer    — no .pi-context.json
 *   no-config     — pointer present, no config.json
 *   not-installed — config present, some declared installed_* asset is absent
 *   ready         — config present, all declared assets materialized (or none)
 * plus the resolved contextDir and the declared-but-unmaterialized assets.
 *
 * Per DEC-0019/0020 dual-surface pattern: this CLI script + the matching pi
 * tool (context-bootstrap-state) + the underlying deriveBootstrapState library
 * function ship as one unit. The CLI doubles as executable specification of the
 * bootstrap-state derivation contract for Claude Code-side ergonomics, mirroring
 * the surface in-pi harness-confined agents reach via the registered tool.
 *
 * Unlike most substrate ops, this NEVER throws on an un-bootstrapped substrate —
 * it returns state "no-pointer" (the unset-substrate detection read). It DOES
 * propagate a corrupt config.json (ValidationError) — corruption is not a
 * bootstrap state.
 *
 * Usage:
 *   tsx scripts/orchestrator/bootstrap-state.ts [--cwd <path>] [--format json|table]
 *
 *   --cwd     : dir to derive bootstrap state for (default ".")
 *   --format  : json (default) — JSON-stringified BootstrapStatus
 *               table          — human-scannable summary
 */
import { type BootstrapStatus, deriveBootstrapState } from "@davidorex/pi-context/project-sdk";

interface Args {
	cwd: string;
	format: "json" | "table";
}

function parseArgs(argv: string[]): Args {
	const out: Args = { cwd: ".", format: "json" };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--cwd" && argv[i + 1]) {
			out.cwd = argv[i + 1];
			i++;
		} else if (a === "--format" && argv[i + 1]) {
			const v = argv[i + 1];
			if (v !== "json" && v !== "table") {
				console.error(`--format must be json|table (got: ${v})`);
				process.exit(2);
			}
			out.format = v;
			i++;
		}
	}
	return out;
}

function renderTable(status: BootstrapStatus): void {
	console.log(`## Bootstrap state\n\n**state:** ${status.state}`);
	console.log(`**contextDir:** ${status.contextDir ?? "(none — no pointer)"}\n`);
	const totalMissing = status.missing.schemas.length + status.missing.blocks.length;
	if (status.state === "not-installed" && totalMissing > 0) {
		console.log("**unmaterialized assets:**");
		for (const s of status.missing.schemas) console.log(`- schema: ${s}`);
		for (const b of status.missing.blocks) console.log(`- block:  ${b}`);
		console.log("");
	}
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	let status: BootstrapStatus;
	try {
		status = deriveBootstrapState(args.cwd);
	} catch (err) {
		console.error(`bootstrap-state: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(3);
	}
	if (args.format === "json") {
		console.log(JSON.stringify(status, null, 2));
		return;
	}
	renderTable(status);
}

main();
