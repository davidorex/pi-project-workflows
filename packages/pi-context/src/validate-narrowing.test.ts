/**
 * Tests for the validator narrowing surface: optional severity/block/code
 * filters + offset/limit pagination on context-validate,
 * context-validate-relations, and context-roadmap-validate, plus the
 * over-cap boundary refusal's op-supplied narrowing directive.
 *
 * Contract under test (additive-only):
 *   - narrowing is applied AFTER the full evaluation — it bounds only the
 *     returned issues[] slice; `status` always reflects the FULL evaluation;
 *   - unparameterized calls return the exact prior shape (byte-shape pin);
 *   - a synthetic over-cap issue set — whole-result reads refused at the
 *     50KB boundary — is retrievable IN FULL through bounded offset/limit
 *     slices (the previously-unreachable case);
 *   - the boundary refusal names the concrete narrowing parameters for ops
 *     declaring them; ops without a directive keep the mechanism-less text;
 *   - the `block` axis exists only where issues carry a `block` field:
 *     context-validate declares it; context-validate-relations and
 *     context-roadmap-validate declare a blockless parameter set, and their
 *     run() throws a field-named error on a `block` smuggled past the schema
 *     (the op layer performs no schema validation on params).
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { Type } from "typebox";
import { relationIssueSeverity } from "./context.js";
import { writeBootstrapPointer } from "./context-dir.js";
import {
	type ContextValidationIssue,
	narrowValidationResult,
	type ValidationSliceMeta,
	validateContext,
} from "./context-sdk.js";
import { validateContextRelations } from "./lens-view.js";
import {
	boundedJsonOutput,
	type OpDefinition,
	type OpResult,
	ops,
	registerAll,
	renderOpResultText,
} from "./ops-registry.js";
import { roadmapIssueSeverity, validateRoadmap } from "./roadmap-plan.js";

function makeTmpDir(prefix: string): string {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `narrow-${prefix}-`));
	writeBootstrapPointer(cwd, ".project");
	fs.mkdirSync(path.join(cwd, ".project"), { recursive: true });
	return cwd;
}

/**
 * Minimal config: registered relation_types + optional invariants. Empty
 * block_kinds keeps buildIdIndex's prefix-vs-block invariant out of the way
 * (mirrors context-sdk.test.ts's fixture rationale).
 */
function writeConfig(cwd: string, relationTypes: unknown[], invariants: unknown[] = []): void {
	fs.writeFileSync(
		path.join(cwd, ".project", "config.json"),
		JSON.stringify({
			schema_version: "1.8.0",
			root: ".project",
			block_kinds: [],
			relation_types: relationTypes,
			invariants,
		}),
	);
}

function writeBlock(cwd: string, name: string, data: unknown): void {
	fs.writeFileSync(path.join(cwd, ".project", `${name}.json`), JSON.stringify(data));
}

function writeRelations(cwd: string, edges: unknown[]): void {
	writeBlock(cwd, "relations", edges);
}

function opByName(name: string): OpDefinition {
	const op = ops.find((o) => o.name === name);
	assert.ok(op, `op '${name}' must exist in the registry`);
	return op;
}

type NarrowedResult<I> = { status: string; issues: I[]; slice?: ValidationSliceMeta };

function runJson<I>(op: OpDefinition, cwd: string, params: Record<string, unknown>): NarrowedResult<I> {
	const r = op.run(cwd, params as never) as { json: NarrowedResult<I> };
	assert.ok(typeof r === "object" && "json" in r, "validator ops return the {json} channel");
	return r.json;
}

const DEP_REL = { canonical_id: "task_depends_on_task", display_name: "depends on", category: "ordering" };
const ADDR_REL = { canonical_id: "decision_addresses_gap", display_name: "addresses gap", category: "data_flow" };

/**
 * Mixed-severity fixture for context-validate: 3 dangling-endpoint errors
 * (block "relations", code edge_endpoint_dangling) + 2 warning-severity
 * requires-edge invariant violations (block "decisions", code = invariant id).
 */
