/**
 * Lens-view consumption surface — pure functions that wrap the substrate SDK
 * for use by /project view, /project lens-curate, and the substrate pi tools.
 *
 * Pure functions (no ExtensionCommandContext / ExtensionContext required) so
 * tests can call them directly. Subcommand handlers and tool execute() shells
 * in index.ts are thin wrappers that route results to ctx.ui.notify or
 * AgentToolResult.
 */
import { readBlock } from "./block-api.js";
import {
	type CurationSuggestion,
	type Edge,
	edgesForLens,
	getProjectContext,
	groupByLens,
	type ItemRecord,
	type LensSpec,
	listUncategorized,
	resolveComposition,
	type SubstrateValidationResult,
	validateRelations,
	walkDescendants,
} from "./project-context.js";
import { availableBlocks } from "./project-sdk.js";

export interface LoadedLensView {
	lens: LensSpec;
	items: ItemRecord[];
	edges: Edge[];
	grouped: Map<string, ItemRecord[]>;
	uncategorized: ItemRecord[];
	suggestionTemplate: (binName: string, item: ItemRecord) => CurationSuggestion;
}

/**
 * Resolve a named lens, read its target items, compute edges + grouping.
 * Returns either the loaded view or a structured error for the caller to
 * surface via ctx.ui.notify or as a tool error result.
 */
export function loadLensView(cwd: string, lensId: string): LoadedLensView | { error: string } {
	const ctx = getProjectContext(cwd);
	if (!ctx.config) {
		return { error: "No .project/config.json — run /project init first, then declare lenses + install assets." };
	}
	const lens = ctx.config.lenses.find((l) => l.id === lensId);
	if (!lens) {
		const known = ctx.config.lenses.map((l) => l.id).join(", ") || "(none)";
		return { error: `Lens '${lensId}' not found in config. Known lenses: ${known}` };
	}

	// Composition dispatch (FGAP-012): kind="composition" lenses route through
	// resolveComposition which walks members[] and returns a unioned item set.
	// Catches composition_cycle_detected and other resolution errors as { error }.
	if (lens.kind === "composition") {
		let items: ItemRecord[];
		try {
			const composed = resolveComposition(cwd, lens);
			items = composed.unionedItems;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return { error: `Cannot resolve composition lens '${lensId}': ${msg}` };
		}
		const edges = edgesForLens(lens, items, ctx.relations);
		const grouped = groupByLens(items, lens, edges);
		const { uncategorized, suggestionTemplate } = listUncategorized(lens, grouped);
		return { lens, items, edges, grouped, uncategorized, suggestionTemplate };
	}

	// Target-lens path (existing semantics).
	if (!lens.target) {
		return { error: `Lens '${lensId}' is kind=target but missing required field 'target'.` };
	}
	const targetBlock = lens.target;
	let items: ItemRecord[];
	try {
		const data = readBlock(cwd, targetBlock) as Record<string, unknown>;
		const arrayKey = Object.keys(data).find((k) => Array.isArray(data[k]));
		if (!arrayKey) {
			return { error: `Block '${targetBlock}' (target of lens '${lensId}') has no array property to project.` };
		}
		items = data[arrayKey] as ItemRecord[];
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return { error: `Cannot read lens.target block '${targetBlock}': ${msg}` };
	}
	const edges = edgesForLens(lens, items, ctx.relations);
	const grouped = groupByLens(items, lens, edges);
	const { uncategorized, suggestionTemplate } = listUncategorized(lens, grouped);
	return { lens, items, edges, grouped, uncategorized, suggestionTemplate };
}

/**
 * Render a loaded lens view as markdown. Bins become headings; items become
 * bullet lines with id + status + title (when present). Honors
 * lens.render_uncategorized — when false, the uncategorized bucket is
 * omitted from the output.
 */
export function renderLensView(view: LoadedLensView, naming: Record<string, string> | undefined): string {
	const lines: string[] = [];
	const isComposition = view.lens.kind === "composition";
	const targetLabel = isComposition
		? `${(view.lens.targets ?? []).map((t) => naming?.[t] ?? t).join(", ")} (composition)`
		: ((view.lens.target ? naming?.[view.lens.target] : undefined) ?? view.lens.target ?? "(unknown)");
	lines.push(`# Lens: ${view.lens.id}`);
	lines.push("");
	lines.push(`**Target:** ${targetLabel}  `);
	lines.push(
		`**Relation type:** ${view.lens.relation_type ?? "(none — composition aggregates without a binding relation_type)"}  `,
	);
	lines.push(
		`**Source:** ${
			isComposition
				? `composition over ${(view.lens.members ?? []).length} member declaration(s)`
				: view.lens.derived_from_field
					? `auto-derived from \`${view.lens.derived_from_field}\` field`
					: "hand-curated edges in relations.json"
		}`,
	);
	const renderUncat = view.lens.render_uncategorized !== false;
	lines.push(`**Render uncategorized:** ${renderUncat}`);
	lines.push("");

	const bins = renderUncat ? view.lens.bins.concat(["(uncategorized)"]) : view.lens.bins;
	let totalItems = 0;
	for (const bin of bins) {
		const items = view.grouped.get(bin) ?? [];
		if (items.length === 0) continue;
		lines.push(`## ${bin}`);
		lines.push("");
		for (const item of items) {
			const titleStr = typeof item.title === "string" ? item.title : "(no title)";
			const status = typeof item.status === "string" ? ` [${item.status}]` : "";
			lines.push(`- **${item.id}**${status} — ${titleStr}`);
			totalItems++;
		}
		lines.push("");
	}

	lines.push("---");
	lines.push("");
	lines.push(`**Total items rendered:** ${totalItems}`);
	return lines.join("\n");
}

