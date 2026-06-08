---

## The Framework's Organizing Principles

The pi-context substrate is a **declarative project operating system** layered on typed JSON blocks. The framework provides fixed scaffolding; the vocabulary is config-declared. What follows are the organizing principles the system allows for, both as currently exercised in `.context` and as generatively available to any custom substrate.

---

### 1. Block Kinds — the atomic unit of state

A substrate declares **block kinds** in `config.block_kinds[]`. Each is a typed, schema-validated JSON file with a stable id-pattern prefix. The framework gives you:

- **Schema validation** on every write (AJV draft-07). A block's fields, types, required set, and enum constraints are declared in its JSON Schema and enforced atomically.
- **Stable identity** via content-addressed oids + content hashes. An item's identity is its content, not its position in an array. This is what makes 3-way merge (FGAP-046, FEAT-006) and structure-aware git merge (FGAP-004) possible — items are matched by id, never array index.
- **Versioned migration.** A block file carries `schema_version`; the migration registry (`migrations.json`) walks items forward across schema changes. You can evolve a schema without losing data.

**Current state:** 17 block kinds (decisions, framework-gaps, tasks, verification, features, research, conventions, etc.) — a full software-project operating model. But these are just *this* substrate's vocabulary. A custom substrate declares whatever kinds it needs. The `.context-jit-spec-v2` substrate has `axioms`, `concepts`, `dispatch-modes` — a completely different ontology over the same scaffolding.

**Generative capability:** Declare a block kind with a schema. The framework validates it, versions it, migrates it, and surfaces it through the same read/write/relation ops. You're not limited to the stock PM vocabulary. A legal-contract substrate, a game-design substrate, a scientific-experiment substrate — each declares its own kinds, and the framework treats them identically.

---

### 2. Relations — the closure-table graph

Relations are **edges** in `relations.json`, not foreign-key fields. Every edge is a `{parent, child, relation_type, ordinal?}` triple. This is the framework's most powerful organizing principle:

- **Edges are multi-kind.** A relation_type declares `source_kinds` and `target_kinds` — `task_addresses_gap` connects tasks→framework-gaps; `item_derived_from_item` connects anything→anything (`*`).
- **Edges are the only linkage.** There are no FK-as-field embeddings. This means an item's relationships can be added, removed, or redirected without rewriting the item. It also means the graph is queryable independent of any one block's schema.
- **Edges carry semantics.** The relation_type registry has 33 entries: ordering (`task_depends_on_task`), data-flow (`decision_addresses_gap`), membership (`task_positioned_in_phase`), governance (`item_governed_by_convention`). Each names a directional relationship with typed endpoints.
- **Edges are validated.** Invariants (`config.invariants[]`) declare cross-block constraints: "a completed task must have a verification edge," "a decision must cite a forcing artifact," "a task must articulate a convention." `context-validate` enforces them.

**Current state:** hundreds of edges across the 33 relation types. The graph encodes the entire project's decision→gap→task→verification→feature→convention structure. You can walk from a gap to its decision, its task, its feature, its governing convention — all through edges, never by guessing field names.

**Generative capability:** Declare your own relation_types and invariants. A substrate that models "restaurant supply chain" declares `ingredient_sourced_from_supplier`, `dish_contains_ingredient`, `menu_features_dish` — and invariants like "a dish on the menu must have all ingredients sourced." The closure-table model is fully generic; the current 33 types are just `.context`'s choices.

---

### 3. Status Lifecycle — config-declared buckets

Items carry a `status` field, but what "done" means is **config-declared**, not hardcoded. The status_buckets registry maps status values to lifecycle buckets:

```
"identified"  → todo
"accepted"    → in_progress
"in-progress" → in_progress
"closed"      → complete
```
(bucket vocabulary: complete / in_progress / blocked / todo / unknown — there is no `open` bucket)

This is how `context-status` aggregates counts by bucket and how invariants check status consistency (rule: "a completed task addressing a non-closed gap is a warning"). The meaning of "done" is substrate-specific.

**Current state:** The status_buckets registry is currently **empty** — the stock resolution merges config over `STATUS_VOCABULARY_DEFAULTS` (`status-vocab.ts`), a hardcoded map covering the status enums of all 17 stock kinds. The status→bucket override surface already exists: declaring `config.status_buckets` overrides the defaults. (FGAP-017/FGAP-018 are NOT about status buckets — they config-drive `context-current-state` / `context-status` kind/field/ranking couplings; that is FEAT-004.)

