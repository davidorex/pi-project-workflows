# Substrate Identity & Integrity — Implementation Specification

Date: 2026-05-31
Status: Implementation Specification
Target: `@davidorex/pi-context`

This spec replaces single-string overloaded identity with a three-layer model: **User-facing Refname** (mutable), **Entity Identity/OID** (immutable birth-hash), and **Content Hash** (integrity check). It adds a **Substrate Registry** for stable cross-substrate resolution.

---

## 0. Governing Principles

1.  **Total Invisibility:** Users and agents author/read via friendly refnames (e.g., `FEAT-001`) and substrate aliases (e.g., `.project:FGAP-153`). OIDs and Machine-IDs are internal.
2.  **Explicit Partition:** `id` (refname) is metadata. `content_hash` covers only the content projection. OID is birth-identity, not content-derived.
3.  **Porcelain Boundary:** Raw relation-storage uses OIDs; public tools resolve friendly strings at the boundary before calling plumbing.
4.  **Birth-Path Stamping:** Identity is stamped in all birth paths (append, upsert-create, whole-block-write), not just auto-ID allocation.

---

## 1. Architectural Model

### 1.1 Item Shape (Logical)
```json
{
  "id": "FEAT-001",
  "oid": "1f2e3d4c5b6a7988...",
  "content_hash": "sha256...",
  "status": "planned",
  "description": "..."
}
```

### 1.2 Substrate Registry (`.pi-context-registry.json`)
Lives at project root. Maps stable machine-IDs to current directories and human aliases.
```json
{
  "version": "1.0.0",
  "substrates": {
    "sub-abc123...": {
      "dir": ".context-jit-spec-v2",
      "aliases": ["v2", "spec-v2"]
    }
  }
}
```

---

## 2. Implementation Phases

### Phase A: Hashing & Projection (Plumbing)

**A1. Add JCS & Crypto Helpers**
- **File:** `packages/pi-context/src/content-hash.ts`
- **Dependencies:** Add `canonicalize` (RFC 8785) to `package.json`.
- **Functions:**
  - `export function sha256Hex(val: string): string`
  - `export function computeContentHash(projection: Record<string, unknown>): string`

**A2. Content Projection**
- **File:** `packages/pi-context/src/block-api.ts`
- **Metadata Set:** `id`, `oid`, `content_hash`, `content_parent`, `created_at`, `created_by`, `modified_at`, `modified_by`, `closed_at`, `closed_by`.
- **Function:** `export function getContentProjection(item: Record<string, unknown>): Record<string, unknown>`
- **Behavior:** Returns shallow copy excluding the metadata set. This ensures renames (`id` change) do not alter `content_hash`.

### Phase B: Identity Stamping (Internal API)

**B1. OID Minting**
- **File:** `packages/pi-context/src/oid.ts`
- **Function:** `export function mintOid(substrate_id: string): string`
- **Implementation:** 32-hex birth-hash: `sha256Hex([substrate_id, Date.now(), randomUUID()])`.

**B2. Birth Management**
- **File:** `packages/pi-context/src/block-api.ts`
- **Function:** `export function prepareItemForWrite(item, substrate_id): item`
- **Behavior:**
  - If `item.oid` absent: mint it.
  - Recompute `item.content_hash` via `getContentProjection`.
  - On update/upsert: verify `merged.oid === prior.oid`; throw on mutation.
- **Wire into:** `appendToTypedFile`, `updateItemInTypedFile`, `upsertItemInTypedFile`, and `writeBlock`.

**B3. Schema Updates**
- Add `oid`, `content_hash`, and `content_parent` to ALL 16 item schemas in `samples/schemas/*.schema.json`.
- Update item `properties` only; do not add to `required` (preserves legacy compatibility).
- Bump all schema versions and register `identity` migrations in `schema-migrations.ts`.

### Phase C: Substrate Layer (Context)

**C1. Substrate ID**
- **Files:** `config.schema.json`, `context.ts` (ConfigBlock interface).
- **Update:** Add `substrate_id: string` to `ConfigBlock`.
- **Init:** `/context init` mints `substrate_id` and writes it to `config.json`.

**C2. Project Registry**
- **File:** `packages/pi-context/src/registry.ts`
- **Schema:** `context-registry.schema.json`.
- **Functions:** `registerSubstrate(id, dir, aliases[])`, `resolveDirByIdOrAlias(name): dir`.
- **Persistence:** Project-root `.pi-context-registry.json`.

### Phase D: Shared Resolver (Core)

**D1. Multi-Index Resolver**
- **File:** `packages/pi-context/src/context-sdk.ts`
- **Internal State:**
  ```ts
  interface SubstrateIndex {
    byRefname: Map<string, ItemLocation>;
    byOid: Map<string, ItemLocation>;
    items: ItemLocation[]; // Canonical iteration surface
  }
  ```
- **Function:** `export function resolveRef(cwd, ref): ResolvedRef`
- **Ref Grammar:** `FEAT-001` (active), `.project:FGAP-153` (aliased), `<sub-id>:<oid>` (exact).
- **Return Shape:**
  ```ts
  { status: 'active' | 'foreign' | 'dangling' | 'unregistered' | 'virtual'; kind: 'item' | 'lens_bin'; loc?: ItemLocation; oid?: string; }
  ```

**D2. Validator Wiring**
- **File:** `context-sdk.ts`, `validateContext`.
- **Change:** Loop `relations.json`; call `resolveRef` for parent/child.
- **Severity Split:**
  - Status `foreign`: CLEAN.
  - Status `unregistered` / `dangling`: ERROR.
- **Invariant Fix:** Iterate `idIndex.items[]` to avoid duplicate processing of OID vs Refname keys.

### Phase E: Relations & Porcelain

