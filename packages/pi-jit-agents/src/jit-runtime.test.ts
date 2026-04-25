import assert from "node:assert";
import path from "node:path";
import { describe, it } from "node:test";
import type { AssistantMessage, Model } from "@mariozechner/pi-ai";
import { AgentDispatchError } from "./errors.js";
import { buildPhantomTool, executeAgent, normalizeToolChoice } from "./jit-runtime.js";
import type { CompiledAgent } from "./types.js";

const FIXTURES_DIR = path.resolve(import.meta.dirname, "..", "test-fixtures");
const PACKAGE_SCHEMAS_DIR = path.resolve(import.meta.dirname, "..", "schemas");

// Minimal mock model — executeAgent only forwards it to completeFn
const MOCK_MODEL = { provider: "test", id: "test-model" } as unknown as Model<never>;

describe("buildPhantomTool", () => {
	it("builds a tool from the result.schema.json test fixture", () => {
		const tool = buildPhantomTool(path.join(FIXTURES_DIR, "schemas", "result.schema.json"));
		assert.strictEqual(tool.name, "jit_result");
		assert.ok(tool.parameters);
		assert.strictEqual((tool.parameters as Record<string, unknown>).type, "object");
	});

	it("builds a tool from the framework verdict.schema.json", () => {
		const tool = buildPhantomTool(path.join(PACKAGE_SCHEMAS_DIR, "verdict.schema.json"), "classify_verdict");
		assert.strictEqual(tool.name, "classify_verdict");
		const params = tool.parameters as Record<string, unknown>;
		assert.strictEqual(params.type, "object");
		const properties = params.properties as Record<string, unknown> | undefined;
		assert.ok(properties?.verdict, "phantom tool must expose verdict property");
		const verdictProp = properties.verdict as Record<string, unknown>;
		function extractEnum(schema: Record<string, unknown>): string[] {
			if (Array.isArray(schema.enum)) return schema.enum as string[];
			if (Array.isArray(schema.anyOf))
				return (schema.anyOf as Array<Record<string, unknown>>).map((e) => e.const as string);
			if (Array.isArray(schema.oneOf))
				return (schema.oneOf as Array<Record<string, unknown>>).map((e) => e.const as string);
			throw new Error(`verdict schema lacks enum/anyOf/oneOf: ${JSON.stringify(schema)}`);
		}
		const verdictValues = extractEnum(verdictProp).slice().sort();
		assert.deepStrictEqual(verdictValues, ["CLEAN", "FLAG", "NEW"].slice().sort());
		assert.ok(Array.isArray(params.required), "parameters must declare required array");
		assert.ok((params.required as string[]).includes("verdict"), "required array must include 'verdict'");
	});
});

describe("normalizeToolChoice", () => {
	it("emits Anthropic-format object for anthropic-messages", () => {
		assert.deepStrictEqual(normalizeToolChoice("anthropic-messages", "classify_verdict"), {
			type: "tool",
			name: "classify_verdict",
		});
	});

	it("emits Anthropic-format object for bedrock-converse-stream (driver translates internally)", () => {
		assert.deepStrictEqual(normalizeToolChoice("bedrock-converse-stream", "classify_verdict"), {
			type: "tool",
			name: "classify_verdict",
		});
	});

	it("emits OpenAI function-form for openai-completions (the post-7edf3a2 OpenRouter route)", () => {
		assert.deepStrictEqual(normalizeToolChoice("openai-completions", "classify_verdict"), {
			type: "function",
			function: { name: "classify_verdict" },
		});
	});

	it("emits OpenAI function-form for mistral-conversations (driver mapToolChoice reads choice.function.name)", () => {
		assert.deepStrictEqual(normalizeToolChoice("mistral-conversations", "classify_verdict"), {
			type: "function",
			function: { name: "classify_verdict" },
		});
	});

	it("emits OpenAI function-form for openai-responses (canonical shape; pi-ai 0.70.2 driver does not honor toolChoice)", () => {
		assert.deepStrictEqual(normalizeToolChoice("openai-responses", "classify_verdict"), {
			type: "function",
			function: { name: "classify_verdict" },
		});
	});

	it("emits OpenAI function-form for openai-codex-responses (canonical shape; pi-ai 0.70.2 driver hardcodes tool_choice: 'auto')", () => {
		assert.deepStrictEqual(normalizeToolChoice("openai-codex-responses", "classify_verdict"), {
			type: "function",
			function: { name: "classify_verdict" },
		});
	});

	it("emits OpenAI function-form for azure-openai-responses (canonical shape; pi-ai 0.70.2 driver does not honor toolChoice)", () => {
		assert.deepStrictEqual(normalizeToolChoice("azure-openai-responses", "classify_verdict"), {
			type: "function",
			function: { name: "classify_verdict" },
		});
	});

	it("emits string 'any' for google-generative-ai (drivers accept only string mode)", () => {
		assert.strictEqual(normalizeToolChoice("google-generative-ai", "classify_verdict"), "any");
	});

	it("emits string 'any' for google-gemini-cli (drivers accept only string mode)", () => {
		assert.strictEqual(normalizeToolChoice("google-gemini-cli", "classify_verdict"), "any");
	});

	it("emits string 'any' for google-vertex (drivers accept only string mode)", () => {
		assert.strictEqual(normalizeToolChoice("google-vertex", "classify_verdict"), "any");
	});

	it("falls back to Anthropic-format for unknown api strings (matches pre-fix executeAgent behavior)", () => {
		assert.deepStrictEqual(normalizeToolChoice("custom-experimental-api", "classify_verdict"), {
			type: "tool",
			name: "classify_verdict",
		});
	});

	it("threads the toolName parameter through every branch unchanged", () => {
		assert.deepStrictEqual(normalizeToolChoice("anthropic-messages", "jit_result"), {
			type: "tool",
			name: "jit_result",
		});
		assert.deepStrictEqual(normalizeToolChoice("openai-completions", "jit_result"), {
			type: "function",
			function: { name: "jit_result" },
		});
		assert.strictEqual(normalizeToolChoice("google-vertex", "jit_result"), "any");
	});
});

