import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createAgentLoader, parseAgentYaml } from "./agent-spec.js";
import extension from "./index.js";

describe("parseAgentYaml", () => {
	it("parses YAML agent spec with all fields", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-agent-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const specPath = path.join(tmpDir, "test.agent.yaml");
		fs.writeFileSync(
			specPath,
			`
name: test-agent
role: sensor
description: A test agent
model: claude-sonnet-4-6
tools: [read, bash]
thinking: low
input:
  type: object
  required: [path]
  properties:
    path: { type: string }
output:
  format: json
  schema: test.schema.json
prompt:
  system: test/system.md
  task: test/task.md
`,
		);

		const spec = parseAgentYaml(specPath);
		assert.strictEqual(spec.name, "test-agent");
		assert.strictEqual(spec.role, "sensor");
		assert.strictEqual(spec.description, "A test agent");
		assert.strictEqual(spec.model, "claude-sonnet-4-6");
		assert.deepStrictEqual(spec.tools, ["read", "bash"]);
		assert.strictEqual(spec.thinking, "low");
		assert.strictEqual(spec.promptTemplate, "test/system.md");
		assert.strictEqual(spec.taskTemplate, "test/task.md");
		assert.strictEqual(spec.outputFormat, "json");
		assert.strictEqual(spec.outputSchema, "test.schema.json");
		assert.deepStrictEqual(spec.inputSchema?.required, ["path"]);
	});

	it("uses filename as name when spec has no name field", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-agent-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const specPath = path.join(tmpDir, "my-agent.agent.yaml");
		fs.writeFileSync(
			specPath,
			`
tools: [read]
prompt:
  system: my/system.md
`,
		);

		const spec = parseAgentYaml(specPath);
		assert.strictEqual(spec.name, "my-agent");
	});

	it("parses minimal spec", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-agent-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const specPath = path.join(tmpDir, "minimal.agent.yaml");
		fs.writeFileSync(
			specPath,
			`
name: minimal
tools: [read]
`,
		);

		const spec = parseAgentYaml(specPath);
		assert.strictEqual(spec.name, "minimal");
		assert.deepStrictEqual(spec.tools, ["read"]);
		assert.strictEqual(spec.promptTemplate, undefined);
		assert.strictEqual(spec.taskTemplate, undefined);
		assert.strictEqual(spec.inputSchema, undefined);
	});
});

describe("createAgentLoader", () => {
	it("loads agent from project .pi/agents/ directory", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-loader-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const agentDir = path.join(tmpDir, ".pi", "agents");
		fs.mkdirSync(agentDir, { recursive: true });
		fs.writeFileSync(
			path.join(agentDir, "my-agent.agent.yaml"),
			`
name: my-agent
role: action
tools: [bash, edit]
prompt:
  system: my/system.md
`,
		);

		const loader = createAgentLoader(tmpDir);
		const spec = loader("my-agent");
		assert.strictEqual(spec.name, "my-agent");
		assert.strictEqual(spec.role, "action");
		assert.deepStrictEqual(spec.tools, ["bash", "edit"]);
	});

	it("throws AgentNotFoundError for unknown agents", (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-loader-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const loader = createAgentLoader(tmpDir);
		assert.throws(
			() => loader("nonexistent"),
			(err: any) => err.name === "AgentNotFoundError",
		);
	});
});

// ── Tool registration smoke tests (v0.24.0 surface symmetry patch) ─────────

interface CapturedTool {
	name: string;
	execute: (
		toolCallId: string,
		params: Record<string, unknown>,
		signal: AbortSignal | undefined,
		onUpdate: ((...a: unknown[]) => void) | undefined,
		ctx: { cwd: string },
	) => Promise<unknown>;
}

function captureTools(): { tools: Map<string, CapturedTool>; api: unknown } {
	const tools = new Map<string, CapturedTool>();
	const api = {
		on: () => {},
		registerTool: (def: { name: string; execute: CapturedTool["execute"] }) => {
			tools.set(def.name, { name: def.name, execute: def.execute });
		},
		registerCommand: () => {},
		registerShortcut: () => {},
		sendMessage: () => {},
	};
	return { tools, api };
}

function makeTmp(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), `pi-workflows-tool-${prefix}-`));
}

