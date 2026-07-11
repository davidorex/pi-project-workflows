/**
 * Op-registry for pi-context — the canonical list of substrate operations,
 * each described once as an OpDefinition and projected onto the in-pi tool
 * surface by registerAll(). This is a behavior-preserving relocation of the
 * 45 inline pi.registerTool({...}) calls that previously lived in the
 * extension factory in index.ts: name/label/description/promptSnippet/
 * parameters are copied verbatim, and each tool's execute body becomes the
 * op's run(cwd, params) with the uniform result wrapper
 * `{ details: undefined, content: [{ type: "text", text: X }] }` reduced to
 * `return X` (registerAll re-applies the wrapper identically for every op).
 *
 * Phase 1 of the pi-context-cli arc (analysis/2026-06-03-pi-context-cli-design-ledger.md):
 * the registry is the single source the auto-tracking CLI will reflect. The
 * authGated / surface fields are carried for that downstream consumer; all
 * current pi-context ops are surface:"use" and authGated is left unset in this
 * phase (the auth-gate at the pi-agent-dispatch layer remains the enforcement
 * point, unchanged by this relocation).
 */

import fs from "node:fs";
import path from "node:path";
import type {
	AgentToolResult,
	AgentToolUpdateCallback,
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { type TSchema, Type } from "typebox";
import {
	appendToBlock,
	appendToNestedArray,
	nextId,
	readBlock,
	readBlockDir,
	removeFromBlock,
	removeFromNestedArray,
	updateItemInBlock,
	updateNestedArrayItem,
	upsertItemInBlock,
	writeBlock,
} from "./block-api.js";
import { type AdoptResult, adoptConception, amendConfigEntry, loadConfig, loadRelations } from "./context.js";
import { BootstrapNotFoundError, schemaPath, tryResolveContextDir } from "./context-dir.js";
import {
	appendRelationByRef,
	appendRelationsByRef,
	buildIdIndex,
	completeTask,
	contextState,
	currentState,
	deriveBootstrapState,
	endpointKey,
	evaluateConfigInvariants,
	filterBlockItems,
	type ItemLocation,
	joinBlocks,
	orientAppendInput,
	type RelationAppendInput,
	readBlockItem,
	readBlockPage,
	removeRelationByRef,
	replaceRelationByRef,
	resolveItemById,
	resolveItemsByIds,
	validateContext,
} from "./context-sdk.js";
import type { DispatchContext } from "./dispatch-context.js";
import { gatherExecutionContext } from "./execution-context.js";
// initProject + the switch/list/archive helpers are defined in index.ts (shared
// with the /context command handlers + the context-* tools). This is a cyclic
// import: index.ts imports registerAll from here. The cycle is safe at runtime —
// registerAll runs at extension-load time, after both modules' top-level
// function bindings exist, and the helpers are only referenced inside op `run`
// closures (lazy), never at this module's top level.
import {
	archiveSubstrate,
	checkStatus,
	convergeDerivedStatusAfterWrite,
	initProject,
	installContext,
	listSubstrates,
	readCatalogSchemaText,
	reconcileContext,
	registerCatalogMigrationChainIfKnown,
	resolveBlocked,
	resolveCatalog,
	resolveConflict,
	switchAndCreate,
	switchToExisting,
	switchToPrevious,
	updateContext,
	validateBlockItemsAgainstCatalog,
} from "./index.js";
import {
	edgesForLensByName,
	findReferencesInRepo,
	loadLensView,
	validateContextRelations,
	walkAncestorsByLens,
	walkLensDescendants,
} from "./lens-view.js";
import { promoteItem } from "./promote-item.js";
import { addressInto, pageArray, type ReadStructured, renderReadText, structureForRead } from "./read-element.js";
import { renameCanonicalId } from "./rename-canonical-id.js";
import { loadRoadmap, renderRoadmap, validateRoadmap } from "./roadmap-plan.js";
import { samplesCatalog } from "./samples-catalog.js";
import { readSchema, writeSchemaChecked } from "./schema-write.js";
import { truncateHead } from "./truncate.js";
import { writeSchemaMigrationExecute } from "./write-schema-migration-tool.js";

/**
 * One substrate operation. `run(cwd, params)` returns the text payload that
 * registerAll places at `content[0].text`; everything else (param coercion,
 * library calls, early returns, throws) lives in run verbatim. `parameters` is
 * the typebox Type.Object schema published as the tool's parameter schema.
 *
 * `surface` partitions ops for the downstream CLI ("use" = read/write substrate
 * ops; "process" reserved for lifecycle/dispatch ops). `authGated` flags ops
 * the CLI should treat as requiring credentialed confirmation; it is carried
 * for that consumer and is not the enforcement point (the pi-agent-dispatch
 * auth-gate remains canonical).
 */
/**
 * The discriminated result of an op's `run` — introduced so the CLI's `--json`
 * envelope can emit a real JSON value instead of a stringified-JSON string
 * requiring a double-parse. An op returns
 * one of three shapes, each carrying its OWN text-rendering rule so the CLI
 * `--json` envelope can emit a real JSON value (no double-encode) while the
 * default text surface + the in-pi Pi-tool surface stay byte-identical:
 *   - `string`        — a prose op's human message; rendered as itself.
 *   - `{ json: … }`   — a data op that previously returned `JSON.stringify(x, null, 2)`;
 *                       rendered via JSON.stringify, structured value is `json`.
 *   - `{ read: … }`   — a read op that previously returned `serializeForRead(x).content`;
 *                       rendered via renderReadText, structured value is the
 *                       {@link ReadStructured} (data + paging/cap metadata).
 * {@link renderOpResultText} collapses all three back to the text both boundaries
 * emit; the CLI `--json` branch unwraps the structured value instead.
 */
export type OpResult = string | { json: unknown } | { read: ReadStructured };

/**
 * Collapse an {@link OpResult} to the text the default CLI surface + the in-pi
 * Pi-tool surface emit. This reproduces, byte-for-byte, what each op's `run`
 * returned before the structured-result split (introduced to fix the CLI
 * `--json` double-encoding): prose → itself; `{json}` →
 * `JSON.stringify(x, null, 2)`; `{read}` → `renderReadText` (== the old
 * `serializeForRead().content`).
 */
/**
 * The unbypassable output-boundary cap — closing the gap where the 50KB read
 * cap was enforced only inside the `{read}` channel's renderer. The 50KB read cap
 * (`DEFAULT_MAX_BYTES` + `truncateHead`) previously lived ONLY in the `{read}`
 * channel (structureForRead / renderReadText); the prose `string` and `{json}`
 * channels emitted unbounded. A `{json}` op embedding substrate content (e.g.
 * resolve-item-by-id, promote-item) therefore leaked that content uncapped on
 * BOTH surfaces — the CLI `--json` `output` and the shared text renderer used by
 * the default CLI surface AND the in-pi Pi-tool surface. These two helpers move
 * the cap to the emission boundary so it fires for EVERY channel regardless of
 * which op shape produced the value.
 *
 * `{read}` is already fail-closed at structureForRead (over-cap → data null +
 * tiny metadata / refusal text), so both helpers pass it through untouched — it
 * is never double-handled here.
 */

/** True when `s` exceeds the 50KB read cap (shared byte-count/threshold logic). */
function overReadCap(s: string): { over: boolean; totalBytes: number } {
	const totalBytes = Buffer.byteLength(s, "utf-8");
	return { over: truncateHead(s).truncated, totalBytes };
}

/**
 * REFUSAL prose for an over-cap `{json}` or prose `string` result — no narrowing
 * tool/addressing is available at this boundary (unlike `{read}`'s
 * overCapDirective), so this mirrors renderReadText's REFUSAL wording without a
 * tool name and returns NO payload body.
 */
function overCapRefusalText(totalBytes: number): string {
	return (
		`⚠️ OUTPUT REFUSED — this result is ${totalBytes} bytes, over the 50KB read cap. ` +
		`Nothing was returned (a partial read would mislead). Narrow your read.`
	);
}

/**
 * Collapse an {@link OpResult} to the text the default CLI surface + the in-pi
 * Pi-tool surface emit, NOW BOUNDED at the 50KB read cap — enforced at the
 * actual output boundary for every channel, closing the earlier gap where only
 * the `{read}` channel was capped.
 * `{read}` → renderReadText (already capped); prose `string` → itself when under
 * cap, else the REFUSAL prose; `{json}` → `JSON.stringify(x, null, 2)` when under
 * cap, else the REFUSAL prose (no partial body).
 */
export function renderOpResultText(r: OpResult): string {
	if (typeof r === "string") {
		const { over, totalBytes } = overReadCap(r);
		return over ? overCapRefusalText(totalBytes) : r;
	}
	if ("read" in r) return renderReadText(r.read);
	const s = JSON.stringify(r.json, null, 2);
	const { over, totalBytes } = overReadCap(s);
	return over ? overCapRefusalText(totalBytes) : s;
}

/**
 * The JSON VALUE for the CLI `--json` envelope `output` field, NOW BOUNDED at the
 * 50KB read cap — enforced at the actual output boundary for every channel.
 * Prose `string` → itself when under cap,
 * else the REFUSAL string; `{read}` → its ReadStructured (already fail-closed —
 * serializes tiny on over-cap); `{json}` → the raw value when under cap, else a
 * fail-closed envelope that MIRRORS {@link ReadStructured}'s over-cap shape
 * (`{ data: null, truncated: true, totalBytes, complete: false }`) so `--json`
 * consumers see one uniform fail-closed envelope across `{read}` and bounded
 * `{json}`. No partial payload is ever emitted past the cap.
 */
export function boundedJsonOutput(r: OpResult): unknown {
	if (typeof r === "string") {
		const { over, totalBytes } = overReadCap(r);
		return over ? overCapRefusalText(totalBytes) : r;
	}
	if ("read" in r) return r.read;
	const s = JSON.stringify(r.json, null, 2);
	const { over, totalBytes } = overReadCap(s);
	return over ? { data: null, truncated: true, totalBytes, complete: false } : r.json;
}

export interface OpDefinition<P = any> {
	name: string;
	label: string;
	description: string;
	promptSnippet?: string;
	/**
	 * Copy-pasteable `pi-context <op> …` invocation strings surfaced by the CLI's
	 * per-op `--help` EXAMPLES section (and its `--format json` machine help). Help
	 * metadata only — part of the best-of-breed per-op `--help` template (synopsis,
	 * flags, copy-pasteable examples, related-ops, machine-readable `--format json`
	 * help). Deliberately NOT projected by registerAll
	 * into the in-pi tool surface (the in-pi tool exposes only
	 * {name,label,description,promptSnippet,parameters}); `examples` is CLI-help-only.
	 */
	examples?: string[];
	parameters: TSchema;
	run(cwd: string, params: P, ctx?: DispatchContext): OpResult | Promise<OpResult>;
	authGated?: boolean;
	/**
	 * When true, the op's string OpResult is emitted byte-exact on the CLI text
	 * surface — no trailing newline appended by the print path — so the output
	 * round-trips to a file / is diffable against an on-disk source whose bytes it
	 * reproduces verbatim. Carried for that CLI consumer (like `authGated`); the
	 * default-unset behavior keeps the prior text-surface trailing-newline framing.
	 */
	verbatimText?: boolean;
	surface: "use" | "process";
}

/**
 * One birth edge on a filing op. Exactly ONE orientation form per entry:
 * `direction` (raw — the new item occupies that raw endpoint) or `role`
 * (role-typed — the new item holds that semantic role, mapped to parent/child
 * via the relation's declared role_direction, exactly as the standalone
 * append-relation --primary/--counter flags map). The role form is REQUIRED
 * for role-bearing orientation-ambiguous relation_types (same-kind or
 * wildcard endpoints), where the porcelain rejects a bare raw append.
 */
interface BirthRelation {
	relation_type: string;
	direction?: "as_parent" | "as_child";
	role?: "primary" | "counter";
	other: string;
	ordinal?: number;
}

/**
 * Coerce a filing op's optional `relations` param (may arrive as a JSON string
 * from the CLI, like Type.Unknown item payloads) and shape-check each entry
 * before any write happens — a malformed entry must refuse the filing BEFORE
 * the item lands, not mid-edge-loop. Enforces the direction/role mutual
 * exclusion (exactly one per entry), mirroring the standalone porcelain's
 * parent/child vs primary/counter pair exclusion.
 */
function coerceBirthRelations(raw: unknown): BirthRelation[] {
	let value = raw;
	if (typeof value === "string") {
		try {
			value = JSON.parse(value);
		} catch {
			throw new Error("relations parameter must be a JSON array, got unparseable string");
		}
	}
	if (value === undefined || value === null) return [];
	if (!Array.isArray(value)) throw new Error("relations parameter must be a JSON array");
	return value.map((entry, i) => {
		const e = entry as Partial<BirthRelation> | null;
		const shapeError = () =>
			new Error(
				`relations[${i}] must be {relation_type: string, other: string, ordinal?: integer} plus EXACTLY ONE of direction: "as_parent"|"as_child" (raw form) or role: "primary"|"counter" (role-typed form)`,
			);
		if (e === null || typeof e !== "object" || typeof e.relation_type !== "string" || typeof e.other !== "string") {
			throw shapeError();
		}
		const hasDirection = e.direction !== undefined;
		const hasRole = e.role !== undefined;
		if (hasDirection === hasRole) throw shapeError(); // both or neither
		if (hasDirection && e.direction !== "as_parent" && e.direction !== "as_child") throw shapeError();
		if (hasRole && e.role !== "primary" && e.role !== "counter") throw shapeError();
		return {
			relation_type: e.relation_type,
			other: e.other,
			...(hasDirection ? { direction: e.direction } : {}),
			...(hasRole ? { role: e.role } : {}),
			...(e.ordinal !== undefined ? { ordinal: e.ordinal } : {}),
		};
	});
}

/**
 * Map one coerced birth entry to the {@link appendRelationByRef} input, with
 * the new item at the entry's endpoint: the raw form fills parent/child, the
 * role form fills primary/counter (the SAME role-typed pair the standalone
 * append-relation flags fill), so orientAppendInput applies its mapping and
 * guards verbatim — no orientation logic lives here.
 */
function birthRelationToAppendInput(
	itemId: string,
	rel: BirthRelation,
): {
	relation_type: string;
	parent?: string;
	child?: string;
	primary?: string;
	counter?: string;
	ordinal?: number;
} {
	const ordinalPart = rel.ordinal !== undefined ? { ordinal: rel.ordinal } : {};
	if (rel.role !== undefined) {
		return {
			relation_type: rel.relation_type,
			...(rel.role === "primary" ? { primary: itemId, counter: rel.other } : { primary: rel.other, counter: itemId }),
			...ordinalPart,
		};
	}
	return {
		relation_type: rel.relation_type,
		parent: rel.direction === "as_parent" ? itemId : rel.other,
		child: rel.direction === "as_parent" ? rel.other : itemId,
		...ordinalPart,
	};
}

/**
 * File a new item's birth edges through the same validated porcelain a
 * standalone append-relation uses (registered-type + endpoint-kind gate,
 * role-direction mapping + orientation-ambiguity guard, atomic write,
 * exact-duplicate no-op), with the new item at each entry's endpoint. Runs
 * AFTER the item write (its id must resolve as an endpoint) inside the same
 * op run, so the write-time invariant gate judges item + edges as one
 * transition atom; a throw here is byte-restored by the pipeline wrapper
 * (all-or-nothing).
 */
function appendBirthRelations(cwd: string, itemId: string, relations: BirthRelation[], ctx?: DispatchContext): void {
	for (const rel of relations) {
		appendRelationByRef(cwd, birthRelationToAppendInput(itemId, rel), ctx);
	}
}

/**
 * Preview-parity orientation check for dryRun filings: run the SAME
 * role-mapping + ambiguity guard the live edge write applies
 * (orientAppendInput), against the registry only — endpoint resolution stays
 * out because the item is unwritten under a preview. A preview thereby
 * refuses exactly the entries the live run would orientation-refuse.
 */
function assertBirthRelationsOrientable(cwd: string, itemId: string, relations: BirthRelation[]): void {
	if (relations.length === 0) return;
	const config = loadConfig(cwd);
	for (const rel of relations) {
		orientAppendInput(config, birthRelationToAppendInput(itemId, rel));
	}
}

/** Shared birth-relations entry schema for the filing ops (append + upsert). */
const BIRTH_RELATION_ENTRY = Type.Object({
	relation_type: Type.String({ description: "Registered relation_type canonical_id" }),
	direction: Type.Optional(
		Type.Union([Type.Literal("as_parent"), Type.Literal("as_child")], {
			description:
				"RAW orientation — which edge endpoint the NEW item occupies. Exactly one of direction/role per entry.",
		}),
	),
	role: Type.Optional(
		Type.Union([Type.Literal("primary"), Type.Literal("counter")], {
			description:
				"ROLE-TYPED orientation — the semantic role the NEW item holds, mapped to parent/child via the relation's declared role_direction (same mapping as append-relation --primary/--counter). REQUIRED for role-bearing orientation-ambiguous relation_types (same-kind or wildcard endpoints), where the raw form is rejected. Exactly one of direction/role per entry.",
		}),
	),
	other: Type.String({ description: "Selector of the other endpoint (canonical id / <alias>:<refname>)" }),
	ordinal: Type.Optional(Type.Integer({ description: "Optional sibling-ordering within (parent, relation_type)" })),
});

export const ops: OpDefinition[] = [
	{
		name: "append-block-item",
		label: "Append Block Item",
		description:
			"Append an item to an array in a project block file. Schema validation is automatic. Set autoId:true to allocate " +
			"the next id from the block's id pattern when the item has no id. Optional relations file the item's BIRTH edges " +
			"in the same op run, after id allocation — each entry names the relation_type, the other endpoint's selector, and " +
			"EXACTLY ONE orientation: direction (as_parent | as_child — the raw endpoint the new item occupies) or role " +
			"(primary | counter — the semantic role the new item holds, mapped via the relation's declared role_direction; " +
			"required for role-bearing orientation-ambiguous relation_types such as the gated-by / derived-from / supersedes " +
			"/ depends families, where the raw form is rejected). Filing item + edges as one atom lets a new item satisfy " +
			"error-severity birth-edge invariants (e.g. a decision must cite a forcing artifact) that would refuse the bare " +
			"item under the write-time gate.",
		promptSnippet:
			"Append items to project blocks (issues, decisions, or any user-defined block), with optional atomic birth edges",
		examples: [
			`pi-context append-block-item --block framework-gaps --arrayKey gaps --autoId true --item @/tmp/fgap.json --writer '{"kind":"human","user":"you@example.com"}' --json`,
			`pi-context append-block-item --block decisions --arrayKey decisions --autoId true --item @/tmp/dec.json --relations '[{"relation_type":"decision_addresses_gap","direction":"as_parent","other":"FGAP-001"},{"relation_type":"decision_derived_from_item","role":"counter","other":"TASK-001"}]' --writer '{"kind":"human","user":"you@example.com"}' --json`,
		],
		parameters: Type.Object({
			block: Type.String({ description: "Block name (e.g., 'issues', 'decisions')" }),
			arrayKey: Type.String({ description: "Array key in the block (e.g., 'issues', 'decisions')" }),
			item: Type.Unknown({ description: "Item object to append — must conform to block schema" }),
			autoId: Type.Optional(
				Type.Boolean({
					description: "When true and the item has no id, allocate the next id from the block's id pattern",
				}),
			),
			relations: Type.Optional(
				Type.Array(BIRTH_RELATION_ENTRY, {
					description:
						"Birth edges filed atomically with the item, after id allocation, via the same validated append-relation porcelain (each entry oriented by direction OR role)",
				}),
			),
		}),
		surface: "use",
		run(
			cwd: string,
			params: {
				block: string;
				arrayKey: string;
				item: Record<string, unknown>;
				autoId?: boolean;
				relations?: unknown;
			},
			ctx?: DispatchContext,
		): OpResult {
			// Type.Unknown() params may arrive as JSON strings — parse if needed
			if (typeof params.item === "string") {
				try {
					params.item = JSON.parse(params.item) as Record<string, unknown>;
				} catch {
					throw new Error(`item parameter must be a JSON object, got unparseable string`);
				}
			}
			const relations = coerceBirthRelations(params.relations);
			// Auto-id allocation — the canonical block-api id-allocation helper (dual-surface twin of file-block-item --auto-id)
			if (params.autoId && params.item && typeof params.item === "object" && !params.item.id) {
				params.item.id = nextId(cwd, params.block);
			}
			if (relations.length > 0 && (typeof params.item?.id !== "string" || params.item.id.length === 0)) {
				throw new Error(
					"relations requires the appended item to carry an id (supply item.id or set autoId:true) — birth edges need the new item's endpoint selector",
				);
			}
			// Id-uniqueness is enforced atomically inside appendToBlock's
			// withBlockLock critical section (block-api assertAppendIdUnique) —
			// the single enforcement point. The prior racy readBlock-then-append
			// tool-layer check was removed in favour of that library guard.
			appendToBlock(cwd, params.block, params.arrayKey, params.item, ctx);
			// Birth edges AFTER the item lands (its id must resolve as an endpoint),
			// inside the same op run so the write-time gate judges item + edges as
			// one transition atom; a failed edge throws and the pipeline wrapper
			// byte-restores the whole write (all-or-nothing).
			appendBirthRelations(cwd, String(params.item.id), relations, ctx);
			const id = params.item?.id ? ` '${params.item.id}'` : "";
			const edges = relations.length > 0 ? ` with ${relations.length} birth relation(s)` : "";
			return `Appended item${id} to ${params.block}.${params.arrayKey}${edges}`;
		},
	},
	{
		name: "update-block-item",
		label: "Update Block Item",
		description: "Update fields on an item in a project block array. Finds by predicate field match.",
		promptSnippet: "Update items in project blocks — change status, add details, mark resolved",
		examples: [
			`pi-context update-block-item --block tasks --arrayKey tasks --match '{"id":"TASK-001"}' --updates '{"status":"in-progress"}' --writer '{"kind":"human","user":"you@example.com"}' --json`,
		],
		parameters: Type.Object({
			block: Type.String({ description: "Block name (e.g., 'issues', 'decisions')" }),
			arrayKey: Type.String({ description: "Array key in the block" }),
			match: Type.Record(Type.String(), Type.Unknown(), { description: "Fields to match (e.g., { id: 'ISSUE-NNN' })" }),
			updates: Type.Record(Type.String(), Type.Unknown(), {
				description: "Fields to update (e.g., { status: 'resolved' })",
			}),
		}),
		surface: "use",
		run(
			cwd: string,
			params: { block: string; arrayKey: string; match: Record<string, unknown>; updates: Record<string, unknown> },
			ctx?: DispatchContext,
		): OpResult {
			if (Object.keys(params.updates).length === 0) {
				throw new Error("No fields to update — updates parameter is empty");
			}

			const matchEntries = Object.entries(params.match);
			updateItemInBlock(
				cwd,
				params.block,
				params.arrayKey,
				(item) => matchEntries.every(([k, v]) => item[k] === v),
				params.updates,
				ctx,
			);

			const matchDesc = matchEntries.map(([k, v]) => `${k}=${v}`).join(", ");
			return `Updated item (${matchDesc}) in ${params.block}.${params.arrayKey}: ${Object.keys(params.updates).join(", ")}`;
		},
	},
	{
		name: "append-relation",
		label: "Append Relation",
		description:
			"Append a closure-table relation (edge: relation_type, optional ordinal) to relations.json. Orient the edge with " +
			"EITHER raw --parent/--child OR the role-typed --primary/--counter (which maps to parent/child via the relation's " +
			"declared role_direction); the two pairs are mutually exclusive. A bare --parent/--child append of a relation that " +
			"is BOTH role-bearing and orientation-ambiguous (its source/target kinds overlap) is rejected — re-issue with " +
			"--primary/--counter. Shape is AJV-validated; an exact-duplicate edge (same parent+child+relation_type) is a no-op. " +
			"Reference integrity (endpoints resolve, relation_type registered, no cycle) is NOT checked here — run " +
			"context-validate after. Creates relations.json if absent.",
		promptSnippet:
			"Create a relation/edge between two items (raw --parent/--child, or role-typed --primary/--counter mapped via role_direction)",
		examples: [
			`pi-context append-relation --parent VER-001 --child TASK-001 --relation_type verification_verifies_item --writer '{"kind":"human","user":"you@example.com"}' --json`,
		],
		parameters: Type.Object({
			parent: Type.Optional(
				Type.String({
					description:
						"Parent-endpoint selector (canonical id / <alias>:<refname> / lens bin) — RAW orientation. Mutually exclusive with --primary/--counter.",
				}),
			),
			child: Type.Optional(
				Type.String({
					description: "Child-endpoint selector — RAW orientation. Mutually exclusive with --primary/--counter.",
				}),
			),
			primary: Type.Optional(
				Type.String({
					description:
						"Selector of the endpoint holding the relation's PRIMARY semantic role (ROLE-TYPED orientation; mapped to parent/child via the relation's declared role_direction). Requires --counter; the relation_type must declare role_direction.",
				}),
			),
			counter: Type.Optional(
				Type.String({
					description:
						"Selector of the endpoint holding the relation's COUNTER role (ROLE-TYPED orientation). Requires --primary.",
				}),
			),
			relation_type: Type.String({
				description: "Registered relation_type canonical_id / hierarchy edge type / lens id",
			}),
			ordinal: Type.Optional(Type.Integer({ description: "Optional sibling-ordering within (parent, relation_type)" })),
			dryRun: Type.Optional(Type.Boolean({ description: "Preview without writing relations.json" })),
		}),
		surface: "use",
		run(
			cwd: string,
			params: {
				parent?: string;
				child?: string;
				primary?: string;
				counter?: string;
				relation_type: string;
				ordinal?: number;
				dryRun?: boolean;
			},
			ctx?: DispatchContext,
		): OpResult {
			// Cycle-5 porcelain: STRING selectors (bare refname / <alias>:<refname> /
			// lens-bin) are resolved to structured EdgeEndpoints and written via the raw
			// plumbing. The append accepts EITHER raw --parent/--child OR the role-typed
			// --primary/--counter form (the explicit role-typed orientation, rather than
			// a guessed direction); messaging renders the RESOLVED stored
			// orientation (endpointKey of the returned edge), so a role-typed call reports
			// the parent/child it actually filed. Under dryRun the byRef fn validates the
			// prospective relations + dedup-checks without writing (the shared dry-run
			// preview path added for relation-mutation ops' `--dryRun` parity).
			const { appended, edge } = appendRelationByRef(
				cwd,
				{
					...(params.parent !== undefined ? { parent: params.parent } : {}),
					...(params.child !== undefined ? { child: params.child } : {}),
					...(params.primary !== undefined ? { primary: params.primary } : {}),
					...(params.counter !== undefined ? { counter: params.counter } : {}),
					relation_type: params.relation_type,
					...(params.ordinal !== undefined ? { ordinal: params.ordinal } : {}),
				},
				ctx,
				{ dryRun: params.dryRun },
			);
			const from = endpointKey(edge.parent);
			const to = endpointKey(edge.child);
			const ordinalNote = params.ordinal !== undefined ? ` (ordinal ${params.ordinal})` : "";
			if (params.dryRun) {
				return appended
					? `would append relation ${from} -[${params.relation_type}]-> ${to}${ordinalNote}`
					: `would no-op (duplicate): relation ${from} -[${params.relation_type}]-> ${to}`;
			}
			return appended
				? `Appended relation ${from} -[${params.relation_type}]-> ${to}${ordinalNote}`
				: `Relation ${from} -[${params.relation_type}]-> ${to} already exists — no-op`;
		},
	},
	{
		name: "remove-relation",
		label: "Remove Relation",
		description:
			"Remove the single closure-table relation (edge) matching parent+child+relation_type from relations.json. " +
			"Matches on the SAME (parent, child, relation_type) dedup identity append-relation uses, so it is the symmetric " +
			"inverse of append-relation (ordinal is NOT part of identity). An absent edge is an idempotent no-op. " +
			"Reference integrity is NOT checked here — run context-validate after if the removal changes resolvability.",
		promptSnippet: "Remove a relation/edge between two items (the inverse of append-relation)",
		examples: [
			`pi-context remove-relation --parent VER-001 --child TASK-001 --relation_type verification_verifies_item --writer '{"kind":"human","user":"you@example.com"}' --json`,
		],
		parameters: Type.Object({
			parent: Type.String({ description: "Canonical id (or lens bin name) of the parent endpoint" }),
			child: Type.String({ description: "Canonical id of the child endpoint" }),
			relation_type: Type.String({
				description: "Registered relation_type canonical_id / hierarchy edge type / lens id",
			}),
			dryRun: Type.Optional(Type.Boolean({ description: "Preview without writing relations.json" })),
		}),
		surface: "use",
		run(
			cwd: string,
			params: { parent: string; child: string; relation_type: string; dryRun?: boolean },
			ctx?: DispatchContext,
		): OpResult {
			// Cycle-5 porcelain: STRING selectors are resolved to structured
			// EdgeEndpoints, then matched on the identityKey dedup identity. Messaging
			// uses the raw selectors (params.*), not the resolved structured endpoints.
			// Under dryRun the byRef fn validates the prospective post-removal
			// relations + match-checks without writing (the shared dry-run preview path
			// added for relation-mutation ops' `--dryRun` parity).
			const { removed } = removeRelationByRef(
				cwd,
				{ parent: params.parent, child: params.child, relation_type: params.relation_type },
				ctx,
				{ dryRun: params.dryRun },
			);
			if (params.dryRun) {
				return removed
					? `would remove relation ${params.parent} -[${params.relation_type}]-> ${params.child}`
					: `would no-op (no matching relation): ${params.parent} -[${params.relation_type}]-> ${params.child}`;
			}
			return removed
				? `Removed relation ${params.parent} -[${params.relation_type}]-> ${params.child}`
				: `Relation ${params.parent} -[${params.relation_type}]-> ${params.child} — no matching relation — no-op`;
		},
	},
	{
		name: "replace-relation",
		label: "Replace Relation",
		description:
			"Atomically replace one closure-table relation with another in a SINGLE write (no half-state: the old edge and " +
			"the new edge never coexist on disk). The old edge is matched on the (parent, child, relation_type) dedup identity; " +
			"the new edge is written with its optional ordinal. If the old edge is absent the call is effectively an append of " +
			"the new edge. This op takes RAW parent/child (old + new) and BYPASSES the write-time orientation gate that " +
			"append-relation applies — it writes the endpoints verbatim, so it is the affordance for re-orienting an existing " +
			"edge; reference integrity is NOT checked here — run context-validate after.",
		promptSnippet: "Atomically swap one relation/edge for another in a single write",
		examples: [
			`pi-context replace-relation --old_parent TASK-001 --old_child DEC-0001 --old_relation_type task_informed_by_decision --parent TASK-001 --child DEC-0002 --relation_type task_informed_by_decision --writer '{"kind":"human","user":"you@example.com"}' --json`,
		],
		parameters: Type.Object({
			old_parent: Type.String({ description: "Parent endpoint selector of the edge to remove" }),
			old_child: Type.String({ description: "Child endpoint selector of the edge to remove" }),
			old_relation_type: Type.String({ description: "relation_type of the edge to remove" }),
			parent: Type.String({ description: "Parent endpoint selector of the replacement edge" }),
			child: Type.String({ description: "Child endpoint selector of the replacement edge" }),
			relation_type: Type.String({ description: "relation_type of the replacement edge" }),
			ordinal: Type.Optional(
				Type.Integer({ description: "Optional sibling-ordering within (parent, relation_type) for the new edge" }),
			),
			dryRun: Type.Optional(Type.Boolean({ description: "Preview without writing relations.json" })),
		}),
		surface: "use",
		run(
			cwd: string,
			params: {
				old_parent: string;
				old_child: string;
				old_relation_type: string;
				parent: string;
				child: string;
				relation_type: string;
				ordinal?: number;
				dryRun?: boolean;
			},
			ctx?: DispatchContext,
		): OpResult {
			// Under dryRun the byRef fn validates the prospective post-replace
			// relations and computes the same removed/replaced would-decisions
			// without writing (the shared dry-run preview path added for
			// relation-mutation ops' `--dryRun` parity).
			const { replaced, removed } = replaceRelationByRef(
				cwd,
				{
					old: { parent: params.old_parent, child: params.old_child, relation_type: params.old_relation_type },
					new: {
						parent: params.parent,
						child: params.child,
						relation_type: params.relation_type,
						...(params.ordinal !== undefined ? { ordinal: params.ordinal } : {}),
					},
				},
				ctx,
				{ dryRun: params.dryRun },
			);
			const ordinalNote = params.ordinal !== undefined ? ` (ordinal ${params.ordinal})` : "";
			const oldDesc = `${params.old_parent} -[${params.old_relation_type}]-> ${params.old_child}`;
			const newDesc = `${params.parent} -[${params.relation_type}]-> ${params.child}${ordinalNote}`;
			if (params.dryRun) {
				if (!removed && !replaced) {
					return `would no-op — old edge ${oldDesc} absent and new edge ${newDesc} already present`;
				}
				if (!removed) {
					return `would append new relation ${newDesc} (old ${oldDesc} absent)`;
				}
				if (!replaced) {
					return `would remove relation ${oldDesc}; new relation ${newDesc} already present (no duplicate written)`;
				}
				return `would replace relation ${oldDesc} with ${newDesc}`;
			}
			if (!removed && !replaced) {
				return `Replace relation no-op — old edge ${oldDesc} absent and new edge ${newDesc} already present`;
			}
			if (!removed) {
				return `Old relation ${oldDesc} absent — appended new relation ${newDesc}`;
			}
			if (!replaced) {
				return `Removed relation ${oldDesc}; new relation ${newDesc} already present (no duplicate written)`;
			}
			return `Replaced relation ${oldDesc} with ${newDesc}`;
		},
	},
	{
		name: "append-relations",
		label: "Append Relations (bulk)",
		description:
			"Append MANY closure-table relations to relations.json in a single write. Each edge is an object with " +
			"{ relation_type, ordinal? } plus EITHER a raw { parent, child } pair OR the role-typed { primary, counter } pair " +
			"(mapped to parent/child via the relation's declared role_direction); the two pairs are mutually exclusive per edge, " +
			"and a bare { parent, child } for an orientation-ambiguous role-bearing relation rejects the whole batch before any " +
			"write. Per-(parent, child, relation_type) duplicates are skipped (against on-disk edges AND earlier edges in the " +
			"same batch). Returns appended/skipped counts. Reference integrity is NOT checked here — run context-validate " +
			"after. Creates relations.json if absent.",
		promptSnippet: "Create many relations/edges between items in one write (raw or role-typed per edge)",
		examples: [
			`pi-context append-relations --edges '[{"parent":"FEAT-008","child":"TASK-042","relation_type":"feature_decomposed_into_task"}]' --writer '{"kind":"human","user":"you@example.com"}' --json`,
		],
		parameters: Type.Object({
			edges: Type.Unknown({
				description:
					"JSON array of edge objects. Each edge is { relation_type, ordinal? } plus EITHER a raw { parent, child } pair OR the role-typed { primary, counter } pair (mapped to parent/child via the relation's declared role_direction); the two orientation pairs are mutually exclusive per edge. Selectors are id / <alias>:<refname> / lens-bin.",
			}),
			dryRun: Type.Optional(Type.Boolean({ description: "Preview without writing relations.json" })),
		}),
		surface: "use",
		run(cwd: string, params: { edges: unknown; dryRun?: boolean }, ctx?: DispatchContext): OpResult {
			// Type.Unknown() params may arrive as JSON strings — parse if needed.
			let edges = params.edges;
			if (typeof edges === "string") {
				try {
					edges = JSON.parse(edges);
				} catch {
					throw new Error(`edges parameter must be a JSON array, got unparseable string`);
				}
			}
			if (!Array.isArray(edges)) {
				throw new Error(`edges parameter must be a JSON array of relation edge objects`);
			}
			// Under dryRun the byRef fn replays the on-disk + in-batch dedup and
			// validates the prospective relations without writing (the shared dry-run
			// preview path added for relation-mutation ops' `--dryRun` parity). Each edge accepts raw {parent,child} or role-typed
			// {primary,counter} (the explicit role-typed orientation form); orientation + the ambiguous-bare-append
			// reject are applied inside appendRelationsByRef before any write.
			const { appended, skipped } = appendRelationsByRef(cwd, edges as RelationAppendInput[], ctx, {
				dryRun: params.dryRun,
			});
			return params.dryRun
				? `would append ${appended}, skip ${skipped} (duplicates)`
				: `appended ${appended}, skipped ${skipped} (duplicates)`;
		},
	},
	{
		name: "upsert-block-item",
		label: "Upsert Block Item",
		description:
			"Append-or-replace an item in a project block array by id: if an item with the same idField value exists it is " +
			"REPLACED (full-shape replacement, not shallow-merge — use update-block-item for merge); otherwise the item is " +
			"appended. Schema validation is automatic. idField defaults to 'id'. Optional relations file BIRTH edges in the " +
			"same op run when the upsert resolves to an APPEND — each entry names the relation_type, the other endpoint's " +
			"selector, and EXACTLY ONE orientation: direction (as_parent | as_child, raw) or role (primary | counter, mapped " +
			"via the relation's declared role_direction; required for role-bearing orientation-ambiguous relation_types) — " +
			"one atom under the write-time gate, so a new filing can satisfy error-severity birth-edge invariants. dryRun " +
			"previews the upsert AND runs the same orientation guard over the entries (a preview refuses what the live run " +
			"would orientation-refuse; endpoint resolution stays out — the item is unwritten). When the upsert resolves to a " +
			"REPLACE, supplying relations refuses the write (birth edges are for new items; file edges on an existing item " +
			"via append-relation).",
		promptSnippet:
			"Append-or-replace a full block item by id (replacement, not merge), with optional atomic birth edges",
		examples: [
			`pi-context upsert-block-item --block tasks --arrayKey tasks --item @/tmp/task.json --writer '{"kind":"human","user":"you@example.com"}' --json`,
		],
		parameters: Type.Object({
			block: Type.String({ description: "Block name (e.g., 'issues', 'decisions')" }),
			arrayKey: Type.String({ description: "Array key in the block (e.g., 'issues', 'decisions')" }),
			item: Type.Unknown({ description: "Full item object to upsert — must conform to block schema" }),
			idField: Type.Optional(Type.String({ description: "Field used as the upsert key (default 'id')" })),
			dryRun: Type.Optional(Type.Boolean({ description: "Preview the upsert without writing" })),
			relations: Type.Optional(
				Type.Array(BIRTH_RELATION_ENTRY, {
					description:
						"Birth edges filed atomically with an APPEND-mode upsert, each entry oriented by direction OR role (refused on replace mode — use append-relation for existing items)",
				}),
			),
		}),
		surface: "use",
		run(
			cwd: string,
			params: {
				block: string;
				arrayKey: string;
				item: Record<string, unknown>;
				idField?: string;
				dryRun?: boolean;
				relations?: unknown;
			},
			ctx?: DispatchContext,
		): OpResult {
			// Type.Unknown() params may arrive as JSON strings — parse if needed.
			if (typeof params.item === "string") {
				try {
					params.item = JSON.parse(params.item) as Record<string, unknown>;
				} catch {
					throw new Error(`item parameter must be a JSON object, got unparseable string`);
				}
			}
			const relations = coerceBirthRelations(params.relations);
			const idField = params.idField ?? "id";
			const idVal = params.item?.[idField];
			if (relations.length > 0 && (typeof idVal !== "string" || idVal.length === 0)) {
				throw new Error(
					`relations requires the upserted item to carry a string '${idField}' — birth edges need the new item's endpoint selector`,
				);
			}
			// Under dryRun upsertItemInBlock computes mode + builds + validates the prospective
			// whole block, writing nothing (the shared dry-run preview path added for
			// upsert-block-item's `--dryRun` parity).
			const { mode } = upsertItemInBlock(cwd, params.block, params.arrayKey, params.item, idField, ctx, {
				dryRun: params.dryRun,
			});
			if (relations.length > 0 && mode === "updated") {
				// Birth edges are a NEW-item affordance. Throwing here (post-write) is
				// safe: the pipeline wrapper byte-restores the substrate on inner-op
				// throw, so the replacement never persists (all-or-nothing).
				throw new Error(
					`relations was supplied but the upsert resolved to REPLACE for '${idVal}' — birth edges are for new items; file edges on an existing item via append-relation`,
				);
			}
			const idDesc = idVal !== undefined ? ` '${idVal}'` : "";
			if (params.dryRun) {
				// Preview parity: run the SAME role-mapping + orientation-ambiguity
				// guard the live edge write applies, against the registry only — the
				// item is unwritten, so endpoint resolution stays out. A preview
				// refuses exactly the entries the live run would orientation-refuse.
				assertBirthRelationsOrientable(cwd, String(idVal), relations);
				const edgePreview = relations.length > 0 ? `; would file ${relations.length} birth relation(s)` : "";
				return `would upsert item${idDesc} (${mode}) in ${params.block}.${params.arrayKey}${edgePreview}`;
			}
			appendBirthRelations(cwd, String(idVal), relations, ctx);
			const edges = relations.length > 0 ? ` with ${relations.length} birth relation(s)` : "";
			return `Upserted item${idDesc} (${mode}) to ${params.block}.${params.arrayKey}${edges}`;
		},
	},
	{
		name: "promote-item",
		label: "Promote Item",
		description:
			"Promote a substrate item into another (registered) substrate as a NEW content-addressed item, recording the " +
			"'item_derived_from_item' lineage edge in the destination relations.json (parent = the new derived item, child = " +
			"the source, carrying the source content_hash). The destination write-path mints a fresh oid + content_hash + " +
			"content object. When the source block's status enum supports it, the source is marked superseded. Preconditions " +
			"(unresolvable/non-item source, unregistered destination alias, unregistered destination relation_type, refname " +
			"collision) throw. Pass dryRun to compute the destination without writing.",
		promptSnippet: "Promote an item into another substrate as a derived copy with a lineage edge",
		examples: [
			`pi-context promote-item --source DEC-0001 --destinationSubstrate .context --writer '{"kind":"human","user":"you@example.com"}' --json`,
		],
		parameters: Type.Object({
			source: Type.String({ description: "Source item selector (bare refname / <alias>:<refname>)" }),
			destinationSubstrate: Type.String({ description: "Registered destination substrate alias" }),
			newRefname: Type.Optional(
				Type.String({ description: "Explicit destination refname (else allocated from the dest block id pattern)" }),
			),
			dryRun: Type.Optional(Type.Boolean({ description: "Compute the destination without writing any channel" })),
			writer: Type.Object(
				{
					kind: Type.String({ description: "Writer kind discriminator — MUST be 'human'." }),
					user: Type.String({ description: "Human writer identity (e.g. 'davidryan@gmail.com')." }),
				},
				{ description: "DispatchContext.writer per pi-context/src/dispatch-context.ts." },
			),
		}),
		surface: "use",
		run(
			cwd: string,
			params: {
				source: string;
				destinationSubstrate: string;
				newRefname?: string;
				dryRun?: boolean;
				writer: { kind: string; user: string };
			},
			ctx?: DispatchContext,
		): OpResult {
			// The DispatchContext now arrives via the op contract — registerAll
			// (in-pi) builds it from the auth-gate-stamped `params.writer`, and the
			// CLI builds it from its resolved identity. The schema `writer` field is
			// retained (the in-pi auth-gate stamps it), but lineage attestation reads
			// the contract ctx, not params.writer.
			if (!ctx?.writer) {
				throw new Error("promote-item: a DispatchContext writer is required.");
			}
			const result = promoteItem(
				cwd,
				{
					source: params.source,
					destinationSubstrate: params.destinationSubstrate,
					...(params.newRefname !== undefined ? { newRefname: params.newRefname } : {}),
					...(params.dryRun !== undefined ? { dryRun: params.dryRun } : {}),
				},
				ctx,
			);
			// Route through {read} (enforcing the 50KB cap at the actual output
			// boundary) so the embedded
			// ResolvedRef.loc.item is bounded at the 50KB cap; over-cap fails closed
			// with metadata. Under-cap text stays the same JSON (renderReadText
			// under-cap returns JSON.stringify(serialized, null, 2) with no footer).
			return { read: structureForRead(result, { whole: true, label: "promote-item result" }) };
		},
	},
	{
		name: "append-block-nested-item",
		label: "Append Block Nested Item",
		description:
			"Append an item to a nested array on a parent-array item in a project block. Schema validation is automatic.",
		promptSnippet: "Append items to nested arrays inside parent items (e.g., findings inside a review)",
		examples: [
			`pi-context append-block-nested-item --block spec-reviews --arrayKey reviews --match '{"id":"REVIEW-001"}' --nestedKey findings --item @/tmp/finding.json --writer '{"kind":"human","user":"you@example.com"}' --json`,
		],
		parameters: Type.Object({
			block: Type.String({ description: "Block name (e.g., 'spec-reviews')" }),
			arrayKey: Type.String({ description: "Parent array key (e.g., 'reviews')" }),
			match: Type.Record(Type.String(), Type.Unknown(), {
				description: "Fields to match the parent item (e.g., { id: 'REVIEW-NNN' })",
			}),
			nestedKey: Type.String({ description: "Nested array key on the matched parent (e.g., 'findings')" }),
			item: Type.Unknown({ description: "Item object to append to the nested array — must conform to schema" }),
		}),
		surface: "use",
		run(
			cwd: string,
			params: {
				block: string;
				arrayKey: string;
				match: Record<string, unknown>;
				nestedKey: string;
				item: Record<string, unknown>;
			},
			ctx?: DispatchContext,
		): OpResult {
			if (typeof params.item === "string") {
				try {
					params.item = JSON.parse(params.item) as Record<string, unknown>;
				} catch {
					throw new Error(`item parameter must be a JSON object, got unparseable string`);
				}
			}
			const matchEntries = Object.entries(params.match);
			const predicate = (i: Record<string, unknown>) => matchEntries.every(([k, v]) => i[k] === v);
			appendToNestedArray(cwd, params.block, params.arrayKey, predicate, params.nestedKey, params.item, ctx);
			const matchDesc = matchEntries.map(([k, v]) => `${k}=${v}`).join(", ");
			const id = params.item?.id ? ` '${params.item.id}'` : "";
			return `Appended item${id} to ${params.block}.${params.arrayKey}[${matchDesc}].${params.nestedKey}`;
		},
	},
	{
		name: "update-block-nested-item",
		label: "Update Block Nested Item",
		description:
			"Update fields on a nested-array item inside a parent-array item in a project block. Finds parent and nested by predicate field match. Throws on parent or nested miss (mirrors update-block-item semantics).",
		promptSnippet: "Update items inside nested arrays — change finding state, mark resolved",
		examples: [
			`pi-context update-block-nested-item --block spec-reviews --arrayKey reviews --match '{"id":"REVIEW-001"}' --nestedKey findings --nestedMatch '{"id":"F-001"}' --updates '{"state":"resolved"}' --writer '{"kind":"human","user":"you@example.com"}' --json`,
		],
		parameters: Type.Object({
			block: Type.String({ description: "Block name (e.g., 'spec-reviews')" }),
			arrayKey: Type.String({ description: "Parent array key (e.g., 'reviews')" }),
			match: Type.Record(Type.String(), Type.Unknown(), {
				description: "Fields to match the parent item (e.g., { id: 'REVIEW-NNN' })",
			}),
			nestedKey: Type.String({ description: "Nested array key on the matched parent (e.g., 'findings')" }),
			nestedMatch: Type.Record(Type.String(), Type.Unknown(), {
				description: "Fields to match the nested item (e.g., { id: 'F-001' })",
			}),
			updates: Type.Record(Type.String(), Type.Unknown(), {
				description: "Fields to update on the nested item (e.g., { state: 'resolved' })",
			}),
		}),
		surface: "use",
		run(
			cwd: string,
			params: {
				block: string;
				arrayKey: string;
				match: Record<string, unknown>;
				nestedKey: string;
				nestedMatch: Record<string, unknown>;
				updates: Record<string, unknown>;
			},
			ctx?: DispatchContext,
		): OpResult {
			if (Object.keys(params.updates).length === 0) {
				throw new Error("No fields to update — updates parameter is empty");
			}
			const parentEntries = Object.entries(params.match);
			const nestedEntries = Object.entries(params.nestedMatch);
			const parentPred = (i: Record<string, unknown>) => parentEntries.every(([k, v]) => i[k] === v);
			const nestedPred = (i: Record<string, unknown>) => nestedEntries.every(([k, v]) => i[k] === v);
			updateNestedArrayItem(
				cwd,
				params.block,
				params.arrayKey,
				parentPred,
				params.nestedKey,
				nestedPred,
				params.updates,
				ctx,
			);
			const parentDesc = parentEntries.map(([k, v]) => `${k}=${v}`).join(", ");
			const nestedDesc = nestedEntries.map(([k, v]) => `${k}=${v}`).join(", ");
			return `Updated nested item (${nestedDesc}) in ${params.block}.${params.arrayKey}[${parentDesc}].${params.nestedKey}: ${Object.keys(params.updates).join(", ")}`;
		},
	},
	{
		name: "remove-block-item",
		label: "Remove Block Item",
		description:
			"Remove items matching a predicate from a top-level array in a project block. Idempotent — returns { removed: 0 } on no match without throwing. Schema validation runs after removal.",
		promptSnippet: "Remove items from project blocks — prune retracted issues, dedupe entries",
		examples: [
			`pi-context remove-block-item --block issues --arrayKey issues --match '{"id":"ISSUE-001"}' --writer '{"kind":"human","user":"you@example.com"}' --json`,
		],
		parameters: Type.Object({
			block: Type.String({ description: "Block name (e.g., 'issues')" }),
			arrayKey: Type.String({ description: "Top-level array key (e.g., 'issues')" }),
			match: Type.Record(Type.String(), Type.Unknown(), { description: "Fields to match (e.g., { id: 'ISSUE-NNN' })" }),
		}),
		surface: "use",
		run(
			cwd: string,
			params: { block: string; arrayKey: string; match: Record<string, unknown> },
			ctx?: DispatchContext,
		): OpResult {
			const matchEntries = Object.entries(params.match);
			const predicate = (i: Record<string, unknown>) => matchEntries.every(([k, v]) => i[k] === v);
			const result = removeFromBlock(cwd, params.block, params.arrayKey, predicate, ctx);
			const matchDesc = matchEntries.map(([k, v]) => `${k}=${v}`).join(", ");
			return `Removed ${result.removed} item(s) matching (${matchDesc}) from ${params.block}.${params.arrayKey}`;
		},
	},
	{
		name: "remove-block-nested-item",
		label: "Remove Block Nested Item",
		description:
			"Remove items matching a predicate from a nested array on a parent-array item in a project block. Throws on parent miss; returns { removed: 0 } on nested miss without throwing.",
		promptSnippet: "Remove nested items — drop rejected findings, retract nested references",
		examples: [
			`pi-context remove-block-nested-item --block spec-reviews --arrayKey reviews --match '{"id":"REVIEW-001"}' --nestedKey findings --nestedMatch '{"id":"F-001"}' --writer '{"kind":"human","user":"you@example.com"}' --json`,
		],
		parameters: Type.Object({
			block: Type.String({ description: "Block name (e.g., 'spec-reviews')" }),
			arrayKey: Type.String({ description: "Parent array key (e.g., 'reviews')" }),
			match: Type.Record(Type.String(), Type.Unknown(), {
				description: "Fields to match the parent item (e.g., { id: 'REVIEW-NNN' })",
			}),
			nestedKey: Type.String({ description: "Nested array key on the matched parent (e.g., 'findings')" }),
			nestedMatch: Type.Record(Type.String(), Type.Unknown(), {
				description: "Fields to match the nested items to remove (e.g., { id: 'F-001' })",
			}),
		}),
		surface: "use",
		run(
			cwd: string,
			params: {
				block: string;
				arrayKey: string;
				match: Record<string, unknown>;
				nestedKey: string;
				nestedMatch: Record<string, unknown>;
			},
			ctx?: DispatchContext,
		): OpResult {
			const parentEntries = Object.entries(params.match);
			const nestedEntries = Object.entries(params.nestedMatch);
			const parentPred = (i: Record<string, unknown>) => parentEntries.every(([k, v]) => i[k] === v);
			const nestedPred = (i: Record<string, unknown>) => nestedEntries.every(([k, v]) => i[k] === v);
			const result = removeFromNestedArray(
				cwd,
				params.block,
				params.arrayKey,
				parentPred,
				params.nestedKey,
				nestedPred,
				ctx,
			);
			const parentDesc = parentEntries.map(([k, v]) => `${k}=${v}`).join(", ");
			const nestedDesc = nestedEntries.map(([k, v]) => `${k}=${v}`).join(", ");
			return `Removed ${result.removed} nested item(s) matching (${nestedDesc}) from ${params.block}.${params.arrayKey}[${parentDesc}].${params.nestedKey}`;
		},
	},
	{
		name: "read-block-dir",
		label: "Read Block Dir",
		description:
			"Enumerate and parse all .json files in a <substrate-dir>/<subdir>/ directory, returned as a sorted array. Missing directories return [].",
		promptSnippet: "Enumerate project block subdirectories (phases, schemas, etc.) as parsed JSON",
		examples: [`pi-context read-block-dir --subdir phases --json`],
		parameters: Type.Object({
			subdir: Type.String({ description: "Subdirectory under the substrate dir (e.g., 'phases', 'schemas')" }),
		}),
		surface: "use",
		run(cwd: string, params: { subdir: string }): OpResult {
			const result = readBlockDir(cwd, params.subdir);
			const read = structureForRead(result, { label: `<substrate-dir>/${params.subdir}/` });
			return { read };
		},
	},
	{
		name: "read-block",
		label: "Read Block",
		description: "Read a project block file as structured JSON.",
		promptSnippet: "Read a project block as structured JSON",
		examples: [`pi-context read-block --block tasks --json`],
		parameters: Type.Object({
			block: Type.String({ description: "Block name (e.g., 'issues', 'tasks', 'requirements')" }),
		}),
		surface: "use",
		run(cwd: string, params: { block: string }): OpResult {
			const result = readBlock(cwd, params.block);
			const read = structureForRead(result, {
				label: `<substrate-dir>/${params.block}.json`,
				overCapDirective: {
					tool: "read-block-page",
					params: { block: params.block, offset: 0, limit: 50 },
					hint: "or read-block-item with id=<id>",
				},
			});
			return { read };
		},
	},
	{
		name: "write-block",
		label: "Write Block",
		description: "Write or replace an entire project block with schema validation.",
		promptSnippet: "Write or replace a project block with schema validation",
		examples: [
			`pi-context write-block --block architecture --data @/tmp/architecture.json --writer '{"kind":"human","user":"you@example.com"}' --json`,
		],
		parameters: Type.Object({
			block: Type.String({ description: "Block name (e.g., 'project', 'architecture')" }),
			data: Type.Unknown({ description: "Complete block data — must conform to block schema" }),
		}),
		surface: "use",
		authGated: true,
		run(cwd: string, params: { block: string; data: unknown }, ctx?: DispatchContext): OpResult {
			const data = typeof params.data === "string" ? JSON.parse(params.data) : params.data;
			writeBlock(cwd, params.block, data, ctx);
			return `Wrote block '${params.block}' successfully`;
		},
	},
	{
		name: "context-status",
		label: "Context Status",
		description: "Get derived context state — source metrics, block summaries, planning lifecycle status.",
		promptSnippet: "Get context state — source metrics, block summaries, planning lifecycle status",
		examples: [`pi-context context-status --json`],
		parameters: Type.Object({}),
		surface: "use",
		run(cwd: string, _params: Record<string, never>): OpResult {
			const result = contextState(cwd);
			return { json: result };
		},
	},
	{
		name: "context-check-status",
		label: "Context Check Status",
		description:
			"Read-only installed-vs-catalog schema drift report — per installed schema the drift state, the baseline and catalog versions, and for behind schemas (catalog-ahead / both-diverged) the version delta (baseline -> catalog) or the content-only basis when the version string is unchanged. The front of the check-status -> update --dryRun -> update sequence. Like every substrate-lifecycle ceremony it seeds the catalog's config migration declarations into migrations.json (idempotent) before its first config read, so a version-lagging legacy substrate is diagnosable; beyond that seed it writes nothing.",
		promptSnippet: "Report installed-vs-catalog schema drift + the version gap for behind schemas (read-only)",
		examples: [`pi-context context-check-status --json`],
		parameters: Type.Object({}),
		surface: "use",
		run(cwd: string, _params: Record<string, never>): OpResult {
			return { json: checkStatus(cwd) };
		},
	},
	{
		name: "context-validate",
		label: "Context Validate",
		description: "Validate cross-block referential integrity — check that IDs referenced across blocks exist.",
		promptSnippet: "Validate cross-block referential integrity",
		examples: [`pi-context context-validate --json`],
		parameters: Type.Object({}),
		surface: "use",
		run(cwd: string, _params: Record<string, never>): OpResult {
			const result = validateContext(cwd);
			return { json: result };
		},
	},
	{
		name: "read-config",
		label: "Read Config",
		description:
			"Read the substrate config.json as structured JSON — vocabulary, lenses, relation_types, status_buckets, display_strings, layers, block_kinds, installed_schemas, installed_blocks. Address ONE registry/map via `registry` (e.g. relation_types) and ONE entry within it via `id` (canonical_id) instead of reading the whole config.",
		promptSnippet: "Read project config — vocabulary, lenses, relation_types, status_buckets",
		examples: [`pi-context read-config --registry block_kinds --id tasks --json`],
		parameters: Type.Object({
			registry: Type.Optional(
				Type.String({
					description:
						"Address ONE config registry/map by key (e.g. 'relation_types', 'lenses', 'block_kinds', 'status_buckets')",
				}),
			),
			id: Type.Optional(Type.String({ description: "With `registry`: address ONE entry within it by canonical_id" })),
		}),
		surface: "use",
		run(cwd: string, params: { registry?: string; id?: string }): OpResult {
			const config = loadConfig(cwd);
			const root = tryResolveContextDir(cwd);
			const configPath = root === null ? null : path.join(root, "config.json");

			if (params.registry !== undefined) {
				const reg = addressInto(config, { key: params.registry });
				if (!reg.found) {
					return `read-config: registry not found — ${reg.resolved}`;
				}
				if (params.id !== undefined) {
					const entry = addressInto(reg.value, { id: params.id });
					if (!entry.found) {
						return `read-config: entry not found in ${params.registry} — ${entry.resolved}`;
					}
					const read = structureForRead(entry.value, {
						whole: true,
						label: `config.${params.registry}.${params.id}`,
					});
					return { read };
				}
				const read = structureForRead(reg.value, {
					whole: true,
					label: `config.${params.registry}`,
					overCapDirective: {
						tool: "read-config",
						params: { registry: params.registry },
						hint: "add id=<entry canonical_id>",
					},
				});
				return { read };
			}

			const result = { config, configPath };
			const read = structureForRead(result, {
				label: configPath ?? "config.json",
				overCapDirective: {
					tool: "read-config",
					hint: "registry=<name> (block_kinds|relation_types|lenses|invariants|…)",
				},
			});
			return { read };
		},
	},
	{
		name: "list-tools",
		label: "List Tools",
		description:
			"Discover the agent's own tool surface (all loaded extensions + builtins). Default returns a COMPACT index — one line per tool (name · param-count · one-line description) plus the active set — not the full JSON-schemas. Pass `name` to fetch ONE tool's full descriptor (name + description + parameter JSON-schema + sourceInfo). Index-then-detail pattern.",
		promptSnippet: "Discover available tools — compact index, or one tool's full descriptor via `name`",
		parameters: Type.Object({
			name: Type.Optional(
				Type.String({ description: "Address ONE tool by name → full descriptor (params schema + sourceInfo)" }),
			),
		}),
		// surface: "process" — list-tools closes over the pi-runtime `boundPi`
		// introspection handle (getAllTools/getActiveTools) and throws when that
		// handle is null (any out-of-pi caller). It is therefore the one op the
		// auto-tracking CLI must NOT surface; the CLI partitions on this field
		// (surface === "use") rather than naming list-tools, so the exclusion is
		// data-driven and a future process-only op inherits it.
		surface: "process",
		run(_cwd: string, params: { name?: string }): OpResult {
			// Closes over the factory `pi` (the introspection surface lives on
			// ExtensionAPI, not ExtensionContext) — supplied to run via the bound
			// PI handle captured in registerAll. cwd is unused here.
			const piHandle = boundPi;
			if (piHandle === null) {
				throw new Error("list-tools: extension PI handle not bound — registerAll(pi) must run before this op executes");
			}
			const all = piHandle.getAllTools();
			const active = piHandle.getActiveTools();

			if (params.name !== undefined) {
				const hit = addressInto(all, { key: params.name });
				// getAllTools entries are keyed by `.name`, not `.id`/`.canonical_id`;
				// resolve by name explicitly rather than relying on addressInto's id path.
				const tool = hit.found ? hit.value : all.find((t) => (t as { name?: string }).name === params.name);
				if (tool === undefined) {
					return `list-tools: tool not found — name=${params.name}`;
				}
				const read = structureForRead(tool, { whole: true, label: `tool ${params.name}` });
				return { read };
			}

			// Default: compact index — progressive disclosure over the full
			// per-tool parameter-schema dump that routinely exceeded the 50KB cap —
			// name + param count + one-line description.
			const index = all.map((t) => {
				const tool = t as {
					name?: string;
					description?: string;
					parameters?: { properties?: Record<string, unknown> };
				};
				const paramCount =
					tool.parameters?.properties && typeof tool.parameters.properties === "object"
						? Object.keys(tool.parameters.properties).length
						: 0;
				const oneLine = (tool.description ?? "").split("\n")[0] ?? "";
				return { name: tool.name, params: paramCount, description: oneLine };
			});
			// The compact index is one line per tool — small enough to serialize whole
			// (no paging); keep the wrapper fields (active/total) on the result object.
			const result = { tools: index, active, total: all.length, activeCount: active.length };
			const read = structureForRead(result, {
				label: "tool index — pass name= for detail",
				overCapDirective: { tool: "list-tools", hint: "name=<tool>" },
			});
			return { read };
		},
	},
	{
		name: "read-samples-catalog",
		label: "Read Samples Catalog",
		description:
			"Enumerate installable sample block kinds (packaged view): per kind — title, description, item shape, applicable relation_types (as source/target), invariants, lenses — plus top-level relation_type/lens/invariant/layer/status_bucket registries. Package-intrinsic: reads the extension's bundled samples catalog, independent of any project. Optional `kind` returns one packaged kind.",
		promptSnippet: "Discover installable sample block kinds — title, shape, relation_types, invariants, lenses",
		examples: [`pi-context read-samples-catalog --kind tasks --json`],
		parameters: Type.Object({
			kind: Type.Optional(Type.String({ description: "Filter to one block_kind canonical_id (e.g. 'tasks')" })),
		}),
		surface: "use",
		run(_cwd: string, params: { kind?: string }): OpResult {
			// Package-intrinsic: the catalog reads the extension's bundled samples
			// directory, not the project substrate — cwd is unused.
			const catalog = samplesCatalog(params.kind ? { kind: params.kind } : undefined);
			const read = structureForRead(catalog, {
				label: params.kind ? `samples kind=${params.kind}` : "samples catalog",
				// Whole catalog → narrow by kind; a single kind has no finer
				// addressing (edge → head-leading marker, no directive). The
				// single-kind read is an addressed node — return it whole (capped),
				// never a 50-item page of an incidental array child.
				...(params.kind
					? { whole: true }
					: { overCapDirective: { tool: "read-samples-catalog", hint: "kind=<canonical_id>" } }),
			});
			return { read };
		},
	},
	{
		name: "read-catalog-schema",
		label: "Read Catalog Schema",
		description:
			"Fetch and print the verbatim catalog schema body (raw JSON Schema: properties/definitions/$id) for a named block kind — diffable locally against the installed `<substrate>/schemas/<name>.schema.json` without touching node_modules. Read-only; the projection-returning sibling is read-samples-catalog.",
		promptSnippet:
			"Fetch and print the verbatim catalog schema body for a named block kind (raw JSON Schema, diffable locally)",
		examples: ["pi-context read-catalog-schema --kind tasks", "pi-context read-catalog-schema --kind tasks --json"],
		parameters: Type.Object({
			kind: Type.String({ description: "Catalog block_kind canonical_id (e.g. 'tasks')" }),
		}),
		surface: "use",
		// The catalog schema file carries its own trailing newline (`}\n`); emit the file
		// bytes exactly — preserving that single newline, appending none — so
		// `read-catalog-schema --kind <k> | diff <installed> -` shows no phantom line when
		// content matches (the pre-flag defect was the print path appending a second
		// newline, doubling it to `}\n\n`).
		verbatimText: true,
		run(_cwd: string, params: { kind: string }): OpResult {
			// Package-intrinsic: reads the extension's bundled catalog schema file,
			// not the project substrate — cwd is unused (like read-samples-catalog).
			// Returns the RAW TEXT bytes as a prose-string OpResult so the verbatim
			// catalog body prints as-is (renderOpResultText) and rides the --json
			// envelope as a string; no {json}/{read} wrap that would re-serialize and
			// alter the bytes the operator diffs.
			return readCatalogSchemaText(params.kind).text;
		},
	},
	{
		name: "context-current-state",
		label: "Context Current State",
		description:
			"Derive 'where are we + what's next' purely from the substrate — focus, in-flight items, ranked atomic-next actions, blocked items, and milestone rollups. Every facet derives from the config-declared `state_derivation` registry: which block kinds + status bucket count as in-flight, the focus fallback kind + bucket, the ordered cross-kind next-actions push order with per-entry ranking (a named field + ordered value list, e.g. gap priority P0..P3) or topo ordering over the blocking-relation graph, the relation_types whose edges contribute blockers (the stock set being `task_depends_on_task` dependencies + `task_gated_by_item` gates), the membership rollups (e.g. milestones over `phase_positioned_in_milestone`) with their complete/incomplete status strings, and the next-actions head-size cap. A blocked item's dependency/gate target that is not complete is reported in blockedBy and held out of nextActions; completeness follows the target kind's truth model — a rollup-declared kind (state_derivation.rollups, e.g. milestone) completes by its DERIVED membership rollup, the same verdict the milestones facet reports, so one read never self-contradicts and a derived-status kind's stored status field is never consulted; every other kind completes by its status bucketing to complete. A substrate whose config declares no `state_derivation` reports focus 'state-derivation not configured' with empty arrays. No writes; nothing hand-stored.",
		promptSnippet:
			"Derive current project state from the config-declared state_derivation registry — focus, in-flight, ranked next actions, blocked, milestone rollups",
		examples: [`pi-context context-current-state --json`],
		parameters: Type.Object({}),
		surface: "use",
		run(cwd: string, _params: Record<string, never>): OpResult {
			const state = currentState(cwd);
			return { json: state };
		},
	},
	{
		name: "context-bootstrap-state",
		label: "Context Bootstrap State",
		description:
			"Derive the substrate bootstrap state for the cwd, purely from the filesystem: 'no-pointer' | 'no-config' | 'skeleton' | 'not-installed' | 'ready', plus the resolved contextDir and any declared-but-unmaterialized installed assets. Bootstrap (/context init or /context switch -c <new-dir>) now writes a minimal schema-valid config empty of vocabulary, so a freshly-bootstrapped substrate lands at 'skeleton' — onward via /context accept-all (adopt the packaged catalog, then /context install) OR amend-config / edit (build a custom vocabulary). Unlike every other tool, this NEVER throws on an un-bootstrapped substrate — it returns 'no-pointer' so you can detect a fresh substrate and tell the user to run /context init <substrate-dir> → /context accept-all → /context install (bootstrap requires user authorization via interactive confirmation). No writes.",
		promptSnippet:
			"Derive substrate bootstrap state — no-pointer | no-config | skeleton | not-installed | ready (never throws pre-bootstrap)",
		examples: [`pi-context context-bootstrap-state --json`],
		parameters: Type.Object({}),
		surface: "use",
		run(cwd: string, _params: Record<string, never>): OpResult {
			const status = deriveBootstrapState(cwd);
			return { json: status };
		},
	},
	{
		name: "rename-canonical-id",
		label: "Rename Canonical Id",
		description:
			"Rename a canonical_id (kind: item | relation_type | lens | layer) from oldId to newId across all substrate surfaces that carry it as DATA — item home block + relations.json edges, or the relevant config registries. Out-of-substrate occurrences (analysis MDs, git history) are REPORTED, never rewritten. block_kind renames are unsupported (filesystem cascade). Use dryRun to preview the would-change counts without writing.",
		promptSnippet: "Rename a canonical_id (item/relation_type/lens/layer) across substrate; dryRun to preview",
		examples: [`pi-context rename-canonical-id --kind item --oldId TASK-001 --newId TASK-100 --dryRun true --json`],
		parameters: Type.Object({
			kind: Type.String({ description: "One of: item | relation_type | lens | layer" }),
			oldId: Type.String({ description: "Current canonical_id to rename from" }),
			newId: Type.String({ description: "New canonical_id to rename to" }),
			dryRun: Type.Optional(Type.Boolean({ description: "Compute would-change counts without writing" })),
		}),
		surface: "use",
		authGated: true,
		run(cwd: string, params: { kind: string; oldId: string; newId: string; dryRun?: boolean }): OpResult {
			const report = renameCanonicalId(cwd, params.kind, params.oldId, params.newId, { dryRun: params.dryRun });
			return { json: report };
		},
	},
	{
		name: "amend-config",
		label: "Amend Config",
		description:
			"Scoped add / replace / remove of ONE entry in ONE config.json registry (block_kinds, relation_types, lenses, " +
			"layers, invariants, status_buckets, display_strings, naming, installed_schemas, installed_blocks, hierarchy). " +
			"The whole resulting config is AJV-validated (SHAPE) and op-correctness is enforced (add ⇒ key absent, " +
			"replace/remove ⇒ key present). Cross-registry referential integrity (removing a still-referenced " +
			"relation_type / lens / layer / block_kind) is NOT checked here — run context-validate after. dryRun previews " +
			"without writing.",
		promptSnippet:
			"Add/replace/remove one entry in a config.json registry (vocabulary, lenses, invariants, status_buckets)",
		examples: [
			`pi-context amend-config --registry relation_types --operation add --key task_blocks_task --entry @/tmp/relation-type.json --writer '{"kind":"human","user":"you@example.com"}' --json`,
		],
		parameters: Type.Object({
			registry: Type.String({
				description:
					"One of: block_kinds | relation_types | lenses | layers | invariants | status_buckets | display_strings | naming | installed_schemas | installed_blocks | hierarchy",
			}),
			operation: Type.String({ description: "add | replace | remove" }),
			key: Type.String({
				description:
					"Entry key: id for keyed-array (block_kinds/relation_types/lenses/layers/invariants), map key for " +
					"map (status_buckets/display_strings/naming), the string value for string-array " +
					"(installed_schemas/installed_blocks), or a JSON {parent_block, child_block, relation_type} for hierarchy",
			}),
			entry: Type.Optional(
				Type.Unknown({
					description:
						"Entry payload: object for keyed-array/hierarchy, string for map value; omit for remove. For keyed-array its id field must equal key; for string-array (when given) it must equal key",
				}),
			),
			dryRun: Type.Optional(Type.Boolean({ description: "Preview the op without writing config.json" })),
		}),
		surface: "use",
		authGated: true,
		run(
			cwd: string,
			params: { registry: string; operation: string; key: string; entry?: unknown; dryRun?: boolean },
			ctx?: DispatchContext,
		): OpResult {
			// Type.Unknown() params may arrive as JSON strings. Parse if possible; on
			// failure KEEP the raw string (valid for map-value registries whose value
			// is a bare string, e.g. naming/display_strings/status_buckets).
			let entry = params.entry;
			if (typeof entry === "string") {
				try {
					entry = JSON.parse(entry);
				} catch {
					/* keep raw string — valid for map-value registries */
				}
			}
			const result = amendConfigEntry(cwd, params.registry, params.operation, params.key, entry, ctx, {
				dryRun: params.dryRun,
			});
			const pastTense = result.operation === "add" ? "added" : `${result.operation}d`;
			const verb = result.modified ? (params.dryRun ? `would ${result.operation}` : pastTense) : "no-op";
			return `amend-config: ${verb} ${result.registry}[${result.key}]`;
		},
	},
	{
		name: "read-schema",
		label: "Read Schema",
		description:
			"Read a substrate schema by name as parsed JSON. Returns null when the schema file is absent. Address ONE property via `path` (dotted/bracket, e.g. properties.tasks.items.properties.status) instead of reading the whole schema.",
		promptSnippet: "Read a block schema as structured JSON — optionally address one property via `path`",
		examples: [`pi-context read-schema --schemaName framework-gaps --path properties.gaps.items.required --json`],
		parameters: Type.Object({
			schemaName: Type.String({
				description: "Schema name without extension (e.g., 'tasks', 'decisions', 'issues')",
			}),
			path: Type.Optional(
				Type.String({
					description: "Address ONE property by dotted/bracket path (e.g. 'properties.tasks.items.properties.status')",
				}),
			),
		}),
		surface: "use",
		run(cwd: string, params: { schemaName: string; path?: string }): OpResult {
			const schema = readSchema(cwd, params.schemaName);
			const schemaPathStr = schemaPath(cwd, params.schemaName);

			if (params.path !== undefined) {
				const addr = addressInto(schema, { path: params.path });
				if (!addr.found) {
					return `read-schema: property not found — ${addr.resolved}`;
				}
				const read = structureForRead(addr.value, { whole: true, label: `${params.schemaName} ${addr.resolved}` });
				return { read };
			}

			const result = { schema, schemaPath: schemaPathStr };
			const read = structureForRead(result, {
				label: schemaPathStr,
				overCapDirective: {
					tool: "read-schema",
					params: { schemaName: params.schemaName },
					hint: "path=<dotted json-path>",
				},
			});
			return { read };
		},
	},
	{
		name: "write-schema",
		label: "Write Schema",
		description:
			"Create or replace a substrate block-kind JSON Schema. operation 'create' requires the schema absent; " +
			"'replace' requires it present. The body is AJV draft-07 meta-validated before an atomic write. When a " +
			"replace advances the schema's declared version and the packaged catalog ships a migration chain reaching " +
			"the new version, that chain is registered automatically so items declaring the prior schema_version keep " +
			"reading; a version bump the catalog does not cover (a non-catalog schema, or an unknown transition) still " +
			"requires a companion migration declaration via write-schema-migration, without which read/write of items " +
			"declaring the older schema_version throws version-mismatch. Registering the block_kind that points at this " +
			"schema is a separate step (amend-config block_kinds).",
		promptSnippet: "Create or replace a block-kind JSON Schema (meta-validated, atomic)",
		examples: [
			`pi-context write-schema --operation create --schemaName tasks --schema @/tmp/tasks.schema.json --writer '{"kind":"human","user":"you@example.com"}' --json`,
		],
		parameters: Type.Object({
			operation: Type.String({ description: "create | replace" }),
			schemaName: Type.String({ description: "Schema name without extension (e.g., 'tasks')" }),
			schema: Type.Unknown({
				description: "The whole JSON Schema object (draft-07). Accepts a JSON string.",
			}),
			dryRun: Type.Optional(Type.Boolean({ description: "Meta-validate without writing" })),
		}),
		surface: "use",
		authGated: true,
		run(
			cwd: string,
			params: { operation: string; schemaName: string; schema?: unknown; dryRun?: boolean },
			ctx?: DispatchContext,
		): OpResult {
			// Type.Unknown() params may arrive as JSON strings. Parse if possible; on
			// failure KEEP the raw value (meta-validation rejects a non-object body).
			let schema = params.schema;
			if (typeof schema === "string") {
				try {
					schema = JSON.parse(schema);
				} catch {
					/* keep raw string — meta-validation will reject a non-object */
				}
			}
			// A replace can advance the schema's declared `version`; capture the
			// pre-write installed version (the from-version existing block items
			// assert) so a known catalog chain can be registered after the write.
			let preReplaceVersion: string | undefined;
			if (params.operation === "replace") {
				const existing = readSchema(cwd, params.schemaName) as { version?: unknown } | null;
				preReplaceVersion = typeof existing?.version === "string" ? existing.version : undefined;
			}
			const result = writeSchemaChecked(
				cwd,
				params.schemaName,
				schema as object,
				params.operation as "create" | "replace",
				ctx,
				{ dryRun: params.dryRun },
			);
			const verb = result.written ? `${result.operation}d` : `would ${result.operation}`;
			// After a committed replace that advanced the version, register the
			// catalog's forward migration chain so a block whose items still assert
			// the prior schema_version reads. Registers nothing (and appends no
			// fabricated identity decl) when the versions match or no catalog chain
			// is known — the version-bump migration decl then remains the caller's
			// responsibility via write-schema-migration.
			let migrationNote = "";
			if (result.written && params.operation === "replace") {
				const destRoot = tryResolveContextDir(cwd);
				const newVersion =
					typeof (schema as { version?: unknown })?.version === "string"
						? (schema as { version?: string }).version
						: undefined;
				if (destRoot !== null) {
					const { samplesRoot } = resolveCatalog();
					const reg = registerCatalogMigrationChainIfKnown(
						destRoot,
						samplesRoot,
						params.schemaName,
						preReplaceVersion,
						newVersion,
					);
					if (reg.registered && reg.registered.length > 0) {
						migrationNote = ` — registered migration decls: ${reg.registered
							.map((m) => `${m.schema} ${m.from}->${m.to}`)
							.join(", ")}`;
					}
				}
			}
			return `write-schema: ${verb} schema '${params.schemaName}' at ${result.schemaPath}${migrationNote}`;
		},
	},
	{
		name: "resolve-conflict",
		label: "Resolve Schema Conflict",
		description:
			"Commit the reconciliation of a schema merge conflict surfaced by update. Run this AFTER reconciling a both-diverged conflict update reported: it writes the reconciled schema body (meta-validated, atomic, operation 'replace') AND advances the merge base for that schema to the packaged catalog body. Advancing the base is the step a bare write-schema lacks — without it, update's 3-way merge re-derives the SAME conflict on every subsequent run because the base never moves off the original pre-conflict body. With the base advanced to the catalog, the next update sees the schema as locally-modified (base === catalog ≠ your body) and the deterministic merge takes your reconciled body (base === theirs → ours) — auto-merging with zero conflicts and preserving your resolution. If schema is omitted, the current on-disk schema is treated as already reconciled and only the base is advanced. The calling agent runs this; no subordinate resolver is spawned.",
		promptSnippet:
			"Commit a reconciled schema conflict: write the resolved body + advance the merge base to the catalog so update stops re-reporting it (run after reconciling an update conflict)",
		examples: [
			`pi-context resolve-conflict --schemaName tasks --schema @/tmp/tasks.reconciled.json --writer '{"kind":"human","user":"you@example.com"}' --json`,
		],
		parameters: Type.Object({
			schemaName: Type.String({ description: "Schema name without extension (e.g., 'tasks')" }),
			schema: Type.Optional(
				Type.Unknown({
					description:
						"The reconciled schema body R (whole JSON Schema object, draft-07; accepts a JSON string). If omitted, the current on-disk schema is treated as already reconciled and only the merge base is advanced.",
				}),
			),
		}),
		surface: "use",
		authGated: true,
		run(cwd: string, params: { schemaName: string; schema?: unknown }, ctx?: DispatchContext): OpResult {
			const result = resolveConflict(cwd, params.schemaName, params.schema, ctx);
			return { json: result };
		},
	},
	{
		name: "resolve-blocked",
		label: "Resolve Blocked",
		description:
			"Commit the resolution of a blocked schema surfaced by update. Run AFTER fixing the block's items (or widening the local schema): when the block file carries git-style failure markers (written by update), strips the full-line marker sentinels first, then re-validates the corrected block against the pinned target schema from the pending-blocked record; on pass registers the migration chain, writes the target schema, advances the merge base to the target (so a subsequent update converges instead of re-blocking), and clears the pending entry; on fail reports the remaining per-item failures and writes nothing. The commit is all-or-nothing: a throw partway through it restores every touched file byte-exact — migrations.json, the installed schema, the block file, config.json, and the pending record — and reports the failure, never a partial commit. On a substrate whose config carries no substrate_id, resolve-blocked establishes the identity at entry (mints, persists, registers) before the commit's stamping write and reports it under substrateIdEstablished.",
		promptSnippet:
			"Commit a blocked schema's resolution: strip any git-style failure markers, re-validate the corrected block against the pinned target, then write the target schema + advance the base + clear the pending record (run after fixing the items update reported blocked)",
		examples: [`pi-context resolve-blocked --schemaName tasks --yes --json`],
		parameters: Type.Object({
			schemaName: Type.String({
				description: "Schema name with a pending-blocked entry (from update's blocked report)",
			}),
		}),
		surface: "use",
		authGated: true,
		run(cwd: string, params: { schemaName: string }, ctx?: DispatchContext): OpResult {
			return { json: resolveBlocked(cwd, params.schemaName, ctx) };
		},
	},
	{
		name: "write-schema-migration",
		label: "Write Schema Migration",
		description:
			"Declare a schema version-bump migration into substrate (migrations.json). operation 'create' appends a new declaration; 'replace' overwrites an existing declaration matched by (schemaName, fromVersion); 'remove' drops a declaration. kind='identity' asserts the bump is shape-compatible (no data transform); kind='declarative-transform' carries a TransformSpec of rename/set/delete/coerce/map_each operations on dotted JSON paths; map_each addresses an array — table mode maps each string element through a lookup (unmatched elements become {relation_type, item_endpoint} with parent/child fallback), set-on-each mode sets a field on every object element. The loaded MigrationRegistry resolves the recorded edge at next read/write so block items declaring an older schema_version walk forward without process restart. Requires user authorization via interactive confirmation at the pi-dispatch auth-gate; on confirm, the verified terminal-operator identity is stamped as writer.",
		promptSnippet: "Declare a schema version-bump migration (identity or declarative-transform) into migrations.json",
		examples: [
			`pi-context write-schema-migration --operation create --schemaName tasks --fromVersion 1.0.0 --toVersion 1.1.0 --kind identity --writer '{"kind":"human","user":"you@example.com"}' --json`,
		],
		parameters: Type.Object({
			operation: Type.String({ description: "create | replace | remove" }),
			schemaName: Type.String({ description: "Schema name without extension (e.g., 'tasks')." }),
			fromVersion: Type.String({ description: "Source schema semver this migration walks forward FROM." }),
			toVersion: Type.String({
				description:
					"Destination schema semver this migration produces. Must differ from fromVersion. Ignored for operation=remove.",
			}),
			kind: Type.Optional(
				Type.String({
					description: "identity | declarative-transform. Required for operation=create/replace; ignored for remove.",
				}),
			),
			transform: Type.Optional(
				Type.Unknown({
					description:
						"TransformSpec body — required when kind='declarative-transform'; forbidden when kind='identity'. Accepts a JSON string.",
				}),
			),
			writer: Type.Object(
				{
					kind: Type.String({ description: "Writer kind discriminator — MUST be 'human'." }),
					user: Type.String({ description: "Human writer identity (e.g. 'davidryan@gmail.com')." }),
				},
				{ description: "DispatchContext.writer per pi-context/src/dispatch-context.ts." },
			),
		}),
		surface: "use",
		authGated: true,
		async run(
			cwd: string,
			params: {
				operation: string;
				schemaName: string;
				fromVersion: string;
				toVersion: string;
				kind?: string;
				transform?: unknown;
				writer: { kind: string; user: string };
			},
			ctx?: DispatchContext,
		): Promise<string> {
			const result = await writeSchemaMigrationExecute(cwd, params, ctx);
			// writeSchemaMigrationExecute returns the uniform AgentToolResult; the
			// op contract is the text payload, which registerAll re-wraps identically.
			const part = result.content[0];
			return part.type === "text" ? part.text : JSON.stringify(part);
		},
	},
	{
		name: "context-init",
		label: "Context Init",
		description:
			"Initialize the substrate dir: bootstrap pointer + dirs + a minimal schema-valid SKELETON config empty of vocabulary. Lands at the 'skeleton' bootstrap state — onward via accept-all (adopt the packaged catalog, then install) OR amend-config / edit (build a custom vocabulary).",
		promptSnippet:
			"Initialize the substrate dir (bootstrap pointer + dirs + skeleton config; onward via accept-all OR amend-config/edit)",
		examples: [`pi-context context-init --contextDir .context --json`],
		parameters: Type.Object({
			contextDir: Type.String({
				description: "Substrate dir name (e.g. .context). Required — no default.",
			}),
		}),
		surface: "use",
		authGated: true,
		run(cwd: string, params: { contextDir: string }): OpResult {
			const result = initProject(cwd, params.contextDir);
			return { json: result };
		},
	},
	{
		name: "context-accept-all",
		label: "Accept-All Conception",
		description:
			"Adopt the canonical packaged conception (samples/conception.json) as this substrate's config.json (accept-all). Writes config only — run install after. Skeleton-aware: overwrites a SKELETON config (the empty-of-vocabulary config init / switch -c writes) but never a POPULATED one.",
		promptSnippet: "Adopt the canonical conception as config (accept-all)",
		examples: [`pi-context context-accept-all --json`],
		parameters: Type.Object({}),
		surface: "use",
		authGated: true,
		run(cwd: string, _params: Record<string, never>): OpResult {
			let result: AdoptResult;
			try {
				result = adoptConception(cwd);
			} catch (err) {
				if (err instanceof BootstrapNotFoundError) {
					return "substrate not initialized — run context-init first";
				}
				throw err;
			}
			return { json: result };
		},
	},
	{
		name: "context-install",
		label: "Context Install",
		description:
			"Install (materialize) the schemas and starter blocks declared in config.json's installed_schemas / installed_blocks from the package samples catalog. Default skip-if-exists (installed files never overwritten without --update); populated block data is always preserved (even with --update); empty or absent blocks get the catalog starter. Records the install baseline (config.installed_from: catalog source + per-schema fingerprint) for installed-vs-catalog drift detection (schemas only). A re-install on an unchanged substrate is idempotent. On a substrate whose config carries no substrate_id, install establishes the identity at entry (mints, persists to config.json, registers in the project registry) and reports it under substrateIdEstablished; an established identity is never re-minted.",
		promptSnippet:
			"Install declared schemas + starter blocks from the samples catalog (skip-if-exists; --update re-syncs schemas + replaces empty blocks; records the config.installed_from baseline)",
		examples: ["pi-context context-install --json", "pi-context context-install --update true --json"],
		parameters: Type.Object({
			update: Type.Optional(
				Type.Boolean({
					description:
						"When true, re-sync existing installed schemas (migration-aware) and replace empty blocks with the catalog starter; populated block data is never overwritten. When false (default), skip existing files.",
				}),
			),
		}),
		surface: "use",
		authGated: true,
		run(cwd: string, params: { update?: boolean }): OpResult {
			const result = installContext(cwd, { overwrite: params.update === true });
			if (result.error) return result.error;
			return { json: result };
		},
	},
	{
		name: "update",
		label: "Update Installed Model",
		description:
			"Bring the installed substrate model (schemas) current with the packaged catalog. Per installed schema, consults the read-only drift check and routes by state: an already-current (in-sync) schema is a no-op; a schema the package shipped a newer version of (catalog-ahead) is re-synced through the migration-aware path; a schema edited locally (locally-modified / both-diverged) is reconciled by a deterministic 3-way merge of base (the as-installed body in the object store, keyed by the recorded baseline content_hash) × ours (the installed schema) × theirs (the catalog schema) — disjoint edits auto-merge so both the user's and the catalog's changes survive (required / enum / array-valued type nodes merge as sets), and a schema with irreconcilable per-path conflicts is left unmodified — the conflict set is returned in the op output (under conflicts) alongside a readable report, and the calling agent reconciles it then commits via resolve-conflict — which writes the reconciled body AND advances the merge base to the catalog so update stops re-reporting it (no subordinate resolver is spawned); undecidable / absent schemas (no-baseline / missing-catalog / missing-installed) are reported, not touched. Update also additively propagates catalog-new config-registry entries (relation_types / invariants / block_kinds / lenses) that are absent from the substrate config, preserving every user-authored entry and any locally-diverged body of an existing entry (additive-only — present entries are never overwritten). Update reports, under migrationsRegistered, the migration declarations a version-bump resync registers into migrations.json (each as schema / from / to). A blocked (refused) catalog-ahead schema additionally carries its diagnostic detail under blockedDetail (one entry per blocked schema): the refusal reason — no-migration-chain (no shipped chain reaches the catalog version) vs validation-failed (the forward-migrated items fail the catalog schema) vs write-failed (a non-validation throw at the write boundary, e.g. the block writer's duplicate-item-id guard; the failures entry carries the thrown message, the items were NOT flagged invalid, and no markers or pending-blocked record are produced) — the installed -> catalog version pair, and for a validation failure the per-item failures naming the failing item id, field, and constraint. A live blocked resync also persists a pending-blocked record (pinning the target catalog schema + the chain reaching it) consumable by resolve-blocked, which commits the resolution once the block's items are fixed. Pass dryRun to preview the per-schema action plan; dryRun predicts the precise per-schema catalog-ahead outcome (resync / migrate / block / merge / conflict) by running the forward-migration + re-validation in memory, the per-blocked-schema diagnostic detail, the config-registry entries that would be added, AND the migration declarations that would be registered, writing nothing beyond the idempotent ceremony seed of the catalog's config migration declarations into migrations.json (every substrate-lifecycle ceremony seeds at entry, before its first config read, so a version-lagging legacy substrate heals instead of throwing). When a catalog-ahead resync is blocked because the block's items fail the catalog schema (validation-failed), update inscribes git-style failure markers INTO the block file at the offending items (full-line `<<<<<<< BLOCKED …` / `>>>>>>> target: …` sentinels), pinning the pre-marker bytes so resolve-blocked can strip the markers and re-validate; the schema and migrations.json stay byte-unchanged. A dryRun preview writes no markers. Because update applies per-component (a blocked schema rolls back only itself; the additive registry propagation writes regardless), a run that refuses any schema while applying registry additions or other-schema resyncs/migrations/merges reports the partiality under partialApplication — applied and notApplied channel mirrors plus a one-line summary naming what was applied alongside what was refused and why — so a blocked run never reads as a no-op; dryRun reports the predicted partiality in the same shape. On a substrate whose config carries no substrate_id, a LIVE update establishes the identity at entry (mints, persists to config.json, registers in the project registry) before its first identity-stamping write — so a pre-identity substrate heals on the ceremony instead of refusing — and reports it under substrateIdEstablished; an established identity is never re-minted, and dryRun (no stamping writes) establishes nothing.",
		promptSnippet:
			"Update the installed schema model from the catalog (3-way merges locally-modified schemas, preserving non-conflicting edits; conflicts → returned in the op output + a report for the calling agent to reconcile and commit via resolve-conflict; a blocked resync carries blockedDetail — reason (no-migration-chain / validation-failed / write-failed for a non-validation write-boundary throw), version pair, per-item failures — and a validation-failed block persists a pending-blocked record (target catalog schema + the chain reaching it) resolved via resolve-blocked once the block's items are fixed; a validation-failed block is marked in place with git-style failure markers (recoverable; stripped + re-validated by resolve-blocked); --dry-run predicts the precise per-schema outcome — resync / migrate / block / merge / conflict — via in-memory forward-migration + re-validation, writing nothing; a run that refuses any schema while applying registry additions or other-schema updates surfaces the partiality under partialApplication with a one-line summary, so a blocked run never reads as a no-op)",
		examples: [`pi-context update --dryRun true --json`],
		parameters: Type.Object({
			dryRun: Type.Optional(
				Type.Boolean({ description: "Preview the per-schema action plan without writing anything." }),
			),
		}),
		surface: "use",
		run(cwd: string, params: { dryRun?: boolean }): OpResult {
			const result = updateContext(cwd, { dryRun: params.dryRun === true });
			if (result.error) return result.error;
			return { json: result };
		},
	},
	{
		name: "context-reconcile",
		label: "Context Reconcile",
		description:
			"Converge stored substrate state with its derivation (the repair half of the derived-status invariant class). For every block kind a derived-status invariant declares (paired with its state_derivation.rollups entry), computes each item's stored-vs-derived status delta using the SAME completeness helper the state derivation's gate satisfaction and context-validate use — the preview, the detector, and the repair cannot disagree. The sweep also includes declared-baseline STALENESS: every stale_conditions-bearing item whose status buckets complete and whose typed condition fired (item-status / file-changed) transitions to stale — the same evaluateStalenessCandidates verdict context-validate flags with. --dryRun returns the exact delta + transition sets a live run would apply (deltas: id, block, from stored value, to derived value, declaring invariant; stalenessTransitions: id, block, from, to stale, firing reasons), writing nothing. A live run applies exactly those sets through the standard validated write path — identity-stamped, envelope-stamped, attested to the invoking writer — and reports the applied counts; a converge-write is not authoring, the written value IS the derivation, and the stale transition applies a condition the item itself declared. Scope: derived-status deltas + declared-staleness transitions ONLY — the op never writes an authored-status kind (feature/gap/issue/task buckets are human judgment) and never touches prose; those classes are flagged for review by context-validate, not auto-repaired. Ceremony discipline: seeds the catalog config migration declarations at entry, and a live run on a substrate with no substrate_id establishes the identity first (reported under substrateIdEstablished). A converged substrate is a clean no-op both ways.",
		promptSnippet:
			"Converge stored rollup-kind statuses with their derivation and apply declared complete-to-stale transitions (--dryRun previews the exact sets; live applies through the validated write path; never touches authored statuses or prose)",
		examples: [`pi-context context-reconcile --dryRun true --json`],
		parameters: Type.Object({
			dryRun: Type.Optional(Type.Boolean({ description: "Preview the exact delta set without writing anything." })),
		}),
		surface: "use",
		authGated: true,
		run(cwd: string, params: { dryRun?: boolean }, ctx?: DispatchContext): OpResult {
			const result = reconcileContext(cwd, { dryRun: params.dryRun === true }, ctx);
			if (result.error) return result.error;
			return { json: result };
		},
	},
	{
		name: "validate-block-items",
		label: "Validate Block Items",
		description:
			"Validate a block's items against the catalog schema version — returns the per-item failures (item id, field, constraint) without writing. Resolves the block's catalog block_kind, loads the installed block, forward-migrates its items in memory through the shipped chain when the block lags the catalog version (a fresh registry; never warms the project's cache), and validates against the catalog schema body. Returns block / from (the block's declared version) / to (the catalog version) / valid / failures[] (each: itemId — the failing item's id when the instancePath resolves to one — instancePath, keyword, message). Read-only: never overwrites the schema, the block, or migrations.json. An unknown block or a missing installed block file throws.",
		promptSnippet:
			"Validate a block's items against the catalog schema version — returns the per-item failures (item id, field, constraint) without writing",
		examples: [`pi-context validate-block-items --block tasks --json`],
		parameters: Type.Object({
			block: Type.String({ description: "Block name (e.g. 'tasks')" }),
		}),
		surface: "use",
		run(cwd: string, params: { block: string }): OpResult {
			return { json: validateBlockItemsAgainstCatalog(cwd, params.block) };
		},
	},
	{
		name: "context-switch",
		label: "Context Switch",
		description:
			"Flip the bootstrap pointer to a different substrate dir (parallel to git switch). Default: flip to an existing substrate at target_dir (requires config.json present). create_new=true: bootstrap a fresh substrate at target_dir AND flip in one operation. to_previous=true: flip back to the pointer's previous_contextDir (target_dir ignored).",
		promptSnippet: "Switch the bootstrap pointer to a different substrate dir",
		examples: [
			`pi-context context-switch --target_dir .context --writer '{"kind":"human","user":"you@example.com"}' --json`,
		],
		parameters: Type.Object({
			target_dir: Type.String({
				description:
					"Substrate dir name to switch to (e.g. '.context'). Required for default + create_new modes; ignored for to_previous mode.",
			}),
			create_new: Type.Optional(
				Type.Boolean({
					description:
						"When true, bootstrap target_dir as a fresh substrate (dirs + a minimal schema-valid SKELETON config empty of vocabulary — onward via accept-all OR amend/edit) AND flip the pointer in one operation (parallel to 'git switch -c <branch>'). Default false (flip to existing substrate; fails if target_dir lacks config.json).",
				}),
			),
			to_previous: Type.Optional(
				Type.Boolean({
					description:
						"When true, flip the pointer back to its previous_contextDir (parallel to 'git switch -'). Requires the pointer to carry a previous_contextDir (a prior switch must have populated it). When true, target_dir is ignored.",
				}),
			),
			writer: Type.Optional(
				Type.Object(
					{
						kind: Type.String({
							description: "Writer kind discriminator — overwritten by auth-gate to 'human' on confirm.",
						}),
						user: Type.String({
							description:
								"Writer user — overwritten by auth-gate to the verified terminal-operator identity on confirm.",
						}),
					},
					{
						description:
							"DispatchContext.writer — stamped by auth-gate on operator confirm; in-body trusts the stamped value.",
					},
				),
			),
		}),
		surface: "use",
		authGated: true,
		run(
			cwd: string,
			params: {
				target_dir: string;
				create_new?: boolean;
				to_previous?: boolean;
				writer?: { kind: string; user: string };
			},
		): OpResult {
			// The auth-gate stamps event.input.writer to verified identity on
			// confirm; the body trusts the stamped writer (auth-gate is the
			// canonical identity check — the in-body writer.kind check is redundant
			// with it, not a substitute). When the
			// gate is bypassed (e.g., test harness), fall back to 'operator'
			// rather than throwing — the same fallback policy the slash command
			// path uses.
			const writerIdentity = params.writer?.user ?? "operator";

			try {
				if (params.to_previous === true) {
					const { from, to } = switchToPrevious(cwd, writerIdentity);
					return { json: { mode: "to_previous", from, to } };
				}
				if (params.create_new === true) {
					const { created } = switchAndCreate(cwd, params.target_dir, writerIdentity);
					return { json: { mode: "create_new", target_dir: params.target_dir, created } };
				}
				switchToExisting(cwd, params.target_dir, writerIdentity);
				return { json: { mode: "existing", target_dir: params.target_dir } };
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return `context-switch failed: ${msg}`;
			}
		},
	},
	{
		name: "context-list",
		label: "Context List",
		description:
			"Enumerate top-level dirs under cwd containing a config.json (switchable substrates). Marks the active one with isActive=true. Read-only.",
		promptSnippet: "List switchable substrate dirs under cwd",
		examples: [`pi-context context-list --json`],
		parameters: Type.Object({}),
		surface: "use",
		run(cwd: string, _params: Record<string, never>): OpResult {
			const subs = listSubstrates(cwd);
			return { json: subs };
		},
	},
	{
		name: "context-archive",
		label: "Context Archive",
		description:
			"Move a non-active substrate dir to archive/<dir>/. Refuses to archive the active substrate (the dir the bootstrap pointer currently names) or to clobber an existing archive/<dir>/.",
		promptSnippet: "Archive a non-active substrate dir to archive/<dir>/",
		examples: [
			`pi-context context-archive --target_dir .context-old --writer '{"kind":"human","user":"you@example.com"}' --json`,
		],
		parameters: Type.Object({
			target_dir: Type.String({
				description: "Substrate dir name to archive (e.g. '.project'). Refused if it is the active substrate.",
			}),
		}),
		surface: "use",
		authGated: true,
		run(cwd: string, params: { target_dir: string }): OpResult {
			try {
				const { from, to } = archiveSubstrate(cwd, params.target_dir);
				return { json: { from, to } };
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return `context-archive failed: ${msg}`;
			}
		},
	},
	{
		name: "filter-block-items",
		label: "Filter Block Items",
		description:
			"Filter the array items of a block by a single-field predicate (eq / neq / in / matches). Discovers the single top-level array property in the block; items missing the predicate field are never matched. Wraps the canonical readBlock + caller-side filter into one queryable surface; never mutates the block.",
		promptSnippet: "Filter a block's items by a predicate — eq / neq / in / matches against a single field",
		examples: [`pi-context filter-block-items --block framework-gaps --field status --op eq --value '"open"' --json`],
		parameters: Type.Object({
			block: Type.String({
				description: "Block name (e.g., 'tasks', 'decisions', 'framework-gaps', 'context-contracts')",
			}),
			field: Type.String({ description: "Item field to test (e.g., 'status', 'priority', 'id')" }),
			op: Type.Union([Type.Literal("eq"), Type.Literal("neq"), Type.Literal("in"), Type.Literal("matches")], {
				description:
					"Comparison operator: eq (===), neq (!==), in (value is array, item[field] in it), matches (regexp test on string)",
			}),
			value: Type.Unknown({
				description: "Comparison value — scalar for eq/neq, array for in, regexp pattern string for matches",
			}),
		}),
		surface: "use",
		run(
			cwd: string,
			params: { block: string; field: string; op: "eq" | "neq" | "in" | "matches"; value: unknown },
		): OpResult {
			const result = filterBlockItems(cwd, params.block, {
				field: params.field,
				op: params.op,
				value: params.value,
			});
			const read = structureForRead(result, {
				label: `${params.block} filtered`,
				overCapDirective: { tool: "read-block-page", hint: "or refine the predicate" },
			});
			return { read };
		},
	},
	{
		name: "resolve-item-by-id",
		label: "Resolve Item By Id",
		description:
			"Look up the block, array key, and item payload for a given ID across all blocks in the substrate dir. Returns null when no item matches. Mirrors the resolveItemById SDK function and shares its prefix-vs-block invariant — IDs whose prefix maps to a known block but live elsewhere throw at index-build time.",
		promptSnippet: "Resolve a kind-prefixed ID (DEC-/FEAT-/FGAP-/issue-/REQ-/TASK-/etc.) to its owning block and item",
		examples: [`pi-context resolve-item-by-id --id TASK-001 --json`],
		parameters: Type.Object({
			id: Type.String({ description: "Kind-prefixed ID, e.g., DEC-NNNN / FEAT-NNN / FGAP-NNN / ISSUE-NNN" }),
		}),
		surface: "use",
		run(cwd: string, params: { id: string }): OpResult {
			const result = resolveItemById(cwd, params.id);
			// Route through {read} (enforcing the 50KB cap at the actual output
			// boundary) so the embedded full
			// ItemLocation is bounded at the 50KB cap and over-cap fails closed with
			// a narrowing directive (mirrors read-block-item). `result` is
			// ItemLocation | null — structureForRead handles both.
			return {
				read: structureForRead(result, {
					whole: true,
					label: `resolve ${params.id}`,
					overCapDirective: { tool: "read-block-item", hint: "narrow to one block" },
				}),
			};
		},
	},
	{
		name: "read-block-item",
		label: "Read Block Item",
		description:
			"Read a single item from a named block by its id — returns the item or null. Block-scoped (unlike resolve-item-by-id, which searches all blocks by kind-prefixed id). Avoids fetching a whole large block to get one item.",
		promptSnippet: "Read one item from a block by id (block-scoped; null if absent)",
		examples: [`pi-context read-block-item --block tasks --id TASK-001 --json`],
		parameters: Type.Object({
			block: Type.String({ description: "Block name (e.g., 'tasks', 'decisions', 'framework-gaps')" }),
			id: Type.String({ description: "Item id within the block (e.g., 'TASK-NNN')" }),
		}),
		surface: "use",
		run(cwd: string, params: { block: string; id: string }): OpResult {
			const result = readBlockItem(cwd, params.block, params.id);
			// whole: the item is already the addressed element — don't re-page its
			// intrinsic arrays; preserve the single-item|null output contract.
			const read = structureForRead(result, { whole: true, label: `${params.block} ${params.id}` });
			return { read };
		},
	},
	{
		name: "read-block-page",
		label: "Read Block Page",
		description:
			"Paginate a block's items: returns { items, total, hasMore }. offset default 0, limit default 50. Use for blocks too large to fetch whole (past the 50KB read-block cap). total is the full item count; hasMore signals another page.",
		promptSnippet: "Paginate a block's items — offset + limit; returns {items,total,hasMore}",
		examples: [`pi-context read-block-page --block tasks --limit 20 --json`],
		parameters: Type.Object({
			block: Type.String({ description: "Block name (e.g., 'framework-gaps', 'decisions', 'issues')" }),
			offset: Type.Optional(Type.Integer({ minimum: 0, description: "Start index (default 0)" })),
			limit: Type.Optional(Type.Integer({ minimum: 1, description: "Max items to return (default 50)" })),
		}),
		surface: "use",
		run(cwd: string, params: { block: string; offset?: number; limit?: number }): OpResult {
			const result = readBlockPage(cwd, params.block, { offset: params.offset, limit: params.limit });
			// whole: readBlockPage ALREADY paged — preserve the {items,total,hasMore}
			// output contract; do not let serializeForRead re-page the items array.
			const read = structureForRead(result, { whole: true, label: `${params.block} page` });
			return { read };
		},
	},
	{
		name: "join-blocks",
		label: "Join Blocks",
		description:
			"Join two blocks in one call. EDGE mode: pass `relationType` — pairs left items with right-block items connected by that relations.json edge (`leftEndpoint` parent|child, default parent). FIELD mode: pass `leftField`+`rightField` — pairs where left[leftField] === right[rightField]. Optional left pre-filter via where{Field,Op,Value}. Returns [{left, right:[]}] (right always an array; one-to-many). Use instead of N+1 read-block + resolve calls.",
		promptSnippet: "Join two blocks in one call — by relation edge or shared field; returns {left,right[]} pairs",
		examples: [
			`pi-context join-blocks --leftBlock tasks --rightBlock verification --relationType verification_verifies_item --leftEndpoint child --json`,
		],
		parameters: Type.Object({
			leftBlock: Type.String({ description: "Left block name (e.g., 'tasks')" }),
			rightBlock: Type.String({ description: "Right block name (e.g., 'verification')" }),
			relationType: Type.Optional(Type.String({ description: "Edge mode: relations.json relation_type" })),
			leftField: Type.Optional(Type.String({ description: "Field mode: left item field" })),
			rightField: Type.Optional(Type.String({ description: "Field mode: right item field" })),
			leftEndpoint: Type.Optional(
				Type.Union([Type.Literal("parent"), Type.Literal("child")], {
					description: "Edge mode: is the left item the edge parent (default) or child",
				}),
			),
			whereField: Type.Optional(Type.String({ description: "Optional left pre-filter field" })),
			whereOp: Type.Optional(
				Type.Union([Type.Literal("eq"), Type.Literal("neq"), Type.Literal("in"), Type.Literal("matches")]),
			),
			whereValue: Type.Optional(Type.Unknown({ description: "Optional left pre-filter value" })),
		}),
		surface: "use",
		run(
			cwd: string,
			params: {
				leftBlock: string;
				rightBlock: string;
				relationType?: string;
				leftField?: string;
				rightField?: string;
				leftEndpoint?: "parent" | "child";
				whereField?: string;
				whereOp?: "eq" | "neq" | "in" | "matches";
				whereValue?: unknown;
			},
		): OpResult {
			const leftPredicate =
				params.whereField !== undefined
					? { field: params.whereField, op: params.whereOp ?? "eq", value: params.whereValue }
					: undefined;
			const result = joinBlocks(cwd, {
				leftBlock: params.leftBlock,
				rightBlock: params.rightBlock,
				relationType: params.relationType,
				leftField: params.leftField,
				rightField: params.rightField,
				leftEndpoint: params.leftEndpoint,
				leftPredicate,
			});
			const read = structureForRead(result, {
				label: `${params.leftBlock} ⋈ ${params.rightBlock}`,
				overCapDirective: {
					tool: "join-blocks",
					hint: "refine the relation/field or pre-filter the left block",
				},
			});
			return { read };
		},
	},
	{
		name: "resolve-items-by-id",
		label: "Resolve Items By Id (Bulk)",
		description:
			"Bulk variant of resolve-item-by-id — resolve N kind-prefixed ids against a single buildIdIndex traversal. Returns an object mapping each input id to its ItemLocation (block / arrayKey / item) or null when not found. Coexists with the singular resolve-item-by-id tool; bulk collapses the N×singular-call pattern for callers resolving multiple ids in one render pass.",
		promptSnippet: "Resolve a batch of kind-prefixed ids (DEC-/FGAP-/TASK-/issue-/REQ-/...) in one call",
		examples: [`pi-context resolve-items-by-id --ids '["TASK-001","DEC-0001","FGAP-042"]' --json`],
		parameters: Type.Object({
			ids: Type.Array(Type.String(), {
				description: "Array of kind-prefixed ids (DEC-/FGAP-/TASK-/issue-/REQ-/...) to resolve in one call",
			}),
		}),
		surface: "use",
		run(cwd: string, params: { ids: string[] }): OpResult {
			const resultMap = resolveItemsByIds(cwd, params.ids);
			const obj: Record<string, ItemLocation | null> = {};
			for (const [id, loc] of resultMap) obj[id] = loc;
			// whole: an id→location map keyed by arbitrary ids — not a pageable
			// collection; serialize the map verbatim.
			const read = structureForRead(obj, { whole: true, label: "resolved ids" });
			return { read };
		},
	},
	{
		name: "complete-task",
		label: "Complete Task",
		description:
			"Complete a task with verification gate — the closure ATOM. Requires a passing verification entry, then FILES " +
			"the verification_verifies_item edge itself (idempotent — a pre-existing exact edge is a no-op) and flips the " +
			"task status to completed in one op run, so the write-time invariant gate judges the joint end-state. No prior " +
			"append-relation step is needed (a standalone edge or status write would be refused by error-severity closure " +
			"invariants; this op IS the legal transition).",
		promptSnippet:
			"Complete a task — gates on passing verification, files the verification edge itself, then flips status (one atom)",
		examples: [
			`pi-context complete-task --taskId TASK-001 --verificationId VER-001 --writer '{"kind":"human","user":"you@example.com"}' --json`,
		],
		parameters: Type.Object({
			taskId: Type.String({ description: "Task ID to complete" }),
			verificationId: Type.String({
				description: "Verification entry ID (must have status 'passed'; the op files the linking edge itself)",
			}),
		}),
		surface: "use",
		run(cwd: string, params: { taskId: string; verificationId: string }, ctx?: DispatchContext): OpResult {
			const result = completeTask(cwd, params.taskId, params.verificationId, ctx);
			const edge = result.edgeAppended ? "edge filed" : "edge pre-existing";
			return `Task '${result.taskId}' completed (was '${result.previousStatus}'). Verification: ${result.verificationId} (${result.verificationStatus}, ${edge})`;
		},
	},
	{
		name: "context-validate-relations",
		label: "Context Validate Relations",
		description:
			"Validate substrate relations.json edges against config-declared lenses + hierarchy + relation_types and the cross-block id index. Returns SubstrateValidationResult with status (clean/warnings/invalid) and per-issue diagnostics.",
		promptSnippet: "Validate substrate relations against config + items",
		examples: [`pi-context context-validate-relations --json`],
		parameters: Type.Object({}),
		surface: "use",
		run(cwd: string, _params: Record<string, never>): OpResult {
			const result = validateContextRelations(cwd);
			return { json: result };
		},
	},
	{
		name: "context-edges-for-lens",
		label: "Context Edges For Lens",
		description:
			"Materialize the Edge[] for a named lens — synthetic edges from derived_from_field for auto-derived lenses; authored edges filtered by relation_type for hand-curated lenses; unioned items from composition members for kind=composition lenses.",
		promptSnippet: "Materialize edges for a named lens (auto-derived or hand-curated)",
		examples: [`pi-context context-edges-for-lens --lensId feature-decomposition --json`],
		parameters: Type.Object({
			lensId: Type.String({ description: "Lens id from config.lenses[].id" }),
		}),
		surface: "use",
		run(cwd: string, params: { lensId: string }): OpResult {
			const result = edgesForLensByName(cwd, params.lensId);
			const read = structureForRead(result, { label: `edges for lens ${params.lensId}` });
			return { read };
		},
	},
	{
		name: "context-lens-view",
		label: "Context Lens View",
		description:
			"Project a config-declared lens (config.lenses[]) as a binned item-view. Without --bin, a bin->count summary (always under the read cap). With --bin, that bin's items paged by --offset/--limit. Serves target, composition, and hand-curated lenses.",
		promptSnippet:
			"Project a config-declared lens as a binned item-view — bin->count summary, or one bin's items paged",
		examples: [
			`pi-context context-lens-view --lensId gaps-by-status --json`,
			`pi-context context-lens-view --lensId gaps-by-status --bin identified --limit 20 --json`,
		],
		parameters: Type.Object({
			lensId: Type.String({ description: "Lens id from config.lenses[].id" }),
			bin: Type.Optional(Type.String({ description: "Return this bin's items paged; omit for a bin->count summary" })),
			offset: Type.Optional(Type.Integer({ minimum: 0, description: "Per-bin page start index (default 0)" })),
			limit: Type.Optional(Type.Integer({ minimum: 1, description: "Per-bin page size (default 50)" })),
		}),
		surface: "use",
		run(cwd: string, params: { lensId: string; bin?: string; offset?: number; limit?: number }): OpResult {
			const view = loadLensView(cwd, params.lensId);
			if ("error" in view) throw new Error(view.error); // unknown lens / no-config -> non-zero exit
			if (params.bin !== undefined) {
				const items = view.grouped.get(params.bin);
				if (items === undefined)
					throw new Error(
						`Bin '${params.bin}' not declared on lens '${params.lensId}'. Bins: ${view.lens.bins.join(", ")}`,
					);
				const page = pageArray(items, { offset: params.offset, limit: params.limit });
				return { read: structureForRead(page, { whole: true, label: `lens ${params.lensId} bin ${params.bin}` }) };
			}
			const summary = {
				lens: view.lens.id,
				kind: view.lens.kind ?? "target",
				bins: Object.fromEntries(view.lens.bins.map((b) => [b, (view.grouped.get(b) ?? []).length])),
				uncategorized: view.uncategorized.length,
				total: view.items.length,
			};
			return { read: structureForRead(summary, { whole: true, label: `lens ${params.lensId} bins` }) };
		},
	},
	{
		name: "context-walk-descendants",
		label: "Context Walk Descendants",
		description:
			"Walk closure-table descendants of a parent id under a given relation_type. Returns string[] of descendant ids (may be empty if no children or relations.json absent). For a DISJOINT-kind relation, querying from the wrong (target-kind) end THROWS naming walk-ancestors instead of silently returning []; same-kind / wildcard relations return [] honestly.",
		promptSnippet: "Walk closure-table descendants under a relation_type",
		examples: [
			`pi-context context-walk-descendants --parentId FEAT-008 --relationType feature_decomposed_into_task --json`,
		],
		parameters: Type.Object({
			parentId: Type.String({ description: "Parent id (canonical id or lens bin name)" }),
			relationType: Type.String({ description: "Relation type from config.relation_types[].canonical_id" }),
		}),
		surface: "use",
		run(cwd: string, params: { parentId: string; relationType: string }): OpResult {
			const result = walkLensDescendants(cwd, params.parentId, params.relationType);
			return { json: result };
		},
	},
	{
		name: "walk-ancestors",
		label: "Walk Ancestors",
		description:
			"Walk closure-table ancestors of an item id under a given relation_type — reverse-direction counterpart to context-walk-descendants. Returns string[] of ancestor ids (may be empty if no parents or relations.json absent). For a DISJOINT-kind relation, querying from the wrong (source-kind) end THROWS naming context-walk-descendants instead of silently returning []; same-kind / wildcard relations return [] honestly.",
		promptSnippet: "Walk closure-table ancestors under a relation_type",
		examples: [`pi-context walk-ancestors --itemId TASK-042 --relationType feature_decomposed_into_task --json`],
		parameters: Type.Object({
			itemId: Type.String({ description: "Child item id whose ancestors are sought" }),
			relationType: Type.String({ description: "Relation type from config.relation_types[].canonical_id" }),
		}),
		surface: "use",
		run(cwd: string, params: { itemId: string; relationType: string }): OpResult {
			const result = walkAncestorsByLens(cwd, params.itemId, params.relationType);
			const read = structureForRead(result, { label: `ancestors of ${params.itemId}` });
			return { read };
		},
	},
	{
		name: "find-references",
		label: "Find References",
		description:
			"Find all closure-table edges incident on an item id (inbound, outbound, or both). Returns Edge[] preserving relation_type + ordinal per record — edge-level view, not the id-chain projection that walk-ancestors / context-walk-descendants emit.",
		promptSnippet: "Find closure-table edges incident on an item id",
		examples: [`pi-context find-references --itemId TASK-001 --direction both --json`],
		parameters: Type.Object({
			itemId: Type.String({ description: "Item id whose incident edges are sought" }),
			direction: Type.Optional(
				Type.Union([Type.Literal("inbound"), Type.Literal("outbound"), Type.Literal("both")], {
					description:
						"inbound: edges where child === itemId; outbound: edges where parent === itemId; both: union (default).",
				}),
			),
		}),
		surface: "use",
		run(cwd: string, params: { itemId: string; direction?: "inbound" | "outbound" | "both" }): OpResult {
			const result = findReferencesInRepo(cwd, params.itemId, params.direction);
			const read = structureForRead(result, { label: `edges on ${params.itemId}` });
			return { read };
		},
	},
	{
		name: "gather-execution-context",
		label: "Gather Execution Context",
		description:
			"Compose a ContextBundle for a work-unit by reading its context-contract (by unit_kind) and walking declared relation_types bidirectionally per direction semantic. Returns unit + perRelationType buckets of resolved items + traversal_depth + scoped_at. Substrate primitive serving harness-confined dispatch.",
		promptSnippet: "Compose ContextBundle for unit + context-contract-declared bundle_relation_types",
		examples: [`pi-context gather-execution-context --unitId TASK-001 --kind task --json`],
		parameters: Type.Object({
			unitId: Type.String({ description: "Work-unit id (e.g. TASK-NNN / DEC-NNNN / FGAP-NNN)" }),
			kind: Type.String({
				description:
					"Unit-kind type tag (e.g. 'task', 'decision', 'verification') matching a context-contract entry's unit_kind",
			}),
			maxDepth: Type.Optional(
				Type.Integer({
					minimum: 1,
					description: "Override per-relation-type max_depth via Math.min against each spec.max_depth",
				}),
			),
		}),
		surface: "use",
		run(cwd: string, params: { unitId: string; kind: string; maxDepth?: number }): OpResult {
			const result = gatherExecutionContext(cwd, params);
			// whole: a structured ContextBundle (unit + perRelationType buckets) —
			// preserve the bundle shape rather than paging any single inner array.
			const read = structureForRead(result, { whole: true, label: `bundle ${params.unitId}` });
			return { read };
		},
	},
	{
		name: "context-roadmap-load",
		label: "Context: load roadmap",
		description:
			"Load the derived roadmap view over the milestone_precedes_milestone DAG: milestone-block items topo-ordered by the authored precedes edges (order + cycles), each milestone carrying its derived `status`/phaseCount (currentState's milestone rollup — `status` is the authoritative completeness verdict), its member phases (parents of phase_positioned_in_milestone edges, each with its authored phase `status`), each phase's tasks (parents of task_positioned_in_phase edges), and per-phase + per-milestone `taskProgress` (a task-status aggregation for PROGRESS display ONLY — NOT a completeness verdict; read `status` for completeness, never taskProgress). Adjacency comes strictly from the authored edges — never inferred from order. Zero milestones is a valid empty view.",
		promptSnippet: "Load the derived milestone roadmap view",
		examples: [`pi-context context-roadmap-load --json`],
		parameters: Type.Object({}),
		surface: "use",
		run(cwd: string, _params: Record<string, never>): OpResult {
			const view = loadRoadmap(cwd);
			// whole: a structured MilestoneRoadmapView (milestones + rollups + edges)
			// — keep the view shape intact rather than paging an inner array.
			const read = structureForRead(view, { whole: true, label: "roadmap (derived)" });
			return { read };
		},
	},
	{
		name: "context-roadmap-render",
		label: "Context: render roadmap",
		description:
			"Render the derived roadmap as pure-textual markdown — milestone order list (topo over the authored milestone_precedes_milestone edges), per-milestone sections with **Preceded by:** adjacency lines sourced strictly from those edges (alphabetically sorted; '—' when none), per-milestone **Task progress:** counts (a task-status aggregation for progress display only — the completeness verdict is the milestone/phase `status` printed in the section heading, not the task-progress counts), and per-phase task tables. Cycle participants surface under a separate heading with a Cycles-detected line. NO mermaid / graph syntax; adjacency is never inferred from order consecutive pairs.",
		promptSnippet: "Render the derived milestone roadmap as markdown",
		examples: [`pi-context context-roadmap-render`],
		parameters: Type.Object({}),
		surface: "use",
		run(cwd: string, _params: Record<string, never>): OpResult {
			const view = loadRoadmap(cwd);
			if ("error" in view) {
				return { json: view };
			}
			return renderRoadmap(view);
		},
	},
	{
		name: "context-roadmap-validate",
		label: "Context: validate roadmap",
		description:
			"Validate the derived roadmap over the milestone_precedes_milestone edges. Error codes: roadmap_precedes_endpoint_missing (a precedes-edge endpoint that is not a milestone-block item), roadmap_milestone_cycle (a cycle in the precedes graph), roadmap_milestone_missing (a phase_positioned_in_milestone edge whose child is not a known milestone). Warning: roadmap_status_unknown_value (a member phase whose task-progress rollup buckets unknown with tasks present — a task-progress / data-quality warning, NOT a completeness check). Info: roadmap_milestone_isolated (a milestone with zero precedes edges while others are ordered) — info never affects status: invalid iff any error-code issue, warnings iff any warning-code issue, else clean. Display strings flow through config.display_strings (pi-context divergence).",
		promptSnippet: "Validate the derived milestone roadmap",
		examples: [`pi-context context-roadmap-validate --json`],
		parameters: Type.Object({}),
		surface: "use",
		run(cwd: string, _params: Record<string, never>): OpResult {
			return { json: validateRoadmap(cwd) };
		},
	},
];

/**
 * The pi-context-owned set of tool names that require human-authorization at
 * the pi-agent-dispatch tool_call gate. Derived from the registry's authGated
 * flags rather than hand-maintained, so a single source — the OpDefinition's
 * authGated field — names both the CLI's credentialed-confirmation hint and the
 * gate's aggregated allowlist. pi-agent-dispatch imports this via the `./ops`
 * subpath and folds it into AUTH_REQUIRED_TOOLS alongside the other packages'
 * owned sets. The gate at the pi-agent-dispatch layer remains the enforcement
 * point; this list is the source of pi-context's contribution to it.
 */
export const gatedTools: string[] = ops.filter((o) => o.authGated).map((o) => o.name);

/**
 * One entry on the {@link INTENTIONALLY_UNEXPOSED_WRITERS} allowlist. `libraryFn`
 * names a library write function deliberately NOT given its own op; exactly one
 * of `safeOp` / `reason` carries the justification (`safeOp` when a safe op
 * supersedes the raw writer; `reason` for internal/foreign-only writers with no
 * op surface at all).
 */
export interface UnexposedWriter {
	libraryFn: string;
	reason?: string;
	safeOp?: string;
}

/**
 * The non-exposure allowlist for the op-surface ↔ library-write-surface
 * coverage contract: every library write function that is
 * deliberately NOT op-backed, with the reason it is withheld. This is the
 * closure contract γ (the library↔op-registry↔orchestrator-script parity/coverage
 * test) WILL consume: γ's parity test — not yet written
 * (no executable parity test exists in β; β defines the contract, γ implements
 * the test against it) — WILL assert that EVERY library writer is either op-backed
 * (appears in {@link ops}, directly or transitively) OR named here, so a
 * newly-added library writer with neither an op nor an allowlist entry will fail
 * that test, keeping the op surface and the library write surface in lockstep.
 *
 * The `*ForDir` twins of op-backed writers (e.g. `appendRelationForDir`,
 * `writeRelationsForDir`, `upsertItemInBlockForDir`, `appendToBlockForDir`, …)
 * are NOT enumerated individually: each is the dir-targeted internal twin of a
 * cwd-form writer that IS op-backed, and is covered by that cwd-form op (the op
 * resolves the active substrate dir then delegates to the same shared
 * typed-file primitive the `*ForDir` twin calls). The contract is that γ's
 * parity test (the library↔op-registry↔orchestrator-script parity/coverage
 * test, not yet written) WILL treat a `*ForDir` writer as
 * covered when its cwd-form sibling is covered.
 */
export const INTENTIONALLY_UNEXPOSED_WRITERS: UnexposedWriter[] = [
	{
		libraryFn: "convergeDerivedStatusAfterWrite",
		reason:
			"post-write convergence hook, invoked by the CONVERGE_AFTER_OPS module-init wrapper around every rollup-input-mutating op's run() — op-backed transitively at runtime, but the static classifier cannot see a wrapper-installed call; its explicit ceremony surface is context-reconcile",
	},
	{ libraryFn: "writeConfig", safeOp: "amend-config", reason: "scoped guarded config mutation" },
	{ libraryFn: "writeSchema", safeOp: "write-schema", reason: "raw bypasses the create/replace + migration check" },
	{ libraryFn: "updateSchema", safeOp: "write-schema", reason: "no mutator-scripting surface" },
	{ libraryFn: "writeBootstrapPointer", safeOp: "context-init", reason: "raw bypasses target validation" },
	{ libraryFn: "flipBootstrapPointer", safeOp: "context-switch", reason: "raw splits the safe switch" },
	{ libraryFn: "writeRegistry", reason: "internal; registry writes flow through registerSubstrate callers" },
	{
		libraryFn: "registerSubstrate",
		reason: "manual/foreign registration is the clone arc (DEC-0002); normal paths auto-register",
	},
	{
		libraryFn: "rollbackBlockFiles",
		reason:
			"workflow-executor transactional rollback (graduated-failure undo); internal recovery path with no operator-facing op by design",
	},
];

/**
 * The five mutually-exhaustive ways a library write function is COVERED by the
 * op-surface ↔ library-write-surface parity contract (ensuring every library
 * write function is either op-backed or explicitly, deliberately withheld with
 * a stated reason). A writer that
 * matches NONE of these is a silent gap that γ's parity test (the
 * library↔op-registry↔orchestrator-script coverage check) — once
 * written — MUST fail on. Coverage is the DISJUNCTION over these classes — a
 * writer needs ANY one, not all.
 */
export enum CoverageClass {
	/** An op's `run` calls the writer directly (e.g. `append-block-item` → `appendToBlock`). */
	OpBackedDirect = "op-backed-direct",
	/**
	 * An op's `run` reaches the writer TRANSITIVELY — through any helper / wrapper
	 * chain, not just a direct call. Two sub-shapes both land here:
	 *   - `*ByRef` / SDK relation porcelain: the `remove-relation` / `replace-relation`
	 *     / `append-relations` ops call `removeRelationByRef` / `replaceRelationByRef`
	 *     / `appendRelationsByRef`, which call `writeRelations`.
	 *   - init / switch → internal-helper chains: `context-init` → `initProject` →
	 *     `writeSkeletonConfig`; `context-switch` → `switchToExisting` /
	 *     `switchAndCreate` → `reconcileActiveSubstrateRegistration`. The writer is
	 *     not a `*ByRef` porcelain and is not allowlisted, but it IS reachable from an
	 *     op's `run` via a helper the op calls.
	 * Coverage condition: reachable from some op's `run` via any helper/wrapper chain.
	 */
	OpBackedTransitive = "op-backed-transitive",
	/**
	 * A `*ForDir` dir-targeted twin of a covered cwd-form writer (e.g.
	 * `appendToBlockForDir` is the twin of the op-backed `appendToBlock`). Covered
	 * by its cwd-form sibling — both delegate to the same shared typed-file
	 * primitive; the cwd-form op resolves the active dir then calls it.
	 */
	ForDirTwin = "for-dir-twin",
	/**
	 * On {@link INTENTIONALLY_UNEXPOSED_WRITERS}: a raw write deliberately given NO
	 * direct op (a scoped op supersedes it, or it is internal/foreign-only).
	 */
	IntentionallyUnexposed = "intentionally-unexposed",
	/**
	 * A block-api internal primitive below the op layer — the `*TypedFile` read/
	 * write layer (`readTypedFile` / `writeTypedFile`), `prepareItemIdentityForWrite`,
	 * and the identity / content-hash helpers. Never op-backed by design; the ops
	 * compose over these.
	 */
	InternalPrimitive = "internal-primitive",
}

/**
 * One clause of {@link OP_COVERAGE_RULE}: a coverage class plus the human-readable
 * test γ applies to decide whether a writer falls in it.
 */
export interface CoverageClause {
	coverageClass: CoverageClass;
	test: string;
}

/**
 * The coverage RULE for the op-surface ↔ library-write-surface parity
 * contract, made explicit so γ (the library↔op-registry↔orchestrator-script
 * parity/coverage test) will import the
 * contract rather than re-derive it. A library write function is COVERED iff it
 * matches ANY clause below (the disjunction); a writer matching none is a silent
 * gap that γ's parity test — when written — MUST fail on. β fixes the contract
 * here; no executable parity test exists yet (that is γ).
 *
 * Why `writeConfig` is allowlisted but `writeRelations` is NOT — the distinction
 * a strict name-parity reading mis-saw as inconsistent:
 *   - `writeConfig` has NO direct wholesale-config op. The scoped surface is
 *     `amend-config` (one-entry-in-one-registry add/replace/remove, AJV-validated),
 *     which deliberately does NOT expose a raw whole-config overwrite. So
 *     `writeConfig` is `intentionally-unexposed` (the scoped op supersedes the raw
 *     writer; a raw wholesale overwrite is withheld by design).
 *   - `writeRelations` IS reached — transitively — by the relation ops:
 *     `remove-relation` / `replace-relation` / `append-relations` call
 *     `removeRelationByRef` / `replaceRelationByRef` / `appendRelationsByRef`, each
 *     of which calls `writeRelations`. It is therefore `op-backed-transitive`
 *     and needs NO allowlist entry. The asymmetry is real and correct: one writer
 *     has an op path (via a helper/wrapper chain), the other does not.
 *
 * The `op-backed-transitive` clause covers BOTH the `*ByRef` relation porcelain
 * AND the init/switch → internal-helper chains: `writeSkeletonConfig` (reached
 * via `context-init` → `initProject`) and `reconcileActiveSubstrateRegistration`
 * (reached via `context-switch` → `switchToExisting` / `switchAndCreate`) are
 * neither `*ByRef` porcelain nor allowlisted, yet each is reachable from an op's
 * `run` through a helper that op calls — so each classifies cleanly as
 * `op-backed-transitive`, not as a gap.
 */
export const OP_COVERAGE_RULE: CoverageClause[] = [
	{
		coverageClass: CoverageClass.OpBackedDirect,
		test: "an op's run() calls the writer directly",
	},
	{
		coverageClass: CoverageClass.OpBackedTransitive,
		test: "reachable from some op's run() via any helper/wrapper chain — the *ByRef / SDK relation porcelain (writeRelations via removeRelationByRef / replaceRelationByRef / appendRelationsByRef) OR an init/switch → internal-helper chain (writeSkeletonConfig via context-init → initProject; reconcileActiveSubstrateRegistration via context-switch → switchToExisting / switchAndCreate)",
	},
	{
		coverageClass: CoverageClass.ForDirTwin,
		test: "a *ForDir twin of a covered cwd-form writer (covered by its cwd-form sibling)",
	},
	{
		coverageClass: CoverageClass.IntentionallyUnexposed,
		test: "named on INTENTIONALLY_UNEXPOSED_WRITERS — a raw bypass with no direct op",
	},
	{
		coverageClass: CoverageClass.InternalPrimitive,
		test: "a block-api internal primitive below the op layer (the *TypedFile layer, prepareItemIdentityForWrite, identity / content-hash helpers)",
	},
];

/**
 * The factory PI handle captured at registerAll time. The list-tools op needs
 * the introspection surface (getAllTools / getActiveTools) which lives on
 * ExtensionAPI, not on the per-call ExtensionContext. Captured once when the
 * extension registers its tools; null until then. Module-scoped here so the
 * op `run` closures (which receive only cwd + params) can reach it without
 * threading the handle through every signature.
 */
let boundPi: ExtensionAPI | null = null;

/**
 * Build the DispatchContext threaded into an op's `run` from the in-pi tool
 * execute boundary (registerAll). Two derivation branches:
 *
 *   - When `params.writer.user` is a non-empty string — the shape the
 *     pi-agent-dispatch auth-gate stamps onto authGated op params on operator
 *     confirm — the writer is a human identity. (The smuggle-ops promote-item /
 *     write-schema-migration / context-switch carry a `writer` schema field
 *     precisely so the gate has somewhere to stamp; this converts that field
 *     into the contract ctx the op now consumes via its 3rd `run` arg.)
 *   - Otherwise the writer is the running agent, identified by the active
 *     model's id (`ExtensionContext.model.id`); falls back to "pi-agent" when
 *     no model (or no id) is resolvable.
 *
 * Exported for unit testing — the two branches are asserted directly against
 * synthetic params + a minimal ExtensionContext-shaped object.
 */
export function buildDispatchContextFromExecute(
	params: unknown,
	extCtx: { model?: { id?: string } | undefined },
): DispatchContext {
	const writerUser = (params as { writer?: { user?: unknown } } | null | undefined)?.writer?.user;
	if (typeof writerUser === "string" && writerUser.length > 0) {
		return { writer: { kind: "human", user: writerUser } };
	}
	const modelId = extCtx.model?.id;
	return { writer: { kind: "agent", agent_id: modelId && modelId.length > 0 ? modelId : "pi-agent" } };
}

/**
 * Converge-on-write — part of currency-by-construction (stored substrate state
 * never silently diverging from what's derivable), closing the earlier gap
 * where a milestone's rollup status could be simultaneously "reached" by live
 * derivation and still gate-block its own tasks via a stale stored status: the
 * sanctioned mutating
 * ops that can change a rollup INPUT (a member item's status; a membership
 * edge; an id every edge keys on) run the derived-status convergence hook
 * AFTER their own write lands — so every op-surface write leaves rollup-kind
 * stored statuses equal to their derivation. The hook is config-driven
 * opt-in (no derived-status invariant → empty set → no writes) and
 * best-effort (its failure never fails the landed write; the invariant +
 * context-reconcile remain the net — see convergeDerivedStatusAfterWrite).
 * Nested-item ops are excluded: item statuses are top-level fields, so a
 * nested write cannot change a rollup input. Wrapping happens ONCE here at
 * module init, over the ops DATA — no per-op body edits, no dispatch-path
 * fork; both consumers (registerAll pi tools + the reflecting CLI) execute
 * the wrapped run.
 */
const CONVERGE_AFTER_OPS = new Set([
	"append-block-item",
	"upsert-block-item",
	"update-block-item",
	"remove-block-item",
	"write-block",
	"complete-task",
	"append-relation",
	"append-relations",
	"remove-relation",
	"replace-relation",
	"rename-canonical-id",
	"promote-item",
]);

/**
 * Evaluate every config invariant against the substrate's current state,
 * keyed per violation instance (`code|field`) for delta comparison. Returns
 * null when the substrate is unreadable or declares no invariants — the gate
 * is config-driven opt-in and NEVER breaks a write on legacy/undeclared
 * substrates. Uses the SAME evaluateConfigInvariants path validateContext
 * runs, so write-side and validate-side verdicts are identical (the same
 * write/validate-parity lift pattern used for edge kind/category checks).
 */
function invariantSnapshot(cwd: string): Map<string, { severity: string; message: string }> | null {
	try {
		const config = loadConfig(cwd);
		if (!config || (config.invariants ?? []).length === 0) return null;
		const index = buildIdIndex(cwd);
		const relations = loadRelations(cwd);
		const issues = evaluateConfigInvariants(cwd, config, index, relations);
		return new Map(issues.map((i) => [`${i.code}|${i.field ?? ""}`, { severity: i.severity, message: i.message }]));
	} catch {
		return null;
	}
}

/** Snapshot every top-level substrate *.json for a byte-exact refusal restore. */
function substrateJsonSnapshot(cwd: string): { dir: string; files: Map<string, Buffer> } | null {
	try {
		const dir = tryResolveContextDir(cwd);
		if (dir === null) return null;
		const files = new Map<string, Buffer>();
		for (const name of fs.readdirSync(dir)) {
			if (!name.endsWith(".json")) continue;
			files.set(name, fs.readFileSync(path.join(dir, name)));
		}
		return { dir, files };
	} catch {
		return null;
	}
}

function restoreSubstrateJson(snapshot: { dir: string; files: Map<string, Buffer> }): void {
	for (const name of fs.readdirSync(snapshot.dir)) {
		if (!name.endsWith(".json")) continue;
		if (!snapshot.files.has(name)) fs.unlinkSync(path.join(snapshot.dir, name));
	}
	for (const [name, bytes] of snapshot.files) {
		fs.writeFileSync(path.join(snapshot.dir, name), bytes);
	}
}

/** Attach write-side warnings to an op result without disturbing its shape class. */
function attachWriteWarnings(result: OpResult, warnings: string[]): OpResult {
	if (typeof result === "string") {
		return `${result}\n${warnings.map((w) => `write-warning: ${w}`).join("\n")}`;
	}
	if (result !== null && typeof result === "object" && "json" in result) {
		const jsonValue = (result as { json: unknown }).json;
		if (jsonValue !== null && typeof jsonValue === "object" && !Array.isArray(jsonValue)) {
			return { ...result, json: { ...(jsonValue as Record<string, unknown>), writeWarnings: warnings } };
		}
	}
	return result;
}

/**
 * The write pipeline — part of currency-by-construction, combining rollup
 * convergence and write-time invariant checks in one module-init pass over the
 * ops DATA; both consumers — registerAll pi tools and the reflecting CLI —
 * execute the wrapped run):
 *
 *  1. CONVERGE-ON-WRITE: after the op's write lands, rollup-kind stored
 *     statuses are converged with their derivation (config-driven opt-in;
 *     best-effort — see convergeDerivedStatusAfterWrite). Runs BEFORE the
 *     gate evaluation so the gate judges the final converged state and a
 *     divergence the convergence itself repairs is never flagged.
 *  2. DELTA-SCOPED WRITE-TIME INVARIANT GATE: the config invariants are
 *     evaluated before and after the write through the SAME helper
 *     validateContext uses. Only violations ABSENT before and PRESENT after
 *     (newly introduced by this write) act: error severity REFUSES the write
 *     — every top-level substrate *.json is byte-restored from the pre-write
 *     snapshot and the op throws naming the violations; warning severity is
 *     surfaced on the op result (appended `write-warning:` lines on string
 *     results; a `writeWarnings` array inside {json} object payloads).
 *     Pre-existing violations never block or warn — legacy substrates stay
 *     fully writable (the delta scope IS the expand-contract analogue).
 *
 *  3. ALL-OR-NOTHING ON THROW: an inner-op throw mid-composite (a birth edge
 *     failing after the item landed; complete-task's status flip failing
 *     after its edge landed) byte-restores the substrate from the same
 *     pre-write snapshot before rethrowing, so a composite op never persists
 *     a partial write the gate did not judge.
 *
 * dryRun invocations (append-relations --dryRun) preview without writing and
 * bypass the pipeline entirely. Ops THROW on failure and return success
 * strings / {json} on success, so any settled return means the write landed;
 * sync/async contracts are preserved per op. Nested-item ops are excluded
 * (item statuses are top-level fields).
 */
for (const op of ops) {
	if (!CONVERGE_AFTER_OPS.has(op.name)) continue;
	const inner = op.run.bind(op);
	op.run = (cwd, params, ctx) => {
		const isDryRun = (params as { dryRun?: unknown }).dryRun === true;
		const pre = isDryRun ? null : invariantSnapshot(cwd);
		const snapshot = pre === null ? null : substrateJsonSnapshot(cwd);
		const finish = (settled: OpResult): OpResult => {
			if (isDryRun) return settled;
			convergeDerivedStatusAfterWrite(cwd, ctx);
			if (pre === null) return settled;
			const post = invariantSnapshot(cwd);
			if (post === null) return settled;
			const fresh = [...post].filter(([key]) => !pre.has(key));
			if (fresh.length === 0) return settled;
			const freshErrors = fresh.filter(([, v]) => v.severity === "error");
			if (freshErrors.length > 0 && snapshot !== null) {
				restoreSubstrateJson(snapshot);
				throw new Error(
					`${op.name} refused — the write would introduce ${freshErrors.length} invariant violation(s) (substrate restored byte-exact): ${freshErrors
						.map(([, v]) => v.message)
						.join("; ")}`,
				);
			}
			const freshWarnings = fresh.filter(([, v]) => v.severity !== "error").map(([, v]) => v.message);
			return freshWarnings.length > 0 ? attachWriteWarnings(settled, freshWarnings) : settled;
		};
		// Op-level all-or-nothing: an inner-op throw MID-COMPOSITE (e.g. a birth
		// edge or the complete-task status flip failing after an earlier write in
		// the same run landed) byte-restores the whole substrate before
		// rethrowing — without this, partial writes persist in states the gate
		// never judged. Restore is snapshot-gated like the refusal path (null on
		// dryRun / no-invariant substrates) and idempotent if finish() already
		// restored on a gate refusal.
		const restoreAndRethrow = (err: unknown): never => {
			if (snapshot !== null) restoreSubstrateJson(snapshot);
			throw err;
		};
		let result: OpResult | Promise<OpResult>;
		try {
			result = inner(cwd, params, ctx);
		} catch (err) {
			return restoreAndRethrow(err);
		}
		return result instanceof Promise ? result.then(finish, restoreAndRethrow) : finish(result);
	};
	op.description +=
		" Write pipeline: after this op's write, rollup-kind stored statuses converge with their derivation, and the config invariants are re-evaluated delta-scoped — a violation newly introduced by this write refuses it at error severity (substrate byte-restored) or is surfaced on the result at warning severity (write-warning lines / writeWarnings); pre-existing violations never block.";
}

/**
 * Register every op in `ops` as a pi tool. Each tool's execute body is the
 * uniform wrapper around the op's run(): coerce params, build the attestation
 * DispatchContext from the auth-gate-stamped writer (human) or the running
 * model (agent), await run, place the returned string at content[0].text.
 */
export function registerAll(pi: ExtensionAPI): void {
	boundPi = pi;
	for (const op of ops) {
		pi.registerTool({
			name: op.name,
			label: op.label,
			description: op.description,
			promptSnippet: op.promptSnippet,
			parameters: op.parameters,
			async execute(
				_toolCallId: string,
				params: unknown,
				_signal: AbortSignal,
				_onUpdate: AgentToolUpdateCallback,
				ctx: ExtensionContext,
			): Promise<AgentToolResult<undefined>> {
				const dctx = buildDispatchContextFromExecute(params, ctx);
				return {
					details: undefined,
					content: [{ type: "text", text: renderOpResultText(await op.run(ctx.cwd, params as never, dctx)) }],
				};
			},
		});
	}
}
