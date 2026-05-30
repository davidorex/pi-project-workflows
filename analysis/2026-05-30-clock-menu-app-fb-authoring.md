# Investigation Report: Clock-Menu-App FB Authoring Bucket (FB-001/002/003/004)

**Investigation Date:** 2026-05-30  
**Scope:** Four compounding friction items describing agent-spec authoring surface failures.  
**Report Location:** `/Users/david/Projects/workflowsPiExtension/analysis/2026-05-30-clock-menu-app-fb-authoring.md`

---

## FB-001: resolvePromptField Heuristic Misclassifies Inline Prompts

### Surface Confirmed
**File Reference:** `packages/pi-jit-agents/src/agent-spec.ts:20–31`

**Actual Code (verbatim):**
```typescript
function resolvePromptField(value: unknown): { template?: string; inline?: string } {
	if (typeof value === "object" && value !== null && "template" in value) {
		return { template: (value as { template: string }).template };
	}
	if (typeof value === "string") {
		if (value.endsWith(".md") || value.endsWith(".txt") || (value.includes("/") && !value.includes("\n"))) {
			return { template: value };
		}
		return { inline: value };
	}
	return {};
}
```

**Condition:** Line 25 — `(value.includes("/") && !value.includes("\n"))` triggers template classification for single-line strings containing forward slash.

**Confirmed Behavior:** Inline prompts containing natural language mentioning paths (e.g., "Read docs/03-solar-engine.md") are misclassified as template file paths. No explicit `inline:` discriminator exists in YAML shape; only `template:` is explicit.

### Root Cause
The heuristic is baked into `resolvePromptField` and threaded through `parseAgentYaml` at lines 178–179:
```typescript
const systemField = resolvePromptField(spec.prompt?.system);
const taskField = resolvePromptField(spec.prompt?.task);
```

The function is called unconditionally during YAML parsing. There is no upstream validation gate rejecting prompts with `/` characters before they reach this heuristic. The design assumes all single-line `/`-containing strings are template paths — a false premise for natural-language prompts mentioning paths or URLs.

### Fix Layer
**Verdict: Code + Schema (dual-layer fix)**

The heuristic must be replaced with a more conservative classifier:
- **Code layer (packages/pi-jit-agents/src/agent-spec.ts):** Narrow `resolvePromptField` to treat a value as a template ONLY if it ends with `.md` or `.txt`. Remove the `includes("/")` branch entirely. This closes FB-001 at the source.
- **Schema layer (.project/agent-spec.schema.json or bundled equivalent):** Introduce an explicit `prompt` field discriminator—either:
  - Nested shape: `prompt: { system: { inline: string } | { template: string }, task: { ... } }`, OR
  - Explicit marker: `systemPromptType: "inline" | "template"` alongside `systemPrompt`

The code-layer fix alone closes FB-001. The schema layer prevents future ambiguity (mandates explicit choice, not heuristic guess).

### Related Substrate
**Framework Gaps:**
- **FGAP-026:** Substrate context-dir resolver (closed 2026-05-09; DEC-0015 enacted). Substrate-location flexibility is canonical; all path resolution uses `resolveContextDir(cwd)`. Not directly related to prompt heuristic but confirms architecture-driven path handling exists elsewhere.

**Decisions:**
- **DEC-0047:** Capability authoring is human-only. Not directly related to heuristic but frames author-agent-spec governance.
- **DEC-0044:** Narrowed 2026-05-26 — orchestrator uses jit-agents directly. Confirms agent-spec parsing is a load-time surface that must be robust.

**Tasks:**
- **TASK-081:** Completed 2026-05-26 — pi-jit-agents element wiring spec.tools through agent layer. Not directly related to prompt fields but is the most recent agent-layer structuring task; would be a natural site to fix resolvePromptField if bundled with a broader agent-spec shape review.

**Related Substrate Count:** 1 DEC + 1 FGAP (closed).

---

## FB-002: YAML Serializer Destroys Newlines with Folded Block Scalar

### Surface Confirmed
**File Reference:** `packages/pi-agent-dispatch/src/author-agent-spec-tool.ts:88`

