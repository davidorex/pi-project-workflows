#!/usr/bin/env tsx
/**
 * land-identity-fields — ergonomics wrapper around
 * land-identity-fields.landIdentityFieldsForDir (Cycle 10 H1-precursor).
 *
 * Lands the three content-addressed-identity field DECLARATIONS
 * (oid / content_hash / content_parent) as OPTIONAL item properties onto every
 * registered block_kind schema of the TARGET substrate that lacks them — the
 * precondition the H1 migration's step-0 readiness gate
 * (schemaDeclaresIdentityFields) checks. Surgical inject (each schema's existing
 * constraints preserved); the fields are never added to `required`.
 *
 * --substrate <dir> targets an EXPLICIT substrate dir (resolved against --cwd),
 * NOT the active-pointer substrate — so the orchestrator can land a specific
 * `.project` / `.context` / `.context-jit-spec-v2` without flipping the pointer.
 *
 * Per DEC-0019/0020: in-pi harness-confined agents reach the same library through
 * the corresponding Pi tool; this script is the Claude-Code-side parallel — same
 * library underneath, different consumer wrapper. Both thin; logic in the library.
 *
 * Usage:
 *   tsx scripts/orchestrator/land-identity-fields.ts --substrate <dir> [--cwd <dir>] [--dry-run] [--writer kind:id]
 */
import path from "node:path";
import type { DispatchContext, WriterIdentity } from "@davidorex/pi-context/dispatch-context";
import { landIdentityFieldsForDir } from "@davidorex/pi-context/land-identity-fields";

interface Args {
	substrate: string;
	cwd: string;
	dryRun: boolean;
	writer: string;
}

function parseArgs(argv: string[]): Args {
	const out: Partial<Args> = {
		cwd: process.cwd(),
		dryRun: false,
		writer: "human:davidryan@gmail.com",
	};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--substrate" && argv[i + 1]) {
			out.substrate = argv[i + 1];
			i++;
		} else if (a === "--cwd" && argv[i + 1]) {
			out.cwd = argv[i + 1];
			i++;
		} else if (a === "--dry-run") {
			out.dryRun = true;
		} else if (a === "--writer" && argv[i + 1]) {
			out.writer = argv[i + 1];
			i++;
		}
	}
	if (!out.substrate) {
		console.error("Missing --substrate <dir>");
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
	const ctx: DispatchContext = { writer: parseWriter(args.writer) };
	const substrateAbs = path.isAbsolute(args.substrate) ? args.substrate : path.resolve(args.cwd, args.substrate);

	let report: ReturnType<typeof landIdentityFieldsForDir>;
	try {
		report = landIdentityFieldsForDir(substrateAbs, { dryRun: args.dryRun, ctx });
	} catch (err) {
		console.error(`land-identity-fields: FAILED — ${err instanceof Error ? err.message : String(err)}`);
		process.exit(5);
	}

	console.log(JSON.stringify(report, null, 2));
	process.exit(0);
}

main();
