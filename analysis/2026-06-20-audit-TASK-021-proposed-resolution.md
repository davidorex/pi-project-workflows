# Audit — TASK-021 proposed resolution (config-declared lifecycle metrics in context-status)

Date: 2026-06-20
Scope: read-only design audit of TASK-021's proposed resolution (description + acceptance_criteria) and its upstream FGAP-018 `proposed_resolution`, against the ACTUAL current `context-sdk.ts` and the config registry that the now-completed dependency TASK-020 shipped. No mutation, no implementation.

## Verdict: HAS-PROBLEMS (design is directionally sound; anchors are stale and one reuse path is unstated)

The core design instinct — "make the lifecycle metrics config-declared, keep the generic per-kind summary as the default fallback" — is correct and best-practice (it removes hardcoded vocabulary literals, mirroring exactly what TASK-020 did to the sibling `currentState()`). It is NOT poisoned at the goal level. The problems are in the *task's stated grounding*, which will mislead the implementing subagent because the cited code has materially moved since the task was filed, and because the task does not name the registry it should extend.

---

## Established facts

- **Two distinct functions.** `contextState()` (lines 438–676, behind the `context-status` op) is the lifecycle-metrics surface TASK-021 targets. `currentState()` (line 728+, behind `context-current-state`) is the where-are-we/what-next surface that the completed dependency **TASK-020** already made fully config-driven. TASK-021 is the *unfinished sibling* of TASK-020.
- **TASK-020 is `completed`** (substrate + Task list both confirm) and shipped a rich `state_derivation` registry in `config.schema.json` (lines 70–141) + `conception.json` (lines 455–513): `in_flight`, `focus_fallback`, `next_ranked`, `blocked_by`, `rollups`, `head_size`, plus a `status_buckets` map (raw status → one of complete/in_progress/blocked/todo/unknown). The deriver routes every status comparison through `status_buckets` — kind-general, no per-kind literal.
- **`contextState()` still hardcodes** five lifecycle projections with literal field + status names:
  - `phase` → `current = filter(status === "completed")` (lines 583–593)
  - `requirements` → `byStatus` on `.status` + `byPriority` on `.priority` (lines 609–626)
  - `tasks` → `byStatus` on `.status` (lines 628–642)
  - `domain` → `total` only (lines 644–652)
  - `verification` → `passed`/`failed` split on literal `status === "passed" | "failed"` (lines 654–669)
  - The generic per-kind status summary (the intended fallback) already exists at lines 540–575.

---

## Problem 1 (MODERATE — stale anchors that misdirect the agent)

Both TASK-021.description and FGAP-018 cite the lifecycle block as **"contextState() ~577-654"** / "~429-667", special-casing **"phase / requirements / tasks / domain / verification"**.

- Line ~577 is now the **phase** path (583–593), which TASK-020-era work split OUT into its own `phaseCurrent` counter; the requirements/tasks/domain/verification special-cases are now **595–669**.
- The "hardcoded fields + status literals" the task wants to dislodge are at the new offsets, and `phase` is now structurally separate from the other four (it feeds `state.phases`, not a `byStatus` map).

