#!/usr/bin/env -S npx tsx
/**
 * Commit-time + CI config-schema breaking-diff gate.
 *
 * Enforces the expand-contract discipline on the bundled
 * packages/pi-context/schemas/config.schema.json: a NON-ADDITIVE shape change
 * — a removed (or renamed) property key anywhere in the properties tree, or a
 * new `required` entry on a pre-existing object — fails the gate unless the
 * SAME change set both advances the schema `version` AND declares a packaged
 * `config` migration reaching that new version in
 * packages/pi-context/samples/migrations.json. Additive changes (new optional
 * properties, description/enum additions, the version string itself) pass.
 *
 * Baseline = the prior git revision (no recorded-baseline state to drift):
 *   - staged (default, no --base): git show HEAD:<schema> vs the working tree
 *   - range (--base <ref>): git show <ref>:<schema> vs git show HEAD:<schema>
 * mirroring scripts/check-changelog.ts's two modes. A schema absent at the
 * baseline (fresh file) passes.
 *
 * The pairing check is structural existence only — it cannot verify that a
 * declared transform is semantically adequate; it asserts the discipline that
 * a breaking shape change ships with a version advance plus a registered
 * migration for it.
 *
 * Pure helpers (diffSchemaShapes / migrationPaired) are exported for
 * scripts/check-config-schema.test.ts.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

export const SCHEMA_PATH = "packages/pi-context/schemas/config.schema.json";
export const MIGRATIONS_PATH = "packages/pi-context/samples/migrations.json";

type Json = Record<string, unknown>;

export interface Finding {
	kind: "removed-key" | "new-required";
	path: string;
}

function isObj(v: unknown): v is Json {
	return !!v && typeof v === "object" && !Array.isArray(v);
}

/**
 * Breaking-shape diff over two parsed draft-07 schemas. Walks the `properties`
 * trees (recursing through nested `properties` and `items`), reporting:
 *   - removed-key: a property key present in OLD, absent in NEW at the same
 *     path (a rename surfaces as a removal of the old key);
 *   - new-required: a `required` entry NEW declares that OLD did not, on a
 *     node that EXISTS in both (a newly-added optional object's initial
 *     requireds are additive by construction — the walk never visits nodes
 *     with no OLD counterpart).
 */
export function diffSchemaShapes(oldSchema: Json, newSchema: Json): Finding[] {
	const findings: Finding[] = [];
	walk(oldSchema, newSchema, "$", findings);
	return findings;
}

function walk(oldNode: unknown, newNode: unknown, path: string, findings: Finding[]): void {
	if (!isObj(oldNode) || !isObj(newNode)) return;

	const oldProps = isObj(oldNode.properties) ? oldNode.properties : undefined;
	const newProps = isObj(newNode.properties) ? newNode.properties : undefined;
	if (oldProps) {
		for (const key of Object.keys(oldProps)) {
			if (!newProps || !(key in newProps)) {
				findings.push({ kind: "removed-key", path: `${path}.properties.${key}` });
			} else {
				walk(oldProps[key], newProps[key], `${path}.properties.${key}`, findings);
			}
		}
	}

	const oldReq = Array.isArray(oldNode.required) ? (oldNode.required as string[]) : [];
	const newReq = Array.isArray(newNode.required) ? (newNode.required as string[]) : [];
	for (const r of newReq) {
		if (!oldReq.includes(r)) {
			findings.push({ kind: "new-required", path: `${path}.required[${r}]` });
		}
	}

	if (isObj(oldNode.items) && isObj(newNode.items)) {
		walk(oldNode.items, newNode.items, `${path}.items`, findings);
	}
}

/**
 * Structural pairing check for a breaking diff: the schema `version` must have
 * advanced, and the packaged migrations registry must declare a `config`
 * migration whose `toVersion` equals the new schema version.
 */
