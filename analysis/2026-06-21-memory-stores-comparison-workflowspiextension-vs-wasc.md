# Memory stores comparison: workflowsPiExtension (A) vs WASC (B)

Date: 2026-06-21

Stores compared (every `*.md` read in full):
- **A** = `/Users/david/.claude/projects/-Users-david-Projects-workflowsPiExtension/memory/`
- **B** = `/Users/david/.claude/projects/-Users-david-Projects-wasc-school-wide-improvement-plan/memory/`

Every `description` below is quoted verbatim from the file's YAML frontmatter (`description:` key), except `feedback_no_echo_banner_narration.md` (A), whose frontmatter has `name: ""` and no `description:` field — for that file the verbatim text is taken from its `MEMORY.md` index line and its body, both marked.

## Inventory A

107 `*.md` files: 103 `feedback`, 2 `reference`, 1 `appendix`, plus `MEMORY.md` (the index; counted in the 107).

| File | name | type | description (verbatim) |
|---|---|---|---|
| feedback_adversarial_audits_not_self_audits.md | Adversarial Audits by Fresh-Context Agents Only | feedback | Never self-audit — always dispatch a fresh-context adversarial reviewer agent. Self-audit returns confirmation bias, not rigor. Applies to composing agents, orchestrators, and any party evaluating its own output. |
| feedback_adversarial_can_underflag.md | feedback_adversarial_can_underflag | feedback | The fresh-context adversarial probe can be wrong/under-flag; the orchestrator independently re-verifies its output (re-grep), never treats its verdict as infallible. |
| feedback_agent_briefs_require_empirical_cross_validation.md | Agent investigation briefs must require empirical cross-validation, not source-only conclusions | feedback | Source-fragment reading produces confident-sounding but wrong conclusions when not cross-checked against runtime evidence (traces, session JSONL, observed behavior); briefs must require both axes |
| feedback_agent_output_to_file.md | Agent output must go to file not inline | feedback | When tasking agents for reports/analysis, instruct them to write output to file — do not consume main context with large agent returns |
| feedback_always_plain_english.md | always-plain-english | feedback | Always communicate in plain English; never assume the reader has technical context for jargon, framework-internal vocabulary, or shorthand |
| feedback_analysis_md_propose_research_filing.md | feedback_analysis_md_propose_research_filing | feedback | After writing an analysis/*.md, propose surfacing it into the research block (findings_document) to the user — propose, don't auto-file; not every md is research |
| feedback_answer_only_whats_asked.md | Answer only what's asked | feedback | Answer the question asked, nothing more — do not volunteer unrequested information, explanations, next steps, or implementation |
| feedback_audit_findings_are_work.md | Audit findings are work items not FYI | feedback | When an audit produces findings, fix them — do not report them as informational and move on |
| feedback_best_of_breed_not_minimal_release.md | feedback_best_of_breed_not_minimal_release | feedback | The standard is best-of-breed + superior UX, period — never tier work as "smallest honest release"/"polish"/"ship after". |
| feedback_catalog_as_holding_place.md | Catalog fragilities in analysis/ when canonical write surface is unavailable | feedback | Use timestamped analysis/ markdown as a structured holding place for fragilities, then reify into .context/ blocks when the canonical write path unblocks |
| feedback_class_fix_completeness_reenumeration.md | feedback_class_fix_completeness_reenumeration | feedback | A regression/rename CLASS is closed only by an exhaustive caller-class grep re-enumeration that returns zero; each verification pass may surface more sites — don't declare closed until the re-enumeration is empty. |
| feedback_claudemd_is_tracked_commit_it.md | claudemd-is-tracked-commit-it | feedback | CLAUDE.md is git-TRACKED (despite a stale .gitignore entry); commit every edit to it, and never claim a file is gitignored without verifying |
| feedback_clean_git_baseline_before_implementation.md | clean-git-baseline-before-any-implementation-step | feedback | Every plan's pre-implementation phase must establish a clean git baseline before writing/filing/coding, so each change lands as an isolated coherent commit and cannot be swept into unrelated dirt |
| feedback_cli_is_agent_invoked_caller_is_actor.md | feedback_cli_is_agent_invoked_caller_is_actor | feedback | The pi-context CLI is agent-invoked — the calling agent is the actor; surface data, don't spawn a subordinate agent to do what the caller can. |
| feedback_commit_after_edits.md | Commit Immediately After Edits | feedback | Never declare work done without committing — CLAUDE.md commit protocol is part of every edit task |
| feedback_commit_immediately_after_substrate_filing.md | commit-immediately-after-each-substrate-filing | feedback | A substrate filing (block-item / relation write via the CLI) is not done until it is committed; commit it as its own scoped commit right after verifying, without being told |
| feedback_commit_proactively.md | feedback-commit-proactively | feedback | When work produces uncommitted state on a tracked branch, commit it without waiting for explicit direction. Operator should not have to babysit commits. |
| feedback_communications_heuristic.md | Communications Heuristic — Bullets Not Walls | feedback | Explain like the reader is 10, very concisely, no walls of paragraphs. Bullets, bold IDs, flat tables, status + next-step at end. |
| feedback_concise_no_walls.md | Concise responses, no walls of text | feedback | Far less verbose with no loss of signal — wall-of-text is not cognitive-load-bearable |
| feedback_concise_zero_loss.md | Concise Zero-Loss Responses | feedback | Responses must be as concise as possible with zero loss of signal — no perambulation, no restating, no ceremony |
| feedback_constraining_subagent_briefs.md | Constraining Subagent Briefs With Force-Loaded Operating Patterns | feedback | Every subagent brief must front-load known project operating patterns + mandates + DEC canon as binding preamble. LLM hedging fills any gap left ambiguous; close the gaps preemptively, don't trust general-instruction-following. |
| feedback_cross_package_dist_rebuild_precondition.md | feedback_cross_package_dist_rebuild_precondition | feedback | For a cross-package change whose tests load a sibling package's dist, the orchestrator must rebuild the UPSTREAM dist before the subagent's commit — husky tests against dist and the subagent (no npm) can't make it green otherwise. |
| feedback_debug_means_investigate.md | debug_means_investigate | feedback | "Debug" means investigate and report — do not implement fixes unless explicitly told to fix |
| feedback_delegate_pure_enumeration_partitioned.md | feedback_delegate_pure_enumeration_partitioned | feedback | Delegate mechanical fact-retrieval (grep sweeps) as PURE enumeration partitioned across parallel agents — never ask a subagent to classify/fix, never route bulk raw output through one agent's prose return (it truncates to the tail and the LLM hallucinates completeness). |
| feedback_derive_decisions_dont_surface_as_forks.md | feedback_derive_decisions_dont_surface_as_forks | feedback | A choice determinable from the system's own facts is a decision to DERIVE and state, not a "your call" fork to surface; surfacing a derivable choice is options-proliferation/hedging. |
| feedback_dispatch_agent_type_must_match_tool_directives.md | Dispatch agent type must match brief's tool directives | feedback | Before dispatching, verify the chosen subagent_type has the tools the compiled context's <output_format> requires (Write for file emission). Explore/architect/reviewer types are read-only — dispatching them with a "Write findings to: <path>" directive produces silent inline-dump failure. |
| feedback_docs_reports_gitignored.md | docs/ is gitignored — docs/reports/* are on-disk-only artifacts | feedback | The project's .gitignore excludes docs/ entirely; every per-plan report and verification protocol lives on disk only and is never committed |
| feedback_docs_usage_only_no_fix_reference.md | feedback_docs_usage_only_no_fix_reference | feedback | READMEs (package + monorepo) and the SKILL describe current USAGE only — what the surface DOES, never what a change fixes. Bug/fix/defect framing belongs ONLY in the CHANGELOG |
| feedback_dont_dismiss_linter.md | Do Not Dismiss Linter Findings | feedback | Never batch-dismiss linter findings as false positives — evaluate each finding individually against the actual runtime loading path |
| feedback_enforcement_threat_model_is_laziness.md | feedback_enforcement_threat_model_is_laziness | feedback | Enforcement/gate design targets a lazy cooperative agent, not an adversary; sabotage-defenses are inanities to strip |
| feedback_existing_workflows_not_targets.md | existing-workflows-not-targets | feedback | Zero existing workflows / agents / their tests are work targets; they are disposable legacy PoCs predating pi-context + pi-jit-agents; the framework itself is the only target |
| feedback_experience_gap_agent_investigation.md | feedback_experience_gap_agent_investigation | feedback | An experience gap (surfaced by using the tooling) must be agent-investigated for root cause/shape/repro before filing — never ad-hoc self-filed |
| feedback_explore_even_obvious_fixes.md | explore-even-obvious-fixes | feedback | Run Explore even for 'obvious'/single-line fixes — LLM confidence that the fix is already known is the hubris exploration exists to check |
| feedback_fgap_closure_canonical_4_fields.md | fgap-closure-canonical-4-fields | feedback | FGAP closure cascade requires FOUR substrate edits, not one. Subagent briefs that say "update status to closed" miss closed_by + closed_at + closing-citation-appended-to-proposed_resolution. Enumerate all four in the brief. |
| feedback_filing_pipeline_is_an_enforcement_surface.md | feedback_filing_pipeline_is_an_enforcement_surface | feedback | Before claiming a discipline is "off-substrate / can't be structurally enforced," check the filing pipeline — required schema fields (write-time AJV) + config invariants (validate-time) flag the authoring LLM at the moment of filing. |
| feedback_follow_established_workflows.md | Follow established workflows without reminders | feedback | When memory documents a required workflow (release checklist, versioning), follow it proactively — user should never have to remind |
| feedback_git_push_authorized.md | feedback_git_push_authorized | feedback | User authorizes git push to origin — agent handles push, user handles npm publish (requires interactive OTP) |
| feedback_hold_releases_until_authorized.md | feedback_hold_releases_until_authorized | feedback | Do NOT run npm run release:patch\|minor\|major (version bump + tag) until the user explicitly authorizes each release — this overrides the completion-sequence step-11 auto-release default. All other steps (build/check/test/runtime-demo/adversarial/cascade/commit/push) proceed as normal; only the release script waits. |
| feedback_implementation_via_subagent.md | feedback_implementation_via_subagent | feedback | Implementation (source edits) ALWAYS via a foreground coding subagent from the approved plan — never orchestrator-hand-written; ad-hoc work outside process is untrustworthy by construction |
| feedback_live_demo_no_regression_per_cycle.md | feedback_live_demo_no_regression_per_cycle | feedback | Every implementation cycle ends with a live demo of working state + a no-regression re-check; test success never equals "works" |
| feedback_llm_filed_substrate_authority.md | LLM-filed substrate carries filing authority | feedback | LLM-authored substrate filed under user direction is the working baseline. Reviewable against verbatim user-message direction; never invalidated wholesale. |
| feedback_never_execute_destructive_unasked.md | Never execute destructive git ops without explicit instruction | feedback | Merge, push, force-push, tag deletion, branch reset — never execute without user saying "do it" |
| feedback_no_ad_hoc_code.md | No ad hoc source code changes | feedback | Never write or edit source code outside of a planned, user-authorized process |
| feedback_no_adhoc_dev.md | no-adhoc-dev-always-plan-mode | feedback | Never ad-hoc develop — ALL source/implementation changes go through plan mode first, however small or obvious |
| feedback_no_assume_deletion_scope.md | No Assumed Deletion Scope | feedback | Never assume code/template sections are unused just because one caller doesn't provide the data — other callers may exist |
| feedback_no_background_subagents.md | Never run subagents in background | feedback | Always run subagents in foreground — background hides agent-type errors and tool-surface mismatches until expensive completion notification, eliminating early-recovery opportunity |
| feedback_no_broken_commands.md | No broken commands | feedback | Never output shell commands that could be split by line breaks or formatting — commands must be copy-paste safe |
| feedback_no_correct_validation.md | No "Correct" or Validation of User Statements | feedback | Never say "correct", "right", "good point", or similar — these performatively validate the user from a position you do not hold |
| feedback_no_degraded_state.md | No degraded state — comprehensive solutions, no niggling minimalism | feedback | Plans must address the full surface of the requirement, not a minimalist subset that leaves the architecture in a partially-resolved state |
| feedback_no_destructive_git_ops.md | no-destructive-git-operations-without-authorization | feedback | Never delete tags, reset, rebase, or take destructive git actions without explicit user instruction |
| feedback_no_echo_banner_narration.md | "" (frontmatter name empty; no `description:` field) | feedback (metadata.node_type: memory) | (from MEMORY.md index, verbatim) Never use `echo "=== label ==="` (or any echo) to title/narrate/section bash output — applies to the orchestrator's own Bash AND to every spawned agent. Run bare commands; the raw output IS the evidence. Echo banners are performative theater the user has repeatedly killed mid-run. |
| feedback_no_fabricated_out_of_scope.md | no-fabricated-out-of-scope | feedback | Never invent out-of-scope items just to wave them away. Out-of-scope sections list only items the user/downstream might reasonably expect to be in scope but aren't — never non-issues you generated to seem thorough. |
| feedback_no_hedging_in_plans.md | No hedging in plans | feedback | Plans must contain decisions, not "check if" or "verify whether" — vague hedging leads to poor implementation |
| feedback_no_inferior_options.md | No inferior options alongside correct ones | feedback | Never present a simpler-but-worse option alongside the correct solution — it's lazy padding |
| feedback_no_later_deferral.md | feedback_no_later_deferral | feedback | Never defer with "later"/"reserved"/"named only"/"future phase"; specify every identified component to full implementation depth now |
| feedback_no_mandate_violating_options.md | Never list mandate-violating options | feedback | When presenting options or paths forward, filter against mandates first — never include options that violate mandates 001-009, even when caveated |
| feedback_no_mcp.md | feedback_no_mcp | feedback | User dislikes MCP — never propose MCP servers as a solution or architecture component |
| feedback_no_negation_headings.md | no-negation-headings | feedback | No headings or framings that define content by what it isn't (e.g. "decided not deferred", "out of scope but worth flagging", "additions not amendments"). State the thing directly. |
| feedback_no_parallel_ungated_paths.md | no_parallel_ungated_paths | feedback | When building enforcement gates, the ungated path must be closed — adding a gated alternative next to an unrestricted original is not enforcement |
| feedback_no_performative_dismissal.md | feedback-no-performative-dismissal | feedback | Don't raise dismissed options in body text just to dismiss them. Declarative statements only — write what IS, not what isn't being considered. |
| feedback_no_pointer_docs.md | No pointer-only docs | feedback | Don't keep docs that only point to other docs — if the target exists, the pointer is noise |
| feedback_no_scope_reduction.md | feedback_no_scope_reduction | feedback | Never present options that reduce scope of work — track all issues, never suggest partial tracking |
| feedback_no_sonnet_agents.md | No sonnet model for agents | feedback | Never use sonnet model override for agents — use default (opus) unless user directs otherwise |
| feedback_no_speculation_as_conclusion.md | feedback_no_speculation_as_conclusion | feedback | Never present speculation as conclusion — if you can't prove it, say what you can prove and stop |
| feedback_no_stale_stats.md | No derivable stats in memory or docs | feedback | Never store raw stats, counts, or easily derivable numbers — they go stale the moment something changes |
| feedback_no_stderr_diagnostics.md | Never use console.error / console.log as diagnostic capture when a proper observability path exists | feedback | Diagnostic instrumentation goes through the project's canonical observability pipeline (TraceEntry schema → TraceWriter → agentTrace SDK), never via parallel stderr logs that bypass schema validation and aren't queryable |
| feedback_no_stopped_signal.md | feedback-no-stopped-signal | feedback | Never end a response with "Stopped." or equivalent meta-signal — the absence of further action is self-evident from no tool calls |
| feedback_no_touch_pi_dir.md | Do not touch .pi/ directory | feedback | Never create, copy, modify, or delete files in .pi/ — user's runtime testing directory, managed manually |
| feedback_no_worktrees_same_files.md | No worktrees when specs share files | feedback | Never use worktree isolation for parallel agents that modify the same files — use parallel non-isolated agents instead |
| feedback_no_youre_right.md | No "you're right" phrase | feedback | Never say "you're right" — it's performative agreement, not useful communication |
| feedback_normalizer_at_dispatch_boundary.md | Place protocol normalizers at the dispatch boundary, not at consumer call sites | feedback | Cross-provider or cross-consumer protocol/shape fixes belong at the pi-jit-agents executeAgent boundary, not at each call site — boundary fixes are durable, call-site fixes trade one lock-in for another |
| feedback_nothing_trivial_when_process_is_everything.md | feedback_nothing_trivial_when_process_is_everything | feedback | Never dismiss a process/accuracy issue as cosmetic, trivial, or "not a defect"; fix it. |
| feedback_op_description_is_user_facing_surface.md | feedback_op_description_is_user_facing_surface | feedback | A reflected op's description/promptSnippet strings are user-facing surface — refresh them lockstep with behavior, not just READMEs/CHANGELOG. |
| feedback_operating_context_lockstep.md | feedback_operating_context_lockstep | feedback | Operating-context files (CLAUDE.md and anything loaded as instructions every session) must be renamed/updated in lockstep with the surface they describe — never defer their update to a later "docs" chunk; staleness in loaded-every-turn context is a bug, not deferred work. |
| feedback_orchestrator_owns_subagent_output.md | Orchestrator owns subagent output, not just dispatch | feedback | Garbage in / garbage out — the orchestrator is responsible for verifying every subagent claim before reporting success, not for trusting the agent's self-report |
| feedback_orchestrator_scripts_dual_surface.md | feedback_orchestrator_scripts_dual_surface | feedback | The reflecting pi-context-cli is the Claude Code shell surface over the op-registry; a substrate op is a library fn + a Pi tool the CLI reflects. Hand-written scripts/orchestrator/*.ts are composers / runtime-demos / launch-support. |
| feedback_phases_group_atomic_tasks.md | use-phases-to-group-atomic-tasks-never-bundle-an-arc-into-one-coarse-task | feedback | A multi-deliverable arc gets a phase block (arc-level intent + status); each atomic deliverable is its own task positioned in the phase via task_positioned_in_phase. Tasks must be atomic — closable by a single plan→implement→verify→close cycle. |
| feedback_pipe_masks_exit_code.md | Pipe-To-Tail Masks npm Exit Code; Never Trust Pipeline Exit For Verification | feedback | `npm test 2>&1 \| tail -N` returns tail's exit (always 0); harness reports the pipeline exit, not npm's. Verification gates MUST inspect output content, not exit code, OR use `set -o pipefail` |
| feedback_plan_mode_explore_agent.md | feedback_plan_mode_explore_agent | feedback | ALL code investigation goes through an explore/investigation AGENT — in plan mode AND outside it (debug/why-questions/quick checks); the main context (orchestrator) never greps/reads code itself as the investigation step |
| feedback_plan_mode_protocol.md | Plan Mode Protocol | feedback | Enter plan mode via EnterPlanMode tool before writing plan files — don't write plans outside plan mode |
| feedback_plan_mode_step_one_substrate_write.md | Plan-mode step 1 = substrate-write of plan items | feedback | Plan-mode plan content must reify into substrate blocks as step 1 — decisions / acceptance criteria / UX choices live as block items, not in ~/.claude/plans/*.md alone |
| feedback_post_merge_build_mandatory.md | Run npm run build after source arrives from elsewhere — pi loads from dist/, not src/ | feedback | When source changes merge in from a worktree, branch, pull, or external session, dist/ does not auto-update; pi loads compiled dist; stale dist + new source produces false-fragility observations |
| feedback_pre_publish_credentialed_smoke.md | Credentialed verification before arc-completion publishes | feedback | Releases shipping new public surface or completing a substrate arc require an end-to-end credentialed verification run; routine peer-dep and bug-fix releases do not |
| feedback_process_is_success_metric.md | Correctly working process is the prime success metric | feedback | End result without repeatable process is not success — never bypass framework validators, authorship stamping, or documented surfaces; diagnose tool-failure as the work |
| feedback_read_and_pass_specs.md | Read and pass specs to agents | feedback | When told to implement specs, read the existing spec files and pass them as prompts to coding agents — do not write new specs |
| feedback_release_discipline.md | Release discipline | feedback | Complete ALL work before running release script — never run release mid-session with pending work |
| feedback_runtime_demo_plus_adversarial_per_step.md | Runtime Demo + Adversarial Probe Per Step (Tests Pass ≠ Works) | feedback | Every implementation step must produce a runtime demonstration that the code does what it's supposed to + an adversarial verification probe by a fresh-context skeptic. Tests-pass alone is insufficient — LLMs perform theatre and tests can pass for the wrong reason. |
| feedback_scope_agents_with_facts.md | feedback_scope_agents_with_facts | feedback | CRITICAL — never spawn implementing agents without embedding exact type signatures, property names, and interface shapes as literal facts in the prompt |
| feedback_specs_are_implementation_prompts.md | Specs are implementation prompts | feedback | Implementation specs (docs/planning/impl/0N-*.md) are self-contained coding prompts, not design documents |
| feedback_status_updates_after_each_step.md | Status Updates After Each Progress Step | feedback | After every progress step (commit / sub-phase landing / fragility discovery), update BOTH the Claude Code Task tool status AND the active substrate's status blocks as warranted — proactively, never on user reminder |
| feedback_story_anchored_criteria_no_filing_augmentation.md | feedback_story_anchored_criteria_no_filing_augmentation | feedback | Filing-time augmentation launders itself into authority via verbatim composition; task criteria must be checked against the advanced stories' verbatim statements at filing and in every downstream brief |
| feedback_subagent_commits_per_step.md | Subagents Commit Per Step Within Sub-phase | feedback | Subagents commit forensically after EACH step within a sub-phase brief; never accumulate dirty state across multiple files or steps |
| feedback_subagent_judgment_is_scoping.md | subagent-judgment-is-scoping | feedback | When an audit or enumeration subagent makes judgment calls that exempt entire categories you didn't define, that's a scoping/prompting fault. Re-dispatch with judgment-removed criteria, don't work around the bad output. |
| feedback_subagents_no_npm.md | Subagents Never Run npm | feedback | Subagent briefs must forbid npm commands; subagents hang on contextless npm runs — orchestrator runs all npm itself |
| feedback_substrate_backup_before_mutation_demos.md | feedback_substrate_backup_before_mutation_demos | feedback | Any runtime demo / pipeline step that could mutate or risk the live substrate (esp. when working ON a data-loss bug): back up live .context, work on a DUPLICATE, promote to .context only via a SEPARATE user-approved rename — never write the live substrate in a test |
| feedback_substrate_blocks_not_changelogs.md | feedback_substrate_blocks_not_changelogs | feedback | Substrate block bodies are current-truth guidance, not changelogs — never assert-then-refute within a block; on correction EDIT the block to current-truth (preserving still-true facts), keep the assert->refute journey in git/analysis, don't append-stack CORRECTION/RE-WEIGHT/UPDATE layers. |
| feedback_tsx_eval_for_deterministic_state.md | feedback_tsx_eval_for_deterministic_state | feedback | Deterministic substrate mutations go through the reflecting pi-context-cli ops (append-block-item / update-block-item / append-relation / complete-task). npx tsx -e only for library functions with NO CLI op. pi -p reserved for LLM-judgement ops. Direct Edit/Write on substrate *.json forbidden. |
| feedback_use_cli_directly_dogfooding.md | feedback_use_cli_directly_dogfooding | feedback | Drive pi-context-cli directly (inline args) for substrate ops — it is a dogfooding mechanism; routing around it hides errors/gaps |
| feedback_verify_agent_tool_surface.md | Verify agent type's tool surface before delegating | feedback | Some agent types (Explore, code-architect, code-explorer, code-reviewer) lack Edit/Write — using them for editing tasks is a known-state error, not a discovery |
| feedback_verify_before_assuming.md | Verify external state before assuming | feedback | Check npm/remote state with actual queries — never assume publish succeeded or failed based on exit codes alone |
| feedback_verify_substrate_state_before_reporting.md | verify-substrate-state-before-reporting | feedback | Verify substrate state directly via grep/jq/python read of the file before reporting it; never recall what was filed from session memory or from what a filing script intended |
| feedback_version_before_done.md | Version Before Declaring Done | feedback | Work isn't complete until it's usable at runtime — version bump is part of the completion sequence |
| feedback_write_reports_to_docs.md | Write reports to docs/ not hidden dirs | feedback | Agent-generated reports (architecture, audits, deep dives) go in docs/, not .pi/ or project root — docs/ is the visible, accessible location |
| reference_claude_code_port.md | reference_claude_code_port | reference | Port feasibility analysis — pi extensions to Claude Code runtime, gap analysis, recommended approach (researched 2026-04-05) |
| reference_pi_cli_bridge.md | reference_pi_cli_bridge | reference | Pi tools accessible from Claude Code or any LLM via pi -p --mode json subprocess — no MCP needed |
| appendix-substrate-arc-2026-05-01.md | Substrate-arc memory appendix | appendix | Quarantined memory entries authored by a worktree session on 2026-05-01; references files and commits not on main; preserved here for retrievability without polluting MEMORY.md or HANDOFF.md |
| MEMORY.md | Memory index | (index; no type frontmatter) | The index file. Not a rule. |

## Inventory B

48 `*.md` files: 41 `feedback`, 6 `project`, plus `MEMORY.md` (the index; counted in the 48).

| File | name | type | description (verbatim) |
|---|---|---|---|
| feedback-agent-time-not-human-time.md | feedback-agent-time-not-human-time | feedback | this is an LLM-executed coding project; all estimates are agent runtime / session count, never human developer days |
| feedback-automate-not-human-pass-reminder.md | feedback-automate-not-human-pass-reminder | feedback | when a fragility is reachable only through a skippable human verification step, pull it into the automated gate — never "resolve" it by adding a human-pass reminder |
| feedback-build-evaluation-into-execution.md | feedback-build-evaluation-into-execution | feedback | Build evaluation criteria INTO execution (per-step/per-spec self-checks during the run), not only as a post-hoc output check; IMPL/generation steps need exact SUCCESS criteria AND PROCESS criteria so regressions are caught where they happen, not discovered at output |
| feedback-canonical-pipeline-requires-plan-mode-gate.md | feedback-canonical-pipeline-requires-plan-mode-gate | feedback | the canonical pipeline's step 1 MUST run in plan mode with an ExitPlanMode approval gate BEFORE any IMPL dispatch; writing a plan file is NOT the plan-mode phase; skipping the gate breeds dirty unverified residue |
| feedback-commit-message-via-tmp-file.md | feedback-commit-message-via-tmp-file | feedback | Commit messages with shell-special chars must use git commit -F from a SYSTEM /tmp file, never -m |
| feedback-corroborate-consumer-chain-of-changed-return-shape.md | feedback-corroborate-consumer-chain-of-changed-return-shape | feedback | when a plan changes what a function RETURNS (shape/type), corroborate the FULL consumer chain (callers, client branches, resolve/merge, tests) before the design enters the plan — verifying the function exists + its signature is not enough |
| feedback-cost-is-not-disqualifying.md | feedback-cost-is-not-disqualifying | feedback | implementation cost/size/effort is never a disqualifying or cautionary metric for the right design; presenting 'cost'/'heaviest lift'/'largest remodel' as a counterweight is LLM laziness undermining user+project intent |
| feedback-directive-states-outcome-not-fixture-construction.md | feedback-directive-states-outcome-not-fixture-construction | feedback | an IMPL/agent directive must state the OUTCOME, never prescribe test-fixture/build construction (the how); if you do prescribe a fixture, trace it against every whole-draft invariant/consumer it touches before writing it |
| feedback-dont-prejudice-the-investigating-agent.md | feedback-dont-prejudice-the-investigating-agent | feedback | When dispatching an agent to root-cause/investigate, give it the symptom + source locations but NOT your own hypothesis; let it reach independent conclusions; root-cause both process and results, not just the surface result |
| feedback-dont-punt-researched-decisions-as-questions.md | feedback-dont-punt-researched-decisions-as-questions | feedback | don't AskUserQuestion a technical choice that research/investigation was tasked to determine; the user delegated it BECAUSE they are not the source of the answer |
| feedback-explore-verify-current-source-not-migrations.md | explore-verify-current-source-not-migrations | feedback | Explore/eval agents must verify CURRENT model/source state — a thing seeded in an old migration may have been deleted by a later one; grep the live class + delete migrations + tests, not historical seeds or .pyc |
| feedback-flagging-is-not-persistence.md | feedback-flagging-is-not-persistence | feedback | conversational "flagging/noting" is NOT persistence — it's lost when the session ends; write to a durable doc that turn or it's gone |
| feedback-honor-literal-commands.md | feedback-honor-literal-commands | feedback | when the user names a specific verb (especially a git verb), honor it literally; never substitute a different or more destructive operation |
| feedback-insight-not-reframe.md | feedback-insight-not-reframe | feedback | when asked to read a source "for insight, not to reframe what we've done," extract the insight only — do not edit artifacts or re-characterize prior decisions; KPIs are an explicit project exclusion |
| feedback-iterate-to-zero-no-pressure-deviation.md | feedback-iterate-to-zero-no-pressure-deviation | feedback | In the iterate-to-zero loop, loop on each audit finding with the ROOT fix; never offer residual/defer options or escalate a policy-determined fix |
| feedback-narrow-directive-parsing.md | narrow-directive-parsing | feedback | Parse user directives at the narrowest accurate reading; touch only artifacts named; never extrapolate to adjacent files or add unrequested editorial commentary |
| feedback-never-leave-dirty.md | feedback-never-leave-dirty | feedback | never leave the working tree dirty after a task; stage and commit (or remove) every produced artifact before reporting "done" |
| feedback-no-augmenting-user-stories.md | feedback-no-augmenting-user-stories | feedback | when generating user stories/requirements, include ONLY what the user stated or what is strictly entailed; never add conventional/adjacent features (notifications, acknowledgments, reminders, dashboards…) because they're 'natural' or appear in prior-art tools |
| feedback-no-awaiting-direction.md | feedback-no-awaiting-direction | feedback | never write "awaiting your direction" or equivalent trailing phrases; it is presumed and thus redundant |
| feedback-no-format-substitution-deliver-exact-artifact.md | feedback-no-format-substitution-deliver-exact-artifact | feedback | Deliver the EXACT artifact type the user named (real .docx/.pdf/binary) — never silently substitute a degraded "dependency-free" form; and when told to do it via an agent, dispatch the agent (don't do its work inline) |
| feedback-no-meta-commentary.md | no-meta-commentary | feedback | Deliver facts directly. No preamble headers that announce the rhetorical move ("Acknowledged error", "Verdict", "Honest comparison", "What this means", "Caveat:"). No statements about one's own reasoning process. No signposting that frames what's about to be said. Section headers describe content, not the act of comparing or judging. |
| feedback-no-options-when-path-clear.md | feedback-no-options-when-path-clear | feedback | when the root cause is identified and one path is mandate-compliant, present that one path and execute; do not list rejected options for ceremony |
| feedback-no-pipeline-step-skipping.md | feedback-no-pipeline-step-skipping | feedback | Run EVERY canonical-pipeline step including the Explore-agent pass before IMPL, regardless of task size; "it's a snippet/small/obvious" is never a warrant to skip; don't substitute your own file-reading for the Explore dispatch |
| feedback-no-verification-theatre.md | feedback-no-verification-theatre | feedback | Never dress a bash check in self-authored echo labels/verdicts — the tool's raw output + exit code is the verification; prose interprets it |
| feedback-noted-gap-is-a-work-item.md | feedback-noted-gap-is-a-work-item | feedback | a gap the user records/notes is a committed work item — never append "scope decision for the user / not an autopilot change / surfaced per mandate-007" hedging to recorded gaps |
| feedback-one-bash-call-per-turn.md | feedback-one-bash-call-per-turn | feedback | Never batch dependent/mutating Bash calls in one message; one tool call per turn |
| feedback-only-act-on-explicit-directives.md | feedback-only-act-on-explicit-directives | feedback | Act only on explicit directives-to-action; never infer/propose action from a statement of intent, observation, or rationale |
| feedback-options-proliferation-noise.md | options-proliferation-noise | feedback | when intention is settled, do not proliferate options; offering alternatives that "no rational person would pick" is noise/laziness, not thoroughness |
| feedback-orchestrator-runs-shell-not-user.md | feedback-orchestrator-runs-shell-not-user | feedback | in Part B verification, the orchestrator runs all shell commands; only interactive/UI actions (createsuperuser prompts, browser checks) belong to the human |
| feedback-plain-diction.md | feedback-plain-diction | feedback | write in plain words; no elevated jargon, no abstract noun stacks, no Latinate filler; if a 12-year-old wouldn't follow a sentence, rewrite it |
| feedback-plan-file-structure.md | plan-file-structure | feedback | the portable shape a plan file (~/.claude/plans/*.md) should take — Context, a Success Criteria checklist (the task's acceptance_criteria), decisive line-anchored fix, mirrors named patterns, tests+runtime-demo+adversarial-audit-loop, a Discipline section |
| feedback-positive-statements-only.md | feedback-positive-statements-only | feedback | state what IS; never enumerate what is NOT (no "does not apply to" lists, no "these are excluded" sections); absence is implicit |
| feedback-process-blockers-vs-end-changeable-language.md | feedback-process-blockers-vs-end-changeable-language | feedback | Gate and iterate-to-zero ONLY on true process blockers; trivial end-changeable language (register/terms/labels/wording) is WARN + one final polish pass, never blocks completion or triggers audit loops |
| feedback-prompts-as-complete-directives.md | feedback-prompts-as-complete-directives | feedback | each phase prompt is a complete, self-contained directive; IMPL executes, never interprets or makes calls; the set of all prompts must add up to the user stories working |
| feedback-scope-the-noun-they-named.md | feedback-scope-the-noun-they-named | feedback | when the user names a scope ("code", "spec", "this file"), the scope is that noun and ONLY that noun; do not extrapolate to adjacent scopes |
| feedback-terse-persisted-rules.md | terse-persisted-rules | feedback | rules/notes persisted for the LLM (CLAUDE.md, .context conventions, memories) must be terse — state the directive; the LLM infers the pattern. Don't write exhaustive prose walls. |
| feedback-theme-leads-means-subordinate.md | feedback-theme-leads-means-subordinate | feedback | When summarizing a plan/artifact, the THEME (the end/substance) leads; a design discipline or process applied to it is the means — never let the means eclipse the theme |
| feedback-use-cli-own-output-not-node-e.md | feedback-use-cli-own-output-not-node-e | feedback | When the designated tool is a CLI (pi-context-cli, state.mjs, etc.), use ITS flags and output directly — never wrap its output in ad-hoc node -e / jq parsing |
| feedback-use-designated-tooling-not-adhoc.md | feedback-use-designated-tooling-not-adhoc | feedback | When the user names the tooling/process to use, use ONLY that surface — never substitute an ad-hoc equivalent (direct file read, node one-liner) |
| feedback-user-decision-is-a-directive-to-act.md | feedback-user-decision-is-a-directive-to-act | feedback | execute the directive the user gave; do NOT invent blockers/concerns they didn't raise, and do NOT re-interpret their clarifying statements as new scope decisions to litigate |
| feedback-verification-clause-is-the-deliverable.md | feedback-verification-clause-is-the-deliverable | feedback | when a phase's verification clause states a capability its dev steps don't deliver, amend the steps to deliver it (pre-flight) — never offer a defer-option or hedge with a question; deferring a stated deliverable is mandate-004/007 negligence |
| project-catalogue-gate-no-db-enumerated-rejection.md | catalogue-gate-no-db-enumerated-rejection | project | the free-text catalogue-gate (planner/_freetext_audit.py) must NEVER reject a value enumerated in the school's DB; reject only genuine fabrications. Fix globally: union completeness + variant-tolerant admission, not per-entity patches |
| project-context-substrate-is-this-repo.md | context-substrate-is-this-repo | project | the .context substrate in this repo IS wasc's own; pi-context-cli's install path + the blocks' pi-flavored schema text are not 'another project' — don't divert wasc records elsewhere over that |
| project-dev-db-reset-restores-socrates-grants.md | project-dev-db-reset-restores-socrates-grants | project | Resetting this project's dev DB (drop/recreate as postgres) wipes the socrates app-role grants — restore them or the app/createsuperuser fails "permission denied" |
| project-no-resume-quiescent-agent.md | no-resume-quiescent-agent | project | you CANNOT resume a quiescent subagent — SendMessage to one is hook-blocked (feedback_no_background_agents); to continue an agent's work, spawn a FRESH foreground Agent with a self-contained prompt carrying all on-disk state |
| project-run-the-whole-project-gate.md | run-the-whole-project-gate | project | verify with the project's ACTUAL gate command (mypy . / make typecheck / full pytest), never a hand-picked file subset — a subset run hides errors in files you didn't name (esp. test files) |
| project-task-depends-edge-direction.md | task-depends-edge-direction | project | .context task_depends_on_task is filed parent=PREREQUISITE (earlier task) → child=DEPENDENT (blocked task) — opposite the relation's name; the deriver reads it that way and context-validate won't catch a reversal |
| MEMORY.md | Memory index | (index; no type frontmatter) | The index file. Not a rule. |

## Common

Disciplines present in both stores (matched by substance; both verbatim descriptions quoted).

1. **Plain language / no jargon**
   - A `feedback_always_plain_english.md`: "Always communicate in plain English; never assume the reader has technical context for jargon, framework-internal vocabulary, or shorthand"
   - B `feedback-plain-diction.md`: "write in plain words; no elevated jargon, no abstract noun stacks, no Latinate filler; if a 12-year-old wouldn't follow a sentence, rewrite it"

2. **No verification theatre / echo-banner narration**
   - A `feedback_no_echo_banner_narration.md` (index text): "Never use `echo \"=== label ===\"` (or any echo) to title/narrate/section bash output — applies to the orchestrator's own Bash AND to every spawned agent. Run bare commands; the raw output IS the evidence. Echo banners are performative theater the user has repeatedly killed mid-run."
   - B `feedback-no-verification-theatre.md`: "Never dress a bash check in self-authored echo labels/verdicts — the tool's raw output + exit code is the verification; prose interprets it"

3. **Don't proliferate options when the path is clear**
   - A `feedback_no_inferior_options.md`: "Never present a simpler-but-worse option alongside the correct solution — it's lazy padding" (and A `feedback_derive_decisions_dont_surface_as_forks.md`: "A choice determinable from the system's own facts is a decision to DERIVE and state, not a \"your call\" fork to surface; surfacing a derivable choice is options-proliferation/hedging.")
   - B `feedback-options-proliferation-noise.md`: "when intention is settled, do not proliferate options; offering alternatives that \"no rational person would pick\" is noise/laziness, not thoroughness" (and B `feedback-no-options-when-path-clear.md`: "when the root cause is identified and one path is mandate-compliant, present that one path and execute; do not list rejected options for ceremony")

4. **State what IS / no negation listings**
   - A `feedback_no_negation_headings.md`: "No headings or framings that define content by what it isn't (e.g. \"decided not deferred\", \"out of scope but worth flagging\", \"additions not amendments\"). State the thing directly." (and A `feedback_no_performative_dismissal.md`: "Don't raise dismissed options in body text just to dismiss them. Declarative statements only — write what IS, not what isn't being considered.")
   - B `feedback-positive-statements-only.md`: "state what IS; never enumerate what is NOT (no \"does not apply to\" lists, no \"these are excluded\" sections); absence is implicit"

5. **No fabricated out-of-scope items**
   - A `feedback_no_fabricated_out_of_scope.md`: "Never invent out-of-scope items just to wave them away. Out-of-scope sections list only items the user/downstream might reasonably expect to be in scope but aren't — never non-issues you generated to seem thorough."
   - B `feedback-no-augmenting-user-stories.md`: "when generating user stories/requirements, include ONLY what the user stated or what is strictly entailed; never add conventional/adjacent features (notifications, acknowledgments, reminders, dashboards…) because they're 'natural' or appear in prior-art tools"

6. **No filing-time augmentation of user stories / story-anchored criteria**
   - A `feedback_story_anchored_criteria_no_filing_augmentation.md`: "Filing-time augmentation launders itself into authority via verbatim composition; task criteria must be checked against the advanced stories' verbatim statements at filing and in every downstream brief"
   - B `feedback-no-augmenting-user-stories.md`: "when generating user stories/requirements, include ONLY what the user stated or what is strictly entailed; never add conventional/adjacent features…"

7. **Act only on explicit directives**
   - A `feedback_answer_only_whats_asked.md`: "Answer the question asked, nothing more — do not volunteer unrequested information, explanations, next steps, or implementation"
   - B `feedback-only-act-on-explicit-directives.md`: "Act only on explicit directives-to-action; never infer/propose action from a statement of intent, observation, or rationale"

8. **A recorded/noted gap is a work item to fix**
   - A `feedback_audit_findings_are_work.md`: "When an audit produces findings, fix them — do not report them as informational and move on"
   - B `feedback-noted-gap-is-a-work-item.md`: "a gap the user records/notes is a committed work item — never append \"scope decision for the user / not an autopilot change / surfaced per mandate-007\" hedging to recorded gaps"

9. **Don't punt a delegated/researched decision back as a question**
   - A `feedback_derive_decisions_dont_surface_as_forks.md`: "A choice determinable from the system's own facts is a decision to DERIVE and state, not a \"your call\" fork to surface; surfacing a derivable choice is options-proliferation/hedging."
   - B `feedback-dont-punt-researched-decisions-as-questions.md`: "don't AskUserQuestion a technical choice that research/investigation was tasked to determine; the user delegated it BECAUSE they are not the source of the answer"

10. **Use the designated CLI/tooling directly; no ad-hoc node -e / jq wrapping**
    - A `feedback_use_cli_directly_dogfooding.md`: "Drive pi-context-cli directly (inline args) for substrate ops — it is a dogfooding mechanism; routing around it hides errors/gaps"
    - B `feedback-use-designated-tooling-not-adhoc.md`: "When the user names the tooling/process to use, use ONLY that surface — never substitute an ad-hoc equivalent (direct file read, node one-liner)" (and B `feedback-use-cli-own-output-not-node-e.md`: "When the designated tool is a CLI (pi-context-cli, state.mjs, etc.), use ITS flags and output directly — never wrap its output in ad-hoc node -e / jq parsing")

11. **Verify current/actual state before reporting; don't substitute a subset/memory**
    - A `feedback_verify_substrate_state_before_reporting.md`: "Verify substrate state directly via grep/jq/python read of the file before reporting it; never recall what was filed from session memory or from what a filing script intended"
    - B `feedback-explore-verify-current-source-not-migrations.md`: "Explore/eval agents must verify CURRENT model/source state — a thing seeded in an old migration may have been deleted by a later one; grep the live class + delete migrations + tests, not historical seeds or .pyc"

12. **Run the whole-project gate, not a hand-picked subset**
    - A `feedback_pipe_masks_exit_code.md`: "`npm test 2>&1 | tail -N` returns tail's exit (always 0); harness reports the pipeline exit, not npm's. Verification gates MUST inspect output content, not exit code, OR use `set -o pipefail`"
    - B `project-run-the-whole-project-gate.md`: "verify with the project's ACTUAL gate command (mypy . / make typecheck / full pytest), never a hand-picked file subset — a subset run hides errors in files you didn't name (esp. test files)"
    - (Near in mechanism, shared in substance: both forbid a verification command that silently hides failures. Listed here as a substance match on "the gate must not mask failures"; the specific mechanism differs — see Near-match for the exit-code-masking angle if a stricter split is wanted.)

13. **Plan-mode / ExitPlanMode gate is mandatory before implementation**
    - A `feedback_no_adhoc_dev.md`: "Never ad-hoc develop — ALL source/implementation changes go through plan mode first, however small or obvious" (and A `feedback_plan_mode_protocol.md`: "Enter plan mode via EnterPlanMode tool before writing plan files — don't write plans outside plan mode")
    - B `feedback-canonical-pipeline-requires-plan-mode-gate.md`: "the canonical pipeline's step 1 MUST run in plan mode with an ExitPlanMode approval gate BEFORE any IMPL dispatch; writing a plan file is NOT the plan-mode phase; skipping the gate breeds dirty unverified residue"

14. **Run the full pipeline / never skip a step for "small/obvious"**
    - A `feedback_explore_even_obvious_fixes.md`: "Run Explore even for 'obvious'/single-line fixes — LLM confidence that the fix is already known is the hubris exploration exists to check"
    - B `feedback-no-pipeline-step-skipping.md`: "Run EVERY canonical-pipeline step including the Explore-agent pass before IMPL, regardless of task size; \"it's a snippet/small/obvious\" is never a warrant to skip; don't substitute your own file-reading for the Explore dispatch"

15. **Investigation goes to an agent; orchestrator doesn't grep as the investigation step**
    - A `feedback_plan_mode_explore_agent.md`: "ALL code investigation goes through an explore/investigation AGENT — in plan mode AND outside it (debug/why-questions/quick checks); the main context (orchestrator) never greps/reads code itself as the investigation step"
    - B `feedback-no-pipeline-step-skipping.md`: "…don't substitute your own file-reading for the Explore dispatch"

16. **Don't prejudice the investigating agent with your own hypothesis**
    - A `feedback_scope_agents_with_facts.md`: "CRITICAL — never spawn implementing agents without embedding exact type signatures, property names, and interface shapes as literal facts in the prompt" (shared substance: how to brief a dispatched agent; A's angle is supply exact facts)
    - B `feedback-dont-prejudice-the-investigating-agent.md`: "When dispatching an agent to root-cause/investigate, give it the symptom + source locations but NOT your own hypothesis; let it reach independent conclusions; root-cause both process and results, not just the surface result"
    - (Overlap is on agent-briefing; A supplies facts, B withholds hypothesis — see Near-match.)

17. **Iterate to zero with the ROOT fix; no residual/defer escalation**
    - A `feedback_class_fix_completeness_reenumeration.md`: "A regression/rename CLASS is closed only by an exhaustive caller-class grep re-enumeration that returns zero; each verification pass may surface more sites — don't declare closed until the re-enumeration is empty."
    - B `feedback-iterate-to-zero-no-pressure-deviation.md`: "In the iterate-to-zero loop, loop on each audit finding with the ROOT fix; never offer residual/defer options or escalate a policy-determined fix"

18. **No "later"/defer of a stated deliverable**
    - A `feedback_no_later_deferral.md`: "Never defer with \"later\"/\"reserved\"/\"named only\"/\"future phase\"; specify every identified component to full implementation depth now"
    - B `feedback-verification-clause-is-the-deliverable.md`: "when a phase's verification clause states a capability its dev steps don't deliver, amend the steps to deliver it (pre-flight) — never offer a defer-option or hedge with a question; deferring a stated deliverable is mandate-004/007 negligence"

19. **No scope reduction / comprehensive not minimal**
    - A `feedback_no_degraded_state.md`: "Plans must address the full surface of the requirement, not a minimalist subset that leaves the architecture in a partially-resolved state" (and A `feedback_no_scope_reduction.md`, A `feedback_best_of_breed_not_minimal_release.md`)
    - B `feedback-cost-is-not-disqualifying.md`: "implementation cost/size/effort is never a disqualifying or cautionary metric for the right design; presenting 'cost'/'heaviest lift'/'largest remodel' as a counterweight is LLM laziness undermining user+project intent"

20. **Never leave the working tree dirty; commit produced artifacts before "done"**
    - A `feedback_commit_proactively.md`: "When work produces uncommitted state on a tracked branch, commit it without waiting for explicit direction. Operator should not have to babysit commits." (and A `feedback_commit_after_edits.md`, A `feedback_commit_immediately_after_substrate_filing.md`)
    - B `feedback-never-leave-dirty.md`: "never leave the working tree dirty after a task; stage and commit (or remove) every produced artifact before reporting \"done\""

21. **Honor the literal command; don't substitute a different/destructive op**
    - A `feedback_never_execute_destructive_unasked.md`: "Merge, push, force-push, tag deletion, branch reset — never execute without user saying \"do it\"" (and A `feedback_no_destructive_git_ops.md`)
    - B `feedback-honor-literal-commands.md`: "when the user names a specific verb (especially a git verb), honor it literally; never substitute a different or more destructive operation"

22. **Narrow directive parsing / scope to the named noun**
    - A `feedback_no_assume_deletion_scope.md`: "Never assume code/template sections are unused just because one caller doesn't provide the data — other callers may exist" (substance overlap: don't over-extrapolate scope)
    - B `feedback-narrow-directive-parsing.md`: "Parse user directives at the narrowest accurate reading; touch only artifacts named; never extrapolate to adjacent files or add unrequested editorial commentary" (and B `feedback-scope-the-noun-they-named.md`)
    - (Overlap is on "don't extrapolate scope"; A's instance is about deletion-safety, B's is about directive parsing — see Near-match.)

23. **Commit messages with special chars via -F from a tmp file / copy-paste-safe commands**
    - A `feedback_no_broken_commands.md`: "Never output shell commands that could be split by line breaks or formatting — commands must be copy-paste safe"
    - B `feedback-commit-message-via-tmp-file.md`: "Commit messages with shell-special chars must use git commit -F from a SYSTEM /tmp file, never -m"
    - (Both target shell-special-char safety in command construction; mechanisms differ — see Near-match.)

24. **The orchestrator runs the shell, not the user**
    - A `feedback_orchestrator_owns_subagent_output.md`: "Garbage in / garbage out — the orchestrator is responsible for verifying every subagent claim before reporting success, not for trusting the agent's self-report" (substance overlap: orchestrator ownership of execution/verification)
    - B `feedback-orchestrator-runs-shell-not-user.md`: "in Part B verification, the orchestrator runs all shell commands; only interactive/UI actions (createsuperuser prompts, browser checks) belong to the human"
    - (Overlap is on orchestrator-owns-execution; A's instance is verifying subagent output, B's is who types shell commands — see Near-match.)

25. **Terse persisted rules for the LLM**
    - A `feedback_concise_zero_loss.md`: "Responses must be as concise as possible with zero loss of signal — no perambulation, no restating, no ceremony" (and A `feedback_concise_no_walls.md`, A `feedback_communications_heuristic.md`)
    - B `feedback-terse-persisted-rules.md`: "rules/notes persisted for the LLM (CLAUDE.md, .context conventions, memories) must be terse — state the directive; the LLM infers the pattern. Don't write exhaustive prose walls."

26. **No meta-commentary / no signposting the rhetorical move**
    - A `feedback_no_stopped_signal.md`: "Never end a response with \"Stopped.\" or equivalent meta-signal — the absence of further action is self-evident from no tool calls"
    - B `feedback-no-meta-commentary.md`: "Deliver facts directly. No preamble headers that announce the rhetorical move (\"Acknowledged error\", \"Verdict\", \"Honest comparison\", \"What this means\", \"Caveat:\"). No statements about one's own reasoning process. No signposting that frames what's about to be said. Section headers describe content, not the act of comparing or judging."

27. **No trailing "awaiting direction" / never end with a question**
    - A `feedback_no_stopped_signal.md`: "Never end a response with \"Stopped.\" or equivalent meta-signal…" (nearest A instance of trailing-meta-phrase suppression)
    - B `feedback-no-awaiting-direction.md`: "never write \"awaiting your direction\" or equivalent trailing phrases; it is presumed and thus redundant"
    - (Both suppress a redundant trailing meta-phrase; the exact phrase targeted differs — see Near-match.)

28. **Don't substitute a degraded artifact / deliver the exact thing named**
    - A `feedback_read_and_pass_specs.md`: "When told to implement specs, read the existing spec files and pass them as prompts to coding agents — do not write new specs" (substance overlap: deliver the exact artifact the user named, don't substitute)
    - B `feedback-no-format-substitution-deliver-exact-artifact.md`: "Deliver the EXACT artifact type the user named (real .docx/.pdf/binary) — never silently substitute a degraded \"dependency-free\" form; and when told to do it via an agent, dispatch the agent (don't do its work inline)"
    - (Overlap is on "deliver the exact named artifact, no substitution"; A's instance is specs, B's is file formats — see Near-match.)

29. **A directive states the OUTCOME; the prompt is a complete self-contained directive**
    - A `feedback_specs_are_implementation_prompts.md`: "Implementation specs (docs/planning/impl/0N-*.md) are self-contained coding prompts, not design documents" (and A `feedback_constraining_subagent_briefs.md`)
    - B `feedback-prompts-as-complete-directives.md`: "each phase prompt is a complete, self-contained directive; IMPL executes, never interprets or makes calls; the set of all prompts must add up to the user stories working" (and B `feedback-directive-states-outcome-not-fixture-construction.md`)

30. **Persist durably — flagging/noting is not persistence**
    - A `feedback_catalog_as_holding_place.md`: "Use timestamped analysis/ markdown as a structured holding place for fragilities, then reify into .context/ blocks when the canonical write path unblocks"
    - B `feedback-flagging-is-not-persistence.md`: "conversational \"flagging/noting\" is NOT persistence — it's lost when the session ends; write to a durable doc that turn or it's gone"

31. **debug/investigate means investigate, not auto-fix**
    - A `feedback_debug_means_investigate.md`: "\"Debug\" means investigate and report — do not implement fixes unless explicitly told to fix"
    - B `feedback-dont-prejudice-the-investigating-agent.md`: "…root-cause both process and results, not just the surface result" (overlap on investigate-first behavior; B's primary thrust is non-prejudicing — see Near-match #16)

32. **No-resume-quiescent-agent / no background subagents**
    - A `feedback_no_background_subagents.md`: "Always run subagents in foreground — background hides agent-type errors and tool-surface mismatches until expensive completion notification, eliminating early-recovery opportunity"
    - B `project-no-resume-quiescent-agent.md`: "you CANNOT resume a quiescent subagent — SendMessage to one is hook-blocked (feedback_no_background_agents); to continue an agent's work, spawn a FRESH foreground Agent with a self-contained prompt carrying all on-disk state"

33. **The .context substrate in this repo is the project's own PM system**
    - A `feedback_llm_filed_substrate_authority.md`: "LLM-authored substrate filed under user direction is the working baseline. Reviewable against verbatim user-message direction; never invalidated wholesale." (substance overlap: the in-repo substrate is authoritative project state)
    - B `project-context-substrate-is-this-repo.md`: "the .context substrate in this repo IS wasc's own; pi-context-cli's install path + the blocks' pi-flavored schema text are not 'another project' — don't divert wasc records elsewhere over that"

## Only-A

Disciplines present only in A (no substance match in B found).

- `feedback_adversarial_audits_not_self_audits.md`: "Never self-audit — always dispatch a fresh-context adversarial reviewer agent…"
- `feedback_adversarial_can_underflag.md`: "The fresh-context adversarial probe can be wrong/under-flag; the orchestrator independently re-verifies its output (re-grep)…"
- `feedback_agent_briefs_require_empirical_cross_validation.md`: "Source-fragment reading produces confident-sounding but wrong conclusions when not cross-checked against runtime evidence…"
- `feedback_agent_output_to_file.md`: "When tasking agents for reports/analysis, instruct them to write output to file — do not consume main context…"
- `feedback_analysis_md_propose_research_filing.md`: "After writing an analysis/*.md, propose surfacing it into the research block (findings_document) to the user…"
- `feedback_best_of_breed_not_minimal_release.md`: "The standard is best-of-breed + superior UX, period…"
- `feedback_claudemd_is_tracked_commit_it.md`: "CLAUDE.md is git-TRACKED (despite a stale .gitignore entry); commit every edit to it…"
- `feedback_clean_git_baseline_before_implementation.md`: "Every plan's pre-implementation phase must establish a clean git baseline before writing/filing/coding…"
- `feedback_cli_is_agent_invoked_caller_is_actor.md`: "The pi-context CLI is agent-invoked — the calling agent is the actor; surface data, don't spawn a subordinate agent…"
- `feedback_cross_package_dist_rebuild_precondition.md`: "For a cross-package change whose tests load a sibling package's dist, the orchestrator must rebuild the UPSTREAM dist…"
- `feedback_delegate_pure_enumeration_partitioned.md`: "Delegate mechanical fact-retrieval (grep sweeps) as PURE enumeration partitioned across parallel agents…"
- `feedback_dispatch_agent_type_must_match_tool_directives.md`: "Before dispatching, verify the chosen subagent_type has the tools the compiled context's <output_format> requires…"
- `feedback_docs_reports_gitignored.md`: "The project's .gitignore excludes docs/ entirely; every per-plan report and verification protocol lives on disk only…"
- `feedback_docs_usage_only_no_fix_reference.md`: "READMEs (package + monorepo) and the SKILL describe current USAGE only…"
- `feedback_dont_dismiss_linter.md`: "Never batch-dismiss linter findings as false positives…"
- `feedback_enforcement_threat_model_is_laziness.md`: "Enforcement/gate design targets a lazy cooperative agent, not an adversary; sabotage-defenses are inanities to strip"
- `feedback_existing_workflows_not_targets.md`: "Zero existing workflows / agents / their tests are work targets; they are disposable legacy PoCs…"
- `feedback_experience_gap_agent_investigation.md`: "An experience gap (surfaced by using the tooling) must be agent-investigated for root cause/shape/repro before filing…"
- `feedback_fgap_closure_canonical_4_fields.md`: "FGAP closure cascade requires FOUR substrate edits, not one…"
- `feedback_filing_pipeline_is_an_enforcement_surface.md`: "Before claiming a discipline is \"off-substrate / can't be structurally enforced,\" check the filing pipeline…"
- `feedback_follow_established_workflows.md`: "When memory documents a required workflow (release checklist, versioning), follow it proactively…"
- `feedback_git_push_authorized.md`: "User authorizes git push to origin — agent handles push, user handles npm publish (requires interactive OTP)"
- `feedback_hold_releases_until_authorized.md`: "Do NOT run npm run release:patch|minor|major (version bump + tag) until the user explicitly authorizes each release…"
- `feedback_implementation_via_subagent.md`: "Implementation (source edits) ALWAYS via a foreground coding subagent from the approved plan…"
- `feedback_live_demo_no_regression_per_cycle.md`: "Every implementation cycle ends with a live demo of working state + a no-regression re-check…"
- `feedback_no_ad_hoc_code.md`: "Never write or edit source code outside of a planned, user-authorized process"
- `feedback_no_correct_validation.md`: "Never say \"correct\", \"right\", \"good point\", or similar…"
- `feedback_no_mandate_violating_options.md`: "When presenting options or paths forward, filter against mandates first…"
- `feedback_no_mcp.md`: "User dislikes MCP — never propose MCP servers as a solution or architecture component"
- `feedback_no_parallel_ungated_paths.md`: "When building enforcement gates, the ungated path must be closed…"
- `feedback_no_pointer_docs.md`: "Don't keep docs that only point to other docs — if the target exists, the pointer is noise"
- `feedback_no_sonnet_agents.md`: "Never use sonnet model override for agents — use default (opus) unless user directs otherwise"
- `feedback_no_speculation_as_conclusion.md`: "Never present speculation as conclusion — if you can't prove it, say what you can prove and stop"
- `feedback_no_stale_stats.md`: "Never store raw stats, counts, or easily derivable numbers — they go stale the moment something changes"
- `feedback_no_stderr_diagnostics.md`: "Diagnostic instrumentation goes through the project's canonical observability pipeline (TraceEntry schema → TraceWriter → agentTrace SDK)…"
- `feedback_no_touch_pi_dir.md`: "Never create, copy, modify, or delete files in .pi/ — user's runtime testing directory, managed manually"
- `feedback_no_worktrees_same_files.md`: "Never use worktree isolation for parallel agents that modify the same files…"
- `feedback_no_youre_right.md`: "Never say \"you're right\" — it's performative agreement, not useful communication"
- `feedback_normalizer_at_dispatch_boundary.md`: "Cross-provider or cross-consumer protocol/shape fixes belong at the pi-jit-agents executeAgent boundary…"
- `feedback_nothing_trivial_when_process_is_everything.md`: "Never dismiss a process/accuracy issue as cosmetic, trivial, or \"not a defect\"; fix it."
- `feedback_op_description_is_user_facing_surface.md`: "A reflected op's description/promptSnippet strings are user-facing surface — refresh them lockstep with behavior…"
- `feedback_operating_context_lockstep.md`: "Operating-context files (CLAUDE.md and anything loaded as instructions every session) must be renamed/updated in lockstep…"
- `feedback_orchestrator_scripts_dual_surface.md`: "The reflecting pi-context-cli is the Claude Code shell surface over the op-registry…"
- `feedback_phases_group_atomic_tasks.md`: "A multi-deliverable arc gets a phase block (arc-level intent + status); each atomic deliverable is its own task…"
- `feedback_plan_mode_step_one_substrate_write.md`: "Plan-mode plan content must reify into substrate blocks as step 1…"
- `feedback_post_merge_build_mandatory.md`: "When source changes merge in from a worktree, branch, pull, or external session, dist/ does not auto-update…"
- `feedback_pre_publish_credentialed_smoke.md`: "Releases shipping new public surface or completing a substrate arc require an end-to-end credentialed verification run…"
- `feedback_process_is_success_metric.md`: "End result without repeatable process is not success — never bypass framework validators, authorship stamping, or documented surfaces…"
- `feedback_release_discipline.md`: "Complete ALL work before running release script — never run release mid-session with pending work"
- `feedback_runtime_demo_plus_adversarial_per_step.md`: "Every implementation step must produce a runtime demonstration… + an adversarial verification probe by a fresh-context skeptic…"
- `feedback_status_updates_after_each_step.md`: "After every progress step (commit / sub-phase landing / fragility discovery), update BOTH the Claude Code Task tool status AND the active substrate's status blocks…"
- `feedback_subagent_commits_per_step.md`: "Subagents commit forensically after EACH step within a sub-phase brief…"
- `feedback_subagent_judgment_is_scoping.md`: "When an audit or enumeration subagent makes judgment calls that exempt entire categories you didn't define, that's a scoping/prompting fault…"
- `feedback_subagents_no_npm.md`: "Subagent briefs must forbid npm commands; subagents hang on contextless npm runs — orchestrator runs all npm itself"
- `feedback_substrate_backup_before_mutation_demos.md`: "Any runtime demo / pipeline step that could mutate or risk the live substrate… back up live .context, work on a DUPLICATE…"
- `feedback_substrate_blocks_not_changelogs.md`: "Substrate block bodies are current-truth guidance, not changelogs — never assert-then-refute within a block…"
- `feedback_tsx_eval_for_deterministic_state.md`: "Deterministic substrate mutations go through the reflecting pi-context-cli ops… npx tsx -e only for library functions with NO CLI op…"
- `feedback_verify_agent_tool_surface.md`: "Some agent types (Explore, code-architect, code-explorer, code-reviewer) lack Edit/Write — using them for editing tasks is a known-state error…"
- `feedback_verify_before_assuming.md`: "Check npm/remote state with actual queries — never assume publish succeeded or failed based on exit codes alone"
- `feedback_version_before_done.md`: "Work isn't complete until it's usable at runtime — version bump is part of the completion sequence"
- `feedback_write_reports_to_docs.md`: "Agent-generated reports (architecture, audits, deep dives) go in docs/, not .pi/ or project root…"
- `reference_claude_code_port.md`: "Port feasibility analysis — pi extensions to Claude Code runtime, gap analysis, recommended approach (researched 2026-04-05)"
- `reference_pi_cli_bridge.md`: "Pi tools accessible from Claude Code or any LLM via pi -p --mode json subprocess — no MCP needed"
- `appendix-substrate-arc-2026-05-01.md`: "Quarantined memory entries authored by a worktree session on 2026-05-01; references files and commits not on main…"

## Only-B

Disciplines present only in B (no substance match in A found).

- `feedback-agent-time-not-human-time.md`: "this is an LLM-executed coding project; all estimates are agent runtime / session count, never human developer days"
- `feedback-automate-not-human-pass-reminder.md`: "when a fragility is reachable only through a skippable human verification step, pull it into the automated gate — never \"resolve\" it by adding a human-pass reminder"
- `feedback-build-evaluation-into-execution.md`: "Build evaluation criteria INTO execution (per-step/per-spec self-checks during the run), not only as a post-hoc output check…"
- `feedback-corroborate-consumer-chain-of-changed-return-shape.md`: "when a plan changes what a function RETURNS (shape/type), corroborate the FULL consumer chain… before the design enters the plan…"
- `feedback-insight-not-reframe.md`: "when asked to read a source \"for insight, not to reframe what we've done,\" extract the insight only… KPIs are an explicit project exclusion"
- `feedback-one-bash-call-per-turn.md`: "Never batch dependent/mutating Bash calls in one message; one tool call per turn"
- `feedback-plan-file-structure.md`: "the portable shape a plan file (~/.claude/plans/*.md) should take — Context, a Success Criteria checklist… a Discipline section"
- `feedback-process-blockers-vs-end-changeable-language.md`: "Gate and iterate-to-zero ONLY on true process blockers; trivial end-changeable language… is WARN + one final polish pass, never blocks completion…"
- `feedback-theme-leads-means-subordinate.md`: "When summarizing a plan/artifact, the THEME (the end/substance) leads; a design discipline or process applied to it is the means…"
- `feedback-user-decision-is-a-directive-to-act.md`: "execute the directive the user gave; do NOT invent blockers/concerns they didn't raise, and do NOT re-interpret their clarifying statements as new scope decisions to litigate"
- `project-catalogue-gate-no-db-enumerated-rejection.md`: "the free-text catalogue-gate (planner/_freetext_audit.py) must NEVER reject a value enumerated in the school's DB; reject only genuine fabrications…"
- `project-dev-db-reset-restores-socrates-grants.md`: "Resetting this project's dev DB (drop/recreate as postgres) wipes the socrates app-role grants — restore them or the app/createsuperuser fails \"permission denied\""
- `project-task-depends-edge-direction.md`: ".context task_depends_on_task is filed parent=PREREQUISITE (earlier task) → child=DEPENDENT (blocked task) — opposite the relation's name…"

## Near-match

Overlapping-but-different disciplines, with the stated difference. (These pairs share a theme but their scope/mechanism diverges; they are NOT counted as full Common matches, and the listed files are NOT double-counted in Only-A/Only-B beyond their primary classification.)

1. **Verification gate must not mask failures** — A `feedback_pipe_masks_exit_code.md` (mechanism: `| tail` swallows npm's exit code; inspect output content or use `set -o pipefail`) vs B `project-run-the-whole-project-gate.md` (mechanism: a hand-picked file subset hides errors in unnamed files; run the actual whole-project gate). Same end (don't trust a verification command that hides failures); different concrete failure mode.

2. **How to brief a dispatched investigation agent** — A `feedback_scope_agents_with_facts.md` (supply exact type signatures / property names / interface shapes as literal facts) vs B `feedback-dont-prejudice-the-investigating-agent.md` (give symptom + locations but withhold your hypothesis so it concludes independently). A adds facts; B withholds a hypothesis — opposite directions on what to include.

3. **Don't over-extrapolate scope** — A `feedback_no_assume_deletion_scope.md` (don't assume code is unused because one caller omits data; other callers may exist) vs B `feedback-narrow-directive-parsing.md` / B `feedback-scope-the-noun-they-named.md` (parse the directive at the narrowest reading; touch only the named noun). A is about deletion-safety from incomplete caller evidence; B is about directive-parsing scope.

4. **Shell-special-char safety in commands** — A `feedback_no_broken_commands.md` (commands must be copy-paste safe; no line-break splitting) vs B `feedback-commit-message-via-tmp-file.md` (commit messages with special chars use `git commit -F` from a /tmp file, never `-m`). A is general command emission; B is the specific commit-message mechanism.

5. **Orchestrator owns execution** — A `feedback_orchestrator_owns_subagent_output.md` (orchestrator verifies every subagent claim before reporting; doesn't trust self-report) vs B `feedback-orchestrator-runs-shell-not-user.md` (orchestrator runs all shell commands; only interactive/UI actions go to the human). A is verification ownership; B is who types shell commands.

6. **Suppress redundant trailing meta-phrase** — A `feedback_no_stopped_signal.md` (no "Stopped." trailing meta-signal) vs B `feedback-no-awaiting-direction.md` (no "awaiting your direction" trailing phrase). Same family (drop a redundant trailing meta-line); different targeted phrase.

7. **Deliver the exact named artifact, no substitution** — A `feedback_read_and_pass_specs.md` (pass the existing spec files; don't write new specs) vs B `feedback-no-format-substitution-deliver-exact-artifact.md` (deliver the exact file type named, e.g. real .docx/.pdf; no degraded dependency-free substitute). A's instance is specs; B's is binary file formats.

8. **Investigate-first vs investigate-without-prejudice** — A `feedback_debug_means_investigate.md` ("debug" = investigate and report, don't auto-fix) vs B `feedback-dont-prejudice-the-investigating-agent.md` (root-cause both process and results; don't seed the agent with a hypothesis). Both about investigation discipline; A's thrust is no-auto-fix, B's is no-prejudice.

## Quantifiable facts

- **File count A**: 107 `*.md` (103 `feedback` + 2 `reference` + 1 `appendix` + 1 `MEMORY.md`).
- **File count B**: 48 `*.md` (41 `feedback` + 6 `project` + 1 `MEMORY.md`).
- **Count by `metadata.type` / frontmatter `type`**:
  - A: feedback = 103; reference = 2; appendix = 1; (MEMORY.md = index, no `type`). No `user` or `project` typed files in A.
  - B: feedback = 41; project = 6; (MEMORY.md = index, no `type`). No `user`, `reference`, or `appendix` typed files in B.
- **Substance mapping counts**:
  - Common (substance match present in both): 33 disciplines (as enumerated above; several reference multiple sibling files on one side).
  - Only-A: 65 files (63 feedback + 2 reference + 1 appendix; computed as A's 106 non-MEMORY files minus the A files appearing in Common/Near-match).
  - Only-B: 13 files (10 feedback + 3 project, as enumerated).
  - Near-match: 8 pairs (each pairing 1 A file/cluster with 1 B file/cluster).
- **MEMORY.md index presence + line-count vs file-count**:
  - A: has `MEMORY.md`. Index bullet lines (`- [...]`): 106. Non-MEMORY `*.md` files: 106. Equal — every non-index file is indexed. (Note: the index is also flagged in its own body as 25.4KB over a 24.4KB limit, so only part loads at runtime; that is a load-time truncation, not a missing index entry.)
  - B: has `MEMORY.md`. Index bullet lines (`- [...]`): 46. Non-MEMORY `*.md` files: 47. Not equal — one file, `feedback-agent-time-not-human-time.md`, exists on disk but has no index entry in B's MEMORY.md.

### Coverage reconciliation

- A: 106 non-MEMORY files = (Common-referenced A files) + (Near-match A files) + (Only-A 65). Every A file appears exactly once across Common / Near-match / Only-A; MEMORY.md is the index itself.
- B: 47 non-MEMORY files = (Common-referenced B files: 24) + (Near-match B files: 4 distinct, some clustered) + (Only-B 13) + the indexing reconciliation above; every B file appears exactly once across Common / Near-match / Only-B; MEMORY.md is the index itself.

Coverage is complete: every `*.md` file in both stores is represented exactly once in the inventories and assigned to exactly one of Common / Near-match / Only-A / Only-B (with MEMORY.md in each store accounted for as the index).
