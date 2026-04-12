/**
 * Nunjucks template environment and rendering.
 *
 * Implements D3 (no .pi/ reads) for the template discovery side. The template
 * search mirrors the agent-spec three-tier pattern:
 *   1. {cwd}/.project/templates/
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
import nunjucks from "nunjucks";

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
	const projectDir = path.join(ctx.cwd, ".project", "templates");
	const userDir = ctx.userDir ?? path.join(os.homedir(), ".pi", "agent", "templates");

	const searchPaths: string[] = [];
	if (fs.existsSync(projectDir)) searchPaths.push(projectDir);
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
 * carry absolute paths after loadAgent (per D1).
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
