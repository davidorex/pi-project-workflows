import { parse as parseYaml } from "yaml";
import { discoverWorkflows, findWorkflow } from "./workflow-discovery.ts";
import { executeWorkflow } from "./workflow-executor.ts";
import type { AgentSpec, WorkflowResult } from "./types.ts";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ── Minimal type declarations for pi extension API ──────────────────────────
// The actual types come from @mariozechner/pi-coding-agent and @sinclair/typebox,
// which are peer dependencies that may not be resolvable at test time.
// We define minimal compatible interfaces here so this module can be imported
// without those packages installed.

let Type: any;
try {
  Type = (await import("@sinclair/typebox")).Type;
} catch {
  // typebox not available — provide a minimal shim for tests that import
  // this module but never exercise the extension factory.
  Type = {
    Object: (props: Record<string, unknown>) => ({ type: "object", properties: props }),
    String: (opts?: unknown) => ({ type: "string", ...(opts || {}) }),
    Optional: (schema: unknown) => schema,
    Unknown: (opts?: unknown) => ({ ...(opts || {}) }),
  };
}

// ── parseAgentFrontmatter ───────────────────────────────────────────────────

/**
 * Parse YAML frontmatter from a .md agent file.
 * Frontmatter is between --- markers at the start of the file.
 * Content after frontmatter is the system prompt.
 */
export function parseAgentFrontmatter(filePath: string): AgentSpec {
  const content = fs.readFileSync(filePath, "utf-8");
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

  if (!match) {
    return { name: path.basename(filePath, ".md") };
  }

  const frontmatter = parseYaml(match[1]);
  const systemPrompt = match[2].trim();

  return {
    name: frontmatter.name || path.basename(filePath, ".md"),
    description: frontmatter.description,
    model: frontmatter.model,
    thinking: frontmatter.thinking,
    tools: frontmatter.tools,
    extensions: frontmatter.extensions,
    skills: frontmatter.skills,
    output: frontmatter.output,
    systemPrompt: systemPrompt || undefined,
  };
}

// ── Agent loader factory ────────────────────────────────────────────────────

export function createAgentLoader(cwd: string): (name: string) => AgentSpec {
  return (name: string): AgentSpec => {
    const searchPaths = [
      path.join(cwd, ".pi", "agents", `${name}.md`),
      path.join(os.homedir(), ".pi", "agent", "agents", `${name}.md`),
    ];

    for (const agentPath of searchPaths) {
      if (fs.existsSync(agentPath)) {
        return parseAgentFrontmatter(agentPath);
      }
    }

    return { name };
  };
}

// ── Helper functions ────────────────────────────────────────────────────────

function listWorkflowNames(cwd: string): string {
  const workflows = discoverWorkflows(cwd);
  if (workflows.length === 0) return "(none)";
  return workflows.map((w) => w.name).join(", ");
}

/**
 * Summarize a JSON Schema's expected shape for error messages.
 * Produces something like: { path: string (required), question?: string }
 */
function summarizeInputSchema(schema: Record<string, unknown> | undefined): string {
  if (!schema) return "(any)";
  const props = schema.properties as Record<string, any> | undefined;
  if (!props) return JSON.stringify(schema);
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  const fields = Object.entries(props).map(([key, val]) => {
    const type = val?.type || "unknown";
    const req = required.has(key);
    return req ? `${key}: ${type} (required)` : `${key}?: ${type}`;
  });
  return `{ ${fields.join(", ")} }`;
}

function formatToolResult(result: WorkflowResult): string {
  const status = result.status === "completed" ? "completed" : "failed";
  const stepSummary = Object.entries(result.steps)
    .map(([name, s]) => `${s.status === "completed" ? "\u2713" : "\u2717"} ${name}`)
    .join(", ");
  return `Workflow '${result.workflow}' ${status}: ${stepSummary}. Run dir: ${result.runDir}`;
}

// ── Command handlers ────────────────────────────────────────────────────────

async function handleList(ctx: any): Promise<void> {
  const workflows = discoverWorkflows(ctx.cwd);
  if (workflows.length === 0) {
    ctx.ui.notify("No workflows found in .pi/workflows/ or ~/.pi/agent/workflows/", "info");
    return;
  }

  const lines = workflows.map((w) => {
    const source = w.source === "project" ? "[project]" : "[user]";
    const desc = w.description ? ` \u2014 ${w.description}` : "";
    return `  ${w.name} ${source}${desc}`;
  });
  ctx.ui.notify(`Available workflows:\n${lines.join("\n")}`, "info");
}

