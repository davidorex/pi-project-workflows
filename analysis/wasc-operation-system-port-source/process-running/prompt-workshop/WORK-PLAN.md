# Workshop work-plan

Operational manage-the-work plan for the prompt-workshop. Sibling to `README.md` (which describes the working model); this doc tracks WHAT we're working on and HOW FAR we've gotten.

Status legend: `pending` · `in-progress` · `done` · `blocked`

---

## Current step

**Step 3 — First-dispatch smoke test against A1 narrative-draft** (next; unblocked by Step 1 landing). Step 1 done; Step 2 superseded.

---

## Step 1 — Build the dispatch tooling

**Status**: done (`b633b79` IMPL + orchestrator smoke test passed — `render.py narrative-draft` produced a 106-line fully-rendered prompt against the dev DB with the shared preamble substituted + the tenant grounding emitted + the A1 body + seed all wire-through-correct)

**What lands** (4 Python files — 3 entry scripts + 1 shared helpers module):
- `prompt-workshop/dispatch/_workshop.py` — shared helpers used by all three entries: `setup_django`, inline YAML-subset `parse_frontmatter`, `load_snippet`, `preamble_substitute` (marker-extracted body), `load_draft` / `save_draft` (atomic), `timestamp_dir`, `get_tenant_school`, `get_parse_function` (the spec_key → `planner.specs.parse_*` registry).
- `prompt-workshop/dispatch/render.py SPEC_KEY [--seed ...] [--draft <path>]`
  - Reads `snippets/<NN>-<spec-key>.md`, parses YAML frontmatter
  - Queries the tenant + calls production `ai/services/grounding.py::build_grounding` with the snippet's `grounding_sections`
  - Reads `outputs/current-draft.json` as the `draft_state` grounding (initializes empty if absent)
  - Substitutes `shared/preamble.md` content where the snippet body has `{% include "shared/preamble.md" %}`
  - Renders body with Django template engine + grounding dict + seed
  - Prints the fully-rendered prompt to stdout
  - Persists `outputs/last-render.json` so `apply.py` can self-contain its capture
- `prompt-workshop/dispatch/apply.py SPEC_KEY` (reads agent response from stdin)
  - Invokes the production `planner.specs.parse_<key>` directly (validation = production parse — no schema file needed; see Step 2)
  - Merges parsed output into `outputs/current-draft.json` per the spec's MERGE_RULES entry (14 entries, one per target_step+preview_mode pair)
  - Writes `outputs/<timestamp>/<NN>-<spec-key>.json` with `{rendered_prompt, grounding_dict_used, agent_response_raw, agent_response_parsed, schema_validation, draft_changed}`
  - Prints validation summary + draft delta + capture path
- `prompt-workshop/dispatch/sequence.py`
  - `--start-fresh --mode "..." --seed "..."` resets `current-draft.json` to a fresh shell with entry-mode metadata; prints the ordered spec_key list + the orchestrator recipe
  - `--render-whole-draft` reads `current-draft.json` and prints the assembled draft in canonical-render-shape human-readable form

**Done when**:
- `render.py narrative-draft` prints a non-empty fully-rendered prompt to stdout against the dev DB
- `apply.py narrative-draft` with a valid response JSON updates `outputs/current-draft.json` + writes a capture file
- `sequence.py --start-fresh --mode "I have a problem" --seed "test"` resets the draft + prints the recipe
- All three scripts work from any cwd (resolve relative paths from the workshop root)
- A one-line invocation pattern is documented in `dispatch/README.md` (which it largely already is — verify the implemented scripts match the contract)

---

## Step 2 — Per-spec schemas (SUPERSEDED by production parse-function reuse)

**Status**: superseded by Step 1's implementation

**Resolution**: `apply.py` validates by invoking the production `planner.specs.parse_<spec_key>` function directly. The spec_key → parse-function-name mapping lives in `dispatch/_workshop.py::get_parse_function`. There is no separate `shared/schemas/*.schema.json` to maintain — what production accepts is what the workshop accepts, with zero drift risk.

The snippet's `output_schema:` frontmatter field remains as a human-readable pointer at the production validator but is not loaded at runtime. The earlier plan to write per-spec JSON Schema files is closed.

