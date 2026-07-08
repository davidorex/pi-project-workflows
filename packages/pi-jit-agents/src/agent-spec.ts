/**
 * Agent spec loading and resolution.
 *
 * Implements D1 (fully-resolved specs leave the boundary) and D7 (three-tier
 * discovery with .project/agents/ as the project-level tier, never .pi/).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { tryResolveContextDir } from "@davidorex/pi-context/context-dir";
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
 * Resolve a path referenced from an agent spec.
 *
 * Existence-gated contract:
 * - Absolute paths (returned unchanged)
 * - `block:<name>` sentinels (returned unchanged — resolved at compile time against cwd)
 * - Relative paths: probed in order against (1) the spec's own directory
 *   (specDir-adjacent) then (2) the spec directory's PARENT (the package-root
 *   sibling convention). The value is absolutized to the FIRST probe that finds
 *   a file on disk; if NEITHER probe resolves, the value is returned UNCHANGED
 *   as a loader-resolvable name.
 *
 * The existence gate is what lets a bundled spec's template/schema reference —
 * e.g. `investigator/task.md` or `analyzers/quality.md`, whose file lives in the
 * pi-jit-agents template tier, NOT adjacent to the spec — survive as a bare name
 * that the Nunjucks FileSystemLoader resolves through the three-tier search
 * (project → user → bundled builtinDir). Without the gate a non-adjacent
 * relative ref was frozen to a nonexistent absolute adjacent path, which
 * `renderTemplateFile` then tried to `readFileSync` directly (absolute paths
 * bypass the loader), defeating the bundled-template tier. Adjacent-file specs
 * (the local/project case, and the test fixtures) still absolutize as before.
 *
 * The package-root sibling probe extends the gate to the bundled-agent layout
 * where an `agents/*.agent.yaml` spec references a schema that lives in a
 * SIBLING `schemas/` dir at the package root (e.g. investigator's
 * `schemas/investigation-findings.schema.json`, whose file is at
 * pi-workflows/schemas/, the parent of agents/). Unlike templates, an
 * outputSchema gets no downstream loader-tier resolution — resolveOutputSchema-
 * ForCompile passes non-block values through unchanged and buildPhantomTool
 * reads them directly against process.cwd() — so a relative schema ref left as
 * a bare name fails with an ENOENT at dispatch. Absolutizing against the spec
 * dir's parent here (mirroring how pi-behavior-monitors absolutizes its
 * classifiers' relative schema refs before dispatch) is what makes those
 * schema-bearing bundled specs dispatch. A ref that resolves at NEITHER probe
 * still survives as a bare name (correct for templates; a schema that resolves
 * nowhere fails later with the existing honest ENOENT).
 */
function resolveSpecPath(value: string | undefined, specDir: string): string | undefined {
	if (!value) return undefined;
	if (value.startsWith("block:")) return value;
	if (path.isAbsolute(value)) return value;
	const adjacent = path.resolve(specDir, value);
	if (fs.existsSync(adjacent)) return adjacent;
	const sibling = path.resolve(specDir, "..", value);
	if (fs.existsSync(sibling)) return sibling;
	return value;
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
 * Relative path fields (system/task templates, output schema) are resolved per
 * the existence-gated `resolveSpecPath` contract: absolutized against the spec's
 * directory when an adjacent file exists, otherwise left as a loader-resolvable
 * name (bundled specs reference templates that live in the pi-jit-agents tier,
 * not adjacent to the spec). The `loadedFrom` field records that directory.
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
 *   1. {contextDir}/agents/{name}.agent.yaml — the active substrate dir
 *      resolved from {cwd}'s .pi-context.json pointer via
 *      tryResolveContextDir(cwd); tier omitted when no pointer resolves
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
	// Resolve the project tier once (FGAP-074 C3): pointer-less repos degrade by
	// omitting the project-tier search path so the loader still searches the
	// user/builtin tiers and ultimately throws its normal AgentNotFoundError
	// (NOT BootstrapNotFoundError). `agentsDir(cwd)` was `<contextDir>/agents`,
	// so the inline equivalent is `path.join(base, "agents", ...)`.
	const base = tryResolveContextDir(ctx.cwd);

	return (name: string): AgentSpec => {
		const searchPaths: string[] = [];
		if (base !== null) {
			searchPaths.push(path.join(base, "agents", `${name}.agent.yaml`));
		}
		searchPaths.push(path.join(userTier, `${name}.agent.yaml`));
		if (ctx.builtinDir) {
			searchPaths.push(path.join(ctx.builtinDir, `${name}.agent.yaml`));
		}

		for (const p of searchPaths) {
			if (fs.existsSync(p)) return parseAgentYaml(p);
		}

		throw new AgentNotFoundError(name, searchPaths);
	};
}
