# Pi-Context from Claude Code Side — Canonical Operator How-To

**Date:** 2026-05-30
**Status:** Interim canonical reference until FGAP-182 (self-documenting substrate) lands.
**Audience:** Claude Code orchestrator-LLM operating in this project (or future pi-context-consuming project).
**Companion:** Pi tool surface (registered in `packages/pi-context/src/index.ts`) is the equivalent for in-pi-agent dispatch — different consumer, same canonical library underneath.

This document covers the Claude-Code-side surfaces: the `/context` slash command family + the orchestrator scripts at `scripts/orchestrator/*.ts` + the underlying library primitives. Companion to substrate items (DEC / FGAP / TASK / FEAT queryable via readBlock) and analysis MDs (deep dives).

**Active substrate.** Commands here operate on THE ACTIVE substrate — the dir named by `.pi-context.json`'s `contextDir` field (resolve it; do not assume a name). All substrate-write examples below use substrate-agnostic phrasing ("the active substrate"). The project-root registry `.pi-context-registry.json` enumerates ALL substrates by `substrate_id`; the pointer names the single active one. `.project` (substrate_id `sub-0c813fd84348d4c2`, alias `project`) is a registered FROZEN content-addressed archive — read-only, the supersession target of cross-substrate edges, not an everyday write target. `.project-archived` is the inert pre-migration original (not registered, not a write target).

---

## Quick reference

| I want to... | Use |
|---|---|
| See substrate state at a glance | `/context status` slash command OR `npx tsx scripts/orchestrator/current-state.ts` |
| Initialize a substrate dir | `/context init <dir>` then `/context accept-all` then `/context install` |
| Switch between substrate dirs | `/context switch <dir>` or `/context switch -c <new>` or `/context switch -` |
| List substrate dirs | `/context list` |
| Archive a substrate dir | `/context archive <dir>` |
| File a new substrate item (FGAP / TASK / DEC / etc.) | `npx tsx scripts/orchestrator/file-block-item.ts --block <kind> --writer human:email --auto-id --item @/tmp/<id>.json` |
| Update an existing item's status / fields | `npx tsx -e 'import {updateItemInBlock} from "@davidorex/pi-context/block-api"; ...'` |
| Add a relations edge | `npx tsx scripts/orchestrator/append-relation.ts --parent <id> --child <id> --relation-type <rt>` (one edge per invocation; loop at orchestrator level) |
| Author a schema | `npx tsx scripts/orchestrator/write-schema.ts` |
| Register a new block kind / relation_type | `npx tsx scripts/orchestrator/amend-config.ts --registry <reg> --operation add --key <key> --entry @path` |
| Read an item by id | `npx tsx scripts/orchestrator/read-block-item.ts --block <kind> --id <id>` |
| Find what edges reference an item | `npx tsx scripts/orchestrator/find-references.ts --item-id <id>` |
| Compose context for a task / unit | `npx tsx scripts/orchestrator/compile-task-context.ts ...` (or compile-explore-context / compile-implementation-context / compile-preamble-context per purpose) |
| Validate substrate (cross-block + relations) | `/context validate` slash command |
| Build HTML view of substrate | `npx tsx scripts/orchestrator/build-html-views.ts` |

---

## The /context slash command family

### Discovery + state

**`/context status`** — derived substrate state. Returns: substrate dir + pointer state; counts per block kind; recent items; configuration health. Read-only. No auth-gate.

**`/context list`** — enumerate discoverable substrate dirs in cwd (scan for dirs with config.json). Marks the active one (matches current pointer). Read-only. No auth-gate.

**`/context validate`** — cross-block referential integrity + lens-validator dispatch. Returns `{status, issues[]}`. Read-only. No auth-gate. Closure-table edge validation is NOT a slash subcommand; reach it via the `context-validate-relations` Pi tool (`pi -p "call context-validate-relations"`).

### Bootstrap + install

**`/context init <dir>`** — bootstrap `.pi-context.json` pointer + create substrate dir + create `schemas/` subdir. Does NOT populate config or blocks (run `/context accept-all` + `/context install` after). Behavior: refuses with structured guide-message if existing pointer's contextDir differs from caller's arg (per FGAP-179 fix); idempotent when args match existing pointer. Auth-gate fires per FGAP-134/138.

**`/context accept-all`** — adopt `packages/pi-context/samples/conception.json` as the substrate's `config.json` (full vocabulary — block_kinds + relation_types + lenses + installed_schemas + installed_blocks). Root-overridden; idempotent never-clobber. Writes config.json only. Auth-gate fires.

