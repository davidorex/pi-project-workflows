# Comprehensive JIT-Agents Contradiction Audit — `.project/`

**Scope:** Every substrate item across every block referencing pi-jit-agents — decisions, framework gaps, features, issues, research, verification, spec-reviews, layer-plans, phase, conventions, project. **22 contradictions found.**

---

## CATEGORY A: CANONICAL-BODY vs IMPLEMENTATION (3 contradictions)

These are the most severe — the substrate's enacted decisions, features, and user-stated intentions describe one thing; the code does another.

### A1. Phantom-tool-only dispatch vs tool-using-agent canonical body

| What | ID | Status | Says |
|------|-----|--------|------|
| Spec doc | `docs/planning/jit-agents-spec.md` | — | `executeAgent is unified in-process dispatch. Phantom tool enforcement via buildPhantomTool + forced toolChoice` |
| Implementation | `packages/pi-jit-agents/src/jit-runtime.ts:488,568` | — | tools discarded at line 488 after grant-clamp; only phantom-tool delivered at line 568 |
| Feature | **FEAT-005** | complete | `The subagent receives its OWN tools, JIT-composed per invocation, scoped to EXACTLY the operations the task needs` |
| Feature | **FEAT-006** | complete | `privileged-agent → real-check-validated → attested-commit code-change loop` |
| Decision | **DEC-0047** | enacted | Capability grants clamped at dispatch then `exercised by the agent` |
| Task | **TASK-091** | completed | `agent does the work, real-check verifies, attested-commit lands` |
| User intent | JI-029 | verbatim | `a jit agent with perms for specific things — read, amend blocks` |
| Gap | **FGAP-169** | identified, P1 | `compiled.tools is structurally unreachable from LLM; never delivered` |
| Gap | **FGAP-177** | identified, P1 | `jit-agents-spec.md is the outlier substrate text contradicting canonical body` |
| Gap | **FGAP-178** | identified, P1 | `Capability-grant infrastructure is no-op at agent-dispatch tier` |

**Contradiction:** The canonical body (FEAT-005/006, DEC-0047, TASK-091, JI-029) says jit-agents are tool-using agents acting on granted capabilities. The implementation (FGAP-169 confirmed by code-grep: `compiled.tools` used only at line 488 for clamp, then discarded; line 568 wires only `[phantomTool]`) delivers phantom-tool-only dispatch. FGAP-177 names the spec-doc as the outlier; FGAP-178 names the operational consequence: the capability-grant infrastructure landed via TASK-089/092 is no-op at runtime.

### A2. FEAT-005 "complete" but its core commitment is unmet

**FEAT-005** is status `complete` and declares `The subagent receives its OWN tools, JIT-composed per invocation, scoped to EXACTLY the operations the task needs`. FGAP-169/178 prove this is not true — subagents receive only the phantom-tool. The feature is marked complete but its defining acceptance criterion is unmet.

### A3. DEC-0047 enacted; capability-grant model's "exercise" path does not exist

**DEC-0047** enacted 2026-05-26 says grants are `clamped at dispatch` and `exercised by the agent`. The clamp executes (line 488), but the exercise path does not exist (tools discarded, line 568). The enacted decision describes a two-phase flow where only phase one exists.

---

## CATEGORY B: ENACTED-BUT-UNIMPLEMENTABLE (3 contradictions)

Decisions enacted with user authority describe resolution mechanisms that don't exist in the runtime.

### B1. DEC-0001 enacted but implementation prerequisite doesn't exist

| What | ID | Status | Says |
|------|-----|--------|------|
| Decision | **DEC-0001** | enacted | `Bare model ids resolve against the current session's configured provider via ExtensionContext` |
| Gap | **FGAP-115** | identified, P1 | `ExtensionContext does NOT expose currentModel / currentProvider fields. Grep across node_modules returns zero hits.` |
| Evidence | FGAP-115 evidence[0] | — | `node_modules/@earendil-works/pi-coding-agent/dist/types.d.ts: zero hits for currentModel or currentProvider` |

