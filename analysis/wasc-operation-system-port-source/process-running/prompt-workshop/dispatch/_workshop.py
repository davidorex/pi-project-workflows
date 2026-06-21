"""Shared helpers for the prompt-workshop dispatch tooling.

This module is the single seam through which `render.py`, `apply.py`, and
`sequence.py` reach Django, the production grounding pipeline, the snippet
files, the running draft, and the per-spec production parse functions.

No new dependencies: the YAML-frontmatter parser is inlined (snippets only
use a tiny YAML subset); validation reuses `planner.specs.parse_*` rather
than JSON Schema.
"""

from __future__ import annotations

import datetime as _dt
import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Any, Protocol

WORKSHOP_ROOT: Path = Path(__file__).parent.parent.resolve()
DJANGO_PROJECT_ROOT: Path = (WORKSHOP_ROOT.parent / "school-improvement-plans").resolve()

# --- Django setup ----------------------------------------------------------

_DJANGO_READY = False


def setup_django() -> None:
    """Add the Django project to sys.path and call django.setup(). Idempotent."""
    global _DJANGO_READY
    if _DJANGO_READY:
        return
    project_root = str(DJANGO_PROJECT_ROOT)
    if project_root not in sys.path:
        sys.path.insert(0, project_root)
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")
    import django  # local import — Django not on path until above runs

    django.setup()
    _DJANGO_READY = True


# --- Frontmatter parser (no pyyaml) ---------------------------------------

# Supports exactly the YAML subset the workshop snippets use:
#   key: scalar             (string scalar)
#   key: []                 (empty list)
#   key: [a, b, c]          (inline bracket list of bare strings)
#   key:                    (begins an indented dash-prefixed list-of-strings)
#     - value1
#     - value2

_FRONTMATTER_SCALAR_KEYS = {
    "spec_key",
    "target_step",
    "preview_mode",
    "output_schema",
    "source_migration",
}
_FRONTMATTER_LIST_KEYS = {"deps", "grounding_sections", "success_criteria"}


def _parse_bracket_list(raw: str) -> list[str]:
    """Parse `[a, b, c]` (bare strings, no quotes/nesting) into a list."""
    inner = raw.strip()
    assert inner.startswith("[") and inner.endswith("]"), raw
    body = inner[1:-1].strip()
    if not body:
        return []
    return [item.strip() for item in body.split(",") if item.strip()]


def parse_frontmatter(md_text: str) -> tuple[dict[str, Any], str]:
    """Split an MD file on its leading `---\\n...\\n---\\n` frontmatter block.

    Returns `(frontmatter_dict, body_str)`. Raises `ValueError` if the file
    has no leading `---` frontmatter delimiter.
    """
    if not md_text.startswith("---\n"):
        raise ValueError("snippet missing leading `---` frontmatter delimiter")
    rest = md_text[len("---\n") :]
    end_idx = rest.find("\n---\n")
    if end_idx < 0:
        raise ValueError("snippet missing closing `---` frontmatter delimiter")
    fm_block = rest[:end_idx]
    body = rest[end_idx + len("\n---\n") :]

    fm: dict[str, Any] = {}
    pending_list_key: str | None = None
    pending_list: list[str] = []

    def _flush_pending() -> None:
        nonlocal pending_list_key, pending_list
        if pending_list_key is not None:
            fm[pending_list_key] = pending_list
            pending_list_key = None
            pending_list = []

    for raw_line in fm_block.split("\n"):
        line = raw_line.rstrip()
        if not line.strip():
            continue
        # An indented dash-prefixed continuation of the current list key.
        stripped = line.lstrip()
        leading_ws = len(line) - len(stripped)
        if pending_list_key is not None and leading_ws > 0 and stripped.startswith("- "):
            pending_list.append(stripped[2:].strip())
            continue
        # Otherwise this line starts a new key — flush any pending list first.
        _flush_pending()
        if ":" not in line:
            raise ValueError(f"frontmatter line missing `:` — {line!r}")
        key, _, val = line.partition(":")
        key = key.strip()
        val = val.strip()
        if key in _FRONTMATTER_LIST_KEYS:
            if val == "":
                pending_list_key = key
                pending_list = []
            elif val.startswith("[") and val.endswith("]"):
                fm[key] = _parse_bracket_list(val)
            else:
                raise ValueError(f"frontmatter list key {key!r} carries unexpected scalar {val!r}")
        elif key in _FRONTMATTER_SCALAR_KEYS:
            fm[key] = val
        else:
            # Unknown key — keep as a scalar; defensive, not strict.
            fm[key] = val
    _flush_pending()
    return fm, body


