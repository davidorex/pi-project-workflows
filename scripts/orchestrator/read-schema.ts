#!/usr/bin/env tsx
/**
 * read-schema — terse projection of a substrate schema by name
 *
 * Per DEC-0015 (config drives substrate location): cwd resolved through
 * `schemaPath(cwd, name)` which cascades through `resolveContextDir`; the
 * `BootstrapNotFoundError` from the resolver surfaces as an actionable
 * error (substrate not initialized) rather than a stack trace. No
 * hardcoded `.project` literal lives in this script.
 *
 * Per DEC-0019 (scripts as dual surface): this script is the Claude
 * Code-side ergonomics wrapper over `readSchema` from
 * @davidorex/pi-context/schema-write; the in-pi-runtime equivalent is
 * the `read-schema` pi tool registered in packages/pi-context/src/index.ts
 * (landed in 1.3.B — commit bac1893). Both surfaces wrap the same shared
 * library; this script is intentionally thin. Sibling read-config.ts
 * (1.3.A — commit 4a24866) carries the same structural shape.
 *
 * Usage:
 *   tsx scripts/orchestrator/read-schema.ts --name tasks                                    # terse projection
 *   tsx scripts/orchestrator/read-schema.ts --name tasks --field properties.tasks.items     # walk dot-path
 *   tsx scripts/orchestrator/read-schema.ts --name tasks --raw                              # full JSON dump
 *   tsx scripts/orchestrator/read-schema.ts --name tasks --cwd <path>                       # alternate cwd
 *
 * Precedence: when both --field and --raw are passed, --field wins
 * (projection mode) and --raw is ignored. --name is REQUIRED; absence
 * exits 2.
 *
 * Runtime demonstration (DEC-0018) is performed by the orchestrator, not
 * inline — script invocation against the live `.pi-context.json` pointer
 * + substrate is the demo path.
 */
import { schemaPath } from "@davidorex/pi-context/context-dir";
import { readSchema } from "@davidorex/pi-context/schema-write";

interface Args {
	name: string | null;
	field: string | null;
	raw: boolean;
	cwd: string;
}

function parseArgs(argv: string[]): Args {
	const out: Args = { name: null, field: null, raw: false, cwd: process.cwd() };
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === "--name" && argv[i + 1]) {
			out.name = argv[i + 1];
			i++;
		} else if (argv[i] === "--field" && argv[i + 1]) {
			out.field = argv[i + 1];
			i++;
		} else if (argv[i] === "--raw") {
			out.raw = true;
		} else if (argv[i] === "--cwd" && argv[i + 1]) {
			out.cwd = argv[i + 1];
			i++;
		}
	}
	return out;
}

function typeLabel(value: unknown): string {
	if (value === null || value === undefined) return "any";
	if (typeof value !== "object") return "any";
	const obj = value as Record<string, unknown>;
	if ("type" in obj && typeof obj.type === "string") return obj.type;
	if ("type" in obj && Array.isArray(obj.type)) return (obj.type as string[]).join("|");
	if ("$ref" in obj && typeof obj.$ref === "string") return `$ref:${obj.$ref}`;
	if ("enum" in obj && Array.isArray(obj.enum)) return "enum";
	return "object";
}

function walkDotPath(
	root: unknown,
	dotPath: string,
): { found: true; value: unknown } | { found: false; lastExisting: string } {
	const segments = dotPath.split(".");
	let cursor: unknown = root;
	const traversed: string[] = [];
	for (const seg of segments) {
		if (cursor === null || cursor === undefined || typeof cursor !== "object") {
			return { found: false, lastExisting: traversed.join(".") || "(root)" };
		}
		const obj = cursor as Record<string, unknown>;
		if (!(seg in obj)) {
			return { found: false, lastExisting: traversed.join(".") || "(root)" };
		}
		cursor = obj[seg];
		traversed.push(seg);
	}
	return { found: true, value: cursor };
}

function renderTerse(schema: Record<string, unknown>, p: string): string {
	const lines: string[] = [];
	lines.push(`## Schema @ ${p}`);
	lines.push("");

	if ("$id" in schema && typeof schema.$id === "string") {
		lines.push(`**$id**: ${schema.$id}`);
	}
	if ("version" in schema && (typeof schema.version === "string" || typeof schema.version === "number")) {
		lines.push(`**version**: ${schema.version}`);
	}
	if ("title" in schema && typeof schema.title === "string") {
		lines.push(`**title**: ${schema.title}`);
	}
	const topType = "type" in schema ? schema.type : undefined;
	if (typeof topType === "string") {
		lines.push(`**type**: ${topType}`);
	} else if (Array.isArray(topType)) {
		lines.push(`**type**: ${(topType as string[]).join("|")}`);
	}

	if ("required" in schema && Array.isArray(schema.required)) {
		const req = schema.required as string[];
		lines.push(`**required** (${req.length}): ${req.join(", ")}`);
	}

	let firstPluralKey: string | null = null;
	if ("properties" in schema && schema.properties !== null && typeof schema.properties === "object") {
		const props = schema.properties as Record<string, unknown>;
		const keys = Object.keys(props);
		const rendered = keys.map((k) => `${k}: ${typeLabel(props[k])}`);
		lines.push(`**properties** keys (${keys.length}): ${rendered.join(", ")}`);

		for (const k of keys) {
			const v = props[k];
			if (v !== null && typeof v === "object") {
				const vObj = v as Record<string, unknown>;
				if (vObj.type === "array" && vObj.items !== null && typeof vObj.items === "object") {
					firstPluralKey = k;
					break;
				}
			}
		}
	}

	if (firstPluralKey !== null) {
		const props = schema.properties as Record<string, unknown>;
		const plural = props[firstPluralKey] as Record<string, unknown>;
		const items = plural.items as Record<string, unknown>;
		if (items.properties !== null && typeof items.properties === "object") {
			const subProps = items.properties as Record<string, unknown>;
			const subKeys = Object.keys(subProps);
			lines.push(`**properties.${firstPluralKey}.items** keys (${subKeys.length}): ${subKeys.join(", ")}`);
			lines.push(`(hint: --field properties.${firstPluralKey}.items for deeper walking)`);
		}
	}

	return lines.join("\n");
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	if (args.name === null) {
		console.error("read-schema: --name <schemaName> is required");
		process.exit(2);
	}

	let p: string;
	try {
		p = schemaPath(args.cwd, args.name);
	} catch (err) {
		if (err instanceof Error && err.name === "BootstrapNotFoundError") {
			console.error(`read-schema: substrate not initialized — ${err.message}`);
			process.exit(1);
		}
		throw err;
	}

	let schema: object | null;
	try {
		schema = readSchema(args.cwd, args.name);
	} catch (err) {
		if (err instanceof Error && err.name === "BootstrapNotFoundError") {
			console.error(`read-schema: substrate not initialized — ${err.message}`);
			process.exit(1);
		}
		throw err;
	}

	if (schema === null) {
		console.log(`schema: null (no schema at ${p})`);
		return;
	}

	if (args.field !== null) {
		const walked = walkDotPath(schema, args.field);
		if (!walked.found) {
			console.log(`field-not-found: ${args.field} (last existing: ${walked.lastExisting})`);
			return;
		}
		console.log(JSON.stringify(walked.value, null, 2));
		return;
	}

	if (args.raw) {
		console.log(JSON.stringify(schema, null, 2));
		return;
	}

	console.log(renderTerse(schema as Record<string, unknown>, p));
}

main();
