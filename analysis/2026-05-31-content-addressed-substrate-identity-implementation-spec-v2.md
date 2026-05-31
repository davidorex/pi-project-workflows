# Content-Addressed Substrate Identity — Implementation + Migration Spec (v2)

Date: 2026-05-31
Repo: /Users/david/Projects/workflowsPiExtension
Pi runtime grounded: `@earendil-works/pi-coding-agent` 0.75.4
Status: implementation prompt. Read-only investigation produced this; no source was edited.

**Supersedes v1** (`analysis/2026-05-31-content-addressed-substrate-identity-implementation-spec.md`). v1's verified §0 findings, enumerations, the `rename-canonical-id.ts` migration precedent, the resolver-before-edge-rewrite ordering hazard, and the schema-bump findings are carried forward (re-verified line numbers below). v1's defective parts are rebuilt, not copied:
- v1 §A2/§B3 contradiction on whether `id`/refname enters the content hash — **resolved**: refname is METADATA, excluded (§2 fix-1).
- v1 "stamp in the autoId branches" — **wrong**; stamping moves into the WRITE PRIMITIVES (§2 fix-2).
- v1 "key idIndex by both refname and oid" — **wrong**; it double-counts every item at the 8 iteration sites. Replaced by `SubstrateIndex` separating lookup maps from the iteration list (§2 fix-3).
- v1's overloaded `<substrate_id>:<oid>` / `project:` / bare-refname STRING endpoint grammar — **replaced** by a structured, kind-discriminated endpoint model with first-class lens bins (§2 fix-4).
- v1 ignored the porcelain/plumbing import-layer split, the lens-bin endpoint kind, and the substrate_id three-copy duplication — all **fixed** (§2 fix-5/6/7) plus a genuine object store (§2 fix-8).

---

## 1. Three identity layers

| Layer | Field | Derivation | Mutability | Visibility | What it is |
|---|---|---|---|---|---|
| **OID** | `oid` | `sha256(canonicalJson([substrate_id, birth_timestamp, nonce])).slice(0,32)` — 32 hex | minted once at item birth, **immutable across edits** | invisible | **Stable opaque entity identity** (a surrogate key). NOT content-derived — do not call the OID "content-addressed". |
| **content_hash** | `content_hash` | `sha256(JCS(content_projection))` — 64 hex | recomputed every mutating write | invisible | **Version identity.** The genuinely content-addressed value; keys the object store. |
| **refname** | `id` | allocated by `nextId` (e.g. `FEAT-005`) | substrate-scoped, freely mutable | **visible** | **Human label** for display/authoring only. |

**Guardrail (binding):** OID birth-facts (`substrate_id + timestamp + nonce`) make it an opaque surrogate, NOT a hash of the body — so editing an item never changes its OID, and the OID is the durable join key for edges. The content-addressed value is `content_hash`, a separate field. The two MUST NOT be conflated; any step that derives the OID from the item body is a spec defect.

## 2. Governing principle

**Machine identity invisible, human selectors visible** (the git standard: SHAs hidden, branch/remote/path names visible).

- Users author and read by **refname** only. `/context init`, normal item writes, `/context switch` are unchanged in their user-visible surface. OID, content_hash, substrate_id, and the object store never surface on the common path.
- Substrates are wholly separate **peers**, each its own identity space, created standalone. They become related only by an explicit edge a user files. References are symmetric; any peer may reference any peer.
- Cross-substrate relating uses a **human selector** — a registry **alias** (e.g. `.project:FGAP-153`, where `project` → a substrate_id) or a `{ substrate: "<alias>", id: "<refname>" }` tool param. A user never types an OID or substrate_id to relate items.
- The registry maps `substrate_id → { dir, aliases[] }`; the resolver locates a referenced item via the registry then resolves it. Pinning rides the edge as an optional `content_hash`.

Acceptance bar: after this lands, the user-visible experience equals today's *plus* "I can relate items across my separate substrates and the references resolve." If any normal-path interaction exposes a hash / OID / substrate_id / object path, that step is rejected and reworked.

---

## 3. §0 critical findings (verified)

