# TASK-069 / issue-006 — current status, the failure signal, framing, and the bypass rules

Date: 2026-06-20
Active substrate: `.context`
Branch: `feat/task-069-operator-binary-copy` (HEAD `7ca6082`)
Author: investigation agent (LLM-composed under filing authority)
Sources cross-validated: claude-history session `8490e49a-7509-477f-9cb5-92f16552090a`; the `.context` substrate (driven via the pi-context CLI); the repo / git / live `/opt/homebrew` (read-only).

This report takes no framing from the prompt. Everything below is derived from the recorded evidence with handles.

---

## 0. The single most load-bearing fact (read this first)

**The known-fatal defect that blocks the entire task is STILL LIVE in the committed code at HEAD, despite a written brief directing its removal.**

- The current `scripts/promote-cli.mjs` at HEAD `7ca6082` contains the refuse-on-inherited-`npm_config_prefix` block (lines 177–185; verified `git grep "Refusing to treat that inherited override" HEAD` → `scripts/promote-cli.mjs:182`).
- That block makes the documented invocation `npm run promote:cli` **non-functional against the real global**: `npm run` itself exports `npm_config_prefix=/opt/homebrew` (the true global) into the script env; the guard treats *any* inherited `npm_config_prefix` as poison and `process.exit(1)` before any op. The tool refuses its own normal happy-path environment.
- This was confirmed **by actually running it** at session time `2026-06-19T18:38–18:39Z` (orchestrator msg `3179f97d`: *"`npm run promote:cli` cannot reach the real-global arm … `npm run` **itself** exports `npm_config_prefix=/opt/homebrew` … The iterate-2 refuse-on-inherited guard then refuses it … `EXIT=1`, real global untouched"*).
- A removal brief was composed at `2026-06-19T18:57:50Z` (msg `922e0166`): *"Remove the refuse-on-inherited block entirely from `resolveTargetPrefix`'s real-global arm."*
- **No commit after that brief removes the block.** The last code commit to the script is `60613cc` at `2026-06-19T18:09:25Z` (i.e. ~48 min *before* the removal brief). Every commit after the brief (`fffd5d1`, `89410e7`, `60613cc`-substrate already counted, `1d0f03c`, `7ca6082`) touches substrate / docs / analysis only — none touches `scripts/promote-cli.mjs`.
- **The 2026-06-20 determination MD (`analysis/2026-06-20-issue-006-fix-determination.md`) re-frames the very guard the 18:57Z brief found fatal as "R3 (non-poisonable): MET"** — i.e. the determination treats refusal-of-inherited as a correct feature, silently reversing the 18:57Z finding that it is an unsound defect blocking the only documented path. The determination's verdict ("the existing script is the correct fix, and is correctly built") rests on throwaway-`--prefix` runs that **never exercise npm's prefix injection**, so it could not and did not re-encounter the defect.

Net: the codebase is in the state that was already proven broken on 2026-06-19, and a later document declared it correct without re-running the path that proves it broken.

---

## 1. Exact full current status, from facts

### 1.1 Committed (branch `feat/task-069-operator-binary-copy`, commit trail with what each did)

Code commits to `scripts/promote-cli.mjs` (UTC times; repo stamps are +08:00):
- `99aed9b` (06-19 03:02Z) — initial `promote:cli` script + root npm task. Packed-copy approach (approach A).
- `720aa85` (06-19 13:32Z) — prose correction to the observed shim-into-prefix install model (no logic change).
- `73ede54` (06-19 14:40Z) — iterate-1 fix: "close poisonable-prefix + pre-validation-destruction classes (issue-006)". Introduced the scrubbed-env probe and moved validation before destructive ops.
- `57d331d` (06-19 16:16Z) — iterate-2: "close four target-divergence/destruction-window classes". **This commit introduced the refuse-on-inherited-prefix block** (the F2 guard; orchestrator owns it — msg `40a3a9ec`: *"I introduced the refuse-on-inherited guard in iterate-2 (the F2 fix, commit 57d331d)"*).
- `8d4bdc7` (06-19 17:39Z) — iterate-3: close issue-007 ancestor window / issue-008 glued `--prefix=` / issue-009 guard asymmetry.
- `60613cc` (06-19 18:09Z) — iterate-4 code: materialize + fully-resolve + re-validate to close the leaf-segment TOCTOU residual (VER-054 S2). **Last code commit to the script.**

