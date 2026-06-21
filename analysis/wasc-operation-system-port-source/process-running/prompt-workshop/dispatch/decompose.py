"""Deterministic decomposition of the 14 prompt snippets into prompt-fragments.

This module computes — and proves, by an exact-string reconstruction gate — the
partition described in `prompt-workshop/WORKSHOPPING-SUBSTRATE-SPEC.md`:

  (a) a set of `prompt-fragment` items: ONE `FRAG-preamble`, the §1.2
      grounding-block fragments (deduplicated by exact block-content equality),
      the two output-contract-header fragments, and the per-spec unique-prose
      fragments (`spec-intro` / `spec-contract`);
  (b) one `prompt-spec` per snippet carrying an ORDERED `fragment_refs` list and
      the frontmatter-mirrored fields (§2.2);
  (c) the composition + dependency edges (§3): `spec_composes_fragment` (one per
      `fragment_refs` entry) and `spec_depends_on_spec` (one per dep).

It EMITS NOTHING to any substrate. `decompose()` returns the computed partition
for a later slice to consume; `__main__` runs the reconstruction gate (and, with
`--emit <path>`, writes the partition to a plain JSON file for inspection).

Correctness rests on the line-partition invariant (WORKSHOPPING-SUBSTRATE-SPEC
§1.4 / invariant 1): each snippet body (the `body` from `load_snippet`, which
still carries the `{% include "shared/preamble.md" %}` line) is partitioned into
contiguous, non-overlapping, gapless line-segments in order; every line belongs
to exactly one segment, so `"\n".join(segment_strings) == body` by construction.
Each segment maps to one fragment id. Grounding-block segments dedup by exact
content; their inter-block blank lines live in the adjacent per-spec prose
fragments (invariant 4), so grounding fragments stay pure content and dedup to
the §1.2 table while reconstruction still reproduces the original spacing.

The gate target is `preamble_substitute(body)` (not the raw `body`): the
preamble include line maps to `FRAG-preamble`, whose body is exactly what
`preamble_substitute` injects (invariant 2).
"""

from __future__ import annotations

import argparse
import difflib
import json
import re
import sys
from pathlib import Path
from typing import Any

# The render.py sys.path + import pattern: make `dispatch` importable as a
# package-qualified module regardless of the invoking cwd.
_DISPATCH_DIR = Path(__file__).parent.resolve()
_WORKSHOP_ROOT = _DISPATCH_DIR.parent
if str(_WORKSHOP_ROOT) not in sys.path:
    sys.path.insert(0, str(_WORKSHOP_ROOT))

from dispatch._workshop import (  # noqa: E402
    _PARSE_FN_NAMES,
    _PREAMBLE_INCLUDE_LITERAL,
    load_snippet,
    preamble_substitute,
)

# --- Dispatch order (the snippet NN prefix → spec_key) ---------------------
#
# The canonical 1..14 order, matching the `NN-<spec_key>.md` filenames. Used
# for `prompt-spec.order` and as the snippet-number key the §1.2 table groups
# by (the table lists snippets by their NN).
_ORDERED_SPEC_KEYS: list[str] = [
    "narrative-draft",  # 01
    "propose-domain-alignment",  # 02
    "propose-milestones",  # 03
    "draft-success-criteria",  # 04
    "decompose-action-steps",  # 05
    "propose-assignments",  # 06
    "propose-responsibilities",  # 07
    "propose-timelines",  # 08
    "propose-step-resources",  # 09
    "propose-evidence",  # 10
    "suggest-feedback-channels",  # 11
    "bind-measurement-channels",  # 12
    "propose-accreditation-standards",  # 13
    "propose-review-loop",  # 14
]
_SPEC_ORDER: dict[str, int] = {sk: i + 1 for i, sk in enumerate(_ORDERED_SPEC_KEYS)}

