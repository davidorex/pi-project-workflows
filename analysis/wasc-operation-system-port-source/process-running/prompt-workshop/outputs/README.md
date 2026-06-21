# Outputs

Per-run capture of every sub-agent dispatch + the running whole-plan draft state.

## Layout

```
outputs/
  README.md                       — this file
  .gitignore                      — ignores current-draft.json + last-render.json (transient running state); TRACKS timestamp-dir captures
  current-draft.json              — the in-progress whole-plan draft state (transient; gitignored; read by render.py as `draft_state` grounding section; merged into by apply.py)
  last-render.json                — transient pointer apply.py reads to fold rendered_prompt + grounding_dict_used into the capture (transient; gitignored)
  <YYYY-MM-DD-HH-MM-SS>/          — per-experiment capture directory (TRACKED — one git commit per experiment per "persist experiment results 1 by 1" convention)
    <NN>-<spec-key>.json          — apply.py-written capture: {spec_key, target_step, preview_mode, rendered_prompt, grounding_dict_used, agent_response_raw, agent_response_parsed, parse_note, schema_validation, draft_changed}
    <NN>-<spec-key>.rendering.md  — rendering-sub-agent-written (sonnet) human-readable rendering of the agent's JSON response. Preserves every word of every prose field; structures by spec-natural divisions; uses a consistent visual device to distinguish verification kinds / categories / etc. Pleasant for the user to scan instead of reading raw JSON. Convention added between experiments 03 and 04.
    <NN>-<spec-key>.evaluation.md — orchestrator-written free-form judgment of THIS experiment (sibling to the capture). Persisted per-experiment per the workshop's "free-form initially" evaluation posture.
```

## `current-draft.json` shape

The in-progress draft, matching the `draft_state` shape that production grounding's `draft_state` emitter produces:

```json
{
  "meta": {
    "entry_mode": "I have a problem" | "I have an outcome in mind" | "Formalize a proposal",
    "seed_text": "...",
    "source_proposal_id": null | "p-...",
    "started_at": "ISO timestamp"
  },
  "plan": {
    "title": "...",
    "current_state": "...",
    "desired_state": "...",
    // ... all Plan fields
  },
  "milestones": [...],
  "phases": [...],
  "action_steps": [...],
  "success_criteria": [...],
  "feedback_channels": [...],
  "evidence_artifacts": [...],
  "review_events": [...],
  "communications": [...],
  "revision_rules": [...],
  "accreditation_standards": [...],
  "domain_alignment": {
    "learner_outcomes_targeted": [...],
    "mission_areas_targeted": [...],
    "areas_for_improvement": [...],
    "stakeholder_impact": [...],
    "policies_established": [...],
    "policies_revised": [...]
  },
  "guiding_clauses": [...],
  "responsibilities": {
    "division": [...],
    "position": [...]
  }
}
```

Same shape as the production `Plan` aggregate. When the workshop's outputs land in production via the eventual `ai/0018+` migration, this draft shape maps 1:1 to the Django `Plan` + nested children that get persisted on whole-draft promotion.

## Draft-state flattening (render-time projection)

`current-draft.json` is the canonical workshop draft state, kept in the **structured** Plan-aggregate shape above for human readability and whole-plan iteration (`sequence.py --render-whole-draft` reads it top-to-bottom).

Production prompt templates, however, iterate `draft_state.items` as a **flat** `{form-field-name: value}` dict — what production's browser-side `collectDraftState()` (`planner/static/wizard/js/ai-assist.js:143-150`) emits by walking every `<input|select|textarea>.name` in the wizard `<form>`. Bare-named fields for the basics step's `PlanForm`; `{prefix}-{index}-{field}` keys for every formset row (nested rows carry `{parent_prefix}-{i}-{seg}-{j}-{field}`).

To bridge the two shapes without polluting the persisted file, `render.py` calls `dispatch._workshop.flatten_draft_for_grounding(draft)` at render time and passes the flat result as the `draft_state=` kwarg to `build_grounding`. The structured `current-draft.json` is untouched; the flat shape exists only in-memory for the duration of one render.

The flat shape is byte-equivalent to what production's `collectDraftState()` produces from the same author input. `AssistStreamView` (`planner/views.py:404-508`) forwards `draft_state` verbatim to `build_grounding`, so the prompt body that the workshop's LLM sees and the prompt body production's LLM sees iterate the IDENTICAL `draft_state` shape. Prompts validated in the workshop carry over to production with no draft_state-shape drift.

Formset prefix map (source-of-truth: `planner/steps.py::STEPS` keys passed to `formset_factory(prefix=...)` in `planner/views.py:113-122`; nested segments from `planner/formsets.py`):

- `criteria`, `feedback`, `milestones`, `phases`, `steps` — primary step formsets keyed by `step.key`
- `review` — primary formset for the "Communications & review" step (CommunicationFormSet), so `draft["communications"][i]` projects to `review-{i}-{field}`
- `standards`, `guiding_clauses`, `learner_outcomes_targeted`, `mission_areas_targeted`, `areas_for_improvement`, `stakeholder_impact`, `policies_established`, `policies_revised` — extra formsets under `basics`
- `review_events`, `revision_rules` — extra formsets under the review step
- nested under `criteria-{i}-`: `measurement`; nested under each measurement: `channel`
- nested under `steps-{i}-`: `assignment`, `timeline`, `resource`, `substep`, `responsibility`, `position_responsibility`, `evidence`
- nested under `review_events-{i}-`: `input`

`draft["meta"]` (workshop bookkeeping) and `draft["responsibilities"]` (whole-plan responsibility roll-up, not a step form field) are intentionally skipped — they have no production form-field counterpart.

## Capture purpose

- **Forensic trail for iteration**: comparing this iteration's output to the prior lets us judge whether a snippet edit improved or regressed the result.
- **Reproducibility**: every capture carries the rendered_prompt + grounding_dict_used so an output can be rerun without state drift.
- **Whole-plan reading**: the assembled `current-draft.json` after a full sequence run is the artifact the user reads to judge cross-spec coherence.
- **Evaluation note**: free-form prose added per capture to record what the user/orchestrator noticed; becomes the substrate for the next snippet edit.

## Git posture

`current-draft.json` is overwritten on every whole-plan sequence run — treat as transient working state; commit at sensible milestones (good baseline, post-preamble-uplift, post-per-spec-tune, etc.) so the iteration history is preserved.

`<timestamp>/` directories are append-only per run; commit periodically to preserve the forensic trail.
