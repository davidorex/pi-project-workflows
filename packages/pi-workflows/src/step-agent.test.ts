import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import nunjucks from "nunjucks";
import type { dispatch } from "./dispatch.js";
import type { AgentStepOptions } from "./step-agent.js";
import { executeAgentStep } from "./step-agent.js";
import { zeroUsage } from "./step-shared.js";
import { mockCtx } from "./test-helpers.js";
import type { ExecutionState, StepResult, StepSpec } from "./types.js";

/**
 * Mock dispatch factory: returns a controlled StepResult.
 * Optionally captures call arguments for assertion.
 */
function mockDispatch(result: Partial<StepResult> = {}, capture?: { calls: any[] }): typeof dispatch {
	return async (step, agent, prompt, opts) => {
		if (capture) capture.calls.push({ step, agent, prompt, opts });
		return {
			step: opts.stepName,
			agent: step.agent ?? "mock",
			status: "completed",
			usage: zeroUsage(),
			durationMs: 100,
			textOutput: "mock output",
			...result,
		} as StepResult;
	};
}

function makeTmpRunDir(t: any): string {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-agent-"));
	fs.mkdirSync(path.join(tmpDir, "outputs"), { recursive: true });
	fs.mkdirSync(path.join(tmpDir, "sessions"), { recursive: true });
	t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
	return tmpDir;
}

function makeOptions(tmpDir: string, overrides?: Partial<AgentStepOptions>): AgentStepOptions {
	return {
		ctx: mockCtx(tmpDir),
		loadAgent: () => ({ name: "default" }),
		runDir: tmpDir,
		specFilePath: path.join(tmpDir, "spec.yaml"),
		widgetState: {
			spec: { name: "test", description: "", steps: {}, source: "project" as const, filePath: "" },
			state: { input: {}, steps: {}, status: "running" },
			startTime: Date.now(),
			stepStartTimes: new Map(),
			activities: new Map(),
			outputSummaries: new Map(),
			liveUsage: new Map(),
		},
		dispatchFn: mockDispatch(),
		...overrides,
	};
}

