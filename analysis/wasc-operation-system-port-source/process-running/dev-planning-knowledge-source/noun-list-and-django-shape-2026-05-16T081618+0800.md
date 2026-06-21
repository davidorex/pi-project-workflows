## Updated noun list

**Plan and its constituent parts**
- Plan
- Subject *(field on Plan)*
- Author *(relation from Plan to User)*
- Lifecycle *(status field on Plan)*
- CurrentState *(text field on Plan)*
- DesiredState *(text field on Plan)*
- Rationale *(text field on Plan)*
- Provenance *(text field on Plan)*
- Title *(field on Plan)*
- PlanStatusTransition *(audit trail of lifecycle transitions)*

**Action machinery (plan-owned)**
- Phase
- ActionStep
- SubStep
- Responsibility *(actor assignment to a step, kind=responsible)*
- Participant *(actor assignment to a step, kind=participant)*
- Timeline *(with kind, date, from, to, note)*
- RequiredResource *(with kind, note)*
- ActionStepDependency *(within-plan and cross-plan)*

**Verification (plan-owned)**
- SuccessCriterion *(with optional numeric target — KPI dissolves into this)*
- Measurement *(binds a SuccessCriterion to FeedbackChannels via MeasurementChannel)*
- MeasurementChannel *(through-model for the Measurement ↔ FeedbackChannel M2M)*

**Feedback and review loop (plan-owned)**
- FeedbackChannel
- ReviewEvent *(with scheduled, responsible, inputs)*
- ReviewEventInput *(through-model for ReviewEvent.inputs M2M to FeedbackChannel)*
- RevisionRule *(with trigger, condition, action)*

**Outputs (plan-owned)**
- Communication *(with audience, channel, frequency, owner)*
- Evidence *(with label, owner, lifecycle, retention_until)*

**Owner / Frequency** — relation types and property kinds appearing on multiple entities. `Owner` is the two-nullable-FK + exactly-one CheckConstraint pattern; `Frequency` is now a school-level table (see below).

**Feedback** — not a stored entity; arrives via FeedbackChannel.

**School-level (long-lived)**
- School *(tenant root)*
- Cycle
- Department
- Role
- StakeholderGroup
- LearnerOutcome
- MissionArea
- AreaForImprovement
- Frequency *(curator-managed cadence vocabulary)*
- Policy
- PriorityTier *(curator-managed)*
- SubjectKind *(curator-managed; carries `requires_planning_method` flag)*
- FramingVocabulary *(curator-managed; carries `default_priority_tier` FK)*
- PlanningMethod *(with applicable_subject_kinds M2M)*
- PlanningStep *(belongs to PlanningMethod, ordered)*

**Accreditation-level**
- AccreditationCategory
- AccreditationStandard *(WASC standards — global reference data, no school FK)*

---

## Django ORM shape

**App split**

```
school/          School, Cycle, Department, Role, StakeholderGroup,
                 LearnerOutcome, MissionArea, AreaForImprovement,
                 Frequency, Policy, PriorityTier, SubjectKind,
                 FramingVocabulary, PlanningMethod, PlanningStep
accreditation/   AccreditationCategory, AccreditationStandard
plans/           Plan, PlanPredecessor, PlanAccreditationStandard,
                 PlanStatusTransition,
                 Phase, ActionStep, SubStep, Assignment, Timeline,
                 RequiredResource, ActionStepDependency,
                 SuccessCriterion, Measurement, MeasurementChannel,
                 FeedbackChannel, ReviewEvent, ReviewEventInput, RevisionRule,
                 Communication, Evidence
```

**Multi-school tenancy**

`School` is the tenant root. Every entity in `school/` (except `School` itself) carries `school = ForeignKey(School, on_delete=PROTECT)`. `User` carries `school = ForeignKey(School)`. `Plan` carries `school = ForeignKey(School)`; plan-owned children inherit scope via their `plan` FK. `AccreditationCategory` and `AccreditationStandard` are global reference data — no school FK.

Unique constraints whose semantics are per-school (e.g. `Cycle.code`) compose with `school` in `Meta.constraints`.

**Plan as the root aggregate**

`Plan` carries scalar fields (`title`, `subject`, `rationale`, `provenance`, `current_state`, `desired_state`, `lifecycle`) and FKs (`author → settings.AUTH_USER_MODEL`, `cycle → Cycle`, `school → School`). Every plan-owned child uses `ForeignKey(Plan, on_delete=CASCADE)`.

**Polymorphic actor via `Assignment`**

