"""Apply a sub-agent response to the running draft (Step 3 of the loop).

Reads the agent's response from stdin, validates it by invoking the
production `planner.specs.parse_<spec_key>` function (the snippet's
output_schema is superseded by direct parse-function reuse — what
production accepts is what the workshop accepts), merges the parsed
prefill into `outputs/current-draft.json` per the spec's
(target_step, preview_mode) merge rule, and writes a forensic capture
file at `outputs/<YYYY-MM-DD-HH-MM-SS>/<NN>-<spec-key>.json`.

Exit codes:
  0  applied (clean) or applied-with-advisory-flags (flag-and-continue, DEC-53)
  1  hard reject — the production parse raised (unusable output), or no
     MERGE_RULE is registered for the spec
  2  usage — empty response on stdin
  3  structural self-check failure (DEC-54 / TASK-039) — a structural
     `success_criteria` criterion failed on the merged draft; the output is
     NOT saved and the orchestrator should re-dispatch this spec
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent.parent))

from dispatch._workshop import (  # noqa: E402
    get_parse_function,
    last_render_path,
    load_draft,
    load_snippet,
    save_draft,
    setup_django,
    timestamp_dir,
)
from dispatch.self_check import run_self_check  # noqa: E402

# --- Merge rules -----------------------------------------------------------
#
# Each rule mutates `draft` in place from `prefill`. The mapping is keyed
# by `spec_key` (which is in 1:1 correspondence with the snippet's
# (target_step, preview_mode) per the audit table); keying by spec_key
# avoids an extra layer of indirection while preserving the table shape.

MergeRule = Callable[[dict[str, Any], Any], None]


def _ensure_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def _merge_basics_fields(draft: dict[str, Any], prefill: Any) -> None:
    """A1 — narrative-draft. Form prefill `{field: prose}` lands on `plan`."""
    if not isinstance(prefill, dict):
        raise ValueError(f"narrative-draft prefill must be a dict, got {type(prefill).__name__}")
    draft.setdefault("plan", {}).update(prefill)


def _merge_domain_alignment(draft: dict[str, Any], prefill: Any) -> None:
    """A3 — propose-domain-alignment. Six relations merge into `domain_alignment`."""
    if not isinstance(prefill, dict):
        raise ValueError(
            f"propose-domain-alignment prefill must be a dict, got {type(prefill).__name__}"
        )
    draft.setdefault("domain_alignment", {}).update(prefill)


def _merge_milestones(draft: dict[str, Any], prefill: Any) -> None:
    """D1 — propose-milestones. Append list-of-dicts to `milestones`."""
    draft.setdefault("milestones", []).extend(_ensure_list(prefill))


def _merge_success_criteria(draft: dict[str, Any], prefill: Any) -> None:
    """B1 — draft-success-criteria. Append rows to `success_criteria`."""
    draft.setdefault("success_criteria", []).extend(_ensure_list(prefill))


def _merge_action_steps(draft: dict[str, Any], prefill: Any) -> None:
    """F1 — decompose-action-steps. Append rows to `action_steps`."""
    draft.setdefault("action_steps", []).extend(_ensure_list(prefill))


def _set_indexed_field_on_steps(
    draft: dict[str, Any], prefill: Any, *, fields: tuple[str, ...], label: str
) -> None:
    """Update each existing action_step row from a per-step prefill.

    Used by the step-children specs whose parser key names ALREADY equal the
    draft (and `flatten_draft_for_grounding`) child-collection key names —
    F4 (`resources`/`substeps`) and US-LLM-27 (`*_responsibilities`). Each of
    those preview-modes returns a `list[dict]` aligned position-by-position to
    `action_steps`; the workshop mirrors that: for each row in `prefill`,
    overlay the named `fields` onto the same-indexed step. Out-of-range rows
    are appended as bare step dicts (rare; useful when a step assist runs
    before its parent step row exists). F2/F3/F5, whose parser keys do NOT
    equal the draft child-collection keys, use the dedicated transforms above
    (`_merge_assignments` / `_merge_timelines` / `_merge_evidence`) instead.

    Guard (FGAP-018): a per-step prefill row that carries content beyond
    `step_index` but matches NONE of `fields` would silently copy nothing and
    drop that step's data. When a non-empty row copies zero fields, raise so
    the field-name mismatch fails loud rather than vanishing.
    """
    steps = draft.setdefault("action_steps", [])
    rows = _ensure_list(prefill)
    for idx, row in enumerate(rows):
        if not isinstance(row, dict):
            raise ValueError(f"{label} row #{idx} must be a dict, got {type(row).__name__}")
        if idx < len(steps):
            target = steps[idx]
            if not isinstance(target, dict):  # defensive — should not happen
                target = {}
                steps[idx] = target
        else:
            target = {}
            steps.append(target)
        copied = 0
        for f in fields:
            if f in row:
                target[f] = row[f]
                copied += 1
        row_keys = [k for k in row if k != "step_index"]
        if row_keys and copied == 0:
            raise ValueError(
                f"{label} row #{idx} copied zero fields: row keys {row_keys} match none of "
                f"the expected fields {list(fields)} — the prefill field names do not match "
                "the draft child-collection keys (silent-no-op guard)"
            )


def _resolve_step(
    steps: list[Any], prefill: Any, *, idx: int, label: str
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Validate one prefill row and return its `(row, target_step)` pair.

    Shared preamble for the three transforms below (assignments / timelines /
    evidence). Each parser returns a `list[dict]` of per-step rows carrying a
    `step_index`; the canonical draft shape (`flatten_draft_for_grounding`,
    `_workshop.py:564-576`) projects each step's child collection as a LIST of
    sub-rows under `steps-{step_index}-{seg}-{j}-{field}`, so the transform
    overlays onto `action_steps[step_index]`, creating/extending the list to
    that index the way `_set_indexed_field_on_steps` does.

    Fail-loud: a non-dict row, or a missing / non-int (bool is an int
    subclass) / negative `step_index` raises `ValueError`.
    """
    rows = _ensure_list(prefill)
    row = rows[idx]
    if not isinstance(row, dict):
        raise ValueError(f"{label} row #{idx} must be a dict, got {type(row).__name__}")
    step_index = row.get("step_index")
    if not isinstance(step_index, int) or isinstance(step_index, bool) or step_index < 0:
        raise ValueError(
            f"{label} row #{idx} is missing a non-negative integer 'step_index'; got {step_index!r}"
        )
    while step_index >= len(steps):
        steps.append({})
    target = steps[step_index]
    if not isinstance(target, dict):  # defensive — should not happen
        target = {}
        steps[step_index] = target
    return row, target


