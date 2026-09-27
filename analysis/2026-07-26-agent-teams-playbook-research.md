# Using Claude Code agent teams productively — a playbook for pi-project-workflows

Research date: 2026-07-26. Companion to
`analysis/2026-07-25-agent-dispatch-hardening-research.md` (referred to below as **HR**, cited by
section). HR covers the *enforcement* layer — hook mechanics, subagent frontmatter fields,
enforcement levels [E] harness-enforced / [V] hook-verified / [P] prose. This report covers the
complementary half: how to *use* teams and named dispatch agents to get this repo's real work
done.

HR's findings are taken as given and not re-derived. Where this report depends on a hook
mechanism, it cites HR by section rather than re-fetching the source.

**Two facts verified on this machine at the time of writing**, because both are load-bearing and
neither was true-by-assumption:

- `claude --version` → **2.1.220**, so every version-gated capability cited below (all at or
  under 2.1.220) is live here.
- `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"` is **already set** in
  `/Users/david/.claude/settings.json:5`. Teams are not a future option on this machine; they are
  on right now, which is why this very session is running with addressable teammates. The
  question is therefore not "should we enable teams" but "for which work are they the right
  shape".

**Status of HR §4.5.** HR concluded "adopt the subagent-definition layer now; treat teams as an
execution mode to evaluate later," reached from the limitations list alone. This report refines
rather than overturns it: §6 identifies which of this project's work items teams genuinely serve
*today* and which they do not, and §5 gives pattern-level mitigations for each documented
limitation. Both reports agree on the load-bearing point — the hook and definition layer is a
prerequisite either way, because the same `.claude/agents/*.md` definitions and the same exit-2
gates serve both the Agent-tool path and the teammate path.

HR's description of the current repo state was re-checked and still holds: `.claude/agents/`
contains exactly one definition (`context-currency-auditor.md`); `.claude/settings.json` declares
hooks for `UserPromptSubmit` and `PreToolUse` only; `.claude/hooks/` holds four `block-*.sh`
guards with three companion `*.test.sh` files. `SubagentStop`, `Stop`, `TeammateIdle`,
`TaskCreated`, and `TaskCompleted` remain entirely unclaimed.

---

## 1. Sources consulted

Fetched and read unless noted. Unreachable or unfetched pages are named in §7, never paraphrased
from memory. Community pieces are labelled and their claims attributed, not laundered into fact.

### Official documentation

| # | URL | What it established |
|---|-----|---------------------|
| T1 | https://code.claude.com/docs/en/agent-teams | The whole productive-use surface. When-to-use criteria and the explicit subagents-vs-teams comparison table; team formation (no setup step as of v2.1.178, `TeamCreate`/`TeamDelete` removed, `team_name` on the Agent tool accepted but ignored); display modes (`teammateMode`, in-process default since v2.1.179, split panes need tmux or iTerm2 + `it2`); teammate model selection (teammates do **not** inherit the lead's `/model`; set `/config` → "Default teammate model"); effort inheritance from v2.1.186; **plan approval for teammates**, and that the lead approves autonomously so criteria must be planted in the prompt; the shared task list — three states, dependency blocking, automatic unblock on completion, file-locked claiming; subagent definitions reusable as teammate roles (honors `tools` + `model`, body *appended* to the system prompt, `skills`/`mcpServers` **not** applied, team tools always available regardless of `tools`); mailbox at `~/.claude/teams/{team}/inboxes/{agent}.json`; task list at `~/.claude/tasks/{team}/` which **persists** while the team config directory is deleted at session end; `TeammateIdle`/`TaskCreated`/`TaskCompleted` as the quality gates; team-size guidance (3-5) and tasks-per-teammate guidance (5-6); the "wait for teammates", "avoid file conflicts", "monitor and steer", "start with research and review" best practices; the complete limitations list. |
| T2 | https://code.claude.com/docs/en/costs | The one hard official cost number: "**Agent teams use approximately 7x more tokens than standard sessions when teammates run in plan mode**". Cost levers: Sonnet for teammates, keep teams small, keep spawn prompts focused (spawn-prompt text sits in every teammate's context from turn one), shut teammates down when done because an active teammate consumes tokens until it exits. Also names active teammates as one of the reasons a long-lived session's usage climbs. |
| T3 | https://code.claude.com/docs/en/interactive-mode | The task list from the user's side: `Ctrl+T` toggles it, shows five at a time; "Tasks persist across context compactions"; and the durable-backlog lever — **`CLAUDE_CODE_TASK_LIST_ID=my-project claude` uses a named directory under `~/.claude/tasks/`, sharing one task list across sessions**. Also that `/tasks` is a different view (running shells and subagents). |
| T4 | https://code.claude.com/docs/en/code-review | Anthropic's own production multi-agent architecture, described operationally: "multiple agents analyze the diff and surrounding code in parallel… Each agent looks for a different class of issue, **then a verification step checks candidates against actual code behavior to filter out false positives**. The results are deduplicated, ranked by severity, and posted…". Reviews average 20 minutes and \$15-25. Critically for this repo: **`REVIEW.md` "is injected into the system prompt of every agent in the review pipeline as the highest-priority instruction block"** and "because it's pasted verbatim, `@` import syntax is not expanded" — a shipped instance of the DRY verbatim-injection pattern. Also the tunable "verification bar" idea: "behavior claims need a `file:line` citation in the source, not an inference from naming". |
| T5 | https://code.claude.com/docs/en/permission-modes | Read to check for a documented "delegate" mode. The mode table is `default` / `acceptEdits` / `auto` / `dontAsk` / `bypassPermissions` / `plan`. **No delegate mode appears on this page** (the only "delegate" hits are auto-mode's handling of *delegated* subagent tasks). See §3.7 for what this means for the community delegate-mode claim. |

