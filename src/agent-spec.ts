/**
 * Agent spec loading — YAML specs are the source of truth.
 *
 * Agent specs are declarative YAML files that define typed functions:
 * InputSchema → OutputSchema, with template references for prompt
 * composition. The .md that pi consumes is compiled at dispatch time
 * from spec + templates + typed input. It exists in memory only.
 *
 * Search order (first match wins):
 *   1. .pi/agents/<name>.agent.yaml     (project)
 *   2. ~/.pi/agent/agents/<name>.agent.yaml  (user)
 *   3. <package>/demo/agents/<name>.agent.yaml (builtin)
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { parse as parseYaml } from "yaml";
import type { AgentSpec } from "./types.ts";

/**
 * Parse a YAML agent spec file into an AgentSpec.
 */
export function parseAgentYaml(filePath: string): AgentSpec {
  const content = fs.readFileSync(filePath, "utf-8");
  const spec = parseYaml(content);

  return {
    name: spec.name || path.basename(filePath, ".agent.yaml"),
    description: spec.description,
    role: spec.role,
    model: spec.model,
    thinking: spec.thinking,
    tools: spec.tools,
    extensions: spec.extensions,
    skills: spec.skills,
    output: spec.output?.file,
    promptTemplate: spec.prompt?.system,
    taskTemplate: spec.prompt?.task,
    inputSchema: spec.input,
    outputFormat: spec.output?.format,
    outputSchema: spec.output?.schema,
  };
}

/**
 * Create an agent loader that finds .agent.yaml specs.
 */
export function createAgentLoader(cwd: string, builtinDir?: string): (name: string) => AgentSpec {
  const defaultBuiltinDir = builtinDir ?? path.resolve(import.meta.dirname, "..", "demo", "agents");

  return (name: string): AgentSpec => {
    const searchPaths = [
      path.join(cwd, ".pi", "agents", `${name}.agent.yaml`),
      path.join(os.homedir(), ".pi", "agent", "agents", `${name}.agent.yaml`),
      path.join(defaultBuiltinDir, `${name}.agent.yaml`),
    ];

    for (const p of searchPaths) {
      if (fs.existsSync(p)) return parseAgentYaml(p);
    }

    return { name };
  };
}