**E1. Relation Endpoint Model**
- **File:** `context.ts`, `Edge` interface.
- **Update:** Endpoints should support `{ substrate_id?, oid, refname_hint? }`.
- **Schema:** `relations.schema.json` bump.

**E2. Boundary Resolution (The "Porcelain" Layer)**
- **File:** `packages/pi-context/src/index.ts` (tool implementations).
- **Change:** `append-relation` tool calls `resolveRef` on inputs.
- **Write:** Persist the resolved machine-locators (OID + SubstrateID) to `relations.json`.
- **Display:** Tools render refnames for human feedback while OIDs provide stable storage.

### Phase F: Migration Engine

**F1. Substrate Migration**
- **File:** `packages/pi-context/src/migrate-identity.ts`.
- **Logic:**
  1. Register all substrates in project registry.
  2. Backfill `oid` + `content_hash` for all items.
  3. Rewrite `relations.json` endpoints to OIDs.
  4. Specifically map `project:<id>` refs to `.project`’s OIDs via registry aliases.
- **Validation:** Verify 30 `project:` errors in `.context-jit-spec-v2` clear after run.

---

## 3. High-Risk Ordering Requirements

1. **Resolver before Edges:** Phase D (Resolver) must be wired into the validator before Phase F (Migration) rewrites edges to OIDs. Otherwise, the validator will flag every new OID-edge as "dangling" because it only knows refnames.
2. **Schema before Birth:** Phase B3 (Schema Update) must land before Phase B2 (Stamping) writes any items, or AJV will reject the new fields.
3. **Registry before Migration:** Phase C2 (Registry) must be initialized before the migration can resolve `project:` aliases.


From this conception, the user resolves the current cross-substrate issues by using **friendly substrate aliases and refnames**, while the framework writes the machine identity underneath.

## User-level flow

1. **Register the project’s substrates as peers**
   - The registry records:
     ```text
     .project
     .context
     .context-jit-spec-v2
     ```
   - Each gets an internal `substrate_id`, but the user never sees it.

2. **Run the identity migration**
   - The migration backfills every item with:
     ```text
     oid
     content_hash
     ```
   - It also registers aliases, including:
     ```text
     project -> .project
     ```

3. **Rewrite legacy cross-substrate refs**
   - Existing edges like:
     ```text
     project:FGAP-153
     ```
     are resolved as:
     ```text
     .project:FGAP-153
     ```
   - Storage changes internally to the target item’s OID + substrate locator.
   - User-facing displays still show:
     ```text
     .project:FGAP-153
     ```

4. **Validation then treats foreign resolved items as clean**
   - Today, active `.context-jit-spec-v2` cannot resolve:
     ```text
     project:FGAP-153
     ```
   - After migration, the resolver sees:
     ```text
     alias project -> .project -> FGAP-153 exists
     ```
   - So that edge becomes:
     ```text
     foreign resolved item = clean
     ```

## What this fixes in our current substrate

The current `.context-jit-spec-v2` errors like:

```text
Edge child 'project:FGAP-153' does not resolve to any item
Edge child 'project:FGAP-169' does not resolve to any item
Edge child 'project:FGAP-178' does not resolve to any item
```

would be fixed by the migration, because those are not actually missing conceptual targets. They are cross-substrate references that the current resolver cannot follow.

Under the new model, they become valid cross-substrate edges:

```text
FB-001 -> .project:FGAP-153
TASK-002 -> .project:FGAP-169
TASK-002 -> .project:FGAP-178
```

but internally stored by OID, not brittle text IDs.

## How the DEC-0047 / DEC-0011 issue would be handled

The user would not copy `DEC-0047` blindly as another local `DEC-0047`.

They would do one of two explicit friendly actions:

### If the local arc needs its own local decision

Create:

```text
.context-jit-spec-v2:DEC-0011
```

and relate it to the source decision:

```text
.context-jit-spec-v2:DEC-0011 relates-to .project:DEC-0047
```

Internally that relation stores the OID of `.project:DEC-0047`.

### If the local arc only needs to cite the canonical decision

Do not create `DEC-0011`; instead inject or relate directly to:

```text
.project:DEC-0047
```

The resolver makes that valid even while `.context-jit-spec-v2` is active.

## What remains after cross-substrate identity is fixed

The identity system fixes the **unresolved foreign reference** class.

It does not automatically fix errors where the relation itself is semantically wrong. For example, these remain real modeling errors:

```text
TASK-002 -> FEAT-001 using task_depends_on_task
WO-002 -> TASK-002 using task_depends_on_task
```

Because `task_depends_on_task` is declared as:

```text
tasks -> tasks
```

The user would resolve those by replacing them with the correct relation types, such as:

```text
task_addresses_feature
```

for:

```text
TASK-002 -> FEAT-001
```

and a proper work-order/task relation type for:

```text
WO-002 -> TASK-002
```

if that relation type exists, or by adding one to config if the model needs it.

## Net result for this project

The current cross-substrate problem becomes a normal operation:

```text
relate this local work item to that canonical project item
```

using visible names like:

```text
.context-jit-spec-v2:TASK-002
.project:FGAP-169
.project:DEC-0047
```

The framework handles:

```text
substrate lookup
OID lookup
content hash verification
foreign-item validation
```

The user sees stable, meaningful refs; the substrate stores unambiguous machine identity.

*********************************************************

Subsequent re-articulation:

I can’t write arbitrary `.md` files with the current tool surface. Here is the complete markdown to persist.