### Community and industry experience reports (claims attributed, not adopted as fact)

| # | URL | What it reports, and how strong the sourcing is |
|---|-----|---|
| C1 | https://cognition.com/blog/dont-build-multi-agents | The load-bearing counterpoint, from the Devin team. Two stated principles: **"Share context, and share full agent traces, not just individual messages"** and **"Actions carry implicit decisions, and conflicting decisions carry bad results"**. Worked failure: parallel subagents building a Flappy Bird clone produce a Super Mario background and an incompatible bird, and the integrator inherits the mess. Recommends a **single-threaded linear agent** with continuous context as the default, and a dedicated context-compression model for tasks too long to fit. Position piece grounded in their own product experience, not a controlled study. |
| C2 | https://www.contextstudios.ai/blog/claude-code-agent-teams-a-builders-guide-to-parallel-ai-coding | The most detailed practitioner account found. First-hand incident, quoted: "Within 20 minutes, the backend agent and data engineer were both editing the same migration file. The frontend agent was building against an API contract that the backend agent had already changed" — six agents, no ownership boundaries, three had to be killed and restarted. Derived rule: file ownership must be a `PreToolUse` hard constraint, "not soft guidelines in CLAUDE.md". Names four team shapes (full-stack split, specialist swarm, pipeline, competing architectures) and the hook placements they used (`PreToolUse` ownership, `PostToolUse` test validation, `Stop` coverage check, `SessionStart` shared-feature-list injection). Claims "the single biggest predictor of team success is the quality of the initial decomposition". Also relays the Nicholas Carlini C-compiler run (16 parallel agents by subsystem, ~100k-line Rust compiler, ~2B input tokens, ~2,000 sessions, under \$20,000) — **relayed second-hand; treat the numbers as reported, not verified here**. |
| C3 | https://www.builder.io/blog/claude-agent-teams-explained-what-it-is-and-how-to-actually-use-it | The skeptical read: "**Claude agent teams are pointless for _most_ things.**" Red flags listed as sequential dependencies, same-file editing, small single-session work, cost sensitivity. Green cases: parallel review, competing-hypothesis debugging, cross-layer features. Reports "3–4x the tokens of a single session" for typical teams (lower than T2's 7x plan-mode figure — the two are not measuring the same thing) and notes local machine cost: "Five teammates means five context windows running simultaneously. On a laptop, you'll feel it." Names the two most common operator errors: leaving the lead in its default mode so it writes code instead of coordinating, and "skimping on the spawn prompt". States flatly: "Team dies with the session. No resume, no rewind." |
| C4 | https://www.codecentric.de/en/knowledge-hub/blog/autonomous-development-workflows-with-claude-code | Christoph Dalski's account of rebuilding the `rlsp` Rust language-server project largely through an agent-team workflow. Three phases: planning (lead asks clarifying questions, human approves the plan), execution (architect / developer / test engineer / security engineer / reviewer in parallel with direct teammate messaging), review (human reviews commits after). Two concrete failure findings that matter here: (a) a reviewer that checked code quality but not plan alignment let "entire feature infrastructure… be built, tested, and waved through review — but never integrated", fixed by adding a dedicated **plan-reviewer** agent; (b) "**If a process step looks optional, an agent will skip it — even when it shouldn't. Multi-step flows need explicit markers: always, without exception.**" Independently converges on T1's task-sizing rule: "one function, one test file, one review". |
| C5 | https://www.tembo.io/blog/claude-code-multi-agent-orchestration | Largely restates T1's guidance (3-5 teammates, 5-6 tasks each, "three focused teammates usually beat five scattered ones"). Adds the three-tier framing: subagents / built-in teams / external orchestrators across repos. **No first-hand failure modes, throughput numbers, or cost multipliers of its own** — used only as corroboration that the documented guidance is what practitioners actually repeat. |
| C6 | https://claudefa.st/blog/guide/agents/agent-teams-controls | The only source found describing **delegate mode**: Shift+Tab toggles the lead into coordination-only (spawn, message, shut down, manage tasks; "the lead can't touch code directly"), recommended for teams of 4+. C3 independently references the same Shift+Tab toggle. Both are community guides; T5 does not document it. Treated in §3.7 as a **community claim requiring one keystroke to verify**, not an established capability. |

