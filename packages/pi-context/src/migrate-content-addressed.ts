/**
 * §H content-addressing migration (Cycle 10 / Phase H1).
 *
 * One repo-wide migration that brings every substrate under the project root
 * into the content-addressed identity model:
 *
 *   0. FAIL-FAST: each discovered substrate's live block schemas MUST declare
 *      the three identity fields (oid / content_hash / content_parent) on their
 *      array items — otherwise the backfill below would silently no-op the
 *      stamping gate and leave items unaddressed. A missing declaration throws
 *      before any write.
 *   1. DISCOVER every `<root>/<dir>/config.json`-bearing substrate.
 *   2. MINT + REGISTER a substrate_id per substrate (idempotent — a substrate
 *      already carrying a valid id is left as-is). The active substrate's id is
 *      registered with `registry[id].dir` resolving to the active contextDir so
 *      the SoT-drift invariant (validateContext) is satisfied. A default
 *      `project → <the .project substrate>` alias is recorded onto the target
 *      substrate's registry entry (merged with any pre-existing aliases, since
 *      registerSubstrate CLOBBERS the entry).
 *   3. BACKFILL oid / content_hash / objects onto every existing item by reading
 *      each block's full object and writing it back through writeBlockForDir —
 *      the create-mode stamp fills gaps and the post-validation walk persists
 *      objects. Idempotent: a second run mints zero new oids.
 *   4. CONVERT relation endpoints (per substrate, AFTER all backfill so foreign
 *      oids exist): bare structured form for same-substrate refnames, lens_bin
 *      for bin labels, and structured FOREIGN form for legacy `<alias>:<refname>`
 *      strings (resolved via the alias map → target substrate_id + the target
 *      item's backfilled oid). Unresolvable endpoints land in `report.unresolved`
 *      and are NOT written as broken edges.
 *   5. MIGRATION DECLS only where a block's schema_version was bumped by the
 *      backfill (the live schemas already declare identity fields as optional, so
 *      in practice NO bump → NO decl).
 *   6. DRIFT CHECK that the active config's substrate_id resolves (via the
 *      registry, against cwd) to the active contextDir.
 *
 * Discipline mirrors rename-canonical-id.ts: deep-clone accumulators, a `dryRun`
 * gate that performs ZERO writes (no config write, no block write, no putObject,
 * no relations write, no registry write, no migration decl), and a returned
 * report.
 *
 * Dry-run determinism caveat (documented, load-bearing): `mintOid` salts a
 * `randomUUID()` nonce by default, so the EXACT oid a real run would mint cannot
 * be predicted under dryRun. The dry run therefore reports COUNTS a real run
 * would produce (items_oid_minted, edges_rewritten, cross_substrate_edges,
 * lens_bin_edges_preserved, unresolved) accurately — by determining
 * RESOLVABILITY (would the refname resolve in the target substrate?) rather than
 * asserting the exact future oid value. Cross-substrate endpoints that WOULD
 * resolve are counted as cross_substrate_edges; those that would not land in
 * `report.unresolved`. The orchestrator's real dry-run report is thus trustworthy
 * for the go/no-go decision even though it does not show the post-mint oid bytes.
 */

import fs from "node:fs";
import path from "node:path";
import { contentProjection, readBlockForDir, writeBlockForDir } from "./block-api.js";
import { computeContentHash } from "./content-hash.js";
import {
	type BlockKindDecl,
	type ConfigBlock,
	type Edge,
	type EdgeEndpoint,
	loadRelationsForDir,
	type RawEndpoint,
	writeRelationsForDir,
} from "./context.js";
import { mintSubstrateId, SUBSTRATE_ID_PATTERN } from "./context-dir.js";
import { loadRegistry, registerSubstrate, resolveAlias, resolveSubstrateDir } from "./context-registry.js";
import { type DispatchContext, writerToString } from "./dispatch-context.js";
import { appendMigrationDeclForDir } from "./migrations-store.js";
import { hasObject } from "./object-store.js";

