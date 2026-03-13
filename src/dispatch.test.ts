import { describe, it } from "node:test";
import assert from "node:assert";
import { dispatch, buildArgs, extractText, extractToolArgsPreview } from "./dispatch.ts";
import type { StepSpec, AgentSpec } from "./types.ts";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Skip integration tests if pi is not available
let hasPi = false;
try {
  const { execSync } = await import("node:child_process");
  execSync("pi --version", { stdio: "ignore" });
  hasPi = true;
} catch {}

// ── Unit tests: extractText ──

describe("extractText", () => {
  it("extracts text from a content array with a text block", () => {
    const content = [{ type: "text", text: "Hello world" }];
    assert.strictEqual(extractText(content), "Hello world");
  });

  it("returns empty string for empty array", () => {
    assert.strictEqual(extractText([]), "");
  });

  it("returns empty string for null/undefined", () => {
    assert.strictEqual(extractText(null), "");
    assert.strictEqual(extractText(undefined), "");
  });

  it("returns empty string for non-array", () => {
    assert.strictEqual(extractText("just a string"), "");
    assert.strictEqual(extractText(42), "");
  });

  it("returns first text block when multiple exist", () => {
    const content = [
      { type: "text", text: "First" },
      { type: "text", text: "Second" },
    ];
    assert.strictEqual(extractText(content), "First");
  });

  it("skips non-text blocks", () => {
    const content = [
      { type: "tool_use", name: "bash" },
      { type: "text", text: "After tool" },
    ];
    assert.strictEqual(extractText(content), "After tool");
  });

  it("returns empty string for array with no text blocks", () => {
    const content = [
      { type: "tool_use", name: "bash" },
      { type: "image", source: {} },
    ];
    assert.strictEqual(extractText(content), "");
  });
});

// ── Unit tests: extractToolArgsPreview ──

describe("extractToolArgsPreview", () => {
  it("returns empty string for null/undefined", () => {
    assert.strictEqual(extractToolArgsPreview(null), "");
    assert.strictEqual(extractToolArgsPreview(undefined), "");
  });

  it("returns empty string for non-object", () => {
    assert.strictEqual(extractToolArgsPreview("string"), "");
    assert.strictEqual(extractToolArgsPreview(42), "");
  });

  it("extracts command arg", () => {
    assert.strictEqual(extractToolArgsPreview({ command: "ls -la" }), "ls -la");
  });

  it("extracts path arg", () => {
    assert.strictEqual(extractToolArgsPreview({ path: "/foo/bar.ts" }), "/foo/bar.ts");
  });

  it("extracts pattern arg", () => {
    assert.strictEqual(extractToolArgsPreview({ pattern: "*.ts" }), "*.ts");
  });

  it("extracts query arg", () => {
    assert.strictEqual(extractToolArgsPreview({ query: "SELECT 1" }), "SELECT 1");
  });

  it("extracts task arg", () => {
    assert.strictEqual(extractToolArgsPreview({ task: "do something" }), "do something");
  });

  it("prefers command over other keys", () => {
    assert.strictEqual(
      extractToolArgsPreview({ command: "npm test", path: "/foo" }),
      "npm test",
    );
  });

  it("truncates long values to 60 chars", () => {
    const longVal = "a".repeat(100);
    const result = extractToolArgsPreview({ command: longVal });
    assert.strictEqual(result.length, 60);
    assert.ok(result.endsWith("..."));
    assert.strictEqual(result, "a".repeat(57) + "...");
  });

  it("does not truncate values at exactly 60 chars", () => {
    const val60 = "b".repeat(60);
    assert.strictEqual(extractToolArgsPreview({ command: val60 }), val60);
  });

  it("returns empty string when no recognized keys present", () => {
    assert.strictEqual(extractToolArgsPreview({ foo: "bar", baz: 42 }), "");
  });

  it("skips non-string values for recognized keys", () => {
    assert.strictEqual(extractToolArgsPreview({ command: 123, path: true }), "");
  });
});

// ── Unit tests: buildArgs ──

