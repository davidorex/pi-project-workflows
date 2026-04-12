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
import { complete as piAiComplete } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
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
			options.toolChoice = { type: "tool", name: phantomTool.name };
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
