# Cycle 9 / Phase G — Adversarial Audit: promoteItem + lineage + append id-uniqueness guard + dir-targeted relation writers

- **Date**: 2026-05-31
- **Auditor**: fresh-context opus (NOT the implementer)
- **Repo**: /Users/david/Projects/workflowsPiExtension, branch `context-jit-spec-v2`, HEAD `06331df` (uncommitted Cycle-9 tree)
- **Mode**: READ-ONLY (Read/Grep/Bash for grep + `npx tsx` + `git diff`/`git log`); no source edits, no npm, no commit
- **Default**: FLAG when uncertain

## Independent re-verification of orchestrator-supplied context

| Claim | Re-verified | Evidence |
|---|---|---|
| build green | YES | `npm run build` clean across 5 packages |
| check green (exit 0) | YES (1 pre-existing warning) | `npm run check` EXIT=0; the lone `noUnusedImports` warning is in `scripts/orchestrator/runtime-demo-context-switch.ts:21` (`tryResolveContextDir`) — an UNCHANGED file (last touched `6daf75a`, not in the Cycle-9 set). Warning, not error; not a Cycle-9 regression. |
| test fail-0, pi-context 890/890 | YES | `npm test` EXIT=0; pi-context `tests 890 / pass 890 / fail 0`; pi-jit-agents 168, pi-workflows 830 (2 skipped), monitors 91 + 157 vitest — all fail 0; 0 `not ok` lines |
| golden 56/53/3, 30 edge_endpoint_unregistered | YES (byte-identical) | independent `validateContext('.')` → total 56, errors 53, warnings 3, `edge_endpoint_unregistered:30` |
| demo exits 0 (9 checks) | YES | `runtime-demo-promote-item.ts` EXIT=0, 9 PASS markers |
| samples catalog 28→29 | YES | `samplesCatalog().relationTypes.length === 29`, `item_derived_from_item` present, `category:"data_flow"` |
| scope: only listed files | YES | `git status` = README.md (prior prose-only edit) + the 6 modified + 5 new files; pi-jit-agents/pi-workflows/monitors/agent-dispatch src untouched; no `.project`/`.context*` mutated |

## Per-probe verdicts

### P1 — promoteItem OID semantics — **CLEAN**
- Dest oid minted by the write-path against the DESTINATION substrate_id: `prepareItemIdentityForWrite` create-mode `out.oid = mintOid(substrateIdForDir(substrateDir))` unconditionally (`block-api.ts:710`; create-branch `:683`), `substrateDir = destDir`. promoteItem does NOT pre-mint or carry the source oid; it reads the minted oid back (`promote-item.ts:208-218`) and asserts `newOid !== srcOid` (`:219-223`).
- `mintOid(substrateId, nonce?)` (`block-api.ts:619-622`) = `sha256Hex(canonicalJson([substrateId, nonce ?? randomUUID()])).slice(0,32)`. Caller-supplied oid is never honored on create (`:683`/`:710` mint unconditionally) — Cycle-3 invariant intact.
- Independent runtime probe: same source promoted twice into the same dest with different refnames → two distinct oids, both ≠ source, both 32-hex. `mintOid(B,'n')===mintOid(B,'n')` true (deterministic in `[id,nonce]`); `mintOid(B,'n')!==mintOid(A,'n')` true (function of substrate_id). promoteItem cannot be tricked into a chosen oid.

### P2 — content_hash + object integrity — **CLEAN**
- Projection strips identity + author fields via `DEFAULT_METADATA_FIELDS` (`promote-item.ts:63-70`); that set = MANDATORY {id,oid,content_hash,content_parent} ∪ DISCRETIONARY {4 author fields, closed_by, closed_at} (`block-api.ts:107-126`). Independent probe: persisted object = `{"title":"t","status":"open"}` — no id/oid/hash/author. Promoted dest item has `created_by` ABSENT.
- Independent probe: dest `content_hash === source content_hash` (byte-identical content → identical projection → identical hash); object round-trips from `<destDir>/objects/<hash>.json`; the lineage edge's pinned `child.content_hash === source content_hash`.

### P3 — Lineage edge correctness + direction — **CLEAN**
- parent = derived dest item, child = source (`promote-item.ts:227-237`). Both endpoints structured `{kind:"item",substrate_id,oid,refname,...}`; child carries pinned `content_hash`. Filed into the DESTINATION via `appendRelationForDir(destDir, edge, ctx)` (`:238`).
- Both endpoints resolve `foreign` CLEAN under validateContext when both substrates + the relation_type are registered (test + demo).
- **Adversarial (the honest-error check)**: independent probe — with the SOURCE substrate NOT registered, `resolveRef` of the child endpoint returns status `unregistered` (NOT a silent foreign-clean pass). The edge resolving CLEAN is genuinely contingent on registration, not an artifact of the demo seeding everything.

