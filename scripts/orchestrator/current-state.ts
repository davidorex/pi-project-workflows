#!/usr/bin/env tsx
/**
 * current-state — zero-loss "where are we + what's next" projection
 *
 * Wraps the canonical currentState library function from
 * @davidorex/pi-context/context-sdk. State is DERIVED from `.project`
 * substrate (DEC-0040 / FGAP-072 / FGAP-059) — nothing hand-stored:
 *   focus       — one-line active arc (in-flight tasks > in-progress phase)
 *   inFlight    — tasks with status "in-progress"
 *   nextActions — atomic-next, ranked: open framework-gaps (by priority)
 *                 then unblocked planned tasks (topo order)
 *   blocked     — planned tasks whose task_depends_on_task deps aren't all done
 *
 * Per DEC-0019 dual-surface pattern: this CLI script + the matching pi tool
 * (context-current-state) + the underlying currentState library function ship
 * as one unit. The script doubles as executable specification of the
 * current-state derivation contract for Claude Code-side ergonomics, mirroring
 * the same surface in-pi harness-confined agents reach via the registered tool.
 *
 * Usage:
 *   tsx scripts/orchestrator/current-state.ts [--cwd <path>] [--format json|table]
 *
 *   --cwd     : project root to derive state from (default ".")
 *   --format  : json (default) — JSON-stringified CurrentState
 *               table          — human-scannable markdown sections
 */
import { type CurrentState, currentState } from "@davidorex/pi-context/context-sdk";

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

function renderTable(state: CurrentState): void {
	console.log(`## Focus\n\n${state.focus}\n`);

	console.log("## In flight");
	if (state.inFlight.length === 0) {
		console.log("\n(none)\n");
	} else {
		console.log("\n| id | block | description |");
		console.log("| --- | --- | --- |");
		for (const t of state.inFlight) {
			console.log(`| ${t.id} | ${t.block} | ${t.description} |`);
		}
		console.log("");
	}

	console.log("## Next actions");
	if (state.nextActions.length === 0) {
		console.log("\n(none)\n");
	} else {
		console.log("\n| id | kind | priority | reason |");
		console.log("| --- | --- | --- | --- |");
		for (const a of state.nextActions) {
			console.log(`| ${a.id} | ${a.kind} | ${a.priority ?? ""} | ${a.reason} |`);
		}
		console.log("");
	}

	console.log("## Blocked");
	if (state.blocked.length === 0) {
		console.log("\n(none)");
	} else {
		console.log("\n| id | block | blocked by |");
		console.log("| --- | --- | --- |");
		for (const b of state.blocked) {
			console.log(`| ${b.id} | ${b.block} | ${b.blockedBy.join(", ")} |`);
		}
	}
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	let state: CurrentState;
	try {
		state = currentState(args.cwd);
	} catch (err) {
		console.error(`current-state: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(3);
	}
	if (args.format === "json") {
		console.log(JSON.stringify(state, null, 2));
		return;
	}
	renderTable(state);
}

main();
