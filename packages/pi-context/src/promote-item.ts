/**
 * Cycle 9 / G2 — `promoteItem`: copy an item from one substrate into another as
 * a NEW content-addressed item and record the lineage edge.
 *
 * "Promotion" is the cross-substrate analogue of supersession: the source item's
 * content projection (its fields minus identity + attestation metadata) is
 * re-filed into the DESTINATION substrate, where the canonical write-path mints a
 * fresh destination `oid` + recomputes `content_hash` + persists the content
 * object. A lineage edge `item_derived_from_item` is then filed into the
 * destination relations.json with the new derived item as parent and the source
 * as child (carrying the source's pinned `content_hash` for drift detection).
 * When the source block's status enum supports it, the source is marked
 * `superseded` (or `superseded_by`); otherwise the lineage edge is the sole
 * authoritative supersession record.
 *
 * Layering: this module sits ABOVE context-sdk / context / block-api /
 * context-registry / context-dir and is imported by NONE of them (one-way). It
 * composes their primitives; it adds no new lower-layer surface.
 */
import fs from "node:fs";
import path from "node:path";
import {
	appendToBlockForDir,
	DEFAULT_METADATA_FIELDS,
	nextIdForDir,
	readBlockForDir,
	resolveBlockItemSchema,
	updateItemInBlockForDir,
} from "./block-api.js";
import type { Edge } from "./context.js";
import { appendRelationForDir } from "./context.js";
import { resolveContextDir, schemaPathForDir, substrateIdForDir } from "./context-dir.js";
import { resolveAlias, resolveSubstrateDir } from "./context-registry.js";
import { type ResolvedRef, resolveRef } from "./context-sdk.js";
import type { DispatchContext } from "./dispatch-context.js";

/** Input to {@link promoteItem}. `source` is any selector `resolveRef` accepts
 * (bare refname / `<alias>:<refname>` / structured locator string is not
 * supported here — pass the selector form `resolveRef` resolves). */
export interface PromoteItemInput {
	source: string;
	destinationSubstrate: string;
	newRefname?: string;
	dryRun?: boolean;
}

/** Result of {@link promoteItem}. `destination` is the {@link ResolvedRef} for
 * the written (or, on dry-run, the WOULD-be-written) item. */
export interface PromotionResult {
	source: ResolvedRef;
	destination: ResolvedRef;
	lineageEdgeAppended: boolean;
	dryRun: boolean;
}

/**
 * Strip the identity + attestation metadata from a source item, leaving the
 * content projection that will be re-filed into the destination. Uses the
 * canonical `DEFAULT_METADATA_FIELDS` (floor ∪ discretionary) so the projection
 * carries no `id`/`oid`/`content_hash`/`content_parent` nor author/closure
 * fields — the destination write-path mints its own.
 */
function contentOnlyProjection(item: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(item)) {
		if (DEFAULT_METADATA_FIELDS.has(k)) continue;
		out[k] = v;
	}
	return out;
}

/**
 * Resolve the chosen supersession status value for a block from its item
 * schema's `status` enum: prefer `"superseded"`, then `"superseded_by"`,
 * otherwise null (the block has no compatible status value — leave unchanged).
 * A block with no status field / no enum returns null.
 */
function supersessionStatusFor(srcDir: string, block: string): string | null {
	const schemaFile = schemaPathForDir(srcDir, block);
	if (!fs.existsSync(schemaFile)) return null;
	let schema: Record<string, unknown>;
	try {
		schema = JSON.parse(fs.readFileSync(schemaFile, "utf-8")) as Record<string, unknown>;
	} catch {
		return null;
	}
	let itemSchema: Record<string, unknown>;
	try {
		itemSchema = resolveBlockItemSchema(schema).itemSchema;
	} catch {
		return null;
	}
	const props = (itemSchema.properties ?? {}) as Record<string, Record<string, unknown>>;
	const statusProp = props.status;
	const enumVals = statusProp && Array.isArray(statusProp.enum) ? (statusProp.enum as unknown[]) : undefined;
	if (!enumVals) return null;
	if (enumVals.includes("superseded")) return "superseded";
	if (enumVals.includes("superseded_by")) return "superseded_by";
	return null;
}

