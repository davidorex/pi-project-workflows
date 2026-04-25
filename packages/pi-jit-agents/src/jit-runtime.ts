/**
 * In-process LLM dispatch with phantom-tool structured output enforcement.
 *
 * Implements D4 (jit-agents-spec.md §4): the unified `executeAgent` primitive
 * that both workflow agent steps and monitor classify calls consume. There is
 * one dispatch path across the framework — not one for workflows and another
 * for monitors.
 *
 * Phantom tool pattern: when a compiled agent declares an outputSchema, the
 * dispatch call passes a synthetic Tool constructed from the schema to pi-ai
 * with forced toolChoice. The LLM produces ToolCall.arguments matching the
 * schema; the arguments are extracted as the typed result. No text parsing,
 * no JSON.parse of free-form output.
 *
 * Thinking: NOT passed. Anthropic's API rejects thinking + forced toolChoice.
 * This is a documented active constraint. Agents that need thinking cannot use
 * schema-bound output in this release.
 */
import fs from "node:fs";
import { validateFromFile } from "@davidorex/pi-project/schema-validator";
import type { Api, AssistantMessage, Model, ProviderStreamOptions, Tool, ToolCall } from "@mariozechner/pi-ai";
import { complete as piAiComplete, Type } from "@mariozechner/pi-ai";
import { AgentDispatchError } from "./errors.js";
import type { CompiledAgent, DispatchContext, JitAgentResult } from "./types.js";

/**
 * Injection point for the pi-ai `complete` function. Defaults to the real
 * implementation. Tests override via the optional `completeFn` parameter on
 * `executeAgent`.
 */
export type CompleteFn = typeof piAiComplete;

/**
 * Build a phantom Tool from a JSON Schema file for forced structured output.
 *
 * For the common shape (top-level `type: object` with `required` and
 * `properties` where each property has a primitive `type` and optional
 * `enum`), produces a TypeBox Type.Object matching the schema. Complex shapes
 * (allOf, anyOf, conditional) fall back to a relaxed Type.Object that accepts
 * any object — post-hoc validation via `validateFromFile` catches violations.
 *
 * The tool is never executed — it exists only as a schema constraint that
 * pi-ai enforces via forced toolChoice.
 */
export function buildPhantomTool(
	schemaPath: string,
	toolName = "jit_result",
	description = "Output the typed result",
): Tool {
	const raw = fs.readFileSync(schemaPath, "utf-8");
	const schema = JSON.parse(raw) as Record<string, unknown>;
	const parameters = jsonSchemaToTypeBox(schema);
	return {
		name: toolName,
		description,
		parameters: parameters as Tool["parameters"],
	};
}

/**
 * Provider-aware shape returned by `normalizeToolChoice`. The type union
 * covers every shape that any pi-ai 0.70.2 driver currently honors for
 * forced structured output:
 *
 *   - Anthropic-native object form (anthropic-messages, bedrock-converse-stream)
 *   - OpenAI-compatible function form (openai-completions, mistral-conversations,
 *     and the canonical shape for openai-responses / openai-codex-responses /
 *     azure-openai-responses if/when those drivers begin honoring toolChoice)
 *   - Google string-mode form (google-generative-ai, google-gemini-cli,
 *     google-vertex) — only `"any"` is emitted; specific-tool pinning is
 *     not exposed by the Google providers in pi-ai 0.70.2
 *
 * pi-ai itself accepts any `unknown` here (toolChoice rides on the
 * `Record<string, unknown>` half of `ProviderStreamOptions`); the explicit
 * union exists for callers that want compile-time discrimination of the
 * normalization output.
 */
export type NormalizedToolChoice =
	| { type: "tool"; name: string }
	| { type: "function"; function: { name: string } }
	| "any";

