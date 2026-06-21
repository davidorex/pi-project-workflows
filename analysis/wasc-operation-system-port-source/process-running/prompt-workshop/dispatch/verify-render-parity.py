"""Byte-equivalence render gate (WORKSHOPPING-SUBSTRATE-SPEC §4).

Proves the `.workshopping` substrate reproduces, byte-for-byte, what the
current snippet pipeline renders. For each of the 14 spec_keys:

  OLD render = current snippet pipeline
      load_snippet(spec_key) -> preamble_substitute(body)
      -> Template(body).render(Context({**grounding, "seed": seed}))
  NEW render = substrate-assembled `fragment_refs`
      load_prompt_spec(spec_key) -> assemble_spec_body(spec, fragments)
      -> Template(body2).render(Context({**grounding, "seed": seed}))

Both sides feed the IDENTICAL grounding dict (one `build_grounding` per spec,
reused for both renders) and the IDENTICAL seed (one fixed value from the
committed draft), so an exact-string-equality pass proves the only thing that
changed is where the template TEXT came from. 14/14 identical -> GO.

Two cross-checks (spec §4):
  (a) for all 14, spec["grounding_sections"] == frontmatter["grounding_sections"]
      (set equality; any drift reported).
  (b) for each spec, the set of `section` values across its grounding-block
      fragments is a subset of spec["grounding_sections"] (no orphan / missing
      block).

Read-only against the substrate data files and snippets; mutates nothing.
Exits non-zero on any per-spec FAIL or cross-check failure.
"""

from __future__ import annotations

import difflib
import sys
from pathlib import Path

# Resolve workshop helpers via the local package path; the helpers add
# Django to sys.path so the production imports work transparently.
sys.path.insert(0, str(Path(__file__).parent.parent))

from dispatch._workshop import (  # noqa: E402
    _PARSE_FN_NAMES,
    assemble_spec_body,
    flatten_draft_for_grounding,
    get_tenant_school,
    load_draft,
    load_fragments,
    load_prompt_spec,
    load_snippet,
    preamble_substitute,
    setup_django,
)


def _truncate_diff(old: str, new: str, spec_key: str, limit: int = 60) -> str:
    diff = difflib.unified_diff(
        old.splitlines(keepends=True),
        new.splitlines(keepends=True),
        fromfile=f"OLD/{spec_key}",
        tofile=f"NEW/{spec_key}",
    )
    lines = list(diff)
    if len(lines) > limit:
        lines = lines[:limit] + [f"... ({len(lines) - limit} more diff lines truncated)\n"]
    return "".join(lines)


def main() -> int:
    setup_django()

    from django.template import Context, Template  # type: ignore[import-not-found]

    from ai.services.grounding import build_grounding  # type: ignore[import-not-found]
    from ai.services.prompt_sanitizer import PromptSanitizer  # type: ignore[import-not-found]

    # Tenant + draft + seed: held identical across both renders for every spec.
    school = get_tenant_school()
    draft = load_draft()
    flat_draft_state = flatten_draft_for_grounding(draft)
    seed = (draft.get("meta") or {}).get("seed_text", "") or ""

    fragments = load_fragments()

    # The 14 spec_keys are exactly the keys of the parse registry.
    spec_keys = list(_PARSE_FN_NAMES.keys())

    passes = 0
    failures: list[str] = []

    # Cross-check accumulators.
    cross_a_ok = True
    cross_a_drift: list[str] = []
    cross_b_ok = True
    cross_b_drift: list[str] = []

    for spec_key in spec_keys:
        # --- shared grounding (built ONCE per spec, reused both sides) ---
        frontmatter, body = load_snippet(spec_key)
        spec = load_prompt_spec(spec_key)

        # Cross-check (a): include lists must not have drifted.
        fm_sections = set(frontmatter.get("grounding_sections") or [])
        spec_sections = set(spec.get("grounding_sections") or [])
        if fm_sections != spec_sections:
            cross_a_ok = False
            cross_a_drift.append(
                f"  {spec_key}: snippet={sorted(fm_sections)} spec={sorted(spec_sections)}"
                f" (snippet-only={sorted(fm_sections - spec_sections)},"
                f" spec-only={sorted(spec_sections - fm_sections)})"
            )

        # Cross-check (b): grounding-block fragment sections subset of spec sections.
        # The `seed` pseudo-section (the per-spec `{% if seed %}` steer-line
        # block class, spec §1.2) is grounded via the render-context `seed`
        # value, NOT via `build_grounding(include=...)`, so it is by design
        # absent from `grounding_sections` and excluded from the subset check.
        gb_sections = set()
        for fid in spec["fragment_refs"]:
            frag = fragments.get(fid)
            if frag is None:
                cross_b_ok = False
                cross_b_drift.append(f"  {spec_key}: fragment_ref {fid!r} not found in fragments")
                continue
            if frag.get("kind") == "grounding-block":
                sec = frag.get("section")
                if sec is not None and sec != "seed":
                    gb_sections.add(sec)
        orphan = gb_sections - spec_sections
        if orphan:
            cross_b_ok = False
            cross_b_drift.append(
                f"  {spec_key}: grounding-block sections {sorted(orphan)} not in"
                f" grounding_sections {sorted(spec_sections)}"
            )

        # --- ONE grounding dict, fed to BOTH renders ---
        grounding = build_grounding(
            school,
            draft_state=flat_draft_state,
            include=frontmatter.get("grounding_sections") or None,
        )
        grounding = PromptSanitizer.sanitize_data_dict(grounding)
        context = {**grounding, "seed": seed}

        # OLD render.
        old_body = preamble_substitute(body)
        rendered_old = Template(old_body).render(Context(context, autoescape=False))

        # NEW render (same grounding context object).
        new_body = assemble_spec_body(spec, fragments)
        rendered_new = Template(new_body).render(Context(context, autoescape=False))

        if rendered_old == rendered_new:
            passes += 1
            print(f"PASS  {spec_key}")
        else:
            failures.append(spec_key)
            print(f"FAIL  {spec_key}")
            print(_truncate_diff(rendered_old, rendered_new, spec_key))

    total = len(spec_keys)

    print()
    print(f"cross-check (a) grounding_sections snippet==spec : {'PASS' if cross_a_ok else 'FAIL'}")
    if not cross_a_ok:
        print("\n".join(cross_a_drift))
    print(f"cross-check (b) gb-fragment sections subset      : {'PASS' if cross_b_ok else 'FAIL'}")
    if not cross_b_ok:
        print("\n".join(cross_b_drift))

    print()
    print(f"GATE: {passes}/{total}")

    ok = passes == total and cross_a_ok and cross_b_ok
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
