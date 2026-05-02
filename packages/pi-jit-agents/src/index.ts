/**
 * @davidorex/pi-jit-agents — Agent spec compilation and in-process dispatch runtime.
 *
 * Owns everything between "I have a spec" and "I have a typed result."
 * See docs/planning/jit-agents-spec.md for the boundary contract and principles.
 */

export { createAgentLoader, parseAgentYaml } from "./agent-spec.js";
export type { AgentTraceQuery } from "./agent-trace-sdk.js";
export { agentTrace, agentTraceChildren, agentTraceEntry } from "./agent-trace-sdk.js";
export { compileAgent } from "./compile.js";
export * from "./errors.js";
export { agentContract } from "./introspect.js";
export type { CompleteFn, NormalizedToolChoice } from "./jit-runtime.js";
export { buildPhantomTool, executeAgent, normalizeToolChoice } from "./jit-runtime.js";
export type { ItemMacroRef, RendererRegistry } from "./renderer-registry.js";
export { createRendererRegistry } from "./renderer-registry.js";
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
