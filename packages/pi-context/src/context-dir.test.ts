import { strict as assert } from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
	agentsDir,
	assertSubstrateName,
	BootstrapNotFoundError,
	contextTemplatesDir,
	resolveContextDir,
	schemaPath,
	schemasDir,
	tryResolveContextDir,
	writeBootstrapPointer,
} from "./context-dir.js";
import { ValidationError } from "./schema-validator.js";

describe("context-dir resolver + BootstrapNotFoundError + writeBootstrapPointer", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "context-dir-test-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("resolveContextDir returns absolute path when pointer declares .project", () => {
		writeBootstrapPointer(tmpDir, ".project");
		const result = resolveContextDir(tmpDir);
		// resolveContextDir does path.join(cwd, contextDir) verbatim; compare raw-to-raw
		assert.equal(result, path.join(tmpDir, ".project"));
	});

	it("resolveContextDir returns absolute path when pointer declares non-default contextDir", () => {
		writeBootstrapPointer(tmpDir, ".context-test");
		const result = resolveContextDir(tmpDir);
		assert.equal(result, path.join(tmpDir, ".context-test"));
	});

	it("resolveContextDir throws BootstrapNotFoundError when .pi-context.json absent", () => {
		// tmpDir has no bootstrap pointer written
		try {
			resolveContextDir(tmpDir);
			assert.fail("expected BootstrapNotFoundError");
		} catch (err) {
			assert.ok(
				err instanceof BootstrapNotFoundError,
				`expected BootstrapNotFoundError, got ${err?.constructor?.name}`,
			);
			assert.equal(err.cwd, tmpDir);
			assert.equal(err.bootstrapPath, path.join(tmpDir, ".pi-context.json"));
		}
	});

	it("resolveContextDir throws ValidationError on malformed pointer", () => {
		// Write malformed pointer — contextDir wrong type (number instead of string)
		const bootstrapPath = path.join(tmpDir, ".pi-context.json");
		fs.writeFileSync(bootstrapPath, JSON.stringify({ contextDir: 123, version: "1.0.0" }), "utf-8");
		assert.throws(() => resolveContextDir(tmpDir), ValidationError);
	});

	it("resolveContextDir cache invalidates when bootstrap mtime changes", () => {
		writeBootstrapPointer(tmpDir, ".project");
		const first = resolveContextDir(tmpDir);
		assert.equal(path.basename(first), ".project");

		// Rewrite pointer with different contextDir (writeBootstrapPointer invalidates cache entry)
		writeBootstrapPointer(tmpDir, ".context-alt");
		const second = resolveContextDir(tmpDir);
		assert.equal(path.basename(second), ".context-alt");
	});

	it("writeBootstrapPointer writes a valid pointer that round-trips through resolveContextDir", () => {
		writeBootstrapPointer(tmpDir, ".substrate-x");
		const bootstrapPath = path.join(tmpDir, ".pi-context.json");
		assert.ok(fs.existsSync(bootstrapPath), "pointer file should exist on disk");
		const parsed = JSON.parse(fs.readFileSync(bootstrapPath, "utf-8"));
		assert.equal(parsed.contextDir, ".substrate-x");
		assert.equal(parsed.version, "1.0.0");
		assert.equal(typeof parsed.created_at, "string");

		const resolved = resolveContextDir(tmpDir);
		assert.equal(path.basename(resolved), ".substrate-x");
	});

	it("tryResolveContextDir returns the joined dir when a pointer is present", () => {
		writeBootstrapPointer(tmpDir, ".context-try");
		assert.equal(tryResolveContextDir(tmpDir), path.join(tmpDir, ".context-try"));
	});

	it("tryResolveContextDir returns null when .pi-context.json is absent", () => {
		// tmpDir has no bootstrap pointer written — degrades to null, no throw
		assert.equal(tryResolveContextDir(tmpDir), null);
	});

	it("tryResolveContextDir re-throws ValidationError on a malformed pointer (does NOT swallow corruption)", () => {
		// Malformed pointer — contextDir wrong type; the primitive only catches
		// BootstrapNotFoundError, so validation failure must still surface.
		const bootstrapPath = path.join(tmpDir, ".pi-context.json");
		fs.writeFileSync(bootstrapPath, JSON.stringify({ contextDir: 123, version: "1.0.0" }), "utf-8");
		assert.throws(() => tryResolveContextDir(tmpDir), ValidationError);
	});

	it("path-builders (resolveContextDir/schemasDir/schemaPath/agentsDir/contextTemplatesDir) all cascade through resolver", () => {
		writeBootstrapPointer(tmpDir, ".context-builders");
		// Compare raw-to-raw: resolveContextDir does path.join(cwd, contextDir) verbatim;
		// no realpath canonicalization on either side.
		assert.equal(resolveContextDir(tmpDir), path.join(tmpDir, ".context-builders"));
		assert.equal(schemasDir(tmpDir), path.join(tmpDir, ".context-builders", "schemas"));
		assert.equal(
			schemaPath(tmpDir, "decisions"),
			path.join(tmpDir, ".context-builders", "schemas", "decisions.schema.json"),
		);
		assert.equal(agentsDir(tmpDir), path.join(tmpDir, ".context-builders", "agents"));
		assert.equal(contextTemplatesDir(tmpDir), path.join(tmpDir, ".context-builders", "templates"));
	});
});

describe("assertSubstrateName (FGAP-079 path-traversal guard)", () => {
	it("accepts canonical_ids ([A-Za-z0-9_-]+)", () => {
		assert.doesNotThrow(() => assertSubstrateName("framework-gaps"));
		assert.doesNotThrow(() => assertSubstrateName("spec-reviews"));
		assert.doesNotThrow(() => assertSubstrateName("tasks"));
		assert.doesNotThrow(() => assertSubstrateName("layer_plans"));
	});

	it("rejects traversal segments / path separators / dots / absolutes / empty", () => {
		const bad = ["../../etc/x", "a/b", "a\\b", "..", ".", "x.schema", "/abs", ""];
		for (const name of bad) {
			assert.throws(
				() => assertSubstrateName(name),
				/Invalid substrate name/,
				`expected throw for ${JSON.stringify(name)}`,
			);
		}
	});

	it("schemaPath rejects a traversal name before any path resolution (no substrate needed)", () => {
		// The guard fires inside schemaPath ahead of resolveContextDir, so a
		// missing bootstrap pointer at "." never matters — the name is rejected first.
		assert.throws(() => schemaPath(".", "../../etc/x"), /Invalid substrate name/);
	});
});
