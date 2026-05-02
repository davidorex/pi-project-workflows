/**
 * Per-item macro budget-enforcement wiring tests (v0.24.0).
 *
 * For each of the 14 bundled per-item macros, asserts that an over-budget
 * annotated field renders with the `[…truncated to budget]` marker. This is
 * the wiring test — the enforcement primitive itself is tested by
 * pi-jit-agents/budget-enforcer.test.ts; this file proves the macros call
 * the global on the right fields with the right shorthand paths.
 *
 * Test strategy: scaffold a minimal `.project/schemas/<kind>.schema.json`
 * with a tight budget on the field under test, then render the macro through
 * a Nunjucks env that has the real `enforceBudget` global registered (via
 * the `registerEnforceBudgetReal` helper). One overflow case per macro;
 * negative happy-path coverage is provided by each macro's existing tests.
 */
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { schemaPath, schemasDir } from "@davidorex/pi-project/project-dir";
import nunjucks from "nunjucks";
import { registerEnforceBudgetReal, TEMPLATES_DIR } from "./test-helpers.js";

function tmpDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "macro-budget-test-"));
}

function seedSchema(cwd: string, name: string, schema: object): void {
	fs.mkdirSync(schemasDir(cwd), { recursive: true });
	fs.writeFileSync(schemaPath(cwd, name), JSON.stringify(schema));
}

function makeEnv(cwd: string): nunjucks.Environment {
	const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(TEMPLATES_DIR), {
		autoescape: false,
		throwOnUndefined: false,
	});
	env.addGlobal("resolve", () => null);
	env.addGlobal("render_recursive", () => "");
	registerEnforceBudgetReal(env, cwd);
	return env;
}

const LONG_TEXT = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu";

const TIGHT_FIELD_SCHEMA = (
	rootArrayKey: string,
	innerProps: Record<string, { type: string; "x-prompt-budget"?: object }>,
): object => ({
	type: "object",
	properties: {
		[rootArrayKey]: {
			type: "array",
			items: { type: "object", properties: innerProps },
		},
	},
});

const TIGHT_BUDGET = { tokens: 5, words: 5 };