function makeMixedFixture(): string {
	const cwd = makeTmpDir("mixed");
	writeConfig(
		cwd,
		[DEP_REL, ADDR_REL],
		[
			{
				id: "decision-cites-forcing-artifact-warn",
				class: "requires-edge",
				block: "decisions",
				relation_types: ["decision_addresses_gap"],
				direction: "as_parent",
				severity: "warning",
				message: "Decision '{id}' cites no forcing artifact",
			},
		],
	);
	writeBlock(cwd, "tasks", { tasks: [{ id: "t1", status: "planned" }] });
	writeBlock(cwd, "decisions", {
		decisions: [
			{ id: "d1", decision: "use X", status: "decided" },
			{ id: "d2", decision: "use Y", status: "decided" },
		],
	});
	writeRelations(cwd, [
		{ parent: "missing-a", child: "t1", relation_type: "task_depends_on_task" },
		{ parent: "missing-b", child: "t1", relation_type: "task_depends_on_task" },
		{ parent: "t1", child: "missing-c", relation_type: "task_depends_on_task" },
	]);
	return cwd;
}

// ── narrowValidationResult (unit pins) ───────────────────────────────────────

describe("narrowValidationResult", () => {
	type Issue = { severity?: "error" | "warning"; block?: string; code?: string; n: number };
	const sevOf = (i: Issue) => i.severity;
	const issues: Issue[] = [
		{ severity: "error", block: "relations", code: "c1", n: 0 },
		{ severity: "error", block: "tasks", code: "c2", n: 1 },
		{ severity: "warning", block: "tasks", code: "c1", n: 2 },
		{ severity: "warning", block: "decisions", n: 3 },
	];
	const full = { status: "invalid" as const, issues };

	it("returns the result unchanged (same reference, no slice) with no narrowing parameter", () => {
		const out = narrowValidationResult(full, {}, sevOf);
		assert.equal(out, full);
		assert.equal("slice" in out, false);
	});

	it("filters by severity / block / code, combined", () => {
		assert.deepEqual(
			narrowValidationResult(full, { severity: "error" }, sevOf).issues.map((i) => i.n),
			[0, 1],
		);
		assert.deepEqual(
			narrowValidationResult(full, { block: "tasks" }, sevOf).issues.map((i) => i.n),
			[1, 2],
		);
		assert.deepEqual(
			narrowValidationResult(full, { code: "c1" }, sevOf).issues.map((i) => i.n),
			[0, 2],
		);
		assert.deepEqual(
			narrowValidationResult(full, { severity: "warning", code: "c1" }, sevOf).issues.map((i) => i.n),
			[2],
		);
	});

	it("an issue with no matching field matches no block/code filter; info-severity matches no severity filter", () => {
		// n:3 carries no code — a code filter never matches it.
		assert.deepEqual(
			narrowValidationResult(full, { code: "nope" }, sevOf).issues.map((i) => i.n),
			[],
		);
		// severityOf → undefined (info-class) matches neither severity value.
		const info = { status: "clean" as const, issues: [{ n: 9 } as Issue] };
		assert.deepEqual(narrowValidationResult(info, { severity: "warning" }, () => undefined).issues, []);
		assert.deepEqual(narrowValidationResult(info, { severity: "error" }, () => undefined).issues, []);
	});

	it("filter-only returns every matching issue (no implicit page size); offset/limit slice via pageArray", () => {
		const filterOnly = narrowValidationResult(full, { severity: "error" }, sevOf);
		assert.deepEqual(filterOnly.slice, { totalIssues: 4, matching: 2, returned: 2, offset: 0, hasMore: false });
		const page = narrowValidationResult(full, { offset: 1, limit: 2 }, sevOf);
		assert.deepEqual(
			page.issues.map((i) => i.n),
			[1, 2],
		);
		assert.deepEqual(page.slice, { totalIssues: 4, matching: 4, returned: 2, offset: 1, hasMore: true });
	});

	it("status passes through from the FULL evaluation even when the filtered slice is empty", () => {
		const out = narrowValidationResult(full, { block: "no-such-block" }, sevOf);
		assert.equal(out.status, "invalid");
		assert.deepEqual(out.issues, []);
		assert.deepEqual(out.slice, { totalIssues: 4, matching: 0, returned: 0, offset: 0, hasMore: false });
	});
});