### Search-result-only (not fetched; used for nothing load-bearing)

Anthropic's internal Code Review coverage figure — PRs receiving substantive review comments
rising from 16% to 54%, with under 1% of findings marked incorrect — appeared consistently across
several secondary write-ups in search results. The primary Anthropic source for those specific
numbers was not located and fetched, so the figure is recorded here as **unverified secondary
reporting** and nothing in §3 or §4 rests on it. What *is* grounded is T4's architectural
description of the same system, which was fetched.

---

## 2. What teams add over sequential subagent dispatch

Four mechanisms. Each exists for a specific job, and each is worth naming separately because
three of this project's five open work items need exactly one of them and none of the others.

### 2.1 A shared task list that outlives any context window

Tasks live in `~/.claude/tasks/{team-name}/` with three states, `blockedBy`-style dependencies
that auto-unblock when the blocking task completes, and file-locked claiming so two teammates
cannot take the same item (T1). Two properties make this more than a to-do widget:

- **It survives compaction.** T3 states tasks persist across context compactions. A backlog held
  in the orchestrator's prose does not.
- **It survives the session.** T1 is explicit that the *team config* directory is removed when
  the session ends but the *task list* directory "persists locally and is never uploaded, so
  resumed sessions keep their tasks", governed by `cleanupPeriodDays`. Combined with T3's
  `CLAUDE_CODE_TASK_LIST_ID`, a named task list can be shared deliberately across sessions.

**What it is for:** giving a multi-session backlog a durable home outside both the model's context
and the project substrate. This is the mechanism that matters most for this repo, and it is
available *without* spawning a single teammate.

### 2.2 Parallel independent context windows

Each teammate is a separate Claude Code instance with its own window, loading CLAUDE.md, MCP
servers, and skills like a normal session, plus the spawn prompt — but **not** the lead's
conversation history (T1).

**What it is for:** context isolation as much as throughput. C2 frames the win as each specialist
getting a small focused context instead of one agent accumulating a large mixed one. The cost is
literal and measured: T2's ~7x in plan mode, C3's 3-4x for typical use.

**What it is not for:** speed on work that is actually sequential. T1 is unambiguous — "For
sequential tasks, same-file edits, or work with many dependencies, a single session or subagents
are more effective."

### 2.3 Direct inter-agent messaging

Teammates message each other by name through mailbox files; delivery is automatic and the lead
does not poll (T1). This is the one capability with no subagent equivalent: T1's comparison table
says subagents "report results back to the main agent only" and "never talk to each other".

**What it is for:** exactly two things. **Cross-challenge** — the documented competing-hypotheses
example works because teammates try to disprove each other, and T1 explains why that beats
sequential investigation: "Sequential investigation suffers from anchoring: once one theory is
explored, subsequent investigation is biased toward it." And **contract negotiation** — two agents
owning opposite sides of an interface agreeing on its shape without round-tripping through the
lead.

If neither of those is in play, messaging is pure overhead and the work belongs to subagents.

### 2.4 Addressable, steerable, long-lived agents

A teammate is a full session the user can open, read, and message directly; a subagent is
fire-and-forget until it returns. Plus the mechanized approval loop: **plan approval** puts a
teammate in read-only plan mode, sends its plan to the lead, and on rejection the teammate stays
in plan mode, revises against the feedback, and resubmits (T1).

