import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDispatchArgs } from "./subprocess-dispatch.js";

describe("buildDispatchArgs", () => {
	it("emits --mode json, --model, --tools <csv>, and the -p prompt in order", () => {
		const args = buildDispatchArgs({
			model: "openrouter/anthropic/claude-haiku-4.5",
			tools: ["write", "bash"],
			promptArg: "do the thing",
		});

		assert.deepEqual(args, [
			"--mode",
			"json",
			"--model",
			"openrouter/anthropic/claude-haiku-4.5",
			"--tools",
			"write,bash",
			"-p",
			"do the thing",
		]);
	});

	it("passes the composed grant as a comma-joined --tools allowlist", () => {
		const args = buildDispatchArgs({ model: "anthropic/claude-haiku-4.5", tools: ["write", "bash"], promptArg: "x" });
		const toolsIdx = args.indexOf("--tools");
		assert.notEqual(toolsIdx, -1);
		assert.equal(args[toolsIdx + 1], "write,bash");
	});

	it("carries the model spec verbatim to --model", () => {
		const args = buildDispatchArgs({ model: "openrouter/anthropic/claude-haiku-4.5", tools: ["bash"], promptArg: "x" });
		const modelIdx = args.indexOf("--model");
		assert.equal(args[modelIdx + 1], "openrouter/anthropic/claude-haiku-4.5");
	});

	it("passes the prompt argument as the value after -p", () => {
		const args = buildDispatchArgs({ model: "m", tools: ["bash"], promptArg: "@/tmp/prompt.md" });
		const pIdx = args.indexOf("-p");
		assert.equal(args[pIdx + 1], "@/tmp/prompt.md");
	});

	it("emits --no-tools (not an absent flag) for an empty grant — this project's capability-governance model's default-empty grant rule", () => {
		const args = buildDispatchArgs({ model: "m", tools: [], promptArg: "x" });
		assert.ok(args.includes("--no-tools"));
		assert.equal(args.indexOf("--tools"), -1);
	});

	it("emits --model when a model is supplied", () => {
		const args = buildDispatchArgs({ model: "anthropic/claude-haiku-4.5", tools: ["bash"], promptArg: "x" });
		const modelIdx = args.indexOf("--model");
		assert.notEqual(modelIdx, -1);
		assert.equal(args[modelIdx + 1], "anthropic/claude-haiku-4.5");
	});

	it("omits --model entirely when no model is supplied — pi resolves its own default, per this project's dispatch model-resolution precedence", () => {
		const args = buildDispatchArgs({ tools: ["bash"], promptArg: "x" });
		assert.equal(args.indexOf("--model"), -1);
		// The rest of the surface is unaffected.
		assert.deepEqual(args, ["--mode", "json", "--tools", "bash", "-p", "x"]);
	});
});
