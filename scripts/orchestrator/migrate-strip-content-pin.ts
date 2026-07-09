#!/usr/bin/env tsx
/**
 * migrate-strip-content-pin — one-time reshape retiring the whole-file
 * `content_pin` field from the active substrate and bringing that substrate's
 * schema model + migration registry into line with the already-edited packaged
 * sample catalog. In one idempotent pass over the ACTIVE substrate dir it:
 *
 *   STEP 1 — block data reshape: strips the `content_pin` key from every nested
 *     citation/evidence entry (framework-gaps.json gaps[].evidence[],
 *     research.json research[].citations[]) and advances each block file's
 *     top-level `schema_version` envelope to the new version (framework-gaps
 *     1.1.1 → 1.2.0, research 1.0.1 → 1.1.0). ONLY the `content_pin` key is
 *     removed; the retired typed `stale_conditions` baselines
 *     (file-changed / revision-moved / item-status) are NOT touched.
 *
 *   STEP 2 — schema sync: overwrites the substrate's installed
 *     schemas/framework-gaps.schema.json + schemas/research.schema.json with the
 *     exact bytes of the packaged sample schemas (which were already edited to
 *     the pin-less, version-bumped bodies), so the installed schema model
 *     matches what the data is now stamped against.
 *
 *   STEP 3 — migrations upsert: registers the two declarative-transform
 *     migration decls (framework-gaps 1.1.1 → 1.2.0 over $.gaps[].evidence[],
 *     research 1.0.1 → 1.1.0 over $.research[].citations[]) in the substrate's
 *     migrations.json — each op a map_each descent that deletes the retired
 *     content_pin field from every nested entry. Upserts by
 *     (schemaName, fromVersion, toVersion): a matching decl already present in a
 *     prior form (e.g. the earlier identity crutch) is REPLACED in place with
 *     the declarative-transform body; an absent one is appended; an
 *     already-current one is left untouched. This lets the read/write gates walk
 *     an unadvanced block forward AND actually strip the field, rather than
 *     no-op'ing the version delta.
 *
 * Mirrors the migrate-content-addressed precedent: a Claude-Code-side reshape
 * script the orchestrator runs out-of-band via tsx. The substrate copies cannot
 * be reached by the Edit/Write tool (a PreToolUse guard forbids those on
 * .context/*.json), so the block-data reshape + schema sync happen here out of
 * band. The schema advance itself is now carried by a real declarative-transform
 * migration (an extended map_each that descends one nested-array field via
 * `each` and deletes `delete_field` from each leaf), so the registered decl
 * replays the same content_pin strip through the ordinary migration gate.
 *
 * Scope: the ACTIVE substrate's top-level block files, its schemas/ dir, and its
 * migrations.json ONLY. It NEVER touches objects/*.json (immutable
 * content-addressed history). Idempotent: a re-run strips 0 entries, leaves
 * already-advanced envelopes and already-synced schemas unchanged, and rewrites
 * an already-current migration decl to identical bytes (converting a prior
 * identity decl in place on first run, then a genuine no-op thereafter).
 *
 * Usage:
 *   tsx scripts/orchestrator/migrate-strip-content-pin.ts [--dry-run] [--cwd <dir>]
 *
 * Prints one JSON report: per-file stripped counts + envelope advances, schemas
 * synced, and migration decls converted / appended / already-current.
 * `--dry-run` reports
 * what a live run would do and writes nothing. Exits non-zero if any required
 * target file (block data file, packaged sample schema source, or substrate
 * migrations.json) is missing.
 */
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

interface Args {
	dryRun: boolean;
	cwd: string;
}

/** One block file to reshape: its data file, the top-level item array, the
 *  nested entry array carrying `content_pin`, and the schema version to stamp. */
interface Target {
	dataFile: string;
	arrayKey: string;
	nestedKey: string;
	newSchemaVersion: string;
}

const TARGETS: Target[] = [
	{ dataFile: "framework-gaps.json", arrayKey: "gaps", nestedKey: "evidence", newSchemaVersion: "1.2.0" },
	{ dataFile: "research.json", arrayKey: "research", nestedKey: "citations", newSchemaVersion: "1.1.0" },
];

/** One installed schema file to resync from its packaged sample source. */
interface SchemaTarget {
	schemaFile: string;
}

const SCHEMA_TARGETS: SchemaTarget[] = [
	{ schemaFile: "framework-gaps.schema.json" },
	{ schemaFile: "research.schema.json" },
];

/** The declarative-transform migration decls this reshape registers. Match key
 *  is schemaName + fromVersion + toVersion; the rest is the payload to upsert.
 *  `transform` carries the map_each descent that strips content_pin from the
 *  block's nested entries when the gate replays the version advance. */
