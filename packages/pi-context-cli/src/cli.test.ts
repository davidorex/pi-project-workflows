import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { installContext } from "@davidorex/pi-context";
import { writeBootstrapPointer } from "@davidorex/pi-context/context-dir";
import { boundedJsonOutput, type OpResult, ops, renderOpResultText } from "@davidorex/pi-context/ops";
import { structureForRead } from "@davidorex/pi-context/read-element";
import {
	authDecision,
	buildCliDispatchContext,
	deriveHelp,
	fieldType,
	injectWriter,
	isProcessOnlyOp,
	main,
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

// ── update op (FEAT-006 T1 / TASK-034) reflection ─────────────────────────────
test("resolveOp('update') resolves the reflected update op", () => {
	const op = resolveOp("update");
	assert.ok(op, "the update op must be surfaced via the CLI (surface === use)");
	assert.equal(op.name, "update");
	assert.equal(op.surface, "use");
});

test("parseOpArgs parses the update op's dryRun as a boolean presence flag", () => {
	// The dryRun param is reflected as the camelCase flag `--dryRun` (the CLI's
	// presence-flag convention uses the schema property name verbatim, like
	// `--autoId` above). Presence → true; no value token required.
	const op = resolveOp("update");
	assert.ok(op);
	const parsed = parseOpArgs(op, ["--dryRun"]);
	assert.equal(parsed.params.dryRun, true);
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

// ── DispatchContext threading (TASK-006) ─────────────────────────────────────
// buildCliDispatchContext: explicit --writer passes through verbatim; otherwise
// a human writer is built from the resolved identity (falling back to operator).
test("buildCliDispatchContext falls back to human/operator when no identity + no --writer", () => {
	const dctx = buildCliDispatchContext(undefined, null);
	assert.deepEqual(dctx, { writer: { kind: "human", user: "operator" } });
});

test("buildCliDispatchContext builds a human writer from the resolved identity", () => {
	const dctx = buildCliDispatchContext(undefined, "me@example.com");
	assert.deepEqual(dctx, { writer: { kind: "human", user: "me@example.com" } });
});

test("buildCliDispatchContext passes an explicit --writer object through as the WriterIdentity", () => {
	const dctx = buildCliDispatchContext({ kind: "human", user: "explicit@x" }, "ignored@x");
	assert.deepEqual(dctx, { writer: { kind: "human", user: "explicit@x" } });
});

test("buildCliDispatchContext passes an explicit agent --writer through", () => {
	const dctx = buildCliDispatchContext({ kind: "agent", agent_id: "a" }, "ignored@x");
	assert.deepEqual(dctx, { writer: { kind: "agent", agent_id: "a" } });
});

test("buildCliDispatchContext throws UsageError on a human --writer missing user", () => {
	assert.throws(
		() => buildCliDispatchContext({ kind: "human" }, "ignored@x"),
		(err: unknown) => err instanceof UsageError && /'user'/.test(err.message),
	);
});

test("buildCliDispatchContext throws UsageError on an agent --writer missing agent_id", () => {
	assert.throws(
		() => buildCliDispatchContext({ kind: "agent" }, "ignored@x"),
		(err: unknown) => err instanceof UsageError && /'agent_id'/.test(err.message),
	);
});

test("buildCliDispatchContext throws UsageError on a --writer with an unknown kind", () => {
	assert.throws(
		() => buildCliDispatchContext({ kind: "robot", user: "x" }, "ignored@x"),
		(err: unknown) => err instanceof UsageError && /valid WriterIdentity/.test(err.message),
	);
});

test("buildCliDispatchContext throws UsageError on a non-object --writer", () => {
	assert.throws(
		() => buildCliDispatchContext("nope", "ignored@x"),
		(err: unknown) => err instanceof UsageError && /valid WriterIdentity/.test(err.message),
	);
});

// HEADLINE: an append-block-item CLI write against an attested-required schema,
// with an item that omits created_by/created_at, must SUCCEED (AJV would reject
// it unstamped) and the stored item must carry created_by = the resolved
// identity, threaded through op.run's 3rd DispatchContext arg.
test("append-block-item CLI write stamps created_by on an attested-required schema", async () => {
	const cwd = mkdtempSync(path.join(tmpdir(), "picli-attest-"));
	try {
		writeBootstrapPointer(cwd, ".project");
		const schemasDir = path.join(cwd, ".project", "schemas");
		mkdirSync(schemasDir, { recursive: true });
		// Item shape REQUIRES created_by + created_at — an unstamped item fails AJV.
		const schema = {
			type: "object",
			required: ["gaps"],
			properties: {
				gaps: {
					type: "array",
					items: {
						type: "object",
						required: ["id", "description", "created_by", "created_at"],
						additionalProperties: false,
						properties: {
							id: { type: "string" },
							description: { type: "string" },
							created_by: { type: "string" },
							created_at: { type: "string" },
						},
					},
				},
			},
		};
		writeFileSync(path.join(schemasDir, "gaps.schema.json"), JSON.stringify(schema, null, 2));
		writeFileSync(path.join(cwd, ".project", "gaps.json"), JSON.stringify({ gaps: [] }, null, 2));

		const op = resolveOp("append-block-item");
		assert.ok(op);
		const parsed = parseOpArgs(
			op,
			["--block", "gaps", "--arrayKey", "gaps", "--item", '{"id":"FGAP-001","description":"x"}'],
			cwd,
		);
		// No --writer → identity-derived human writer (pinned for determinism).
		const dctx = buildCliDispatchContext(parsed.explicitWriter, "operator@cli");

		// append-block-item is a prose op — run() returns a plain string OpResult.
		const r = await op.run(parsed.cwd, parsed.params, dctx);
		assert.equal(typeof r, "string");
		assert.ok((r as string).includes("Appended"));

		const onDisk = JSON.parse(readFileSync(path.join(cwd, ".project", "gaps.json"), "utf8"));
		assert.equal(onDisk.gaps.length, 1);
		assert.equal(onDisk.gaps[0].id, "FGAP-001");
		assert.equal(onDisk.gaps[0].created_by, "human/operator@cli");
		assert.ok(typeof onDisk.gaps[0].created_at === "string" && onDisk.gaps[0].created_at.length > 0);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

// ── FGAP-013 contract: --json `output` is a JSON value, never a stringified
// JSON string ─────────────────────────────────────────────────────────────────
// The regression guard FGAP-013 lacked: run a read op, a JSON.stringify (data)
// op, and a prose op through the CLI `--json` path and assert the envelope's
// `output` field is the right SHAPE — a parsed JSON value for data/read ops
// (single-parse: `output` is already an object/array, not a string needing a
// second JSON.parse), and a plain string for a prose op.

/** Capture everything main() writes to stdout while it runs. */
async function captureMainStdout(argv: string[]): Promise<{ code: number; out: string }> {
	const orig = process.stdout.write;
	let out = "";
	const capture = (chunk: unknown): boolean => {
		out += typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString("utf8");
		return true;
	};
	process.stdout.write = capture as typeof process.stdout.write;
	try {
		const code = await main(argv);
		return { code, out };
	} finally {
		process.stdout.write = orig;
	}
}

/** Seed a substrate with a `tasks` block (schema + one item TASK-1, block_kinds prefix). */
function seedTasksSubstrate(): string {
	const cwd = mkdtempSync(path.join(tmpdir(), "picli-json-"));
	writeBootstrapPointer(cwd, ".project");
	const sub = path.join(cwd, ".project");
	mkdirSync(path.join(sub, "schemas"), { recursive: true });
	writeFileSync(
		path.join(sub, "config.json"),
		JSON.stringify({
			schema_version: "1.0.0",
			root: ".project",
			// A schema-valid block_kinds entry: config.schema.json requires
			// canonical_id/display_name/prefix/schema_path/array_key/data_path and
			// forbids extras (additionalProperties:false). An invalid entry makes
			// loadConfig throw inside buildIdIndex — which resolve-item-by-id walks —
			// so the prior shorthand silently failed that op (the FGAP-013 case below).
			block_kinds: [
				{
					canonical_id: "tasks",
					display_name: "Tasks",
					prefix: "TASK-",
					schema_path: "schemas/tasks.schema.json",
					array_key: "tasks",
					data_path: "tasks.json",
				},
			],
		}),
	);
	const schema = {
		type: "object",
		properties: {
			tasks: {
				type: "array",
				items: {
					type: "object",
					required: ["id"],
					properties: { id: { type: "string" }, title: { type: "string" } },
				},
			},
		},
	};
	writeFileSync(path.join(sub, "schemas", "tasks.schema.json"), JSON.stringify(schema, null, 2));
	writeFileSync(path.join(sub, "tasks.json"), JSON.stringify({ tasks: [{ id: "TASK-1", title: "alpha" }] }));
	return cwd;
}

/**
 * Seed a substrate whose `tasks` block holds a single OVER-CAP item — its `title`
 * is ≫50KB so the whole-block serialization exceeds the 50KB read cap, driving the
 * `read-block` REFUSAL path (read-block passes an overCapDirective). Mirrors the
 * schema-valid config of {@link seedTasksSubstrate}; only the item is huge.
 */
function seedOverCapTasksSubstrate(): string {
	const cwd = mkdtempSync(path.join(tmpdir(), "picli-overcap-"));
	writeBootstrapPointer(cwd, ".project");
	const sub = path.join(cwd, ".project");
	mkdirSync(path.join(sub, "schemas"), { recursive: true });
	writeFileSync(
		path.join(sub, "config.json"),
		JSON.stringify({
			schema_version: "1.0.0",
			root: ".project",
			block_kinds: [
				{
					canonical_id: "tasks",
					display_name: "Tasks",
					prefix: "TASK-",
					schema_path: "schemas/tasks.schema.json",
					array_key: "tasks",
					data_path: "tasks.json",
				},
			],
		}),
	);
	const schema = {
		type: "object",
		properties: {
			tasks: {
				type: "array",
				items: {
					type: "object",
					required: ["id"],
					properties: { id: { type: "string" }, title: { type: "string" } },
				},
			},
		},
	};
	writeFileSync(path.join(sub, "schemas", "tasks.schema.json"), JSON.stringify(schema, null, 2));
	// A 120000-char title pushes the whole-block JSON well past the 50KB cap.
	writeFileSync(path.join(sub, "tasks.json"), JSON.stringify({ tasks: [{ id: "TASK-1", title: "x".repeat(120000) }] }));
	return cwd;
}

// ── FGAP cap-bypass guard: over-cap read under `--json` MUST fail closed ───────
// read-block computes the cap metadata then bounds `data` to null on over-cap.
// Pre-fix, `data` carried the FULL un-truncated value into the envelope — leaking
// unbounded data past the 50KB cap under `--json` and defeating the REFUSAL the
// text path enforces. The envelope must report data:null + truncated + incomplete.
test("CLI --json: an OVER-CAP read op fails closed — output.data null, truncated, incomplete", async () => {
	const cwd = seedOverCapTasksSubstrate();
	try {
		const { code, out } = await captureMainStdout(["read-block", "--block", "tasks", "--json", "--cwd", cwd]);
		assert.equal(code, 0);
		const envelope = JSON.parse(out) as { ok: boolean; op: string; output: unknown };
		assert.equal(envelope.ok, true);
		assert.equal(envelope.op, "read-block");
		const ro = envelope.output as { data?: unknown; truncated?: boolean; complete?: boolean; totalBytes?: number };
		// THE load-bearing assertion: no unbounded value leaked under --json.
		assert.equal(ro.data, null, "over-cap read bounds data to null (no unbounded leak under --json)");
		assert.equal(ro.truncated, true, "metadata flags the over-cap truncation");
		assert.equal(ro.complete, false, "over-cap read is not complete");
		// The full payload (the 120000-char title) must NOT appear anywhere in the envelope.
		assert.equal(out.includes("x".repeat(1000)), false, "no serialized payload leaked into the envelope");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("CLI --json: a READ op emits `output` as a structured JSON value (single-parse, not double-encoded)", async () => {
	const cwd = seedTasksSubstrate();
	try {
		const { code, out } = await captureMainStdout([
			"read-block-item",
			"--block",
			"tasks",
			"--id",
			"TASK-1",
			"--json",
			"--cwd",
			cwd,
		]);
		assert.equal(code, 0);
		const envelope = JSON.parse(out) as { ok: boolean; op: string; output: unknown };
		assert.equal(envelope.ok, true);
		assert.equal(envelope.op, "read-block-item");
		// THE load-bearing assertion: `output` is already a structured value — NOT a
		// string that would need a second JSON.parse (the FGAP-013 double-encode).
		assert.equal(typeof envelope.output, "object");
		assert.notEqual(envelope.output, null);
		// A read op's output is a ReadStructured carrying the un-stringified `data`.
		const ro = envelope.output as { data?: { id?: string }; truncated?: boolean };
		assert.equal(ro.data?.id, "TASK-1");
		assert.equal(ro.truncated, false);
		// The render-context symbol must NOT leak into the JSON surface.
		assert.equal(JSON.stringify(envelope.output).includes("render-context"), false);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("CLI --json: resolve-item-by-id emits a structured {read} value (single-parse; ItemLocation under data)", async () => {
	// TASK-013 / FGAP-015: resolve-item-by-id now routes through {read}, so its
	// `--json` output is a ReadStructured carrying the un-stringified ItemLocation
	// under `data` (single-parse, no nested JSON string), bounded at the read cap.
	const cwd = seedTasksSubstrate();
	try {
		const { code, out } = await captureMainStdout(["resolve-item-by-id", "--id", "TASK-1", "--json", "--cwd", cwd]);
		assert.equal(code, 0);
		const envelope = JSON.parse(out) as { ok: boolean; op: string; output: unknown };
		assert.equal(envelope.ok, true);
		assert.equal(typeof envelope.output, "object");
		assert.notEqual(envelope.output, null);
		const ro = envelope.output as {
			data?: { block?: string; item?: { id?: string } };
			truncated?: boolean;
			complete?: boolean;
		};
		assert.equal(ro.truncated, false);
		assert.equal(ro.complete, true);
		assert.equal(ro.data?.block, "tasks");
		assert.equal(ro.data?.item?.id, "TASK-1");
		// The render-context symbol must NOT leak into the JSON surface.
		assert.equal(JSON.stringify(envelope.output).includes("render-context"), false);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("CLI --json: a PROSE op emits `output` as a string", async () => {
	const cwd = seedTasksSubstrate();
	try {
		const { code, out } = await captureMainStdout([
			"append-block-item",
			"--block",
			"tasks",
			"--arrayKey",
			"tasks",
			"--item",
			'{"id":"TASK-2","title":"beta"}',
			"--json",
			"--cwd",
			cwd,
		]);
		assert.equal(code, 0);
		const envelope = JSON.parse(out) as { ok: boolean; op: string; output: unknown };
		assert.equal(envelope.ok, true);
		// A prose op's human message stays a string under --json.
		assert.equal(typeof envelope.output, "string");
		assert.ok((envelope.output as string).includes("Appended"));
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

// ── TASK-013 / FGAP-015: output-boundary cap unit tests ───────────────────────
// boundedJsonOutput (the CLI `--json` value) and renderOpResultText (the default
// CLI text surface + the in-pi Pi-tool surface) now enforce the 50KB read cap for
// EVERY OpResult channel. {read} passes through (already fail-closed at
// structureForRead); prose `string` and `{json}` fail closed past the cap. These
// exercise the helpers directly so the bound is asserted independent of any op.

// A `{json}` value whose serialization is well past 50KB.
function overCapJson(): OpResult {
	return { json: { blob: "x".repeat(120000) } };
}

test("boundedJsonOutput: under-cap {json} → the raw value (pass-through)", () => {
	const r: OpResult = { json: { id: "TASK-1", title: "alpha" } };
	const out = boundedJsonOutput(r);
	assert.deepEqual(out, { id: "TASK-1", title: "alpha" });
});

test("boundedJsonOutput: over-cap {json} → fail-closed envelope (data null, no payload)", () => {
	const out = boundedJsonOutput(overCapJson()) as {
		data?: unknown;
		truncated?: boolean;
		complete?: boolean;
		totalBytes?: number;
	};
	assert.equal(out.data, null, "no unbounded value past the cap");
	assert.equal(out.truncated, true);
	assert.equal(out.complete, false);
	assert.ok((out.totalBytes ?? 0) > 50 * 1024, "totalBytes reflects the un-capped size");
	// The huge payload must NOT appear anywhere in the serialized envelope.
	assert.equal(JSON.stringify(out).includes("x".repeat(1000)), false, "no serialized payload leaked");
});

test("boundedJsonOutput: under-cap prose → itself; over-cap prose → REFUSAL string", () => {
	assert.equal(boundedJsonOutput("hello"), "hello");
	const big = "y".repeat(60000);
	const out = boundedJsonOutput(big) as string;
	assert.equal(typeof out, "string");
	assert.ok(out.includes("OUTPUT REFUSED"), "over-cap prose fails closed with the REFUSAL string");
	assert.equal(out.includes("y".repeat(1000)), false, "no prose payload leaked");
});

test("boundedJsonOutput: {read} passes through unchanged (already fail-closed; never double-handled)", () => {
	const read = structureForRead({ id: "TASK-1", title: "alpha" }, { whole: true, label: "x" });
	const out = boundedJsonOutput({ read });
	assert.equal(out, read, "the ReadStructured is returned as-is");
});

test("renderOpResultText: under-cap {json} → JSON.stringify; over-cap {json} → REFUSAL (no payload)", () => {
	const under = renderOpResultText({ json: { id: "TASK-1" } });
	assert.equal(under, JSON.stringify({ id: "TASK-1" }, null, 2));
	const over = renderOpResultText(overCapJson());
	assert.ok(over.includes("OUTPUT REFUSED"));
	assert.equal(over.includes("x".repeat(1000)), false, "no serialized payload leaked into text");
});

test("renderOpResultText: under-cap prose → itself; over-cap prose → REFUSAL", () => {
	assert.equal(renderOpResultText("hi"), "hi");
	const over = renderOpResultText("z".repeat(60000));
	assert.ok(over.includes("OUTPUT REFUSED"));
	assert.equal(over.includes("z".repeat(1000)), false);
});

// ── TASK-037 (reopened) / FGAP-068: the `update` post-op SURFACES conflicts ────
// The CLI no longer spawns a subordinate resolver/mergetool. On the default text
// surface, an `update` that surfaces irreconcilable 3-way-merge conflicts prints
// the `renderConflicts` report (including its reconcile-then-`resolve-conflict`
// guidance line) below the op's own output, and spawns NOTHING — the calling
// agent reconciles each conflict and commits via the `resolve-conflict` op.

const TASKS_ITEM_PROPS = ["properties", "tasks", "items", "properties"] as const;
function deepGetItemProps(obj: Record<string, unknown>): Record<string, unknown> {
	let cur: Record<string, unknown> = obj;
	for (const seg of TASKS_ITEM_PROPS) cur = cur[seg] as Record<string, unknown>;
	return cur;
}

// Build a both-diverged `tasks` substrate so `update` genuinely surfaces a
// per-path conflict: BASE notes.type="number" (re-baselined), OURS="boolean",
// catalog THEIRS="string" → all three differ at notes.type. Mirrors the
// conflict-resolver-helpers fixture construction.
function makeBothDivergedTasksSubstrate(): string {
	const dir = mkdtempSync(path.join(tmpdir(), "picli-update-conflict-"));
	writeBootstrapPointer(dir, ".project");
	mkdirSync(path.join(dir, ".project", "schemas"), { recursive: true });
	writeFileSync(
		path.join(dir, ".project", "config.json"),
		JSON.stringify(
			{
				schema_version: "1.0.0",
				root: ".project",
				block_kinds: [],
				lenses: [],
				installed_schemas: ["tasks"],
				installed_blocks: [],
			},
			null,
			2,
		),
	);
	const dest = path.join(dir, ".project", "schemas", "tasks.schema.json");
	installContext(dir);
	const baseObj = JSON.parse(readFileSync(dest, "utf-8")) as Record<string, unknown>;
	(deepGetItemProps(baseObj).notes as Record<string, unknown>).type = "number";
	writeFileSync(dest, JSON.stringify(baseObj, null, 2));
	installContext(dir); // re-baseline FROM the edited body → BASE ≠ catalog (THEIRS)
	const oursObj = JSON.parse(readFileSync(dest, "utf-8")) as Record<string, unknown>;
	(deepGetItemProps(oursObj).notes as Record<string, unknown>).type = "boolean";
	writeFileSync(dest, JSON.stringify(oursObj, null, 2));
	return dir;
}

test("CLI update (text surface): an irreconcilable conflict is SURFACED via renderConflicts + guidance, no spawn", async () => {
	const cwd = makeBothDivergedTasksSubstrate();
	// No-spawn is a STRUCTURAL guarantee here: the subordinate-resolver module is
	// deleted and the update path is pure `renderConflicts` (the only `runPiBound`
	// caller is the separate `pi-bound` command). A regression that re-introduces a
	// dispatch is caught by the grep in the rework's adversarial probe.
	try {
		const { code, out } = await captureMainStdout(["update", "--cwd", cwd]);
		assert.equal(code, 0, "the update op exits 0");
		// The op's own JSON output (the UpdateResult) prints first; the conflict
		// report renders below it on the text surface.
		assert.match(out, /Schema merge conflicts/, "the conflict report header is surfaced");
		assert.match(out, /tasks \(1 conflict\)/, "the conflicting schema + count is named");
		assert.match(
			out,
			/properties\.tasks\.items\.properties\.notes\.type/,
			"the conflicting path is listed in the report",
		);
		// The trailing guidance line tells the calling agent how to apply a fix.
		assert.match(
			out,
			/To resolve each: reconcile the conflicting paths/,
			"the report carries the reconcile guidance line",
		);
		assert.match(
			out,
			/resolve-conflict --schemaName <name> --schema <reconciled>/,
			"the guidance names the resolve-conflict apply path",
		);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});
