"""Deterministic verification harness over the assembled whole-plan draft.

A CLI sibling of `render.py` / `apply.py` / `sequence.py` (TASK-036). Given a
generated plan draft (default `outputs/current-draft.json`), it produces a
structured report over five checks. The consuming tasks (TASK-031/033/034)
read the computed booleans of the structural checks.

DEC-53 posture — gate ONLY on true process blockers; trivial end-changeable
LANGUAGE is advisory:

* The two LANGUAGE checks (Check 1 process-method terms, Check 2 the
  OPEN/CORE/EVIDENCE/CLOSE step-scaffolding labels) are WARN — register,
  coined framework/process terms, scaffolding labels, strand-prefix casing,
  and wording are trivial and end-changeable, surfaced for a single final
  polish pass, never a completion blocker. They are reported with their spans
  but do NOT set `hard_failed` and do NOT cause a nonzero exit in any mode.
  The strand prefixes GROUNDED/ROUNDED/UNBOUNDED are likewise WARN (FGAP-032).
* The three STRUCTURAL checks (Check 3 distribution, Check 4 coverage, Check 5
  cadence) are the real gate: report-only by default, exit-nonzero under
  `--strict`. A structural incompleteness is a true process blocker.

Net posture:
  `check_draft.py <draft>`          → REPORT-ONLY, exit 0 (language WARN,
                                       structural shown but not gated).
  `check_draft.py --strict <draft>` → exits nonzero on a structural failure
                                       (Check 3/4/5). Language never causes a
                                       nonzero exit in either mode.

The five checks:

1. Process-method term scan (WARN — language/advisory, end-polish). Coined
   framework/method terms ideally never appear in the rendered artifact
   (sim-revised-frame.md RENDER RULE + the governing rule; docs/plan-
   generation-heuristics.md R-0009). Each hit reports its field path, the
   matched phrase, and the character span — surfaced, not a blocker.
2. Scaffolding-label scan (WARN — language/advisory, end-polish). The step-
   scaffolding labels OPEN/CORE/EVIDENCE/CLOSE are flagged only when an
   ALL-CAPS token carries a structural marker (trailing colon/dash/arrow,
   leading dash/arrow, or enclosing parens) OR >=2 distinct labels co-occur in
   the same text (N3). The strand prefixes GROUNDED/ROUNDED/UNBOUNDED are
   likewise WARN (FGAP-032). Ordinary lowercase words ("open the session",
   "core values") and lone unmarked all-caps plain words ("OPEN day", "the
   CORE curriculum") do NOT trip. All such hits are surfaced for the polish
   pass, never a blocker.
3. Owner distribution (STRUCTURAL — REPORT + computed boolean; gates under
   --strict): distinct action-step owner count + largest single-owner share;
   pass = >1 owner AND no owner >50%.
4. Coverage (STRUCTURAL — REPORT + computed boolean; gates under --strict):
   each learner outcome / improvement area in the school's universe is
   present-or-listed-as-gap; pass = every universe item targeted OR named in
   the draft's explicit gap text.
5. Review cadence (STRUCTURAL — REPORT + computed boolean; gates under
   --strict): checkpoint count + earliest resolved date; pass = >=4
   checkpoints AND earliest before 1 December of the cycle year. The cycle
   year is the school's grounding `cycle.starts_on` year (injected), not
   derived from the dates being checked.

Workshop dispatch tooling only — no parser or grounding-model change.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import re
import sys
from pathlib import Path
from typing import Any

# Resolve workshop helpers via the local package path; the helpers add Django
# to sys.path so the production imports work transparently (mirrors render.py).
sys.path.insert(0, str(Path(__file__).parent.parent))

from dispatch._workshop import draft_path  # noqa: E402

# --- Enumerated lists (version-controlled module constants) -----------------
#
# Source: prompt-workshop/sim-revised-frame.md RENDER RULE paragraph (~line
# 292) + the governing rule (~line 304: "framework/process vocabulary does not
# belong in a planning artifact AT ALL"), reconciled with
# docs/plan-generation-heuristics.md R-0009 (line 87). The two sources
# enumerate the same coined-method vocabulary; this constant is their union.
#
# DEC-53: these scan-list constants keep their `HARD_`/`SCAFFOLDING_` names as
# stable internal identifiers, but the term/label checks they drive are now
# WARN/advisory (language, end-polish) — a hit is surfaced, never a blocker, and
# never sets `hard_failed` / a nonzero exit (see `run_checks` / `_exit_code`).
#
# These are MULTI-WORD COINED METHOD TERMS that should not appear in a
# school improvement plan — a hit is a generation leak of the framework
# vocabulary into the rendered artifact, flagged for the final polish pass.
# Matched hyphen/whitespace-INSENSITIVELY
# (runs of `[-\s]+` between words collapse to a single flexible separator) so
# every spacing/hyphenation variant of a coined multi-word phrase is caught —
# e.g. "contact type structure", "contact-type structure", and
# "contact-type  structure" all hit. Case-insensitive. (F1.) These multi-word
# coinages have no plain-prose meaning, so the insensitive matching cannot
# false-positive on ordinary English.
HARD_PROCESS_METHOD_PHRASES: tuple[str, ...] = (
    "contact-type structure",
    "self-refutation guard",
    "options posture",
    "evaluate-and-revise cadence",
    "growth-mindset loop",
    "durability-not-occurrence",
    "behavior-change-primary",
    # F2: British spelling of the same coined metric. This is a British-curriculum
    # school, so "behaviour-change-primary" is a realistic leak; the preamble names
    # both spellings ("behaviour/behavior-change-primary"). The hyphen/space-
    # insensitive matcher already covers separator variants, so only the 'ou'
    # spelling needs its own entry.
    "behaviour-change-primary",
    "cross-track",
    "fractal/holographic principle",
    "refraction weave",
    # F9: "contact-type" as a bare coined term (the shape before "structure" is
    # appended) — no plain-prose use, banned on its own, hyphen/space-insensitive.
    "contact-type",
    # N1: "front-load" was REMOVED from this HARD list. It has no unambiguous
    # coined MULTI-WORD form to hard-ban and a legitimate plain-prose use
    # ("front-load the budget"), so it is inherently ambiguous → WARN only (it
    # lives in WARN_AMBIGUOUS_TERMS below). Keeping it HARD here hard-failed plain
    # English and contradicted its own WARN entry.
)

# F2: "talking-at" is hyphen-SPECIFIC. The coined "talking-at %"/"talking-at
# ratio"/"talking-at baseline" metric uses the HYPHENATED token; the space form
# "talking at" ("adults talking at students") is plain English the render rule
# explicitly permits. So this is matched as the hyphenated token only (word-
# bounded, optionally trailed by %/percent/percentage/ratio/baseline), NOT via
# the hyphen/space-insensitive HARD matcher above.
_TALKING_AT_PATTERN = re.compile(
    r"\btalking-at\b(?:\s*(?:%|percent|percentage|ratio|baseline))?",
    re.IGNORECASE,
)

# Resolved HARD-vs-WARN policy (N1/N2/N3, "plain English is fine"):
#   * ONLY coined MULTI-WORD method phrases hard-fail (HARD_PROCESS_METHOD_PHRASES
#     above + the hyphen-specific "talking-at" metric). These have no plain-prose
#     meaning, so insensitive matching cannot false-positive on ordinary English.
#   * BARE ambiguous single words are WARN only (WARN_AMBIGUOUS_TERMS below) —
#     they each have legitimate plain-English uses ("weave literacy across the
#     curriculum", "the refraction of light", "fractal patterns in nature",
#     "front-load the budget"), so a bare occurrence is surfaced for human review,
#     never hard-failed. This reconciles criterion-2 coverage with the
#     no-false-positive principle.
# N2: bare "refraction"/"fractal"/"weave" were MOVED out of HARD into WARN. The
# genuinely-coined forms are MULTI-WORD ("refraction weave",
# "fractal/holographic principle") and stay in HARD_PROCESS_METHOD_PHRASES above;
# a bare single occurrence is WARN, not a hard fail. HARD_SINGLE_WORD_TERMS is now
# empty (no single word hard-fails); kept for the stable scan interface.
HARD_SINGLE_WORD_TERMS: tuple[str, ...] = ()

# Scaffolding labels (DEC-53: WARN/advisory): the contact-type step labels
# OPEN/CORE/EVIDENCE/CLOSE used ONLY as standalone structural labels. Source:
# the RENDER RULE ("no OPEN/CORE/EVIDENCE/CLOSE labels"). Implemented as precise
# patterns below so ordinary words do not false-positive; a hit is surfaced for
# the final polish pass, never a blocker.
SCAFFOLDING_STEP_LABELS: tuple[str, ...] = ("OPEN", "CORE", "EVIDENCE", "CLOSE")
# WARN-only strand prefixes: the SLO strand-group names (sim-revised-frame.md
# lines 34-44). FGAP-032 (user decision 2026-06-10) ACCEPTS the bare all-caps
# GROUNDED/ROUNDED/UNBOUNDED appearing in plan prose — it is not a defect, so it
# is surfaced as a WARN for human awareness, never a hard fail / nonzero exit. A
# verification tool that hard-failed on an accepted form would be a false signal.
SCAFFOLDING_STRAND_PREFIXES: tuple[str, ...] = ("GROUNDED", "ROUNDED", "UNBOUNDED")

# AMBIGUOUS single words — WARN only, never hard-fail. These occur in
# legitimate plain prose, so a hit is surfaced for human review, not a failure.
# Source: sim-revised-frame.md governing rule (the coined terms) reduced to the
# single-word forms that overlap ordinary English.
#
# Each has a legitimate plain-prose use, so a hit is a human-review signal, not a
# failure —
#   "precursor"      → "a precursor to writing"
#   "keystone"       → "the keystone of the plan"
#   "spiral"         → "a spiral curriculum"/"spiral of decline"
#   "front-load"     → "front-load the budget" (N1: now WARN-only — removed from
#                       the HARD list, which had no unambiguous multi-word coined
#                       form to ban and contradicted this WARN entry)
#   "growth mindset" → common pedagogy phrase (the hyphenated coinage
#                       "growth-mindset loop" is in the HARD list)
#   "weave"          → "weave literacy across the curriculum" (N2: WARN-only; the
#                       coined "refraction weave" stays HARD as a multi-word phrase)
#   "refraction"     → "the refraction of light is taught in science" (N2: WARN-
#                       only; multi-word coinages stay HARD)
#   "fractal"        → "fractal patterns in nature" (N2: WARN-only; the coined
#                       "fractal/holographic principle" stays HARD as a phrase)
WARN_AMBIGUOUS_TERMS: tuple[str, ...] = (
    "spiral",
    "precursor",
    "keystone",
    "front-load",
    "growth mindset",  # unhyphenated; the hyphenated coinage is in the HARD list
    # N2: bare single-word forms — WARN only; the multi-word coinages are HARD.
    "weave",
    "refraction",
    "fractal",
    # F9: "tracks" is INTENTIONALLY NOT banned (neither HARD nor WARN). It has
    # heavy plain-prose use ("tracks progress", "two tracks", "on track"), so
    # banning it would false-positive constantly. The coined "cross-track" IS in
    # the HARD list; the bare word "tracks" is a documented non-ban decision.
)


# --- Prose extraction ------------------------------------------------------


def _iter_prose_fields(draft: dict[str, Any]) -> list[tuple[str, str]]:
    """Yield `(field_path, text)` for every prose string in the draft.

    Covers: every string under `plan`; each `action_steps[].description`;
    `success_criteria[].text`; `milestones[].label`; the review /
    communications / revision-rule text fields; and domain_alignment
    targeted-row `rationale` + deferred-gap `reason`. Non-string and
    structural fields (indices, dates, kinds) are not prose and are skipped.
    """
    out: list[tuple[str, str]] = []

    plan = draft.get("plan") or {}
    if isinstance(plan, dict):
        for field, value in plan.items():
            if isinstance(value, str) and value.strip():
                out.append((f"plan.{field}", value))

    for i, step in enumerate(draft.get("action_steps") or []):
        if isinstance(step, dict):
            desc = step.get("description")
            if isinstance(desc, str) and desc.strip():
                out.append((f"action_steps[{i}].description", desc))

    for i, crit in enumerate(draft.get("success_criteria") or []):
        if isinstance(crit, dict):
            text = crit.get("text")
            if isinstance(text, str) and text.strip():
                out.append((f"success_criteria[{i}].text", text))

    for i, ms in enumerate(draft.get("milestones") or []):
        if isinstance(ms, dict):
            label = ms.get("label")
            if isinstance(label, str) and label.strip():
                out.append((f"milestones[{i}].label", label))

    # Review-loop prose: communications / review_events / revision_rules carry
    # free-text fields whose names vary; scan every string-valued field.
    for collection in ("review_events", "communications", "revision_rules"):
        for i, row in enumerate(draft.get(collection) or []):
            if not isinstance(row, dict):
                continue
            for field, value in row.items():
                if isinstance(value, str) and value.strip():
                    out.append((f"{collection}[{i}].{field}", value))

    # domain_alignment prose: targeted rows carry `rationale`, deferred-gap
    # (`*_not_addressed`) rows carry `reason`. Walk those two by presence (never
    # `label` — label-only rows carry catalogue words, not prose). Mirrors
    # planner/_freetext_audit.py `_select_a3` (the parse-time analog).
    da = draft.get("domain_alignment") or {}
    if isinstance(da, dict):
        for relation, rows in da.items():
            if not isinstance(rows, list):
                continue
            for i, row in enumerate(rows):
                if not isinstance(row, dict):
                    continue
                for key in ("rationale", "reason"):
                    value = row.get(key)
                    if isinstance(value, str) and value.strip():
                        out.append((f"domain_alignment.{relation}[{i}].{key}", value))

    return out


# --- Check 1: process-method term scan -------------------------------------


def _hard_phrase_pattern(phrase: str) -> re.Pattern[str]:
    """Compile a hyphen/whitespace-INSENSITIVE, word-bounded pattern for a phrase.

    The phrase's internal runs of `[-\\s]+` (hyphens and whitespace, in any
    combination) are normalized to a single flexible separator `[-\\s]+` in the
    pattern, so every spacing/hyphenation variant of a coined multi-word phrase
    is caught — "contact-type structure", "contact type structure", and
    "contact-type   structure" all match. Non-`[-\\s]` punctuation in the phrase
    (e.g. the "/" in "fractal/holographic principle") is preserved literally.
    Word boundaries (`\\b`) bound the whole phrase so embedded substrings inside
    a larger word do not trip. Case-insensitive. (F1.)
    """
    # Split on runs of hyphen/whitespace into the literal segments between them.
    segments = re.split(r"[-\s]+", phrase.strip())
    escaped_segments = [re.escape(seg) for seg in segments if seg]
    core = r"[-\s]+".join(escaped_segments)
    return re.compile(rf"\b{core}\b", re.IGNORECASE)


def _scan_hard_phrases(prose: list[tuple[str, str]]) -> list[dict[str, Any]]:
    """Scan for the HARD method phrases + talking-at.

    Multi-word HARD phrases are matched hyphen/whitespace-INSENSITIVELY (F1, via
    `_hard_phrase_pattern`). The coined "talking-at" metric is matched as the
    HYPHENATED token only (F2) — the space form "talking at" is plain English and
    must NOT trip. N2: bare single-word coinages (refraction/fractal/weave) no
    longer hard-fail; HARD_SINGLE_WORD_TERMS is empty, so the per-term loop below
    is a no-op kept for the stable scan interface.
    """
    hits: list[dict[str, Any]] = []
    patterns: list[tuple[str, re.Pattern[str]]] = []
    for phrase in HARD_PROCESS_METHOD_PHRASES:
        patterns.append((phrase, _hard_phrase_pattern(phrase)))
    for term in HARD_SINGLE_WORD_TERMS:
        patterns.append((term, re.compile(rf"\b{re.escape(term)}\b", re.IGNORECASE)))
    # F2: talking-at (hyphen-specific), reported under a stable phrase label.
    patterns.append(("talking-at", _TALKING_AT_PATTERN))

    for field_path, text in prose:
        for phrase, pat in patterns:
            for m in pat.finditer(text):
                hits.append(
                    {
                        "field": field_path,
                        "phrase": phrase,
                        "matched": m.group(0),
                        "span": [m.start(), m.end()],
                    }
                )
    return hits


# --- Check 2: scaffolding-label scan ---------------------------------------

# A step label is matched as a STANDALONE ALL-CAPS WHOLE-WORD TOKEN — `\bOPEN\b`,
# uppercase only, case-SENSITIVE. `\b` keeps a longer all-caps word (e.g. "OPENS",
# "CORES") from matching the bare token, and lowercase words ("open the session",
# "core values") never match. N3: a raw token match is NOT sufficient to hard-fail
# — a lone unmarked all-caps word ("OPEN day", "CORE curriculum", "OPEN data
# policy") is plain English. A step-label hit hard-fails ONLY when it also carries
# a structural scaffolding signal:
#   (a) a structural MARKER on the label — trailing colon "OPEN:", trailing/leading
#       dash "OPEN -"/"- OPEN", an arrow "OPEN ->"/"-> OPEN"/"OPEN →"/"→ OPEN", or
#       enclosing parentheses "(OPEN)"; OR
#   (b) CO-OCCURRENCE of >=2 DISTINCT step labels of the four in the same text
#       (the real over-labelling shape names the set, e.g.
#       "OPEN, CORE, EVIDENCE, CLOSE" or "OPEN→CORE→EVIDENCE→CLOSE").
# This keeps the inline/comma/paren/arrow leak detection (those carry markers or
# co-occur) while clearing lone plain caps words.
_STEP_LABEL_GROUP = "|".join(SCAFFOLDING_STEP_LABELS)
_STEP_LABEL_TOKEN = re.compile(rf"\b(?:{_STEP_LABEL_GROUP})\b")

# Strand prefixes as standalone ALL-CAPS whole-word tokens (uppercase only,
# case-sensitive) — "GROUNDED:" and "GROUNDED strand" both match; titlecase "the
# Grounded dimension" does not (it is not all-caps). FGAP-032 (wontfix): a match
# is a WARN, not a hard fail — the all-caps SLO strand-group names in plan prose
# are an ACCEPTED form. The token pattern drives the WARN scan only.
_STRAND_GROUP = "|".join(SCAFFOLDING_STRAND_PREFIXES)
_STRAND_TOKEN = re.compile(rf"\b(?:{_STRAND_GROUP})\b")


def _step_label_has_marker(text: str, start: int, end: int) -> bool:
    """True when a step-label token at [start, end) carries a structural marker.

    Markers: a trailing colon "OPEN:", a trailing or leading dash/arrow
    ("OPEN -", "- OPEN", "OPEN ->", "-> OPEN", "OPEN →", "→ OPEN"), or enclosing
    parentheses "(OPEN)". Whitespace between the token and the marker is allowed.
    These are the over-labelling/scaffolding leak shapes; a lone unmarked all-caps
    word is plain English and does NOT match here. (N3.)
    """
    before = text[:start]
    after = text[end:]
    # Trailing colon, dash, or arrow (optionally after whitespace).
    if re.match(r"\s*(?::|-+>?|→|->)", after):
        return True
    # Leading dash or arrow (optionally before whitespace).
    if re.search(r"(?:-+|→|->)\s*$", before):
        return True
    # Enclosing parentheses: "(" immediately before (allowing ws) and ")" after.
    if re.search(r"\(\s*$", before) and re.match(r"\s*\)", after):
        return True
    return False


def _scan_scaffolding_labels(prose: list[tuple[str, str]]) -> list[dict[str, Any]]:
    """Scan for HARD scaffolding step-labels (marked/co-occurring).

    Step labels (OPEN/CORE/EVIDENCE/CLOSE) hard-fail only when a token carries a
    structural marker OR >=2 distinct step labels co-occur in the same text (N3);
    a lone unmarked all-caps word is plain English and does not trip. FGAP-032
    (wontfix): the strand prefixes GROUNDED/ROUNDED/UNBOUNDED no longer appear
    here — they are WARN-only (see `_scan_strand_prefixes`), an ACCEPTED form in
    plan prose, so they are surfaced for human awareness, never hard-failed.
    """
    hits: list[dict[str, Any]] = []
    for field_path, text in prose:
        step_matches = list(_STEP_LABEL_TOKEN.finditer(text))
        distinct_labels = {m.group(0) for m in step_matches}
        co_occurs = len(distinct_labels) >= 2
        for m in step_matches:
            if co_occurs or _step_label_has_marker(text, m.start(), m.end()):
                hits.append(
                    {
                        "field": field_path,
                        "kind": "step-label",
                        "matched": m.group(0),
                        "span": [m.start(), m.end()],
                    }
                )
    return hits


def _scan_strand_prefixes(prose: list[tuple[str, str]]) -> list[dict[str, Any]]:
    """WARN-only scan for the SLO strand-group prefixes (FGAP-032 wontfix).

    A standalone ALL-CAPS GROUNDED/ROUNDED/UNBOUNDED token is surfaced for human
    awareness. These are an ACCEPTED form in plan prose, so a match never enters
    the HARD scaffolding check and never contributes to `hard_failed` / a nonzero
    exit; it is reported alongside the ambiguous-term warnings.
    """
    warnings: list[dict[str, Any]] = []
    for field_path, text in prose:
        for m in _STRAND_TOKEN.finditer(text):
            warnings.append(
                {
                    "field": field_path,
                    "kind": "strand-prefix",
                    "matched": m.group(0),
                    "span": [m.start(), m.end()],
                }
            )
    return warnings


# --- Ambiguous warnings ----------------------------------------------------


def _scan_ambiguous(prose: list[tuple[str, str]]) -> list[dict[str, Any]]:
    """Word-bounded, case-insensitive scan for the WARN-only ambiguous terms."""
    warnings: list[dict[str, Any]] = []
    patterns = [
        (term, re.compile(rf"\b{re.escape(term)}\b", re.IGNORECASE))
        for term in WARN_AMBIGUOUS_TERMS
    ]
    for field_path, text in prose:
        for term, pat in patterns:
            for m in pat.finditer(text):
                warnings.append(
                    {
                        "field": field_path,
                        "term": term,
                        "matched": m.group(0),
                        "span": [m.start(), m.end()],
                    }
                )
    return warnings


# --- Check 3: owner distribution -------------------------------------------


def _step_owner(step: dict[str, Any]) -> str | None:
    """Return an action step's owner label = assignments[0]['division'], or None."""
    assignments = step.get("assignments")
    if not isinstance(assignments, list) or not assignments:
        return None
    first = assignments[0]
    if not isinstance(first, dict):
        return None
    division = first.get("division")
    if isinstance(division, str) and division.strip():
        return division
    return None


