#!/usr/bin/env tsx
/**
 * build-html-views — emit a self-contained HTML projection of pi-context
 * substrate (every installed block kind + every top-level field + every item)
 * at html-views/substrate-overview.html.
 *
 * Per CLAUDE.md "Orchestrator scripts dual-surface" (DEC-0019/0020): this is
 * the Claude-Code-side ergonomics wrapper over the same pi-context library
 * surface (context-sdk's availableBlocks + schemaInfo + block-api's readBlock)
 * that in-pi harness-confined agents reach via Pi-registered tools. No direct
 * fs.readFileSync on .project/*.json — all substrate access flows through the
 * canonical SDK surface so substrate-dir resolution (DEC-0015) and
 * DispatchContext attestation paths stay honored.
 *
 * Lossless contract (BINDING):
 *   1. EVERY top-level property declared by the block schema is rendered.
 *      Top-level scalars + objects appear in a "block-identity panel".
 *      Top-level arrays each render as a sub-section of item cards.
 *   2. NO heuristics. The only signal used to decide what is an array vs a
 *      scalar/object is `schemaInfo(cwd, blockName).properties[].type`.
 *      "Pick the largest array" / "guess the array_key" patterns are forbidden.
 *   3. Any property whose declared type the renderer cannot losslessly emit
 *      causes the script to exit 2 with an explicit error naming the block,
 *      the property name, and the type.
 *
 * Style contract (BINDING):
 *   The CSS / DOM structure / interactivity must mirror
 *   html-views/milestones-and-roadmap.html exactly. Forbidden additions:
 *   position:sticky, position:fixed, color hexes outside the source palette,
 *   font additions, animation/transform additions not present in source.
 *   Only allowed differences: data content + the per-block sub-section
 *   structure required to host the new substrate.
 *
 * Usage:
 *   npx tsx scripts/orchestrator/build-html-views.ts [--cwd <path>] [--output <path>] [--dry-run]
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { readBlock } from "@davidorex/pi-context/block-api";
import { availableBlocks, type SchemaInfo, type SchemaProperty, schemaInfo } from "@davidorex/pi-context/context-sdk";

interface Args {
	cwd: string;
	output: string;
	dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
	const out: Partial<Args> = { dryRun: false };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--cwd" && argv[i + 1]) {
			out.cwd = argv[i + 1];
			i++;
		} else if (a === "--output" && argv[i + 1]) {
			out.output = argv[i + 1];
			i++;
		} else if (a === "--dry-run") {
			out.dryRun = true;
		} else if (a === "--help" || a === "-h") {
			console.log(
				"Usage: npx tsx scripts/orchestrator/build-html-views.ts [--cwd <path>] [--output <path>] [--dry-run]",
			);
			process.exit(0);
		}
	}
	const cwd = out.cwd ?? process.cwd();
	const output = out.output ?? path.join(cwd, "html-views", "substrate-overview.html");
	return { cwd, output, dryRun: out.dryRun ?? false };
}

/**
 * One per-block-property render plan derived purely from schema introspection.
 *
 * A property is either a scalar/object (lives in the block-identity panel as a
 * key/value entry), or an array (lives as a separate sub-section of item
 * cards). Property type is taken verbatim from `schemaInfo.properties[].type`.
 */
interface IdentityField {
	name: string;
	type: string;
	description?: string;
	value: unknown;
	present: boolean;
}

interface ItemSubSection {
	propertyName: string;
	description?: string;
	items: unknown[];
	itemCount: number;
}

interface RenderedBlock {
	name: string;
	schemaTitle: string;
	schemaTitleFromFallback: boolean;
	hasSchema: boolean;
	identityFields: IdentityField[];
	itemSubSections: ItemSubSection[];
	totalItems: number;
	scalarFieldCount: number;
	arrayPropertyCount: number;
	losslessVerified: boolean;
	readError?: string;
}

interface SubstrateData {
	generated_at: string;
	repo_head: string;
	repo_head_short: string;
	cwd: string;
	blocks: RenderedBlock[];
}

function getRepoHead(cwd: string): { full: string; short: string } {
	try {
		const full = execSync("git rev-parse HEAD", { cwd, encoding: "utf-8" }).trim();
		const short = execSync("git rev-parse --short HEAD", { cwd, encoding: "utf-8" }).trim();
		return { full, short };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return { full: `(git rev-parse failed: ${msg})`, short: "n/a" };
	}
}

