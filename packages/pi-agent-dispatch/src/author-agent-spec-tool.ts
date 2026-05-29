/**
 * author-agent-spec Pi tool — writes .agent.yaml under the agents tier
 * with writer.kind=human enforcement (DEC-0047: capability/spec authoring
 * is human-only; sub-agents have no escalation path).
 */

import fs from "node:fs";
import path from "node:path";
import { tryResolveContextDir } from "@davidorex/pi-context/context-dir";
import { parseAgentYaml } from "@davidorex/pi-jit-agents/agent-spec";
import { Type } from "@earendil-works/pi-ai";
import type { AgentToolResult, AgentToolUpdateCallback, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { stringify as yamlStringify } from "yaml";

export const authorAgentSpecTool = {
	name: "author-agent-spec",
	label: "Author Agent Spec",
	description:
		"Write a new .agent.yaml spec to the agents tier under writer.kind=human enforcement (capability/spec authoring is human-only). The written file is AJV-validated against AgentSpec before persisting.",
	promptSnippet:
		"Author a privileged JIT-agent spec — declares input, prompts, tools grant, output schema, contextBlocks.",
	parameters: Type.Object({
		name: Type.String({ description: "Agent name (becomes <name>.agent.yaml filename + AgentSpec.name)." }),
		spec: Type.Unknown({
			description: "AgentSpec object body (will be serialized to YAML). Must conform to AgentSpec shape.",
		}),
		writer: Type.Object(
			{
				kind: Type.String({ description: "Writer kind discriminator — MUST be 'human'." }),
				user: Type.String({ description: "Human writer identity (e.g. 'davidryan@gmail.com')." }),
			},
			{ description: "DispatchContext.writer per pi-context/src/dispatch-context.ts." },
		),
	}),
	async execute(
		_toolCallId: string,
		params: { name: string; spec: Record<string, unknown> | string; writer: { kind: string; user: string } },
		_signal: AbortSignal,
		_onUpdate: AgentToolUpdateCallback,
		ctx: ExtensionContext,
	): Promise<AgentToolResult<undefined>> {
		// Identity check has moved to the pi-dispatch auth-gate
		// (pi.on('tool_call') handler in this same package). By the time
		// the execute body runs, the auth-gate has already prompted the
		// operator and — on confirm=true with a verifiable identity —
		// stamped event.input.writer with the verified terminal-operator
		// identity. The body trusts the writer field as-is and uses
		// writer.user to construct the DispatchContext for substrate
		// stamping.
		if (!params.writer?.user) {
			throw new Error("author-agent-spec: writer.user is required.");
		}

		// Parse spec if string (defensive — Type.Unknown may arrive as JSON string)
		let specObj: Record<string, unknown> =
			typeof params.spec === "string" ? (null as unknown as Record<string, unknown>) : params.spec;
		if (typeof params.spec === "string") {
			try {
				specObj = JSON.parse(params.spec) as Record<string, unknown>;
			} catch {
				throw new Error("author-agent-spec: spec parameter must be an object, got unparseable string.");
			}
		}

		// Resolve agents tier — substrate root + agents/ subdir
		const root = tryResolveContextDir(ctx.cwd);
		if (root === null) {
			throw new Error("author-agent-spec: cannot resolve substrate context dir; .pi-context.json missing?");
		}
		const agentsDir = path.join(root, "agents");
		if (!fs.existsSync(agentsDir)) fs.mkdirSync(agentsDir, { recursive: true });

		const destPath = path.join(agentsDir, `${params.name}.agent.yaml`);

		// Serialize + write atomically (tmp + rename)
		const yamlContent = yamlStringify(specObj);
		const tmpPath = `${destPath}.tmp-${process.pid}`;
		fs.writeFileSync(tmpPath, yamlContent, "utf8");
		try {
			// Validate by round-tripping through parseAgentYaml
			const parsed = parseAgentYaml(tmpPath);
			// parseAgentYaml falls back to filename basename when name absent in YAML;
			// only flag when spec carries an explicit name that disagrees with the tool param.
			const explicitName = (specObj as Record<string, unknown>).name;
			if (typeof explicitName === "string" && explicitName !== params.name) {
				throw new Error(
					`author-agent-spec: spec.name ('${explicitName}') mismatches tool param name ('${params.name}'). Align them.`,
				);
			}
			void parsed;
		} catch (err) {
			fs.unlinkSync(tmpPath);
			throw err;
		}
		fs.renameSync(tmpPath, destPath);

		return {
			details: undefined,
			content: [
				{
					type: "text",
					text: `Wrote ${destPath} (writer=human:${params.writer.user})`,
				},
			],
		};
	},
};
