# Content-Addressed Substrate Identity — Execution Plan (off-substrate)

Date: 2026-05-31
Source of truth: `analysis/2026-05-31-content-addressed-substrate-identity-implementation-spec-v3.md` (the v3 work-order spec; supersedes v1 / Spec A / the comparison).
Branch: `context-jit-spec-v2` (operator-designated disposable).

## Tracking discipline — OFF the pi-context books

This arc is NOT encoded in pi-context substrate. No TASK / FGAP / DEC blocks are created for it; `.project` / `.context*` blocks are not written as the work tracker. Rationale: Phase H migrates the substrate's own identity model — tracking the work inside pi-context would force the migration to migrate its own tracking records, which is exactly the debt this avoids.

Tracking lives in:
- **git commits** on this branch (forensic messages),
- **this execution plan** + the **v3 spec** (the per-cycle plan source),
- **plan-mode plans** (`~/.claude/plans/*.md`) refined per cycle,
- **adversarial audit reports** committed to `analysis/` (tracked).

## Per-cycle loop (every cycle, no exceptions)

Each cycle runs four steps:
1. **Explore** — read-only investigation (Explore agent) of the exact surfaces the phase touches; never main-loop grep as investigation.
2. **Write plan** — plan mode; resolved decisions, no hedging; operator approves before any code.
3. **Implement** — foreground coding subagent from the approved plan; orchestrator never hand-writes source. Commit per step.
4. **Adversarial audit** — fresh-context agent (never the implementer) probes for false-pass; report committed to `analysis/`.

## Binding gates after EVERY cycle (load-bearing — not optional)

- `npm run build && npm run check && npm test` — full output, no pipe-to-tail (pipe masks exit code).
- **Live demonstration of working state** — exercise the actual feature path end-to-end via real invocation (tsx eval against block-api / context-sdk, real CLI invocation, real substrate). A live demo of the working state is REQUIRED at the end of every cycle, not just the phase that introduces it.
- **No regressions** — re-run the prior cycles' live demos + the full suite; a later cycle that breaks an earlier cycle's demonstrated behavior is a failed cycle, not a tracked-for-later item. Regression halts the cycle.
- **Test success ≠ works** — passing tests are necessary, never sufficient. Tests pass for the wrong reason (side-effect masks feature; assertion no longer tests what it claims; import silently no-ops; fallback swallows failure). The live demo + adversarial probe are what establish "works"; the suite alone never does.
- **Adversarial probe verdict required before a cycle is declared green** — and the orchestrator independently re-verifies the probe (adversarial probes can under-flag).

## The 10 cycles

Principle: one cycle per phase that mutates existing behavior or has high blast radius; batch only purely-additive isolated new modules; split the two highest-risk phases (E, F) so a behavior-preserving change is proven inert before new logic rides on it.

| # | v3 phase(s) | Delivers | Why its own cycle | Depends on | Audit + live-demo focus |
|---|---|---|---|---|---|
| 1 | **0** | `*ForDir` write/alloc primitives; existing fns become wrappers | Touches every core write primitive; prerequisite for migration + promotion | — | live: write a block into a NON-active substrate dir + read back; **active pointer never moves**; wrappers byte-identical |
| 2 | **A + B** | `content-hash.ts` (JCS, projection excluding `id`) + `object-store.ts` | Pure new leaf modules, zero existing-caller impact | — (B uses A) | live: hash stable across key reorder; `id`/author fields excluded; object round-trips by hash |
| 3 | **C** | OID mint + `oid`/`content_hash`/`content_parent` on 16 schemas + `prepareItemIdentityForWrite` in ALL birth/mutation primitives + schema bumps + migration decls + **harden `metadataFieldsForSchema` to the mandatory-floor union** + **operation-aware informed confirm in `authGateHandler` for `x-identity` schema writes** (both carried from Cycle 2 audit — see below) | First phase mutating existing write behavior across all primitives + all schemas | 0, A, B | live: append/upsert/update real items → all three fields stamped; rename ≠ hash change; oid immutable on update; legacy reads still validate; **an `x-identity` override omitting `id` still excludes the floor**; **a `write-schema` payload carrying an `x-identity` override produces a confirm message naming the changed exclusions + the retained floor** |

**Cycle 3 carried item (from Cycle 2 adversarial audit `analysis/2026-05-31-cycle2-content-addressing-adversarial-audit.md`, decided fix — NOT an open question):** Cycle 2 shipped `metadataFieldsForSchema = override ?? DEFAULT_METADATA_FIELDS` (an `x-identity.metadata_fields` override replaces the *whole* exclusion set). Dormant in Cycle 2 (no overrides, no live caller). Before Cycle 3 wires `contentProjection` into any write path OR authors any `x-identity` override, change it to `MANDATORY ∪ (override ?? DISCRETIONARY)` where MANDATORY = `{id, oid, content_hash, content_parent}` (non-overridable) and DISCRETIONARY = `{created_by, created_at, modified_by, modified_at, closed_by, closed_at}`. Rationale + the binding regression test are specified in v3 spec §A2. Without this, an override that omits `id` would let a refname rename silently move the content hash — a violation of the rename-stability invariant the whole identity model rests on.

