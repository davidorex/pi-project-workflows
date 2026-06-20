# Audit — TASK-067 proposed resolution (build-time catalog⊇consumed-vocabulary parity gate)

Date: 2026-06-20
Scope: design audit of TASK-067's description + acceptance_criteria against the actual cited code. Read-only; no mutation, no implementation.
Verdict: **HAS-PROBLEMS** (sound intent + sound structural precedent; the core enumeration premise and several cited facts are wrong/leaky as designed).

---

## What TASK-067 proposes

A build-time gate that "mechanically enumerates the relation_types consumed **by literal string** in shipped `packages/pi-context/src/**` derivations (the AST-reading pattern `scripts/parity-check.ts` already uses) and asserts the catalog `samples/conception.json` relation_types[] ⊇ that consumed set; a non-empty difference exits non-zero." Wired into `.husky/pre-commit` + `.github/workflows/ci.yml`, unit test mirroring `parity-check.test.ts`, plan-step decision between extending `parity-check.ts` vs a sibling `scripts/catalog-vocab-parity.ts`. Forward class-fix slice of FGAP-094; depends on TASK-066.

The *aim* is correct and the FGAP-010/`parity-check.ts` structural precedent is the right model. The problems are in the **enumeration premise** ("consumed by literal string") and in **specific cited facts** that are wrong.

---

## Problem 1 — WRONG: the cited consumption line numbers are incorrect (criterion 1)

Criterion 1 names "the known sites context-sdk.ts:750/766/2457, roadmap-plan.ts:329/505/528, promote-item.ts:236".

- **context-sdk.ts:750/766/2457 do not consume relation_types.** :750 is inside a `walkTsFiles` source-line counter; :766 is a test-count regex comment region; :2457 is the tail of `validateContext`'s issue-count return. The actual `task_gated_by_item` literal consumption (the triggering instance) is at **context-sdk.ts:798, 805, 807** (gate-aware readiness, FGAP-061/TASK-065).
- **roadmap-plan.ts** consumes `"phase_depends_on"` at **:331, :486, :509** — close to the cited :329/:505/:528 but off, and missing the :486 `!==` site.
- **promote-item.ts:236** consumes `"item_derived_from_item"` — which is **already in both catalog and live config**, so it is NOT an FGAP-094 drift candidate. Citing it as a representative "known site" mis-frames the gate's target set; the real lineage-precondition site is :171 (a `.has()`, see Problem 2).

Evidence: `grep -n 'relation_type [=!]== "'` over src; direct reads of the cited line ranges.

Impact: the brief's "known sites" list, composed verbatim into the implementation brief, would seed the coding agent with wrong coordinates and one wrong relation_type. A brief is consumed verbatim downstream — these must be corrected at filing.

## Problem 2 — LEAKY/WRONG PREMISE: "consumed by literal string" is leaky in BOTH directions

The enumeration basis "relation_types consumed by literal string … the AST-reading pattern parity-check.ts already uses" is the design's load-bearing assumption, and it does not hold for this codebase's actual consumption shapes.

Empirical enumeration of `relation_type [=!]== "<lit>"` over src yields: `phase_depends_on`, `task_gated_by_item`, `verification_verifies_item`, **and the false positives `"other"` and `"rel"`** (non-relation-type string comparisons that match the same syntactic shape). So a literal-harvest:

- **False POSITIVES** — `=== "other"`, `=== "rel"` are not relation_types; a naive harvest (especially the `extractStringLiterals` helper the task points at, which harvests ALL string literals indiscriminately) flags them. The "consumed set" would contain non-vocabulary strings, and the catalog ⊉ {`other`,`rel`} → spurious gate failure.
- **False NEGATIVES — `.has()` form**: `relationTypeIds(destDir).has("item_derived_from_item")` (promote-item.ts:171) consumes a relation_type by literal but NOT via `relation_type ===`. A `===`-shaped scan misses it.
- **False NEGATIVES — variable-indirected / config-derived consumption** (the deepest issue): the codebase's *dominant* consumption pattern is config-declared derivation, where the relation_type is **data, not a code literal**:
  - `e.relation_type === entry.membership_relation` (context-sdk.ts:925) — `membership_relation` comes from the `state_derivation` rollups registry.
  - `e.relation_type === relationType` (context.ts:1503/1520/1555; context-sdk.ts:1158) — parametric closure-walk helpers; the relation_type is an argument.
  - `blockedByRels` (context-sdk.ts:798/805) — the gate-relation set is itself config-derived; `task_gated_by_item` is consumed by literal at :807 ONLY because FGAP-061 ALSO hard-codes `blockedByRels.has("task_gated_by_item")` at :805 alongside the config-derived set.

A gate that enumerates only code literals structurally **cannot see** the config-derived consumption surface — which is where this codebase actually consumes most relation_types. It would under-protect the real drift surface while emitting false positives on incidental string literals.

## Problem 3 — UNDER-DERIVED: the catalog-worthiness rule the gate encodes is asserted, not derived

R-0017 (the grounding research) states the catalog-worthiness rule precisely: *"a relation_type is catalog-required iff a shipped src derivation consumes it by literal string."* But Problem 2 shows that rule is itself the leaky premise — `item_derived_from_item` is consumed by `.has()` (not `===`), and the gate-relation set is config-derived. The rule needs restating to: **a relation_type is catalog-required iff a shipped src derivation REFERENCES it (by literal `===`/`.has()`/`!==`, OR as a default in a shipped config-derivation registry the catalog must seed).** Without that, criterion 4's "the five non-consumed live-only relations are correctly substrate-local" classification rests on an enumeration that can't actually see all consumption.

