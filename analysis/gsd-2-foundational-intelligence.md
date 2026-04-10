## How gsd-2 establishes foundational intelligence about a project

gsd-2 builds project intelligence through a **four-layer pipeline** that runs sequentially when a project is onboarded or a new milestone begins, and incrementally as work progresses.

### Layer 1: Codebase map generation

**File:** `src/resources/extensions/gsd/codebase-generator.ts` (`generateCodebaseMap`, `ensureCodebaseMap`)

**Mechanism:**
- Walks `git ls-files` to enumerate all tracked files
- Groups by directory
- Applies exclusion patterns and collapse thresholds for large directories
- Produces `.gsd/CODEBASE.md` — a "structural table of contents" with one line per file and an editable description field
- Computes a fingerprint (SHA hash) of the file list for change detection
- Stores metadata: `{generatedAt, fingerprint, fileCount, truncated}`

**Maintenance:** The agent updates file descriptions as it works. Incremental regeneration preserves existing descriptions when files remain. Automatic refresh before prompt injection and after completed units when tracked files change. TTL-based staleness check.

**Command:** `/gsd codebase generate | update | stats`

**Purpose stated in-code:** "Gives fresh agent contexts instant orientation without filesystem exploration."

### Layer 2: Vision capture via guided discussion

**File:** `src/resources/extensions/gsd/prompts/discuss.md`

**Mechanism:** A human-in-the-loop structured interview that produces a milestone vision. Explicit protocol:
1. **Reflection first** — the agent restates what it understood before asking any questions (prevents runaway questioning)
2. **Vision mapping** — proposes a milestone sequence for multi-milestone work before drilling into details; anti-reduction rule forbids scope cutting unless user explicitly asks
3. **Mandatory investigation pass** — BEFORE the first question, the agent must scout the codebase (`rg`, `find`, `scout`), check library docs (`resolve_library`, `get_library_docs`), and web search for unfamiliar domains. This is called out as "not optional."
4. **Questioning philosophy** — "Challenge vagueness, make abstract concrete. Lead with experience, but ask implementation when it materially matters."
5. **Web search budget** — explicit token/call budgeting across discussion turns

**Output:** `REQUIREMENTS.md` with Active/Deferred/Out-of-scope requirements, plus `M###-CONTEXT.md` for milestone-level decisions.

### Layer 3: Staged research (milestone → slice)

**Files:** `prompts/research-milestone.md`, `prompts/research-slice.md`, `prompts/parallel-research-slices.md`, `templates/research.md`

**Mechanism:** Research runs in two tiers with different roles:

**Milestone research** — strategic, broad. Explicit role statement: "You are the first deep look at this milestone. A **roadmap planner** reads your output to decide how to slice the work — what to build first, how to order by risk, what boundaries to draw between slices." Answers strategic questions:
- What should be proven first?
- What existing patterns should be reused?
- What boundary contracts matter?
- What constraints does the existing codebase impose?
- Are there known failure modes that should shape slice ordering?

**Slice research** — tactical, per-slice. Role: "You are the scout. After you finish, a **planner agent** reads your output in a fresh context with no memory of your exploration. It uses your findings to decompose this slice into executable tasks." The output is shaped for the next agent, not for a human.

**Parallel dispatch** — `parallel-research-slices.md` orchestrates one subagent per slice via the `subagent` tool in parallel mode, with explicit failure-recovery protocol.

**Depth calibration** — explicitly graded (deep / targeted / light) based on uncertainty, with honest instruction: "An honest 'this is straightforward, here's the pattern to follow' is more valuable than invented complexity."

**Template** (`templates/research.md`) requires three sections: Summary, Recommendation, Implementation Landscape (Key Files, Build Order, Verification Approach). Optional sections: Don't Hand-Roll, Constraints, Common Pitfalls, Open Risks, Skills Discovered, Sources. The template is designed as the primary input to the next pipeline stage (the planner).

**Persistence:** `gsd_summary_save` tool writes research as an artifact into both the DB and disk. The path is computed by the tool, not by the agent.

### Layer 4: Skill discovery (context-sensitive tool availability)

