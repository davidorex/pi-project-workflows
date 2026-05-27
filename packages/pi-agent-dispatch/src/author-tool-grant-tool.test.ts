import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { writeBootstrapPointer } from "@davidorex/pi-context/context-dir";
import type { AgentToolUpdateCallback, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { authorToolGrantTool } from "./author-tool-grant-tool.js";

const noopUpdate: AgentToolUpdateCallback = () => {};

function mockCtx(cwd: string): ExtensionContext {
	return { cwd } as unknown as ExtensionContext;
}

function makeProject(): { dir: string; substrate: string } {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "author-tool-grant-"));
	const substrateName = "substrate";
	fs.mkdirSync(path.join(dir, substrateName), { recursive: true });
	writeBootstrapPointer(dir, substrateName);
	// Seed a minimal config.json
	const cfg = {
		schema_version: "1.0.0",
		root: "substrate",
		block_kinds: [],
		tool_operations: [],
		tool_operations_forbidden: [],
	};
	fs.writeFileSync(path.join(dir, substrateName, "config.json"), JSON.stringify(cfg));
	return { dir, substrate: substrateName };
}

describe("authorToolGrantTool", () => {
	let tmpDir: string;
	let signal: AbortSignal;

	beforeEach(() => {
		const p = makeProject();
		tmpDir = p.dir;
		signal = new AbortController().signal;
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("rejects writer.kind=agent (DEC-0047 human-only)", async () => {
		await assert.rejects(
			authorToolGrantTool.execute(
				"c1",
				{
					target: "tool_operations",
					operation: "add",
					key: "x",
					entry: { canonical_id: "x" },
					writer: { kind: "agent", user: "irrelevant" },
				},
				signal,
				noopUpdate,
				mockCtx(tmpDir),
			),
			/DEC-0047/,
		);
	});

	it("rejects writer.kind=monitor", async () => {
		await assert.rejects(
			authorToolGrantTool.execute(
				"c1",
				{
					target: "tool_operations",
					operation: "add",
					key: "x",
					entry: { canonical_id: "x" },
					writer: { kind: "monitor", user: "" },
				},
				signal,
				noopUpdate,
				mockCtx(tmpDir),
			),
			/DEC-0047/,
		);
	});

	it("rejects writer.kind=workflow", async () => {
		await assert.rejects(
			authorToolGrantTool.execute(
				"c1",
				{
					target: "tool_operations",
					operation: "add",
					key: "x",
					entry: { canonical_id: "x" },
					writer: { kind: "workflow", user: "" },
				},
				signal,
				noopUpdate,
				mockCtx(tmpDir),
			),
			/DEC-0047/,
		);
	});

	it("happy path: tool_operations add via human writer", async () => {
		const result = await authorToolGrantTool.execute(
			"c1",
			{
				target: "tool_operations",
				operation: "add",
				key: "read-src",
				entry: { canonical_id: "read-src", kind: "read-files", instance_params: { allowed_roots: ["src"] } },
				writer: { kind: "human", user: "davidryan@gmail.com" },
			},
			signal,
			noopUpdate,
			mockCtx(tmpDir),
		);
		assert.match(result.content[0].text as string, /add tool_operations\[read-src\]/);
		const cfg = JSON.parse(fs.readFileSync(path.join(tmpDir, "substrate", "config.json"), "utf-8"));
		assert.equal(cfg.tool_operations.length, 1);
		assert.equal(cfg.tool_operations[0].canonical_id, "read-src");
	});

	it("refuses forbidden-wholesale add attempt (bash)", async () => {
		await assert.rejects(
			authorToolGrantTool.execute(
				"c1",
				{
					target: "tool_operations",
					operation: "add",
					key: "bash",
					entry: { canonical_id: "bash" },
					writer: { kind: "human", user: "davidryan@gmail.com" },
				},
				signal,
				noopUpdate,
				mockCtx(tmpDir),
			),
			/refusing to register forbidden wholesale token 'bash'/,
		);
	});

	it("happy path: tool_operations_forbidden add via human writer", async () => {
		const result = await authorToolGrantTool.execute(
			"c1",
			{
				target: "tool_operations_forbidden",
				operation: "add",
				key: "project-banned-op",
				writer: { kind: "human", user: "davidryan@gmail.com" },
			},
			signal,
			noopUpdate,
			mockCtx(tmpDir),
		);
		assert.match(result.content[0].text as string, /add tool_operations_forbidden\[project-banned-op\]/);
		const cfg = JSON.parse(fs.readFileSync(path.join(tmpDir, "substrate", "config.json"), "utf-8"));
		assert.ok(cfg.tool_operations_forbidden.includes("project-banned-op"));
	});

	it("refuses adding an L1 token to tool_operations_forbidden (redundancy)", async () => {
		await assert.rejects(
			authorToolGrantTool.execute(
				"c1",
				{
					target: "tool_operations_forbidden",
					operation: "add",
					key: "bash",
					writer: { kind: "human", user: "davidryan@gmail.com" },
				},
				signal,
				noopUpdate,
				mockCtx(tmpDir),
			),
			/already in L1 framework FORBIDDEN_WHOLESALE_OPERATIONS/,
		);
	});
});
