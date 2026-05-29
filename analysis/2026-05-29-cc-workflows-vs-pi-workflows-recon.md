# Deep Recon: Claude Code Workflows vs Pi-Workflows

## Part 1: Claude Code Workflow API (Research-Preview)

### Hook Signatures & Semantics

**agent(prompt, opts) → Promise<AgentResult>**
- Spawns a subagent with given prompt
- opts: { schema?, label?, phase?, model?, isolation?: 'worktree' }
- schema forces structured output via StructuredOutput tool, pre-execution
- label for UI annotation; phase for phasing UI + cost grouping
- isolation: 'worktree' provides filesystem isolation (expensive—shared mutation pattern)
- Returns agentResult with structured data (if schema) or raw text
- Example: `const finding = await agent("Audit file X for auth checks", { schema: authCheckSchema })`

**pipeline(items, ...stages) → Promise<Item[]>**
- NO BARRIER between stages (not a map-reduce)
- Each stage is a function(item) → Promise<Item>
- Item A proceeds to stage 2 while item B still in stage 1
- Semantics: asynchronous fine-grain concurrency, max N in-flight per stage (configurable by budget)
- Use case: streaming analysis, progressive filtering, soft batching
- Example: `await pipeline(files, readAndAnalyze, checkComplexity, scoreIssues)`

**parallel(thunks) → Promise<Results[]>**
- BARRIER: awaits all to complete before returning
- thunks: Array<() => Promise<T>>; lazy evaluation
- Use case: explicit fan-out + join; multi-lens review; independent findings that must coalesce
- Example: `await parallel([() => skeptic1(claim), () => skeptic2(claim), () => skeptic3(claim)])`

**phase(title) → void**
- Marks progress in UI; affects cost grouping + resume cache boundaries
- Example: `phase("Verify findings")`

**log(msg) → void**
- Appends to session transcript (visible in `/workflows` detail view)

**workflow(name, args) → Promise<Result>**
- 1-level-only sub-workflow invocation (cannot nest arbitrarily deep)
- args: object passed to invoked workflow; must match its input schema
- Returns the invoked workflow's final result
- Example: `const report = await workflow('deep-research', { question: userQ })`

### Globals & Resume-Safety

**args** (object)
- Script's input arguments (user-provided or from calling workflow)
- Read-only; safe to reference in templates
- Example: `const path = args.cwd`

**budget** (object)
- budget.total: initial token budget
- budget.spent(): current spend
- budget.remaining(): tokens left
- Shared across main script + all spawned agents
- Decrements as agents run
- Example: `if (budget.remaining() < 10000) { return "budget exhausted" }`

**Resume-incompatible APIs** (throws or ignored)
- Date.now() → throws (non-deterministic; breaks cache)
- Math.random() → throws (non-deterministic; breaks cache)
- new Date() (no args) → throws; new Date(2020, 1, 1) OK (deterministic)
- Why: resume-cache stores (prompt, opts) → result; Date.now() varies between runs
- These checks run at validation time; throwing prevents buggy scripts from deploying

### opts on agent()

- schema: JSON Schema (passed to StructuredOutput tool; forces structured mode)
- label: string for UI annotation ("Finding X", "Verify Y")
- phase: string or number to group costs + affect resume
- model: override session model for this agent
- isolation: 'worktree' (spawns worktree-scoped subagent; only when parallel mutation risk)

### Concurrency & Limits

- Up to 16 concurrent agents per workflow (fewer on low-CPU machines)
- 1,000 agents total per run (prevents runaway loops)
- pipeline() applies implicit rate-limiting per stage (no explicit concurrency config)
- parallel() requires all thunks to complete before proceeding

### Quality Patterns (Documented)

1. **adversarial-verify**: N skeptics independently review a claim; majority vote filters; example:
   ```javascript
   const claim = "feature X is fast";
   const skeptics = await parallel([
     () => agent("Disprove: " + claim, { label: "skeptic-1" }),
     () => agent("Disprove: " + claim, { label: "skeptic-2" }),
     () => agent("Disprove: " + claim, { label: "skeptic-3" }),
   ]);
   const survived = skeptics.filter(s => !s.includes("can confirm")).length === 0;
   ```

2. **perspective-diverse-verify**: N different lenses (security, performance, UX, ops); must pass all
   ```javascript
   const perspectives = await parallel([
     () => agent("Security review of " + code, { label: "security" }),
     () => agent("Perf review of " + code, { label: "perf" }),
     () => agent("UX review of " + code, { label: "ux" }),
   ]);
   ```