# --- Snippet loading -------------------------------------------------------


def load_snippet(spec_key: str) -> tuple[dict[str, Any], str]:
    """Locate `WORKSHOP_ROOT/snippets/<NN>-<spec_key>.md` and parse it."""
    snippets_dir = WORKSHOP_ROOT / "snippets"
    matches = sorted(snippets_dir.glob(f"*-{spec_key}.md"))
    if not matches:
        raise FileNotFoundError(f"no snippet found for spec_key={spec_key!r} in {snippets_dir}")
    if len(matches) > 1:
        raise ValueError(f"multiple snippets matched spec_key={spec_key!r}: {matches}")
    text = matches[0].read_text(encoding="utf-8")
    return parse_frontmatter(text)


# --- Substrate (.workshopping) readers -------------------------------------


def load_fragments() -> dict[str, dict[str, Any]]:
    """Read `.workshopping/prompt-fragment.json` -> {fragment_id: item}."""
    path = WORKSHOP_ROOT.parent / ".workshopping" / "prompt-fragment.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    return {item["id"]: item for item in data["fragments"]}


def load_prompt_spec(spec_key: str) -> dict[str, Any]:
    """Find the `.workshopping/prompt-spec.json` item for `spec_key`."""
    path = WORKSHOP_ROOT.parent / ".workshopping" / "prompt-spec.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    for item in data["specs"]:
        if item.get("spec_key") == spec_key:
            return item
    raise KeyError(f"no prompt-spec item with spec_key={spec_key!r}")


def assemble_spec_body(spec: dict[str, Any], fragments: dict[str, dict[str, Any]]) -> str:
    """Compose the spec body as text: join fragment bodies in `fragment_refs` order.

    Text-only; no Django interpretation. Mirrors the §1.1/§1.4 composition rule
    (`"\\n".join(fragments[fid]["body"] for fid in fragment_refs)`).
    """
    return "\n".join(fragments[fid]["body"] for fid in spec["fragment_refs"])


# --- Preamble substitution -------------------------------------------------

_PREAMBLE_BEGIN = "<!-- BEGIN PREAMBLE BODY"
_PREAMBLE_END = "<!-- END PREAMBLE BODY -->"
_PREAMBLE_INCLUDE_LITERAL = '{% include "shared/preamble.md" %}'


def preamble_substitute(body: str) -> str:
    """Replace the literal include token in `body` with the preamble body.

    Reads `WORKSHOP_ROOT/shared/preamble.md`, extracts the content between
    the BEGIN/END markers (the preamble.md BEGIN marker carries a trailing
    parenthetical so the prefix match handles both `<!-- BEGIN PREAMBLE
    BODY -->` and `<!-- BEGIN PREAMBLE BODY (... ) -->`), and substitutes
    into the snippet body. If the include token is absent, returns the body
    unchanged.
    """
    preamble_path = WORKSHOP_ROOT / "shared" / "preamble.md"
    preamble_text = preamble_path.read_text(encoding="utf-8")
    begin_idx = preamble_text.find(_PREAMBLE_BEGIN)
    if begin_idx < 0:
        raise ValueError(f"preamble.md missing BEGIN marker {_PREAMBLE_BEGIN!r}")
    # Move past the begin-marker line entirely (consume until the next newline).
    after_begin = preamble_text.find("\n", begin_idx)
    if after_begin < 0:
        raise ValueError("preamble.md BEGIN marker not followed by newline")
    end_idx = preamble_text.find(_PREAMBLE_END, after_begin)
    if end_idx < 0:
        raise ValueError(f"preamble.md missing END marker {_PREAMBLE_END!r}")
    preamble_body = preamble_text[after_begin + 1 : end_idx].strip("\n")
    return body.replace(_PREAMBLE_INCLUDE_LITERAL, preamble_body)


# --- Draft IO --------------------------------------------------------------

