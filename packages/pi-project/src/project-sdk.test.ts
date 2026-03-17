/**
 * Tests for project-sdk: projectState, availableBlocks, availableSchemas,
 * findAppendableBlocks. Migrated from pi-workflows workflow-sdk.test.ts.
 */

import assert from "node:assert";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { availableBlocks, availableSchemas, findAppendableBlocks, projectState } from "./project-sdk.js";

function makeTmpDir(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), `sdk-${prefix}-`));
}

// ── Discovery ────────────────────────────────────────────────────────────────

describe("availableBlocks", () => {
	it("lists blocks with schema presence", (t) => {
		const tmpDir = makeTmpDir("blocks");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const wfDir = path.join(tmpDir, ".project");
		const schemasDir = path.join(wfDir, "schemas");
		fs.mkdirSync(schemasDir, { recursive: true });
		fs.writeFileSync(path.join(wfDir, "gaps.json"), "{}");
		fs.writeFileSync(path.join(schemasDir, "gaps.schema.json"), "{}");
		fs.writeFileSync(path.join(wfDir, "model-config.json"), "{}"); // no schema

		const blocks = availableBlocks(tmpDir);
		const gaps = blocks.find((b) => b.name === "gaps");
		const config = blocks.find((b) => b.name === "model-config");
		assert.ok(gaps);
		assert.strictEqual(gaps!.hasSchema, true);
		assert.ok(config);
		assert.strictEqual(config!.hasSchema, false);
	});

	it("returns empty array when .project/ does not exist", (t) => {
		const tmpDir = makeTmpDir("blocks-empty");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const blocks = availableBlocks(tmpDir);
		assert.deepStrictEqual(blocks, []);
	});
});

describe("availableSchemas", () => {
	it("finds .project/schemas/*.schema.json", (t) => {
		const tmpDir = makeTmpDir("schemas");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const schemasDir = path.join(tmpDir, ".project", "schemas");
		fs.mkdirSync(schemasDir, { recursive: true });
		fs.writeFileSync(path.join(schemasDir, "gaps.schema.json"), "{}");

		const schemas = availableSchemas(tmpDir);
		assert.ok(schemas.some((s) => s.includes("gaps.schema.json")));
	});

	it("returns empty array when schemas dir does not exist", (t) => {
		const tmpDir = makeTmpDir("schemas-empty");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const schemas = availableSchemas(tmpDir);
		assert.deepStrictEqual(schemas, []);
	});
});

// ── Derived State ────────────────────────────────────────────────────────────

describe("projectState", () => {
	it("derives state from blocks and git", (t) => {
		const tmpDir = makeTmpDir("state");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		// Set up a minimal git repo
		execSync("git init && git commit --allow-empty -m 'init'", { cwd: tmpDir, stdio: "ignore" });

		// Set up source files
		const srcDir = path.join(tmpDir, "src");
		fs.mkdirSync(srcDir, { recursive: true });
		fs.writeFileSync(
			path.join(srcDir, "example.test.ts"),
			`
      it("test one", () => {});
      it("test two", () => {});
      it("test three", () => {});
    `,
		);
		fs.writeFileSync(path.join(srcDir, "module-a.ts"), "export function a() {}\nexport function b() {}\n");
		fs.writeFileSync(path.join(srcDir, "module-b.ts"), "export const x = 1;\n");

		// Set up blocks
		const wfDir = path.join(tmpDir, ".project");
		const schemasDir = path.join(wfDir, "schemas");
		fs.mkdirSync(schemasDir, { recursive: true });
		fs.writeFileSync(path.join(schemasDir, "gaps.schema.json"), "{}");

		// Set up phases
		const phasesDir = path.join(wfDir, "phases");
		fs.mkdirSync(phasesDir, { recursive: true });
		fs.writeFileSync(path.join(phasesDir, "01-foundation.json"), "{}");
		fs.writeFileSync(path.join(phasesDir, "02-control.json"), "{}");
		fs.writeFileSync(path.join(phasesDir, "08-automation.json"), "{}");

		fs.writeFileSync(
			path.join(wfDir, "gaps.json"),
			JSON.stringify({
				gaps: [
					{ id: "g1", description: "open gap", status: "open", category: "issue", priority: "high" },
					{ id: "g2", description: "resolved", status: "resolved", category: "cleanup", priority: "low" },
					{ id: "g3", description: "another open", status: "open", category: "capability", priority: "medium" },
				],
			}),
		);
		fs.writeFileSync(
			path.join(wfDir, "decisions.json"),
			JSON.stringify({
				decisions: [
					{ id: "d1", decision: "use X", rationale: "because", phase: 1, status: "decided" },
					{ id: "d2", decision: "maybe Y", rationale: "unclear", phase: 1, status: "tentative" },
				],
			}),
		);

		const state = projectState(tmpDir);

		assert.strictEqual(state.testCount, 3); // 3 it() declarations in example.test.ts
		assert.strictEqual(state.sourceFiles, 2); // module-a.ts, module-b.ts (not .test.ts)
		assert.ok(state.sourceLines > 0);
		assert.ok(state.lastCommit.length > 0);
		assert.strictEqual(state.lastCommitMessage, "init");
		assert.ok(state.recentCommits.length > 0);
		assert.ok(state.recentCommits[0].includes("init"));
		// blockSummaries: gaps block has a "gaps" array with 3 items and status distribution
		assert.ok(state.blockSummaries.gaps);
		assert.ok(state.blockSummaries.gaps.arrays.gaps);
		assert.strictEqual(state.blockSummaries.gaps.arrays.gaps.total, 3);
		assert.ok(state.blockSummaries.gaps.arrays.gaps.byStatus);
		assert.strictEqual(state.blockSummaries.gaps.arrays.gaps.byStatus!.open, 2);
		assert.strictEqual(state.blockSummaries.gaps.arrays.gaps.byStatus!.resolved, 1);

		// blockSummaries: decisions block has a "decisions" array with 2 items and status distribution
		assert.ok(state.blockSummaries.decisions);
		assert.ok(state.blockSummaries.decisions.arrays.decisions);
		assert.strictEqual(state.blockSummaries.decisions.arrays.decisions.total, 2);
		assert.ok(state.blockSummaries.decisions.arrays.decisions.byStatus);
		assert.strictEqual(state.blockSummaries.decisions.arrays.decisions.byStatus!.decided, 1);
		assert.strictEqual(state.blockSummaries.decisions.arrays.decisions.byStatus!.tentative, 1);

		assert.strictEqual(state.phases.total, 3);
		assert.strictEqual(state.phases.current, 8); // highest number from 08-automation.json
		assert.ok(state.schemas >= 1); // at least gaps.schema.json
	});

	it("handles missing blocks gracefully", (t) => {
		const tmpDir = makeTmpDir("state-empty");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const state = projectState(tmpDir);

		assert.strictEqual(state.testCount, 0);
		assert.strictEqual(state.sourceFiles, 0);
		assert.strictEqual(state.sourceLines, 0);
		assert.strictEqual(state.lastCommit, "unknown");
		assert.deepStrictEqual(state.recentCommits, []);
		assert.deepStrictEqual(state.blockSummaries, {}); // no blocks at all
		assert.strictEqual(state.phases.total, 0);
		assert.strictEqual(state.phases.current, 0);
		assert.ok(typeof state.schemas === "number");
	});
});