// ── context-validate op ──────────────────────────────────────────────────────

describe("context-validate op narrowing", () => {
	it("unparameterized call returns the exact prior shape (byte-shape regression pin)", (t) => {
		const cwd = makeMixedFixture();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const op = opByName("context-validate");
		const out = runJson<ContextValidationIssue>(op, cwd, {});
		const raw = validateContext(cwd);
		assert.equal("slice" in out, false, "no slice head on an unparameterized call");
		assert.equal(JSON.stringify(out), JSON.stringify(raw));
	});

	it("filters by severity / block / code against the full evaluation's projections", (t) => {
		const cwd = makeMixedFixture();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const op = opByName("context-validate");
		const full = validateContext(cwd);
		assert.equal(full.status, "invalid");
		assert.ok(full.issues.some((i) => i.severity === "error"));
		assert.ok(full.issues.some((i) => i.severity === "warning"));

		const errors = runJson<ContextValidationIssue>(op, cwd, { severity: "error" });
		assert.deepEqual(
			errors.issues,
			full.issues.filter((i) => i.severity === "error"),
		);
		assert.equal(errors.status, "invalid");

		const decisions = runJson<ContextValidationIssue>(op, cwd, { block: "decisions" });
		assert.deepEqual(
			decisions.issues,
			full.issues.filter((i) => i.block === "decisions"),
		);

		const dangling = runJson<ContextValidationIssue>(op, cwd, { code: "edge_endpoint_dangling" });
		assert.equal(dangling.issues.length, 3);
		assert.ok(dangling.issues.every((i) => i.code === "edge_endpoint_dangling"));
	});

	it("paginates the filtered list with offset/limit + slice metadata", (t) => {
		const cwd = makeMixedFixture();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const op = opByName("context-validate");
		const errorsFull = runJson<ContextValidationIssue>(op, cwd, { severity: "error" }).issues;
		assert.equal(errorsFull.length, 3);
		const collected: ContextValidationIssue[] = [];
		for (let offset = 0; ; offset += 1) {
			const page = runJson<ContextValidationIssue>(op, cwd, { severity: "error", offset, limit: 1 });
			assert.equal(page.slice?.matching, 3);
			assert.equal(page.slice?.returned, 1);
			assert.equal(page.slice?.offset, offset);
			collected.push(...page.issues);
			if (!page.slice?.hasMore) break;
		}
		assert.deepEqual(collected, errorsFull);
	});

	it("status reflects the FULL evaluation when the filtered slice is empty", (t) => {
		const cwd = makeMixedFixture();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const op = opByName("context-validate");
		const out = runJson<ContextValidationIssue>(op, cwd, { block: "no-such-block" });
		assert.deepEqual(out.issues, []);
		assert.equal(out.status, "invalid", "empty filtered slice must still carry the full verdict");
	});

	it("a warnings-only substrate keeps status 'warnings' when the error-filtered slice is empty", (t) => {
		// Same warning-severity invariant as the mixed fixture, but NO dangling
		// edges — the full evaluation is warnings-only.
		const cwd = makeTmpDir("warn-only");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		writeConfig(
			cwd,
			[ADDR_REL],
			[
				{
					id: "decision-cites-forcing-artifact-warn",
					class: "requires-edge",
					block: "decisions",
					relation_types: ["decision_addresses_gap"],
					direction: "as_parent",
					severity: "warning",
					message: "Decision '{id}' cites no forcing artifact",
				},
			],
		);
		writeBlock(cwd, "decisions", { decisions: [{ id: "d1", decision: "use X", status: "decided" }] });
		writeRelations(cwd, []);
		const op = opByName("context-validate");
		const full = validateContext(cwd);
		assert.equal(full.status, "warnings");
		const out = runJson<ContextValidationIssue>(op, cwd, { severity: "error" });
		assert.deepEqual(out.issues, []);
		assert.equal(out.status, "warnings", "empty error-filtered slice must still carry the warnings verdict");
	});
});

