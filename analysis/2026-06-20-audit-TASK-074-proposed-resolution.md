# Audit — TASK-074 proposed resolution (block-file materialization op, FGAP-065)

Date: 2026-06-20
Scope: read-only audit of TASK-074's `description` + `acceptance_criteria` (the proposed resolution) and FGAP-065's upstream `proposed_resolution`, against the actually-cited code. No mutation, no implementation.

## Verdict

**HAS-PROBLEMS** — not because the design is wrong-in-direction, but because it proposes a **NEW op** to do work the **existing `installContext` / `context-install` op already does**, and the task's own acceptance criteria are satisfiable today by that existing op with zero new code. The genuine, non-redundant gap is narrower than the task frames: it is **wiring block-file materialization into `update`** (the post-install currency op) so a catalog-added block kind is brought current without a manual `context-install` re-run. The task should be re-scoped from "add a sanctioned materialize op" to "route `update` through the existing install-path block materialization (+ surface it in `--dryRun`)."

## What the cited code actually does (verified)

All four citations are accurate. The decisive one the task under-weights:

- **`installContext` (index.ts:1211, block loop 1299-1357) ALREADY materializes any declared-but-absent block file.** For each `installed_blocks` name it resolves the catalog starter (`samples/blocks/<data_path>`), and when the dest file is absent (`!destExists`, line 1354-1356) copies the starter and reports `installed`. It is idempotent and data-safe: a present-and-populated block is `preserved` (1313-1336, any array length>0, safety-default-populated on read failure), a present-and-empty block is `skipped` (1337-1350, JCS-equality idempotent skip). This is *exactly* "materialize the missing.blocks[] set via the install path, copying the catalog starter, never clobbering filed data" — the thing TASK-074 proposes to build.
- **`installContext` is already a sanctioned, CLI-reflected op:** `context-install` (ops-registry.ts:1504-1527, TASK-059, closes FGAP-088), `authGated`, surface `use`. Its description already states "empty or absent blocks get the catalog starter."
- **`updateContext` (index.ts:1818-2151) has zero block-data-file operations** — schemas (resync/migrate/3-way-merge) + the four keyed config registries (`mergeCatalogRegistries`, 2118-2148) only. FGAP claim verified. So the one real propagation gap is here.
- **`findUnmaterializedAssets` (context.ts:612-620)** + **`deriveBootstrapState` (context-sdk.ts:397-413)**: `not-installed` iff any `installed_blocks` dest file absent. Verified.

## Live triggering instance — already repairable today

- Active substrate is `.context` (`.pi-context.json` → contextDir).
- `context-bootstrap-state` → `{state: not-installed, missing.blocks: ["milestone"]}`.
- `milestone` IS in `config.installed_blocks` (read-config); `.context/milestone.json` absent on disk; 20 other block files present; `samples/blocks/milestone.json` (the catalog starter) exists.

Therefore running the EXISTING `context-install` against live `.context` today would: iterate to `milestone` → dest absent → copy `samples/blocks/milestone.json` → `.context/milestone.json` → report `installed:["milestone.json"]`; every populated block → `preserved` (untouched); then `context-bootstrap-state` → `ready`. **All three TASK-074 acceptance criteria pass with the existing op, no new code** (criterion 3 — writable, `append-block-item --autoId` — succeeds because the copied starter is a valid empty block file).

## Poisoned assumptions

1. **(OVERLY COMPLEX / scope-creep) "Add a … op that materializes …" frames a NEW op.** The materialization act already exists in `installContext` and is already CLI-reflected as `context-install`. A second op that copies catalog starters into absent block dest files duplicates the install-path block loop — two surfaces for one act, the exact divergence-risk the codebase's "single source of dest derivation" comments (context.ts:589-591, 1258-1259) exist to prevent. The task even says "copying the catalog starter via the install path" — i.e. it already knows the path exists; it should REUSE it, not re-home it behind a new op name.