**File:** `src/resources/extensions/gsd/skill-discovery.ts`

**Mechanism:**
- Snapshots the contents of `~/.agents/skills/` and `~/.claude/skills/` at auto-mode start
- Detects skills installed since the snapshot
- New skills are injected into the system prompt via `before_agent_start` hook
- Makes new capabilities visible to subsequent units without reload

**Purpose:** Allows the agent to pick up skills mid-session as they become relevant, rather than requiring restart.

### Cross-cutting pipeline mechanics

**Inlined context preloading** — Every prompt template has `{{inlinedContext}}` — all relevant preloaded files (CODEBASE.md, REQUIREMENTS.md, dependency slice summaries, research outputs, decision register) are inlined into the prompt before the agent starts. Explicit instruction: "start working immediately without re-reading these files."

**Dependency slice summaries** — `{{dependencySummaries}}` contain "Forward Intelligence" sections from upstream slices: "hard-won knowledge about what's fragile, what assumptions changed, and what to watch out for." Each completed slice writes forward intelligence that subsequent slices read.

**Source file paths** — `{{sourceFilePaths}}` tells each unit explicitly which files it should touch.

**Decisions register** — `DECISIONS.md` is append-only, auto-regenerated by `gsd_decision_save` tool. Structural decisions from each planning phase land here with auto-assigned IDs.

**Requirements coverage tracking** — every Active requirement must reach one of four states by the end of planning: mapped to a slice, explicitly deferred, blocked with reason, or moved out of scope. A compact coverage summary in the roadmap makes omissions "mechanically visible."

---

## Mapping to platonic pi-project-workflows

| gsd-2 intelligence layer | platonic pi-project-workflows expression |
|---|---|
| `.gsd/CODEBASE.md` generator | A workflow that runs `git ls-files`, walks directories, writes to `.project/architecture.json` (or a new `codebase` block). Render macro produces CODEBASE.md view. The JSON block is the truth; the markdown is a render. Fingerprint + TTL stored in block metadata. Auto-refresh is a scheduled workflow (issue 031). |
| `/gsd codebase generate` command | `/project refresh-codebase` or a workflow run. Generation logic is a workflow step (command step or agent step), not a hand-coded command handler. |
| Discussion → `REQUIREMENTS.md` | A discussion workflow that drives the interview via an agent with `inputSchema` (user message) and outputs structured items into `.project/requirements.json` (already exists as a block). The reflection, anti-reduction, and investigation-first protocol are encoded in the agent's prompt template. Render macro produces REQUIREMENTS.md view. |
| `M###-CONTEXT.md` | A block subset injected via `contextBlocks: [requirements, decisions, milestones]` scoped to the active milestone. The injection is a render of filtered block data at agent compile time. |
| Milestone research | A workflow step that runs a research agent with `contextBlocks: [project, architecture, requirements]` and writes output to a `research` block (or appends to an existing one). The agent template is the current `research-milestone.md` content. |
| Slice research (parallel) | A `forEach` workflow step over slices, dispatching one research agent per slice in parallel. The DAG planner handles parallelism automatically. Forward intelligence = prior slice's verification/summary block data injected via `contextBlocks`. |
| Research template (`templates/research.md`) | A Nunjucks template in `packages/pi-workflows/templates/research/` with the same section structure. The agent renders into this template; the rendered output becomes the block write-back. |
| `gsd_summary_save` tool | Native to pi-project: `append-block-item` or `write-block` with schema validation. The path computation is done by `block-api.ts`; the agent does not construct it. |
| Skill discovery | Out of scope for pi-project-workflows. This is Pi platform / user-tooling territory — pi-workflows does not (and should not) detect or register skills. |
| Inlined context preloading | This IS `contextBlocks` injection. The mechanism already exists. What gsd-2 calls "inlined context" is exactly what our framework does when it reads declared `contextBlocks` from `.project/` and renders them into the template environment. |
| Forward intelligence between slices | A specific `contextBlocks` pattern where slice N+1's agent declares `contextBlocks: [verification, decisions]` filtered to completed upstream slices. Our current `contextBlocks` mechanism reads whole blocks; gsd-2's forward intelligence requires **filtered/scoped reads** — a capability we don't yet articulate. |
| Dependency slice summaries | Same as above: filtered reads of a `verification` or `summary` block scoped to `depends_on` slice IDs. |
| Decisions register auto-regeneration | `decisions` block (already exists) + render macro to produce DECISIONS.md view. `append-block-item` with schema validation handles ID assignment. |
| Requirements coverage tracking | Cross-block validation: for each Active requirement, trace `traces_to` field into slices/tasks. Produce a coverage report. This IS `validateProject()` — cross-block referential integrity. The framework already does this for task → phase, decision → phase, etc. Requirements → slices is the same mechanism. |
| Mandatory investigation pass before questioning | An agent prompt-level behavior, not a framework concern. The agent template encodes "investigate before asking." Nothing to build. |
| Web search budget | An agent-level budget articulated in the prompt. Nothing to build at the framework level. |
| Depth calibration (deep/targeted/light) | An agent-level decision articulated in the prompt. Nothing to build. |