```md
# Substrate Identity, Integrity, Cross-Substrate Resolution, and Promotion — Implementation Specification

Date: 2026-05-31  
Target package: `@davidorex/pi-context`  
Status: implementation specification

This specification separates user-facing item names from machine identity, adds cross-substrate resolution, preserves lens-bin semantics, and adds safe single-item promotion between substrates.

The implementation goal is:

```text
Users keep working with friendly refs like FEAT-001 and .project:FGAP-153.
The substrate stores stable machine identity underneath.
Validation can distinguish valid foreign refs from genuinely dangling refs.
Lens bins remain virtual grouping labels, not items.
Users can promote local arc output into canonical substrates without corrupting identity.
```

---

# 1. Governing Principles

## 1.1 Machine identity is invisible

Users and agents do not type or manage:

```text
oid
content_hash
substrate_id
registry entries
```

They use friendly selectors:

```text
FEAT-001
.project:FGAP-169
.context-jit-spec-v2:DEC-0011
```

The framework resolves those selectors to machine identity internally.

## 1.2 Refname is not identity

`id` is a mutable user-facing refname.

```text
FEAT-001
DEC-0011
TASK-002
```

Entity identity is the item’s immutable `oid`.

Renaming `id` must not break relations and must not change `content_hash`.

## 1.3 OID is entity identity, not content identity

`oid` is a birth identity. It is not derived from item content.

`content_hash` is the hash of the item’s content projection.

Do not claim Git-style content-addressed storage unless prior content snapshots are durably stored.

## 1.4 Relation storage uses machine identity; tools use friendly refs

Public tools accept friendly refs.

Storage uses resolved endpoint objects.

## 1.5 Lens bins are virtual endpoints

Lens bins are not items.

They do not get:

```text
oid
content_hash
schema rows
```

They are lens-scoped grouping labels.

## 1.6 Promotion is required

Cross-substrate identity is incomplete without promotion.

The first complete implementation must include safe single-item promotion:

```text
promote .context-jit-spec-v2:DEC-0011 to .project
```

Bulk merge workflows and retargeting automation can be separate, but promotion with lineage cannot be deferred.

---

# 2. User Stories

## 2.1 User relates local work to canonical project items

As a user working in `.context-jit-spec-v2`, I can relate a local task to a framework gap in `.project`:

```text
.context-jit-spec-v2:TASK-002 relates to .project:FGAP-169
```

Expected behavior:

- I do not see or type an OID.
- The tool resolves `.project:FGAP-169` through the registry.
- The stored relation uses the target item’s machine identity.
- Validation reports the edge as clean if the target exists.

---

## 2.2 User cites a decision from another substrate

As a user working in `.context-jit-spec-v2`, I can cite:

```text
.project:DEC-0047
```

Expected behavior:

- The framework resolves `.project` to the registered substrate.
- The framework resolves `DEC-0047` inside that substrate.
- The persisted edge stores the target OID and substrate identity.
- Rendered output still shows:
  ```text
  .project:DEC-0047
  ```

---

## 2.3 User renames an item without breaking relations

As a user, I can rename a refname:

```text
FEAT-001 -> FEAT-AGENTIC-DISPATCH
```

Expected behavior:

- The item’s `oid` stays unchanged.
- Existing relations remain valid because they point to the OID.
- Display helpers show the new refname after index refresh.
- `content_hash` does not change from refname-only rename.

---

## 2.4 User edits item content and gets integrity tracking

As a user, I update a content field on a task.

Expected behavior:

- The item’s `oid` stays unchanged.
- The item’s `content_hash` changes.
- Metadata-only updates, such as `modified_at`, do not change `content_hash`.
- Attempting to change `oid` is rejected.

---

## 2.5 User assigns an item to a lens bin

As a user, I can place:

```text
FEAT-001
```

into a lens bin:

```text
planned
```

Expected behavior:

- The bin is treated as a virtual endpoint.
- The bin does not get an OID.
- The item child is resolved to OID.
- Rendered lens views still show configured bin names.

---

## 2.6 User promotes local arc output into canonical state

As a user, I can promote:

```text
.context-jit-spec-v2:DEC-0011
```

into:

```text
.project
```

Expected behavior:

- The promoted item gets a new `.project` refname.
- The promoted item gets a new `.project` OID.
- The source item remains in `.context-jit-spec-v2`.
- A lineage relation records:
  ```text
  .project:<new item> derived_from .context-jit-spec-v2:DEC-0011@<source content_hash>
  ```
- Existing relations are not silently retargeted.
- Both source and promoted destination item remain valid.

---

# 3. Core Model

## 3.1 Item identity fields

Each item has:

```text
id             user-facing refname, mutable
oid            immutable entity identity, minted at item birth
content_hash   hash of content projection, recomputed on content changes
content_parent optional previous content_hash when content changes
```

Example:

```json
{
  "id": "FEAT-001",
  "oid": "0d4a5e6b9c1011121314151617181920",
  "content_hash": "64hex...",
  "status": "proposed",
  "title": "Agentic-mode dispatch loop"
}
```

Rules:

- `id` is metadata.
- `oid` is immutable.
- `content_hash` excludes identity and metadata fields.
- `content_parent` is only a prior-hash pointer unless durable snapshots are implemented.
- Do not describe `content_parent` as full Merkle history without an object store.

---

## 3.2 Content projection

Exclude these fields from `content_hash`:

```text
id
oid
content_hash
content_parent
created_by
created_at
modified_by
modified_at
closed_by
closed_at
```

Everything else is content unless future schema metadata explicitly extends the exclusion set.

Consequences:

```text
id rename does not change content_hash
attestation stamping does not change content_hash
content edits change content_hash
```

---

## 3.3 Substrate identity

Each substrate has one stable identity:

```text
config.substrate_id
```

Example:

```json
{
  "schema_version": "1.0.0",
  "substrate_id": "sub-4d9a0e3c2b1f7788",
  "block_kinds": []
}
```

`config.substrate_id` is the canonical source of truth.

The bootstrap pointer `.pi-context.json` continues to select the active substrate directory.

---

## 3.4 Project substrate registry

Project-root file:

```text
.pi-context-registry.json
```

Shape:

```json
{
  "version": "1.0.0",
  "substrates": {
    "sub-4d9a0e3c2b1f7788": {
      "dir": ".context-jit-spec-v2",
      "aliases": ["spec-v2", ".context-jit-spec-v2"]
    },
    "sub-aabbccddeeff0011": {
      "dir": ".project",
      "aliases": ["project", ".project"]
    }
  }
}
```

Rules:

- `substrate_id` maps to current dir.
- aliases are human selectors.
- legacy `project:` is represented by alias:
  ```text
  project -> .project
  ```
- registry/config mismatch is a validation error:
  ```text
  registry[id].dir/config.substrate_id mismatch
  ```

---

# 4. Relation Endpoint Model

## 4.1 Item endpoint

```json
{
  "kind": "item",
  "substrate_id": "sub-aabbccddeeff0011",
  "oid": "0d4a5e6b9c1011121314151617181920",
  "refname_hint": "FGAP-169",
  "content_hash": "optional pinned 64hex"
}
```

Rules:

- `oid` is authoritative.
- `substrate_id` locates foreign items.
- `refname_hint` is display-only and may be stale.
- `content_hash` is optional and pins a specific version when needed, especially lineage.

---

## 4.2 Lens-bin endpoint

```json
{
  "kind": "lens_bin",
  "lens_id": "feature-status",
  "bin": "planned"
}
```

Rules:

- lens bins are virtual grouping endpoints.
- lens bins do not get OIDs.
- lens bins do not have content hashes.
- validity is checked against `config.lenses[]`.

---

## 4.3 Edge shape

Lens edge:

```json
{
  "parent": {
    "kind": "lens_bin",
    "lens_id": "feature-status",
    "bin": "planned"
  },
  "child": {
    "kind": "item",
    "oid": "0d4a5e6b9c1011121314151617181920",
    "refname_hint": "FEAT-001"
  },
  "relation_type": "feature-status"
}
```

Ordinary item relation:

```json
{
  "parent": {
    "kind": "item",
    "oid": "11111111111111111111111111111111",
    "refname_hint": "DEC-0011"
  },
  "child": {
    "kind": "item",
    "oid": "22222222222222222222222222222222",
    "refname_hint": "FEAT-001"
  },
  "relation_type": "decision_addresses_feature"
}
```

Lineage relation:

```json
{
  "parent": {
    "kind": "item",
    "substrate_id": "sub-project",
    "oid": "new-project-oid",
    "refname_hint": "DEC-0052"
  },
  "child": {
    "kind": "item",
    "substrate_id": "sub-spec-v2",
    "oid": "source-spec-v2-oid",
    "refname_hint": "DEC-0011",
    "content_hash": "source-content-hash-at-promotion"
  },
  "relation_type": "item_derived_from_item"
}
```

---

# 5. Resolver Design

## 5.1 Substrate index

Do not use one map keyed by both refname and OID for iteration.

Use:

```ts
interface SubstrateIndex {
	substrate_id: string;
	dir: string;
	byRefname: Map<string, ItemLocation>;
	byOid: Map<string, ItemLocation>;
	items: ItemLocation[];
}
```

Rules:

- `items[]` contains each item exactly once.
- `byRefname` indexes `item.id`.
- `byOid` indexes `item.oid`.
- validators iterate `items[]`, never lookup maps.

---

## 5.2 Resolver input

Resolver accepts:

```text
FEAT-001
.project:FGAP-169
project:FGAP-169
.context-jit-spec-v2:DEC-0011
sub-aabbccddeeff0011:0d4a...
0d4a5e6b9c1011121314151617181920
```

Rules:

- bare ref resolves in active substrate only.
- alias-prefixed ref resolves through registry.
- `project:` is a legacy alias for `.project`.
- bare OID resolves in active substrate only.
- substrate-ID-prefixed OID resolves exactly.

---

## 5.3 Resolver output

```ts
type ResolveStatus =
	| "active"
	| "foreign"
	| "dangling"
	| "unregistered"
	| "virtual";

