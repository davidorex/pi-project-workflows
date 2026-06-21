# Phase-launch checklist (orchestrator operational procedure)

This file codifies the exact procedural sequence the main-context orchestrator executes for every phase launch. A post-compaction Claude reads this file (plus `CLAUDE.md`, memory, `ORCHESTRATOR-STATE.md`) and operates without re-discovering the pattern.

Derived from the 5 phase launches that landed Phases 0–5 (commits `1846640`, `a052b99`, `a35a373`, `7ffd882`, `3920959`, `5a2d145`) plus the four DISCs (`DISC-01-0519-A`, `DISC-02-0519-A`, `DISC-02-0519-B`, `DISC-03-0519-A`) that surfaced project-wide conventions.

---

## Sequence for launching phase NN

1. **Enter plan mode**. Write a Phase NN plan to the plan file. Cover: context (prior phase GO; current state); pre-flight amendments (see § Pre-flight checklist); orchestrator steps (render, invoke, verify, refresh); files involved; risks. Exit plan mode for approval.

2. **Apply pre-flight amendments** to `phases/phase-NN-{slug}.md` (see § Pre-flight checklist). Commit as a discrete `Phase N prep: ...` commit BEFORE rendering the IMPL prompt. Commit message names the gaps closed.

3. **Bring postgres up** if not already running: `cd school-improvement-plans && docker compose up -d postgres` and `until pg_isready -h localhost -p 5433 -U postgres -q; do sleep 1; done`. Volume preserved across phases (superuser + prior-phase data survive).

4. **Render the IMPL prompt**: `bin/render-phase-prompt.sh impl NN`. Read the rendered `tmp/phase-NN-impl-prompt.md` to confirm the inlined mandates, phase content, and the pre-flight amendments all appear correctly.

5. **Invoke the IMPL subagent** via the `Agent` tool, `subagent_type: "general-purpose"`. Prompt body = contents of `tmp/phase-NN-impl-prompt.md` (verbatim, every line including `<begin>` block). Description: "Phase N {short} IMPL".

6. **Inspect IMPL outcome**: `git log --oneline -3`, `git diff HEAD~1 --stat`. Capture commit hash. Note any departures or discoveries the IMPL surfaced.

7. **Run the verification suite** from `school-improvement-plans/`:
   - `uv run python manage.py check`
   - `uv run python manage.py makemigrations --dry-run --check`
   - `uv run ruff check .`
   - `uv run ruff format --check .`
   - `uv run mypy .`
   - `uv run pytest`
   - `make test-js`  (node --check wizard modules + the jsdom node:test apply-layer suite; requires `npm ci` once in a fresh tree — `node_modules/` is gitignored. DEC-31)

   All must exit clean. If any fail, see § Post-IMPL cleanup.

8. **Track the rendered prompt**: `git add tmp/phase-NN-impl-prompt.md && git commit -m "track Phase N rendered IMPL prompt under tmp/"`. The `.gitignore` intentionally does not exclude `/tmp/`; rendered prompts are tracked artifacts.

9. **Refresh `ORCHESTRATOR-STATE.md`** (see § State-file refresh template). Commit as a discrete `ORCHESTRATOR-STATE: record Phase N GO; queue Phase N+1` commit.

10. **Resolve any discoveries** the IMPL or subsequent verification surfaced. Each DISC row gets a `resolved_by` cell filled after resolution; commit as a discrete `mark DISC-NN-MMDD-X resolved by {sha}` commit.

11. **Pivot to Phase N+1**. Per the batched-verification convention (commit `6f3e6ed`), the per-phase gate is automated only — no human Part B between phases. Human evaluation + data population happen in a single post-Phase-15 pass.

---

## Pre-flight checklist (apply to every `phase-NN-{slug}.md` BEFORE rendering)

For each item, read the phase MD and amend if the item is missing or implicit:

1. **Explicit migrate DSN.** Every step that runs `manage.py migrate` MUST embed the postgres superuser DSN explicitly:
   ```bash
   DATABASE_URL="postgres://postgres:postgres@localhost:5433/school_improvement_plans" \
   uv run python manage.py migrate
   ```
   The `socrates` app role has DML grants only — no CREATE/ALTER on schema (per `deploy/postgres-init/01-roles.sql`). Without the explicit DSN, IMPL hits "must be owner of table" errors. (Source: surfaced during DISC-02-0519-B resolution; codified into Phase 3 + 4 prep.)

