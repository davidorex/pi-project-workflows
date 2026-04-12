import assert from "node:assert";
import { describe, it } from "node:test";
import * as barrel from "./index.js";

describe("barrel exports", () => {
	it("exposes the four boundary surfaces", () => {
		assert.strictEqual(typeof barrel.parseAgentYaml, "function");
		assert.strictEqual(typeof barrel.createAgentLoader, "function");
		assert.strictEqual(typeof barrel.createTemplateEnv, "function");
		assert.strictEqual(typeof barrel.renderTemplate, "function");
		assert.strictEqual(typeof barrel.renderTemplateFile, "function");
		assert.strictEqual(typeof barrel.compileAgent, "function");
		assert.strictEqual(typeof barrel.executeAgent, "function");
		assert.strictEqual(typeof barrel.buildPhantomTool, "function");
		assert.strictEqual(typeof barrel.agentContract, "function");
	});

	it("exposes the typed error classes", () => {
		assert.strictEqual(typeof barrel.AgentNotFoundError, "function");
		assert.strictEqual(typeof barrel.AgentParseError, "function");
		assert.strictEqual(typeof barrel.AgentCompileError, "function");
		assert.strictEqual(typeof barrel.AgentDispatchError, "function");
	});
});
