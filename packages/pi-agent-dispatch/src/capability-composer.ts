/**
 * Capability composition (FEAT-005). Composes a child grant from a parent
 * grant and a requested grant by intersection — DEC-0047 clamp semantics.
 * The TASK-081 executeAgent boundary enforces compiled.tools ⊆ parentGrant;
 * composeToolGrant prepares the parentGrant passed to that boundary so the
 * child can never exceed what the parent itself was granted.
 */

import fs from "node:fs";
import path from "node:path";
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
		const cfg = JSON.parse(fs.readFileSync(configPath, "utf8")) as { tool_operations?: OperationDescriptor[] };
		const overrides: Record<string, OperationDescriptor> = {};
		for (const entry of cfg.tool_operations ?? []) overrides[entry.canonical_id] = entry;
		return { ...TOOL_OPERATION_DEFAULTS, ...overrides };
	} catch {
		return { ...TOOL_OPERATION_DEFAULTS };
	}
}
