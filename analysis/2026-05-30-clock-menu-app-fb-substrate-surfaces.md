# Investigation: Substrate Surfaces Falling Short — FB-010/011/012/013/014/017

**Date:** 2026-05-30  
**Context:** Six feedback items documenting substrate surface deficiencies adjacent to FEAT-001 template-relocation arc and TASK-093 completion.

---

## FB-010: contextBlocks Whole-Block Injection Is All-or-Nothing Raw JSON

**Surface confirmed:**

```typescript
// packages/pi-jit-agents/src/compile.ts:162
function wrapBlockContent(blockName: string, content: unknown): string {
  const rendered = typeof content === "string" ? content : JSON.stringify(content, null, 2);
  return [
    `<context_block name="${escapeXmlText(blockName)}" role="data">`,
    escapeXmlText(rendered),
    `</context_block>`,
  ].join("\n");
}
```

**Root cause:**  
The bare-string entry in contextBlocks (e.g., `contextBlocks: ['requirements']`) calls wrapBlockContent with the entire block's JSON payload. No filtering, projection, depth limiting, or per-item macro rendering is applied. The full object is stringified regardless of agent needs.

**Fix layer:** Schema + tool surface (DEC-007 layer: schema / tool contracts; Mandate-004 applies).

**Related substrate:**
- FEAT-001 (agent-template assets relocation; array_key column added to CANONICAL_MACRO_NAMES 2026-05-28; established per-item injection foundation).
- CANONICAL_MACRO_NAMES in renderer-registry.ts:101-118 — now carries `array_key` field (added in FEAT-001) mapping block kind to its schema's actual data key (`work-orders → work_orders`, `framework-gaps → gaps`, etc.).
- No existing FGAP or DEC prescribes projection/filtering surface for contextBlocks.

---

## FB-011: contextBlocks Single-Item Injection Is Raw JSON — render_recursive Must Be Called Explicitly

**Surface confirmed:**

```typescript
// packages/pi-jit-agents/src/compile.ts:460,469
const wrapped = wrapItemContent(ref.name, itemId, loc.item);
arrayElems.push({
  item: wrapped,
  raw: loc.item,
  depth: ref.depth ?? 0,
  focus: ref.focus ?? null,
  id: itemId,
  name: ref.name,
});
```

```typescript
// packages/pi-jit-agents/src/compile.ts:180-187
function wrapItemContent(blockName: string, itemId: string, content: unknown): string {
  const rendered = typeof content === "string" ? content : JSON.stringify(content, null, 2);
  return [
    `<context_block name="${escapeXmlText(blockName)}" item="${escapeXmlText(itemId)}" role="data">`,
    escapeXmlText(rendered),
    `</context_block>`,
  ].join("\n");
}
```

**Root cause:**  
Object-form entries `{ name, item, depth }` store the depth field on the array element but do NOT auto-trigger per-item macro rendering. The template receives raw JSON wrapped in XML. The `depth` metadata is present but unused; template author must call `render_recursive(resolve(id), depth)` explicitly. Per-item macros (Plan 6, 7, 8) exist but are opt-in only via explicit template invocation.

**Fix layer:** Tool surface (auto-apply render_recursive when depth is specified; DEC-007).

**Related substrate:**
- Same as FB-010: FEAT-001 established per-item macro infrastructure; array_key enables automation.
- render_recursive is available in template context but not auto-invoked.