**Contradiction:** DEC-0001 says "resolve via ExtensionContext". FGAP-115 proves the field doesn't exist. The enacted decision's resolution mechanism is unimplementable as written. DEC-0001 consequence[3] anticipated this (`"If ExtensionContext does not currently expose currentModel, that becomes a prerequisite unblocker"`) — and that prerequisite has materialized.

### B2. DEC-0017 enacted but FGAP-032 confirms item-level selectivity still missing

| What | ID | Status | Says |
|------|-----|--------|------|
| Decision | **DEC-0017** | enacted | `pi-jit-agents' contextBlocks mechanism extends to item-level selectivity driven by gather-execution-context output` |
| Gap | **FGAP-032** | identified, P2 | `contextBlocks injection injects WHOLE BLOCKS — gets the entire decisions.json, not just decisions reached via gather-execution-context for THIS work-unit` |

**Contradiction:** DEC-0017 clause (4) describes item-level contextBlocks selectivity as part of the enacted plan. FGAP-032 (filed alongside DEC-0017 in the same cluster) documents that no such selectivity exists — injection is whole-block dumps. Both were filed 2026-05-10; DEC-0017 is enacted, FGAP-032 remains identified.

### B3. DEC-0008 "typed object form" enacted but FGAP-161/162 show raw JSON is still what agents receive

| What | ID | Status | Says |
|------|-----|--------|------|
| Decision | **DEC-0008** | enacted | `Typed object form of contextBlocks entries (name + optional item/focus/depth) is the canonical injection surface` |
| Gap | **FGAP-161** | identified, P2 | `contextBlocks whole-block injection is all-or-nothing raw JSON — no field projection, filtering, or pagination` |
| Gap | **FGAP-162** | identified, P2 | `depth field stored as metadata but render_recursive is not auto-applied` |

**Contradiction:** DEC-0008 describes a typed surface with projection/focus/depth semantics. FGAP-161/162 (filed 2026-05-30 from usage-feedback) show the actual behavior: `JSON.stringify(content, null, 2)` with no projection, and depth stored as unused metadata.

---

## CATEGORY C: TYPE-RUNTIME CONTRACT VIOLATIONS (4 contradictions)

The TypeScript type says one thing; the runtime does another.

### C1. AgentSpec.model is optional in type, required at dispatch

| Gap | **FGAP-157** | identified, P0 |
|------|-------------|----------------|
| Type | `packages/pi-jit-agents/src/types.ts:25` | `model?: string` |
| Runtime | `packages/pi-agent-dispatch/src/call-agent-tool.ts:83` | `if (!modelSpec) throw new Error('no model specified')` |

### C2. AgentSpec prompt fields: flat vs nested shape mismatch

| Gap | **FGAP-155** | identified, P0 |
|------|-------------|----------------|
| Type | `packages/pi-jit-agents/src/types.ts:21-37` | `systemPrompt?: string`, `systemPromptTemplate?: string` (top-level) |
| Parser | `packages/pi-jit-agents/src/agent-spec.ts:178-179` | `spec.prompt?.system`, `spec.prompt?.task` (nested under `prompt`) |

**Contradiction:** The TypeScript type and the YAML parser disagree on the shape.

### C3. resolvePromptField heuristic misclassifies inline prompts containing "/"

| Gap | **FGAP-153** | identified, P0 |
|------|-------------|----------------|
| Code | `packages/pi-jit-agents/src/agent-spec.ts:21` | `value.includes('/') && !value.includes('\n')` → classified as template path |
| Result | Usage feedback FB-001 | `"Read docs/03-solar-engine.md"` stored as `taskPromptTemplate` → ENOENT at dispatch |

### C4. output.format: text + tools[] passes validation but is broken

| Gap | **FGAP-168** | identified, P0 |
|------|-------------|----------------|
| Schema | AgentSpec shape (no mutual exclusion) | `output.format: text` + `tools: [read]` passes |
| Runtime | `jit-runtime.ts:566-570` | Tools only wired when `outputSchema` set (phantom-tool path); text-mode = no tools wired |
| Result | Usage feedback FB-018 | Model describes plan instead of invoking tools; zero tool calls |

---

## CATEGORY D: STATUS-LIFECYCLE INCOHERENCE (4 contradictions)

### D1. DEC-0001/0002/0003 enacted; FEAT-001 (their implementation) still proposed

