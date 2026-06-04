#!/usr/bin/env tsx
/**
 * replace-relation — ergonomics wrapper around context-sdk replaceRelationByRef
 *
 * Atomically swaps one closure-table edge for another in a SINGLE write (the old
 * edge and the new edge never coexist on disk). The old edge is matched on the
 * (parent, child, relation_type) identityKey dedup identity; the new edge is
 * written with its optional ordinal. An absent old edge degrades to an append of
 * the new edge. Semantic integrity is NOT touched — run context-validate after.
 *
 * Per DEC-0019/0020: in-pi harness-confined agents reach the same library
 * (context-sdk.replaceRelationByRef) through the Pi tool `replace-relation`
 * registered via the op-registry. This script is the Claude-Code-side parallel.
 *
 * Usage:
 *   tsx scripts/orchestrator/replace-relation.ts --old-parent <id> --old-child <id> --old-relation-type <rt> --parent <id> --child <id> --relation-type <rt> [--ordinal N] [--writer kind:id] [--dry-run] [--cwd <dir>] [--format json|table]
 */
import type { Edge } from "@davidorex/pi-context/context";
import { replaceRelationByRef } from "@davidorex/pi-context/context-sdk";
import type { DispatchContext, WriterIdentity } from "@davidorex/pi-context/dispatch-context";

interface Args {
	oldParent: string;
	oldChild: string;
	oldRelationType: string;
	parent: string;
	child: string;
	relationType: string;
	ordinal?: number;
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
		if (a === "--old-parent" && argv[i + 1]) {
			out.oldParent = argv[i + 1];
			i++;
		} else if (a === "--old-child" && argv[i + 1]) {
			out.oldChild = argv[i + 1];
			i++;
		} else if (a === "--old-relation-type" && argv[i + 1]) {
			out.oldRelationType = argv[i + 1];
			i++;
		} else if (a === "--parent" && argv[i + 1]) {
			out.parent = argv[i + 1];
			i++;
		} else if (a === "--child" && argv[i + 1]) {
			out.child = argv[i + 1];
			i++;
		} else if (a === "--relation-type" && argv[i + 1]) {
			out.relationType = argv[i + 1];
			i++;
		} else if (a === "--ordinal" && argv[i + 1]) {
			const n = Number(argv[i + 1]);
			if (!Number.isInteger(n)) {
				console.error(`--ordinal must be an integer, got '${argv[i + 1]}'`);
				process.exit(2);
			}
			out.ordinal = n;
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
	for (const [k, label] of [
		["oldParent", "--old-parent <id>"],
		["oldChild", "--old-child <id>"],
		["oldRelationType", "--old-relation-type <rt>"],
		["parent", "--parent <id>"],
		["child", "--child <id>"],
		["relationType", "--relation-type <rt>"],
	] as const) {
		if (!out[k]) {
			console.error(`Missing ${label}`);
			process.exit(2);
		}
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

	// The dry-run path delegates to the SHARED library preview (replaceRelationByRef
	// with { dryRun: true }, TASK-010): it validates the prospective post-replace
	// relations (write-path parity) and computes the same removed/replaced
	// would-decisions, writing nothing. `wouldRemove` ← removed; `wouldWriteNew` ←
	// replaced (= !collides). Messaging uses the original string selectors.
	if (args.dryRun) {
		let result: { replaced: boolean; removed: boolean; oldEdge: Edge; newEdge: Edge };
		try {
			result = replaceRelationByRef(
				args.cwd,
				{
					old: { parent: args.oldParent, child: args.oldChild, relation_type: args.oldRelationType },
					new: {
						parent: args.parent,
						child: args.child,
						relation_type: args.relationType,
						...(args.ordinal !== undefined ? { ordinal: args.ordinal } : {}),
					},
				},
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
			console.log(
				JSON.stringify(
					{
						wouldRemove: result.removed,
						wouldWriteNew: result.replaced,
						oldEdge: result.oldEdge,
						newEdge: result.newEdge,
					},
					null,
					2,
				),
			);
		} else {
			console.log(
				`would replace: ${args.oldParent} -[${args.oldRelationType}]-> ${args.oldChild} => ${args.parent} -[${args.relationType}]-> ${args.child}${result.removed ? "" : " (old absent → append)"}${result.replaced ? "" : " (new already present → no duplicate)"}`,
			);
		}
		process.exit(0);
	}

	let result: { replaced: boolean; removed: boolean; oldEdge: Edge; newEdge: Edge };
	try {
		result = replaceRelationByRef(
			args.cwd,
			{
				old: { parent: args.oldParent, child: args.oldChild, relation_type: args.oldRelationType },
				new: {
					parent: args.parent,
					child: args.child,
					relation_type: args.relationType,
					...(args.ordinal !== undefined ? { ordinal: args.ordinal } : {}),
				},
			},
			ctx,
		);
	} catch (err) {
		console.error(`FAILED to replace relation: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(5);
	}

	if (args.format === "json") {
		console.log(JSON.stringify(result, null, 2));
	} else {
		const oldDesc = `${args.oldParent} -[${args.oldRelationType}]-> ${args.oldChild}`;
		const newDesc = `${args.parent} -[${args.relationType}]-> ${args.child}`;
		if (!result.removed && !result.replaced) {
			console.log(`No-op: old ${oldDesc} absent and new ${newDesc} already present`);
		} else if (!result.removed) {
			console.log(`Old ${oldDesc} absent — appended new ${newDesc}`);
		} else if (!result.replaced) {
			console.log(`Removed ${oldDesc}; new ${newDesc} already present (no duplicate written)`);
		} else {
			console.log(`Replaced ${oldDesc} with ${newDesc}`);
		}
	}
	process.exit(0);
}

main();
