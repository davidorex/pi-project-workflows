/**
 * Roadmap + plan substrate primitives — pure functions over typed blocks.
 *
 * Module landing pattern follows lens-view.ts: pure functions take cwd +
 * identifiers, return structured results or { error } records. Subcommand
 * handlers and tool execute() shells in index.ts are thin wrappers that
 * route results to ctx.ui.notify, pi.sendMessage, or AgentToolResult.
 *
 * Status vocabulary normalization: STATUS_VOCABULARY maps each schema's
 * native status enum (issues uses open|resolved|deferred; decisions uses
 * open|enacted|superseded; tasks uses todo|in_progress|completed; etc.)
 * to a normalized StatusBucket that cross-block aggregation can compare
 * against. The mapping is interim per FGAP-013 — eventually
 * config.status_buckets will let users extend per-project.
 *
 * Topological sort + cycle detection (topoSort) is shared utility used by
 * loadRoadmap (over phase_depends_on edges) and loadPlan (over
 * plan_item_depends_on edges) per DEC-0012's edges-only authoring contract.
 */
import type { ItemRecord } from "./project-context.js";

export type StatusBucket = "complete" | "in_progress" | "blocked" | "todo" | "unknown";

export interface PhaseStatus {
	bucket: StatusBucket;
	counts: Record<StatusBucket, number>;
	total: number;
}

/**
 * Normalized mapping from per-schema status enum values to StatusBucket.
 * Interim hardcoded per FGAP-013 — config.status_buckets registry will
 * eventually let users extend per-project. Lower-cased lookups; the
 * substrate's status enums are all kebab/snake-case lowercase today.
 *
 * Mappings derived from actual schema enums currently in this repo's
 * .project/schemas/ + packages/pi-project/registry/schemas/:
 *   - issues.status: open | resolved | deferred
 *   - decisions.status: open | enacted | superseded
 *   - tasks.status: todo | in_progress | completed | cancelled
 *   - features.status: proposed | active | complete | archived
 *   - roadmaps.status: draft | active | paused | complete | archived
 *   - plans.status: draft | active | blocked | complete | archived
 *   - spec-reviews.status: not-started | in-progress | complete
 *   - framework-gaps.status: identified | proposed | accepted | in_progress | implemented
 *   - verification.status: passed | failed | pending
 *
 * Values not listed bucket to "unknown" without throwing — caller decides
 * whether unknown statuses are warning-worthy (validateRoadmaps emits
 * roadmap_status_unknown_value when relevant).
 */
export const STATUS_VOCABULARY: Record<string, StatusBucket> = {
	// → complete
	resolved: "complete",
	completed: "complete",
	complete: "complete",
	done: "complete",
	enacted: "complete",
	implemented: "complete",
	passed: "complete",
	archived: "complete",
	// → in_progress
	in_progress: "in_progress",
	"in-progress": "in_progress",
	active: "in_progress",
	accepted: "in_progress",
	// → blocked
	blocked: "blocked",
	paused: "blocked",
	failed: "blocked",
	// → todo
	open: "todo",
	todo: "todo",
	proposed: "todo",
	draft: "todo",
	identified: "todo",
	"not-started": "todo",
	pending: "todo",
	// superseded / cancelled / deferred bucket to unknown — they're
	// terminal-but-not-complete states that don't fit the linear
	// progress narrative. Roadmap/plan rollups treat them as
	// "doesn't count toward progress" rather than as complete or todo.
	superseded: "unknown",
	cancelled: "unknown",
	deferred: "unknown",
};

/**
 * Bucket each item's status field against STATUS_VOCABULARY; return
 * counts + the rolled-up bucket (most-progressed bucket present, or
 * unknown when items array is empty / no items have a status field).
 *
 * Rollup precedence (most-blocking wins for the bucket field):
 *   blocked > in_progress > todo > complete > unknown
 * — meaning a phase with any blocked item rolls up as blocked even if
 * other items are complete; a phase with all-complete items rolls up
 * complete. This matches typical product-management roadmap-status
 * conventions (a phase isn't "in progress" if everything's done; it's
 * "complete"; a phase with anything blocked needs attention).
 */
