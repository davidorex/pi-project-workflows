import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { ops } from "@davidorex/pi-context/ops";
import {
	authDecision,
	deriveHelp,
	fieldType,
	injectWriter,
	isProcessOnlyOp,
	parseOpArgs,
	resolveIdentity,
	resolveOp,
	UsageError,
	useOps,
} from "./cli.js";

// ── Auto-track proof ─────────────────────────────────────────────────────────
// The surfaced command set must equal exactly ops.filter(surface==="use"), and
// list-tools (now surface:"process") must be absent. A hardcoded command list
// would make this fail the moment ops diverges — that is the point.
test("surfaced command set is reflected from ops (surface === use)", () => {
	const expected = ops.filter((o) => o.surface === "use").map((o) => o.name);
	const actual = useOps.map((o) => o.name);
	assert.deepEqual(actual, expected);
});

test("list-tools is NOT surfaced via the CLI (surface === process)", () => {
	assert.equal(
		useOps.some((o) => o.name === "list-tools"),
		false,
	);
	assert.ok(ops.some((o) => o.name === "list-tools"));
	assert.equal(isProcessOnlyOp("list-tools"), true);
	assert.equal(resolveOp("list-tools"), undefined);
});

test("every surfaced op is a real surface:use op", () => {
	for (const op of useOps) {
		assert.equal(op.surface, "use");
	}
});

// ── fieldType derivation ─────────────────────────────────────────────────────
test("fieldType maps typebox schema shapes to CLI types", () => {
	assert.equal(fieldType({ type: "string" }), "string");
	assert.equal(fieldType({ type: "number" }), "number");
	assert.equal(fieldType({ type: "integer" }), "number");
	assert.equal(fieldType({ type: "boolean" }), "boolean");
	assert.equal(fieldType({ type: "object" }), "json");
	assert.equal(fieldType({ type: "array" }), "json");
	assert.equal(fieldType({}), "json"); // Type.Unknown — no type key
});

test("fieldType maps a string-enum union (Type.Union of string literals) to string, not json", () => {
	assert.equal(
		fieldType({
			anyOf: [
				{ type: "string", const: "eq" },
				{ type: "string", const: "neq" },
			],
		}),
		"string",
	);
});

// ── Flag parsing: scalar coercion ────────────────────────────────────────────
test("parseOpArgs coerces number, boolean, string scalars", () => {
	// read-block-page: block(string) offset(integer) limit(integer)
	const op = resolveOp("read-block-page");
	assert.ok(op);
	const parsed = parseOpArgs(op, ["--block", "tasks", "--offset", "10", "--limit", "5"]);
	assert.equal(parsed.params.block, "tasks");
	assert.equal(parsed.params.offset, 10);
	assert.equal(parsed.params.limit, 5);
});

test("parseOpArgs treats boolean field as a presence flag and accepts explicit true/false", () => {
	// append-block-item: autoId is boolean
	const op = resolveOp("append-block-item");
	assert.ok(op);
	const presence = parseOpArgs(op, ["--block", "b", "--arrayKey", "k", "--item", "{}", "--autoId"]);
	assert.equal(presence.params.autoId, true);
	const explicit = parseOpArgs(op, ["--block", "b", "--arrayKey", "k", "--item", "{}", "--autoId", "false"]);
	assert.equal(explicit.params.autoId, false);
});

test("parseOpArgs rejects a non-numeric value for a number field", () => {
	const op = resolveOp("read-block-page");
	assert.ok(op);
	assert.throws(() => parseOpArgs(op, ["--block", "tasks", "--offset", "notanum"]), UsageError);
});

test("parseOpArgs accepts a valid string-enum value verbatim (no JSON quoting)", () => {
	// filter-block-items: op is Type.Union of "eq"|"neq"|"in"|"matches"
	const op = resolveOp("filter-block-items");
	assert.ok(op);
	const parsed = parseOpArgs(op, ["--block", "b", "--field", "f", "--op", "eq", "--value", '"x"']);
	assert.equal(parsed.params.op, "eq");
});

