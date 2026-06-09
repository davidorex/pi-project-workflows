/**
 * Tests for the in-pi op ↔ reflecting-CLI parity gate's pure helpers + its
 * real-surface integration assertions (scripts/parity-check.ts).
 *
 * Two layers:
 *   1. Unit fixtures — synthetic ParsedTree / OpDefinition models exercise each
 *      coverage class (op-backed-direct, op-backed-transitive, *ForDir twin,
 *      allowlisted, internal-primitive), the UNCLASSIFIED → FAIL case, the ctx-
 *      drop → FAIL case, the {json}-content-cap gate, the required-but-derivable
 *      op↔CLI INPUT-parity gate (incl. NEGATIVE fixtures proving it BITES when an
 *      arrayKey-requiring op is not CLI-exempted), the extractStringLiterals
 *      cli.ts-exemption parser, and diffReadPayload (the pure op↔CLI OUTPUT diff).
 *   2. Integration — parse the REAL packages/pi-context/src tree (+ ops-registry.ts)
 *      and assert ZERO classification / ctx-drop / {json}-content-cap violations;
 *      assert the REAL ops + the real parsed cli.ts exemptions yield ZERO required-
 *      but-derivable violations; and run read-schema --path through BOTH the in-pi
 *      op AND the CLI's main() (cli SOURCE, in-process — not dist) on a fixture
 *      substrate, asserting ZERO output-shape divergence. The same assertions the
 *      husky/CI check makes.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { INTENTIONALLY_UNEXPOSED_WRITERS, type OpDefinition, ops } from "@davidorex/pi-context/ops";
import {
	checkCtxForwarding,
	checkJsonContentCap,
	checkOutputShapeParity,
	checkRequiredButDerivable,
	classifyAll,
	diffReadPayload,
	enumerateWriters,
	extractStringLiterals,
	type FnDef,
	flattenSchemaProperties,
	type OpRun,
	opDeclaresParam,
	type ParsedTree,
	parseSourceTree,
} from "./parity-check.ts";

// ─── Fixture builders ──────────────────────────────────────────────────────────

const fn = (name: string, over: Partial<FnDef> = {}): FnDef => ({
	name,
	exported: true,
	file: "synthetic.ts",
	line: 1,
	params: [],
	declaresCtx: false,
	callees: [],
	directWrite: false,
	...over,
});

const op = (opName: string, over: Partial<OpRun> = {}): OpRun => ({
	opName,
	params: [],
	declaresCtx: false,
	callees: [],
	forwardsCtxTo: {},
	bindings: {},
	jsonReturns: [],
	...over,
});

const tree = (fns: FnDef[], opRuns: OpRun[]): ParsedTree => ({
	fns: new Map(fns.map((f) => [f.name, f])),
	opRuns,
});

/** Repo root (this file lives in scripts/), used by the real-tree assertions. */
const repoRoot = join(fileURLToPath(new URL("..", import.meta.url)));

// ─── enumerateWriters ───────────────────────────────────────────────────────────

describe("enumerateWriters", () => {
	it("includes an exported fn that directly writes", () => {
		const t = tree([fn("appendToBlock", { directWrite: true })], []);
		assert.deepEqual(
			enumerateWriters(t).map((w) => w.name),
			["appendToBlock"],
		);
	});

	it("includes an exported fn that reaches a write transitively", () => {
		const t = tree(
			[
				fn("appendToBlock", { callees: ["writeTypedFile"], directWrite: false }),
				fn("writeTypedFile", { directWrite: true }),
			],
			[],
		);
		const names = enumerateWriters(t).map((w) => w.name);
		assert.ok(names.includes("appendToBlock"));
		assert.ok(names.includes("writeTypedFile"));
	});

	it("excludes a non-exported helper even if it writes", () => {
		const t = tree([fn("rollbackDir", { exported: false, directWrite: true })], []);
		assert.deepEqual(enumerateWriters(t), []);
	});

	it("excludes an exported fn that never reaches a write", () => {
		const t = tree([fn("readBlock", { directWrite: false, callees: ["readFileSync"] })], []);
		assert.deepEqual(enumerateWriters(t), []);
	});
});

// ─── classifyWriter / classifyAll — one fixture per class ────────────────────────

