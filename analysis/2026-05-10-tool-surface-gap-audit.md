**Integrated tool-surface gap audit** (subagent's 21-tool inventory + 15 enumerated gaps, merged with your 11 directly-encountered + SDK-promised gaps):

## Practical-priority finding

The two tools that would have made the just-completed audit task trivial — **`filter-block-items(block, arrayKey, predicate)`** and **`resolve-items-by-id(id[])`** — collapse N-call serial probes into single calls. Direct cost surfaced: 90 issues, one question ("any with source=monitor?"), 15+ serial `resolve-item-by-id` calls for a probabilistic answer.

The SDK provides **~40% query surface coverage as tools**, mostly around project state + roadmap rendering. Workflow/agent/schema/relation discovery + schema-write remain SDK-only.

## Current tool inventory (21 tools registered in pi-context)

**Block read/write (9)**: `read-block`, `read-block-dir`, `write-block`, `append-block-item`, `update-block-item`, `remove-block-item`, `append-block-nested-item`, `update-block-nested-item`, `remove-block-nested-item`

**Discovery / introspection (5)**: `project-status`, `resolve-item-by-id`, `project-validate`, `project-validate-relations`, `project-edges-for-lens`

**Graph traversal (1)**: `project-walk-descendants`

**Lifecycle (1)**: `complete-task`

**Bootstrap (1)**: `project-init`

**Roadmap (4)**: `project-roadmap-load`, `project-roadmap-render`, `project-roadmap-validate`, `project-roadmap-list`

## Subcommand-only surface (agent CANNOT invoke from tool list)

- `/project view <lensId>` — lens markdown rendering
- `/project lens-curate <lensId>` — curation suggestions
- `/project install [--update]` — catalog asset installation; `installProject()` JS export exists, no tool
- `/project add-work` — conversation-item-to-block extractor
- `/project help`

## Consolidated functionality gaps (integrated; priority per practical impact + architectural closure)

| Priority      | Gap                                           | Missing tool                                                                                     | Closest current + why insufficient                                                                                                |
| ------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **P1-DIRECT** | **Array filter/query**                        | `filter-block-items(block, arrayKey, predicate)`                                                 | None — must `read-block` then filter in-memory; or N×`resolve-item-by-id` serial probes                                           |
| **P1-DIRECT** | **Bulk resolve**                              | `resolve-items-by-id(ids[])`                                                                     | `resolve-item-by-id` is single-id; serial calls only                                                                              |
| P1            | **schema-write tools**                        | `read-schema(name)` / `write-schema(name, body)` / `update-schema(name, mutator)`                | `readSchema`/`writeSchema`/`updateSchema` exist as JS exports with AJV meta-validation; zero tool exposure                        |
| P1            | **project-install tool**                      | `project-install({overwrite?})`                                                                  | Subcommand only; `installProject()` JS export exists                                                                              |
| P1            | **render-lens tool**                          | `project-render-lens(lensId)` returns markdown                                                   | `project-edges-for-lens` returns Edge[] only; rendering is subcommand-only                                                        |
| P1            | **Workflow/agent discovery**                  | `available-workflows`, `available-agents`, `agent-contracts`, `agents-by-block(blockName)`       | All in SDK as pure functions; zero tool exposure. Cannot answer "which workflows reference the decisions block?"                  |
| P1            | **Relation-edge atomic append/remove**        | `append-relation(parent, child, type)` / `remove-relation(parent, child, type)`                  | Today: `read-block('relations')` + array-mutate + `write-block('relations', ...)` — manual write-then-validate cycle              |
| P1            | **Discovery aggregator tool**                 | `project-discovery()` returning `{blocks, schemas, lenses, relation_types, has_relations}`       | `availableBlocks`, `availableSchemas`, `blockStructure` exist as JS; no aggregating tool. `project-status` is metric-summary only |
| P1            | **Schema introspection**                      | `read-schema(name)` (or `schema-info(name)` with structured fields/enums/required)               | Cannot ask "what enums does priority allow?" or "what fields does issues.schema.json require?" without external knowledge         |
| P2            | **Read-item-by-id (full payload)**            | `read-item-by-id(id)` returning `{block, arrayKey, item}` with full ItemRecord                   | `resolve-item-by-id` returns location only; agent re-fetches entire block to get item content                                     |
| P2            | **Block-API tool symmetry**                   | `upsert-block-item`, `upsert-block-nested-item`                                                  | 8 .project/-targeting JS primitives + 8 typed-file primitives; only 6 surfaced as tools — upsert variants missing                 |
| P2            | **Cross-block reference query**               | `find-references(id)` returning `[{block, arrayKey, item}]` for every block that mentions the id | `project-validate` checks referential integrity but doesn't return the reference graph; manual scan required                      |
| P2            | **walk-ancestors / walk-siblings**            | `project-walk-ancestors(childId, relationType)` / `project-walk-siblings(itemId, relationType)`  | Only descendant walk; bidirectional graph reasoning blocked                                                                       |
| P2            | **enum-values tool**                          | `schema-enum-values(block, arrayKey, field)` returning `string[]`                                | Status transitions are blind updates without knowing valid values                                                                 |
| P2            | **render-item-markdown**                      | `render-item(id)` returning formatted markdown                                                   | No per-item rendering for downstream prompt injection                                                                             |
| P3            | **validate-item before write**                | `validate-item(block, arrayKey, item)` returning `{valid, errors}`                               | Must attempt write + catch error                                                                                                  |
| P3            | **transition-item-status with state-machine** | `transition-status(id, newStatus)` with precondition checks                                      | `update-block-item` is blind field update; no enforcement                                                                         |
| P3            | **find-items cross-block by predicate**       | `find-items(predicate)` returning `ItemRecord[]`                                                 | No cross-block search; multi-block scan                                                                                           |
| P3            | **lens-curate suggestions tool**              | `project-lens-curate-suggestions(lensId)`                                                        | Subcommand-only; `buildCurationSuggestions()` JS exists                                                                           |
| P3            | **project-context-dump**                      | `project-context()` serializing config + relations + blocks summary                              | No tool wraps `getProjectContext()` for prompt injection                                                                          |
| P3            | **install-config management**                 | `read-installed-schemas` / `add-installed-schema(name)`                                          | No granular reads/writes on `config.installed_schemas[]` / `installed_blocks[]`                                                   |
| P3            | **block-history / block-diff**                | `block-history(name)` returning per-write evolution                                              | `project-status` shows last commit; no per-block change log                                                                       |

## Synthesis

The substrate-arc thesis is **half-delivered for tool-constrained agents**. Pi-context's JS export surface is rich (40+ functions); the pi tool surface significantly lags. The tool gap follows a pattern: **state-mutation tools dominate; query/discovery/render tools are sparse**. An agent can write and validate but cannot efficiently inquire about the substrate it's writing into.

The most impactful closures (per practical + architectural priority): **filter-block-items + bulk-resolve** (would have made this turn's audit task trivial); **schema-write tools** (agent cannot author schemas); **discovery aggregator + workflow/agent introspection** (agent cannot self-describe substrate); **render-lens + render-item** (agent cannot project substrate state into downstream prompts); **append-relation atomic tool** (agent cannot evolve closure-table without manual write-then-validate cycle).

This pattern itself is the meta-FGAP candidate ("pi tool surface systematically lags JS export surface; agents constrained to tools see thinner capability than substrate provides") — the asymmetry is structural across the entire rebuild arc, not a one-off omission.