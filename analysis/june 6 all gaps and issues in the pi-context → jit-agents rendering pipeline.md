Here's a comprehensive delineation of all gaps and issues in the pi-context → jit-agents rendering pipeline:

---

## A. ARCHITECTURAL: Two Divergent Compilation Paths

The most fundamental issue: there are **two separate compilation implementations** that do not share behavior.

| | Legacy (`pi-workflows/step-shared.ts`) | Modern (`pi-jit-agents/compile.ts`) |
|---|---|---|
| **Used by** | All workflow step execution (`step-agent.js`, `step-loop.js`) | `renderItemById` tool only |
| **contextBlocks type** | `string[]` only | `(string \| ContextBlockRef)[]` |
| **Anti-injection wrapping** | ❌ Raw JSON injected directly | ✅ `<context_block role="data">` wrapping + XML entity escaping |
| **Per-item resolution** | ❌ | ✅ `buildIdIndex` → resolved `ItemLocation` |
| **Budget enforcement** | ❌ | ✅ `enforceBudget` global + `budgetWarnings` collector |
| **Cross-ref recursion** | ❌ No globals | ✅ `resolve` / `render_recursive` globals |
| **Renderer registry** | ❌ | ✅ `createRendererRegistry` for macro dispatch |
| **Tool grant clamping** | ❌ | ✅ `compiled.tools ⊆ parentGrant` |
| **Traceable contextValues** | ❌ | ✅ Structured `contextValues` on `CompiledAgent` |

**Severity: High.** The main execution path uses the legacy implementation, so every agent dispatched by a workflow step gets no anti-injection boundaries, no budget enforcement, and no cross-reference recursion.

---

## B. LEGACY PATH GAPS

### B1. No anti-injection boundaries

```javascript
// Legacy: raw JSON straight into the prompt
ctx[ctxKey] = readBlock(cwd, name);  // Object or null

// Modern:
templateContext[baseKey] = wrapBlockContent(g.name, blockData);
// → <context_block name="decisions" role="data">...</context_block>
```

Block content is indistinguishable from instructions. A decision containing "ignore all previous instructions" is literal prompt injection.

### B2. No per-item resolution

`compileAgentSpec` only iterates string names — object-form `{name, item, depth, focus}` entries are silently mishandled (iterated as strings, producing garbage variable names).

### B3. No budget enforcement

Long-form block fields (decision context, rationale, gap details) can silently blow out the prompt window. No `x-prompt-budget` annotation honored, no truncation markers.

### B4. No cross-reference recursion

Templates cannot call `resolve("DEC-0001")` or `render_recursive(loc, 1)` — these globals are never registered. Per-item macros invoked by delegator macros have no recursion path.

### B5. No renderer registry

Whole-block delegator macros (`render_decisions`, `render_tasks`) only work when explicitly imported into the template. `render_recursive` dispatch through the registry is unavailable.

### B6. Silent null on missing blocks

Legacy catches read errors → `null`. Modern throws `AgentCompileError` for unresolvable item entries, giving clear failure attribution.

---

## C. MODERN PATH GAPS (pi-jit-agents `compileAgent`)

### C1. Per-item injected items are NOT macro-rendered

When you inject `{name: "decisions", item: "DEC-0001"}`, the template gets:

```nunjucks
{{ _decisions_item }}         {# raw JSON in <context_block> #}
{{ _decisions_items[0].raw }} {# unwrapped raw object #}
```

This is NOT rendered through `render_decision(dec, depth=1)`. It's the raw item as JSON, with no field formatting, no cross-reference inlining, no `enforceBudget` applied. The only way to get macro-rendered output is via the whole-block delegator macros, which iterate the entire block.

### C2. No declarative "render item X at depth N" surface

There is no `contextBlocks` form meaning "inject item DEC-0001 rendered through `render_decision` with depth=1." The `depth` and `focus` fields on `ContextBlockRef` are stored on the resolved array elements but **never consumed by any rendering path** — they sit inert on `_decisions_items[0].depth` / `.focus`.

### C3. Template validation doesn't recognize object-form variables

`pi-workflows/template-validation.js` computes context-block variables as:

```javascript
contextBlockVars.add(`_${blockName.replace(/-/g, "_")}`);
```

Only the `_<name>` form. The object-form surfaces (`_<name>_items`, `_<name>_item`, `_<name>_depth`, `_<name>_focus`) are unknown. If a template references these, validation falsely reports them as undeclared inputs.

