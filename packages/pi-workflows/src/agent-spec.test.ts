import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { parseAgentYaml, createAgentLoader, AgentNotFoundError, AgentParseError } from "./agent-spec.js";
import { compileAgentSpec } from "./step-shared.js";
import { createTemplateEnv } from "./template.js";

describe("parseAgentYaml", () => {
  it("parses YAML agent spec with all fields", (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-agent-"));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const specPath = path.join(tmpDir, "test.agent.yaml");
    fs.writeFileSync(specPath, `
name: test-agent
role: sensor
description: A test agent
model: anthropic/claude-sonnet-4-6
thinking: low
tools: [read, bash]
extensions: [./ext.ts]
skills: [coding]
input:
  type: object
  required: [path]
  properties:
    path: { type: string }
output:
  format: json
  schema: test.schema.json
  file: result.json
prompt:
  system: test/system.md
  task: test/task.md
`);

    const spec = parseAgentYaml(specPath);
    assert.strictEqual(spec.name, "test-agent");
    assert.strictEqual(spec.role, "sensor");
    assert.strictEqual(spec.description, "A test agent");
    assert.strictEqual(spec.model, "anthropic/claude-sonnet-4-6");
    assert.strictEqual(spec.thinking, "low");
    assert.deepStrictEqual(spec.tools, ["read", "bash"]);
    assert.deepStrictEqual(spec.extensions, ["./ext.ts"]);
    assert.deepStrictEqual(spec.skills, ["coding"]);
    assert.strictEqual(spec.promptTemplate, "test/system.md");
    assert.strictEqual(spec.taskTemplate, "test/task.md");
    assert.strictEqual(spec.outputFormat, "json");
    assert.strictEqual(spec.outputSchema, "test.schema.json");
    assert.strictEqual(spec.output, "result.json");
    assert.deepStrictEqual(spec.inputSchema?.required, ["path"]);
  });

  it("uses filename as name when name field is missing", (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-agent-"));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const specPath = path.join(tmpDir, "my-agent.agent.yaml");
    fs.writeFileSync(specPath, "tools: [read]\n");

    const spec = parseAgentYaml(specPath);
    assert.strictEqual(spec.name, "my-agent");
  });

  it("throws AgentParseError for malformed YAML", (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-agent-"));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const specPath = path.join(tmpDir, "bad.agent.yaml");
    fs.writeFileSync(specPath, `
name: bad-agent
tools: [read
  this is not valid yaml: {{{}}}
`);

    assert.throws(
      () => parseAgentYaml(specPath),
      (err: any) => {
        assert.strictEqual(err.name, "AgentParseError");
        assert.strictEqual(err.agentName, "bad");
        assert.strictEqual(err.filePath, specPath);
        assert.ok(err.message.includes("bad"), "error message should include agent name");
        assert.ok(err.message.includes(specPath), "error message should include file path");
        return true;
      },
    );
  });

  it("throws AgentParseError for empty file", (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-agent-"));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const specPath = path.join(tmpDir, "empty.agent.yaml");
    fs.writeFileSync(specPath, "");

    assert.throws(
      () => parseAgentYaml(specPath),
      (err: any) => {
        assert.strictEqual(err.name, "AgentParseError");
        assert.ok(err.message.includes("empty") || err.message.includes("does not contain"));
        return true;
      },
    );
  });

  it("throws AgentParseError for file with only document markers", (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-agent-"));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const specPath = path.join(tmpDir, "marker.agent.yaml");
    fs.writeFileSync(specPath, "---\n---\n");

    assert.throws(
      () => parseAgentYaml(specPath),
      (err: any) => {
        assert.strictEqual(err.name, "AgentParseError");
        return true;
      },
    );
  });

  it("throws AgentParseError for scalar YAML content", (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-agent-"));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const specPath = path.join(tmpDir, "scalar.agent.yaml");
    fs.writeFileSync(specPath, "just a string, not a mapping\n");

    assert.throws(
      () => parseAgentYaml(specPath),
      (err: any) => {
        assert.strictEqual(err.name, "AgentParseError");
        assert.ok(err.message.includes("does not contain a YAML mapping"));
        return true;
      },
    );
  });
});