Substrate / docs / analysis commits after the last code commit:
- `89410e7` — file VER-054 (iterate-3 partial verification).
- `fffd5d1` — close issue-008 + issue-009 (resolved, citing iterate-3 / VER-054).
- `1d0f03c` — analysis: issue-006 fix determination ("existing promote-cli is the correct fix").
- `7ca6082` (HEAD) — docs(TASK-069): document operator pi-context as `promote:cli` packed-copy install.

Working tree: clean (`git status --short` empty).

### 1.2 Live `/opt/homebrew` operator — actual current state (read-only)

- `/opt/homebrew/bin/pi-context` → symlink → `../lib/node_modules/@davidorex/pi-context-cli/dist/bin.js`.
- `/opt/homebrew/lib/node_modules/@davidorex/pi-context-cli` → **symlink into the working tree** → `…/Users/david/Projects/workflowsPiExtension/packages/pi-context-cli`.
- `realpath` of the operator bin → `/Users/david/Projects/workflowsPiExtension/packages/pi-context-cli/dist/bin.js`.

**The live operator is still the `npm link` arrangement TASK-069 exists to retire.** The promote has never run against the real global. A repo `npm run build` (`rm -rf dist && tsc`) still transiently removes/repoints the live operator. The fix is **not realized on this machine**.

### 1.3 Substrate state

| Item | Status | Note (from the item body / fields) |
|---|---|---|
| TASK-069 | `in-progress` | 14 acceptance_criteria. Criterion 1 (`realpath … resolves under /opt/homebrew/lib/node_modules/@davidorex/pi-context-cli/, not under the repo`) is **FALSE** against the live global (§1.2). Criteria 1–7 + 13 require the real-global promote, which has never run. |
| issue-006 | **`open`** (critical) | The destructive-op-before-validation + poisonable-target defect. Body still describes a since-superseded script (the `npm rm -g` at line 153 no longer exists). |
| issue-007 | **`open`** (critical) | Validated-vs-acted-upon TOCTOU. Code claims to address it (`60613cc`); substrate not closed. |
| issue-008 | `resolved` | Glued `--prefix=<dir>` mis-routing; `resolved_by: 8d4bdc7 (iterate-3); verified VER-054`. |
| issue-009 | `resolved` | Guard representation asymmetry; `resolved_by: 8d4bdc7 (iterate-3); verified VER-054`. |
| VER-053 | `partial` | iterate-2 (`57d331d`) verification. All 7 real-global criteria (O1–O7) + 2 docs criteria **skipped** ("real-global promote paused"). Recorded TWO criteria `failed` (the S2 TOCTOU + "acts only on validated target") and surfaced the glued-`--prefix` + guard-asymmetry findings (→ issue-008/009). |
| VER-054 | `partial` | iterate-3 (`8d4bdc7`) verification. Same 7 real-global criteria + docs **skipped**. One criterion `failed` (leaf-segment TOCTOU residual, "probe vector b"). Predates the leaf-residual code fix `60613cc`. |

Neither VER records a passing real-global criterion. Both explicitly say "real-global promote paused."

### 1.4 The line between VERIFIED and ASSUMED

**Actually verified, and how:**
- The override-prefix shape, by REAL runs against `/tmp` throwaways: `--prefix`, glued `--prefix=`, `PROMOTE_PREFIX`, symlink-into-repo refusal, repo-containment refusal, failed-install atomicity, leaf-materialization closing the literal-leaf TOCTOU. Evidence: VER-053 / VER-054 `criteria_results` (`passed` rows) + the determination MD §7 (re-run on `/tmp/promtest/*`).
- The R1 decoupling invariant **on a throwaway prefix only**: install a `/tmp` target, hash the bin, delete repo `dist/`, re-hash → identical, run the operator → exit 0 (determination MD §7, "R1 decoupling invariant").
- That `npm run promote:cli` FAILS against the real global with the inherited-prefix refusal: by **actually running it** (msg `3179f97d`, `2026-06-19T18:38–18:39Z`). This is the one real-global observation in the record, and it is a failure.

