/**
 * Tests for project-sdk: projectState, availableBlocks, availableSchemas,
 * findAppendableBlocks, validateProject, schemaInfo, schemaVocabulary,
 * blockStructure.
 */

import assert from "node:assert";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { appendToBlock, updateItemInBlock } from "./block-api.js";
import {
	availableBlocks,
	availableSchemas,
	blockStructure,
	completeTask,
	projectState,
	schemaInfo,
	schemaVocabulary,
	validateProject,
} from "./project-sdk.js";
import { ValidationError, validate } from "./schema-validator.js";

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
		fs.writeFileSync(path.join(wfDir, "issues.json"), "{}");
		fs.writeFileSync(path.join(schemasDir, "issues.schema.json"), "{}");
		fs.writeFileSync(path.join(wfDir, "model-config.json"), "{}"); // no schema

		const blocks = availableBlocks(tmpDir);
		const issuesBlock = blocks.find((b) => b.name === "issues");
		const config = blocks.find((b) => b.name === "model-config");
		assert.ok(issuesBlock);
		assert.strictEqual(issuesBlock!.hasSchema, true);
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
		fs.writeFileSync(path.join(schemasDir, "issues.schema.json"), "{}");

		const schemas = availableSchemas(tmpDir);
		assert.ok(schemas.some((s) => s.includes("issues.schema.json")));
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
		fs.writeFileSync(path.join(schemasDir, "issues.schema.json"), "{}");

		// Set up phases
		const phasesDir = path.join(wfDir, "phases");
		fs.mkdirSync(phasesDir, { recursive: true });
		fs.writeFileSync(path.join(phasesDir, "01-foundation.json"), "{}");
		fs.writeFileSync(path.join(phasesDir, "02-control.json"), "{}");
		fs.writeFileSync(path.join(phasesDir, "08-automation.json"), "{}");

		fs.writeFileSync(
			path.join(wfDir, "issues.json"),
			JSON.stringify({
				issues: [
					{
						id: "g1",
						title: "open issue",
						body: "open issue detail",
						location: "src/mod.ts:10",
						status: "open",
						category: "issue",
						priority: "high",
						package: "pi-project",
					},
					{
						id: "g2",
						title: "resolved",
						body: "resolved detail",
						location: "src/mod.ts:20",
						status: "resolved",
						category: "cleanup",
						priority: "low",
						package: "pi-project",
					},
					{
						id: "g3",
						title: "another open",
						body: "another open detail",
						location: "src/mod.ts:30",
						status: "open",
						category: "capability",
						priority: "medium",
						package: "pi-project",
					},
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
		// blockSummaries: issues block has an "issues" array with 3 items and status distribution
		assert.ok(state.blockSummaries.issues);
		assert.ok(state.blockSummaries.issues.arrays.issues);
		assert.strictEqual(state.blockSummaries.issues.arrays.issues.total, 3);
		assert.ok(state.blockSummaries.issues.arrays.issues.byStatus);
		assert.strictEqual(state.blockSummaries.issues.arrays.issues.byStatus!.open, 2);
		assert.strictEqual(state.blockSummaries.issues.arrays.issues.byStatus!.resolved, 1);

		// blockSummaries: decisions block has a "decisions" array with 2 items and status distribution
		assert.ok(state.blockSummaries.decisions);
		assert.ok(state.blockSummaries.decisions.arrays.decisions);
		assert.strictEqual(state.blockSummaries.decisions.arrays.decisions.total, 2);
		assert.ok(state.blockSummaries.decisions.arrays.decisions.byStatus);
		assert.strictEqual(state.blockSummaries.decisions.arrays.decisions.byStatus!.decided, 1);
		assert.strictEqual(state.blockSummaries.decisions.arrays.decisions.byStatus!.tentative, 1);

		assert.strictEqual(state.phases.total, 3);
		assert.strictEqual(state.phases.current, 8); // highest number from 08-automation.json
		assert.ok(state.schemas >= 1); // at least issues.schema.json
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

// ── validateProject ─────────────────────────────────────────────────────────

describe("validateProject", () => {
	it("returns valid for a project with consistent cross-references", (t) => {
		const tmpDir = makeTmpDir("validate-valid");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		const phasesDir = path.join(projectDir, "phases");
		fs.mkdirSync(phasesDir, { recursive: true });

		// Phase file with number and name
		fs.writeFileSync(path.join(phasesDir, "01-foundation.json"), JSON.stringify({ number: 1, name: "foundation" }));

		// Tasks referencing the existing phase
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({
				tasks: [
					{ id: "t1", description: "first task", status: "planned", phase: "foundation" },
					{ id: "t2", description: "second task", status: "planned", phase: 1 },
				],
			}),
		);

		// Decisions referencing the existing phase
		fs.writeFileSync(
			path.join(projectDir, "decisions.json"),
			JSON.stringify({
				decisions: [{ id: "d1", decision: "use X", rationale: "because", phase: 1 }],
			}),
		);

		const result = validateProject(tmpDir);
		assert.strictEqual(result.status, "clean");
		assert.deepStrictEqual(result.issues, []);
	});

	it("reports broken phase reference from tasks", (t) => {
		const tmpDir = makeTmpDir("validate-phase-ref");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		// No phases directory — phase references will be broken

		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({
				tasks: [{ id: "t1", description: "task with missing phase", status: "planned", phase: "phase-1" }],
			}),
		);

		const result = validateProject(tmpDir);
		// Broken phase references are warnings, so valid may still be true
		// but there should be an issue about the missing phase
		assert.ok(result.issues.length > 0);
		const phaseIssue = result.issues.find((i) => i.message.includes("phase") && i.message.includes("phase-1"));
		assert.ok(phaseIssue, "should report issue about missing phase reference");
		assert.strictEqual(phaseIssue!.block, "tasks");
	});

	it("reports missing task dependency", (t) => {
		const tmpDir = makeTmpDir("validate-task-dep");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({
				tasks: [{ id: "task-a", description: "depends on nonexistent", status: "planned", depends_on: ["task-b"] }],
			}),
		);

		const result = validateProject(tmpDir);
		assert.strictEqual(result.status, "invalid", "missing depends_on target should cause error-level issue");
		const depIssue = result.issues.find((i) => i.message.includes("task-b") && i.message.includes("depends on"));
		assert.ok(depIssue, "should report issue about missing task dependency");
		assert.strictEqual(depIssue!.severity, "error");
		assert.strictEqual(depIssue!.block, "tasks");
	});

	it("reports issue with broken resolved_by reference", (t) => {
		const tmpDir = makeTmpDir("validate-issue-ref");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		fs.writeFileSync(
			path.join(projectDir, "issues.json"),
			JSON.stringify({
				issues: [
					{
						id: "g1",
						title: "resolved issue",
						body: "resolved issue body",
						location: "test.ts:1",
						status: "resolved",
						category: "issue",
						priority: "high",
						package: "test",
						resolved_by: "nonexistent-spec-42",
					},
				],
			}),
		);

		const result = validateProject(tmpDir);
		const issueRef = result.issues.find(
			(i) => i.message.includes("resolved_by") && i.message.includes("nonexistent-spec-42"),
		);
		assert.ok(issueRef, "should report issue about broken resolved_by reference");
		assert.strictEqual(issueRef!.block, "issues");
	});

	it("returns valid for an empty project directory", (t) => {
		const tmpDir = makeTmpDir("validate-empty");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		const result = validateProject(tmpDir);
		assert.strictEqual(result.status, "clean");
		assert.deepStrictEqual(result.issues, []);
	});

	it("returns valid for partial project with only tasks (no phases or decisions)", (t) => {
		const tmpDir = makeTmpDir("validate-partial");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		// Tasks with no phase reference — no cross-ref to check
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({
				tasks: [
					{ id: "t1", description: "standalone task", status: "planned" },
					{ id: "t2", description: "another task", status: "in-progress", depends_on: ["t1"] },
				],
			}),
		);

		const result = validateProject(tmpDir);
		assert.strictEqual(result.status, "clean", "partial project with valid internal refs should be clean");
		assert.deepStrictEqual(result.issues, []);
	});

	it("reports broken task.verification reference", (t) => {
		const tmpDir = makeTmpDir("validate-task-ver-broken");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({
				tasks: [
					{ id: "t1", description: "task with bad verification", status: "completed", verification: "v-nonexistent" },
				],
			}),
		);

		const result = validateProject(tmpDir);
		assert.ok(result.issues.length > 0);
		const verIssue = result.issues.find(
			(i) => i.message.includes("verification") && i.message.includes("v-nonexistent"),
		);
		assert.ok(verIssue, "should report issue about broken verification reference");
		assert.strictEqual(verIssue!.severity, "warning");
		assert.strictEqual(verIssue!.block, "tasks");
		assert.ok(verIssue!.field!.includes("verification"));
	});

	it("accepts valid task.verification reference", (t) => {
		const tmpDir = makeTmpDir("validate-task-ver-valid");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		fs.writeFileSync(
			path.join(projectDir, "verification.json"),
			JSON.stringify({
				verifications: [{ id: "v-001", target: "t1", target_type: "task", status: "passed", method: "test" }],
			}),
		);

		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({
				tasks: [{ id: "t1", description: "task with valid verification", status: "completed", verification: "v-001" }],
			}),
		);

		const result = validateProject(tmpDir);
		assert.deepStrictEqual(result.issues, []);
	});

	it("reports broken decision.task reference", (t) => {
		const tmpDir = makeTmpDir("validate-dec-task-broken");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		fs.writeFileSync(
			path.join(projectDir, "decisions.json"),
			JSON.stringify({
				decisions: [{ id: "d1", decision: "use X", rationale: "because", status: "decided", task: "t-nonexistent" }],
			}),
		);

		const result = validateProject(tmpDir);
		assert.ok(result.issues.length > 0);
		const taskIssue = result.issues.find((i) => i.message.includes("task") && i.message.includes("t-nonexistent"));
		assert.ok(taskIssue, "should report issue about broken task reference in decision");
		assert.strictEqual(taskIssue!.severity, "warning");
		assert.strictEqual(taskIssue!.block, "decisions");
	});

	it("accepts valid decision.task reference", (t) => {
		const tmpDir = makeTmpDir("validate-dec-task-valid");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({
				tasks: [{ id: "t1", description: "a task", status: "planned" }],
			}),
		);

		fs.writeFileSync(
			path.join(projectDir, "decisions.json"),
			JSON.stringify({
				decisions: [{ id: "d1", decision: "use X", rationale: "because", status: "decided", task: "t1" }],
			}),
		);

		const result = validateProject(tmpDir);
		assert.deepStrictEqual(result.issues, []);
	});

	it("reports error when completed task has no verification reference", (t) => {
		const tmpDir = makeTmpDir("validate-task-no-ver");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({
				tasks: [{ id: "t1", description: "done task", status: "completed" }],
			}),
		);

		const result = validateProject(tmpDir);
		assert.strictEqual(result.status, "invalid", "completed task without verification should make project invalid");
		assert.ok(result.issues.length > 0);
		const noVerIssue = result.issues.find(
			(i) => i.message.includes("no verification reference") && i.message.includes("t1"),
		);
		assert.ok(noVerIssue, "should report error about completed task without verification reference");
		assert.strictEqual(noVerIssue!.severity, "error");
		assert.strictEqual(noVerIssue!.block, "tasks");
		assert.ok(noVerIssue!.field.includes("verification"));
	});
});

