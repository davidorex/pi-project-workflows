/**
 * Tests for the cross-block ID resolver primitive: buildIdIndex and
 * resolveItemById. Covers per-prefix discovery, miss semantics, malformed
 * lookup, and the prefix-vs-block invariant that Plan 0's schema patterns
 * make unreachable through validated writes.
 *
 * Fixtures are written directly via fs to bypass AJV — the resolver's
 * invariant check is the test target, so writes that the production
 * surface would reject are intentional here.
 */

import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildIdIndex, type ItemLocation, resolveItemById } from "./project-sdk.js";

function makeTmpDir(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), `resolve-id-${prefix}-`));
}

/**
 * Provision a `.project/` directory with one item per prefixed block kind.
 * Each block uses its canonical array key (per the live schemas). All IDs
 * conform to their corresponding ID_PREFIX_TO_BLOCK entry so buildIdIndex
 * does not throw the prefix-vs-block invariant.
 */
function seedFullFixture(tmpDir: string): void {
	const projectDir = path.join(tmpDir, ".project");
	fs.mkdirSync(projectDir, { recursive: true });

	fs.writeFileSync(
		path.join(projectDir, "decisions.json"),
		JSON.stringify({
			decisions: [{ id: "DEC-0001", title: "decide one", status: "enacted" }],
		}),
	);
	fs.writeFileSync(
		path.join(projectDir, "framework-gaps.json"),
		JSON.stringify({
			gaps: [{ id: "FGAP-001", title: "gap one" }],
		}),
	);
	fs.writeFileSync(
		path.join(projectDir, "research.json"),
		JSON.stringify({
			research: [{ id: "R-0001", title: "research one" }],
		}),
	);
	fs.writeFileSync(
		path.join(projectDir, "spec-reviews.json"),
		JSON.stringify({
			reviews: [{ id: "REVIEW-001", title: "review one" }],
		}),
	);
	fs.writeFileSync(
		path.join(projectDir, "features.json"),
		JSON.stringify({
			features: [{ id: "FEAT-001", title: "feature one" }],
		}),
	);
	fs.writeFileSync(
		path.join(projectDir, "layer-plans.json"),
		JSON.stringify({
			plans: [{ id: "PLAN-001", title: "plan one" }],
		}),
	);
	fs.writeFileSync(
		path.join(projectDir, "tasks.json"),
		JSON.stringify({
			tasks: [{ id: "TASK-001", description: "task one", status: "planned" }],
		}),
	);
	fs.writeFileSync(
		path.join(projectDir, "requirements.json"),
		JSON.stringify({
			requirements: [{ id: "REQ-001", title: "requirement one" }],
		}),
	);
	fs.writeFileSync(
		path.join(projectDir, "verification.json"),
		JSON.stringify({
			verifications: [{ id: "VER-001", target: "TASK-001", target_type: "task", status: "passed", method: "test" }],
		}),
	);
	fs.writeFileSync(
		path.join(projectDir, "rationale.json"),
		JSON.stringify({
			rationales: [{ id: "RAT-001", rationale: "rationale one" }],
		}),
	);
	fs.writeFileSync(
		path.join(projectDir, "issues.json"),
		JSON.stringify({
			issues: [{ id: "issue-001", title: "issue one", status: "open" }],
		}),
	);
}