/**
 * Map a schema property type string into one of the renderer's three buckets.
 *  - "identity" : scalar or object (renders in block-identity panel)
 *  - "subsection" : array (renders as item-card sub-section)
 *  - "unrepresentable" : type the renderer refuses to emit losslessly; caller
 *    must FAIL LOUD per BINDING MANDATE 6.
 *
 * Allowed identity types: string, number, integer, boolean, object, null.
 * Allowed subsection type: array.
 * Union types (e.g. "string|integer") are accepted as identity.
 */
function classifyPropertyType(type: string): "identity" | "subsection" | "unrepresentable" {
	if (type === "array") return "subsection";
	const parts = type.split("|").map((p) => p.trim());
	const okIdentity = new Set(["string", "number", "integer", "boolean", "object", "null", "unknown"]);
	if (parts.every((p) => okIdentity.has(p))) return "identity";
	return "unrepresentable";
}

function gatherBlock(cwd: string, name: string, hasSchema: boolean): RenderedBlock {
	const block: RenderedBlock = {
		name,
		schemaTitle: name,
		schemaTitleFromFallback: true,
		hasSchema,
		identityFields: [],
		itemSubSections: [],
		totalItems: 0,
		scalarFieldCount: 0,
		arrayPropertyCount: 0,
		losslessVerified: false,
	};

	const info: SchemaInfo | null = hasSchema ? schemaInfo(cwd, name) : null;
	if (info?.title && info.title !== name) {
		block.schemaTitle = info.title;
		block.schemaTitleFromFallback = false;
	}

	let data: Record<string, unknown> | null = null;
	try {
		data = readBlock(cwd, name) as Record<string, unknown>;
	} catch (err) {
		block.readError = err instanceof Error ? err.message : String(err);
		return block;
	}

	const properties: SchemaProperty[] = info?.properties ?? [];
	const propertyNamesSeen = new Set<string>();

	// 1. Schema-declared properties drive the canonical render order.
	for (const prop of properties) {
		propertyNamesSeen.add(prop.name);
		const cls = classifyPropertyType(prop.type);
		if (cls === "unrepresentable") {
			console.error(
				`build-html-views: block "${name}" property "${prop.name}" has type "${prop.type}" which the renderer cannot losslessly represent.`,
			);
			console.error(
				"  Hard contract: every top-level property must render losslessly. Extend classifyPropertyType + the corresponding renderer, or revise the schema.",
			);
			process.exit(2);
		}
		if (cls === "subsection") {
			const arr = Array.isArray(data?.[prop.name]) ? (data[prop.name] as unknown[]) : [];
			block.itemSubSections.push({
				propertyName: prop.name,
				description: prop.description,
				items: arr,
				itemCount: arr.length,
			});
			block.totalItems += arr.length;
			block.arrayPropertyCount++;
		} else {
			const present = data ? prop.name in data : false;
			block.identityFields.push({
				name: prop.name,
				type: prop.type,
				description: prop.description,
				value: data ? data[prop.name] : undefined,
				present,
			});
			block.scalarFieldCount++;
		}
	}

	// 2. Any DATA-present property NOT declared by the schema must also be
	//    rendered losslessly (schemas may lag block instances). Classify by
	//    runtime-typeof; arrays get a sub-section, scalars/objects get an
	//    identity row, anything else fails.
	if (data) {
		for (const [key, value] of Object.entries(data)) {
			if (propertyNamesSeen.has(key)) continue;
			if (Array.isArray(value)) {
				block.itemSubSections.push({
					propertyName: key,
					description: "(no schema description; property absent from schema)",
					items: value,
					itemCount: value.length,
				});
				block.totalItems += value.length;
				block.arrayPropertyCount++;
				continue;
			}
			const t = value === null ? "null" : typeof value;
			if (t === "string" || t === "number" || t === "boolean" || t === "object" || t === "null") {
				block.identityFields.push({
					name: key,
					type: t,
					description: "(no schema description; property absent from schema)",
					value,
					present: true,
				});
				block.scalarFieldCount++;
				continue;
			}
			console.error(
				`build-html-views: block "${name}" data property "${key}" has runtime type "${t}" which the renderer cannot losslessly represent.`,
			);
			process.exit(2);
		}
	}

	block.losslessVerified = !block.readError;
	return block;
}

function gatherSubstrate(cwd: string): SubstrateData {
	const head = getRepoHead(cwd);
	const blocks: RenderedBlock[] = [];
	for (const info of availableBlocks(cwd)) {
		blocks.push(gatherBlock(cwd, info.name, info.hasSchema));
	}
	return {
		generated_at: new Date().toISOString(),
		repo_head: head.full,
		repo_head_short: head.short,
		cwd,
		blocks,
	};
}

