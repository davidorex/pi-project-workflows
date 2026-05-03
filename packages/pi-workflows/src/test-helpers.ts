/**
 * Shared test helpers — mock factories for ctx, pi, and workflow specs,
 * plus Nunjucks-environment helpers for the per-item-macro test suites.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	CANONICAL_MACRO_NAMES,
	expandFieldPathShorthand,
	enforceBudget as realEnforceBudget,
} from "@davidorex/pi-jit-agents";
import { schemaPath } from "@davidorex/pi-project/project-context";
import nunjucks from "nunjucks";
import { bundledDir } from "./bundled-dirs.js";
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
	env.addGlobal("enforceBudget", (rendered: unknown, blockName: unknown, fieldPathOrShorthand: unknown): string => {
		const text =
			typeof rendered === "string" ? rendered : rendered === undefined || rendered === null ? "" : String(rendered);
		if (typeof blockName !== "string" || typeof fieldPathOrShorthand !== "string") return text;
		const schemaFile = schemaPath(cwd, blockName);
		if (!fs.existsSync(schemaFile)) return text;
		let schema: object;
		try {
			schema = JSON.parse(fs.readFileSync(schemaFile, "utf-8"));
		} catch {
			return text;
		}
		const fp = expandFieldPathShorthand(fieldPathOrShorthand);
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

// ─────────────────────────────────────────────────────────────────────────────
// Per-item-macro test harness (Item 4 of 2026-05-02 residual-debt patch).
//
// Every render-*.test.ts previously hand-rolled the same Nunjucks env wiring
// (ItemLocation type, buildFixtureIdIndex, makeEnv with resolve /
// render_recursive / enforceBudget globals, plus inline-by-source dispatch
// mirroring `registerCompositionGlobals` from pi-jit-agents). The harness
// below consolidates that scaffolding so each per-macro test file holds only
// the kind-specific assertions and (where relevant) a tiny per-kind
// renderItem/renderWhole closure.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Absolute path to this package's bundled `templates/` directory — the same
 * Plan 6/7/8 per-item macros that the renderer registry's builtin tier
 * resolves to. Re-exported as a constant so tests can drop the
 * `path.resolve(import.meta.dirname, "..", "templates")` literal.
 */
export const TEMPLATES_DIR = bundledDir("templates");

/**
 * In-memory mirror of the `ItemLocation` shape `buildIdIndex` produces in
 * pi-project. Repeated verbatim across every render-*.test.ts before the
 * Item-4 harness landed; now imported.
 */
export interface FixtureItemLocation {
	block: string;
	arrayKey: string;
	item: Record<string, unknown>;
}

/**
 * Build an in-memory id index from a fixture map of block name → items array.
 * Mirrors the buildIdIndex output shape used by pi-project (one entry per
 * id-bearing item, keyed by `item.id`).
 */
export function buildFixtureIdIndex(
	blocks: Record<string, Array<Record<string, unknown>>>,
): Map<string, FixtureItemLocation> {
	const index = new Map<string, FixtureItemLocation>();
	for (const [block, items] of Object.entries(blocks)) {
		for (const item of items) {
			const id = item.id;
			if (typeof id === "string") {
				index.set(id, { block, arrayKey: block, item });
			}
		}
	}
	return index;
}

/**
 * Construct a Nunjucks env mirroring `registerCompositionGlobals` from
 * pi-jit-agents/compile.ts (the production globals contract).
 *
 * `availableMacros` maps a block kind to the absolute path of its per-item
 * macro file. Kinds NOT in the map produce the `[unrendered: <kind>/<id>]`
 * fallback marker — the same shape the production global emits when the
 * renderer registry has no entry for a kind.
 *
 * Macro-name resolution uses `CANONICAL_MACRO_NAMES` (re-exported from the
 * pi-jit-agents barrel), so kinds picked up by the registry's canonical
 * lookup land on the same name in tests. Unknown kinds fall back to
 * `render_<kind>` with hyphens→underscores, matching the registry default.
 */
