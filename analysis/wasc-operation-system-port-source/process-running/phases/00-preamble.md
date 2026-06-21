## User-story milestones (inlined)

`US-N` = top-level step N in the create-plan user story below. `US-16a..h` = sub-steps under step 16. `US-ext` = step required by architecture but not yet in the persisted user story (theme, framing, priority, student-impact, provenance on the Plan; subject-kind and planning-method selection per ActionStep).


1. Author opens the system and starts a new plan. Plan instance created, lifecycle = proposed.
2. Author names the plan.
3. Author identifies the Cycle the plan belongs to.
4. Author writes the current state of the situation.
5. Author writes the desired state.
6. Author writes the rationale — why this plan, why now.
7. Author identifies which LearnerOutcomes the plan targets.
8. Author identifies which MissionAreas the plan targets.
9. Author identifies which StakeholderGroups the plan engages.
10. Author identifies which Policies the plan establishes or revises.
11. Author identifies which AreasForImprovement the plan addresses.
12. Author identifies which accreditation standards the plan advances.
13. Author writes success criteria — what conditions must be observably true for the plan to have succeeded.
14. For each criterion, author identifies how it will be verified — by inspection, by judgment, or by hitting a target number. The Measurement entity binds the criterion to FeedbackChannel(s).
15. Author defines action steps to move from current to desired state.
16. For each action step:
    - **16a.** Author writes the step's description.
    - **16b.** Author assigns responsibility (department, role, or stakeholder group accountable).
    - **16c.** Author identifies participants beyond the responsible party.
    - **16d.** Author sets a timeline (single date, range, recurrence, or indefinite).
    - **16e.** Author lists required resources (time, financial, human, external, platform).
    - **16f.** Author specifies the evidence the step will produce.
    - **16g.** Author optionally decomposes the step into sub-steps.
    - **16h.** Author optionally declares dependencies on other action steps.
17. Author optionally groups action steps into phases.
18. Author defines outbound communications: audience, channel, cadence, owner.
19. Author defines feedback channels through which feedback will be gathered (source, owner, cadence, instrument).
20. Author defines review events: when feedback will be examined, by whom, drawing on which channels.
21. Author defines revision rules: which review event triggers what action under what condition.
22. Author advances the plan from proposed to active.

Each phase ends with a **verification state**: which user-story steps an author can perform via Django admin once the phase is complete.

### Organizational structure & responsibility (US-ORG)

Architecture-determined stories for modeling the school's org hierarchy down to optional individuals, and routing plan responsibility/visibility through it. Determined in design (DISC-16-0521-A); not yet built. `US-ORG-N`. (Stakeholder *audience / feedback / impact* remain US-9 / US-18 / US-19; here a stakeholder group may be a **participant** but never the **responsible** party. Status [18,19] and evidence-attachment [18] depend on the `ActionStep`-status gap [source-model-gaps §B] and the Evidence-payload/audit gap [§H].)

1. **US-ORG-1.** App admin arranges units in a hierarchy (a unit nested under a parent): Principal's Office, Curriculum & Teaching → subject departments, AAO, SAO, Recruitment & Admissions.
2. **US-ORG-2.** App admin designates a single head (a person) for a unit.
3. **US-ORG-3.** App admin records people as members of a unit, with an optional position title (HOD = head; YGL, HRT, teacher = members).
4. **US-ORG-4.** App admin links a person to a login account so they act as themselves.
5. **US-ORG-5.** App admin records a person with no login (named for accountability only).
6. **US-ORG-6.** Author makes a unit responsible for an action step — complete with no person named (responsibility rests at the unit).
7. **US-ORG-7.** Author optionally names a specific person on a step, alongside its unit.
8. **US-ORG-8.** Author assigns responsibility to a nested sub-unit (e.g. a subject department) where it belongs, not the parent.
9. **US-ORG-9.** Author adds participants (a person, a unit, or a stakeholder group) distinct from the responsible party; a stakeholder group may be a participant but never the responsible party.
10. **US-ORG-10.** A unit head sub-assigns a unit-level step to a person beneath them.
11. **US-ORG-11.** A unit head reassigns a step when the responsible person changes.
12. **US-ORG-12.** A unit head sees all work assigned to their unit and to every unit beneath it (roll-up; the top of the tree sees all).
13. **US-ORG-13.** A person sees every step they are personally named on, across plans, with its plan / milestone / timing context.
14. **US-ORG-14.** A member sees only steps explicitly assigned to them — no inheritance from the unit.
15. **US-ORG-15.** A person who heads several units or is named on several steps sees it all in one consolidated view.
16. **US-ORG-16.** A user logs into a personalized, permission-scoped home (only their own work and any unit they head); app admins see everything.
17. **US-ORG-17.** A user uses the app in English or 简体中文.
18. **US-ORG-18.** A person updates their step's status (not-started / in-progress / done) and attaches the evidence it produces.
19. **US-ORG-19.** A unit head sees and rolls up the status of their unit's (and descendant units') steps.
20. **US-ORG-20.** A user records a **blocker (impediment)** on an action step — a reason, plus who raised it and when — and resolves it (who/when) when cleared; an action step is **blocked** while it has an unresolved impediment, and a user can **list all currently-blocked steps** across the school. (DEC-17. Stored, first-class, queryable — NOT a `status` value: "blocked" is orthogonal to the not-started/in-progress/done progress axis and coexists with in-progress. Modeled as a per-`ActionStep` `ActionStepImpediment` child with server-stamped raised/resolved who/when; not a status token, not a boolean, not a dependency-derived signal.)

