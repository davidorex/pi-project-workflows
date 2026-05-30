/**
 * Tests for initProject's loud-fail-on-mismatch behavior per FGAP-179 / TASK-094 step 3.
 *
 * Pre-fix behavior: initProject silently ignored its contextDir arg when a
 * .pi-context.json already existed; the dir-scaffolding loop ran against the
 * EXISTING pointer's contextDir, and handleInit emitted a misleading
 * "Project initialized" message. Post-fix behavior throws
 * ContextInitMismatchError naming /context switch -c as the correct command
 * for changing the substrate dir.
 */
import { strict as assert } from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { writeBootstrapPointer } from "./context-dir.js";
import { ContextInitMismatchError, initProject } from "./index.js";

describe("initProject — loud-fail on arg/pointer divergence", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "context-init-loud-fail-test-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("no pointer exists → writes pointer carrying caller's arg + scaffolds dirs", () => {
		const result = initProject(tmpDir, ".project");
		const pointer = JSON.parse(fs.readFileSync(path.join(tmpDir, ".pi-context.json"), "utf-8"));
		assert.equal(pointer.contextDir, ".project");
		assert.ok(result.created.length > 0, "should create substrate + schemas dirs");
	});

	it("pointer exists AND existing.contextDir === requested → idempotent re-init (no throw)", () => {
		writeBootstrapPointer(tmpDir, ".project");
		const beforePointer = JSON.parse(fs.readFileSync(path.join(tmpDir, ".pi-context.json"), "utf-8"));
		const firstCreatedAt = beforePointer.created_at;

		const result = initProject(tmpDir, ".project");
		// Dirs scaffolded
		assert.ok(fs.existsSync(path.join(tmpDir, ".project")));
		// Pointer NOT re-written (created_at preserved — bootstrap timestamp
		// forensic must survive idempotent re-init).
		const afterPointer = JSON.parse(fs.readFileSync(path.join(tmpDir, ".pi-context.json"), "utf-8"));
		assert.equal(afterPointer.created_at, firstCreatedAt, "created_at must not change on idempotent re-init");
		// Result reports the dirs as either created (first time) or skipped (already exist).
		assert.ok(result.created.length + result.skipped.length > 0);
	});

	it("pointer exists AND existing.contextDir !== requested → throws ContextInitMismatchError", () => {
		writeBootstrapPointer(tmpDir, ".project");
		try {
			initProject(tmpDir, ".context");
			assert.fail("expected ContextInitMismatchError");
		} catch (err) {
			assert.ok(
				err instanceof ContextInitMismatchError,
				`expected ContextInitMismatchError, got ${err?.constructor?.name}`,
			);
			assert.equal(err.existing, ".project");
			assert.equal(err.requested, ".context");
			// Error message must name the correct command for the user/agent.
			assert.match(err.message, /\/context switch -c \.context/);
			assert.match(err.message, /\.project/);
		}
	});

	it("ContextInitMismatchError carries error name for cross-module-instance name-based catch", () => {
		writeBootstrapPointer(tmpDir, ".project");
		try {
			initProject(tmpDir, ".context");
			assert.fail("expected throw");
		} catch (err) {
			assert.ok(err instanceof Error);
			assert.equal(err.name, "ContextInitMismatchError");
		}
	});

	it("malformed pointer (non-string contextDir) throws structured error before any dir scaffolding", () => {
		fs.writeFileSync(path.join(tmpDir, ".pi-context.json"), JSON.stringify({ contextDir: 123 }), "utf-8");
		assert.throws(() => initProject(tmpDir, ".project"), /lacks a string contextDir/);
		// No substrate dir should have been created.
		assert.equal(fs.existsSync(path.join(tmpDir, ".project")), false);
	});
});
