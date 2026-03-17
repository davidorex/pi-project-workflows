/**
 * Shared test helpers — mock factories for ctx, pi, and workflow specs.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { StepSpec, WorkflowSpec } from "./types.js";

/**
 * Create a mock extension context for testing.
 */
export function mockCtx(cwd: string) {
	return {
		cwd,
		hasUI: false,
		ui: {
			setWidget: () => {},
			notify: () => {},
			setStatus: () => {},
		},
	} as any;
}

/**
 * Create a mock pi API for testing.
 */
export function mockPi() {
	const messages: any[] = [];
	return {
		sendMessage: (msg: any, opts: any) => messages.push({ msg, opts }),
		_messages: messages,
	} as any;
}

/**
 * Create a minimal WorkflowSpec for testing.
 * A fresh temp directory is created for filePath.
 */
export function makeSpec(overrides: Partial<WorkflowSpec> & { steps: Record<string, StepSpec> }): WorkflowSpec {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-test-"));
	return {
		name: "test-workflow",
		description: "Test workflow",
		version: "1",
		source: "project" as const,
		filePath: path.join(tmpDir, "test.workflow.yaml"),
		...overrides,
	};
}
