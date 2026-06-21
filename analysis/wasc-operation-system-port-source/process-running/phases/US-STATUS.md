# User story status

Tracks each user story milestone (`US-N`, `US-16a..h`, `US-ext`) against the phase that enables it and the commit that vivified it. Maintained by the main-context orchestrator after every commit that touches phase content or lands phase work. The source-of-truth user story text is inlined in `phases/00-preamble.md` § "User-story milestones (inlined)".

Status values:
- **pending** — no commit yet provides the capability.
- **enabled** — the commit landed; the capability exists at the data-model / wiring level. Not yet exercised by a human author.
- **vivified** — a human has exercised the capability end-to-end via admin in a USER-VERIFIED pass.

When a phase enables multiple US, each US row gets the same enabling-phase + commit. When a US is fully exercisable only after a later phase (e.g. US-1 needs both Phase 1 auth and Phase 6 Plan model), the "enabling phase" is the LAST phase whose absence would block the capability.

## Table

| US | Description (one-line) | Enabling phase | Vivifying commit | Status |
|---|---|---|---|---|
| US-1 | Author opens the system and starts a new plan; Plan lifecycle defaults to proposed. | Phase 6 | 35a2653 | enabled |
| US-2 | Author names the plan. | Phase 6 | 35a2653 | enabled |
| US-3 | Author identifies the Cycle the plan belongs to. | Phase 6 | 35a2653 | enabled |
| US-4 | Author writes the current state. | Phase 6 | 35a2653 | enabled |
| US-5 | Author writes the desired state. | Phase 6 | 35a2653 | enabled |
| US-6 | Author writes the rationale. | Phase 6 | 35a2653 | enabled |
| US-7 | Author identifies LearnerOutcomes the plan targets. | Phase 6 | 35a2653 | enabled |
| US-8 | Author identifies MissionAreas the plan targets. | Phase 6 | 35a2653 | enabled |
| US-9 | Author identifies StakeholderGroups the plan engages. | Phase 6 | 35a2653 | enabled |
| US-10 | Author identifies Policies the plan establishes or revises. | Phase 6 | 35a2653 | enabled |
| US-11 | Author identifies AreasForImprovement the plan addresses. | Phase 6 | 35a2653 | enabled |
| US-12 | Author identifies accreditation standards the plan advances. | Phase 6 | 35a2653 | enabled |
| US-13 | Author writes success criteria. | Phase 7 | 56b2b38 | enabled |
| US-14 | Author binds each criterion to FeedbackChannels via Measurement. | Phase 7 | 56b2b38 | enabled |
| US-15 | Author defines action steps. | Phase 8 | cfeba91 | enabled |
| US-16a | Author writes each step's description. | Phase 8 | cfeba91 | enabled |
| US-16b | Author assigns responsibility (department / role / stakeholder group). | Phase 9 | f5a02ce | enabled |
| US-16c | Author identifies participants beyond the responsible party. | Phase 9 | f5a02ce | enabled |
| US-16d | Author sets a timeline (single / range / recurrence / indefinite). | Phase 9 | f5a02ce | enabled |
| US-16e | Author lists required resources (time / financial / human / external / platform). | Phase 9 | f5a02ce | enabled |
| US-16f | Author links the evidence each step will produce. | Phase 10 | b07218f | enabled |
| US-16g | Author optionally decomposes the step into sub-steps. | Phase 9 | f5a02ce | enabled |
| US-16h | Author optionally declares dependencies on other action steps. | Phase 9 | f5a02ce | enabled |
| US-17 | Author optionally groups action steps into phases. | Phase 8 | cfeba91 | enabled |
| US-18 | Author defines outbound communications. | Phase 10 | b07218f | enabled |
| US-19 | Author defines feedback channels. | Phase 7 | 56b2b38 | enabled |
| US-20 | Author defines review events. | Phase 11 | c7649e8 | enabled |
| US-21 | Author defines revision rules. | Phase 11 | c7649e8 | enabled |
| US-22 | Author advances the plan from proposed to active. | Phase 12 | 2ae1c58 | enabled |
| US-ext | Author sets framing/priority/student-impact/provenance extension fields on Plan, and subject-kind + planning-method per ActionStep. | Phase 14 (Plan fields `68baef7`); subject-kind/planning-method relocated to ActionStep `057f5ed` | enabled |
| US-ext-milestone | Author groups phases under milestones (`Plan → Milestone → Phase → ActionStep`), sets a milestone's aspirational target, declares it reached (audited), and anchors feedback/review/communication timing to a milestone. | architecture (DISC-15-0521-A) | e824283 | enabled |
| US-ORG-1 | App admin nests org units in a hierarchy (units under a parent). | org remodel (DISC-16-0521-A) | 048cf71 | enabled |
| US-ORG-2 | App admin designates a single head (person) for a unit. | org remodel (DISC-16) | 048cf71 | enabled |
| US-ORG-3 | App admin records people as unit members with an optional position title (HOD/YGL/HRT/teacher). | org remodel (DISC-16) | 048cf71 | enabled |
| US-ORG-4 | App admin links a person to a login account. | org remodel (DISC-16) | 048cf71 | enabled |
| US-ORG-5 | App admin records a person with no login (accountability only). | org remodel (DISC-16) | 048cf71 | enabled |
| US-ORG-6 | Author makes a unit responsible for a step (no person required). | org remodel (DISC-16) | 048cf71 | enabled |
| US-ORG-7 | Author optionally names a specific person on a step (alongside its unit). | org remodel (DISC-16) | 048cf71 | enabled |
| US-ORG-8 | Author assigns responsibility to a nested sub-unit. | org remodel (DISC-16) | 048cf71 | enabled |
| US-ORG-9 | Author adds participants (person/unit/stakeholder) distinct from the responsible party; stakeholder = participant only, never responsible. | org remodel (DISC-16) | 048cf71 | enabled |
| US-ORG-10 | Unit head sub-assigns a unit-level step to a person beneath them. | org remodel (DISC-16) | 048cf71 | enabled |
| US-ORG-11 | Unit head reassigns a step when the responsible person changes. | org remodel (DISC-16) | 048cf71 | enabled |
| US-ORG-12 | Unit head sees all work for their unit and every unit beneath it (roll-up; top sees all). | org remodel (DISC-16) | — | pending |
| US-ORG-13 | Person sees every step they're personally named on, across plans, with plan/milestone/timing context. | org remodel (DISC-16) | — | pending |
| US-ORG-14 | Member sees only steps explicitly assigned to them (no inheritance). | org remodel (DISC-16) | — | pending |
| US-ORG-15 | Person heading several units / named on several steps sees it all in one consolidated view. | org remodel (DISC-16) | — | pending |
| US-ORG-16 | User logs into a personalized, permission-scoped home; app admins see everything. | org remodel (DISC-16) | — | pending |
| US-ORG-17 | User uses the app in English or 简体中文. | org remodel (DISC-16) | — | pending |
| US-ORG-18 | Person updates their step's status (not-started/in-progress/done) and attaches the evidence it produces. | §B status (audited, DEC-16) + evidence_artifacts | cba276f | enabled |
| US-ORG-19 | Unit head sees and rolls up the status of their unit's (and descendants') steps. | org remodel (DISC-16) + §B status | — | pending |
| US-ORG-20 | User records/resolves a blocker (impediment: reason + who/when) on a step and lists all currently-blocked steps; blocked = stored, queryable, orthogonal to status. | DEC-17 — `ActionStepImpediment` model + service + admin + perms | cc79349 | enabled |
| US-ONB-1 | New user enters their email at the site; an account is auto-created (+ immediate passwordless login + emailed code). | onboarding deferred-code flow | 9d637ae | enabled |
| US-ONB-2 | New user sets their password and enters their name: first + last (English given / Pinyin surname) and an optional Chinese name (not all users have one). | onboarding deferred-code flow (code-verify) | 9d637ae | enabled |
| US-ONB-3 | Site admin assigns the user to one or more positions. | per-school-admin foundation (DISC-18, Slices 4/6) | 391b893 | enabled |
| US-ONB-4 | Site admin bulk-creates user accounts from a CSV of first name, last name, optional Chinese name, email (users then set password per US-ONB-2, assigned per US-ONB-3). | `users/management/commands/import_staff_roster.py` — CSV → User + Person + Holding per row, idempotent, per-row atomic, strict-fail on unmapped Division/title atom, `--dry-run` flag | 9ec2a97 | enabled |
| US-ONB-5 | School admin sets a user inactive (active default); inactive = cannot log in + not presented going forward; actions/history persist in past plans. | per-school-admin foundation (DISC-18) + deactivation (Slices 3/6) | 391b893 | enabled |
| US-UI-1 | Create-plan interface captures an action step's timeline via a structured control (kind single/range/recurrence/indefinite + the dates that kind requires) into the model's `Timeline` shape, not free text. Realizes US-16d at the interface level; model+admin already support it (`f5a02ce`). | create-plan front-end — `planner` app `TimelineForm` (kind+dates, mirrors `timeline_fields_match_kind`); DEC-27 | 1f5c815 | enabled |
| US-UI-2 | Create-plan interface narrows dependent selects to valid options + validates server-side: `improvement_type` → applicable `planning_method`s; `division` → its people (all person pickers). Author can neither select nor POST an incompatible combo. | `planner` — `MilestoneForm`/person-narrowing `__init__`+`clean()` (server backstop) + `dependents.js` (client narrowing) + `Division.people_in_subtree()`; empty `applicable_improvement_types` = unconstrained | 6c5249e | enabled |
| US-UI-3 | Author captures the evidence a step will produce, in the create-plan interface — a per-step Evidence sub-formset (label + owner_division + optional owner_person + the new hand-authored `Evidence.location`), creating plan-owned Evidence linked via `ActionStep.evidence_artifacts`. Realizes US-16f; makes wizard-created plans pass the evidence gate. (Full link/upload payload §H.1 still deferred.) | create-plan interface (DEC-27 deferral) | edf4840 | enabled |
| US-UI-4 | Author declares a step's within-plan dependency in the create-plan interface (realizes US-16h; `cross_plan_ref` has no integrity, §I). | create-plan interface (DEC-27 deferral) | — | pending |
| US-UI-5 | Create-plan interface lets the author link to same-session milestones/phases: group steps under a phase (US-17), nest phases under milestones (US-ext-milestone), anchor feedback/comms/review to a milestone (`timing_kind=milestone`). Wizard left these as plain FKs scoped to the plan's empty-on-create rows; extend the create-order-index mechanism (DISC-20-0525-A). | create-plan interface (DISC-20-0525-A) | 3aa780b | enabled |
| US-UI-6 | School admin flips draft→active from the plan surface (admin-only promote control → `advance_plan_status`; gated `change_plan` + own-school). Realizes US-22 at the interface (DEC-27 deferred). The single lifecycle gate at the END of the staged build (DEC-33). | create-plan interface (DEC-29) | — | pending |
| US-UI-7 | An admin resumes a partially-drafted plan at the same stage (rests on the stored drafting-stage sub-state; orthogonal to the proposed→active lifecycle). | staged orchestration (DEC-33) | — | pending |
| US-UI-8 | An admin reviews/edits/closes the current orchestration stage, triggering the next pass ("responsibilities done → advance"); whole artifact stays `proposed` until the US-UI-6 promote. | staged orchestration (DEC-33) | — | pending |
| US-UI-9 | An admin exports the whole draft plan as a PDF (canonical or a lighter draft-review template) for distribution + commentary. Operationalizes DEC-18 materialization for the draft phase; PDF mechanism + template open (deploy-adjacent). | draft export (DEC-33/DEC-18) | — | pending |
| US-UI-10 | An admin exports a specific draft STAGE as a PDF (stage-scoped; requires the stored drafting-stage sub-state). | draft export (DEC-33) | — | pending |
| US-UI-11 | An admin authors/edits the division's responsibility atoms (`DivisionResponsibility`) — the per-division, particular responsibility statements the orchestration reasons over (ADDING particularization atop the kept `Division.scope_summary`). DEC-32 Layer 1: model + `DivisionResponsibilityInline` under `DivisionAdmin` (school-scoped) + grounding (`_divisions` nests responsibilities) + `school_admin` full-CRUD grant. Atoms owed/authored by the user via admin (none seeded; `scope_summary` is the meantime fallback). | principle atoms (DEC-32) | 62a8caa | enabled |
| US-UI-12 | An admin authors/edits the school's vision + mission statements and their ordered clause atoms (`kind`=vision\|mission prose + clauses; `zh_hans` first-class). DEC-32 Layer 1: `GuidingStatement`(unique school,kind)+`StatementClause` models + `GuidingStatementAdmin`+clause inline (school-scoped) + grounding (`_guiding_statements`, graceful on absence) + `school_admin` full-CRUD grant; vision seeded (prose + 6 clauses), mission absent (graceful). | principle atoms (DEC-32) | 62a8caa | enabled |
| US-UI-13 | A school admin uses an intuitively designed interface to populate school-related content. | school-admin content interface (this turn; design pending) | — | pending |
| US-LLM-1 | llm-user output arrives as editable prefills bound into the actual wizard forms (the model-is-contract re-entry seam); never auto-saved, persists only via the validated atomic POST. | LLM author-assist (DEC-28) | 7553a06 | enabled |
| US-LLM-2 | Each llm-user proposal grounded in seeded vocab + 12 WASC standards + the draft via `build_grounding()`/`PromptTemplate`; vocabulary-bounded. | LLM author-assist (DEC-28) | 7553a06 | enabled |
| US-LLM-3 | An assist runs off-request and streams into a preview pane (built as `StreamingHttpResponse` over the existing sync `stream()` under WSGI + client `fetch`-streaming — the resolved "stream under WSGI" fork, not async/SSE). | LLM author-assist (DEC-28) | 7553a06 | enabled |
| US-LLM-4 | Assist calls logged (`LLMCall`), author free-text sanitized (OWASP LLM01), attributable to school/plan (adds nullable `LLMCall.school`/`plan` FK — `ai/0002`). | LLM author-assist (DEC-28) | 7553a06 | enabled |
| US-LLM-5 | Assist prompts are managed `PromptTemplate` rows (slug + variables + output contract), editable without a code deploy. | LLM author-assist (DEC-28) | 7553a06 | enabled |
| US-LLM-6 | Draft the plan narrative prose fields from a one-line seed (A1; strict-JSON contract, parsed prose rendered into the `basics` form fields). | LLM author-assist (DEC-28) | 92657ae | enabled |
| US-LLM-7 | Co-author the 简体中文 twin (`*_zh_hans`) of a prose field (A1b). | LLM author-assist (DEC-28) | — | pending |
| US-LLM-8 | Propose the WASC standards the plan advances + per-standard rationale (A2; US-12). The 1st of the 3 remaining gate-required plan-level assists; a clean reuse of the B1/F1 `applyFormsetPrefill` formset path (the `standards` through-model formset on `basics` — `accreditation_standard`+`rationale`) + a GLOBAL `resolve` (code→`AccreditationStandard` pk, no school filter, drop-unresolvable). Feeds the `accreditation_standards.exists()` gate predicate. EN-only (rationale; `_zh_hans` blank). | LLM author-assist (DEC-28) | dd64f9d | enabled |
| US-LLM-9 | Suggest the domain-alignment M2M selections, bounded to seeded rows (A3; US-7..11). The 12th assist; the FIRST multi-select (plain-M2M) assist → introduces the `applyMultiSelectPrefill` client mechanism (sets `<select multiple>` options by resolved pk) + its DEC-31 jsdom test + a multi-select fixture builder. Six plan M2Ms (learner_outcomes_targeted/mission_areas_targeted/stakeholder_impact/areas_for_improvement [gate-required] + policies_established/policies_revised [optional]); school-scoped per-relation `resolve` (label→pk lists, drop-unresolvable); added a `_policies()` grounding emitter + `policies` SECTION_KEY. | LLM author-assist (DEC-28) | 34f7bf0 | enabled |
| US-LLM-10 | Draft `priority_rationale` on a priority-tier deviation (A4; US-ext). | LLM author-assist (DEC-28) | — | pending |
| US-LLM-11 | Draft typed success criteria from the desired state (B1; US-13/14). LLM drafts 3–6 typed `SuccessCriterion` rows (verification_kind + target-iff-kind value/unit/baseline) into the `criteria` formset (rides F1's add-then-fill, `preview="fields"`); target-kind is the only quantification (no KPIs). | LLM author-assist (DEC-28) | 0fb3001 | enabled |
| US-LLM-12 | Suggest the criterion→feedback-channel measurement binding (B2; US-14). FIRST nested-binding assist: binds EXISTING drafted criteria↔channels (multi-channel) via the nested measurement/channel sub-formsets by create-order index; new `preview="bindings"` apply path; forced the reusable whole-form `draft_state` + per-spec control labels. | LLM author-assist (DEC-28) | 76d10be | enabled |
| US-LLM-13 | Propose a feedback channel per engaged stakeholder (C1; US-19). Pure D1 reuse: per-channel stakeholder/owner_division/frequency resolved via `AssistSpec.resolve`; timing per-kind (periodic/one-off/milestone via `milestone_index`); owner_division required. Unblocks B2/US-LLM-12. | LLM author-assist (DEC-28) | f71b0e1 | enabled |
| US-LLM-14 | Propose milestones + improvement-type + applicable planning-method (D1; US-ext/DEC-14). First FK-vocab-setting assist: introduces the reusable `AssistSpec.resolve(prefill, school)` hook (LLM proposes by code/name → resolved to school-scoped PKs); method only when the type requires one; rides F1's formset add-then-fill + US-UI-2 narrowing. | LLM author-assist (DEC-28) | 2726ed1 | enabled |
| US-LLM-15 | Propose phase groupings under milestones (E1; US-17). | LLM author-assist (DEC-28) | — | pending |
| US-LLM-16 | Decompose a planning-method recipe into concrete action steps (F1 — flagship; US-15). LLM proffers the fitting method + expands its templates into `steps`-formset rows (add-then-fill, `preview="fields"`); the chosen recipe surfaced via the new `AssistResult` note. | LLM author-assist (DEC-28) | e83e437 | enabled |
| US-LLM-17 | Propose assignments respecting kind/target + division→person (F2; US-16b/c). FIRST per-step-nested-child assist (responsible-division-only first cut): per step, a responsible `Assignment` with a division (resolve label→pk); established the reusable per-step-child apply navigator (`stepChildFormset`) for F3/F4/F5. | LLM author-assist (DEC-28) | c336a37 | enabled |
| US-LLM-18 | Propose a structured timeline per step (F3; US-16d/US-UI-1). Per-step nested-child reuse of F2's `stepChildFormset` navigator + the `kindgate`; per-kind (single/range/recurrence/indefinite) dates; no resolve. | LLM author-assist (DEC-28) | 8fc960d | enabled |
| US-LLM-19 | Propose required resources + sub-steps (F4; US-16e/g). Per-step nested-child reuse of F2/F3's `stepChildFormset` navigator + `addRows` — FIRST assist to fill TWO child types per step and the FIRST to fill LISTS (multi-row): ≥1 `RequiredResource` (kind+note; the gate predicate) + an optional ordered `SubStep` list (description; order = list position); no resolve (kind/note/description literal). | LLM author-assist (DEC-28) | db338ee | enabled |
| US-LLM-20 | Propose the evidence a step produces (F5; US-16f — unblocked by US-UI-3). The LAST per-step gate element; a FUSION of F4 (multi-row per-step list via `stepChildFormset`+`addRows`) and F2 (FK-vocab `resolve`, label→school-scoped pk, drop-unresolvable): per step ≥1 `Evidence` (label + owner_division[resolved] + optional location; the `evidence_artifacts.exists()` gate predicate), saved plan-owned + step-linked via M2M; owner_person/status/retention/`_zh_hans` omitted (D7, EN-only). | LLM author-assist (DEC-28) | d6d61d8 | enabled |
| US-LLM-21 | Draft the whole review loop coherently — communications + review events + revision rules, by index (G1; US-18/19/20/21). The 13th assist + the LAST gate-required per-element assist. ONE multi-section result fills 3 top-level formsets (Communication[prefix `review`]/ReviewEvent/RevisionRule) + a nested per-event ReviewEventInput sub-formset, via the new `applyReviewLoopPrefill` (composes applyFormsetPrefill ×3 + the nested-input fill) + its DEC-31 jsdom test. School-scoped FK resolve (audience/owner_division/responsible_division/frequency) with **leave-unset-on-unresolvable** (preserves create-order for trigger_index); index refs (milestone/channel/trigger) pass through as ints resolved in save_nested. owner_person omitted (D7); EN-only. | LLM author-assist (DEC-28) | e224d9c | enabled |
| US-LLM-22 | Read-only coherence/gap critique of the in-progress draft, proposing no data (H1). | LLM author-assist (DEC-28) | — | pending |
| US-LLM-23 | Orchestrate a complete, promotion-ready whole-draft from the admin's current+desired state (runs US-LLM-24 heuristic over all gate-required assists + US-LLM-25 closure; framing/priority/type AI-proposed). Corrects DEC-28 H2's partial sequence. **Refined (DEC-33): the STAGED runner** — drive each US-LLM-24 stage → admin reviews/edits/closes → advance grounded on the confirmed prior stages; whole artifact stays `proposed` until US-UI-6. | LLM author-assist (DEC-28/29/33) | — | pending |
| US-LLM-24 | Dependency-aware sequencing heuristic over all gate-required elements, driving the whole-draft orchestration (supersedes H2's partial sequence). **Refined (DEC-33): corrected pass order — division-responsibility recruitment BEFORE milestones** (who/what-sphere precedes the time-phased arc); each pass = a checkpointed STAGE; reasons over DEC-32's atom grounding. | LLM author-assist (DEC-29/33) | — | pending |
| US-LLM-25 | Pre-submit coherence/gap-closure pass — re-invoke per-element assists until the draft passes `_check_promotion_gates` (promotion-ready). (DEC-33: the terminal gap-closure stage.) | LLM author-assist (DEC-29/33) | — | pending |
| US-LLM-26 | Propose the rationale-bearing principle alignments — which of ALL SIX A3 alignment relations (learner outcomes / mission areas / areas-for-improvement / stakeholder impact / policies established / policies revised) + the vision/mission clauses (+ WASC standards) the plan advances, EACH with a `rationale` = the accreditation evidence. Layer 2b upgrades ALL SIX of A3's plain M2Ms to through-models with rationale (user 2026-05-26 "all carry reasoning"; mirrors `PlanAccreditationStandard`); A3 becomes all-formset (retiring `applyMultiSelectPrefill`); + the vision/mission-clause plan-linkage. | LLM author-assist (DEC-32) | `dda9291` | enabled |
| US-LLM-27 | Propose, per action step, which responsibility atom(s) it fulfills + the `rationale`, in BOTH grains (DISC-22): division-grain `ActionStepResponsibility` (→`DivisionResponsibility`) and position-grain `ActionStepPositionResponsibility` (→`PositionResponsibility`), each row resolved statement+owner→pk, the rationale = the accreditation evidence. One assist over the division+position inventory; soft coherence (the fulfilled atom's unit ≈ the step's responsible unit) nudged by prompt + the through-model `clean()`, not hard-coupled. | LLM author-assist (DEC-32 / DISC-22) | `622aa35` | enabled |
| US-REV-1 | App admin configures per ImprovementType/PlanningMethod a draft-reviewer audience (Positions/Divisions); a draft's reviewers = union across its milestones' type/recipe rules. New `DraftReviewerRule`. | draft review (DEC-30) | — | pending |
| US-REV-2 | A school user in a draft's reviewer audience comments on the draft during the proposed phase — whole-plan or per-element (advisory). New `DraftComment` (Plan FK + generic target). **Open: element atomicity/granularity (per step? per element — which types?) TBD (DEC-30).** (DEC-33: **stage** added as a comment-target level → {plan, stage, element}; the element-atomicity question is unchanged.) | draft review (DEC-30/33) | — | pending |
| US-REV-3 | Plan author/admin sees all draft comments (plan + stage + per-element) while reviewing the proposed draft, to weigh before flipping (US-UI-6); commenting does not gate the flip. | draft review (DEC-30/33) | — | pending |
| US-REV-4 | A reviewer discovers drafts awaiting their comment via their own view (pull; no notifications). | draft review (DEC-30) | — | pending |
| US-REV-5 | A reviewer comments at the STAGE level on a staged draft; the admin can gather/see a stage's feedback before closing it (the per-stage feedback loop). Advisory, non-gating; requires the stored drafting-stage sub-state. | draft review (DEC-30/33) | — | pending |
| US-DRAFT-1 | An author opens the create-plan flow at one of three entry routes — "I have a problem", "I have an outcome in mind", or "Formalize a proposal" — and provides their seed input. From that seed, the LLM uses ALL data from the school's DB as its universe of context to render a draft plan with every element populated. The author then evaluates and fine-tunes the rendered draft. | draft generation + versioning (US-DRAFT segment) | — | pending |
| US-DRAFT-2 | An author can save their progress at any stage of the create-plan flow. | draft generation + versioning (US-DRAFT segment) | — | pending |
| US-DRAFT-3 | Each save is tracked as a versioned draft; the author can walk back to any prior draft version and continue from there. | draft generation + versioning (US-DRAFT segment) | — | pending |

## Update protocol (orchestrator)

After each commit that lands a phase deliverable:
1. Identify which US rows the commit enables (cross-reference the phase MD's `**Enables:**` line).
2. Fill the `Vivifying commit` cell with the commit SHA and change `Status` to `enabled`.
3. After a human-verified end-to-end pass on a US, change `Status` to `vivified`.

After each commit, also update `ORCHESTRATOR-STATE.md`.