2. **Layer A group-extension migration with DISC-03 idiom.** Every phase that introduces new models in any app (new or existing) MUST add a data migration extending the three groups (`school_curator`, `plan_author`, `read_only`) with the new models' perms. The migration's forward function MUST call `create_permissions(app_config, using=alias, verbosity=0, interactive=False)` for the relevant app_config(s) BEFORE reading any `Permission` row. Pattern reference: `school/migrations/0002_seed_permission_groups.py` (post-`5be0231`) + `accreditation/migrations/0002_extend_permission_groups.py`. (Source: DISC-03-0519-A — `post_migrate` runs `create_permissions` only once at end of `manage.py migrate`; fresh-DB single-shot migrate would otherwise grant 0 perms.)

   **2a. The `school_admin` group MUST be granted EXPLICITLY per model — never via reliance on `school/0036` (DISC-19-0523-A).** `school/0036_seed_school_admin_group` granted `school_admin` by enumerating the **live app registry** at its run time; that is a ONE-TIME, build-order-dependent grant — it covers a model only on a database where 0036 runs *after* the model is in code (a fresh build), and **never re-grants** on a DB where 0036 already ran before the model was added. So **every new plans (or other school-scoped) model added after `school/0036` MUST set `school_admin`'s grant by explicit, frozen codename in its own group-extension migration**: **full CRUD** for an editable child (e.g. `plans/0032` for `ActionStepImpediment`), or **view-only + strip `add/change/delete`** for an append-only audit log (e.g. `plans/0027`, `plans/0029` for the status-transition logs). Do NOT rely on 0036's sweep for already-migrated DBs. Caveat: fresh-build perm tests CANNOT catch a missing `school_admin` grant (the test DB is always built fresh, so 0036's sweep masks the gap) — the guards are this convention + a periodic dev/prod reconciliation sweep (compare `school_admin`'s per-plans-model grants to the intended posture). Optional future structural cure: replace 0036's registry-sweep with an idempotent `post_migrate`/management-command reconciliation keyed off a declared posture map (build-order-independent, self-healing) — not required while this convention holds.

3. **Translation registrations match phase MD literally.** Every field the phase MD declares "translated" MUST be registered in the corresponding `<app>/translation.py` in the same commit as the model. Per-model `tests/test_<model>.py` MUST assert each `_meta.get_field("<field>_en")` and `<field>_zh_hans`. (Source: DISC-02-0519-B — Phase 2 IMPL silently omitted 5 of 6 declared registrations; user direction is to honor the MD as written; tests catch divergence.)

4. **Per-model test files** named in step 1's file tree per the file-decomposition spec. Every model class introduced gets a `tests/test_<lowercase_model>.py` listed in the tree, not just mentioned in prose. (Source: spec amendment commit `2d5ab9c`.)

5. **No "human Part B" steps in numbered steps**. The batched-verification convention defers per-phase browser verification to post-Phase-15. Phase MDs may keep `**Verification at end:**` description lines (developer-facing) but MUST NOT include numbered steps that pause for human action. `createsuperuser` is the historical exception (Phase 1 step 8 explicitly flagged human-interactive); no future phase should add similar steps.

---

## Post-IMPL cleanup patterns

If the verification suite fails on `ruff format --check`, the cause is typically auto-generated migration files that don't match project format conventions. Pattern observed 4× (commits `aa3eed8` covered Phase 4 + retroactive Phase 2 & Phase 3 migrations):

```bash
uv run ruff format <list of un-formatted files>
```

Then re-run `ruff format --check .` + `pytest` to confirm. Commit as `post-Phase-N ruff cleanup: format auto-generated migrations`.