export function makeRendererTestEnv(
	idIndex: Map<string, FixtureItemLocation>,
	availableMacros: Record<string, string>,
): nunjucks.Environment {
	const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(TEMPLATES_DIR), {
		autoescape: false,
		throwOnUndefined: false,
	});

	env.addGlobal("resolve", (id: unknown): FixtureItemLocation | null => {
		if (typeof id !== "string" || id.length === 0) return null;
		return idIndex.get(id) ?? null;
	});

	const visited = new Set<string>();
	env.addGlobal("render_recursive", (loc: unknown, depth: unknown): string => {
		if (!loc || typeof loc !== "object") return "";
		const location = loc as FixtureItemLocation;
		const itemId = (location.item as { id?: unknown })?.id;
		const idStr = typeof itemId === "string" ? itemId : "";
		const blockName = typeof location.block === "string" ? location.block : "?";

		if (idStr.length > 0 && visited.has(idStr)) {
			return `[cycle: ${idStr}]`;
		}

		const macroPath = availableMacros[blockName];
		if (!macroPath) {
			return `[unrendered: ${blockName}/${idStr}]`;
		}

		const macroName = CANONICAL_MACRO_NAMES[blockName] ?? `render_${blockName.replace(/-/g, "_")}`;
		const depthNum = typeof depth === "number" && Number.isFinite(depth) ? depth : 0;
		if (idStr.length > 0) visited.add(idStr);
		try {
			const macroSource = fs.readFileSync(macroPath, "utf-8");
			const inline = `${macroSource}\n{{ ${macroName}(item, depth) }}`;
			return env.renderString(inline, { item: location.item, depth: depthNum });
		} catch (err) {
			return `[render_error: ${blockName}/${idStr}: ${err instanceof Error ? err.message : String(err)}]`;
		} finally {
			if (idStr.length > 0) visited.delete(idStr);
		}
	});

	registerEnforceBudgetPassthrough(env);
	return env;
}

/**
 * Render a per-item macro by importing it from `items/<templateBase>.md` and
 * invoking it with `(item, depth)`.
 *
 * `kind` resolves the macro name through the registry's canonical map (with
 * the `render_<kind>` fallback); `templateBase` defaults to `kind` and only
 * needs to be supplied when the on-disk filename diverges from the kind name
 * (e.g. kind `conformance-reference` lives in `templates/items/conformance.md`
 * — its template basename is `conformance`, not `conformance-reference`).
 *
 * Most render-*.test.ts files used a near-identical thin wrapper; this is
 * the canonical surface so per-test wrappers reduce to one call.
 */
export function renderItemMacro(
	env: nunjucks.Environment,
	kind: string,
	item: unknown,
	depth: number = 0,
	templateBase?: string,
): string {
	const macroName = CANONICAL_MACRO_NAMES[kind] ?? `render_${kind.replace(/-/g, "_")}`;
	const tpl = `{% from "items/${templateBase ?? kind}.md" import ${macroName} %}{{ ${macroName}(item, depth) }}`;
	return env.renderString(tpl, { item, depth });
}

/**
 * Render a whole-block macro by importing it from `shared/macros.md`.
 * `wholeName` is the macro name (e.g. `render_tasks`, `render_architecture`,
 * `render_conformance`). The macros take a single `data` argument; this
 * helper threads it through.
 */
export function renderWholeBlockMacro(env: nunjucks.Environment, wholeName: string, data: unknown): string {
	const tpl = `{% from "shared/macros.md" import ${wholeName} %}{{ ${wholeName}(data) }}`;
	return env.renderString(tpl, { data });
}

/**
 * Resolve an absolute path to a per-item macro file under
 * `templates/items/<templateBase>.md`. Convenience wrapper so tests skip the
 * `path.resolve(TEMPLATES_DIR, "items", "<base>.md")` literal. The
 * `templateBase` is the on-disk filename basename (e.g. `conformance`,
 * `tasks`) — distinct from the registry kind (`conformance-reference`,
 * `tasks`) when the two names diverge.
 */
export function itemMacroPath(templateBase: string): string {
	return path.resolve(TEMPLATES_DIR, "items", `${templateBase}.md`);
}
