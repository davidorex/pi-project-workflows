## Phase 4 — `school/` — Consultant-managed vocabularies

**Verification at end:** admin can create rows in `PlanningMethod` (with ordered `PlanningStep` rows), `FramingVocabulary`, `SubjectKind`, `PriorityTier`, `Frequency`. `PlanningMethod.applicable_subject_kinds` M2M to `SubjectKind` editable. `FramingVocabulary.default_priority_tier` FK editable. `SubjectKind.requires_planning_method` boolean editable.
**Enables data backing for:** the WASC-consultant primitives that `Plan` extension fields point at (Phase 14).


### Dev steps

Every model below carries `school = ForeignKey(School, on_delete=PROTECT)` per multi-school.

(`Frequency` is introduced in Phase 2 because `Policy.evaluation_frequency` needs it. Phase 4 adds the remaining consultant vocabularies.)

1. `school/models/priority_tier.py` → `PriorityTier`. Fields: `code` (CharField unique-per-school), `label` (translated), `order` (IntegerField). `Meta.ordering = ["order"]`.

2. `school/models/subject_kind.py` → `SubjectKind`. Fields: `code` (CharField unique-per-school), `label` (translated), `requires_planning_method` (BooleanField, default False). When a `Plan.subject_kind` row has this flag set, the promotion gate requires `Plan.planning_method` to be set.

3. `school/models/framing.py` → `FramingVocabulary`. Fields: `code` (CharField unique-per-school), `label` (translated), `description` (translated), `default_priority_tier` (FK to `PriorityTier`, null=True, blank=True). When a `Plan.framing_focus` row has a `default_priority_tier` and the author picks a different `Plan.priority_tier`, `Plan.clean()` requires `priority_rationale`.

4. `school/models/planning_method.py` → `PlanningMethod`, `PlanningStep`.
    - `PlanningMethod`: `name` (translated), `rationale` (translated), `applicable_subject_kinds` (M2M to `SubjectKind`).
    - `PlanningStep`: `planning_method` FK, `order` (IntegerField), `template` (translated). `Meta.ordering = ["order"]`.

5. Update `school/models/__init__.py` to re-export `PriorityTier`, `SubjectKind`, `FramingVocabulary`, `PlanningMethod`, `PlanningStep`.

6. Extend `school/translation.py`:

   ```python
   @register(PriorityTier)
   class PriorityTierT(TranslationOptions): fields = ("label",)

   @register(SubjectKind)
   class SubjectKindT(TranslationOptions): fields = ("label",)

   @register(FramingVocabulary)
   class FramingVocabularyT(TranslationOptions): fields = ("label", "description")

   @register(PlanningMethod)
   class PlanningMethodT(TranslationOptions): fields = ("name", "rationale")

   @register(PlanningStep)
   class PlanningStepT(TranslationOptions): fields = ("template",)
   ```

7. Per-model admin files under `school/admin/` (one per vocabulary) with `@admin.register(...)`. `PlanningMethodAdmin` carries `PlanningStepInline` (TabularInline). `FramingVocabularyAdmin` exposes `default_priority_tier` as autocomplete. `SubjectKindAdmin` exposes `requires_planning_method` in list_display and list_filter. Admin defaults per the admin-package spec.

8. Extend `school/tests/` (existing package from Phase 2) with one `test_<model>.py` per new model: `test_prioritytier.py`, `test_subjectkind.py`, `test_framingvocabulary.py`, `test_planningmethod.py`, `test_planningstep.py`. Each exercises creation, per-school uniqueness on `code` where applicable, FK targets, and the `requires_planning_method` / `default_priority_tier` flags' wiring.

9. `uv run python manage.py makemigrations school`, then run migrate via the postgres superuser DSN (the `socrates` app role has DML grants only — no CREATE/ALTER on schema per `deploy/postgres-init/01-roles.sql`):

   ```bash
   DATABASE_URL="postgres://postgres:postgres@localhost:5433/school_improvement_plans" \
   uv run python manage.py migrate
   ```

### Layer A — extend permission groups with the new vocabulary perms

10. Data migration `school/migrations/000X_extend_permission_groups_phase_4.py` extends the three existing groups (`school_curator`, `plan_author`, `read_only`) with perms for the 5 new models introduced in this phase. Use the `_ensure_all_permissions(schema_editor)` + content-type iteration pattern established by school/0002 (per DISC-03-0519-A fix in commit `5be0231`) and accreditation/0002 — call `create_permissions(app_config, using=alias, verbosity=0, interactive=False)` at the top of the forward function BEFORE reading any `Permission` row. Without that call, single-shot `migrate` on a fresh DB will silently grant 0 perms.

    Grant set per group (mirrors school/0002's per-app intent):
    - `school_curator` — `add_*`/`change_*`/`delete_*`/`view_*` on `PriorityTier`, `SubjectKind`, `FramingVocabulary`, `PlanningMethod`, `PlanningStep`.
    - `plan_author` — `view_*` on the same five.
    - `read_only` — `view_*` on the same five.

    Migration is idempotent + reversible.

### Effects downstream

- `Plan.framing_focus`, `Plan.secondary_framings`, `Plan.subject_kind`, `Plan.priority_tier` (Phase 14) point at the tables introduced here.

### Unresolved (no source in repo)

(none)
