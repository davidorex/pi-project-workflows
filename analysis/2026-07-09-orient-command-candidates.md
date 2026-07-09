# /orient command candidate set — empirical survey

Date: 2026-07-09
Author: investigation agent (read-only)
Scope: establish the ACTUALLY-OBSERVED candidate set of shell commands injectable at expansion time into a project `/orient` session-start skill for this repo. Every row is backed by a real run against the live active substrate. No writes were made.

## Measurement blocker (recorded first, because it shapes the byte column)

Exact byte counts of `pi-context` op stdout could NOT be measured. The repo's own PreToolUse hook `.claude/hooks/block-pi-context-glue.sh` blocks BOTH:
- redirecting op stdout to a file (`pi-context <op> … > /tmp/x`) — verbatim block message: "do not redirect pi-context CLI stdout to a file … that bypasses direct inline consumption and suppresses the friction signal"
- any pipe/`wc`/`$?`/echo glue wrapping the op.

So pi-context byte sizes below are ESTIMATES from the inline-rendered output (character span of the JSON), not `wc -c` measurements. The one exception: `filter-block-items` self-reports `totalBytes` inside its own JSON envelope (a measured value). git byte counts ARE measured (git is not pi-context; pipes are allowed). This blocker is itself an orient-relevant finding: a skill that injects pi-context output cannot self-measure its own context cost through the sanctioned surface.

## Active substrate identity (with evidence)

- `.pi-context.json` `contextDir` field = `.context` (read directly; the active-substrate pointer). `previous_contextDir` = `.context-jit-spec-v2`, last switched 2026-06-04 by human:davidryan@gmail.com.
- Confirmed by op: `pi-context context-bootstrap-state` → `{"state":"ready","contextDir":"/Users/david/Projects/workflowsPiExtension/.context","missing":{"schemas":[],"blocks":[]}}` — resolves the pointer to an absolute path and reports install state `ready` (no missing schemas/blocks).

The active substrate is `.context`. All ops below ran against it.

## Candidate table

Legend: exit = observed exit code; bytes ≈ estimated stdout size (see blocker) except git rows (measured) and filter rows (`totalBytes`); det? = byte-identical across two runs; priced? = orientation-priced (a bounded slice) vs prohibitive (a dump / grows with substrate size).

| # | command | exit | bytes | stderr? | det? | priced? |
|---|---------|------|-------|---------|------|---------|
| 1 | `pi-context context-bootstrap-state` | 0 | ~140 (tiny) | no | n/a (single run; deterministic by shape) | YES — install-state one-liner + absolute contextDir |
| 2 | `pi-context context-current-state` | 0 | ~2700 (medium) | no | YES (two runs byte-identical) | YES (borderline) — focus + inFlight + nextActions(15) + blocked(12) + milestones(9); grows with open-work count |
| 3 | `pi-context context-status` | 0 | ~4200 (large) | no | not re-run; contains volatile `testCount`/`sourceLines` so NOT byte-stable | MARGINAL — full per-block census (21 blocks, every status bucket); a dump, not a focus slice |
| 4 | `pi-context context-validate` | 0 | ~11000 (large) | no | not re-run | PROHIBITIVE — 34 warnings enumerated in full; UNBOUNDED, grows one entry per decision/task added |
| 5 | `pi-context context-validate-relations` | 0 | ~40 (tiny, when clean) | no | n/a | YES — `{"status":"clean","issues":[]}`; but the issues array is unbounded when NOT clean |
| 6 | `pi-context context-check-status` | 0 | ~2600 (medium) | no | not re-run | MARGINAL — per-schema drift for 17 installed schemas; bounded by schema count (~stable), orient-relevant only for "is my schema model current" |
| 7 | `git status --short --branch` | 0 | 21 (measured) | no | n/a | YES — branch + ahead/behind + dirty files; scales only with uncommitted changes |
| 8 | `git log --oneline -10` | 0 | 1064 (measured) | no | n/a (append-only) | YES — bounded by the `-N` you pass; `-5` = 538 bytes |

### Why the other read ops are NOT orient candidates
From `pi-context --help` "Read & query" plus `packages/pi-context/src/ops-registry.ts`, every remaining read op is a DRILL-DOWN or QUERY that needs an argument (a block name, id, lens, path, predicate) and/or dumps a whole block — none is a zero-argument session-orientation slice:
- Whole-block / whole-config dumps (unbounded, need a target): `read-block`, `read-block-page`, `read-block-item`, `read-config`, `read-schema`, `read-catalog-schema`, `read-samples-catalog`, `read-block-dir`.
- Query ops (need a predicate/id/lens): `filter-block-items`, `join-blocks`, `find-references`, `resolve-item-by-id`, `resolve-items-by-id`, `context-lens-view`, `context-edges-for-lens`, `context-walk-descendants`, `walk-ancestors`, `gather-execution-context`, `validate-block-items`.
- Roadmap ops (`context-roadmap-load`/`-render`/`-validate`) render a milestone view — heavier than orientation needs; candidate only for a "roadmap" drill-down, not the session-start slice.

