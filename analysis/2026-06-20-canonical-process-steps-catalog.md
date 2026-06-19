# Canonical development-process steps — catalog for `/run-skill-generator`

Date: 2026-06-20
Branch: context-jit-spec-v2
Mode: read-only research (no substrate/code mutation)

## Purpose

Establish the COMPLETE, ordered set of canonical process steps for a code change (a feature OR an in-loop fix) in pi-project-workflows, structured so each can later be emitted as a discrete `/run-<name>` command by a `/run-skill-generator`. Two sources are cross-validated: the **authored canon** (`CLAUDE.md` + the named conventions/mandates) and the **practiced reality** mined from `claude-history` session `8490e49a-7509-477f-9cb5-92f16552090a` (the session that ran the full pipeline end to end for TASK-033, TASK-065, and others).

Where practice HARDENED a step beyond the terse authored canon, that is flagged `[PRACTICE-HARDENED]` — it is part of the comprehensive set, not an embellishment.

## Evidence base (practiced reality)

- **Session `8490e49a-7509-477f-9cb5-92f16552090a`** (project `workflowsPiExtension`). Tool-use distribution: 15538 Bash, 6296 Read, 2549 Edit, 824 Write, 650 Agent (386 `general-purpose`, 253 `Explore`, 7 `Plan`), 129 ExitPlanMode, 118 EnterPlanMode. The orchestrator's own edits are essentially absent as source-authoring (implementation runs through coding subagents); the orchestrator's Bash is the gate-running + CLI-driving + commit surface.
- **The single most load-bearing artifact**: the orchestrator's own full enumeration of the pipeline at `2026-06-13T04:21:49Z` — *"My understanding of the canonical pipeline, in total, for TASK-033"* — reproduced and decomposed below. It states every step, its gate, and its governing mandate, and it was then ACTUALLY executed (plan approved 04:28 → coding subagent + gates → runtime demo 04:36 → demo surfaced gaps → fresh investigation agent wrote its own report 04:54–05:05 → committed `e5f0aeb` → filing recommendations recorded for user scope).
- **The provenance-stop hook text verbatim** (a `PreToolUse:Bash` hook, `.claude/hooks/gap-register-guard.sh`), captured from a real fired block at `2026-06-13T04:36:43Z` and the encoding turns at `2026-06-10T23:35:47Z` — quoted under Step 5 below.
- **Per-criterion verification + closure** practiced in TASK-065 (`2026-06-15`): `VER-051` filed with the criteria array (criterion #11 appended post-probe per the user), `content_parent` chain confirmed, `context-validate` warnings-only, then `complete-task`. TASK-030/038 closures (`2026-06-07`) show the same `verification → verification_verifies_item edge → complete-task` shape.

## Authored-canon anchors (CLAUDE.md)

- "Canonical implementation pipeline (every code change, including in-loop fixes)" — the 7-point loop wrapping the Completion Sequence.
- "Completion Sequence (mandatory after every code change)" — the 13 numbered steps (edit→build→check→test→runtime demo→adversarial probe→docs+skills→commit→status cascade→merge→release→credentialed verification→publish).
- "Subagent dispatch fit", "Experience-Gap Handling", "Analysis-MD → Research block", "Project Blocks / filing patterns / filing-provenance", "pi-context-cli — direct-drive discipline".
- Named bindings: `feature-branch-workflow`, `docs-surface-sync`, `de-ephemeralize-at-source`, `gap-explore-surfaces-class`, the rhetorical-register, `filing-provenance`, explore-before-file, derive-decisions-from-facts; the `feedback_*` mandates (clean-git-baseline, plan-mode-explore-agent, implementation-via-subagent, runtime-demo-plus-adversarial-per-step, adversarial-not-self-audits, no-background-subagents, subagents-no-npm, cross-package-dist-rebuild-precondition, hold-releases-until-authorized, git-push-authorized).

---

# The ordered step catalog (each rendered as a `/run-<name>` command spec)

The loop is: **clean baseline → plan-mode explore → design → substrate-file the plan (provenance-stop) → in-progress + branch → coding subagent implements → build/check/test → runtime demo → fresh adversarial probe → iterate-to-zero (each finding re-enters, fresh re-audit) → de-ephemeralize findings at source → docs-surface-sync → merge → substrate closure (verification per criterion + complete-task + honest status) → [release HELD] → [publish: user]**.

Steps 1–14 are the agent's responsibility. Steps marked **[USER-GATE]** cannot be auto-completed — they require a user grant or are consequential real-global actions. Each step lists: purpose, inputs, preconditions/entry gate, actor, action, outputs, exit gate, governing conventions, mechanizability.

---

## 1. `/run-baseline` — establish a clean git baseline

- **Purpose**: guarantee a porcelain-clean integration branch before any mutating step.
- **Inputs**: integration branch name (e.g. `context-jit-spec-v2`).
- **Preconditions / entry gate**: a code change is about to begin.
- **Actor**: orchestrator.
- **Action**: `git status` must be clean on the integration branch; stash/commit/abort any dirt; verify HEAD.
- **Outputs**: confirmed clean tree + recorded baseline SHA.
- **Exit gate**: `git status` reports clean; no uncommitted changes carried into the work.
- **Conventions enforced**: `feedback_clean_git_baseline_before_implementation` ("repeatable element for EVERY plan").
- **Mechanizable**: fully (no user gate). Pure check + report; refuse to proceed on a dirty tree.
- **Practice evidence**: TASK-033 pipeline step 1 ("Clean git baseline on the integration branch `context-jit-spec-v2`").

## 2. `/run-establish-context` — confirm active substrate + read the work item verbatim + verbatim-delta check

- **Purpose**: anchor on the real current state before designing; never act from recalled narrative.
- **Inputs**: the target item id(s) (TASK/FGAP/FEAT/DEC); governing user stories if the item is story-bound.
- **Preconditions / entry gate**: clean baseline (Step 1).
- **Actor**: orchestrator (reads via the pi-context CLI directly).
- **Action**: read `.pi-context.json` `contextDir` to confirm the active substrate; **confirm the resolved `contextDir` with the user before any read/write**; read the TASK + FEAT + touched conventions/gaps VERBATIM from the substrate (`read-block-item`); run the **verbatim-delta check** — diff the item's filed criteria against any governing user-story statements ("any delta is a filing defect to surface, not a requirement to implement").
- **Outputs**: confirmed active-substrate name; verbatim item text; a delta report (empty or defects-to-surface).
- **Exit gate**: active substrate confirmed by the user; any verbatim delta surfaced (not silently implemented).
- **Conventions enforced**: "How to establish exact current context"; `filing-provenance` (P3 story-diff); `feedback_story_anchored_criteria_no_filing_augmentation`; `feedback_verify_substrate_state_before_reporting`; CLI direct-drive.
- **Mechanizable**: mostly; the "confirm `contextDir` with the user" is **[USER-GATE]** (a confirmation the canon requires before reads/writes).
- **Practice evidence**: TASK-033 pipeline step 2.

## 3. `/run-plan-explore` — plan mode + read-only Explore investigation

- **Purpose**: investigate the approach EXCLUSIVELY via read-only Explore agents; the orchestrator never greps as investigation.
- **Inputs**: the work item; the question(s) the design must resolve.
- **Preconditions / entry gate**: context established (Step 2).
- **Actor**: orchestrator dispatches **Explore** subagents (read-only); foreground only.
- **Action**: `EnterPlanMode`; dispatch Explore agents to trace/enumerate the relevant code, schemas, prior-art, and the gap/decision's whole CLASS; gather file:line ground truth. Run Explore even for "obvious" fixes.
- **Outputs**: grounded investigation findings (file:line, type signatures, prior-art coverage).
- **Exit gate**: enough ground truth to resolve the approach with no open "check if" questions.
- **Conventions enforced**: `feedback_plan_mode_explore_agent`, `feedback_plan_mode_protocol`, `feedback_explore_even_obvious_fixes`, `feedback_scope_agents_with_facts`; "Subagent dispatch fit" (Explore = read/trace/enumerate ONLY).
- **Mechanizable**: fully (dispatch + collect). No user gate. The Explore subagent type is read-only by construction.
- **Practice evidence**: 253 Explore dispatches in-session; TASK-033 pipeline step 3 ("investigate exclusively via Explore agents (I never grep as investigation)").

## 4. `/run-design-plan` — resolve the approach into a written, decision-complete plan

- **Purpose**: turn investigation into a resolved plan that contains DECISIONS, not "check if".
- **Inputs**: Step 3 findings.
- **Preconditions / entry gate**: investigation complete.
- **Actor**: orchestrator (plan author). Optionally a **Plan** architect subagent (read-only) for plan shaping.
- **Action**: resolve every fork. **Run the derivation test**: a choice derivable from system facts (registry/code structure, an existing surface/convention, a standing mandate) is DERIVED + stated, not surfaced as a "your call" fork. No hedging.
- **Outputs**: a written plan (decision-complete, with the docs-surface-sync deliverables enumerated when the change is user-facing).
- **Exit gate**: zero unresolved "check if"; every narrowing qualifier traced to a user decision or struck.
- **Conventions enforced**: `feedback_no_hedging_in_plans`, `feedback_derive_decisions_dont_surface_as_forks`, `feedback_no_inferior_options`, `feedback_best_of_breed_not_minimal_release`, `feedback_no_scope_reduction`.
- **Mechanizable**: partially. The derivation/no-hedge discipline is mechanizable as a lint over the plan; the substantive design judgement is the model's.

## 5. `/run-file-plan` — write resolved decisions into the substrate (the provenance-stop) **[USER-GATE]**

- **Purpose**: file the resolved plan as substrate items (TASK/FGAP/DEC), decomposing a feature into tasks per the `feature-decomposition` convention — BEFORE any briefs. The substrate IS the plan-of-record.
- **Inputs**: the resolved plan; the `feature-decomposition` convention text (composed verbatim, not decomposed ad hoc).
- **Preconditions / entry gate**: decision-complete plan (Step 4); prior-art search done (explore-before-file).
- **Actor**: orchestrator composes the filing; **the USER grants permission**.
- **Action**: compose each planning-block write; attempt it via the pi-context CLI; the `PreToolUse:Bash` provenance-stop hook BLOCKS the write (exit code 2) and demands the required sequence. The orchestrator ENDS ITS TURN presenting the USER a **per-element provenance table** (element → provenance class P1–P4 → evidence: verbatim words / directing message / cited fact-convention-decision); the USER grants or refuses; only on grant does the orchestrator re-issue the SAME command with ` # provenance-reviewed` appended (the sentinel attests the USER's granted permission, never self-review). Verify every write by reading it back.
- **Outputs**: filed TASK/FGAP/DEC items + wiring edges; read-back confirmation; a scoped commit per filing.
- **Exit gate**: the user's explicit grant for EACH guarded payload; read-back matches; `context-validate` clean; the filing committed.
- **Conventions enforced (verbatim hook text)**: `filing-provenance` ("the planning-block write guard STOPS every such write… files only after the user grants permission — the `# provenance-reviewed` sentinel attests the USER's granted permission… never self-review"). Also the rhetorical-register R1–R6 (declarative / terse / self-contained / exact / current-truth-only / gaps-carry-no-acceptance-criteria), `feedback_plan_mode_step_one_substrate_write`, `feedback_filing_provenance` chain, `feedback_commit_immediately_after_substrate_filing`, explore-before-file, `de-ephemeralize-at-source`, the "Intended audience" + "Rhetorical situation" bindings.
- **Mechanizable**: NO — this is an irreducible **[USER-GATE]**. The hook's design intent is precisely that self-review cannot clear it; permission "comes only from the user." A `/run-file-plan` command can compose the payload, present the provenance table, and STOP — but cannot append the sentinel without a user grant.
- **Practice evidence**: hook text quoted verbatim from a real block (`2026-06-13T04:36:43Z`); the encoding turns (`2026-06-10T23:35:47Z`, `…23:38:27Z`). Verbatim required sequence:
  > "Blocked: a planning-block write. This is a USER-PERMISSION stop — do NOT re-issue in this same turn. REQUIRED SEQUENCE: 1. STOP. End your turn by presenting to the USER a per-element provenance table for the payload… 2. The USER grants or refuses filing permission. Permission comes only from the user — never from your own review. 3. Only after the user grants it, re-issue the SAME command with ` # provenance-reviewed` appended."

## 6. `/run-start-branch` — set the task in-progress + branch off the clean integration branch

- **Purpose**: mark work begun + isolate it on a feature branch (substrate stays single-writer on the integration branch).
- **Inputs**: TASK id; integration branch name; feature-branch name (`feat/<task-slug>`).
- **Preconditions / entry gate**: the plan is filed (Step 5) and committed; integration branch porcelain-clean.
- **Actor**: orchestrator.
- **Action**: `update-block-item` set TASK → `in-progress` (a planning write — also provenance-gated if it carries narrowing field text; in practice a status flip is low-augmentation but still routes through the guard) on the integration branch; then `git checkout -b feat/<task-slug>` off the clean integration branch.
- **Outputs**: TASK in-progress; feature branch created; Claude Code Task tool entry set in_progress.
- **Exit gate**: branch exists off a clean integration HEAD; task status reflects in-progress.
- **Conventions enforced**: `feature-branch-workflow`, `feedback_status_updates_after_each_step`; substrate single-writer on the integration branch.
- **Mechanizable**: mostly; inherits the provenance gate only if the status write carries augmenting field text (a bare status flip does not narrow user intent).
- **Practice evidence**: TASK-033 pipeline steps 3–4.

## 7. `/run-implement` — coding subagent implements from the approved plan

- **Purpose**: implement the change; the orchestrator NEVER hand-writes source.
- **Inputs**: the approved plan (ExitPlanMode-approved); the verbatim filed criteria; the brief mandate front-matter.
- **Preconditions / entry gate**: plan approved via `ExitPlanMode`; feature branch active.
- **Actor**: a **foreground general-purpose (executing) coding subagent** with Edit/Write tools (NOT Explore — Explore is read-only).
- **Action**: dispatch a foreground coding subagent. The brief front-loads: the mandates, the verbatim filed criteria, **no-npm** (orchestrator runs all gates + rebuilds upstream `dist/` on the cross-package precondition), per-step commit, no echo banners, no `--no-verify`, and — for a user-facing surface change — the **docs-surface-sync deliverables enumerated by name** (READMEs + op strings + SKILL source + CHANGELOG). A brief without the docs-sync deliverable is incomplete.
- **Outputs**: edited source; per-step commits by the subagent; the subagent's report.
- **Exit gate**: implementation matches the plan; subagent committed each step (no accumulated dirty state); the orchestrator independently verifies the subagent's claims (commits, files, counts).
- **Conventions enforced**: `feedback_implementation_via_subagent`, `feedback_no_adhoc_dev`, `feedback_no_ad_hoc_code`, `feedback_constraining_subagent_briefs`, `feedback_subagents_no_npm`, `feedback_subagent_commits_per_step`, `feedback_no_echo_banner_narration`, `feedback_no_background_subagents` (foreground only), `feedback_verify_agent_tool_surface` + `feedback_dispatch_agent_type_must_match_tool_directives` (Write-capable type), `feedback_orchestrator_owns_subagent_output`, `docs-surface-sync` (brief-level enforcement).
- **Mechanizable**: mostly (brief composition + dispatch + verification). No user gate, though the model authors the brief.
- **Practice evidence**: 386 general-purpose dispatches; TASK-033 pipeline step 5; plan-approval turn `2026-06-13T04:28:04Z`.

## 8. `/run-gates` — build → check → test (the Completion Sequence gates), run by the orchestrator

- **Purpose**: confirm the runtime can load the change; the orchestrator runs ALL npm gates (subagents never run npm).
- **Inputs**: the edited working tree.
- **Preconditions / entry gate**: implementation committed (Step 7); on a cross-package change, the UPSTREAM `dist/` is rebuilt BEFORE the subagent's husky commit.
- **Actor**: orchestrator.
- **Action**: `npm run build` → `npm run check` (biome + tsc) → `npm test` — **full output inspection, no pipe-to-tail** (pipe masks exit code). On husky failure: fix root cause + new commit, never `--no-verify`.
- **Outputs**: green build/check/test with full output captured.
- **Exit gate**: 0 test failures, biome+tsc clean, exit codes inspected un-piped.
- **Conventions enforced**: "Completion Sequence" 2–4, `feedback_pipe_masks_exit_code`, `feedback_subagents_no_npm`, `feedback_cross_package_dist_rebuild_precondition`, `feedback_post_merge_build_mandatory`, "never `--no-verify`".
- **Mechanizable**: fully. No user gate.

## 9. `/run-runtime-demo` — real end-to-end invocation against a real substrate (LOAD-BEARING)

- **Purpose**: exercise the actual feature path end to end via REAL invocation — tests-pass is necessary, not sufficient.
- **Inputs**: the feature path; a safe substrate target (a `/tmp` DUPLICATE for any mutating demo, never live `.context`).
- **Preconditions / entry gate**: gates green (Step 8).
- **Actor**: orchestrator (or a write-capable executing agent). NEVER Explore.
- **Action**: invoke the real path — tsx eval against block-api / `pi -p` tool dispatch / direct pi-context CLI invocation — exercising the genuine mechanism (e.g. the real `/context accept-all` + `/context install` ceremony, NOT a hand-copied file mock). Substrate-mutating demos run on a backed-up `/tmp` duplicate; promote to live only via separate user-approved rename.
- **Outputs**: observed end-to-end output demonstrating the criterion holds.
- **Exit gate**: the actual observed behavior matches the acceptance criterion (e.g. "blocked→ready on gate close"; "validate WARNS not errors on an unarticulated artifact").
- **Conventions enforced**: "Completion Sequence" 5 (load-bearing), `feedback_runtime_demo_plus_adversarial_per_step`, `feedback_live_demo_no_regression_per_cycle`, `feedback_substrate_backup_before_mutation_demos`, "Subagent dispatch fit" (runs-code ⇒ executing agent not Explore).
- **Mechanizable**: mostly; the substrate-promotion rename is **[USER-GATE]** (user-approved). The demo itself is mechanizable. **[PRACTICE-HARDENED]**: practice forced the demo onto a `/tmp` duplicate and rejected file-copy mocks mid-demo (`2026-06-13T04:53:53Z`: "Hand-copying sample files… is ad-hoc — it bypasses the real `/context install` ceremony and proves nothing").
- **Practice evidence**: TASK-033 demo (`2026-06-13T04:36:15Z` "Runtime demo (AC2) — throwaway `/tmp` substrate, never live `.context`"); TASK-065 "real-CLI runtime demo (blocked→ready on gate close)".

## 10. `/run-adversarial-probe` — fresh-context adversarial probe (LOAD-BEARING)

- **Purpose**: probe for false-pass scenarios with a fresh context that INDEPENDENTLY re-derives — never a self-audit.
- **Inputs**: the change + its claimed criteria.
- **Preconditions / entry gate**: runtime demo passed (Step 9).
- **Actor**: a **fresh-context adversarial agent** (general-purpose), independent of the composer/orchestrator; grep when sufficient. Foreground.
- **Action**: the probe independently re-derives the criteria and hunts false-passes (side-effect masks feature / assertion no longer tests its claim / import silently no-ops / fallback swallows failure). The probe writes its OWN findings. The orchestrator then **independently re-verifies the probe's load-bearing claims** — it does NOT relay the verdict — because both the probe and the orchestrator can under-flag.
- **Outputs**: probe verdict + enumerated findings; the orchestrator's independent re-verification.
- **Exit gate**: a pass that finds nothing new, mutually re-derived (probe re-derives orchestrator's; orchestrator re-verifies probe's).
- **Conventions enforced**: "Completion Sequence" 6, `feedback_adversarial_audits_not_self_audits`, `feedback_adversarial_can_underflag`, `feedback_runtime_demo_plus_adversarial_per_step`, `feedback_no_background_subagents`.
- **Mechanizable**: fully (dispatch + independent re-verify). No user gate.
- **Practice evidence**: TASK-065 "fresh adversarial probe (11 criteria…)"; TASK-030 "first adversarial probe surfaced a real divergence" (`2026-06-07T02:58:32Z`).

## 11. `/run-iterate-to-zero` — every finding re-enters the FULL pipeline; a fix gets a FRESH re-audit

- **Purpose**: drive findings to zero; a divergence is NOT patched ad hoc — it re-enters explore→plan→approve→agent, scoped to its whole CLASS.
- **Inputs**: each finding from Step 9/10.
- **Preconditions / entry gate**: a non-empty finding set.
- **Actor**: orchestrator (re-enters the loop, dispatching Explore for class-enumeration then a coding subagent).
- **Action**: for each finding, Explore ENUMERATES the whole class → plan → user approval (and provenance-stop if the fix changes filed scope) → coding subagent → gates. **A fix does NOT inherit the prior green**: re-run the runtime demo + a FRESH adversarial re-audit of the fix specifically (a CRITICAL especially). Regression/rename classes close only via exhaustive grep re-enumeration to zero. Loop 9→10→11 until a pass finds nothing new.
- **Outputs**: class-level fixes; fresh re-audit per fix; convergence record.
- **Exit gate**: a fresh pass finds nothing new (not the inherited green).
- **Conventions enforced**: "Canonical implementation pipeline" 3–4, "Completion Sequence" 6 (fresh re-audit per finding), `feedback_class_fix_completeness_reenumeration`, `feedback_audit_findings_are_work`, `feedback_subagent_judgment_is_scoping`, `feedback_no_scope_reduction`.
- **Mechanizable**: orchestration is mechanizable; embeds the **[USER-GATE]** provenance-stop whenever a fix re-files scope.
- **Practice evidence**: TASK-030 "the iterate-to-zero loop you mandated" with the divergence fixed and re-verified; the authored loop.

## 12. `/run-de-ephemeralize` — investigation/findings captured durably AT THE SOURCE

- **Purpose**: capture intel durably by the agent that produced it, at production time — never transient output the orchestrator re-renders (signal loss). Applies whenever investigation (esp. an experience gap surfaced by the demo/probe) produces findings.
- **Inputs**: an investigation/exploration task that produces intel.
- **Preconditions / entry gate**: a finding or experience gap surfaced (often by Step 9/10).
- **Actor**: the **investigating/exploring agent WRITES ITS OWN report** (`analysis/<date>-<slug>.md`). The brief MUST carry the write-your-own-report instruction (a brief without it is incomplete). An experience gap is agent-investigated for root-cause / shape / reproducible-conditions / **prior-art search (explore-before-file)** / **class (gap-explore-surfaces-class)** — never ad-hoc self-filed. The agent returns a POINTER + verdict, not the content. The orchestrator verifies + commits; it does not author the artifact from the summary.
- **Outputs**: a committed `analysis/*.md`; filing recommendations (id+status of any existing item; class verdict). Filing of a new FGAP is **[USER-GATE]** scope (the user decides; refile only after prior-art confirms it is untracked).
- **Exit gate**: the report exists + is committed + independently verified; prior-art + class surfaced; filing recommendation recorded for the user's scope decision.
- **Conventions enforced**: `de-ephemeralize-at-source`, `gap-explore-surfaces-class`, explore-before-file, "Experience-Gap Handling", `feedback_experience_gap_agent_investigation`, `feedback_write_reports_to_docs` / `analysis/` for tracked, `feedback_docs_reports_gitignored`, "Analysis-MD → Research block" (propose, don't auto-file).
- **Mechanizable**: dispatch + verify + commit are mechanizable; the **filing scope decision is [USER-GATE]**.
- **Practice evidence**: TASK-033 demo surfaced 2 experience gaps → fresh investigation agent wrote `analysis/2026-06-13-install-surface-and-guard-scope-gaps.md` itself, committed `e5f0aeb`, returned pointer+verdict, filing recommendations recorded for user scope (`2026-06-13T04:54:29Z`, `…05:05:01Z`, `…05:06:43Z`).

## 13. `/run-docs-surface-sync` — audit + sync the user-facing surface

- **Purpose**: for any user-facing surface change, CHECK (not just append) every surface the change makes stale and correct it.
- **Inputs**: the change's surface footprint.
- **Preconditions / entry gate**: implementation converged (Step 11).
- **Actor**: orchestrator (or the coding subagent per its brief's enumerated deliverable).
- **Action**: audit BOTH the package README(s) AND the monorepo root README for stale statements; update the surfaced strings of any changed reflected op (`description`/`promptSnippet` in `ops-registry.ts`); update `skill-narrative.md` when the surface is a pi op; then `npm run skills` to regen SKILL.md (never hand-edit). All **usage-only** (what it does + how to use it). Fix/defect/correction framing goes ONLY to CHANGELOG `[Unreleased]` (gate-enforced by `check-changelog`).
- **Outputs**: corrected READMEs + op strings + SKILL.md regenerated + CHANGELOG `[Unreleased]` entry.
- **Exit gate**: no stale surface statement remains (a probe finding stale docs = an UNCONVERGED loop); op strings refreshed lockstep; SKILL regenerated; CHANGELOG entry present.
- **Conventions enforced**: `docs-surface-sync` (binding), "Completion Sequence" 7, `feedback_docs_usage_only_no_fix_reference`, `feedback_op_description_is_user_facing_surface`, `feedback_operating_context_lockstep`, `feedback_substrate_blocks_not_changelogs`.
- **Mechanizable**: fully (the audit is a checklist over a known surface set; SKILL regen is a command). No user gate.

## 14. `/run-merge` — merge to the integration branch + rebuild

- **Purpose**: land the converged change on the integration branch (pi loads `dist/`).
- **Inputs**: the converged feature branch.
- **Preconditions / entry gate**: docs synced (Step 13); all gates green; iterate-to-zero converged.
- **Actor**: orchestrator.
- **Action**: merge the feature branch to the integration branch (`feature-branch-workflow`); rebuild (`npm run build`); regen skills if a skill source/op string changed.
- **Outputs**: merged integration branch; rebuilt `dist/`.
- **Exit gate**: merge clean; post-merge build mandatory and green.
- **Conventions enforced**: `feature-branch-workflow`, "Completion Sequence" 10, `feedback_post_merge_build_mandatory`.
- **Mechanizable**: fully. No user gate (push remains the user's per the standing constraint — see Step 17).

## 15. `/run-closure` — substrate closure: verification per criterion + complete-task + honest status **[USER-GATE]**

- **Purpose**: close the work honestly in the substrate — file the verification proving EACH acceptance criterion, complete the task, set the feature to its TRUE bucket.
- **Inputs**: the verified criteria (the observable predicates the TASK declared); the demo/probe evidence; the TASK + FEAT ids.
- **Preconditions / entry gate**: merged + rebuilt (Step 14); criteria actually met.
- **Actor**: orchestrator composes; **the USER grants** the guarded closure writes.
- **Action**: file a `verification` item whose criteria array carries one predicate-proof per acceptance criterion (criteria are the observable predicates; the verification is the per-criterion PROOF, with evidence — commits/observed output); append the `verification_verifies_item` edge; `complete-task --taskId … --verificationId …`; set the addressed FEATURE to its TRUE bucket — `complete` ONLY when every acceptance criterion is actually met, `in-review` when a credentialed/release-gated piece remains (deferred/credentialed pieces NAMED, never faked); `context-validate` clean (warnings-only acceptable if honest). These are planning-block writes → the provenance-stop fires → the USER grants. Delete the feature branch; mark the Claude Code Task tool entry complete.
- **Outputs**: VER item; closure edge; task complete; feature at honest bucket; branch deleted; `context-validate` clean.
- **Exit gate**: the user's grant for the guarded closure payloads; every criterion has a proof; feature bucket is honest; validate clean.
- **Conventions enforced**: "Canonical implementation pipeline" 7, "Completion Sequence" 9, `filing-provenance` (closure writes are guarded), `feedback_fgap_closure_canonical_4_fields` (for an FGAP close: status + closed_by + closed_at + closing-citation), `feedback_status_updates_after_each_step`, "honest status" (no faked complete).
- **Mechanizable**: composition + validate are mechanizable; the guarded-write grant + the bucket-honesty judgement are **[USER-GATE]** / model-judgement.
- **Practice evidence**: TASK-065 → `VER-051` filed (criteria array, #11 appended post-probe), `content_parent` chain confirmed, `context-validate` warnings-only, then `complete-task`; FGAP-061 correctly kept `identified` (NOW slice only) — the honest-status discipline in action (`2026-06-15T13:27:16Z`, `…13:29:34Z`, `…22:04:10Z`). TASK-033 closure explicitly set FEAT-007 → `in-review` because its criterion names a release and releases are HELD (TASK-033 pipeline step 11).

## 16. `/run-release` — lockstep version bump **[USER-GATE: HELD]**

- **Purpose**: bump versions in lockstep + commit + tag.
- **Inputs**: bump level (patch/minor/major) per commit type.
- **Preconditions / entry gate**: closure complete AND **explicit per-release authorization** (releases are HELD).
- **Actor**: orchestrator — but ONLY on explicit grant.
- **Action**: `npm run release:patch|minor|major` (invokes `scripts/bump-versions.js`; never `npm version -ws`).
- **Outputs**: bumped package.jsons + release commit + tag.
- **Exit gate**: explicit user authorization for THIS release.
- **Conventions enforced**: `feedback_hold_releases_until_authorized`, `feedback_release_discipline`, `feedback_version_before_done`, lockstep-versioning convention, "Completion Sequence" 11.
- **Mechanizable**: the mechanics are; the trigger is an irreducible **[USER-GATE]** (HELD until per-release authorization).

## 17. `/run-credentialed-verify` + `/run-publish` — pre-publish protocol + publish **[USER-GATE]**

- **Purpose**: run the canonical credentialed verification protocol (arc-completion releases shipping new public surface) and publish.
- **Inputs**: the verification protocol (`docs/reports/pi-internal-verification-protocol-2026-05-02.md` or successor); npm credentials.
- **Preconditions / entry gate**: an arc-completion release authorized (Step 16).
- **Actor**: credentialed verification — orchestrator (uses pi's `auth.json`); publish — **USER** (interactive `npm login` + OTP).
- **Action**: run the credentialed protocol before publish (never-run credentialed = detects no fragility); then `npm publish` (user OTP). Push is the user's in this stretch.
- **Outputs**: credentialed-verify pass record; published packages.
- **Exit gate**: credentialed protocol passed; user-supplied OTP.
- **Conventions enforced**: "Completion Sequence" 12–13, `feedback_pre_publish_credentialed_smoke`, `feedback_git_push_authorized` (push is the agent's elsewhere; this stretch it is the user's), `feedback_verify_before_assuming`, `feedback_never_execute_destructive_unasked`.
- **Mechanizable**: credentialed-verify is mechanizable when authorized; **publish + OTP is an irreducible [USER-GATE]**.

---

# Enumerated step → command list (in order)

| # | Command | One-line purpose | User gate? |
|---|---|---|---|
| 1 | `/run-baseline` | Establish a porcelain-clean integration-branch git baseline before any mutating step | no |
| 2 | `/run-establish-context` | Confirm the active substrate + read the work item verbatim + run the verbatim-delta check | confirm active substrate |
| 3 | `/run-plan-explore` | Enter plan mode; investigate exclusively via read-only Explore agents | no |
| 4 | `/run-design-plan` | Resolve the approach into a decision-complete written plan (derive, don't hedge) | no |
| 5 | `/run-file-plan` | File resolved decisions into the substrate behind the provenance-stop (per-element table → user grant → sentinel) | **YES** (provenance grant) |
| 6 | `/run-start-branch` | Set the task in-progress + branch off the clean integration branch | (gated only if status write augments) |
| 7 | `/run-implement` | Foreground coding subagent implements from the approved plan; orchestrator never hand-writes source | no |
| 8 | `/run-gates` | Orchestrator runs build → check → test, full output, no pipe-masking | no |
| 9 | `/run-runtime-demo` | Real end-to-end invocation against a `/tmp` duplicate substrate (never live) | substrate-promotion rename |
| 10 | `/run-adversarial-probe` | Fresh-context adversarial probe; orchestrator independently re-verifies, never relays the verdict | no |
| 11 | `/run-iterate-to-zero` | Every finding re-enters the full pipeline at class scope; a fix gets a FRESH re-audit | (inherits #5 gate on re-filing) |
| 12 | `/run-de-ephemeralize` | Investigating agent writes its own report; surfaces prior-art + class; experience gaps agent-investigated | filing scope decision |
| 13 | `/run-docs-surface-sync` | Audit + correct READMEs/op-strings/SKILL (usage-only); CHANGELOG `[Unreleased]` for fix framing | no |
| 14 | `/run-merge` | Merge the converged branch to the integration branch + rebuild `dist/` | no |
| 15 | `/run-closure` | File the verification per acceptance criterion + complete-task + set the feature to its honest bucket | **YES** (provenance grant + honesty) |
| 16 | `/run-release` | Lockstep version bump + commit + tag | **YES** (HELD; per-release authorization) |
| 17 | `/run-credentialed-verify` + `/run-publish` | Credentialed protocol then publish | **YES** (npm login + OTP, user) |

# User-gate summary (steps a `/run-skill-generator` must emit as STOP-and-wait, not auto-complete)

- **Step 2** — confirming the active substrate before any read/write (canon requires user confirmation of the resolved `contextDir`).
- **Step 5 (`/run-file-plan`) — the hardest, irreducible gate.** The provenance-stop is a `PreToolUse:Bash` hook whose explicit design is that self-review CANNOT clear it: "Permission comes only from the user — never from your own review." A command can compose the payload + present the per-element provenance table + STOP; it cannot append ` # provenance-reviewed` without a user grant. Re-entered by Step 11 whenever a fix re-files scope.
- **Step 9** — the substrate-promotion rename (mutating demos run on a `/tmp` duplicate; promotion to live is a separate user-approved rename).
- **Step 12** — the FGAP/TASK/DEC *filing scope* decision (the user decides whether a surfaced gap is filed; the agent only investigates + recommends).
- **Step 15 (`/run-closure`)** — guarded closure writes (provenance grant) plus the honest-bucket judgement (no faked `complete`).
- **Steps 16–17** — releases are HELD (per-release authorization required); publish requires interactive `npm login` + OTP, which is a user action; push is the user's in this stretch.

All other steps (1, 3, 4, 6-bare, 7, 8, 10, 11-orchestration, 13, 14) are fully mechanizable as autonomous `/run-<name>` commands.

# Where PRACTICE hardened the terse authored canon (part of the comprehensive set)

- **Provenance-stop as a HOOK with a verbatim required-sequence + sentinel** (Step 5). The canon names `filing-provenance`; practice encoded it as a fired `PreToolUse:Bash` block whose own text forbids re-issue in the same turn and whose sentinel attests the USER's grant (`2026-06-10`, `2026-06-13`).
- **Runtime demo MUST run on a `/tmp` duplicate and MUST exercise the genuine ceremony** (Step 9). Practice rejected a file-copy install mock mid-demo as proving nothing (`2026-06-13T04:53:53Z`).
- **De-ephemeralize-at-source as the demo's downstream** (Step 12). When the TASK-033 demo surfaced 2 experience gaps, practice dispatched a fresh write-capable investigation agent that wrote its OWN report, returned a pointer, and the orchestrator verified+committed — not a summary re-rendered to file.
- **Orchestrator independently re-verifies the probe's load-bearing claims** (Step 10) — practice treats the probe verdict as under-flaggable, never relayed.
- **Honest-status discrimination at closure** (Step 15) — TASK-065 completed while FGAP-061 correctly stayed `identified` (NOW slice only); TASK-033 set FEAT-007 → `in-review` because a release criterion was HELD. Practice refuses faked `complete`.
- **The orchestrator's own full pipeline enumeration as a pre-implementation step** — practice produced and the user approved an explicit total-pipeline statement before TASK-033 work (`2026-06-13T04:21:49Z`); this is itself a candidate `/run-pipeline-recital` pre-flight.
