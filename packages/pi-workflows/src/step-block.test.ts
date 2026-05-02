/**
 * Tests for the block step executor.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { executeBlock } from "./step-block.js";

let tmpDir: string;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "block-step-test-"));
	// Create .project structure
	const projectDir = path.join(tmpDir, ".project");
	const schemasDir = path.join(projectDir, "schemas");
	const phasesDir = path.join(projectDir, "phases");
	fs.mkdirSync(schemasDir, { recursive: true });
	fs.mkdirSync(phasesDir, { recursive: true });

	// Write an issues block
	fs.writeFileSync(
		path.join(projectDir, "issues.json"),
		JSON.stringify(
			{
				issues: [
					{
						id: "g1",
						status: "open",
						title: "test issue",
						body: "test issue body",
						location: "test.ts:1",
						category: "issue",
						priority: "medium",
						package: "test",
					},
				],
			},
			null,
			2,
		),
	);

	// Write an architecture block
	fs.writeFileSync(path.join(projectDir, "architecture.json"), JSON.stringify({ modules: ["core"] }, null, 2));

	// Write phase files
	fs.writeFileSync(
		path.join(phasesDir, "01-foundation.json"),
		JSON.stringify({ number: 1, name: "foundation" }, null, 2),
	);
	fs.writeFileSync(path.join(phasesDir, "02-features.json"), JSON.stringify({ number: 2, name: "features" }, null, 2));

	// Write a minimal schema for issues
	fs.writeFileSync(
		path.join(schemasDir, "issues.schema.json"),
		JSON.stringify({
			type: "object",
			required: ["issues"],
			properties: { issues: { type: "array" } },
		}),
	);

	// Write a minimal schema for phase
	fs.writeFileSync(
		path.join(schemasDir, "phase.schema.json"),
		JSON.stringify({
			type: "object",
			required: ["number", "name"],
			properties: { number: { type: "number" }, name: { type: "string" } },
		}),
	);
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

const emptyScope: Record<string, unknown> = { input: {}, steps: {} };

describe("block step: read", () => {
	it("reads a single block", () => {
		const result = executeBlock({ read: "issues" }, "load", emptyScope, tmpDir);
		assert.equal(result.status, "completed");
		const output = result.output as { issues: unknown[] };
		assert.equal(output.issues.length, 1);
		assert.equal((output.issues[0] as { id: string }).id, "g1");
	});

	it("reads multiple blocks", () => {
		const result = executeBlock({ read: ["issues", "architecture"] }, "load", emptyScope, tmpDir);
		assert.equal(result.status, "completed");
		const output = result.output as Record<string, unknown>;
		assert.ok(output.issues);
		assert.ok(output.architecture);
	});

	it("fails on missing required block", () => {
		const result = executeBlock({ read: ["issues", "nonexistent"] }, "load", emptyScope, tmpDir);
		assert.equal(result.status, "failed");
		assert.ok(result.error?.includes("nonexistent"));
	});

	it("returns null for optional missing block", () => {
		const result = executeBlock(
			{ read: ["issues", "nonexistent"], optional: ["nonexistent"] },
			"load",
			emptyScope,
			tmpDir,
		);
		assert.equal(result.status, "completed");
		const output = result.output as Record<string, unknown>;
		assert.ok(output.issues);
		assert.equal(output.nonexistent, null);
	});

	it("fails on missing single required block", () => {
		const result = executeBlock({ read: "nonexistent" }, "load", emptyScope, tmpDir);
		assert.equal(result.status, "failed");
		assert.ok(result.error?.includes("nonexistent"));
	});
});

describe("block step: readDir", () => {
	it("reads directory entries sorted", () => {
		const result = executeBlock({ readDir: "phases" }, "load-phases", emptyScope, tmpDir);
		assert.equal(result.status, "completed");
		const output = result.output as { number: number; name: string }[];
		assert.equal(output.length, 2);
		assert.equal(output[0].number, 1);
		assert.equal(output[1].number, 2);
	});

	it("returns empty array for missing directory", () => {
		const result = executeBlock({ readDir: "nonexistent" }, "load", emptyScope, tmpDir);
		assert.equal(result.status, "completed");
		assert.deepEqual(result.output, []);
	});

	it("fails on corrupt JSON in existing directory", () => {
		fs.writeFileSync(path.join(tmpDir, ".project", "phases", "03-corrupt.json"), "not json{");
		const result = executeBlock({ readDir: "phases" }, "load", emptyScope, tmpDir);
		assert.equal(result.status, "failed");
		assert.ok(result.error?.includes("Invalid JSON"));
		assert.ok(result.error?.includes("03-corrupt.json"));
	});

	it("returns empty array for empty directory", () => {
		const emptyDir = path.join(tmpDir, ".project", "empty");
		fs.mkdirSync(emptyDir, { recursive: true });
		const result = executeBlock({ readDir: "empty" }, "load", emptyScope, tmpDir);
		assert.equal(result.status, "completed");
		assert.deepEqual(result.output, []);
	});
});

describe("block step: write", () => {
	it("writes a block with schema validation", () => {
		const data = {
			issues: [
				{
					id: "g2",
					status: "open",
					title: "new",
					body: "new body",
					location: "test.ts:1",
					category: "issue",
					priority: "medium",
					package: "test",
				},
			],
		};
		const result = executeBlock({ write: { name: "issues", data } }, "save", emptyScope, tmpDir);
		assert.equal(result.status, "completed");
		const written = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "issues.json"), "utf-8"));
		assert.equal(written.issues[0].id, "g2");
	});

	it("fails on schema violation", () => {
		const data = { not_issues: "invalid" };
		const result = executeBlock({ write: { name: "issues", data } }, "save", emptyScope, tmpDir);
		assert.equal(result.status, "failed");
		assert.ok(result.error);
	});

	it("writes to subdirectory path", () => {
		const data = { number: 3, name: "cleanup" };
		const result = executeBlock(
			{ write: { name: "phase", data, path: "phases/03-cleanup" } },
			"save",
			emptyScope,
			tmpDir,
		);
		assert.equal(result.status, "completed");
		const written = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "phases", "03-cleanup.json"), "utf-8"));
		assert.equal(written.number, 3);
	});
});

describe("block step: append", () => {
	it("appends to block array", () => {
		const item = {
			id: "g2",
			status: "open",
			title: "appended",
			body: "appended body",
			location: "test.ts:2",
			category: "issue",
			priority: "medium",
			package: "test",
		};
		const result = executeBlock({ append: { name: "issues", key: "issues", item } }, "add", emptyScope, tmpDir);
		assert.equal(result.status, "completed");
		const data = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "issues.json"), "utf-8"));
		assert.equal(data.issues.length, 2);
		assert.equal(data.issues[1].id, "g2");
	});

	it("fails on nonexistent block", () => {
		const result = executeBlock({ append: { name: "nonexistent", key: "items", item: {} } }, "add", emptyScope, tmpDir);
		assert.equal(result.status, "failed");
	});
});

describe("block step: update", () => {
	it("updates item in block array", () => {
		const result = executeBlock(
			{ update: { name: "issues", key: "issues", match: { id: "g1" }, set: { status: "resolved" } } },
			"fix",
			emptyScope,
			tmpDir,
		);
		assert.equal(result.status, "completed");
		const data = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "issues.json"), "utf-8"));
		assert.equal(data.issues[0].status, "resolved");
	});

	it("fails when no match", () => {
		const result = executeBlock(
			{ update: { name: "issues", key: "issues", match: { id: "nonexistent" }, set: { status: "resolved" } } },
			"fix",
			emptyScope,
			tmpDir,
		);
		assert.equal(result.status, "failed");
	});
});

describe("block step: nestedAppend", () => {
	function setupReviews(): void {
		// Schema with nested findings — modeled on spec-reviews.
		fs.writeFileSync(
			path.join(tmpDir, ".project", "schemas", "spec-reviews.schema.json"),
			JSON.stringify({
				type: "object",
				required: ["reviews"],
				properties: {
					reviews: {
						type: "array",
						items: {
							type: "object",
							required: ["id", "findings"],
							properties: {
								id: { type: "string" },
								findings: {
									type: "array",
									items: {
										type: "object",
										required: ["id", "description", "severity"],
										properties: {
											id: { type: "string" },
											description: { type: "string" },
											severity: { type: "string", enum: ["info", "warning", "error"] },
											category: { type: "string" },
											state: { type: "string" },
											reporter: { type: "string" },
											created_at: { type: "string" },
										},
									},
								},
							},
						},
					},
				},
			}),
		);
		fs.writeFileSync(
			path.join(tmpDir, ".project", "spec-reviews.json"),
			JSON.stringify({ reviews: [{ id: "REVIEW-001", findings: [] }] }),
		);
	}

	it("appends item to nested array on matched parent", () => {
		setupReviews();
		const finding = {
			id: "REV-001-F001",
			description: "first finding",
			severity: "info",
			category: "spec-loop",
			state: "open",
			reporter: "agent/test",
			created_at: "2026-05-02T00:00:00Z",
		};
		const result = executeBlock(
			{
				nestedAppend: {
					name: "spec-reviews",
					key: "reviews",
					match: { id: "REVIEW-001" },
					nestedKey: "findings",
					item: finding,
				},
			},
			"add-finding",
			emptyScope,
			tmpDir,
		);
		assert.equal(result.status, "completed");
		const out = result.output as Record<string, unknown>;
		assert.equal(out.nestedAppended, "spec-reviews");
		assert.equal(out.nestedKey, "findings");
		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "spec-reviews.json"), "utf-8"));
		assert.equal(onDisk.reviews[0].findings.length, 1);
		assert.equal(onDisk.reviews[0].findings[0].id, "REV-001-F001");
	});

	it("fails with predicate-miss error when no parent matches", () => {
		setupReviews();
		const result = executeBlock(
			{
				nestedAppend: {
					name: "spec-reviews",
					key: "reviews",
					match: { id: "REVIEW-999" },
					nestedKey: "findings",
					item: { id: "x", description: "d", severity: "info" },
				},
			},
			"add-finding",
			emptyScope,
			tmpDir,
		);
		assert.equal(result.status, "failed");
		assert.ok(result.error?.includes("No matching item"));
		assert.ok(result.error?.includes("spec-reviews"));
	});

	it("resolves expressions in match and item before block-api call", () => {
		setupReviews();
		const scope = {
			input: { targetId: "REVIEW-001" },
			steps: {
				prev: {
					output: {
						id: "REV-001-EXPR",
						description: "from expr",
						severity: "warning",
					},
				},
			},
		};
		const result = executeBlock(
			{
				nestedAppend: {
					name: "spec-reviews",
					key: "reviews",
					match: { id: "${{ input.targetId }}" as unknown as string },
					nestedKey: "findings",
					item: "${{ steps.prev.output }}" as unknown,
				},
			},
			"add-finding",
			scope,
			tmpDir,
		);
		assert.equal(result.status, "completed", result.error);
		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "spec-reviews.json"), "utf-8"));
		assert.equal(onDisk.reviews[0].findings.length, 1);
		assert.equal(onDisk.reviews[0].findings[0].id, "REV-001-EXPR");
		assert.equal(onDisk.reviews[0].findings[0].severity, "warning");
	});
});

describe("block step: expression resolution", () => {
	it("resolves expressions in read block name", () => {
		const scope = { input: { blockName: "issues" }, steps: {} };
		const result = executeBlock({ read: "${{ input.blockName }}" as unknown as string }, "load", scope, tmpDir);
		assert.equal(result.status, "completed");
		assert.ok(result.output);
	});

	it("resolves expressions in write data", () => {
		const scope = {
			input: {},
			steps: {
				prev: {
					output: {
						issues: [
							{
								id: "new",
								status: "open",
								title: "from expr",
								body: "expr body",
								location: "test.ts:1",
								category: "issue",
								priority: "medium",
								package: "test",
							},
						],
					},
				},
			},
		};
		const result = executeBlock(
			{ write: { name: "issues", data: "${{ steps.prev.output }}" as unknown } },
			"save",
			scope,
			tmpDir,
		);
		assert.equal(result.status, "completed");
	});
});

describe("block step: updateNested", () => {
	function setupReviewsWithFinding(): void {
		fs.writeFileSync(
			path.join(tmpDir, ".project", "schemas", "spec-reviews.schema.json"),
			JSON.stringify({
				type: "object",
				required: ["reviews"],
				properties: {
					reviews: {
						type: "array",
						items: {
							type: "object",
							required: ["id", "findings"],
							properties: {
								id: { type: "string" },
								findings: {
									type: "array",
									items: {
										type: "object",
										required: ["id", "state"],
										properties: {
											id: { type: "string" },
											state: { type: "string", enum: ["open", "triaged", "resolved"] },
										},
									},
								},
							},
						},
					},
				},
			}),
		);
		fs.writeFileSync(
			path.join(tmpDir, ".project", "spec-reviews.json"),
			JSON.stringify({ reviews: [{ id: "REVIEW-001", findings: [{ id: "F-001", state: "open" }] }] }),
		);
	}

	it("happy path — updates nested item; documented output object present", () => {
		setupReviewsWithFinding();
		const result = executeBlock(
			{
				updateNested: {
					name: "spec-reviews",
					key: "reviews",
					match: { id: "REVIEW-001" },
					nestedKey: "findings",
					nestedMatch: { id: "F-001" },
					set: { state: "resolved" },
				},
			},
			"resolve-finding",
			emptyScope,
			tmpDir,
		);
		assert.equal(result.status, "completed", result.error);
		const out = result.output as Record<string, unknown>;
		assert.equal(out.updatedNested, "spec-reviews");
		assert.equal(out.nestedKey, "findings");
		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "spec-reviews.json"), "utf-8"));
		assert.equal(onDisk.reviews[0].findings[0].state, "resolved");
	});

	it("predicate miss on nested → step failed", () => {
		setupReviewsWithFinding();
		const result = executeBlock(
			{
				updateNested: {
					name: "spec-reviews",
					key: "reviews",
					match: { id: "REVIEW-001" },
					nestedKey: "findings",
					nestedMatch: { id: "F-999" },
					set: { state: "resolved" },
				},
			},
			"resolve-finding",
			emptyScope,
			tmpDir,
		);
		assert.equal(result.status, "failed");
		assert.ok(result.error?.includes("No matching nested item"));
	});

	it("resolves expressions in match, nestedMatch, and set before block-api call", () => {
		setupReviewsWithFinding();
		const scope = {
			input: { parentId: "REVIEW-001", findingId: "F-001" },
			steps: { prev: { output: { newState: "triaged" } } },
		};
		const result = executeBlock(
			{
				updateNested: {
					name: "spec-reviews",
					key: "reviews",
					match: { id: "${{ input.parentId }}" as unknown as string },
					nestedKey: "findings",
					nestedMatch: { id: "${{ input.findingId }}" as unknown as string },
					set: { state: "${{ steps.prev.output.newState }}" as unknown as string },
				},
			},
			"resolve-finding",
			scope,
			tmpDir,
		);
		assert.equal(result.status, "completed", result.error);
		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "spec-reviews.json"), "utf-8"));
		assert.equal(onDisk.reviews[0].findings[0].state, "triaged");
	});
});

describe("block step: remove", () => {
	it("happy path — removes matching item; documented output object present", () => {
		const result = executeBlock(
			{ remove: { name: "issues", key: "issues", match: { id: "g1" } } },
			"prune",
			emptyScope,
			tmpDir,
		);
		assert.equal(result.status, "completed", result.error);
		const out = result.output as Record<string, unknown>;
		assert.equal(out.removed, 1);
		assert.equal(out.name, "issues");
		const data = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "issues.json"), "utf-8"));
		assert.equal(data.issues.length, 0);
	});

	it("predicate miss → step completed with removed: 0 (idempotent)", () => {
		const result = executeBlock(
			{ remove: { name: "issues", key: "issues", match: { id: "nonexistent" } } },
			"prune",
			emptyScope,
			tmpDir,
		);
		assert.equal(result.status, "completed");
		const out = result.output as Record<string, unknown>;
		assert.equal(out.removed, 0);
	});

	it("resolves expressions in match before block-api call", () => {
		const scope = { input: { targetId: "g1" }, steps: {} };
		const result = executeBlock(
			{ remove: { name: "issues", key: "issues", match: { id: "${{ input.targetId }}" as unknown as string } } },
			"prune",
			scope,
			tmpDir,
		);
		assert.equal(result.status, "completed", result.error);
		const out = result.output as Record<string, unknown>;
		assert.equal(out.removed, 1);
	});
});

describe("block step: removeNested", () => {
	function setupReviewsWithFindings(): void {
		fs.writeFileSync(
			path.join(tmpDir, ".project", "schemas", "spec-reviews.schema.json"),
			JSON.stringify({
				type: "object",
				required: ["reviews"],
				properties: {
					reviews: {
						type: "array",
						items: {
							type: "object",
							required: ["id", "findings"],
							properties: {
								id: { type: "string" },
								findings: {
									type: "array",
									items: {
										type: "object",
										required: ["id"],
										properties: { id: { type: "string" } },
									},
								},
							},
						},
					},
				},
			}),
		);
		fs.writeFileSync(
			path.join(tmpDir, ".project", "spec-reviews.json"),
			JSON.stringify({
				reviews: [
					{
						id: "REVIEW-001",
						findings: [{ id: "F-001" }, { id: "F-002" }],
					},
				],
			}),
		);
	}

	it("happy path — removes matching nested items; documented output object present", () => {
		setupReviewsWithFindings();
		const result = executeBlock(
			{
				removeNested: {
					name: "spec-reviews",
					key: "reviews",
					match: { id: "REVIEW-001" },
					nestedKey: "findings",
					nestedMatch: { id: "F-001" },
				},
			},
			"drop-finding",
			emptyScope,
			tmpDir,
		);
		assert.equal(result.status, "completed", result.error);
		const out = result.output as Record<string, unknown>;
		assert.equal(out.removed, 1);
		assert.equal(out.nestedKey, "findings");
		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "spec-reviews.json"), "utf-8"));
		assert.equal(onDisk.reviews[0].findings.length, 1);
		assert.equal(onDisk.reviews[0].findings[0].id, "F-002");
	});

	it("nested predicate miss → step completed with removed: 0 (idempotent)", () => {
		setupReviewsWithFindings();
		const result = executeBlock(
			{
				removeNested: {
					name: "spec-reviews",
					key: "reviews",
					match: { id: "REVIEW-001" },
					nestedKey: "findings",
					nestedMatch: { id: "F-999" },
				},
			},
			"drop-finding",
			emptyScope,
			tmpDir,
		);
		assert.equal(result.status, "completed");
		const out = result.output as Record<string, unknown>;
		assert.equal(out.removed, 0);
	});

	it("parent predicate miss → step failed", () => {
		setupReviewsWithFindings();
		const result = executeBlock(
			{
				removeNested: {
					name: "spec-reviews",
					key: "reviews",
					match: { id: "REVIEW-999" },
					nestedKey: "findings",
					nestedMatch: { id: "F-001" },
				},
			},
			"drop-finding",
			emptyScope,
			tmpDir,
		);
		assert.equal(result.status, "failed");
		assert.ok(result.error?.includes("No matching item"));
	});

	it("resolves expressions in nestedMatch before block-api call", () => {
		setupReviewsWithFindings();
		const scope = { input: { findingId: "F-002" }, steps: {} };
		const result = executeBlock(
			{
				removeNested: {
					name: "spec-reviews",
					key: "reviews",
					match: { id: "REVIEW-001" },
					nestedKey: "findings",
					nestedMatch: { id: "${{ input.findingId }}" as unknown as string },
				},
			},
			"drop-finding",
			scope,
			tmpDir,
		);
		assert.equal(result.status, "completed", result.error);
		const out = result.output as Record<string, unknown>;
		assert.equal(out.removed, 1);
	});
});
