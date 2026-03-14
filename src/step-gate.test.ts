import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { executeGate } from "./step-gate.ts";
import { zeroUsage } from "./step-shared.ts";

describe("executeGate", () => {
  // Happy path — command passes (exit 0)
  it("returns completed with passed:true on exit 0", async (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-gate-"));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const result = await executeGate({ check: "echo pass" }, "gate1", { cwd: tmpDir });
    assert.strictEqual(result.status, "completed");
    assert.strictEqual((result.output as any).passed, true);
    assert.strictEqual((result.output as any).exitCode, 0);
  }, { timeout: 10000 });

  it("captures stdout in output.output and textOutput", async (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-gate-"));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const result = await executeGate({ check: "echo hello" }, "gate1", { cwd: tmpDir });
    assert.strictEqual((result.output as any).output, "hello");
    assert.strictEqual(result.textOutput, "hello");
  }, { timeout: 10000 });

  it("sets agent to 'gate'", async (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-gate-"));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const result = await executeGate({ check: "true" }, "gate1", { cwd: tmpDir });
    assert.strictEqual(result.agent, "gate");
  }, { timeout: 10000 });

  it("has zero usage", async (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-gate-"));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const result = await executeGate({ check: "true" }, "gate1", { cwd: tmpDir });
    assert.deepStrictEqual(result.usage, zeroUsage());
  }, { timeout: 10000 });

  it("records positive durationMs", async (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-gate-"));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const result = await executeGate({ check: "echo test" }, "gate1", { cwd: tmpDir });
    assert.ok(result.durationMs >= 0);
  }, { timeout: 10000 });

  // Command fails (non-zero exit)
  it("returns completed with passed:false on non-zero exit", async (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-gate-"));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const result = await executeGate({ check: "exit 1" }, "gate1", { cwd: tmpDir });
    assert.strictEqual(result.status, "completed");
    assert.strictEqual((result.output as any).passed, false);
    assert.strictEqual((result.output as any).exitCode, 1);
  }, { timeout: 10000 });

  it("captures stderr on failure", async (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-gate-"));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const result = await executeGate({ check: "echo err >&2; exit 1" }, "gate1", { cwd: tmpDir });
    assert.ok((result.output as any).output.includes("err"));
  }, { timeout: 10000 });

  it("captures stdout when stderr is empty on failure", async (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-gate-"));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const result = await executeGate({ check: "echo stdout-msg; exit 1" }, "gate1", { cwd: tmpDir });
    assert.ok((result.output as any).output.includes("stdout-msg"));
  }, { timeout: 10000 });

  // Stdout trimming
  it("trims whitespace from stdout", async (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-gate-"));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const result = await executeGate({ check: "echo '  trimmed  '" }, "gate1", { cwd: tmpDir });
    assert.strictEqual((result.output as any).output, "trimmed");
    assert.strictEqual(result.textOutput, "trimmed");
  }, { timeout: 10000 });

  // Output persistence
  it("persists output when runDir is provided", async (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-gate-"));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
    fs.mkdirSync(path.join(tmpDir, "outputs"), { recursive: true });

    const result = await executeGate({ check: "echo persist" }, "gate1", { cwd: tmpDir, runDir: tmpDir });
    assert.ok(result.outputPath);
    assert.ok(fs.existsSync(result.outputPath!));
  }, { timeout: 10000 });

  it("persists to custom outputPath when provided", async (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-gate-"));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const customPath = path.join(tmpDir, "custom-gate.json");
    const result = await executeGate({ check: "echo custom" }, "gate1", {
      cwd: tmpDir,
      runDir: tmpDir,
      outputPath: customPath,
    });
    assert.strictEqual(result.outputPath, customPath);
    assert.ok(fs.existsSync(customPath));
  }, { timeout: 10000 });

  it("does not persist when runDir is omitted", async (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-gate-"));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const result = await executeGate({ check: "echo nopersist" }, "gate1", { cwd: tmpDir });
    assert.strictEqual(result.outputPath, undefined);
  }, { timeout: 10000 });

  // Cancellation
  it("terminates on abort signal", async (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-gate-"));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const controller = new AbortController();
    controller.abort();
    const result = await executeGate({ check: "sleep 30" }, "gate1", {
      cwd: tmpDir,
      signal: controller.signal,
    });
    // Should resolve (not hang) — the process was killed
    assert.ok(result);
  }, { timeout: 10000 });

  it("terminates on late abort signal", async (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-gate-"));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 200);
    const result = await executeGate({ check: "sleep 30" }, "gate1", {
      cwd: tmpDir,
      signal: controller.signal,
    });
    assert.ok(result);
    // The gate should have failed since the process was killed
    assert.strictEqual((result.output as any).passed, false);
  }, { timeout: 10000 });

  // Timeout
  it("terminates on timeout", async (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-gate-"));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const result = await executeGate({ check: "sleep 30" }, "gate1", {
      cwd: tmpDir,
      timeoutMs: 500,
    });
    assert.ok(result);
    assert.strictEqual((result.output as any).passed, false);
  }, { timeout: 10000 });

  // Edge cases
  it("handles command that produces no output", async (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-gate-"));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const result = await executeGate({ check: "true" }, "gate1", { cwd: tmpDir });
    assert.strictEqual((result.output as any).output, "");
    assert.strictEqual(result.textOutput, "");
  }, { timeout: 10000 });

  it("handles command with multi-line stdout", async (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-gate-"));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const result = await executeGate({ check: "echo line1; echo line2" }, "gate1", { cwd: tmpDir });
    assert.ok((result.output as any).output.includes("line1"));
    assert.ok((result.output as any).output.includes("line2"));
  }, { timeout: 10000 });
});
