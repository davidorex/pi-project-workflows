/**
 * Agent spec loading and resolution.
 *
 * Implements D1 (fully-resolved specs leave the boundary) and D7 (three-tier
 * discovery with .project/agents/ as the project-level tier, never .pi/).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { AgentNotFoundError, AgentParseError } from "./errors.js";
import type { AgentSpec, ContextBlockRef, LoadContext } from "./types.js";

/**
 * Treat a prompt-field value that may be either an object with a `template`
 * property or a plain string. Plain strings ending in .md or containing a
 * path separator are interpreted as template paths; everything else is inline.
 */
function resolvePromptField(value: unknown): { template?: string; inline?: string } {
	if (typeof value === "object" && value !== null && "template" in value) {
		return { template: (value as { template: string }).template };
	}
	if (typeof value === "string") {
		if (value.endsWith(".md") || value.endsWith(".txt") || (value.includes("/") && !value.includes("\n"))) {
			return { template: value };
		}
		return { inline: value };
	}
	return {};
}

/**
 * Resolve a path referenced from an agent spec to an absolute filesystem path.
 *
 * Accepts:
 * - Absolute paths (returned unchanged)
 * - `block:<name>` sentinels (returned unchanged — resolved at compile time against cwd)
 * - Relative paths (resolved against the agent spec's directory)
 */
function resolveSpecPath(value: string | undefined, specDir: string): string | undefined {
	if (!value) return undefined;
	if (value.startsWith("block:")) return value;
	if (path.isAbsolute(value)) return value;
	return path.resolve(specDir, value);
}

/**
 * Validate and normalise a single `contextBlocks` entry.
 *
 * Accepts:
 * - a non-empty string (whole-block reference, the established surface), or
 * - an object with a required string `name` and optional `item` (string),
 *   `focus` (record of string→string), and `depth` (non-negative number).
 *
 * Throws `AgentParseError` with a descriptive message naming the offending
 * entry's index and the failing constraint. Plan 4 (Wave 2) consumes the
 * resulting union shape; this helper does not assign any runtime semantics.
 */
function parseContextBlockEntry(
	entry: unknown,
	index: number,
	agentName: string,
	filePath: string,
): string | ContextBlockRef {
	if (typeof entry === "string") {
		if (entry.length === 0) {
			throw new AgentParseError(
				agentName,
				filePath,
				new Error(`contextBlocks[${index}]: bare-string entry must be non-empty`),
			);
		}
		return entry;
	}
	if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
		throw new AgentParseError(
			agentName,
			filePath,
			new Error(
				`contextBlocks[${index}]: entry must be a string or an object with at least { name: string }; got ${
					Array.isArray(entry) ? "array" : entry === null ? "null" : typeof entry
				}`,
			),
		);
	}

	const obj = entry as Record<string, unknown>;
	if (typeof obj.name !== "string" || obj.name.length === 0) {
		throw new AgentParseError(
			agentName,
			filePath,
			new Error(`contextBlocks[${index}]: object form requires a non-empty string \`name\` field`),
		);
	}

	const out: ContextBlockRef = { name: obj.name };

	if (obj.item !== undefined) {
		if (typeof obj.item !== "string" || obj.item.length === 0) {
			throw new AgentParseError(
				agentName,
				filePath,
				new Error(`contextBlocks[${index}].item: when present must be a non-empty string`),
			);
		}
		out.item = obj.item;
	}

	if (obj.focus !== undefined) {
		if (obj.focus === null || typeof obj.focus !== "object" || Array.isArray(obj.focus)) {
			throw new AgentParseError(
				agentName,
				filePath,
				new Error(`contextBlocks[${index}].focus: when present must be an object mapping string keys to string values`),
			);
		}
		const focus: Record<string, string> = {};
		for (const [k, v] of Object.entries(obj.focus as Record<string, unknown>)) {
			if (typeof v !== "string") {
				throw new AgentParseError(
					agentName,
					filePath,
					new Error(`contextBlocks[${index}].focus.${k}: value must be a string; got ${typeof v}`),
				);
			}
			focus[k] = v;
		}
		out.focus = focus;
	}

	if (obj.depth !== undefined) {
		if (typeof obj.depth !== "number" || !Number.isFinite(obj.depth) || obj.depth < 0 || !Number.isInteger(obj.depth)) {
			throw new AgentParseError(
				agentName,
				filePath,
				new Error(
					`contextBlocks[${index}].depth: when present must be a non-negative integer; got ${String(obj.depth)}`,
				),
			);
		}
		out.depth = obj.depth;
	}

	return out;
}

