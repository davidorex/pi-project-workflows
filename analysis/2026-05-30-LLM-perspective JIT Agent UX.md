From my perspective as the orchestrating LLM, here is what equal-capability JIT agent tooling looks like.

---

## Discovery Surface

What pi-context gives me: `read-config`, `read-block`, `context-status`. I can see everything. I never guess.

What JIT agents would need:

### `list-agents`
Like `read-config block_kinds`. Returns every agent spec in the project tier with name, role, model, output format, context blocks, and a compile-status flag. I know what exists and whether it works.

### `list-dispatch-models`
Like `read-config` for models. Returns every `provider/modelId` pair available for dispatch with context windows and capabilities. I never guess a model string. Kills FB-007.

### `inspect-agent <name>`
Like `read-block-item`. Returns one agent's full spec, last dispatch timestamp, last dispatch status, cumulative token usage. I see the agent's health at a glance.

---

## Authoring Surface

What pi-context gives me: `write-schema` + `amend-config` + `write-block`. I define the shape, register it, populate it. Three tools, clear dependency order. If it writes, it validates.

What JIT agents would need:

### `author-agent-spec` (fixed)
Like `write-schema`. I pass a spec object. It validates against the canonical schema. It dry-runs compile. It checks the model exists. If it writes, the spec is dispatchable. Kills FB-001, FB-002, FB-003, FB-005, FB-006.

### `scaffold-agent-spec`
Like `/context init` but for agents. I pass a partial spec. It queries the model registry for valid model strings. It queries block kinds for context block options. It queries installed schemas for output schema options. It assembles a valid spec interactively. It calls `author-agent-spec` to persist. I never guess.

### `validate-agent <name>`
Like `context-validate`. I call it after authoring or after substrate changes. Returns compile status, model resolution, context block validity, prompt parsing status. One call, full health check.

---

## Dispatch Surface

What pi-context gives me: `read-block` returns data. `append-block-item` returns confirmation + the item. `context-status` returns structured state. I get data back, not summaries.

What JIT agents would need:

### `call-agent` (fixed)
Returns the agent's output as structured content, not a status summary. If the agent produces JSON with an output schema, I get parsed JSON. If text, I get the text. I also get token usage, model used, duration. I can process the output without grepping session logs. Kills FB-009, FB-015.

### `agent-trace <name> [limit]`
Like reading a session log but tool-native. Returns last N dispatches for an agent with input, output, token usage, model, duration, errors. I see the history without leaving the tool surface. Kills FB-016.

---

## Runtime Surface

What pi-context gives me: `context-validate` catches broken references. `context-current-state` derives next actions. Invariants fire on status checks.

What JIT agents would need:

### Dispatch linked to sessions
The session-notes block we created has `SESSION-NNN` entries. An agent dispatch should link to its session via `touched_blocks`. When I dispatch `spec-requirements-miner` during `SESSION-004`, the dispatch result references `SESSION-004`. I trace what happened when.

### Token budget per agent
Like `enforce-budget` but at the agent level. I set a token budget on the agent spec. Dispatch tracks cumulative usage. `inspect-agent` shows remaining budget. I don't accidentally burn tokens debugging.

### Compile-on-substrate-change
Like schema validation on block writes. If the substrate changes (block kind removed, schema changed), affected agents are flagged in `list-agents` as `compile-status: stale`. I know before dispatching that context blocks may be broken.

---

## The Flow I Want

```
1. list-dispatch-models                  → I see available models
2. scaffold-agent-spec {name, role}      → walks me through model, output, context blocks
                                           validates, writes, returns path
3. validate-agent spec-requirements-miner → clean, model resolves, 3 context blocks valid
4. call-agent spec-requirements-miner {doc: "docs/03-solar-engine.md"}
                                         → returns { output: [...], usage: { input: 486, output: 27 } }
5. append-block-item × N                 → I write the output to the substrate
6. inspect-agent spec-requirements-miner → last dispatch: success, 513 tokens, 2026-05-30T14:13Z
```

Same cadence as working with blocks: discover, author, validate, operate, inspect. No session log grep. No model string guessing. No discovering `prompt.system` vs `systemPrompt` at dispatch time. No zero-token dispatches reported as success.