async function handleRun(args: string[], ctx: any, pi: any): Promise<void> {
  const name = args[0];
  if (!name) {
    ctx.ui.notify("Usage: /workflow run <name> [--input '<json>']", "warning");
    return;
  }

  const spec = findWorkflow(name, ctx.cwd);
  if (!spec) {
    ctx.ui.notify(`Workflow '${name}' not found.`, "warning");
    return;
  }

  // Parse --input if provided
  let input: unknown = {};
  const inputIdx = args.indexOf("--input");
  if (inputIdx !== -1 && args[inputIdx + 1]) {
    try {
      input = JSON.parse(args[inputIdx + 1]);
    } catch {
      ctx.ui.notify("Invalid JSON for --input", "warning");
      return;
    }
  }

  try {
    await executeWorkflow(spec, input, {
      ctx,
      pi,
      loadAgent: createAgentLoader(ctx.cwd),
    });
    // Result is injected into conversation by executeWorkflow via sendMessage
  } catch (err) {
    ctx.ui.notify(
      `Workflow '${name}' failed: ${err instanceof Error ? err.message : String(err)}`,
      "error",
    );
  }
}

// ── Extension factory ───────────────────────────────────────────────────────

const extension = (pi: any) => {
  // ── Tool: workflow ──────────────────────────────────────────────────────

  pi.registerTool({
    name: "workflow",
    label: "Workflow",
    description: "Run a named workflow with typed input. Discovers workflows from .pi/workflows/ and ~/.pi/agent/workflows/.",
    promptSnippet: "Run a multi-step workflow with typed data flow between agents",
    parameters: Type.Object({
      workflow: Type.String({ description: "Name of the workflow to run" }),
      input: Type.Optional(Type.Unknown({ description: "Input data for the workflow (validated against workflow's input schema)" })),
    }),

    async execute(toolCallId: string, params: any, signal: AbortSignal, onUpdate: any, ctx: any) {
      const spec = findWorkflow(params.workflow, ctx.cwd);
      if (!spec) {
        return {
          content: [{ type: "text", text: `Workflow '${params.workflow}' not found. Available workflows: ${listWorkflowNames(ctx.cwd)}` }],
          details: undefined,
        };
      }

      // Defensive: if input arrives as a JSON string (e.g. from Type.Unknown()),
      // parse it into an object.
      let input = params.input ?? {};
      if (typeof input === "string") {
        try {
          input = JSON.parse(input);
        } catch {
          // leave as string — validation will catch it if schema expects object
        }
      }

      try {
        const result = await executeWorkflow(spec, input, {
          ctx,
          pi,
          signal,
          loadAgent: createAgentLoader(ctx.cwd),
        });

        return {
          content: [{ type: "text", text: formatToolResult(result) }],
          details: result,
        };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const schemaHint = spec.input ? `\nExpected input: ${summarizeInputSchema(spec.input)}` : "";
        return {
          content: [{ type: "text", text: `Workflow '${params.workflow}' failed: ${errMsg}${schemaHint}` }],
          details: undefined,
        };
      }
    },
  });

  // ── Command: /workflow ──────────────────────────────────────────────────

  pi.registerCommand("workflow", {
    description: "List and run workflows",
    getArgumentCompletions: (prefix: string) => {
      const subcommands = ["run", "list", "status"];
      return subcommands
        .filter((s) => s.startsWith(prefix))
        .map((s) => ({ value: s, label: s }));
    },

    async handler(args: string, ctx: any) {
      const parts = args.trim().split(/\s+/);
      const subcommand = parts[0] || "list";

      if (subcommand === "list") {
        await handleList(ctx);
      } else if (subcommand === "run") {
        await handleRun(parts.slice(1), ctx, pi);
      } else if (subcommand === "status") {
        ctx.ui.notify("No workflow currently running.", "info");
      } else {
        ctx.ui.notify(`Unknown subcommand: ${subcommand}. Use: list, run, status`, "warning");
      }
    },
  });
};

export default extension;
