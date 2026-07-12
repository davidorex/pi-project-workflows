/**
 * Nunjucks template environment and rendering.
 *
 * Template discovery DOES touch .pi/ paths — unlike agent-spec discovery
 * (agent-spec.ts), which never reads <cwd>/.pi/agents/. This environment's
 * project tier is the active substrate's templates/ dir (not <cwd>/.pi/), but
 * its user tier defaults to ~/.pi/agent/templates/, and the per-item macro
 * registry (renderer-registry.ts) probes <cwd>/.pi/templates/ as its project
 * tier. The template search mirrors the agent-spec three-tier pattern:
 *   1. {contextDir}/templates/ — the active substrate dir resolved from
 *      {cwd}'s .pi-context.json pointer; tier omitted when no pointer resolves
 *   2. {userDir ?? ~/.pi/agent/templates/}
 *   3. {builtinDir}   (only when supplied)
 *
 * Autoescape is disabled (agents render markdown, not HTML). throwOnUndefined
 * is disabled (templates may reference optional context without error).
 *
 * `${{ }}` workflow expressions are protected from Nunjucks interpretation
 * by escape-and-restore. This preserves the invariant that workflow-level
 * expression resolution happens at workflow dispatch time, not at agent
 * compile time.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tryResolveContextDir } from "@davidorex/pi-context/context-dir";
import nunjucks from "nunjucks";

/**
 * Absolute path to this package's bundled `templates/` directory — the canonical
 * package-layer root for the 3-tier template search (tier 3 / builtinDir).
 *
 * There is exactly one shared "agent" abstraction across this project (spec +
 * loader + compile/templates/macros + capability composition + execute), used
 * uniformly wherever an agent is needed. As a direct consequence, agent-prompt
 * rendering assets (per-item macros + whole-block delegators + per-agent
 * template directories) live in this one package — pi-jit-agents. Consumers
 * (pi-workflows, pi-behavior-monitors, pi-agent-dispatch) import this function
 * rather than computing their own package-relative paths.
 *
 * Resolves via `import.meta.url` so the path works under both source and
 * built (dist) modes — the dist/ directory and the src/ directory sit at the
 * same depth relative to the package root.
 */
export function bundledTemplateDir(): string {
	const here = path.dirname(fileURLToPath(import.meta.url));
	return path.resolve(here, "..", "templates");
}

export interface TemplateEnvContext {
	/** Project root. Resolves the project-level tier. */
	cwd: string;
	/** Optional consumer-supplied builtin template directory. */
	builtinDir?: string;
	/** Test hook to override the user tier. Defaults to `~/.pi/agent/templates/`. */
	userDir?: string;
}

/**
 * Create a Nunjucks environment with three-tier template discovery.
 *
 * Returns a no-op loader environment (plain strings pass through) when no
 * tier directory exists. This is not an error — an agent with an entirely
 * inline prompt uses no templates at all.
 */
export function createTemplateEnv(ctx: TemplateEnvContext): nunjucks.Environment {
	const userDir = ctx.userDir ?? path.join(os.homedir(), ".pi", "agent", "templates");

	const searchPaths: string[] = [];
	// Project tier: when no substrate bootstrap pointer resolves for this cwd, this
	// tier is simply omitted; user/builtin tiers are unaffected. `contextTemplatesDir(cwd)`
	// was `<contextDir>/templates`, so the inline equivalent is `path.join(base, "templates")`.
	const base = tryResolveContextDir(ctx.cwd);
	if (base !== null) {
		const projectTemplates = path.join(base, "templates");
		if (fs.existsSync(projectTemplates)) searchPaths.push(projectTemplates);
	}
	if (fs.existsSync(userDir)) searchPaths.push(userDir);
	if (ctx.builtinDir && fs.existsSync(ctx.builtinDir)) searchPaths.push(ctx.builtinDir);

	const loader = searchPaths.length > 0 ? new nunjucks.FileSystemLoader(searchPaths) : undefined;

	return new nunjucks.Environment(loader, {
		autoescape: false,
		throwOnUndefined: false,
	});
}

/** Sentinel used to protect `${{ }}` workflow expressions from Nunjucks rendering. */
const WORKFLOW_EXPR_PLACEHOLDER = "\x00__PI_WORKFLOW_EXPR__";

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Render a template string through Nunjucks.
 *
 * Protects `${{ }}` workflow expressions from Nunjucks by escaping them
 * before rendering and restoring them after.
 */
export function renderTemplate(
	env: nunjucks.Environment,
	templateStr: string,
	context: Record<string, unknown>,
): string {
	const escaped = templateStr.replace(/\$\{\{/g, WORKFLOW_EXPR_PLACEHOLDER);
	const rendered = env.renderString(escaped, context);
	return rendered.replace(new RegExp(escapeRegExp(WORKFLOW_EXPR_PLACEHOLDER), "g"), "${{");
}

/**
 * Render a named template file through Nunjucks.
 *
 * The template name is resolved by the environment's FileSystemLoader through
 * the configured three-tier search.
 *
 * Absolute paths bypass the loader and are read directly. This supports
 * fully-resolved AgentSpec fields where systemPromptTemplate / taskPromptTemplate
 * carry absolute paths after loadAgent (specs leave loading fully resolved).
 */
export function renderTemplateFile(
	env: nunjucks.Environment,
	templateName: string,
	context: Record<string, unknown>,
): string {
	if (path.isAbsolute(templateName)) {
		const content = fs.readFileSync(templateName, "utf-8");
		return renderTemplate(env, content, context);
	}
	return env.render(templateName, context);
}
