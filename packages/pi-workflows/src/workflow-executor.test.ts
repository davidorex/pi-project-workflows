import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { makeSpec, mockCtx, mockPi } from "./test-helpers.js";
import type { WorkflowSpec } from "./types.js";
import { executeWorkflow } from "./workflow-executor.js";

// Skip integration tests unless RUN_INTEGRATION=1 and pi is available
let hasPi = false;
if (process.env.RUN_INTEGRATION === "1") {
	try {
		const { execSync } = await import("node:child_process");
		execSync("pi --version", { stdio: "ignore" });
		hasPi = true;
	} catch {}
}

describe("executeWorkflow", { skip: !hasPi ? "pi not available" : undefined }, () => {
	it(
		"runs a single-step workflow",
		async () => {
			const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-exec-"));
			const spec: WorkflowSpec = {
				name: "test",
				description: "test workflow",
				steps: {
					greet: { agent: "default" },
				},
				source: "project",
				filePath: path.join(tmpDir, "test.project.yaml"),
			};

			const pi = mockPi();
			const result = await executeWorkflow(
				spec,
				{},
				{
					ctx: mockCtx(tmpDir),
					pi,
					loadAgent: () => ({ name: "default" }),
				},
			);

			assert.strictEqual(result.status, "completed");
			assert.ok(result.steps.greet);
			assert.strictEqual(result.steps.greet.status, "completed");
			assert.ok(result.totalDurationMs > 0);
			assert.ok(pi._messages.length >= 1); // sendMessage called

			fs.rmSync(tmpDir, { recursive: true });
		},
		{ timeout: 60000 },
	);

	it(
		"fails fast on step failure",
		async () => {
			// Use a pre-aborted signal to reliably trigger failure on the first step.
			// pi does not necessarily fail for unknown agent names, so the original
			// approach of using a nonexistent agent is not reliable. An already-aborted
			// signal exercises the executor's cancellation/fail-fast path: the first
			// step is marked failed with "Workflow cancelled" and the second step
			// is never reached.
			const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-exec-"));
			const spec: WorkflowSpec = {
				name: "test",
				description: "test",
				steps: {
					willFail: { agent: "default" },
					shouldNotRun: { agent: "default" },
				},
				source: "project",
				filePath: path.join(tmpDir, "test.project.yaml"),
			};

			const controller = new AbortController();
			controller.abort(); // pre-abort

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
			assert.ok(result.steps.willFail);
			assert.strictEqual(result.steps.willFail.error, "Workflow cancelled");
			assert.ok(!result.steps.shouldNotRun); // never executed

			fs.rmSync(tmpDir, { recursive: true });
		},
		{ timeout: 30000 },
	);

	it("validates workflow input", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-exec-"));
		const spec: WorkflowSpec = {
			name: "test",
			description: "test",
			input: {
				type: "object",
				required: ["name"],
				properties: { name: { type: "string" } },
			},
			steps: { s: { agent: "default" } },
			source: "project",
			filePath: path.join(tmpDir, "test.project.yaml"),
		};

		await assert.rejects(
			() =>
				executeWorkflow(
					spec,
					{ name: 123 },
					{
						ctx: mockCtx(tmpDir),
						pi: mockPi(),
						loadAgent: () => ({ name: "default" }),
					},
				),
			(err: unknown) => err instanceof Error && err.message.includes("Validation failed"),
		);

		fs.rmSync(tmpDir, { recursive: true });
	});

	it(
		"resolves expressions between steps",
		async () => {
			// This test verifies that step 2 can reference step 1's output.
			// Since we can't easily control what pi outputs, we verify the
			// expression resolution doesn't throw and both steps complete.
			const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-exec-"));
			const spec: WorkflowSpec = {
				name: "test",
				description: "test",
				steps: {
					first: { agent: "default" },
					second: {
						agent: "default",
						input: { prior: "${{ steps.first.textOutput }}" },
					},
				},
				source: "project",
				filePath: path.join(tmpDir, "test.project.yaml"),
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
			assert.strictEqual(Object.keys(result.steps).length, 2);

			fs.rmSync(tmpDir, { recursive: true });
		},
		{ timeout: 120000 },
	);

	it(
		"persists state to disk",
		async () => {
			const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-exec-"));
			const spec: WorkflowSpec = {
				name: "test",
				description: "test",
				steps: { s: { agent: "default" } },
				source: "project",
				filePath: path.join(tmpDir, "test.project.yaml"),
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

			// Verify state.json exists in run directory
			const stateFile = path.join(result.runDir, "state.json");
			assert.ok(fs.existsSync(stateFile));
			const savedState = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
			assert.strictEqual(savedState.status, "completed");

			fs.rmSync(tmpDir, { recursive: true });
		},
		{ timeout: 60000 },
	);
});

// ── When conditionals ──
// These tests don't require pi on PATH since gate/transform/when steps
// don't use subprocess dispatch.

describe("when conditionals", () => {
	it("skips step when condition is falsy", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-when-"));
		const spec: WorkflowSpec = {
			name: "test-when",
			description: "test when conditionals",
			steps: {
				setup: {
					agent: "transform",
					transform: {
						mapping: { ready: false, value: 42 },
					},
				},
				conditional: {
					agent: "transform",
					when: "${{ steps.setup.output.ready }}",
					transform: {
						mapping: { result: "should not appear" },
					},
				},
				after: {
					agent: "transform",
					transform: {
						mapping: { final: "done" },
					},
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.project.yaml"),
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
		assert.strictEqual(result.steps.conditional.status, "skipped");
		// Subsequent step still runs
		assert.strictEqual(result.steps.after.status, "completed");
		assert.deepStrictEqual(result.steps.after.output, { final: "done" });

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("runs step when condition is truthy", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-when-"));
		const spec: WorkflowSpec = {
			name: "test-when-truthy",
			description: "test when conditionals truthy",
			steps: {
				setup: {
					agent: "transform",
					transform: {
						mapping: { ready: true },
					},
				},
				conditional: {
					agent: "transform",
					when: "${{ steps.setup.output.ready }}",
					transform: {
						mapping: { result: "executed" },
					},
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.project.yaml"),
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
		assert.strictEqual(result.steps.conditional.status, "completed");
		assert.deepStrictEqual(result.steps.conditional.output, { result: "executed" });

		fs.rmSync(tmpDir, { recursive: true });
	});
});

// ── Gate steps ──

describe("gate steps", () => {
	it("passes on exit code 0", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-gate-"));
		const spec: WorkflowSpec = {
			name: "test-gate",
			description: "test gate step",
			steps: {
				verify: {
					agent: "gate",
					gate: {
						check: "echo ok",
					},
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.project.yaml"),
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
		assert.strictEqual(result.steps.verify.status, "completed");
		const gateOutput = result.steps.verify.output as { passed: boolean; exitCode: number; output: string };
		assert.strictEqual(gateOutput.passed, true);
		assert.strictEqual(gateOutput.exitCode, 0);
		assert.strictEqual(gateOutput.output, "ok");

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("fails workflow on gate failure with onFail: fail (default)", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-gate-"));
		const spec: WorkflowSpec = {
			name: "test-gate-fail",
			description: "test gate failure",
			steps: {
				verify: {
					agent: "gate",
					gate: {
						check: "exit 1",
					},
				},
				after: {
					agent: "transform",
					transform: {
						mapping: { shouldNotRun: true },
					},
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.project.yaml"),
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
		assert.strictEqual(result.steps.verify.status, "failed");
		assert.ok(result.steps.verify.error?.includes("Gate check failed"));
		// Second step should not have run
		assert.ok(!result.steps.after);

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("continues on gate failure with onFail: continue", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-gate-"));
		const spec: WorkflowSpec = {
			name: "test-gate-continue",
			description: "test gate failure with continue",
			steps: {
				verify: {
					agent: "gate",
					gate: {
						check: "exit 1",
						onFail: "continue",
					},
				},
				after: {
					agent: "transform",
					transform: {
						mapping: { ran: true },
					},
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.project.yaml"),
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
		// Gate step is completed (not failed) because onFail: continue
		assert.strictEqual(result.steps.verify.status, "completed");
		const gateOutput = result.steps.verify.output as { passed: boolean };
		assert.strictEqual(gateOutput.passed, false);
		// Next step ran
		assert.strictEqual(result.steps.after.status, "completed");
		assert.deepStrictEqual(result.steps.after.output, { ran: true });

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("resolves expressions in gate check", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-gate-"));
		const spec: WorkflowSpec = {
			name: "test-gate-expr",
			description: "test gate expression resolution",
			steps: {
				setup: {
					agent: "transform",
					transform: {
						mapping: { cmd: "echo resolved" },
					},
				},
				verify: {
					agent: "gate",
					gate: {
						check: "${{ steps.setup.output.cmd }}",
					},
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.project.yaml"),
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
		assert.strictEqual(result.steps.verify.status, "completed");
		const gateOutput = result.steps.verify.output as { passed: boolean; output: string };
		assert.strictEqual(gateOutput.passed, true);
		assert.strictEqual(gateOutput.output, "resolved");

		fs.rmSync(tmpDir, { recursive: true });
	});
});

// ── Artifacts ──

describe("artifacts", () => {
	it("writes artifact files after workflow completion", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-artifact-"));
		const spec: WorkflowSpec = {
			name: "test-artifact",
			description: "test artifact writing",
			steps: {
				produce: {
					agent: "transform",
					transform: {
						mapping: { report: "test report content", count: 42 },
					},
				},
			},
			artifacts: {
				textReport: {
					path: path.join(tmpDir, "reports", "latest.txt"),
					from: "steps.produce.output.report",
				},
				jsonReport: {
					path: path.join(tmpDir, "reports", "data.json"),
					from: "steps.produce.output",
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.project.yaml"),
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
		assert.ok(result.artifacts);
		assert.ok(result.artifacts!.textReport);
		assert.ok(result.artifacts!.jsonReport);

		// Verify text artifact written as string (not JSON-wrapped)
		const textContent = fs.readFileSync(result.artifacts!.textReport, "utf-8");
		assert.strictEqual(textContent, "test report content");

		// Verify JSON artifact written as formatted JSON
		const jsonContent = JSON.parse(fs.readFileSync(result.artifacts!.jsonReport, "utf-8"));
		assert.deepStrictEqual(jsonContent, { report: "test report content", count: 42 });

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("resolves expressions in artifact path", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-artifact-"));
		const spec: WorkflowSpec = {
			name: "test-artifact-path",
			description: "test artifact path expression",
			steps: {
				produce: {
					agent: "transform",
					transform: {
						mapping: { value: "data" },
					},
				},
			},
			artifacts: {
				report: {
					path: path.join(tmpDir, "reports", "run-${{ runId }}.json"),
					from: "steps.produce.output",
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.project.yaml"),
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
		assert.ok(result.artifacts);
		// The artifact path should contain the runId
		assert.ok(result.artifacts!.report.includes(result.runId));
		assert.ok(fs.existsSync(result.artifacts!.report));

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("handles relative artifact paths resolved against workflow dir", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-artifact-"));
		const spec: WorkflowSpec = {
			name: "test-artifact-rel",
			description: "test relative artifact path",
			steps: {
				produce: {
					agent: "transform",
					transform: {
						mapping: { result: "output" },
					},
				},
			},
			artifacts: {
				report: {
					path: "latest.json",
					from: "steps.produce.output",
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.project.yaml"),
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
		assert.ok(result.artifacts);
		// Artifact path should be under .workflows/runs/<workflow-name>/
		const workflowDir = path.join(tmpDir, ".workflows", "runs", "test-artifact-rel");
		const expectedPath = path.resolve(workflowDir, "latest.json");
		assert.strictEqual(result.artifacts!.report, expectedPath);
		assert.ok(fs.existsSync(expectedPath));

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("artifact failure is non-fatal", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-artifact-"));
		const notifications: Array<{ msg: string; level: string }> = [];
		const spec: WorkflowSpec = {
			name: "test-artifact-fail",
			description: "test artifact failure handling",
			steps: {
				produce: {
					agent: "transform",
					transform: {
						mapping: { value: "data" },
					},
				},
			},
			artifacts: {
				bad: {
					path: path.join(tmpDir, "reports", "output.json"),
					from: "steps.nonexistent.output", // expression will fail
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.project.yaml"),
		};

		const ctx = {
			cwd: tmpDir,
			hasUI: true,
			ui: {
				setWidget: () => {},
				notify: (msg: string, level: string) => notifications.push({ msg, level }),
				setStatus: () => {},
				setWorkingMessage: () => {},
			},
		} as any;

		const result = await executeWorkflow(
			spec,
			{},
			{
				ctx,
				pi: mockPi(),
				loadAgent: () => ({ name: "default" }),
			},
		);

		// Workflow still completes despite artifact failure
		assert.strictEqual(result.status, "completed");
		// No artifacts written
		assert.ok(!result.artifacts || Object.keys(result.artifacts).length === 0);
		// Warning notification was sent
		assert.ok(notifications.some((n) => n.msg.includes("bad") && n.level === "warning"));

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("validates artifact targeting .project/ against block schema", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-artifact-"));

		// Create .project/schemas/ with a schema that requires { items: array }
		const schemasDir = path.join(tmpDir, ".project", "schemas");
		fs.mkdirSync(schemasDir, { recursive: true });
		fs.writeFileSync(
			path.join(schemasDir, "test-block.schema.json"),
			JSON.stringify({
				type: "object",
				required: ["items"],
				properties: { items: { type: "array" } },
			}),
		);

		const spec: WorkflowSpec = {
			name: "test-artifact-block",
			description: "test block-api routing for .project/ artifacts",
			steps: {
				produce: {
					agent: "transform",
					transform: {
						mapping: { bad: "data" }, // does NOT match schema (missing items)
					},
				},
			},
			artifacts: {
				block: {
					path: path.join(tmpDir, ".project", "test-block.json"),
					from: "steps.produce.output",
				},
			},
			source: "test",
			version: "1.0",
			filePath: path.join(tmpDir, "test.project.yaml"),
		};

		const notifications: { msg: string; level: string }[] = [];
		const result = await executeWorkflow(
			spec,
			{},
			{
				ctx: {
					cwd: tmpDir,
					hasUI: true,
					ui: {
						setWidget: () => {},
						notify: (msg: string, level: string) => {
							notifications.push({ msg, level });
						},
						setStatus: () => {},
						setWorkingMessage: () => {},
					},
				} as unknown as ExtensionContext,
				pi: mockPi(),
				loadAgent: () => ({ name: "default" }),
			},
		);

		// Workflow completes (artifact failure is non-fatal)
		assert.strictEqual(result.status, "completed");
		// Block file should NOT have been written (validation failed)
		assert.ok(!fs.existsSync(path.join(tmpDir, ".project", "test-block.json")));
		// Warning about validation failure
		assert.ok(notifications.some((n) => n.msg.includes("test-block") && n.level === "warning"));

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("includes artifacts in formatResult output", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-artifact-"));
		const spec: WorkflowSpec = {
			name: "test-artifact-format",
			description: "test artifact in formatResult",
			steps: {
				produce: {
					agent: "transform",
					transform: {
						mapping: { value: "data" },
					},
				},
			},
			artifacts: {
				report: {
					path: path.join(tmpDir, "reports", "latest.json"),
					from: "steps.produce.output",
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.project.yaml"),
		};

		const pi = mockPi();
		const result = await executeWorkflow(
			spec,
			{},
			{
				ctx: mockCtx(tmpDir),
				pi,
				loadAgent: () => ({ name: "default" }),
			},
		);

		// The sendMessage content should include artifact info
		const lastMsg = pi._messages[pi._messages.length - 1];
		const content = lastMsg.msg.content;
		assert.ok(content.includes("Artifacts:"));
		assert.ok(content.includes("report"));

		fs.rmSync(tmpDir, { recursive: true });
	});
});

// ── Transform steps ──

describe("transform steps", () => {
	it("produces output from expression mapping", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-transform-"));
		const spec: WorkflowSpec = {
			name: "test-transform",
			description: "test transform step",
			steps: {
				merge: {
					agent: "transform",
					transform: {
						mapping: {
							greeting: "hello",
							count: 42,
							nested: { deep: true },
						},
					},
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.project.yaml"),
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
		assert.strictEqual(result.steps.merge.status, "completed");
		assert.strictEqual(result.steps.merge.agent, "transform");
		const output = result.steps.merge.output as Record<string, unknown>;
		assert.strictEqual(output.greeting, "hello");
		assert.strictEqual(output.count, 42);
		assert.deepStrictEqual(output.nested, { deep: true });

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("costs nothing (usage.cost === 0, usage.turns === 0)", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-transform-"));
		const spec: WorkflowSpec = {
			name: "test-transform-cost",
			description: "test transform zero cost",
			steps: {
				merge: {
					agent: "transform",
					transform: {
						mapping: { result: "free" },
					},
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.project.yaml"),
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
		assert.strictEqual(result.steps.merge.usage.cost, 0);
		assert.strictEqual(result.steps.merge.usage.turns, 0);
		assert.strictEqual(result.steps.merge.usage.input, 0);
		assert.strictEqual(result.steps.merge.usage.output, 0);
		assert.strictEqual(result.totalUsage.cost, 0);
		assert.strictEqual(result.totalUsage.turns, 0);

		fs.rmSync(tmpDir, { recursive: true });
	});
});

// ── Phase 2 integration tests ──
// These exercise combined phase 2 features: when, gate, transform, loop

function defaultOptions(tmpDir?: string) {
	const cwd = tmpDir ?? fs.mkdtempSync(path.join(os.tmpdir(), "wf-p2-"));
	return {
		ctx: mockCtx(cwd),
		pi: mockPi(),
		loadAgent: () => ({ name: "default" }),
	};
}

describe("phase 2 integration", () => {
	it("runs a workflow with when, gate, transform", async () => {
		const spec = makeSpec({
			steps: {
				source: {
					transform: {
						mapping: { data: "initial" },
					},
				},
				check: {
					gate: { check: "echo pass", onPass: "continue" },
				},
				conditional: {
					when: "${{ steps.check.output.passed }}",
					transform: {
						mapping: {
							wasChecked: "${{ steps.check.output.passed }}",
							sourceStatus: "${{ steps.source.status }}",
						},
					},
				},
			},
		});

		const result = await executeWorkflow(spec, {}, defaultOptions());
		assert.strictEqual(result.status, "completed");
		assert.strictEqual(result.steps.check.output.passed, true);
		assert.strictEqual(result.steps.conditional.output.wasChecked, true);
		assert.strictEqual(result.steps.conditional.usage.cost, 0);
	});

	it("skips conditional step when gate fails", async () => {
		const spec = makeSpec({
			steps: {
				check: {
					gate: { check: "exit 1", onFail: "continue" },
				},
				conditional: {
					when: "${{ steps.check.output.passed }}",
					transform: {
						mapping: { result: "should not appear" },
					},
				},
				final: {
					transform: {
						mapping: { done: true },
					},
				},
			},
		});

		const result = await executeWorkflow(spec, {}, defaultOptions());
		assert.strictEqual(result.status, "completed");
		assert.strictEqual(result.steps.check.output.passed, false);
		assert.strictEqual(result.steps.conditional.status, "skipped");
		assert.strictEqual(result.steps.final.status, "completed");
	});

	it("runs a loop with gate break", async () => {
		const spec = makeSpec({
			steps: {
				retry: {
					loop: {
						maxAttempts: 5,
						steps: {
							check: {
								gate: {
									check: "echo pass",
									onPass: "break",
									onFail: "continue",
								},
							},
						},
					},
				},
			},
		});

		const result = await executeWorkflow(spec, {}, defaultOptions());
		assert.strictEqual(result.status, "completed");
		assert.strictEqual(result.steps.retry.output.iterations, 1);
	});

	it("combines transform, loop, and artifacts", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-p2-"));
		const spec: WorkflowSpec = {
			name: "test-combined",
			description: "combined phase 2 test",
			steps: {
				setup: {
					transform: {
						mapping: { prefix: "test" },
					},
				},
				retry: {
					loop: {
						maxAttempts: 2,
						steps: {
							check: {
								gate: {
									check: "echo pass",
									onPass: "break",
									onFail: "continue",
								},
							},
						},
					},
				},
				summary: {
					transform: {
						mapping: {
							setupResult: "${{ steps.setup.output.prefix }}",
							loopIterations: "${{ steps.retry.output.iterations }}",
							loopStatus: "${{ steps.retry.status }}",
						},
					},
				},
			},
			artifacts: {
				report: {
					path: path.join(tmpDir, "artifacts", "summary.json"),
					from: "steps.summary.output",
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.project.yaml"),
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

		// Verify transform output
		const summaryOutput = result.steps.summary.output as Record<string, unknown>;
		assert.strictEqual(summaryOutput.setupResult, "test");
		assert.strictEqual(summaryOutput.loopIterations, 1);
		assert.strictEqual(summaryOutput.loopStatus, "completed");

		// Verify artifact was written
		assert.ok(result.artifacts);
		assert.ok(result.artifacts!.report);
		const artifactContent = JSON.parse(fs.readFileSync(result.artifacts!.report, "utf-8"));
		assert.strictEqual(artifactContent.setupResult, "test");

		fs.rmSync(tmpDir, { recursive: true });
	});
});

describe("parallel execution (DAG-inferred)", () => {
	it("runs independent steps in parallel when they have explicit deps", async () => {
		// Two steps both depend on a source step → they form a parallel layer
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-parallel-"));
		const spec: WorkflowSpec = {
			name: "test-parallel",
			description: "test parallel",
			steps: {
				source: {
					transform: { mapping: { data: "hello" } },
				},
				analyzerA: {
					transform: {
						mapping: { result: "${{ steps.source.output.data }}-A" },
					},
				},
				analyzerB: {
					transform: {
						mapping: { result: "${{ steps.source.output.data }}-B" },
					},
				},
				merge: {
					transform: {
						mapping: {
							a: "${{ steps.analyzerA.output.result }}",
							b: "${{ steps.analyzerB.output.result }}",
						},
					},
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.project.yaml"),
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
		assert.strictEqual(result.steps.source.status, "completed");
		assert.strictEqual(result.steps.analyzerA.status, "completed");
		assert.strictEqual(result.steps.analyzerB.status, "completed");
		assert.strictEqual(result.steps.merge.status, "completed");

		const mergeOutput = result.steps.merge.output as Record<string, unknown>;
		assert.strictEqual(mergeOutput.a, "hello-A");
		assert.strictEqual(mergeOutput.b, "hello-B");

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("fails fast when parallel step fails", async () => {
		// source → (analyzerA, failGate) → merge
		// failGate fails, so merge should not run
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-parallel-"));
		const spec: WorkflowSpec = {
			name: "test-parallel-fail",
			description: "test parallel fail",
			steps: {
				source: {
					transform: { mapping: { data: "hello" } },
				},
				analyzerA: {
					transform: {
						mapping: { result: "${{ steps.source.output.data }}" },
					},
				},
				failGate: {
					gate: { check: "exit 1" },
					when: "${{ steps.source.output.data }}",
				},
				merge: {
					transform: {
						mapping: {
							a: "${{ steps.analyzerA.output.result }}",
							b: "${{ steps.failGate.output }}",
						},
					},
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.project.yaml"),
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
		assert.strictEqual(result.steps.failGate.status, "failed");
		// merge should not have run
		assert.ok(!result.steps.merge);

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("sequential steps without deps remain sequential", async () => {
		// Steps without ${{ steps.X }} deps are sequential by declaration order
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-seq-"));
		const spec: WorkflowSpec = {
			name: "test-seq",
			description: "test sequential",
			steps: {
				a: { transform: { mapping: { x: 1 } } },
				b: { transform: { mapping: { y: 2 } } },
				c: { transform: { mapping: { z: 3 } } },
			},
			source: "project",
			filePath: path.join(tmpDir, "test.project.yaml"),
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
		assert.strictEqual(result.steps.a.status, "completed");
		assert.strictEqual(result.steps.b.status, "completed");
		assert.strictEqual(result.steps.c.status, "completed");

		fs.rmSync(tmpDir, { recursive: true });
	});
});

describe("explicit parallel step", () => {
	it("runs sub-steps concurrently", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-explpar-"));
		const spec: WorkflowSpec = {
			name: "test-explicit-parallel",
			description: "test explicit parallel",
			steps: {
				source: {
					transform: { mapping: { data: "hello" } },
				},
				analyzers: {
					parallel: {
						security: {
							transform: {
								mapping: { result: "${{ steps.source.output.data }}-sec" },
							},
						},
						performance: {
							transform: {
								mapping: { result: "${{ steps.source.output.data }}-perf" },
							},
						},
					},
				},
				merge: {
					transform: {
						mapping: {
							results: "${{ steps.analyzers.output }}",
						},
					},
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.project.yaml"),
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
		assert.strictEqual(result.steps.analyzers.agent, "parallel");
		assert.strictEqual(result.steps.analyzers.status, "completed");
		const output = result.steps.analyzers.output as Record<string, unknown>;
		assert.ok(output.security);
		assert.ok(output.performance);

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("fails if any sub-step fails", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-explpar-fail-"));
		const spec: WorkflowSpec = {
			name: "test-parallel-subfail",
			description: "test parallel sub-step failure",
			steps: {
				both: {
					parallel: {
						good: {
							transform: { mapping: { ok: true } },
						},
						bad: {
							gate: { check: "exit 1", onFail: "fail" },
						},
					},
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.project.yaml"),
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

		assert.strictEqual(result.steps.both.status, "failed");
		assert.strictEqual(result.status, "failed");

		fs.rmSync(tmpDir, { recursive: true });
	});
});

describe("onExhausted error handling", () => {
	it("records expression error in onExhausted result", async () => {
		const spec = makeSpec({
			steps: {
				retry: {
					loop: {
						maxAttempts: 1,
						steps: {
							check: {
								gate: { check: "exit 1", onFail: "continue" },
							},
						},
						onExhausted: {
							agent: "default",
							input: {
								// Reference a non-existent step to trigger expression error
								bad: "${{ steps.nonexistent.required_field }}",
							},
						},
					},
				},
			},
		});

		const result = await executeWorkflow(spec, {}, defaultOptions());
		const loopOutput = result.steps.retry.output;
		// The exhausted step should have run (agent) but with error noted
		assert.ok(loopOutput.lastIteration._exhausted);
	});
});

describe("verify step as typed agent output", () => {
	it("mock dispatch returning verifier-output JSON produces typed step output", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-verify-"));
		const verifierOutput = {
			status: "passed",
			score: "2/2",
			truths: [{ truth: "Tests pass", status: "verified", evidence: "exit code 0" }],
			criteria_results: [
				{ criterion: "Tests pass", verify_method: "command", status: "passed", evidence: "3 passing" },
				{ criterion: "File exists", verify_method: "inspect", status: "passed", evidence: "found" },
			],
			gaps: [],
		};

		const spec: WorkflowSpec = {
			name: "test-verify",
			description: "test verify step",
			steps: {
				implement: {
					transform: {
						mapping: { code: "done", files: ["src/index.ts"] },
					},
				},
				verify: {
					transform: {
						mapping: verifierOutput,
					},
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.project.yaml"),
		};

		const result = await executeWorkflow(
			spec,
			{},
			{
				ctx: mockCtx(tmpDir),
				pi: mockPi(),
				loadAgent: () => ({ name: "verifier" }),
			},
		);

		assert.strictEqual(result.status, "completed");
		assert.strictEqual(result.steps.verify.status, "completed");
		const output = result.steps.verify.output as any;
		assert.strictEqual(output.status, "passed");
		assert.strictEqual(output.score, "2/2");
		assert.strictEqual(output.truths.length, 1);
		assert.strictEqual(output.criteria_results.length, 2);

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("downstream step reads verify output via expressions", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-verify-expr-"));
		const spec: WorkflowSpec = {
			name: "test-verify-expr",
			description: "test verify expression access",
			steps: {
				verify: {
					transform: {
						mapping: {
							status: "gaps_found",
							score: "1/3",
							truths: [{ truth: "Tests pass", status: "verified", evidence: "ok" }],
							criteria_results: [{ criterion: "C1", verify_method: "command", status: "passed", evidence: "ok" }],
							gaps: [{ truth: "Feature X", status: "failed", reason: "Not implemented" }],
						},
					},
				},
				react: {
					transform: {
						mapping: {
							verifyStatus: "${{ steps.verify.output.status }}",
							verifyGaps: "${{ steps.verify.output.gaps }}",
							gapCount: "${{ steps.verify.output.gaps.length }}",
						},
					},
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.project.yaml"),
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
		const reactOutput = result.steps.react.output as any;
		assert.strictEqual(reactOutput.verifyStatus, "gaps_found");
		assert.ok(Array.isArray(reactOutput.verifyGaps));
		assert.strictEqual(reactOutput.verifyGaps.length, 1);
		assert.strictEqual(reactOutput.verifyGaps[0].reason, "Not implemented");
		assert.strictEqual(reactOutput.gapCount, 1);

		fs.rmSync(tmpDir, { recursive: true });
	});
});

// ── Self-implement workflow integration tests ──
// These use transforms to simulate agent outputs, avoiding real subprocess dispatch.

describe("self-implement workflow", () => {
	it("parses and executes with mock data — all steps complete, gate passes", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-self-impl-"));
		const planOutput = {
			plans: [
				{
					name: "step-foreach",
					intent: "Implement forEach step type",
					tasks: ["Create step-foreach.ts", "Add tests"],
					files_to_change: ["src/step-foreach.ts", "src/step-foreach.test.ts"],
					acceptance_criteria: ["forEach iterates array", "Tests pass"],
					context_needed: ["src/types.ts"],
					parallel_group: "a",
				},
				{
					name: "step-command",
					intent: "Implement command step type",
					tasks: ["Create step-command.ts", "Add tests"],
					files_to_change: ["src/step-command.ts", "src/step-command.test.ts"],
					acceptance_criteria: ["Command executes", "Tests pass"],
					context_needed: ["src/types.ts"],
					parallel_group: "a",
				},
			],
		};

		const execResult = {
			status: "complete",
			tasks: [{ name: "implement", status: "done", files_modified: ["src/step-foreach.ts"] }],
			decisions: [],
			issues: [],
			test_count: 5,
			commit_hash: "",
		};

		const verifyOutput = {
			status: "passed",
			score: "3/3",
			truths: [{ truth: "All tests pass", status: "verified", evidence: "exit 0" }],
			criteria_results: [
				{ criterion: "forEach works", verify_method: "command", status: "passed", evidence: "ok" },
				{ criterion: "command works", verify_method: "command", status: "passed", evidence: "ok" },
				{ criterion: "Tests pass", verify_method: "command", status: "passed", evidence: "3 passing" },
			],
			gaps: [],
		};

		// Build a spec that uses transforms to simulate agent outputs
		const spec: WorkflowSpec = {
			name: "self-implement",
			description: "mock self-implement",
			input: {
				type: "object",
				required: ["phaseSpec", "architecture", "conventions"],
				properties: {
					phaseSpec: { type: "object" },
					architecture: { type: "object" },
					conventions: { type: "object" },
				},
			},
			steps: {
				plan: {
					transform: { mapping: planOutput },
				},
				implement: {
					forEach: "${{ steps.plan.output.plans }}",
					as: "plan",
					transform: {
						mapping: execResult,
					},
				},
				verify: {
					transform: { mapping: verifyOutput },
				},
				check: {
					gate: {
						check: "echo '${{ steps.verify.output.status }}' | grep -q passed",
						onFail: "fail",
					},
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.project.yaml"),
		};

		const result = await executeWorkflow(
			spec,
			{
				phaseSpec: { name: "test-phase", success_criteria: [] },
				architecture: { modules: [] },
				conventions: { rules: [] },
			},
			{
				ctx: mockCtx(tmpDir),
				pi: mockPi(),
				loadAgent: () => ({ name: "default" }),
			},
		);

		assert.strictEqual(result.status, "completed");
		assert.strictEqual(result.steps.plan.status, "completed");
		assert.strictEqual(result.steps.implement.status, "completed");
		assert.strictEqual(result.steps.verify.status, "completed");
		assert.strictEqual(result.steps.check.status, "completed");

		// Gate passed
		const gateOutput = result.steps.check.output as { passed: boolean };
		assert.strictEqual(gateOutput.passed, true);

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("fails gate when verification finds gaps", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-self-impl-fail-"));
		const planOutput = {
			plans: [
				{
					name: "plan-a",
					intent: "Do something",
					tasks: ["Task 1"],
					acceptance_criteria: ["Works"],
				},
			],
		};

		const execResult = {
			status: "complete",
			tasks: [{ name: "task-1", status: "done" }],
			decisions: [],
			issues: [],
			test_count: 1,
			commit_hash: "",
		};

		const verifyOutput = {
			status: "gaps_found",
			score: "1/3",
			truths: [{ truth: "Feature missing", status: "failed", evidence: "not found" }],
			criteria_results: [
				{ criterion: "Feature works", verify_method: "inspect", status: "failed", evidence: "missing" },
			],
			gaps: [{ truth: "Feature missing", status: "failed", reason: "Not implemented" }],
		};

		const spec: WorkflowSpec = {
			name: "self-implement-fail",
			description: "mock self-implement with gaps",
			steps: {
				plan: {
					transform: { mapping: planOutput },
				},
				implement: {
					forEach: "${{ steps.plan.output.plans }}",
					as: "plan",
					transform: { mapping: execResult },
				},
				verify: {
					transform: { mapping: verifyOutput },
				},
				check: {
					gate: {
						check: "echo '${{ steps.verify.output.status }}' | grep -q passed",
						onFail: "fail",
					},
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.project.yaml"),
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
		assert.strictEqual(result.steps.check.status, "failed");
		const gateOutput = result.steps.check.output as { passed: boolean };
		assert.strictEqual(gateOutput.passed, false);

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("forEach iterates over plans from decomposition", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-self-impl-foreach-"));
		const planOutput = {
			plans: [
				{ name: "plan-alpha", intent: "Alpha work", tasks: ["A1", "A2"], acceptance_criteria: ["Alpha done"] },
				{ name: "plan-beta", intent: "Beta work", tasks: ["B1"], acceptance_criteria: ["Beta done"] },
				{ name: "plan-gamma", intent: "Gamma work", tasks: ["G1"], acceptance_criteria: ["Gamma done"] },
			],
		};

		const spec: WorkflowSpec = {
			name: "self-implement-foreach",
			description: "test forEach plan iteration",
			steps: {
				plan: {
					transform: { mapping: planOutput },
				},
				implement: {
					forEach: "${{ steps.plan.output.plans }}",
					as: "plan",
					transform: {
						mapping: {
							planName: "${{ plan.name }}",
							planIntent: "${{ plan.intent }}",
						},
					},
				},
			},
			source: "project",
			filePath: path.join(tmpDir, "test.project.yaml"),
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
		assert.strictEqual(result.steps.implement.status, "completed");
		const output = result.steps.implement.output as any[];
		assert.strictEqual(output.length, 3);
		assert.strictEqual(output[0].planName, "plan-alpha");
		assert.strictEqual(output[0].planIntent, "Alpha work");
		assert.strictEqual(output[1].planName, "plan-beta");
		assert.strictEqual(output[2].planName, "plan-gamma");

		fs.rmSync(tmpDir, { recursive: true });
	});
});

describe("kill grace period constant", () => {
	it("uses SIGKILL_GRACE_MS (not hardcoded magic numbers)", async () => {
		// This is a static check — grep the source for hardcoded kill timeouts
		const { readFileSync } = await import("node:fs");
		const executorSrc = readFileSync(new URL("./workflow-executor.ts", import.meta.url), "utf-8");
		const dispatchSrc = readFileSync(new URL("./dispatch.ts", import.meta.url), "utf-8");

		// Verify SIGKILL_GRACE_MS is defined
		assert.ok(executorSrc.includes("SIGKILL_GRACE_MS"));
		assert.ok(dispatchSrc.includes("SIGKILL_GRACE_MS"));

		// Verify no remaining hardcoded kill timeouts (2000, 3000, 5000 near SIGKILL)
		const hardcodedPattern = /setTimeout.*(?:2000|5000).*SIGKILL|SIGKILL.*(?:2000|5000)/;
		assert.ok(!hardcodedPattern.test(executorSrc), "workflow-executor.ts still has hardcoded kill timeout");
		assert.ok(!hardcodedPattern.test(dispatchSrc), "dispatch.ts still has hardcoded kill timeout");
	});
});
