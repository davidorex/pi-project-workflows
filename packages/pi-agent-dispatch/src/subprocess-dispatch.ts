/**
 * Subprocess dispatch for the work-order loop (FGAP-124).
 *
 * The work-order loop's target agent must ACT — write files, run bash — not
 * merely produce structured output. pi-jit-agents `executeAgent` is a
 * single-turn completion primitive that binds NO executable tools (it only
 * ever passes a phantom output-schema tool; `compiled.tools` feeds the
 * the grant clamp but is never materialized as callable tools). So an
 * agent granted [write,bash] through that path receives zero tools and every
 * real work-order fails.
 *
 * Real tool execution lives only in a `pi` subprocess — the same mechanism
 * pi-workflows uses in production (`packages/pi-workflows/src/dispatch.ts`).
 * This module mirrors that proven pattern, focused to what the work-order
 * loop needs: build args, spawn `pi --mode json`, stream NDJSON stdout,
 * collect the final assistant text + usage, with timeout + cancellation.
 *
 * pi-jit-agents stays the classify / structured-output primitive per JI-021;
 * the acting-agent dispatch is a subprocess.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Grace period between SIGTERM and SIGKILL when terminating the subprocess. */
const SIGKILL_GRACE_MS = 5000;

/** Default per-dispatch timeout (10 min) — an acting agent may build/test/write. */
export const DEFAULT_DISPATCH_TIMEOUT_MS = 600_000;

/**
 * Prompt length threshold (chars) for switching to `@file` argument passing.
 * Mirrors pi-workflows dispatch — avoids OS argv length limits with headroom.
 */
const PROMPT_ARG_LIMIT = 8000;

/** Maximum stdout buffer size (10 MB) to bound memory from a runaway subprocess. */
const MAX_STDOUT_BYTES = 10 * 1024 * 1024;

export interface DispatchArgsParams {
	/** Model spec string passed straight to `--model` (supports `provider/id[:thinking]`). */
	model: string;
	/** Composed tool grant (already intersected at the dispatch boundary). */
	tools: string[];
	/**
	 * Prompt argument value — either the literal prompt text or `@<tmpfile>`
	 * for long prompts (the caller decides and rewrites this before spawn).
	 */
	promptArg: string;
}

/**
 * Pure arg construction for the `pi` subprocess. Extracted so the exact CLI
 * surface (mode, model, tools, prompt) is unit-testable without spawning.
 *
 * An EMPTY tool grant emits `--no-tools`, not an absent flag: a cleared grant
 * means "no executable tools" (default-empty), whereas omitting
 * `--tools` would let pi enable its full default tool set.
 */
export function buildDispatchArgs({ model, tools, promptArg }: DispatchArgsParams): string[] {
	const args = ["--mode", "json", "--model", model];
	if (tools.length > 0) {
		args.push("--tools", tools.join(","));
	} else {
		args.push("--no-tools");
	}
	args.push("-p", promptArg);
	return args;
}

export interface SubprocessDispatchResult {
	/** Concatenated assistant text across turns (final channel of the run). */
	text: string;
	/** The last assistant message object seen on the NDJSON stream (raw). */
	lastAssistantMessage: unknown;
	usage: { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number };
	exitCode: number | null;
	stderr: string;
	timedOut: boolean;
}

function extractText(content: unknown): string {
	if (!content || !Array.isArray(content)) return "";
	const parts: string[] = [];
	for (const part of content) {
		if (part && typeof part === "object" && "type" in part && part.type === "text" && "text" in part) {
			parts.push(String((part as { text: unknown }).text));
		}
	}
	return parts.join("");
}

export interface RunPiSubprocessOptions {
	cwd: string;
	model: string;
	tools: string[];
	prompt: string;
	timeoutMs?: number;
	signal?: AbortSignal;
}

/**
 * Spawn `pi` in JSON mode, stream NDJSON stdout, and collect the final
 * assistant text + usage. Auth + model resolution are pi's own responsibility
 * inside the subprocess (it loads the operator's auth.json) — no DispatchContext
 * auth is threaded here.
 */