function htmlEscape(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function jsonInline(data: unknown): string {
	return JSON.stringify(data).replace(/</g, "\\u003c").replace(/-->/g, "--\\u003e");
}

/**
 * The CSS below is taken verbatim from html-views/milestones-and-roadmap.html
 * with only these tightly-scoped additions required to host the new substrate
 * structure (block sub-sections, block-identity panel, key/value definition
 * list, sub-section heading). No new colors, no new fonts, no sticky/fixed
 * positioning, no animations beyond what is in the source.
 */
function renderHtml(data: SubstrateData): string {
	const totalItems = data.blocks.reduce((acc, b) => acc + b.totalItems, 0);
	const totalBlocks = data.blocks.length;
	const escapedHead = htmlEscape(data.repo_head);
	const escapedShort = htmlEscape(data.repo_head_short);
	const escapedCwd = htmlEscape(data.cwd);

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>pi-context substrate overview</title>
<style>
:root {
  --bg: #f7f7f5;
  --bg-elev: #ffffff;
  --bg-soft: #f0f0ec;
  --fg: #1a1a1a;
  --fg-muted: #555;
  --fg-faint: #888;
  --border: #e2e2dd;
  --border-strong: #cfcfc8;
  --accent: #2563eb;
  --accent-soft: #dbeafe;
  --green: #16a34a;
  --green-dark: #14532d;
  --green-soft: #dcfce7;
  --blue: #2563eb;
  --blue-soft: #dbeafe;
  --gray: #6b7280;
  --gray-soft: #e5e7eb;
  --red: #dc2626;
  --code-bg: #f4f4ee;
  --highlight: #fff3a3;
  --shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
  --shadow-strong: 0 4px 12px rgba(0,0,0,0.08);
  --radius: 8px;
  --radius-sm: 4px;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  --sans: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}
[data-theme="dark"] {
  --bg: #0f1117;
  --bg-elev: #181b23;
  --bg-soft: #1f232c;
  --fg: #e8e8e3;
  --fg-muted: #a8a8a0;
  --fg-faint: #6e6e66;
  --border: #2a2e38;
  --border-strong: #3a3f4a;
  --accent: #60a5fa;
  --accent-soft: #1e3a8a;
  --green: #4ade80;
  --green-dark: #86efac;
  --green-soft: #14532d;
  --blue: #60a5fa;
  --blue-soft: #1e3a8a;
  --gray: #9ca3af;
  --gray-soft: #374151;
  --red: #f87171;
  --code-bg: #1f232c;
  --highlight: #5b4a00;
  --shadow: 0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3);
  --shadow-strong: 0 4px 12px rgba(0,0,0,0.5);
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: var(--sans);
  background: var(--bg);
  color: var(--fg);
  line-height: 1.55;
  font-size: 15px;
  transition: background 0.2s, color 0.2s;
}
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 28px 80px;
}
header.top {
  display: flex;
  flex-direction: column;
  gap: 14px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 22px;
  margin-bottom: 28px;
}
.title-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}
h1 {
  font-size: 26px;
  margin: 0 0 4px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.subtitle {
  color: var(--fg-muted);
  font-size: 14px;
  margin: 0;
}
.theme-toggle {
  background: var(--bg-elev);
  border: 1px solid var(--border-strong);
  color: var(--fg);
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
}
.theme-toggle:hover { background: var(--bg-soft); }

nav.toc {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
nav.toc a {
  color: var(--accent);
  text-decoration: none;
  font-size: 13px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-elev);
}
nav.toc a:hover { background: var(--accent-soft); }

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-bottom: 28px;
  padding: 14px 16px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.search-input {
  flex: 1 1 280px;
  padding: 8px 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: 14px;
  background: var(--bg);
  color: var(--fg);
}
.search-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}
.status-pills {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.status-pill {
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 12px;
  border: 1px solid var(--border-strong);
  background: var(--bg);
  color: var(--fg-muted);
  cursor: pointer;
  font-family: inherit;
  text-transform: lowercase;
}
.status-pill[data-on="true"] {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}

section {
  margin-bottom: 44px;
  scroll-margin-top: 16px;
}
h2 {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
  letter-spacing: -0.01em;
}
h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 8px;
}

