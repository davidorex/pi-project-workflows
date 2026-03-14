import { parse as parseYaml } from "yaml";
import { discoverWorkflows, findWorkflow } from "./workflow-discovery.ts";
import { executeWorkflow } from "./workflow-executor.ts";
import { findIncompleteRun, validateResumeCompatibility, formatIncompleteRun } from "./checkpoint.ts";
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
    promptTemplate: frontmatter.prompt?.system || undefined,
  };
}

// ── Agent loader factory ────────────────────────────────────────────────────

export function createAgentLoader(cwd: string): (name: string) => AgentSpec {
  const demoAgentsDir = path.resolve(import.meta.dirname, "..", "demo", "agents");

  return (name: string): AgentSpec => {
    const searchPaths = [
      path.join(cwd, ".pi", "agents", `${name}.md`),
      path.join(os.homedir(), ".pi", "agent", "agents", `${name}.md`),
      path.join(demoAgentsDir, `${name}.md`),
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

async function handleList(ctx: any, pi: any): Promise<void> {
  const workflows = discoverWorkflows(ctx.cwd);
  if (workflows.length === 0) {
    ctx.ui.notify("No workflows found in .pi/workflows/ or ~/.pi/agent/workflows/", "info");
    return;
  }

  const options = workflows.map((w) => {
    const source = w.source === "project" ? "[project]" : "[user]";
    const desc = w.description ? ` — ${w.description}` : "";
    return `${w.name} ${source}${desc}`;
  });

  const selected = await ctx.ui.select("Run workflow", options);
  if (!selected) return; // user cancelled

  const name = selected.split(" ")[0];
  const spec = findWorkflow(name, ctx.cwd);
  if (!spec) {
    ctx.ui.notify(`Workflow '${name}' not found.`, "warning");
    return;
  }

  // Prompt for required input fields
  const input: Record<string, unknown> = {};
  const schema = spec.input as Record<string, unknown> | undefined;
  if (schema) {
    const props = schema.properties as Record<string, any> | undefined;
    const required = new Set(Array.isArray(schema.required) ? schema.required : []);
    if (props) {
      for (const [key, val] of Object.entries(props)) {
        if (!required.has(key) || val?.default !== undefined) continue;
        const type = val?.type || "string";
        const desc = val?.description || "";
        const prompt = desc ? `${key} (${type}): ${desc}` : `${key} (${type})`;
        const value = await ctx.ui.input(prompt);
        if (value == null) return; // user cancelled
        // Coerce from string based on declared type
        if (type === "number") {
          input[key] = Number(value);
        } else if (type === "array" || type === "object") {
          try { input[key] = JSON.parse(value); } catch { input[key] = value; }
        } else {
          input[key] = value;
        }
      }
    }
  }

  const inputJson = Object.keys(input).length > 0
    ? JSON.stringify(input)
    : undefined;
  const rawArgs = inputJson ? `${name} --input '${inputJson}'` : name;
  await handleRun(rawArgs, ctx, pi);
}

async function handleRun(rawArgs: string, ctx: any, pi: any): Promise<void> {
  // Extract workflow name (first token) and --input value (everything after --input flag)
  const inputFlagIdx = rawArgs.indexOf("--input");
  let namePart: string;
  let inputJson: string | undefined;

  if (inputFlagIdx !== -1) {
    namePart = rawArgs.slice(0, inputFlagIdx).trim();
    inputJson = rawArgs.slice(inputFlagIdx + "--input".length).trim();
    // Strip surrounding single or double quotes
    if ((inputJson.startsWith("'") && inputJson.endsWith("'")) ||
        (inputJson.startsWith('"') && inputJson.endsWith('"'))) {
      inputJson = inputJson.slice(1, -1);
    }
  } else {
    namePart = rawArgs.trim();
  }

  const name = namePart.split(/\s+/)[0];
  if (!name) {
    ctx.ui.notify("Usage: /workflow run <name> [--input '<json>']", "warning");
    return;
  }

  const spec = findWorkflow(name, ctx.cwd);
  if (!spec) {
    ctx.ui.notify(`Workflow '${name}' not found.`, "warning");
    return;
  }

  // Check for resumable run before starting fresh
  const incomplete = findIncompleteRun(ctx.cwd, spec.name);
  if (incomplete) {
    const compat = validateResumeCompatibility(incomplete.state, spec);
    if (!compat) {
      const summary = formatIncompleteRun(incomplete, spec);
      const choice = await ctx.ui.select(
        `${summary}\n\nResume this run?`,
        ["Yes — resume from checkpoint", "No — start fresh"],
      );
      if (choice === "Yes — resume from checkpoint") {
        try {
          await executeWorkflow(spec, incomplete.state.input, {
            ctx,
            pi,
            loadAgent: createAgentLoader(ctx.cwd),
            resume: {
              runId: incomplete.runId,
              runDir: incomplete.runDir,
              state: incomplete.state,
            },
          });
        } catch (err) {
          ctx.ui.notify(
            `Resume failed: ${err instanceof Error ? err.message : String(err)}`,
            "error",
          );
        }
        return;
      }
      // User chose fresh — fall through to normal execution
    }
  }

  // Parse --input if provided
  let input: unknown = {};
  if (inputJson) {
    try {
      input = JSON.parse(inputJson);
    } catch {
      ctx.ui.notify(`Invalid JSON for --input: ${inputJson}`, "warning");
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

async function handleResume(rawArgs: string, ctx: any, pi: any): Promise<void> {
  const name = rawArgs.trim().split(/\s+/)[0];
  if (!name) {
    ctx.ui.notify("Usage: /workflow resume <name>", "warning");
    return;
  }

  const spec = findWorkflow(name, ctx.cwd);
  if (!spec) {
    ctx.ui.notify(`Workflow '${name}' not found.`, "warning");
    return;
  }

  const incomplete = findIncompleteRun(ctx.cwd, spec.name);
  if (!incomplete) {
    ctx.ui.notify(`No incomplete runs found for '${name}'.`, "info");
    return;
  }

  // Validate compatibility
  const compat = validateResumeCompatibility(incomplete.state, spec);
  if (compat) {
    ctx.ui.notify(`Cannot resume: ${compat}`, "warning");
    return;
  }

  // Show summary and confirm
  const summary = formatIncompleteRun(incomplete, spec);
  const choice = await ctx.ui.select(
    `${summary}\n\nResume this run?`,
    ["Yes — resume", "No — cancel"],
  );
  if (choice !== "Yes — resume") return;

  try {
    await executeWorkflow(spec, incomplete.state.input, {
      ctx,
      pi,
      loadAgent: createAgentLoader(ctx.cwd),
      resume: {
        runId: incomplete.runId,
        runDir: incomplete.runDir,
        state: incomplete.state,
      },
    });
  } catch (err) {
    ctx.ui.notify(
      `Resume failed: ${err instanceof Error ? err.message : String(err)}`,
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
      fresh: Type.Optional(Type.String({ description: "Set to 'true' to start a fresh run, ignoring any incomplete prior runs" })),
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

      // Check for resumable run (unless explicitly requesting fresh)
      let resumeOpts: { runId: string; runDir: string; state: import("./types.ts").ExecutionState } | undefined;
      if (params.fresh !== "true") {
        const incomplete = findIncompleteRun(ctx.cwd, spec.name);
        if (incomplete) {
          const compat = validateResumeCompatibility(incomplete.state, spec);
          if (!compat) {
            resumeOpts = {
              runId: incomplete.runId,
              runDir: incomplete.runDir,
              state: incomplete.state,
            };
          }
          // If incompatible, silently start fresh
        }
      }

      try {
        const result = await executeWorkflow(spec, input, {
          ctx,
          pi,
          signal,
          loadAgent: createAgentLoader(ctx.cwd),
          resume: resumeOpts,
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
      const subcommands = ["run", "list", "status", "resume"];
      return subcommands
        .filter((s) => s.startsWith(prefix))
        .map((s) => ({ value: s, label: s }));
    },

    async handler(args: string, ctx: any) {
      const trimmed = args.trim();
      const spaceIdx = trimmed.indexOf(" ");
      const subcommand = spaceIdx === -1 ? trimmed || "list" : trimmed.slice(0, spaceIdx);
      const rest = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1);

      if (subcommand === "list") {
        await handleList(ctx, pi);
      } else if (subcommand === "run") {
        await handleRun(rest, ctx, pi);
      } else if (subcommand === "resume") {
        await handleResume(rest, ctx, pi);
      } else if (subcommand === "status") {
        ctx.ui.notify("No workflow currently running.", "info");
      } else {
        ctx.ui.notify(`Unknown subcommand: ${subcommand}. Use: list, run, resume, status`, "warning");
      }
    },
  });
};

export default extension;