### Non-candidates by construction: every write / lifecycle / schema-mutation op
A write op is never an orient candidate. From the registry, the WRITE surface (all excluded): `append-block-item`, `append-block-nested-item`, `update-block-item`, `update-block-nested-item`, `remove-block-item`, `remove-block-nested-item`, `upsert-block-item`, `write-block`, `append-relation(s)`, `remove-relation`, `replace-relation`, `amend-config`, `write-schema`, `write-schema-migration`, `rename-canonical-id`, `resolve-blocked`, `resolve-conflict`, `update`, `context-reconcile`, `context-init`, `context-install`, `context-accept-all`, `context-archive`, `context-switch`, `complete-task`, `promote-item`, `pi-bound`. (`context-list` is read-only but lists switchable dirs — a substrate-management concern, not session orientation.)

## Full observed outputs appendix

### 1. `pi-context context-bootstrap-state` (exit 0)
```json
{"state":"ready","contextDir":"/Users/david/Projects/workflowsPiExtension/.context","missing":{"schemas":[],"blocks":[]}}
```

### 2. `pi-context context-current-state` (exit 0; ran twice, byte-identical)
Focus = `in-flight: TASK-093` (single in-flight task, described: move hook registrations into tracked settings.json + populate mandates.jsonl; FEAT-013). nextActions = 14 unblocked planned tasks (TASK-021/022/041/044/054/056/057/058/068/074/090/091/100/101) + issue-012 (critical open issue). blocked = 12 tasks (TASK-003/004/005/047/055/067/071/095/096/097/098/099) with their blockedBy ids. milestones = MILE-001..009 (MILE-003 reached; the other 8 planned). This is the closest thing to a single "where are we / what's next" answer, but it does NOT echo which substrate it read, nor install state, nor integrity, nor git tree.

### 3. `pi-context context-status` (exit 0)
Source metrics: `testCount:2547, sourceFiles:112, sourceLines:38811, lastCommit:"cac02b9a"` + `recentCommits[5]` + full `blockSummaries` for 21 blocks (config: 18 block_kinds / 44 relation_types / 8 lenses / 17 installed_schemas / 13 invariants; framework-gaps: 135 total = 75 closed / 55 identified / 4 accepted / 1 superseded; tasks: 106 = 77 completed / 26 planned / 2 cancelled / 1 in-progress; features: 14 = 5 complete / 5 in-progress / 4 proposed; verification: 84 = 81 passed / 3 partial; research: 30 = 21 stale / 9 complete; decisions: 23 enacted; issues: 12 = 8 resolved / 4 open; milestone: 9; phase: 13 = current 2; story: 14 complete; …). `hasHandoff:false`. NOTE: `testCount`/`sourceLines` make this NOT byte-stable session-to-session even with an unchanged substrate.

### 4. `pi-context context-validate` (exit 0)
`{"status":"warnings", "issues":[…34…]}` — 17× `DEC-000N shows no derivation basis` (code `decision-shows-derivation`, warning), 3× `Completed task addresses a gap that is not closed` (TASK-064/065/075), 12× `Completed task addresses a feature that is not complete` (TASK-020/070/072/073/084/085/086/087/088/089/094/102), 2× `nested id-bearing array 'plans.layers' / 'plans.migration_phases'` (layer-plans, Phase H). Each entry carries `severity/message/block/field/code`. The list grows one entry per new decision-without-derivation or completed-task-ahead-of-its-parent — unbounded in substrate size.

### 5. `pi-context context-validate-relations` (exit 0)
```json
{"status":"clean","issues":[]}
```

### 6. `pi-context context-check-status` (exit 0)
`summary: {in-sync:15, both-diverged:2, catalog-ahead:0, locally-modified:0, no-baseline:0, missing-catalog:0, missing-installed:0, total:17}`. The 2 both-diverged (behind): `framework-gaps` baseline 1.1.1 → catalog 1.2.0; `research` baseline 1.0.1 → catalog 1.1.0. `perAsset[17]` each with name/state/baseline_version/catalog_version/installed_modified.

