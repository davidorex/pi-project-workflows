# Pi-Context from Claude Code Side — Canonical Operator How-To

**Date:** 2026-05-30
**Status:** Interim canonical reference until FGAP-182 (self-documenting substrate) lands.
**Audience:** Claude Code orchestrator-LLM operating in this project (or future pi-context-consuming project).
**Companion:** Pi tool surface (registered in `packages/pi-context/src/index.ts`) is the equivalent for in-pi-agent dispatch — different consumer, same canonical library underneath.

This document covers the Claude-Code-side surfaces: the `/context` slash command family + 39 orchestrator scripts at `scripts/orchestrator/*.ts` + the underlying library primitives. Companion to substrate items (DEC / FGAP / TASK / FEAT queryable via readBlock) and analysis MDs (deep dives).

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
| Add a relations edge | `npx tsx scripts/orchestrator/append-relation.ts` OR direct `fs` append for batch |
| Author a schema | `npx tsx scripts/orchestrator/write-schema.ts` |
| Register a new block kind / relation_type | `npx tsx scripts/orchestrator/amend-config.ts --registry <reg> --operation add --key <key> --entry @path` |
| Read an item by id | `npx tsx scripts/orchestrator/read-block-item.ts --block <kind> --id <id>` |
| Find what edges reference an item | `npx tsx scripts/orchestrator/find-references.ts --itemId <id>` |
| Compose context for a task / unit | `npx tsx scripts/orchestrator/compile-task-context.ts ...` (or compile-explore-context / compile-implementation-context / compile-preamble-context per purpose) |
| Validate substrate (cross-block + relations) | `/context validate` slash command |
| Build HTML view of substrate | `npx tsx scripts/orchestrator/build-html-views.ts` |

---

## The /context slash command family

### Discovery + state

**`/context status`** — derived substrate state. Returns: substrate dir + pointer state; counts per block kind; recent items; configuration health. Read-only. No auth-gate.

**`/context list`** — enumerate discoverable substrate dirs in cwd (scan for dirs with config.json). Marks the active one (matches current pointer). Read-only. No auth-gate.

**`/context validate`** + **`/context validate-relations`** — cross-block referential integrity + lens-validator dispatch + edge validation. Returns `{status, issues[]}`. Read-only. No auth-gate.

### Bootstrap + install

**`/context init <dir>`** — bootstrap `.pi-context.json` pointer + create substrate dir + create `schemas/` subdir. Does NOT populate config or blocks (run `/context accept-all` + `/context install` after). Behavior: refuses with structured guide-message if existing pointer's contextDir differs from caller's arg (per FGAP-179 fix); idempotent when args match existing pointer. Auth-gate fires per FGAP-134/138.

**`/context accept-all`** — adopt `packages/pi-context/samples/conception.json` as the substrate's `config.json` (full vocabulary: 16 block_kinds + 28 relation_types + 2 lenses + 0 status_buckets + 0 layers + installed_schemas + installed_blocks). Root-overridden; idempotent never-clobber. Writes config.json only. Auth-gate fires.

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

## The 39 orchestrator scripts grouped by purpose

### Reading substrate state (20 scripts)

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

### Writing substrate (6 scripts)

| Script | Purpose |
|---|---|
| `file-block-item.ts` | Append a new item to a block. `--auto-id` allocates next per schema id pattern. `--show-schema` displays required fields. `--dry-run` validates without writing. `--writer human:email` stamps DispatchContext attestation. |
| `amend-config.ts` | Add / replace / remove ONE entry in ONE config registry (block_kinds / relation_types / lenses / layers / invariants / status_buckets / display_strings / naming / installed_schemas / installed_blocks / hierarchy). `--dry-run` previews. |
| `append-relation.ts` | Append an edge to relations.json with parent + child + relation_type |
| `write-schema.ts` | Create or replace a block-kind JSON Schema. AJV meta-validated. Atomic write. |
| `accept-all.ts` | Run `/context accept-all` operation (adopt packaged conception as config.json) |
| `migrate-canonical-id.ts` | Rename a substrate item's canonical_id; updates all references via canonical-id machinery |

### Composing context (5 scripts)

| Script | Purpose |
|---|---|
| `compile-task-context.ts` | Compose dispatch input for a task per its context-contract |
| `compile-explore-context.ts` | Compose dispatch input for exploration agent |
| `compile-implementation-context.ts` | Compose dispatch input for implementation agent |
| `compile-preamble-context.ts` | Compose binding-preamble for subagent briefs |
| `inject-context-items.ts` | Inject specific substrate items into a context bundle by id list |

### Composite-tool helpers (4 scripts)

