#!/usr/bin/env tsx
/**
 * read-config — terse vocabulary projection of <substrate-dir>/config.json
 *
 * Per DEC-0015 (config drives substrate location): cwd is resolved through
 * `resolveContextDir(cwd)` so the substrate-dir name comes from the bootstrap
 * pointer rather than hardcoded ".project". `BootstrapNotFoundError` from
 * the resolver surfaces as an actionable error (substrate not initialized)
 * rather than a stack trace.
 *
 * Per DEC-0019 (scripts as dual surface): this script is the Claude Code-side
 * ergonomics wrapper over `loadConfig` from @davidorex/pi-context/context;
 * the in-pi-runtime equivalent is the `read-config` pi tool registered in
 * packages/pi-context/src/index.ts (landed in 1.3.A — commit bac1893). Both
 * surfaces wrap the same shared library; this script is intentionally thin.
 *
 * Usage:
 *   tsx scripts/orchestrator/read-config.ts                  # terse projection
 *   tsx scripts/orchestrator/read-config.ts --raw            # full JSON dump
 *   tsx scripts/orchestrator/read-config.ts --cwd <path>     # alternate cwd
 *
 * Runtime demonstration (DEC-0018) is performed by the orchestrator, not
 * inline — script invocation against the live `.pi-context.json` pointer +
 * substrate is the demo path.
 */
import path from "node:path";
import { loadConfig } from "@davidorex/pi-context/context";
import { resolveContextDir } from "@davidorex/pi-context/context-dir";

interface Args {
	raw: boolean;
	cwd: string;
}

function parseArgs(argv: string[]): Args {
	const out: Args = { raw: false, cwd: process.cwd() };
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === "--raw") {
			out.raw = true;
		} else if (argv[i] === "--cwd" && argv[i + 1]) {
			out.cwd = argv[i + 1];
			i++;
		}
	}
	return out;
}

function renderTerse(config: NonNullable<ReturnType<typeof loadConfig>>, configPath: string): string {
	const lines: string[] = [];
	lines.push(`## Config @ ${configPath}`);
	lines.push("");

	if (config.root) {
		lines.push(`**root**: ${config.root}`);
	}

	if (config.naming && Object.keys(config.naming).length > 0) {
		lines.push(`**naming**: ${JSON.stringify(config.naming)}`);
	} else {
		lines.push(`**naming**: default`);
	}

	if (Array.isArray(config.block_kinds)) {
		const names = config.block_kinds.map((b) => b.canonical_id);
		lines.push(`**block_kinds** (${names.length}): ${names.join(", ")}`);
	} else {
		lines.push(`**block_kinds**: (absent)`);
	}

	if (Array.isArray(config.layers) && config.layers.length > 0) {
		const names = config.layers.map((l) => l.id);
		lines.push(`**layers** (${names.length}): ${names.join(", ")}`);
	} else {
		lines.push(`**layers**: (absent)`);
	}

	if (Array.isArray(config.lenses) && config.lenses.length > 0) {
		const names = config.lenses.map((l) => l.id);
		lines.push(`**lenses** (${names.length}): ${names.join(", ")}`);
	} else {
		lines.push(`**lenses**: (absent)`);
	}

	if (Array.isArray(config.relation_types) && config.relation_types.length > 0) {
		const names = config.relation_types.map((r) => r.canonical_id);
		lines.push(`**relation_types** (${names.length}): ${names.join(", ")}`);
	} else {
		lines.push(`**relation_types**: (absent)`);
	}

	if (config.status_buckets && Object.keys(config.status_buckets).length > 0) {
		const keys = Object.keys(config.status_buckets);
		lines.push(`**status_buckets** keys (${keys.length}): ${keys.join(", ")}`);
	} else {
		lines.push(`**status_buckets**: (absent)`);
	}

	if (config.display_strings && Object.keys(config.display_strings).length > 0) {
		const keys = Object.keys(config.display_strings);
		lines.push(`**display_strings** keys (${keys.length}): ${keys.join(", ")}`);
	} else {
		lines.push(`**display_strings**: (absent)`);
	}

	if (Array.isArray(config.installed_schemas) && config.installed_schemas.length > 0) {
		lines.push(`**installed_schemas** (${config.installed_schemas.length}): ${config.installed_schemas.join(", ")}`);
	} else {
		lines.push(`**installed_schemas**: (none)`);
	}

	if (Array.isArray(config.installed_blocks) && config.installed_blocks.length > 0) {
		lines.push(`**installed_blocks** (${config.installed_blocks.length}): ${config.installed_blocks.join(", ")}`);
	} else {
		lines.push(`**installed_blocks**: (none)`);
	}

	return lines.join("\n");
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	let substrateDir: string;
	try {
		substrateDir = resolveContextDir(args.cwd);
	} catch (err) {
		// name-based, not instanceof (FGAP-080): the error may be thrown through a
		// different pi-context module instance under tsx, breaking class identity.
		if (err instanceof Error && err.name === "BootstrapNotFoundError") {
			console.error(`read-config: substrate not initialized — ${err.message}`);
			process.exit(1);
		}
		throw err;
	}
	const configPath = path.join(substrateDir, "config.json");
	const config = loadConfig(args.cwd);
	if (config === null) {
		console.log(`config: null (no config.json at ${configPath})`);
		return;
	}
	if (args.raw) {
		console.log(JSON.stringify(config, null, 2));
		return;
	}
	console.log(renderTerse(config, configPath));
}

main();
