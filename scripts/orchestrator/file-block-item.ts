#!/usr/bin/env tsx
/**
 * file-block-item — schema-aware ergonomics wrapper around block-api appendToBlock
 *
 * Adds for Claude Code orchestrator-side substrate filing:
 * - schema-aware pre-validation (catch shape errors before AJV dies)
 * - error translation ("evidence needs {file, reference, lines?}, not strings")
 * - ID auto-allocation (scan existing → suggest next per schema id pattern)
 * - DispatchContext auto-construction from --writer kind:identifier
 * - --show-schema upfront contract display
 * - --dry-run validate without writing
 *
 * Per DEC-0014/0016: in-pi harness-confined agents use the Pi tool surface
 * (append-block-item registered in pi-context/index.ts). This script is the
 * Claude-Code-side parallel — same library underneath (block-api), different
 * consumer wrapper. Both layers thin; business logic in the library.
 *
 * Usage:
 *   tsx scripts/orchestrator/file-block-item.ts --block <name> --show-schema
 *   tsx scripts/orchestrator/file-block-item.ts --block <name> --item @path/to.json [--auto-id] [--dry-run] [--writer human:email]
 *   tsx scripts/orchestrator/file-block-item.ts --block <name> --item '<json>' [--auto-id] [--dry-run] [--writer human:email]
 */
import fs from "node:fs";
import path from "node:path";
import { appendToBlock, readBlock } from "@davidorex/pi-context/block-api";
import type { DispatchContext, WriterIdentity } from "@davidorex/pi-context/dispatch-context";
import { schemasDir } from "@davidorex/pi-context/project-dir";
import { ValidationError, validate } from "@davidorex/pi-context/schema-validator";

interface Args {
	block: string;
	itemJson?: string;
	showSchema: boolean;
	autoId: boolean;
	dryRun: boolean;
	writer: string;
	cwd: string;
}

function parseArgs(argv: string[]): Args {
	const out: Partial<Args> = {
		showSchema: false,
		autoId: false,
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
		} else if (a === "--show-schema") {
			out.showSchema = true;
		} else if (a === "--auto-id") {
			out.autoId = true;
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
	idPattern?: string;
	idLength?: number;
	idPrefix?: string;
}

function loadBlockSchema(cwd: string, block: string): BlockSchemaInfo {
	const schemaPath = path.join(schemasDir(cwd), `${block}.schema.json`);
	if (!fs.existsSync(schemaPath)) {
		console.error(`Schema not found: ${schemaPath}`);
		process.exit(3);
	}
	const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
	const props = schema.properties ?? {};
	let arrayKey: string | undefined;
	for (const [k, v] of Object.entries(props)) {
		const vs = v as any;
		if (vs?.type === "array" && vs?.items) {
			arrayKey = k;
			break;
		}
	}
	if (!arrayKey) {
		console.error(`No array property found in schema ${block}`);
		process.exit(3);
	}
	const itemSchema = (props[arrayKey] as any).items;
	const idProp = itemSchema?.properties?.id;
	const info: BlockSchemaInfo = { arrayKey, itemSchema };
	if (idProp?.pattern) {
		info.idPattern = idProp.pattern;
		// Try to extract prefix + digit-count from pattern like ^FGAP-\d{3}$
		const m = /^\^([A-Za-z_-]+)\\d\{(\d+)(?:,\d*)?\}\$$/.exec(idProp.pattern);
		if (m) {
			info.idPrefix = m[1];
			info.idLength = parseInt(m[2], 10);
		}
	}
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
		const itemsStr =
			vs.type === "array" && vs.items?.type
				? ` items=${vs.items.type}${vs.items.required ? ` required=[${vs.items.required.join(",")}]` : ""}`
				: "";
		const desc = vs.description ? ` — ${vs.description}` : "";
		console.log(`  - ${k}: ${type}${enumStr}${itemsStr}${desc}`);
		if (vs.type === "array" && vs.items?.properties) {
			for (const [ik, iv] of Object.entries(vs.items.properties)) {
				const ivs = iv as any;
				console.log(`      .${ik}: ${ivs.type ?? "(complex)"}`);
			}
		}
	}
	if (info.idPattern) {
		console.log("");
		console.log(`ID pattern: ${info.idPattern}`);
		if (info.idPrefix) console.log(`  Prefix: ${info.idPrefix}, length: ${info.idLength}`);
	}
}

function autoAllocateId(cwd: string, block: string, info: BlockSchemaInfo): string {
	if (!info.idPrefix || !info.idLength) {
		console.error(`Cannot auto-allocate ID: pattern ${info.idPattern} not parseable`);
		process.exit(4);
	}
	const data = readBlock(cwd, block) as Record<string, any>;
	const items = data[info.arrayKey] ?? [];
	let maxN = 0;
	const re = new RegExp(`^${info.idPrefix}(\\d+)$`);
	for (const it of items) {
		const m = re.exec(it.id);
		if (m) {
			const n = parseInt(m[1], 10);
			if (n > maxN) maxN = n;
		}
	}
	const nextN = maxN + 1;
	return `${info.idPrefix}${String(nextN).padStart(info.idLength, "0")}`;
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

	if (args.showSchema) {
		showSchema(info, args.block);
		return;
	}

	const item = loadItem(args.itemJson!);
	if (args.autoId && !item.id) {
		item.id = autoAllocateId(args.cwd, args.block, info);
		console.error(`[auto-id] allocated ${item.id}`);
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
		console.error("[dry-run] validating item against schema; no write");
		try {
			validate(info.itemSchema, item, `${args.block}.${info.arrayKey}[item]`);
			console.error("[dry-run] PASS");
			console.log(JSON.stringify(item, null, 2));
			process.exit(0);
		} catch (err: any) {
			console.error("[dry-run] FAIL");
			if (err instanceof ValidationError && Array.isArray(err.errors)) {
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
		appendToBlock(args.cwd, args.block, info.arrayKey, item, ctx);
		console.log(`Appended ${item.id ?? "(no-id)"} to ${args.block}.${info.arrayKey}`);
	} catch (err: any) {
		console.error(`FAILED to append to ${args.block}.${info.arrayKey}:`);
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