def check_owner_distribution(draft: dict[str, Any]) -> dict[str, Any]:
    """Distinct owner count + largest single-owner share over action steps.

    Pass = (>1 distinct owner AND no single owner owning >50% of owned steps).
    Steps with no assignment are reported as `unowned` and excluded from the
    share denominator (they cannot concentrate ownership on one division).
    """
    owners: list[str] = []
    unowned = 0
    for step in draft.get("action_steps") or []:
        if not isinstance(step, dict):
            continue
        owner = _step_owner(step)
        if owner is None:
            unowned += 1
        else:
            owners.append(owner)

    distinct = sorted(set(owners))
    counts: dict[str, int] = {o: owners.count(o) for o in distinct}
    total_owned = len(owners)
    largest_pct = (max(counts.values()) / total_owned * 100.0) if total_owned else 0.0
    passed = len(distinct) > 1 and largest_pct <= 50.0
    return {
        "distinct_owner_count": len(distinct),
        "owners": counts,
        "owned_step_count": total_owned,
        "unowned_step_count": unowned,
        "largest_single_owner_pct": round(largest_pct, 2),
        "passed": passed,
    }


# --- Check 4: coverage -----------------------------------------------------


def check_coverage(
    draft: dict[str, Any],
    learner_outcome_universe: list[str],
    improvement_area_universe: list[str],
) -> dict[str, Any]:
    """Coverage of the school's learner-outcome and improvement-area universe.

    For each dimension, list present (targeted ∩ universe), accounted_gaps (the
    rows recorded as explicit not-this-cycle gaps in the structured
    `*_not_addressed` field — TASK-040), and the remaining gaps. A universe row
    is ACCOUNTED when it is targeted OR recorded in the structured
    `*_not_addressed` list; only a row that is NEITHER falls to the prose-mention
    fallback. Pass = every universe item is targeted OR a structured gap OR (the
    fallback) named as a whole word in the draft prose.
    """
    da = draft.get("domain_alignment") or {}
    prose_blob = " ".join(text for _path, text in _iter_prose_fields(draft))

    def _labels(key: str) -> list[str]:
        rows = da.get(key) or []
        labels: list[str] = []
        for row in rows:
            if isinstance(row, dict):
                label = row.get("label")
                if isinstance(label, str) and label.strip():
                    labels.append(label)
        return labels

    def _dimension(
        universe: list[str], targeted: list[str], not_addressed: list[str]
    ) -> dict[str, Any]:
        targeted_set = set(targeted)
        not_addressed_set = set(not_addressed)
        present = [u for u in universe if u in targeted_set]
        # TASK-040: a row recorded as a structured not-this-cycle gap is
        # ACCOUNTED — it skips the brittle prose-mention test (the escape
        # FGAP-033 exploited). accounted_gaps is the intersection of the
        # universe with the structured not_addressed list.
        accounted_gaps = [u for u in universe if u not in targeted_set and u in not_addressed_set]
        gaps = []
        for u in universe:
            if u in targeted_set or u in not_addressed_set:
                continue
            # F7: word-bounded, case-insensitive — the gap label counts as
            # mentioned only when it appears as a whole word. The boundary
            # excludes BOTH alphanumerics and hyphens on each side, so "Care"
            # does not match inside "caring" (alpha-suffix) and "Confident"
            # does not match inside "self-confident" (hyphen-prefix compound).
            mentioned = bool(
                re.search(rf"(?<![\w-]){re.escape(u)}(?![\w-])", prose_blob, re.IGNORECASE)
            )
            gaps.append({"label": u, "mentioned_in_prose": mentioned})
        # Pass when no remaining gap is silent (every fallback gap is at least
        # mentioned); structured accounted_gaps need no prose mention.
        passed = all(g["mentioned_in_prose"] for g in gaps)
        return {
            "universe_count": len(universe),
            "present": present,
            "accounted_gaps": accounted_gaps,
            "gaps": gaps,
            "passed": passed,
        }

    lo = _dimension(
        learner_outcome_universe,
        _labels("learner_outcomes_targeted"),
        _labels("learner_outcomes_not_addressed"),
    )
    ai = _dimension(
        improvement_area_universe,
        _labels("areas_for_improvement"),
        _labels("areas_for_improvement_not_addressed"),
    )
    return {
        "learner_outcomes": lo,
        "areas_for_improvement": ai,
        "passed": lo["passed"] and ai["passed"],
    }


