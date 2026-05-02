/**
 * Shared test helpers — mock factories for ctx, pi, and workflow specs,
 * plus Nunjucks-environment helpers for the per-item-macro test suites.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { enforceBudget as realEnforceBudget } from "@davidorex/pi-jit-agents";
import type nunjucks from "nunjucks";
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
 * Register a pass-through `enforceBudget` Nunjucks global on the supplied env.
 *
 * Per-item macro tests construct their own minimal Nunjucks env (no project
 * cwd, no schema lookup); the macros invoke `enforceBudget(text, block, path)`
 * unconditionally. To keep the macros' rendering byte-identical to the
 * pre-budget output, this helper registers a global that returns its first
 * argument unchanged. Tests that exercise actual budget truncation register
 * the real enforceBudget via `registerEnforceBudgetReal` instead.
 */
export function registerEnforceBudgetPassthrough(env: nunjucks.Environment): void {
	env.addGlobal("enforceBudget", (rendered: unknown): string =>
		typeof rendered === "string" ? rendered : rendered === undefined || rendered === null ? "" : String(rendered),
	);
}

/**
 * Register the real `enforceBudget` Nunjucks global on the supplied env,
 * routing every call through the actual budget-enforcer against schemas in
 * the supplied `cwd/.project/schemas/` directory. Use in budget-overflow
 * tests where the macro must produce the truncation marker.
 *
 * The shorthand-vs-pointer expansion mirrors the production helper inside
 * `compileAgent` (pi-jit-agents/src/compile.ts) so test paths can use the
 * readable shorthand form (`decisions.items.context`) the macros use.
 */
export function registerEnforceBudgetReal(env: nunjucks.Environment, cwd: string): void {
	function expandShorthand(p: string): string {
		if (p.startsWith("/")) return p;
		if (p === "") return "";
		const segments = p.split(".");
		const out: string[] = [];
		for (const seg of segments) {
			if (seg === "items") out.push("items");
			else out.push("properties", seg);
		}
		return `/${out.join("/")}`;
	}
	env.addGlobal("enforceBudget", (rendered: unknown, blockName: unknown, fieldPathOrShorthand: unknown): string => {
		const text =
			typeof rendered === "string" ? rendered : rendered === undefined || rendered === null ? "" : String(rendered);
		if (typeof blockName !== "string" || typeof fieldPathOrShorthand !== "string") return text;
		const schemaPath = path.join(cwd, ".project", "schemas", `${blockName}.schema.json`);
		if (!fs.existsSync(schemaPath)) return text;
		let schema: object;
		try {
			schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
		} catch {
			return text;
		}
		const fp = expandShorthand(fieldPathOrShorthand);
		try {
			return realEnforceBudget(text, schema, fp).output;
		} catch {
			return text;
		}
	});
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
