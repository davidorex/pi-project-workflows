/**
 * Dispatch context — authorship attestation surface for block-api writes.
 *
 * Closes structurally:
 *   - FGAP-004 (authorship attestation at block write time): block-api write
 *     functions accept an optional `DispatchContext`. When provided AND the
 *     target schema declares author fields (created_by / created_at /
 *     modified_by / modified_at), the write surface stamps the item before
 *     AJV validation. When omitted, behavior is byte-identical to the prior
 *     surface — the parameter is purely additive.
 *
 * Convention reference: `created_by` strings already in committed blocks
 * follow `<kind>/<id>`, e.g. `agent/claude-opus-4-6` in
 * `.project/decisions.json`. `writerToString` reproduces that exact format
 * across the four `WriterIdentity` discriminants.
 *
 * Out-of-scope for step 3:
 *   - Adding author fields to schemas that lack them (FGAP-006 schema
 *     versioning territory; step 4)
 *   - Migrating existing block-api callers to pass `ctx` (incremental;
 *     opt-in by design — never required)
 *   - Deprecating non-ctx writes (no — `ctx` remains optional for the
 *     full rebuild arc)
 *
 * This module has no external dependencies — pure types + helpers — so it
 * can be imported from block-api.ts, schema-write.ts, or any consumer
 * without forming a cycle through context / context-sdk.
 */

// ── Type definitions ────────────────────────────────────────────────────────

/**
 * Discriminated union of writer kinds. Each branch carries the minimum id
 * needed to round-trip through `writerToString`. The string form is the
 * canonical write-time author marker shape used in `.project/*.json`.
 */
export type WriterIdentity =
	| { kind: "human"; user: string }
	| { kind: "agent"; agent_id: string; model?: string }
	| { kind: "monitor"; monitor_name: string }
	| { kind: "workflow"; workflow_step_id: string };

/**
 * Optional final argument passed to block-api write functions. The shape
 * stays minimal in step 3 — `writer` is the single field — so future
 * additions (trace ids, run ids, intent labels) extend the interface
 * without breaking existing callers.
 */
export interface DispatchContext {
	writer: WriterIdentity;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Render a `WriterIdentity` into the canonical `<kind>/<id>` string form.
 * The id segment is the human-readable identifier per kind:
 *   - human    → `user`
 *   - agent    → `agent_id`
 *   - monitor  → `monitor_name`
 *   - workflow → `workflow_step_id`
 *
 * Examples (matches existing decisions.json convention):
 *   writerToString({kind: "agent", agent_id: "claude-opus-4-7"})
 *     → "agent/claude-opus-4-7"
 *   writerToString({kind: "human", user: "david"})
 *     → "human/david"
 *   writerToString({kind: "monitor", monitor_name: "fragility-detector"})
 *     → "monitor/fragility-detector"
 *   writerToString({kind: "workflow", workflow_step_id: "step-5"})
 *     → "workflow/step-5"
 *
 * `model` on agent writers is informational metadata — it is intentionally
 * excluded from the canonical string form to keep author markers stable
 * across model upgrades for the same agent.
 */
export function writerToString(w: WriterIdentity): string {
	switch (w.kind) {
		case "human":
			return `human/${w.user}`;
		case "agent":
			return `agent/${w.agent_id}`;
		case "monitor":
			return `monitor/${w.monitor_name}`;
		case "workflow":
			return `workflow/${w.workflow_step_id}`;
	}
}

/**
 * Stamp authorship fields onto a copy of `item` and return the new object.
 * The original `item` is never mutated — callers can safely retain the
 * pre-stamp reference.
 *
 * Stamping rules (each field is only assigned when `declaredFields` includes
 * its name — schemas that declare a SUBSET of the four author fields receive
 * stamps only for the declared subset; the rest are left untouched so that
 * `additionalProperties: false` schemas validate cleanly):
 *   - mode === "create":
 *       `created_by` and `created_at` (if declared) are set ONLY if the field
 *       is missing (or present-but-undefined). Pre-existing values are
 *       preserved so that re-creates / replays do not overwrite the original
 *       author. `modified_by` and `modified_at` (if declared) are always set
 *       to current values.
 *   - mode === "update":
 *       `created_by` and `created_at` are NEVER touched even when declared.
 *       `modified_by` and `modified_at` (if declared) are always refreshed
 *       to current values.
 *
 * Timestamps use ISO 8601 via `new Date().toISOString()`, matching the
 * format shipping in `.project/decisions.json` etc.
 *
 * `declaredFields` is the per-schema set of author-field property names that
 * the target shape's `properties` object declares. The block-api schema
 * introspection cache builds the set per (block, arrayKey or envelope) and
 * threads it in here. An empty set means "schema declares no author fields"
 * — `stampItem` then returns the item unchanged. Callers should normally
 * route through `maybeStampItem` (block-api.ts) which short-circuits before
 * this function on an empty set; the empty-set path here is defensive.
 */
export function stampItem(
	item: Record<string, unknown>,
	ctx: DispatchContext,
	mode: "create" | "update",
	declaredFields: ReadonlySet<string>,
): Record<string, unknown> {
	if (declaredFields.size === 0) return { ...item };

	const writer = writerToString(ctx.writer);
	const now = new Date().toISOString();
	const out: Record<string, unknown> = { ...item };

	if (mode === "create") {
		if (declaredFields.has("created_by") && (out.created_by === undefined || out.created_by === null)) {
			out.created_by = writer;
		}
		if (declaredFields.has("created_at") && (out.created_at === undefined || out.created_at === null)) {
			out.created_at = now;
		}
	}

	// modified_by + modified_at refresh on every call — both create (item is
	// also being modified at create time) and update — but only when declared.
	if (declaredFields.has("modified_by")) {
		out.modified_by = writer;
	}
	if (declaredFields.has("modified_at")) {
		out.modified_at = now;
	}

	return out;
}