# --- Check 5: review cadence ------------------------------------------------


def _resolve_review_date(event: dict[str, Any], milestones: list[Any]) -> _dt.date | None:
    """Resolve a review event's checkpoint date.

    `timing_kind="scheduled"` → `scheduled_date` (ISO date). `timing_kind=
    "milestone"` → `milestones[milestone_index]["target_date"]`. Returns None
    when the date is missing or unparseable.
    """
    timing_kind = event.get("timing_kind")
    raw: Any = None
    if timing_kind == "scheduled":
        raw = event.get("scheduled_date")
    elif timing_kind == "milestone":
        idx = event.get("milestone_index")
        if isinstance(idx, int) and not isinstance(idx, bool) and 0 <= idx < len(milestones):
            ms = milestones[idx]
            if isinstance(ms, dict):
                raw = ms.get("target_date")
    if not isinstance(raw, str) or not raw.strip():
        return None
    try:
        return _dt.date.fromisoformat(raw[:10])
    except ValueError:
        return None


def check_review_cadence(draft: dict[str, Any], cycle_year: int | None = None) -> dict[str, Any]:
    """Checkpoint count + earliest resolved date over review events.

    Pass = (count >= 4 AND earliest resolved date < 1 December of the cycle
    year). F10: the cycle year is the school's grounding `cycle.starts_on` year
    (injected via `cycle_year` — main() fills it from build_grounding; the unit
    test passes it directly without a DB). When `cycle_year` is None (no cycle
    grounding available), the "before December" anchor falls back to the
    earliest resolved date's own year — degraded, but never crashes.
    """
    events = draft.get("review_events") or []
    milestones = draft.get("milestones") or []
    count = len([e for e in events if isinstance(e, dict)])
    resolved = [
        d
        for e in events
        if isinstance(e, dict)
        for d in (_resolve_review_date(e, milestones),)
        if d is not None
    ]
    earliest = min(resolved) if resolved else None
    if earliest is not None:
        anchor_year = cycle_year if cycle_year is not None else earliest.year
        dec_first = _dt.date(anchor_year, 12, 1)
        before_dec = earliest < dec_first
    else:
        before_dec = False
    passed = count >= 4 and before_dec
    return {
        "checkpoint_count": count,
        "resolved_date_count": len(resolved),
        "earliest_date": earliest.isoformat() if earliest else None,
        "cycle_year": cycle_year,
        "earliest_before_december": before_dec,
        "passed": passed,
    }


