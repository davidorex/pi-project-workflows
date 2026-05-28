/**
 * write-schema-migration tool — execute body extracted from index.ts so it
 * can be invoked by a direct unit test without driving the full extension
 * factory. The pi.registerTool wrapper in index.ts is a thin caller; this
 * module owns the validation + dispatch shape.
 *
 * Mirrors the author-agent-spec-tool pattern in pi-agent-dispatch: tool
 * implementation in its own module, tool registration site is a thin
 * wrapper. Lets the tool's writer.kind enforcement + operation discriminator
 * + transform presence/absence guard be exercised in isolation.
 *
 * The Pi tool description in index.ts uses abstract framework language (no
 * canonical_id citations like 'per DEC-0047') per the FGAP-130 rule for
 * abstract framework descriptions on tool surfaces.
 */

import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { migrationsPath } from "./context-dir.js";
import {
	appendMigrationDecl,
	type MigrationDecl,
	removeMigrationDecl,
	replaceMigrationDecl,
} from "./migrations-store.js";

export interface WriteSchemaMigrationParams {
	operation: string;
	schemaName: string;
	fromVersion: string;
	toVersion: string;
	kind?: string;
	transform?: unknown;
	writer: { kind: string; user: string };
}

/**
 * Execute body for the write-schema-migration tool. Dispatches the three
 * substrate operations (create / replace / remove) over the migrations.json
 * write surface; enforces writer.kind=human (capability/migration authoring
 * is human-only; the pi-dispatch auth-gate is the structural enforcement
 * layer, this body-level check is the belt-and-braces defensive line);
 * enforces TransformSpec presence/absence per kind.
 *
 * Returns an AgentToolResult naming the verb + persisted migrations.json
 * path so the caller's content array surfaces the on-disk effect.
 */
export async function writeSchemaMigrationExecute(
	cwd: string,
	params: WriteSchemaMigrationParams,
): Promise<AgentToolResult<undefined>> {
	const op = params.operation;
	if (op !== "create" && op !== "replace" && op !== "remove") {
		throw new Error(`write-schema-migration: unknown operation '${op}' — expected create | replace | remove`);
	}

	if (params.writer?.kind !== "human") {
		throw new Error(
			`write-schema-migration: writer.kind must be 'human' (got '${params.writer?.kind}'). Capability/migration authoring is human-only; sub-agents have no escalation path.`,
		);
	}
	if (!params.writer.user) {
		throw new Error("write-schema-migration: writer.user is required when writer.kind=human.");
	}

	if (op === "remove") {
		removeMigrationDecl(cwd, params.schemaName, params.fromVersion, {
			writer: { kind: "human", user: params.writer.user },
		});
		return {
			details: undefined,
			content: [
				{
					type: "text",
					text: `write-schema-migration: removed migration for schema '${params.schemaName}' fromVersion '${params.fromVersion}' at ${migrationsPath(cwd)}`,
				},
			],
		};
	}

	const kind = params.kind;
	if (kind !== "identity" && kind !== "declarative-transform") {
		throw new Error(
			`write-schema-migration: kind must be 'identity' or 'declarative-transform' for operation '${op}' (got '${kind}')`,
		);
	}
	if (params.fromVersion === params.toVersion) {
		throw new Error(
			`write-schema-migration: fromVersion ('${params.fromVersion}') must differ from toVersion ('${params.toVersion}')`,
		);
	}

	let transformBody: unknown = params.transform;
	if (typeof transformBody === "string") {
		try {
			transformBody = JSON.parse(transformBody);
		} catch {
			throw new Error("write-schema-migration: transform parameter must be an object, got unparseable string.");
		}
	}

	if (kind === "declarative-transform") {
		if (
			transformBody === undefined ||
			transformBody === null ||
			typeof transformBody !== "object" ||
			!("operations" in (transformBody as Record<string, unknown>))
		) {
			throw new Error(
				"write-schema-migration: kind='declarative-transform' requires a transform body with an 'operations' array.",
			);
		}
	} else if (transformBody !== undefined && transformBody !== null) {
		throw new Error(
			"write-schema-migration: kind='identity' must NOT carry a transform body (identity asserts data is shape-compatible across the bump).",
		);
	}

	const decl: MigrationDecl = {
		schemaName: params.schemaName,
		fromVersion: params.fromVersion,
		toVersion: params.toVersion,
		kind,
		...(kind === "declarative-transform" ? { transform: transformBody as MigrationDecl["transform"] } : {}),
		created_by: params.writer.user,
		created_at: new Date().toISOString(),
	};

	const dispatchCtx = { writer: { kind: "human" as const, user: params.writer.user } };
	if (op === "create") {
		appendMigrationDecl(cwd, decl, dispatchCtx);
	} else {
		replaceMigrationDecl(cwd, decl, dispatchCtx);
	}

	const verb = op === "create" ? "created" : "replaced";
	return {
		details: undefined,
		content: [
			{
				type: "text",
				text: `write-schema-migration: ${verb} ${kind} migration for schema '${params.schemaName}' ${params.fromVersion}→${params.toVersion} at ${migrationsPath(cwd)}`,
			},
		],
	};
}
