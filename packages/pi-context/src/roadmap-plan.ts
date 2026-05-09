/**
 * Roadmap + plan substrate primitives — pure functions over typed blocks.
 *
 * Module landing pattern follows lens-view.ts: pure functions take cwd +
 * identifiers, return structured results or { error } records. Subcommand
 * handlers and tool execute() shells in index.ts are thin wrappers that
 * route results to ctx.ui.notify, pi.sendMessage, or AgentToolResult.
 *
 * Status vocabulary normalization: STATUS_VOCABULARY_DEFAULTS maps each
 * schema's native status enum (issues uses open|resolved|deferred;
 * decisions uses open|enacted|superseded; tasks uses
 * todo|in_progress|completed; etc.) to a normalized StatusBucket that
 * cross-block aggregation can compare against. Per the pi-context
 * divergence from main, the active vocabulary is resolved via
 * `resolveStatusVocabulary(cwd)` which merges
 * `config.status_buckets` over the defaults — users override per-project
 * by editing config.json (FGAP-013 closed).
 *
 * Diagnostic display strings: validateRoadmaps() emits issues whose
 * `code` field is an opaque slug; the human-readable message is
 * resolved via `diagMessage(cwd, code, fallback)` which checks
 * `config.display_strings[code]` and falls back to embedded English.
 * This is the pi-context divergence: main hardcodes English; pi-context
 * routes the message through config so per-project / per-locale
 * overrides are config-driven.
 *
 * Topological sort + cycle detection (topoSort) is shared utility used by
 * loadRoadmap (over phase_depends_on edges) and loadPlan (over
 * plan_item_depends_on edges) per DEC-0012's edges-only authoring contract.
 */
import { readBlock } from "./block-api.js";
import { type LensValidatorIssue, registerLensValidator } from "./lens-validator.js";
import { type LoadedLensView, loadLensView } from "./lens-view.js";
import { type Edge, getProjectContext, type ItemRecord, type StatusBucket } from "./project-context.js";
import { availableBlocks } from "./project-sdk.js";

export type { StatusBucket } from "./project-context.js";

export interface PhaseStatus {
	bucket: StatusBucket;
	counts: Record<StatusBucket, number>;
	total: number;
}

/**
 * Hardcoded baseline mapping from per-schema status enum values to
 * StatusBucket. Per-project overrides land via config.status_buckets and
 * shadow these defaults at lookup time (resolveStatusVocabulary spreads
 * the user map over the defaults so user keys win on collision).
 *
 * Mappings derived from the schema enums currently in this repo's
 * .project/schemas/ + packages/pi-context/registry/schemas/:
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
 * Values not listed bucket to "unknown" without throwing — caller
 * decides whether unknown statuses are warning-worthy
 * (validateRoadmaps emits roadmap_status_unknown_value when relevant).
 */
