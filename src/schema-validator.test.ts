import { describe, it } from "node:test";
import assert from "node:assert";
import { validate, validateFromFile, ValidationError } from "./schema-validator.ts";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("validate", () => {
  it("passes valid data through", () => {
    const schema = {
      type: "object",
      required: ["name"],
      properties: { name: { type: "string" } },
    };
    const data = { name: "test" };
    const result = validate(schema, data, "test");
    assert.deepStrictEqual(result, data);
  });

  it("throws ValidationError on invalid data", () => {
    const schema = {
      type: "object",
      required: ["name"],
      properties: { name: { type: "string" } },
    };
    assert.throws(
      () => validate(schema, { name: 123 }, "test input"),
      (err: unknown) => {
        assert.ok(err instanceof ValidationError);
        assert.ok(err.message.includes("test input"));
        assert.ok(err.message.includes("/name"));
        return true;
      },
    );
  });

  it("throws ValidationError for missing required fields", () => {
    const schema = {
      type: "object",
      required: ["name", "age"],
      properties: {
        name: { type: "string" },
        age: { type: "integer" },
      },
    };
    assert.throws(
      () => validate(schema, {}, "person"),
      (err: unknown) => {
        assert.ok(err instanceof ValidationError);
        assert.ok(err.errors.length >= 2); // allErrors: true
        return true;
      },
    );
  });

  it("accepts data with no schema constraints (empty schema)", () => {
    const result = validate({}, { anything: "goes" }, "open");
    assert.deepStrictEqual(result, { anything: "goes" });
  });
});

describe("validateFromFile", () => {
  it("validates against a schema file", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-test-"));
    const schemaPath = path.join(tmpDir, "test.schema.json");
    fs.writeFileSync(schemaPath, JSON.stringify({
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
    }));

    const result = validateFromFile(schemaPath, { id: "abc" }, "test");
    assert.deepStrictEqual(result, { id: "abc" });

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("throws on missing schema file", () => {
    assert.throws(
      () => validateFromFile("/nonexistent/schema.json", {}, "test"),
      (err: unknown) => err instanceof Error && err.message.includes("Schema file not found"),
    );
  });

  it("throws on invalid JSON in schema file", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-test-"));
    const schemaPath = path.join(tmpDir, "bad.schema.json");
    fs.writeFileSync(schemaPath, "not json{{{");

    assert.throws(
      () => validateFromFile(schemaPath, {}, "test"),
      (err: unknown) => err instanceof Error && err.message.includes("Invalid JSON"),
    );

    fs.rmSync(tmpDir, { recursive: true });
  });
});
