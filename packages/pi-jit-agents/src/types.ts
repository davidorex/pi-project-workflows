/**
 * Type surface for pi-jit-agents.
 *
 * Implements the jit-agents-spec.md §2 boundary contract: four public surfaces
 * (load, compile, execute, introspect) with typed inputs and outputs.
 */
import type { Api, AssistantMessage, Model } from "@mariozechner/pi-ai";
import type nunjucks from "nunjucks";

/**
 * A loaded agent specification.
 *
 * Per D1 (jit-agents-spec.md §4), every path field is fully resolved to an
 * absolute filesystem path by the time loadAgent returns. Consumers never see
 * relative paths and never need to know which directory the spec was loaded
 * from to interpret its references.
 */
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
	inputSchema?: Record<string, unknown>;
	outputFormat?: "json" | "text";
	/**
	 * Absolute path to a JSON Schema file. May also be a `block:<name>` sentinel
	 * that resolves to `.project/schemas/<name>.schema.json` at compile time
	 * against the invocation cwd.
	 */
	outputSchema?: string;
	contextBlocks?: string[];
	/**
	 * Directory the spec was loaded from. Internal use — exposed on the type
	 * for tier-aware operations but never relied on by consumers directly.
	 */
	readonly loadedFrom: string;
}

/**
 * Options for loadAgent / createAgentLoader.
 *
 * Per D7 (jit-agents-spec.md §4), the loader searches three tiers in order:
 *   1. {cwd}/.project/agents/
 *   2. {userDir ?? ~/.pi/agent/agents/}
 *   3. {builtinDir}   (only when supplied)
 *
 * Per D3, .pi/agents/ is NOT searched — that path is Pi platform territory.
 */
export interface LoadContext {
	/** Project root. Used to resolve the project-level tier and as base for block reads. */
	cwd: string;
	/** Optional consumer-supplied builtin agents directory. When absent, builtin tier is skipped. */
	builtinDir?: string;
	/** Test hook to override the user tier. Defaults to `~/.pi/agent/agents/`. */
	userDir?: string;
}

/**
 * Options for compileAgent.
 */
export interface CompileContext {
	/** Nunjucks environment from createTemplateEnv — used to render template references. */
	env: nunjucks.Environment;
	/** Resolved input for template rendering. Object fields become top-level template variables. */
	input: unknown;
	/** Project root. Used for `.project/` block reads during contextBlocks injection. */
	cwd: string;
}

/**
 * A compiled agent ready for dispatch.
 */
export interface CompiledAgent {
	/** The originating spec (fully resolved paths). */
	spec: AgentSpec;
	/** Rendered system prompt, if the spec declared one. */
	systemPrompt?: string;
	/** Rendered task prompt. Required — dispatch has nothing to send without it. */
	taskPrompt: string;
	/** Model spec copied from the agent spec for dispatch convenience. */
	model?: string;
	/** Absolute output schema path (copied from spec — already resolved). */
	outputSchema?: string;
}

/**
 * Dispatch-time context for executeAgent.
 */
export interface DispatchContext {
	/** Resolved pi-ai Model instance from the consumer's model registry. */
	model: Model<Api>;
	/** API auth — apiKey and headers from the consumer's model registry. */
	auth: JitAgentAuth;
	/** Max tokens for the LLM call. Defaults to 1024. */
	maxTokens?: number;
	/** Abort signal for cancellation. */
	signal?: AbortSignal;
}

/**
 * API credentials for an LLM call.
 */
export interface JitAgentAuth {
	apiKey: string;
	headers: Record<string, string>;
}

/**
 * Result of an executeAgent invocation.
 */
export interface JitAgentResult {
	/** Parsed output — tool_call arguments if schema-bound, extracted text otherwise. */
	output: unknown;
	/** Raw AssistantMessage for debugging and tracing. */
	raw: AssistantMessage;
	/** Token usage and cost from the call. */
	usage: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		cost: number;
	};
}

/**
 * Projection of an AgentSpec for introspection.
 *
 * Used by SDK query surfaces to answer "what does this agent accept/produce"
 * without dispatching it. Internal fields (loadedFrom) are not exposed.
 */
export interface AgentContract {
	name: string;
	role?: string;
	inputSchema?: Record<string, unknown>;
	contextBlocks?: string[];
	outputFormat?: "json" | "text";
	outputSchema?: string;
}
