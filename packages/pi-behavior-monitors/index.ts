/**
 * Behavior monitors for pi — watches agent activity, classifies against
 * pattern libraries, steers corrections, and writes structured findings
 * to JSON files for downstream consumption.
 *
 * Monitor definitions are JSON files (.monitor.json) with typed blocks:
 * classify (LLM side-channel), patterns (JSON library), actions (steer + write).
 * Patterns and instructions are JSON arrays conforming to schemas.
 */
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { readBlock } from "@davidorex/pi-project/block-api";
import { validateFromFile } from "@davidorex/pi-project/schema-validator";
import { createAgentLoader } from "@davidorex/pi-workflows/agent-spec";
import { compileAgentSpec } from "@davidorex/pi-workflows/step-shared";
import type { AgentSpec } from "@davidorex/pi-workflows/types";
import type { Api, AssistantMessage, Model, TextContent, Tool, ToolCall } from "@mariozechner/pi-ai";
import { complete, StringEnum } from "@mariozechner/pi-ai";
import type {
	AgentEndEvent,
	AgentToolResult,
	AgentToolUpdateCallback,
	ExtensionAPI,
	ExtensionContext,
	SessionEntry,
	SessionMessageEntry,
	TurnEndEvent,
} from "@mariozechner/pi-coding-agent";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import { Box, Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import nunjucks from "nunjucks";

const EXTENSION_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = path.join(EXTENSION_DIR, "..", "examples");
const AGENTS_DIR = path.join(EXTENSION_DIR, "..", "agents");

/** Tool definition for forcing structured verdict output from the classify LLM call. */
const VERDICT_TOOL: Tool = {
	name: "classify_verdict",
	description: "Output the monitor classification verdict",
	parameters: Type.Object({
		verdict: Type.String({ description: "Classification result: CLEAN, FLAG, or NEW" }),
		description: Type.Optional(Type.String({ description: "One-sentence explanation (required for FLAG/NEW)" })),
		newPattern: Type.Optional(Type.String({ description: "Pattern to learn (required for NEW)" })),
		severity: Type.Optional(Type.String({ description: "Issue severity: info, warning, or critical" })),
	}),
};

// =============================================================================
// Vocabulary registries (exported for SDK and skill generation)
// =============================================================================

export interface CollectorDescriptor {
	name: string;
	description: string;
	limits?: string;
}

export const COLLECTOR_DESCRIPTORS: CollectorDescriptor[] = [
	{ name: "user_text", description: "Most recent user message text" },
	{ name: "assistant_text", description: "Most recent assistant message text" },
	{
		name: "tool_results",
		description: "Tool results with tool name and error status",
		limits: "Last 5, truncated 2000 chars",
	},
	{ name: "tool_calls", description: "Tool calls and results interleaved", limits: "Last 20, truncated 2000 chars" },
	{ name: "custom_messages", description: "Custom extension messages since last user message" },
	{ name: "project_vision", description: ".project/project.json vision, core_value, name" },
	{ name: "project_conventions", description: ".project/conformance-reference.json principle names" },
	{ name: "git_status", description: "Output of git status --porcelain", limits: "5s timeout" },
	{
		name: "conversation_history",
		description: "Prior turn summaries (user request + actions + assistant response)",
		limits: "1-3 turns adaptive, 2000 char max",
	},
];

export interface WhenConditionDescriptor {
	name: string;
	description: string;
	parameterized: boolean;
}

export const WHEN_CONDITIONS: WhenConditionDescriptor[] = [
	{ name: "always", description: "Fire every time the event occurs", parameterized: false },
	{
		name: "has_tool_results",
		description: "Fire only if tool results present since last user message",
		parameterized: false,
	},
	{
		name: "has_file_writes",
		description: "Fire only if write or edit tool called since last user message",
		parameterized: false,
	},
	{ name: "has_bash", description: "Fire only if bash tool called since last user message", parameterized: false },
	{
		name: "every(N)",
		description: "Fire every Nth activation (counter resets when user text changes)",
		parameterized: true,
	},
	{
		name: "tool(name)",
		description: "Fire only if specific named tool called since last user message",
		parameterized: true,
	},
];

export const VERDICT_TYPES = ["clean", "flag", "new", "error"] as const;
export const SCOPE_TARGETS = ["main", "subagent", "all", "workflow"] as const;

// =============================================================================
// Types
// =============================================================================

export interface MonitorScope {
	target: "main" | "subagent" | "all" | "workflow";
	/**
	 * Spec-only filter fields — defined in monitor JSON specs for documentation
	 * and future use, but NOT enforced at runtime. The activate() path checks
	 * scope.target for steer delivery gating but does not inspect these filter
	 * fields.
	 *
	 * Cannot be enforced currently: ExtensionContext and event types
	 * (AgentEndEvent, TurnEndEvent, MessageEndEvent, etc.) do not expose
	 * the active agent name, workflow step name, or workflow name. The
	 * pi extension API would need to surface this metadata — likely via
	 * ExtensionContext fields (e.g. ctx.agentName, ctx.workflowName,
	 * ctx.stepName) or as event payload fields — before activate() can
	 * match against these filters. Until then, all monitors fire
	 * regardless of filter values, gated only by scope.target.
	 */
	filter?: {
		agent_type?: string[];
		step_name?: string;
		workflow?: string;
	};
}

export interface MonitorAction {
	steer?: string | null;
	learn_pattern?: boolean;
	write?: {
		path: string;
		schema?: string;
		merge: "append" | "upsert";
		array_field: string;
		template: Record<string, string>;
	};
}

export interface MonitorSpec {
	name: string;
	description: string;
	event: MonitorEvent;
	when: string;
	scope: MonitorScope;
	classify: {
		context: string[];
		excludes: string[];
		agent: string;
	};
	patterns: {
		path: string;
		learn: boolean;
	};
	instructions: {
		path: string;
	};
	actions: {
		on_flag?: MonitorAction | null;
		on_new?: MonitorAction | null;
		on_clean?: MonitorAction | null;
	};
	ceiling: number;
	escalate: "ask" | "dismiss";
}

export interface MonitorPattern {
	id: string;
	description: string;
	severity?: string;
	category?: string;
	examples?: string[];
	learned_at?: string;
	source?: string;
}

export interface MonitorInstruction {
	text: string;
	added_at?: string;
}

export interface Monitor extends MonitorSpec {
	dir: string;
	resolvedPatternsPath: string;
	resolvedInstructionsPath: string;
	// runtime state
	activationCount: number;
	whileCount: number;
	lastUserText: string;
	dismissed: boolean;
	bypassDedup: boolean;
	everyLastUserText: string;
	/** Consecutive classification failure count for backoff. */
	classifyFailures: number;
	/** Number of events to skip before retrying after repeated failures. */
	classifySkipRemaining: number;
}

export interface ClassifyResult {
	verdict: "clean" | "flag" | "new" | "error";
	description?: string;
	newPattern?: string;
	severity?: string;
	error?: string;
}

export interface MonitorMessageDetails {
	monitorName: string;
	verdict: "flag" | "new";
	description: string;
	steer: string;
	whileCount: number;
	ceiling: number;
}

interface BufferedSteer {
	monitor: Monitor;
	details: MonitorMessageDetails;
	content: string;
}

type MonitorEvent = "message_end" | "turn_end" | "agent_end" | "command" | "tool_call";

export const VALID_EVENTS = new Set<string>(["message_end", "turn_end", "agent_end", "command", "tool_call"]);

function isValidEvent(event: string): event is MonitorEvent {
	return VALID_EVENTS.has(event);
}

// =============================================================================
// Discovery
// =============================================================================

export function discoverMonitors(): Monitor[] {
	const dirs: string[] = [];

	// project-local
	let cwd = process.cwd();
	while (true) {
		const candidate = path.join(cwd, ".pi", "monitors");
		if (isDir(candidate)) {
			dirs.push(candidate);
			break;
		}
		// Stop at project root (.git boundary) — don't traverse into user home config
		if (isDir(path.join(cwd, ".git"))) break;
		const parent = path.dirname(cwd);
		if (parent === cwd) break;
		cwd = parent;
	}

	// global
	const globalDir = path.join(getAgentDir(), "monitors");
	if (isDir(globalDir)) dirs.push(globalDir);

	const seen = new Map<string, Monitor>();
	for (const dir of dirs) {
		for (const file of listMonitorFiles(dir)) {
			const monitor = parseMonitorJson(path.join(dir, file), dir);
			if (monitor && !seen.has(monitor.name)) {
				seen.set(monitor.name, monitor);
			}
		}
	}
	return Array.from(seen.values());
}

function isDir(p: string): boolean {
	try {
		return fs.statSync(p).isDirectory();
	} catch {
		return false;
	}
}

function listMonitorFiles(dir: string): string[] {
	try {
		return fs.readdirSync(dir).filter((f) => f.endsWith(".monitor.json"));
	} catch {
		return [];
	}
}

function parseMonitorJson(filePath: string, dir: string): Monitor | null {
	let raw: string;
	try {
		raw = fs.readFileSync(filePath, "utf-8");
	} catch {
		return null;
	}

	let spec: Record<string, unknown>;
	try {
		spec = JSON.parse(raw);
	} catch {
		console.error(`[monitors] Failed to parse ${filePath}`);
		return null;
	}

	const name = spec.name as string | undefined;
	if (!name) return null;

	const event = String(spec.event ?? "message_end");
	if (!isValidEvent(event)) {
		console.error(`[${name}] Invalid event: ${event}. Must be one of: ${[...VALID_EVENTS].join(", ")}`);
		return null;
	}

	const classify = spec.classify as Record<string, unknown> | undefined;
	if (!classify?.agent || typeof classify.agent !== "string") {
		console.error(`[${name}] Missing classify.agent — all monitors require an agent spec`);
		return null;
	}

	const patternsSpec = spec.patterns as MonitorSpec["patterns"] | undefined;
	if (!patternsSpec?.path) {
		console.error(`[${name}] Missing patterns.path`);
		return null;
	}

	const scope = spec.scope as MonitorScope | undefined;
	const instructions = spec.instructions as MonitorSpec["instructions"] | undefined;
	const actions = spec.actions as MonitorSpec["actions"] | undefined;

	return {
		name,
		description: String(spec.description ?? ""),
		event: event as MonitorEvent,
		when: String(spec.when ?? "always"),
		scope: scope ?? { target: "main" },
		classify: {
			context: Array.isArray(classify.context) ? (classify.context as string[]) : ["tool_results", "assistant_text"],
			excludes: Array.isArray(classify.excludes) ? (classify.excludes as string[]) : [],
			agent: classify.agent as string,
		},
		patterns: {
			path: patternsSpec.path,
			learn: patternsSpec.learn !== false,
		},
		instructions: {
			path: instructions?.path ?? `${name}.instructions.json`,
		},
		actions: actions ?? {},
		ceiling: Number(spec.ceiling) || 5,
		escalate: spec.escalate === "dismiss" ? "dismiss" : "ask",
		dir,
		resolvedPatternsPath: path.resolve(dir, patternsSpec.path),
		resolvedInstructionsPath: path.resolve(dir, instructions?.path ?? `${name}.instructions.json`),
		// runtime state
		activationCount: 0,
		whileCount: 0,
		lastUserText: "",
		dismissed: false,
		bypassDedup: false,
		everyLastUserText: "",
		classifyFailures: 0,
		classifySkipRemaining: 0,
	};
}

// =============================================================================
// Example seeding
// =============================================================================

export function resolveProjectMonitorsDir(): string {
	let cwd = process.cwd();
	while (true) {
		const piDir = path.join(cwd, ".pi");
		if (isDir(piDir)) return path.join(piDir, "monitors");
		// Stop at project root (.git boundary) — don't traverse into user home config
		if (isDir(path.join(cwd, ".git"))) break;
		const parent = path.dirname(cwd);
		if (parent === cwd) break;
		cwd = parent;
	}
	return path.join(process.cwd(), ".pi", "monitors");
}

function seedExamples(): number {
	if (discoverMonitors().length > 0) return 0;
	if (!isDir(EXAMPLES_DIR)) return 0;

	const targetDir = resolveProjectMonitorsDir();
	fs.mkdirSync(targetDir, { recursive: true });

	if (listMonitorFiles(targetDir).length > 0) return 0;

	const entries = fs.readdirSync(EXAMPLES_DIR, { withFileTypes: true });
	const files = entries.filter((e) => e.isFile() && e.name.endsWith(".json"));
	let copied = 0;
	for (const file of files) {
		const dest = path.join(targetDir, file.name);
		if (!fs.existsSync(dest)) {
			fs.copyFileSync(path.join(EXAMPLES_DIR, file.name), dest);
			copied++;
		}
	}

	// Also copy template subdirectories (e.g., commit-hygiene/classify.md)
	// These contain Nunjucks .md prompt templates referenced by promptTemplate
	// fields in the monitor JSON specs.
	const dirs = entries.filter((e) => e.isDirectory());
	for (const dir of dirs) {
		const srcDir = path.join(EXAMPLES_DIR, dir.name);
		const destDir = path.join(targetDir, dir.name);
		if (!fs.existsSync(destDir)) {
			copyDirRecursive(srcDir, destDir);
		}
	}

	return copied;
}

// =============================================================================
// Skill syncing
// =============================================================================

function copyDirRecursive(src: string, dest: string): void {
	fs.mkdirSync(dest, { recursive: true });
	for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
		const srcPath = path.join(src, entry.name);
		const destPath = path.join(dest, entry.name);
		if (entry.isDirectory()) {
			copyDirRecursive(srcPath, destPath);
		} else if (entry.isFile()) {
			fs.copyFileSync(srcPath, destPath);
		}
	}
}

