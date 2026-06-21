# Source-model gaps

Source (byte-verbatim JSON also persisted): `context-migration/decomposed/source-model-gaps.json`

Each entry below is the exact `raw` (or `body`) string from the source JSON, copied verbatim — no rewording, no augmentation.

---

# Source ↔ model representational gaps

---

Where the design sources — the WASC source documents (`sources/extracted/*.txt`) and the
canonical web prototype (`web/canonical.html`, `web/working.html`, `web/wizard.html`,
`web/data/plan-data.js`, `web/DRAFT-VISION.md`) — contain concepts or fields the implemented
Django models **cannot hold**. This is the durable record of that impedance mismatch, so
import/seed work and any future modelling decisions are made with eyes open.

---

**Prototype pin (DEC-19).** `web/data/plan-data.js` has since been rebuilt to be model-faithful
(commit `cf09618`); the divergence catalog below describes the **original prototype as of git SHA
`529b3d0`** (the last commit before the rebuild). The current `plan-data.js` no longer carries the
prototype's superseded keys (`org_units`/`lead_role`, plan-level `subject_kind`, `kpis[]`, `role-…`
actors) — read those entries against `529b3d0:web/data/plan-data.js`, not the live file.

---

Each entry marks the kind of difference: **[lossy]** (source carries data with no model home —
dropped on import), **[needs-value]** (the model requires more than the source provides), or
**[mismatch]** (layer / semantic / precision). Companions:
`data/reference-data-spec.md` (field-level model expectations), `data/seed-round-plan.md`
(the active seed round's conflicts + decisions), and `docs/model-surface-audit.md` (the
code-grounded, authoritative model inventory + the candidate-view capability-gap findings
that §I below reconciles).

---

## Materialization principle (DEC-18)

---

