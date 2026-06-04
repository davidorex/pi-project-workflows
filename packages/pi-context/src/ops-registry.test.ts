/**
 * Tests for the op-registry's in-pi DispatchContext construction (TASK-006).
 *
 * `buildDispatchContextFromExecute` is the boundary that turns the per-call
 * `params` + `ExtensionContext` into the contract `DispatchContext` threaded as
 * the 3rd arg of every op's `run`. Two derivation branches:
 *   - auth-gate-stamped `params.writer.user` (non-empty string) → human writer
 *   - otherwise the running model id → agent writer (fallback "pi-agent")
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDispatchContextFromExecute } from "./ops-registry.js";

test("buildDispatchContextFromExecute builds a human writer from params.writer.user", () => {
	const dctx = buildDispatchContextFromExecute({ writer: { kind: "human", user: "me@example.com" } }, {});
	assert.deepEqual(dctx, { writer: { kind: "human", user: "me@example.com" } });
});

test("buildDispatchContextFromExecute prefers params.writer.user even when a model is present", () => {
	const dctx = buildDispatchContextFromExecute(
		{ writer: { kind: "human", user: "operator@x" } },
		{ model: { id: "claude-opus-4-8" } },
	);
	assert.deepEqual(dctx, { writer: { kind: "human", user: "operator@x" } });
});

test("buildDispatchContextFromExecute builds an agent writer from the model id when no writer.user", () => {
	const dctx = buildDispatchContextFromExecute({}, { model: { id: "claude-opus-4-8" } });
	assert.deepEqual(dctx, { writer: { kind: "agent", agent_id: "claude-opus-4-8" } });
});

test("buildDispatchContextFromExecute falls back to pi-agent when no model id", () => {
	assert.deepEqual(buildDispatchContextFromExecute({}, {}), {
		writer: { kind: "agent", agent_id: "pi-agent" },
	});
	assert.deepEqual(buildDispatchContextFromExecute({}, { model: {} }), {
		writer: { kind: "agent", agent_id: "pi-agent" },
	});
});

test("buildDispatchContextFromExecute treats an empty-string writer.user as absent (agent fallback)", () => {
	const dctx = buildDispatchContextFromExecute({ writer: { user: "" } }, { model: { id: "m1" } });
	assert.deepEqual(dctx, { writer: { kind: "agent", agent_id: "m1" } });
});

test("buildDispatchContextFromExecute handles null/undefined params (agent fallback)", () => {
	assert.deepEqual(buildDispatchContextFromExecute(undefined, { model: { id: "m2" } }), {
		writer: { kind: "agent", agent_id: "m2" },
	});
	assert.deepEqual(buildDispatchContextFromExecute(null, {}), {
		writer: { kind: "agent", agent_id: "pi-agent" },
	});
});
