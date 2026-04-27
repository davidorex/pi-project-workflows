// Minimal stub — satisfies `import { getAgentDir } from "@mariozechner/pi-coding-agent"`
// and the type-only imports used in index.ts.
//
// `getAgentDir` honors the same `PI_CODING_AGENT_DIR` env var the real
// pi-coding-agent does (see node_modules/@mariozechner/pi-coding-agent/dist/
// config.js:175-186). This lets tier-resolution tests redirect the global
// tier into a tmp directory at runtime; without the env-var honor, the
// stub would always return its baked path and tier-2 override scenarios
// would silently fall through to tier-3.

export function getAgentDir(): string {
	const envDir = process.env.PI_CODING_AGENT_DIR;
	if (envDir) return envDir;
	return "/tmp/pi-stub-agent-dir";
}
