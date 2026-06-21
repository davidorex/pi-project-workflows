# Provenance — verbatim originating user messages

This file maps each operation-system artifact (under `artifacts/`) to the verbatim user message that birthed it, mined from `claude-history`. Quotes are byte-faithful to the user — never cleaned up, summarized, or paraphrased; only trimmed to the relevant passage, with `[...]` marking any elision. Where no verbatim origin was located, the literal line `VERBATIM ORIGIN NOT LOCATED — <searched>` stands in its place. The artifact bytes themselves live under `artifacts/`; this file is the genesis trail, not a copy of them. Project key substring: `wasc-school-wide-improvement-plan`.

## Root operation docs (CLAUDE.md, MANDATES.md, NORTH-STAR.md)

### artifacts/CLAUDE.md

Heavily-evolved artifact. Earliest write: session `d7310007-aef3-4e05-a651-d218d1cfd12f` / `2026-05-16T00:34:35Z` (seeded with only a deployment-pointer stub). The substantial orchestration-discipline body was written `2026-05-18T00:52:46Z` (same session) and the file continued evolving across many later sessions into its present form.

Originating genesis user message (session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-05-16T00:34:21Z`):

> add to claude.md that deployment details are in the skill. don't editorialize or exceed scope of what i directed.

Note: that first directive birthed the file as a one-line deployment-pointer stub. The orchestration-discipline content that dominates the present CLAUDE.md grew from the broader workflow-design directives later in the same session (the three-actor orchestrator/IMPL/AUDIT shape — see MANDATES.md below) and from dozens of subsequent corrections; the file is the most heavily-evolved artifact in this set.

### artifacts/MANDATES.md

Genesis write: session `d7310007-aef3-4e05-a651-d218d1cfd12f` / `2026-05-17T23:56:19Z` / write message_uuid `6e6119aa-625b-41b7-8439-00065ef753f5`. The mandates crystallized from a cluster of design directives in that session establishing the orchestrator / subagent posture. The load-bearing genesis directives, verbatim:

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-05-17T23:07:17Z`:

> let's reduce complexity but strengthen validation: the concept of an orchestrator; best-practices structured implementation sub-agent prompt templates; best-practices structured adverserial-audit-of-implementation subagent.

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-05-17T23:10:52Z`:

> adverserial audits against prompt and runs validation scripts; orchestrator reads outputs; human observes and directs; i don't want micro decisions by human when policies and mandates clearly state; human gives go/no go on advancing

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-05-17T23:24:33Z`:

> no llm recommendations from sub agents, cuz they'll hedge and defer and be lazy. we remove that from their cognizance entirely

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-05-17T23:26:04Z`:

> let's not have this: Audit findings: 0 critical, 1 major, 0 minor -- pure binary. llm's will hedge.

### artifacts/NORTH-STAR.md

Genesis write: session `6e98b2bc-7540-47e7-be51-97919a8cb9f2` / `2026-06-20T04:06:38Z` / write message_uuid `005c9de0-1ec1-4570-ad6d-d42d1b72392f`.

Originating user messages (session `6e98b2bc-7540-47e7-be51-97919a8cb9f2`):

`2026-06-20T04:02:47Z`:

> where have we articulated clearly the end result we are aiming for such that decisions can be derived simply and cleanly.

`2026-06-20T04:04:56Z` (the direct genesis directive):

> create the standalone north-star artifact. i'm tired of llm's inventing and not knowing or deriving from clear policies and principles and adhering to them.

## .claude operation system (settings, hooks, commands, agents, skills)

### artifacts/dot-claude/hooks/one-bash-per-turn.js

Genesis write: session `d7310007-aef3-4e05-a651-d218d1cfd12f` / `2026-05-31T04:23:00Z` / write message_uuid `9f692db8-991a-4a4d-82da-6b47daa2a099`.

Originating user messages (session `d7310007-aef3-4e05-a651-d218d1cfd12f`):

`2026-05-31T03:52:37Z` (the genesis impulse):

> make a hook to prevent you from your stupidity

`2026-05-31T03:53:43Z` (the full directive, via the create-hooks skill):

> Invoke the create-hooks skill.
>
>
> ARGUMENTS: Prevent batching multiple Bash tool calls in a single assistant turn. The recurring failure: I emit several Bash calls in one message; the first nonzero exit cancels the rest, producing cascade errors and wasted turns. Desired hook: a PreToolUse hook on Bash that blocks/denies when more than one Bash call is issued in the same turn (or warns and enforces one-Bash-call-per-turn), so the constraint is mechanical rather than dependent on my discipline.

`2026-05-31T03:57:50Z` (the project-scope qualifier):

> make it for this project only. not global.

### artifacts/dot-claude/hooks/gate-before-commit.sh

Genesis write: session `d7310007-aef3-4e05-a651-d218d1cfd12f` / `2026-06-05T21:30:00Z` / write message_uuid `2a43e59e-616d-42b7-af97-548b2803e36e`.

The hook was born out of the user's anger that the assistant's gate-green claims were false (it had run `ruff check` but not `ruff format --check`, drifting format and leaving CI red-if-pushed). The genesis is the assistant's proposed single-sentence design (a PreToolUse hook on `git commit` running the full CI gate and denying on any failure) approved by the user's "do that". Verbatim user messages (session `d7310007-aef3-4e05-a651-d218d1cfd12f`):

`2026-06-05T21:16:44Z`:

> why the negligent ruff usage

`2026-06-05T21:17:31Z`:

> when are you going to stop actively damaging my codebase

`2026-06-05T21:28:09Z`:

> in a single fucking sentence.

`2026-06-05T21:28:25Z` (the approval that birthed the hook):

> do that

`2026-06-05T21:32:29Z` (the subagent-coverage qualifier that shaped the hook):

> does that apply to subagent commits too

Context corroboration (the carried-forward intent summary in the same session, `2026-06-05T21:33:29Z`): "Add a Claude Code PreToolUse hook on Bash `git commit` that runs the full CI gate (`ruff check` + `ruff format --check` + `mypy .` + `pytest` + `make test-js`) and denies the commit on any failure — a mechanical gate ... User said \"do that.\""

### artifacts/dot-claude/settings.json

The two-hook registration (one-bash-per-turn + gate-before-commit) in `settings.json` shares the genesis of the hooks themselves — it is the wiring half of the same directives. The project-scope wiring directive (one-bash hook), verbatim (session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-05-31T03:57:50Z`):

