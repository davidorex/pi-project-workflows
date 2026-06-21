"""Apply a sub-agent response to a draft and emit JSON to stdout.

The substrate-sourced sibling of `apply.py`. Where `apply.py` reads the
agent response from stdin, validates via the production
`planner.specs.parse_<spec_key>` function, merges into the shared
`outputs/current-draft.json`, and writes a timestamped capture file, this
takes the response on `--raw-json`, validates the same way, and is the
single writer of immutable versioned drafts: it merges against an explicit
input draft (`--draft-path`) and writes the merged result to a fresh
`draft-after-<spec-key>.json` — it never overwrites the input draft in
place and never touches the default current-draft.json. A rejected parse
writes no new version (resume-idempotency §5a). Stdout carries the single
JSON object only; all diagnostics go to stderr.

Exit codes (parallel to apply.py):
  0  applied (clean) or applied-with-advisory-flags (flag-and-continue, DEC-53)
  1  hard reject — the production parse raised (unusable output), or no
     MERGE_RULE is registered for the spec
  2  usage — empty --raw-json
  3  structural self-check failure (FGAP-034 / DEC-54) — a structural
     `success_criteria` criterion failed on the merged draft; the immutable
     versioned output is NOT written and the orchestrator should re-dispatch
     this spec (the same gate apply.py enforces, here without a capture dir —
     stderr + this exit code carry the signal)
"""

from __future__ import annotations

import argparse
import contextlib
import dataclasses
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dispatch._workshop import (  # noqa: E402
    flatten_draft_for_grounding,
    get_parse_function,
    get_tenant_school,
    load_draft,
    load_snippet,
    save_draft,
    setup_django,
)

# apply.py is `__main__`-guarded, so importing its merge table + prefill
# extractor + carrier-lift helper runs no `main()`.
from dispatch.apply import MERGE_RULES, _apply_carrier_fields, _extract_prefill  # noqa: E402
from dispatch.self_check import run_self_check  # noqa: E402


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="apply_from_substrate.py",
        description="Validate a sub-agent response and write an immutable versioned draft.",
    )
    p.add_argument("--spec-key", required=True, help="The spec's `spec_key`.")
    p.add_argument("--raw-json", required=True, help="The agent's raw JSON response.")
    p.add_argument(
        "--draft-path",
        required=True,
        type=Path,
        help="The input draft to merge into (read-only; never overwritten in place).",
    )
    p.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help="Directory for the versioned output draft (default: --draft-path's parent).",
    )
    return p.parse_args()


