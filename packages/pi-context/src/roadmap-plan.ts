/**
 * Roadmap substrate primitives — the roadmap as a DERIVED view over the
 * milestone block + authored relations (FGAP-042). There is no roadmap block,
 * no roadmap.json, and no ROADMAP- id: the roadmap IS the milestone-block
 * items ordered by the `milestone_precedes_milestone` closure-table edges,
 * with per-milestone membership resolved through `phase_positioned_in_milestone`
 * and per-phase membership through `task_positioned_in_phase`.
 *
 * Module landing pattern follows lens-view.ts: pure functions take cwd,
 * return structured results or { error } records. Subcommand handlers and
 * tool execute() shells in index.ts are thin wrappers that route results to
 * ctx.ui.notify, pi.sendMessage, or AgentToolResult.
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
 * Diagnostic display strings: validateRoadmap() emits issues whose
 * `code` field is an opaque slug; the human-readable message is
 * resolved via `diagMessage(cwd, code, fallback)` which checks
 * `config.display_strings[code]` and falls back to embedded English.
 * This is the pi-context divergence: main hardcodes English; pi-context
 * routes the message through config so per-project / per-locale
 * overrides are config-driven.
 */
import { type Edge, endpointKey, type ItemRecord, loadContext, type StatusBucket } from "./context.js";
import { buildIdIndex, currentState } from "./context-sdk.js";
import { type LensValidatorIssue, registerLensValidator } from "./lens-validator.js";
import { resolveStatusVocabulary, STATUS_VOCABULARY_DEFAULTS } from "./status-vocab.js";
import { topoSort } from "./topo.js";

// StatusBucket, STATUS_VOCABULARY_DEFAULTS, and resolveStatusVocabulary are
// extracted to ./status-vocab.ts (substrate-light pure module) so context-sdk
// can consume the vocabulary without a roadmap-plan <-> context-sdk import
// cycle. Re-exported here to preserve the existing import surface (barrel +
// roadmap-plan.test). rollupPhaseStatus stays in this module and consumes the
// vocabulary via the import above.
export type { StatusBucket } from "./status-vocab.js";
export { resolveStatusVocabulary, STATUS_VOCABULARY_DEFAULTS };

