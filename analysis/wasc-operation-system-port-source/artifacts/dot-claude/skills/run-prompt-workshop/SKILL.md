---
name: run-prompt-workshop
description: Run, launch, build, smoke-test, or verify the prompt-workshop — the 14-spec LLM plan-generation pipeline (run_workflow.mjs / render_from_substrate / check_draft / verify-render-parity) that drives the school-improvement-plan prompt corpus against the dev DB. Use to run the workshop sequence, render a spec, smoke-test the pipeline, or check render-parity.
---

# Run the prompt-workshop pipeline

The prompt-workshop is the dev-time generation pipeline for the school-improvement-plan LLM prompt corpus (DEC-41: same code as production, different orchestration). It is **not** a GUI/server — it is a CLI/dispatch pipeline: Python scripts in `prompt-workshop/dispatch/` that import the production Django (`ai/services/grounding.py`, `planner/specs.py`) to render the 14 prompt specs against the dev DB and run them through an LLM. You drive it from the command line.

Two surfaces:
- **Smoke (fast, backend-free, ~30s)** — `.claude/skills/run-prompt-workshop/smoke.sh`: boots Django against the dev DB, renders the corpus, asserts snippet↔`.workshopping`-substrate render-parity 14/14. No LLM call. This is the quick "is the pipeline alive" check.
- **Full run (the real thing, ~5–8 min, needs the LLM backend)** — `run_workflow.mjs` runs all 14 specs through the LLM into an assembled whole-plan draft, then `check_draft.py --strict` is the structural gate. This is the actual generation.

Paths below are relative to the repo root (`<unit>`). The full run is invoked from `school-improvement-plans/` (so `uv` finds the venv and the `../prompt-workshop` relative paths resolve).

## Prerequisites (environment, already provisioned here — macOS/darwin)

- **Dev Postgres up on `localhost:5433`** (tenant `chiway-repton-xiamen`) — the pipeline reads live grounding from it. Started via the project's docker-compose (see `school-improvement-plans/docker-compose*.yml`).
- **`uv`** (provides the venv python — the dispatch command steps need a real `python`/`node` on PATH, not a bare shell; always invoke under `uv run`, see Gotchas WF-12).
- **`node`** (for `run_workflow.mjs`).
- **`pi` on PATH + a reachable model backend** — only for the **full run**. `pi --mode json` is spawned per spec; the model is `~/.pi/agent/settings.json`'s default (deepseek-v4-pro at the last clean runs). The smoke path needs none of this.

`DATABASE_URL="postgres://postgres:postgres@localhost:5433/school_improvement_plans"` is exported by `smoke.sh`; export it yourself for the full-run commands below.

## Smoke (agent path — run this first)

```bash
bash .claude/skills/run-prompt-workshop/smoke.sh
```

Verified output ends with `GATE: 14/14`, `render OK: narrative-draft -> 67412 chars`, `SMOKE OK`, exit 0. Nonzero = the pipeline doesn't launch / parity broke / a render is empty. Individual pieces, if you want them directly (run from `school-improvement-plans/`):

```bash
# render-parity (snippet == .workshopping substrate, all 14 specs) — backend-free
DATABASE_URL="postgres://postgres:postgres@localhost:5433/school_improvement_plans" \
  uv run python ../prompt-workshop/dispatch/verify-render-parity.py      # -> GATE: 14/14, exit 0

# render one spec to its fully-grounded prompt — backend-free
DATABASE_URL="postgres://postgres:postgres@localhost:5433/school_improvement_plans" \
  uv run python ../prompt-workshop/dispatch/render_from_substrate.py --spec-key narrative-draft   # -> JSON {spec_key, rendered_prompt, ...}
```

## Full run (the actual 14-spec generation — needs the LLM backend, ~5–8 min)

From `school-improvement-plans/`. Use a fixed `OUT_DIR` so you can find the draft afterward. Run it in the background (it is long).

