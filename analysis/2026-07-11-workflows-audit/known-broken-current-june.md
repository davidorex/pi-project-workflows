---
audit_group: known-broken-current
description: workflows known-broken, June window
source_agent: a72028c2a0b173688
extracted_from: /private/tmp/claude-501/-Users-david-Projects-harness-monitor-training/4a529474-bea7-419f-8f8c-bdcdb0aaeb54/tasks/a72028c2a0b173688.output
verbatim: true
---

I now have a complete, verified picture. Let me compile the findings.

---

## 1. COVERAGE

**Method.** Scoped to `project_path LIKE '%workflowsPiExtension%'` (main + 11 worktrees), window `2026-05-31T16:00Z → 2026-06-30T16:00Z` (Asia/Shanghai June). 7 sessions, 2,253 David top-level text messages, 1,357 tool errors. Two anchors, per mandate:
- **David's voice**: FTS over his `type=user`, `block_type=text`, non-meta, non-sidechain messages for natural brokenness assertions (his phrasings, not keyword-hunting tool output). Read each hit in context.
- **Verified reproductions**: `tool_executions.is_error=1`, ranked by output size; plus the largest assistant/tool blocks where a break was demonstrated.
- **Fix-status oracle**: live code at `/Users/david/Projects/workflowsPiExtension` (Read/Grep) + substrate `.context/` (`issues.json` 12 items, `framework-gaps.json` 141 gaps, `verification.json` 99 records, `tasks.json`), files current as of Jul 11 21:47. Rule applied: `status=identified`/`open` = NOT fixed; `closed`/`resolved` counted as fixed only where a VER-record or `resolved_by` was present.

**Not covered.** Full read of all 2,253 messages (sampled via voice-FTS). Non-`is_error` silent-wrong-output reproductions beyond what David flagged. Sidechain/subagent internal transcripts except where surfaced to David. The current state is ~3 weeks later than the window, so most June breaks were fixed; I report the still-broken set and list the fixed-later ones as closed.

---

## 2. KNOWN-BROKEN-NOT-FIXED (ranked)

**#1 — Write-time edge guard accepts dangling / cross-alias / cycle-closing endpoints (FGAP-093)**
- Break (David, `2026-06-14T05:54:37Z`): *"the validator doesn't reject a kind-violating edge whose offending endpoint doesn't exist; validateContext still catches it post-hoc."* Filed same day as FGAP-093 (`created_at 2026-06-14T07:17:10Z`, `created_by human/davidryan@gmail.com`).
- Fix-status: `framework-gaps.json` FGAP-093 **`status: "identified"`, `closed_by: null`** (current file). Title verbatim: *"…endpoint-existence and cycle remain validate-only — so a write-accepted edge is not always validate-clean."* TASK-062 (`completed`) added the kind/category validator only.
- Verdict: **still-broken.** The kind-validator shipped; the dangling/cycle endpoint half David named is still validate-only, never closed.

**#2 — Config repair impossible once stored config is invalid (validate-before-mutate) (FGAP-096)**
- Break (David, `2026-06-18T21:40:48Z`, filing a 3-part config-schema gap): *"2. Validate-before-repair deadlock (can't fix an already-invalid config via CLI)."* Filed as FGAP-096 (`created_at 2026-06-19`, `created_by human/davidryan@gmail.com`).
- Fix-status: FGAP-096 **`status: "identified"`**. Impact verbatim: *"…there is no sanctioned CLI path back to validity — the only recourse is the forbidden direct-edit of .context/co[nfig]."* (Its two siblings from the same filing are fixed: FGAP-095 load-time migration → closed TASK-070/VER-060; FGAP-097 expand-contract → closed TASK-072/VER-064.)
- Verdict: **still-broken.** One of the three June config-schema gaps remains open; the deadlock persists.

