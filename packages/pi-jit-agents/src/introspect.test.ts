import assert from "node:assert";
import { describe, it } from "node:test";
import { agentContract } from "./introspect.js";
import type { AgentSpec } from "./types.js";

describe("agentContract", () => {
	it("projects only contract-relevant fields", () => {
		const spec: AgentSpec = {
			name: "example",
			role: "quality",
			model: "anthropic/test",
			tools: ["read", "grep"],
			systemPromptTemplate: "/abs/system.md",
			taskPromptTemplate: "/abs/task.md",
			inputSchema: { type: "object" },
			outputFormat: "json",
			outputSchema: "/abs/schema.json",
			contextBlocks: ["project"],
			loadedFrom: "/abs/agents",
		};

		const contract = agentContract(spec);
		assert.deepStrictEqual(contract, {
			name: "example",
			role: "quality",
			inputSchema: { type: "object" },
			contextBlocks: ["project"],
			outputFormat: "json",
			outputSchema: "/abs/schema.json",
		});
	});

	it("does not expose loadedFrom or template paths", () => {
		const spec: AgentSpec = {
			name: "min",
			loadedFrom: "/secret/location",
			systemPromptTemplate: "/secret/system.md",
		};
		const contract = agentContract(spec);
		assert.strictEqual("loadedFrom" in contract, false);
		assert.strictEqual("systemPromptTemplate" in contract, false);
	});
});
