import assert from "node:assert";
import { describe, it } from "node:test";
import { resolveCompletion } from "./completion.js";
import type { CompletionSpec, StepResult, StepUsage, WorkflowResult } from "./types.js";

const usage: StepUsage = { input: 1000, output: 500, cacheRead: 0, cacheWrite: 0, cost: 0.03, turns: 2 };

const stepResult: StepResult = {
	step: "summarize",
	agent: "summarizer",
	status: "completed",
	output: { headline: "Found 3 issues" },
	textOutput: "The codebase has 3 critical issues.",
	usage,
	durationMs: 45000,
};

const result: WorkflowResult = {
	workflow: "explore-summarize",
	runId: "explore-summarize-20260313-120000-abcd",
	status: "completed",
	steps: { summarize: stepResult },
	output: { headline: "Found 3 issues" },
	totalUsage: { input: 2000, output: 1000, cacheRead: 0, cacheWrite: 0, cost: 0.05, turns: 4 },
	totalDurationMs: 92000,
	runDir: "/tmp/runs/explore-summarize-20260313-120000-abcd",
};

const input = { path: "/src", question: "What are the main components?" };

describe("resolveCompletion", () => {
	describe("template form", () => {
		it("resolves expressions in template", () => {
			const spec: CompletionSpec = {
				template: "## Results\n\n${{ steps.summarize.textOutput }}\n\nDone in ${{ totalDurationMs | duration }}.",
			};
			const content = resolveCompletion(spec, result, input);
			assert.ok(content.includes("## Results"));
			assert.ok(content.includes("The codebase has 3 critical issues."));
			assert.ok(content.includes("Done in 1m32s."));
		});

		it("resolves input and workflow metadata in template", () => {
			const spec: CompletionSpec = {
				template: "Explored ${{ input.path }} for workflow '${{ workflow }}'. Status: ${{ status }}.",
			};
			const content = resolveCompletion(spec, result, input);
			assert.strictEqual(content, "Explored /src for workflow 'explore-summarize'. Status: completed.");
		});

		it("applies currency filter in template", () => {
			const spec: CompletionSpec = {
				template: "Cost: ${{ totalUsage.cost | currency }}",
			};
			const content = resolveCompletion(spec, result, input);
			assert.strictEqual(content, "Cost: $0.05");
		});

		it("includes runDir in template", () => {
			const spec: CompletionSpec = {
				template: "Logs at: ${{ runDir }}/sessions/",
			};
			const content = resolveCompletion(spec, result, input);
			assert.strictEqual(content, "Logs at: /tmp/runs/explore-summarize-20260313-120000-abcd/sessions/");
		});

		it("renders undefined as empty in template", () => {
			const spec: CompletionSpec = {
				template: "Answer: ${{ input.nonexistent }}",
			};
			const content = resolveCompletion(spec, result, input);
			assert.strictEqual(content, "Answer: ");
		});
	});

	describe("message form", () => {
		it("resolves message with no include", () => {
			const spec: CompletionSpec = {
				message: "Present the findings to the user. The workflow '${{ workflow }}' is done.",
			};
			const content = resolveCompletion(spec, result, input);
			assert.ok(content.includes("Present the findings to the user."));
			assert.ok(content.includes("'explore-summarize' is done."));
		});

		it("resolves message with include paths", () => {
			const spec: CompletionSpec = {
				message: "Show the user these results.",
				include: ["steps.summarize.textOutput", "totalUsage"],
			};
			const content = resolveCompletion(spec, result, input);
			assert.ok(content.includes("Show the user these results."));
			assert.ok(content.includes("steps.summarize.textOutput"));
			assert.ok(content.includes("The codebase has 3 critical issues."));
			assert.ok(content.includes("totalUsage"));
			assert.ok(content.includes('"cost"'));
		});

		it("formats included objects as JSON blocks", () => {
			const spec: CompletionSpec = {
				message: "Review:",
				include: ["steps.summarize.output"],
			};
			const content = resolveCompletion(spec, result, input);
			assert.ok(content.includes("```json"));
			assert.ok(content.includes('"headline"'));
		});

		it("formats included primitives as plain text", () => {
			const spec: CompletionSpec = {
				message: "Data:",
				include: ["steps.summarize.textOutput"],
			};
			const content = resolveCompletion(spec, result, input);
			assert.ok(content.includes("The codebase has 3 critical issues."));
			// Primitive values should NOT be in JSON blocks
			assert.ok(!content.includes("```json\nThe codebase"));
		});
	});

	describe("error handling", () => {
		it("throws on invalid expression in template", () => {
			const spec: CompletionSpec = {
				template: "Bad: ${{ steps.nonexistent.output }}",
			};
			assert.throws(
				() => resolveCompletion(spec, result, input),
				(err: unknown) => err instanceof Error && err.message.includes("nonexistent"),
			);
		});

		it("throws on invalid include path", () => {
			const spec: CompletionSpec = {
				message: "ok",
				include: ["steps.nonexistent.output"],
			};
			assert.throws(
				() => resolveCompletion(spec, result, input),
				(err: unknown) => err instanceof Error && err.message.includes("nonexistent"),
			);
		});
	});
});
