"""Render a snippet with live dev-DB grounding (Step 1 of the iteration loop).

Reads `snippets/<NN>-<spec_key>.md`, substitutes the shared preamble, builds
the grounding dict by calling the production `ai.services.grounding`
emitters named in the snippet's frontmatter, sanitizes via the production
`PromptSanitizer`, renders the body through Django's template engine, and
prints the fully-rendered prompt to stdout.

Writes `outputs/last-render.json` (the prompt + grounding dict + spec_key
+ timestamp) so `apply.py` can fold them into the per-dispatch capture
file without the orchestrator having to round-trip the rendered prompt
through bash.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import sys
from pathlib import Path

# Resolve workshop helpers via the local package path; the helpers add
# Django to sys.path so the production imports work transparently.
sys.path.insert(0, str(Path(__file__).parent.parent))

from dispatch._workshop import (  # noqa: E402
    draft_path,
    flatten_draft_for_grounding,
    get_tenant_school,
    last_render_path,
    load_draft,
    load_snippet,
    preamble_substitute,
    setup_django,
)


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="render.py",
        description="Render a workshop snippet with live grounding and print to stdout.",
    )
    p.add_argument("spec_key", help="The snippet's frontmatter `spec_key` (e.g. narrative-draft).")
    p.add_argument(
        "--seed",
        default="",
        help="Author seed text. Defaults to empty string (or the draft's seed_text if present).",
    )
    p.add_argument(
        "--draft",
        type=Path,
        default=None,
        help=f"Override the draft location (default: {draft_path()}).",
    )
    return p.parse_args()


def main() -> int:
    args = _parse_args()
    setup_django()

    frontmatter, body = load_snippet(args.spec_key)
    body = preamble_substitute(body)

    school = get_tenant_school()
    draft = load_draft(args.draft)

    seed = args.seed or (draft.get("meta", {}) or {}).get("seed_text", "") or ""

    from django.template import Context, Template  # type: ignore[import-not-found]

    from ai.services.grounding import build_grounding  # type: ignore[import-not-found]
    from ai.services.prompt_sanitizer import PromptSanitizer  # type: ignore[import-not-found]

    # Project the structured workshop draft into the flat
    # `{form-field-name: value}` shape production's browser-side
    # `collectDraftState()` emits and `AssistStreamView` forwards verbatim
    # to `build_grounding`. The on-disk `current-draft.json` stays
    # structured for human readability; flattening is render-time only.
    flat_draft_state = flatten_draft_for_grounding(draft)
    grounding = build_grounding(
        school,
        draft_state=flat_draft_state,
        include=frontmatter.get("grounding_sections") or None,
    )
    grounding = PromptSanitizer.sanitize_data_dict(grounding)

    context = {**grounding, "seed": seed}
    rendered = Template(body).render(Context(context, autoescape=False))

    # Persist the render pointer so apply.py can self-contain the capture
    # without the orchestrator round-tripping the rendered prompt through
    # bash. Best-effort: failure to write the pointer must not block
    # printing the prompt itself.
    try:
        payload = {
            "spec_key": args.spec_key,
            "rendered_prompt": rendered,
            "grounding_dict_used": grounding,
            "seed": seed,
            "timestamp": _dt.datetime.now().isoformat(),
        }
        last_render_path().parent.mkdir(parents=True, exist_ok=True)
        last_render_path().write_text(
            json.dumps(payload, indent=2, ensure_ascii=False, default=str) + "\n",
            encoding="utf-8",
        )
    except Exception as exc:  # noqa: BLE001
        print(f"warning: failed to persist last-render.json: {exc}", file=sys.stderr)

    sys.stdout.write(rendered)
    if not rendered.endswith("\n"):
        sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
