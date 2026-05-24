import { strict as assert } from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
	type BlockSnapshot,
	rollbackBlockFiles,
	snapshotBlockFiles,
	validateChangedBlocks,
} from "./block-validation.js";

describe("block-validation pointer-less degradation (tryResolveContextDir class fix)", () => {
	let tmpDir: string;

	beforeEach(() => {
		// No writeBootstrapPointer — tmpDir deliberately has NO .pi-context.json,
		// so each surface must degrade rather than throw BootstrapNotFoundError.
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "block-validation-test-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("snapshotBlockFiles returns an empty Map when no .pi-context.json pointer exists", () => {
		const snap = snapshotBlockFiles(tmpDir);
		assert.ok(snap instanceof Map);
		assert.equal(snap.size, 0);
	});

	it("validateChangedBlocks does not throw when no .pi-context.json pointer exists", () => {
		const empty: BlockSnapshot = new Map();
		assert.doesNotThrow(() => validateChangedBlocks(tmpDir, empty));
	});

	it("rollbackBlockFiles returns [] when no .pi-context.json pointer exists", () => {
		const empty: BlockSnapshot = new Map();
		assert.deepEqual(rollbackBlockFiles(tmpDir, empty), []);
	});
});
