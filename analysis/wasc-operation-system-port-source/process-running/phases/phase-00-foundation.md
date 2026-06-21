## Phase 0 — Foundation

**Verification at end:** `uv run python manage.py runserver 8008` starts; `/admin/` reachable at `http://localhost:8008/admin/`; `/health/` returns 200.

**Dev server port:** 8008. Reflected in any Makefile target, docker-compose dev mapping, and developer documentation.

### Core dev steps

1. Create the Django project from scratch:
   - `mkdir -p school-improvement-plans && cd school-improvement-plans`
   - `uv init --bare` to scaffold the uv project (creates `pyproject.toml` with no main entry point).
   - `uv add 'django>=6.0,<7.0' django-modeltranslation 'psycopg[binary]' gunicorn` (runtime deps: Django, modeltranslation, postgres driver for the `DATABASE_URL` parser in step 13, gunicorn for the entrypoint in step 19).
   - `uv run django-admin startproject config .` to scaffold `manage.py` and `config/` (`__init__.py`, `settings.py`, `urls.py`, `wsgi.py`, `asgi.py`). The trailing `.` keeps the project at the current directory rather than nesting an extra level.

   No `core/` package and no LLM scaffolding. All subsequent files in this phase are authored from scratch.
2. Add the dev `[dependency-groups]` to `pyproject.toml` per PEP 735 (the toolchain group lands in step 8 below). Run `uv sync`. Commit `uv.lock`.
3. Replace single-file `config/settings.py` with `config/settings/{__init__,base,local,prod}.py`. `base.py` per the i18n spec, inlined:

   ```python
   from django.utils.translation import gettext_lazy as _
   LANGUAGE_CODE = "en"
   LANGUAGES = [("en", _("English")), ("zh-hans", _("Simplified Chinese"))]
   TIME_ZONE = "Asia/Shanghai"
   USE_I18N = True
   USE_TZ = True
   LOCALE_PATHS = [BASE_DIR / "locale"]
   ```

   `INSTALLED_APPS` ordering: `modeltranslation` **first**, then `django.contrib.admin`, then the rest. `MIDDLEWARE` ordering: `SessionMiddleware` → `LocaleMiddleware` → `CommonMiddleware` → rest.
4. `manage.py` defaults `DJANGO_SETTINGS_MODULE` to `config.settings.local`. `wsgi.py` and `asgi.py` default to `config.settings.prod`.
5. `config/urls.py`: wrap user-facing routes in `i18n_patterns(...)`; include `path('i18n/', include('django.conf.urls.i18n'))`; register `/health/` returning HTTP 200 for the container HEALTHCHECK target.
6. Create top-level `locale/` directory at `BASE_DIR/locale/`.
7. `.gitignore` entries: `*.pyc`, `__pycache__/`, `.env`, `db.sqlite3`, `*.mo`, `.venv/`, `staticfiles/`. Track `uv.lock`. Add `.env.example` listing every env var the app reads (no values).

### Layer A — local-dev hardening (Phase 0 portion)

8. Toolchain (`pyproject.toml` dev group): add `ruff`, `mypy`, `pytest`, `pytest-django`, `pytest-cov`, `pip-audit`. Configure `[tool.ruff]` (line-length, select, target-version) and `[tool.mypy]` (no `django-stubs` plugin — mypy runs against pure-Python code and treats Django bits as `Any`).
9. `.pre-commit-config.yaml`: ruff (lint + format), mypy, `detect-secrets`, `django-upgrade`, missing-migrations check, end-of-file fixer, trailing-whitespace, check-yaml, check-toml.
10. `.github/workflows/test.yml`: on push and PR, run `uv sync`, `uv run ruff check`, `uv run ruff format --check`, `uv run mypy`, `uv run pytest`, `uv run pip-audit`. Add `.github/dependabot.yml`.
11. `.dockerignore` excludes: `.git/`, `.venv/`, `*.sqlite3`, `__pycache__/`, `*.pyc`, `.env`, `logs/`, `staticfiles/`, `media/`, `node_modules/`, `dev-planning-knowledge-source/`, `web/`.
12. Security packages: add `django-csp`, `django-axes`, `django-guardian` to runtime deps. Wire into `INSTALLED_APPS`, `MIDDLEWARE`, `AUTHENTICATION_BACKENDS` per each project's docs. `django-axes`: 5 failed attempts, 1-hour cooldown, lockout by (username, IP). CSP starter for dev: `CSP_DEFAULT_SRC=("'self'",)` permissive. Admin is the stock `django.contrib.admin` site — no MFA gate at this phase. (2FA/MFA was previously wired via `django-two-factor-auth` + `django-otp`; removed because the local-dev enrollment loop produced confusing developer experience without delivering Phase 0 verification value. A multi-factor admin gate can be reintroduced via a different mechanism in a later phase if required.)
13. `base.py` hardening:
    - `LOGGING` dict with stdout/stderr handlers only (no file handler); request-log filter scrubs `password`, `csrfmiddlewaretoken`, `authorization`.
    - `DATA_UPLOAD_MAX_MEMORY_SIZE = 2_621_440` (2.5 MB), `FILE_UPLOAD_MAX_MEMORY_SIZE = 2_621_440`, `DATA_UPLOAD_MAX_NUMBER_FIELDS = 1000`.
    - `CONN_MAX_AGE = 60`.
    - Database `OPTIONS = {"connect_timeout": 5}`.
    - `if not DATABASE_URL: raise ImproperlyConfigured(...)` (no `DB_USER='postgres'` fallback).
    - Parse `DATABASE_URL` inline using `urllib.parse` (no `dj-database-url` dependency). Accept `postgres://` and `postgresql://` URLs of the form `<scheme>://<user>:<password>@<host>:<port>/<dbname>`. Schemes other than postgres raise `ImproperlyConfigured` — local dev runs against postgres per step 14, and prod is postgres.
