import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { agentTrace, agentTraceChildren, agentTraceEntry } from "./agent-trace-sdk.js";

/** Per-test scratch directory under os.tmpdir(). */
let tmpDir: string;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-trace-sdk-"));
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** Write an array of entries as JSONL to `file`. */
function writeJsonl(file: string, entries: unknown[]): void {
	const body = `${entries.map((e) => JSON.stringify(e)).join("\n")}\n`;
	fs.writeFileSync(file, body, "utf-8");
}

describe("agentTrace", () => {
	it("reads all entries from a single JSONL file in id-ASC order", () => {
		const file = path.join(tmpDir, "session.jsonl");
		const sessionStart = {
			type: "session_start",
			id: "01HKAA0000000000000000A001",
			parentId: null,
			timestamp: "2026-04-25T00:00:00.000Z",
			sessionId: "01HKAA0000000000000000A001",
			agentName: "monitor-classify",
			model: "openrouter/anthropic/claude-sonnet-4.6",
			cwd: "/tmp/cwd",
		};
		const classifyA = {
			type: "classify_call",
			id: "01HKAA0000000000000000A002",
			parentId: "01HKAA0000000000000000A001",
			timestamp: "2026-04-25T00:00:01.000Z",
			renderedPrompt: "rendered A",
			inputText: "input A",
		};
		const classifyB = {
			type: "classify_call",
			id: "01HKAA0000000000000000A003",
			parentId: "01HKAA0000000000000000A001",
			timestamp: "2026-04-25T00:00:02.000Z",
			renderedPrompt: "rendered B",
			inputText: "input B",
		};
		// Write out of order to verify the SDK sorts by id.
		writeJsonl(file, [classifyB, sessionStart, classifyA]);

		const result = agentTrace({ sessionPath: file });
		assert.strictEqual(result.length, 3);
		assert.deepStrictEqual(result, [sessionStart, classifyA, classifyB]);
	});

	it("reads and merges date-rotated files in lexicographic order from a directory", () => {
		const dir = path.join(tmpDir, "trace-dir");
		fs.mkdirSync(dir);
		const day1 = path.join(dir, "2026-04-25.jsonl");
		const day2 = path.join(dir, "2026-04-26.jsonl");

		const e1 = { id: "01HKAA0000000000000000B001", parentId: null, type: "session_start" };
		const e2 = { id: "01HKAA0000000000000000B002", parentId: "01HKAA0000000000000000B001", type: "classify_call" };
		const e3 = { id: "01HKAA0000000000000000B003", parentId: "01HKAA0000000000000000B002", type: "classify_response" };
		const e4 = { id: "01HKAA0000000000000000B004", parentId: "01HKAA0000000000000000B003", type: "verdict_decision" };

		writeJsonl(day1, [e1, e2]);
		writeJsonl(day2, [e3, e4]);

		const result = agentTrace({ sessionPath: dir });
		assert.strictEqual(result.length, 4);
		assert.deepStrictEqual(result, [e1, e2, e3, e4]);
	});

	it("applies fromId/toId inclusive filtering by entry id", () => {
		const file = path.join(tmpDir, "filter.jsonl");
		const e1 = { id: "01HKAA0000000000000000C001", parentId: null, type: "session_start" };
		const e2 = { id: "01HKAA0000000000000000C002", parentId: "01HKAA0000000000000000C001", type: "classify_call" };
		const e3 = { id: "01HKAA0000000000000000C003", parentId: "01HKAA0000000000000000C002", type: "classify_response" };
		writeJsonl(file, [e1, e2, e3]);

		const result = agentTrace({ sessionPath: file, fromId: "01HKAA0000000000000000C002" });
		assert.strictEqual(result.length, 2);
		assert.deepStrictEqual(result, [e2, e3]);
	});

	it("returns an empty array for an empty file", () => {
		const file = path.join(tmpDir, "empty.jsonl");
		fs.writeFileSync(file, "", "utf-8");
		const result = agentTrace({ sessionPath: file });
		assert.deepStrictEqual(result, []);
	});

	it("throws with the file path in the error message when the path does not exist", () => {
		const missing = path.join(tmpDir, "does-not-exist.jsonl");
		assert.throws(
			() => agentTrace({ sessionPath: missing }),
			(err: unknown) => err instanceof Error && err.message.includes(missing),
		);
	});

	it("throws with line number and file context when a JSONL line is malformed", () => {
		const file = path.join(tmpDir, "bad.jsonl");
		const valid = JSON.stringify({ id: "01HKAA0000000000000000D001", parentId: null, type: "session_start" });
		fs.writeFileSync(file, `${valid}\nthis-is-not-json\n`, "utf-8");
		assert.throws(
			() => agentTrace({ sessionPath: file }),
			(err: unknown) => err instanceof Error && err.message.includes(file) && err.message.includes(":2"),
		);
	});
});

describe("agentTraceChildren", () => {
	it("returns only entries whose parentId matches", () => {
		const file = path.join(tmpDir, "children.jsonl");
		const root = { id: "01HKAA0000000000000000E001", parentId: null, type: "session_start" };
		const callA = { id: "01HKAA0000000000000000E002", parentId: "01HKAA0000000000000000E001", type: "classify_call" };
		const callB = { id: "01HKAA0000000000000000E003", parentId: "01HKAA0000000000000000E001", type: "classify_call" };
		const respUnderA = {
			id: "01HKAA0000000000000000E004",
			parentId: "01HKAA0000000000000000E002",
			type: "classify_response",
		};
		writeJsonl(file, [root, callA, callB, respUnderA]);

		const children = agentTraceChildren(file, "01HKAA0000000000000000E001");
		assert.strictEqual(children.length, 2);
		assert.deepStrictEqual(children, [callA, callB]);
	});
});

describe("agentTraceEntry", () => {
	it("returns the matching entry when the id is present", () => {
		const file = path.join(tmpDir, "entry.jsonl");
		const root = { id: "01HKAA0000000000000000F001", parentId: null, type: "session_start" };
		const call = { id: "01HKAA0000000000000000F002", parentId: "01HKAA0000000000000000F001", type: "classify_call" };
		writeJsonl(file, [root, call]);

		const found = agentTraceEntry(file, "01HKAA0000000000000000F002");
		assert.deepStrictEqual(found, call);
	});

	it("returns null when no entry matches the id", () => {
		const file = path.join(tmpDir, "missing.jsonl");
		const root = { id: "01HKAA0000000000000000G001", parentId: null, type: "session_start" };
		writeJsonl(file, [root]);

		const found = agentTraceEntry(file, "01HKAA0000000000000000G999");
		assert.strictEqual(found, null);
	});
});