// =============================================================================
// Context collection
// =============================================================================

const TRUNCATE = 2000;

/** Module-level flag to log .project/ missing only once per session. */
let projectDirMissingLogged = false;

function extractText(parts: readonly { type: string }[]): string {
	return parts
		.filter((b): b is TextContent => b.type === "text")
		.map((b) => b.text)
		.join("");
}

function extractUserText(parts: string | (TextContent | { type: string })[]): string {
	if (typeof parts === "string") return parts;
	if (!Array.isArray(parts)) return "";
	return parts
		.filter((b): b is TextContent => b.type === "text")
		.map((b) => b.text)
		.join("");
}

function trunc(text: string): string {
	return text.length <= TRUNCATE ? text : `${text.slice(0, TRUNCATE)} [TRUNCATED]`;
}

function isMessageEntry(entry: SessionEntry): entry is SessionMessageEntry {
	return entry.type === "message";
}

function collectUserText(branch: SessionEntry[]): string {
	let foundAssistant = false;
	for (let i = branch.length - 1; i >= 0; i--) {
		const entry = branch[i];
		if (!isMessageEntry(entry)) continue;
		if (!foundAssistant) {
			if (entry.message.role === "assistant") foundAssistant = true;
			continue;
		}
		if (entry.message.role === "user") return extractUserText(entry.message.content);
	}
	return "";
}

function collectAssistantText(branch: SessionEntry[]): string {
	for (let i = branch.length - 1; i >= 0; i--) {
		const entry = branch[i];
		if (isMessageEntry(entry) && entry.message.role === "assistant") {
			return extractText(entry.message.content);
		}
	}
	return "";
}

function collectToolResults(branch: SessionEntry[], limit = 5): string {
	const results: string[] = [];
	for (let i = branch.length - 1; i >= 0 && results.length < limit; i--) {
		const entry = branch[i];
		if (!isMessageEntry(entry) || entry.message.role !== "toolResult") continue;
		const text = extractUserText(entry.message.content);
		if (text)
			results.push(`---\n[${entry.message.toolName}${entry.message.isError ? " ERROR" : ""}] ${trunc(text)}\n---`);
	}
	return results.reverse().join("\n");
}

function collectToolCalls(branch: SessionEntry[], limit = 20): string {
	const calls: string[] = [];
	for (let i = branch.length - 1; i >= 0 && calls.length < limit; i--) {
		const entry = branch[i];
		if (!isMessageEntry(entry)) continue;
		const msg = entry.message;
		if (msg.role === "assistant") {
			for (const part of msg.content) {
				if (part.type === "toolCall") {
					calls.push(`[call ${part.name}] ${trunc(JSON.stringify(part.arguments ?? {}))}`);
				}
			}
		}
		if (msg.role === "toolResult") {
			calls.push(`[result ${msg.toolName}${msg.isError ? " ERROR" : ""}] ${trunc(extractUserText(msg.content))}`);
		}
	}
	return calls.reverse().join("\n");
}

function collectCustomMessages(branch: SessionEntry[]): string {
	const msgs: string[] = [];
	for (let i = branch.length - 1; i >= 0; i--) {
		const entry = branch[i];
		if (!isMessageEntry(entry)) continue;
		if (entry.message.role === "user") break;
		const msg = entry.message as unknown as Record<string, unknown>;
		if (msg.customType) {
			msgs.unshift(`[${msg.customType}] ${msg.content ?? ""}`);
		}
	}
	return msgs.join("\n");
}

// -- conversation_history collector ------------------------------------------

const BACKREFERENCE_PATTERNS = [
	/\bas\s+(i|we)\s+(said|mentioned|described|asked|requested|specified)/i,
	/\b(earlier|previously|before|original|initial|first)\b/i,
	/\bgo\s+back\s+to\b/i,
	/\bsame\s+(thing|as|way)\b/i,
	/\blike\s+(you|i)\s+(did|said|asked)\b/i,
	/\b(continue|keep\s+going|proceed|carry\s+on)\b/i,
	/\b(do|run|try)\s+(that|it|this)\s+(again|once\s+more)\b/i,
	/\bre-?(output|generate|create|do|run|build|make)\b/i,
];
const AFFIRMATION_PATTERN =
	/^\s*(yes|yeah|yep|correct|exactly|right|ok|okay|sure|please|go|do it|proceed)\s*[.!]?\s*$/i;
const ACTION_VERBS =
	/\b(create|write|build|implement|add|fix|update|delete|remove|refactor|test|deploy|install|configure|set up|generate)\b/i;

/**
 * Detect whether the current user message references prior conversation context
 * via backreferences, affirmations, or short messages without action verbs.
 * Exported for testing.
 */
export function isReferentialMessage(text: string): boolean {
	const hasBackref = BACKREFERENCE_PATTERNS.some((re) => re.test(text));
	const isAffirmation = AFFIRMATION_PATTERN.test(text);
	const isShortNoAction = text.length < 80 && !ACTION_VERBS.test(text);
	return hasBackref || isAffirmation || isShortNoAction;
}

function summarizeTurnTools(turnEntries: SessionEntry[]): string {
	const toolMap = new Map<string, { count: number; errors: number }>();
	for (const entry of turnEntries) {
		if (!isMessageEntry(entry)) continue;
		const msg = entry.message;
		if (msg.role === "assistant") {
			for (const part of msg.content) {
				if (part.type === "toolCall") {
					const existing = toolMap.get(part.name);
					if (existing) {
						existing.count++;
					} else {
						toolMap.set(part.name, { count: 1, errors: 0 });
					}
				}
			}
		}
		if (msg.role === "toolResult" && msg.isError) {
			const existing = toolMap.get(msg.toolName);
			if (existing) {
				existing.errors++;
			}
		}
	}
	if (toolMap.size === 0) return "[no tools]";
	const parts: string[] = [];
	for (const [name, stats] of toolMap) {
		if (stats.errors > 0) {
			parts.push(`${name}(${stats.count}, ${stats.errors} error${stats.errors > 1 ? "s" : ""})`);
		} else {
			parts.push(`${name}(${stats.count})`);
		}
	}
	return parts.join(", ");
}

function truncShort(text: string, max: number): string {
	return text.length <= max ? text : `${text.slice(0, max)}…`;
}