describe("classifyAll — coverage classes", () => {
	const classOf = (results: ReturnType<typeof classifyAll>, name: string) =>
		results.find((r) => r.writer === name)?.coverageClass;

	it("op-backed-direct: an op run() calls the writer directly", () => {
		const t = tree(
			[fn("appendToBlock", { directWrite: true })],
			[op("append-block-item", { callees: ["appendToBlock"] })],
		);
		assert.equal(classOf(classifyAll(t), "appendToBlock"), "op-backed-direct");
	});

	it("op-backed-transitive: reachable from an op run() via a helper chain", () => {
		const t = tree(
			[
				fn("removeRelationByRef", { callees: ["writeRelations"], directWrite: false }),
				fn("writeRelations", { directWrite: true }),
			],
			[op("remove-relation", { callees: ["removeRelationByRef"] })],
		);
		// writeRelations is reached via removeRelationByRef, not called by the op directly.
		assert.equal(classOf(classifyAll(t), "writeRelations"), "op-backed-transitive");
	});

	it("for-dir-twin: <X>ForDir covered because <X> is op-backed", () => {
		const t = tree(
			[fn("appendToBlock", { directWrite: true }), fn("appendToBlockForDir", { directWrite: true })],
			[op("append-block-item", { callees: ["appendToBlock"] })],
		);
		assert.equal(classOf(classifyAll(t), "appendToBlockForDir"), "for-dir-twin");
	});

	it("intentionally-unexposed: a writer named on the allowlist", () => {
		// Use a real allowlist entry so the fixture stays in lockstep with the contract.
		const allowlisted = INTENTIONALLY_UNEXPOSED_WRITERS[0].libraryFn;
		const t = tree([fn(allowlisted, { directWrite: true })], []);
		assert.equal(classOf(classifyAll(t), allowlisted), "intentionally-unexposed");
	});

	it("internal-primitive: first param is a file path (filePath/schemaPath)", () => {
		const t = tree([fn("writeTypedFile", { params: ["filePath", "data"], directWrite: true })], []);
		assert.equal(classOf(classifyAll(t), "writeTypedFile"), "internal-primitive");
	});

	it("UNCLASSIFIED → null (the FAIL case): exported writer with no op / allowlist / twin / file-path param", () => {
		const t = tree([fn("orphanWriter", { params: ["cwd"], directWrite: true })], []);
		assert.equal(classOf(classifyAll(t), "orphanWriter"), null);
	});
});

// ─── checkCtxForwarding ──────────────────────────────────────────────────────────

describe("checkCtxForwarding", () => {
	it("FLAGS an op-run that calls a ctx-accepting writer WITHOUT forwarding ctx", () => {
		const t = tree(
			[fn("appendToBlock", { params: ["cwd", "block", "item", "ctx"], declaresCtx: true, directWrite: true })],
			[
				op("append-block-item", {
					params: ["cwd", "params", "ctx"],
					declaresCtx: true,
					callees: ["appendToBlock"],
					forwardsCtxTo: { appendToBlock: false }, // ctx dropped
				}),
			],
		);
		const violations = checkCtxForwarding(t);
		assert.equal(violations.length, 1);
		assert.equal(violations[0].kind, "ctx-drop");
		assert.equal(violations[0].fatal, true);
		assert.equal(violations[0].writer, "appendToBlock");
	});

	it("passes when the op-run forwards ctx to the ctx-accepting writer", () => {
		const t = tree(
			[fn("appendToBlock", { params: ["cwd", "block", "item", "ctx"], declaresCtx: true, directWrite: true })],
			[
				op("append-block-item", {
					params: ["cwd", "params", "ctx"],
					declaresCtx: true,
					callees: ["appendToBlock"],
					forwardsCtxTo: { appendToBlock: true },
				}),
			],
		);
		assert.deepEqual(checkCtxForwarding(t), []);
	});

	it("does not flag when the writer does not accept ctx", () => {
		const t = tree(
			[fn("readBlockDir", { params: ["cwd", "subdir"], declaresCtx: false, directWrite: false })],
			[
				op("read-block-dir", {
					params: ["cwd", "params"],
					declaresCtx: false,
					callees: ["readBlockDir"],
					forwardsCtxTo: { readBlockDir: false },
				}),
			],
		);
		assert.deepEqual(checkCtxForwarding(t), []);
	});
});

// ─── checkRequiredButDerivable — op↔CLI INPUT parity (required-but-derivable) ─────

