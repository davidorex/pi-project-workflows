/**
 * Agent contract introspection — projection of an AgentSpec for SDK queries.
 *
 * Implements the introspection surface of the jit-agents boundary contract
 * (jit-agents-spec.md §2). Consumers ask "what does this agent accept and
 * produce" without dispatching it.
 */
import type { AgentContract, AgentSpec } from "./types.js";

/**
 * Project an AgentSpec into an AgentContract.
 *
 * Internal fields (loadedFrom, inline prompt text, template paths) are not
 * exposed. Only the contract-relevant fields: name, role, input schema,
 * context block declarations, output format and schema.
 */
export function agentContract(spec: AgentSpec): AgentContract {
	const contract: AgentContract = { name: spec.name };
	if (spec.role !== undefined) contract.role = spec.role;
	if (spec.inputSchema !== undefined) contract.inputSchema = spec.inputSchema;
	if (spec.contextBlocks !== undefined) contract.contextBlocks = spec.contextBlocks;
	if (spec.outputFormat !== undefined) contract.outputFormat = spec.outputFormat;
	if (spec.outputSchema !== undefined) contract.outputSchema = spec.outputSchema;
	return contract;
}
