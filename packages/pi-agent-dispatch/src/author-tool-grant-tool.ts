/**
 * author-tool-grant Pi tool — writes config.tool_operations[] /
 * config.tool_operations_forbidden[] entries. Capability authoring is
 * human-authorized via the auth-gate confirm at the pi-dispatch layer:
 * the agent may issue the call, the operator authorizes at the terminal,
 * and the auth-gate stamps event.input.writer with the verified terminal-
 * operator identity before the body runs.
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
		"Add or remove an entry in config.tool_operations[] or config.tool_operations_forbidden[]. Requires user authorization via interactive confirmation at the pi-dispatch auth-gate; on confirm, the verified terminal-operator identity is stamped as writer. Refuses any attempt to register a framework-forbidden wholesale token.",
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
				kind: Type.String({
					description:
						"Writer kind discriminator (human / agent / monitor / workflow). The pi-dispatch auth-gate overrides this with 'human' on confirm when a verified terminal-operator identity is discoverable.",
				}),
				user: Type.String({
					description:
						"Writer identity (e.g. 'davidryan@gmail.com'). Overwritten by the auth-gate with the verified terminal-operator identity when one is discoverable on confirm=true.",
				}),
			},
			{
				description:
					"DispatchContext.writer payload; see pi-context/src/dispatch-context.ts for the discriminated union.",
			},
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
		// Identity check has moved to the pi-dispatch auth-gate
		// (pi.on('tool_call') handler in this same package). By the time
		// the execute body runs, the auth-gate has already prompted the
		// operator and — on confirm=true with a verifiable identity —
		// stamped event.input.writer with the verified terminal-operator
		// identity. The body trusts the writer field as-is.
		if (!params.writer?.user) {
			throw new Error("author-tool-grant: writer.user is required.");
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
