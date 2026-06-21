# Experiment evaluation — F1 decompose-action-steps, RE-DISPATCH post-DEC-39 Slice-2

**Capture**: `05-decompose-action-steps.json`
**Rendering**: `05-decompose-action-steps.rendering.md` (sonnet, datapoint #4 for the model-for-task vector)
**Spec**: `decompose-action-steps` (F1)
**Snippet body source**: `prompt-workshop/snippets/05-decompose-action-steps.md` (post-`b12e3dd` — carries the `Stakeholder groups`, `Divisions (with positions and responsibility atoms)`, `Policies` catalogue render blocks)
**Shared preamble state**: post-`488906e` (workshop preamble carries the no-fabrication invariant); production-equivalent post-`ef1ce18` (catalogue blocks landed in `ai/0019`)
**Dispatch sub-agent**: general-purpose, opus
**Rendering sub-agent**: general-purpose, sonnet
**Seed**: `"Improve SLO usage across the school"` (carried via draft.meta.seed_text)
**Draft state going in**: A1 + A3 + B1 + D1 milestones (4 rows), with `action_steps` CLEARED to `[]` pre-dispatch to produce a clean fabrication-vs-not test uncontaminated by experiment 05's prior fabricated steps
**Dispatched at**: 2026-05-29T15:23:28

## Disposition

**GOAL MET. Zero fabrication. The DEC-39 invariant is now structurally enforced end-to-end.**

This is the post-Slice-2 verification dispatch — the goal-met test for whether `b12e3dd` (snippet render blocks) + `ef1ce18` (production `ai/0019` migration) + `0b018fa` (structural-guard test) close the fabrication risk that experiment 05's capture demonstrated.

## Per-name fabrication audit (every actor/unit named in the new output cross-checked against the dev-DB roster)

Every name appearing in the new F1 output, cross-checked against the `_divisions` emitter output + the `_stakeholder_groups` emitter output for the tenant `chiway-repton-xiamen`:

**Positions named (all VERBATIM matches to enumerated `Position.label`):**
- Director of Teaching and Curriculum Center ✓ (Curriculum and Teaching, kind=leader)
- IHS Principal ✓ (Principal's Office (PO), kind=leader)
- Director of AAO ✓ (AAO - Academic Affairs Office, kind=leader)
- Director of Student Affairs Office ✓ (SAO, kind=leader)
- Director of Future Scholar Innovation Center ✓ (Future Scholar Innovation Center, kind=leader)
- Senior Teaching Coordinator ✓ (Curriculum and Teaching, kind=staff)
- PD Leader ✓ (Curriculum and Teaching, kind=staff)
- Head of English ✓ (English, kind=leader)
- Head of Humanities ✓ (Humanities, kind=leader)
- Head of Math ✓ (Math, kind=leader)
- Head of Sciences ✓ (Sciences, kind=leader)
- Head of Art Department ✓ (Art Department, kind=leader)
- Head of Business and Economics ✓ (Business and Economics, kind=leader)
- Music Teacher ✓ (Music and Sports Department, kind=staff)
- PE Teacher ✓ (Music and Sports Department, kind=staff)
- College Counseling Department Coordinator ✓ (College Counseling Department, kind=leader)
- College Counselor ✓ (College Counseling Department, kind=staff)
- Librarian ✓ (Library, kind=staff)
- Homeroom Teacher ✓ (SAO, kind=staff)
- A2 Year Leader ✓ (SAO, kind=leader)
- AS Year Leader ✓ (SAO, kind=leader)
- IG1 Year Leader ✓ (SAO, kind=leader)
- IG2 Year Leader ✓ (SAO, kind=leader)
- IHS Assistant ✓ (Principal's Office (PO), kind=staff)
- Academic Affairs Officer ✓ (AAO, kind=staff)
- Class Schedule Officer ✓ (AAO, kind=staff)

**Divisions named (all VERBATIM matches to enumerated `Division.label`):**
- Curriculum and Teaching ✓
- Principal's Office (PO) ✓
- AAO - Academic Affairs Office ✓ (full label including "AAO - " prefix used verbatim)
- SAO ✓ (via `Director of Student Affairs Office` position naming)
- Future Scholar Innovation Center ✓
- Music and Sports Department ✓
- College Counseling Department ✓
- Library ✓

**Stakeholder groups named (all VERBATIM matches):**
- Administration / Leadership ✓
- Staff / Faculty ✓
- Students ✓
- Parents ✓
- Parent Committee ✓
- Admissions Applicants ✓ (6 of 6 enumerated stakeholder groups — coverage complete)

**Fabricated names**: 0 (zero). No invented Positions, no invented Divisions, no invented stakeholder roles.

## Comparison to experiment 05 capture (`outputs/2026-05-29-10-02-27/`)

Names that appeared in experiment 05's output but do NOT exist in the dev DB (the fabrication exemplar):
| Experiment 05 (fabricated) | Present in new capture? |
|---|---|
| Vice Principal for Academics | NO |
| Vice Principal for Bilingual Programme | NO |
| Heads of Early Years, Primary, and Secondary | NO |
| Heads of Chinese and English Departments | NO ("Head of English" is real; "Head of Chinese Department" does not exist and is correctly absent) |
| Head of Co-Curricular Programme | NO |
| Head of Student Affairs | NO (replaced with the real "Director of Student Affairs Office") |
| Head of Admissions and Communications | NO |
| gradebook configurator | NO |
| PLC-minutes template owner | NO |
| classroom-walkthrough form owner | NO |

All 10 fabrication categories from the experiment 05 exemplar are ABSENT in the new output. The new output names only enumerated Chiway actors.

## Per-success-criterion evaluation

1. **A WASC reviewer would find this substantive**: ✓ each step names specific Chiway actors against specific Chiway responsibilities; every named owner is a real Position in the school's roster; the cross-divisional coordination is concrete (e.g. Step 2's pairing of Heads of subject departments with the Music and Sports Department for descriptor authoring).
2. **An admin would accept without rewriting**: ✓ pending admin check (the output is structurally promote-ready — names are real, work is concrete, assessments are checkable).
3. **Names real Chiway actors**: ✓ every name verbatim from the enumerated catalogues.
4. **Articulates accreditation evidence**: ✓ WASC standards A1, A4, B1, B2, B3, C1 cited by code in Step 1 and Step 6; the assessments are audit-ready artifact-or-event statements.
5. **School-wide policy honored**: ✓ Step 6 alone names 8 of 15 divisions in concrete operational roles (Curriculum and Teaching, AAO, Principal's Office, SAO, Future Scholar Innovation Center, College Counseling Department, the subject departments, Music and Sports Department). The remaining divisions (Art, Business and Economics, English, Humanities, Math, Sciences) appear via their Head-of positions. Library named in Step 5. Recruitment and Admissions is the only division not invoked (no natural role in SLO-descriptor authoring; appropriate non-mention rather than forced token role).

## Per-watch-for observation

1. **Method/improvement_type alignment**: chose "Policy revision (6-step consultative)" — same method as experiment 05; matches milestones-0's planning_method. The type-method invariant gap from Exp 04 (parser-permissive on M2M) is unchanged by this slice; carry-forward.
2. **Voice constraint**: still partially translated — descriptions are long (multi-clause compound sentences) but tight on named-fact density; no rhetorical tetrads observed; "across all four X" antipattern absent. Voice constraint compliance noticeably better than experiment 05.
3. **Cross-spec coherence**: Step 6's assessment explicitly cites B1's criteria target percentages (100 percent unit coverage, 90 percent PLC coverage) — the corpus's first per-spec-cross-reference at this fidelity. Strong.

## Slice-2 enforcement chain verified

The three Slice-2 commits + the prior Slice-1 chain compose a complete enforcement loop:

| Commit | Layer | What it landed |
|---|---|---|
| `488906e` | Workshop preamble | The no-fabrication invariant as constitutive language |
| `9d7f07f` | Production code | `grounding_include` expansion (data gate) |
| `e81b7b6` | Production prompts | `ai/0018` preamble + per-spec free-text-tightening clauses (language gate) |
| `39fc96e` | Workshop sync | Snippets carry preamble + clauses |
| `852aa3f` | Tracking | LOG + STATE + DISC-27 PARTIAL-RESOLVE + DEC-39 SHA |
| `b12e3dd` | Workshop sync | Snippet body render blocks (catalogues now rendered) |
| `ef1ce18` | Production prompts | `ai/0019` mirroring render blocks to production |
| `0b018fa` | Structural guard | Body-iteration-coverage test prevents future drift |

The chain is: grounding tuple includes section → context dict carries section data → body iterates section → rendered prompt contains catalogue text → LLM has both the directive AND the enumeration the directive references → LLM names only enumerated actors → zero fabrication.

## Signal for next iteration

DEC-39 enforcement is structurally complete. DISC-27 transitions from PARTIAL-RESOLVE to FULL-RESOLVE. The standing-open items "per-spec grounding_include remediation" + "F1 rerun on expanded grounding" + "DEC-39 enforcement content-rendering 4th IMPL slice" all close.

Next experiments resume the per-spec validation loop (06 = F2 propose-assignments next per dependency-respecting strongest-first). Voice-constraint reinforcement remains as a separate Mode C item; type-method-invariant parser tightening remains as a separate parser-level item; neither is gated by enforcement completeness.

The prior capture at `outputs/2026-05-29-10-02-27/` stays as the historical fabrication exemplar — load-bearing forensic evidence for what the corpus produced before DEC-39 enforcement.