A subagent handed the verbatim filing (per the project's verbatim-composition mandate) will navigate to the wrong region. **The line ranges and the phase-grouping claim are filing defects to correct, not requirements to implement.** This is the classic poisoned-assumption-about-code class: the task was filed before its own dependency landed and was never re-anchored.

## Problem 2 (MODERATE — names no reuse of the shipped `status_buckets` / registry; invites a parallel mechanism)

TASK-021 says "make the lifecycle metrics config-declared (which kinds + which status values yield the lifecycle metrics)" but does NOT reference the `state_derivation` registry or `status_buckets` map that TASK-020 already shipped. As written it reads as "invent a new config block for lifecycle metrics."

That is a scope-creep / non-DRY hazard:

- The `verification` `passed`/`failed` split is exactly a **status-bucket** question. `status_buckets` already normalizes raw status → bucket. A *new* "which status values are passed/failed" declaration would be a second, parallel status-vocabulary mechanism next to `status_buckets` — the anti-pattern the project explicitly flags (parallel ungated/duplicate paths).
- The `requirements.byPriority` projection depends on a `priority` **rank field**, which `state_derivation.next_ranked[].rank_field` already expresses. A fresh "priority field name" declaration would duplicate that too.

The correct design is **extend the existing `state_derivation` registry** with a `lifecycle_metrics` sub-key (a list of `{kind, metrics}` where each metric is `count` | `by_status` | `by_field <field>` | `bucket_split <bucket>`), and have every status comparison route through the existing `status_buckets` normalizer — so `verification` "passed/failed" becomes "count items whose bucket is `complete` vs `blocked`" (or whatever the conception declares), NOT a literal `=== "passed"`. This keeps ONE status vocabulary and ONE derivation registry. The task must NAME this, or the agent may build a sibling mechanism.

## Problem 3 (MINOR — "byte-preserved" criterion under-specifies the shape contract)

`Stock .context behavior byte-preserved` is the right intent but is ambiguous about the **output shape**. `contextState()` returns a typed `ContextState` with named optional fields (`requirements?`, `tasks?`, `domain?`, `verifications?` — note the field is `verifications` with the `passed/failed` shape). A config-driven rewrite that emits a generic `Record<kind, metrics>` would change the JSON shape and break the `context-status` op's downstream consumers / the typed interface even while the *numbers* are identical. The criterion should state explicitly: **the stock conception declares the four lifecycle kinds such that the emitted `ContextState` field set + per-field shape (incl. `verifications.{passed,failed}` and `requirements.{byStatus,byPriority}`) is identical to today** — i.e. byte-identical *serialized output*, not merely equal counts. Otherwise "byte-preserved" can pass against a reshaped object.

## Not a problem (confirmed sound)

- Keeping the **generic per-kind summary as the default fallback** is correct and already-built (lines 540–575) — no new fallback code needed; the task's instinct matches the existing structure.
- Pairing with FGAP-017's registry (now shipped via TASK-020) is the right architectural seam; this task is genuinely the completion of that arc, not a redundant one.
- Targeting FEAT-004 is consistent: FEAT-004's acceptance criteria are about `context-current-state`/`context-status` deriving from config with no hardcoded stock kind names — TASK-021 closes the `context-status` half.

---

## Proposed corrected text (ready to replace the task's fields)

### description (replacement)

> Config-declared lifecycle metrics in context-status. Closes FGAP-018 (P3): the lifecycle/metrics projection in `contextState()` (context-sdk.ts) still special-cases stock kinds with hardcoded fields + status literals — `requirements` (byStatus on `status` + byPriority on `priority`, ~609-626), `tasks` (byStatus on `status`, ~628-642), `domain` (total, ~644-652), `verification` (passed/failed split on literal `status === "passed"|"failed"`, ~654-669); `phase` current-count (~583-593) is a separate path. Make WHICH kinds yield WHICH lifecycle metric config-declared by EXTENDING the existing `state_derivation` registry shipped by TASK-020 (add a `lifecycle_metrics` sub-key: a list of `{kind, metrics}` where each metric is `count` | `by_status` | `by_field:<field>` | `bucket_split:<bucketA>/<bucketB>`), routing every status comparison through the existing `config.status_buckets` normalizer (so verification "passed/failed" derives from declared buckets, NOT literal status strings) and every rank/priority projection through a declared field — no new parallel status or field vocabulary. The generic per-kind status summary (context-sdk.ts ~540-575) remains the default fallback for any kind with no `lifecycle_metrics` declaration. The shipped conception declares the four stock lifecycle kinds so the emitted `ContextState` field set + per-field shape (incl. `verifications.{passed,failed}`, `requirements.{byStatus,byPriority}`) is serialized-identical to today. Pairs with FGAP-017's state-derivation registry (TASK-020, completed). Advances FEAT-004.

### acceptance_criteria (replacement)

> 1. FGAP-018 closed: a custom-vocabulary substrate that declares `state_derivation.lifecycle_metrics` for its own kinds gets those structured metrics in `context-status`; the generic per-kind status summary (context-sdk.ts ~540-575) remains the default for any undeclared kind.
> 2. Lifecycle metrics derive ONLY from config — no hardcoded kind name (`requirements`/`tasks`/`domain`/`verification`), field literal (`priority`), or status literal (`passed`/`failed`/`completed`) survives in the `contextState()` lifecycle path (verified by grep of the deriver); status comparisons route through `config.status_buckets`, not raw string equality.
> 3. No new status-vocabulary or rank-field mechanism is introduced parallel to `status_buckets` / `state_derivation` — `lifecycle_metrics` reuses them.
> 4. Stock `.context` behavior is serialized-byte-preserved: the stock conception declares the four lifecycle kinds such that `context-status`'s emitted `ContextState` field set AND per-field shape (`verifications.{passed,failed}`, `requirements.{byStatus,byPriority}`, `tasks.byStatus`, `domain.total`, `phases.{total,current}`) are identical to today against the live `.context`.
> 5. With no `lifecycle_metrics` declaration the op returns only the generic summary (a truthful default), distinguishable from a configured substrate — no silent empty.
> 6. Canonical pipeline green (incl. runtime demo of `context-status` against BOTH `.context` and a custom-vocabulary substrate + fresh adversarial audit).

### notes (replacement)

> Release-group: config-driven-state / FEAT-004 (R+1) | order 7 | addresses FGAP-018, FEAT-004 | depends on order 6 (TASK-020, completed — EXTENDS its `state_derivation` registry + reuses its `status_buckets` normalizer; does not add a parallel mechanism).

### FGAP-018.proposed_resolution (replacement — re-anchor the upstream too)

> Make the lifecycle metrics config-declared by EXTENDING the `state_derivation` registry (TASK-020, shipped) with a `lifecycle_metrics` sub-key declaring which kinds yield which metric (count / by_status / by_field / bucket_split), routing status through the existing `status_buckets` normalizer rather than literal status strings; keep the generic per-kind summary (context-sdk.ts ~540-575) as the default. Stock conception declares the four lifecycle kinds for serialized-identical output. Does NOT add a parallel status/field vocabulary. Advances FEAT-004.
