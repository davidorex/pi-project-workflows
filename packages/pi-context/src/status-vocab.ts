/**
 * Status-vocabulary primitives — pure helpers mapping per-schema status enum
 * values to a normalized StatusBucket, plus the config-override resolver.
 *
 * Extracted here (from roadmap-plan.ts) so both roadmap-plan AND project-sdk
 * can consume the vocabulary without forming a module import cycle. This
 * mirrors the topo.ts extraction precedent: project-sdk's currentState +
 * validateProject (status-consistency invariants) and roadmap-plan's
 * rollupPhaseStatus both bucket statuses; routing both through one
 * substrate-light module (it imports only getProjectContext from
 * project-context, which depends on neither roadmap-plan nor project-sdk)
 * keeps the dependency graph acyclic.
 *
 * StatusBucket itself is declared in project-context.ts (the substrate type
 * surface) and imported/re-exported here; it is NOT redeclared.
 */
import { getProjectContext, type StatusBucket } from "./project-context.js";

export type { StatusBucket } from "./project-context.js";

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
 *   - tasks.status: planned | in-progress | completed | blocked | cancelled
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
export const STATUS_VOCABULARY_DEFAULTS: Record<string, StatusBucket> = {
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
	planned: "todo",
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
