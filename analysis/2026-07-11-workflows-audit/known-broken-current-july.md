---
audit_group: known-broken-current
description: workflows known-broken, July window
source_agent: ae75a46027c364f5e
extracted_from: /private/tmp/claude-501/-Users-david-Projects-harness-monitor-training/4a529474-bea7-419f-8f8c-bdcdb0aaeb54/tasks/ae75a46027c364f5e.output
verbatim: true
---

I have enough verified evidence. Compiling the deliverable.

---

## 1. COVERAGE

**How I smart-searched.** I pulled every top-level user text message David typed in the window (`type=user`, `is_sidechain=0`, `block_type='text'`, `is_meta` excluded) across all 15 sessions touching `/Users/david/Projects/workflowsPiExtension` between 2026-07-01 and 2026-07-12 — **830 deduped messages, read in full** (sessions `91b2dd60, ac1621b3, 53383be9, 3e9b6b17, 028fd83c, 6f738622, b0d22648, c1344af5, 22cd8f53, 6975afa7, 8d078a22, 8 short probe sessions, d3030496`). From that anchor I extracted every place David asserts something is broken/wrong or pastes a reproduced failure, then mapped each to the live substrate (`.context/*.json`, gap/task/issue status) and **verified fix-status against current source** at `packages/pi-context/src/`, `packages/pi-workflows/src/`, the catalog `samples/`, and window git log (HEAD `c0d093eb`, 2026-07-11).

**Timestamps** below are as recorded (UTC `Z`); Asia/Shanghai is +8.

**What I did not cover.** I did not exhaustively sweep `tool_executions.is_error=1` sidechain/agent rows — I relied on the failures David himself pasted into his stream (framework-gaps read failure, check-status throw, migrations validation error, git-switch error), which are the load-bearing reproductions. I did not re-run `validateWorkflow` over the 15 bundled specs to re-derive FGAP-132's "8 invalid" count; I verified its **unfixed status** (no closure commit, gap still `identified`) rather than re-reproducing. Style/rhetoric complaints (the bulk of the 830) are out of scope by instruction.

---

## 2. KNOWN-BROKEN-NOT-FIXED (most-severe first)

### A. `/context` human slash surface omits `update` + 4 operator ops — parity-check blind to it (FGAP-135, P1) — STILL BROKEN
- **Break (David, 2026-07-09T02:56:56Z):** *"this is a profound ops parity fail: The registered /context subcommands do not include update; the update reconciler exists only as the CLI op pi-context update."* Reinforced 03:23:17Z: *"i exactly said the parity check had to be fixed."*
- **Fix-status (live code):** `packages/pi-context/src/index.ts:3882` `CONTEXT_SUBCOMMANDS` has 15 keys — `init, switch, list, archive, install, check-status, accept-all, view, lens-curate, roadmap-view, roadmap-validate, status, add-work, validate, help`. **No `update`, `resolve-conflict`, `resolve-blocked`, `context-validate-relations`, or `reconcile`.** `parity-check` still guards only op↔CLI. FGAP-135 status `identified`.
- **Verdict: still-broken.** The operator's in-pi `/context` surface cannot reach the reconcile/update/conflict ops; the very parity check David demanded was never extended.

### B. Work-order dispatch engine implements only a demo subset (FEAT-014 / FGAP-125, FGAP-126, FGAP-128, all P1) — STILL BROKEN (partial)
- **Break (David dogfood, 2026-07-06T23:57:50Z):** *"try to use the work-order functionality and let's see where it breaks, if it breaks."* Results filed 2026-07-07 (`analysis/2026-07-07-work-order-dispatch-dogfood-breaks.md`); David 00:34:56Z: *"all are priority 1."*
- **Fix-status (substrate):** `FEAT-014` = `in-progress`. FGAP-125/126/128 all `identified`. Their descriptions confirm only sub-facets landed (input validated against `input_contract`; scope clamp; `aborted-non-interactive` relabel) while the residual legs remain open: `context_blocks`/`output_contract` not consumed (125), the 8 pi-only auth-gated tools still have no non-interactive invocation path (126), no work-order retry policy (128).
- **Verdict: still-broken (residual).** Core dogfood breaks partially patched, feature not closed.

