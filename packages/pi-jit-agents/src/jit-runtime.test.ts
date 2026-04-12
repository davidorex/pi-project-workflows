import assert from "node:assert";
import path from "node:path";
import { describe, it } from "node:test";
import type { AssistantMessage, Model } from "@mariozechner/pi-ai";
import { AgentDispatchError } from "./errors.js";
import { buildPhantomTool, executeAgent } from "./jit-runtime.js";
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
		const params = tool.parameters as Record<string, any>;
		assert.strictEqual(params.type, "object");
		assert.ok(params.properties?.verdict);
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
