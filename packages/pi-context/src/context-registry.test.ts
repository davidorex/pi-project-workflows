import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
	contextRegistryPath,
	invalidateRegistry,
	loadRegistry,
	REGISTRY_FILE_VERSION,
	type RegistryFile,
	registerSubstrate,
	resolveAlias,
	resolveSubstrateDir,
	writeRegistry,
} from "./context-registry.js";
import { ValidationError } from "./schema-validator.js";

function makeTmpDir(prefix: string): string {
	// The registry is a PROJECT-ROOT file — no bootstrap pointer / substrate dir
	// is required for the registry-store surface itself (contrast migrations,
	// which resolve through the active substrate dir).
	return fs.mkdtempSync(path.join(os.tmpdir(), `context-registry-${prefix}-`));
}

const SUB_A = "sub-0000000000000aaa";
const SUB_B = "sub-1111111111111bbb";

describe("context-registry: load + writeRegistry", () => {
	it("loadRegistry returns null when file absent (pre-write state)", (t) => {
		const cwd = makeTmpDir("load-absent");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		assert.equal(loadRegistry(cwd), null);
	});

	it("writeRegistry + loadRegistry round-trips byte-faithfully", (t) => {
		const cwd = makeTmpDir("round-trip");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const original: RegistryFile = {
			version: REGISTRY_FILE_VERSION,
			substrates: { [SUB_A]: { dir: ".context", aliases: ["project"] } },
		};
		writeRegistry(cwd, original);
		const round = loadRegistry(cwd);
		assert.deepEqual(round, original);
	});

	it("loadRegistry rejects a malformed payload with ValidationError (AJV)", (t) => {
		const cwd = makeTmpDir("malformed");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		// Hand-write an on-disk registry missing the required `substrates` field —
		// bypasses writeRegistry so AJV validation runs at load time.
		fs.writeFileSync(contextRegistryPath(cwd), JSON.stringify({ version: "1.0.0" }), "utf-8");
		invalidateRegistry(cwd);
		assert.throws(() => loadRegistry(cwd), ValidationError);
	});

	it("writeRegistry rejects a malformed registry (schema-validation on write; prior file intact)", (t) => {
		const cwd = makeTmpDir("write-malformed");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		// Seed a valid registry first.
		const good: RegistryFile = {
			version: REGISTRY_FILE_VERSION,
			substrates: { [SUB_A]: { dir: ".context", aliases: [] } },
		};
		writeRegistry(cwd, good);
		// A substrate key not matching ^sub-[0-9a-f]{16}$ violates propertyNames.
		const bad = {
			version: REGISTRY_FILE_VERSION,
			substrates: { "not-a-substrate-id": { dir: ".x", aliases: [] } },
		} as unknown as RegistryFile;
		assert.throws(() => writeRegistry(cwd, bad), ValidationError);
		// Prior valid file remains byte-faithful (atomic tmp+rename: bad write
		// never replaced it).
		assert.deepEqual(loadRegistry(cwd), good);
	});
});

describe("context-registry: registerSubstrate + resolution", () => {
	it("registerSubstrate creates the registry and round-trips the entry", (t) => {
		const cwd = makeTmpDir("register-create");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		assert.equal(loadRegistry(cwd), null);
		registerSubstrate(cwd, SUB_A, ".context-jit-spec-v2", []);
		const reg = loadRegistry(cwd);
		assert.ok(reg);
		assert.equal(reg?.version, REGISTRY_FILE_VERSION);
		assert.deepEqual(reg?.substrates[SUB_A], { dir: ".context-jit-spec-v2", aliases: [] });
	});

	it("resolveSubstrateDir returns the dir on hit, null on miss", (t) => {
		const cwd = makeTmpDir("resolve-dir");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		// miss against an absent registry → null (no throw)
		assert.equal(resolveSubstrateDir(cwd, SUB_A), null);
		registerSubstrate(cwd, SUB_A, ".context", []);
		assert.equal(resolveSubstrateDir(cwd, SUB_A), ".context");
		// miss against a present registry → null (no throw)
		assert.equal(resolveSubstrateDir(cwd, SUB_B), null);
	});

	it("resolveAlias returns the owning substrate_id on hit, null on miss", (t) => {
		const cwd = makeTmpDir("resolve-alias");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		// miss against absent registry → null
		assert.equal(resolveAlias(cwd, "project"), null);
		registerSubstrate(cwd, SUB_A, ".context", ["project", "legacy"]);
		registerSubstrate(cwd, SUB_B, ".other", []);
		assert.equal(resolveAlias(cwd, "project"), SUB_A);
		assert.equal(resolveAlias(cwd, "legacy"), SUB_A);
		// miss against a present registry → null
		assert.equal(resolveAlias(cwd, "nonexistent"), null);
	});

	it("registerSubstrate is idempotent on the same dir (no duplicate entry)", (t) => {
		const cwd = makeTmpDir("idempotent");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		registerSubstrate(cwd, SUB_A, ".context", []);
		registerSubstrate(cwd, SUB_A, ".context", []);
		const reg = loadRegistry(cwd);
		assert.ok(reg);
		assert.equal(Object.keys(reg?.substrates ?? {}).length, 1);
		assert.deepEqual(reg?.substrates[SUB_A], { dir: ".context", aliases: [] });
	});

	it("registerSubstrate upserts a renamed dir under the unchanged substrate_id", (t) => {
		const cwd = makeTmpDir("rename");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		registerSubstrate(cwd, SUB_A, ".context", []);
		registerSubstrate(cwd, SUB_A, ".context-renamed", []);
		const reg = loadRegistry(cwd);
		assert.equal(Object.keys(reg?.substrates ?? {}).length, 1);
		assert.equal(resolveSubstrateDir(cwd, SUB_A), ".context-renamed");
	});
});