**Second Cycle-3 carried item — informed authorization (decided, required, NOT a future enhancement):** the `write-schema`/`write-schema-migration` action is already user-gated (in `AUTH_REQUIRED_TOOLS`), but the gate is tool-name-level and shows only a truncated arg summary — a human can authorize an `x-identity` override without understanding it changes content-hash exclusions. Cycle 3 makes `authGateHandler` operation-aware: a pure `describeIdentityOverride(schema): string | null` helper in pi-context (single source of the `x-identity` semantics) computes the human-readable delta vs the default; `authGateHandler` enriches the confirm message with it when a gated schema-write payload carries an `x-identity.metadata_fields` annotation (and affirms the mandatory floor stays excluded), leaving the confirm byte-identical when none is present. Full spec + binding test in v3 spec §A2 layer (3). This is defense-in-depth layer 3 (structural floor + action gate + informed authorization); all three are required and none substitutes for another.
| 4 | **D** | `config.substrate_id` SoT + registry/aliases + drift invariant + init wiring | Independent surface; can build parallel to C | — | live: register two substrates, rename one's dir in registry, resolve still works; drift detected; init registers |
| 5 | **E1** | `EdgeEndpoint` type + `relations.schema.json` oneOf+bump + raw writers (plumbing) + `appendRelationByRef` (porcelain) | Highest-blast-radius phase — isolate data-model + write path | — | live: write structured item edge + lens-bin edge; porcelain resolves a friendly selector; raw writer signatures intact |
| 6 | **E2** | Update 6 consumers + BOTH validators to structured + dual-form (legacy string AND structured, since data isn't migrated until H) | The corruption-risk surface (lens-bin parents must not be treated as items) | E1 | live: validate a substrate holding both old string edges and new structured edges; lens-bin validated against bins; no double-report |
| 7 | **F1** | `SubstrateIndex { byRefname, byOid, items }` — split lookup maps from iteration surface; update 8 iteration + 10 lookup sites | Behavior-preserving refactor — prove it changes NOTHING before F2 | — | live: `validateContext` output IDENTICAL to pre-refactor on the real active substrate; no item double-counted |
| 8 | **F2** | `resolveRef` + `buildIdIndexForDir` + validator severity split (active/foreign/lens_bin → CLEAN; unregistered/dangling → ERROR) | New cross-substrate logic; load-bearing; MUST precede migration | D, E2, F1 | live: synthetic foreign-edge fixture resolves `foreign`; unregistered → ERROR; dangling → ERROR |
| 9 | **G** | `promoteItem` + `item_derived_from_item` lineage (new OID via `nextIdForDir` + `mintOid(destId)`) | Self-contained feature on foundations | 0, B, D, E1 | live: promote a real item between two scratch substrates; new oid dir-targeted; lineage edge filed; source superseded; inbound edges still resolve |
| 10 | **H** | Cross-project migration: discover → substrate_id+register → OID/hash/object backfill → endpoint conversion → drift check → live-schema edits+decls → verification gate | Capstone integration; clears the 30 errors | all prior | live: run migration on the real repo; `validateContext('.')` "does not resolve" count → **0**; zero item loss; lens-bin edges preserved; idempotent re-run = 0 new |

## Deliberate splits

- **E → E1/E2** isolates lens-bin validator correctness — the one place the migration could silently corrupt relations — into its own audit.
- **F → F1/F2** makes the riskiest change "prove the refactor is inert" (F1: identical validation output) then "add cross-substrate resolution" (F2). Never debug a new-logic bug and a refactor regression at once.

## Fixed ordering (hazard-forced)

- Cycle 1 (Phase 0) before Cycle 10 (migration).
- Cycle 2 before Cycle 3. Cycle 3 needs 1+2.
- **Cycle 8 (F2) MUST precede Cycle 10** — else every rewritten edge becomes a fresh dangling error, strictly worse than today.
- Live-schema edits (in Cycle 3) before any item write.
- Cycles 2/3 and 4 (D) are mutually independent; D can slot anywhere before F2. The rest are linear.

## Out of pi-context release flow

No `npm run release:*`, no npm publish in this arc. Build/check/test/live-demo/regression-check/adversarial-audit + git commit per cycle. The v3 spec governs each phase's exact files, signatures, tests, demos, and probes.
