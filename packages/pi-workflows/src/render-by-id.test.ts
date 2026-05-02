/**
 * Tests for the `renderItemById` composition helper (pi-workflows v0.24.0).
 *
 * Coverage:
 *   - happy path: known DEC- ID renders through bundled render_decision macro
 *   - resolver miss: unknown ID returns `[not-found: <id>]`
 *   - registry miss: known ID with no per-item macro returns
 *     `[unrendered: <kind>/<id>]`
 *   - depth threading: depth=0 emits bare cross-refs, depth=1 inlines them
 *   - cycle detection: self-referencing supersedes chain terminates with
 *     `[cycle: <id>]` rather than infinite-loop
 */

import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { renderItemById } from "./render-by-id.js";

function tmpDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "render-by-id-test-"));
}

function seedDecisions(cwd: string, decisions: Array<Record<string, unknown>>): void {
	const projectDir = path.join(cwd, ".project");
	fs.mkdirSync(projectDir, { recursive: true });
	fs.writeFileSync(path.join(projectDir, "decisions.json"), JSON.stringify({ decisions }));
}

function seedIssues(cwd: string, issues: Array<Record<string, unknown>>): void {
	const projectDir = path.join(cwd, ".project");
	fs.mkdirSync(projectDir, { recursive: true });
	fs.writeFileSync(path.join(projectDir, "issues.json"), JSON.stringify({ issues }));
}

function makeFullDecision(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
	return {
		id: "DEC-0001",
		title: "Test decision title",
		status: "enacted",
		context: "context body",
		decision: "decision body",
		consequences: ["c1", "c2"],
		created_by: "agent",
		created_at: "2026-05-02T00:00:00Z",
		related_findings: ["issue-001"],
		...overrides,
	};
}

describe("renderItemById helper", () => {
	it("happy path: renders a DEC- item through the bundled render_decision macro", (t) => {
		const cwd = tmpDir();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		seedDecisions(cwd, [makeFullDecision()]);

		const out = renderItemById(cwd, "DEC-0001", 0);
		assert.match(out, /Test decision title/);
		assert.match(out, /Status: enacted/);
		assert.match(out, /context body/);
	});

	it("resolver miss returns [not-found: <id>]", (t) => {
		const cwd = tmpDir();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		seedDecisions(cwd, [makeFullDecision()]);

		const out = renderItemById(cwd, "DEC-9999", 0);
		assert.strictEqual(out, "[not-found: DEC-9999]");
	});

	it("depth=0 emits bare cross-reference IDs, no resolution", (t) => {
		const cwd = tmpDir();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		seedDecisions(cwd, [
			makeFullDecision({
				supersedes: ["DEC-0002"],
			}),
			{
				id: "DEC-0002",
				title: "Older decision title",
				status: "enacted",
				context: "older context",
				decision: "older decision",
				consequences: ["x"],
				created_by: "agent",
				created_at: "2026-04-30T00:00:00Z",
				related_findings: ["issue-001"],
			},
		]);

		const out = renderItemById(cwd, "DEC-0001", 0);
		assert.match(out, /\bDEC-0002\b/, "depth=0 should render bare DEC-0002 reference");
		assert.doesNotMatch(out, /Older decision title/, "depth=0 must NOT inline DEC-0002 body");
	});

	it("depth=1 inlines a supersedes chain through render_recursive", (t) => {
		const cwd = tmpDir();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		seedDecisions(cwd, [
			makeFullDecision({
				supersedes: ["DEC-0002"],
			}),
			{
				id: "DEC-0002",
				title: "Older decision title",
				status: "enacted",
				context: "older context",
				decision: "older decision body",
				consequences: ["x"],
				created_by: "agent",
				created_at: "2026-04-30T00:00:00Z",
				related_findings: ["issue-001"],
			},
		]);

		const out = renderItemById(cwd, "DEC-0001", 1);
		assert.match(out, /Older decision title/, "depth=1 should inline DEC-0002 body via supersedes");
	});

	it("cycle detection terminates self-referencing supersedes with [cycle: <id>]", (t) => {
		const cwd = tmpDir();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		seedDecisions(cwd, [
			makeFullDecision({
				// Pathological self-supersede — without cycle detection the
				// recursion would either stack-overflow or expand exponentially.
				supersedes: ["DEC-0001"],
			}),
		]);

		const out = renderItemById(cwd, "DEC-0001", 5);
		assert.match(out, /\[cycle: DEC-0001\]/, `expected cycle marker for self-supersede, got: ${out.slice(0, 200)}`);
	});

	it("registry miss for an indexed but un-macroed kind returns [unrendered: <kind>/<id>]", (t) => {
		// Seed a fixture that only has issues — there IS a render_issue macro
		// in the bundled set, so we synthesize a phantom kind by writing an
		// arbitrary block that the bundled templates don't have a macro for.
		const cwd = tmpDir();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

		const projectDir = path.join(cwd, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		// `unmacroed` is a block name we know has no items/<kind>.md in the
		// bundled templates; the resolver indexes its items but the registry
		// returns null on lookup.
		fs.writeFileSync(path.join(projectDir, "unmacroed.json"), JSON.stringify({ items: [{ id: "ID-001" }] }));

		const out = renderItemById(cwd, "ID-001", 0);
		assert.strictEqual(out, "[unrendered: unmacroed/ID-001]");
	});

	it("renders an issue ID via the bundled render_issue macro", (t) => {
		const cwd = tmpDir();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		seedIssues(cwd, [
			{
				id: "issue-001",
				title: "first issue",
				body: "issue body content",
				location: "x.ts:1",
				status: "open",
				category: "issue",
				priority: "high",
				package: "pi-project",
			},
		]);

		const out = renderItemById(cwd, "issue-001", 0);
		assert.match(out, /\*\*issue-001\*\*/);
		assert.match(out, /first issue/);
		assert.match(out, /issue body content/);
	});
});