def _merge_assignments(draft: dict[str, Any], prefill: Any) -> None:
    """F2 — propose-assignments. Per parser row `{step_index,
    responsible_division}`, overlay the canonical assignment sub-row list
    `[{"kind": "responsible", "division": <label>}]` onto the indexed step's
    `assignments`. The sub-row field names (`kind` / `division`) are the ones
    production `applyAssignmentPrefill` (`ai-assist.js:316-334`) fills and
    `flatten_draft_for_grounding` re-emits as `steps-{i}-assignment-0-{field}`.
    """
    steps = draft.setdefault("action_steps", [])
    for idx in range(len(_ensure_list(prefill))):
        row, target = _resolve_step(steps, prefill, idx=idx, label="propose-assignments")
        responsible_division = row.get("responsible_division")
        if not isinstance(responsible_division, str) or not responsible_division.strip():
            raise ValueError(
                f"propose-assignments row #{idx} is missing a non-empty "
                f"'responsible_division'; got {responsible_division!r}"
            )
        target["assignments"] = [{"kind": "responsible", "division": responsible_division}]


def _merge_timelines(draft: dict[str, Any], prefill: Any) -> None:
    """F3 — propose-timelines. Per parser row `{step_index, kind,
    date|from_date+to_date, note?}`, overlay the canonical timeline sub-row
    list `[{kind, date|from_date+to_date, note?}]` (the row minus
    `step_index`) onto the indexed step's `timeline`. The sub-row fields match
    production `applyTimelinePrefill` (`ai-assist.js:354-386`) and re-emit as
    `steps-{i}-timeline-0-{field}`; only the per-kind keys the parser included
    are carried (the null dates stay omitted).
    """
    steps = draft.setdefault("action_steps", [])
    for idx in range(len(_ensure_list(prefill))):
        row, target = _resolve_step(steps, prefill, idx=idx, label="propose-timelines")
        kind = row.get("kind")
        if not isinstance(kind, str) or not kind.strip():
            raise ValueError(
                f"propose-timelines row #{idx} is missing a non-empty 'kind'; got {kind!r}"
            )
        sub_row = {key: value for key, value in row.items() if key != "step_index"}
        target["timeline"] = [sub_row]


