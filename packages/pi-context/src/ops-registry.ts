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
	writeBlock,
} from "./block-api.js";
import { type AdoptResult, adoptConception, amendConfigEntry, loadConfig, loadContext } from "./context.js";
import { BootstrapNotFoundError, schemaPath, tryResolveContextDir } from "./context-dir.js";
import {
	appendRelationByRef,
	completeTask,
	contextState,
	currentState,
	deriveBootstrapState,
	filterBlockItems,
	type ItemLocation,
	joinBlocks,
	readBlockItem,
	readBlockPage,
	resolveItemById,
	resolveItemsByIds,
	validateContext,
} from "./context-sdk.js";
import { gatherExecutionContext } from "./execution-context.js";
// initProject + the switch/list/archive helpers are defined in index.ts (shared
// with the /context command handlers + the context-* tools). This is a cyclic
// import: index.ts imports registerAll from here. The cycle is safe at runtime —
// registerAll runs at extension-load time, after both modules' top-level
// function bindings exist, and the helpers are only referenced inside op `run`
// closures (lazy), never at this module's top level.
import {
	archiveSubstrate,
	initProject,
	listSubstrates,
	switchAndCreate,
	switchToExisting,
	switchToPrevious,
} from "./index.js";
import {
	edgesForLensByName,
	findReferencesInRepo,
	validateContextRelations,
	walkAncestorsByLens,
	walkLensDescendants,
} from "./lens-view.js";
import { promoteItem } from "./promote-item.js";
import { addressInto, serializeForRead } from "./read-element.js";
import { renameCanonicalId } from "./rename-canonical-id.js";
import { listRoadmaps, loadRoadmap, type RoadmapView, renderRoadmap, validateRoadmaps } from "./roadmap-plan.js";
import { samplesCatalog } from "./samples-catalog.js";
import { readSchema, writeSchemaChecked } from "./schema-write.js";
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
export interface OpDefinition<P = any> {
	name: string;
	label: string;
	description: string;
	promptSnippet?: string;
	parameters: TSchema;
	run(cwd: string, params: P): string | Promise<string>;
	authGated?: boolean;
	surface: "use" | "process";
}

// ── serializeRoadmapView ────────────────────────────────────────────────────
// Strip non-serializable fields (suggestionTemplate fn, grouped Map) from the
// embedded LoadedLensView records before tool serialization. Relocated verbatim
// from the extension factory; consumed by the context-roadmap-load op.
const serializeRoadmapView = (view: RoadmapView): unknown => ({
	roadmap: view.roadmap,
	phases: view.phases.map((pv) => ({
		phase: pv.phase,
		lensView:
			"error" in pv.lensView
				? pv.lensView
				: {
						lens: pv.lensView.lens,
						items: pv.lensView.items,
						edges: pv.lensView.edges,
						grouped: Object.fromEntries(pv.lensView.grouped),
						uncategorized: pv.lensView.uncategorized,
					},
		status: pv.status,
		...(pv.milestone ? { milestone: pv.milestone } : {}),
		...(pv.milestoneSatisfied !== undefined ? { milestoneSatisfied: pv.milestoneSatisfied } : {}),
	})),
	phaseOrder: view.phaseOrder,
	cycles: view.cycles,
	edges: view.edges,
});