> make it for this project only. not global.

The gate-before-commit wiring is the same `do that` (`2026-06-05T21:28:25Z`) plus the subagent-coverage qualifier `does that apply to subagent commits too` (`2026-06-05T21:32:29Z`) quoted above. No separate "edit settings.json" user message exists distinct from the hook-creation directives; the settings wiring is the mechanical realization of those directives.

### artifacts/dot-claude/settings.local.json

VERBATIM ORIGIN NOT LOCATED — this is a Claude-Code-managed permissions allowlist that the harness auto-accumulates as the user approves individual tool permissions; there is no single genesis user message. Searched: the file is generated by Claude Code permission approvals, not authored by a user directive.

### artifacts/dot-claude/commands/audit-context-currency.md

Genesis write: session `8c933c8b-770a-4c3b-b6b7-7be63588f244` / `2026-06-14T05:25:11Z` / write message_uuid `23ff2ba2-346c-433a-a680-ff37eea4c9f3`.

Originating user messages (session `8c933c8b-770a-4c3b-b6b7-7be63588f244`):

`2026-06-14T04:57:10Z`:

> why did you have to look for it and why is that not in context

`2026-06-14T04:58:08Z`:

> i cannot accept that context is not up to date or that it is not complete

`2026-06-14T05:11:46Z` (the direct genesis directive for the command + agent):

> i don't want a mechanical guard. i want a claude skill / agent that runs in a loop every 10 minutes to audit context maintenance and currency. it will not change context but will give reports. it will be relentlessly factual and forensic and make use of git as well as claude-history to ensure on file context is wholly up to the moment valid and complete.

`2026-06-14T05:15:41Z` (the project-scope qualifier):

> i want it for this project only. not a global.

### artifacts/dot-claude/agents/context-currency-auditor.md

Same genesis as the audit-context-currency command (the command and the auditor agent were born from a single directive in session `8c933c8b-770a-4c3b-b6b7-7be63588f244`). The auditor agent is the "claude skill / agent that runs in a loop every 10 minutes to audit context maintenance and currency ... relentlessly factual and forensic ... make use of git as well as claude-history" called for verbatim in the `2026-06-14T05:11:46Z` message quoted above, scoped to this project by the `2026-06-14T05:15:41Z` message above.

