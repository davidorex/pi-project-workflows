import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { writeBootstrapPointer } from "@davidorex/pi-context/context-dir";
import type { AgentToolUpdateCallback, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { runRealChecksTool, WorkOrderNotFoundError } from "./run-real-checks-tool.js";

const noopUpdate: AgentToolUpdateCallback = () => {};

function mockCtx(cwd: string): ExtensionContext {
	return { cwd } as unknown as ExtensionContext;
}

describe("runRealChecksTool", () => {
	let tmpDir: string;
	let signal: AbortSignal;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-agent-dispatch-run-real-"));
		const substrateName = "substrate";
		fs.mkdirSync(path.join(tmpDir, substrateName), { recursive: true });
		writeBootstrapPointer(tmpDir, substrateName);
		signal = new AbortController().signal;
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("throws WorkOrderNotFoundError when work_order_id is absent from substrate", async () => {
		fs.writeFileSync(path.join(tmpDir, "substrate", "work-orders.json"), JSON.stringify({ work_orders: [] }));
		await assert.rejects(
			runRealChecksTool.execute("call-1", { work_order_id: "WO-999" }, signal, noopUpdate, mockCtx(tmpDir)),
			(err: Error) => err instanceof WorkOrderNotFoundError && /WO-999/.test(err.message),
		);
	});

	it("loads work-order + invokes runRealChecks (empty criteria → passed=true)", async () => {
		fs.writeFileSync(
			path.join(tmpDir, "substrate", "work-orders.json"),
			JSON.stringify({
				work_orders: [{ id: "WO-100", real_check_criteria: {} }],
			}),
		);
		const result = await runRealChecksTool.execute(
			"call-2",
			{ work_order_id: "WO-100" },
			signal,
			noopUpdate,
			mockCtx(tmpDir),
		);
		assert.equal(result.details.passed, true);
		assert.equal(result.details.work_order_id, "WO-100");
		assert.match(result.content[0].text, /WO-100: PASSED/);
	});
});
