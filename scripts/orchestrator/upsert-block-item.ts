#!/usr/bin/env tsx
/**
 * upsert-block-item — schema-aware ergonomics wrapper around block-api upsertItemInBlock
 *
 * Append-or-replace by id: if an item with the same idField value exists it is
 * REPLACED (full-shape replacement, NOT shallow-merge — use update-block-item for
 * merge); otherwise the item is appended. The find-or-append decision is held
 * atomically inside upsertItemInBlock's block lock. Adds the same orchestrator
 * ergonomics as file-block-item: schema-aware pre-validation, error translation,
 * DispatchContext from --writer, --show-schema, --dry-run.
 *
 * Per DEC-0014/0016: in-pi harness-confined agents use the Pi tool surface
 * (upsert-block-item registered via the op-registry). This script is the
 * Claude-Code-side parallel — same library underneath (block-api), different
 * consumer wrapper. Both layers thin; business logic in the library.
 *
 * Usage:
 *   tsx scripts/orchestrator/upsert-block-item.ts --block <name> --show-schema
 *   tsx scripts/orchestrator/upsert-block-item.ts --block <name> --item @path/to.json [--id-field id] [--dry-run] [--writer human:email]
 *   tsx scripts/orchestrator/upsert-block-item.ts --block <name> --item '<json>' [--id-field id] [--dry-run] [--writer human:email]
 */
import fs from "node:fs";
import path from "node:path";
import { resolveBlockItemSchema, upsertItemInBlock } from "@davidorex/pi-context/block-api";
import { assertSubstrateName, schemasDir } from "@davidorex/pi-context/context-dir";
import type { DispatchContext, WriterIdentity } from "@davidorex/pi-context/dispatch-context";

interface Args {
	block: string;
	itemJson?: string;
	idField: string;
	showSchema: boolean;
	dryRun: boolean;
	writer: string;
	cwd: string;
}

function parseArgs(argv: string[]): Args {
	const out: Partial<Args> = {
		idField: "id",
		showSchema: false,
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
		} else if (a === "--id-field" && argv[i + 1]) {
			out.idField = argv[i + 1];
			i++;
		} else if (a === "--show-schema") {
			out.showSchema = true;
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
	if (!out.showSchema && !out.itemJson) {
		console.error("Missing --item <json|@file>; use --show-schema for upfront contract display");
		process.exit(2);
	}
	return out as Args;
}

interface BlockSchemaInfo {
	arrayKey: string;
	itemSchema: any;
	schemaPath: string;
	idPattern?: string;
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
	const info: BlockSchemaInfo = { arrayKey: resolved.arrayKey, itemSchema: resolved.itemSchema, schemaPath };
	const idPattern = resolved.itemSchema?.properties?.id?.pattern;
	if (idPattern) info.idPattern = idPattern;
	return info;
}

function showSchema(info: BlockSchemaInfo, block: string): void {
	const item = info.itemSchema;
	console.log(`Block: ${block}`);
	console.log(`Array key: ${info.arrayKey}`);
	console.log("");
	console.log(`Required fields: ${(item.required ?? []).join(", ")}`);
	console.log("");
	console.log("All fields:");
	for (const [k, v] of Object.entries(item.properties ?? {})) {
		const vs = v as any;
		const type = vs.type ?? (vs.$ref ? `$ref ${vs.$ref}` : "(complex)");
		const enumStr = vs.enum ? ` enum=[${vs.enum.join("|")}]` : "";
		const desc = vs.description ? ` — ${vs.description}` : "";
		console.log(`  - ${k}: ${type}${enumStr}${desc}`);
	}
	if (info.idPattern) {
		console.log("");
		console.log(`ID pattern: ${info.idPattern}`);
	}
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

function writerIdentifier(w: WriterIdentity): string {
	switch (w.kind) {
		case "human":
			return w.user;
		case "agent":
			return w.agent_id;
		case "monitor":
			return w.monitor_name;
		case "workflow":
			return w.workflow_step_id;
	}
}

function loadItem(itemArg: string): any {
	if (itemArg.startsWith("@")) {
		const filePath = itemArg.slice(1);
		return JSON.parse(fs.readFileSync(filePath, "utf-8"));
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
			if (fieldSchema.enum) {
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

	if (args.showSchema) {
		showSchema(info, args.block);
		return;
	}

	const item = loadItem(args.itemJson!);
	const idVal = item?.[args.idField];
	if (idVal === undefined || idVal === null || idVal === "") {
		console.error(`Item is missing the upsert key field '${args.idField}' — upsert requires it to find-or-append`);
		process.exit(4);
	}

	const requiresCreatedAt = info.itemSchema.required?.includes("created_at");
	if (requiresCreatedAt && !item.created_at) {
		item.created_at = new Date().toISOString();
		console.error(`[auto-stamp] created_at=${item.created_at}`);
	}

	const writer = parseWriter(args.writer);
	const ctx: DispatchContext = { writer };
	const requiresCreatedBy = info.itemSchema.required?.includes("created_by");
	if (requiresCreatedBy && !item.created_by) {
		item.created_by = `${writer.kind}/${writerIdentifier(writer)}`;
		console.error(`[auto-stamp] created_by=${item.created_by}`);
	}

	if (args.dryRun) {
		// Delegate to the shared library preview path (TASK-011): upsertItemInBlock
		// under { dryRun: true } computes mode, builds + validates the STAMPED
		// prospective whole block with the same validation the write path applies,
		// and writes nothing. The ctx is threaded so the prospective is stamped
		// identically to a real write.
		try {
			const result = upsertItemInBlock(args.cwd, args.block, info.arrayKey, item, args.idField, ctx, { dryRun: true });
			console.error(`[dry-run] PASS (${result.mode === "updated" ? "would update" : "would append"})`);
			console.log(JSON.stringify(item, null, 2));
			process.exit(0);
		} catch (err: any) {
			console.error("[dry-run] FAIL");
			if (err?.name === "ValidationError" && Array.isArray(err.errors)) {
				for (const e of err.errors) {
					console.error(`  - ${formatAjvError(e, info)}`);
				}
			} else {
				console.error(`  - ${err.message ?? String(err)}`);
			}
			process.exit(5);
		}
	}

	try {
		const { mode } = upsertItemInBlock(args.cwd, args.block, info.arrayKey, item, args.idField, ctx);
		console.log(`Upserted ${idVal} (${mode}) to ${args.block}.${info.arrayKey}`);
	} catch (err: any) {
		console.error(`FAILED to upsert to ${args.block}.${info.arrayKey}:`);
		if (err.errors && Array.isArray(err.errors)) {
			for (const e of err.errors) {
				console.error(`  - ${formatAjvError(e, info)}`);
			}
		} else {
			console.error(`  - ${err.message ?? String(err)}`);
		}
		process.exit(5);
	}
}

main();
