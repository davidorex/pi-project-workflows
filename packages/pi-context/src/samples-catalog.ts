/**
 * Samples-catalog discovery surface (FGAP-068 closure; DEC-0037 packaged view).
 *
 * DEC-0037 (enacted) requires the conception present each block kind PACKAGED
 * with its relation_types + invariants + lens. This module reads the
 * extension's OWN bundled `samples/conception.json` + `samples/schemas/` and
 * projects, per block kind: title, description, item shape, the relation_types
 * for which the kind may be a source / target endpoint, the invariants ranging
 * over it, and the lenses targeting it — plus the top-level relation_type /
 * lens / invariant / layer / status_bucket registries.
 *
 * PACKAGE-INTRINSIC: there is no `cwd` parameter. The catalog reads the bundled
 * samples directory resolved relative to this module (`../samples`), so it works
 * the same from `src/` (tsx --test) and from `dist/` (post-build) and is
 * independent of any installed project substrate.
 *
 * DEC-0019/0020 dual-surface: this library function backs both the Pi tool
 * `read-samples-catalog` (in-pi LLM discovery) and the CLI script
 * `scripts/orchestrator/read-samples-catalog.ts` (Claude-Code-side); all three
 * ship as one unit.
 *
 * Never throws for unknown-kind / missing-description: defects surface as
 * per-kind `warnings[]` and catalog-level `warnings[]` so a half-authored
 * conception is diagnosable rather than fatal.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { InvariantDecl, LensSpec, RelationTypeDecl } from "./context.js";
import { type SchemaProperty, schemaInfoFromPath } from "./context-sdk.js";

/** Bundled samples directory — resolved relative to this module so it works from
 * both `src/` (tsx) and `dist/` (built); `samples/` sits one level above either. */
const SAMPLES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "samples");

/** Item-shape projection for a sample block kind. */
export interface SampleKindShape {
	arrayKeys: string[];
	itemProperties: Record<string, SchemaProperty[]>;
}

/** The relation_types a kind participates in, split by endpoint role. */
export interface SampleKindRelations {
	as_source: RelationTypeDecl[];
	as_target: RelationTypeDecl[];
}

/** One packaged block kind, with its associated metadata. */
export interface SampleKind {
	canonical_id: string;
	display_name: string;
	prefix: string;
	array_key: string;
	data_path: string;
	schema_path: string;
	title: string | null;
	description: string | null;
	shape: SampleKindShape | null;
	relation_types: SampleKindRelations;
	invariants: InvariantDecl[];
	lenses: LensSpec[];
	warnings: string[];
}

/** The packaged samples catalog (DEC-0037 view). */
export interface SamplesCatalog {
	schema_version: string;
	kinds: SampleKind[];
	relationTypes: RelationTypeDecl[];
	lenses: LensSpec[];
	invariants: InvariantDecl[];
	layers: unknown[];
	status_buckets: Record<string, unknown>;
	warnings: string[];
}

/** Shape of a block_kind entry as authored in conception.json. */
interface ConceptionBlockKind {
	canonical_id: string;
	display_name: string;
	prefix: string;
	schema_path: string;
	array_key: string;
	data_path: string;
	layer?: string;
}

/** Parsed conception.json (only the fields this catalog consumes). */
interface Conception {
	schema_version?: string;
	block_kinds?: ConceptionBlockKind[];
	relation_types?: RelationTypeDecl[];
	lenses?: LensSpec[];
	invariants?: InvariantDecl[];
	layers?: unknown[];
	status_buckets?: Record<string, unknown>;
}

/**
 * Build the packaged samples catalog. With `opts.kind` set, the catalog's
 * `kinds[]` is filtered to the single matching block kind (empty + a warning
 * when no kind matches). The top-level registries are always returned in full.
 */
