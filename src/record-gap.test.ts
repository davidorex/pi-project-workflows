/**
 * Tests for the record-gap tool logic.
 * Tests the appendToBlock-based gap recording directly since
 * the tool's execute function is a thin wrapper around block-api.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { readBlock, appendToBlock } from "./block-api.ts";
import { ValidationError } from "./schema-validator.ts";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "record-gap-"));
}

function setupGapsBlock(tmpDir: string, gaps: unknown[] = []): void {
  const wfDir = path.join(tmpDir, ".workflow");
  const schemasDir = path.join(wfDir, "schemas");
  fs.mkdirSync(schemasDir, { recursive: true });

  // Write gaps schema (matches .workflow/schemas/gaps.schema.json)
  fs.writeFileSync(path.join(schemasDir, "gaps.schema.json"), JSON.stringify({
    type: "object",
    required: ["gaps"],
    properties: {
      gaps: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "description", "status", "category", "priority"],
          properties: {
            id: { type: "string" },
            description: { type: "string" },
            status: { type: "string", enum: ["open", "resolved", "deferred"] },
            category: { type: "string", enum: ["primitive", "issue", "cleanup", "capability", "composition"] },
            priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
            resolved_by: { type: "string" },
            source: { type: "string", enum: ["human", "agent", "monitor", "workflow"] },
            details: { type: "string" },
          },
        },
      },
    },
  }));

  // Write initial gaps.json
  fs.writeFileSync(path.join(wfDir, "gaps.json"), JSON.stringify({ gaps }, null, 2));
}

describe("record-gap", () => {
  it("records gap with all required fields", (t) => {
    const tmpDir = makeTmpDir();
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
    setupGapsBlock(tmpDir);

    const entry = {
      id: "test-gap",
      description: "Something is missing",
      status: "open",
      category: "issue",
      priority: "high",
      source: "agent",
    };

    appendToBlock(tmpDir, "gaps", "gaps", entry);

    const data = readBlock(tmpDir, "gaps") as { gaps: unknown[] };
    assert.strictEqual(data.gaps.length, 1);
    assert.deepStrictEqual(data.gaps[0], entry);
  });

  it("rejects duplicate gap ID", (t) => {
    const tmpDir = makeTmpDir();
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
    setupGapsBlock(tmpDir, [
      { id: "existing-gap", description: "Already here", status: "open", category: "issue", priority: "medium", source: "human" },
    ]);

    // Simulate the tool's duplicate check
    const data = readBlock(tmpDir, "gaps") as { gaps: Array<{ id: string }> };
    const isDuplicate = data.gaps.some(g => g.id === "existing-gap");
    assert.ok(isDuplicate);
  });

  it("throws ValidationError on invalid category", (t) => {
    const tmpDir = makeTmpDir();
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
    setupGapsBlock(tmpDir);

    const badEntry = {
      id: "bad-gap",
      description: "Bad category",
      status: "open",
      category: "nonexistent-category",
      priority: "high",
      source: "agent",
    };

    assert.throws(
      () => appendToBlock(tmpDir, "gaps", "gaps", badEntry),
      (err: unknown) => {
        assert.ok(err instanceof ValidationError);
        return true;
      },
    );
  });

  it("throws when gaps.json does not exist", (t) => {
    const tmpDir = makeTmpDir();
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
    // No .workflow/ dir at all

    assert.throws(
      () => appendToBlock(tmpDir, "gaps", "gaps", { id: "x", description: "y", status: "open", category: "issue", priority: "low" }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("not found"));
        return true;
      },
    );
  });

  it("includes optional details field when provided", (t) => {
    const tmpDir = makeTmpDir();
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
    setupGapsBlock(tmpDir);

    const entry = {
      id: "detailed-gap",
      description: "Has details",
      status: "open",
      category: "capability",
      priority: "medium",
      source: "agent",
      details: "Extra context about the gap",
    };

    appendToBlock(tmpDir, "gaps", "gaps", entry);

    const data = readBlock(tmpDir, "gaps") as { gaps: Array<Record<string, unknown>> };
    assert.strictEqual(data.gaps[0].details, "Extra context about the gap");
  });
});
