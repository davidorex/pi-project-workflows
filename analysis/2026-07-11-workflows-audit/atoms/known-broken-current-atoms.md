# Current known-broken — actionable atoms

Derived verbatim from the three known-broken-current reports (apr-may, june, july) in
`/Users/david/Projects/harness-monitor-training/analysis/2026-07-11-workflows-audit/`.
Every atom is anchored to a report's verbatim break quote plus its cited file:line / gap-id /
substrate-status. No defects are invented; only still-live items are atomized.

Apr-May note (not an atom): the Apr-May report found **no** window-established break surviving —
"Every established break I could anchor in the April–May window has since been fixed or superseded."
Its lone live-open candidate (layer-plans nested-id schema) was disqualified there on window-establishment
grounds but is established independently in June as ATOM-KB-02. All Apr-May breaks are fixed/superseded,
so they appear as this note only, not as atoms.

## Groups
- GROUP-KB-01: Write-time vs validate-time asymmetry (a write is accepted but is not validate-clean; corruption caught only post-hoc) — atoms: ATOM-KB-01, ATOM-KB-02
- GROUP-KB-02: No recovery path once state is already invalid (validate-before-mutate deadlocks) — atoms: ATOM-KB-03
- GROUP-KB-03: Silent false status signals + install/lifecycle bookkeeping gaps (breakage that lies rather than throws; fresh-install/status-enum omissions) — atoms: ATOM-KB-04, ATOM-KB-05, ATOM-KB-06
- GROUP-KB-04: Surface-parity holes (a capability exists as CLI op / registry entry but is unreachable from the human `/context` surface or from non-interactive contexts) — atoms: ATOM-KB-07, ATOM-KB-08
- GROUP-KB-05: Doc-vs-implementation drift that fails at runtime (advertised names the code will reject) — atoms: ATOM-KB-09, ATOM-KB-10
- GROUP-KB-06: Contract implements only a demo subset (v1 schema contract whose engine honors a fraction of declared semantics) — atoms: ATOM-KB-11, ATOM-KB-12
- GROUP-KB-07: Install-time materialization / UX gaps — atoms: ATOM-KB-13
- GROUP-KB-08: Governance / project-state conditions (lower-confidence: unfixed and open, but weaker-anchored — agent-probe or state-condition, not a runtime code throw) — atoms: ATOM-KB-14, ATOM-KB-15, ATOM-KB-16, ATOM-KB-17

## Atoms

### ATOM-KB-01 — Write-time edge guard accepts dangling / cross-alias / cycle-closing endpoints (FGAP-093)
- group: GROUP-KB-01
- action: Extend the write-time edge validator to reject an edge whose offending endpoint doesn't exist (dangling/cross-alias) and edges that close a cycle, so a write-accepted edge is always validate-clean — not merely caught post-hoc by validateContext. (TASK-062 already added only the kind/category half.)
- evidence: "the validator doesn't reject a kind-violating edge whose offending endpoint doesn't exist; validateContext still catches it post-hoc." — David 2026-06-14T05:54:37Z; FGAP-093 title verbatim: "…endpoint-existence and cycle remain validate-only — so a write-accepted edge is not always validate-clean." FGAP-093 `status: "identified"`, `closed_by: null` (source: known-broken-current-june.md)
- scope: `framework-gaps.json` FGAP-093; the write-time edge guard (kind-validator shipped via completed TASK-062, endpoint/cycle half open)
- verify: FGAP-093 status flips off `identified` with a closure/VER record; a write attempting a dangling-endpoint or cycle-closing edge is rejected at write time (not only by a later validateContext pass).

### ATOM-KB-02 — layer-plans schema nests id-bearing arrays instead of top-level entities + edges (issue-002)
- group: GROUP-KB-01
- action: Restructure the layer-plans schema so `plans.layers` / `plans.migration_phases` become top-level entities plus membership edges, eliminating the nested id-bearing arrays that `findNestedIdBearingArrays` flags on every scan.
- evidence: `findNestedIdBearingArrays` flags `["plans.layers","plans.migration_phases"]` on every scan; issue-002 `status: "open"`, title verbatim: "layer-plans schema nests id-bearing arrays (plans.layers, plans.migration_phases) instead of top-level entities + membership edges." "Current `packages/pi-context` still ships the nesting (scanner sole-hit unchanged)." (source: known-broken-current-june.md; also listed open-for-completeness in known-broken-current-july.md)
- scope: `issues.json` issue-002; `.context/schemas/layer-plans.schema.json` and `packages/pi-context/samples/schemas/layer-plans.schema.json` (both retain the nesting per apr-may report)
- verify: `findNestedIdBearingArrays` scan no longer emits the 2 layer-plans warnings; issue-002 moves to closed/resolved.