# --- Check 6: three-view measurement ---------------------------------------

# TASK-044 (FGAP-037 / DEC-54): the whole-draft form of the three-view
# measurement discipline (preamble criterion 7). A FIXED 3-element universe,
# NOT a catalogue. Mirrors check_coverage's present-or-gap accounting.
_MEASUREMENT_VIEW_IDS: tuple[str, ...] = (
    "student_outcomes",
    "staff_practice",
    "parent_stakeholder",
)


def check_three_view(draft: dict[str, Any]) -> dict[str, Any]:
    """Every measurement view is a covering channel OR an explicit gap.

    TASK-044 (FGAP-037 / DEC-54): the whole-draft safety net for the three-view
    measurement discipline — measurement seen from student outcomes, staff/adult
    practice, AND parent/stakeholder awareness (preamble criterion 7). The
    universe is the FIXED `{student_outcomes, staff_practice,
    parent_stakeholder}`; a view is ACCOUNTED iff `draft["measurement_views"]`
    maps it to a valid 0-based `feedback_channels` index (the covering channel)
    OR a gap object (`{"gap": ...}`). Pass = all three accounted.

    Tolerant of shape (a non-dict `measurement_views`, a non-list
    `feedback_channels`, a bool index — counted as unaccounted, never raised)."""
    raw_views = draft.get("measurement_views")
    views = raw_views if isinstance(raw_views, dict) else {}
    channels = draft.get("feedback_channels")
    channel_count = len(channels) if isinstance(channels, list) else 0

    def _accounted(view_id: str) -> bool:
        value = views.get(view_id, None)
        if isinstance(value, dict) and "gap" in value:
            return True
        if isinstance(value, bool) or not isinstance(value, int):
            return False
        return 0 <= value < channel_count

    accounted = [v for v in _MEASUREMENT_VIEW_IDS if _accounted(v)]
    gaps = [v for v in _MEASUREMENT_VIEW_IDS if not _accounted(v)]
    return {
        "universe_count": len(_MEASUREMENT_VIEW_IDS),
        "accounted": accounted,
        "gaps": gaps,
        "passed": not gaps,
    }


