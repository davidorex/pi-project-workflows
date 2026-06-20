# Audit — TASK-058 proposed resolution (`walk-migration-chain` read-only op, the git-bisect analog, G4)

Date: 2026-06-20
Scope: read-only audit of TASK-058's description + acceptance_criteria (the proposed resolution) for poisoned assumptions — wrong / overly-complex / non-best-practice design. No substrate mutation, no implementation.

## Verdict

**HAS-PROBLEMS** — the task is well-grounded and its machinery-reuse claim is accurate, but ONE acceptance criterion encodes a **self-defeating design** (per-step validation against the *final* target schema only) that does not deliver the op's own stated purpose (isolate *which step* breaks). The criterion as written can mis-attribute the failure or fail to isolate at all. A corrected resolution is proposed below.

A second, smaller problem: the criterion that branches on "blocked vs not-blocked" to pick the chain source overlaps confusingly with the existing dual chain-resolution already in the codebase and should be tightened to name the exact existing source functions, so the implementer does not invent a third chain-resolution path.

## What was read (citations)

- TASK-058 fields (description + 6 acceptance_criteria + notes) — `pi-context read-block-item --block tasks --id TASK-058`.
- TASK-058 references: only two edges, both `item_governed_by_convention` → `docs-surface-sync`, `cli-command-form`. **No upstream FGAP/FEAT/DECISION relation exists** (`find-references --id TASK-058`, total 2). The "upstream proposed_resolution" is the operator-story G4 statement quoted verbatim in the task's own `notes`, not a separate gap item.
- `cli-command-form` convention (governs the command form — a run-and-exit diagnostic is a BARE verb, so `walk-migration-chain` as a bare subcommand is correct, not a flag).
- `docs-surface-sync` convention (governs criterion 6's docs deliverable).
- Migration machinery the task claims to reuse:
  - `schema-migrations.ts:96-131` `resolve()` — walks edges forward step-by-step, returns ordered `MigrationFn[]`.
  - `schema-migrations.ts:144-159` `runMigrations()` — applies the chain cumulatively (`for (const step of chain) cursor = step(cursor)`). This IS the per-step walk loop; the op reuses it.
  - `migration-registry-loader.ts:262-278` `buildFreshRegistryWithChain()` — fresh registry seeded from substrate decls + catalog chain, never warms the project cache (exactly the read-only-diagnostic primitive the op needs).
  - `index.ts:919-981` `validateBlockItemsAgainstCatalog()` — the existing read-only diagnostic that forward-migrates a block ALL-AT-ONCE through the chain and validates against the catalog schema, returning per-item `BlockValidationFailure[]`.
  - `index.ts:681-707` `findCatalogMigrationChain()` — resolves the catalog chain (`samples/migrations.json`) from→to as `MigrationDecl[] | null`.
  - `index.ts:437` `mapValidationFailures()` + `index.ts:373` `BlockValidationFailure` — AJV-error→per-item mapping the op reuses for its per-step failure attribution.
  - `index.ts:2338-2418` `resolveBlocked()` + the pending-blocked store: the "pinned pending-blocked chain" is real — `entry.chain` (a `MigrationDecl[]`) plus a pinned `target_hash` body in the object store, resolved DIFFERENTLY from the catalog chain.
- Catalog body layout — `samples/schemas/<kind>.schema.json` is ONE body per kind; `samples/migrations.json` carries the transform decls. **Confirmed: the catalog ships only the latest schema body per kind; no intermediate-version bodies exist on disk.** The task's stated limitation is factually correct.

## Findings

### F1 — SOUND: machinery-reuse claim is accurate, no parallel machinery

The task's `notes` claim ("Reuses the existing chain machinery — fresh in-memory registry, step-ordered application, per-item failure mapping — no new parallel machinery") is **correct against the code**. Every primitive the op needs already exists and is the read-only-correct one:
- fresh registry that never warms the cache → `buildFreshRegistryWithChain`
- step-ordered application → `runMigrations` (its loop is the walk)
- per-item failure mapping → `mapValidationFailures` + `BlockValidationFailure`
- catalog chain resolution → `findCatalogMigrationChain`

The op is a thin read-only diagnostic over these. No over-engineering at the machinery level. The `cli-command-form` decision (bare subcommand) is also correctly applied: a run-and-exit diagnostic is a bare verb per litmus (1).

### F2 — PROBLEM (headline): criterion 3 + 5 describe a validation that cannot isolate the breaking step

The op's STATED PURPOSE (description + the G4 story it quotes) is the **git-bisect analog**: "apply migration 1, validate, apply migration 2, validate — to isolate WHICH STEP breaks." Criterion 3 then says "the first validation failure is attributed to the step that introduced it (cumulative-prefix validation against the **target schema**)," and criterion 5 concedes "per-step validation is against the final target schema, not intermediate schema versions."

These two together are **self-defeating for the bisect use case**:

- Validating each cumulative prefix against the **final target schema** does NOT tell you which step broke. After step *k* the data is shaped for intermediate version *k*, which is NOT expected to satisfy the *final* schema until the LAST step runs. So early prefixes will "fail" the final schema **by construction** — that is the normal in-flight state of a multi-step migration, not a defect in step *k*. Attributing "the first prefix that fails the final schema" to a breaking step will routinely point at step 1 of any genuine multi-hop chain, because the half-migrated data legitimately doesn't match the final schema yet.
- Conversely the ACTUAL bisect signal — a step that *corrupts* the data such that even the FINAL fully-applied chain fails — is exactly what the existing `validateBlockItemsAgainstCatalog` ALREADY detects (it applies the whole chain then validates against the catalog/final schema). So the proposed op, as specified by criteria 3+5, collapses to "run the existing all-at-once validator, but also report intermediate prefixes that fail the final schema" — and those intermediate failures are noise, not isolation.

In short: criterion 5's honestly-stated limitation (only the final schema is available) **negates** criterion 3's promise (isolate the breaking step). The op as specified either (a) duplicates `validateBlockItemsAgainstCatalog`'s verdict for the only meaningful signal, or (b) emits per-step "failures" that mislead, because a prefix failing the final schema is the expected mid-chain state.

What CAN be isolated honestly without intermediate schemas — and what the operator actually needs — is the **transform step that THROWS or corrupts** (a migration fn that errors, or produces structurally broken data such that the *remaining* steps or the final validation throw). That is a real, reusable bisect signal and it is the defensible scope. The op should isolate **the step whose application makes the FINAL outcome fail** — i.e. bisect by "does the chain still reach a final-schema-valid state if I stop/replace at step k," or more simply, surface per step (a) whether the transform threw, (b) what items changed, and (c) attribute a final-schema failure to the LAST step before which the data was still consistent — NOT claim per-prefix validation against the final schema isolates the culprit.

### F3 — PROBLEM (minor): criterion 4's chain-source branch is under-specified and invites a third resolution path

Criterion 4 ("when the schema is blocked, the walk uses the pinned pending-blocked chain; otherwise the catalog chain") is directionally right but names neither existing source. The codebase already has the two exact sources: `findCatalogMigrationChain(samplesRoot, name, from, to)` for the catalog chain and `entry.chain` from `loadPendingBlockedForDir(destRoot)` for the pinned blocked chain (`index.ts:2354-2358`). Left as prose, an implementer may build a third chain resolver. The criterion should name both existing sources verbatim so the brief is a literal instruction (per the substrate's verbatim-composition mandate).

### F4 — note (not a defect): no upstream gap/feature relation

TASK-058 carries only convention edges; there is no `task_addresses_gap` / feature relation. This is a filing-completeness observation for the operator, not a design defect in the proposed resolution. If a G-series operator-story or gap item exists for G4, relating the task to it would let the closure validate against the story verbatim. Surfaced for the operator to decide; not in scope to mutate.

## Proposed corrected resolution (ready to replace the task's fields)

### description (replace)

> Walk the migration chain incrementally (the `git bisect` analog): a read-only command (`walk-migration-chain --schemaName <name>`) that applies the schema's resolved migration chain one transform at a time in memory — apply step 1, record the result; apply step 2, record; … — reusing `runMigrations`' step loop over a fresh registry built by `buildFreshRegistryWithChain` (never warming the project cache). Per step it reports the step's decl (from→to, kind), which items' content changed at that step, and whether the transform THREW. The op isolates the breaking transform step honestly: because the catalog ships only the latest schema body per kind, intermediate-version validation is impossible, so the op does NOT claim a per-prefix verdict against the final schema (a half-migrated prefix legitimately fails the final schema and is not a defect). Instead it (a) flags any step whose transform throws or produces structurally invalid data, and (b) validates the FULLY-applied chain against the final target schema (reusing `validateBlockItemsAgainstCatalog`'s migrate-then-validate + `mapValidationFailures`), attributing a final-schema failure to the last step after which the data was still internally consistent. Nothing is written — the walk is entirely in memory over the live block data and the resolved chain: the catalog chain (`findCatalogMigrationChain`) when the schema is not blocked, or the pinned pending-blocked chain (`entry.chain` from `loadPendingBlockedForDir`) when it is.

### acceptance_criteria (replace the set)

1. A read-only command (`walk-migration-chain --schemaName <name>`) applies the resolved migration chain one transform at a time in memory, reusing the `runMigrations` step loop over a fresh registry from `buildFreshRegistryWithChain`; no substrate state is mutated (no schema write, no block write, no migrations.json append, no registry-cache warming).
2. Per step the output reports the step's decl (schemaName, from→to, kind) and which items' content changed at that step (diff of item bodies before/after the step).
3. Any step whose transform fn THROWS, or yields structurally invalid data that makes a later step or the final validation throw, is reported as the breaking step with the thrown error; the op does NOT assert a per-prefix validation verdict against the final target schema (an intermediate prefix is expected to fail the final schema and is not attributed as a defect).
4. The fully-applied chain is validated against the final target schema, reusing the existing migrate-then-validate path (`validateBlockItemsAgainstCatalog` semantics) and `mapValidationFailures` for per-item failures; a final-schema failure is attributed to the last step after which the data was still internally consistent.
5. The chain source is selected from the two existing resolvers, not a new one: the pinned pending-blocked chain (`entry.chain` from `loadPendingBlockedForDir(destRoot)`, with the pinned `target_hash` body) when the schema is blocked; otherwise the catalog chain (`findCatalogMigrationChain(samplesRoot, name, from, to)`).
6. The intermediate-schema limitation is stated honestly on the op's surface (description/promptSnippet): per-step validation against intermediate schema versions is impossible because the catalog carries only the latest body per kind; the op isolates the THROWING/corrupting transform step and attributes a final-schema failure, not a per-prefix intermediate-schema verdict.
7. Canonical pipeline green (build + check + full test; runtime demo isolating a SEEDED THROWING/corrupting step on a real multi-hop chain — not merely a final-schema mismatch; fresh adversarial probe); docs-surface-sync pass (`docs-surface-sync`) for the new op's surfaces (monorepo + pi-context README, ops-registry `description`/`promptSnippet`, SKILL regen).

### notes (replace)

> Origin: operator-story G4 (quoted): "As an operator, when I suspect a specific migration in the chain introduced a validation failure, I want to walk the chain incrementally … to isolate which step breaks. (git bisect analog.)" Reuses existing machinery only — `runMigrations` (step loop), `buildFreshRegistryWithChain` (fresh non-warming registry), `findCatalogMigrationChain` / pending-blocked `entry.chain` (the two existing chain sources), `validateBlockItemsAgainstCatalog` + `mapValidationFailures` (final migrate-then-validate + per-item mapping). Design correction over the first draft: because the catalog ships only the latest schema body per kind, per-prefix validation against the FINAL schema cannot isolate a step (a half-migrated prefix fails the final schema by construction); the honest bisect signal is the THROWING/corrupting transform plus final-schema attribution, not a per-prefix verdict.

## Bottom line

Machinery and command-form are sound and well-reused. The poisoned assumption is in the *verification model*: criteria 3+5 promise step-isolation via per-prefix validation against the final target schema, which the op's own stated limitation makes incapable of isolating anything (mid-chain prefixes fail the final schema legitimately). The corrected resolution re-scopes the bisect signal to the throwing/corrupting transform + final-schema attribution — deliverable with the existing single-body catalog — and names the two existing chain resolvers so no third path is invented.