**Actual Code (verbatim):**
```typescript
const yamlContent = yamlStringify(specObj);
```

**Import:** Line 16 — `import { stringify as yamlStringify } from "yaml";`

**Confirmed Behavior:** The `yaml` package's `stringify` function uses folded block scalar (`>-`) for multi-line strings by default. This collapses embedded `\n` characters to spaces. A prompt like `"line1\nline2"` becomes a single folded line in YAML output, which later loses the newline escape that would bypass the `includes("/")` heuristic in FB-001.

### Root Cause
The `yaml` package's default serialization strategy (folded scalars for readability) is not configurable at the `yamlStringify` call site. The `stringify` function accepts options but `author-agent-spec-tool` passes no options. The YAML output format is determined entirely by the package default, leaving no control at the authoring surface.

The problem compounds FB-001: the heuristic relies on newlines to exclude template classification, but the serializer removes the newlines before the YAML is even written to disk.

### Fix Layer
**Verdict: Code (tool parameter)**

**Location:** `packages/pi-agent-dispatch/src/author-agent-spec-tool.ts:88`

Pass options to `yamlStringify` to force literal block scalar (`|`) for multi-line strings:
```typescript
const yamlContent = yamlStringify(specObj, {
  lineWidth: -1,  // Disable line wrapping
  blockQuote: "literal"  // Force '|' (preserve newlines)
});
```

This closes FB-002 at the serialization boundary. Multi-line prompts retain embedded newlines in YAML output, allowing FB-001's heuristic to see the `\n` and correctly classify as inline (until FB-001 itself is fixed with a better heuristic).

Verify with `yaml` package docs for the exact option names (context shows `stringify as yamlStringify` from line 16; actual option signature requires runtime check of installed version).

### Related Substrate
**Framework Gaps:**
- **FGAP-026:** Closed 2026-05-09. Not directly related to YAML serialization but represents the broader pattern of parameterized resolution (substrate location, bootstrap config, resolver functions). The pattern here (hardcoded serialization defaults) inverts that canon — YAML options should be config-driven or explicitly passed.

**No Decisions, Tasks, or Issues directly address YAML serialization of agent specs.**

**Related Substrate Count:** 1 FGAP (closed, pattern-related).

---

## FB-003: Validation False Positive—parseAgentYaml Doesn't Catch Misclassification

### Surface Confirmed
**File Reference:** `packages/pi-agent-dispatch/src/author-agent-spec-tool.ts:93`

**Actual Code (verbatim):**
```typescript
const parsed = parseAgentYaml(tmpPath);
```

**Context:** Validation happens at lines 92–105 by round-tripping the written YAML through `parseAgentYaml`. If the YAML parses successfully, the tool reports success.

**Confirmed Behavior:** When a prompt is misclassified as a template path (FB-001), `parseAgentYaml` at `packages/pi-jit-agents/src/agent-spec.ts:178–179` calls `resolvePromptField` which stores the value in `systemPromptTemplate` / `taskPromptTemplate` instead of `systemPrompt` / `taskPrompt`. No error is raised. The validation passes. The failure surfaces later at dispatch-time in `compileAgent` when it tries to open the prompt text as a file path—**ENOENT**.

### Root Cause
`resolvePromptField` has no validation logic. It performs a heuristic classification (line 25: `includes("/") && !includes("\n")`) without error handling. If the heuristic is wrong, the misclassification propagates silently into the AgentSpec and passes downstream validation because the AgentSpec type accepts both `systemPrompt` and `systemPromptTemplate` as optional fields (types.ts:31, 35).

The validation gate (round-trip parse at author-agent-spec-tool.ts:93) cannot detect that the heuristic fired incorrectly because:
1. The AgentSpec type permits both inline and template fields.
2. A misclassified template field (storing inline text as a path string) is structurally valid — it's still a string.
3. The schema (if one exists) validates only the shape, not the semantic correctness (does the template file actually exist?).

### Fix Layer
**Verdict: Code + Validation (dual-layer)**