`web/canonical.html` is a **required output materialization** — the formal WASC schoolwide
action-plan document for a fixed audience (the visiting committee / accreditors) in a fixed
shape (the WASC sample template) — **not** a prototype to be reconciled down to the model. The
model is the single source of truth; it must be rich enough to **materialize canonical** (a
report/export view emits that exact shape from stored plan data) *and* to drive the staff-facing
creation/visualization views. Direction runs model → rendering. So this document is the ledger of
where the model **cannot yet materialize a required rendering**: every datum canonical shows must
be producible from stored data, and where it is not, the **model** is what changes (the gap is a
work item here, mandate-007) — canonical is never edited down to what the model happens to hold.
canonical keeps its WASC-audience vocabulary (e.g. the column header "Department / Person(s)
Responsible", KPI chips rendered from a target-kind `SuccessCriterion`); it is NOT relabeled to
db field names the way the staff mockups (`mockups/a–e`, `web/working.html`, `web/wizard.html`)
are. DEC-16 / DEC-17 were already instances of this principle (the 2-of-6 WASC action-step columns
— `assessment` / `communications` — and the audited `status` / `ActionStepImpediment` work all
extended the model so canonical materializes).

---

**Resolution of the data↔view split (DEC-19).** `web/data/plan-data.js` is to be made **exactly
faithful to the Django modeling** — the JS stand-in for *stored plan data*, shaped like the models
(`divisions` with `parent`/`head`; the `Milestone` tier `Plan → Milestone → Phase → ActionStep`
with per-milestone `improvement_type`/`planning_method`; actors as `division` + optional `person`,
**Role retired**; per-step `status`/`assessment`/`communications`/`impediments`; quantification as a
target-kind `SuccessCriterion`, no standalone KPI). It is the single model-faithful sample source of
truth. Each `.html` is a **view** over it that owns its own audience's shape: **`web/canonical.html`
stays as it is** — its rendered WASC output/shape is held constant and it **does not bring in elements
its shape does not display** (it projects the model-faithful data *down* to the fixed WASC document,
omitting the milestone tier / division hierarchy it does not surface). Canonical's renderer is
necessarily updated to source its displayed values from the new model-faithful keys, but its OUTPUT is
output-frozen and guarded by a **golden-output check** against the WASC sample (`sources/`). The
"original prototype" divergence record below is a **historical fact pinned to the git SHA** of the
prototype (git freezes every prior state); `plan-data.js` is free to evolve past it.
`web/working.html` / `web/wizard.html` read the same model-faithful data and show milestones /
divisions natively. This dissolves the two structural flags from the working/wizard alignment
(improvement-type altitude; Role-encoded actors) by making the sample model-faithful rather than
relabeling over an outdated shape.

---

**IMPLEMENTED** (2026-05-23): `plan-data.js` rebuilt model-faithful + `canonical.html` re-pointed
output-frozen (`cf09618`, golden contract `web/data/canonical-golden.json`, zero shape diff);
`working.html` + `wizard.html` switched to the native structural keys (`ca8ad5c` — divisions
parent/head, milestone tier, structured assignments, impediments; wizard gained a Milestone step
capturing improvement_type/planning_method at the milestone altitude). Prototype pinned at `529b3d0`.

---

## A. Concepts the model does not hold or consolidates

---

- **ActionStep dependency `kind`.** Prototype dependencies carry `kind: "blocked_by"`. `ActionStepDependency` has no `kind` field — per the noun-list, "the user story does not differentiate dependency kinds." Dependency type is dropped.

---

- **Standalone KPIs.** Prototype keeps `kpis[]` (metric / target / unit / baseline) separate from `success_criteria`. The model has no KPI entity; quantification is folded into `SuccessCriterion` (`verification_kind="target"` → `target_value` / `target_unit` / `baseline`). A KPI is expressed as a target-kind success criterion, not a separate row.

---

- **Narrative `outcomes`.** Prototype plans carry an `outcomes[]` narrative distinct from `success_criteria`. The model has only `SuccessCriterion` (observable conditions). Narrative outcomes fold into `Plan.desired_state` / `rationale` or are dropped.

---

- **`gap_statements[]`.** Prototype plans carry a structured list of gap statements. The model has prose `Plan.current_state` / `rationale`; no structured gap list. Folds into prose.

---

- **Proposals / the pre-plan 13-item flow.** Prototype has a `proposals[]` registry; the design has a propose→promote flow. `promote_proposal_to_plan` is a `NotImplementedError` stub and there is no `Proposal` model.

---

## B. Source fields with no model column  [lossy — dropped on import]

---

- **Division** (prototype `org_units`): `alt_labels`, `note` remain unrepresented. **Resolved (DISC-16, `048cf71`):** `parent_unit` (sub-unit / hierarchy) is now `Division.parent`, and `lead_role` is now `Division.head` (FK → `Person`). Division hierarchy (subject departments under Curriculum & Teaching) IS now representable. (Model class renamed `Department`→`Division`, DEC-13/`d5a2ad2`; "Department" survives only as the pinned-prototype key.)

---

- **Role** (`individual_roles`): **N/A — `Role` retired (DISC-16, `048cf71`).** Seats are now `Division.head` (single accountable head) + `Position`/`Holding` (named, multi-holder seats; `6f7813d`); `Person.name` is translated (EN/中文). `alt_labels` for individuals remain unrepresented.

---

- **LearnerOutcome / SLO** (`slos`): `synonyms[]` (SWO / Learner Attribute / Cambridge names) and `source` provenance (`legacy` / `draft 25-26`). The model has `code` / `label` / `description` only — the synonym-resolution the prototype relies on is lost.

---

- **FramingVocabulary**: `order`. The model orders by `label`; there is no `order` column. (Already handled in the framing seed — order not carried.)

---

- **PlanningStep** (recipe step): `role_hint`. The model's step is `order` + `template` only.

---

- **Policy**: `status`, `owner`, `latest_revision`. The prototype tracks policy lifecycle metadata; the model `Policy` holds `label`, `notes`, `evaluation_frequency`, `evaluation_responsible` only. (Policy *lifecycle* is modelled for Plans via `PlanStatusTransition`, not for standalone Policies.)

---

- **ActionStep `status`. — RESOLVED (`cba276f`, audited form).** `ActionStep.status` (`ActionStepStatus`: not-started/in-progress/done, default not-started) added, **with a who/when/from/to audit trail**: `ActionStepStatusTransition` (append-only, reusing the new `StatusTransition` base), written server-side by `services.set_action_step_status`; status is readonly in admin and changed via bulk actions; the transition log is a view-only school-scoped admin (migrations plans/0026 schema + plans/0027 view-only group grants). Accreditation-defensible per user decision (DEC-16).

---

- **ActionStep `assessment`. — RESOLVED (`deca4d5`).** `ActionStep.assessment` added — a translated `TextField` (twin of `description`), the per-step "Assessing of Progress" narrative. It coexists with the plan-level `SuccessCriterion`/`Measurement` (the canonical grid renders both); not collapsed into them. (migration plans/0025.)

---

- **ActionStep ↔ Communication link. — RESOLVED (`deca4d5`).** `ActionStep.communications` M2M → `Communication` (twin of `evidence_artifacts`, `related_name="action_steps"`, optional). `Communication` stays plan-owned; a comm can be plan-only and/or referenced by one-or-more steps (the source's `communication_ids` shape). (migration plans/0025.)

---

## C. Model requires more than the source provides  [needs-value at import]

---

- **Cycle.starts_on / ends_on** — required `DateField`s; source has the cycle as a bare string (`"2025-2026"`).

---

- **Role.department** — **N/A (Role retired, DISC-16/`048cf71`).** The former required `Role.department` FK no longer exists; responsibility is `Division` + optional `Person`.

---

- **Policy.evaluation_frequency** — required FK → `Frequency`; source carries only an inline cadence *string*. (Plus `Policy.evaluation_responsible_division` required + `evaluation_responsible_person` optional — code-current; the prototype's `owner` is role-shaped.)

---

- **Evidence.owner_division** — required FK → `Division` (with an optional `owner_person` FK → `Person`); prototype `evidence_artifacts` have only `{id, label}` (no owner). (No department/role exactly-one-of — that polymorphism was retired with the org remodel; `owner_division` is unconditionally required.)

---

- **School.slug** — unique slug required; source is a bare name string (slug `chiway-repton-xiamen` minted at seed time).

---

## D. Precision / type mismatches  [mismatch]

---

- **Date precision.** Prototype dates are year-month (`"2025-10"`; ranges `from:"2025-09", to:"2025-12"`; `ReviewEvent.scheduled "2025-10"`). The model uses full `DateField`s (`Timeline.date/from_date/to_date`, `ReviewEvent.scheduled_date`). Importing requires choosing a day (e.g. first of month) — month precision is not preserved as such.

---

## E. Wrong layer  [mismatch]

---

- **FeedbackChannel.** Prototype treats `feedback_channels` as a shared **registry** (Layer-1 reference data). The model makes `FeedbackChannel` **plan-owned** (`plan` FK CASCADE, Phase 7). Channels cannot be seeded as shared reference data; each plan re-declares its own. (The same channel reused across plans becomes multiple rows.)

---

- **Improvement type / planning method — plan-level in the prototype, milestone-level in the model.** The prototype attaches one `subject_kind` and one `recipe_instantiated` to the *plan* (`plan-data.js` `plan.subject_kind` / `recipe_instantiated`). The model carries `improvement_type` and `planning_method` **per `Milestone`** (`SubjectKind`→`ImprovementType`, altitude `Plan`→`ActionStep`→`Milestone`; commits `057f5ed`/DISC-14 then `19cc102`/DEC-14) — a plan is a bundle of differently-typed efforts grouped under milestones. Importing the prototype's single plan-level kind would map to the plan's milestones, not the plan; a one-kind plan has no direct model home at the plan level.

---

## F. Semantic mismatches  [mismatch]

---

- **`subject_kinds.policy_lifecycle` vs `ImprovementType.requires_planning_method`.** Same shape (bool) but different meaning: the prototype flag marks policy-lifecycle kinds; the model flag gates whether a `Milestone`'s `planning_method` is required at promotion. Not a direct copy — resolved by seed-round D4 (DEC-7).

---

- **Cadence: string vs entity.** The source treats cadence as an inline string (`annual`, `termly`, `ongoing`, `one-off`, `milestone`); the model elevates it to a first-class `Frequency` entity (FK from `Policy`, `FeedbackChannel`, `Communication`, `ReviewEvent`). Frequency rows must be synthesized from the strings (seed-round D3); there is no canonical Frequency list in the source.

---

- **PTA dual representation.** One real-world body maps to two model rows: `ou-pta` → a `Division` (when it owns/coordinates) and `sh-pta` → a `StakeholderGroup` (when it is an audience). One source concept becomes two reference rows.

---

- **StakeholderGroup has no `code`.** Source ids (`sh-*`) have no model home; the importer keys on `label`.

---

## G. Concepts with no model at all

---

- **Glossary** (`registries.glossary`): term / expansion / definition entries (SLO, SWO, HRT, YGL, PLC, Yungu, Cambridge, Repton, …). No model. The prototype uses it for tooltip/synonym resolution; nothing equivalent in the app.

---

- **External frameworks** (`registries.external_frameworks`): WASC / Cambridge / Repton as named frameworks. WASC is modelled as *standards* (`accreditation`), but not as a "framework" entity; **Cambridge** and **Repton** have no representation at all, despite the SLO work being explicitly Cambridge/Repton-aligned.

---

- **"Critical Areas for Follow-up"** (WASC sample template): a numbered list distinct in the source from "Areas for Improvement"; no dedicated model.

---

## H. Capability gaps — model lacks what a described workflow needs

---

Not source-import differences, but places where the model lacks what a described workflow needs.

---

- **Evidence auditability — `Evidence` holds no payload, location, or status history.** A plan's steps each *produce* evidence that must persist for auditing (e.g. a "publish survey → analyze → revise → final survey" chain, where each step yields a survey instrument, a responses dataset, an analysis report, a revised draft). The `Evidence` model is metadata only — `label`, `owner_division` (required) + `owner_person` (optional), `status` (`EvidenceStatus`), `retention_until` — with:
  1. **No artifact payload or reference.** No FileField/upload, URL, or external identifier — so the model records *that* an artifact exists and its status, but **not where the actual file lives** (the "tbd where it persists" question). `retention_until` even implies something is being retained, yet nothing points at it. **Resolution direction (user, 2026-05-25 — to be thought out later, NOT decided):** the field is expected to be a *reference*, not file storage — either a link/URL to an asset, or (more likely) a **hand-authored free-text field describing where the artifact is** (a location/whereabouts note). File upload/managed storage is not the anticipated shape. The decision is deferred; this only narrows the candidate space. **Minimal step — BUILT (`edf4840`, US-UI-3, 2026-05-25):** added `Evidence.location` (`TextField(blank=True)`, NOT translated) — the hand-authored "where it is" note — via migration `plans/0033_evidence_location` (applied + verified on dev DB); surfaced in `EvidenceAdmin` + captured in the planner `EvidenceForm` (per-step Evidence sub-formset). Field-on-existing-model → no permission migration (DISC-19 n/a). **The fuller link/upload/managed-storage decision stays deferred** (still §H.1-open) and composes alongside `location` later without disturbing it.
  2. **No status-change audit trail. — RESOLVED (`c54f8046`).** `Evidence.status` is now audited: `EvidenceStatusTransition` (append-only, reusing the `StatusTransition` base) records who/when/from/to, written server-side by `services.set_evidence_status`; status is readonly in admin and changed via bulk actions; the transition log is a view-only school-scoped admin (migrations plans/0028 + plans/0029 view-only group grants). "Verified by whom, when" for evidence is now captured. (Part of the global status-auditability decision DEC-16, which completes audit coverage: Plan lifecycle [`PlanStatusTransition`], Milestone reached [stamped], ActionStep status, Evidence status.)
  Neither the WASC source docs nor the prototype carry this (prototype evidence is `{id, label}` only). **Still open — sub-point 1 (artifact payload/location).** The status-audit resolution (sub-point 2) is done; the artifact-reference/file field is a separate storage decision, not yet built.

---

- **~~No `Milestone` tier~~ — RESOLVED (`e824283`, DISC-15-0521-A).** A `Milestone` tier now exists (`Plan → Milestone → Phase → ActionStep`): `Phase.milestone` optional FK; `Milestone` carries a target (aspiration) + service-stamped achieved state; the timing carriers gained a `timing_kind` + `milestone` FK so timing anchors to a milestone (the `cadence: "milestone"` case is now representable). The historical gap, kept for the record: The prototype expresses a feedback channel's timing as `cadence: "milestone"` (`fc-stakeholder-feedback`, "Stakeholder feedback on draft SLOs") — it fires *when a declared level of work is reached*, not on a period. A **milestone** is best understood as an *aspiration declaring a particular level of work complete* — a checkpoint that **groups one or more `Phase`s** (e.g. 3 milestones, each with n phases), with a target (aspired completion) and an achieved state (reached / when / by whom). The model has no such tier: today the hierarchy is `Plan → Phase → ActionStep`, and the timing carriers anchor only to a recurrence or a fixed date —
  - `FeedbackChannel.frequency` (required FK, period),
  - `Communication.frequency` (required FK, period),
  - `ReviewEvent.scheduled_date` (required DateField, a fixed calendar date — **not** a frequency).

---

  So "do X when milestone N is reached" is **not representable**, and the model also cannot **declare a level of work complete** (related: `ActionStep` has no status field — §B). Resolution (DISC-15-0521-A): introduce a `Milestone` tier — `Plan → Milestone → Phase → ActionStep`, with `Phase.milestone` an optional FK (mirroring the optional `ActionStep.phase`), and `Milestone` carrying `label` / `order` / a target (aspired) and an audited achieved state (mirroring `PlanStatusTransition`); then anchor the timing carriers to a `Milestone` as a distinct axis from `Frequency` (period) and `scheduled_date` (fixed date). Companion D3 note: `ongoing` is redundant with having a period and `one-off` is an occurrence-mode, not a period (`Frequency` holds discrete periods only). Tracked as `phases/discoveries.md` DISC-15-0521-A.

---

## I. Capability gaps surfaced by the code-grounded model-surface audit

---

Confirmed against code (2026-05-23; `docs/model-surface-audit.md`), framed by the candidate-view feasibility analysis. These are model-capability gaps (work items, mandate-007), not source-import differences — the model holds no such surface today:

---

- **No capacity / availability** on `Division` or `Person`, and `RequiredResource` is `kind` + free-text `note` only (no quantity/unit). → blocks any *overbooking* detection (commitment vs a ceiling); only raw contention (concurrent-commitment counts) is derivable.

---

- **No structured recurrence rule.** Recurrence is a `TimelineKind`/`TimingKind` token + a `Frequency` (code/label, no interval) + free `note` — no RRULE — so recurring items cannot be expanded to concrete dates (a *calendar* materializes only fixed-date / range / milestone-anchored items).

---

- **No conflict concept.** Only *dependency* conflict (via the `ActionStepDependency.cross_plan_ref` string) and *schedule-overlap* (same actor, overlapping `Timeline`s, fixed dates only) are derivable; *goal/semantic* conflict has no model representation.

---

- **No direct `ActionStep ↔ Position` link.** A *position* view must derive its set via `Position → Holding → Person → Assignment.person`; `Assignment.person` is optional, so unit-only steps carry no position attribution at all.

---

- **`ActionStepDependency.cross_plan_ref` has no referential integrity** — it is an unresolved `"<plan>:<step>"` string, not an FK; cross-plan dependency/conflict logic parses free-form text.

---

- **Some uniqueness is seed-convention, not DB-enforced** — `Position(division,label)`, outcome `code`s, and `PlanAccreditationStandard(plan,standard)` rely on `get_or_create`, not a `UniqueConstraint`; the `Division`/`Phase` same-school / same-plan rules are `clean()`-only (not DB-enforced).

---

- **`ai.LLMCall` has no link to plan / step / school** — AI calls are user/system-scoped only (a tenancy/work FK is deferred per DEC-21).

---

See `docs/model-surface-audit.md` §7 (candidate-view readiness table) and §8 (full code-cited findings). Evidence artifact payload/location (§H.1), standalone KPI and `Proposal` (§A) remain the other open gaps.

---

## Consequence summary

---

- **A (omits/consolidates) & G (no model):** the concept has no model representation.

---

- **Lossy (B):** importing the source drops these fields; they will not survive a plain import without a model change or an out-of-band record.

---

- **Needs-value (C):** these block creation until the missing values are supplied (the seed-round D-decisions cover the reference ones).

---

- **Mismatch (D, E, F):** require an explicit mapping/transform at import time (date coercion, Frequency synthesis, subject-kind mapping, channel-per-plan duplication).

---

- **Capability (H, I):** the model lacks what a described workflow / candidate view needs (H = workflow gaps; I = the code-grounded capability gaps the model-surface audit confirmed).

---