### P4 — id-uniqueness guard covers the CLASS + exempts the right paths — **FLAG (low — nested-array append gap)**
- `assertAppendIdUnique` (`block-api.ts:937-948`) is INSIDE `withBlockLock` at: `appendToTypedFile` flat branch (`:988`) AND object-with-array-field branch (`:1014`); `appendToBlockForDir` inline (`:1806`). `assertNoDuplicateIdsInArray` (`:956-967`) in `writeBlockForDir` (`:1661-1665`) for whole-file array dups. All atomic (under the lock / before the atomic tmp+rename).
- Independently exercised: (a) appendToBlockForDir dup → throws; (b) appendToTypedFile BOTH branches dup → throws (`__top__` + `<arrayKey>` labels); (c) writeBlockForDir whole-file two-same-id → throws, nothing written; (d) upsertItemInBlockForDir dup → REPLACES no throw; (e) appendManyToTypedFileIfAbsent matchKey-skip unaffected (no guard call in its body `:1052-1130`); (f) id-less item → not rejected.
- **GAP**: `appendToNestedTypedFile` (`:1437`, the nested-array append behind `appendToNestedArray`/`...ForDir`) has NO guard and writes via `writeTypedFile` (which itself has no per-array dup check — only `writeBlockForDir` does). Independent probe: appending `{id:"F1"}` into a nested `findings` array already holding `{id:"F1"}` SUCCEEDS silently (count → 2, no throw). The whole-file guard in `writeBlockForDir` only scans TOP-LEVEL arrays (`Object.entries(data)` at `:1662`), so a nested-array dup also slips past a whole-block rewrite. Nested-array items in shipped schemas carry ids (e.g. `reviews.findings`), so this is a genuine CLASS member, not out of scope. The plan's locked decision 5 scoped the guard to "pure-append + whole-file-write class" and named only the three sites — nested append was neither named nor excluded. Severity LOW: nested arrays are not the `.project` top-level block convention the FB-001 root cause concerned, and no current consumer is known to append duplicate-id nested items, but the CLASS is incompletely closed. **FGAP-worthy.**

### P5 — Tool-layer check removal left no gap — **CLEAN**
- `index.ts:921-933` racy `readBlock`-then-append check removed; replaced by a comment + direct `appendToBlock` (`:926`). Independent probe via the library path the tool calls: dup append → throws `already exists` (now via the library guard); block-not-found → throws `Block file not found:` (honest error). The old check's try/catch swallowed the read error but re-threw the append anyway, so NO behavior was lost — block-not-found now surfaces as a clean error rather than being masked. `readBlock` still imported + used at `index.ts:203,1349` — no dangling/unused import (lint clean for index.ts).

### P6 — orphan-object deviation — **FLAG (informational — REAL, HARMLESS, pre-existing; FGAP-worthy as a known limitation)**
- **Reproduced independently**: a promote whose projection fails the dest schema's AJV (`additionalProperties:false` on an injected field) → `threw=true`, dest items 0, dest edges 0, **orphanObjects = 1**. The item + edge roll back (the block file's atomic tmp+rename is never committed); a content object persists.
- **Cause confirmed PRE-EXISTING (Cycle 3, NOT Cycle 9)**: in `prepareItemIdentityForWrite` create-mode, `putObject` (`block-api.ts:688`) runs BEFORE the return; `writeBlockForDir` calls `stampWholeBlockIdentity` → `prepareItemIdentityForWrite` (`:1669`/`:1757`) and only THEN `writeTypedFile` runs AJV (`validateFromFile`, `:885-886`). `git log -L 681,689:block-api.ts` shows this ordering landed in commit `5d57465` ("Cycle 3 / Phase C"). Cycle 9 added no putObject and did not reorder validation.
- **Correctness impact**: NONE beyond a dangling object. The object is keyed by its own content hash in a content-addressed store: idempotent (a later successful write of the same content reuses it, never collides), never referenced (no item/edge points at it), and there is no GC that would mis-collect a referenced object. It is harmless garbage in an append-only CAS.
- The test's "tolerates ≤1 orphan object" (`promote-item.test.ts:374-385`) is an **honest accommodation of pre-existing block-api ordering**, NOT a mask over a Cycle-9 regression — the implementer documented the ordering in the test NOTE and it matches the verified Cycle-3 provenance. **Recommend an FGAP** documenting the non-transactional object-store-vs-block-write ordering as a known limitation (a failed identity-stamping write leaks a CAS object), since it is a real wart even if benign — file it rather than leave it only in a test comment.

