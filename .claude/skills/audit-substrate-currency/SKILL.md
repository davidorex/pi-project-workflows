---
name: audit-substrate-currency
description: Audit the active pi-context substrate for currency — stored-vs-derived status divergence, fired stale-conditions, lagging feature/gap buckets, stale filing text — and enact user-granted corrections. Use when asked to confirm substrate currency or accuracy, run a currency audit, check for stale statuses, or reconcile substrate state with shipped reality.
argument-hint: [scope]
allowed-tools: Bash(pi-context *)
---

<objective>
Verify that every stored fact in the active substrate matches derivable/current truth, report the deltas with per-item evidence, and — only after explicit user grants — enact the corrections through the sanctioned write ops. The audit is read-only; every correction stops for a provenance grant. Derived state is never asserted from memory: every claim comes from an op read executed in this run.
</objective>

<quick_start>
Run the audit as the numbered sequence below, in order, no steps skipped. Steps 1–5 are reads; step 6 is the findings report; step 7 stops for grants; steps 8–9 enact and close. `$ARGUMENTS` (optional) narrows scope to one block or theme (e.g. `research`, `features`); with no argument, audit everything.

1. **Derived-surface verdicts** — run each, record the verdict:
   - `pi-context context-check-status --json` (catalog sync; expect all in-sync)
   - `pi-context context-validate --json` (invariant sweep; `warnings` with only the known pre-existing advisory backlog is the healthy steady state — see references/currency-heuristics.md for the baseline; any ERROR or NEW warning is a finding)
   - `pi-context context-validate-relations --json` (expect clean)
   - `pi-context context-roadmap-validate --json` (expect clean; isolated-milestone INFO is a design fact)
   - `pi-context context-current-state --json` (keep the full output — steps 2 and 3 read from it)
2. **Stored-vs-derived cross-check** (the split-brain class, FGAP-116): in the current-state output, compare `milestones[]` derived statuses against every milestone id appearing in `blocked[].blockedBy` — a milestone derived `reached` that still blocks tasks is a finding. Compare `focus` against the actually-active arc (a stored in-progress phase from a paused arc is a finding; check whether FGAP-103/issue-010 already track it before treating it as new).
3. **Bucket-lag sweep**: every `task-completed-gap-closed` / `task-completed-feature-complete` / `task-completed-issue-resolved` warning from step 1 names a candidate. For each, read the addressed item (`pi-context read-block-item --block <block> --id <id> --json`) and its addressing tasks' filed text, then classify per references/currency-heuristics.md: **honest-partial** (the task's own text declares partial addressing — not a finding) vs **lagging bucket** (criteria/legs shipped but status unchanged — finding, with the true bucket named).
4. **Staleness sweep** (research): enumerate `complete` research items (`pi-context context-lens-view` has no research lens — page with `pi-context read-block-page --block research --offset N --limit 4 --format table`, then targeted `read-block-item` per candidate; full-block reads will hit the 50KB cap, a known friction tracked as FGAP-117). For each `complete` item, judge every `stale_conditions[]` entry: **fired** (the condition's subject shipped/changed — verify by reading the cited item or code, never from memory) → the item is a finding (`status` should be `stale`).
5. **Filing-text spot check**: for each gap whose addressing task completed (step 3's list), read the gap's title/description against what shipped — text that overstates the remaining problem is a finding (narrow it to the true residual, preserving all load-bearing content and register).
6. **Findings report**: a table — finding, evidence (op output / file:line), proposed correction, and provenance class per element (user-VERBATIM / user-DIRECTED / DERIVABLE-with-citation; anything else does not go in). Distinguish corrections (status/priority/text updates) from new filings (untracked classes need a prior-art search first: `pi-context filter-block-items --block framework-gaps --field title --op matches --value @/tmp/pattern.json` — put regexes containing `|` in a file, the shell hook rejects them inline).
7. **STOP for grants.** Present the table; file and write NOTHING until the user grants. Never author a milestone's status (it is derived — `reached` is a pure phase rollup; writing it is a canon violation).
8. **Enact granted corrections** — one op per write, `--writer '{"kind":"human","user":"<user-email>"}' --json` with the `# provenance-reviewed` sentinel, payloads via `--updates @/tmp/<file>.json` when quote-heavy; read every write back through the op's own read before claiming it landed.
9. **Close**: `pi-context context-validate --json` (warnings-only, no new issues), then commit `.context` with a forensic message enumerating each granted write.
</quick_start>

<success_criteria>
- Every claim in the findings report traces to an op read executed in this run (no recalled state).
- Honest-partial items are NOT flagged as stale; derived-status fields are NOT authored.
- All granted writes are read back and `context-validate` shows no new issues.
- The `.context` delta is committed; ungranted findings remain in the report, not silently dropped.
</success_criteria>

<advanced>
Judgment rules, the known-warnings baseline, and worked classifications from the 2026-07-05 audit: [references/currency-heuristics.md](references/currency-heuristics.md). Architectural context (why these classes exist and the planned in-engine foreclosure): `analysis/2026-07-05-currency-foreclosure-shape.md`.
</advanced>