- **JCS ABSENT.** `find node_modules -maxdepth 2 -iname "*canonicalize*"` → **0 hits**. Must add the `canonicalize` package (RFC 8785 JCS) to `packages/pi-context/package.json` `dependencies`.
- **`node:crypto` ABSENT in pi-context src.** `grep -rn "node:crypto\|createHash\|randomUUID" packages/pi-context/src/` (minus tests) → **0 hits**. `node:crypto.createHash("sha256")` + `randomUUID()` are built-in (no install).
- **Lens bins are first-class endpoints, not items (LOAD-BEARING).** `context.ts:1121` validates a lens-edge `parent` via `lens.bins.includes(edge.parent)` — a bin LABEL, never an item id — while `context.ts:1128` resolves the `child` as an item (`idIndex.get(edge.child)`). So an edge endpoint is EITHER an item OR a lens bin. `context.ts:1005`/`:1012` confirm: `for (const bin of lens.bins)` and `lens.bins.includes(e.parent)`. The migration MUST NOT OID-rewrite a lens-bin parent.
- **Item-birth/mutation lives in the WRITE PRIMITIVES, not the autoId branches.** The Pi tool `append-block-item` (`index.ts:919` autoId branch) calls `appendToBlock` (`index.ts:936`); the CLI `file-block-item.ts:219` autoId then files via block-api. Both route THROUGH `block-api.ts` primitives. Stamping in the primitive therefore covers the caller-supplied-`id` birth path too (the autoId branch only allocates the refname).
- **`idIndex` is ITERATED for per-item invariants — dual-keying double-counts.** `validateContext` iterates `idIndex` at **8 sites**: `context-sdk.ts:674, :702, :725, :774` (currentState/query helpers) and `:1330` (itemsByBlock build), `:1364` (requires-edge invariant), `:1394` (status-consistency), `:1431` (status-vocab). It does point lookups at `:1260, :1268` (edge has), `:1300, :1301` (endpoint-kind get), `:1402` (status-consistency other-endpoint get). v1's "key by both refname and oid in one Map" inflates every iteration by 2×. Must split lookup maps from the iteration list.
- **Import-layer constraint (verified, `context.ts:428-432`).** `appendRelations` lives in `context.ts`, which imports ONLY block-api; endpoint resolution needs `buildIdIndex` from `context-sdk.ts`, and `context-sdk.ts` imports `context.ts` (one-way). Importing context-sdk into context inverts the graph. Forces the porcelain/plumbing split (§ fix-5).
- **No per-substrate stable id or registry.** `ConfigBlock` (`context.ts:32-48`) has NO `substrate_id`. `config.schema.json` is `additionalProperties:false`, `version 1.4.0` (`packages/pi-context/schemas/config.schema.json`). `.pi-context.json` (`BootstrapPointerExtras` `context-dir.ts:182`) carries `{previous_contextDir, switched_at, switched_by}` only; `bootstrap.schema.json` is `additionalProperties:false`, `version 1.1.0`. No project-root registry exists.
- **`project:` is convention only — no code parses it.** It appears solely as `relations.json` edge endpoints. `buildIdIndex` (`context-sdk.ts:1074`) indexes only the ACTIVE substrate (hardcodes `tryResolveContextDir(cwd)` at `:1076`); `project:FGAP-153` simply fails `idIndex.has(edge.child)` (`:1268`) → the 30 errors.
- **Item schemas: 16; item-level `additionalProperties:false` on 11; permissive on 5.** Permissive: `conventions, rationale, requirements, tasks, verification`. `closed_by`/`closed_at` declared only on `framework-gaps.schema.json`.
- **`rename-canonical-id.ts` is the migration precedent** (deep-clone config accumulator, dry-run, atomic writes, report object, edge `parent`/`child` rewrite at `:115-127`, write-once config). The cross-project migration generalizes it across N substrates.

**No design-canon contradiction found.** Every decided fix below is implementable against the current code.

---

## 4. Grounding inventory

### 4.1 Code surfaces touched

| Surface | file:line | current shape | change |
|---|---|---|---|
| hashing | NEW `content-hash.ts` | — | `canonicalJson`, `sha256Hex`, `computeContentHash` |
| OID mint | NEW `oid.ts` | — | `mintOid(substrateId, bornAt?, nonce?)` |
| object store | NEW `object-store.ts` | — | `putObject/getObject/hasObject` |
| content projection | `block-api.ts:68 SchemaCacheEntry`, `:189 getSchemaCacheEntry`, `:66 AUTHOR_FIELDS` | catalogs author fields | ADD `metadataFields` to cache entry + `contentProjection(schema, arrayKey, item)` |
| identity-stamp primitive | NEW in `block-api.ts` | — | `prepareItemIdentityForWrite(cwd, blockName, item, schema, arrayKey, mode, prior?)` |
| birth/mutation write paths | `block-api.ts:462 appendToTypedFile`, `:536 appendManyToTypedFileIfAbsent`, `:702 updateItemInTypedFile`, `:757 upsertItemInTypedFile`, `:861 appendToNestedTypedFile`, `:920 updateNestedItemInTypedFile`, `:1056 writeBlock`, `:1093 appendToBlock`, `:1178 upsertItemInBlock`, `:1139 updateItemInBlock` | merge/append then `writeTypedFile` | invoke `prepareItemIdentityForWrite` |
| nextId | `block-api.ts:1419` | refname only | **unchanged** (refname-only) |
| item schemas | `samples/schemas/*.schema.json` (16) | varies | ADD `oid`/`content_hash`/`content_parent`; bump version; migration entry |
| Edge interface | `context.ts:199` | `{parent:string, child:string, relation_type, ordinal?}` | endpoints become `EdgeEndpoint` (item | lens_bin) |
| relations schema | `packages/pi-context/schemas/relations.schema.json` (`additionalProperties:false`, v1.0.0, framework-pre-registered) | parent/child = string | endpoints become objects with `oneOf` discriminant; bump version |
| edge writers (plumbing) | `context.ts:400 writeRelations`, `:439 appendRelations`, `:461 appendRelation`, `:412 identityKey` | string endpoints | accept structured endpoints; `identityKey` keys on `(parentOid|bin, childOid|bin, rt)` |
| edge writers (porcelain) | NEW in `context-sdk.ts` | — | `appendRelationByRef` resolves friendly selectors → structured |
| edge consumers | `context-sdk.ts`, `execution-context.ts`, `context.ts`, `rename-canonical-id.ts`, `scripts/orchestrator/append-relation.ts`, `scripts/orchestrator/gather-execution-context.ts` (6 files via `loadRelations`) | read string endpoints | read structured endpoints |
| validators | `context-sdk.ts:1234 validateContext` (edge loop `:1259-1322`), `context.ts:1082 validateRelations` (inline index `:1101-1104`, lens-bin check `:1121`, item check `:1128`) | `idIndex.has`/`.get` on refname | route through resolver; lens bin discriminated |
| substrate index | `context-sdk.ts:1009 ItemLocation`, `:1032 expectedBlockForId`, `:1074 buildIdIndex`, `:1131 resolveItemById`, `:1166 resolveItemsByIds` | active-only `Map<refname,loc>` | `SubstrateIndex` + `buildIdIndexForDir` |
| resolver | NEW in `context-sdk.ts` | — | `resolveRef(cwd, ref): ResolvedRef` |
| substrate_id (config SoT) | `context.ts:32 ConfigBlock`, `config.schema.json`, `:81 AmendRegistry` | absent | ADD `substrate_id?`; bump config schema 1.4.0→1.5.0 |
| substrate_id resolver | NEW in `context-dir.ts` | — | `substrateIdFor(cwd)` (pointer→active dir→`config.substrate_id`); `mintSubstrateId()` |
| registry | NEW project-root `.pi-context-registry.json` + NEW `context-registry.ts` + NEW `schemas/context-registry.schema.json` | absent | `substrate_id → {dir, aliases[]}` |
| resolver consumers | `compile.ts:240/:457`, `render-by-id.ts:73`, `execution-context.ts:150/:208`, `index.ts:2170 resolve-item-by-id`, `:2329 resolve-items-by-ids` tools | `buildIdIndex`/`resolveItemsByIds` (refname) | accept OID or refname; render refname |
| migration | NEW `migrate-content-addressed.ts` + Pi tool + `scripts/orchestrator/migrate-content-addressed.ts` (mirror `rename-canonical-id.ts` + `index.ts:1613 rename-canonical-id` tool + `migrate-canonical-id.ts`) | — | multi-substrate |

