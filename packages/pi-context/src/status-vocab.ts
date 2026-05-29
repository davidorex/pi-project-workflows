/**
 * Status-vocabulary primitives — pure helpers mapping per-schema status enum
 * values to a normalized StatusBucket, plus the config-override resolver.
 *
 * Extracted here (from roadmap-plan.ts) so both roadmap-plan AND context-sdk
 * can consume the vocabulary without forming a module import cycle. This
 * mirrors the topo.ts extraction precedent: context-sdk's currentState +
 * validateContext (status-consistency invariants) and roadmap-plan's
 * rollupPhaseStatus both bucket statuses; routing both through one
 * substrate-light module (it imports only loadContext from
 * context, which depends on neither roadmap-plan nor context-sdk)
 * keeps the dependency graph acyclic.
 *
 * StatusBucket itself is declared in context.ts (the substrate type
 * surface) and imported/re-exported here; it is NOT redeclared.
 */
import { loadContext, type StatusBucket } from "./context.js";

export type { StatusBucket } from "./context.js";

/**
 * Hardcoded baseline mapping from per-schema status enum values to
 * StatusBucket. Per-project overrides land via config.status_buckets and
 * shadow these defaults at lookup time (resolveStatusVocabulary spreads
 * the user map over the defaults so user keys win on collision).
 *
 * Mappings cover the going-forward conception vocabulary — the status enums
 * of packages/pi-context/samples/schemas/ (the DEC-0037 15-kind canon, all
 * also live in this repo's .project/ registered block_kinds). Per DEC-0036
 * (registry/ is retiring in favor of samples/→.context) these defaults track
 * the conception, NOT the retired registry-only vocab (audit pass/fail/warn/
 * skip, project inception/planning/development/maintenance, decisions
 * revisit/tentative) — a substrate needing such vocab declares it via
 * config.status_buckets (DEC-0025 override surface), never here.
 *   - decisions.status:      open | enacted | superseded
 *   - framework-gaps.status: identified | accepted | in-progress | closed | wontfix
 *   - tasks.status:          planned | in-progress | completed | blocked | cancelled
 *   - features.status:       proposed | approved | in-progress | in-review | complete | blocked | cancelled
 *   - story.status:          proposed | ready | in-progress | in-review | complete | blocked
 *   - research.status:       planned | in-progress | complete | stale | superseded | revised
 *   - requirements.status:   proposed | accepted | deferred | implemented | verified
 *   - verification.status:   passed | failed | partial | skipped
 *   - spec-reviews.status:   not-started | in-progress | complete | abandoned
 *   - layer-plans.status:    draft | proposed | decided | in-progress | complete | abandoned
 *   - issues.status:         open | resolved | deferred
 *   - phase.status:          planned | in-progress | completed
 *   - work-orders.status:    proposed | in-progress | real-check-passed | real-check-failed | completed | cancelled
 *
 * status-vocab.test.ts guards completeness: every samples/schemas status enum
 * value must resolve here (only the intended terminal-not-complete set may map
 * to "unknown"). Values still bucket to "unknown" without throwing — caller
 * decides whether unknown statuses are warning-worthy (validateRoadmaps emits
 * roadmap_status_unknown_value when relevant).
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
	closed: "complete", // framework-gaps: gap resolved/done
	verified: "complete", // requirements: terminal-done, beyond "implemented"
	"real-check-passed": "complete", // work-orders: real-check verdict pass = lifecycle-complete equivalent (DEC-0018)
	// → in_progress
	in_progress: "in_progress",
	"in-progress": "in_progress",
	active: "in_progress",
	accepted: "in_progress",
	"in-review": "in_progress", // features/story: under review, still active (not yet complete)
	revised: "in_progress", // research: transient state during re-investigation
	partial: "in_progress", // verification: incomplete — NOT a clean pass, must not assert complete
	// → blocked
	blocked: "blocked",
	paused: "blocked",
	failed: "blocked",
	"real-check-failed": "blocked", // work-orders: real-check verdict fail = lifecycle-blocked equivalent (DEC-0018)
	// → todo
	open: "todo",
	todo: "todo",
	planned: "todo",
	proposed: "todo",
	draft: "todo",
	identified: "todo",
	"not-started": "todo",
	pending: "todo",
	approved: "todo", // features: approved to build, not yet started
	ready: "todo", // story/features: refined + ready to pick up, not started
	decided: "todo", // layer-plans: plan decided to execute, before in-progress
	// superseded / cancelled / deferred / abandoned / wontfix / skipped / stale
	// bucket to unknown — terminal-but-not-complete states that don't fit the
	// linear progress narrative. Roadmap/plan rollups treat them as "doesn't
	// count toward progress" rather than as complete or todo.
	superseded: "unknown",
	superseded_by: "unknown", // framework-gaps: gap absorbed by a TASK that lands canonical resolution (mis-scoped FGAP closure pattern; v1.1.0 enum extension)
	cancelled: "unknown",
	deferred: "unknown",
	abandoned: "unknown", // layer-plans/spec-reviews: work stopped, not completed
	wontfix: "unknown", // framework-gaps: decided not to address
	skipped: "unknown", // verification: waived/not run — must not assert complete
	stale: "unknown", // research: grounding no longer authoritative (degraded-complete)
};

/**
 * Resolve the active status-vocabulary map for `cwd` — defaults shadowed
 * by config.status_buckets entries. Pure: builds a fresh map per call;
 * callers caching for hot paths (rollupPhaseStatus over many phases)
 * should pass the resolved map in directly.
 */
export function resolveStatusVocabulary(cwd: string): Record<string, StatusBucket> {
	const ctx = loadContext(cwd);
	return { ...STATUS_VOCABULARY_DEFAULTS, ...(ctx.config?.status_buckets ?? {}) };
}