def main() -> int:
    args = _parse_args()

    # `django.setup()` (and downstream library imports) emit log lines to the
    # real stdout — `config/settings/base.py` LOGGING routes `axes` + root to
    # a StreamHandler on `ext://sys.stdout`. Redirecting stdout→stderr around
    # setup + all processing keeps the real stdout empty until the final
    # success JSON dump after the block. The early-return paths write no JSON
    # and print their diagnostics explicitly to stderr, so they stay inside
    # the guard and return the same exit codes as before.
    with contextlib.redirect_stdout(sys.stderr):
        setup_django()

        if not args.raw_json.strip():
            print("apply_from_substrate.py: empty --raw-json", file=sys.stderr)
            return 2

        parse_fn = get_parse_function(args.spec_key)

        # Build the parse-time grounding against the EXPLICIT input draft
        # (`--draft-path`), not the default current-draft.json — so the
        # catalogue universe the parser validates against reflects the draft
        # this apply is actually merging into. Mirrors the lenient try/except
        # shape of apply.py's `_load_grounding_for_parse`: on any failure the
        # parse falls back to its lenient defaults rather than blocking.
        school: object | None
        grounding: dict[str, object] | None
        try:
            school = get_tenant_school()
        except Exception as exc:  # noqa: BLE001
            print(
                f"apply_from_substrate.py: could not resolve tenant school for"
                f" parse-time grounding: {exc}",
                file=sys.stderr,
            )
            school = None
            grounding = None
        else:
            try:
                from ai.services.grounding import build_grounding

                flat = flatten_draft_for_grounding(load_draft(args.draft_path))
                grounding = build_grounding(school, draft_state=flat, include=None)
            except Exception as exc:  # noqa: BLE001
                print(
                    f"apply_from_substrate.py: build_grounding failed for parse-time"
                    f" validation: {exc}",
                    file=sys.stderr,
                )
                grounding = None

        try:
            parsed = parse_fn(args.raw_json, school=school, grounding=grounding)
        except Exception as exc:  # noqa: BLE001 — production parse raises ValueError + subclasses
            print(
                f"apply_from_substrate.py: {args.spec_key} parse failed:"
                f" {exc.__class__.__name__}: {exc}",
                file=sys.stderr,
            )
            return 1

        prefill, _note = _extract_prefill(parsed)

        if args.spec_key not in MERGE_RULES:
            print(
                f"apply_from_substrate.py: no MERGE_RULE registered for spec_key={args.spec_key!r}",
                file=sys.stderr,
            )
            return 1

        draft_to_merge = load_draft(args.draft_path)
        MERGE_RULES[args.spec_key](draft_to_merge, prefill)

        # FGAP-034: enforce the SAME per-spec in-execution structural self-check
        # the orchestrator-driven apply.py runs — closing the enforcement-
        # uniformity hole where a substrate-assembled draft skipped every
        # structural gate (coverage, distribution, three_view, bilingual,
        # decision_requests). Lift the optional carrier fields via the shared
        # helper, then run the spec's self-check on the in-memory MERGED draft
        # BEFORE persistence: a STRUCTURAL failure refuses to write the immutable
        # version and exits 3 (no capture dir on this path — stderr + the exit
        # code carry the signal). Same evaluator, same inputs (frontmatter from
        # the snippet, the merged draft, the prefill, the parse-time grounding)
        # as apply.py, so both attach points enforce identically.
        frontmatter, _ = load_snippet(args.spec_key)
        _apply_carrier_fields(draft_to_merge, parsed)
        self_check = run_self_check(frontmatter, draft_to_merge, prefill, grounding)
        if not self_check["structural_passed"]:
            for failure in self_check["failures"]:
                print(
                    f"apply_from_substrate.py: {args.spec_key} structural self-check "
                    f"FAILED [{failure['id']}]: {failure['reason']}",
                    file=sys.stderr,
                )
            return 3

        # Soft-flag outcome (FGAP-006 / B2): a usable parse that carries flags
        # keeps its proposed values (merged above) AND records its flags into
        # the draft flags channel (B1). `flags_raw` is empty for a clean parse,
        # so the clean path is unchanged. A hard reject returned 1 above and
        # never reaches here.
        flags_raw = getattr(parsed, "flags", None) or []
        serialized_flags = [dataclasses.asdict(f) for f in flags_raw]
        if serialized_flags:
            draft_to_merge.setdefault("flags", []).extend(serialized_flags)

        # Single-writer immutable write: a fresh `draft-after-<spec-key>.json`,
        # never an in-place overwrite of the input draft and never the default
        # current-draft.json.
        out_dir = args.out_dir if args.out_dir else args.draft_path.parent
        out_path = out_dir / f"draft-after-{args.spec_key}.json"
        save_draft(draft_to_merge, out_path)

        result = {
            "spec_key": args.spec_key,
            "parsed": prefill,
            "draft_path": str(out_path.resolve()),
            # `parse_fn` is typed as the `ParseFunction` Protocol (no declared
            # `__name__`); real `planner.specs.parse_*` callables carry one, so
            # getattr recovers it at runtime while satisfying the type checker.
            "parser": getattr(parse_fn, "__name__", "<parse>"),
            "status": "flagged" if serialized_flags else "merged",
            "flags": serialized_flags,
        }

    json.dump(result, sys.stdout, ensure_ascii=False, default=str)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
