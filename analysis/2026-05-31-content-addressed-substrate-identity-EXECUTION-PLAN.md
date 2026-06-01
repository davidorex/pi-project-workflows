# Content-Addressed Substrate Identity — Execution Plan (off-substrate)

Date: 2026-05-31
Source of truth: `analysis/2026-05-31-content-addressed-substrate-identity-implementation-spec-v3.md` (the v3 work-order spec; supersedes v1 / Spec A / the comparison).
Branch: `context-jit-spec-v2` (operator-designated disposable).

## Tracking discipline — OFF the pi-context books

This arc is NOT encoded in pi-context substrate. No TASK / FGAP / DEC blocks are created for it; `.project` / `.context*` blocks are not written as the work tracker. Rationale: Phase H migrates the substrate's own identity model — tracking the work inside pi-context would force the migration to migrate its own tracking records, which is exactly the debt this avoids.

Tracking lives in:
- **git commits** on this branch (forensic messages) — the authoritative record,
- **the Status ledger below** (this doc) — the consolidated plan-vs-progress view, updated lockstep as cycles land,
- the **v3 spec** (the per-cycle work-order source),
- **plan-mode plans** (`~/.claude/plans/*.md`) refined per cycle (current-cycle only — overwritten each cycle),
- **adversarial audit reports** committed to `analysis/` (one per cycle, tracked).

## Status ledger (living — updated lockstep as cycles land; git log is authoritative)

**Current position:** Cycles 1–9.3 committed; **Cycle 10 (Phase H, reframed as the clean-emit canonicalizer): engine ✅ + `.project-migrate` canonicalized ✅; active-substrate wiring is the sole remaining step.** `.project-migrate` is now a frozen, structurally-canonical content-addressed archive of `.project`'s intent (588 items, 55 promoted entities + 55 membership edges, conventions registered; 0 nested-id / 0 dangling / 0 unregistered-relation_type; the 86 remaining validateContext errors are legacy content-semantic, faithfully preserved + out of the structural canonicalizer's scope; 1 `substrate_id_unregistered` clears when the active-wiring registers it). `.project` is pristine/untouched. The active substrate `.context-jit-spec-v2` golden is still **58 / 53 / 5**: the **30 `edge_endpoint_unregistered`** (cross-substrate `project:` edges, founding FGAP-185 target) + the **2 `nested_id_bearing_array`** warnings (active `layer-plans` schema) both clear in the **active-substrate wiring** pass (register `project`→`.project-migrate`, backfill the active substrate, convert its 30 edges into the registered archive, de-nest the active layer-plans schema).

