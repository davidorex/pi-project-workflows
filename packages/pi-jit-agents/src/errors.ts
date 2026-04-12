/**
 * Typed errors for pi-jit-agents.
 *
 * Each error carries enough context for consumer error messages without
 * requiring the consumer to know anything about internal paths or state.
 */

/** Thrown when an agent spec file is not found in any discovery tier. */
export class AgentNotFoundError extends Error {
	public readonly agentName: string;
	public readonly searchPaths: string[];

	constructor(agentName: string, searchPaths: string[]) {
		const pathList = searchPaths.map((p) => `  - ${p}`).join("\n");
		super(`Agent '${agentName}' not found. Searched:\n${pathList}`);
		this.name = "AgentNotFoundError";
		this.agentName = agentName;
		this.searchPaths = searchPaths;
	}
}

/** Thrown when an agent spec file exists but cannot be read or parsed. */
export class AgentParseError extends Error {
	public readonly agentName: string;
	public readonly filePath: string;
	public readonly cause: Error;

	constructor(agentName: string, filePath: string, cause: Error) {
		super(`Agent '${agentName}' at ${filePath}: ${cause.message}`);
		this.name = "AgentParseError";
		this.agentName = agentName;
		this.filePath = filePath;
		this.cause = cause;
	}
}

/** Thrown when compileAgent cannot produce any prompt content. */
export class AgentCompileError extends Error {
	public readonly agentName: string;
	public readonly cause?: Error;

	constructor(agentName: string, message: string, cause?: Error) {
		super(`Agent '${agentName}' compile failed: ${message}`);
		this.name = "AgentCompileError";
		this.agentName = agentName;
		this.cause = cause;
	}
}

/** Thrown when executeAgent fails or is cancelled. */
export class AgentDispatchError extends Error {
	public readonly agentName: string;
	public readonly stopReason?: string;
	public readonly cause?: Error;

	constructor(agentName: string, message: string, opts?: { stopReason?: string; cause?: Error }) {
		super(`Agent '${agentName}' dispatch failed: ${message}`);
		this.name = "AgentDispatchError";
		this.agentName = agentName;
		this.stopReason = opts?.stopReason;
		this.cause = opts?.cause;
	}
}
