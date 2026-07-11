# Current known-broken — validated atoms

Independent re-confirmation of every atom in
`../atoms/known-broken-current-atoms.md` against the CURRENT
`workflowsPiExtension` source (`packages/*/src`) and substrate (`.context/`).
Inherited file:line citations were NOT trusted; each cited location was re-opened
live. Substrate at HEAD `4575c02f` (`.context/framework-gaps.json` 141 gaps,
`.context/issues.json` 12 issues).

Tally: still-broken-confirmed 17 / already-fixed 0 / not-found 0 / moved 0.

Where a cited detail (line number, key count, count) diverged from what I
observed, the verdict is still-broken-confirmed with the correction recorded in
`observed`; the defect itself stands in every case.

## GROUP-KB-01 — Write-time vs validate-time asymmetry

### ATOM-KB-01 — Write-time edge guard accepts dangling / cross-alias / cycle-closing endpoints (FGAP-093)  [VERDICT: still-broken-confirmed]
- action: Extend the write-time edge validator to reject an edge whose offending endpoint doesn't exist (dangling/cross-alias) and edges that close a cycle, so a write-accepted edge is always validate-clean — not merely caught post-hoc by validateContext. (TASK-062 already added only the kind/category half.)
- scope: `framework-gaps.json` FGAP-093; the write-time edge guard (kind-validator shipped via completed TASK-062, endpoint/cycle half open)
- observed: `context-sdk.ts:1698 validateEdgeAgainstRegistry` — the sole write-time gate (thrown by `assertEdgeValidForWrite` at `:1760`, called from the relation-append porcelain at `:1893`). Its checks are exactly two: (a) `:1707-1712` relation_type registration; (b) `:1720-1729` source_kinds/target_kinds membership. Endpoint existence is NOT enforced — `:1718-1720` resolves `parentLoc = resolve(edge.parent).loc` then guards `if (parentLoc && rt.source_kinds && ...)`, so a dangling/unresolvable endpoint (`parentLoc` undefined) skips the kind check and passes. No cycle check anywhere in the function. `.context/framework-gaps.json` FGAP-093 `status:"identified"`, `closed_by:null`, title verbatim: "Write-time edge guard accepts an edge with a non-existent (dangling) or unregistered-alias endpoint, or one closing a cycle: only relation_type registration and [kind]…". Completed twin TASK-062 confirmed present. Matches the atom exactly.

### ATOM-KB-02 — layer-plans schema nests id-bearing arrays instead of top-level entities + edges (issue-002)  [VERDICT: still-broken-confirmed]
- action: Restructure the layer-plans schema so `plans.layers` / `plans.migration_phases` become top-level entities plus membership edges, eliminating the nested id-bearing arrays that `findNestedIdBearingArrays` flags on every scan.
- scope: `issues.json` issue-002; `.context/schemas/layer-plans.schema.json` and `packages/pi-context/samples/schemas/layer-plans.schema.json` (both retain the nesting per apr-may report)
- observed: Both live schemas still carry the nesting. Python membership check on `.context/schemas/layer-plans.schema.json` and `packages/pi-context/samples/schemas/layer-plans.schema.json`: both contain `layers` → True and `migration_phases` → True (nested id-bearing arrays, not top-level entities + membership edges). `findNestedIdBearingArrays` scanner is live in `packages/pi-context/src/schema-write.ts` and `context-sdk.ts`. `.context/issues.json` issue-002 `status:"open"`, title verbatim: "layer-plans schema nests id-bearing arrays (plans.layers, plans.migration_phases) instead of top-level entities + membership edges".

## GROUP-KB-02 — No recovery path once state is already invalid

### ATOM-KB-03 — Config repair impossible once stored config is invalid (validate-before-mutate deadlock) (FGAP-096)  [VERDICT: still-broken-confirmed]
- action: Add a sanctioned CLI path that repairs an already-invalid `.context/config` without requiring pre-existing validity, breaking the validate-before-repair deadlock (its two sibling gaps FGAP-095 and FGAP-097 from the same filing are already closed).
- scope: `framework-gaps.json` FGAP-096; config-repair CLI path
- observed: `.context/framework-gaps.json` FGAP-096 `status:"identified"`, `closed_by:null`, title verbatim: "Config repair is impossible once the stored config is invalid (validate-before-mutate)". Both cited siblings confirmed already closed: FGAP-095 `status:"closed"` (closed_by TASK-070/VER-060), FGAP-097 `status:"closed"` (closed_by TASK-072/VER-064). The atom's premise (this gap open, siblings closed) holds.

