// POC v2: degree-zero config + closure-table relations + lens rendering + SDK-shape validator.
// Runs read-only against existing .project/issues.json and .project/framework-gaps.json.
// Touches no package source. Dependencies: tsx + ajv (both already in devDeps).
//
// Function signatures below mirror what would later land in pi-project/src/project-sdk.ts.
// A downstream consumer (agent template, /project view <lens> command) calling the eventual
// SDK would use the identical surface — re-pointing requires no consumer-shape change.
//
// v2 closures over v1:
// - #14 referential integrity: standalone validateRelations() joins edges to id index
// - #16 bins enum drift: validator enforces lens-edge parent ∈ lens.bins
// - #17 hierarchy semantics: parent_block / child_block explicit; validator enforces
// - #18 unified edges accessor: synthetic + authored edges flow through one query surface
// - #21 edge schema disambiguation: schema permissive, SDK validation enforces (final decision)
// - #22 render_uncategorized policy: lens spec field, renderer respects
// - #23 naming alias threading: configured names appear in render-context

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ErrorObject } from "ajv";
import _Ajv from "ajv";

// biome-ignore lint/suspicious/noExplicitAny: ESM/CJS interop for AJV — same shim pi-project uses
const Ajv = (_Ajv as any).default ?? _Ajv;

const POC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(POC_DIR, "..", "..");

// ─── envisioned SDK shape — local POC implementations ───

interface ConfigBlock {
	schema_version: string;
	root: string;
	naming?: Record<string, string>;
	partitions: Array<{ name: string; blocks: string[] }>;
	hierarchy?: Array<HierarchyDecl>;
	lenses: Array<LensSpec>;
}

interface HierarchyDecl {
	parent_block: string;
	child_block: string;
	relation_type: string;
}

interface LensSpec {
	id: string;
	target: string;
	relation_type: string;
	derived_from_field: string | null;
	bins: string[];
	render_uncategorized?: boolean;
}

interface Edge {
	parent: string;
	child: string;
	relation_type: string;
}

interface ItemRecord {
	id: string;
	[k: string]: unknown;
}

interface ValidationIssue {
	code: string;
	message: string;
	edge?: Edge;
}

interface ValidationResult {
	status: "clean" | "warnings" | "invalid";
	issues: ValidationIssue[];
}

function loadAndValidate(jsonPath: string, schemaPath: string): unknown {
	const ajv = new Ajv({ allErrors: true, strict: false });
	const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
	const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
	const validate = ajv.compile(schema);
	if (!validate(data)) {
		const errs: ErrorObject[] = validate.errors ?? [];
		const errors = errs.map((e: ErrorObject) => `  ${e.instancePath} ${e.message}`).join("\n");
		throw new Error(`Schema validation failed for ${jsonPath}:\n${errors}`);
	}
	return data;
}

function readBlock(repoRoot: string, root: string, blockName: string): ItemRecord[] {
	const blockPath = path.join(repoRoot, root, `${blockName}.json`);
	const data = JSON.parse(fs.readFileSync(blockPath, "utf8"));
	const arrayKey = Object.keys(data).find((k) => Array.isArray(data[k]));
	if (!arrayKey) throw new Error(`No array property found in ${blockPath}`);
	return data[arrayKey] as ItemRecord[];
}

// ─── #18: unified edges accessor ───

// Synthetic edges for one lens, derived from items at query time.
function synthesizeFromField(lens: LensSpec, items: ItemRecord[]): Edge[] {
	if (lens.derived_from_field === null) return [];
	const field = lens.derived_from_field;
	const out: Edge[] = [];
	for (const item of items) {
		const v = item[field];
		if (typeof v === "string") {
			out.push({ parent: v, child: item.id, relation_type: lens.relation_type });
		}
	}
	return out;
}

// Edges visible to traversal/projection for a given lens.
// Auto-derived: synthesized from field. Hand-curated: filtered from authored.
function edgesForLens(lens: LensSpec, items: ItemRecord[], authoredEdges: Edge[]): Edge[] {
	if (lens.derived_from_field !== null) return synthesizeFromField(lens, items);
	return authoredEdges.filter((e) => e.relation_type === lens.relation_type);
}

