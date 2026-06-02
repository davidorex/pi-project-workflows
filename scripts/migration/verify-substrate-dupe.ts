import fs from "node:fs";
import path from "node:path";
import { writeBootstrapPointer } from "@davidorex/pi-context/context-dir";
import { validateContext } from "@davidorex/pi-context/context-sdk";

/** Codes that count as canonicalization/fold-in defects on a verified work-dupe.
 * Registry-level issues (substrate_id_unregistered / substrate_id_registry_mismatch)
 * are EXPECTED for an unregistered work-dupe and are intentionally NOT included. */
const BLOCKING_CODES = new Set([
	"nested_id_bearing_array",
	"edge_endpoint_dangling",
	"edge_endpoint_unregistered",
	"edge_parent_not_in_bins",
	"edge_cycle_detected",
]);

/** Verify a work-dupe substrate via a pointer-switch + validateContext.
 *
 * Pointer-switches the active substrate of `cwd` to the work-dupe at
 * `workDirRel` (`writeBootstrapPointer`), runs `validateContext`, and filters
 * the reported issues by `BLOCKING_CODES`. Captures the prior `.pi-context.json`
 * bytes verbatim and ALWAYS restores them in a `finally` regardless of outcome —
 * a lossless restore (preserves previous_contextDir / switched_at / switched_by /
 * version that a writeBootstrapPointer rewrite would drop) rather than a
 * reconstruction via writeBootstrapPointer. Returns the blocking issue list
 * (empty ⇒ clean). */
export function verifyDupe(cwd: string, workDirRel: string): { ok: boolean; issues: string[] } {
	const pointerPath = path.join(cwd, ".pi-context.json");
	const originalBytes = fs.existsSync(pointerPath) ? fs.readFileSync(pointerPath, "utf-8") : null;
	try {
		writeBootstrapPointer(cwd, workDirRel);
		const result = validateContext(cwd);
		const blocking = result.issues.filter((i) => i.code !== undefined && BLOCKING_CODES.has(i.code));
		const issues = blocking.map((i) => `${i.code}: ${i.message}`);
		return { ok: issues.length === 0, issues };
	} finally {
		if (originalBytes !== null) fs.writeFileSync(pointerPath, originalBytes, "utf-8");
		else if (fs.existsSync(pointerPath)) fs.unlinkSync(pointerPath);
	}
}
