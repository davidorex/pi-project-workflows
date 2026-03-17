import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { zeroUsage } from "./step-shared.js";
import { makeSpec, mockCtx, mockPi } from "./test-helpers.js";
import type { AgentSpec, StepResult, StepSpec, WorkflowSpec } from "./types.js";
import { executeWorkflow } from "./workflow-executor.js";

describe("forEach steps", () => {
	it("iterates over array with transform body", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-foreach-"));
		const spec: WorkflowSpec = {
			name: "test-foreach",
			description: "test forEach step",
			input: {
				type: "object",
				properties: {
					items: { type: "array" },
				},
			},
			steps: {
				process: {
					forEach: "${{ input.items }}",
					transform: {
						mapping: {
							value: "${{ item.name }}",
							upper: "${{ item.name }}",
						},
					},
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.workflow.yaml"),
		};

		const result = await executeWorkflow(
			spec,
			{ items: [{ name: "alice" }, { name: "bob" }] },
			{
				ctx: mockCtx(tmpDir),
				pi: mockPi(),
				loadAgent: () => ({ name: "default" }),
			},
		);

		assert.strictEqual(result.status, "completed");
		assert.strictEqual(result.steps.process.status, "completed");
		const output = result.steps.process.output as unknown[];
		assert.strictEqual(output.length, 2);
		assert.deepStrictEqual(output[0], { value: "alice", upper: "alice" });
		assert.deepStrictEqual(output[1], { value: "bob", upper: "bob" });

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("uses custom as binding name", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-foreach-"));
		const spec: WorkflowSpec = {
			name: "test-foreach-as",
			description: "test forEach with as",
			input: {
				type: "object",
				properties: {
					users: { type: "array" },
				},
			},
			steps: {
				greet: {
					forEach: "${{ input.users }}",
					as: "user",
					transform: {
						mapping: {
							greeting: "Hello ${{ user.name }}",
						},
					},
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.workflow.yaml"),
		};

		const result = await executeWorkflow(
			spec,
			{ users: [{ name: "Alice" }, { name: "Bob" }] },
			{
				ctx: mockCtx(tmpDir),
				pi: mockPi(),
				loadAgent: () => ({ name: "default" }),
			},
		);

		assert.strictEqual(result.status, "completed");
		const output = result.steps.greet.output as unknown[];
		assert.strictEqual(output.length, 2);
		assert.deepStrictEqual(output[0], { greeting: "Hello Alice" });
		assert.deepStrictEqual(output[1], { greeting: "Hello Bob" });

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("returns completed with empty output for empty array", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-foreach-"));
		const spec: WorkflowSpec = {
			name: "test-foreach-empty",
			description: "test forEach empty array",
			input: {
				type: "object",
				properties: {
					items: { type: "array" },
				},
			},
			steps: {
				process: {
					forEach: "${{ input.items }}",
					transform: {
						mapping: { value: "${{ item }}" },
					},
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.workflow.yaml"),
		};

		const result = await executeWorkflow(
			spec,
			{ items: [] },
			{
				ctx: mockCtx(tmpDir),
				pi: mockPi(),
				loadAgent: () => ({ name: "default" }),
			},
		);

		assert.strictEqual(result.status, "completed");
		assert.strictEqual(result.steps.process.status, "completed");
		const output = result.steps.process.output as unknown[];
		assert.deepStrictEqual(output, []);

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("fails when forEach expression resolves to non-array", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-foreach-"));
		const spec: WorkflowSpec = {
			name: "test-foreach-nonarr",
			description: "test forEach non-array",
			input: {
				type: "object",
				properties: {
					data: { type: "string" },
				},
			},
			steps: {
				process: {
					forEach: "${{ input.data }}",
					transform: {
						mapping: { value: "${{ item }}" },
					},
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.workflow.yaml"),
		};

		const result = await executeWorkflow(
			spec,
			{ data: "not-an-array" },
			{
				ctx: mockCtx(tmpDir),
				pi: mockPi(),
				loadAgent: () => ({ name: "default" }),
			},
		);

		assert.strictEqual(result.status, "failed");
		assert.strictEqual(result.steps.process.status, "failed");
		assert.ok(result.steps.process.error?.includes("must resolve to an array"));

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("fails when one iteration fails", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-foreach-"));
		const spec: WorkflowSpec = {
			name: "test-foreach-fail",
			description: "test forEach iteration failure",
			input: {
				type: "object",
				properties: {
					commands: { type: "array" },
				},
			},
			steps: {
				run: {
					forEach: "${{ input.commands }}",
					command: "${{ item }}",
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.workflow.yaml"),
		};

		const result = await executeWorkflow(
			spec,
			{ commands: ["echo ok", "exit 1", "echo never"] },
			{
				ctx: mockCtx(tmpDir),
				pi: mockPi(),
				loadAgent: () => ({ name: "default" }),
			},
		);

		assert.strictEqual(result.status, "failed");
		assert.strictEqual(result.steps.run.status, "failed");
		// First iteration should have succeeded
		assert.strictEqual(result.steps["run[0]"].status, "completed");
		// Second iteration failed
		assert.strictEqual(result.steps["run[1]"].status, "failed");
		// Third iteration should not have run
		assert.ok(!result.steps["run[2]"]);

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("exposes forEach.index and forEach.length in scope", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-foreach-"));
		const spec: WorkflowSpec = {
			name: "test-foreach-meta",
			description: "test forEach metadata",
			input: {
				type: "object",
				properties: {
					items: { type: "array" },
				},
			},
			steps: {
				process: {
					forEach: "${{ input.items }}",
					transform: {
						mapping: {
							idx: "${{ forEach.index }}",
							len: "${{ forEach.length }}",
							val: "${{ item }}",
						},
					},
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.workflow.yaml"),
		};

		const result = await executeWorkflow(
			spec,
			{ items: ["a", "b", "c"] },
			{
				ctx: mockCtx(tmpDir),
				pi: mockPi(),
				loadAgent: () => ({ name: "default" }),
			},
		);

		assert.strictEqual(result.status, "completed");
		const output = result.steps.process.output as any[];
		assert.strictEqual(output.length, 3);
		assert.deepStrictEqual(output[0], { idx: 0, len: 3, val: "a" });
		assert.deepStrictEqual(output[1], { idx: 1, len: 3, val: "b" });
		assert.deepStrictEqual(output[2], { idx: 2, len: 3, val: "c" });

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("collects outputs into array", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-foreach-"));
		const spec: WorkflowSpec = {
			name: "test-foreach-collect",
			description: "test forEach output collection",
			input: {
				type: "object",
				properties: {
					numbers: { type: "array" },
				},
			},
			steps: {
				double: {
					forEach: "${{ input.numbers }}",
					command: "echo ${{ item }}",
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.workflow.yaml"),
		};

		const result = await executeWorkflow(
			spec,
			{ numbers: [1, 2, 3] },
			{
				ctx: mockCtx(tmpDir),
				pi: mockPi(),
				loadAgent: () => ({ name: "default" }),
			},
		);

		assert.strictEqual(result.status, "completed");
		const output = result.steps.double.output as any[];
		assert.strictEqual(output.length, 3);
		// Each output is { text: "N" }
		assert.deepStrictEqual(output[0], { text: "1" });
		assert.deepStrictEqual(output[1], { text: "2" });
		assert.deepStrictEqual(output[2], { text: "3" });

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("forEach with gate body", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-foreach-"));
		const spec: WorkflowSpec = {
			name: "test-foreach-gate",
			description: "test forEach with gate step body",
			input: {
				type: "object",
				properties: {
					checks: { type: "array" },
				},
			},
			steps: {
				verify: {
					forEach: "${{ input.checks }}",
					gate: {
						check: "${{ item }}",
					},
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.workflow.yaml"),
		};

		const result = await executeWorkflow(
			spec,
			{ checks: ["echo pass1", "echo pass2"] },
			{
				ctx: mockCtx(tmpDir),
				pi: mockPi(),
				loadAgent: () => ({ name: "default" }),
			},
		);

		assert.strictEqual(result.status, "completed");
		assert.strictEqual(result.steps.verify.status, "completed");
		const output = result.steps.verify.output as any[];
		assert.strictEqual(output.length, 2);

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("forEach over array of strings", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-foreach-"));
		const spec: WorkflowSpec = {
			name: "test-foreach-strings",
			description: "test forEach over strings",
			input: {
				type: "object",
				properties: {
					names: { type: "array" },
				},
			},
			steps: {
				greet: {
					forEach: "${{ input.names }}",
					transform: {
						mapping: {
							msg: "Hi ${{ item }}",
						},
					},
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.workflow.yaml"),
		};

		const result = await executeWorkflow(
			spec,
			{ names: ["Alice", "Bob"] },
			{
				ctx: mockCtx(tmpDir),
				pi: mockPi(),
				loadAgent: () => ({ name: "default" }),
			},
		);

		assert.strictEqual(result.status, "completed");
		const output = result.steps.greet.output as any[];
		assert.deepStrictEqual(output[0], { msg: "Hi Alice" });
		assert.deepStrictEqual(output[1], { msg: "Hi Bob" });

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("forEach with when conditional on the forEach step itself", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-foreach-"));
		const spec: WorkflowSpec = {
			name: "test-foreach-when",
			description: "test forEach with when (global condition)",
			input: {
				type: "object",
				properties: {
					enabled: { type: "boolean" },
					items: { type: "array" },
				},
			},
			steps: {
				process: {
					forEach: "${{ input.items }}",
					when: "${{ input.enabled }}",
					transform: {
						mapping: {
							val: "${{ item }}",
						},
					},
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.workflow.yaml"),
		};

		// When enabled is false, the forEach step is skipped entirely
		const resultSkipped = await executeWorkflow(
			spec,
			{ enabled: false, items: ["a", "b"] },
			{
				ctx: mockCtx(tmpDir),
				pi: mockPi(),
				loadAgent: () => ({ name: "default" }),
			},
		);
		assert.strictEqual(resultSkipped.status, "completed");
		assert.strictEqual(resultSkipped.steps.process.status, "skipped");

		// When enabled is true, the forEach step runs
		const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), "wf-foreach-"));
		const spec2 = { ...spec, filePath: path.join(tmpDir2, "test.workflow.yaml") };
		const resultRan = await executeWorkflow(
			spec2,
			{ enabled: true, items: ["a", "b"] },
			{
				ctx: mockCtx(tmpDir2),
				pi: mockPi(),
				loadAgent: () => ({ name: "default" }),
			},
		);
		assert.strictEqual(resultRan.status, "completed");
		assert.strictEqual(resultRan.steps.process.status, "completed");
		const output = resultRan.steps.process.output as any[];
		assert.strictEqual(output.length, 2);

		fs.rmSync(tmpDir, { recursive: true });
		fs.rmSync(tmpDir2, { recursive: true });
	});

	it("forEach downstream step can reference forEach output", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-foreach-"));
		const spec: WorkflowSpec = {
			name: "test-foreach-downstream",
			description: "test forEach output consumed by next step",
			input: {
				type: "object",
				properties: {
					items: { type: "array" },
				},
			},
			steps: {
				process: {
					forEach: "${{ input.items }}",
					transform: {
						mapping: {
							val: "${{ item }}",
						},
					},
				},
				summary: {
					transform: {
						mapping: {
							results: "${{ steps.process.output }}",
						},
					},
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.workflow.yaml"),
		};

		const result = await executeWorkflow(
			spec,
			{ items: ["x", "y"] },
			{
				ctx: mockCtx(tmpDir),
				pi: mockPi(),
				loadAgent: () => ({ name: "default" }),
			},
		);

		assert.strictEqual(result.status, "completed");
		const summaryOutput = result.steps.summary.output as any;
		assert.ok(Array.isArray(summaryOutput.results));
		assert.strictEqual(summaryOutput.results.length, 2);

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("forEach with output path", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-foreach-"));
		const spec: WorkflowSpec = {
			name: "test-foreach-outpath",
			description: "test forEach output path",
			input: {
				type: "object",
				properties: {
					items: { type: "array" },
				},
			},
			steps: {
				process: {
					forEach: "${{ input.items }}",
					transform: {
						mapping: {
							val: "${{ item }}",
						},
					},
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.workflow.yaml"),
		};

		const result = await executeWorkflow(
			spec,
			{ items: ["a", "b"] },
			{
				ctx: mockCtx(tmpDir),
				pi: mockPi(),
				loadAgent: () => ({ name: "default" }),
			},
		);

		assert.strictEqual(result.status, "completed");
		// The forEach step itself should have persisted output
		assert.ok(result.steps.process.outputPath);

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("forEach with command body", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-foreach-"));
		const spec: WorkflowSpec = {
			name: "test-foreach-cmd",
			description: "test forEach with command body",
			input: {
				type: "object",
				properties: {
					files: { type: "array" },
				},
			},
			steps: {
				run: {
					forEach: "${{ input.files }}",
					command: "echo processing ${{ item }}",
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.workflow.yaml"),
		};

		const result = await executeWorkflow(
			spec,
			{ files: ["a.txt", "b.txt"] },
			{
				ctx: mockCtx(tmpDir),
				pi: mockPi(),
				loadAgent: () => ({ name: "default" }),
			},
		);

		assert.strictEqual(result.status, "completed");
		const output = result.steps.run.output as any[];
		assert.strictEqual(output.length, 2);
		assert.deepStrictEqual(output[0], { text: "processing a.txt" });
		assert.deepStrictEqual(output[1], { text: "processing b.txt" });

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("forEach costs nothing for transform body", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-foreach-"));
		const spec: WorkflowSpec = {
			name: "test-foreach-cost",
			description: "test forEach zero cost",
			input: {
				type: "object",
				properties: {
					items: { type: "array" },
				},
			},
			steps: {
				process: {
					forEach: "${{ input.items }}",
					transform: {
						mapping: { val: "${{ item }}" },
					},
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.workflow.yaml"),
		};

		const result = await executeWorkflow(
			spec,
			{ items: ["a", "b", "c"] },
			{
				ctx: mockCtx(tmpDir),
				pi: mockPi(),
				loadAgent: () => ({ name: "default" }),
			},
		);

		assert.strictEqual(result.status, "completed");
		assert.strictEqual(result.steps.process.usage.cost, 0);
		assert.strictEqual(result.steps.process.usage.turns, 0);
		assert.strictEqual(result.totalUsage.cost, 0);

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("as binding is visible in agent step input expressions", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-foreach-"));
		const capture = { calls: [] as any[] };

		const mockDispatchFn = async (
			step: StepSpec,
			agentSpec: AgentSpec,
			prompt: string,
			opts: any,
		): Promise<StepResult> => {
			capture.calls.push({ step, agentSpec, prompt, opts });
			return {
				step: opts.stepName,
				agent: step.agent ?? "mock",
				status: "completed" as const,
				usage: zeroUsage(),
				durationMs: 100,
				textOutput: JSON.stringify({ result: "done" }),
				output: { result: "done" },
			};
		};

		const spec: WorkflowSpec = {
			name: "test-foreach-agent-as",
			description: "test forEach as binding in agent step input",
			input: {
				type: "object",
				properties: {
					tasks: { type: "array" },
				},
			},
			steps: {
				process: {
					forEach: "${{ input.tasks }}",
					as: "task",
					agent: "test-agent",
					input: {
						task: "${{ task }}",
						description: "${{ task.description }}",
						extra: "${{ input.extra }}",
					},
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.workflow.yaml"),
		};

		const inputData = {
			tasks: [
				{ description: "Fix bug A", file: "a.ts" },
				{ description: "Fix bug B", file: "b.ts" },
			],
			extra: "shared-context",
		};

		const result = await executeWorkflow(spec, inputData, {
			ctx: mockCtx(tmpDir),
			pi: mockPi(),
			loadAgent: () => ({ name: "test-agent" }),
			dispatchFn: mockDispatchFn,
		});

		assert.strictEqual(result.status, "completed", `Workflow failed: ${JSON.stringify(result.steps)}`);
		assert.strictEqual(result.steps.process.status, "completed");

		// Verify dispatch was called twice (once per task)
		assert.strictEqual(capture.calls.length, 2);

		// Verify the prompt contains the resolved task data (not "${{ task }}")
		const prompt0 = capture.calls[0].prompt;
		assert.ok(prompt0.includes("Fix bug A"), `Expected prompt to contain task description, got: ${prompt0}`);
		assert.ok(prompt0.includes("shared-context"), `Expected prompt to contain extra, got: ${prompt0}`);

		const prompt1 = capture.calls[1].prompt;
		assert.ok(prompt1.includes("Fix bug B"), `Expected prompt to contain task description, got: ${prompt1}`);

		fs.rmSync(tmpDir, { recursive: true });
	});
});
