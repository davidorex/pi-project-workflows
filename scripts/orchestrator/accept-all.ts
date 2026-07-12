#!/usr/bin/env tsx
/**
 * accept-all — ergonomics wrapper around context adoptConception
 *
 * Adopts the package's canonical packaged conception (samples/conception.json)
 * as this substrate's config.json (the accept-all onboarding mode; the packaged
 * catalog IS the dogfooded conception). Writes
 * config ONLY — run install afterwards to materialize the declared assets.
 * Idempotent: never clobbers an existing config (offer-don't-impose: the
 * package auto-seeds nothing; users opt in).
 * The conception's hardcoded root is overridden to the actual substrate dir name.
 *
 * Per the dual-surface discipline: in-pi harness-confined agents reach the same library
 * (context.adoptConception) through the Pi tool `context-accept-all`
 * registered in pi-context/index.ts. This script is the Claude-Code-side
 * parallel — same library underneath, different consumer wrapper. Both layers
 * thin; business logic in the library.
 *
 * Usage:
 *   tsx scripts/orchestrator/accept-all.ts [--cwd <dir>] [--format json|table]
 *
 * Exit codes: 0 success; 2 arg error; 4 substrate not initialized; 5 other failure.
 */
import { adoptConception } from "@davidorex/pi-context/context";

interface Args {
	cwd: string;
	format: "json" | "table";
}

function parseArgs(argv: string[]): Args {
	const out: Args = { cwd: process.cwd(), format: "json" };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--cwd" && argv[i + 1]) {
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
	return out;
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));

	let result: ReturnType<typeof adoptConception>;
	try {
		result = adoptConception(args.cwd);
	} catch (err) {
		// Name-based check rather than `instanceof BootstrapNotFoundError` — the
		// CLI loads the package via its built dist module-instance, which can be a
		// different class identity than a re-imported error constructor (the
		// write-schema.ts module-instance hazard precedent: instanceof checks on
		// transitively-thrown errors are module-instance-fragile).
		if (err instanceof Error && err.name === "BootstrapNotFoundError") {
			console.error("accept-all: substrate not initialized — run context-init first");
			process.exit(4);
		}
		console.error(`accept-all: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(5);
	}

	if (args.format === "json") {
		console.log(JSON.stringify(result, null, 2));
	} else {
		const verb = result.adopted ? "adopted" : "skipped (config present)";
		console.log(
			`accept-all: ${verb} (root: ${result.root}, ${result.schemaCount} schemas / ${result.blockCount} blocks)`,
		);
	}
	process.exit(0);
}

main();