const STATUS_VOCABULARY_DEFAULTS: Record<string, StatusBucket> = {
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
 * Resolve the active status-vocabulary map for `cwd` — defaults shadowed
 * by config.status_buckets entries. Pure: builds a fresh map per call;
 * callers caching for hot paths (rollupPhaseStatus over many phases)
 * should pass the resolved map in directly.
 */
export function resolveStatusVocabulary(cwd: string): Record<string, StatusBucket> {
	const ctx = getProjectContext(cwd);
	return { ...STATUS_VOCABULARY_DEFAULTS, ...(ctx.config?.status_buckets ?? {}) };
}

/**
 * Bucket each item's status field against the vocabulary; return counts
 * + the rolled-up bucket (most-blocking bucket present, or unknown when
 * items array is empty / no items have a status field).
 *
 * Rollup precedence (most-blocking wins for the bucket field):
 *   blocked > in_progress > todo > complete > unknown
 * — meaning a phase with any blocked item rolls up as blocked even if
 * other items are complete; a phase with all-complete items rolls up
 * complete. This matches typical product-management roadmap-status
 * conventions (a phase isn't "in progress" if everything's done; it's
 * "complete"; a phase with anything blocked needs attention).
 *
 * Vocabulary defaults to STATUS_VOCABULARY_DEFAULTS when omitted —
 * loaders that have already resolved per-project overrides via
 * resolveStatusVocabulary should pass the resolved map in to keep
 * config.status_buckets-driven mappings consistent across a single load.
 */
export function rollupPhaseStatus(items: ItemRecord[], vocabulary?: Record<string, StatusBucket>): PhaseStatus {
	const vocab = vocabulary ?? STATUS_VOCABULARY_DEFAULTS;
	const counts: Record<StatusBucket, number> = {
		complete: 0,
		in_progress: 0,
		blocked: 0,
		todo: 0,
		unknown: 0,
	};

	for (const item of items) {
		const status = typeof item.status === "string" ? item.status.toLowerCase() : null;
		const bucket: StatusBucket = status !== null ? (vocab[status] ?? "unknown") : "unknown";
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
 * Resolve a diagnostic message for `code` — config.display_strings wins,
 * embedded English fallback otherwise. The pi-context divergence from
 * main: validation diagnostics flow through config so per-project /
 * per-locale wording overrides are first-class config (no code edits).
 */
function diagMessage(cwd: string, code: string, fallback: string): string {
	const ctx = getProjectContext(cwd);
	return ctx.config?.display_strings?.[code] ?? fallback;
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

// ── Roadmap primitives (issue-084 / pi-context Step 7) ──────────────────────
//
// Roadmap = sequenced phases with milestones; each phase aggregates items via
// a named lens. Per DEC-0012 (edges-only authoring), phase ordering lives in
// relations.json with relation_type='phase_depends_on' — there is no inline
// depends_on field on phases. The renderer is pure-textual: per-phase
// adjacency lines are sourced from RoadmapView.edges, not inferred from
// phaseOrder consecutive pairs (a fabrication pattern in branching DAGs).

/**
 * Phase entry as authored in roadmap.json. NO depends_on field — ordering
 * lives in relations.json per DEC-0012.
 */
export interface PhaseSpec {
	id: string;
	name: string;
	description?: string;
	lens: string;
	milestone?: string;
	exit_criteria?: string[];
}

/**
 * Inline milestone declared by a roadmap. evidence_block + evidence_query
 * together drive milestoneSatisfied evaluation: milestone is satisfied
 * when at least one item in evidence_block matches every key/value in
 * evidence_query by ===.
 */
export interface MilestoneSpec {
	id: string;
	name: string;
	criterion?: string;
	evidence_block?: string;
	evidence_query?: Record<string, unknown>;
}

/**
 * Roadmap entry as authored in roadmap.json's roadmaps[] array.
 */
export interface RoadmapSpec {
	id: string;
	title: string;
	description?: string;
	status?: string;
	phases: PhaseSpec[];
	milestones?: MilestoneSpec[];
}

/**
 * Per-phase loaded view: phase spec + its lens-view (or error) + status
 * rollup over the lens's items + optional milestone resolution.
 */
export interface PhaseView {
	phase: PhaseSpec;
	lensView: LoadedLensView | { error: string };
	status: PhaseStatus;
	milestone?: MilestoneSpec;
	milestoneSatisfied?: boolean;
}

/**
 * Materialized roadmap view. `phases` carries PhaseView entries in
 * authored input order. `phaseOrder` is the topo order over the
 * `phase_depends_on` edges scoped to in-roadmap phases — partial when
 * cycles are present (cycle-participating phases are absent from
 * phaseOrder and surfaced separately in `cycles`). `edges` is the
 * authoritative scoped subset of authored edges and is the renderer's
 * sole source for per-phase adjacency lines (the renderer never infers
 * adjacency from phaseOrder consecutive pairs — that pattern fabricates
 * sibling edges in branching DAGs and is forbidden).
 */
export interface RoadmapView {
	roadmap: RoadmapSpec;
	phases: PhaseView[];
	phaseOrder: string[];
	cycles: string[][];
	edges: Edge[];
}

export interface RoadmapValidationIssue {
	code:
		| "roadmap_lens_missing"
		| "roadmap_phase_dep_missing"
		| "roadmap_phase_cycle"
		| "roadmap_milestone_evidence_block_missing"
		| "roadmap_milestone_query_invalid"
		| "roadmap_composition_cycle"
		| "roadmap_status_unknown_value";
	message: string;
	roadmap_id?: string;
	phase_id?: string;
	cycle?: string[];
}

const ROADMAP_STATUS_ENUM: ReadonlySet<string> = new Set(["draft", "active", "paused", "complete", "archived"]);

/**
 * Defensive read of roadmap.json. Returns the parsed array (may be empty)
 * or null when the block is absent / unreadable. Validator and listRoadmaps
 * treat absence as a non-defect (opt-in block).
 */
function readRoadmaps(cwd: string): RoadmapSpec[] | null {
	try {
		const data = readBlock(cwd, "roadmap") as { roadmaps?: RoadmapSpec[] };
		return Array.isArray(data.roadmaps) ? data.roadmaps : [];
	} catch {
		return null;
	}
}

/**
 * Determine whether a milestone is satisfied: when both evidence_block and
 * evidence_query are present, read the block defensively and return true
 * iff at least one item has every evidence_query key matching by ===.
 * Missing block / read error / no query → false (validator surfaces a
 * separate diagnostic where appropriate).
 */
function evaluateMilestone(cwd: string, m: MilestoneSpec): boolean {
	if (!m.evidence_block || !m.evidence_query) return false;
	let items: ItemRecord[];
	try {
		const data = readBlock(cwd, m.evidence_block) as Record<string, unknown>;
		const arrayKey = Object.keys(data).find((k) => Array.isArray(data[k]));
		if (!arrayKey) return false;
		items = data[arrayKey] as ItemRecord[];
	} catch {
		return false;
	}
	const query = m.evidence_query;
	for (const item of items) {
		let match = true;
		for (const [k, v] of Object.entries(query)) {
			if (item[k] !== v) {
				match = false;
				break;
			}
		}
		if (match) return true;
	}
	return false;
}

/**
 * Load a single roadmap by id. Returns the materialized RoadmapView or a
 * structured { error } when config / block / id is missing.
 *
 * Algorithm:
 *   1. Load context; bail when no .project/config.json.
 *   2. Defensively read roadmap.json; bail when absent.
 *   3. Lookup the roadmap by id; bail when unknown.
 *   4. Build PhaseView[] in authored input order (loadLensView per phase,
 *      rollupPhaseStatus over the resulting items, milestone resolution
 *      where declared).
 *   5. Compute the in-roadmap edge subset (phase_depends_on edges whose
 *      both endpoints are in the roadmap) and topo-sort to derive
 *      phaseOrder + cycles.
 *
 * The returned `edges` field is the authoritative scoped subset that the
 * renderer consumes for per-phase adjacency lines.
 */
export function loadRoadmap(cwd: string, roadmapId: string): RoadmapView | { error: string } {
	const ctx = getProjectContext(cwd);
	if (!ctx.config) {
		return { error: "No .project/config.json — run /project init first, then declare lenses + install assets." };
	}
	const roadmaps = readRoadmaps(cwd);
	if (roadmaps === null) {
		return { error: "no roadmap.json — install via .project/config.json's installed_blocks then author roadmap.json" };
	}
	const roadmap = roadmaps.find((r) => r.id === roadmapId);
	if (!roadmap) {
		const known = roadmaps.map((r) => r.id).join(", ") || "(none)";
		return { error: `Roadmap '${roadmapId}' not found. Known: ${known}` };
	}

	const vocabulary = resolveStatusVocabulary(cwd);
	const phases: PhaseView[] = roadmap.phases.map((phase) => {
		const lensView = loadLensView(cwd, phase.lens);
		const items: ItemRecord[] = "error" in lensView ? [] : lensView.items;
		const status = rollupPhaseStatus(items, vocabulary);
		const milestone = phase.milestone ? roadmap.milestones?.find((m) => m.id === phase.milestone) : undefined;
		const milestoneSatisfied = milestone ? evaluateMilestone(cwd, milestone) : undefined;
		return { phase, lensView, status, milestone, milestoneSatisfied };
	});

	const inRoadmap = new Set(roadmap.phases.map((p) => p.id));
	const edges = ctx.relations.filter(
		(e) => e.relation_type === "phase_depends_on" && inRoadmap.has(e.parent) && inRoadmap.has(e.child),
	);
	const { order, cycles } = topoSort(
		roadmap.phases,
		(p) => p.id,
		(p) => edges.filter((e) => e.child === p.id).map((e) => e.parent),
	);

	return { roadmap, phases, phaseOrder: order, cycles, edges };
}

/**
 * Discovery — returns one summary entry per roadmap. Empty array when
 * roadmap.json is absent (listing is discovery; absence is the truthful
 * answer, not an error).
 */
export function listRoadmaps(cwd: string): Array<{ id: string; title: string; status?: string; phaseCount: number }> {
	const roadmaps = readRoadmaps(cwd);
	if (!roadmaps) return [];
	return roadmaps.map((r) => ({
		id: r.id,
		title: r.title,
		...(r.status ? { status: r.status } : {}),
		phaseCount: r.phases.length,
	}));
}

/**
 * Validate every roadmap × phase × milestone. Codes are opaque slugs;
 * display strings resolve via diagMessage (config.display_strings →
 * embedded English fallback). The pi-context lens-validator dispatch
 * (registered at module bottom) maps these to ProjectValidationIssue-
 * compatible records and merges them into validateProject's output.
 *
 * Roadmap.json absent → { status: "clean", issues: [] } (opt-in block;
 * absence is not a defect).
 */
export function validateRoadmaps(cwd: string): {
	status: "clean" | "warnings" | "invalid";
	issues: RoadmapValidationIssue[];
} {
	const issues: RoadmapValidationIssue[] = [];
	const ctx = getProjectContext(cwd);
	if (!ctx.config) return { status: "clean", issues: [] };
	const roadmaps = readRoadmaps(cwd);
	if (!roadmaps || roadmaps.length === 0) return { status: "clean", issues: [] };

	const lensIds = new Set((ctx.config.lenses ?? []).map((l) => l.id));
	const blockNames = new Set(availableBlocks(cwd).map((b) => b.name));
	const vocabulary = resolveStatusVocabulary(cwd);

	const errorCodes: ReadonlySet<RoadmapValidationIssue["code"]> = new Set([
		"roadmap_lens_missing",
		"roadmap_phase_dep_missing",
		"roadmap_phase_cycle",
		"roadmap_composition_cycle",
	]);

	for (const roadmap of roadmaps) {
		// roadmap.status — must be in known enum (warning when not).
		if (roadmap.status !== undefined && !ROADMAP_STATUS_ENUM.has(roadmap.status)) {
			issues.push({
				code: "roadmap_status_unknown_value",
				message: diagMessage(
					cwd,
					"roadmap_status_unknown_value",
					`Roadmap '${roadmap.id}' has unknown status '${roadmap.status}'. Known: ${Array.from(ROADMAP_STATUS_ENUM).join(", ")}`,
				),
				roadmap_id: roadmap.id,
			});
		}

		const inRoadmap = new Set(roadmap.phases.map((p) => p.id));
		const milestoneIds = new Set((roadmap.milestones ?? []).map((m) => m.id));

		// Per-phase checks: lens existence + composition cycle + status rollup
		// for unknown-status warning + milestone validation (independent of
		// lens resolution — milestone diagnostics surface even when the lens
		// itself fails to load).
		for (const phase of roadmap.phases) {
			let lensResolved = false;
			if (!lensIds.has(phase.lens)) {
				issues.push({
					code: "roadmap_lens_missing",
					message: diagMessage(
						cwd,
						"roadmap_lens_missing",
						`Phase '${phase.id}' in roadmap '${roadmap.id}' references unknown lens '${phase.lens}'.`,
					),
					roadmap_id: roadmap.id,
					phase_id: phase.id,
				});
			} else {
				const lensView = loadLensView(cwd, phase.lens);
				if ("error" in lensView) {
					if (lensView.error.includes("composition_cycle_detected")) {
						issues.push({
							code: "roadmap_composition_cycle",
							message: diagMessage(
								cwd,
								"roadmap_composition_cycle",
								`Phase '${phase.id}' in roadmap '${roadmap.id}' resolves to composition lens with cycle: ${lensView.error}`,
							),
							roadmap_id: roadmap.id,
							phase_id: phase.id,
						});
					}
				} else {
					lensResolved = true;
					const status = rollupPhaseStatus(lensView.items, vocabulary);
					if (status.bucket === "unknown" && status.total > 0) {
						issues.push({
							code: "roadmap_status_unknown_value",
							message: diagMessage(
								cwd,
								"roadmap_status_unknown_value",
								`Phase '${phase.id}' in roadmap '${roadmap.id}' rolls up to bucket 'unknown' across ${status.total} item(s) — items lack a recognised status enum value.`,
							),
							roadmap_id: roadmap.id,
							phase_id: phase.id,
						});
					}
				}
			}

			// Milestone evidence_block + evidence_query checks — independent
			// of lens resolution outcome.
			if (phase.milestone) {
				const milestone = roadmap.milestones?.find((m) => m.id === phase.milestone);
				if (milestone) {
					if (milestone.evidence_block && !blockNames.has(milestone.evidence_block)) {
						issues.push({
							code: "roadmap_milestone_evidence_block_missing",
							message: diagMessage(
								cwd,
								"roadmap_milestone_evidence_block_missing",
								`Milestone '${milestone.id}' in roadmap '${roadmap.id}' references evidence_block '${milestone.evidence_block}' which is not loaded.`,
							),
							roadmap_id: roadmap.id,
							phase_id: phase.id,
						});
					}
					if (milestone.evidence_query !== undefined) {
						const q = milestone.evidence_query;
						const ok =
							q !== null &&
							typeof q === "object" &&
							!Array.isArray(q) &&
							Object.values(q as Record<string, unknown>).every(
								(v) => v === null || ["string", "number", "boolean"].includes(typeof v),
							);
						if (!ok) {
							issues.push({
								code: "roadmap_milestone_query_invalid",
								message: diagMessage(
									cwd,
									"roadmap_milestone_query_invalid",
									`Milestone '${milestone.id}' in roadmap '${roadmap.id}' has invalid evidence_query — expected plain object with primitive values only.`,
								),
								roadmap_id: roadmap.id,
								phase_id: phase.id,
							});
						}
					}
				}
			}
			void lensResolved;
		}

		// Dangling phase_depends_on edges — both endpoints must be in this roadmap
		// when at least one endpoint is. (A phase_depends_on edge whose neither
		// endpoint matches any roadmap phase is silently skipped — it may belong
		// to a different roadmap.)
		for (const e of ctx.relations) {
			if (e.relation_type !== "phase_depends_on") continue;
			const parentIn = inRoadmap.has(e.parent);
			const childIn = inRoadmap.has(e.child);
			if (parentIn !== childIn) {
				const dangling = parentIn ? e.child : e.parent;
				issues.push({
					code: "roadmap_phase_dep_missing",
					message: diagMessage(
						cwd,
						"roadmap_phase_dep_missing",
						`phase_depends_on edge {parent:${e.parent}, child:${e.child}} in roadmap '${roadmap.id}' references phase '${dangling}' that is not declared in this roadmap.`,
					),
					roadmap_id: roadmap.id,
					phase_id: dangling,
				});
			}
		}

		// Phase cycles — re-run topoSort over the in-roadmap edge subset.
		const scopedEdges = ctx.relations.filter(
			(e) => e.relation_type === "phase_depends_on" && inRoadmap.has(e.parent) && inRoadmap.has(e.child),
		);
		const { cycles } = topoSort(
			roadmap.phases,
			(p) => p.id,
			(p) => scopedEdges.filter((e) => e.child === p.id).map((e) => e.parent),
		);
		for (const cycle of cycles) {
			issues.push({
				code: "roadmap_phase_cycle",
				message: diagMessage(
					cwd,
					"roadmap_phase_cycle",
					`Phase cycle in roadmap '${roadmap.id}': ${cycle.join(" → ")}`,
				),
				roadmap_id: roadmap.id,
				cycle,
			});
		}

		// milestoneIds is referenced for symmetry with future expansion; mark
		// usage to satisfy noUnusedLocals without inserting noise downstream.
		void milestoneIds;
	}

	let status: "clean" | "warnings" | "invalid" = "clean";
	for (const i of issues) {
		if (errorCodes.has(i.code)) {
			status = "invalid";
			break;
		}
		status = "warnings";
	}
	return { status, issues };
}

/**
 * Render a loaded RoadmapView as pure-textual markdown — NO mermaid, NO
 * diagrams, NO graph syntax. Per-phase **Depends on:** adjacency lines
 * are sourced strictly from view.edges (sorted alphabetically; "—" when
 * the phase has no incoming phase_depends_on edges). Cycle-participating
 * phases are surfaced under a separate "**Unordered (cycle-participating):**"
 * heading and a "**Cycles detected:**" line. The renderer never infers
 * adjacency from phaseOrder consecutive pairs (that pattern fabricates
 * sibling edges in branching DAGs).
 *
 * naming consulted only for lens-target display labels; phase / roadmap
 * ids render as-is.
 */
export function renderRoadmap(view: RoadmapView, naming: Record<string, string> | undefined): string {
	const lines: string[] = [];
	const r = view.roadmap;

	lines.push(`# Roadmap: ${r.title} (${r.id})`);
	lines.push("");
	lines.push(`**Status:** ${r.status ?? "(unspecified)"}`);
	lines.push(
		`**Phases:** ${r.phases.length}  |  **Ordered:** ${view.phaseOrder.length}  |  **Cycles:** ${view.cycles.length}`,
	);
	lines.push("");
	if (r.description) {
		lines.push(r.description);
		lines.push("");
	}

	lines.push("## Phase order");
	lines.push("");
	const phaseById = new Map(r.phases.map((p) => [p.id, p]));
	if (view.phaseOrder.length === 0) {
		lines.push("(no acyclic ordering possible — see cycles below)");
		lines.push("");
	} else {
		view.phaseOrder.forEach((id, idx) => {
			const p = phaseById.get(id);
			lines.push(`${idx + 1}. ${id} — ${p?.name ?? "(unknown)"}`);
		});
		lines.push("");
	}

	const orderedSet = new Set(view.phaseOrder);
	const cycleOnly = r.phases.filter((p) => !orderedSet.has(p.id));
	if (cycleOnly.length > 0) {
		lines.push("**Unordered (cycle-participating):**");
		for (const p of cycleOnly) {
			lines.push(`- ${p.id} — ${p.name}`);
		}
		lines.push("");
	}
	if (view.cycles.length > 0) {
		const rendered = view.cycles.map((c) => c.join(" → ")).join("; ");
		lines.push(`**Cycles detected:** ${rendered}`);
		lines.push("");
	}

	lines.push("## Phases");
	lines.push("");

	// Render in phaseOrder first, then any cycle-only phases (deduped, input order).
	const phaseViewById = new Map(view.phases.map((pv) => [pv.phase.id, pv]));
	const renderOrder: string[] = [];
	for (const id of view.phaseOrder) renderOrder.push(id);
	for (const p of cycleOnly) renderOrder.push(p.id);

	for (const id of renderOrder) {
		const pv = phaseViewById.get(id);
		if (!pv) continue;
		const p = pv.phase;
		lines.push(`### ${p.name} (${p.id}) [${pv.status.bucket}]`);
		lines.push("");
		const lensTargetLabel = (() => {
			if (!("error" in pv.lensView)) {
				const lens = pv.lensView.lens;
				if (lens.kind === "composition") {
					return `${(lens.targets ?? []).map((t) => naming?.[t] ?? t).join(", ")} (composition)`;
				}
				if (lens.target) return naming?.[lens.target] ?? lens.target;
			}
			return p.lens;
		})();
		lines.push(`**Lens:** ${p.lens}${lensTargetLabel !== p.lens ? ` (${lensTargetLabel})` : ""}`);

		const incoming = view.edges
			.filter((e) => e.child === p.id)
			.map((e) => e.parent)
			.sort();
		lines.push(`**Depends on:** ${incoming.length > 0 ? incoming.join(", ") : "—"}`);

		const c = pv.status.counts;
		lines.push(
			`**Counts:** complete=${c.complete} in_progress=${c.in_progress} blocked=${c.blocked} todo=${c.todo} unknown=${c.unknown} (total=${pv.status.total})`,
		);
		lines.push("");

		if ("error" in pv.lensView) {
			lines.push(`**Lens error:** ${pv.lensView.error}`);
			lines.push("");
		} else {
			const items = pv.lensView.items;
			if (items.length > 0) {
				lines.push(`| Item     | Status   | Title    |`);
				lines.push(`|----------|----------|----------|`);
				for (const item of items) {
					const status = typeof item.status === "string" ? item.status : "";
					const titleStr = typeof item.title === "string" ? item.title : "";
					lines.push(`| ${item.id} | ${status} | ${titleStr} |`);
				}
				lines.push("");
			}
		}

		if (pv.milestone) {
			const verdict = pv.milestoneSatisfied ? "satisfied" : "not yet satisfied";
			lines.push(`**Milestone:** ${pv.milestone.id} — ${pv.milestone.name} — ${verdict}`);
			lines.push("");
		}
		if (p.exit_criteria && p.exit_criteria.length > 0) {
			lines.push("**Exit criteria:**");
			for (const crit of p.exit_criteria) lines.push(`- ${crit}`);
			lines.push("");
		}
	}

	return lines.join("\n").replace(/\n+$/, "\n");
}

// ── Lens-validator dispatch registration (Divergence 3) ─────────────────────
//
// Module-init side-effect: validateProject in project-sdk.ts iterates all
// registered lens-validators and merges their issues into the project-
// validation result. roadmap-plan registers itself here so import of this
// module from index.ts wires the dispatch automatically — no hardcoded
// import in project-sdk.ts.

registerLensValidator({
	name: "roadmap",
	validate: (cwd) => {
		const result = validateRoadmaps(cwd);
		const errorCodes: ReadonlySet<RoadmapValidationIssue["code"]> = new Set([
			"roadmap_lens_missing",
			"roadmap_phase_dep_missing",
			"roadmap_phase_cycle",
			"roadmap_composition_cycle",
		]);
		const issues: LensValidatorIssue[] = result.issues.map((ri) => ({
			code: ri.code,
			severity: errorCodes.has(ri.code) ? "error" : "warning",
			message: ri.message,
			block: ri.roadmap_id ? `roadmap.${ri.roadmap_id}` : "roadmap",
			...(ri.phase_id ? { field: `phase.${ri.phase_id}` } : {}),
		}));
		const status: "clean" | "warnings" | "invalid" =
			issues.length === 0 ? "clean" : issues.some((i) => i.severity === "error") ? "invalid" : "warnings";
		return { status, issues };
	},
});
