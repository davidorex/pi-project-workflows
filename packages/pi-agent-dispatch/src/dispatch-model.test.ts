import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { writeBootstrapPointer } from "@davidorex/pi-context/context-dir";
import { resolveDispatchModel } from "./dispatch-model.js";

// resolveDispatchModel mirrors the workflow executor's model precedence at the
// dispatch boundary (DEC-0023): spec.model → model-config by_role[role] →
// model-config default → null. model-config is read via pi-context readBlock,
// which reads <cwd>/<substrate>/model-config.json; a substrate with no such file
// is the absent-block case (readBlock throws → resolution falls through to null).
describe("resolveDispatchModel", () => {
	let tmpDir: string;
	let substrateRoot: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-agent-dispatch-model-"));
		substrateRoot = path.join(tmpDir, "substrate");
		fs.mkdirSync(substrateRoot, { recursive: true });
		writeBootstrapPointer(tmpDir, "substrate");
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	function writeModelConfig(config: { by_role?: Record<string, string>; default?: string }): void {
		fs.writeFileSync(path.join(substrateRoot, "model-config.json"), JSON.stringify(config));
	}

	it("spec.model wins over model-config", () => {
		writeModelConfig({ by_role: { sensor: "role/m" }, default: "def/m" });
		assert.equal(resolveDispatchModel(tmpDir, { model: "spec/m", role: "sensor" }), "spec/m");
	});

	it("falls to model-config by_role[role] when the spec names no model", () => {
		writeModelConfig({ by_role: { sensor: "role/m" }, default: "def/m" });
		assert.equal(resolveDispatchModel(tmpDir, { role: "sensor" }), "role/m");
	});

	it("falls to model-config default when no by_role entry matches the role", () => {
		writeModelConfig({ by_role: { sensor: "role/m" }, default: "def/m" });
		assert.equal(resolveDispatchModel(tmpDir, { role: "unmapped" }), "def/m");
	});

	it("falls to model-config default when the spec carries no role at all", () => {
		writeModelConfig({ by_role: { sensor: "role/m" }, default: "def/m" });
		assert.equal(resolveDispatchModel(tmpDir, {}), "def/m");
	});

	it("returns null when the model-config block is absent (readBlock throws → fall-through)", () => {
		assert.equal(resolveDispatchModel(tmpDir, { role: "sensor" }), null);
	});

	it("returns null when model-config has neither a matching by_role entry nor a default", () => {
		writeModelConfig({ by_role: { sensor: "role/m" } });
		assert.equal(resolveDispatchModel(tmpDir, { role: "unmapped" }), null);
	});
});