export function collectConversationHistory(branch: SessionEntry[]): string {
	// Step A — Segment turns by finding user message indices
	const userIndices: number[] = [];
	for (let i = 0; i < branch.length; i++) {
		const entry = branch[i];
		if (isMessageEntry(entry) && entry.message.role === "user") {
			userIndices.push(i);
		}
	}

	// Need at least 2 user messages (current + 1 prior) for history
	if (userIndices.length < 2) return "";

	// Step B — Determine window size from current user text
	const currentUserText = collectUserText(branch);
	const referential = isReferentialMessage(currentUserText);
	const maxTurns = referential ? 3 : 1;

	// Prior turns are all user-message-initiated segments except the last one
	const priorTurnCount = userIndices.length - 1;
	const turnsToInclude = Math.min(maxTurns, priorTurnCount);
	// Take the last N prior turns (skip current turn which is the last userIndex)
	const startTurnIdx = priorTurnCount - turnsToInclude;

	// Step C — Summarize prior turns
	const turnSummaries: string[] = [];
	for (let t = startTurnIdx; t < priorTurnCount; t++) {
		const turnStart = userIndices[t];
		const turnEnd = userIndices[t + 1]; // next user message starts the next turn
		const turnEntries = branch.slice(turnStart, turnEnd);

		// User text from the first entry of the turn
		const firstEntry = turnEntries[0];
		const userText =
			isMessageEntry(firstEntry) && firstEntry.message.role === "user"
				? extractUserText(firstEntry.message.content)
				: "";

		// Actions
		const actions = summarizeTurnTools(turnEntries);

		// Assistant conclusion: last assistant message in turn with text content
		let assistantConclusion = "[tool actions only]";
		for (let i = turnEntries.length - 1; i >= 0; i--) {
			const e = turnEntries[i];
			if (isMessageEntry(e) && e.message.role === "assistant") {
				const text = extractText(e.message.content);
				if (text.trim()) {
					assistantConclusion = truncShort(text.trim(), 200);
					break;
				}
			}
		}

		turnSummaries.push(
			`--- Prior turn ---\nUser: "${truncShort(userText, 200)}"\nActions: ${actions}\nAssistant: "${assistantConclusion}"`,
		);
	}

	if (turnSummaries.length === 0) return "";

	// Step D & E — Format and enforce budget
	let result = turnSummaries.join("\n\n");
	while (result.length > TRUNCATE && turnSummaries.length > 1) {
		turnSummaries.shift(); // drop oldest
		result = turnSummaries.join("\n\n");
	}

	// If single turn still exceeds budget, truncate user and assistant text
	if (result.length > TRUNCATE && turnSummaries.length === 1) {
		const firstEntry = branch[userIndices[startTurnIdx]];
		const userText =
			isMessageEntry(firstEntry) && firstEntry.message.role === "user"
				? extractUserText(firstEntry.message.content)
				: "";
		const turnStart = userIndices[startTurnIdx];
		const turnEnd = userIndices[startTurnIdx + 1];
		const turnEntries = branch.slice(turnStart, turnEnd);
		const actions = summarizeTurnTools(turnEntries);

		let assistantConclusion = "[tool actions only]";
		for (let i = turnEntries.length - 1; i >= 0; i--) {
			const e = turnEntries[i];
			if (isMessageEntry(e) && e.message.role === "assistant") {
				const text = extractText(e.message.content);
				if (text.trim()) {
					assistantConclusion = truncShort(text.trim(), 100);
					break;
				}
			}
		}

		result = `--- Prior turn ---\nUser: "${truncShort(userText, 100)}"\nActions: ${actions}\nAssistant: "${assistantConclusion}"`;
	}

	return result;
}

function collectProjectVision(_branch: SessionEntry[]): string {
	try {
		const raw = readBlock(process.cwd(), "project") as Record<string, unknown>;
		const parts: string[] = [];
		if (raw.vision) parts.push(`Vision: ${raw.vision}`);
		if (raw.core_value) parts.push(`Core value: ${raw.core_value}`);
		if (raw.name) parts.push(`Project: ${raw.name}`);
		return parts.join("\n");
	} catch {
		if (!projectDirMissingLogged) {
			console.error("[monitors] .project/ not found, collectProjectVision context will be empty");
			projectDirMissingLogged = true;
		}
		return "";
	}
}

function collectProjectConventions(_branch: SessionEntry[]): string {
	try {
		const raw = readBlock(process.cwd(), "conformance-reference") as Record<string, unknown>;
		if (Array.isArray(raw.items)) {
			return raw.items.map((item: Record<string, unknown>) => `- ${item.name ?? item.id}`).join("\n");
		}
		return "";
	} catch {
		if (!projectDirMissingLogged) {
			console.error("[monitors] .project/ not found, collectProjectConventions context will be empty");
			projectDirMissingLogged = true;
		}
		return "";
	}
}

function collectGitStatus(_branch: SessionEntry[]): string {
	try {
		return execSync("git status --porcelain", { cwd: process.cwd(), encoding: "utf-8", timeout: 5000 }).trim();
	} catch {
		return "";
	}
}

const collectors: Record<string, (branch: SessionEntry[]) => string> = {
	user_text: collectUserText,
	assistant_text: collectAssistantText,
	tool_results: collectToolResults,
	tool_calls: collectToolCalls,
	custom_messages: collectCustomMessages,
	project_vision: collectProjectVision,
	project_conventions: collectProjectConventions,
	git_status: collectGitStatus,
	conversation_history: collectConversationHistory,
};

/** Collector names derived from the runtime registry — used for consistency testing. */
export const COLLECTOR_NAMES = Object.keys(collectors);

function hasToolResults(branch: SessionEntry[]): boolean {
	for (let i = branch.length - 1; i >= 0; i--) {
		const entry = branch[i];
		if (!isMessageEntry(entry)) continue;
		if (entry.message.role === "user") break;
		if (entry.message.role === "toolResult") return true;
	}
	return false;
}

function hasToolNamed(branch: SessionEntry[], name: string): boolean {
	for (let i = branch.length - 1; i >= 0; i--) {
		const entry = branch[i];
		if (!isMessageEntry(entry)) continue;
		if (entry.message.role === "user") break;
		if (entry.message.role === "assistant") {
			for (const part of entry.message.content) {
				if (part.type === "toolCall" && part.name === name) return true;
			}
		}
	}
	return false;
}

/**
 * Check whether a tool with the given name was called AND succeeded (no error)
 * since the last user message. Scans backward for an assistant toolCall with
 * the name, then looks for a corresponding toolResult that does NOT have
 * isError: true. This avoids false positives from failed writes/edits.
 */
function hasSuccessfulToolNamed(branch: SessionEntry[], name: string): boolean {
	let foundCall = false;
	for (let i = branch.length - 1; i >= 0; i--) {
		const entry = branch[i];
		if (!isMessageEntry(entry)) continue;
		if (entry.message.role === "user") break;
		if (entry.message.role === "assistant") {
			for (const part of entry.message.content) {
				if (part.type === "toolCall" && part.name === name) {
					foundCall = true;
				}
			}
		}
		if (entry.message.role === "toolResult" && entry.message.toolName === name) {
			if (!entry.message.isError) return true;
			// Found a result for this tool name but it was an error —
			// keep scanning in case an earlier call succeeded
		}
	}
	// If we found a call but no non-error result, treat as unsuccessful
	if (foundCall) return false;
	return false;
}

// =============================================================================
// When evaluation
// =============================================================================

function evaluateWhen(monitor: Monitor, branch: SessionEntry[]): boolean {
	const w = monitor.when;
	if (w === "always") return true;
	if (w === "has_tool_results") return hasToolResults(branch);
	if (w === "has_file_writes") return hasSuccessfulToolNamed(branch, "write") || hasSuccessfulToolNamed(branch, "edit");
	if (w === "has_bash") return hasToolNamed(branch, "bash");

	const everyMatch = w.match(/^every\((\d+)\)$/);
	if (everyMatch) {
		const n = parseInt(everyMatch[1], 10);
		const userText = collectUserText(branch);
		if (userText !== monitor.everyLastUserText) {
			monitor.activationCount = 0;
			monitor.everyLastUserText = userText;
		}
		monitor.activationCount++;
		if (monitor.activationCount >= n) {
			monitor.activationCount = 0;
			monitor.bypassDedup = true;
			return true;
		}
		return false;
	}

	const toolMatch = w.match(/^tool\((\w+)\)$/);
	if (toolMatch) return hasToolNamed(branch, toolMatch[1]);

	console.error(`[monitors] unknown when condition "${w}", treating as true`);
	return true;
}

// =============================================================================
// Template rendering (JSON patterns → text for LLM prompt)
// =============================================================================

function loadPatterns(monitor: Monitor): MonitorPattern[] {
	try {
		const raw = fs.readFileSync(monitor.resolvedPatternsPath, "utf-8");
		return JSON.parse(raw);
	} catch {
		return [];
	}
}

function formatPatternsForPrompt(patterns: MonitorPattern[]): string {
	return patterns.map((p, i) => `${i + 1}. [${p.severity ?? "warning"}] ${p.description}`).join("\n");
}

function loadInstructions(monitor: Monitor): MonitorInstruction[] {
	try {
		const raw = fs.readFileSync(monitor.resolvedInstructionsPath, "utf-8");
		return JSON.parse(raw);
	} catch {
		return [];
	}
}

function saveInstructions(monitor: Monitor, instructions: MonitorInstruction[]): string | null {
	const tmpPath = `${monitor.resolvedInstructionsPath}.${process.pid}.tmp`;
	try {
		fs.writeFileSync(tmpPath, `${JSON.stringify(instructions, null, 2)}\n`);
		fs.renameSync(tmpPath, monitor.resolvedInstructionsPath);
		return null;
	} catch (err) {
		try {
			fs.unlinkSync(tmpPath);
		} catch {
			/* cleanup */
		}
		return err instanceof Error ? err.message : String(err);
	}
}

// =============================================================================
// /monitors command — parsing and handlers
// =============================================================================

export type MonitorsCommand =
	| { type: "list" }
	| { type: "on" }
	| { type: "off" }
	| { type: "inspect"; name: string }
	| { type: "rules-list"; name: string }
	| { type: "rules-add"; name: string; text: string }
	| { type: "rules-remove"; name: string; index: number }
	| { type: "rules-replace"; name: string; index: number; text: string }
	| { type: "patterns-list"; name: string }
	| { type: "dismiss"; name: string }
	| { type: "reset"; name: string }
	| { type: "help" }
	| { type: "error"; message: string };

