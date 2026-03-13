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

  // ── Completion field tests ──

  it("parses completion with template", () => {
    const yaml = `
name: test
steps:
  s:
    agent: a
completion:
  template: |
    Result: \${{ steps.s.textOutput }}
`;
    const spec = parseWorkflowSpec(yaml, "/t.yaml", "project");
    assert.ok(spec.completion);
    assert.strictEqual(spec.completion.template, "Result: ${{ steps.s.textOutput }}\n");
    assert.strictEqual(spec.completion.message, undefined);
  });

  it("parses completion with message and include", () => {
    const yaml = `
name: test
steps:
  s:
    agent: a
completion:
  message: Present these findings.
  include:
    - steps.s.textOutput
    - steps.s.usage
`;
    const spec = parseWorkflowSpec(yaml, "/t.yaml", "project");
    assert.ok(spec.completion);
    assert.strictEqual(spec.completion.message, "Present these findings.");
    assert.deepStrictEqual(spec.completion.include, ["steps.s.textOutput", "steps.s.usage"]);
    assert.strictEqual(spec.completion.template, undefined);
  });

  it("parses completion with message only (no include)", () => {
    const yaml = `
name: test
steps:
  s:
    agent: a
completion:
  message: Just an instruction.
`;
    const spec = parseWorkflowSpec(yaml, "/t.yaml", "project");
    assert.ok(spec.completion);
    assert.strictEqual(spec.completion.message, "Just an instruction.");
    assert.strictEqual(spec.completion.include, undefined);
  });

  it("throws when completion has both template and message", () => {
    const yaml = `
name: test
steps:
  s:
    agent: a
completion:
  template: some template
  message: some message
`;
    assert.throws(
      () => parseWorkflowSpec(yaml, "/t.yaml", "project"),
      (err: unknown) => err instanceof WorkflowSpecError && err.message.includes("cannot have both"),
    );
  });

  it("throws when completion has neither template nor message", () => {
    const yaml = `
name: test
steps:
  s:
    agent: a
completion:
  include:
    - steps.s.textOutput
`;
    assert.throws(
      () => parseWorkflowSpec(yaml, "/t.yaml", "project"),
      (err: unknown) => err instanceof WorkflowSpecError && err.message.includes("must have either"),
    );
  });

  it("throws when completion is not an object", () => {
    const yaml = `
name: test
steps:
  s:
    agent: a
completion: just a string
`;
    assert.throws(
      () => parseWorkflowSpec(yaml, "/t.yaml", "project"),
      (err: unknown) => err instanceof WorkflowSpecError && err.message.includes("must be an object"),
    );
  });

  it("throws when completion.include is not an array", () => {
    const yaml = `
name: test
steps:
  s:
    agent: a
completion:
  message: ok
  include: not-an-array
`;
    assert.throws(
      () => parseWorkflowSpec(yaml, "/t.yaml", "project"),
      (err: unknown) => err instanceof WorkflowSpecError && err.message.includes("array of strings"),
    );
  });

  it("has no completion when field is absent", () => {
    const yaml = `
name: test
steps:
  s:
    agent: a
`;
    const spec = parseWorkflowSpec(yaml, "/t.yaml", "project");
    assert.strictEqual(spec.completion, undefined);
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
