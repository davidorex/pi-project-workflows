## Phase 2 — `school/` app — long-lived reference entities

**Verification at end:** admin can create `School`, `Cycle`, `Department`, `Role`, `StakeholderGroup`, `LearnerOutcome`, `MissionArea`, `AreaForImprovement`, `Frequency`, `Policy` records.
**Enables data backing for:** US-3 (Cycle), US-7 (LearnerOutcomes), US-8 (MissionAreas), US-9 (StakeholderGroups), US-10 (Policies), US-11 (AreasForImprovement).


### Dev steps

1. `uv run python manage.py startapp school`. Replace `models.py`/`admin.py` with packages. Create the full app scaffold:

   ```
   school/
   ├── apps.py
   ├── choices.py               # PolicyStatus, OrgKind if needed; Frequency may live here
   ├── constraints.py
   ├── querysets.py
   ├── managers.py
   ├── signals.py
   ├── services.py
   ├── selectors.py
   ├── validators.py
   ├── translation.py
   ├── models/
   │   ├── __init__.py
   │   ├── school.py            # School (tenant root)
   │   ├── cycle.py             # Cycle
   │   ├── org.py               # Department, Role
   │   ├── stakeholder.py       # StakeholderGroup
   │   ├── outcomes.py          # LearnerOutcome, MissionArea, AreaForImprovement
   │   ├── frequency.py         # Frequency (curator-managed cadence vocabulary)
   │   └── policy.py            # Policy (evaluation_frequency FK to Frequency,
   │                            #         evaluation_responsible polymorphic Owner)
   ├── admin/
   │   ├── __init__.py
   │   ├── school.py
   │   ├── cycle.py
   │   ├── org.py               # DepartmentAdmin, RoleAdmin
   │   ├── stakeholder.py
   │   ├── outcomes.py          # LearnerOutcomeAdmin, MissionAreaAdmin, AreaForImprovementAdmin
   │   ├── frequency.py
   │   ├── policy.py
   │   ├── filters.py
   │   └── actions.py
   ├── tests/
   │   ├── __init__.py
   │   ├── test_school.py
   │   ├── test_cycle.py
   │   ├── test_department.py
   │   ├── test_role.py
   │   ├── test_stakeholdergroup.py
   │   ├── test_learneroutcome.py
   │   ├── test_missionarea.py
   │   ├── test_areaforimprovement.py
   │   ├── test_frequency.py
   │   └── test_policy.py
   ├── locale/
   │   ├── en/LC_MESSAGES/.gitkeep
   │   └── zh_Hans/LC_MESSAGES/.gitkeep
   └── migrations/
   ```

   Each `tests/test_<model>.py` exercises its model: creation, declared field constraints (`Cycle.code` and `Frequency.code` per-school uniqueness), polymorphic predicates (`Policy.evaluation_responsible` CheckConstraint rejects both-null and both-set), modeltranslation-generated columns where applicable.

   `apps.py::SchoolConfig.verbose_name = _("School")`. Add `school` to `INSTALLED_APPS`. Signals registered in `apps.py::ready()`.

2. Per-file model contents. Every model in this app except `School` itself carries `school = ForeignKey(School, on_delete=PROTECT, related_name="<lowercase_plural>")` per the preamble. All field types, max_lengths, `on_delete`, `__str__`, `Meta.ordering` follow the preamble's Implementation conventions; only fields whose declaration deviates from those conventions are spelled out.

    - `school/models/school.py` → `School` (tenant root). Fields: `name` (translated), `slug` (unique).
    - `school/models/cycle.py` → `Cycle`. Fields: `code` (untranslated per i18n spec), `label` (translated), `starts_on`, `ends_on`. `Meta.constraints`: `UniqueConstraint(fields=["school", "code"])`.
    - `school/models/org.py` → `Department`, `Role`. Translated: `Department.label`, `Department.scope_summary`, `Role.label`. `Role.department` FK.
    - `school/models/stakeholder.py` → `StakeholderGroup`. Translated: `label`.
    - `school/models/outcomes.py` → `LearnerOutcome`, `MissionArea`, `AreaForImprovement`. Each: `code`, `label` (translated), `description` (translated).
    - `school/models/frequency.py` → `Frequency` (curator-managed cadence vocabulary). Fields: `code` (CharField unique-per-school), `label` (translated). Introduced here because `Policy.evaluation_frequency` needs it.
    - `school/models/policy.py` → `Policy`. Fields: `label` (translated), `notes` (translated), `evaluation_frequency` (`ForeignKey(school.Frequency, on_delete=PROTECT)`), `evaluation_responsible` (polymorphic Owner: two nullable FKs to `Department` or `Role` + exactly-one `CheckConstraint` per preamble pattern).

   `school/models/__init__.py` re-exports each.

