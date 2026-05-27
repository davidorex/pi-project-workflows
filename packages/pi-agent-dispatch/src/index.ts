import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { authorAgentSpecTool } from "./author-agent-spec-tool.js";
import { authorToolGrantTool } from "./author-tool-grant-tool.js";
import { callAgentTool } from "./call-agent-tool.js";
import { commitAttestedTool } from "./commit-attested-tool.js";
import { loadComposites } from "./composite-loader.js";
import {
	FORBIDDEN_WHOLESALE_OPERATIONS,
	type OperationDescriptor,
	TOOL_OPERATION_DEFAULTS,
} from "./operation-vocab.js";
import { runRealChecksTool } from "./run-real-checks-tool.js";

/**
 * L3 runtime guard (FEAT-010): on extension load, assert defaults
 * contains no FORBIDDEN_WHOLESALE_OPERATIONS token. Catches the failure mode
 * where a future maintainer adds a wholesale entry to defaults and the L2
 * test invariant is bypassed (e.g. tests not run pre-commit). Throws to
 * halt extension load — refusing to start with a broken-canon vocabulary
 * is the only safe option per feedback_no_parallel_ungated_paths.
 *
 * Exported (with `defaults` arg) so tests can supply a synthetic
 * violator-containing map and assert the throw path without mutating the
 * module-level const.
 */
export function assertDefaultsClean(defaults: Record<string, OperationDescriptor> = TOOL_OPERATION_DEFAULTS): void {
	const violators = Object.values(defaults).filter((op) =>
		(FORBIDDEN_WHOLESALE_OPERATIONS as readonly string[]).includes(op.canonical_id),
	);
	if (violators.length > 0) {
		throw new Error(
			`pi-agent-dispatch: L3 runtime guard tripped — TOOL_OPERATION_DEFAULTS contains forbidden wholesale tokens [${violators.map((v) => v.canonical_id).join(", ")}]. Source change + release required to remove.`,
		);
	}
}

const extension = (pi: ExtensionAPI) => {
	// L3: assert framework defaults clean of forbidden-wholesale tokens
	assertDefaultsClean();

	// Static tools (FEAT-005 / DEC-0047 / TASK-088-090)
	pi.registerTool(authorAgentSpecTool);
	pi.registerTool(callAgentTool);
	pi.registerTool(runRealChecksTool);
	pi.registerTool(commitAttestedTool);
	pi.registerTool(authorToolGrantTool);

	// Dynamic composite-tool registration from config.tool_operations[]
	// (FEAT-010). loadComposites throws if any entry hits the L1∪L5
	// forbidden union — refuse to start rather than register a parallel
	// ungated path.
	loadComposites(process.cwd(), pi);
};

export default extension;
