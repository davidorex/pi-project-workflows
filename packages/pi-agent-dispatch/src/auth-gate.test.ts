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
import { afterEach, beforeEach, describe, it } from "node:test";
import type { ExtensionContext, ToolCallEvent } from "@earendil-works/pi-coding-agent";
import { AUTH_REQUIRED_TOOLS, authGateHandler } from "./auth-gate.js";
import { _resetVerifiedIdentityCache, getVerifiedOperatorIdentity } from "./verified-identity.js";

/**
 * The auth-gate calls getVerifiedOperatorIdentity() with no deps, so its
 * resolution path runs against real git config + real process.env in
 * tests too. To make the identity-stamp behavioral tests deterministic
 * the suite primes the module-level cache via a fixture call that
 * supplies dep stubs, then resets it after each test so behavior is not
 * leaked between tests.
 */
function primeIdentityCache(value: string | null): void {
	_resetVerifiedIdentityCache();
	getVerifiedOperatorIdentity({
		runGitConfig: () => (value === null ? null : value),
		getEnvUser: () => null,
		emitWarning: () => {},
	});
}

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

// Reset the verified-identity cache before each test so the absence of an
// explicit prime cannot leak a value from an earlier test. The existing 5
// behavioral suites do not consult event.input.writer post-handler so they
// are unaffected by what (if anything) was stamped; the new mutation suite
// primes the cache explicitly.
beforeEach(() => {
	_resetVerifiedIdentityCache();
});

afterEach(() => {
	_resetVerifiedIdentityCache();
});

