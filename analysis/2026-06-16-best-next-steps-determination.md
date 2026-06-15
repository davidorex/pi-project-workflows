# Best Next Steps — Determination (corrected to substrate truth, 2026-06-16)

Leverage-ordered sequencing of the `.context` backlog, every count and dependency re-derived fresh from the substrate. Order is advisory, grounded in the verified dependency DAG and the zero-code/code split. Priority is the user's; what is authoritative here is the facts (dependencies, what is genuinely zero-code, what is gated on unshipped code), not the ranking.

## Situation (re-derived, `context-status` 2026-06-16)

- 0 tasks in-progress. 67 tasks total: 49 completed, **17 planned**, 1 cancelled (TASK-060).
- 94 framework-gaps: 48 closed, 5 accepted, **41 identified**.
- 18 decisions, all enacted. 9 features (5 complete, 4 proposed). 14 stories, all complete. 51 verifications, all passed. 18 research items.
- 17 config block_kinds; **7 empty**: context-contracts, layer-plans, phase, rationale, requirements, spec-reviews, work-orders. 40 relation_types, 10 invariants.
- `context-validate`: 0 errors, 21 warnings — 17 `decision-shows-derivation` (DEC-0001..0017), 2 `task-completed-gap-closed` (TASK-064/065 address still-open gaps), 2 `nested_id_bearing_array` (layer-plans Phase-H debt).

Governance is live and enforcing: the three convention-articulation invariants are at **error** (TASK-031/032, FEAT-007). `decision-shows-derivation` is the exception — it is at **WARNING**, by design, until decision-derivation edges are backfilled (TASK-041), then raised to error.

**FGAP-061 is not "non-load-bearing" anymore.** TASK-065 (completed) shipped the NOW slice: `currentState` (the deriver behind `/context status`) now reports a planned task carrying a `task_gated_by_item` edge to a non-`complete` target as blocked, and excludes it from `nextActions`. Task-level focus/status that honors gates IS derivable today. The residual is the FORWARD slice — config-declared all-kinds readiness plus feature/story-level derivation — which is FEAT-004 (the gap is bound `FGAP-061 → gap_addressed_by_feature → FEAT-004`). The gap's own `proposed_resolution` carries this NOW/FORWARD split; its status field still reads `identified` because the NOW slice closed a slice, not the whole gap.

## Genuinely zero-code, available now (pure substrate writes — no build/test/probe)

Three of the proposal's Phase-1 items are real substrate-only work. One is already done. One has a gated payoff. Stated precisely:

### Author CTX-001 (task contract) + CTX-002 (decision contract)

Zero-code: each is one `append-block-item --block context-contracts`. The schema is real and fileable — `context-contracts.schema.json` v1.0.1 requires `id` (`^CTX-\d{3,}$`), `unit_kind` (plain string type-tag, no enum — `"task"`/`"decision"` are valid), and `bundle_relation_types[]` of `{relation_type, direction(in|out|both), max_depth≥1}`. The contract item is fileable today.

The deterministic-dispatch **payoff is gated on unshipped code.** Per R-0016 (forensic, repo d48bc5e): `gatherExecutionContext` returns the bundle payload only; nothing wires that payload into an agent spec's `contextBlocks` — the bundle→agent injection is **unimplemented, net-new work**. So authoring CTX contracts + running `gather-execution-context` derives a context bundle; it does not yet make any subagent dispatch consume it. "Every future dispatch gets deterministic context" is not shipped behavior; it lands when the injection is built. The contract-authoring is still worth doing — it is the substrate half of that capability and the input `gather-execution-context` reads. Also note (R-0016): a work-order contract (CTX over `work_order_dispatches_task`) cannot be filed correctly yet — `work_order_dispatches_task` is **not a registered relation_type**; it must be registered first.

### Backfill the 17 decision-derivation edges — this is TASK-041's first half

Pure substrate: for each of DEC-0001..0017, read its reasoning and file either `decision_derived_from_item → the fact it derives from` (research/convention/gap/prior-decision/rationale; file a `rationale` item to reify a code/mandate fact with no existing item) or `decision_escalates_underdetermined → the framework-gap` capturing a genuine fork. The 17 `decision-shows-derivation` warnings (DEC-0001..0017) are confirmed present in `context-validate`. The invariant is already live at warning, so the edges are the work. This is **not** independent of TASK-041 — it is TASK-041's edge-half; the raise-to-error is TASK-041's second half (below). The per-decision derivation determination is real analysis under the filing-provenance discipline, not mechanical.

### Decision-feature linkage backfill is largely ALREADY DONE

The proposal's "add `task_addresses_feature` from TASK-033→FEAT-007, TASK-031/032/041→FEAT-007" describes edges that **already exist**. `find-references FEAT-007` returns four inbound `task_addresses_feature` edges — TASK-031, TASK-032, TASK-033, TASK-041 — plus `DEC-0016 → decision_addresses_feature → FEAT-007` and `FGAP-071 → gap_addressed_by_feature → FEAT-007`. The premise "join on `task_addresses_feature` returns empty for all features" is false: FEAT-004 also carries TASK-020 and TASK-021 inbound. The genuine remaining work, if any, is an audit of whether OTHER completed feature-tasks lack the edge — not the four named pairs, which are filed.

