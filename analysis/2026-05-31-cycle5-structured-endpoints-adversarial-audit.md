# Cycle-5 / Phase-E (E1+E2) structured EdgeEndpoint — adversarial audit

Date: 2026-05-31
Auditor: fresh-context adversarial agent (did not implement)
Scope: structured `EdgeEndpoint` model + dual-form consumers/validators + porcelain (the arc's 67-consumer-site / corruption-risk cycle)
Method: READ-ONLY on source. git diff/log/blame; tsx runtime exercises against built `dist/`; project AJV; the new test file run in isolation; tsc/biome on the diff.

## Verdict summary

| Probe | Subject | Verdict |
|---|---|---|
| 1 | Load-bearing pivot (consumer identity = refname; oid inert) | CLEAN |
| 2 | No un-normalized endpoint read remains (completeness) | CLEAN |
| 3 | No-regression on string data (53/30 golden) | CLEAN |
| 4 | Lens-bin never treated as an item (corruption surface) | CLEAN |
| 5 | No F2 resolution pulled forward | CLEAN |
| 6 | Schema dual-form correctness (AJV) | CLEAN |
| 7 | identityKey/dedup asymmetry is the documented one only | CLEAN |
| 8 | Porcelain + producers + rename | CLEAN |
| 9 | buildIdIndexForDir divergence / Cycle-1 contradiction | CLEAN (premise false — see below) |
| 10 | Scope | CLEAN |

**Total FLAGs: 0.** The work is genuinely green. State: uncommitted working tree (10 files: 9 modified/new in scope + 1 new test). tsc `--noEmit` clean; biome clean on all 9 changed files; the new `structured-endpoints.test.ts` runs 17/17 pass in isolation.

## Per-probe evidence

### Probe 1 — load-bearing pivot — CLEAN
`context.ts:264-307` defines `normalizeEndpoint`/`endpointKey`/`endpointBin`/`endpointIdentity` as pure shape-normalization (no imports, no resolution). `endpointKey` returns the string for legacy, `refname ?? oid` for structured items, `bin` for lens_bin.
Runtime exercise: a graph mixing `"A" -> {kind:item,oid:oidB,refname:"B"}` and `{kind:item,oid:oidB2,refname:"B"} -> "C"` — `walkDescendants("A","r")` = `["B","C"]` and `walkAncestors("C","r")` = `["B","A"]`: the structured `B` (two different oids) and the would-be legacy string `B` land on the SAME node. `endpointKey({oid:x,refname:"B"}) === endpointKey({oid:y,refname:"B"}) === "B"` — oid is inert at the consumer layer.

### Probe 2 — completeness — CLEAN
Grepped every `.parent`/`.child` (and `e.parent`/`edge.parent`) read across `packages/pi-context/src`, `scripts/`, and the other three packages. Every EDGE-endpoint read routes through `endpointKey`/`endpointBin`/`endpointIdentity`/`renameEndpoint`/`resolveRelationSelector`. The only un-normalized hits are non-Edge: `migration-registry-loader.ts` JSON-pointer traversal cursors (`read.parent`/`write.parent`), `block-api.ts` nested-array parent records, context.ts JSDoc comments, `index.ts`/`append-relation.ts` string tool/CLI params (`params.parent`/`args.parent` — correct; the porcelain takes strings), and `runtime-demo` intentional structured-form inspection. No `[object Object]` stringification or RawEndpoint-as-map-key path remains. `lens-view.ts` and `execution-context.ts` read no endpoints directly — they delegate entirely to the normalized walkers.

The cycle-detection adjacency in `validateRelations` (`context.ts:1338-1347`) — not in the prompt's 67-site enumeration — was also correctly normalized (`endpointKey(e.parent)`/`endpointKey(e.child)`), so structured + legacy same-refname edges collapse to one graph node.

### Probe 3 — no-regression golden — CLEAN
`validateContext('.')` on the active `.context-jit-spec-v2` substrate reproduces EXACTLY: **53 errors / 30 does-not-resolve**, identical to the stated baseline. The 30 does-not-resolve are the `project:FGAP-*` sentinel children (e.g. `project:FGAP-153`), treated as unresolved exactly as today. All three substrates' real relations validate against the bundled v2.0.0 schema (`.project` 137 / `.context` 37 / `.context-jit-spec-v2` 135 edges — all valid). `walkDescendants`/`walkAncestors`/`groupByLens`/`validateRelations` over pure-string fixtures produce identical output (the string branch of `normalizeEndpoint` is `{kind:item,key:s,foreign:false}`, so `endpointKey(s) === s`).

Note: the plan's "342 edges + 30 project: sentinels" figure does NOT match any current substrate (total 309 edges; 0 literal `project:`-prefixed PARENTS — the sentinels are `project:`-prefixed CHILDREN). This is a stale figure in the plan text, not a defect in the implementation. The load-bearing golden (validateContext 53/30) holds exactly.

### Probe 4 — lens-bin never an item — CLEAN
`groupByLens` (`context.ts:1137-1152`) and `validateRelations` lens-parent (`context.ts:1259-1268`) test `endpointBin(e.parent) ?? endpointKey(e.parent)` against `lens.bins.includes` — a `{kind:lens_bin}` endpoint can never reach an `idIndex.get` item path. Runtime adversarial cases (corrected `validateRelations(config, relations, itemsByBlock)` signature):
- structured ITEM parent under a lens relation → `edge_parent_not_in_bins` (NOT resolved as item).
- `{kind:lens_bin,bin:"X"}` where `"X"` is a real item id → still bin-checked → `edge_parent_not_in_bins` (bin label vs `lens.bins`, never the item index).
- `{kind:lens_bin,bin:"done"}` (valid bin, colliding with item id `"done"`) → validates as bin, no `not_in_bins`.
- `groupByLens`: item with id `"done"` is NOT auto-binned by id↔bin collision.
The new test file's "lens-bin never reaches idIndex.get" suite corroborates.

### Probe 5 — no F2 pull-forward — CLEAN (strongest evidence in the suite)
Registry resolution calls (`resolveAlias` :1254, `resolveSubstrateDir` :1256, foreign `buildIdIndexForDir` :1260) appear ONLY inside `resolveRelationSelector` (porcelain, `context-sdk.ts:1247-1292`). `validateContext` (1365+) and `validateRelations` (`context.ts`) contain NO endpoint-resolution registry call. The one `loadRegistry(cwd)` inside `validateContext` (:1394) is the PRE-EXISTING Cycle-4 SoT-drift self-registration check (was at line 1264 in committed HEAD) — it reads `config.substrate_id` only, never touches edges. `context.ts` imports no registry resolver.
The new test does the real adversarial proof: it registers AND populates a foreign substrate (`.context-foreign`, id `sub-aaaa…`) with the exact refname `OTHER-1` the edge names, then asserts `validateContext` STILL emits `Edge parent 'OTHER-1' … does not resolve`. Confirmed PASS. Runtime: a foreign `{kind:item,substrate_id,oid,refname}` under a hierarchy relation → `edge_unresolved_parent`.

### Probe 6 — schema dual-form — CLEAN
Through the project AJV (`validateFromFile` against the real `relations.schema.json` v2.0.0 `$defs.endpoint` oneOf): legacy string PASS; `{kind:item,oid}` PASS; full item (`oid,refname,substrate_id,content_hash`) PASS; `{kind:lens_bin,bin}` PASS. REJECTED: item missing `oid`; both `oid`+`bin`; extra prop on item; `kind:item` with `bin`; lens_bin missing `bin`; unknown kind. `additionalProperties:false` on both object branches enforces it.

### Probe 7 — dedup asymmetry — CLEAN
`endpointIdentity`: string→string; item→`${substrate_id??""}:${oid}`; lens_bin→`bin:${bin}`. Runtime: two structured items same-oid-diff-refname dedup to ONE (`:o9 === :o9`); a legacy `"B"` and a structured-same-item `{oid:o1,refname:"B"}` produce TWO rows (`"B" !== ":o1"` — the documented asymmetry, no false-merge); foreign item → `S:oid` distinct. No other asymmetry: `identityKey` (`context.ts:525`) is the sole consumer and uses exactly `endpointIdentity(parent) + " " + endpointIdentity(child) + " " + rt`. The CLI dry-run dup detection (`append-relation.ts:170-173`) uses the same identity composition.

### Probe 8 — porcelain + producers + rename — CLEAN
`resolveRelationSelector` (runtime against the real substrate): bare `FGAP-001` → `{kind:item,refname:"FGAP-001"}` (oid falls back to refname when the item lacks an `oid`/isn't filed under that id — designed pre-Cycle-3 fallback); unfiled `NONEXIST-999` → oid=refname fallback; lens bin `planned` → `{kind:lens_bin,bin:"planned"}`; unregistered-alias `noalias:THING` → bare refname (NOT mis-read as foreign — alias branch only fires on a REGISTERED alias). The Pi tool (`index.ts:1018-1033`) and CLI (`append-relation.ts`) switched to the porcelain with string param surface unchanged; the live demo (`runtime-demo-structured-endpoints.ts`) PASSES end-to-end (porcelain writes a structured item edge + lens-bin edge; mixed substrate validates; endpointKey identity on legacy strings). CLI dry-run validates the RESOLVED structured edge (`append-relation.ts:151-160`).
rename (`rename-canonical-id.ts:123-141`): `renameEndpoint` rewrites a legacy string `=== oldId` and a SAME-substrate (`substrate_id===undefined`) item whose `refname===oldId` (new refname; oid untouched); leaves foreign items, lens_bins, and non-matches byte-identical. Verified by mirroring the exact logic: only the string + same-substrate item rename (n=2); oid/bin/foreign untouched.
Minor (non-issue): the Pi tool calls `appendRelationByRef(ctx.cwd, {...})` without a DispatchContext. This matches the PRE-Cycle-5 behavior — the original tool also called `appendRelation(ctx.cwd, edge)` without ctx, and relations.schema.json declares no author fields. No attestation regression.

### Probe 9 — buildIdIndexForDir / Cycle-1 contradiction — CLEAN; premise is FALSE
The audit prompt's premise ("Cycle-1 commit e84b326 summary claimed it added `buildIdIndexForDir`") is **incorrect**. The full e84b326 commit message enumerates the `*ForDir` block-api primitives it added — `readBlockForDir`, `writeBlockForDir`, `nextIdForDir`, `validateBlockWithMigrationForDir`, etc. — and never mentions `buildIdIndexForDir`. `git log -S "buildIdIndexForDir"` returns ZERO commits: it has never existed in any committed tree. e84b326 touched `block-api.ts`/`context-dir.ts`/`migration-registry-loader.ts`/`migrations-store.ts`/`schema-validator.ts` — NOT `context-sdk.ts` (where buildIdIndex lives). So the implementer's "did not pre-exist, added it" is TRUE, and there is no Cycle-1 audit miss — the contradiction was a mis-reading of the Cycle-1 summary in the audit brief.
The new `buildIdIndexForDir` (`context-sdk.ts:1107`) is a clean extraction: `buildIdIndex(cwd)` (:1088) now = `tryResolveContextDir(cwd)` (null-guard) → `buildIdIndexForDir(blockDir, loadConfig(cwd))`. The active-dir path is behaviorally unchanged — same first-writer-wins collision + prefix-vs-block invariant throw; the only substitution is `readBlock(cwd,name)` → `readBlockForDir(substrateDir,name)`, which the Cycle-1 commit already established as byte-identical on the active path. Empirical confirmation: `validateContext('.')` (which builds the active index) yields the identical 53/30 golden.

### Probe 10 — scope — CLEAN
Working tree: `.context-jit-spec-v2/migrations.json`, `packages/pi-context/schemas/relations.schema.json`, `context.ts`, `context-sdk.ts`, `index.ts`, `rename-canonical-id.ts`, `roadmap-plan.ts`, `scripts/orchestrator/append-relation.ts` + `find-references.ts`, plus new `structured-endpoints.test.ts` + `runtime-demo-structured-endpoints.ts`. Nothing outside pi-context + scripts/orchestrator + the spec-v2 migrations decl. No active-substrate relations schema exists (`.context-jit-spec-v2/schemas/relations.schema.json` absent — relations validates against the bundled schema; divergence 2 confirmed legitimate). `.project`/`.context` substrate dirs untouched (no data migration / Phase-H). The other three packages untouched. `find-references.ts` is an in-spirit producer edit (renders `endpointKey` to avoid `[object Object]`); not explicitly in the plan's critical-files list but a correct, necessary, in-scope change.

## Implementer's 4 flagged divergences — adjudicated
1. **buildIdIndexForDir "did not pre-exist"** — CORRECT. The Cycle-1 commit did not claim it; the audit brief's contradiction premise is false. No regression: active-dir path byte-equivalent.
2. **Only packaged relations.schema.json edited** — CORRECT. No active-substrate relations schema exists; relations validates against the bundled schema. All three substrates validate against v2.0.0.
3. **relations migration decl only in `.context-jit-spec-v2/migrations.json`** — consistent with #2 and the active substrate; an `identity` 1.0.0→2.0.0 migration is declared there.
4. **ESM-spy replaced with a structural foreign-not-resolved probe** — the structural probe is STRONGER than a call-spy: it registers + populates the foreign substrate and proves non-resolution by observed outcome, plus the static grep confirms no resolver in the validation call graph.

## Recommendations
None blocking. Optional (cosmetic, no behavior impact): the plan text's "342 edges + 30 project: sentinels" figure is stale relative to the live substrate (309 edges total; the 30 sentinels are `project:`-prefixed children) — a doc-hygiene note for whoever updates the plan, not a code defect.
