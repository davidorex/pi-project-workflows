# Experiment evaluation — F1 decompose-action-steps, iteration 01

**Capture**: `05-decompose-action-steps.json`
**Rendering**: `05-decompose-action-steps.rendering.md` (rendered by sonnet, method-as-H1 + numbered-step-H2 device)
**Spec**: `decompose-action-steps` (F1)
**Snippet body source**: `prompt-workshop/snippets/05-decompose-action-steps.md` (verbatim from `ai/migrations/0004_seed_decompose_action_steps_template`)
**Shared preamble state**: post-`8239df5` (strengthened school-wide policy + voice constraint; ANTECEDENT to the DEC-39 no-fabrication invariant which lands AS PART OF THIS EXPERIMENT'S COMMIT)
**Dispatch sub-agent**: general-purpose, **opus**
**Rendering sub-agent**: general-purpose, **sonnet**
**Seed**: `"Improve SLO usage across the school"` (carried through `current-draft.json::meta.seed_text` into the snippet's `{% if seed %}` block)
**Draft state going in**: A1 narrative + A3 alignment (7 SLOs / 3 mission areas / 7 AFIs / 5 stakeholders) + B1 success criteria (6 criteria) + D1 milestones (4 rows, two with `planning_method` set)
**Dispatched at**: 2026-05-29T10:02:27

## Disposition

**No-fabrication-violation: DIAGNOSTIC PASS / CORPUS DEFECT EXPOSED.** The shape passed, the merge passed, the rendering held — but the output named seven non-existent leadership Position titles plus several invented role-labels, demonstrating a structural defect in the prompt-corpus that the experiment was the right instrument to surface. The capture stays as the forensic exemplar of the pre-fix state; resolution path is DEC-39 + DISC-27 (landed this turn) + the per-spec grounding-tuple remediation slice (open follow-on plan→IMPL).

## The headline finding (no-fabrication violation)

The LLM invented seven leadership Position titles that do not exist in the dev DB:

| Invented in F1 output | Actual dev-DB Position | Note |
| --- | --- | --- |
| Vice Principal for Academics | (no such role) | The school has IHS Principal + Director of Teaching and Curriculum Center |
| Vice Principal for Bilingual Programme | (no such role) | There is no Bilingual Programme division at all |
| Heads of Early Years, Primary, and Secondary | (no such roles) | School is subject-organized (Math/Sciences/English/Humanities/…); year structure is IG1/IG2/AS/A2 Cambridge bands |
| Heads of Chinese and English Departments | Head of English exists; no Chinese Department | Chinese Teacher sits under Humanities; no separate Chinese Department |
| Head of Co-Curricular Programme | (no such role) | Music and Sports Department exists as a division but no leader Position seeded |
| Head of Student Affairs | Director of Student Affairs Office | Real name is "Director of SAO", not "Head of Student Affairs" |
| Head of Admissions and Communications | (no such role) | Recruitment and Admissions division exists but no leader Position seeded |

Plus invented role-labels: "gradebook configurator", "PLC-minutes template owner", "classroom-walkthrough form owner", "unit-template owner", "parent-report-template owner", "student-reflection prompt owner", "downstream-artifact owners". None of these are admin-curated Positions; they are work-role nouns the LLM fabricated to attribute step ownership.

**Cause** (two-sided, per DISC-27): (a) F1's `grounding_include` tuple (`planner/specs.py:544-552`) does NOT include `divisions` (which would nest positions + responsibility-atoms via `ai/services/grounding.py:_divisions`) or `stakeholder_groups`. The LLM was handed no enumerated universe of Chiway divisions or positions. (b) The strengthened preamble's "name real Chiway actors and units" directive was positive-only — told the LLM to be specific without the inverse constraint that anything not in the grounding is not in the school. With the positive directive but no enumeration, the LLM complied by drawing on its general training of how international schools are typically organized (VP-Academics, EY/Primary/Secondary heads, etc.). Specificity-shaped prose that names non-existent actors satisfies the surface of the rule and violates its substance.

**Resolution path** (landed this turn): DEC-39 formalizes the no-fabrication invariant as project policy; `prompt-workshop/shared/preamble.md` carries the constitutive constraint between the solution-architect framing and the success criteria (applies to all 14 workshop snippets via `{% include %}`). The per-spec grounding-tuple audit + remediation across the 14 specs is open follow-on plan→IMPL (Mode B); per-spec gap inventory recorded in DEC-39 + DISC-27.

## Per-hypothesis evaluation (the pre-registered 11 items)

1. **Shape**: ✅ `{"method": "Policy revision (6-step consultative)", "steps": [6 objects]}`. Each step has `description` (string) + `assessment` (string). No extra keys, no nesting beyond contract.

2. **Method-selection-among-universe**: ✅ Chose "Policy revision (6-step consultative)" — exact verbatim match to one of the 4 admin-curated method names. Picked the method whose 6-step template best fits the descriptor-authoring trajectory (which D1's milestones-0 had also tagged with this method). Treated draft.milestones' planning_method assignment as a useful hint; did not invent a method.

3. **Template-expansion fidelity**: ✅ 6 steps == 6 templates ("Present options at admin meeting" / "Finalize initial draft" / "Publicize draft to stakeholders for feedback" / "Integrate feedback" / "Finalize after feedback and publish" / "Propagate / embed into downstream artifacts"). Template order preserved. Each step's description IS a concretization of the corresponding template line for the SLO-descriptor authoring work.

4. **Assessment population**: ✅ All 6 assessments populated with substantive content; 0% empty-string. Each assessment is an artifact-or-event statement that names what counts as the step being checked.

5. **Draft-awareness**: ✅ Step descriptions cite: SLOs by name (Confident as depth benchmark; the 6 SLOs requiring new descriptors); WASC standards A1/A4/B1/B2/B3/C1 by code; AFIs (Bilingual Environment / Curriculum and Learning / Faculty PD and PLC / School Culture / Student Data and Well-being / Community Involvement / Resources and Tools — implicitly via the work-areas they reference); mission areas (Academic excellence / Caring and safe community / Global citizenship); the 5 stakeholder groups by name; D1's milestone dates (2025-11-28 for descriptor finalization; 2026-07-24 for self-study binder); D1's milestone-1 work (Term 2 unit-plan rollover); B1's criteria implicitly (the assessments map to specific criteria's verification kinds). Strong cross-spec coherence.

6. **Substantiveness**: ⚠ **PARTIAL — specificity-shaped prose, but the specificity is fabricated** (per the headline finding above). Each step IS operationally detailed (who-does-what-when-where-how), but the "who" is a fabricated organizational hierarchy. By the surface measure (concrete vs filler), the steps are substantive; by the DEC-39 measure (names enumerated in the grounding), the steps are not substantive — they are plausible-sounding generic-org templates.

7. **Strengthened school-wide preamble watch**: ✅ on the breadth dimension — Step 6 alone references work flowing through every division the LLM (incorrectly) thought existed: descriptor authoring → unit-planning template → gradebook → PLC minutes → classroom walkthrough → student reflection → co-curricular planning → parent-evening agenda → admissions materials → self-study binder. Step 3 covers all 5 stakeholder groups by channel (whole-staff briefing / homeroom + EY teacher-led / parent reporting portal + parent evening / Parent Committee session / SLT review). ⚠ on the depth dimension — when collapsed against the actual 15-division roster, the prose touches a subset of the divisions the school actually has (Math, Sciences, Business and Economics, Art, Library, Future Scholar Innovation Center, Principal's Office, Recruitment and Admissions are not named). The "every division has a role" strengthened preamble translated into prose that reads as schoolwide but is structurally a fabricated-org-chart schoolwide, not an actual-roster schoolwide.

8. **Voice-constraint watch** (FIRST EXPERIMENT under antipattern #9): ⚠ **MIXED**. Hits:
   - "across all four framing audiences" appears in Step 6 description — direct hit on the named "across all four X" cumulative-emphasis antipattern, copied verbatim from A1's framing
   - "across Chinese-medium and English-medium settings, across EY, Primary, and Secondary, and across academic and co-curricular contexts" in Step 2 — another instance of the "across all four X" rhetorical device
   - Several long compound sentences with multiple "and" conjunctions; some exceed 100 words
   - Step 6 description is a single sentence chain covering ~10 work-streams; reads as model-generated rhythm, not as school-report prose

   Holds:
   - Assessments are generally tight, factual, and report-style (mostly short artifact-or-event statements; voice constraint largely held in the assessment field)
   - Naming is specific (just specifically wrong, per the no-fabrication finding)
   - No "as an AI" caveats, no TBDs, no half-fills, no options-instead-of-decisions
   - No rhetorical tetrads beyond the A1-inherited one

   **Disposition signal**: the voice constraint partially translated to model output — assessments held, descriptions slipped. Two named-antipattern hits in 6 step descriptions (Step 2, Step 6). A reader CAN tell this was LLM-authored from the rhythm of the compound sentences. The constraint needs reinforcement; not the place to declare success.

9. **Validation**: ✅ Production `parse_decompose_action_steps` accepted (`planner/specs.py:487-535`); parse note: `Proposed from the "Policy revision (6-step consultative)" recipe — review the steps`.

10. **Merge**: ✅ `MERGE_RULES["decompose-action-steps"]` = `_merge_action_steps` (`apply.py:77-79`) appended the 6 steps to `draft.action_steps`.

11. **Sonnet rendering** (third datapoint): ✅ Wrote `05-decompose-action-steps.rendering.md` (61 lines) — method as H1, each step as numbered H2 with first-clause-as-heading device, description + assessment as fielded subsections, verbatim throughout. **Model-for-task check**: sonnet held for the third experiment; rendering remains the right model for the faithful-restructuring role.

## Per-watch-for-observation evaluation

1. **Method/improvement_type alignment**: ⚠ The chosen method "Policy revision (6-step consultative)" has `applicable_improvement_types = {policy-establishment, policy-revision}`. Of the 4 milestones in the draft, none carry `improvement_type=policy-revision` (milestones use schoolwide-learner-outcomes / curriculum-development / communications / compliance-accountability). The same type-method invariant gap from Exp 04 propagates: the LLM picked the method whose process most resembles the descriptor-authoring work, even though no milestone's improvement_type is in the method's applicable set. This is the SAME class of finding as Exp 04 — parser-permissive + body-suggested-but-not-enforced; corpus-side resolution is the Step 6 production landing.

2. **Draft hint vs ignore**: ✅ The LLM picked one of the two methods already named in draft.milestones (milestones-0's "Policy revision (6-step consultative)"). Treated the milestone's planning_method as a strong hint; did not invent a method or pick one not yet referenced.

3. **Later-step filler drift**: ✅ Step 6 (the final and longest step) is the most substantive — covers the propagation across operating instruments. No filler drift; if anything, the prompt's "Propagate / embed into downstream artifacts" template invited expansion which the LLM produced (also where most of the fabricated role-labels live).

4. **Assessment ↔ criteria cross-reference**: ⚠ Implicit only. Step 6's assessment touches the same operational surface as criteria-1 (unit plans naming SLOs + SLO-tagged assessments), criteria-2 (PLC minutes with opening SLO frame and closing SLO-tagged evidence), criteria-3 (SLO-organized parent narrative section), criteria-4 (student SLO self-reflection), criteria-5 (self-study evidence binder by SLO). The LLM did NOT explicitly say "this step's completion is checked against B1 criterion C2" — the cross-reference is structural, not linguistic. Possible refinement target for body language: instruct F1 to explicitly tie each assessment to the criterion it operationalizes.

## Surfaced findings

1. **NO-FABRICATION INVARIANT FORMALIZED AS DEC-39 + DISC-27** (this turn). The F1 capture is the forensic exemplar; the preamble landing (`prompt-workshop/shared/preamble.md`) addresses the prompt-language side; the per-spec `grounding_include` audit + remediation across `planner/specs.py` is open follow-on plan→IMPL. See DEC-39 for the per-spec gap inventory + the corpus-wide remediation scope.

2. **Voice constraint partially translated**. Assessments held tight; descriptions tripped the "across all four X" antipattern twice + ran long compound sentences. The voice constraint needs reinforcement — either preamble strengthening or per-spec body explicit-call. Per-experiment data confirms: voice is influenced by the constraint but not yet bound by it.

3. **Type-method-invariant gap propagates from D1 to F1**. The Exp 04 finding (parse_propose_milestones permissive on type-method M2M) reappears at F1's method-selection joint: the LLM picked a method outside the milestones' improvement_types' applicable sets. Same canonical resolution applies (parser tightening at Step 6 production landing); same project pattern — admin-curated structure is source of truth, LLM chooses FROM.

4. **Sonnet rendering holds for a third datapoint**. Three-for-three on faithful restructuring with the workshop's common shape (named-object H1 + per-element H2 + fielded body). Model-for-task vector confirms: sonnet is the rendering model.

5. **Cross-spec coherence is implicit, not explicit**. The F1 output's assessments map to B1's criteria but do not name them. The corpus has only ONE explicit inter-spec coherence directive (US-LLM-27 → F2, per DISC-26 audit). F1 could be uplifted to explicitly tie each assessment to a B1 criterion's verification mode — a corpus-side refinement for the Step 6 rewrite.

## Signal for next iteration

The no-fabrication invariant is the load-bearing finding from this experiment. Before continuing the per-spec experiments (F2 / B2 / next), the per-spec `grounding_include` remediation should land — otherwise every subsequent experiment will surface the same defect at a different joint and the workshop's forensic captures will accumulate evidence of the same root-cause rather than testing the corpus on its merits.

Recommended order: (a) close the corpus-side remediation slice (the planner/specs.py grounding-tuple audit + edit + workshop dispatch verification that the expanded grounding sections render correctly), (b) re-run F1 on the expanded grounding to confirm the LLM names enumerated actors (not fabricated), (c) THEN proceed to the next experiments. Alternative ordering is the user's call — these experiments can continue against the current grounding state if the user wants to surface more per-joint defects before remediating; the captures retain forensic value either way.

Voice-constraint reinforcement is a separate corpus-side question that can be settled in parallel — preamble strengthening on the description-side specifically, or per-spec body explicit-call (e.g. F1's body could carry an explicit "write step descriptions as short factual sentences naming one actor and one artifact per sentence" voice directive).
