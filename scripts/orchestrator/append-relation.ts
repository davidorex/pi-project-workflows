#!/usr/bin/env tsx
/**
 * append-relation — ergonomics wrapper around project-context appendRelation
 *
 * Write-twin of writeRelations for the additive case: appends a single
 * closure-table edge (parent, child, relation_type, optional ordinal) to
 * relations.json, skipping an exact (parent, child, relation_type) duplicate.
 * Semantic integrity (endpoints resolve, relation_type registered, no cycle) is
 * DEFERRED to project-validate — this surface does AJV-shape + duplicate-no-op
 * only, matching the appendRelation library guarantee.
 *
 * Per DEC-0019/0020: in-pi harness-confined agents reach the same library
 * (project-context.appendRelation) through the Pi tool `append-relation`
 * registered in pi-context/index.ts. This script is the Claude-Code-side
 * parallel — same library underneath, different consumer wrapper. Both layers
 * thin; business logic in the library.
 *
 * Usage:
 *   tsx scripts/orchestrator/append-relation.ts --parent <id> --child <id> --relation-type <rt> [--ordinal N] [--writer kind:id] [--dry-run] [--cwd <dir>] [--format json|table]
 */
import fs from "node:fs";
import path from "node:path";
import type { DispatchContext, WriterIdentity } from "@davidorex/pi-context/dispatch-context";
import { appendRelation, type Edge, loadRelations } from "@davidorex/pi-context/project-context";
import { ValidationError, validateFromFile } from "@davidorex/pi-context/schema-validator";

interface Args {
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
		if (a === "--parent" && argv[i + 1]) {
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

/** Resolve the bundled relations schema file path (top-level `Edge[]` array schema). */
function relationsSchemaPath(): string {
	const here = path.dirname(new URL(import.meta.url).pathname);
	// scripts/orchestrator → repo root → the package's bundled schema file.
	const schemaPath = path.resolve(here, "..", "..", "packages", "pi-context", "schemas", "relations.schema.json");
	if (!fs.existsSync(schemaPath)) {
		console.error(`Relations schema not found: ${schemaPath}`);
		process.exit(3);
	}
	return schemaPath;
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	const writer = parseWriter(args.writer);
	const ctx: DispatchContext = { writer };

	const edge: Edge = {
		parent: args.parent,
		child: args.child,
		relation_type: args.relationType,
		...(args.ordinal !== undefined ? { ordinal: args.ordinal } : {}),
	};

	if (args.dryRun) {
		console.error("[dry-run] validating prospective relations file against schema; no write");
		// Whole-file validation (FGAP-082): validate the prospective Edge[] array
		// against the WHOLE relations schema — resolves any $ref + matches what the
		// write validates — rather than the bare `.items` fragment in isolation.
		let existing: Edge[] = [];
		try {
			existing = loadRelations(args.cwd);
		} catch (err) {
			console.error(`[dry-run] could not read existing relations: ${err instanceof Error ? err.message : String(err)}`);
			process.exit(3);
		}
		try {
			validateFromFile(relationsSchemaPath(), [...existing, edge], "relations[edge]");
		} catch (err) {
			console.error("[dry-run] FAIL");
			if (err instanceof ValidationError && Array.isArray(err.errors)) {
				for (const e of err.errors) {
					console.error(`  - ${e.instancePath || "(root)"}: ${e.message}`);
				}
			} else {
				console.error(`  - ${err instanceof Error ? err.message : String(err)}`);
			}
			process.exit(5);
		}
		const duplicate = existing.some(
			(e) => e.parent === edge.parent && e.child === edge.child && e.relation_type === edge.relation_type,
		);
		console.error("[dry-run] PASS");
		if (args.format === "json") {
			console.log(JSON.stringify({ wouldWrite: !duplicate, duplicate, edge }, null, 2));
		} else {
			const verb = duplicate ? "NO-OP (duplicate)" : "append";
			console.log(`would ${verb}: ${edge.parent} -[${edge.relation_type}]-> ${edge.child}`);
		}
		process.exit(0);
	}

	let result: { appended: boolean };
	try {
		result = appendRelation(args.cwd, edge, ctx);
	} catch (err) {
		console.error(`FAILED to append relation: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(5);
	}

	if (args.format === "json") {
		console.log(JSON.stringify({ appended: result.appended, edge }, null, 2));
	} else if (result.appended) {
		console.log(`Appended relation: ${edge.parent} -[${edge.relation_type}]-> ${edge.child}`);
	} else {
		console.log(`No-op (duplicate): ${edge.parent} -[${edge.relation_type}]-> ${edge.child}`);
	}
	process.exit(0);
}

main();
