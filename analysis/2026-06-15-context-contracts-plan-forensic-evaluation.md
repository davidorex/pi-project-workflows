# Forensic evaluation — "Context Contracts — Leverage Plan"

Date: 2026-06-15. Active substrate: `.context` (confirmed `.pi-context.json` `contextDir`).
Method: pi-context CLI direct-drive (one op per question); package source via Read/Grep. Read-only.

Verdict legend: TRUE = plan's claim matches evidence. INACCURATE = plan's claim is wrong; correct fact + citation given.

---

## A. Schema + op behavior

| # | Claim | Verdict | Correct fact + citation |
|---|-------|---------|--------------------------|
| A.1a | `context-contract` schema fields are `unit_kind` + `bundle_relation_types[{relation_type, direction, max_depth}]` | TRUE | `.context/schemas/context-contracts.schema.json` (== `samples/schemas/context-contracts.schema.json`, v1.0.1). Item-required: `id, unit_kind, bundle_relation_types, created_by, created_at`. Per-spec required: `relation_type, direction, max_depth`. |
| A.1b | `unit_kind` enum is `"task"\|"decision"\|"feature"\|"gap"\|"work-order"` | **INACCURATE** | `unit_kind` is a free-form `{"type":"string"}` with **NO enum** (schema lines 30–33). It is a plain-string type tag; any string validates. The plan invents a closed enum that does not exist. |
| A.1c | `direction` enum is `"in"\|"out"\|"both"` | TRUE | schema lines 48–55: `enum: ["in","out","both"]`. |
| A.1d | `max_depth` is integer ≥ 1 | TRUE | schema lines 56–59: `type: integer, minimum: 1`. |
| A.1e | (implicit) `bundle_relation_types[]` entry has only those 3 fields | PARTIAL | An optional 4th field `applicability_predicate` (string, reserved) exists (schema lines 60–63); not load-bearing. |
| A.2a | `gather-execution-context --unitId <id> --kind <unit_kind>` reads the contract by kind, walks each declared relation per direction, returns a `ContextBundle` (unit + per-relation-type buckets of resolved items) | TRUE | `packages/pi-context/src/execution-context.ts:143-223` (`gatherExecutionContext`); op at `ops-registry.ts:2025-2053`. Flags `--unitId`, `--kind`, optional `--maxDepth`. `ContextBundle = { unit, perRelationType, traversal_depth, scoped_at }` (lines 104-109). |
| A.2b | The bundle is "injectable into an agent spec's `contextBlocks`" | UNSUPPORTED (not false, not implemented) | `gatherExecutionContext` returns the structured payload only; it does NOT itself inject into any agent spec. No code wires `ContextBundle` → `contextBlocks`. The op description (`ops-registry.ts:2029`) calls it a "Substrate primitive serving harness-confined dispatch." Injection is a downstream consumer step the plan would still have to build; the plan presents it as existing behavior. |
| A.3a | `context-contracts` block is empty (0 contracts) | TRUE | `pi-context read-block --block context-contracts` → `[]`. |
| A.3b | `work-orders` block is empty | TRUE | `pi-context read-block --block work-orders` → `[]`. `work-orders` IS a registered block kind (prefix `WO-`, array_key `work_orders`; `read-config --registry block_kinds`). |

---

## B. Exact edges on named items (`find-references --id`)