// ── context-validate-relations op ────────────────────────────────────────────

describe("context-validate-relations op narrowing", () => {
	function makeRelationsFixture(): string {
		const cwd = makeTmpDir("rel");
		writeConfig(cwd, [DEP_REL]);
		writeBlock(cwd, "tasks", {
			tasks: [
				{ id: "t1", status: "planned" },
				{ id: "t2", status: "planned" },
			],
		});
		writeRelations(cwd, [{ parent: "t1", child: "t2", relation_type: "task_blocks_task" }]);
		return cwd;
	}

	it("unparameterized call returns the exact prior shape; severity derives from the code classification", (t) => {
		const cwd = makeRelationsFixture();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const op = opByName("context-validate-relations");
		const full = validateContextRelations(cwd);
		assert.equal(full.status, "invalid");
		assert.ok(full.issues.every((i) => relationIssueSeverity(i) === "error"));

		const out = runJson(op, cwd, {});
		assert.equal("slice" in out, false);
		assert.equal(JSON.stringify(out), JSON.stringify(full));

		const errors = runJson(op, cwd, { severity: "error" });
		assert.deepEqual(errors.issues, full.issues);
		const warnings = runJson(op, cwd, { severity: "warning" });
		assert.deepEqual(warnings.issues, []);
		assert.equal(warnings.status, "invalid", "full verdict survives an empty filtered slice");

		const byCode = runJson(op, cwd, { code: "edge_unknown_relation_type" });
		assert.equal(byCode.issues.length, 1);
		const paged = runJson(op, cwd, { offset: 0, limit: 1 });
		assert.deepEqual(paged.slice, { totalIssues: 1, matching: 1, returned: 1, offset: 0, hasMore: false });
	});
});

// ── context-roadmap-validate op ──────────────────────────────────────────────

describe("context-roadmap-validate op narrowing", () => {
	it("severity derives from the roadmap code classification; errors filter + paginate", (t) => {
		const cwd = makeTmpDir("roadmap-err");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		writeConfig(cwd, [DEP_REL]);
		// One precedes edge whose BOTH endpoints are unknown milestones → two
		// roadmap_precedes_endpoint_missing errors.
		writeRelations(cwd, [{ parent: "m1", child: "m2", relation_type: "milestone_precedes_milestone" }]);
		const op = opByName("context-roadmap-validate");
		const full = validateRoadmap(cwd);
		assert.equal(full.status, "invalid");
		assert.equal(full.issues.length, 2);

		const out = runJson(op, cwd, {});
		assert.equal("slice" in out, false);
		assert.equal(JSON.stringify(out), JSON.stringify(full));

		const errors = runJson(op, cwd, { severity: "error" });
		assert.deepEqual(errors.issues, full.issues);
		const warnings = runJson(op, cwd, { severity: "warning" });
		assert.deepEqual(warnings.issues, []);
		assert.equal(warnings.status, "invalid");

		const page = runJson(op, cwd, { limit: 1 });
		assert.deepEqual(page.slice, { totalIssues: 2, matching: 2, returned: 1, offset: 0, hasMore: true });
	});

	it("info-class issues (roadmap_milestone_isolated) match no severity filter but page normally", (t) => {
		const cwd = makeTmpDir("roadmap-info");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		writeConfig(cwd, [DEP_REL]);
		writeBlock(cwd, "milestone", {
			milestones: [
				{ id: "m1", title: "first" },
				{ id: "m2", title: "second" },
				{ id: "m3", title: "isolated" },
			],
		});
		writeRelations(cwd, [{ parent: "m1", child: "m2", relation_type: "milestone_precedes_milestone" }]);
		const op = opByName("context-roadmap-validate");
		const full = validateRoadmap(cwd);
		assert.equal(full.status, "clean", "info never affects status");
		assert.equal(full.issues.length, 1);
		assert.equal(roadmapIssueSeverity(full.issues[0]!), undefined);

		assert.deepEqual(runJson(op, cwd, { severity: "error" }).issues, []);
		assert.deepEqual(runJson(op, cwd, { severity: "warning" }).issues, []);
		const paged = runJson(op, cwd, { offset: 0, limit: 10 });
		assert.deepEqual(paged.issues, full.issues);
		assert.equal(paged.status, "clean");
	});
});