# --- Check 7: bilingual measurement strand ---------------------------------

# TASK-046 (FGAP-039 / DEC-54): the whole-draft form of the bilingual
# measurement strand — an always-bilingual school MUST measure bilingual
# language improvement as a distinct strand: a STAFF English-usage measure AND
# a STUDENT bilingual-progress measure (distinct from the Bilingual-
# Communicators-SLO coverage entry). A FIXED 2-element universe, NOT a
# catalogue. Mirrors check_three_view's present-or-gap accounting.
_BILINGUAL_VIEW_IDS: tuple[str, ...] = (
    "staff_english_usage",
    "student_bilingual_progress",
)


def check_bilingual_views(draft: dict[str, Any]) -> dict[str, Any]:
    """Every bilingual measurement view is a covering channel OR an explicit gap.

    TASK-046 (FGAP-039 / DEC-54): the whole-draft safety net for the bilingual
    measurement strand — bilingual language improvement measured from a staff
    English-usage measure AND a student bilingual-progress measure (distinct
    from the Bilingual-Communicators-SLO coverage entry). The universe is the
    FIXED `{staff_english_usage, student_bilingual_progress}`; a view is
    ACCOUNTED iff `draft["bilingual_views"]` maps it to a valid 0-based
    `feedback_channels` index (the covering channel) OR a gap object
    (`{"gap": ...}`). Pass = both accounted.

    Tolerant of shape (a non-dict `bilingual_views`, a non-list
    `feedback_channels`, a bool index — counted as unaccounted, never raised)."""
    raw_views = draft.get("bilingual_views")
    views = raw_views if isinstance(raw_views, dict) else {}
    channels = draft.get("feedback_channels")
    channel_count = len(channels) if isinstance(channels, list) else 0

    def _accounted(view_id: str) -> bool:
        value = views.get(view_id, None)
        if isinstance(value, dict) and "gap" in value:
            return True
        if isinstance(value, bool) or not isinstance(value, int):
            return False
        return 0 <= value < channel_count

    accounted = [v for v in _BILINGUAL_VIEW_IDS if _accounted(v)]
    gaps = [v for v in _BILINGUAL_VIEW_IDS if not _accounted(v)]
    return {
        "universe_count": len(_BILINGUAL_VIEW_IDS),
        "accounted": accounted,
        "gaps": gaps,
        "passed": not gaps,
    }