def _merge_evidence(draft: dict[str, Any], prefill: Any) -> None:
    """F5 — propose-evidence. Per parser row `{step_index, evidence:
    [{label, owner_division, location}]}`, overlay the (already canonical)
    `evidence` list onto the indexed step's `evidence_artifacts`. The sub-row
    fields match production `applyEvidencePrefill` (`ai-assist.js:467-501`) and
    re-emit as `steps-{i}-evidence-{j}-{field}`.
    """
    steps = draft.setdefault("action_steps", [])
    for idx in range(len(_ensure_list(prefill))):
        row, target = _resolve_step(steps, prefill, idx=idx, label="propose-evidence")
        evidence = row.get("evidence")
        if not isinstance(evidence, list) or not evidence:
            raise ValueError(
                f"propose-evidence row #{idx} is missing a non-empty 'evidence' list; "
                f"got {evidence!r}"
            )
        target["evidence_artifacts"] = evidence


def _merge_step_resources(draft: dict[str, Any], prefill: Any) -> None:
    _set_indexed_field_on_steps(
        draft,
        prefill,
        fields=("resources", "substeps"),
        label="propose-step-resources",
    )


def _merge_responsibilities(draft: dict[str, Any], prefill: Any) -> None:
    _set_indexed_field_on_steps(
        draft,
        prefill,
        fields=("division_responsibilities", "position_responsibilities"),
        label="propose-responsibilities",
    )


def _merge_feedback_channels(draft: dict[str, Any], prefill: Any) -> None:
    """C1 — suggest-feedback-channels. Append rows to `feedback_channels`."""
    draft.setdefault("feedback_channels", []).extend(_ensure_list(prefill))


def _merge_measurement_bindings(draft: dict[str, Any], prefill: Any) -> None:
    """B2 — bind-measurement-channels. For each criterion row, set channel_indices."""
    criteria = draft.setdefault("success_criteria", [])
    rows = _ensure_list(prefill)
    for idx, row in enumerate(rows):
        if not isinstance(row, dict):
            raise ValueError(
                f"bind-measurement-channels row #{idx} must be a dict, got {type(row).__name__}"
            )
        if idx < len(criteria):
            target = criteria[idx]
            if not isinstance(target, dict):
                target = {}
                criteria[idx] = target
        else:
            target = {}
            criteria.append(target)
        if "channel_indices" in row:
            target["channel_indices"] = row["channel_indices"]


def _merge_accreditation_standards(draft: dict[str, Any], prefill: Any) -> None:
    """A2 — propose-accreditation-standards. Set `accreditation_standards`."""
    draft["accreditation_standards"] = _ensure_list(prefill)


def _merge_review_loop(draft: dict[str, Any], prefill: Any) -> None:
    """G1 — propose-review-loop. Populate review_events / communications / revision_rules."""
    if not isinstance(prefill, dict):
        raise ValueError(
            f"propose-review-loop prefill must be a dict, got {type(prefill).__name__}"
        )
    for key in ("communications", "review_events", "revision_rules"):
        if key in prefill:
            draft[key] = prefill[key]


