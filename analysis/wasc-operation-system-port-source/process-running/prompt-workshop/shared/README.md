# Shared

What every snippet uses + what every output validates against.

## `preamble.md`

The shared prompt preamble. Every snippet body opens with `{% include "shared/preamble.md" %}` so the audit-gap #8/#9/#10/#11 corrections (general LLM success criteria + zero-hedging + operational policies + current→desired solution-path meta-framing) apply uniformly across all 14 (or 15) prompts.

The file uses HTML comment markers `<!-- BEGIN PREAMBLE BODY -->` / `<!-- END PREAMBLE BODY -->` to delimit the content that actually gets rendered into prompts. Content outside the markers is metadata for human readers and is stripped at render time.

Edit the preamble body to uplift all 14 prompts simultaneously. Iteration on the preamble is the highest-leverage place to work — one edit propagates to every assist.

## Validation: production `parse_*` reuse (supersedes the schemas plan)

The earlier plan for `shared/schemas/*.schema.json` (per-spec JSON Schema files mirroring each `parse_*` contract) is superseded. `apply.py` validates by invoking the production parse function directly — `planner.specs.parse_<key>(response_text)` — so the workshop's validation IS production's validation, with zero risk of schema drift relative to the parse function.

The spec_key → parse-function-name mapping registry lives at `dispatch/_workshop.py::get_parse_function` (a simple dict of 14 entries). When a new snippet lands, add its spec_key → parse-function-name row there; no separate schema file is needed.

The snippet's `output_schema:` frontmatter field is retained as a human-readable pointer at the production validator but is not loaded by `apply.py`.

Failed parse triggers a stop-and-report to the orchestrator — same posture as a production parse failure.

## What lives here vs elsewhere

- `shared/preamble.md` — content that appears in every prompt
- `dispatch/_workshop.py::get_parse_function` — the spec_key → parse-function registry that supersedes the schemas plan
- (anything else cross-snippet that emerges during iteration)