/** Read the `config.relation_types[].canonical_id` set of a substrate dir. */
function relationTypeIds(substrateDir: string): Set<string> {
	const configPath = path.join(substrateDir, "config.json");
	const ids = new Set<string>();
	if (!fs.existsSync(configPath)) return ids;
	let cfg: Record<string, unknown>;
	try {
		cfg = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<string, unknown>;
	} catch {
		return ids;
	}
	const rts = Array.isArray(cfg.relation_types) ? (cfg.relation_types as unknown[]) : [];
	for (const rt of rts) {
		if (rt && typeof rt === "object" && typeof (rt as Record<string, unknown>).canonical_id === "string") {
			ids.add((rt as Record<string, unknown>).canonical_id as string);
		}
	}
	return ids;
}

/**
 * Promote a substrate item into another substrate as a NEW content-addressed
 * item, recording the `item_derived_from_item` lineage edge. See the module
 * header for the full semantics. Throws (plain `Error`) on every precondition
 * failure — unresolvable / non-item source, unregistered destination alias,
 * unregistered destination relation_type, destination refname collision.
 */
export function promoteItem(cwd: string, input: PromoteItemInput, ctx?: DispatchContext): PromotionResult {
	// (1) Resolve + validate the source.
	const src = resolveRef(cwd, input.source);
	if (src.endpointKind !== "item") {
		throw new Error(`promoteItem: source '${input.source}' is not an item endpoint (got ${src.endpointKind})`);
	}
	if (src.status !== "active" && src.status !== "foreign") {
		throw new Error(
			`promoteItem: source '${input.source}' is ${src.status} — only active or foreign items can be promoted`,
		);
	}
	if (!src.loc) {
		throw new Error(`promoteItem: source '${input.source}' resolved without an item location`);
	}
	const srcBlock = src.loc.block;
	const srcArrayKey = src.loc.arrayKey;
	const srcRefname = src.refname ?? src.loc.id;
	const srcOid = src.oid ?? (typeof src.loc.item.oid === "string" ? (src.loc.item.oid as string) : undefined);

	// Determine the SOURCE substrate dir + substrate_id (a lineage-edge child
	// needs a substrate_id locator).
	const srcDir = src.status === "active" ? resolveContextDir(cwd) : resolveForeignDir(cwd, src.substrate_id);
	const srcId = src.substrate_id ?? substrateIdForDir(srcDir);
	const srcContentHash =
		typeof src.loc.item.content_hash === "string" ? (src.loc.item.content_hash as string) : undefined;

	// (2) Resolve the destination substrate.
	const destId = resolveAlias(cwd, input.destinationSubstrate);
	if (destId === null) {
		throw new Error(
			`promoteItem: destination substrate '${input.destinationSubstrate}' is not registered (register it in .pi-context-registry.json before promoting)`,
		);
	}
	const destDirRel = resolveSubstrateDir(cwd, destId);
	if (destDirRel === null) {
		throw new Error(`promoteItem: destination substrate_id '${destId}' has no registered dir`);
	}
	const destDir = path.isAbsolute(destDirRel) ? destDirRel : path.resolve(cwd, destDirRel);

	// (3) Precondition: the lineage relation_type must be registered in the
	// destination config, else the edge would write but validateContext would
	// later error — fail loud at the boundary.
	if (!relationTypeIds(destDir).has("item_derived_from_item")) {
		throw new Error(
			`promoteItem: relation_type 'item_derived_from_item' is not registered in ${destDir} config.relation_types — register it before promoting`,
		);
	}

	// (4) Build the content projection from the source item (fields minus
	// identity/attestation metadata). Pin the source content_hash for the edge.
	const projection = contentOnlyProjection(src.loc.item);

	// (5) Allocate the destination refname; reject a supplied newRefname that
	// already exists in the destination block.
	const destRefname = input.newRefname ?? nextIdForDir(destDir, srcBlock);
	if (input.newRefname !== undefined && destItemExists(destDir, srcBlock, srcArrayKey, destRefname)) {
		throw new Error(
			`promoteItem: newRefname '${destRefname}' already exists in destination block '${srcBlock}.${srcArrayKey}'`,
		);
	}

	// (6) Dry-run: synthesize the WOULD-be-written destination ResolvedRef and
	// write NOTHING on any channel.
	if (input.dryRun) {
		return {
			source: src,
			destination: {
				status: "active",
				endpointKind: "item",
				substrate_id: destId,
				refname: destRefname,
			},
			lineageEdgeAppended: false,
			dryRun: true,
		};
	}

	// (7) Write the promoted item — the write-path mints the destination oid +
	// content_hash + persists the content object.
	appendToBlockForDir(destDir, srcBlock, srcArrayKey, { id: destRefname, ...projection }, ctx);

	// (8) Read back the minted identity fields.
	const written = readDestItem(destDir, srcBlock, srcArrayKey, destRefname);
	if (!written) {
		throw new Error(`promoteItem: wrote item '${destRefname}' to ${destDir} but could not read it back`);
	}
	const newOid = typeof written.oid === "string" ? (written.oid as string) : undefined;
	if (!newOid) {
		throw new Error(`promoteItem: destination item '${destRefname}' has no minted oid — invariant breach`);
	}
	if (srcOid !== undefined && newOid === srcOid) {
		throw new Error(
			`promoteItem: destination oid equals source oid '${srcOid}' — a promotion must mint a distinct identity`,
		);
	}

	// (9) File the lineage edge into the DESTINATION (parent = the new derived
	// item; child = the source).
	const edge: Edge = {
		parent: { kind: "item", substrate_id: destId, oid: newOid, refname: destRefname },
		child: {
			kind: "item",
			substrate_id: srcId,
			...(srcOid !== undefined ? { oid: srcOid } : {}),
			refname: srcRefname,
			...(srcContentHash !== undefined ? { content_hash: srcContentHash } : {}),
		},
		relation_type: "item_derived_from_item",
	} as Edge;
	const { appended: lineageEdgeAppended } = appendRelationForDir(destDir, edge, ctx);

	// (10) Mark the source superseded when its status enum supports it; the
	// lineage edge is authoritative regardless.
	const supersedeValue = supersessionStatusFor(srcDir, srcBlock);
	if (supersedeValue !== null) {
		updateItemInBlockForDir(
			srcDir,
			srcBlock,
			srcArrayKey,
			(item) => item.id === srcRefname,
			{ status: supersedeValue },
			ctx,
		);
	}

	// (11) Return the written destination as a ResolvedRef.
	return {
		source: src,
		destination: {
			status: "active",
			endpointKind: "item",
			substrate_id: destId,
			oid: newOid,
			refname: destRefname,
			loc: { id: destRefname, block: srcBlock, arrayKey: srcArrayKey, item: written },
		},
		lineageEdgeAppended,
		dryRun: false,
	};
}

