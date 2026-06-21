# Runbook — T6 / TASK-043: the fresh full 14-spec run + result evaluation

Source-verified execution procedure for the capstone run (TASK-043): a fresh full
`workshop-run-plan-sequence` run over `.workshopping` against the Chiway dev DB, then
the whole-draft evaluation that closes TASK-034 (C2) and re-assesses TASK-026.
Every command/env/precondition below is cited to current source; items the
establishing audit could not confirm are marked **CONFIRM ON FIRST RUN**.

## Preconditions (verify before launch)
1. **Render-parity green 14/14** — `verify-render-parity.py` (below) prints `GATE: 14/14`
   + both cross-checks PASS, exit 0. This is the DEC-0040 predicate that justifies
   routing rendering through `.workshopping`; re-run it after ANY snippet/fragment/spec
   body edit. (`prompt-workshop/dispatch/verify-render-parity.py:170-173`.)
2. **Chiway dev Postgres up** on `localhost:5433`; `DATABASE_URL` exported (see env).
3. **`pi` on PATH + a reachable model backend** — the 14 `call_*` steps spawn
   `pi --mode json` (`run_workflow.mjs` pre-flights `pi --version` and aborts naming the
   step if absent; backend reachability is only provable by the run). (SURFACE §3.4.) The
   model/provider is pi's `~/.pi/agent/settings.json` default (no `model:` in the YAML or
   agent) — confirm it is the model you intend BEFORE launch (see "As-practiced" below;
   the clean milestone runs used `deepseek-v4-pro`).
4. **venv `python` on PATH** — the command steps spawn a non-interactive `sh -c` that
   does NOT see the `python=python3` alias and bare `python` is absent here; without the
   venv bin on PATH the first render step fails `exit 127: python: command not found`
   (WF-12). Launch under `uv run` from `school-improvement-plans/` (the as-practiced
   wrapper; equivalently, prepend `school-improvement-plans/.venv/bin` to PATH).

## Environment
- `DATABASE_URL=postgres://postgres:postgres@localhost:5433/school_improvement_plans`
  (the dev DSN; `dispatch/README.md:105`). `_workshop.py:38` sets
  `DJANGO_SETTINGS_MODULE=config.settings.local`; tenant `chiway-repton-xiamen`.
- `PATH` includes `school-improvement-plans/.venv/bin` (WF-12).
- `PI_WORKFLOWS_DIST` — leave unset; defaults to
  `/Users/david/Projects/workflowsPiExtension/packages/pi-workflows/dist`
  (`run_workflow.mjs:73-75`).
- **CONFIRM ON FIRST RUN — pi-workflows version**: the runner contract (SURFACE doc)
  was written against `@davidorex/pi-workflows@0.29.0`; live is `0.31.0`. The WF-13
  stdout-cap disk-read mitigation has not been re-validated on 0.31.0. The run is the
  probe; if a `call_*` step fails on output, see Footguns.
- **RESOLVED (forensic, 2026-06-14) — exact launch wrapper**: prior runs used
  `uv run node …` from `school-improvement-plans/` (claude-history session `d7310007`,
  adopted 2026-06-06 ~15:04 UTC after a `/tmp/pyshim` symlink and an explicit `PATH=`
  prepend were both tried and dropped). That is the wrapper in the run command above —
  no longer an open question.

## The run command (the AS-PRACTICED form, from the Django root)
Confirmed from the session record (claude-history session `d7310007`; this wrapper was
adopted 2026-06-06 ~15:04 UTC and re-used through the first complete+clean run): launch
with `uv run node` from `school-improvement-plans/` so the command steps' `sh -c`
inherits the venv `python`.
```bash
cd /Users/david/Projects/wasc-school-wide-improvement-plan/school-improvement-plans
OUT_DIR="$(mktemp -d)"
DATABASE_URL="postgres://postgres:postgres@localhost:5433/school_improvement_plans" \
  uv run node ../prompt-workshop/dispatch/run_workflow.mjs run workshop-run-plan-sequence \
  --input "{\"seed\":\"Improve SLO usage across the school\",\"out_dir\":\"$OUT_DIR\"}" \
  --yes --fresh > /tmp/wf-run.log 2>&1   # run_in_background; each run ~5–8 min
```
- **Process cwd is `school-improvement-plans/`** (the Django root); the runner's `--cwd`
  still defaults to the **repo root** (where the YAML's repo-root-relative `python …`
  command steps resolve), so `--cwd` is omitted. The runner is reached as
  `../prompt-workshop/dispatch/run_workflow.mjs`.
