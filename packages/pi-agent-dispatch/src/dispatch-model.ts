/**
 * dispatch-model — derived dispatch-model resolution, per this project's
 * dispatch model-resolution precedence: spec model, then a per-role
 * model-config assignment, then the block's default.
 *
 * Mirrors the workflow executor's model-precedence policy at the agent-dispatch
 * boundary: an agent spec that names no `model` of its own falls back to the
 * active substrate's `model-config` block — first a per-role assignment
 * (`by_role[role]`), then the block's `default`. This is the same precedence
 * `packages/pi-workflows/src/dispatch.ts` (buildArgs) applies to workflow steps,
 * lifted here so a bundled spec (which carries no model) can be dispatched
 * without every caller hard-coding a model.
 *
 * The two dispatch entry points consume the resolved value differently, by
 * design:
 *   - subprocess dispatch (work-order loop) treats a `null` result as "let pi
 *     pick its own default": no `--model` flag is passed and pi resolves the
 *     model from the operator's own configuration inside the subprocess.
 *   - in-process dispatch (call-agent, which must resolve a concrete model +
 *     auth through the ExtensionContext.modelRegistry before it can call) keeps
 *     an informed throw when the resolution is still `null` — there is no pi
 *     subprocess to fall through to.
 *
 * `model-config` is read through pi-context's `readBlock`, which THROWS when the
 * block is absent; a missing/broken block is a fall-through, not an error, so
 * the read is wrapped in try/catch-to-`undefined` (the same handling the
 * workflow executor applies at `workflow-executor.ts`'s model-config load).
 */

import { readBlock } from "@davidorex/pi-context/block-api";

interface ModelConfig {
	by_role?: Record<string, string>;
	default?: string;
}

export function resolveDispatchModel(cwd: string, spec: { model?: string; role?: string }): string | null {
	if (spec.model) return spec.model;

	let modelConfig: ModelConfig | undefined;
	try {
		modelConfig = readBlock(cwd, "model-config") as ModelConfig;
	} catch {
		/* no model-config block — nothing to fall back to */
	}

	const byRole = spec.role ? modelConfig?.by_role?.[spec.role] : undefined;
	return byRole ?? modelConfig?.default ?? null;
}
