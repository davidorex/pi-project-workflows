#!/usr/bin/env tsx
/**
 * read-schema — terse projection of a substrate schema by name
 *
 * Per the config-drives-substrate-location rule (the substrate dir name is
 * never hardcoded): cwd resolved through
 * `schemaPath(cwd, name)` which cascades through `resolveContextDir`; the
 * `BootstrapNotFoundError` from the resolver surfaces as an actionable
 * error (substrate not initialized) rather than a stack trace. No
 * hardcoded `.project` literal lives in this script.
 *
 * Per the dual-surface discipline (scripts as dual surface): this script is the Claude
 * Code-side ergonomics wrapper over `readSchema` from
 * @davidorex/pi-context/schema-write; the in-pi-runtime equivalent is
 * the `read-schema` pi tool registered in packages/pi-context/src/index.ts
 * (commit bac1893). Both surfaces wrap the same shared
 * library; this script is intentionally thin. Sibling read-config.ts
 * (commit 4a24866) carries the same structural shape.
 *
 * Usage:
 *   tsx scripts/orchestrator/read-schema.ts --name tasks                                    # terse projection
 *   tsx scripts/orchestrator/read-schema.ts --name tasks --path properties.tasks.items      # address one property
 *   tsx scripts/orchestrator/read-schema.ts --name tasks --field properties.tasks.items     # --field == --path (alias)
 *   tsx scripts/orchestrator/read-schema.ts --name tasks --raw                              # full JSON dump
 *   tsx scripts/orchestrator/read-schema.ts --name tasks --cwd <path>                       # alternate cwd
 *
 * --path (and its back-compat alias --field) route through the shared
 * `addressInto` element-addressing primitive — the SAME one the `read-schema` pi tool's
 * `path` param uses; dotted/bracket addressing (a.b.c / a[0].b). One
 * implementation, two flag names — no parallel path-walk.
 *
 * Precedence: --path (or --field) wins over --raw (projection mode). --name is
 * REQUIRED; absence exits 2. Exit codes: 0 ok / 2 arg-error / 3 fn-error;
 * `BootstrapNotFoundError` → exit 1 (substrate not initialized).
 *
 * Runtime demonstration (required for every implementation step, beyond
 * tests-pass) is performed by the orchestrator, not
 * inline — script invocation against the live `.pi-context.json` pointer
 * + substrate is the demo path.
 */
import { schemaPath } from "@davidorex/pi-context/context-dir";
import { addressInto } from "@davidorex/pi-context/read-element";
import { readSchema } from "@davidorex/pi-context/schema-write";

interface Args {
	name: string | null;
	path: string | null;
	raw: boolean;
	cwd: string;
}

function parseArgs(argv: string[]): Args {
	const out: Args = { name: null, path: null, raw: false, cwd: process.cwd() };
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === "--name" && argv[i + 1]) {
			out.name = argv[i + 1];
			i++;
		} else if ((argv[i] === "--path" || argv[i] === "--field") && argv[i + 1]) {
			// --field is a back-compat alias of --path; both fold onto addressInto.
			out.path = argv[i + 1];
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

	if (args.path !== null) {
		const addr = addressInto(schema, { path: args.path });
		if (!addr.found) {
			console.log(`path-not-found: ${addr.resolved}`);
			return;
		}
		console.log(JSON.stringify(addr.value, null, 2));
		return;
	}

	if (args.raw) {
		console.log(JSON.stringify(schema, null, 2));
		return;
	}

	console.log(renderTerse(schema as Record<string, unknown>, p));
}

main();