### ATOM-KB-03 — Config repair impossible once stored config is invalid (validate-before-mutate deadlock) (FGAP-096)
- group: GROUP-KB-02
- action: Add a sanctioned CLI path that repairs an already-invalid `.context/config` without requiring pre-existing validity, breaking the validate-before-repair deadlock (its two sibling gaps FGAP-095 and FGAP-097 from the same filing are already closed).
- evidence: "2. Validate-before-repair deadlock (can't fix an already-invalid config via CLI)." — David 2026-06-18T21:40:48Z; FGAP-096 `status: "identified"`, impact verbatim: "…there is no sanctioned CLI path back to validity — the only recourse is the forbidden direct-edit of .context/co[nfig]." (source: known-broken-current-june.md)
- scope: `framework-gaps.json` FGAP-096; config-repair CLI path
- verify: A CLI command can restore a corrupt/invalid stored config to validity without direct-editing the file; FGAP-096 closes with a VER record.

### ATOM-KB-04 — No op materializes a newly-declared block_kind's data file; false `not-installed` bootstrap signal (FGAP-065)
- group: GROUP-KB-03
- action: Make catalog-added block kinds materialize their data file into an installed substrate so context-bootstrap-state stops reporting a fully-usable substrate as `not-installed` on a dangling block_kind declaration.
- evidence: "a dangling block_kind declaration." — David-filed 2026-06-08; FGAP-065 `status: "identified"`, impact verbatim: "Any catalog-added block kind silently bricks the bootstrap signal of every pre-existing substrate: context-bootstrap-state reports not-installed though the substrate is fully usable…" (source: known-broken-current-june.md)
- scope: `framework-gaps.json` FGAP-065; block-kind materialization / bootstrap-state computation (related July residual FGAP-140 is a distinct atom — ATOM-KB-05)
- verify: Adding a catalog block kind no longer flips a usable substrate to `not-installed`; the newly-declared block's data file is materialized; FGAP-065 closes.

### ATOM-KB-05 — Fresh install never seeds block-schema migration declarations from the catalog (FGAP-140)
- group: GROUP-KB-03
- action: Add block-schema migration-declaration seeding on fresh install (a `seedCatalogBlock…`-style function) so `installContext`/`checkStatus` seed catalog block-schema migration decls, not only config migrations — mirroring the already-fixed update-time twin FGAP-141.
- evidence: "i don't want register i want fucking fixed. canonical pipeline." — David 2026-07-11T12:47:23Z, re: "installContext/checkStatus never seed block-schema migration declarations from the catalog for any schema on a fresh install"; live code `packages/pi-context/src/context.ts:1007,1099` call only `seedCatalogConfigMigrationDecls` (filters to `schemaName==="config"`); "No block-schema seeding function exists (`grep seedCatalogBlockMigration…` → none). FGAP-140 `identified`." (source: known-broken-current-july.md)
- scope: `packages/pi-context/src/context.ts:1007,1099`; framework-gaps FGAP-140
- verify: A fresh `.context` install lands block schemas (e.g. `session-notes`/`research`) with their migration decls and `context-validate` returns 0 errors; a block-schema seeding function exists; FGAP-140 closes.

### ATOM-KB-06 — No lifecycle status enum carries a `paused` value (FGAP-103)
- group: GROUP-KB-03
- action: Add a `paused` value to the lifecycle status enum(s) so a deliberately-suspended phase/task can be represented instead of being mapped `paused→blocked` or presented as active work.
- evidence: "let's solve the 'no paused enum value' problem." — David 2026-07-04T21:52:29Z; live schemas `grep '"paused"' packages/pi-context/samples/schemas/*.json` → "no match. No status enum on any of the 13 status-bearing kinds admits deliberate suspension; the bucket layer still maps paused→blocked only. FGAP-103 `identified`." (source: known-broken-current-july.md)
- scope: `packages/pi-context/samples/schemas/*.json` (13 status-bearing kinds); bucket-layer mapping; FGAP-103
- verify: `grep '"paused"'` over the status schemas now matches; a paused arc renders as paused (not active/blocked); FGAP-103 closes.

