/**
 * Tests for the resolveContextDir + BootstrapNotFoundError + writeBootstrapPointer
 * surface introduced in FGAP-026 closure phase 1.2.
 *
 * Coverage targets the resolver foundation per DEC-0015: the bootstrap-pointer
 * read path, the cache-invalidation behavior on pointer-mtime change, and the
 * cascade through every path-builder helper. Each test fixture writes the
 * pointer via `writeBootstrapPointer` (the same helper production callers will
 * use through `/context init`), so the fixtures dogfood the same surface
 * production code does — no parallel ungated path per FGAP-028.
 */

import { strict as assert } from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
	agentsDir,
	BootstrapNotFoundError,
	projectDir,
	projectTemplatesDir,
	resolveContextDir,
	schemaPath,
	schemasDir,
	writeBootstrapPointer,
} from "./project-dir.js";
import { ValidationError } from "./schema-validator.js";

describe("resolveContextDir", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-dir-test-"));
	});

	afterEach(() => {
		try {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		} catch {
			/* best-effort cleanup */
		}
	});

	it("returns the absolute substrate dir when pointer declares .project", () => {
		writeBootstrapPointer(tmpDir, ".project");
		const resolved = resolveContextDir(tmpDir);
		assert.equal(resolved, path.join(fs.realpathSync(tmpDir), ".project"));
	});

	it("returns the absolute substrate dir when pointer declares a non-default name", () => {
		writeBootstrapPointer(tmpDir, ".context-test");
		const resolved = resolveContextDir(tmpDir);
		assert.equal(resolved, path.join(fs.realpathSync(tmpDir), ".context-test"));
	});

	it("throws BootstrapNotFoundError when .pi-context.json is absent", () => {
		try {
			resolveContextDir(tmpDir);
			assert.fail("expected BootstrapNotFoundError");
		} catch (err) {
			assert.ok(err instanceof BootstrapNotFoundError, `expected BootstrapNotFoundError, got ${err}`);
			assert.equal((err as BootstrapNotFoundError).cwd, fs.realpathSync(tmpDir));
			assert.equal(
				(err as BootstrapNotFoundError).bootstrapPath,
				path.join(fs.realpathSync(tmpDir), ".pi-context.json"),
			);
			assert.match((err as Error).message, /run \/context init/);
		}
	});

	it("throws ValidationError when .pi-context.json is malformed (wrong type)", () => {
		const bootstrapPath = path.join(tmpDir, ".pi-context.json");
		fs.writeFileSync(bootstrapPath, JSON.stringify({ contextDir: 123 }));
		try {
			resolveContextDir(tmpDir);
			assert.fail("expected ValidationError");
		} catch (err) {
			assert.ok(err instanceof ValidationError, `expected ValidationError, got ${(err as Error).constructor.name}`);
		}
	});

	it("invalidates cache when bootstrap mtime changes (pointer rewrite returns new dir)", () => {
		writeBootstrapPointer(tmpDir, ".project");
		const first = resolveContextDir(tmpDir);
		assert.equal(first, path.join(fs.realpathSync(tmpDir), ".project"));

		// Rewrite to a different contextDir; writeBootstrapPointer flushes
		// its own cache + bumps mtime, so the next resolve picks up the change.
		writeBootstrapPointer(tmpDir, ".context-alt");
		const second = resolveContextDir(tmpDir);
		assert.equal(second, path.join(fs.realpathSync(tmpDir), ".context-alt"));
	});

	it("writeBootstrapPointer writes a valid pointer that round-trips through resolveContextDir", () => {
		writeBootstrapPointer(tmpDir, ".substrate");
		const bootstrapPath = path.join(tmpDir, ".pi-context.json");
		assert.ok(fs.existsSync(bootstrapPath));
		const parsed = JSON.parse(fs.readFileSync(bootstrapPath, "utf-8"));
		assert.equal(parsed.contextDir, ".substrate");
		assert.equal(parsed.version, "1.0.0");
		assert.match(parsed.created_at, /^\d{4}-\d{2}-\d{2}T/);
		assert.equal(resolveContextDir(tmpDir), path.join(fs.realpathSync(tmpDir), ".substrate"));
	});

	it("path-builder helpers cascade through resolver (every helper resolves under the declared contextDir)", () => {
		writeBootstrapPointer(tmpDir, ".custom-substrate");
		const root = path.join(fs.realpathSync(tmpDir), ".custom-substrate");

		assert.equal(projectDir(tmpDir), root);
		assert.equal(schemasDir(tmpDir), path.join(root, "schemas"));
		assert.equal(schemaPath(tmpDir, "issues"), path.join(root, "schemas", "issues.schema.json"));
		assert.equal(agentsDir(tmpDir), path.join(root, "agents"));
		assert.equal(projectTemplatesDir(tmpDir), path.join(root, "templates"));
	});
});
