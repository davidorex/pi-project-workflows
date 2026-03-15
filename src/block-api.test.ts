import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { readBlock, writeBlock, appendToBlock, updateItemInBlock } from "./block-api.ts";
import { ValidationError } from "./schema-validator.ts";

function makeTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `block-api-${prefix}-`));
}

function setupWorkflowDir(tmpDir: string): string {
  const wfDir = path.join(tmpDir, ".workflow");
  fs.mkdirSync(wfDir, { recursive: true });
  return wfDir;
}

function setupSchema(tmpDir: string, blockName: string, schema: Record<string, unknown>): void {
  const schemasDir = path.join(tmpDir, ".workflow", "schemas");
  fs.mkdirSync(schemasDir, { recursive: true });
  fs.writeFileSync(
    path.join(schemasDir, `${blockName}.schema.json`),
    JSON.stringify(schema, null, 2),
  );
}

const gapsSchema = {
  type: "object",
  required: ["gaps"],
  properties: {
    gaps: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "description", "status"],
        properties: {
          id: { type: "string" },
          description: { type: "string" },
          status: { type: "string", enum: ["open", "resolved", "deferred"] },
        },
      },
    },
  },
};

describe("readBlock", () => {
  it("reads and parses valid JSON block", (t) => {
    const tmpDir = makeTmpDir("read-valid");
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
    const wfDir = setupWorkflowDir(tmpDir);

    const data = { gaps: [{ id: "g1", description: "test", status: "open" }] };
    fs.writeFileSync(path.join(wfDir, "gaps.json"), JSON.stringify(data));

    const result = readBlock(tmpDir, "gaps");
    assert.deepStrictEqual(result, data);
  });

  it("throws when block file does not exist", (t) => {
    const tmpDir = makeTmpDir("read-missing");
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
    setupWorkflowDir(tmpDir);

    assert.throws(
      () => readBlock(tmpDir, "nonexistent"),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("not found"));
        return true;
      },
    );
  });

  it("throws when .workflow/ dir does not exist", (t) => {
    const tmpDir = makeTmpDir("read-nodir");
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    assert.throws(
      () => readBlock(tmpDir, "gaps"),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("not found"));
        return true;
      },
    );
  });

  it("throws on invalid JSON", (t) => {
    const tmpDir = makeTmpDir("read-badjson");
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
    const wfDir = setupWorkflowDir(tmpDir);

    fs.writeFileSync(path.join(wfDir, "bad.json"), "not json{{");

    assert.throws(
      () => readBlock(tmpDir, "bad"),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("Invalid JSON"));
        return true;
      },
    );
  });

  it("reads block with no corresponding schema", (t) => {
    const tmpDir = makeTmpDir("read-noschema");
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
    const wfDir = setupWorkflowDir(tmpDir);

    const data = { default: "claude-sonnet-4-20250514" };
    fs.writeFileSync(path.join(wfDir, "model-config.json"), JSON.stringify(data));

    const result = readBlock(tmpDir, "model-config");
    assert.deepStrictEqual(result, data);
  });

  it("reads non-array-wrapper blocks", (t) => {
    const tmpDir = makeTmpDir("read-flat");
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
    const wfDir = setupWorkflowDir(tmpDir);

    const data = { current_phase: 5, test_count: 100 };
    fs.writeFileSync(path.join(wfDir, "state.json"), JSON.stringify(data));

    const result = readBlock(tmpDir, "state");
    assert.deepStrictEqual(result, data);
  });
});

