# FGAP-115 — pi latest version impact analysis (2026-05-30)

## Installed vs latest
- pi-coding-agent: 0.75.4 → 0.78.0 (3 versions ahead: 0.76.0, 0.77.0, 0.78.0)
- pi-ai: 0.75.4 → 0.78.0 (3 versions ahead)

Release dates:
- 0.75.4: 2026-05-20
- 0.76.0: 2026-05-27
- 0.77.0: 2026-05-28
- 0.78.0: 2026-05-29

## Changelog deltas (0.75.4 → 0.78.0)

### v0.78.0 (2026-05-29)
**Summary:** Named startup sessions, clickable file tool paths, selective tool disablement.
- No ExtensionContext API changes detected
- No model/provider resolution mechanism changes detected
- **Impact on FGAP-115:** NONE

### v0.77.0 (2026-05-28)
**Summary:** Claude Opus 4.8 support, selective tool disablement via `--exclude-tools`, extension input events now include `streamingBehavior` distinction.
- "Extension input events now include `streamingBehavior` distinction" → extends event type, not ExtensionContext surface
- No ExtensionContext shape changes
- No model/provider resolution mechanism changes
- **Impact on FGAP-115:** NONE

### v0.76.0 (2026-05-27)
**Summary:** Explicit session IDs, RPC bash `excludeFromContext`, bounded provider retries, enhanced terminal editing.
- No ExtensionContext API changes
- No model/provider resolution mechanism changes
- **Impact on FGAP-115:** NONE

## ExtensionContext shape comparison

### 0.75.4 fields
Verified via: `/Users/david/Projects/workflowsPiExtension/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts`

ExtensionContext declares these fields:
- `ui` (ExtensionUIContext)
- `hasUI` (boolean)
- `cwd` (string)
- `sessionManager` (ReadonlySessionManager)
- `modelRegistry` (ModelRegistry)
- **`model` (Model<any> | undefined)** ← current model IS exposed
- `isIdle()`, `signal`, `abort()`, `hasPendingMessages()`, `shutdown()`, `getContextUsage()`, `compact()`, `getSystemPrompt()`

**currentModel / currentProvider added in 0.78.0?** NO

The changelog for 0.76-0.78 does NOT report ExtensionContext shape changes. The installed 0.75.4 already exposes `model: Model<any> | undefined`.

### Latest version ExtensionContext shape
**Source:** Unable to directly fetch 0.78.0 dist files (GitHub raw URL returns 404). However:
1. The changelog for v0.78.0 contains NO mention of ExtensionContext API changes
2. The changelog for v0.77.0 mentions `Extension input events now include 'streamingBehavior' distinction` — an event type extension, not an ExtensionContext surface change
3. The changelog for v0.76.0 contains NO extension/context API changes

**Conclusion:** ExtensionContext in 0.78.0 is substantively identical to 0.75.4 on the currentModel/currentProvider concern.

## Our jit-agents consumption sites + per-option code changes

### Current pattern (pre-0.78.0)

**File: packages/pi-behavior-monitors/index.ts**
- **Line 1388-1391:** Model resolution from agent spec happens BEFORE dispatch call:
  ```
  const modelSpec = compiled.model;
  const { provider, modelId } = parseModelSpec(modelSpec);  // line 1390
  const model = ctx.modelRegistry.find(provider, modelId);  // line 1391
  ```

- **Line 1173-1179:** parseModelSpec() parses "provider/modelId" or defaults to "anthropic/<modelId>"
  ```
  export function parseModelSpec(spec: string): { provider: string; modelId: string } {
      const slashIndex = spec.indexOf("/");
      if (slashIndex !== -1) {
          return { provider: spec.slice(0, slashIndex), modelId: spec.slice(slashIndex + 1) };
      }
      return { provider: "anthropic", modelId: spec };  // default provider
  }
  ```

- **Line 1391 after resolution:** Model is bound into DispatchContext:
  ```
  const dispatch: DispatchContext = {
      model: model as Model<Api>,  // pre-resolved at call site
      ...
  };
  ```

**File: packages/pi-jit-agents/src/types.ts**
- **Line 197:** DispatchContext declares model as a requirement:
  ```
  export interface DispatchContext {
      /** Resolved pi-ai Model instance from the consumer's model registry. */
      model: Model<Api>;
      ...
  }
  ```

### Per-option code changes

#### Option (a): pi-coding-agent upstream extension to expose currentModel/currentProvider
**Current cost:** Requires upstream PR to pi-coding-agent to add fields to ExtensionContext
**Post-0.78.0 verdict:** UNCHANGED COST — The 0.78.0 changelog does not add currentModel/currentProvider. Option (a) still requires upstream PR.

#### Option (b): jit-agents reads auth.json + env directly
**Current cost:** Moderate — add ModelRegistry instantiation to executeAgent boundary
**Post-0.78.0 verdict:** UNCHANGED COST — pi-ai/pi-coding-agent APIs have not changed to expose ModelRegistry or auth.json as public surface.

#### Option (c): DEC-0001 re-anchor — model resolution is caller's responsibility
**Current cost:** ZERO — already implemented correctly in classifyViaAgent
**Post-0.78.0 verdict:** RECOMMENDED — Option (c) is the canonical pattern

## Verdict on the three options

### (a) Upstream PR to expose currentModel/currentProvider
- Cost: UNCHANGED — still requires external PR
- Recommendation: NOT RECOMMENDED

### (b) jit-agents reads auth.json + env directly
- Cost: UNCHANGED — ModelRegistry not public API in pi-ai/pi-coding-agent
- Recommendation: NOT RECOMMENDED — increases forward-dependency inversion

### (c) DEC-0001 re-anchor — caller resolves before dispatch
- Cost: ZERO — already implemented correctly
- Recommendation: STRONGLY RECOMMENDED

## New option (d) — if any
NONE — The 0.76.0 → 0.78.0 changelog does NOT introduce:
- A new dispatch shape bypassing ExtensionContext
- ExtensionContext restructuring
- Deprecation of model-resolution surfaces
- An alternative model-resolution API

## Recommendation

**Implement option (c):** Update DEC-0001 narrative to explicitly anchor model resolution to the caller boundary. No code changes required — classifyViaAgent already implements this correctly.

**Impact of 0.78.0 release:** NONE — no new options unlocked, no cost/viability changes to (a), (b), (c).