**`/context install`** — copies declared `installed_schemas[]` + `installed_blocks[]` from the samples catalog (`samples/schemas/` + `samples/blocks/`) into the substrate's `schemas/` + root. Use `--update` to overwrite. Auth-gate fires.

### Switch family (per TASK-094)

**`/context switch <existing-dir>`** — flip pointer to existing substrate dir. Validates target dir has `config.json` (refuses non-substrate target). Auth-gate fires.

**`/context switch -c <new-dir>`** — bootstrap new substrate dir AND flip pointer in one operation. Use this for cutover. Auth-gate fires.

**`/context switch -`** — flip to previous contextDir per `pointer.previous_contextDir` field. Refuses with structured error when previous_contextDir absent (e.g., first switch from initial bootstrap). Auth-gate fires.

**`/context archive <dir>`** — move substrate dir to `archive/<dir>/`. Refuses to archive the active substrate (matches current pointer). Auth-gate fires.

### Pointer-history fields stamped per switch (since v1.1.0)

- `contextDir` — current active substrate
- `previous_contextDir` — last-flip-from (single-slot; not full history)
- `version` — `1.1.0` post-TASK-094
- `created_at` — original-bootstrap timestamp; preserved across all flips
- `switched_at` — most-recent flip timestamp
- `switched_by` — verified-identity email (per the `getVerifiedOperatorIdentity` cascade: git config user.email → process.env.USER → null)

---

## The orchestrator scripts grouped by purpose

### Reading substrate state

| Script | Purpose |
|---|---|
| `bootstrap-state.ts` | Derive bootstrap state ('no-pointer' / 'no-config' / 'not-installed' / 'ready') from filesystem; never throws on un-bootstrapped substrate |
| `current-state.ts` | Full substrate-state snapshot (block counts, item counts, config registries) |
| `read-block-item.ts` | Single item by id from a block |
| `read-block-page.ts` | Paginated read of a block's items |
| `read-config.ts` | Config.json read (full or scoped to one registry) |
| `read-config-operations.ts` | Read config.tool_operations[] entries (composite-tool grants) |
| `read-samples-catalog.ts` | Read packaged conception.json catalog |
| `read-schema.ts` | Read a block-kind schema by name |
| `resolve-items-by-id.ts` | Batch resolve items across blocks by id array |
| `filter-block-items.ts` | Filter a block's items by predicate |
| `find-references.ts` | Find all edges referencing an item; `--direction` inbound/outbound/both |
| `walk-ancestors.ts` | Traverse closure-table ancestors of an item via relation_type |
| `join-blocks.ts` | Cross-block join via shared id field |
| `gather-execution-context.ts` | Compose ContextBundle per declared context-contract for unit-kind |
| `extract-decs.ts` | Extract DEC entries to formatted output (markdown / json) |
| `extract-feedback.ts` | Extract feedback memories from operator-private memory dir |
| `extract-mandates.ts` | Extract mandates from operator-private mandate dir |
| `extract-task-progress.ts` | Extract TASK-NNN progress state across substrate |
| `extract-markdown-section.ts` | Extract named section from a markdown file (for context composition) |
| `extract-test-import-chains.ts` | Analyze test file import chains for impact analysis |

### Writing substrate

| Script | Purpose |
|---|---|
| `file-block-item.ts` | Append a new item to a block. `--auto-id` allocates next per schema id pattern. `--show-schema` displays required fields. `--dry-run` validates without writing. `--writer human:email` stamps DispatchContext attestation. |
| `amend-config.ts` | Add / replace / remove ONE entry in ONE config registry (block_kinds / relation_types / lenses / layers / invariants / status_buckets / display_strings / naming / installed_schemas / installed_blocks / hierarchy). `--dry-run` previews. |
| `append-relation.ts` | Append an edge to relations.json with parent + child + relation_type |
| `write-schema.ts` | Create or replace a block-kind JSON Schema. AJV meta-validated. Atomic write. |
| `accept-all.ts` | Run `/context accept-all` operation (adopt packaged conception as config.json) |
| `migrate-canonical-id.ts` | Rename a canonical_id (the rare deliberate-rename path; canonical_ids are primary-key-permanent). Wraps the FGAP-060 / DEC-0035 `renameCanonicalId` engine. `--kind` ∈ {item, relation_type, lens, layer} (block_kind unsupported — engine throws). Operates on the EDGE model (DEC-0013): references live only as relations.json edges, so there is NO inline-FK sweep. Out-of-substrate occurrences (analysis MDs, git history) are REPORTED, never rewritten. `--dry-run` computes would-change counts. |