describe("writeBlock", () => {
  it("writes valid data with schema validation", (t) => {
    const tmpDir = makeTmpDir("write-valid");
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
    setupWorkflowDir(tmpDir);
    setupSchema(tmpDir, "gaps", gapsSchema);

    const data = { gaps: [{ id: "g1", description: "test", status: "open" }] };
    writeBlock(tmpDir, "gaps", data);

    const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".workflow", "gaps.json"), "utf-8"));
    assert.deepStrictEqual(onDisk, data);
  });

  it("throws ValidationError on schema violation — file NOT created", (t) => {
    const tmpDir = makeTmpDir("write-invalid");
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
    setupWorkflowDir(tmpDir);
    setupSchema(tmpDir, "gaps", gapsSchema);

    const badData = { gaps: [{ id: 123, description: "test" }] }; // id should be string, missing status

    assert.throws(
      () => writeBlock(tmpDir, "gaps", badData),
      (err: unknown) => {
        assert.ok(err instanceof ValidationError);
        return true;
      },
    );

    assert.ok(!fs.existsSync(path.join(tmpDir, ".workflow", "gaps.json")));
  });

  it("writes without validation when no schema exists", (t) => {
    const tmpDir = makeTmpDir("write-noschema");
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
    setupWorkflowDir(tmpDir);

    const data = { anything: "goes" };
    writeBlock(tmpDir, "custom", data);

    const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".workflow", "custom.json"), "utf-8"));
    assert.deepStrictEqual(onDisk, data);
  });

  it("creates .workflow/ dir if missing", (t) => {
    const tmpDir = makeTmpDir("write-mkdir");
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const data = { test: true };
    writeBlock(tmpDir, "new-block", data);

    assert.ok(fs.existsSync(path.join(tmpDir, ".workflow", "new-block.json")));
  });

  it("no tmp file remains after successful write", (t) => {
    const tmpDir = makeTmpDir("write-notmp");
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
    setupWorkflowDir(tmpDir);

    writeBlock(tmpDir, "clean", { data: true });

    const wfDir = path.join(tmpDir, ".workflow");
    const files = fs.readdirSync(wfDir);
    const tmpFiles = files.filter(f => f.includes(".tmp"));
    assert.strictEqual(tmpFiles.length, 0);
  });

  it("no tmp file or data file on validation failure", (t) => {
    const tmpDir = makeTmpDir("write-cleanfail");
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
    setupWorkflowDir(tmpDir);
    setupSchema(tmpDir, "gaps", gapsSchema);

    try {
      writeBlock(tmpDir, "gaps", { gaps: "not an array" });
    } catch { /* expected */ }

    const wfDir = path.join(tmpDir, ".workflow");
    const files = fs.readdirSync(wfDir);
    assert.ok(!files.includes("gaps.json"));
    const tmpFiles = files.filter(f => f.includes(".tmp"));
    assert.strictEqual(tmpFiles.length, 0);
  });

  it("overwrites existing block file", (t) => {
    const tmpDir = makeTmpDir("write-overwrite");
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
    setupWorkflowDir(tmpDir);

    writeBlock(tmpDir, "data", { version: 1 });
    writeBlock(tmpDir, "data", { version: 2 });

    const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".workflow", "data.json"), "utf-8"));
    assert.strictEqual(onDisk.version, 2);
  });

  it("preserves 2-space JSON indent", (t) => {
    const tmpDir = makeTmpDir("write-indent");
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
    setupWorkflowDir(tmpDir);

    writeBlock(tmpDir, "fmt", { key: "value" });

    const raw = fs.readFileSync(path.join(tmpDir, ".workflow", "fmt.json"), "utf-8");
    assert.ok(raw.includes("  \"key\""));
  });
});

