## Phase 8 — `plans/` — `Phase` and `ActionStep` skeleton

**Verification at end:** admin can create `Phase` rows on a Plan and `ActionStep` rows assigned to phases.
**Enables:** US-15, US-17, US-16a.


### Dev steps

1. `plans/models/phase.py` → `Phase`.

   `Phase` fields:
    - `plan` — `ForeignKey(Plan, on_delete=CASCADE)`.
    - `label` (translated, CharField).
    - `order` — `IntegerField`. `Meta.ordering = ["order"]`.

2. `plans/models/action.py` — at this phase, **only** `ActionStep` (child models deferred to Phase 9).

   `ActionStep` fields:
    - `plan` — `ForeignKey(Plan, on_delete=CASCADE)`.
    - `phase` — `ForeignKey(Phase, null=True, blank=True, on_delete=SET_NULL)` — an action step may exist without being grouped into a phase per US-17 ("optionally groups").
    - `description` (translated, TextField).
    - `order` — `IntegerField`. `Meta.ordering = ["order"]`.

3. Update `plans/models/__init__.py`:

   ```python
   from .phase import Phase
   from .action import ActionStep
   ```

4. Extend `plans/translation.py`:

   ```python
   @register(Phase)
   class PhaseT(TranslationOptions):
       fields = ("label",)

   @register(ActionStep)
   class ActionStepT(TranslationOptions):
       fields = ("description",)
   ```

5. `plans/admin/phase.py` → `PhaseAdmin`. `plans/admin/action.py` → `ActionStepAdmin` (skeleton; no inlines until Phase 9). Both use `@admin.register(...)`. Admin defaults per the admin-package spec. `raw_id_fields = ("plan",)` (high-cardinality).

6. `uv run python manage.py makemigrations plans`, then run migrate via the postgres superuser DSN (the `socrates` app role has DML grants only — no CREATE/ALTER on schema per `deploy/postgres-init/01-roles.sql`):

   ```bash
   DATABASE_URL="postgres://postgres:postgres@localhost:5433/school_improvement_plans" \
   uv run python manage.py migrate
   ```

### Layer A — extend permission groups with Phase-8 plans perms

7. Data migration `plans/migrations/0006_extend_permission_groups_phase_8.py` extends the three existing groups (`school_curator`, `plan_author`, `read_only`) with perms for the 2 new models introduced in this phase (`Phase`, `ActionStep`). Use the `_ensure_plans_permissions` + content-type iteration pattern from `plans/migrations/0004_extend_permission_groups_phase_7.py` (commit `56b2b38`) — call `create_permissions(plans_config, using=alias, verbosity=0, interactive=False)` at the top of the forward function BEFORE reading any `Permission` row. Without that call, single-shot `migrate` on a fresh DB will silently grant 0 perms (per DISC-03-0519-A, commit `5be0231`).

    Grant set per group:
    - `school_curator` — `view_*` on `Phase`, `ActionStep` (curators see but author as `plan_author`).
    - `plan_author` — `add_*`/`change_*`/`delete_*`/`view_*` on `Phase`, `ActionStep` (full CRUD).
    - `read_only` — `view_*` on `Phase`, `ActionStep`.

    Migration is idempotent + reversible. Declares dependencies on the auto-generated Phase-8 model-introducing migration (`plans/0005_*`) and on `school/0002_seed_permission_groups`.

### Tests (extend `plans/tests/`)

Add `plans/tests/test_phase.py` and `test_actionstep.py`. Each exercises creation, `Phase.plan` FK CASCADE, `ActionStep.phase` nullable FK with SET_NULL, `Meta.ordering` by `order`.

### Unresolved (no source in repo)

(none)