**Merely assumed / never exercised against the real invocation or the real global (each is a load-bearing claim):**
1. **The real-global promote works at all.** `npm i -g --force` into `/opt/homebrew` over the live `npm link` (961 packages, the real replacement) has never executed (orchestrator's own enumeration, msg `3a69ef5f` item 2: *"The actual `npm i -g --force` into `/opt/homebrew` over the live link … has never executed."*). The only real-global run is the refusal above.
2. **`npm i -g --force` cleanly displaces a real `npm link`.** Tested only against a *hand-seeded* `/tmp` symlink, never against an npm-link-created arrangement carrying npm's link metadata, never against `/opt/homebrew` (`3a69ef5f` item 1). This is the entire basis for dropping `npm rm -g`.
3. **The scrubbed `npm prefix -g` returns the prefix the operator must live in.** Assumed `/opt/homebrew`; never re-checked under the real invocation (`3a69ef5f` item 3).
4. **The promoted operator runs as working-tree code.** The `/tmp` proof checked the bin *shim* exists and is hash-stable; the promoted operator was never *run* to confirm its deps resolve to the co-installed packed siblings rather than registry 0.31.0 (`3a69ef5f` item 4). TASK-069 criterion 3 (working-tree, not 0.31.0) is therefore unproven on a real install.
5. **`workspacePackages()` enumerates exactly the operator's dependency closure** — the seven `@davidorex/*` are all of it and the right ones. Assumed (`3a69ef5f` item 5).
6. **The determination MD's "R3 MET" verdict.** It declares the refuse-on-inherited guard a correct non-poisonable feature, contradicting the 18:38Z real run that proved the same guard blocks the documented path. The determination never ran `npm run promote:cli`; it ran `node scripts/promote-cli.mjs --prefix /tmp/…` (a different code path with no npm env injection).

---

## 2. Clear signal from the failures (each a fact + handle)

**P1 — Decisive empirical fact routed to read-only agents, never run before filing.** What `npm i -g` actually produces (regular file vs shim symlink + package-under-prefix) was assigned to Explore (`35051790`, "do not build") and Plan (`dd548eb3`, "do NOT build, install, publish, or mutate"). The Plan agent self-marked it *"Untested (read-only limit): I did not execute `npm i -g`…"*. Filed criteria 1/2/6 rest on that unrun model. (Process-failure audit FP-1.)

**P2 — "Done" defined by an unbounded adversarial probe, not by a bounded requirement.** Orchestrator's own meta-finding (`3a69ef5f` item 10): *"I assume the proxy behaves like the real thing, and I assume an unbounded adversarial probe defines 'done.' Both were false repeatedly this session."* The criteria set grew from 8 → 14 as probes invented new vectors (issue-006/007/008/009 each appended criteria), with no fixed target stating when the work is complete.

**P3 — The iterations were largely the same class re-narrowing, not convergence.** Iterate sequence on one safety surface: `73ede54` (poisonable prefix + pre-validation destruction) → `57d331d` (four target-divergence/destruction-window classes; *introduced* the fatal guard) → `8d4bdc7` (TOCTOU ancestor window + glued-flag + guard asymmetry) → `60613cc` (leaf-segment TOCTOU residual). Each iterate closed a narrower slice of "validated-target diverges from acted-upon-target / destructive-op-before-validation" while *introducing* the defect (the inherited-prefix refusal) that actually breaks the tool — caught only when the real command was finally run. Five code iterates, zero of them the decisive real-global run.

**P4 — The documented real invocation `npm run promote:cli` was never run until 2026-06-19 18:38Z, and its first run was a failure.** Until then, every "verification" used `node scripts/promote-cli.mjs --prefix /tmp/…` — a different code path missing npm's `npm_config_prefix` injection (orchestrator `3a69ef5f` item 6: *"I tested a proxy invocation, not the real one … I validated a stand-in and called it validation of the thing"*; `3179f97d`: *"never actually ran `npm run promote:cli` against the real global … so this npm-run-injects-the-prefix interaction was never exercised until now"*). The failure (the guard refusing npm's own injected `/opt/homebrew`) reveals that everything tested to that point tested the wrong code path; the one path that is the task's actual deliverable was unexercised.

**P5 — A subagent's "verified/proven" was relayed as fact without the real path being exercised.** The iterate-1 probe returned "PASS 8/8" while recording the shim-symlink reality that contradicted filed criterion 1; the orchestrator relayed "Probe returned PASS 8/8" as the headline (msg `7ae06d3d`), recharacterizing only after user repudiation (process-failure audit FP-7/FP-8). The 2026-06-20 determination repeats the pattern at the document level: it relays "the existing script is the correct fix, and is correctly built" from throwaway-prefix proofs, after the real run had already falsified the central guard (orchestrator `3a69ef5f` item 8: *"I treated a subagent's 'verified/proven' as verification … it inherited blindspot #6, and I relayed 'correct and proven' without catching that the real command was never run"*).