_EMPTY_DRAFT: dict[str, Any] = {
    "meta": {
        "entry_mode": None,
        "seed_text": "",
        "source_proposal_id": None,
        "started_at": None,
    },
    "plan": {},
    "milestones": [],
    "phases": [],
    "action_steps": [],
    "success_criteria": [],
    "feedback_channels": [],
    "evidence_artifacts": [],
    "review_events": [],
    "communications": [],
    "revision_rules": [],
    "accreditation_standards": [],
    "domain_alignment": {
        "learner_outcomes_targeted": [],
        "mission_areas_targeted": [],
        "areas_for_improvement": [],
        "stakeholder_impact": [],
        "policies_established": [],
        "policies_revised": [],
        # TASK-040 (Option A / DEC-54): authored-coverage acknowledgments —
        # the catalogue rows the plan records as deferred this cycle, each a
        # {label, reason} object. The coverage self-check reads these so every
        # universe row is either targeted OR a recorded gap.
        "learner_outcomes_not_addressed": [],
        "areas_for_improvement_not_addressed": [],
    },
    "guiding_clauses": [],
    "responsibilities": {"division": [], "position": []},
    # TASK-044 (FGAP-037 / DEC-54): C1's three-view measurement map. Each of the
    # fixed view-ids {student_outcomes, staff_practice, parent_stakeholder} maps
    # to a 0-based index into `feedback_channels` (the covering channel) OR a
    # {"gap": <reason>} object. Empty default → the `three_view` self-check
    # treats every view as unaccounted (fail) until C1 populates it.
    "measurement_views": {},
    # TASK-046 (FGAP-039 / DEC-54): C1's two-view bilingual-measurement map.
    # Each of the fixed view-ids {staff_english_usage,
    # student_bilingual_progress} maps to a 0-based index into
    # `feedback_channels` (the covering channel) OR a {"gap": <reason>} object.
    # Empty default → the `bilingual_views` self-check treats every view as
    # unaccounted (fail) until C1 populates it.
    "bilingual_views": {},
    # TASK-048 (FGAP-040 / DEC-0005): F2's in-draft decision-request list — the
    # upward escalation for an action-step precursor no division can own. Each
    # entry is an object with the four non-empty string fields {what_decision,
    # from_whom, why, blocks_unblocks}. Empty default → the `decision_requests`
    # self-check PASSES (an empty list is well-formed; completeness — every
    # unowned precursor escalated — is adversarial, NOT this deterministic gate).
    "decision_requests": [],
    "flags": [],
}


def empty_draft_shell() -> dict[str, Any]:
    """Return a deep copy of the canonical empty draft shape."""
    return json.loads(json.dumps(_EMPTY_DRAFT))


def draft_path() -> Path:
    return WORKSHOP_ROOT / "outputs" / "current-draft.json"


def load_draft(path: Path | None = None) -> dict[str, Any]:
    """Read `outputs/current-draft.json` (or the override path); empty shell if absent."""
    # argparse `type=Path` turns an absent `--draft-path ""` into `Path("")`,
    # which equals `Path(".")` — an existing directory whose `.exists()` is True
    # and whose `read_text()` raises IsADirectoryError. Treat an empty path as
    # absent and return a FRESH empty shell (not the `draft_path()` default,
    # which could load a stale current-draft.json).
    if path is not None and path == Path("."):
        return empty_draft_shell()
    target = path or draft_path()
    if not target.exists():
        return empty_draft_shell()
    return json.loads(target.read_text(encoding="utf-8"))


def save_draft(draft: dict[str, Any], path: Path | None = None) -> None:
    """Atomic write of the running draft (tempfile + rename)."""
    target = path or draft_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=".draft-", suffix=".json", dir=str(target.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(draft, f, indent=2, ensure_ascii=False, default=str)
            f.write("\n")
        os.replace(tmp_name, target)
    except Exception:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)
        raise


def timestamp_dir() -> Path:
    """Return (and create) `outputs/<YYYY-MM-DD-HH-MM-SS>/` for the active run."""
    stamp = _dt.datetime.now().strftime("%Y-%m-%d-%H-%M-%S")
    out = WORKSHOP_ROOT / "outputs" / stamp
    out.mkdir(parents=True, exist_ok=True)
    return out


def last_render_path() -> Path:
    return WORKSHOP_ROOT / "outputs" / "last-render.json"


# --- Tenant scope ----------------------------------------------------------


