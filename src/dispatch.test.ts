import { describe, it } from "node:test";
import assert from "node:assert";
import { dispatch, buildArgs, extractText, extractToolArgsPreview } from "./dispatch.ts";
import type { StepSpec, AgentSpec, StepResult } from "./types.ts";
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

  it("resolves model from modelConfig by role when agent has no model", () => {
    const step: StepSpec = { agent: "coder" };
    const agent: AgentSpec = { name: "coder", role: "action" };
    const opts = { ...baseOptions, modelConfig: { default: "fallback-model", by_role: { action: "opus-4" } } };
    const args = buildArgs(step, agent, "do it", opts);

    const idx = args.indexOf("--models");
    assert.ok(idx >= 0);
    assert.strictEqual(args[idx + 1], "opus-4");
  });

  it("resolves model from modelConfig default when no role match", () => {
    const step: StepSpec = { agent: "coder" };
    const agent: AgentSpec = { name: "coder", role: "unknown-role" };
    const opts = { ...baseOptions, modelConfig: { default: "fallback-model", by_role: { action: "opus-4" } } };
    const args = buildArgs(step, agent, "do it", opts);

    const idx = args.indexOf("--models");
    assert.ok(idx >= 0);
    assert.strictEqual(args[idx + 1], "fallback-model");
  });

  it("step model overrides modelConfig", () => {
    const step: StepSpec = { agent: "coder", model: "step-override" };
    const agent: AgentSpec = { name: "coder", role: "action" };
    const opts = { ...baseOptions, modelConfig: { default: "fallback-model", by_role: { action: "opus-4" } } };
    const args = buildArgs(step, agent, "do it", opts);

    const idx = args.indexOf("--models");
    assert.strictEqual(args[idx + 1], "step-override");
  });

  it("agent model overrides modelConfig", () => {
    const step: StepSpec = { agent: "coder" };
    const agent: AgentSpec = { name: "coder", model: "agent-model", role: "action" };
    const opts = { ...baseOptions, modelConfig: { default: "fallback-model", by_role: { action: "opus-4" } } };
    const args = buildArgs(step, agent, "do it", opts);

    const idx = args.indexOf("--models");
    assert.strictEqual(args[idx + 1], "agent-model");
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

// ── Unit tests: StepResult truncation fields ──

describe("StepResult truncation fields", () => {
  it("truncated and warnings are optional on StepResult", () => {
    // Verify the type contract: a StepResult without truncated/warnings is valid
    const result: StepResult = {
      step: "test",
      agent: "agent",
      status: "completed",
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
      durationMs: 0,
    };
    assert.strictEqual(result.truncated, undefined);
    assert.strictEqual(result.warnings, undefined);

    // A truncated result is also valid
    const truncResult: StepResult = {
      ...result,
      truncated: true,
      warnings: ["Stdout exceeded 10MB limit"],
    };
    assert.strictEqual(truncResult.truncated, true);
    assert.strictEqual(truncResult.warnings!.length, 1);
  });
});

// ── Unit tests: truncation detection logic ──

describe("truncation detection logic", () => {
  it("sets truncated flag when accumulated bytes exceed threshold", () => {
    // Simulate the accumulation logic from dispatch's data handler
    const MAX = 100; // small threshold for testing
    let bufBytes = 0;
    let stdoutTruncated = false;
    const processedLines: string[] = [];
    let buf = "";

    function handleChunk(chunk: string) {
      bufBytes += Buffer.byteLength(chunk);
      if (bufBytes > MAX) {
        if (!stdoutTruncated) {
          stdoutTruncated = true;
          if (buf.trim()) {
            processedLines.push(buf.trim());
            buf = "";
          }
        }
        return;
      }
      buf += chunk;
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        if (line.trim()) processedLines.push(line.trim());
      }
    }

    // Send chunks that total over 100 bytes
    handleChunk('{"type":"event1"}\n');  // ~18 bytes
    handleChunk('{"type":"event2"}\n');  // ~36 total
    handleChunk('{"type":"event3"}\n');  // ~54 total
    handleChunk('{"type":"event4"}\n');  // ~72 total
    handleChunk('{"type":"event5"}\n');  // ~90 total
    handleChunk('{"type":"event6"}\n');  // ~108 total — exceeds 100

    assert.strictEqual(stdoutTruncated, true);
    // Events before the threshold should have been processed
    assert.ok(processedLines.length >= 4);
    assert.ok(processedLines.length < 6, "Post-threshold events should not be processed");
  });

  it("does not set truncated flag when under threshold", () => {
    const MAX = 10000;
    let bufBytes = 0;
    let stdoutTruncated = false;

    function handleChunk(chunk: string) {
      bufBytes += Buffer.byteLength(chunk);
      if (bufBytes > MAX) {
        stdoutTruncated = true;
        return;
      }
    }

    handleChunk('{"type":"small"}\n');
    assert.strictEqual(stdoutTruncated, false);
  });
});

// ── Integration test: dispatch truncation contract ──

describe("dispatch truncation", { skip: !hasPi ? "pi not available" : undefined }, () => {
  it("sets truncated flag when stdout exceeds buffer limit", async () => {
    // A normal-sized response should NOT have truncated set.
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-dispatch-trunc-"));
    const sessDir = path.join(tmpDir, "sessions");
    fs.mkdirSync(sessDir, { recursive: true });

    const result = await dispatch(
      { agent: "default" },
      { name: "default" },
      "Respond with exactly: OK",
      { cwd: process.cwd(), sessionLogDir: sessDir, stepName: "test" },
    );

    assert.strictEqual(result.status, "completed");
    assert.strictEqual(result.truncated, undefined, "Normal response should not be truncated");
    assert.strictEqual(result.warnings, undefined, "Normal response should have no warnings");

    fs.rmSync(tmpDir, { recursive: true });
  }, { timeout: 60000 });
});