# --- The two output-contract-header lines (§1.1) ---------------------------
#
# Verbatim byte-strings. The English-only sentence distinguishes the two; the
# byte-diff partitions the 14 snippets exactly two ways (asserted at gate time).
_HDR_EN = (
    "Return ONE JSON object and nothing else. Do not wrap it in markdown code "
    "fences. Do not write any prose before or after the JSON. Write all values "
    "in English only."
)
_HDR = (
    "Return ONE JSON object and nothing else. Do not wrap it in markdown code "
    "fences. Do not write any prose before or after the JSON."
)
_HDR_FRAG_ID_EN = "FRAG-output-contract-header-en"
_HDR_FRAG_ID = "FRAG-output-contract-header"

# --- The §1.2 grounding-block identity table (the dedup authority) ---------
#
# Each entry maps (grounding-section name, the EXACT set of snippet NNs whose
# block content is byte-identical) -> the §1.2 fragment id. The decomposition
# computes content-groups by exact block-content equality; `_assign_gb_ids`
# then asserts that the computed (section, snippet-set) groups reproduce THIS
# table exactly — a computed group with no matching row, or a table row with no
# matching computed group, is a STOP condition (the factoring drifted from the
# spec). This is what proves "the partition matches the §1.2 table".
#
# Keyed by (section, frozenset_of_snippet_numbers) for O(1) lookup + a
# bidirectional completeness check.
_GB_TABLE: dict[tuple[str, frozenset[int]], str] = {
    ("school", frozenset(range(1, 15))): "FRAG-gb-school",
    ("cycle", frozenset({1, 4, 5, 11, 14})): "FRAG-gb-cycle",
    ("cycle", frozenset({3})): "FRAG-gb-cycle-milestone",
    ("cycle", frozenset({8})): "FRAG-gb-cycle-window",
    ("seed", frozenset({2})): "FRAG-gb-seed-select",
    ("seed", frozenset({3})): "FRAG-gb-seed-milestones",
    ("seed", frozenset({4})): "FRAG-gb-seed-criteria",
    ("seed", frozenset({5})): "FRAG-gb-seed-steps",
    ("seed", frozenset({6})): "FRAG-gb-seed-assignments",
    ("seed", frozenset({7})): "FRAG-gb-seed-mapping",
    ("seed", frozenset({8})): "FRAG-gb-seed-timelines",
    ("seed", frozenset({9})): "FRAG-gb-seed-resources",
    ("seed", frozenset({10})): "FRAG-gb-seed-evidence",
    ("seed", frozenset({11})): "FRAG-gb-seed-channels",
    ("seed", frozenset({12})): "FRAG-gb-seed-bindings",
    ("seed", frozenset({13})): "FRAG-gb-seed-standards",
    ("seed", frozenset({14})): "FRAG-gb-seed-review",
    ("framing_vocabularies", frozenset({1})): "FRAG-gb-framing-vocabularies",
    ("priority_tiers", frozenset({1})): "FRAG-gb-priority-tiers",
    ("areas_for_improvement", frozenset({1, 3, 4, 5})): "FRAG-gb-areas-for-improvement",
    ("areas_for_improvement", frozenset({2})): "FRAG-gb-areas-for-improvement-choose",
    ("areas_for_improvement", frozenset({7, 13})): "FRAG-gb-areas-for-improvement-afi",
    ("learner_outcomes", frozenset({1, 3, 4, 5})): "FRAG-gb-learner-outcomes",
    ("learner_outcomes", frozenset({2})): "FRAG-gb-learner-outcomes-choose",
    ("learner_outcomes", frozenset({7, 13})): "FRAG-gb-learner-outcomes-slo",
    ("stakeholder_groups", frozenset({1})): "FRAG-gb-stakeholder-groups",
    ("stakeholder_groups", frozenset({2})): "FRAG-gb-stakeholder-groups-choose",
    ("stakeholder_groups", frozenset({5})): "FRAG-gb-stakeholder-groups-enumerated",
    ("stakeholder_groups", frozenset({11})): "FRAG-gb-stakeholder-groups-label",
    ("stakeholder_groups", frozenset({14})): "FRAG-gb-stakeholder-groups-audience",
    ("accreditation_standards", frozenset({1})): "FRAG-gb-accreditation-standards",
    ("accreditation_standards", frozenset({7, 10, 14})): "FRAG-gb-accreditation-standards-cite",
    ("accreditation_standards", frozenset({13})): "FRAG-gb-accreditation-standards-choose",
    ("prior_plans", frozenset({1})): "FRAG-gb-prior-plans",
    ("year_groups", frozenset({1})): "FRAG-gb-year-groups",
    ("guiding_statements", frozenset({1, 3, 4, 5, 7, 10, 13})): "FRAG-gb-guiding-statements",
    ("policies", frozenset({1, 4, 5, 10, 13})): "FRAG-gb-policies",
    ("policies", frozenset({2})): "FRAG-gb-policies-choose",
    ("divisions", frozenset({1, 4, 5, 9, 13})): "FRAG-gb-divisions-full",
    ("divisions", frozenset({6})): "FRAG-gb-divisions-labels-only",
    ("division_responsibility_atoms", frozenset({7})): "FRAG-gb-divisions-inventory",
    ("division_responsibility_summary", frozenset({5})): "FRAG-gb-division-responsibility-summary",
    ("divisions", frozenset({10})): "FRAG-gb-divisions-owner",
    ("divisions", frozenset({11})): "FRAG-gb-divisions-channel-owner",
    ("divisions", frozenset({14})): "FRAG-gb-divisions-unit",
    ("improvement_types", frozenset({3})): "FRAG-gb-improvement-types",
    ("improvement_types", frozenset({5})): "FRAG-gb-improvement-types-inplay",
    ("planning_methods", frozenset({3})): "FRAG-gb-planning-methods",
    ("planning_methods", frozenset({5})): "FRAG-gb-planning-methods-recipes",
    ("frequencies", frozenset({8})): "FRAG-gb-frequencies",
    ("frequencies", frozenset({11})): "FRAG-gb-frequencies-choose",
    ("frequencies", frozenset({14})): "FRAG-gb-frequencies-code",
    ("draft_state", frozenset({1})): "FRAG-gb-draft-state-full",
    ("draft_state", frozenset({3})): "FRAG-gb-draft-state-milestones-target",
    ("draft_state", frozenset({4})): "FRAG-gb-draft-state-criteria-source",
    ("draft_state", frozenset({5})): "FRAG-gb-draft-state-method",
    ("draft_state", frozenset({11})): "FRAG-gb-draft-state-channels-source",
    ("draft_state", frozenset({14})): "FRAG-gb-draft-state-review",
    ("draft_state", frozenset({2, 13})): "FRAG-gb-draft-state-prose",
    ("draft_state", frozenset({6, 7, 9, 10})): "FRAG-gb-draft-state-steps",
    ("draft_state", frozenset({8})): "FRAG-gb-draft-state-steps-milestones",
    ("draft_state", frozenset({12})): "FRAG-gb-draft-state-criteria-channels",
}