## GROUP-KB-03 — Silent false status signals + install/lifecycle gaps

### ATOM-KB-04 — No op materializes a newly-declared block_kind's data file; false `not-installed` bootstrap signal (FGAP-065)  [VERDICT: still-broken-confirmed]
- action: Make catalog-added block kinds materialize their data file into an installed substrate so context-bootstrap-state stops reporting a fully-usable substrate as `not-installed` on a dangling block_kind declaration.
- scope: `framework-gaps.json` FGAP-065; block-kind materialization / bootstrap-state computation (related July residual FGAP-140 is a distinct atom — ATOM-KB-05)
- observed: `.context/framework-gaps.json` FGAP-065 `status:"identified"`, `closed_by:null`, P2, title verbatim: "No op materializes a newly-declared block's data file into an already-installed substrate — neither update nor the install-ceremony write that declared it…". Distinct from FGAP-140 (KB-05). Unfixed.

### ATOM-KB-05 — Fresh install never seeds block-schema migration declarations from the catalog (FGAP-140)  [VERDICT: still-broken-confirmed]
- action: Add block-schema migration-declaration seeding on fresh install (a `seedCatalogBlock…`-style function) so `installContext`/`checkStatus` seed catalog block-schema migration decls, not only config migrations — mirroring the already-fixed update-time twin FGAP-141.
- scope: `packages/pi-context/src/context.ts:1007,1099`; framework-gaps FGAP-140
- observed: `context.ts:1007` `seedCatalogConfigMigrationDecls(substrateDir, ctx);` and `:1099` `seedCatalogConfigMigrationDecls(contextDirAbs);` are the only migration-seeding calls; import at `:41` is `seedCatalogConfigMigrationDecls` only. `grep -rn "seedCatalogBlockMigration" packages/pi-context/src/` → no matches (no block-schema seeding function exists). `.context/framework-gaps.json` FGAP-140 `status:"identified"`, `closed_by:null`. Update-time twin FGAP-141 confirmed `status:"closed"` (closed_by TASK-122, VER-099). Matches the atom exactly.

### ATOM-KB-06 — No lifecycle status enum carries a `paused` value (FGAP-103)  [VERDICT: still-broken-confirmed]
- action: Add a `paused` value to the lifecycle status enum(s) so a deliberately-suspended phase/task can be represented instead of being mapped `paused→blocked` or presented as active work.
- scope: `packages/pi-context/samples/schemas/*.json` (13 status-bearing kinds); bucket-layer mapping; FGAP-103
- observed: `grep -rn '"paused"' packages/pi-context/samples/schemas/*.json` → exit 1, zero matches. No status enum admits deliberate suspension. `.context/framework-gaps.json` FGAP-103 `status:"identified"`, `closed_by:null`, P1, title verbatim: "PM lifecycle vocabularies admit no deliberate-suspension status on any kind; a paused arc is unrepresentable (phase acute: derived focus presents it as active)".

## GROUP-KB-04 — Surface-parity holes

### ATOM-KB-07 — `/context` human slash surface omits `update` + 4 operator ops; parity-check blind to it (FGAP-135)  [VERDICT: still-broken-confirmed]
- action: Register `update` (and `resolve-conflict`, `resolve-blocked`, `context-validate-relations`, `reconcile`) in `CONTEXT_SUBCOMMANDS`, and extend the parity check to cover the human `/context` surface (not only op↔CLI), so the reconcile/update/conflict ops are reachable in-pi.
- scope: `packages/pi-context/src/index.ts:3882` `CONTEXT_SUBCOMMANDS`; the parity-check; FGAP-135
- observed: `index.ts:3882 const CONTEXT_SUBCOMMANDS: Record<string, SubcommandEntry> = {`. Brace-matched enumeration of its top-level keys: `[init, switch, list, archive, install, view, status, validate, help]` — none of `update`, `reconcile`, `resolve-conflict`, `resolve-blocked`, `context-validate-relations` present. `.context/framework-gaps.json` FGAP-135 `status:"identified"`, `closed_by:null`, P1, title verbatim: "The pi /context command surface is unguarded against the op registry — operator-action ops (update, reconcile, resolve-conflict, resolve-blocked, validate-relations…)". CORRECTION to atom metadata: the live object has 9 keys, not the "15 keys" the atom claimed; the missing-ops defect stands unchanged.

