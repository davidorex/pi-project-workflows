/**
 * Tests for the op-registry's in-pi DispatchContext construction (writer-identity
 * threaded through the whole op-execution contract).
 *
 * `buildDispatchContextFromExecute` is the boundary that turns the per-call
 * `params` + `ExtensionContext` into the contract `DispatchContext` threaded as
 * the 3rd arg of every op's `run`. Two derivation branches:
 *   - auth-gate-stamped `params.writer.user` (non-empty string) → human writer
 *   - otherwise the running model id → agent writer (fallback "pi-agent")
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
	buildDispatchContextFromExecute,
	CoverageClass,
	INTENTIONALLY_UNEXPOSED_WRITERS,
	OP_COVERAGE_RULE,
} from "./ops-registry.js";

test("buildDispatchContextFromExecute builds a human writer from params.writer.user", () => {
	const dctx = buildDispatchContextFromExecute({ writer: { kind: "human", user: "me@example.com" } }, {});
	assert.deepEqual(dctx, { writer: { kind: "human", user: "me@example.com" } });
});

test("buildDispatchContextFromExecute prefers params.writer.user even when a model is present", () => {
	const dctx = buildDispatchContextFromExecute(
		{ writer: { kind: "human", user: "operator@x" } },
		{ model: { id: "claude-opus-4-8" } },
	);
	assert.deepEqual(dctx, { writer: { kind: "human", user: "operator@x" } });
});

test("buildDispatchContextFromExecute builds an agent writer from the model id when no writer.user", () => {
	const dctx = buildDispatchContextFromExecute({}, { model: { id: "claude-opus-4-8" } });
	assert.deepEqual(dctx, { writer: { kind: "agent", agent_id: "claude-opus-4-8" } });
});

test("buildDispatchContextFromExecute falls back to pi-agent when no model id", () => {
	assert.deepEqual(buildDispatchContextFromExecute({}, {}), {
		writer: { kind: "agent", agent_id: "pi-agent" },
	});
	assert.deepEqual(buildDispatchContextFromExecute({}, { model: {} }), {
		writer: { kind: "agent", agent_id: "pi-agent" },
	});
});

test("buildDispatchContextFromExecute treats an empty-string writer.user as absent (agent fallback)", () => {
	const dctx = buildDispatchContextFromExecute({ writer: { user: "" } }, { model: { id: "m1" } });
	assert.deepEqual(dctx, { writer: { kind: "agent", agent_id: "m1" } });
});

test("buildDispatchContextFromExecute handles null/undefined params (agent fallback)", () => {
	assert.deepEqual(buildDispatchContextFromExecute(undefined, { model: { id: "m2" } }), {
		writer: { kind: "agent", agent_id: "m2" },
	});
	assert.deepEqual(buildDispatchContextFromExecute(null, {}), {
		writer: { kind: "agent", agent_id: "pi-agent" },
	});
});

// ── Op-surface ↔ library-write-surface coverage rule (cli-arc β, Finding B) ─────────────────────────
// The coverage RULE is exported as a typed structure γ (the
// library↔op-registry↔orchestrator-script parity/coverage test) consumes
// instead of re-deriving. These tests pin the contract: the 5 classes are
// present + documented, and every allowlist entry is well-formed.

test("OP_COVERAGE_RULE documents exactly the five coverage classes (the disjunction)", () => {
	// One clause per CoverageClass enum member — the disjunction is exhaustive.
	const ruleClasses = OP_COVERAGE_RULE.map((c) => c.coverageClass);
	const enumClasses = Object.values(CoverageClass);
	assert.equal(ruleClasses.length, 5, "five coverage clauses");
	assert.deepEqual([...ruleClasses].sort(), [...enumClasses].sort(), "rule clauses cover every CoverageClass member");
	assert.equal(new Set(ruleClasses).size, 5, "no duplicate classes");
	// The five named classes are present.
	for (const expected of [
		CoverageClass.OpBackedDirect,
		CoverageClass.OpBackedTransitive,
		CoverageClass.ForDirTwin,
		CoverageClass.IntentionallyUnexposed,
		CoverageClass.InternalPrimitive,
	]) {
		assert.ok(ruleClasses.includes(expected), `rule includes ${expected}`);
	}
	// Each clause carries a non-empty human-readable test γ will apply.
	for (const clause of OP_COVERAGE_RULE) {
		assert.equal(typeof clause.test, "string");
		assert.ok(clause.test.length > 0, `${clause.coverageClass} has a non-empty test`);
	}
});

test("the op-backed-transitive clause covers reachable-via-helper writers (writeSkeletonConfig / reconcileActiveSubstrateRegistration), not just *ByRef porcelain", () => {
	// Finding B precision: the transitive clause is worded around ANY helper/wrapper
	// chain — so both the *ByRef relation porcelain AND the init/switch → internal
	// helper chains classify cleanly. A writer reachable from an op's run via a
	// helper (writeSkeletonConfig via context-init → initProject;
	// reconcileActiveSubstrateRegistration via context-switch → switchToExisting /
	// switchAndCreate) is neither a *ByRef nor allowlisted, yet must match this clause.
	const clause = OP_COVERAGE_RULE.find((c) => c.coverageClass === CoverageClass.OpBackedTransitive);
	assert.ok(clause, "op-backed-transitive clause is present");
	const text = clause.test.toLowerCase();
	// The wording covers general transitive op-reachability, not just the porcelain.
	assert.ok(
		text.includes("helper") || text.includes("transitive") || text.includes("chain"),
		"names the transitive reach",
	);
	// The init/switch → helper writers are named in the clause so they classify here.
	assert.ok(text.includes("writeskeletonconfig"), "names writeSkeletonConfig");
	assert.ok(text.includes("reconcileactivesubstrateregistration"), "names reconcileActiveSubstrateRegistration");
	// writeSkeletonConfig / reconcileActiveSubstrateRegistration are NOT allowlisted
	// (covered by the transitive clause instead) — no allowlist entry was added.
	const allowed = INTENTIONALLY_UNEXPOSED_WRITERS.map((e) => e.libraryFn);
	assert.ok(!allowed.includes("writeSkeletonConfig"), "writeSkeletonConfig is not allowlisted (op-backed-transitive)");
	assert.ok(
		!allowed.includes("reconcileActiveSubstrateRegistration"),
		"reconcileActiveSubstrateRegistration is not allowlisted (op-backed-transitive)",
	);
});

test("every INTENTIONALLY_UNEXPOSED_WRITERS entry is well-formed (libraryFn + safeOp|reason)", () => {
	assert.ok(INTENTIONALLY_UNEXPOSED_WRITERS.length > 0, "allowlist is non-empty");
	for (const entry of INTENTIONALLY_UNEXPOSED_WRITERS) {
		assert.equal(typeof entry.libraryFn, "string");
		assert.ok(entry.libraryFn.length > 0, "libraryFn is a non-empty string");
		const hasSafeOp = typeof entry.safeOp === "string" && entry.safeOp.length > 0;
		const hasReason = typeof entry.reason === "string" && entry.reason.length > 0;
		assert.ok(hasSafeOp || hasReason, `${entry.libraryFn} carries at least one of safeOp / reason`);
	}
});

test("writeConfig is allowlisted (intentionally-unexposed) while writeRelations is NOT (op-backed-transitive)", () => {
	const names = INTENTIONALLY_UNEXPOSED_WRITERS.map((e) => e.libraryFn);
	// writeConfig: no DIRECT wholesale-config op; the scoped amend-config supersedes it.
	const writeConfig = INTENTIONALLY_UNEXPOSED_WRITERS.find((e) => e.libraryFn === "writeConfig");
	assert.ok(writeConfig, "writeConfig is on the allowlist");
	assert.equal(writeConfig.safeOp, "amend-config", "writeConfig points at the scoped amend-config surface");
	// writeRelations: reached transitively by the relation ops via the *ByRef
	// porcelain → NOT on the allowlist (op-backed-transitive, not unexposed).
	assert.ok(!names.includes("writeRelations"), "writeRelations is not allowlisted (it is op-backed-transitive)");
});
