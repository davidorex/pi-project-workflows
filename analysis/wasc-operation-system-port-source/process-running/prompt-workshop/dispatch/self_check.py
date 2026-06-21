"""Per-spec in-execution self-check (DEC-54, TASK-039 / T2).

DEC-54 decided that each spec carries machine-checkable success/process
criteria in its snippet frontmatter, and that a per-spec self-check runs at
the apply attach point — AFTER the in-memory merge, BEFORE the draft is
persisted. A STRUCTURAL criterion failure HARD-FAILS the apply (apply.py
returns the dedicated exit code) so the orchestrator re-dispatches that spec;
LANGUAGE/advisory items keep the flag-and-continue posture (DEC-53). The
whole-draft `check_draft` safety net is unchanged.

This module is the generic mechanism (T2): a registry of evaluators keyed by
an evaluator-id, and a runner that reads a spec's `success_criteria`
frontmatter, dispatches each criterion to its evaluator, and partitions the
outcomes into structural (gating) failures vs advisory (non-gating) flags. T2
ships ONE generic evaluator, `min_list_size`; the real coverage/distribution
evaluators land in T3/T4 by registering here (reusing `check_draft` fns)
WITHOUT touching apply.py.

Frontmatter shape (`success_criteria`, parsed as a list-of-strings by
`_workshop.parse_frontmatter`): each entry is a JSON object string

    {"id": <evaluator-id>, "kind": "structural"|"advisory", "params": {...}}

An empty / absent `success_criteria` means no self-check — `structural_passed`
True, no failures.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

# TASK-041 (T4): the distribution evaluator REUSES check_draft.check_owner_distribution
# as the single source of truth for the >50% / <2-owner threshold — it does NOT
# re-derive it here. check_draft's module body imports dispatch._workshop and
# inserts the package path into sys.path; it does NOT run Django setup at import
# (that is deferred to a function), so this top-level import is import-safe.
from dispatch.check_draft import check_owner_distribution, check_review_cadence

# An evaluator decides one criterion against the merged draft. It receives the
# in-memory merged draft, the parsed prefill, the criterion's `params`, and the
# grounding bundle (None when grounding could not be built — see
# `_load_grounding_for_parse`); it returns {"passed": bool, "reason": str}.
Evaluator = Callable[
    [dict[str, Any], Any, dict[str, Any], dict[str, Any] | None],
    dict[str, Any],
]


def _eval_min_list_size(
    merged_draft: dict[str, Any],
    prefill: Any,
    params: dict[str, Any],
    grounding: dict[str, Any] | None,
) -> dict[str, Any]:
    """Generic: the named merged-draft list has at least `min` items.

    params: {"field": <draft-list-name>, "min": <int>}. `field` names a key in
    the MERGED draft (e.g. "milestones", "action_steps") — NOT a raw prefill
    key — so the criterion checks what was actually committed to the draft. A
    missing / null list counts as zero (a list with `min >= 1` fails on empty
    by design: emptiness is a genuine shortfall for these specs).

    Params are validated rather than bracket-indexed: a missing/wrong-typed
    `field` or `min` returns a `{"passed": False, "reason": ...}` shortfall
    instead of raising. The runner's per-criterion guard is the authoritative
    backstop (nothing escapes `run_self_check` regardless), but validating here
    keeps the malformed-params reason specific to the evaluator.
    """
    field = params.get("field")
    if not isinstance(field, str) or not field:
        return {
            "passed": False,
            "reason": (f"malformed params: 'field' must be a non-empty string; got {field!r}"),
        }
    minimum = params.get("min")
    if not isinstance(minimum, int) or isinstance(minimum, bool):
        return {
            "passed": False,
            "reason": f"malformed params: 'min' must be an int; got {minimum!r}",
        }
    actual = len(merged_draft.get(field) or [])
    passed = actual >= minimum
    return {
        "passed": passed,
        "reason": (
            f"draft[{field!r}] has {actual} item(s); requires >= {minimum}"
            if not passed
            else f"draft[{field!r}] has {actual} item(s) (>= {minimum})"
        ),
    }


# TASK-040 (T3 / DEC-54): the dimension param value → the merged-draft
# `domain_alignment` keys it reads. The universe is read from
# `grounding[dimension]` (the grounding section keyed by the dimension name —
# `learner_outcomes` / `areas_for_improvement` — each row carrying a `label`).
_COVERAGE_DIMENSIONS: dict[str, tuple[str, str]] = {
    # dimension -> (targeted-field, not_addressed-field) in domain_alignment
    "learner_outcomes": ("learner_outcomes_targeted", "learner_outcomes_not_addressed"),
    "areas_for_improvement": ("areas_for_improvement", "areas_for_improvement_not_addressed"),
}


def _labels_from_rows(rows: Any) -> set[str]:
    """Collect non-empty string `label` values from a list of dict rows.

    Tolerant: a non-list, non-dict rows, or rows missing / non-string `label`
    contribute nothing (the evaluator decides pass/fail on the resulting set,
    never raises on shape)."""
    labels: set[str] = set()
    if not isinstance(rows, list):
        return labels
    for row in rows:
        if isinstance(row, dict):
            label = row.get("label")
            if isinstance(label, str) and label.strip():
                labels.add(label)
    return labels


def _eval_coverage(
    merged_draft: dict[str, Any],
    prefill: Any,
    params: dict[str, Any],
    grounding: dict[str, Any] | None,
) -> dict[str, Any]:
    """Structural: every catalogue row of `dimension` is accounted for.

    TASK-040 (Option A / DEC-54): a row is ACCOUNTED iff it is either targeted
    (in the dimension's targeted alignment field) OR recorded as an explicit
    not-this-cycle gap (in the matching `*_not_addressed` field). Coverage is an
    AUTHORED property — none silently dropped.

    params: {"dimension": "learner_outcomes" | "areas_for_improvement"}. The
    universe is read from `grounding[dimension]` (each row's `label`); the
    targeted + not_addressed labels from `merged_draft["domain_alignment"]`.
    Passes iff `set(universe) ⊆ (targeted ∪ not_addressed)`; otherwise fails
    naming the sorted unaccounted labels.

    When `grounding is None` the universe cannot be verified → structural FAIL
    (can't confirm coverage); an invalid / missing `dimension` → structural
    FAIL. The runner guards exceptions; this evaluator stays clean and returns
    a shortfall rather than raising."""
    dimension = params.get("dimension")
    if dimension not in _COVERAGE_DIMENSIONS:
        return {
            "passed": False,
            "reason": (
                "malformed params: 'dimension' must be one of "
                f"{sorted(_COVERAGE_DIMENSIONS)}; got {dimension!r}"
            ),
        }
    if grounding is None:
        return {
            "passed": False,
            "reason": (
                f"coverage for {dimension!r} cannot be verified: grounding is "
                "unavailable (the school's universe is unknown)"
            ),
        }
    targeted_field, not_addressed_field = _COVERAGE_DIMENSIONS[dimension]
    universe = _labels_from_rows(grounding.get(dimension))
    da = merged_draft.get("domain_alignment")
    if not isinstance(da, dict):
        da = {}
    accounted = _labels_from_rows(da.get(targeted_field)) | _labels_from_rows(
        da.get(not_addressed_field)
    )
    missing = sorted(universe - accounted)
    if missing:
        return {
            "passed": False,
            "reason": (f"{dimension} not accounted: {missing}"),
        }
    return {
        "passed": True,
        "reason": (
            f"{dimension}: all {len(universe)} universe row(s) accounted "
            "(targeted or recorded as a gap)"
        ),
    }


# TASK-044 (FGAP-037 / DEC-54): the three measurement views are a FIXED
# universe (NOT a catalogue) — the discipline "measure progress from three
# points of view" (preamble criterion 7). A view is ACCOUNTED iff the draft's
# `measurement_views` maps it to a valid 0-based `feedback_channels` index OR a
# gap object. The order here is the canonical ordering for the failure message.
_MEASUREMENT_VIEW_IDS: tuple[str, ...] = (
    "student_outcomes",
    "staff_practice",
    "parent_stakeholder",
)


def _is_gap_object(value: Any) -> bool:
    """A view is gapped iff its value is an object carrying a `gap` key."""
    return isinstance(value, dict) and "gap" in value


def _eval_three_view(
    merged_draft: dict[str, Any],
    prefill: Any,
    params: dict[str, Any],
    grounding: dict[str, Any] | None,
) -> dict[str, Any]:
    """Structural: each of the three measurement views is accounted for.

    TASK-044 (FGAP-037 / DEC-54): mirrors `_eval_coverage`'s present-or-gap
    shape over a FIXED 3-element universe {student_outcomes, staff_practice,
    parent_stakeholder} — the discipline that measurement is seen from three
    sides (preamble criterion 7). A view is ACCOUNTED iff the merged draft's
    `measurement_views` maps it to EITHER a valid in-range 0-based index into
    `feedback_channels` (the covering channel) OR a gap object (`{"gap": ...}`,
    the view deferred this cycle). Passes iff all three are accounted; else
    fails naming the sorted unaccounted view-ids.

    No grounding is needed (the universe is fixed, not catalogue-derived) — so
    this does NOT fail on `grounding is None`, unlike the catalogue coverage
    evaluator. No params are read (`{}` expected). Tolerant of shape (a
    non-dict `measurement_views`, a non-list `feedback_channels`, a bool index
    — all counted as unaccounted, never raised); the runner guards exceptions
    regardless."""
    raw_views = merged_draft.get("measurement_views")
    views = raw_views if isinstance(raw_views, dict) else {}
    channels = merged_draft.get("feedback_channels")
    channel_count = len(channels) if isinstance(channels, list) else 0

    def _accounted(view_id: str) -> bool:
        value = views.get(view_id, None)
        if _is_gap_object(value):
            return True
        # A valid 0-based channel index (a JSON bool is an int subclass — reject
        # it, mirroring the parser's bool guard).
        if isinstance(value, bool) or not isinstance(value, int):
            return False
        return 0 <= value < channel_count

    unaccounted = sorted(v for v in _MEASUREMENT_VIEW_IDS if not _accounted(v))
    if unaccounted:
        return {
            "passed": False,
            "reason": (
                f"measurement views not accounted: {unaccounted} "
                "(each must be a covering feedback_channels index or an explicit gap)"
            ),
        }
    return {
        "passed": True,
        "reason": (
            f"all {len(_MEASUREMENT_VIEW_IDS)} measurement view(s) accounted "
            "(covering channel index or recorded as a gap)"
        ),
    }


# TASK-046 (FGAP-039 / DEC-54): the two bilingual-measurement views are a
# FIXED universe (NOT a catalogue) — the discipline that an always-bilingual
# school MUST measure bilingual language improvement as a distinct strand: a
# STAFF English-usage measure AND a STUDENT bilingual-progress measure
# (distinct from the Bilingual-Communicators-SLO coverage entry). A view is
# ACCOUNTED iff the draft's `bilingual_views` maps it to a valid 0-based
# `feedback_channels` index OR a gap object. The order here is the canonical
# ordering for the failure message.
_BILINGUAL_VIEW_IDS: tuple[str, ...] = (
    "staff_english_usage",
    "student_bilingual_progress",
)


def _eval_bilingual_views(
    merged_draft: dict[str, Any],
    prefill: Any,
    params: dict[str, Any],
    grounding: dict[str, Any] | None,
) -> dict[str, Any]:
    """Structural: each of the two bilingual measurement views is accounted for.

    TASK-046 (FGAP-039 / DEC-54): mirrors `_eval_three_view`'s present-or-gap
    shape over a FIXED 2-element universe {staff_english_usage,
    student_bilingual_progress} — the discipline that an always-bilingual
    school measures bilingual language improvement as a distinct strand (a
    staff English-usage measure AND a student bilingual-progress measure,
    distinct from the Bilingual-Communicators-SLO coverage). A view is
    ACCOUNTED iff the merged draft's `bilingual_views` maps it to EITHER a
    valid in-range 0-based index into `feedback_channels` (the covering
    channel) OR a gap object (`{"gap": ...}`, the view deferred this cycle).
    Passes iff both are accounted; else fails naming the sorted unaccounted
    view-ids.

    No grounding is needed (the universe is fixed, not catalogue-derived) — so
    this does NOT fail on `grounding is None`. No params are read (`{}`
    expected). Tolerant of shape (a non-dict `bilingual_views`, a non-list
    `feedback_channels`, a bool index — all counted as unaccounted, never
    raised); the runner guards exceptions regardless."""
    raw_views = merged_draft.get("bilingual_views")
    views = raw_views if isinstance(raw_views, dict) else {}
    channels = merged_draft.get("feedback_channels")
    channel_count = len(channels) if isinstance(channels, list) else 0

    def _accounted(view_id: str) -> bool:
        value = views.get(view_id, None)
        if _is_gap_object(value):
            return True
        # A valid 0-based channel index (a JSON bool is an int subclass — reject
        # it, mirroring the parser's bool guard).
        if isinstance(value, bool) or not isinstance(value, int):
            return False
        return 0 <= value < channel_count

    unaccounted = sorted(v for v in _BILINGUAL_VIEW_IDS if not _accounted(v))
    if unaccounted:
        return {
            "passed": False,
            "reason": (
                f"bilingual measurement views not accounted: {unaccounted} "
                "(each must be a covering feedback_channels index or an explicit gap)"
            ),
        }
    return {
        "passed": True,
        "reason": (
            f"all {len(_BILINGUAL_VIEW_IDS)} bilingual measurement view(s) accounted "
            "(covering channel index or recorded as a gap)"
        ),
    }


# TASK-048 (FGAP-040 / DEC-0005): a decision-request is the upward escalation
# for an action-step precursor no division can own — an EMERGENT list (NOT a
# catalogue universe), each entry carrying the four non-empty string fields
# {what_decision, from_whom, why, blocks_unblocks}. The order here is the
# canonical ordering used in the failure message.
_DECISION_REQUEST_FIELDS: tuple[str, ...] = (
    "what_decision",
    "from_whom",
    "why",
    "blocks_unblocks",
)


def _eval_decision_requests(
    merged_draft: dict[str, Any],
    prefill: Any,
    params: dict[str, Any],
    grounding: dict[str, Any] | None,
) -> dict[str, Any]:
    """Structural: every in-draft decision-request entry is well-formed.

    TASK-048 (FGAP-040 / DEC-0005): deterministic WELL-FORMEDNESS of the
    emergent decision-request list — each entry an object carrying the four
    non-empty string fields {what_decision, from_whom, why, blocks_unblocks}.
    Passes iff every entry in the merged draft's `decision_requests` is
    well-formed; an EMPTY list PASSES (well-formed by vacuity — completeness,
    "every unowned precursor escalated", is ADVERSARIAL per DEC-53, NOT this
    deterministic gate). Fails naming the index + reason of the first
    malformed entry.

    No grounding is needed (well-formedness is intrinsic, not catalogue-
    derived) — so this does NOT fail on `grounding is None`. No params are read
    (`{}` expected). Tolerant of shape (a non-list `decision_requests`, a
    non-object entry, a non-string/blank field — all counted as malformed,
    never raised); the runner guards exceptions regardless."""
    raw = merged_draft.get("decision_requests")
    entries = raw if isinstance(raw, list) else []
    expected = set(_DECISION_REQUEST_FIELDS)

    for idx, entry in enumerate(entries):
        if not isinstance(entry, dict):
            return {
                "passed": False,
                "reason": (
                    f"decision_requests[{idx}] is not an object "
                    "(each must carry the four fields what_decision, from_whom, "
                    "why, blocks_unblocks)"
                ),
            }
        if set(entry.keys()) != expected:
            return {
                "passed": False,
                "reason": (
                    f"decision_requests[{idx}] keys must be EXACTLY "
                    f"{list(_DECISION_REQUEST_FIELDS)}; got {sorted(entry.keys())}"
                ),
            }
        for field in _DECISION_REQUEST_FIELDS:
            value = entry.get(field)
            if not isinstance(value, str) or not value.strip():
                return {
                    "passed": False,
                    "reason": (
                        f"decision_requests[{idx}] field {field!r} must be a "
                        f"non-empty string; got {value!r}"
                    ),
                }

    return {
        "passed": True,
        "reason": (
            f"all {len(entries)} decision-request(s) well-formed "
            "(each carries what_decision, from_whom, why, blocks_unblocks)"
        ),
    }


def _eval_distribution(
    merged_draft: dict[str, Any],
    prefill: Any,
    params: dict[str, Any],
    grounding: dict[str, Any] | None,
) -> dict[str, Any]:
    """Structural: action-step ownership is neither single-owner-majority nor
    too-few-divisions.

    TASK-041 (T4 / DEC-54): the per-spec in-execution form of the whole-draft
    distribution gate. It REUSES `check_draft.check_owner_distribution` — the
    single source of truth for the threshold — over the merged draft's
    `action_steps[*].assignments[0].division` ownership, and maps that check's
    result dict to the `{passed, reason}` evaluator contract. The threshold is
    NOT re-derived here: pass iff `check_owner_distribution` passes (>1 distinct
    owner AND largest single-owner share <= 50%). A single owner >50%, OR fewer
    than 2 distinct owners, OR zero owned -> fail.

    No params are read (`{}` expected); the check operates on the merged draft.
    The runner guards exceptions; this evaluator stays clean and returns a
    shortfall rather than raising."""
    result = check_owner_distribution(merged_draft)
    if result.get("passed"):
        return {
            "passed": True,
            "reason": (
                f"distribution: {result['distinct_owner_count']} division(s) own "
                f"{result['owned_step_count']} step(s); largest share "
                f"{result['largest_single_owner_pct']}% (<= 50%)"
            ),
        }
    counts = result.get("owners") or {}
    dominant = max(counts, key=lambda o: counts[o]) if counts else None
    return {
        "passed": False,
        "reason": (
            f"distribution: {result['distinct_owner_count']} division(s) own "
            f"{result['owned_step_count']} step(s); largest share "
            f"{result['largest_single_owner_pct']}% "
            + (f"held by {dominant!r}" if dominant is not None else "(no owned steps)")
            + " — requires >1 division AND largest <= 50%"
        ),
    }


def _cycle_year_from_grounding(grounding: dict[str, Any] | None) -> int | None:
    """Extract the cycle's first-year int from `grounding["cycle"]["starts_on"]`.

    The cycle section (grounding.py `_cycle_section`) emits `starts_on` as an
    ISO date string; the year is its leading 4 digits. Returns the int year, or
    None when grounding / cycle / starts_on is missing or not a 4-digit-leading
    ISO date. Tolerant of shape; never raises."""
    if not isinstance(grounding, dict):
        return None
    cycle = grounding.get("cycle")
    if not isinstance(cycle, dict):
        return None
    starts_on = cycle.get("starts_on")
    if not isinstance(starts_on, str) or len(starts_on) < 4 or not starts_on[:4].isdigit():
        return None
    return int(starts_on[:4])


def _eval_review_cadence(
    merged_draft: dict[str, Any],
    prefill: Any,
    params: dict[str, Any],
    grounding: dict[str, Any] | None,
) -> dict[str, Any]:
    """Structural: the review loop has >= 4 checkpoints, earliest before 1 Dec.

    TASK-045 (FGAP-038 / DEC-54): the per-spec in-execution form of the
    whole-draft review-cadence gate (check_draft Check 5). It REUSES
    `check_draft.check_review_cadence` — the single source of truth for the
    >=4-checkpoint + before-1-December threshold — over the merged draft's
    `review_events` (+ `milestones`, for milestone-timed events), and maps that
    check's result dict to the `{passed, reason}` evaluator contract. The
    threshold is NOT re-derived here.

    The before-1-December anchor needs the cycle's first year, read from
    `grounding["cycle"]["starts_on"]`. When that year cannot be obtained
    (grounding is None, or `cycle` missing / not-a-dict, or `starts_on` missing
    / not a 4-digit-leading ISO date) the cadence cannot be verified -> a
    STRUCTURAL FAIL (mirroring `_eval_coverage`'s grounding-None fail). It does
    NOT silently fall back to `check_review_cadence`'s degraded `cycle_year=None`
    branch (anchor = earliest's OWN year), which would make the before-1-Dec
    rule near-vacuous and let a late-first-checkpoint loop pass: the gate must
    not pass what it cannot verify.

    No params are read (`{}` expected); the check operates on the merged draft.
    The runner guards exceptions; this evaluator stays clean and returns a
    shortfall rather than raising."""
    cycle_year = _cycle_year_from_grounding(grounding)
    if cycle_year is None:
        return {
            "passed": False,
            "reason": "review cadence cannot be verified: cycle year unavailable",
        }
    result = check_review_cadence(merged_draft, cycle_year)
    count = result["checkpoint_count"]
    earliest = result["earliest_date"]
    if result["passed"]:
        return {
            "passed": True,
            "reason": (
                f"review cadence: {count} checkpoint(s) (>= 4); earliest "
                f"{earliest} (< 1 Dec {cycle_year})"
            ),
        }
    return {
        "passed": False,
        "reason": (
            f"review cadence: {count} checkpoint(s) "
            + ("(< 4) " if count < 4 else "")
            + f"earliest {earliest}; earliest_before_december="
            + f"{result['earliest_before_december']} "
            + f"(requires >= 4 checkpoints AND earliest < 1 Dec {cycle_year})"
        ),
    }


# Registry: evaluator-id -> evaluator fn. T3/T4 register coverage/distribution
# evaluators here (reusing check_draft fns) without touching apply.py.
EVALUATORS: dict[str, Evaluator] = {
    "min_list_size": _eval_min_list_size,
    "coverage": _eval_coverage,
    "distribution": _eval_distribution,
    "three_view": _eval_three_view,
    "bilingual_views": _eval_bilingual_views,
    "decision_requests": _eval_decision_requests,
    "review_cadence": _eval_review_cadence,
}


def run_self_check(
    frontmatter: dict[str, Any],
    merged_draft: dict[str, Any],
    prefill: Any,
    grounding: dict[str, Any] | None,
) -> dict[str, Any]:
    """Evaluate a spec's `success_criteria` against the merged draft.

    Reads `frontmatter.get("success_criteria", [])` (a list of JSON object
    strings), `json.loads` each entry, dispatches to `EVALUATORS` by `id`, and
    partitions outcomes by `kind`. Every per-criterion step — JSON parse,
    id/kind extraction, evaluator lookup, the evaluator call itself — is guarded
    so NO exception escapes this function regardless of how an authored
    criterion is malformed (DEC-54: the apply must never crash with an uncaught
    exception from an authored criterion).

    Outcomes:
      * a structural criterion that fails (a genuine shortfall OR an
        unevaluable criterion: malformed JSON, missing/invalid id|kind, unknown
        evaluator id, the evaluator raising on bad params/types) -> appended to
        `failures` and gates (apply.py refuses to save and exits 3). DEC-54: a
        structural gate is a hard gate; an unevaluable one must FAIL LOUD, never
        silently pass. A missing/ambiguous `kind` is treated as structural (the
        safe default) so a mis-authored criterion gates rather than slipping
        through as advisory.
      * an advisory criterion that fails (genuine shortfall OR unevaluable) ->
        appended to `advisory_flags` (non-gating; flow alongside the existing
        soft-flag path) AND mirrored into `notes` when it is an authoring error,
        so the problem is operationally visible.

    Returns
        {
            "structural_passed": bool,   # False iff any structural criterion failed
            "failures": [ {id, kind, reason, params}, ... ],      # structural fails
            "advisory_flags": [ {id, kind, reason, params}, ... ],# advisory fails
            "notes": [ str, ... ],       # authoring-error notes (advisory side)
        }

    An empty / absent `success_criteria` -> structural_passed True, no failures.
    A well-formed criterion (structural or advisory) keeps its prior clean
    pass/fail behavior unchanged. A non-dict `frontmatter` (None / int / list /
    str) -> ONE structural failure (structural_passed False), never a raise: the
    never-raises invariant holds for ANY input, since both apply attach points
    (apply.py, apply_from_substrate.py) call this un-try-wrapped.
    """
    failures: list[dict[str, Any]] = []
    advisory_flags: list[dict[str, Any]] = []
    notes: list[str] = []

    def _normalize_kind(kind: Any) -> str:
        """Collapse a criterion's `kind` to "structural" | "advisory".

        ONLY an explicit "advisory" is non-gating; missing / ambiguous / any
        other value normalizes to "structural" (the safe default) so a
        mis-authored or kind-less criterion GATES rather than slipping through
        as advisory. This is the single classification authority used by BOTH
        the unevaluable path and the genuine-failure path, so a kind-less
        genuine failure gates identically to a kind-less unevaluable one.
        """
        return "advisory" if kind == "advisory" else "structural"

    def _record_unevaluable(kind: Any, evaluator_id: Any, params: Any, reason: str) -> None:
        """Route an unevaluable criterion via `_normalize_kind`: structural ->
        fail-loud gate; advisory -> non-gating flag + visible note."""
        record = {
            "id": evaluator_id,
            "kind": kind,
            "reason": reason,
            "params": params if isinstance(params, dict) else {},
        }
        if _normalize_kind(kind) == "advisory":
            advisory_flags.append(record)
            notes.append(reason)
        else:
            failures.append(record)

    # Top-level frontmatter shape gate, BEFORE any attribute access on it. The
    # docstring promises NO exception escapes regardless of input; a non-dict
    # `frontmatter` (None / int / list / str) would raise AttributeError on the
    # `.get` below — outside the defensive whole-body try, which starts AFTER
    # this point — so it is recorded here as ONE structural failure (fail-loud,
    # gates) and the function returns without iterating. apply.py and
    # apply_from_substrate.py both call run_self_check un-try-wrapped, so this
    # invariant must hold unconditionally.
    if not isinstance(frontmatter, dict):
        return {
            "structural_passed": False,
            "failures": [
                {
                    "id": None,
                    "kind": "structural",
                    "reason": (f"frontmatter is not a dict; got {type(frontmatter).__name__}"),
                    "params": {},
                }
            ],
            "advisory_flags": [],
            "notes": [],
        }

    # Top-level criteria-shape gate. The per-criterion guards below wrap each
    # iteration step, but the iteration itself must be reached safely: a
    # non-list `success_criteria` (an int is not iterable; a str/dict iterates
    # element-wise into garbage) is recorded as ONE structural failure here and
    # never iterated. Absent / empty -> no criteria, structural_passed True.
    raw_entries = frontmatter.get("success_criteria")
    if raw_entries is None or raw_entries == []:
        raw_entries = []
    elif not isinstance(raw_entries, list):
        failures.append(
            {
                "id": None,
                "kind": "structural",
                "reason": (
                    "success_criteria must be a list of criterion objects; "
                    f"got {type(raw_entries).__name__}"
                ),
                "params": {},
            }
        )
        raw_entries = []

    # Defensive whole-body try: even with the per-criterion guards and the
    # top-level shape gate, NO unexpected exception may escape run_self_check
    # (apply.main() calls it un-try-wrapped). Anything that slips past the
    # inner guards is recorded as a structural failure (fail-loud), never
    # propagated.
    try:
        for raw in raw_entries:
            criterion: Any = None
            try:
                criterion = json.loads(raw)
                if not isinstance(criterion, dict):
                    _record_unevaluable(
                        None,
                        None,
                        None,
                        f"malformed criterion JSON: entry is not a JSON object: {raw!r}",
                    )
                    continue

                evaluator_id = criterion.get("id")
                kind = criterion.get("kind")
                params = criterion.get("params") or {}

                evaluator = EVALUATORS.get(evaluator_id) if isinstance(evaluator_id, str) else None
                if evaluator is None:
                    _record_unevaluable(
                        kind,
                        evaluator_id,
                        params,
                        f"unknown evaluator id {evaluator_id!r}",
                    )
                    continue

                result = evaluator(merged_draft, prefill, params, grounding)
                if result.get("passed"):
                    continue

                record = {
                    "id": evaluator_id,
                    "kind": kind,
                    "reason": result.get("reason", ""),
                    "params": params,
                }
                # Same classification authority as the unevaluable path: a
                # kind-less (or non-"advisory") genuine failure GATES.
                if _normalize_kind(kind) == "structural":
                    failures.append(record)
                else:
                    advisory_flags.append(record)
            except Exception as exc:  # noqa: BLE001 — per-criterion backstop
                # Any exception from parse, extraction, lookup, or the evaluator
                # (incl. bad/missing params, wrong types) lands here. Re-extract
                # id/kind best-effort for the record; `_normalize_kind` defaults
                # an indeterminate kind to a structural gate.
                kind_for_record: Any = None
                id_for_record: Any = None
                params_for_record: Any = None
                if isinstance(criterion, dict):  # None when json.loads raised
                    kind_for_record = criterion.get("kind")
                    id_for_record = criterion.get("id")
                    params_for_record = criterion.get("params")
                label = f"criterion {id_for_record!r}" if id_for_record else "criterion"
                _record_unevaluable(
                    kind_for_record,
                    id_for_record,
                    params_for_record,
                    f"{label} unevaluable ({exc.__class__.__name__}: {exc})",
                )
    except Exception as exc:  # noqa: BLE001 — whole-body fail-loud backstop
        failures.append(
            {
                "id": None,
                "kind": "structural",
                "reason": (f"self-check aborted unexpectedly ({exc.__class__.__name__}: {exc})"),
                "params": {},
            }
        )

    return {
        "structural_passed": not failures,
        "failures": failures,
        "advisory_flags": advisory_flags,
        "notes": notes,
    }
