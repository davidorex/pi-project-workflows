/**
 * work-order-loop end-to-end integration probe — the pinned real-subprocess
 * run of the work-order path.
 *
 * Unlike work-order-loop.test.ts (which pins the loop's orchestration
 * branches via _internals substitution), this test performs ZERO _internals
 * substitution: the work-order's target agent is resolved through the real
 * agent loader (substrate-installed tier), compiled through the real
 * pi-jit-agents compile path, dispatched as a REAL `pi` subprocess that must
 * WRITE A FILE with its granted write tool, verified by the real
 * real-check-runner executing the work-order's runtime_demo invocation
 * (exit-code + expected-substring parsed), with the commit ceremony
 * skipped-by-design through the loop's own non-interactive (hasUI:false)
 * branch — final_status "completed-pending-commit".
 *
 * Gated behind the same RUN_INTEGRATION convention pi-workflows' integration
 * tests use (RUN_INTEGRATION=1 + a `pi` binary resolvable on PATH); skips
 * cleanly otherwise so the non-gated suite is untouched.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { writeBootstrapPointer } from "@davidorex/pi-context/context-dir";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { runWorkOrderLoop } from "./work-order-loop.js";

// Skip integration tests unless RUN_INTEGRATION=1 and pi is available
// (mirrors packages/pi-workflows/src/integration.test.ts's guard shape).
let hasPi = false;
if (process.env.RUN_INTEGRATION === "1") {
	try {
		const { execSync } = await import("node:child_process");
		execSync("pi --version", { stdio: "ignore" });
		hasPi = true;
	} catch {}
}

/** Artifact the dispatched agent must create; the runtime_demo real-check reads it back. */
const ARTIFACT_NAME = "wo-e2e-artifact.txt";
const ARTIFACT_CONTENT = "work-order-e2e-ok";

/**
 * Scratch-substrate substrate_id matching the required `^sub-[0-9a-f]{16}$`
 * shape (identity stamping reads config.substrate_id and throws when absent).
 */
const SCRATCH_SUBSTRATE_ID = "sub-00e2e00000000136";

/**
 * Build the scratch substrate: bootstrap pointer + config carrying a
 * substrate_id + a real work-orders block + a substrate-installed agent spec
 * the real loader resolves as its first tier (<contextDir>/agents/). The spec
 * is task-worker-tier (write-capable acting agent: read/write/bash) with an
 * inline task prompt carrying the concrete file-write instruction; the model
 * is pinned in the spec (first in the dispatch-model precedence) to the
 * operator's working default provider/model so resolution inside the real
 * subprocess is deterministic.
 */
function scaffoldSubstrate(tmpDir: string): void {
	const substrateDir = path.join(tmpDir, "substrate");
	fs.mkdirSync(path.join(substrateDir, "agents"), { recursive: true });
	writeBootstrapPointer(tmpDir, "substrate");

	fs.writeFileSync(
		path.join(substrateDir, "config.json"),
		JSON.stringify({ schema_version: "1.8.0", substrate_id: SCRATCH_SUBSTRATE_ID, block_kinds: [] }, null, 2),
	);

	fs.writeFileSync(
		path.join(substrateDir, "agents", "wo-e2e-file-writer.agent.yaml"),
		[
			"name: wo-e2e-file-writer",
			"role: action",
			"description: E2E probe worker — writes one fixed artifact file via its granted write tool",
			"model: openrouter/z-ai/glm-5.2",
			"tools: [read, write, bash]",
			"input:",
			"  type: object",
			"  required: [work_order_id]",
			"  properties:",
			"    work_order_id: { type: string }",
			// Plain-string task prompt = the inline form (resolvePromptField treats
			// an object only as the {template} form). No "/" or trailing .md/.txt,
			// so the multi-line block scalar stays inline, not a template path.
			"prompt:",
			"  task: |",
			`    Create a file named ${ARTIFACT_NAME} in the current working directory.`,
			`    Its entire content must be exactly this single line: ${ARTIFACT_CONTENT}`,
			"    Use your write tool to create the file. Do not create any other files.",
			"    When the file is written, reply with the single word DONE.",
		].join("\n"),
	);

	// The real work-orders block the loop's readBlock(cwd, "work-orders") reads.
	// scope.operations declares the outer tool bound (the clamp intersects the
	// composed grant with it); scope.files is non-empty so the passing iteration
	// reaches the commit ceremony, which the non-interactive branch skips by
	// design → "completed-pending-commit". The runtime_demo invocation is
	// exit-code-parsed (`cat` fails when the artifact is absent) AND
	// expected-substring-checked against the artifact's content.
	fs.writeFileSync(
		path.join(substrateDir, "work-orders.json"),
		JSON.stringify(
			{
				work_orders: [
					{
						id: "WO-E2E-001",
						target_agent: "wo-e2e-file-writer",
						real_check_criteria: {
							runtime_demo: {
								invocation: `cat ${ARTIFACT_NAME}`,
								expected: ARTIFACT_CONTENT,
							},
						},
						scope: {
							files: [ARTIFACT_NAME],
							operations: ["read", "write", "bash"],
						},
						input_contract: {
							type: "object",
							required: ["work_order_id"],
							properties: { work_order_id: { type: "string" } },
							additionalProperties: false,
						},
					},
				],
			},
			null,
			2,
		),
	);
}