| Script | Purpose |
|---|---|
| `composite-command-allowlist.ts` | Compose command-allowlist composite tool |
| `composite-git-log.ts` | Compose git-log composite tool |
| `composite-grep-paths.ts` | Compose grep-paths composite tool |
| `composite-read-files.ts` | Compose read-files composite tool |

### Build / projection (1 script)

| Script | Purpose |
|---|---|
| `build-html-views.ts` | Project substrate to self-contained HTML view at `html-views/substrate-overview.html`; reads `.project/*.json` via canonical block-api |

### Runtime demos (2 scripts)

| Script | Purpose |
|---|---|
| `runtime-demo-context-switch.ts` | End-to-end flipBootstrapPointer demo with pointer-history preservation assertions (6 assertions; per TASK-094 Step 10) |
| `runtime-demo-whole-block-delegators.ts` | End-to-end render of 6 whole-block delegators against real substrate (per FEAT-001 / TASK-093 Step 11) |

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

# Commit the substrate write
git add .project/framework-gaps.json  # or .context/ per active pointer
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

### Append relations edges (batch — direct fs append for many)

```bash
npx tsx -e 'import fs from "node:fs";
const rels = JSON.parse(fs.readFileSync(".project/relations.json","utf-8"));
rels.push({parent: "TASK-NNN", child: "FGAP-NNN", relation_type: "gap_superseded_by_task"});
rels.push({parent: "VER-NNN", child: "TASK-NNN", relation_type: "verification_verifies_item"});
fs.writeFileSync(".project/relations.json", JSON.stringify(rels, null, 2) + "\n");'
```

### Cutover from one substrate dir to another (DEC-0036 pattern)

```
1. /context switch -c .context-new          # bootstrap new dir + flip pointer
2. /context accept-all                       # adopt packaged conception
3. /context install                          # copy schemas + empty blocks
4. (work in new substrate; existing remains as previous_contextDir)
5. /context archive .context-old             # when ready to deprecate old
```

### File substrate items in a different dir than current pointer (sequence-continuation pattern)

Used 3x this session for continuing the .project FGAP/TASK sequence post-cutover to .context:

```bash
# 1. Flip pointer to target dir via library call (orchestrator-side; no auth-gate)
npx tsx -e 'import {flipBootstrapPointer} from "@davidorex/pi-context/context-dir";
flipBootstrapPointer(".", ".project", "human:davidryan@gmail.com");'

# 2. File via file-block-item (writes to current pointer = .project)
npx tsx scripts/orchestrator/file-block-item.ts --block framework-gaps --writer human:davidryan@gmail.com --auto-id --item @/tmp/new.json

# 3. Flip pointer back to canonical
npx tsx -e 'import {flipBootstrapPointer} from "@davidorex/pi-context/context-dir";
flipBootstrapPointer(".", ".context", "human:davidryan@gmail.com");'

# 4. Commit the substrate write (file modified in .project)
git add .project/framework-gaps.json .pi-context.json
git commit -m "substrate(.project): file FGAP-NNN via temporary pointer flip"
```

### Query "what items did SESSION-N touch"

Via canonical edge surface:

```bash
npx tsx scripts/orchestrator/find-references.ts --itemId SESSION-NNN --direction outbound
```

Or via direct readBlock on relations:

```bash
npx tsx -e 'import fs from "node:fs";
const rels = JSON.parse(fs.readFileSync(".context/relations.json","utf-8"));
const touched = rels.filter(r => r.parent === "SESSION-NNN" && r.relation_type === "session_touches_item").map(r => r.child);
console.log(touched);'
```

### Add a custom block kind (per the session-notes example)

```bash
# 1. Author the JSON Schema for the new kind
npx tsx scripts/orchestrator/write-schema.ts \
  --schema-name my-custom-kind \
  --schema @/tmp/my-custom-kind.schema.json

# 2. Register in config.block_kinds[]
npx tsx scripts/orchestrator/amend-config.ts \
  --registry block_kinds \
  --operation add \
  --key my-custom-kind \
  --entry '{"canonical_id":"my-custom-kind","display_name":"My Custom Kind","prefix":"MYK-","array_key":"items","data_path":"my-custom-kind.json","schema_path":"schemas/my-custom-kind.schema.json"}'

# 3. Create empty block file
npx tsx -e 'import fs from "node:fs"; fs.writeFileSync(".context/my-custom-kind.json", JSON.stringify({schema_version:"1.0.0",items:[]},null,2));'

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

```bash
# 1. Author migration declaration (identity = no-op for shape-compatible changes)
npx tsx -e 'import {writeSchemaMigrationExecute} from "@davidorex/pi-context/dist/write-schema-migration-tool.js";
await writeSchemaMigrationExecute(".", {
  operation: "create",
  schemaName: "framework-gaps",
  fromVersion: "1.0.0",
  toVersion: "1.1.0",
  kind: "identity",
  writer: {kind: "human", user: "davidryan@gmail.com"}
});'