### User onboarding (US-ONB)

User-directed stories (added this turn) for account genesis — self-service and admin bulk import — first-use profile completion, and org placement by a site admin. Not yet built. `US-ONB-N`. (The login account is `users.User` — email as the username, `first_name` / `last_name` from `AbstractUser`, nullable `school`. Position assignment reuses the org mechanism: a `Person` linked to the account [US-ORG-4] held against a `Position` via `Holding` [US-ORG-3]. Open at build: which school a created account attaches to and when — `User.school` is nullable, candidate is at admin assignment since a position roots in a Division→School; and whether the user's first/last name also seeds the `Person.name` used for org placement. Names: a Latin first + last name (English given + Pinyin surname → `User.first_name` / `last_name`) plus an **optional Chinese name** that not every user has (e.g. foreign staff in China); the Chinese name has no `AbstractUser` home, so its field is open at build — candidate is `Person.name` (translated, `name_zh_hans`) or a new field on the account. The self-service path [US-ONB-1] has the user enter their own name; the bulk path [US-ONB-4] supplies the names (incl. the optional Chinese name) from the CSV at creation, so those users' first login is the password step only. Deactivation [US-ONB-5] maps to `User.is_active` (default true; Django auth blocks login when false); history persists inherently — the responsibility/audit FKs are PROTECT and `Person.user` is SET_NULL, so nothing is deleted — and "not presented going forward" is a selection/assignment queryset filter on active users. The admin actor of US-ONB-3/4/5 needs a **per-school admin status** the model does not yet carry; recorded as DISC-18-0522-A.)

1. **US-ONB-1.** A new user enters their email at the site and an account is created for them automatically.
2. **US-ONB-2.** The new user then sets their password and enters their name: a first name and last name (typically an English given name and a Pinyin surname) and an optional Chinese name — not every user has one (e.g. foreign staff in China).
3. **US-ONB-3.** A site admin assigns the user to one or more positions.
4. **US-ONB-4.** A site admin bulk-creates user accounts from a CSV of first name, last name, optional Chinese name, and email; each created user then logs in by email and sets their password (US-ONB-2, with name already populated from the CSV), and is assigned to positions by an admin (US-ONB-3).
5. **US-ONB-5.** A user with admin status for a school sets a user inactive (active is the default); an inactive user cannot log in and is not presented for selection or assignment going forward, while their existing actions and history persist in past plans (the case when staff leave).

### Create-plan interface fidelity (US-UI)

Stories asserting the create-plan **interface** captures authoring faithfully against the model — fields in the model's structured shape (not prose), and only *valid* combinations — so authored data lands model-faithful. Surfaced during the model-faithful web-view work (DEC-19) and the `planner` build (DEC-27). `US-UI-N`.

