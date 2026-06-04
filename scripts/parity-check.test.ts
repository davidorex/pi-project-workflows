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
	classifyAll,
	enumerateWriters,
	type FnDef,
	type OpRun,
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
});
