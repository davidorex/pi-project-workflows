# Convenience targets for local development.
#
# All commands run from this directory (school-improvement-plans/).
# Dev server port is 8008 — matches docker-compose dev mapping and
# the convention recorded in repo-root CLAUDE.md.

.PHONY: help sync run migrate makemigrations shell test test-js test-citability verify-slice lint format typecheck audit precommit collectstatic

PORT ?= 8008

# The wizard ES modules under behavioral test + node --check (FRONTEND-
# CONVENTIONS' "every module passes node --check" made a real gate step).
WIZARD_JS := planner/static/wizard/js/ai-assist.js \
	planner/static/wizard/js/dependents.js \
	planner/static/wizard/js/formsets.js \
	planner/static/wizard/js/kindgate.js \
	planner/static/wizard/js/main.js \
	planner/static/wizard/js/milestone-phasing.js \
	planner/static/wizard/js/pagination.js

help:
	@echo "Targets:"
	@echo "  sync             — uv sync (install runtime + dev deps)"
	@echo "  run              — start dev server on port $(PORT)"
	@echo "  migrate          — apply migrations"
	@echo "  makemigrations   — create migrations"
	@echo "  shell            — Django shell"
	@echo "  test             — pytest + the JS behavioral suite (test-js) + the citability guard (test-citability)"
	@echo "  test-js          — node --check the wizard modules + node --test jstests/"
	@echo "  test-citability  — verify-citability.py guard (DEC-56: no non-identity field of a checked catalogue section renders citably)"
	@echo "  verify-slice     — per-slice hard gate for the trio dev loop (SLICE=<key>; exit code is the sole verdict). TASK-058"
	@echo "  lint             — ruff check"
	@echo "  format           — ruff format"
	@echo "  typecheck        — mypy"
	@echo "  audit            — pip-audit"
	@echo "  precommit        — run all pre-commit hooks against all files"
	@echo "  collectstatic    — manage.py collectstatic"

sync:
	uv sync

run:
	uv run python manage.py runserver $(PORT)

migrate:
	uv run python manage.py migrate

makemigrations:
	uv run python manage.py makemigrations

shell:
	uv run python manage.py shell

test: test-js test-citability
	uv run pytest

# Citability guard (DEC-56 / TASK-057 / FGAP-047): for each spec, every
# grounding-catalogue section the parser structurally checks may render only
# its admissible identity field-path in a citable (non-parenthetical)
# position; any other (context) field of a checked section in citable
# position is a foot-gun the model can copy into a value the parser rejects.
# Self-contained: setup_django() defaults to config.settings.local whose
# DATABASE_URL setdefault points at the dev DB, so no env var is required.
# Folded into `test` so every aggregate gate run exercises it.
test-citability:
	uv run python ../prompt-workshop/dispatch/verify-citability.py

# Per-slice hard gate for the trio dev loop (TASK-058). Composes the EXISTING
# checks (mirrors gate-before-commit.sh + the `test` target): the slice's
# behavioral tests + the project soundness gate (ruff/mypy/full pytest/test-js)
# + context-validate (0 errors). The driver's EXIT CODE is the sole verdict —
# 0 iff every BLOCKING check passes. Non-blocking classes (cosmetic/style auto-
# fix, language-register WARN per DEC-53, flaky-on-bounded-re-run) are reported
# as structured stderr warnings and never change the exit code.
#
# Slice selection convention (config-free; -k, not a marker, so it works with
# the existing --strict-markers config): a slice's behavioral tests live in
# files named test_slice_<key>.py under any app's tests/ dir and are selected
# by `pytest -k "slice_<key>"`.
#   usage:  make verify-slice SLICE=trio-orchestrator
verify-slice:
	@SLICE="$(SLICE)" bash bin/verify-slice.sh

# JS gate: every wizard module must pass `node --check` (the FRONTEND-
# CONVENTIONS module-syntax rule, now a real step) AND the jsdom-backed
# behavioral suite under jstests/ (the apply-layer / navigator coverage).
# Folded into `test` + `precommit` so every aggregate gate run exercises it.
test-js:
	@for f in $(WIZARD_JS); do node --check $$f; done
	node --test 'jstests/**/*.test.mjs'

lint:
	uv run ruff check . ../prompt-workshop/dispatch
	uv run ruff format --check . ../prompt-workshop/dispatch

format:
	uv run ruff format

typecheck:
	uv run mypy .

audit:
	uv run pip-audit

precommit: test-js
	uv run pre-commit run --all-files

collectstatic:
	uv run python manage.py collectstatic --noinput