describe("pi-workflows extension: render-item-by-id tool", () => {
	it("renders a known DEC- ID through its per-item macro at depth=0", async (t) => {
		const cwd = makeTmp("render-by-id");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		const projectDir = path.join(cwd, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		fs.writeFileSync(
			path.join(projectDir, "decisions.json"),
			JSON.stringify({
				decisions: [
					{
						id: "DEC-0001",
						title: "test decision title",
						status: "enacted",
						context: "ctx",
						decision: "do the thing",
						consequences: ["a", "b"],
						created_by: "agent",
						created_at: "2026-05-02T00:00:00Z",
						related_findings: ["issue-001"],
					},
				],
			}),
		);

		const { tools, api } = captureTools();
		(extension as unknown as (pi: unknown) => void)(api);
		const tool = tools.get("render-item-by-id");
		assert.ok(tool, "render-item-by-id must be registered");

		const result = (await tool.execute(
			"call-1",
			{ id: "DEC-0001", depth: 0 },
			new AbortController().signal,
			undefined,
			{ cwd },
		)) as { content: { text: string }[] };

		const out = result.content[0]!.text;
		assert.match(out, /test decision title/);
		assert.match(out, /\bissue-001\b/, "depth=0 should render bare cross-reference IDs");
	});

	it("returns [not-found: <id>] for unknown IDs", async (t) => {
		const cwd = makeTmp("render-by-id-miss");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		fs.mkdirSync(path.join(cwd, ".project"), { recursive: true });

		const { tools, api } = captureTools();
		(extension as unknown as (pi: unknown) => void)(api);
		const tool = tools.get("render-item-by-id");
		assert.ok(tool, "render-item-by-id must be registered");

		const result = (await tool.execute("call-2", { id: "DEC-9999" }, new AbortController().signal, undefined, {
			cwd,
		})) as { content: { text: string }[] };

		assert.strictEqual(result.content[0]!.text, "[not-found: DEC-9999]");
	});
});

describe("pi-workflows extension: enforce-budget tool", () => {
	function seedSchema(cwd: string, name: string, schema: object): void {
		const dir = path.join(cwd, ".project", "schemas");
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, `${name}.schema.json`), JSON.stringify(schema));
	}

	it("under-budget rendered text passes through with warning=null", async (t) => {
		const cwd = makeTmp("enforce-under");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		seedSchema(cwd, "decisions", {
			type: "object",
			properties: {
				decisions: {
					type: "array",
					items: {
						type: "object",
						properties: { context: { type: "string", "x-prompt-budget": { tokens: 1000, words: 800 } } },
					},
				},
			},
		});

		const { tools, api } = captureTools();
		(extension as unknown as (pi: unknown) => void)(api);
		const tool = tools.get("enforce-budget");
		assert.ok(tool, "enforce-budget must be registered");

		const result = (await tool.execute(
			"call-1",
			{
				rendered: "short text",
				blockName: "decisions",
				fieldPath: "/properties/decisions/items/properties/context",
			},
			new AbortController().signal,
			undefined,
			{ cwd },
		)) as { content: { text: string }[] };

		const parsed = JSON.parse(result.content[0]!.text);
		assert.strictEqual(parsed.output, "short text");
		assert.strictEqual(parsed.warning, null);
	});

	it("over-budget rendered text returns truncated output and a warning record", async (t) => {
		const cwd = makeTmp("enforce-over");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		seedSchema(cwd, "decisions", {
			type: "object",
			properties: {
				decisions: {
					type: "array",
					items: {
						type: "object",
						properties: { context: { type: "string", "x-prompt-budget": { tokens: 5, words: 5 } } },
					},
				},
			},
		});

		const { tools, api } = captureTools();
		(extension as unknown as (pi: unknown) => void)(api);
		const tool = tools.get("enforce-budget");
		assert.ok(tool, "enforce-budget must be registered");

		const result = (await tool.execute(
			"call-2",
			{
				rendered: "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda",
				blockName: "decisions",
				fieldPath: "/properties/decisions/items/properties/context",
			},
			new AbortController().signal,
			undefined,
			{ cwd },
		)) as { content: { text: string }[] };

		const parsed = JSON.parse(result.content[0]!.text);
		assert.match(parsed.output, /\[…truncated to budget\]/);
		assert.ok(parsed.warning && typeof parsed.warning === "object");
		assert.strictEqual(parsed.warning.truncated, true);
		assert.strictEqual(parsed.warning.budget.tokens, 5);
	});

	it("throws when schema file does not exist", async (t) => {
		const cwd = makeTmp("enforce-noschema");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		const { tools, api } = captureTools();
		(extension as unknown as (pi: unknown) => void)(api);
		const tool = tools.get("enforce-budget");
		assert.ok(tool, "enforce-budget must be registered");

		await assert.rejects(async () => {
			await tool.execute(
				"call-3",
				{ rendered: "x", blockName: "missing", fieldPath: "/properties/x" },
				new AbortController().signal,
				undefined,
				{ cwd },
			);
		}, /enforce-budget: schema file not found/);
	});
});