test("parseOpArgs rejects an out-of-set string-enum value naming the allowed values", () => {
	const op = resolveOp("filter-block-items");
	assert.ok(op);
	assert.throws(
		() => parseOpArgs(op, ["--block", "b", "--field", "f", "--op", "bogus", "--value", '"x"']),
		(err: unknown) => err instanceof UsageError && /expects one of/.test(err.message),
	);
});

// ── Flag parsing: JSON inline + @file ────────────────────────────────────────
test("parseOpArgs parses inline JSON for object/unknown fields", () => {
	// append-block-item: item is Type.Unknown → json
	const op = resolveOp("append-block-item");
	assert.ok(op);
	const parsed = parseOpArgs(op, ["--block", "b", "--arrayKey", "k", "--item", '{"id":"X-1","title":"t"}']);
	assert.deepEqual(parsed.params.item, { id: "X-1", title: "t" });
});

test("parseOpArgs reads @file JSON for object/unknown fields", () => {
	const dir = mkdtempSync(path.join(tmpdir(), "picli-"));
	const file = path.join(dir, "item.json");
	writeFileSync(file, JSON.stringify({ id: "X-2" }));
	const op = resolveOp("append-block-item");
	assert.ok(op);
	const parsed = parseOpArgs(op, ["--block", "b", "--arrayKey", "k", "--item", `@${file}`]);
	assert.deepEqual(parsed.params.item, { id: "X-2" });
});

test("parseOpArgs wraps a JSON parse error with the field name", () => {
	const op = resolveOp("append-block-item");
	assert.ok(op);
	assert.throws(
		() => parseOpArgs(op, ["--block", "b", "--arrayKey", "k", "--item", "{not json"]),
		(err: unknown) => err instanceof UsageError && err.message.startsWith("--item:"),
	);
});

// ── Unknown flag + missing required ──────────────────────────────────────────
test("parseOpArgs rejects an unknown flag", () => {
	const op = resolveOp("read-block");
	assert.ok(op);
	assert.throws(
		() => parseOpArgs(op, ["--block", "tasks", "--bogus", "x"]),
		(err: unknown) => err instanceof UsageError && err.message.includes("unknown flag: --bogus"),
	);
});

test("parseOpArgs rejects when a required field is missing", () => {
	const op = resolveOp("read-block"); // required: block
	assert.ok(op);
	assert.throws(
		() => parseOpArgs(op, []),
		(err: unknown) => err instanceof UsageError && err.message.includes("--block"),
	);
});

test("parseOpArgs does not require writer (it is auto-injected)", () => {
	// write-schema-migration requires writer in its schema; parse must NOT flag it.
	const op = resolveOp("write-schema-migration");
	assert.ok(op);
	const parsed = parseOpArgs(op, [
		"--operation",
		"create",
		"--schemaName",
		"tasks",
		"--fromVersion",
		"1.0.0",
		"--toVersion",
		"1.1.0",
		"--kind",
		"identity",
	]);
	assert.equal("writer" in parsed.params, false);
});

// ── Writer injection ─────────────────────────────────────────────────────────
test("injectWriter fills a writer-declaring op from resolved identity", () => {
	const op = resolveOp("write-schema-migration");
	assert.ok(op);
	const params: Record<string, unknown> = {};
	injectWriter(op, params, "alice@example.com");
	assert.deepEqual(params.writer, { kind: "human", user: "alice@example.com" });
});

test("injectWriter falls back to 'operator' when identity is null", () => {
	const op = resolveOp("write-schema-migration");
	assert.ok(op);
	const params: Record<string, unknown> = {};
	injectWriter(op, params, null);
	assert.deepEqual(params.writer, { kind: "human", user: "operator" });
});

test("injectWriter does not add writer to a non-writer op", () => {
	const op = resolveOp("read-block");
	assert.ok(op);
	const params: Record<string, unknown> = { block: "tasks" };
	injectWriter(op, params, "alice@example.com");
	assert.equal("writer" in params, false);
});