### What this mapping reveals

**1. gsd-2's "intelligence layers" are exactly what our typed loop is designed to produce — but with one capability we have not yet articulated: scoped/filtered block reads.**

Our current `contextBlocks` injection reads whole blocks. gsd-2 needs to inject:
- "The verification block, but only entries for slices depends_on[] lists"
- "The requirements block, but only Active ones"
- "The decisions block, but only those related to the active milestone"

This is a first-class framework gap. It is not currently in our open issues list. It is a concrete, specific missing capability: **contextBlocks with query/filter expressions**.

**2. gsd-2's "inlined context" IS contextBlocks by another name.** Every gsd-2 prompt has `{{inlinedContext}}` — preloaded file contents injected into the prompt template. That is exactly our `contextBlocks` injection, renamed. We have the primitive; gsd-2 uses it extensively.

**3. gsd-2's generation logic is imperative TypeScript because our framework doesn't express it declaratively yet.** Codebase map generation is ~300 lines of TypeScript in `codebase-generator.ts`. In the platonic form, it is a 20-line workflow YAML that runs `git ls-files`, parses the output, and writes to a block. The difference is that gsd-2's framework doesn't let you express "run this command, parse its output, write to this block" as a YAML spec — so they wrote it in TS. Our platonic form does, via `step-command` + `step-block` + expression interpolation.

**4. gsd-2's research templates are effectively agent specs without the framework to hold them.** `research-milestone.md` and `research-slice.md` are ~80-line markdown prompt templates. They are agent specs with `inputSchema` (milestone/slice identifier + inlined context), `contextBlocks` (research, architecture, requirements), `output.schema` (the research template sections), and a task template (the prompt body). They exist as standalone `.md` files because gsd-2 doesn't have our `.agent.yaml` compilation pipeline.

**5. The "Forward Intelligence" pattern is a concrete demand for write-back from executing agents.** gsd-2's slice N writes forward intelligence that slice N+1 reads. In our framework, this is issue 028 (block write-back from agent steps) + issue 030 (writeback monitor). The pattern gsd-2 demonstrates is exactly the use case those issues are opened for: durable, structured knowledge accumulated across executions.

### Platonic conclusion

gsd-2's foundational intelligence pipeline is a four-stage process:

1. **Map the codebase** → write to a block, render to markdown
2. **Capture vision** → drive structured items into requirements block via a discussion agent
3. **Research in tiers** (milestone → slices, parallel) → write findings into research blocks, with scoped contextBlocks reads of upstream work
4. **Plan** → decompose into slices/tasks with requirements coverage validation

All four stages map to workflows + agents + blocks + render macros in our platonic form, with **one missing primitive**: scoped/filtered contextBlocks reads. That is the single concrete capability gap this investigation surfaces that is not already in our open issues list.

Every other piece — codebase walking, discussion flow, research templates, parallel dispatch, coverage tracking, decision registers, forward intelligence, inlined context — is either already in our framework or already in our open issues list waiting to be built.
