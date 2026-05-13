/**
 * gatherExecutionContext primitive — work-unit-driven context bundling per
 * DEC-0017. Reads the unit + reads its context-contract (keyed by unit_kind)
 * + walks each declared relation_type in the contract bidirectionally per
 * direction semantic + resolves reached ids to full items via the bulk
 * resolver + returns the composed ContextBundle as one structured payload.
 *
 * Closure scope: this module closes FGAP-031 (gather-execution-context
 * primitive) by composing existing pieces:
 *   - filterBlockItems (project-sdk.ts; TASK-034 / Phase 2.1) — locates the
 *     context-contract entry by unit_kind without scanning the whole block.
 *   - resolveItemsByIds (project-sdk.ts; TASK-035 / Phase 2.2) — cross-block
 *     bulk lookup over a single buildIdIndex traversal; used twice (once to
 *     read the unit by id, once to resolve reached ids per relation_type).
 *   - walkAncestors / walkDescendants / findReferences (project-context.ts;
 *     TASK-036/037 / Phase 2.3/2.4) — closure-table traversal primitives.
 *   - loadRelations (project-context.ts existing) — single substrate read of
 *     relations.json reused across every declared relation_type's walk; the
 *     traversal primitives operate on the loaded Edge[] in-memory rather
 *     than re-reading disk per relation_type.
 *
 * Direction semantics (BundleRelationTypeSpec.direction):
 *   "in"   — walk inbound chain (walkAncestors) — items that point AT the
 *            unit through this relation_type (e.g. constrained_by edges
 *            where unit is the constrained child).
 *   "out"  — walk outbound chain (walkDescendants) — items the unit points
 *            AT through this relation_type.
 *   "both" — union of in + out as a deduped id set.
 *
 * Depth bound: callers MAY override per-spec.max_depth via args.maxDepth;
 * the effective depth is `Math.min(args.maxDepth, spec.max_depth)`. The
 * traversal primitives themselves are visited-set bounded but not currently
 * depth-bounded (cycle-safe via the visited set); recording the effective
 * depth on the bundle preserves the contract surface for a future
 * depth-bounded variant (FGAP-029 depth-bound territory) without breaking
 * the current callable shape.
 *
 * Error surface: returns `{ error: string }` (NOT throw) for three failure
 * modes:
 *   - unit id not found in the cross-block index.
 *   - context-contracts read failure (e.g. schema absent / corrupt file).
 *   - no context-contract entry matches the requested unit_kind.
 * Other errors (relations.json schema failure, block-file parse failure)
 * propagate as throws via the underlying primitives — these are substrate
 * corruption, not lookup misses.
 *
 * Per DEC-0019 dual-surface pattern: this library function pairs with the
 * gather-execution-context pi tool (index.ts) and the orchestrator script
 * scripts/orchestrator/gather-execution-context.ts; all three ship as one
 * atomic unit. TASK-039 / Phase 3 sub-phase 3.2.
 */

import { loadRelations, walkAncestors, walkDescendants } from "./project-context.js";
import { filterBlockItems, resolveItemsByIds } from "./project-sdk.js";

/**
 * One entry in a context-contract's bundle_relation_types[] — declares a
 * relation_type to walk, the direction of traversal, the per-relation depth
 * bound, and an optional applicability_predicate (FGAP-010 territory;
 * reserved, not yet consumed by this primitive).
 */
export interface BundleRelationTypeSpec {
	relation_type: string;
	direction: "in" | "out" | "both";
	max_depth: number;
	applicability_predicate?: string;
}

/**
 * Context-contract block-item shape (matches the registry schema at
 * `packages/pi-context/registry/schemas/context-contracts.schema.json`).
 * Re-declared here at the consumer boundary rather than imported from a
 * generated types module — the schema is the source of truth and the
 * shape is small enough that explicit duplication is cheaper than a
 * codegen step.
 */
export interface ContextContract {
	id: string;
	unit_kind: string;
	bundle_relation_types: BundleRelationTypeSpec[];
	description?: string;
	notes?: string;
	created_by: string;
	created_at: string;
	modified_by?: string;
	modified_at?: string;
}

/**
 * Composed execution-context bundle returned by gatherExecutionContext.
 *
 *   unit            — the work-unit item payload as read from its block.
 *   perRelationType — map from relation_type to the resolved item payloads
 *                     reached by walking that relation_type per the
 *                     contract's direction + depth bound.
 *   traversal_depth — the max effective depth applied across all walks
 *                     (i.e. max over `min(args.maxDepth, spec.max_depth)`).
 *                     Reflects the bound applied, not the depth actually
 *                     reached — callers reasoning about reach should
 *                     inspect perRelationType lengths directly.
 *   scoped_at       — ISO timestamp at which the bundle was composed;
 *                     records when the substrate snapshot read happened.
 */
