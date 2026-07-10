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

	it("body trusts writer field as-is (auth-gate at pi-dispatch is the canonical identity check); writer.kind=agent passes through to the persistence path without throwing", async () => {
		// This assertion encodes the canonical model, now that the dispatch-layer
		// writer-identity gate exists: the
		// tool body does not re-check writer.kind. The auth-gate handler
		// on pi.on('tool_call') is the structural identity check; once
		// the operator has authorized, the body trusts whatever writer
		// the (possibly auth-gate-mutated) input carries. In production
		// the auth-gate overwrites writer to the verified-operator
		// identity; in this unit test we bypass the gate and supply a
		// non-human writer directly. The body must not throw.
		const result = await authorAgentSpecTool.execute(
			"body-trusts-writer",
			{ name: "trusted", spec: validSpec(), writer: { kind: "agent", user: "agent-id-1" } },
			signal,
			noopUpdate,
			mockCtx(tmpDir),
		);
		const expectedPath = path.join(tmpDir, "substrate", "agents", "trusted.agent.yaml");
		assert.ok(fs.existsSync(expectedPath), `expected ${expectedPath} to exist`);
		assert.match(result.content[0].text, /Wrote .*trusted\.agent\.yaml/);
	});

	it("throws when writer.user is missing (only structural precondition for DispatchContext construction)", async () => {
		await assert.rejects(
			authorAgentSpecTool.execute(
				"call-missing-user",
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
