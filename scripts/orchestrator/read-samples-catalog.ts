#!/usr/bin/env tsx
/**
 * read-samples-catalog — enumerate the packaged sample block kinds (the
 * shipped samples catalog IS this project's dogfooded conception)
 *
 * Wraps the canonical `samplesCatalog` library function from
 * @davidorex/pi-context/samples-catalog. Projects the extension's bundled
 * samples conception + schemas into per-kind metadata (title, item shape,
 * applicable relation_types as source/target, invariants, lenses) plus the
 * top-level relation_type / lens / invariant / layer / status_bucket
 * registries. Closes the samples-catalog-not-queryable gap on the
 * Claude-Code side (discovery used to be filename-guess only).
 *
 * Per the dual-surface pattern: this CLI script + the matching pi
 * tool (read-samples-catalog) + the underlying library function ship as one
 * unit. The Pi-tool twin is the in-pi LLM discovery surface; this script is
 * the Claude-Code-side ergonomics surface and doubles as an executable
 * specification of the catalog contract.
 *
 * PACKAGE-INTRINSIC: the catalog reads the extension's OWN bundled samples
 * directory, not a project substrate — there is NO --cwd flag.
 *
 * Usage:
 *   tsx scripts/orchestrator/read-samples-catalog.ts [--kind <id>] [--format json|table]
 *
 *   --kind  : filter to one block_kind canonical_id (e.g. tasks)
 *   --format: json (default) — the full SamplesCatalog object
 *             table          — markdown table over kinds + a warnings section
 */
import { samplesCatalog } from "@davidorex/pi-context/samples-catalog";

interface Args {
	kind?: string;
	format: "json" | "table";
}

function parseArgs(argv: string[]): Args {
	const out: Args = { format: "json" };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--kind" && argv[i + 1]) {
			out.kind = argv[i + 1];
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

function renderTable(catalog: ReturnType<typeof samplesCatalog>): string {
	const header = "| kind | title | rel(src/tgt) | inv | lens |";
	const sep = "| --- | --- | --- | --- | --- |";
	const rows = catalog.kinds.map((k) => {
		const rel = `${k.relation_types.as_source.length}/${k.relation_types.as_target.length}`;
		return `| ${k.canonical_id} | ${k.title ?? ""} | ${rel} | ${k.invariants.length} | ${k.lenses.length} |`;
	});
	const lines = [header, sep, ...rows];
	if (catalog.warnings.length > 0) {
		lines.push("", "Warnings:", ...catalog.warnings.map((w) => `- ${w}`));
	}
	return lines.join("\n");
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	let catalog: ReturnType<typeof samplesCatalog>;
	try {
		catalog = samplesCatalog(args.kind ? { kind: args.kind } : undefined);
	} catch (err) {
		console.error(`read-samples-catalog: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(3);
	}
	if (args.format === "json") {
		console.log(JSON.stringify(catalog, null, 2));
	} else {
		console.log(renderTable(catalog));
	}
}

main();
