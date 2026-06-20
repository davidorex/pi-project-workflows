# Operational defects + integrity inventory — pi-context substrate & tooling

Date: 2026-06-20
Active substrate: `.context` (confirmed via `.pi-context.json` `contextDir`)
Method: drove the global `pi-context` CLI directly (one op per question, whole-node reads); cross-validated with `claude-history`; read hook/validator source directly. Every claim below is actual op output, a history citation, or a source ref.

---

## A. Integrity violations (from `context-validate` + `context-validate-relations`)

`context-validate` → status `warnings` (22 warnings, no errors).
`context-validate-relations` → status **`invalid`** (28 errors).

### CLASS A1 — `edge_parent_not_in_bins` × 28 — GENUINELY OPEN, UNTRACKED, HEADLINE

The only HARD integrity failure: `context-validate-relations` returns **`invalid`**, not warnings.

- **What is flagged**: every `task_advances_story` edge (TASK-046/048/049/050/051/052 → STORY-*) and every `feature_advances_story` edge (FEAT-009 → STORY-001..014) — 28 edges total.
- **Root**: the validator (`packages/pi-context/src/context.ts:1771-1783`) treats ANY edge whose `relation_type` matches a lens declaration as a *lens-grouping edge* whose parent must be a declared **bin label** (`lens.bins.includes(parentBin)`). The two lenses `story-advancers` (`relation_type: task_advances_story`) and `story-advancers-features` (`relation_type: feature_advances_story`) are declared with **`bins: []`** (CLI-confirmed via `read-config --registry lenses`). The same `relation_type` is *overloaded*: it is both a lens axis (a query convenience materialized by `context-edges-for-lens`, declared in commit `f2b8f91`) AND a genuine inter-item provenance edge (TASK→STORY / FEAT→STORY). The validator cannot tell them apart, so every real advancer edge's parent (a TASK/FEAT id, never a bin label) fails the `bins.includes` test against an empty bin set.
- **Class characterization**: *relation-type overload* — a `relation_type` used simultaneously as a lens grouping key and as a content edge collides under a validator that assumes lens-typed edges are bin-membership edges.
- **Tracked?** NO. No FGAP, TASK, or issue files this. `find-references` on the advancer edges, the lenses, and a substrate search return no governing gap.
- **History**: `claude-history` shows this `invalid` verdict has persisted across **every** validation run from 2026-06-14 through 2026-06-20 (20 hits). On 2026-06-20 the assistant recorded: *"TASK-046/048/.../FEAT-009 falling outside the story-advancers lens bins. I had been wrongly waving these off as 'baseline'; the validator returns invalid."* — i.e. the defect was being repeatedly dismissed as baseline rather than filed.
- **Severity**: HIGH. This is a standing `invalid` integrity state on the canonical substrate, masked by being treated as noise. Either the lens definition is wrong for this use (advancer provenance is not a bin axis) or the validator must exempt content edges whose relation_type is also a lens axis. Needs a filed FGAP at the *relation-type-overload class* level, with the empty-bins advancer lenses as the triggering instance.

### CLASS A2 — `decision-shows-derivation` warning × 17 (DEC-0001..0017) — TRACKED, deferred-by-design