export function parseMonitorsArgs(args: string, knownNames: Set<string>): MonitorsCommand {
	const trimmed = args.trim();
	if (!trimmed) return { type: "list" };

	const tokens = trimmed.split(/\s+/);
	const first = tokens[0];

	// global commands (only if not a monitor name)
	if (!knownNames.has(first)) {
		if (first === "on") return { type: "on" };
		if (first === "off") return { type: "off" };
		if (first === "help") return { type: "help" };
		return { type: "error", message: `Unknown monitor: ${first}\nAvailable: ${[...knownNames].join(", ")}` };
	}

	const name = first;
	if (tokens.length === 1) return { type: "inspect", name };

	const verb = tokens[1];

	if (verb === "rules") {
		if (tokens.length === 2) return { type: "rules-list", name };
		const action = tokens[2];
		if (action === "add") {
			const text = tokens.slice(3).join(" ");
			if (!text) return { type: "error", message: "Usage: /monitors <name> rules add <text>" };
			return { type: "rules-add", name, text };
		}
		if (action === "remove") {
			const n = parseInt(tokens[3], 10);
			if (Number.isNaN(n) || n < 1) return { type: "error", message: "Usage: /monitors <name> rules remove <number>" };
			return { type: "rules-remove", name, index: n };
		}
		if (action === "replace") {
			const n = parseInt(tokens[3], 10);
			const text = tokens.slice(4).join(" ");
			if (Number.isNaN(n) || n < 1 || !text)
				return { type: "error", message: "Usage: /monitors <name> rules replace <number> <text>" };
			return { type: "rules-replace", name, index: n, text };
		}
		return { type: "error", message: `Unknown rules action: ${action}\nAvailable: add, remove, replace` };
	}

	if (verb === "patterns") return { type: "patterns-list", name };
	if (verb === "dismiss") return { type: "dismiss", name };
	if (verb === "reset") return { type: "reset", name };

	return { type: "error", message: `Unknown subcommand: ${verb}\nAvailable: rules, patterns, dismiss, reset` };
}

function handleList(monitors: Monitor[], ctx: ExtensionContext, enabled: boolean): void {
	const header = enabled ? "monitors: ON" : "monitors: OFF (all monitoring paused)";
	const lines = monitors.map((m) => {
		const state = m.dismissed ? "dismissed" : m.whileCount > 0 ? `engaged (${m.whileCount}/${m.ceiling})` : "idle";
		const scope = m.scope.target !== "main" ? ` [scope:${m.scope.target}]` : "";
		return `  ${m.name} [${m.event}${m.when !== "always" ? `, when: ${m.when}` : ""}]${scope} — ${state}`;
	});
	ctx.ui.notify(`${header}\n${lines.join("\n")}`, "info");
}

function handleInspect(monitor: Monitor, ctx: ExtensionContext): void {
	const rules = loadInstructions(monitor);
	const patterns = loadPatterns(monitor);
	const state = monitor.dismissed
		? "dismissed"
		: monitor.whileCount > 0
			? `engaged (${monitor.whileCount}/${monitor.ceiling})`
			: "idle";
	const lines = [
		`[${monitor.name}] ${monitor.description}`,
		`event: ${monitor.event}, when: ${monitor.when}, scope: ${monitor.scope.target}`,
		`state: ${state}, ceiling: ${monitor.ceiling}, escalate: ${monitor.escalate}`,
		`rules: ${rules.length}, patterns: ${patterns.length}`,
	];
	ctx.ui.notify(lines.join("\n"), "info");
}

function handleRulesList(monitor: Monitor, ctx: ExtensionContext): void {
	const rules = loadInstructions(monitor);
	if (rules.length === 0) {
		ctx.ui.notify(`[${monitor.name}] (no rules)`, "info");
		return;
	}
	const lines = rules.map((r, i) => `${i + 1}. ${r.text}`);
	ctx.ui.notify(`[${monitor.name}] rules:\n${lines.join("\n")}`, "info");
}

function handleRulesAdd(monitor: Monitor, ctx: ExtensionContext, text: string): void {
	const rules = loadInstructions(monitor);
	rules.push({ text, added_at: new Date().toISOString() });
	const err = saveInstructions(monitor, rules);
	if (err) {
		ctx.ui.notify(`[${monitor.name}] Failed to save: ${err}`, "error");
	} else {
		ctx.ui.notify(`[${monitor.name}] Rule added: ${text}`, "info");
	}
}

function handleRulesRemove(monitor: Monitor, ctx: ExtensionContext, index: number): void {
	const rules = loadInstructions(monitor);
	if (index < 1 || index > rules.length) {
		ctx.ui.notify(`[${monitor.name}] Invalid index ${index}. Have ${rules.length} rules.`, "error");
		return;
	}
	const removed = rules.splice(index - 1, 1)[0];
	const err = saveInstructions(monitor, rules);
	if (err) {
		ctx.ui.notify(`[${monitor.name}] Failed to save: ${err}`, "error");
	} else {
		ctx.ui.notify(`[${monitor.name}] Removed rule ${index}: ${removed.text}`, "info");
	}
}

function handleRulesReplace(monitor: Monitor, ctx: ExtensionContext, index: number, text: string): void {
	const rules = loadInstructions(monitor);
	if (index < 1 || index > rules.length) {
		ctx.ui.notify(`[${monitor.name}] Invalid index ${index}. Have ${rules.length} rules.`, "error");
		return;
	}
	const old = rules[index - 1].text;
	rules[index - 1] = { text, added_at: new Date().toISOString() };
	const err = saveInstructions(monitor, rules);
	if (err) {
		ctx.ui.notify(`[${monitor.name}] Failed to save: ${err}`, "error");
	} else {
		ctx.ui.notify(`[${monitor.name}] Replaced rule ${index}:\n  was: ${old}\n  now: ${text}`, "info");
	}
}

function handlePatternsList(monitor: Monitor, ctx: ExtensionContext): void {
	const patterns = loadPatterns(monitor);
	if (patterns.length === 0) {
		ctx.ui.notify(`[${monitor.name}] (no patterns — monitor will not classify)`, "info");
		return;
	}
	const lines = patterns.map((p, i) => {
		const source = p.source ? ` (${p.source})` : "";
		return `${i + 1}. [${p.severity ?? "warning"}] ${p.description}${source}`;
	});
	ctx.ui.notify(`[${monitor.name}] patterns:\n${lines.join("\n")}`, "info");
}

function formatInstructionsForPrompt(instructions: MonitorInstruction[]): string {
	if (instructions.length === 0) return "";
	const lines = instructions.map((i) => `- ${i.text}`).join("\n");
	return `\nOperating instructions from the user (follow these strictly):\n${lines}\n`;
}

// =============================================================================
// Classification
// =============================================================================

export function parseVerdict(raw: string): ClassifyResult {
	const text = raw.trim();
	if (text.startsWith("CLEAN")) return { verdict: "clean" };
	if (text.startsWith("NEW:")) {
		const rest = text.slice(4);
		const pipe = rest.indexOf("|");
		if (pipe !== -1)
			return { verdict: "new", newPattern: rest.slice(0, pipe).trim(), description: rest.slice(pipe + 1).trim() };
		return { verdict: "new", newPattern: rest.trim(), description: rest.trim() };
	}
	if (text.startsWith("FLAG:")) return { verdict: "flag", description: text.slice(5).trim() };
	console.error(`[monitors] unrecognized verdict format: "${text.slice(0, 80)}"`);
	return { verdict: "error", error: `Unrecognized verdict format: "${text.slice(0, 80)}"` };
}

export function parseModelSpec(spec: string): { provider: string; modelId: string } {
	const slashIndex = spec.indexOf("/");
	if (slashIndex !== -1) {
		return { provider: spec.slice(0, slashIndex), modelId: spec.slice(slashIndex + 1) };
	}
	return { provider: "anthropic", modelId: spec };
}

/**
 * Extract response text from LLM response parts, falling back to thinking
 * block content when no text parts are present. Fixes issue-024 where
 * models with thinking enabled place the entire verdict inside the thinking
 * block, leaving text content empty.
 */
export function extractResponseText(parts: readonly { type: string }[]): string {
	const text = parts
		.filter((b): b is TextContent => b.type === "text")
		.map((b) => b.text)
		.join("");
	if (text.trim()) return text;
	for (const part of parts) {
		if (part.type === "thinking" && "thinking" in part) return (part as { type: string; thinking: string }).thinking;
	}
	return "";
}

/**
 * Map a parsed JSON verdict object to a ClassifyResult.
 * Handles case-insensitive verdict strings and optional fields.
 */
export function mapVerdictToClassifyResult(parsed: Record<string, unknown>): ClassifyResult {
	const verdict = String(parsed.verdict).toUpperCase();
	if (verdict === "CLEAN") return { verdict: "clean" };
	if (verdict === "FLAG")
		return {
			verdict: "flag",
			description: String(parsed.description ?? ""),
			severity: parsed.severity as string | undefined,
		};
	if (verdict === "NEW")
		return {
			verdict: "new",
			description: String(parsed.description ?? ""),
			newPattern: String(parsed.newPattern ?? parsed.description ?? ""),
			severity: parsed.severity as string | undefined,
		};
	return { verdict: "error", error: `Unknown verdict: ${verdict}` };
}

/**
 * Create a merged Nunjucks template environment combining monitor search paths
 * (for classify templates) with agent template search paths (for shared macros).
 * Monitor paths take precedence.
 */
function createMonitorAgentTemplateEnv(cwd: string): nunjucks.Environment {
	const projectMonitorsDir = resolveProjectMonitorsDir();
	const userMonitorsDir = path.join(os.homedir(), ".pi", "agent", "monitors");
	const projectTemplatesDir = path.join(cwd, ".pi", "templates");
	const userTemplatesDir = path.join(os.homedir(), ".pi", "agent", "templates");

	const searchPaths: string[] = [];
	// Monitor paths first — monitor templates take precedence
	if (isDir(projectMonitorsDir)) searchPaths.push(projectMonitorsDir);
	if (isDir(userMonitorsDir)) searchPaths.push(userMonitorsDir);
	if (isDir(EXAMPLES_DIR)) searchPaths.push(EXAMPLES_DIR);
	// Agent template paths — for shared macros and fallback
	if (isDir(projectTemplatesDir)) searchPaths.push(projectTemplatesDir);
	if (isDir(userTemplatesDir)) searchPaths.push(userTemplatesDir);

	const loader = searchPaths.length > 0 ? new nunjucks.FileSystemLoader(searchPaths) : undefined;

	return new nunjucks.Environment(loader, {
		autoescape: false,
		throwOnUndefined: false,
	});
}