/**
 * Map a pi-ai `Api` kind plus a phantom tool name to the `toolChoice` shape
 * the corresponding driver expects.
 *
 * This is the architectural normalization point referenced by ADR-0003: the
 * forced-toolChoice protocol divergence across Anthropic / OpenAI-compatible
 * / Google providers is collapsed here, not at each consumer call site.
 *
 * Coverage map (pi-ai 0.70.2 — verified against
 * `node_modules/@mariozechner/pi-ai/dist/providers/*`):
 *
 *   - `anthropic-messages` — passes object through unchanged. Anthropic
 *     Messages API expects `{type:"tool", name}`.
 *   - `bedrock-converse-stream` — accepts `{type:"tool", name}` and translates
 *     internally to Bedrock Converse's `{tool:{name}}` shape (driver line
 *     611-612 of amazon-bedrock.js).
 *   - `openai-completions` — passthrough. OpenAI / OpenRouter / OpenAI-
 *     compatible gateways expect `{type:"function", function:{name}}` or
 *     string `"required"`. Mismatch here is the proximate cause of the
 *     "Tool '' not found in provided tools" 400 surfaced post-7edf3a2.
 *   - `mistral-conversations` — driver passes the object through its own
 *     `mapToolChoice` which reads `choice.function.name`, so the OpenAI-
 *     compatible function form is required.
 *   - `openai-responses`, `openai-codex-responses`, `azure-openai-responses`
 *     — pi-ai 0.70.2 drivers do NOT honor `options.toolChoice` (codex hard-
 *     codes `tool_choice: "auto"`; the other two drop it entirely). The
 *     OpenAI-compatible function form is emitted here as the canonical
 *     shape for the day pi-ai begins forwarding it; today the value is
 *     ignored and forced toolChoice is unenforceable on these drivers.
 *     Tracked as a pi-ai upstream gap; do not paper over here.
 *   - `google-generative-ai`, `google-gemini-cli`, `google-vertex` — drivers
 *     accept only string `"any" | "auto" | "none"` (mapped to FunctionCalling-
 *     ConfigMode). Specific-tool pinning is not exposed. `"any"` forces
 *     tool use; adequate for the phantom-tool single-tool pattern (the model
 *     has only one tool to call) but fails to pin a specific tool when
 *     multiple tools are present.
 *   - Unknown / custom api strings — Anthropic-format default. Matches the
 *     pre-fix behavior that worked end-to-end for `anthropic-messages` and
 *     preserves backward compatibility for any consumer that registered a
 *     custom api provider expecting that shape.
 */
export function normalizeToolChoice(api: Api, toolName: string): NormalizedToolChoice {
	switch (api) {
		case "anthropic-messages":
		case "bedrock-converse-stream":
			return { type: "tool", name: toolName };
		case "openai-completions":
		case "mistral-conversations":
		case "openai-responses":
		case "openai-codex-responses":
		case "azure-openai-responses":
			return { type: "function", function: { name: toolName } };
		case "google-generative-ai":
		case "google-gemini-cli":
		case "google-vertex":
			return "any";
		default:
			return { type: "tool", name: toolName };
	}
}

/**
 * Convert a JSON Schema object to a TypeBox schema.
 *
 * Handles the shape used by verdict.schema.json and the initial test fixtures.
 * Falls back to Type.Any() for unsupported constructs — the phantom tool
 * enforces structural shape; full validation is post-hoc.
 */
function jsonSchemaToTypeBox(schema: Record<string, unknown>): unknown {
	const type = schema.type;
	if (type !== "object") {
		return Type.Any();
	}

	const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
	const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);

	const props: Record<string, unknown> = {};
	for (const [key, propSchema] of Object.entries(properties)) {
		const propType = propertyToTypeBox(propSchema);
		props[key] = required.has(key) ? propType : Type.Optional(propType as Parameters<typeof Type.Optional>[0]);
	}

	return Type.Object(props as Record<string, Parameters<typeof Type.Optional>[0]>);
}

function propertyToTypeBox(propSchema: Record<string, unknown>): unknown {
	const t = propSchema.type;
	const enumValues = propSchema.enum;
	const description = typeof propSchema.description === "string" ? propSchema.description : undefined;
	const opts = description ? { description } : {};

	if (Array.isArray(enumValues) && enumValues.every((v) => typeof v === "string")) {
		return Type.Union(
			(enumValues as string[]).map((v) => Type.Literal(v)),
			opts,
		);
	}
	switch (t) {
		case "string":
			return Type.String(opts);
		case "number":
			return Type.Number(opts);
		case "integer":
			return Type.Integer(opts);
		case "boolean":
			return Type.Boolean(opts);
		case "array":
			return Type.Array(Type.Any(), opts);
		case "object":
			return jsonSchemaToTypeBox(propSchema);
		default:
			return Type.Any();
	}
}