// SDK-shape: walk descendants of a node under a relation_type, over any edge set.
function walkDescendants(parentId: string, relationType: string, edges: Edge[]): string[] {
	const out: string[] = [];
	const visited = new Set<string>();
	const stack = [parentId];
	while (stack.length > 0) {
		const node = stack.pop();
		if (node === undefined || visited.has(node)) continue;
		visited.add(node);
		for (const e of edges) {
			if (e.parent === node && e.relation_type === relationType) {
				out.push(e.child);
				stack.push(e.child);
			}
		}
	}
	return out;
}

// ─── #14, #16, #21 cross-doc: validator ───

function validateRelations(
	config: ConfigBlock,
	authoredEdges: Edge[],
	itemsByBlock: Record<string, ItemRecord[]>,
): ValidationResult {
	const issues: ValidationIssue[] = [];

	const lensesByRelType = new Map<string, LensSpec>();
	for (const l of config.lenses) lensesByRelType.set(l.relation_type, l);
	const hierarchyByRelType = new Map<string, HierarchyDecl>();
	for (const h of config.hierarchy ?? []) hierarchyByRelType.set(h.relation_type, h);

	const idIndex = new Map<string, string>();
	for (const [block, items] of Object.entries(itemsByBlock)) {
		for (const i of items) idIndex.set(i.id, block);
	}

	for (const edge of authoredEdges) {
		const lens = lensesByRelType.get(edge.relation_type);
		const hier = hierarchyByRelType.get(edge.relation_type);

		if (!lens && !hier) {
			issues.push({
				code: "edge_unknown_relation_type",
				message: `relation_type '${edge.relation_type}' matches no lens or hierarchy declaration`,
				edge,
			});
			continue;
		}

		if (lens) {
			if (!lens.bins.includes(edge.parent)) {
				issues.push({
					code: "edge_parent_not_in_bins",
					message: `lens-edge parent '${edge.parent}' is not in lens '${lens.id}' bins`,
					edge,
				});
			}
			const childBlock = idIndex.get(edge.child);
			if (!childBlock) {
				issues.push({
					code: "edge_unresolved_child",
					message: `lens-edge child '${edge.child}' not found in any loaded block`,
					edge,
				});
			} else if (childBlock !== lens.target) {
				issues.push({
					code: "edge_child_wrong_block",
					message: `lens-edge child '${edge.child}' in block '${childBlock}', expected lens.target '${lens.target}'`,
					edge,
				});
			}
		}

		if (hier) {
			const parentBlock = idIndex.get(edge.parent);
			if (!parentBlock) {
				issues.push({
					code: "edge_unresolved_parent",
					message: `hierarchy-edge parent '${edge.parent}' not found in any loaded block`,
					edge,
				});
			} else if (parentBlock !== hier.parent_block) {
				issues.push({
					code: "edge_parent_wrong_block",
					message: `hierarchy-edge parent '${edge.parent}' in block '${parentBlock}', expected '${hier.parent_block}'`,
					edge,
				});
			}
			const childBlock = idIndex.get(edge.child);
			if (!childBlock) {
				issues.push({
					code: "edge_unresolved_child",
					message: `hierarchy-edge child '${edge.child}' not found in any loaded block`,
					edge,
				});
			} else if (childBlock !== hier.child_block) {
				issues.push({
					code: "edge_child_wrong_block",
					message: `hierarchy-edge child '${edge.child}' in block '${childBlock}', expected '${hier.child_block}'`,
					edge,
				});
			}
		}
	}

	const status: ValidationResult["status"] = issues.length === 0 ? "clean" : "invalid";
	return { status, issues };
}

// ─── grouping + rendering ───

function groupByLens(items: ItemRecord[], lens: LensSpec, lensEdges: Edge[]): Map<string, ItemRecord[]> {
	const grouped = new Map<string, ItemRecord[]>();
	for (const bin of lens.bins) grouped.set(bin, []);
	grouped.set("(uncategorized)", []);

	const itemById = new Map(items.map((i) => [i.id, i]));
	const placedIds = new Set<string>();
	for (const e of lensEdges) {
		const item = itemById.get(e.child);
		if (item && lens.bins.includes(e.parent)) {
			grouped.get(e.parent)?.push(item);
			placedIds.add(item.id);
		}
	}
	for (const item of items) {
		if (!placedIds.has(item.id)) grouped.get("(uncategorized)")?.push(item);
	}
	return grouped;
}

// #23: alias resolver — canonical id → display name, defaulting to canonical id.
function displayName(canonicalId: string, naming: Record<string, string> | undefined): string {
	if (!naming) return canonicalId;
	return naming[canonicalId] ?? canonicalId;
}

