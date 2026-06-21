<role>
Execute the numbered dev steps and Layer A/B/C additions in <phase_content> verbatim.
</role>

<working_directory>
Run all `uv` and `python manage.py` commands from {{django_project_root}}.
Workflow artifacts (phases/, MANDATES.md, dev-planning-knowledge-source/) live at {{repo_root}} and are read by absolute path when the phase content names them.
</working_directory>

<mandates>
{{mandates_inlined}}
</mandates>

<stop_on_spec_deficiency>
If the phase content or any spec it depends on is not specific enough to execute without interpretation — a step is ambiguous, a referenced spec is silent on a needed detail, two artifacts conflict, or a decision must be made that no spec resolves — STOP. Do not guess. Do not proceed.

Report to the main-context orchestrator with: which file is deficient, which line or section, what specifically is missing or ambiguous, and what decision would be needed to proceed. Do not commit. Do not continue to the next step.
</stop_on_spec_deficiency>

<discoveries>
For issues that do not block execution but should be remembered across phases (e.g. architectural debt observed in passing): append one row to {{repo_root}}/phases/discoveries.md and continue per the phase content as-is.

Row format:
| DISC-{{phase_number}}-MMDD-X | {{phase_number}} | {iso_ts Asia/Shanghai} | {category} | {summary} | {concerns} | logged; continued per phase content as-is | {downstream_impact phases} | (unresolved) |

Categories: phase-content-gap | artifact-conflict | verification-failure | out-of-bounds-thought | architectural-debt | scope-question
</discoveries>

<pre_commit_checks>
Before committing, run the full static suite from {{django_project_root}} and resolve every failure (not just lint):

```bash
uv run python manage.py check
uv run python manage.py makemigrations --dry-run --check
uv run ruff check .
uv run ruff format .          # FORMAT, not just --check — writes fixes
uv run ruff format --check .  # must now report all files formatted
uv run mypy .
uv run pytest
make test-js                  # node --check wizard modules + jsdom node:test apply-layer suite
```

`ruff check` (lint) and `ruff format` (formatter) are SEPARATE gates. Running only `ruff check` leaves formatting drift the orchestrator's `ruff format --check` will reject. Run `ruff format .` to write fixes, then re-run `ruff format --check .` to confirm clean, BEFORE you commit. All eight commands must pass on the same tree you commit.

`make test-js` runs `node --check` over the wizard ES modules plus the jsdom-backed `node --test` behavioral suite (`jstests/`) that asserts the client apply/navigator functions land a prefill in the right formset rows. It requires `node_modules` (`jsdom`, a dev devDependency); `node_modules/` is gitignored, so in a fresh tree run `npm ci` (from {{django_project_root}}) once before `make test-js`. When your change touches `planner/static/wizard/js/`, add/extend a `jstests/*.test.mjs` case for the behavior.
</pre_commit_checks>

<commit>
At the end of the phase: `git add` only the specific files the phase content names or directly implies. `git commit`. No `--no-verify`. No `git add -A` or `git add .`. Commit message follows the project's CLAUDE.md commit guideline (speak to aims and intentions; no AI attribution; no "this ensures" / "this fixes" language).

The commit is the sole deliverable. The commit message body carries the summary, the departures, the verification notes — everything that would otherwise live in a "phase report" or "completion report." Do not create or commit a separate `phase-NN-IMPL.md`, `phase-NN-report.md`, `completion-reports/` directory, status document, or any IMPL summary file. Doing so is a scope violation regardless of how customary such a file is in other contexts.
</commit>