/**
 * Extract concatenated text content from an AssistantMessage.
 */
function extractText(msg: AssistantMessage): string {
	return msg.content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text)
		.join("");
}

/**
 * Default usage object. Populated from AssistantMessage.usage when available.
 */
function emptyUsage() {
	return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
}

function usageFromMessage(msg: AssistantMessage): JitAgentResult["usage"] {
	const usage = emptyUsage();
	if (!msg.usage) return usage;
	usage.input = msg.usage.input ?? 0;
	usage.output = msg.usage.output ?? 0;
	usage.cacheRead = msg.usage.cacheRead ?? 0;
	usage.cacheWrite = msg.usage.cacheWrite ?? 0;
	usage.cost =
		(msg.usage.cost?.input ?? 0) +
		(msg.usage.cost?.output ?? 0) +
		(msg.usage.cost?.cacheRead ?? 0) +
		(msg.usage.cost?.cacheWrite ?? 0);
	return usage;
}

/**
 * Execute a compiled agent in-process.
 *
 * When `compiled.outputSchema` is set: build a phantom tool from the schema,
 * call pi-ai's `complete` with forced toolChoice, extract ToolCall.arguments,
 * and validate post-hoc against the schema file.
 *
 * When `compiled.outputSchema` is absent: call `complete` without tools and
 * return the extracted text as `output`.
 *
 * Test hook: `completeFn` overrides the pi-ai `complete` import for unit
 * tests that do not make real LLM calls.
 */
export async function executeAgent(
	compiled: CompiledAgent,
	dispatch: DispatchContext,
	completeFn: CompleteFn = piAiComplete,
): Promise<JitAgentResult> {
	const messages = [
		{
			role: "user" as const,
			content: [{ type: "text" as const, text: compiled.taskPrompt }],
			timestamp: Date.now(),
		},
	];

	const systemPrompt = compiled.systemPrompt;
	const maxTokens = dispatch.maxTokens ?? 1024;

	let response: AssistantMessage;
	try {
		const context: {
			messages: typeof messages;
			tools?: Tool[];
			systemPrompt?: string;
		} = { messages };
		if (systemPrompt) context.systemPrompt = systemPrompt;

		const options: ProviderStreamOptions = {
			apiKey: dispatch.auth.apiKey,
			headers: dispatch.auth.headers,
			maxTokens,
			signal: dispatch.signal,
		};

		if (compiled.outputSchema) {
			const phantomTool = buildPhantomTool(compiled.outputSchema);
			context.tools = [phantomTool];
			options.toolChoice = normalizeToolChoice(dispatch.model.api, phantomTool.name);
		}

		response = await completeFn(dispatch.model as Model<Api>, context, options);
	} catch (err) {
		if (dispatch.signal?.aborted) {
			throw new AgentDispatchError(compiled.spec.name, "cancelled", {
				cause: err instanceof Error ? err : new Error(String(err)),
			});
		}
		const cause = err instanceof Error ? err : new Error(String(err));
		throw new AgentDispatchError(compiled.spec.name, cause.message, { cause });
	}

	const usage = usageFromMessage(response);

	if (compiled.outputSchema) {
		const toolCall = response.content.find((c): c is ToolCall => c.type === "toolCall");
		if (!toolCall) {
			const contentTypes = response.content.map((c) => c.type).join(", ");
			const errMsg = response.errorMessage ? ` error: ${response.errorMessage}` : "";
			throw new AgentDispatchError(
				compiled.spec.name,
				`no tool call in response (content types: [${contentTypes}]${errMsg})`,
				{ stopReason: response.stopReason },
			);
		}
		const args = toolCall.arguments as Record<string, unknown>;
		validateFromFile(compiled.outputSchema, args, `output for agent '${compiled.spec.name}'`);
		return { output: args, raw: response, usage };
	}

	return { output: extractText(response), raw: response, usage };
}
