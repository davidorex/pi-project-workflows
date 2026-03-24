import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createAgentLoader, parseAgentYaml } from "./agent-spec.js";

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