3. **judge-panel**: N agents independently assess; synthesis of votes + reasoning
   ```javascript
   const judges = await parallel([
     () => agent("Rate approach A", { schema: ratingSchema }),
     () => agent("Rate approach B", { schema: ratingSchema }),
   ]);
   const synthesized = await agent("Aggregate: " + JSON.stringify(judges), { label: "synthesis" });
   ```

4. **loop-until-dry**: Iterate (review → improve) until no new issues found
   ```javascript
   let improved = true;
   while (improved) {
     const issues = await agent("Find issues in latest version", { schema: issuesSchema });
     improved = issues.length > 0;
     if (improved) {
       await agent("Fix these issues: " + JSON.stringify(issues));
     }
   }
   ```

5. **multi-modal-sweep**: Agents using different modalities (text, tool calls, structured)
   - E.g., one agent reads code, another runs tests, third synthesizes
   - Implicit in any heterogeneous pipeline

6. **completeness-critic**: Agent that audits another's findings against a checklist
   ```javascript
   const findings = await agent("Audit X", { schema: findingsSchema });
   const critic = await agent("Did you cover all of " + checklist + "? " + findings);
   ```

### Resume Mechanics

- **runId**: unique per invocation; stored in run directory
- **scriptPath**: path to .js script; used for cache lookup
- **resumeFromRunId**: option to re-run from an incomplete state
- **Resume cache**: (prompt, opts) identity → agent result
  - Longest unchanged prefix returns cached results
  - Re-run continues from first non-cached phase
  - Same-session-only (session exit loses cache)
- **How it works**: agent calls store results atomically; on resume, script re-runs from top; early agent calls return cached; execution resumes at first miss
- **Idempotency requirement**: scripts must be deterministic (hence Date.now() enforcement)

---

## Part 2: Pi-Workflows Current Capability & Shape

### Step Types Supported

| Type | Field | Retryable | Input | Output | Semantics |
|------|-------|-----------|-------|--------|-----------|
| agent | agent | ✓ | ✓ | ✓ | Dispatch agent.yaml; validate input/output schemas |
| gate | gate | ✗ | ✗ | ✗ | Shell command → exit code → onPass/onFail routing |
| transform | transform | ✗ | ✗ | ✗ | Pure mapping: input fields → output object via ${{ }} |
| loop | loop | ✓ | ✗ | ✗ | Repeat sub-steps until iteration limit or gate break |
| parallel | parallel | ✓ | ✗ | ✗ | Run named sub-steps concurrently; all must finish |
| monitor | monitor | ✗ | ✓ | ✓ | Classification gate; output score/label (custom monitors) |
| command | command | ✗ | ✓ | ✓ | Shell command; stdout as output |
| block | block | ✗ | ✓ | ✓ | In-process file I/O (read/write/append/update/remove) |
| pause | pause | ✗ | ✗ | ✗ | Manual workflow pause (string message display) |

**Note**: exactly one step type per step; workflow (nested invocation) is phase-6, not yet implemented.

### Parallelism Inference (DAG Planner)

- **extractDependencies()**: scans ${{ steps.X }} references in input, when, gate.check, transform.mapping, loop.attempts
- Does NOT descend into loop sub-steps (their internals are not top-level DAG members)
- Builds dependency map: step → Set<step names it depends on>
- **buildConservativePlan()**: adds implicit sequential dep for steps with no explicit deps (declaration-order)
  - Example: if step-3 has no ${{ steps.X }} refs, it implicitly depends on step-2
  - Preserves sequential default; explicit refs enable diamond DAG patterns
- **buildPlanFromDeps()**: topological sort → layers (steps with no deps in same layer)
- **Barrier semantics**: all steps in layer must complete before next layer starts (unlike Claude pipeline)

### State & Context Flow

- **${{ steps.X.output }}**: resolved post-completion
- **${{ steps.X.textOutput }}**: raw LLM text (agent steps only)
- **${{ input.field }}**: workflow input
- **${{ loop.iteration }}, ${{ loop.maxAttempts }}, ${{ loop.priorAttempts }}**: loop scope
- **context: [stepName]**: agent step only; inlines referenced steps' textOutput into dispatch prompt
  - Different from steps.X expressions (expressions evaluate in agent, context inlines into system prompt)