14. Local postgres role separation: `docker-compose.yml` creates a `socrates` app role with limited grants; `postgres` superuser used only for migrations. Local dev runs against postgres (not sqlite) to match prod schema semantics. Database name: `school_improvement_plans`. Bind postgres to host port **5433** and redis to host port **6380** (compose-internal addresses unchanged at `postgres:5432` / `redis:6379`) to avoid collision with host-native postgres common on Mac dev laptops.
15. Repo docs at repo root: `SECURITY.md`, `THREAT-MODEL.md` (light), `CONTRIBUTING.md`.

### Layer B — prod-deploy shape declared, values at deploy time

16. `prod.py` declares every env-driven hardening setting:

    ```python
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_HSTS_SECONDS = int(os.environ.get("HSTS_SECONDS", 0))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = os.environ.get("HSTS_INCLUDE_SUBDOMAINS", "false").lower() == "true"
    SECURE_HSTS_PRELOAD = os.environ.get("HSTS_PRELOAD", "false").lower() == "true"
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    X_FRAME_OPTIONS = "DENY"
    SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
    CSRF_TRUSTED_ORIGINS = os.environ.get("CSRF_TRUSTED_ORIGINS", "").split(",")
    ADMINS = [(email, email) for email in os.environ.get("ADMIN_EMAILS", "").split(",") if email]
    MANAGERS = ADMINS
    ```

    Strict CSP redeclared in `prod.py` (tightening logic deferred to deploy phase via env).
17. `BACKUPS.md` documents: `pg_dump` schedule (daily incremental + weekly full); media rsync to off-host destination; retention aligning to `Evidence.retention_until`; quarterly restore-test cadence. No execution; document only.
18. Object-permission helper: install `django-guardian` and add `guardian.backends.ObjectPermissionBackend` to `AUTHENTICATION_BACKENDS`. No policy applied yet; hook exists for first policy that needs it.

### Layer C — container skeleton in shape now

19. Multi-stage `Dockerfile`:
    - **builder** stage: pinned uv; `uv sync --no-dev` into `/opt/venv`.
    - **runtime** stage: copies the venv and source; `RUN useradd -m -u 10001 app && chown -R app:app /app; USER app`; `HEALTHCHECK CMD curl -fsS http://localhost:8000/health/ || exit 1`; `EXPOSE 8000`; `ENTRYPOINT ["./entrypoint.sh"]`.
20. `entrypoint.sh`:
    - `pg_isready` poll against `${DB_HOST}:${DB_PORT}` (30s ceiling).
    - `python manage.py migrate --noinput`.
    - `python manage.py collectstatic --noinput`.
    - `exec gunicorn --bind 0.0.0.0:8000 --workers ${WEB_CONCURRENCY:-$((2*$(nproc)+1))} --worker-tmp-dir /dev/shm --graceful-timeout 30 --max-requests 1000 --max-requests-jitter 100 config.wsgi:application`.
21. `docker-compose.yml` and `docker-compose.prod.yml` pin `postgres:18.0` and `redis:7.4-alpine`.

### Unresolved (no source in repo)

(none)