**#3 — No op materializes a newly-declared block's data file into an installed substrate (FGAP-065)**
- Break (David-filed, `created_at 2026-06-08`, `created_by human/davidryan@gmail.com`): *"a dangling block_kind declaration."*
- Fix-status: FGAP-065 **`status: "identified"`**. Impact verbatim: *"Any catalog-added block kind silently bricks the bootstrap signal of every pre-existing substrate: context-bootstrap-state reports not-installed though the substrate is fully usable…"* (Related July residual FGAP-140, also identified, is out of window.)
- Verdict: **still-broken.** False `not-installed` bootstrap signal, unclosed.

**#4 — layer-plans schema nests id-bearing arrays instead of top-level entities + edges (issue-002)**
- Break (verified reproduction, continuous): `findNestedIdBearingArrays` flags `["plans.layers","plans.migration_phases"]` on every scan; present in the "golden 58/53/5 with exactly 2 layer-plans warnings" baseline from `2026-05-31T21:48:03Z` onward through June.
- Fix-status: `issues.json` issue-002 **`status: "open"`**. Title verbatim: *"layer-plans schema nests id-bearing arrays (plans.layers, plans.migration_phases) instead of top-level entities + membership edges."* Current `packages/pi-context` still ships the nesting (scanner sole-hit unchanged).
- Verdict: **still-broken.** Deliberately-tolerated known warning, never restructured. (Source=agent, not David-verbatim; qualifies as verified reproduction.)

**Borderline / lower-confidence (state & governance, not code-throw breaks):**
- **FGAP-052** (David-filed `2026-06-07`, `identified`): *"No convention governs substrate bootstrap-state provisioning + substrate-identity reconciliation."* Governance gap, not a runtime break. Unfixed.
- **issue-010** (`open`, source human): *"Active .context is the pi-context dev substrate, not a clean baseline for the operation-framework port."* A project-state condition, not a code defect. Unfixed.
- **issue-011** (`open`): chord `ctrl+j`/`ctrl+h` shadows pi built-ins. **Cannot confirm June establishment** — FTS for `ctrl+j`/`newLine`/`Backspace` across ALL sessions returned only March spec docs, no June discussion; likely filed later. Excluded from the June set on provenance grounds; flagged for completeness.

---

## 3. EMERGENT CATEGORIES (recurring kinds of unfixed breakage)

1. **Write-time vs. validate-time asymmetry.** The dominant class: a write is accepted but is not validate-clean, so the corruption is caught only post-hoc (FGAP-093 dangling/cycle edges; issue-002 nested-id schema). The write gate systematically trails the validator.
2. **No recovery path once state is already invalid.** Deadlocks where the only CLI mutation route requires pre-existing validity (FGAP-096 config validate-before-repair; the July-filed FGAP-106/FGAP-126/FGAP-140 are the same family, out of window).
3. **Silent false status signals.** Catalog/bootstrap drift that reports a usable substrate as `not-installed` (FGAP-065) — breakage that lies rather than throws, which is why these survive: nothing fails loudly.

**Fixed-later (June breaks confirmed closed, so excluded from the set):** verifyDupe pointer-restore defect (David `2026-06-01T22:48`: *"we shouldn't leave this: That's a discovered defect in the shared verifyDupe harness"* → current `scripts/migration/verify-substrate-dupe.ts:22-29,37` captures prior bytes verbatim and losslessly restores in `finally`); issue-001/DEFECT-3 migrations.json stray-decl (resolved); FGAP-003 switch-register (closed); context-validate per-item diagnostic, David `2026-06-09` (FGAP-077/FGAP-114 closed); block `schema_version` inert-safety, David `2026-06-19` (FGAP-099 closed TASK-073/VER-063); resolver-dispatch/headless auth-gate, David `2026-06-08` (FGAP-068 closed; residual auth-gate re-filed July as FGAP-126); TASK-069 defective criteria/branch, David `2026-06-19` (completed); Cycle-9.3 `findNestedIdBearingArrays` RangeError stack-overflow, verified `2026-05-31T21:51` (fixed same session, 937/937). The recurring `Exit code 1` biome/tsc/test failures across June are in-development iteration noise, not established persistent breaks.