| ID | Status | Notes |
|-----|--------|-------|
| **DEC-0001** | enacted (2026-05-26) | `Bare model ids resolve via ExtensionContext` |
| **DEC-0002** | enacted (2026-05-26) | `thinking-seam enforcement` |
| **DEC-0003** | enacted (2026-05-26) | `Move parseModelSpec to pi-jit-agents` |
| **FEAT-001** | **proposed** | `pi-jit-agents consumer migration arc` — the feature that implements all three |
| FEAT-001 stories (×9) | all **proposed** | |
| FEAT-001 tasks | 1 done, 26 **todo** | Only TASK-001-01 (verify ExtensionContext) is done |

**Contradiction:** Three decisions governing pi-jit-agents are enacted (user-authorized). Their implementation vehicle (FEAT-001) is still proposed with 96% of tasks in todo. Enacted decisions with zero implementation.

### D2. DEC-0048 says legacy bundled agents are NOT targets; FEAT-001 STORY-006 targets them

| ID | Says |
|-----|------|
| **DEC-0048** | `"zero existing workflows are to be considered targets of any work. that goes for their tests too... the workflow framework is the only target."` |
| **FEAT-001 acceptance_criteria[5]** | `"All five bundled classifier YAMLs in pi-behavior-monitors/agents/ align with DEC-0001 and DEC-0002"` |
| **FEAT-001 STORY-006** | `"Align bundled classifier YAMLs with decided policies"` — 5 tasks updating each classifier YAML |

**Contradiction:** DEC-0048 user directive says bundled agents are disposable, not targets. FEAT-001 STORY-006 explicitly targets them for alignment. DEC-0048 consequence[2] resolves toward `DISPOSABLE` but the story structure preserves the keep-and-align framing the decision rejects.

### D3. REVIEW-001 gates DEC-0001/0002/0003 but was never executed

| ID | Status | Notes |
|-----|--------|-------|
| **REVIEW-001** | not-started | `clean: false`, zero findings, targets `jit-agents-spec.md` |
| **DEC-0001** | enacted | lists REVIEW-001 as gate |
| **DEC-0002** | enacted | lists REVIEW-001 as gate |
| **DEC-0003** | enacted | lists REVIEW-001 as gate |
| **FEAT-001** | proposed | lists REVIEW-001 as gate |
| **PLAN-001 PHASE-3** | pending | `"Run design review of jit-agents-spec.md"` — dependent on PHASE-2 (in-progress) |

**Contradiction:** Three enacted decisions cite REVIEW-001 as a design-review gate (per PLAN-001 PHASE-3). REVIEW-001 was never executed — status `not-started`, zero findings, clean=false. Decisions enacted without their declared gate firing.

### D4. FGAP-032 "identified" but DEC-0017 "enacted" — gap describes missing piece of enacted design

See B2 above — same item from the status angle. DEC-0017 clause (4) enacted; FGAP-032 describes that clause as unimplemented. Both filed same day. One enacted, one still identified.

---

## CATEGORY E: CROSS-PACKAGE PATH/SURFACE DIVERGENCE (3 contradictions)

### E1. Two agent discovery paths: pi-workflows vs pi-jit-agents

| Item | Path |
|------|------|
| **issue-048** | `createAgentLoader() in pi-workflows/src/agent-spec.ts:141 searches .pi/agents/` — contradicts README declaration `.pi/ is Pi platform territory` |
| Additional issue (grep, ~issue-077 region) | `v0.24.x protocol: pi-jit-agents three-tier loader uses .project/agents/ → ~/.pi/agent/agents/ → builtin; pi-workflows still uses .pi/agents/` |
| **DEC-0049** | `ONE agent abstraction used uniformly across all consumers` |

**Contradiction:** DEC-0049 uniform-agent axiom says one agent abstraction. Two discovery paths exist in code — pi-workflows reads `.pi/agents/`, pi-jit-agents reads `.project/agents/` (three-tier). The v0.24.x protocol surfaced this empirically: fixture agents under `.project/agents/` were invisible to workflow dispatch.

### E2. DEC-0015 enacted; pi-jit-agents JSDoc still documents hardcoded `.project/` paths

