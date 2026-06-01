#!/usr/bin/env tsx
/**
 * foldin-context — Claude-Code-side orchestrator that folds a LEGACY substrate
 * into the content-addressed canon via the same triple-buffer (dupe / verify /
 * swap) that `canonicalize-substrate.ts` uses to de-risk a one-shot transform.
 *
 * Where `canonicalize-substrate.ts` runs the Cycle-10 canonicalizer (nested-array
 * promotion + orphan-block registration), this script runs the FOLD-IN sequence
 * for an already-flat substrate that predates the identity model:
 *
 *   1. De-nest the `layer-plans` schema — drop the `layers` + `migration_phases`
 *      sub-arrays from the `plans` item shape (and from its `required`), so the
 *      schema no longer declares nested id-bearing arrays.
 *   2. `landIdentityFieldsForDir` — inject oid/content_hash/content_parent field
 *      DECLARATIONS onto every block_kind's item schema (surgical, optional).
 *   3. Edge rewrite — promote bare cross-substrate refnames (a bare string that is
 *      NOT a local item id) to the `project:` alias form, so the subsequent
 *      content-addressing migration resolves them as foreign endpoints rather than
 *      treating them as same-substrate items / lens bins.
 *   4. `migrateToContentAddressed(..., {register:false})` — mint substrate_id +
 *      backfill identity + convert endpoints on the dupe, WITHOUT writing the
 *      project-root registry (registration is deferred to the post-swap step so
 *      the registry only ever names the live substrate, never a transient dupe).
 *
 * Triple-buffer (mirrors canonicalize-substrate.ts):
 *   - dupe   — `fs.cpSync(substrate, workDir, {recursive:true})` to a root-sibling
 *              `<cwd>/.context-temp` (a DIRECT CHILD of cwd, so OP4's
 *              migrateToContentAddressed discovers + `onlySubstrates`-filters it;
 *              a `tmp/`-nested dupe would be a child of `tmp/`, never discovered).
 *   - run    — the 4 ops above mutate ONLY the dupe; a throw discards it (exit ≠ 0,
 *              original untouched).
 *   - verify — pointer-switch the cwd to the dupe (`writeBootstrapPointer`),
 *              `validateContext`, assert no blocking issue (SAME BLOCKING_CODES set
 *              as canonicalize-substrate.ts; substrate_id_unregistered /
 *              substrate_id_registry_mismatch are EXPECTED for an unregistered dupe
 *              and intentionally NOT blocking), restore the original pointer in a
 *              `finally`.
 *   - swap   — on verify pass + not `--no-swap`: atomic rename (substrate→`.bak`,
 *              workDir→substrate, rm `.bak`, rollback on rename failure), THEN
 *              register the now-live substrate under its minted id (post-swap, so
 *              the registry dir resolves to the live substrate).
 *
 * `--no-swap` is the inspect-only mode: after a passing verify it leaves the dupe
 * in place and exits 0 without swapping or registering. There is NO `--dry-run` —
 * the dupe-verify cycle IS the de-risk.
 *
 * Usage:
 *   tsx scripts/orchestrator/foldin-context.ts [--substrate <dir>] [--cwd <dir>] [--no-swap]
 *   (defaults: --substrate .context, --cwd process.cwd())
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadRelationsForDir, type RawEndpoint, writeRelationsForDir } from "@davidorex/pi-context/context";
import { writeBootstrapPointer } from "@davidorex/pi-context/context-dir";
import { registerSubstrate } from "@davidorex/pi-context/context-registry";
import { validateContext } from "@davidorex/pi-context/context-sdk";
import { landIdentityFieldsForDir } from "@davidorex/pi-context/land-identity-fields";
import { migrateToContentAddressed } from "@davidorex/pi-context/migrate-content-addressed";
import { writeSchemaCheckedForDir } from "@davidorex/pi-context/schema-write";

interface Args {
	substrate: string;
	cwd: string;
	noSwap: boolean;
}

function parseArgs(argv: string[]): Args {
	const out: Args = { substrate: ".context", cwd: process.cwd(), noSwap: false };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--substrate" && argv[i + 1]) {
			out.substrate = argv[i + 1];
			i++;
		} else if (a === "--cwd" && argv[i + 1]) {
			out.cwd = argv[i + 1];
			i++;
		} else if (a === "--no-swap") {
			out.noSwap = true;
		} else {
			console.error(`Unknown argument: ${a}`);
			process.exit(2);
		}
	}
	return out;
}

/** Verify a folded work-dupe via a pointer-switch + validateContext. Captures the
 * prior `.pi-context.json` bytes verbatim and restores them in a finally
 * regardless of outcome (a lossless restore — preserves previous_contextDir /
 * switched_at / switched_by / version that a writeBootstrapPointer rewrite would
 * drop). Returns the blocking issue list (empty ⇒ clean). Mirrors
 * canonicalize-substrate.ts's verifyDupe + its BLOCKING_CODES set verbatim. */
