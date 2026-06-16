# FGAP-037 milestone block kind — spec validation + evaluation

Date: 2026-06-16
Active substrate: `.context` (per `.pi-context.json` `contextDir`)
Scope: validate the factual claims and dependencies of FGAP-037 against the real substrate/code, then evaluate the spec on its own terms. Read-only; nothing filed, no source edited.

---

## Part 1 — Validation verdicts (per claim / dependency)

### Evidence claim 1 — `milestone` absent from `block_kinds` registry
**HOLDS.** `pi-context read-config --registry block_kinds --json` returns exactly 17 canonical_ids: decisions, framework-gaps, tasks, verification, issues, features, research, rationale, spec-reviews, layer-plans, requirements, conventions, context-contracts, phase, story, work-orders, session-notes. None is `milestone`. The spec's enumeration is byte-accurate to the live registry.

### Evidence claim 2 — `phase.schema.json` references story→milestone/phase/project-goal edges
**FAILS as written.** Read of `packages/pi-context/samples/schemas/phase.schema.json` (version 2.0.1): the `description` reads "Inter-phase dependencies live in relations.json edges, not inline." It does NOT mention `milestone`, `story`, or `project-goal` at all. The claim attributes the story→milestone/phase/project-goal edge language to the *phase* schema; that language lives in the *story* schema (claim 3), not the phase schema. The phase schema offers no support for "phase description references story → milestone/phase/project-goal edges." Verdict: the specific cited reference is not in phase.schema.json — misattribution.

### Evidence claim 3 — `story.schema.json` names `milestone` as a cross-altitude edge target
**HOLDS.** Read of `packages/pi-context/samples/schemas/story.schema.json` (version 1.0.1): the `description` states cross-altitude relationships "(feature→story, story→task, story→story dependency, story→gating-item, story→milestone/phase/project-goal) live in relations.json closure-table edges." `milestone` is named there as an edge target with no backing block kind. The dangling-edge-target observation is real.

### Dependency FGAP-039 — the "placement relation"
**EXISTS, status `identified` (open).** Title: "Milestone groups phases via a placement relation." Description: "A phase is placed in a milestone by a relation mirroring task_positioned_in_phase. A milestone is reached when its placed phases are done." proposed_resolution: "Register a phase-in-milestone placement relation_type; milestone done-ness reads up it." So FGAP-039 specifies the placement relation conceptually (mirror `task_positioned_in_phase`) but does NOT yet define a concrete `relation_type` name/direction, and it is unimplemented. Confirmed against the relation_types registry: `task_positioned_in_phase` (category membership, tasks→phase) exists; there is NO phase→milestone (nor milestone→phase) edge registered. The placement relation FGAP-037 depends on is net-new and gated on FGAP-039.

### Dependency FGAP-041 — the "wildcard relation"
**EXISTS, status `identified` (open).** Title: "Stories attach to any item via one wildcard relation." Description: "One relation story_includes_item (source story, target any kind)…" proposed_resolution: "Register story_includes_item with source_kinds=[story], target_kinds=[*]." So FGAP-041 does define the intended relation (name `story_includes_item`, source `story`, target `*`) but it is unimplemented. Confirmed against the registry: the only story-membership edge today is `story_contains_task` (membership, story→tasks). `story_includes_item` is absent. Note FGAP-041 itself observes story can only link to tasks today. The story-attachment FGAP-037 depends on is net-new and gated on FGAP-041.

### Derived-`reached` model implementability
**PARTIALLY SUPPORTED — a key distinction the spec elides.**
- `status-vocab.ts` (`STATUS_VOCABULARY_DEFAULTS`) buckets status enum values into `complete | in_progress | blocked | todo | unknown`, config-overridable via `config.status_buckets`. `reached` is not a current key; `planned` already maps to `todo`. A new `milestone` vocabulary would need `reached`→`complete` (and `planned`→`todo`, already present) declared — straightforward.
- The status-consistency invariant engine in `context-sdk.ts` (lines ~2243-2284, classes driven by `config.invariants[]`) is config-declared and vocabulary-free: it can express "for each milestone, the targets reached via relation R must be in bucket `complete`" using `class: status-consistency`, `block: milestone`, `relation_types: [<placement>]`, a direction, and `require_target_bucket: complete`. BUT this engine VALIDATES consistency between *authored* statuses (flags drift); it does NOT *compute/derive* a status. The spec says `reached` is "derived." Derivation is the province of `currentState`/`rollupPhaseStatus` (roadmap-plan.ts), not the invariant engine. So "reached is derived" implies net-new deriver code (a milestone rollup reading the placement edges up to placed phases), OR the spec must instead mean "reached is *authored* and an invariant *checks* it against placed-phase completion." The spec does not resolve which — see Part 2 completeness.
- The phase block exists (`phase.schema.json`, statuses planned|in-progress|completed → bucket todo/in_progress/complete), so "placed phases are done" is computable from phase status once the placement edge exists.
- Registered relation expressing "phase placed in milestone": NONE today. Net-new, == the FGAP-039 dependency.

