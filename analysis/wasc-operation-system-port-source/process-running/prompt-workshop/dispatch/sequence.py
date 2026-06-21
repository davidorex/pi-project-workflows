"""Whole-plan sequence helper.

Two modes:

- `--start-fresh --mode <...> --seed <...>` resets `outputs/current-draft.json`
  to a fresh shell (entry-mode metadata populated) and prints the
  orchestrator recipe (the ordered list of spec_keys + a per-step
  render→dispatch→apply instruction line).
- `--render-whole-draft` reads the current draft and pretty-prints it in
  canonical-render-style markdown for top-to-bottom reading.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dispatch._workshop import (  # noqa: E402
    WORKSHOP_ROOT,
    empty_draft_shell,
    load_draft,
    save_draft,
)

_VALID_MODES = (
    "I have a problem",
    "I have an outcome in mind",
    "Formalize a proposal",
)


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="sequence.py",
        description="Reset the running draft or pretty-print the assembled whole-plan draft.",
    )
    mode_group = p.add_mutually_exclusive_group(required=True)
    mode_group.add_argument(
        "--start-fresh",
        action="store_true",
        help="Reset current-draft.json to a fresh shell and print the orchestrator recipe.",
    )
    mode_group.add_argument(
        "--render-whole-draft",
        action="store_true",
        help="Pretty-print the assembled draft in canonical-render-style markdown.",
    )
    p.add_argument(
        "--mode",
        choices=_VALID_MODES,
        help="Entry mode (required with --start-fresh).",
    )
    p.add_argument(
        "--seed",
        default="",
        help="Author seed text (used with --start-fresh).",
    )
    return p.parse_args()


def _ordered_spec_keys() -> list[str]:
    """Return spec_keys in dependency order (= ls-sorted snippet filenames)."""
    snippets_dir = WORKSHOP_ROOT / "snippets"
    keys: list[str] = []
    for path in sorted(snippets_dir.glob("*.md")):
        name = path.stem  # e.g. "01-narrative-draft"
        if "-" not in name:
            continue
        head, _, tail = name.partition("-")
        if not head.isdigit():
            continue
        keys.append(tail)
    return keys


def _start_fresh(mode: str, seed: str) -> int:
    shell = empty_draft_shell()
    shell["meta"]["entry_mode"] = mode
    shell["meta"]["seed_text"] = seed
    shell["meta"]["started_at"] = _dt.datetime.now().isoformat()
    save_draft(shell)

    keys = _ordered_spec_keys()
    total = len(keys)
    lines: list[str] = []
    lines.append(f"# Fresh draft created — entry_mode={mode!r}, seed={seed!r}")
    lines.append(f"# {total} spec_keys to dispatch in dependency order:")
    lines.append("")
    for idx, key in enumerate(keys, start=1):
        lines.append(
            f"Step {idx}/{total}: python prompt-workshop/dispatch/render.py {key}"
            f"  →  orchestrator dispatches sub-agent with the rendered prompt"
            f"  →  echo 'response-json' | python prompt-workshop/dispatch/apply.py {key}"
        )
    lines.append("")
    lines.append(
        "After all steps: python prompt-workshop/dispatch/sequence.py --render-whole-draft"
    )
    sys.stdout.write("\n".join(lines) + "\n")
    return 0


# --- Whole-draft pretty-printer -------------------------------------------


def _section(title: str) -> str:
    return f"\n## {title}\n"


def _render_dict_list(items: list[dict] | None) -> str:
    if not items:
        return "_(none)_\n"
    chunks: list[str] = []
    for idx, item in enumerate(items, start=1):
        chunks.append(f"### Item {idx}\n")
        for k, v in item.items():
            chunks.append(f"- **{k}**: {_format_value(v)}\n")
        chunks.append("\n")
    return "".join(chunks)


def _format_value(v) -> str:
    if isinstance(v, (dict, list)):
        return "\n  " + json.dumps(v, indent=2, ensure_ascii=False, default=str).replace(
            "\n", "\n  "
        )
    if v is None:
        return "_null_"
    return str(v)


def _render_whole_draft() -> int:
    draft = load_draft()
    out: list[str] = []
    out.append("# Whole-plan draft (assembled from current-draft.json)\n")

    meta = draft.get("meta") or {}
    out.append(_section("Meta"))
    out.append(f"- entry_mode: {meta.get('entry_mode')}\n")
    out.append(f"- seed_text: {meta.get('seed_text')!r}\n")
    out.append(f"- started_at: {meta.get('started_at')}\n")
    out.append(f"- source_proposal_id: {meta.get('source_proposal_id')}\n")

    plan = draft.get("plan") or {}
    out.append(_section("Plan basics"))
    if not plan:
        out.append("_(no plan fields populated yet)_\n")
    else:
        for k, v in plan.items():
            out.append(f"- **{k}**: {_format_value(v)}\n")

    domain = draft.get("domain_alignment") or {}
    out.append(_section("Domain alignment"))
    if not any(domain.values()):
        out.append("_(none)_\n")
    else:
        for k, v in domain.items():
            out.append(f"- **{k}**: {_format_value(v)}\n")

    out.append(_section("Milestones"))
    out.append(_render_dict_list(draft.get("milestones") or []))

    out.append(_section("Phases"))
    out.append(_render_dict_list(draft.get("phases") or []))

    out.append(_section("Action steps"))
    out.append(_render_dict_list(draft.get("action_steps") or []))

    out.append(_section("Success criteria"))
    out.append(_render_dict_list(draft.get("success_criteria") or []))

    out.append(_section("Feedback channels"))
    out.append(_render_dict_list(draft.get("feedback_channels") or []))

    out.append(_section("Evidence artifacts"))
    out.append(_render_dict_list(draft.get("evidence_artifacts") or []))

    out.append(_section("Review loop — events"))
    out.append(_render_dict_list(draft.get("review_events") or []))

    out.append(_section("Review loop — communications"))
    out.append(_render_dict_list(draft.get("communications") or []))

    out.append(_section("Review loop — revision rules"))
    out.append(_render_dict_list(draft.get("revision_rules") or []))

    out.append(_section("Accreditation standards"))
    out.append(_render_dict_list(draft.get("accreditation_standards") or []))

    out.append(_section("Guiding clauses"))
    out.append(_render_dict_list(draft.get("guiding_clauses") or []))

    responsibilities = draft.get("responsibilities") or {}
    out.append(_section("Responsibilities — division"))
    out.append(_render_dict_list(responsibilities.get("division") or []))
    out.append(_section("Responsibilities — position"))
    out.append(_render_dict_list(responsibilities.get("position") or []))

    sys.stdout.write("".join(out))
    return 0


def main() -> int:
    args = _parse_args()
    if args.start_fresh:
        if not args.mode:
            print("sequence.py: --start-fresh requires --mode", file=sys.stderr)
            return 2
        return _start_fresh(args.mode, args.seed)
    if args.render_whole_draft:
        return _render_whole_draft()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
