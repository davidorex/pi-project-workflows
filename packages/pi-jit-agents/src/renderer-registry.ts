/**
 * Renderer registry — maps block kinds to per-item Nunjucks macro references.
 *
 * Wave 1 foundation work for the per-item-macros plan. Plans 4 and 6+ consume
 * this registry to look up `{ templatePath, macroName }` for a given block
 * kind, then call `{% from <templatePath> import <macroName> %}` inside
 * Nunjucks. The registry itself does not perform rendering; it only resolves
 * where a per-item macro lives.
 *
 * Three-tier discovery mirrors `createTemplateEnv` in `template.ts`:
 *   1. Project: `<cwd>/.pi/templates/items/<kind>.md`
 *   2. User:    `<userDir ?? ~/.pi/agent/templates>/items/<kind>.md`
 *   3. Builtin: `<builtinDir>/items/<kind>.md` (only when `builtinDir` is set)
 *
 * First match wins; absent macros return `null` (the per-item macros that
 * Plans 6, 7, 8 deliver do not yet exist on disk — the registry must be
 * tolerant of this state).
 *
 * Macro-name derivation:
 *   The canonical Plan-6/7/8 macro name for each shipped block kind is held
 *   in CANONICAL_MACRO_NAMES below. These names are not algorithmically
 *   derivable from kind names — they encode the per-block semantic
 *   granularity (e.g. `architecture` → `render_architecture_item`,
 *   `conformance-reference` → `render_conformance_principle`,
 *   `decisions` → `render_decision`). For kinds NOT in the map, the
 *   fallback derivation `render_<kind_underscored>` (hyphens → underscores)
 *   applies — preserving compatibility for any consumer-supplied kind not
 *   shipped here.
 *
 *   Holding the map in the registry means the per-item macro files no
 *   longer need to ship alias bridge macros to reconcile a registry-default
 *   plural name (e.g. `render_decisions`) against the canonical singular
 *   (`render_decision`). The registry directly looks up the canonical
 *   name and `render_recursive` dispatches to it.
 *
 * Resolution is performed lazily on each `lookup` call. There is no caching:
 * users may add `.pi/templates/items/*.md` overrides between calls and the
 * registry must observe them. This mirrors the runtime template-env model
 * where the Environment is constructed once but the FileSystemLoader
 * resolves on each render. If a future profiling pass shows lookup overhead
 * to be material, a cache may be added — its lifecycle should be explicitly
 * documented at that time.
 *
 * `register` overrides take precedence over filesystem resolution and
 * persist for the registry instance's lifetime.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type ItemMacroRef = { templatePath: string; macroName: string };

export interface RendererRegistry {
	/**
	 * Look up the per-item macro reference for a block kind. Returns `null` if
	 * no tier yields a matching `items/<kind>.md` file and no in-memory
	 * registration exists for the kind.
	 */
	lookup(blockKind: string): ItemMacroRef | null;

	/**
	 * Register an explicit macro reference for a block kind. Subsequent
	 * `lookup` calls for that kind return the registered ref unconditionally,
	 * bypassing all three-tier filesystem resolution. In-memory only; never
	 * writes to disk.
	 */
	register(blockKind: string, ref: ItemMacroRef): void;
}

export interface CreateRendererRegistryOptions {
	/** Project root. Resolves the project-tier path. */
	cwd: string;
	/** Optional consumer-supplied bundled templates directory (the third tier). */
	builtinDir?: string;
	/** Test hook to override the user tier. Defaults to `~/.pi/agent/templates/`. */
	userDir?: string;
}

/**
 * Canonical per-item macro names for the block kinds shipped by
 * pi-workflows' templates/items/. Encodes the semantic granularity each
 * macro renders (one architecture record, one principle inside a
 * conformance-reference, one decision, etc.). Exposed read-only so consumers
 * (and tests) can mirror the registry's name-resolution rules without
 * re-deriving them. Adding a new shipped block kind requires adding its
 * entry here in the same change.
 */
export const CANONICAL_MACRO_NAMES: Readonly<Record<string, string>> = Object.freeze({
	architecture: "render_architecture_item",
	"conformance-reference": "render_conformance_principle",
	conventions: "render_convention",
	decisions: "render_decision",
	domain: "render_domain_entry",
	features: "render_feature",
	"framework-gaps": "render_framework_gap",
	issues: "render_issue",
	"layer-plans": "render_layer_plan",
	project: "render_project_item",
	requirements: "render_requirement",
	research: "render_research",
	"spec-reviews": "render_spec_review",
	tasks: "render_task",
});

/**
 * Resolve the macro name for a block kind. Returns the canonical name from
 * CANONICAL_MACRO_NAMES when present; otherwise falls back to the
 * algorithmic derivation `render_<kind>` (hyphens → underscores) so kinds
 * not shipped by this package still resolve to a predictable name.
 */
function resolveMacroName(blockKind: string): string {
	return CANONICAL_MACRO_NAMES[blockKind] ?? `render_${blockKind.replace(/-/g, "_")}`;
}

/**
 * Resolve `cwd` relative paths and a leading `~` against the user's home
 * directory. Returned paths are absolute so callers can pass them directly to
 * Nunjucks `getTemplate` / `{% from <abs path> import ... %}`.
 */
function resolveAbsolute(p: string, cwd: string): string {
	if (p.startsWith("~")) {
		return path.join(os.homedir(), p.slice(1));
	}
	return path.isAbsolute(p) ? p : path.resolve(cwd, p);
}

/**
 * Create a renderer registry bound to a project root and optional builtin
 * templates directory. The returned object holds an in-memory override map
 * but does not cache filesystem lookups — see file header for rationale.
 */
export function createRendererRegistry(opts: CreateRendererRegistryOptions): RendererRegistry {
	const cwd = resolveAbsolute(opts.cwd, process.cwd());
	const userDir = opts.userDir
		? resolveAbsolute(opts.userDir, cwd)
		: path.join(os.homedir(), ".pi", "agent", "templates");
	const builtinDir = opts.builtinDir ? resolveAbsolute(opts.builtinDir, cwd) : undefined;

	const projectDir = path.join(cwd, ".pi", "templates");

	const overrides = new Map<string, ItemMacroRef>();

	function lookup(blockKind: string): ItemMacroRef | null {
		const override = overrides.get(blockKind);
		if (override) return override;

		const fileName = `${blockKind}.md`;
		const tiers: string[] = [path.join(projectDir, "items", fileName), path.join(userDir, "items", fileName)];
		if (builtinDir) tiers.push(path.join(builtinDir, "items", fileName));

		for (const candidate of tiers) {
			if (fs.existsSync(candidate)) {
				return { templatePath: candidate, macroName: resolveMacroName(blockKind) };
			}
		}
		return null;
	}

	function register(blockKind: string, ref: ItemMacroRef): void {
		overrides.set(blockKind, ref);
	}

	return { lookup, register };
}