// ── Validation result status field ──────────────────────────────────────────

describe("validation result status field", () => {
	it("status is 'clean' when zero issues", (t) => {
		const tmpDir = makeTmpDir("status-clean");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		const phasesDir = path.join(projectDir, "phases");
		fs.mkdirSync(phasesDir, { recursive: true });

		// Phase file
		fs.writeFileSync(path.join(phasesDir, "01-foundation.json"), JSON.stringify({ number: 1, name: "foundation" }));

		// Tasks with valid references
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({
				tasks: [{ id: "t1", description: "task", status: "planned", phase: "foundation" }],
			}),
		);

		const result = validateProject(tmpDir);
		assert.strictEqual(result.status, "clean");
		assert.deepStrictEqual(result.issues, []);
	});

	it("status is 'invalid' when errors present", (t) => {
		const tmpDir = makeTmpDir("status-invalid");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		// Task with broken depends_on — produces an error-severity issue
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({
				tasks: [{ id: "t1", description: "bad dep", status: "planned", depends_on: ["t-nonexistent"] }],
			}),
		);

		const result = validateProject(tmpDir);
		assert.strictEqual(result.status, "invalid");
	});

	it("status is 'warnings' when only warnings present", (t) => {
		const tmpDir = makeTmpDir("status-warnings");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });
		// No phases directory — phase reference from task will be a warning

		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({
				tasks: [{ id: "t1", description: "task with missing phase", status: "planned", phase: "phase-1" }],
			}),
		);

		const result = validateProject(tmpDir);
		assert.strictEqual(result.status, "warnings");
		assert.ok(result.issues.length > 0, "should have at least one warning issue");
		assert.ok(
			result.issues.every((i) => i.severity === "warning"),
			"all issues should be warnings",
		);
	});
});

