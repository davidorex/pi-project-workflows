# Rhetorical-register block audit — `.context` substrate (read-only, post-hoc)

Date: 2026-06-09. Active substrate: `.context`. Scope: every block kind. Rubric: the `rhetorical-register` convention (6 rules: 1 declarative; 2 terse; 3 self-contained; 4 exact; 5 current-truth-only / no provenance-git-process narration / no assert-then-refute; 6 fit-for-block-type). This is post-hoc analysis — violations are expected. The aim is the pattern, severity, locus, and a broadening recommendation for the write-time register guard (today framework-gaps only).

Severity key: **egregious** = a narrative/provenance/process paragraph; **moderate** = a stray narrative clause or an assert-then-refute span; **minor** = mild hedging/recap/provenance reference.

## 1. Per-block-kind tally

17 block kinds enumerated. 9 carry no items (requirements, rationale, spec-reviews, layer-plans, context-contracts, phase, story, work-orders, conventions has items but is clean — see below). Items audited and violation counts (prose fields only; id/enum/date/path fields skipped):

| Block | Items | Items w/ ≥1 viol | Total viols | Egregious | Moderate | Minor | Dominant rule(s) |
|---|---|---|---|---|---|---|---|
| session-notes | 8 | 8 | ~40 (every prose field) | 8 | many | — | 1, 2, 5 (whole-block process/git narration) |
| verification | 35 | 35 | ~35 (one per `evidence`, + nested) | 30+ | rest | — | 5, 1 (git-SHA + probe-loop narration) |
| framework-gaps | 73 | ~30 | ~45 | ~22 | ~18 | ~5 | 5 (`closed_by` + "Surfaced by" + "CLOSED at <sha>") |
| tasks | 43 | ~12 | ~18 | ~10 | ~6 | ~2 | 5, 1 (`notes` git/process narration) |
| decisions | 17 | 17 | ~25 | ~6 | ~15 | ~4 | 5 (`context` provenance; some assert-then-refute) |
| research | 11 | 11 | ~22 | ~6 | ~14 | ~2 | 5 (in-body audit-correction + method narration) |
| features | 8 | 4 | ~6 | 1 | 4 | 1 | 5, 1 (motivation narration; FEAT-004 prose) |
| issues | 2 | 2 | ~5 | 2 | 2 | 1 | 5 (`resolved_by`, "Found by", "Planned fix") |
| conventions | 9 | 1 | 1 | 0 | 0 | 1 | minor provenance ("grounded in R-0006") |
| requirements/rationale/spec-reviews/layer-plans/context-contracts/phase/story/work-orders | 0 | 0 | 0 | — | — | — | (empty) |

Totals (approx, counting one violation per offending field-span, not per phrase): **~197 violations across ~118 violating items**, of which **~85 egregious**, **~95 moderate**, **~17 minor**.

## 2. Violations table (worst-first, capped at 60; total population ~197, so ~137 lower-severity/repeat-class instances are not individually tabulated — they are the same per-field classes repeating across items)

