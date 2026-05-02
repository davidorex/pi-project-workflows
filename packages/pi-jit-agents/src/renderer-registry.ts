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
 * Default macro name is `render_<kind_underscored>` — hyphens in the kind
 * name are translated to underscores so `framework-gaps` resolves to
 * `render_framework_gaps`. Callers can override per-kind via `register`,
 * which is in-memory only and never writes to disk.
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

/** Default macro-name derivation: hyphens become underscores, prefix with `render_`. */
function defaultMacroName(blockKind: string): string {
	return `render_${blockKind.replace(/-/g, "_")}`;
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
				return { templatePath: candidate, macroName: defaultMacroName(blockKind) };
			}
		}
		return null;
	}

	function register(blockKind: string, ref: ItemMacroRef): void {
		overrides.set(blockKind, ref);
	}

	return { lookup, register };
}
