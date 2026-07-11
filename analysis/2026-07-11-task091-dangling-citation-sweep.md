# TASK-091 acceptance criterion 2 — dangling-citation sweep (independent re-run)

## Scope

Read every schema file in both:
- `packages/pi-context/samples/schemas/*.json` (catalog, 18 files)
- `.context/schemas/*.json` (active substrate, 18 files — content byte-identical to catalog per `ls -la` sizes matching pairwise)

Plus `packages/pi-context/samples/conception.json` (catalog manifest).

## Method

1. Enumerated the full current conventions block by reading `.context/conventions.json` directly (read-only investigation, per the task's explicit dispensation to read `.context/conventions.json` directly rather than one-by-one via `read-block-item`). Extracted all 19 convention ids:
   `cli-command-form`, `feature-branch-workflow`, `feature-decomposition`, `rhetorical-register`, `correctness-over-cost`, `docs-surface-sync`, `gap-arc-coherence`, `derive-decisions-from-facts`, `gap-explore-surfaces-class`, `de-ephemeralize-at-source`, `filing-provenance`, `subagent-dispatch-fit`, `milestone-validity-gate`, `error-invariant-transition-atom`, `working-substrate-is-the-aim`, `actionable-state-renders-name-remedy`, `op-command-surface-parity`, `pi-mono-is-exemplar`, `substrate-derived-state`.
2. Grepped all 18+18 schema files and `conception.json` for citation-shaped patterns: `canon (`, `governed by`, `convention`, `per the ... rule`, `per <hyphenated-slug>`.
3. Grepped the same files for every one of the 19 convention ids verbatim, to catch citations not wrapped in the `canon (...)` phrasing.
4. Grepped for the general shape `(<hyphenated-slug>)` — any parenthetical multi-hyphen token — to catch citation phrasings not anticipated by steps 2–3.
5. Cross-checked every hit against the conventions list from step 1.

## Findings

**Citation 1** — `milestone.schema.json` (both `packages/pi-context/samples/schemas/milestone.schema.json:42` and `.context/schemas/milestone.schema.json:42`, identical text):
> "A milestone carries no work of its own; authored status is rejected by canon (substrate-derived-state)."

Resolves. `substrate-derived-state` exists in `.context/conventions.json` (id `substrate-derived-state`, oid `1429fb8a868665c61b574e8500aaf864`). This is the originally-fixed citation — confirmed still resolving, not re-broken.

**Citation 2** — `packages/pi-context/samples/conception.json:824` (invariant `derive-decisions-from-facts`'s violation message):
> "Decision '{id}' shows no derivation basis — add a decision_derived_from_item edge to the fact its resolution derives from, or a decision_escalates_underdetermined edge to the framework-gap capturing a genuinely-underdetermined escalated choice (derive-decisions-from-facts)"

Resolves. `derive-decisions-from-facts` exists in `.context/conventions.json` (id `derive-decisions-from-facts`, oid `45b494a39bd09cddaebff5816be095f9`).

## Non-citations (checked, excluded)

- `conventions.schema.json` description/register_notes mentions of "conventions" — describes the conventions block generically (its own schema doc), not a citation of a specific named convention.
- `milestone.schema.json:31`: "mirroring the STORY-/TASK-NNN convention" — refers to an ID-naming pattern, not a substrate convention item; no such convention id exists or is implied to exist as a filed item.
- `framework-gaps.schema.json` register_notes: "DERIVABLE from a cited fact / convention / decision" — generic instruction, not a citation of a specific convention by name.
- `conception.json` relation-type entries (`item_governed_by_convention`, `item_acknowledges_missing_convention`, "governed by decision", "governed by convention" display names) — these are relation-type/edge-type definitions (structural vocabulary), not citations of a specific convention by name.

No other parenthetical slug-shaped citation, `canon (...)` phrasing, or convention-id-verbatim occurrence exists anywhere else across the 36 schema files + `conception.json`.

## Verdict

**Sweep clean — zero dangling citations beyond the one already fixed.** Both convention citations found in shipped schema/catalog text (`substrate-derived-state` in `milestone.schema.json`, `derive-decisions-from-facts` in `conception.json`) resolve against the current conventions block. No additional dangling citations exist.