| Block | Item | Field | Rule(s) | Sev | Offending quote (≤120 chars) |
|---|---|---|---|---|---|
| session-notes | SESSION-008 | current_status | 5,1 | egregious | "Branch main at 9ee4db2 ... Tree clean. Pointer at .context ... Release HELD. Push HELD." |
| session-notes | SESSION-008 | discoveries[4] | 5 | egregious | "filed as FGAP-183 (P1)" / "MigrationRegistry caches per-cwd ... cross-substrate reads ... throw" |
| session-notes | SESSION-005 | discoveries[3] | 5,1 | egregious | "Pre-existing CLAUDE.md hold was operator-invented (mine), not operator-declared" |
| session-notes | SESSION-004 | current_status | 5 | egregious | "Working tree dirty: .pi-context.json + .context/ ... cutover-commit cluster pending" |
| session-notes | SESSION-001..007 | focus | 5,1 | egregious | "Investigated 18 FB items ... via 4 parallel Explore agents ... batch-filed 24 FGAPs" |
| verification | VER-031 | evidence | 5,1 | egregious | "The adversarial probe found two defects, both re-entered the pipeline (explore -> plan ...)" |
| verification | VER-033 | evidence | 5 | egregious | "LIVE BITE — dropping arrayKey from cli.ts:420's exemption makes the gate exit 1 ..., reverted" |
| verification | VER-002 | evidence | 5 | egregious | "An adversarial probe first found switchToPrevious unwired ...; after wiring it, a fresh ... re-audit" |
| verification | VER-001 | evidence | 5 | egregious | "TASK-001 (skeleton-config bootstrap, landed at ab05a0e): npm run build + ... all green" |
| verification | VER-004 | evidence | 5 | egregious | "The probe->fix->re-audit loop caught and fixed: the foldin string-endpoint writer ..." |
| verification | VER-032 | evidence | 5 | egregious | "the task file-list was over-broad; whole already exists ... verified: a 378KB ... fails closed" |
| framework-gaps | FGAP-019 | closed_by | 5 | egregious | "VER-029 / TASK-015 — block-mutation ops accept --block without --arrayKey; the CLI derives ..." |
| framework-gaps | FGAP-020 | closed_by | 5 | egregious | "VER-030 / TASK-016 — a CLI-side addressedReadOverride recomputes the addressed value ..." |
| framework-gaps | FGAP-068 | closed_by | 5 | egregious | "VER-028 / TASK-037 — the update conflict resolver no longer spawns a subordinate ..." |
| framework-gaps | FGAP-028 | proposed_resolution | 5 | egregious | "RESOLVED at b1cdccc: the 8 substrings genericized ... An adversarial re-audit additionally flagged ... dismissed" |
| framework-gaps | FGAP-029 | closed_by | 5 | egregious | "closed by fa8a0cc ... + c6434db ...; verified by VER-014. Core safe re-sync resolved ..." |
| framework-gaps | FGAP-010 | proposed_resolution | 5 | egregious | "CLOSED at dc7f514 by scripts/parity-check.ts — the source-intrinsic build gate ..." |
| framework-gaps | FGAP-013 | proposed_resolution | 5 | egregious | "CLOSED at 75f2611 (TASK-012). Data ops return a structured OpResult ..." |
| framework-gaps | FGAP-014 | proposed_resolution | 5 | egregious | "CLOSED at d0ab83d (TASK-014). completeTask migrated ... Backfilled the verification_verifies_item edges" |
| framework-gaps | FGAP-015 | proposed_resolution | 5 | egregious | "CLOSED at 75f2611 (TASK-013), per DEC-0009. ... Adversarial re-audit confirmed the recurrence ended" |
| framework-gaps | FGAP-062 | closed_by | 5 | egregious | "VER-034 / TASK-040 — deriveTopHelp rewritten as a grouped scannable listing ..." |
| framework-gaps | FGAP-072 | closed_by | 5 | egregious | "VER-035 / TASK-042 — per-op <op> --help now renders the best-of-breed template ..." |
| framework-gaps | FGAP-047 | closed_by | 5 | egregious | "closed by a5055ad ...; verified by VER-017 ... Published npm i -g smoke deferred (release-gated)" |
| framework-gaps | FGAP-031 | closed_by | 5 | egregious | "TASK-028 (VER-017) made pi-context globally installable (chmod +x dist/bin.js ...)" |
| framework-gaps | FGAP-014 | description | 5,1 | egregious | "This is evidence of garbled LLM implementation: a schema refactor that dropped fields ..." |
| framework-gaps | FGAP-013 | description | 5 | moderate | "Surfaced by dogfooding the CLI." / "Agent-investigated for root cause ... before filing." |
| framework-gaps | FGAP-019 | evidence[0].reference | 5 | moderate | "Origin: surfaced by USING the CLI to file research item R-0002 — append-block-item demanded ..." |
| framework-gaps | FGAP-020 | evidence[0].reference | 5 | moderate | "Origin: surfaced by USING the CLI while filing FGAP-019 — read-schema ... returned the 10-entry list" |
| framework-gaps | FGAP-068 | description | 5 | moderate | "Surfaced by the live credentialed smoke; TASK-037's structural fake-spawn verification missed it" |
| framework-gaps | FGAP-070 | description | 5 | moderate | "Empirically confirmed via live CLI: ... the regression ships green." |
| framework-gaps | FGAP-016 | description | 5 | moderate | "Surfaced by the FGAP-015 re-audit (NOT introduced by it)." |
| framework-gaps | FGAP-027 | description | 5 | moderate | "the parity survey's frozen-ops constraint explicitly carved out and the user has now authorized" |
| decisions | DEC-0017 | consequences[last] | 5 | egregious | "Resolver-route correction (FGAP-068): the resolver returns the conflict to the CALLING agent rather than ..." |
| decisions | DEC-0001 | context | 5 | moderate | "FGAP-001: init / switch -c leave the substrate config-less ..." |
| decisions | DEC-0002 | context | 5 | moderate | "FGAP-002: ... Surfaced by the switch-register gap ..." |
| decisions | DEC-0008 | context | 5 | moderate | "FGAP-012 (surfaced by the gamma parity gate, dc7f514) shows 5 ops ..." |
| decisions | DEC-0009 | context | 5 | moderate | "unbounded leaks were found one op at a time by audit ... — the signature of a missing invariant" |
| decisions | DEC-0010 | context | 5 | moderate | "A web-cited prior-art survey (analysis/...) compared template reconcilers ..." |
| decisions | DEC-0012 | context | 5,1 | egregious | "Commit 0fcba9c added three artifacts ... The change was made ad-hoc inside the TASK-026 work ..." |
| decisions | DEC-0011 | context | 5 | moderate | "Surfaced while scoping FGAP-030 (adding a CLI surface ...): adding a born-obsolete ... twin is pure waste" |
| research | R-0001 | findings_summary | 5 | egregious | "Corrective finding: OpDefinition is pi-context's INTERNAL wrapper ..., not a shared contract" |
| research | R-0003 | findings_summary | 5 | egregious | "the survey prose's earlier '52' was an arithmetic slip ... enumeration is complete" |
| research | R-0005 | findings_summary | 5 | egregious | "an earlier draft's claim that none was published conflated ... and is wrong" |
| research | R-0008 | findings_summary | 5 | egregious | "CORRECTION to the earlier synthesis: FEAT-002 ... is PROPOSED and entirely UNBUILT" |
| research | R-0010 | findings_summary | 5 | moderate | "an embedded audit verified it ... — 22 claims Verified, 3 Incorrect + 2 Stale corrected in-body" |
| research | R-0011 | findings_summary | 5 | moderate | "The circulating ~10-32x CLI-vs-MCP token/reliability multiplier is unverified landscape signal" |
| research | R-0004 | findings_summary | 5 | moderate | "The second evaluation ... graded 28 assertions: 26 CONFIRMED, 0 REFUTED, 2 PARTIAL ... CORRECTED in the spec" |
| tasks | TASK-001 | notes | 5,1 | egregious | "Implemented at ab05a0e ... a fresh adversarial re-audit found the isSkeletonConfig ... fix complete" |
| tasks | TASK-006 | notes | 5,1 | egregious | "Implemented at f5b6bd5. ... two non-functional findings fixed + re-verified. cli arc alpha ..." |
| tasks | TASK-007 | notes | 5,1 | egregious | "Implemented at 56b153d. ... probe->fix->re-audit loop caught a proxy false-positive ... final re-audit clean" |
| tasks | TASK-002 | notes | 5,1 | egregious | "Implemented at 17d9a3b. ... a fresh adversarial re-audit (after the probe found switchToPrevious unwired)" |
| tasks | TASK-019 | notes | 5 | egregious | "REFRAMED from the 2026-06-05 op<->script premise (R-0003 ..., now superseded) to op<->CLI" |
| tasks | TASK-015 | notes | 5 | moderate | "Release-group: cli-parity (FEAT-008) | order 1/6 | ... | one task per feature-decomposition rule 4" |
| tasks | TASK-016 | notes | 5 | minor | "Release-group: cli-parity (NEXT) | order 2/5 | addresses FGAP-020, FGAP-021, FGAP-023 ..." |
| issues | issue-001 | body | 5,1 | egregious | "Found by the S4 adversarial audit (TASK-026 / FGAP-029) before commit. ... Planned fix: ... Fixed and closed ..." |
| issues | issue-001 | resolved_by | 5 | egregious | "0fcba9c — resyncSchema captures migrations.json raw bytes ... so a refused re-sync leaves ... byte-unchanged" |
| features | FEAT-004 | description | 1,2 | moderate | "On a custom-vocabulary substrate ... they return empty/inert: the substrate has a real \"where are we / what's next,\"" |
| features | FEAT-004 | motivation | 5 | moderate | "context-current-state is fully inert ... (confirmed: returns empty focus/inFlight/nextActions/blocked ...)" |
| features | FEAT-008 | acceptance_criteria[6] | 5 | moderate | "this criterion was reframed from the original op<->script wording when scripts were taken off the table in TASK-019" |
| features | FEAT-008 | acceptance_criteria[7] | 5 | minor | "the per-op help examples[] metadata added in TASK-042 is invisible to the in-pi tool surface" |
| conventions | cli-command-form | description | 5 | minor | "CLI command-form rule (follows pi's own convention; grounded in R-0006)." |