### `release` field — existing release/version vocabulary
**OVERLAPS FGAP-011 (status `accepted`), which the spec does not cite.** `pi-context read-block-item --block framework-gaps --id FGAP-011`: FGAP-011 ("No release/version vocabulary") is `accepted` and explicitly scopes a release/version block kind (id, version, target/date, status planned|released, summary) PLUS a relation binding closed dev-items to a release, PLUS "optionally a milestone/roadmap instantiation." FGAP-037's `release` field (an optional string on milestone, "to group gaps/issues/tasks/phases into a release e.g. 0.30.1") is a competing/overlapping treatment of the same concern FGAP-011 owns. There is no existing release/version block kind, field, or relation in the substrate for it to interact with; the `release` field is self-contained as a bare string but collides conceptually with the accepted FGAP-011 direction. FGAP-037 carries no edge to FGAP-011.

### Additional finding — a `milestone` concept ALREADY EXISTS in code (not in the substrate)
`grep milestone` over `packages/pi-context/src` surfaces `roadmap-plan.ts`: an inline `MilestoneSpec { id; name; criterion?; evidence_block?; evidence_query? }` declared on a `RoadmapSpec` in `roadmap.json`, with `milestoneSatisfied` derived by `evaluateMilestone` (satisfied when ≥1 item in `evidence_block` matches every key/value in `evidence_query`). This is a roadmap-internal, evidence-query-driven milestone — NOT a substrate block kind. FGAP-037 proposes a DIFFERENT milestone model and explicitly says "No evidence_block/evidence_query." So the codebase has two divergent milestone conceptions: (a) the existing roadmap `MilestoneSpec` (evidence-query satisfaction), and (b) FGAP-037's proposed block (placed-phase-rollup `reached`). The spec does not acknowledge or reconcile the existing one. `MilestoneSpec.id` is an unconstrained `string` (no `MILE-NNN` pattern); FGAP-037's `MILE-NNN` is a new convention with no precedent in the existing milestone code.

---

## Part 2 — Evaluation (on the spec's own terms)

