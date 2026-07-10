/**
 * Capability composition — the JIT capability-composition layer that
 * composes a subagent's tools per-invocation from an empty-state default,
 * scoped to exactly the operations its task needs. Composes a child grant
 * from a parent grant and a requested grant by intersection, per this
 * project's capability-governance model's clamp semantics (default-empty
 * grants, operation-granular composition, human-only capability widening,
 * and deterministic real-checks — never agent self-report — as the
 * pass/fail verdict). The executeAgent boundary enforces compiled.tools ⊆
 * parentGrant as the child-grant-must-be-a-subset-of-parent-grant clamp;
 * composeToolGrant prepares the parentGrant passed to that boundary so the
 * child can never exceed what the parent itself was granted.
 */

import fs from "node:fs";
import path from "node:path";
import { loadConfigForDir } from "@davidorex/pi-context/context";
import { tryResolveContextDir } from "@davidorex/pi-context/context-dir";
import { type OperationDescriptor, TOOL_OPERATION_DEFAULTS } from "./operation-vocab.js";

export function composeToolGrant(parentGrant: string[] | undefined, requestedGrant: string[] | undefined): string[] {
	const parent = new Set(parentGrant ?? []);
	const requested = requestedGrant ?? [];
	return requested.filter((op) => parent.has(op));
}

export function resolveOperationVocabulary(cwd: string): Record<string, OperationDescriptor> {
	const root = tryResolveContextDir(cwd);
	if (root === null) return { ...TOOL_OPERATION_DEFAULTS };
	const configPath = path.join(root, "config.json");
	if (!fs.existsSync(configPath)) return { ...TOOL_OPERATION_DEFAULTS };
	try {
		// Migration-aware read: a config whose schema_version lags the bundled
		// schema is walked forward through the registered chain before use, so
		// this reader can never see a different config shape than loadConfig.
		// The fail-safe contract is unchanged — any load failure (unparsable,
		// unresolvable version, invalid) yields the defaults.
		const cfg = loadConfigForDir(root) as { tool_operations?: OperationDescriptor[] } | null;
		if (!cfg) return { ...TOOL_OPERATION_DEFAULTS };
		const overrides: Record<string, OperationDescriptor> = {};
		for (const entry of cfg.tool_operations ?? []) overrides[entry.canonical_id] = entry;
		return { ...TOOL_OPERATION_DEFAULTS, ...overrides };
	} catch {
		return { ...TOOL_OPERATION_DEFAULTS };
	}
}
