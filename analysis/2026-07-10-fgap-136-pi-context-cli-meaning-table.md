# TASK-114 meaning-gathering: pi-context-cli internal-tracker-ID comment citations

## Scope resolved

- Source (`packages/pi-context-cli/src/cli.ts`, from `/tmp/scan-pi-context-cli.json`): 31 raw instances, 17 unique IDs.
- Test file (`packages/pi-context-cli/src/cli.test.ts`, hand-grepped): 17 additional unique IDs found in genuine comments/section-headers or descriptive test-title strings (not in fixture-data literals like seeded `TASK-001`/`FGAP-999` JSON payloads, excluded as functional test data). `pi-bound.test.ts` and `render.test.ts` had zero hits.
- **Total: 34 unique IDs.** All 34 resolved live via `pi-context resolve-item-by-id`; **none were stale-archived or unresolvable** — every ID's live substrate content topically matched what its comment site claims, so `.project-archived/*.json` was never needed for this package.

## Replacement-text table

| ID | Status | Plain-English replacement (the substantive engineering point) |
|---|---|---|
| FEAT-006 | current-valid | A single `update` command brings an installed substrate up to a newer pi-context release without clobbering the user's local customizations — it classifies each installed schema's drift state, preserves/merges locally-modified schemas instead of overwriting them, and previews the full change set with `--dry-run` before writing anything. |
| FGAP-013 | current-valid | The CLI's `--json` output used to double-encode structured op results (the `output` field was a stringified JSON string, forcing callers to `JSON.parse` it twice); fixed so `--json` always emits `output` as a real JSON value, parseable once. |
| FGAP-015 | current-valid | The 50KB read-size cap used to be enforced only inside individual read-op renderers, so any op returning data through the generic `{json}` channel could leak unbounded substrate content on both the CLI `--json` surface and the in-pi agent-context surface; fixed by enforcing the cap at the output boundary for every channel. |
| FGAP-019 | current-valid | Several block-mutation ops (append/update/upsert/remove-block-item, plus the three nested variants) demanded a redundant `--arrayKey` value that was already derivable from the block's own config declaration; the CLI now derives it from `config.block_kinds[].array_key` and only needs an explicit `--arrayKey` as an override. |
| FGAP-020 | current-valid | Addressing a schema object node via `read-schema --path` (or `read-config --registry`) used to return only that node's `required` field-name list instead of its full shape (types/enum/required), because the generic pagination heuristic mistook the schema's own `required` array for a paginated collection; fixed to return the addressed node's full subtree. |
| FGAP-021 | current-valid | The CLI had no human-oriented render mode (only raw JSON or an op's own plain text); a `--format text\|json\|table` selector was added so array/collection results can render as a markdown table, falling back to text when a result isn't tabular or is over the size cap. |
| FGAP-022 | current-valid | There used to be no way to preview a block's write contract (required fields, types, id pattern) from the CLI without actually writing; `--show-schema` now prints that contract and exits before any write. |
| FGAP-023 | current-valid | Validation failures used to surface AJV's raw, cryptic `.message` string; the CLI now translates AJV errors into field-named guidance (which field failed, what constraint) on both the `--json` envelope and stderr. |
| FGAP-024 | current-valid | `append-block-item` had no dry-run option (unlike `upsert-block-item`); the CLI now offers `--dry-run` for append by building and validating the prospective whole file client-side without ever calling the real write — the op itself is unchanged, and ops with no `dryRun` param still reject the flag rather than silently accepting it. |
| FGAP-025 | current-valid | The CLI lacked ergonomic input shorthands the older orchestrator scripts had; added `--writer kind:id` (expands to the structured writer identity), `--where field:op:value` (expands to separate field/op/value flags), and comma-separated `--op in` values (split into an array) as pre-call convenience transforms — the op itself is unchanged. |
| FGAP-026 | current-valid | CLI exit codes used to be coarse (just 0/1/2); replaced with a granular 1-5 scheme so scripted/CI callers can distinguish error classes (usage error, not-initialized, schema-absent, id-allocation conflict, validation failure). |
| FGAP-030 | current-valid | The schema drift/check-status report existed only as an in-pi `/context check-status` command with no corresponding op, so the reflecting CLI (which only surfaces ops) couldn't reach it; fixed by adding a `context-check-status` op exposing the same report. |
| FGAP-032 | current-valid | Ops taking a single item id used inconsistent flag names across the registry (`--itemId`, `--parentId`, `--taskId`, `--unitId`, etc.), so guessing `--id` failed unpredictably; the CLI now aliases `--id` to whichever single string-typed id parameter an op declares — ambiguous if 2+, unrecognized if 0. |
| FGAP-064 | current-valid | The CLI matched flags to an op's schema keys verbatim (camelCase only), so typing the conventional kebab-case form (`--dry-run`) failed with "unknown flag" even though the underlying parameter was `dryRun`; a kebab-to-camel alias layer now accepts both forms. |
| FGAP-068 | current-valid | The update conflict resolver used to spawn a subordinate non-interactive `pi -p` agent to reconcile a schema conflict, but that subordinate's write was always refused by the write-schema auth gate (which requires an interactive session), so nothing was ever auto-applied. Fixed by dropping the subordinate spawn: the calling agent (which already holds the conflict data and the operator's authority) reconciles and applies the fix itself. |
| FGAP-073 | current-valid | The substrate declared a lens vocabulary (config.lenses[], e.g. grouping gaps by status/priority) and had the underlying binning/render code, but no reflected op let the CLI render a block grouped by its declared lens — the only workaround was filtering one status value at a time, which also exceeded the read-size cap on large blocks. |
| FGAP-077 | current-valid | When a schema update was blocked, nothing reported which item, field, or constraint actually failed validation — the AJV error detail was discarded at an unbound catch; the blocked result now carries a per-item diagnostic (item id, field, violated constraint) on both the structured result and the CLI text output. |
| FGAP-078 | current-valid | The drift/check-status report computed each schema's baseline and catalog version internally but never printed the version gap — a caller couldn't see which schemas were behind the catalog or by how much (including content-only drift with no version-number change); fixed by surfacing the version delta per behind schema. |
| FGAP-079 | current-valid | There was no way to get the actual catalog schema body (the raw JSON Schema file) to diff locally against an installed schema — the only related op returned a re-projected summary, not the verbatim schema text, forcing an operator to dig through node_modules. |
| FGAP-080 | current-valid | A blocked schema update used to be a dead end: everything about why it was blocked was rolled back and discarded, with no command to fix the underlying items and complete the update — a re-run meant starting the whole update over with no memory of what had failed. |
| TASK-006 | current-valid | Added a writer/identity channel (`DispatchContext`) threaded through every op's execution path and the CLI's own dispatch, so a write records who (which human or agent identity) made it — fixing ten write-handling ops that were silently dropping that identity. |
| TASK-013 | current-valid | The task that closed the read-cap-bypass gap (FGAP-015): added a boundary cap applied at all three output emit sites (CLI `--json`, CLI text, in-pi tool result) so no data-returning op can ship unbounded content on any surface, plus a lint gate that fails the build if a future op bypasses it. |
| TASK-015 | current-valid | The task that gave the CLI's argument-parsing layer several input-ergonomics fixes in one pass: deriving `--arrayKey` from config, accepting the `--writer`/`--where`/CSV shorthands, normalizing kebab-case flags, and aliasing `--id` to an op's single id parameter — none of it changing what any op itself accepts. |
| TASK-016 | current-valid | The task that added the CLI's output/error-shaping layer: returning the full addressed subtree instead of a projected field-name list for `read-schema --path`/`read-config --registry`, adding the `--format` render dispatch, and translating AJV errors into field-named guidance. |
| TASK-017 | current-valid | The task that added the CLI's write-safety and diagnostics affordances: the `--show-schema` contract preview, `append-block-item --dry-run`, and the granular 1-5 exit-code scheme. |
| TASK-034 | current-valid | Added the `pi-context update` command itself (superseding the old `install --update` flag): it checks each installed schema's drift state and, for anything locally modified or diverged, refuses to overwrite it and reports the conflict rather than silently clobbering the user's edits. |
| TASK-037 | current-valid | Originally scoped update's schema-conflict handling to dispatch a subordinate agent that would reconcile and write the merge itself; that plan was reopened and replaced (see FGAP-068) because the subordinate's write was always refused by the auth gate. The final behavior: `update` surfaces the conflict set (structured result + a printed report) and the calling agent reconciles it itself via `read-schema`/`write-schema`/`resolve-conflict` — the CLI never spawns anything. |
| TASK-042 | current-valid | Added a consistent, best-of-breed help template for every reflected op: a synopsis line derived from the op's own typed parameters, the existing required/optional flags list, copy-pasteable examples, related-ops hints, and a footer — plus a machine-readable version of the same content under `--help --format json`. |
| TASK-043 | current-valid | Added the `context-lens-view` op, which projects any config-declared "lens" (a grouping of a block's items into named bins, e.g. gaps grouped by status) as a bin-count summary or, per bin, a paged list of that bin's items. |
| TASK-048 | current-valid | The task that wired the per-item validation diagnostic (FGAP-077) into `update`'s blocked-result output and added a standalone op to validate a block's items against a target schema version without writing anything. |
| TASK-049 | current-valid | The task that added the `context-check-status` op (making the drift report reachable from the CLI) and extended its report to show the per-schema version delta for anything behind the catalog. |
| TASK-050 | current-valid | The task that added the `read-catalog-schema` op, returning the verbatim catalog schema body for a named kind so it can be diffed locally against the installed copy. |
| TASK-051 | current-valid | Added persisted state for a blocked schema update (the target schema, the migration chain, the per-item failures) plus a `resolve-blocked` op that re-validates the corrected block and, on success, writes the new schema and advances the update baseline so the next update run reports in sync. |
| FEAT-008 | current-valid | The umbrella feature that brought the CLI to script-level parity and beyond: conventional flag forms and input shorthands, human-readable output formats and field-named errors with granular exit codes, discoverable grouped help (including per-op `--help`), and write-safety previews — all added without changing any op's underlying behavior, guarded by a parity check that fails the build if that invariant is broken. |

## File:line sites

All source sites are in `packages/pi-context-cli/src/cli.ts`; all test sites are in `packages/pi-context-cli/src/cli.test.ts`. `(comment)` = actual `//`/`/** */` prose; `(test-title)` = a `test(...)` description string.

- **FEAT-006**: cli.ts:1164 (line); cli.test.ts:102 (comment)
- **FGAP-013**: cli.ts:1126 (line); cli.test.ts:627,629,667,788 (comment)
- **FGAP-015**: cli.ts:1131 (line); cli.test.ts:887,940 (comment)
- **FGAP-019**: cli.ts:431 (line), 468 (jsdoc); cli.test.ts:1273 (comment), 1274,1330,1365,1385 (test-title)
- **FGAP-020**: cli.test.ts:1714,1768 (test-title) — test-only, not in source scan
- **FGAP-021**: cli.ts:201 (jsdoc), 270 (line), 922 (jsdoc), 1139 (line); cli.test.ts:1512 (comment), 1531,1543,1554,1578,1603,1623 (test-title)
- **FGAP-022**: cli.ts:192 (jsdoc), 233 (line), 437 (line), 1002 (line); cli.test.ts:1796 (comment), 1798,1824 (test-title)
- **FGAP-023**: cli.ts:1197 (line); cli.test.ts:1639 (comment), 1641 (test-title)
- **FGAP-024**: cli.ts:195 (jsdoc), 238 (line), 1051 (line); cli.test.ts:1863,2049 (comment), 1865,1877,1902,1964,2058,2067,2093,2115 (test-title)
- **FGAP-025**: cli.ts:285,304,395,415 (line); cli.test.ts:1408 (comment), 1409,1432,1452,1472,1481,1490,1499 (test-title)
- **FGAP-026**: cli.ts:1206 (line); cli.test.ts:1695,2026,2139 (comment), 2028,2039,2144 (test-title)
- **FGAP-030**: cli.test.ts:802 (comment) — test-only
- **FGAP-032**: cli.ts:328 (line); cli.test.ts:1207 (comment), 1208,1219,1235,1245,1265 (test-title)
- **FGAP-064**: cli.ts:349 (line); cli.test.ts:1187 (comment), 1188,1198 (test-title)
- **FGAP-068**: cli.test.ts:1003 (comment) — test-only
- **FGAP-073**: cli.test.ts:2283 (comment) — test-only
- **FGAP-077**: cli.ts:1186 (line); cli.test.ts:1086 (comment)
- **FGAP-078**: cli.test.ts:802 (comment) — test-only
- **FGAP-079**: cli.test.ts:828,848 (comment) — test-only
- **FGAP-080**: cli.test.ts:283 (comment) — test-only
- **TASK-006**: cli.test.ts:517 (comment) — test-only
- **TASK-013**: cli.ts:1131 (line); cli.test.ts:887,940 (comment)
- **TASK-015**: cli.test.ts:1181 (comment) — test-only
- **TASK-016**: cli.test.ts:1512,1639 (comment) — test-only
- **TASK-017**: cli.test.ts:1796,1863,2026,2049,2139 (comment) — test-only
- **TASK-034**: cli.test.ts:102 (comment) — test-only
- **TASK-037**: cli.ts:1164 (line); cli.test.ts:1003 (comment)
- **TASK-042**: cli.ts:574,621,689 (jsdoc); cli.test.ts:351,381,414,449,461,483,494 (comment)
- **TASK-043**: cli.test.ts:2283 (comment) — test-only
- **TASK-048**: cli.ts:1186 (line); cli.test.ts:1086 (comment)
- **TASK-049**: cli.test.ts:802 (comment) — test-only
- **TASK-050**: cli.test.ts:828,848 (comment) — test-only
- **TASK-051**: cli.test.ts:283 (comment) — test-only
- **FEAT-008**: cli.test.ts:1181 (comment) — test-only

## Notes

- **No unresolvable IDs.** All 34 IDs resolved live and topically matched their comment sites — no need to consult `.project-archived/*.json` for this package (unlike pi-jit-agents/pi-workflows, whose IDs had gone stale).
- **TASK-037 is the one case worth flagging explicitly**: its live item still describes the *original, abandoned* plan (dispatch a pi-bound mergetool agent to write the reconciled schema). The actual code at cli.ts:1164 and the corresponding test comment at cli.test.ts:1003 describe the *final* behavior (CLI surfaces conflicts, calling agent reconciles) — which matches FGAP-068's `closed_by` field, confirming TASK-037 was reopened and reclosed against FGAP-068's fix. The replacement text above for TASK-037 reflects this actual/final behavior, not the stale original task description.
- Excluded from the test-file grep as functional fixture data (not comments/citations): `cli.test.ts:606,619,1129,1144,1165,1689,1950,2004,2018` — these are literal `TASK-001`/`FGAP-001`/`FGAP-999`/`TASK-002` strings used as seeded JSON payloads or assertions against those payloads' own ids, not provenance citations.