**What it is for:** long-running work where mid-flight correction is expected. Note the sharp
edge — "The lead makes approval decisions autonomously"; the user is not prompted. T1's remedy is
to plant the approval criteria in the spawn prompt ("only approve plans that include test
coverage").

### 2.5 What teams do not add

They add no enforcement (that is entirely HR's layer), no correctness, and no judgment. They add
coordination surface, and coordination surface is where C2's migration-file collision came from.
Structural ceilings from T1: no nested teams, one team per session, the lead cannot be changed,
in-process teammates cannot launch background subagents, and permission mode is fixed at spawn.

### 2.6 The middle tier that is easy to miss

HR §4.5 notes `SendMessage` does not require teams to be enabled — only the structured
team-protocol messages do. So **named, addressable, resumable dispatch agents are available on
the plain subagent path**: spawn with `name`, continue later via `SendMessage` with its context
intact, at subagent cost. For a great deal of this project's work that is the right tier, and it
is the one this report recommends most often in §4.

---

## 3. Orchestration patterns from practice

Named shapes, each with when-to-use and when-not. The first is the one Anthropic actually ships.

### 3.1 Parallel lens fan-out with a verification integrator

**Shape:** N agents examine the *same* artifact, each through a different fixed lens; a separate
**verification stage** then checks each candidate finding against actual behavior before anything
surfaces; results are deduplicated and ranked.

**Grounding:** T4 describes Claude Code Review as exactly this, and the verification stage is not
optional decoration — it is the step that "filter[s] out false positives". The 20-minute average
runtime is the cost of doing it.

**When to use:** review, audit, and validation of one artifact along genuinely independent axes.
**When not:** when the axes interact, or when there is no independent artifact to verify findings
against — in which case the verification stage degenerates into an LLM agreeing with an LLM, which
HR §4.6 rules out as a gate.

**The transferable detail:** T4's `REVIEW.md` is injected verbatim into *every* agent in the
pipeline as the highest-priority block, with imports deliberately not expanded. That is the same
architecture as HR §4.1's contract injection and as this repo's own rule that filed substrate text
is composed verbatim into subagent contexts. Anthropic shipped it because per-agent instruction
drift is the failure it prevents.

### 3.2 Adversarial debate over competing hypotheses

**Shape:** N investigators each own a theory and are instructed to disprove the others'; the
surviving theory is the answer.

**Grounding:** T1's own worked example, with the anti-anchoring rationale quoted in §2.3. C3
lists it as one of only three green cases.

**When to use:** root cause genuinely unclear. **When not:** cause known, or the question has one
obvious investigative path — then it is N times the cost for one answer.

### 3.3 Specialist squad with hook-enforced file ownership

**Shape:** teammates split by layer or module, each owning a disjoint file set.

**Grounding:** C2's incident is the canonical failure of the version *without* enforcement, and
their conclusion is the pattern's precondition: ownership is a `PreToolUse` hard constraint, not a
CLAUDE.md guideline. HR §3 Class 6 already specifies the mechanism — a per-`agent_id` path
allowlist plus a `git diff --name-only` backstop at return, because the `PreToolUse` `if` filter
fails open on unparseable Bash.

**When to use:** genuinely disjoint file sets. **When not:** any shared hotspot file. Which, in
this repo, is most of the interesting work (§4.3).

### 3.4 Pipeline relay

**Shape:** stages chained by task dependencies — analysis → implementation → verification.

**Grounding:** C2 names it; C4 ran a three-phase version for real.

**When to use:** honestly, rarely as a *team*. The stages are sequential by construction, so
parallel context windows buy nothing; what the team layer contributes is the durable task list and
the stage-boundary gates, both of which are available without teammates. This is the shape that
most tempts people into teams and least rewards them.

### 3.5 Partitioned parallel processing

**Shape:** workers own disjoint ranges of a uniform work set (records 1-30, 31-60, …), no
inter-worker communication.

**Grounding:** C2 lists it as "Parallel Processor". C2 also relays the C-compiler run as its
scaled extreme, with lock-based dynamic subsystem claiming (second-hand; numbers unverified).

**When to use:** many independent units of the same kind of work. **When not, and this is the
trap:** if no communication is needed, §2.3 does not apply, so the *only* thing teams add over N
parallel subagents is the shared task list. Use the pattern; choose the cheaper substrate unless
the task list is the point.

### 3.6 Plan-reviewer as a distinct role

**Shape:** a reviewer whose sole job is checking implementation against the *approved plan*,
separate from any reviewer checking code quality.

**Grounding:** C4's first-hand finding — their quality reviewer passed a feature that was built,
tested, and never integrated, because plan-alignment was nobody's job.

This maps directly onto this project's own gap surface. The canonical pipeline's step 3 says every
finding maps to a filed `acceptance_criteria` id, and step 5 says the brief must name the
docs-surface audit as a deliverable. C4's failure is what happens when the auditor grades quality
instead of grading the contract. The project's stated audit posture — carry criteria verbatim,
report each by id as CONFIRMED or a finding, never grade severity, never recommend — is already
the correct answer; C4 is independent evidence of what it costs to omit.

### 3.7 Delegate mode for the lead — community claim, one keystroke to verify

C6 and C3 both describe Shift+Tab toggling the lead into coordination-only mode (spawn, message,
shut down, manage tasks; no code editing), and both name "lead writes code instead of
coordinating" as the most common operator error. T1 independently confirms the *symptom* under
"Wait for teammates to finish": "Sometimes the lead starts implementing tasks itself instead of
waiting for teammates."

But **T5's permission-mode table does not list a delegate mode**, and T1 does not mention one.
So the capability is community-attested and officially undocumented on the pages fetched. Two
things follow. First, verify it directly — press Shift+Tab in a team session and read the status
line; that is cheaper than any further research. Second, do not depend on it: the same restriction
is expressible in HR's terms as a `PreToolUse` deny on `Edit|Write` while a team is active, which
is enforcement rather than a mode the lead might cycle out of.

### 3.8 The counter-pattern: single-threaded writes

C1 argues the default should be one linear agent with continuous context, because parallel agents
each act on a partial view and their implicit decisions conflict. Their Flappy Bird example is the
toy version of C2's migration-file collision.

The reconciliation both sources converge on, and the single most useful principle in this report:
**extra agents contribute intelligence; writes stay single-threaded.** Read-only investigators,
reviewers, and auditors parallelize safely because they produce findings, not state. Writers do
not.

This project's canonical pipeline is *already* that shape: read-only Explore agents for all
investigation, exactly one foreground coding subagent that implements, a read-only adversarial
auditor. Teams therefore cannot improve the shape — they can only change the substrate the shape
runs on. That framing decides most of §4.

---

## 4. The project playbook

### 4.0 The decisive local constraint: substrate writes are single-writer by construction

Before any per-stage recommendation, one fact about this repo that overrides generic guidance. It
was verified by tracing the actual write path, not assumed.

The pi-context write primitives do hold a real cross-process lock —
`withBlockLock` at `packages/pi-context/src/block-api.ts:54-64` wraps `append-block-item`,
`update-block-item`, and `append-relation` around a `proper-lockfile` acquisition, and the
underlying write is atomic tmp-plus-rename at `block-api.ts:1113-1116`. But that lock does not
make concurrent filing safe, for four reasons visible in the code:

1. **It fails fast rather than serializing.** `lockfile.lockSync` is called with no `retries`, so
   the loser of a race gets an immediate `ELOCKED` throw, and no handler catches it. Two teammates
   filing at once produce an erroring op, not a queued one.
2. **First write is unlocked.** `block-api.ts:55-57` skips locking entirely when the target file
   does not yet exist — so two processes both creating `relations.json` both proceed unlocked and
   the second rename clobbers the first.
3. **`write-block` takes no lock at all** (`block-api.ts:1936`), and performs an unlocked
   read-modify-write.
4. **The op pipeline's snapshot/restore is a whole-substrate clobber vector.** For substrates whose
   `config.json` declares invariants, every mutating op snapshots *every* top-level substrate
   `*.json` before running (`ops-registry.ts:3039`, `:2960-2973`) and, on an invariant refusal or
   any inner throw, restores all of them and unlinks any `.json` that did not exist at snapshot
   time (`:2975-2983`, called at `:3050` and `:3068`) — unlocked, and outside every per-file lock.
   Concretely: teammate A's failed filing can silently erase teammate B's *successful* one.

There is no compare-and-swap, version, or content-hash precondition anywhere on the write path.

**Consequence for every recommendation below: exactly one agent holds the substrate-writer role at
any moment.** Investigation, classification, and audit parallelize freely; filing does not. This
is C1's single-writer principle arriving as a hard local fact rather than a design preference.

*(This is also a candidate experience gap in its own right — items 2, 3 and 4 above are defects
independent of teams. This report is read-only and files nothing; flagging it for the
Experience-Gap Handling path.)*

### 4.1 Pipeline stage by stage

| Stage | Shape | Verdict |
|---|---|---|
| 0. Milestone validity gate | Lens fan-out (§3.1): N validators over disjoint member subsets + integrator | **Team, conditionally** — see below |
| 1a. Explore | Parallel read-only fan-out over disjoint questions | **Subagents.** Foreground-only per standing rule and HR §3 Class 5 |
| 1b. Plan | Single | **Neither** |
| 1c. Implement | Single writer | **Single foreground subagent, always** |
| 2. Runtime demo | Executing agent or orchestrator | **Not Explore** (repo rule); single |
| 2. Adversarial probe | Two independent probes that must mutually re-derive | **Subagents by default; adversarial pair (§3.2) when the probes should challenge each other** |
| 3-4. Iterate to zero | Alternating fix → fresh re-audit, terminating on the deterministic gate | **Task list yes; teammates optional** — see 4.2 |
| 5. Docs-surface sync | Partitioned parallel (§3.5) over disjoint surfaces | **Subagents; team only if ≥4 surfaces** |
| 6. Merge | Single | **Neither** |
| 7. Substrate closure | Single writer (§4.0) | **Never parallel** |

**Stage 0 in detail.** The milestone gate validates anchors, mechanisms, **cross-member
coherence**, testability, and provenance across all members of a milestone. Anchors, mechanisms,
testability and provenance are per-member and embarrassingly parallel — subagent work. Cross-member
coherence is not: it is precisely a question about the relationships *between* members, which is
§2.3's contract-negotiation case. So the shape is three validator teammates over disjoint member
subsets, each additionally charged with messaging peers about any member that appears to conflict
with one of theirs, and the lead integrating. If a milestone has fewer than ~6 members, this is
one agent's work and the team is overhead.

**Stage 1c is non-negotiable.** One implementer, always, on both this project's rule and C1's
principle. No amount of parallelism opportunity changes it.

### 4.2 The iterate-to-zero loop, mapped onto the task list

This is where the team layer's mechanisms line up best with existing policy — and where a
documented limitation turns out to be pre-solved.

Structure: **one task per filed acceptance criterion.** The fix task for a falsified criterion and
its fresh re-audit task are two tasks with a dependency edge, so the re-audit cannot be claimed
until the fix completes. The dependency graph stays two levels deep, never a long chain (see §5.2
for why depth is the thing to avoid).

The lever that matters: **`TaskCompleted` exit 2 prevents a task being marked complete and sends
feedback** (T1, HR §2.1). Wire the deterministic gate — `npm run build && npm run check && npm
test` — into that hook. Then `done ≡ (deterministic gate exit 0) AND (every criterion CONFIRMED)`
stops being orchestrator prose the model may drift from and becomes a condition enforced outside
the model. Two consequences:

- T1's documented "Lead shuts down before work is done" limitation cannot silently occur on
  criteria-bearing tasks, because completion is gated on an exit code rather than the lead's
  judgment.
- It satisfies the standing "subagents never run npm; the orchestrator runs all npm gates" rule
  rather than violating it, for the reason HR §3 Class 4 gives: the hook is harness scaffolding,
  not the agent. Bounded retry per HR §4.2 remains mandatory.

Whether the fix and audit roles are *teammates* or sequential subagents is a genuinely open
choice, and the honest answer is that teammates buy little here: the fix agent and the audit agent
must not collaborate — the whole point of the fresh adversarial re-audit is that it is
non-inheriting. **Use the task list; keep the agents as fresh subagents.** That is the cheapest
configuration that satisfies the policy.

### 4.3 Open work item by item

#### (a) Reconciling a 105-record audit corpus into the substrate — **team, for half of it**

This is the strongest team case in the inventory, and it splits cleanly at the write boundary.

The expensive part is not writing; it is the **explore-before-file** precondition applied 105
times — for each record, search the substrate for an existing item already covering it and report
coverage (id, status, any planned task), so that a tracked item is related-to rather than refiled.
That is 105 independent read-only investigations with no shared state.

- **Roles:** 3 classifier teammates (`corpus-classifier-a/b/c`) over disjoint record ranges,
  plus the lead as integrator and sole writer.
- **Task decomposition:** batches of 5-7 records per task, ~5-6 tasks per teammate. That lands on
  T1's stated sweet spot from both directions — the per-teammate task count *and* C4's "clear,
  self-contained result" criterion, since a batch produces one classification file.
- **Dependency edges:** none among classification tasks (they are independent); every filing task
  is `blockedBy` its classification task.
- **Deliverable per task, on disk:** the de-ephemeralize-at-source rule already requires the agent
  that produces intel to write it. Each classifier writes `analysis/<date>-corpus-batch-NN.md`
  with, per record, the prior-art verdict (existing id + status, or none), the proposed disposition
  (refile / relate / refine), and the citation. Their return is a pointer, not content.
- **Then the lead files, serially**, from those files — per §4.0, without exception.
- **Gate placement:** `PreToolUse` on `Agent` denies any classifier brief lacking the
  explore-before-file instruction (HR §3 Class 5's criteria gate, same shape). The existing
  `block-substrate-write.sh` guard already stops a classifier from writing the substrate directly;
  extend the path allowlist so classifiers can write only their own `analysis/` file.
- **User touchpoints:** approve the batch partition once; see the assembled disposition table
  before filing begins. Filing decisions that change what the substrate asserts are the user's.

#### (b) Priority over 47 partial-or-unmet product intents — **team for evidence; never for the ranking**

Priority is the user's call — a standing project boundary. So the team's deliverable is strictly
evidence, and the ranking is not produced by any agent.

- **Roles:** 3 intent-assessor teammates over disjoint intent subsets (~16 each), read-only
  throughout. No writes, so §4.0 does not bind and the parallelism is free of collision risk.
- **Per intent, one evidence record:** what the intent states verbatim; what the code does today
  with `file:line` citations; the delta; what the substrate already tracks about it; what it
  depends on. T4's "verification bar" phrasing is worth copying into the brief verbatim —
  "behavior claims need a `file:line` citation in the source, not an inference from naming."
- **Task decomposition:** 3-4 intents per task, ~5 tasks per teammate.
- **Output:** the lead assembles one decision table. It contains no recommended ordering.
- **Gate:** HR §3 Class 4's citation requirement matters more here than anywhere else in the
  inventory — 47 assessments is exactly the volume at which an unverified "I checked it" slips
  through. The `SubagentStop` transcript-citation check is the mechanism.
- **User touchpoint:** the decision table is the deliverable. The user ranks.

#### (c) Closing documented-but-absent CLI surface — **no team; a team makes this worse**

Each missing op looks independently implementable, which is the trap. Every one of them touches
the same small set of hotspot files: `ops-registry.ts` for the registration and its surfaced
`description`/`promptSnippet` strings, the op↔CLI parity gate, the single `CHANGELOG.md`
`[Unreleased]` section that `check-changelog` enforces, and lockstep `package.json` versions.
That is C2's migration-file collision waiting to happen, in this repo's own terms, and it is
precisely T1's "same-file edits" red flag.

**Right shape:** ops sequentially, each a full canonical pipeline pass, single implementer. If you
want parallelism, parallelize only the *explore* half — one Explore agent per candidate op
establishing what the doc promises versus what exists — then serialize planning and
implementation. That is a subagent fan-out, not a team.

#### (d) The workflow artifact path bug — **no team**

One defect, one root cause, one fix. The canonical pipeline handles it: Explore to establish the
class (per the standing rule that a fix targets the finding's whole class, not the one symptom),
plan, one foreground coding subagent, runtime demo, fresh adversarial probe, docs check, merge,
closure. A team adds coordination cost and nothing else. Worth saying plainly because "we have
teams now" is exactly the pressure that puts a team on a single-writer task.

#### (e) Regenerating corrupted generated SKILL.md surfaces — **no team, and investigate first**

`npm run skills` is one deterministic orchestrator command. But corrupted *generated* output is an
experience gap: the mandatory handling is an agent investigation establishing root cause, shape,
reproducible conditions, prior art in the substrate, and whether the specific corruption is an
instance of a more general class — before any filing or fix. Regenerating without that finding
destroys the evidence. One investigating agent, then one regen. A team has nothing to parallelize
against.

### 4.4 What the user sees and approves

- **Team formation:** T1 says Claude will not spawn teammates without approval, either way it is
  proposed. That is the first touchpoint.
- **Permission prompts:** teammate prompts surface in the lead session (T1), so pre-approving
  common operations in `permissions.allow` before spawning is what keeps the session usable.
  Note the repo's live PreToolUse guards fire repo-wide and are not substrate-scoped (FGAP-089) —
  here that works in your favor, since teammates inherit them.
- **Plan approval:** the lead approves autonomously with no user prompt (T1). Any criterion the
  user cares about must be in the spawn prompt as an approval criterion, or it will not be applied.
- **The two legitimate stops** are unchanged and are the only places the loop surfaces: a genuine
  scope/value/authority judgment, and a HELD action. Everything the deterministic gate can decide,
  the gate decides.

---

## 5. Working within the experimental limits

Each documented limitation from T1, with a pattern-level mitigation rather than a deferral.

### 5.1 No session resumption with in-process teammates

The strongest mitigation is already project policy. **De-ephemeralize-at-source** means every
agent writes its own durable artifact as part of its task, so a lost teammate loses only its
current turn, never its findings. Additionally, T1 states the *task list* directory persists while
only the team config is deleted — so a team that dies can be reconstituted by spawning fresh
teammates against the surviving task list. T3's `CLAUDE_CODE_TASK_LIST_ID` makes that deliberate
rather than incidental by naming the list.

Practical rule: no teammate should ever hold state that exists nowhere but its context.

### 5.2 Task status can lag, blocking dependents

The lag hurts in proportion to dependency *depth*. Mitigations, in order of value:

1. **Keep graphs two levels deep** — fan-out plus integrator, or fix → re-audit. Never a five-stage
   chain where one unmarked task stalls everything downstream.
2. **Let the hook flip the status, not the teammate.** With the deterministic gate wired to
   `TaskCompleted` (§4.2), completion becomes a function of an exit code.
3. **Size tasks to tolerate lag** — a batch of 5-7 corpus records completes in minutes, so a
   stalled status is noticed quickly. A four-hour task hides the same stall for four hours.

### 5.3 The lead declaring the team finished prematurely

Pre-solved by this project's own termination rule, *if* it is encoded rather than narrated:
completion is `(deterministic gate exit 0) AND (every criterion CONFIRMED)`, with per-criterion
verdicts from a fresh adversarial audit. `TaskCompleted` and `TeammateIdle` exit 2 are the
encodings (HR §2.1). C4's independent finding is the reason not to leave this as prose: "If a
process step looks optional, an agent will skip it — even when it shouldn't."

### 5.4 No nested teams; no background subagents from in-process teammates

Keep the hierarchy flat: lead plus teammates, and any teammate's own helpers run in the
foreground. This costs nothing here — the project already forbids background Explore and requires
background agents to write reports to disk.

### 5.5 Permissions fixed at spawn; prompts bubble to the lead

Pre-approve before spawning. Since per-teammate modes cannot be set at spawn time, a role needing
a *narrower* surface than the lead gets it through its subagent definition's `tools`/
`disallowedTools` (which teammates do honor, per T1) rather than through permission mode.

### 5.6 `skills` and `mcpServers` silently not applied to teammate roles

HR §4.3 already flags this. The rule: put load-bearing instruction in the definition **body**,
which is appended on both paths, never in `skills`, which is applied on only one. A role that
quietly degrades depending on how it was launched is worse than one that never had the skill.

### 5.7 Same-file conflict

The one limitation with no pattern-level workaround, only enforcement: hook-enforced path
allowlists per HR §3 Class 6, plus the `git diff --name-only` backstop, because C2's incident
shows advisory ownership failing inside 20 minutes. In this repo the substrate is the hotspot, and
§4.0 is the reason it is single-writer regardless of what any hook allows.

### 5.8 Cost

T2's ~7x (plan mode) and C3's 3-4x (typical) bound the range. The levers are T2's: Sonnet for
teammates where the role permits — noting this repo's standing default-opus ruling, so a Sonnet
teammate is a per-dispatch decision, not a default — small teams, tight spawn prompts, and
shutting teammates down when their work is done rather than letting them idle.

---

## 6. Honest assessment

### Where teams genuinely serve this project today

**One work item, unambiguously: the 105-record corpus classification pass (§4.3a).** It has 105
independent read-only units, a natural batch size that hits the documented task-sizing sweet spot,
zero write contention during the parallel phase, and a clean serialization point at the filing
boundary. The pattern is well-attested (§3.5) and the failure mode is contained by §4.0's
single-writer rule.

**One more, with a caveat: the 47-intent evidence pass (§4.3b).** Equally parallel and entirely
read-only. The caveat is that its value depends on citation enforcement — at 47 assessments the
dominant risk is not collision but unverified assertion, and HR §3 Class 4's transcript-citation
gate is the thing that makes the output trustworthy. Without that gate this is 47 opportunities
for confident prose.

**And one mechanism, independent of any teammate: the shared task list.** The strongest
recommendation in this report is also the cheapest — adopt the durable task list with a named
`CLAUDE_CODE_TASK_LIST_ID` and wire the deterministic gate to `TaskCompleted`, and you get the
backlog home and the completion gate without spawning anything.

### Where they do not

**Anything with a single writer, which is most of the pipeline.** Implementation (1c), merge (6),
and substrate closure (7) are single-writer by policy and, for closure, by the code facts in
§4.0. **CLI surface work (§4.3c)** is same-file-hotspot work and gets worse under parallelism.
**The path bug (§4.3d)** and **the SKILL regen (§4.3e)** are single-unit tasks where a team is
pure overhead.

The general form: this project's canonical pipeline already *is* the multi-agent architecture both
C1 and T4 converge on — read-only intelligence in parallel, writes single-threaded, an independent
verification stage before anything is believed. Teams cannot improve that shape. They can only
supply a different substrate for the read-only half, and a durable task list for the whole.

### The single fact that would change each verdict

- **Corpus classification (team) → subagents.** If the classifiers turn out never to need to
  message each other — that no record's prior-art verdict depends on another's — then §2.3 does not
  apply and N parallel subagents do the same work for less. **This is the likely outcome**; the
  team justification rests on the shared task list (§2.1), not on messaging. One batch run answers
  it empirically.
- **Intent evidence (team) → subagents.** Same test, same likely answer.
- **CLI surface work (no team) → team.** If `ops-registry.ts` registration were decomposed so each
  op registered from its own module, and the CHANGELOG gate accepted per-op fragments, the hotspot
  would disappear and the ops would become genuinely disjoint. That is a real refactor with
  independent merit, not a workaround.
- **Milestone validity gate (conditional) → definite.** A milestone with enough members that
  cross-member coherence is a substantive question rather than a glance settles it.
- **Iterate-to-zero (task list, fresh subagents) → teammates.** Only if the fix and audit roles
  should collaborate — and the project's non-inheriting fresh-audit rule says they should not. This
  verdict changes only if that rule changes.
- **Delegate mode (§3.7).** One keystroke: Shift+Tab in an active team session, read the status
  line. Verified capability or community folklore, settled in seconds.
- **§4.0's single-writer constraint.** Would change only if the write path gained serializing
  retry on `ELOCKED`, locking on first write and on `write-block`, and a snapshot/restore that
  cannot clobber another process's committed writes. Those are three defects worth fixing on their
  own merits; fixing them would incidentally make parallel filing safe.

---

## 7. Not fetched, or unresolved

1. **The primary Anthropic source for the 16%→54% Code Review coverage figure.** Consistently
   reported across secondary write-ups in search results; the primary was not located. Recorded as
   unverified secondary reporting; nothing depends on it. T4's architectural description *was*
   fetched and is what §3.1 rests on.
2. **Delegate mode has no official documentation on the pages fetched.** T5's permission-mode table
   omits it; T1 does not mention it. Community-attested by C6 and C3. §3.7 gives the one-keystroke
   verification.
3. **Not fetched:** `code.claude.com/docs/en/sub-agents` (HR §S1 covers it), `/hooks` (HR §S2),
   `/settings` (HR §S4), `/worktrees`, `/features-overview#compare-similar-features`,
   `/scheduled-tasks`. The worktrees page in particular might bear on §4.3c — whether per-op
   worktrees could make the `ops-registry.ts` hotspot tractable is unexamined here, and the
   standing project rule against worktrees for shared files suggests it would not.
4. **No source found reporting a controlled comparison** of teams versus sequential subagents on
   the same task with measured outcomes. Every experience report in §1 is anecdotal or
   guidance-shaped. The cost multipliers (T2's 7x, C3's 3-4x) are the only quantities in this
   report with any numeric grounding, and they measure different things.
5. **`convergeDerivedStatusAfterWrite`'s write path** (`ops-registry.ts:3042` →
   `index.ts:3320-3335`) was not traced to determine whether its delta writes route through the
   locked primitives. Its *read* is unambiguously outside any lock. This does not change §4.0's
   conclusion — it can only make it stronger.
