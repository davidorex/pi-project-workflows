# Experiment evaluation — B1 draft-success-criteria, iteration 01

**Capture**: `04-draft-success-criteria.json` (sibling file)
**Spec**: `draft-success-criteria` (B1)
**Snippet body source**: `prompt-workshop/snippets/04-draft-success-criteria.md` (verbatim from `ai/migrations/0005`)
**Shared preamble state**: post-`518fba9` (strengthened school-wide-means-school-wide operational policy — FIRST experiment against this)
**Sub-agent**: general-purpose, opus
**Seed**: `""` (empty)
**Draft state going in**: A1 narrative (5 prose fields) + A3 alignment (7 SLOs + 3 mission areas + 7 AFIs + 5 stakeholders + 0 policies)
**Dispatched at**: 2026-05-29T07:14:40

## Disposition

**Pass.** All 8 hypothesis items met; strengthened-preamble translation visible in the criteria text.

## Per-hypothesis evaluation

1. **Shape**: ✅ `{"criteria": [6 objects]}` (6 within the 3-6 range). Each object has `text` + `verification_kind`. Target-kind criteria carry `target_value` (number) + `target_unit` (string) + `baseline` (number); non-target criteria omit them.

2. **Kind-discipline**: ✅ The audit's load-bearing B1 finding holds — no number smuggled into a non-target criterion's `text`. Criterion 6 references "seven SLOs" and "six standards" as factual catalogue counts (not metrics), consistent with the prompt's "numbers belong inside a target criterion's three target fields" applied to thresholds, not factual labels.

3. **Substantiveness**: ✅ Every `text` is a concrete observable statement. Examples:
   - Criterion 1 (inspection): names the artifact + where it's posted (staff handbook, student-facing learning materials, parent reporting portal)
   - Criterion 2 (target): "Every department's unit plans ... name the one or two SLOs each unit advances and attach at least one assessment artifact per unit that produces SLO-tagged evidence"
   - Criterion 5 (judgment): names the reviewer (divisional leadership) + the rubric (shared rubric applied to sampled student reflections and portfolio entries)

4. **Mix of kinds**: ✅ 3 inspection + 2 target + 1 judgment = all 3 kinds represented.

5. **Draft-awareness**: ✅ Criteria cite A1 desired_state content directly — "behavioral descriptor at the depth of the current Confident descriptor", "every department's unit plans name the one or two SLOs each unit advances", "PLC cycles in every division open with an SLO frame", "Parent reporting at each reporting cycle includes an SLO-organized narrative section", "annual self-study against WASC standards A1, A4, B1, B2, B3, and C1 ... use the SLOs as the organizing categories" — all near-verbatim from A1's desired_state.

6. **Validation**: ✅ Production `parse_draft_success_criteria` accepted; parse note: "Drafted 6 success criteria — review and refine".

7. **Merge**: ✅ `MERGE_RULES[criteria, fields]` appended the 6 criteria to `draft.success_criteria`.

8. **Strengthened-preamble watch**: ✅ Criteria text names divisions repeatedly:
   - "faculty across the bilingual program, subject departments, homeroom system, and co-curricular program"
   - "divisional leadership"
   - "every division" (PLC cycles)
   - "every department" (unit plans)
   - "every enrolled student" + "divisional leadership ... sampled set ... from each division"
   - "leadership reviews", "PLC minutes across the year"
   
   The strengthened policy translated substantively even where the schema (text + verification_kind + optional target fields) doesn't enforce division coverage. **Honest caveat**: the criteria's text frames divisions as participants (every division, every department, divisional leadership) but doesn't name each top-level division by its specific role. The schema doesn't require this; the prompt body doesn't direct it; partial translation is reasonable. A stronger expression would name Curriculum and Teaching, AAO, SAO, the Subject Departments, etc., per their specific roles. Worth noting as a refinement opportunity but not a fail — the strengthened policy clearly shifted behavior vs. how B1 would have read pre-`518fba9`.

## Per-watch-for-observation evaluation

1. **HTML-entity-escape in draft_state**: confirmed present (visible `&#x27;` in A1 desired_state at line 34 of /tmp/b1-prompt-clean.txt). Sub-agent handled transparently. No degradation.
2. **AXES log line in render.py stdout**: confirmed present; stripped before dispatch.
3. **Latency**: ~16s for B1 (faster than A1 ~43s and A3 ~28s). Sub-agent's response was compact (~5K chars JSON).

## Surfaced findings

1. **B1 produces strong output under the production prompt body + strengthened preamble**. The audit's prediction (B1 is among the strongest prompts) holds in practice.

2. **The strengthened preamble translates partially.** Divisions are NAMED in the criteria text (good); per-criterion division ownership isn't explicitly mapped (schema doesn't enforce; prompt doesn't direct). This is the expected first-iteration result for a spec whose schema doesn't have division fields. For specs WITH division fields (F2 assignments, F5 evidence, US-LLM-27 responsibilities, C1 channels), the strengthened policy should translate to literal per-division row coverage; B1 is the test case where the policy translates via prose framing only.

3. **B1 needs no snippet-side edit at this iteration**. Move forward.

## Signal for next iteration

Next experiment per dependency-respecting strongest-first: **03-propose-milestones (D1)**. D1 unblocks F1 → F2 → US-LLM-27 (the chain that delivers the per-step-grain experiments where the strengthened preamble's division-coverage requirement bites schema-side, not just prose-side). D1 itself is rated middle-band per audit; the experiment is partly about confirming the harness handles its output shape AND about preparing the draft state for the dependency chain.
