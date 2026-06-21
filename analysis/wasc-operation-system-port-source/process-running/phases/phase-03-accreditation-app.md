## Phase 3 — `accreditation/` app

**Verification at end:** admin can create `AccreditationCategory` and `AccreditationStandard` records.
**Enables data backing for:** US-12.


### Dev steps

1. `uv run python manage.py startapp accreditation`. Replace `models.py`/`admin.py` with packages. Create the full app scaffold:

   ```
   accreditation/
   ├── apps.py
   ├── choices.py
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
   │   └── standard.py          # AccreditationCategory, AccreditationStandard
   ├── admin/
   │   ├── __init__.py
   │   └── standard.py
   ├── tests/
   │   ├── __init__.py
   │   ├── test_accreditationcategory.py
   │   └── test_accreditationstandard.py
   ├── locale/
   │   ├── en/LC_MESSAGES/.gitkeep
   │   └── zh_Hans/LC_MESSAGES/.gitkeep
   └── migrations/
   ```

   Each `tests/test_<model>.py` exercises its model: creation, declared fields, FK to `AccreditationCategory`.

   `apps.py::AccreditationConfig.verbose_name = _("Accreditation")`. Add `accreditation` to `INSTALLED_APPS`. Signals registered in `apps.py::ready()`.

2. `accreditation/models/standard.py` → `AccreditationCategory` (`code`, `label`, `order`) and `AccreditationStandard` (`code`, `category` FK to `AccreditationCategory`, `text`, `rubric`). Global reference data — no `school` FK. `AccreditationStandard.text` is untranslated per i18n spec (authoritative English). `accreditation/models/__init__.py` re-exports both.

3. `accreditation/translation.py`: stub (per i18n spec, no translated fields on this app's models).

4. `accreditation/admin/standard.py` with `@admin.register(...)` for both models; defaults per the admin-package spec.

5. `uv run python manage.py makemigrations accreditation`, then run migrate via the postgres superuser DSN (the `socrates` app role has DML grants only — no CREATE/ALTER on schema per `deploy/postgres-init/01-roles.sql`):

   ```bash
   DATABASE_URL="postgres://postgres:postgres@localhost:5433/school_improvement_plans" \
   uv run python manage.py migrate
   ```

### Layer A — extend permission groups with accreditation perms

6. Data migration `accreditation/migrations/000X_extend_permission_groups.py` extends the three groups seeded by Phase 2's Layer A:
    - `school_curator` — `add_*`/`change_*`/`delete_*`/`view_*` on every model in `accreditation.*`.
    - `plan_author` — `view_*` on every model in `accreditation.*`.
    - `read_only` — `view_*` on every model in `accreditation.*`.

   The migration enumerates `accreditation.*` ContentTypes at run time and grants accordingly. Idempotent + reversible.

### Unresolved (no source in repo)

(none)