### 4.2 Exhaustive enumerations

**Item-birth / mutation write paths** (block-api primitives — grep `export function` in `block-api.ts`, filtered to array-mutating). Every one calls `writeTypedFile`/`writeBlock`; ALL get `prepareItemIdentityForWrite`:
1. `appendToTypedFile` `:462` — birth (append).
2. `appendManyToTypedFileIfAbsent` `:536` — birth (bulk append-if-absent).
3. `updateItemInTypedFile` `:702` — mutation (recompute hash, preserve oid, set content_parent).
4. `upsertItemInTypedFile` `:757` — birth at `idx === -1` (mode at `:778`); mutation otherwise.
5. `appendToNestedTypedFile` `:861` — nested birth. **Decision: nested items are NOT globally addressable** — they are sub-records of their parent item, not top-level block items (`buildIdIndex` `:1100-1106` only indexes items whose array is a direct child of the block object with a string `id`). Stamp `content_hash` on the PARENT item (its content includes the nested array), but mint NO OID/content_hash on the nested record itself. State this in the primitive.
6. `updateNestedItemInTypedFile` `:920` — nested mutation; recompute the PARENT's content_hash only.
7. `writeBlock` `:1056` — whole-file replace; stamp every top-level item lacking `oid`/`content_hash`.
8. Block wrappers `appendToBlock` `:1093`, `updateItemInBlock` `:1139`, `upsertItemInBlock` `:1178` delegate to the typed-file primitives (1-4) — covered transitively, no separate wiring.
`nextId` `:1419` stays refname-only.

**idIndex ITERATION sites** (`for (const [id, loc] of idIndex)` / `idIndex` enumeration): `context-sdk.ts:674, :702, :725, :774, :1330, :1364, :1394, :1431` — **8 sites** → must iterate `SubstrateIndex.items`.

**idIndex LOOKUP sites** (`.has`/`.get`): `context-sdk.ts:690` (depParentsOf `.get`), `:696` (`.has`), `:993` (joinBlocks `.get`), `:1132` (`resolveItemById`), `:1169` (`resolveItemsByIds`), `:1260, :1268` (edge `.has`), `:1300, :1301` (endpoint-kind `.get`), `:1402` (status-consistency `.get`) → use `SubstrateIndex.byRefname` / `byOid`. `buildIdIndex` callers: `:653, :984, :1132, :1169, :1242`, `rename-canonical-id.ts:99`, `compile.ts:240`, `render-by-id.ts:73`.

**Lens-relation endpoint checks** (`lens.bins`): `context.ts:1005, :1012` (lens-grouping), `:1121` (`!lens.bins.includes(edge.parent)`), and item-resolve at `:1128` (`idIndex.get(edge.child)`). The hierarchy block-match checks at `:1145/:1159` resolve BOTH endpoints as items.

**Edge producers**: `context.ts:400 writeRelations`, `:439 appendRelations`, `:461 appendRelation` (+ `:412 identityKey`). Call sites (4): `context.ts:462`, `index.ts:1025` (`append-relation` tool), `rename-canonical-id.ts:129, :204`, `scripts/orchestrator/append-relation.ts:180`.

