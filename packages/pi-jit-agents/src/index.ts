/**
 * @davidorex/pi-jit-agents — Agent spec compilation and in-process dispatch runtime.
 *
 * Owns everything between "I have a spec" and "I have a typed result."
 * See docs/planning/jit-agents-spec.md for the boundary contract and principles.
 */

export { createAgentLoader, parseAgentYaml } from "./agent-spec.js";
export type { AgentTraceQuery } from "./agent-trace-sdk.js";
export { agentTrace, agentTraceChildren, agentTraceEntry } from "./agent-trace-sdk.js";
export type { BudgetResult, BudgetWarning, PromptBudget } from "./budget-enforcer.js";
export { enforceBudget } from "./budget-enforcer.js";
export { compileAgent, registerCompositionGlobals } from "./compile.js";
export { dispatchInlineMacro } from "./dispatch-inline.js";
export * from "./errors.js";
export { expandFieldPathShorthand } from "./field-path.js";
export { agentContract } from "./introspect.js";
export type { CompleteFn, NormalizedToolChoice } from "./jit-runtime.js";
export { buildPhantomTool, executeAgent, normalizeToolChoice } from "./jit-runtime.js";
export { cycleMarker, notFoundMarker, renderErrorMarker, unrenderedMarker } from "./markers.js";
export type { ItemMacroRef, RendererRegistry } from "./renderer-registry.js";
export { CANONICAL_MACRO_NAMES, createRendererRegistry } from "./renderer-registry.js";
export type { TemplateEnvContext } from "./template.js";
export { createTemplateEnv, renderTemplate, renderTemplateFile } from "./template.js";
export type { RedactionConfig, RedactionPattern } from "./trace-redactor.js";
// Trace subsystem (issue-023)
export {
	BUILTIN_PATTERNS,
	loadProjectRedactionConfig,
	redactLlmResponse,
	redactSensitiveData,
} from "./trace-redactor.js";
export type { WriteTraceOptions } from "./trace-writer.js";
export { dateRotatedPath, writeAgentTrace } from "./trace-writer.js";
export * from "./types.js";
