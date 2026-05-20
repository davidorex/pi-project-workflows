/**
 * Generic topological sort + cycle detection — a pure utility with no
 * substrate dependency. Extracted here (from roadmap-plan.ts) so both
 * roadmap-plan and project-sdk can consume it without forming a module
 * import cycle (project-sdk.currentState + roadmap-plan both topo-order).
 *
 * Returns:
 *   order  — dependency-respecting id order (Kahn's algorithm; stable,
 *     preserves input order within a stratum).
 *   cycles — array of cycle paths, each a string[] starting and ending
 *     with the same id. Empty when the graph is acyclic.
 *
 * Callers choose whether cycles are fatal.
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