export function migrationPaired(
	oldVersion: string | undefined,
	newVersion: string | undefined,
	migrationsText: string | undefined,
): { paired: boolean; reason: string } {
	if (typeof newVersion !== "string" || typeof oldVersion !== "string") {
		return { paired: false, reason: "schema version missing on one side of the diff" };
	}
	if (newVersion === oldVersion) {
		return { paired: false, reason: `breaking shape change without a schema version advance (still '${oldVersion}')` };
	}
	if (migrationsText === undefined) {
		return { paired: false, reason: "packaged migrations registry not found" };
	}
	let decls: Json[];
	try {
		const parsed = JSON.parse(migrationsText) as Json;
		decls = Array.isArray(parsed.migrations) ? (parsed.migrations as Json[]) : [];
	} catch {
		return { paired: false, reason: "packaged migrations registry is not valid JSON" };
	}
	const hit = decls.some((d) => isObj(d) && d.schemaName === "config" && d.toVersion === newVersion);
	return hit
		? { paired: true, reason: "" }
		: { paired: false, reason: `no packaged config migration declaration reaches version '${newVersion}'` };
}

function git(cmd: string): string {
	return execSync(cmd, { encoding: "utf-8" });
}

/** `git show <rev>:<path>`, undefined when the path does not exist at <rev>. */
function gitShow(rev: string, path: string): string | undefined {
	try {
		return execSync(`git show ${rev}:${path}`, { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
	} catch {
		return undefined;
	}
}

function main(): number {
	const argv = process.argv.slice(2);
	const baseIdx = argv.indexOf("--base");
	const base = baseIdx !== -1 ? argv[baseIdx + 1] : undefined;

	let changedPaths: string[];
	let beforeText: string | undefined;
	let afterText: string | undefined;
	let migrationsAfter: string | undefined;

	if (base) {
		let diffOut: string;
		try {
			diffOut = git(`git diff ${base}...HEAD --name-only`);
		} catch {
			console.error(
				`check-config-schema: base ref '${base}' not resolvable — ensure the CI checkout fetches the base branch before running the gate.`,
			);
			return 1;
		}
		changedPaths = diffOut.split("\n").filter(Boolean);
		beforeText = gitShow(base, SCHEMA_PATH);
		afterText = gitShow("HEAD", SCHEMA_PATH);
		migrationsAfter = gitShow("HEAD", MIGRATIONS_PATH);
	} else {
		changedPaths = git("git diff --cached --name-only").split("\n").filter(Boolean);
		beforeText = gitShow("HEAD", SCHEMA_PATH);
		afterText = existsSync(SCHEMA_PATH) ? readFileSync(SCHEMA_PATH, "utf-8") : undefined;
		migrationsAfter = existsSync(MIGRATIONS_PATH) ? readFileSync(MIGRATIONS_PATH, "utf-8") : undefined;
	}

	if (!changedPaths.includes(SCHEMA_PATH)) return 0;
	if (beforeText === undefined) return 0; // fresh schema — nothing to be non-additive against
	if (afterText === undefined) {
		console.error(`check-config-schema: ${SCHEMA_PATH} was deleted — the bundled config schema must exist.`);
		return 1;
	}

	let oldSchema: Json;
	let newSchema: Json;
	try {
		oldSchema = JSON.parse(beforeText) as Json;
		newSchema = JSON.parse(afterText) as Json;
	} catch (err) {
		console.error(`check-config-schema: unparsable schema JSON: ${err instanceof Error ? err.message : String(err)}`);
		return 1;
	}

	const findings = diffSchemaShapes(oldSchema, newSchema);
	if (findings.length === 0) return 0;

	const pairing = migrationPaired(
		typeof oldSchema.version === "string" ? oldSchema.version : undefined,
		typeof newSchema.version === "string" ? newSchema.version : undefined,
		migrationsAfter,
	);
	if (pairing.paired) {
		console.log(
			`check-config-schema: ${findings.length} breaking shape change(s) paired with a version advance + packaged config migration — allowed.`,
		);
		return 0;
	}

	for (const f of findings) {
		console.error(`check-config-schema: NON-ADDITIVE config-schema change [${f.kind}] at ${f.path}`);
	}
	console.error(
		`check-config-schema: ${pairing.reason}. New fields land optional (expand-contract); a removal/rename or new required field needs a schema version advance plus a packaged config migration declaration reaching the new version (do not --no-verify).`,
	);
	return 1;
}

// Run only as a CLI, not when imported by the test.
if (import.meta.url === `file://${process.argv[1]}`) {
	process.exit(main());
}