describe("checkRequiredButDerivable", () => {
	// A synthetic OpDefinition carrying ONLY the runtime-relevant `parameters`
	// shape opRequiredParams reads: `{ required: [...] }` (the same field
	// pi-context-cli reads via objectSchema(op).required), never `run.params`.
	const opDef = (name: string, required: string[]): OpDefinition =>
		({
			name,
			label: name,
			description: "",
			parameters: { required },
			run: () => "",
			surface: "use",
		}) as unknown as OpDefinition;

	it("FLAGS an op requiring arrayKey when the CLI exemptions DO NOT include arrayKey", () => {
		const violations = checkRequiredButDerivable(
			new Set(["writer"]), // arrayKey absent
			[opDef("append-block-item", ["block", "arrayKey"])],
		);
		// One GLOBAL violation (arrayKey not exempted) + one PER-OP violation.
		assert.ok(violations.some((v) => v.includes("'append-block-item'") && v.includes("'arrayKey'")));
		assert.ok(violations.some((v) => v.includes("DERIVABLE") && v.includes("'arrayKey'")));
	});

	it("passes (0 violations) when the CLI exemptions include arrayKey", () => {
		const violations = checkRequiredButDerivable(new Set(["writer", "arrayKey"]), [
			opDef("append-block-item", ["block", "arrayKey"]),
		]);
		assert.deepEqual(violations, []);
	});

	it("FLAGS a different derivable-required param (extended DERIVABLE) that is not exempted", () => {
		// Extend DERIVABLE for the test to a hypothetical 'schemaKey' the op requires
		// but the CLI does not exempt → per-op + global violations.
		const violations = checkRequiredButDerivable(
			new Set(["writer", "arrayKey"]), // arrayKey exempt, schemaKey NOT
			[opDef("derive-op", ["block", "schemaKey"])],
			new Set(["arrayKey", "schemaKey"]),
		);
		assert.ok(violations.some((v) => v.includes("'derive-op'") && v.includes("'schemaKey'")));
		assert.ok(violations.some((v) => v.includes("DERIVABLE") && v.includes("'schemaKey'")));
	});

	it("the REAL ops + the real parsed cli.ts exemptions → ZERO violations (green-now)", () => {
		const cliFile = join(repoRoot, "packages", "pi-context-cli", "src", "cli.ts");
		const cliExemptions = extractStringLiterals(readFileSync(cliFile, "utf-8"));
		assert.ok(cliExemptions.has("arrayKey"), "cli.ts required-filter must exempt arrayKey");
		assert.deepEqual(checkRequiredButDerivable(cliExemptions, ops as OpDefinition[]), []);
	});
});

// ─── diffReadPayload — op↔CLI OUTPUT comparison (pure) ────────────────────────────

describe("diffReadPayload", () => {
	it("FLAGS a mismatched .data subtree", () => {
		const violations = diffReadPayload({ data: { a: 1 }, complete: true }, { data: { a: 2 }, complete: true });
		assert.equal(violations.length, 1);
		assert.ok(violations[0].includes(".data differs"));
	});

	it("passes (0 violations) when .data / .complete / .total all match", () => {
		assert.deepEqual(
			diffReadPayload(
				{ data: { required: ["id"] }, complete: true, total: undefined },
				{ data: { required: ["id"] }, complete: true, total: undefined },
			),
			[],
		);
	});

	it("FLAGS a .complete divergence", () => {
		const violations = diffReadPayload({ data: 1, complete: true }, { data: 1, complete: false });
		assert.equal(violations.length, 1);
		assert.ok(violations[0].includes(".complete differs"));
	});
});

// ─── flattenSchemaProperties — object / allOf / $ref / cyclic / unresolvable ─────

describe("flattenSchemaProperties", () => {
	it("collects keys across an allOf (Type.Intersect) member", () => {
		const keys = flattenSchemaProperties({
			allOf: [{ properties: { dryRun: {} } }, { properties: { source: {} } }],
		});
		assert.ok(keys.has("dryRun"));
		assert.ok(keys.has("source"));
	});

	it("resolves a $ref into the root $defs bag (Type.Ref)", () => {
		const keys = flattenSchemaProperties({
			$ref: "#/$defs/Base",
			$defs: { Base: { properties: { ordinal: {} } } },
		});
		assert.ok(keys.has("ordinal"));
	});

	it("resolves a legacy #/definitions/<n> $ref", () => {
		const keys = flattenSchemaProperties({
			$ref: "#/definitions/X",
			definitions: { X: { properties: { idField: {} } } },
		});
		assert.ok(keys.has("idField"));
	});

	it("threads the bag down so a nested $ref resolves against the root bag", () => {
		const keys = flattenSchemaProperties({
			$defs: { Base: { properties: { ordinal: {} } } },
			allOf: [{ $ref: "#/$defs/Base" }, { properties: { parent: {} } }],
		});
		assert.ok(keys.has("ordinal"));
		assert.ok(keys.has("parent"));
	});

	it("returns an empty set for an unresolvable $ref (no throw)", () => {
		const keys = flattenSchemaProperties({ $ref: "#/$defs/Missing", $defs: {} });
		assert.deepEqual([...keys], []);
	});

	it("returns an empty set for a cyclic $ref (no stack overflow)", () => {
		const keys = flattenSchemaProperties({
			$ref: "#/$defs/A",
			$defs: { A: { $ref: "#/$defs/A" } },
		});
		assert.deepEqual([...keys], []);
	});
});

