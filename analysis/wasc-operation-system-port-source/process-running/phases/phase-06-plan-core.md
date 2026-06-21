## Phase 6 — `plans/` — `Plan` core + domain-alignment M2Ms

**Verification at end:** admin can create a `Plan` with title, cycle, current_state, desired_state, rationale, lifecycle; can set domain M2Ms (AFI, learner outcomes, mission areas, stakeholder impact, policies, accreditation standards with rationale).
**Enables:** US-1, US-2, US-3, US-4, US-5, US-6, US-7, US-8, US-9, US-10, US-11, US-12.


### Dev steps

1. `plans/models/plan.py` → `Plan`, `PlanPredecessor`, `PlanAccreditationStandard` (through-model with rationale).

   `Plan` scalar fields (per dev plan + noun list):
    - `id` (default Django PK).
    - `school` — `ForeignKey(school.School, on_delete=PROTECT)`.
    - `title` (translated).
    - `lifecycle` — `CharField` with `choices=Lifecycle.choices` from `plans/choices.py`; default `Lifecycle.PROPOSED`.
    - `cycle` — `ForeignKey(school.Cycle, on_delete=PROTECT)`.
    - `author` — `ForeignKey(settings.AUTH_USER_MODEL, on_delete=PROTECT)`. The author is a person; `Role` is a position. The user story step 1 ("Author opens the system and starts a new plan") fixes this reading.
    - `current_state` (translated, TextField).
    - `desired_state` (translated, TextField).
    - `rationale` (translated, TextField).
    - `slos_targeted_all` — `BooleanField(default=False)`. When true, all `LearnerOutcome` rows are targeted; supersedes the per-row M2M.
    - `mission_areas_targeted_all` — `BooleanField(default=False)`. Same pattern for `MissionArea`.

   `Plan` M2Ms (per dev plan):
    - `areas_for_improvement` → `school.AreaForImprovement`.
    - `accreditation_standards` → `accreditation.AccreditationStandard` through `PlanAccreditationStandard` (carries per-standard rationale).
    - `learner_outcomes_targeted` → `school.LearnerOutcome`.
    - `mission_areas_targeted` → `school.MissionArea`.
    - `stakeholder_impact` → `school.StakeholderGroup`.
    - `policies_established` → `school.Policy` with `related_name="established_by_plans"`.
    - `policies_revised` → `school.Policy` with `related_name="revised_by_plans"`.
    - `predecessors` → self, `symmetrical=False`, through `PlanPredecessor`.

   `PlanPredecessor` fields: `plan` → `Plan`, `predecessor` → `Plan`. `CheckConstraint(check=~Q(plan=F("predecessor")), name="planpredecessor_no_self_loop")`.

   `PlanAccreditationStandard` fields: `plan` → `Plan`, `accreditation_standard` → `accreditation.AccreditationStandard`, `rationale` (translated TextField).

   Update `plans/models/__init__.py`:

   ```python
   from .plan import Plan, PlanPredecessor, PlanAccreditationStandard
   ```

2. `plans/translation.py` adds:

   ```python
   from modeltranslation.translator import register, TranslationOptions
   from .models import Plan, PlanAccreditationStandard

   @register(Plan)
   class PlanT(TranslationOptions):
       fields = ("title", "current_state", "desired_state", "rationale")

   @register(PlanAccreditationStandard)
   class PlanAccreditationStandardT(TranslationOptions):
       fields = ("rationale",)
   ```

3. `plans/admin/plan.py` with fieldsets covering identity + domain alignment (per i18n spec example):

   ```python
   @admin.register(Plan)
   class PlanAdmin(admin.ModelAdmin):
       list_display = ("title", "cycle", "lifecycle")
       list_filter = ("lifecycle",)  # CycleFilter added when defined in admin/filters.py
       search_fields = ("title", "rationale")
       autocomplete_fields = ("cycle", "author")
       filter_horizontal = (
           "areas_for_improvement", "learner_outcomes_targeted",
           "mission_areas_targeted", "stakeholder_impact",
           "policies_established", "policies_revised",
       )
       save_as = True
       fieldsets = (
           (_("Identity"), {"fields": ("title", "author", "cycle")}),
           (_("Problem statement"), {"fields": ("current_state", "desired_state", "rationale")}),
           (_("Lifecycle"), {"fields": ("lifecycle",)}),
           (_("Domain alignment"), {"fields": (
               "areas_for_improvement", "learner_outcomes_targeted",
               "mission_areas_targeted", "stakeholder_impact",
               "policies_established", "policies_revised",
           )}),
       )
   ```

   `PlanAccreditationStandard` registered as `TabularInline` on `PlanAdmin` (through-model with rationale). `PlanPredecessor` registered as `TabularInline`.

4. `uv run python manage.py makemigrations plans`, then run migrate via the postgres superuser DSN (the `socrates` app role has DML grants only — no CREATE/ALTER on schema per `deploy/postgres-init/01-roles.sql`):

   ```bash
   DATABASE_URL="postgres://postgres:postgres@localhost:5433/school_improvement_plans" \
   uv run python manage.py migrate
   ```

### Layer A — extend permission groups with plans perms

5. Data migration `plans/migrations/0002_extend_permission_groups_phase_6.py` extends the three existing groups (`school_curator`, `plan_author`, `read_only`) with perms for the 3 new models introduced in this phase (`Plan`, `PlanPredecessor`, `PlanAccreditationStandard`). Use the `_ensure_all_permissions(schema_editor)` + content-type iteration pattern from `school/0002` (post-DISC-03-0519-A fix in commit `5be0231`) and `accreditation/0002` — call `create_permissions(plans_config, using=alias, verbosity=0, interactive=False)` at the top of the forward function BEFORE reading any `Permission` row. Without that call, single-shot `migrate` on a fresh DB will silently grant 0 perms.

    Grant set per group:
    - `school_curator` — `view_*` on `Plan`, `PlanPredecessor`, `PlanAccreditationStandard` (curators see plans but author them as `plan_author`).
    - `plan_author` — `add_*`/`change_*`/`delete_*`/`view_*` on `Plan`, `PlanPredecessor`, `PlanAccreditationStandard` (full CRUD; this is the role's primary responsibility per Phase 2's Layer A design intent).
    - `read_only` — `view_*` on `Plan`, `PlanPredecessor`, `PlanAccreditationStandard`.

    Migration is idempotent + reversible.

`PlanAccreditationStandard.rationale` is translated (school-authored prose), registered in `plans/translation.py` alongside `Plan` translations per step 2 above.

### Tests (extend `plans/tests/` from Phase 5)

Add `plans/tests/test_plan.py`, `test_planpredecessor.py`, `test_planaccreditationstandard.py`. Each exercises creation, declared FKs and M2Ms, `PlanPredecessor` no-self-loop CheckConstraint, `PlanAccreditationStandard` rationale-translation surface, `Plan.lifecycle` default of `Lifecycle.PROPOSED`.

### Unresolved (no source in repo)

(none)