/** Module-level cached agent loader, populated at session_start. */
let cachedAgentLoader: ((name: string) => AgentSpec) | null = null;

/** Module-level cached template environment for classify agent specs, populated at session_start. */
let cachedMonitorAgentEnv: nunjucks.Environment | null = null;

/**
 * Classify via agent spec — the sole classify path.
 * Loads the agent YAML, builds context from collectors, compiles via
 * compileAgentSpec, calls complete() in-process, validates JSON verdict
 * against outputSchema, falls back to parseVerdict() for robustness.
 */
async function classifyViaAgent(
	ctx: ExtensionContext,
	monitor: Monitor,
	branch: SessionEntry[],
	extraContext?: Record<string, string>,
	signal?: AbortSignal,
): Promise<ClassifyResult> {
	const agentName = monitor.classify.agent;

	// Load agent spec (use session cache if available)
	const loadAgent = cachedAgentLoader ?? createAgentLoader(process.cwd(), AGENTS_DIR);
	const agentSpec = loadAgent(agentName);

	// Build context: collectors + patterns + instructions + json_output
	const patterns = loadPatterns(monitor);
	const instructions = loadInstructions(monitor);

	const collected: Record<string, unknown> = {};
	for (const key of monitor.classify.context) {
		const fn = collectors[key];
		if (fn) collected[key] = fn(branch);
		else collected[key] = "";
	}

	const templateContext: Record<string, unknown> = {
		patterns: formatPatternsForPrompt(patterns),
		instructions: formatInstructionsForPrompt(instructions),
		iteration: monitor.whileCount,
		json_output: true,
		...collected,
		...(extraContext ?? {}),
	};

	// Use session-cached template environment or create one
	const mergedEnv = cachedMonitorAgentEnv ?? createMonitorAgentTemplateEnv(process.cwd());
	const compiled = compileAgentSpec(agentSpec, templateContext, mergedEnv, process.cwd());

	// The task template is the compiled classify prompt
	const prompt = compiled.taskTemplate;
	if (!prompt) throw new Error(`Agent ${agentName}: compiled task template is empty`);

	// Resolve model from agent spec
	const modelSpec = compiled.model;
	if (!modelSpec) throw new Error(`Agent ${agentName}: no model specified`);
	const { provider, modelId } = parseModelSpec(modelSpec);
	const model = ctx.modelRegistry.find(provider, modelId);
	if (!model) throw new Error(`Model ${modelSpec} not found`);

	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok) throw new Error(auth.error);

	// Determine thinking from agent spec
	const thinkingEnabled = compiled.thinking === "on" || compiled.thinking === "true";

	const response: AssistantMessage = await complete(
		model as Model<Api>,
		{
			messages: [{ role: "user", content: [{ type: "text", text: prompt }], timestamp: Date.now() }],
			tools: [VERDICT_TOOL],
		},
		{
			apiKey: auth.apiKey,
			headers: auth.headers,
			maxTokens: 1024,
			signal,
			thinkingEnabled,
			effort: "low",
			toolChoice: { type: "tool", name: "classify_verdict" },
		},
	);

	const toolCall = response.content.find((c): c is ToolCall => c.type === "toolCall");
	if (!toolCall) {
		const contentTypes = response.content.map((c) => c.type).join(", ");
		return {
			verdict: "error",
			error: `No tool call in response (stopReason: ${response.stopReason}, content: [${contentTypes}])`,
		};
	}
	const parsed = toolCall.arguments as Record<string, unknown>;

	// Validate against verdict schema if the agent spec declares one
	if (compiled.outputSchema) {
		const schemaPath = path.isAbsolute(compiled.outputSchema)
			? compiled.outputSchema
			: path.resolve(AGENTS_DIR, compiled.outputSchema);
		validateFromFile(schemaPath, parsed, `verdict for monitor '${monitor.name}'`);
	}
	return mapVerdictToClassifyResult(parsed);
}

// =============================================================================
// Pattern learning (JSON)
// =============================================================================

function learnPattern(monitor: Monitor, description: string, severity = "warning"): void {
	const patterns = loadPatterns(monitor);
	const id = description
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.slice(0, 60);

	// dedup by ID — two different descriptions can slugify to the same ID,
	// so check ID rather than raw description to avoid collisions
	if (patterns.some((p) => p.id === id)) return;

	patterns.push({
		id,
		description,
		severity,
		source: "learned",
		learned_at: new Date().toISOString(),
	});

	const tmpPath = `${monitor.resolvedPatternsPath}.${process.pid}.tmp`;
	try {
		fs.writeFileSync(tmpPath, `${JSON.stringify(patterns, null, 2)}\n`);
		fs.renameSync(tmpPath, monitor.resolvedPatternsPath);
	} catch (err) {
		try {
			fs.unlinkSync(tmpPath);
		} catch {
			/* cleanup */
		}
		console.error(`[${monitor.name}] Failed to write pattern: ${err instanceof Error ? err.message : err}`);
	}
}

// =============================================================================
// Action execution — write findings to JSON files
// =============================================================================

export function generateFindingId(monitorName: string, _description: string): string {
	return `${monitorName}-${Date.now().toString(36)}`;
}