(~137 further instances not individually listed are the SAME field-classes repeating: every `closed_by` on a closed FGAP, every `evidence` on a VER, every `notes` on a completed TASK, every `findings_summary` correction-narrative, every session-notes prose field. The classes are exhaustively characterized in §3.)

## 3. Pattern analysis

**Most-violated rule, by a wide margin: rule 5** (current-truth-only / no provenance-git-process narration / no assert-then-refute). It accounts for essentially every egregious case. Rule 1 (declarative, not narration) co-fires whenever rule 5 does. Rules 3, 4, 6 are rarely the primary breach; entries are generally self-contained and concrete — they just narrate process and prior state.

**Dominant violation class: provenance/process/git narration** (not hedging, which is near-absent — the substrate is confident; and not first-person, which appears only in session-notes). Three sub-classes, in order of volume:

1. **Closure/resolution narration in dedicated outcome fields.** The single largest source. `framework-gaps.closed_by`, `issues.resolved_by`, `tasks.notes`, and the `proposed_resolution` of closed gaps are written as full sentences narrating *which commit/VER/TASK closed it and how* ("VER-029 / TASK-015 — …", "CLOSED at <sha> …", "Implemented at <sha> … probe->fix->re-audit loop caught …"). These fields are being used as a changelog/audit-trail, which is precisely what rule 5 forbids in a block body (that framing belongs in CHANGELOG / git). `closed_by` reads like an identifier field but is consistently abused as prose.