- `uv run` is what puts `.venv/bin` on PATH for the spawned command steps (WF-12). The
  session empirically rejected a `/tmp/pyshim` symlink and an explicit
  `PATH=$VENV_BIN:$PATH` prepend before settling on `uv run node` (both forms work; this
  is the one actually adopted).
- `--fresh` **mandatory** (WF-14): without it `run` auto-resumes a stale incomplete run
  and replays old render steps, so a fixed corpus looks unfixed.
- `--yes` **mandatory** in a no-TTY Bash call: `run` is gated and refuses (exit 1) without
  it (`run_workflow.mjs:241-250`).
- `--input` `seed` required (`workflow.yaml:5-12`); `out_dir` = a `mktemp -d`, to keep the
  per-spec `draft-after-*.json` out of the repo root. Add `--json` for the
  `{ok,op,output:<WorkflowResult>}` envelope.
- Issue it `run_in_background` and tail the /tmp log (the as-practiced pattern from
  2026-06-07 on).

## Success signal
- 42 steps (14 specs × render→call→apply), each `status: completed`; top-level
  `WorkflowResult.status == "completed"` → exit 0 (`run_workflow.mjs:478`).
- Run dir: `.workflows/runs/workshop-run-plan-sequence/runs/<run-id>/`
  (`state.json`/`spec.json`/`outputs/`/`sessions/`/`metrics.json`).