# --- Template-tag scanners -------------------------------------------------

# Counts depth deltas: {% if %}/{% for %} open (+1), {% endif %}/{% endfor %}
# close (-1). Used to find the matching close of a top-level grounding block.
_TAG = re.compile(r"\{%\s*(if|for|endif|endfor)\b")
# A line whose stripped form OPENS with `{% if <section> %}` (the grounding
# block start). `<section>` is matched against the spec's grounding sections.
_IF_OPEN = re.compile(r"\{%\s*if\s+([a-z_]+)\s*%\}")


class DecomposeError(Exception):
    """A reconciliation failure — a STOP condition (do not fudge a pass)."""


# --- Per-snippet line segmentation -----------------------------------------


def _segment_body(
    body: str, grounding_sections: list[str]
) -> list[tuple[str, list[str], str | None]]:
    """Partition `body` lines into contiguous, gapless, ordered segments.

    Returns a list of `(seg_kind, lines, section)` tuples where `seg_kind` is
    `"preamble"` (the include line), `"gb"` (a top-level grounding block — the
    `{% if <section> %}…{% endif %}` span, no surrounding blank lines), or
    `"prose"` (everything else, carrying its blank lines). `section` is set only
    for `"gb"` segments. By construction `"\\n".join("\\n".join(lines) for each
    seg) == body` — invariant 1.

    A grounding block STARTS at a line whose stripped form opens with
    `{% if <S> %}` where `S` is in the spec's `grounding_sections` PLUS `seed`
    (seed is a grounding-block-class steer present in snippets 02–14 but passed
    to render via `seed=`, so it is not listed in frontmatter `grounding_sections`
    — §1.2 records it as the `FRAG-gb-seed-*` class). The block ENDS at the line
    where tag-nesting depth returns to 0.
    """
    grounding = set(grounding_sections) | {"seed"}
    lines = body.split("\n")
    segs: list[tuple[str, list[str], str | None]] = []
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        stripped = line.strip()
        if line == _PREAMBLE_INCLUDE_LITERAL:
            segs.append(("preamble", [line], None))
            i += 1
            continue
        m = _IF_OPEN.match(stripped)
        if m and m.group(1) in grounding:
            section = m.group(1)
            depth = 0
            j = i
            blk: list[str] = []
            while j < n:
                lj = lines[j]
                for tok in _TAG.findall(lj):
                    depth += 1 if tok in ("if", "for") else -1
                blk.append(lj)
                j += 1
                if depth == 0:
                    break
            if depth != 0:
                raise DecomposeError(
                    f"unbalanced template tags starting at line {i} of a "
                    f"grounding block (section={section!r})"
                )
            segs.append(("gb", blk, section))
            i = j
            continue
        # Prose run: accumulate until the next grounding-block start, the
        # preamble include line, or EOF.
        run: list[str] = []
        while i < n:
            line = lines[i]
            stripped = line.strip()
            m2 = _IF_OPEN.match(stripped)
            if line == _PREAMBLE_INCLUDE_LITERAL or (m2 and m2.group(1) in grounding):
                break
            run.append(line)
            i += 1
        segs.append(("prose", run, None))
    return segs


