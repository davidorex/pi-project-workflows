/**
 * Agent spec loading — YAML specs are the source of truth.
 *
 * Agent specs are declarative YAML files that define typed functions:
 * InputSchema → OutputSchema, with template references for prompt
 * composition. The .md that pi consumes is compiled at dispatch time
 * from spec + templates + typed input. It exists in memory only.
 *
 * Search order (first match wins):
 *   1. .pi/agents/<name>.agent.yaml     (project)
 *   2. ~/.pi/agent/agents/<name>.agent.yaml  (user)
 *   3. <package>/agents/<name>.agent.yaml (builtin)
 */
import fs from "node:fs";
import path from "node:path";

/**
 * Check if a prompt.system value looks like a template file path vs inline text.
 * Heuristic: treats strings ending in .md as template paths. A literal prompt
 * string resembling a file path would be misclassified.
 *
 * @deprecated Heuristic fallback for old-format specs. New specs should use { template: "path" } object syntax.
 */
function isTemplatePath(value: string | undefined): boolean {
	if (!value) return false;
	return value.endsWith(".md") || value.endsWith(".txt") || (value.includes("/") && !value.includes("\n"));
}

/**
 * Resolve a prompt field value that may be either:
 * - An object `{ template: "path.md" }` — explicit template reference (preferred)
 * - A plain string — falls back to `isTemplatePath()` heuristic for backward compat
 *
 * Returns `{ template }` for file-based prompts, `{ inline }` for literal text,
 * or `{}` if the value is absent/unrecognized.
 */
function resolvePromptField(value: unknown): { template?: string; inline?: string } {
	if (typeof value === "object" && value !== null && "template" in value) {
		return { template: (value as { template: string }).template };
	}
	if (typeof value === "string") {
		// Backward compat: heuristic for old-format string-only specs
		return isTemplatePath(value) ? { template: value } : { inline: value };
	}
	return {};
}

import os from "node:os";
import { parse as parseYaml } from "yaml";
import type { AgentSpec } from "./types.js";

/**
 * Thrown when an agent spec file is not found in any search path.
 */
export class AgentNotFoundError extends Error {
	public readonly agentName: string;
	public readonly searchPaths: string[];

	constructor(agentName: string, searchPaths: string[]) {
		const pathList = searchPaths.map((p) => `  - ${p}`).join("\n");
		super(`Agent '${agentName}' not found. Searched:\n${pathList}`);
		this.name = "AgentNotFoundError";
		this.agentName = agentName;
		this.searchPaths = searchPaths;
	}
}

/**
 * Thrown when an agent spec file exists but cannot be read or parsed.
 */
export class AgentParseError extends Error {
	public readonly agentName: string;
	public readonly filePath: string;
	public readonly cause: Error;

	constructor(agentName: string, filePath: string, cause: Error) {
		super(`Agent '${agentName}' at ${filePath}: ${cause.message}`);
		this.name = "AgentParseError";
		this.agentName = agentName;
		this.filePath = filePath;
		this.cause = cause;
	}
}

/**
 * Parse a YAML agent spec file into an AgentSpec.
 */
export function parseAgentYaml(filePath: string): AgentSpec {
	const name = path.basename(filePath, ".agent.yaml");

	let content: string;
	try {
		content = fs.readFileSync(filePath, "utf-8");
	} catch (err) {
		throw new AgentParseError(name, filePath, err instanceof Error ? err : new Error(String(err)));
	}

	let spec: any;
	try {
		spec = parseYaml(content);
	} catch (err) {
		throw new AgentParseError(name, filePath, err instanceof Error ? err : new Error(String(err)));
	}

	// Handle null/undefined from parsing empty file or non-mapping YAML
	if (!spec || typeof spec !== "object") {
		throw new AgentParseError(name, filePath, new Error("File is empty or does not contain a YAML mapping"));
	}

	const system = resolvePromptField(spec.prompt?.system);
	const task = resolvePromptField(spec.prompt?.task);

	return {
		name: spec.name || name,
		description: spec.description,
		role: spec.role,
		model: spec.model,
		thinking: spec.thinking,
		tools: spec.tools,
		extensions: spec.extensions,
		skills: spec.skills,
		output: spec.output?.file,
		promptTemplate: system.template,
		systemPrompt: system.inline,
		taskTemplate: task.template ?? task.inline,
		inputSchema: spec.input,
		outputFormat: spec.output?.format,
		outputSchema: spec.output?.schema,
		contextBlocks: Array.isArray(spec.contextBlocks) ? spec.contextBlocks : undefined,
	};
}

/**
 * Create an agent loader that finds .agent.yaml specs.
 */
export function createAgentLoader(cwd: string, builtinDir?: string): (name: string) => AgentSpec {
	const defaultBuiltinDir = builtinDir ?? path.resolve(import.meta.dirname, "..", "agents");

	return (name: string): AgentSpec => {
		const searchPaths = [
			path.join(cwd, ".pi", "agents", `${name}.agent.yaml`),
			path.join(os.homedir(), ".pi", "agent", "agents", `${name}.agent.yaml`),
			path.join(defaultBuiltinDir, `${name}.agent.yaml`),
		];

		for (const p of searchPaths) {
			if (fs.existsSync(p)) return parseAgentYaml(p);
		}

		throw new AgentNotFoundError(name, searchPaths);
	};
}
