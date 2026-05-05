// POC E — relation-type registry with category-driven dispatch.
//
// Empirically demonstrates the candidate articulation's relation_types claim:
// config.relation_types[] declares each relation_type with a category. The validator
// reads category from config and dispatches to the matching category-handler. Adding
// a new relation_type with an existing category requires zero code change; adding a
// new category requires only registering a new handler.
//
// Two relation_types live side-by-side in this fixture:
//   - phase_depends_on  (category=ordering)   → topological sort + cycle detection
//   - consumes          (category=data_flow)  → upstream-content-hash propagation
//
// Single render.ts invocation produces both reports.
//
// Node builtins + JSON only. No third-party deps. No AJV at this layer (POC scope —
// the production pi-context layer adds AJV-at-every-write).

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const POC_DIR = path.dirname(fileURLToPath(import.meta.url));

// ─── envisioned SDK shape — local POC implementations ───

interface RelationTypeDecl {
	name: string;
	category: string;
	cycle_allowed: boolean;
	description?: string;
}

interface ConfigBlock {
	schema_version: string;
	root: string;
	relation_types: RelationTypeDecl[];
}

interface Edge {
	parent: string;
	child: string;
	relation_type: string;
}

interface ItemRecord {
	id: string;
	title?: string;
	body?: string;
	[k: string]: unknown;
}

// Category handler contract: given the relation-type declaration, the edges authored
// under that relation_type, and the item universe, produce a report. Handlers are
// looked up by category, NOT by relation_type name — adding a second `ordering`
// relation_type (e.g., `task_blocks_on`) routes through the same handler with no code change.
type CategoryHandler = (decl: RelationTypeDecl, edges: Edge[], items: ItemRecord[]) => string;

// ─── ordering category: topological sort + cycle detection ───

function orderingHandler(decl: RelationTypeDecl, edges: Edge[], items: ItemRecord[]): string {
	const lines: string[] = [];
	lines.push(`# Ordering validation — relation_type \`${decl.name}\``);
	lines.push("");
	lines.push(`**category:** \`${decl.category}\`  `);
	lines.push(`**cycle_allowed:** ${decl.cycle_allowed}  `);
	lines.push(`**edges:** ${edges.length}  `);
	lines.push(`**items in scope:** ${items.length}`);
	lines.push("");

	// Build adjacency + in-degree from edges only (parent → child).
	const inDeg = new Map<string, number>();
	const adj = new Map<string, string[]>();
	for (const item of items) {
		inDeg.set(item.id, 0);
		adj.set(item.id, []);
	}
	for (const e of edges) {
		adj.get(e.parent)?.push(e.child);
		inDeg.set(e.child, (inDeg.get(e.child) ?? 0) + 1);
	}

	// Kahn's algorithm.
	const queue: string[] = [];
	for (const [id, d] of inDeg) if (d === 0) queue.push(id);
	queue.sort();
	const topo: string[] = [];
	while (queue.length > 0) {
		const node = queue.shift();
		if (node === undefined) break;
		topo.push(node);
		for (const child of adj.get(node) ?? []) {
			inDeg.set(child, (inDeg.get(child) ?? 0) - 1);
			if (inDeg.get(child) === 0) queue.push(child);
		}
		queue.sort();
	}

	const cycleDetected = topo.length !== items.length;
	lines.push("## Cycle check");
	lines.push("");
	if (cycleDetected) {
		const unsorted = items.filter((i) => !topo.includes(i.id)).map((i) => i.id);
		lines.push(`**Result:** CYCLE DETECTED — ${unsorted.length} item(s) not topologically sortable: ${unsorted.join(", ")}`);
		if (!decl.cycle_allowed) {
			lines.push("");
			lines.push(`**Verdict:** INVALID — \`cycle_allowed\` is false for this relation_type.`);
		}
	} else {
		lines.push("**Result:** acyclic");
		lines.push("");
		lines.push(`**Verdict:** ${decl.cycle_allowed ? "OK (cycles permitted, none present)" : "OK (cycle_allowed=false enforced, none present)"}`);
	}
	lines.push("");

	lines.push("## Topological order");
	lines.push("");
	lines.push("```");
	lines.push(`[${topo.join(", ")}]`);
	lines.push("```");
	lines.push("");

	lines.push("## Edges");
	lines.push("");
	for (const e of edges) lines.push(`- \`${e.parent}\` → \`${e.child}\``);
	lines.push("");
	return lines.join("\n");
}