test("injectWriter preserves an explicit writer", () => {
	const op = resolveOp("write-schema-migration");
	assert.ok(op);
	const params: Record<string, unknown> = { writer: { kind: "human", user: "explicit@x.com" } };
	injectWriter(op, params, "resolved@x.com");
	assert.deepEqual(params.writer, { kind: "human", user: "explicit@x.com" });
});

// ── Identity cascade ─────────────────────────────────────────────────────────
test("resolveIdentity prefers git email, then env USER, then null", () => {
	assert.equal(resolveIdentity({ gitEmail: () => "git@x.com", envUser: "bob" }), "git@x.com");
	assert.equal(resolveIdentity({ gitEmail: () => null, envUser: "bob" }), "bob");
	assert.equal(resolveIdentity({ gitEmail: () => "", envUser: "bob" }), "bob");
	assert.equal(resolveIdentity({ gitEmail: () => null, envUser: undefined }), null);
	assert.equal(resolveIdentity({ gitEmail: () => null, envUser: "" }), null);
});

// ── Auth gate decision ───────────────────────────────────────────────────────
test("authDecision allows a non-gated op unconditionally", () => {
	const op = resolveOp("read-block");
	assert.ok(op);
	assert.deepEqual(authDecision(op, { yes: false, interactive: false }), { allow: true });
});

test("authDecision refuses a gated op non-interactively without --yes", () => {
	const op = resolveOp("write-block"); // authGated
	assert.ok(op);
	const d = authDecision(op, { yes: false, interactive: false });
	assert.equal(d.allow, false);
	if (d.allow === false) {
		assert.equal(d.needsPrompt, false);
		assert.ok(d.reason.includes("--yes"));
	}
});

test("authDecision allows a gated op with --yes", () => {
	const op = resolveOp("write-block");
	assert.ok(op);
	assert.deepEqual(authDecision(op, { yes: true, interactive: false }), { allow: true });
});

test("authDecision defers to a prompt for a gated op on an interactive TTY", () => {
	const op = resolveOp("write-block");
	assert.ok(op);
	const d = authDecision(op, { yes: false, interactive: true });
	assert.equal(d.allow, false);
	if (d.allow === false) assert.equal(d.needsPrompt, true);
});

// ── --cwd resolution ─────────────────────────────────────────────────────────
test("parseOpArgs defaults --cwd to the provided base and resolves relative paths", () => {
	const op = resolveOp("read-block");
	assert.ok(op);
	const dflt = parseOpArgs(op, ["--block", "tasks"], "/base/dir");
	assert.equal(dflt.cwd, "/base/dir");
	const rel = parseOpArgs(op, ["--block", "tasks", "--cwd", "sub/here"], "/base/dir");
	assert.equal(rel.cwd, path.resolve("/base/dir", "sub/here"));
	const abs = parseOpArgs(op, ["--block", "tasks", "--cwd", "/abs/path"], "/base/dir");
	assert.equal(abs.cwd, "/abs/path");
});

// ── Help derivation ──────────────────────────────────────────────────────────
test("deriveHelp lists each field with its correct TYPE tag", () => {
	const op = resolveOp("read-block-page");
	assert.ok(op);
	const help = deriveHelp(op);
	assert.ok(help.includes("--block <string>"));
	assert.ok(help.includes("--offset <number>"));
	assert.ok(help.includes("--limit <number>"));
	assert.ok(help.includes("(required)"));
	assert.ok(help.includes("(optional)"));
});

test("deriveHelp tags an unknown/object field as json", () => {
	const op = resolveOp("append-block-item");
	assert.ok(op);
	const help = deriveHelp(op);
	assert.ok(help.includes("--item <json>"));
});

test("deriveHelp renders a string-enum field's choices as the TYPE tag", () => {
	const op = resolveOp("filter-block-items");
	assert.ok(op);
	const help = deriveHelp(op);
	assert.ok(help.includes("--op <eq|neq|in|matches>"));
});