function verifyDupe(cwd: string, workDirRel: string): { ok: boolean; issues: string[] } {
	const pointerPath = path.join(cwd, ".pi-context.json");
	const originalBytes = fs.existsSync(pointerPath) ? fs.readFileSync(pointerPath, "utf-8") : null;
	try {
		writeBootstrapPointer(cwd, workDirRel);
		const result = validateContext(cwd);
		// Registry-level issues (substrate_id_unregistered / substrate_id_registry_mismatch)
		// are EXPECTED for an unregistered work-dupe (register:false skipped the registry
		// write; registration happens post-swap) and are intentionally NOT blocking.
		const BLOCKING_CODES = new Set([
			"nested_id_bearing_array",
			"edge_endpoint_dangling",
			"edge_endpoint_unregistered",
			"edge_parent_not_in_bins",
			"edge_cycle_detected",
		]);
		const blocking = result.issues.filter((i) => i.code !== undefined && BLOCKING_CODES.has(i.code));
		const issues = blocking.map((i) => `${i.code}: ${i.message}`);
		return { ok: issues.length === 0, issues };
	} finally {
		if (originalBytes !== null) fs.writeFileSync(pointerPath, originalBytes, "utf-8");
		else if (fs.existsSync(pointerPath)) fs.unlinkSync(pointerPath);
	}
}

/** Build the set of local item refnames (every block item's `id`) in a substrate
 * dir by reading the config's block_kinds + their data files directly. Read-only. */
function localRefnames(substrateAbs: string): Set<string> {
	const out = new Set<string>();
	const configPath = path.join(substrateAbs, "config.json");
	let config: Record<string, unknown>;
	try {
		config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<string, unknown>;
	} catch {
		return out;
	}
	const blockKinds = Array.isArray(config.block_kinds) ? (config.block_kinds as Record<string, unknown>[]) : [];
	for (const bk of blockKinds) {
		const dataPath = typeof bk.data_path === "string" ? bk.data_path : undefined;
		const arrayKey = typeof bk.array_key === "string" ? bk.array_key : undefined;
		if (!dataPath || !arrayKey) continue;
		const dataAbs = path.isAbsolute(dataPath) ? dataPath : path.join(substrateAbs, dataPath);
		if (!fs.existsSync(dataAbs)) continue;
		let block: Record<string, unknown>;
		try {
			block = JSON.parse(fs.readFileSync(dataAbs, "utf-8")) as Record<string, unknown>;
		} catch {
			continue;
		}
		const arr = block[arrayKey];
		if (!Array.isArray(arr)) continue;
		for (const raw of arr) {
			if (raw && typeof raw === "object") {
				const id = (raw as Record<string, unknown>).id;
				if (typeof id === "string" && id.length > 0) out.add(id);
			}
		}
	}
	return out;
}

/** OP 1 — de-nest the `layer-plans` schema on the dupe: drop the `layers` +
 * `migration_phases` sub-arrays from the `plans` item shape + its `required`,
 * preserving everything else byte-for-byte. Absent schema → printed skip, no throw. */
function denestLayerPlans(workDir: string): void {
	const schemaPath = path.join(workDir, "schemas", "layer-plans.schema.json");
	if (!fs.existsSync(schemaPath)) {
		console.error("foldin-context: OP1 — no layer-plans schema present; skipping de-nest.");
		return;
	}
	const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8")) as Record<string, unknown>;
	// Deep-clone so the in-memory edit cannot alias the parsed object.
	const body = structuredClone(schema) as Record<string, unknown>;
	const props = body.properties as Record<string, unknown> | undefined;
	const plans = props?.plans as Record<string, unknown> | undefined;
	const items = plans?.items as Record<string, unknown> | undefined;
	if (items && typeof items === "object") {
		const itemProps = items.properties as Record<string, unknown> | undefined;
		if (itemProps) {
			delete itemProps.layers;
			delete itemProps.migration_phases;
		}
		const required = items.required;
		if (Array.isArray(required)) {
			items.required = required.filter((r) => r !== "layers" && r !== "migration_phases");
		}
	}
	writeSchemaCheckedForDir(workDir, "layer-plans", body, "replace");
	console.error("foldin-context: OP1 — de-nested layer-plans (dropped layers + migration_phases from plans items).");
}

/** OP 3 — promote bare cross-substrate refnames to the `project:` alias. A bare
 * string endpoint (no `:`) that is NOT a local item id is rewritten to
 * `"project:" + endpoint`. Structured endpoints, `alias:refname` strings, and
 * local-refname bare strings are left unchanged. Writes only if any edge changed. */