1. **US-UI-1.** When creating or editing an action step, the author sets its timeline through a structured control — choosing the kind (single date / date range / recurrence / indefinite) and entering the dates that kind requires — so the captured timeline is stored in the model's `Timeline` shape, not as free text. (Interface realization of US-16d. Model + admin already capture structured timelines [`f5a02ce`]; **enabled** in the `planner` `TimelineForm` [`1f5c815`].)
2. **US-UI-2.** When the author chooses a parent value in the create-plan interface, **dependent selects narrow to the valid options, and the choice is validated server-side** so an incompatible combination can be neither selected nor POSTed: choosing a milestone's `improvement_type` limits `planning_method` to that type's applicable methods (`PlanningMethod.applicable_improvement_types`); choosing an assignment's `division` limits `person` to that division's people (via `Position`/`Holding` + the division's `head`). (Surfaced in the `planner` data-readiness audit: the wizard school-scopes these selects but does not narrow/validate the dependency, and the promotion gate enforces only `requires_planning_method`, not applicability. The narrowing is client-side progressive enhancement; the validity is enforced in the form `clean()` — mirroring DEC-20 "model is the contract" and the planner's existing per-kind `clean()` mirrors. The improvement_type↔planning_method instance has data [4 methods, 5 applicability links]; the person↔division instance derives membership via `Holding`/`Position` and is moot until the `Person` roster is seeded [D7].)
3. **US-UI-3.** When defining an action step, the author links the **evidence** the step will produce, during plan creation. (Interface realization of US-16f. The model link exists — `ActionStep.evidence_artifacts` M2M → `Evidence` [`b07218f`] — but the `planner` wizard does not capture it [DEC-27 deferral; `ActionStepForm.Meta` omits it, no Evidence formset in `steps.py`]. First cut captures the evidence **link/label** as the model holds it today; the `Evidence` **artifact payload/location** is a separate, still-open model gap [`source-model-gaps.md` §H.1] and is **not** in this story.)
4. **US-UI-4.** When defining an action step, the author declares the step's **dependency** on another step within the plan, during plan creation. (Interface realization of US-16h. The model + constraint exist — `ActionStepDependency`, exactly-one-of `depends_on` within-plan FK / `cross_plan_ref` [`f5a02ce`] — but the `planner` wizard does not capture it [DEC-27 deferral; no dependency formset in `steps.py`]. First cut captures the within-plan `depends_on`; `cross_plan_ref` free-text has no referential integrity [`source-model-gaps.md` §I].)
5. **US-UI-5.** When creating a plan in one session, the author can link to **milestones and phases defined in that same session** — group action steps under a phase (US-17), nest a phase under a milestone (the `Plan → Milestone → Phase → ActionStep` hierarchy, US-ext-milestone), and anchor a feedback channel / communication / review event to a milestone (`timing_kind = milestone`). (Surfaced by the create-page pulldown audit, DISC-20-0525-A. The `planner` wizard left `Phase.milestone`, `ActionStep.phase`, and the `milestone` FK on FeedbackChannel/Communication/ReviewEvent as plain FK selects scoped to the plan's *existing* rows — empty on a single-page create — while `save_nested` index-resolves only the FeedbackChannel/ReviewEvent references [`channel_index`/`trigger_index`], not these hierarchy/timing links. So today the hierarchy and milestone-anchored timing are not capturable in the create UI [the FKs are optional, so flat creation works; picking `timing_kind=milestone` is a dead-end — the milestone select is empty]. Realization extends the existing create-order-index mechanism to the milestone/phase parents, or populates the selects dynamically from same-session rows. Parallels US-UI-3/4 — the interface realizing a modeled capability.)
6. **US-UI-6.** A school admin with create-plan perms flips a draft plan from **proposed → active from the plan/draft surface** (not only `/admin/`): an admin-only promote control that calls `advance_plan_status` (which runs `_check_promotion_gates` and writes the audited `PlanStatusTransition`), gated to `change_plan` + own-school (`school_admin`, DISC-18). (Realizes US-22 at the interface; DEC-27 deferred the surface control. The `llm-user` cannot flip — DEC-20 model-is-contract gives the AI no lifecycle write. DEC-29. The single lifecycle gate at the END of the staged build, DEC-33.)

*US-UI-7..12 extend beyond interface-fidelity into the staged-build, draft-export, and principle-atom-editing surfaces (DEC-32/33).*

7. **US-UI-7.** When a whole-draft build (US-LLM-23) spans multiple stages, an admin can **leave a partially-drafted plan and resume it at the same stage** later — the drafting-stage progress is stored on the proposed plan (resumable + auditable), orthogonal to the proposed→active lifecycle. (DEC-33; rests on the stored drafting-stage sub-state.)
8. **US-UI-8.** During the staged build, an admin **reviews, edits, and explicitly closes the current stage** ("responsibility breakdowns done → advance"), triggering the next orchestration pass grounded on the confirmed prior stages. The whole artifact stays `proposed` until the single US-UI-6 promote; the admin is the decider at every stage boundary. (DEC-33.)
9. **US-UI-9.** An admin **exports the whole draft plan as a PDF** — via the canonical WASC template or a lighter draft-review template — for distribution and stakeholder commentary. (Operationalizes the DEC-18 materialization principle [model → canonical shape] while the plan is still `proposed`; `DraftDetailView` is a plausible HTML basis for the review render. PDF mechanism + template choice open, deploy-adjacent. DEC-33.)
10. **US-UI-10.** An admin **exports a specific draft stage as a PDF** (e.g. just the responsibility-breakdown stage) for stage-scoped distribution + commentary. (Requires the stored drafting-stage sub-state; DEC-33.)
11. **US-UI-11.** An admin **authors and edits the division's responsibility atoms** (`DivisionResponsibility`) — the per-division, particular responsibility statements the orchestration reasons over to recruit divisions + decompose purview-appropriate work, replacing the single `Division.scope_summary` blob as the mappable units. (DEC-32.)
12. **US-UI-12.** An admin **authors and edits the school's vision + mission statements and their ordered clause atoms** (a `kind`=vision\|mission prose-plus-clause model; `zh_hans` first-class). The clause atoms are the orienting reasoning units the orchestration maps a plan's aims against. (DEC-32.)
13. **US-UI-13.** A school admin uses an intuitively designed interface to populate school-related content.

---

### LLM author-assist (US-LLM)

Stories where an LLM assists a human in creating a draft plan. **Actor — `llm-user`:** an in-app LLM author-assistant that, given grounded context, *proposes* draft plan data or critique and **never persists**. Every `US-LLM` story inherits one invariant (DEC-20, the model is the contract): the proposal arrives as an **editable prefill in the same form a human uses**, the author accepts/edits, and persistence happens only through the normal validated atomic POST — the LLM proposes, the human disposes, and no proposal bypasses `clean()`/`CheckConstraint`. Grounded in the DEC-28 envisioning (`docs/llm-assist-envisioning.md`) over the built `ai` app (DEC-21). Not built. `US-LLM-N`.

Foundation (every assist rides these):

1. **US-LLM-1.** The llm-user's output is parsed into **editable prefills bound into the actual wizard form fields** (vocabulary keys resolved to school-scoped pks; intra-graph references kept as create-order indices), never auto-saved, so it persists only via the existing `clean()`/`CheckConstraint`/atomic POST. (The model-is-contract re-entry seam — the single bridge every other US-LLM story depends on; shared partials + one JS module, suite-agnostic.)
2. **US-LLM-2.** Each llm-user proposal is **grounded** in the school's seeded vocabularies + the 12 WASC standards + the in-progress draft (and optional prior-plan exemplars), assembled by a shared `build_grounding()` and injected via `PromptTemplate`, so it selects from real options and cannot invent vocabulary.
3. **US-LLM-3.** An assist runs **off the request cycle and streams** its output into a preview pane (async view + SSE), so the slow call does not block the page. (Execution infra; DEC-20/21 noted not built — no Celery/Redis required.)
4. **US-LLM-4.** Every assist call is **logged** (`LLMCall`), the author's free-text is **sanitized** (`prompt_sanitizer`, OWASP LLM01), and the call is **attributable to its school/plan**. (Model change: the additive nullable `LLMCall.school`/`plan` FK — DEC-21/§I deferred — lands here via a migration.)
5. **US-LLM-5.** The assist prompts are **managed `PromptTemplate` rows** (slug + variables + the JSON output contract in the template text), editable without a code deploy.

Per-assist (additive on the foundation; one per DEC-28 assist):

6. **US-LLM-6.** Draft the plan's narrative prose fields (`current_state`/`desired_state`/`rationale`/`student_impact_framing`/`provenance`) from a one-line author seed + school profile. (DEC-28 A1.)
7. **US-LLM-7.** Co-author the 简体中文 twin (`*_zh_hans`) of an accepted English prose field. (A1b.)
8. **US-LLM-8.** Propose which of the 12 WASC `AccreditationStandard`s the plan advances, with a per-standard rationale (the `PlanAccreditationStandard` rows), bounded to the supplied 12. (A2; US-12.)
9. **US-LLM-9.** Suggest the domain-alignment M2M selections (`AreaForImprovement`/`LearnerOutcome`/`MissionArea`/`StakeholderGroup`/`Policy`-established/revised), bounded to seeded rows. (A3; US-7..11.)
10. **US-LLM-10.** Draft the `priority_rationale` when the chosen `priority_tier` deviates from the framing's default (the exact `Plan.clean()` condition). (A4; US-ext.)
11. **US-LLM-11.** Draft typed `SuccessCriterion`s from the desired state, each with its `verification_kind` and, for target-kind, value/unit/baseline. (B1; US-13/14. Quantification only as a target-kind criterion — KPIs excluded.)
12. **US-LLM-12.** Suggest which drafted `FeedbackChannel`s measure each criterion (the `Measurement`/`MeasurementChannel` binding, by index). (B2; US-14.)
13. **US-LLM-13.** Propose a `FeedbackChannel` per engaged stakeholder, with a valid timing shape. (C1; US-19.)
14. **US-LLM-14.** Propose `Milestone`s with an `improvement_type` + an applicable `planning_method` + a target date. (D1; US-ext/DEC-14.)
15. **US-LLM-15.** Propose `Phase` groupings under milestones. (E1; US-17.)
16. **US-LLM-16.** Decompose a milestone's `planning_method` recipe (`PlanningStep.template`s) into concrete `ActionStep`s with per-step assessment. (F1 — flagship; US-15.)
17. **US-LLM-17.** Propose `Assignment`s (responsible division + optional person; participants), respecting the kind/target + division→person constraints. (F2; US-16b/c.)
18. **US-LLM-18.** Propose a structured `Timeline` per step (kind + the dates that kind requires; recurrence detail in the free-text note). (F3; US-16d/US-UI-1.)
19. **US-LLM-19.** Propose categorized `RequiredResource`s + an ordered `SubStep` decomposition. (F4; US-16e/g.)
20. **US-LLM-20.** Propose the `Evidence` each step will produce. (F5; US-16f — **blocked on US-UI-3**, the wizard Evidence-capture re-entry path.)
21. **US-LLM-21.** Draft the whole review loop coherently — `Communication`s + `ReviewEvent`s (drawing on drafted channels) + `RevisionRule`s (trigger = a drafted review event) — as one internally consistent bundle by index. (G1; US-18/19/20/21.)
22. **US-LLM-22.** Read the in-progress draft and surface a **read-only coherence/gap critique** (e.g. a criterion with no channel, a required-method milestone with no method, a responsible-less step) — proposing no data. (H1.)
23. **US-LLM-23.** From the admin's **current + desired state**, **orchestrate a complete whole-draft** by running the US-LLM-24 sequencing heuristic over ALL gate-required per-element assists, then the US-LLM-25 gap-closure pass, emitting a **promotion-ready** draft (every field an editable prefill until the single validated POST; framing/priority/improvement-type are AI-proposed too). (H2 — **corrected**: the DEC-28 sequence `A1→A2→A3→D1→F1→B1→C1→G1` was provably partial, omitting E1/F2/F3/F4/F5/A4, all gate-required per `services.py::_check_promotion_gates`. DEC-29.) **Refined (DEC-33): the staged runner** — runs US-LLM-24's heuristic as ordered STAGES (draft a pass → the admin reviews/edits/closes it → the next runs grounded on the confirmed prior); the admin is the decider at every stage boundary; the whole artifact stays `proposed` until the single US-UI-6 promote.
24. **US-LLM-24.** A defined **dependency-aware sequencing heuristic** driving the whole-draft orchestration — the explicit build order over every gate-required element: Plan narrative/alignment/standards → milestones (+improvement_type/method) → phases → action steps → per-step assignments/timeline/resources/evidence → success criteria → feedback channels → measurement bindings → communications → review events → revision rules, honoring the create-order index references (`channel_index`/`trigger_index`). (Supersedes DEC-28 H2's partial sequence. DEC-29.) **Refined (DEC-33): corrected pass order — division-responsibility recruitment runs BEFORE milestones** (the recruited divisions + their engaged responsibility atoms shape the milestones the LLM then proposes — divisions are the *who/what-sphere*, milestones the time-phased arc over that work; reasoning order ≠ storage order, no conflict). Each pass is a checkpointed stage (US-LLM-23); the heuristic reasons over DEC-32's grounding atoms (vision/mission/SLO + division-responsibility) and writes the rationale-bearing principle-linkages (US-LLM-26/27).
25. **US-LLM-25.** A **pre-submit coherence/gap-closure pass**: after the whole-draft prefill, detect unmet promotion-gate predicates (a step lacking assignment/timeline/resource/evidence; a `requires_planning_method` milestone lacking a method; a target-kind criterion missing a baseline; an empty `student_impact_framing`; a priority deviation lacking rationale) and re-invoke the relevant per-element assist to close each, so the emitted draft is **promotion-ready**. (Extends H1/US-LLM-22 read-only critique into closure; proposes only editable prefills — the admin still reviews and flips. DEC-29. DEC-33: the terminal gap-closure stage of the staged build.)
26. **US-LLM-26.** Propose the **rationale-bearing principle alignments** — which of **ALL SIX** A3 alignment relations (`learner_outcomes_targeted`, `mission_areas_targeted`, `areas_for_improvement`, `stakeholder_impact`, `policies_established`, `policies_revised`) and the **vision/mission clauses** (and WASC `AccreditationStandard`s) the plan advances, **each with a `rationale` that IS the accreditation evidence** a WASC committee evaluates (and feeds the canonical materialization, DEC-18). Layer 2b upgrades **all six** of A3's plain M2Ms to through-models carrying rationale (user 2026-05-26, "all carry reasoning"; mirroring `PlanAccreditationStandard`) — so A3 becomes a uniform all-formset rationale assist and the `applyMultiSelectPrefill` multi-select path retires — and adds the plan↔vision/mission-clause linkage. (DEC-32.)
27. **US-LLM-27.** Propose, per `ActionStep`, **which division-responsibility atom(s) it fulfills + the `rationale`** (`ActionStepResponsibility`, an M2M through-model carrying rationale; the fulfilled responsibility belongs to the step's `owner_division`). The rationale is the queryable provenance + accreditation evidence for the responsibility mapping. (DEC-32.)

---

### Draft review — stakeholder commenting (US-REV)

Stakeholder **feedback on the draft plan itself** during the proposed phase, routed by the plan's type/recipe. **Distinct from** the plan's operational `FeedbackChannel`/`Communication`/`ReviewEvent` (those are execution-time mechanisms the plan establishes); this is a review/comment layer over the draft to inform the admin before they flip it to active (US-UI-6, DEC-29). `user`-actor only (human commenting; no `llm-user`). New models needed: a `DraftComment` and a `DraftReviewerRule` mapping — own plan→impl. Pull discovery (no notifications — exclusion); advisory (no acknowledgment/resolution workflow — exclusion). DEC-30. `US-REV-N`.

1. **US-REV-1.** An app admin configures, per **`ImprovementType`** and/or **`PlanningMethod`** (the plan "type"/"recipe"), a **draft-reviewer audience** — the `Position`s/`Division`s whose holders may comment on a draft of that type/recipe. (New `DraftReviewerRule` mapping. A given draft's reviewer set = the **union across its milestones'** `improvement_type`/`planning_method` rules → mapped Positions/Divisions → their holders. Reviewer identity is org-structure-based [Position/Holding/Division].)
2. **US-REV-2.** A school user in a draft plan's reviewer audience **comments on the draft during the proposed phase** — on the whole plan **or** on a specific element (action step / milestone / success criterion / etc.). Comments are advisory feedback on the draft itself. (New `DraftComment`: FK `Plan` + a generic target [the plan or a child object], author, body, created-at. Allowed while `lifecycle=proposed`.) **Open (to think out further):** the **atomicity/granularity** of the element-level case — per step? per element (which types — milestone/phase/criterion/feedback-channel/…)? — is unresolved; the `DraftComment` generic-target shape settles when it is (DEC-30 open sub-question). (DEC-33: a **stage** is added as a comment-target level → {plan, stage, element}; additive — it does NOT change the element-atomicity question above.)
3. **US-REV-3.** The plan author / school admin **sees all draft comments** (plan-level + stage-level + per-element) while reviewing the proposed draft, to weigh before flipping it to active (US-UI-6). Commenting is **advisory and does not gate the flip** (DEC-29 unchanged — the admin alone still flips freely).
4. **US-REV-4.** A reviewer **discovers drafts awaiting their comment** through their own view (**pull** — consistent with the DEC-23 IA; no notifications).
5. **US-REV-5.** A reviewer **comments at the stage level** on a staged draft, and the admin can **gather/see a stage's feedback before closing it** — the per-stage feedback loop, anchored at the orchestration checkpoints (US-UI-8), so review can be incremental at the natural seams rather than only on the finished draft. Advisory and non-gating (DEC-30 unchanged); requires the stored drafting-stage sub-state (a stage must be a referenceable target). (DEC-33.)

> Dependency: actual commenting users require the **`Person` roster + `User` links (D7)** — until people/accounts exist, a rule resolves to Positions/Divisions with few/no live accounts (the mapping + models can be built and tested independently of D7). Element-level targeting (US-REV-2) requires `DraftComment` to carry a generic target (GenericForeignKey or per-type nullable FKs); stage-level targeting (US-REV-5) requires the stored drafting-stage sub-state (DEC-33) so a stage is a referenceable target.

### Draft generation + versioning (US-DRAFT)

The unifying frame for the create-plan UX: from the three entry routes at the top of the wizard surface ("I have a problem" / "I have an outcome in mind" / "Formalize a proposal"), the LLM uses ALL data from the school's DB as its universe of context to render a complete draft plan in all its elements, ready for the author to evaluate and fine-tune. Author can save progress at any stage; saves are tracked as versions, walkable-back. Distinct from the per-element LLM assists (US-LLM-6..27) which propose a single element from a seed — these stories cover whole-draft generation from minimal entry input plus the versioning that makes iteration safe. `US-DRAFT-N`.

1. **US-DRAFT-1.** An author opens the create-plan flow at one of three entry routes — "I have a problem", "I have an outcome in mind", or "Formalize a proposal" — and provides their seed input. From that seed, the LLM uses ALL data from the school's DB as its universe of context to render a draft plan with every element populated. The author then evaluates and fine-tunes the rendered draft.
2. **US-DRAFT-2.** An author can save their progress at any stage of the create-plan flow.
3. **US-DRAFT-3.** Each save is tracked as a versioned draft; the author can walk back to any prior draft version and continue from there.

---

## Layer framing (meta-user-stories)

Layers are the meta-organizing principle above user-story milestones. User stories define what an author can **do**; layers define what posture the system **has**.

- **Layer A — Do now in local dev.** Items where retrofit is more expensive than build-in. Dependencies, settings, CI, hooks, group structure, type checking, logging hygiene. Meta-user-story: *"As a future maintainer, I can read the codebase and find no security/quality debt that requires a re-platforming pass to address."*

- **Layer B — Structural foundation now, values at deploy time.** Items where the *shape* must be in place so deploy phase fills in rather than restructures. `prod.py` declarations reading from env, documented backup/restore plans, object-permission helper present even if unused. Meta-user-story: *"As the developer reaching the deploy phase, I can fill in env values and run the rollout without touching application code or settings structure."*

- **Layer C — Defer to deployment phase entirely.** Pure container/orchestration concerns: Dockerfile multi-stage, non-root container user, HEALTHCHECK, gunicorn flags, `pg_isready` entrypoint wait, backup execution. Written *in shape* now (Dockerfile skeleton with multi-stage, entrypoint template with `pg_isready` stub, env-configurable gunicorn flags) so deploy work configures rather than rewrites. Meta-user-story: *"As the operator running the first deploy, I configure the droplet env and push; the application code is untouched."*

Every phase below tags its dev steps with the layer they advance. Layer A items land in the early phases. Layer B items land as `prod.py` or doc additions in Phase 0 and as extension fields in Phase 14. Layer C is its own deferred capability tier, present in skeleton form from Phase 0 so no refactor is needed later.

### Layer A inventory (must be present by end of Phase 2)

Secrets policy (gitignore, `.env.example`, `SECURITY.md`); dedicated postgres app role for local dev; `django-csp` with permissive dev / strict prod stub; `django-two-factor-auth` for admin MFA; explicit `DATA_UPLOAD_MAX_*` limits; `django-axes` rate limiting; no `[socialaccount]` extra if allauth is used at all; `.dockerignore`; stdout/stderr logging only (no file handlers); `pyproject.toml` + `[dependency-groups]` only (no `requirements.txt`); `ruff` lint+format (no black/isort/flake8); `mypy` (no `django-stubs` plugin; Django bits typed as `Any`); `.pre-commit-config.yaml`; CI test workflow; `pip-audit` in CI + Dependabot; no `DB_USER='postgres'` fallback default; `LOGGING` scrubbing filters; `CONN_MAX_AGE=60`; database `OPTIONS={'connect_timeout': 5}`; permission groups (`school_curator`, `plan_author`, `read_only`) via data migration; `SECURITY.md`; `THREAT-MODEL.md` (light); `CONTRIBUTING.md`.

### Layer B inventory (structural placeholders by end of Phase 0; values at deploy time)

`prod.py` declarations reading from env: all `SECURE_*` hardening flags; `CSRF_TRUSTED_ORIGINS`; `ADMINS` / `MANAGERS` / error-email config. `BACKUPS.md` documenting `pg_dump` schedule + media rsync + retention policy. Object-permission helper (django-guardian installed or hand-rolled module present) even if no policy uses it yet.

### Layer C inventory (skeleton in repo by end of Phase 0; activated at deploy)

Multi-stage Dockerfile (builder → runtime); non-root `app` user; `HEALTHCHECK` directive pointed at `/health/`; entrypoint script with `pg_isready` wait stub; env-configurable gunicorn (`WEB_CONCURRENCY` from env, default `2*nproc+1`); `--worker-tmp-dir /dev/shm`; `--graceful-timeout`; `--max-requests` + `--max-requests-jitter`; pinned `postgres:18.X` minor in compose; `.dockerignore` (already Layer A).

---

## File-decomposition pattern (applies to every Django app introduced)


Replace `models.py` with a `models/` package; one file per cohesive domain group; `__init__.py` re-exports every model. Adjacent files at the app root carry non-model concerns: `choices.py`, `constraints.py`, `querysets.py`, `managers.py`, `validators.py`, `signals.py`, `services.py`, `selectors.py`, `apps.py`, `translation.py`, `tests/` (package). Each app-introducing phase creates: `models/` package, `admin/` package, `apps.py`, `choices.py`, `constraints.py`, `querysets.py`, `managers.py`, `signals.py` (registered in `apps.py::ready()`), `services.py`, `selectors.py`, `validators.py`, `translation.py`, `tests/` (package — `__init__.py` plus one `test_<lowercase_model>.py` per declared model class). Empty stubs acceptable for non-test adjacent files; tests must exercise the model they cover (creation, declared constraints, declared field defaults, polymorphic predicates). Subsequent phases that add models to an existing app extend that app's `tests/` package with new `test_<model>.py` files in the same commit as the model.

## Admin-package pattern (applies to every Django app introduced)


Replace `admin.py` with an `admin/` package mirroring `models/`. One `ModelAdmin` per model decorated with `@admin.register(Model)`. `admin/__init__.py` imports every admin module so `@admin.register` fires. Per-app companion files: `inlines.py`, `filters.py`, `actions.py`, `forms.py`, `widgets.py`. Best-of-breed defaults on every `ModelAdmin`: `list_display`, `list_filter`, `search_fields`, `readonly_fields` (auto-managed fields), `raw_id_fields` (high-cardinality FKs: Plan, ActionStep), `autocomplete_fields` (medium-cardinality FKs: Department, Role, FeedbackChannel), `prefetch_related`/`select_related` in `get_queryset()`, `fieldsets` for any model with >6 fields, `save_as=True` on Plan, `list_per_page` explicit.

## i18n pattern (applies to every Django app introduced)


Every models/admin file: `from django.utils.translation import gettext_lazy as _`. Wrap every human-visible string (field verbose names, choice labels, Meta verbose_name/verbose_name_plural, fieldset headers, action descriptions, filter titles, help text). Use `gettext_lazy`, not `gettext`. Use `format_lazy` for lazy formatting, `ngettext_lazy` for plurals. Each app declares translated fields in `{app}/translation.py` with `modeltranslation` `TranslationOptions`. Each app gets per-language `locale/{en,zh_Hans}/LC_MESSAGES/.gitkeep`. **Untranslated by policy:** `AccreditationStandard.text` (authoritative English), `Cycle.code` (academic-year identifier), IDs, slugs, enum values, timestamps.

---

## Multi-school tenancy


`School` is the tenant root. Every school-level entity listed under the noun list's "School-level (long-lived)" header (`Cycle`, `Department`, `Role`, `StakeholderGroup`, `LearnerOutcome`, `MissionArea`, `AreaForImprovement`, `Policy`, `PlanningMethod`) carries `school = ForeignKey(School)`. `User` carries `school = ForeignKey(School)`. `Plan` carries `school = ForeignKey(School)`; plan-owned children inherit scope via their `plan` FK. `AccreditationCategory` and `AccreditationStandard` are global reference data — no school FK. Unique constraints whose semantics are per-school (e.g., `Cycle.code`) compose with `school` in `Meta.constraints`.

## Polymorphism patterns (recurring)

Source: noun list. The two-nullable-FK + `CheckConstraint` exactly-one pattern recurs on `Assignment` (department/role/stakeholder_group), `FeedbackChannel.owner`, `Communication.owner`, `Evidence.owner`, `Policy.evaluation_responsible`, `ReviewEvent.responsible`. Predicate shape: `Q(a__isnull=False, b__isnull=True, c__isnull=True) | Q(...) | ...` — one disjunct per nullable FK.

---

## Implementation conventions (binding on every phase)

The implementing agent makes no Django-detail decisions. Every default below is fixed; phase docs name fields and types, the conventions below fill the rest.

### Field-type defaults

- **`CharField` `max_length`**: `code`/`slug` = 64; `label`/`title`/`name` = 200; everything else CharField = 500. Free-form prose is `TextField` (no max).
- **Identifier/slug fields**: `CharField(max_length=64)`, unique per its scope (per-school unless explicitly global).
- **Translated CharField/TextField**: declared in the phase doc's `translation.py` block; field declaration uses `gettext_lazy("...")` for `verbose_name`.
- **Numeric quantities** (`target_value`, `baseline`): `DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)`.
- **Booleans**: `BooleanField(default=False)` unless the phase doc names a different default.
- **Dates**: `DateField`. **Datetimes**: `DateTimeField(auto_now_add=True)` for "created at" timestamps; `DateTimeField(auto_now=True)` for "updated at"; otherwise explicit.
- **Order columns**: `IntegerField(default=0)`. The model's `Meta.ordering = ["order"]` (or `["order", "id"]` for tiebreak).

### FK / M2M defaults

- **Tenant root** (`school` FK): `on_delete=models.PROTECT, related_name="<lowercase_plural>"`.
- **Parent in a plan-owned aggregate** (anything FK to `Plan` or to `ActionStep` from its children): `on_delete=models.CASCADE`.
- **Reference data** (FK from a plan-owned model to a `school.*` row like `Cycle`, `Department`, `Role`, `Frequency`, etc.): `on_delete=models.PROTECT`.
- **Optional cross-references** (e.g., `ActionStep.phase`): `null=True, blank=True, on_delete=models.SET_NULL`.
- **Author / user attributions** (FK to `users.User`): `on_delete=models.PROTECT`.
- **Self-references** (`Plan.predecessors` through `PlanPredecessor`): `on_delete=models.CASCADE` on the through-rows.
- **`related_name`**: lowercase plural of the source model's class name (`Plan` → `plans`, `SuccessCriterion` → `successcriteria`). When two FKs from the same model target the same model (e.g., `Plan.policies_established` and `Plan.policies_revised`), the phase doc supplies explicit names.
- **`through` model** is named `<Source><Target>` (e.g., `PlanAccreditationStandard`, `MeasurementChannel`, `ReviewEventInput`).

### `Meta` defaults

- **`verbose_name`**: `_(<lowercase singular of class name with spaces>)`.
- **`verbose_name_plural`**: `_(<lowercase plural of class name with spaces>)`.
- **`ordering`**: if the model has an `order` field, `["order"]`; otherwise `["label"]` or `["title"]` (whichever the model has); for pure reference data without either, `["code"]`; for log-style models, `["-at"]`.
- **`constraints`**: declared in the phase doc when the constraint is non-trivial. Multi-school uniqueness composes with `school`: `UniqueConstraint(fields=["school", "code"], name="<lowercase_class>_school_code_unique")`.

### `__str__` defaults

`def __str__(self): return self.label` (or `.title`, or `.name`, or `.code` — first that the model defines). Through-models return `f"{self.<source>} ↔ {self.<target>}"`.

### Admin defaults (on every `ModelAdmin`)

Per the admin-package pattern:
- `list_display` = (`__str__` field, every translated field, every FK in `autocomplete_fields`).
- `list_filter` = (every FK to a reference vocabulary, every status/lifecycle CharField).
- `search_fields` = (`label`/`title`/`name`/`code` if present, plus translated prose fields).
- `autocomplete_fields` = every FK to `Department`, `Role`, `StakeholderGroup`, `Frequency`, `PriorityTier`, `SubjectKind`, `FramingVocabulary`, `PlanningMethod`, `User`.
- `raw_id_fields` = every FK to `Plan`, `ActionStep`.
- `prefetch_related` / `select_related` on `get_queryset()` covers every FK and M2M used in `list_display`.
- `save_as = True` on `PlanAdmin`.
- `list_per_page = 50`.
- Fieldsets used when a model has >6 fields; headers wrapped in `_()`.

### Validators

- `cross_plan_ref` on `ActionStepDependency`: `RegexValidator(r"^\d+:\d+$")`.
- Email uniqueness on `User`: enforced by `EmailField(unique=True)`.
- All other validators only as named explicitly in a phase doc.

### Translation defaults

- Every field listed in a phase doc as "translated" is registered in that app's `translation.py` per the i18n spec.
- The `verbose_name` argument on every translated field is `gettext_lazy("...")`.

### Migration ordering

When a model in an earlier phase needs to reference a model introduced in a later phase, the earlier phase declares the FK as `null=True, blank=True` initially, and the later phase's migration backfills + tightens. The only instance is `User.school` (Phase 1 declares User; Phase 2 adds the FK).

These conventions are binding. The implementing agent does not deviate without an explicit phase-doc instruction overriding a convention.