// ── completeTask ───────────────────────────────────────────────────────────

describe("completeTask", () => {
	/** Helper: write a minimal tasks block */
	function writeTasks(dir: string, tasks: Record<string, unknown>[]) {
		fs.writeFileSync(path.join(dir, ".project", "tasks.json"), JSON.stringify({ tasks }));
	}

	/** Helper: write a minimal verification block */
	function writeVerifications(dir: string, verifications: Record<string, unknown>[]) {
		fs.writeFileSync(path.join(dir, ".project", "verification.json"), JSON.stringify({ verifications }));
	}

	it("completes a task with passing verification (happy path)", (t) => {
		const tmpDir = makeTmpDir("ct-happy");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		writeTasks(tmpDir, [{ id: "t1", description: "build it", status: "planned" }]);
		writeVerifications(tmpDir, [{ id: "v1", target: "t1", target_type: "task", status: "passed", method: "test" }]);

		const result = completeTask(tmpDir, "t1", "v1");
		assert.strictEqual(result.taskId, "t1");
		assert.strictEqual(result.verificationId, "v1");
		assert.strictEqual(result.verificationStatus, "passed");
		assert.strictEqual(result.previousStatus, "planned");

		// Read back and verify the task was updated
		const data = JSON.parse(fs.readFileSync(path.join(projectDir, "tasks.json"), "utf-8"));
		const task = data.tasks.find((t: Record<string, unknown>) => t.id === "t1");
		assert.strictEqual(task.status, "completed");
		assert.strictEqual(task.verification, "v1");
	});

	it("throws when verification entry does not exist", (t) => {
		const tmpDir = makeTmpDir("ct-no-ver");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		writeTasks(tmpDir, [{ id: "t1", description: "build it", status: "planned" }]);
		writeVerifications(tmpDir, []);

		assert.throws(
			() => completeTask(tmpDir, "t1", "v-missing"),
			(err: Error) => {
				assert.ok(err.message.includes("not found"));
				return true;
			},
		);
	});

	it("throws when verification targets wrong task", (t) => {
		const tmpDir = makeTmpDir("ct-wrong-target");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		writeTasks(tmpDir, [{ id: "t1", description: "build it", status: "planned" }]);
		writeVerifications(tmpDir, [
			{ id: "v1", target: "other-task", target_type: "task", status: "passed", method: "test" },
		]);

		assert.throws(
			() => completeTask(tmpDir, "t1", "v1"),
			(err: Error) => {
				assert.ok(err.message.includes("targets"));
				return true;
			},
		);
	});

	it("throws when verification targets wrong type", (t) => {
		const tmpDir = makeTmpDir("ct-wrong-type");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		writeTasks(tmpDir, [{ id: "t1", description: "build it", status: "planned" }]);
		writeVerifications(tmpDir, [{ id: "v1", target: "t1", target_type: "phase", status: "passed", method: "test" }]);

		assert.throws(
			() => completeTask(tmpDir, "t1", "v1"),
			(err: Error) => {
				assert.ok(err.message.includes("targets"));
				return true;
			},
		);
	});

	it("throws when verification status is failed", (t) => {
		const tmpDir = makeTmpDir("ct-ver-failed");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		writeTasks(tmpDir, [{ id: "t1", description: "build it", status: "planned" }]);
		writeVerifications(tmpDir, [{ id: "v1", target: "t1", target_type: "task", status: "failed", method: "test" }]);

		assert.throws(
			() => completeTask(tmpDir, "t1", "v1"),
			(err: Error) => {
				assert.ok(err.message.includes("not 'passed'"));
				return true;
			},
		);
	});

	it("throws when verification status is partial", (t) => {
		const tmpDir = makeTmpDir("ct-ver-partial");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		writeTasks(tmpDir, [{ id: "t1", description: "build it", status: "planned" }]);
		writeVerifications(tmpDir, [{ id: "v1", target: "t1", target_type: "task", status: "partial", method: "test" }]);

		assert.throws(
			() => completeTask(tmpDir, "t1", "v1"),
			(err: Error) => {
				assert.ok(err.message.includes("not 'passed'"));
				return true;
			},
		);
	});

	it("throws when verification status is skipped", (t) => {
		const tmpDir = makeTmpDir("ct-ver-skipped");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		writeTasks(tmpDir, [{ id: "t1", description: "build it", status: "planned" }]);
		writeVerifications(tmpDir, [{ id: "v1", target: "t1", target_type: "task", status: "skipped", method: "test" }]);

		assert.throws(
			() => completeTask(tmpDir, "t1", "v1"),
			(err: Error) => {
				assert.ok(err.message.includes("not 'passed'"));
				return true;
			},
		);
	});

	it("throws when task is already completed", (t) => {
		const tmpDir = makeTmpDir("ct-already-done");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		writeTasks(tmpDir, [{ id: "t1", description: "build it", status: "completed", verification: "v-old" }]);
		writeVerifications(tmpDir, [{ id: "v1", target: "t1", target_type: "task", status: "passed", method: "test" }]);

		assert.throws(
			() => completeTask(tmpDir, "t1", "v1"),
			(err: Error) => {
				assert.ok(err.message.includes("already completed"));
				return true;
			},
		);
	});

	it("throws when task is already cancelled", (t) => {
		const tmpDir = makeTmpDir("ct-cancelled");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		writeTasks(tmpDir, [{ id: "t1", description: "build it", status: "cancelled" }]);
		writeVerifications(tmpDir, [{ id: "v1", target: "t1", target_type: "task", status: "passed", method: "test" }]);

		assert.throws(
			() => completeTask(tmpDir, "t1", "v1"),
			(err: Error) => {
				assert.ok(err.message.includes("already cancelled"));
				return true;
			},
		);
	});

	it("throws when task is not found", (t) => {
		const tmpDir = makeTmpDir("ct-no-task");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		writeTasks(tmpDir, [{ id: "t1", description: "build it", status: "planned" }]);
		writeVerifications(tmpDir, [
			{ id: "v1", target: "t-missing", target_type: "task", status: "passed", method: "test" },
		]);

		assert.throws(
			() => completeTask(tmpDir, "t-missing", "v1"),
			(err: Error) => {
				assert.ok(err.message.includes("not found"));
				return true;
			},
		);
	});

	it("throws when verification block is missing", (t) => {
		const tmpDir = makeTmpDir("ct-no-ver-block");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		writeTasks(tmpDir, [{ id: "t1", description: "build it", status: "planned" }]);
		// No verification.json

		assert.throws(
			() => completeTask(tmpDir, "t1", "v1"),
			(err: Error) => {
				assert.ok(err.message.includes("Verification block not found"));
				return true;
			},
		);
	});

	it("throws when tasks block is missing", (t) => {
		const tmpDir = makeTmpDir("ct-no-task-block");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		// No tasks.json
		writeVerifications(tmpDir, [{ id: "v1", target: "t1", target_type: "task", status: "passed", method: "test" }]);

		assert.throws(
			() => completeTask(tmpDir, "t1", "v1"),
			(err: Error) => {
				assert.ok(err.message.includes("Tasks block not found"));
				return true;
			},
		);
	});
});