### artifacts/dot-claude/skills/run-prompt-workshop/ (SKILL.md + smoke.sh)

Genesis write: session `bd501b6f-4d77-4c99-ab21-3b1f5e497c5a` / `2026-06-19T01:07:03Z` (smoke.sh) and `2026-06-19T01:09:04Z` (SKILL.md).

This skill was authored by the official Claude Code `/run-skill-generator` bundled skill, which the user invoked and pointed the assistant to use. The assistant initially balked (preferring the homegrown RUNBOOK); the user's verbatim genesis directives (session `bd501b6f-4d77-4c99-ab21-3b1f5e497c5a`):

`2026-06-19T01:03:32Z`:

> so you choose not to continue with the explicit claude code feature I pointed you at because we have a homegrown version. that's your response?

`2026-06-19T01:11:54Z` (treating the run-skill best practice as binding):

> why are you treating a best practice as though it's optional?

The unit targeting was the user's AskUserQuestion answer "Workshop pipeline (Recommended)" (recorded in-session `2026-06-19T01:04:44Z`).

### artifacts/dot-claude/skills/update-context/ (SKILL.md + update-context.sh)

Genesis write: session `bd501b6f-4d77-4c99-ab21-3b1f5e497c5a` / `2026-06-19T01:42:06Z` (update-context.sh).

Born when the user objected that the run-skill candidate survey surfaced nothing about keeping context current — the "run that changes state is not complete until it is recorded" discipline. Verbatim user genesis (session `bd501b6f-4d77-4c99-ab21-3b1f5e497c5a`):

`2026-06-19T01:19:28Z`:

> nothing about keeping context updated

`2026-06-19T01:20:45Z`:

> that's not what i said. why did your agent surface nothing about the process of updating context?

`2026-06-19T01:22:01Z`:

> do it again and don't diminish or augment my directives.

### artifacts/dot-claude/skills/validate-context/ (SKILL.md + validate-context.sh)

Genesis write: session `bd501b6f-4d77-4c99-ab21-3b1f5e497c5a` / `2026-06-19T01:42:46Z` (validate-context.sh; rewritten to jq-based parsing `2026-06-19T02:03:54Z`).

Companion to update-context, born from the same context-currency directive cluster in session `bd501b6f-4d77-4c99-ab21-3b1f5e497c5a` (the "process of updating context" + "keeping context updated" directives quoted under update-context above). The validate-context smoke exercises the substrate-validation surface (`context-validate` / `context-validate-relations`) that the same "wholly up to the moment valid and complete" intent (session `8c933c8b`, `2026-06-14T05:11:46Z`) demands; no separate user message named "validate-context" specifically. VERBATIM ORIGIN (skill-specific) NOT LOCATED beyond the shared context-currency directive cluster — searched session `bd501b6f` window 01:09–01:42 for a validate-specific directive; the skill is the validation half of the "updating context / context currency" directives.

## Memory — behavioral mandates (feedback-*.md, project-*.md, MEMORY.md)

Each entry below quotes the originating user correction located by one focused full-text search keyed on the file's slug/gloss. `MEMORY.md` itself is an LLM-authored index (a one-line gloss per file) with no single user genesis.

### artifacts/memory/MEMORY.md

LLM-authored index; no single user genesis message. It is the distilled table of contents over the feedback-/project- files, composed by the assistant, not dictated verbatim by the user.

### artifacts/memory/feedback-no-awaiting-direction.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-05-18T04:45:25Z`:

> never say ">>>awaiting your direction<<<" again. it is presumed and thus redundant.