```bash
OUT_DIR=/tmp/workshop-out && rm -rf "$OUT_DIR" && mkdir -p "$OUT_DIR"
DATABASE_URL="postgres://postgres:postgres@localhost:5433/school_improvement_plans" \
  uv run node ../prompt-workshop/dispatch/run_workflow.mjs run workshop-run-plan-sequence \
  --input "{\"seed\":\"Improve SLO usage across the school\",\"out_dir\":\"$OUT_DIR\"}" \
  --yes --fresh > /tmp/wf-run.log 2>&1
```

Success = all 42 steps (14 specs × render→call→apply) `completed`, exit 0; the final assembled draft is `$OUT_DIR/draft-after-propose-review-loop.json` (one `draft-after-<spec>.json` per spec is the live progress signal while it runs). Then the **structural gate**:

```bash
DATABASE_URL="postgres://postgres:postgres@localhost:5433/school_improvement_plans" \
  uv run python ../prompt-workshop/dispatch/check_draft.py --strict \
  --draft "$OUT_DIR/draft-after-propose-review-loop.json"               # -> RESULT: PASS, exit 0
```

`--strict` gates on structural checks 3–8 (owner distribution >1/none>50%, coverage, review cadence, three-view, bilingual, decision-request well-formedness); language checks 1–2 are WARN-only (DEC-53). Without `--strict` it is report-only (exit 0 regardless) — a footgun. The verified procedure + the as-practiced run history live in `prompt-workshop/RUNBOOK-T6-14spec-run.md`.

## Gotchas (battle scars)

- **`--fresh` is mandatory** (WF-14): `run` auto-resumes an incomplete prior run by default, replaying stale completed render steps — so a fixed render-source change looks unfixed. Always `--fresh`.
- **`--yes` is mandatory** in a non-TTY shell — `run` is gated and exits 1 without it.
- **Invoke under `uv run`** (WF-12): a `command` step spawns via a non-interactive `sh -c` with no venv/alias; a bare `python`/`node` fails `exit 127`. `uv run node …` puts `.venv/bin/python` on PATH.
- **pi 10MB stdout cap** (WF-13/15/16): `pi --mode json` can emit tens of MB for the heaviest-prompt specs (responsibilities ~75KB, decompose); past the 10MB cap the tail (incl. the agent's output) is dropped. Mitigated wasc-side: each call step declares `output.schema` (disk-read of `<runDir>/outputs/<step>.json`) + a `retry` block. A flaky no-write aborts that spec; re-run with `--fresh`.
- **The full run needs the deepseek backend reachable** (network + `~/.pi/agent/auth.json`); the model is the `settings.json` default — confirm it before a run. The smoke path does not.
- **`render_from_substrate.py` prints a large JSON to stdout** — if you pipe it to a consumer that crashes/exits early, the renderer dies with `BrokenPipeError`. Consume the whole stream (read to EOF) — see `smoke.sh` step 2 for the working pattern.
- **`.workshopping` substrate edits are NOT via `--cwd`** (CTX-12): the pi-context CLI resolves a substrate by its bootstrap pointer; editing `.workshopping` requires a transient `pi-context context-switch` of the root pointer and back. Irrelevant to *running*; relevant if you change the corpus. `.pi-context.json` must end on `.context`.

## Troubleshooting

- `exit 127: python: command not found` (or `node`) → you ran a dispatch step outside `uv run`. Prefix with `uv run` (WF-12).
- `BrokenPipeError` from `render_from_substrate.py` → your stdout consumer exited early; read the full JSON stream.
- render-parity / render fails to connect → the dev Postgres on `:5433` isn't up; start the compose DB.
- A `call_*` step fails "no valid JSON output was produced" mid-run → a truncated/flaky LLM turn (WF-15/16); re-run with `--fresh`.

## The driver

`.claude/skills/run-prompt-workshop/smoke.sh` — the committed fast smoke (parity + single render, backend-free). The full-run drivers are the in-repo dispatch scripts `prompt-workshop/dispatch/{run_workflow.mjs, check_draft.py, render_from_substrate.py, verify-render-parity.py}`; this SKILL.md is their man page. Verified in this container (macOS): `smoke.sh` → `GATE: 14/14` + `render OK … 67412 chars` + `SMOKE OK` exit 0; the full run + `check_draft --strict` PASS per the T6 run (`RUNBOOK-T6-14spec-run.md`).