// ── schemaInfo ──────────────────────────────────────────────────────────────

describe("schemaInfo", () => {
	it("extracts property metadata from a valid schema", (t) => {
		const tmpDir = makeTmpDir("schema-info");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const schemasDir = path.join(tmpDir, ".project", "schemas");
		fs.mkdirSync(schemasDir, { recursive: true });

		fs.writeFileSync(
			path.join(schemasDir, "widget.schema.json"),
			JSON.stringify({
				title: "Widget",
				type: "object",
				required: ["name", "parts"],
				properties: {
					name: { type: "string", description: "Widget name" },
					count: { type: "integer" },
					parts: {
						type: "array",
						items: {
							type: "object",
							required: ["id"],
							properties: {
								id: { type: "string" },
								label: { type: "string" },
							},
						},
					},
				},
			}),
		);

		const info = schemaInfo(tmpDir, "widget");
		assert.ok(info, "should return SchemaInfo for existing schema");
		assert.strictEqual(info!.name, "widget");
		assert.strictEqual(info!.title, "Widget");

		// Check properties
		const nameProp = info!.properties.find((p) => p.name === "name");
		assert.ok(nameProp);
		assert.strictEqual(nameProp!.type, "string");
		assert.strictEqual(nameProp!.required, true);
		assert.strictEqual(nameProp!.description, "Widget name");

		const countProp = info!.properties.find((p) => p.name === "count");
		assert.ok(countProp);
		assert.strictEqual(countProp!.type, "integer");
		assert.strictEqual(countProp!.required, false);

		// Check array keys
		assert.deepStrictEqual(info!.arrayKeys, ["parts"]);

		// Check item properties for the array
		assert.ok(info!.itemProperties);
		assert.ok(info!.itemProperties!.parts);
		const idItemProp = info!.itemProperties!.parts.find((p) => p.name === "id");
		assert.ok(idItemProp);
		assert.strictEqual(idItemProp!.required, true);
	});

	it("returns null for nonexistent schema", (t) => {
		const tmpDir = makeTmpDir("schema-info-missing");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const result = schemaInfo(tmpDir, "does-not-exist");
		assert.strictEqual(result, null);
	});

	it("extracts enum values from schema properties", (t) => {
		const tmpDir = makeTmpDir("schema-info-enum");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const schemasDir = path.join(tmpDir, ".project", "schemas");
		fs.mkdirSync(schemasDir, { recursive: true });

		fs.writeFileSync(
			path.join(schemasDir, "status-block.schema.json"),
			JSON.stringify({
				title: "Status Block",
				type: "object",
				required: ["status"],
				properties: {
					status: {
						type: "string",
						enum: ["open", "closed", "deferred"],
					},
					priority: {
						type: "string",
						enum: ["low", "medium", "high"],
					},
				},
			}),
		);

		const info = schemaInfo(tmpDir, "status-block");
		assert.ok(info);
		const statusProp = info!.properties.find((p) => p.name === "status");
		assert.ok(statusProp);
		assert.deepStrictEqual(statusProp!.enum, ["open", "closed", "deferred"]);

		const priorityProp = info!.properties.find((p) => p.name === "priority");
		assert.ok(priorityProp);
		assert.deepStrictEqual(priorityProp!.enum, ["low", "medium", "high"]);
	});
});

