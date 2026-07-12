# Read-cap over-size refusal — experience-gap investigation

Date: 2026-07-12
Investigator scope: read/trace + live reproduction against the active substrate (`.context`). No substrate item filed, no code modified.
Friction under investigation: pi-context read ops refuse outputs over a 50KB cap; for some surfaces (validator results, filtered block reads) the operator hits a wall with no working narrowing path.

## 1. Root cause

### The cap constant and the primitive

`packages/pi-context/src/truncate.ts:13`

```
export const DEFAULT_MAX_BYTES = 50 * 1024; // 50KB
```

`truncateHead(content, opts)` (truncate.ts:38-106) measures `Buffer.byteLength(content, "utf-8")` of the **pretty** (`JSON.stringify(x, null, 2)`) form plus a 2000-line dimension (`DEFAULT_MAX_LINES`). It sets `truncated:true` when either dimension is exceeded. This is the single byte/line gate every read surface consults.

### Two enforcement layers

**Layer A — the `{read}` channel (item-returning reads), fail-closed at serialize time.** `structureForRead` (read-element.ts:280-336) serializes, calls `truncateHead`, and on over-cap bounds `data` to `null` (`data: cap.truncated ? null : serialized`, line 327) and sets `complete:false`. `renderReadText` (read-element.ts:347-402) renders the refusal text. Two shapes (read-element.ts:363-383):

```
if (overCapDirective !== undefined) {
  ...
  return (
    `⚠️ READ REFUSED — this ${label} is ${s.totalBytes} bytes, over the 50KB read cap. ` +
    `Nothing was returned (a partial read would mislead). ` +
    `Narrow your read: call \`${tool}\`${paramsString ? ` with ${paramsString}` : ""}.${hint ? ` ${hint}` : ""}`
  );
}
// No finer addressing → head-leading marked partial
return (
  `⚠️ PARTIAL READ — this ${label} is ${s.totalBytes} bytes, capped at 50KB, and has no finer addressing. ` +
  `The HEAD below is INCOMPLETE — do NOT treat it as the full value:\n\n${cappedContent}`
);
```

The `{read}` refusal names a narrowing tool **only when the op passed an `overCapDirective`** (e.g. filter-block-items passes `{tool:"read-block-page", hint:"or refine the predicate"}`, ops-registry.ts:2042).

**Layer B — the emission boundary for ALL channels (`string` / `{json}` / `{read}`).** ops-registry.ts:166-225. `overReadCap(s)` (166-170) re-applies `truncateHead`. `overCapRefusalText(totalBytes)` (178-183):

```
`⚠️ OUTPUT REFUSED — this result is ${totalBytes} bytes, over the 50KB read cap. ` +
`Nothing was returned (a partial read would mislead). Narrow your read.`
```

`renderOpResultText` (194-203) and `boundedJsonOutput` (216-225) enforce the cap at output time: prose `string` and `{json}` over-cap → the `OUTPUT REFUSED` prose (text) / `{data:null,truncated:true,totalBytes,complete:false}` (`--json`), **naming no tool** (no `overCapDirective` exists at this boundary). `{read}` is passed through untouched (already fail-closed at Layer A).

### Which layer / which surfaces

The cap lives at the **op-registry layer**, not the CLI reflection only:

- in-pi Pi-tool surface: `registerAll` wraps every op's `run` in `renderOpResultText` (ops-registry.ts:2863).
- CLI: `cli.ts:1137` calls `boundedJsonOutput(r)` for `--json`; `cli.ts:1147/1159/1161` call `renderOpResultText(r)` for text.

Both surfaces route through the same two helpers. A pi-tool caller and a CLI caller both hit the cap identically.

### Which ops offer escapes, and whether the refusal points to them

- Item-returning reads route through `{read}` and (most) carry an `overCapDirective`: filter-block-items → read-block-page / refine-predicate (2042); resolve-item-by-id → read-block-item (2069); list-blocks / read-config / read-schema / read-samples-catalog similarly. `read-block-page` itself paginates (`offset`/`limit`, 2101-2113). So the item-read family's refusal **does** point to a narrowing op.
- `{json}` aggregate ops (context-validate 1231-1234, context-validate-relations 2238-2241, validate-roadmap 2433) return a monolithic result and take `Type.Object({})` — **no** narrowing parameter. Their over-cap refusal is Layer B's `OUTPUT REFUSED … Narrow your read.` — naming no tool because none applies.

## 2. Shape — avoidable vs unavoidable refusal

**Filtered block read (item-read family) — partial escape, semantics-lossy.**
`filter-block-items` has no `offset`/`limit` (parameters: block/field/op/value only, ops-registry.ts:2007-2029). When the matched set exceeds 50KB it refuses whole. Its `overCapDirective` names `read-block-page`, but **read-block-page pages the whole block and drops the predicate** — the operator gets unfiltered pages and must re-apply the filter by hand. The `refine-the-predicate` hint only helps when a narrower predicate exists; it fails when the semantic set the operator wants is intrinsically over-cap (all closed framework-gaps = 170,336 bytes, below). There is **no filtered-AND-paginated op**. This is the case FGAP-117 tracks (field projection would shrink the payload under the cap).

**Validator / diagnostic aggregate read (`{json}` family) — unavoidable, no escape at all.**
`context-validate` returns `{json: validateContext(cwd)}` — a `SubstrateValidationResult` whose `issues[]` scales with substrate size (one issue per un-derived decision, per completed-task-against-open-gap, per nested id-bearing array, etc.). No severity / block / code / offset / limit axis exists. When `issues[]` crosses 50KB, Layer B refuses the whole result and there is **no op-driven path to any part of it**. Confirmed: `context-validate` result over 50KB **cannot be obtained through any existing op** — no projection, no pagination, no per-severity read.

## 3. Reproducible conditions (live, 2026-07-12, active substrate `.context`)

**Filtered framework-gaps read — REPRODUCES today.**

```
pi-context filter-block-items --block framework-gaps --field status --op neq --value __none__ --json
→ {"ok":true,"op":"filter-block-items","output":{"data":null,"total":142,"hasMore":true,"truncated":true,"totalBytes":149125,"complete":false}}