/* Identity panel + sub-sections (additions for substrate hosting) */
.block-meta {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--fg-faint);
  margin: 0 0 12px;
}
.identity-panel {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px 20px;
  box-shadow: var(--shadow);
  margin-bottom: 18px;
}
.identity-panel dl {
  margin: 0;
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 8px 16px;
}
.identity-panel dt {
  font-family: var(--sans);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--fg-faint);
  font-weight: 600;
  padding-top: 2px;
}
.identity-panel dd {
  margin: 0;
  font-size: 14px;
  color: var(--fg);
  white-space: pre-wrap;
  word-break: break-word;
}
.identity-panel dd.absent {
  color: var(--fg-faint);
  font-style: italic;
}
.subsection {
  margin: 18px 0 10px;
}
.subsection h3 {
  margin: 0 0 4px;
  font-family: var(--sans);
  font-size: 14px;
  font-weight: 600;
  color: var(--fg);
}
.subsection .sub-desc {
  font-size: 12px;
  color: var(--fg-muted);
  margin: 0 0 8px;
}
.section-empty {
  font-size: 13px;
  color: var(--fg-faint);
  font-style: italic;
  padding: 6px 0 8px;
}

/* Item cards (mirrored from .milestone) */
.milestone-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 18px;
}
.milestone {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px 22px;
  box-shadow: var(--shadow);
  scroll-margin-top: 16px;
}
.m-head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.id-badge {
  font-family: var(--mono);
  font-size: 12px;
  background: var(--bg-soft);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  padding: 3px 8px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.m-name {
  font-size: 17px;
  font-weight: 600;
  flex: 1 1 auto;
}
details.collapsible {
  margin: 8px 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
}
details.collapsible > summary {
  cursor: pointer;
  padding: 7px 12px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--fg-muted);
  font-weight: 600;
  list-style: none;
  user-select: none;
}
details.collapsible > summary::-webkit-details-marker { display: none; }
details.collapsible > summary::before {
  content: "▸ ";
  display: inline-block;
  transition: transform 0.15s;
  color: var(--fg-faint);
}
details.collapsible[open] > summary::before { content: "▾ "; }
details.collapsible .body {
  padding: 4px 14px 12px;
  white-space: pre-wrap;
  font-size: 14px;
  color: var(--fg);
  line-height: 1.5;
}
pre.code {
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  font-family: var(--mono);
  font-size: 12px;
  color: var(--fg);
  overflow-x: auto;
  margin: 4px 0 0;
  line-height: 1.45;
}
code.inline {
  font-family: var(--mono);
  font-size: 12px;
  background: var(--code-bg);
  padding: 1px 5px;
  border-radius: 3px;
}
.field-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin: 10px 0 4px;
}
.field-label {
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 11px;
  color: var(--fg-faint);
  font-weight: 600;
  min-width: 110px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  display: inline-block;
  padding: 3px 9px;
  background: var(--bg-soft);
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--fg);
  cursor: pointer;
  user-select: none;
  transition: background 0.15s, border-color 0.15s;
}
.chip.vocab {
  font-family: var(--sans);
  font-size: 11px;
  cursor: default;
  background: transparent;
  color: var(--fg-muted);
}
.chip[data-id]:hover {
  background: var(--accent-soft);
  border-color: var(--accent);
}
.chip.highlighted,
.id-badge.highlighted,
.dep-edges li.highlighted,
.ordered-list li.highlighted {
  background: var(--highlight) !important;
  color: var(--fg) !important;
}

/* Status pills (per-card) */
.status-badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  text-transform: lowercase;
  letter-spacing: 0.04em;
}
.status-active   { background: var(--green-soft); color: var(--green-dark); border: 1px solid var(--green); }
.status-planned  { background: var(--blue-soft);  color: var(--blue);       border: 1px solid var(--blue); }
.status-aspirational { background: var(--gray-soft); color: var(--gray); border: 1px solid var(--gray); }
.status-satisfied { background: var(--green-soft); color: var(--green-dark); border: 1px solid var(--green-dark); }

footer.bottom {
  margin-top: 60px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
  font-size: 12px;
  color: var(--fg-faint);
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}
footer.bottom code { font-family: var(--mono); }

.read-error {
  background: var(--bg-soft);
  color: var(--red);
  border: 1px solid var(--red);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  font-family: var(--mono);
  font-size: 12px;
  margin: 8px 0 18px;
}

.hidden-by-search { display: none !important; }
.hidden-by-status { display: none !important; }