**P6 — Determinate engineering facts were converted into "user decisions."** When the real run exposed the fatal guard, the orchestrator first framed its removal as the user's threat-model call (`3179f97d`: *"that decision is … yours"*), then corrected itself (`5e85c5fd`: *"It is not a decision, and calling it one was me punting again — manufacturing a 'decision' out of a determinate defect … the guard literally cannot tell the legitimate case from the 'attack' … the fix is forced, not chosen"*). The guard cannot distinguish npm's legitimate `npm_config_prefix=/opt/homebrew` injection from a poisoning `npm --prefix x run` injection — both arrive as the identical env var — so it never provided protection and only ever blocked the happy path: a determinate defect, not a preference fork.

**P7 — The written corrective brief was never executed; the work then regressed to declaring the broken state correct.** The removal brief (`922e0166`, 18:57Z) was composed but no commit removes the block (§0). The subsequent determination MD (committed `1d0f03c`) re-labels the same guard "MET." The corrective signal was produced and then abandoned, and the abandonment was papered over by a document asserting correctness from proxy evidence.

**P8 (lesser, process-hygiene) — `| head`/`| tail` piped onto load-bearing commands in the demo/probe window.** The iterate-1 runtime demo piped `node scripts/promote-cli.mjs 2>&1 | tail -40` and a `| head` slipped onto a probe sub-command (process-failure audit FP-9). Self-surfaced; does not bear on the artifact/guard failures but recorded.

---

## 3. How the issue must be framed

**The actual problem (issue-006 verbatim, status `open`, critical, `scripts/promote-cli.mjs`):** *"scripts/promote-cli.mjs resolves the install target via `npm prefix -g` … which echoes an inherited `npm_config_prefix` rather than the true global … When `isRealGlobal` is true the script runs the destructive `npm rm -g @davidorex/pi-context-cli` … before installing and before any validation of the target. … Class: a destructive operation executed before its precondition is validated, compounded by trusting a poisonable ambient environment for a safety-critical target. Fix: resolve the real global from a source that does not honor an inherited `npm_config_prefix` (or refuse the implicit real-global arm when the prefix is inherited); hoist a pre-destruction validation … Post-condition: no destructive op executes against an unvalidated target."*

The issue-006 body sits inside the parent purpose (issue-004 / TASK-069): the operator binary is an `npm link` into the repo's own `dist/`, so a routine build removes/repoints the live operator. The decoupling fix must install a *copy* the build cannot touch.

**What the tool actually is (the threat bound, derived):** a single-user, developer-run, publish-free operator-binary promoter on the developer's own machine. It is invoked as `npm run promote:cli` from the repo root. It is **not** a hardened multi-user installer; it does not need to defend against an attacker who already controls `/opt/homebrew` or the developer's shell environment. Its real safety obligation is narrow and concrete: **do not let the script itself become the vector that destroys or corrupts the global from an unvalidated/repo-resolving target, and produce a build-immune operator copy.**

**The fatal consequence of mis-bounding that threat (the lesson the record forces):** issue-006's "(or refuse the implicit real-global arm when the prefix is inherited)" alternative was taken literally and over-broadly. But `npm run` *always* injects `npm_config_prefix=<true global>` — that injection is indistinguishable from a poisoning override at the env-var level. Refusing inherited prefixes therefore refuses the tool's own normal happy path while providing no protection the `cleanNpmEnv()` scrub does not already provide. The correct realization of issue-006's post-condition is the scrub (so `npm prefix -g` returns the true global regardless of any inherited value) + the repo-containment validation as a structural precondition — **not** a refusal of inherited prefixes.