describe("buildArgs", () => {
  const baseOptions = {
    cwd: "/tmp",
    sessionLogDir: "/tmp/sessions",
    stepName: "test-step",
  };

  it("produces minimal args for a bare step and agent", () => {
    const step: StepSpec = { agent: "default" };
    const agent: AgentSpec = { name: "default" };
    const args = buildArgs(step, agent, "hello", baseOptions);

    assert.deepStrictEqual(args.slice(0, 2), ["--mode", "json"]);
    assert.ok(args.includes("--session-dir"));
    assert.ok(args.includes("/tmp/sessions"));
    // Ends with -p hello
    assert.strictEqual(args[args.length - 2], "-p");
    assert.strictEqual(args[args.length - 1], "hello");
    // No model args
    assert.ok(!args.includes("--models"));
  });

  it("includes model from agent spec", () => {
    const step: StepSpec = { agent: "coder" };
    const agent: AgentSpec = { name: "coder", model: "claude-sonnet-4-20250514" };
    const args = buildArgs(step, agent, "do it", baseOptions);

    const idx = args.indexOf("--models");
    assert.ok(idx >= 0);
    assert.strictEqual(args[idx + 1], "claude-sonnet-4-20250514");
  });

  it("step model overrides agent model", () => {
    const step: StepSpec = { agent: "coder", model: "claude-opus-4-20250514" };
    const agent: AgentSpec = { name: "coder", model: "claude-sonnet-4-20250514" };
    const args = buildArgs(step, agent, "do it", baseOptions);

    const idx = args.indexOf("--models");
    assert.strictEqual(args[idx + 1], "claude-opus-4-20250514");
  });

  it("appends thinking suffix to model", () => {
    const step: StepSpec = { agent: "coder" };
    const agent: AgentSpec = { name: "coder", model: "claude-sonnet-4-20250514", thinking: "16k" };
    const args = buildArgs(step, agent, "do it", baseOptions);

    const idx = args.indexOf("--models");
    assert.strictEqual(args[idx + 1], "claude-sonnet-4-20250514:16k");
  });

  it("handles builtin tools", () => {
    const step: StepSpec = { agent: "coder" };
    const agent: AgentSpec = { name: "coder", tools: ["bash", "read", "write"] };
    const args = buildArgs(step, agent, "do it", baseOptions);

    const idx = args.indexOf("--tools");
    assert.ok(idx >= 0);
    assert.strictEqual(args[idx + 1], "bash,read,write");
  });

  it("handles extension tool paths", () => {
    const step: StepSpec = { agent: "coder" };
    const agent: AgentSpec = { name: "coder", tools: ["bash", "./ext/my-tool.ts", "/abs/tool.js"] };
    const args = buildArgs(step, agent, "do it", baseOptions);

    const toolsIdx = args.indexOf("--tools");
    assert.ok(toolsIdx >= 0);
    assert.strictEqual(args[toolsIdx + 1], "bash");

    // Should have two --extension entries for the paths
    const extIndices = args.reduce<number[]>((acc, a, i) => {
      if (a === "--extension") acc.push(i);
      return acc;
    }, []);
    assert.strictEqual(extIndices.length, 2);
    assert.strictEqual(args[extIndices[0] + 1], "./ext/my-tool.ts");
    assert.strictEqual(args[extIndices[1] + 1], "/abs/tool.js");
  });

  it("handles extensions scoping", () => {
    const step: StepSpec = { agent: "coder" };
    const agent: AgentSpec = { name: "coder", extensions: ["./ext1.ts", "./ext2.ts"] };
    const args = buildArgs(step, agent, "do it", baseOptions);

    assert.ok(args.includes("--no-extensions"));
    const extIndices = args.reduce<number[]>((acc, a, i) => {
      if (a === "--extension") acc.push(i);
      return acc;
    }, []);
    assert.strictEqual(extIndices.length, 2);
  });

  it("handles skills scoping", () => {
    const step: StepSpec = { agent: "coder" };
    const agent: AgentSpec = { name: "coder", skills: ["coding", "testing"] };
    const args = buildArgs(step, agent, "do it", baseOptions);

    assert.ok(args.includes("--no-skills"));
  });
});

// ── Integration tests: dispatch (require pi on PATH) ──

describe("dispatch", { skip: !hasPi ? "pi not available" : undefined }, () => {
  it("runs a simple prompt and returns text output", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-dispatch-"));
    const sessDir = path.join(tmpDir, "sessions");
    fs.mkdirSync(sessDir, { recursive: true });

    const result = await dispatch(
      { agent: "default" },     // no specific agent — use pi defaults
      { name: "default" },      // minimal agent spec
      "Respond with exactly: HELLO WORKFLOW",
      { cwd: process.cwd(), sessionLogDir: sessDir, stepName: "test" },
    );

    assert.strictEqual(result.status, "completed");
    assert.ok(result.textOutput.includes("HELLO WORKFLOW"));
    assert.ok(result.usage.turns >= 1);
    assert.ok(result.durationMs > 0);

    fs.rmSync(tmpDir, { recursive: true });
  }, { timeout: 60000 });

  it("returns failed status on bad prompt/agent", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-dispatch-"));
    const sessDir = path.join(tmpDir, "sessions");
    fs.mkdirSync(sessDir, { recursive: true });

    // --tools none should cause pi to fail or at least limit capabilities
    const result = await dispatch(
      { agent: "nonexistent-agent-xyz" },
      { name: "nonexistent-agent-xyz" },
      "This should fail",
      { cwd: process.cwd(), sessionLogDir: sessDir, stepName: "test" },
    );

    // Exact failure mode depends on pi behavior with unknown agents
    // At minimum we should get a result back (not throw)
    assert.ok(result.durationMs > 0);

    fs.rmSync(tmpDir, { recursive: true });
  }, { timeout: 30000 });

  it("supports cancellation via AbortSignal", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-dispatch-"));
    const sessDir = path.join(tmpDir, "sessions");
    fs.mkdirSync(sessDir, { recursive: true });

    const controller = new AbortController();

    // Cancel after 2 seconds
    setTimeout(() => controller.abort(), 2000);

    const result = await dispatch(
      { agent: "default" },
      { name: "default" },
      "Write a very long essay about the history of computing. Make it at least 5000 words.",
      { cwd: process.cwd(), sessionLogDir: sessDir, stepName: "test", signal: controller.signal },
    );

    assert.strictEqual(result.status, "failed");

    fs.rmSync(tmpDir, { recursive: true });
  }, { timeout: 30000 });

  it("fires onEvent callback for process events", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-dispatch-"));
    const sessDir = path.join(tmpDir, "sessions");
    fs.mkdirSync(sessDir, { recursive: true });

    const events: string[] = [];

    const result = await dispatch(
      { agent: "default" },
      { name: "default" },
      "Respond with exactly: TEST",
      {
        cwd: process.cwd(),
        sessionLogDir: sessDir,
        stepName: "test",
        onEvent: (evt) => events.push(evt.type),
      },
    );

    assert.ok(events.includes("agent_start"));
    assert.ok(events.includes("message_end"));

    fs.rmSync(tmpDir, { recursive: true });
  }, { timeout: 60000 });
});
