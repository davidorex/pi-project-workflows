/**
 * canonical_id rename engine (FGAP-060 / DEC-0035).
 *
 * canonical_ids are primary-key-permanent — the steady state is "never rename".
 * The rare, deliberate rename routes exclusively through `renameCanonicalId`,
 * which rewrites every substrate surface that carries the id as DATA and
 * REPORTS (never rewrites) every out-of-substrate occurrence (analysis MDs,
 * git history) so the operator can follow up manually.
 *
 * Edge model (DEC-0013): inter-item references live ONLY as relations.json
 * edges — there is NO inline-FK field on item schemas, so the engine performs
 * NO inline-FK sweep. Item renames touch (1) the item's home block id field and
 * (2) every edge whose parent/child equals the old id.
 *
 * Five canonical_id kinds exist; this engine implements four:
 *   - item          (a block item's id, e.g. DEC-0001)
 *   - relation_type (a config.relation_types[].canonical_id)
 *   - lens          (a config.lenses[].id)
 *   - layer         (a config.layers[].id)
 * The fifth — block_kind — THROWS unsupported: a block_kind rename requires a
 * coupled file / data_path / array_key / schema_path filesystem cascade, which
 * is tracked separately.
 *
 * Write discipline:
 *   - Guards (existence / collision / block_kind / unknown-kind) throw BEFORE
 *     any write — a guard failure leaves the substrate byte-untouched.
 *   - dryRun computes the would-change counts but performs ZERO writes.
 *   - All config-surface changes accumulate into a single deep-cloned config
 *     object written ONCE via writeConfig (never multiple config writes).
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { readBlock, updateItemInBlock, writeBlock } from "./block-api.js";
import {
	type ConfigBlock,
	type Edge,
	loadConfig,
	loadRelations,
	type RawEndpoint,
	writeConfig,
	writeRelations,
} from "./context.js";
import { buildIdIndex } from "./context-sdk.js";

export type RenameKind = "item" | "relation_type" | "lens" | "layer";

export interface RenameReport {
	kind: string;
	oldId: string;
	newId: string;
	dryRun: boolean;
	/** Per-surface rewrite tally — each entry is one (file, field) surface that
	 * carried ≥1 occurrence of oldId, with the count of occurrences rewritten. */
	substrateRewrites: { file: string; field: string; count: number }[];
	/** Out-of-substrate occurrences — REPORT ONLY, never rewritten. */
	outOfSubstrate: { source: string; context: string }[];
}

/**
 * Rename a canonical_id of `kind` from `oldId` to `newId`.
 *
 * Returns a {@link RenameReport} describing every substrate surface rewritten
 * (or that WOULD be rewritten, under `dryRun`) plus every out-of-substrate
 * occurrence found (always report-only).
 *
 * Throws on: kind=block_kind (unsupported), unknown kind, missing config,
 * oldId not present for the kind, or collision (newId already exists for the
 * kind). All such throws occur before any write.
 */
