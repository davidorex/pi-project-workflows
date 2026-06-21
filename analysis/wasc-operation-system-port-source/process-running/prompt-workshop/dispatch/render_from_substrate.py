"""Render a spec from the `.workshopping` substrate and emit JSON to stdout.

The substrate-sourced sibling of `render.py`. Where `render.py` loads a
single snippet MD and substitutes the shared preamble, this assembles the
spec body from the `.workshopping` substrate's `fragment_refs` (the
preamble is itself a `FRAG-preamble` element of those refs, so the
assembled body is already complete — no `preamble_substitute` step). It
builds the grounding dict by calling the production `ai.services.grounding`
emitters named in the spec's `grounding_sections`, sanitizes via the
production `PromptSanitizer`, renders the body through Django's template
engine, and writes exactly one JSON object (the rendered prompt + spec
metadata + a sha256 of the prompt) to stdout.

Stdout carries the single JSON object only; all diagnostics go to stderr.
No side file is written (no `last-render.json`); the JSON object is the
sole output, consumed by the workflow runner.
"""

from __future__ import annotations

import argparse
import contextlib
import hashlib
import json
import sys
from pathlib import Path

# Resolve workshop helpers via the local package path; the helpers add
# Django to sys.path so the production imports work transparently.
sys.path.insert(0, str(Path(__file__).parent.parent))

from dispatch._workshop import (  # noqa: E402
    assemble_spec_body,
    flatten_draft_for_grounding,
    get_tenant_school,
    load_draft,
    load_fragments,
    load_prompt_spec,
    setup_django,
)


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="render_from_substrate.py",
        description="Render a substrate spec with live grounding and emit JSON to stdout.",
    )
    p.add_argument(
        "--spec-key",
        required=True,
        help="The spec's `spec_key` (e.g. narrative-draft).",
    )
    p.add_argument(
        "--seed",
        default="",
        help="Author seed text. Defaults to empty string (or the draft's seed_text if present).",
    )
    p.add_argument(
        "--draft-path",
        type=Path,
        default=None,
        help="Override the draft location (default: outputs/current-draft.json).",
    )
    return p.parse_args()


def main() -> int:
    args = _parse_args()

    # `django.setup()` (and downstream library imports) emit log lines to the
    # real stdout — `config/settings/base.py` LOGGING routes `axes` + root to
    # a StreamHandler on `ext://sys.stdout`. Redirecting stdout→stderr around
    # setup + all processing keeps the real stdout empty until the final
    # success JSON dump after the block, satisfying the one-JSON-object
    # command-step contract.
    with contextlib.redirect_stdout(sys.stderr):
        setup_django()

        school = get_tenant_school()

        # Assemble the spec body from the substrate's fragment_refs. The shared
        # preamble is itself a `FRAG-preamble` element of `fragment_refs`, so the
        # assembled body is complete — no separate preamble substitution.
        fragments = load_fragments()
        spec = load_prompt_spec(args.spec_key)
        body = assemble_spec_body(spec, fragments)

        draft = load_draft(args.draft_path)
        seed = args.seed or (draft.get("meta", {}) or {}).get("seed_text", "") or ""

        from django.template import Context, Template  # type: ignore[import-not-found]

        from ai.services.grounding import build_grounding  # type: ignore[import-not-found]
        from ai.services.prompt_sanitizer import PromptSanitizer  # type: ignore[import-not-found]

        # Project the structured workshop draft into the flat
        # `{form-field-name: value}` shape production's browser-side
        # `collectDraftState()` emits and `AssistStreamView` forwards verbatim
        # to `build_grounding`. The on-disk draft stays structured for human
        # readability; flattening is render-time only.
        flat = flatten_draft_for_grounding(draft)
        grounding = build_grounding(
            school,
            draft_state=flat,
            include=spec["grounding_sections"],
        )
        grounding = PromptSanitizer.sanitize_data_dict(grounding)

        prompt = Template(body).render(Context({**grounding, "seed": seed}, autoescape=False))

        result = {
            "spec_key": args.spec_key,
            "prompt": prompt,
            "fragment_refs": spec["fragment_refs"],
            "grounding_sections": spec["grounding_sections"],
            "prompt_hash": hashlib.sha256(prompt.encode("utf-8")).hexdigest(),
        }

    json.dump(result, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