**Edge consumers** (`loadRelations`, 6 files): `context-sdk.ts`, `execution-context.ts`, `context.ts`, `rename-canonical-id.ts`, `scripts/orchestrator/append-relation.ts`, `scripts/orchestrator/gather-execution-context.ts`.

**Item schemas** (16): context-contracts, conventions*, decisions, features, framework-gaps (only one with `closed_by`/`closed_at`), issues, layer-plans, phase, rationale*, requirements*, research, spec-reviews, story, tasks*, verification*, work-orders. (`*` = item-permissive, no item-level `additionalProperties:false`; the other 11 reject unknown fields until edited.)

**Cross-substrate `project:` sentinels**: `.context-jit-spec-v2/relations.json` → **30 edge endpoints**, **20 distinct** targets: FGAP-115, 151, 153-169, 178 (all `child:"project:FGAP-###"`). These are the 30 validator errors.

---

## 5. Phased implementation steps

Order forced by hazards (see §7). Per CLAUDE.md Completion Sequence, every step = edit → `npm run build` → `npm run check` → `npm test` (no pipe) → runtime-demo → adversarial probe → commit.

### Phase A — content_hash primitives + content/metadata partition

**A1. JCS + crypto helper.** NEW `packages/pi-context/src/content-hash.ts`. Add `"canonicalize": "^2.0.0"` to `packages/pi-context/package.json` dependencies + `@davidorex/pi-context/content-hash` subpath in `exports`.
```ts
export function canonicalJson(value: unknown): string;        // RFC 8785 via canonicalize()
export function sha256Hex(canonical: string): string;         // node:crypto createHash("sha256"), hex
export function computeContentHash(content: Record<string, unknown>): string; // sha256Hex(canonicalJson(content))
```
- Test (`content-hash.test.ts`): key-reorder stable; changing `created_at`/`oid` (as separate inputs) absent from input → no effect by construction.
- Runtime demo: `npx tsx -e "import {computeContentHash} from '@davidorex/pi-context/content-hash'; console.log(computeContentHash({status:'open',title:'x'})===computeContentHash({title:'x',status:'open'}))"` → `true`.
- Adversarial probe: grep that `computeContentHash` is NEVER fed a raw item — only `contentProjection(...)` output.

**A2. Content/metadata partition.** The excluded metadata set: `id`, `oid`, `content_hash`, `content_parent`, plus `AUTHOR_FIELDS` (`block-api.ts:66`: `created_by, created_at, modified_by, modified_at`) plus `closed_by, closed_at`. Everything else is content. **Consequence the spec states:** renaming a refname does NOT change `content_hash`; two items with identical content but different auto-refnames have EQUAL `content_hash` and DISTINCT `oid`.
- Mechanism: optional schema annotation `"x-identity": { "metadata_fields": [...] }` at item-schema level; DEFAULT to the union above when absent (mirrors the existing `x-prompt-budget`/`x-lifecycle` extension-keyword convention on framework-gaps).
- Extend `block-api.ts` cache: ADD `metadataFields: ReadonlySet<string>` to `SchemaCacheEntry` (`:68`), populate in `getSchemaCacheEntry` (`:189`). ADD:
```ts
export function contentProjection(schema: Record<string,unknown>, arrayKey: string, item: Record<string,unknown>): Record<string,unknown>;
```
returning a shallow copy with metadata keys deleted.
- Test: changing `created_at`/`modified_by`/`oid`/`id` on an item → `contentProjection` identical → hash unchanged; changing `status` → hash changes.
- Adversarial probe: assert `id` IS in the deleted set (the v1 contradiction); a fixture with two items identical-but-for-`id` yields equal `computeContentHash(contentProjection(...))`.

### Phase B — content object store

**B1.** NEW `packages/pi-context/src/object-store.ts`. Append-only per-substrate store at `<substrateDir>/objects/<content_hash>.json` holding the canonical content projection of a version.
```ts
export function putObject(cwd: string, substrateDir: string, contentHash: string, content: Record<string,unknown>): void; // atomic tmp+rename; idempotent (skip if hasObject)
export function getObject(cwd: string, substrateDir: string, contentHash: string): Record<string,unknown> | null;
export function hasObject(cwd: string, substrateDir: string, contentHash: string): boolean;
```
- Atomic write mirrors `writeTypedFile` (`block-api.ts:397`, tmp+rename). `objects/` is a machine dir (like `.git/objects`) — ADD `*/objects/` to `.gitignore`? **Decision: track it.** It is the durable Merkle store; losing it loses pinning/integrity. Add `objects/` to the substrate but NOT gitignore (it is small JSON, git-trackable, the point of "content-addressed" durability). State this and add NOTHING to `.gitignore` for it.
- Test: put then get round-trips; put twice = idempotent (one file, no error).
- Runtime demo: `npx tsx -e` put a projection, `hasObject` → true, `getObject` deep-equals.
- Adversarial probe: put two DIFFERENT contents under colliding hash impossible by sha256; assert `getObject(missing)` → null (no throw).

### Phase C — OID mint + item schema fields + write-primitive wiring

