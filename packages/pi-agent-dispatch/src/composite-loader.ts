/**
 * composite-loader — dynamic per-instance Pi tool registration from
 * config.tool_operations[] entries declaring a KIND (FEAT-010 Hybrid 3 v2).
 *
 * Reads config via loadContext(cwd). For each entry with `kind` set:
 *   1. Reject if canonical_id is in the forbidden union (L1 framework list ∪
 *      L5 project list config.tool_operations_forbidden[]) — throw, do not
 *      register.
 *   2. Skip (with `skipped` return entry) if kind is unknown to KIND_REGISTRY
 *      — forward compatibility allows future KIND additions in newer dispatch
 *      versions without crashing older config.
 *   3. Otherwise: closure-bind instance_params + register a Pi tool named
 *      canonical_id whose parameters match the KIND's argsSchema. The runtime
 *      callsite supplies args only; instance scope is fixed at this
 *      registration point.
 *
 * Entries without `kind` are FEAT-005 static-tool references and skipped here
 * (not the composite path).
 */

import type { ConfigBlock, ToolOperationDecl } from "@davidorex/pi-context/context";
import { loadContext } from "@davidorex/pi-context/context";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	type CommandAllowlistArgs,
	type CommandAllowlistInstance,
	commandAllowlistArgsSchema,
	runCommandAllowlist,
} from "./composites/command-allowlist.js";
import { type GitLogArgs, type GitLogInstance, gitLogArgsSchema, runGitLog } from "./composites/git-log.js";
import {
	type GrepPathsArgs,
	type GrepPathsInstance,
	grepPathsArgsSchema,
	runGrepPaths,
} from "./composites/grep-paths.js";
import {
	type ReadFilesArgs,
	type ReadFilesInstance,
	readFilesArgsSchema,
	runReadFiles,
} from "./composites/read-files.js";
import { FORBIDDEN_WHOLESALE_OPERATIONS } from "./operation-vocab.js";

interface KindBinding {
	argsSchema: unknown;
	run: (cwd: string, instance: Record<string, unknown>, args: Record<string, unknown>) => unknown;
}

const KIND_REGISTRY: Record<string, KindBinding> = {
	"read-files": {
		argsSchema: readFilesArgsSchema,
		run: (cwd, instance, args) =>
			runReadFiles(cwd, instance as unknown as ReadFilesInstance, args as unknown as ReadFilesArgs),
	},
	"git-log": {
		argsSchema: gitLogArgsSchema,
		run: (cwd, instance, args) => runGitLog(cwd, instance as unknown as GitLogInstance, args as unknown as GitLogArgs),
	},
	"grep-paths": {
		argsSchema: grepPathsArgsSchema,
		run: (cwd, instance, args) =>
			runGrepPaths(cwd, instance as unknown as GrepPathsInstance, args as unknown as GrepPathsArgs),
	},
	"command-allowlist": {
		argsSchema: commandAllowlistArgsSchema,
		run: (cwd, instance, args) =>
			runCommandAllowlist(
				cwd,
				instance as unknown as CommandAllowlistInstance,
				args as unknown as CommandAllowlistArgs,
			),
	},
};

export interface LoadCompositesResult {
	registered: string[];
	skipped: { canonical_id: string; reason: string }[];
}

function buildForbiddenUnion(config: ConfigBlock | null): Set<string> {
	return new Set<string>([...FORBIDDEN_WHOLESALE_OPERATIONS, ...(config?.tool_operations_forbidden ?? [])]);
}

export function loadComposites(cwd: string, pi: ExtensionAPI): LoadCompositesResult {
	const ctx = loadContext(cwd);
	const config = ctx.config;
	const forbidden = buildForbiddenUnion(config);
	const registered: string[] = [];
	const skipped: { canonical_id: string; reason: string }[] = [];

	const ops: ToolOperationDecl[] = config?.tool_operations ?? [];
	for (const entry of ops) {
		if (!entry.kind) continue; // FEAT-005 static-tool reference, not composite
		if (forbidden.has(entry.canonical_id)) {
			throw new Error(
				`composite-loader: refusing to register forbidden token: ${entry.canonical_id} (framework L1 + config L5 forbidden union; feedback_no_parallel_ungated_paths).`,
			);
		}
		const binding = KIND_REGISTRY[entry.kind];
		if (!binding) {
			skipped.push({ canonical_id: entry.canonical_id, reason: `unknown kind: ${entry.kind}` });
			continue;
		}
		const instance = entry.instance_params ?? {};
		const tool = {
			name: entry.canonical_id,
			label: entry.display_name ?? entry.canonical_id,
			description: `Composite tool (kind=${entry.kind}) — instance-scoped per config.tool_operations[].`,
			promptSnippet: `Invoke composite ${entry.canonical_id} (kind ${entry.kind}).`,
			parameters: binding.argsSchema,
			async execute(_toolCallId: string, params: Record<string, unknown>) {
				const result = binding.run(cwd, instance, params);
				return {
					details: result,
					content: [{ type: "text", text: JSON.stringify(result) }],
				};
			},
		};
		pi.registerTool(tool as unknown as Parameters<ExtensionAPI["registerTool"]>[0]);
		registered.push(entry.canonical_id);
	}

	return { registered, skipped };
}