function promoteCrossSubstrateRefs(workDir: string, locals: Set<string>): void {
	const edges = loadRelationsForDir(workDir);
	if (edges.length === 0) {
		console.error("foldin-context: OP3 — no relations; skipping edge rewrite.");
		return;
	}
	const promote = (ep: RawEndpoint): RawEndpoint => {
		if (typeof ep !== "string") return ep; // structured → unchanged
		if (ep.includes(":")) return ep; // already aliased → unchanged
		if (locals.has(ep)) return ep; // local item refname → unchanged
		return `project:${ep}`; // cross-substrate bare ref → promote
	};
	let changed = 0;
	const next = edges.map((e) => {
		const parent = promote(e.parent);
		const child = promote(e.child);
		if (parent !== e.parent || child !== e.child) changed++;
		return { ...e, parent, child };
	});
	if (changed > 0) {
		writeRelationsForDir(workDir, next);
		console.error(`foldin-context: OP3 — promoted ${changed} bare cross-substrate ref(s) to project: alias.`);
	} else {
		console.error("foldin-context: OP3 — no bare cross-substrate refs to promote.");
	}
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	const substrateAbs = path.isAbsolute(args.substrate) ? args.substrate : path.resolve(args.cwd, args.substrate);

	if (!fs.existsSync(path.join(substrateAbs, "config.json"))) {
		console.error(`foldin-context: no config.json under ${substrateAbs} — not a substrate`);
		process.exit(3);
	}

	// ── Dupe ───────────────────────────────────────────────────────────────────
	// The work-dupe MUST be a DIRECT CHILD of cwd: OP4's migrateToContentAddressed
	// discovers substrates by `fs.readdirSync(cwd)` and filters by the child dir name
	// via `onlySubstrates`. A dupe nested under `tmp/` is a child of `tmp/`, not of
	// cwd, so it would never be discovered and OP4 would no-op. We therefore dupe to a
	// root-sibling `.context-temp` (mirrors `.project-migrate` siblings). `stamp` is
	// retained only for the swap's `.bak-<stamp>` name.
	const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;
	const workDirName = ".context-temp";
	const workDir = path.join(args.cwd, workDirName);
	if (fs.existsSync(workDir)) {
		console.error(
			`foldin-context: ${workDirName} already exists — remove it before running (a prior interrupted run is not silently reused).`,
		);
		process.exit(3);
	}
	fs.cpSync(substrateAbs, workDir, { recursive: true });

	// ── Ops on the dupe (a throw discards the dupe; original untouched) ──────────
	try {
		denestLayerPlans(workDir); // OP1
		landIdentityFieldsForDir(workDir); // OP2
		console.error("foldin-context: OP2 — landed identity-field declarations.");
		promoteCrossSubstrateRefs(workDir, localRefnames(workDir)); // OP3 (locals computed on the dupe pre-rewrite)
		const report = migrateToContentAddressed(args.cwd, {
			onlySubstrates: [workDirName],
			register: false,
		}); // OP4
		console.log(JSON.stringify(report, null, 2));
	} catch (err) {
		fs.rmSync(workDir, { recursive: true, force: true });
		console.error(
			`foldin-context: fold-in failed on the dupe (original untouched): ${err instanceof Error ? err.message : String(err)}`,
		);
		process.exit(3);
	}

	// ── Verify (original pointer restored in finally) ────────────────────────────
	// workDir is a direct child of cwd, so its relative dir name IS workDirName.
	const verdict = verifyDupe(args.cwd, workDirName);
	if (!verdict.ok) {
		fs.rmSync(workDir, { recursive: true, force: true });
		console.error("foldin-context: VERIFY FAILED on the dupe (original untouched). Blocking issues:");
		for (const issue of verdict.issues) console.error(`  - ${issue}`);
		process.exit(1);
	}

	if (args.noSwap) {
		console.error(`foldin-context: VERIFY OK, --no-swap → leaving dupe at ${workDir}; original untouched.`);
		return;
	}

	// ── Swap: substrate → .bak-<stamp>, workDir → substrate, rm .bak ─────────────
	const bak = `${substrateAbs}.bak-${stamp}`;
	fs.renameSync(substrateAbs, bak);
	try {
		fs.renameSync(workDir, substrateAbs);
	} catch (err) {
		fs.renameSync(bak, substrateAbs);
		console.error(
			`foldin-context: swap failed, original restored: ${err instanceof Error ? err.message : String(err)}`,
		);
		process.exit(3);
	}
	fs.rmSync(bak, { recursive: true, force: true });
	console.error(`foldin-context: SWAP OK — ${substrateAbs} is now folded-in.`);

	// ── Post-swap register: now-live substrate under its minted id ───────────────
	const config = JSON.parse(fs.readFileSync(path.join(substrateAbs, "config.json"), "utf-8")) as {
		substrate_id?: string;
	};
	const substrateId = config.substrate_id;
	if (typeof substrateId !== "string" || substrateId.length === 0) {
		console.error("foldin-context: post-swap — no substrate_id on the folded config; skipping registry write.");
		return;
	}
	registerSubstrate(args.cwd, substrateId, args.substrate, []);
	console.error(`foldin-context: REGISTERED ${substrateId} → ${args.substrate}.`);
}

main();
