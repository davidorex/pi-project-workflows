/**
 * write-schema-migration tool — execute body extracted from index.ts so it
 * can be invoked by a direct unit test without driving the full extension
 * factory. The pi.registerTool wrapper in index.ts is a thin caller; this
 * module owns the validation + dispatch shape.
 *
 * Mirrors the author-agent-spec-tool pattern in pi-agent-dispatch: tool
 * implementation in its own module, tool registration site is a thin
 * wrapper. Lets the tool's operation discriminator + transform
 * presence/absence guards be exercised in isolation.
 *
 * Capability/migration authoring is human-authorized via the auth-gate
 * confirm at the pi-dispatch layer: the agent may issue the call, the
 * operator authorizes at the terminal, and the auth-gate stamps
 * event.input.writer with the verified terminal-operator identity before
 * the body runs.
 *
 * The Pi tool description in index.ts uses abstract framework language
 * (no canonical-id citations) per the operator-facing string convention.
 */

import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { migrationsPath } from "./context-dir.js";
import { type DispatchContext, writerToString } from "./dispatch-context.js";
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
 * write surface; the auth-gate at the pi-dispatch layer is the canonical
 * identity check (this body trusts the writer field as-is, only requiring
 * writer.user as a structural precondition for DispatchContext
 * construction); enforces TransformSpec presence/absence per kind.
 *
 * Returns an AgentToolResult naming the verb + persisted migrations.json
 * path so the caller's content array surfaces the on-disk effect.
 */
export async function writeSchemaMigrationExecute(
	cwd: string,
	params: WriteSchemaMigrationParams,
	ctx?: DispatchContext,
): Promise<AgentToolResult<undefined>> {
	const op = params.operation;
	if (op !== "create" && op !== "replace" && op !== "remove") {
		throw new Error(`write-schema-migration: unknown operation '${op}' — expected create | replace | remove`);
	}

	// Identity check has moved to the pi-dispatch auth-gate (registered
	// by pi-agent-dispatch). By the time this body runs, the auth-gate
	// has prompted the operator and — on confirm=true with a verifiable
	// identity — stamped event.input.writer with the verified terminal-
	// operator identity. The body trusts the writer field as-is.
	if (!ctx?.writer) {
		throw new Error("write-schema-migration: a DispatchContext writer is required.");
	}
	// The recorded author marker derives from the contract DispatchContext: a
	// human writer keeps its bare user (preserving the prior `params.writer.user`
	// shape committed to migrations.json), other kinds fall back to the canonical
	// `<kind>/<id>` string.
	const migrationAuthor = ctx.writer.kind === "human" ? ctx.writer.user : writerToString(ctx.writer);

	if (op === "remove") {
		removeMigrationDecl(cwd, params.schemaName, params.fromVersion, ctx);
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
		created_by: migrationAuthor,
		created_at: new Date().toISOString(),
	};

	if (op === "create") {
		appendMigrationDecl(cwd, decl, ctx);
	} else {
		replaceMigrationDecl(cwd, decl, ctx);
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