| Gap | **FGAP-121** | identified |
|------|-------------|-----------|
| Decision | **DEC-0015** | `NO hardcoded substrate-dir paths anywhere in pi-context, pi-jit-agents, pi-workflows, pi-behavior-monitors source` |
| Evidence | FGAP-121 evidence[0] | `agent-spec.ts:210: '1. {cwd}/.project/agents/{name}.agent.yaml'` |
| Evidence | FGAP-121 evidence[1] | `types.ts:96: same hardcoded .project/ path` |
| Evidence | FGAP-121 evidence[2] | `template.ts:6: '1. {cwd}/.project/templates/'` |

**Contradiction:** DEC-0015 says zero hardcoded paths. FGAP-121 documents three pi-jit-agents source files with hardcoded `.project/` in JSDoc.

### E3. pi-jit-agents prompt field shape vs pi-agent-dispatch validation

| Gap | **FGAP-155** | identified, P2 |
|------|-------------|----------------|
| Author-time | `author-agent-spec` (pi-agent-dispatch) validates by round-tripping through `parseAgentYaml` | Shape-only validation |
| Gap text | `parseAgentYaml succeeds — the value is stored in systemPromptTemplate... structurally valid` | |
| Dispatch-time | `compileAgent → renderTemplateFile` fails with ENOENT | Semantic failure surfaces late |

**Contradiction:** `author-agent-spec` reports success for specs that hard-fail at dispatch. The validation gate's promise (round-trip succeeds = spec is dispatchable) is broken by the heuristic chain in FGAP-153/154.

---

## CATEGORY F: CAPABILITY-GRANT INFRASTRUCTURE DORMANCY (2 contradictions)

### F1. TASK-089/092 completed; infrastructure built but provides no runtime value

| Item | Status | Says |
|------|--------|------|
| **TASK-089** | completed 2026-05-27 | `composeToolGrant + 55-operation vocabulary` |
| **TASK-092** | completed 2026-05-29 | `Hybrid-3-v2 composite-tool infrastructure + author-tool-grant` |
| **FGAP-178** | identified, P1 | `Infrastructure operates correctly at orchestrator-tier but provides NO VALUE at agent dispatch — grants clamped then discarded` |

**Contradiction:** Engineering investment shipped in two completed tasks (composeToolGrant, 55-operation vocabulary, Hybrid-3-v2 composites, author-tool-grant Pi tool, dynamic per-config composites) but FGAP-178 documents the infrastructure is no-op at subagent dispatch. The `author-tool-grant` tool lets operators compose grants for subagents that no subagent can exercise.

### F2. FEAT-005 "complete" capability composition → no subagent can use composed capabilities

FEAT-005 is status `complete` and describes `operation-granular JIT capability composition`. The compose mechanism (composeToolGrant per TASK-089) exists. The delivery path (executeAgent wire to LLM) does not exist per FGAP-169. Capabilities are composed and then discarded.

---

## CATEGORY G: SCHEMA/VALIDATION GAPS (3 contradictions)

### G1. No JSON Schema for AgentSpec — TypeScript interface is the sole shape authority

| Gap | **FGAP-170** | identified |
|------|-------------|-----------|
| Current | `packages/pi-jit-agents/src/types.ts` | TypeScript `AgentSpec` interface — no JSON Schema counterpart |
| Contrast | `packages/pi-jit-agents/schemas/verdict.schema.json` | Bundled schema for monitor classification verdicts |
| Impact | `No AJV semantic validation; no canonical source for tooling consumers; schema-drift between TS type and actual YAML content undetected` | |

### G2. contextBlocks injection is all-or-nothing raw JSON despite typed-object semantics in type

| Gap | **FGAP-161** | identified, P2 |
|------|-------------|----------------|
| Source | `compile.ts:162` | `JSON.stringify(content, null, 2)` — every field, every item |
| Type | `types.ts` (AgentSpec) | `{ name, item?, focus?, depth? }` typed form |
| Gap | FGAP-161 body | `No projection (select specific fields), no filtering (where-clause), no pagination, no per-item macro-rendered option` |

**Contradiction:** The type accepts object-form contextBlocks but wrapBlockContent stringifies the whole block as raw JSON regardless.