// ── schemaVocabulary ────────────────────────────────────────────────────────

describe("schemaVocabulary", () => {
	it("returns all schemas sorted by name", (t) => {
		const tmpDir = makeTmpDir("schema-vocab");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const schemasDir = path.join(tmpDir, ".project", "schemas");
		fs.mkdirSync(schemasDir, { recursive: true });

		fs.writeFileSync(
			path.join(schemasDir, "zebra.schema.json"),
			JSON.stringify({ title: "Zebra", type: "object", properties: { name: { type: "string" } } }),
		);
		fs.writeFileSync(
			path.join(schemasDir, "alpha.schema.json"),
			JSON.stringify({ title: "Alpha", type: "object", properties: { id: { type: "string" } } }),
		);
		fs.writeFileSync(
			path.join(schemasDir, "middle.schema.json"),
			JSON.stringify({ title: "Middle", type: "object", properties: { value: { type: "integer" } } }),
		);

		const vocab = schemaVocabulary(tmpDir);
		assert.strictEqual(vocab.length, 3);
		// Sorted by name (derived from filename)
		assert.strictEqual(vocab[0].name, "alpha");
		assert.strictEqual(vocab[1].name, "middle");
		assert.strictEqual(vocab[2].name, "zebra");
	});

	it("returns empty array when schemas directory does not exist", (t) => {
		const tmpDir = makeTmpDir("schema-vocab-none");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const vocab = schemaVocabulary(tmpDir);
		assert.deepStrictEqual(vocab, []);
	});
});