interface ResolvedRef {
	status: ResolveStatus;
	kind: "item" | "lens_bin";
	substrate_id?: string;
	oid?: string;
	refname?: string;
	loc?: ItemLocation;
}
```

Status semantics:

- `active`: item exists in active substrate.
- `foreign`: item exists in another registered substrate.
- `dangling`: substrate was located, item does not exist.
- `unregistered`: referenced substrate alias or ID is not registered.
- `virtual`: endpoint is a valid lens bin.

---

# 6. Promotion Model

## 6.1 Required primitive

Ship a single-item promotion primitive in the first complete implementation.

Public user-level operation:

```text
promote .context-jit-spec-v2:DEC-0011 to .project
```

Library function:

```ts
export function promoteItem(
	cwd: string,
	input: {
		source: string;
		destinationSubstrate: string;
		newRefname?: string;
	},
	ctx?: DispatchContext,
): PromotionResult;
```

Result:

```ts
export interface PromotionResult {
	source: ResolvedRef;
	destination: ResolvedRef;
	lineageEdgeAppended: boolean;
}
```

---

## 6.2 Promotion semantics

Promotion is **new-OID copy + lineage**, not same-OID rehome.

Steps:

1. Resolve source friendly ref.
2. Resolve destination substrate alias.
3. Copy source content projection.
4. Allocate destination refname if not provided.
5. Mint destination OID using destination `substrate_id`.
6. Compute destination `content_hash`.
7. Validate destination item against destination schema.
8. Append destination item.
9. Append lineage edge:
   ```text
   destination derived_from source@source_content_hash
   ```

---

## 6.3 Why new OID

OID is birth identity.

If an item was born in `.context-jit-spec-v2`, then the promoted `.project` item is a new entity derived from the source.

Same-OID rehome is rejected because it makes home substrate and birth identity ambiguous.

---

## 6.4 Required lineage relation type

Add relation type:

```json
{
  "canonical_id": "item_derived_from_item",
  "display_name": "derived from",
  "category": "data_flow",
  "source_kinds": ["*"],
  "target_kinds": ["*"]
}
```

Endpoint direction:

```text
promoted item -> source item
```

Meaning:

```text
parent derives from child
```

---

## 6.5 Promotion validation

Promotion must verify:

- source resolves as item;
- destination substrate resolves;
- destination refname does not collide;
- destination schema accepts copied item;
- destination OID differs from source OID;
- source content hash is pinned on lineage edge;
- lineage source endpoint resolves as foreign or active;
- no existing relation is silently retargeted.

---

## 6.6 What can remain outside first implementation

Do not defer promotion itself.

These can remain separate workflows:

- bulk promotion;
- conflict-resolution UI;
- interactive merge TUI;
- automatic relation retargeting;
- branch-like promotion policies;
- automatic source lifecycle transition.

Reason: these are policy-heavy ergonomics. The safe primitive must ship first and must not guess retargeting policy.

---

# 7. Atomic Implementation Steps

## Phase A — Content hash primitives

### A1. Add JCS package

File:

```text
packages/pi-context/package.json
```

Add dependency:

```json
"canonicalize": "^2.0.0"
```

---

### A2. Add content hash module

New file:

```text
packages/pi-context/src/content-hash.ts
```

Exports:

```ts
export function canonicalJson(value: unknown): string;
export function sha256Hex(input: string): string;
export function computeContentHash(content: Record<string, unknown>): string;
```

Implementation:

- `canonicalJson` uses RFC 8785 canonicalization.
- `sha256Hex` uses `node:crypto.createHash("sha256")`.
- `computeContentHash` hashes canonicalized content projection.

---

### A3. Export content hash module

Update:

```text
packages/pi-context/src/index.ts
packages/pi-context/package.json
```

Add subpath export:

```json
"./content-hash": {
  "types": "./dist/content-hash.d.ts",
  "default": "./dist/content-hash.js"
}
```

---

### A4. Tests

New test:

```text
packages/pi-context/src/content-hash.test.ts
```

Assertions:

- key-order changes do not change hash.
- metadata field changes do not change hash.
- content field changes do change hash.
- `id` rename does not change hash.

---

## Phase B — Content projection and OID

### B1. Add OID module

New file:

```text
packages/pi-context/src/oid.ts
```

Exports:

```ts
export function mintOid(substrateId: string): string;
```

Implementation:

```ts
sha256Hex(canonicalJson([substrateId, new Date().toISOString(), randomUUID()])).slice(0, 32)
```

---

### B2. Export OID module

Update package exports:

```json
"./oid": {
  "types": "./dist/oid.d.ts",
  "default": "./dist/oid.js"
}
```

---

### B3. Add content projection function

File:

```text
packages/pi-context/src/block-api.ts
```

Add:

```ts
export const IDENTITY_METADATA_FIELDS = new Set([
	"id",
	"oid",
	"content_hash",
	"content_parent",
	"created_by",
	"created_at",
	"modified_by",
	"modified_at",
	"closed_by",
	"closed_at",
]);