def get_tenant_school() -> Any:
    """Return the workshop's tenant `School` row (`slug=chiway-repton-xiamen`)."""
    setup_django()
    from school.models import School

    return School.objects.get(slug="chiway-repton-xiamen")


# --- Production parse-function registry -----------------------------------

# spec_key (the snippet's frontmatter `spec_key`) → name of the
# `parse_*` callable in `planner.specs`. The mapping is the authoritative
# bridge between the workshop's snippet identity and the production
# validator the snippet's output must satisfy.
_PARSE_FN_NAMES: dict[str, str] = {
    "narrative-draft": "parse_narrative",
    "propose-domain-alignment": "parse_propose_domain_alignment",
    "propose-milestones": "parse_propose_milestones",
    "draft-success-criteria": "parse_draft_success_criteria",
    "decompose-action-steps": "parse_decompose_action_steps",
    "propose-assignments": "parse_propose_assignments",
    "propose-responsibilities": "parse_propose_responsibilities",
    "propose-timelines": "parse_propose_timelines",
    "propose-step-resources": "parse_propose_step_resources",
    "propose-evidence": "parse_propose_evidence",
    "suggest-feedback-channels": "parse_suggest_feedback_channels",
    "bind-measurement-channels": "parse_bind_measurement_channels",
    "propose-accreditation-standards": "parse_propose_accreditation_standards",
    "propose-review-loop": "parse_propose_review_loop",
}


class ParseFunction(Protocol):
    def __call__(
        self, text: str, *, school: Any = None, grounding: dict[str, Any] | None = None
    ) -> Any: ...


def get_parse_function(spec_key: str) -> ParseFunction:
    """Return the production parse callable for `spec_key`.

    Raises `KeyError` if the spec_key is not in the registry (i.e. the
    workshop snippet has been added but its production validator name has
    not been registered here). Raises `AttributeError` if the registered
    name does not resolve in `planner.specs` (i.e. a rename happened in
    production and the registry was not updated).
    """
    setup_django()
    fn_name = _PARSE_FN_NAMES[spec_key]
    from planner import specs as _specs

    return getattr(_specs, fn_name)


# --- Draft-state flattening (render-time projection to production shape) ---
#
# The workshop's `current-draft.json` carries the structured Plan-aggregate
# shape (draft["plan"]["current_state"], draft["milestones"][0]["label"], …)
# for human readability + whole-plan iteration. Production prompt templates,
# however, iterate `draft_state.items` as a FLAT `{form-field-name: value}`
# dict — what production's browser-side `collectDraftState()`
# (`planner/static/wizard/js/ai-assist.js:143-150`) emits by walking every
# `<input|select|textarea>.name` in the wizard `<form>`. Form-step fields are
# bare-named; formset-step fields are namespaced `{prefix}-{index}-{field}`.
#
# `flatten_draft_for_grounding` is the workshop-side mirror of
# `collectDraftState`, run at render time in `render.py` before the
# structured draft would otherwise reach `build_grounding`. Output is the
# same flat shape production sends to `AssistStreamView` (`planner/views.py`
# ~404-508 — `draft_state` is forwarded verbatim to `build_grounding`), so a
# template tested in the workshop iterates the identical shape it will in
# production.
#
# Formset prefix map (source-of-truth: `planner/steps.py::STEPS` keys, which
# are passed to `formset_factory(prefix=...)` in `planner/views.py:113-122`;
# nested-segment constants from `planner/formsets.py`):
#
#   step.key="basics"     →  PlanForm fields are BARE-NAMED (no prefix).
#                            extra formsets keyed by dict name:
#                              - "standards"
#                              - "guiding_clauses"
#                              - "learner_outcomes_targeted"
#                              - "mission_areas_targeted"
#                              - "areas_for_improvement"
#                              - "stakeholder_impact"
#                              - "policies_established"
#                              - "policies_revised"
#   step.key="criteria"   →  SuccessCriterionFormSet prefix "criteria"
#                            nested: "{criteria-i}-measurement"
#                            doubly nested: "{criteria-i-measurement-j}-channel"
#   step.key="feedback"   →  FeedbackChannelFormSet prefix "feedback"
#   step.key="milestones" →  MilestoneFormSet prefix "milestones"
#   step.key="phases"     →  PhaseFormSet prefix "phases"
#   step.key="steps"      →  ActionStepFormSet prefix "steps"
#                            nested per ACTIONSTEP_CHILD_FORMSETS:
#                              - assignment, timeline, resource, substep,
#                                responsibility, position_responsibility
#                            plus ACTIONSTEP_EVIDENCE = "evidence"
#   step.key="review"     →  CommunicationFormSet prefix "review"  ← N.B.
#                            extra formsets: "review_events", "revision_rules"
#                            nested under each event: "input"
#
# Note: production's primary-formset prefix for the review step is "review"
# (its step.key), not "communications" — the structured draft's
# `draft["communications"][i]` projects to `review-{i}-{field}` keys.