# --- Check 8: decision-request well-formedness -----------------------------

# TASK-048 (FGAP-040 / DEC-0005): the whole-draft form of decision-request
# well-formedness — a decision-request is the upward escalation for an
# action-step precursor no division can own, each carrying the four non-empty
# string fields {what_decision, from_whom, why, blocks_unblocks}. Unlike the
# fixed-universe view checks, this is an EMERGENT LIST — well-formedness is
# deterministic (gated here); completeness ("every unowned precursor
# escalated") is ADVERSARIAL (DEC-53), NOT a deterministic gate. An EMPTY list
# is well-formed (passes).
_DECISION_REQUEST_FIELDS: tuple[str, ...] = (
    "what_decision",
    "from_whom",
    "why",
    "blocks_unblocks",
)


def check_decision_requests(draft: dict[str, Any]) -> dict[str, Any]:
    """Every in-draft decision-request entry carries the four non-empty fields.

    TASK-048 (FGAP-040 / DEC-0005): the whole-draft safety net for decision-
    request well-formedness — each entry in `draft["decision_requests"]` must
    be an object carrying EXACTLY the four non-empty string fields
    {what_decision, from_whom, why, blocks_unblocks}. Pass = every entry
    well-formed; an EMPTY list passes (completeness — every unowned precursor
    escalated — is ADVERSARIAL, not this deterministic gate).

    Tolerant of shape (a non-list `decision_requests`, a non-object entry, a
    non-string/blank field — counted as malformed, never raised). Reports the
    entry count + the list of malformed entries (index + reason)."""
    raw = draft.get("decision_requests")
    entries = raw if isinstance(raw, list) else []
    expected = set(_DECISION_REQUEST_FIELDS)

    malformed: list[dict[str, Any]] = []
    for idx, entry in enumerate(entries):
        if not isinstance(entry, dict):
            malformed.append({"index": idx, "reason": "not an object"})
            continue
        if set(entry.keys()) != expected:
            malformed.append(
                {"index": idx, "reason": f"keys {sorted(entry.keys())} != {list(expected)}"}
            )
            continue
        bad = [
            field
            for field in _DECISION_REQUEST_FIELDS
            if not isinstance(entry.get(field), str) or not entry.get(field, "").strip()
        ]
        if bad:
            malformed.append({"index": idx, "reason": f"empty/non-string field(s) {bad}"})

    return {
        "entry_count": len(entries),
        "malformed": malformed,
        "passed": not malformed,
    }


# --- Orchestration ---------------------------------------------------------