### P7 — Enum-aware supersession — **CLEAN**
- `supersessionStatusFor` (`promote-item.ts:78-100`) reads the source schema's `status.enum`: prefers `superseded`, else `superseded_by`, else null (leave unchanged); null on missing schema/field/enum. Applied via `updateItemInBlockForDir` (update-mode) only when non-null (`:242-252`) — never constructs an AJV-invalid status.
- Test matrix (passing) + demo: a `decisions` source (enum has `superseded`) → status set; a `tasks` source (no status field) → status unchanged, no throw, lineage edge still filed. Source oid preserved across the supersede update — update-mode preserves prior oid (`block-api.ts:707-708`; immutability throw `:695-699`); `promote-item.test.ts:246-268` asserts `item.oid === oidBefore` after supersession. Inbound-edge-still-resolves covered (`:270-286`).

### P8 — dryRun writes nothing on EVERY channel — **CLEAN**
- Early return (`promote-item.ts:192-204`) before any `appendToBlockForDir`/`appendRelationForDir`/`updateItemInBlockForDir` — no item, no edge, no object, no supersede. `promote-item.test.ts:307-329`: dest block length 0, dest relations 0, `objects/` dir absent, source status still `open`. Demo confirms the same.

### P9 — dir-targeted relation writers parity + layering — **CLEAN**
- cwd forms are now thin wrappers: `writeRelations`→`writeRelationsForDir(resolveContextDir(cwd),…)` (`context.ts:519`/`531`), `appendRelations`→`appendRelationsForDir(…)` (`:572`/`587`), `appendRelation`→`appendRelationForDir(…)` (`:609`/`620`). Byte-identical behavior via cwd (the existing relation tests pass unchanged). `*ForDir` target `<dir>/relations.json` via `relationsPathForDir` (`:386`) with no pointer resolution.
- Layering: `context.ts` has NO `import ... from "./context-sdk"` (only comment mentions documenting the one-way constraint at `:11,12,253,561,762,1266,1268`). `promote-item` is imported by NEITHER context.ts NOR context-sdk.ts. promote-item sits above, one-way. Independent probe (P9 in the equivalence test `:443-452`): the active pointer is unmoved by a promotion.

### P10 — Scope + parity — **CLEAN**
- Only the listed files changed (+ my gitignored `tmp/` probes, since removed). pi-jit-agents/pi-workflows/monitors/agent-dispatch src untouched. No `.project`/`.context*` data mutated (golden byte-identical corroborates). `conception.json` gained exactly the one `item_derived_from_item` relation_type with `category:"data_flow"`, `source_kinds`/`target_kinds` = `["*"]`. `samples-catalog.test.ts` 28→29 matches the live catalog count. No `.pi/`, no `docs/` writes. README.md is a prose-only paragraph edit (present in the initial tree status, not part of the Cycle-9 deliverable surface).

## FLAGs by severity

- **LOW (1)**: P4 — `appendToNestedTypedFile` nested-array append is unguarded; a duplicate id in a nested array writes silently, and `writeBlockForDir`'s whole-file guard scans only top-level arrays. The CLASS the guard claims to close (intra-block id-uniqueness) is incompletely covered for nested-array shapes. FGAP-worthy.
- **INFORMATIONAL (1)**: P6 — orphan content object on a dest-schema-validation failure. REAL, HARMLESS, PRE-EXISTING (Cycle 3 `5d57465`, not Cycle 9). FGAP-worthy as a documented known limitation (non-transactional CAS-vs-block-write ordering).

No HIGH or MEDIUM flags. No false-pass scenarios found in the load-bearing claims.

## Verdict on the orphan-object deviation
**REAL, HARMLESS, FGAP-worthy (as a known-limitation record, NOT a blocker).** Independently reproduced (1 object lands; item + edge roll back). Provenance confirmed pre-existing via `git log -L` → Cycle 3 (`5d57465`); Cycle 9 neither introduced nor worsened it. A content-addressed, self-keyed, unreferenced object is benign garbage — no corruption, no collision, no mis-GC. The test's `≤1 orphan` tolerance is an honest accommodation, not a regression mask. Recommend filing an FGAP so the non-transactional ordering lives in the substrate rather than only a test comment.

## Overall
Cycle 9 is substantively sound: OID minting is genuinely destination-scoped and unforgeable, content hashes are content-only and match the source, the lineage edge is correctly directed + pinned + resolves honestly (and fails honestly when a substrate is unregistered), supersession is enum-aware and oid-preserving, dryRun is inert on every channel, the dir-targeted relation writers are parity-preserving with clean one-way layering, and the tool-layer check removal left the single library guard as the enforcement point with no behavior lost. Two FGAP-worthy items (nested-array guard gap LOW; orphan-object ordering INFORMATIONAL/pre-existing) — neither blocks green; both warrant substrate records.
