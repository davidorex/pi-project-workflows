import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { writeBootstrapPointer } from "@davidorex/pi-context/context-dir";
import { AgentNotFoundError } from "@davidorex/pi-jit-agents";
import type { CompiledAgent, DispatchContext, JitAgentResult } from "@davidorex/pi-jit-agents/types";
import type { AgentToolUpdateCallback, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { _internals, callAgentTool } from "./call-agent-tool.js";

const noopUpdate: AgentToolUpdateCallback = () => {};

const stubResult: JitAgentResult = {
	output: { ok: true },
	raw: { role: "assistant", content: [] } as unknown as JitAgentResult["raw"],
	usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
};

function mockCtx(cwd: string, hasModel = true): ExtensionContext {
	const stubModel = { provider: "anthropic", id: "claude-haiku-4.5" };
	return {
		cwd,
		modelRegistry: {
			find: () => (hasModel ? stubModel : undefined),
			getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "test-key", headers: {} }),
		},
	} as unknown as ExtensionContext;
}

function writeAgentSpec(substrateRoot: string, name: string, body: string): string {
	const agentsDir = path.join(substrateRoot, "agents");
	fs.mkdirSync(agentsDir, { recursive: true });
	const filePath = path.join(agentsDir, `${name}.agent.yaml`);
	fs.writeFileSync(filePath, body, "utf8");
	return filePath;
}

const minimalSpec = (name: string, opts: { model?: string } = {}) => `name: ${name}
role: sensor
description: test
${opts.model !== undefined ? `model: ${opts.model}` : ""}
prompt:
  system: "system"
  task: "task"
input:
  type: object
  properties:
    in: { type: string }
output:
  format: json
`;

describe("callAgentTool", () => {
	let tmpDir: string;
	let substrateRoot: string;
	let signal: AbortSignal;
	let savedExecute: typeof _internals.executeAgent;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-agent-dispatch-call-"));
		const substrateName = "substrate";
		substrateRoot = path.join(tmpDir, substrateName);
		fs.mkdirSync(substrateRoot, { recursive: true });
		writeBootstrapPointer(tmpDir, substrateName);
		signal = new AbortController().signal;
		savedExecute = _internals.executeAgent;
	});

	afterEach(() => {
		_internals.executeAgent = savedExecute;
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("composes grant as parent ∩ requested before dispatch", async () => {
		writeAgentSpec(
			substrateRoot,
			"intersect-agent",
			minimalSpec("intersect-agent", { model: "anthropic/claude-haiku-4.5" }),
		);
		let observedGrant: string[] | undefined;
		_internals.executeAgent = async (_compiled: CompiledAgent, dispatch: DispatchContext) => {
			observedGrant = dispatch.parentGrant;
			return stubResult;
		};
		await callAgentTool.execute(
			"call-1",
			{
				spec_name: "intersect-agent",
				input: { in: "x" },
				parent_grant: ["a", "b", "c"],
				requested_grant: ["b", "c", "d"],
			},
			signal,
			noopUpdate,
			mockCtx(tmpDir),
		);
		assert.deepEqual(observedGrant, ["b", "c"]);
	});

	it("throws AgentNotFoundError when the named spec is missing", async () => {
		await assert.rejects(
			callAgentTool.execute("call-2", { spec_name: "no-such-agent", input: {} }, signal, noopUpdate, mockCtx(tmpDir)),
			AgentNotFoundError,
		);
	});

	it("throws naming the model-config remedy when neither the spec nor model-config resolves a model", async () => {
		// The substrate has no model-config block, so the DEC-0023 fall-through
		// (spec → model-config by_role → default) yields nothing and in-process
		// dispatch throws an informed error pointing at the model-config block.
		writeAgentSpec(substrateRoot, "no-model", minimalSpec("no-model"));
		await assert.rejects(
			callAgentTool.execute("call-3", { spec_name: "no-model", input: {} }, signal, noopUpdate, mockCtx(tmpDir)),
			/has no model — declare one on the spec, or add a matching entry to the substrate's model-config block/,
		);
	});

	it("returns the executeAgent result on the successful path", async () => {
		writeAgentSpec(substrateRoot, "happy-agent", minimalSpec("happy-agent", { model: "anthropic/claude-haiku-4.5" }));
		_internals.executeAgent = async () => stubResult;
		const result = await callAgentTool.execute(
			"call-4",
			{
				spec_name: "happy-agent",
				input: { in: "y" },
				parent_grant: ["read-block"],
				requested_grant: ["read-block"],
			},
			signal,
			noopUpdate,
			mockCtx(tmpDir),
		);
		assert.deepEqual(result.details, stubResult);
		assert.match(result.content[0].text, /happy-agent.*grant=\[read-block\]/);
	});
});
