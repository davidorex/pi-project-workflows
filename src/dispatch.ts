import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { StepSpec, StepResult, StepUsage, AgentSpec } from "./types.ts";

export interface DispatchOptions {
  cwd: string;
  sessionLogDir: string;      // directory for session log file (e.g. <runDir>/sessions/)
  stepName: string;            // used for naming the session log file
  signal?: AbortSignal;        // for cancellation
  onEvent?: (event: ProcessEvent) => void;  // live event callback for TUI updates
}

export interface ProcessEvent {
  type: string;
  raw: unknown;                // the parsed JSON line
  // Extracted fields for common events:
  toolName?: string;           // for tool_execution_start/end
  toolArgs?: string;           // preview string for tool_execution_start
  messageText?: string;        // text content for message_end (assistant messages)
  usage?: Partial<StepUsage>;  // usage delta for message_end
}

const PROMPT_ARG_LIMIT = 8000;

export function extractText(content: unknown): string {
  if (!content || !Array.isArray(content)) return "";
  for (const part of content) {
    if (part && typeof part === "object" && "type" in part && part.type === "text" && "text" in part) {
      return String(part.text);
    }
  }
  return "";
}

export function extractToolArgsPreview(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const obj = args as Record<string, unknown>;
  for (const key of ["command", "path", "pattern", "query", "task"]) {
    if (typeof obj[key] === "string") {
      const val = obj[key] as string;
      return val.length > 60 ? val.slice(0, 57) + "..." : val;
    }
  }
  return "";
}

export function buildArgs(step: StepSpec, agentSpec: AgentSpec, prompt: string, options: DispatchOptions): string[] {
  const args = ["--mode", "json"];

  // Session log
  args.push("--session-dir", options.sessionLogDir);

  // Model: step overrides agent spec
  const model = step.model ?? agentSpec.model;
  if (model) {
    const modelArg = agentSpec.thinking ? `${model}:${agentSpec.thinking}` : model;
    args.push("--models", modelArg);
  }

  // Tool filtering
  if (agentSpec.tools?.length) {
    const builtinTools: string[] = [];
    const extensionPaths: string[] = [];
    for (const tool of agentSpec.tools) {
      if (tool.includes("/") || tool.endsWith(".ts") || tool.endsWith(".js")) {
        extensionPaths.push(tool);
      } else {
        builtinTools.push(tool);
      }
    }
    if (builtinTools.length > 0) args.push("--tools", builtinTools.join(","));
    for (const ext of extensionPaths) args.push("--extension", ext);
  }

  // Extension scoping
  if (agentSpec.extensions !== undefined) {
    args.push("--no-extensions");
    for (const ext of agentSpec.extensions) args.push("--extension", ext);
  }

  // Skill scoping
  if (agentSpec.skills?.length) {
    args.push("--no-skills");
    // Skills are injected via --append-system-prompt, not CLI flags
  }

  // System prompt (if agent spec has one)
  // Write to temp file if present, pass via --append-system-prompt
  // (handled in dispatch() body, not buildArgs)

  // Prompt — use @file for long prompts
  args.push("-p");
  args.push(prompt);  // or @<tmpfile> if prompt > 8000 chars

  return args;
}

/**
 * Spawn a pi subprocess for a workflow step and collect the result.
 *
 * Builds CLI args from the step spec and agent spec.
 * Streams stdout as newline-delimited JSON.
 * Collects messages, usage, timing.
 * Returns StepResult when the process exits.
 */