**Generative capability:** A custom substrate declares its own status vocabulary. An experiment substrate might have `hypothesized → testing → confirmed → falsified`. The framework aggregates by bucket, enforces consistency invariants, and derives lifecycle — once FEAT-004 lands, the kind/field/ranking derivation is entirely config-driven with no hardcoded kind names.

---

### 4. Conventions — checked governance rules

Conventions are a **block kind** (`conventions.json`) whose items are prose rules with `enforcement` and `severity`. They're not just documentation — they're composed into agent context and checked by invariants:

- `feature-decomposition` governs how features decompose into tasks
- `rhetorical-register` governs how block items are authored
- `docs-surface-sync` governs documentation updates
- `gap-arc-coherence` governs gap-to-arc binding
- `feature-branch-workflow` governs branching discipline

The **convention-articulation invariant** (FEAT-007, `in-progress`) requires every decision, feature, and task to cite a governing convention or acknowledge a missing one. This means governance is a **checked precondition** of the substrate, not an aspiration.

**Generative capability:** A substrate declares its own conventions. A compliance-audit substrate declares "regulation-X-cited," "risk-assessed," "reviewed-by-counsel." The same invariant machinery enforces them. Conventions are just block items with edges — the framework doesn't know what they say, only that they're cited.

---

### 5. Features as Arc Containers

A feature (`features.json`) is a **container for an arc of work.** It binds a set of gaps under one invariant, decomposed into tasks. The `feature-decomposition` convention makes this structural:

```
FEAT-008 (CLI best-of-breed surface)
  ├── governed by: feature-decomposition, gap-arc-coherence
  ├── TASK-015 (flag infrastructure) → FGAP-019, FGAP-025, FGAP-064, FGAP-032
  ├── TASK-016 (output + error) → FGAP-020, FGAP-021, FGAP-023
  ├── TASK-017 (write safety) → FGAP-022, FGAP-024, FGAP-026
  ├── TASK-018 (in-pi read-schema) → FGAP-027
  ├── TASK-019 (parity gate) — durability, closes no gap
  └── TASK-040 (help + version) → FGAP-062, FGAP-063
```

A feature is **derivable**: "where are we on the CLI arc?" is a substrate query — walk `feature → task_addresses_feature → tasks → task_addresses_gap → gaps`. The `gap-arc-coherence` convention formalizes this: every gap is bound to a feature or explicitly standalone; a cluster of gaps on the same surface must be under one feature.

**Generative capability:** Any substrate with a "project" or "goal" concept can model arcs this way. The feature block kind is just a schema — replace it with `epics`, `initiatives`, `experiments`, `publications`. The decomposition rules (code-location clustering, dependency ordering, four edge types) are conventions, not code. A different project applies different conventions.

---

### 6. Lenses — derived views over the graph

Lenses (`config.lenses[]`) project the substrate into **queryable views.** Currently two exist:

- `tasks-by-status` — projects `tasks` items into bins by `status` field (derived_from_field)
- `gaps-by-status` — same for `framework-gaps`

A lens can be `derived_from_field` (auto-partition) or `hand-curated` (authored edges). The roadmap mechanism, when a substrate authors a `roadmap` block, projects phase/milestone views through lenses (`.context` does not currently exercise it — no `roadmap.json`, no `roadmap` block kind).

**Generative capability:** Declare lenses over any block kind. An "overdue items" lens. A "blocked-by cycle" lens. A "governance gap" lens (items without convention edges). The lens infrastructure is generic — the current two lenses are `.context`'s choices.

---

### 7. What's Still Hardcoded (and what that means for generativity)

The framework currently has two hardcoded coupling points (FGAP-017, FGAP-018):

- **`context-current-state`** derives focus/in-flight/blocked/next from hardcoded `tasks` + `framework-gaps` + `task_depends_on_task`. On a custom-vocabulary substrate it returns empty.
- **`context-status`** lifecycle metrics special-case `phase`/`requirements`/`tasks`/`verification` with hardcoded fields.

These are the **only** places the framework isn't fully config-driven. Everything else — block kinds, schemas, relations, invariants, status buckets, lenses, conventions — is config-declared. FEAT-004 (proposed) addresses this: a state-derivation registry in config so any substrate declares "these are my focus-bearing kinds, this is my blocked-by relation, this is my ranking field."

Until FEAT-004 lands, a custom substrate can still **store** any shape of project state — it just can't derive "what's next" from it through the built-in ops. It can write its own derivation, query the graph through the relation walkers (`walk-ancestors`, `context-walk-descendants`, `find-references`), and compose its own views through lenses.

