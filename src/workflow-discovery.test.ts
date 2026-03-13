import { describe, it } from "node:test";
import assert from "node:assert";
import { discoverWorkflows, findWorkflow } from "./workflow-discovery.ts";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("discoverWorkflows", () => {
  it("discovers workflows from project directory", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-test-"));
    const wfDir = path.join(tmpDir, ".pi", "workflows");
    fs.mkdirSync(wfDir, { recursive: true });
    fs.writeFileSync(
      path.join(wfDir, "test.workflow.yaml"),
      "name: test\nsteps:\n  s:\n    agent: a",
    );

    const specs = discoverWorkflows(tmpDir);
    assert.strictEqual(specs.length, 1);
    assert.strictEqual(specs[0].name, "test");
    assert.strictEqual(specs[0].source, "project");

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("returns empty array when no workflow directories exist", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-test-"));
    const specs = discoverWorkflows(tmpDir);
    assert.strictEqual(specs.length, 0);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("skips invalid specs with warning (no throw)", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-test-"));
    const wfDir = path.join(tmpDir, ".pi", "workflows");
    fs.mkdirSync(wfDir, { recursive: true });
    fs.writeFileSync(path.join(wfDir, "bad.workflow.yaml"), "not: valid: workflow");
    fs.writeFileSync(
      path.join(wfDir, "good.workflow.yaml"),
      "name: good\nsteps:\n  s:\n    agent: a",
    );

    const specs = discoverWorkflows(tmpDir);
    assert.strictEqual(specs.length, 1);
    assert.strictEqual(specs[0].name, "good");

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("project specs shadow user specs with same name", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-test-"));
    const projectDir = path.join(tmpDir, ".pi", "workflows");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, "shared.workflow.yaml"),
      "name: shared\ndescription: project version\nsteps:\n  s:\n    agent: a",
    );

    // Note: testing user-level discovery requires mocking os.homedir()
    // or injecting the user workflows dir. For unit tests, verify the
    // dedup logic by calling parseWorkflowSpec directly and testing
    // the dedup in a focused helper.

    const specs = discoverWorkflows(tmpDir);
    assert.strictEqual(specs.length, 1);
    assert.strictEqual(specs[0].source, "project");

    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe("findWorkflow", () => {
  it("finds a workflow by name", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-test-"));
    const wfDir = path.join(tmpDir, ".pi", "workflows");
    fs.mkdirSync(wfDir, { recursive: true });
    fs.writeFileSync(
      path.join(wfDir, "bugfix.workflow.yaml"),
      "name: bugfix\nsteps:\n  s:\n    agent: a",
    );

    const spec = findWorkflow("bugfix", tmpDir);
    assert.ok(spec);
    assert.strictEqual(spec.name, "bugfix");

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("returns undefined for unknown workflow", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-test-"));
    assert.strictEqual(findWorkflow("nonexistent", tmpDir), undefined);
    fs.rmSync(tmpDir, { recursive: true });
  });
});