### G3. outputSchema + outputFormat:text not mutually exclusive in any schema

| Gap | **FGAP-168** | identified, P0 |
|------|-------------|----------------|
| Current | No schema validation | `output.format: text` + `outputSchema` passes validation |
| Behavior | `jit-runtime.ts:566-570` | `outputSchema` set → phantom-tool forced, `output.format: text` ignored; or `output.format: text` + no `outputSchema` → tools never wired |

---

## SUMMARY TABLE

| # | Category | Items in conflict | Severity | Contradiction |
|---|----------|-------------------|----------|---------------|
| A1 | Canonical vs impl | FGAP-169 vs FEAT-005/006, DEC-0047, JI-029 | **P1** | Tools[] stripped at dispatch; phantom-tool only |
| A2 | Canonical vs impl | FEAT-005 (complete) vs FGAP-169/178 | **P1** | Feature "complete" but core commitment unmet |
| A3 | Canonical vs impl | DEC-0047 (enacted) vs FGAP-169 (tools discarded) | **P1** | Grant model: clamp exists, exercise path doesn't |
| B1 | Enacted unimplementable | DEC-0001 vs FGAP-115 | **P1** | ExtensionContext.currentModel doesn't exist |
| B2 | Enacted unimplementable | DEC-0017 vs FGAP-032 | **P2** | Item-level contextBlocks selectivity described as enacted but missing |
| B3 | Enacted unimplementable | DEC-0008 vs FGAP-161/162 | **P2** | Typed contextBlocks form described vs raw JSON dump delivered |
| C1 | Type-runtime | FGAP-157 (types.ts:25 vs call-agent-tool.ts:83) | **P0** | model optional in type, required at dispatch |
| C2 | Type-runtime | FGAP-155 (types.ts vs agent-spec.ts parser) | **P0** | Prompt fields: top-level vs nested shape mismatch |
| C3 | Type-runtime | FGAP-153 (agent-spec.ts:21 heuristic) | **P0** | Inline prompts with "/" misclassified as template paths |
| C4 | Type-runtime | FGAP-168 (text+tools structurally allowed) | **P0** | Output format text with tools[] silently produces no-op |
| D1 | Status lifecycle | DEC-0001/2/3 enacted vs FEAT-001 proposed | **High** | Enacted decisions with zero implementation |
| D2 | Status lifecycle | DEC-0048 (disposable) vs FEAT-001 STORY-006 (align) | **High** | Explicit user directive contradicted in story scope |
| D3 | Status lifecycle | REVIEW-001 not-started vs DEC-0001/2/3 enacted | **High** | Design review gate never fired; decisions enacted without it |
| D4 | Status lifecycle | DEC-0017 enacted vs FGAP-032 identified | **P2** | Gap filed same day as decision; decision enacted, gap open |
| E1 | Cross-package | issue-048 + v0.24 issue vs DEC-0049 | **High** | Two agent discovery paths; uniform-agent axiom violated |
| E2 | Cross-package | FGAP-121 vs DEC-0015 | **P3** | JSDoc hardcodes .project/ despite no-hardcode decision |
| E3 | Cross-package | FGAP-155 (author-agent-spec) vs FGAP-153 (heuristic) | **P2** | Author-time validation passes; dispatch-time fails |
| F1 | Infrastructure dormancy | TASK-089/092 (complete) vs FGAP-178 | **P1** | Capability infrastructure built but no-op at dispatch |
| F2 | Infrastructure dormancy | FEAT-005 (complete) + TASK-089 (complete) vs FGAP-169 | **P1** | Capability composition complete; no subagent can exercise it |
| G1 | Schema gap | FGAP-170 | **P2** | No AgentSpec JSON Schema — TS type is sole authority |
| G2 | Schema gap | FGAP-161 vs types.ts contextBlocks shape | **P2** | contextBlocks type accepts object form; injection is raw JSON |
| G3 | Schema gap | FGAP-168 (no mutual exclusion) | **P0** | text+tools/outputSchema+text not rejected at schema level |

**22 contradictions across 7 categories, spanning decisions, features, framework-gaps, issues, verification, spec-reviews, layer-plans, and the codebase.**