### ATOM-KB-08 — Work-order pi-only auth-gated tools have no non-interactive invocation path (FGAP-126)  [VERDICT: still-broken-confirmed]
- action: Provide a non-interactive invocation path for the 8 pi-only auth-gated tools so work-order dispatch can reach them outside an interactive session (part of FEAT-014; input-validation/scope-clamp/relabel facets already landed).
- scope: framework-gaps FGAP-126 under FEAT-014; work-order dispatch engine; the 8 pi-only auth-gated tools
- observed: `.context/framework-gaps.json` FGAP-126 `status:"identified"`, `closed_by:null`, P1, title verbatim: "The eight pi-only auth-gated tools have no non-interactive invocation path, and the gate refuses the ceremony while passing the composite that embeds its effect…". Unfixed.

## GROUP-KB-05 — Doc-vs-implementation drift that fails at runtime

### ATOM-KB-09 — pi-workflows advertises ~34 `${{ }}` filters; registry implements 10 (FGAP-131)  [VERDICT: still-broken-confirmed]
- action: Reconcile the filter registry with the docs — either implement the missing advertised filters or remove them from the README — so no advertised `${{ }}` filter throws at runtime.
- scope: `packages/pi-workflows/src/expression.ts:10` (`FILTERS`); `packages/pi-workflows/README.md:104`; FGAP-131
- observed: `expression.ts:10 const FILTERS` registers exactly 10 keys: duration, currency, json, length, keys, filter, last, first, slugify, shell. README "Available filters:" line advertises 35 names: length, keys, filter, json, upper, lower, trim, default, first, last, join, split, replace, includes, map, sum, min, max, sort, unique, flatten, zip, group_by, count_by, chunk, pick, omit, entries, from_entries, merge, values, not, and, or — most (upper, lower, trim, default, join, split, map, sum…) unimplemented, would throw at runtime. `.context/framework-gaps.json` FGAP-131 `status:"identified"`, `closed_by:null`. CORRECTION: registry count 10 exact-matches the atom; README advertises ~35 (atom said ~34) and the "Available filters" line sits ~1 line below the cited README.md:104. Defect stands.

### ATOM-KB-10 — 8 of 15 bundled pi-workflows specs invalid under `validateWorkflow` (FGAP-132)  [VERDICT: still-broken-confirmed]
- action: Fix the 8 bundled specs so they validate under `validateWorkflow` (analyze-existing-project, create-phase, do-gap, fix-audit, gap-to-phase, init-new-project, pausable-analysis, resumable-analysis).
- scope: the 8 named bundled specs; FGAP-132
- observed: `ls packages/pi-workflows/workflows/` → 15 `.workflow.yaml` specs; all 8 named specs present (analyze-existing-project, create-phase, do-gap, fix-audit, gap-to-phase, init-new-project, pausable-analysis, resumable-analysis confirmed on disk). `.context/framework-gaps.json` FGAP-132 `status:"identified"`, `closed_by:null`, title verbatim: "8 of 15 bundled pi-workflows specs are invalid under validateWorkflow; the invalidator is error-level input-contract/template drift…". Note: I did not re-run `validateWorkflow` here (requires a package build); confirmation rests on the unclosed gap plus the 15-spec / 8-named layout matching the claim.

## GROUP-KB-06 — Contract implements only a demo subset

### ATOM-KB-11 — Work-order engine does not consume `context_blocks` / `output_contract` (FGAP-125)  [VERDICT: still-broken-confirmed]
- action: Extend the work-order dispatch engine to consume the declared `context_blocks` and `output_contract` semantics (currently only `input_contract` validation, scope clamp, and `aborted-non-interactive` relabel landed).
- scope: framework-gaps FGAP-125 under FEAT-014; work-order dispatch engine
- observed: `.context/framework-gaps.json` FGAP-125 `status:"identified"`, `closed_by:null`, P1, title verbatim: "Work-order schema is a v1 contract whose engine implements a demo subset — four required fields never consumed, and the catalog schema asserts a scope clamp…". Confirmed still filed under FEAT-014 (git HEAD~1 `1e5040ae` filed TASK-123 (FGAP-125) / TASK-124 (FGAP-128)). Unfixed.