def _apply_carrier_fields(draft: dict[str, Any], parsed: Any) -> None:
    """Lift a parse's optional carrier fields onto the merged draft pre-self-check.

    The three carrier fields ride a `getattr(parsed, ...)` precedent (like the
    `flags` channel): a parser that does not populate one returns None, leaving
    the draft's existing value untouched. They are read by self-check evaluators
    BEFORE persistence, so this runs after the MERGE_RULE and before
    `run_self_check`. Extracted (FGAP-034) to ONE shared helper so BOTH apply
    attach points (apply.py, apply_from_substrate.py) lift identically — a future
    4th carrier updates only here, never two parallel blocks that can drift.

    - `measurement_views` (TASK-044 / FGAP-037 / DEC-54): C1's three-view
      measurement map — read by the `three_view` evaluator.
    - `bilingual_views` (TASK-046 / FGAP-039 / DEC-54): C1's two-view
      bilingual-measurement map — read by the `bilingual_views` evaluator.
    - `decision_requests` (TASK-048 / FGAP-040 / DEC-0005): F2's in-draft
      decision-request list — read by the `decision_requests` evaluator.

    Generic: only the relevant parser populates each field, so this is a no-op
    (None → leave the draft's value untouched) for every other spec.
    """
    measurement_views = getattr(parsed, "measurement_views", None)
    if measurement_views is not None:
        draft["measurement_views"] = measurement_views

    bilingual_views = getattr(parsed, "bilingual_views", None)
    if bilingual_views is not None:
        draft["bilingual_views"] = bilingual_views

    decision_requests = getattr(parsed, "decision_requests", None)
    if decision_requests is not None:
        draft["decision_requests"] = decision_requests


MERGE_RULES: dict[str, MergeRule] = {
    # target_step=basics
    "narrative-draft": _merge_basics_fields,  # preview=fields
    "propose-domain-alignment": _merge_domain_alignment,  # preview=alignment-formsets
    # target_step=milestones
    "propose-milestones": _merge_milestones,  # preview=fields
    # target_step=criteria
    "draft-success-criteria": _merge_success_criteria,  # preview=fields
    "bind-measurement-channels": _merge_measurement_bindings,  # preview=bindings
    # target_step=steps
    "decompose-action-steps": _merge_action_steps,  # preview=fields
    "propose-assignments": _merge_assignments,  # preview=assignments
    "propose-timelines": _merge_timelines,  # preview=timelines
    "propose-step-resources": _merge_step_resources,  # preview=resources-substeps
    "propose-evidence": _merge_evidence,  # preview=evidence
    "propose-responsibilities": _merge_responsibilities,  # preview=responsibilities
    # target_step=feedback
    "suggest-feedback-channels": _merge_feedback_channels,  # preview=fields
    # target_step=standards
    "propose-accreditation-standards": _merge_accreditation_standards,  # preview=fields
    # target_step=review
    "propose-review-loop": _merge_review_loop,  # preview=review-loop
}


# --- Entry -----------------------------------------------------------------


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="apply.py",
        description=(
            "Validate a sub-agent response and merge its prefill into the running draft. "
            "Exit 0 applied (clean or advisory-flagged); 1 hard reject (parse raised / no "
            "merge rule); 2 usage (empty stdin); 3 structural self-check failure (DEC-54 — "
            "output not saved; re-dispatch the spec)."
        ),
    )
    p.add_argument("spec_key", help="The snippet's frontmatter `spec_key`.")
    return p.parse_args()


def _extract_prefill(parsed: Any) -> tuple[Any, str | None]:
    """Normalize either a bare prefill or an `AssistResult` into (prefill, note)."""
    # Avoid importing AssistResult eagerly so this module stays importable
    # without Django setup; check by attribute presence (duck-type).
    if hasattr(parsed, "prefill"):
        return parsed.prefill, getattr(parsed, "note", None)
    return parsed, None


