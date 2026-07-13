/**
 * Agent spec loading and resolution.
 *
 * Two design rules govern this module: specs leave the loading boundary
 * fully resolved (every path field absolute), and discovery is a three-tier
 * search — the active substrate's agents/ dir, then the user tier
 * (~/.pi/agent/agents/), then the package builtin tier. Agent-spec discovery
 * never reads the project-level .pi/ dir (<cwd>/.pi/agents/ is not a tier).
 * That scope is per-surface, not package-wide: template/renderer discovery
 * DOES probe <cwd>/.pi/templates/ as its project tier (renderer-registry.ts),
 * and the user tiers on both surfaces live under ~/.pi/agent/.
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
 *   (specDir-adjacent) then, ONLY when `siblingProbe` is true, (2) the spec
 *   directory's PARENT (the package-root sibling convention). The value is
 *   absolutized to the FIRST probe that finds a file on disk; if no enabled
 *   probe resolves, the value is returned UNCHANGED as a loader-resolvable name.
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
 * The package-root sibling probe extends the gate to a bundled-agent layout
 * where an `agents/*.agent.yaml` spec references a schema that lives in a
 * SIBLING `schemas/` dir at the package root. The canonical bundled catalog
 * (pi-context `samples/agents/`) now ships its output schemas spec-ADJACENT
 * (`samples/agents/schemas/`), so those refs resolve at the first probe and
 * the sibling probe is a compatibility path for any older or third-party
 * bundled layout that still uses the package-root sibling convention. Unlike
 * templates, an
 * outputSchema gets no downstream loader-tier resolution — resolveOutputSchema-
 * ForCompile passes non-block values through unchanged and buildPhantomTool
 * reads them directly against process.cwd() — so a relative schema ref left as
 * a bare name fails with an ENOENT at dispatch. Absolutizing against the spec
 * dir's parent here (mirroring how pi-behavior-monitors absolutizes its
 * classifiers' relative schema refs before dispatch) is what makes those
 * schema-bearing bundled specs dispatch. A ref that resolves at NEITHER probe
 * still survives as a bare name (correct for templates; a schema that resolves
 * nowhere fails later with the existing honest ENOENT).
 *
 * `siblingProbe` gates that parent probe to the BUNDLED tier ONLY (the caller
 * passes true exclusively when the spec was matched from ctx.builtinDir). The
 * sibling convention is a fact about the packaged layout — agents/ and schemas/
 * are package-root siblings — and does NOT hold for the local-substrate tier
 * (<contextDir>/agents/, whose parent's schemas/ holds pi-context BLOCK schemas)
 * or the user tier (~/.pi/agent/agents/, whose parent is user config). Running
 * the parent probe there would let a spec's relative `schemas/x.schema.json` ref
 * silently absolutize onto a same-basename block/config schema and mis-validate
 * agent output. Default false keeps local/user specs adjacent-only plus the
 * loader-name fallthrough; the adjacent probe and that fallthrough are
 * unconditional across all tiers.
 */
function resolveSpecPath(value: string | undefined, specDir: string, siblingProbe: boolean): string | undefined {
	if (!value) return undefined;
	if (value.startsWith("block:")) return value;
	if (path.isAbsolute(value)) return value;
	const adjacent = path.resolve(specDir, value);
	if (fs.existsSync(adjacent)) return adjacent;
	if (siblingProbe) {
		const sibling = path.resolve(specDir, "..", value);
		if (fs.existsSync(sibling)) return sibling;
	}
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
 * entry's index and the failing constraint. The compile-time injector consumes
 * the resulting union shape; this helper does not assign any runtime semantics.
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
 *
 * `opts.siblingProbe` (default false) additionally allows absolutizing a
 * non-adjacent relative ref against the spec dir's PARENT (the package-root
 * agents/⇄schemas/ sibling convention). It is enabled ONLY for specs loaded from
 * the bundled tier; local/user specs stay adjacent-only so a `schemas/x` ref can
 * never silently resolve onto a substrate block schema or user-config sibling.
 * See `resolveSpecPath`.
 */
export function parseAgentYaml(filePath: string, opts?: { siblingProbe?: boolean }): AgentSpec {
	const name = path.basename(filePath, ".agent.yaml");
	const specDir = path.dirname(filePath);
	const siblingProbe = opts?.siblingProbe ?? false;

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
		systemPromptTemplate: resolveSpecPath(systemField.template, specDir, siblingProbe),
		taskPrompt: taskField.inline,
		taskPromptTemplate: resolveSpecPath(taskField.template, specDir, siblingProbe),
		inputSchema: spec.input,
		outputFormat: spec.output?.format,
		outputSchema: resolveSpecPath(spec.output?.schema, specDir, siblingProbe),
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
 * IMPORTANT: Does NOT search <cwd>/.pi/agents/ — for agent specs, the
 * project-level .pi/ dir is Pi platform territory. This rule is scoped to
 * agent-spec discovery only: the package's template/renderer discovery uses
 * <cwd>/.pi/templates/ as its project tier (see renderer-registry.ts), and
 * the user tier here defaults to ~/.pi/agent/agents/.
 *
 * Tier note: the package-root sibling probe in `parseAgentYaml` is enabled ONLY
 * when the matched spec came from the builtin/bundled tier (ctx.builtinDir),
 * because the agents/⇄schemas/ sibling convention is a fact of the bundled
 * package layout. A local-substrate spec (<contextDir>/agents/) or user spec
 * (~/.pi/agent/agents/) is parsed with the probe OFF so its relative refs cannot
 * silently absolutize onto a same-basename block/config schema in the sibling dir.
 */
export function createAgentLoader(ctx: LoadContext): (name: string) => AgentSpec {
	const userTier = ctx.userDir ?? path.join(os.homedir(), ".pi", "agent", "agents");
	// Resolve the project tier once: when no substrate bootstrap pointer resolves
	// for this cwd, the project-tier search path is simply omitted so the loader
	// still searches the user/builtin tiers and ultimately throws its normal
	// AgentNotFoundError (NOT a "no bootstrap" error). `agentsDir(cwd)` was
	// `<contextDir>/agents`, so the inline equivalent is `path.join(base, "agents", ...)`.
	const base = tryResolveContextDir(ctx.cwd);

	return (name: string): AgentSpec => {
		const searchPaths: string[] = [];
		if (base !== null) {
			searchPaths.push(path.join(base, "agents", `${name}.agent.yaml`));
		}
		searchPaths.push(path.join(userTier, `${name}.agent.yaml`));
		// The bundled-tier path (when present) is the ONLY one that enables the
		// package-root sibling probe — capture it so the match below can compare.
		const builtinPath = ctx.builtinDir ? path.join(ctx.builtinDir, `${name}.agent.yaml`) : null;
		if (builtinPath !== null) {
			searchPaths.push(builtinPath);
		}

		for (const p of searchPaths) {
			if (fs.existsSync(p)) return parseAgentYaml(p, { siblingProbe: p === builtinPath });
		}

		throw new AgentNotFoundError(name, searchPaths);
	};
}
