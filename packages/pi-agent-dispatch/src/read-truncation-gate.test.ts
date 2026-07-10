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

describe("read-truncation-gate — TruncationResult variant: truncatedBy='bytes'", () => {
	it("handler + directive correctly handle a bytes-cap truncation (file exceeded maxBytes before maxLines)", async () => {
		// Synthetic shape per truncate.d.ts:13-36: a file whose first 50 lines
		// already exceeded the 51200-byte cap; truncation triggered on bytes,
		// not lines. outputLines=totalLines=50 means all lines that fit were
		// returned; the file continues for many more bytes worth of content
		// (totalBytes=120000) that the line accounting alone does not surface.
		const truncation: TruncationProjection = {
			truncated: true,
			truncatedBy: "bytes",
			outputLines: 50,
			totalLines: 50,
			outputBytes: 51200,
			totalBytes: 120000,
			maxLines: 2000,
			maxBytes: 51200,
			lastLinePartial: true,
			firstLineExceedsLimit: false,
		};
		const event = mockReadResultEvent({ path: "/repo/wide-lines.txt", truncation });
		const result = await readTruncationGateHandler(event, mockCtx());
		assert.ok(result, "handler returns non-undefined result on truncated bytes-variant read");
		assert.ok(Array.isArray(result?.content), "content array present");
		const text = (result?.content?.[0] as { type: "text"; text: string }).text;
		// All 6 canonical strings present (per existing canonical-phrases test pattern).
		assert.ok(text.includes("⚠️"), "directive includes ⚠️ prefix");
		assert.ok(text.includes("TRUNCATED"), "directive includes TRUNCATED");
		assert.ok(text.includes("INCOMPLETE"), "directive includes INCOMPLETE");
		assert.ok(text.includes("do NOT"), "directive includes 'do NOT'");
		assert.ok(text.includes("offset="), "directive includes offset= continuation hint");
		assert.ok(text.includes("grep"), "directive includes grep alternative");
		// Byte counts surfaced numerically (bytes-variant is the discriminating signal).
		assert.match(text, /51200 bytes/, "outputBytes=51200 rendered");
		assert.match(text, /120000 bytes/, "totalBytes=120000 rendered");
		// nextOffset := outputLines per the existing convention in buildTruncationDirective.
		// On a bytes-variant truncation, outputLines reflects whole lines that fit; the
		// directive's continuation hint still uses that value.
		assert.match(text, /offset=50/, "nextOffset (=outputLines=50) rendered in continuation hint");
		// Corrected behavior (the read-truncation refusal-directive fix's handling
		// of the bytes-cap case): truncatedBy='bytes'
		// surfaces an explicit BYTES-cap signal + warns that paginating-by-lines
		// may again exceed the byte cap on the next page. Without this, the agent
		// can loop offset=50 -> offset=100 -> ... hitting the same byte ceiling
		// silently. Match case-sensitively on BYTES to ensure the discriminating
		// uppercase token is present (not the generic lowercase 'bytes' from numeric
		// counts).
		assert.match(text, /BYTES cap/, "bytes-variant surfaces explicit 'BYTES cap' signal");
		assert.match(
			text,
			/paginating by line offset may again exceed the byte cap/,
			"bytes-variant warns paginating-by-lines may again exceed byte cap on next page",
		);
		// lastLinePartial=true: corrected directive also surfaces the partial-line
		// warning since this variant sets it. See the lastLinePartial test below
		// for the dedicated assertion; here we confirm the bytes-variant directive
		// also carries the partial-line clause when both signals are set.
		assert.match(
			text,
			/last returned line was cut mid-content/,
			"lastLinePartial=true clause present on combined-signal variant",
		);
	});
});