def _load_grounding_for_parse() -> tuple[Any, dict[str, Any] | None]:
    """Resolve `school` + `grounding` for the parse-time validation pass.

    DEC-40 Commit 1: parse signatures widened to accept `school` and
    `grounding` so subsequent commits can validate against the school's
    enumerated universe. The workshop builds the grounding bundle the
    same way `render.py` does — `flatten_draft_for_grounding` over the
    current draft, then production `build_grounding` against the tenant
    school. Returns `(school, grounding_dict)`. On any failure (no
    tenant school / build_grounding raises) returns
    `(None, None)` so parse falls back to its lenient defaults and the
    workshop loop is never blocked by a grounding-construction error
    that production would have surfaced upstream.
    """
    from dispatch._workshop import (  # noqa: PLC0415 — late import to keep setup_django() sequencing
        flatten_draft_for_grounding,
        get_tenant_school,
        load_draft,
    )

    try:
        school = get_tenant_school()
    except Exception as exc:  # noqa: BLE001
        print(
            f"apply.py: could not resolve tenant school for parse-time grounding: {exc}",
            file=sys.stderr,
        )
        return None, None
    try:
        from ai.services.grounding import build_grounding

        flat_draft = flatten_draft_for_grounding(load_draft())
        grounding = build_grounding(school, draft_state=flat_draft, include=None)
    except Exception as exc:  # noqa: BLE001
        print(
            f"apply.py: build_grounding failed for parse-time validation: {exc}",
            file=sys.stderr,
        )
        return school, None
    return school, grounding


def _capture_path_for(spec_key: str) -> Path:
    """Resolve `outputs/<run>/<NN>-<spec_key>.json` for the active run.

    The NN- prefix mirrors the snippet filename when discoverable, matching
    the success-path capture naming.
    """
    nn_prefix = ""
    snippets_dir = Path(__file__).parent.parent / "snippets"
    for cand in sorted(snippets_dir.glob(f"*-{spec_key}.md")):
        nn_prefix = cand.stem.split("-", 1)[0] + "-"
        break
    return timestamp_dir() / f"{nn_prefix}{spec_key}.json"


def _write_self_check_failure_capture(
    spec_key: str,
    frontmatter: dict[str, Any],
    response_text: str,
    prefill: Any,
    note: str | None,
    self_check: dict[str, Any],
) -> None:
    """Persist a forensic capture for a structural self-check failure.

    The merged draft is NOT saved on a structural failure (so the retry's
    grounding stays at the prior spec's state), but the failing output is
    recorded here so the failure is forensically visible. `self_check` carries
    the failing criterion/reason; `schema_validation` marks the outcome
    distinct from a clean/flagged save.
    """
    capture = {
        "spec_key": spec_key,
        "target_step": frontmatter.get("target_step"),
        "preview_mode": frontmatter.get("preview_mode"),
        "agent_response_raw": response_text,
        "agent_response_parsed": prefill,
        "parse_note": note,
        "schema_validation": "self_check_failed",
        "self_check": self_check,
        "draft_changed": False,
    }
    capture_path = _capture_path_for(spec_key)
    capture_path.write_text(
        json.dumps(capture, indent=2, ensure_ascii=False, default=str) + "\n",
        encoding="utf-8",
    )
    print(f"apply.py: self-check failure capture written to {capture_path}", file=sys.stderr)