### Coherence
- The core shape (id / name / status / optional release) is internally simple and the placement + story-attachment relations are named to known precedents (`task_positioned_in_phase`, the wildcard `story_includes_item`), so the relational story hangs together at the conceptual level.
- **Tension: `status = planned|reached` vs a derived-completion model.** A two-value enum cannot represent the in-flight state. When some placed phases are complete and others are not, the milestone is neither cleanly `planned` nor `reached`. Phase rollup (`rollupPhaseStatus`) and `currentState` distinguish `in_progress` precisely for this; a milestone deriving from placed phases will routinely sit in a partial state the enum cannot name. Either a third value (e.g. `in-progress`/`partial`) is needed, or `reached` must be defined as a strict all-phases-complete predicate with everything-else collapsed to `planned` (a lossy choice the spec doesn't state). The spec's "no missed" aside addresses one excluded value but not the missing in-flight value.
- **Tension: "derived" vs an authored two-value status.** If `reached` is derived from placed-phase completion, then `status` is a computed projection, not an authored field — yet it is specified as a stored enum. The spec conflates an authored status field with a derived rollup without saying which is the source of truth (stored-and-checked vs computed-on-read). These are different implementations (invariant check vs deriver).

### Completeness — what a builder MUST decide that the spec leaves open
1. **Derive vs enforce.** Is `reached` computed by a deriver (new milestone rollup in roadmap-plan/context-sdk reading placement edges) or authored and validated by a `status-consistency` invariant? Different code, different files. Unspecified.
2. **The in-flight status value.** Two-value enum is insufficient under a rollup model (above). The builder must add a third value or define a lossy collapse. Unspecified.
3. **Exact relation_type names + directions.** FGAP-039 says "mirror task_positioned_in_phase" but neither FGAP names the concrete placement relation_type (e.g. `phase_positioned_in_milestone`? `phase_placed_in_milestone`?), its category (membership), source/target kinds, or direction. FGAP-041 does name `story_includes_item` (story→*), so story-attachment is more pinned than placement.
4. **Schema field types / required-set.** Not given. Builder must decide required = [id, name, status] (parallels phase/story), types, the `MILE-NNN` id `pattern` regex (note: `MILE-NNN` three-digit vs the existing `STORY-\d{3,}`/`PHASE-[A-Z0-9-]+` conventions — pick one), and whether `release` is a free string or constrained (semver).
5. **Status-bucket mapping.** `reached`→`complete` and `planned`→`todo` must be added to `STATUS_VOCABULARY_DEFAULTS` (or declared in config.status_buckets) for any rollup/invariant to see milestone status — unstated but mandatory.
6. **"Lands in samples catalog + active .context."** The mechanism (per CLAUDE.md install ceremony): add the block kind + schema to `samples/conception.json` + `samples/schemas/milestone.schema.json`, register `block_kinds[]` and the two `relation_types[]`, then bring `.context` current via `/context update` (catalog-ahead resync). The spec names "via the pi-context update CLI" but does not enumerate the catalog-side edits (conception.json block_kinds entry, relation_types registration, schema file) — the builder must derive the full dual-surface change set.
7. **`MILE-NNN` collision with existing `MilestoneSpec`.** The spec does not address the pre-existing roadmap `MilestoneSpec` (string id, evidence-query model). A builder must decide coexistence vs reconciliation, and whether the two share the `milestone` name namespace.

### Implementability — concrete work implied + gating
Work the spec implies:
- **Schema authoring**: `packages/pi-context/samples/schemas/milestone.schema.json` (id pattern, name, status enum, optional release, the oid/content_hash/content_parent identity trio per the phase/story precedent).
- **Catalog registration**: `samples/conception.json` `block_kinds[]` += milestone; `relation_types[]` += the placement relation (FGAP-039) + `story_includes_item` (FGAP-041).
- **Status vocabulary**: extend `STATUS_VOCABULARY_DEFAULTS` (or config.status_buckets) with `reached`/`planned` (+ any in-flight value).
- **Derivation/invariant code (net-new)**: either a milestone-reached deriver reading placement edges to placed phases, or a `status-consistency` invariant entry in `config.invariants[]`. The spec's "derived" wording leans deriver; the existing engine supports the invariant route.
- **Active-substrate landing**: `/context update` (catalog-ahead → resync) into `.context`.
**Gating**: FGAP-037 is gated on FGAP-039 (placement relation — open, undefined concrete name) AND FGAP-041 (wildcard relation — open, name defined). The placement relation is the harder gate (undefined). Both are `identified` (unstarted). FGAP-037 cannot be fully built before its two dependencies register their relation_types. The schema + block-kind registration could land independently, but the `reached` derivation and story-attachment are inert until FGAP-039/041 are done.

### Internal tensions / gaps summary
- Two-value `status` is inconsistent with a placed-phase rollup that has an unavoidable partial state.
- "Derived" `reached` vs an authored stored enum — source-of-truth unspecified (deriver vs invariant).
- `release` field overlaps the accepted FGAP-011 release/version vocabulary; no edge to it, no reconciliation, risk of two competing release representations.
- Evidence claim 2 misattributes the story-edge language to phase.schema.json (it is in story.schema.json) — a factual defect in the filing's evidence.
- The pre-existing `MilestoneSpec` in roadmap-plan.ts (evidence-query model, unconstrained string id) is unacknowledged; `MILE-NNN` is a new id convention with no codebase precedent.

---

## Bottom line
The spec's central observation is real (no milestone block; story schema dangles a milestone edge target), and the relational dependencies it names genuinely exist as open gaps. But its evidence has one misattribution (claim 2), its two-value status enum is in tension with its own derived-completion model, it leaves the derive-vs-enforce decision and concrete relation names open, its `release` field collides with the accepted FGAP-011 without reconciliation, and it does not acknowledge the pre-existing roadmap `MilestoneSpec`. Buildable in principle but gated on FGAP-039 + FGAP-041 and underspecified on the points above.