**C1. OID mint.** NEW `packages/pi-context/src/oid.ts`:
```ts
import { randomUUID } from "node:crypto";
export function mintOid(substrateId: string, bornAt?: string, nonce?: string): string;
// sha256Hex(canonicalJson([substrateId, bornAt ?? new Date().toISOString(), nonce ?? randomUUID()])).slice(0,32)
```
Export via `@davidorex/pi-context/oid`. (Depends on `substrateIdFor` from Phase D — wire the call there; mint primitive itself takes substrateId as a param so it is testable in isolation.)

**C2. Add fields to all 16 item schemas.** To each item `properties`:
```json
"oid": { "type": "string", "pattern": "^[0-9a-f]{32}$", "description": "Immutable opaque entity identity (surrogate key, NOT content-derived). Minted once at birth." },
"content_hash": { "type": "string", "pattern": "^[0-9a-f]{64}$", "description": "sha256 of canonical content projection; recomputed each mutating write." },
"content_parent": { "type": "string", "pattern": "^[0-9a-f]{64}$", "description": "content_hash of prior version (Merkle ancestry). Absent on version 1." }
```
NOT `required` (legacy items lack them until migrated). Bump each schema `version`. The 11 `additionalProperties:false` schemas MUST be edited before any write carries the fields; the 5 permissive ones still get the declarations (renderers/projection read them). Register an identity migration per bumped schema via `appendMigrationDecl` (`migrations-store.ts:164`) so `validateBlockWithMigration` (`schema-validator.ts:204`) passes legacy blocks forward.

**C3. Single identity-stamp primitive.** ADD to `block-api.ts`:
```ts
export function prepareItemIdentityForWrite(
  cwd: string, blockName: string, item: Record<string,unknown>,
  schemaPath: string | null, arrayKey: string,
  mode: "create" | "update", prior?: Record<string,unknown>,
): Record<string,unknown>;
```
- `create`: if `oid` absent → `mintOid(substrateIdFor(cwd))`; compute `content_hash = computeContentHash(contentProjection(schema, arrayKey, item))`; store object via `putObject`; no `content_parent`.
- `update`: assert `item.oid === prior.oid` (throw on attempted change — OID immutable); recompute `content_hash`; if changed from `prior.content_hash` set `content_parent = prior.content_hash` and `putObject` the new version.
Invoke from EVERY path in §4.2 (1-7). The autoId branches (`index.ts:919`, `file-block-item.ts:219`) keep allocating the refname only; the primitive stamps oid+hash inside `appendToBlock` etc. A caller-supplied `id` birth is covered because stamping is in the primitive.
- Test: append fresh item via `appendToBlock` → `oid` 32-hex, `content_hash` 64-hex, `id` refname, all distinct; object present in store.
- Runtime demo: `file-block-item.ts --block framework-gaps --auto-id --dry-run` against a scratch substrate; item carries all three.
- Adversarial probes: (a) append same content twice → DISTINCT oid, EQUAL content_hash; (b) `updateItemInBlock(..., {oid:"deadbeef…"})` → throws; (c) update a metadata field only → content_hash UNCHANGED, no new object; (d) update a content field → content_hash changes, content_parent == old hash, new object stored.

### Phase D — substrate_id (config source-of-truth) + registry(+aliases)