| Item | Plan's claimed edges | Verdict | Actual edge set |
|------|----------------------|---------|------------------|
| DEC-0018 | 6 edges: `decision_addresses_gap→FGAP-092`, `decision_gated_by_item→FGAP-076`, `decision_raises_gap→FGAP-076`, `decision_derived_from_item→DEC-0017`, `research_informs_item←R-0012`, `item_governed_by_convention→derive-decisions-from-facts` | TRUE (all 6) | `find-references --id DEC-0018` returns exactly these 6 edges, same relation_types, same endpoints. No mis-statement. |
| FEAT-007 | inbound: DEC-0016 (`decision_addresses_feature`) + TASK-031/032/033/041 (`task_addresses_feature`) + FGAP-071 (`gap_addressed_by_feature`); outbound: `feature-branch-workflow` (`item_governed_by_convention`) | TRUE | `find-references --id FEAT-007` returns exactly: DEC-0016, TASK-031, TASK-032, TASK-033, TASK-041 (all `task_addresses_feature`), FGAP-071 (`gap_addressed_by_feature`), `feature-branch-workflow` (`item_governed_by_convention`). All match. |
| FGAP-089 | inbound `task_addresses_gap←TASK-060` (and notes TASK-060 cancelled) | TRUE | `find-references --id FGAP-089` returns exactly one edge: TASK-060 →(`task_addresses_gap`)→ FGAP-089. The edge persists despite TASK-060 being cancelled (per CLAUDE.md). |
| TASK-047 | (plan groups it with TASK-003/044/DEC-0018) | context | `find-references --id TASK-047`: `task_addresses_gap→FGAP-082`, `item_governed_by_convention→feature-decomposition`. 2 edges. |
| TASK-003 | (grouped) | context | `task_addresses_feature→FEAT-001`, `task_governed_by_decision→DEC-0002`, `item_governed_by_convention→feature-branch-workflow`, `item_governed_by_convention→cli-command-form`. 4 edges. |
| TASK-044 | (grouped) | context | `task_addresses_gap→FGAP-074`, `item_governed_by_convention→feature-decomposition`. 2 edges. |

No mis-stated present-or-missing edge found in section B. Every specific edge the plan enumerated for DEC-0018, FEAT-007, FGAP-089 is present with the claimed relation_type.

---

## C. relation_type existence (`read-config --registry relation_types`) — CRITICAL

All but one of the named relation_types are registered canonical_ids. Direction coherence noted where relevant.

| relation_type | Registered? | source_kinds → target_kinds / category |
|---------------|-------------|-----------------------------------------|
| `task_addresses_gap` | YES | tasks → framework-gaps / data_flow |
| `task_addresses_feature` | YES | tasks → features / data_flow |
| `task_governed_by_decision` | YES | tasks → decisions / data_flow |
| `task_advances_story` | YES | tasks → story / data_flow |
| `item_governed_by_convention` | YES | {decisions,features,tasks} → conventions / data_flow |
| `task_depends_on_task` | YES | tasks → tasks / ordering |
| `task_gated_by_item` | YES | tasks → * / ordering |
| `research_informs_item` | YES | research → * / data_flow |
| `decision_derived_from_item` | YES | decisions → * / data_flow |
| `decision_addresses_gap` | YES | decisions → framework-gaps / data_flow |
| `decision_addresses_feature` | YES | decisions → features / data_flow |
| `decision_gated_by_item` | YES | decisions → * / ordering |
| `decision_raises_gap` | YES | decisions → framework-gaps / data_flow |
| `decision_escalates_underdetermined` | YES | decisions → framework-gaps / data_flow |
| `gap_addressed_by_feature` | YES | framework-gaps → features / data_flow |
| `feature_advances_story` | YES | features → story / data_flow |
| `feature_gated_by_item` | YES | features → * / ordering |
| **`work_order_dispatches_task`** | **NO — DOES NOT EXIST** | Absent from `relation_types` registry; zero source hits (`grep work_order_dispatches_task packages/ scripts/` → none). A contract or edge naming it walks/registers NOTHING; an `append-relation --relation_type work_order_dispatches_task` would fail the relation_type registration check. |

**Section C finding:** 17 of 18 named relation_types are real and direction-coherent. The single most-suspect one — `work_order_dispatches_task`, flagged in the brief — is confirmed **nonexistent**. Any proposed contract (esp. a work-order/CTX-005-style contract) that walks `work_order_dispatches_task` is built on a relation_type that must be registered first.

---

## D. Other load-bearing claims

