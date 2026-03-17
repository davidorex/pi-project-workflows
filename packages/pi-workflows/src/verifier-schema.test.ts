import { describe, it } from "node:test";
import assert from "node:assert";
import path from "node:path";
import { validateFromFile } from "@davidorex/pi-project/src/schema-validator.js";

const schemaPath = path.resolve(import.meta.dirname, "..", "schemas", "verifier-output.schema.json");

function validVerifierOutput() {
  return {
    status: "passed",
    score: "3/3",
    truths: [
      { truth: "Tests pass", status: "verified", evidence: "npm test exited 0" },
      { truth: "File exists", status: "verified", evidence: "ls confirmed" },
      { truth: "Schema valid", status: "verified", evidence: "ajv validates" },
    ],
    criteria_results: [
      {
        criterion: "All tests pass",
        verify_method: "command",
        status: "passed",
        expected_outcome: "exit code 0",
        actual_outcome: "exit code 0",
        evidence: "npm test output: 3 passing",
      },
      {
        criterion: "File structure correct",
        verify_method: "inspect",
        status: "passed",
        evidence: "All expected files present",
      },
      {
        criterion: "UI renders correctly",
        verify_method: "inspect",
        status: "skipped",
        evidence: "Requires visual inspection",
      },
    ],
  };
}

describe("verifier-output schema validation", () => {
  it("validates a complete verifier output", () => {
    const data = validVerifierOutput();
    const result = validateFromFile(schemaPath, data, "test");
    assert.deepStrictEqual(result, data);
  });

  it("validates with all optional fields present", () => {
    const data = {
      ...validVerifierOutput(),
      artifacts: [
        { path: "src/index.ts", status: "verified", exists: true, substantive: true, wired: true, details: "Main entry point" },
        { path: "src/missing.ts", status: "missing", exists: false },
      ],
      requirements_coverage: [
        { requirement_id: "REQ-001", status: "satisfied", supporting_truths: ["Tests pass"] },
        { requirement_id: "REQ-002", status: "needs_human" },
      ],
      human_verification: [
        { name: "UI layout", test: "Open browser and check layout", expected: "Grid renders correctly", why_human: "Requires visual inspection" },
      ],
      gaps: [
        { truth: "Performance benchmark", status: "failed", reason: "No benchmark data available" },
      ],
    };
    const result = validateFromFile(schemaPath, data, "test");
    assert.ok(result);
  });

  it("validates with empty optional arrays", () => {
    const data = {
      ...validVerifierOutput(),
      artifacts: [],
      requirements_coverage: [],
      human_verification: [],
      gaps: [],
    };
    const result = validateFromFile(schemaPath, data, "test");
    assert.ok(result);
  });

  it("rejects missing required field: status", () => {
    const data = validVerifierOutput();
    delete (data as any).status;
    assert.throws(
      () => validateFromFile(schemaPath, data, "test"),
      (err: any) => err.message.includes("Validation failed"),
    );
  });

  it("rejects missing required field: score", () => {
    const data = validVerifierOutput();
    delete (data as any).score;
    assert.throws(
      () => validateFromFile(schemaPath, data, "test"),
      (err: any) => err.message.includes("Validation failed"),
    );
  });

  it("rejects missing required field: truths", () => {
    const data = validVerifierOutput();
    delete (data as any).truths;
    assert.throws(
      () => validateFromFile(schemaPath, data, "test"),
      (err: any) => err.message.includes("Validation failed"),
    );
  });

  it("rejects missing required field: criteria_results", () => {
    const data = validVerifierOutput();
    delete (data as any).criteria_results;
    assert.throws(
      () => validateFromFile(schemaPath, data, "test"),
      (err: any) => err.message.includes("Validation failed"),
    );
  });

  it("rejects invalid status enum value", () => {
    const data = validVerifierOutput();
    data.status = "invalid_status" as any;
    assert.throws(
      () => validateFromFile(schemaPath, data, "test"),
      (err: any) => err.message.includes("Validation failed"),
    );
  });

  it("rejects invalid truth status enum value", () => {
    const data = validVerifierOutput();
    data.truths[0].status = "bad_status" as any;
    assert.throws(
      () => validateFromFile(schemaPath, data, "test"),
      (err: any) => err.message.includes("Validation failed"),
    );
  });

  it("rejects invalid verify_method enum value", () => {
    const data = validVerifierOutput();
    data.criteria_results[0].verify_method = "magic" as any;
    assert.throws(
      () => validateFromFile(schemaPath, data, "test"),
      (err: any) => err.message.includes("Validation failed"),
    );
  });

  it("rejects invalid criteria_results status enum value", () => {
    const data = validVerifierOutput();
    data.criteria_results[0].status = "invalid" as any;
    assert.throws(
      () => validateFromFile(schemaPath, data, "test"),
      (err: any) => err.message.includes("Validation failed"),
    );
  });

  it("rejects invalid artifact status enum value", () => {
    const data = {
      ...validVerifierOutput(),
      artifacts: [{ path: "test.ts", status: "unknown" }],
    };
    assert.throws(
      () => validateFromFile(schemaPath, data, "test"),
      (err: any) => err.message.includes("Validation failed"),
    );
  });
});

describe("plan-breakdown schema validation", () => {
  const planSchemaPath = path.resolve(import.meta.dirname, "..", "schemas", "plan-breakdown.schema.json");

  it("validates a valid plan breakdown", () => {
    const data = {
      plans: [
        {
          name: "implement-auth",
          intent: "Add authentication",
          tasks: ["Create auth module", "Add login endpoint"],
          acceptance_criteria: ["Login works", "Tests pass"],
          files_to_change: ["src/auth.ts"],
          context_needed: ["existing user model"],
          parallel_group: "core",
        },
      ],
    };
    const result = validateFromFile(planSchemaPath, data, "test");
    assert.ok(result);
  });

  it("rejects missing required plan fields", () => {
    const data = { plans: [{ name: "test" }] };
    assert.throws(
      () => validateFromFile(planSchemaPath, data, "test"),
      (err: any) => err.message.includes("Validation failed"),
    );
  });
});

describe("execution-results schema validation", () => {
  const execSchemaPath = path.resolve(import.meta.dirname, "..", "schemas", "execution-results.schema.json");

  it("validates a valid execution result", () => {
    const data = {
      status: "complete",
      tasks: [
        { name: "implement feature", status: "done", files_modified: ["src/index.ts"], commit_hash: "abc123", notes: "Done" },
      ],
      decisions: [
        { id: "D-001", decision: "Use ESM", rationale: "Modern standard", status: "decided" },
      ],
      issues: [
        { severity: "info", description: "Minor lint warning" },
      ],
      test_count: 42,
      commit_hash: "abc123",
    };
    const result = validateFromFile(execSchemaPath, data, "test");
    assert.ok(result);
  });

  it("rejects invalid status enum", () => {
    const data = { status: "unknown", tasks: [] };
    assert.throws(
      () => validateFromFile(execSchemaPath, data, "test"),
      (err: any) => err.message.includes("Validation failed"),
    );
  });
});