describe("appendToBlock", () => {
  it("appends item to existing array", (t) => {
    const tmpDir = makeTmpDir("append-existing");
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
    setupWorkflowDir(tmpDir);
    setupSchema(tmpDir, "gaps", gapsSchema);

    const initial = { gaps: [{ id: "g1", description: "first", status: "open" }] };
    fs.writeFileSync(path.join(tmpDir, ".workflow", "gaps.json"), JSON.stringify(initial));

    appendToBlock(tmpDir, "gaps", "gaps", { id: "g2", description: "second", status: "open" });

    const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".workflow", "gaps.json"), "utf-8"));
    assert.strictEqual(onDisk.gaps.length, 2);
    assert.strictEqual(onDisk.gaps[1].id, "g2");
  });

  it("appends to empty array", (t) => {
    const tmpDir = makeTmpDir("append-empty");
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
    setupWorkflowDir(tmpDir);
    setupSchema(tmpDir, "gaps", gapsSchema);

    fs.writeFileSync(path.join(tmpDir, ".workflow", "gaps.json"), JSON.stringify({ gaps: [] }));

    appendToBlock(tmpDir, "gaps", "gaps", { id: "g1", description: "first", status: "open" });

    const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".workflow", "gaps.json"), "utf-8"));
    assert.strictEqual(onDisk.gaps.length, 1);
  });

  it("throws ValidationError on invalid item — original file unchanged", (t) => {
    const tmpDir = makeTmpDir("append-invalid");
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
    setupWorkflowDir(tmpDir);
    setupSchema(tmpDir, "gaps", gapsSchema);

    const original = { gaps: [{ id: "g1", description: "valid", status: "open" }] };
    const originalStr = JSON.stringify(original);
    fs.writeFileSync(path.join(tmpDir, ".workflow", "gaps.json"), originalStr);

    assert.throws(
      () => appendToBlock(tmpDir, "gaps", "gaps", { id: 999, description: "bad" }), // missing status, bad id type
      (err: unknown) => {
        assert.ok(err instanceof ValidationError);
        return true;
      },
    );

    const afterStr = fs.readFileSync(path.join(tmpDir, ".workflow", "gaps.json"), "utf-8");
    assert.strictEqual(afterStr, originalStr);
  });

  it("throws when block file does not exist", (t) => {
    const tmpDir = makeTmpDir("append-nofile");
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
    setupWorkflowDir(tmpDir);

    assert.throws(
      () => appendToBlock(tmpDir, "missing", "items", { id: "x" }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("not found"));
        return true;
      },
    );
  });

  it("throws when arrayKey does not exist in data", (t) => {
    const tmpDir = makeTmpDir("append-nokey");
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
    setupWorkflowDir(tmpDir);

    fs.writeFileSync(path.join(tmpDir, ".workflow", "gaps.json"), JSON.stringify({ gaps: [] }));

    assert.throws(
      () => appendToBlock(tmpDir, "gaps", "decisions", { id: "d1" }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("has no key"));
        return true;
      },
    );
  });

  it("throws when arrayKey is not an array", (t) => {
    const tmpDir = makeTmpDir("append-notarray");
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
    setupWorkflowDir(tmpDir);

    fs.writeFileSync(path.join(tmpDir, ".workflow", "data.json"), JSON.stringify({ items: "string" }));

    assert.throws(
      () => appendToBlock(tmpDir, "data", "items", { id: "x" }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("not an array"));
        return true;
      },
    );
  });

  it("does not mutate file on validation failure", (t) => {
    const tmpDir = makeTmpDir("append-nomutate");
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
    setupWorkflowDir(tmpDir);
    setupSchema(tmpDir, "gaps", gapsSchema);

    const original = { gaps: [{ id: "g1", description: "safe", status: "open" }] };
    fs.writeFileSync(path.join(tmpDir, ".workflow", "gaps.json"), JSON.stringify(original, null, 2));

    try {
      appendToBlock(tmpDir, "gaps", "gaps", { broken: true });
    } catch { /* expected */ }

    const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".workflow", "gaps.json"), "utf-8"));
    assert.strictEqual(onDisk.gaps.length, 1);
    assert.strictEqual(onDisk.gaps[0].id, "g1");
  });

  it("appends to block without schema", (t) => {
    const tmpDir = makeTmpDir("append-noschema");
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
    setupWorkflowDir(tmpDir);

    fs.writeFileSync(path.join(tmpDir, ".workflow", "custom.json"), JSON.stringify({ items: [1] }));

    appendToBlock(tmpDir, "custom", "items", 2);

    const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".workflow", "custom.json"), "utf-8"));
    assert.deepStrictEqual(onDisk.items, [1, 2]);
  });

  it("sequential appends — both items present", (t) => {
    const tmpDir = makeTmpDir("append-seq");
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
    setupWorkflowDir(tmpDir);

    fs.writeFileSync(path.join(tmpDir, ".workflow", "list.json"), JSON.stringify({ items: [] }));

    appendToBlock(tmpDir, "list", "items", "first");
    appendToBlock(tmpDir, "list", "items", "second");

    const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".workflow", "list.json"), "utf-8"));
    assert.deepStrictEqual(onDisk.items, ["first", "second"]);
  });
});