export function renameCanonicalId(
	cwd: string,
	kind: string,
	oldId: string,
	newId: string,
	opts?: { dryRun?: boolean },
): RenameReport {
	const dryRun = opts?.dryRun ?? false;
	const report: RenameReport = {
		kind,
		oldId,
		newId,
		dryRun,
		substrateRewrites: [],
		outOfSubstrate: [],
	};

	if (kind === "block_kind") {
		throw new Error(
			"renameCanonicalId: kind 'block_kind' is not supported — a block_kind canonical_id rename requires a coupled file/data_path/array_key/schema_path cascade (buildIdIndex resolves loc.block by file basename). Tracked separately; use display_name for relabeling.",
		);
	}

	const config = loadConfig(cwd);
	if (!config) {
		throw new Error("renameCanonicalId: no config.json");
	}

	// Single deep-cloned config accumulator: every config-surface rewrite mutates
	// THIS object; a single writeConfig at the end (when !dryRun and changed)
	// commits all surfaces atomically. Never write config more than once.
	const nextConfig: ConfigBlock = JSON.parse(JSON.stringify(config));
	let configChanged = false;

	if (kind === "item") {
		const idx = buildIdIndex(cwd);
		const loc = idx.byRefname.get(oldId);
		if (!loc) throw new Error(`renameCanonicalId: item '${oldId}' not found`);
		if (idx.byRefname.has(newId)) throw new Error(`renameCanonicalId: collision — item '${newId}' already exists`);

		// Home block id field.
		if (!dryRun) {
			updateItemInBlock(cwd, loc.block, loc.arrayKey, (i) => i.id === oldId, { id: newId });
		}
		report.substrateRewrites.push({ file: `${loc.block}.json`, field: "id", count: 1 });

		// Edges: rewrite parent and/or child wherever they equal oldId. Each
		// endpoint occurrence counts once (an edge with oldId on BOTH endpoints
		// counts as 2).
		const edges = loadRelations(cwd);
		let n = 0;
		// Rename keys on REFNAME (the consumer node identity), never oid. A legacy
		// bare string === oldId is rewritten to newId; a SAME-substrate structured
		// item (no substrate_id) whose refname === oldId gets a new refname (oid is
		// immutable and untouched). A lens_bin endpoint, a foreign item, or any
		// endpoint not matching oldId is left byte-identical.
		const renameEndpoint = (ep: RawEndpoint): RawEndpoint => {
			if (typeof ep === "string") {
				if (ep === oldId) {
					n++;
					return newId;
				}
				return ep;
			}
			if (ep.kind === "item" && ep.substrate_id === undefined && ep.refname === oldId) {
				n++;
				return { ...ep, refname: newId };
			}
			return ep;
		};
		const next: Edge[] = edges.map((e) => ({ ...e, parent: renameEndpoint(e.parent), child: renameEndpoint(e.child) }));
		if (n > 0) {
			if (!dryRun) writeRelations(cwd, next);
			report.substrateRewrites.push({ file: "relations.json", field: "parent/child", count: n });
		}
	} else if (kind === "relation_type") {
		const rt = config.relation_types ?? [];
		if (!rt.some((r) => r.canonical_id === oldId)) {
			throw new Error(`renameCanonicalId: relation_type '${oldId}' not found`);
		}
		if (rt.some((r) => r.canonical_id === newId)) {
			throw new Error(`renameCanonicalId: collision — relation_type '${newId}' already exists`);
		}

		// config.relation_types[].canonical_id
		for (const r of nextConfig.relation_types ?? []) {
			if (r.canonical_id === oldId) {
				r.canonical_id = newId;
				configChanged = true;
				report.substrateRewrites.push({ file: "config.json", field: "relation_types[].canonical_id", count: 1 });
			}
		}

		// config.invariants[].relation_types[] (array of strings)
		let invCount = 0;
		for (const inv of nextConfig.invariants ?? []) {
			if (!Array.isArray(inv.relation_types)) continue;
			inv.relation_types = inv.relation_types.map((v) => {
				if (v === oldId) {
					invCount++;
					return newId;
				}
				return v;
			});
		}
		if (invCount > 0) {
			configChanged = true;
			report.substrateRewrites.push({ file: "config.json", field: "invariants[].relation_types[]", count: invCount });
		}

		// config.lenses[].relation_type
		let lensCount = 0;
		for (const l of nextConfig.lenses ?? []) {
			if (l.relation_type === oldId) {
				l.relation_type = newId;
				lensCount++;
			}
		}
		if (lensCount > 0) {
			configChanged = true;
			report.substrateRewrites.push({ file: "config.json", field: "lenses[].relation_type", count: lensCount });
		}

		// config.hierarchy[].relation_type
		let hierCount = 0;
		for (const h of nextConfig.hierarchy ?? []) {
			if (h.relation_type === oldId) {
				h.relation_type = newId;
				hierCount++;
			}
		}
		if (hierCount > 0) {
			configChanged = true;
			report.substrateRewrites.push({ file: "config.json", field: "hierarchy[].relation_type", count: hierCount });
		}

		// relations.json edges by relation_type
		const edges = loadRelations(cwd);
		let n = 0;
		const next: Edge[] = edges.map((e) => {
			if (e.relation_type === oldId) {
				n++;
				return { ...e, relation_type: newId };
			}
			return e;
		});
		if (n > 0) {
			if (!dryRun) writeRelations(cwd, next);
			report.substrateRewrites.push({ file: "relations.json", field: "relation_type", count: n });
		}

		// context-contracts block (ONLY if its data file exists). Each contract's
		// bundle_relation_types[].relation_type is rewritten. Absent block →
		// silently skip (this repo's .project has no context-contracts data file).
		try {
			const ccData = readBlock(cwd, "context-contracts") as Record<string, unknown>;
			let ccCount = 0;
			let arrayKey: string | undefined;
			for (const [k, v] of Object.entries(ccData)) {
				if (Array.isArray(v)) {
					arrayKey = k;
					break;
				}
			}
			if (arrayKey) {
				const contracts = ccData[arrayKey] as Array<Record<string, unknown>>;
				for (const contract of contracts) {
					const brt = contract.bundle_relation_types;
					if (!Array.isArray(brt)) continue;
					for (const entry of brt as Array<Record<string, unknown>>) {
						if (entry && entry.relation_type === oldId) {
							entry.relation_type = newId;
							ccCount++;
						}
					}
				}
				if (ccCount > 0) {
					if (!dryRun) writeBlock(cwd, "context-contracts", ccData);
					report.substrateRewrites.push({
						file: "context-contracts.json",
						field: "bundle_relation_types[].relation_type",
						count: ccCount,
					});
				}
			}
		} catch {
			// context-contracts block absent — skip silently.
		}
	} else if (kind === "lens") {
		const ls = config.lenses ?? [];
		if (!ls.some((l) => l.id === oldId)) throw new Error(`renameCanonicalId: lens '${oldId}' not found`);
		if (ls.some((l) => l.id === newId)) {
			throw new Error(`renameCanonicalId: collision — lens '${newId}' already exists`);
		}

		// config.lenses[].id
		let idCount = 0;
		for (const l of nextConfig.lenses ?? []) {
			if (l.id === oldId) {
				l.id = newId;
				idCount++;
			}
		}
		if (idCount > 0) {
			configChanged = true;
			report.substrateRewrites.push({ file: "config.json", field: "lenses[].id", count: idCount });
		}

		// config.lenses[].members[].lens (composition member references)
		let memberCount = 0;
		for (const l of nextConfig.lenses ?? []) {
			for (const m of l.members ?? []) {
				if (m.lens === oldId) {
					m.lens = newId;
					memberCount++;
				}
			}
		}
		if (memberCount > 0) {
			configChanged = true;
			report.substrateRewrites.push({ file: "config.json", field: "lenses[].members[].lens", count: memberCount });
		}
	} else if (kind === "layer") {
		const ly = config.layers ?? [];
		if (!ly.some((l) => l.id === oldId)) throw new Error(`renameCanonicalId: layer '${oldId}' not found`);
		if (ly.some((l) => l.id === newId)) {
			throw new Error(`renameCanonicalId: collision — layer '${newId}' already exists`);
		}

		// config.layers[].id
		let idCount = 0;
		for (const l of nextConfig.layers ?? []) {
			if (l.id === oldId) {
				l.id = newId;
				idCount++;
			}
		}
		if (idCount > 0) {
			configChanged = true;
			report.substrateRewrites.push({ file: "config.json", field: "layers[].id", count: idCount });
		}

		// config.block_kinds[].layer (FK to layers[].id)
		let bkCount = 0;
		for (const bk of nextConfig.block_kinds ?? []) {
			if (bk.layer === oldId) {
				bk.layer = newId;
				bkCount++;
			}
		}
		if (bkCount > 0) {
			configChanged = true;
			report.substrateRewrites.push({ file: "config.json", field: "block_kinds[].layer", count: bkCount });
		}
	} else {
		throw new Error(`renameCanonicalId: unknown kind '${kind}'`);
	}

	// ── config.naming alias key (ALL kinds) ───────────────────────────────────
	// The naming map keys are canonical ids → display labels. A rename of the id
	// must carry its alias key forward (value preserved). This folds into the
	// SAME config write.
	if (nextConfig.naming && Object.hasOwn(nextConfig.naming, oldId)) {
		const value = nextConfig.naming[oldId];
		delete nextConfig.naming[oldId];
		nextConfig.naming[newId] = value;
		configChanged = true;
		report.substrateRewrites.push({ file: "config.json", field: "naming", count: 1 });
	}

	// ── Single config write ───────────────────────────────────────────────────
	if (configChanged && !dryRun) {
		writeConfig(cwd, nextConfig);
	}

	// ── Out-of-substrate scan (report-only, ALL kinds, NEVER rewrite) ──────────
	collectAnalysisMatches(cwd, oldId, report);
	collectGitMatches(cwd, oldId, report);

	return report;
}

