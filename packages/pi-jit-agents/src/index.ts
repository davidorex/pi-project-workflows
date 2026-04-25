/**
 * @davidorex/pi-jit-agents — Agent spec compilation and in-process dispatch runtime.
 *
 * Owns everything between "I have a spec" and "I have a typed result."
 * See docs/planning/jit-agents-spec.md for the boundary contract and principles.
 */

export { createAgentLoader, parseAgentYaml } from "./agent-spec.js";
export { compileAgent } from "./compile.js";
export * from "./errors.js";
export { agentContract } from "./introspect.js";
export type { CompleteFn, NormalizedToolChoice } from "./jit-runtime.js";
export { buildPhantomTool, executeAgent, normalizeToolChoice } from "./jit-runtime.js";
export type { TemplateEnvContext } from "./template.js";
export { createTemplateEnv, renderTemplate, renderTemplateFile } from "./template.js";
export * from "./types.js";
