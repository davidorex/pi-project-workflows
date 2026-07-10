# TASK-111 meaning-gathering: pi-workflows internal-tracker-ID comment citations

Scope: packages/pi-workflows source (from /tmp/scan-pi-workflows.json, 11 raw instances / 4 unique IDs)
plus a separate grep of packages/pi-workflows/src/*.test.ts for comment-only hits of the same
ID-shape patterns (added 1 unique ID, TASK-006, plus 3 more sites of DEC-0049).

Method: each ID was looked up live via `pi-context resolve-item-by-id --id <ID> --json`. Where
the live item's substance was topically disjoint from what the comment claims, the ID was looked
up in `.project-archived/*.json` (the frozen predecessor substrate) instead, and that meaning was
used. No meaning was fabricated; every replacement is grounded in one or the other lookup.

## Replacement-text table

| ID | Status | Plain-English replacement (the substantive engineering point) |
|---|---|---|
| DEC-0049 | stale-archived | The "templates" branch of this helper was removed on purpose: agent-prompt templates now live entirely in the pi-jit-agents package. There is exactly one shared "agent" abstraction used uniformly by every consumer (behavior monitors, workflow steps, agent-as-tool dispatch) — no per-consumer agent kind — so pi-workflows no longer keeps its own copy of template-resolution logic. Anyone needing the bundled template root should import `bundledTemplateDir` from `@davidorex/pi-jit-agents/template` instead of asking this file's helper for it. |
| FGAP-088 | stale-archived | This line deliberately uses `path.dirname(fileURLToPath(import.meta.url))` instead of the simpler `import.meta.dirname`, because this call runs eagerly at module top-level: `import.meta.dirname` is undefined when this module gets loaded through tsx's CommonJS-interop path, and an eager reference to an undefined value throws immediately at import time (this exact failure was hit and fixed elsewhere in the codebase). `import.meta.url` stays defined under both load paths, so it's the safe idiom for code that runs at module load, not just inside a function. |
| FGAP-089 | stale-archived | Each of these tool responses is routed through the shared `serializeForRead` helper rather than a one-off truncation, so that an over-cap response degrades the same way everywhere: when the returned value is an "edge" object — a single addressed item (one agent by name), a small structured object (workflow status, workflow-init result), or a result list with no narrower drill-down tool — there is no finer address to redirect the caller to, so an over-cap read returns a clearly marked head-truncated partial instead of silently dropping data. Where a narrower address does exist (the full agent list can be narrowed via `name=<agent>`), the caller is pointed at that narrower query instead. |
| DEC-0015 | stale-archived | `tryResolveContextDir(cwd)` returning `null` means there is no `.pi-context.json` bootstrap pointer at that directory — i.e., no substrate has been set up there at all. That specific case (pointer absent) is treated as "no substrate, skip this behavior" (skip context-block injection into the agent template; treat declared `contextBlocks` as not present) rather than being propagated as an error, matching this project's rule that substrate location is resolved exclusively through a config pointer file rather than a hardcoded directory name. Only the missing-pointer case is swallowed this way — a malformed pointer file or a read failure inside the resolver itself still throws normally. |
| TASK-006 | current-valid | This test section checks that when a workflow step appends an item to a block, the write gets stamped with `created_by = "workflow/<stepName>"` on any schema that requires an attested author field. This is the pi-workflows half of a broader change that threaded a "who is performing this write" identity (a dispatch context carrying the caller's verified identity) through every block-write operation handler, replacing handlers that had previously dropped that identity information. |

## File:line sites

**DEC-0049** (4 sites: 1 source, 3 test)
- packages/pi-workflows/src/bundled-dirs.ts:12 (source, jsdoc)
- packages/pi-workflows/src/integration.test.ts:46 (test, line comment)
- packages/pi-workflows/src/macros.test.ts:6 (test, line comment)
- packages/pi-workflows/src/template-integration.test.ts:10 (test, line comment)

**FGAP-088** (1 site: source)
- packages/pi-workflows/src/bundled-dirs.ts:20

**FGAP-089** (6 sites: all source, packages/pi-workflows/src/index.ts)
- index.ts:672 — workflow-list tool, routing through serializeForRead
- index.ts:709 — workflow-agents tool, single agent by name (already the addressed element)
- index.ts:733 — workflow-agents tool, full agent list (narrows via name=<agent>)
- index.ts:769 — workflow-validate tool, validation results (edge surface)
- index.ts:797 — workflow-status tool, structured vocabulary object (edge surface)
- index.ts:825 — workflow-init tool, init result (edge surface)

**DEC-0015** (3 sites: all source)
- packages/pi-workflows/src/step-shared.ts:164 (compileAgentSpec — context-block injection)
- packages/pi-workflows/src/workflow-executor.ts:857 (artifact block-target classification)
- packages/pi-workflows/src/workflow-sdk.ts:620 (workflow validation — contextBlocks existence check)

**TASK-006** (1 site: test)
- packages/pi-workflows/src/step-block.test.ts:712 (section-header comment for the "block step: DispatchContext attestation" describe block)

## Unresolvable IDs

None. All 5 unique IDs (DEC-0049, FGAP-088, FGAP-089, DEC-0015, TASK-006) resolved — either
live or in `.project-archived/*.json`.

## Notes on the live/archived divergence

For DEC-0049, FGAP-088, FGAP-089, and DEC-0015, the ID *shape* still resolves in the live
substrate (except DEC-0049, which resolves to nothing / `null`), but where it does resolve live,
the live item is a **different, unrelated item that has reused the ID slot** — e.g. live
FGAP-088 is about a missing `context-install` CLI op, and live DEC-0015 is about an in-process
`loadContext` composition decision — neither of which the comment sites are about. In each of
these cases the comment's claim matches the corresponding **archived** predecessor-substrate item
almost verbatim (including, for FGAP-088, an evidence citation naming this exact file/line). This
means the ID citations were correct against the substrate that existed when the comments were
written, but the live substrate has since recycled those ID numbers for new, unrelated items —
which is exactly the kind of staleness-independent opacity TASK-111 is rewriting away: a reader
today cannot tell from `DEC-0015` alone which of two unrelated decisions is meant.

Excluded from this analysis as non-defects: `render-decision.test.ts` and other test files contain
many `DEC-0001` / `DEC-0002` / `DEC-0003` / `FEAT-001` strings, but these are self-referential
fixture IDs the tests themselves construct and describe (test data, not citations to real
substrate items), matching the task's guidance to exclude ID-shaped test fixture strings.
