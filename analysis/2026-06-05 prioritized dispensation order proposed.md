Here's the prioritized dispensation order:

---

## 1. UNIFY THE `AgentSpec` TYPE AND PARSER
**Why first:** Every downstream fix touches the agent spec contract. Two packages currently parse `.agent.yaml` into incompatible shapes (`promptTemplate` vs `systemPromptTemplate`, `string[]` vs `(string|ContextBlockRef)[]`). Without a single source of truth, any feature added to one path is invisible to the other. This is the **root of all type-level divergence**.

Depends on nothing. Unblocks everything below.

---

## 2. MIGRATE WORKFLOW STEPS FROM `compileAgentSpec` TO `compileAgent`
**Why second:** This is the **critical architectural convergence**. All high-severity gaps (no anti-injection, no budget enforcement, no cross-ref recursion) exist because workflow execution uses the legacy path. `compileAgent` already exists and is tested — it's used by `renderItemById`. The work is wiring it into `step-agent.js` and `step-loop.js`.

Requires #1 (unified types). Unlocks #3, #4, #5, #6.

---

## 3. ADAPT SUBPROCESS DISPATCH TO CONSUME `CompiledAgent`
**Why third:** `compileAgent` returns a `CompiledAgent` struct with `systemPrompt`/`taskPrompt`. The legacy `compileAgentSpec` mutates the spec in-place (`taskTemplate` → rendered string). `buildPrompt()` expects the legacy shape. The dispatch pipeline must be updated to accept `CompiledAgent` output — specifically, passing `compiled.taskPrompt` as the subprocess prompt and `compiled.systemPrompt` as `--append-system-prompt`.

Requires #2. Gating for all compile-time features reaching the subprocess.

---

## 4. ANTI-INJECTION BOUNDARIES FOR ALL WORKFLOW AGENTS
**Why fourth:** This is the **highest-impact individual fix**. Every workflow agent currently receives raw block JSON indistinguishable from instructions. After #2+#3, `compileAgent`'s `<context_block role="data">` wrapping + XML entity escaping applies to all agents automatically — no per-agent template changes needed.

Requires #2, #3. Zero template changes. Automatic coverage.

---

## 5. BUDGET ENFORCEMENT FOR ALL WORKFLOW AGENTS
**Why fifth:** After anti-injection, this is the next universal safety net. Long-form fields (decision context, rationale, gap details) silently blow prompt windows today. After #2, `compileAgent`'s `enforceBudget` global is registered on every agent's template env, and `x-prompt-budget` annotations on schemas are honored automatically. `budgetWarnings` collection on `CompiledAgent` should be surfaced through workflow step warnings.

Requires #2, #3. Schema authors get budget enforcement on all agents with no template changes.

---

## 6. MAKE PER-ITEM `contextBlocks` ENTRIES MACRO-RENDERED
**Why sixth:** The `{name, item, depth}` object form currently injects raw XML-wrapped JSON. It should instead render through the per-item macro (`render_decision(dec, depth)`). This makes single-item contextBlocks actually useful — formatted output with cross-reference inlining and budget enforcement. Currently, `_decisions_item` is unusable without manual template iteration.

Requires #2 (compileAgent wired). Changes: in `compileAgent`, after resolving the item via `buildIdIndex`, dispatch through `dispatchInlineMacro` instead of `wrapItemContent`. Expose the rendered string as `_decisions_item` and the raw as `_decisions_item_raw`.

---

## 7. WIRE `depth` AND `focus` THROUGH RENDERING
**Why seventh:** These fields are declared in `ContextBlockRef`, flow into template variables (`_decisions_depth`, `_decisions_focus`), but are consumed by nothing. After #6, `depth` naturally controls cross-reference recursion. `focus` needs a consumer — the simplest path: pass it to the per-item macro as a parameter, letting template authors use `{% if focus.story %}...{% endif %}` in per-item macros.

Requires #6. Makes `ContextBlockRef` fully functional.

---

## 8. MAKE `contextBlocks` DECLARABLE ON STEP SPECS (NOT JUST AGENT SPECS)
**Why eighth:** Currently `contextBlocks` is static per agent. A workflow author can't say "inject these specific blocks for this invocation." Adding `contextBlocks` to `StepSpec` (merged with agent-level declarations, step-level overriding) makes context injection per-invocation.

Requires #1 (type changes). Independent of #2-#7.

---

## 9. CROSS-REFERENCE RECURSION FOR ALL AGENTS
**Why ninth:** After #2, `resolve` and `render_recursive` globals are registered on all agent template envs. Per-item macros already have `depth` parameters and `render_id_list_block` helpers that call `resolve`/`render_recursive` when `depth > 0`. The infrastructure exists — it just needs the `rendererRegistry` passed through from `compileAgent`. This is nearly free after #2.

Requires #2, #3. Agents automatically get cross-reference inlining when templates pass `depth > 0`.

---

## 10. TEMPLATE VALIDATION AWARE OF MODERN VARIABLES
**Why tenth:** `template-validation.js` treats `contextBlockVars` as only `_<name>`. After #2, object-form entries produce `_<name>_items`, `_<name>_item`, `_<name>_depth`, `_<name>_focus`. The validator must recognize these to avoid false "undeclared variable" errors.

Requires #2 (actual usage) but can be done in parallel after #1.

---

## 11. CLOSURE-TABLE EDGE INJECTION
**Why eleventh:** A new `contextBlocks` form or step-level mechanism to inject derived relational data (edges for an item, lens groupings). Enables agents to receive "all tasks depending on TASK-0001" without manual `relations.json` reads. Depends on no prior fix, but lower impact than the safety/convergence items above.

---

## 12. REMAINING VALIDATION + SDK GAPS
Fixes for: workflow SDK validation of object-form entries, `INJECTED_VARIABLES` expansion, `validateContext()` call during execution, cross-substrate `resolveRef` in templates. All are independent, low-to-medium impact, and can be done in parallel after #1.

---

### Why this order?

**#1–#3 converge the architecture.** Everything else is feature work on a unified foundation. Without these, you're adding features to two divergent paths and doubling the work.

**#4–#5 are safety.** Prompt injection and budget blowout are runtime hazards affecting every agent today. They're fixed automatically by the convergence in #2.

**#6–#7 make existing features work.** The object-form `contextBlocks` and `depth`/`focus` fields were built but never connected end-to-end. These are "finish the feature" items, not new features.

**#8–#11 are new capability.** Per-invocation context, cross-reference recursion (free after #2), edge injection — these expand what's possible but nothing is broken without them.

**#12 is cleanup.** Validation improvements, edge cases, dead code removal.