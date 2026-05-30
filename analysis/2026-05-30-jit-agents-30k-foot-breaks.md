## jit-agents at 30K feet — 8 structural breaks

**1. The tools[]-declarative-only axiom is invisible** (FGAP-169 — biggest break)
Authors write `tools: [read, append-block-item]` expecting the framework to invoke them. The framework does not. `executeAgent` is single-turn; multi-turn agentic loops are orchestrator-side. Every tool-using agent author has the wrong mental model, and the framework's surface advertises the field without disclaiming the semantics. Invalidates every existing tool-using agent spec authored under the natural assumption.

**2. The AgentSpec shape is inconsistent across layers** (FGAP-156/170/171)
TS type declares top-level `systemPrompt`/`taskPrompt`. YAML parser reads nested `prompt.system`/`prompt.task`. `author-agent-spec` writes a third shape. No canonical JSON Schema exists. Inline-vs-template fields are parallel optional with no mutual-exclusion. The "validation" is round-trip parse, not declarative. Result: write a spec, get success, dispatch fails late with cryptic error.

**3. Model-resolution is structurally wrong** (FGAP-115/157/158 + FB-006)
- `parseModelSpec` lives in `call-agent-tool` (caller layer), should be at `executeAgent` boundary per DEC-0003
- Bare model ids silently default to `anthropic` with no fallback to session-configured provider
- ExtensionContext doesn't expose `currentModel`/`currentProvider` (FGAP-115 blocks TASK-085/087)
- Type says `model?` optional; runtime requires it
- No tool to discover valid model strings
Multiple layers wrong simultaneously.

**4. Validation gates are false-positives** (FGAP-155/167/174)
`author-agent-spec` reports success while writing corrupt specs. AJV errors reference array indices not item ids. No semantic validation (template paths exist, schema refs resolve, contextBlocks names valid). The framework's own affirmation is unreliable.

**5. Dispatch is observability-blind** (FGAP-160/165/166)
Agent output buried in `details` metadata, not `content` array. Zero-token responses report as success. No tool to query dispatch history. Orchestrator must grep `.pi/agent/sessions/*.jsonl` to see what happened. The framework can succeed and produce nothing without telling anyone.

**6. Capability-grant is a type-vs-runtime trap** (FGAP-159)
`parent_grant`/`requested_grant` are type-optional but functionally required when the agent declares tools. Defaults are empty arrays = no tools dispatched = grant violation. No fallback from caller's ExtensionContext tool set. The tool surface as documented can't be used without explicit grants the type doesn't require.

**7. Agent-layer authoring surface is asymmetric to substrate-layer** (FGAP-163/164/174/175)
Substrate side has `author-block`, `write-schema`, `amend-config`, `file-block-item`. Agent layer has only `author-agent-spec`. Missing: `author-macro` (blocks FGAP-119 dogfood), `author-context-contract`, `author-grant`, agent-spec scaffold tool. Authors must hand-write `.pi/templates/items/<kind>.md` and `CTX-NNN` entries the framework could derive from schema.

**8. contextBlocks injection is not expressive enough** (FGAP-161/162)
Whole-block bare-string form injects entire block JSON. Single-item object form stores `depth` but `render_recursive` is opt-in via manual template invocation. Authors get raw JSON when they wanted projected fields or rendered output. Token cost scales with block size, not agent need.

---

**Cross-cutting:** The framework has a robust substrate layer (pi-context: schemas, migrations, attestation, auth-gate, validation, lenses, closure-table) but the agent layer (pi-jit-agents + pi-agent-dispatch) is missing analogous canonical surfaces. The substrate layer made `author-block` / `write-schema` / `file-block-item` first-class. The agent layer treats most of its concerns as implicit — heuristic prompt classification, hardcoded provider defaults, manual macro/contract authoring, opaque dispatch results, declarative-only tools[] without execution. The breaks are mostly symptoms of agent-layer incompleteness relative to substrate-layer canon.

The fix is not many small patches but **agent-layer parity with substrate-layer**: explicit canonical surfaces for each concern (model resolution, prompt classification, grant defaults, dispatch observability, macro authoring, context-contract derivation, tools[] semantics documentation, AgentSpec schema). 26 FGAPs filed during this session map the territory.