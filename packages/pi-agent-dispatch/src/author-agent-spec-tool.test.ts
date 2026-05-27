import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { writeBootstrapPointer } from "@davidorex/pi-context/context-dir";
import { parseAgentYaml } from "@davidorex/pi-jit-agents/agent-spec";
import type { AgentToolUpdateCallback, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { authorAgentSpecTool } from "./author-agent-spec-tool.js";

const noopUpdate: AgentToolUpdateCallback = () => {};

function mockCtx(cwd: string): ExtensionContext {
	return { cwd } as unknown as ExtensionContext;
}

function validSpec(): Record<string, unknown> {
	return {
		role: "sensor",
		description: "test agent",
		model: "anthropic/claude-haiku-4.5",
		prompt: { system: "You are a test agent.", task: "Do nothing." },
		input: { type: "object", properties: { in: { type: "string" } } },
		output: { format: "json" },
	};
}

describe("authorAgentSpecTool", () => {
	let tmpDir: string;
	let signal: AbortSignal;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-agent-dispatch-author-"));
		const substrateName = "substrate";
		fs.mkdirSync(path.join(tmpDir, substrateName), { recursive: true });
		writeBootstrapPointer(tmpDir, substrateName);
		signal = new AbortController().signal;
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("throws when writer.kind=agent (DEC-0047 human-only)", async () => {
		await assert.rejects(
			authorAgentSpecTool.execute(
				"call-1",
				{ name: "test", spec: validSpec(), writer: { kind: "agent", user: "x" } },
				signal,
				noopUpdate,
				mockCtx(tmpDir),
			),
			/writer\.kind must be 'human' per DEC-0047/,
		);
	});

	it("throws when writer.kind=monitor (DEC-0047 human-only)", async () => {
		await assert.rejects(
			authorAgentSpecTool.execute(
				"call-2",
				{ name: "test", spec: validSpec(), writer: { kind: "monitor", user: "x" } },
				signal,
				noopUpdate,
				mockCtx(tmpDir),
			),
			/writer\.kind must be 'human' per DEC-0047/,
		);
	});

	it("throws when writer.kind=workflow (DEC-0047 human-only)", async () => {
		await assert.rejects(
			authorAgentSpecTool.execute(
				"call-3",
				{ name: "test", spec: validSpec(), writer: { kind: "workflow", user: "x" } },
				signal,
				noopUpdate,
				mockCtx(tmpDir),
			),
			/writer\.kind must be 'human' per DEC-0047/,
		);
	});

	it("throws when writer.kind=human but user is missing", async () => {
		await assert.rejects(
			authorAgentSpecTool.execute(
				"call-4",
				{ name: "test", spec: validSpec(), writer: { kind: "human", user: "" } },
				signal,
				noopUpdate,
				mockCtx(tmpDir),
			),
			/writer\.user is required/,
		);
	});

	it("writes the spec file when writer.kind=human + valid spec; parseAgentYaml round-trips", async () => {
		const result = await authorAgentSpecTool.execute(
			"call-5",
			{ name: "happy-agent", spec: validSpec(), writer: { kind: "human", user: "davidryan@gmail.com" } },
			signal,
			noopUpdate,
			mockCtx(tmpDir),
		);
		const expectedPath = path.join(tmpDir, "substrate", "agents", "happy-agent.agent.yaml");
		assert.ok(fs.existsSync(expectedPath), `expected ${expectedPath} to exist`);
		assert.match(result.content[0].text, /Wrote .*happy-agent\.agent\.yaml/);
		const parsed = parseAgentYaml(expectedPath);
		assert.equal(parsed.name, "happy-agent");
		assert.equal(parsed.role, "sensor");
	});
});