pi-context filter-block-items --block framework-gaps --field status --op neq --value __none__
→ ⚠️ READ REFUSED — this framework-gaps filtered is 149125 bytes, over the 50KB read cap. Nothing was returned (a partial read would mislead). Narrow your read: call `read-block-page`. or refine the predicate
```

The narrower predicate does not escape — the whole closed set is itself over-cap:

```
pi-context filter-block-items --block framework-gaps --field status --op eq --value closed --json
→ {"ok":true,...,"output":{"data":null,"total":84,"hasMore":true,"truncated":true,"totalBytes":170336,"complete":false}}
```

Pagination works but discards the predicate (pages the whole block):

```
pi-context read-block-page --block framework-gaps --limit 15 --json
→ 44.9KB, under cap, returns items 1-15 of ALL 142 gaps (unfiltered)
```

This matches the audit's observed `READ REFUSED — … 69268 bytes` (same op, smaller filtered set at that time).

**context-validate size refusal — NOT reproducing today (stated honestly).**

```
pi-context context-validate --json
→ full result returned, NO refusal. status "warnings", ~42 issues (17 decision-derivation + 3 task-gap + 22 task-feature + 2 nested-array). Under the 50KB cap (single-line JSON, order ~12KB; printed in full with no OUTPUT REFUSED).
```

`context-validate-relations --json` → `{"status":"clean","issues":[]}` (tiny). `context-status --json` is a bounded counts summary by design (not in the class). So the validator-refusal leg is **structural, not currently triggering** — it fires once the issue list grows past 50KB. The item-read leg triggers now.

## 4. Prior-art search

Read fresh via `read-block-item` and a title `matches` sweep across `framework-gaps` (9 matched: FGAP-016, 033, 068, 079, 108, 115, 117, 123, 126).

- **FGAP-117** (identified, P2, "Read surface has no field projection …") — **COVERS the filtered-read leg.** Its description reproduces the exact over-cap envelope (`data:null`, total preserved, `complete:false`), states the `overCapDirective` names read-block-page / refine-predicate as "row-narrowing … neither reaches the match set's ids", enumerates the whole item-returning read family (filter-block-items, read-block-page, resolve-items-by-id, join-blocks, context-lens-view), and proposes a `projectFields` primitive (`fields: string[]`) so the cap shrinks rather than refuses. The filtered-framework-gaps refusal is squarely inside FGAP-117.
- **FGAP-016** (identified, P3, "Read cap measures the pretty/line-counted form while --json emits compact …") — **adjacent, distinct.** Concerns the cap's measurement basis (pretty-form over-refusal + bytes-vs-lines message imprecision), not the absence of a narrowing axis.
- **FGAP-123** (identified, P2, authoring-time shape projections) — **distinct** (schema-shape discovery on the write path; touches the cap only to note read-schema reads stay under it).
- FGAP-033 / 068 / 079 / 108 / 115 / 126 — matched on substring (`refus`, `projection`, `read surface`); unrelated (identity resync, mergetool spawn, catalog schema access, switch flag, refusal-cause classification, auth-gate).

**Verdict:** the validator/diagnostic aggregate over-cap leg (context-validate and siblings) is **covered by no existing item.** FGAP-117 covers only the item-returning read family and its field-projection axis; a `SubstrateValidationResult` is not a block-item list, so `projectFields` does not reach it.

## 5. Class surfacing

This is an instance of a general class: **op outputs fail closed at the 50KB cap, but only some op families carry a semantics-preserving narrowing axis.** The class has two disjoint members:

- **item-returning reads** — narrowing axis = pagination (read-block-page) + field projection (FGAP-117's proposed `projectFields`). Tracked.
- **diagnostic / validator aggregate `{json}` ops** (context-validate, context-validate-relations, validate-roadmap) — issues list scales with substrate size, **no** severity/block/code/offset/limit axis, Layer-B refusal names no mechanism. Untracked.

The specific friction (context-validate refused for size) is the triggering instance of the diagnostic-aggregate member. Recommend filing at the **class level** (all validator/diagnostic aggregate ops, not context-validate alone), as a **sibling of FGAP-117** under the shared output-size-adaptation parent, with FGAP-016 noted as the measurement-precision adjacency.

## Proposed FGAP (for the orchestrator to file, register-compliant)

**Title:** Diagnostic/validator `{json}` aggregate ops have no size-narrowing axis — over-cap output is refused whole with a directive naming no mechanism, so a large validation result is unreachable through the sanctioned surface

**Description:** The 50KB output cap (`DEFAULT_MAX_BYTES`, truncate.ts:13; `truncateHead` measures the pretty form) fires at the emission boundary for every op channel via `renderOpResultText` / `boundedJsonOutput` (ops-registry.ts:194-225), including the `{json}` channel carrying the validators. Item-returning reads route through `{read}` and carry an `overCapDirective` naming a narrowing tool (filter-block-items → read-block-page / refine-predicate, ops-registry.ts:2042); the `{json}` boundary refusal (`overCapRefusalText`, ops-registry.ts:178-183) names no tool — "Narrow your read." — because the aggregate ops expose no narrowing parameter. context-validate (ops-registry.ts:1231-1234), context-validate-relations (2238-2241), and validate-roadmap (2433) return a monolithic `SubstrateValidationResult` whose `issues[]` scales with substrate size (one issue per un-derived decision, per completed-task-against-open-gap, per nested id-bearing array) with `parameters: Type.Object({})` — no severity/block/code/offset/limit axis. When `issues[]` crosses 50KB the whole result is refused and no op-driven path reaches any part of it, unlike the item-read family (pagination; FGAP-117's field projection). The cap is enforced at the op-registry layer for BOTH the in-pi tool surface (registerAll → renderOpResultText, ops-registry.ts:2863) and the CLI (boundedJsonOutput / renderOpResultText, pi-context-cli/src/cli.ts:1137,1147), so the wall is identical on both. Distinct from FGAP-117 (item-read field projection — a `SubstrateValidationResult` is not a block-item list) and FGAP-016 (cap measurement basis, not narrowing-axis absence).

**Evidence:**
- `packages/pi-context/src/truncate.ts` line 13 — `DEFAULT_MAX_BYTES = 50 * 1024`; `truncateHead` measures pretty-serialized bytes + `DEFAULT_MAX_LINES`
- `packages/pi-context/src/ops-registry.ts` lines 178-225 — `overCapRefusalText` ("Narrow your read", no tool) + `renderOpResultText` / `boundedJsonOutput` apply the cap to the `{json}` and prose channels at the emission boundary
- `packages/pi-context/src/ops-registry.ts` lines 1231-1234 / 2238-2241 / 2433 — context-validate, context-validate-relations, validate-roadmap return a monolithic `{json}` result with `parameters: Type.Object({})` (no narrowing axis)
- `packages/pi-context/src/ops-registry.ts` line 2863 (`registerAll` → `renderOpResultText`) + `packages/pi-context-cli/src/cli.ts` lines 1137, 1147 (`boundedJsonOutput` / `renderOpResultText`) — cap enforced at the op-registry layer for both the in-pi tool surface and the CLI, not CLI reflection only
- `packages/pi-context/src/read-element.ts` lines 363-383 — the `{read}` channel's over-cap path carries an `overCapDirective` naming a narrowing tool; the `{json}` boundary has no equivalent
- Live repro 2026-07-12 (`.context`): filter-block-items framework-gaps status neq __none__ → `data:null,total:142,truncated:true,totalBytes:149125` / text `READ REFUSED … 149125 bytes … call read-block-page. or refine the predicate`; status eq closed → `totalBytes:170336`; context-validate → full ~42-issue result returned, no refusal (issues list under the cap today — the validator leg is structural, not currently triggering)

**Impact:** A substrate whose validate issue list crosses 50KB has no op-driven path to read the validation result — the operator cannot see which cross-block references are broken or which derivation/closure invariants are violated, and the refusal ("Narrow your read") names no mechanism because none exists on the op. context-validate / context-validate-relations are the sanctioned integrity gates; over-cap they fail closed with no fallback. Currently non-triggering (issue list under cap); the wall arrives with substrate growth.

**Proposed_resolution:** Give the validator/diagnostic aggregate ops a narrowing axis paralleling the item-read family — an optional severity / block / code filter and/or offset+limit pagination on context-validate / context-validate-relations / validate-roadmap so `issues[]` reads in bounded slices — and make the `{json}` over-cap boundary refusal name the concrete narrowing parameter (mirroring the `{read}` channel's `overCapDirective`) instead of the mechanism-less "Narrow your read." Coordinate with FGAP-117 (field projection for item reads) as the sibling member of the same output-size-adaptation class covering the disjoint diagnostic-aggregate surface. Relate to FGAP-117 (sibling, shared parent class); note FGAP-016 adjacency (cap measurement precision).

**Suggested priority:** P2 — structural, currently latent (issue list under cap today), on the integrity-gate path that grows with the substrate.