interface MigrationDecl {
	schemaName: string;
	fromVersion: string;
	toVersion: string;
	kind: string;
	transform?: { operations: Array<Record<string, unknown>> };
	created_by: string;
	created_at: string;
}

const MIGRATION_DECLS: MigrationDecl[] = [
	{
		schemaName: "framework-gaps",
		fromVersion: "1.1.1",
		toVersion: "1.2.0",
		kind: "declarative-transform",
		transform: {
			operations: [{ op: "map_each", path: "$.gaps", each: "evidence", delete_field: "content_pin" }],
		},
		created_by: "migrate-strip-content-pin",
		created_at: "2026-07-09T00:00:00.000Z",
	},
	{
		schemaName: "research",
		fromVersion: "1.0.1",
		toVersion: "1.1.0",
		kind: "declarative-transform",
		transform: {
			operations: [{ op: "map_each", path: "$.research", each: "citations", delete_field: "content_pin" }],
		},
		created_by: "migrate-strip-content-pin",
		created_at: "2026-07-09T00:00:00.000Z",
	},
];

/** Path of the packaged sample schema catalog, relative to the invocation cwd
 *  (the orchestrator runs this from the monorepo root). */
const SAMPLE_SCHEMA_DIR = path.join("packages", "pi-context", "samples", "schemas");

interface FileReport {
	dataFile: string;
	present: boolean;
	strippedEntries: number;
	schemaVersionFrom: string | null;
	schemaVersionTo: string;
	schemaVersionAdvanced: boolean;
}

interface SchemaReport {
	schemaFile: string;
	sourcePresent: boolean;
	destPresent: boolean;
	alreadyInSync: boolean;
	synced: boolean;
}

interface MigrationReport {
	migrationsFile: string;
	present: boolean;
	converted: string[];
	appended: string[];
	alreadyCurrent: string[];
}

function parseArgs(argv: string[]): Args {
	const out: Args = { dryRun: false, cwd: process.cwd() };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--dry-run") {
			out.dryRun = true;
		} else if (a === "--cwd" && argv[i + 1]) {
			out.cwd = argv[i + 1];
			i++;
		} else {
			console.error(`Unknown argument: ${a}`);
			process.exit(2);
		}
	}
	return out;
}

/** Resolve the active substrate dir from the bootstrap pointer, falling back
 *  to `.context` when the pointer is absent/unreadable. */
function resolveSubstrateDir(cwd: string): string {
	const pointer = path.join(cwd, ".pi-context.json");
	try {
		const parsed = JSON.parse(fs.readFileSync(pointer, "utf-8")) as { contextDir?: unknown };
		if (typeof parsed.contextDir === "string" && parsed.contextDir.length > 0) {
			return path.resolve(cwd, parsed.contextDir);
		}
	} catch {
		// fall through to the default
	}
	return path.resolve(cwd, ".context");
}

/** STEP 1 — strip `content_pin` from a block file's nested entries and advance
 *  its top-level `schema_version`. Writes only when something changed. */
function reshapeFile(substrateDir: string, target: Target, dryRun: boolean): FileReport {
	const abs = path.join(substrateDir, target.dataFile);
	const report: FileReport = {
		dataFile: target.dataFile,
		present: false,
		strippedEntries: 0,
		schemaVersionFrom: null,
		schemaVersionTo: target.newSchemaVersion,
		schemaVersionAdvanced: false,
	};
	if (!fs.existsSync(abs)) return report;
	report.present = true;

	const doc = JSON.parse(fs.readFileSync(abs, "utf-8")) as Record<string, unknown>;
	report.schemaVersionFrom = typeof doc.schema_version === "string" ? doc.schema_version : null;

	const items = doc[target.arrayKey];
	if (Array.isArray(items)) {
		for (const item of items) {
			if (!item || typeof item !== "object" || Array.isArray(item)) continue;
			const nested = (item as Record<string, unknown>)[target.nestedKey];
			if (!Array.isArray(nested)) continue;
			for (const entry of nested) {
				if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
				const rec = entry as Record<string, unknown>;
				if (Object.hasOwn(rec, "content_pin")) {
					delete rec.content_pin;
					report.strippedEntries += 1;
				}
			}
		}
	}

	if (doc.schema_version !== target.newSchemaVersion) {
		doc.schema_version = target.newSchemaVersion;
		report.schemaVersionAdvanced = true;
	}

	// Write only when something changed — a clean re-run is a genuine no-op.
	if (!dryRun && (report.strippedEntries > 0 || report.schemaVersionAdvanced)) {
		fs.writeFileSync(abs, `${JSON.stringify(doc, null, 2)}\n`, "utf-8");
	}
	return report;
}

/** STEP 2 — overwrite one installed substrate schema with the exact bytes of
 *  its packaged sample source. Byte-for-byte; writes only when they differ. */
