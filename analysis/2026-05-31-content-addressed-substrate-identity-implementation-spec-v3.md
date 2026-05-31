# Content-Addressed Substrate Identity — Consolidated Implementation + Migration Spec (v3)

Date: 2026-05-31
Repo: /Users/david/Projects/workflowsPiExtension
Target package: `@davidorex/pi-context`
Pi runtime grounded: `@earendil-works/pi-coding-agent` 0.75.4
Status: work-order-ready implementation prompt. Read-only investigation produced this; no source was edited.

**Supersedes all three prior inputs:**
- `analysis/2026-05-31-content-addressed-substrate-identity-implementation-spec-v2.md` (the SPINE — its line-anchored §0 findings, exhaustive enumerations, `rename-canonical-id.ts` precedent, ordering hazards, and resolver/SubstrateIndex design are carried forward verbatim in substance, re-verified below).
- `analysis/2026-05-31-substrate-identity-spec-comparison.md` (the comparison — its verdicts adopted: v2 is the spine; A's promotion design is grafted; the shared dir-bound-write blocker is closed here as Phase 0).
- `analysis/2026-05-31 PI-CONTEXT Substrate Identity & Integrity — Implementation Specification.md` (Spec A — its PROMOTION design (`promoteItem` + `item_derived_from_item` lineage type + tool/CLI/tests) is mined and corrected against code; the rest is superseded).

**Zero-deferral declaration.** Every component surfaced as needed has a complete phase with exact file, signature, data shape, test, runtime demo, and adversarial probe. The shared cross-substrate-write blocker (the one P0 both prior specs left open) is closed as **Phase 0**. Promotion is a **fully-built phase**, not "named only." No component is reserved, deferred, future-phased, or out of scope. Every fork is decided with the rejected arm's one-line rationale.

---

## 1. Three identity layers

| Layer | Field | Derivation | Mutability | Visibility | What it is |
|---|---|---|---|---|---|
| **OID** | `oid` | `sha256(canonicalJson([substrate_id, birth_timestamp, nonce])).slice(0,32)` — 32 hex | minted once at item birth, **immutable across edits** | invisible | **Opaque entity surrogate key. NOT content-derived** — do not call the OID "content-addressed." |
| **content_hash** | `content_hash` | `sha256(JCS(content_projection))` — 64 hex | recomputed every mutating write | invisible | **Version identity.** The genuinely content-addressed value; keys the object store. |
| **refname** | `id` | allocated by `nextId` (e.g. `FEAT-005`) | substrate-scoped, freely mutable | **visible** | **Human label** for display/authoring only. |

**Guardrail (binding):** OID birth-facts (`substrate_id + timestamp + nonce`) make it an opaque surrogate, NOT a hash of the body — editing an item never changes its OID; the OID is the durable join key for edges. The content-addressed value is `content_hash`, a separate field. The two MUST NOT be conflated; any step that derives the OID from the item body is a spec defect.

## 2. Governing principle (declarative)

**Machine identity invisible, human selectors visible** (the git standard: SHAs hidden, branch/remote/path names visible).

- Users author and read by **refname** only. `/context init`, normal item writes, and `/context switch` keep their current user-visible surface. OID, content_hash, substrate_id, and the object store stay off the common path.
- Substrates are wholly separate **peers**, each its own identity space, created standalone. They become related only by an explicit edge a user files. References are symmetric; any peer may reference any peer.
- Cross-substrate relating uses a **human selector** — a registry **alias** (e.g. `.project:FGAP-153`, where `project` resolves to a substrate_id) or a `{ substrate: "<alias>", id: "<refname>" }` tool param.
- The registry maps `substrate_id → { dir, aliases[] }`; the resolver locates a referenced item via the registry, then resolves it. Pinning rides the edge as an optional `content_hash`.
- Legacy `project:` is a **configurable alias map** (default `{ project: <substrate_id of the dir named .project> }`), resolved through the registry like any other alias.

**Acceptance bar:** after this lands, the user-visible experience equals today's *plus* "I can relate items across my separate substrates and the references resolve" *plus* "I can promote a local arc item into a canonical substrate with recorded lineage." Any normal-path interaction that exposes a hash / OID / substrate_id / object path is rejected and reworked.

---

## §0 Critical findings (all verified at cited lines, 2026-05-31)

- **JCS ABSENT.** `find node_modules -maxdepth 2 -iname "*canonicalize*"` → **0 hits**. Add `"canonicalize": "^2.0.0"` (RFC 8785 JCS) to `packages/pi-context/package.json` dependencies. **Interop note (closes comparison shared-blocker #2):** `canonicalize@2` ships CommonJS with a default export; under this repo's strict-ESM `tsc` (`"module":"NodeNext"`) import as `import canonicalize from "canonicalize";` and call `canonicalize(value)`. Phase A1's test exercises the import path directly so any ESM/CJS interop break fails at `npm run build` + the first unit test, not at runtime.
- **`node:crypto` ABSENT in pi-context src.** `grep -rn "node:crypto\|createHash\|randomUUID" packages/pi-context/src/` (minus tests) → **0 hits**. `node:crypto.createHash("sha256")` + `randomUUID()` are built-in (no install).
- **Write/allocation primitives are bound to the ACTIVE substrate via `cwd` (THE SHARED BLOCKER — closed as Phase 0).** `blockFilePath(cwd, blockName)` (`block-api.ts:48`) returns `path.join(resolveContextDir(cwd), \`${blockName}.json\`)` (`:50`); `blockSchemaPath(cwd, blockName)` (`:53`) returns `schemaPath(cwd, blockName)`. Schema validation therefore reads the **live `<active-substrate>/schemas/`**, NOT `samples/`. `writeBlock(cwd,…)` `:1056`, `appendToBlock(cwd,…)` `:1093`, `upsertItemInBlock(cwd,…)` `:1178`, `updateItemInBlock(cwd,…)` `:1139`, `nextId(cwd,…)` `:1419` — **none accepts a target dir**. The migration must write into NON-active substrates (it iterates `.project`, `.context`, `.context-jit-spec-v2` while one is active); the cited `rename-canonical-id.ts` precedent only ever touches the ACTIVE substrate, so it does NOT establish multi-dir-write. **Phase 0 generalizes every primitive the migration/promotion uses to accept an explicit resolved substrate dir.**
- **Live-schema target (closes A's fatal omission).** Because writes validate against `blockSchemaPath(cwd,…)` = the live `<substrate>/schemas/`, the `oid`/`content_hash`/`content_parent` field declarations MUST land in EACH live substrate's `schemas/*.schema.json` (and in packaged `samples/schemas/`), not samples-only. The migration's step 0 fail-fast checks each target substrate's live schemas before any write.
- **Durable migration decls, not an in-memory fn registry.** `appendMigrationDecl` (`migrations-store.ts:164`) is the durable per-schema decl append; it collision-throws (`:169`), made idempotent via try/skip. `validateBlockWithMigration` (`schema-validator.ts:204`) runs migrations when a block's `schema_version` differs (`:234`). `schema-migrations.ts` (the in-memory `MigrationFn` registry) is NOT the target — Spec A pointed at the wrong file.
- **Lens bins are first-class endpoints, not items (LOAD-BEARING).** `context.ts:1121` validates a lens-edge `parent` via `!lens.bins.includes(edge.parent)` (a bin LABEL, never an item id); `context.ts:1128` resolves the `child` as an item (`idIndex.get(edge.child)`). `context.ts:1005` (`for (const bin of lens.bins)`) and `:1012` (`lens.bins.includes(e.parent)`) confirm bin-grouping. The migration MUST NOT OID-rewrite a lens-bin parent.
- **Item-birth/mutation lives in the WRITE PRIMITIVES, not the autoId branches.** The Pi `append-block-item` autoId branch and `file-block-item.ts` autoId allocate the refname only, then route THROUGH the `block-api.ts` primitives. Stamping in the primitive covers the caller-supplied-`id` birth path too.
- **`idIndex` is ITERATED for per-item invariants — dual-keying double-counts.** `buildIdIndex` (`context-sdk.ts:1074`) returns `Map<string, ItemLocation>`, hardcodes `tryResolveContextDir(cwd)` (`:1076`) = active-only. It is ITERATED at **8 sites** (`context-sdk.ts:674, :702, :725, :774, :1330, :1364, :1394, :1431` — the last destructures `[sid, sloc]`) and point-looked-up at **10 sites** (`:690, :696, :993, :1132 (resolveItemById), :1169 (resolveItemsByIds), :1260, :1268, :1300, :1301, :1402`). A single map keyed by both refname AND oid inflates every iteration 2×. Split lookup maps from the iteration list.
- **Import-layer constraint (verified `context.ts:11-12, :430, :588`).** `context.ts` is "a strictly lower layer than context-sdk" and imports ONLY block-api; `context-sdk.ts` imports `context.ts` (one-way, `context-sdk.ts:20`). Endpoint resolution needs `buildIdIndex` from context-sdk; importing context-sdk into context inverts the graph. Forces porcelain/plumbing split: raw writers stay in `context.ts`; the resolving porcelain (`appendRelationByRef`) lives in `context-sdk.ts`.
- **No per-substrate stable id or registry.** `ConfigBlock` (`context.ts:32`) has NO `substrate_id`. `config.schema.json` is `additionalProperties:false`, **version 1.4.0** (`:4`). `.pi-context.json` (`BootstrapPointerExtras`, `context-dir.ts:182`) carries `{previous_contextDir, switched_at, switched_by}` only; `bootstrap.schema.json` is `additionalProperties:false`, **version 1.1.0** (`:4`). `relations.schema.json` is `additionalProperties:false`, **version 1.0.0** (`:4`), framework-pre-registered. No project-root registry exists.
- **`project:` is convention only — no code parses it.** It appears solely as `relations.json` edge endpoints; `buildIdIndex` indexes only the ACTIVE substrate, so `project:FGAP-153` fails `idIndex.has(edge.child)` (`:1268`) → the 30 errors.
- **Item schemas: 16; item-level `additionalProperties:false` on 11; permissive on 5.** Permissive: `conventions, rationale, requirements, tasks, verification`. `closed_by`/`closed_at` declared only on `framework-gaps.schema.json`. (`samples/schemas/` count = 16.)
- **Cross-substrate `project:` sentinels:** `.context-jit-spec-v2/relations.json` → **30 edge endpoints**, **20 distinct** targets (grep-confirmed: `grep -c` → 30; `sort -u` → 20). These are the 30 validator `does not resolve` errors.
- **`rename-canonical-id.ts` is the migration precedent** (deep-clone config accumulator, dry-run, atomic writes, report object, edge `parent`/`child` rewrite). The cross-project migration generalizes its discipline across N substrates VIA the Phase-0 dir-targeted primitives (the precedent itself is active-only).
- **Tool names (verified `index.ts`):** `append-relation` (`:996`), `rename-canonical-id` (`:1613`), `resolve-item-by-id` (`:2170`), `resolve-items-by-id` (`:2326`, SINGULAR "id").

**No design-canon contradiction found.** Every decided fix below is implementable against the current code. No DECISION in this spec is impossible against code.

---

## Grounding inventory

### Code surfaces touched

| Surface | file:line | current shape | change |
|---|---|---|---|
| hashing | NEW `content-hash.ts` | — | `canonicalJson`, `sha256Hex`, `computeContentHash` |
| OID mint | NEW `oid.ts` | — | `mintOid(substrateId, bornAt?, nonce?)` |
| object store | NEW `object-store.ts` | — | `putObject/getObject/hasObject` |
| content projection | `block-api.ts:66 AUTHOR_FIELDS`, `:68 SchemaCacheEntry`, `:189 getSchemaCacheEntry` | catalogs author fields | ADD `metadataFields` to cache entry + `contentProjection(...)` |
| dir-targeted path helpers | `block-api.ts:48 blockFilePath`, `:53 blockSchemaPath` | cwd→active dir | ADD `blockFilePathForDir`/`blockSchemaPathForDir`; existing become wrappers |
| dir-targeted writers | `block-api.ts:1056 writeBlock`, `:1093 appendToBlock`, `:1178 upsertItemInBlock`, `:1419 nextId` | cwd-bound | ADD `*ForDir` variants; existing become `fn(cwd,…) = fnForDir(resolveContextDir(cwd),…)` |
| identity-stamp primitive | NEW in `block-api.ts` | — | `prepareItemIdentityForWrite(substrateDir, substrateId, blockName, item, schemaPath, arrayKey, mode, prior?)` |
| birth/mutation write paths | `block-api.ts:462 appendToTypedFile`, `:536 appendManyToTypedFileIfAbsent`, `:702 updateItemInTypedFile`, `:757 upsertItemInTypedFile`, `:861 appendToNestedTypedFile`, `:920 updateNestedItemInTypedFile`, `:1056 writeBlock` | merge/append then `writeTypedFile` | invoke `prepareItemIdentityForWrite` |
| nextId | `block-api.ts:1419` | refname only | **stays refname-only** (gets a `*ForDir` variant for the migration/promotion) |
| item schemas | live `<substrate>/schemas/*.schema.json` + `samples/schemas/*.schema.json` (16) | varies | ADD `oid`/`content_hash`/`content_parent`; bump version; migration entry |
| Edge interface | `context.ts:199` | `{parent:string, child:string, relation_type, ordinal?}` | endpoints become `EdgeEndpoint` (item \| lens_bin) |
| relations schema | `packages/pi-context/schemas/relations.schema.json` (`additionalProperties:false`, v1.0.0) | parent/child = string | endpoints become objects with `oneOf` discriminant; bump version |
| edge writers (plumbing) | `context.ts:400 writeRelations`, `:439 appendRelations`, `:461 appendRelation`, `:412 identityKey` | string endpoints | accept structured endpoints; `identityKey` keys on `(parentKey, childKey, rt)` |
| edge writer (porcelain) | NEW in `context-sdk.ts` | — | `appendRelationByRef` resolves friendly selectors → structured |
| edge consumers | `context-sdk.ts`, `execution-context.ts`, `context.ts`, `rename-canonical-id.ts`, `scripts/orchestrator/append-relation.ts`, `scripts/orchestrator/gather-execution-context.ts` (6 files via `loadRelations`) | read string endpoints | read structured endpoints |
| validators | `context-sdk.ts:1234 validateContext` (edge loop `:1259-1322`), `context.ts:1082 validateRelations` (lens-bin check `:1121`, item check `:1128`/`:1159`) | `idIndex.has`/`.get` on refname | route through resolver; lens bin discriminated |
| substrate index | `context-sdk.ts:1009 ItemLocation`, `:1032 expectedBlockForId`, `:1074 buildIdIndex`, `:1131 resolveItemById`, `:1166 resolveItemsByIds` | active-only `Map<refname,loc>` | `SubstrateIndex` + `buildIdIndexForDir` |
| resolver | NEW in `context-sdk.ts` | — | `resolveRef(cwd, ref): ResolvedRef` |
| substrate_id (config SoT) | `context.ts:32 ConfigBlock`, `config.schema.json` | absent | ADD `substrate_id?`; bump config schema 1.4.0→1.5.0 |
| substrate_id resolver | NEW in `context-dir.ts` | — | `substrateIdFor(cwd)`; `mintSubstrateId()` |
| registry | NEW project-root `.pi-context-registry.json` + NEW `context-registry.ts` + NEW `schemas/context-registry.schema.json` | absent | `substrate_id → {dir, aliases[]}` |
| resolver consumers | `compile.ts:240/:457`, `render-by-id.ts:73`, `execution-context.ts:150/:208`, `index.ts:2170/:2326` tools | `buildIdIndex`/`resolveItemsByIds` (refname) | accept OID or refname; render refname |
| promotion | NEW `promote-item.ts` + Pi tool `promote-item` + `scripts/orchestrator/promote-item.ts` | — | new-OID copy + lineage |
| lineage relation type | `samples/conception.json` `relation_types[]` + live configs | absent | ADD `item_derived_from_item` |
| migration | NEW `migrate-content-addressed.ts` + Pi tool + `scripts/orchestrator/migrate-content-addressed.ts` | — | multi-substrate |

### Exhaustive enumerations

**Dir-targeted primitives the migration + promotion require** (Phase 0): `blockFilePathForDir`, `blockSchemaPathForDir`, `writeBlockForDir`, `appendToBlockForDir`, `upsertItemInBlockForDir`, `nextIdForDir`, plus `putObject`/`hasObject` already take an explicit `substrateDir` (Phase B). Migration writes via `writeBlockForDir`; promotion allocates via `nextIdForDir` + `appendToBlockForDir`. Existing cwd-bound functions become thin wrappers — **zero caller breakage**.

**Item-birth / mutation write paths** (block-api primitives; all call `writeTypedFile`/`writeBlock`; ALL get `prepareItemIdentityForWrite`):
1. `appendToTypedFile` `:462` — birth (append).
2. `appendManyToTypedFileIfAbsent` `:536` — birth (bulk append-if-absent; the canonical `file-block-item.ts --auto-id` bulk path routes here — A under-covered this).
3. `updateItemInTypedFile` `:702` — mutation (recompute hash, preserve oid, set content_parent).
4. `upsertItemInTypedFile` `:757` — birth at `idx === -1`; mutation otherwise.
5. `appendToNestedTypedFile` `:861` — nested birth. **DECISION: nested records are NOT globally addressable** — they are sub-records of their parent item (`buildIdIndex` only indexes items whose array is a direct child of the block object with a string `id`). Stamp `content_hash` on the PARENT (its content includes the nested array); mint NO OID/content_hash on the nested record. (Rejected: minting OIDs on nested records — they have no top-level `id`, are not edge endpoints, and would bloat the object store with non-addressable versions.)
6. `updateNestedItemInTypedFile` `:920` — nested mutation; recompute the PARENT's content_hash only.
7. `writeBlock` `:1056` — whole-file replace; stamp every top-level item lacking `oid`/`content_hash`.
8. Block wrappers `appendToBlock` `:1093`, `updateItemInBlock` `:1139`, `upsertItemInBlock` `:1178` delegate to (1-4) — covered transitively.
`nextId` `:1419` stays refname-only.

**idIndex ITERATION sites** (8): `context-sdk.ts:674, :702, :725, :774, :1330, :1364, :1394, :1431` → iterate `SubstrateIndex.items`.
**idIndex LOOKUP sites** (10): `context-sdk.ts:690, :696, :993, :1132, :1169, :1260, :1268, :1300, :1301, :1402` → use `byRefname`/`byOid`. `buildIdIndex` callers: `:653, :984, :1132, :1169, :1242`, `rename-canonical-id.ts`, `compile.ts:240`, `render-by-id.ts:73`.

**Lens-relation endpoint checks** (`lens.bins`): `context.ts:1005, :1012, :1121` (parent), item-resolve `:1128`; hierarchy block-match `:1145/:1159` resolve BOTH endpoints as items.

**Edge producers** (plumbing): `context.ts:400 writeRelations`, `:439 appendRelations`, `:461 appendRelation` (+ `:412 identityKey`). Call sites: `context.ts:462`, `index.ts:996` (`append-relation` tool), `rename-canonical-id.ts`, `scripts/orchestrator/append-relation.ts`.

**Edge consumers** (`loadRelations`, 6 files): `context-sdk.ts`, `execution-context.ts`, `context.ts`, `rename-canonical-id.ts`, `scripts/orchestrator/append-relation.ts`, `scripts/orchestrator/gather-execution-context.ts`.

**Item schemas** (16): context-contracts, conventions*, decisions, features, framework-gaps (only one with `closed_by`/`closed_at`), issues, layer-plans, phase, rationale*, requirements*, research, spec-reviews, story, tasks*, verification*, work-orders. (`*` = item-permissive.)

---

## Phased implementation

Order forced by ordering hazards (see end). Per CLAUDE.md Completion Sequence, every step = edit → `npm run build` → `npm run check` → `npm test` (no pipe) → runtime-demo → adversarial probe → commit. Phase sequence: **0 dir-targeted writes → A content_hash/JCS → B object store → C OID+schema fields+stamping → D substrate_id SoT+registry/aliases → E structured endpoints → F SubstrateIndex+resolver+validator → G promotion → H migration.**

### Phase 0 — dir-targeted write/allocation primitives (prerequisite; closes the shared blocker)

The migration writes into NON-active substrates; every primitive is cwd→active bound. Generalize, parallel to `buildIdIndexForDir`.

**0.1 Path helpers.** In `block-api.ts`, ADD:
```ts
export function blockFilePathForDir(substrateDir: string, blockName: string): string;   // path.join(substrateDir, `${blockName}.json`)
export function blockSchemaPathForDir(substrateDir: string, blockName: string): string;  // path.join(substrateDir, "schemas", `${blockName}.schema.json`)
```
Refactor existing: `blockFilePath(cwd, n) = blockFilePathForDir(resolveContextDir(cwd), n)`; `blockSchemaPath(cwd, n) = blockSchemaPathForDir(resolveContextDir(cwd), n)` (preserving the `schemaPath(cwd,n)` semantics — `schemaPath` itself gets a dir-targeted twin or `blockSchemaPathForDir` inlines the `<dir>/schemas/<n>.schema.json` join verified at the current resolver).

**0.2 Writer/allocator variants.** ADD:
```ts
export function writeBlockForDir(substrateDir: string, blockName: string, data: unknown, ctx?: DispatchContext): void;
export function appendToBlockForDir(substrateDir: string, blockName: string, item: Record<string,unknown>, ctx?: DispatchContext): void;
export function upsertItemInBlockForDir(substrateDir: string, blockName: string, item: Record<string,unknown>, ctx?: DispatchContext): { created: boolean };
export function nextIdForDir(substrateDir: string): string;  // reads <dir>/config.json + the block file via blockFilePathForDir; refname-only
```
Each `*ForDir` does what the current function does but resolves paths/schema through `blockFilePathForDir`/`blockSchemaPathForDir` against `substrateDir`. The existing functions become wrappers:
```ts
export function writeBlock(cwd, n, d, ctx) { return writeBlockForDir(resolveContextDir(cwd), n, d, ctx); }
// …same for appendToBlock, upsertItemInBlock, nextId
```
- **Test** (`block-api-fordir.test.ts`): in a scratch project with two substrate dirs `.subA` (active per pointer) and `.subB`, call `writeBlockForDir('.subB/path', 'framework-gaps', {...})`; read it back via `readBlock` pointed at `.subB`; assert the active pointer (`.pi-context.json contextDir`) is UNCHANGED and `.subA`'s block file is untouched.
- **Runtime demo:** `npx tsx -e` builds two scratch substrates, writes one item into the non-active one via `appendToBlockForDir`, prints both block files — only the target changed.
- **Adversarial probe:** `grep -nE 'writeBlock\(|appendToBlock\(|upsertItemInBlock\(|nextId\(' packages/pi-context/src/migrate-content-addressed.ts packages/pi-context/src/promote-item.ts` (after Phase G/H) → **must be empty**; the migration/promotion call ONLY `*ForDir` variants against non-active substrates. A cwd-bound call against a non-active dir is a defect.

### Phase A — content_hash primitives + content/metadata partition

**A1. JCS + crypto helper.** NEW `packages/pi-context/src/content-hash.ts`. Add `"canonicalize": "^2.0.0"` to dependencies + `"./content-hash"` to `exports`.
```ts
export function canonicalJson(value: unknown): string;        // import canonicalize from "canonicalize"; return canonicalize(value)
export function sha256Hex(canonical: string): string;         // createHash("sha256").update(canonical).digest("hex")
export function computeContentHash(content: Record<string,unknown>): string; // sha256Hex(canonicalJson(content))
```
- Test (`content-hash.test.ts`): key-reorder yields equal hash; the `canonicalize` import resolves and is callable (interop check); two different objects yield different hashes.
- Runtime demo: `npx tsx -e "import {computeContentHash} from '@davidorex/pi-context/content-hash'; console.log(computeContentHash({status:'open',title:'x'})===computeContentHash({title:'x',status:'open'}))"` → `true`.
- Adversarial probe: `grep -n "computeContentHash(" packages/pi-context/src/` — every call site passes `contentProjection(...)` output, never a raw item.

**A2. Content/metadata partition.** The excluded-from-hashing set is split into two tiers:
- **MANDATORY floor (non-overridable):** `id`, `oid`, `content_hash`, `content_parent`. These are identity/version machinery, never content, and MUST always be excluded — each for a structural reason: `id` (refname) is mutable, so a rename must not move the hash (rename-stability); `oid` is entity identity, so two items with identical content but distinct OIDs must share one content hash (content-equality / dedup / pinning); `content_hash` cannot hash itself; `content_parent` is version-graph ancestry, not content, so including it would make identical content with different histories hash differently.
- **DISCRETIONARY default (override-replaceable):** `AUTHOR_FIELDS` (`block-api.ts:66`: `created_by, created_at, modified_by, modified_at`), `closed_by`, `closed_at` — convention metadata a schema may legitimately re-specify.
- `DEFAULT_METADATA_FIELDS` = MANDATORY ∪ DISCRETIONARY (the 10).
- **Consequence:** renaming a refname does NOT change `content_hash`; two items identical-but-for-refname have EQUAL `content_hash`, DISTINCT `oid`.

Mechanism: optional schema annotation `"x-identity": { "metadata_fields": [...] }` at item-schema level (mirrors the `x-prompt-budget`/`x-lifecycle` extension-keyword convention). The override REPLACES only the discretionary tier and is UNIONED with the mandatory floor:
```
metadataFieldsForSchema(schema, arrayKey) = MANDATORY ∪ (x-identity.metadata_fields ?? DISCRETIONARY)
```
An override can therefore never un-exclude an identity/version field — an `x-identity` that omits `id` cannot make a rename move the content hash. (Implementation status: Cycle 2 shipped the simpler `override ?? DEFAULT_METADATA_FIELDS` whole-set-replace form — DORMANT, no overrides authored, no live caller. **Cycle 3 MUST implement the mandatory-floor union below before any `x-identity` override is authored or `contentProjection` is wired into a write path.**)

- Extend `block-api.ts` cache: `metadataFields`/`metadataFieldsByArrayKey` on `SchemaCacheEntry` (`:68`), populated in `getSchemaCacheEntry` (`:189`) via the single `metadataFieldsForSchema` reader. ADD:
```ts
export function contentProjection(schema: Record<string,unknown>, arrayKey: string, item: Record<string,unknown>): Record<string,unknown>;
```
returning a shallow copy with the resolved metadata keys deleted (must not mutate input).
- Test: changing `created_at`/`modified_by`/`oid`/`id` → `contentProjection` identical → hash unchanged; changing `status` → hash changes.
- **Binding mandatory-floor test (Cycle 3):** a schema whose `x-identity.metadata_fields` OMITS `id`/`oid`/`content_hash`/`content_parent` still excludes all four; two items identical-but-for-`id` under that override still yield EQUAL `computeContentHash(contentProjection(...))`. A green run of this test is required before the override surface is considered live.
- Adversarial probe: assert `id` IS in the deleted set under both the default and an `id`-omitting override.

### Phase B — content object store

**B1.** NEW `packages/pi-context/src/object-store.ts`. Append-only per-substrate store at `<substrateDir>/objects/<content_hash>.json` holding the canonical content projection of a version.
```ts
export function putObject(substrateDir: string, contentHash: string, content: Record<string,unknown>): void; // atomic tmp+rename; idempotent (skip if hasObject)
export function getObject(substrateDir: string, contentHash: string): Record<string,unknown> | null;
export function hasObject(substrateDir: string, contentHash: string): boolean;
```
- Atomic write mirrors `writeTypedFile` (`block-api.ts:397`, tmp+rename). Takes `substrateDir` explicitly (Phase-0-aligned — works against non-active dirs in the migration).
- **DECISION — track `objects/` in git.** It is the durable Merkle store; losing it loses pinning/integrity. Small JSON, git-trackable. Add NOTHING to `.gitignore` for it. (Rejected: gitignoring `objects/` — it would make `content_parent` ancestry non-durable, reducing the design to A-rearticulation's inline-pointer-only model, which cannot honestly back the "content-addressed" claim.)
- **GC/pruning DECISION — none; append-only, no GC primitive this arc.** Object growth is bounded by edit frequency; orphan objects (superseded versions no longer pinned by any edge) are retained as version history by design (that IS the Merkle store's purpose). (Rejected: a GC sweep — it would delete exactly the ancestry the store exists to preserve; pruning is anti-purpose, not deferred.)
- Test: put then get round-trips; put twice = idempotent (one file, no error); `getObject(missing)` → null (no throw).
- Runtime demo: `npx tsx -e` put a projection into a scratch dir's `objects/`, `hasObject` → true, `getObject` deep-equals.
- Adversarial probe: confirm the file lands under `<substrateDir>/objects/<hash>.json` and the tmp file is gone (atomic rename completed).

### Phase C — OID mint + item schema fields + write-primitive wiring

**C1. OID mint.** NEW `packages/pi-context/src/oid.ts`:
```ts
import { randomUUID } from "node:crypto";
import { canonicalJson, sha256Hex } from "./content-hash.js";
export function mintOid(substrateId: string, bornAt?: string, nonce?: string): string;
// sha256Hex(canonicalJson([substrateId, bornAt ?? new Date().toISOString(), nonce ?? randomUUID()])).slice(0,32)
```
Export via `"./oid"`. Takes `substrateId` as a param (testable in isolation; the write primitive supplies it from `substrateIdFor`/`config.substrate_id`).
- Test: two calls with identical `substrateId` but default nonce → DISTINCT oids; explicit `(id, ts, nonce)` → deterministic.

**C2. Add fields to all 16 item schemas (live + samples).** To each item `properties`:
```json
"oid": { "type": "string", "pattern": "^[0-9a-f]{32}$", "description": "Immutable opaque entity identity (surrogate key, NOT content-derived). Minted once at birth." },
"content_hash": { "type": "string", "pattern": "^[0-9a-f]{64}$", "description": "sha256 of canonical content projection; recomputed each mutating write." },
"content_parent": { "type": "string", "pattern": "^[0-9a-f]{64}$", "description": "content_hash of prior version (Merkle ancestry). Absent on version 1." }
```
NOT `required`. Bump each schema `version`. Edit the 11 `additionalProperties:false` schemas before any write carries the fields; the 5 permissive ones still get the declarations (renderers/projection read them). Edit BOTH `samples/schemas/` AND each live substrate's `schemas/` (`.project`, `.context`, `.context-jit-spec-v2`). Register an identity migration per bumped schema per substrate via `appendMigrationDecl` (`migrations-store.ts:164`) so `validateBlockWithMigration` (`schema-validator.ts:204`) passes legacy blocks forward.

**C3. Single identity-stamp primitive.** ADD to `block-api.ts`:
```ts
export function prepareItemIdentityForWrite(
  substrateDir: string, substrateId: string, blockName: string,
  item: Record<string,unknown>, schemaPath: string | null, arrayKey: string,
  mode: "create" | "update", prior?: Record<string,unknown>,
): Record<string,unknown>;
```
- `create`: if `oid` absent → `mintOid(substrateId)`; compute `content_hash = computeContentHash(contentProjection(schema, arrayKey, item))`; `putObject(substrateDir, content_hash, projection)`; no `content_parent`.
- `update`: assert `item.oid === prior.oid` (throw on attempted change — OID immutable); recompute `content_hash`; if changed from `prior.content_hash` set `content_parent = prior.content_hash` and `putObject` the new version; if unchanged, preserve prior `content_parent`.
Invoke from EVERY path in the birth/mutation enumeration (1-7). `substrateId` is resolved by the calling primitive: cwd-bound callers use `substrateIdFor(cwd)` (Phase D); `*ForDir` callers read `<substrateDir>/config.json` `substrate_id`. The autoId branches keep allocating the refname only.
- Test: append fresh item via `appendToBlock` → `oid` 32-hex, `content_hash` 64-hex, `id` refname, all distinct; object present in store.
- Runtime demo: `file-block-item.ts --block framework-gaps --auto-id --dry-run` against a scratch substrate; item carries all three.
- Adversarial probes: (a) append same content twice → DISTINCT oid, EQUAL content_hash; (b) `updateItemInBlock(..., {oid:"deadbeef…"})` → throws; (c) metadata-only update → content_hash UNCHANGED, no new object; (d) content-field update → content_hash changes, `content_parent` == old hash, new object stored.

### Phase D — substrate_id (config source-of-truth) + registry(+aliases)

**D1. config SoT.** `config.schema.json`: ADD `"substrate_id": {"type":"string","pattern":"^sub-[0-9a-f]{16}$"}` (additive, NOT required); bump `version` 1.4.0→1.5.0. `ConfigBlock` (`context.ts:32`): add `substrate_id?: string`. It is a SCALAR, NOT an AmendRegistry array — mutate via whole-config write (mirror `schema_version`/`root` exclusion at `context.ts`).
ADD to `context-dir.ts`: `mintSubstrateId()` → `"sub-" + sha256Hex(canonicalJson([Date.now(), randomUUID()])).slice(0,16)`; `substrateIdFor(cwd)` reads the active dir via `resolveContextDir`, then that dir's `config.json` `substrate_id` (throws if absent post-migration). **The bootstrap pointer does NOT store substrate_id** (no `bootstrap.schema.json` edit — config is the sole SoT).

**D2. Registry.** NEW `<cwd>/.pi-context-registry.json` + NEW `schemas/context-registry.schema.json` ($id `pi-context://schemas/context-registry`), pre-registered by adding `"context-registry"` to `FRAMEWORK_SCHEMA_NAMES` (`schema-validator.ts:35`):
```json
{ "version": "1.0.0",
  "substrates": { "<substrate_id>": { "dir": ".context-jit-spec-v2", "aliases": [] } } }
```
NEW `packages/pi-context/src/context-registry.ts` (mirror `migrations-store.ts` atomic discipline): `loadRegistry(cwd)`, `writeRegistry(cwd, ...)`, `registerSubstrate(cwd, substrate_id, dir, aliases?)`, `resolveSubstrateDir(cwd, substrate_id)`, `resolveAlias(cwd, alias): substrate_id|null`.
**SoT drift invariant:** `registry[config.substrate_id].dir === resolved active contextDir`. ADD this check to `validateContext`; report drift as ERROR.
- Test: register two substrates with an alias; `resolveAlias("project")` → the right substrate_id; rename a dir in the registry → `resolveSubstrateDir` returns the new dir for the unchanged id; SoT-drift fixture (registry dir ≠ active) → ERROR.
- Adversarial probe: registry entry absent for active dir → drift ERROR fires (proves the invariant is wired, not asserted).

### Phase E — structured endpoint model

**E1. Edge interface** (`context.ts:199`):
```ts
export type EdgeEndpoint =
  | { kind: "item"; substrate_id?: string; oid: string; refname?: string; content_hash?: string }
  | { kind: "lens_bin"; bin: string };
export interface Edge { parent: EdgeEndpoint; child: EdgeEndpoint; relation_type: string; ordinal?: number; }
```
`substrate_id` omitted on an item endpoint = same (active) substrate. `content_hash` present = pinned. `refname` is display-only. **DECISION — lens_bin endpoint omits `lens_id`** (the edge's `relation_type` maps to exactly one lens via config, so the lens is derivable; carrying `lens_id` duplicates state that could drift). (Rejected: A-rearticulation's `{kind:"lens_bin", lens_id, bin}` — self-describing but introduces a second source for the lens that can diverge from `relation_type`'s mapping.)

**E2. relations.schema.json** (`packages/pi-context/schemas/relations.schema.json`, v1.0.0): replace `parent`/`child` string with an object `oneOf` discriminated on `kind` (`item` requires `oid`; `lens_bin` requires `bin`); keep `additionalProperties:false` per branch; bump `version` 1.0.0→2.0.0.
- **AJV `oneOf` probe (closes comparison shared-blocker #3):** A dedicated test (`relations-schema-ajv.test.ts`) compiles `relations.schema.json` through the project's AJV instance + `ajv-formats` config (the same one `schema-validator.ts` builds) and asserts: a valid `{kind:"item",oid}` edge passes; a `{kind:"lens_bin",bin}` edge passes; an edge with both `oid` and `bin` fails the `oneOf` (exactly-one). This proves the draft-07 `oneOf` + `additionalProperties:false` composition actually validates under this repo's AJV — not merely "draft-07-valid" by assertion.

**E3. Producers (plumbing — stay in `context.ts`, no resolution).** Keep signatures structured: `writeRelations`/`appendRelations`/`appendRelation` accept already-structured `Edge[]`. `identityKey` (`:412`) keys on `(parentKey, childKey, relation_type)` where an item endpoint's key is `${substrate_id ?? ""}:${oid}` and a lens_bin's is `bin:${bin}`. Internal + migration + tests call these.

**E4. Porcelain (NEW in `context-sdk.ts`).**
```ts
export function appendRelationByRef(cwd: string, ref: { parent: string | EdgeEndpoint; child: string | EdgeEndpoint; relation_type: string; ordinal?: number }, ctx?: DispatchContext): { appended: boolean };
```
Accepts friendly selectors (`refname`, `<alias>:<refname>`) for `parent`/`child`, resolves each via `resolveRef` (Phase F) into a structured `EdgeEndpoint`, then calls `appendRelation` (plumbing). The Pi `append-relation` tool (`index.ts:996`) and `scripts/orchestrator/append-relation.ts` call the PORCELAIN. Tool params stay friendly strings.

**E5. Consumers (6 `loadRelations` files).** Each reads `edge.parent.kind`/`.oid`/`.bin`. `rename-canonical-id.ts` rewrites by matching `endpoint.kind==="item" && endpoint.oid===…`; since OIDs are stable, **item rename becomes a refname-only update with NO edge rewrite** (the edge rides the OID) — state this simplification.

### Phase F — SubstrateIndex (split lookup/iteration) + resolver + validator wiring

**F1. SubstrateIndex.** Replace `buildIdIndex`'s `Map` return with:
```ts
export interface SubstrateIndex { substrate_id?: string; dir: string; byRefname: Map<string, ItemLocation>; byOid: Map<string, ItemLocation>; items: ItemLocation[]; }
```
`ItemLocation` (`context-sdk.ts:1009`) gains `oid?: string`. Generalize:
```ts
export function buildIdIndexForDir(blockDir: string, cwd: string, cfg: ConfigBlock | null): SubstrateIndex;
export function buildIdIndex(cwd: string): SubstrateIndex; // active-dir wrapper over buildIdIndexForDir (today hardcodes tryResolveContextDir(cwd) :1076)
```
Populate `byRefname` (one entry/refname), `byOid` (one entry/oid), `items` (one entry/item). The 10 lookup sites use the maps; the 8 iteration sites use `.items` — NO double-count. Compatibility: keep `resolveItemById`/`resolveItemsByIds` as wrappers reading `byRefname`/`byOid`; the 8 iteration sites change from `for (const [id, loc] of idIndex)` to `for (const loc of index.items)` (with `loc.id` substituting the destructured key, including `:1431`'s `[sid, sloc]` → `sloc`).

**F2. Resolver.**
```ts
export type ResolveStatus = "active" | "foreign" | "dangling" | "unregistered";
export interface ResolvedRef { status: ResolveStatus; endpointKind: "item" | "lens_bin"; substrate_id?: string; oid?: string; refname?: string; loc?: ItemLocation; }
export function resolveRef(cwd: string, ref: string | EdgeEndpoint): ResolvedRef;
```
Algorithm:
1. lens_bin endpoint → `{status:"active", endpointKind:"lens_bin"}`, no item resolution (validator checks against `lens.bins`).
2. item endpoint WITH a substrate locator (`substrate_id`, or a friendly `<alias>:<refname>` parsed to a substrate_id via `resolveAlias`) → registry lookup. Absent → `"unregistered"`. Present → index that dir via `buildIdIndexForDir` → found `"foreign"` / absent `"dangling"`.
3. item endpoint WITH NO locator (bare oid or bare refname) → active substrate only → `"active"` / `"dangling"`.

**F3. Wire validators.**
- `validateContext` edge loop (`context-sdk.ts:1259-1322`): replace `idIndex.has(edge.parent)`/`.has(edge.child)` (`:1260/:1268`) with `resolveRef(cwd, edge.parent/child)`: `active`/`foreign`/`lens_bin` → no issue; `unregistered`/`dangling` → ERROR. Endpoint-kind check (`:1296-1322`, uses `:1300/:1301`): use `resolveRef(...).loc.block` for item endpoints; skip for lens_bin.
- `validateRelations` (`context.ts:1082`): its inline index is item-only and lens-bin-discriminated at `:1121`/`:1128`. ADD an optional `resolve?: (ref: EdgeEndpoint) => ResolvedRef` param (default = inline behavior, preserved for test callers passing none). `validateContext` supplies a resolver that includes foreign items so cross-substrate children resolve.
- **Clears the 30 errors:** migrated `project:` edges carry `{kind:"item", substrate_id:<.project's id>, oid}` → resolve `foreign` CLEAN via the registry.
- Test: peer substrates A and B registered; an A-edge child `{substrate_id:<B>, oid}` resolving in B → CLEAN(`foreign`); locator naming an unregistered substrate_id → ERROR(`unregistered`); locator into B with absent oid → ERROR(`dangling`).
- Runtime demo (after Phase H): `validateContext('.')` on `.context-jit-spec-v2` → the 30 `does not resolve` errors gone.
- Adversarial probe: remove `.project`'s registry entry → the 30 flip to `unregistered` ERROR (proves locate-then-resolve, not blanket suppression).

**F4. Route other consumers.** `compile.ts:240/:457`, `render-by-id.ts:73`, `execution-context.ts:150/:208`, `index.ts:2170/:2326` tools: call `resolveRef`/`buildIdIndex` so locator-driven foreign resolution works; for OID→refname display, `resolveRef` returns `refname` from `loc.item.id`. Test each with a foreign ref.

### Phase G — promotion (FULLY built; mines Spec A's design, corrected against code)

Cross-substrate promotion = copy an item from one substrate into another. **DECISION — arm (b): new-OID copy in the destination + a `derived-from` lineage edge; source marked superseded.** (Rejected arm (a) same-OID re-home: it relocates birth-provenance and forces a locator-substrate rewrite on every inbound edge.)

**G1. Lineage relation type.** ADD to `samples/conception.json` `relation_types[]` AND each live config:
```json
{ "canonical_id": "item_derived_from_item", "display_name": "derived from", "category": "data_flow", "source_kinds": ["*"], "target_kinds": ["*"] }
```
Direction: `parent` (promoted item) derives from `child` (source item).

**G2. Promotion library.** NEW `packages/pi-context/src/promote-item.ts`:
```ts
export interface PromoteItemInput { source: string; destinationSubstrate: string; newRefname?: string; dryRun?: boolean; }
export interface PromotionResult { source: ResolvedRef; destination: ResolvedRef; lineageEdgeAppended: boolean; dryRun: boolean; }
export function promoteItem(cwd: string, input: PromoteItemInput, ctx?: DispatchContext): PromotionResult;
```
Algorithm (corrects A's `nextId(cwd,…)` bug — uses the DIR-TARGETED forms against the destination):
1. `resolveRef(cwd, input.source)`; throw unless `endpointKind === "item"` and status is `active`/`foreign`.
2. Resolve `input.destinationSubstrate` via `resolveAlias` → `{substrate_id: destId, dir: destDir}`; throw if `unregistered`.
3. Read source content projection (`contentProjection` over the resolved source item — or `getObject(srcDir, source.content_hash)` if pinned).
4. Allocate destination refname: `input.newRefname ?? nextIdForDir(destDir)` (**NOT `nextId(cwd,…)`** — active-bound; this is A's bug). Throw if `newRefname` collides with an existing destination refname.
5. Mint destination OID: `mintOid(destId)` (**dir-targeted mint against the destination substrate_id**, not active).
6. Compute destination `content_hash = computeContentHash(projection)`; `putObject(destDir, content_hash, projection)`.
7. Validate the destination item against the destination live schema (via `appendToBlockForDir`'s validation path); on failure, abort with no writes.
8. `appendToBlockForDir(destDir, <block>, {id:newRefname, oid:newOid, content_hash, ...projection})`.
9. File the lineage edge via the porcelain writer: `{parent:{kind:"item", substrate_id:destId, oid:newOid, refname:newRefname}, child:{kind:"item", substrate_id:srcId, oid:srcOid, refname:srcRefname, content_hash:<pinned source hash>}, relation_type:"item_derived_from_item"}`.
10. Stamp the source item `superseded` (set its `status`/lifecycle field per the source schema's status vocabulary, via `updateItemInBlockForDir` against `srcDir` — preserves source OID, recomputes its content_hash). Existing inbound/outbound edges to the source are NOT retargeted.
`dryRun`: compute steps 1-7's plan (resolve, planned refname, planned oid, planned lineage edge) and write nothing.
- Test: promote a real item between two scratch substrates → destination has a NEW oid (≠ source oid); destination `content_hash` equals the copied projection's hash; lineage edge pins the source content_hash; source unchanged except its superseded flag; `newRefname` collision rejected; destination-schema-validation failure aborts with no writes; dry-run writes nothing.
- Runtime demo: `npx tsx scripts/orchestrator/promote-item.ts --source .subA:DEC-0011 --to .subB --dry-run` then actual run against two scratch substrates; print both substrates' blocks + relations.
- Adversarial probe: after a real promotion, (a) `git diff`/file-read shows source item changed ONLY in its superseded flag + recomputed content_hash; (b) destination carries the new oid + the item; (c) every pre-existing inbound edge to the source still resolves to the source OID (no silent retarget); (d) the lineage edge resolves `foreign`/CLEAN.

**G3. Pi tool + CLI twin.** ADD Pi tool `promote-item` (params `{source, destinationSubstrate, newRefname?, dryRun?}`) calling `promoteItem`; NEW `scripts/orchestrator/promote-item.ts` (`--source --to --new-refname --dry-run`). Both thin over the library.

### Phase H — cross-project migration (`migrateToContentAddressed`)

Mirrors `rename-canonical-id.ts` discipline (deep-clone accumulator, dry-run, atomic, report) BUT writes into EVERY discovered substrate via the Phase-0 `*ForDir` primitives. Dual surface: library `migrate-content-addressed.ts` + Pi tool `migrate-content-addressed` + `scripts/orchestrator/migrate-content-addressed.ts`.
```ts
export interface MigrationReport {
  substrates: { dir: string; substrate_id: string; items_oid_minted: number; items_hashed: number; objects_stored: number; }[];
  edges_rewritten: number; cross_substrate_edges: number; lens_bin_edges_preserved: number;
  dry_run: boolean; unresolved: { substrate: string; ref: string }[];
}
export function migrateToContentAddressed(cwd: string, opts?: { dryRun?: boolean; legacyAliases?: Record<string,string> }): MigrationReport;
```
Ordered idempotent steps:
0. **Fail-fast LIVE-schema check.** Verify each discovered substrate's live `schemas/*.schema.json` declares `oid`/`content_hash`/`content_parent` (Phase C2 must have landed in BOTH samples AND live). Throw otherwise — this is the gate A omitted.
1. **Discover substrates.** `fs.readdirSync(cwd)` filtered to dirs holding `config.json` (`.project`, `.context`, `.context-jit-spec-v2`).
2. **Mint + register substrate_id per substrate** (idempotent: skip if `config.substrate_id` present). Stamp `config.substrate_id` (whole-config `writeBlockForDir` against that dir's config) AND `registerSubstrate`. **Configurable legacy-alias map:** read `opts.legacyAliases` (default `{ "project": <substrate_id of the dir named .project> }`) and record the alias in that substrate's registry `aliases[]`. NOT a baked-in base.
3. **OID backfill** (dir-targeted). Each item lacking `oid` → `item.oid = mintOid(substrate_id)`. Idempotent. Write via `writeBlockForDir` (AJV-validated against the version-bumped LIVE schema).
4. **content_hash + object-store backfill** (dir-targeted). Each item → `content_hash = computeContentHash(contentProjection(...))`; `putObject(dir, hash, projection)` (version 1, no `content_parent`). Deterministic → idempotent.
5. **Convert relation endpoints to structured form.** Per substrate's `relations.json`, per endpoint:
   - bare refname of a same-substrate item → `{kind:"item", oid:<that item's oid>, refname}` (no substrate_id).
   - lens-bin parent (matches a `config.lenses[].bins` entry) → `{kind:"lens_bin", bin}`. **Do NOT OID-rewrite.** Count `lens_bin_edges_preserved`.
   - `project:<refname>` (or any `<alias>:<refname>`) → resolve `<refname>` in the aliased substrate (via the alias map), get its oid + that substrate's substrate_id → `{kind:"item", substrate_id, oid, refname}`. The 30 `project:FGAP-*` endpoints resolve here.
   - unresolvable → `report.unresolved` (BLOCKS completion).
   Write via `writeRelations` (plumbing, structured).
6. **Schema bumps + migration entries.** Ensure each substrate's `migrations.json` carries an identity migration per bumped schema (`appendMigrationDecl`, try/skip on collision so re-run is a no-op).
7. **substrate_id/registry drift check.** Confirm `registry[config.substrate_id].dir` == active contextDir; report drift.

**Atomicity/rollback.** All writes atomic tmp+rename. `dryRun` = zero writes, counts only. Idempotent → crash-recoverable by re-run. The orchestrator prints a `git status --porcelain` reminder if substrate dirs are dirty (clean-tree rollback via `git checkout`).

**Verification gate:**
- Pre/post item count per block equal (no loss); assert in report.
- `edges_rewritten + lens_bin_edges_preserved == pre-migration edge count`; `unresolved` empty.
- Lens-bin edges preserved as `{kind:"lens_bin",bin}` (NOT OID-rewritten).
- 30 `project:FGAP-*` errors cleared: `npx tsx -e "import {validateContext} from '@davidorex/pi-context/context-sdk'; console.log(validateContext('.').issues.filter(i=>i.message.includes('does not resolve')).length)"` → `0`.
- Idempotency: second run reports 0 new mints / 0 edge rewrites / 0 new objects.
- Adversarial (fresh-context agent): re-count items+edges from git HEAD vs post; OIDs 32-hex unique per substrate; object store has one file per distinct content_hash.

---

## Forks resolved (no open forks)

| Fork | Decision | Rejected arm — one-line rationale |
|---|---|---|
| OID derivation | Opaque surrogate from birth-facts | Content-hash-as-OID: every edit changes the join key; edges break on edit. |
| Promotion identity | Arm (b) new-OID copy + lineage; source superseded | Arm (a) same-OID re-home: relocates birth-provenance + forces locator rewrite on every inbound edge. |
| `objects/` in VCS | Track in git | Gitignore: makes `content_parent` ancestry non-durable, collapses to inline-pointer-only (cannot back "content-addressed"). |
| Object-store GC | None; append-only retains version history | GC sweep: deletes the ancestry the store exists to preserve — anti-purpose. |
| lens_bin endpoint shape | `{kind:"lens_bin", bin}` (no `lens_id`) | Carry `lens_id`: duplicates the relation_type→lens mapping; a second source that can drift. |
| Nested-record identity | content_hash on PARENT only; no OID on nested records | OID per nested record: they have no top-level `id`, are not edge endpoints, bloat the store with non-addressable versions. |
| substrate_id storage | config-only SoT | Also on bootstrap pointer: three-copy duplication, drift surface. |
| Cross-substrate write mechanism | `*ForDir` variants + existing fns become wrappers | Thread an optional `substrateDir?` into every signature: changes every call site's arity surface; wrappers preserve zero breakage more cleanly. |

## Ordering hazards (HARD)

- **Phase 0 before Phase H.** The migration writes into non-active substrates; without the `*ForDir` primitives it cannot target them (it would mutate the active substrate's schema-validated files instead). Phase 0 lands first.
- **Resolver-before-edge-rewrite.** Phase F (SubstrateIndex + resolver + validator wiring) lands before Phase H rewrites edges. Rewriting edges while the validator still indexes refnames active-only turns every rewritten cross-substrate edge into a NEW dangling error — strictly worse than today.
- **Schema-bump-before-write.** Phase C2 (item schema fields) lands in BOTH packaged samples AND each live substrate's `schemas/` before the migration writes any item; the migration's step 0 fails fast otherwise (`additionalProperties:false` rejects).
- **substrate_id-before-OID-mint.** `prepareItemIdentityForWrite`→`mintOid` needs the substrate_id (Phase D) before any C3 birth in production; the migration mints substrate_id (step 2) before OID (step 3) — self-consistent.
- **Lineage-relation-type-before-promotion.** Phase G1 (`item_derived_from_item` in config) lands before the promotion tool writes a lineage edge, or the edge fails relation_type validation.
- **Structured-endpoint update set is LARGE — fully enumerated, not under-scoped.** Edge interface (`context.ts:199`) + relations.schema.json (bump 2.0.0) + 3 producers + `identityKey` + 4 producer call sites + 6 consumer files + BOTH validators (`validateContext` `:1259-1322` AND `validateRelations` `:1082` with lens-bin discrimination at `:1121`/`:1128`/`:1159`) + porcelain `appendRelationByRef` + the migration converter.

## Full blast-radius (producer / consumer / validator update set)

- **Producers (plumbing):** `context.ts:400 writeRelations`, `:439 appendRelations`, `:461 appendRelation`, `:412 identityKey`.
- **Producer call sites:** `context.ts:462`, `index.ts:996` (`append-relation` tool → porcelain), `rename-canonical-id.ts`, `scripts/orchestrator/append-relation.ts` → porcelain.
- **Consumers (6 `loadRelations`):** `context-sdk.ts`, `execution-context.ts`, `context.ts`, `rename-canonical-id.ts`, `scripts/orchestrator/append-relation.ts`, `scripts/orchestrator/gather-execution-context.ts`.
- **Validators:** `context-sdk.ts:1234 validateContext` (edge loop `:1259-1322`, lookups `:1260/:1268/:1300/:1301/:1402`, iterations `:674/:702/:725/:774/:1330/:1364/:1394/:1431`) + `context.ts:1082 validateRelations` (lens-bin `:1121`, item `:1128/:1159`).
- **Index/resolver:** `context-sdk.ts:1009 ItemLocation`, `:1032 expectedBlockForId`, `:1074 buildIdIndex`, `:1131 resolveItemById`, `:1166 resolveItemsByIds`.
- **Resolver consumers:** `compile.ts:240/:457`, `render-by-id.ts:73`, `execution-context.ts:150/:208`, `index.ts:2170/:2326` tools.
- **New files:** `content-hash.ts`, `oid.ts`, `object-store.ts`, `context-registry.ts`, `promote-item.ts`, `migrate-content-addressed.ts`, `schemas/context-registry.schema.json`, `scripts/orchestrator/promote-item.ts`, `scripts/orchestrator/migrate-content-addressed.ts`.
- **Edited config/schema:** `package.json` (dep + 2 exports), `config.schema.json` (1.4.0→1.5.0), `relations.schema.json` (1.0.0→2.0.0), 16 item schemas ×(samples + 3 live), `schema-validator.ts:35 FRAMEWORK_SCHEMA_NAMES`, `samples/conception.json` + 3 live configs (lineage relation_type).

## Backward-reference map

- **FGAP-185 (ROOT, `.project`)** — canonical IDs collide across substrates. This spec implements its resolution; closes when Phases 0–H land. Disambiguation satisfied by `oid` + structured `{substrate_id, oid}` item endpoints.
- **FGAP-027 (`.project`)** — rename-orphans-references. OID immutability removes it for the entity layer (refname mutates freely; edges ride the OID); prose-staleness-on-rename stays report-only (consistent with `renameCanonicalId`'s out-of-substrate scan).
- **FGAP-007 (`.project`)** — research-staleness engine. `content_hash` provides the change-detection primitive the engine needs; the engine itself is separate work (not this spec's surface).
- **Validator-error reduction 53→23.** The 30 `project:FGAP-*` `does not resolve` errors (grep-confirmed: 30 endpoints, 20 distinct) clear via the resolver severity split — they become `foreign` CLEAN once Phase H rewrites them to `{kind:"item", substrate_id, oid}` resolvable through the registry. The remaining ~23 are OTHER categories (unregistered relation_types, endpoint-kind mismatches, invariant violations, cycles, lens-validator findings) — addressed by separate substrate-content corrections, not by this identity change.