### Content-addressed identity lifecycle

| Script | Purpose |
|---|---|
| `promote-item.ts` | CROSS-SUBSTRATE item derivation. Copies a source item into a registered destination substrate as a NEW content-addressed item (dest mints fresh oid + content_hash + content object), files an `item_derived_from_item` lineage edge into the dest relations.json, and — when the source status enum supports it — marks the source superseded. `--source <selector> --to <dest-alias>`. NOT a nested→top promoter. |
| `canonicalize-substrate.ts` | One-shot canonicalizer for the active substrate: promotes each nested id-bearing array → top-level entity block + ordinal-bearing membership edges, plus registers orphan blocks. Adds a triple-buffer (dupe / verify / swap) to de-risk the one-shot transform (the Pi-tool twin canonicalizes in place without it). |
| `migrate-content-addressed.ts` | Backfills the content-addressing model (`migrateToContentAddressed`): mints identity + builds the object store + rewrites endpoints. Prints the MigrationReport JSON; exits non-zero when `unresolved[]` is non-empty on a non-dry-run. |
| `land-identity-fields.ts` | Surgically injects the three identity field DECLARATIONS (oid / content_hash / content_parent) as OPTIONAL item properties onto every registered block_kind schema of the TARGET substrate that lacks them (never added to `required`) — the precondition the migration's readiness gate checks. `--substrate <dir>` targets an explicit dir, not the active pointer. |
| `verify-substrate-dupe.ts` | Validates a work-dupe substrate against canonicalization/fold-in defect codes (`nested_id_bearing_array`, `edge_endpoint_dangling`, `edge_endpoint_unregistered`, `edge_parent_not_in_bins`, `edge_cycle_detected`); registry-level codes are expected for an unregistered dupe and intentionally excluded. |
| `wire-active-substrate.ts` | Wires the active substrate so its cross-substrate `project:<refname>` edges resolve into the FROZEN `.project` archive (read-only) via the project-root registry + the registry-fallback path. |
| `foldin-context.ts` | Folds a LEGACY already-flat substrate (predating the identity model) into the content-addressed canon via the same triple-buffer: de-nest its schema, land identity fields, then migrate. |

### Composing context

| Script | Purpose |
|---|---|
| `compile-task-context.ts` | Compose dispatch input for a task per its context-contract |
| `compile-explore-context.ts` | Compose dispatch input for exploration agent |
| `compile-implementation-context.ts` | Compose dispatch input for implementation agent |
| `compile-preamble-context.ts` | Compose binding-preamble for subagent briefs |
| `inject-context-items.ts` | Inject specific substrate items into a context bundle by id list |

### Composite-tool helpers

| Script | Purpose |
|---|---|
| `composite-command-allowlist.ts` | Compose command-allowlist composite tool |
| `composite-git-log.ts` | Compose git-log composite tool |
| `composite-grep-paths.ts` | Compose grep-paths composite tool |
| `composite-read-files.ts` | Compose read-files composite tool |

### Build / projection

| Script | Purpose |
|---|---|
| `build-html-views.ts` | Project the active substrate to a self-contained HTML view at `html-views/substrate-overview.html`; reads the active substrate's `*.json` via canonical block-api |

### Runtime demos

Each `runtime-demo-*.ts` exercises one primitive end-to-end against a real substrate (the LOAD-BEARING runtime-demonstration step of the completion sequence):