## Needs the canonical pipeline (code — explore → plan → agent → verify → probe → merge)

The dependency edges below are all confirmed via `find-references`.

- **TASK-020** — config-driven state-derivation registry. Binds FGAP-017 (`task_addresses_gap`) + FEAT-004 (`task_addresses_feature`). `TASK-020 → task_depends_on_task → TASK-021`: TASK-020 unblocks TASK-021. TASK-020 is the FORWARD slice of FGAP-061 by way of FEAT-004 — it does not "close FGAP-061" alone; FEAT-004 is the gap's bound feature and spans more than TASK-020. None of TASK-020's own dependencies are open; it is ready.
- **TASK-047** — advancer-completion invariant class. Binds FGAP-082. No dependency edges; ready. Third invariant class after the two convention-articulation families.
- **TASK-055** — `update` pre-flight committed-substrate check + git-tag restore-point guidance. Operator-story task; carries only a `docs-surface-sync` convention edge, no gap/feature binding. Ready.
- **TASK-066** — back-port `task_gated_by_item` + `phase_depends_on` to the catalog. Binds FGAP-094 (`task_addresses_gap`). `TASK-066 → task_depends_on_task → TASK-067`: TASK-066 unblocks TASK-067. Ready.
- **TASK-067** — build-time catalog⊇consumed-vocabulary parity gate. Binds FGAP-094. Gated behind TASK-066.
- **TASK-021** — config-declared lifecycle metrics. Binds FGAP-018 + FEAT-004. Gated behind TASK-020.
- **TASK-044** — broaden rhetorical-register guard + clean violating bodies. Binds FGAP-074. Ready.
- **TASK-056 / TASK-057 / TASK-058** — resolve-blocked report enrichment / read-schema-history op / walk-migration-chain op. Ready; no dependency edges.
- **TASK-027** — ordering-edge endpoint-role metadata + write-time direction enforcement. Binds FGAP-007. Ready.
- **TASK-022** — read-cap measurement basis per surface. Binds FGAP-016. Ready.
- **TASK-054** — `rawWriteBlockText` helper DRYing two raw tmp+rename sites. Two-line DRY; symptom-level. Ready.
- **TASK-041 (raise-to-error half)** — once the 17 derivation edges are filed and `context-validate` shows zero `decision-shows-derivation` warnings, raise the invariant warning→error via `amend-config`. Gated on its own backfill half. The `derive-decisions-from-facts` convention states verbatim that the severity stays warning "until the existing decisions are backfilled, then raised to error" — the raise is not free-standing.

### Architectural cluster (FEAT-001/002/003)

- **TASK-003** — substrate clone/import arc (DEC-0002, FGAP-002, FEAT-001). Ready.
- **TASK-004** — git merge driver + post-merge integrity (DEC-0004, FGAP-004, FEAT-002). `TASK-004 → task_depends_on_task → TASK-005`: TASK-004 first.
- **TASK-005** — convergent ordered-sequence field-kind (DEC-0005, FGAP-005, FEAT-003). Gated behind TASK-004.

## Confirmed dependency DAG (active = among planned tasks)

Three task_depends_on_task chains gate planned work:

- TASK-020 → TASK-021
- TASK-004 → TASK-005
- TASK-066 → TASK-067

All other planned tasks are dependency-free (ready). "3 task dependency chains" is accurate for the planned set.

## Held for user decision

**FGAP-089** (P3, `identified`) — PreToolUse enforcement hooks scope on op-shape + block-name, not on the target substrate, so they fire on writes to throwaway/non-active substrates. Its only edge is `TASK-060 → task_addresses_gap → FGAP-089`, and TASK-060 is the lone cancelled task — the gap has a cancelled addresser and no replacement task. A new task, a wontfix, or a supersede is a user determination, not a derivable next step.

## Advisory sequence

Grounded in the DAG and the zero-code/code split. The user sets priority.

1. **Zero-code substrate writes (no pipeline):** file CTX-001 + CTX-002 (substrate half; deterministic-dispatch payoff awaits the bundle→`contextBlocks` injection build); backfill the 17 decision-derivation edges (TASK-041 first half); audit/close any genuinely-missing `task_addresses_feature` edges (the four FEAT-007 pairs are already filed).
2. **Ready code, no gates:** TASK-020 (unblocks TASK-021; FEAT-004 / FGAP-061 FORWARD), TASK-047, TASK-055, TASK-066 (unblocks TASK-067).
3. **Governance + operator-story:** TASK-044, TASK-056, TASK-057, TASK-058, then TASK-021 (after TASK-020), TASK-067 (after TASK-066), and the TASK-041 raise-to-error (after its backfill).
4. **Infra cleanup:** TASK-027, TASK-022, TASK-054.
5. **Architectural:** TASK-003, TASK-004 (then TASK-005).
6. **User decision:** FGAP-089 disposition.