function syncSchema(cwd: string, substrateDir: string, target: SchemaTarget, dryRun: boolean): SchemaReport {
	const source = path.resolve(cwd, SAMPLE_SCHEMA_DIR, target.schemaFile);
	const dest = path.join(substrateDir, "schemas", target.schemaFile);
	const report: SchemaReport = {
		schemaFile: target.schemaFile,
		sourcePresent: false,
		destPresent: false,
		alreadyInSync: false,
		synced: false,
	};
	if (!fs.existsSync(source)) return report;
	report.sourcePresent = true;

	const sourceBytes = fs.readFileSync(source);
	report.destPresent = fs.existsSync(dest);
	if (report.destPresent) {
		const destBytes = fs.readFileSync(dest);
		report.alreadyInSync = destBytes.equals(sourceBytes);
	}

	if (!report.alreadyInSync) {
		if (!dryRun) fs.writeFileSync(dest, sourceBytes);
		report.synced = true;
	}
	return report;
}

/** STEP 3 — upsert the declarative-transform migration decls into the
 *  substrate's migrations.json, keyed on (schemaName, fromVersion, toVersion):
 *  an absent decl is appended, a matching decl in a stale form (e.g. a prior
 *  identity crutch) is replaced in place with the declarative-transform body,
 *  and an already-current one is left untouched. Tolerates both the
 *  object-wrapped ({schema_version, migrations:[]}) and bare-array shapes;
 *  preserves 2-space indent + trailing newline. Idempotent: a re-run over
 *  already-current decls rewrites nothing. */
function appendMigrations(substrateDir: string, decls: MigrationDecl[], dryRun: boolean): MigrationReport {
	const abs = path.join(substrateDir, "migrations.json");
	const report: MigrationReport = {
		migrationsFile: "migrations.json",
		present: false,
		converted: [],
		appended: [],
		alreadyCurrent: [],
	};
	if (!fs.existsSync(abs)) return report;
	report.present = true;

	const doc = JSON.parse(fs.readFileSync(abs, "utf-8")) as unknown;
	// Locate the migrations array whether the file is object-wrapped or a bare array.
	const list: MigrationDecl[] = Array.isArray(doc)
		? (doc as MigrationDecl[])
		: ((doc as { migrations?: unknown }).migrations as MigrationDecl[]);
	if (!Array.isArray(list)) {
		throw new Error(`migrate-strip-content-pin: migrations.json has no migrations array at ${abs}`);
	}

	let mutated = false;
	for (const decl of decls) {
		const key = `${decl.schemaName} ${decl.fromVersion}->${decl.toVersion}`;
		const idx = list.findIndex(
			(m) =>
				m &&
				typeof m === "object" &&
				m.schemaName === decl.schemaName &&
				m.fromVersion === decl.fromVersion &&
				m.toVersion === decl.toVersion,
		);
		if (idx === -1) {
			// No decl for this version edge yet — append the declarative-transform form.
			list.push(decl);
			report.appended.push(key);
			mutated = true;
		} else if (isDeepStrictEqual(list[idx], decl)) {
			// Already the exact declarative-transform bytes — genuine no-op.
			report.alreadyCurrent.push(key);
		} else {
			// A decl exists in a stale form (e.g. the prior identity crutch) —
			// replace it in place with the declarative-transform body.
			list[idx] = decl;
			report.converted.push(key);
			mutated = true;
		}
	}

	if (!dryRun && mutated) {
		fs.writeFileSync(abs, `${JSON.stringify(doc, null, 2)}\n`, "utf-8");
	}
	return report;
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	const substrateDir = resolveSubstrateDir(args.cwd);

	// STEP 1 → STEP 2 → STEP 3, in order.
	const files = TARGETS.map((t) => reshapeFile(substrateDir, t, args.dryRun));
	const schemas = SCHEMA_TARGETS.map((s) => syncSchema(args.cwd, substrateDir, s, args.dryRun));
	const migrations = appendMigrations(substrateDir, MIGRATION_DECLS, args.dryRun);

	console.log(JSON.stringify({ dryRun: args.dryRun, substrateDir, files, schemas, migrations }, null, 2));

	// Any missing required file is fatal — a partial reshape leaves the substrate
	// inconsistent with the packaged catalog, so surface it loudly.
	const missing: string[] = [];
	for (const f of files) if (!f.present) missing.push(`data:${f.dataFile}`);
	for (const s of schemas) if (!s.sourcePresent) missing.push(`sample-schema:${s.schemaFile}`);
	if (!migrations.present) missing.push("migrations.json");
	if (missing.length > 0) {
		console.error(
			`migrate-strip-content-pin: required file(s) missing: ${missing.join(", ")} (substrate: ${substrateDir})`,
		);
		process.exit(1);
	}
}

main();