# Per-step-children nested segments under "steps-{i}-" (from
# `planner/formsets.py::ACTIONSTEP_CHILD_FORMSETS` keys + ACTIONSTEP_EVIDENCE).
# The structured-draft field name → nested-segment mapping below mirrors the
# apply-side merge rule field names (`assignments`, `timeline`, `resources`,
# `substeps`, `division_responsibilities`, `position_responsibilities`,
# `evidence_artifacts`).
_STEP_CHILD_SEGMENTS: dict[str, str] = {
    "assignments": "assignment",
    "timeline": "timeline",
    "resources": "resource",
    "substeps": "substep",
    "division_responsibilities": "responsibility",
    "position_responsibilities": "position_responsibility",
    "evidence_artifacts": "evidence",
}

# The six DEC-32 Layer-2b alignment relations under draft["domain_alignment"]
# project to extra-formset prefixes whose names equal the M2M form-field
# names (the keys in `STEPS[basics].extra_formsets`).
_ALIGNMENT_RELATIONS: tuple[str, ...] = (
    "learner_outcomes_targeted",
    "mission_areas_targeted",
    "areas_for_improvement",
    "stakeholder_impact",
    "policies_established",
    "policies_revised",
)


def _coerce_leaf(value: Any) -> str | None:
    """Coerce a structured-draft leaf to the string production form-fields emit.

    Returns None for values production's `collectDraftState` would emit as
    empty (None / empty string / empty list); the prompt templates use
    `{% if value %}` to skip those, so dropping them at the source keeps the
    flat dict tight. Booleans render as "true"/"false" (Django form widget
    convention for the BooleanField checked state); lists are JSON-encoded
    (production's M2M fields render as repeated form-fields, but the
    workshop carries them as a Python list — a JSON string keeps the leaf
    a single scalar the template can show).
    """
    if value is None:
        return None
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, str):
        return value if value else None
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, list):
        if not value:
            return None
        return json.dumps(value, ensure_ascii=False, default=str)
    # Fallback: stringify any other scalar (dates, UUIDs, etc.).
    return str(value)


def _emit_row(out: dict[str, str], prefix: str, index: int, row: dict[str, Any]) -> None:
    """Project a formset row dict into `{prefix}-{index}-{field}` keys."""
    if not isinstance(row, dict):
        return
    for field, value in row.items():
        coerced = _coerce_leaf(value)
        if coerced is None:
            continue
        out[f"{prefix}-{index}-{field}"] = coerced