- Expression evaluation: recursive descent with null-check; filter pipes (duration, currency, json, length, keys, filter, last, first, slugify, shell)

### Validation Surface

**workflow-sdk.ts exports**:
- validateWorkflow(spec, cwd): 11 checks (agent resolution, schema existence, step references, context refs, filter names, metadata, inputSchema required keys, contextBlocks, template alignment)
- Returns ValidationResult with {status, issues[]} (error vs warning distinction)
- Validation-time only; does not execute

### Error Handling & Retry Semantics

- **retry**: { maxAttempts, onExhausted: "fail"|"skip", steeringMessage }
- Applies to agent, loop, parallel steps (if marked retryable in STEP_TYPES)
- Per-step config; not global
- onExhausted: "fail" stops workflow; "skip" proceeds (step marked skipped)
- steeringMessage: optional custom text for agent retry (e.g., "You failed because X; try Y")
- Non-retryable steps (gate, transform, pause) reject retry config at validation time

### Resume / State Persistence

- **generateRunId()**: UUID per execution
- **initRunDir()**: creates .workflows/runs/<workflow-name>/runs/<runId>/
- **writeState()**: atomic persist (tmp + rename) of ExecutionState
- **On resume**: re-run from top; steps already completed skip re-dispatch; first incomplete step re-runs live
- **Same-session resumable**: runId tracked; user can pause (Ctrl+H) mid-workflow, then resume via TUI
- Different from Claude: no (input, opts) identity cache; step-by-step state machine instead

### Subagent Dispatch Shape

- **dispatch(stepSpec, agentSpec, prompt, options)**: spawns `pi --mode json`
- Subprocess captures stdout as JSON lines (events: message_start, message_end, tool_execution, etc.)
- Collects usage (input/output tokens, cache read/write, cost)
- Timeout support; cancellation via AbortSignal; SIGKILL grace period
- Prompt arg passing: >8000 chars → @file passing (avoid OS arg limits)
- Model override: step.model > agent.model > role-based config > default

### Quality Patterns Expressible Today

1. **adversarial-verify**: partial
   - Can run parallel steps (each agent step independently)
   - No built-in majority-vote; user must synthesize votes manually via transform or gate
   - Missing: no native "skeptic loop" or pattern template

2. **perspective-diverse**: partial
   - parallel step with N agent sub-steps (one per lens)
   - Missing: no "all must pass" assertion; gates handle hard failures, not soft quality thresholds

3. **judge-panel**: possible
   - parallel agent steps + transform or agent synthesis step
   - Missing: no voting/scoring primitives

4. **loop-until-dry**: possible
   - loop step with maxAttempts / attempts expression
   - gate inside loop to detect "no issues found" + break
   - Missing: "until-condition" or "while-condition" style loop (must use gate)

5. **multi-modal-sweep**: implicit
   - Different agent steps can declare different roles (sensor, action, reasoning, quality)
   - Model config can route by role
   - Missing: no explicit dispatch strategy primitives

6. **completeness-critic**: doable
   - Extra agent step that reviews prior output against checklist
   - Output schema validation ensures coverage
   - Missing: no built-in "audit-against-spec" pattern

---

## Part 3: Learning Bridges (What Claude Code Teaches Pi-Workflows)

### 1. Pipeline-No-Barrier vs DAG-with-Barriers

**Verdict**: INSPIRE — adopt a soft-streaming pipeline mode alongside DAG.

Pi-workflows today: strict DAG layers (all in layer N must finish before layer N+1 starts).
Claude: pipeline() allows stage A items to progress independently (item 1 in stage 2 while item 2 in stage 1).

Pi currently cannot express this. Consequence: workflows with 100 files cannot parallelize asymmetrically (e.g., 50 slow checks + 50 fast checks must wait).

**Concrete addition**: Add a new **stream** step type or a streaming-mode flag on parallel:
```yaml
steps:
  analyze-all:
    stream:  # or parallel: { stream: true }
      stages:
        - read-file:
            command: cat ${{ item }}
        - check-syntax:
            command: node --check ${{ steps.read-file.output }}
        - report:
            agent: issue-reporter
            input:
              syntax-errors: ${{ steps.check-syntax.output }}
    forEach: ${{ input.files }}
```
Each item flows through stages asynchronously; stage N does not wait for stage N-1 to finish all items.

