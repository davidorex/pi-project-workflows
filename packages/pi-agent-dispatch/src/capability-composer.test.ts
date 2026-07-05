import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { writeBootstrapPointer } from "@davidorex/pi-context/context-dir";
import { composeToolGrant, resolveOperationVocabulary } from "./capability-composer.js";
import { TOOL_OPERATION_DEFAULTS } from "./operation-vocab.js";

describe("composeToolGrant", () => {
	it("returns empty when parent grant is empty (default-empty clamp)", () => {
		const result = composeToolGrant([], ["read-block", "write-block"]);
		assert.deepEqual(result, []);
	});

	it("returns requested unchanged when requested ⊆ parent", () => {
		const result = composeToolGrant(["read-block", "write-block", "amend-config"], ["read-block", "write-block"]);
		assert.deepEqual(result, ["read-block", "write-block"]);
	});

	it("returns only the intersection when requested ⊃ parent", () => {
		const result = composeToolGrant(["read-block"], ["read-block", "write-block"]);
		assert.deepEqual(result, ["read-block"]);
	});

	it("returns empty when sets are disjoint", () => {
		const result = composeToolGrant(["read-block"], ["write-block", "amend-config"]);
		assert.deepEqual(result, []);
	});

	it("returns empty when both parent and requested are undefined", () => {
		const result = composeToolGrant(undefined, undefined);
		assert.deepEqual(result, []);
	});
});

describe("resolveOperationVocabulary", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-agent-dispatch-test-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("returns defaults when no .pi-context.json pointer is present", () => {
		const result = resolveOperationVocabulary(tmpDir);
		assert.deepEqual(result, { ...TOOL_OPERATION_DEFAULTS });
	});

	it("merges defaults with config.tool_operations overrides", () => {
		const substrateName = "substrate";
		const substrateDir = path.join(tmpDir, substrateName);
		fs.mkdirSync(substrateDir, { recursive: true });
		writeBootstrapPointer(tmpDir, substrateName);
		fs.writeFileSync(
			path.join(substrateDir, "config.json"),
			JSON.stringify({
				schema_version: "1.8.0",
				root: "substrate",
				block_kinds: [],
				tool_operations: [
					{ canonical_id: "read-block", display_name: "Custom Read", category: "context" },
					{ canonical_id: "custom-op", display_name: "Custom Operation", category: "custom" },
				],
			}),
		);
		const result = resolveOperationVocabulary(tmpDir);
		assert.equal(result["read-block"]?.display_name, "Custom Read");
		assert.equal(result["custom-op"]?.canonical_id, "custom-op");
		// Defaults still present for un-overridden operations
		assert.equal(result["amend-config"]?.canonical_id, "amend-config");
	});

	it("fail-safe: a config with an unresolvable schema_version yields defaults, never the raw un-migrated overrides", () => {
		const substrateName = "substrate";
		const substrateDir = path.join(tmpDir, substrateName);
		fs.mkdirSync(substrateDir, { recursive: true });
		writeBootstrapPointer(tmpDir, substrateName);
		// schema_version 0.0.1 has no registered chain to the bundled config
		// schema — the migration-aware read throws and the reader must collapse
		// to the defaults rather than surface the raw tool_operations.
		fs.writeFileSync(
			path.join(substrateDir, "config.json"),
			JSON.stringify({
				schema_version: "0.0.1",
				root: "substrate",
				block_kinds: [],
				tool_operations: [{ canonical_id: "custom-op", display_name: "Should Not Surface", category: "custom" }],
			}),
		);
		const result = resolveOperationVocabulary(tmpDir);
		assert.deepEqual(result, { ...TOOL_OPERATION_DEFAULTS });
	});
});