def _split_prose_at_header(
    lines: list[str],
) -> tuple[list[str], str, str, list[str]] | None:
    """If `lines` contains exactly one output-contract-header line, split it.

    Returns `(pre_lines, header_frag_id, header_body, post_lines)` where the
    header line is lifted out as the shared fragment and `pre`/`post` are the
    per-spec prose around it. Returns None if no header line is present. Raises
    `DecomposeError` if more than one header line appears (the prose run carries
    two headers — unexpected, do not silently pick the first).
    """
    hits = [(idx, line) for idx, line in enumerate(lines) if line in (_HDR, _HDR_EN)]
    if not hits:
        return None
    if len(hits) > 1:
        raise DecomposeError(
            f"prose run carries {len(hits)} output-contract-header lines; expected exactly one"
        )
    idx, line = hits[0]
    if line == _HDR_EN:
        fid, body = _HDR_FRAG_ID_EN, _HDR_EN
    else:
        fid, body = _HDR_FRAG_ID, _HDR
    return lines[:idx], fid, body, lines[idx + 1 :]


# --- Grounding-block id assignment (the §1.2 reconciliation) ---------------


def _assign_gb_ids(
    gb_groups: dict[str, dict[str, Any]],
) -> dict[str, str]:
    """Map each computed grounding-block content-group to its §1.2 fragment id.

    `gb_groups` is keyed by exact block-content string; each value carries
    `{"section": <name>, "snips": set[int]}`. Asserts a bijection with
    `_GB_TABLE`: every computed (section, snippet-set) must match a table row,
    and every table row must be hit by exactly one computed group. Any
    unmatched computed group or unmatched table row is a STOP condition.

    Returns `{content_string: fragment_id}`.
    """
    content_to_id: dict[str, str] = {}
    matched_rows: set[tuple[str, frozenset[int]]] = set()
    for content, meta in gb_groups.items():
        key = (meta["section"], frozenset(meta["snips"]))
        if key not in _GB_TABLE:
            raise DecomposeError(
                "grounding-block group does not match any §1.2 table row: "
                f"section={meta['section']!r} snippets={sorted(meta['snips'])}; "
                "the factoring drifted from the spec — STOP (do not invent an id)"
            )
        content_to_id[content] = _GB_TABLE[key]
        matched_rows.add(key)
    missing = set(_GB_TABLE) - matched_rows
    if missing:
        rows = ", ".join(
            f"{_GB_TABLE[k]} (section={k[0]!r}, snippets={sorted(k[1])})"
            for k in sorted(missing, key=lambda k: _GB_TABLE[k])
        )
        raise DecomposeError(
            f"§1.2 table rows had no matching computed grounding-block group: {rows}"
        )
    return content_to_id