// ─── opDeclaresParam — reads through the flattened property union ─────────────────

describe("opDeclaresParam", () => {
	const opWith = (parameters: unknown): OpDefinition =>
		({
			name: "x",
			label: "x",
			description: "",
			parameters,
			run: () => "",
			surface: "use",
		}) as unknown as OpDefinition;

	it("sees a flat Type.Object property", () => {
		assert.equal(opDeclaresParam(opWith({ properties: { dryRun: {} } }), "dryRun"), true);
		assert.equal(opDeclaresParam(opWith({ properties: { dryRun: {} } }), "ordinal"), false);
	});

	it("sees a param declared behind allOf / $ref", () => {
		assert.equal(
			opDeclaresParam(
				opWith({ allOf: [{ $ref: "#/$defs/B" }], $defs: { B: { properties: { idField: {} } } } }),
				"idField",
			),
			true,
		);
	});
});

// ─── extractStringLiterals — AST literal harvest (used to parse cli.ts exemptions) ─

describe("extractStringLiterals", () => {
	it('captures the operands of a `r !== "lit"` filter chain (the cli.ts exemption shape)', () => {
		const lits = extractStringLiterals(`(schema.required ?? []).filter((r) => r !== "writer" && r !== "arrayKey")`);
		assert.ok(lits.has("writer"));
		assert.ok(lits.has("arrayKey"));
	});

	it("captures single-quoted + template (no-substitution) literals", () => {
		const lits = extractStringLiterals("const a = 'arrayKey'; const b = `writer`;");
		assert.ok(lits.has("arrayKey"));
		assert.ok(lits.has("writer"));
	});

	it("does NOT capture text from a comment (trivia carries no literal node)", () => {
		const lits = extractStringLiterals(`// arrayKey is handled here\nconst x = 1;`);
		assert.equal(lits.has("arrayKey"), false);
	});
});

// ─── checkJsonContentCap — FGAP-015 {json}-returns-content-read gate ──────────────