| Cycle | Phase | Status | Commit | Audit report (`analysis/`) |
|---|---|---|---|---|
| 1 | 0 — `*ForDir` primitives | ✅ done | `e84b326` | — (verified inline) |
| 2 | A+B — content-hash + object-store | ✅ done | `62b8375` | `…cycle2-content-addressing-…` |
| 3 | C — OID mint + identity stamping + floor + informed-confirm | ✅ done | `5d57465` | `…cycle3-phase-c-…` |
| 4 | D — substrate registry + aliases + drift invariant | ✅ done | `633d154` | `…cycle4-registry-…` |
| 5 | E (E1+E2) — structured EdgeEndpoint + dual-form consumers/validators | ✅ done | `fa91fda` | `…cycle5-structured-endpoints-…` |
| 6 | E2 | ⤵ absorbed into Cycle 5 (E1+E2 merged) | `(fa91fda)` | `(cycle5)` |
| 7 | F1 — `SubstrateIndex` (behavior-preserving split) | ✅ done | `6fd4813` | `…cycle7-substrate-index-…` |
| 8 | F2 — `resolveRef` + validator severity split | ✅ done | `06331df` | `…cycle8-resolver-…` |
| 9 | G — `promoteItem` + lineage + block-append id-uniqueness guard | ✅ done | `7cb1644` | `…cycle9-promote-guard-…` |
| 9.1 | remediation (Cycle-9 audit P4+P6) — nested-array id-guard + object-write-ordering | ✅ done | `cabb8c3` | `…cycle9.1-guard-ordering-…` |
| 9.2 | remediation — freeze guard: reject NEW nested id-bearing arrays; report `layer-plans` | ✅ done | `72a5596` (+`172f0c6`) | `…cycle9.2-nested-id-guard-…` |
| 9.3 | remediation — harden the freeze predicate (required/composition/tuple/$ref-cycle) + guarantee termination | ✅ done | `8352d92` | `…cycle9.3-predicate-harden-…` |
| 10 · H1-engine | migrateToContentAddressed + dir-targeted migration-decl/relations primitives (scratch-proven; subsumed by the canonicalizer) | ✅ done | `dca378d` | (audited at apply) |
| 10 · canonicalizer engine | clean-emit canonicalizer (infer schemas from DATA; no source-shape preservation) + `amendConfigEntryForDir`/`registerBlocks`; triple-buffer CLI | ✅ done | `c17d2b6`/`a1ca610` | `…cycle10-…-adversarial-audit` |
| 10 · `.project-migrate` apply | dupe-verify-swap canonicalization: 4 promotions (feature-story/9, story-task/34, plan-layer/5, plan-phase/7 = 55 entities + 55 membership edges), conventions registered (16 rules), **588 items content-addressed**, structurally canonical (0 nested-id, 0 dangling, 0 unregistered relation_types) | ✅ done | `0edfcf4` (+`d4991e1` orphan-drop, `d50186d` rel-type) | audit CLEAN |
| (generic bootstrap tool) | generic "migrate any legacy substrate" version rendered FROM the canonicalizer | ⏳ operator-deferred (not now) | — | — |
| 10 · active-substrate wiring | register `project`→`.project-migrate` + backfill `.context-jit-spec-v2` + convert its 30 `project:` edges → `edge_endpoint_unregistered` 0; de-nest the active `layer-plans` schema → clear the 2 active warnings | ⏳ NEXT | — | — |

**Inserted remediation cycles (9.1/9.2/9.3):** each arose from an audit or orchestrator-verification finding and ran the full per-cycle loop + gates. 9.1 closed the Cycle-9 audit's two findings (nested-array id-guard completeness + the orphan-object-on-validation-failure write ordering). 9.2 added the freeze guard so no NEW nested id-bearing array can be authored/installed, reporting the one live carrier (`layer-plans`) as a non-fatal warning pending promotion. 9.3 hardened the freeze predicate to zero known bypass (required-only / `anyOf`/`oneOf`/`allOf` / tuple `items` / `$ref` through any of these, incl. `$ref`-cycle termination). Rationale: freeze the class **before** migrating it (Cycle 10), so the migration hits a fixed target.

**Cycle 10 scope expanded** beyond the original Phase-H table row: in addition to register-`project`-alias → rewrite the 30 edges → backfill oid/hash/objects → `appendMigrationDeclForDir`, Cycle 10 now also **promotes the nested id-bearing arrays** to top-level entities joined by membership edges — clearing the 2 `nested_id_bearing_array` warnings. Decision recorded (freeze-before-migrate, promote-in-pass, not deferred): the embedded nested id-bearing form is a relationship-as-embedding between un-addressable sub-entities — the same form the arc eliminates at the top level — so the inter-context guarantee is only total once these are promoted.

## Phase-H migration sandbox + git-versioning discipline (BINDING — operator-directed 2026-06-01)

