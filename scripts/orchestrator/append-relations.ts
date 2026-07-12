#!/usr/bin/env tsx
/**
 * append-relations — ergonomics wrapper around context-sdk appendRelationsByRef
 *
 * Bulk variant of append-relation: appends MANY closure-table edges in a single
 * whole-file write, skipping per-(parent, child, relation_type) duplicates
 * (against on-disk edges AND earlier edges in the same batch). Each edge is a
 * { parent, child, relation_type, ordinal? } selector object. Semantic integrity
 * is DEFERRED to context-validate — this surface does AJV-shape + duplicate-no-op
 * only, matching the appendRelations library guarantee.
 *
 * Per the dual-surface discipline: in-pi harness-confined agents reach the same library
 * (context-sdk.appendRelationsByRef) through the Pi tool `append-relations`
 * registered via the op-registry. This script is the Claude-Code-side parallel.
 *
 * Usage:
 *   tsx scripts/orchestrator/append-relations.ts --edges @/tmp/edges.json [--writer kind:id] [--dry-run] [--cwd <dir>] [--format json|table]
 *   tsx scripts/orchestrator/append-relations.ts --edges '[{"parent":"A","child":"B","relation_type":"rt"}]' ...
 *
 * --edges accepts an inline JSON array or @path to a file containing the array.
 */
import fs from "node:fs";
import type { Edge } from "@davidorex/pi-context/context";
import { appendRelationsByRef } from "@davidorex/pi-context/context-sdk";
import type { DispatchContext, WriterIdentity } from "@davidorex/pi-context/dispatch-context";

interface EdgeSelector {
	parent: string;
	child: string;
	relation_type: string;
	ordinal?: number;
}

interface Args {
	edges: EdgeSelector[];
	writer: string;
	dryRun: boolean;
	cwd: string;
	format: "json" | "table";
}

function loadEdgesArg(spec: string): EdgeSelector[] {
	let raw = spec;
	if (spec.startsWith("@")) {
		const file = spec.slice(1);
		try {
			raw = fs.readFileSync(file, "utf-8");
		} catch (err) {
			console.error(`Could not read --edges file ${file}: ${err instanceof Error ? err.message : String(err)}`);
			process.exit(2);
		}
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		console.error("--edges must be a JSON array (inline or @file)");
		process.exit(2);
	}
	if (!Array.isArray(parsed)) {
		console.error("--edges must be a JSON array of { parent, child, relation_type, ordinal? } objects");
		process.exit(2);
	}
	return parsed as EdgeSelector[];
}

function parseArgs(argv: string[]): Args {
	const out: Partial<Args> = {
		writer: "human:davidryan@gmail.com",
		dryRun: false,
		cwd: process.cwd(),
		format: "table",
	};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--edges" && argv[i + 1]) {
			out.edges = loadEdgesArg(argv[i + 1]);
			i++;
		} else if (a === "--writer" && argv[i + 1]) {
			out.writer = argv[i + 1];
			i++;
		} else if (a === "--dry-run") {
			out.dryRun = true;
		} else if (a === "--cwd" && argv[i + 1]) {
			out.cwd = argv[i + 1];
			i++;
		} else if (a === "--format" && argv[i + 1]) {
			const f = argv[i + 1];
			if (f !== "json" && f !== "table") {
				console.error(`--format must be 'json' or 'table', got '${f}'`);
				process.exit(2);
			}
			out.format = f;
			i++;
		}
	}
	if (!out.edges) {
		console.error("Missing --edges <json|@file>");
		process.exit(2);
	}
	return out as Args;
}

function parseWriter(spec: string): WriterIdentity {
	const colon = spec.indexOf(":");
	const kind = colon === -1 ? spec : spec.slice(0, colon);
	const identifier = colon === -1 ? "" : spec.slice(colon + 1);
	switch (kind) {
		case "human":
			return { kind: "human", user: identifier };
		case "agent":
			return { kind: "agent", agent_id: identifier };
		case "monitor":
			return { kind: "monitor", monitor_name: identifier };
		case "workflow":
			return { kind: "workflow", workflow_step_id: identifier };
		default:
			console.error(`Invalid writer kind ${kind}; allowed: human|agent|monitor|workflow`);
			process.exit(2);
	}
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	const writer = parseWriter(args.writer);
	const ctx: DispatchContext = { writer };

	// The dry-run path delegates to the SHARED library preview (appendRelationsByRef
	// with { dryRun: true }): it replays the on-disk AND in-batch dedup,
	// validates the prospective relations (write-path parity), and reports the
	// would-append / would-skip counts, writing nothing.
	if (args.dryRun) {
		let result: { appended: number; skipped: number; edges: Edge[] };
		try {
			result = appendRelationsByRef(args.cwd, args.edges, ctx, { dryRun: true });
		} catch (err: any) {
			console.error("[dry-run] FAIL");
			if (err?.name === "ValidationError" && Array.isArray(err.errors)) {
				for (const e of err.errors) {
					console.error(`  - ${e.instancePath || "(root)"}: ${e.message}`);
				}
			} else {
				console.error(`  - ${err instanceof Error ? err.message : String(err)}`);
			}
			process.exit(5);
		}
		console.error("[dry-run] PASS");
		if (args.format === "json") {
			console.log(
				JSON.stringify({ wouldAppend: result.appended, wouldSkip: result.skipped, edges: result.edges }, null, 2),
			);
		} else {
			console.log(`would append ${result.appended}, skip ${result.skipped} (duplicates)`);
		}
		process.exit(0);
	}

	let result: { appended: number; skipped: number; edges: Edge[] };
	try {
		result = appendRelationsByRef(args.cwd, args.edges, ctx);
	} catch (err) {
		console.error(`FAILED to append relations: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(5);
	}

	if (args.format === "json") {
		console.log(JSON.stringify(result, null, 2));
	} else {
		console.log(`appended ${result.appended}, skipped ${result.skipped} (duplicates)`);
	}
	process.exit(0);
}

main();
