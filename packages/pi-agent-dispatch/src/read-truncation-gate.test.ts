/**
 * Unit tests for read-truncation-gate.
 *
 * Aim: verify the pi.on('tool_result') handler intercepts pi `read`
 * tool results, replaces content with a hard-refusal directive when
 * details.truncation.truncated is true, and passes through unchanged
 * otherwise. Tests invoke `readTruncationGateHandler` and
 * `buildTruncationDirective` directly with synthetic ToolResultEvent +
 * ExtensionContext shapes; no pi runtime is required. The registration
 * helper `registerReadTruncationGate` is wired into the factory by
 * `index.ts` (covered by the extension-load smoke surface).
 *
 * Mock shape notes:
 *   - ctx is `as unknown as ExtensionContext` because the handler does
 *     not consult any ctx field (read-truncation is content-replacement,
 *     not authorization);
 *   - event is `as unknown as ToolResultEvent` because the handler only
 *     reads `toolName`, `details`, `input`. The actual ReadToolResultEvent
 *     discriminator narrowing happens through the toolName === "read"
 *     filter; the test factory matches the structural shape pi emits.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExtensionContext, ToolResultEvent } from "@earendil-works/pi-coding-agent";
import {
	buildTruncationDirective,
	readTruncationGateHandler,
	type TruncationProjection,
} from "./read-truncation-gate.js";

interface MockReadResultOpts {
	toolName?: string;
	path?: string;
	content?: string;
	truncation?: TruncationProjection | undefined;
}

function mockReadResultEvent(opts: MockReadResultOpts = {}): ToolResultEvent {
	const toolName = opts.toolName ?? "read";
	const path = opts.path ?? "/tmp/example.txt";
	const content = opts.content ?? "line 1\nline 2\n";
	return {
		type: "tool_result",
		toolCallId: "test-result-1",
		toolName,
		input: { path },
		content: [{ type: "text", text: content }],
		details: opts.truncation !== undefined ? { truncation: opts.truncation } : undefined,
		isError: false,
	} as unknown as ToolResultEvent;
}

function mockCtx(): ExtensionContext {
	return {} as unknown as ExtensionContext;
}

describe("read-truncation-gate — handler intercepts truncated read", () => {
	it("returns content-replacement ToolResultEventResult when details.truncation.truncated is true", async () => {
		const truncation: TruncationProjection = {
			truncated: true,
			truncatedBy: "lines",
			outputLines: 2000,
			totalLines: 5000,
			outputBytes: 51200,
			totalBytes: 130000,
			maxLines: 2000,
			maxBytes: 51200,
		};
		const event = mockReadResultEvent({ path: "/repo/src/big.ts", truncation });
		const result = await readTruncationGateHandler(event, mockCtx());
		assert.ok(result, "expected non-void result for truncated read");
		assert.ok(Array.isArray(result?.content), "expected content array on result");
		assert.strictEqual(result?.content?.length, 1, "expected single directive content item");
		assert.strictEqual(result?.content?.[0].type, "text");
		assert.strictEqual(
			result?.isError,
			false,
			"isError must be false; the read succeeded — only completeness is at issue",
		);
	});
});

describe("read-truncation-gate — handler passes through non-truncated read", () => {
	it("returns undefined when details.truncation.truncated is false (read was complete)", async () => {
		const truncation: TruncationProjection = {
			truncated: false,
			truncatedBy: null,
			outputLines: 50,
			totalLines: 50,
			outputBytes: 1024,
			totalBytes: 1024,
		};
		const event = mockReadResultEvent({ truncation });
		const result = await readTruncationGateHandler(event, mockCtx());
		assert.strictEqual(result, undefined, "non-truncated read must pass through (undefined)");
	});

	it("returns undefined when details.truncation is entirely absent (defensive guard)", async () => {
		const event = mockReadResultEvent({ truncation: undefined });
		const result = await readTruncationGateHandler(event, mockCtx());
		assert.strictEqual(result, undefined, "absent truncation field must pass through");
	});
});

describe("read-truncation-gate — handler passes through non-read tools", () => {
	it("returns undefined when toolName !== 'read' (bash case)", async () => {
		// Even with a truncated-looking details payload, a non-read tool must pass through.
		const event = mockReadResultEvent({
			toolName: "bash",
			truncation: { truncated: true, outputLines: 100, totalLines: 500 },
		});
		const result = await readTruncationGateHandler(event, mockCtx());
		assert.strictEqual(result, undefined, "non-read tool must pass through regardless of details shape");
	});

	it("returns undefined when toolName !== 'read' (grep case)", async () => {
		const event = mockReadResultEvent({
			toolName: "grep",
			truncation: { truncated: true, outputLines: 10, totalLines: 100 },
		});
		const result = await readTruncationGateHandler(event, mockCtx());
		assert.strictEqual(result, undefined);
	});
});

describe("read-truncation-gate — directive composition includes exact line/byte counts", () => {
	it("directive renders outputLines, totalLines, outputBytes, totalBytes, nextOffset from TruncationResult", () => {
		const truncation: TruncationProjection = {
			truncated: true,
			truncatedBy: "lines",
			outputLines: 2000,
			totalLines: 7350,
			outputBytes: 51200,
			totalBytes: 187500,
		};
		const directive = buildTruncationDirective({ path: "/repo/x.ts" }, truncation);
		assert.match(directive, /2000 lines/, "outputLines rendered");
		assert.match(directive, /7350 lines/, "totalLines rendered");
		assert.match(directive, /51200 bytes/, "outputBytes rendered");
		assert.match(directive, /187500 bytes/, "totalBytes rendered");
		// nextOffset := outputLines per pi's read.js marker convention
		assert.match(directive, /offset=2000/, "nextOffset (=outputLines) rendered in continuation hint");
	});

	it("directive renders '?' for absent numeric fields (partial TruncationResult is still readable)", () => {
		const truncation: TruncationProjection = { truncated: true };
		const directive = buildTruncationDirective({ path: "/x" }, truncation);
		assert.match(directive, /\? lines/, "absent outputLines/totalLines render as ?");
		assert.match(directive, /\? bytes/, "absent outputBytes/totalBytes render as ?");
		assert.match(directive, /offset=\?/, "absent nextOffset renders as ? in continuation hint");
	});
});

describe("read-truncation-gate — directive names file path from event.input.path", () => {
	it("directive embeds the file path as a backticked code reference", () => {
		const truncation: TruncationProjection = { truncated: true, outputLines: 100, totalLines: 200 };
		const directive = buildTruncationDirective({ path: "/repo/very/specific/file.json" }, truncation);
		assert.match(directive, /`\/repo\/very\/specific\/file\.json`/, "path rendered in backticks");
	});

	it("directive falls back to '<unknown>' when input.path is missing (defensive guard)", () => {
		const truncation: TruncationProjection = { truncated: true, outputLines: 100, totalLines: 200 };
		const directiveEmpty = buildTruncationDirective({}, truncation);
		assert.match(directiveEmpty, /`<unknown>`/, "absent input.path renders as <unknown>");
		const directiveUndef = buildTruncationDirective(undefined, truncation);
		assert.match(directiveUndef, /`<unknown>`/, "undefined input renders as <unknown>");
		// Non-string path also falls back
		const directiveBogus = buildTruncationDirective({ path: 42 as unknown as string }, truncation);
		assert.match(directiveBogus, /`<unknown>`/, "non-string input.path renders as <unknown>");
	});

	it("handler-issued directive embeds the path from event.input.path end-to-end", async () => {
		const truncation: TruncationProjection = { truncated: true, outputLines: 2000, totalLines: 5000 };
		const event = mockReadResultEvent({ path: "/repo/end-to-end.ts", truncation });
		const result = await readTruncationGateHandler(event, mockCtx());
		const text = (result?.content?.[0] as { type: "text"; text: string }).text;
		assert.match(text, /`\/repo\/end-to-end\.ts`/, "path from event.input.path appears in handler-issued directive");
	});
});

describe("read-truncation-gate — directive contains canonical-model phrases", () => {
	it("directive contains the canonical-model strings: ⚠️, TRUNCATED, INCOMPLETE, do NOT, offset=, grep", () => {
		const truncation: TruncationProjection = {
			truncated: true,
			outputLines: 2000,
			totalLines: 5000,
			outputBytes: 51200,
			totalBytes: 130000,
		};
		const directive = buildTruncationDirective({ path: "/x" }, truncation);
		assert.ok(directive.includes("⚠️"), "directive includes ⚠️ prefix (canonical hard-refusal marker)");
		assert.ok(directive.includes("TRUNCATED"), "directive includes TRUNCATED");
		assert.ok(directive.includes("INCOMPLETE"), "directive includes INCOMPLETE");
		assert.ok(directive.includes("do NOT"), "directive includes 'do NOT' (do-not-proceed framing)");
		assert.ok(directive.includes("offset="), "directive includes offset= continuation hint");
		assert.ok(directive.includes("grep"), "directive includes grep alternative");
	});

	it("directive includes the 'truncated head is NOT returned' clause (hard-refusal semantic)", () => {
		const truncation: TruncationProjection = { truncated: true, outputLines: 100, totalLines: 1000 };
		const directive = buildTruncationDirective({ path: "/x" }, truncation);
		assert.match(directive, /truncated head is NOT returned/, "clause enforces directive-is-the-content semantic");
	});
});

describe("read-truncation-gate — buildTruncationDirective is a pure function", () => {
	it("identical inputs yield identical output across repeated calls (no I/O, no hidden state)", () => {
		const input = { path: "/repo/pure.ts" };
		const truncation: TruncationProjection = {
			truncated: true,
			outputLines: 2000,
			totalLines: 9999,
			outputBytes: 51200,
			totalBytes: 256000,
		};
		const a = buildTruncationDirective(input, truncation);
		const b = buildTruncationDirective(input, truncation);
		assert.strictEqual(a, b, "pure function: two calls with same args produce identical output");
		// Run a third call with a deep-equal-but-not-same-reference input; still identical.
		const c = buildTruncationDirective({ path: "/repo/pure.ts" }, { ...truncation });
		assert.strictEqual(a, c, "pure function: equivalent-but-distinct refs yield identical output");
	});
});
