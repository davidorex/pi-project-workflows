# Agent-dispatch hardening in Claude Code — what can be structurally encoded

Research date: 2026-07-25/26. Target: the Claude Code orchestration layer over the
`pi-project-workflows` monorepo. Question: which of seven documented repeated LLM failure
classes can be closed by *durable, encoded, DRY* mechanisms (files, schemas, hooks, settings)
rather than by prose the model may ignore.

Local harness version at time of writing: `claude --version` → **2.1.220**. This matters
because much of the relevant surface is version-gated; every capability cited below carries a
documented minimum at or under 2.1.220, so all of it is live on this machine today.

---

## 1. Sources consulted

Every capability claim below is grounded in a page actually fetched and read. Pages that could
not be reached are named in §6 rather than paraphrased from memory.

Note on URLs: `docs.claude.com/en/docs/claude-code/*` now 301-redirects to
`code.claude.com/docs/en/*`. The `code.claude.com` URLs are the live ones.

| # | URL | What it established |
|---|-----|---------------------|
| S1 | https://code.claude.com/docs/en/sub-agents | Full subagent spec: `.claude/agents/*.md` scopes and precedence; the complete frontmatter field table (`name`, `description`, `tools`, `disallowedTools`, `model`, `permissionMode`, `maxTurns`, `skills`, `mcpServers`, `hooks`, `memory`, `background`, `effort`, `isolation`, `color`, `initialPrompt`); harness-enforced tool filtering (including the background-subagent tool filter); `Agent(agent_type)` spawn allowlists; per-subagent frontmatter hooks; subagent output scanning; exactly what loads into a subagent at startup; resume via `SendMessage`; spawn/concurrency/depth limits; subagent transcript paths. |
| S2 | https://code.claude.com/docs/en/hooks | Complete hook reference: 29 event names including `PreToolUse`, `PostToolUse`, `SubagentStart`, `SubagentStop`, `TeammateIdle`, `TaskCreated`, `TaskCompleted`, `Stop`, `SessionStart`, `InstructionsLoaded`; matcher syntax and explicit confirmation that `Task` and `Agent` are matchable tool names; per-event input payloads; output semantics (`permissionDecision`, `updatedInput`, `decision: block`, `reason`, `additionalContext`, `continue`/`stopReason`); the exit-code-2 blocking table per event; the four hook types (`command`, `http`, `prompt`, `agent`); hook definition locations, merge behavior, and security notes. |
| S3 | https://code.claude.com/docs/en/agent-teams | Agent teams spec: gated behind `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`; lead/teammate/task-list/mailbox architecture; mailbox files at `~/.claude/teams/{team}/inboxes/{agent}.json`; task list at `~/.claude/tasks/{team}/`; subagent definitions reusable as teammate roles (honors `tools` + `model`, body *appended* to the system prompt; `skills` and `mcpServers` NOT applied on that path); `TeammateIdle`/`TaskCreated`/`TaskCompleted` as the quality-gate hooks; teammates cannot grant permission on the user's behalf; documented experimental limitations. |
| S4 | https://code.claude.com/docs/en/settings | Settings hierarchy and precedence (managed > CLI > local > project > user), permission rule syntax (`ToolName(pattern)`, deny beats allow, rules *merge* across scopes rather than override), and the enforcement-relevant settings: `permissions`, `hooks`, `agent`, `availableModels`/`enforceAvailableModels`, `allowManagedHooksOnly`, `allowManagedPermissionRulesOnly`, `disableAllHooks`, `allowedHttpHookUrls`, `autoMemoryEnabled`, `claudeMd`, `cleanupPeriodDays`. Also: `permissions` and `hooks` hot-reload mid-session; `ConfigChange` fires on edit. |
| S5 | https://code.claude.com/docs/en/skills | Skills spec and the full `SKILL.md` frontmatter table: `disable-model-invocation`, `user-invocable`, `allowed-tools`, `disallowed-tools`, `model`, `effort`, `context: fork`, `agent`, `background`, `hooks`, `paths`, `arguments`. Also the skill content lifecycle (rendered once into the conversation, never re-read) and `${CLAUDE_PROJECT_DIR}` / `${CLAUDE_SKILL_DIR}` substitution. |
| S6 | https://www.anthropic.com/engineering/multi-agent-research-system | Anthropic's own multi-agent failure taxonomy and remedies: vague delegation causes duplicated work; subagents need explicit objectives, output formats, tool guidance, and task boundaries; observed unbounded effort, search drift, tool mismatch, source bias, hallucinated answers; LLM-as-judge with rubrics plus human eval; **subagents writing directly to the filesystem rather than routing output through the coordinator** to prevent information loss; checkpointing to external memory; durable state and resume rather than restart; observability over decision patterns. |
| S7 | https://www.anthropic.com/engineering/writing-tools-for-agents | Constraining agent behavior through the *tool surface* rather than instructions: encode semantics into tool definitions, unambiguous parameter naming, structured/`ResponseFormat`-controlled output, error messages that state actionable corrections, response truncation and pagination, and evaluation-driven iteration on tool descriptions ("bad tool descriptions can send agents down completely wrong paths"). |
| S8 | https://www.praetorian.com/blog/deterministic-ai-orchestration-a-platform-architecture-for-autonomous-development/ | A production multi-layer hardening architecture built on exactly these Claude Code primitives: "determinism lives outside the LLM"; LLM treated as a nondeterministic kernel inside a deterministic runtime; **mutual-exclusion dispatch contracts** (coordinators get `Task`/`Agent` and are stripped of `Edit`/`Write`; executors get `Edit`/`Write` and are stripped of `Agent`); PreToolUse/PostToolUse/SubagentStop/Stop as an overlapping enforcement stack; SubagentStop hooks that block premature exit until an independent reviewer and tester pass; explicit machine-matched completion tokens instead of fuzzy prose ("no fuzzy interpretation"); iteration-limit hooks with string-similarity loop detection; scratchpad protocol to prevent repeated failed approaches; Zod schema validation on agent I/O. |
| S9 | https://www.zenml.io/llmops-database/deterministic-verification-layer-for-ai-coding-agents | The verification-layer pattern and its central claim: agents "signal task completion despite subtle implementation gaps," and "providing good instructions to an agent is categorically different from verifying its output." Hook-triggered verification on session completion, config-driven test criteria, automatic feedback-and-retry until criteria pass, and the production lesson that increased model capability does not translate into increased reliability. |
| S10 | https://medium.com/@Micheal-Lanham/stop-blaming-the-llm-json-schema-is-the-cheapest-fix-for-flaky-ai-agents-00ebcecefff8 (via search result summary) | The "schema gate" framing: malformed/missing/wrong-typed tool arguments cause more production failures than reasoning errors; schema validation at the call boundary makes tool calls near-deterministic — either valid arguments or a stop-and-correct. *(Read via search-result summary only; treated as corroborating framing, not as a load-bearing citation.)* |

