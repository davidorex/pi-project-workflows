/**
 * resolve-conflicts — the conflict RESOLVER for `pi-context update` (TASK-037 —
 * FEAT-006 T4).
 *
 * The `update` op (TASK-034) brings the installed substrate model current with
 * the packaged catalog and, for a `locally-modified` / `both-diverged` schema,
 * runs a 3-way merge (TASK-036). A merge that surfaces irreconcilable per-path
 * disagreements writes NOTHING and records `{ name, conflicts }` under
 * `UpdateResult.conflicts`. This module ROUTES that conflict set to one of two
 * resolution surfaces, chosen by the caller (`cli.ts`) from the TTY signal:
 *
 *   - non-interactive → render a readable conflict report to stdout (no spawn,
 *     no writes). The operator reconciles manually later.
 *   - interactive     → per conflicting schema, dispatch an interactive
 *     `pi-bound` mergetool agent (its bounded tool surface already grants
 *     `read-schema` + `write-schema`; the auth-gate confirms the live write).
 *     After the agent returns, re-fingerprint the installed schema file via
 *     `refreshBaselineForSchema`: a CHANGED hash ⇒ the mergetool reconciled it
 *     (recorded `resolved`); an UNCHANGED hash ⇒ it did not (recorded
 *     `unresolved`).
 *
 * The loop is failure-isolated: a missing merge input or a per-schema throw is
 * caught and recorded (never re-thrown out of `resolveConflicts`), so one
 * un-reconcilable schema does not abort the remaining ones.
 *
 * This module GRANTS the bounded surface + DISPATCHES `pi-bound`; it does NOT
 * reach into `pi-bound`'s internals or the auth-gate — the live write is the
 * agent's, gated by the substrate's own confirm.
 */
import type { spawn } from "node:child_process";
import {
	getConflictMergeInputs,
	refreshBaselineForSchema,
	renderConflicts,
	type SchemaConflict,
} from "@davidorex/pi-context";
import { runPiBound } from "./pi-bound.js";

/** Injected dependencies for {@link resolveConflicts}. */
export interface ResolveDeps {
	/** Target substrate cwd — the dir whose `.pi-context.json` points at the active substrate. */
	cwd: string;
	/** When false, render the conflict report (no spawn); when true, dispatch the mergetool. */
	interactive: boolean;
	/** Test seam — injectable spawn forwarded to `runPiBound` (defaults to the real `pi` launch). */
	spawn?: typeof spawn;
	/** Diagnostic sink (per-schema notes) — defaults to `process.stderr`. */
	stderr?: NodeJS.WritableStream;
	/** Report sink (the non-interactive `renderConflicts` text) — defaults to `process.stdout`. */
	stdout?: NodeJS.WritableStream;
	/** Test-only override forwarded to `runPiBound` for its static-tool derivation. */
	skillRoots?: string[];
}

/** The per-schema disposition tally returned by {@link resolveConflicts}. */
export interface ResolveResult {
	/** Schemas whose installed body CHANGED after the mergetool ran (reconciled + re-baselined). */
	resolved: string[];
	/** Schemas the mergetool left byte-unchanged, OR a per-schema throw / missing-input fallback. */
	unresolved: string[];
	/** Schemas surfaced through the non-interactive report (no mergetool dispatched). */
	reported: string[];
}

/**
 * Route a conflict set to the interactive mergetool or the rendered report.
 *
 * @param conflicts the `UpdateResult.conflicts` array — `{ name, conflicts }` per
 *                  schema whose 3-way merge surfaced irreconcilable disagreements.
 * @param deps      target cwd + interactivity + injectable spawn / sinks / skillRoots.
 * @returns the `{ resolved, unresolved, reported }` tally (never throws).
 */
export async function resolveConflicts(
	conflicts: Array<{ name: string; conflicts: SchemaConflict[] }>,
	deps: ResolveDeps,
): Promise<ResolveResult> {
	const result: ResolveResult = { resolved: [], unresolved: [], reported: [] };
	if (conflicts.length === 0) return result;

	const stderr = deps.stderr ?? process.stderr;

	if (!deps.interactive) {
		// Non-interactive: render the report, dispatch nothing, write nothing.
		(deps.stdout ?? process.stdout).write(renderConflicts(conflicts));
		result.reported = conflicts.map((c) => c.name);
		return result;
	}

	for (const { name, conflicts: set } of conflicts) {
		try {
			const inputs = getConflictMergeInputs(deps.cwd, name);
			if (inputs === null) {
				// No safe merge inputs (absent base body / catalog kind / parse failure)
				// → nothing for the mergetool to reconcile against; surface + skip.
				result.reported.push(name);
				stderr.write(
					`pi-context update: ${name} — no retrievable merge inputs (base/ours/theirs); cannot dispatch mergetool, reported.\n`,
				);
				continue;
			}
			const prompt = buildReconcilePrompt(name, set, inputs);
			await runPiBound(["-p", prompt], {
				cwd: deps.cwd,
				spawn: deps.spawn,
				stderr: deps.stderr,
				skillRoots: deps.skillRoots,
			});
			// A CHANGED installed-body hash signals the mergetool wrote a reconciled
			// draft; an UNCHANGED hash signals it did not reconcile this schema.
			if (refreshBaselineForSchema(deps.cwd, name)) {
				result.resolved.push(name);
			} else {
				result.unresolved.push(name);
			}
		} catch (err) {
			// A per-schema throw must not abort the remaining schemas — record it as
			// unresolved with an attributed note and continue the loop.
			result.unresolved.push(name);
			stderr.write(`pi-context update: ${name} — mergetool dispatch failed (${(err as Error).message}); unresolved.\n`);
		}
	}

	return result;
}

/**
 * Compose the reconcile prompt handed to the `pi-bound` mergetool agent for one
 * conflicting schema. Embeds the schema `name`, the typed conflict set, and the
 * three merge bodies, and instructs the agent to produce a reconciled draft-07
 * schema and write it via `write-schema` (preview with `--dryRun` first; the
 * auth-gate confirms the live write).
 */
function buildReconcilePrompt(
	name: string,
	conflicts: SchemaConflict[],
	inputs: { base: Record<string, unknown>; ours: Record<string, unknown>; theirs: Record<string, unknown> },
): string {
	return [
		`You are reconciling a 3-way merge conflict in the installed JSON Schema "${name}".`,
		"",
		"The automatic merge could not resolve the following per-path disagreements.",
		"Each conflict carries the value at that dotted schema path in the merge BASE",
		"(the body the schema was last installed/resynced from), OURS (the currently-",
		"installed, locally-edited body), and THEIRS (the catalog's current body):",
		"",
		JSON.stringify(conflicts, null, 2),
		"",
		`BASE (last-baseline body for "${name}"):`,
		JSON.stringify(inputs.base, null, 2),
		"",
		`OURS (currently-installed, locally-edited body for "${name}"):`,
		JSON.stringify(inputs.ours, null, 2),
		"",
		`THEIRS (catalog's current body for "${name}"):`,
		JSON.stringify(inputs.theirs, null, 2),
		"",
		"Produce a single reconciled draft-07 JSON Schema that honors the operator's",
		"local intent (OURS) and the catalog's new structure (THEIRS) at every",
		"conflicting path. Then write it back with:",
		"",
		`  write-schema --schemaName ${name} --operation replace --schema '<reconciled-json>'`,
		"",
		"Preview the write first with --dryRun; the auth-gate will confirm the live write.",
	].join("\n");
}
