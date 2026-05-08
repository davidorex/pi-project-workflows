import assert from "node:assert";
import { describe, it } from "node:test";
import { type DispatchContext, stampItem, type WriterIdentity, writerToString } from "./dispatch-context.js";

describe("writerToString", () => {
	it("renders human writer as 'human/<user>'", () => {
		const w: WriterIdentity = { kind: "human", user: "david" };
		assert.strictEqual(writerToString(w), "human/david");
	});

	it("renders agent writer as 'agent/<agent_id>' (matches committed decisions.json convention)", () => {
		const w: WriterIdentity = { kind: "agent", agent_id: "claude-opus-4-7" };
		assert.strictEqual(writerToString(w), "agent/claude-opus-4-7");
	});

	it("renders agent writer ignoring optional model field (kept stable across model upgrades)", () => {
		const w: WriterIdentity = { kind: "agent", agent_id: "claude-opus-4-7", model: "anthropic/claude-opus-4-7" };
		assert.strictEqual(writerToString(w), "agent/claude-opus-4-7");
	});

	it("renders monitor writer as 'monitor/<monitor_name>'", () => {
		const w: WriterIdentity = { kind: "monitor", monitor_name: "fragility-detector" };
		assert.strictEqual(writerToString(w), "monitor/fragility-detector");
	});

	it("renders workflow writer as 'workflow/<workflow_step_id>'", () => {
		const w: WriterIdentity = { kind: "workflow", workflow_step_id: "implement-step-3" };
		assert.strictEqual(writerToString(w), "workflow/implement-step-3");
	});
});

describe("stampItem create mode", () => {
	const ctx: DispatchContext = {
		writer: { kind: "agent", agent_id: "claude-opus-4-7" },
	};

	it("populates created_by + created_at + modified_by + modified_at when fields are absent", () => {
		const before = { id: "X", body: "stuff" };
		const after = stampItem(before, ctx, "create");

		assert.strictEqual(after.created_by, "agent/claude-opus-4-7");
		assert.strictEqual(after.modified_by, "agent/claude-opus-4-7");
		assert.ok(typeof after.created_at === "string" && /^\d{4}-\d{2}-\d{2}T/.test(after.created_at as string));
		assert.ok(typeof after.modified_at === "string" && /^\d{4}-\d{2}-\d{2}T/.test(after.modified_at as string));
	});

	it("does not mutate the input object (returns a new object)", () => {
		const before = { id: "X" };
		const after = stampItem(before, ctx, "create");
		assert.notStrictEqual(after, before);
		assert.strictEqual((before as Record<string, unknown>).created_by, undefined);
		assert.strictEqual((before as Record<string, unknown>).modified_by, undefined);
	});

	it("preserves pre-existing created_by + created_at — re-creates do not overwrite the original author", () => {
		const before = {
			id: "X",
			created_by: "human/legacy-author",
			created_at: "2025-01-01T00:00:00.000Z",
		};
		const after = stampItem(before, ctx, "create");
		assert.strictEqual(after.created_by, "human/legacy-author");
		assert.strictEqual(after.created_at, "2025-01-01T00:00:00.000Z");
		// modified_* still refreshed
		assert.strictEqual(after.modified_by, "agent/claude-opus-4-7");
		assert.ok(typeof after.modified_at === "string");
	});

	it("treats null and undefined created_by/created_at as 'absent' and stamps fresh values", () => {
		const before = {
			id: "X",
			created_by: null as unknown,
			created_at: undefined,
		} as Record<string, unknown>;
		const after = stampItem(before, ctx, "create");
		assert.strictEqual(after.created_by, "agent/claude-opus-4-7");
		assert.ok(typeof after.created_at === "string");
	});

	it("preserves unrelated fields untouched", () => {
		const before = { id: "X", title: "demo", nested: { k: 1 } };
		const after = stampItem(before, ctx, "create");
		assert.strictEqual(after.id, "X");
		assert.strictEqual(after.title, "demo");
		assert.deepStrictEqual(after.nested, { k: 1 });
	});
});

describe("stampItem update mode", () => {
	const ctx: DispatchContext = {
		writer: { kind: "human", user: "david" },
	};

	it("preserves created_by + created_at, refreshes modified_by + modified_at", () => {
		const before = {
			id: "X",
			created_by: "agent/claude-opus-4-6",
			created_at: "2025-01-01T00:00:00.000Z",
			modified_by: "agent/claude-opus-4-6",
			modified_at: "2025-01-01T00:00:00.000Z",
		};
		const after = stampItem(before, ctx, "update");
		assert.strictEqual(after.created_by, "agent/claude-opus-4-6");
		assert.strictEqual(after.created_at, "2025-01-01T00:00:00.000Z");
		assert.strictEqual(after.modified_by, "human/david");
		assert.notStrictEqual(after.modified_at, "2025-01-01T00:00:00.000Z");
		assert.ok(typeof after.modified_at === "string");
	});

	it("does not populate created_by/created_at if absent in update mode", () => {
		const before = { id: "X" };
		const after = stampItem(before, ctx, "update");
		assert.strictEqual(after.created_by, undefined);
		assert.strictEqual(after.created_at, undefined);
		assert.strictEqual(after.modified_by, "human/david");
		assert.ok(typeof after.modified_at === "string");
	});

	it("returns a new object (input not mutated)", () => {
		const before = { id: "X", modified_by: "old", modified_at: "old" };
		const after = stampItem(before, ctx, "update");
		assert.notStrictEqual(after, before);
		assert.strictEqual(before.modified_by, "old");
		assert.strictEqual(before.modified_at, "old");
	});
});