### C. No lifecycle status enum carries a "paused" value (FGAP-103, P1) — STILL BROKEN
- **Break (David, 2026-07-04T21:52:29Z):** *"let's solve the 'no paused enum value' problem."* (The recurring "paused arc presented as active work" pathology, FGAP-103.)
- **Fix-status (live schemas):** `grep '"paused"' packages/pi-context/samples/schemas/*.json` → **no match.** No status enum on any of the 13 status-bearing kinds admits deliberate suspension; the bucket layer still maps `paused→blocked` only. FGAP-103 `identified`.
- **Verdict: still-broken.** A paused phase/task still cannot be represented; David flagged this problem 3+ times across the window and it is unresolved.

### D. Fresh install never seeds block-schema migration declarations (FGAP-140, P2) — STILL BROKEN
- **Break (David, 2026-07-11T12:47:23Z):** *"i don't want register i want fucking fixed. canonical pipeline."* Re: *"installContext/checkStatus never seed block-schema migration declarations from the catalog for any schema on a fresh install"* — reproduced as a fresh `.context` landing `session-notes`/`research` schemas with no migration decls and `context-validate` returning 1 error.
- **Fix-status (live code):** `packages/pi-context/src/context.ts:1007,1099` call only `seedCatalogConfigMigrationDecls` (which filters catalog migrations to `schemaName==="config"`). **No block-schema seeding function exists** (`grep seedCatalogBlockMigration…` → none). FGAP-140 `identified`. Note: the *update-time* sibling FGAP-141 **was** fixed/closed (TASK-122, commits `3c8cc328/38468618/ad5fd025`, VER-099) — but the fresh-install variant David wanted fixed is not.
- **Verdict: still-broken.**

### E. pi-workflows advertises ~34 `${{ }}` filters; registry implements 10 (FGAP-131, P2) — STILL BROKEN
- **Break (David-tasked eval, 2026-07-08T02:58:02Z):** *"pi-workflows expression filters are drastically misdocumented."*
- **Fix-status (live code + docs):** `packages/pi-workflows/src/expression.ts:10` `FILTERS` registers exactly **10** — `duration, currency, json, length, keys, filter, last, first, slugify, shell`. `packages/pi-workflows/README.md:104` still advertises **34** — `length, keys, filter, json, upper, lower, trim, default, first, last, join, split, replace, includes, map, sum, min, max, sort, unique, flatten, zip, group_by, count_by, chunk, pick, omit, entries, from_entries, merge, values, not, and, or`. Most advertised names (`upper, lower, trim, default, join, split, map, sum…`) are **not implemented**. FGAP-131 `identified`.
- **Verdict: still-broken.** Documentation promises filters that will throw at runtime.

### F. 8 of 15 bundled pi-workflows specs invalid under `validateWorkflow` (FGAP-132, P2) — STILL BROKEN
- **Break (same 2026-07-08 eval David commissioned):** a real `validateWorkflow` run yielded 8 invalid specs (`analyze-existing-project, create-phase, do-gap, fix-audit, gap-to-phase, init-new-project, pausable-analysis, resumable-analysis`).
- **Fix-status:** FGAP-132 `identified`; no lockstep/closure commit references it in the window log.
- **Verdict: still-broken** (verified by unfixed status; I did not re-run the validator).

### G. Install does not copy/materialize agents into the consuming project (TASK-119, planned) — NOT DONE
- **Break (David, 2026-07-11T00:11:10Z):** *"i want it to copy agents. not providing agents that can be edited and changed in the project wanting to use agents is nearly the definition of terrible ux."*
- **Fix-status (substrate):** `TASK-119` = `planned` (filed `e5a8acca`, "install-time agent materialization"). The jit loader project-tier gap FGAP-127 was closed (TASK-103), but the install-time *copy* David asked for is unimplemented.
- **Verdict: still-broken** (UX defect David asserted; work not started).