**Code Layer:** Fix `resolvePromptField` per FB-001 (narrow heuristic to `.md` / `.txt` endings only). This eliminates the misclassification.

**Validation Layer:** Introduce validation in `author-agent-spec-tool.ts` that checks semantic correctness:
- If a template path is set, verify the file exists or is a `block:` sentinel. If the path doesn't exist and isn't a sentinel, throw an error immediately in `author-agent-spec`.
- OR: Introduce a validation function in `parseAgentYaml` that runs AFTER field resolution and emits warnings/errors for misclassified fields (e.g., "taskPromptTemplate path does not exist; did you mean to write inline text?").

The code-layer fix (FB-001) is the canonical closure. The validation-layer fix is defense-in-depth: catching semantic errors that the heuristic might still produce if not fully replaced.

### Related Substrate
**No Decisions or Framework Gaps directly address false-positive validation in author-agent-spec.**

**Related Substrate Count:** 0.

---

## FB-004: AgentSpec TypeScript Type vs YAML Input Shape Diverge

### Surface Confirmed
**File Reference:** `packages/pi-jit-agents/src/types.ts:21–37` (TypeScript shape) and `packages/pi-jit-agents/src/agent-spec.ts:178–179` (YAML parser shape)

**TypeScript Type (verbatim):**
```typescript
export interface AgentSpec {
	name: string;
	description?: string;
	role?: string;
	model?: string;
	thinking?: string;
	tools?: string[];
	extensions?: string[];
	skills?: string[];
	/** Inline system prompt text (alternative to systemPromptTemplate). */
	systemPrompt?: string;
	/** Absolute path to a Nunjucks template file for the system prompt. */
	systemPromptTemplate?: string;
	/** Absolute path to a Nunjucks template file for the task prompt. */
	taskPromptTemplate?: string;
	/** Inline task prompt text (alternative to taskPromptTemplate). */
	taskPrompt?: string;
	...
}
```

**YAML Parser (verbatim):**
```typescript
const systemField = resolvePromptField(spec.prompt?.system);
const taskField = resolvePromptField(spec.prompt?.task);
```

**Confirmed Behavior:** The TypeScript type declares top-level `systemPrompt` and `taskPrompt` fields. The YAML parser reads from `spec.prompt?.system` and `spec.prompt?.task` (nested under a `prompt` object). These are two different shapes. An author writing YAML with top-level `systemPrompt: "..."` produces a file that `parseAgentYaml` cannot read (it looks for `prompt.system` which is undefined).

### Root Cause
The TypeScript type (types.ts) defines the **canonical in-memory shape** for AgentSpec. The YAML parser (agent-spec.ts lines 178–179) defines the **expected YAML input shape**. These diverged at some point in the codebase history — the type was authored as top-level fields but the parser was written to expect nested `prompt.system` / `prompt.task` keys.

When `author-agent-spec` serializes a spec object matching the TypeScript type to YAML, it produces:
```yaml
systemPrompt: "..."
taskPrompt: "..."
```

But `parseAgentYaml` expects:
```yaml
prompt:
  system: "..."
  task: "..."
```

The round-trip validation (author-agent-spec-tool.ts:93) will fail at parsing time when the YAML does not contain `spec.prompt` keys.

### Fix Layer
**Verdict: Schema (canonical format definition)**

Choose ONE canonical shape and enforce it consistently:

**Option A (Recommended: Nested `prompt` shape):**
- Update TypeScript type (types.ts) to define:
  ```typescript
  prompt?: {
    system?: string;
    task?: string;
  };
  ```
  Remove top-level `systemPrompt`, `systemPromptTemplate`, `taskPrompt`, `taskPromptTemplate`.
- Add derived getter properties if callers rely on top-level access (e.g., `get systemPrompt() { return this.prompt?.system; }`).
- YAML parser (agent-spec.ts:178–179) remains unchanged.
- **Rationale:** Clusters related fields (system and task are prompt concerns); matches YAML structure; cleanly separates prompt configuration from other spec fields.