// ── blockStructure ──────────────────────────────────────────────────────────

describe("blockStructure", () => {
	it("reports array structure for populated blocks", (t) => {
		const tmpDir = makeTmpDir("block-struct");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		const schemasDir = path.join(projectDir, "schemas");
		fs.mkdirSync(schemasDir, { recursive: true });

		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({
				tasks: [
					{ id: "t1", description: "one", status: "planned" },
					{ id: "t2", description: "two", status: "completed" },
					{ id: "t3", description: "three", status: "planned" },
				],
			}),
		);
		fs.writeFileSync(path.join(schemasDir, "tasks.schema.json"), "{}");

		const structures = blockStructure(tmpDir);
		assert.strictEqual(structures.length, 1);

		const tasksBlock = structures.find((s) => s.name === "tasks");
		assert.ok(tasksBlock);
		assert.strictEqual(tasksBlock!.exists, true);
		assert.strictEqual(tasksBlock!.hasSchema, true);
		const tasksArray = tasksBlock!.arrays.find((a) => a.key === "tasks");
		assert.ok(tasksArray);
		assert.strictEqual(tasksArray!.itemCount, 3);
	});

	it("reports zero-length arrays for empty block arrays", (t) => {
		const tmpDir = makeTmpDir("block-struct-empty");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		fs.writeFileSync(path.join(projectDir, "items.json"), JSON.stringify({ items: [] }));

		const structures = blockStructure(tmpDir);
		assert.strictEqual(structures.length, 1);

		const itemsBlock = structures.find((s) => s.name === "items");
		assert.ok(itemsBlock);
		assert.strictEqual(itemsBlock!.exists, true);
		const itemsArray = itemsBlock!.arrays.find((a) => a.key === "items");
		assert.ok(itemsArray);
		assert.strictEqual(itemsArray!.itemCount, 0);
	});

	it("returns empty array when no blocks exist", (t) => {
		const tmpDir = makeTmpDir("block-struct-none");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const structures = blockStructure(tmpDir);
		assert.deepStrictEqual(structures, []);
	});
});