export const ops: OpDefinition[] = [
	{
		name: "append-block-item",
		label: "Append Block Item",
		description:
			"Append an item to an array in a project block file. Schema validation is automatic. Set autoId:true to allocate the next id from the block's id pattern when the item has no id.",
		promptSnippet: "Append items to project blocks (issues, decisions, or any user-defined block)",
		parameters: Type.Object({
			block: Type.String({ description: "Block name (e.g., 'issues', 'decisions')" }),
			arrayKey: Type.String({ description: "Array key in the block (e.g., 'issues', 'decisions')" }),
			item: Type.Unknown({ description: "Item object to append — must conform to block schema" }),
			autoId: Type.Optional(
				Type.Boolean({
					description: "When true and the item has no id, allocate the next id from the block's id pattern",
				}),
			),
		}),
		surface: "use",
		run(
			cwd: string,
			params: { block: string; arrayKey: string; item: Record<string, unknown>; autoId?: boolean },
		): string {
			// Type.Unknown() params may arrive as JSON strings — parse if needed
			if (typeof params.item === "string") {
				try {
					params.item = JSON.parse(params.item) as Record<string, unknown>;
				} catch {
					throw new Error(`item parameter must be a JSON object, got unparseable string`);
				}
			}
			// Auto-id allocation (FGAP-084 dual-surface twin of file-block-item --auto-id)
			if (params.autoId && params.item && typeof params.item === "object" && !params.item.id) {
				params.item.id = nextId(cwd, params.block);
			}
			// Id-uniqueness is enforced atomically inside appendToBlock's
			// withBlockLock critical section (block-api assertAppendIdUnique) —
			// the single enforcement point. The prior racy readBlock-then-append
			// tool-layer check was removed in favour of that library guard.
			appendToBlock(cwd, params.block, params.arrayKey, params.item);
			const id = params.item?.id ? ` '${params.item.id}'` : "";
			return `Appended item${id} to ${params.block}.${params.arrayKey}`;
		},
	},
	{
		name: "update-block-item",
		label: "Update Block Item",
		description: "Update fields on an item in a project block array. Finds by predicate field match.",
		promptSnippet: "Update items in project blocks — change status, add details, mark resolved",
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
		): string {
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
			);

			const matchDesc = matchEntries.map(([k, v]) => `${k}=${v}`).join(", ");
			return `Updated item (${matchDesc}) in ${params.block}.${params.arrayKey}: ${Object.keys(params.updates).join(", ")}`;
		},
	},
	{
		name: "append-relation",
		label: "Append Relation",
		description:
			"Append a closure-table relation (edge: parent, child, relation_type, optional ordinal) to relations.json. " +
			"Shape is AJV-validated; an exact-duplicate edge (same parent+child+relation_type) is a no-op. Reference " +
			"integrity (endpoints resolve, relation_type registered, no cycle) is NOT checked here — run context-validate " +
			"after. Creates relations.json if absent.",
		promptSnippet: "Create a relation/edge between two items (parent→child under a relation_type)",
		parameters: Type.Object({
			parent: Type.String({ description: "Canonical id (or lens bin name) of the parent endpoint" }),
			child: Type.String({ description: "Canonical id of the child endpoint" }),
			relation_type: Type.String({
				description: "Registered relation_type canonical_id / hierarchy edge type / lens id",
			}),
			ordinal: Type.Optional(Type.Integer({ description: "Optional sibling-ordering within (parent, relation_type)" })),
		}),
		surface: "use",
		run(cwd: string, params: { parent: string; child: string; relation_type: string; ordinal?: number }): string {
			// Cycle-5 porcelain: STRING selectors (bare refname / <alias>:<refname> /
			// lens-bin) are resolved to structured EdgeEndpoints and written via the
			// raw plumbing. The param surface stays string-typed; messaging uses the
			// raw selectors (params.*), not the resolved structured endpoints.
			const { appended } = appendRelationByRef(cwd, {
				parent: params.parent,
				child: params.child,
				relation_type: params.relation_type,
				...(params.ordinal !== undefined ? { ordinal: params.ordinal } : {}),
			});
			const ordinalNote = params.ordinal !== undefined ? ` (ordinal ${params.ordinal})` : "";
			return appended
				? `Appended relation ${params.parent} -[${params.relation_type}]-> ${params.child}${ordinalNote}`
				: `Relation ${params.parent} -[${params.relation_type}]-> ${params.child} already exists — no-op`;
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
		): string {
			if (!params.writer?.user) {
				throw new Error("promote-item: writer.user is required.");
			}
			const result = promoteItem(
				cwd,
				{
					source: params.source,
					destinationSubstrate: params.destinationSubstrate,
					...(params.newRefname !== undefined ? { newRefname: params.newRefname } : {}),
					...(params.dryRun !== undefined ? { dryRun: params.dryRun } : {}),
				},
				{ writer: { kind: "human", user: params.writer.user } },
			);
			return JSON.stringify(result, null, 2);
		},
	},
	{
		name: "append-block-nested-item",
		label: "Append Block Nested Item",
		description:
			"Append an item to a nested array on a parent-array item in a project block. Schema validation is automatic.",
		promptSnippet: "Append items to nested arrays inside parent items (e.g., findings inside a review)",
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
		): string {
			if (typeof params.item === "string") {
				try {
					params.item = JSON.parse(params.item) as Record<string, unknown>;
				} catch {
					throw new Error(`item parameter must be a JSON object, got unparseable string`);
				}
			}
			const matchEntries = Object.entries(params.match);
			const predicate = (i: Record<string, unknown>) => matchEntries.every(([k, v]) => i[k] === v);
			appendToNestedArray(cwd, params.block, params.arrayKey, predicate, params.nestedKey, params.item);
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
		): string {
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
		parameters: Type.Object({
			block: Type.String({ description: "Block name (e.g., 'issues')" }),
			arrayKey: Type.String({ description: "Top-level array key (e.g., 'issues')" }),
			match: Type.Record(Type.String(), Type.Unknown(), { description: "Fields to match (e.g., { id: 'ISSUE-NNN' })" }),
		}),
		surface: "use",
		run(cwd: string, params: { block: string; arrayKey: string; match: Record<string, unknown> }): string {
			const matchEntries = Object.entries(params.match);
			const predicate = (i: Record<string, unknown>) => matchEntries.every(([k, v]) => i[k] === v);
			const result = removeFromBlock(cwd, params.block, params.arrayKey, predicate);
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
		): string {
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
		parameters: Type.Object({
			subdir: Type.String({ description: "Subdirectory under the substrate dir (e.g., 'phases', 'schemas')" }),
		}),
		surface: "use",
		run(cwd: string, params: { subdir: string }): string {
			const result = readBlockDir(cwd, params.subdir);
			const envelope = serializeForRead(result, { label: `<substrate-dir>/${params.subdir}/` });
			return envelope.content;
		},
	},
	{
		name: "read-block",
		label: "Read Block",
		description: "Read a project block file as structured JSON.",
		promptSnippet: "Read a project block as structured JSON",
		parameters: Type.Object({
			block: Type.String({ description: "Block name (e.g., 'issues', 'tasks', 'requirements')" }),
		}),
		surface: "use",
		run(cwd: string, params: { block: string }): string {
			const result = readBlock(cwd, params.block);
			const envelope = serializeForRead(result, {
				label: `<substrate-dir>/${params.block}.json`,
				overCapDirective: {
					tool: "read-block-page",
					params: { block: params.block, offset: 0, limit: 50 },
					hint: "or read-block-item with id=<id>",
				},
			});
			return envelope.content;
		},
	},
	{
		name: "write-block",
		label: "Write Block",
		description: "Write or replace an entire project block with schema validation.",
		promptSnippet: "Write or replace a project block with schema validation",
		parameters: Type.Object({
			block: Type.String({ description: "Block name (e.g., 'project', 'architecture')" }),
			data: Type.Unknown({ description: "Complete block data — must conform to block schema" }),
		}),
		surface: "use",
		authGated: true,
		run(cwd: string, params: { block: string; data: unknown }): string {
			const data = typeof params.data === "string" ? JSON.parse(params.data) : params.data;
			writeBlock(cwd, params.block, data);
			return `Wrote block '${params.block}' successfully`;
		},
	},
	{
		name: "context-status",
		label: "Context Status",
		description: "Get derived context state — source metrics, block summaries, planning lifecycle status.",
		promptSnippet: "Get context state — source metrics, block summaries, planning lifecycle status",
		parameters: Type.Object({}),
		surface: "use",
		run(cwd: string, _params: Record<string, never>): string {
			const result = contextState(cwd);
			return JSON.stringify(result, null, 2);
		},
	},
	{
		name: "context-validate",
		label: "Context Validate",
		description: "Validate cross-block referential integrity — check that IDs referenced across blocks exist.",
		promptSnippet: "Validate cross-block referential integrity",
		parameters: Type.Object({}),
		surface: "use",
		run(cwd: string, _params: Record<string, never>): string {
			const result = validateContext(cwd);
			return JSON.stringify(result, null, 2);
		},
	},
	{
		name: "read-config",
		label: "Read Config",
		description:
			"Read the substrate config.json as structured JSON — vocabulary, lenses, relation_types, status_buckets, display_strings, layers, block_kinds, installed_schemas, installed_blocks. Address ONE registry/map via `registry` (e.g. relation_types) and ONE entry within it via `id` (canonical_id) instead of reading the whole config.",
		promptSnippet: "Read project config — vocabulary, lenses, relation_types, status_buckets",
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
		run(cwd: string, params: { registry?: string; id?: string }): string {
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
					const envEntry = serializeForRead(entry.value, { label: `config.${params.registry}.${params.id}` });
					return envEntry.content;
				}
				const envReg = serializeForRead(reg.value, {
					label: `config.${params.registry}`,
					overCapDirective: {
						tool: "read-config",
						params: { registry: params.registry },
						hint: "add id=<entry canonical_id>",
					},
				});
				return envReg.content;
			}

			const result = { config, configPath };
			const envelope = serializeForRead(result, {
				label: configPath ?? "config.json",
				overCapDirective: {
					tool: "read-config",
					hint: "registry=<name> (block_kinds|relation_types|lenses|invariants|…)",
				},
			});
			return envelope.content;
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
		run(_cwd: string, params: { name?: string }): string {
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
				const envOne = serializeForRead(tool, { label: `tool ${params.name}` });
				return envOne.content;
			}

			// Default: compact index (FGAP-101) — name + param count + one-line description.
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
			const envelope = serializeForRead(result, {
				label: "tool index — pass name= for detail",
				overCapDirective: { tool: "list-tools", hint: "name=<tool>" },
			});
			return envelope.content;
		},
	},
	{
		name: "read-samples-catalog",
		label: "Read Samples Catalog",
		description:
			"Enumerate installable sample block kinds (packaged view): per kind — title, description, item shape, applicable relation_types (as source/target), invariants, lenses — plus top-level relation_type/lens/invariant/layer/status_bucket registries. Package-intrinsic: reads the extension's bundled samples catalog, independent of any project. Optional `kind` returns one packaged kind.",
		promptSnippet: "Discover installable sample block kinds — title, shape, relation_types, invariants, lenses",
		parameters: Type.Object({
			kind: Type.Optional(Type.String({ description: "Filter to one block_kind canonical_id (e.g. 'tasks')" })),
		}),
		surface: "use",
		run(_cwd: string, params: { kind?: string }): string {
			// Package-intrinsic: the catalog reads the extension's bundled samples
			// directory, not the project substrate — cwd is unused.
			const catalog = samplesCatalog(params.kind ? { kind: params.kind } : undefined);
			const envelope = serializeForRead(catalog, {
				label: params.kind ? `samples kind=${params.kind}` : "samples catalog",
				// Whole catalog → narrow by kind; a single kind has no finer
				// addressing (edge → head-leading marker, no directive).
				...(params.kind ? {} : { overCapDirective: { tool: "read-samples-catalog", hint: "kind=<canonical_id>" } }),
			});
			return envelope.content;
		},
	},
	{
		name: "context-current-state",
		label: "Context Current State",
		description:
			"Derive 'where are we + what's next' purely from the substrate — focus, in-flight tasks, ranked atomic-next actions (open framework-gaps then unblocked planned tasks), and blocked tasks. No writes; nothing hand-stored.",
		promptSnippet: "Derive current project state — focus, in-flight, next actions, blocked",
		parameters: Type.Object({}),
		surface: "use",
		run(cwd: string, _params: Record<string, never>): string {
			const state = currentState(cwd);
			return JSON.stringify(state, null, 2);
		},
	},
	{
		name: "context-bootstrap-state",
		label: "Context Bootstrap State",
		description:
			"Derive the substrate bootstrap state for the cwd, purely from the filesystem: 'no-pointer' | 'no-config' | 'not-installed' | 'ready', plus the resolved contextDir and any declared-but-unmaterialized installed assets. Unlike every other tool, this NEVER throws on an un-bootstrapped substrate — it returns 'no-pointer' so you can detect a fresh substrate and tell the user to run /context init <substrate-dir> → /context accept-all → /context install (bootstrap requires user authorization via interactive confirmation). No writes.",
		promptSnippet:
			"Derive substrate bootstrap state — no-pointer | no-config | not-installed | ready (never throws pre-bootstrap)",
		parameters: Type.Object({}),
		surface: "use",
		run(cwd: string, _params: Record<string, never>): string {
			const status = deriveBootstrapState(cwd);
			return JSON.stringify(status, null, 2);
		},
	},
	{
		name: "rename-canonical-id",
		label: "Rename Canonical Id",
		description:
			"Rename a canonical_id (kind: item | relation_type | lens | layer) from oldId to newId across all substrate surfaces that carry it as DATA — item home block + relations.json edges, or the relevant config registries. Out-of-substrate occurrences (analysis MDs, git history) are REPORTED, never rewritten. block_kind renames are unsupported (filesystem cascade). Use dryRun to preview the would-change counts without writing.",
		promptSnippet: "Rename a canonical_id (item/relation_type/lens/layer) across substrate; dryRun to preview",
		parameters: Type.Object({
			kind: Type.String({ description: "One of: item | relation_type | lens | layer" }),
			oldId: Type.String({ description: "Current canonical_id to rename from" }),
			newId: Type.String({ description: "New canonical_id to rename to" }),
			dryRun: Type.Optional(Type.Boolean({ description: "Compute would-change counts without writing" })),
		}),
		surface: "use",
		authGated: true,
		run(cwd: string, params: { kind: string; oldId: string; newId: string; dryRun?: boolean }): string {
			const report = renameCanonicalId(cwd, params.kind, params.oldId, params.newId, { dryRun: params.dryRun });
			return JSON.stringify(report, null, 2);
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
		): string {
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
			const result = amendConfigEntry(cwd, params.registry, params.operation, params.key, entry, undefined, {
				dryRun: params.dryRun,
			});
			const verb = result.modified ? (params.dryRun ? `would ${result.operation}` : `${result.operation}d`) : "no-op";
			return `amend-config: ${verb} ${result.registry}[${result.key}]`;
		},
	},
	{
		name: "read-schema",
		label: "Read Schema",
		description:
			"Read a substrate schema by name as parsed JSON. Returns null when the schema file is absent. Address ONE property via `path` (dotted/bracket, e.g. properties.tasks.items.properties.status) instead of reading the whole schema.",
		promptSnippet: "Read a block schema as structured JSON — optionally address one property via `path`",
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
		run(cwd: string, params: { schemaName: string; path?: string }): string {
			const schema = readSchema(cwd, params.schemaName);
			const schemaPathStr = schemaPath(cwd, params.schemaName);

			if (params.path !== undefined) {
				const addr = addressInto(schema, { path: params.path });
				if (!addr.found) {
					return `read-schema: property not found — ${addr.resolved}`;
				}
				const envProp = serializeForRead(addr.value, { label: `${params.schemaName} ${addr.resolved}` });
				return envProp.content;
			}

			const result = { schema, schemaPath: schemaPathStr };
			const envelope = serializeForRead(result, {
				label: schemaPathStr,
				overCapDirective: {
					tool: "read-schema",
					params: { schemaName: params.schemaName },
					hint: "path=<dotted json-path>",
				},
			});
			return envelope.content;
		},
	},
	{
		name: "write-schema",
		label: "Write Schema",
		description:
			"Create or replace a substrate block-kind JSON Schema. operation 'create' requires the schema absent; " +
			"'replace' requires it present. The body is AJV draft-07 meta-validated before an atomic write. Schema " +
			"version bumps require a companion migration declaration via write-schema-migration; without one, " +
			"read/write of items declaring an older schema_version throws version-mismatch. Registering the block_kind " +
			"that points at this schema is a separate step (amend-config block_kinds).",
		promptSnippet: "Create or replace a block-kind JSON Schema (meta-validated, atomic)",
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
		run(cwd: string, params: { operation: string; schemaName: string; schema?: unknown; dryRun?: boolean }): string {
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
			const result = writeSchemaChecked(
				cwd,
				params.schemaName,
				schema as object,
				params.operation as "create" | "replace",
				undefined,
				{ dryRun: params.dryRun },
			);
			const verb = result.written ? `${result.operation}d` : `would ${result.operation}`;
			return `write-schema: ${verb} schema '${params.schemaName}' at ${result.schemaPath}`;
		},
	},
	{
		name: "write-schema-migration",
		label: "Write Schema Migration",
		description:
			"Declare a schema version-bump migration into substrate (migrations.json). operation 'create' appends a new declaration; 'replace' overwrites an existing declaration matched by (schemaName, fromVersion); 'remove' drops a declaration. kind='identity' asserts the bump is shape-compatible (no data transform); kind='declarative-transform' carries a TransformSpec of rename/set/delete/coerce operations on dotted JSON paths. The loaded MigrationRegistry resolves the recorded edge at next read/write so block items declaring an older schema_version walk forward without process restart. Requires user authorization via interactive confirmation at the pi-dispatch auth-gate; on confirm, the verified terminal-operator identity is stamped as writer.",
		promptSnippet: "Declare a schema version-bump migration (identity or declarative-transform) into migrations.json",
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
		): Promise<string> {
			const result = await writeSchemaMigrationExecute(cwd, params);
			// writeSchemaMigrationExecute returns the uniform AgentToolResult; the
			// op contract is the text payload, which registerAll re-wraps identically.
			const part = result.content[0];
			return part.type === "text" ? part.text : JSON.stringify(part);
		},
	},
	{
		name: "context-init",
		label: "Context Init",
		description: "Initialize the substrate dir (bootstrap pointer + dirs only; run accept-all + install to populate).",
		promptSnippet: "Initialize the substrate dir (bootstrap pointer + dirs only; run accept-all + install to populate)",
		parameters: Type.Object({
			contextDir: Type.String({
				description: "Substrate dir name (e.g. .context). Required — no default.",
			}),
		}),
		surface: "use",
		authGated: true,
		run(cwd: string, params: { contextDir: string }): string {
			const result = initProject(cwd, params.contextDir);
			return JSON.stringify(result, null, 2);
		},
	},
	{
		name: "context-accept-all",
		label: "Accept-All Conception",
		description:
			"Adopt the canonical packaged conception (samples/conception.json) as this substrate's config.json (accept-all). Writes config only — run install after. Idempotent: never overwrites an existing config.",
		promptSnippet: "Adopt the canonical conception as config (accept-all)",
		parameters: Type.Object({}),
		surface: "use",
		authGated: true,
		run(cwd: string, _params: Record<string, never>): string {
			let result: AdoptResult;
			try {
				result = adoptConception(cwd);
			} catch (err) {
				if (err instanceof BootstrapNotFoundError) {
					return "substrate not initialized — run context-init first";
				}
				throw err;
			}
			return JSON.stringify(result);
		},
	},
	{
		name: "context-switch",
		label: "Context Switch",
		description:
			"Flip the bootstrap pointer to a different substrate dir (parallel to git switch). Default: flip to an existing substrate at target_dir (requires config.json present). create_new=true: bootstrap a fresh substrate at target_dir AND flip in one operation. to_previous=true: flip back to the pointer's previous_contextDir (target_dir ignored).",
		promptSnippet: "Switch the bootstrap pointer to a different substrate dir",
		parameters: Type.Object({
			target_dir: Type.String({
				description:
					"Substrate dir name to switch to (e.g. '.context'). Required for default + create_new modes; ignored for to_previous mode.",
			}),
			create_new: Type.Optional(
				Type.Boolean({
					description:
						"When true, bootstrap target_dir as a fresh substrate AND flip the pointer in one operation (parallel to 'git switch -c <branch>'). Default false (flip to existing substrate; fails if target_dir lacks config.json).",
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
		): string {
			// The auth-gate stamps event.input.writer to verified identity on
			// confirm; the body trusts the stamped writer (auth-gate is the
			// canonical identity check per FGAP-134 / FGAP-138 model). When the
			// gate is bypassed (e.g., test harness), fall back to 'operator'
			// rather than throwing — the same fallback policy the slash command
			// path uses.
			const writerIdentity = params.writer?.user ?? "operator";

			try {
				if (params.to_previous === true) {
					const { from, to } = switchToPrevious(cwd, writerIdentity);
					return JSON.stringify({ mode: "to_previous", from, to }, null, 2);
				}
				if (params.create_new === true) {
					const { created } = switchAndCreate(cwd, params.target_dir, writerIdentity);
					return JSON.stringify({ mode: "create_new", target_dir: params.target_dir, created }, null, 2);
				}
				switchToExisting(cwd, params.target_dir, writerIdentity);
				return JSON.stringify({ mode: "existing", target_dir: params.target_dir }, null, 2);
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
		parameters: Type.Object({}),
		surface: "use",
		run(cwd: string, _params: Record<string, never>): string {
			const subs = listSubstrates(cwd);
			return JSON.stringify(subs, null, 2);
		},
	},
	{
		name: "context-archive",
		label: "Context Archive",
		description:
			"Move a non-active substrate dir to archive/<dir>/. Refuses to archive the active substrate (the dir the bootstrap pointer currently names) or to clobber an existing archive/<dir>/.",
		promptSnippet: "Archive a non-active substrate dir to archive/<dir>/",
		parameters: Type.Object({
			target_dir: Type.String({
				description: "Substrate dir name to archive (e.g. '.project'). Refused if it is the active substrate.",
			}),
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
					{ description: "DispatchContext.writer — stamped by auth-gate on operator confirm." },
				),
			),
		}),
		surface: "use",
		authGated: true,
		run(cwd: string, params: { target_dir: string; writer?: { kind: string; user: string } }): string {
			try {
				const { from, to } = archiveSubstrate(cwd, params.target_dir);
				return JSON.stringify({ from, to }, null, 2);
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
		): string {
			const result = filterBlockItems(cwd, params.block, {
				field: params.field,
				op: params.op,
				value: params.value,
			});
			const envelope = serializeForRead(result, {
				label: `${params.block} filtered`,
				overCapDirective: { tool: "read-block-page", hint: "or refine the predicate" },
			});
			return envelope.content;
		},
	},
	{
		name: "resolve-item-by-id",
		label: "Resolve Item By Id",
		description:
			"Look up the block, array key, and item payload for a given ID across all blocks in the substrate dir. Returns null when no item matches. Mirrors the resolveItemById SDK function and shares its prefix-vs-block invariant — IDs whose prefix maps to a known block but live elsewhere throw at index-build time.",
		promptSnippet: "Resolve a kind-prefixed ID (DEC-/FEAT-/FGAP-/issue-/REQ-/TASK-/etc.) to its owning block and item",
		parameters: Type.Object({
			id: Type.String({ description: "Kind-prefixed ID, e.g., DEC-NNNN / FEAT-NNN / FGAP-NNN / ISSUE-NNN" }),
		}),
		surface: "use",
		run(cwd: string, params: { id: string }): string {
			const result = resolveItemById(cwd, params.id);
			return JSON.stringify(result, null, 2);
		},
	},
	{
		name: "read-block-item",
		label: "Read Block Item",
		description:
			"Read a single item from a named block by its id — returns the item or null. Block-scoped (unlike resolve-item-by-id, which searches all blocks by kind-prefixed id). Avoids fetching a whole large block to get one item.",
		promptSnippet: "Read one item from a block by id (block-scoped; null if absent)",
		parameters: Type.Object({
			block: Type.String({ description: "Block name (e.g., 'tasks', 'decisions', 'framework-gaps')" }),
			id: Type.String({ description: "Item id within the block (e.g., 'TASK-NNN')" }),
		}),
		surface: "use",
		run(cwd: string, params: { block: string; id: string }): string {
			const result = readBlockItem(cwd, params.block, params.id);
			// whole: the item is already the addressed element — don't re-page its
			// intrinsic arrays; preserve the single-item|null output contract.
			const envelope = serializeForRead(result, { whole: true, label: `${params.block} ${params.id}` });
			return envelope.content;
		},
	},
	{
		name: "read-block-page",
		label: "Read Block Page",
		description:
			"Paginate a block's items: returns { items, total, hasMore }. offset default 0, limit default 50. Use for blocks too large to fetch whole (past the 50KB read-block cap). total is the full item count; hasMore signals another page.",
		promptSnippet: "Paginate a block's items — offset + limit; returns {items,total,hasMore}",
		parameters: Type.Object({
			block: Type.String({ description: "Block name (e.g., 'framework-gaps', 'decisions', 'issues')" }),
			offset: Type.Optional(Type.Integer({ minimum: 0, description: "Start index (default 0)" })),
			limit: Type.Optional(Type.Integer({ minimum: 1, description: "Max items to return (default 50)" })),
		}),
		surface: "use",
		run(cwd: string, params: { block: string; offset?: number; limit?: number }): string {
			const result = readBlockPage(cwd, params.block, { offset: params.offset, limit: params.limit });
			// whole: readBlockPage ALREADY paged — preserve the {items,total,hasMore}
			// output contract; do not let serializeForRead re-page the items array.
			const envelope = serializeForRead(result, { whole: true, label: `${params.block} page` });
			return envelope.content;
		},
	},
	{
		name: "join-blocks",
		label: "Join Blocks",
		description:
			"Join two blocks in one call. EDGE mode: pass `relationType` — pairs left items with right-block items connected by that relations.json edge (`leftEndpoint` parent|child, default parent). FIELD mode: pass `leftField`+`rightField` — pairs where left[leftField] === right[rightField]. Optional left pre-filter via where{Field,Op,Value}. Returns [{left, right:[]}] (right always an array; one-to-many). Use instead of N+1 read-block + resolve calls.",
		promptSnippet: "Join two blocks in one call — by relation edge or shared field; returns {left,right[]} pairs",
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
		): string {
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
			const envelope = serializeForRead(result, {
				label: `${params.leftBlock} ⋈ ${params.rightBlock}`,
				overCapDirective: {
					tool: "join-blocks",
					hint: "refine the relation/field or pre-filter the left block",
				},
			});
			return envelope.content;
		},
	},
	{
		name: "resolve-items-by-id",
		label: "Resolve Items By Id (Bulk)",
		description:
			"Bulk variant of resolve-item-by-id — resolve N kind-prefixed ids against a single buildIdIndex traversal. Returns an object mapping each input id to its ItemLocation (block / arrayKey / item) or null when not found. Coexists with the singular resolve-item-by-id tool; bulk collapses the N×singular-call pattern for callers resolving multiple ids in one render pass.",
		promptSnippet: "Resolve a batch of kind-prefixed ids (DEC-/FGAP-/TASK-/issue-/REQ-/...) in one call",
		parameters: Type.Object({
			ids: Type.Array(Type.String(), {
				description: "Array of kind-prefixed ids (DEC-/FGAP-/TASK-/issue-/REQ-/...) to resolve in one call",
			}),
		}),
		surface: "use",
		run(cwd: string, params: { ids: string[] }): string {
			const resultMap = resolveItemsByIds(cwd, params.ids);
			const obj: Record<string, ItemLocation | null> = {};
			for (const [id, loc] of resultMap) obj[id] = loc;
			// whole: an id→location map keyed by arbitrary ids — not a pageable
			// collection; serialize the map verbatim.
			const envelope = serializeForRead(obj, { whole: true, label: "resolved ids" });
			return envelope.content;
		},
	},
	{
		name: "complete-task",
		label: "Complete Task",
		description: "Complete a task with verification gate — requires a passing verification entry targeting the task.",
		promptSnippet: "Complete a task — gates on passing verification before updating status",
		parameters: Type.Object({
			taskId: Type.String({ description: "Task ID to complete" }),
			verificationId: Type.String({
				description: "Verification entry ID (must target this task with status 'passed')",
			}),
		}),
		surface: "use",
		run(cwd: string, params: { taskId: string; verificationId: string }): string {
			const result = completeTask(cwd, params.taskId, params.verificationId);
			return `Task '${result.taskId}' completed (was '${result.previousStatus}'). Verification: ${result.verificationId} (${result.verificationStatus})`;
		},
	},
	{
		name: "context-validate-relations",
		label: "Context Validate Relations",
		description:
			"Validate substrate relations.json edges against config-declared lenses + hierarchy + relation_types and the cross-block id index. Returns SubstrateValidationResult with status (clean/warnings/invalid) and per-issue diagnostics.",
		promptSnippet: "Validate substrate relations against config + items",
		parameters: Type.Object({}),
		surface: "use",
		run(cwd: string, _params: Record<string, never>): string {
			const result = validateContextRelations(cwd);
			return JSON.stringify(result, null, 2);
		},
	},
	{
		name: "context-edges-for-lens",
		label: "Context Edges For Lens",
		description:
			"Materialize the Edge[] for a named lens — synthetic edges from derived_from_field for auto-derived lenses; authored edges filtered by relation_type for hand-curated lenses; unioned items from composition members for kind=composition lenses.",
		promptSnippet: "Materialize edges for a named lens (auto-derived or hand-curated)",
		parameters: Type.Object({
			lensId: Type.String({ description: "Lens id from config.lenses[].id" }),
		}),
		surface: "use",
		run(cwd: string, params: { lensId: string }): string {
			const result = edgesForLensByName(cwd, params.lensId);
			const envelope = serializeForRead(result, { label: `edges for lens ${params.lensId}` });
			return envelope.content;
		},
	},
	{
		name: "context-walk-descendants",
		label: "Context Walk Descendants",
		description:
			"Walk closure-table descendants of a parent id under a given relation_type. Returns string[] of descendant ids (may be empty if no children or relations.json absent).",
		promptSnippet: "Walk closure-table descendants under a relation_type",
		parameters: Type.Object({
			parentId: Type.String({ description: "Parent id (canonical id or lens bin name)" }),
			relationType: Type.String({ description: "Relation type from config.relation_types[].canonical_id" }),
		}),
		surface: "use",
		run(cwd: string, params: { parentId: string; relationType: string }): string {
			const result = walkLensDescendants(cwd, params.parentId, params.relationType);
			return JSON.stringify(result, null, 2);
		},
	},
	{
		name: "walk-ancestors",
		label: "Walk Ancestors",
		description:
			"Walk closure-table ancestors of an item id under a given relation_type — reverse-direction counterpart to context-walk-descendants. Returns string[] of ancestor ids (may be empty if no parents or relations.json absent).",
		promptSnippet: "Walk closure-table ancestors under a relation_type",
		parameters: Type.Object({
			itemId: Type.String({ description: "Child item id whose ancestors are sought" }),
			relationType: Type.String({ description: "Relation type from config.relation_types[].canonical_id" }),
		}),
		surface: "use",
		run(cwd: string, params: { itemId: string; relationType: string }): string {
			const result = walkAncestorsByLens(cwd, params.itemId, params.relationType);
			const envelope = serializeForRead(result, { label: `ancestors of ${params.itemId}` });
			return envelope.content;
		},
	},
	{
		name: "find-references",
		label: "Find References",
		description:
			"Find all closure-table edges incident on an item id (inbound, outbound, or both). Returns Edge[] preserving relation_type + ordinal per record — edge-level view, not the id-chain projection that walk-ancestors / context-walk-descendants emit.",
		promptSnippet: "Find closure-table edges incident on an item id",
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
		run(cwd: string, params: { itemId: string; direction?: "inbound" | "outbound" | "both" }): string {
			const result = findReferencesInRepo(cwd, params.itemId, params.direction);
			const envelope = serializeForRead(result, { label: `edges on ${params.itemId}` });
			return envelope.content;
		},
	},
	{
		name: "gather-execution-context",
		label: "Gather Execution Context",
		description:
			"Compose a ContextBundle for a work-unit by reading its context-contract (by unit_kind) and walking declared relation_types bidirectionally per direction semantic. Returns unit + perRelationType buckets of resolved items + traversal_depth + scoped_at. Substrate primitive serving harness-confined dispatch.",
		promptSnippet: "Compose ContextBundle for unit + context-contract-declared bundle_relation_types",
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
		run(cwd: string, params: { unitId: string; kind: string; maxDepth?: number }): string {
			const result = gatherExecutionContext(cwd, params);
			// whole: a structured ContextBundle (unit + perRelationType buckets) —
			// preserve the bundle shape rather than paging any single inner array.
			const envelope = serializeForRead(result, { whole: true, label: `bundle ${params.unitId}` });
			return envelope.content;
		},
	},
	{
		name: "context-roadmap-load",
		label: "Context: load roadmap",
		description:
			"Load a roadmap by id and return the materialized RoadmapView (phases, lens-views, status rollup, milestone resolution, scoped phase_depends_on edges, topo-ordered phaseOrder + cycles). Phase ordering lives in relations.json with relation_type='phase_depends_on'.",
		promptSnippet: "Load a roadmap by id",
		parameters: Type.Object({
			roadmapId: Type.String({ description: "ROADMAP-NNN id from <config.root>/roadmap.json" }),
		}),
		surface: "use",
		run(cwd: string, params: { roadmapId: string }): string {
			const view = loadRoadmap(cwd, params.roadmapId);
			if ("error" in view) {
				const envErr = serializeForRead(view, { whole: true, label: `roadmap ${params.roadmapId} (error)` });
				return envErr.content;
			}
			// whole: a structured RoadmapView (phases + lens-views + rollups) — keep
			// the view shape intact rather than paging an inner array.
			const envelope = serializeForRead(serializeRoadmapView(view), {
				whole: true,
				label: `roadmap ${params.roadmapId}`,
			});
			return envelope.content;
		},
	},
	{
		name: "context-roadmap-render",
		label: "Context: render roadmap",
		description:
			"Render a roadmap by id as pure-textual markdown — phase order list, per-phase adjacency lines (sourced from view.edges, alphabetically sorted), status rollup counts, milestone resolution, exit criteria. NO mermaid / graph syntax: per-phase **Depends on:** lines come strictly from authored phase_depends_on edges scoped to in-roadmap phases.",
		promptSnippet: "Render a roadmap as markdown",
		parameters: Type.Object({
			roadmapId: Type.String({ description: "ROADMAP-NNN id from <config.root>/roadmap.json" }),
		}),
		surface: "use",
		run(cwd: string, params: { roadmapId: string }): string {
			const view = loadRoadmap(cwd, params.roadmapId);
			if ("error" in view) {
				return JSON.stringify(view, null, 2);
			}
			const naming = loadContext(cwd).config?.naming;
			return renderRoadmap(view, naming);
		},
	},
	{
		name: "context-roadmap-validate",
		label: "Context: validate roadmap(s)",
		description:
			"Validate every roadmap × phase × milestone in <config.root>/roadmap.json. Codes: roadmap_lens_missing, roadmap_phase_dep_missing, roadmap_phase_cycle, roadmap_composition_cycle, roadmap_milestone_evidence_block_missing, roadmap_milestone_query_invalid, roadmap_status_unknown_value. Display strings flow through config.display_strings (pi-context divergence). Optional roadmapId filter restricts issue list to a single roadmap.",
		promptSnippet: "Validate roadmaps",
		parameters: Type.Object({
			roadmapId: Type.Optional(
				Type.String({ description: "Filter to issues matching this roadmap_id (omit for full-project validation)" }),
			),
		}),
		surface: "use",
		run(cwd: string, params: { roadmapId?: string }): string {
			const result = validateRoadmaps(cwd);
			const filtered = params.roadmapId
				? result.issues.filter((i) => !i.roadmap_id || i.roadmap_id === params.roadmapId)
				: result.issues;
			return JSON.stringify({ status: result.status, issues: filtered }, null, 2);
		},
	},
	{
		name: "context-roadmap-list",
		label: "Context: list roadmaps",
		description:
			"List every roadmap in <config.root>/roadmap.json with id, title, optional status, and phase count. Returns [] when roadmap.json absent (opt-in block; absence is the truthful answer).",
		promptSnippet: "List roadmaps",
		parameters: Type.Object({}),
		surface: "use",
		run(cwd: string, _params: Record<string, never>): string {
			return JSON.stringify(listRoadmaps(cwd), null, 2);
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
 * The factory PI handle captured at registerAll time. The list-tools op needs
 * the introspection surface (getAllTools / getActiveTools) which lives on
 * ExtensionAPI, not on the per-call ExtensionContext. Captured once when the
 * extension registers its tools; null until then. Module-scoped here so the
 * op `run` closures (which receive only cwd + params) can reach it without
 * threading the handle through every signature.
 */
let boundPi: ExtensionAPI | null = null;

/**
 * Register every op in `ops` as a pi tool. Each tool's execute body is the
 * uniform wrapper around the op's run(): coerce params, await run, place the
 * returned string at content[0].text. Behavior-identical to the prior inline
 * registrations.
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
				return {
					details: undefined,
					content: [{ type: "text", text: await op.run(ctx.cwd, params as never) }],
				};
			},
		});
	}
}