**`.project` is PRISTINE.** The real 637-item working substrate is NOT touched anywhere in this arc. All `.project`-side migration work — identity-field landing, oid/content_hash/object backfill, and nested→entity promotion — targets **`.project-migrate`**, a verbatim `cp -r .project .project-migrate` copy (baseline commit `bdc9161`). The `project` alias the 30 cross-substrate edges resolve through is registered to `.project-migrate`'s minted substrate_id, so the active substrate's converted edges point into the migrated copy; `.project` stays out of the registry and unmodified. (The active substrate `.context-jit-spec-v2` and `.context` are still migrated in place — they are the arc's own substrates, not the protected one.)

**Vigilant git versioning of `.project-migrate` (every touch = its own commit):**
- `git status` BEFORE a mutation (confirm the intended clean starting point) and AFTER (inspect exactly what changed — no stray files, no scope creep).
- ONE logical change per commit (e.g. "land identity on block X", "backfill block Y", "promote features.stories → top-level"), so the sandbox's history is a fine-grained, individually-`git revert`-able ledger.
- `.project-migrate` is git-tracked; its commit history IS the migration's audit trail + the revert net (in addition to per-step idempotency + dry-run).

**Discovery that forced the H1/H2 re-plan (the features nested tree):** the H1-precursor's "inline the `.project` `features` `$ref`" step hit the 9.2 freeze guard — inlining surfaces `features.stories`, `features.stories.tasks`, `features.findings`: `.project/features` is a deeply **nested id-bearing entity tree** (feature → stories → tasks, plus findings), not a flat block. So `features` (like `layer-plans`) is an **H2 promotion target**, not a precursor identity-field-landing case.

## Phase H reframed — one-time legacy-substrate canonicalizer (operator-directed 2026-06-01)

Phase H is reframed from a minimal "clear the 30 edges" migration into a **one-time canonicalizer that brings this project's accumulated ad-hoc context into the full new-framework shape**, applied to `.project-migrate`. After canonicalization `.project-migrate` is a **frozen historic snapshot** of the past context; forward project work lives in `.context` + `.context-jit-spec-v2`.

- **Scope NOW = one target: `.project-migrate`.** Build the canonicalizer concretely (may use direct knowledge of `.project-migrate`'s actual schemas/data). The coupled founding goal stays in scope: register `.project-migrate` as the `project` alias + convert the active substrate's 30 edges to resolve into it (`edge_endpoint_unregistered` → 0).
- **Generic version = LATER, rendered FROM this script** (operator-deferred; not built now). No other-consumer constraint. **Design seam (honor now):** factor the load-bearing parts — recursive nested-promotion, identity backfill — behind clean boundaries so the generic "bootstrap any legacy substrate" tool is an *extraction*, not a rewrite. Build no generality machinery now; just don't wall it off.
- **NO name synthesis — now OR in the generalized tool (operator-directed 2026-06-01).** Promotion targets — the top-level block_kind `canonical_id`/`prefix`/`id.pattern` and the membership `relation_type` for each nested array — are an EXPLICIT operator-provided mapping, never algorithmically derived/singularized/truncated. The dry-run's auto-synthesized names (`layer-plans-migration_phas`, `plan_contains_migration_pha`) were truncated/verbose and revealed the synthesizer as a bug surface AND as generality machinery that isn't wanted. The canonicalizer takes a `promotionTargets` mapping as input; the derivation code is removed. The future generic tool ALSO takes an explicit mapping (per-substrate config), never synthesizes — naming is always a deliberate human input, not a heuristic. The `.project-migrate` mapping (current): `features.stories`→synth `feature-story` (`^FSTORY-\d{3}$`); `feature-story.tasks`→`story-task` (`^STORY-TASK-\d{4}$`); `layer-plans.layers`→`plan-layer` (`^PLAN-LAYER-\d{3}$`); `layer-plans.migration_phases`→`plan-phase` (`^PLAN-PHASE-\d{3}$`); membership types `feature_contains_story`+`story_contains_task` (exist) + new `plan_contains_layer`+`plan_contains_phase`; `features.findings`/`reviews.findings` (0 data)→schema de-nest only, no block. (Earlier reuse-of-the-`story`-block for `features.stories` was rejected: the top-level `story` schema is a narrower divergent shape (`additionalProperties:false`, no `depends_on`/`gates`/`tasks`), so the richer nested story can't validate against it — synthesize a clean block matching the actual data instead; the vestigial empty `story` block is left as-is.)
- **Canonical target shape for `.project-migrate`:** every item content-addressed (oid/content_hash/object); every nested id-bearing array at any depth promoted **recursively** to a top-level entity block + `parent contains child` membership edges (ordinal-preserving) — features→stories→tasks→findings + layer-plans→layers/phases all collapse into the entity+edge graph; block_kinds + relation_types registered; edges structured; substrate_id minted + registered. Structural canonicalization only — legacy content-semantic errors (e.g. a decision citing a missing artifact) are NOT in the canonicalizer's job.

**Triple-buffer execution model (BINDING de-risker — operator-directed):** the canonicalizer must NEVER mutate `.project-migrate` in place.
1. **Dry-run** — every invocation supports a dry-run that previews the full canonicalization (counts + the promotion/edge/registration plan) and writes nothing.
2. **Work on a DUPE** — a real run dupes `.project-migrate` to a working copy and performs all canonicalization on the dupe.
3. **Verify the dupe** — run the test/verification gate against the dupe (validateContext, item-count conservation, every nested-id warning gone, edges resolve, idempotency).
4. **Atomic replace only on verified success** — `.project-migrate` is replaced by the verified dupe ONLY after the gate passes; on any failure the dupe is discarded and `.project-migrate` is untouched. `.project-migrate` therefore always holds the last-known-good; promotion-to-canonical is gated on proof.

So the buffers are: `.project` (pristine, forever) → `.project-migrate` (last-known-good target, git-versioned per touch) → ephemeral work-dupe (where the run happens, verified, then swapped in). dry-run + the work-dupe + per-touch git history are three independent safety layers on top of `.project` being untouched.

The precursor engine + H1/H2 sequencing collapse into this single canonicalizer (the precursor's reusable `writeSchemaCheckedForDir`/`readSchemaForDir` ForDir primitives survive; its bespoke inline-features logic is dropped for generic recursive promotion). Designed next plan-mode cycle against `.project-migrate`.

## What `.project-migrate` IS, and the framework boundary (BINDING — operator-directed 2026-06-01)

- **`.project-migrate` = a frozen, canonically-structured, content-addressed ARCHIVE of `.project`'s INTENT — not a faithful reproduction of its shape.** `.project` grew ad-hoc/unplanned, later shapes layered over earlier ones, so it is internally inconsistent/mangled. The canonicalizer captures the **meaning** (entities, their content, their relationships) and re-expresses it cleanly. **Lossy on the broken *shape* is acceptable; lossy on *intent* is not.** The payoff (the big goal): new, canonically-structured context substrates can **reference `.project-migrate`'s entities by stable `oid`** from canonical edges — `.project-migrate` is a reference archive, frozen; forward work lives in `.context` + `.context-jit-spec-v2`.

- **`.project` is NOT the framework. pi-context's canonical rules are FIXED.** pi-context — its schemas, validators, block-api, the 9.2 nested-id guard, closure-table edges, identity model — is the fixed canonical target. We do **NOT** bend the framework to admit `.project`'s idiosyncrasies. `.project` is not pi-context.

- **Canonicalizer = data-driven CLEAN-EMIT, not source-shape preservation (the structural fix that ends the whack-a-mole).** The three real-run failures (dangling `$ref:#/definitions/task` in a synthesized standalone schema; reuse of a divergent `additionalProperties:false` block; a fileless reuse block) were ALL from trying to PRESERVE/TRANSFORM `.project`'s mangled source schemas. The correct direction: read `.project`'s DATA (values/intent) and EMIT clean canonical schemas + blocks + membership edges **by construction** — schemas inferred from the actual data fields + identity, simple/inline, never inheriting source `$ref` trees or narrow constraints. Source schemas are read-only hints (locate nested arrays / id-bearing-ness); the output inherits nothing from them. Clean-by-construction output ⇒ the whole class of source-schema-quirk failures disappears.

- **The `.project`-specific canonicalization tool is TOOLING, removed from the published package later.** It only *uses* pi-context's clean general primitives to write canonical output; it never encodes `.project` quirks into the framework or loosens a framework rule. The genuinely-general dir-targeted primitives (`writeSchemaCheckedForDir`, `readSchemaForDir`, `amendConfigEntryForDir`/`writeConfigForDir`/`loadConfigForDir`, the `*ForDir` family) ARE legitimate framework capabilities and STAY. The `.project`-specific canonicalizer (`canonicalize-substrate.ts` + its CLI/Pi-tool/mapping) is a one-time migration artifact and is **excised from the published `@davidorex/pi-context` package before/at the next publish** — it is not shipped surface. (Persist this so the pre-publish step removes it.)

- **Verification against the real shapes, up front (anti-whack-a-mole).** Validate the canonicalizer against a faithful copy of the REAL `.project-migrate` (its actual `$ref`-bearing definitions, fileless blocks, divergent schemas) in a fast test — surfacing the whole mole-set at once — rather than discovering shapes one slow dupe-run at a time.

## REMAINING WORK — active-substrate wiring (session-surviving detail)

The ONLY remaining Cycle-10 step. Goal: clear the active substrate's golden — the **30 `edge_endpoint_unregistered`** (the cross-substrate `project:FGAP-*` edges, founding FGAP-185) + the **2 `nested_id_bearing_array`** warnings (active `layer-plans` schema) — by wiring the active substrate into the now-canonical `.project-migrate`. Plan-mode this pass before any code.

**Hard constraint (the dry-run blocker):** the committed `migrateToContentAddressed` does **repo-wide discovery** — it would discover all four dirs and **throw at step-0 on `.project`/`.context`** (their schemas declare no identity fields) and **overreach onto `.project` (PRISTINE — forbidden)** + `.project-migrate` (already canonical). So it **cannot** be run/dry-run repo-wide. The active-wiring MUST be **substrate-scoped** — add an `onlySubstrates?: string[]` (or `skip`) option to the engine (or a focused routine) so it processes ONLY the named substrate(s) and can NEVER touch `.project`/`.project-migrate`. Only after scoping is a dry-run safe + meaningful. (Dry-run is mandatory before the real apply, same discipline as the canonicalizer.)

**Step 1 — register `.project-migrate` in the project-root registry.** `registerSubstrate('.', <.project-migrate substrate_id = sub-0c813fd8…>, '.project-migrate', ['project'])` → maps the `project` alias to the canonicalized archive. (A registry write to `.pi-context-registry.json`; touches neither `.project` nor `.project-migrate` data.) This alone makes the 30 `project:FGAP-*` strings *resolvable* — the archive's framework-gaps kept their `FGAP-NNN` refnames + now carry oids, so the foreign index resolves them.

**Step 2 — active substrate `.context-jit-spec-v2`** (already has `substrate_id = sub-2668a102…` + 22/22 identity schemas; 70 unstamped items; 30 `project:` string edges; 1 empty `layer-plans` schema):
- **Backfill** its 70 items (read + `writeBlockForDir` → stamp oid/content_hash/objects).
- **Convert its 30 `project:FGAP-*` string edges** → structured foreign `{kind:"item", substrate_id:<.project-migrate>, oid:<that FGAP's oid in .project-migrate>, refname:"FGAP-NNN"}` (via the engine's endpoint conversion / `resolveRelationSelector`, which reads `.project-migrate`'s foreign index — requires Step 1 done). → the 30 `edge_endpoint_unregistered` clear.
- **De-nest its `layer-plans` schema** (data is EMPTY — schema-only: drop `plans.layers` + `plans.migration_phases` from the schema; no promotion, no data). → the 2 `nested_id_bearing_array` warnings clear.
- **Expected golden delta:** active `validateContext('.')` **58 / 53 / 5 → 26 / 23 / 3** (the 30 errors + 2 warnings clear; the other 23 errors + 3 warnings are pre-existing active-substrate content/lint, unchanged).

**Step 3 — `.context` (OPEN DECISION — fold-in vs defer).** `.context` = 8 `session-notes` items, NO `substrate_id`, 0/17 identity schemas, 1 EMPTY `layer-plans` schema. NOT needed for the 30 edges (those are in the active substrate). It is a *going-forward* substrate. **Fold-in** (recommended, small): mint `substrate_id` + register + land identity on its 17 schemas + backfill the 8 items + de-nest its empty `layer-plans` schema → `.context` becomes canonical so future work starts clean. **Defer**: it's near-empty + irrelevant to the founding objective; canonicalize later. No promotion either way (no nested-id *data*). Operator's scope call at plan time.

**`config.json` / `project.json` are metadata, NOT entity blocks** (block_kinds / relation_types / substrate_id; project facts). "Canonically structured" for them = schema-valid + registry-consistent + carrying the minted substrate_id — which the canonicalizer/wiring already produces. Content-addressing (per-item oid) does NOT apply (they're not arrays of entities). No separate step. (See `analysis/2026-06-01-pi-context-substrate-model-before-after.md`.)

**After this pass:** the arc's founding objective is met (FGAP-185 / the 30 edges resolved); the substrate model before→after is documented in `analysis/2026-06-01-pi-context-substrate-model-before-after.md` (feeds README + the pi-context skill); the pre-publish step excises the `.project`-specific canonicalizer tooling.

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

This table is the original design rationale (one row per planned cycle); **current per-cycle status is the Status ledger above** (incl. the inserted 9.1/9.2/9.3 remediation cycles and the Cycle-5/6 merge). Principle: one cycle per phase that mutates existing behavior or has high blast radius; batch only purely-additive isolated new modules; split the two highest-risk phases (E, F) so a behavior-preserving change is proven inert before new logic rides on it.

| # | v3 phase(s) | Delivers | Why its own cycle | Depends on | Audit + live-demo focus |
|---|---|---|---|---|---|
| 1 | **0** | `*ForDir` write/alloc primitives; existing fns become wrappers | Touches every core write primitive; prerequisite for migration + promotion | — | live: write a block into a NON-active substrate dir + read back; **active pointer never moves**; wrappers byte-identical |
| 2 | **A + B** | `content-hash.ts` (JCS, projection excluding `id`) + `object-store.ts` | Pure new leaf modules, zero existing-caller impact | — (B uses A) | live: hash stable across key reorder; `id`/author fields excluded; object round-trips by hash |
| 3 | **C** | OID mint + `oid`/`content_hash`/`content_parent` on 16 schemas + `prepareItemIdentityForWrite` in ALL birth/mutation primitives + schema bumps + migration decls + **harden `metadataFieldsForSchema` to the mandatory-floor union** + **operation-aware informed confirm in `authGateHandler` for `x-identity` schema writes** (both carried from Cycle 2 audit — see below) | First phase mutating existing write behavior across all primitives + all schemas | 0, A, B | live: append/upsert/update real items → all three fields stamped; rename ≠ hash change; oid immutable on update; legacy reads still validate; **an `x-identity` override omitting `id` still excludes the floor**; **a `write-schema` payload carrying an `x-identity` override produces a confirm message naming the changed exclusions + the retained floor** |

**Cycle 3 carried item (from Cycle 2 adversarial audit `analysis/2026-05-31-cycle2-content-addressing-adversarial-audit.md`, decided fix — NOT an open question):** Cycle 2 shipped `metadataFieldsForSchema = override ?? DEFAULT_METADATA_FIELDS` (an `x-identity.metadata_fields` override replaces the *whole* exclusion set). Dormant in Cycle 2 (no overrides, no live caller). Before Cycle 3 wires `contentProjection` into any write path OR authors any `x-identity` override, change it to `MANDATORY ∪ (override ?? DISCRETIONARY)` where MANDATORY = `{id, oid, content_hash, content_parent}` (non-overridable) and DISCRETIONARY = `{created_by, created_at, modified_by, modified_at, closed_by, closed_at}`. Rationale + the binding regression test are specified in v3 spec §A2. Without this, an override that omits `id` would let a refname rename silently move the content hash — a violation of the rename-stability invariant the whole identity model rests on.

**Second Cycle-3 carried item — informed authorization (decided, required, NOT a future enhancement):** the `write-schema`/`write-schema-migration` action is already user-gated (in `AUTH_REQUIRED_TOOLS`), but the gate is tool-name-level and shows only a truncated arg summary — a human can authorize an `x-identity` override without understanding it changes content-hash exclusions. Cycle 3 makes `authGateHandler` operation-aware: a pure `describeIdentityOverride(schema): string | null` helper in pi-context (single source of the `x-identity` semantics) computes the human-readable delta vs the default; `authGateHandler` enriches the confirm message with it when a gated schema-write payload carries an `x-identity.metadata_fields` annotation (and affirms the mandatory floor stays excluded), leaving the confirm byte-identical when none is present. Full spec + binding test in v3 spec §A2 layer (3). This is defense-in-depth layer 3 (structural floor + action gate + informed authorization); all three are required and none substitutes for another.
| 4 | **D** | `config.substrate_id` SoT + registry/aliases + drift invariant + init wiring | Independent surface; can build parallel to C | — | live: register two substrates, rename one's dir in registry, resolve still works; drift detected; init registers |
| 5 | **E1** | `EdgeEndpoint` type + `relations.schema.json` oneOf+bump + raw writers (plumbing) + `appendRelationByRef` (porcelain) | Highest-blast-radius phase — isolate data-model + write path | — | live: write structured item edge + lens-bin edge; porcelain resolves a friendly selector; raw writer signatures intact |
| 6 | **E2** _(absorbed into Cycle 5 — E1+E2 merged at `fa91fda`)_ | Update 6 consumers + BOTH validators to structured + dual-form (legacy string AND structured, since data isn't migrated until H) | The corruption-risk surface (lens-bin parents must not be treated as items) | E1 | live: validate a substrate holding both old string edges and new structured edges; lens-bin validated against bins; no double-report |
| 7 | **F1** | `SubstrateIndex { byRefname, byOid, items }` — split lookup maps from iteration surface; update 8 iteration + 10 lookup sites | Behavior-preserving refactor — prove it changes NOTHING before F2 | — | live: `validateContext` output IDENTICAL to pre-refactor on the real active substrate; no item double-counted |
| 8 | **F2** | `resolveRef` + `buildIdIndexForDir` + validator severity split (active/foreign/lens_bin → CLEAN; unregistered/dangling → ERROR) | New cross-substrate logic; load-bearing; MUST precede migration | D, E2, F1 | live: synthetic foreign-edge fixture resolves `foreign`; unregistered → ERROR; dangling → ERROR |
| 9 | **G** | `promoteItem` + `item_derived_from_item` lineage (new OID via `nextIdForDir` + `mintOid(destId)`) | Self-contained feature on foundations | 0, B, D, E1 | live: promote a real item between two scratch substrates; new oid dir-targeted; lineage edge filed; source superseded; inbound edges still resolve |
| 10 | **H** | Cross-project migration: discover → substrate_id+register → OID/hash/object backfill → endpoint conversion → drift check → live-schema edits+decls (via the `appendMigrationDeclForDir` primitive below) → verification gate. **Scope expanded (see ledger): also promote the `layer-plans` nested id-bearing arrays → top-level entities + membership edges, clearing the 2 `nested_id_bearing_array` warnings.** | Capstone integration; clears the 30 errors + the 2 warnings | all prior (incl. 9.2 freeze) | live: run migration on the real repo; `validateContext('.')` `edge_endpoint_unregistered` count → **0** AND `nested_id_bearing_array` → **0**; zero item loss; lens-bin edges preserved; idempotent re-run = 0 new |

**Cycle-10 carried item — `appendMigrationDeclForDir` (from Cycle 3 audit, INFO):** the migration-decl writer `appendMigrationDecl(cwd, decl)` (migrations-store.ts) is cwd-bound to the ACTIVE substrate. Phase H writes identity-migration decls into EVERY substrate it migrates — all non-active — so it cannot use the cwd form. Cycle 3 hand-wrote the two static `migrations.json` files (samples + active) directly (audit-validated against migrations.schema.json), which is acceptable for one-time static seeding but NOT for Phase H's programmatic per-substrate writes. Phase H MUST add `appendMigrationDeclForDir(substrateDir, decl)` (the dir-targeted variant, mirroring Cycle 1's `*ForDir` write primitives; cwd form becomes a thin wrapper) and route all per-substrate decl writes through it — through the canonical validated surface, not hand-written JSON.

## Deliberate splits

- **E → E1/E2** isolates lens-bin validator correctness — the one place the migration could silently corrupt relations — into its own audit.
- **F → F1/F2** makes the riskiest change "prove the refactor is inert" (F1: identical validation output) then "add cross-substrate resolution" (F2). Never debug a new-logic bug and a refactor regression at once.

## Fixed ordering (hazard-forced)

- Cycle 1 (Phase 0) before Cycle 10 (migration).
- Cycle 2 before Cycle 3. Cycle 3 needs 1+2.
- **Cycle 8 (F2) MUST precede Cycle 10** — else every rewritten edge becomes a fresh dangling error, strictly worse than today.
- **Cycle 9.2 (nested-id freeze guard) MUST precede Cycle 10** — freeze the class before migrating it, so Phase H's `layer-plans` promotion hits a fixed, fully-enumerated target. 9.1/9.3 are remediation cycles gating on their predecessors (9.1 on 9; 9.3 on 9.2).
- Live-schema edits (in Cycle 3) before any item write.
- Cycles 2/3 and 4 (D) are mutually independent; D can slot anywhere before F2. The rest are linear.

## Out of pi-context release flow

No `npm run release:*`, no npm publish in this arc. Build/check/test/live-demo/regression-check/adversarial-audit + git commit per cycle. The v3 spec governs each phase's exact files, signatures, tests, demos, and probes.