def main() -> int:
    args = _parse_args()
    setup_django()

    frontmatter, _body = load_snippet(args.spec_key)
    response_text = sys.stdin.read()
    if not response_text.strip():
        print("apply.py: empty response on stdin", file=sys.stderr)
        return 2

    parse_fn = get_parse_function(args.spec_key)
    school, grounding = _load_grounding_for_parse()
    try:
        parsed = parse_fn(response_text, school=school, grounding=grounding)
    except Exception as exc:  # noqa: BLE001 — production parse raises ValueError + subclasses
        print(
            f"apply.py: {args.spec_key} parse failed: {exc.__class__.__name__}: {exc}",
            file=sys.stderr,
        )
        return 1
    prefill, note = _extract_prefill(parsed)

    if args.spec_key not in MERGE_RULES:
        print(
            f"apply.py: no MERGE_RULE registered for spec_key={args.spec_key!r}",
            file=sys.stderr,
        )
        return 1

    draft = load_draft()
    before = json.dumps(draft, sort_keys=True, default=str)
    MERGE_RULES[args.spec_key](draft, prefill)

    # FGAP-034: lift the optional carrier fields (measurement_views /
    # bilingual_views / decision_requests) onto the draft BEFORE the self-check,
    # via the single shared helper both apply paths call (so the lift cannot
    # drift between paths). No-op for specs whose parser does not populate them.
    _apply_carrier_fields(draft, parsed)

    after = json.dumps(draft, sort_keys=True, default=str)

    # Per-spec in-execution self-check (DEC-54 / TASK-039). Runs on the
    # in-memory MERGED draft BEFORE persistence: a STRUCTURAL criterion
    # failure hard-fails the apply so the orchestrator re-dispatches this
    # spec — the failing output is never saved (draft_state stays at the
    # prior spec's state, giving the retry clean grounding). The failure is
    # still recorded in a capture for forensics. Advisory failures do not
    # gate; they flow alongside the soft-flag path below.
    self_check = run_self_check(frontmatter, draft, prefill, grounding)
    if not self_check["structural_passed"]:
        _write_self_check_failure_capture(
            args.spec_key, frontmatter, response_text, prefill, note, self_check
        )
        for failure in self_check["failures"]:
            print(
                f"apply.py: {args.spec_key} structural self-check FAILED "
                f"[{failure['id']}]: {failure['reason']}",
                file=sys.stderr,
            )
        return 3

    save_draft(draft)

    # Soft-flag outcome (FGAP-006 / B2): a usable parse that carries flags
    # keeps its proposed values (already merged above) AND records its flags
    # into the draft's flags channel (B1), then re-saves to persist them.
    # `flags_raw` is empty for a clean parse, so this is a no-op there and
    # the clean-parse path stays byte-for-byte unchanged. A hard reject never
    # reaches here (it returned 1 at the parse try/except).
    flags_raw = getattr(parsed, "flags", None) or []
    serialized_flags = [dataclasses.asdict(f) for f in flags_raw]
    if serialized_flags:
        draft.setdefault("flags", []).extend(serialized_flags)
        save_draft(draft)

    # Fold the render pointer (if present) into the capture so each
    # capture is forensically self-contained.
    #
    # `grounding_dict_used` is the post-flatten grounding bundle: render.py
    # calls `flatten_draft_for_grounding` BEFORE `build_grounding`, so the
    # `draft_state` slice inside `grounding_dict_used` is the flat
    # `{form-field-name: value}` shape (byte-equivalent to production's
    # `collectDraftState`), not the structured `current-draft.json` shape.
    # Capturing through the pointer preserves that flat shape verbatim —
    # the LLM saw what this capture records.
    rendered_prompt: str | None = None
    grounding_used: dict[str, Any] | None = None
    last_render_file = last_render_path()
    if last_render_file.exists():
        try:
            last = json.loads(last_render_file.read_text(encoding="utf-8"))
            if last.get("spec_key") == args.spec_key:
                rendered_prompt = last.get("rendered_prompt")
                grounding_used = last.get("grounding_dict_used")
        except Exception as exc:  # noqa: BLE001
            print(f"warning: could not load last-render.json: {exc}", file=sys.stderr)

    # Capture file naming mirrors the snippet's NN- prefix when discoverable.
    capture_path = _capture_path_for(args.spec_key)
    capture = {
        "spec_key": args.spec_key,
        "target_step": frontmatter.get("target_step"),
        "preview_mode": frontmatter.get("preview_mode"),
        "rendered_prompt": rendered_prompt,
        "grounding_dict_used": grounding_used,
        "agent_response_raw": response_text,
        "agent_response_parsed": prefill,
        "parse_note": note,
        "schema_validation": "flagged" if serialized_flags else "passed",
        "flags": serialized_flags,
        "self_check": self_check,
        "draft_changed": before != after,
    }
    capture_path.write_text(
        json.dumps(capture, indent=2, ensure_ascii=False, default=str) + "\n",
        encoding="utf-8",
    )

    marker = "flagged" if serialized_flags else "passed"
    print(f"apply.py: {args.spec_key} parse={marker}; draft_changed={before != after}")
    if note:
        print(f"apply.py: parse note: {note}")
    print(f"apply.py: capture written to {capture_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