**Implementation**: executor collects per-item per-stage promises; resolution polls for ready items rather than layers.

---

### 2. parallel() with Thunks vs parallel Step Type

**Verdict**: INSPIRE — add thunk-based subprocess spawning for lazy evaluation.

Claude: parallel(thunks) defers execution (thunk = () => Promise<T>); allows conditional branching (some thunks may never run) + cheaper memory footprint.

Pi-workflows parallel: declares all sub-steps upfront; all are created eagerly (even if unreachable via gate breaks).

**Concrete addition**: Add a **when** field to parallel sub-steps (already exists at top level); also allow parallel steps to be thunks-like:
```yaml
steps:
  parallel-verify:
    parallel:
      skeptic-1:
        agent: skeptic
        input: { claim: ${{ steps.initial.output }} }
      skeptic-2:
        agent: skeptic
        input: { claim: ${{ steps.initial.output }} }
        when: ${{ steps.skeptic-1.status == 'completed' }}  # run only if 1st completes
```
OR new **thunk-parallel** step type:
```yaml
steps:
  conditional-parallel:
    thunk-parallel:
      - agent: fast-check
        when: ${{ input.mode == 'quick' }}
      - agent: thorough-check
        when: ${{ input.mode == 'thorough' }}
```

---

### 3. Quality Patterns Enumerated in Docs

**Verdict**: ADOPT — codify patterns as bundled workflow templates + step macros.

Claude docs explicitly list 6 quality patterns (adversarial-verify, perspective-diverse, judge-panel, loop-until-dry, multi-modal-sweep, completeness-critic).

Pi-workflows can express most but lacks pattern guidance + bundled templates.