---

## What IS sound

- **The aim** (a forcing-function so catalog↔consumed-vocabulary drift cannot recur silently) is correct and matches the FGAP-010 precedent faithfully.
- **The structural model** (AST-read of src + assert catalog superset + exit-nonzero naming the missing entry + husky/CI wiring + mirror test) is the right shape.
- **The plan-step decision** (extend parity-check.ts vs sibling script) is appropriately deferred to plan, and parity-check.ts IS an extensible aggregator — either is viable.
- **The green/red behavior is verifiable and correct in direction**: catalog currently carries 37 relation_types INCLUDING `item_derived_from_item` + `verification_verifies_item` (both consumed in src → pass) but NOT `task_gated_by_item` / `phase_depends_on` (the TASK-066 back-ports → the gate correctly fails pre-TASK-066, passes post). The dependency on TASK-066 is correctly stated.
- Note: catalog relation_types is now **37**, not the 34 recorded in FGAP-094/R-0017 (the baseline moved — TASK-033/061 territory). Any count-pin in the brief must be derived at implementation time, not copied from the gap.

---

## Proposed corrected proposed-resolution text (ready to replace TASK-067 fields)

### description (replace)

> Build-time forcing-function preventing recurrence of FGAP-094's catalog↔config vocabulary drift: a gate that mechanically enumerates the relation_types a shipped `packages/pi-context/src/**` derivation REFERENCES — via the AST-reading pattern `scripts/parity-check.ts` uses — and asserts the catalog `packages/pi-context/samples/conception.json` relation_types[] ⊇ that referenced set; a non-empty difference exits non-zero naming the missing relation_types. The referenced set MUST be derived precisely, not by a naive all-string-literal harvest: relation_types are referenced in src by (a) `e.relation_type === "<lit>"` / `!== "<lit>"` comparisons, (b) `relationTypeIds(dir).has("<lit>")` membership guards (e.g. promote-item.ts:171), and (c) config-derivation registries that name relation_types as data rather than code literals (`state_derivation` rollups `membership_relation`, the `blockedByRels` gate-relation set). The enumeration must (1) EXCLUDE non-relation-type string comparisons (`=== "other"`, `=== "rel"` are false positives of a bare `relation_type === "<lit>"` regex) and (2) INCLUDE the `.has()` form. At the plan step, resolve whether config-derived consumption (membership_relation / blockedByRels, where the relation_type is data) is in or out of scope: if a shipped derivation defaults to a relation_type the catalog must seed, that relation_type is catalog-required even though no code literal names it. Wire into `.husky/pre-commit` AND `.github/workflows/ci.yml` alongside the existing parity-check.ts / check-changelog.ts gates, with a unit test mirroring parity-check.test.ts (negative fixtures proving it FAILS on a consumed-but-absent relation_type AND does NOT false-positive on `"other"`/`"rel"`). At the plan step also derive whether to extend parity-check.ts with an added check-category or add a sibling `scripts/catalog-vocab-parity.ts` (parity-check.ts is an extensible gate aggregator). Include the explicit record classifying each live-only relation_type substrate-local-vs-catalog-worthy with its derivation (does a shipped derivation reference it by ===/.has()/registry-default?). FORWARD class-fix slice of FGAP-094; mirrors FGAP-010's scripts/parity-check.ts structural answer for the catalog↔config vocabulary surface. Depends on TASK-066 (the gate goes green once the back-port lands).

### acceptance_criteria (replace the enumeration + record criteria)

1. (replace) "The gate enumerates the relation_types a shipped `packages/pi-context/src/**` derivation references — covering the `relation_type === "<lit>"`/`!== "<lit>"` form (roadmap-plan.ts:331/486/509 `phase_depends_on`; context-sdk.ts:807 `task_gated_by_item`; context-sdk.ts:2537 `verification_verifies_item`) AND the `relationTypeIds(dir).has("<lit>")` form (promote-item.ts:171 `item_derived_from_item`) — and asserts the catalog relation_types[] is a superset, with non-relation-type string comparisons (`=== "other"`, `=== "rel"`) excluded from the consumed set."

2. (keep, corrected) "The gate FAILS (non-zero, naming the missing relation_type) on a catalog with a consumed relation_type removed (proven via a throwaway), and PASSES on the TASK-066-corrected catalog. The catalog baseline is 37 relation_types as of 2026-06-20; derive any count-pin at implementation time, do not copy a stale count from FGAP-094/R-0017."

5. (extend the probe clause) "… fresh-context adversarial probe confirming no false-negative (a consumed reference the enumeration misses — specifically the `.has()` form AND any config-derivation-registry default) AND no false-positive (flagging `"other"`/`"rel"` or an intentionally-substrate-local relation)."

(criterion 4's substrate-local classification stands once the catalog-worthiness rule is restated to "referenced by ===/.has()/registry-default", not "consumed by literal string".)

### FGAP-094 / R-0017 (informational — not TASK-067 fields)

R-0017's stated catalog-worthiness rule ("iff a shipped src derivation consumes it by literal string") is too narrow — it misses the `.has()` form and the config-derivation registries. The disposition note that "the five non-consumed live-only relations are correctly substrate-local" is derived from that narrow rule and should be re-checked against `.has()`/registry-default references before TASK-067 relies on it. This is a refinement of the existing R-0017/FGAP-094, not a new filing.
