import { describe, it } from "node:test";
import assert from "node:assert";
import { parseWorkflowSpec, WorkflowSpecError } from "./workflow-spec.ts";

describe("parseWorkflowSpec", () => {
  it("parses a minimal valid spec", () => {
    const yaml = `
name: test
steps:
  step1:
    agent: my-agent
`;
    const spec = parseWorkflowSpec(yaml, "/test.workflow.yaml", "project");
    assert.strictEqual(spec.name, "test");
    assert.strictEqual(spec.steps.step1.agent, "my-agent");
    assert.strictEqual(spec.source, "project");
    assert.strictEqual(spec.filePath, "/test.workflow.yaml");
    assert.strictEqual(spec.triggerTurn, true); // default
  });

  it("parses a full spec", () => {
    const yaml = `
name: bugfix
description: Fix a bug
version: "1"
triggerTurn: false
input:
  type: object
  required: [description]
  properties:
    description:
      type: string
steps:
  diagnose:
    agent: diagnostician
    input:
      description: \${{ input.description }}
    output:
      format: json
      schema: ./schemas/diagnosis.schema.json
  fix:
    agent: fixer
    model: claude-sonnet-4-6
    input:
      diagnosis: \${{ steps.diagnose.output }}
`;
    const spec = parseWorkflowSpec(yaml, "/bugfix.workflow.yaml", "user");
    assert.strictEqual(spec.name, "bugfix");
    assert.strictEqual(spec.description, "Fix a bug");
    assert.strictEqual(spec.triggerTurn, false);
    assert.strictEqual(spec.steps.diagnose.agent, "diagnostician");
    assert.strictEqual(spec.steps.diagnose.output?.schema, "./schemas/diagnosis.schema.json");
    assert.strictEqual(spec.steps.fix.model, "claude-sonnet-4-6");
  });

  it("throws on missing name", () => {
    assert.throws(
      () => parseWorkflowSpec("steps:\n  s:\n    agent: a", "/t.yaml", "project"),
      (err: unknown) => err instanceof WorkflowSpecError && err.message.includes("name"),
    );
  });

  it("throws on missing steps", () => {
    assert.throws(
      () => parseWorkflowSpec("name: test", "/t.yaml", "project"),
      (err: unknown) => err instanceof WorkflowSpecError && err.message.includes("steps"),
    );
  });

  it("throws on empty steps", () => {
    assert.throws(
      () => parseWorkflowSpec("name: test\nsteps: {}", "/t.yaml", "project"),
      (err: unknown) => err instanceof WorkflowSpecError && err.message.includes("non-empty"),
    );
  });

  it("throws on step missing agent", () => {
    assert.throws(
      () => parseWorkflowSpec("name: test\nsteps:\n  s:\n    model: foo", "/t.yaml", "project"),
      (err: unknown) => err instanceof WorkflowSpecError && err.message.includes("agent"),
    );
  });

  it("throws on invalid YAML", () => {
    assert.throws(
      () => parseWorkflowSpec("name: [[[invalid", "/t.yaml", "project"),
      (err: unknown) => err instanceof WorkflowSpecError,
    );
  });

  it("preserves step order", () => {
    const yaml = `
name: test
steps:
  third:
    agent: c
  first:
    agent: a
  second:
    agent: b
`;
    const spec = parseWorkflowSpec(yaml, "/t.yaml", "project");
    const stepNames = Object.keys(spec.steps);
    assert.deepStrictEqual(stepNames, ["third", "first", "second"]);
  });
});
