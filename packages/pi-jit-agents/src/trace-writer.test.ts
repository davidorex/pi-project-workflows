import assert from "node:assert";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { dateRotatedPath, writeAgentTrace } from "./trace-writer.js";

// --- Test fixtures ----------------------------------------------------------------------------

// 26-char Crockford base32 (ULID shape) — only chars 0-9 + A-HJKMNP-TV-Z (i.e. no I, L, O, U)
const ULID_A = "01HZX0Q4N5R8WSXKHJ3ABCDEFG";
const ULID_B = "01HZX0Q4N5R8WSXKHJ3ABCDEFH";
const ULID_C = "01HZX0Q4N5R8WSXKHJ3ABCDEFJ";
const ULID_D = "01HZX0Q4N5R8WSXKHJ3ABCDEFK";

function validSessionStart(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		type: "session_start",
		id: ULID_A,
		parentId: null,
		timestamp: "2026-04-26T12:00:00.000Z",
		sessionId: ULID_A,
		agentName: "test-agent",
		model: "openrouter/anthropic/claude-sonnet-4.6",
		cwd: "/tmp/some/project",
		...overrides,
	};
}

function makeTmpDir(): string {
	return mkdtempSync(path.join(tmpdir(), "trace-writer-"));
}

// --- writeAgentTrace --------------------------------------------------------------------------

describe("writeAgentTrace", () => {
	it("creates the file and appends one JSONL line for a valid session_start entry", () => {
		const dir = makeTmpDir();
		try {
			const tracePath = path.join(dir, "trace.jsonl");
			const entry = validSessionStart();
			writeAgentTrace(entry, { tracePath });
			const raw = readFileSync(tracePath, "utf8");
			const lines = raw.split("\n").filter(Boolean);
			assert.strictEqual(lines.length, 1);
			const parsed = JSON.parse(lines[0]);
			assert.deepStrictEqual(parsed, entry);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("creates parent directories if they do not exist", () => {
		const dir = makeTmpDir();
		try {
			const tracePath = path.join(dir, "nested", "deeper", "trace.jsonl");
			writeAgentTrace(validSessionStart(), { tracePath });
			assert.ok(statSync(tracePath).size > 0, "expected file to exist with non-zero size");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("throws an error mentioning the missing field name when required field is absent", () => {
		const dir = makeTmpDir();
		try {
			const tracePath = path.join(dir, "trace.jsonl");
			const entry = validSessionStart();
			delete (entry as Record<string, unknown>).agentName;
			assert.throws(
				() => writeAgentTrace(entry, { tracePath }),
				(err: Error) => {
					assert.ok(err.message.length > 0);
					assert.ok(
						/agentName/.test(err.message),
						`expected error message to mention 'agentName', got: ${err.message}`,
					);
					return true;
				},
			);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("skips validation when skipValidation is true (allows malformed entries through)", () => {
		const dir = makeTmpDir();
		try {
			const tracePath = path.join(dir, "trace.jsonl");
			const malformed = { type: "session_start", missingEverythingElse: true };
			// Should not throw despite missing required fields.
			writeAgentTrace(malformed, { tracePath, skipValidation: true });
			const raw = readFileSync(tracePath, "utf8");
			const parsed = JSON.parse(raw.split("\n").filter(Boolean)[0]);
			assert.deepStrictEqual(parsed, malformed);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("appends multiple sequential entries as separate JSONL lines", () => {
		const dir = makeTmpDir();
		try {
			const tracePath = path.join(dir, "trace.jsonl");
			const entries = [
				validSessionStart({ id: ULID_A, sessionId: ULID_A }),
				{
					type: "classify_call",
					id: ULID_B,
					parentId: ULID_A,
					timestamp: "2026-04-26T12:00:01.000Z",
					renderedPrompt: "render output",
					inputText: "the input under classification",
				},
				{
					type: "classify_response",
					id: ULID_C,
					parentId: ULID_B,
					timestamp: "2026-04-26T12:00:02.000Z",
					stopReason: "tool_use",
					usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
					content: [{ type: "toolCall" }],
				},
				{
					type: "trace_end",
					id: ULID_D,
					parentId: ULID_A,
					timestamp: "2026-04-26T12:00:03.000Z",
					totalDurationMs: 3000,
					verdict: { verdict: "clean" },
				},
			];
			for (const e of entries) writeAgentTrace(e, { tracePath });
			const lines = readFileSync(tracePath, "utf8").split("\n").filter(Boolean);
			assert.strictEqual(lines.length, entries.length);
			for (let i = 0; i < entries.length; i++) {
				assert.deepStrictEqual(JSON.parse(lines[i]), entries[i]);
			}
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("rotates to a -001.jsonl split file when the base file exceeds maxFileSizeBytes", () => {
		const dir = makeTmpDir();
		try {
			const tracePath = path.join(dir, "trace.jsonl");
			// Pre-fill the base file to exactly the limit (100 bytes here for test speed).
			writeFileSync(tracePath, "x".repeat(100));
			assert.strictEqual(statSync(tracePath).size, 100);

			writeAgentTrace(validSessionStart(), { tracePath, maxFileSizeBytes: 100 });

			// Base file should remain at exactly 100 bytes — no append occurred there.
			assert.strictEqual(statSync(tracePath).size, 100);

			// The split file should now exist and contain one valid JSONL line.
			const splitPath = path.join(dir, "trace-001.jsonl");
			const raw = readFileSync(splitPath, "utf8");
			const lines = raw.split("\n").filter(Boolean);
			assert.strictEqual(lines.length, 1);
			const parsed = JSON.parse(lines[0]);
			assert.strictEqual(parsed.type, "session_start");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

// --- dateRotatedPath --------------------------------------------------------------------------

describe("dateRotatedPath", () => {
	it("returns <baseDir>/<YYYY-MM-DD>.jsonl for an explicit date", () => {
		const out = dateRotatedPath("/tmp/test", new Date("2026-04-26T12:00:00Z"));
		assert.strictEqual(out, path.join("/tmp/test", "2026-04-26.jsonl"));
	});

	it("zero-pads single-digit month and day", () => {
		const out = dateRotatedPath("/tmp/test", new Date("2026-01-05T00:00:00Z"));
		assert.strictEqual(out, path.join("/tmp/test", "2026-01-05.jsonl"));
	});

	it("uses the current date when no date arg is provided (basename matches YYYY-MM-DD.jsonl)", () => {
		const out = dateRotatedPath("/tmp/test");
		const base = path.basename(out);
		assert.match(base, /^\d{4}-\d{2}-\d{2}\.jsonl$/);
	});
});