export interface ContextBundle {
	unit: Record<string, unknown>;
	perRelationType: Record<string, Record<string, unknown>[]>;
	traversal_depth: number;
	scoped_at: string;
}

/**
 * Arguments to gatherExecutionContext. `kind` selects the context-contract
 * entry to apply (by `unit_kind`); `maxDepth` optionally caps every
 * BundleRelationTypeSpec.max_depth via Math.min.
 */
export interface GatherExecutionContextArgs {
	unitId: string;
	kind: string;
	maxDepth?: number;
}

/**
 * Compose a ContextBundle for `args.unitId` of kind `args.kind`.
 *
 * Steps:
 *   1. Cross-block lookup of the unit item (via the bulk resolver — single
 *      buildIdIndex traversal). Missing unit → return `{ error }`.
 *   2. Filter context-contracts.json by `unit_kind == args.kind`. The block
 *      read failure surfaces as `{ error }`; missing match also returns
 *      `{ error }`. First match wins when multiple contracts share a
 *      unit_kind — the schema permits multiple entries but the substrate
 *      convention is one contract per unit_kind.
 *   3. Single loadRelations(cwd) read; reused across every declared
 *      relation_type walk.
 *   4. For each BundleRelationTypeSpec: compute effective depth, dispatch
 *      direction → walkAncestors / walkDescendants / union; resolve the
 *      reached id set to full items via resolveItemsByIds (bulk over the
 *      already-built index for that relation_type — index is rebuilt per
 *      resolveItemsByIds call by current contract).
 *   5. Return ContextBundle with unit + perRelationType map + max effective
 *      depth + scoped_at timestamp.
 */
export function gatherExecutionContext(
	cwd: string,
	args: GatherExecutionContextArgs,
): ContextBundle | { error: string } {
	// 1. Read the unit by id (cross-block via the bulk resolver — single
	//    buildIdIndex traversal even for the singleton lookup; same
	//    contract as resolveItemById, just the bulk surface).
	const unitMap = resolveItemsByIds(cwd, [args.unitId]);
	const unitLoc = unitMap.get(args.unitId);
	if (!unitLoc) return { error: `unit not found: ${args.unitId}` };
	const unit = unitLoc.item;

	// 2. Look up the context-contract by unit_kind. filterBlockItems throws
	//    on substrate read / schema failure — convert that to an error
	//    return so the tool surface doesn't propagate substrate-corruption
	//    style throws as unhandled.
	let contracts: unknown[];
	try {
		contracts = filterBlockItems(cwd, "context-contracts", {
			field: "unit_kind",
			op: "eq",
			value: args.kind,
		});
	} catch (err) {
		return {
			error: `context-contracts read failed: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
	if (contracts.length === 0) {
		return { error: `no context-contract for kind: ${args.kind}` };
	}
	const contract = contracts[0] as ContextContract;

	// 3. Single relations.json read; reused across every relation_type walk.
	const edges = loadRelations(cwd);

	// 4. Walk each declared relation_type per direction, resolve reached
	//    ids to full items, accumulate perRelationType buckets.
	const perRelationType: Record<string, Record<string, unknown>[]> = {};
	let maxDepthSeen = 0;
	for (const spec of contract.bundle_relation_types) {
		const effectiveDepth = args.maxDepth !== undefined ? Math.min(args.maxDepth, spec.max_depth) : spec.max_depth;
		maxDepthSeen = Math.max(maxDepthSeen, effectiveDepth);

		let reachedIds: string[];
		if (spec.direction === "in") {
			reachedIds = walkAncestors(args.unitId, spec.relation_type, edges);
		} else if (spec.direction === "out") {
			reachedIds = walkDescendants(args.unitId, spec.relation_type, edges);
		} else {
			// "both" — deduped union of inbound + outbound id chains.
			const inIds = walkAncestors(args.unitId, spec.relation_type, edges);
			const outIds = walkDescendants(args.unitId, spec.relation_type, edges);
			reachedIds = Array.from(new Set([...inIds, ...outIds]));
		}

		if (reachedIds.length === 0) {
			perRelationType[spec.relation_type] = [];
			continue;
		}

		// Bulk resolve reached ids; preserve traversal-order in the output
		// bucket. Unresolvable ids (e.g. dangling edges referencing items
		// not present in any block) are dropped silently — the bucket
		// reflects the substrate-resolved subset, not the edge set.
		const itemMap = resolveItemsByIds(cwd, reachedIds);
		const items: Record<string, unknown>[] = [];
		for (const id of reachedIds) {
			const loc = itemMap.get(id);
			if (loc) items.push(loc.item);
		}
		perRelationType[spec.relation_type] = items;
	}

	return {
		unit: unit as Record<string, unknown>,
		perRelationType,
		traversal_depth: maxDepthSeen,
		scoped_at: new Date().toISOString(),
	};
}