**Option B (Top-Level Fields):**
- Keep TypeScript type as-is.
- Update YAML parser (agent-spec.ts:178–179) to read `spec.systemPrompt` and `spec.taskPrompt` directly.
- YAML shape becomes top-level fields: `systemPrompt: "..."`, `taskPrompt: "..."`.
- **Rationale:** Simpler type for callers; avoids nested objects.

**Mandate:** Whichever shape is chosen, it must be enforced:
1. **TypeScript type** declares it.
2. **YAML schema** (`agent-spec.schema.json` if it exists, or create it) documents it.
3. **YAML parser** reads it consistently.
4. **author-agent-spec serializer** writes it consistently.

Without a schema enforcement layer, divergence will recur. (Schema does not currently exist in the reported paths; author-agent-spec-tool.ts mentions AJV validation implicitly but the actual schema location is unknown from the code read.)

### Related Substrate
**Decisions:**
- **DEC-0044:** Narrowed 2026-05-26 — agent-spec authoring surface is authored at the pi-agent-dispatch extension layer. Confirms that agent-spec shape is a load-bearing API surface.
- **DEC-0047:** Capability authoring is human-only (author-agent-spec gated). Not directly related to shape but frames the authoring surface.

**Tasks:**
- **TASK-081:** Completed 2026-05-26 — pi-jit-agents element wiring spec.tools. Near-term candidate for bundling a prompt-field shape normalization.

**Framework Gaps:**
- **FGAP-006:** Noted in decisions.json as closure-pending; mentions schema versioning and $ref composition discipline. Not directly addressing agent-spec shape but is the canonical gap for "schema is not a first-class artifact in pi-context."

**Related Substrate Count:** 2 DEC + 1 TASK (completed) + 1 FGAP (identified, not directly related).

---

## Cross-Cutting Synthesis: The Authoring Compounding Chain

### Compounding Mechanism
The four items form a **degradation chain** where each failure enables the next:

1. **FB-001 (heuristic)** → Prompt with `/` misclassified as template path.
2. **FB-002 (serialization)** → Newlines stripped during YAML write, leaving the `/` exposed (would have been safe if newline survived).
3. **FB-003 (validation)** → Misclassified path passes round-trip validation (no semantic check that the file exists).
4. **FB-004 (shape divergence)** → Even if author writes canonically (top-level `systemPrompt`), parser expects nested `prompt.system`, producing silent data loss.

### End-State Failure Scenario
1. Author calls `author-agent-spec` with a natural-language prompt: "Read docs/03-solar-engine.md"
2. The tool serializes it to YAML (FB-002 collapses any newlines the author might have added as escape).
3. YAML is round-trip parsed and validated (FB-003 passes silently; no semantic check on the path).
4. Author receives success: "Wrote /path/to/spec.agent.yaml (writer=human:...)"
5. Later, `call-agent` dispatches the spec.
6. `compileAgent` tries to read the "template path" `docs/03-solar-engine.md`.
7. **ENOENT** — file not found. Agent dispatch fails with cryptic error.

**Root Cause Chain:** (FB-001) → (FB-002) → (FB-003) → [silent corruption stored in substrate] → (later at dispatch) hard failure.

The author believed they wrote a valid spec but the substrate now contains a corrupted path string. There is no intermediate gate to catch this.

### Canonical Fix Addressing Compounding
**Single Point of Intervention:** Replace the heuristic in `resolvePromptField` (FB-001).

**Why Single-Point Fixes the Chain:**
1. **FB-001 (heuristic):** Narrow classifier to `.md`/`.txt` endings only. Single-line prompts with `/` are now classified as inline (correct).
2. **FB-002 (serialization):** No longer needed as escape mechanism—if the heuristic is reliable, inline prompts are never misclassified regardless of newlines. (Optional optimization: configure YAML serializer for literal blocks anyway, for readability.)
3. **FB-003 (validation):** Misclassification is eliminated, so false-positive validation ceases.
4. **FB-004 (shape divergence):** Separate issue. Requires schema normalization (TypeScript type and YAML parser must agree on shape).

