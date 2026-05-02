/**
 * Type surface for pi-jit-agents.
 *
 * Implements the jit-agents-spec.md §2 boundary contract: four public surfaces
 * (load, compile, execute, introspect) with typed inputs and outputs.
 */
import type { ItemLocation } from "@davidorex/pi-project";
import type { Api, AssistantMessage, Model } from "@mariozechner/pi-ai";
import type nunjucks from "nunjucks";
import type { RendererRegistry } from "./renderer-registry.js";

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
	/**
	 * Block-context references injected into the agent's template environment.
	 *
	 * Two element shapes are accepted:
	 *
	 * - **Bare string** (e.g. `"requirements"`): whole-block injection — the
	 *   entire `.project/<name>.json` payload is read at compile time and
	 *   surfaced to the template under `_<name>`. This is the established
	 *   surface and remains unchanged for existing specs.
	 *
	 * - **Object** ({@link ContextBlockRef}): per-item or scoped injection —
	 *   declares a specific item id and/or kind-specific focus hints to be
	 *   resolved by the compile-time injector. Plan 4 (Wave 2) owns the
	 *   resolution semantics; the parser only typechecks the shape here.
	 */
	contextBlocks?: (string | ContextBlockRef)[];
	/**
	 * Directory the spec was loaded from. Internal use — exposed on the type
	 * for tier-aware operations but never relied on by consumers directly.
	 */
	readonly loadedFrom: string;
}

/**
 * Typed object form for {@link AgentSpec.contextBlocks} entries.
 *
 * Bare-string entries in `contextBlocks` denote whole-block injection
 * (existing behaviour); object entries denote per-item or scoped injection
 * — the surface Plan 4 (Wave 2) consumes to inject specific block items
 * (e.g. one decision, one feature) rather than entire blocks.
 *
 * `compileAgent` does not yet honour these fields; this interface defines
 * the parsing-time contract only. Plan 4 wires resolution through the
 * cross-block resolver and per-item macros.
 */
export interface ContextBlockRef {
	/** Block name, e.g. "decisions", "features". Required. */
	name: string;
	/** Optional ID of a specific item to inject. Plan 4 resolves via cross-block resolver. */
	item?: string;
	/** Optional kind-specific scope hints (e.g., { story: "STORY-001" }). Plan 4 passes through to macros. */
	focus?: Record<string, string>;
	/** Optional traversal depth. 0 = bare-ID refs (default), 1 = inline direct, 2+ recurse. */
	depth?: number;
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
 *
 * Plan 4 (Wave 2) extends this with two optional fields supporting object-form
 * `contextBlocks` resolution. Both default to internal lazy construction when
 * absent so existing callers (string-only `contextBlocks`) require no changes.
 */
export interface CompileContext {
	/** Nunjucks environment from createTemplateEnv — used to render template references. */
	env: nunjucks.Environment;
	/** Resolved input for template rendering. Object fields become top-level template variables. */
	input: unknown;
	/** Project root. Used for `.project/` block reads during contextBlocks injection. */
	cwd: string;
	/**
	 * Optional renderer registry for per-item macro resolution. When absent,
	 * object-form `contextBlocks` entries still inject the resolved item under
	 * `_<name>_item`, but the `render_recursive` Nunjucks global cannot
	 * dispatch — recursive rendering returns a `[unrendered: <kind>/<id>]`
	 * fallback marker rather than throwing.
	 */
	rendererRegistry?: RendererRegistry;
	/**
	 * Optional pre-built ID index. When absent and any object-form
	 * `contextBlocks` entry needs item resolution (or the `resolve`/
	 * `render_recursive` Nunjucks globals are invoked), `compileAgent` builds
	 * one on demand via `buildIdIndex(cwd)`. Callers performing many compiles
	 * in one pass should build once and pass it in for reuse.
	 */
	idIndex?: Map<string, ItemLocation>;
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
	/**
	 * Resolved per-collector context values, keyed by the contextBlock name
	 * (e.g. "conventions"), populated when contextBlocks are read from `.project/`
	 * during compilation. Surfaced for trace capture (issue-023 T5/T6) so the
	 * push-write trace stream can emit one `context_collection` entry per
	 * resolved block. Empty object when the spec declares no contextBlocks.
	 *
	 * The values stored here are the raw (unwrapped) block payloads — distinct
	 * from the anti-injection-wrapped strings that the templates see under the
	 * `_<name>` key. Trace consumers want the structured value for downstream
	 * inspection, not the rendered string.
	 */
	contextValues: Record<string, unknown>;
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
	/**
	 * Trace destination for the monitor-classify trace capture pipeline (issue-023).
	 * - `undefined` → use the default resolution (env var or null fallback).
	 * - `null` → tracing explicitly disabled; no JSONL is written.
	 * - `string` → absolute path to the JSONL trace file the writer should append to.
	 *
	 * Per DEC-0005 the trace stream is push-write (emitted at the moment of occurrence
	 * inside executeAgent), divergent from pi-mono's pull/replay session model.
	 */
	tracePath?: string | null;
	/**
	 * Optional path to a project-extension trace redaction config
	 * (`.workflows/monitors/<name>/trace-config.json` shape). When set,
	 * `loadProjectRedactionConfig` is invoked once per executeAgent call and
	 * the resulting custom patterns are layered atop `BUILTIN_PATTERNS` for
	 * every redacted field. When unset / null, only the builtin pattern set
	 * applies. Independent of `tracePath` — config loading is a no-op when
	 * tracing itself is disabled.
	 */
	redactionConfigPath?: string | null;
	/**
	 * Optional monitor name for stamping `session_start.monitorName`. The
	 * `executeAgent` boundary itself does not know whether its caller is a
	 * monitor classify path or a workflow agent step — the monitor wrapper
	 * (T6's `classifyViaAgent`) sets this when dispatching as a classifier.
	 * `null` / absent for non-monitor traces.
	 */
	monitorName?: string | null;
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
	contextBlocks?: (string | ContextBlockRef)[];
	outputFormat?: "json" | "text";
	outputSchema?: string;
}
