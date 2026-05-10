**Tool-surface gap audit** (subagent's 21-tool inventory + 15 enumerated gaps + 11 directly-encountered + SDK-promised gaps + empirical pain-point catalog from real LLM tasks against the surface):

## Practical-priority finding

The two tools that would have made the just-completed audit task trivial — **`filter-block-items(block, arrayKey, predicate)`** and **`resolve-items-by-id(id[])`** — collapse N-call serial probes into single calls. Direct cost surfaced: 90 issues, one question ("any with source=monitor?"), 15+ serial `resolve-item-by-id` calls for a probabilistic answer.

The SDK provides **~40% query surface coverage as tools**, mostly around project state + roadmap rendering. Workflow/agent/schema/relation discovery + schema-write remain SDK-only.

## Empirical task failures (real LLM tasks attempted against the surface)

### Multi-item operations (no filter primitive)

| Task | Why it fails | Calls wasted |
|------|-------------|-------------|
| "Show all open issues for pi-behavior-monitors" | No filter — would need 90 individual `resolve-item-by-id` calls then manual field check | 90 |
| "Show all closed framework gaps" | Same — 26 gaps × 1 call each, except block is >50KB so `read-block` truncates | 26+ |
| "List all enacted decisions" | 13 decisions, manageable but each is a manual resolve | 13 |
| "Show tasks with status=done under STORY-001" | Nested array inside FEAT-001 — no filter on nested items | manual scan of one feature read |
| "What issues are blocked on DEC-0001?" | No reverse-index. DEC-0001 cites issue-062 directly, but 14 other issues might reference DEC-0001 in body text — undiscoverable | ∞ |

**Missing**: `filter-block-items(block, arrayKey, predicate)` — one call replaces N.

### Cross-block graph traversal (no reverse walk, no batch resolve)

| Task | Why it fails |
|------|-------------|
| "What references DEC-0001 across all blocks?" | Can resolve DEC-0001 + see its `related_findings`, but can't find OTHER blocks that mention it. `project-validate` checks ID existence one direction only — tells me "issue-062 exists" when DEC-0001 cites it, but won't tell me "FGAP-008 also references DEC-0001 in `related_decisions`" |
| "Walk the full dependency graph of FEAT-001" | FEAT-001 lists `decisions: [DEC-0001, DEC-0002, DEC-0003]`. Each decision cites `related_findings`. Each finding might cite other blocks. Manual resolve every hop |
| "What's upstream of issue-062?" | DEC-0003 lists issue-043 as `related_finding`; DEC-0001 lists issue-062. `project-walk-descendants` goes down, not up. No ancestor walk |
| "Show DEC-0001/DEC-0002/DEC-0003 in one view" | Each is separate `resolve-item-by-id`. No batch resolve. 3 calls minimum for any cross-item analysis |

**Missing**: `project-walk-ancestors(childId, relationType)`, `resolve-items-by-id(id[])`, `find-references(targetId)` (cross-block reverse-index).

### Config & substrate inspection (no config tool, no per-schema read)

| Task | Why it fails |
|------|-------------|
| "What's in config.json?" | No `read-config` — config isn't a standard block. `project-edges-for-lens` errored because config.json doesn't even exist in this project |
| "What are the declared relation_types?" | Lives in config. No config tool, no answer |
| "What lenses are defined?" | Also config |
| "Read a specific schema" | `read-block-dir('schemas')` enumerates 23 files but can't read one individually. Schemas live in `.project/schemas/`, not `.project/<name>.json` — `read-block` doesn't resolve there |
| "What does the issues schema require?" | Can't inspect without reading whole schemas dir, which truncates at 50KB |

**Missing**: `read-config`, `read-schema(name)`.

### Relation-edge writes (the substrate's fundamental write primitive has no tool)

| Task | Why it fails |
|------|-------------|
| "Add an edge from DEC-0001 to issue-062" | No `append-relation` tool. relations.json doesn't exist in this project anyway, but even if it did: `read-block('relations')` + array-mutate + `write-block('relations', ...)` — manual write-then-validate cycle |
| "Remove FGAP-001's evidence entry #4" | Nested array inside framework-gaps item. `remove-block-nested-item` works only if exact match predicate is known |

**Missing**: `append-relation(parent, child, relationType, ordinal?)`, `remove-relation(parent, child, relationType)`.

### Deep nested array queries (recursion depth limit)

| Task | Why it fails |
|------|-------------|
| "Show all tasks under FEAT-001" | FEAT-001 has `stories[]`, each with `tasks[]`. Read whole block + manual extraction "all tasks across all stories where status=todo" |
| "Count tasks done vs todo across features" | Manual. One feature now; with 10 features same N-call sampling problem |
| "Update TASK-001-02 status to done" | Nested: `features[FEAT-001].stories[STORY-001].tasks[TASK-001-02]`. `update-block-nested-item` supports ONE nesting level (`nestedKey`); two-level nesting (story→task) requires read-modify-write workaround |

**Missing**: recursive nested-item update/query for deeply-nested schemas (features→stories→tasks).

## Current tool inventory (21 tools registered in pi-context)

**Block read/write (9)**: `read-block`, `read-block-dir`, `write-block`, `append-block-item`, `update-block-item`, `remove-block-item`, `append-block-nested-item`, `update-block-nested-item`, `remove-block-nested-item`

**Discovery / introspection (5)**: `project-status`, `resolve-item-by-id`, `project-validate`, `project-validate-relations`, `project-edges-for-lens`

**Graph traversal (1)**: `project-walk-descendants`

**Lifecycle (1)**: `complete-task`

**Bootstrap (1)**: `project-init`

**Roadmap (4)**: `project-roadmap-load`, `project-roadmap-render`, `project-roadmap-validate`, `project-roadmap-list`

## Subcommand-only surface (agent CANNOT invoke from tool list)

- `/project view <lensId>` — lens markdown rendering (`loadLensView` + `renderLensView` JS exports)
- `/project lens-curate <lensId>` — curation suggestions (`buildCurationSuggestions` JS)
- `/project install [--update]` — catalog asset installation (`installProject()` JS)
- `/project add-work` — conversation-item-to-block extractor
- `/project help`

## Block-API primitive ↔ tool symmetry (16 primitives, 7 tool wrappers)

| Block-API primitive | Tool exists? |
|---------------------|---|
| `writeBlock` | ✅ `write-block` |
| `appendToBlock` | ✅ `append-block-item` |
| `updateItemInBlock` | ✅ `update-block-item` |
| `removeFromBlock` | ✅ `remove-block-item` |
| `appendToNestedArray` | ✅ `append-block-nested-item` |
| `updateNestedArrayItem` | ✅ `update-block-nested-item` |
| `removeFromNestedArray` | ✅ `remove-block-nested-item` |
| **`upsertItemInBlock`** | ❌ no tool |
| **`upsertItemInNestedBlock`** | ❌ no tool |
| **8 typed-file variants** (arbitrary `(filePath, schemaPath)` pairs from FGAP-019/020 closure) | ❌ none exposed |

**Missing**: `upsert-block-item`, `upsert-block-nested-item`. Typed-file primitives have no agent-reachable surface despite being the architectural-symmetry deliverable of Step 6.1 + 6.3.

## SDK discovery surface — zero tool exposure

The SDK exports `availableWorkflows()`, `availableAgents()`, `agentContracts()`, `agentsByBlock()`, `schemaVocabulary()`, `availableSchemas()`, `availableBlocks()`, `validationChecks()` — **zero of these have tool exposure**. An LLM cannot discover what agents exist, what workflows are available, what schemas are installed, or what validation checks run, without reading the source code. `project-status` gives aggregate metrics but not item-level discovery.

## Block history / diff — no observability tool

`project-status` shows last commit. "What changed in issues.json across the last 3 commits?" or "diff the current decisions block against pre-DEC-0013-enacted state?" — no tool. Block is a point-in-time snapshot; its history is invisible to tool-constrained agents.

## Consolidated functionality gaps (priority per practical impact + architectural closure)

| Priority      | Gap                                           | Missing tool                                                                                     | Closest current + why insufficient                                                                                                |
| ------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **P1-DIRECT** | **Array filter/query**                        | `filter-block-items(block, arrayKey, predicate)`                                                 | None — must `read-block` then filter in-memory; or N×`resolve-item-by-id` serial probes (90 calls for 90 issues)                  |
| **P1-DIRECT** | **Bulk resolve**                              | `resolve-items-by-id(ids[])`                                                                     | `resolve-item-by-id` is single-id; serial calls only                                                                              |
| P1            | **read-config tool**                          | `read-config()` returning ConfigBlock                                                            | Config isn't a standard block; `read-block('config')` doesn't resolve. Lens / relation_type / status_buckets queries blocked      |
| P1            | **schema-write tools**                        | `read-schema(name)` / `write-schema(name, body)` / `update-schema(name, mutator)`                | `readSchema`/`writeSchema`/`updateSchema` JS exports with AJV meta-validation; zero tool exposure                                 |
| P1            | **project-install tool**                      | `project-install({overwrite?})`                                                                  | Subcommand only; `installProject()` JS export exists                                                                              |
| P1            | **render-lens tool**                          | `project-render-lens(lensId)` returns markdown                                                   | `project-edges-for-lens` returns Edge[] only; rendering is subcommand-only                                                        |
| P1            | **Workflow/agent discovery**                  | `available-workflows`, `available-agents`, `agent-contracts`, `agents-by-block(blockName)`       | All in SDK as pure functions; zero tool exposure. Cannot answer "which workflows reference the decisions block?"                  |
| P1            | **Relation-edge atomic append/remove**        | `append-relation(parent, child, type, ordinal?)` / `remove-relation(parent, child, type)`        | Today: `read-block('relations')` + array-mutate + `write-block('relations', ...)` — manual write-then-validate                    |
| P1            | **Discovery aggregator**                      | `project-discovery()` returning `{blocks, schemas, lenses, relation_types, has_relations}`       | `availableBlocks`, `availableSchemas`, `blockStructure` exist as JS; no aggregating tool. `project-status` is metric-summary only |
| P1            | **find-references (cross-block reverse-index)** | `find-references(id)` returning `[{block, arrayKey, item}]` for every block mentioning the id  | `project-validate` checks integrity but doesn't return reference graph; manual scan required                                      |
| P2            | **walk-ancestors / walk-siblings**            | `project-walk-ancestors(childId, relationType)` / `project-walk-siblings(itemId, relationType)`  | Only descendant walk; bidirectional graph reasoning blocked                                                                       |
| P2            | **Read-item-by-id (full payload)**            | `read-item-by-id(id)` returning `{block, arrayKey, item}` with full ItemRecord                   | `resolve-item-by-id` returns location only; agent re-fetches entire block to get item content                                     |
| P2            | **Block-API tool symmetry**                   | `upsert-block-item`, `upsert-block-nested-item`                                                  | 16 JS primitives; only 7 surfaced as tools — upsert variants + 8 typed-file variants missing                                      |
| P2            | **Recursive nested update**                   | n-level nested update (features→stories→tasks)                                                   | `update-block-nested-item` supports ONE nesting level only                                                                        |
| P2            | **enum-values**                               | `schema-enum-values(block, arrayKey, field)` returning `string[]`                                | Status transitions are blind updates without knowing valid values                                                                 |
| P2            | **render-item-markdown**                      | `render-item(id)` returning formatted markdown                                                   | No per-item rendering for downstream prompt injection                                                                             |
| P3            | **validate-item before write**                | `validate-item(block, arrayKey, item)` returning `{valid, errors}`                               | Must attempt write + catch error                                                                                                  |
| P3            | **transition-item-status with state-machine** | `transition-status(id, newStatus)` with precondition checks                                      | `update-block-item` is blind field update; no enforcement                                                                         |
| P3            | **lens-curate suggestions tool**              | `project-lens-curate-suggestions(lensId)`                                                        | Subcommand-only; `buildCurationSuggestions()` JS exists                                                                           |
| P3            | **project-context-dump**                      | `project-context()` serializing config + relations + blocks summary                              | No tool wraps `getProjectContext()` for prompt injection                                                                          |
| P3            | **install-config management**                 | `read-installed-schemas` / `add-installed-schema(name)`                                          | No granular reads/writes on `config.installed_schemas[]` / `installed_blocks[]`                                                   |
| P3            | **block-history / block-diff**                | `block-history(name)` returning per-write evolution                                              | `project-status` shows last commit; no per-block change log                                                                       |
| P3            | **read-block truncation handling**            | streaming/paginated `read-block` for >50KB blocks                                                | Current `read-block` truncates large blocks (framework-gaps.json hits this with 26 gaps)                                          |

## Consolidated impact ranking (replacement-cost framing)

| Rank | Tool | Replaces / unblocks |
|------|------|----------|
| **1** | `filter-block-items(block, arrayKey, predicate)` | 90 individual resolve calls → 1 call for any field-based query |
| **2** | `read-config` | Unblocks lens / relation / status-vocabulary queries; currently impossible because config.json isn't a standard block |
| **3** | `read-schema(name)` | Currently can't inspect any individual schema (schemas dir truncates at 50KB) |
| **4** | `append-relation` / `remove-relation` | Write primitive for the substrate's fundamental data model (closure-table per DEC-0009) |
| **5** | `project-walk-ancestors(childId, relationType)` | Reverse hierarchy walk — currently only descendants; bidirectional graph reasoning blocked |
| **6** | `resolve-items-by-id(id[])` | Batch resolve — collapses N-call cross-block analysis |
| **7** | `upsert-block-item` / `upsert-block-nested-item` | Idempotent write surface already in the SDK; just no tool wrapper |
| **8** | SDK discovery tools (`available-agents`, `available-workflows`, `available-schemas`, `agent-contracts`, `agents-by-block`, `schema-vocabulary`, `available-blocks`, `validation-checks`) | Agent / workflow / schema vocabulary queryable by LLM; currently requires reading source |

## Synthesis

The substrate-arc thesis is **half-delivered for tool-constrained agents**. Pi-context's JS export surface is rich (40+ functions); the pi tool surface significantly lags. The tool gap follows a pattern: **state-mutation tools dominate; query/discovery/render tools are sparse**. An agent can write and validate but cannot efficiently inquire about the substrate it's writing into.

The most impactful closures (per practical + architectural priority): **filter-block-items + bulk-resolve** (would have made this turn's audit task trivial); **read-config + read-schema** (config-driven substrate is unqueryable from tools today); **schema-write tools** (agent cannot author schemas); **discovery aggregator + workflow/agent introspection** (agent cannot self-describe substrate); **render-lens + render-item** (agent cannot project substrate state into downstream prompts); **append-relation atomic tool** (agent cannot evolve closure-table without manual write-then-validate cycle).

This pattern itself is the meta-FGAP candidate ("pi tool surface systematically lags JS export surface; agents constrained to tools see thinner capability than substrate provides") — the asymmetry is structural across the entire rebuild arc, not a one-off omission.
