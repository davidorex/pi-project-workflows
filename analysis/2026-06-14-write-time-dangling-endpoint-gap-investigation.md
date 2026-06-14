# Write-time dangling-endpoint gap — investigation

Read-only investigation per CLAUDE.md Experience-Gap Handling. Surfaced by the TASK-062 adversarial probe (`analysis/2026-06-14-task-062-write-validator-adversarial-probe.md`, "Documented write-time gap"). Active substrate confirmed `.context` (`.pi-context.json` `contextDir`). This md is filing raw material; the FGAP is NOT filed here (orchestrator + user provenance-stop).

## Root cause (file:line)

The write-time edge gate `validateEdgeAgainstRegistry` (`packages/pi-context/src/context-sdk.ts:1430-1463`) gates its source/target-kind membership check on the endpoint RESOLVING to a `loc`:

- `1450-1451`: `const parentLoc = resolve(edge.parent).loc; const childLoc = resolve(edge.child).loc;`
- `1452`: `if (parentLoc && rt.source_kinds && !(...))` — the kind check fires only when `parentLoc` is truthy.
- `1457`: `if (childLoc && rt.target_kinds && !(...))` — same gate for the child.

A non-existent endpoint resolves to no `loc` (status `dangling`), so BOTH the membership check AND any "does this endpoint exist" check are skipped: the helper returns an empty error array and the edge is accepted. The helper NEVER checks endpoint existence — it only checks registration (`1439-1445`) and present-endpoint kind membership. This is documented in the helper JSDoc (`1421-1424`): "A lens_bin / dangling / unregistered endpoint carries no `loc` and is skipped for the kind check (endpoint-resolution failures are validateContext's own surface, not this helper's)."

The write porcelain calls this gate via `assertEdgeValidForWrite` (`1491-1498`) from `appendRelationByRef` (`1528`) and `appendRelationsByRef` (`1654+`). The bulk porcelain's own JSDoc (`1649-1652`) names exactly what write defers: "relation_type registration / endpoint resolution / cycle checks deferred to `validateContext`." TASK-062 hoisted registration + present-endpoint kind; endpoint-resolution (existence) and cycle were NOT hoisted.

The post-hoc catch lives in `validateContext`'s endpoint-resolution loop (`context-sdk.ts:2041-2086`): each endpoint is classified by `resolveRef`; status `dangling` emits an `error`/`edge_endpoint_dangling` issue (`2060-2068` parent, `2077-2085` child); status `unregistered` emits `edge_endpoint_unregistered` (`2052-2059`, `2069-2076`). Cycle diagnostics are merged separately from `validateRelations` as `edge_cycle_detected` (`2131-2150`).

## Shape — caught at write vs. caught only at validate

| Axis | Write-time (`appendRelationByRef`/`appendRelationsByRef`) | Validate-time (`validateContext`) |
|---|---|---|
| relation_type registration | REJECTS (throws) — `1440-1444` | flags (error) |
| present-endpoint source/target kind | REJECTS (throws) — `1452-1461` | flags (error) |
| endpoint EXISTENCE (dangling) | **ACCEPTS** — gate skipped when no `loc` | flags `edge_endpoint_dangling` (error) — `2060-2085` |
| endpoint unregistered alias | **ACCEPTS** — same skip | flags `edge_endpoint_unregistered` (error) — `2052-2076` |
| cycle | **ACCEPTS** — not checked at write | flags `edge_cycle_detected` (error) — `2131-2150` |

The asymmetry vs. the kind check TASK-062 hoisted: TASK-062 made write reject a kind-mismatched edge whose endpoint RESOLVES, achieving write↔validate parity on the kind axis. But it left endpoint-existence (and cycle) as validate-only. The consequence is a sharp irony: an edge whose endpoint exists but is the WRONG kind is rejected at write, while an edge whose endpoint does NOT exist at all (a strictly more broken edge) is accepted at write — the kind gate is conditioned on the very resolution whose failure is the more serious defect.

## Reproducible conditions (empirical, read-only)

Fresh `/tmp/dangtest` substrate (`writeBootstrapPointer` + `adoptConception` via `npx tsx -e`; `.context` never touched; cleaned up after):