# 2. Bump schema via writeSchemaChecked
npx tsx -e 'import {writeSchemaChecked} from "@davidorex/pi-context/schema-write";
import fs from "node:fs";
const schema = JSON.parse(fs.readFileSync("/tmp/new-schema.json","utf-8"));
writeSchemaChecked(".", "framework-gaps", schema, "replace");'
```

---

## Auth-gate behavior (FGAP-134 / FGAP-138)

When invoking via **Pi tools** (`pi -p "call <tool>"`), 17 tools fire interactive `ctx.ui.confirm` prompt requiring operator authorization:

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

---

## Where to find more (until FGAP-182 self-documenting substrate lands)

| Source | Content |
|---|---|
| `packages/pi-context/skills/pi-context/SKILL.md` | Pi-extension-facing canonical reference (auto-generated; do not edit by hand) |
| `CLAUDE.md` | Project-discipline + canonical filing patterns + completion sequence + project conventions |
| `.project/decisions.json` (queryable via readBlock) | DECs documenting architectural commitments + their rationale |
| `.project/framework-gaps.json` (queryable) | FGAPs naming framework gaps + their proposed_resolution paths |
| `.project/tasks.json` (queryable) | TASKs implementing FGAP fixes; status enum drives lifecycle |
| `.project/features.json` (queryable) | FEATs as multi-task arc trackers |
| `.context/session-notes.json` (queryable) | Per-session narrative-not-derivable content (focus / discoveries / decisions / next_steps / current_status); see SESSION-001 through SESSION-004 for this week's work |
| `analysis/*.md` | Deep dives + design possibilities + verification reports (gitignored: NO; in-repo + tracked) |
| `~/.claude/projects/<this>/memory/feedback_*.md` | Operator-private discipline-lessons accumulated across sessions; ~60 entries cover operator-experience-canon for working on this project |
| `~/.claude/projects/<this>/memory/MEMORY.md` | Index of feedback memories + project-state summary |
| `docs/planning/jit-agents-spec.md` | Canonical spec for pi-jit-agents (outlier per FGAP-177; v2 rewrite pending per SESSION-002) |
| `packages/<pkg>/src/index.ts` | Pi tool + slash command registrations (search `pi.registerTool` / `pi.registerCommand`) |
| `scripts/orchestrator/*.ts` | This document's surface (39 scripts; per-script preamble in each .ts file) |
| `packages/pi-context/samples/conception.json` | Packaged conception (block_kinds + relation_types + lenses + status_buckets the framework ships) |

---

## The 3-layer discoverability story (per session FGAPs)

This document is the interim closure of Layer 3 (framework-use discoverability per FGAP-182). The full 3-layer story:

- **Layer 1 (FGAP-180 / TASK-095):** CLI elevation — `scripts/orchestrator/` becomes published `@davidorex/pi-context-cli` package; installable globally so downstream consumers get the dual-surface convenience without copying scripts.
- **Layer 2 (FGAP-181):** Per-script `--help` — robust description + params + examples per subcommand; 37 of 39 scripts currently lack the convention.
- **Layer 3 (FGAP-182):** Self-documenting substrate — `commands` / `tools` / `runbooks` / `patterns` / `concepts` / `errors` block kinds shipped via packaged conception; `/context help [topic]` slash command queries the guide blocks. Per analysis/2026-05-30-self-documenting-substrate-design.md.

This document is the bridge until Layer 3 lands. When the self-documenting substrate is implemented, this document's content migrates into the appropriate block kinds (commands → /context slash command family section; runbooks → canonical workflows section; concepts → auth-gate behavior section; errors → common errors table; etc.). At that point this document becomes archaeological reference.

---

## Maintenance

This document goes stale as the framework evolves. Until FGAP-182 substrate lands:

- Update this document when new slash commands or scripts are added (the Layer 2 `--help` per script becomes the per-script source of truth; this document carries the cross-cutting workflows + index)
- Cite FGAP / TASK / DEC ids inline only when they directly explain the operator-facing behavior (per the CLAUDE.md substrate-id strip discipline — provenance citations age out)
- When substantial surface change lands (new command family; new block kind shape; new dual-surface convention), prefer updating this document over scattering knowledge across analysis MDs

Last verified against codebase: 2026-05-30 (TASK-094 / context switch family landed; 17 block kinds + 29 relation_types in packaged baseline; pointer schema v1.1.0).
