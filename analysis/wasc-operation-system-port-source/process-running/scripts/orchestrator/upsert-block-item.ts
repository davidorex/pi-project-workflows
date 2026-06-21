#!/usr/bin/env tsx
/**
 * upsert-block-item — schema-aware ergonomics wrapper around block-api upsertItemInBlock
 *
 * Sibling to file-block-item.ts (which only appends). This closes the
 * append-only ergonomics gap: editing/replacing an existing block item in
 * place had no operator-side CLI wrapper, so the path of least resistance was
 * to append a corrected duplicate — compounding noise in history. This makes
 * "edit, don't append" a first-class command.
 *
 * Upsert semantics (block-api upsertItemInBlock): match an existing item by
 * --match-key (default "id"); if found, REPLACE it in place; else append.
 *
 * Same library underneath as file-block-item.ts (block-api), same writer-ctx
 * construction, same schema-aware pre-validation + dry-run. Both layers thin.
 *
 * Usage:
 *   tsx scripts/orchestrator/upsert-block-item.ts --block <name> --item @path/to.json [--match-key id] [--dry-run] [--writer human:email]
 *   tsx scripts/orchestrator/upsert-block-item.ts --block <name> --item '<json>'      [--match-key id] [--dry-run] [--writer human:email]
 */
import fs from "node:fs";
import path from "node:path";
import { readBlock, resolveBlockItemSchema, upsertItemInBlock } from "@davidorex/pi-context/block-api";
import { assertSubstrateName, schemasDir } from "@davidorex/pi-context/context-dir";
import type { DispatchContext, WriterIdentity } from "@davidorex/pi-context/dispatch-context";
import { validateFromFile } from "@davidorex/pi-context/schema-validator";

interface Args {
	block: string;
	itemJson?: string;
	matchKey: string;
	dryRun: boolean;
	writer: string;
	cwd: string;
}

function parseArgs(argv: string[]): Args {
	const out: Partial<Args> = {
		matchKey: "id",
		dryRun: false,
		writer: "human:davidryan@gmail.com",
		cwd: process.cwd(),
	};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--block" && argv[i + 1]) {
			out.block = argv[i + 1];
			i++;
		} else if (a === "--item" && argv[i + 1]) {
			out.itemJson = argv[i + 1];
			i++;
		} else if (a === "--match-key" && argv[i + 1]) {
			out.matchKey = argv[i + 1];
			i++;
		} else if (a === "--dry-run") {
			out.dryRun = true;
		} else if (a === "--writer" && argv[i + 1]) {
			out.writer = argv[i + 1];
			i++;
		} else if (a === "--cwd" && argv[i + 1]) {
			out.cwd = argv[i + 1];
			i++;
		}
	}
	if (!out.block) {
		console.error("Missing --block <name>");
		process.exit(2);
	}
	if (!out.itemJson) {
		console.error("Missing --item <json|@file>");
		process.exit(2);
	}
	return out as Args;
}

interface BlockSchemaInfo {
	arrayKey: string;
	itemSchema: any;
	schemaPath: string;
}

function loadBlockSchema(cwd: string, block: string): BlockSchemaInfo {
	assertSubstrateName(block);
	const schemaPath = path.join(schemasDir(cwd), `${block}.schema.json`);
	if (!fs.existsSync(schemaPath)) {
		console.error(`Schema not found: ${schemaPath}`);
		process.exit(3);
	}
	const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
	let resolved: { arrayKey: string; itemSchema: any };
	try {
		resolved = resolveBlockItemSchema(schema);
	} catch (err: any) {
		console.error(`${err?.message ?? String(err)} (block ${block})`);
		process.exit(3);
	}
	return { arrayKey: resolved.arrayKey, itemSchema: resolved.itemSchema, schemaPath };
}

function parseWriter(spec: string): WriterIdentity {
	const colon = spec.indexOf(":");
	const kind = colon === -1 ? spec : spec.slice(0, colon);
	const identifier = colon === -1 ? "" : spec.slice(colon + 1);
	switch (kind) {
		case "human":
			return { kind: "human", user: identifier };
		case "agent":
			return { kind: "agent", agent_id: identifier };
		case "monitor":
			return { kind: "monitor", monitor_name: identifier };
		case "workflow":
			return { kind: "workflow", workflow_step_id: identifier };
		default:
			console.error(`Invalid writer kind ${kind}; allowed: human|agent|monitor|workflow`);
			process.exit(2);
	}
}

