# Content-Addressed Substrate Identity — Implementation + Migration Specification

Date: 2026-05-31
Repo: /Users/david/Projects/workflowsPiExtension
Pi runtime grounded: `@earendil-works/pi-coding-agent` **0.75.4** (`node_modules/@earendil-works/pi-coding-agent/package.json:version`)
Status: implementation prompt. Read-only investigation produced this; no source was edited.

This separates the single overloaded identity string (the canonical_id / refname, e.g. `FEAT-005`) into three layers (OID / content-hash / refname) mirroring git, adds a substrate-locator layer (substrate_id + a flat registry peer-directory), and routes all ID resolution through one shared resolver carrying the fsck broken-vs-dangling severity split. Every step below is self-contained: exact file, exact function/signature, exact data shape, exact test, exact runtime-demo, exact adversarial probe.

---

## Governing principle (BINDING — overrides any step below that conflicts)

**Total invisibility.** Every mechanism this spec introduces — OID minting, content-hash, JCS canonicalization, substrate_id, the registry (a flat peer directory), the resolver — lives entirely below the surface. The user never sees, types, or manages a hash, an OID, a substrate_id, or a registry entry. This is the `git init` standard: a content-addressed object store with integrity and history appears, and the linear single-branch user never types a SHA. Any implementation step whose test, demo, or normal-path UX requires the user to see or supply machine identity is a **spec defect**, not a feature.