If the IMPL surfaces a discovery requiring a code fix beyond its phase scope (e.g., DISC-03-0519-A's retroactive school/0002 fix), surface to user; do NOT auto-act per orchestrator-discipline rule "may not edit code an IMPL subagent produced unless the human explicitly directs the edit."

---

## State-file refresh template (for `ORCHESTRATOR-STATE.md`)

After each phase-launch sequence completes:

1. **Bump `**Last updated:**`** timestamp to current Asia/Shanghai ISO.
2. **Bump `**Last updater:**`** with a short description.
3. **Current position:**
   - Change active phase to NN.
   - Mark phase NN GO (automated gate green) per batched-verification convention.
   - Update prior-phase list.
   - Update Next-phase line to point at NN+1.
   - Update ahead-count from `git rev-list origin/main..HEAD --count`.
4. **Commit history this session** — append one row per new commit since last refresh.
5. **Last subagent invocations (most recent first)** — prepend the new IMPL run with its commit hash and a one-line outcome. Keep the prior 3–4 entries; trim older.
6. **Open decisions awaiting user direction** — remove items the phase resolved; add items the phase surfaced.
7. **Pending orchestrator actions** — rewrite as the literal next move (typically: Phase N+1 plan + launch).
8. **Known issues / discoveries** — update resolved DISCs to `**resolved**` with the resolving commit; append new DISCs.

---

## Project-wide conventions (distilled from resolved DISCs)

These conventions apply to every phase and to every subagent invocation:

- **Postgres role separation** (per `deploy/postgres-init/01-roles.sql`): `socrates` for runtime; `postgres` superuser only for migrations. Every `manage.py migrate` invocation in phase MDs uses the explicit superuser DSN.
- **No django-stubs** (per DISC-02-0519-A resolution): mypy runs without the plugin and treats Django bits as `Any`. Do not re-add django-stubs.
- **No 2FA stack** (per commit `80f46ae`): `django-two-factor-auth`, `django-otp`, `phonenumbers` are not in deps. Admin uses stock `django.contrib.admin`. Do not re-introduce 2FA without explicit user direction.
- **uv via PyPI in Dockerfile** (per DISC-01-0519-A resolution): builder stage uses `RUN pip install --no-cache-dir 'uv==0.9.11'`, not `COPY --from=ghcr.io/astral-sh/uv:0.9.11` (ghcr.io is structurally unreachable from this network).
- **Postgres role + DB names**: role `socrates`, password `socrates`, DB `school_improvement_plans`. Never reintroduce `wasc_planning` or `wasc-planning` strings anywhere in code/config.
- **`tmp/` rendered prompts tracked**: every `tmp/phase-NN-impl-prompt.md` is committed after the phase IMPL runs.
- **Discoveries are append-only**. `resolved_by` cells are filled when resolution lands. Rows are never deleted.
- **Pyrightconfig.json at repo root** points Pyright at `school-improvement-plans/.venv`; do not relocate.
- **Custom admin behavior gets an in-phase automated test; stock declarative admin config does not** (per the Phase 12 follow-up, commit `ecb28dc`). Declarative `ModelAdmin` attributes (`list_display`, `fieldsets`, `inlines`, `filter_horizontal`, etc.) are configuration — verified in the post-Phase-15 browser pass, no per-phase test. But any custom admin *behavior* — an `@admin.action`, an intermediate-page form, an overridden `save_model`/`get_queryset`/`response_change`, a custom form `clean()` — is code, and code is reachable in production only through the admin URL surface. Such behavior MUST get a `django.test.Client`-based test in the same phase, exercising the real admin URL (`reverse("admin:<app>_<model>_changelist")`, `force_login`) end-to-end, not by calling the underlying service directly. Rationale: a custom affordance verified only by the deferred (human, silently-skippable) browser pass is known fragility outside the automated gate; pulling it into pytest makes it non-skippable. The IMPL prompt's `<pre_commit_checks>` does not catch this — it must be specified in the phase MD's Tests section when the phase introduces custom admin behavior.

---

## What this file is NOT

- It is NOT the source of truth for phase content (that's `phases/phase-NN-{slug}.md`).
- It is NOT the source of truth for binding patterns (file-decomposition, admin-package, i18n, multi-school — those live in `phases/00-preamble.md`).
- It is NOT a per-phase progress log (that's `ORCHESTRATOR-STATE.md`).
- It is NOT a discovery log (that's `phases/discoveries.md`).

It is the operational procedure the orchestrator follows. Read it before launching a phase. Update it when the procedure evolves (with a `**Last updated:**` bump and a procedure-change note in the commit message).
