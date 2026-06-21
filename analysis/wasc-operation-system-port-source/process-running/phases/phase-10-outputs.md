## Phase 10 — `plans/` — Outputs (`Evidence`, `Communication`)

**Verification at end:** admin can create plan-local `Evidence` artifacts with owner, status, and `EvidenceStatus` lifecycle transitions; admin can create `Communication` records with audience, channel, frequency, owner; `Evidence` linkable from `ActionStep`.
**Enables:** US-16f, US-18.


### Dev steps

1. `plans/models/output.py` → `Communication`, `Evidence`.

   **`Communication`** (per noun list):
    - `plan` — `ForeignKey(Plan, on_delete=CASCADE)`.
    - `audience` — `ForeignKey(school.StakeholderGroup, on_delete=PROTECT)`.
    - `channel` (translated, CharField).
    - `frequency` — `ForeignKey(school.Frequency, on_delete=PROTECT)`.
    - `owner` — polymorphic two-nullable-FK to `school.Department` or `school.Role` + exactly-one `CheckConstraint` per preamble pattern.

   **`Evidence`** (per noun list):
    - `plan` — `ForeignKey(Plan, on_delete=CASCADE)`.
    - `label` (translated, CharField).
    - `owner` — polymorphic two-nullable-FK to `school.Department` or `school.Role` + exactly-one `CheckConstraint` per preamble pattern.
    - `status` — `CharField(choices=EvidenceStatus.choices)` with values `planned` / `in-progress` / `produced` / `verified` / `archived`; default `planned`. Transitions are free (no `clean()` enforcement); authors manage the lifecycle.
    - `retention_until` — `DateField(null=True, blank=True)`. Referenced by `BACKUPS.md` retention policy.

   `Evidence` linked from `ActionStep` via M2M added in `action.py`: `ActionStep.evidence_artifacts = ManyToManyField("plans.Evidence", related_name="action_steps", blank=True)`. Exposed via `filter_horizontal` on `ActionStepAdmin`. No through-model.

2. Update `plans/models/__init__.py`:

   ```python
   from .output import Communication, Evidence
   ```

3. Extend `plans/translation.py`:

   ```python
   @register(Communication)
   class CommunicationT(TranslationOptions):
       fields = ("channel",)

   @register(Evidence)
   class EvidenceT(TranslationOptions):
       fields = ("label",)
   ```

4. `plans/admin/output.py` → `CommunicationAdmin`, `EvidenceAdmin`. Admin defaults per the admin-package spec. `EvidenceAdmin` `list_filter` includes `status`. Admin permits free transitions between any `EvidenceStatus` values; the lifecycle is descriptive, not gated.

5. Extend `plans/admin/action.py` to expose the `Evidence` M2M on `ActionStepAdmin`: `filter_horizontal = ("evidence_artifacts",)` (or an inline if a through-model is added).

6. `uv run python manage.py makemigrations plans`, then run migrate via the postgres superuser DSN (the `socrates` app role has DML grants only — no CREATE/ALTER on schema per `deploy/postgres-init/01-roles.sql`):

   ```bash
   DATABASE_URL="postgres://postgres:postgres@localhost:5433/school_improvement_plans" \
   uv run python manage.py migrate
   ```

### Layer A — extend permission groups with Phase-10 plans perms

7. Data migration `plans/migrations/0011_extend_permission_groups_phase_10.py` extends the three existing groups (`school_curator`, `plan_author`, `read_only`) with perms for the 2 new models introduced in this phase (`Communication`, `Evidence`). Use the `_ensure_plans_permissions` + content-type iteration pattern from `plans/migrations/0008_extend_permission_groups_phase_9.py` (commit `f5a02ce`) — call `create_permissions(plans_config, using=alias, verbosity=0, interactive=False)` at the top of the forward function BEFORE reading any `Permission` row. Without that call, single-shot `migrate` on a fresh DB will silently grant 0 perms (per DISC-03-0519-A, commit `5be0231`).

    Grant set per group:
    - `school_curator` — `view_*` on `Communication`, `Evidence` (curators see but author as `plan_author`).
    - `plan_author` — `add_*`/`change_*`/`delete_*`/`view_*` on `Communication`, `Evidence` (full CRUD).
    - `read_only` — `view_*` on `Communication`, `Evidence`.

    Migration is idempotent + reversible. Declares dependencies on the auto-generated Phase-10 model-introducing migration (`plans/0010_*`) and on `school/0002_seed_permission_groups`.

### Tests (extend `plans/tests/`)

Add `plans/tests/test_communication.py` and `test_evidence.py`. Each exercises creation, Owner polymorphism CheckConstraint on `owner` (department XOR role), `Evidence.status` default of `EvidenceStatus.PLANNED`, the `ActionStep.evidence_artifacts` M2M linkage.

### Unresolved (no source in repo)

(none)