| Claim | Verdict | Correct fact + citation |
|-------|---------|--------------------------|
| "30 `edge_parent_not_in_bins` issues from `story-advancers` / `story-advancers-features`" | **INACCURATE (count)** | `context-validate-relations` → status `invalid`, **29** issues, all `edge_parent_not_in_bins`, all from those two lenses. Breakdown: TASK-046 (1), FEAT-009→STORY-001..014 (14), TASK-048 (6), TASK-049 (1), TASK-050 (1), TASK-051 (4), TASK-052 (2) = 29. Plan over-counts by one; the source + class are correctly identified. |
| A `run-work-order-loop` tool/op exists | TRUE (but in `pi-agent-dispatch`, not pi-context) | Real tool: `packages/pi-agent-dispatch/src/run-work-order-loop-tool.ts` + `work-order-loop.ts` + `index.ts` registration. It references `gather-execution-context` only as a vocab entry (`operation-vocab.ts:49`); it does NOT consume `work_order_dispatches_task` (which doesn't exist). NOT a pi-context op — absent from pi-context `ops-registry.ts`. |
| `gap-arc-coherence` convention is `enforcement: review` (unenforced) | TRUE | `read-block-item --block conventions --id gap-arc-coherence` → `enforcement: "review"` (severity field is `error` but enforcement is review, i.e. no structural-at-filing bite — review/monitor layer only). |
| `decision-shows-derivation` invariant is "at error severity" and "gates every future decision automatically" | **INACCURATE** | `read-config --registry invariants` → `decision-shows-derivation` is **`severity: warning`**, NOT error. Corroborated by the `derive-decisions-from-facts` convention body (verbatim): "decision-shows-derivation is severity warning until the existing decisions are backfilled, then raised to error (the convention-articulation clean-after-backfill pattern)." It currently WARNS, does not gate/block. (TASK-041 — pending — is the task to backfill derivation edges and raise it to error; until then the plan's "gates automatically" is false.) |
| TASK-020 / TASK-021 are the FEAT-004 slice | TRUE | `find-references --id TASK-020`: `task_addresses_feature→FEAT-004`, `task_depends_on_task→TASK-021`, `task_addresses_gap→FGAP-017`, `item_governed_by_convention→feature-branch-workflow`. TASK-021 task-title (Task tool) confirms FEAT-004/FGAP-018. Linkage holds. |

---

## Summary of inaccuracies (most material first)

1. **`work_order_dispatches_task` relation_type does not exist** (Section C). The most material defect: any work-order-dispatch contract the plan proposes walks an unregistered relation_type and would compose an empty bucket / fail at edge-write. Must be registered in `config.relation_types[]` before use.
2. **`decision-shows-derivation` is severity `warning`, not `error`, and does NOT gate decisions** (Section D). The plan's claim that it "gates every future decision automatically" is false; the convention body explicitly states warning-until-backfill. Raising to error is pending TASK-041.
3. **`unit_kind` has no enum** (A.1b). The schema accepts any string; the plan's closed `task|decision|feature|gap|work-order` enum is invented. (Low blast radius — contracts still work — but a stated schema fact is wrong.)
4. **Bundle→`contextBlocks` injection is not implemented** (A.2b). `gatherExecutionContext` returns a payload; nothing wires it into agent-spec `contextBlocks`. The plan presents the end-to-end "stop hand-composing context" as existing when the injection leg is unbuilt.
5. **Issue count is 29, not 30** (D). Minor; source/class correct.

No mis-stated edges were found (Section B is clean — all enumerated DEC-0018/FEAT-007/FGAP-089 edges are present and correctly typed). `run-work-order-loop` is real (in pi-agent-dispatch), correcting any assumption it is absent.

---

## Overall accuracy verdict

**Core thesis — "authoring `context-contract` items + driving `gather-execution-context` lets the orchestrator derive (rather than hand-compose) subagent dispatch context" — is SOUND in mechanism.** The schema, the op, the direction semantics, the per-relation-type bucketing, and (with one exception) the relation_type vocabulary all exist and behave as the plan describes; the contracts block is genuinely empty, so authoring contracts is the real unlock. Edge-level claims about the named items are accurate.

**But the plan is wrong on 5 specifics, two of them material to executing it:**
- It would author a contract/edge on a **nonexistent relation_type** (`work_order_dispatches_task`) — that contract walks nothing until the relation_type is registered.
- It mis-states the **enforcement reality** (`decision-shows-derivation` warns, doesn't gate) — any leverage argument resting on "decisions are already gated" is unfounded.
- The **`contextBlocks` injection leg is unbuilt** — the op produces a bundle; turning that into actual subagent context is still net-new work, not a wiring-up of existing behavior.
- Plus two low-severity errors (invented `unit_kind` enum; 29-vs-30 count).

Net: the architecture the plan leans on is real and the thesis is achievable, but the plan must (a) register `work_order_dispatches_task` before any work-order contract, (b) drop the "already gates decisions" premise, and (c) treat bundle→`contextBlocks` injection as work to build, not as shipped behavior.