---

## Step 3 — First-dispatch smoke test

**Status**: done (`bf597ae` experiment 01)

**Spec dispatched**: A1 `narrative-draft` (`01-narrative-draft.md`)

**The established per-experiment loop** (used for experiments 01, 02, 03 and going forward):

1. `python prompt-workshop/dispatch/render.py <spec-key>` → captures rendered prompt (orchestrator may strip the leading AXES log line via `tail -n +2`)
2. Orchestrator dispatches **dispatch sub-agent (Agent tool, opus — non-negotiable for production-parity)** with the rendered prompt verbatim. The sub-agent IS the LLM that production would call; response is ONE JSON object per the snippet's contract.
3. Orchestrator captures the agent's JSON response string.
4. `echo 'RESPONSE-JSON' | python prompt-workshop/dispatch/apply.py <spec-key>` → validates via production `parse_<key>`; merges into `outputs/current-draft.json`; writes capture file at `outputs/<timestamp>/<NN>-<spec-key>.json`.
5. **Rendering step** — Orchestrator dispatches **rendering sub-agent (Agent tool, sonnet — sufficient for faithful restructuring)** with the JSON response + a constrained "render verbatim, no synthesis" directive. Output lands at `outputs/<timestamp>/<NN>-<spec-key>.rendering.md` — human-readable MD pleasant for the user to scan. Renderer preserves every word of every prose field; structures by spec-natural divisions (per-criterion / per-relation / per-step / per-event); uses a consistent visual device to distinguish kinds/categories.
6. Orchestrator reads + judges (free-form initially) against the experiment's pre-registered hypotheses + the surfaced-observation watch-fors. Writes `outputs/<timestamp>/<NN>-<spec-key>.evaluation.md`.
7. Single git commit per experiment per the established "persist 1 by 1" convention; LOG event appended.

**Three per-experiment artifacts** under `outputs/<timestamp>/`:
- `<NN>-<spec-key>.json` — apply.py-written capture (rendered_prompt + grounding_dict_used + agent_response_raw + agent_response_parsed + schema_validation + draft_changed)
- `<NN>-<spec-key>.rendering.md` — rendering-sub-agent-written human-readable rendering of the agent's response (NEW as of `<this commit>`; backfilled for experiment 03 first; baked into process for experiments 04+)
- `<NN>-<spec-key>.evaluation.md` — orchestrator-written free-form judgment

**Done when** (per experiment): all 3 artifacts exist; harness ran end-to-end; orchestrator's evaluation names disposition + signal for next iteration.

## Model-for-task vector

Each role in the loop gets the model whose capability profile matches its task. Cost + latency + fidelity tradeoffs drive selection; the choice is checkable per-experiment (does the chosen model handle the task without drift, hedge, or content loss).

| Role | Task profile | Model |
|---|---|---|
| Dispatch sub-agent (the LLM-being-emulated) | Heavy synthesis; production-parity required (production routes opus) | **opus** (non-negotiable) |
| Rendering sub-agent | Mechanical restructuring; content preserved verbatim; no synthesis | **sonnet** |
| Context-builder (brief generation, audit assembly) | Heavy synthesis across many files; structured condensation | **opus** |
| Plan-mode Explore | Targeted lookups; concise findings | **sonnet** for lookups; **opus** when synthesis is needed |
| IMPL (per canonical pipeline) | Code generation with cross-file coherence; convention adherence | **opus** (per project Mode B convention) |
| Evaluation (currently orchestrator; sub-agent-ize later) | Critical reading + rubric judgment | TBD when sub-agent-ized — start sonnet, escalate if judgment shallow |

**Failure signals to watch (evaluate as we go)**:
- Rendering agent inventing structure or condensing → task creep into synthesis → escalate to opus
- Opus agent producing rote output → task is narrower than chosen capability → sonnet sufficient; downgrade
- Sonnet refusing or producing AI-mandates-style caveats on a task requiring direct decision → sonnet under-matched; escalate to opus
- Latency outliers → log + assess whether the model-task fit is right

---

## Step 4 — Per-spec iteration