function renderClusterView(
	lens: LensSpec,
	grouped: Map<string, ItemRecord[]>,
	naming: Record<string, string> | undefined,
	statusFilter?: (item: ItemRecord) => boolean,
): string {
	const lines: string[] = [];
	lines.push(`# Lens: ${lens.id}`);
	lines.push("");
	lines.push(`**Target block:** ${displayName(lens.target, naming)}  `);
	lines.push(`**Relation type:** ${lens.relation_type}  `);
	lines.push(
		`**Source:** ${
			lens.derived_from_field !== null
				? `auto-derived from \`${lens.derived_from_field}\` field`
				: "hand-curated edges in relations.json"
		}`,
	);
	const renderUncat = lens.render_uncategorized !== false;
	lines.push(`**Render uncategorized:** ${renderUncat}`);
	lines.push("");

	const bins = renderUncat ? lens.bins.concat(["(uncategorized)"]) : lens.bins;
	let totalItems = 0;
	for (const bin of bins) {
		const items = (grouped.get(bin) ?? []).filter((i) => (statusFilter ? statusFilter(i) : true));
		if (items.length === 0) continue;
		lines.push(`## ${bin}`);
		lines.push("");
		for (const item of items) {
			const titleStr = typeof item.title === "string" ? item.title : "(no title)";
			const status = typeof item.status === "string" ? ` [${item.status}]` : "";
			const pkg = typeof item.package === "string" ? ` — \`${item.package}\`` : "";
			lines.push(`- **${item.id}**${status}${pkg} — ${titleStr}`);
			totalItems++;
		}
		lines.push("");
	}

	lines.push("---");
	lines.push("");
	lines.push(`**Total items rendered:** ${totalItems}`);
	return lines.join("\n");
}

// ─── #15 partial: curation surface shape ───

interface CurationSuggestion {
	would_append_to: string;
	payload: Edge;
}

function listUncategorized(
	lens: LensSpec,
	grouped: Map<string, ItemRecord[]>,
): { uncategorized: ItemRecord[]; suggestionTemplate: (binName: string, item: ItemRecord) => CurationSuggestion } {
	const uncat = grouped.get("(uncategorized)") ?? [];
	const suggestionTemplate = (binName: string, item: ItemRecord): CurationSuggestion => ({
		would_append_to: "relations.json#/edges",
		payload: { parent: binName, child: item.id, relation_type: lens.relation_type },
	});
	return { uncategorized: uncat, suggestionTemplate };
}

// ─── validation demo: synthetic bad edges to prove validator catches them ───

function runValidationDemo(config: ConfigBlock, itemsByBlock: Record<string, ItemRecord[]>): void {
	console.log("\n─── Validation demo: synthetic bad edges ───");
	const synthetic: Edge[] = [
		{ parent: "typo-bin", child: "issue-008", relation_type: "context-mgmt-concern" },
		{ parent: "context-projection", child: "issue-9999", relation_type: "context-mgmt-concern" },
		{ parent: "FGAP-001", child: "issue-055", relation_type: "unknown-relation" },
		{ parent: "issue-001", child: "issue-002", relation_type: "gap-membership" },
	];
	const result = validateRelations(config, synthetic, itemsByBlock);
	console.log(`Status: ${result.status} (expected: invalid)`);
	for (const issue of result.issues) {
		const edgeStr = issue.edge ? ` [${issue.edge.parent} → ${issue.edge.child} : ${issue.edge.relation_type}]` : "";
		console.log(`  - ${issue.code}: ${issue.message}${edgeStr}`);
	}
}

// ─── POC v2 entry point ───

// Resolve which config + relations files to use based on optional CLI suffix.
// Examples:
//   npx tsx render.ts            → config.json + relations.json → output/primary/
//   npx tsx render.ts alt        → config-alt.json + relations-alt.json → output/alt/
function resolveProfile(): { configPath: string; relationsPath: string; outputSubdir: string; label: string } {
	const suffix = process.argv[2];
	if (!suffix) {
		return {
			configPath: path.join(POC_DIR, "config.json"),
			relationsPath: path.join(POC_DIR, "relations.json"),
			outputSubdir: "primary",
			label: "primary",
		};
	}
	return {
		configPath: path.join(POC_DIR, `config-${suffix}.json`),
		relationsPath: path.join(POC_DIR, `relations-${suffix}.json`),
		outputSubdir: suffix,
		label: suffix,
	};
}