def run_checks(
    draft: dict[str, Any],
    learner_outcome_universe: list[str],
    improvement_area_universe: list[str],
    cycle_year: int | None = None,
) -> dict[str, Any]:
    """Run all eight checks + the ambiguous-term warnings; return a report dict.

    The coverage universe and the review-cadence `cycle_year` are injected (the
    unit test passes fixtures without a DB; main() fills them from
    build_grounding). DEC-53: the two LANGUAGE checks (process-method terms,
    scaffolding labels) are WARN — they are surfaced for the final polish pass
    and NEVER set `hard_failed` / cause a nonzero exit. `hard_failed` is kept
    in the report as a stable field, but under DEC-53 it is always False
    (language never gates). The real gate is the STRUCTURAL set — owner
    distribution (3), coverage (4), review cadence (5), three-view measurement
    (6, TASK-044), the bilingual measurement strand (7, TASK-046), and
    decision-request well-formedness (8, TASK-048) — enforced under --strict by
    `_exit_code`.
    """
    prose = _iter_prose_fields(draft)
    term_hits = _scan_hard_phrases(prose)
    label_hits = _scan_scaffolding_labels(prose)
    warnings = _scan_ambiguous(prose)
    strand_warnings = _scan_strand_prefixes(prose)

    report: dict[str, Any] = {
        # DEC-53: process-method terms are a LANGUAGE WARN (advisory, end-polish);
        # `hit_count` is surfaced but does not gate. `passed` still reflects a
        # clean scan for downstream readers, but it is advisory, not a blocker.
        "process_method_terms": {
            "hits": term_hits,
            "hit_count": len(term_hits),
            "passed": len(term_hits) == 0,
            "severity": "warn",
        },
        # DEC-53: scaffolding labels are a LANGUAGE WARN (advisory, end-polish).
        "scaffolding_labels": {
            "hits": label_hits,
            "hit_count": len(label_hits),
            "passed": len(label_hits) == 0,
            "severity": "warn",
        },
        "owner_distribution": check_owner_distribution(draft),
        "coverage": check_coverage(draft, learner_outcome_universe, improvement_area_universe),
        "review_cadence": check_review_cadence(draft, cycle_year),
        "three_view": check_three_view(draft),
        "bilingual_views": check_bilingual_views(draft),
        "decision_requests": check_decision_requests(draft),
        "ambiguous_warnings": {
            "warnings": warnings,
            "warning_count": len(warnings),
        },
        # FGAP-032 wontfix: strand prefixes are WARN-only (accepted form) — a
        # separate report channel that never feeds `hard_failed` / the exit code.
        "strand_prefix_warnings": {
            "warnings": strand_warnings,
            "warning_count": len(strand_warnings),
        },
    }
    # DEC-53: language checks (process-method terms + scaffolding labels) no
    # longer set `hard_failed`. The field stays for stable report shape and is
    # always False — there is no hard language gate. The gate is the structural
    # trio under --strict (see `_exit_code`).
    report["hard_failed"] = False
    return report


def _format_report(report: dict[str, Any], *, strict: bool) -> str:
    lines: list[str] = []
    lines.append("=== prompt-workshop draft check ===")
    lines.append(
        "    LANGUAGE checks (1-2) are WARN/advisory — surfaced for a final polish "
        "pass, never a completion blocker."
    )
    lines.append(
        "    STRUCTURAL checks (3-8) are the gate — report-only by default, "
        "exit-nonzero under --strict."
    )

    pmt = report["process_method_terms"]
    lines.append(
        f"[WARN] Check 1 — process-method terms "
        f"({pmt['hit_count']} hit(s) — language/advisory, end-polish)"
    )
    for h in pmt["hits"]:
        lines.append(
            f"    {h['field']}: {h['matched']!r} (phrase={h['phrase']!r}) span={h['span']}"
        )

    lbl = report["scaffolding_labels"]
    lines.append(
        f"[WARN] Check 2 — scaffolding labels "
        f"({lbl['hit_count']} hit(s) — language/advisory, end-polish)"
    )
    for h in lbl["hits"]:
        lines.append(f"    {h['field']}: {h['matched']!r} (kind={h['kind']}) span={h['span']}")

    od = report["owner_distribution"]
    lines.append(
        f"[{'PASS' if od['passed'] else 'FAIL'}] Check 3 — owner distribution (structural gate): "
        f"{od['distinct_owner_count']} distinct owner(s), "
        f"largest share {od['largest_single_owner_pct']}% "
        f"({od['owned_step_count']} owned, {od['unowned_step_count']} unowned)"
    )
    for owner, n in od["owners"].items():
        lines.append(f"    {owner}: {n}")

    cov = report["coverage"]
    lines.append(f"[{'PASS' if cov['passed'] else 'FAIL'}] Check 4 — coverage (structural gate)")
    for dim_key, label in (
        ("learner_outcomes", "learner outcomes"),
        ("areas_for_improvement", "improvement areas"),
    ):
        dim = cov[dim_key]
        lines.append(
            f"    {label}: {len(dim['present'])}/{dim['universe_count']} present, "
            f"{len(dim['gaps'])} gap(s)"
        )
        for g in dim["gaps"]:
            tag = "mentioned" if g["mentioned_in_prose"] else "SILENT GAP"
            lines.append(f"        gap: {g['label']!r} [{tag}]")

    rc = report["review_cadence"]
    lines.append(
        f"[{'PASS' if rc['passed'] else 'FAIL'}] Check 5 — review cadence (structural gate): "
        f"{rc['checkpoint_count']} checkpoint(s), earliest {rc['earliest_date']} "
        f"(cycle year {rc['cycle_year']}, before December: {rc['earliest_before_december']})"
    )

    tv = report["three_view"]
    lines.append(
        f"[{'PASS' if tv['passed'] else 'FAIL'}] Check 6 — three-view measurement "
        f"(structural gate): {len(tv['accounted'])}/{tv['universe_count']} view(s) accounted"
    )
    for g in tv["gaps"]:
        lines.append(f"    UNACCOUNTED view: {g!r}")

    bv = report["bilingual_views"]
    lines.append(
        f"[{'PASS' if bv['passed'] else 'FAIL'}] Check 7 — bilingual measurement strand "
        f"(structural gate): {len(bv['accounted'])}/{bv['universe_count']} view(s) accounted"
    )
    for g in bv["gaps"]:
        lines.append(f"    UNACCOUNTED view: {g!r}")

    dr = report["decision_requests"]
    lines.append(
        f"[{'PASS' if dr['passed'] else 'FAIL'}] Check 8 — decision-request well-formedness "
        f"(structural gate): {dr['entry_count']} entry(ies), "
        f"{len(dr['malformed'])} malformed"
    )
    for m in dr["malformed"]:
        lines.append(f"    MALFORMED decision_requests[{m['index']}]: {m['reason']}")

    warn = report["ambiguous_warnings"]
    lines.append(
        f"[WARN] Ambiguous terms ({warn['warning_count']} — language/advisory, end-polish)"
    )
    for w in warn["warnings"]:
        lines.append(f"    {w['field']}: {w['matched']!r} (term={w['term']!r}) span={w['span']}")

    strand = report["strand_prefix_warnings"]
    lines.append(
        f"[WARN] Strand prefixes ({strand['warning_count']} — "
        f"language/advisory, FGAP-032 accepted form)"
    )
    for w in strand["warnings"]:
        lines.append(f"    {w['field']}: {w['matched']!r} (kind={w['kind']}) span={w['span']}")

    # DEC-53: language never gates. The gate is the STRUCTURAL set (3-8), and it
    # is enforced only under --strict; by default the harness is report-only.
    structural_ok = (
        report["owner_distribution"]["passed"]
        and report["coverage"]["passed"]
        and report["review_cadence"]["passed"]
        and report["three_view"]["passed"]
        and report["bilingual_views"]["passed"]
        and report["decision_requests"]["passed"]
    )
    gated = strict and not structural_ok
    lines.append("")
    if strict:
        lines.append(
            f"RESULT: {'FAIL' if gated else 'PASS'} "
            f"(strict — structural gate; structural_ok={structural_ok}; "
            f"language items are WARN/advisory only)"
        )
    else:
        lines.append(
            "RESULT: REPORT-ONLY (default — exit 0; structural checks shown but not "
            "gated, run --strict to gate them; language items are WARN/advisory only)"
        )
    return "\n".join(lines) + "\n"


