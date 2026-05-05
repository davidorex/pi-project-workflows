// POC A — identity-display decoupling for pi-context.
//
// Empirically demonstrates the candidate articulation's headline architectural claim
// (analysis/2026-05-05-pi-context-executive-summary-candidate.md, "Vocabulary surface"):
// renaming a display label touches config.json only; data, schemas, and SDK code
// are untouched across profiles.
//
// Two profiles drive the same loadConfigFrom → loadBlock → displayName → renderBlock
// pipeline against identical fixture data. The diff between output/primary and
// output/alt isolates display-label changes; ids and prefixes are byte-identical.
//
// No npm dependencies beyond tsx (node builtins + JSON only). No AJV at this layer
// per POC scope; the production pi-context layer adds AJV-at-every-write (F-006
// single-ingress invariant).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const POC_DIR = path.dirname(fileURLToPath(import.meta.url));

// ─── envisioned SDK shape — local POC implementations ───

interface BlockKind {
	canonical_id: string;
	display_name: string;
	prefix: string;
	schema_path: string;
	array_key: string;
	data_path: string;
}

interface ConfigBlock {
	schema_version: string;
	root: string;
	block_kinds: BlockKind[];
	naming?: Record<string, string>;
}

interface ItemRecord {
	id: string;
	title?: string;
	status?: string;
	body?: string;
	[k: string]: unknown;
}

function loadConfigFrom(jsonPath: string): ConfigBlock {
	const raw = fs.readFileSync(jsonPath, "utf8");
	return JSON.parse(raw) as ConfigBlock;
}

function loadBlock(blockKind: BlockKind): ItemRecord[] {
	const dataPath = path.join(POC_DIR, blockKind.data_path);
	const raw = fs.readFileSync(dataPath, "utf8");
	const parsed = JSON.parse(raw) as Record<string, unknown>;
	const arr = parsed[blockKind.array_key];
	if (!Array.isArray(arr)) {
		throw new Error(
			`Block at ${dataPath} has no array under array_key '${blockKind.array_key}' (canonical_id=${blockKind.canonical_id})`,
		);
	}
	return arr as ItemRecord[];
}

// Universal lookup: canonical_id → display label.
// Order: block_kinds[].display_name first, naming[canonicalId] fallback,
// canonicalId itself if neither resolves. Single function consumed by every render path.
function displayName(cfg: ConfigBlock, canonicalId: string): string {
	const bk = cfg.block_kinds.find((b) => b.canonical_id === canonicalId);
	if (bk) return bk.display_name;
	if (cfg.naming?.[canonicalId]) return cfg.naming[canonicalId];
	return canonicalId;
}

function renderBlock(cfg: ConfigBlock, blockKind: BlockKind, items: ItemRecord[]): string {
	const lines: string[] = [];
	lines.push(`# ${displayName(cfg, blockKind.canonical_id)}`);
	lines.push("");
	lines.push(`**canonical_id:** \`${blockKind.canonical_id}\`  `);
	lines.push(`**prefix:** \`${blockKind.prefix}\`  `);
	lines.push(`**array_key:** \`${blockKind.array_key}\`  `);
	lines.push(`**item count:** ${items.length}`);
	lines.push("");
	lines.push("| ID | Status | Title |");
	lines.push("|----|--------|-------|");
	for (const item of items) {
		const status = typeof item.status === "string" ? item.status : "";
		const title = typeof item.title === "string" ? item.title : "";
		lines.push(`| ${item.id} | ${status} | ${title} |`);
	}
	lines.push("");
	for (const item of items) {
		if (typeof item.body === "string" && item.body.length > 0) {
			lines.push(`## ${item.id} — ${typeof item.title === "string" ? item.title : ""}`);
			lines.push("");
			lines.push(item.body);
			lines.push("");
		}
	}
	return lines.join("\n");
}

// ─── profile resolution ───

interface Profile {
	configPath: string;
	outputSubdir: string;
	label: string;
}

function resolveProfile(): Profile {
	const suffix = process.argv[2];
	if (!suffix) {
		return {
			configPath: path.join(POC_DIR, "config.json"),
			outputSubdir: "primary",
			label: "primary",
		};
	}
	return {
		configPath: path.join(POC_DIR, `config-${suffix}.json`),
		outputSubdir: suffix,
		label: suffix,
	};
}

function main(): void {
	const profile = resolveProfile();
	console.log(`\n=== POC A profile: ${profile.label} ===`);
	console.log(`config: ${path.relative(POC_DIR, profile.configPath)}`);

	const cfg = loadConfigFrom(profile.configPath);
	console.log(
		`Loaded config (schema_version=${cfg.schema_version}, root=${cfg.root}, block_kinds=${cfg.block_kinds.length})`,
	);

	const outputDir = path.join(POC_DIR, "output", profile.outputSubdir);
	fs.mkdirSync(outputDir, { recursive: true });

	const written: string[] = [];
	for (const bk of cfg.block_kinds) {
		const items = loadBlock(bk);
		const md = renderBlock(cfg, bk, items);
		const outPath = path.join(outputDir, `${bk.array_key}.md`);
		fs.writeFileSync(outPath, md);
		const rel = path.relative(POC_DIR, outPath);
		written.push(rel);
		console.log(
			`  ${bk.canonical_id} → "${displayName(cfg, bk.canonical_id)}" — wrote ${rel} (${items.length} items)`,
		);
	}

	console.log(`\nProfile '${profile.label}' complete. ${written.length} file(s) written.`);
}

main();