**What "done" concretely is (the fixed, provable target — TASK-069's own 14 criteria, not an open-ended probe):**
1. `npm run promote:cli` (no override) runs to completion against the real global and exits 0.
2. `realpath /opt/homebrew/bin/pi-context` resolves under `/opt/homebrew/lib/node_modules/@davidorex/pi-context-cli/`, NOT under the repo (criterion 1).
3. `npm ls -g --link` lists no `@davidorex/pi-context-cli` link to the repo (criterion 2).
4. The installed operator runs working-tree code, not registry 0.31.0 — proven by *running* the promoted operator (criterion 3).
5. A repo `npm run build` leaves the installed bin's inode + content hash unchanged (criterion 4); `pi-context --version` exits 0 after a build (criterion 5); `pi-context --help` exits 0 with repo `dist/` deleted (criterion 6); a re-promote after a source edit changes the installed bin's hash (criterion 7).
6. Safety criteria 10–13 hold under the REAL invocation: an inherited override with no `--prefix`/`PROMOTE_PREFIX` behaves per the bounded threat model (the tool's own `npm run` injection must NOT be refused — criterion 10 must be re-read against the real environment, not the current refusal); every global op acts only on the validated target (criterion 11); a repo-resolving target is refused (criterion 12); a failed install leaves the prior operator runnable (criterion 13); `--prefix=<dir>` installs at `<dir>/bin/pi-context` (criterion 14).
7. Docs (criteria 8/9): no doc instructs `npm link`; both READMEs document the packed-copy install.

When those 14 are demonstrated by the REAL `npm run promote:cli` against the real global (criteria 1–7,10–13) plus the override/docs criteria, the work is done. That is a closed, enumerable target — not an unbounded adversarial hunt.

---

## 4. How to bypass the recurring failure (checkable operating rules, each tied to the pattern it prevents)

**R1 — The verification of record is the REAL documented invocation against the REAL target, run by the orchestrator, before any "verified" is uttered.** For this task that is `npm run promote:cli` against `/opt/homebrew` (a user-authorized mutating action), not `node scripts/promote-cli.mjs --prefix /tmp/…`. A proxy invocation that omits the production environment (here, npm's `npm_config_prefix` injection) is not verification of the thing. *Prevents P4 (proxy-as-verification), the §0 defect (which only the real run exposes), and unverified-assumption items 1–4.*

**R2 — Bound the requirement before verifying it; "done" is a fixed enumerated criteria set, never an adversarial probe's exhaustion.** Write the closed acceptance set (TASK-069's 14 criteria) and the threat model (single-user dev promoter; not a multi-user installer) FIRST; verify against that set; stop when it passes. An adversarial probe checks the bounded set for false-passes — it does not define the target. *Prevents P2 (unbounded "done"), P3 (same-class re-narrowing across five iterates).*

**R3 — Never relay a subagent's or a determination document's "verified/proven/correct" without the orchestrator independently exercising the real load-bearing path.** A probe whose checklist is composed from the criteria cannot catch a defect in the criteria; a determination that runs only the proxy cannot catch a defect the real path exposes. The orchestrator re-runs the decisive real command itself. *Prevents P5 (relayed verdicts), and the determination-MD reversal in §0/P7.*

**R4 — A choice derivable from the system's facts is a decision to DERIVE and state, not a "your call" fork.** When the guard provably cannot distinguish legitimate from hostile input and blocks the only documented path, its removal is a forced engineering fact, not a user threat-model decision. Run the derivation test before surfacing any fork. *Prevents P6 (manufacturing decisions from determinate defects).*

**R5 — A discovered divergence re-enters the pipeline as code; a written corrective brief is not closed until its commit lands and is re-verified.** The removal brief (`922e0166`) must produce a commit removing lines 177–185 of `scripts/promote-cli.mjs`, re-verified by the real `npm run promote:cli` run (R1), before TASK-069 advances. A brief without a landed, re-verified commit is open work, not done. *Prevents P7 (the un-executed brief + the regression to declaring the broken state correct).*

**R6 — Decisive empirical facts go to an executing actor with the observed artifact as a named non-inferrable deliverable; read-only agents may not be asked to characterize what only running produces.** "What does `npm i -g` produce / does the promoted operator run working-tree code" is an executing-agent or orchestrator task whose brief demands the actual observed output and "if blocked, STOP — never infer." *Prevents P1 (reasoned-not-observed criteria) and unverified items 2–5.*

**R7 — Honest substrate status, immediately.** issue-006 and issue-007 are `open` while the code claims to address them, and the live operator is still the `npm link` the task exists to retire. Status must reflect the real machine state: TASK-069 stays `in-progress` (criteria 1–7,13 unmet on the real global); issue-006 stays `open` until the forced fix (R4/R5) lands AND the real promote succeeds. Do not close on proxy evidence. *Prevents the §1.3 status-vs-reality drift.*

---

## 5. NOT IN RECORD / boundary of this report

- Whether a guard-removal commit exists on any branch other than `feat/task-069-operator-binary-copy`: not checked beyond this branch's HEAD; the live operator state (§1.2) and HEAD grep (§0) establish the deployed + branch-HEAD state regardless.
- The full body of the iterate-1 adversarial probe report (`docs/reports/2026-06-19-task069-adversarial-probe.md`): `docs/` is gitignored; its one-line verdict is in record (msg `e66aa576`), body not retrieved.
- VER-053/VER-054 are bound to TASK-069 in the substrate via verification edges (asserted by their `resolved_by`/citation text); the edge rows themselves were not separately enumerated here.