### 7. `git status --short --branch` (exit 0, 21 bytes)
```
## main...origin/main
```
(clean tree, on main, level with origin.)

### 8. `git log --oneline -10` (exit 0, 1064 bytes; `-5` = 538 bytes)
Top: `cac02b9a substrate: correct FGAP-135 + op-command-surface-parity …` then cc3ed232, 370f727e, bfe5fe7f, e3010a3e, f330a523, 73b19bca, 6454e221, 1d5052a4, db4fa111.

## Gaps — orientation questions with no single clean read op

1. **No composed "orientation slice" op.** Reconstructing "where are we / what's next" requires composing at minimum `context-bootstrap-state` (identity + install) + `context-current-state` (focus/next/blocked) + `context-validate-relations` (integrity) + `git status`/`git log` (tree + history). No single op returns that union. An `/orient` skill must fan out across ≥4 commands.
2. **`context-current-state` omits substrate identity.** It never echoes which `contextDir` it read. Identity comes only from `context-bootstrap-state` (or reading `.pi-context.json`). A session that runs current-state alone cannot tell which substrate answered.
3. **No terse integrity summary.** `context-validate` is the only cross-block integrity op and it ALWAYS enumerates every issue in full (34 today, unbounded). There is no `--summary`/count-only mode. `context-validate-relations` returns a clean summary but covers only relations, not the decision/task/nested-array warning classes. A fresh session wanting "is integrity OK, yes/no + counts" must ingest the full ~11KB list.
4. **No build/dist-freshness op.** CLAUDE.md states pi loads `dist/`, not source, so "is the build current?" is a genuine session-start question. NO pi-context op reports whether `dist/` is stale vs `src/`. `context-status` gives `sourceFiles`/`sourceLines`/`lastCommit` (source-derived), nothing about dist freshness. A fresh session would have to `stat` dist vs src or rebuild — outside the op surface entirely.
5. **`context-status` conflates census with orientation.** The one op that gives a whole-substrate picture is a ~4KB dump of every block's counts and is not byte-stable (embeds live test/source metrics). It answers "how big is everything" more than "what do I do next," so it is a marginal fit for a minimum-context orient.

## Existing orientation surface (what a new /orient would sit beside)

Under `.claude/`:
- `.claude/commands/audit-context-currency.md` — a slash command; dispatches the read-only `context-currency-auditor` subagent for a forensic currency/completeness audit. Loop-friendly. Detection-only. NOT a lightweight session-start orient (it spawns an agent and is heavier).
- `.claude/skills/repo-guide/SKILL.md` — static structural guide (three packages, ownership, versioning, publish). Closest in spirit but it is fixed documentation, NOT derived live state.
- `.claude/skills/run-pi-project-workflows/SKILL.md` — build/run/smoke-test driver.
- `.claude/skills/release/SKILL.md` — release ceremony (held).
- `.claude/skills/audit-substrate-currency/SKILL.md` — currency audit WITH grant-gated corrections (the enact counterpart of the audit command).

Also `packages/pi-context/skills/pi-context/SKILL.md` — the generated tool/op reference (build artifact).

None of these is a session-start "where are we / what's next" orientation skill that runs the derive-don't-cache ops. `repo-guide` is static; the two audit surfaces are heavier forensic/corrective flows. A new `/orient` would NOT duplicate any of them, though it should point at `repo-guide` for structure and defer deep integrity work to the audit surfaces rather than reimplementing them.

## Prior-art verdict

The active `.context` substrate does NOT track a session-orientation skill/command for this repo. Searches run (via `filter-block-items`, the sanctioned read op; JS-RegExp `matches`, no inline `(?i)` support so character-class casing used):
- `framework-gaps` title & description for `[Oo]rient|[Ss]ession.?start|orientation skill` → the only hits are FGAP-113 and FGAP-121, both about EDGE orientation (closure-table parent/child direction), unrelated to session orientation.
- `tasks` description for `[Ss]ession.?start|/orient|orientation skill` → 0.
- `features` description for `[Ss]ession.?start|/orient|orientation` → 0; `features` title for `[Ss]kill|[Oo]rient|[Ss]ession` → only FEAT-005 (`pi-context pi-bound`), unrelated.
- `decisions` decision-text for `[Ss]ession.?start|/orient|orientation skill|SessionStart` → 0.

Verdict: no existing FGAP/TASK/DEC/feature covers a session-orientation `/orient` skill. A new filing would be justified (subject to the standard explore-before-file confirmation), and the "orient" term collides with the substrate's existing edge-orientation vocabulary — any filing should disambiguate (e.g. "session-orientation" / "session-start") to avoid false prior-art matches.
