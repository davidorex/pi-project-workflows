/**
 * author-tool-grant Pi tool — writes config.tool_operations[] /
 * config.tool_operations_forbidden[] entries under writer.kind=human
 * enforcement (DEC-0047: capability authoring is human-only; sub-agents
 * have no escalation path).
 *
 * Two-arm target: `tool_operations` (the grant registry) or
 * `tool_operations_forbidden` (the L5 project-forbidden list). Both arms
 * refuse FORBIDDEN_WHOLESALE_OPERATIONS L1 tokens — for `tool_operations`
 * we refuse entries whose canonical_id IS a wholesale token (the canon
 * we're protecting); for `tool_operations_forbidden` we refuse keys
 * already in L1 (no-op + clarity — they're framework-forbidden so
 * adding them to L5 is redundant).
 *
 * Dispatches to amendConfigEntry from pi-context.
 */

import { amendConfigEntry } from "@davidorex/pi-context/context";
import type { DispatchContext } from "@davidorex/pi-context/dispatch-context";
import { Type } from "@earendil-works/pi-ai";
import type { AgentToolResult, AgentToolUpdateCallback, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { FORBIDDEN_WHOLESALE_OPERATIONS } from "./operation-vocab.js";

export const authorToolGrantTool = {
	name: "author-tool-grant",
	label: "Author Tool Grant",
	description:
		"Add or remove an entry in config.tool_operations[] or config.tool_operations_forbidden[] under writer.kind=human enforcement (DEC-0047). Refuses any attempt to register a framework-forbidden wholesale token.",
	promptSnippet: "Author a config tool-grant entry (operation registration or project-forbidden token).",
	parameters: Type.Object({
		target: Type.Union([Type.Literal("tool_operations"), Type.Literal("tool_operations_forbidden")], {
			description: "Which config registry to mutate.",
		}),
		operation: Type.Union([Type.Literal("add"), Type.Literal("remove")], {
			description: "amendConfigEntry operation.",
		}),
		key: Type.String({
			description:
				"For tool_operations: the canonical_id (must match entry.canonical_id). For tool_operations_forbidden: the token string.",
		}),
		entry: Type.Optional(
			Type.Unknown({
				description: "ToolOperationDecl object — required for target=tool_operations + operation=add.",
			}),
		),
		writer: Type.Object(
			{
				kind: Type.String({ description: "Writer kind — MUST be 'human' per DEC-0047." }),
				user: Type.String({ description: "Human writer identity (e.g. 'davidryan@gmail.com')." }),
			},
			{ description: "DispatchContext.writer per pi-context/src/dispatch-context.ts." },
		),
	}),
	async execute(
		_toolCallId: string,
		params: {
			target: "tool_operations" | "tool_operations_forbidden";
			operation: "add" | "remove";
			key: string;
			entry?: unknown;
			writer: { kind: string; user: string };
		},
		_signal: AbortSignal,
		_onUpdate: AgentToolUpdateCallback,
		ctx: ExtensionContext,
	): Promise<AgentToolResult<undefined>> {
		if (params.writer?.kind !== "human") {
			throw new Error(
				`author-tool-grant: writer.kind must be 'human' per DEC-0047 (got '${params.writer?.kind}'). Capability/grant authoring is human-only; sub-agents have no escalation path.`,
			);
		}
		if (!params.writer.user) {
			throw new Error("author-tool-grant: writer.user is required when writer.kind=human.");
		}

		const forbidden = FORBIDDEN_WHOLESALE_OPERATIONS as readonly string[];

		if (params.target === "tool_operations" && params.operation === "add") {
			const entryObj = (params.entry ?? {}) as { canonical_id?: string };
			const canonicalId = entryObj.canonical_id ?? params.key;
			if (forbidden.includes(canonicalId)) {
				throw new Error(
					`author-tool-grant: refusing to register forbidden wholesale token '${canonicalId}' in tool_operations (L1 framework canon; source change + release required to alter).`,
				);
			}
		}

		if (params.target === "tool_operations_forbidden" && forbidden.includes(params.key)) {
			throw new Error(
				`author-tool-grant: token '${params.key}' is already in L1 framework FORBIDDEN_WHOLESALE_OPERATIONS — adding to L5 project list is redundant.`,
			);
		}

		const dispatchCtx: DispatchContext = {
			writer: { kind: "human", user: params.writer.user },
		};
		amendConfigEntry(
			ctx.cwd,
			params.target,
			params.operation,
			params.key,
			params.entry as Record<string, unknown> | undefined,
			dispatchCtx,
		);

		return {
			details: undefined,
			content: [
				{
					type: "text",
					text: `${params.operation} ${params.target}[${params.key}] (writer=human:${params.writer.user})`,
				},
			],
		};
	},
};