export async function dispatch(
  step: StepSpec,
  agentSpec: AgentSpec,
  prompt: string,
  options: DispatchOptions,
): Promise<StepResult> {
  const startTime = Date.now();
  const args = buildArgs(step, agentSpec, prompt, options);

  // Handle long prompts: write to temp file
  let tmpDir: string | null = null;
  if (prompt.length > PROMPT_ARG_LIMIT) {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-wf-"));
    const promptFile = path.join(tmpDir, "prompt.md");
    fs.writeFileSync(promptFile, prompt, { mode: 0o600 });
    // Replace last two args ("-p", prompt) with ("-p", "@<file>")
    args[args.length - 1] = `@${promptFile}`;
  }

  // Handle system prompt: write to temp file
  if (agentSpec.systemPrompt) {
    if (!tmpDir) tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-wf-"));
    const sysFile = path.join(tmpDir, "system.md");
    fs.writeFileSync(sysFile, agentSpec.systemPrompt, { mode: 0o600 });
    // Insert before -p flag
    const pIdx = args.indexOf("-p");
    args.splice(pIdx, 0, "--append-system-prompt", sysFile);
  }

  const proc = spawn("pi", args, {
    cwd: options.cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Cancellation support
  if (options.signal) {
    const kill = () => {
      proc.kill("SIGTERM");
      setTimeout(() => { if (!proc.killed) proc.kill("SIGKILL"); }, 3000);
    };
    if (options.signal.aborted) kill();
    else options.signal.addEventListener("abort", kill, { once: true });
  }

  // Collect result
  const messages: unknown[] = [];
  const usage: StepUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 };
  let lastAssistantText = "";
  let stderrBuf = "";

  function processEvent(evt: { type?: string; message?: any; toolName?: string; args?: any }) {
    // Track messages
    if (evt.type === "message_end" && evt.message) {
      messages.push(evt.message);
      if (evt.message.role === "assistant") {
        usage.turns++;
        const u = evt.message.usage;
        if (u) {
          usage.input += u.input || 0;
          usage.output += u.output || 0;
          usage.cacheRead += u.cacheRead || 0;
          usage.cacheWrite += u.cacheWrite || 0;
          usage.cost += u.cost?.total || 0;
        }
        // Extract text from last assistant message
        const text = extractText(evt.message.content);
        if (text) lastAssistantText = text;
      }
    }

    // Forward to TUI callback
    if (options.onEvent) {
      options.onEvent({
        type: evt.type || "unknown",
        raw: evt,
        toolName: evt.type === "tool_execution_start" ? evt.toolName : undefined,
        toolArgs: evt.type === "tool_execution_start" ? extractToolArgsPreview(evt.args) : undefined,
        messageText: evt.type === "message_end" && evt.message?.role === "assistant"
          ? extractText(evt.message.content)
          : undefined,
        usage: evt.type === "message_end" && evt.message?.role === "assistant" && evt.message.usage
          ? {
              input: evt.message.usage.input,
              output: evt.message.usage.output,
              cost: evt.message.usage.cost?.total,
            }
          : undefined,
      });
    }
  }

  // Stream stdout as newline-delimited JSON
  let buf = "";
  proc.stdout!.on("data", (chunk: Buffer) => {
    buf += chunk.toString();
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const evt = JSON.parse(line);
        processEvent(evt);
      } catch {
        // Skip unparseable lines
      }
    }
  });

  proc.stderr!.on("data", (chunk: Buffer) => {
    stderrBuf += chunk.toString();
  });

  // Wait for process to exit
  const exitCode = await new Promise<number | null>((resolve) => {
    proc.on("close", (code) => {
      // Process remaining buffer
      if (buf.trim()) {
        try {
          const evt = JSON.parse(buf);
          processEvent(evt);
        } catch {
          // Skip unparseable remainder
        }
      }
      resolve(code);
    });
  });

  // Cleanup temp files
  if (tmpDir) {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  }

  return {
    step: options.stepName,
    agent: step.agent,
    status: exitCode === 0 ? "completed" : "failed",
    output: undefined,          // structured output handled by caller (workflow-executor)
    textOutput: lastAssistantText,
    sessionLog: options.sessionLogDir,
    usage,
    durationMs: Date.now() - startTime,
    error: exitCode !== 0 ? (stderrBuf.trim() || "Process exited with code " + exitCode) : undefined,
  };
}