function loadConfigFrom(jsonPath: string): ConfigBlock {
	return loadAndValidate(jsonPath, path.join(POC_DIR, "schemas", "config.schema.json")) as ConfigBlock;
}

function loadRelationsFrom(jsonPath: string): Edge[] {
	const data = loadAndValidate(jsonPath, path.join(POC_DIR, "schemas", "relations.schema.json")) as { edges: Edge[] };
	return data.edges;
}

function main(): void {
	const profile = resolveProfile();
	console.log(`\n=== POC profile: ${profile.label} ===`);
	console.log(`config:    ${path.relative(REPO_ROOT, profile.configPath)}`);
	console.log(`relations: ${path.relative(REPO_ROOT, profile.relationsPath)}`);

	const config = loadConfigFrom(profile.configPath);
	const authoredEdges = loadRelationsFrom(profile.relationsPath);

	console.log(
		`Loaded config (schema_version=${config.schema_version}, root=${config.root}, lenses=${config.lenses.length})`,
	);
	console.log(`Loaded ${authoredEdges.length} authored edges across ${new Set(authoredEdges.map((e) => e.relation_type)).size} relation_type(s)`);

	const issues = readBlock(REPO_ROOT, config.root, "issues");
	const gaps = readBlock(REPO_ROOT, config.root, "framework-gaps");
	console.log(`Read ${issues.length} issues + ${gaps.length} framework-gaps from ${config.root}/`);

	const itemsByBlock: Record<string, ItemRecord[]> = { issues, "framework-gaps": gaps };

	// #14, #16, #21 cross-doc: validate authored edges against config + loaded items
	const validation = validateRelations(config, authoredEdges, itemsByBlock);
	console.log(`\nRelations validation: status=${validation.status}, issues=${validation.issues.length}`);
	if (validation.status !== "clean") {
		for (const issue of validation.issues) console.log(`  - ${issue.code}: ${issue.message}`);
	}

	const outputDir = path.join(POC_DIR, "output", profile.outputSubdir);
	fs.mkdirSync(outputDir, { recursive: true });

	const openOnly = (item: ItemRecord) => item.status !== "resolved";

	for (const lens of config.lenses) {
		const targetItems = itemsByBlock[lens.target] ?? [];
		// #18: unified accessor
		const lensEdges = edgesForLens(lens, targetItems, authoredEdges);
		const grouped = groupByLens(targetItems, lens, lensEdges);
		// #23: pass naming aliases
		const md = renderClusterView(lens, grouped, config.naming, openOnly);
		const outPath = path.join(outputDir, `${lens.id}.md`);
		fs.writeFileSync(outPath, md);
		console.log(`Wrote ${path.relative(REPO_ROOT, outPath)} (${md.split("\n").length} lines)`);

		// #15 partial: emit one curation suggestion as shape demonstration
		if (lens.derived_from_field === null) {
			const { uncategorized, suggestionTemplate } = listUncategorized(lens, grouped);
			const openUncat = uncategorized.filter(openOnly);
			if (openUncat.length > 0) {
				const sample = openUncat[0];
				if (sample) {
					const suggestion = suggestionTemplate(lens.bins[0] ?? "TODO", sample);
					console.log(
						`  curation: ${openUncat.length} uncategorized in lens '${lens.id}'. Sample suggestion: append ${JSON.stringify(suggestion.payload)} to ${suggestion.would_append_to}`,
					);
				}
			}
		}
	}

	// Demonstrate walkDescendants over the unified edge set (authored + synthetic)
	const synthEdges = config.lenses.flatMap((l) => synthesizeFromField(l, itemsByBlock[l.target] ?? []));
	const allEdges = [...authoredEdges, ...synthEdges];
	const piJitChildren = walkDescendants("pi-jit-agents", "package-membership", allEdges);
	const fgap1Children = walkDescendants("FGAP-001", "gap-membership", allEdges);
	console.log(`\nwalkDescendants('pi-jit-agents', 'package-membership'): ${piJitChildren.length} ids`);
	console.log(`walkDescendants('FGAP-001', 'gap-membership'): ${fgap1Children.length} ids → [${fgap1Children.join(", ")}]`);

	if (!process.argv[2]) runValidationDemo(config, itemsByBlock);

	console.log(`\nPOC v2 profile '${profile.label}' complete.`);
}

main();