describe("checkJsonContentCap", () => {
	it("FLAGS the binding form: const result = resolveItemById(...); return { json: result }", () => {
		// Mirrors how parseOpRuns records a `const result = resolveItemById(cwd, id)`
		// binding (bindings: { result: "resolveItemById" }) + a `return { json: result }`
		// (jsonReturns: [{ callee: null, identifier: "result" }]).
		const t = tree(
			[],
			[
				op("resolve-item-by-id", {
					callees: ["resolveItemById"],
					bindings: { result: "resolveItemById" },
					jsonReturns: [{ callee: null, identifier: "result" }],
				}),
			],
		);
		const violations = checkJsonContentCap(t);
		assert.equal(violations.length, 1);
		assert.equal(violations[0].opName, "resolve-item-by-id");
		assert.equal(violations[0].fn, "resolveItemById");
		assert.equal(violations[0].via, "binding");
	});

	it("FLAGS the inline form: return { json: resolveItemById(cwd, id) }", () => {
		const t = tree(
			[],
			[
				op("resolve-item-by-id", {
					callees: ["resolveItemById"],
					jsonReturns: [{ callee: "resolveItemById", identifier: null }],
				}),
			],
		);
		const violations = checkJsonContentCap(t);
		assert.equal(violations.length, 1);
		assert.equal(violations[0].fn, "resolveItemById");
		assert.equal(violations[0].via, "inline");
	});

	it("does NOT flag a { read: structureForRead(result, {...}) } return (no {json} return at all)", () => {
		// A {read} return contributes no entry to jsonReturns — the gate sees nothing.
		const t = tree(
			[],
			[
				op("resolve-item-by-id", {
					callees: ["resolveItemById", "structureForRead"],
					bindings: { result: "resolveItemById" },
					jsonReturns: [],
				}),
			],
		);
		assert.deepEqual(checkJsonContentCap(t), []);
	});

	it("does NOT flag a summary op: const blk = readBlock(...); return { json: { count: blk.items.length } }", () => {
		// The {json} value is a constructed ObjectLiteralExpression, NOT the bound
		// identifier — parseOpRuns records jsonReturns: [{ callee: null, identifier: null }].
		const t = tree(
			[],
			[
				op("context-status", {
					callees: ["readBlock"],
					bindings: { blk: "readBlock" },
					jsonReturns: [{ callee: null, identifier: null }],
				}),
			],
		);
		assert.deepEqual(checkJsonContentCap(t), []);
	});

	it('does NOT flag a prose string return: return "ok"', () => {
		// A non-object return contributes no jsonReturns entry.
		const t = tree([], [op("complete-task", { callees: ["completeTask"], jsonReturns: [] })]);
		assert.deepEqual(checkJsonContentCap(t), []);
	});

	it("does NOT flag { json: <ident> } where the ident is bound to a NON-content-read call", () => {
		// validateContext is a derivation, not a content-read — its {json} return is legitimate.
		const t = tree(
			[],
			[
				op("context-validate", {
					callees: ["validateContext"],
					bindings: { result: "validateContext" },
					jsonReturns: [{ callee: null, identifier: "result" }],
				}),
			],
		);
		assert.deepEqual(checkJsonContentCap(t), []);
	});

	it("does NOT flag { json: <ident> } where the ident is not bound to any call", () => {
		const t = tree([], [op("x", { jsonReturns: [{ callee: null, identifier: "unbound" }] })]);
		assert.deepEqual(checkJsonContentCap(t), []);
	});
});

// ─── Integration — the REAL pi-context tree, post STEP 1 ─────────────────────────

describe("integration: real pi-context tree has ZERO violations", () => {
	const srcDir = join(repoRoot, "packages", "pi-context", "src");

	it("parses op runs from the real ops-registry.ts (build present)", () => {
		const real = parseSourceTree(srcDir);
		assert.ok(real.opRuns.length > 0, "expected op runs parsed from ops-registry.ts");
	});

	it("classifies EVERY enumerated writer (zero UNCLASSIFIED)", () => {
		const real = parseSourceTree(srcDir);
		const classifications = classifyAll(real);
		const unclassified = classifications.filter((c) => c.coverageClass === null);
		assert.deepEqual(
			unclassified.map((c) => `${c.writer} (${c.file}:${c.line})`),
			[],
			"every library writer must fall into exactly one coverage class",
		);
	});

	it("rollbackBlockFiles classifies as intentionally-unexposed (STEP 1 allowlist)", () => {
		const real = parseSourceTree(srcDir);
		const classifications = classifyAll(real);
		const rb = classifications.find((c) => c.writer === "rollbackBlockFiles");
		assert.ok(rb, "rollbackBlockFiles must be enumerated as a writer");
		assert.equal(rb?.coverageClass, "intentionally-unexposed");
	});

	it("has ZERO ctx-drop violations", () => {
		const real = parseSourceTree(srcDir);
		const fatal = checkCtxForwarding(real).filter((v) => v.fatal);
		assert.deepEqual(
			fatal.map((v) => `${v.opName} → ${v.writer}`),
			[],
			"no op may drop ctx into a ctx-accepting writer",
		);
	});

	it("has ZERO {json}-content-cap bypasses (FGAP-015 — resolve-item-by-id/promote-item are {read})", () => {
		const real = parseSourceTree(srcDir);
		const violations = checkJsonContentCap(real);
		assert.deepEqual(
			violations.map((v) => `${v.opName} → {json}(${v.fn})`),
			[],
			"no op may return { json } of a content-reading library call — emit { read: structureForRead(...) }",
		);
	});

	it("has ZERO op↔CLI output-shape divergence (read-schema --path on a fixture, both surfaces)", async () => {
		// End-to-end: read-schema --path properties.tasks.items run through the in-pi
		// op AND the reflecting CLI's main() (imported from cli SOURCE, in-process —
		// NOT dist) must yield the same read payload (.data / .complete / .total).
		const violations = await checkOutputShapeParity();
		assert.deepEqual(violations, [], "the in-pi op read and the CLI envelope output must agree");
	});
});
