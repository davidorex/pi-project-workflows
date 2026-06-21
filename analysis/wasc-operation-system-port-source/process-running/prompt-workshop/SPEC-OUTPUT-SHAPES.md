# 14-spec output shapes (the required agent-response JSON per spec)

Authoritative machine encoding: `.workflows/schemas/<spec-key>.schema.json` (14 files) — declared as each
call step's `output.schema`, validated against the agent's actual output during a run. This MD is the human
summary. Both are grounded in the `parse_<spec>` validators in `school-improvement-plans/planner/specs.py`
(each parser IS the validator, DEC-41) and confirmed against a real run (the agent output passed schema
validation through spec 2 before a catalogue-value reject).

Correction (2026-06-07): an earlier version of this doc recorded a top-level BARE LIST for 11 specs and some
post-parse key names (e.g. `learner_outcomes_targeted`). That described the parser's PREFILL *return* shape,
not the agent's *output*. The agent output is what matters here (it is what the schema validates and the
parser ingests), and every parser requires a top-level OBJECT — `if not isinstance(loaded, dict): raise` —
then reads an envelope key (`loaded.get("milestones")`, etc.). Corrected below.

## Envelope contract (all 14)
The agent returns ONE JSON value: a top-level OBJECT for every spec. The parser strips an optional ```json
fence, `json.loads`, requires a dict, reads its envelope key(s), validates, and returns
`AssistResult(prefill, note, flags)` (`planner/assist.py`). 3 specs ARE flat objects (narrative-draft,
propose-domain-alignment, propose-review-loop); the other 11 wrap their rows under a single envelope key.
Catalogue FKs are school-scoped except accreditation standards (global); `*_index` fields are range-checked
against the prior draft; 12 of 14 carry audited free-text fields (propose-assignments and
bind-measurement-channels have none).

## Per-spec required shape (agent output)

| spec_key | top-level object |
|---|---|
| narrative-draft | `{current_state?, desired_state?, rationale?, student_impact_framing?, provenance?}` — all prose; ≥1 non-empty |
| propose-domain-alignment | `{learner_outcomes, stakeholder_impact, areas_for_improvement` (each ≥1), `policies_established?, policies_revised?}` — each → `[{label, rationale?}]`; `label` catalogue-bound |
| propose-milestones | `{milestones: [{label, improvement_type, target_date?, planning_method?}]}` — type+label required; type↔method invariant |
| draft-success-criteria | `{criteria: [{text, verification_kind, (target_value, target_unit, baseline — iff kind==target)}]}` |
| decompose-action-steps | `{method, steps: [{description, assessment?}]}` — `method` (catalogue) at envelope level |
| propose-assignments | `{assignments: [{step_index, responsible_division}]}` |
| propose-responsibilities | `{steps: [{step_index, division_responsibilities?:[{division, statement, rationale?}], position_responsibilities?:[{division, position, statement, rationale?}]}]}`; `statement` verbatim-matches a catalogue atom |
| propose-timelines | `{timelines: [{step_index, kind, (date iff single \| from_date+to_date iff range), note?}]}` |
| propose-step-resources | `{steps: [{step_index, resources:[{kind, note}] (≥1), substeps?:[str]}]}` |
| propose-evidence | `{steps: [{step_index, evidence:[{label, owner_division, location?}] (≥1)}]}` |
| suggest-feedback-channels | `{channels: [{label, stakeholder, owner_division, timing_kind, (frequency iff periodic \| milestone_index iff milestone), instrument}]}` |
| bind-measurement-channels | `{bindings: [{criterion_index, channel_indices:[int] (≥1)}]}` |
| propose-accreditation-standards | `{standards: [{standard (global code), rationale?}]}` |
| propose-review-loop | `{communications:[…], review_events:[…(inputs ≥1 each)], revision_rules:[…]}` — all three ≥1; `trigger_index` references G1's own emitted events |

Cross-field invariants (target-iff-kind, per-kind dates), catalogue membership, and index ranges are NOT
in the schemas (the parser owns them, and AJV runs `strict:false` so the schemas stay permissive —
`additionalProperties` defaults true, never set false, so valid output is never falsely rejected).

## Relevance to WF-13
Declaring these as each call step's `output.schema` routes the engine through its disk-read path
(`step-agent.ts:205-227`, which reads the agent-written `outputs/<step>.json` and ignores the truncatable
stdout). For that file to exist the agent must write it, so `workshop-json-responder` carries the write tool
and a mandatory task-prompt instruction to write the JSON to the output path. This combination (write tool +
firm prompt + declared schema) bypasses WF-13 wasc-side with no pi-workflows patch — proven on the live run
(spec 1 + 2: `truncated:true` yet `output` populated from the file).
