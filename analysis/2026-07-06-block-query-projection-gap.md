# Block-query field-projection gap — investigation (2026-07-06)

Experience gap, observed live twice while driving `pi-context filter-block-items`: matched items return as FULL bodies with no field projection, so realistic queries either blow the 50KB read cap (fail-closed `data: null` — a match count with no ids) or drown the caller in whole-item payloads when only ids were wanted. Investigation scope: root cause / shape, empirical reproduction, class characterization across the read surface, prior-art search, resolution shape. No fix applied; no substrate item filed (drafts at end for user decision).

## 1. Root cause / shape

**The op returns whole items.** `filter-block-items` (`packages/pi-context/src/ops-registry.ts:1906-1941`) declares exactly four parameters — `block`, `field`, `op`, `value` (`ops-registry.ts:1912-1924`). No `fields`/projection parameter exists on the op surface; the CLI reflects the parameter schema, so `--fields` is `unknown flag` (observed, §2c). The op wraps `filterBlockItems` (`packages/pi-context/src/context-sdk.ts:1097-1122`), which is `items.filter(predicate)` over the block's array — it selects **rows**, returns each matched item **unprojected**.

**Where the cap fail-closes.** The op's `run()` routes the matched array through `structureForRead` (`ops-registry.ts:1930-1939`) with `overCapDirective: { tool: "read-block-page", hint: "or refine the predicate" }`. In `structureForRead` (`packages/pi-context/src/read-element.ts:266-322`):

- the array is paged at `DEFAULT_LIMIT = 50` (`read-element.ts:173`, `pageArray` at 188-193);
- the page is serialized pretty (`JSON.stringify(serialized, null, 2)`, line 287) and measured by `truncateHead` (line 288);
- on over-cap, the structured `data` is **bounded to null** (`data: cap.truncated ? null : serialized`, line 313) with `complete: false` — the FGAP-015/boundary-cap fail-closed discipline, correct in itself;
- metadata (`total`, `totalBytes`, `truncated`) survives — so the caller learns **how many** matched but not **which**.

The `{read}` channel's text rendering (`renderReadText`, `read-element.ts:348-362`) emits the `READ REFUSED … Narrow your read: call read-block-page … or refine the predicate` directive. Both named narrowings shrink **row count** (paging, rarer predicate); neither can shrink **row width**. There is no directive-reachable path that yields the ids of an over-cap match set. `read-block-page` itself returns whole items and — called with `whole: true` and **no** overCapDirective (`ops-registry.ts:2001-2006`) — degrades to the head-leading PARTIAL when a single page exceeds the cap; its floor (`--limit 1`) is bounded below by the largest single item's width.

**Confirmed: no projection parameter anywhere on the op surface.** `grep -n "fields" ops-registry.ts` matches only update-op text ("Update fields on an item…", lines 415/435/944/977) and two descriptive uses of the word "projection" for hardcoded shapes (read-samples-catalog, walk-op id-chains). No read op declares a caller-chosen field-selection parameter.

## 2. Empirical reproduction (live substrate, read-only, 2026-07-06)

### (a) Over-cap fail-closed: match count with no ids

```
$ pi-context filter-block-items --block framework-gaps --field description --op matches --value 'substrate' --json
{"ok":true,"op":"filter-block-items","output":{"data":null,"total":37,"hasMore":false,"truncated":true,"totalBytes":137380,"complete":false}}
```

37 matches, 137,380 bytes un-capped, `data: null`. The caller knows 37 gaps mention "substrate" and cannot learn one id.

### (b) Under-cap but drowned: full bodies when only ids were wanted

```
$ pi-context filter-block-items --block conventions --field id --op matches --value '.' --json
→ {... "total":14, "hasMore":false, "truncated":false, "totalBytes":22541, "complete":true}
```