describe("resolveItemById — per-prefix block discovery", () => {
	it("resolves an ID from each prefixed block kind", (t) => {
		const tmpDir = makeTmpDir("each-kind");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		seedFullFixture(tmpDir);

		const cases: Array<{ id: string; block: string; arrayKey: string }> = [
			{ id: "DEC-0001", block: "decisions", arrayKey: "decisions" },
			{ id: "FGAP-001", block: "framework-gaps", arrayKey: "gaps" },
			{ id: "R-0001", block: "research", arrayKey: "research" },
			{ id: "REVIEW-001", block: "spec-reviews", arrayKey: "reviews" },
			{ id: "FEAT-001", block: "features", arrayKey: "features" },
			{ id: "PLAN-001", block: "layer-plans", arrayKey: "plans" },
			{ id: "TASK-001", block: "tasks", arrayKey: "tasks" },
			{ id: "REQ-001", block: "requirements", arrayKey: "requirements" },
			{ id: "VER-001", block: "verification", arrayKey: "verifications" },
			{ id: "RAT-001", block: "rationale", arrayKey: "rationales" },
			{ id: "issue-001", block: "issues", arrayKey: "issues" },
		];

		for (const c of cases) {
			const loc = resolveItemById(tmpDir, c.id);
			assert.ok(loc, `expected to resolve ${c.id}`);
			assert.strictEqual(loc!.block, c.block, `${c.id} should live in block '${c.block}'`);
			assert.strictEqual(loc!.arrayKey, c.arrayKey, `${c.id} should be under arrayKey '${c.arrayKey}'`);
			assert.strictEqual(loc!.item.id, c.id, `${c.id} item payload should carry the same id`);
		}
	});
});

describe("resolveItemById — miss semantics", () => {
	it("returns null for a known-prefix ID with no matching item", (t) => {
		const tmpDir = makeTmpDir("missing-id");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		fs.writeFileSync(path.join(projectDir, "tasks.json"), JSON.stringify({ tasks: [] }));

		const loc = resolveItemById(tmpDir, "TASK-9999");
		assert.strictEqual(loc, null);
	});

	it("returns null for a malformed ID that matches no prefix and no entry", (t) => {
		const tmpDir = makeTmpDir("malformed-id");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		seedFullFixture(tmpDir);

		const loc = resolveItemById(tmpDir, "not-a-real-id");
		assert.strictEqual(loc, null);
	});
});

describe("buildIdIndex — prefix-vs-block invariant", () => {
	it("throws when a prefixed ID lives in the wrong block", (t) => {
		const tmpDir = makeTmpDir("prefix-violation");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		// Direct-fs write: stuff a DEC- ID into the tasks block. Plan 0's
		// schema patterns would reject this through the validated write
		// surface; here we bypass AJV to exercise the resolver's invariant.
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({
				tasks: [{ id: "DEC-0042", description: "imposter", status: "planned" }],
			}),
		);

		assert.throws(
			() => buildIdIndex(tmpDir),
			(err: Error) => {
				assert.ok(err.message.includes("DEC-0042"), "error must name the offending ID");
				assert.ok(err.message.includes("tasks"), "error must name the block it was found in");
				assert.ok(err.message.includes("decisions"), "error must name the expected block");
				return true;
			},
		);
	});
});

describe("buildIdIndex — return shape and reuse", () => {
	it("returns a Map yielding consistent results across multiple lookups", (t) => {
		const tmpDir = makeTmpDir("map-reuse");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		seedFullFixture(tmpDir);

		const idx = buildIdIndex(tmpDir);
		assert.ok(idx instanceof Map, "buildIdIndex must return a Map");

		const a1 = idx.get("DEC-0001");
		const a2 = idx.get("DEC-0001");
		const b1 = idx.get("FEAT-001");
		const b2 = idx.get("FEAT-001");

		assert.ok(a1, "first DEC-0001 lookup");
		assert.strictEqual(a1, a2, "repeated lookup of the same ID returns the same ItemLocation reference");
		assert.ok(b1, "first FEAT-001 lookup");
		assert.strictEqual(b1, b2, "repeated lookup of FEAT-001 returns the same ItemLocation reference");

		// And the ItemLocation surface really is { block, arrayKey, item }.
		const probe: ItemLocation = a1 as ItemLocation;
		assert.strictEqual(typeof probe.block, "string");
		assert.strictEqual(typeof probe.arrayKey, "string");
		assert.strictEqual(typeof probe.item, "object");
	});
});