export function samplesCatalog(opts?: { kind?: string }): SamplesCatalog {
	const conception = JSON.parse(fs.readFileSync(path.join(SAMPLES_DIR, "conception.json"), "utf-8")) as Conception;
	const blockKinds = conception.block_kinds ?? [];
	const relationTypes = conception.relation_types ?? [];
	const lenses = conception.lenses ?? [];
	const invariants = conception.invariants ?? [];

	const warnings: string[] = [];
	const knownKindIds = new Set(blockKinds.map((bk) => bk.canonical_id));

	// Catalog-level: any source/target_kinds value that is neither "*" nor a
	// known block_kind canonical_id is a misauthored endpoint declaration.
	for (const rt of relationTypes) {
		for (const k of rt.source_kinds ?? []) {
			if (k !== "*" && !knownKindIds.has(k)) {
				warnings.push(`relation_type '${rt.canonical_id}' names unknown kind '${k}' in source_kinds`);
			}
		}
		for (const k of rt.target_kinds ?? []) {
			if (k !== "*" && !knownKindIds.has(k)) {
				warnings.push(`relation_type '${rt.canonical_id}' names unknown kind '${k}' in target_kinds`);
			}
		}
	}

	// Filter set: when opts.kind is given but unknown, emit a warning + empty kinds.
	let selected = blockKinds;
	if (opts?.kind !== undefined) {
		selected = blockKinds.filter((bk) => bk.canonical_id === opts.kind);
		if (selected.length === 0) {
			warnings.push(`unknown kind '${opts.kind}' — not in block_kinds`);
		}
	}

	const kinds: SampleKind[] = selected.map((bk) => buildSampleKind(bk, relationTypes, invariants, lenses));

	return {
		schema_version: String(conception.schema_version ?? ""),
		kinds,
		relationTypes,
		lenses,
		invariants,
		layers: conception.layers ?? [],
		status_buckets: conception.status_buckets ?? {},
		warnings,
	};
}

/** Project one block kind into a SampleKind, reading its bundled schema. */
function buildSampleKind(
	bk: ConceptionBlockKind,
	relationTypes: RelationTypeDecl[],
	invariants: InvariantDecl[],
	lenses: LensSpec[],
): SampleKind {
	const kindWarnings: string[] = [];

	// Read the schema once for the root description; schemaInfoFromPath handles
	// title + item shape (it does not capture the root `description` field).
	const schemaFile = path.join(SAMPLES_DIR, "schemas", `${bk.canonical_id}.schema.json`);
	let description: string | null = null;
	try {
		const rawSchema = JSON.parse(fs.readFileSync(schemaFile, "utf-8")) as { description?: unknown };
		description = typeof rawSchema.description === "string" ? rawSchema.description : null;
	} catch {
		description = null;
	}

	const info = schemaInfoFromPath(schemaFile, bk.canonical_id);
	const title = info?.title ?? null;
	const shape: SampleKindShape | null = info
		? { arrayKeys: info.arrayKeys, itemProperties: info.itemProperties ?? {} }
		: null;

	if (title === null) kindWarnings.push(`kind '${bk.canonical_id}': schema title missing or unreadable`);
	if (description === null) kindWarnings.push(`kind '${bk.canonical_id}': schema description missing or unreadable`);
	if (shape === null) kindWarnings.push(`kind '${bk.canonical_id}': schema shape missing or unreadable`);

	// Endpoint participation: R is as_source for K iff R.source_kinds includes
	// "*" or K.canonical_id; as_target analogously. A relation with no
	// source_kinds/target_kinds contributes to neither (metadata-less case).
	const as_source = relationTypes.filter(
		(r) => r.source_kinds !== undefined && (r.source_kinds.includes("*") || r.source_kinds.includes(bk.canonical_id)),
	);
	const as_target = relationTypes.filter(
		(r) => r.target_kinds !== undefined && (r.target_kinds.includes("*") || r.target_kinds.includes(bk.canonical_id)),
	);

	const kindInvariants = invariants.filter((inv) => inv.block === bk.canonical_id);

	const kindLenses = lenses.filter(
		(lens) =>
			lens.target === bk.canonical_id || (Array.isArray(lens.targets) && lens.targets.includes(bk.canonical_id)),
	);

	return {
		canonical_id: bk.canonical_id,
		display_name: bk.display_name,
		prefix: bk.prefix,
		array_key: bk.array_key,
		data_path: bk.data_path,
		schema_path: bk.schema_path,
		title,
		description,
		shape,
		relation_types: { as_source, as_target },
		invariants: kindInvariants,
		lenses: kindLenses,
		warnings: kindWarnings,
	};
}