// ── block axis: declared only on context-validate; rejected elsewhere ────────

describe("the block narrowing axis exists only where issues carry a block field", () => {
	const BLOCKLESS_OPS = ["context-validate-relations", "context-roadmap-validate"] as const;

	function schemaProps(op: OpDefinition): Record<string, unknown> {
		const schema = op.parameters as unknown as { properties?: Record<string, unknown> };
		assert.ok(schema.properties, `op '${op.name}' declares an object parameter schema`);
		return schema.properties;
	}

	it("context-validate declares block; the relation/roadmap validators do not (schema pin)", () => {
		assert.ok("block" in schemaProps(opByName("context-validate")));
		for (const name of BLOCKLESS_OPS) {
			const props = schemaProps(opByName(name));
			assert.equal("block" in props, false, `op '${name}' must not declare a block parameter`);
			assert.deepEqual(Object.keys(props).sort(), ["code", "limit", "offset", "severity"]);
		}
	});

	it("run() refuses a block param smuggled past the schema with a field-named throw", (t) => {
		// The op layer performs no schema validation on params (registerAll passes
		// them straight into run(); Type.Object does not set
		// additionalProperties:false), so without this gate a smuggled `block`
		// would silently filter to an always-empty slice.
		const cwd = makeTmpDir("block-reject");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		writeConfig(cwd, [DEP_REL]);
		writeRelations(cwd, []);
		for (const name of BLOCKLESS_OPS) {
			const op = opByName(name);
			assert.throws(
				() => op.run(cwd, { block: "tasks" } as never),
				new RegExp(`${name}: unknown parameter 'block'`),
				`op '${name}' must reject a block param by name`,
			);
		}
	});

	it("the blockless validators' over-cap directives name only their own axes", () => {
		for (const name of BLOCKLESS_OPS) {
			const directive = opByName(name).overCapDirective;
			assert.ok(directive);
			assert.equal(directive.hint, "narrow with severity/code or offset+limit");
		}
		assert.equal(
			opByName("context-validate").overCapDirective?.hint,
			"narrow with severity/block/code or offset+limit",
		);
	});

	it("the blockless validators' descriptions name only their own axes", () => {
		for (const name of BLOCKLESS_OPS) {
			const description = opByName(name).description;
			assert.match(description, /Optional narrowing \(severity \/ code filter/);
			assert.doesNotMatch(description, /severity \/ block \/ code/);
		}
		assert.match(opByName("context-validate").description, /Optional narrowing \(severity \/ block \/ code filter/);
	});
});

// ── Over-cap boundary: refusal directive + bounded-slice retrieval ───────────

describe("over-cap validator output: refusal names the narrowing parameters; bounded slices reach the whole set", () => {
	/** >50KB issue set: many dangling edges with long endpoint ids. */
	function makeOverCapFixture(): string {
		const cwd = makeTmpDir("overcap");
		writeConfig(cwd, [DEP_REL]);
		writeBlock(cwd, "tasks", { tasks: [{ id: "t1", status: "planned" }] });
		const pad = "x".repeat(200);
		const edges = Array.from({ length: 300 }, (_, i) => ({
			parent: `missing-${String(i).padStart(3, "0")}-${pad}`,
			child: "t1",
			relation_type: "task_depends_on_task",
		}));
		writeRelations(cwd, edges);
		return cwd;
	}

	it("the unparameterized whole-result read is refused with the op's concrete narrowing directive", (t) => {
		const cwd = makeOverCapFixture();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const op = opByName("context-validate");
		assert.ok(op.overCapDirective, "context-validate declares an over-cap directive");

		const whole = op.run(cwd, {}) as OpResult;
		const text = renderOpResultText(whole, op.overCapDirective);
		assert.match(text, /OUTPUT REFUSED/);
		assert.match(text, /Narrow your read: call `context-validate`/);
		assert.match(text, /narrow with severity\/block\/code or offset\+limit/);
		assert.equal(text.includes("missing-000"), false, "no payload body leaks past the refusal");

		const envelope = boundedJsonOutput(whole, op.overCapDirective) as Record<string, unknown>;
		assert.equal(envelope.data, null);
		assert.equal(envelope.truncated, true);
		assert.equal(envelope.complete, false);
		assert.match(String(envelope.directive), /call `context-validate`.*severity\/block\/code or offset\+limit/);
	});

	it("the full issue set is retrievable through bounded offset/limit slices (previously unreachable)", (t) => {
		const cwd = makeOverCapFixture();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const op = opByName("context-validate");
		const full = validateContext(cwd);
		assert.equal(full.issues.length, 300);

		const collected: ContextValidationIssue[] = [];
		const limit = 25;
		for (let offset = 0; ; offset += limit) {
			const r = op.run(cwd, { offset, limit }) as OpResult;
			const text = renderOpResultText(r, op.overCapDirective);
			assert.doesNotMatch(text, /OUTPUT REFUSED/, `slice at offset ${offset} must render under the cap`);
			const page = (r as { json: NarrowedResult<ContextValidationIssue> }).json;
			assert.equal(page.status, full.status);
			assert.equal(page.slice?.totalIssues, 300);
			collected.push(...page.issues);
			if (!page.slice?.hasMore) break;
		}
		assert.deepEqual(collected, full.issues, "bounded slices reconstruct the exact full evaluation");
	});

	it("ops WITHOUT a directive keep the mechanism-less refusal + envelope byte-shape", () => {
		const over: OpResult = { json: { blob: "y".repeat(120000) } };
		const text = renderOpResultText(over);
		assert.ok(text.endsWith("Narrow your read."), "mechanism-less refusal text unchanged");
		const envelope = boundedJsonOutput(over) as Record<string, unknown>;
		assert.deepEqual(Object.keys(envelope).sort(), ["complete", "data", "totalBytes", "truncated"]);
	});

	it("registerAll threads the op-declared directive into the Pi-tool surface refusal", async () => {
		type CapturedTool = {
			name: string;
			execute: (
				id: string,
				params: unknown,
				signal: AbortSignal,
				onUpdate: () => void,
				ctx: { cwd: string },
			) => Promise<{ content: { text: string }[] }>;
		};
		const synthetic: OpDefinition = {
			name: "synthetic-overcap-directive",
			label: "Synthetic Over-Cap Directive",
			description: "test-only op returning a >50KB {json} value with a narrowing directive",
			parameters: Type.Object({}),
			overCapDirective: { tool: "synthetic-overcap-directive", hint: "narrow with offset+limit" },
			surface: "use",
			run: () => ({ json: { blob: "z".repeat(120000) } }),
		};
		ops.push(synthetic);
		try {
			const registered = new Map<string, CapturedTool>();
			const api = {
				registerTool: (def: { name: string; execute: CapturedTool["execute"] }) => {
					registered.set(def.name, { name: def.name, execute: def.execute });
				},
			};
			registerAll(api as never);
			const tool = registered.get("synthetic-overcap-directive");
			assert.ok(tool);
			const result = await tool.execute("call-1", {}, new AbortController().signal, () => {}, {
				cwd: process.cwd(),
			});
			const text = result.content[0]!.text;
			assert.match(text, /OUTPUT REFUSED/);
			assert.match(text, /call `synthetic-overcap-directive`/);
			assert.match(text, /narrow with offset\+limit/);
		} finally {
			ops.pop();
		}
	});
});