Listing the 14 convention rule ids costs 22,541 bytes of full rule bodies (each rule's multi-paragraph `description` included). The wanted payload — 14 id strings — is on the order of 400 bytes. (The earlier live observation of this instance was 13 rules / 20,720 bytes; the block has since grown by one rule.)

### (c) No projection flag exists

```
$ pi-context filter-block-items --block conventions --field id --op matches --value '.' --fields '["id","severity"]' --json
error: unknown flag: --fields          (exit 2)
SYNOPSIS
  pi-context filter-block-items --block <string> --field <string> --op <eq|neq|in|matches> --value <json>
```

The reflected synopsis confirms the complete parameter surface: `block` / `field` / `op` / `value` only.

## 3. Class characterization (gap-explore-surfaces-class)

Survey of the item-level read/query family, from each op definition in `ops-registry.ts`:

| Op | Returns | Narrowing affordance | Field projection |
|---|---|---|---|
| `filter-block-items` (1906) | full items, implicit page of 50 | predicate (rows), overCapDirective | none |
| `read-block` (1093) | whole block | overCapDirective → read-block-page | none |
| `read-block-page` (1989) | full items | offset/limit (rows) | none |
| `read-block-item` (1969) | one full item | single-id addressing | none (acceptable at 1-item granularity) |
| `resolve-item-by-id` (1943) / `resolve-items-by-id` (2074) | full ItemLocation incl. item body | id addressing | none |
| `join-blocks` (2010) | `[{left, right[]}]` full bodies both sides | `where*` pre-filter (rows) | none |
| `context-lens-view` (2155) | no `--bin`: bin→count summary; `--bin`: full items | counts summary; per-bin offset/limit (rows) | summary is a hardcoded count-projection; bin items unprojected |
| `read-block-dir` (1076) | whole parsed files | none (no overCapDirective → head-leading PARTIAL) | none |
| `gather-execution-context` (2255) | full resolved items per relation bucket | maxDepth | none |
| `context-walk-descendants` (2195) / `walk-ancestors` (2214) | `string[]` of ids | — | hardcoded id-only shape |
| `find-references` (2232) | `Edge[]` records | direction | edge records, not item bodies |

**Class verdict:** the gap is NOT specific to `filter-block-items`. Every op that returns item bodies returns them whole; every narrowing affordance that exists is row-selection (paging, predicate, bin, direction, depth) or a fixed hardcoded shape (bin→count summary, id-chain `string[]`, `Edge[]`). No op anywhere on the block query/read surface takes a caller-chosen field-projection parameter. The hardcoded narrow shapes (walk ops returning ids only; lens summary returning counts only) are evidence that projected forms are what callers routinely want — but they are baked shapes, not a parameter, and they cover only their own axes (relation chains, lens bins), not arbitrary predicates.

The correct altitude is exactly the one FGAP-117 already states: **"the read surface has no field projection"** — the cap (correct, keep) and the projection absence (the gap) jointly make honest bulk enumeration impossible or wasteful through the sanctioned surface. This investigation adds one failure shape FGAP-117 does not record: the **count-without-ids envelope** — an over-cap filter answers "how many match" while refusing "which", and its own narrowing directive (`read-block-page` / "refine the predicate") names only row-narrowing tools that cannot reach the ids either.

Side observation (not a filing): code comments in `read-element.ts`/`ops-registry.ts` cite "FGAP-089" for the fail-closed over-cap discipline, but the active substrate's FGAP-089 is the hook-scoping gap; the comments' referent is evidently a prior/other substrate's numbering. Noted for targeted review only.

## 4. Prior art

| Item | Status | Coverage | Verdict |
|---|---|---|---|
| **FGAP-117** "Read surface has no field projection — item-metadata enumeration requires full-item reads the 50KB cap refuses…" | identified, P2, pi-context-cli | THIS gap, at the class altitude, filed 2026-07-05 with its own observed refusals (filter on framework-gaps status-in refused at 127,873B; research status-eq at 135,562B; read-block-page of 8 research items truncated at 59,257B). Enumerates filter-block-items / read-block-page / resolve-items-by-id / context-lens-view --bin. `proposed_resolution` already sketches `--fields` projected before the cap, left open as "determination at task time". | **INFORM — do not refile.** Today's instances are additional triggering evidence; the count-without-ids shape, the under-cap-drowned shape, the unknown-flag confirmation, and the completed op survey (join-blocks, read-block, read-block-dir, gather-execution-context also whole-body) refine its description/evidence/resolution. Draft refinement in §6. |
| FGAP-016 "Read cap measures the pretty/line-counted form while --json emits compact" | identified, P3 | Cap **measurement basis**, not projection. FGAP-117 explicitly distinguishes itself from it. Interaction only: pretty-form measurement makes the projection absence bite sooner. | Adjacent — no action. |
| FGAP-015 "{json} channel bypasses the cap" | closed | Established the boundary cap this gap's fail-closed behavior comes from. | Closed context — no action. |
| FGAP-055 "No convention governs where the read/output safety cap invariant is enforced" | identified, P3 | Governance of cap **placement**, not payload shape. | Adjacent — no action. |
| FGAP-079 "Catalog schema not locally diffable — only a projection" | closed | Precedent that projection-shaped read surfaces exist (read-samples-catalog); opposite direction (needed the whole body, had only a projection). | Precedent only. |
| FGAP-073 "No op to project a config-declared lens as a binned item-view" | closed | Delivered context-lens-view's bin→count summary — the one existing count-projection affordance; its --bin item mode is itself in the whole-body class. | Closed context. |
| FGAP-027 "read-schema returns projected name-list, not full subtree" | closed | Inverse-direction read-shape defect (accidental projection where whole was wanted). | Closed context. |

Title searches for `truncat` and `filter` returned 0 items (`total:0`). Title `projection` → FGAP-079, FGAP-117. Title `cap` → FGAP-009, FGAP-015, FGAP-016, FGAP-055, FGAP-117. Description `projection` → FGAP-010, FGAP-027, FGAP-073, FGAP-079, FGAP-101, FGAP-117 (all triaged above; FGAP-009/010/101 unrelated to this class).

## 5. Class-correct resolution shape

One shared projection primitive + one optional parameter replicated across the item-returning query ops — mirroring how the codebase already shapes op parameters:

- **Primitive:** a `projectFields(items, fields)` helper beside `pageArray` in `read-element.ts` — the "ONE pagination implementation" pattern (`read-element.ts:182-193`) applied to projection: one implementation, no parallel per-op math. Projection applies to item bodies BEFORE `structureForRead` serializes, so `truncateHead` measures the projected payload — the cap stays honest by shrinking the payload rather than truncating it (FGAP-117's own framing).
- **Parameter:** `fields: Type.Optional(Type.Array(Type.String(), { description: … }))` — array-of-strings parameter precedent: `resolve-items-by-id`'s `ids` (`ops-registry.ts:2081-2083`). Replicating one narrowing parameter set across ops has precedent in `join-blocks`' `whereField`/`whereOp`/`whereValue` trio (`ops-registry.ts:2029-2033`), which reflects to CLI flags automatically.
- **Semantics:** `id` always retained in the projection (an id-less item row is useless downstream); a named field absent on an item is simply absent in the projected row (matching filter's items-missing-the-predicate-field-never-match tolerance); omitted `fields` = current whole-item behavior, fully backward-compatible/additive (ops-frozen-friendly, same additive shape as FGAP-073's closure).
- **Carriers, by class membership:** primary — `filter-block-items`, `read-block-page`, `context-lens-view` (`--bin` mode); secondary — `join-blocks` (left/right bodies), `resolve-items-by-id` (ItemLocation.item). `read-block`/`read-block-dir` serve whole-document reads and can stay out of scope; walk ops/find-references already emit narrow shapes.

## 6. Draft refinement to FGAP-117 (inform verdict — NOT a new filing; user decides)

Proposed `update-block-item` on FGAP-117 (`--block framework-gaps --match '{"id":"FGAP-117"}'`), description + evidence + proposed_resolution:

**description** (append after "…impossible through the sanctioned surface."):

> Over-cap filter queries additionally fail as count-without-ids: the fail-closed envelope preserves total/totalBytes but bounds data to null, so the surface answers how-many-match while refusing which (observed 2026-07-06: filter-block-items framework-gaps description-matches 'substrate' → data:null, total:37, totalBytes:137380, complete:false); the op's overCapDirective names read-block-page / refine-the-predicate — both row-narrowing, neither reaches the match set's ids, and read-block-page's own floor (--limit 1) is bounded by the widest single item. Under-cap queries wanting only ids pay whole-body cost (observed 2026-07-06: conventions match-all → 14 items, 22,541 bytes of full rule bodies for ~400 bytes of wanted ids; --fields rejected as unknown flag). Survey completes the class enumeration: join-blocks, read-block, read-block-dir, and gather-execution-context also return whole item bodies; the only narrow shapes on the surface — context-lens-view's bin→count summary, walk-ancestors/context-walk-descendants id-chains, find-references Edge[] — are hardcoded, not parameterized, and cover only their own axes.

**evidence** (add):

> {"file":"packages/pi-context/src/read-element.ts","reference":"structureForRead bounds data to null on over-cap (line 313) while total/totalBytes survive — the count-without-ids envelope; pageArray (182-193) is the one-implementation precedent a projectFields primitive would sit beside"}
> {"file":"packages/pi-context/src/ops-registry.ts","reference":"filter-block-items overCapDirective (1935-1938) names read-block-page + refine-the-predicate — row-narrowing only; join-blocks whereField/whereOp/whereValue trio (2029-2033) and resolve-items-by-id ids Type.Array(Type.String()) (2081-2083) are the replicated-parameter and array-parameter precedents for a fields parameter"}
> {"file":"analysis/2026-07-06-block-query-projection-gap.md","reference":"the 2026-07-06 investigation: both failure shapes reproduced with envelopes pasted, full read-surface survey table, prior-art triage"}

**proposed_resolution** (replace):

> A shared projectFields primitive beside pageArray in read-element.ts, applied to item bodies BEFORE structureForRead serializes (truncateHead measures the projected payload — the cap shrinks rather than truncates), surfaced as an optional fields: string[] parameter (Type.Optional(Type.Array(Type.String())), reflecting to --fields) on the item-returning query ops — primary: filter-block-items, read-block-page, context-lens-view --bin; secondary: join-blocks, resolve-items-by-id. id always retained; a named field absent on an item is absent in the projected row; omitted fields = whole-item (additive, backward-compatible). Parameter-shape precedents: resolve-items-by-id ids (array param), join-blocks where* trio (one narrowing set replicated across ops).

No new framework-gaps item is warranted: FGAP-117 tracks this gap at the correct class altitude, status identified, one day old.