2. **(WRONG framing of the live cause vs. the proposed fix) "Invoked by update for a catalog-added block kind."** Update does not call `installContext` today and has no block ops, so this clause describes work that does not exist — fine as a target. BUT the FGAP itself notes (correctly) the live milestone `not-installed` state was produced by the **install-ceremony** declaration write, not by update. The task's primary criterion ("a substrate … reports not-installed; the op materializes … ready") is already met by re-running `context-install`; the only thing update-wiring adds is *not having to re-run install manually* after a catalog adds a kind. So "invoked by update" is the genuinely-new ~20% of the task; "available standalone as a repair/materialize op" is the redundant ~80%.

3. **(NON-BEST-PRACTICE / unstated reuse) `files: ["packages/pi-context/src/index.ts"]` with no mention of routing through the existing block loop.** A brief composed verbatim from this would invite an implementing agent to write a parallel materialize function rather than extract/call the install-path loop — producing exactly the two-implementations-of-one-act drift the codebase guards against. The fix belongs at `updateContext`, calling the same block-materialization the installer uses (extract the 1299-1357 loop into a shared `materializeMissingBlocks(destRoot, config, samplesRoot, byId)` helper that both `installContext` and `updateContext` call), so installer and updater cannot diverge — mirroring how `installedBlockDestPath` / `findUnmaterializedAssets` already share one derivation.

## What is sound

- The **detector/state semantics are correctly read** (not-installed iff missing.blocks non-empty); no false assumption there.
- The **data-safety intent** ("never clobber filed items") is right and already embodied in the install loop — reusing that loop inherits it for free; a novel op would have to re-implement the FGAP-029 populated-block preservation, a regression risk.
- The **general class** is real and correctly named (catalog evolution has no block-materialization propagation path into an already-installed substrate; sibling of the FGAP-094/095/096/097/099 schema-evolution family). `--dryRun` preview is appropriate and aligns with update's existing `dryRun` contract.

## Proposed corrected proposed-resolution (ready to replace TASK-074 fields)

**description (replace):**
> Bring catalog-added block kinds current in an already-installed substrate by routing `updateContext` through the SAME block-materialization the installer already uses. Extract `installContext`'s block-materialization loop (index.ts:1299-1357 — for each `installed_blocks` name: copy the catalog starter to the absent dest file; `preserved`/`skipped` for present populated/empty blocks) into a shared helper `materializeMissingBlocks(destRoot, config, samplesRoot, byId)`; call it from both `installContext` (no behavior change) and `updateContext`, so installer and updater cannot diverge on how a block file is materialized (mirrors the shared `installedBlockDestPath` / `findUnmaterializedAssets` dest derivation). Surface the materialized set in `UpdateResult` and predict it under `--dryRun` (writing nothing), matching update's existing dryRun contract. No new standalone op: the standalone repair surface already exists as `context-install` (TASK-059), which materializes any declared-but-absent block file idempotently — this task adds the update-time propagation it lacks. Data safety (FGAP-029 populated-block preservation) is inherited by reusing the install loop, not re-implemented.

**acceptance_criteria (replace):**
> - A substrate whose config declares a block kind with no data file reports not-installed; `update` materializes the block's data file (catalog starter, never clobbering a populated block) and `context-bootstrap-state` then reports ready.
> - `update --dryRun` previews the would-materialize block set without writing; the live `update` materializes exactly that set.
> - `installContext` / `context-install` behavior is unchanged (regression check: existing install/re-sync tests stay green), confirming the extracted helper is behavior-preserving.
> - The materialized block is writable: `append-block-item --autoId` succeeds against it.
> - The shared helper is the single block-materialization site (no second copy-starter-to-dest implementation), verified by grep: only `installContext` and `updateContext` call it.

**files (replace):** `packages/pi-context/src/index.ts` (extract+share the block loop; call from updateContext), `packages/pi-context/src/ops-registry.ts` (update op `description`/`promptSnippet` + dryRun-preview surface to name block materialization), plus the docs-surface-sync audit (monorepo + pi-context README, `update` op strings, SKILL via `npm run skills`).

**notes (replace):** Unblocks milestone activation on live `.context` — note the live instance is *also* repairable today by re-running `context-install` (no code), so this task's NET-new value is the update-time auto-propagation, not the standalone materialize act (which exists). Acceptance criterion "previously not-installed → ready" must be demonstrated through `update`, not `context-install`, to prove the new path.