/* Responsive */
@media (max-width: 720px) {
  .container { padding: 16px; }
  h1 { font-size: 22px; }
  .field-label { min-width: auto; }
  .identity-panel dl { grid-template-columns: 1fr; }
}

@media print {
  .controls, .theme-toggle, nav.toc { display: none; }
  details.collapsible[open] > summary::before,
  details.collapsible > summary::before { display: none; }
  details.collapsible > summary { background: transparent; }
  details.collapsible:not([open]) .body { display: block; }
  .milestone, .identity-panel {
    box-shadow: none;
    break-inside: avoid;
  }
  body { background: white; color: black; }
}
</style>
</head>
<body>
<div class="container">

<header class="top">
  <div class="title-row">
    <div>
      <h1>pi-context substrate overview</h1>
      <p class="subtitle">Auto-generated projection of <code class="inline">.project/</code> substrate via canonical pi-context SDK (availableBlocks + readBlock + schemaInfo). Schema-title-as-display-name per DEC-0023. Repo HEAD <code class="inline">${escapedShort}</code>. Generated <code class="inline" id="genStamp">${htmlEscape(data.generated_at)}</code>. cwd <code class="inline">${escapedCwd}</code>. ${totalBlocks} block kinds &middot; ${totalItems} items total.</p>
    </div>
    <button class="theme-toggle" id="themeToggle" aria-label="Toggle dark mode">Toggle dark mode</button>
  </div>
  <nav class="toc" id="toc" aria-label="Table of contents"></nav>
</header>

<div class="controls" role="region" aria-label="Filter controls">
  <input type="search" class="search-input" id="searchInput" placeholder="Filter items by id / title / field text…" aria-label="Filter items" />
  <div class="status-pills" id="statusPills" role="group" aria-label="Status filter"></div>
</div>

<main id="sections"></main>

<footer class="bottom">
  <span>Source: <code>scripts/orchestrator/build-html-views.ts</code> &middot; substrate writes via <code>scripts/orchestrator/file-block-item.ts</code></span>
  <span>repo HEAD <code>${escapedHead}</code></span>
</footer>

</div>

<script>
const SUBSTRATE_DATA = ${jsonInline(data)};

// Cross-reference chip pattern: PREFIX-NNN where prefix is uppercase or lowercase
// (DEC-NNNN / FGAP-NNN / TASK-NNN / VER-NNN / FEAT-NNN / issue-NNN / R-NNNN / etc.)
const ID_PATTERN = /\\b([A-Z]+|[a-z]+)-\\d+\\b/g;
const STATUS_FIELD_NAMES = ["status", "state", "lifecycle", "lifecycle_state"];
const TITLE_FIELD_NAMES = ["title", "name", "summary", "headline", "label"];
const ID_FIELD_NAMES = ["id", "canonical_id", "key"];

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, "");
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null) continue;
    if (typeof c === "string") node.appendChild(document.createTextNode(c));
    else node.appendChild(c);
  }
  return node;
}

function chip(id) {
  const c = el("button", { class: "chip", "data-id": id, type: "button", "aria-label": "Highlight " + id }, id);
  c.addEventListener("click", () => toggleHighlight(id));
  return c;
}

function statusBadge(status) {
  return el("span", { class: "status-badge status-" + String(status).toLowerCase().replace(/[^a-z0-9-]+/g, "-") }, String(status));
}

function getItemId(item, fallback) {
  if (item && typeof item === "object") {
    for (const k of ID_FIELD_NAMES) {
      if (typeof item[k] === "string" && item[k].trim()) return item[k];
    }
  }
  return fallback;
}
function getItemTitle(item) {
  if (!item || typeof item !== "object") return null;
  for (const k of TITLE_FIELD_NAMES) {
    if (typeof item[k] === "string" && item[k].trim()) return item[k];
  }
  return null;
}
function getItemStatus(item) {
  if (!item || typeof item !== "object") return null;
  for (const k of STATUS_FIELD_NAMES) {
    if (typeof item[k] === "string" && item[k].trim()) return item[k];
  }
  return null;
}