2. **Origin/discovery narration in descriptions and evidence.** "Surfaced by dogfooding…", "Origin: surfaced by USING the CLI…", "Agent-investigated for root cause … before filing", "Found by the S4 adversarial audit before commit". Process-of-discovery prose that adds nothing to the literal instruction a downstream consumer acts on.

3. **Assert-then-refute / in-body correction.** "the earlier '52' was an arithmetic slip", "an earlier draft's claim … is wrong", "CORRECTION to the earlier synthesis", "now superseded", "REFRAMED from … to …", DEC-0017's "Resolver-route correction (FGAP-068): the resolver returns … rather than spawning …". The body records its own revision history instead of stating only current truth.

**New vs old: a sharp gradient — the guard works where it runs, and recency helps everywhere.**
- **framework-gaps** (the only guarded block) is the cleanest of the heavily-written blocks. Newer gaps (FGAP-034–045, 052–061, 065–067, 071, 073) are *register-clean*: terse, declarative, no provenance. The violations cluster almost entirely in (a) the `closed_by` field added at closure time and (b) older gaps (FGAP-001–033) filed before the register discipline tightened. The guard is a write-time checkpoint, so it shaped the *body at filing* but does not re-fire on the later `closed_by` mutation — which is exactly where the residual gap-block violations live.
- **tasks**: same gradient. Older completed tasks (TASK-001/002/006/007) carry egregious `notes`; newer tasks (TASK-031–037) are clean, with binary `[orchestrator]`/`[subagent]` acceptance_criteria and imperative descriptions.
- **decisions / research / verification**: no guard, and a flat (not improving) violation density across vintages — `context` provenance, `findings_summary` corrections, and `evidence` git-narration recur in the newest items as much as the oldest.
- **session-notes**: uniformly egregious across all 8, by design (see §4).

