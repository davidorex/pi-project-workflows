# Prompt Workshop

A sub-agent-driven iteration harness for the school-improvement-plan LLM prompt corpus. **Parallel to production**, not part of it. Used to develop, evaluate, and validate the 14 (or 15 with whole-plan-composer) prompts that drive the per-element + whole-draft LLM assists, before the validated bodies land in production via an `ai/0018+` prompt-template-evolution migration (`ai/0016` pattern).

## Why this exists

Per DISC-26 (`phases/discoveries.md`) + the audit at `docs/wizard-v2-coverage-and-prompt-quality-audit-2026-05-28.md`, the production prompt corpus has 11 named gaps against the US-DRAFT-1 vision (whole-draft composer absent; orchestration framing absent; WASC-evidence orientation uneven; general LLM success criteria absent; zero-hedging language absent; operational policies absent; current→desired-trajectory meta-framing absent; etc.). Closing those gaps requires iterating on prompt bodies until they produce substantive, accreditation-evidence-ready, school-policy-honoring, current→desired-coherent content.

This workshop is where that iteration happens. Each prompt is edited as a local MD snippet; a Python dispatch script renders it with real dev-DB grounding; the orchestrator dispatches a sub-agent (same Claude model production would route to) with the rendered prompt; the agent's output is the comparator. When the per-element snippets read well and the whole-plan sequence produces an acceptable draft, the snippets' bodies become the rewrite spec for the production `ai/0018+` migration.

## The working model

1. **Snippets are MD files** under `snippets/`, one per spec. Frontmatter carries metadata (spec_key, target_step, preview_mode, dependency order, grounding sections, output schema). Body is the literal Django Template string (`{{ var }}`, `{% if %}`, `{% for %}` — same syntax as production `PromptTemplate.body`). The body includes the shared preamble fragment via `{% include "shared/preamble.md" %}` so the audit-gap #8/#9/#10/#11 corrections land once, not 14 times.

2. **Data is the real dev DB.** Live queries at dispatch time via the production grounding emitters (`school-improvement-plans/ai/services/grounding.py::_school`, `_divisions`, etc.). The dispatch script imports those emitters directly — no re-implementation, no static snapshot, no drift between workshop grounding and production grounding.

3. **Dispatch is Python scripts** under `dispatch/`. `render.py SPEC_KEY` prints the fully-rendered prompt (body + grounding context). The orchestrator captures the output, dispatches a sub-agent with it, captures the agent's response. `apply.py SPEC_KEY` reads the response, validates against the output schema, applies to the running draft (a JSON file at `outputs/current-draft.json`). `sequence.py` orchestrates the full 14-spec (or 15-with-composer) sequence in dependency order, threading prior outputs into subsequent grounding.

4. **Evaluation is free-form initially.** The orchestrator + user read each agent's output and judge: did the data give the agent what it needed? Did the prompt frame the task well? Is the output substantive (no hedging, no half-fills, divisions distributed per their purviews, current→desired trajectory coherent, WASC-evidence-ready)? Rubric-based evaluation can replace free-form later if useful.

5. **Outputs captured per run** under `outputs/<timestamp>/<spec>.json`, including the rendered prompt that produced the output, the grounding-context dict used, and the agent's full response. Allows diff-comparison across iterations.

## The iteration loop

```
edit a snippet → render → dispatch sub-agent → capture output → read+judge → tune
                                                                              ↓
                                                                       (repeat per spec)
                                                                              ↓
when per-spec snippets read well: run whole-plan sequence → judge cross-spec coherence → tune
                                                                                          ↓
when whole-plan draft reads as a coherent acceptance candidate: snippets become the rewrite spec
                                                                                          ↓
production landing: ai/0018+ migration UPDATEs each PromptTemplate.body with the validated snippet content
```

## Directory layout

```
prompt-workshop/
  README.md                — this doc
  snippets/
    README.md              — snippet format + naming convention
    <NN>-<spec-key>.md     — one per spec; numbered by dependency order
  dispatch/
    README.md              — how the Python scripts work + how the orchestrator drives them
    render.py              — given a spec_key, builds the grounding dict from live dev DB + renders the snippet body → prints to stdout
    apply.py               — given a spec_key + an agent response JSON, validates + applies to the current draft
    sequence.py            — orchestrator-side recipe for running the full whole-plan sequence
  shared/
    README.md              — what lives in shared
    preamble.md            — the shared prompt preamble (audit-gap #8/#9/#10/#11 corrections; included by every snippet body)
    schemas/
      <spec-key>.schema.json — per-spec output schema (mirrors production parse_* contract)
  outputs/
    README.md              — output capture convention
    <YYYY-MM-DD-HH-MM>/    — per-run capture
      <spec-key>.json      — { rendered_prompt, grounding_dict_used, agent_response, evaluation_note? }
    current-draft.json     — the in-progress whole-plan draft state (the "draft" object sequenced through dispatches)
```