# --- The decomposition -----------------------------------------------------


def decompose() -> dict[str, Any]:
    """Compute the fragment / spec / edge partition. EMITS NOTHING.

    Returns `{"fragments": {id: item}, "specs": [item, …], "edges": [edge, …]}`
    where each fragment item carries `id`/`kind`/`body` (+ `section` for
    grounding blocks), each spec item carries the §2.2 fields, and each edge is
    `{"relation_type", "source", "target"}` (§3). The grounding-block fragments
    are deduplicated to the §1.2 table; per-spec prose fragments are unique.
    """
    # Pass 1: segment every snippet; collect grounding-block content-groups so
    # the §1.2 ids can be assigned before any spec is built (a fragment shared
    # across specs must resolve to the same id everywhere).
    per_spec_segments: dict[str, list[tuple[str, list[str], str | None]]] = {}
    per_spec_fm: dict[str, dict[str, Any]] = {}
    gb_groups: dict[str, dict[str, Any]] = {}
    for sk in _ORDERED_SPEC_KEYS:
        fm, body = load_snippet(sk)
        if fm.get("spec_key") != sk:
            raise DecomposeError(
                f"snippet for {sk!r} carries frontmatter spec_key={fm.get('spec_key')!r}"
            )
        # Invariant 2 guard: the include line must be exactly the token alone.
        include_lines = [line for line in body.split("\n") if _PREAMBLE_INCLUDE_LITERAL in line]
        for line in include_lines:
            if line != _PREAMBLE_INCLUDE_LITERAL:
                raise DecomposeError(f"{sk}: include line carries extra text: {line!r} — STOP")
        segs = _segment_body(body, fm["grounding_sections"])
        per_spec_segments[sk] = segs
        per_spec_fm[sk] = fm
        nn = _SPEC_ORDER[sk]
        for seg in segs:
            if seg[0] == "gb":
                content = "\n".join(seg[1])
                grp = gb_groups.setdefault(content, {"section": seg[2], "snips": set()})
                if grp["section"] != seg[2]:
                    raise DecomposeError(
                        f"identical block content under two sections "
                        f"({grp['section']!r} vs {seg[2]!r}) — STOP"
                    )
                grp["snips"].add(nn)

    gb_content_to_id = _assign_gb_ids(gb_groups)

    # Pass 2: build fragments, fragment_refs, specs, edges.
    fragments: dict[str, dict[str, Any]] = {}
    specs: list[dict[str, Any]] = []
    edges: list[dict[str, str]] = []

    def _put_fragment(fid: str, kind: str, body: str, section: str | None = None) -> None:
        """Register (or confirm) a fragment; a re-register must be byte-identical."""
        item: dict[str, Any] = {"id": fid, "kind": kind, "body": body}
        if section is not None:
            item["section"] = section
        existing = fragments.get(fid)
        if existing is not None:
            if existing != item:
                raise DecomposeError(
                    f"fragment id {fid!r} registered with two different bodies — STOP"
                )
            return
        fragments[fid] = item

    for sk in _ORDERED_SPEC_KEYS:
        fm = per_spec_fm[sk]
        segs = per_spec_segments[sk]
        refs: list[str] = []
        intro_n = 0
        for seg in segs:
            kind = seg[0]
            if kind == "preamble":
                _put_fragment(
                    "FRAG-preamble",
                    "preamble",
                    preamble_substitute(_PREAMBLE_INCLUDE_LITERAL),
                )
                refs.append("FRAG-preamble")
            elif kind == "gb":
                content = "\n".join(seg[1])
                fid = gb_content_to_id[content]
                _put_fragment(fid, "grounding-block", content, section=seg[2])
                refs.append(fid)
            else:  # prose
                split = _split_prose_at_header(seg[1])
                if split is None:
                    fid = f"FRAG-intro-{sk}-{intro_n}"
                    intro_n += 1
                    _put_fragment(fid, "spec-intro", "\n".join(seg[1]))
                    refs.append(fid)
                else:
                    pre, hdr_fid, hdr_body, post = split
                    if pre:
                        fid = f"FRAG-intro-{sk}-{intro_n}"
                        intro_n += 1
                        _put_fragment(fid, "spec-intro", "\n".join(pre))
                        refs.append(fid)
                    _put_fragment(hdr_fid, "output-contract-header", hdr_body)
                    refs.append(hdr_fid)
                    cid = f"FRAG-contract-{sk}"
                    _put_fragment(cid, "spec-contract", "\n".join(post))
                    refs.append(cid)

        spec_id = f"SPEC-{sk}"
        spec_item: dict[str, Any] = {
            "id": spec_id,
            "spec_key": sk,
            "order": _SPEC_ORDER[sk],
            "target_step": fm["target_step"],
            "preview_mode": fm["preview_mode"],
            "grounding_sections": list(fm["grounding_sections"]),
            "deps": list(fm.get("deps", [])),
            "fragment_refs": refs,
            "parser": _PARSE_FN_NAMES[sk],
        }
        if "source_migration" in fm:
            spec_item["source_migration"] = fm["source_migration"]
        if "output_schema" in fm:
            spec_item["output_schema"] = fm["output_schema"]
        specs.append(spec_item)

        # Edges: one composes edge per fragment_ref (unordered graph
        # projection; order is authoritative in fragment_refs — §3).
        for fid in refs:
            edges.append(
                {
                    "relation_type": "spec_composes_fragment",
                    "source": spec_id,
                    "target": fid,
                }
            )
        # Edges: one depends edge per dep.
        for dep in spec_item["deps"]:
            edges.append(
                {
                    "relation_type": "spec_depends_on_spec",
                    "source": spec_id,
                    "target": f"SPEC-{dep}",
                }
            )

    return {"fragments": fragments, "specs": specs, "edges": edges}


