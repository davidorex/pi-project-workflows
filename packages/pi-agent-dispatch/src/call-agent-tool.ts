/**
 * call-agent Pi tool — the in-pi sub-agent agent-as-tool dispatch surface's
 * registration site, reflecting this project's decision to home agent-as-tool
 * dispatch in its own dedicated extension, with pi-jit-agents used as a
 * directly-imported library rather than a dispatch target. Loads spec via
 * jit-agents library, compiles with input + ctx, composes grant (parentGrant
 * ∩ requestedGrant, per the JIT capability-composition layer that scopes a
 * subagent's tools per-invocation from an empty-state default to exactly the
 * operations its task needs), invokes executeAgent (the child-grant-must-be-
 * a-subset-of-parent-grant clamp enforces at dispatch boundary). Returns the
 * typed result.
 */

import { createAgentLoader } from "@davidorex/pi-jit-agents/agent-spec";
import { compileAgent } from "@davidorex/pi-jit-agents/compile";
import { executeAgent as canonicalExecuteAgent } from "@davidorex/pi-jit-agents/runtime";
import { bundledTemplateDir, createTemplateEnv } from "@davidorex/pi-jit-agents/template";
import type { CompiledAgent, DispatchContext, JitAgentResult } from "@davidorex/pi-jit-agents/types";
import type { Api, Model } from "@earendil-works/pi-ai";
import { Type } from "@earendil-works/pi-ai";
import type { AgentToolResult, AgentToolUpdateCallback, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { composeToolGrant } from "./capability-composer.js";
import { dispatchLoadContext } from "./dispatch-loader.js";
import { resolveDispatchModel } from "./dispatch-model.js";

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
			description:
				"Name of the agent spec to load (resolves to <name>.agent.yaml searched across the substrate agents/ dir, then ~/.pi/agent/agents/, then the bundled pi-workflows agents).",
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
		// 1. Load spec via jit-agents canonical loader (builtin tier = bundled pi-workflows agents/)
		const loadAgent = createAgentLoader(dispatchLoadContext(ctx.cwd));
		const spec = loadAgent(params.spec_name);

		// 2. Compile spec with input (builtinDir = bundled pi-jit-agents templates/,
		// so a bundled spec's task/system templates resolve without a local copy)
		const env = createTemplateEnv({ cwd: ctx.cwd, builtinDir: bundledTemplateDir() });
		const compiled = compileAgent(spec, { env, input: params.input, cwd: ctx.cwd });

		// 3. Resolve model + auth via ExtensionContext.modelRegistry, per this
		// project's dispatch model-resolution precedence: compiled/spec model →
		// model-config by_role[role] → default.
		// In-process dispatch has no pi subprocess to fall through to, so a still-null
		// resolution is an informed throw naming the model-config block as the remedy.
		const modelSpec = compiled.model ?? spec.model ?? resolveDispatchModel(ctx.cwd, spec);
		if (!modelSpec) {
			throw new Error(
				`call-agent: agent '${params.spec_name}' has no model — declare one on the spec, ` +
					`or add a matching entry to the substrate's model-config block (by_role['${spec.role ?? ""}'] or default).`,
			);
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

		// 4. Compose grant (the JIT capability-composition layer scoping a
		// subagent's tools per-invocation to exactly the operations its task
		// needs): intersect parent_grant ∩ requested_grant
		const composedGrant = composeToolGrant(params.parent_grant, params.requested_grant);

		// 5. Build DispatchContext + dispatch (the child-grant-must-be-a-subset-of-
		// parent-grant clamp enforces at executeAgent boundary)
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