describe("work-order loop end-to-end (real pi subprocess, zero _internals substitution)", {
	skip: !hasPi ? "RUN_INTEGRATION=1 and pi required" : undefined,
}, () => {
	// Generous timeout budget: a real pi subprocess call (model round-trips +
	// tool execution) plus the real-check shell run. Overrides the package test
	// script's default --test-timeout.
	it("dispatches the real target agent, which writes the artifact; the real runtime_demo check passes; non-interactive commit skip → completed-pending-commit", {
		timeout: 600_000,
	}, async (t) => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-agent-dispatch-wo-e2e-"));
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		scaffoldSubstrate(tmpDir);

		// Non-interactive ctx: hasUI=false. ui.confirm must NEVER be called on
		// this path (both the commit gate and the retry gate check hasUI first);
		// record calls so a regression surfaces as an assertion, not a hang.
		const confirmCalls: string[] = [];
		const ctx = {
			cwd: tmpDir,
			hasUI: false,
			ui: {
				confirm: async (title: string) => {
					confirmCalls.push(title);
					return false;
				},
			},
		} as unknown as ExtensionContext;

		const result = await runWorkOrderLoop(
			tmpDir,
			{
				work_order_id: "WO-E2E-001",
				max_iterations: 1,
				// The composed grant is agent_grant ∩ spec.tools, then clamped to
				// scope.operations — grant the full acting surface so the clamp
				// passes read/write/bash through to the subprocess --tools flag.
				agent_grant: ["read", "write", "bash"],
			},
			ctx,
		);

		const diagnostics = JSON.stringify(result, null, 2);

		// Final status: real-check passed + scope.files non-empty + hasUI:false
		// → the loop's non-interactive commit-skip branch.
		assert.equal(
			result.final_status,
			"completed-pending-commit",
			`unexpected final_status; full result: ${diagnostics}`,
		);
		assert.equal(result.commit_sha, undefined);
		assert.equal(result.iterations.length, 1);
		assert.equal(result.iterations[0].status, "passed");

		// The artifact the REAL dispatched agent wrote with its real write tool.
		const artifactPath = path.join(tmpDir, ARTIFACT_NAME);
		assert.ok(fs.existsSync(artifactPath), `artifact ${ARTIFACT_NAME} was not written; full result: ${diagnostics}`);
		const content = fs.readFileSync(artifactPath, "utf-8");
		assert.ok(
			content.includes(ARTIFACT_CONTENT),
			`artifact content mismatch — expected to include ${JSON.stringify(ARTIFACT_CONTENT)}, got ${JSON.stringify(content)}`,
		);

		// The REAL real-check-runner verdict (exit-code-parsed runtime_demo).
		const realCheck = result.iterations[0].real_check_result;
		assert.equal(realCheck.passed, true, `real-check did not pass; full result: ${diagnostics}`);
		assert.equal(realCheck.work_order_id, "WO-E2E-001");
		assert.equal(realCheck.details.runtime_demo?.passed, true);
		assert.ok(realCheck.details.runtime_demo?.output.includes(ARTIFACT_CONTENT));

		// Non-interactive throughout: no confirm prompt may have fired.
		assert.deepEqual(confirmCalls, []);
	});
});
