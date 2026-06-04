/**
 * Tests for the parity-check's pure helpers + the real-tree integration assertion
 * (scripts/parity-check.ts — the FGAP-009 op-coverage contract enforcer, TASK-008 γ).
 *
 * Two layers:
 *   1. Unit fixtures — synthetic ParsedTree models exercise each coverage class
 *      (op-backed-direct, op-backed-transitive, *ForDir twin, allowlisted,
 *      internal-primitive), the UNCLASSIFIED → FAIL case, and the ctx-drop →
 *      FAIL case. Helpers are imported from the built scripts/parity-check.ts.
 *   2. Integration — parse the REAL packages/pi-context/src tree (+ its
 *      ops-registry.ts) and assert ZERO classification violations and ZERO
 *      ctx-drop violations. After STEP 1 (rollbackBlockFiles allowlisted) the
 *      real tree is fully classified, so this passes — the same assertion the
 *      husky/CI check makes.
 */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { INTENTIONALLY_UNEXPOSED_WRITERS, type OpDefinition } from "@davidorex/pi-context/ops";
import {
	checkCtxForwarding,
	checkDualSurfaceParity,
	checkJsonContentCap,
	classifyAll,
	enumerateWriters,
	type FnDef,
	flattenSchemaProperties,
	type OpRun,
	opDeclaresParam,
	type ParsedTree,
	parseSourceTree,
	scriptParsesFlag,
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

// ─── checkDualSurfaceParity — accurate op-schema vs script-flag signals ──────────

describe("checkDualSurfaceParity", () => {
	// A synthetic OpDefinition carrying ONLY the runtime-relevant `parameters`
	// shape opDeclaresParam reads: `{ properties: { <camelParam>: ... } }`. The
	// detector inspects `op.parameters.properties` keys (the same field
	// pi-context-cli reads via objectSchema(op).properties), never `run.params`.
	const opDef = (name: string, paramKeys: string[]): OpDefinition =>
		({
			name,
			label: name,
			description: "",
			parameters: { properties: Object.fromEntries(paramKeys.map((k) => [k, {}])) },
			run: () => "",
			surface: "use",
		}) as unknown as OpDefinition;

	// A scripts dir holding one fixture orchestrator script per op-name.
	const makeScriptsDir = (scripts: Record<string, string>): string => {
		const dir = mkdtempSync(join(tmpdir(), "parity-scripts-"));
		for (const [opName, body] of Object.entries(scripts)) {
			writeFileSync(join(dir, `${opName}.ts`), body, "utf-8");
		}
		return dir;
	};

	// The op-run AST presence is only the gate for "has a sibling worth checking";
	// param detection comes from the op schema + the script text.
	const opRunTree = (...names: string[]): ParsedTree =>
		tree(
			[],
			names.map((n) => op(n)),
		);

	it("NO divergence when op schema declares dryRun AND the script parses --dry-run", () => {
		const dir = makeScriptsDir({
			"promote-item": `if (a === "--dry-run") { out.dryRun = true; }`,
		});
		const violations = checkDualSurfaceParity(opRunTree("promote-item"), dir, [
			opDef("promote-item", ["source", "to", "dryRun"]),
		]);
		assert.deepEqual(violations, []);
	});

	it("divergence (non-fatal) when the script parses --dry-run but the op schema lacks dryRun", () => {
		const dir = makeScriptsDir({
			"append-relation": `if (a === "--dry-run") { out.dryRun = true; } else if (a === "--ordinal" && argv[i + 1]) { out.ordinal = n; }`,
		});
		const violations = checkDualSurfaceParity(opRunTree("append-relation"), dir, [
			// schema declares ordinal but NOT dryRun (mirrors the real append-relation op)
			opDef("append-relation", ["parent", "child", "relation_type", "ordinal"]),
		]);
		const dryRun = violations.filter((v) => v.detail.includes("dryRun"));
		assert.equal(dryRun.length, 1);
		assert.equal(dryRun[0].kind, "dual-surface");
		assert.equal(dryRun[0].fatal, false);
		// ordinal is declared AND parsed (--ordinal present) → no ordinal divergence.
		assert.equal(violations.filter((v) => v.detail.includes("ordinal")).length, 0);
	});

	it("NO divergence when op schema declares ordinal AND the script parses --ordinal", () => {
		const dir = makeScriptsDir({
			"append-relation": `else if (a === "--ordinal" && argv[i + 1]) { out.ordinal = n; }`,
		});
		const violations = checkDualSurfaceParity(opRunTree("append-relation"), dir, [
			opDef("append-relation", ["parent", "child", "relation_type", "ordinal"]),
		]);
		assert.equal(violations.filter((v) => v.detail.includes("ordinal")).length, 0);
	});

	it("does NOT bare-word-match a camel token in comments / output tables", () => {
		// Script prints "ordinal" in an output string but parses no --ordinal flag,
		// and the op schema does not declare ordinal → the OLD bare-word detector
		// would FALSELY flag; the flag-literal detector must NOT.
		const dir = makeScriptsDir({
			"find-references": `console.log("relation_type | ordinal");`,
		});
		const violations = checkDualSurfaceParity(opRunTree("find-references"), dir, [
			opDef("find-references", ["id", "direction"]),
		]);
		assert.deepEqual(violations, []);
	});

	it("flags an op that declares a param its sibling script offers no flag for", () => {
		const dir = makeScriptsDir({
			"upsert-block-item": `// no --id-field parsing here`,
		});
		const violations = checkDualSurfaceParity(opRunTree("upsert-block-item"), dir, [
			opDef("upsert-block-item", ["block", "item", "idField"]),
		]);
		const idField = violations.filter((v) => v.detail.includes("idField"));
		assert.equal(idField.length, 1);
		assert.equal(idField[0].fatal, false);
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

// ─── scriptParsesFlag — arg-parse position only, escaped, both quote styles ───────

describe("scriptParsesFlag", () => {
	it("does NOT match a flag literal in a console.log", () => {
		assert.equal(scriptParsesFlag(`console.log("usage: cmd --dry-run");`, "--dry-run"), false);
	});

	it("does NOT match a flag literal in a comment", () => {
		assert.equal(scriptParsesFlag(`// --dry-run is handled elsewhere`, "--dry-run"), false);
	});

	it('matches an `else if (a === "--dry-run")` arg-parse line', () => {
		assert.equal(scriptParsesFlag(`} else if (a === "--dry-run") {`, "--dry-run"), true);
	});

	it("matches a single-quoted arg-parse line", () => {
		assert.equal(scriptParsesFlag(`if (a === '--id-field') {`, "--id-field"), true);
	});

	it("matches with no whitespace around ===", () => {
		assert.equal(scriptParsesFlag(`if (a==="--ordinal"&&argv[i+1]){`, "--ordinal"), true);
	});

	it("does NOT match the comparison text inside a block comment (audit repro)", () => {
		assert.equal(scriptParsesFlag(`/* a === "--dry-run" */`, "--dry-run"), false);
	});

	it("does NOT match a flag inside a display string literal", () => {
		assert.equal(scriptParsesFlag(`const help = "pass a === \\"--dry-run\\" here";`, "--dry-run"), false);
	});

	it('matches a `case "--flag":` switch arg-parse position', () => {
		assert.equal(scriptParsesFlag(`switch (a) { case "--dry-run": break; }`, "--dry-run"), true);
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
	const repoRoot = join(fileURLToPath(new URL("..", import.meta.url)));
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
});
