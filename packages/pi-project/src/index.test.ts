/**
 * Tool-level smoke tests for pi-project tools registered via the extension
 * factory. The tool execute callbacks are thin wrappers over SDK functions
 * (the SDK has its own deeper coverage); these tests verify the registration
 * shape and the result-serialisation contract.
 *
 * v0.24.0 adds `resolve-item-by-id` (composition-primitive surface symmetry —
 * the SDK function `resolveItemById` is exposed as a registered tool, mirroring
 * the resolver/registry/budget primitives that ship the same arc). The execute
 * path is exercised by constructing a minimal extension API stub that records
 * tool registrations, then invoking the captured execute with synthetic params
 * + ctx — no Pi runtime required.
 */
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import extension from "./index.js";

interface CapturedTool {
	name: string;
	execute: (
		toolCallId: string,
		params: Record<string, unknown>,
		signal: AbortSignal,
		onUpdate: (...a: unknown[]) => void,
		ctx: { cwd: string },
	) => Promise<unknown>;
}

/**
 * Mock the slice of ExtensionAPI the factory uses, capturing every tool
 * registration so individual handlers can be invoked under test.
 */
function captureTools(): { tools: Map<string, CapturedTool>; api: unknown } {
	const tools = new Map<string, CapturedTool>();
	const api = {
		on: () => {},
		registerTool: (def: { name: string; execute: CapturedTool["execute"] }) => {
			tools.set(def.name, { name: def.name, execute: def.execute });
		},
		registerCommand: () => {},
		// Added defensively — extension factory may call these in future patches
		registerShortcut: () => {},
		sendMessage: () => {},
	};
	return { tools, api };
}

function tmpDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "pi-project-tool-"));
}

function seedFixture(cwd: string): void {
	const projectDir = path.join(cwd, ".project");
	fs.mkdirSync(projectDir, { recursive: true });
	fs.writeFileSync(
		path.join(projectDir, "decisions.json"),
		JSON.stringify({
			decisions: [{ id: "DEC-0001", title: "first", status: "enacted" }],
		}),
	);
	fs.writeFileSync(
		path.join(projectDir, "issues.json"),
		JSON.stringify({
			issues: [
				{
					id: "issue-001",
					title: "first issue",
					body: "body",
					location: "x.ts:1",
					status: "open",
					category: "issue",
					priority: "low",
					package: "pi-project",
				},
			],
		}),
	);
}

describe("pi-project extension: resolve-item-by-id tool", () => {
	it("returns ItemLocation JSON for a known ID", async (t) => {
		const cwd = tmpDir();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		seedFixture(cwd);

		const { tools, api } = captureTools();
		(extension as unknown as (pi: unknown) => void)(api);
		const tool = tools.get("resolve-item-by-id");
		assert.ok(tool, "resolve-item-by-id must be registered");

		const result = (await tool.execute("call-1", { id: "DEC-0001" }, new AbortController().signal, () => {}, {
			cwd,
		})) as { content: { text: string }[] };

		const parsed = JSON.parse(result.content[0]!.text);
		assert.strictEqual(parsed.block, "decisions");
		assert.strictEqual(parsed.arrayKey, "decisions");
		assert.strictEqual(parsed.item.id, "DEC-0001");
		assert.strictEqual(parsed.item.title, "first");
	});

	it("returns null JSON for an unknown ID", async (t) => {
		const cwd = tmpDir();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		seedFixture(cwd);

		const { tools, api } = captureTools();
		(extension as unknown as (pi: unknown) => void)(api);
		const tool = tools.get("resolve-item-by-id");
		assert.ok(tool, "resolve-item-by-id must be registered");

		const result = (await tool.execute("call-2", { id: "DEC-9999" }, new AbortController().signal, () => {}, {
			cwd,
		})) as { content: { text: string }[] };

		const parsed = JSON.parse(result.content[0]!.text);
		assert.strictEqual(parsed, null);
	});

	it("resolves an issue ID to the issues block", async (t) => {
		const cwd = tmpDir();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		seedFixture(cwd);

		const { tools, api } = captureTools();
		(extension as unknown as (pi: unknown) => void)(api);
		const tool = tools.get("resolve-item-by-id");
		assert.ok(tool, "resolve-item-by-id must be registered");

		const result = (await tool.execute("call-3", { id: "issue-001" }, new AbortController().signal, () => {}, {
			cwd,
		})) as { content: { text: string }[] };

		const parsed = JSON.parse(result.content[0]!.text);
		assert.strictEqual(parsed.block, "issues");
		assert.strictEqual(parsed.item.id, "issue-001");
	});
});
