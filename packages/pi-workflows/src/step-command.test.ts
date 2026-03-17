import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { makeSpec, mockCtx, mockPi } from "./test-helpers.js";
import type { WorkflowSpec } from "./types.js";
import { executeWorkflow } from "./workflow-executor.js";

describe("command steps", () => {
	it("captures stdout as text output on exit 0", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-cmd-"));
		const spec: WorkflowSpec = {
			name: "test-command",
			description: "test command step",
			steps: {
				run: {
					command: "echo hello world",
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.workflow.yaml"),
		};

		const result = await executeWorkflow(
			spec,
			{},
			{
				ctx: mockCtx(tmpDir),
				pi: mockPi(),
				loadAgent: () => ({ name: "default" }),
			},
		);

		assert.strictEqual(result.status, "completed");
		assert.strictEqual(result.steps.run.status, "completed");
		assert.strictEqual(result.steps.run.agent, "command");
		const output = result.steps.run.output as { text: string };
		assert.strictEqual(output.text, "hello world");
		assert.strictEqual(result.steps.run.textOutput, "hello world");

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("parses stdout as JSON when output.format is json", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-cmd-"));
		const spec: WorkflowSpec = {
			name: "test-command-json",
			description: "test command JSON output",
			steps: {
				run: {
					command: 'echo \'{"key": "value", "count": 42}\'',
					output: { format: "json" },
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.workflow.yaml"),
		};

		const result = await executeWorkflow(
			spec,
			{},
			{
				ctx: mockCtx(tmpDir),
				pi: mockPi(),
				loadAgent: () => ({ name: "default" }),
			},
		);

		assert.strictEqual(result.status, "completed");
		assert.strictEqual(result.steps.run.status, "completed");
		const output = result.steps.run.output as { key: string; count: number };
		assert.strictEqual(output.key, "value");
		assert.strictEqual(output.count, 42);

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("fails on non-zero exit code", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-cmd-"));
		const spec: WorkflowSpec = {
			name: "test-command-fail",
			description: "test command failure",
			steps: {
				run: {
					command: "exit 1",
				},
				after: {
					command: "echo should not run",
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.workflow.yaml"),
		};

		const result = await executeWorkflow(
			spec,
			{},
			{
				ctx: mockCtx(tmpDir),
				pi: mockPi(),
				loadAgent: () => ({ name: "default" }),
			},
		);

		assert.strictEqual(result.status, "failed");
		assert.strictEqual(result.steps.run.status, "failed");
		assert.ok(result.steps.run.error?.includes("Command failed"));
		assert.ok(result.steps.run.error?.includes("exit 1"));
		assert.ok(!result.steps.after);

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("captures stderr on failure", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-cmd-"));
		const spec: WorkflowSpec = {
			name: "test-command-stderr",
			description: "test command stderr",
			steps: {
				run: {
					command: "echo error-msg >&2; exit 1",
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.workflow.yaml"),
		};

		const result = await executeWorkflow(
			spec,
			{},
			{
				ctx: mockCtx(tmpDir),
				pi: mockPi(),
				loadAgent: () => ({ name: "default" }),
			},
		);

		assert.strictEqual(result.status, "failed");
		assert.ok(result.steps.run.error?.includes("error-msg"));

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("resolves ${{ }} expressions in command string", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-cmd-"));
		const spec: WorkflowSpec = {
			name: "test-command-expr",
			description: "test command expressions",
			input: {
				type: "object",
				properties: { greeting: { type: "string" } },
			},
			steps: {
				run: {
					command: "echo ${{ input.greeting }}",
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.workflow.yaml"),
		};

		const result = await executeWorkflow(
			spec,
			{ greeting: "howdy" },
			{
				ctx: mockCtx(tmpDir),
				pi: mockPi(),
				loadAgent: () => ({ name: "default" }),
			},
		);

		assert.strictEqual(result.status, "completed");
		const output = result.steps.run.output as { text: string };
		assert.strictEqual(output.text, "howdy");

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("persists output to disk", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-cmd-"));
		const spec: WorkflowSpec = {
			name: "test-command-persist",
			description: "test command output persistence",
			steps: {
				run: {
					command: "echo persisted",
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.workflow.yaml"),
		};

		const result = await executeWorkflow(
			spec,
			{},
			{
				ctx: mockCtx(tmpDir),
				pi: mockPi(),
				loadAgent: () => ({ name: "default" }),
			},
		);

		assert.strictEqual(result.status, "completed");
		assert.ok(result.steps.run.outputPath);
		const persisted = JSON.parse(fs.readFileSync(result.steps.run.outputPath!, "utf-8"));
		assert.strictEqual(persisted.text, "persisted");

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("handles empty stdout", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-cmd-"));
		const spec: WorkflowSpec = {
			name: "test-command-empty",
			description: "test command empty stdout",
			steps: {
				run: {
					command: "true", // exit 0, no output
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.workflow.yaml"),
		};

		const result = await executeWorkflow(
			spec,
			{},
			{
				ctx: mockCtx(tmpDir),
				pi: mockPi(),
				loadAgent: () => ({ name: "default" }),
			},
		);

		assert.strictEqual(result.status, "completed");
		assert.strictEqual(result.steps.run.status, "completed");
		const output = result.steps.run.output as { text: string };
		assert.strictEqual(output.text, "");

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("costs nothing (usage.cost === 0)", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-cmd-"));
		const spec: WorkflowSpec = {
			name: "test-command-cost",
			description: "test command zero cost",
			steps: {
				run: {
					command: "echo free",
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.workflow.yaml"),
		};

		const result = await executeWorkflow(
			spec,
			{},
			{
				ctx: mockCtx(tmpDir),
				pi: mockPi(),
				loadAgent: () => ({ name: "default" }),
			},
		);

		assert.strictEqual(result.steps.run.usage.cost, 0);
		assert.strictEqual(result.steps.run.usage.turns, 0);
		assert.strictEqual(result.steps.run.usage.input, 0);

		fs.rmSync(tmpDir, { recursive: true });
	});

	it(
		"supports timeout",
		async () => {
			const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-cmd-"));
			const spec: WorkflowSpec = {
				name: "test-command-timeout",
				description: "test command timeout",
				steps: {
					run: {
						command: "sleep 10",
						timeout: { seconds: 1 },
					},
				},
				source: "project",
				filePath: path.join(tmpDir, "test.workflow.yaml"),
			};

			const result = await executeWorkflow(
				spec,
				{},
				{
					ctx: mockCtx(tmpDir),
					pi: mockPi(),
					loadAgent: () => ({ name: "default" }),
				},
			);

			assert.strictEqual(result.status, "failed");
			assert.strictEqual(result.steps.run.status, "failed");
			assert.ok(result.steps.run.error?.includes("Command failed"));

			fs.rmSync(tmpDir, { recursive: true });
		},
		{ timeout: 15000 },
	);

	it(
		"supports signal cancellation",
		async () => {
			const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-cmd-"));
			const spec: WorkflowSpec = {
				name: "test-command-signal",
				description: "test command signal",
				steps: {
					run: {
						command: "sleep 10",
					},
				},
				source: "project",
				filePath: path.join(tmpDir, "test.workflow.yaml"),
			};

			const controller = new AbortController();
			// Abort shortly after starting
			setTimeout(() => controller.abort(), 200);

			const result = await executeWorkflow(
				spec,
				{},
				{
					ctx: mockCtx(tmpDir),
					pi: mockPi(),
					signal: controller.signal,
					loadAgent: () => ({ name: "default" }),
				},
			);

			assert.strictEqual(result.status, "failed");

			fs.rmSync(tmpDir, { recursive: true });
		},
		{ timeout: 15000 },
	);

	it("persists output to custom path", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-cmd-"));
		const outputFile = path.join(tmpDir, "custom-output.json");
		const spec: WorkflowSpec = {
			name: "test-command-path",
			description: "test command custom output path",
			steps: {
				run: {
					command: "echo custom",
					output: { path: outputFile },
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.workflow.yaml"),
		};

		const result = await executeWorkflow(
			spec,
			{},
			{
				ctx: mockCtx(tmpDir),
				pi: mockPi(),
				loadAgent: () => ({ name: "default" }),
			},
		);

		assert.strictEqual(result.status, "completed");
		assert.ok(fs.existsSync(outputFile));
		const persisted = JSON.parse(fs.readFileSync(outputFile, "utf-8"));
		assert.strictEqual(persisted.text, "custom");

		fs.rmSync(tmpDir, { recursive: true });
	});
});