### Secondary / weaker-anchored (real, unfixed, but established more by agent probe than David's verbatim)
- **FGAP-102 (P1, `identified`)** — packaged catalog `samples/conception.json` drifts below live `.context/config.json` across propagated registries. Real and unfixed, but anchored to the 2026-07-02 npx probes, not a David verbatim break.
- **issue-002 (`open`)** layer-plans schema nests id-bearing arrays; **issue-010 (`open`)** active `.context` is the dev substrate not a clean baseline; **issue-011 (`open`)** workflows `ctrl+j` shadows pi's built-in newline. All `open`/unfixed; none traced to a David verbatim statement in the window, so listed for completeness, not asserted as David-established.

---

## Verified FIXED (established broken earlier in the window; fix confirmed landed — listed so nothing is silently dropped)

- **Invisible control-character in 2 source lines** (David 2026-07-02T07:25:37Z *"fix it immediately"*) → `grep -P '[\x00-\x08\x0e-\x1f\x7f]' packages/*/src scripts` returns **nothing**. Fixed.
- **`config.json.schema_version` stuck at 1.0.0 vs a recorded 1.0.0→1.7.0 migration** (David 2026-07-02T07:51:21Z *"clearly a problem"*) → `.context/config.json` now `1.8.0`, converged; FGAP-105 closed. Fixed.
- **framework-gaps block unreadable — "must NOT have additional properties" on evidence items** (David repro 2026-07-07T02:34:34Z) → migration idx17 (`framework-gaps 1.1.1→1.2.0`, `migrate-strip-content-pin`, 2026-07-09) strips `content_pin`; **0** evidence items retain it and the schema's `additionalProperties:false` set (`file/lines/reference`) now matches the data. Fixed.
- **`context check-status` throws on `migrations.json` validation** (David repro 2026-07-09T02:09:00–02:10:08Z, `/migrations/17/…must have required property`) → current `samples/migrations.json` validates **VALID** against `schemas/migrations.schema.json`; was the stale-in-memory-schema session artifact, not a persistent code break. Resolved.
- **Agent dispatch/validation loaders omit the package builtin agents directory** (David 2026-07-07 *"i want that fixed now"*) → FGAP-127 closed; TASK-103 ("wire bundled builtin agents tier into pi-agent-dispatch loaders") completed. Fixed.
- **Shipped CHANGELOG/docblock claims bundled specs "dispatchable out of the box" (false)** (David 2026-07-07) → FGAP-129/FGAP-130 closed; TASK-104 ("bundled specs dispatch end-to-end") completed. Fixed.
- **No roadmaps / roadmap block-kind unregistered** (David 2026-07-02 *"we have no roadmaps?"*) → FGAP-042 closed; `roadmap-view`/`roadmap-validate` subcommands present; FGAP-133 (false `complete`) closed. Fixed.
- **Globally-installed operator lags dev after release** (David 2026-07-05) → FGAP-118 closed (re-promote step added). Fixed.

---

## 3. EMERGENT CATEGORIES (kinds of unfixed breakage that recurred)

1. **Surface-parity holes** — a capability exists as a CLI op / registry entry but is unreachable from the human `/context` slash surface or from non-interactive contexts (FGAP-135; FGAP-126's pi-only gated tools). The parity check itself doesn't cover the human surface.
2. **Doc-vs-implementation drift that fails at runtime** — advertised filters (FGAP-131) and bundled specs (FGAP-132) that the code will reject; consumers hit a wall only when they run it.
3. **Contract-implements-only-a-demo-subset** — a v1 schema contract (work-orders, FEAT-014/FGAP-125/128) whose engine honors a fraction of the declared semantics.
4. **Install/lifecycle bookkeeping gaps** — fresh-install paths that skip migration-declaration seeding (FGAP-140) and status enums missing a needed value (FGAP-103, `paused`); the update-time twin gets fixed while the install-time twin lingers.
5. **Fix filed-and-corrected but not closed** — several gaps had their *proposed_resolution* corrected in-window (FGAP-125/126) and a task filed, yet the gap remains `identified` and the feature `in-progress`: filing ≠ fixed, exactly the pattern the objective warned to treat as unfixed.