### ATOM-KB-12 — No work-order retry policy (FGAP-128)  [VERDICT: still-broken-confirmed]
- action: Implement a work-order retry policy so the dispatch engine honors the declared retry semantics (residual leg of FEAT-014).
- scope: framework-gaps FGAP-128 under FEAT-014; work-order dispatch engine
- observed: `.context/framework-gaps.json` FGAP-128 `status:"identified"`, `closed_by:null`, P1, title verbatim: "The work-order loop records a no-UI ctx.ui.confirm default as 'aborted-by-human', and its retry path is structurally dead non-interactively". Unfixed (TASK-124 filed but gap open).

## GROUP-KB-07 — Install-time materialization / UX gaps

### ATOM-KB-13 — Install does not copy/materialize agents into the consuming project (TASK-119)  [VERDICT: still-broken-confirmed]
- action: Implement install-time agent materialization so `install` copies agents into the consuming project as editable files (the jit-loader project-tier gap FGAP-127 is already closed via TASK-103; the copy step is separate and unstarted).
- scope: TASK-119 (install-time agent materialization); install path
- observed: `.context/tasks.json` TASK-119 `status:"planned"` (unstarted). Cited FGAP-127 confirmed `status:"closed"` (closed_by TASK-103/VER-081 — bundled builtin agents tier wired into the dispatch loaders); TASK-103 `status:"completed"`. The install-time copy step (TASK-119) remains planned/unimplemented, distinct from the closed jit-loader gap. Matches the atom.

## GROUP-KB-08 — Governance / project-state conditions (lower-confidence)

### ATOM-KB-14 — No convention governs substrate bootstrap-state provisioning + identity reconciliation (FGAP-052)  [VERDICT: still-broken-confirmed]
- action: Define and enforce a convention for substrate bootstrap-state provisioning and substrate-identity reconciliation. (Lower-confidence: a governance gap, not a runtime throw.)
- scope: framework-gaps FGAP-052; bootstrap-state / substrate-identity convention
- observed: `.context/framework-gaps.json` FGAP-052 `status:"identified"`, `closed_by:null`, P3, title verbatim: "No convention governs substrate bootstrap-state provisioning + substrate-identity reconciliation". Governance gap, unfixed.

### ATOM-KB-15 — Active `.context` is the pi-context dev substrate, not a clean baseline for the operation-framework port (issue-010)  [VERDICT: still-broken-confirmed]
- action: Establish a clean baseline `.context` for the operation-framework port instead of using the pi-context dev substrate. (Lower-confidence: a project-state condition, not a code defect.)
- scope: `issues.json` issue-010; the active `.context` baseline
- observed: `.context/issues.json` issue-010 `status:"open"`, title verbatim: "Active .context is the pi-context dev substrate, not a clean baseline for the operation-framework port". Corroborated live: `.context/framework-gaps.json` is 518 KB / 141 gaps — the active dev substrate, not a clean port baseline. Unfixed.

### ATOM-KB-16 — Packaged catalog `samples/conception.json` drifts below live `.context/config.json` (FGAP-102)  [VERDICT: still-broken-confirmed]
- action: Reconcile the packaged catalog `samples/conception.json` with the live `.context/config.json` across propagated registries so the shipped catalog does not lag the live config. (Lower-confidence: anchored to agent npx probes, not a David verbatim break.)
- scope: catalog `samples/conception.json`; live `.context/config.json`; FGAP-102
- observed: `.context/framework-gaps.json` FGAP-102 `status:"identified"`, `closed_by:null`, P1, title verbatim: "Packaged catalog drifts below live config across all four propagated registries and ships a state_derivation reference to an unregistered relation_type…". Live file timestamps consistent with lag: `packages/pi-context/samples/conception.json` last modified Jul 5 21:30 (23,921 B) vs `.context/config.json` modified Jul 11 23:35 (28,090 B). Unfixed.

### ATOM-KB-17 — workflows `ctrl+j` / `ctrl+h` chord shadows pi built-ins (issue-011)  [VERDICT: still-broken-confirmed]
- action: Rebind or scope the workflows `ctrl+j` / `ctrl+h` chords so they no longer shadow pi's built-in newline/Backspace bindings. (Lower-confidence: June excluded it on provenance; July lists it open-for-completeness.)
- scope: `issues.json` issue-011; workflows keybindings (`ctrl+j`/`ctrl+h`)
- observed: `.context/issues.json` issue-011 `status:"open"`, title verbatim: "workflows extension ctrl+j shortcut shadows pi built-in newline (tui.input.newLine); ctrl+h byte-aliases legacy Backspace — chords registered with no built-in-set check". Unfixed.