// ─── data_flow category: content-hash propagation simulation ───

function hashItem(item: ItemRecord): string {
	const canonical = JSON.stringify({ id: item.id, title: item.title ?? null, body: item.body ?? null });
	return createHash("sha256").update(canonical).digest("hex").slice(0, 12);
}

function dataFlowHandler(decl: RelationTypeDecl, edges: Edge[], items: ItemRecord[]): string {
	const lines: string[] = [];
	lines.push(`# Data-flow validation — relation_type \`${decl.name}\``);
	lines.push("");
	lines.push(`**category:** \`${decl.category}\`  `);
	lines.push(`**cycle_allowed:** ${decl.cycle_allowed}  `);
	lines.push(`**edges:** ${edges.length}  `);
	lines.push(`**items in scope:** ${items.length}`);
	lines.push("");

	// Build child → [parent] index from edges.
	const upstreamOf = new Map<string, string[]>();
	for (const item of items) upstreamOf.set(item.id, []);
	for (const e of edges) upstreamOf.get(e.child)?.push(e.parent);

	const itemById = new Map(items.map((i) => [i.id, i] as const));
	const ownHash = new Map<string, string>();
	for (const item of items) ownHash.set(item.id, hashItem(item));

	// Composite hash = own hash + sorted upstream composite hashes. Stable per upstream content.
	const compositeHash = new Map<string, string>();
	function composite(id: string): string {
		const cached = compositeHash.get(id);
		if (cached) return cached;
		const ups = (upstreamOf.get(id) ?? []).slice().sort();
		const upsHashes = ups.map(composite).join("|");
		const own = ownHash.get(id) ?? "";
		const h = createHash("sha256").update(`${own}::${upsHashes}`).digest("hex").slice(0, 12);
		compositeHash.set(id, h);
		return h;
	}

	lines.push("## Per-item upstream dependency report");
	lines.push("");
	lines.push("| Item | Own hash | Upstream count | Upstream ids | Composite hash |");
	lines.push("|------|----------|----------------|--------------|----------------|");
	for (const item of items) {
		const ups = upstreamOf.get(item.id) ?? [];
		const upStr = ups.length === 0 ? "(none)" : ups.map((id) => `\`${id}\``).join(", ");
		lines.push(`| \`${item.id}\` | \`${ownHash.get(item.id)}\` | ${ups.length} | ${upStr} | \`${composite(item.id)}\` |`);
	}
	lines.push("");

	// Simulate: mutate PHASE-A and re-derive composites; downstream consumers see different composite.
	lines.push("## Propagation simulation");
	lines.push("");
	lines.push("Mutating `PHASE-A.body` and re-deriving composite hashes. Items with `PHASE-A`");
	lines.push("transitively upstream MUST observe a different composite hash; others MUST not.");
	lines.push("");

	const mutated: ItemRecord[] = items.map((i) =>
		i.id === "PHASE-A" ? { ...i, body: `${i.body ?? ""}\n[mutated for propagation simulation]` } : i,
	);
	const ownHash2 = new Map<string, string>();
	for (const item of mutated) ownHash2.set(item.id, hashItem(item));
	const compositeHash2 = new Map<string, string>();
	function composite2(id: string): string {
		const cached = compositeHash2.get(id);
		if (cached) return cached;
		const ups = (upstreamOf.get(id) ?? []).slice().sort();
		const upsHashes = ups.map(composite2).join("|");
		const own = ownHash2.get(id) ?? "";
		const h = createHash("sha256").update(`${own}::${upsHashes}`).digest("hex").slice(0, 12);
		compositeHash2.set(id, h);
		return h;
	}

	lines.push("| Item | Composite (round 1) | Composite (round 2, after PHASE-A mutation) | Re-render? |");
	lines.push("|------|----------------------|----------------------------------------------|------------|");
	for (const item of items) {
		const c1 = composite(item.id);
		const c2 = composite2(item.id);
		const changed = c1 !== c2;
		lines.push(`| \`${item.id}\` | \`${c1}\` | \`${c2}\` | ${changed ? "yes" : "no (cached)"} |`);
	}
	lines.push("");

	// Identify items with the most upstream dependencies (showcase: PHASE-E).
	const ranked = items
		.map((i) => ({ id: i.id, count: (upstreamOf.get(i.id) ?? []).length }))
		.filter((r) => r.count > 0)
		.sort((a, b) => b.count - a.count);
	lines.push("## Items with upstream dependencies");
	lines.push("");
	for (const r of ranked) {
		const ups = upstreamOf.get(r.id) ?? [];
		const titleStr = itemById.get(r.id)?.title ?? "";
		lines.push(`- \`${r.id}\` (${titleStr}) — ${r.count} upstream: ${ups.map((u) => `\`${u}\``).join(", ")}`);
	}
	lines.push("");
	return lines.join("\n");
}

// ─── category dispatch — table-driven, NOT relation_type-name-driven ───

const CATEGORY_HANDLERS: Record<string, CategoryHandler> = {
	ordering: orderingHandler,
	data_flow: dataFlowHandler,
};

// ─── loaders ───

function loadConfig(): ConfigBlock {
	const raw = fs.readFileSync(path.join(POC_DIR, "config.json"), "utf8");
	return JSON.parse(raw) as ConfigBlock;
}

function loadEdges(): Edge[] {
	const raw = fs.readFileSync(path.join(POC_DIR, "data", "relations.json"), "utf8");
	const parsed = JSON.parse(raw) as { edges: Edge[] };
	return parsed.edges;
}

function loadItems(): ItemRecord[] {
	const raw = fs.readFileSync(path.join(POC_DIR, "data", "items.json"), "utf8");
	const parsed = JSON.parse(raw) as { items: ItemRecord[] };
	return parsed.items;
}

// ─── entry point ───

function main(): void {
	console.log("\n=== POC E — relation-type registry ===");

	const cfg = loadConfig();
	const edges = loadEdges();
	const items = loadItems();
	console.log(
		`Loaded config (schema_version=${cfg.schema_version}, relation_types=${cfg.relation_types.length}), ${edges.length} edges, ${items.length} items.`,
	);

	const outDir = path.join(POC_DIR, "output");
	fs.mkdirSync(outDir, { recursive: true });

	const written: string[] = [];
	for (const decl of cfg.relation_types) {
		// Dispatch by category, NOT by relation_type name.
		const handler = CATEGORY_HANDLERS[decl.category];
		if (!handler) {
			throw new Error(
				`No handler registered for category '${decl.category}' (relation_type '${decl.name}'). Register a CategoryHandler in CATEGORY_HANDLERS.`,
			);
		}
		const subset = edges.filter((e) => e.relation_type === decl.name);
		const report = handler(decl, subset, items);
		const outName = decl.category === "ordering" ? "ordering-validation.md" : "data-flow-validation.md";
		const outPath = path.join(outDir, outName);
		fs.writeFileSync(outPath, report);
		const rel = path.relative(POC_DIR, outPath);
		written.push(rel);
		console.log(`  ${decl.name} (category=${decl.category}) → wrote ${rel} (${subset.length} edges processed)`);
	}

	console.log(`\nPOC E complete. ${written.length} report(s) written.`);
}

main();
