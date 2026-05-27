import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadComposites } from "./composite-loader.js";

interface CapturedTool {
	name: string;
	parameters: unknown;
}

function makeStubPi(): { pi: ExtensionAPI; registered: CapturedTool[] } {
	const registered: CapturedTool[] = [];
	const pi = {
		registerTool: (tool: CapturedTool) => {
			registered.push(tool);
		},
	} as unknown as ExtensionAPI;
	return { pi, registered };
}

function makeProject(configBlock: Record<string, unknown> | null): string {
	const dir = mkdtempSync(join(tmpdir(), "composite-loader-"));
	const ctxDir = join(dir, ".project");
	mkdirSync(ctxDir, { recursive: true });
	writeFileSync(join(dir, ".pi-context.json"), JSON.stringify({ contextDir: ".project", version: "1.0.0" }));
	if (configBlock !== null) {
		writeFileSync(join(ctxDir, "config.json"), JSON.stringify(configBlock));
	}
	return dir;
}

const MINIMAL_CONFIG = {
	schema_version: "1.0.0",
	root: "project",
	block_kinds: [],
};

describe("loadComposites", () => {
	it("no config returns empty registered + skipped", () => {
		const dir = makeProject(null);
		const { pi, registered } = makeStubPi();
		const result = loadComposites(dir, pi);
		assert.deepEqual(result.registered, []);
		assert.deepEqual(result.skipped, []);
		assert.equal(registered.length, 0);
	});

	it("registers known KIND from config.tool_operations[]", () => {
		const dir = makeProject({
			...MINIMAL_CONFIG,
			tool_operations: [
				{
					canonical_id: "read-src",
					kind: "read-files",
					instance_params: { allowed_roots: ["src"] },
				},
			],
		});
		const { pi, registered } = makeStubPi();
		const result = loadComposites(dir, pi);
		assert.deepEqual(result.registered, ["read-src"]);
		assert.deepEqual(result.skipped, []);
		assert.equal(registered.length, 1);
		assert.equal(registered[0].name, "read-src");
	});

	it("skips unknown KIND (forward compat)", () => {
		const dir = makeProject({
			...MINIMAL_CONFIG,
			tool_operations: [
				{
					canonical_id: "future-thing",
					kind: "unknown-kind-v99",
					instance_params: {},
				},
			],
		});
		const { pi, registered } = makeStubPi();
		const result = loadComposites(dir, pi);
		assert.deepEqual(result.registered, []);
		assert.equal(result.skipped.length, 1);
		assert.equal(result.skipped[0].canonical_id, "future-thing");
		assert.equal(registered.length, 0);
	});

	it("refuses framework-forbidden token (L1)", () => {
		const dir = makeProject({
			...MINIMAL_CONFIG,
			tool_operations: [
				{
					canonical_id: "bash",
					kind: "command-allowlist",
					instance_params: { allowed_commands: ["bash"] },
				},
			],
		});
		const { pi } = makeStubPi();
		assert.throws(() => loadComposites(dir, pi), /refusing to register forbidden token: bash/);
	});

	it("refuses project-forbidden token (L5 union)", () => {
		const dir = makeProject({
			...MINIMAL_CONFIG,
			tool_operations_forbidden: ["project-banned-op"],
			tool_operations: [
				{
					canonical_id: "project-banned-op",
					kind: "read-files",
					instance_params: { allowed_roots: ["src"] },
				},
			],
		});
		const { pi } = makeStubPi();
		assert.throws(() => loadComposites(dir, pi), /refusing to register forbidden token: project-banned-op/);
	});
});