**Status**: pending

**Order** (per snippets/README suggestion):

1. **Confirm baseline rendering on the strongest prompts** (these should produce good output with the preamble applied; if they don't, the harness or the preamble has a defect):
   - 02-propose-domain-alignment (A3 post-0016)
   - 07-propose-responsibilities (US-LLM-27)
   - 05-decompose-action-steps (F1)
   - 04-draft-success-criteria (B1)
2. **Iterate the weakest prompts** (the audit's lowest-scoring on WASC-evidence orientation + possibility-space):
   - 06-propose-assignments (F2)
   - 08-propose-timelines (F3)
   - 12-bind-measurement-channels (B2)
   - 03-propose-milestones (D1)
3. **Middle band**:
   - 01-narrative-draft (A1 — already exercised in Step 3; revisit for refinement)
   - 13-propose-accreditation-standards (A2)
   - 11-suggest-feedback-channels (C1)
   - 09-propose-step-resources (F4)
   - 10-propose-evidence (F5)
   - 14-propose-review-loop (G1)

**Per-spec loop**: edit snippet body → re-render → dispatch sub-agent → capture → read + judge → tune the snippet (or shared preamble if the issue is corpus-wide) → re-dispatch → diff outputs.

**Done when** (per spec): output reads as substantive, accreditation-evidence-ready, school-policy-honoring, current→desired-trajectory-coherent. Capture files preserve the iteration history.

---

## Step 5 — Whole-plan sequence + composer comparison

**Status**: pending (blocked on per-spec iteration maturing)

**What lands**:
- `python prompt-workshop/dispatch/sequence.py --start-fresh --mode "..." --seed "..."` then orchestrator runs all 14 in order via the recipe
- `python prompt-workshop/dispatch/sequence.py --render-whole-draft` produces the assembled draft for top-to-bottom reading
- The 15th snippet: `15-whole-plan-composer.md` (audit gap #1) — a single-shot prompt that produces the whole plan
- Comparison of single-shot composer output vs sequenced 14-snippet output: which becomes US-DRAFT-1's production prompt

**Done when**:
- The whole-plan sequence produces a draft that reads as a coherent accreditation-evidence-ready plan top-to-bottom
- Cross-spec coherence holds (US-LLM-27 honors F2's output; G1 honors milestones+channels; A3 rationale matches the plan's actual current/desired; etc.)
- The composer-vs-sequence comparison settles which is US-DRAFT-1's production prompt

---

## Step 6 — Production landing

**Status**: pending (blocked on Step 5)

**What lands**:
- `school-improvement-plans/ai/migrations/0018_update_prompt_template_bodies_via_workshop.py` (or split across multiple `0018+` migrations if cleanly factored) — `RunPython` UPDATEs each `PromptTemplate.body` with the validated snippet body; idempotent; reversible
- If the 15th whole-plan-composer becomes US-DRAFT-1's production prompt: a new `AssistSpec` + new `PromptTemplate` seed for it
- US-DRAFT-1 status flip from `pending` to `enabled` in `phases/US-STATUS.md`
- DISC-26's `resolved_by` filled with the migration commit SHA
- Wizard-v2 status note: prototype kept as low-touch design comparator OR retired

**Done when**:
- Migration applied to dev DB + verified
- Existing planner UI invokes the new prompt bodies (no UI change needed; same `AssistSpec` registry; same `AssistStreamView`)
- A real plan authored via the planner UI produces content equivalent to what the workshop produced
- DISC-26 resolved

---

## Notes

- The workshop is iteration-as-code: snippet edits + capture files + this work-plan are the audit trail of the prompt-corpus evolution.
- Commits at sensible milestones (per-snippet validated; whole-sequence run captured; preamble revised) so the iteration history is git-preserved.
- Standing relations: DISC-26 in `phases/discoveries.md` stays open until Step 6 completes; this work-plan is the named operational substrate.
- The wizard-v2 stubs (`web/static/js/wizard-v2/assists.js`) are the visual specimen of what the workshop should converge toward in output quality.
- Production prompt-template-evolution pattern is established (`ai/0016` precedent); Step 6's migration follows that shape.