describe("executeAgent", () => {
	it("returns extracted text when no output schema is set", async () => {
		const compiled: CompiledAgent = {
			spec: { name: "text-agent", loadedFrom: "/tmp" },
			taskPrompt: "say hi",
			model: "anthropic/test",
		};

		const fakeResponse: AssistantMessage = {
			role: "assistant",
			content: [{ type: "text", text: "hello" }],
			stopReason: "stop",
			timestamp: Date.now(),
		} as AssistantMessage;

		const result = await executeAgent(
			compiled,
			{
				model: MOCK_MODEL as unknown as Model<never>,
				auth: { apiKey: "test", headers: {} },
			},
			async () => fakeResponse,
		);
		assert.strictEqual(result.output, "hello");
	});

	it("extracts tool_call arguments when outputSchema is set", async () => {
		const compiled: CompiledAgent = {
			spec: { name: "schema-agent", loadedFrom: "/tmp" },
			taskPrompt: "classify",
			model: "anthropic/test",
			outputSchema: path.join(PACKAGE_SCHEMAS_DIR, "verdict.schema.json"),
		};

		const fakeResponse: AssistantMessage = {
			role: "assistant",
			content: [
				{
					type: "toolCall",
					id: "call_1",
					name: "jit_result",
					arguments: { verdict: "CLEAN" },
				},
			],
			stopReason: "tool_use",
			timestamp: Date.now(),
		} as AssistantMessage;

		const result = await executeAgent(
			compiled,
			{ model: MOCK_MODEL as unknown as Model<never>, auth: { apiKey: "test", headers: {} } },
			async () => fakeResponse,
		);
		assert.deepStrictEqual(result.output, { verdict: "CLEAN" });
	});

	it("throws AgentDispatchError when schema-bound response has no tool call", async () => {
		const compiled: CompiledAgent = {
			spec: { name: "schema-agent", loadedFrom: "/tmp" },
			taskPrompt: "classify",
			model: "anthropic/test",
			outputSchema: path.join(PACKAGE_SCHEMAS_DIR, "verdict.schema.json"),
		};

		const fakeResponse: AssistantMessage = {
			role: "assistant",
			content: [{ type: "text", text: "I refuse" }],
			stopReason: "stop",
			timestamp: Date.now(),
		} as AssistantMessage;

		await assert.rejects(
			executeAgent(
				compiled,
				{ model: MOCK_MODEL as unknown as Model<never>, auth: { apiKey: "test", headers: {} } },
				async () => fakeResponse,
			),
			AgentDispatchError,
		);
	});

	it("wraps underlying errors in AgentDispatchError", async () => {
		const compiled: CompiledAgent = {
			spec: { name: "err-agent", loadedFrom: "/tmp" },
			taskPrompt: "boom",
			model: "anthropic/test",
		};

		await assert.rejects(
			executeAgent(
				compiled,
				{ model: MOCK_MODEL as unknown as Model<never>, auth: { apiKey: "test", headers: {} } },
				async () => {
					throw new Error("network down");
				},
			),
			(err: unknown) => err instanceof AgentDispatchError && /network down/.test((err as Error).message),
		);
	});
});