**Concrete additions**:
- Add a **patterns/** subdirectory in bundled workflows with starter YAML:
  - `patterns/adversarial-verify.workflow.yaml` — agent step + parallel sub-steps (N skeptics) + transform (vote aggregation) + gate (decide pass/fail)
  - `patterns/judge-panel.workflow.yaml` — parallel agent steps + synthesis step
  - `patterns/loop-until-dry.workflow.yaml` — loop with gate (detect completion) + break on success
  - etc.
- Add macro library (Nunjucks) for boilerplate (e.g., `{% call vote_aggregation(judges) %}...{% endcall %}`)
- Update SDK docs to reference patterns + when to use each

---

### 4. Loop-Until-Dry / Loop-Until-Budget / Loop-Until-Count

**Verdict**: ADOPT — extend loop spec with termination predicates.

Claude: loop-until-dry is a pattern (gate breaks); pi-workflows has hardcoded maxAttempts.

Pi-workflows loop step: maxAttempts (number) or attempts (expression).

**Concrete addition**: Extend LoopSpec with optional terminationChecks:
```yaml
loop-refine:
  loop:
    maxAttempts: 10
    # Alternative: expression-based termination
    until: ${{ steps.check-quality.output.score > 0.9 }}
    # Budget-aware termination
    untilBudgetRemaining: 5000  # stop if <5000 tokens left
    steps:
      improve:
        agent: improver
        input: { current: ${{ steps.improve.textOutput }} }
      check-quality:
        agent: quality-checker
        input: { version: ${{ steps.improve.textOutput }} }
        output:
          format: json
          schema: quality.schema.json
```
Executor short-circuits if until condition is true before maxAttempts exhausted.

---

### 5. Structured-Output Forcing (JSON Schema Pre-Execution)

**Verdict**: ADOPT — pass schema to dispatch, enforce StructuredOutput tool.

Claude: agent(prompt, { schema }) forces StructuredOutput tool pre-execution; Claude model uses tool automatically.

Pi-workflows: agent step declares output.schema; validation happens POST-execution (after collecting output).

**Concrete addition**: Pass schema to dispatch function; dispatch wraps prompt with "you MUST use the OutputSchema tool" + schema in system prompt. Before sending to agent, validate schema is parseable + inject into agent dispatch args.

File change: step-agent.ts dispatch signature:
```typescript
export function buildArgs(step: StepSpec, agentSpec: AgentSpec, prompt: string, options: DispatchOptions): string[] {
  // ... existing code ...
  if (step.output?.schema) {
    args.push("--schema-enforce", step.output.schema);  // or read schema and inject into prompt
  }
  return args;
}
```

---

### 6. Resume Cache by (Prompt, Opts) Identity

**Verdict**: INSPIRE — adopt (input-hash, opts-hash) caching alongside step-id caching.

Claude: (prompt, opts) → cached result; longest unchanged prefix returns cached; survives resume within session.

Pi-workflows: step-by-step state machine; re-runs only incomplete steps; no content-identity cache.

**Implications**: Pi's approach is simpler (no hash collisions, no cache invalidation puzzles) but loses claude's "re-run script with same input = instant" property.

**Concrete addition**: Optional **cache-by-identity** mode:
- Compute SHA256(prompt + JSON.stringify(opts)) as cache key
- Store cache in ~/.pi/agent-cache/ (persistent across sessions)
- On dispatch, check cache before spawn; return cached result if hit
- Risk: cache invalidation (if agent behavior changes, old results stale); need explicit --clear-cache flag
- Benefits: massive speedup on repeated runs (e.g., nightly audits with same code)

---

### 7. Token Budget Tracking

**Verdict**: ADOPT — add global budget field to WorkflowSpec + runtime tracking.

Claude: budget.total, budget.spent(), budget.remaining() shared across all agents.

Pi-workflows: no equivalent; each step has usage; no aggregate budget enforcement.

**Concrete addition**: Extend WorkflowSpec + ExecutionState:
```typescript
export interface WorkflowSpec {
  // ... existing ...
  budget?: {
    maxTokens?: number;      // e.g., 100,000
    maxCost?: number;        // e.g., $5.00
    alertThreshold?: number; // e.g., 80% spent → warning
  };
}

export interface ExecutionState {
  // ... existing ...
  budgetSpent?: { tokens: number; cost: number };
}
```

Executor tracks total usage across all steps; stops workflow if budget exhausted (or issues warning at threshold).

---

### 8. Worktree Isolation per-Agent

**Verdict**: ADOPT — make worktree isolation a step opt (already supported in dispatch, not exposed).

Claude: isolation: 'worktree' per agent(call); subagent has sandboxed filesystem.

Pi-workflows: agent steps dispatch as subprocess; already cwd-scoped, but no worktree isolation.

**Concrete addition**: Agent step opt + dispatch support:
```yaml
steps:
  refactor-shared-code:
    agent: code-refactorer
    isolation: worktree  # or isolation: { type: 'worktree', cleanup: true }
    input: { ... }
```

dispatch.ts checks step.isolation and spawns worktree-scoped subagent if set.

Cost: worktree creation + filesystem overhead; only enable when parallel mutation risk exists.

---

### 9. agentType Opt

**Verdict**: INSPIRE — extend agent step to accept agentType dispatch hint.

Claude: agentType: 'Explore', 'code-reviewer', etc. lets script invoke specialized subagent types.

Pi-workflows: agent step names agents (e.g., agent: code-explorer); no subagent-type routing.

**Concrete addition**: Agent step opt:
```yaml
steps:
  explore:
    agent: code-explorer
    agentType: Explore  # dispatch hint (case-sensitive role name from SDK)
    input: { path: ${{ input.path }} }
```

dispatch.ts passes agentType to pi CLI: `pi --agent-type Explore ...` (if SDK supports it).

OR build into agent spec itself:
```yaml
# in code-explorer.agent.yaml
agentType: Explore
```

---

### 10. Sub-Workflow Invocation

**Verdict**: ADOPT — implement workflow() step type (currently phase-6, rejected at parse time).

Claude: workflow(name, args) calls another workflow; 1-level-only; returns result.

Pi-workflows: workflow is declared in spec but rejected during validation (line 291 of workflow-spec.ts).

**Concrete addition**: Remove rejection; implement workflow step type:

```yaml
steps:
  audit-codebase:
    agent: ... # get list of files

  check-each:
    workflow: audit-file  # invoke audit-file.workflow.yaml for each file
    forEach: ${{ steps.audit-codebase.output.files }}
    input:
      file: ${{ item }}
      strictness: high

  synthesize:
    agent: report-synthesizer
    input:
      checks: ${{ steps.check-each.output }}
```

Executor:
1. Validates target workflow exists
2. On dispatch: calls executeWorkflow recursively (with runDir hierarchical: parent-runId/subflows/subworkflow-name-N/)
3. Collects all sub-workflow results in steps.<step-name>.output

**Nesting depth**: limit to 2-3 levels to prevent runaway recursion.

---

### 11. Bundled / Discoverable Workflows

**Verdict**: INSPIRE — enhance CLI discoverability + slash-command registration.

Claude: workflows live in `.claude/workflows/<name>.js`; appear as `/<name>` slash commands; discoverable via `/workflows` list.

Pi-workflows: lives in `~/.pi/workflows/` or project `.pi/workflows/`; execute via `workflow-execute` tool or TUI picker.

**Concrete addition**: 
- Add `workflow-list` tool: returns available workflows + metadata (name, description, input schema)
- Register workflows as slash commands in extension: `/<workflow-name>` shorthand (e.g., `/<audit-codebase>`)
- CLI: `pi workflow list` shows available workflows + usage
- TUI: add workflow picker to main menu (alongside other actions)
- Auto-discover from bundled + project + user dirs (like agents/schemas)

---

### 12. Resume-Incompatible API Enforcement

**Verdict**: INSPIRE — add validation to catch non-deterministic expressions.

Claude: rejects Date.now(), Math.random() at script validation time (throws).

Pi-workflows: expressions evaluated at step dispatch; no enforcement of determinism.

**Concrete addition**: Pre-flight validator in template rendering:
- Scan all ${{ }} expressions for disallowed patterns: Date.now, Math.random, crypto.random, uuid()
- Issue warning at validation time (or error if --strict-determinism flag)
- Document the risk: expressions evaluated at dispatch time; if non-deterministic, resume will re-evaluate → different values

---

### 13. Bidirectional: What Pi-Workflows Has That Claude Doesn't

**Typed YAML Specs**: Pi-workflows WorkflowSpec + StepSpec are strict typed; claude workflows are JavaScript (no schema enforcement at parse time). Pi's advantage: authoring-time validation, IDE integration, schema generation.

**Substrate Context Injection**: Pi's contextBlocks mechanism injects project-specific context (architecture docs, codebase snapshots) into agent dispatch. Claude workflows must pass context as explicit input. Pi's advantage: less prompt boilerplate; automatic context selection.

**Nunjucks Template Rendering**: Pi agents have systemPrompt + taskTemplate rendered with Nunjucks (context injection, macros, loops). Claude workflows string-interpolate. Pi's advantage: flexible templating; less string concatenation; reusable macro libraries.

**Monitor Classification Gates**: Pi's monitor step type (custom verifier executable) pre-filters workflow routing without LLM. Claude has no equivalent (all filtering is via agent logic). Pi's advantage: faster, cheaper, deterministic gates.

**Block-Level File I/O**: Pi's block step type (read/write/append/update/remove) provides structured file ops without shell. Claude workflows shell out or dispatch agents. Pi's advantage: transactional, schema-validated, rollback-capable.

**Per-Step Output Schema Validation**: Pi validates step output against JSON schema post-completion. Claude schema() forces pre-execution (forces tool use) but doesn't validate. Pi's advantage: post-hoc validation; allows agent freedom in reasoning but enforces output contract.

---

## Summary Table: Adoption Opportunities

| Pattern / Feature | Verdict | Effort | Priority | File(s) to Change |
|---|---|---|---|---|
| Pipeline-no-barrier (streaming) | INSPIRE | medium | medium | step-parallel.ts, dag.ts, workflow-executor.ts |
| Thunk-parallel (lazy eval) | INSPIRE | low | low | workflow-spec.ts, step-parallel.ts |
| Quality patterns (templates) | ADOPT | low | high | bundled workflows/, docs |
| Loop termination predicates | ADOPT | low | high | types.ts, step-loop.ts, expression.ts |
| Schema pre-execution forcing | ADOPT | low | high | dispatch.ts, step-agent.ts |
| Content-identity caching | INSPIRE | medium | low | dispatch.ts, step-agent.ts |
| Global token budget | ADOPT | low | medium | types.ts, workflow-executor.ts |
| Worktree isolation opt | ADOPT | very low | low | workflow-spec.ts, step-agent.ts, dispatch.ts |
| agentType dispatch hint | INSPIRE | low | low | workflow-spec.ts, step-agent.ts |
| workflow() step type (phase-6) | ADOPT | high | high | workflow-spec.ts, workflow-executor.ts |
| CLI discoverability / slash-cmd | INSPIRE | medium | medium | CLI, TUI, extension-host |
| Determinism enforcement | INSPIRE | low | low | expression.ts, validation |

---