### ATOM-KB-07 — `/context` human slash surface omits `update` + 4 operator ops; parity-check blind to it (FGAP-135)
- group: GROUP-KB-04
- action: Register `update` (and `resolve-conflict`, `resolve-blocked`, `context-validate-relations`, `reconcile`) in `CONTEXT_SUBCOMMANDS`, and extend the parity check to cover the human `/context` surface (not only op↔CLI), so the reconcile/update/conflict ops are reachable in-pi.
- evidence: "this is a profound ops parity fail: The registered /context subcommands do not include update; the update reconciler exists only as the CLI op pi-context update." — David 2026-07-09T02:56:56Z (reinforced 03:23:17Z "i exactly said the parity check had to be fixed"); live `packages/pi-context/src/index.ts:3882` `CONTEXT_SUBCOMMANDS` has 15 keys with "No `update`, `resolve-conflict`, `resolve-blocked`, `context-validate-relations`, or `reconcile`. parity-check still guards only op↔CLI. FGAP-135 status `identified`." (source: known-broken-current-july.md)
- scope: `packages/pi-context/src/index.ts:3882` `CONTEXT_SUBCOMMANDS`; the parity-check; FGAP-135
- verify: The five ops appear in `CONTEXT_SUBCOMMANDS` and are invokable via `/context`; the parity check now fails when a CLI op lacks a human-surface subcommand; FGAP-135 closes.

### ATOM-KB-08 — Work-order pi-only auth-gated tools have no non-interactive invocation path (FGAP-126)
- group: GROUP-KB-04
- action: Provide a non-interactive invocation path for the 8 pi-only auth-gated tools so work-order dispatch can reach them outside an interactive session (part of FEAT-014; input-validation/scope-clamp/relabel facets already landed).
- evidence: FGAP-126 `identified`; "the 8 pi-only auth-gated tools still have no non-interactive invocation path (126)"; FEAT-014 = `in-progress`. Break commissioned by David dogfood 2026-07-06T23:57:50Z "try to use the work-order functionality and let's see where it breaks, if it breaks." and 2026-07-07T00:34:56Z "all are priority 1." (source: known-broken-current-july.md)
- scope: framework-gaps FGAP-126 under FEAT-014; work-order dispatch engine; the 8 pi-only auth-gated tools
- verify: A work order can invoke the previously pi-only auth-gated tools non-interactively; FGAP-126 closes.

### ATOM-KB-09 — pi-workflows advertises ~34 `${{ }}` filters; registry implements 10 (FGAP-131)
- group: GROUP-KB-05
- action: Reconcile the filter registry with the docs — either implement the missing advertised filters or remove them from the README — so no advertised `${{ }}` filter throws at runtime.
- evidence: "pi-workflows expression filters are drastically misdocumented." — David-tasked eval 2026-07-08T02:58:02Z; live `packages/pi-workflows/src/expression.ts:10` `FILTERS` registers exactly 10 (duration, currency, json, length, keys, filter, last, first, slugify, shell); `packages/pi-workflows/README.md:104` advertises 34; "Most advertised names (upper, lower, trim, default, join, split, map, sum…) are not implemented. FGAP-131 `identified`." (source: known-broken-current-july.md)
- scope: `packages/pi-workflows/src/expression.ts:10` (`FILTERS`); `packages/pi-workflows/README.md:104`; FGAP-131
- verify: Every filter named in the README resolves in the registry (no runtime throw), or the README lists only implemented filters; the two counts match; FGAP-131 closes.

### ATOM-KB-10 — 8 of 15 bundled pi-workflows specs invalid under `validateWorkflow` (FGAP-132)
- group: GROUP-KB-05
- action: Fix the 8 bundled specs so they validate under `validateWorkflow` (analyze-existing-project, create-phase, do-gap, fix-audit, gap-to-phase, init-new-project, pausable-analysis, resumable-analysis).
- evidence: "a real `validateWorkflow` run yielded 8 invalid specs (analyze-existing-project, create-phase, do-gap, fix-audit, gap-to-phase, init-new-project, pausable-analysis, resumable-analysis)." — from the 2026-07-08 eval David commissioned; "FGAP-132 `identified`; no lockstep/closure commit references it in the window log." (source: known-broken-current-july.md)
- scope: the 8 named bundled specs; FGAP-132
- verify: `validateWorkflow` over the 15 bundled specs returns 0 invalid; FGAP-132 closes.

### ATOM-KB-11 — Work-order engine does not consume `context_blocks` / `output_contract` (FGAP-125)
- group: GROUP-KB-06
- action: Extend the work-order dispatch engine to consume the declared `context_blocks` and `output_contract` semantics (currently only `input_contract` validation, scope clamp, and `aborted-non-interactive` relabel landed).
- evidence: FGAP-125 `identified`; "only sub-facets landed (input validated against input_contract; scope clamp; aborted-non-interactive relabel) while the residual legs remain open: context_blocks/output_contract not consumed (125)"; FEAT-014 = `in-progress`; David 2026-07-07T00:34:56Z "all are priority 1." (source: known-broken-current-july.md)
- scope: framework-gaps FGAP-125 under FEAT-014; work-order dispatch engine
- verify: A work order's `context_blocks` and `output_contract` are honored end-to-end; FGAP-125 closes.

