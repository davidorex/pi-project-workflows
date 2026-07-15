# Session dangling-work audit — d3030496-e4e1-4bfa-8df1-1df86bac518a (re-audit at 2624d2c7)

**Coverage:** this REPLACES the 2026-07-12 report (closure-checked then at `4e3619b3`); the session has since CONTINUED — record now spans 2026-07-09T22:37Z → 2026-07-14T00:42Z (32,371 messages). All user-channel non-sidechain text messages read verbatim in full across the whole span (259 pre-22:15Z Jul 11 re-read; 90 new after it), including the 3rd/4th compaction boundaries (2026-07-13T05:28Z summary; session tail = /doctor cleanup ending 2026-07-14T00:42Z). The prior report used only as a thread map — every load-bearing claim re-verified freshly against the substrate (bare `pi-context` ops: filter-block-items / read-block-item / find-references / context-status / context-validate), git at HEAD `2624d2c7` (pinned; confirmed == origin/main, tree clean), the filesystem, greps of current source, the committed analyses, and the session scratchpad, on 2026-07-14. Not exhaustively read: the ~30k-message assistant/sidechain interior outside the structural slices (wave dispatch/audit notifications, the /doctor exchange, ExitPlanMode plans); npm gates NOT run (subagent constraint) — no finding below rests on an unexecuted runtime claim. Timestamps UTC; add 8h for local.

**Headline:** the prior report's engineering backlog is almost entirely closed — the 2026-07-12→13 waves implemented A1–A5 and B1–B4 (TASK-126–138, all `completed`; FGAP-139/140/143/144/145/146/147/148/151 + FGAP-093 all `closed`, verified by live reads). What now dangles is concentrated at the END of the new span: owed feature-status flips, four investigated-but-unfiled gap payloads sitting in ephemeral tmp, decision-status lags, an unfiled planning-vocabulary carrier class, and the recurring html-views staleness.

---

## Group W — new-span danglers (2026-07-11T22:15Z → 2026-07-14T00:42Z)