---

### 8. The Generative Model — what any substrate gets for free

Declare a vocabulary in config and the framework gives you, without writing code:

| Capability | Mechanism |
|------------|-----------|
| Typed, validated state | JSON Schema per block kind, AJV-validated on every write |
| Stable identity | Content-addressed oids + content hashes |
| Cross-item relationships | Closure-table edges with typed relation_types |
| Lifecycle aggregation | Status buckets → counts by open/in-progress/complete |
| Integrity validation | Invariants checked by `context-validate` |
| Governance enforcement | Convention-articulation invariants |
| Versioned evolution | Schema migration registry (identity + declarative transforms) |
| Catalog distribution | `pi-context update` merges catalog vocabulary into an existing substrate |
| Dry-run preview | Most write ops support `--dry-run` (relations, update-block-item, move, amend-config, write-schema, update); `append-block-item` does not yet (FGAP-024, open) |
| CLI shell surface | `pi-context <op>` reflects every registered op |
| Content-addressed lineage | `content_parent` tracks item evolution; `item_derived_from_item` tracks cross-substrate derivation |

A custom substrate declares its own `block_kinds`, `relation_types`, `status_buckets`, `invariants`, `lenses`, and `conventions` — and the framework validates, migrates, relates, aggregates, and surfaces all of it through the same ops and CLI. The current `.context` vocabulary is one instantiation of a general model. The framework is the scaffolding; the vocabulary is the choice.

---

## Audit — claims verified against code + substrate (2026-06-08)

Auditor: fresh-context agent driving the live `pi-context` CLI (active substrate `.context`, per `.pi-context.json`) + reading `packages/pi-context/src`. Verdicts: Verified / Stale / Incorrect / Unverifiable, each with evidence.

### Summary
The draft is highly accurate on structure (block kinds, relation graph, conventions, the FEAT-008 arc box, lenses, hardcoded-coupling map, op names). Tally: **22 Verified, 3 Incorrect, 2 Stale, 1 Unverifiable.** The three **Incorrect** claims are all in §3 and §8: (a) §8 "Every write op has `--dry-run`" — `append-block-item`, the highest-traffic write op, has NO dryRun (FGAP-024, open, is exactly this); (b) §3's status-bucket example (`"accepted" → open`) names buckets that don't exist and maps `accepted` wrong (code: `accepted → in_progress`); (c) §3 attributes FGAP-017/018 to status-bucket derivation — they are about kind/field/ranking/relation coupling, and FGAP-017 explicitly states status→bucket is ALREADY config-driven. **Stale:** §3's "falls through to hardcoded defaults for tasks/framework-gaps" (defaults cover all 17 kinds, not just those two); §6's "roadmap system (`roadmap.json`)" (no roadmap.json and no `roadmap` block kind exist in `.context`).

### Per-claim findings

