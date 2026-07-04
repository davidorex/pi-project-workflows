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
import { Type } from "typebox";
import { writeBootstrapPointer } from "./context-dir.js";
import extension from "./index.js";
import { type OpDefinition, ops, registerAll } from "./ops-registry.js";

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
	handlers: Map<string, (...a: unknown[]) => unknown>;
	api: unknown;
} {
	const tools = new Map<string, CapturedTool>();
	// Capture `pi.on(event, handler)` registrations keyed by event name so
	// tests can emit synthetic events (FGAP-090 guidance hooks).
	const handlers = new Map<string, (...a: unknown[]) => unknown>();
	const api = {
		on: (evt: string, h: (...a: unknown[]) => unknown) => {
			handlers.set(evt, h);
		},
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
	return { tools, handlers, api };
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

	it("default returns the COMPACT index (name + param-count + one-line description, not full schemas)", async () => {
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
		assert.strictEqual(parsed.tools[0].params, 0, "compact index reports param count");
		assert.strictEqual(parsed.tools[0].description, "da");
		// Compact index must NOT carry the full parameter JSON-schema or sourceInfo.
		assert.strictEqual(parsed.tools[0].parameters, undefined, "index drops full param schema (FGAP-101)");
		assert.strictEqual(parsed.tools[0].sourceInfo, undefined, "index drops sourceInfo");
		assert.deepStrictEqual(parsed.active, ["a"]);
		assert.strictEqual(parsed.total, 2);
		assert.strictEqual(parsed.activeCount, 1);
	});

	it("addressed by name returns ONE tool's full descriptor (params schema + sourceInfo)", async () => {
		const { tools, api } = captureTools({ allTools: sampleTools, activeTools: ["a"] });
		(extension as unknown as (pi: unknown) => void)(api);
		const tool = tools.get("list-tools");
		assert.ok(tool, "list-tools must be registered");

		const result = (await tool.execute("call-2", { name: "a" }, new AbortController().signal, () => {}, {
			cwd: "/tmp",
		})) as { content: { text: string }[] };

		const parsed = JSON.parse(result.content[0]!.text);
		assert.strictEqual(parsed.name, "a", "returns the single addressed descriptor, not a list");
		assert.strictEqual(parsed.description, "da");
		assert.strictEqual(parsed.parameters.type, "object", "full param schema present in detail mode");
		assert.strictEqual(parsed.sourceInfo.scope, "project");
		assert.strictEqual(parsed.sourceInfo.origin, "package");
	});

	it("addressed by an unknown name reports not-found (no crash)", async () => {
		const { tools, api } = captureTools({ allTools: sampleTools, activeTools: ["a"] });
		(extension as unknown as (pi: unknown) => void)(api);
		const tool = tools.get("list-tools");
		assert.ok(tool, "list-tools must be registered");

		const result = (await tool.execute("call-3", { name: "nope" }, new AbortController().signal, () => {}, {
			cwd: "/tmp",
		})) as { content: { text: string }[] };

		assert.match(result.content[0]!.text, /tool not found/);
	});

	it("empty getAllTools → empty index, no crash", async () => {
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

describe("FGAP-103: read-config registry addressing", () => {
	function seedConfig(cwd: string): void {
		const projectDir = path.join(cwd, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		fs.writeFileSync(
			path.join(projectDir, "config.json"),
			JSON.stringify({
				schema_version: "1.8.0",
				root: ".project",
				relation_types: [
					{ canonical_id: "task_verified_by", display_name: "verified by", category: "data_flow" },
					{ canonical_id: "phase_depends_on", display_name: "depends on", category: "ordering" },
				],
				block_kinds: [],
			}),
		);
	}

	it("registry param returns only that registry (not the whole config)", async (t) => {
		const cwd = tmpDir();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		seedConfig(cwd);

		const { tools, api } = captureTools();
		(extension as unknown as (pi: unknown) => void)(api);
		const tool = tools.get("read-config");
		assert.ok(tool, "read-config must be registered");

		const result = (await tool.execute(
			"call-1",
			{ registry: "relation_types" },
			new AbortController().signal,
			() => {},
			{ cwd },
		)) as { content: { text: string }[] };

		const body = result.content[0]!.text.split("[read-element:")[0]!;
		const parsed = JSON.parse(body);
		assert.ok(Array.isArray(parsed), "returns the registry array, not the config wrapper");
		assert.strictEqual(parsed.length, 2);
		assert.strictEqual(parsed[0].canonical_id, "task_verified_by");
	});

	it("registry + id addresses ONE entry by canonical_id", async (t) => {
		const cwd = tmpDir();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		seedConfig(cwd);

		const { tools, api } = captureTools();
		(extension as unknown as (pi: unknown) => void)(api);
		const tool = tools.get("read-config");
		assert.ok(tool, "read-config must be registered");

		const result = (await tool.execute(
			"call-2",
			{ registry: "relation_types", id: "phase_depends_on" },
			new AbortController().signal,
			() => {},
			{ cwd },
		)) as { content: { text: string }[] };

		const parsed = JSON.parse(result.content[0]!.text.split("[read-element:")[0]!);
		assert.strictEqual(parsed.canonical_id, "phase_depends_on");
		assert.strictEqual(parsed.category, "ordering");
	});

	it("unknown registry reports not-found (no crash)", async (t) => {
		const cwd = tmpDir();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		seedConfig(cwd);

		const { tools, api } = captureTools();
		(extension as unknown as (pi: unknown) => void)(api);
		const tool = tools.get("read-config");
		assert.ok(tool, "read-config must be registered");

		const result = (await tool.execute("call-3", { registry: "nope" }, new AbortController().signal, () => {}, {
			cwd,
		})) as { content: { text: string }[] };

		assert.match(result.content[0]!.text, /registry not found/);
	});
});

describe("FGAP-090: guidance hooks", () => {
	it("before_agent_start appends orientation to the system prompt (append-not-replace)", () => {
		const { handlers, api } = captureTools();
		(extension as unknown as (pi: unknown) => void)(api);

		const handler = handlers.get("before_agent_start");
		assert.ok(handler, "before_agent_start handler must be registered");

		const result = handler({
			type: "before_agent_start",
			prompt: "",
			systemPrompt: "BASE_PROMPT",
			systemPromptOptions: {},
		}) as { systemPrompt: string };

		assert.ok(
			result.systemPrompt.startsWith("BASE_PROMPT"),
			"orientation must be appended after the base prompt, not replace it",
		);

		for (const needle of [
			"read-config",
			"read-samples-catalog",
			"read-schema",
			"list-tools",
			"write-schema",
			"amend-config",
			"append-relation",
			"/context init",
			"/context accept-all",
			"/context install",
		]) {
			assert.ok(result.systemPrompt.includes(needle), `orientation block must reference ${needle}`);
		}

		// Grounding directive against confabulation.
		assert.ok(
			/do not confabulate|never invent/.test(result.systemPrompt),
			"orientation block must carry a grounding directive against confabulation",
		);
	});

	it("resources_discover returns the absolute pi-context skill dir", () => {
		const { handlers, api } = captureTools();
		(extension as unknown as (pi: unknown) => void)(api);

		const handler = handlers.get("resources_discover");
		assert.ok(handler, "resources_discover handler must be registered");

		const result = handler({
			type: "resources_discover",
			cwd: ".",
			reason: "startup",
		}) as { skillPaths: string[] };

		assert.ok(Array.isArray(result.skillPaths), "result.skillPaths must be an array");
		assert.strictEqual(result.skillPaths.length, 1, "exactly one skill path expected");

		const p = result.skillPaths[0]!;
		assert.ok(path.isAbsolute(p), "skill path must be absolute");
		assert.ok(fs.existsSync(path.join(p, "SKILL.md")), `resolved skill dir must contain SKILL.md (got ${p})`);
	});
});

// ── TASK-013 / FGAP-015: in-pi Pi-tool over-cap {json} bound ──────────────────
// The Pi-tool surface emits via registerAll → renderOpResultText. Pre-fix, a
// {json} op embedding >50KB of substrate content leaked it unbounded at
// content[0].text (the cap lived only in the {read} channel). This registers a
// synthetic >50KB {json} op through the REAL registerAll wrapper, invokes it, and
// asserts the emitted text is the REFUSAL prose with NO payload body.
describe("pi-context Pi-tool surface: over-cap {json} fails closed", () => {
	it("renders the REFUSAL prose, not the 50KB payload, at content[0].text", async () => {
		const synthetic: OpDefinition = {
			name: "synthetic-overcap-json",
			label: "Synthetic Over-Cap JSON",
			description: "test-only op returning a >50KB {json} value",
			parameters: Type.Object({}),
			surface: "use",
			run: () => ({ json: { blob: "x".repeat(120000) } }),
		};
		ops.push(synthetic);
		try {
			const registered = new Map<string, CapturedTool>();
			const api = {
				registerTool: (def: { name: string; execute: CapturedTool["execute"] }) => {
					registered.set(def.name, { name: def.name, execute: def.execute });
				},
			};
			registerAll(api as never);
			const tool = registered.get("synthetic-overcap-json");
			assert.ok(tool, "synthetic op must be registered");

			const result = (await tool.execute("call-oc", {}, new AbortController().signal, () => {}, {
				cwd: process.cwd(),
			})) as { content: { text: string }[] };
			const text = result.content[0]!.text;
			assert.match(text, /OUTPUT REFUSED/, "over-cap {json} emits the REFUSAL prose");
			assert.match(text, /over the 50KB read cap/);
			assert.strictEqual(text.includes("x".repeat(1000)), false, "no serialized payload leaked into the Pi-tool text");
		} finally {
			ops.pop();
		}
	});
});
