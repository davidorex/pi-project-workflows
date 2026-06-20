# Audit — TASK-022 proposed resolution (read-cap measurement basis per surface)

**Date:** 2026-06-20
**Scope:** TASK-022 (`.context` substrate) + upstream FGAP-016. Code-simplifier / design-audit lens on the PROPOSED resolution only. Read-only; nothing mutated.
**Verdict: HAS-PROBLEMS** — the design is directionally right but rests on one WRONG factual assumption and one OVERLY-COMPLEX framing; both are correctable without enlarging scope.

---

## What the task proposes (verbatim fields)

- **description:** "for `--json` measure the EMITTED compact form (so the cap reflects what actually ships), for text/Pi-tool keep measuring the pretty form (what the agent reads); surface the firing dimension (bytes vs lines) in the REFUSAL message."
- **acceptance_criteria:** (1) compact-fits-but-pretty-exceeds value no longer over-refused under `--json`; (2) refusal message states bytes vs 2000-line dimension; (3) cap still fails closed; (4) pipeline green.
- **files:** `truncate.ts`, `pi-context-cli/src/cli.ts`, `read-element.ts`.

FGAP-016's `proposed_resolution` is the same, plus the secondary "byte-vs-line message" point.

---

## Code as it actually is (citations)

**The measurement basis (single shared helper):**
`packages/pi-context/src/ops-registry.ts:151-155` — `overReadCap(s)` runs `truncateHead(s)` on a string the caller already serialized.

**`{json}` path — what is measured vs what ships:**
- `boundedJsonOutput` (`ops-registry.ts:198-207`): measures `JSON.stringify(r.json, null, 2)` — the **pretty** (2-space) form — then, under cap, returns `r.json` (the raw value).
- The CLI `--json` envelope (`cli.ts:1135-1136`): `const output = boundedJsonOutput(r); process.stdout.write(JSON.stringify({ ok: true, op: op.name, output }))` — emits the **compact** form (no indent).

So for a `{json}` op the basis is pretty-serialized bytes/lines while the emitted bytes are compact. **The mismatch FGAP-016 describes is real and lives at `ops-registry.ts:204` (the `null, 2` argument), not in `cli.ts` or `truncate.ts`.** That is the surgical fix site.

**`{read}` path — what is measured vs what ships:**
- `structureForRead` (`read-element.ts:287-288`): `const jsonStr = JSON.stringify(serialized, null, 2); const cap = truncateHead(jsonStr)` — measures **pretty**.
- `boundedJsonOutput` for a `{read}` result returns `r.read` UNCHANGED (`ops-registry.ts:203`); the CLI then emits `r.read.data` inside the **compact** envelope (`cli.ts:1136`).

So the `{read}` `--json` surface ALSO measures pretty and ships compact — the SAME mismatch as `{json}`. The `truncated`/`totalBytes`/`complete` flags a `--json` consumer reads (`read-element.ts:309-318`) are computed off the pretty bytes.

---

## Findings

### Finding 1 — WRONG assumption: the per-surface split is mis-located; `{read}` is not exempt (the real defect is one shared helper, not "the cli")

The task frames the fix as "for `--json` measure compact, for text/Pi-tool keep pretty," and lists `cli.ts` as a fix site. But:

- There is **no per-surface measurement seam** at `cli.ts`. `cli.ts` does not measure; it serializes the already-bounded value (`cli.ts:1136`). The pretty-vs-compact decision is made entirely inside `boundedJsonOutput` (`ops-registry.ts:204`) and `structureForRead` (`read-element.ts:287`). Editing `cli.ts` is not where the cap basis lives.
- The task's description says "keep measuring the pretty form" for text/Pi-tool **as if `--json` were the only compact surface**, but the pretty/compact split is per-RESULT-KIND inside shared helpers, not per-surface. `renderOpResultText` (the text surface, `ops-registry.ts:177-186`) and `boundedJsonOutput` (the json surface) BOTH call the same `overReadCap` on a pretty string. There is no place today where "the agent reads pretty" — the in-pi Pi-tool result and the CLI text surface emit `renderReadText`/`JSON.stringify(...,null,2)` (pretty), while BOTH `--json` surfaces (`{json}` and `{read}`) emit compact. So the correct partition is **by emitted form (text→pretty, json→compact)**, and it must cover the `{read}` `--json` path too — which the task's files list touches (`read-element.ts` is listed) but whose acceptance criteria never mention.

Net: criterion 1 ("compact-fits-but-pretty-exceeds no longer over-refused under `--json`") as written silently scopes to `{json}` ops and leaves the identical `{read}` `--json` over-refusal unaddressed — a half-fix of the very class FGAP-016 named ("cross-channel," "both output channels"). This is the `gap-explore-surfaces-class` failure mode: the symptom (`{json}`) gets fixed; the class (every compact-emitting surface) does not.

### Finding 2 — OVERLY COMPLEX: "measure compact for --json, pretty for text" doubles the cap basis and the metadata become surface-dependent