/**
 * Build a follow-up-turn instruction for the LLM — list every uncategorized
 * item plus a suggested append-block-item call shape. The LLM acts on the
 * suggestions by calling append-block-item directly with the relations
 * block; no new write surface is introduced.
 */
export function buildCurationSuggestions(view: LoadedLensView): string {
	const lines: string[] = [];
	lines.push(`## Lens curation: ${view.lens.id}`);
	lines.push("");
	lines.push(
		`Lens \`${view.lens.id}\` (target: \`${view.lens.target}\`, relation_type: \`${view.lens.relation_type}\`) has ${view.uncategorized.length} uncategorized item(s). Available bins: ${view.lens.bins.map((b) => `\`${b}\``).join(", ")}.`,
	);
	lines.push("");
	lines.push(
		'For each uncategorized item below, decide which bin (if any) it belongs to. Persist each decision by calling the **append-block-item** tool with `name: "relations"`, `arrayKey: "edges"`, and the suggested item payload (replace `<bin>` with your chosen bin name).',
	);
	lines.push("");
	lines.push("Items not belonging in any bin can be skipped — they remain uncategorized for future curation.");
	lines.push("");

	for (const item of view.uncategorized) {
		const titleStr = typeof item.title === "string" ? item.title : "(no title)";
		const status = typeof item.status === "string" ? ` [${item.status}]` : "";
		lines.push(`### ${item.id}${status}`);
		lines.push("");
		lines.push(`- **Title:** ${titleStr}`);
		const samplePayload = view.suggestionTemplate(view.lens.bins[0] ?? "<bin>", item).payload;
		const stringified = JSON.stringify({ ...samplePayload, parent: "<bin>" });
		lines.push(
			`- **Suggested call:** \`append-block-item({ name: "relations", arrayKey: "edges", item: ${stringified} })\``,
		);
		lines.push("");
	}

	return lines.join("\n");
}

/**
 * Validate the substrate relations across all loaded blocks. Reads config
 * + relations + every available block's items, calls validateRelations.
 * Returns the SubstrateValidationResult unchanged.
 */
export function validateProjectRelations(cwd: string): SubstrateValidationResult {
	const ctx = getProjectContext(cwd);
	if (!ctx.config) {
		return {
			status: "invalid",
			issues: [
				{
					code: "edge_unknown_relation_type",
					message: "No .project/config.json — cannot validate relations without config (declares hierarchy + lenses).",
				},
			],
		};
	}
	const itemsByBlock: Record<string, ItemRecord[]> = {};
	for (const blockInfo of availableBlocks(cwd)) {
		try {
			const data = readBlock(cwd, blockInfo.name) as Record<string, unknown>;
			const arrayKey = Object.keys(data).find((k) => Array.isArray(data[k]));
			if (!arrayKey) continue;
			itemsByBlock[blockInfo.name] = data[arrayKey] as ItemRecord[];
		} catch {
			/* skip unreadable blocks */
		}
	}
	return validateRelations(ctx.config, ctx.relations, itemsByBlock);
}

/**
 * Resolve a named lens and return its materialized Edge[] — synthetic from
 * derived_from_field, or filtered authored edges for hand-curated lenses.
 */
export function edgesForLensByName(cwd: string, lensId: string): Edge[] | { error: string } {
	const ctx = getProjectContext(cwd);
	if (!ctx.config) return { error: "No .project/config.json — run /project init first." };
	const lens = ctx.config.lenses.find((l) => l.id === lensId);
	if (!lens) {
		const known = ctx.config.lenses.map((l) => l.id).join(", ") || "(none)";
		return { error: `Lens '${lensId}' not found in config. Known lenses: ${known}` };
	}
	let items: ItemRecord[] = [];
	if (lens.kind === "composition") {
		try {
			items = resolveComposition(cwd, lens).unionedItems;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return { error: `Cannot resolve composition lens '${lensId}': ${msg}` };
		}
	} else if (lens.target) {
		try {
			const data = readBlock(cwd, lens.target) as Record<string, unknown>;
			const arrayKey = Object.keys(data).find((k) => Array.isArray(data[k]));
			if (arrayKey) items = data[arrayKey] as ItemRecord[];
		} catch {
			/* lens.target block may not exist — return synthetic-from-empty (which is []) */
		}
	}
	return edgesForLens(lens, items, ctx.relations);
}

/**
 * Walk closure-table descendants of parentId under the given relation_type.
 * Returns the descendant id list (may be empty if parentId has no children
 * under the relation_type, or if relations.json is absent).
 */
export function walkLensDescendants(cwd: string, parentId: string, relationType: string): string[] {
	const ctx = getProjectContext(cwd);
	return walkDescendants(parentId, relationType, ctx.relations);
}