describe("read-truncation-gate — TruncationResult variant: firstLineExceedsLimit=true", () => {
	it("handler + directive handle single-line file whose first line alone exceeds the byte cap (outputLines=0)", async () => {
		// Synthetic shape per truncate.d.ts: a 95000-byte single-line file
		// where the first (only) line exceeds maxBytes=51200, so the truncator
		// returned 0 complete lines + 0 bytes of usable line-aligned content.
		// firstLineExceedsLimit=true is the discriminating signal.
		const truncation: TruncationProjection = {
			truncated: true,
			truncatedBy: "bytes",
			outputLines: 0,
			totalLines: 1,
			outputBytes: 0,
			totalBytes: 95000,
			maxLines: 2000,
			maxBytes: 51200,
			lastLinePartial: false,
			firstLineExceedsLimit: true,
		};
		const event = mockReadResultEvent({ path: "/repo/minified.bundle.js", truncation });
		const result = await readTruncationGateHandler(event, mockCtx());
		assert.ok(result, "handler returns non-undefined result on firstLineExceedsLimit variant");
		assert.ok(Array.isArray(result?.content), "content array present");
		const text = (result?.content?.[0] as { type: "text"; text: string }).text;
		// Canonical strings present (offset= clause IS suppressed for this variant —
		// see explicit assertion below — so it is excluded from this canonical-set check).
		assert.ok(text.includes("⚠️"), "directive includes ⚠️ prefix");
		assert.ok(text.includes("TRUNCATED"), "directive includes TRUNCATED");
		assert.ok(text.includes("INCOMPLETE"), "directive includes INCOMPLETE");
		assert.ok(text.includes("do NOT"), "directive includes 'do NOT'");
		assert.ok(text.includes("grep"), "directive includes grep alternative");
		// Numeric counts surface; outputLines=0 + outputBytes=0 are the discriminator.
		assert.match(text, /0 lines/, "outputLines=0 rendered");
		assert.match(text, /1 lines/, "totalLines=1 rendered");
		assert.match(text, /0 bytes/, "outputBytes=0 rendered");
		assert.match(text, /95000 bytes/, "totalBytes=95000 rendered");
		// Corrected behavior (the read-truncation refusal-directive fix's handling
		// of the first-line-exceeds-limit case): when firstLineExceedsLimit=true,
		// pagination via `offset=N` is operationally meaningless (offset=0 re-fires the
		// same truncation; offset>=1 jumps past the unreadable line losing its content).
		// The directive MUST NOT surface an `offset=...` continuation hint for this
		// variant — its presence would send the agent into a no-op retry loop.
		assert.ok(!text.includes("offset=0"), "firstLineExceedsLimit suppresses the meaningless `offset=0` clause");
		assert.ok(
			!/offset=\d+/.test(text),
			"firstLineExceedsLimit suppresses any `offset=N` continuation hint (operationally meaningless)",
		);
		// Directive instead names the two operationally-useful next actions: grep
		// for targeted search within the over-long line, and bash sed+head for
		// byte-range slicing of the single line.
		assert.match(
			text,
			/first line ALONE exceeds the read byte cap/,
			"firstLineExceedsLimit surfaces the explicit single-line-too-long signal",
		);
		assert.match(
			text,
			/sed -n '1p' \/repo\/minified\.bundle\.js \| head -c 51200/,
			"firstLineExceedsLimit surfaces the bash sed | head -c byte-range-slicing alternative for the over-long line",
		);
		// The directive does not crash and produces well-formed text (length > 200 chars
		// is a coarse smoke-check that the template was fully rendered, not aborted).
		assert.ok(text.length > 200, "directive is well-formed even with zero-value numeric fields");
	});
});

describe("read-truncation-gate — TruncationResult variant: lastLinePartial=true", () => {
	it("handler + directive handle lines-cap truncation where the last returned line is partial", async () => {
		// Synthetic shape per truncate.d.ts: 2000 lines emitted (the line cap),
		// but the 2000th line itself was cut mid-content because the byte cap
		// landed inside it. lastLinePartial=true is the discriminating signal.
		const truncation: TruncationProjection = {
			truncated: true,
			truncatedBy: "lines",
			outputLines: 2000,
			totalLines: 5000,
			outputBytes: 48000,
			totalBytes: 120000,
			maxLines: 2000,
			maxBytes: 51200,
			lastLinePartial: true,
			firstLineExceedsLimit: false,
		};
		const event = mockReadResultEvent({ path: "/repo/log.txt", truncation });
		const result = await readTruncationGateHandler(event, mockCtx());
		assert.ok(result, "handler returns non-undefined result on lastLinePartial variant");
		assert.ok(Array.isArray(result?.content), "content array present");
		const text = (result?.content?.[0] as { type: "text"; text: string }).text;
		// All 6 canonical strings present.
		assert.ok(text.includes("⚠️"), "directive includes ⚠️ prefix");
		assert.ok(text.includes("TRUNCATED"), "directive includes TRUNCATED");
		assert.ok(text.includes("INCOMPLETE"), "directive includes INCOMPLETE");
		assert.ok(text.includes("do NOT"), "directive includes 'do NOT'");
		assert.ok(text.includes("offset="), "directive includes offset= continuation hint");
		assert.ok(text.includes("grep"), "directive includes grep alternative");
		// Line counts + offset surface.
		assert.match(text, /2000 lines/, "outputLines=2000 rendered");
		assert.match(text, /5000 lines/, "totalLines=5000 rendered");
		assert.match(text, /offset=2000/, "nextOffset (=outputLines=2000) rendered in continuation hint");
		// Corrected behavior (the read-truncation refusal-directive fix's handling
		// of the partial-last-line case): lastLinePartial=true
		// signals the last returned line was cut mid-content (mid-JSON-object, mid-
		// source-expression, mid-log-entry). The directive MUST surface this so the
		// agent does not trust the terminal characters of the returned content.
		assert.match(
			text,
			/last returned line was cut mid-content/,
			"lastLinePartial=true surfaces the partial-last-line warning to the agent",
		);
		assert.match(
			text,
			/do not trust its trailing characters/,
			"lastLinePartial=true names the do-not-trust-trailing-characters guidance",
		);
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
