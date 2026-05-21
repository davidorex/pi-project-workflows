/**
 * Tool-level smoke tests for pi-context tools registered via the extension
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
import { writeBootstrapPointer } from "./project-dir.js";

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
function captureTools(opts?: { allTools?: unknown[]; activeTools?: string[] }): {
	tools: Map<string, CapturedTool>;
	api: unknown;
} {
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
		// SDK-native introspection surface the `list-tools` execute closes over.
		getAllTools: () => opts?.allTools ?? [],
		getActiveTools: () => opts?.activeTools ?? [],
	};
	return { tools, api };
}

function tmpDir(): string {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-context-tool-"));
	writeBootstrapPointer(cwd, ".project");
	return cwd;
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
					package: "pi-context",
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

describe("pi-project extension: list-tools tool", () => {
	const sampleTools = [
		{
			name: "a",
			description: "da",
			parameters: { type: "object", properties: {} },
			sourceInfo: { path: "p", source: "s", scope: "project", origin: "package" },
		},
		{
			name: "b",
			description: "db",
			parameters: { type: "object", properties: {} },
			sourceInfo: { path: "p2", source: "s2", scope: "user", origin: "top-level" },
		},
	];

	it("lists all tools + active set", async () => {
		const { tools, api } = captureTools({ allTools: sampleTools, activeTools: ["a"] });
		(extension as unknown as (pi: unknown) => void)(api);
		const tool = tools.get("list-tools");
		assert.ok(tool, "list-tools must be registered");

		const result = (await tool.execute("call-1", {}, new AbortController().signal, () => {}, {
			cwd: "/tmp",
		})) as { content: { text: string }[] };

		const parsed = JSON.parse(result.content[0]!.text);
		assert.strictEqual(parsed.tools.length, 2);
		assert.strictEqual(parsed.tools[0].name, "a");
		assert.deepStrictEqual(parsed.active, ["a"]);
		assert.strictEqual(parsed.total, 2);
		assert.strictEqual(parsed.activeCount, 1);
	});

	it("surfaces description + parameters, not just names", async () => {
		const { tools, api } = captureTools({ allTools: sampleTools, activeTools: ["a"] });
		(extension as unknown as (pi: unknown) => void)(api);
		const tool = tools.get("list-tools");
		assert.ok(tool, "list-tools must be registered");

		const result = (await tool.execute("call-2", {}, new AbortController().signal, () => {}, {
			cwd: "/tmp",
		})) as { content: { text: string }[] };

		const parsed = JSON.parse(result.content[0]!.text);
		assert.strictEqual(parsed.tools[0].description, "da");
		assert.strictEqual(parsed.tools[0].parameters.type, "object");
	});

	it("includes sourceInfo", async () => {
		const { tools, api } = captureTools({ allTools: sampleTools, activeTools: ["a"] });
		(extension as unknown as (pi: unknown) => void)(api);
		const tool = tools.get("list-tools");
		assert.ok(tool, "list-tools must be registered");

		const result = (await tool.execute("call-3", {}, new AbortController().signal, () => {}, {
			cwd: "/tmp",
		})) as { content: { text: string }[] };

		const parsed = JSON.parse(result.content[0]!.text);
		assert.strictEqual(parsed.tools[0].sourceInfo.scope, "project");
		assert.strictEqual(parsed.tools[0].sourceInfo.origin, "package");
	});

	it("empty getAllTools → empty result, no crash", async () => {
		const { tools, api } = captureTools({ allTools: [], activeTools: [] });
		(extension as unknown as (pi: unknown) => void)(api);
		const tool = tools.get("list-tools");
		assert.ok(tool, "list-tools must be registered");

		const result = (await tool.execute("call-4", {}, new AbortController().signal, () => {}, {
			cwd: "/tmp",
		})) as { content: { text: string }[] };

		const parsed = JSON.parse(result.content[0]!.text);
		assert.deepStrictEqual(parsed.tools, []);
		assert.deepStrictEqual(parsed.active, []);
		assert.strictEqual(parsed.total, 0);
	});
});