- **§1 17 block kinds — Verified.** `read-config --registry block_kinds` → `total:17`: decisions, framework-gaps, tasks, verification, issues, features, research, rationale, spec-reviews, layer-plans, requirements, conventions, context-contracts, phase, story, work-orders, session-notes. (Draft's parenthetical list is illustrative and correct.)
- **§1 AJV draft-07 validation on write — Verified.** `schema-validator.ts:5-14` (`import _Ajv from "ajv"`, `new Ajv(...)`, `addFormats`); `ops-registry.ts:1189,1198` meta-validate draft-07.
- **§1 content-addressed oids + content hashes as identity — Verified.** `block-api.ts:23` imports `computeContentHash`/`sha256Hex`; identity fields `oid`/`content_hash`/`content_parent` (`block-api.ts:93-94,329`).
- **§1 `schema_version` + `migrations.json` forward-migration — Verified.** `block-api.ts:787-789,1763-1766` route through `validateBlockWithMigrationForDir` when the envelope carries `schema_version`; `migrations.json` is the substrate-managed registry (`context-dir.ts:410`).
- **§1 "structure-aware git merge (FGAP-004)" — Verified (id is correct).** FGAP-004 IS the git-merge-driver gap (title: "pi-context has no structure-aware git merge driver"), status `accepted`; its feature is FEAT-002 (`proposed`) and decision DEC-0004 (`enacted`). The draft's separate "3-way merge (FGAP-046, FEAT-006)" is the *update* 3-way merge (a different capability) and is also correct: FGAP-046 `closed`, FEAT-006 `complete`.
- **§1 generative example (`.context-jit-spec-v2` has axioms/concepts/dispatch-modes) — Verified.** `axioms.json`, `concepts.json`, `dispatch-modes.json` exist in `.context-jit-spec-v2/`.
- **§2 closure-table `{parent,child,relation_type,ordinal}` in relations.json — Verified.** Edges authored as triples; `find-references` returns `{parent,child,relation_type}` records.
- **§2 relation_types carry source_kinds/target_kinds — Verified.** Every one of the 33 entries declares both (e.g. `task_addresses_gap` source `["tasks"]` target `["framework-gaps"]`; `item_derived_from_item` source `["*"]` target `["*"]`).
- **§2 "33 entries" — Verified.** `read-config --registry relation_types` → `total:33`.
- **§2 "279+ edges" — Unverifiable (under the no-pipe discipline).** No pi-context op returns a total edge count, and the evidence discipline forbids piping relations.json through `wc`. Not refuted; just not cheaply ground-able through a single op. Recommend rephrasing to a derivable statement or removing the number.
- **§2 no FK-as-field — Verified.** All linkage is in `relations.json`; item schemas carry no FK fields (consistent with CLAUDE.md "FK-as-field on item schemas is forbidden" and the closure-table model).
- **§2 invariants enforce cross-block constraints via context-validate — Verified.** `read-config --registry invariants` → 9 invariants incl. `completed-task-has-verification`, `decision-cites-forcing-artifact`, status-consistency rules.
- **§3 status_buckets registry currently empty — Verified.** `read-config --registry status_buckets` → `{}`.
- **§3 status-bucket example block (`"identified"→open`, `"accepted"→open`, `"in-progress"→in-progress`, `"closed"→complete`) — Incorrect.** The bucket vocabulary is `complete / in_progress / blocked / todo / unknown` (`status-vocab.ts:55-105`). There is no `open` bucket. Code maps: `identified → todo`, `accepted → in_progress` (NOT open), `in-progress → in_progress`, `closed → complete`.
- **§3 "falls through to hardcoded defaults for tasks/framework-gaps" — Stale/too-narrow.** `resolveStatusVocabulary` (`status-vocab.ts:113-116`) merges config over `STATUS_VOCABULARY_DEFAULTS`, whose hardcoded map covers the status enums of ALL stock kinds (decisions/features/story/research/requirements/verification/…), not just tasks/framework-gaps. With config empty, every kind's status→bucket comes from those defaults.
- **§3 FGAP-017/FGAP-018 are about config-driving the status-bucket derivation — Incorrect.** Both are `identified`. FGAP-017 is `context-current-state` hardcoding KIND/field/ranking/relation couplings (tasks/framework-gaps/phase, `task_depends_on_task`, P0-P3 rank) and explicitly says "status->bucket IS already config-driven." FGAP-018 is `context-status` lifecycle metrics special-casing phase/requirements/tasks/verification fields. Neither is about status_buckets.
- **§4 conventions is a block kind with enforcement+severity — Verified.** block_kinds includes `conventions` (array_key `rules`); items carry `enforcement` + `severity` (`read-block --block conventions`).
- **§4 the five named conventions exist — Verified.** `feature-decomposition`, `rhetorical-register`, `docs-surface-sync`, `gap-arc-coherence`, `feature-branch-workflow` all present (plus `cli-command-form`, `correctness-over-cost`).
- **§4 FEAT-007 in-progress + convention-articulation invariant (item_governed_by_convention / item_acknowledges_missing_convention) — Verified.** FEAT-007 status `in-progress`; both relation_types registered; three `requires-edge` invariants (`decision-`/`feature-`/`task-articulates-convention`) enforce them.
- **§5 FEAT-008 arc box — Verified in full.** FEAT-008 exists (status `proposed`); governed by `feature-decomposition` + `gap-arc-coherence`. Task→gap edges (`task_addresses_gap`) match exactly: TASK-015→{019,025,064,032}; TASK-016→{020,021,023}; TASK-017→{022,024,026}; TASK-018→{027}; TASK-019→none (depends/feature/convention only); TASK-040→{062,063}. All six tasks carry `task_addresses_feature → FEAT-008`.
- **§6 exactly two lenses, both derived_from_field — Verified.** `read-config --registry lenses` → `tasks-by-status` (target tasks, derived_from_field status) and `gaps-by-status` (target framework-gaps, derived_from_field status); `total:2`.
- **§6 "roadmap system (`roadmap.json`) uses lenses" — Stale/Unverifiable for the active substrate.** In CODE, a `RoadmapSpec` phase references a lens (`roadmap-plan.ts:153` `lens: string`; `roadmap_lens_missing` validation), so the roadmap MECHANISM uses lenses. BUT `.context` has NO `roadmap.json` file, and `roadmap` is not in the live block_kinds registry — the active substrate does not exercise it. The parenthetical implies a present `.context` artifact that does not exist.
- **§7 context-current-state + context-status hardcode tasks/framework-gaps/task_depends_on_task — Verified.** FGAP-017 cites `context-sdk.ts:709` (block !== tasks), `:762` (block !== framework-gaps), `:729` (`task_depends_on_task`); FGAP-018 cites `context-sdk.ts:577-654`.
- **§7 FGAP-017/FGAP-018 as the two coupling points — Verified.** Both `identified`, exactly these two ops.
- **§7 FEAT-004 (proposed) — Verified.** FEAT-004 status `proposed`, "config-driven context-current-state / context-status … state-derivation registry."
- **§7 op names `walk-ancestors` + `context-walk-descendants` — Verified (exact).** `ops-registry.ts:1728` (`walk-ancestors`), `:1712` (`context-walk-descendants`).
- **§8 "Every write op has `--dry-run`" — Incorrect.** `append-block-item` (`ops-registry.ts:243-257`) declares NO `dryRun` param. FGAP-024 (status `identified`, OPEN) is precisely this: "append-block-item has no dry-run … the append-block-item op has no dryRun param (the upsert-block-item op does, ops-registry.ts:553)." Other write ops (relations, `update-block-item`, `move`, `amend-config`, `write-schema`, `update`) do have dryRun, but the universal claim is false for the highest-traffic write path — and the draft cites FGAP-024 elsewhere as an open write-safety gap.
- **§8 "pi-context <op> reflects every registered op" — Verified.** The CLI reflects the op registry (surface:use reflection over `ops-registry.ts`).
- **§8 "pi-context update merges catalog vocabulary" — Verified.** FEAT-006 `complete`; the `update` op additively propagates catalog-new config-registry entries (`ops-registry.ts:1354`).
- **§8 content_parent + item_derived_from_item lineage — Verified.** `content_parent` is an identity field (`block-api.ts`); `item_derived_from_item` is a registered relation_type (`*`→`*`).

### Corrections the draft needs

- **§3 (lines 42-47), replace the example block.** Buckets are `complete / in_progress / blocked / todo / unknown` (no `open`). Correct mapping: `"identified" → todo`, `"accepted" → in_progress`, `"in-progress" → in_progress`, `"closed" → complete`. (Source: `status-vocab.ts:55-105`, `STATUS_VOCABULARY_DEFAULTS`.)
- **§3 (line 51), correct the fallthrough scope and the FGAP attribution.** The hardcoded `STATUS_VOCABULARY_DEFAULTS` cover ALL stock kinds' status enums, not just tasks/framework-gaps. And FGAP-017/FGAP-018 are NOT about status-bucket derivation — status→bucket is already config-driven (FGAP-017 says so verbatim). FGAP-017 = config-driving `context-current-state`'s kind/field/ranking/blocked-by couplings; FGAP-018 = config-driving `context-status` lifecycle metrics. Re-point the sentence to FEAT-004 (the state-derivation registry), or drop the FGAP-017/018 citation from the status-bucket sentence.
- **§3 (line 53), same correction.** "once FGAP-017/018 land" should read "once FEAT-004 lands" (the state-derivation registry), since the status-bucket override surface already exists.
- **§6 (line 101), correct the roadmap parenthetical.** Either state the mechanism abstractly ("the roadmap mechanism, when a substrate authors a `roadmap` block, projects phase/milestone views through lenses") or drop it — `.context` has no `roadmap.json` and `roadmap` is not a registered block kind here.
- **§8 (line 134), correct the dry-run row.** Replace "Every write op has `--dry-run`" with "Most write ops support `--dry-run` (relations, update-block-item, move, amend-config, write-schema, update); `append-block-item` does not yet (FGAP-024, open)." Do not claim universality.
- **§2 (line 32), make "279+ edges" derivable or remove it.** No op returns a total edge count; the number cannot be ground-checked through the CLI under the evidence discipline. Prefer a derivable phrasing ("hundreds of edges across the 33 relation types") or omit the count.