### ATOM-KB-12 — No work-order retry policy (FGAP-128)
- group: GROUP-KB-06
- action: Implement a work-order retry policy so the dispatch engine honors the declared retry semantics (residual leg of FEAT-014).
- evidence: FGAP-128 `identified`; "no work-order retry policy (128)"; FEAT-014 = `in-progress`; commissioned by David dogfood 2026-07-06T23:57:50Z "let's see where it breaks", 2026-07-07T00:34:56Z "all are priority 1." (source: known-broken-current-july.md)
- scope: framework-gaps FGAP-128 under FEAT-014; work-order dispatch engine
- verify: A failing work-order step retries per the declared policy; FGAP-128 closes.

### ATOM-KB-13 — Install does not copy/materialize agents into the consuming project (TASK-119)
- group: GROUP-KB-07
- action: Implement install-time agent materialization so `install` copies agents into the consuming project as editable files (the jit-loader project-tier gap FGAP-127 is already closed via TASK-103; the copy step is separate and unstarted).
- evidence: "i want it to copy agents. not providing agents that can be edited and changed in the project wanting to use agents is nearly the definition of terrible ux." — David 2026-07-11T00:11:10Z; "TASK-119 = `planned` (filed e5a8acca, 'install-time agent materialization'). The jit loader project-tier gap FGAP-127 was closed (TASK-103), but the install-time copy David asked for is unimplemented." (source: known-broken-current-july.md)
- scope: TASK-119 (install-time agent materialization); install path
- verify: A fresh install lands editable agent files in the consuming project; TASK-119 moves off `planned` to completed.

### ATOM-KB-14 — No convention governs substrate bootstrap-state provisioning + identity reconciliation (FGAP-052)
- group: GROUP-KB-08
- action: Define and enforce a convention for substrate bootstrap-state provisioning and substrate-identity reconciliation. (Lower-confidence: a governance gap, not a runtime throw.)
- evidence: "No convention governs substrate bootstrap-state provisioning + substrate-identity reconciliation." — David-filed 2026-06-07, FGAP-052 `identified`; report note: "Governance gap, not a runtime break. Unfixed." (source: known-broken-current-june.md)
- scope: framework-gaps FGAP-052; bootstrap-state / substrate-identity convention
- verify: A documented+enforced convention exists; FGAP-052 closes.

### ATOM-KB-15 — Active `.context` is the pi-context dev substrate, not a clean baseline for the operation-framework port (issue-010)
- group: GROUP-KB-08
- action: Establish a clean baseline `.context` for the operation-framework port instead of using the pi-context dev substrate. (Lower-confidence: a project-state condition, not a code defect.)
- evidence: issue-010 `open`, source human, verbatim: "Active .context is the pi-context dev substrate, not a clean baseline for the operation-framework port." report note: "A project-state condition, not a code defect. Unfixed." (source: known-broken-current-june.md; also listed open-for-completeness in known-broken-current-july.md)
- scope: `issues.json` issue-010; the active `.context` baseline
- verify: A clean baseline substrate is in place for the port; issue-010 closes.

### ATOM-KB-16 — Packaged catalog `samples/conception.json` drifts below live `.context/config.json` (FGAP-102)
- group: GROUP-KB-08
- action: Reconcile the packaged catalog `samples/conception.json` with the live `.context/config.json` across propagated registries so the shipped catalog does not lag the live config. (Lower-confidence: anchored to agent npx probes, not a David verbatim break.)
- evidence: "packaged catalog `samples/conception.json` drifts below live `.context/config.json` across propagated registries. Real and unfixed, but anchored to the 2026-07-02 npx probes, not a David verbatim break." FGAP-102 (P1, `identified`). (source: known-broken-current-july.md)
- scope: catalog `samples/conception.json`; live `.context/config.json`; FGAP-102
- verify: `samples/conception.json` matches the live config across registries; FGAP-102 closes.

### ATOM-KB-17 — workflows `ctrl+j` / `ctrl+h` chord shadows pi built-ins (issue-011)
- group: GROUP-KB-08
- action: Rebind or scope the workflows `ctrl+j` / `ctrl+h` chords so they no longer shadow pi's built-in newline/Backspace bindings. (Lower-confidence: June excluded it on provenance — FTS found no June discussion, "likely filed later"; July lists it open-for-completeness, not David-established.)
- evidence: issue-011 `open`: "chord `ctrl+j`/`ctrl+h` shadows pi built-ins." June provenance note: "FTS for ctrl+j/newLine/Backspace across ALL sessions returned only March spec docs, no June discussion; likely filed later. Excluded from the June set on provenance grounds." July: "issue-011 (`open`) workflows ctrl+j shadows pi's built-in newline." (sources: known-broken-current-june.md, known-broken-current-july.md)
- scope: `issues.json` issue-011; workflows keybindings (`ctrl+j`/`ctrl+h`)
- verify: The chords no longer shadow pi's newline/Backspace; issue-011 closes.