One `Assignment` table covers both responsible and participant roles. Fields: `step → ActionStep`, `kind ∈ {responsible, participant}`, plus three nullable FKs (`department`, `role`, `stakeholder_group`) with a `CheckConstraint` requiring exactly one to be set.

**Timeline and RequiredResource as plan-owned child tables**

`Timeline` rows belong to `ActionStep` and carry `kind` (single / range / recurrence / indefinite) plus nullable `date`, `from_date`, `to_date`, `note` fields, with a `CheckConstraint` enforcing field presence per kind. `RequiredResource` rows belong to `ActionStep` with `kind` (time / financial / human / external / platform) and `note`.

**ActionStepDependency as a self-referential join**

Within-plan dependency: FK to another `ActionStep`. Cross-plan dependency: a `CharField` carrying `"<plan_id>:<step_id>"` validated with `RegexValidator(r"^\d+:\d+$")`. `CheckConstraint` requires exactly one of the two to be set; another constraint blocks self-loops. No `kind` field.

**SuccessCriterion, Measurement, MeasurementChannel**

`SuccessCriterion` belongs to `Plan` and carries the criterion text plus optional numeric-target fields (target value, unit, baseline). `Measurement` is a through-model linking one `SuccessCriterion` to one or more `FeedbackChannel`s via `MeasurementChannel`. `Meta.constraints` on `SuccessCriterion` includes a `CheckConstraint` enforcing target-fields-when-applicable: `target_value`, `target_unit`, `baseline` are non-null iff `verification_kind == 'target'`.

**ReviewEvent, ReviewEventInput, RevisionRule**

`ReviewEvent` belongs to `Plan`, carries `label`, `scheduled_date`, `scheduled_note`, `responsible` (Owner polymorphism Department-or-Role), and a M2M to `FeedbackChannel` through `ReviewEventInput`. `RevisionRule` belongs to `Plan` and carries `trigger → ReviewEvent`, `condition`, `action`.

**Communication and Evidence**

`Communication` belongs to `Plan`, has `audience → StakeholderGroup`, `channel`, `frequency → Frequency`, and a polymorphic `owner` (Department or Role). `Evidence` belongs to `Plan`, has `label`, polymorphic `owner`, `status` (planned / in-progress / produced / verified / archived), `retention_until`. `Evidence` links to `ActionStep` via a M2M on `ActionStep.evidence_artifacts`.

**`Owner` polymorphism pattern recurs**

Same two-nullable-FK + exactly-one CheckConstraint pattern appears on `Assignment` (department/role/stakeholder_group), `FeedbackChannel.owner`, `Communication.owner`, `Evidence.owner`, `Policy.evaluation_responsible`, `ReviewEvent.responsible`.

**Plan ↔ school-level entities as M2M**

`Plan` has M2M relations to `LearnerOutcome`, `MissionArea`, `AreaForImprovement`, `StakeholderGroup`, and to `Policy` twice (established, revised) with named `related_name`s. `Plan.accreditation_standards` is a M2M to `AccreditationStandard` through `PlanAccreditationStandard` (carries per-standard rationale).

**Plan ↔ Plan predecessor**

Self-referential M2M with `symmetrical=False` and a `through` model (`PlanPredecessor`) carrying `plan` and `predecessor`. `CheckConstraint` blocks self-loops.

**Lifecycle and PlanStatusTransition**

`Plan.lifecycle`: proposed / active / under-revision / closed (`TextChoices` in `plans/choices.py`). `PlanStatusTransition` rows record each lifecycle change with `plan`, `from_status`, `to_status`, `by_user`, `at` for audit trail.

**`Evidence.status`**: planned / in-progress / produced / verified / archived (`TextChoices` in `plans/choices.py`). Transitions are free (no `clean()` gate).

**Frequency and Owner**

`frequency` appears as `ForeignKey(school.Frequency, on_delete=PROTECT)` on `FeedbackChannel`, `Communication`, and `Policy.evaluation_frequency`. Curator-managed table; not a `TextChoices`.

**Phase 14 extension fields on Plan**

`Plan.theme` (translated), `Plan.framing_focus` (FK to `school.FramingVocabulary`), `Plan.secondary_framings` (M2M to `school.FramingVocabulary`), `Plan.priority_tier` (FK to `school.PriorityTier`), `Plan.priority_rationale` (translated, required when priority deviates from framing default), `Plan.student_impact_framing` (translated), `Plan.subject_kind` (FK to `school.SubjectKind`), `Plan.provenance`, `Plan.planning_method` (FK to `school.PlanningMethod`, required when `subject_kind.requires_planning_method`).