## Relationship to production

- **Production code unchanged** while the workshop iterates. The Django `planner` + `ai` apps stay as-is.
- **Production grounding code is reused** — `ai/services/grounding.py` emitters import directly. If the production grounding is wrong, fixing it here fixes it for production simultaneously.
- **Production migration landing**: when snippets validate, an `ai/0018+` migration carries the snippet bodies into `PromptTemplate.body` via `RunPython` UPDATEs (idempotent, reversible). The migration's `RunPython` reads the snippet files from the prompt-workshop directory at migration-write time (or copies the body strings inline — the migration is the canonical record of what landed).

## Relation to wizard-v2

Wizard-v2 (`web/wizard-v2.html` + `web/static/js/wizard-v2/*`) is a STATIC prototype that hard-codes example outputs in JS. Wizard-v2 demonstrates what good LLM output should look like, with no real LLM in the loop.

This workshop is the COMPLEMENTARY surface: real LLM (sub-agent), real prompt iteration, real dev-DB data. The wizard-v2 stubs are the visual specimen of what the workshop should converge toward.

When the workshop produces a good whole-plan draft, it should match (or exceed) the substantiveness wizard-v2's `applyWholePlanDraft` demonstrates. When production lands (`ai/0018+` migration + whole-plan composer spec), wizard-v2 becomes redundant — the production planner UI produces the same content live.

## Order of operations for using the workshop

1. **Bootstrap**: copy each production prompt body verbatim into its snippet (initial-state = production = audit-gap-positive). The shared preamble starts empty (just markers) so initial-state matches production exactly. First-iteration outputs reproduce production behavior + provide the baseline to diff against.

2. **Apply the shared preamble**: populate `shared/preamble.md` with the audit-gap #8/#9/#10/#11 corrections (success criteria + zero-hedging + operational policies + current→desired meta-framing). Every snippet `{% include %}`s it. One edit → 14 prompts uplifted.

3. **Per-spec uplift**: iterate per snippet on the per-prompt findings (the audit's per-spec weakest-points table — F2/F3/B2/D1 first). Edit → render → dispatch → judge → tune.

4. **Whole-plan sequence**: when per-spec is good, run the whole sequence. Read the resulting whole-plan draft top-to-bottom. Judge cross-spec coherence (US-LLM-27 honoring F2's output; G1 honoring milestones+channels; etc.).

5. **Whole-plan composer**: when sequence produces a coherent draft, add the 15th snippet (`15-whole-plan-composer.md`) which is the spec the audit's gap #1 names — a single prompt that produces the whole plan in one shot (vs the sequenced approach). Compare results: does single-shot composer match sequenced quality? If yes, US-DRAFT-1's production prompt is the composer; if no, US-DRAFT-1's production is the sequenced orchestrator (which is what US-LLM-23/24/25 already proposes).

6. **Production landing**: `ai/0018+` migration packages the validated snippet bodies into `PromptTemplate.body` UPDATEs. Wizard-v2 stubs can then be retired (or kept as a low-touch design comparator).

## Working state

- The workshop is the **operational manage-the-work surface** for the prompt-corpus rewrite. Edits + iteration captures land here, not in commit messages.
- The orchestrator commits at sensible checkpoints (per-snippet validated; whole-sequence run captured; preamble revised; etc.) so the audit trail of prompt evolution is preserved.
- DISC-26 stays open until the `ai/0018+` migration lands; this workshop is the named resolution path.

## What this is NOT

- Not a replacement for the production prompt corpus — it's the iteration substrate FOR it
- Not a doc-only artifact — the snippets + scripts ARE the working state
- Not a unit-test framework — outputs are evaluated by reading, not assertion (initially; rubric may follow)
- Not a static snapshot — the data is always live dev DB
- Not isolated from production — uses real grounding code; the validated bodies eventually land in production verbatim
