# Dispatch

Python scripts that render snippets with live dev-DB grounding and apply sub-agent responses to the running draft.

## The orchestrator-driven loop

The sub-agent dispatch itself happens via the orchestrator's `Agent` tool — Python can't dispatch sub-agents directly. The Python scripts handle every step EXCEPT the sub-agent call itself.

Per-spec iteration loop:

```
1. orchestrator: bash → python dispatch/render.py SPEC_KEY
   → stdout: the fully-rendered prompt (body + grounding context substituted)
   → orchestrator may strip the AXES INFO log line via `tail -n +2` before passing on

2. orchestrator: dispatch DISPATCH sub-agent (Agent tool, OPUS — non-negotiable
   for production-parity, since production routes to opus) with the rendered
   prompt verbatim as the agent's directive
   → captures the agent's response (JSON string per the snippet's contract)

3. orchestrator: bash → echo 'AGENT-RESPONSE-JSON' | python dispatch/apply.py SPEC_KEY
   → validates via production planner.specs.parse_<key>
   → writes outputs/<timestamp>/<NN>-<spec-key>.json (rendered_prompt +
     grounding + agent_response_raw + agent_response_parsed + schema_validation)
   → merges into outputs/current-draft.json (the running whole-plan draft)
   → stdout: validation summary + draft delta + capture path

4. orchestrator: dispatch RENDERING sub-agent (Agent tool, SONNET — sufficient
   for faithful restructuring; sonnet plenty given the task is preserve-content-
   verbatim, not synthesize) with the JSON response + a "render verbatim, no
   synthesis" directive
   → writes outputs/<timestamp>/<NN>-<spec-key>.rendering.md (human-readable
     MD pleasant for the user to scan; preserves every word of every prose
     field; structures by spec-natural divisions; uses a consistent visual
     device to distinguish kinds/categories)

5. orchestrator: reads + judges (free-form initially) against the experiment's
   pre-registered hypotheses + the surfaced-observation watch-fors
   → writes outputs/<timestamp>/<NN>-<spec-key>.evaluation.md
   → single git commit per experiment per the "persist 1 by 1" convention
```

**Three per-experiment artifacts** under `outputs/<timestamp>/`:
- `<NN>-<spec-key>.json` — apply.py capture (raw)
- `<NN>-<spec-key>.rendering.md` — rendering-sub-agent output (human-readable)
- `<NN>-<spec-key>.evaluation.md` — orchestrator judgment

**Model-for-task vector** (per WORK-PLAN.md): dispatch sub-agent = opus
(non-negotiable); rendering sub-agent = sonnet (sufficient); evaluation
sub-agent = TBD when sub-agent-ized; context-builder = opus; IMPL = opus;
Explore = sonnet for lookups, opus for synthesis. Each per-experiment run is
also a check on whether the chosen model matched its task (failure signals:
rendering agent inventing structure → escalate; opus agent producing rote
output → downgrade; sonnet refusing/hedging on direct decisions → escalate).

Whole-plan sequence loop:

```
1. orchestrator: bash → python dispatch/sequence.py --start-fresh --mode "I have a problem" --seed "..."
   → stdout: the dispatch plan — ordered list of spec_keys + the recipe to follow

2. for each spec_key in the plan:
   - orchestrator runs render.py → captures prompt
   - dispatches sub-agent → captures response
   - orchestrator runs apply.py with the response → merges into current-draft.json

3. orchestrator: bash → python dispatch/sequence.py --render-whole-draft
   → stdout: the assembled whole-plan draft in human-readable form for evaluation
```

## Scripts

### `render.py SPEC_KEY`

Reads `snippets/NN-<spec-key>.md`. Imports `school-improvement-plans/ai/services/grounding.py`. Builds the grounding dict by calling each emitter named in the snippet's `grounding_sections`. The `draft_state` section is read from `outputs/current-draft.json` (default location; override via `--draft <path>`).

Renders the snippet body (Django template engine) with the grounding dict + the seed argument. Prints the rendered prompt to stdout.

Args:
- `SPEC_KEY` (positional): the spec key from the snippet's frontmatter
- `--seed <text>` (optional): the author seed input; defaults to whatever's in `current-draft.json::seed_text`
- `--draft <path>` (optional): override the draft location for testing

### `apply.py SPEC_KEY`

Reads agent response JSON from stdin. Validates against `shared/schemas/<spec-key>.schema.json`. If validation fails, prints errors to stderr + exits non-zero (orchestrator decides whether to retry / edit prompt / accept partial).

If validation passes, writes the response + the rendered prompt + the grounding dict used to `outputs/<timestamp>/<spec-key>.json` for forensic capture. Merges the parsed output into `outputs/current-draft.json` (the running draft state). Prints validation summary + a brief diff of what changed in the draft.

### `sequence.py`

Orchestrator-side recipe. Two modes:

- `--start-fresh --mode <"I have a problem"|"I have an outcome in mind"|"Formalize a proposal"> --seed <text>`: resets `current-draft.json` to an empty draft + the entry-mode metadata; prints the ordered list of spec_keys to dispatch and the recipe to follow.
- `--render-whole-draft`: reads `current-draft.json` and prints the assembled draft in canonical-render-style human-readable form (so the user can read top-to-bottom and judge cross-spec coherence).

## How grounding gets imported

The dispatch scripts add `school-improvement-plans/` to `sys.path` and import `ai.services.grounding`. The emitters expect a Django `School` instance + the `draft_state` dict. The dispatch script wires up Django settings (`DJANGO_SETTINGS_MODULE=config.settings.local`, set in `_workshop.py:38`), then queries the tenant, then calls the emitters.

This is the load-bearing reuse — production grounding code is the workshop's grounding code, full stop. If a grounding emitter changes in production, the workshop picks it up automatically.

## Dev DB connection

The dispatch scripts use the same `DATABASE_URL` the production planner uses on the dev DB: `postgres://postgres:postgres@localhost:5433/school_improvement_plans`. Set via environment variable before running.

## What this directory does NOT carry

- No prompts (those are under `snippets/`)
- No outputs (those land under `outputs/`)
- No schemas (those are under `shared/schemas/`)
- No shared preamble (that's `shared/preamble.md`)

Just the dispatch scripts + this README. Future scripts can land here as needed (e.g., `diff.py SPEC_KEY` for comparing outputs across iterations; `bench.py` for running the whole sequence N times to assess stability).