def _exit_code(report: dict[str, Any], *, strict: bool) -> int:
    """Exit code under DEC-53.

    Language checks (process-method terms + scaffolding labels) never gate —
    they are WARN/advisory, so `hard_failed` is always False and never produces
    a nonzero exit. The only nonzero exit is a STRUCTURAL failure (check
    3/4/5/6/7/8) under --strict; the default run is report-only (exit 0).
    """
    if strict and not (
        report["owner_distribution"]["passed"]
        and report["coverage"]["passed"]
        and report["review_cadence"]["passed"]
        and report["three_view"]["passed"]
        and report["bilingual_views"]["passed"]
        and report["decision_requests"]["passed"]
    ):
        return 1
    return 0


def _build_universe() -> tuple[list[str], list[str], int | None]:
    """Fill the coverage universe + cycle year from build_grounding (needs a DB).

    Imported lazily so the unit test path never touches Django. F6: Django boot
    (axes app `AXES:` log line + any setup output) is redirected to stderr so
    main() can keep stdout report-only. F10: the cycle year is the school's
    grounding `cycle.starts_on` year.
    """
    import contextlib

    from dispatch._workshop import get_tenant_school, setup_django

    with contextlib.redirect_stdout(sys.stderr):
        setup_django()
        from ai.services.grounding import build_grounding

        school = get_tenant_school()
        grounding = build_grounding(
            school,
            include=["learner_outcomes", "areas_for_improvement", "cycle"],
        )

    def _labels(section: str) -> list[str]:
        return [
            row["label"]
            for row in (grounding.get(section) or [])
            if isinstance(row, dict) and isinstance(row.get("label"), str)
        ]

    cycle_year: int | None = None
    cycle = grounding.get("cycle")
    if isinstance(cycle, dict):
        starts_on = cycle.get("starts_on")
        if isinstance(starts_on, str) and len(starts_on) >= 4 and starts_on[:4].isdigit():
            cycle_year = int(starts_on[:4])

    return _labels("learner_outcomes"), _labels("areas_for_improvement"), cycle_year


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="check_draft.py",
        description=(
            "Run the five deterministic checks over the assembled whole-plan draft. "
            "DEC-53: language checks (process-method terms, scaffolding labels) are "
            "WARN/advisory and never gate; the default run is report-only (exit 0). "
            "Pass --strict to gate the exit code on the structural trio (checks 3-5)."
        ),
    )
    p.add_argument(
        "--draft",
        type=Path,
        default=None,
        help=f"Override the draft location (default: {draft_path()}).",
    )
    p.add_argument(
        "--json",
        action="store_true",
        help="Emit the report as a JSON dict instead of formatted text.",
    )
    p.add_argument(
        "--strict",
        action="store_true",
        help=(
            "Gate the exit code on the structural trio (checks 3-5). Without it the "
            "run is report-only (exit 0). Language checks (1-2) never gate in either "
            "mode (DEC-53)."
        ),
    )
    return p.parse_args()


def _load_draft_strict(path: Path) -> dict[str, Any] | int:
    """Read + parse a draft file, returning the dict, or an int exit code on error.

    F4: a nonexistent path is a FALSE GREEN under the empty-shell-returning
    `load_draft` helper (an empty shell passes all checks → exit 0), so this
    checks existence first and returns 2 on a missing file. F5: a malformed-JSON
    or non-dict-top-level file is caught here and returns 2 (graceful), not a
    traceback. Errors print to stderr; the int return is the process exit code.
    """
    if not path.exists():
        print(f"check_draft.py: draft file not found: {path}", file=sys.stderr)
        return 2
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError as exc:
        print(f"check_draft.py: cannot read draft file {path}: {exc}", file=sys.stderr)
        return 2
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f"check_draft.py: draft file is not valid JSON ({path}): {exc}", file=sys.stderr)
        return 2
    if not isinstance(parsed, dict):
        print(
            f"check_draft.py: draft top-level value must be a JSON object, got "
            f"{type(parsed).__name__} ({path})",
            file=sys.stderr,
        )
        return 2
    return parsed


def main() -> int:
    args = _parse_args()

    target = args.draft if args.draft is not None else draft_path()
    loaded = _load_draft_strict(target)
    if isinstance(loaded, int):
        return loaded
    draft = loaded

    learner_outcomes, improvement_areas, cycle_year = _build_universe()
    report = run_checks(draft, learner_outcomes, improvement_areas, cycle_year)

    # F6: the report (text or --json) is the ONLY thing on stdout — Django boot
    # logging was already redirected to stderr inside _build_universe().
    if args.json:
        sys.stdout.write(json.dumps(report, indent=2, ensure_ascii=False, default=str) + "\n")
    else:
        sys.stdout.write(_format_report(report, strict=args.strict))
    return _exit_code(report, strict=args.strict)


if __name__ == "__main__":
    raise SystemExit(main())
