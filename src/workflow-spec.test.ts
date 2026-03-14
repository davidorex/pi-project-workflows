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

  it("throws on step with no type", () => {
    assert.throws(
      () => parseWorkflowSpec("name: test\nsteps:\n  s:\n    model: foo", "/t.yaml", "project"),
      (err: unknown) => err instanceof WorkflowSpecError && err.message.includes("must have exactly one of"),
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

  // ── Phase 2 step type tests ──

  it("parses gate step", () => {
    const yaml = `
name: test
steps:
  verify:
    gate:
      check: npm test
      onPass: continue
      onFail: fail
`;
    const spec = parseWorkflowSpec(yaml, "/t.yaml", "project");
    assert.ok(spec.steps.verify.gate);
    assert.strictEqual(spec.steps.verify.gate.check, "npm test");
    assert.strictEqual(spec.steps.verify.gate.onPass, "continue");
    assert.strictEqual(spec.steps.verify.gate.onFail, "fail");
    assert.strictEqual(spec.steps.verify.agent, undefined);
  });

  it("parses transform step", () => {
    const yaml = `
name: test
steps:
  prep:
    agent: analyzer
  combine:
    transform:
      mapping:
        summary: \${{ steps.prep.output.summary }}
        count: 42
`;
    const spec = parseWorkflowSpec(yaml, "/t.yaml", "project");
    assert.ok(spec.steps.combine.transform);
    assert.strictEqual(typeof spec.steps.combine.transform.mapping, "object");
    assert.strictEqual((spec.steps.combine.transform.mapping as any).count, 42);
    assert.strictEqual(spec.steps.combine.agent, undefined);
  });

  it("parses loop step", () => {
    const yaml = `
name: test
steps:
  retry:
    loop:
      maxAttempts: 3
      steps:
        attempt:
          agent: fixer
        check:
          gate:
            check: npm test
`;
    const spec = parseWorkflowSpec(yaml, "/t.yaml", "project");
    assert.ok(spec.steps.retry.loop);
    assert.strictEqual(spec.steps.retry.loop.maxAttempts, 3);
    assert.strictEqual(Object.keys(spec.steps.retry.loop.steps).length, 2);
    assert.ok(spec.steps.retry.loop.steps.attempt.agent);
    assert.ok(spec.steps.retry.loop.steps.check.gate);
  });

  it("rejects step with both agent and gate", () => {
    const yaml = `
name: test
steps:
  bad:
    agent: my-agent
    gate:
      check: npm test
`;
    assert.throws(
      () => parseWorkflowSpec(yaml, "/t.yaml", "project"),
      (err: unknown) => err instanceof WorkflowSpecError && err.message.includes("must have exactly one of"),
    );
  });

  it("rejects step with no type (no agent, gate, transform, or loop)", () => {
    const yaml = `
name: test
steps:
  empty:
    when: \${{ input.enabled }}
`;
    assert.throws(
      () => parseWorkflowSpec(yaml, "/t.yaml", "project"),
      (err: unknown) => err instanceof WorkflowSpecError && err.message.includes("must have exactly one of"),
    );
  });

  it("rejects step with workflow (not yet supported)", () => {
    const yaml = `
name: test
steps:
  nested:
    workflow: other-workflow
`;
    assert.throws(
      () => parseWorkflowSpec(yaml, "/t.yaml", "project"),
      (err: unknown) => err instanceof WorkflowSpecError && err.message.includes("not yet supported"),
    );
  });

  it("parses artifacts", () => {
    const yaml = `
name: test
steps:
  s:
    agent: a
artifacts:
  report:
    path: ./output/report.md
    from: \${{ steps.s.textOutput }}
  data:
    path: ./output/data.json
    from: \${{ steps.s.output }}
    schema: ./schemas/data.schema.json
`;
    const spec = parseWorkflowSpec(yaml, "/t.yaml", "project");
    assert.ok(spec.artifacts);
    assert.strictEqual(Object.keys(spec.artifacts).length, 2);
    assert.strictEqual(spec.artifacts.report.path, "./output/report.md");
    assert.strictEqual(spec.artifacts.report.from, "${{ steps.s.textOutput }}");
    assert.strictEqual(spec.artifacts.data.schema, "./schemas/data.schema.json");
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

  it("parses parallel step", () => {
    const yaml = `
name: test
steps:
  both:
    parallel:
      a:
        agent: analyzer-a
      b:
        agent: analyzer-b
`;
    const spec = parseWorkflowSpec(yaml, "/t.yaml", "project");
    assert.ok(spec.steps.both.parallel);
    assert.ok(spec.steps.both.parallel!.a);
    assert.ok(spec.steps.both.parallel!.b);
    assert.strictEqual(spec.steps.both.parallel!.a.agent, "analyzer-a");
    assert.strictEqual(spec.steps.both.parallel!.b.agent, "analyzer-b");
  });

  it("rejects empty parallel step", () => {
    const yaml = `
name: test
steps:
  both:
    parallel: {}
`;
    assert.throws(
      () => parseWorkflowSpec(yaml, "/t.yaml", "project"),
      (err: any) => err.message.includes("non-empty"),
    );
  });

  it("rejects step with both agent and parallel", () => {
    const yaml = `
name: test
steps:
  both:
    agent: default
    parallel:
      a:
        agent: default
`;
    assert.throws(
      () => parseWorkflowSpec(yaml, "/t.yaml", "project"),
      (err: any) => err.message.includes("exactly one"),
    );
  });

  it("validates sub-steps within parallel", () => {
    const yaml = `
name: test
steps:
  both:
    parallel:
      a:
        agent: analyzer
      b:
        notAType: true
`;
    assert.throws(
      () => parseWorkflowSpec(yaml, "/t.yaml", "project"),
      (err: any) => err.message.includes("exactly one"),
    );
  });

  // ── forEach and as field tests ──

  it("parses forEach and as fields", () => {
    const yaml = `
name: test
steps:
  process:
    forEach: \${{ input.items }}
    as: item
    transform:
      mapping:
        value: \${{ item }}
`;
    const spec = parseWorkflowSpec(yaml, "/t.yaml", "project");
    assert.strictEqual(spec.steps.process.forEach, "${{ input.items }}");
    assert.strictEqual(spec.steps.process.as, "item");
    assert.ok(spec.steps.process.transform);
  });

  it("parses forEach without as (default)", () => {
    const yaml = `
name: test
steps:
  process:
    forEach: \${{ input.items }}
    transform:
      mapping:
        value: \${{ item }}
`;
    const spec = parseWorkflowSpec(yaml, "/t.yaml", "project");
    assert.strictEqual(spec.steps.process.forEach, "${{ input.items }}");
    assert.strictEqual(spec.steps.process.as, undefined);
  });

  it("rejects forEach with non-string value", () => {
    const yaml = `
name: test
steps:
  process:
    forEach: 42
    transform:
      mapping:
        value: test
`;
    assert.throws(
      () => parseWorkflowSpec(yaml, "/t.yaml", "project"),
      (err: any) => err.message.includes("forEach must be a string"),
    );
  });

  it("rejects as with non-string value", () => {
    const yaml = `
name: test
steps:
  process:
    forEach: \${{ input.items }}
    as: 42
    transform:
      mapping:
        value: test
`;
    assert.throws(
      () => parseWorkflowSpec(yaml, "/t.yaml", "project"),
      (err: any) => err.message.includes("as must be a string"),
    );
  });

  // ── command step type tests ──

  it("parses command step", () => {
    const yaml = `
name: test
steps:
  run:
    command: echo hello
`;
    const spec = parseWorkflowSpec(yaml, "/t.yaml", "project");
    assert.strictEqual(spec.steps.run.command, "echo hello");
    assert.strictEqual(spec.steps.run.agent, undefined);
  });

  it("parses command step with output format", () => {
    const yaml = `
name: test
steps:
  run:
    command: cat data.json
    output:
      format: json
`;
    const spec = parseWorkflowSpec(yaml, "/t.yaml", "project");
    assert.strictEqual(spec.steps.run.command, "cat data.json");
    assert.strictEqual(spec.steps.run.output?.format, "json");
  });

  it("rejects command with non-string value", () => {
    const yaml = `
name: test
steps:
  run:
    command: 42
`;
    assert.throws(
      () => parseWorkflowSpec(yaml, "/t.yaml", "project"),
      (err: any) => err.message.includes("command must be a string"),
    );
  });

  it("rejects command + agent together", () => {
    const yaml = `
name: test
steps:
  bad:
    command: echo hello
    agent: my-agent
`;
    assert.throws(
      () => parseWorkflowSpec(yaml, "/t.yaml", "project"),
      (err: any) => err.message.includes("exactly one"),
    );
  });
});