function executeWriteAction(monitor: Monitor, action: MonitorAction, result: ClassifyResult): void {
	if (!action.write) return;

	const writeCfg = action.write;
	const filePath = path.isAbsolute(writeCfg.path) ? writeCfg.path : path.resolve(process.cwd(), writeCfg.path);

	// Build the entry from template, substituting placeholders
	const findingId = generateFindingId(monitor.name, result.description ?? "unknown");
	const entry: Record<string, unknown> = {};
	for (const [key, tmpl] of Object.entries(writeCfg.template)) {
		entry[key] = String(tmpl)
			.replace(/\{finding_id\}/g, findingId)
			.replace(/\{description\}/g, result.description ?? "Issue detected")
			.replace(/\{severity\}/g, result.severity ?? "warning")
			.replace(/\{monitor_name\}/g, monitor.name)
			.replace(/\{timestamp\}/g, new Date().toISOString());
	}

	// Read existing file or create structure
	let data: Record<string, unknown> = {};
	try {
		data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
	} catch {
		// file doesn't exist or is invalid — create fresh
	}

	const arrayField = writeCfg.array_field;
	if (!Array.isArray(data[arrayField])) {
		data[arrayField] = [];
	}
	const arr = data[arrayField] as Record<string, unknown>[];

	if (writeCfg.merge === "upsert") {
		const idx = arr.findIndex((item) => item.id === entry.id);
		if (idx !== -1) {
			arr[idx] = entry;
		} else {
			arr.push(entry);
		}
	} else {
		arr.push(entry);
	}

	const tmpPath = `${filePath}.${process.pid}.tmp`;
	try {
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`);
		fs.renameSync(tmpPath, filePath);
	} catch (err) {
		try {
			fs.unlinkSync(tmpPath);
		} catch {
			/* cleanup */
		}
		console.error(`[${monitor.name}] Failed to write to ${filePath}: ${err instanceof Error ? err.message : err}`);
	}
}

// =============================================================================
// Activation
// =============================================================================

let monitorsEnabled = true;
let loadedMonitors: Monitor[] = [];
let invokeCtx: ExtensionContext | undefined;

/**
 * Programmatic monitor invocation — runs classification and write actions for
 * a named monitor, returning the verdict. Unlike activate(), this skips dedup,
 * ceiling, steering, and buffering. Designed for synchronous pre-dispatch
 * gating where callers need the ClassifyResult before proceeding.
 *
 * The monitor must be loaded (discovered at extension init). If the monitor
 * has no patterns, returns CLEAN (nothing to classify against).
 *
 * @param name - Monitor name (matches .monitor.json `name` field)
 * @param context - Optional key-value pairs injected as additional template
 *   variables alongside the standard collectors. Keys that collide with
 *   collector names override the collector output for this invocation.
 */
export async function invokeMonitor(name: string, context?: Record<string, string>): Promise<ClassifyResult> {
	const monitor = loadedMonitors.find((m) => m.name === name);
	if (!monitor) throw new Error(`Monitor "${name}" not found — check .pi/monitors/ or bundled examples`);
	if (!invokeCtx) throw new Error("Monitor extension not initialized — invokeMonitor requires an active session");
	if (!monitorsEnabled) return { verdict: "clean" };
	if (monitor.dismissed) return { verdict: "clean" };

	const patterns = loadPatterns(monitor);
	if (patterns.length === 0) return { verdict: "clean" };

	const branch = invokeCtx.sessionManager.getBranch();

	const result = await classifyViaAgent(invokeCtx, monitor, branch, context);

	// Execute write actions (findings files) based on verdict
	if (result.verdict === "clean") {
		const cleanAction = monitor.actions.on_clean;
		if (cleanAction) executeWriteAction(monitor, cleanAction, result);
	} else {
		const action = result.verdict === "new" ? monitor.actions.on_new : monitor.actions.on_flag;
		if (action) {
			if (result.verdict === "new" && result.newPattern && action.learn_pattern) {
				learnPattern(monitor, result.newPattern, result.severity);
			}
			executeWriteAction(monitor, action, result);
		}
	}

	return result;
}

async function activate(
	monitor: Monitor,
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	branch: SessionEntry[],
	steeredThisTurn: Set<string>,
	updateStatus: () => void,
	pendingAgentEndSteers: BufferedSteer[],
): Promise<void> {
	if (!monitorsEnabled) return;
	if (monitor.dismissed) return;

	// check excludes
	for (const ex of monitor.classify.excludes) {
		if (steeredThisTurn.has(ex)) return;
	}

	if (!evaluateWhen(monitor, branch)) return;

	// dedup: skip if user text unchanged since last classification
	// (bypassDedup is set by every(N) when the Nth activation fires)
	const currentUserText = collectUserText(branch);
	const skipDedup = monitor.bypassDedup;
	monitor.bypassDedup = false;
	if (!skipDedup && currentUserText && currentUserText === monitor.lastUserText) return;

	// ceiling check
	if (monitor.whileCount >= monitor.ceiling) {
		await escalate(monitor, pi, ctx);
		updateStatus();
		return;
	}

	// Backoff: skip classification if this monitor has failed repeatedly
	if (monitor.classifySkipRemaining > 0) {
		monitor.classifySkipRemaining--;
		return;
	}

	let result: ClassifyResult;
	try {
		result = await classifyViaAgent(ctx, monitor, branch, undefined, undefined);
	} catch (e: unknown) {
		const message = e instanceof Error ? e.message : String(e);
		monitor.classifyFailures++;
		if (monitor.classifyFailures >= 3) {
			// After 3 consecutive failures, skip the next 5 events before retrying
			monitor.classifySkipRemaining = 5;
			console.error(
				`[${monitor.name}] Classification failed 3 times consecutively, backing off for 5 events: ${message}`,
			);
		} else if (ctx.hasUI) {
			ctx.ui.notify(`[${monitor.name}] Classification failed: ${message}`, "error");
		} else {
			console.error(`[${monitor.name}] Classification failed: ${message}`);
		}
		return;
	}

	// Reset failure counter on successful classification
	monitor.classifyFailures = 0;

	// mark this user text as classified
	monitor.lastUserText = currentUserText;

	if (result.verdict === "clean") {
		const cleanAction = monitor.actions.on_clean;
		if (cleanAction) {
			executeWriteAction(monitor, cleanAction, result);
		}
		// Command-invoked monitors always report their verdict — the user explicitly asked
		if (monitor.event === "command") {
			pi.sendMessage(
				{ customType: "monitor-result", content: `[${monitor.name}] CLEAN — no issues detected.`, display: true },
				{ triggerTurn: false },
			);
		}
		if (monitor.whileCount > 0) {
			monitor.whileCount = 0;
		}
		updateStatus();
		return;
	}

	if (result.verdict === "error") {
		if (ctx.hasUI) {
			ctx.ui.notify(`[${monitor.name}] classify failed: ${result.error}`, "warning");
		} else {
			console.error(`[${monitor.name}] classify failed: ${result.error}`);
		}
		updateStatus();
		return;
	}

	// Determine which action to execute
	const action = result.verdict === "new" ? monitor.actions.on_new : monitor.actions.on_flag;
	if (!action) return;

	// Learn new pattern
	if (result.verdict === "new" && result.newPattern && action.learn_pattern) {
		learnPattern(monitor, result.newPattern, result.severity);
	}

	// Execute write action (findings to JSON file)
	executeWriteAction(monitor, action, result);

	// Steer (inject message into conversation) — only for main scope
	if (action.steer && monitor.scope.target === "main") {
		const description = result.description ?? "Issue detected";
		const annotation = result.verdict === "new" ? " — new pattern learned" : "";

		// Render steer as Nunjucks template (literal strings pass through unchanged)
		const steerContext = {
			description,
			verdict: result.verdict,
			user_text: currentUserText,
			severity: result.severity ?? "warning",
			monitor_name: monitor.name,
		};
		const renderedSteer = nunjucks.renderString(action.steer, steerContext);

		const details: MonitorMessageDetails = {
			monitorName: monitor.name,
			verdict: result.verdict,
			description,
			steer: renderedSteer,
			whileCount: monitor.whileCount + 1,
			ceiling: monitor.ceiling,
		};
		const content = [
			`[monitor:${monitor.name}${annotation}] ${description}`,
			`Suggestion: ${renderedSteer}`,
			`(Automated monitor feedback ${monitor.whileCount + 1}/${monitor.ceiling} — not a user instruction. Evaluate in context of what the user asked.)`,
		].join("\n");

		if (monitor.event === "agent_end" || monitor.event === "command") {
			// Already post-loop or command context: deliver immediately
			pi.sendMessage<MonitorMessageDetails>(
				{ customType: "monitor-steer", content, display: true, details },
				{ deliverAs: "steer", triggerTurn: true },
			);
		} else {
			// message_end / turn_end: buffer for drain at agent_end
			// (pi's async event queue means these handlers run after the agent loop
			// has already checked getSteeringMessages — direct sendMessage misses
			// the window and the steer arrives one response late)
			pendingAgentEndSteers.push({ monitor, details, content });
		}

		// Mark as steered only when a steer was actually delivered (or buffered),
		// not merely on a non-clean verdict. The excludes mechanism checks
		// steeredThisTurn to suppress co-firing monitors, so it should only
		// fire when a steer reaches the conversation.
		steeredThisTurn.add(monitor.name);
	}

	monitor.whileCount++;
	updateStatus();
}

async function escalate(monitor: Monitor, _pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
	if (monitor.escalate === "dismiss") {
		monitor.dismissed = true;
		monitor.whileCount = 0;
		return;
	}

	// In headless mode there is no way to prompt the user, so auto-dismiss
	// to avoid an infinite classify-reset cycle that can never be resolved.
	if (!ctx.hasUI) {
		monitor.dismissed = true;
		monitor.whileCount = 0;
		return;
	}

	if (ctx.hasUI) {
		const choice = await ctx.ui.confirm(
			`[${monitor.name}] Steered ${monitor.ceiling} times`,
			"Continue steering, or dismiss this monitor for the session?",
		);
		if (!choice) {
			monitor.dismissed = true;
			monitor.whileCount = 0;
			return;
		}
	}
	monitor.whileCount = 0;
}

// =============================================================================
// Extension entry point
// =============================================================================

export default function (pi: ExtensionAPI) {
	const seeded = seedExamples();

	const monitors = discoverMonitors();
	loadedMonitors = monitors;
	if (monitors.length === 0) return;

	let statusCtx: ExtensionContext | undefined;

	function updateStatus(): void {
		if (!statusCtx?.hasUI) return;
		const theme = statusCtx.ui.theme;

		if (!monitorsEnabled) {
			statusCtx.ui.setStatus("monitors", `${theme.fg("dim", "monitors:")}${theme.fg("warning", "OFF")}`);
			return;
		}

		const engaged = monitors.filter((m) => m.whileCount > 0 && !m.dismissed);
		const dismissed = monitors.filter((m) => m.dismissed);

		if (engaged.length === 0 && dismissed.length === 0) {
			const count = theme.fg("dim", `${monitors.length}`);
			statusCtx.ui.setStatus("monitors", `${theme.fg("dim", "monitors:")}${count}`);
			return;
		}

		const parts: string[] = [];
		for (const m of engaged) {
			parts.push(theme.fg("warning", `${m.name}(${m.whileCount}/${m.ceiling})`));
		}
		if (dismissed.length > 0) {
			parts.push(theme.fg("dim", `${dismissed.length} dismissed`));
		}
		statusCtx.ui.setStatus("monitors", `${theme.fg("dim", "monitors:")}${parts.join(" ")}`);
	}

	pi.on("session_start", async (_event: unknown, ctx: ExtensionContext) => {
		try {
			statusCtx = ctx;
			invokeCtx = ctx;
			if (seeded > 0 && ctx.hasUI) {
				const dir = resolveProjectMonitorsDir();
				ctx.ui.notify(`Seeded ${seeded} example monitor files into ${dir}\nEdit or delete them to customize.`, "info");
			}
			// Reset per-monitor state for the new session. This covers both
			// fresh sessions and what was previously handled by session_switch
			// (which pi upstream is removing). Resetting here means every
			// session_start gets a clean slate regardless of prior state.
			for (const m of monitors) {
				m.whileCount = 0;
				m.dismissed = false;
				m.lastUserText = "";
				m.activationCount = 0;
				m.bypassDedup = false;
				m.everyLastUserText = "";
				m.classifyFailures = 0;
				m.classifySkipRemaining = 0;
			}
			monitorsEnabled = true;
			pendingAgentEndSteers = [];
			projectDirMissingLogged = false;
			// Cache agent loader and template environment for classify calls
			cachedAgentLoader = createAgentLoader(process.cwd(), AGENTS_DIR);
			cachedMonitorAgentEnv = createMonitorAgentTemplateEnv(process.cwd());
			updateStatus();
		} catch {
			/* startup errors should not block session */
		}
	});

	// ── Tool: monitors-status ──────────────────────────────────────────────

	pi.registerTool({
		name: "monitors-status",
		label: "Monitors Status",
		description: "List all behavior monitors with their current state.",
		promptSnippet: "List all behavior monitors with their current state",
		parameters: Type.Object({}),
		async execute(
			_toolCallId: string,
			_params: Record<string, never>,
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			_ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const status = monitors.map((m) => ({
				name: m.name,
				description: m.description,
				event: m.event,
				when: m.when,
				enabled: monitorsEnabled,
				dismissed: m.dismissed,
				whileCount: m.whileCount,
				ceiling: m.ceiling,
			}));
			return {
				details: undefined,
				content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
			};
		},
	});

	// ── Tool: monitors-inspect ─────────────────────────────────────────────

	pi.registerTool({
		name: "monitors-inspect",
		label: "Monitors Inspect",
		description: "Inspect a monitor — config, state, pattern count, rule count.",
		promptSnippet: "Inspect a monitor — config, state, pattern count, rule count",
		parameters: Type.Object({
			monitor: Type.String({ description: "Monitor name" }),
		}),
		async execute(
			_toolCallId: string,
			params: { monitor: string },
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			_ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const monitor = monitors.find((m) => m.name === params.monitor);
			if (!monitor) throw new Error(`Unknown monitor: ${params.monitor}`);

			const patterns = loadPatterns(monitor);
			const instructions = loadInstructions(monitor);
			const state = monitor.dismissed
				? "dismissed"
				: monitor.whileCount > 0
					? `engaged (${monitor.whileCount}/${monitor.ceiling})`
					: "idle";

			const info = {
				name: monitor.name,
				description: monitor.description,
				event: monitor.event,
				when: monitor.when,
				scope: monitor.scope,
				classify: {
					agent: monitor.classify.agent,
					context: monitor.classify.context,
					excludes: monitor.classify.excludes,
				},
				patterns: { path: monitor.patterns.path, learn: monitor.patterns.learn, count: patterns.length },
				instructions: { path: monitor.instructions.path, count: instructions.length },
				actions: monitor.actions,
				ceiling: monitor.ceiling,
				escalate: monitor.escalate,
				state,
				enabled: monitorsEnabled,
				dismissed: monitor.dismissed,
				whileCount: monitor.whileCount,
			};
			return {
				details: undefined,
				content: [{ type: "text", text: JSON.stringify(info, null, 2) }],
			};
		},
	});

	// ── Tool: monitors-control ─────────────────────────────────────────────

	pi.registerTool({
		name: "monitors-control",
		label: "Monitors Control",
		description: "Control monitors — enable, disable, dismiss, or reset.",
		promptSnippet: "Control monitors — enable, disable, dismiss, or reset",
		parameters: Type.Object({
			action: StringEnum(["on", "off", "dismiss", "reset"] as const),
			monitor: Type.Optional(Type.String({ description: "Monitor name (required for dismiss/reset)" })),
		}),
		async execute(
			_toolCallId: string,
			params: { action: "on" | "off" | "dismiss" | "reset"; monitor?: string },
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			_ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			if (params.action === "on") {
				monitorsEnabled = true;
				updateStatus();
				return {
					details: undefined,
					content: [{ type: "text", text: "Monitors enabled" }],
				};
			}
			if (params.action === "off") {
				monitorsEnabled = false;
				updateStatus();
				return {
					details: undefined,
					content: [{ type: "text", text: "All monitors paused for this session" }],
				};
			}
			if (params.action === "dismiss") {
				if (!params.monitor) throw new Error("Monitor name required for dismiss");
				const monitor = monitors.find((m) => m.name === params.monitor);
				if (!monitor) throw new Error(`Unknown monitor: ${params.monitor}`);
				monitor.dismissed = true;
				updateStatus();
				return {
					details: undefined,
					content: [{ type: "text", text: `[${monitor.name}] Dismissed for this session` }],
				};
			}
			// reset
			if (!params.monitor) throw new Error("Monitor name required for reset");
			const monitor = monitors.find((m) => m.name === params.monitor);
			if (!monitor) throw new Error(`Unknown monitor: ${params.monitor}`);
			monitor.dismissed = false;
			monitor.whileCount = 0;
			updateStatus();
			return {
				details: undefined,
				content: [{ type: "text", text: `[${monitor.name}] Reset — dismissed=false, whileCount=0` }],
			};
		},
	});

	// ── Tool: monitors-rules ───────────────────────────────────────────────

	pi.registerTool({
		name: "monitors-rules",
		label: "Monitors Rules",
		description: "Manage monitor rules — list, add, remove, or replace calibration rules.",
		promptSnippet: "Manage monitor rules — list, add, remove, or replace calibration rules",
		parameters: Type.Object({
			monitor: Type.String({ description: "Monitor name" }),
			action: StringEnum(["list", "add", "remove", "replace"] as const),
			text: Type.Optional(Type.String({ description: "Rule text (for add/replace)" })),
			index: Type.Optional(Type.Number({ description: "Rule index, 1-based (for remove/replace)" })),
		}),
		async execute(
			_toolCallId: string,
			params: { monitor: string; action: "list" | "add" | "remove" | "replace"; text?: string; index?: number },
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			_ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const monitor = monitors.find((m) => m.name === params.monitor);
			if (!monitor) throw new Error(`Unknown monitor: ${params.monitor}`);

			if (params.action === "list") {
				const rules = loadInstructions(monitor);
				return {
					details: undefined,
					content: [{ type: "text", text: JSON.stringify(rules, null, 2) }],
				};
			}

			if (params.action === "add") {
				if (!params.text) throw new Error("text parameter required for add");
				const rules = loadInstructions(monitor);
				rules.push({ text: params.text, added_at: new Date().toISOString() });
				const err = saveInstructions(monitor, rules);
				if (err) throw new Error(`Failed to save rules: ${err}`);
				return {
					details: undefined,
					content: [{ type: "text", text: `Rule added to [${monitor.name}]: ${params.text}` }],
				};
			}

			if (params.action === "remove") {
				if (params.index === undefined) throw new Error("index parameter required for remove");
				const rules = loadInstructions(monitor);
				if (params.index < 1 || params.index > rules.length) {
					throw new Error(`Invalid index ${params.index}. Have ${rules.length} rules.`);
				}
				const removed = rules.splice(params.index - 1, 1)[0];
				const err = saveInstructions(monitor, rules);
				if (err) throw new Error(`Failed to save rules: ${err}`);
				return {
					details: undefined,
					content: [{ type: "text", text: `Removed rule ${params.index} from [${monitor.name}]: ${removed.text}` }],
				};
			}

			// replace
			if (params.index === undefined) throw new Error("index parameter required for replace");
			if (!params.text) throw new Error("text parameter required for replace");
			const rules = loadInstructions(monitor);
			if (params.index < 1 || params.index > rules.length) {
				throw new Error(`Invalid index ${params.index}. Have ${rules.length} rules.`);
			}
			const old = rules[params.index - 1].text;
			rules[params.index - 1] = { text: params.text, added_at: new Date().toISOString() };
			const err = saveInstructions(monitor, rules);
			if (err) throw new Error(`Failed to save rules: ${err}`);
			return {
				details: undefined,
				content: [
					{
						type: "text",
						text: `Replaced rule ${params.index} in [${monitor.name}]:\n  was: ${old}\n  now: ${params.text}`,
					},
				],
			};
		},
	});

	// ── Tool: monitors-patterns ────────────────────────────────────────────

	pi.registerTool({
		name: "monitors-patterns",
		label: "Monitors Patterns",
		description: "List patterns for a behavior monitor.",
		promptSnippet: "List patterns for a behavior monitor",
		parameters: Type.Object({
			monitor: Type.String({ description: "Monitor name" }),
		}),
		async execute(
			_toolCallId: string,
			params: { monitor: string },
			_signal: AbortSignal,
			_onUpdate: AgentToolUpdateCallback,
			_ctx: ExtensionContext,
		): Promise<AgentToolResult<undefined>> {
			const monitor = monitors.find((m) => m.name === params.monitor);
			if (!monitor) throw new Error(`Unknown monitor: ${params.monitor}`);

			const patterns = loadPatterns(monitor);
			return {
				details: undefined,
				content: [{ type: "text", text: JSON.stringify(patterns, null, 2) }],
			};
		},
	});

	// --- message renderer ---
	pi.registerMessageRenderer<MonitorMessageDetails>("monitor-steer", (message, { expanded }, theme) => {
		const details = message.details;
		if (!details) {
			const box = new Box(1, 1, (t: string) => theme.bg("customMessageBg", t));
			box.addChild(new Text(String(message.content), 0, 0));
			return box;
		}

		const verdictColor = details.verdict === "new" ? "warning" : "error";
		const prefix = theme.fg(verdictColor, `[${details.monitorName}]`);
		const desc = ` ${details.description}`;
		const counter = theme.fg("dim", ` (${details.whileCount}/${details.ceiling})`);

		let text = `${prefix}${desc}${counter}`;

		if (details.verdict === "new") {
			text += theme.fg("dim", " — new pattern learned");
		}

		text += `\n${theme.fg("muted", details.steer)}`;

		if (expanded) {
			text += `\n${theme.fg("dim", `verdict: ${details.verdict}`)}`;
		}

		const box = new Box(1, 1, (t: string) => theme.bg("customMessageBg", t));
		box.addChild(new Text(text, 0, 0));
		return box;
	});

	// --- monitor-pending renderer (non-steering awareness of additional flagged issues) ---
	pi.registerMessageRenderer("monitor-pending", (message, _opts, theme) => {
		const box = new Box(1, 1, (t: string) => theme.bg("customMessageBg", t));
		box.addChild(new Text(theme.fg("dim", String(message.content)), 0, 0));
		return box;
	});

	// --- buffered steer drain ---
	pi.on("agent_end", async () => {
		// Drain buffered steers from message_end/turn_end monitors.
		// The _agentEventQueue guarantees this runs AFTER all turn_end/message_end
		// handlers complete (sequential promise chain), so the buffer is populated.
		// Deliver only the first — the corrected response will re-trigger monitors
		// if additional issues remain.
		if (pendingAgentEndSteers.length > 0) {
			const first = pendingAgentEndSteers[0];
			const remaining = pendingAgentEndSteers.slice(1);
			pendingAgentEndSteers = [];

			pi.sendMessage<MonitorMessageDetails>(
				{ customType: "monitor-steer", content: first.content, display: true, details: first.details },
				{ deliverAs: "steer", triggerTurn: true },
			);

			// Surface remaining flagged issues as non-steering awareness
			if (remaining.length > 0) {
				const summary = remaining.map((s) => `- [${s.monitor.name}] ${s.details.description}`).join("\n");
				pi.sendMessage(
					{
						customType: "monitor-pending",
						content: `Additional monitor observations (will be re-evaluated after correction):\n${summary}`,
						display: true,
					},
					{ triggerTurn: false },
				);
			}
		}
	});

	// --- buffered steers for message_end/turn_end monitors ---
	// These monitors classify during the agent loop but can't inject steers in time
	// (pi's async event queue means extension handlers run after the agent loop checks
	// getSteeringMessages). Buffer steers here, drain at agent_end.
	let pendingAgentEndSteers: BufferedSteer[] = [];

	// --- per-turn exclusion tracking ---
	let steeredThisTurn = new Set<string>();
	pi.on("turn_start", () => {
		steeredThisTurn = new Set();
	});

	// group monitors by validated event
	const byEvent = new Map<MonitorEvent, Monitor[]>();
	for (const m of monitors) {
		const list = byEvent.get(m.event) ?? [];
		list.push(m);
		byEvent.set(m.event, list);
	}

	// wire event handlers
	for (const [event, group] of byEvent) {
		if (event === "command") {
			for (const m of group) {
				pi.registerCommand(m.name, {
					description: m.description || `Run ${m.name} monitor`,
					handler: async (_args: string, ctx: ExtensionContext) => {
						const branch = ctx.sessionManager.getBranch();
						await activate(m, pi, ctx, branch, steeredThisTurn, updateStatus, pendingAgentEndSteers);
					},
				});
			}
		} else if (event === "message_end") {
			pi.on("message_end", async (ev, ctx: ExtensionContext) => {
				if (ev.message.role !== "assistant") return;
				// Skip intermediate tool-call messages — classify only final text responses.
				// An assistant message with toolCall parts is requesting tool execution;
				// the final response has only text parts.
				const hasToolCallParts = ev.message.content.some((part: { type: string }) => part.type === "toolCall");
				if (hasToolCallParts) return;
				const branch = ctx.sessionManager.getBranch();
				for (const m of group) {
					await activate(m, pi, ctx, branch, steeredThisTurn, updateStatus, pendingAgentEndSteers);
				}
			});
		} else if (event === "turn_end") {
			pi.on("turn_end", async (_ev: TurnEndEvent, ctx: ExtensionContext) => {
				const branch = ctx.sessionManager.getBranch();
				for (const m of group) {
					await activate(m, pi, ctx, branch, steeredThisTurn, updateStatus, pendingAgentEndSteers);
				}
			});
		} else if (event === "agent_end") {
			pi.on("agent_end", async (_ev: AgentEndEvent, ctx: ExtensionContext) => {
				const branch = ctx.sessionManager.getBranch();
				for (const m of group) {
					await activate(m, pi, ctx, branch, steeredThisTurn, updateStatus, pendingAgentEndSteers);
				}
			});
		} else if (event === "tool_call") {
			// tool_call monitors get pre-execution blocking: they classify BEFORE the
			// tool runs and can return { block, reason } to prevent execution entirely.
			// This bypasses activate() — tool_call monitors do not use dedup, ceiling,
			// or buffered steer delivery because blocking replaces steering.
			pi.on("tool_call", async (ev: any, ctx: ExtensionContext) => {
				if (!monitorsEnabled) return;

				const branch = ctx.sessionManager.getBranch();

				for (const m of group) {
					if (m.dismissed) continue;

					// check excludes — skip this monitor if any excluded monitor already steered
					let excluded = false;
					for (const ex of m.classify.excludes) {
						if (steeredThisTurn.has(ex)) {
							excluded = true;
							break;
						}
					}
					if (excluded) continue;

					if (!evaluateWhen(m, branch)) continue;

					// Backoff: skip classification if this monitor has failed repeatedly
					if (m.classifySkipRemaining > 0) {
						m.classifySkipRemaining--;
						continue;
					}

					// Build pending tool call context for template injection.
					const toolContext = `Pending tool call:\nTool: ${ev.toolName}\nArguments: ${JSON.stringify(ev.input, null, 2).slice(0, 2000)}`;

					try {
						const result = await classifyViaAgent(ctx, m, branch, { tool_call_context: toolContext });

						// Reset failure counter on success
						m.classifyFailures = 0;

						if (result.verdict === "flag" || result.verdict === "new") {
							if (result.verdict === "new" && result.newPattern && m.patterns.learn) {
								learnPattern(m, result.newPattern, result.severity);
							}

							// Execute write action if configured
							const action = result.verdict === "new" ? m.actions.on_new : m.actions.on_flag;
							if (action) executeWriteAction(m, action, result);

							steeredThisTurn.add(m.name);
							m.whileCount++;
							updateStatus();

							return {
								block: true,
								reason: result.description || `Monitor '${m.name}' blocked: ${result.verdict}`,
							};
						}

						// CLEAN verdict — reset whileCount if engaged
						if (m.whileCount > 0) {
							m.whileCount = 0;
							updateStatus();
						}
					} catch (err) {
						// Classification failure should NOT block tool execution (fail-open)
						const message = err instanceof Error ? err.message : String(err);
						m.classifyFailures++;
						if (m.classifyFailures >= 3) {
							m.classifySkipRemaining = 5;
							console.error(
								`[${m.name}] Classification failed 3 times consecutively, backing off for 5 events: ${message}`,
							);
						} else {
							console.error(`[${m.name}] Classification failed (fail-open, tool not blocked): ${message}`);
						}
					}
				}

				// All monitors passed — allow execution
				return undefined;
			});
		}
	}

	// /monitors command — unified management interface
	const monitorNames = new Set(monitors.map((m) => m.name));
	const monitorsByName = new Map(monitors.map((m) => [m.name, m]));

	const monitorVerbs = ["rules", "patterns", "dismiss", "reset"];
	const rulesActions = ["add", "remove", "replace"];

	pi.registerCommand("monitors", {
		description: "Manage behavior monitors",
		getArgumentCompletions(argumentPrefix: string) {
			const tokens = argumentPrefix.split(/\s+/);
			const last = tokens[tokens.length - 1];

			// Level 0: no complete token yet — show global commands + monitor names
			if (tokens.length <= 1) {
				const items = [
					{ value: "on", label: "on", description: "Enable all monitoring" },
					{ value: "off", label: "off", description: "Pause all monitoring" },
					{ value: "help", label: "help", description: "Show available commands" },
					...Array.from(monitorNames).map((n) => ({
						value: n,
						label: n,
						description: `${monitorsByName.get(n)?.description ?? ""} → rules|patterns|dismiss|reset`,
					})),
				];
				return items.filter((i) => i.value.startsWith(last));
			}

			const name = tokens[0];

			// Level 1: monitor name entered — show verbs
			if (monitorNames.has(name) && tokens.length === 2) {
				return monitorVerbs
					.map((v) => ({ value: `${name} ${v}`, label: v, description: "" }))
					.filter((i) => i.label.startsWith(last));
			}

			// Level 2: monitor name + "rules" — show actions
			if (monitorNames.has(name) && tokens[1] === "rules" && tokens.length === 3) {
				return rulesActions
					.map((a) => ({ value: `${name} rules ${a}`, label: a, description: "" }))
					.filter((i) => i.label.startsWith(last));
			}

			return null;
		},
		handler: async (args: string, ctx: ExtensionContext) => {
			const cmd = parseMonitorsArgs(args, monitorNames);

			if (cmd.type === "error") {
				ctx.ui.notify(cmd.message, "warning");
				return;
			}

			if (cmd.type === "help") {
				const lines = [
					"Usage: /monitors <command>",
					"",
					"  on            Enable all monitoring",
					"  off           Pause all monitoring",
					"  <name>        Inspect a monitor",
					"  <name> rules  Manage rules (add, remove, replace)",
					"  <name> patterns  List known patterns",
					"  <name> dismiss   Silence for this session",
					"  <name> reset     Reset state and un-dismiss",
					"",
					`Active monitors: ${monitors.map((m) => m.name).join(", ") || "(none)"}`,
				];
				ctx.ui.notify(lines.join("\n"), "info");
				return;
			}

			if (cmd.type === "list") {
				if (!ctx.hasUI) {
					handleList(monitors, ctx, monitorsEnabled);
					return;
				}
				const options = [
					`on — Enable all monitoring`,
					`off — Pause all monitoring`,
					...monitors.map((m) => {
						const state = m.dismissed
							? "dismissed"
							: m.whileCount > 0
								? `engaged (${m.whileCount}/${m.ceiling})`
								: "idle";
						return `${m.name} — ${m.description} [${state}]`;
					}),
				];
				const selected = await ctx.ui.select("Monitors", options);
				if (!selected) return;
				const selectedName = selected.split(" ")[0];
				if (selectedName === "on") {
					monitorsEnabled = true;
					updateStatus();
					ctx.ui.notify("Monitors enabled", "info");
				} else if (selectedName === "off") {
					monitorsEnabled = false;
					updateStatus();
					ctx.ui.notify("All monitors paused for this session", "info");
				} else {
					const monitor = monitorsByName.get(selectedName);
					if (!monitor) return;
					const verbOptions = [
						`inspect — Show monitor state and config`,
						`rules — List and manage rules`,
						`patterns — List known patterns`,
						`dismiss — Silence for this session`,
						`reset — Reset state and un-dismiss`,
					];
					const verb = await ctx.ui.select(`[${monitor.name}]`, verbOptions);
					if (!verb) return;
					const verbName = verb.split(" ")[0];
					if (verbName === "inspect") handleInspect(monitor, ctx);
					else if (verbName === "rules") handleRulesList(monitor, ctx);
					else if (verbName === "patterns") handlePatternsList(monitor, ctx);
					else if (verbName === "dismiss") {
						monitor.dismissed = true;
						monitor.whileCount = 0;
						updateStatus();
						ctx.ui.notify(`[${monitor.name}] Dismissed for this session`, "info");
					} else if (verbName === "reset") {
						monitor.dismissed = false;
						monitor.whileCount = 0;
						updateStatus();
						ctx.ui.notify(`[${monitor.name}] Reset`, "info");
					}
				}
				return;
			}

			if (cmd.type === "on") {
				monitorsEnabled = true;
				updateStatus();
				ctx.ui.notify("Monitors enabled", "info");
				return;
			}

			if (cmd.type === "off") {
				monitorsEnabled = false;
				updateStatus();
				ctx.ui.notify("All monitors paused for this session", "info");
				return;
			}

			const monitor = monitorsByName.get(cmd.name);
			if (!monitor) {
				ctx.ui.notify(`Unknown monitor: ${cmd.name}`, "warning");
				return;
			}

			switch (cmd.type) {
				case "inspect":
					handleInspect(monitor, ctx);
					break;
				case "rules-list":
					handleRulesList(monitor, ctx);
					break;
				case "rules-add":
					handleRulesAdd(monitor, ctx, cmd.text);
					break;
				case "rules-remove":
					handleRulesRemove(monitor, ctx, cmd.index);
					break;
				case "rules-replace":
					handleRulesReplace(monitor, ctx, cmd.index, cmd.text);
					break;
				case "patterns-list":
					handlePatternsList(monitor, ctx);
					break;
				case "dismiss":
					monitor.dismissed = true;
					monitor.whileCount = 0;
					updateStatus();
					ctx.ui.notify(`[${monitor.name}] Dismissed for this session`, "info");
					break;
				case "reset":
					monitor.dismissed = false;
					monitor.whileCount = 0;
					updateStatus();
					ctx.ui.notify(`[${monitor.name}] Reset`, "info");
					break;
			}
		},
	});
}