/**
 * Parse a YAML agent spec file into a fully-resolved AgentSpec.
 *
 * All relative path fields (system/task templates, output schema) are
 * resolved to absolute paths against the directory containing the spec file.
 * The `loadedFrom` field records that directory.
 */
export function parseAgentYaml(filePath: string): AgentSpec {
	const name = path.basename(filePath, ".agent.yaml");
	const specDir = path.dirname(filePath);

	let content: string;
	try {
		content = fs.readFileSync(filePath, "utf-8");
	} catch (err) {
		throw new AgentParseError(name, filePath, err instanceof Error ? err : new Error(String(err)));
	}

	let raw: unknown;
	try {
		raw = parseYaml(content);
	} catch (err) {
		throw new AgentParseError(name, filePath, err instanceof Error ? err : new Error(String(err)));
	}

	if (!raw || typeof raw !== "object") {
		throw new AgentParseError(name, filePath, new Error("File is empty or does not contain a YAML mapping"));
	}

	const spec = raw as Record<string, any>;
	const systemField = resolvePromptField(spec.prompt?.system);
	const taskField = resolvePromptField(spec.prompt?.task);

	return {
		name: spec.name || name,
		description: spec.description,
		role: spec.role,
		model: spec.model,
		thinking: spec.thinking,
		tools: spec.tools,
		extensions: spec.extensions,
		skills: spec.skills,
		systemPrompt: systemField.inline,
		systemPromptTemplate: resolveSpecPath(systemField.template, specDir),
		taskPrompt: taskField.inline,
		taskPromptTemplate: resolveSpecPath(taskField.template, specDir),
		inputSchema: spec.input,
		outputFormat: spec.output?.format,
		outputSchema: resolveSpecPath(spec.output?.schema, specDir),
		contextBlocks: Array.isArray(spec.contextBlocks)
			? spec.contextBlocks.map((entry: unknown, index: number) =>
					parseContextBlockEntry(entry, index, spec.name || name, filePath),
				)
			: undefined,
		loadedFrom: specDir,
	};
}

/**
 * Create an agent loader bound to a LoadContext.
 *
 * The returned function searches three tiers in order (first match wins):
 *   1. {cwd}/.project/agents/{name}.agent.yaml
 *   2. {userDir ?? ~/.pi/agent/agents/}/{name}.agent.yaml
 *   3. {builtinDir}/{name}.agent.yaml   (only when builtinDir supplied)
 *
 * Throws AgentNotFoundError if no tier has the spec.
 *
 * IMPORTANT: Does NOT search .pi/agents/ — that path violates D3
 * (jit-agents-spec.md §4). Pi platform territory is respected.
 */
export function createAgentLoader(ctx: LoadContext): (name: string) => AgentSpec {
	const userTier = ctx.userDir ?? path.join(os.homedir(), ".pi", "agent", "agents");

	return (name: string): AgentSpec => {
		const searchPaths: string[] = [
			path.join(ctx.cwd, ".project", "agents", `${name}.agent.yaml`),
			path.join(userTier, `${name}.agent.yaml`),
		];
		if (ctx.builtinDir) {
			searchPaths.push(path.join(ctx.builtinDir, `${name}.agent.yaml`));
		}

		for (const p of searchPaths) {
			if (fs.existsSync(p)) return parseAgentYaml(p);
		}

		throw new AgentNotFoundError(name, searchPaths);
	};
}
