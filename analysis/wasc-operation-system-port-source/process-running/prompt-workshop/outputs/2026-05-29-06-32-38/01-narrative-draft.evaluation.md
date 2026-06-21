# Experiment evaluation — A1 narrative-draft, iteration 01

**Capture**: `01-narrative-draft.json` (sibling file)
**Spec**: `narrative-draft` (A1)
**Snippet body source**: `prompt-workshop/snippets/01-narrative-draft.md` (verbatim copy of `ai/migrations/0003_seed_plan_narrative_draft_template.py::body`)
**Shared preamble state**: as committed `a0b4cca` (audit-gap #8/#9/#10/#11 corrections populated)
**Entry mode**: "I have a problem"
**Seed**: "Improve SLO usage across the school"
**Dispatched at**: 2026-05-29T06:32:38 (capture timestamp)
**Judge**: orchestrator (free-form, no rubric per workshop convention)

## Disposition

**Pass.** End-to-end harness works; output is substantive; preamble corrections take effect.

## What worked

- **Substantive output**: 5 prose fields, ~7000 chars total, every field concrete + Chiway-specific. The sub-agent didn't produce default-LLM filler.
- **Real Chiway substrate named**: all 7 SLOs by name + the Confident-only-descriptor gap as a real concrete observation + WASC standards by code (A1, A4, B1, B2, B3, C1) + mission areas + 6 of 7 AFIs + 5 stakeholder groups + bilingual/Chinese-medium/English-medium specificity.
- **Current→desired path mapped explicitly**: each field contributes to a coherent trajectory (current = published-but-not-operational; desired = working language across 4 audiences by end of 2025-2026 cycle).
- **Operational policy honored**: 7 of 8 AFIs mapped per their purviews; multiple divisions named (bilingual program, subject departments, homeroom system, co-curricular program); stakeholder groups distributed across Admin/Leadership + Staff/Faculty + Students + Parents + Parent Committee.
- **WASC-evidence orientation**: rationale field cites each standard + what it requires + how SLO work satisfies it (audit-ready evidence prose).
- **Zero hedging**: no "consider X" / "may need" / "TBD" / half-fills / mandates-style caveats. Every claim asserted concretely.
- **Validation passed**: production `parse_narrative` accepted the response without modification (schema_validation = "passed").
- **Apply merge worked**: 5 fields landed in `draft.plan` correctly; other draft sections untouched.

## Surfaced observations for next iterations

1. **Django template autoescape leaks HTML entities into `draft_state` rendering.** The prompt as rendered shows `&#x27;` (HTML-entity-encoded single quote) where Python dict-repr renders `'`. The sub-agent handled it correctly here because the draft was sparse — just meta + empty alignment + empty responsibilities. But for later steps where `draft_state` carries dense prose (e.g. step 02-propose-domain-alignment's grounding consumes the narrative this experiment just landed), the HTML-entity-encoded draft state will confuse the LLM. **Action**: render the `draft_state` section via Django's `|safe` filter, or serialize as a JSON code block, or pre-format as YAML — pick whichever production also does. The production prompt-template-rendering path may have the same issue; worth surfacing into the prompt corpus when Step 6 lands.

2. **`AXES INFO` log line leaks into stdout** of `render.py` (visible at the top of the rendered prompt file). Cosmetic but means the sub-agent gets a non-prompt line at the top of its directive. The sub-agent handled it without issue here. **Action**: configure Django's logging to stderr in `_workshop.py::setup_django` so render.py's stdout is prompt-only.

3. **Sub-agent latency ~43s** for one prompt (opus). A whole-plan-sequence run of 14 will take ~10 minutes round-trip end-to-end. Worth knowing for Step 5 sequence runs.

4. **The shared preamble's corrections translated into actual LLM behavior** — the load-bearing positive signal. Audit-gap #8 (general success criteria) + #9 (zero hedging) + #10 (operational policy) + #11 (current→desired meta-framing) all visible in the output's character. The preamble is doing its job.

## Signal for next iteration

A1 needs no per-snippet tuning at this iteration; the production prompt body + the shared preamble produce a substantive A1 output for this seed against this tenant. Move to Step 4 per-spec iteration on the next snippet in the strongest-prompts-first list: **02-propose-domain-alignment** (A3 post-0016) — same baseline-confirms-rendering posture, but A3 is structurally more complex (six relations, each with rationale).

## Surfaced gaps to track (not blocking)

- **Workshop**: HTML-entity-escape on `draft_state` rendering (observation #1) — file as a workshop-side fix; revisit if it causes a sub-agent issue in a later experiment.
- **Workshop**: AXES log line in render.py stdout (observation #2) — file as a workshop-side cosmetic.
- **Production prompt corpus**: if production renders `draft_state` the same way, the corpus-side fix lands in the eventual `ai/0018+` migration (Step 6).