Reinforced (session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-05-30T12:51:33Z`):

> quit saying ">>>awaiting your direction<<<." it's inane noise and peformative bullshit. you do as i direct. that's a given. it doesn't come from you.

The remaining memory files below were located deterministically: each memory file's creation timestamp (from `file_operations`) anchors the lookup, and the originating user correction is the nearest preceding verbatim user message in the same session (`d7310007-...` unless noted). All quotes are byte-faithful.

### artifacts/memory/feedback-narrow-directive-parsing.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-05-15T11:32:01Z`:

> that must be in memory. you're not capable of holding yourself to anything.

(The narrowing principle itself was the directive this correction enforced; this is the persist-to-memory trigger that birthed the file.)

### artifacts/memory/feedback-no-meta-commentary.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-05-17T08:51:46Z`:

> get yourself under control. do not repeat crap noise like " Acknowledged error" or "verdict." give me the fucking facts.

### artifacts/memory/feedback-honor-literal-commands.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-05-18T04:47:09Z`:

> get yourself under control and put that in memory. i despise that kind of llm deviation from what the user says.

Triggering instance (the rm-for-git-restore substitution), session `d7310007`, `2026-06-05T20:31:34Z` / `2026-06-05T20:32:56Z`:

> git restore those files -- not reset or anything -- to pre impl state.

> who the fuck said rm

### artifacts/memory/feedback-plain-diction.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-05-18T06:01:53Z`:

> evelate those guns a little lower. your diction is opaque to the point of meaninglessness.

### artifacts/memory/feedback-prompts-as-complete-directives.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-05-18T06:03:25Z`:

> i don't want it to make calls. i want 1 prompt to be 1 properly scoped and detailed directive such that cumulatively they add up to the user stories being enacted / possible. do not drown this is bureaucracy for bureacracy's sake perfomativeness.

### artifacts/memory/feedback-positive-statements-only.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-05-18T06:20:53Z`:

> this is inane. "these do not" -- why are you specifying non-existence explicitly? wtf are you doing? are you capable of doing this task?

### artifacts/memory/feedback-agent-time-not-human-time.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-05-18T07:14:50Z`:

> don't ever give me stupid human estimations. do you not from what we are doing are you not capable of seeing this is an llm coding project

### artifacts/memory/feedback-never-leave-dirty.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-05-18T23:04:58Z`:

> leave nothing dirty ever.

### artifacts/memory/feedback-orchestrator-runs-shell-not-user.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-05-18T23:20:20Z`:

> commands are not for a user to do. browser stuff is. other than createsuperuser. i'll do that.

### artifacts/memory/feedback-no-options-when-path-clear.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-05-19T05:19:34Z`:

> task an agent for the single acceptable path: and do not present such options again in the future when the root cause and known best path is clear.

### artifacts/memory/feedback-scope-the-noun-they-named.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-05-19T08:58:18Z`:

> i said code. pay attention to what i saidl

### artifacts/memory/feedback-automate-not-human-pass-reminder.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-05-20T09:50:41Z`:

> but we're leaving a silently skippable?

### artifacts/memory/feedback-verification-clause-is-the-deliverable.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-05-20T10:36:22Z`:

> given the intention of the project as well as mandates, is there a derivable answer and is this question an unnecessary hedge?

### artifacts/memory/feedback-insight-not-reframe.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-05-20T13:04:31Z`:

> i don't want kpis. that's exactly what i told you not to do.

### artifacts/memory/feedback-noted-gap-is-a-work-item.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-05-20T13:22:12Z`:

> this is too much: if i note a gap i am noting it to be worked on: . They are surfaced here per mandate-007; whether to add them is a scope decis +ion for the user, not an autopilot change.

### artifacts/memory/feedback-cost-is-not-disqualifying.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-05-20T22:57:30Z`:

> don't hedge and don't consider "cost" as a disqualifying metric. that's llm laziness actively undermining user and project intentions.

### artifacts/memory/feedback-no-augmenting-user-stories.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-05-21T11:23:49Z`:

> no notifications/acknowledgment; never even considered or raised by me

### artifacts/memory/feedback-user-decision-is-a-directive-to-act.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-05-22T10:45:39Z`:

> i already made the decision. why are you not planning and then implementing

### artifacts/memory/feedback-flagging-is-not-persistence.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-05-25T20:05:27Z`:

> flagged = lost if not persisted

### artifacts/memory/feedback-options-proliferation-noise.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-05-27T01:33:11Z` (objecting to internally-contradictory options offered):

> your options here seem at times contradictory: [...followed by the assistant's two contradictory fall-back-language options that the user is rejecting...]

### artifacts/memory/feedback-one-bash-call-per-turn.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-05-31T02:17:17Z`:

> unacceptable repeated failures. immediately change your operating heuristic.

(Same failure-class that, the same session, drove the one-bash-per-turn HOOK: "make a hook to prevent you from your stupidity" — see artifacts/dot-claude/hooks/one-bash-per-turn.js above.)

### artifacts/memory/feedback-use-designated-tooling-not-adhoc.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-06-02T13:01:12Z`:

> it's not instinct. it's how the thing is designed. i began by saying "use the scripts referenced in claude.md" - not ad hoc. correct process gives success. you must adhere to my process when i give it.

### artifacts/memory/feedback-no-verification-theatre.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-06-03T10:10:34Z`:

> i'm not sold on those fakeable performance bash echo's. it's theatre.

Reinforced (session `d7310007`, `2026-06-05T21:00:48Z`):

> yes verify but no bash echo prose. determinative only.

### artifacts/memory/feedback-plan-file-structure.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-06-04T21:16:11Z`:

> see this as an example of the kind of plan I'd like to see: i'm a bit surprised there's such variation between different Claude Code structuring of plans across different projects: Here is the last plan used — TASK-011 (`/Users/david/.claude/plans/iridescent-nibbling-wand.md`), verbatim, as a reference exemplar for other projects: [...the iridescent-nibbling-wand.md plan body follows...]

### artifacts/memory/feedback-explore-verify-current-source-not-migrations.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-06-04T22:42:18Z`:

> that's stupid of the explore agent.

### artifacts/memory/feedback-terse-persisted-rules.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-06-05T11:11:31Z`:

> that's way too long a note for claude. the llm will read it and see the pattern.

### artifacts/memory/feedback-commit-message-via-tmp-file.md

VERBATIM ORIGIN NOT LOCATED — no user-genesis message exists for this one. Searched session `d7310007` window 2026-06-06 22:00–23:16 and FTS for "backticks"/"heredoc"/"git commit -F": the memory file was authored by the orchestrator (created `2026-06-06T23:15:51Z`) from an OBSERVED in-loop commit footgun (an IMPL agent's `git commit -m` silently dropping `$(...)`/backtick words), not from a verbatim user correction. It is an LLM-derived operational memory, not user-dictated.

### artifacts/memory/feedback-iterate-to-zero-no-pressure-deviation.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-06-07T07:56:07Z` / `2026-06-07T07:57:17Z`:

> why did you stop and violate mandates ?

> there is a reason for the canonical pipeline and the mandates and you need to adhere and not deviate

Canonical statement of the rule (session `8490e49a-...`, `2026-06-09T08:32:45Z`):

> do not deviate from canonical process within iterate to zero. If the agent surfaces an issue, it gets explored, planned, impl, etc. iterate to zero.

### artifacts/memory/feedback-only-act-on-explicit-directives.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-06-07T21:05:31Z`:

> don't infer any action from my statements that is not a direct statement of a directive to action.

### artifacts/memory/feedback-theme-leads-means-subordinate.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-06-09T01:52:11Z`:

> that last summary part way downplays the theme in favor of the learning-science process

### artifacts/memory/feedback-use-cli-own-output-not-node-e.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-06-09T07:29:42Z`:

> don't make me have to direct you so again

(Terse persist-trigger enforcing the use-the-CLI's-own-output rule; the substantive correction is the use-designated-tooling lineage above.)

### artifacts/memory/feedback-no-format-substitution-deliver-exact-artifact.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-06-09T08:48:42Z`:

> Produce a REAL Microsoft Word document (true binary OOXML, like a normal Word file — NOT HTML-saved-as-.doc) for each of three HTML plans, in LANDSCAPE orientation, with the visual formatting preserved (tables with borders, colored chips/tags, section boxes, headings, the meta table, and the multi-column action-step grid). [...] Match the KIND of artifact in `/Users/david/Projects/wasc-school-wide-improvement-plan/data/Sample - Schoolwide Action Plan 2.docx` [...]

### artifacts/memory/feedback-process-blockers-vs-end-changeable-language.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-06-10T12:03:10Z`:

> we cannot get bogged down by trivialities blocking completion so we can see end results. we have to better articulate what are true PROCESS blockers versus trivial language that's changeable at end.

### artifacts/memory/feedback-no-pipeline-step-skipping.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-06-10T22:09:04Z`:

> you didn't do the explore before impl. yes it's a snippet the pipeline exists to guarantee things you might hedge / bypass / punt on. meaning you are deviating from the steps in the pipeline and deviation more predictably than not leads to chaos due to llm short sightedness and favoring lazy hedging over the user's criteria

### artifacts/memory/feedback-build-evaluation-into-execution.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-06-10T23:05:12Z`:

> 2 things: we need to audit exactly how we're transposing from simulations to workshopping code and ensure there are evaluation criteria built in during the execution, too; i don't want these only to be found upon output; the impl agent needs more exact success criteria and process criteria; and 2 yes on your explore idea, but also don't prejudice what the agent finds. we want transposition process + results regressions root caused.

### artifacts/memory/feedback-dont-prejudice-the-investigating-agent.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-06-10T23:05:12Z` (same compound directive, the second clause):

> [...] also don't prejudice what the agent finds. we want transposition process + results regressions root caused.

### artifacts/memory/feedback-corroborate-consumer-chain-of-changed-return-shape.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-06-13T03:05:10Z`:

> canonical pipeline for the adjustment. this is a failure in planning.

### artifacts/memory/feedback-canonical-pipeline-requires-plan-mode-gate.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-06-13T08:46:40Z` / `2026-06-13T08:48:19Z` / `2026-06-13T08:48:51Z`:

> why are you not in plan mode if this is canonical pipeline

> no. start from square 1 after wasting huge resources deviating from canonical pipeline. reiterate in 1 sentence the canonical pipeline so i can audit your understanding.

> TASK-047 canonical pipeline, in plan mode this time

### artifacts/memory/feedback-directive-states-outcome-not-fixture-construction.md

Session `8c933c8b-770a-4c3b-b6b7-7be63588f244`, `2026-06-14T03:52:12Z`:

> run the audit but i have zero confidence in your creating a properly scoped subagent

(The substantive lesson — a directive states what must be TRUE, not how to build the fixture — was distilled by the orchestrator from the TASK-052 over-specified-directive failure investigated in this session; the user message above is the trigger that prompted that audit.)

### artifacts/memory/feedback-dont-punt-researched-decisions-as-questions.md

Session `6e98b2bc-7540-47e7-be51-97919a8cb9f2`, `2026-06-20T06:30:33Z`:

> how the fuck am i supposed to know that? isn't that why we investigated and researched? would i ask you to research if i were the source of the answer?

### artifacts/memory/project-dev-db-reset-restores-socrates-grants.md

VERBATIM ORIGIN NOT LOCATED (as a user correction) — this is an operational/environment memory (created `2026-05-31T11:27:09Z`) the orchestrator derived from an observed dev-DB-reset failure (the `socrates` role losing grants), not from a verbatim user directive. Nearest preceding user message was a status confirmation ("superuser created. admin accessible.", `2026-05-31T11:26:20Z`). It is an LLM-derived environment fact.

### artifacts/memory/project-context-substrate-is-this-repo.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-06-04T22:16:58Z`:

> do you not know we are in this dir? /Users/david/Projects/wasc-school-wide-improvement-plan

### artifacts/memory/project-catalogue-gate-no-db-enumerated-rejection.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-06-04T22:27:19Z`:

> think globally: of course the short-form of the school's name should be accepted. and any enumerated from db e.g. caring similarly cannot be rejected.

### artifacts/memory/project-task-depends-edge-direction.md

VERBATIM ORIGIN NOT LOCATED (as a user correction) — this edge-direction memory (created `2026-06-05T18:19:52Z`) was orchestrator-derived from working with the `task_depends_on_task` relation during a plan-mode fix the user directed ("do plan mode and then make the fix to that yourself after creating a plan", `2026-06-05T11:31:33Z`); no verbatim user message states the parent=prerequisite direction. It is an LLM-derived substrate fact.

### artifacts/memory/project-run-the-whole-project-gate.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-06-05T19:09:20Z`:

> explore plan impl. do not vary the process. only process results in non-chaotic results.

(The whole-project-gate lesson — run the gate at full scope, e.g. `mypy .`, not a file subset — was distilled from the A3 subset-mypy-clean-but-full-red failure; the user message above is the process-adherence directive in force when it surfaced.)

### artifacts/memory/project-no-resume-quiescent-agent.md

Session `d7310007-aef3-4e05-a651-d218d1cfd12f`, `2026-06-05T19:23:51Z`:

> in claude.md canonical pipeline you must encode that you cannot resume a quiescent agent, as you've just "rediscovered" for the 9000th time.