- **Root**: a live `requires-edge` invariant at severity **warning**: every decision must carry a `decision_derived_from_item` OR `decision_escalates_underdetermined` edge; 17 legacy decisions predate the convention and carry neither.
- **Tracked?** YES — **TASK-041** (`planned`): backfill the 17 derivation edges, then raise the invariant warning→error. Genuinely-open WORK, but the warning itself is intended (it is the convention's bite operating at warning until backfill).
- **Severity**: LOW as integrity (warning, by design); the open *work* is TASK-041.

### CLASS A3 — `task-completed-gap-closed` warning × 2 (TASK-064, TASK-065) — true-but-expected; the validator LIMITATION is UNTRACKED

- **What is flagged**: TASK-064 completed but FGAP-091 still `identified`; TASK-065 completed but FGAP-061 still `identified`.
- **Root**: both tasks are *partial-addressing* slices. TASK-064 is "partial addressing of FGAP-091 (the concrete missing edges)"; TASK-065 is explicitly "the FGAP-061 **NOW slice**" (CLI-confirmed: FGAP-061 resolution names "NOW (task level)" vs "FORWARD (FEAT-004)"). The gaps remain open by design. The validator's `task-completed-gap-closed` invariant **cannot distinguish a task that fully closes a gap from one that partially addresses a multi-task gap** — it warns on every completed task whose addressed gap is not closed.
- **Tracked?** The two individual warnings are expected and need no fix. But the *validator-design limitation* — false-positive on partial-addressing — is **UNTRACKED**. `claude-history` shows this exact warning being hand-explained-away as "correct and expected" on 2026-06-05, 2026-06-14, and 2026-06-19 (TASK-023, TASK-038..042, plus the load-bearing-question session). A recurring manually-dismissed warning with no relation_type to express "partially addresses" is architectural debt.
- **Severity**: LOW per-instance; the unfiled limitation is a MEDIUM legibility defect (operators repeatedly re-derive "this is fine").

### CLASS A4 — `task-completed-feature-complete` warning × 1 (TASK-020) — expected, not a defect

- TASK-020 completed; FEAT-004 not complete. FEAT-004 has open sibling tasks (TASK-021, TASK-022). Legitimate in-progress-feature state. No action.

### CLASS A5 — `nested_id_bearing_array` warning × 2 (`layer-plans.plans.layers`, `plans.migration_phases`) — TRACKED

- **Root**: `layer-plans` schema nests id-bearing arrays instead of promoting to top-level entities + membership edges (edges-not-inline rule). `layer-plans` has 0 items, so it is schema-only cleanup.
- **Tracked?** YES — **issue-002** (`open`, priority `low`): promote both nested arrays to top-level entity kinds with membership relations, apply to samples catalog + live copy.
- **Severity**: LOW.

---

## B. Open tool-defect gaps / issues (operational, as distinct from feature work)

### B1 — Config-schema-lifecycle brick set: FGAP-095 / 096 / 097 — GENUINELY OPEN, UNTASKED

All three `identified`, all `package: pi-context`, all sourced from the same real incident (the TASK-020 config bump that bricked the live `.context` until reverted). **None has an addressing TASK** (`find-references` shows only `gap_relates_to_gap` edges among the set).

| Gap | Status | Symptom the user hits |
|---|---|---|
| **FGAP-095** — no load-time config migration | identified | A breaking `config.schema.json` bump strands the live substrate: `config.json` fails validation against the rebuilt CLI and **every config-loading op exits 5**, no sanctioned recovery. `loadConfigForDir` validates but never migrates (`context.ts:564-581`); the migration mechanism exists but is never invoked for "config". |
| **FGAP-096** — config repair impossible once invalid | identified | `amendConfigEntryForDir` validates-before-mutate, so an already-invalid config **cannot be repaired via the CLI** (the read/repair paths share the same pre-validation throw); `accept-all` never-clobbers. Only recourse is the forbidden direct-edit. Proven independent of FGAP-095 in a /tmp repro. |
| **FGAP-097** — no additive/expand-contract discipline | identified | Nothing flags a breaking (non-additive) config-schema change before it ships (root is `additionalProperties:false`); a removed/renamed key or new required field invalidates the existing config on next load. No build-time breaking-diff gate. |

- **Severity**: HIGH (the set documents a live-substrate-bricking class with no runtime migration, no recovery path, and no preventive gate). All three are filed-but-untasked → under-tracked.

### B2 — FGAP-100 — sub-element identity — GENUINELY OPEN, UNTASKED

- **Status**: identified. Items carry ids; nested-array parts (acceptance_criteria entries, criteria_results, options_considered, consequences) do not. Acute instance: `verification.criteria_results[]` keys each result on the criterion's **prose text**, so per-criterion verification is not durable across the iterate-to-zero edits the canonical process requires — a reworded criterion can no longer be matched to its result.
- **Tracked?** Filed; no addressing TASK (`find-references` shows only `gap_relates_to_gap` to FGAP-035/036/038); resolution = "to be filed as a separate decision" (not yet filed).
- **Severity**: MEDIUM-HIGH (directly undermines verification durability, a load-bearing process primitive).

### B3 — FGAP-089 — PreToolUse hooks scoped by op-shape, not target substrate — GENUINELY OPEN, ADDRESSER CANCELLED, HEADLINE

- **Status**: identified, P3. The two live hooks (`gap-register-guard.sh`, `block-pi-context-glue.sh`) fire on op-name + block-name (and CLI-invocation shape), **never** parsing `--cwd` or resolving `.pi-context.json` `contextDir`. Confirmed by direct source read: `gap-register-guard.sh:20-21` matches only `(append|update|upsert-block-item)` AND `--block <planning-block>`; `block-pi-context-glue.sh:22` matches only the `pi-context ` invocation shape. Neither reads the active-substrate pointer.
- **Operational symptom**: every runtime demo / test that seeds a planning block into a throwaway `--cwd` substrate is blocked identically to an active-substrate write — it blocked the TASK-033 /tmp demo seed.
- **Tracked?** YES — but the only addressing task, **TASK-060, is `cancelled`** (CLI-confirmed). So FGAP-089 is open with its addresser abandoned and no replacement task. (Confirmed I hit this exact friction during this very investigation: `block-pi-context-glue.sh` blocked my piped read of the lenses registry.)
- **Severity**: MEDIUM. Open, recurring, no live owning task.

### B4 — Resolved issues (verified closed; recorded for completeness)

`issue-001` (resyncSchema migrations.json stray decls, resolved 0fcba9c), `issue-004` (npm-link operator-binary coupling — the binary-identity root of the brick incident, resolved by TASK-069 / promote-cli, `409a71d`, VER-055), `issue-006/007/008/009` (promote-cli destructive-op / TOCTOU / arg-parse / boundary defects, all resolved in the promote-cli hardening loop). These are CLOSED; no action.

### B5 — issue-003 — conventions resync refuses items that by inspection satisfy the target schema — OPEN, root undetermined

- Status `open`, priority `medium`. A `conventions` 1.0.0→1.0.1 forward-migration **refused** items the operator inspected as valid; dry-run predicted `resynced`, live refused. **Root cause undetermined.** Not reproducible against this repo's `.context` (conventions in-sync at 1.0.1). Confirmation gated on a per-item schema-validation diagnostic or an independent repro of the operator's substrate.
- **Severity**: MEDIUM, latent (real dry/live divergence experienced while using the tool, root unknown).

### B6 — issue-005 — same-version resync verbatim-overwrites with no item re-validation — OPEN

- Status `open`, priority **high**. `update` routes a same-version catalog-ahead schema whose body changed through `resyncSchema`'s verbatim-overwrite arm (`index.ts:1066`) with **no item re-validation**. A narrowing same-version change (drop a property under `additionalProperties:false`, add a required field, narrow an enum) **silently leaves existing items invalid** — asymmetric with the version-bump path which forward-migrates + refuses. Concrete: the catalog `story` schema omits `user_kind` while 14 live story items carry it; `--dryRun` classifies that resync as not-blocked, so applying it would invalidate those items.
- **Tracked?** Filed as issue-005; no addressing task.
- **Severity**: HIGH (silent data-invalidation path through a sanctioned op).

---

## C. Install-state integrity defect (NEW — surfaced this run)

### C1 — Active `.context` self-reports `not-installed` (milestone block missing) — UNTRACKED, HEADLINE

- `pi-context context-bootstrap-state` → **`state: "not-installed"`**, `missing.blocks: ["milestone"]`.
- **Root**: the `milestone` block kind is declared in config (`read-config --registry block_kinds --id milestone` returns the full declaration: `data_path: milestone.json`, `array_key: milestones`) but the data file **does not exist** — `read-block --block milestone` → `Block file not found: .../.context/milestone.json`; `git ls-files` confirms it was never tracked.
- **Symptom**: the canonical, dogfooded substrate fails its own install-completeness check. Any operator or tooling that gates on `bootstrap-state === installed` (a fresh-checkout readiness check) sees the live substrate as not-installed. The milestone-rollup derivation (referenced by FGAP-017/TASK-020 as a config-declared rollup over `phase_positioned_in_milestone`) has no backing data file.
- **Tracked?** NO FGAP/TASK/issue references a missing milestone block or the not-installed bootstrap state.
- **Severity**: MEDIUM. A declared-but-uninstantiated block leaves the substrate permanently `not-installed` and any milestone-keyed derivation empty.

---

## D. Cross-validation with history (operational pain experienced while using the tooling)

- The `edge_parent_not_in_bins` `invalid` verdict recurs in EVERY `context-validate-relations` run 2026-06-14 → 2026-06-20 and was explicitly mis-dismissed as "baseline" until 2026-06-20 (A1). **Experienced-and-recurring, never filed.**
- The `task-completed-gap-closed` warning was hand-explained-as-expected on 2026-06-05, -06-14, -06-19 (A3). **Repeatedly re-derived, the validator limitation never filed.**
- The FGAP-089 guard mis-fire was hit again DURING this investigation (the glue hook blocked a piped registry read). **Live, recurring.**
- No history hits for unfiled config-brick / write-failure events beyond the already-filed FGAP-095/096/097 incident.

---

## E. Untracked / under-tracked operational problems needing filing

Ordered by severity:

1. **[NEW, untracked] Relation-type overload → standing `invalid` integrity (A1).** The `story-advancers`/`story-advancers-features` lenses overload `task_advances_story`/`feature_advances_story` as both a lens axis and a content edge, and with `bins:[]` every real advancer edge is flagged `edge_parent_not_in_bins` (28 errors; substrate is `invalid`). File at the *relation-type-overload* class level; advancer lenses are the triggering instance. Decide: is advancer provenance a lens axis at all, or must the validator exempt content edges whose relation_type doubles as a lens axis.
2. **[NEW, untracked] Active `.context` is `not-installed` — milestone block data file missing (C1).** Declared block kind with no `milestone.json` and no git history. File a gap/task to either instantiate the block or reconcile the declaration.
3. **[under-tracked] Config-schema-lifecycle brick set FGAP-095/096/097 (B1) — filed, UNTASKED.** A live-bricking class (no load-time migration, no recovery path, no preventive gate) with zero addressing tasks. Needs tasking.
4. **[under-tracked] FGAP-089 guard scope (B3) — open, addresser TASK-060 CANCELLED.** No live owning task for a recurring operational mis-fire. Needs a replacement task.
5. **[untracked] issue-005 silent same-version invalidation (B6, priority high) — filed, UNTASKED.** A sanctioned `update` path silently invalidates existing items. Needs tasking.
6. **[untracked] `task-completed-gap-closed` validator limitation (A3).** No vocabulary expresses "partially addresses"; the warning is manually dismissed every time a multi-task gap has one slice complete. File the validator-design gap (a `task_partially_addresses_gap` relation_type, or partial-addressing-aware invariant).
7. **[under-tracked] FGAP-100 sub-element identity (B2) — filed, no task, resolution-decision not yet filed.**

All read-only. No substrate mutation performed.
