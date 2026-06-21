## Phase 1 — Custom User (must precede first project-app migrate)

**Verification at end:** superuser created and can log into admin; `django-axes` lockout fires after 5 failed attempts.
**Enables:** US-1 (auth half; the plan-instantiation half lands in Phase 6).

**Pre-flight (orchestrator-side, not an IMPL step):** the postgres DB must be reset to empty before this phase runs. Phase 0's verification ran `migrate`, which applied `auth.0001_initial` and created the stock `auth_user` table. Switching `AUTH_USER_MODEL` to `users.User` after `auth_user` exists is the canonical Django footgun and raises a migration error. The orchestrator drops the postgres volume (`docker compose down -v && docker compose up -d postgres`) before invoking IMPL so this phase's `makemigrations users && migrate` runs against an empty DB with `users.User` registered before any auth migration applies.

### Dev steps

1. `uv run python manage.py startapp users`. Replace `users/models.py` with a `users/models/` package; replace `users/admin.py` with a `users/admin/` package. Create the full app scaffold per the file-decomposition pattern:

   ```
   users/
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
   │   └── user.py
   ├── admin/
   │   ├── __init__.py
   │   └── user.py
   ├── tests/
   │   ├── __init__.py
   │   └── test_user.py
   ├── locale/
   │   ├── en/LC_MESSAGES/.gitkeep
   │   └── zh_Hans/LC_MESSAGES/.gitkeep
   └── migrations/
   ```

   Empty stubs acceptable for every adjacent file EXCEPT `managers.py` (step 3 below) and `tests/test_user.py` (must exercise the User model — creation via UserManager.create_user / create_superuser, email-as-username uniqueness, USERNAME_FIELD wiring). `apps.py::UsersConfig.verbose_name = _("Users")`. Signals (if any) registered in `apps.py::ready()`.

2. `users/models/user.py`:

   ```python
   from django.contrib.auth.models import AbstractUser
   from django.db import models
   from django.utils.translation import gettext_lazy as _

   class User(AbstractUser):
       email = models.EmailField(_("email address"), unique=True)
       USERNAME_FIELD = "email"
       REQUIRED_FIELDS = []
       # User.school FK added in Phase 2 after School model exists
   ```

3. `users/managers.py` carries a real `UserManager(BaseUserManager)`, not a stub. `create_user(email, password=None, **extra_fields)` and `create_superuser(email, password=None, **extra_fields)` take email instead of username. Set `is_staff=True`, `is_superuser=True` on the superuser flow. Wire the manager onto `User.objects` in `users/models/user.py`.

4. `users/admin/user.py`: `UserAdmin` subclass registered via `@admin.register(User)`. Best-of-breed defaults per the admin-package pattern (preamble): `list_display`, `list_filter`, `search_fields`, `readonly_fields` (for `last_login`, `date_joined`).

5. `users/translation.py`: stub (no translated user fields named in the i18n preamble pattern).

6. `config/settings/base.py`: set `AUTH_USER_MODEL = "users.User"`. Add `users` to `INSTALLED_APPS` (first project app, ordered after `modeltranslation` and `django.contrib.admin` per the i18n preamble pattern).

7. `uv run python manage.py makemigrations users` then `uv run python manage.py migrate`. With the orchestrator-side DB reset in place (see pre-flight above), this runs all migrations from scratch with `users.User` already registered, so Django's contrib + axes + guardian migrations point at `users.User` from the start. No `auth_user` table is created.

8. **Human-interactive** (IMPL skips this step; orchestrator surfaces to human): `uv run python manage.py createsuperuser` — the human enters email + password at the prompts.

### Layer A additions

9. Verify `django-axes` lockout: deliberately fail login 5 times; confirm lockout response.

### Unresolved (no source in repo)

(none)