export async function runPiSubprocess(options: RunPiSubprocessOptions): Promise<SubprocessDispatchResult> {
	const timeoutMs = options.timeoutMs ?? DEFAULT_DISPATCH_TIMEOUT_MS;

	// Long prompts go to a temp file passed as `-p @<file>`.
	let tmpDir: string | null = null;
	let promptArg = options.prompt;
	if (options.prompt.length > PROMPT_ARG_LIMIT) {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-wo-"));
		const promptFile = path.join(tmpDir, "prompt.md");
		fs.writeFileSync(promptFile, options.prompt, { mode: 0o600 });
		promptArg = `@${promptFile}`;
	}

	const args = buildDispatchArgs({ model: options.model, tools: options.tools, promptArg });

	const proc = spawn("pi", args, {
		cwd: options.cwd,
		env: process.env,
		stdio: ["ignore", "pipe", "pipe"],
	});

	// Cancellation
	if (options.signal) {
		const kill = () => {
			proc.kill("SIGTERM");
			setTimeout(() => {
				if (!proc.killed) proc.kill("SIGKILL");
			}, SIGKILL_GRACE_MS);
		};
		if (options.signal.aborted) kill();
		else options.signal.addEventListener("abort", kill, { once: true });
	}

	// Timeout: SIGTERM after deadline, SIGKILL after grace
	let timedOut = false;
	let killTimer: ReturnType<typeof setTimeout> | undefined;
	const timeoutTimer = setTimeout(() => {
		timedOut = true;
		proc.kill("SIGTERM");
		killTimer = setTimeout(() => {
			if (!proc.killed) proc.kill("SIGKILL");
		}, SIGKILL_GRACE_MS);
	}, timeoutMs);

	const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
	const textParts: string[] = [];
	let lastAssistantMessage: unknown;
	let stderrBuf = "";

	function processEvent(evt: { type?: string; message?: Record<string, unknown> }) {
		if (evt.type === "message_end" && evt.message && evt.message.role === "assistant") {
			lastAssistantMessage = evt.message;
			const u = evt.message.usage as
				| { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; cost?: { total?: number } }
				| undefined;
			if (u) {
				usage.input += u.input || 0;
				usage.output += u.output || 0;
				usage.cacheRead += u.cacheRead || 0;
				usage.cacheWrite += u.cacheWrite || 0;
				usage.cost += u.cost?.total || 0;
			}
			const text = extractText(evt.message.content);
			if (text) textParts.push(text);
		}
	}

	let buf = "";
	let bufBytes = 0;
	let stdoutTruncated = false;
	proc.stdout?.on("data", (chunk: Buffer) => {
		bufBytes += chunk.length;
		if (bufBytes > MAX_STDOUT_BYTES) {
			if (!stdoutTruncated) {
				stdoutTruncated = true;
				if (buf.trim()) {
					try {
						processEvent(JSON.parse(buf));
					} catch {
						// incomplete trailing line — discard
					}
					buf = "";
				}
			}
			return;
		}
		buf += chunk.toString();
		const lines = buf.split("\n");
		buf = lines.pop() || "";
		for (const line of lines) {
			if (!line.trim()) continue;
			try {
				processEvent(JSON.parse(line));
			} catch {
				// non-JSON line — skip
			}
		}
	});

	proc.stderr?.on("data", (chunk: Buffer) => {
		stderrBuf += chunk.toString();
	});

	const exitCode = await new Promise<number | null>((resolve) => {
		proc.on("close", (code) => {
			if (buf.trim()) {
				try {
					processEvent(JSON.parse(buf));
				} catch {
					// skip unparseable remainder
				}
			}
			resolve(code);
		});
	});

	clearTimeout(timeoutTimer);
	if (killTimer) clearTimeout(killTimer);
	if (tmpDir) {
		try {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		} catch {
			// best-effort cleanup
		}
	}

	return {
		text: textParts.join("\n"),
		lastAssistantMessage,
		usage,
		exitCode,
		stderr: stderrBuf.trim(),
		timedOut,
	};
}