describe("per-item macro budget enforcement wiring", () => {
	it("decisions: dec.context truncates when over budget", () => {
		const cwd = tmpDir();
		seedSchema(
			cwd,
			"decisions",
			TIGHT_FIELD_SCHEMA("decisions", { context: { type: "string", "x-prompt-budget": TIGHT_BUDGET } }),
		);
		const env = makeEnv(cwd);
		const dec = {
			id: "DEC-0001",
			title: "t",
			status: "enacted",
			context: LONG_TEXT,
			decision: "d",
			consequences: ["c"],
			created_by: "agent",
			created_at: "2026-05-02T00:00:00Z",
		};
		const out = env.renderString(
			`{% from "items/decisions.md" import render_decision %}{{ render_decision(dec, 0) }}`,
			{ dec, depth: 0 },
		);
		assert.match(out, /\[…truncated to budget\]/, `expected truncation marker, got: ${out}`);
	});

	it("features: feat.description truncates when over budget", () => {
		const cwd = tmpDir();
		seedSchema(
			cwd,
			"features",
			TIGHT_FIELD_SCHEMA("features", { description: { type: "string", "x-prompt-budget": TIGHT_BUDGET } }),
		);
		const env = makeEnv(cwd);
		const feat = {
			id: "FEAT-001",
			title: "t",
			status: "proposed",
			layer: "L3",
			description: LONG_TEXT,
			created_by: "agent",
			created_at: "2026-05-02T00:00:00Z",
		};
		const out = env.renderString(`{% from "items/features.md" import render_feature %}{{ render_feature(feat, 0) }}`, {
			feat,
			depth: 0,
		});
		assert.match(out, /\[…truncated to budget\]/);
	});

	it("framework-gaps: gap.description truncates when over budget", () => {
		const cwd = tmpDir();
		seedSchema(
			cwd,
			"framework-gaps",
			TIGHT_FIELD_SCHEMA("gaps", { description: { type: "string", "x-prompt-budget": TIGHT_BUDGET } }),
		);
		const env = makeEnv(cwd);
		const gap = {
			id: "FGAP-001",
			title: "t",
			status: "open",
			package: "pi-project",
			description: LONG_TEXT,
			impact: "x",
			proposed_resolution: "y",
			created_by: "agent",
			created_at: "2026-05-02T00:00:00Z",
		};
		const out = env.renderString(
			`{% from "items/framework-gaps.md" import render_framework_gap %}{{ render_framework_gap(gap, 0) }}`,
			{ gap, depth: 0 },
		);
		assert.match(out, /\[…truncated to budget\]/);
	});

	it("layer-plans: plan.description truncates when over budget", () => {
		const cwd = tmpDir();
		seedSchema(
			cwd,
			"layer-plans",
			TIGHT_FIELD_SCHEMA("plans", { description: { type: "string", "x-prompt-budget": TIGHT_BUDGET } }),
		);
		const env = makeEnv(cwd);
		const plan = {
			id: "PLAN-001",
			title: "t",
			status: "draft",
			model: "m",
			description: LONG_TEXT,
			layers: [],
			migration_phases: [],
			created_by: "agent",
			created_at: "2026-05-02T00:00:00Z",
		};
		const out = env.renderString(
			`{% from "items/layer-plans.md" import render_layer_plan %}{{ render_layer_plan(plan, 0) }}`,
			{ plan, depth: 0 },
		);
		assert.match(out, /\[…truncated to budget\]/);
	});

	it("research: r.findings_summary truncates when over budget", () => {
		const cwd = tmpDir();
		seedSchema(
			cwd,
			"research",
			TIGHT_FIELD_SCHEMA("research", { findings_summary: { type: "string", "x-prompt-budget": TIGHT_BUDGET } }),
		);
		const env = makeEnv(cwd);
		const r = {
			id: "R-0001",
			title: "t",
			status: "complete",
			layer: "L2",
			type: "comparative",
			question: "q",
			method: "m",
			findings_summary: LONG_TEXT,
			created_by: "agent",
			created_at: "2026-05-02T00:00:00Z",
		};
		const out = env.renderString(`{% from "items/research.md" import render_research %}{{ render_research(r, 0) }}`, {
			r,
			depth: 0,
		});
		assert.match(out, /\[…truncated to budget\]/);
	});

	it("spec-reviews: rev.method truncates when over budget", () => {
		const cwd = tmpDir();
		seedSchema(
			cwd,
			"spec-reviews",
			TIGHT_FIELD_SCHEMA("reviews", { method: { type: "string", "x-prompt-budget": TIGHT_BUDGET } }),
		);
		const env = makeEnv(cwd);
		const rev = {
			id: "REVIEW-001",
			target: "docs/x.md",
			status: "complete",
			created_by: "agent",
			created_at: "2026-05-02T00:00:00Z",
			method: LONG_TEXT,
			findings: [],
		};
		const out = env.renderString(
			`{% from "items/spec-reviews.md" import render_spec_review %}{{ render_spec_review(rev, 0) }}`,
			{ rev, depth: 0 },
		);
		assert.match(out, /\[…truncated to budget\]/);
	});

	it("domain: e.content truncates when over budget", () => {
		const cwd = tmpDir();
		seedSchema(
			cwd,
			"domain",
			TIGHT_FIELD_SCHEMA("entries", { content: { type: "string", "x-prompt-budget": TIGHT_BUDGET } }),
		);
		const env = makeEnv(cwd);
		const e = { id: "D-001", title: "t", content: LONG_TEXT, category: "research" };
		const out = env.renderString(
			`{% from "items/domain.md" import render_domain_entry %}{{ render_domain_entry(e, 0) }}`,
			{ e, depth: 0 },
		);
		assert.match(out, /\[…truncated to budget\]/);
	});

	it("tasks: t.description truncates when over budget", () => {
		const cwd = tmpDir();
		seedSchema(
			cwd,
			"tasks",
			TIGHT_FIELD_SCHEMA("tasks", { description: { type: "string", "x-prompt-budget": TIGHT_BUDGET } }),
		);
		const env = makeEnv(cwd);
		const t = { id: "TASK-001", description: LONG_TEXT, status: "planned" };
		const out = env.renderString(`{% from "items/tasks.md" import render_task %}{{ render_task(t, 0) }}`, {
			t,
			depth: 0,
		});
		assert.match(out, /\[…truncated to budget\]/);
	});

	it("requirements: req.description truncates when over budget", () => {
		const cwd = tmpDir();
		seedSchema(
			cwd,
			"requirements",
			TIGHT_FIELD_SCHEMA("requirements", { description: { type: "string", "x-prompt-budget": TIGHT_BUDGET } }),
		);
		const env = makeEnv(cwd);
		const req = {
			id: "REQ-001",
			description: LONG_TEXT,
			type: "functional",
			status: "proposed",
			priority: "must",
		};
		const out = env.renderString(
			`{% from "items/requirements.md" import render_requirement %}{{ render_requirement(req, 0) }}`,
			{ req, depth: 0 },
		);
		assert.match(out, /\[…truncated to budget\]/);
	});

	it("architecture: m.responsibility truncates when over budget", () => {
		const cwd = tmpDir();
		seedSchema(
			cwd,
			"architecture",
			TIGHT_FIELD_SCHEMA("modules", { responsibility: { type: "string", "x-prompt-budget": TIGHT_BUDGET } }),
		);
		const env = makeEnv(cwd);
		const a = { modules: [{ name: "mod1", file: "x.ts", responsibility: LONG_TEXT }] };
		const out = env.renderString(
			`{% from "items/architecture.md" import render_architecture_item %}{{ render_architecture_item(a, 0) }}`,
			{ a, depth: 0 },
		);
		assert.match(out, /\[…truncated to budget\]/);
	});

	it("conformance-reference: principle.description truncates when over budget", () => {
		const cwd = tmpDir();
		seedSchema(
			cwd,
			"conformance-reference",
			TIGHT_FIELD_SCHEMA("principles", { description: { type: "string", "x-prompt-budget": TIGHT_BUDGET } }),
		);
		const env = makeEnv(cwd);
		const p = { id: "P1", name: "n", description: LONG_TEXT, rules: [{ id: "P1.1", rule: "r" }] };
		const out = env.renderString(
			`{% from "items/conformance.md" import render_conformance_principle %}{{ render_conformance_principle(p, 0) }}`,
			{ p, depth: 0 },
		);
		assert.match(out, /\[…truncated to budget\]/);
	});

	it("conventions: rule.description truncates when over budget", () => {
		const cwd = tmpDir();
		seedSchema(
			cwd,
			"conventions",
			TIGHT_FIELD_SCHEMA("rules", { description: { type: "string", "x-prompt-budget": TIGHT_BUDGET } }),
		);
		const env = makeEnv(cwd);
		const rule = { id: "R-001", description: LONG_TEXT, enforcement: "lint", severity: "warning" };
		const out = env.renderString(
			`{% from "items/conventions.md" import render_convention %}{{ render_convention(rule, 0) }}`,
			{ rule, depth: 0 },
		);
		assert.match(out, /\[…truncated to budget\]/);
	});

	it("issues: i.body truncates when over budget", () => {
		const cwd = tmpDir();
		seedSchema(
			cwd,
			"issues",
			TIGHT_FIELD_SCHEMA("issues", { body: { type: "string", "x-prompt-budget": TIGHT_BUDGET } }),
		);
		const env = makeEnv(cwd);
		const i = {
			id: "issue-001",
			title: "t",
			body: LONG_TEXT,
			location: "x.ts:1",
			status: "open",
			category: "issue",
			priority: "low",
			package: "pi-project",
		};
		const out = env.renderString(`{% from "items/issues.md" import render_issue %}{{ render_issue(i, 0) }}`, {
			i,
			depth: 0,
		});
		assert.match(out, /\[…truncated to budget\]/);
	});

	it("project: p.description truncates when over budget", () => {
		const cwd = tmpDir();
		// project schema is singleton (no array root) — annotate `description` directly.
		seedSchema(cwd, "project", {
			type: "object",
			properties: { description: { type: "string", "x-prompt-budget": TIGHT_BUDGET } },
		});
		const env = makeEnv(cwd);
		const p = { name: "n", description: LONG_TEXT, core_value: "c" };
		const out = env.renderString(
			`{% from "items/project.md" import render_project_item %}{{ render_project_item(p, 0) }}`,
			{ p, depth: 0 },
		);
		assert.match(out, /\[…truncated to budget\]/);
	});
});