**Worst blocks by density:** session-notes (100%, every field) and verification (100% of `evidence`) are saturated. By raw volume of violations, framework-gaps leads (largest block), but its *rate* is far lower than verification/session-notes/decisions/research because the guard already cleaned its bodies.

## 4. Broadening recommendation

The guard is a review-checkpoint forcing-function that surfaces the register rules to the filing LLM at write time; it is not a content-judge and is unaffected by `@file` payloads. It demonstrably worked on framework-gaps (bodies clean; only the unguarded `closed_by` mutation and pre-guard legacy items remain). Broadening is warranted. Rank by violation-density × write-frequency:

**Tier 1 — broaden now (high density, high write-frequency):**

1. **tasks.** High write-frequency (43 items, the routine planning unit), egregious `notes`, and the gradient proves the guard would have caught them. Critically, the guard must cover the *closure mutation* (status→completed + `notes`), not just the initial filing — the `notes` violations all land at completion. **Highest-leverage single addition.**
2. **verification.** 35 items, 100% `evidence` violation, written on every task closure. Caveat (see Tier-note): a verification's job is to record proof, so the guard should steer *how* (declarative criteria-results; the test/demo outcome and what it proves) and forbid the git-SHA + probe-loop narration — not suppress evidence. High value.
3. **decisions.** 17 items, ~100% `context`-field provenance, moderate-density but the `context` field is structurally a provenance dump ("FGAP-NNN: …", "Surfaced while scoping …"). Guard the `context` / `consequences` fields against origin-narration and assert-then-refute (DEC-0012/0017).

**Tier 2 — broaden (high density, lower write-frequency):**

4. **issues.** Only 2 items but both egregious (`body` discovery-narration + `resolved_by` git-narration); the field shapes (`body`, `resolved_by`) invite exactly the closure-narration class. Cheap to include.
5. **research.** 11 items, every `findings_summary` carries in-body audit-corrections + method narration. Lower frequency. Nuance: method/grounding narration is closer to a research block's legitimate purpose (rule 6), so the guard should target the assert-then-refute corrections ("the earlier … is wrong", "CORRECTION:") and steer them to edit-to-current-truth, while tolerating method/scope/grounding statements.
6. **features.** 8 items, low density (4 violating), but `motivation` invites narration and FEAT-008's acceptance_criteria carried reframe-provenance. Include for completeness; low cost.

**Exclude from the guard:**

- **session-notes.** This block's *purpose* is a session log — a running narrative of focus/discoveries/status/next-steps including tree state, branch SHAs, and held-flags. Under rule 6 (fit-for-block-type) that narrative IS its correct form, even though it maximally violates rules 1/2/5. Forcing the register here would defeat the block kind. If anything is wanted, it is a *separate, looser* convention for session logs, not the rhetorical-register guard.
- **The empty blocks** (requirements, rationale, spec-reviews, layer-plans, context-contracts, phase, story, work-orders) — no items to protect; the catalog/samples-level register can cover them when first written. **conventions** is already register-clean (one minor provenance reference); low priority, include only as a cheap catch-all.

**One structural fix that pays off independent of broadening:** the largest single violation source is the *closure-time* fields (`closed_by`, `resolved_by`, `notes`-at-completion) being used as narrative changelog. Whatever broadening lands, it must fire on the status-mutation/update write path, not only the initial append — otherwise the dominant class escapes the guard exactly as it does on framework-gaps today.

## Summary recommendation

Broaden the write-time register guard from framework-gaps to **tasks, verification, decisions, issues, research, features** (ranked by density × frequency above), make it fire on **closure/update mutations** (not just initial append) so the `closed_by`/`resolved_by`/`notes`-at-completion narration is caught, and **exclude session-notes** as a deliberately-narrative block kind. The dominant violation class everywhere is rule-5 provenance/process/git narration, with assert-then-refute corrections second; hedging and first-person are near-absent. The guard already demonstrably cleaned framework-gaps bodies, so the mechanism is proven for the broadened set.
