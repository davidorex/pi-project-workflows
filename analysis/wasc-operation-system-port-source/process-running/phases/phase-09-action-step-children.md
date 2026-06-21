## Phase 9 — `plans/` — Action step children

**Verification at end:** under each `ActionStep` in admin, author can add assignments (responsible + participants), timeline rows, required-resource rows, sub-steps, dependencies, and link plan-local evidence artifacts.
**Enables:** US-16b, US-16c, US-16d, US-16e, US-16f (depends on `Evidence` in Phase 10), US-16g, US-16h.


### Dev steps

1. Extend `plans/models/action.py` with `SubStep`, `Assignment`, `Timeline`, `RequiredResource`, `ActionStepDependency`.

   **`SubStep`** (per dev plan + i18n):
    - `action_step` — `ForeignKey(ActionStep, on_delete=CASCADE)`.
    - `description` (translated, TextField).
    - `order` — `IntegerField`. `Meta.ordering = ["order"]`.

   **`Assignment`** (per noun list):
    - `step` — `ForeignKey(ActionStep, on_delete=CASCADE)`.
    - `kind` — `CharField(choices=AssignmentKind.choices)` with values `responsible` / `participant`.
    - `department` — `ForeignKey(school.Department, null=True, blank=True, on_delete=PROTECT)`.
    - `role` — `ForeignKey(school.Role, null=True, blank=True, on_delete=PROTECT)`.
    - `stakeholder_group` — `ForeignKey(school.StakeholderGroup, null=True, blank=True, on_delete=PROTECT)`.
    - `Meta.constraints`: exactly-one `CheckConstraint` over (`department`, `role`, `stakeholder_group`) per preamble pattern.

   **`Timeline`** (per noun list):
    - `action_step` — `ForeignKey(ActionStep, on_delete=CASCADE)`.
    - `kind` — `CharField(choices=TimelineKind.choices)` with values `single` / `range` / `recurrence` / `indefinite`.
    - `date` — `DateField(null=True, blank=True)`.
    - `from_date` — `DateField(null=True, blank=True)`.
    - `to_date` — `DateField(null=True, blank=True)`.
    - `note` — `TextField(blank=True)`.
    - `Meta.constraints` includes a `CheckConstraint` enforcing field-presence per `kind`:
      - `single`: `date` required; `from_date`/`to_date` null.
      - `range`: `from_date` and `to_date` required; `date` null.
      - `recurrence`: `note` carries the recurrence as free text (e.g., "every Friday during Q2"); all date fields null.
      - `indefinite`: all date fields null.

      `Q()` predicate per preamble pattern over (`date`, `from_date`, `to_date`) presence by `kind`.

   **`RequiredResource`** (per noun list):
    - `action_step` — `ForeignKey(ActionStep, on_delete=CASCADE)`.
    - `kind` — `CharField(choices=ResourceKind.choices)` with values `time` / `financial` / `human` / `external` / `platform`.
    - `note` — `TextField(blank=True)`.

   **`ActionStepDependency`** (per noun list):
    - `action_step` — `ForeignKey(ActionStep, related_name="dependencies", on_delete=CASCADE)` (the dependent step).
    - `depends_on` — `ForeignKey(ActionStep, null=True, blank=True, related_name="dependents", on_delete=PROTECT)` (within-plan target).
    - `cross_plan_ref` — `CharField(max_length=64, null=True, blank=True, validators=[RegexValidator(r"^\d+:\d+$")])` carrying `"<plan_id>:<step_id>"` (cross-plan target).
    - `Meta.constraints`:
      - Exactly-one-of-target: `Q(depends_on__isnull=False, cross_plan_ref__isnull=True) | Q(depends_on__isnull=True, cross_plan_ref__isnull=False)`.
      - No-self-loop: `~Q(depends_on=F("action_step"))`.

   No `kind` field. The user story does not differentiate dependency kinds.

2. Update `plans/models/__init__.py`:

   ```python
   from .action import (
       ActionStep, SubStep, Assignment, Timeline,
       RequiredResource, ActionStepDependency,
   )
   ```

3. Extend `plans/translation.py`:

   ```python
   @register(SubStep)
   class SubStepT(TranslationOptions):
       fields = ("description",)
   ```

4. Extend `plans/admin/action.py`. Register `SubStep`, `Assignment`, `Timeline`, `RequiredResource`, `ActionStepDependency` as inlines on `ActionStepAdmin` (`TabularInline` or `StackedInline` per content density). Shared inlines that recur across multiple admins live in `plans/admin/inlines.py`; single-use inlines stay alongside `ActionStepAdmin` in `action.py` per the admin-package spec.

5. `uv run python manage.py makemigrations plans`, then run migrate via the postgres superuser DSN (the `socrates` app role has DML grants only — no CREATE/ALTER on schema per `deploy/postgres-init/01-roles.sql`):

   ```bash
   DATABASE_URL="postgres://postgres:postgres@localhost:5433/school_improvement_plans" \
   uv run python manage.py migrate
   ```

### Layer A — extend permission groups with Phase-9 plans perms

6. Data migration `plans/migrations/0008_extend_permission_groups_phase_9.py` extends the three existing groups (`school_curator`, `plan_author`, `read_only`) with perms for the 5 new models introduced in this phase (`SubStep`, `Assignment`, `Timeline`, `RequiredResource`, `ActionStepDependency`). Use the `_ensure_plans_permissions` + content-type iteration pattern from `plans/migrations/0006_extend_permission_groups_phase_8.py` (commit `cfeba91`) — call `create_permissions(plans_config, using=alias, verbosity=0, interactive=False)` at the top of the forward function BEFORE reading any `Permission` row. Without that call, single-shot `migrate` on a fresh DB will silently grant 0 perms (per DISC-03-0519-A, commit `5be0231`).

    Grant set per group:
    - `school_curator` — `view_*` on `SubStep`, `Assignment`, `Timeline`, `RequiredResource`, `ActionStepDependency` (curators see but author as `plan_author`).
    - `plan_author` — `add_*`/`change_*`/`delete_*`/`view_*` on `SubStep`, `Assignment`, `Timeline`, `RequiredResource`, `ActionStepDependency` (full CRUD).
    - `read_only` — `view_*` on `SubStep`, `Assignment`, `Timeline`, `RequiredResource`, `ActionStepDependency`.

    Migration is idempotent + reversible. Declares dependencies on the auto-generated Phase-9 model-introducing migration (`plans/0007_*`) and on `school/0002_seed_permission_groups`.

### Tests (extend `plans/tests/`)

Add `plans/tests/test_substep.py`, `test_assignment.py`, `test_timeline.py`, `test_requiredresource.py`, `test_actionstepdependency.py`. Each exercises creation and constraints: `Assignment` exactly-one-FK CheckConstraint, `Timeline` per-kind field-presence CheckConstraint, `ActionStepDependency` exactly-one-of (depends_on vs cross_plan_ref) + no-self-loop + cross_plan_ref regex validator.

### Unresolved (no source in repo)

(none)