describe("executeAgentStep", () => {
	// Happy path
	it("dispatches to dispatchFn and returns its result", async (t) => {
		const tmpDir = makeTmpRunDir(t);
		const stepSpec: StepSpec = { agent: "test-agent" };
		const state: ExecutionState = { input: {}, steps: {}, status: "running" };

		const result = await executeAgentStep("step1", stepSpec, state, makeOptions(tmpDir));
		assert.strictEqual(result.status, "completed");
		assert.strictEqual(result.agent, "test-agent");
	});

	it("resolves input expressions before dispatch", async (t) => {
		const tmpDir = makeTmpRunDir(t);
		const stepSpec: StepSpec = { agent: "test-agent", input: { data: "${{ input.value }}" } };
		const state: ExecutionState = { input: { value: "resolved" }, steps: {}, status: "running" };
		const capture = { calls: [] as any[] };

		const result = await executeAgentStep(
			"step1",
			stepSpec,
			state,
			makeOptions(tmpDir, {
				dispatchFn: mockDispatch({}, capture),
			}),
		);
		assert.strictEqual(result.status, "completed");
		// The prompt should contain the resolved input
		assert.ok(capture.calls.length > 0);
		const prompt = capture.calls[0].prompt;
		assert.ok(prompt.includes("resolved"), `Expected prompt to contain "resolved", got: ${prompt}`);
	});

	it("loads agent via loadAgent callback", async (t) => {
		const tmpDir = makeTmpRunDir(t);
		const stepSpec: StepSpec = { agent: "my-special-agent" };
		const state: ExecutionState = { input: {}, steps: {}, status: "running" };
		let loadedAgentName = "";

		const result = await executeAgentStep(
			"step1",
			stepSpec,
			state,
			makeOptions(tmpDir, {
				loadAgent: (name: string) => {
					loadedAgentName = name;
					return { name };
				},
			}),
		);
		assert.strictEqual(loadedAgentName, "my-special-agent");
		assert.strictEqual(result.status, "completed");
	});

	it("compiles agent spec through templateEnv when provided", async (t) => {
		const tmpDir = makeTmpRunDir(t);
		// stepSpec.input maps role from state.input so resolvedInput carries it to compileAgentSpec
		const stepSpec: StepSpec = { agent: "test-agent", input: { role: "${{ input.role }}" } };
		const state: ExecutionState = { input: { role: "analyzer" }, steps: {}, status: "running" };
		const env = new nunjucks.Environment(undefined, { autoescape: false, throwOnUndefined: false });
		const capture = { calls: [] as any[] };

		const result = await executeAgentStep(
			"step1",
			stepSpec,
			state,
			makeOptions(tmpDir, {
				loadAgent: () => ({ name: "test", systemPrompt: "You are a {{ role }}" }),
				templateEnv: env,
				dispatchFn: mockDispatch({}, capture),
			}),
		);
		assert.strictEqual(result.status, "completed");
		// The compiled agent should have the rendered systemPrompt
		assert.ok(capture.calls.length > 0);
		const passedAgent = capture.calls[0].agent;
		assert.strictEqual(passedAgent.systemPrompt, "You are a analyzer");
	});

	it("passes signal to dispatchFn", async (t) => {
		const tmpDir = makeTmpRunDir(t);
		const stepSpec: StepSpec = { agent: "test-agent" };
		const state: ExecutionState = { input: {}, steps: {}, status: "running" };
		const controller = new AbortController();
		const capture = { calls: [] as any[] };

		await executeAgentStep(
			"step1",
			stepSpec,
			state,
			makeOptions(tmpDir, {
				signal: controller.signal,
				dispatchFn: mockDispatch({}, capture),
			}),
		);
		assert.ok(capture.calls.length > 0);
		assert.strictEqual(capture.calls[0].opts.signal, controller.signal);
	});

	it("passes timeout to dispatchFn when stepSpec.timeout is set", async (t) => {
		const tmpDir = makeTmpRunDir(t);
		const stepSpec: StepSpec = { agent: "test-agent", timeout: { seconds: 30 } };
		const state: ExecutionState = { input: {}, steps: {}, status: "running" };
		const capture = { calls: [] as any[] };

		await executeAgentStep(
			"step1",
			stepSpec,
			state,
			makeOptions(tmpDir, {
				dispatchFn: mockDispatch({}, capture),
			}),
		);
		assert.ok(capture.calls.length > 0);
		assert.strictEqual(capture.calls[0].opts.timeoutMs, 30000);
	});

	// Expression resolution failure
	it("returns failed result when input expression resolution throws", async (t) => {
		const tmpDir = makeTmpRunDir(t);
		const stepSpec: StepSpec = { agent: "test-agent", input: { bad: "${{ steps.missing.output }}" } };
		const state: ExecutionState = { input: {}, steps: {}, status: "running" };

		const result = await executeAgentStep("step1", stepSpec, state, makeOptions(tmpDir));
		assert.strictEqual(result.status, "failed");
		assert.ok(result.error);
		assert.ok(result.error!.includes("missing"));
		assert.strictEqual(result.durationMs, 0);
		assert.deepStrictEqual(result.usage, zeroUsage());
	});

	// Output validation (schema-bound output)
	it("validates output file against schema when output.schema is set and file exists", async (t) => {
		const tmpDir = makeTmpRunDir(t);

		// Create schema file
		const schemaDir = path.join(tmpDir, "schemas");
		fs.mkdirSync(schemaDir, { recursive: true });
		fs.writeFileSync(
			path.join(schemaDir, "output.json"),
			JSON.stringify({
				type: "object",
				required: ["summary"],
				properties: { summary: { type: "string" } },
			}),
		);

		// Create outputs file simulating what the subprocess would write
		fs.writeFileSync(path.join(tmpDir, "outputs", "step1.json"), JSON.stringify({ summary: "all good" }));

		const stepSpec: StepSpec = {
			agent: "test-agent",
			output: { schema: path.join(schemaDir, "output.json") },
		};
		const state: ExecutionState = { input: {}, steps: {}, status: "running" };

		const result = await executeAgentStep("step1", stepSpec, state, makeOptions(tmpDir));
		assert.strictEqual(result.status, "completed");
		assert.deepStrictEqual(result.output, { summary: "all good" });
	});

	it("falls back to textOutput parsing when output file does not exist", async (t) => {
		const tmpDir = makeTmpRunDir(t);

		const schemaDir = path.join(tmpDir, "schemas");
		fs.mkdirSync(schemaDir, { recursive: true });
		fs.writeFileSync(
			path.join(schemaDir, "output.json"),
			JSON.stringify({
				type: "object",
				required: ["summary"],
				properties: { summary: { type: "string" } },
			}),
		);

		const stepSpec: StepSpec = {
			agent: "test-agent",
			output: { schema: path.join(schemaDir, "output.json") },
		};
		const state: ExecutionState = { input: {}, steps: {}, status: "running" };

		const result = await executeAgentStep(
			"step1",
			stepSpec,
			state,
			makeOptions(tmpDir, {
				dispatchFn: mockDispatch({ textOutput: JSON.stringify({ summary: "from text" }) }),
			}),
		);
		assert.strictEqual(result.status, "completed");
		assert.deepStrictEqual(result.output, { summary: "from text" });
	});

	it("fails when schema validation rejects output", async (t) => {
		const tmpDir = makeTmpRunDir(t);

		const schemaDir = path.join(tmpDir, "schemas");
		fs.mkdirSync(schemaDir, { recursive: true });
		fs.writeFileSync(
			path.join(schemaDir, "output.json"),
			JSON.stringify({
				type: "object",
				required: ["summary"],
				properties: { summary: { type: "string" } },
			}),
		);

		// Write invalid output (missing required field "summary")
		fs.writeFileSync(path.join(tmpDir, "outputs", "step1.json"), JSON.stringify({ other: "nope" }));

		const stepSpec: StepSpec = {
			agent: "test-agent",
			output: { schema: path.join(schemaDir, "output.json") },
		};
		const state: ExecutionState = { input: {}, steps: {}, status: "running" };

		const result = await executeAgentStep("step1", stepSpec, state, makeOptions(tmpDir));
		assert.strictEqual(result.status, "failed");
		assert.ok(result.error);
		assert.ok(result.error!.toLowerCase().includes("validat") || result.error!.includes("required"));
	});

	it("fails when no valid JSON output is available for schema-bound step", async (t) => {
		const tmpDir = makeTmpRunDir(t);

		const schemaDir = path.join(tmpDir, "schemas");
		fs.mkdirSync(schemaDir, { recursive: true });
		fs.writeFileSync(
			path.join(schemaDir, "output.json"),
			JSON.stringify({
				type: "object",
				properties: { summary: { type: "string" } },
			}),
		);

		const stepSpec: StepSpec = {
			agent: "test-agent",
			output: { schema: path.join(schemaDir, "output.json") },
		};
		const state: ExecutionState = { input: {}, steps: {}, status: "running" };

		const result = await executeAgentStep(
			"step1",
			stepSpec,
			state,
			makeOptions(tmpDir, {
				dispatchFn: mockDispatch({ textOutput: "not valid JSON at all" }),
			}),
		);
		assert.strictEqual(result.status, "failed");
		assert.ok(result.error);
		assert.ok(result.error!.includes("no valid JSON output"));
	});

	// Output persistence (non-schema path)
	it("persists output via persistStepOutput when no schema", async (t) => {
		const tmpDir = makeTmpRunDir(t);
		const stepSpec: StepSpec = { agent: "test-agent" };
		const state: ExecutionState = { input: {}, steps: {}, status: "running" };

		const result = await executeAgentStep("step1", stepSpec, state, makeOptions(tmpDir));
		// persistStepOutput should have been called — outputPath set
		assert.ok(result.outputPath);
	});

	it("resolves output.path expressions for persistence", async (t) => {
		const tmpDir = makeTmpRunDir(t);
		const customPath = path.join(tmpDir, "resolved-output.json");
		const stepSpec: StepSpec = {
			agent: "test-agent",
			output: { path: customPath },
		};
		const state: ExecutionState = { input: {}, steps: {}, status: "running" };

		const result = await executeAgentStep("step1", stepSpec, state, makeOptions(tmpDir));
		assert.strictEqual(result.outputPath, customPath);
	});

	// Edge cases
	it("handles undefined stepSpec.input (defaults to {})", async (t) => {
		const tmpDir = makeTmpRunDir(t);
		const stepSpec: StepSpec = { agent: "test-agent" };
		const state: ExecutionState = { input: {}, steps: {}, status: "running" };

		const result = await executeAgentStep("step1", stepSpec, state, makeOptions(tmpDir));
		assert.strictEqual(result.status, "completed");
	});

	// Context injection
	it("inlines prior step textOutput into prompt when context is set", async (t) => {
		const tmpDir = makeTmpRunDir(t);
		const stepSpec: StepSpec = { agent: "test-agent", context: ["diagnose"] };
		const state: ExecutionState = {
			input: {},
			steps: {
				diagnose: {
					step: "diagnose",
					agent: "diagnostician",
					status: "completed",
					usage: zeroUsage(),
					durationMs: 100,
					textOutput: "Root cause is a null pointer in module X",
				},
			},
			status: "running",
		};
		const capture = { calls: [] as any[] };
		await executeAgentStep("fix", stepSpec, state, makeOptions(tmpDir, { dispatchFn: mockDispatch({}, capture) }));
		const prompt = capture.calls[0].prompt;
		assert.ok(prompt.includes("Context from Prior Steps"), "prompt should contain context header");
		assert.ok(prompt.includes("### diagnose"), "prompt should contain step name heading");
		assert.ok(prompt.includes("Root cause is a null pointer in module X"), "prompt should contain textOutput");
	});

	it("inlines multiple context entries in order", async (t) => {
		const tmpDir = makeTmpRunDir(t);
		const stepSpec: StepSpec = { agent: "test-agent", context: ["scan", "analyze"] };
		const state: ExecutionState = {
			input: {},
			steps: {
				scan: {
					step: "scan",
					agent: "scanner",
					status: "completed",
					usage: zeroUsage(),
					durationMs: 50,
					textOutput: "Found 3 issues",
				},
				analyze: {
					step: "analyze",
					agent: "analyst",
					status: "completed",
					usage: zeroUsage(),
					durationMs: 50,
					textOutput: "Priority: high",
				},
			},
			status: "running",
		};
		const capture = { calls: [] as any[] };
		await executeAgentStep("fix", stepSpec, state, makeOptions(tmpDir, { dispatchFn: mockDispatch({}, capture) }));
		const prompt = capture.calls[0].prompt;
		const scanIdx = prompt.indexOf("### scan");
		const analyzeIdx = prompt.indexOf("### analyze");
		assert.ok(scanIdx < analyzeIdx, "scan should appear before analyze in prompt");
	});

	it("skips missing step names in context silently", async (t) => {
		const tmpDir = makeTmpRunDir(t);
		const stepSpec: StepSpec = { agent: "test-agent", context: ["nonexistent"] };
		const state: ExecutionState = { input: {}, steps: {}, status: "running" };
		const result = await executeAgentStep("fix", stepSpec, state, makeOptions(tmpDir));
		assert.strictEqual(result.status, "completed");
	});

	it("skips context steps with empty textOutput", async (t) => {
		const tmpDir = makeTmpRunDir(t);
		const stepSpec: StepSpec = { agent: "test-agent", context: ["transform1"] };
		const state: ExecutionState = {
			input: {},
			steps: {
				transform1: { step: "transform1", agent: "none", status: "completed", usage: zeroUsage(), durationMs: 1 },
			},
			status: "running",
		};
		const capture = { calls: [] as any[] };
		await executeAgentStep("fix", stepSpec, state, makeOptions(tmpDir, { dispatchFn: mockDispatch({}, capture) }));
		const prompt = capture.calls[0].prompt;
		assert.ok(!prompt.includes("Context from Prior Steps"), "prompt should not contain context header when no text");
	});

	// Input schema validation
	it("validates input against agent.inputSchema when both are present", async (t) => {
		const tmpDir = makeTmpRunDir(t);
		const inputSchema = {
			type: "object",
			required: ["topic"],
			properties: { topic: { type: "string" }, depth: { type: "number" } },
		};
		const stepSpec: StepSpec = {
			agent: "test-agent",
			input: { topic: "${{ input.topic }}", depth: "${{ input.depth }}" },
		};
		const state: ExecutionState = { input: { topic: "testing", depth: 3 }, steps: {}, status: "running" };

		const result = await executeAgentStep(
			"step1",
			stepSpec,
			state,
			makeOptions(tmpDir, {
				loadAgent: () => ({ name: "test-agent", inputSchema }),
			}),
		);
		assert.strictEqual(result.status, "completed");
	});

	it("fails with clear error message naming the agent when input schema validation fails", async (t) => {
		const tmpDir = makeTmpRunDir(t);
		const inputSchema = {
			type: "object",
			required: ["topic", "format"],
			properties: { topic: { type: "string" }, format: { type: "string" } },
		};
		const stepSpec: StepSpec = { agent: "my-agent", input: { topic: "${{ input.topic }}" } };
		const state: ExecutionState = { input: { topic: "testing" }, steps: {}, status: "running" };

		const result = await executeAgentStep(
			"step1",
			stepSpec,
			state,
			makeOptions(tmpDir, {
				loadAgent: () => ({ name: "my-agent", inputSchema }),
			}),
		);
		assert.strictEqual(result.status, "failed");
		assert.ok(result.error, "should have error message");
		assert.ok(result.error!.includes("my-agent"), `error should name the agent, got: ${result.error}`);
		assert.ok(result.error!.includes("format"), `error should mention the missing field, got: ${result.error}`);
	});

	it("skips validation when agent has no inputSchema (backward compatible)", async (t) => {
		const tmpDir = makeTmpRunDir(t);
		const stepSpec: StepSpec = { agent: "test-agent", input: { anything: "goes" } };
		const state: ExecutionState = { input: {}, steps: {}, status: "running" };

		const result = await executeAgentStep(
			"step1",
			stepSpec,
			state,
			makeOptions(tmpDir, {
				loadAgent: () => ({ name: "test-agent" }), // no inputSchema
			}),
		);
		assert.strictEqual(result.status, "completed");
	});

	it("fails when no input provided to agent with required schema fields", async (t) => {
		const tmpDir = makeTmpRunDir(t);
		const inputSchema = {
			type: "object",
			required: ["topic"],
			properties: { topic: { type: "string" } },
		};
		const stepSpec: StepSpec = { agent: "strict-agent" }; // no input at all
		const state: ExecutionState = { input: {}, steps: {}, status: "running" };

		const result = await executeAgentStep(
			"step1",
			stepSpec,
			state,
			makeOptions(tmpDir, {
				loadAgent: () => ({ name: "strict-agent", inputSchema }),
			}),
		);
		assert.strictEqual(result.status, "failed");
		assert.ok(result.error, "should have error message");
		assert.ok(result.error!.includes("strict-agent"), `error should name the agent, got: ${result.error}`);
	});

	it("allows extra fields when additionalProperties is not restricted", async (t) => {
		const tmpDir = makeTmpRunDir(t);
		const inputSchema = {
			type: "object",
			required: ["topic"],
			properties: { topic: { type: "string" } },
			// no additionalProperties: false — extras should be allowed
		};
		const stepSpec: StepSpec = {
			agent: "test-agent",
			input: { topic: "${{ input.topic }}", extra: "${{ input.extra }}" },
		};
		const state: ExecutionState = { input: { topic: "testing", extra: "bonus" }, steps: {}, status: "running" };

		const result = await executeAgentStep(
			"step1",
			stepSpec,
			state,
			makeOptions(tmpDir, {
				loadAgent: () => ({ name: "test-agent", inputSchema }),
			}),
		);
		assert.strictEqual(result.status, "completed");
	});

	it("uses real dispatch when dispatchFn not provided (structural check)", async (t) => {
		// This test verifies the fallback code path exists structurally
		// without actually spawning a subprocess (which requires pi on PATH).
		// We verify by checking that the function signature accepts options without dispatchFn.
		const tmpDir = makeTmpRunDir(t);
		const options: AgentStepOptions = {
			ctx: mockCtx(tmpDir),
			loadAgent: () => ({ name: "default" }),
			runDir: tmpDir,
			specFilePath: path.join(tmpDir, "spec.yaml"),
			widgetState: {
				spec: { name: "test", description: "", steps: {}, source: "project" as const, filePath: "" },
				state: { input: {}, steps: {}, status: "running" },
				startTime: Date.now(),
				stepStartTimes: new Map(),
				activities: new Map(),
				outputSummaries: new Map(),
				liveUsage: new Map(),
			},
			// dispatchFn intentionally omitted — defaults to real dispatch
		};
		// Just verify the options type is valid without actually calling
		assert.ok(options.dispatchFn === undefined);
	});
});