export interface PhaseStatus {
	bucket: StatusBucket;
	counts: Record<StatusBucket, number>;
	total: number;
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
	const ctx = loadContext(cwd);
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
 * Caller chooses whether cycles are fatal: validateRoadmap surfaces
 * roadmap_milestone_cycle; loadRoadmap returns the cycles[] alongside a
 * partial order so renderRoadmap can show what it could and what
 * couldn't be ordered.
 */
// topoSort is extracted to ./topo.ts (pure generic util) so context-sdk can
// consume it without a roadmap-plan <-> context-sdk import cycle. Re-exported
// here to preserve the existing import surface (barrel + roadmap-plan.test).
export { topoSort };

// ── Derived roadmap over milestone_precedes_milestone (FGAP-042) ────────────
//
// Roadmap order is the precedes-DAG over milestone-block items: authoring the
// order = appending milestone_precedes_milestone edges to relations.json. The
// renderer is pure-textual: per-milestone adjacency lines are sourced from
// MilestoneRoadmapView.edges, not inferred from `order` consecutive pairs (a
// fabrication pattern in branching DAGs).

// Relation names are module constants; config-driven resolution (reading them from
// state_derivation the way currentState resolves membership_relation) is a future
// refinement boundary outside FGAP-042's scope.
const MILESTONE_PRECEDES = "milestone_precedes_milestone";
const PHASE_IN_MILESTONE = "phase_positioned_in_milestone";
const TASK_IN_PHASE = "task_positioned_in_phase";

/**
 * One task row in a phase's membership — the parent of a
 * task_positioned_in_phase edge, resolved against the substrate index.
 * `title` is populated only when the resolved item carries a string `title`
 * field (the stock tasks schema declares `description`, not `title`, so it
 * stays undefined there and renderers fall back to the id).
 */
export interface TaskRow {
	id: string;
	status?: string;
	title?: string;
}

/**
 * One member phase of a milestone: the parent of a
 * phase_positioned_in_milestone edge, with its tasks (parents of
 * task_positioned_in_phase edges targeting it) and a status rollup over those
 * task items.
 */
export interface PhaseRollupView {
	id: string;
	name?: string;
	status?: string;
	tasks: TaskRow[];
	rollup: PhaseStatus;
}

/**
 * One milestone in the derived roadmap. `status` + `phaseCount` come from
 * currentState's config-declared milestone rollup (reached/planned); `rollup`
 * aggregates ALL member phases' task items in a single rollupPhaseStatus pass.
 */
export interface MilestoneView {
	id: string;
	name?: string;
	status: string;
	phaseCount: number;
	phases: PhaseRollupView[];
	rollup: PhaseStatus;
}

/**
 * The materialized derived roadmap. `milestones` carries MilestoneView entries
 * in stable block scan order. `order` is the topo order over the
 * milestone_precedes_milestone edges scoped to milestone-block items — partial
 * when cycles are present (cycle-participating milestones are absent from
 * `order` and surfaced separately in `cycles`). `edges` is the authoritative
 * scoped subset of authored precedes edges and is the renderer's sole source
 * for per-milestone adjacency lines (the renderer never infers adjacency from
 * `order` consecutive pairs — that pattern fabricates sibling edges in
 * branching DAGs and is forbidden).
 */
export interface MilestoneRoadmapView {
	milestones: MilestoneView[];
	order: string[];
	cycles: string[][];
	edges: Edge[];
}

export interface RoadmapValidationIssue {
	code:
		| "roadmap_precedes_endpoint_missing"
		| "roadmap_milestone_cycle"
		| "roadmap_milestone_missing"
		| "roadmap_status_unknown_value"
		| "roadmap_milestone_isolated";
	message: string;
	milestone_id?: string;
	phase_id?: string;
	cycle?: string[];
}

// Error codes flip status to invalid; warning codes to warnings; info codes
// (roadmap_milestone_isolated) NEVER affect status and are excluded from the
// lens-validator merge.
const ROADMAP_ERROR_CODES: ReadonlySet<RoadmapValidationIssue["code"]> = new Set([
	"roadmap_precedes_endpoint_missing",
	"roadmap_milestone_cycle",
	"roadmap_milestone_missing",
]);
const ROADMAP_WARNING_CODES: ReadonlySet<RoadmapValidationIssue["code"]> = new Set(["roadmap_status_unknown_value"]);

/**
 * Load the derived roadmap. Returns the materialized MilestoneRoadmapView or
 * a structured { error } when no config exists. Zero milestone-block items is
 * a VALID empty view (not an error) — the roadmap is opt-in by authoring
 * milestones + edges.
 *
 * Algorithm:
 *   1. Load context; bail when no <substrate-dir>/config.json.
 *   2. Index the substrate; milestones = index items whose block is
 *      "milestone" (stable block scan order).
 *   3. Scope the milestone_precedes_milestone edges to those whose BOTH
 *      endpoints are milestone ids; topoSort (preds = parents of a
 *      milestone's incoming precedes edges) derives order + cycles.
 *   4. Per milestone: status + phaseCount from currentState(cwd).milestones
 *      (the config-declared derived rollup; a milestone absent from that list
 *      reports the rollup pattern's incomplete default "planned" with
 *      phaseCount 0); phases = parents of phase_positioned_in_milestone edges
 *      (child = the milestone), each with tasks = parents of
 *      task_positioned_in_phase edges (child = the phase) and a
 *      rollupPhaseStatus over the resolved task items; the milestone-level
 *      rollup aggregates all member phases' task items in one call.
 *
 * The returned `edges` field is the authoritative scoped subset that the
 * renderer consumes for per-milestone adjacency lines.
 */
export function loadRoadmap(cwd: string): MilestoneRoadmapView | { error: string } {
	const ctx = loadContext(cwd);
	if (!ctx.config) {
		return {
			error:
				"No <substrate-dir>/config.json — run /context init <substrate-dir> first, then declare lenses + install assets.",
		};
	}

	const index = buildIdIndex(cwd);
	const milestoneItems = index.items.filter((loc) => loc.block === "milestone");
	if (milestoneItems.length === 0) {
		return { milestones: [], order: [], cycles: [], edges: [] };
	}

	const milestoneIds = new Set(milestoneItems.map((loc) => loc.id));
	const edges = ctx.relations.filter(
		(e) =>
			e.relation_type === MILESTONE_PRECEDES &&
			milestoneIds.has(endpointKey(e.parent)) &&
			milestoneIds.has(endpointKey(e.child)),
	);
	const { order, cycles } = topoSort(
		milestoneItems,
		(loc) => loc.id,
		(loc) => edges.filter((e) => endpointKey(e.child) === loc.id).map((e) => endpointKey(e.parent)),
	);

	const vocabulary = resolveStatusVocabulary(cwd);
	// One currentState call: the config-declared milestone rollup supplies each
	// milestone's derived status (reached/planned) + phaseCount.
	const derivedMilestones = new Map(currentState(cwd).milestones.map((m) => [m.id, m]));

	const milestones: MilestoneView[] = milestoneItems.map((loc) => {
		const derived = derivedMilestones.get(loc.id);
		const memberPhaseIds = ctx.relations
			.filter((e) => e.relation_type === PHASE_IN_MILESTONE && endpointKey(e.child) === loc.id)
			.map((e) => endpointKey(e.parent));

		const allTaskItems: ItemRecord[] = [];
		const phases: PhaseRollupView[] = memberPhaseIds.map((phaseId) => {
			const phaseLoc = index.byRefname.get(phaseId);
			const taskIds = ctx.relations
				.filter((e) => e.relation_type === TASK_IN_PHASE && endpointKey(e.child) === phaseId)
				.map((e) => endpointKey(e.parent));
			const taskItems: ItemRecord[] = taskIds.map((taskId) => {
				const taskLoc = index.byRefname.get(taskId);
				return taskLoc ? ({ ...taskLoc.item, id: taskId } as ItemRecord) : { id: taskId };
			});
			allTaskItems.push(...taskItems);
			const tasks: TaskRow[] = taskItems.map((item) => ({
				id: item.id,
				...(typeof item.status === "string" ? { status: item.status } : {}),
				...(typeof item.title === "string" ? { title: item.title } : {}),
			}));
			return {
				id: phaseId,
				...(typeof phaseLoc?.item.name === "string" ? { name: phaseLoc.item.name } : {}),
				...(typeof phaseLoc?.item.status === "string" ? { status: phaseLoc.item.status } : {}),
				tasks,
				rollup: rollupPhaseStatus(taskItems, vocabulary),
			};
		});

		return {
			id: loc.id,
			...(typeof loc.item.name === "string" ? { name: loc.item.name } : {}),
			status: derived?.status ?? "planned",
			phaseCount: derived?.phaseCount ?? 0,
			phases,
			rollup: rollupPhaseStatus(allTaskItems, vocabulary),
		};
	});

	return { milestones, order, cycles, edges };
}

/**
 * Validate the derived roadmap. Codes are opaque slugs; display strings
 * resolve via diagMessage (config.display_strings → embedded English
 * fallback). The pi-context lens-validator dispatch (registered at module
 * bottom) contributes the error-code issues into validateContext's output.
 *
 * Codes:
 *   roadmap_precedes_endpoint_missing (error) — a milestone_precedes_milestone
 *     edge endpoint that is not a milestone-block item (absent OR wrong kind).
 *   roadmap_milestone_cycle (error) — a cycle in the precedes graph.
 *   roadmap_milestone_missing (error) — a phase_positioned_in_milestone edge
 *     whose child is not a known milestone.
 *   roadmap_status_unknown_value (warning) — a member phase whose task rollup
 *     buckets unknown with total > 0 (items lack a recognised status value).
 *   roadmap_milestone_isolated (info) — a milestone with zero precedes edges
 *     while at least one precedes edge exists elsewhere. Info NEVER flips
 *     status: status = invalid iff any error-code issue; warnings iff any
 *     warning-code issue; else clean.
 *
 * No config → { status: "clean", issues: [] } (nothing to validate).
 */
export function validateRoadmap(cwd: string): {
	status: "clean" | "warnings" | "invalid";
	issues: RoadmapValidationIssue[];
} {
	const issues: RoadmapValidationIssue[] = [];
	const ctx = loadContext(cwd);
	if (!ctx.config) return { status: "clean", issues: [] };

	const index = buildIdIndex(cwd);
	const milestoneIds = new Set(index.items.filter((loc) => loc.block === "milestone").map((loc) => loc.id));

	// Precedes-edge endpoint integrity — BOTH endpoints must be milestone-block
	// items (an id resolving to another block is "wrong kind", equally missing).
	for (const e of ctx.relations) {
		if (e.relation_type !== MILESTONE_PRECEDES) continue;
		for (const endpoint of [e.parent, e.child]) {
			const key = endpointKey(endpoint);
			if (!milestoneIds.has(key)) {
				issues.push({
					code: "roadmap_precedes_endpoint_missing",
					message: diagMessage(
						cwd,
						"roadmap_precedes_endpoint_missing",
						`milestone_precedes_milestone edge {parent:${endpointKey(e.parent)}, child:${endpointKey(e.child)}} references '${key}' which is not a milestone-block item.`,
					),
					milestone_id: key,
				});
			}
		}
	}

	// Phase-membership integrity — a phase_positioned_in_milestone edge's child
	// must be a known milestone.
	for (const e of ctx.relations) {
		if (e.relation_type !== PHASE_IN_MILESTONE) continue;
		const childKey = endpointKey(e.child);
		if (!milestoneIds.has(childKey)) {
			issues.push({
				code: "roadmap_milestone_missing",
				message: diagMessage(
					cwd,
					"roadmap_milestone_missing",
					`phase_positioned_in_milestone edge {parent:${endpointKey(e.parent)}, child:${childKey}} references milestone '${childKey}' that is not declared in the milestone block.`,
				),
				milestone_id: childKey,
				phase_id: endpointKey(e.parent),
			});
		}
	}

	// Derived-view checks (cycles + per-phase rollup + isolation) read the same
	// derivation the load path produces.
	const view = loadRoadmap(cwd);
	if (!("error" in view)) {
		for (const cycle of view.cycles) {
			issues.push({
				code: "roadmap_milestone_cycle",
				message: diagMessage(
					cwd,
					"roadmap_milestone_cycle",
					`Milestone cycle in milestone_precedes_milestone edges: ${cycle.join(" → ")}`,
				),
				cycle,
			});
		}

		for (const m of view.milestones) {
			for (const p of m.phases) {
				if (p.rollup.bucket === "unknown" && p.rollup.total > 0) {
					issues.push({
						code: "roadmap_status_unknown_value",
						message: diagMessage(
							cwd,
							"roadmap_status_unknown_value",
							`Phase '${p.id}' in milestone '${m.id}' rolls up to bucket 'unknown' across ${p.rollup.total} item(s) — items lack a recognised status enum value.`,
						),
						milestone_id: m.id,
						phase_id: p.id,
					});
				}
			}
		}

		if (view.edges.length > 0) {
			const connected = new Set<string>();
			for (const e of view.edges) {
				connected.add(endpointKey(e.parent));
				connected.add(endpointKey(e.child));
			}
			for (const m of view.milestones) {
				if (!connected.has(m.id)) {
					issues.push({
						code: "roadmap_milestone_isolated",
						message: diagMessage(
							cwd,
							"roadmap_milestone_isolated",
							`Milestone '${m.id}' participates in no milestone_precedes_milestone edge while other milestones are ordered.`,
						),
						milestone_id: m.id,
					});
				}
			}
		}
	}

	// Info codes are excluded from status: invalid iff any error-code issue;
	// warnings iff any warning-code issue; else clean.
	let status: "clean" | "warnings" | "invalid" = "clean";
	if (issues.some((i) => ROADMAP_ERROR_CODES.has(i.code))) status = "invalid";
	else if (issues.some((i) => ROADMAP_WARNING_CODES.has(i.code))) status = "warnings";
	return { status, issues };
}

/**
 * Render a loaded MilestoneRoadmapView as pure-textual markdown — NO mermaid,
 * NO diagrams, NO graph syntax. Per-milestone **Preceded by:** adjacency lines
 * are sourced strictly from view.edges (sorted alphabetically; "—" when the
 * milestone has no incoming precedes edges). Cycle-participating milestones
 * are surfaced under a separate "**Unordered (cycle participants):**" heading
 * and a "**Cycles detected:**" line. The renderer never infers adjacency from
 * `order` consecutive pairs (that pattern fabricates sibling edges in
 * branching DAGs).
 */
export function renderRoadmap(view: MilestoneRoadmapView): string {
	const lines: string[] = [];
	const byId = new Map(view.milestones.map((m) => [m.id, m]));

	lines.push("# Roadmap (derived)");
	lines.push("");
	lines.push(
		`**Milestones:** ${view.milestones.length}  |  **Ordered:** ${view.order.length}  |  **Cycles:** ${view.cycles.length}`,
	);
	lines.push("");

	lines.push("## Milestone order");
	lines.push("");
	if (view.milestones.length === 0) {
		lines.push("(no milestones)");
		lines.push("");
	} else if (view.order.length === 0) {
		lines.push("(no acyclic ordering possible — see cycles below)");
		lines.push("");
	} else {
		view.order.forEach((id, idx) => {
			const m = byId.get(id);
			lines.push(`${idx + 1}. ${id} — ${m?.name ?? "(unnamed)"} [${m?.status ?? "planned"}]`);
		});
		lines.push("");
	}

	const orderedSet = new Set(view.order);
	const cycleOnly = view.milestones.filter((m) => !orderedSet.has(m.id));
	if (cycleOnly.length > 0) {
		lines.push("**Unordered (cycle participants):**");
		for (const m of cycleOnly) {
			lines.push(`- ${m.id} — ${m.name ?? "(unnamed)"}`);
		}
		lines.push("");
	}
	if (view.cycles.length > 0) {
		const rendered = view.cycles.map((c) => c.join(" → ")).join("; ");
		lines.push(`**Cycles detected:** ${rendered}`);
		lines.push("");
	}

	if (view.milestones.length === 0) {
		return lines.join("\n").replace(/\n+$/, "\n");
	}

	lines.push("## Milestones");
	lines.push("");

	// Render in topo order first, then any cycle-only milestones (input order).
	const renderOrder: string[] = [...view.order, ...cycleOnly.map((m) => m.id)];
	for (const id of renderOrder) {
		const m = byId.get(id);
		if (!m) continue;
		lines.push(`### ${m.name ?? "(unnamed)"} (${m.id}) [${m.status}]`);
		lines.push("");

		const incoming = view.edges
			.filter((e) => endpointKey(e.child) === m.id)
			.map((e) => endpointKey(e.parent))
			.sort();
		lines.push(`**Preceded by:** ${incoming.length > 0 ? incoming.join(", ") : "—"}`);

		const c = m.rollup.counts;
		lines.push(
			`**Rollup:** complete=${c.complete} in_progress=${c.in_progress} blocked=${c.blocked} todo=${c.todo} unknown=${c.unknown} (total=${m.rollup.total})`,
		);
		lines.push("");

		for (const p of m.phases) {
			lines.push(`#### ${p.name ?? "(unnamed)"} (${p.id}) [${p.status ?? "(unspecified)"}]`);
			lines.push("");
			if (p.tasks.length === 0) {
				lines.push("(no tasks)");
				lines.push("");
			} else {
				lines.push("| Task | Status |");
				lines.push("|------|--------|");
				for (const t of p.tasks) {
					lines.push(`| ${t.title ?? t.id} | ${t.status ?? ""} |`);
				}
				lines.push("");
			}
		}
	}

	return lines.join("\n").replace(/\n+$/, "\n");
}

// ── Lens-validator dispatch registration ─────────────────────────────────────
//
// Module-init side-effect: validateContext in context-sdk.ts iterates all
// registered lens-validators and merges their issues into the project-
// validation result. roadmap-plan registers itself here so import of this
// module from index.ts wires the dispatch automatically — no hardcoded
// import in context-sdk.ts. Only error-code issues contribute to the merge:
// warnings and info stay on the context-roadmap-validate surface.

registerLensValidator({
	name: "roadmap",
	validate: (cwd) => {
		const result = validateRoadmap(cwd);
		const issues: LensValidatorIssue[] = result.issues
			.filter((ri) => ROADMAP_ERROR_CODES.has(ri.code))
			.map((ri) => ({
				code: ri.code,
				severity: "error" as const,
				message: ri.message,
				block: "milestone",
				...(ri.phase_id ? { field: `phase.${ri.phase_id}` } : {}),
			}));
		const status: "clean" | "warnings" | "invalid" = issues.length === 0 ? "clean" : "invalid";
		return { status, issues };
	},
});
