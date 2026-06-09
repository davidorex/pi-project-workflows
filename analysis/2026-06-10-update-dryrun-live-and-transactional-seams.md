# pi-context `update` — dry-run/live outcome divergence + the per-component transactional seam

Empirical investigation prompted by in-pi `update` usage where a schema (`conventions`) was previewed `resynced` under `--dryRun` but came back `blocked` on the live run. Root cause established from code, reproduced in a throwaway substrate, cross-checked against what the substrate already decides. Three findings, each with its canonical home.

## 1. Dry-run/live outcome divergence — root cause (already tracked as FGAP-066)

`updateContext` (`packages/pi-context/src/index.ts`) splits the `catalog-ahead` arm into a dry branch and a live branch that are **not equivalent**:

- **Dry** (`index.ts:1239-1262`) unconditionally pushes the schema onto `result.resynced` and computes the would-register migration decls **read-only**. Its own comment: *"The concrete resynced/migrated/blocked outcome is unknowable without running it, so report the schema as the would-act (resynced) set."* It never forward-migrates the block items or re-validates them.
- **Live** (`index.ts:1273` → `resyncSchema` `:599-641`) forward-migrates the items (`validateBlockWithMigrationForDir` `:601`) and re-validates against the new schema; on an AJV failure it restores the schema bytes, restores/removes `migrations.json`, and returns `blocked` with empty `registeredMigrations` (`:622-640`) — byte-exact rollback.

A dry `resynced` therefore asserts *"would act,"* not *"would succeed"* — it structurally cannot predict `blocked`, because the only thing that produces `blocked` is the live re-validation it skips. This is FGAP-066 (identified, P2); its `proposed_resolution` already names the fix: under `--dryRun`, forward-migrate the populated block **in memory** and AJV-validate against the new schema, classifying resynced/migrated/blocked without writing.

## 2. Reproduction (throwaway substrate)

A minimal substrate with `conventions` installed at 1.0.0, a catalog at 1.0.1 reachable by the identity 1.0.0→1.0.1 migration where 1.0.1 **adds a required field `rationale`**, and one rule item valid at 1.0.0 (lacking `rationale`). Independently re-run:

- `checkStatus` → `conventions` `catalog-ahead`, baseline 1.0.0, catalog 1.0.1.
- **Dry** → `resynced: ["conventions"]`, `migrationsRegistered: [{conventions, 1.0.0→1.0.1}]`, `blocked: []`.
- **Live** → `blocked: ["conventions"]`, `resynced: []`, `migrationsRegistered: []`; schema unchanged, block unchanged, installed version still 1.0.0 (byte-exact rollback).
- AJV failure: `must have required property 'rationale'` at `/rules/0`. The identity migration moves the item byte-unchanged, so it still lacks the field → fails the tightened schema → `blocked`.

## 3. Registry propagation runs despite a blocked sibling schema — the transactional seam

The post-loop config-registry propagation (`index.ts:1391-1421`) is **not gated** on the schema-loop outcome: it computes `registryAdditions` via `mergeCatalogRegistries` and, when `!dryRun`, calls `writeConfig` — unconditionally. In the live reproduction (with `conventions` blocked), `registryAdditions` is identical to the dry run (including `item_derived_from_item`) and `writeConfig` ran. So a live `update` that reports `blocked` still mutated `config.json` (added relation_types/block_kinds/invariants/lenses). This is the partial-application / transactionality seam, untracked before this investigation.

## 4. What the substrate already decides — and does not

The substrate is **silent** on whether `update` is atomic across the schema loop and the registry propagation:

- **DEC-0017** (enacted): *"Update never silently clobbers a customization and never hard-blocks the remaining schemas."* Decides per-schema independence **across sibling schemas** — not the registry-vs-blocked-schema coupling.
- **issue-001** (resolved): the only filed statement of rollback **scope** — `resyncSchema`'s byte-exact restore is **per-schema** (that schema's file + its `migrations.json` decls); silent on `config.json`/registries.
- **VER-025** (FGAP-060 closer): the propagation is post-loop, `!dryRun`-gated, with a try/catch that *"preserves the schema-update result."* Every protective clause isolates the loop **from** the merge — the inverse (a blocked schema gating the merge) is never contemplated.
- **FEAT-006 implementing tasks** (TASK-034–039): across all 18 acceptance criteria, the registry-vs-schema coupling, dry/live **outcome parity**, and rollback **scope** are all **unspecified**. Dry-run was specified only as preview/report ("prints the per-schema drift state + intended action", "lists … without writing") — weaker than outcome parity. **TASK-038** (the registry slice) is scoped purely to additive-merge-vs-config and its description frames it as a *"disjoint seam … Independent of the schema-merge slices"* — the decoupling was deliberate, but its cross-cutting consequence was never stated.

So per-component application is true **by construction** but **incidental, not decided**.

## 5. General class

Every other `--dryRun` site in `packages/pi-context/src` is **faithful** (validate the prospective result, gate only the write — block-api upsert, the context-sdk relation ops, and `update`'s own 3-way-merge arm via `writeSchemaCheckedForDir`). The **only** unfaithful preview is the `catalog-ahead` arm. The class — *"a `--dryRun` preview computed by a path other than the real mutation cannot predict failures the mutation produces"* — is real but currently **single-instance**, and FGAP-066 already targets it.

## 6. UX intention (the basis for the decision)

`update` does two things with opposite risk profiles: **additive vocabulary propagation** (new relation_types/block_kinds/invariants/lenses — never touches data, can't corrupt, the user wants it and can't use it if withheld) and **schema version migration** (touches user data, the only thing that can `block`). The plausible intention given real use:

- **Per-component, not whole-run-atomic.** Withholding safe, zero-risk vocabulary because an unrelated schema's migration couldn't validate is all cost, no benefit. The per-schema byte-exact rollback is the correct safety boundary; the additive registry write sitting outside it is correct. This is the literal extension of DEC-0017 ("never hard-blocks the remaining schemas") from sibling schemas to the registry step.
- **The real defect is legibility, not the partial application.** A run reporting `blocked` can read as *"nothing happened"* while `config.json` changed. The result must make the partiality unmissable — surface, together, what was applied (`registryAdditions`) and what was refused and why (the blocked schema + its validation error).
- **Dry-run's purpose dictates parity.** A dry-run exists to surface risk before committing; a preview that says `resynced` when live will `block` hides exactly the risk it was run to find.

## Findings → canonical filings

- **A — dry/live outcome parity:** FGAP-066 (exists) + an addressing task (the in-memory migrate+validate dry-run).
- **B — per-component transactional model:** a decision (filed `open`; affirms per-component, derived from DEC-0017), pending user enactment.
- **C — partial-application legibility:** a new framework-gap (a `blocked` result must surface what applied + what blocked, so it never reads as no-op).

This document is the shared grounding for all three; the reproduction is FGAP-066's empirical evidence.