**Cross-cut with FB-010:**  
FB-010 + FB-011 form one family: "contextBlocks injection is not expressive enough." Both surface the same gap: contextBlocks is all-or-nothing raw JSON; there is no filtering, projection, or (in FB-011's case) auto-rendering. The canonical fix for the family is: (a) make projection explicit via optional `fields: [...]` on bare-string form; (b) auto-apply `render_recursive` when `depth > 0` on object form; (c) document both in schema / tool description.

---

## FB-012: No Tool to Author Per-Item Macros for Custom Block Kinds

**Surface confirmed:**

```typescript
// packages/pi-jit-agents/src/renderer-registry.ts:134
const projectDir = path.join(cwd, ".pi", "templates");

// Full three-tier discovery at renderer-registry.ts:10-13:
// 1. Project: <cwd>/.pi/templates/items/<kind>.md
// 2. User:    <userDir ?? ~/.pi/agent/templates>/items/<kind>.md
// 3. Builtin: <builtinDir>/items/<kind>.md (only when builtinDir is set)
```

The registry looks up `.pi/templates/items/<kind>.md` files but provides no tool to create them. Custom block kinds with custom fields (e.g., `hour_system`, `traces_to_spec_doc` on requirements) cannot be rendered with custom macros — only builtin `render_requirement` is available, which ignores custom fields.

**Root cause:**  
FEAT-001 completed the three-tier macro discovery and CANONICAL_MACRO_NAMES registration for 14 shipped kinds, but no tool surface exists to author per-item macros. Builtin macros are hardcoded; custom macros require filesystem access outside the substrate.

**Fix layer:** Tool surface (equivalent to `author-agent-spec` or `write-schema`; DEC-007).

**Related substrate:**
- FEAT-001 (template relocation completed 2026-05-28; delivered 6 whole-block delegators + CANONICAL_MACRO_NAMES with array_key column).
- TASK-093 (template relocation, completed 2026-05-29; landed agent-template assets at pi-jit-agents; established bundledTemplateDir pattern).
- DEC-0049 (6th consequence: "Agent-template assets live at pi-jit-agents per uniform-agent axiom; consumers resolve through 3-tier template search rooted at pi-jit-agents").
- FGAP-119 (dogfood composites; TASK-091 noted out-of-scope: "requires this TASK-091 already merged so author-tool-grant is reachable"; analogous scope-deferred gap — authoring custom macros should follow the same human-writer tool surface pattern as agent specs).

**Discovered gap within scope:**  
The FEAT-001 arc (6 whole-block delegators) + TASK-093 (template relocation) created the infrastructure for per-item macros but did not create an authoring tool. The gap FB-012 directly names is precisely what FEAT-001 surfaced: custom block kinds now exist in substrates (clock-menu-app uses custom `hour_system` field), and the renderer registry is ready to resolve custom macros, but there is no tool to create them.

---

## FB-013: gather-execution-context Requires Hand-Authored context-contract Entry

**Surface confirmed:**

```typescript
// packages/pi-context/src/execution-context.ts:172
  return { error: `no context-contract for kind: ${args.kind}` };
```

The gatherExecutionContext function (lines 143+) reads:
1. The unit by `unitId` from the cross-block index.
2. The context-contract entry matching `kind` (unit_kind field).
3. Each declared `relation_type` in the contract, walking bidirectionally.

Without a matching context-contract entry, it returns error immediately.

**Root cause:**  
Context contracts are not auto-generated from schema. Authors must manually create a CTX-NNN entry in the context-contracts block before calling gather-execution-context. The schema defines what relations a kind participates in, but the framework does not synthesize a default context-contract from that schema.

**Fix layer:** Schema + tool surface (analogous to render_recursive auto-derivation; DEC-007).

**Related substrate:**
- No existing FGAP or DEC explicitly defers auto-derivation of context-contracts.
- gatherExecutionContext design (execution-context.ts lines 1-50) notes DEC-0017 and DEC-0019 dual-surface pattern; dual surface exists (library + pi tool + orchestrator script) but requires hand-authored contracts as the data layer.

**Cross-cut with FB-012:**  
FB-012 + FB-013 form one family: "framework expects user to hand-author canonical artifacts the framework could derive." Both surface the same pattern: (a) custom macros require hand-authored .pi/templates/items/<kind>.md files; (b) context-contracts require hand-authored CTX-NNN entries. The canonical fix for the family is: auto-generate both from schema + provide human-friendly override tools (author-macro, author-context-contract) that shield the user from knowing the location/format if they want to override.

---

## FB-014: run-work-order-loop Hard-Depends on work-orders Block — Inaccessible After Substrate Pruning

**Surface confirmed:**

```typescript
// packages/pi-agent-dispatch/src/work-order-loop.ts:46
super(`work-order-loop: work-order '${workOrderId}' not found in work-orders block`);

// ... line ~50+
const data = readBlock(cwd, "work-orders") as { work_orders: WorkOrderRecord[] };
```

The run-work-order-loop tool (run-work-order-loop-tool.ts:1-57) loads work orders by calling `readBlock(cwd, "work-orders")`. If the work-orders block kind is not installed in the substrate, readBlock throws.

**Root cause:**  
The loop couples to a specific block kind (work-orders) rather than accepting work orders as direct input. The dependency is hard-coded in the readBlock call. When substrates intentionally prune block kinds, the tool becomes inaccessible.

**Fix layer:** Tool surface (DEC-0014 boundary; Mandate-004).

**Related substrate:**
- TASK-088 (FEAT-006 decomposition 1/4 — define work-order block kind; completed 2026-05-28).
- TASK-091 (FEAT-006 decomposition 4/4 + launch-chain integration; completed 2026-05-29).
- TASK-092 (FEAT-010 composite infrastructure; completed 2026-05-29).
- run-work-order-loop tool description (run-work-order-loop-tool.ts:1-15): "The orchestrator names a work-order id (loaded from .project/work-orders.json per TASK-088 schema)".

**Substrate overlap note:**  
TASK-088 / TASK-091 / TASK-092 completed; work-order-loop.ts was delivered as part of TASK-091. The design explicitly couples to the work-orders.json file as the source of truth. This is correct per TASK-088 schema definition. However, the coupling means removing the block kind also removes the tool — no workaround exists in the current surface (e.g., no `--work-order` inline parameter to run-work-order-loop).

---

## FB-017: AJV Error References Array Index, Not Item ID

**Surface confirmed:**

```typescript
// packages/pi-context/src/schema-validator.ts:82-93
export class ValidationError extends Error {
  readonly label: string;
  readonly errors: ErrorObject[];

  constructor(label: string, errors: ErrorObject[]) {
    const details = errors.map((e) => `${e.instancePath || ""}: ${e.message}`).join("; ");
    super(`Validation failed for ${label}: ${details}`);
    this.name = "ValidationError";
    this.label = label;
    this.errors = errors;
  }
}
```

When AJV validation fails on a block item, the error message includes `e.instancePath`, which is a JSON Pointer path (e.g., `/feedback/10`) referencing the array index, not the item's id field. Debugging requires manual cross-reference.

**Root cause:**  
AJV reports violations as JSON Pointer paths (per JSON Schema spec). The schema validator formats these paths as-is. No enhancement layer enriches the error to include the item's `id` field when present. The error remains at the JSON structural level rather than the semantic level.

**Fix layer:** Tool surface / error formatting (DEC-007).

**Related substrate:**
- No existing DEC or FGAP prescribes enriched error formatting for block validation.
- Observation-severity: this is friction, not a blocker — the error is correct, just requires counting.

---

## Cross-Cutting Synthesis

### Family 1: contextBlocks Injection Expressiveness (FB-010 + FB-011)

Both surface the same gap: **contextBlocks injection is all-or-nothing raw JSON.**

- **FB-010** (whole-block bare-string form): Full block JSON is injected; no filtering or projection.
- **FB-011** (single-item object form): Raw item JSON is injected; depth field is present but `render_recursive` is NOT auto-applied.

**Canonical fix:**
1. **Bare-string form** (`contextBlocks: ['requirements']`): Add optional `fields: [...]` projection and `depth: N` (triggers auto-render_recursive).
   - Schema: `{ name: string, fields?: string[], depth?: number }` (bare-string remains as sugar for `{ name }`).
   - Implementation: wrapBlockContent reads the optional fields array; compileAgent auto-applies render_recursive when depth > 0.

2. **Object form** (`{ name, item, depth }`): Auto-apply `render_recursive` when depth > 0.
   - Implementation: Modify compile.ts line ~469 to detect depth > 0 and wrap the returned item with a render_recursive invocation.

3. **Documentation:** Tool description + schema comment clarify that contextBlocks receives one of: (a) bare string (whole block, no projection), (b) `{ name, fields, depth }` (single item, projected fields, auto-rendered if depth > 0).

### Family 2: Hand-Authored Artifacts (FB-012 + FB-013)

Both surface the same pattern: **framework expects user to hand-author canonical artifacts the framework could derive.**

- **FB-012** (per-item macros): Custom block kinds require hand-authored .pi/templates/items/<kind>.md files; builtin macro doesn't render custom fields.
- **FB-013** (context-contracts): gather-execution-context requires hand-authored CTX-NNN entries; contract could be auto-derived from schema.

**Canonical fix:**
1. **Per-item macros (FB-012):**
   - Add `author-macro` Pi tool (symmetric to `author-agent-spec`, `write-schema`).
   - Tool reads the target block kind's schema, suggests default macro body covering all fields, writes to .pi/templates/items/<kind>.md.
   - Human can then edit to customize rendering (e.g., skip internal fields, render custom fields in special ways).

2. **Context-contracts (FB-013):**
   - Add `author-context-contract` Pi tool or extend gather-execution-context to accept an optional auto-derive flag.
   - Tool/flag synthesizes default contract from schema: includes all relation_types the kind participates in, default depth 1.
   - Human can then author overrides via author-context-contract if defaults are wrong.

3. **Scope order:** These should follow the same human-writer pattern as author-agent-spec + author-tool-grant (TASK-089/092). Deliver after the orchestrator launch script is stable (post-TASK-091).

---

## Discovered Gaps (Mandate-7 Surfacing)

Beyond the six explicit FBs, the investigation uncovered:

1. **FB-012 adjacency to FEAT-001 not surfaced as a gap until now.**
   - FEAT-001 delivered template-relocation + array_key column + six whole-block delegators (2026-05-28).
   - TASK-093 delivered template assets relocation to pi-jit-agents (2026-05-29).
   - Together, they established the infrastructure for per-item macros to work.
   - The gap (no tool to author custom macros) was implicit in the feature description but should have been explicitly listed as a follow-on task in FEAT-001's scope or decomposed into a new task (authoring custom macros = critical for dogfood).
   - **Corrective action:** Add TASK-095 (author-macro tool) as a high-priority follow-on to FEAT-001. Block FGAP-119 (dogfood composites) on TASK-095 completion, since custom macros are required to render custom fields in custom substrates.

2. **FB-013 + gatherExecutionContext design has no explicit auto-derivation story.**
   - gatherExecutionContext.ts header (lines 1-50) documents the pattern: read unit + read contract + walk relations.
   - The contract-read failure is explicitly handled as an error case (line 172).
   - But there is no DEC or FGAP stating whether auto-derivation is intended as a future optimization or deferred indefinitely.
   - **Corrective action:** Add FGAP-124 (auto-derive default context-contracts from schema) and TASK-096 (author-context-contract tool + optional auto-derive flag in gatherExecutionContext). Scope after TASK-095.

3. **FB-014 + TASK-091 design couples loop to work-orders block.**
   - This is intentional per TASK-088 schema definition (work-orders is the canonical source).
   - But the coupling makes the loop inaccessible after intentional substrate pruning.
   - **Corrective action:** Document in run-work-order-loop tool description that the work-orders block kind MUST be installed. Optionally add a `--inline` variant that accepts work order JSON directly (post-TASK-091 follow-on if users request it).

4. **FB-017 error formatting is low-friction but could improve developer experience.**
   - AJV errors reference array indices; enriching to include item id (if present) would reduce debugging time.
   - This is a schema-validator-module enhancement (ValidationError.constructor at line 86-87).
   - **Corrective action:** Low priority; add as TASK-097 (enhance ValidationError to include item id when available) after core features stabilize.

---

## Mandate-004 Fix-Layer Verdicts

| FB ID | Fix Layer | Verdict |
|-------|-----------|---------|
| FB-010 | Schema + tool surface | **Schema:** Extend contextBlocks entry to support `fields[]` projection + `depth` (triggers auto-render). **Tool:** compileAgent auto-applies render_recursive when depth > 0. |
| FB-011 | Tool surface | **Modify compile.ts:** Auto-apply render_recursive when depth > 0 on object-form entries. |
| FB-012 | Tool surface | **New tool:** author-macro (symmetric to author-agent-spec). Reads block schema, generates default macro, writes to .pi/templates/items/<kind>.md. Block FGAP-119 on completion. |
| FB-013 | Schema + tool surface | **New tool:** author-context-contract (symmetric to author-agent-spec). Reads block schema, generates default contract (all relation_types, depth 1). Optional auto-derive flag in gatherExecutionContext. |
| FB-014 | Tool surface (documentation) | **Document:** Tool description states work-orders block kind MUST be installed. Optional follow-on: --inline variant accepting work order JSON directly. |
| FB-017 | Tool surface (error formatting) | **Enhance ValidationError:** Include item id in error message when id field is present in the violated item. Low priority; TASK-097 post-stabilization. |

---

## Substrate-Overlap Matrix

| FB ID | Related Items | Overlap Type |
|-------|--------------|--------------|
| FB-010 | FEAT-001, DEC-0049, TASK-093 | FEAT-001 delivered array_key foundation; DEC-0049 axiom confirms agent-template assets location; TASK-093 landed template relocation. All three enable per-item rendering; FB-010 surfaces the expressiveness gap. |
| FB-011 | FEAT-001, TASK-093 | Same as FB-010: infrastructure is ready; render_recursive exists but is not auto-applied. |
| FB-012 | FEAT-001, TASK-093, DEC-0049, FGAP-119 | FEAT-001 + TASK-093 established three-tier macro discovery + CANONICAL_MACRO_NAMES. DEC-0049 confirms template assets at pi-jit-agents. FGAP-119 (dogfood composites) blocks on ability to author custom macros. FB-012 is the blocking gap. |
| FB-013 | TASK-036, TASK-037, DEC-0017, DEC-0019 | gatherExecutionContext library exists; DEC-0017/0019 specify dual-surface pattern. Contract-read failure is handled but not auto-derived. No scope-owning FGAP. |
| FB-014 | TASK-088, TASK-091, TASK-092, DEC-0014 | TASK-088 defined work-order block schema. TASK-091/092 delivered run-work-order-loop tool. DEC-0014 governs orchestrator boundaries. Coupling to work-orders block is intentional per TASK-088; FB-014 surfaces the accessibility tradeoff. |
| FB-017 | No direct overlap | Observation-level; affects all block validation. Low friction; low priority. |

---

## Discovered-Gaps Summary

**Count:** 4 new scope-clarifications + 1 low-priority enhancement.

1. **TASK-095 (author-macro tool)** — blocks FGAP-119; unblocks dogfood custom-field rendering.
2. **FGAP-124 (auto-derive context-contracts)** — documents deferred optimization.
3. **TASK-096 (author-context-contract tool)** — completes gather-execution-context ergonomics.
4. **Run-work-order-loop documentation** — clarify mandatory work-orders block; optional --inline follow-on.
5. **TASK-097 (ValidationError enrichment)** — low priority; post-stabilization.

**Report location:** `/Users/david/Projects/workflowsPiExtension/analysis/2026-05-30-clock-menu-app-fb-substrate-surfaces.md`
