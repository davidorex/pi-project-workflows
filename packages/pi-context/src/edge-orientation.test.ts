/**
 * Edge-orientation metadata regression locks.
 *
 * Covers the ONE source of truth (role_direction) end to end at the catalog +
 * helper + property level, complementing the per-consumer tests
 * (context-sdk.test / roadmap-plan.test / promote-item.test / edge-write.test /
 * lens-view.test):
 *   - the pure primaryEndpoint / counterEndpoint helpers,
 *   - the packaged catalog's exact 17-relation role_direction assignment
 *     (drift lock on the reverse-engineered values),
 *   - the no-inverted-edge scan: for each role-bearing DISJOINT relation, a
 *     correctly-oriented stored edge's PRIMARY endpoint resolves to a block on the
 *     declared primary side (and an inverted edge is caught), and
 *   - the config schema accepting the role_direction enum (additive-optional).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { counterEndpoint, type Edge, primaryEndpoint } from "./context.js";
import { validateFromFile } from "./schema-validator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONCEPTION = path.resolve(__dirname, "..", "samples", "conception.json");
const CONFIG_SCHEMA = path.resolve(__dirname, "..", "schemas", "config.schema.json");

interface RelationTypeShape {
	canonical_id: string;
	source_kinds?: string[];
	target_kinds?: string[];
	role_direction?: "as_parent" | "as_child";
}

function catalogRelations(): RelationTypeShape[] {
	return JSON.parse(fs.readFileSync(CONCEPTION, "utf-8")).relation_types as RelationTypeShape[];
}

// The reverse-engineered assignment (the catalog's committed truth). Any drift
// here is a deliberate re-scope, not an accident — this lock forces the change to
// be intentional.
const EXPECTED_ROLE_DIRECTION: Record<string, "as_parent" | "as_child"> = {
	task_depends_on_task: "as_parent",
	feature_depends_on_item: "as_parent",
	story_depends_on_story: "as_parent",
	requirement_depends_on_requirement: "as_parent",
	milestone_precedes_milestone: "as_parent",
	decision_supersedes_decision: "as_parent",
	research_supersedes_research: "as_parent",
	feature_contains_story: "as_parent",
	story_includes_item: "as_parent",
	task_gated_by_item: "as_child",
	feature_gated_by_item: "as_child",
	story_gated_by_item: "as_child",
	decision_gated_by_item: "as_child",
	phase_positioned_in_milestone: "as_child",
	task_positioned_in_phase: "as_child",
	item_derived_from_item: "as_child",
	decision_derived_from_item: "as_child",
};

describe("primaryEndpoint / counterEndpoint helpers (FGAP-113)", () => {
	const edge: Edge = { parent: "P", child: "C", relation_type: "r" };

	it("as_parent → primary=parent, counter=child", () => {
		assert.equal(primaryEndpoint(edge, "as_parent"), "P");
		assert.equal(counterEndpoint(edge, "as_parent"), "C");
	});

	it("as_child → primary=child, counter=parent", () => {
		assert.equal(primaryEndpoint(edge, "as_child"), "C");
		assert.equal(counterEndpoint(edge, "as_child"), "P");
	});

	it("primary and counter are always complementary", () => {
		for (const dir of ["as_parent", "as_child"] as const) {
			assert.notEqual(primaryEndpoint(edge, dir), counterEndpoint(edge, dir));
		}
	});
});

describe("catalog role_direction assignment lock (FGAP-113)", () => {
	it("exactly the 17 role-consumer relations declare role_direction, with the expected values", () => {
		const declared: Record<string, string> = {};
		for (const r of catalogRelations()) {
			if (r.role_direction !== undefined) declared[r.canonical_id] = r.role_direction;
		}
		assert.deepEqual(declared, EXPECTED_ROLE_DIRECTION);
	});

	it("every role-less relation omits role_direction (presence-gated, not category-gated)", () => {
		for (const r of catalogRelations()) {
			if (!(r.canonical_id in EXPECTED_ROLE_DIRECTION)) {
				assert.equal(r.role_direction, undefined, `${r.canonical_id} must NOT declare role_direction`);
			}
		}
	});
});

describe("no-inverted-edge scan (FGAP-113)", () => {
	// The primary SIDE kinds under a role_direction: as_parent → the source
	// endpoint (edge.parent) kinds; as_child → the target endpoint (edge.child)
	// kinds. For a correctly-oriented edge the PRIMARY endpoint's block is on that
	// side; an inverted edge puts it on the counter side.
	function primarySideKinds(r: RelationTypeShape): string[] | undefined {
		return r.role_direction === "as_parent" ? r.source_kinds : r.target_kinds;
	}
	function counterSideKinds(r: RelationTypeShape): string[] | undefined {
		return r.role_direction === "as_parent" ? r.target_kinds : r.source_kinds;
	}

	it("every role-bearing DISJOINT catalog relation has non-empty, non-overlapping primary/counter kind sides", () => {
		for (const r of catalogRelations()) {
			if (r.role_direction === undefined) continue;
			const s = r.source_kinds;
			const t = r.target_kinds;
			if (!s || !t || s.includes("*") || t.includes("*")) continue; // not disjoint / wildcard
			if (s.some((k) => t.includes(k))) continue; // same-kind overlap — un-disambiguatable, skip
			const primary = primarySideKinds(r);
			const counter = counterSideKinds(r);
			assert.ok(primary && primary.length > 0, `${r.canonical_id}: primary side kinds present`);
			assert.ok(counter && counter.length > 0, `${r.canonical_id}: counter side kinds present`);
			assert.ok(
				!primary!.some((k) => counter!.includes(k)),
				`${r.canonical_id}: primary/counter kind sides must be disjoint`,
			);
		}
	});

	it("a correctly-oriented stored edge resolves its PRIMARY endpoint to a primary-side kind; an inverted edge does not", () => {
		// phase_positioned_in_milestone: source=phase, target=milestone, as_child →
		// primary=child=milestone (target side). id→kind map stands in for a resolver.
		const r = catalogRelations().find((x) => x.canonical_id === "phase_positioned_in_milestone");
		assert.ok(r?.role_direction === "as_child");
		const kindOf: Record<string, string> = { "PHASE-1": "phase", "MILE-1": "milestone" };
		const primaryKinds = primarySideKinds(r); // target_kinds = ["milestone"]

		// Correctly oriented: parent=phase (member), child=milestone (container/primary).
		const good: Edge = { parent: "PHASE-1", child: "MILE-1", relation_type: r.canonical_id };
		const goodPrimaryKind = kindOf[primaryEndpoint(good, r.role_direction) as string];
		assert.ok(primaryKinds?.includes(goodPrimaryKind), "primary endpoint of a correct edge is on the primary side");

		// Inverted: primary endpoint (child) would be a phase — NOT a milestone.
		const inverted: Edge = { parent: "MILE-1", child: "PHASE-1", relation_type: r.canonical_id };
		const badPrimaryKind = kindOf[primaryEndpoint(inverted, r.role_direction) as string];
		assert.ok(
			!primaryKinds?.includes(badPrimaryKind),
			"primary endpoint of an inverted edge is NOT on the primary side",
		);
	});
});

describe("config schema accepts role_direction (additive-optional, 1.8.0)", () => {
	function cfg(rt: Record<string, unknown>): Record<string, unknown> {
		return {
			schema_version: "1.8.0",
			block_kinds: [],
			relation_types: [{ canonical_id: "r", display_name: "r", category: "ordering", ...rt }],
		};
	}

	it("accepts as_parent / as_child; omitting the field is valid", () => {
		assert.doesNotThrow(() => validateFromFile(CONFIG_SCHEMA, cfg({ role_direction: "as_parent" }), "cfg"));
		assert.doesNotThrow(() => validateFromFile(CONFIG_SCHEMA, cfg({ role_direction: "as_child" }), "cfg"));
		assert.doesNotThrow(() => validateFromFile(CONFIG_SCHEMA, cfg({}), "cfg"));
	});

	it("rejects an out-of-enum role_direction value", () => {
		assert.throws(() => validateFromFile(CONFIG_SCHEMA, cfg({ role_direction: "prerequisite" }), "cfg"));
	});
});
