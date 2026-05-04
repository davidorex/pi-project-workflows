/**
 * Substrate-schema round-trip validation: roadmap.schema.json,
 * plan.schema.json, the LensSpec composition extension on
 * config.schema.json, and the ordinal field extension on
 * relations.schema.json. Tests ship in pi-project so block-api's
 * schema-validator is the validator under test.
 *
 * Per DEC-0012 (edges-only authoring): roadmap phases items and
 * plan items MUST NOT carry depends_on fields. Negative cases
 * verify the schemas reject those shapes.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { ValidationError, validateFromFile } from "./schema-validator.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(HERE, "..");
const ROADMAP_SCHEMA = path.join(PKG_ROOT, "registry", "schemas", "roadmap.schema.json");
const PLAN_SCHEMA = path.join(PKG_ROOT, "registry", "schemas", "plan.schema.json");
const CONFIG_SCHEMA = path.join(PKG_ROOT, "schemas", "config.schema.json");
const RELATIONS_SCHEMA = path.join(PKG_ROOT, "schemas", "relations.schema.json");

describe("roadmap.schema.json", () => {
	it("validates a minimal roadmap with one phase", () => {
		const data = {
			roadmaps: [
				{
					id: "ROADMAP-001",
					title: "Substrate roadmap",
					phases: [{ id: "PHASE-FOUNDATION", name: "Foundation", lens: "by-package" }],
				},
			],
		};
		validateFromFile(ROADMAP_SCHEMA, data, "roadmap fixture");
	});

	it("validates a roadmap with milestones + exit_criteria", () => {
		const data = {
			roadmaps: [
				{
					id: "ROADMAP-002",
					title: "Comprehensive",
					description: "All optional fields populated",
					status: "active",
					phases: [
						{
							id: "PHASE-FOUNDATION",
							name: "Foundation",
							description: "Core substrate",
							lens: "by-package",
							milestone: "MILESTONE-FOUNDATION-COMPLETE",
							exit_criteria: ["All foundation tests pass", "Schemas land in registry"],
						},
					],
					milestones: [
						{
							id: "MILESTONE-FOUNDATION-COMPLETE",
							name: "Foundation complete",
							criterion: "All foundation tests pass",
							evidence_block: "verification",
							evidence_query: { target: "PHASE-FOUNDATION", status: "passed" },
						},
					],
				},
			],
		};
		validateFromFile(ROADMAP_SCHEMA, data, "comprehensive roadmap fixture");
	});

	it("REJECTS a phase with depends_on field (per DEC-0012 edges-only authoring)", () => {
		const data = {
			roadmaps: [
				{
					id: "ROADMAP-003",
					title: "Bad",
					phases: [
						{
							id: "PHASE-A",
							name: "A",
							lens: "x",
							depends_on: ["PHASE-B"],
						},
					],
				},
			],
		};
		assert.throws(() => validateFromFile(ROADMAP_SCHEMA, data, "phase with depends_on"), ValidationError);
	});

	it("REJECTS a roadmap id violating the ROADMAP-NNN pattern", () => {
		const data = { roadmaps: [{ id: "roadmap-1", title: "Bad", phases: [] }] };
		assert.throws(() => validateFromFile(ROADMAP_SCHEMA, data, "bad id pattern"), ValidationError);
	});

	it("REJECTS a phase missing the required lens field", () => {
		const data = { roadmaps: [{ id: "ROADMAP-004", title: "Bad", phases: [{ id: "PHASE-A", name: "A" }] }] };
		assert.throws(() => validateFromFile(ROADMAP_SCHEMA, data, "phase missing lens"), ValidationError);
	});
});

describe("plan.schema.json", () => {
	it("validates a minimal plan with one item", () => {
		const data = { plans: [{ id: "PLAN-001", title: "Implementation plan", items: [{ ref: "issue-081" }] }] };
		validateFromFile(PLAN_SCHEMA, data, "plan fixture");
	});

	it("validates a plan with optional roadmap + phase + assignee + note", () => {
		const data = {
			plans: [
				{
					id: "PLAN-002",
					title: "Phase 1 plan",
					description: "Tasks for foundation phase",
					status: "active",
					roadmap: "ROADMAP-001",
					phase: "PHASE-FOUNDATION",
					items: [{ ref: "issue-081", assignee: "user", note: "Schema landing first" }, { ref: "issue-082" }],
				},
			],
		};
		validateFromFile(PLAN_SCHEMA, data, "comprehensive plan fixture");
	});

	it("REJECTS a plan item with depends_on field (per DEC-0012 edges-only authoring)", () => {
		const data = {
			plans: [
				{
					id: "PLAN-003",
					title: "Bad",
					items: [{ ref: "issue-A", depends_on: ["issue-B"] }],
				},
			],
		};
		assert.throws(() => validateFromFile(PLAN_SCHEMA, data, "plan item with depends_on"), ValidationError);
	});

	it("REJECTS a plan id violating the PLAN-NNN pattern", () => {
		const data = { plans: [{ id: "plan-1", title: "Bad", items: [] }] };
		assert.throws(() => validateFromFile(PLAN_SCHEMA, data, "bad plan id pattern"), ValidationError);
	});

	it("REJECTS an item missing the required ref field", () => {
		const data = { plans: [{ id: "PLAN-004", title: "Bad", items: [{ assignee: "x" }] }] };
		assert.throws(() => validateFromFile(PLAN_SCHEMA, data, "item missing ref"), ValidationError);
	});
});

describe("config.schema.json — LensSpec composition extension", () => {
	it("validates a target lens (existing shape, kind defaults to target)", () => {
		const data = {
			schema_version: "0.2.0",
			root: ".project",
			lenses: [
				{
					id: "by-package",
					target: "issues",
					relation_type: "package-membership",
					derived_from_field: "package",
					bins: ["pi-project"],
				},
			],
		};
		validateFromFile(CONFIG_SCHEMA, data, "target lens fixture");
	});

	it("validates an explicit kind=target lens", () => {
		const data = {
			schema_version: "0.2.0",
			root: ".project",
			lenses: [
				{
					id: "x",
					kind: "target",
					target: "issues",
					relation_type: "x-rel",
					derived_from_field: null,
					bins: ["a"],
				},
			],
		};
		validateFromFile(CONFIG_SCHEMA, data, "explicit kind=target lens fixture");
	});

	it("validates a composition lens with a {lens} member", () => {
		const data = {
			schema_version: "0.2.0",
			root: ".project",
			lenses: [
				{
					id: "roadmap-foundation",
					kind: "composition",
					targets: ["issues", "decisions"],
					members: [{ lens: "by-package" }],
					bins: ["foundation"],
				},
			],
		};
		validateFromFile(CONFIG_SCHEMA, data, "composition lens with sub-lens member");
	});

	it("validates a composition lens with a {from, where} member", () => {
		const data = {
			schema_version: "0.2.0",
			root: ".project",
			lenses: [
				{
					id: "open-issues",
					kind: "composition",
					targets: ["issues"],
					members: [{ from: "issues", where: { status: "open" } }],
					bins: ["all"],
				},
			],
		};
		validateFromFile(CONFIG_SCHEMA, data, "composition lens with field-equality member");
	});

	it("REJECTS a member with both lens AND from (oneOf-mutual-exclusion)", () => {
		const data = {
			schema_version: "0.2.0",
			root: ".project",
			lenses: [
				{
					id: "x",
					kind: "composition",
					targets: ["issues"],
					members: [{ lens: "y", from: "issues" }],
					bins: ["a"],
				},
			],
		};
		assert.throws(() => validateFromFile(CONFIG_SCHEMA, data, "member with lens+from"), ValidationError);
	});

	it("REJECTS unknown kind value", () => {
		const data = {
			schema_version: "0.2.0",
			root: ".project",
			lenses: [{ id: "x", kind: "invalid", target: "issues", relation_type: "r", bins: [] }],
		};
		assert.throws(() => validateFromFile(CONFIG_SCHEMA, data, "unknown kind"), ValidationError);
	});
});

describe("relations.schema.json — ordinal field extension", () => {
	it("validates an edge with ordinal", () => {
		const data = { edges: [{ parent: "PHASE-A", child: "issue-001", relation_type: "phase_member", ordinal: 1 }] };
		validateFromFile(RELATIONS_SCHEMA, data, "edge with ordinal");
	});

	it("validates an edge without ordinal (back-compat)", () => {
		const data = { edges: [{ parent: "PHASE-A", child: "issue-001", relation_type: "phase_member" }] };
		validateFromFile(RELATIONS_SCHEMA, data, "edge without ordinal");
	});

	it("REJECTS an edge with non-integer ordinal", () => {
		const data = {
			edges: [{ parent: "PHASE-A", child: "issue-001", relation_type: "phase_member", ordinal: "first" }],
		};
		assert.throws(() => validateFromFile(RELATIONS_SCHEMA, data, "string ordinal"), ValidationError);
	});
});