| Script | Purpose |
|---|---|
| `runtime-demo-context-switch.ts` | flipBootstrapPointer with pointer-history preservation assertions |
| `runtime-demo-whole-block-delegators.ts` | Render of whole-block delegators against real substrate |
| `runtime-demo-content-addressing.ts` | Content-hash + object-store write path |
| `runtime-demo-identity-stamping.ts` | oid / content_hash / content_parent stamping on a declaring schema |
| `runtime-demo-context-registry.ts` | Project-root registry resolve (substrate_id / alias) |
| `runtime-demo-resolve-ref.ts` | `resolveRef` four-way active / foreign / dangling / unregistered classification |
| `runtime-demo-structured-endpoints.ts` | Structured `{kind:"item", oid, …}` / `{kind:"lens_bin", bin}` endpoints |
| `runtime-demo-nested-id-guard.ts` | `nested_id_bearing_array` guard on schema write |
| `runtime-demo-substrate-index.ts` | `buildIdIndex` prefix invariant |
| `runtime-demo-promote-item.ts` | Cross-substrate promotion + lineage edge |
| `runtime-demo-canonicalize-substrate.ts` | Nested-array → top-level + membership-edge canonicalization |
| `runtime-demo-migrate-content-addressed.ts` | Content-addressing migration MigrationReport |
| `runtime-demo-land-identity-fields.ts` | Identity-field schema injection |
| `runtime-demo-dir-targeted-write.ts` | Explicit-dir-targeted write (non-active substrate) |
| `runtime-demo-write-ordering.ts` | Object persistence deferred until after AJV clears |

---

## Content-addressed substrate identity model

(Sourced from the doc-survey PART B §B.2–B.6; each claim grounded in a §ref. Cross-check: `analysis/2026-06-02-pi-context-doc-survey-and-source.md`.)

### Three-layer item identity (§B.2)

Every item in an identity-bearing block carries three identity fields plus a content-version chain:

- **`id` (refname)** — the human label (`DEC-0001`, `TASK-021`). MUTABLE; a label, not an identity.
- **`oid`** — 32-hex, content-INDEPENDENT, minted ONCE at birth and immutable thereafter. Salted by the substrate's `substrate_id` (two substrates minting with the same nonce get distinct oids). A different incoming oid on update throws.
- **`content_hash`** — 64-hex SHA-256 of the item's CONTENT PROJECTION (a shallow copy with the metadata fields deleted). Identical content ⇒ identical hash ⇒ dedup.
- **`content_parent`** — the prior version's `content_hash`; the per-item version chain. Advances only when content actually changed; a metadata-only write carries the prior parent forward (does not truncate the chain).

**Metadata partition** (excluded from the content hash): the mandatory floor `{id, oid, content_hash, content_parent}` is never hashable and no override can pull it in; the discretionary set is the four author fields + `closed_by` / `closed_at`. A schema's item subschema may redefine the discretionary set via `x-identity.metadata_fields`; the floor is still unioned in.

### Content store + the stamping gate (§B.2)

- **`objects/`** — on a stamping write the content projection is persisted to `<substrate>/objects/<content_hash>.json` (idempotent, atomic tmp+rename, content-addressed so identical content ⇒ byte-identical file). `objects/` is git-tracked — it is the integrity/version store. Object persistence is DEFERRED until AFTER the whole block clears AJV, so a validation failure never orphans an object.
- **Stamping gate:** identity stamping is a NO-OP unless the item's array subschema declares all three identity fields. This scopes identity to canonical schemas and leaves bespoke/test schemas untouched. (Use `land-identity-fields.ts` to inject the declarations onto a schema that lacks them.)

### substrate_id + the project-root registry (§B.4)

- **`config.substrate_id`** — per-substrate root identity, pattern `^sub-[0-9a-f]{16}$`, minted once, immutable on disk; reads throw loudly when absent (no degraded fallback).
- **`.pi-context-registry.json`** — project-root, git-tracked, distinct from the pointer. The pointer (`.pi-context.json`) names the one ACTIVE substrate; the registry enumerates ALL of them as `substrates: { <substrate_id>: { dir, aliases[] } }`. `resolveSubstrateDir(cwd, substrate_id)` / `resolveAlias(cwd, alias)` return null on a clean miss.

### Cross-substrate edges + resolveRef four-way classification (§B.3–B.4)

Inter-item relationships are closure-table edges in `<substrate>/relations.json` — `{parent, child, relation_type, ordinal?}` rows. Endpoints are DUAL-FORM, structured coexisting with legacy strings:

- a **legacy string** — a canonical id or a lens bin name; a `<alias>:<refname>` string is a cross-substrate sentinel;
- a structured **item endpoint** `{kind:"item", oid (required), refname?, substrate_id?, content_hash?}` — `substrate_id` present ⇒ foreign; `content_hash` carried for drift detection;
- a structured **lens_bin endpoint** `{kind:"lens_bin", bin}` — a virtual parent that NEVER resolves to an item.