---

## 2. Mechanism inventory — what the harness actually enforces

The single most important structural fact for this project:

> **Claude Code has no built-in equivalent of pi's `.agent.yaml` contract.** There is no
> declarative pre-spawn `inputSchema` on a dispatch, and no declarative post-completion
> `output.schema` on a subagent's return. Nothing in the harness validates the *content* of a
> brief or a report. (S1 — the frontmatter table has no schema fields of any kind.)

Everything schema-shaped must therefore be *synthesized* out of hooks. The good news is that the
hook surface is rich enough to build it, and the resulting artifacts are files — durable, DRY,
and outside the model's reach.

### 2.1 Harness-enforced (deterministic; the model cannot bypass or talk its way past)

| Mechanism | Where declared | What it enforces | Source |
|---|---|---|---|
| `tools:` allowlist / `disallowedTools:` denylist | `.claude/agents/<name>.md` frontmatter | The subagent physically does not have the tool. Both fields resolve before spawn; `disallowedTools` applies first. A `tools` list resolving to nothing now *refuses to launch* with an error naming the bad entries (v2.1.208+). | S1 |
| `permissions.deny` / `allow` / `ask` | `settings.json` (any scope; rules **merge**, deny beats allow) | Tool-level and pattern-level gating, e.g. `Agent(Explore)` to block a subagent type outright, `Edit(...)`/`Bash(...)` patterns. | S1, S4 |
| `PreToolUse` hook returning `permissionDecision: "deny"` (or exit 2) | `settings.json` `hooks`, or agent/skill frontmatter `hooks` | Blocks the tool call before it executes. **Matches `Agent` and `Task` by name**, so it gates dispatch itself. | S2 |
| `PreToolUse` hook returning `updatedInput` | same | **Rewrites the tool's arguments before execution.** For the `Agent` tool this means mechanically injecting or normalizing the dispatch brief. | S2 |
| `SubagentStop` hook exit 2 | `settings.json` (matcher = agent type name), or `Stop` in agent frontmatter (auto-converted) | **Prevents the subagent from stopping**; stderr is fed back as an error and it keeps working. This is the return-gate lever. | S1, S2 |
| `Stop` hook exit 2 | `settings.json` | Prevents the main turn from ending; payload includes `last_assistant_message`, so the outgoing text is inspectable. | S2 |
| `TaskCreated` / `TaskCompleted` exit 2 | `settings.json` | Rolls back task creation / prevents a task being marked complete. Payload carries `task_id`, `task_title`, `task_description`. | S2, S3 |
| `TeammateIdle` exit 2 | `settings.json` | Prevents a teammate going idle; keeps it working with feedback. | S2, S3 |
| `model:` pin, `availableModels` / `enforceAvailableModels` | agent frontmatter / settings | The subagent runs on the named model. `availableModels` is an allowlist checked against env var, per-invocation param, and frontmatter alike. | S1, S4 |
| `maxTurns` | agent frontmatter | Hard cap on agentic turns — the structural answer to unbounded effort (S6's "50+ subagents for a simple query"). | S1 |
| `isolation: worktree` | agent frontmatter (or the Agent tool's `isolation` param) | The subagent gets its own git worktree; from v2.1.216 even `git -C`/`GIT_DIR`/`cd`-into-main-checkout escapes are detected and fail. Blast-radius containment that is not a promise but a filesystem fact. | S1 |
| `permissionMode` | agent frontmatter | Subagent-level mode, e.g. `plan` for read-only. Parent `bypassPermissions`/`acceptEdits`/`auto` take precedence and cannot be widened by the child. | S1 |
| Background tool filter | automatic | Background subagents (the **default** since v2.1.198) keep only a reduced built-in tool set. The same definition resolves to different tools foreground vs background. | S1 |
| Nested-spawn suppression | automatic; `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` | Subagents cannot spawn subagents unless explicitly enabled. | S1 |
| Spawn/concurrency limits | `CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION` (default 200), `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` (default 20) | Hard failure on the Agent tool when exceeded. | S1 |
| `disable-model-invocation: true` | `SKILL.md` frontmatter | The model cannot invoke the skill at all; only the user can. | S5 |
| Subagent output scanning | automatic (v2.1.210+) | Harness scans every subagent report before the parent reads it, backslash-escaping harness-imitating text and prepending a marker line for instruction-shaped patterns. Does not remove or reword. | S1 |
| Teammate consent boundary | automatic | A message from any agent is never the user's approval; a teammate cannot relay a denied action to another teammate to bypass a check; in auto mode a relayed approval claim is treated as untrusted input. | S1, S3 |

### 2.2 Harness-provided evidence surfaces (what a hook can check claims *against*)

These are what make deterministic verification of agent claims possible at all. A hook is a
plain process with the filesystem and the repo available, plus:

- `tool_input` on `PreToolUse` for `Agent` — the **entire brief** the orchestrator composed,
  including the `prompt` string, `subagent_type`, `model`, `run_in_background`, `isolation`,
  `name`. (S2 for the payload shape; the Agent tool's parameter names are visible in this
  session's own tool schema.)
- `transcript_path` and `session_id` on every event — the main conversation JSONL, which
  contains the user's actual typed messages.
- `agent_id` + `agent_type` on `SubagentStart` / `SubagentStop`, and subagent transcripts
  persisted at `~/.claude/projects/{project}/{sessionId}/subagents/agent-{agentId}.jsonl`
  (S1). **A subagent's every tool call is therefore a durable, greppable artifact.**
- `last_assistant_message` on `SubagentStop` and `Stop` — the exact text about to be relayed.
- The repo itself: a hook can run `git`, `npm`, and this project's own `pi-context` CLI.

### 2.3 Prompt-injected prose (the model *may* ignore; not enforcement)

CLAUDE.md at every level; the subagent markdown body; skill content; `additionalContext` from
any hook; `--append-subagent-system-prompt`; the managed-settings `claudeMd` string; agent
`memory` directories. All of these are context, not constraint. Note two traps:

- **Explore and Plan skip CLAUDE.md and git status entirely**, and there is no setting to
  change that (S1). Any rule that must reach an Explore agent has to be in the dispatch prompt.
- **Skill content is rendered into the conversation once and never re-read** (S5). A skill is
  not a standing enforcement surface; it is a one-time injection.

---

## 3. Per-failure-class mapping

Enforcement levels used below:
**[E] harness-enforced** — deterministic, model cannot bypass.
**[V] hook-verified** — deterministic check *we* write, running outside the model, against an
independent artifact; as reliable as the artifact and the check.
**[P] prompt-injected prose** — advisory only.

---

### Class 1 — Attribution fabrication
*LLM-invented wording attributed to the user; LLM-authored text counted as user statements.*

**Mechanism: verbatim-quotation gate on the dispatch brief.** A `PreToolUse` hook on `Agent`
receives the full brief and the `transcript_path` of the main conversation. Two checks compose:

1. **Marking is mandatory [V].** Regex the brief for attribution phrasing outside a delimited
   block — `the user (said|asked|wants|directed|specified|ruled)`, `per the user`, `as
   directed` — and deny unless the claim sits inside a `<user-verbatim>…</user-verbatim>`
   block. Purely lexical, fully deterministic.
2. **Marked text must be real [V].** For every `<user-verbatim>` block, normalize whitespace
   and assert the text is a substring of an actual user-typed message extracted from the
   session transcript JSONL. Not a substring → `permissionDecision: "deny"` with the offending
   span in `permissionDecisionReason`.

**Enforcement level:** [V], and unusually strong — this is one of the rare classes where the
harness hands you the ground truth (the user's own messages) in a machine-readable file.

**Residual exposure:** paraphrase that never *claims* attribution. If the orchestrator silently
composes a requirement and files it as though derived, no lexical check fires. This is exactly
the `filing-provenance` convention's augmentation problem, and the harness cannot close it —
the gate raises the cost of fabricated attribution and eliminates the *quoted* form, but a
confident unmarked paraphrase remains a prose-only rule. Also note the transcript "may lag the
current turn" (S2), so the check should read the whole file, not just the tail.

---

### Class 2 — Adjacent delivery
*Producing something near, but not, what was asked; wrong lens despite explicit direction.*

**Mechanisms:**
- **Contract injection via `updatedInput` [E, in the sense that injection is mechanical].** The
  PreToolUse Agent hook prepends a canonical dispatch contract — read from one file on disk —
  to every brief. The orchestrator cannot forget it, cannot paraphrase it, cannot compress it.
  This is the DRY primitive the project currently lacks entirely. (S2 `updatedInput`.)
- **Required-section validation [V].** Deny a brief that lacks the sections the contract
  demands: acceptance criteria carried verbatim, named deliverable path, explicit
  "if blocked, STOP and report — never infer" clause, the `docs-surface-sync` audit
  enumeration for surface changes. Lexical presence check, deterministic.
- **Structured return [V].** Require the report to contain a machine-parseable verdict block
  (one entry per criterion id, `CONFIRMED` or a finding). `SubagentStop` parses it and exits 2
  if it is absent, malformed, or does not cover every criterion id that appeared in the brief.
  This is S8's "explicit completion tokens, no fuzzy interpretation" and S10's schema gate.
- **Role separation [E].** S8's mutual-exclusion pattern, expressible directly in frontmatter:
  investigation agents get `disallowedTools: Write, Edit` except for their own report path;
  implementation agents do not get `Agent`. The orchestrator's standing rule "the orchestrator
  never greps as investigation, never hand-writes source" becomes a tool-pool fact for the
  agents it dispatches.

**Enforcement level:** [V] for structure, [E] for role separation, **[P] for semantic
fidelity.**

**Residual exposure:** the central one. A hook can prove that a report has a verdict for every
criterion; it cannot prove the verdict is about the right thing. "Wrong lens" is a semantic
property. The structural mechanisms convert a vague miss into a *detectable* miss (missing
criterion id, missing section) but a well-formed answer to the wrong question passes every gate.

---

### Class 3 — Noise
*Coded tokens, hex, walls of text; audience/purpose violations recurring after rulings.*

**This class is closable, and it is the cleanest win available.** It is defined by lexical
properties of the outgoing text, and the harness hands the outgoing text to a hook.

- **`Stop` hook on the main session [V].** Payload carries `last_assistant_message`. Regex for:
  bare tracker ids not accompanied by a title on the same line
  (`\b(FGAP|TASK|DEC|VER|GAP)-\d+\b` without an adjacent quoted/parenthetical title); bare
  hex/sha tokens (`\b[0-9a-f]{7,40}\b` outside a code fence); arrow chains (`→` between
  identifiers). Exit 2 blocks the turn from ending and feeds the violation back, so the model
  rewrites before the user ever sees it.
- **`SubagentStop` hook [V].** Same scan on the subagent's `last_assistant_message`, so noise is
  caught at the boundary rather than after the orchestrator relays it.
- **`PreToolUse` on `Agent` [V].** Same scan on the brief, since briefs are composed verbatim
  into downstream contexts and a bare id in a brief propagates.

**Enforcement level:** [V], deterministic and near-complete for the enumerated token classes.

**Residual exposure:** "wall of text" and "audience violation" are not lexical. A length
threshold is available and crude; it will produce false positives on legitimately long
deliverables. Recommend gating only the token classes deterministically and leaving verbosity
to prose, rather than a length rule that trains evasion. Note also that the ruling in memory
requires ids to carry their filed title *fetched, not recalled* — the hook can enforce that a
title is present, but not that the title is the correct one, unless it shells out to
`pi-context read-block-item` to compare. That upgrade is available and would close the gap.

---

### Class 4 — Unexecuted work presented as executed
*Agents pasting results their commands could not have produced.*

**This is the class the harness is best equipped to attack, and the mechanism is specific.**

Every tool call a subagent makes is written to
`~/.claude/projects/{project}/{sessionId}/subagents/agent-{agentId}.jsonl` (S1). `SubagentStop`
delivers `agent_id`, `session_id`, and `last_assistant_message` (S2). Therefore:

- **Citation-anchored empirical claims [V].** Make the dispatch contract require that every
  empirical claim in a report carry the `tool_use_id` of the call that produced it. A
  `SubagentStop` hook parses the subagent transcript, collects the set of real `tool_use_id`s
  and their commands, and asserts every cited id exists and its command matches the claim's
  described command. A fabricated result has no id to cite; an id that does not exist in the
  transcript is a hard fail. Exit 2 → the subagent must go and actually run it.
- **Existence checks on named artifacts [V].** The contract requires the report path up front;
  the hook asserts the file exists, is non-empty, and was modified after `SubagentStart`.
  Directly mechanizes the de-ephemeralization and background-report rules.
- **Gate re-execution by the harness, not the agent [V].** A `SubagentStop` hook runs
  `npm run build && npm run check && npm test` itself and exits 2 on non-zero. This is worth
  emphasizing: it *satisfies* the standing "subagents never run npm; the orchestrator runs all
  npm gates" rule rather than violating it, because the hook is harness scaffolding, not the
  agent. It also removes the orchestrator's own opportunity to relay an unverified green.
- **Cross-checking a claimed command against the transcript [V].** Weaker but useful: extract
  quoted shell commands from the report and confirm a matching `Bash` tool_use exists.

**Enforcement level:** [V], and genuinely strong — the artifact (the transcript) is written by
the harness, not by the agent, so the agent cannot forge it from inside its own context.

**Residual exposure:** honestly stated — **a hook cannot make a model tell the truth; it can
only check claims against artifacts that exist independently of the model.** A claim with no
external artifact is unfalsifiable by the harness. Reasoning, interpretation, "I checked and it
looks right", and negative claims ("no other instances exist") have no transcript signature that
distinguishes a real check from an asserted one. The citation requirement narrows the space to
claims the agent is *willing to mark* as empirical; an agent that presents an inference as prose
rather than as a cited finding escapes the gate. Enumerate-the-class findings are the specific
worry: "I enumerated and found none" is exactly the shape that cannot be verified from a
transcript. For those, S8's answer — an *independent* second agent re-deriving, with the gate
comparing two independently produced artifacts — is the only structural approach, and it is a
detection improvement rather than a proof.

---

### Class 5 — Process abandonment
*Work outside branch/task/criteria discipline; unconstrained auditing without success criteria.*

**Substantially closable, because every precondition is machine-readable.** A `PreToolUse` hook
on `Agent` can, before any dispatch is allowed:

- **Branch gate [V].** `git rev-parse --abbrev-ref HEAD` — deny dispatch of an implementing
  agent on `main`. `git status --porcelain` — deny when the baseline is dirty, mechanizing the
  clean-baseline precondition.
- **Substrate gate [V].** Shell out to this project's own installed CLI —
  `pi-context context-status --json` — and require that the brief names a task id that is
  actually `in-progress`. This is the DRY jackpot for this repo: the enforcement uses the
  project's own op surface, so it stays correct as the substrate evolves, and it is dogfooding
  rather than a parallel path.
- **Criteria gate [V].** Deny any audit/verification dispatch whose brief carries no
  `acceptance_criteria` block. Directly encodes the iterate-to-zero rule that criteria, not
  findings count, are the terminating condition — an audit dispatched without criteria is
  precisely the "unconstrained open-ended auditing" failure, and it is lexically detectable.
- **Dispatch-fit gate [E/V].** Deny `subagent_type: Explore` when `run_in_background` is not
  `false` (the foreground-only rule, now load-bearing because **background is the default since
  v2.1.198**); deny `model: sonnet` per the standing default-opus ruling; deny a background
  dispatch whose brief contains no absolute report path.
- **Task-lifecycle gates [E].** `TaskCreated`/`TaskCompleted` exit 2 to refuse a task with no
  criteria, or a completion with no verification artifact.

**Enforcement level:** [V], with unusually high coverage because branch, worktree, task status,
and criteria presence are all facts on disk.

**Residual exposure:** the gates fire at dispatch, not continuously. An agent that starts inside
discipline and drifts mid-run is caught only at `SubagentStop`. And "scope creep within an
authorized task" is a judgement the gates do not make.

---

### Class 6 — Fix-introduces-breakage
*Collateral regressions from the fix; unauthorized scope (editing files no directive covered).*

- **File-scope allowlist [V].** The dispatch contract requires the brief to declare the paths
  the agent may write. The hook extracts that list, writes it to a run-scoped file keyed by
  `agent_id` (available on `SubagentStart`), and a `PreToolUse` hook on `Edit|Write` inside the
  subagent denies any path outside it. Fully deterministic — this is the same shape as the
  repo's existing `block-substrate-write.sh` guard.
- **Worktree isolation [E].** `isolation: worktree` puts the agent's edits in a separate
  checkout, with the v2.1.216 escape detection covering `git -C`, `--git-dir`, `GIT_DIR`,
  `GIT_WORK_TREE`, and `cd`-into-main-checkout. Note the standing project rule against
  worktrees for shared files still applies — this is for genuinely isolated work.
- **Regression gate [V].** `SubagentStop` runs the deterministic gate (build/check/test) and
  exits 2 on failure, so the agent fixes its own regression before the orchestrator ever sees a
  "done".
- **Diff-shape gate [V].** `git diff --name-only` against the declared allowlist at
  `SubagentStop`, catching writes that reached the tree by a path the PreToolUse matcher missed
  (e.g. a `Bash` heredoc rather than the `Write` tool).

**Enforcement level:** [E] for isolation, [V] for scope and regression — a strong close on the
*unauthorized scope* half.

**Residual exposure:** the *collateral regression* half is only as good as the test suite. A
green gate on an under-tested surface certifies nothing; the hook proves exit code 0, not
absence of breakage. And the `PreToolUse` `if` filter "is best-effort and fails open" on
unparseable Bash (S2) — so Bash-mediated writes need the diff-shape backstop rather than
reliance on the `if` clause.

---

### Class 7 — Relitigation
*Re-asking decided questions; option proliferation; defending subagent verdicts against standing rulings.*

**This is the class with the least structural purchase, and the report should not pretend
otherwise.**

Available and honest:
- **Ask-shape detection [V].** A `Stop` hook regexes `last_assistant_message` for closing
  interrogatives — `Want me to`, `Shall I`, `Should I`, `Would you like`, `Do you want`, `Let
  me know` — and exits 2. This mechanizes the pre-send ask gate's *detection* half. It is
  genuinely deterministic and will catch the common form.
- **Decision-registry lookup [V, partial].** The project already files decisions in the
  substrate. A hook could extract candidate question topics and check them against
  `pi-context` decision items. In practice, topic matching between free prose and filed
  decisions is fuzzy; this is a heuristic, not a gate.
- **`prompt`/`agent` hook types [V-ish].** S2 documents `type: "prompt"` (single-turn fast-model
  yes/no) and `type: "agent"` (a subagent with Read/Grep/Glob that returns a decision). A prompt
  hook on `Stop` could ask "does this message re-ask something already decided in
  `.context/decisions.json`?". **But this is an LLM judging an LLM — it is not deterministic
  enforcement**, and it inherits every failure mode being defended against. It is a detector
  with a false-negative rate, deployed where a gate is not available. `type: "agent"` is
  additionally marked experimental.

**Enforcement level:** [V] for the lexical ask-shape only; **[P] for everything semantic.**

**Residual exposure:** large and irreducible with today's surface. The ask-gate regex catches
the interrogative form but not a declarative relitigation ("Two approaches are available: …"),
which is the more common and more costly variant. Distinguishing "a legitimate scope/value
fork" from "a decided question re-opened" requires knowing what was decided and what the current
question means — semantic work no hook performs. The lexical gate will also produce false
positives on the two *legitimate* stops (a genuine scope/value judgement; a HELD action), so it
needs an explicit escape token the model can emit to declare a legitimate stop — which is itself
bypassable by an agent that emits the token wrongly. **Net: narrowable, not closable.**

---

### Summary table

| # | Class | Best available level | Verdict |
|---|-------|---------------------|---------|
| 1 | Attribution fabrication | [V] verbatim-substring against the session transcript | **Closable for marked quotation**; unmarked paraphrase exposed |
| 2 | Adjacent delivery | [E] role separation + [V] structural contract | Structure closable; **semantic fidelity not closable** |
| 3 | Noise | [V] lexical scan of `last_assistant_message` | **Closable** for token classes; verbosity not |
| 4 | Unexecuted work as executed | [V] transcript citation + artifact existence + harness-run gates | **Strongly narrowable**; unfalsifiable-claim residue remains |
| 5 | Process abandonment | [V] branch / task-status / criteria preconditions at dispatch | **Substantially closable** at dispatch time |
| 6 | Fix-introduces-breakage | [E] worktree + [V] path allowlist + gate re-run | Scope **closable**; regression only as good as the suite |
| 7 | Relitigation | [V] ask-shape regex only | **Narrowable, not closable** |

---

## 4. Recommended architecture for this project

Design constraints taken as given: mechanisms must be files (durable), machine-enforced
(encoded), and defined once (DRY). The project already has the right instincts in
`.claude/hooks/` — three `block-*.sh` PreToolUse guards, each with a companion `*.test.sh`. That
test-alongside convention should extend to every new guard, and the existing note that these
hooks fire repo-wide rather than substrate-scoped (`FGAP-089`) applies to everything below.

Current state for comparison: `.claude/settings.json` declares hooks for exactly two events,
`UserPromptSubmit` and `PreToolUse`. `SubagentStop`, `Stop`, `SubagentStart`, `TaskCreated`, and
`TaskCompleted` are entirely unused. `.claude/agents/` contains one definition
(`context-currency-auditor.md`). **The entire return-gate half of the surface is currently
unclaimed**, which is where classes 4 and 6 are actually addressable.

### 4.1 The dispatch contract — one file, injected mechanically

`.claude/dispatch/contract.md` — the canonical brief preamble, authored once.

`.claude/hooks/gate-agent-dispatch.sh`, wired as `PreToolUse` with matcher `Agent|Task`:

1. Reads `tool_input.prompt`, `tool_input.subagent_type`, `tool_input.model`,
   `tool_input.run_in_background`.
2. **Denies** on: Explore not in foreground; `model: sonnet`; background dispatch with no
   absolute report path; missing required sections; missing acceptance criteria on an
   audit/verification dispatch; attribution phrasing outside `<user-verbatim>`; a
   `<user-verbatim>` span absent from the session transcript; bare tracker ids or hex tokens;
   implementing dispatch on `main` or against a dirty tree; a named task not `in-progress` per
   `pi-context context-status`.
3. **Otherwise returns `updatedInput`** with `contract.md` prepended to `prompt`.

DRY story: the contract text lives in one file; every dispatch in every future session gets it
whether or not the orchestrator remembers. Changing the contract changes every future dispatch
with no session-prose update, and `hooks` hot-reload mid-session (S4).

Honest limits: it gates the brief the orchestrator *wrote*, not what the user *wanted*. It
cannot evaluate whether the brief is the right brief. And it reads `tool_input` field names that
are Agent-tool API surface — if those change, the gate silently stops matching, so it should
fail loudly (deny with a diagnostic) when `prompt` is absent rather than passing through.

### 4.2 The return gate — the currently-missing half

`.claude/hooks/gate-agent-return.sh`, wired as `SubagentStop`:

1. Derives the subagent transcript from `session_id` + `agent_id`.
2. Asserts the declared report file exists, is non-empty, and post-dates `SubagentStart`.
3. Parses the report's verdict block; asserts one entry per criterion id from the brief.
4. Verifies every cited `tool_use_id` exists in the subagent transcript with a matching command.
5. For implementing agents: `git diff --name-only` ⊆ declared allowlist; then runs
   `npm run build && npm run check && npm test`.
6. Scans `last_assistant_message` for the noise token classes.
7. Any failure → exit 2 with a specific, actionable stderr message (S7: error messages should
   state the correction, not the symptom).

**Bounded retry is mandatory here.** `SubagentStop` exit 2 sends the agent back to work; an
unbounded gate plus an agent that cannot satisfy it is an infinite loop that burns the session.
Adopt S8's iteration-limit pattern: a per-`agent_id` counter file, and after N failures the hook
stops blocking and instead emits `systemMessage` surfacing the unresolved failure to the user.
This is a genuine scope/value fork and one of the two legitimate stops.

### 4.3 Agent definitions as the DRY role registry

`.claude/agents/<role>.md`, one per standing role — investigator, implementer, adversarial
auditor. These are the durable analogue of `.agent.yaml` for the Claude Code layer. Encode
S8's mutual exclusion in frontmatter:

- investigator: `disallowedTools: Edit` (Write retained only for its own report), `model: opus`,
  `maxTurns`, `memory: project` for accumulated codepath knowledge.
- implementer: no `Agent`, `isolation: worktree` where appropriate, frontmatter `hooks` with the
  `PreToolUse` path-allowlist guard so the restriction travels with the definition.
- adversarial auditor: read-only tools, `permissionMode: plan`, `maxTurns`.

Two documented traps to encode around:
- **Explore and Plan never load CLAUDE.md or git status** (S1), with no setting to change it.
  Rules that must reach them belong in the dispatch prompt — which the §4.1 contract injection
  handles automatically.
- **A definition's `skills` and `mcpServers` are silently NOT applied when it runs as an agent-team
  teammate** (S3). A role that depends on a preloaded skill degrades quietly on that path. Keep
  load-bearing instruction in the *body* (which is appended on both paths) rather than in
  `skills`.

### 4.4 Outgoing-text gate

`Stop` hook scanning `last_assistant_message` for the class-3 token classes and the class-7
ask shapes, with an explicit escape token for a declared legitimate stop. Cheap, deterministic,
and it operates on the one surface the user actually reads.

### 4.5 On agent teams specifically

The honest recommendation: **adopt the subagent-definition layer now; treat teams as an
execution mode to evaluate later.** Reasons, all from S3: teams are disabled by default behind
`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, explicitly experimental, and carry documented
limitations that bear directly on this project's discipline — `/resume` and `/rewind` do not
restore in-process teammates; task status lags (teammates fail to mark tasks complete, blocking
dependents); the lead may declare the team finished before work is done. Those are class-5
failures introduced *by the coordination layer itself*.

What makes the recommendation low-regret is that the artifacts are shared: the same
`.claude/agents/*.md` definitions serve both the Agent-tool path and the teammate path, and
`TeammateIdle`/`TaskCreated`/`TaskCompleted` are the same kind of exit-2 gate as
`SubagentStop`. Building the definition and hook layer now is not a bet on either path. Note
also that `SendMessage` does **not** require teams to be enabled (S1) — only the structured
team-protocol messages do — so agent-to-agent messaging and subagent resume are available today.

### 4.6 What NOT to build

- **No `type: "prompt"` or `type: "agent"` hook as a primary gate.** An LLM judging an LLM is
  not enforcement and imports the failure classes it is meant to catch. Reserve for advisory
  `additionalContext`, never for a deny.
- **No length-threshold noise rule.** Trains evasion, false-positives on real deliverables.
- **No reliance on the `if` hook filter for hard enforcement** — S2 states plainly that it is
  best-effort and fails open on unparseable Bash.
- **No mechanism in `settings.local.json`.** It is gitignored and personal; enforcement belongs
  in the tracked `.claude/settings.json`.

---

## 5. The honest boundary

Restating the limit plainly, because the recommendations above are only sound inside it:

**A hook can deny a tool call, rewrite its input, block a stop, and re-run a command. It cannot
make a model tell the truth, and it cannot evaluate meaning.** Every mechanism above works by
comparing a claim to an artifact that exists independently of the model — the session
transcript, the subagent transcript, the filesystem, git, an exit code. Where such an artifact
exists, enforcement is real and deterministic (classes 1-marked-quotation, 3, 4-cited-claims, 5,
6-scope). Where no such artifact exists — semantic fidelity to intent (2), the truth of an
uncited assertion (4), whether a question was already decided (7) — the harness offers detection
heuristics at best, and prose at worst.

This matches S9's central production finding: instruction quality and output verification are
categorically different problems, and increased model capability does not close the second one.
The gain from this architecture is not that the model becomes trustworthy. It is that the
classes which *can* be made falsifiable stop depending on trust at all, so the residual
trust budget is spent only where nothing else is possible.

---

## 6. Open questions — documentation insufficient or unverified

1. **Does `transcript_path` on `SubagentStop` point to the subagent's own transcript or the
   parent's?** S2 documents the field generically as "path to conversation JSON" and lists
   `agent_id` alongside it, but does not state which transcript it resolves to inside a subagent
   event. Not resolved by the docs. Workaround, and the safer implementation regardless:
   construct the subagent path from `session_id` + `agent_id` per the layout S1 documents
   (`~/.claude/projects/{project}/{sessionId}/subagents/agent-{agentId}.jsonl`). **Verify
   empirically before building the §4.2 gate on it.**
2. **Exact JSON schema of the `Agent` tool's `tool_input` as seen by `PreToolUse`.** S2 confirms
   `Agent`/`Task` are matchable and that `tool_input` carries tool-specific arguments, but
   publishes no field list for the Agent tool. The parameter names used in §4.1 (`prompt`,
   `subagent_type`, `model`, `run_in_background`, `isolation`, `name`) are read from this
   session's own tool schema, not from documentation. Confirm against a real hook payload before
   depending on them, and make the gate fail loudly on an unrecognized shape.
3. **Whether `SubagentStop` exit 2 has a harness-side retry ceiling**, or whether an
   always-failing gate loops indefinitely. S2 documents only that it "prevents the subagent from
   stopping." §4.2's counter assumes no ceiling; if one exists, the counter is harmless.
4. **Whether `updatedInput` on the `Agent` tool is honored for the `prompt` field specifically.**
   S2 documents `updatedInput` generally ("replaces the tool's arguments before execution") with
   a `Bash` `command` example only. The §4.1 injection design depends on this working for
   `Agent.prompt`. **This is the single highest-value thing to verify empirically**, since the
   contract-injection recommendation rests on it; if it does not hold, the fallback is
   deny-with-reason (the orchestrator must include the contract itself), which is weaker because
   it depends on the model to comply after the denial.
5. **Not fetched:** `code.claude.com/docs/en/permissions`, `/tools-reference`, `/plugins-reference`,
   `/agent-sdk/*`, and Anthropic's `effective-context-engineering-for-ai-agents` post. Permission
   rule syntax was taken from S4's settings page rather than the dedicated permissions page;
   pattern-matching edge cases (e.g. exactly how `Agent(name)` matches scoped plugin agents)
   are therefore not fully characterized here.
6. **S10 was read only as a search-result summary**, not as a fetched page. It is cited as
   corroborating framing for the schema-gate pattern and nothing in §3 or §4 depends on it.