describe("updateItemInBlock", () => {
  it("updates matching item fields", (t) => {
    const tmpDir = makeTmpDir("update-match");
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
    setupWorkflowDir(tmpDir);
    setupSchema(tmpDir, "gaps", gapsSchema);

    const initial = { gaps: [{ id: "g1", description: "test", status: "open" }] };
    fs.writeFileSync(path.join(tmpDir, ".workflow", "gaps.json"), JSON.stringify(initial));

    updateItemInBlock(tmpDir, "gaps", "gaps", (g) => g.id === "g1", { status: "resolved", resolved_by: "test" });

    const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".workflow", "gaps.json"), "utf-8"));
    assert.strictEqual(onDisk.gaps[0].status, "resolved");
    assert.strictEqual(onDisk.gaps[0].resolved_by, "test");
    assert.strictEqual(onDisk.gaps[0].id, "g1"); // unchanged
  });

  it("throws when no item matches predicate", (t) => {
    const tmpDir = makeTmpDir("update-nomatch");
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
    setupWorkflowDir(tmpDir);

    fs.writeFileSync(path.join(tmpDir, ".workflow", "gaps.json"), JSON.stringify({ gaps: [{ id: "g1" }] }));

    assert.throws(
      () => updateItemInBlock(tmpDir, "gaps", "gaps", (g) => g.id === "nonexistent", { status: "resolved" }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("No matching item"));
        return true;
      },
    );
  });

  it("throws ValidationError when update produces invalid data — original unchanged", (t) => {
    const tmpDir = makeTmpDir("update-invalid");
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
    setupWorkflowDir(tmpDir);
    setupSchema(tmpDir, "gaps", gapsSchema);

    const original = { gaps: [{ id: "g1", description: "test", status: "open" }] };
    const originalStr = JSON.stringify(original);
    fs.writeFileSync(path.join(tmpDir, ".workflow", "gaps.json"), originalStr);

    assert.throws(
      () => updateItemInBlock(tmpDir, "gaps", "gaps", (g) => g.id === "g1", { status: "invalid-status" }),
      (err: unknown) => {
        assert.ok(err instanceof ValidationError);
        return true;
      },
    );

    // Original file unchanged
    const afterStr = fs.readFileSync(path.join(tmpDir, ".workflow", "gaps.json"), "utf-8");
    assert.strictEqual(afterStr, originalStr);
  });

  it("preserves other items in array", (t) => {
    const tmpDir = makeTmpDir("update-preserve");
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
    setupWorkflowDir(tmpDir);

    const initial = { items: [{ id: "a", val: 1 }, { id: "b", val: 2 }, { id: "c", val: 3 }] };
    fs.writeFileSync(path.join(tmpDir, ".workflow", "data.json"), JSON.stringify(initial));

    updateItemInBlock(tmpDir, "data", "items", (i) => i.id === "b", { val: 99 });

    const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".workflow", "data.json"), "utf-8"));
    assert.strictEqual(onDisk.items[0].val, 1);
    assert.strictEqual(onDisk.items[1].val, 99);
    assert.strictEqual(onDisk.items[2].val, 3);
  });

  it("shallow merge — new field added, existing field overwritten", (t) => {
    const tmpDir = makeTmpDir("update-merge");
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
    setupWorkflowDir(tmpDir);

    fs.writeFileSync(path.join(tmpDir, ".workflow", "data.json"), JSON.stringify({
      items: [{ id: "x", existing: "old", keep: "this" }],
    }));

    updateItemInBlock(tmpDir, "data", "items", (i) => i.id === "x", { existing: "new", added: "field" });

    const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".workflow", "data.json"), "utf-8"));
    assert.strictEqual(onDisk.items[0].existing, "new");
    assert.strictEqual(onDisk.items[0].added, "field");
    assert.strictEqual(onDisk.items[0].keep, "this");
  });

  it("works on block without schema", (t) => {
    const tmpDir = makeTmpDir("update-noschema");
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
    setupWorkflowDir(tmpDir);

    fs.writeFileSync(path.join(tmpDir, ".workflow", "custom.json"), JSON.stringify({ items: [{ id: "a", v: 1 }] }));

    updateItemInBlock(tmpDir, "custom", "items", (i) => i.id === "a", { v: 2 });

    const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".workflow", "custom.json"), "utf-8"));
    assert.strictEqual(onDisk.items[0].v, 2);
  });
});