`resolveRef(cwd, ref, opts?)` classifies any endpoint into four statuses:
- **active** — resolved in the active substrate index (a bare oid/refname, or a lens_bin, which is always active without item lookup);
- **foreign** — a structured `substrate_id` locator, or a `<alias>:<refname>` whose alias is registered, resolved in the foreign index;
- **dangling** — locator names a registered substrate but the oid/refname is absent there;
- **unregistered** — a `substrate_id`/alias the registry does not carry.

### Single-form relations rule — no nested id, no FK (§B.3)

All inter-item relationships are closure-table edges ONLY. FORBIDDEN: embedded nested id-bearing arrays and FK-as-field. A nested id-bearing array in a schema is flagged `nested_id_bearing_array` by `validateContext` with the remediation "promote to a top-level entity + membership edge". Containment is a membership edge carrying `ordinal`. The nested-array → top-level-entity + ordinal-bearing-membership-edge promotion is performed by `canonicalize-substrate` — distinct from `promote-item`, which is cross-substrate item derivation.

### Schema versioning + migrations (§B.5)

`migrations.json` is the per-substrate migration registry. A schema version bump REQUIRES a companion migration declaration via the `write-schema-migration` Pi tool; without one, read/write of an item declaring an older `schema_version` throws version-mismatch. Migration kinds: `identity` (shape-compatible, no transform) or `declarative-transform` (a TransformSpec of rename/set/delete/coerce on dotted paths). The loaded registry resolves the edge at next read/write so items walk forward without a process restart.

---

## Canonical workflows

### File a new substrate item (FGAP / TASK / DEC / VER / etc.)

```bash
# Discover schema requirements first
npx tsx scripts/orchestrator/file-block-item.ts --block framework-gaps --show-schema

# Compose item JSON via heredoc
cat > /tmp/new-fgap.json <<'EOF'
{
  "title": "...",
  "status": "identified",
  "priority": "P2",
  "package": "@davidorex/pi-context",
  "layer": "L4",
  "description": "...",
  "evidence": [{"file": "...", "reference": "..."}],
  "impact": "...",
  "proposed_resolution": "...",
  "created_by": "human:davidryan@gmail.com",
  "created_at": "2026-05-30T12:00:00Z"
}
EOF

# File via auto-id (allocates next per schema id pattern)
npx tsx scripts/orchestrator/file-block-item.ts \
  --block framework-gaps \
  --writer human:davidryan@gmail.com \
  --auto-id \
  --item @/tmp/new-fgap.json

# Commit the substrate write (the file written is the active substrate's framework-gaps.json)
git add <active-substrate>/framework-gaps.json   # resolve <active-substrate> from .pi-context.json contextDir
git commit -m "substrate(...): file FGAP-NNN — ..."
```

### Update an existing item's status / fields

```bash
npx tsx -e 'import {updateItemInBlock, readBlock} from "@davidorex/pi-context/block-api";
const existing = readBlock(".", "framework-gaps").gaps.find(g => g.id === "FGAP-NNN").proposed_resolution;
const closing = "Closing-citation (2026-MM-DD): ...";
updateItemInBlock(".", "framework-gaps", "gaps",
  item => item.id === "FGAP-NNN",
  {status: "closed", closed_by: "human:davidryan@gmail.com", closed_at: "2026-MM-DDTHH:MM:SSZ", proposed_resolution: existing + closing},
  {writer: {kind: "human", user: "davidryan@gmail.com"}}
);
console.log("FGAP-NNN updated");'
```

### Append relations edges (single)

```bash
npx tsx scripts/orchestrator/append-relation.ts \
  --parent TASK-NNN \
  --child FGAP-NNN \
  --relation-type gap_superseded_by_task
```

### Append relations edges (many — orchestrator-level loop, one invocation per edge)

Direct `fs` writes to ANY substrate JSON (including `relations.json`) are FORBIDDEN (CLAUDE.md "Project Blocks" — writes must route through validated, DispatchContext-stamped, atomic block-api primitives). Loop the canonical `append-relation.ts` at the orchestrator level, one edge per invocation:

```bash
npx tsx scripts/orchestrator/append-relation.ts \
  --parent TASK-NNN --child FGAP-NNN \
  --relation-type gap_superseded_by_task \
  --writer human:davidryan@gmail.com

npx tsx scripts/orchestrator/append-relation.ts \
  --parent VER-NNN --child TASK-NNN \
  --relation-type verification_verifies_item \
  --writer human:davidryan@gmail.com
```