function loadItem(itemArg: string): any {
	if (itemArg.startsWith("@")) {
		return JSON.parse(fs.readFileSync(itemArg.slice(1), "utf-8"));
	}
	return JSON.parse(itemArg);
}

function formatAjvError(err: any, info: BlockSchemaInfo): string {
	const ip = err.instancePath ?? "";
	const sp = err.schemaPath ?? "";
	const expected = err.params?.type ? `must be ${err.params.type}` : err.message;
	let suggestion = "";
	if (ip.match(/\/[a-z_]+$/i)) {
		const fieldName = ip.split("/").pop();
		const fieldSchema = info.itemSchema?.properties?.[fieldName!];
		if (fieldSchema) {
			if (fieldSchema.type === "array" && fieldSchema.items?.type === "object") {
				suggestion = `; field ${fieldName} requires array of objects ${
					fieldSchema.items.required ? `with required {${fieldSchema.items.required.join(", ")}}` : ""
				}`;
			} else if (fieldSchema.enum) {
				suggestion = `; field ${fieldName} enum=[${fieldSchema.enum.join("|")}]`;
			} else if (fieldSchema.pattern) {
				suggestion = `; field ${fieldName} pattern=${fieldSchema.pattern}`;
			}
		}
	}
	return `${ip || "(root)"}: ${expected}${suggestion} (schemaPath ${sp})`;
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	const info = loadBlockSchema(args.cwd, args.block);
	const item = loadItem(args.itemJson!);

	if (item[args.matchKey] === undefined) {
		console.error(`Item has no --match-key field "${args.matchKey}"; cannot match for upsert`);
		process.exit(2);
	}

	const writer = parseWriter(args.writer);
	const ctx: DispatchContext = { writer };

	// Determine replace-vs-append for reporting; the actual decision is block-api's.
	let willReplace = false;
	let existing: Record<string, any> = {};
	try {
		existing = readBlock(args.cwd, args.block) as Record<string, any>;
		const items = Array.isArray(existing[info.arrayKey]) ? existing[info.arrayKey] : [];
		willReplace = items.some((it: any) => it?.[args.matchKey] === item[args.matchKey]);
	} catch {
		/* fresh block */
	}

	if (args.dryRun) {
		console.error("[dry-run] validating prospective whole file against schema; no write");
		try {
			const items = Array.isArray(existing[info.arrayKey]) ? existing[info.arrayKey] : [];
			const next = willReplace
				? items.map((it: any) => (it?.[args.matchKey] === item[args.matchKey] ? item : it))
				: [...items, item];
			const prospective = { ...existing, [info.arrayKey]: next };
			validateFromFile(info.schemaPath, prospective, `${args.block}.${info.arrayKey}[item]`);
			console.error(`[dry-run] PASS (${willReplace ? "replace" : "append"})`);
			console.log(JSON.stringify(item, null, 2));
			process.exit(0);
		} catch (err: any) {
			console.error("[dry-run] FAIL");
			if (err?.name === "ValidationError" && Array.isArray(err.errors)) {
				for (const e of err.errors) console.error(`  - ${formatAjvError(e, info)}`);
			} else {
				console.error(`  - ${err.message ?? String(err)}`);
			}
			process.exit(5);
		}
	}

	try {
		upsertItemInBlock(args.cwd, args.block, info.arrayKey, item, args.matchKey, ctx);
		console.log(
			`${willReplace ? "Replaced" : "Appended"} ${item[args.matchKey]} in ${args.block}.${info.arrayKey} (match-key ${args.matchKey})`,
		);
	} catch (err: any) {
		console.error(`FAILED to upsert into ${args.block}.${info.arrayKey}:`);
		if (err.errors && Array.isArray(err.errors)) {
			for (const e of err.errors) console.error(`  - ${formatAjvError(e, info)}`);
		} else {
			console.error(`  - ${err.message ?? String(err)}`);
		}
		process.exit(5);
	}
}

main();
