# Contributing

The Django app lives at `school-improvement-plans/`. Repo-root
artefacts (`MANDATES.md`, `phases/`, `dev-planning-knowledge-source/`,
`templates/`, `bin/`) are planning and workflow scaffolding.

## Local setup

```bash
cd school-improvement-plans
cp .env.example .env       # fill in DATABASE_URL at minimum
uv sync                    # creates .venv, installs runtime + dev deps
docker compose up -d postgres redis
uv run python manage.py migrate
uv run python manage.py runserver 8008
```

The dev server binds to port **8008**. Visit
`http://localhost:8008/admin/` after a superuser is created with
`uv run python manage.py createsuperuser`. `/health/` returns HTTP 200
and is the container HEALTHCHECK target.

## Toolchain

- `uv` for dependency and venv management. Lockfile (`uv.lock`)
  is tracked.
- `ruff` for lint + format (no black/isort/flake8).
- `mypy` for type checking of pure-Python code (services, selectors,
  validators); Django bits are typed as `Any` since the project does
  not run `django-stubs`.
- `pytest` + `pytest-django` for tests.
- `pre-commit` runs ruff, mypy, detect-secrets, django-upgrade,
  end-of-file and yaml/toml checks, and missing-migrations on every
  commit.

```bash
uv run ruff check
uv run ruff format
uv run mypy
uv run pytest
uv run pip-audit
```

## Workflow

Development proceeds phase-by-phase as defined in
`phases/phase-NN-*.md` at the repo root. The orchestrator invokes
IMPL and AUDIT subagents per phase; humans verify Part B before a
phase is marked complete. See repo-root `CLAUDE.md` for the full
workflow description.

## Commits

Commits follow the project commit guideline in repo-root `CLAUDE.md`:
specific, descriptive, measured. Speak to aims and intentions; avoid
"this fixes" / "this ensures" language. Do not include author credit
claims in commit messages.

## Security

See `SECURITY.md` for vulnerability reporting and secret-handling
policy. See `THREAT-MODEL.md` for the application's trust boundaries.