Carrying two measurement bases means a `{read}` result's `totalBytes`/`truncated`/`complete` (computed once in `structureForRead`, `read-element.ts:309-318`, and surfaced to BOTH the text footer and the `--json` consumer) would have to diverge by surface: the same read is "over cap / complete:false" on text but "under cap / complete:true" on `--json`. `structureForRead` computes these ONCE, ahead of any surface choice (it has no surface parameter and shouldn't grow one — it is the pure no-I/O primitive, `read-element.ts:1-7`). Threading a surface flag down into it to re-measure is scope-creep into the pure layer the task's own files list wants to keep clean.

A simpler basis that still satisfies criterion 1 and never grows a per-surface branch: **measure ONE canonical form, and make it the compact form everywhere** (compact is always ≤ pretty in bytes, and the line dimension on a single compact line is ≤ the pretty line count). The cap exists to bound what a consumer must ingest; the largest thing actually emitted on any surface is the pretty text on the text/Pi surface, but the over-refusal FGAP-016 complains about is specifically the `--json` consumer being denied a payload that *ships* small. The minimal, single-basis correction is: in `boundedJsonOutput` and in the `{read}` data-bounding decision, measure the **compact** serialization (`JSON.stringify(value)` — drop the `, 2`), since that is what the `--json` envelope ships; leave `renderOpResultText`/`renderReadText` (text surfaces) measuring pretty since pretty is what they ship. That is still "per emitted form," but it requires NO surface flag in `structureForRead`: the `{read}` `data`-to-null decision (`read-element.ts:309-313`) and the `{json}` decision (`ops-registry.ts:204-206`) are the two compact-emitting sites, and each already sits at the boundary that knows its own output form. The 2000-line dimension is then a near-non-issue under `--json` (compact is effectively one line), which is the right outcome — the line cap is a human-readability guard, irrelevant to a machine `--json` consumer.

### Finding 3 — SOUND but under-specified: the bytes-vs-lines refusal message

Criterion 2 (state which dimension fired) is correct and low-risk. `truncateHead` already returns `truncatedBy: "lines" | "bytes" | null` (`truncate.ts:22,76-89`) — the firing dimension is ALREADY computed and currently discarded by `overReadCap` (`ops-registry.ts:152-155` throws away everything but `.truncated`). So the message fix is purely plumbing `truncatedBy` through `overReadCap` → `overCapRefusalText` (`ops-registry.ts:163-168`) and the `renderReadText` REFUSAL/PARTIAL strings (`read-element.ts:359,366`). No new measurement, no new computation. This part of the resolution is sound and the task should keep it — only note the existing `truncatedBy` field as the source so the implementer does not re-derive it.

---

## Proposed corrected fields (ready to replace)

**description (replace):**
> Read-cap measurement basis = the EMITTED form per surface, fixing FGAP-016. The over-refusal lives in the two compact-emitting boundaries, both of which currently measure the PRETTY (`JSON.stringify(x, null, 2)`) form while the `--json` envelope ships the COMPACT form: (a) `boundedJsonOutput` for `{json}` results (`ops-registry.ts:204`) and (b) `structureForRead`'s over-cap `data`-to-null decision for `{read}` results (`read-element.ts:287-313`). Change BOTH to measure the compact serialization (`JSON.stringify(value)`, no indent) so the cap reflects what `--json` actually emits; the text/Pi-tool surfaces (`renderOpResultText` / `renderReadText`) keep measuring the pretty form they emit — no surface flag is threaded into the pure `structureForRead` primitive. Separately, surface the firing dimension in the refusal: `truncateHead` already returns `truncatedBy: "lines"|"bytes"` (`truncate.ts:22`); plumb it through `overReadCap` (`ops-registry.ts:152`, currently discards it) into `overCapRefusalText` and the `renderReadText` REFUSAL/PARTIAL messages.

**acceptance_criteria (replace):**
1. A `{json}` value whose COMPACT `--json` payload fits under the cap but whose pretty form exceeds it is no longer over-refused under `--json`.
2. A `{read}` value with the same compact-fits/pretty-exceeds property is ALSO no longer over-refused under `--json` (the cross-channel class, not just `{json}`).
3. The text / in-pi Pi-tool surfaces are unchanged — they still measure and emit the pretty form they ship (no regression in the human-read channel).
4. The refusal/partial message names whether the byte dimension or the 2000-line dimension fired (sourced from `truncateHead`'s existing `truncatedBy`).
5. The cap still fails closed: no over-cap payload (compact OR pretty) is ever emitted past the cap on any surface.
6. `structureForRead` gains no surface parameter (the pure primitive stays surface-agnostic).
7. Canonical pipeline green (build/check/test + runtime demo of a borderline value across `--json` and text + adversarial probe).

**files (add):** keep `truncate.ts`, `cli.ts` (message wording only / no measurement), `read-element.ts`; ADD `packages/pi-context/src/ops-registry.ts` — the actual `{json}` fix + the shared `overReadCap`/`overCapRefusalText` live there and it is currently absent from the list (the single biggest gap in the task as filed).

**notes (append):** "Class scope is per-EMITTED-FORM (compact `--json` vs pretty text), NOT per-op-kind — the `{read}` `--json` path shares the `{json}` defect; fixing only `{json}` leaves the class open. The fix site is `ops-registry.ts` + `read-element.ts`, NOT `cli.ts` (which only serializes the already-bounded value)."