**The command surface does not grow for the common path.** It stays exactly:
- `/context init <dir>` — creates a standalone substrate. Behind the scenes: mints `substrate_id`, records it in the registry (the project's flat peer directory of substrates), writes the bootstrap pointer, scaffolds schemas. User sees "substrate created." Nothing about identity.
- author items normally (`append-block-item` / `file-block-item` / block-api) — behind the scenes: OID minted, `content_hash` computed, parent-version linked. The user authors and reads by **refname** (`FEAT-005`) only, exactly as today.
- `/context switch <dir>` — unchanged.

**Wholly separate, inter-relateable on demand.** Substrates are independent peers — each its own identity space, created standalone. Substrates become related by a **deliberate act**: relating an item in one substrate to an item in another creates a cross-substrate reference edge carrying the target's `(substrate_id, OID)` locator. Relatability is inherent and symmetric — any peer may reference any peer, including mutually. The registry is a flat **peer directory** (`substrate_id → location`). The shared resolver locates a referenced item's substrate via the registry and resolves its OID; the severity split is **target-exists → CLEAN vs target-genuinely-absent → ERROR**. A cross-substrate reference comes into being when, and only when, the user relates two items.

**The phases below implement this peer model directly:** §D propagates each substrate's `substrate_id`; §E's registry is a flat peer directory (`substrate_id → dir`; per-reference pinning rides the edge); §F's resolver locates a referenced substrate via the registry and reports locate-then-exists/absent. A cross-substrate reference is legitimate by virtue of being created — it carries its own `(substrate_id, OID)` locator.

**Acceptance bar for the whole change:** after it lands, the user-visible experience is identical to before *plus* "I can relate items across my separate substrates and the references just work." No normal-path interaction exposes machine identity (hash / OID / substrate_id / registry); if one does, that step is rejected and reworked. Best-of-breed *and* simple is the requirement, not a trade-off.

---

## 0. Critical findings up front (read before scoping)

- **JCS is ABSENT.** No `canonicalize`, no `json-canonicalize` in `node_modules` (grep: `find node_modules -maxdepth 2 -iname "*canonicalize*"` → 0 hits). **No `node:crypto` usage anywhere in `packages/pi-context/src`** (grep `node:crypto|createHash|randomUUID` → 0 non-test hits). Both must be added: a JCS package + `node:crypto` (built-in, no install). Recommended package: **`canonicalize`** (RFC 8785 JCS, zero-dep, ESM+CJS, ~30 LOC) added to `packages/pi-context/package.json` `dependencies`. `node:crypto.createHash("sha256")` provides the digest.
- **No per-substrate stable id or registry exists.** `ConfigBlock` (`context.ts:32-48`) has NO `substrate_id` field; `config.schema.json` is `additionalProperties: false` at top level (`config.schema.json:9`), so adding `substrate_id` is net-new and **requires a config schema edit + version bump** (currently `1.4.0`, `config.schema.json:4`). No project-root registry maps substrate→dir today; resolution is single-active-substrate only. The flat peer-directory registry is net-new.
- **No substrate_id exists.** `.pi-context.json` carries `{contextDir, version, created_at, previous_contextDir?, switched_at?, switched_by?}` only (`bootstrap.schema.json`, verified against live `.pi-context.json`). `bootstrap.schema.json` is `additionalProperties: false`. Adding `substrate_id` **requires a bootstrap schema edit + version bump** (currently `1.1.0`).
- **The `project:` cross-substrate sentinel is NOT handled by any resolver today.** It is a bare string prefix that appears only as edge endpoints in `relations.json` and as free text in some block bodies. `buildIdIndex` (`context-sdk.ts:1074`) indexes only the ACTIVE substrate; `project:FGAP-153` simply fails `idIndex.has(edge.child)` (`context-sdk.ts:1268`) → the 30 "does not resolve" errors. There is no code that parses `project:` — it is convention only. The migration must teach the resolver this prefix's successor (OID + substrate_id locator).
- **11 of 16 sample item schemas are `additionalProperties: false`** (grep). Adding `oid`/`content_hash`/`content_parent` fields to items **requires editing each schema + bumping its `version` + registering a migration**. The 5 permissive ones (conventions, issues, phase, rationale, requirements, tasks, verification — those with `created_by_count=0` and no `additionalProperties:false` block on the item) still need the fields added to `properties` for the renderer/validator to read them, but won't AJV-reject if absent.
- **The exact `renameCanonicalId` engine (`rename-canonical-id.ts`) is the precedent to mirror for the migration** — it already does item-id + edge `parent`/`child` rewrites with dry-run, deep-clone config accumulator, atomic writes, and out-of-substrate report-only scanning. The cross-project migration is a generalization of this engine across N substrates.

**No design-canon contradiction found.** The guardrail (identity ≠ content hash) is satisfiable: OID is birth-hash, content_hash is a separate field. Edges point at OID. One ordering hazard exists (resolver severity-split must NOT depend on edges already being OID-rewritten — see §4). No AJV constraint blocks the plan beyond the schema-edit-then-bump discipline already in place.

---

## 1. Grounding inventory

### 1.1 Code surfaces touched

| Surface | file:line | current signature / shape | change |
|---|---|---|---|
| OID/hash minting | `block-api.ts:1419 nextId(cwd, blockName): string` | allocates refname only | ADD `mintOid()` + `computeContentHash()` library fns; `nextId` unchanged (still mints refname) |
| auto-id write (tool) | `index.ts:918-920` (`append-block-item`, autoId branch) | sets `item.id = nextId(...)` | ALSO mint+stamp `oid`, compute `content_hash` |
| auto-id write (CLI) | `scripts/orchestrator/file-block-item.ts:217-219` | sets `item.id = nextId(...)` | same as above (dual-surface twin) |
| upsert/update writes | `block-api.ts:702 updateItemInTypedFile`, `:757 upsertItemInTypedFile`, `:462 appendToTypedFile` | merge/append, then `writeTypedFile` | recompute `content_hash` on every write; preserve `oid`; refname→OID resolution at this boundary |
| envelope/attestation partition | `block-api.ts:66 AUTHOR_FIELDS`, `:108 schemaTopLevelDeclaredAuthorFields`, `:134 collectArrayItemAuthorDecisions` | catalogs author fields per array key | ADD a parallel `content_fields` partition catalog (complement of metadata) used by hash |
| shared resolver | `context-sdk.ts:1074 buildIdIndex(cwd): Map<string,ItemLocation>` + `:1032 expectedBlockForId` + `:1131 resolveItemById` + `:1166 resolveItemsByIds` | active-substrate-only index keyed by refname | REPLACE/WRAP with cross-substrate, OID-aware resolver carrying severity split |
| edge integrity validator | `context-sdk.ts:1234 validateContext` (edge loop `:1259-1283`) | `idIndex.has(edge.parent/child)` → ERROR | route through shared resolver; item resolved in active or via registry locator → CLEAN, unregistered-substrate/absent → ERROR |
| relations validator | `context.ts:1082 validateRelations` (`idIndex` Map `:1101-1104`) | active-substrate refname index | same severity split |
| edge endpoint kind check | `context-sdk.ts:1296-1322` | `idIndex.get(edge.parent/child).block` | resolve cross-substrate via shared resolver |
| Edge shape | `context.ts:199 interface Edge {parent,child,relation_type,ordinal?}` | refname endpoints | endpoints become OID (refname retained for display via resolver) |
| relations.json schema | `schemas/relations.schema.json` (`additionalProperties:false`) | parent/child = string | endpoints carry `<substrate_id>:<oid>` locator (bare OID for same-substrate); optional per-edge pinned `content_hash`; optional `parent_refname`/`child_refname` for display; bump version |
| writeRelations / appendRelations | `context.ts:400`, `:439 appendRelations`, `:461 appendRelation` | whole-array / append-if-absent | unchanged signature; identityKey (`:412`) becomes OID-triple |
| substrate_id storage | `context-dir.ts:182 BootstrapPointerExtras`, `:211 writeBootstrapPointer`, `:281 flipBootstrapPointer`, `bootstrap.schema.json` | no substrate_id | ADD `substrate_id` to pointer + schema; mint on init |
| substrate_id in config | `context.ts:32 ConfigBlock`, `config.schema.json` | no `substrate_id` | ADD `substrate_id?: string` (additive; bump config schema); stamped at init + migration for self-identification + discovery |
| registry (peer directory) | ABSENT | — | NEW project-root file `.pi-context-registry.json` (`substrate_id → {dir}`); flat peer locator |
| migration-aware read | `schema-validator.ts:204 validateBlockWithMigration` + `block-api.ts:324-330 readBlock` hook | runs migrations on schema_version mismatch | migrations populate `oid`/`content_hash` on read-forward for legacy blocks (backfill path) |
| refname↔OID render sites | `pi-jit-agents/src/compile.ts:240,457`; `pi-workflows/src/render-by-id.ts:73`; `execution-context.ts:150,208`; `index.ts:2185 resolve-item-by-id`, `:2343 resolve-items-by-ids` | call `buildIdIndex`/`resolveItemsByIds` with refname | call shared resolver; accept OID or refname; render refname for display |
| dual-surface migration | mirror `rename-canonical-id.ts` + `scripts/orchestrator/migrate-canonical-id.ts` + `index.ts:1610 rename-canonical-id tool` | per-substrate rename | NEW `migrateToContentAddressed` lib + Pi tool + orchestrator script, multi-substrate |

### 1.2 Exhaustive enumerations (grep terms + counts)

**ID-resolution call sites** — grep `buildIdIndex(|resolveItemById(|resolveItemsByIds(|expectedBlockForId(` across `packages/*/src/*.ts` excluding tests and the definitions themselves → **16 hits, 9 of which are live call sites** (rest are the 4 definitions + comments):
1. `context-sdk.ts:653` (`buildIdIndex` in a query fn — gatherer)
2. `context-sdk.ts:984` (`buildIdIndex` in `joinBlocks` EDGE mode)
3. `context-sdk.ts:1108` (`expectedBlockForId` inside `buildIdIndex`)
4. `context-sdk.ts:1132` (`buildIdIndex` inside `resolveItemById`)
5. `context-sdk.ts:1169` (`buildIdIndex` inside `resolveItemsByIds`)
6. `context-sdk.ts:1242` (`buildIdIndex` inside `validateContext`)
7. `execution-context.ts:150` + `:208` (`resolveItemsByIds`)
8. `rename-canonical-id.ts:99` (`buildIdIndex`)
9. `index.ts:2185` (`resolveItemById` tool) + `:2343` (`resolveItemsByIds` tool)
10. `pi-jit-agents/src/compile.ts:240` (`buildIdIndex` for contextBlocks item resolution)
11. `pi-workflows/src/render-by-id.ts:73` (`buildIdIndex`)

Plus `validateRelations` builds its OWN parallel refname index inline (`context.ts:1101-1104`) — a 10th resolution surface that must route through the shared resolver.

**Item schemas** — `packages/pi-context/samples/schemas/*.schema.json` → **16 schemas**. id-pattern + author-field presence:

| schema | id pattern | has created_by | additionalProperties:false on item |
|---|---|---|---|
| context-contracts | `^CTX-\d{3,}$` | yes | yes |
| conventions | (slug, no pattern) | no | no |
| decisions | `^DEC-\d{4}$` | yes | yes |
| features | `^FEAT-\d{3}$` | yes | yes |
| framework-gaps | `^FGAP-\d{3}$` | yes | yes |
| issues | `^issue-\d{3}$` | no | (check) |
| layer-plans | `^PLAN-\d{3}$` | yes | yes |
| phase | (PHASE-NNN, no item pattern) | no | (check) |
| rationale | `^RAT-\d{3}$` | no | (check) |
| requirements | `^REQ-\d{3,}$` | no | (check) |
| research | `^R-\d{4}$` | yes | yes |
| spec-reviews | `^REVIEW-\d{3}$` | yes | yes |
| story | `^STORY-\d{3,}$` | (one) | (check) |
| tasks | `^TASK-\d{3,}$` | no | (check) |
| verification | `^VER-\d{3,}$` | no | (check) |
| work-orders | `^WO-\d{3,}$` | (one) | (check) |

All 16 need `oid` + `content_hash` (+ optional `content_parent`) added to `properties`; the 11 `additionalProperties:false` ones additionally REJECT writes carrying the new fields until edited. Each edited schema bumps `version` and gets a migration-registry entry.

**Edge producers** — grep `writeRelations|appendRelations|appendRelation|appendManyToTypedFileIfAbsent.*relations`:
- `context.ts:400 writeRelations`, `:439 appendRelations`, `:461 appendRelation` (library)
- `rename-canonical-id.ts:129,204` (calls `writeRelations`)
- `index.ts:1025` (`append-relation` tool → `appendRelation`)
- `scripts/orchestrator/append-relation.ts:180` (CLI → `appendRelation`)
→ **2 write primitives + 1 append primitive + 1 append-single, consumed by 4 call sites.**

**Edge consumers** — grep `loadRelations` (files): `context-sdk.ts`, `execution-context.ts`, `context.ts`, `rename-canonical-id.ts`, `scripts/orchestrator/append-relation.ts`, `scripts/orchestrator/gather-execution-context.ts` → **6 files.**

**ID-minting paths** — grep `nextId(` (files): `block-api.ts:1419` (def), `index.ts:920` (tool autoId), `scripts/orchestrator/file-block-item.ts:219` (CLI) → **1 definition, 2 write call sites.** These two are the ONLY places a new item is born → the ONLY places to mint OID + initial content_hash.

**Cross-substrate `project:` sentinels** — grep `project:` in `.context-jit-spec-v2/relations.json` → **30 edge endpoints** (all `child: "project:FGAP-###"`, 20 distinct targets: FGAP-115/151/153..169/178). These are the 30 validator errors. Also appear in `.context-jit-spec-v2/context-contracts.json`, `tasks.json` as text references (not edges).

---

## 2. Phased implementation steps

Phasing order is forced by the resolver hazard (§4): the **shared resolver with severity split lands and is wired BEFORE edges are rewritten to OID**, so resolution never breaks mid-migration. Within pi-context, every step is a `tsc`-build + `npm run check` + `npm test` + runtime-demo + adversarial-probe unit per CLAUDE.md Completion Sequence.

### Phase A — Hashing primitives + content/metadata partition (no behavior change yet)

**A1. Add JCS + crypto helper.**
- File: NEW `packages/pi-context/src/content-hash.ts`.
- Add `canonicalize` to `packages/pi-context/package.json` `dependencies` (`"canonicalize": "^2.0.0"`).
- Exact signatures:
  ```ts
  export function canonicalJson(value: unknown): string;            // RFC 8785 via canonicalize()
  export function sha256Hex(canonical: string): string;             // node:crypto createHash sha256, hex
  export function computeContentHash(content: Record<string, unknown>): string; // sha256Hex(canonicalJson(content))
  ```
- `computeContentHash` is fed the CONTENT-ONLY projection (A2), never the raw item.
- Add to `src/index.ts` exports + a named subpath export `@davidorex/pi-context/content-hash` in `package.json` `exports`.

**A2. Content/metadata partition declaration + reader.**
- The metadata complement to exclude from hashing: `oid`, `content_hash`, `content_parent`, and the `AUTHOR_FIELDS` set (`block-api.ts:66`: `created_by, created_at, modified_by, modified_at`) PLUS `closed_by`, `closed_at` (present on framework-gaps `:` schema). Everything else on the item is content.
- Mechanism: declare the complement per schema. ADD optional schema annotation `"x-identity": { "metadata_fields": [...] }` at the item-schema level; DEFAULT metadata set = the union above when annotation absent. This mirrors the existing `x-prompt-budget` / `x-lifecycle` extension-keyword convention (framework-gaps.schema.json uses both).
- File: extend `block-api.ts` cache machinery. ADD alongside `getSchemaCacheEntry` (`block-api.ts:189`):
  ```ts
  export function contentProjection(schema: Record<string,unknown>, arrayKey: string, item: Record<string,unknown>): Record<string,unknown>;
  ```
  Reads `x-identity.metadata_fields` (or default set), returns a shallow copy of `item` with those keys deleted. Cached per (schemaPath mtime, arrayKey) in the existing `schemaCache` entry (add a `metadataFields: ReadonlySet<string>` field to `SchemaCacheEntry`).
- Test: `content-hash.test.ts` — assert (a) `computeContentHash` stable across key reorder (JCS property); (b) changing `created_at`/`modified_by`/`oid` does NOT change the hash; (c) changing a content field (e.g. `status`) DOES change it.
- Runtime demo: `npx tsx -e "import {computeContentHash} from '@davidorex/pi-context/content-hash'; console.log(computeContentHash({status:'open',title:'x'})===computeContentHash({title:'x',status:'open'}))"` → prints `true`.
- Adversarial probe: fresh-context grep that `computeContentHash` is NEVER called on the raw item (always via `contentProjection`); assert no call site passes `oid`/`content_hash` into the hash input.

### Phase B — OID minting + storage (additive item fields)

**B1. Mint primitive.**
- File: NEW `packages/pi-context/src/oid.ts`.
  ```ts
  // birth-hash: hash(minting_substrate_id + birth_timestamp + nonce); 16-byte hex, never of body
  export function mintOid(substrateId: string, bornAt?: string, nonce?: string): string;
  ```
  Implementation: `sha256Hex(canonicalJson([substrateId, bornAt ?? new Date().toISOString(), nonce ?? crypto.randomUUID()])).slice(0,32)`. Edit-stable (no body input). Export via `@davidorex/pi-context/oid`.

**B2. Add `oid` / `content_hash` / `content_parent` to ALL 16 item schemas.**
- For each `samples/schemas/*.schema.json`: add to item `properties`:
  ```json
  "oid": { "type": "string", "pattern": "^[0-9a-f]{32}$", "description": "Immutable entity identity (birth-hash). Minted once; stable across edits." },
  "content_hash": { "type": "string", "pattern": "^[0-9a-f]{64}$", "description": "sha256 of canonical content projection; recomputed each write." },
  "content_parent": { "type": "string", "description": "content_hash of the prior version (Merkle history). Absent on first version." }
  ```
  Do NOT add to `required` (legacy items lack them until migrated). Bump each schema `version` (e.g. framework-gaps `1.1.0`→`1.2.0`). The 5 permissive schemas still get the property declarations (renderers read them).
- Mirror the SAME additions into any live `<substrate>/schemas/*.schema.json` the migration touches (Phase G handles backfill; the packaged samples are the template).
- Register an **identity migration** per bumped schema in each substrate's `migrations.json` (kind `"identity"` — shape-compatible additive bump): use `appendMigrationDecl` (`migrations-store.ts:164`). This lets `validateBlockWithMigration` (`schema-validator.ts:204`) pass legacy blocks (declaring old version) forward without rejection.

**B3. Mint at birth — the two write call sites.**
- `block-api.ts:1419` region — ADD `export function mintItemIdentity(cwd, blockName, item): item` that: (a) `nextId` for refname `id` if absent; (b) `mintOid(substrateIdFor(cwd))` for `oid` if absent; (c) `computeContentHash(contentProjection(...))` for `content_hash`. `substrateIdFor(cwd)` reads `.pi-context.json` `substrate_id` (Phase E).
- `index.ts:918-920` autoId branch: call `mintItemIdentity` instead of bare `nextId`.
- `scripts/orchestrator/file-block-item.ts:217-219`: same (dual-surface twin).
- Test: append a fresh item via `appendToBlock` with autoId → assert `oid` (32-hex), `content_hash` (64-hex), `id` (refname) all present and distinct.
- Runtime demo: `file-block-item.ts --block framework-gaps --auto-id --dry-run` against a scratch substrate; inspect emitted item carries all three.
- Adversarial probe: append the SAME content twice → distinct `oid` (nonce/timestamp), same `content_hash` would only match if content identical AND oid excluded — assert oid differs, content_hash equal.

**B4. Recompute content_hash on every mutating write; preserve oid.**
- Sites: `updateItemInTypedFile` (`block-api.ts:702`), `upsertItemInTypedFile` (`:757`), nested updaters (`:920`). After the merge but before `writeTypedFile`: set `content_parent = prior.content_hash` (if changed), recompute `content_hash = computeContentHash(contentProjection(merged))`, and assert `merged.oid === prior.oid` (never overwrite oid on update — throw if a caller tries to change it).
- Test: update an item's `status` → `content_hash` changes, `oid` unchanged, `content_parent` == old hash. Update a metadata field only (`modified_by`) → `content_hash` UNCHANGED.
- Adversarial probe: attempt `updateItemInBlock(..., {oid: "deadbeef..."})` → must throw (oid immutable).

### Phase C — substrate_id (stable per-substrate identity)

**C1. Schema + pointer.**
- `bootstrap.schema.json`: add `"substrate_id": {"type":"string","pattern":"^sub-[0-9a-f]{16}$"}` to `properties` (NOT required — legacy pointers lack it). Bump `version` `1.1.0`→`1.2.0`.
- `context-dir.ts:182 BootstrapPointerExtras`: add `substrate_id?: string`. `writeBootstrapPointer` (`:211`) and `flipBootstrapPointer` (`:281`) thread it through; `flipBootstrapPointer` PRESERVES the existing substrate_id (it identifies the substrate, not the dir — survives rename; never re-minted on flip).
- ADD `export function substrateIdFor(cwd): string` to `context-dir.ts` reading the pointer (throws if absent post-migration).
- ADD `export function mintSubstrateId(): string` → `"sub-" + sha256Hex(canonicalJson([Date.now(), randomUUID()])).slice(0,16)`.
- `/context init` path mints substrate_id when bootstrapping a fresh substrate.
- Test: `flipBootstrapPointer` preserves substrate_id across a dir switch; `writeBootstrapPointer` with substrate_id round-trips and validates.
- Adversarial probe: switch substrates twice and back; assert substrate_id constant while contextDir changes.

### Phase D — substrate_id propagation (config field + init registration)

**D1. Additive config field + init wiring.**
- `config.schema.json`: add `"substrate_id": {"type":"string","pattern":"^sub-[0-9a-f]{16}$"}` to `properties` (additive, NOT required — legacy configs lack it). Bump `version` `1.4.0`→`1.5.0`. Add to `AmendRegistry` (`context.ts:81`) so `amend-config` can edit it.
- `ConfigBlock` (`context.ts:32`): add `substrate_id?: string`.
- `/context init` mints a substrate_id (Phase C `mintSubstrateId`), writes it into the new substrate's `config.json` AND the `.pi-context.json` pointer, and registers `substrate_id → dir` in the project-root registry (Phase E). A substrate thus carries its own stable id (for OID minting + discovery) independent of its dir name.
- Inter-substrate relations are created later, via explicit cross-substrate reference edges carrying `(substrate_id, OID)` locators.
- Test: `init` two substrates in a scratch project → each has a distinct `config.substrate_id`, both registered in the peer directory, neither lists or references the other anywhere.
- Adversarial probe: init substrate B while A is active → assert B's `config.json` and pointer contain no reference to A.

### Phase E — registry (flat peer directory)

**E1. Project-root registry file.**
- NEW file `<cwd>/.pi-context-registry.json`, schema NEW `schemas/context-registry.schema.json` ($id `pi-context://schemas/context-registry`, pre-register in `schema-validator.ts` module-init alongside bootstrap/config/relations):
  ```json
  { "version": "1.0.0",
    "substrates": { "<substrate_id>": { "dir": ".context-jit-spec-v2" } } }
  ```
- File: NEW `packages/pi-context/src/context-registry.ts` mirroring `migrations-store.ts` shape: `loadRegistry(cwd)`, `writeRegistry(cwd, ...)` (atomic tmp+rename via `writeTypedFile`), `registerSubstrate(cwd, substrate_id, dir)`, `resolveSubstrateDir(cwd, substrate_id): string|null`.
- The registry is a flat `substrate_id → current dir` map (survives dir rename) — a peer locator directory. Per-reference pinning (`OID@content_hash`) rides the cross-substrate edge.
- Test: register two substrates, rename one's dir in the registry, confirm `resolveSubstrateDir` returns the new dir for the unchanged substrate_id.

### Phase F — shared resolver + fsck severity split (LANDS BEFORE edge rewrite)

**F1. The one shared resolver.**
- File: `context-sdk.ts`. ADD:
  ```ts
  export type ResolveStatus = "active" | "foreign" | "dangling" | "unregistered";
  export interface ResolvedRef { oid?: string; refname?: string; substrate_id?: string; loc?: ItemLocation; status: ResolveStatus; }
  export function resolveRef(cwd: string, ref: string): ResolvedRef;
  ```
  `ref` accepts: bare OID (`^[0-9a-f]{32}$`), `OID@contenthash` (pinned), `<substrate_id>:<oid>` (cross-substrate locator), legacy `project:<refname>` (migration rewrites this to a locator), or bare refname.
  Resolution algorithm (locator-driven):
  1. If ref carries a `<substrate_id>:` locator (or legacy `project:`, mapped to the base substrate's id): look up the substrate_id in the registry. Not in registry → `status:"unregistered"` (ERROR). In registry → index that dir (`buildIdIndexForDir`), resolve oid (legacy: refname) → found `status:"foreign"` (CLEAN); absent → `status:"dangling"` (ERROR).
  2. Else (bare OID or bare refname, no locator): resolve in the ACTIVE substrate index only → found `status:"active"`; not found → `status:"dangling"` (ERROR). A genuine cross-substrate reference always carries its locator, so an unlocated ref is active-only by definition.
- `buildIdIndex` is generalized: add `export function buildIdIndexForDir(blockDir, cwd, cfg): Map` so it can index a NON-active substrate dir (today it hardcodes `tryResolveContextDir(cwd)` at `:1076`). `buildIdIndex(cwd)` becomes the active-substrate wrapper. A foreign substrate is reached directly by the locator's substrate_id via the registry.
- The index must key by BOTH `oid` and `id`(refname) so `resolveRef` can look up either. `ItemLocation` gains `oid?: string`.

**F2. Wire the validator severity split.**
- `validateContext` edge loop (`context-sdk.ts:1259-1283`): replace `idIndex.has(edge.parent)` checks with `resolveRef(cwd, edge.parent).status`:
  - `active` / `foreign` → no issue (this is the fix that clears the 30 errors: items reached via a registry locator resolve CLEAN).
  - `unregistered` → ERROR ("locator names a substrate_id not in the registry").
  - `dangling` → ERROR (genuinely absent).
- Endpoint-kind check (`:1296-1322`): use `resolveRef(...).loc.block`.
- `validateRelations` (`context.ts:1082`): its inline `idIndex` (`:1101-1104`) — pass a resolver callback in, OR have `validateContext` (the only caller that matters for cross-substrate) supply a pre-resolved index that includes locator-reachable foreign items. Minimal: add an optional `resolve?: (ref)=>ResolvedRef` param to `validateRelations`; default behavior preserved when omitted (callers in tests pass none).
- Test: a fixture project with peer substrates A and B both registered; an edge in A whose child carries a `<B substrate_id>:<oid>` locator resolving in B → CLEAN (`foreign`). An edge whose locator names a substrate_id absent from the registry → ERROR (`unregistered`). A locator into B whose OID is genuinely absent → ERROR (`dangling`).
- Runtime demo: against the real repo AFTER Phase G migration — `npx tsx -e "...validateContext('.')..."` on the active `.context-jit-spec-v2` → the 30 `project:FGAP-*` errors are gone (status `foreign`: the migrated edges carry `<.project substrate_id>:<oid>` locators that resolve via the registry to `.project`).
- Adversarial probe: temporarily remove `.project`'s entry from the registry → the 30 edges flip to `unregistered` ERROR (proves the split is real locate-then-resolve, not a blanket suppression).

**F3. Route every other ID-resolution consumer through the resolver.**
- The 9 live call sites in §1.2 plus the `validateRelations` inline index: each that may receive a cross-substrate ref (`compile.ts:240/457`, `render-by-id.ts:73`, `execution-context.ts:150/208`, `index.ts:2185/2343 tools`) calls `resolveRef`/`buildIdIndex` such that locator-driven foreign resolution works. For OID→refname display (rendering), `resolveRef` returns `refname` from `loc.item.id`.
- Test each consumer with a foreign-resolving (cross-substrate locator) ref.

### Phase G — cross-project migration (see §3)

### Phase H — promotion layer (named, later; see §4 fork)

Not implemented in this arc — named only. The cross-substrate "promote an item from one substrate into another" operation is the merge layer. The fork (same-OID re-home vs new-OID copy with `derived-from` lineage) is decided in §4 and reserved.

---

## 3. Cross-project migration (`migrateToContentAddressed`)

Generalized across ANY project's substrate set; this repo happens to have `.project`, `.context`, `.context-jit-spec-v2`. Mirrors `rename-canonical-id.ts` engine discipline (deep-clone accumulator, dry-run, atomic writes, report object). Idempotent + verifiable + rollback-safe.

**Surface (dual, mirror rename-canonical-id):**
- Library: NEW `packages/pi-context/src/migrate-content-addressed.ts`:
  ```ts
  export interface MigrationReport {
    substrates: { dir: string; substrate_id: string; items_oid_minted: number; items_hashed: number; }[];
    edges_rewritten: number;        // refname/project: → <substrate_id>:<oid> or bare OID
    cross_substrate_edges: number;  // edges whose endpoint carries a foreign <substrate_id>: locator
    dry_run: boolean;
    unresolved: { substrate: string; ref: string }[];           // refs that resolve nowhere → BLOCKS completion
  }
  export function migrateToContentAddressed(cwd: string, opts?: { dryRun?: boolean }): MigrationReport;
  ```
- Pi tool: `index.ts` NEW `migrate-content-addressed` (mirror `rename-canonical-id` registration at `index.ts:1610`; params `{ dryRun?: boolean }`; `ctx.cwd`).
- Orchestrator script: NEW `scripts/orchestrator/migrate-content-addressed.ts` (mirror `migrate-canonical-id.ts` arg-parse + table/json report).

**Ordered, idempotent steps inside `migrateToContentAddressed`:**

1. **Discover substrates.** Enumerate sibling `.context*` / `.project` dirs that contain a `config.json` (same dir-resolution surface family — use `fs.readdirSync(cwd)` filtered to dirs holding `config.json`). NOTE: today only the ACTIVE dir has a `.pi-context.json` (it is per-cwd, single pointer). Migration must therefore write a per-substrate `substrate_id` into EACH substrate's `config.json` as `config.substrate_id` (additive; the config schema bump for this lands in D1). **Recommendation:** register every discovered substrate in the project-root registry (Phase E) keyed by dir AND stamp `config.substrate_id` into each substrate's `config.json`. This survives dir rename because the registry maps id→dir.

2. **Mint substrate_id per discovered substrate** (idempotent: skip if already present in registry). Backfill registry `substrates{}`.

3. **OID backfill.** For each substrate, for each block item lacking `oid`: `item.oid = mintOid(substrate_id)`. Idempotent (skip if present). Write via `writeBlock` (atomic, AJV-validated against the version-bumped schema).

4. **content_hash backfill.** For each item: `item.content_hash = computeContentHash(contentProjection(schema, arrayKey, item))`. Idempotent (recompute is deterministic; re-running yields identical hash). No `content_parent` for backfilled items (they are version 1).

5. **Edge rewrite refname/`project:` → OID.** For each substrate's `relations.json`: for each edge endpoint:
   - bare refname (active-substrate item) → look up that item's freshly-minted `oid`, replace endpoint with the OID (keep a side-car `refname` field on the edge for display: ADD optional `parent_refname`/`child_refname` to relations.schema.json, bump its version).
   - `project:<refname>` → resolve `<refname>` in the BASE substrate (`.project`), get its OID + `.project`'s substrate_id; rewrite endpoint to the `<.project substrate_id>:<oid>` locator. The 30 `project:FGAP-*` endpoints all resolve this way. The locator on the edge is self-sufficient; the resolver reaches `.project` directly via the registry.
   - unresolvable refname → push to `report.unresolved` (BLOCKS completion; do not silently drop).

6. **schema_version bump + migration entries.** Ensure each substrate's `migrations.json` carries an identity migration for every schema whose version this arc bumped (Phase B2). Use `appendMigrationDecl` (idempotent via its collision-throw — wrap in try/skip-on-collision so re-run is a no-op).

7. **substrate_id into pointer + config.** For the ACTIVE substrate, write `substrate_id` into `.pi-context.json` via `writeBootstrapPointer`(extras) so `substrateIdFor(cwd)` works for live writes; for every substrate, ensure `config.substrate_id` is stamped (step 1). The complete cross-substrate state is the per-edge locator (step 5) plus the existence registry (step 2).

**Atomicity / rollback.** Every file write uses the existing atomic tmp+rename (`writeTypedFile` `block-api.ts:429-432`, `writeBootstrapPointer` `context-dir.ts:233-236`). `dryRun` performs ZERO writes (computes counts only), exactly like `renameCanonicalId`. Because each step is idempotent, a crash mid-run is recoverable by re-running (re-run skips already-stamped items/edges). For hard rollback safety, the orchestrator script runs against a clean git tree so `git checkout -- <substrate dirs>` reverts; the script's first action prints a reminder if `git status --porcelain` shows the substrate dirs dirty.

**Verification gate (zero data loss + 30 errors clear):**
- Pre/post item count per block MUST match (no item dropped); assert in the report.
- Every pre-migration edge has a post-migration counterpart (same relationship, endpoints now OID); `report.edges_rewritten` == pre-migration edge count; `report.unresolved` MUST be empty.
- `validateContext('.')` on the active substrate: the 30 `project:FGAP-*` "does not resolve" errors are GONE (now `foreign` CLEAN via registry locator). Run `npx tsx -e "import {validateContext} from '@davidorex/pi-context/context-sdk'; const r=validateContext('.'); console.log(r.issues.filter(i=>i.message.includes('does not resolve')).length)"` → expect `0`.
- Adversarial probe (fresh agent): independently re-count items + edges pre (from git HEAD) vs post; confirm OIDs are 32-hex and unique within each substrate; confirm content_hash recompute is stable (run migration twice → second run reports 0 new mints, 0 edge rewrites — idempotency proof).

---

## 4. Open forks + risks

**Promotion-OID fork (RECOMMEND arm b).** When an item is promoted from one substrate into another (e.g. an FGAP authored in `.context-jit-spec-v2` copied into `.project`):
- **Arm (a) same-OID re-home:** the item keeps its OID, moves files. The OID is stable, but every cross-substrate edge pointing at it carries a `<old_substrate_id>:<oid>` locator that must be rewritten to `<new_substrate_id>:<oid>` (the item changed home substrate). relations.json consequence: a locator-substrate rewrite on each inbound cross-substrate edge (same-substrate bare-OID edges are unaffected). Risk: an OID minted under one substrate_id's birth-facts now lives in another substrate — the birth-provenance (`minting_substrate_id`) no longer matches its home, which is mildly confusing but harmless (OID is opaque).
- **Arm (b) new-OID copy + lineage (RECOMMENDED):** mint a fresh OID in the destination substrate; add a relations.json edge `relation_type: "derived-from"`, `parent: <new OID>`, `child: <old OID@content_hash>` (pinned). The old item is marked superseded. relations.json consequence: +1 lineage edge per promotion; existing edges to the OLD oid still resolve to the (now-superseded) source. block-api consequence: a `promoteItem` primitive that copies content, mints OID via `mintOid(destSubstrateId)`, files the `derived-from` edge.
- **Recommendation: arm (b).** It preserves clean per-substrate birth-provenance (OID birth-facts always match home substrate), gives an explicit Merkle-style lineage edge (matches the content_hash Merkle-history design), and pins the source version so later source edits don't silently mutate the promoted copy's apparent origin. Cost: edges to the old OID must be migrated to the new OID if the source is retired — but that is the same `renameCanonicalId`-style edge rewrite already in the toolbox. This is reserved for a later phase; named here so the OID design does not foreclose it.

**ABSENT surfaces that must be built from scratch:**
- JCS package (`canonicalize`) — not in tree; add to deps.
- `node:crypto` usage — none today; built-in, no install.
- Registry peer directory (`.pi-context-registry.json`) + schema + `context-registry.ts` — entirely new.
- `config.substrate_id` — new config field (additive schema edit + bump).
- `substrate_id` in `.pi-context.json` — new pointer field (schema edit + bump).
- `oid`/`content_hash`/`content_parent` on items — new fields across 16 schemas.
- Cross-substrate `buildIdIndexForDir` — `buildIdIndex` hardcodes the active dir (`context-sdk.ts:1076`); must generalize.
- `resolveRef` + severity split — new; the current validator only does active-substrate `idIndex.has` (`context-sdk.ts:1260,1268`).

**Ordering hazards:**
- **Resolver-before-edges (HARD).** The shared resolver + severity split (Phase F) MUST land and be wired into the validator BEFORE the migration rewrites edges to OID (Phase G). If edges were rewritten first while the validator still indexed only refnames in the active substrate, EVERY rewritten cross-substrate edge would become a NEW dangling error (OID not in active index) — strictly worse than today. With F first, the migrated locator edges resolve `foreign` CLEAN.
- **substrate_id-before-OID-mint (HARD).** `mintOid` needs `minting_substrate_id`; Phase C (substrate_id) must precede Phase B3/G OID minting in execution order even though documented earlier. (Spec orders C after B for narrative; the migration in G mints substrate_id in its own step 2 before step 3 OID mint — self-consistent.)
- **Schema bump-before-write (HARD).** Items carrying `oid`/`content_hash` written against an UN-edited `additionalProperties:false` schema → AJV reject. Schema edits (B2) must land in BOTH the packaged samples AND each live substrate's `schemas/` before the migration writes any item. The migration's step 0 should verify each target schema already declares `oid`/`content_hash`/`content_parent` and FAIL FAST otherwise.

**AJV/schema constraints:** none block the plan. `additionalProperties:false` is the only friction and is handled by the additive-then-bump discipline already used throughout (framework-gaps moved `1.0.0`→`1.1.0` precedent). No `$ref` cycle risk — the new fields are leaf primitives.

---

## 5. Backward-reference map

- **FGAP-185 (ROOT, status `identified`, `.project`)** — "Canonical IDs collide across substrates… ambiguous references when work spans both." This spec IS the implementation of FGAP-185's resolution. Closes it when Phases A–G land. Its R1 (every cross-substrate reference carries unambiguous disambiguation) is satisfied by OID + `<substrate_id>:<oid>` refs.
- **FGAP-027 (status `identified`, `.project`)** — the dual-nature config-mutable-vs-prose-staleness dichotomy on rename. Partially addressed: OID immutability removes the "rename orphans references" failure for the entity layer (refname can change freely; edges ride the OID). The prose-staleness-on-rename forensic caveat (analysis MDs) remains report-only, consistent with `renameCanonicalId`'s out-of-substrate scan.
- **FGAP-007 (status `identified`, `.project`)** — research staleness engine. Tangentially enabled: content_hash gives the staleness/change-detection primitive the engine needs for content-scoped conditions; not closed by this arc (the engine itself is separate work).
- **Validator-error reduction 53→23.** The 30 `project:FGAP-*` "does not resolve" errors (grep-confirmed: exactly 30 `project:` edge endpoints in `.context-jit-spec-v2/relations.json`) clear via the resolver severity split (they become `foreign` CLEAN once the migration rewrites them to `<.project substrate_id>:<oid>` locators resolvable via the registry). **The remaining ~23 errors are NOT addressed by this change and stay open** — they are other categories (unregistered relation_types, endpoint-kind mismatches, invariant violations, cycle detections, lens-validator findings per `validateContext` `:1276,1296,1356,1391,1451`); this arc touches only the cross-substrate-reference category.