(Each invocation writes one edge to the active substrate's `relations.json`. `--dry-run` validates without writing; `--ordinal N` orders siblings within `(parent, relation_type)`.)

### Cutover from one substrate dir to another (DEC-0036 pattern)

```
1. /context switch -c .context-new          # bootstrap new dir + flip pointer
2. /context accept-all                       # adopt packaged conception
3. /context install                          # copy schemas + empty blocks
4. (work in new substrate; existing remains as previous_contextDir)
5. /context archive .context-old             # when ready to deprecate old
```

### File substrate items into a non-active dir (RARE — filing into a frozen archive)

The everyday path files into the ACTIVE substrate via `file-block-item.ts` (the pointer already names it). The pattern below — temporarily flipping the pointer to a non-active dir, filing, then flipping back — is the RARE case. Writing into `.project` specifically is writing into a FROZEN content-addressed archive and is normally not done; prefer a cross-substrate edge (or `promote-item.ts` for a derived item) over reopening an archive. When it is genuinely warranted:

```bash
# 1. Flip pointer to target dir via library call (orchestrator-side; no auth-gate)
npx tsx -e 'import {flipBootstrapPointer} from "@davidorex/pi-context/context-dir";
flipBootstrapPointer(".", "<target-dir>", "human:davidryan@gmail.com");'

# 2. File via file-block-item (writes to the now-current pointer = <target-dir>)
npx tsx scripts/orchestrator/file-block-item.ts --block framework-gaps --writer human:davidryan@gmail.com --auto-id --item @/tmp/new.json

# 3. Flip pointer back to the prior active substrate
npx tsx -e 'import {flipBootstrapPointer} from "@davidorex/pi-context/context-dir";
flipBootstrapPointer(".", "<prior-active-dir>", "human:davidryan@gmail.com");'

# 4. Commit the substrate write (file modified in <target-dir>)
git add <target-dir>/framework-gaps.json .pi-context.json
git commit -m "substrate(<target-dir>): file FGAP-NNN via temporary pointer flip"
```

### Query "what items did SESSION-N touch"

`find-references.ts` is the canonical edge-query surface:

```bash
npx tsx scripts/orchestrator/find-references.ts --item-id SESSION-NNN --direction outbound
```

A read-only `fs.readFileSync` of the active substrate's `relations.json` is acceptable for ad-hoc filtering (reads are not gated; only WRITES route through block-api), but prefer `find-references.ts`:

```bash
npx tsx -e 'import fs from "node:fs";
const rels = JSON.parse(fs.readFileSync("<active-substrate>/relations.json","utf-8"));  // read-only; resolve <active-substrate> from the pointer
const touched = rels.filter(r => r.parent === "SESSION-NNN" && r.relation_type === "session_touches_item").map(r => r.child);
console.log(touched);'
```

### Add a custom block kind (per the session-notes example)

```bash
# 1. Author the JSON Schema for the new kind
npx tsx scripts/orchestrator/write-schema.ts \
  --operation create \
  --name my-custom-kind \
  --schema @/tmp/my-custom-kind.schema.json

# 2. Register in config.block_kinds[]
npx tsx scripts/orchestrator/amend-config.ts \
  --registry block_kinds \
  --operation add \
  --key my-custom-kind \
  --entry '{"canonical_id":"my-custom-kind","display_name":"My Custom Kind","prefix":"MYK-","array_key":"items","data_path":"my-custom-kind.json","schema_path":"schemas/my-custom-kind.schema.json"}'

# 3. Create the empty block CONTAINER in the active substrate
#    (initial container only; all subsequent ITEM writes route through file-block-item.ts)
npx tsx -e 'import fs from "node:fs"; fs.writeFileSync("<active-substrate>/my-custom-kind.json", JSON.stringify({schema_version:"1.0.0",items:[]},null,2));'  // resolve <active-substrate> from the pointer

# 4. Validate
# /context validate
```

### Add a custom relation_type

```bash
npx tsx scripts/orchestrator/amend-config.ts \
  --registry relation_types \
  --operation add \
  --key my_new_relation \
  --entry '{"canonical_id":"my_new_relation","display_name":"my new relation","category":"data_flow","source_kinds":["block-a"],"target_kinds":["block-b"]}'
```

`category` enum: `ordering` | `data_flow` | `membership`. `source_kinds` / `target_kinds` accept literal `"*"` wildcard for any-kind.

### Author + declare a schema migration

When a schema version bumps + existing items need a path forward:

The migration DECLARATION surface is the `write-schema-migration` Pi tool — there is no exported SDK subpath and no orchestrator-script twin for it (the migration-writer module is not in `package.json` `exports`, so a `dist/`-deep import is blocked by exports encapsulation). Author it via the Pi-tool bridge, then bump the schema via the `schema-write` SDK subpath:

```bash
# 1. Declare the migration into migrations.json (identity = shape-compatible, no transform)
#    Bucket-2 tool: fires the interactive auth-gate; run in an interactive Pi REPL.
pi -p 'call write-schema-migration with operation=create schemaName=framework-gaps fromVersion=1.0.0 toVersion=1.1.0 kind=identity writer.kind=human writer.user=davidryan@gmail.com' --mode json

# 2. Bump the schema via writeSchemaChecked (writes to the active substrate)
npx tsx -e 'import {writeSchemaChecked} from "@davidorex/pi-context/schema-write";
import fs from "node:fs";
const schema = JSON.parse(fs.readFileSync("/tmp/new-schema.json","utf-8"));
writeSchemaChecked(".", "framework-gaps", schema, "replace");'
```

(`kind=declarative-transform` requires a `transform` TransformSpec body; `operation=remove` drops a declaration matched by `(schemaName, fromVersion)`. The loaded MigrationRegistry resolves the recorded edge at next read/write so items walk forward without a process restart.)

---

## Auth-gate behavior (FGAP-134 / FGAP-138)

When invoking via **Pi tools** (`pi -p "call <tool>"`), the following tools fire an interactive `ctx.ui.confirm` prompt requiring operator authorization:

```
author-agent-spec, author-tool-grant, commit-attested
write-schema, write-schema-migration, amend-config, write-block, rename-canonical-id
context-init, context-accept-all, context-switch, context-archive
workflow-execute, workflow-resume, workflow-init
monitors-control, monitors-rules
```

`context-list` is NOT gated (read-only). Other read-only tools (read-block, find-references, current-state, etc.) are NOT gated.

When invoking via **orchestrator scripts** (`npx tsx scripts/orchestrator/*.ts`), auth-gate does NOT fire — operator-side library calls bypass auth-gate because the operator IS the authorized identity (per dual-surface convention per DEC-0019/0020). DispatchContext.writer is passed directly.

Non-interactive contexts (ctx.hasUI=false) get unconditional `block: true` from auth-gate for any Bucket-2 tool.

---

## Common errors + remediation

| Error | Meaning | Fix |
|---|---|---|
| `Missing --block <name>` | Forgot `--block` flag on file-block-item.ts or similar | Add `--block <name>` to invocation |
| `No .pi-context.json bootstrap pointer found` | Substrate not initialized in cwd | Run `/context init <dir>` |
| `No config.json found in substrate dir` | Pointer exists but config not adopted | Run `/context accept-all` |
| `pointer at <existing> differs from requested <new>` | `/context init <new>` against existing pointer (per FGAP-179 fix) | Use `/context switch -c <new>` instead |
| `must have required property X` | AJV schema violation; required field missing | Run with `--show-schema` to see required fields |
| `evidence needs {file, reference, lines?}, not strings` | Field shape error (objects expected, got strings) | Restructure to canonical shape per schema |
| `Tool <name> not found` | Pi extensions not loaded in current pi REPL | Either load extensions OR use orchestrator-script equivalent |
| `MigrationRegistry: no migrations registered for schema X (need v1.0.0 → v1.1.0)` | Block schema version bumped without companion migration declaration | Author identity migration via write-schema-migration |
| `Tool <name> requires interactive user-confirm; current context is non-interactive` | Bucket-2 tool invoked in headless context | Run in interactive Pi REPL OR use orchestrator-script equivalent |
| `Substrate validation failed` (cross-block) | `validateContext` found referential integrity violation | Read `/context validate` issues[] for specifics |
| `substrate_id_unregistered` (validateContext code) | The active `config.substrate_id` has no entry in `.pi-context-registry.json` | Register the substrate (its `substrate_id` → dir) in the project-root registry |
| `substrate_id_registry_mismatch` (validateContext code) | A registry entry exists for the active `substrate_id` but its `dir` does not resolve to the active substrate | Correct the registry entry's `dir` to match the active substrate's path |
| `edge_endpoint_dangling` (validateContext code) | An edge endpoint names a REGISTERED substrate but the oid/refname is absent there | Fix the endpoint's oid/refname, or remove the stale edge |
| `edge_endpoint_unregistered` (validateContext code) | An edge endpoint references a `substrate_id`/alias the registry does not carry | Register the referenced substrate, or correct the endpoint |
| `nested_id_bearing_array` (validateContext code) | A schema declares an embedded nested id-bearing array (forbidden single-form rule) | Promote to a top-level entity block + ordinal-bearing membership edge (run `canonicalize-substrate`) |

---

## Where to find more (until FGAP-182 self-documenting substrate lands)

| Source | Content |
|---|---|
| `packages/pi-context/skills/pi-context/SKILL.md` | Pi-extension-facing canonical reference (auto-generated; do not edit by hand) |
| `CLAUDE.md` | Project-discipline + canonical filing patterns + completion sequence + project conventions |
| `<active-substrate>/decisions.json` (queryable via readBlock) | DECs documenting architectural commitments + their rationale |
| `<active-substrate>/framework-gaps.json` (queryable) | FGAPs naming framework gaps + their proposed_resolution paths |
| `<active-substrate>/tasks.json` (queryable) | TASKs implementing FGAP fixes; status enum drives lifecycle |
| `<active-substrate>/features.json` (queryable) | FEATs as multi-task arc trackers |
| `<active-substrate>/session-notes.json` (queryable, when the active substrate ships the block kind) | Per-session narrative-not-derivable content (focus / discoveries / decisions / next_steps / current_status) |
| `.pi-context-registry.json` (project root) | Registry enumerating ALL substrates by `substrate_id` → dir + aliases |
| `analysis/*.md` | Deep dives + design possibilities + verification reports (in-repo + git-tracked) |
| `~/.claude/projects/<this>/memory/feedback_*.md` | Operator-private discipline-lessons accumulated across sessions |
| `~/.claude/projects/<this>/memory/MEMORY.md` | Index of feedback memories + project-state summary |
| `analysis/2026-05-30-jit-agents-spec-v2.md` + `.context-jit-spec-v2/` substrate | Current pi-jit-agents spec (v2). `docs/planning/jit-agents-spec.md` is the superseded v1 draft. |
| `packages/<pkg>/src/index.ts` | Pi tool + slash command registrations (search `pi.registerTool` / `pi.registerCommand`) |
| `scripts/orchestrator/*.ts` | This document's surface (per-script preamble in each .ts file) |
| `packages/pi-context/samples/conception.json` | Packaged conception (block_kinds + relation_types + lenses + status_buckets the framework ships) |

---

## The 3-layer discoverability story (per session FGAPs)

This document is the interim closure of Layer 3 (framework-use discoverability per FGAP-182). The full 3-layer story:

- **Layer 1 (FGAP-180 / TASK-095):** CLI elevation — `scripts/orchestrator/` becomes published `@davidorex/pi-context-cli` package; installable globally so downstream consumers get the dual-surface convenience without copying scripts.
- **Layer 2 (FGAP-181):** Per-script `--help` — robust description + params + examples per subcommand; most scripts currently lack the convention.
- **Layer 3 (FGAP-182):** Self-documenting substrate — `commands` / `tools` / `runbooks` / `patterns` / `concepts` / `errors` block kinds shipped via packaged conception; `/context help [topic]` slash command queries the guide blocks. Per analysis/2026-05-30-self-documenting-substrate-design.md.

This document is the bridge until Layer 3 lands. When the self-documenting substrate is implemented, this document's content migrates into the appropriate block kinds (commands → /context slash command family section; runbooks → canonical workflows section; concepts → auth-gate behavior section; errors → common errors table; etc.). At that point this document becomes archaeological reference.

---

## Maintenance

This document goes stale as the framework evolves. Until FGAP-182 substrate lands:

- Update this document when new slash commands or scripts are added (the Layer 2 `--help` per script becomes the per-script source of truth; this document carries the cross-cutting workflows + index)
- Cite FGAP / TASK / DEC ids inline only when they directly explain the operator-facing behavior (per the CLAUDE.md substrate-id strip discipline — provenance citations age out)
- When substantial surface change lands (new command family; new block kind shape; new dual-surface convention), prefer updating this document over scattering knowledge across analysis MDs

Last verified against codebase: 2026-06-02 (content-addressed substrate identity arc complete; the `.project-migrate` → `.project` rename done — `.project` now the registered frozen archive, `.project-archived` the inert pre-migration original; pointer schema v1.1.0).
