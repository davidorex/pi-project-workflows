/**
 * Unit tests for auth-gate (FGAP-134).
 *
 * Aim: verify the pi.on('tool_call') handler enforces user-confirmation
 * on the 14 Bucket-2 sensitive tools while passing other tool calls
 * through unchanged. The tests invoke `authGateHandler` directly with
 * synthetic ToolCallEvent + ExtensionContext shapes; no pi runtime is
 * required. The registration helper `registerAuthGate` is exercised by
 * the extension-load smoke test in index.test.ts (FGAP-134 plan step 3).
 *
 * Mock shape notes:
 *   - ctx is `as unknown as ExtensionContext` so we only need the
 *     fields the handler reads (`hasUI`, `ui.confirm`). This matches
 *     the precedent in work-order-loop.test.ts:18-32.
 *   - event is `as unknown as ToolCallEvent` so we only need the
 *     fields the handler reads (`toolName`, `input`). The actual
 *     ToolCallEvent union (BashToolCallEvent | ... | CustomToolCallEvent)
 *     does not surface in handler logic — only toolName + input are
 *     consulted.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExtensionContext, ToolCallEvent } from "@earendil-works/pi-coding-agent";
import { AUTH_REQUIRED_TOOLS, authGateHandler } from "./auth-gate.js";

interface ConfirmCall {
	title: string;
	message: string;
}

function mockCtx(opts: { hasUI: boolean; confirmAnswer?: boolean }): {
	ctx: ExtensionContext;
	calls: ConfirmCall[];
} {
	const calls: ConfirmCall[] = [];
	const ctx = {
		hasUI: opts.hasUI,
		ui: {
			confirm: async (title: string, message: string) => {
				calls.push({ title, message });
				return opts.confirmAnswer ?? true;
			},
		},
	} as unknown as ExtensionContext;
	return { ctx, calls };
}

function mockEvent(toolName: string, input: Record<string, unknown> = {}): ToolCallEvent {
	return {
		type: "tool_call",
		toolCallId: "test-call-1",
		toolName,
		input,
	} as unknown as ToolCallEvent;
}

describe("auth-gate — AUTH_REQUIRED_TOOLS canonical Bucket-2 list", () => {
	it("contains all 15 canonical Bucket-2 tool names (FGAP-134 + FGAP-136 extension)", () => {
		// Aim: pin the list verbatim against the FGAP-134 plan + the
		// FGAP-136 write-schema-migration extension so future substrate
		// evolutions surface as test failures requiring an explicit canon
		// update rather than a silent membership drift.
		const expected = new Set<string>([
			"author-agent-spec",
			"author-tool-grant",
			"commit-attested",
			"write-schema",
			"write-schema-migration",
			"amend-config",
			"write-block",
			"rename-canonical-id",
			"context-init",
			"context-accept-all",
			"workflow-execute",
			"workflow-resume",
			"workflow-init",
			"monitors-control",
			"monitors-rules",
		]);
		assert.strictEqual(AUTH_REQUIRED_TOOLS.length, expected.size);
		const actual = new Set<string>(AUTH_REQUIRED_TOOLS);
		assert.deepStrictEqual(actual, expected, `AUTH_REQUIRED_TOOLS drift; got: ${[...actual].sort().join(", ")}`);
	});
});

describe("auth-gate — Bucket-2 tool with hasUI=false (non-interactive refusal)", () => {
	it("returns block:true with reason naming non-interactive ctx (commit-attested case)", async () => {
		const { ctx, calls } = mockCtx({ hasUI: false });
		const event = mockEvent("commit-attested", { agent_id: "spec-impl-001", files: ["x.ts"], message: "msg" });
		const result = await authGateHandler(event, ctx);
		assert.ok(result, "expected non-void result");
		assert.strictEqual(result?.block, true);
		assert.match(result?.reason ?? "", /non-interactive/);
		assert.match(result?.reason ?? "", /commit-attested/);
		assert.match(result?.reason ?? "", /ctx\.hasUI=false/);
		assert.strictEqual(calls.length, 0, "confirm must NOT be called when hasUI=false");
	});
});

describe("auth-gate — Bucket-2 tool with hasUI=true + operator accepts", () => {
	it("returns void (allow) when ctx.ui.confirm resolves true (author-agent-spec case)", async () => {
		const { ctx, calls } = mockCtx({ hasUI: true, confirmAnswer: true });
		const event = mockEvent("author-agent-spec", { spec: { name: "x" } });
		const result = await authGateHandler(event, ctx);
		assert.strictEqual(result, undefined, `expected void/undefined; got ${JSON.stringify(result)}`);
		assert.strictEqual(calls.length, 1, "confirm must be called exactly once");
	});
});

describe("auth-gate — Bucket-2 tool with hasUI=true + operator declines", () => {
	it("returns block:true with reason='user declined' when ctx.ui.confirm resolves false", async () => {
		const { ctx, calls } = mockCtx({ hasUI: true, confirmAnswer: false });
		const event = mockEvent("author-tool-grant", { entry: { canonical_id: "read-files:foo" } });
		const result = await authGateHandler(event, ctx);
		assert.ok(result, "expected non-void result");
		assert.strictEqual(result?.block, true);
		assert.strictEqual(result?.reason, "user declined");
		assert.strictEqual(calls.length, 1);
	});
});

describe("auth-gate — non-Bucket-2 tool passes through", () => {
	it("returns void without invoking confirm for tools NOT in AUTH_REQUIRED_TOOLS (read-block case)", async () => {
		const { ctx, calls } = mockCtx({ hasUI: true, confirmAnswer: false /* would refuse if invoked */ });
		const event = mockEvent("read-block", { name: "tasks" });
		const result = await authGateHandler(event, ctx);
		assert.strictEqual(result, undefined, "non-Bucket-2 tool must pass through (void return)");
		assert.strictEqual(calls.length, 0, "confirm must NOT be called for non-Bucket-2 tools");
	});

	it("returns void without invoking confirm for call-agent (privileged but agent-callable)", async () => {
		const { ctx, calls } = mockCtx({ hasUI: true, confirmAnswer: false });
		const event = mockEvent("call-agent", { agent_id: "x" });
		const result = await authGateHandler(event, ctx);
		assert.strictEqual(result, undefined);
		assert.strictEqual(calls.length, 0);
	});

	it("returns void without invoking confirm for SDK built-in (bash)", async () => {
		const { ctx, calls } = mockCtx({ hasUI: true, confirmAnswer: false });
		const event = mockEvent("bash", { command: "ls" });
		const result = await authGateHandler(event, ctx);
		assert.strictEqual(result, undefined);
		assert.strictEqual(calls.length, 0);
	});
});

describe("auth-gate — confirm message rendering", () => {
	it("message contains tool-name + arg-summary (top-level keys, string values truncated)", async () => {
		const { ctx, calls } = mockCtx({ hasUI: true, confirmAnswer: true });
		const event = mockEvent("write-schema", {
			schema_name: "tasks",
			content: "x".repeat(200),
			nested: { deep: "value" },
			tags: ["a", "b", "c"],
		});
		await authGateHandler(event, ctx);
		assert.strictEqual(calls.length, 1);
		const { title, message } = calls[0];
		assert.match(title, /Authorize write-schema/, `title shape; got ${title}`);
		assert.match(message, /tool write-schema requested/, `message shape; got ${message}`);
		assert.match(message, /schema_name="tasks"/, "top-level string keys rendered");
		// 200-char string truncated to ~80 chars + ellipsis
		assert.match(message, /content="x{80}…"/, "long string values truncated with ellipsis");
		// Nested object rendered as opaque placeholder
		assert.match(message, /nested=\{\.\.\.\}/, "nested objects rendered as opaque placeholder");
		// Array rendered as length-tagged placeholder
		assert.match(message, /tags=\[3 item\(s\)\]/, "arrays rendered as length-tagged placeholder");
	});
});
