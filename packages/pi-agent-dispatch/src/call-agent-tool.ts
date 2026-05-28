/**
 * call-agent Pi tool — the in-pi sub-agent agent-as-tool registration site
 * (FEAT-004, per narrowed DEC-0044). Loads spec via jit-agents library,
 * compiles with input + ctx, composes grant (parentGrant ∩ requestedGrant
 * per FEAT-005), invokes executeAgent (TASK-081 clamp enforces at
 * dispatch boundary). Returns the typed result.
 */

import { createAgentLoader } from "@davidorex/pi-jit-agents/agent-spec";
import { compileAgent } from "@davidorex/pi-jit-agents/compile";
import { executeAgent as canonicalExecuteAgent } from "@davidorex/pi-jit-agents/runtime";
import { createTemplateEnv } from "@davidorex/pi-jit-agents/template";
import type { CompiledAgent, DispatchContext, JitAgentResult } from "@davidorex/pi-jit-agents/types";
import type { Api, Model } from "@earendil-works/pi-ai";
import { Type } from "@earendil-works/pi-ai";
import type { AgentToolResult, AgentToolUpdateCallback, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { composeToolGrant } from "./capability-composer.js";

function parseModelSpec(spec: string): { provider: string; modelId: string } {
	const slashIndex = spec.indexOf("/");
	if (slashIndex !== -1) return { provider: spec.slice(0, slashIndex), modelId: spec.slice(slashIndex + 1) };
	return { provider: "anthropic", modelId: spec };
}

/**
 * Internal indirection for test-time interception of the executeAgent
 * dispatch. Production code path never reassigns this. Tests swap via
 * `_internals.executeAgent = (...) => mockResult` and restore after.
 * This is a deliberate seam — restructuring the tool to thread a
 * dependency through every call site would invert the public API for
 * a test-only need.
 */
export const _internals: { executeAgent: (c: CompiledAgent, d: DispatchContext) => Promise<JitAgentResult> } = {
	executeAgent: canonicalExecuteAgent,
};

export const callAgentTool = {
	name: "call-agent",
	label: "Call Agent",
	description:
		"Dispatch a privileged JIT-agent as a typed tool call. Loads the named .agent.yaml, compiles with input, composes the tool grant (intersection of caller's parentGrant and the agent's requestedGrant), and executes via pi-jit-agents executeAgent (clamp enforces child ⊆ parent at dispatch boundary).",
	promptSnippet: "Dispatch a typed sub-agent with scoped capability grant.",
	parameters: Type.Object({
		spec_name: Type.String({
			description: "Name of the agent spec to load (resolves to <name>.agent.yaml in the agents tier).",
		}),
		input: Type.Unknown({ description: "Typed input passed to the agent's compileAgent context." }),
		parent_grant: Type.Optional(
			Type.Array(Type.String(), { description: "The caller's own tool grant. Default-empty." }),
		),
		requested_grant: Type.Optional(
			Type.Array(Type.String(), {
				description:
					"The grant requested for the dispatched sub-agent. Will be clamped to the intersection with parent_grant.",
			}),
		),
		max_tokens: Type.Optional(Type.Number({ description: "Max tokens for the LLM call. Defaults to 1024." })),
	}),
	async execute(
		_toolCallId: string,
		params: {
			spec_name: string;
			input: unknown;
			parent_grant?: string[];
			requested_grant?: string[];
			max_tokens?: number;
		},
		signal: AbortSignal,
		_onUpdate: AgentToolUpdateCallback,
		ctx: ExtensionContext,
	): Promise<AgentToolResult<JitAgentResult>> {
		// 1. Load spec via jit-agents canonical loader
		const loadAgent = createAgentLoader({ cwd: ctx.cwd });
		const spec = loadAgent(params.spec_name);

		// 2. Compile spec with input
		const env = createTemplateEnv({ cwd: ctx.cwd });
		const compiled = compileAgent(spec, { env, input: params.input, cwd: ctx.cwd });

		// 3. Resolve model + auth via ExtensionContext.modelRegistry
		const modelSpec = compiled.model ?? spec.model;
		if (!modelSpec) {
			throw new Error(`call-agent: agent '${params.spec_name}' has no model specified.`);
		}
		const { provider, modelId } = parseModelSpec(modelSpec);
		const model = ctx.modelRegistry.find(provider, modelId);
		if (!model) {
			throw new Error(`call-agent: model '${modelSpec}' not found in modelRegistry for agent '${params.spec_name}'.`);
		}
		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
		if (!auth.ok) {
			throw new Error(`call-agent: auth resolution failed for '${modelSpec}': ${auth.error}`);
		}

		// 4. Compose grant (FEAT-005): intersect parent_grant ∩ requested_grant
		const composedGrant = composeToolGrant(params.parent_grant, params.requested_grant);

		// 5. Build DispatchContext + dispatch (TASK-081 clamp enforces at executeAgent boundary)
		const dispatch: DispatchContext = {
			model: model as Model<Api>,
			auth: { apiKey: auth.apiKey ?? "", headers: auth.headers ?? {} },
			parentGrant: composedGrant,
			maxTokens: params.max_tokens ?? 1024,
			signal,
		};

		const result = await _internals.executeAgent(compiled, dispatch);

		return {
			details: result,
			content: [
				{
					type: "text",
					text: `Dispatched agent '${params.spec_name}' (grant=[${composedGrant.join(", ")}]); result.output type=${typeof result.output}`,
				},
			],
		};
	},
};