export function contentProjection(item: Record<string, unknown>): Record<string, unknown>;
```

---

### B4. Add identity preparation helpers

File:

```text
packages/pi-context/src/block-api.ts
```

Add:

```ts
export function prepareNewItemIdentity(
	cwd: string,
	item: Record<string, unknown>,
): Record<string, unknown>;

export function prepareUpdatedItemIdentity(
	prior: Record<string, unknown>,
	next: Record<string, unknown>,
): Record<string, unknown>;
```

Behavior:

- new item:
  - if `oid` absent, mint it;
  - compute `content_hash`.

- updated item:
  - preserve prior `oid`;
  - throw if update attempts different `oid`;
  - recompute `content_hash`;
  - if content hash changes and prior hash exists, set `content_parent = prior.content_hash`;
  - if content hash does not change, preserve prior `content_parent`.

---

### B5. Wire all birth/update paths

Update:

```text
appendToTypedFile
updateItemInTypedFile
upsertItemInTypedFile
writeBlock
```

Required behavior:

- append stamps missing identity;
- upsert create stamps missing identity;
- update preserves OID and recomputes hash;
- whole-block write normalizes every top-level block item before validation.

Do not rely on `autoId`.

`autoId` only mints refnames.

---

### B6. Tests

Add tests:

- append with caller-supplied `id` gets `oid` and `content_hash`;
- append with `autoId` gets `id`, `oid`, and `content_hash`;
- upsert-create gets identity;
- update preserves `oid`;
- update rejects `oid` mutation;
- `id` rename does not change `content_hash`.

---

## Phase C — Schema updates

### C1. Update all item schemas

For all schemas under:

```text
packages/pi-context/samples/schemas/*.schema.json
```

Add to item properties:

```json
"oid": {
  "type": "string",
  "pattern": "^[0-9a-f]{32}$",
  "description": "Immutable item entity identity."
},
"content_hash": {
  "type": "string",
  "pattern": "^[0-9a-f]{64}$",
  "description": "SHA-256 hash of canonical content projection."
},
"content_parent": {
  "type": "string",
  "pattern": "^[0-9a-f]{64}$",
  "description": "Previous content_hash when content changed."
}
```

Do not add these fields to `required`.

---

### C2. Bump schema versions

For each edited schema, bump semver by one minor version.

---

### C3. Update live substrate schemas

For every live substrate in this repo:

```text
.project
.context
.context-jit-spec-v2
```

update corresponding live:

```text
schemas/*.schema.json
```

before writing identity fields.

---

### C4. Migration declarations

Add identity migrations for each bumped schema version in each substrate migration registry.

---

## Phase D — Substrate identity and registry

### D1. Config schema

Update:

```text
packages/pi-context/schemas/config.schema.json
```

Add:

```json
"substrate_id": {
  "type": "string",
  "pattern": "^sub-[0-9a-f]{16}$"
}
```

Bump config schema version.

---

### D2. ConfigBlock type

Update:

```text
packages/pi-context/src/context.ts
```

Add to `ConfigBlock`:

```ts
substrate_id?: string;
```

---

### D3. Registry schema

New file:

```text
packages/pi-context/schemas/context-registry.schema.json
```

Shape:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "pi-context://schemas/context-registry",
  "version": "1.0.0",
  "type": "object",
  "required": ["version", "substrates"],
  "additionalProperties": false,
  "properties": {
    "version": { "type": "string" },
    "substrates": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "required": ["dir", "aliases"],
        "additionalProperties": false,
        "properties": {
          "dir": { "type": "string" },
          "aliases": {
            "type": "array",
            "items": { "type": "string" }
          }
        }
      }
    }
  }
}
```

---

### D4. Registry API

New file:

```text
packages/pi-context/src/context-registry.ts
```

Exports:

```ts
export interface ContextRegistry {
	version: string;
	substrates: Record<string, { dir: string; aliases: string[] }>;
}

export function loadContextRegistry(cwd: string): ContextRegistry;
export function writeContextRegistry(cwd: string, registry: ContextRegistry): void;
export function registerSubstrate(cwd: string, substrateId: string, dir: string, aliases: string[]): void;
export function resolveSubstrateAlias(cwd: string, aliasOrId: string): { substrate_id: string; dir: string } | null;
```

---

### D5. Init integration

Update `/context init` and `context-init` implementation:

- mint `substrate_id`;
- write it to new substrate config;
- register substrate in `.pi-context-registry.json`;
- add aliases:
  ```text
  <dir>
  basename without leading dot
  project for .project
  ```

---

## Phase E — Shared resolver

### E1. Generalize indexing

File:

```text
packages/pi-context/src/context-sdk.ts
```

Add:

```ts
export interface SubstrateIndex {
	substrate_id: string;
	dir: string;
	byRefname: Map<string, ItemLocation>;
	byOid: Map<string, ItemLocation>;
	items: ItemLocation[];
}

export function buildSubstrateIndex(cwd: string, substrateDir: string): SubstrateIndex;
export function buildActiveSubstrateIndex(cwd: string): SubstrateIndex;
```

Rules:

- `items[]` contains each item exactly once.
- `byRefname` indexes `item.id`.
- `byOid` indexes `item.oid`.

---

### E2. Add resolver

File:

```text
packages/pi-context/src/context-sdk.ts
```

Add:

```ts
export function resolveRef(cwd: string, ref: string): ResolvedRef;
```

Resolution:

1. If `ref` has prefix `<alias>:`:
   - resolve alias through registry;
   - index that substrate;
   - resolve remainder by refname or OID;
   - found → `foreign` unless alias points to active substrate;
   - alias missing → `unregistered`;
   - item missing → `dangling`.

2. If bare ref:
   - resolve in active substrate only;
   - found by refname or OID → `active`;
   - not found → `dangling`.

---

### E3. Preserve legacy functions

Keep:

```ts
buildIdIndex
resolveItemById
resolveItemsByIds
```

Implement them as compatibility wrappers over the new resolver/index.

Do not expose duplicate-key maps to invariant iteration.

---

## Phase F — Relation endpoint migration support

### F1. Relation endpoint type

File:

```text
packages/pi-context/src/context.ts
```

Add:

```ts
export type RelationEndpoint =
	| {
			kind: "item";
			oid: string;
			substrate_id?: string;
			refname_hint?: string;
			content_hash?: string;
	  }
	| {
			kind: "lens_bin";
			lens_id: string;
			bin: string;
	  };

export interface Edge {
	parent: RelationEndpoint;
	child: RelationEndpoint;
	relation_type: string;
	ordinal?: number;
}
```

---

### F2. Transitional compatibility

During migration, support both old and new edge shapes:

```ts
type LegacyEdge = {
	parent: string;
	child: string;
	relation_type: string;
	ordinal?: number;
};
```

Read path normalizes legacy edges into internal `Edge` values.

Write path writes only new shape after migration.

---

### F3. Relations schema

Update:

```text
packages/pi-context/schemas/relations.schema.json
```

Allow discriminated endpoint objects.

Bump version.

---

## Phase G — Lens-bin compatibility

### G1. Detect lens-bin endpoints during migration

Migration rule:

```text
If edge.relation_type maps to a lens and edge.parent is one of lens.bins,
then parent endpoint becomes:
{ kind: "lens_bin", lens_id: lens.id, bin: edge.parent }
```

Child endpoint is resolved as an item.

---

### G2. Validator branch

Update `validateRelations`.

For lens relation:

- `parent.kind` must be `lens_bin`;
- `parent.lens_id` must match the lens;
- `parent.bin` must be in `lens.bins`;
- `child.kind` must be `item`;
- child item must resolve;
- child block must match `lens.target` when set.

For ordinary item relation:

- `parent.kind` must be `item`;
- `child.kind` must be `item`;
- source/target kind checks use resolved item block kinds.

---

### G3. Renderer branch

Lens view rendering groups by:

```ts
edge.parent.kind === "lens_bin" ? edge.parent.bin : legacyBin
```

No UI displays OIDs.

---

## Phase H — Porcelain relation API

### H1. Add public relation append by ref

File:

```text
packages/pi-context/src/context-sdk.ts
```

Add:

```ts
export function appendRelationByRef(
	cwd: string,
	input: {
		parent: string;
		child: string;
		relation_type: string;
		ordinal?: number;
	},
	ctx?: DispatchContext,
): { appended: boolean };
```

Behavior:

- if relation type maps to a lens and parent matches a bin:
  - parent endpoint = lens_bin;
- otherwise:
  - resolve parent as item;
- resolve child as item;
- write machine endpoint relation through raw `appendRelation`.

---

### H2. Update Pi tool

Update `append-relation` tool in:

```text
packages/pi-context/src/index.ts
```

to call `appendRelationByRef`, not raw `appendRelation`.

Tool signature remains unchanged:

```json
{
  "parent": "DEC-0011",
  "child": ".project:FGAP-169",
  "relation_type": "decision_addresses_gap"
}
```

---

### H3. Update CLI twin

Update:

```text
scripts/orchestrator/append-relation.ts
```

to call `appendRelationByRef`.

---

## Phase I — Promotion API

### I1. Add relation type to canonical config

Add to sample conception and live configs:

```json
{
  "canonical_id": "item_derived_from_item",
  "display_name": "derived from",
  "category": "data_flow",
  "source_kinds": ["*"],
  "target_kinds": ["*"]
}
```

---

### I2. Add promotion library

New file:

```text
packages/pi-context/src/promote-item.ts
```

Exports:

```ts
export interface PromoteItemInput {
	source: string;
	destinationSubstrate: string;
	newRefname?: string;
}

export interface PromotionResult {
	source: ResolvedRef;
	destination: ResolvedRef;
	lineageEdgeAppended: boolean;
}

export function promoteItem(
	cwd: string,
	input: PromoteItemInput,
	ctx?: DispatchContext,
): PromotionResult;
```

---

### I3. Promotion implementation

Algorithm:

1. `resolveRef(cwd, input.source)`.
2. Throw unless source is an item.
3. Resolve `input.destinationSubstrate` through registry.
4. Load destination config and schema.
5. Copy source content projection.
6. Assign destination `id`:
   - use `input.newRefname` if provided;
   - otherwise allocate with destination block’s `nextId` equivalent.
7. Mint destination `oid`.
8. Compute destination `content_hash`.
9. Validate destination item against destination schema.
10. Append destination item.
11. Append lineage relation:
    ```text
    destination -[item_derived_from_item]-> source@source.content_hash
    ```
12. Return both friendly refs and machine locations.

---

### I4. Add Pi tool

Add tool:

```text
promote-item
```

Parameters:

```json
{
  "source": "string",
  "destinationSubstrate": "string",
  "newRefname": "optional string"
}
```

Example:

```json
{
  "source": ".context-jit-spec-v2:DEC-0011",
  "destinationSubstrate": ".project"
}
```

---

### I5. Add CLI twin

New script:

```text
scripts/orchestrator/promote-item.ts
```

Arguments:

```text
--source <selector>
--to <substrate-alias>
--new-refname <optional>
--dry-run
```

---

### I6. Promotion tests

Tests:

- promote local item to `.project`;
- destination gets new OID;
- destination `content_hash` equals copied content projection hash;
- lineage edge points to source with pinned source content hash;
- source remains unchanged;
- destination refname collision is rejected;
- source OID and destination OID differ;
- no existing relations are retargeted.

---

## Phase J — Validator wiring

### J1. `validateContext`

Update:

```text
packages/pi-context/src/context-sdk.ts
```

Replace direct `idIndex.has(edge.parent)` with endpoint-aware resolution.

Valid statuses:

```text
active
foreign
virtual
```

Invalid statuses:

```text
dangling
unregistered
```

---

### J2. Invariant checking

When checking invariant satisfaction:

- use each item’s OID for relation matching after migration;
- use `SubstrateIndex.items[]` for item iteration;
- compare relation endpoints through helper:
  ```ts
  endpointMatchesItem(endpoint, itemLocation): boolean
  ```

---

### J3. Status consistency

When resolving “other endpoint,” use resolver/index to get item location from OID endpoint.

Foreign items may satisfy endpoint resolution, but status consistency should compare status only if the foreign item’s block/status schema is readable.

If unreadable, emit warning.

---

## Phase K — Migration engine

### K1. New migration module

New file:

```text
packages/pi-context/src/migrate-identity.ts
```

Exports:

```ts
export interface IdentityMigrationReport {
	dryRun: boolean;
	substrates: Array<{
		dir: string;
		substrate_id: string;
		items_seen: number;
		oids_minted: number;
		hashes_written: number;
	}>;
	edges_seen: number;
	edges_rewritten: number;
	cross_substrate_edges: number;
	lens_bin_edges: number;
	unresolved: Array<{ substrate: string; ref: string; reason: string }>;
}

export function migrateIdentity(cwd: string, opts?: { dryRun?: boolean }): IdentityMigrationReport;
```

---

### K2. Migration order

1. Discover substrates:
   ```text
   dirs under cwd with config.json
   ```

2. Ensure each config has `substrate_id`.

3. Register each substrate in `.pi-context-registry.json`.

4. Ensure live schemas accept identity fields.

5. Backfill each item:
   - `oid`;
   - `content_hash`.

6. Rewrite each relation:
   - lens-bin parent → `kind: lens_bin`;
   - item refs → `kind: item`;
   - `project:<ref>` → alias `project` → `.project` → item OID;
   - unresolved refs go to report and block successful completion.

7. Write migrated files atomically.

---

### K3. Idempotency

Second run must report:

```text
oids_minted: 0
edges_rewritten: 0
unresolved: []
```

---

### K4. Tool and CLI

Add Pi tool:

```text
migrate-identity
```

Add script:

```text
scripts/orchestrator/migrate-identity.ts
```

Both expose:

```json
{ "dryRun": true }
```

---

# 8. Required Tests

## 8.1 Content hash tests

- Hash stable under key reorder.
- Hash unchanged by metadata edits.
- Hash unchanged by refname rename.
- Hash changed by content edit.

## 8.2 OID tests

- OID minted once on append.
- OID preserved on update.
- OID mutation rejected.
- Two identical content items get different OIDs.

## 8.3 Registry tests

- Register two substrates.
- Resolve alias `.project`.
- Resolve alias `project`.
- Detect registry/config substrate_id mismatch.

## 8.4 Resolver tests

- Resolve active refname.
- Resolve active OID.
- Resolve foreign alias refname.
- Resolve foreign OID.
- Missing alias returns `unregistered`.
- Missing item in registered substrate returns `dangling`.

## 8.5 Relation tests

- Public append accepts `DEC-0011 -> .project:FGAP-169`.
- Stored edge uses item endpoint objects.
- Rendered edge displays friendly refnames.
- Lens-bin edge stores `kind: lens_bin`.

## 8.6 Lens-bin tests

- Valid lens-bin parent passes.
- Unknown lens bin fails.
- Lens-bin endpoint under non-lens relation fails.
- Migrated lens edge preserves grouping behavior.

## 8.7 Promotion tests

- Promote source item to destination substrate.
- Destination item gets new OID.
- Destination item gets valid refname.
- Lineage edge pins source content hash.
- Source item remains unchanged.
- Existing relations are not silently retargeted.
- Destination schema validation failure aborts promotion.
- Promotion dry-run writes nothing.

## 8.8 Validator tests

- Foreign resolved item edge is clean.
- Unregistered substrate edge is error.
- Dangling foreign item edge is error.
- Lens-bin parent validates against lens bins.
- Wrong lens-bin name is error.
- Ordinary relation with lens-bin endpoint is error.
- Lineage edge validates across substrates.

## 8.9 Migration tests

- Migration backfills all items.
- Migration rewrites legacy `project:` refs through alias.
- Migration preserves item counts.
- Migration preserves relation counts.
- Migration classifies lens-bin edges correctly.
- Migration is idempotent.

---

# 9. Runtime Demonstrations

## 9.1 Identity migration dry run

```bash
npx tsx scripts/orchestrator/migrate-identity.ts --dry-run
```

Expected:

```text
reports all substrates
reports item counts
reports relation rewrite counts
reports unresolved refs, if any
no writes
```

---

## 9.2 Identity migration actual run

```bash
npx tsx scripts/orchestrator/migrate-identity.ts
```

Expected:

```text
all items receive oid and content_hash
relations rewritten
registry written
```

---

## 9.3 Cross-substrate resolution

```bash
npx tsx -e "import {resolveRef} from '@davidorex/pi-context/context-sdk'; console.log(resolveRef('.', '.project:FGAP-169').status)"
```

Expected:

```text
foreign
```

---

## 9.4 Validator reduction

```bash
npx tsx -e "import {validateContext} from '@davidorex/pi-context/context-sdk'; const r=validateContext('.'); console.log(r.issues.filter(i=>i.message.includes('does not resolve')).length)"
```

Expected after migration:

```text
0
```

for the prior unresolved `project:FGAP-*` edge class.

---

## 9.5 Promotion demo

```bash
npx tsx scripts/orchestrator/promote-item.ts \
  --source .context-jit-spec-v2:DEC-0011 \
  --to .project \
  --dry-run
```

Expected:

```text
source resolves
destination substrate resolves
new destination refname planned
new OID planned
lineage edge planned
no writes
```

Actual run:

```bash
npx tsx scripts/orchestrator/promote-item.ts \
  --source .context-jit-spec-v2:DEC-0011 \
  --to .project
```

Expected:

```text
destination item written
new OID minted
lineage edge written
validation passes for lineage relation
```

---

# 10. Adversarial Probes

## 10.1 Metadata hash probe

Rename an item refname.

Expected:

```text
oid unchanged
content_hash unchanged
relations remain valid
```

---

## 10.2 OID mutation probe

Attempt to update an item with a different `oid`.

Expected:

```text
write rejected
```

---

## 10.3 Registry removal probe

Remove `.project` from registry and validate.

Expected:

```text
foreign edges become unregistered errors
```

---

## 10.4 Dangling item probe

Keep `.project` registered but point an edge to a nonexistent OID.

Expected:

```text
dangling error
```

---

## 10.5 Lens-bin probe

Create lens edge with bin typo.

Expected:

```text
edge_parent_not_in_bins
```

Create ordinary item relation with lens-bin endpoint.

Expected:

```text
endpoint kind error
```

---

## 10.6 Promotion identity probe

Promote an item.

Expected:

```text
source oid != destination oid
lineage source content_hash equals source hash at promotion time
source item unchanged
```

---

## 10.7 No silent retargeting probe

Promote an item that has existing inbound/outbound relations.

Expected:

```text
existing relations still target source item
only new lineage edge is added
no automatic relation retargeting occurs
```

---

# 11. Ordering Constraints

1. Schema changes land before identity fields are written.
2. Registry lands before cross-substrate resolution.
3. Resolver lands before relation migration.
4. Lens-bin endpoint support lands before relation migration.
5. Porcelain relation writer lands before public tools write OID endpoints.
6. Promotion relation type lands before promotion tool.
7. Migration runs only after resolver, registry, schema, lens-bin, and relation endpoint support are built.
8. Promotion runs only after relation endpoint and cross-substrate resolver support are built.

---

# 12. Non-Goals

This work does not include:

- full interactive merge UI;
- batch promotion;
- automatic relation retargeting;
- branch-like promotion policy engine;
- durable immutable object store;
- full Git-style Merkle object database.

This work **does** include:

- stable item identity;
- content hash;
- substrate registry;
- cross-substrate resolution;
- lens-bin endpoint preservation;
- relation endpoint migration;
- single-item promotion with lineage.
```