# --- The reconstruction gate -----------------------------------------------


def run_gate(partition: dict[str, Any] | None = None) -> bool:
    """Assemble each spec's fragment_refs and assert exact equality with the
    `preamble_substitute(load_snippet(spec_key)[1])` target. Prints per-spec
    PASS/FAIL + a final `GATE: N/14`. Returns True iff 14/14.
    """
    part = partition if partition is not None else decompose()
    fragments = part["fragments"]
    specs = {s["spec_key"]: s for s in part["specs"]}
    passed = 0
    for sk in _ORDERED_SPEC_KEYS:
        spec = specs[sk]
        assemble = "\n".join(fragments[fid]["body"] for fid in spec["fragment_refs"])
        _, body = load_snippet(sk)
        target = preamble_substitute(body)
        if assemble == target:
            passed += 1
            print(f"PASS  {sk}")
        else:
            print(f"FAIL  {sk}")
            for line in difflib.unified_diff(
                target.split("\n"),
                assemble.split("\n"),
                fromfile=f"{sk}:OLD(snippet)",
                tofile=f"{sk}:NEW(assembled)",
                lineterm="",
            ):
                print(line)
    print(f"GATE: {passed}/14")
    return passed == 14


def _emit(partition: dict[str, Any], path: Path) -> None:
    """Write the partition to a plain JSON file for inspection (NOT a substrate)."""
    # `fragments` is keyed by id; serialize as a sorted list for stable output.
    out = {
        "fragments": [partition["fragments"][k] for k in sorted(partition["fragments"])],
        "specs": partition["specs"],
        "edges": partition["edges"],
    }
    path.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--emit",
        metavar="PATH",
        help="write the computed partition to PATH as plain JSON (inspection only)",
    )
    args = parser.parse_args(argv)

    try:
        partition = decompose()
    except DecomposeError as exc:
        print(f"STOP: {exc}", file=sys.stderr)
        return 2

    ok = run_gate(partition)

    if args.emit:
        _emit(partition, Path(args.emit))
        print(f"emitted partition -> {args.emit}")

    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