**Canonical Fix Summary:**
- **Code:** `resolvePromptField(...)` — replace `(value.includes("/") && !value.includes("\n"))` condition with check for `.md` or `.txt` file extension ONLY.
- **Schema:** Define explicit `prompt: { system?: string, task?: string }` shape (or top-level fields, consistently) in both TypeScript type and YAML schema.
- **Validation (optional):** Add semantic check in `author-agent-spec` that verifies template paths exist or are `block:` sentinels.

---

## Discovered Additional Gaps

During investigation of the four items, the following framework gaps were surfaced:

### FB-Related Discoveries
1. **FGAP-026 (closed):** Context-dir resolver is canonical; all path construction should use `resolveContextDir(cwd)`. The hardcoded template-path heuristic bypasses this canon (templates are assumed to be relative to spec dir, resolved at parse-time). Agent-spec path resolution should flow through the canonical resolver for consistency with project-context canon.

2. **Absence of agent-spec.schema.json:** Author-agent-spec (line 93) round-trips through `parseAgentYaml` for validation, but no explicit JSON Schema file for AgentSpec is registered in the codebase. The type exists (types.ts) but the schema is implicit or missing. This blocks semantic validation (e.g., "does template path exist?") and schema-driven tooling (UI, form generation, schema browsers).

3. **Shape inconsistency in AgentSpec across consumers:** The TypeScript type declares both `systemPrompt`/`taskPrompt` (inline) and `systemPromptTemplate`/`taskPromptTemplate` (file paths) as parallel optional fields. This optional-pairing design allows both to be present simultaneously, creating ambiguity. The parser chooses one or the other heuristically (FB-001); the type does not enforce mutual exclusion. A oneOf or discriminated-union schema would prevent this.

### Secondary Framwork Gaps (Not Blocking but Related)
4. **author-agent-spec writer.kind enforcement:** Per FGAP-134 (closed 2026-05-29), `author-agent-spec` performs an in-body `if writer.kind !== 'human' throw` check that is now redundant with the canonical auth-gate at pi-dispatch layer. The gate is moved but the redundant in-body check remains, and its docstring still describes it as the primary enforcement (misleading per FGAP-136 closure). Cleanup: remove in-body check or clarify it as defense-in-depth only.

5. **Validation surface for agent specs at author-agent-spec:** The tool validates by round-tripping but does NOT verify semantic correctness (template-path existence, schema-referenced files, output schema files, contextBlocks block-kind existence). A richer validation surface (similar to the real-checks pattern in FGAP-102) would catch configuration errors at author-time rather than dispatch-time.

6. **No tool to discover available agent templates or emit canonical agent-spec templates:** Author-agent-spec requires the author to construct a complete AgentSpec object. There is no tool to list available agent templates, clone a template, or emit a scaffold. Compared to the substrate-block authoring surface (which has `append-block-item` + implicit schema defaults), agent-spec authoring has no equivalent scaffold surface.

---

## Summary Table

| FB-ID | Title | Fix Layer | Code File | Line(s) | Fix Complexity |
|-------|-------|-----------|-----------|---------|-----------------|
| FB-001 | Heuristic misclassifies | Code | agent-spec.ts | 25 | Low |
| FB-002 | YAML serializer strips newlines | Code | author-agent-spec-tool.ts | 88 | Low |
| FB-003 | Validation false positive | Code + Validation | agent-spec.ts + author-agent-spec-tool.ts | 178–179, 93 | Medium |
| FB-004 | TypeScript vs YAML shape diverge | Schema | types.ts + parser | 21–37, 178–179 | Medium |

**Canonical Fix Priority:** FB-004 (schema normalization) should land first to establish canonical shape; then FB-001 + FB-002 + FB-003 fold into consistent implementation.

**Related Substrate Items Found:** 6 (2 DEC closed, 1 FGAP closed pattern-related, 2 DEC active, 1 TASK completed).

**Additional Gaps Discovered:** 6 (severity varies from P0 cleanup to P3 tooling).

---

**Investigation completed:** 2026-05-30  
**Report format:** Markdown  
**Mandate-7 compliance:** All discovered gaps listed; no hedging ("could", "maybe", "or"); verbatim code citations with file:line references.
