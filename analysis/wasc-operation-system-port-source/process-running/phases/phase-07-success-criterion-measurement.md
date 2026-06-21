## Phase 7 — `plans/` — `SuccessCriterion`, `Measurement`, `FeedbackChannel`

**Verification at end:** admin can create `SuccessCriterion` rows on a Plan, set each criterion's `verification_kind` (inspection/judgment/target) and target fields when applicable, bind criteria to `FeedbackChannel`s via `Measurement` and `MeasurementChannel`.
**Enables:** US-13, US-14, US-19.


### Dev steps

1. `plans/models/feedback.py` → `FeedbackChannel`.

   `FeedbackChannel` named fields (per dev plan):
    - `plan` — `ForeignKey(Plan, on_delete=CASCADE)` (plan-owned per noun list).
    - `label` (translated, CharField).
    - `stakeholder` — `ForeignKey(school.StakeholderGroup)` (semantics: the source of feedback).
    - `owner` — polymorphic two-nullable-FK to `school.Department` or `school.Role` + exactly-one `CheckConstraint` per preamble pattern.
    - `frequency` — `ForeignKey(school.Frequency, on_delete=PROTECT)`.
    - `instrument` (translated, CharField).

2. `plans/models/verification.py` → `SuccessCriterion`, `Measurement`, `MeasurementChannel`.

   `SuccessCriterion` named fields (per dev plan + noun list):
    - `plan` — `ForeignKey(Plan, on_delete=CASCADE)`.
    - `text` (translated, TextField — the criterion statement).
    - `verification_kind` — `CharField(choices=VerificationKind.choices)` with values `inspection` / `judgment` / `target` (per dev plan).
    - `target_value` — `DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)`.
    - `target_unit` — `CharField(null=True, blank=True)`.
    - `baseline` — `DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)`.

   `Measurement` — through-model binding one `SuccessCriterion` to one or more `FeedbackChannel`s. Named fields (per noun list):
    - `success_criterion` — `ForeignKey(SuccessCriterion, on_delete=CASCADE)`.
    - `feedback_channels` — `ManyToManyField(FeedbackChannel, through="MeasurementChannel")`.

   `MeasurementChannel` — through-model for the `Measurement` ↔ `FeedbackChannel` M2M.
    - `measurement` — `ForeignKey(Measurement, on_delete=CASCADE)`.
    - `feedback_channel` — `ForeignKey(FeedbackChannel, on_delete=CASCADE)`.

3. Update `plans/models/__init__.py`:

   ```python
   from .feedback import FeedbackChannel
   from .verification import SuccessCriterion, Measurement, MeasurementChannel
   ```

4. Extend `plans/translation.py`:

   ```python
   @register(SuccessCriterion)
   class SuccessCriterionT(TranslationOptions):
       fields = ("text",)

   @register(FeedbackChannel)
   class FeedbackChannelT(TranslationOptions):
       fields = ("label", "instrument")
   ```

5. `plans/admin/feedback.py` (`FeedbackChannelAdmin`) and `plans/admin/verification.py` (`SuccessCriterionAdmin`, `MeasurementAdmin`). `Measurement` registered as `TabularInline` on `SuccessCriterionAdmin` so authors bind criteria to channels in one screen. `MeasurementChannel` registered as inline on `MeasurementAdmin` if separately visible, else inlined indirectly. Admin defaults per the admin-package spec.

6. `uv run python manage.py makemigrations plans`, then run migrate via the postgres superuser DSN (the `socrates` app role has DML grants only — no CREATE/ALTER on schema per `deploy/postgres-init/01-roles.sql`):

   ```bash
   DATABASE_URL="postgres://postgres:postgres@localhost:5433/school_improvement_plans" \
   uv run python manage.py migrate
   ```

### Layer A — extend permission groups with Phase-7 plans perms

7. Data migration `plans/migrations/0004_extend_permission_groups_phase_7.py` extends the three existing groups (`school_curator`, `plan_author`, `read_only`) with perms for the 4 new models introduced in this phase (`FeedbackChannel`, `SuccessCriterion`, `Measurement`, `MeasurementChannel`). Use the `_ensure_plans_permissions` + content-type iteration pattern from `plans/migrations/0002_extend_permission_groups_phase_6.py` (commit `35a2653`) — call `create_permissions(plans_config, using=alias, verbosity=0, interactive=False)` at the top of the forward function BEFORE reading any `Permission` row. Without that call, single-shot `migrate` on a fresh DB will silently grant 0 perms (per DISC-03-0519-A, commit `5be0231`).

    Grant set per group:
    - `school_curator` — `view_*` on `FeedbackChannel`, `SuccessCriterion`, `Measurement`, `MeasurementChannel` (curators see but author as `plan_author`).
    - `plan_author` — `add_*`/`change_*`/`delete_*`/`view_*` on `FeedbackChannel`, `SuccessCriterion`, `Measurement`, `MeasurementChannel` (full CRUD).
    - `read_only` — `view_*` on `FeedbackChannel`, `SuccessCriterion`, `Measurement`, `MeasurementChannel`.

    Migration is idempotent + reversible. Declares dependencies on the auto-generated Phase-7 model-introducing migration (`plans/0003_*`) and on `school/0002_seed_permission_groups`.

`SuccessCriterion.Meta.constraints` includes a `CheckConstraint` enforcing the target-fields-when-applicable rule: `target_value`, `target_unit`, `baseline` are non-null iff `verification_kind == 'target'`. Declarative, in the model, not in `clean()`.

### Tests (extend `plans/tests/`)

Add `plans/tests/test_feedbackchannel.py`, `test_successcriterion.py`, `test_measurement.py`, `test_measurementchannel.py`. Each exercises creation, FKs, the `SuccessCriterion` target-fields-when-applicable CheckConstraint (`target_value`/`target_unit`/`baseline` non-null iff `verification_kind == 'target'`), and the Owner polymorphism predicate on `FeedbackChannel.owner`.

### Unresolved (no source in repo)

(none)
