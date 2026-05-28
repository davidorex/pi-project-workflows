/**
 * commit-attested Pi tool — stages declared files + invokes git commit
 * with a writer.kind=agent attestation footer (DEC-0047). Husky pre-commit
 * runs as the backup gate; never bypass (--no-verify is forbidden per
 * feedback_no_destructive_git_ops). The primary verification gate is
 * run-real-checks (TASK-090) called BEFORE this tool.
 */

import { Type } from "@earendil-works/pi-ai";
import type { AgentToolResult, AgentToolUpdateCallback, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type AttestedCommitResult, attestedCommit } from "./attested-commit.js";

export const commitAttestedTool = {
	name: "commit-attested",
	label: "Commit Attested",
	description:
		"Stage declared files + invoke git commit with DispatchContext writer.kind=agent attestation footer (DEC-0047). Husky pre-commit runs as backup gate; never bypass (--no-verify forbidden per feedback_no_destructive_git_ops). The primary gate is run-real-checks (TASK-090) called BEFORE this tool.",
	promptSnippet: "Commit agent-authored work-product files with attestation footer.",
	parameters: Type.Object({
		files: Type.Array(Type.String(), { description: "Files to stage + commit. Empty array refused." }),
		message: Type.String({
			description: "Commit message body (the attestation footer is appended automatically).",
		}),
		agent_id: Type.String({
			description: "Agent id for writer.kind=agent attestation (e.g. 'spec-implementer-001').",
		}),
		work_order_id: Type.Optional(Type.String({ description: "Optional work-order id for the attestation footer." })),
	}),
	async execute(
		_toolCallId: string,
		params: { files: string[]; message: string; agent_id: string; work_order_id?: string },
		_signal: AbortSignal,
		_onUpdate: AgentToolUpdateCallback,
		ctx: ExtensionContext,
	): Promise<AgentToolResult<AttestedCommitResult>> {
		const result = await attestedCommit(ctx.cwd, {
			files: params.files,
			message: params.message,
			agent_id: params.agent_id,
			work_order_id: params.work_order_id,
		});

		return {
			details: result,
			content: [
				{
					type: "text",
					text: result.committed
						? `Committed ${result.commit_sha} (agent/${params.agent_id})`
						: `Commit FAILED (exit ${result.exit_code}): ${result.stderr.slice(0, 500)}`,
				},
			],
		};
	},
};