def flatten_draft_for_grounding(draft: dict[str, Any]) -> dict[str, str]:
    """Project the structured workshop draft into the flat production draft_state.

    Output is byte-equivalent to what production's browser-side
    `collectDraftState()` emits from the planner form: bare-named fields
    for the basics step's `PlanForm`, and `{prefix}-{index}-{field}` keys
    for every formset row (nested rows carry `{parent_prefix}-{i}-{seg}-{j}-{field}`).

    Empty/None values are skipped (production's `{% if value %}` template
    guard would do the same). `draft["meta"]` is workshop bookkeeping
    (entry_mode / seed_text / source_proposal_id / started_at) with no
    production form-field counterpart — production carries the seed via
    `PromptTemplate.render(seed=…)`, not in `draft_state` — so it is
    skipped entirely. Insertion order is preserved (Python dict order is
    insertion-order in 3.7+) for human readability of the rendered prompt.
    """
    out: dict[str, str] = {}

    # PlanForm scalars (basics step) — bare-named, no prefix.
    plan = draft.get("plan") or {}
    if isinstance(plan, dict):
        for field, value in plan.items():
            coerced = _coerce_leaf(value)
            if coerced is None:
                continue
            out[field] = coerced

    # Plan-owned formsets keyed by their production prefix (step.key for
    # primary formsets; extra_formsets dict-key for the basics + review
    # extras).
    for i, row in enumerate(draft.get("milestones") or []):
        _emit_row(out, "milestones", i, row)
    for i, row in enumerate(draft.get("phases") or []):
        _emit_row(out, "phases", i, row)
    for i, row in enumerate(draft.get("feedback_channels") or []):
        _emit_row(out, "feedback", i, row)
    # Note: production's primary review-step formset is Communications, with
    # prefix "review" (its step.key). The structured `draft["communications"]`
    # projects to `review-{i}-{field}`.
    for i, row in enumerate(draft.get("communications") or []):
        _emit_row(out, "review", i, row)
    for i, row in enumerate(draft.get("review_events") or []):
        if not isinstance(row, dict):
            continue
        # Top-level event fields.
        for field, value in row.items():
            if field == "inputs":
                continue
            coerced = _coerce_leaf(value)
            if coerced is None:
                continue
            out[f"review_events-{i}-{field}"] = coerced
        # Nested ReviewEventInput rows under each event.
        for j, sub in enumerate(row.get("inputs") or []):
            _emit_row(out, f"review_events-{i}-input", j, sub)
    for i, row in enumerate(draft.get("revision_rules") or []):
        _emit_row(out, "revision_rules", i, row)
    for i, row in enumerate(draft.get("accreditation_standards") or []):
        _emit_row(out, "standards", i, row)
    for i, row in enumerate(draft.get("guiding_clauses") or []):
        _emit_row(out, "guiding_clauses", i, row)

    # Success criteria with nested measurements and (doubly) nested channels.
    for i, row in enumerate(draft.get("success_criteria") or []):
        if not isinstance(row, dict):
            continue
        for field, value in row.items():
            if field == "measurements":
                continue
            coerced = _coerce_leaf(value)
            if coerced is None:
                continue
            out[f"criteria-{i}-{field}"] = coerced
        for j, m_row in enumerate(row.get("measurements") or []):
            if not isinstance(m_row, dict):
                continue
            for m_field, m_value in m_row.items():
                if m_field == "channels":
                    continue
                coerced = _coerce_leaf(m_value)
                if coerced is None:
                    continue
                out[f"criteria-{i}-measurement-{j}-{m_field}"] = coerced
            for k, c_row in enumerate(m_row.get("channels") or []):
                _emit_row(out, f"criteria-{i}-measurement-{j}-channel", k, c_row)

    # Action steps with their per-step children. Top-level step fields project
    # to `steps-{i}-{field}`; child collections project to nested segments
    # whose names come from ACTIONSTEP_CHILD_FORMSETS (+ ACTIONSTEP_EVIDENCE).
    for i, row in enumerate(draft.get("action_steps") or []):
        if not isinstance(row, dict):
            continue
        for field, value in row.items():
            if field in _STEP_CHILD_SEGMENTS:
                continue
            coerced = _coerce_leaf(value)
            if coerced is None:
                continue
            out[f"steps-{i}-{field}"] = coerced
        for draft_key, seg in _STEP_CHILD_SEGMENTS.items():
            for j, sub in enumerate(row.get(draft_key) or []):
                _emit_row(out, f"steps-{i}-{seg}", j, sub)

    # DEC-32 Layer 2b alignment relations — each is an extra formset under
    # the basics step whose prefix equals the relation name.
    alignment = draft.get("domain_alignment") or {}
    if isinstance(alignment, dict):
        for relation in _ALIGNMENT_RELATIONS:
            for i, row in enumerate(alignment.get(relation) or []):
                _emit_row(out, relation, i, row)

    # `draft["meta"]` is workshop bookkeeping (no production form-field
    # equivalent) and `draft["responsibilities"]` is the workshop's
    # whole-plan responsibility roll-up (not a step-level form field — the
    # per-step responsibilities project above under
    # `steps-{i}-responsibility` and `steps-{i}-position_responsibility`).
    # `draft["flags"]` is the workshop-internal soft-flag channel
    # (FGAP-005): per-spec soft flags accumulated across the
    # draft-after-<spec>.json chain, with no production form-field
    # counterpart. All three are intentionally excluded from the grounding
    # projection — `flatten_draft_for_grounding` is a pure allowlist, so
    # `flags` is omitted automatically (no filtering needed here).

    return out
