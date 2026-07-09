/**
 * Tests for the comment-citation scanner (scripts/scan-comment-citations.ts).
 *
 * Synthetic-fixture cells exercise scanFile directly against in-memory TS
 * source strings (JSDoc / line-comment / zero-citation), asserting exact
 * instances/commentKind shape. A live-repo integration cell reads the actual
 * on-disk pi-agent-dispatch files that motivated this task (issue-012's
 * stale-provenance-id investigation) and pins a subset of that finding as a
 * regression — see the in-line note below on the two ids (TASK-091, plus
 * DEC-0044/DEC-0018 not asserted here) that the task's acceptance criteria
 * named as present in these two files but which a direct grep of the live
 * files at implementation time did NOT confirm; those three ids were found
 * instead in sibling pi-agent-dispatch/src files (index.ts, real-check-runner.ts,
 * call-agent-tool.ts) during this task's own runtime-demo investigation.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { classifyComment, scanFile, scanRepo } from "./scan-comment-citations.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

describe("classifyComment", () => {
	it("classifies // as line", () => {
		assert.equal(classifyComment("// see DEC-0044"), "line");
	});
	it("classifies /** ... */ as jsdoc", () => {
		assert.equal(classifyComment("/** FEAT-006 */"), "jsdoc");
	});
	it("classifies /* ... */ (non-jsdoc) as block", () => {
		assert.equal(classifyComment("/* plain block */"), "block");
	});
	it("classifies the degenerate empty /**/ as block, not jsdoc", () => {
		assert.equal(classifyComment("/**/"), "block");
	});
});

describe("scanFile — synthetic fixtures", () => {
	it("finds exactly 2 instances in a JSDoc block citing FEAT-006 and TASK-088", () => {
		const src = [
			"/**",
			" * Some function per FEAT-006 north-star loop.",
			" * Schema declared by TASK-088.",
			" */",
			"function f() {}",
			"",
		].join("\n");
		const instances = scanFile("synthetic-jsdoc.ts", src);
		assert.equal(instances.length, 2);
		const ids = instances.map((i) => i.id).sort();
		assert.deepEqual(ids, ["FEAT-006", "TASK-088"]);
		for (const inst of instances) {
			assert.equal(inst.commentKind, "jsdoc");
			assert.equal(inst.file, "synthetic-jsdoc.ts");
		}
	});

	it("finds exactly 1 instance in a line comment citing DEC-0044", () => {
		const src = ["const x = 1; // see DEC-0044 for governance", "", ""].join("\n");
		const instances = scanFile("synthetic-line.ts", src);
		assert.equal(instances.length, 1);
		assert.equal(instances[0].id, "DEC-0044");
		assert.equal(instances[0].commentKind, "line");
		assert.equal(instances[0].line, 1);
	});

	it("finds zero instances in a file with no citations, without crashing", () => {
		const src = [
			"/**",
			" * A perfectly ordinary doc comment with no ids at all.",
			" */",
			"export function noop(): void {",
			"  // nothing to see here",
			"}",
			"",
		].join("\n");
		const instances = scanFile("synthetic-clean.ts", src);
		assert.deepEqual(instances, []);
	});

	it("reports the correct line number for a citation past the first line", () => {
		const src = ["line one", "line two", "// TASK-088 on line three", "line four"].join("\n");
		const instances = scanFile("synthetic-lines.ts", src);
		assert.equal(instances.length, 1);
		assert.equal(instances[0].line, 3);
	});
});

describe("scanRepo — live-repo integration (issue-012 regression pin)", () => {
	it("finds FEAT-006 and TASK-088 in the two named pi-agent-dispatch files", () => {
		const targets = [
			"packages/pi-agent-dispatch/src/work-order-loop.ts",
			"packages/pi-agent-dispatch/src/run-work-order-loop-tool.ts",
		];
		const instances = targets.flatMap((rel) => {
			const abs = path.join(repoRoot, rel);
			const text = fs.readFileSync(abs, "utf-8");
			return scanFile(rel, text);
		});
		const ids = new Set(instances.map((i) => i.id));
		assert.ok(ids.has("FEAT-006"), "expected FEAT-006 among the two named files' instances");
		assert.ok(ids.has("TASK-088"), "expected TASK-088 among the two named files' instances");
		assert.ok(ids.has("DEC-0047"), "expected DEC-0047 among the two named files' instances");
		assert.ok(ids.has("DEC-0014"), "expected DEC-0014 among the two named files' instances");
	});

	it("finds TASK-091 within the broader pi-agent-dispatch package (not confined to the two named files)", () => {
		// TASK-107's acceptance criteria named TASK-091 as present in the two
		// files above; a direct grep at implementation time did not confirm that
		// (see this file's header note). It IS present elsewhere under
		// packages/pi-agent-dispatch/src/ (index.ts), so the full-package scan
		// pins that as the actual regression rather than asserting a location
		// the live tree does not support.
		const report = scanRepo(repoRoot);
		const hit = report.instances.find(
			(i) => i.id === "TASK-091" && i.file.startsWith("packages/pi-agent-dispatch/src/"),
		);
		assert.ok(hit, "expected a TASK-091 instance somewhere under packages/pi-agent-dispatch/src/");
	});
});

describe("scanRepo — full monorepo run", () => {
	it("runs clean over the real repo and produces a well-shaped report", () => {
		const report = scanRepo(repoRoot);
		assert.ok(report.scannedPackages.includes("packages/pi-agent-dispatch"));
		assert.equal(report.totalInstances, report.instances.length);
		assert.equal(report.totalFiles, Object.keys(report.byFile).length);
		for (const [id, count] of Object.entries(report.byId)) {
			assert.equal(report.instances.filter((i) => i.id === id).length, count);
		}
	});
});