3. `school/translation.py`:

   ```python
   from modeltranslation.translator import register, TranslationOptions
   from .models import (
       LearnerOutcome, MissionArea, AreaForImprovement,
       Policy, Department, StakeholderGroup,
   )

   @register(LearnerOutcome)
   class LearnerOutcomeT(TranslationOptions): fields = ("label",)

   @register(MissionArea)
   class MissionAreaT(TranslationOptions): fields = ("label",)

   @register(AreaForImprovement)
   class AreaForImprovementT(TranslationOptions): fields = ("label",)

   @register(Policy)
   class PolicyT(TranslationOptions): fields = ("label", "notes")

   @register(Department)
   class DepartmentT(TranslationOptions): fields = ("label", "scope_summary")

   @register(StakeholderGroup)
   class StakeholderGroupT(TranslationOptions): fields = ("label",)

   @register(Frequency)
   class FrequencyT(TranslationOptions): fields = ("label",)
   ```

4. Per-model admin files under `school/admin/` with `@admin.register(...)` decorators. `admin/__init__.py` imports each so registration fires. Admin defaults per the admin-package spec: `list_display`, `list_filter`, `search_fields`, `autocomplete_fields` for Department/Role FKs, `fieldsets` for any model >6 fields, fieldset headers wrapped in `_()`. Filter titles and action descriptions `_()`-wrapped.

5. `uv run python manage.py makemigrations school` and `migrate`.

6. Add the deferred `User.school` FK declared in Phase 1's preamble note (preamble § Implementation conventions, migration ordering). Edit `users/models/user.py` to add:

   ```python
   school = models.ForeignKey(
       "school.School",
       null=True,
       blank=True,
       on_delete=models.PROTECT,
       related_name="users",
   )
   ```

   Run `uv run python manage.py makemigrations users` then `uv run python manage.py migrate`. The new `users.0002_user_school` migration adds the `school_id` column to `users_user` as nullable; the existing superuser row gets `school = NULL` (will be backfilled if/when a School row exists that it should belong to).

### Layer A — permission groups seed

7. Data migration `school/migrations/000X_seed_permission_groups.py` creating Groups via `django.contrib.auth.models.Group`:
    - `school_curator`
    - `plan_author`
    - `read_only`

   The migration enumerates codenames by iterating installed-app models **at migration run time** — at Phase 2 time this means contrib + axes + guardian + users + school perms only. The intended final grant set (per the original design) is:

    - `school_curator` — `add_*`/`change_*`/`delete_*`/`view_*` on every model in `school.*` and `accreditation.*`; `view_*` on every model in `plans.*`.
    - `plan_author` — `add_*`/`change_*`/`delete_*`/`view_*` on every model in `plans.*`; `view_*` on every model in `school.*` and `accreditation.*`.
    - `read_only` — `view_*` on every model.

   Phase 2's migration grants only the school-scoped portion (and `view_*` for users/contrib/axes/guardian where applicable per role intent). Subsequent app-introducing phases (3 for accreditation, 5+ for plans) append app-specific perms to these groups via their own data migrations. Phase 15 (final validation) carries a backstop group-finalization migration if any phase's contribution was missed.

### Unresolved (no source in repo)

(none)