### W1 — FEAT-011 + FEAT-014 stored buckets lag their evaluated-complete state; flips never landed
- **Evidence:** user operational policy, d3030496 2026-07-12T23:39:46Z: "My operational goal is: substrate is and remains current; new substrate filings meet rhetorical and truth-state requirements; and that valid project compliant implementations close gaps issues tasks phases and milestones." Fresh criterion-by-criterion evaluation (scratchpad `wave3/feat-evaluation.md`, agent return 2026-07-13T09:25:09Z): "FEAT-011 | in-progress | **complete** | 9/9 MET" and "FEAT-014 | in-progress | **complete** | 6/6 MET"; "Stored bucket `in-progress` lags; honest bucket is `complete`."
- **Current state:** `pi-context filter-block-items --block features --field id --op in --value '["FEAT-011","FEAT-014"]'` → both `status: in-progress`. `pi-context context-validate` emits 22 `task-completed-feature-complete` warnings including every FEAT-011 task (TASK-084–091, 090, 137) and FEAT-014 task (TASK-103/118/119/123/124/136). The flip was blocked live during the wave-3 closure cascade by the rhetorical-grandfather gate — that blockage was investigated and filed as FGAP-152 (`identified`, P2; commit `6a622d15`), whose own investigation records the working control: "amend-plus-flip in one write succeeds". No later user statement retires the features.
- **Verdict:** still-open.
- **Dispatch:** flip both features to `complete` via `update-block-item` (amend-plus-flip in one write where the gate refuses a bare flip, or land FGAP-152's value-grain fix first); surface the evaluation's three judgment flags to the user at the same time (FEAT-011 criterion 2's best-effort converge caveat; FEAT-014 criterion 4's policy-as-task/gap-records form; criterion 2's `completed-pending-commit`-as-pass reading). Done = features read `complete`; the 22 warnings clear; flags answered.

### W2 — four investigated gap candidates, verdict "file-new", never filed; payloads in ephemeral tmp
- **Evidence:** agent return 2026-07-13T09:30:17Z: "Complete. Nothing was filed; payloads only. **Report:** `analysis/2026-07-13-wave3-residual-filings.md`". The committed report (HEAD `2624d2c7`) verdicts all four **file-new**: (1) dryRun preview-optimism residual set (3 instances; FGAP-148's own description anticipates them "tracked as their own filing" — a filing that does not yet exist); (2) op-layer silent unknown-param acceptance ("`dryrun` for `dryRun` on any mutation op runs the LIVE write the caller meant to preview"); (3) glue-guard shell-grammar under-block R1+R2; (4) prompt-field spec-dialect divergence (inline-task specs hard-throw as workflow steps; object `inline` silently dropped by both parsers). User frame for the disposition program, 2026-07-12T11:14:00Z: "We are literally cleaning all up the deferred and abandoned yet raised known work." The user's 2026-07-13T09:32:17Z "That's an insane mismanagement of judgment and cost." addressed the spend, not the verdicts; no later statement retires the filings.
- **Current state:** fresh sweeps (`filter-block-items --block framework-gaps --field title --op matches` on `preview|dry-run|dryRun` and `param|prompt|dialect|glue|boundary|unknown`) find no covering item; highest gap id is FGAP-152 (the status-flip gap, different content). The four payload JSONs exist ONLY at `/private/tmp/claude-501/-Users-david-Projects-workflowsPiExtension/d3030496-e4e1-4bfa-8df1-1df86bac518a/scratchpad/filings/` — volatile tmp, lost on reboot/cleanup.
- **Verdict:** still-open (evaporation risk: the committed analysis preserves the substance, but the ready payloads are ephemeral).
- **Dispatch:** file the four gaps via `append-block-item` with birth `--relations` per the payloads (report §1–4 names the relate-to sets: FGAP-066/148 lineage; FGAP-144 context; FGAP-120/151/147/149/089 family; FGAP-129 class), under the user's filing grant; `context-validate` after. Done = four new FGAPs read back matching the payload content.

### W3 — DEC-0024 / DEC-0025 / DEC-0026 still `open` though their deciding work is completed and closed
- **Evidence:** the decisions' gaps and tasks closed this span: TASK-126 (DEC-0024/FGAP-093), TASK-127 (DEC-0025/FGAP-140), TASK-132 (DEC-0026/FGAP-145) — all `completed` (live read); commit `987f2e4d` "substrate: close TASK-126/127/130 -- FGAP-093, FGAP-140, FGAP-139".
- **Current state:** `filter-block-items --block decisions --field status --op eq --value '"open"'` → exactly DEC-0024, DEC-0025, DEC-0026; the block's other 23 decisions are `enacted` (context-status byStatus). All three gaps read `closed`.
- **Verdict:** still-open (status lag; same currency class as W1 — a bare flip may hit the FGAP-152 gate).
- **Dispatch:** `update-block-item` each to `enacted`; done = decisions byStatus shows `open: 0`, validate clean.

### W4 — planning-cycle vocabulary survives on carriers the closed de-jargon program never reached: shipped schema descriptions + test-file comments
- **Evidence:** user standard, 2026-07-10T01:05:21Z: "…all code in the repo similarly has all opaque jargon removed and comment semantics in code-valid plain english"; and 2026-07-12T11:14:00Z: "It should be clear that 'scope observations' are meaningless and non-thing in this project." FGAP-146 (closed by TASK-129, "converged at zero") filed its facet-1 scope as "~150 comment/JSDoc sites across 23 **non-test** source files" — comments only, non-test only.
- **Current state (fresh greps at HEAD):** (a) SHIPPED SCHEMA DESCRIPTIONS — all 18 `packages/pi-context/samples/schemas/*.json` carry the `oid` description "…(content-addressed substrate identity, Cycle 3)… pre-Cycle-3 items validate…"; `packages/pi-context/schemas/relations.schema.json` lines 6/13/17/28 carry "Cycle 5", "Cycle 8"×3; `packages/pi-context/schemas/config.schema.json:23` carries "Cycle 3 / Cycle 4"; the same string is EMITTED by `scripts/migration/wire-active-substrate.ts:92` and `scripts/migration/lib/land-identity-fields.ts:94` (string literals, not comments — the generated-output carrier, same shape as the closed B4 finding). These descriptions install into every fresh substrate and surface via read-schema/--show-schema. (b) TEST-FILE COMMENTS — `packages/pi-context/src/resolve-ref.test.ts:2` ("Cycle 8 / Phase F2"), `promote-item.test.ts:2,411` ("Cycle 9 / G2", "Cycle 9.1 P6"), `samples-catalog.test.ts:206` ("Cycle 9.2"), `context-sdk.test.ts` (3 hits), `scripts/migration/lib/migrate-content-addressed.test.ts:2` ("Cycle 10 / Phase H1") — 12 pi-context test files matched the family grep in total. Sweep of framework-gaps (`jargon|vocabulary|Cycle|planning`) finds no item covering either carrier; FGAP-136/146 are closed at their filed scopes.
- **Verdict:** partial — the program's filed scopes converged at zero (honestly disclosed in FGAP-146's closed_by); the user-stated class ("all code in the repo") retains these two enumerated carriers, unfiled.
- **Dispatch:** per Experience-Gap Handling + gap-explore-surfaces-class: agent investigation (root cause/shape/repro/prior-art = FGAP-136→146 lineage; note the schema-description carrier is also INSTALLED state — catalog resync/migration implications), then file at class level and implement. Done = shipped schemas/scripts emit plain-English identity descriptions; test-comment sites rewritten; gap filed and closed.

### W5 — CLAUDE.md still names a "hard iteration cap" with no number defined anywhere — flagged by the committed determination, unresolved by the landed fix
- **Evidence:** the committed determination (`analysis/2026-07-13-loop-runaway-policy-determination.md`, §1: "the 'hard iteration cap' is named in CLAUDE.md but **no number exists anywhere** … so the cap was unenforceable"; §4.3 same). Its §3 prescribed a THREE-audit cap; the user REJECTED that mechanism, 2026-07-13T10:29:03Z: "three audit crap would be inane. the only way is that iterate to zero means of the fucking success criteria." — and directed the four-rule criteria anchor (10:57:52Z "Implement these in our policies: …"), which landed as `41902654` (commit message: "The user rejected a numeric audit-count cap; the criteria anchor is the mechanism").
- **Current state:** CLAUDE.md's autonomous-loop paragraph (post-`41902654`) still reads "it is bounded by a hard iteration cap, on hitting which the orchestrator STOPS and escalates per `mandate-008`" — no value on any binding surface (CLAUDE.md, `.claude/mandates.jsonl`, conventions block).
- **Verdict:** still-open — flag for the user: the clause is unenforceable as written; whether to define a value, re-anchor it (e.g. to repeated criteria-falsification), or delete it is a genuine scope/value call, since the numeric-cap mechanism was verbally rejected.

### W6 — session-filed gaps FGAP-149 / FGAP-150 / FGAP-152 are open with no implementing task
- **Evidence:** FGAP-152 filed 2026-07-13T09:16:18Z with full investigation (`analysis/2026-07-13-status-flip-rhetorical-grandfather-gap.md`, commit `6a622d15`); FGAP-149's sibling-evaluation commit `480eff4b`: "pre-walk quote-collapse REJECTED for the commit guard; behavior unchanged, divergence documented"; FGAP-150 filed during wave-3.
- **Current state:** all three `identified` (live read; 149 P3, 150 P3, 152 P2). `find-references --id FGAP-152` shows gap-relates edges + session edge, NO task edge; FGAP-149's only task edge is completed TASK-138, whose commit-guard leg was the documented rejection (context-validate flags it: "Completed task 'TASK-138' addresses a gap that is not closed"); FGAP-152's proposed_resolution (value-grain diff-scoping) is fully specified and its blockage is load-bearing for W1/W3.
- **Verdict:** still-open (tracked, honestly filed — the task-asymmetry is the dangling part; FGAP-152 is the highest-leverage of the three).
- **Dispatch:** file + implement FGAP-152's task first (value-grain diff in `block-api.ts` threading sites :1537/:1658/:1849 per the gap's filed text); FGAP-149 per its proposed_resolution (quote-span tracking in the commit guard's line loop — NOT the rejected pre-walk collapse); FGAP-150 at P3 leisure.

---

## Group C/D — carried forward from the prior report

### C1 — html-views/substrate-overview.html stale against the standing regen instruction (recurred)
- **Evidence:** project CLAUDE.md (binding): "Re-run after any active-substrate `*.json` change to refresh the rendered view."
- **Current state:** last regenerated in `e32b164a` (wave-2 closure); 8 substrate commits follow it (`git log e32b164a..HEAD -- .context/`: 095374ab, 30aae4fe, fd26eec4, 97e4ce14, 6f5e98fb, 7c00918b, 6a622d15, 41902654) — the entire wave-3 closure cascade, FGAP-152, and the policy conventions change are unrendered.
- **Verdict:** still-open (mechanical, chronic — regenerated twice since the prior report and stale again; consider wiring the regen into the substrate-commit path).
- **Dispatch:** `npx tsx scripts/orchestrator/build-html-views.ts`; commit.

### D1 — the `analysis/2026-07-11-workflows-audit/` corpus: committed, consumption explicitly sequenced next
- **Evidence:** user, 2026-07-11T21:46:46Z: "note: i have cp'd a dir of analyses to analysis/ dir"; 2026-07-11T22:14:00Z: "commit the dir and its files then push"; and the NEW sequencing statement, 2026-07-13T01:21:52Z: "we'll approach the audit corpus after we're finished with all the session-audit elements."
- **Current state:** dir present at HEAD (25 files: INDEX.md, atoms, intent-signals batches 0–5, validated subdirs…); no consumption work exists. The prior report's session-audit elements are now closed except W1–W6/C1 above.
- **Verdict:** still-open — the user's own trigger ("after … all the session-audit elements") is nearly satisfied; approaching the corpus is the declared next arc once this report's still-opens clear.

---

## Resolved-since — prior-report atoms verified closed at 2624d2c7 (thread map re-checked by content, not id)

- **A1 TASK-090** (drift surfacing; user 2026-07-11T04:30:27Z "delete task-090-drift-surfacing" had killed the first attempt) — reimplemented via canonical pipeline, merged `b5fadc5c`, task `completed`, FEAT-011 criterion 7 evaluated MET (feat-evaluation §criterion 7, code at `context-sdk.ts:1076-1094`).
- **A2 TASK-119** (user verbatim "i want it to copy agents…" carried in the task description, verified) — `completed`; merge `290ae133` "install ceremony materializes editable agent specs"; FEAT-014 criterion 4 evaluated MET.
- **A3 FGAP-139** (string-array budgets) — `closed` via TASK-130 (`completed`), commit `987f2e4d`.
- **A4 FGAP-140** (install-time migration seeding; user 2026-07-11T11:44:40Z "but this is a gap, no?") — `closed` via TASK-127 + DEC-0025 (decision status lag → W3).
- **A5 FGAP-093 / DEC-0024** — `closed` via TASK-126 (write-time edge guard extension per the decision; decision status lag → W3).
- **B1 context-validate size-refusal friction** (user 2026-07-11T12:44:07Z "…and so you punted and moved on?") — filed as FGAP-144, `closed` via TASK-131 (json over-cap directive + validator narrowing axis, merges `da4c3c61`/`a8229f1d`). Note: filtered READS still refuse over 50KB by design (hit live during this audit); the read-projection class stays open as FGAP-117 (`identified`, P2, pre-existing).
- **B2 validate-vs-read registry divergence** — filed as FGAP-145, `closed` via TASK-132 + DEC-0026 (basis parameter + always-on resolution disclosure, `e169c045`).
- **B3 five tracker-ID comment sites** — TASK-128 `completed`; fresh grep: zero `FGAP-043` in `block-api.ts` / `rhetorical-criteria.ts`.
- **B4 generated commit-message "FEAT-006" jargon** — fresh grep: zero `FEAT-006` in `work-order-loop.ts` (TASK-128/129 span).
- **C2 stale branch `feat/context-currency-precommit-gate`** — `git branch -a` shows only `main`; all session worktree branches also gone.
- **C3 triage dashboards** — Artifact list: "Substrate Hedge Audit" and "Operational Backlog" both updated 2026-07-13 (the dashboards-rebuild teammate).
- **S1 mandate-p03** — stands as the two-stop "Ask Gate" (read live from `.claude/mandates.jsonl:3`); the memory-tier inconsistency the prior report flagged is gone (MEMORY.md's plans-and-options entry now teaches "the two legitimate stops"); the user subsequently granted mandates-file edits (p04, `41902654`) without reopening p03. Treated as user-confirmed by conduct.
- **W-a "commit that analysis audit"** (2026-07-11T22:37:27Z) — prior report committed (in-tree, git-tracked).
- **W-b disposition program** ("For 'Policy-determined — the process prescribes the disposition' execute the dispositions", 2026-07-12T09:52:12Z; "Execute on all for which their are no decisions standing in the way…", 2026-07-12T23:43:45Z) — executed across waves 2/3: TASK-126–138 all `completed` with per-criterion verifications (VER block: 116 passed, 0 failed).
- **W-c non-tracker planning-vocabulary residue** (user 2026-07-12T11:15:27Z: the "Phase H / Cycle 8/9.1 / F2 resolver" exclusion "is not warranted") — FGAP-146 filed and `closed` via TASK-129 at its filed scope (non-test comments + scripts, three shards, "converged at zero", `3bc2a4a2`); the surviving carriers outside that scope are W4.
- **W-d loop-economics policy** (user 2026-07-13T10:09:23Z "task one agent to exactly determine that…"; 10:57:52Z "Implement these in our policies: [four rules]") — determination written and committed (`2624d2c7`); the four rules landed on every binding surface in `41902654` (CLAUDE.md pipeline steps 3/4/5 + autonomous-loop paragraph + Completion Sequence 6, mandate-p04, conventions `docs-surface-sync` rule 6 — diff verified). Residual: W5.
- **W-e weight/benefit evaluation of substrate text edits** (user 2026-07-13T09:25:35Z) — absorbed into the loop-runaway determination (its §1 quantifies the spend: ~7.5M cache-create + ~536k output across 19 subagents; per-round 321k–530k) and the W-d policy change. No separate deliverable owed.
- **W-f "why do we have dirty git state"** (2026-07-13T11:03:10Z) — tree clean at HEAD, `main` == `origin/main` (fresh `git status -sb`).
- **W-g /doctor cleanup** (2026-07-13T11:06Z → 2026-07-14T00:42Z, the session's terminal thread) — completed: user answered the AskUserQuestion; final assistant message details the applied `~/.claude/settings.json` changes (18 skillOverrides off, 4 plugins disabled; backup at `/tmp/settings-backup.qIkuHh`); out-of-repo, no project residue.

**Filing-accuracy axis (secondary), sampled:** TASK-119's description carries the user's directive verbatim and so marked; FGAP-146's closed_by honestly discloses its non-test scope; commit `41902654`'s message accurately records the user's rejection of the numeric cap; the feat-evaluation explicitly separates its MET verdicts from the user-judgment flags. No paraphrase-as-quote or attribution scope-creep found in the sampled filings.

**Pre-existing tracked backlog, unchanged and honest (no atoms):** TASK-041 `planned` (its scope = the 17 `decision-shows-derivation` warnings context-validate still emits); TASK-095–101 `planned` (harness-hardening decomposition); FGAP-085/089/102/117/123 `identified`; TASK-064/065/075 completed-task-vs-open-gap warnings (pre-session); release HOLD standing — session surface sits in CHANGELOG `[Unreleased]`, correct under the hold.

---

## Tally

| verdict | count | atoms |
|---|---|---|
| still-open | 7 | W1 W2 W3 W5 W6 C1 D1 |
| partial | 1 | W4 |
| superseded | 0 | — |
| resolved-since | 21 | A1–A5, B1–B4, C2, C3, S1, W-a–W-g |

Dispatch order by leverage: **W6/FGAP-152 first** (its fix unblocks W1+W3's status flips cleanly), then **W1+W3** (currency — or amend-plus-flip now without waiting), **W2** (file the four payloads before tmp evaporates), **W4** (investigate + file the carrier class), **C1** (mechanical), **W5** (user call on the cap clause), **D1** (the user's declared next arc once the above clear).