export function rollupPhaseStatus(items: ItemRecord[]): PhaseStatus {
	const counts: Record<StatusBucket, number> = {
		complete: 0,
		in_progress: 0,
		blocked: 0,
		todo: 0,
		unknown: 0,
	};

	for (const item of items) {
		const status = typeof item.status === "string" ? item.status.toLowerCase() : null;
		const bucket: StatusBucket = status !== null ? (STATUS_VOCABULARY[status] ?? "unknown") : "unknown";
		counts[bucket]++;
	}

	const total = items.length;
	let bucket: StatusBucket;
	if (total === 0) bucket = "unknown";
	else if (counts.blocked > 0) bucket = "blocked";
	else if (counts.in_progress > 0) bucket = "in_progress";
	else if (counts.todo > 0) bucket = "todo";
	else if (counts.complete > 0) bucket = "complete";
	else bucket = "unknown";

	return { bucket, counts, total };
}

/**
 * Generic topological sort with cycle detection. Implementation:
 * Kahn's algorithm — repeatedly remove nodes with no incoming edges,
 * append to order, decrement in-degree of their dependents. Any nodes
 * remaining after the in-degree pass form one or more cycles; the
 * cycle-finding pass uses DFS with recursion-stack tracking to extract
 * each distinct cycle path.
 *
 * Returns:
 *   order — node ids in dependency-respecting order. Independent nodes
 *     appear in input order (Kahn's algorithm preserves insertion order
 *     within a stratum).
 *   cycles — array of cycle paths, each as a string[] starting and
 *     ending with the same id. Empty when graph is acyclic.
 *
 * Caller chooses whether cycles are fatal: validateRoadmaps surfaces
 * roadmap_phase_cycle; loadRoadmap returns the cycles[] alongside a
 * partial order so renderRoadmap can show what it could and what
 * couldn't be ordered.
 */
export function topoSort<T>(
	nodes: T[],
	idOf: (n: T) => string,
	deps: (n: T) => string[],
): { order: string[]; cycles: string[][] } {
	const idIndex = new Map<string, number>();
	const ids: string[] = [];
	for (const n of nodes) {
		const id = idOf(n);
		idIndex.set(id, ids.length);
		ids.push(id);
	}

	// Build adjacency: edge from dep → node (so processing dep first
	// gates node). depsArr[i] = ids that must precede ids[i].
	const inDegree = new Map<string, number>();
	const adj = new Map<string, string[]>(); // dep id → [node ids that depend on it]
	for (const id of ids) {
		inDegree.set(id, 0);
		adj.set(id, []);
	}
	for (const n of nodes) {
		const id = idOf(n);
		for (const d of deps(n)) {
			// Only count edges between nodes present in the graph.
			if (!idIndex.has(d)) continue;
			inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
			adj.get(d)?.push(id);
		}
	}

	// Kahn's algorithm: queue zero-in-degree nodes in input order.
	const order: string[] = [];
	const queue: string[] = [];
	for (const id of ids) {
		if ((inDegree.get(id) ?? 0) === 0) queue.push(id);
	}
	while (queue.length > 0) {
		const id = queue.shift();
		if (id === undefined) break;
		order.push(id);
		for (const dependent of adj.get(id) ?? []) {
			const next = (inDegree.get(dependent) ?? 0) - 1;
			inDegree.set(dependent, next);
			if (next === 0) queue.push(dependent);
		}
	}

	// Cycle detection: any node not in `order` participates in a cycle.
	const cycles: string[][] = [];
	if (order.length < ids.length) {
		const remaining = new Set(ids.filter((id) => !order.includes(id)));
		const visited = new Set<string>();
		const stack: string[] = [];
		const onStack = new Set<string>();
		const seen = new Set<string>();

		const dfs = (id: string): void => {
			if (onStack.has(id)) {
				const idx = stack.indexOf(id);
				if (idx === -1) return;
				const cycle = [...stack.slice(idx), id];
				const key = cycle.join("→");
				if (!seen.has(key)) {
					seen.add(key);
					cycles.push(cycle);
				}
				return;
			}
			if (visited.has(id) || !remaining.has(id)) return;
			visited.add(id);
			onStack.add(id);
			stack.push(id);
			for (const next of adj.get(id) ?? []) {
				dfs(next);
			}
			stack.pop();
			onStack.delete(id);
		};

		for (const id of remaining) {
			if (!visited.has(id)) dfs(id);
		}
	}

	return { order, cycles };
}
