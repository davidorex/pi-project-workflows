#!/usr/bin/env tsx
/**
 * remove-relation — ergonomics wrapper around context-sdk removeRelationByRef
 *
 * The symmetric inverse of append-relation: removes the single closure-table
 * edge whose (parent, child, relation_type) triple matches, by the SAME
 * identityKey dedup identity append uses (ordinal is NOT part of identity). An
 * absent edge is an idempotent no-op. Semantic integrity is NOT touched —
 * removal only filters the edge set and rewrites; run context-validate after if
 * the removal changes resolvability.
 *
 * Per DEC-0019/0020: in-pi harness-confined agents reach the same library
 * (context-sdk.removeRelationByRef) through the Pi tool `remove-relation`
 * registered via the op-registry. This script is the Claude-Code-side parallel —
 * same library underneath, different consumer wrapper. Both layers thin;
 * business logic in the library.
 *
 * Usage:
 *   tsx scripts/orchestrator/remove-relation.ts --parent <id> --child <id> --relation-type <rt> [--writer kind:id] [--dry-run] [--cwd <dir>] [--format json|table]
 */
import type { Edge } from "@davidorex/pi-context/context";
import { removeRelationByRef } from "@davidorex/pi-context/context-sdk";
import type { DispatchContext, WriterIdentity } from "@davidorex/pi-context/dispatch-context";

interface Args {
	parent: string;
	child: string;
	relationType: string;
	writer: string;
	dryRun: boolean;
	cwd: string;
	format: "json" | "table";
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
		if (a === "--parent" && argv[i + 1]) {
			out.parent = argv[i + 1];
			i++;
		} else if (a === "--child" && argv[i + 1]) {
			out.child = argv[i + 1];
			i++;
		} else if (a === "--relation-type" && argv[i + 1]) {
			out.relationType = argv[i + 1];
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
	if (!out.parent) {
		console.error("Missing --parent <id>");
		process.exit(2);
	}
	if (!out.child) {
		console.error("Missing --child <id>");
		process.exit(2);
	}
	if (!out.relationType) {
		console.error("Missing --relation-type <rt>");
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

	// Cycle-5 porcelain: STRING --parent / --child selectors are RESOLVED to
	// structured EdgeEndpoints and matched on the identityKey dedup identity. The
	// dry-run path delegates to the SHARED library preview (removeRelationByRef
	// with { dryRun: true }, TASK-010): it validates the prospective post-removal
	// relations (write-path parity) and reports whether a matching edge would be
	// removed, writing nothing. Messaging uses the original string selectors.
	if (args.dryRun) {
		let result: { removed: boolean; edge: Edge };
		try {
			result = removeRelationByRef(
				args.cwd,
				{ parent: args.parent, child: args.child, relation_type: args.relationType },
				ctx,
				{ dryRun: true },
			);
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
			console.log(JSON.stringify({ wouldRemove: result.removed, edge: result.edge }, null, 2));
		} else {
			const verb = result.removed ? "remove" : "NO-OP (no matching relation)";
			console.log(`would ${verb}: ${args.parent} -[${args.relationType}]-> ${args.child}`);
		}
		process.exit(0);
	}

	let result: { removed: boolean; edge: Edge };
	try {
		result = removeRelationByRef(
			args.cwd,
			{ parent: args.parent, child: args.child, relation_type: args.relationType },
			ctx,
		);
	} catch (err) {
		console.error(`FAILED to remove relation: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(5);
	}

	if (args.format === "json") {
		console.log(JSON.stringify({ removed: result.removed, edge: result.edge }, null, 2));
	} else if (result.removed) {
		console.log(`Removed relation: ${args.parent} -[${args.relationType}]-> ${args.child}`);
	} else {
		console.log(`No-op (no matching relation): ${args.parent} -[${args.relationType}]-> ${args.child}`);
	}
	process.exit(0);
}

main();