**D1. config SoT.** `config.schema.json`: ADD `"substrate_id": {"type":"string","pattern":"^sub-[0-9a-f]{16}$"}` (additive, NOT required); bump `version` 1.4.0→1.5.0. `ConfigBlock` (`context.ts:32`): add `substrate_id?: string`. Add `"substrate_id"` to `AmendRegistry`? — it is a SCALAR, not a registry array; mutate via whole-config write (mirror `schema_version`/`root` exclusion at `context.ts:78`). State: NOT an AmendRegistry target.
ADD to `context-dir.ts`: `mintSubstrateId()` → `"sub-" + sha256Hex(canonicalJson([Date.now(), randomUUID()])).slice(0,16)`; `substrateIdFor(cwd)` reads the active dir via the pointer (`resolveContextDir`), then reads that dir's `config.json` `substrate_id` (throws if absent post-migration).
**The bootstrap pointer does NOT store substrate_id** (no `bootstrap.schema.json` edit — removes v1's three-copy duplication).

**D2. Registry.** NEW `<cwd>/.pi-context-registry.json` + NEW `schemas/context-registry.schema.json` ($id `pi-context://schemas/context-registry`), pre-registered by adding `"context-registry"` to `FRAMEWORK_SCHEMA_NAMES` (`schema-validator.ts:35`):
```json
{ "version": "1.0.0",
  "substrates": { "<substrate_id>": { "dir": ".context-jit-spec-v2", "aliases": [] } } }
```
NEW `packages/pi-context/src/context-registry.ts` (mirror `migrations-store.ts`): `loadRegistry(cwd)`, `writeRegistry(cwd, ...)` (atomic), `registerSubstrate(cwd, substrate_id, dir, aliases?)`, `resolveSubstrateDir(cwd, substrate_id)`, `resolveAlias(cwd, alias): substrate_id|null`.
**substrate_id SoT invariant:** `registry[config.substrate_id].dir === resolved active contextDir`. ADD this check to `validateContext`; report drift as ERROR.
- Test: register two substrates with an alias; `resolveAlias("project")` → the right substrate_id; rename a dir in the registry → `resolveSubstrateDir` returns new dir for unchanged id; SoT-drift fixture (registry dir ≠ active) → ERROR.

### Phase E — structured endpoint model

**E1. Edge interface** (`context.ts:199`):
```ts
export type EdgeEndpoint =
  | { kind: "item"; substrate_id?: string; oid: string; refname?: string; content_hash?: string }
  | { kind: "lens_bin"; bin: string };
export interface Edge { parent: EdgeEndpoint; child: EdgeEndpoint; relation_type: string; ordinal?: number; }
```
`substrate_id` omitted on an item endpoint = same (active) substrate. `content_hash` present = pinned. `refname` is display-only.

**E2. relations.schema.json** (`packages/pi-context/schemas/relations.schema.json`, framework-pre-registered): replace `parent`/`child` string with an object `oneOf` discriminated on `kind` (`item` requires `oid`; `lens_bin` requires `bin`); keep `additionalProperties:false` per branch; bump `version` 1.0.0→2.0.0.

**E3. Producers (plumbing — stay in `context.ts`, no resolution).** Rename for clarity, keep signatures structured: `writeRelationsRaw`/`appendRelationsRaw`/`appendRelationRaw` accept already-structured `Edge[]`. `identityKey` (`:412`) keys on `(parentKey, childKey, relation_type)` where an item endpoint's key is `${substrate_id ?? ""}:${oid}` and a lens_bin's is `bin:${bin}`. Internal + migration + tests call these.

**E4. Porcelain (NEW in `context-sdk.ts` — the layer that CAN import resolution).**
```ts
export function appendRelationByRef(cwd: string, ref: { parent: string | EdgeEndpoint; child: string | EdgeEndpoint; relation_type: string; ordinal?: number }): { appended: boolean };
```
Accepts friendly selectors (`refname`, `<alias>:<refname>`) for `parent`/`child`, resolves each via `resolveRef` (Phase F) into a structured `EdgeEndpoint`, then calls `appendRelationRaw`. The Pi `append-relation` tool (`index.ts:1004-1025`) and `scripts/orchestrator/append-relation.ts:180` call the PORCELAIN. (Tool params stay friendly strings — `index.ts:1005-1010` `parent`/`child` strings — porcelain parses them.)

**E5. Consumers (6 `loadRelations` files).** Each reads `edge.parent.kind`/`.oid`/`.bin`. `rename-canonical-id.ts:115-127` rewrites by matching `endpoint.kind==="item" && endpoint.oid===…` (it no longer matches refnames — OIDs are stable so item rename is now a refname-only update with NO edge rewrite; state this simplification).

### Phase F — SubstrateIndex (split lookup/iteration) + resolver + validator wiring (BEFORE edge rewrite)

**F1. SubstrateIndex.** Replace `buildIdIndex`'s `Map` return with:
```ts
export interface SubstrateIndex { substrate_id?: string; byRefname: Map<string, ItemLocation>; byOid: Map<string, ItemLocation>; items: ItemLocation[]; }
```
`ItemLocation` (`context-sdk.ts:1009`) gains `oid?: string`. Generalize:
```ts
export function buildIdIndexForDir(blockDir: string, cwd: string, cfg: ConfigBlock | null): SubstrateIndex;
export function buildIdIndex(cwd: string): SubstrateIndex; // active-dir wrapper over buildIdIndexForDir
```
(today `buildIdIndex` hardcodes `tryResolveContextDir(cwd)` at `:1076`). Populate `byRefname` (one entry/refname), `byOid` (one entry/oid), `items` (one entry/item). Lookups (`resolveItemById` `:1131`, `resolveItemsByIds` `:1166`, the validator `.has`/`.get` sites) use the maps; the 8 iteration sites use `.items` (one entry per item — NO double-count).

**F2. Resolver.**
```ts
export type ResolveStatus = "active" | "foreign" | "dangling" | "unregistered";
export interface ResolvedRef { status: ResolveStatus; endpointKind: "item" | "lens_bin"; substrate_id?: string; oid?: string; refname?: string; loc?: ItemLocation; }
export function resolveRef(cwd: string, ref: string | EdgeEndpoint): ResolvedRef;
```
Algorithm:
1. lens_bin endpoint → `{status:"active", endpointKind:"lens_bin"}`, no item resolution (validator checks against `lens.bins`).
2. item endpoint WITH a substrate locator (`substrate_id`, or a friendly `<alias>:<refname>` parsed to a substrate_id) → registry lookup. Absent → `"unregistered"`. Present → index that dir via `buildIdIndexForDir` → found `"foreign"` / absent `"dangling"`.
3. item endpoint WITH NO locator (bare oid or bare refname) → active substrate only → `"active"` / `"dangling"`.

**F3. Wire validators.**
- `validateContext` edge loop (`context-sdk.ts:1259-1322`): replace `idIndex.has(edge.parent)`/`.has(edge.child)` with `resolveRef(cwd, edge.parent/child)`: `active`/`foreign`/`lens_bin` → no issue; `unregistered`/`dangling` → ERROR. Endpoint-kind check (`:1296-1322`): use `resolveRef(...).loc.block` for item endpoints; skip for lens_bin.
- `validateRelations` (`context.ts:1082`): its inline `idIndex` (`:1101-1104`) is item-only and lens-bin-discriminated at `:1121`/`:1128`. ADD an optional `resolve?: (ref: EdgeEndpoint) => ResolvedRef` param (default = inline behavior preserved for test callers passing none). `validateContext` supplies a resolver that includes foreign items so cross-substrate children resolve.
- **Clears the 30 errors:** migrated `project:` edges carry `{kind:"item", substrate_id:<.project's id>, oid}` → resolve `foreign` CLEAN via the registry.
- Test: peer substrates A and B registered; an A-edge child `{substrate_id:<B>, oid}` resolving in B → CLEAN(`foreign`); locator naming an unregistered substrate_id → ERROR(`unregistered`); locator into B with absent oid → ERROR(`dangling`).
- Runtime demo (after Phase G): `validateContext('.')` on `.context-jit-spec-v2` → the 30 `does not resolve` errors gone.
- Adversarial probe: remove `.project`'s registry entry → the 30 flip to `unregistered` ERROR (proves locate-then-resolve, not blanket suppression).

**F4. Route other consumers.** `compile.ts:240/:457`, `render-by-id.ts:73`, `execution-context.ts:150/:208`, `index.ts:2170/:2329` tools: call `resolveRef`/`buildIdIndex` so locator-driven foreign resolution works; for OID→refname display, `resolveRef` returns `refname` from `loc.item.id`. Test each with a foreign ref.

### Phase G — cross-project migration (§6)

### Phase H — promotion layer (NAMED, deferred; §7 fork)

Not built this arc. The "promote an item from one substrate into another" merge operation; fork resolved in §7.

---

## 6. Cross-project migration (`migrateToContentAddressed`)

Mirrors `rename-canonical-id.ts` discipline (deep-clone accumulator, dry-run, atomic writes, report). Dual surface:
- Library NEW `migrate-content-addressed.ts`:
```ts
export interface MigrationReport {
  substrates: { dir: string; substrate_id: string; items_oid_minted: number; items_hashed: number; objects_stored: number; }[];
  edges_rewritten: number; cross_substrate_edges: number; lens_bin_edges_preserved: number;
  dry_run: boolean; unresolved: { substrate: string; ref: string }[];
}
export function migrateToContentAddressed(cwd: string, opts?: { dryRun?: boolean; legacyAliases?: Record<string,string> }): MigrationReport;
```
- Pi tool `migrate-content-addressed` (mirror `rename-canonical-id` registration `index.ts:1613`).
- Orchestrator `scripts/orchestrator/migrate-content-addressed.ts` (mirror `migrate-canonical-id.ts`).

Ordered idempotent steps:
0. **Fail-fast schema check.** Verify each target substrate's `schemas/*.schema.json` declares `oid`/`content_hash`/`content_parent` (Phase C2 must have landed in BOTH samples AND live substrate schemas). Throw otherwise.
1. **Discover substrates.** `fs.readdirSync(cwd)` filtered to dirs holding `config.json` (e.g. `.project`, `.context`, `.context-jit-spec-v2`).
2. **Mint + register substrate_id per discovered substrate** (idempotent: skip if `config.substrate_id` present). Stamp `config.substrate_id` (whole-config write) AND `registerSubstrate`. **Legacy-alias map**: read `opts.legacyAliases` (default `{ "project": <substrate_id of the dir named .project> }`) and record the alias in that substrate's registry entry `aliases[]`. This is configurable alias resolution, NOT a baked-in base.
3. **OID backfill.** Each item lacking `oid` → `item.oid = mintOid(substrate_id)`. Idempotent. Write via `writeBlock` (AJV-validated against the version-bumped schema).
4. **content_hash + object-store backfill.** Each item → `content_hash = computeContentHash(contentProjection(...))`; `putObject` (version 1, no `content_parent`). Deterministic → idempotent.
5. **Convert relation endpoints to structured form.** For each substrate's `relations.json`, per endpoint:
   - bare refname of an active-substrate item → `{kind:"item", oid:<that item's oid>, refname}` (no substrate_id = same substrate).
   - lens-bin parent (matches a `config.lenses[].bins` entry) → `{kind:"lens_bin", bin}`. **Do NOT OID-rewrite.** Count to `lens_bin_edges_preserved`.
   - `project:<refname>` (or any `<alias>:<refname>`) → resolve `<refname>` in the aliased substrate, get its oid + that substrate's substrate_id → `{kind:"item", substrate_id, oid, refname}`. The 30 `project:FGAP-*` endpoints resolve here.
   - unresolvable → `report.unresolved` (BLOCKS completion).
   Write via `writeRelationsRaw`.
6. **Schema bumps + migration entries.** Ensure each substrate's `migrations.json` carries an identity migration per bumped schema (`appendMigrationDecl`, wrap collision-throw in try/skip so re-run is a no-op).
7. **substrate_id into active config + SoT/registry drift check.** Confirm `registry[config.substrate_id].dir` == active contextDir; report drift.

**Atomicity/rollback.** All writes atomic tmp+rename (`writeTypedFile` `block-api.ts:397`, object-store, registry). `dryRun` = zero writes, counts only. Idempotent → crash-recoverable by re-run. Orchestrator prints a `git status --porcelain` reminder if substrate dirs are dirty (clean-tree rollback via `git checkout`).

**Verification gate:**
- Pre/post item count per block equal (no loss); assert in report.
- Every pre-migration edge has a post counterpart; `edges_rewritten + lens_bin_edges_preserved == pre-migration edge count`; `unresolved` empty.
- Lens-bin edges preserved as `{kind:"lens_bin",bin}` (NOT OID-rewritten).
- 30 `project:FGAP-*` errors cleared: `npx tsx -e "import {validateContext} from '@davidorex/pi-context/context-sdk'; console.log(validateContext('.').issues.filter(i=>i.message.includes('does not resolve')).length)"` → `0`.
- Idempotency: second run reports 0 new mints / 0 edge rewrites / 0 new objects.
- Adversarial (fresh agent): re-count items+edges from git HEAD vs post; OIDs 32-hex unique per substrate; object store has one file per distinct content_hash.

---

## 7. Open forks, risks, ordering hazards

**Promotion-OID fork (RECOMMEND arm b).**
- Arm (a) same-OID re-home: item keeps OID, moves files; every inbound cross-substrate edge's locator must rewrite `<old_substrate_id>` → `<new_substrate_id>`. Code consequence: a locator-substrate rewrite per inbound edge; OID birth-provenance no longer matches home.
- Arm (b) new-OID copy + lineage **(RECOMMENDED)**: mint a fresh OID in the destination via `mintOid(destSubstrateId)`; file a `derived-from` edge `{parent:{kind:item,oid:newOid}, child:{kind:item, substrate_id:src, oid:oldOid, content_hash:<pinned>}}`; mark source superseded. Code consequence: a `promoteItem` primitive (copies content projection, mints OID, `putObject`, files the pinned `derived-from` edge); +1 lineage edge per promotion. Preserves clean per-substrate birth-provenance and gives explicit Merkle lineage matching the content_hash design. Reserved for Phase H.

**Ordering hazards (HARD):**
- **Resolver-before-edge-rewrite.** Phase F (SubstrateIndex + resolver + validator wiring) MUST land before Phase G rewrites edges. If edges were rewritten while the validator still indexed refnames active-only, every rewritten cross-substrate edge becomes a NEW dangling error — strictly worse than today.
- **Schema-bump-before-write.** Phase C2 (item schema fields) must land in BOTH packaged samples AND each live substrate's `schemas/` before the migration writes any item; the migration's step 0 fails fast otherwise (`additionalProperties:false` would reject).
- **substrate_id-before-OID-mint.** `prepareItemIdentityForWrite`→`mintOid` needs `substrateIdFor(cwd)` → Phase D before any C3 birth in production; the migration mints substrate_id (step 2) before OID (step 3), self-consistent.
- **Structured-endpoint migration is LARGE — not under-scoped.** The full update set: Edge interface (`context.ts:199`) + relations.schema.json (bump 2.0.0) + 3 producers (`writeRelations`/`appendRelations`/`appendRelation` + `identityKey`) + 4 producer call sites + 6 consumer files + BOTH validators (`validateContext` edge loop `:1259-1322` AND `validateRelations` `:1082` with lens-bin discrimination at `:1121`/`:1128`) + the porcelain layer + the migration converter. All listed in §4.2/§5-E.

**AJV/schema constraints:** none block the plan. `additionalProperties:false` handled by additive-then-bump (precedent: framework-gaps version history). The relations `oneOf` discriminant is draft-07-valid.

**ABSENT surfaces (built from scratch):** `canonicalize` dep; `node:crypto` usage; `object-store.ts`; `.pi-context-registry.json` + schema + `context-registry.ts`; `config.substrate_id`; `oid`/`content_hash`/`content_parent` on 16 schemas; `buildIdIndexForDir` (today hardcodes active dir `context-sdk.ts:1076`); `resolveRef` + `SubstrateIndex`; structured `EdgeEndpoint`; porcelain `appendRelationByRef`.

---

## 8. Backward-reference map

- **FGAP-185 (ROOT, `.project`)** — canonical IDs collide across substrates. This spec implements its resolution; closes when Phases A–G land. Disambiguation satisfied by `oid` + structured `{substrate_id, oid}` item endpoints.
- **FGAP-027 (`.project`)** — rename-orphans-references. OID immutability removes it for the entity layer (refname mutates freely; edges ride the OID); prose-staleness-on-rename stays report-only (consistent with `renameCanonicalId`'s out-of-substrate scan).
- **FGAP-007 (`.project`)** — research-staleness engine. `content_hash` provides the change-detection primitive the engine needs; not closed by this arc (the engine is separate work).
- **Validator-error reduction 53→23.** The 30 `project:FGAP-*` `does not resolve` errors (grep-confirmed: 30 endpoints, 20 distinct targets) clear via the resolver severity split (become `foreign` CLEAN once migration rewrites them to `{kind:item, substrate_id, oid}` resolvable via the registry). The remaining ~23 are OTHER categories (unregistered relation_types, endpoint-kind mismatches, invariant violations, cycles, lens-validator findings) — NOT addressed by this change; they stay open.