### C4. Workflow SDK validation breaks on object-form entries

```javascript
// workflow-sdk.js:576 — treats every entry as a block filename
for (const blockName of agentSpec.contextBlocks) {
    const blockPath = path.join(projectDirPath, `${blockName}.json`);
    // Object entries crash here or produce garbage paths
}
```

### C5. pi-workflows type system is string[] only

```typescript
// pi-workflows/dist/types.d.ts
contextBlocks?: string[];

// pi-jit-agents/dist/types.d.ts  
contextBlocks?: (string | ContextBlockRef)[];
```

The type that workflow steps and validation consume doesn't acknowledge `ContextBlockRef`.

---

## D. CROSS-CUTTING GAPS

### D1. `resolve` global is single-substrate only

```javascript
// compile.js: resolve() uses buildIdIndex(cwd).byRefname
env.addGlobal("resolve", (id) => getIdIndex().get(id) ?? null);
```

No cross-substrate resolution. `<alias>:<refname>` sentinels, structured endpoints with `substrate_id` — none of pi-context's `resolveRef(cwd, ref)` classification (active/foreign/dangling/unregistered) is available to templates. The `render-id-list` helpers in `render-helpers.md` pass IDs to `resolve()` and silently fall back to bare-ID text on a miss — they cannot handle foreign substrate references.

### D2. No closure-table edge injection

`contextBlocks` injects block file contents. There is no surface for injecting `relations.json` edges, lens-derived groupings, or any derived relational state. An agent that needs "all tasks depending on TASK-0001" must read relations.json manually or have edges injected via input — there's no `contextBlocks` path for it.

### D3. No dynamic item scoping

`contextBlocks` entries are statically authored in the agent spec. There's no way to declare "all items matching predicate X" (e.g., "all open tasks in phase 3"). You either get the whole block or one explicit ID.

### D4. `INJECTED_VARIABLES` is incomplete

```javascript
const INJECTED_VARIABLES = new Set(["output_schema", "loop"]);
```

Template validation treats ONLY these two as auto-injected. Every `_<blockName>` and `_<blockName>_items`/`_item`/`_depth`/`_focus` surface is unknown to the validator.

### D5. Depth/focus hints are dead data

`ContextBlockRef.depth` and `.focus` flow through to `_decisions_depth` / `_decisions_focus` template variables, but no rendering pipeline consumes them:
- Whole-block delegator macros (`render_decisions`) always call `render_decision(d, depth=0)` — depth is hardcoded
- Per-item macros in templates honor their `depth` parameter, but nothing connects the injected `_decisions_depth` to the macro invocation
- `focus` fields have no consumer at all — the renderer registry has no focus-aware resolution

### D6. Renderer registry is block-kind-granular, not focus-granular

`registry.lookup(blockKind)` resolves one macro per block kind. A `focus: {story: "STORY-001"}` hint on a decision has no effect on which macro or how the item is rendered.

### D7. No budget awareness at the legacy compilation layer

Even if workflows migrated to `compileAgent`, there's no workflow-level budget policy — no global prompt budget, no per-step allocation, no rejection on over-budget compilation. `budgetWarnings` are collected but surfaced only on the `CompiledAgent` struct — the workflow executor doesn't inspect or react to them.

---

## Summary Matrix

| Gap | Path | Severity | Effect |
|---|---|---|---|
| Two divergent compilation paths | Architectural | **High** | Most features only exist in the unused path |
| No anti-injection wrapping | Legacy | **High** | Prompt injection surface for all workflow agents |
| No budget enforcement | Legacy | **Medium** | Prompt window blowout from long block fields |
| No cross-ref recursion | Legacy | **Medium** | References stay as bare IDs, no inline context |
| Per-item items not macro-rendered | Modern | **Medium** | `_decisions_item` is raw JSON, not formatted |
| Depth/focus are dead data | Both | **Medium** | Declared hints never reach rendering logic |
| `resolve` is single-substrate | Both | **Medium** | No `<alias>:<refname>` resolution in templates |
| Type system mismatch | Cross-cutting | **Medium** | pi-workflows thinks `string[]`, pi-jit-agents has `ContextBlockRef` |
| Template validation incomplete | Legacy | **Low** | False "undeclared variable" errors or silent misses |
| No edge/relation injection | Both | **Low** | Agents can't get derived relational state via contextBlocks |
| No dynamic scoping | Both | **Low** | All-or-one-item granularity, no predicate-based injection |