/** Absolutize a registered foreign substrate dir; throws when the substrate_id
 * is absent/unregistered (a foreign source must resolve to a dir to read its
 * item + supersede it). */
function resolveForeignDir(cwd: string, substrate_id: string | undefined): string {
	if (!substrate_id) {
		throw new Error("promoteItem: foreign source resolved without a substrate_id");
	}
	const rel = resolveSubstrateDir(cwd, substrate_id);
	if (rel === null) {
		throw new Error(`promoteItem: foreign source substrate_id '${substrate_id}' is not registered`);
	}
	return path.isAbsolute(rel) ? rel : path.resolve(cwd, rel);
}

/** True when an item with `id === refname` already exists in the destination
 * block array. */
function destItemExists(destDir: string, block: string, arrayKey: string, refname: string): boolean {
	return readDestItem(destDir, block, arrayKey, refname) !== null;
}

/** Read a single item by `id === refname` from a destination block array, or
 * null when the block is absent / the item is not present. */
function readDestItem(
	destDir: string,
	block: string,
	arrayKey: string,
	refname: string,
): Record<string, unknown> | null {
	let blockData: unknown;
	try {
		blockData = readBlockForDir(destDir, block);
	} catch {
		return null;
	}
	if (!blockData || typeof blockData !== "object") return null;
	const arr = (blockData as Record<string, unknown>)[arrayKey];
	if (!Array.isArray(arr)) return null;
	for (const it of arr) {
		if (it && typeof it === "object" && (it as Record<string, unknown>).id === refname) {
			return it as Record<string, unknown>;
		}
	}
	return null;
}
