import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { installContext, readCatalogSchemaText } from "@davidorex/pi-context";
import { writeBootstrapPointer } from "@davidorex/pi-context/context-dir";
import { boundedJsonOutput, type OpResult, ops, renderOpResultText } from "@davidorex/pi-context/ops";
import { structureForRead } from "@davidorex/pi-context/read-element";
import {
	AUTO_SUPPLIED,
	authDecision,
	buildCliDispatchContext,
	buildHelpModel,
	deriveHelp,
	deriveTopHelp,
	fieldType,
	groupForOp,
	helpOneLiner,
	injectArrayKey,
	injectWriter,
	isProcessOnlyOp,
	main,
	PKG_VERSION,
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

// ── update op reflection (brings an installed substrate current with the catalog
// without clobbering locally-modified schemas) ────────────────────────────────
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

test("--block is an unknown flag on the validators whose issues carry no block field", () => {
	// context-validate-relations / context-roadmap-validate declare the blockless
	// narrowing set (severity/code + offset/limit); relation/roadmap issues never
	// carry a `block` field, so `--block` there is a parse-time parameter error,
	// never a silently-empty filter. context-validate keeps the axis.
	for (const name of ["context-validate-relations", "context-roadmap-validate"]) {
		const op = resolveOp(name);
		assert.ok(op, `op '${name}' must be surfaced via the CLI`);
		assert.throws(
			() => parseOpArgs(op, ["--block", "tasks"]),
			(err: unknown) => err instanceof UsageError && /unknown flag: --block/.test((err as Error).message),
			`'${name} --block' must be rejected as an unknown flag`,
		);
		const narrowed = parseOpArgs(op, ["--severity", "error", "--offset", "0", "--limit", "5"]);
		assert.deepEqual(narrowed.params, { severity: "error", offset: 0, limit: 5 });
	}
	const validate = resolveOp("context-validate");
	assert.ok(validate);
	assert.equal(parseOpArgs(validate, ["--block", "tasks"]).params.block, "tasks");
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

// resolve-blocked (re-validates and completes a previously-blocked schema update)
// is authGated. The pure decision refuses it
// non-interactively without --yes with the authorization-refusal message, and main
// returns non-zero (the refusal is written to stderr + exits 1).
test("authDecision refuses resolve-blocked non-interactively without --yes", () => {
	const op = resolveOp("resolve-blocked");
	assert.ok(op, "resolve-blocked must be a registered op");
	const d = authDecision(op, { yes: false, interactive: false });
	assert.equal(d.allow, false);
	if (d.allow === false) {
		assert.equal(d.needsPrompt, false);
		assert.match(d.reason, /resolve-blocked requires authorization; re-run with --yes/);
	}
});

test("main refuses resolve-blocked without --yes non-interactively (non-zero exit, refusal on stderr)", async () => {
	const origErr = process.stderr.write;
	let err = "";
	process.stderr.write = ((chunk: unknown): boolean => {
		err += typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString("utf8");
		return true;
	}) as typeof process.stderr.write;
	try {
		const { code } = await captureMainStdout(["resolve-blocked", "--schemaName", "tasks"]);
		assert.notEqual(code, 0, "a refused gated op must exit non-zero");
		assert.match(err, /resolve-blocked requires authorization; re-run with --yes/);
	} finally {
		process.stderr.write = origErr;
	}
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

// ── best-of-breed per-op help template ────────────────────────────────────────
test("deriveHelp renders SYNOPSIS, EXAMPLES, RELATED and the footer", () => {
	const op = resolveOp("append-block-item");
	assert.ok(op);
	const help = deriveHelp(op);
	assert.ok(help.includes("SYNOPSIS"));
	assert.ok(help.includes("pi-context append-block-item"));
	assert.ok(help.includes("EXAMPLES"));
	// The authored example substring must surface verbatim.
	assert.ok(help.includes("--block framework-gaps --arrayKey gaps --autoId true"));
	assert.ok(help.includes("RELATED"));
	assert.ok(help.includes("update-block-item"));
	assert.ok(help.includes("for machine-readable help."));
});

test("deriveHelp synopsis brackets arrayKey as optional (auto-derived); block/item required", () => {
	const op = resolveOp("append-block-item");
	assert.ok(op);
	const help = deriveHelp(op);
	const synopsisLine = help.split("\n").find((l) => l.includes("pi-context append-block-item"));
	assert.ok(synopsisLine);
	// arrayKey is schema-required but auto-derived → bracketed-optional,
	// never a bare required token.
	assert.ok(synopsisLine.includes("[--arrayKey"));
	assert.ok(!/(?<!\[)--arrayKey </.test(synopsisLine));
	// A genuinely-required field stays unbracketed.
	assert.ok(synopsisLine.includes("--block <string>"));
	assert.ok(!synopsisLine.includes("[--block"));
});

// ── auto-supplied Flags-line annotation (reconciling the Flags block's
// schema-required truth with the bracketed-optional synopsis) ───────────────
// A CLI-auto-supplied param (arrayKey/writer) is schema-required, so the Flags
// block shows (required) — reconciled with the bracketed-optional synopsis by
// appending the provenance phrase. Non-auto-supplied required params keep a plain
// (required) with NO marker.
test("deriveHelp annotates the arrayKey Flags line auto-derived; block stays a plain (required)", () => {
	const op = resolveOp("append-block-item");
	assert.ok(op);
	const help = deriveHelp(op);
	// Flags-block lines are indented `  --<name> <type>  (...)`; the SYNOPSIS line
	// also names the flags, so select the indented Flags-block line by its tag.
	const arrayKeyLine = help.split("\n").find((l) => l.startsWith("  --arrayKey <"));
	assert.ok(arrayKeyLine);
	assert.ok(arrayKeyLine.includes("auto-derived from --block"));
	assert.ok(arrayKeyLine.includes("(required; auto-derived from --block)"));
	// A non-exempt required field carries no provenance marker.
	const blockLine = help.split("\n").find((l) => l.startsWith("  --block <"));
	assert.ok(blockLine);
	assert.ok(blockLine.includes("(required)"));
	assert.ok(!blockLine.includes("auto-derived"));
	assert.ok(!blockLine.includes("auto-injected"));
});

test("deriveHelp annotates the writer Flags line auto-injected on promote-item", () => {
	const op = resolveOp("promote-item");
	assert.ok(op);
	const help = deriveHelp(op);
	const writerLine = help.split("\n").find((l) => l.startsWith("  --writer <"));
	assert.ok(writerLine);
	assert.ok(writerLine.includes("auto-injected"));
	assert.ok(writerLine.includes("(required; auto-injected)"));
});

// ── auto-supplied provenance carried through into the structured help model ──
test("buildHelpModel carries autoSupplied on arrayKey (schema-required) and omits it on block", () => {
	const op = resolveOp("append-block-item");
	assert.ok(op);
	const model = buildHelpModel(op);
	const arrayKeyFlag = model.flags.find((f) => f.name === "arrayKey");
	assert.ok(arrayKeyFlag);
	assert.equal(arrayKeyFlag.autoSupplied, "auto-derived from --block");
	assert.equal(arrayKeyFlag.required, true);
	const blockFlag = model.flags.find((f) => f.name === "block");
	assert.ok(blockFlag);
	assert.equal(blockFlag.autoSupplied, undefined);
});

test("buildHelpModel carries autoSupplied on writer for promote-item", () => {
	const op = resolveOp("promote-item");
	assert.ok(op);
	const model = buildHelpModel(op);
	const writerFlag = model.flags.find((f) => f.name === "writer");
	assert.ok(writerFlag);
	assert.equal(writerFlag.autoSupplied, "auto-injected");
});

test("per-op --help --format json carries autoSupplied on arrayKey, not on block", async () => {
	const { code, out } = await captureMainStdout(["append-block-item", "--help", "--format", "json"]);
	assert.equal(code, 0);
	const m = JSON.parse(out);
	const arrayKeyFlag = m.flags.find((f: { name: string }) => f.name === "arrayKey");
	assert.ok(arrayKeyFlag);
	assert.equal(arrayKeyFlag.autoSupplied, "auto-derived from --block");
	const blockFlag = m.flags.find((f: { name: string }) => f.name === "block");
	assert.ok(blockFlag);
	assert.equal(blockFlag.autoSupplied, undefined);
});

// ── examples-coverage guard ───────────────────────────────────────────────────
// Every surfaced op MUST carry ≥1 authored example. A future use-op added without
// examples FAILS here — the guard against a synthetic/empty floor.
test("every use-op carries at least one authored example", () => {
	for (const op of useOps) {
		assert.ok(
			Array.isArray(op.examples) && op.examples.length > 0,
			`use-op '${op.name}' has no examples — author a pi-context invocation`,
		);
	}
});

// ── buildHelpModel pure unit ──────────────────────────────────────────────────
test("buildHelpModel treats arrayKey as non-synopsis-required and derives related from the help group", () => {
	const op = resolveOp("append-block-item");
	assert.ok(op);
	const model = buildHelpModel(op);
	assert.equal(model.name, "append-block-item");
	assert.ok(model.synopsis.startsWith("pi-context append-block-item"));
	// arrayKey: schema-required but auto-derived → bracketed-optional in the synopsis.
	assert.ok(model.synopsis.includes("[--arrayKey"));
	assert.ok(!/(?<!\[)--arrayKey </.test(model.synopsis));
	// block IS synopsis-required (unbracketed, leads the synopsis).
	assert.ok(/pi-context append-block-item --block <string>/.test(model.synopsis));
	// related == sorted same-group siblings, self excluded.
	const expectedRelated = useOps
		.filter((o) => o.name !== "append-block-item" && groupForOp(o.name) === groupForOp("append-block-item"))
		.map((o) => o.name)
		.sort();
	assert.deepEqual(model.related, expectedRelated);
	assert.ok(model.related.includes("update-block-item"));
	assert.ok(!model.related.includes("append-block-item"));
});

// ── writer-exemption applies where the op genuinely declares writer ──────────
// promote-item declares a `writer` property in its op schema (ops-registry.ts),
// so the auto-inject exemption (`&& f !== "writer"`) must render it
// bracketed-optional rather than as a bare required token.
test("buildHelpModel brackets writer as optional on promote-item (which declares writer)", () => {
	const op = resolveOp("promote-item");
	assert.ok(op);
	const m = buildHelpModel(op);
	assert.ok(m.synopsis.includes("[--writer"));
});

// ── machine-readable help (--help --format json) ──────────────────────────────
test("per-op --help --format json emits the HelpModel", async () => {
	const { code, out } = await captureMainStdout(["append-block-item", "--help", "--format", "json"]);
	assert.equal(code, 0);
	const m = JSON.parse(out);
	assert.equal(m.name, "append-block-item");
	assert.ok(typeof m.synopsis === "string" && m.synopsis.startsWith("pi-context append-block-item"));
	const blockFlag = m.flags.find((f: { name: string }) => f.name === "block");
	assert.deepEqual(blockFlag, { name: "block", type: "string", required: true, description: blockFlag.description });
	assert.equal(blockFlag.type, "string");
	assert.equal(blockFlag.required, true);
	assert.ok(Array.isArray(m.examples) && m.examples.length >= 1);
	assert.ok(Array.isArray(m.related) && m.related.includes("update-block-item"));
});

test("per-op --help text round-trip exits 0 with SYNOPSIS/EXAMPLES/RELATED", async () => {
	const { code, out } = await captureMainStdout(["append-block-item", "--help"]);
	assert.equal(code, 0);
	assert.ok(out.includes("SYNOPSIS"));
	assert.ok(out.includes("EXAMPLES"));
	assert.ok(out.includes("RELATED"));
});

// ── DispatchContext threading (writer/identity recorded on every write) ──────
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

// ── contract: --json `output` is a JSON value, never a stringified
// JSON string ─────────────────────────────────────────────────────────────────
// The regression this guards against (the CLI used to double-encode `output`,
// forcing callers to JSON.parse it twice): run a read op, a JSON.stringify (data)
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
			schema_version: "1.8.0",
			root: ".project",
			// A schema-valid block_kinds entry: config.schema.json requires
			// canonical_id/display_name/prefix/schema_path/array_key/data_path and
			// forbids extras (additionalProperties:false). An invalid entry makes
			// loadConfig throw inside buildIdIndex — which resolve-item-by-id walks —
			// so the prior shorthand silently failed that op (the double-encode case below).
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
			schema_version: "1.8.0",
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
		// string that would need a second JSON.parse (the double-encode this guards against).
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

// context-check-status is a {json} data op — its
// `--json` envelope must carry the CheckStatusReport (perAsset + summary) as a real
// structured value (single-parse), so a caller can read the drift report + the
// per-asset version gap without a second JSON.parse.
test("CLI --json: context-check-status emits the drift report (perAsset + summary) as a structured value", async () => {
	const cwd = seedTasksSubstrate(); // no installed_schemas → an empty, well-formed report
	try {
		const { code, out } = await captureMainStdout(["context-check-status", "--json", "--cwd", cwd]);
		assert.equal(code, 0);
		const envelope = JSON.parse(out) as { ok: boolean; op: string; output: unknown };
		assert.equal(envelope.ok, true);
		assert.equal(envelope.op, "context-check-status");
		// THE load-bearing assertion: `output` is the already-structured CheckStatusReport.
		assert.equal(typeof envelope.output, "object");
		assert.notEqual(envelope.output, null);
		const report = envelope.output as {
			perAsset?: Array<{ name: string; state: string; behind?: boolean; version_delta?: unknown }>;
			summary?: { total?: number };
		};
		assert.ok(Array.isArray(report.perAsset), "the report carries a perAsset array");
		assert.equal(typeof report.summary?.total, "number", "the report carries a summary.total count");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

// An operator needs to fetch the catalog schema body and diff it locally
// against an installed schema, without digging through node_modules — so
// read-catalog-schema is a raw-string op: its `--json` envelope carries the
// VERBATIM catalog schema text as a string (the raw JSON Schema bytes, not
// the read-samples-catalog projection), so a caller can capture the body and
// diff it locally. Package-intrinsic: no substrate.
test("CLI --json: read-catalog-schema carries the verbatim catalog schema text as a string (raw JSON Schema)", async () => {
	const { code, out } = await captureMainStdout(["read-catalog-schema", "--kind", "tasks", "--json"]);
	assert.equal(code, 0);
	const envelope = JSON.parse(out) as { ok: boolean; op: string; output: unknown };
	assert.equal(envelope.ok, true);
	assert.equal(envelope.op, "read-catalog-schema");
	// THE load-bearing assertion: `output` is the raw schema TEXT — a string, not
	// a re-serialized object (the bytes the operator diffs ride through verbatim).
	assert.equal(typeof envelope.output, "string");
	// Parsing that string yields the raw JSON Schema (properties + $id), proving
	// it is the verbatim catalog body and not the projection.
	const parsed = JSON.parse(envelope.output as string) as Record<string, unknown>;
	assert.ok(parsed.properties && typeof parsed.properties === "object", "raw schema carries top-level properties");
	assert.equal(typeof parsed.$id, "string", "raw schema carries a top-level $id");
});

// For the same local-diffing need, on the TEXT surface read-catalog-schema is
// declared `verbatimText`, so the CLI emits the raw catalog schema bytes byte-exact
// — it reproduces the file's own bytes (its single trailing `\n` included) and does
// NOT append a second newline. The catalog *.schema.json files DO end with a trailing
// `\n` (last bytes `}\n`) and installed schemas are copied from them verbatim, so the
// text output must be byte-identical to the library fn's verbatim text (which reads the
// same bundled bytes). The defect this guards was the CLI APPENDING a second newline
// (doubling it to `}\n\n`), which `read-catalog-schema --kind <k> | diff <installed> -`
// surfaces as a phantom trailing-empty-line even when content matches.
test("CLI text: read-catalog-schema emits the verbatim catalog schema bytes byte-exact (no appended trailing newline)", async () => {
	const { code, out } = await captureMainStdout(["read-catalog-schema", "--kind", "tasks"]);
	assert.equal(code, 0);
	// Oracle: the byte-verbatim library fn over the SAME bundled catalog file.
	const verbatim = readCatalogSchemaText("tasks").text;
	assert.equal(out, verbatim, "text-surface output is byte-identical to the verbatim catalog body");
	// Guard the specific defect: the CLI must NOT append an extra newline beyond the
	// file's own bytes (the file already ends with a single `\n`; doubling it to `}\n\n`
	// is the phantom-line defect).
	assert.notEqual(
		out,
		`${verbatim}\n`,
		"no APPENDED trailing newline — the CLI must not double the catalog file's own trailing \\n",
	);
});

// Scoped-regression: the verbatimText flag must NOT globalize. A normal string-
// returning op WITHOUT verbatimText (read-samples-catalog, the projection sibling,
// also package-intrinsic / no substrate) still gets its trailing newline appended on
// the text surface, proving the no-newline path is gated on the declared flag alone.
test("CLI text: a non-verbatimText string op still gets its appended trailing newline (fix is scoped, not global)", async () => {
	const samplesOp = ops.find((o) => o.name === "read-samples-catalog");
	assert.ok(samplesOp, "read-samples-catalog op present in the registry");
	assert.notEqual(samplesOp?.verbatimText, true, "read-samples-catalog is NOT declared verbatimText");
	const { code, out } = await captureMainStdout(["read-samples-catalog", "--kind", "tasks"]);
	assert.equal(code, 0);
	assert.equal(out.endsWith("\n"), true, "non-verbatim op keeps the appended trailing newline");
});

test("CLI --json: resolve-item-by-id emits a structured {read} value (single-parse; ItemLocation under data)", async () => {
	// resolve-item-by-id now routes through {read}, so its
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

// ── output-boundary cap unit tests ────────────────────────────────────────────
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

// ── the `update` post-op SURFACES conflicts rather than resolving them itself ─
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
				schema_version: "1.8.0",
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

// ── blocked-resync diagnostic surface (per-item validation failures reported,
// not discarded at an unbound catch) ─────────────────────────────────────────
// Build a catalog-ahead `tasks` substrate at the older 1.0.0 version with a
// populated block whose item fails the catalog 1.0.1 schema (a bad `status`
// enum) → the 1.0.0 → 1.0.1 identity migration passes it through unchanged, the
// re-validation FAILS → resyncSchema refuses → blocked with a validation-failed
// diagnostic naming the failing item id / field / constraint.
function makeBlockedTasksSubstrate(): string {
	const dir = mkdtempSync(path.join(tmpdir(), "picli-update-blocked-"));
	writeBootstrapPointer(dir, ".project");
	mkdirSync(path.join(dir, ".project", "schemas"), { recursive: true });
	writeFileSync(
		path.join(dir, ".project", "config.json"),
		JSON.stringify(
			{
				schema_version: "1.8.0",
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
	// Override the installed schema's version to the older 1.0.0 + re-baseline FROM
	// it → checkStatus classifies tasks catalog-ahead (catalog ships 1.0.1).
	const schema = JSON.parse(readFileSync(dest, "utf-8")) as Record<string, unknown>;
	schema.version = "1.0.0";
	writeFileSync(dest, JSON.stringify(schema, null, 2));
	installContext(dir);
	// Seed a substrate_id so the live identity-stamping path can mint oids (a
	// missing id otherwise makes the live populated-block migrate throw inside
	// resyncSchema's try and refuse — which would mask the validation-failed reason).
	const cfgPath = path.join(dir, ".project", "config.json");
	const cfg = JSON.parse(readFileSync(cfgPath, "utf-8")) as Record<string, unknown>;
	cfg.substrate_id = "sub-0123456789abcdef";
	writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
	writeFileSync(
		path.join(dir, ".project", "tasks.json"),
		JSON.stringify(
			{ schema_version: "1.0.0", tasks: [{ id: "TASK-001", description: "x", status: "not-a-valid-status" }] },
			null,
			2,
		),
	);
	return dir;
}

test("CLI update (text surface): a blocked resync surfaces the per-item validation diagnostic", async () => {
	const cwd = makeBlockedTasksSubstrate();
	try {
		const { code, out } = await captureMainStdout(["update", "--cwd", cwd]);
		assert.equal(code, 0, "the update op exits 0");
		assert.match(out, /Schema resync blocked/, "the blocked report header is surfaced");
		assert.match(out, /blocked: tasks \(1\.0\.0 -> 1\.1\.0\)/, "the schema + version pair is named");
		assert.match(out, /TASK-001/, "the failing item id is named in the per-item line");
		assert.match(out, /status/, "the failing field is named");
		assert.match(out, /markers were written INTO the block file/i, "the marker resolution guidance is surfaced");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("CLI validate-block-items --json: the per-item failure list is parseable", async () => {
	const cwd = makeBlockedTasksSubstrate();
	try {
		const { code, out } = await captureMainStdout(["validate-block-items", "--block", "tasks", "--json", "--cwd", cwd]);
		assert.equal(code, 0, "a read-only diagnostic exits 0 even when items are invalid");
		const env = JSON.parse(out);
		assert.equal(env.ok, true);
		assert.equal(env.op, "validate-block-items");
		assert.equal(env.output.block, "tasks");
		assert.equal(env.output.valid, false, "the bad-item block is reported invalid");
		assert.ok(Array.isArray(env.output.failures) && env.output.failures.length >= 1, "failures are listed");
		const f = env.output.failures.find((x: { instancePath: string }) => x.instancePath === "/tasks/0/status");
		assert.ok(f, "the failing status field is reported");
		assert.equal(f.itemId, "TASK-001", "the failing item id is resolved");
		assert.equal(
			env.output.resolution,
			"catalog-forward-preview",
			"the parameterless default discloses the catalog-forward-preview resolution",
		);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("CLI validate-block-items --basis installed: the basis threads through and the resolution is disclosed", async () => {
	const cwd = makeBlockedTasksSubstrate();
	try {
		const { code, out } = await captureMainStdout([
			"validate-block-items",
			"--block",
			"tasks",
			"--basis",
			"installed",
			"--json",
			"--cwd",
			cwd,
		]);
		assert.equal(code, 0, "a read-only diagnostic exits 0 even when items are invalid");
		const env = JSON.parse(out);
		assert.equal(env.ok, true);
		assert.equal(env.op, "validate-block-items");
		assert.equal(env.output.resolution, "installed-read-path", "the installed basis discloses its resolution");
		// The fixture's installed schema is at 1.0.0 with a matching envelope, so
		// the installed basis validates against the INSTALLED schema directly and
		// the bad status enum fails per-item — like the catalog path does.
		assert.equal(env.output.valid, false, "the bad-item block is invalid against the installed schema");
		const f = env.output.failures.find((x: { instancePath: string }) => x.instancePath === "/tasks/0/status");
		assert.ok(f, "the failing status field is reported per-item under basis=installed");
		assert.equal(f.itemId, "TASK-001", "the failing item id is resolved");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("CLI validate-block-items: an unknown block exits non-zero", async () => {
	const cwd = makeBlockedTasksSubstrate();
	try {
		const { code } = await captureMainStdout(["validate-block-items", "--block", "not-a-real-block", "--cwd", cwd]);
		assert.notEqual(code, 0, "an unknown block is a non-zero exit");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

// ── CLI pre-call input layer (one pass of input-ergonomics fixes, part of the
// umbrella script-parity effort) ──────────────────────────────────────────────
// Four additive affordances entirely in cli.ts's pre-call path — the in-pi op
// schemas + handlers stay byte-unchanged (the ops still receive + require their
// declared params; the CLI normalizes/supplies them). Every currently-working
// flag form keeps working.

// ── kebab-case flag normalization ─────────────────────────────────────────────
test("parseOpArgs resolves a kebab `--dry-run` to the camelCase `dryRun` key", () => {
	const op = resolveOp("update");
	assert.ok(op);
	const parsed = parseOpArgs(op, ["--dry-run"]);
	assert.equal(parsed.params.dryRun, true);
	// The existing camelCase form keeps working (additive).
	const camel = parseOpArgs(op, ["--dryRun"]);
	assert.equal(camel.params.dryRun, true);
});

test("parseOpArgs still rejects an unknown kebab flag with unknown-flag", () => {
	const op = resolveOp("update");
	assert.ok(op);
	assert.throws(
		() => parseOpArgs(op, ["--no-such-flag"]),
		(err: unknown) => err instanceof UsageError && err.message.includes("unknown flag: --no-such-flag"),
	);
});

// ── `--id` aliases the op's single declared id-param ──────────────────────────
test("parseOpArgs resolves `--id` to the op's single id-param", () => {
	// find-references + walk-ancestors each declare exactly one id-param: itemId.
	const fr = resolveOp("find-references");
	assert.ok(fr);
	assert.equal(parseOpArgs(fr, ["--id", "TASK-1"]).params.itemId, "TASK-1");
	assert.equal("id" in parseOpArgs(fr, ["--id", "TASK-1"]).params, false);
	const wa = resolveOp("walk-ancestors");
	assert.ok(wa);
	assert.equal(parseOpArgs(wa, ["--id", "TASK-1", "--relationType", "r"]).params.itemId, "TASK-1");
});

test("parseOpArgs rejects `--id` as ambiguous when the op declares ≥2 id-params", () => {
	// complete-task declares taskId + verificationId; rename-canonical-id declares oldId + newId.
	const ct = resolveOp("complete-task");
	assert.ok(ct);
	assert.throws(
		() => parseOpArgs(ct, ["--id", "X"]),
		(err: unknown) => err instanceof UsageError && /ambiguous/.test(err.message),
	);
	const rc = resolveOp("rename-canonical-id");
	assert.ok(rc);
	assert.throws(
		() => parseOpArgs(rc, ["--id", "X"]),
		(err: unknown) => err instanceof UsageError && /ambiguous/.test(err.message),
	);
});

test("parseOpArgs leaves `--id` as unknown-flag when the op declares 0 id-params", () => {
	// append-relation uses parent/child, not *Id — 0 id-params, so --id stays unknown.
	const ar = resolveOp("append-relation");
	assert.ok(ar);
	assert.throws(
		() => parseOpArgs(ar, ["--id", "X"]),
		(err: unknown) => err instanceof UsageError && err.message.includes("unknown flag: --id"),
	);
});

test("parseOpArgs does NOT bind `--id` to a boolean *Id flag like autoId (the string-type guard)", () => {
	// append-block-item's only `/Id$/` property is `autoId` — a Type.Boolean allocation
	// flag, NOT a string identity selector. The string-type guard means it is not counted
	// as an id-param, so `--id` finds 0 id-params and falls through to unknown-flag rather
	// than silently swallowing the value into autoId.
	const op = resolveOp("append-block-item");
	assert.ok(op);
	assert.throws(
		() => parseOpArgs(op, ["--block", "b", "--arrayKey", "k", "--item", "{}", "--id", "TASK-1"]),
		(err: unknown) => err instanceof UsageError && err.message.includes("unknown flag: --id"),
	);
	// The boolean presence flag itself is unaffected: `--autoId` (presence) and
	// `--autoId true` both still resolve to the boolean param.
	assert.equal(parseOpArgs(op, ["--block", "b", "--arrayKey", "k", "--item", "{}", "--autoId"]).params.autoId, true);
	assert.equal(
		parseOpArgs(op, ["--block", "b", "--arrayKey", "k", "--item", "{}", "--autoId", "true"]).params.autoId,
		true,
	);
});

test("parseOpArgs still resolves `--id` for a single string id-param op (read-config)", () => {
	// read-config declares `id` as Type.Optional(Type.String); fieldType unwraps the
	// Optional → "string", so the guard keeps it as a valid single id-param.
	const rc = resolveOp("read-config");
	assert.ok(rc);
	assert.equal(parseOpArgs(rc, ["--id", "block_kinds"]).params.id, "block_kinds");
});

// ── arrayKey derived from config; required-filter exemption ───────────────────
test("parseOpArgs accepts a block-mutation op without --arrayKey (required-filter exemption)", () => {
	// append-block-item declares arrayKey required; the CLI must NOT flag it missing
	// pre-injection (injectArrayKey supplies it after parse).
	const op = resolveOp("append-block-item");
	assert.ok(op);
	const parsed = parseOpArgs(op, ["--block", "framework-gaps", "--item", "{}"]);
	assert.equal("arrayKey" in parsed.params, false);
	assert.equal(parsed.params.block, "framework-gaps");
});

test("parseOpArgs missing-required check exempts every AUTO_SUPPLIED key (single-source coupling)", () => {
	// The :434 missing-required filter derives from AUTO_SUPPLIED, so any key in the map
	// is auto-exempted. This guard confirms the exemption holds for every key — adding a
	// key to AUTO_SUPPLIED (and its injector) cannot leave that param parser-rejected as
	// missing while the help surfaces it as auto-supplied/bracketed-optional.
	// Each AUTO_SUPPLIED key maps to a representative op that DECLARES it required; the
	// other declared-required params are supplied so only the auto-supplied key is omitted.
	const reps: Record<string, { op: string; args: string[] }> = {
		// append-block-item declares arrayKey required; omit --arrayKey, supply the rest.
		arrayKey: { op: "append-block-item", args: ["--block", "framework-gaps", "--item", "{}"] },
		// write-schema-migration declares writer required; omit --writer, supply the rest.
		writer: {
			op: "write-schema-migration",
			args: [
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
			],
		},
	};
	let coveredWriter = false;
	let coveredArrayKey = false;
	for (const key of Object.keys(AUTO_SUPPLIED)) {
		const rep = reps[key];
		// A key with no representative declaring-op binding is skipped (future-proofing);
		// writer + arrayKey MUST be covered (asserted below).
		if (!rep) continue;
		const op = resolveOp(rep.op);
		assert.ok(op, `representative op '${rep.op}' for AUTO_SUPPLIED key '${key}' must resolve`);
		// parseOpArgs must NOT throw a missing-required UsageError for the omitted key.
		const parsed = parseOpArgs(op, rep.args);
		assert.equal(key in parsed.params, false, `auto-supplied key '${key}' must not be present pre-injection`);
		if (key === "writer") coveredWriter = true;
		if (key === "arrayKey") coveredArrayKey = true;
	}
	assert.ok(coveredWriter, "AUTO_SUPPLIED must include and this test must cover 'writer'");
	assert.ok(coveredArrayKey, "AUTO_SUPPLIED must include and this test must cover 'arrayKey'");
});

test("injectArrayKey derives arrayKey from config.block_kinds (canonical_id ≠ array_key)", () => {
	// Seed a substrate whose framework-gaps block_kind has array_key 'gaps' (≠ its
	// canonical_id 'framework-gaps') so the derivation is genuinely load-bearing.
	const cwd = mkdtempSync(path.join(tmpdir(), "picli-arraykey-"));
	try {
		writeBootstrapPointer(cwd, ".project");
		const sub = path.join(cwd, ".project");
		mkdirSync(sub, { recursive: true });
		writeFileSync(
			path.join(sub, "config.json"),
			JSON.stringify({
				schema_version: "1.8.0",
				root: ".project",
				block_kinds: [
					{
						canonical_id: "framework-gaps",
						display_name: "Gaps",
						prefix: "FGAP-",
						schema_path: "schemas/gaps.schema.json",
						array_key: "gaps",
						data_path: "gaps.json",
					},
				],
			}),
		);
		const op = resolveOp("append-block-item");
		assert.ok(op);
		const parsed = parseOpArgs(op, ["--block", "framework-gaps", "--item", "{}"], cwd);
		injectArrayKey(op, parsed.params, cwd);
		assert.equal(parsed.params.arrayKey, "gaps");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("injectArrayKey preserves an explicit --arrayKey and skips a non-arrayKey op", () => {
	const cwd = seedTasksSubstrate();
	try {
		const append = resolveOp("append-block-item");
		assert.ok(append);
		// Explicit --arrayKey is preserved (override, not overwritten).
		const explicit = parseOpArgs(append, ["--block", "tasks", "--arrayKey", "custom", "--item", "{}"], cwd);
		injectArrayKey(append, explicit.params, cwd);
		assert.equal(explicit.params.arrayKey, "custom");
		// A non-arrayKey op is untouched (read-block declares no arrayKey).
		const read = resolveOp("read-block");
		assert.ok(read);
		const rparams = parseOpArgs(read, ["--block", "tasks"], cwd).params;
		injectArrayKey(read, rparams, cwd);
		assert.equal("arrayKey" in rparams, false);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("injectArrayKey leaves arrayKey unset for an unknown block or no substrate (no throw)", () => {
	const op = resolveOp("append-block-item");
	assert.ok(op);
	// No substrate at this cwd → loadConfig returns null → arrayKey stays unset.
	const noSub = mkdtempSync(path.join(tmpdir(), "picli-nosub-"));
	try {
		const params: Record<string, unknown> = { block: "tasks" };
		injectArrayKey(op, params, noSub);
		assert.equal("arrayKey" in params, false);
	} finally {
		rmSync(noSub, { recursive: true, force: true });
	}
	// A known substrate but an unknown block → no matching block_kind → unset.
	const cwd = seedTasksSubstrate();
	try {
		const params: Record<string, unknown> = { block: "not-a-block" };
		injectArrayKey(op, params, cwd);
		assert.equal("arrayKey" in params, false);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

// ── --writer kind:id, --where field:op:value, CSV --op in shorthands ─────────
test("parseOpArgs expands a `--writer human:<email>` shorthand to the canonical WriterIdentity", () => {
	const op = resolveOp("write-schema-migration");
	assert.ok(op);
	const parsed = parseOpArgs(op, [
		"--writer",
		"human:davidryan@gmail.com",
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
	assert.deepEqual(parsed.explicitWriter, { kind: "human", user: "davidryan@gmail.com" });
	// And it flows through assertWriterIdentity / buildCliDispatchContext unchanged.
	const dctx = buildCliDispatchContext(parsed.explicitWriter, "ignored@x");
	assert.deepEqual(dctx, { writer: { kind: "human", user: "davidryan@gmail.com" } });
});

test("parseOpArgs expands a `--writer agent:<id>` shorthand to {kind,agent_id}", () => {
	const op = resolveOp("write-schema-migration");
	assert.ok(op);
	const parsed = parseOpArgs(op, [
		"--writer",
		"agent:claude",
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
	assert.deepEqual(parsed.explicitWriter, { kind: "agent", agent_id: "claude" });
});

test("parseOpArgs passes a canonical JSON `--writer` through unchanged (shorthand is additive)", () => {
	const op = resolveOp("write-schema-migration");
	assert.ok(op);
	const parsed = parseOpArgs(op, [
		"--writer",
		'{"kind":"human","user":"explicit@x.com"}',
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
	assert.deepEqual(parsed.explicitWriter, { kind: "human", user: "explicit@x.com" });
});

test("parseOpArgs expands `--where field:op:value` to the op's field/op/value params", () => {
	const op = resolveOp("filter-block-items");
	assert.ok(op);
	const parsed = parseOpArgs(op, ["--block", "tasks", "--where", "status:eq:done"]);
	assert.equal(parsed.params.field, "status");
	assert.equal(parsed.params.op, "eq");
	assert.equal(parsed.params.value, "done");
});

test("parseOpArgs splits `--where` on the first two colons only — value may contain colons", () => {
	const op = resolveOp("filter-block-items");
	assert.ok(op);
	const parsed = parseOpArgs(op, ["--block", "tasks", "--where", "url:eq:https://x.com/a"]);
	assert.equal(parsed.params.field, "url");
	assert.equal(parsed.params.op, "eq");
	assert.equal(parsed.params.value, "https://x.com/a");
});

test("parseOpArgs leaves explicit --field/--op/--value unchanged (shorthand is additive)", () => {
	const op = resolveOp("filter-block-items");
	assert.ok(op);
	const parsed = parseOpArgs(op, ["--block", "b", "--field", "f", "--op", "eq", "--value", '"x"']);
	assert.equal(parsed.params.field, "f");
	assert.equal(parsed.params.op, "eq");
	assert.equal(parsed.params.value, "x");
});

test("parseOpArgs splits a CSV value into an array when --op is `in`", () => {
	const op = resolveOp("filter-block-items");
	assert.ok(op);
	const a = parseOpArgs(op, ["--block", "b", "--field", "f", "--op", "in", "--value", "a,b,c"]);
	assert.deepEqual(a.params.value, ["a", "b", "c"]);
	// Argv-order-independent: value-before-op normalizes identically.
	const b = parseOpArgs(op, ["--block", "b", "--field", "f", "--value", "a,b,c", "--op", "in"]);
	assert.deepEqual(b.params.value, ["a", "b", "c"]);
	// A non-`in` op leaves the value as the parsed scalar.
	const eq = parseOpArgs(op, ["--block", "b", "--field", "f", "--op", "eq", "--value", '"a,b,c"']);
	assert.equal(eq.params.value, "a,b,c");
});

// ── --format render dispatch (human-readable output modes, part of the CLI's
// output/error-shaping layer) ─────────────────────────────────────────────────

/** Capture everything main() writes to stderr while it runs. */
async function captureMainStderr(argv: string[]): Promise<{ code: number; err: string }> {
	const orig = process.stderr.write;
	let err = "";
	const capture = (chunk: unknown): boolean => {
		err += typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString("utf8");
		return true;
	};
	process.stderr.write = capture as typeof process.stderr.write;
	try {
		const code = await main(argv);
		return { code, err };
	} finally {
		process.stderr.write = orig;
	}
}

test("parseOpArgs parses --format and rejects an unknown value", () => {
	const op = resolveOp("read-block");
	assert.ok(op);
	assert.equal(parseOpArgs(op, ["--block", "tasks", "--format", "table"]).format, "table");
	assert.equal(parseOpArgs(op, ["--block", "tasks", "--format", "json"]).format, "json");
	assert.equal(parseOpArgs(op, ["--block", "tasks", "--format", "text"]).format, "text");
	assert.throws(
		() => parseOpArgs(op, ["--block", "tasks", "--format", "zzz"]),
		(e: unknown) => e instanceof UsageError && /one of: text, json, table/.test((e as Error).message),
	);
});

test("CLI --format zzz exits 2 (UsageError surfaced by main)", async () => {
	const cwd = seedTasksSubstrate();
	try {
		const { code, err } = await captureMainStderr(["read-block", "--block", "tasks", "--format", "zzz", "--cwd", cwd]);
		assert.equal(code, 2);
		assert.match(err, /one of: text, json, table/);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("CLI --format table on an array {read} result renders a markdown table", async () => {
	const cwd = seedTasksSubstrate();
	try {
		const { code, out } = await captureMainStdout([
			"read-block",
			"--block",
			"tasks",
			"--format",
			"table",
			"--cwd",
			cwd,
		]);
		assert.equal(code, 0);
		// read-block returns a {read} whose data is the tasks array → a markdown table.
		const lines = out.trim().split("\n");
		assert.match(lines[0], /^\| id \|/);
		assert.match(lines[1], /^\| --- \|/);
		assert.match(out, /TASK-1/);
		assert.match(out, /alpha/);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("CLI --format table on a PROSE result falls back to text (no degenerate table)", async () => {
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
			"--format",
			"table",
			"--cwd",
			cwd,
		]);
		assert.equal(code, 0);
		// A prose op has no renderable array → the human prose, not a "| ... |" table.
		assert.ok(out.includes("Appended"));
		assert.equal(out.includes("| --- |"), false);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("CLI --format table on an OVER-CAP read falls back to text (over-cap is not tabular)", async () => {
	const cwd = seedOverCapTasksSubstrate();
	try {
		const { code, out } = await captureMainStdout([
			"read-block",
			"--block",
			"tasks",
			"--format",
			"table",
			"--cwd",
			cwd,
		]);
		assert.equal(code, 0);
		// complete:false → tabularRows returns null → text (the REFUSAL), never a table.
		assert.equal(out.includes("| --- |"), false);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("CLI --json and --format json produce identical envelopes (compose regression)", async () => {
	const cwdA = seedTasksSubstrate();
	const cwdB = seedTasksSubstrate();
	try {
		const a = await captureMainStdout(["read-block", "--block", "tasks", "--json", "--cwd", cwdA]);
		const b = await captureMainStdout(["read-block", "--block", "tasks", "--format", "json", "--cwd", cwdB]);
		assert.equal(a.code, 0);
		assert.equal(b.code, 0);
		// The substrates are byte-identical seeds, so the envelopes must match exactly.
		assert.equal(a.out, b.out);
	} finally {
		rmSync(cwdA, { recursive: true, force: true });
		rmSync(cwdB, { recursive: true, force: true });
	}
});

// ── AJV ValidationError → field-named guidance ────────────────────────────────

test("CLI --json: a schema-invalid append surfaces a field-named validation error, not the raw AJV phrasing", async () => {
	const cwd = mkdtempSync(path.join(tmpdir(), "picli-ajv-"));
	try {
		writeBootstrapPointer(cwd, ".project");
		const sub = path.join(cwd, ".project");
		mkdirSync(path.join(sub, "schemas"), { recursive: true });
		// gaps items REQUIRE description — an item lacking it fails AJV with a `required`
		// error, which the catch must shape into field-named guidance.
		writeFileSync(
			path.join(sub, "config.json"),
			JSON.stringify({
				schema_version: "1.8.0",
				root: ".project",
				block_kinds: [
					{
						canonical_id: "framework-gaps",
						display_name: "Gaps",
						prefix: "FGAP-",
						schema_path: "schemas/framework-gaps.schema.json",
						array_key: "gaps",
						data_path: "framework-gaps.json",
					},
				],
			}),
		);
		writeFileSync(
			path.join(sub, "schemas", "framework-gaps.schema.json"),
			JSON.stringify({
				type: "object",
				properties: {
					gaps: {
						type: "array",
						items: {
							type: "object",
							required: ["id", "description"],
							properties: { id: { type: "string" }, description: { type: "string" } },
						},
					},
				},
			}),
		);
		writeFileSync(path.join(sub, "framework-gaps.json"), JSON.stringify({ gaps: [] }));

		const { code, out } = await captureMainStdout([
			"append-block-item",
			"--block",
			"framework-gaps",
			"--item",
			'{"id":"FGAP-999"}',
			"--yes",
			"--cwd",
			cwd,
			"--json",
		]);
		// A validation failure now exits 5 (was 1 before granular exit codes were added).
		assert.equal(code, 5);
		const envelope = JSON.parse(out) as { ok: boolean; op: string; error: string };
		assert.equal(envelope.ok, false);
		// THE assertion: the error names the missing field…
		assert.match(envelope.error, /description/);
		// …and the raw AJV phrasing does NOT leak through.
		assert.equal(envelope.error.includes("must have required property"), false);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

// ── addressed reads return the WHOLE subtree ───────────────────────────────────
// The whole-subtree behavior is now sourced from the op itself (the in-pi op passes
// `whole:true` on the addressed-single-node structureForRead); the CLI re-wrap
// override was retired. These tests assert the observable envelope the op produces
// on both surfaces, so they remain valid after the override removal.

test("CLI read-schema --path at an object node returns the full subtree, not a 50-item page", async () => {
	const cwd = mkdtempSync(path.join(tmpdir(), "picli-addr-"));
	try {
		writeBootstrapPointer(cwd, ".project");
		const sub = path.join(cwd, ".project");
		mkdirSync(path.join(sub, "schemas"), { recursive: true });
		writeFileSync(
			path.join(sub, "config.json"),
			JSON.stringify({ schema_version: "1.8.0", root: ".project", block_kinds: [] }),
		);
		// An object node (`properties.tasks.items`) that carries an array child (`required`)
		// PLUS a sibling object (`properties`) — paging the node would lose the siblings.
		const schema = {
			type: "object",
			properties: {
				tasks: {
					type: "array",
					items: {
						type: "object",
						required: ["id", "title", "status"],
						properties: { id: { type: "string" }, title: { type: "string" }, status: { type: "string" } },
					},
				},
			},
		};
		writeFileSync(path.join(sub, "schemas", "tasks.schema.json"), JSON.stringify(schema, null, 2));

		const { code, out } = await captureMainStdout([
			"read-schema",
			"--schemaName",
			"tasks",
			"--path",
			"properties.tasks.items",
			"--json",
			"--cwd",
			cwd,
		]);
		assert.equal(code, 0);
		const envelope = JSON.parse(out) as { ok: boolean; output: { data?: unknown; total?: number; complete?: boolean } };
		assert.equal(envelope.ok, true);
		const data = envelope.output.data as Record<string, unknown>;
		// The WHOLE subtree object — both the `required` array AND the `properties`
		// sibling — not a paged slice of one array.
		assert.equal(typeof data, "object");
		assert.deepEqual(data.required, ["id", "title", "status"]);
		assert.ok(data.properties && typeof data.properties === "object");
		// Whole-object reads carry no paging `total`.
		assert.equal(envelope.output.total, undefined);
		assert.equal(envelope.output.complete, true);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("CLI read-config --registry block_kinds --id tasks returns the whole entry", async () => {
	const cwd = seedTasksSubstrate();
	try {
		const { code, out } = await captureMainStdout([
			"read-config",
			"--registry",
			"block_kinds",
			"--id",
			"tasks",
			"--json",
			"--cwd",
			cwd,
		]);
		assert.equal(code, 0);
		const envelope = JSON.parse(out) as { ok: boolean; output: { data?: Record<string, unknown>; complete?: boolean } };
		assert.equal(envelope.ok, true);
		const data = envelope.output.data as Record<string, unknown>;
		// The whole block_kinds entry, every field present.
		assert.equal(data.canonical_id, "tasks");
		assert.equal(data.array_key, "tasks");
		assert.equal(data.data_path, "tasks.json");
		assert.equal(data.prefix, "TASK-");
		assert.equal(envelope.output.complete, true);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

// ── --show-schema contract preview ────────────────────────────────────────────

test("CLI append-block-item --show-schema previews the block contract and writes nothing", async () => {
	const cwd = seedTasksSubstrate();
	try {
		const before = JSON.parse(readFileSync(path.join(cwd, ".project", "tasks.json"), "utf8")) as {
			tasks: unknown[];
		};
		const { code, out } = await captureMainStdout([
			"append-block-item",
			"--block",
			"tasks",
			"--show-schema",
			"--cwd",
			cwd,
		]);
		assert.equal(code, 0);
		assert.match(out, /Array key:/);
		assert.match(out, /Required fields:/);
		assert.match(out, /ID pattern:/);
		// No write happened: the block is byte-for-byte the seed.
		const after = JSON.parse(readFileSync(path.join(cwd, ".project", "tasks.json"), "utf8")) as { tasks: unknown[] };
		assert.deepEqual(after.tasks, before.tasks);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("CLI --show-schema on a block whose schema is absent exits 3", async () => {
	const cwd = mkdtempSync(path.join(tmpdir(), "picli-showschema-"));
	try {
		writeBootstrapPointer(cwd, ".project");
		const sub = path.join(cwd, ".project");
		mkdirSync(path.join(sub, "schemas"), { recursive: true });
		writeFileSync(
			path.join(sub, "config.json"),
			JSON.stringify({
				schema_version: "1.8.0",
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
		// No schemas/tasks.schema.json on disk → readSchema returns null → exit 3.
		const { code, err } = await captureMainStderr([
			"append-block-item",
			"--block",
			"tasks",
			"--show-schema",
			"--cwd",
			cwd,
		]);
		assert.equal(code, 3);
		assert.match(err, /schema not found/);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

// ── append-block-item --dry-run ───────────────────────────────────────────────
// The op declares its own `dryRun` param (an exact-outcome preview riding the
// live path: stamped prospective-file validation + the full birth-relations
// gate, persistence withheld), so the CLI parses `--dryRun` / `--dry-run` into
// params like every other declared dryRun — the former client-side
// prospective-file replica in main() is gone.

test("parseOpArgs: --dryRun and --dry-run resolve to append-block-item's declared dryRun param", () => {
	const op = resolveOp("append-block-item");
	assert.ok(op);
	const camel = parseOpArgs(op, ["--block", "tasks", "--dryRun", "--arrayKey", "tasks", "--item", "{}"]);
	assert.equal(camel.params.dryRun, true);
	const kebab = parseOpArgs(op, ["--block", "tasks", "--dry-run", "--arrayKey", "tasks", "--item", "{}"]);
	assert.equal(kebab.params.dryRun, true);
	assert.equal("dry-run" in kebab.params, false);
});

test("CLI append-block-item --dry-run with a valid item previews would-append and writes nothing", async () => {
	const cwd = seedTasksSubstrate();
	try {
		const before = JSON.parse(readFileSync(path.join(cwd, ".project", "tasks.json"), "utf8")) as {
			tasks: unknown[];
		};
		const { code, out } = await captureMainStdout([
			"append-block-item",
			"--block",
			"tasks",
			"--dry-run",
			"--item",
			'{"id":"TASK-2","title":"beta"}',
			"--cwd",
			cwd,
		]);
		assert.equal(code, 0);
		assert.match(out, /would append item 'TASK-2' to tasks\.tasks/);
		const after = JSON.parse(readFileSync(path.join(cwd, ".project", "tasks.json"), "utf8")) as { tasks: unknown[] };
		assert.equal(after.tasks.length, before.tasks.length);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("CLI append-block-item --dry-run with a schema-invalid item exits 5 and writes nothing", async () => {
	// gaps items require `description`; an item lacking it fails the prospective-file validation.
	const cwd = mkdtempSync(path.join(tmpdir(), "picli-dryrun-invalid-"));
	try {
		writeBootstrapPointer(cwd, ".project");
		const sub = path.join(cwd, ".project");
		mkdirSync(path.join(sub, "schemas"), { recursive: true });
		writeFileSync(
			path.join(sub, "config.json"),
			JSON.stringify({
				schema_version: "1.8.0",
				root: ".project",
				block_kinds: [
					{
						canonical_id: "framework-gaps",
						display_name: "Gaps",
						prefix: "FGAP-",
						schema_path: "schemas/framework-gaps.schema.json",
						array_key: "gaps",
						data_path: "framework-gaps.json",
					},
				],
			}),
		);
		writeFileSync(
			path.join(sub, "schemas", "framework-gaps.schema.json"),
			JSON.stringify({
				type: "object",
				properties: {
					gaps: {
						type: "array",
						items: {
							type: "object",
							required: ["id", "description"],
							properties: { id: { type: "string" }, description: { type: "string" } },
						},
					},
				},
			}),
		);
		writeFileSync(path.join(sub, "framework-gaps.json"), JSON.stringify({ gaps: [] }));

		const { code, err } = await captureMainStderr([
			"append-block-item",
			"--block",
			"framework-gaps",
			"--dry-run",
			"--item",
			'{"id":"FGAP-999"}',
			"--cwd",
			cwd,
		]);
		assert.equal(code, 5);
		assert.match(err, /description/);
		// Nothing written: the block stays empty.
		const after = JSON.parse(readFileSync(path.join(sub, "framework-gaps.json"), "utf8")) as { gaps: unknown[] };
		assert.equal(after.gaps.length, 0);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("CLI append-block-item --dry-run --autoId names the prospective id", async () => {
	// id pattern + a populated block so nextId allocates a deterministic successor.
	const cwd = mkdtempSync(path.join(tmpdir(), "picli-dryrun-autoid-"));
	try {
		writeBootstrapPointer(cwd, ".project");
		const sub = path.join(cwd, ".project");
		mkdirSync(path.join(sub, "schemas"), { recursive: true });
		writeFileSync(
			path.join(sub, "config.json"),
			JSON.stringify({
				schema_version: "1.8.0",
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
		writeFileSync(
			path.join(sub, "schemas", "tasks.schema.json"),
			JSON.stringify({
				type: "object",
				properties: {
					tasks: {
						type: "array",
						items: {
							type: "object",
							required: ["id"],
							properties: { id: { type: "string", pattern: "^TASK-\\d{3}$" }, title: { type: "string" } },
						},
					},
				},
			}),
		);
		writeFileSync(path.join(sub, "tasks.json"), JSON.stringify({ tasks: [{ id: "TASK-001", title: "alpha" }] }));

		const { code, out } = await captureMainStdout([
			"append-block-item",
			"--block",
			"tasks",
			"--dry-run",
			"--autoId",
			"--item",
			'{"title":"beta"}',
			"--cwd",
			cwd,
		]);
		assert.equal(code, 0);
		assert.match(out, /would append item 'TASK-002' to tasks\.tasks/);
		const after = JSON.parse(readFileSync(path.join(sub, "tasks.json"), "utf8")) as { tasks: unknown[] };
		assert.equal(after.tasks.length, 1);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

// ── granular exit codes ────────────────────────────────────────────────────────

test("CLI a not-initialized op exits 1 (BootstrapNotFound)", async () => {
	const cwd = mkdtempSync(path.join(tmpdir(), "picli-noinit-"));
	try {
		// No .pi-context.json pointer at all → the op throws BootstrapNotFoundError.
		const { code } = await captureMainStderr(["read-block", "--block", "tasks", "--cwd", cwd]);
		assert.equal(code, 1);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("CLI an unknown flag is a usage error → exit 2", async () => {
	const cwd = seedTasksSubstrate();
	try {
		const { code } = await captureMainStderr(["read-block", "--block", "tasks", "--bogus", "x", "--cwd", cwd]);
		assert.equal(code, 2);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

// ── follow-up: --dryRun reaches only ops that DECLARE it ─────────────────────
// A no-dryRun MUTATION op (update-block-item, remove-block-item, …) must never
// silently swallow the flag and then run the REAL op — the token is an unknown
// flag (exit 2). Ops that DECLARE dryRun (append-block-item, upsert-block-item,
// update, relation ops) route the token to their own dryRun param.

test("parseOpArgs: --dryRun on a no-dryRun mutation op is an unknown flag (no silent swallow)", () => {
	const op = resolveOp("update-block-item");
	assert.ok(op);
	assert.throws(
		() => parseOpArgs(op, ["--block", "tasks", "--arrayKey", "tasks", "--match", "{}", "--updates", "{}", "--dryRun"]),
		(err: unknown) => err instanceof UsageError && err.message.includes("unknown flag: --dryRun"),
	);
});

test("CLI update-block-item --dryRun rejects (exit 2) and writes NOTHING — no silent write", async () => {
	const cwd = seedTasksSubstrate();
	try {
		const before = readFileSync(path.join(cwd, ".project", "tasks.json"), "utf8");
		const { code } = await captureMainStderr([
			"update-block-item",
			"--block",
			"tasks",
			"--match",
			'{"id":"TASK-1"}',
			"--updates",
			'{"title":"MUTATED"}',
			"--dryRun",
			"--cwd",
			cwd,
		]);
		assert.equal(code, 2);
		// The block is byte-for-byte unchanged: the silent write is gone.
		const after = readFileSync(path.join(cwd, ".project", "tasks.json"), "utf8");
		assert.equal(after, before);
		assert.doesNotMatch(after, /MUTATED/);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("CLI remove-block-item --dry-run rejects (exit 2) and writes NOTHING", async () => {
	const cwd = seedTasksSubstrate();
	try {
		const before = readFileSync(path.join(cwd, ".project", "tasks.json"), "utf8");
		const { code } = await captureMainStderr([
			"remove-block-item",
			"--block",
			"tasks",
			"--match",
			'{"id":"TASK-1"}',
			"--dry-run",
			"--cwd",
			cwd,
		]);
		assert.equal(code, 2);
		const after = readFileSync(path.join(cwd, ".project", "tasks.json"), "utf8");
		assert.equal(after, before);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("CLI upsert-block-item --dryRun reaches its own dryRun param (preview, exit 0, no write)", async () => {
	const cwd = seedTasksSubstrate();
	try {
		const before = readFileSync(path.join(cwd, ".project", "tasks.json"), "utf8");
		const { code, out } = await captureMainStdout([
			"upsert-block-item",
			"--block",
			"tasks",
			"--item",
			'{"id":"TASK-2","title":"beta"}',
			"--dryRun",
			"--cwd",
			cwd,
		]);
		assert.equal(code, 0);
		assert.match(out, /would upsert/);
		// Op-level dryRun: nothing written.
		const after = readFileSync(path.join(cwd, ".project", "tasks.json"), "utf8");
		assert.equal(after, before);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

// ── follow-up: schema-absent classifies to 3, not 4 ───────────────────────────
// nextId's schema-missing throw ("nextId: schema not found for block …") matched the
// id-allocation pattern first → exit 4, masking the true cause (absent schema → 3).
// The catch classifier now tests schema-not-found BEFORE id-allocation.

test("CLI autoId append against a block whose schema file is absent exits 3 (schema-absent, not 4)", async () => {
	// config declares the block_kind (so arrayKey resolves) but NO schema file on disk.
	// The autoId allocation calls nextId → throws "nextId: schema not found …" → exit 3.
	const cwd = mkdtempSync(path.join(tmpdir(), "picli-noschema-autoid-"));
	try {
		writeBootstrapPointer(cwd, ".project");
		const sub = path.join(cwd, ".project");
		mkdirSync(path.join(sub, "schemas"), { recursive: true });
		writeFileSync(
			path.join(sub, "config.json"),
			JSON.stringify({
				schema_version: "1.8.0",
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
		// Deliberately NO schemas/tasks.schema.json on disk.
		writeFileSync(path.join(sub, "tasks.json"), JSON.stringify({ tasks: [] }));

		const { code, err } = await captureMainStderr([
			"append-block-item",
			"--block",
			"tasks",
			"--arrayKey",
			"tasks",
			"--autoId",
			"--item",
			'{"title":"beta"}',
			"--cwd",
			cwd,
		]);
		assert.equal(code, 3);
		assert.match(err, /schema not found/);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

// ── Grouped top-level help (CHANGE A) ────────────────────────────────────────
// deriveTopHelp renders the seven ordered command groups + a Process modes
// section. The one-liner sources promptSnippet (not the longer description), and
// groupForOp is exhaustive + disjoint over useOps (the drift-guard).

const HELP_GROUP_LABELS = [
	"Read & query",
	"Block writes",
	"Relations",
	"Schema & config",
	"Substrate lifecycle",
	"Workflow",
] as const;

test("deriveTopHelp renders all seven group headers + Process modes", () => {
	const help = deriveTopHelp();
	for (const label of HELP_GROUP_LABELS) {
		assert.ok(help.includes(label), `missing group header: ${label}`);
	}
	assert.ok(help.includes("Process modes"), "missing Process modes section");
	assert.ok(help.includes("pi-bound"), "pi-bound not surfaced under Process modes");
	assert.ok(help.includes("--version, -v"), "missing --version flag line");
});

test("groupForOp slots representative ops into the right group", () => {
	assert.equal(groupForOp("read-block-item"), "Read & query");
	assert.equal(groupForOp("append-block-item"), "Block writes");
	assert.equal(groupForOp("append-relation"), "Relations");
	assert.equal(groupForOp("remove-relation"), "Relations");
	assert.equal(groupForOp("write-schema"), "Schema & config");
	assert.equal(groupForOp("context-init"), "Substrate lifecycle");
	assert.equal(groupForOp("context-install"), "Substrate lifecycle");
	assert.equal(groupForOp("complete-task"), "Workflow");
	assert.equal(groupForOp("context-roadmap-render"), "Workflow");
});

test("groupForOp is EXHAUSTIVE + DISJOINT over useOps (drift-guard)", () => {
	// Every surfaced op maps to exactly one group label. A useOp matching no rule
	// throws in groupForOp — this loop fails loudly rather than silently dropping it.
	const seenPerGroup = new Map<string, string[]>();
	for (const op of useOps) {
		const label = groupForOp(op.name); // throws if unmatched
		assert.ok(HELP_GROUP_LABELS.includes(label as (typeof HELP_GROUP_LABELS)[number]), `unknown label '${label}'`);
		const list = seenPerGroup.get(label) ?? [];
		list.push(op.name);
		seenPerGroup.set(label, list);
	}
	// Disjointness is structural (first-match-wins → one label per call); assert the
	// partition covers every useOp.
	const total = [...seenPerGroup.values()].reduce((s, l) => s + l.length, 0);
	assert.equal(total, useOps.length);
});

test("helpOneLiner sources promptSnippet, not the longer description", () => {
	const op = resolveOp("read-block-item");
	assert.ok(op);
	assert.ok(op.promptSnippet);
	// The row contains the promptSnippet text…
	const help = deriveTopHelp();
	assert.ok(help.includes("Read one item from a block by id"), "promptSnippet text absent from help");
	// …and NOT a trailing clause unique to the longer description.
	assert.ok(
		!help.includes("Avoids fetching a whole large block"),
		"help leaked description-only text — one-liner is not promptSnippet-sourced",
	);
	// helpOneLiner itself prefers promptSnippet.
	assert.equal(helpOneLiner(op), op.promptSnippet);
});

// ── --version / -v (CHANGE B) ────────────────────────────────────────────────
test("--version prints the package version and exits 0", async () => {
	const { code, out } = await captureMainStdout(["--version"]);
	assert.equal(code, 0);
	assert.ok(out.includes(PKG_VERSION), `output ${JSON.stringify(out)} missing version ${PKG_VERSION}`);
	assert.match(out, /\d+\.\d+\.\d+/);
});

test("-v is an alias for --version", async () => {
	const { code, out } = await captureMainStdout(["-v"]);
	assert.equal(code, 0);
	assert.ok(out.includes(PKG_VERSION));
});

test("--help round-trips deriveTopHelp through main()", async () => {
	const { code, out } = await captureMainStdout(["--help"]);
	assert.equal(code, 0);
	for (const label of HELP_GROUP_LABELS) {
		assert.ok(out.includes(label), `--help missing group header: ${label}`);
	}
	assert.ok(out.includes("pi-bound"), "--help missing pi-bound");
});

// ── context-lens-view (binned item-view) ──────────────────────────────────────
// Seed a substrate with one auto-derived lens (target=issues, binned by `package`)
// plus the issues block it projects. Mirrors seedTasksSubstrate's config shape.
function seedLensSubstrate(): { cwd: string; lensId: string; bin: string } {
	const cwd = mkdtempSync(path.join(tmpdir(), "picli-lensview-"));
	writeBootstrapPointer(cwd, ".project");
	const sub = path.join(cwd, ".project");
	mkdirSync(path.join(sub, "schemas"), { recursive: true });
	writeFileSync(
		path.join(sub, "config.json"),
		JSON.stringify({
			schema_version: "1.8.0",
			root: ".project",
			block_kinds: [],
			lenses: [
				{
					id: "by-package",
					target: "issues",
					relation_type: "package-membership",
					derived_from_field: "package",
					bins: ["pi-context", "pi-jit-agents"],
				},
			],
		}),
	);
	writeFileSync(
		path.join(sub, "issues.json"),
		JSON.stringify({
			issues: [
				{ id: "issue-001", package: "pi-context" },
				{ id: "issue-002", package: "pi-context" },
				{ id: "issue-003", package: "pi-jit-agents" },
			],
		}),
	);
	return { cwd, lensId: "by-package", bin: "pi-context" };
}

test("CLI context-lens-view --json: bin->count summary (code 0, structured {read} envelope)", async () => {
	const { cwd, lensId } = seedLensSubstrate();
	try {
		const { code, out } = await captureMainStdout(["context-lens-view", "--lensId", lensId, "--cwd", cwd, "--json"]);
		assert.equal(code, 0);
		const envelope = JSON.parse(out) as { ok: boolean; op: string; output: unknown };
		assert.equal(envelope.ok, true);
		assert.equal(envelope.op, "context-lens-view");
		const ro = envelope.output as {
			data?: { lens?: string; bins?: Record<string, number>; uncategorized?: number; total?: number };
			complete?: boolean;
		};
		assert.equal(ro.complete, true);
		assert.equal(ro.data?.lens, "by-package");
		assert.equal(ro.data?.bins?.["pi-context"], 2);
		assert.equal(ro.data?.bins?.["pi-jit-agents"], 1);
		assert.equal(ro.data?.total, 3);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("CLI context-lens-view --bin --limit: per-bin page (code 0, paged items under {read})", async () => {
	const { cwd, lensId, bin } = seedLensSubstrate();
	try {
		const { code, out } = await captureMainStdout([
			"context-lens-view",
			"--lensId",
			lensId,
			"--bin",
			bin,
			"--limit",
			"1",
			"--cwd",
			cwd,
			"--json",
		]);
		assert.equal(code, 0);
		const envelope = JSON.parse(out) as { ok: boolean; output: unknown };
		const ro = envelope.output as { data?: { items?: unknown[]; total?: number; hasMore?: boolean } };
		assert.equal(ro.data?.items?.length, 1);
		assert.equal(ro.data?.total, 2);
		assert.equal(ro.data?.hasMore, true);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("CLI context-lens-view --format json: summary is parseable (single-parse envelope)", async () => {
	const { cwd, lensId } = seedLensSubstrate();
	try {
		const { code, out } = await captureMainStdout([
			"context-lens-view",
			"--lensId",
			lensId,
			"--cwd",
			cwd,
			"--format",
			"json",
		]);
		assert.equal(code, 0);
		const envelope = JSON.parse(out) as { ok: boolean; output: unknown };
		assert.equal(envelope.ok, true);
		assert.equal(typeof envelope.output, "object");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("CLI context-lens-view: an unknown lensId is non-zero exit + an error line", async () => {
	const { cwd } = seedLensSubstrate();
	try {
		const { code, err } = await captureMainStderr(["context-lens-view", "--lensId", "bogus", "--cwd", cwd]);
		assert.notEqual(code, 0);
		assert.match(err, /error:/i);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});
