/**
 * Tests for the /context switch command family, step 8.
 *
 * Surface under test:
 * - `flipBootstrapPointer` — the pointer-flip primitive that preserves
 *   created_at + stamps previous_contextDir + switched_at + switched_by +
 *   bumps version to 1.1.0.
 * - `writeBootstrapPointer` v1.1.0 extras parameter — backwards-compat single-
 *   arg form vs three-arg-with-extras form.
 *
 * The slash command handlers (handleSwitch / handleList / handleArchive) are
 * not directly importable from index.ts (file-internal); their shared engine
 * functions (switchAndCreate / switchToExisting / switchToPrevious /
 * listSubstrates / archiveSubstrate) are also file-internal. End-to-end
 * coverage of those happens via the Pi tool surface tests in
 * context-switch-tool.test.ts (the tool bodies are the public boundary).
 */
import { strict as assert } from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
	BootstrapNotFoundError,
	flipBootstrapPointer,
	resolveContextDir,
	writeBootstrapPointer,
} from "./context-dir.js";

describe("writeBootstrapPointer — backwards-compat single-arg form", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "context-switch-write-test-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("writes pointer with version=1.0.0 and no pointer-history fields when extras omitted", () => {
		writeBootstrapPointer(tmpDir, ".project");
		const pointer = JSON.parse(fs.readFileSync(path.join(tmpDir, ".pi-context.json"), "utf-8"));
		assert.equal(pointer.contextDir, ".project");
		assert.equal(pointer.version, "1.0.0");
		assert.ok(typeof pointer.created_at === "string" && pointer.created_at.startsWith("20"));
		assert.equal(pointer.previous_contextDir, undefined);
		assert.equal(pointer.switched_at, undefined);
		assert.equal(pointer.switched_by, undefined);
	});

	it("writes pointer with version=1.1.0 and pointer-history fields when extras provided", () => {
		writeBootstrapPointer(tmpDir, ".context", {
			previous_contextDir: ".project",
			switched_at: "2026-05-30T00:00:00Z",
			switched_by: "test-operator",
		});
		const pointer = JSON.parse(fs.readFileSync(path.join(tmpDir, ".pi-context.json"), "utf-8"));
		assert.equal(pointer.contextDir, ".context");
		assert.equal(pointer.version, "1.1.0");
		assert.equal(pointer.previous_contextDir, ".project");
		assert.equal(pointer.switched_at, "2026-05-30T00:00:00Z");
		assert.equal(pointer.switched_by, "test-operator");
	});

	it("treats empty-but-present extras as no extras (version stays 1.0.0)", () => {
		writeBootstrapPointer(tmpDir, ".project", {});
		const pointer = JSON.parse(fs.readFileSync(path.join(tmpDir, ".pi-context.json"), "utf-8"));
		assert.equal(pointer.version, "1.0.0");
	});
});

describe("flipBootstrapPointer — preserves created_at + stamps pointer-history", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "context-switch-flip-test-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("throws BootstrapNotFoundError when no pointer exists to flip from", () => {
		assert.throws(
			() => flipBootstrapPointer(tmpDir, ".context", "test-op"),
			(err: Error) => {
				return err.name === "BootstrapNotFoundError";
			},
		);
	});

	it("preserves created_at from existing pointer + stamps previous_contextDir + switched_at + switched_by + bumps version to 1.1.0", () => {
		writeBootstrapPointer(tmpDir, ".project");
		const original = JSON.parse(fs.readFileSync(path.join(tmpDir, ".pi-context.json"), "utf-8"));
		const originalCreatedAt = original.created_at;

		// Sleep a tick to guarantee switched_at > created_at (deterministic
		// distinction without depending on system-clock granularity).
		const beforeFlip = Date.now();
		flipBootstrapPointer(tmpDir, ".context", "test-operator@example.com");
		const after = JSON.parse(fs.readFileSync(path.join(tmpDir, ".pi-context.json"), "utf-8"));

		assert.equal(after.contextDir, ".context");
		assert.equal(after.version, "1.1.0");
		assert.equal(after.created_at, originalCreatedAt, "created_at must be preserved across flip");
		assert.equal(after.previous_contextDir, ".project");
		assert.equal(after.switched_by, "test-operator@example.com");
		assert.ok(typeof after.switched_at === "string");
		const switchedAtMs = Date.parse(after.switched_at);
		assert.ok(switchedAtMs >= beforeFlip, "switched_at must be at-or-after the flip call time");
	});

	it("subsequent flip back to previous_contextDir preserves original created_at + populates previous_contextDir with the intermediate dir", () => {
		writeBootstrapPointer(tmpDir, ".project");
		const original = JSON.parse(fs.readFileSync(path.join(tmpDir, ".pi-context.json"), "utf-8"));

		flipBootstrapPointer(tmpDir, ".context", "test-op-1");
		const intermediate = JSON.parse(fs.readFileSync(path.join(tmpDir, ".pi-context.json"), "utf-8"));
		assert.equal(intermediate.contextDir, ".context");
		assert.equal(intermediate.previous_contextDir, ".project");

		flipBootstrapPointer(tmpDir, ".project", "test-op-2");
		const final = JSON.parse(fs.readFileSync(path.join(tmpDir, ".pi-context.json"), "utf-8"));
		assert.equal(final.contextDir, ".project");
		assert.equal(final.previous_contextDir, ".context", "previous_contextDir must reflect the intermediate dir");
		assert.equal(final.created_at, original.created_at, "original created_at preserved across two flips");
		assert.equal(final.switched_by, "test-op-2");
	});

	it("invalidates bootstrapCache so resolveContextDir reads the flipped value immediately", () => {
		writeBootstrapPointer(tmpDir, ".project");
		assert.equal(path.basename(resolveContextDir(tmpDir)), ".project");

		flipBootstrapPointer(tmpDir, ".context", "test-op");
		assert.equal(path.basename(resolveContextDir(tmpDir)), ".context", "resolver must see flipped pointer");
	});

	it("throws when existing pointer JSON is invalid", () => {
		fs.writeFileSync(path.join(tmpDir, ".pi-context.json"), "{not valid json", "utf-8");
		assert.throws(() => flipBootstrapPointer(tmpDir, ".context", "test-op"), /invalid JSON/);
	});

	it("throws when existing pointer lacks string contextDir", () => {
		fs.writeFileSync(path.join(tmpDir, ".pi-context.json"), JSON.stringify({ other: "field" }), "utf-8");
		assert.throws(() => flipBootstrapPointer(tmpDir, ".context", "test-op"), /lacks a string contextDir/);
	});
});

describe("flipBootstrapPointer — atomic write semantics", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "context-switch-atomic-test-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("leaves no .bootstrap-<pid>.tmp file after successful flip", () => {
		writeBootstrapPointer(tmpDir, ".project");
		flipBootstrapPointer(tmpDir, ".context", "test-op");
		const entries = fs.readdirSync(tmpDir);
		const tmpFiles = entries.filter((e) => e.includes(".bootstrap-"));
		assert.equal(tmpFiles.length, 0, `unexpected tmp files: ${tmpFiles.join(", ")}`);
	});

	it("uses BootstrapNotFoundError export — name-based catch works (cross-module-instance discipline)", () => {
		// Asserts the throw surfaces via the canonical exported class.
		try {
			flipBootstrapPointer(tmpDir, ".context", "test-op");
			assert.fail("expected throw");
		} catch (err) {
			assert.ok(
				err instanceof BootstrapNotFoundError,
				`expected BootstrapNotFoundError, got ${err?.constructor?.name}`,
			);
		}
	});
});