describe("createAgentLoader", () => {
  it("finds .agent.yaml specs in .pi/agents/", (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-agent-"));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const agentDir = path.join(tmpDir, ".pi", "agents");
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(path.join(agentDir, "test.agent.yaml"), "name: test\nrole: sensor\ntools: [read]\n");

    const loader = createAgentLoader(tmpDir);
    const spec = loader("test");
    assert.strictEqual(spec.name, "test");
    assert.strictEqual(spec.role, "sensor");
    assert.deepStrictEqual(spec.tools, ["read"]);
  });

  it("finds specs in builtin directory", (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-agent-"));
    const builtinDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-builtin-"));
    t.after(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      fs.rmSync(builtinDir, { recursive: true, force: true });
    });

    fs.writeFileSync(path.join(builtinDir, "builtin.agent.yaml"), "name: builtin\nrole: quality\n");

    const loader = createAgentLoader(tmpDir, builtinDir);
    const spec = loader("builtin");
    assert.strictEqual(spec.name, "builtin");
    assert.strictEqual(spec.role, "quality");
  });

  it("throws AgentNotFoundError for missing agent", (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-agent-"));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const loader = createAgentLoader(tmpDir, tmpDir);  // builtinDir also empty
    assert.throws(
      () => loader("nonexistent-agent"),
      (err: any) => {
        assert.strictEqual(err.name, "AgentNotFoundError");
        assert.strictEqual(err.agentName, "nonexistent-agent");
        assert.ok(Array.isArray(err.searchPaths));
        assert.ok(err.searchPaths.length >= 2, "should list at least project and user search paths");
        assert.ok(err.message.includes("nonexistent-agent"), "error message should include agent name");
        assert.ok(err.message.includes("Searched"), "error message should indicate search was performed");
        return true;
      },
    );
  });

  it("throws AgentParseError when found file has invalid YAML", (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-agent-"));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const agentDir = path.join(tmpDir, ".pi", "agents");
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(path.join(agentDir, "broken.agent.yaml"), "name: broken\ntools: [read\n");

    const loader = createAgentLoader(tmpDir, tmpDir);
    assert.throws(
      () => loader("broken"),
      (err: any) => {
        assert.strictEqual(err.name, "AgentParseError");
        assert.strictEqual(err.agentName, "broken");
        assert.ok(err.filePath.includes("broken.agent.yaml"));
        return true;
      },
    );
  });
});

describe("compileAgentSpec", () => {
  it("renders plain text system prompt unchanged", () => {
    const env = createTemplateEnv("/nonexistent");
    const spec = { name: "test", systemPrompt: "Plain text prompt." };
    const result = compileAgentSpec(spec, {}, env);
    assert.strictEqual(result.systemPrompt, "Plain text prompt.");
  });

  it("renders system prompt with template variables", () => {
    const env = createTemplateEnv("/nonexistent");
    const spec = { name: "test", systemPrompt: "Analyze {{ path }} for {{ concern }}." };
    const result = compileAgentSpec(spec, { path: "src/index.ts", concern: "security" }, env);
    assert.strictEqual(result.systemPrompt, "Analyze src/index.ts for security.");
  });

  it("renders system prompt from file template", (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-tmpl-"));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    fs.writeFileSync(path.join(tmpDir, "system.md"), "You analyze {{ focus }} code.");

    const env = createTemplateEnv("/nonexistent", tmpDir);
    const spec = { name: "test", promptTemplate: "system.md" };
    const result = compileAgentSpec(spec, { focus: "TypeScript" }, env);
    assert.strictEqual(result.systemPrompt, "You analyze TypeScript code.");
    assert.strictEqual(result.promptTemplate, undefined);
  });

  it("renders task template from typed input", (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-tmpl-"));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    fs.writeFileSync(path.join(tmpDir, "task.md"), "Fix {{ diagnosis.rootCause }} in {{ diagnosis.file }}.");

    const env = createTemplateEnv("/nonexistent", tmpDir);
    const spec = { name: "test", taskTemplate: "task.md" };
    const result = compileAgentSpec(spec, { diagnosis: { rootCause: "null ref", file: "auth.ts" } }, env);
    assert.strictEqual(result.taskTemplate, "Fix null ref in auth.ts.");
  });

  it("returns spec unchanged when no templateEnv provided", () => {
    const spec = { name: "test", systemPrompt: "Hello {{ name }}", taskTemplate: "task.md" };
    const result = compileAgentSpec(spec, { name: "world" });
    assert.strictEqual(result.systemPrompt, "Hello {{ name }}");
    assert.strictEqual(result.taskTemplate, "task.md");
  });
});

describe("verifier agent spec", () => {
  const builtinDir = path.resolve(import.meta.dirname, "..", "agents");

  it("parses verifier.agent.yaml correctly", () => {
    const specPath = path.join(builtinDir, "verifier.agent.yaml");
    const spec = parseAgentYaml(specPath);
    assert.strictEqual(spec.name, "verifier");
    assert.strictEqual(spec.role, "quality");
    assert.strictEqual(spec.description, "Verifies step outputs against declared intent and success criteria");
    assert.strictEqual(spec.model, undefined);  // model comes from .project/model-config.json, not agent spec
    assert.strictEqual(spec.outputFormat, "json");
    assert.strictEqual(spec.outputSchema, "schemas/verifier-output.schema.json");
    assert.strictEqual(spec.taskTemplate, "verifier/task.md");
  });

  it("has correct tools for verification", () => {
    const specPath = path.join(builtinDir, "verifier.agent.yaml");
    const spec = parseAgentYaml(specPath);
    assert.deepStrictEqual(spec.tools, ["read", "bash", "grep", "find"]);
  });

  it("output schema path resolves to a valid file", () => {
    const specPath = path.join(builtinDir, "verifier.agent.yaml");
    const spec = parseAgentYaml(specPath);
    const schemaPath = path.resolve(path.dirname(specPath), "..", "schemas", spec.outputSchema!.replace("schemas/", ""));
    assert.ok(fs.existsSync(schemaPath), `Schema file not found at ${schemaPath}`);
  });
});