- **Final assembled draft: `<out_dir>/draft-after-propose-review-loop.json`** (the last
  apply's single-writer output; `apply_from_substrate.py:182-187`). NOT
  `prompt-workshop/outputs/current-draft.json` — the substrate path never writes that.

## Footguns + recovery
- A `call_*` step failing "output schema but no valid JSON output was produced" (WF-15)
  is the 10MB `pi --mode json` stdout-cap (WF-13/16): bypassed by each step's
  `output.schema` (disk-read of `<runDir>/outputs/<step>.json`) + a `retry`
  (`maxAttempts:4`) block (`workflow.yaml`). Recovery: re-run with `--fresh` (variance
  usually clears it); re-running is cheap vs root-causing a flaky agent turn.
- Command steps must emit pure JSON on stdout — both bridges wrap Django boot in
  `redirect_stdout(sys.stderr)` (`render_from_substrate.py:76`, `apply_from_substrate.py:86`).
- A hard parse reject exits 1; a structural self-check failure exits 3
  (`apply_from_substrate.py:163-170`) — both abort at the offending spec, named on stderr.

## Result evaluation (what makes TASK-043 done)
```bash
cd /Users/david/Projects/wasc-school-wide-improvement-plan/school-improvement-plans
DATABASE_URL="postgres://postgres:postgres@localhost:5433/school_improvement_plans" \
  uv run python ../prompt-workshop/dispatch/check_draft.py --strict \
  --draft "$OUT_DIR/draft-after-propose-review-loop.json"
```
Under `--strict` the structural gate (`check_draft.py:1012-1029`) is checks 3–8 =
TASK-043's "pass by construction" criteria: owner distribution (>1 owner, none >50%);
coverage (every learner-outcome / improvement-area row targeted, gapped, or
prose-mentioned); review cadence (≥4 checkpoints, earliest before 1 Dec); three-view
(student/staff/parent each a channel-or-gap); bilingual (staff-English + student-bilingual
each a channel-or-gap); decision-request well-formedness. Checks 1–2 (language) are
WARN-only (DEC-53). The universe + cycle year come live from `build_grounding` (needs DB).
Without `--strict` it is report-only (exit 0) — a footgun if used as the gate.

**TASK-043 done = workflow exit 0 (42/42) AND `check_draft.py --strict` exit 0 on the
final draft → closes TASK-034 (C2) + re-assesses TASK-026.**

NOTE (forensic, 2026-06-14): this `check_draft.py --strict` pairing is the **new** T6
contract, NOT how the historical runs were judged. `check_draft.py` was built later
(TASK-036, 2026-06-09); the 2026-06-07 milestone runs were judged from the run output
(42/42, `status: completed`, exit 0) + reading and COUNTING the assembled
`draft-after-propose-review-loop.json` (milestones / success-criteria / action-steps /
channels / standards / communications / review-events / revision-rules + the soft-flag
count — 24 on the first complete run, 118 on the first clean run). No `check_draft.py
--strict` run against an actual full-sequence final draft exists in the record — **T6 is
the first time this gate is applied to a real run.**

## Related corpus-integrity gate (precondition #1 command)
```bash
cd /Users/david/Projects/wasc-school-wide-improvement-plan/school-improvement-plans
DATABASE_URL="postgres://postgres:postgres@localhost:5433/school_improvement_plans" \
  uv run python ../prompt-workshop/dispatch/verify-render-parity.py   # GATE: 14/14, exit 0
```

## As-practiced run history (forensic — claude-history session `d7310007`)
- **The full 14-spec run path is `run_workflow.mjs` EXCLUSIVELY.** `sequence.py` was never
  used for a live full run — every appearance in the record is `--help` / grep / lint. Do
  not treat `sequence.py` as the run path.
- **Dispatch:** the 14 `call_*` steps reach a model by the runner spawning `pi --mode json`
  (NOT the Claude Code Agent/Task tool), each via the `workshop-json-responder` agent
  (`.pi/agents/workshop-json-responder.agent.yaml`; `tools: [read, write]`, `output.format:
  json`) whose prompt makes **writing the JSON to the engine-named output path the
  mandatory first step** (this drives the WF-13 disk-read bypass), plus a per-step `retry
  maxAttempts:4` block (FGAP-022).
- **Model/backend (forensic, from each `<run-id>/sessions/*.jsonl` `model_change` record).**
  The workflow YAML and `workshop-json-responder.agent.yaml` carry no `model:`, so it falls
  through `step.model ?? agentSpec.model ?? by_role ?? default` to **pi's own default in
  `~/.pi/agent/settings.json`** (provider keys in `~/.pi/agent/auth.json`). The runs used:
  **`openai/gpt-5.5` via openrouter** through 2026-06-07 ~09:23 (incl. the first COMPLETE
  run `…092307-0c56`), then a default cutover to **`deepseek-v4-pro` via deepseek**
  (`thinkingLevel: high`) from 2026-06-07 11:28 on — so the first COMPLETE+CLEAN run
  (`…163010-df5f`) and the 06-08 runs were produced by **`deepseek-v4-pro`**, uniform
  within each run. T6's model is whatever `settings.json` default is at run time (currently
  deepseek-v4-pro); set it deliberately before the capstone run.
- **Milestone runs (2026-06-07):** first COMPLETE (42/42) = run
  `workshop-run-plan-sequence-…092307-0c56` → commit `1e2dd0f` (TASK-011; 24 soft-flags,
  none hard). First COMPLETE + CLEAN (42/42, exit 0, prose clean) = run `…163010-df5f` →
  commit `18e5d51`, after the FGAP-022 (atom-scope/cap) + FGAP-023 (sanitizer) fixes. Run
  dirs are under `.workflows/runs/workshop-run-plan-sequence/runs/`.

## Mode-C manual fallback (single-spec re-drive, outside the workflow)
`render.py` / `apply.py` / `sequence.py` / `decompose.py` take the SAME env as above
(`DATABASE_URL` + venv python; settings module `config.settings.local` — note
`dispatch/README.md:99` stalely says `config.settings.dev`).