// Walk a string and replace ID-pattern substrings with chip buttons.
function renderTextWithChips(text) {
  const out = [];
  const s = String(text);
  let last = 0;
  let m;
  ID_PATTERN.lastIndex = 0;
  while ((m = ID_PATTERN.exec(s)) !== null) {
    if (m.index > last) out.push(document.createTextNode(s.slice(last, m.index)));
    out.push(chip(m[0]));
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(document.createTextNode(s.slice(last)));
  return out;
}

function renderScalar(v) {
  if (v == null) {
    return el("span", { style: "color:var(--fg-faint);font-style:italic;" }, "(null)");
  }
  if (typeof v === "boolean" || typeof v === "number") {
    return el("code", { class: "inline" }, String(v));
  }
  const s = String(v);
  if (s.length > 240 || s.includes("\\n")) {
    const det = el("details", { class: "collapsible" });
    det.appendChild(el("summary", {}, "expand (" + s.length + " chars)"));
    const body = el("div", { class: "body" });
    renderTextWithChips(s).forEach(n => body.appendChild(n));
    det.appendChild(body);
    return det;
  }
  const wrap = el("span", {});
  renderTextWithChips(s).forEach(n => wrap.appendChild(n));
  return wrap;
}

function renderObjectAsDl(obj) {
  const dl = el("dl", { style: "margin:0;display:grid;grid-template-columns:max-content 1fr;gap:4px 12px;" });
  if (Object.keys(obj).length === 0) {
    return el("span", { style: "color:var(--fg-faint);font-style:italic;" }, "(empty object)");
  }
  for (const [k, v] of Object.entries(obj)) {
    dl.appendChild(el("dt", { style: "font-family:var(--sans);font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:var(--fg-faint);font-weight:600;" }, k));
    const dd = el("dd", { style: "margin:0;font-size:13px;" });
    dd.appendChild(renderFieldValue(v));
    dl.appendChild(dd);
  }
  return dl;
}

function renderArrayValue(arr) {
  if (arr.length === 0) {
    return el("span", { style: "color:var(--fg-faint);font-style:italic;" }, "(empty array)");
  }
  if (arr.every(x => typeof x === "string")) {
    const c = el("aside", { class: "chips" });
    for (const s of arr) {
      const isId = /^([A-Z]+|[a-z]+)-\\d+$/.test(s);
      if (isId) c.appendChild(chip(s));
      else c.appendChild(el("span", { class: "chip vocab" }, s));
    }
    return c;
  }
  const det = el("details", { class: "collapsible" });
  det.appendChild(el("summary", {}, "array (" + arr.length + " entries)"));
  const body = el("div", { class: "body" });
  arr.forEach((entry, i) => {
    const card = el("div", { style: "border:1px solid var(--border); border-radius: var(--radius-sm); padding: 8px 10px; margin: 6px 0; background: var(--bg-elev);" });
    card.appendChild(el("div", { style: "font-family:var(--mono);font-size:11px;color:var(--fg-faint);margin-bottom:4px;" }, "[" + i + "]"));
    card.appendChild(renderFieldValue(entry));
    body.appendChild(card);
  });
  det.appendChild(body);
  return det;
}

function renderFieldValue(v) {
  if (Array.isArray(v)) return renderArrayValue(v);
  if (v && typeof v === "object") return renderObjectAsDl(v);
  return renderScalar(v);
}

function renderIdentityPanel(block) {
  const panel = el("section", { class: "identity-panel" });
  panel.appendChild(el("h3", {}, "Identity"));
  if (block.identityFields.length === 0) {
    panel.appendChild(el("p", { class: "section-empty" }, "(no top-level scalar/object fields declared by schema)"));
    return panel;
  }
  const dl = el("dl");
  for (const f of block.identityFields) {
    const dt = el("dt", { title: f.description || "" }, f.name);
    dl.appendChild(dt);
    const dd = el("dd", { class: f.present ? "" : "absent" });
    if (!f.present) {
      dd.appendChild(document.createTextNode("(absent)"));
    } else {
      dd.appendChild(renderFieldValue(f.value));
    }
    dl.appendChild(dd);
  }
  panel.appendChild(dl);
  return panel;
}

function renderItemCard(blockName, subPropertyName, idx, item) {
  const fallback = blockName + "." + subPropertyName + "[" + idx + "]";
  const id = getItemId(item, fallback);
  const title = getItemTitle(item);
  const status = getItemStatus(item);
  const searchableText = JSON.stringify(item).toLowerCase();
  const card = el("article", {
    class: "milestone",
    id: id,
    "data-block": blockName,
    "data-id": id,
    "data-status": status || "",
    "data-search": (id + " " + (title || "") + " " + searchableText).toLowerCase(),
  });

  const idBadge = el("span", { class: "id-badge", "data-id": id }, id);
  idBadge.addEventListener("click", () => toggleHighlight(id));
  const head = el("div", { class: "m-head" }, idBadge);
  if (title) head.appendChild(el("span", { class: "m-name" }, title));
  else head.appendChild(el("span", { class: "m-name", style: "color:var(--fg-faint);font-style:italic;" }, "(no title field)"));
  if (status) head.appendChild(statusBadge(status));
  card.appendChild(head);

  if (item == null || typeof item !== "object" || Array.isArray(item)) {
    // Non-object item: render the value as-is below the head.
    const row = el("div", { class: "field-row" }, el("span", { class: "field-label" }, "value"), renderFieldValue(item));
    card.appendChild(row);
    return card;
  }

  for (const [k, v] of Object.entries(item)) {
    if (ID_FIELD_NAMES.includes(k) && v === id) continue;
    if (TITLE_FIELD_NAMES.includes(k) && v === title) continue;
    if (STATUS_FIELD_NAMES.includes(k) && v === status) continue;
    const isLongString = typeof v === "string" && (v.length > 240 || v.includes("\\n"));
    if (isLongString) {
      const det = el("details", { class: "collapsible" });
      det.appendChild(el("summary", {}, k));
      const body = el("div", { class: "body" });
      renderTextWithChips(String(v)).forEach(n => body.appendChild(n));
      det.appendChild(body);
      card.appendChild(det);
      continue;
    }
    const row = el("div", { class: "field-row" },
      el("span", { class: "field-label" }, k),
      renderFieldValue(v),
    );
    card.appendChild(row);
  }
  return card;
}

function renderBlockSection(block) {
  const sec = el("section", { class: "block-section", id: "block-" + block.name });
  const heading = el("h2", {}, block.schemaTitle);
  sec.appendChild(heading);

  const meta = el("p", { class: "block-meta" },
    "canonical: " + block.name +
    " · " + block.identityFields.length + " identity field(s)" +
    " · " + block.itemSubSections.length + " item sub-section(s)" +
    " · " + block.totalItems + " items total" +
    (block.hasSchema ? "" : " · (no schema)") +
    (block.schemaTitleFromFallback && block.hasSchema ? " · (title fallback: schema.title absent)" : ""),
  );
  sec.appendChild(meta);

  if (block.readError) {
    sec.appendChild(el("div", { class: "read-error" }, "Read error: " + block.readError));
    return sec;
  }

  sec.appendChild(renderIdentityPanel(block));

  for (const sub of block.itemSubSections) {
    const subWrap = el("section", { class: "subsection", id: "block-" + block.name + "-sub-" + sub.propertyName });
    subWrap.appendChild(el("h3", {}, sub.propertyName + "  (" + sub.itemCount + ")"));
    if (sub.description) {
      subWrap.appendChild(el("p", { class: "sub-desc" }, sub.description));
    }
    if (sub.itemCount === 0) {
      subWrap.appendChild(el("p", { class: "section-empty" }, "(empty)"));
    } else {
      const grid = el("div", { class: "milestone-grid" });
      sub.items.forEach((it, i) => grid.appendChild(renderItemCard(block.name, sub.propertyName, i, it)));
      subWrap.appendChild(grid);
    }
    sec.appendChild(subWrap);
  }

  return sec;
}

function renderTOC() {
  const toc = document.getElementById("toc");
  for (const block of SUBSTRATE_DATA.blocks) {
    const a = el("a", { href: "#block-" + block.name }, block.schemaTitle);
    toc.appendChild(a);
  }
}

function renderStatusPills() {
  const seen = new Set();
  for (const block of SUBSTRATE_DATA.blocks) {
    for (const sub of block.itemSubSections) {
      for (const it of sub.items) {
        const s = getItemStatus(it);
        if (s) seen.add(s);
      }
    }
  }
  const sorted = Array.from(seen).sort();
  const wrap = document.getElementById("statusPills");
  if (sorted.length === 0) {
    wrap.appendChild(el("span", { style: "font-size:12px;color:var(--fg-faint);" }, "(no status field detected)"));
    return;
  }
  for (const s of sorted) {
    const btn = el("button", { class: "status-pill", "data-status": s, "data-on": "true", type: "button" }, s);
    btn.addEventListener("click", () => {
      const cur = btn.getAttribute("data-on") === "true";
      btn.setAttribute("data-on", String(!cur));
      applyFilters();
    });
    wrap.appendChild(btn);
  }
}

function renderSections() {
  const root = document.getElementById("sections");
  for (const block of SUBSTRATE_DATA.blocks) {
    root.appendChild(renderBlockSection(block));
  }
}

let highlightTimer = null;
function toggleHighlight(id) {
  document.querySelectorAll(".highlighted").forEach(n => n.classList.remove("highlighted"));
  if (highlightTimer) { clearTimeout(highlightTimer); highlightTimer = null; }
  const matches = document.querySelectorAll('[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
  matches.forEach(n => n.classList.add("highlighted"));
  highlightTimer = setTimeout(() => {
    document.querySelectorAll(".highlighted").forEach(n => n.classList.remove("highlighted"));
    highlightTimer = null;
  }, 3000);
  const target = document.getElementById(id);
  if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
}

function applyFilters() {
  const q = document.getElementById("searchInput").value.trim().toLowerCase();
  const onPills = Array.from(document.querySelectorAll(".status-pill[data-on='true']")).map(p => p.getAttribute("data-status"));
  const activeStatuses = new Set(onPills);
  const allPills = document.querySelectorAll(".status-pill");
  const allOn = onPills.length === allPills.length;
  document.querySelectorAll(".milestone").forEach(card => {
    const txt = card.getAttribute("data-search") || "";
    const status = card.getAttribute("data-status") || "";
    const matchesSearch = !q || txt.includes(q);
    const matchesStatus = !status ? true : activeStatuses.has(status) || allOn;
    card.classList.toggle("hidden-by-search", !matchesSearch);
    card.classList.toggle("hidden-by-status", !matchesStatus);
  });
}

function initTheme() {
  const stored = localStorage.getItem("substrate-overview-theme");
  if (stored === "dark") document.documentElement.setAttribute("data-theme", "dark");
  document.getElementById("themeToggle").addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    const next = cur === "dark" ? "light" : "dark";
    if (next === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("substrate-overview-theme", next);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  renderTOC();
  renderStatusPills();
  renderSections();
  document.getElementById("searchInput").addEventListener("input", applyFilters);
});
</script>
</body>
</html>
`;
}

function reportStats(data: SubstrateData): void {
	console.log(`repo HEAD: ${data.repo_head_short}`);
	console.log(`generated_at: ${data.generated_at}`);
	console.log(`block kinds: ${data.blocks.length}`);
	let totalItems = 0;
	let titleFallbacks = 0;
	let readErrors = 0;
	for (const b of data.blocks) {
		totalItems += b.totalItems;
		if (b.schemaTitleFromFallback && b.hasSchema) titleFallbacks++;
		if (b.readError) readErrors++;
		const titleNote = b.schemaTitleFromFallback
			? b.hasSchema
				? "(schema present, no title — fallback to canonical name)"
				: "(no schema — fallback to canonical name)"
			: `title="${b.schemaTitle}"`;
		const errNote = b.readError ? `  [READ ERROR: ${b.readError}]` : "";
		const subNotes = b.itemSubSections.map((s) => `${s.propertyName}=${s.itemCount}`).join(", ");
		console.log(
			`  - ${b.name}: ${b.scalarFieldCount} scalar/object field(s); ${b.arrayPropertyCount} array prop(s) [${subNotes || "—"}]; ${b.totalItems} items total ${titleNote}${errNote}`,
		);
	}
	console.log(`total items: ${totalItems}`);
	if (titleFallbacks > 0) console.log(`schema-title fallbacks: ${titleFallbacks}`);
	if (readErrors > 0) console.log(`read errors: ${readErrors}`);
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	let data: SubstrateData;
	try {
		data = gatherSubstrate(args.cwd);
	} catch (err) {
		console.error(`build-html-views: substrate gather failed: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(2);
	}

	if (args.dryRun) {
		reportStats(data);
		console.log("[dry-run] no file written");
		process.exit(0);
	}

	const html = renderHtml(data);
	const outDir = path.dirname(args.output);
	try {
		fs.mkdirSync(outDir, { recursive: true });
		fs.writeFileSync(args.output, html, "utf-8");
	} catch (err) {
		console.error(
			`build-html-views: write failed at ${args.output}: ${err instanceof Error ? err.message : String(err)}`,
		);
		process.exit(2);
	}
	const bytes = fs.statSync(args.output).size;
	const totalItems = data.blocks.reduce((acc, b) => acc + b.totalItems, 0);
	console.log(`wrote ${args.output} (${bytes} bytes)`);
	console.log(`block kinds: ${data.blocks.length} | total items: ${totalItems} | repo HEAD: ${data.repo_head_short}`);
}

main();