describe("auth-gate — AUTH_REQUIRED_TOOLS canonical Bucket-2 list", () => {
	it("contains all 17 canonical Bucket-2 tool names (FGAP-134 + FGAP-136 + TASK-094 extensions)", () => {
		// Aim: pin the list verbatim against the FGAP-134 plan + the
		// FGAP-136 write-schema-migration extension + the TASK-094
		// /context switch family extension (context-switch + context-archive;
		// context-list is read-only and intentionally NOT in the gated set)
		// so future substrate evolutions surface as test failures requiring
		// an explicit canon update rather than a silent membership drift.
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
			"context-switch",
			"context-archive",
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

	it("context-switch + context-archive are in the gated set; context-list is NOT (TASK-094 read-only exception)", () => {
		// Targeted assertion on the TASK-094 additions so a regression that
		// inadvertently flips context-list into the gated set (or drops the
		// mutation tools out of it) surfaces as a focused failure rather than
		// only through the deepStrictEqual canon pin.
		const set = new Set<string>(AUTH_REQUIRED_TOOLS);
		assert.ok(set.has("context-switch"), "context-switch must be gated (mutates .pi-context.json)");
		assert.ok(set.has("context-archive"), "context-archive must be gated (renames substrate dir)");
		assert.equal(set.has("context-list"), false, "context-list must NOT be gated (read-only enumeration)");
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

describe("auth-gate — identity-stamp mutation on confirm=true", () => {
	it("Bucket-2 tool + confirm=true + verified identity present → event.input.writer overwritten to verified value (agent-supplied user REPLACED)", async () => {
		primeIdentityCache("verified@example.com");
		const { ctx } = mockCtx({ hasUI: true, confirmAnswer: true });
		const input: Record<string, unknown> = {
			name: "agent-x",
			spec: { role: "sensor" },
			writer: { kind: "agent", user: "alice@bogus.com" },
		};
		const event = mockEvent("author-agent-spec", input);
		const result = await authGateHandler(event, ctx);
		assert.strictEqual(result, undefined, "expected void/allow");
		assert.deepStrictEqual(
			input.writer,
			{ kind: "human", user: "verified@example.com" },
			"input.writer must be overwritten to the verified terminal-operator identity",
		);
	});

	it("Bucket-2 tool + confirm=false → event.input.writer UNCHANGED (no mutation on decline)", async () => {
		primeIdentityCache("verified@example.com");
		const { ctx } = mockCtx({ hasUI: true, confirmAnswer: false });
		const originalWriter = { kind: "agent", user: "alice@bogus.com" };
		const input: Record<string, unknown> = {
			target: "tool_operations",
			operation: "add",
			key: "x",
			writer: originalWriter,
		};
		const event = mockEvent("author-tool-grant", input);
		const result = await authGateHandler(event, ctx);
		assert.deepStrictEqual(result, { block: true, reason: "user declined" });
		assert.deepStrictEqual(input.writer, originalWriter, "writer must NOT be mutated when operator declines");
	});

	it("non-Bucket-2 tool → event.input.writer UNCHANGED (handler pass-through; no mutation)", async () => {
		primeIdentityCache("verified@example.com");
		const { ctx } = mockCtx({ hasUI: true, confirmAnswer: true });
		const originalWriter = { kind: "agent", user: "alice@bogus.com" };
		const input: Record<string, unknown> = { name: "tasks", writer: originalWriter };
		const event = mockEvent("read-block", input);
		const result = await authGateHandler(event, ctx);
		assert.strictEqual(result, undefined, "pass-through for non-Bucket-2 tools");
		assert.deepStrictEqual(input.writer, originalWriter, "non-gated tools must never have writer mutated");
	});

	it("Bucket-2 tool + confirm=true + verified identity null → event.input.writer UNCHANGED (caller-supplied identity remains)", async () => {
		primeIdentityCache(null);
		const { ctx } = mockCtx({ hasUI: true, confirmAnswer: true });
		const originalWriter = { kind: "agent", user: "alice@bogus.com" };
		const input: Record<string, unknown> = {
			operation: "create",
			schemaName: "thing",
			fromVersion: "1.0.0",
			toVersion: "2.0.0",
			kind: "identity",
			writer: originalWriter,
		};
		const event = mockEvent("write-schema-migration", input);
		const result = await authGateHandler(event, ctx);
		assert.strictEqual(result, undefined, "expected void/allow");
		assert.deepStrictEqual(
			input.writer,
			originalWriter,
			"with no verifiable identity, the auth-gate leaves caller-supplied writer in place (warning surfaces the unverified state separately)",
		);
	});
});

// ── Informed-authorization confirm (Cycle 3 / carried item 2) ────────────────
//
// When a write-schema payload's item subschema declares an
// `x-identity.metadata_fields` override, the confirm message is enriched with
// a human delta + the standing mandatory-floor affirmation. When NO override is
// declared (or there is no schema payload, e.g. write-schema-migration) the
// message is byte-identical to the pre-Cycle-3 form. The non-override message
// is pinned verbatim so any future drift surfaces here.
describe("auth-gate — informed-authorization confirm (identity metadata-field override)", () => {
	const baseSchema = (extra?: Record<string, unknown>) => ({
		type: "object",
		properties: {
			tasks: {
				type: "array",
				items: {
					type: "object",
					properties: {
						id: { type: "string" },
						title: { type: "string" },
						oid: { type: "string" },
						content_hash: { type: "string" },
						content_parent: { type: "string" },
						...(extra ?? {}),
					},
					...(extra ? {} : {}),
				},
			},
		},
	});

	function schemaWithOverride(fields: string[]): Record<string, unknown> {
		const s = baseSchema() as Record<string, unknown>;
		// inject x-identity.metadata_fields on the item subschema
		(s.properties as Record<string, Record<string, unknown>>).tasks.items = {
			...((s.properties as Record<string, Record<string, unknown>>).tasks.items as Record<string, unknown>),
			"x-identity": { metadata_fields: fields },
		};
		return s;
	}

	it("write-schema with an override → message names the changed exclusions + affirms the mandatory floor", async () => {
		const { ctx, calls } = mockCtx({ hasUI: true, confirmAnswer: true });
		// Override drops the author fields from metadata (now hashed) and adds a
		// bespoke `audit_note` exclusion.
		const schema = schemaWithOverride(["audit_note"]);
		const event = mockEvent("write-schema", { operation: "create", schemaName: "tasks", schema });
		const result = await authGateHandler(event, ctx);
		assert.strictEqual(result, undefined, "expected void/allow on confirm=true");
		assert.strictEqual(calls.length, 1);
		const msg = calls[0].message;
		assert.match(msg, /identity metadata-field override declared/);
		assert.match(msg, /audit_note/, "added exclusion named");
		assert.match(msg, /created_by/, "dropped discretionary field named");
		assert.match(msg, /mandatory floor id\/oid\/content_hash\/content_parent remains excluded/);
	});

	it("write-schema with a JSON-STRING schema payload carrying an override → still enriched", async () => {
		const { ctx, calls } = mockCtx({ hasUI: true, confirmAnswer: true });
		const schema = JSON.stringify(schemaWithOverride(["audit_note"]));
		const event = mockEvent("write-schema", { operation: "create", schemaName: "tasks", schema });
		await authGateHandler(event, ctx);
		assert.match(calls[0].message, /identity metadata-field override declared/);
	});

	it("write-schema WITHOUT an override → message byte-identical to the pre-Cycle-3 form", async () => {
		const { ctx, calls } = mockCtx({ hasUI: true, confirmAnswer: true });
		// A schema with the identity fields but no x-identity override.
		const schema = baseSchema();
		const event = mockEvent("write-schema", { operation: "create", schemaName: "tasks", schema });
		await authGateHandler(event, ctx);
		const argSummary = `operation="create", schemaName="tasks", schema={...}`;
		assert.strictEqual(
			calls[0].message,
			`tool write-schema requested; args: ${argSummary}`,
			"no-override confirm must be byte-identical to the un-enriched form",
		);
	});

	it("write-schema-migration (no schema payload) → byte-identical (never enriched)", async () => {
		const { ctx, calls } = mockCtx({ hasUI: true, confirmAnswer: true });
		const input = {
			operation: "create",
			schemaName: "tasks",
			fromVersion: "1.0.0",
			toVersion: "1.0.1",
			kind: "identity",
		};
		const event = mockEvent("write-schema-migration", input);
		await authGateHandler(event, ctx);
		const argSummary = `operation="create", schemaName="tasks", fromVersion="1.0.0", toVersion="1.0.1", kind="identity"`;
		assert.strictEqual(calls[0].message, `tool write-schema-migration requested; args: ${argSummary}`);
	});

	it("write-schema with a non-JSON-string schema → not enriched (parse fails, override null)", async () => {
		const { ctx, calls } = mockCtx({ hasUI: true, confirmAnswer: true });
		const event = mockEvent("write-schema", { operation: "create", schemaName: "tasks", schema: "not json{{" });
		await authGateHandler(event, ctx);
		assert.doesNotMatch(calls[0].message, /identity metadata-field override declared/);
	});
});