// ── Schema-enforced verification gate (if/then) ───────────────────────────

/** Path to the real tasks.schema.json shipped as a default */
const REAL_TASKS_SCHEMA = path.join(
	path.dirname(new URL(import.meta.url).pathname),
	"..",
	"defaults",
	"schemas",
	"tasks.schema.json",
);

/**
 * Install the real tasks.schema.json into a test's .project/schemas/ directory.
 * Every enforcement test MUST call this — testing against an empty schema would
 * prove nothing about the if/then gate.
 */
function installTasksSchema(tmpDir: string): void {
	const schemasDir = path.join(tmpDir, ".project", "schemas");
	fs.mkdirSync(schemasDir, { recursive: true });
	fs.copyFileSync(REAL_TASKS_SCHEMA, path.join(schemasDir, "tasks.schema.json"));
}

/** Write a tasks block file directly (bypassing schema validation). */
function writeTasksRaw(tmpDir: string, tasks: Record<string, unknown>[]): void {
	const projectDir = path.join(tmpDir, ".project");
	fs.mkdirSync(projectDir, { recursive: true });
	fs.writeFileSync(path.join(projectDir, "tasks.json"), JSON.stringify({ tasks }));
}

describe("verification gate — AJV if/then enforcement", () => {
	it("(a) AJV if/then fires: validate() rejects closed-without-reason, accepts with-reason", () => {
		const schema = {
			type: "object",
			properties: {
				status: { type: "string", enum: ["open", "closed"] },
				reason: { type: "string" },
			},
			if: {
				properties: { status: { const: "closed" } },
				required: ["status"],
			},
			// biome-ignore lint/suspicious/noThenProperty: JSON Schema if/then is not Promise.then
			then: {
				required: ["reason"],
			},
		};

		// Should pass: open without reason
		validate(schema, { status: "open" }, "test-open");

		// Should fail: closed without reason
		assert.throws(
			() => validate(schema, { status: "closed" }, "test-closed-no-reason"),
			(err: unknown) => err instanceof ValidationError,
		);

		// Should pass: closed with reason
		validate(schema, { status: "closed", reason: "done" }, "test-closed-with-reason");
	});

	it("(b) updateItemInBlock rejects completed without verification", (t) => {
		const tmpDir = makeTmpDir("gate-update-reject");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		installTasksSchema(tmpDir);
		writeTasksRaw(tmpDir, [{ id: "t1", description: "a task", status: "in-progress" }]);

		// Attempt to set status=completed without verification — should fail
		assert.throws(
			() =>
				updateItemInBlock(tmpDir, "tasks", "tasks", (item) => item.id === "t1", {
					status: "completed",
				}),
			(err: unknown) => err instanceof ValidationError,
		);

		// Verify the file was not modified (atomic write rolled back)
		const data = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "tasks.json"), "utf-8"));
		assert.strictEqual(data.tasks[0].status, "in-progress", "task should remain in-progress after failed update");
	});

	it("(c) updateItemInBlock accepts completed WITH verification", (t) => {
		const tmpDir = makeTmpDir("gate-update-accept");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		installTasksSchema(tmpDir);
		writeTasksRaw(tmpDir, [{ id: "t1", description: "a task", status: "in-progress" }]);

		updateItemInBlock(tmpDir, "tasks", "tasks", (item) => item.id === "t1", {
			status: "completed",
			verification: "v1",
		});

		const data = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "tasks.json"), "utf-8"));
		assert.strictEqual(data.tasks[0].status, "completed");
		assert.strictEqual(data.tasks[0].verification, "v1");
	});

	it("(d) appendToBlock rejects completed item without verification", (t) => {
		const tmpDir = makeTmpDir("gate-append-reject");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		installTasksSchema(tmpDir);
		writeTasksRaw(tmpDir, []);

		assert.throws(
			() =>
				appendToBlock(tmpDir, "tasks", "tasks", {
					id: "t2",
					description: "new task",
					status: "completed",
				}),
			(err: unknown) => err instanceof ValidationError,
		);

		// Verify the file still has an empty array
		const data = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "tasks.json"), "utf-8"));
		assert.strictEqual(data.tasks.length, 0, "no task should have been appended");
	});

	it("(e) appendToBlock accepts completed item WITH verification", (t) => {
		const tmpDir = makeTmpDir("gate-append-accept");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		installTasksSchema(tmpDir);
		writeTasksRaw(tmpDir, []);

		appendToBlock(tmpDir, "tasks", "tasks", {
			id: "t2",
			description: "new task",
			status: "completed",
			verification: "v1",
		});

		const data = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "tasks.json"), "utf-8"));
		assert.strictEqual(data.tasks.length, 1);
		assert.strictEqual(data.tasks[0].status, "completed");
		assert.strictEqual(data.tasks[0].verification, "v1");
	});

	it("(f) non-completed statuses work without verification field", (t) => {
		const tmpDir = makeTmpDir("gate-non-completed");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		installTasksSchema(tmpDir);
		writeTasksRaw(tmpDir, [{ id: "t1", description: "a task", status: "planned" }]);

		// Each non-completed status should succeed without verification
		for (const status of ["in-progress", "blocked", "cancelled"]) {
			updateItemInBlock(tmpDir, "tasks", "tasks", (item) => item.id === "t1", { status });
			const data = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "tasks.json"), "utf-8"));
			assert.strictEqual(data.tasks[0].status, status, `status '${status}' should be accepted without verification`);
		}
	});

	it("(g) two-update sequence: first fails (no verification), second succeeds (with verification)", (t) => {
		const tmpDir = makeTmpDir("gate-two-step");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		installTasksSchema(tmpDir);
		writeTasksRaw(tmpDir, [{ id: "t1", description: "a task", status: "in-progress" }]);

		// First attempt: no verification — fails
		assert.throws(
			() =>
				updateItemInBlock(tmpDir, "tasks", "tasks", (item) => item.id === "t1", {
					status: "completed",
				}),
			(err: unknown) => err instanceof ValidationError,
		);

		// Read back: still in-progress
		const beforeData = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "tasks.json"), "utf-8"));
		assert.strictEqual(beforeData.tasks[0].status, "in-progress", "should remain in-progress after rejection");

		// Second attempt: with verification — succeeds
		updateItemInBlock(tmpDir, "tasks", "tasks", (item) => item.id === "t1", {
			status: "completed",
			verification: "v1",
		});

		const afterData = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "tasks.json"), "utf-8"));
		assert.strictEqual(afterData.tasks[0].status, "completed");
		assert.strictEqual(afterData.tasks[0].verification, "v1");
	});

	it("(h) validateProject returns error severity for completed task without verification (bypassed via fs)", (t) => {
		const tmpDir = makeTmpDir("gate-validate-severity");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		// Write directly via fs.writeFileSync — bypasses schema validation
		fs.writeFileSync(
			path.join(projectDir, "tasks.json"),
			JSON.stringify({
				tasks: [{ id: "t1", description: "corrupted task", status: "completed" }],
			}),
		);

		const result = validateProject(tmpDir);
		assert.strictEqual(result.status, "invalid", "validateProject should report invalid for corrupted state");

		const issue = result.issues.find(
			(i) => i.message.includes("no verification reference") && i.message.includes("t1"),
		);
		assert.ok(issue, "should find the completed-without-verification issue");
		assert.strictEqual(issue!.severity, "error", "severity should be error, not warning");
	});

	it("(i) completeTask happy path works with real schema installed", (t) => {
		const tmpDir = makeTmpDir("gate-complete-task");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const projectDir = path.join(tmpDir, ".project");
		fs.mkdirSync(projectDir, { recursive: true });

		installTasksSchema(tmpDir);
		writeTasksRaw(tmpDir, [{ id: "t1", description: "build it", status: "planned" }]);

		// Write verification block (completeTask reads this)
		fs.writeFileSync(
			path.join(projectDir, "verification.json"),
			JSON.stringify({
				verifications: [{ id: "v1", target: "t1", target_type: "task", status: "passed", method: "test" }],
			}),
		);

		// completeTask sets both status and verification atomically — the if/then gate is satisfied
		const result = completeTask(tmpDir, "t1", "v1");
		assert.strictEqual(result.taskId, "t1");
		assert.strictEqual(result.previousStatus, "planned");

		// Read back and verify
		const data = JSON.parse(fs.readFileSync(path.join(projectDir, "tasks.json"), "utf-8"));
		assert.strictEqual(data.tasks[0].status, "completed");
		assert.strictEqual(data.tasks[0].verification, "v1");
	});
});
