# Experiment evaluation — A3 propose-domain-alignment, iteration 01

**Capture**: `02-propose-domain-alignment.json` (sibling file)
**Spec**: `propose-domain-alignment` (A3 post-0016)
**Snippet body source**: `prompt-workshop/snippets/02-propose-domain-alignment.md` (verbatim from `ai/migrations/0016`)
**Shared preamble state**: as committed `a0b4cca` (audit-gap corrections; unchanged)
**Workshop tooling state**: post-`d5f9598` (flatten_draft_for_grounding helper landed; experiment-02 blocker unblocked)
**Sub-agent**: general-purpose, opus
**Seed**: `""` (empty — let LLM align purely from A1 narrative + catalogues)
**Draft state going in**: A1's 5 narrative fields from experiment 01 (current_state / desired_state / rationale / student_impact_framing / provenance)
**Dispatched at**: 2026-05-29T07:02:59 (capture timestamp)

## Disposition

**Pass.** All 7 hypothesis items from the pre-registered intent met. Production-parity demonstrated end-to-end. The shared preamble + the A1 narrative both visibly shaped the output.

## Per-hypothesis evaluation

1. **Shape**: ✅ JSON object with the 6 required keys (`learner_outcomes`, `mission_areas`, `stakeholder_impact`, `areas_for_improvement`, `policies_established`, `policies_revised`). Each value a list of `{label, rationale}` objects. The 4 alignment relations non-empty; the 2 policy arrays empty (per contract's "may be empty"). Production parser remapped the short keys to the production relation names (`learner_outcomes_targeted` etc.) via `MERGE_RULES[basics, alignment-formsets]` correctly.

2. **Substantiveness**: ✅ Every `rationale` is 1-3 sentence concrete prose citing specific A1 narrative content. Examples:
   - Bilingual Communicators: "the desired state requires shared behavioral descriptors and SLO-tagged assessment evidence across the bilingual program"
   - Confident: "depth-benchmark the plan uses for authoring the other six descriptors"
   - Reflective: "the desired-state commitment that students use SLO vocabulary in self-reflection at term reporting and portfolio review"
   - Administration/Leadership: "leadership to use SLOs as the organizing categories for classroom walkthroughs, work-sample reviews, and the annual WASC self-study"

3. **Draft-awareness**: ✅ Rationales repeatedly cite A1's specific phrasings — the Confident-only-descriptor gap, the 7-of-8-AFIs framing, the four framing audiences (schoolwide/teaching/student/parent), the unit-plans-naming-SLOs commitment, the PLC SLO-frame requirement, the parent-reporting SLO-organized narrative section, the leadership-walkthroughs-organized-by-SLO requirement. This is NOT generic alignment; the LLM consumed the A1 narrative as substantive ground.

4. **Operational policy (distribute across divisions/groups)**: ✅ stakeholder_impact distributes across 5 of 6 groups (Admin/Leadership + Staff/Faculty + Students + Parents + Parent Committee). Admissions Applicants intentionally omitted with implicit defensibility (the SLO-usage plan doesn't impact applicants pre-admission). All 7 SLOs selected (not a narrowing to 1-2). All 7 AFIs selected (matching A1's claim "seven of the eight AFI domains touch SLO usage directly"). All 3 mission areas selected.

5. **Catalogue compliance**: ✅ Every `label` is exact-match from the grounding catalogue (verified by inspection — including the long Confident label that carries the description suffix). No invented labels.

6. **Validation**: ✅ Production `parse_propose_domain_alignment` accepted without complaint. Parse note: "Proposed alignment across 4 domains".

7. **Merge**: ✅ `MERGE_RULES[basics, alignment-formsets]` landed all 6 relations under `draft.domain_alignment` with the production relation-name keys (the per-relation key remapping from prompt-contract names to production model-field names works correctly).

## Per-watch-for-observation evaluation

1. **HTML-entity-escape in `draft_state`**: ✅ Confirmed present — `desired_state`, `rationale` etc. show `&#x27;` (encoded `'`) in the rendered prompt. **Sub-agent handled it transparently** — every rationale citing A1 content reads as if the LLM saw clean prose. The HTML entities did not degrade output quality at this density. Conclusion: the autoescape is a cosmetic-only issue at A1-density draft state; if denser cases (post-many-experiment draft state) surface degradation, that's a future workshop iteration. NOT escalating to a workshop-side fix at this time.

2. **AXES log line in render.py stdout**: ✅ Confirmed present (visible in `/tmp/a3-post-fix.txt:1`). Stripped before sub-agent dispatch (orchestrator-side `tail -n +2`). Cosmetic; workshop fix deferrable.

3. **Latency**: ~28s for A3 (faster than A1's ~43s, against expectation that A3 would be slower due to more grounding). Sub-agent token-budget likely amortized the response composition.

## Surfaced findings

1. **The flatten_draft_for_grounding fix WORKED end-to-end**. The A1 narrative reached the LLM via the production-parity flat shape; the LLM consumed it substantively. The workshop-side defect surfaced in the experiment-02 first attempt is closed.

2. **The post-0016 A3 prompt produces high-quality alignment**. Every rationale ties the chosen row to specific draft content + names accreditation evidence. This is among the audit's strongest prompts; the experiment confirms the rating.

3. **Production-parity contract held**. The prompt the workshop's LLM saw is the same shape production's LLM would see — flat draft_state + shared preamble corrections + grounding catalogues. The eventual `ai/0018+` migration that lands the validated bodies into production will produce identical-shape outputs in production.

4. **No snippet-side edit indicated for A3 at this iteration**. The post-0016 production body + the shared preamble produce a substantive A3 output. Move to the next snippet.

## Signal for next iteration

Per the strongest-first list in WORK-PLAN Step 4: **next snippet is 07-propose-responsibilities (US-LLM-27)** — the other audit-identified strongest prompt with explicit inter-spec coherence ("PREFER atoms owned by that responsible unit"). Tests whether the harness handles the per-step-grain output shape with two-grain responsibility atoms.

(After US-LLM-27 the strongest-first list opens to 05-decompose-action-steps (F1) and 04-draft-success-criteria (B1).)