/**
 * Recursively walk `<cwd>/analysis/**.md`; for each file whose text contains
 * oldId, push a report-only entry. Skips silently when the analysis dir is
 * absent. NEVER rewrites file content.
 */
function collectAnalysisMatches(cwd: string, oldId: string, report: RenameReport): void {
	const analysisDir = path.join(cwd, "analysis");
	if (!fs.existsSync(analysisDir)) return;

	const walk = (dir: string): void => {
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (entry.isFile() && entry.name.endsWith(".md")) {
				let text: string;
				try {
					text = fs.readFileSync(full, "utf-8");
				} catch {
					continue;
				}
				if (text.includes(oldId)) {
					const rel = path.relative(cwd, full);
					const firstLine = text.split("\n").find((ln) => ln.includes(oldId));
					report.outOfSubstrate.push({
						source: rel,
						context: firstLine ? firstLine.trim() : "matches in analysis md",
					});
				}
			}
		}
	};
	walk(analysisDir);
}

/**
 * Best-effort `git log --oneline -S<oldId>` against `cwd`; each output line
 * becomes a report-only entry. Any failure (no git, not a repo, etc.) is
 * swallowed — the scan is purely informational.
 */
function collectGitMatches(cwd: string, oldId: string, report: RenameReport): void {
	try {
		const out = execSync(`git log --oneline -S${shellQuote(oldId)}`, {
			cwd,
			stdio: ["ignore", "pipe", "ignore"],
			encoding: "utf-8",
		});
		for (const line of out.split("\n")) {
			const trimmed = line.trim();
			if (trimmed.length > 0) {
				report.outOfSubstrate.push({ source: "git", context: trimmed });
			}
		}
	} catch {
		// no git / not a repo / no matches with nonzero exit — skip silently.
	}
}

/** Single-quote a token for safe shell interpolation (escapes embedded quotes). */
function shellQuote(s: string): string {
	return `'${s.replace(/'/g, "'\\''")}'`;
}