export interface MigrationReport {
	substrates: {
		dir: string;
		substrate_id: string;
		items_oid_minted: number;
		items_hashed: number;
		objects_stored: number;
	}[];
	edges_rewritten: number;
	cross_substrate_edges: number;
	lens_bin_edges_preserved: number;
	dry_run: boolean;
	unresolved: { substrate: string; ref: string }[];
	/** SoT-drift outcome for the ACTIVE substrate (report-only; non-fatal). */
	drift?: { substrate_id: string; expected_dir: string; resolved_dir: string | null };
}

interface DiscoveredSubstrate {
	/** Directory basename (e.g. ".project") — the registry stores this string. */
	dirName: string;
	/** Absolute substrate directory. */
	abs: string;
	config: ConfigBlock;
}

/** Read + parse a substrate's config.json. Throws on absent / unreadable / bad JSON. */
function readConfig(abs: string): ConfigBlock {
	const p = path.join(abs, "config.json");
	const raw = fs.readFileSync(p, "utf-8");
	return JSON.parse(raw) as ConfigBlock;
}

/** Atomic (tmp + rename) write of a substrate's config.json. */
function writeConfigFile(abs: string, config: ConfigBlock): void {
	const p = path.join(abs, "config.json");
	const tmp = `${p}.migrate-ca-${process.pid}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(config, null, 2), "utf-8");
	fs.renameSync(tmp, p);
}

/**
 * Does the schema at `schemaPath` declare all three identity fields on the
 * item subschema reached by `arrayKey`? Reads the schema file directly (the
 * fail-fast gate runs before any write so it does not depend on the block-api
 * schema cache). Resolves the item subschema as
 * `properties.<arrayKey>.items.properties`. Returns false on any structural
 * surprise so the caller throws a clear, located error.
 */
function schemaDeclaresIdentityFields(schemaPath: string, arrayKey: string): boolean {
	let schema: Record<string, unknown>;
	try {
		schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8")) as Record<string, unknown>;
	} catch {
		return false;
	}
	const props = schema.properties as Record<string, unknown> | undefined;
	const arrayNode = props?.[arrayKey] as Record<string, unknown> | undefined;
	const items = arrayNode?.items as Record<string, unknown> | undefined;
	const itemProps = items?.properties as Record<string, unknown> | undefined;
	if (!itemProps) return false;
	return (
		Object.hasOwn(itemProps, "oid") &&
		Object.hasOwn(itemProps, "content_hash") &&
		Object.hasOwn(itemProps, "content_parent")
	);
}

/** Resolve a block-kind's schema file relative to its substrate dir. */
function blockSchemaAbs(abs: string, bk: BlockKindDecl): string {
	return path.isAbsolute(bk.schema_path) ? bk.schema_path : path.join(abs, bk.schema_path);
}

/** Resolve a block-kind's data file relative to its substrate dir. */
function blockDataAbs(abs: string, bk: BlockKindDecl): string {
	return path.isAbsolute(bk.data_path) ? bk.data_path : path.join(abs, bk.data_path);
}

/** Build a refname → oid map for an already-backfilled (or to-be-backfilled) substrate. */
function buildRefnameOidMap(s: DiscoveredSubstrate): Map<string, string> {
	const out = new Map<string, string>();
	for (const bk of s.config.block_kinds ?? []) {
		const dataAbs = blockDataAbs(s.abs, bk);
		if (!fs.existsSync(dataAbs)) continue;
		let block: Record<string, unknown>;
		try {
			block = readBlockForDir(s.abs, bk.canonical_id) as Record<string, unknown>;
		} catch {
			continue;
		}
		const arr = block[bk.array_key];
		if (!Array.isArray(arr)) continue;
		for (const raw of arr) {
			if (!raw || typeof raw !== "object") continue;
			const item = raw as Record<string, unknown>;
			const id = item.id;
			const oid = item.oid;
			if (typeof id === "string" && id.length > 0 && typeof oid === "string" && oid.length > 0 && !out.has(id)) {
				out.set(id, oid);
			}
		}
	}
	return out;
}

/** Load a foreign (non-discovered) substrate dir into the shape buildRefnameOidMap expects. Read-only; returns null on failure. */
function loadForeignSubstrate(abs: string): DiscoveredSubstrate | null {
	try {
		return { dirName: path.basename(abs), abs, config: readConfig(abs) };
	} catch {
		return null;
	}
}

/** True when `refname` names a real item id in `s` (an item, not a lens bin). */
function substrateHasItem(s: DiscoveredSubstrate, refname: string): boolean {
	for (const bk of s.config.block_kinds ?? []) {
		const dataAbs = blockDataAbs(s.abs, bk);
		if (!fs.existsSync(dataAbs)) continue;
		let block: Record<string, unknown>;
		try {
			block = readBlockForDir(s.abs, bk.canonical_id) as Record<string, unknown>;
		} catch {
			continue;
		}
		const arr = block[bk.array_key];
		if (!Array.isArray(arr)) continue;
		for (const raw of arr) {
			if (raw && typeof raw === "object" && (raw as Record<string, unknown>).id === refname) return true;
		}
	}
	return false;
}

/**
 * Run the §H content-addressing migration against `cwd`. See the module header
 * for the ordered steps and the dry-run determinism caveat. Never throws on an
 * unresolvable endpoint (those accumulate into `report.unresolved` and the edge
 * is left unwritten); throws on the fail-fast schema gate and on any I/O failure.
 */
export function migrateToContentAddressed(
	cwd: string,
	opts?: { dryRun?: boolean; legacyAliases?: Record<string, string>; onlySubstrates?: string[]; ctx?: DispatchContext },
): MigrationReport {
	const dryRun = opts?.dryRun ?? false;
	const ctx = opts?.ctx;
	const report: MigrationReport = {
		substrates: [],
		edges_rewritten: 0,
		cross_substrate_edges: 0,
		lens_bin_edges_preserved: 0,
		dry_run: dryRun,
		unresolved: [],
	};

	// ── Step 1: discover substrates (config.json-bearing dirs) ────────────────
	const substrates: DiscoveredSubstrate[] = [];
	for (const entry of fs.readdirSync(cwd, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const abs = path.join(cwd, entry.name);
		if (!fs.existsSync(path.join(abs, "config.json"))) continue;
		if (opts?.onlySubstrates && !opts.onlySubstrates.includes(entry.name)) continue;
		substrates.push({ dirName: entry.name, abs, config: readConfig(abs) });
	}

	// ── Step 0: fail-fast — every block schema must declare the identity fields ─
	for (const s of substrates) {
		for (const bk of s.config.block_kinds ?? []) {
			const schemaAbs = blockSchemaAbs(s.abs, bk);
			if (!fs.existsSync(schemaAbs)) continue; // no schema → block-api skips stamping; not a gate target
			if (!schemaDeclaresIdentityFields(schemaAbs, bk.array_key)) {
				throw new Error(
					`migrateToContentAddressed: schema ${schemaAbs} (block_kind '${bk.canonical_id}', array '${bk.array_key}') ` +
						`does not declare the identity fields (oid/content_hash/content_parent) on its items — backfill would silently ` +
						`no-op the stamping gate. Add the identity fields to this schema before migrating.`,
				);
			}
		}
	}

	// ── Step 2: substrate_id mint + register (idempotent) ─────────────────────
	// Resolve the active contextDir name (the `.pi-context.json` pointer) so the
	// active substrate registers with a dir that matches the SoT-drift invariant.
	const activeDirName = resolveActiveDirName(cwd);

	// Default legacy alias: `project` → the substrate whose dir basename is
	// ".project", merged with caller-supplied aliases (caller wins).
	const projectSub = substrates.find((s) => s.dirName === ".project");
	const aliasMap: Record<string, string> = {};
	if (projectSub) aliasMap.project = projectSub.dirName;
	for (const [alias, dirName] of Object.entries(opts?.legacyAliases ?? {})) aliasMap[alias] = dirName;

	// Mint/keep a substrate_id per substrate. The id is recorded back onto the
	// in-memory config so backfill (which reads substrate_id via substrateIdForDir
	// off disk) sees a valid id. Under dryRun the on-disk config is NOT written,
	// but stamping needs substrateIdForDir to succeed — so dryRun resolves oids by
	// resolvability only (it never calls substrateIdForDir / mintOid for real).
	const idByDirName = new Map<string, string>();
	for (const s of substrates) {
		const existing = s.config.substrate_id;
		let id: string;
		if (typeof existing === "string" && SUBSTRATE_ID_PATTERN.test(existing)) {
			id = existing;
		} else {
			id = mintSubstrateId();
			s.config.substrate_id = id;
			if (!dryRun) writeConfigFile(s.abs, s.config);
		}
		idByDirName.set(s.dirName, id);
	}

	// Register each substrate, folding any alias targeting it into its entry.
	// registerSubstrate CLOBBERS the entry, so pass the UNION of pre-existing
	// aliases (from the on-disk registry) + the aliases the map assigns to this
	// substrate's dirName.
	const existingRegistry = loadRegistry(cwd);
	for (const s of substrates) {
		const id = idByDirName.get(s.dirName) as string;
		const prior = existingRegistry?.substrates?.[id]?.aliases ?? [];
		const assigned = Object.entries(aliasMap)
			.filter(([, dirName]) => dirName === s.dirName)
			.map(([alias]) => alias);
		const aliases = Array.from(new Set([...prior, ...assigned]));
		if (!dryRun) registerSubstrate(cwd, id, s.dirName, aliases, ctx);
	}

	// ── Step 3: backfill oid / content_hash / objects (ALL substrates first) ──
	for (const s of substrates) {
		const id = idByDirName.get(s.dirName) as string;
		let itemsOidMinted = 0;
		let itemsHashed = 0;
		let objectsStored = 0;
		for (const bk of s.config.block_kinds ?? []) {
			const dataAbs = blockDataAbs(s.abs, bk);
			if (!fs.existsSync(dataAbs)) continue;
			let block: Record<string, unknown>;
			try {
				block = readBlockForDir(s.abs, bk.canonical_id) as Record<string, unknown>;
			} catch {
				continue;
			}
			const arr = block[bk.array_key];
			if (!Array.isArray(arr)) continue;
			const schemaAbs = blockSchemaAbs(s.abs, bk);
			const schema = fs.existsSync(schemaAbs)
				? (JSON.parse(fs.readFileSync(schemaAbs, "utf-8")) as Record<string, unknown>)
				: null;
			for (const raw of arr) {
				if (!raw || typeof raw !== "object") continue;
				const item = raw as Record<string, unknown>;
				const hadOid = typeof item.oid === "string" && (item.oid as string).length > 0;
				if (!hadOid) itemsOidMinted++;
				itemsHashed++;
				// Object-store accounting: compute the projection's content hash and
				// count a store only when the object is not already present. Under a
				// real run this matches writeBlockForDir's post-validation putObject;
				// the count is computed here (not from the write) so dryRun reports the
				// same number without touching disk.
				if (schema) {
					const projection = contentProjection(schema, bk.array_key, item);
					const hash = computeContentHash(projection);
					if (!hasObject(s.abs, hash)) objectsStored++;
				}
			}
			// Real run: read full object + write back. writeBlockForDir's whole-block
			// identity stamp mints missing oids, recomputes content_hash, and the
			// post-validation walk persists objects. Idempotent — a re-run mints zero
			// new oids and stores zero new objects.
			if (!dryRun) writeBlockForDir(s.abs, bk.canonical_id, block, ctx);
		}
		report.substrates.push({
			dir: s.dirName,
			substrate_id: id,
			items_oid_minted: itemsOidMinted,
			items_hashed: itemsHashed,
			objects_stored: objectsStored,
		});
	}

	// Build per-substrate refname→oid maps AFTER backfill so cross-substrate
	// foreign endpoints can resolve to the freshly-minted oid (real run). Under
	// dryRun the on-disk items carry no new oid, so the map only holds
	// pre-existing oids — endpoint conversion under dryRun therefore resolves by
	// RESOLVABILITY (does the refname exist in the target?) rather than by exact
	// oid bytes (see the module header's dry-run caveat).
	const refnameOidByDir = new Map<string, Map<string, string>>();
	for (const s of substrates) refnameOidByDir.set(s.dirName, buildRefnameOidMap(s));
	const subByDirName = new Map(substrates.map((s) => [s.dirName, s] as const));

	// ── Step 4: endpoint conversion (per substrate, AFTER all backfill) ───────
	// Cache of refname→oid maps for FOREIGN (registry-resolved, non-discovered)
	// substrates, keyed by substrate_id. Persists across all substrates + edges so
	// a foreign dir's map is built at most once. Read-only (buildRefnameOidMap).
	const foreignMapCache = new Map<string, Map<string, string>>();
	for (const s of substrates) {
		const edges = loadRelationsForDir(s.abs);
		if (edges.length === 0) continue;
		const ownMap = refnameOidByDir.get(s.dirName) as Map<string, string>;
		let rewritten = 0;

		const convert = (ep: RawEndpoint): RawEndpoint | null => {
			// Already structured → leave as-is.
			if (typeof ep !== "string") return ep;

			const colon = ep.indexOf(":");
			if (colon > 0) {
				// `<alias>:<refname>` → foreign structured item.
				const alias = ep.slice(0, colon);
				const refname = ep.slice(colon + 1);
				const targetDirName = aliasMap[alias];
				const target = targetDirName ? subByDirName.get(targetDirName) : undefined;
				if (target) {
					// Discovered-substrate path (existing behavior, unchanged).
					if (!substrateHasItem(target, refname)) {
						report.unresolved.push({ substrate: s.dirName, ref: ep });
						return null;
					}
					const targetId = idByDirName.get(targetDirName) as string;
					const targetMap = refnameOidByDir.get(targetDirName) as Map<string, string>;
					// Real run: the target oid was backfilled and is in the map. Dry run:
					// the map may lack the oid (item was pre-identity), so fall back to the
					// refname as a placeholder oid — the COUNT (cross_substrate_edges) is
					// what matters under dryRun; the exact oid is not asserted.
					const oid = targetMap.get(refname) ?? refname;
					const out: EdgeEndpoint = { kind: "item", substrate_id: targetId, oid, refname };
					report.cross_substrate_edges++;
					return out;
				}

				// Registry fallback: the alias does not map to a discovered substrate.
				// Resolve it through the project-root registry and read the foreign
				// substrate READ-ONLY (no mint/backfill/own-edge processing; never
				// enqueued onto `substrates`). buildRefnameOidMap only reads blocks.
				const sid = resolveAlias(cwd, alias);
				if (sid === null) {
					report.unresolved.push({ substrate: s.dirName, ref: ep });
					return null;
				}
				const dir = resolveSubstrateDir(cwd, sid);
				if (dir === null) {
					report.unresolved.push({ substrate: s.dirName, ref: ep });
					return null;
				}
				const fabs = path.resolve(cwd, dir);
				let fmap = foreignMapCache.get(sid);
				if (!fmap) {
					const fsub = loadForeignSubstrate(fabs);
					fmap = fsub ? buildRefnameOidMap(fsub) : new Map();
					foreignMapCache.set(sid, fmap);
				}
				const oid = fmap.get(refname);
				if (oid === undefined) {
					// The refname genuinely is not an addressed item in the foreign substrate.
					report.unresolved.push({ substrate: s.dirName, ref: ep });
					return null;
				}
				report.cross_substrate_edges++;
				return { kind: "item", substrate_id: sid, oid, refname };
			}

			// Bare string. Same-substrate item refname → structured item (no
			// substrate_id). Otherwise a lens-bin label → lens_bin endpoint.
			const own = subByDirName.get(s.dirName) as DiscoveredSubstrate;
			if (substrateHasItem(own, ep)) {
				const oid = ownMap.get(ep) ?? ep;
				return { kind: "item", oid, refname: ep };
			}
			// Not an item in this substrate → treat as a lens-bin label.
			report.lens_bin_edges_preserved++;
			return { kind: "lens_bin", bin: ep };
		};

		const next: Edge[] = [];
		for (const e of edges) {
			const parent = convert(e.parent);
			const child = convert(e.child);
			// An endpoint that resolved to null (unresolvable foreign alias/refname)
			// drops the whole edge — a broken edge is never written.
			if (parent === null || child === null) continue;
			const changed = parent !== e.parent || child !== e.child;
			if (changed) rewritten++;
			next.push({
				...e,
				parent,
				child,
			});
		}
		if (rewritten > 0 && !dryRun) writeRelationsForDir(s.abs, next, ctx);
		report.edges_rewritten += rewritten;
	}

	// ── Step 5: migration decls (only on a schema_version bump) ───────────────
	// The live schemas declare identity fields as OPTIONAL, so backfill bumps no
	// block's schema_version and no decl is filed. Where a future schema bump
	// occurs, file an identity decl per affected block (try/skip on collision).
	// Detection: compare each block's on-disk envelope schema_version against the
	// schema file's `version`. Under the current schema set this loop files
	// nothing; it is wired so a later schema bump is handled without re-touching
	// this engine.
	if (!dryRun) {
		for (const s of substrates) {
			for (const bk of s.config.block_kinds ?? []) {
				const dataAbs = blockDataAbs(s.abs, bk);
				const schemaAbs = blockSchemaAbs(s.abs, bk);
				if (!fs.existsSync(dataAbs) || !fs.existsSync(schemaAbs)) continue;
				let blockVersion: string | undefined;
				let schemaVersion: string | undefined;
				try {
					const block = JSON.parse(fs.readFileSync(dataAbs, "utf-8")) as Record<string, unknown>;
					const schema = JSON.parse(fs.readFileSync(schemaAbs, "utf-8")) as Record<string, unknown>;
					blockVersion = typeof block.schema_version === "string" ? block.schema_version : undefined;
					schemaVersion = typeof schema.version === "string" ? schema.version : undefined;
				} catch {
					continue;
				}
				if (blockVersion && schemaVersion && blockVersion !== schemaVersion) {
					try {
						appendMigrationDeclForDir(s.abs, {
							schemaName: bk.canonical_id,
							fromVersion: blockVersion,
							toVersion: schemaVersion,
							kind: "identity",
							created_by: ctx?.writer ? writerToString(ctx.writer) : "migrate-content-addressed",
							created_at: new Date().toISOString(),
						});
					} catch {
						// (schemaName, fromVersion) already declared — skip.
					}
				}
			}
		}
	}

	// ── Step 6: drift check (active substrate) ────────────────────────────────
	if (activeDirName !== null) {
		const activeSub = substrates.find((s) => s.dirName === activeDirName);
		if (activeSub) {
			const id = idByDirName.get(activeDirName) as string;
			const resolved = dryRun ? activeSub.dirName : resolveSubstrateDir(cwd, id);
			if (resolved !== activeSub.dirName) {
				report.drift = { substrate_id: id, expected_dir: activeSub.dirName, resolved_dir: resolved };
			}
		}
	}

	return report;
}

/**
 * The active substrate's directory NAME (the `.pi-context.json` `contextDir`
 * field), or null when no bootstrap pointer exists. Read directly here rather
 * than via resolveContextDir (which returns a path-joined absolute-ish form) so
 * the comparison against the discovered `dirName` (a basename) is apples-to-apples.
 */
function resolveActiveDirName(cwd: string): string | null {
	const p = path.join(cwd, ".pi-context.json");
	if (!fs.existsSync(p)) return null;
	try {
		const data = JSON.parse(fs.readFileSync(p, "utf-8")) as Record<string, unknown>;
		const dir = data.contextDir;
		return typeof dir === "string" ? dir : null;
	} catch {
		return null;
	}
}
