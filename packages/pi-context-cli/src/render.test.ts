import assert from "node:assert/strict";
import { test } from "node:test";
import { ValidationError } from "@davidorex/pi-context/schema-validator";
import type { ErrorObject } from "ajv";
import { formatAjvError, renderTable } from "./render.js";

// ── renderTable ──────────────────────────────────────────────────────────────

test("renderTable renders an array of objects as a markdown table with id first", () => {
	const out = renderTable([
		{ id: "T-1", title: "alpha", status: "open" },
		{ id: "T-2", title: "beta", status: "done" },
	]);
	const lines = out.split("\n");
	// Header puts id first, then the next keys (≤4 columns total).
	assert.equal(lines[0], "| id | title | status |");
	assert.equal(lines[1], "| --- | --- | --- |");
	assert.equal(lines[2], "| T-1 | alpha | open |");
	assert.equal(lines[3], "| T-2 | beta | done |");
});

test("renderTable caps columns at 4 (id + 3 others)", () => {
	const out = renderTable([{ id: "x", a: 1, b: 2, c: 3, d: 4, e: 5 }]);
	const header = out.split("\n")[0];
	// id + a + b + c = 4 columns; d/e dropped.
	assert.equal(header, "| id | a | b | c |");
});

test("renderTable takes the first 4 keys when there is no id", () => {
	const out = renderTable([{ a: 1, b: 2, c: 3, d: 4, e: 5 }]);
	assert.equal(out.split("\n")[0], "| a | b | c | d |");
});

test("renderTable JSON.stringifies a non-string (object) cell", () => {
	const out = renderTable([{ id: "x", meta: { k: "v" } }]);
	// The object cell is serialized, not "[object Object]".
	assert.match(out, /\{"k":"v"\}/);
});

test("renderTable collapses internal newlines and truncates at 77 + ...", () => {
	const long = `line1\n${"y".repeat(100)}`;
	const out = renderTable([{ id: "x", note: long }]);
	const cell = out.split("\n")[2];
	// Newline collapsed to a space, then capped: 77 chars + "..." (no raw newline in the cell).
	assert.match(out, /\.\.\. \|/);
	// The collapsed-then-truncated value is exactly 80 chars (77 + "..."). The row is
	// `| <id> | <note> |`; strip the leading/trailing pipe-pad and split on the inner
	// delimiter to isolate the note cell.
	const noteVal = cell.replace(/^\| /, "").replace(/ \|$/, "").split(" | ")[1];
	assert.equal(noteVal.length, 80);
	assert.ok(noteVal.endsWith("..."));
	assert.equal(noteVal.includes("\n"), false);
});

test("renderTable returns (no rows) for an empty array", () => {
	assert.equal(renderTable([]), "(no rows)");
});

test("renderTable returns (no rows) for a non-array input", () => {
	assert.equal(renderTable({ not: "an array" }), "(no rows)");
	assert.equal(renderTable("scalar"), "(no rows)");
});

// ── formatAjvError ───────────────────────────────────────────────────────────

test("formatAjvError names a missing required field, not the raw AJV message", () => {
	const err = new ValidationError("tasks", [
		{
			instancePath: "/gaps/0",
			keyword: "required",
			params: { missingProperty: "package" },
			message: "must have required property 'package'",
			schemaPath: "#/properties/gaps/items/required",
		} as ErrorObject,
	]);
	const out = formatAjvError(err);
	// The actionable field name appears…
	assert.match(out, /package/);
	// …and the raw AJV phrasing does NOT leak through.
	assert.equal(out.includes("must have required property"), false);
	// Prefixed with the schema label.
	assert.match(out, /^validation failed for tasks:/);
	// The instancePath is preserved.
	assert.match(out, /\/gaps\/0/);
});

test("formatAjvError shapes a type error with the expected type + instancePath", () => {
	const err = new ValidationError("tasks", [
		{
			instancePath: "/title",
			keyword: "type",
			params: { type: "string" },
			message: "must be string",
			schemaPath: "#/properties/title/type",
		} as ErrorObject,
	]);
	const out = formatAjvError(err);
	assert.match(out, /\/title/);
	assert.match(out, /expected string/);
});

test("formatAjvError shapes an enum error naming the allowed values", () => {
	const err = new ValidationError("tasks", [
		{
			instancePath: "/status",
			keyword: "enum",
			params: { allowedValues: ["open", "done"] },
			message: "must be equal to one of the allowed values",
			schemaPath: "#/properties/status/enum",
		} as ErrorObject,
	]);
	const out = formatAjvError(err);
	assert.match(out, /\/status/);
	assert.match(out, /must be one of open, done/);
});

test("formatAjvError shapes additionalProperties naming the unexpected key", () => {
	const err = new ValidationError("tasks", [
		{
			instancePath: "",
			keyword: "additionalProperties",
			params: { additionalProperty: "bogus" },
			message: "must NOT have additional properties",
			schemaPath: "#/additionalProperties",
		} as ErrorObject,
	]);
	const out = formatAjvError(err);
	assert.match(out, /unexpected property `bogus`/);
	// Empty instancePath renders as the root "/".
	assert.match(out, /`\/`: unexpected/);
});

test("formatAjvError never drops the error count — one segment per error", () => {
	const err = new ValidationError("tasks", [
		{
			instancePath: "/a",
			keyword: "required",
			params: { missingProperty: "x" },
			message: "must have required property 'x'",
			schemaPath: "#",
		} as ErrorObject,
		{
			instancePath: "/b",
			keyword: "type",
			params: { type: "number" },
			message: "must be number",
			schemaPath: "#",
		} as ErrorObject,
	]);
	const out = formatAjvError(err);
	// Two errors → two "; "-joined segments.
	assert.equal(out.split("; ").length, 2);
	assert.match(out, /\/a/);
	assert.match(out, /\/b/);
});