```
appendRelationByRef(cwd, { parent: "NOPE-999", child: "FGAP-001", relation_type: "decision_raises_gap" })
  → WRITE_RESULT appended=true
  → ON_DISK_COUNT=1            (persisted, confirmed via loadRelations)

validateContext(cwd).issues, filtered code === "edge_endpoint_dangling"
  → VALIDATE_DANGLING_COUNT=2
  → error | edge_endpoint_dangling | Edge parent 'NOPE-999' (relation_type 'decision_raises_gap') does not resolve to any item
  → error | edge_endpoint_dangling | Edge child 'FGAP-001' (relation_type 'decision_raises_gap') does not resolve to any item
```

`decision_raises_gap` declares source_kinds `[decisions]`; `NOPE-999` is no item, so the source-kind membership check is skipped (the gate at `1452`), the edge is written, and `validateContext` flags it only post-hoc. (Both endpoints dangle here because no block items were installed in the throwaway — the candidate's `FGAP-001` exists in the real `.context` but not in the fresh adopt-only substrate; the parent `NOPE-999` is the load-bearing dangling endpoint and reproduces the accept regardless.) The existing test `structured-endpoints.test.ts:288-310` ENCODES this behavior as intended: it appends `FGAP-1 --gap_relates_to_gap--> FGAP-2` with both endpoints dangling and asserts `appended === true` — registration passes, the presence-gated kind check is skipped. Closing the gap at write would change that test's append outcome.

## Prior-art search (precondition)

Paged the framework-gaps block; read the candidate-named FGAPs and title-searched (`matches` on `dangling|endpoint|exist`).

| id | status | covers | conclusion |
|---|---|---|---|
| FGAP-090 | closed (VER-047/048/049, TASK-061/062/063) | relation_type registry coverage completeness + write-time edge-KIND/registration/DIRECTION enforcement; added decision_raises_gap/decision_gated_by_item/gap_relates_to_gap; hoisted the kind+registration check to the write porcelain (TASK-062) | Adjacent — the parent of the TASK-062 work. Its write-time enforcement is kind + registration + direction, NOT endpoint-existence. Does NOT cover dangling. |
| FGAP-007 | accepted (TASK-027 open) | ordering-edge endpoint-ROLE metadata + write-time DIRECTION enforcement (task_depends_on_task prerequisite/dependent orientation) | Different axis — direction/orientation of an ordering edge, not endpoint existence. Does NOT cover dangling. |
| FGAP-086 | identified | $id-keyed AJV validator cache staleness | Unrelated (validator caching). |
| FGAP-091 | identified | forcing-function coverage for warranted NON-INVARIANT edges that are ABSENT (task_governed_by_decision etc. omitted with nothing flagging the absence) | Inverse problem — a warranted edge MISSING, not a written edge with a non-existent endpoint. Does NOT cover dangling. |
| FGAP-082 | identified | advancer-completion invariant CLASS (aggregate-over-incoming-edges) | Unrelated (invariant engine expressiveness). |
| (title search `dangling\|endpoint\|exist`) | — | hits: FGAP-016 (read-cap), FGAP-051/060/065 (install propagation; FGAP-065 uses "dangling" for an unmaterialized block_kind DECLARATION), FGAP-073 (lens-view) | None about write-time edge endpoint existence. |

**Conclusion: UNTRACKED.** No framework-gap covers write-time rejection of an edge whose endpoint does not exist (dangling) or names an unregistered substrate alias. FGAP-090 is the closest and explicitly scoped its write enforcement to kind/registration/direction; this is the residual endpoint-existence axis it did not address. A new filing is warranted (relate to FGAP-090 as the parent context, and FGAP-007/TASK-027 as a sibling write-time-edge-guard axis).

## Class verdict (gap-explore-surfaces-class)

**INSTANCE of a broader class, not atomic.** The general class: *the write-time edge guard rejects a strict subset of what `validateContext` rejects for an edge — it should reject EVERYTHING `validateContext` rejects (registration + kind + endpoint-existence/registration-of-alias + cycle), so a write-accepted edge is always a validate-clean edge.* This is the same class TASK-062 addressed for the kind/registration axis (write↔validate parity), generalized: TASK-062 closed two of the four validate-time edge checks at write; dangling-endpoint and cycle remain validate-only.

Sibling validate-time checks the general gap would also cover (all in `validateContext`, all currently write-deferred):
- `edge_endpoint_dangling` (the triggering instance) — `context-sdk.ts:2060-2085`.
- `edge_endpoint_unregistered` (a written `<alias>:<id>` whose alias is not a registered substrate) — `2052-2076`. Same resolution-gating root cause; the resolver returns status `unregistered` rather than a `loc`, so the kind gate skips it identically.
- `edge_cycle_detected` (a written edge closing a cycle under a relation_type) — merged from `validateRelations`, `2131-2150`. The bulk porcelain JSDoc (`1649-1652`) explicitly names cycle among the deferred checks.

The narrow symptom is dangling parent/child. Filing it alone leaves `edge_endpoint_unregistered` (same root cause, one resolver-status away) and `edge_cycle_detected` as architectural debt and invites duplicate sibling filings. Recommend filing the CLASS — "write-time edge guard should reach full write↔validate parity (endpoint existence + alias registration + cycle), the residual after TASK-062's kind/registration parity" — with the dangling-endpoint accept as the triggering instance.

Note (not a blocker, surface in filing): closing the class changes `structured-endpoints.test.ts:288-310` (which relies on dangling-append succeeding) and the dangling-append behavior generally; the implementing task must reconcile that test. The catalog has no fixture exercising a legitimately-dangling-yet-desired append, so the test is the only known consumer of the current accept behavior.

## FGAP-ready filing raw material

- **title**: Write-time edge guard accepts an edge with a non-existent (dangling) or unregistered-alias endpoint, and an edge closing a cycle — TASK-062 hoisted only registration + present-endpoint kind to the write porcelain, leaving endpoint-existence and cycle as validate-only, so a strictly-more-broken edge (offending endpoint absent) is accepted at write while a wrong-kind-but-present endpoint is rejected

- **description**: The write-time edge gate `validateEdgeAgainstRegistry` (`packages/pi-context/src/context-sdk.ts:1430-1463`), invoked by `appendRelationByRef` (`1528`) and `appendRelationsByRef` via `assertEdgeValidForWrite` (`1491-1498`), checks only (a) relation_type registration (`1439-1445`) and (b) PRESENCE-GATED source/target-kind membership (`1450-1461`) — the kind check is conditioned on the endpoint resolving to a `loc` (`1452`/`1457`). A non-existent endpoint resolves to no `loc` (resolver status `dangling`), so the kind check is skipped and the edge is accepted and persisted; the helper never checks endpoint existence. The same resolution-gating skips an `<alias>:<id>` endpoint whose alias is unregistered (status `unregistered`). Cycle is not checked at write at all (the `appendRelationsByRef` JSDoc, `1649-1652`, names "endpoint resolution / cycle checks deferred to validateContext"). `validateContext`'s endpoint loop catches these only post-hoc: `edge_endpoint_dangling` (`2060-2085`), `edge_endpoint_unregistered` (`2052-2076`), and `edge_cycle_detected` merged from validateRelations (`2131-2150`). This is the residual of FGAP-090/TASK-062, which achieved write↔validate parity on the registration + kind axes but left endpoint-existence and cycle validate-only. General class: the write-time edge guard rejects a strict subset of what validateContext rejects; full parity requires it to additionally reject dangling endpoints, unregistered-alias endpoints, and cycles, so a write-accepted edge is always validate-clean.

- **evidence** (each cited):
  - `{ file: "packages/pi-context/src/context-sdk.ts", lines: "1450-1461", reference: "validateEdgeAgainstRegistry gates source/target-kind membership on parentLoc/childLoc being truthy; an endpoint that resolves to no loc (dangling/unregistered) skips the check and the helper returns no error — no endpoint-existence check exists" }`
  - `{ file: "packages/pi-context/src/context-sdk.ts", lines: "1421-1424", reference: "helper JSDoc: 'A lens_bin / dangling / unregistered endpoint carries no loc and is skipped for the kind check (endpoint-resolution failures are validateContext's own surface, not this helper's)' — documents the gap as intended" }`
  - `{ file: "packages/pi-context/src/context-sdk.ts", lines: "1649-1652", reference: "appendRelationsByRef JSDoc: 'relation_type registration / endpoint resolution / cycle checks deferred to validateContext' — names endpoint-resolution + cycle as the write-deferred checks" }`
  - `{ file: "packages/pi-context/src/context-sdk.ts", lines: "2060-2085", reference: "validateContext emits edge_endpoint_dangling (error) for a parent/child that does not resolve to any item — the post-hoc catch for the write-accepted edge" }`
  - `{ file: "packages/pi-context/src/context-sdk.ts", lines: "2052-2076", reference: "validateContext emits edge_endpoint_unregistered (error) for an endpoint naming an unregistered substrate alias — the sibling resolution-failure also write-accepted" }`
  - `{ file: "packages/pi-context/src/context-sdk.ts", lines: "2131-2150", reference: "validateContext merges edge_cycle_detected from validateRelations — the cycle check absent at write" }`
  - `{ file: "packages/pi-context/src/structured-endpoints.test.ts", lines: "288-310", reference: "test appends FGAP-1 --gap_relates_to_gap--> FGAP-2 with both endpoints dangling and asserts appended === true — encodes the current write-accept of dangling endpoints; a fix changes this test" }`
  - `{ file: "analysis/2026-06-14-task-062-write-validator-adversarial-probe.md", reference: "Documented write-time gap: appendRelationByRef(NOPE-999 --decision_raises_gap--> FGAP-001) ACCEPTED and persisted; validateContext later flags edge_endpoint_dangling — the triggering instance" }`
  - `{ file: "analysis/2026-06-14-write-time-dangling-endpoint-gap-investigation.md", reference: "empirical repro on a fresh /tmp adopt-only substrate: appended=true, ON_DISK_COUNT=1, validateContext two edge_endpoint_dangling errors; root-cause + class + prior-art (FGAP-090 closed-adjacent, FGAP-007/TASK-027 sibling-direction, FGAP-091 inverse-absence) — untracked" }`

- **impact**: A relation can be written and committed to the substrate naming an endpoint that does not exist (a typo'd or premature id) or an unregistered cross-substrate alias, or closing a cycle, with no write-time signal — the porcelain returns `appended: true`. The defect surfaces only at a later `context-validate` pass (if one runs), divorced in time from the write that introduced it, so a CLI/op caller filing an edge gets no immediate feedback that the edge is broken. This is the precise inverse of the TASK-062-enforced kind check: a present-but-wrong-kind endpoint is rejected at write, but an absent endpoint (strictly more broken) is accepted — write-time rejection coverage is non-monotonic in edge brokenness. Broken edges accumulate substrate-wide between validate runs, and `--dryRun` previews (which run the same gate before the dryRun branch, `1528-1529`) also fail to predict the dangling-edge defect.

- **proposed_resolution**: Extend the write-time edge guard to full write↔validate parity — reject at write everything `validateContext` rejects for an edge: the residual endpoint-existence (`edge_endpoint_dangling`), unregistered-alias (`edge_endpoint_unregistered`), and cycle (`edge_cycle_detected`) checks, in addition to the registration + present-endpoint-kind checks TASK-062 already hoisted. Mechanism: the write-time resolver already classifies each endpoint status (the same `resolveRef` validateContext uses, built by `buildWriteTimeEdgeValidator`, `1474-1483`) — surface a `dangling`/`unregistered` status as a write-time rejection rather than a skip; add a prospective-cycle check against the existing edges (mirroring the validateRelations cycle pass). Reconcile `structured-endpoints.test.ts:288-310` (currently asserts dangling-append succeeds) as part of the change — decide whether a legitimately-forward-referencing append needs an explicit opt-out or whether dangling is always a write error. Relate to FGAP-090 (the closed parent that established write↔validate kind/registration parity; this is its endpoint-existence residual) and FGAP-007/TASK-027 (sibling write-time edge-direction guard axis). Gaps carry no acceptance_criteria.

  *(provenance note for the orchestrator's filing stop: every element above is DERIVABLE from the cited code/probe/repro; the "always a write error vs. opt-out" reconciliation of the test is a genuine open implementation choice flagged for the task that closes this, not pre-decided here.)*
