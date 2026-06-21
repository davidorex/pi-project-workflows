# Experiment evaluation — D1 propose-milestones, iteration 01

**Capture**: `03-propose-milestones.json`
**Rendering**: `03-propose-milestones.rendering.md` (rendered by sonnet, bracketed-tag heading device)
**Spec**: `propose-milestones` (D1)
**Snippet body source**: `prompt-workshop/snippets/03-propose-milestones.md` (verbatim from `ai/migrations/0006`)
**Shared preamble state**: post-`518fba9` (strengthened school-wide-means-school-wide policy)
**Dispatch sub-agent**: general-purpose, **opus**
**Rendering sub-agent**: general-purpose, **sonnet**
**Seed**: `""` (the meta seed_text "Improve SLO usage across the school" was substituted into the snippet's `{% if seed %}` block via the draft.meta carry-through)
**Draft state going in**: A1 narrative + A3 alignment (7 SLOs / 3 mission areas / 7 AFIs / 5 stakeholders) + B1 success criteria (6 criteria)
**Dispatched at**: 2026-05-29T08:39:16

## Disposition

**Pass-with-caveats.** All 10 hypothesis items addressed; 2 type-method invariant concerns surfaced that the production parser accepted but a WASC-fidelity reading should challenge.

## Per-hypothesis evaluation

1. **Shape**: ✅ `{"milestones": [4 objects]}` (within 2-4 range). Each has `label` + `target_date` + `improvement_type` + (when applicable) `planning_method`.

2. **Date discipline**: ✅ All 4 dates within the 2025-2026 cycle window (2025-11-28 / 2026-02-13 / 2026-05-15 / 2026-07-24). Sequenced trajectory (T1 → T2 → T3 → cycle-end).

3. **Type-method invariant**: ⚠ **TWO LIKELY VIOLATIONS**:
   - M1: `improvement_type=schoolwide-learner-outcomes` (REQUIRES a planning method) + `planning_method="Policy revision (6-step consultative)"`. Per the grounding, this method's `applicable_improvement_types` = `{policy-establishment, policy-revision}` — does NOT include `schoolwide-learner-outcomes`. The prompt body says "a method linked to that type, or one that applies to any type"; this method is linked to specific types that don't include the chosen one, and isn't an "any type" method. Strict reading: violation. The sub-agent picked the method whose substantive process (cross-divisional descriptor authoring) most resembles policy revision, even though the type-tag doesn't match.
   - M2: `improvement_type=curriculum-development` + `planning_method="Tool / platform customization"`. Method's `applicable_improvement_types` = `{tool-or-platform}`. Same issue: chosen method's applicability doesn't include the chosen type.

   Production parser ACCEPTED both — parse=passed. This is a real-world workshop finding: **production parser is permissive on the method/type cross-reference**; the prompt body's constraint is enforced only by the LLM's interpretation, not by the parser. For the eventual `ai/0018+` migration / a sibling production change, the canonical resolution is to **tighten the parser to enforce admin curation** — `PlanningMethod.applicable_improvement_types` is an admin-curated M2M (DEC-8 / `5d04573`); the LLM picking methods whose applicable_types don't include the chosen improvement_type substitutes LLM judgment for admin curation, which inverts the project's pattern across every other vocabulary linkage (admin curates; LLM chooses from). Loosening the prompt to accommodate the permissive behavior is not on the table — it would actively undermine admin authority over the M2M.

4. **Code/name discipline**: ✅ All 4 `improvement_type` codes are from the 32 seeded (verified against grounding). Both `planning_method` names are exact matches from the 4 seeded methods.

5. **Draft-awareness**: ✅ Milestones cite A1 + B1 content directly:
   - M1 ties to A1's "behavioral descriptor at the depth of the current Confident descriptor" + B1 C0
   - M2 ties to B1 C1 + C2 (unit-plan SLO naming + PLC frames)
   - M3 ties to B1 C3 + C4 (parent narrative + student self-reflection)
   - M4 ties to B1 C5 (self-study against WASC A1/A4/B1/B2/B3/C1)
   The trajectory descriptor-author → unit-plan-update → student/parent routines → self-study-binder is the natural sequencing the B1 criteria implied.

6. **Substantiveness**: ✅ Each label is a concrete checkpoint with operational meaning. M1 names cross-divisional faculty teams + Senior Leadership Team validation + publication surfaces (staff handbook, parent handbook, student-facing materials). M3 names EY, Primary, Secondary, and the bilingual program as the divisions delivering the routines. M4 names the WASC standards by code.

7. **Strengthened-preamble watch**: ✅ Milestone labels frame milestones as cross-divisional checkpoints (M1: "cross-divisional faculty teams"; M2: "every department"; M3: "across EY, Primary, Secondary, and the bilingual program"; M4: "the seven SLOs as the organizing evidence categories"). Even without a schema-level division field, the labels carry the school-wide framing.

8. **Validation**: ✅ Production `parse_propose_milestones` accepted; parse note: "Proposed 4 milestones — review and refine".

9. **Merge**: ✅ `MERGE_RULES[milestones, fields]` appended to `draft.milestones`.

10. **Sonnet rendering**: ✅ Rendering sub-agent (sonnet) wrote `03-propose-milestones.rendering.md` with bracketed-tag heading device (`[with method]` / `[no method]`) — clear visual cue for the method-bearing-vs-not distinction. Verified faithful to source JSON; no synthesis. **Model-for-task check**: sonnet sufficient for the rendering task (second datapoint after B1).

## Per-watch-for-observation evaluation

1. **HTML-entity-escape in draft_state**: confirmed present (`&#x27;` for apostrophes in the draft_state section of the rendered prompt). Sub-agent handled transparently — milestone labels cite draft content correctly.
2. **AXES log line in render.py stdout**: confirmed; stripped before dispatch.
3. **Latency**: dispatch sub-agent ~15s (opus); rendering sub-agent ~23s (sonnet). Total ~38s end-to-end for the experiment loop.

## Surfaced findings

1. **NEW workshop-level finding (the type-method-invariant permissiveness)**: the production `parse_propose_milestones` does NOT enforce the type-method cross-reference the prompt body claims as a rule. The LLM treated the prompt's "linked to that type, or one that applies to any type" as a soft preference, picking the method whose process most resembles the milestone's intent (M1: policy-revision shape for descriptor authoring; M2: tool/platform shape for gradebook update). This is the kind of contract-vs-enforcement gap the workshop is designed to surface. **Canonical resolution**: tighten the parser to enforce the admin-curated `applicable_improvement_types` M2M (DEC-8 / `5d04573`). Admin-curated structure is the project's source of truth across every vocabulary linkage; the LLM chooses from, never overrides. When the parser rejects a cross-tag method, the LLM is forced into one of two real human-curated outcomes: (a) pick a different `improvement_type` whose admin-curated methods are available, or (b) admin extends the M2M to add the chosen method as applicable to the chosen type — a curation decision the admin makes explicitly, not the LLM implicitly assumes. Tracked as a corpus-side finding to inform the eventual production landing (parser change, not a body-language change).

2. **Operational-policy translation in milestone labels**: the strengthened preamble's "every division has a role" directive translated into per-milestone cross-divisional framing (M1's cross-divisional faculty teams + Senior Leadership Team; M3's EY/Primary/Secondary/bilingual program). Same prose-framing pattern as B1; schema doesn't enforce per-row division ownership but the prose carries the framing.

3. **Cross-spec coherence**: D1's milestones explicitly track to B1's criteria (M1↔C0; M2↔C1+C2; M3↔C3+C4; M4↔C5). This is the kind of cross-spec coherence the workshop's sequenced approach makes possible — and the kind of coherence the production prompt corpus needs more of (per audit gap #2 about sequencing-dependencies-encoded-only-in-draft_state).

4. **Sonnet rendering held**: second datapoint confirming sonnet is the right model for the rendering role. No drift, no synthesis, faithful to source.

## Signal for next iteration

D1's milestones land cleanly enough that downstream specs (F1) have something to consume. **Next experiment**: experiment 05 = F1 decompose-action-steps. F1 reads milestones[].improvement_type to pick a planning method whose templates expand into concrete steps. With 4 milestones now in the draft, F1 has substantive material.

Production-corpus finding to track for Step 6: the `parse_propose_milestones` type-method cross-reference is parser-permissive but prompt-strict. Canonical resolution: tighten the parser to enforce admin-curated `applicable_improvement_types`. Admin curation is the project's source of truth; the LLM's substantive-fit reasoning is a signal to enforce, not a license to loosen.
