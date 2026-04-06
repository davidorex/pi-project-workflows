import * as fs from "node:fs";
import * as path from "node:path";
import nunjucks from "nunjucks";
import { describe, expect, it } from "vitest";
import {
	COLLECTOR_DESCRIPTORS,
	COLLECTOR_NAMES,
	collectConversationHistory,
	generateFindingId,
	invokeMonitor,
	isReferentialMessage,
	parseModelSpec,
	parseMonitorsArgs,
	parseVerdict,
	SCOPE_TARGETS,
	VALID_EVENTS,
	VERDICT_TYPES,
	WHEN_CONDITIONS,
} from "./index.js";

// =============================================================================
// parseMonitorsArgs
// =============================================================================

describe("parseMonitorsArgs", () => {
	const names = new Set(["security", "style", "perf"]);

	// --- list (empty input) ---

	it("returns list when args is empty string", () => {
		expect(parseMonitorsArgs("", names)).toEqual({ type: "list" });
	});

	it("returns list when args is whitespace-only", () => {
		expect(parseMonitorsArgs("   ", names)).toEqual({ type: "list" });
	});

	// --- global on / off ---

	it("returns on", () => {
		expect(parseMonitorsArgs("on", names)).toEqual({ type: "on" });
	});

	it("returns off", () => {
		expect(parseMonitorsArgs("off", names)).toEqual({ type: "off" });
	});

	// --- on/off are not treated as global commands when they collide with a monitor name ---

	it("treats 'on' as inspect when 'on' is a known monitor name", () => {
		const withOnName = new Set(["on", "security"]);
		expect(parseMonitorsArgs("on", withOnName)).toEqual({ type: "inspect", name: "on" });
	});

	it("treats 'off' as inspect when 'off' is a known monitor name", () => {
		const withOffName = new Set(["off", "security"]);
		expect(parseMonitorsArgs("off", withOffName)).toEqual({ type: "inspect", name: "off" });
	});

	it("returns help when first token is 'help' and not a monitor name", () => {
		expect(parseMonitorsArgs("help", names)).toEqual({ type: "help" });
	});

	it("treats 'help' as inspect when 'help' is a known monitor name", () => {
		const withHelpName = new Set(["help", "security"]);
		expect(parseMonitorsArgs("help", withHelpName)).toEqual({ type: "inspect", name: "help" });
	});

	// --- inspect (name only) ---

	it("returns inspect for a known monitor name with no subcommand", () => {
		expect(parseMonitorsArgs("security", names)).toEqual({ type: "inspect", name: "security" });
	});

	it("handles leading/trailing whitespace around monitor name", () => {
		expect(parseMonitorsArgs("  style  ", names)).toEqual({ type: "inspect", name: "style" });
	});

	// --- unknown monitor ---

	it("returns error for unknown monitor name", () => {
		const result = parseMonitorsArgs("bogus", names);
		expect(result.type).toBe("error");
		if (result.type === "error") {
			expect(result.message).toContain("Unknown monitor: bogus");
			expect(result.message).toContain("Available:");
		}
	});

	// --- rules-list ---

	it("returns rules-list for <name> rules", () => {
		expect(parseMonitorsArgs("security rules", names)).toEqual({ type: "rules-list", name: "security" });
	});

	// --- rules-add ---

	it("returns rules-add with text", () => {
		expect(parseMonitorsArgs("security rules add do not allow eval", names)).toEqual({
			type: "rules-add",
			name: "security",
			text: "do not allow eval",
		});
	});

	it("returns error when rules add has no text", () => {
		const result = parseMonitorsArgs("security rules add", names);
		expect(result.type).toBe("error");
		if (result.type === "error") {
			expect(result.message).toContain("Usage:");
		}
	});

	// --- rules-remove ---

	it("returns rules-remove with valid index", () => {
		expect(parseMonitorsArgs("security rules remove 3", names)).toEqual({
			type: "rules-remove",
			name: "security",
			index: 3,
		});
	});

	it("returns error for rules remove with non-numeric index", () => {
		const result = parseMonitorsArgs("security rules remove abc", names);
		expect(result.type).toBe("error");
	});

	it("returns error for rules remove with zero index", () => {
		const result = parseMonitorsArgs("security rules remove 0", names);
		expect(result.type).toBe("error");
	});

	it("returns error for rules remove with negative index", () => {
		const result = parseMonitorsArgs("security rules remove -1", names);
		expect(result.type).toBe("error");
	});

	it("returns error for rules remove with missing index", () => {
		const result = parseMonitorsArgs("security rules remove", names);
		expect(result.type).toBe("error");
	});

	// --- rules-replace ---

	it("returns rules-replace with valid index and text", () => {
		expect(parseMonitorsArgs("security rules replace 2 new rule text here", names)).toEqual({
			type: "rules-replace",
			name: "security",
			index: 2,
			text: "new rule text here",
		});
	});

	it("returns error for rules replace with missing text", () => {
		const result = parseMonitorsArgs("security rules replace 2", names);
		expect(result.type).toBe("error");
	});

	it("returns error for rules replace with invalid index", () => {
		const result = parseMonitorsArgs("security rules replace abc text", names);
		expect(result.type).toBe("error");
	});

	it("returns error for rules replace with zero index", () => {
		const result = parseMonitorsArgs("security rules replace 0 text", names);
		expect(result.type).toBe("error");
	});

	// --- unknown rules action ---

	it("returns error for unknown rules action", () => {
		const result = parseMonitorsArgs("security rules foobar", names);
		expect(result.type).toBe("error");
		if (result.type === "error") {
			expect(result.message).toContain("Unknown rules action: foobar");
		}
	});

	// --- patterns-list ---

	it("returns patterns-list", () => {
		expect(parseMonitorsArgs("security patterns", names)).toEqual({
			type: "patterns-list",
			name: "security",
		});
	});

	// --- dismiss ---

	it("returns dismiss", () => {
		expect(parseMonitorsArgs("perf dismiss", names)).toEqual({ type: "dismiss", name: "perf" });
	});

	// --- reset ---

	it("returns reset", () => {
		expect(parseMonitorsArgs("style reset", names)).toEqual({ type: "reset", name: "style" });
	});

	// --- unknown subcommand ---

	it("returns error for unknown subcommand on a known monitor", () => {
		const result = parseMonitorsArgs("security banana", names);
		expect(result.type).toBe("error");
		if (result.type === "error") {
			expect(result.message).toContain("Unknown subcommand: banana");
		}
	});

	// --- edge: empty known names ---

	it("returns on even when knownNames is empty", () => {
		expect(parseMonitorsArgs("on", new Set())).toEqual({ type: "on" });
	});

	it("returns error for any name when knownNames is empty", () => {
		const result = parseMonitorsArgs("anything", new Set());
		expect(result.type).toBe("error");
	});

	// --- edge: monitor name that matches a reserved word used with subcommand ---

	it("allows subcommands on a monitor named 'on'", () => {
		const withOnName = new Set(["on"]);
		expect(parseMonitorsArgs("on dismiss", withOnName)).toEqual({ type: "dismiss", name: "on" });
	});

	it("allows rules subcommand on a monitor named 'off'", () => {
		const withOffName = new Set(["off"]);
		expect(parseMonitorsArgs("off rules", withOffName)).toEqual({ type: "rules-list", name: "off" });
	});
});

// =============================================================================
// parseVerdict
// =============================================================================

describe("parseVerdict", () => {
	it("returns clean for 'CLEAN'", () => {
		expect(parseVerdict("CLEAN")).toEqual({ verdict: "clean" });
	});

	it("returns clean for 'CLEAN' with trailing text", () => {
		expect(parseVerdict("CLEAN — all good")).toEqual({ verdict: "clean" });
	});

	it("returns error verdict for unrecognized format", () => {
		const result = parseVerdict("something random");
		expect(result.verdict).toBe("error");
		expect(result.error).toEqual(expect.stringContaining("Unrecognized"));
	});

	it("returns error verdict for empty string", () => {
		expect(parseVerdict("")).toEqual({ verdict: "error", error: expect.stringContaining("Unrecognized") });
	});

	it("returns error verdict for LLM reasoning preamble", () => {
		const result = parseVerdict("Looking at the user's request...");
		expect(result.verdict).toBe("error");
		expect(result.error).toEqual(expect.stringContaining("Unrecognized"));
	});

	it("returns flag with description", () => {
		expect(parseVerdict("FLAG:potential injection detected")).toEqual({
			verdict: "flag",
			description: "potential injection detected",
		});
	});

	it("trims whitespace from flag description", () => {
		expect(parseVerdict("FLAG:  spaced out  ")).toEqual({
			verdict: "flag",
			description: "spaced out",
		});
	});

	it("returns new with pattern and description when pipe-separated", () => {
		expect(parseVerdict("NEW:hardcoded-secret|Found an API key in source")).toEqual({
			verdict: "new",
			newPattern: "hardcoded-secret",
			description: "Found an API key in source",
		});
	});

	it("returns new with pattern as description when no pipe", () => {
		expect(parseVerdict("NEW:hardcoded-secret")).toEqual({
			verdict: "new",
			newPattern: "hardcoded-secret",
			description: "hardcoded-secret",
		});
	});

	it("trims whitespace around NEW pattern and description", () => {
		expect(parseVerdict("NEW:  pattern-name  |  the description  ")).toEqual({
			verdict: "new",
			newPattern: "pattern-name",
			description: "the description",
		});
	});

	it("handles whitespace-only input as error", () => {
		expect(parseVerdict("   \n  ")).toEqual({ verdict: "error", error: expect.stringContaining("Unrecognized") });
	});

	it("handles leading whitespace before CLEAN", () => {
		expect(parseVerdict("  CLEAN")).toEqual({ verdict: "clean" });
	});

	it("handles leading whitespace before FLAG", () => {
		expect(parseVerdict("  FLAG:issue")).toEqual({ verdict: "flag", description: "issue" });
	});

	it("handles leading whitespace before NEW", () => {
		expect(parseVerdict("  NEW:pattern|desc")).toEqual({
			verdict: "new",
			newPattern: "pattern",
			description: "desc",
		});
	});
});

// =============================================================================
// parseModelSpec
// =============================================================================

describe("parseModelSpec", () => {
	it("returns anthropic as default provider for plain model ID", () => {
		expect(parseModelSpec("claude-sonnet-4-20250514")).toEqual({
			provider: "anthropic",
			modelId: "claude-sonnet-4-20250514",
		});
	});

	it("splits provider/model on first slash", () => {
		expect(parseModelSpec("openai/gpt-4o")).toEqual({
			provider: "openai",
			modelId: "gpt-4o",
		});
	});

	it("handles provider/model with multiple slashes (only splits on first)", () => {
		expect(parseModelSpec("vertex/us-central1/claude-sonnet")).toEqual({
			provider: "vertex",
			modelId: "us-central1/claude-sonnet",
		});
	});

	it("handles empty string (edge case)", () => {
		expect(parseModelSpec("")).toEqual({
			provider: "anthropic",
			modelId: "",
		});
	});

	it("handles spec that starts with slash", () => {
		expect(parseModelSpec("/model-name")).toEqual({
			provider: "",
			modelId: "model-name",
		});
	});
});

// =============================================================================
// generateFindingId
// =============================================================================

describe("generateFindingId", () => {
	it("starts with the monitor name", () => {
		const id = generateFindingId("security", "found an issue");
		expect(id.startsWith("security-")).toBe(true);
	});

	it("includes a base-36 timestamp component", () => {
		const id = generateFindingId("style", "formatting concern");
		const parts = id.split("-");
		// Should be at least 2 parts: name and timestamp
		expect(parts.length).toBeGreaterThanOrEqual(2);
		// The timestamp portion (everything after first dash) should be valid base-36
		const timestampPart = parts.slice(1).join("-");
		expect(Number.isNaN(parseInt(timestampPart, 36))).toBe(false);
	});

	it("generates different IDs for successive calls", async () => {
		const id1 = generateFindingId("perf", "slow query");
		// Tiny delay to advance Date.now()
		await new Promise((r) => setTimeout(r, 2));
		const id2 = generateFindingId("perf", "slow query");
		expect(id1).not.toBe(id2);
	});

	it("returns a non-empty string", () => {
		const id = generateFindingId("x", "y");
		expect(id.length).toBeGreaterThan(0);
	});
});

// =============================================================================
// Vocabulary registry consistency
// =============================================================================

describe("vocabulary registries", () => {
	it("COLLECTOR_DESCRIPTORS names match runtime COLLECTOR_NAMES", () => {
		const descriptorNames = COLLECTOR_DESCRIPTORS.map((d) => d.name);
		expect(descriptorNames).toEqual(COLLECTOR_NAMES);
	});

	it("COLLECTOR_DESCRIPTORS has no duplicate names", () => {
		const names = COLLECTOR_DESCRIPTORS.map((d) => d.name);
		expect(new Set(names).size).toBe(names.length);
	});

	it("WHEN_CONDITIONS has no duplicate names", () => {
		const names = WHEN_CONDITIONS.map((w) => w.name);
		expect(new Set(names).size).toBe(names.length);
	});

	it("VALID_EVENTS is non-empty", () => {
		expect(VALID_EVENTS.size).toBeGreaterThan(0);
	});

	it("VERDICT_TYPES contains expected values", () => {
		expect([...VERDICT_TYPES]).toEqual(["clean", "flag", "new", "error"]);
	});

	it("SCOPE_TARGETS contains expected values", () => {
		expect([...SCOPE_TARGETS]).toEqual(["main", "subagent", "all", "workflow"]);
	});
});

// =============================================================================
// invokeMonitor
// =============================================================================

describe("invokeMonitor", () => {
	it("is exported as a function", () => {
		expect(typeof invokeMonitor).toBe("function");
	});

	it("throws when monitor name is not found (no monitors loaded)", async () => {
		await expect(invokeMonitor("nonexistent")).rejects.toThrow('Monitor "nonexistent" not found');
	});

	it("throws with a helpful message mentioning .pi/monitors/", async () => {
		await expect(invokeMonitor("no-such-monitor")).rejects.toThrow(".pi/monitors/");
	});
});

// =============================================================================
// Bundled monitor consistency
// =============================================================================

const EXAMPLES_DIR = path.resolve(import.meta.dirname ?? ".", "examples");

function loadMonitorJson(name: string): Record<string, unknown> {
	const filePath = path.join(EXAMPLES_DIR, `${name}.monitor.json`);
	return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

const MONITOR_NAMES = ["fragility", "commit-hygiene", "hedge", "unauthorized-action", "work-quality"];

describe("bundled monitors: user_text in classify.context", () => {
	for (const name of MONITOR_NAMES) {
		it(`${name}.monitor.json includes user_text in classify.context`, () => {
			const monitor = loadMonitorJson(name);
			const classify = monitor.classify as { context: string[] };
			expect(classify.context).toContain("user_text");
		});
	}
});

describe("bundled monitors: no inline prompt field", () => {
	for (const name of MONITOR_NAMES) {
		it(`${name}.monitor.json has no inline prompt field`, () => {
			const monitor = loadMonitorJson(name);
			const classify = monitor.classify as Record<string, unknown>;
			expect(classify.prompt).toBeUndefined();
		});
	}
});

describe("bundled templates: shared iteration-grace partial", () => {
	for (const name of MONITOR_NAMES) {
		it(`${name}/classify.md uses shared iteration-grace include`, () => {
			const templatePath = path.join(EXAMPLES_DIR, name, "classify.md");
			const content = fs.readFileSync(templatePath, "utf-8");
			expect(content).toContain('{% include "_shared/iteration-grace.md" %}');
		});
	}
});

describe("steer template rendering", () => {
	it("literal steer string passes through nunjucks.renderString unchanged", () => {
		const literal = "Commit your changes now.";
		const rendered = nunjucks.renderString(literal, {});
		expect(rendered).toBe(literal);
	});

	it("steer with {{ description }} renders the description value", () => {
		const template = "{{ description }}";
		const rendered = nunjucks.renderString(template, { description: "test finding" });
		expect(rendered).toBe("test finding");
	});

	it("steer with {% if user_text %} conditional renders correctly with user_text", () => {
		const template = "{% if user_text %}{{ description }}{% else %}Fix the issue: {{ description }}{% endif %}";
		const withUser = nunjucks.renderString(template, { user_text: "check this", description: "broken test" });
		expect(withUser).toBe("broken test");
		const withoutUser = nunjucks.renderString(template, { user_text: "", description: "broken test" });
		expect(withoutUser).toBe("Fix the issue: broken test");
	});

	it("steer with {{ description }} handles missing description gracefully", () => {
		const env = new nunjucks.Environment(null, { autoescape: false, throwOnUndefined: false });
		const rendered = env.renderString("Fix: {{ description }}", {});
		expect(rendered).toBe("Fix: ");
	});
});

// =============================================================================
// collectConversationHistory
// =============================================================================

/** Helper to build a SessionEntry-compatible user message */
function makeUser(id: string, parentId: string | null, text: string) {
	return {
		type: "message" as const,
		id,
		parentId,
		timestamp: new Date().toISOString(),
		message: {
			role: "user" as const,
			content: [{ type: "text" as const, text }],
			timestamp: Date.now(),
		},
	};
}

/** Helper to build a SessionEntry-compatible assistant message */
function makeAssistant(id: string, parentId: string, text: string, toolCalls?: { name: string }[]) {
	const content: { type: string; text?: string; name?: string; id?: string; arguments?: Record<string, unknown> }[] =
		[];
	if (text) content.push({ type: "text", text });
	if (toolCalls) {
		for (const tc of toolCalls) {
			content.push({ type: "toolCall", name: tc.name, id: `call-${tc.name}-${id}`, arguments: {} });
		}
	}
	return {
		type: "message" as const,
		id,
		parentId,
		timestamp: new Date().toISOString(),
		message: {
			role: "assistant" as const,
			content,
			api: "messages" as const,
			provider: "anthropic",
			model: "test",
		},
	};
}

/** Helper to build a SessionEntry-compatible toolResult message */
function makeToolResult(id: string, parentId: string, toolName: string, text: string, isError = false) {
	return {
		type: "message" as const,
		id,
		parentId,
		timestamp: new Date().toISOString(),
		message: {
			role: "toolResult" as const,
			toolCallId: `call-${toolName}-${parentId}`,
			toolName,
			content: [{ type: "text" as const, text }],
			isError,
		},
	};
}

describe("collectConversationHistory", () => {
	it("returns empty for single-turn session", () => {
		const branch = [makeUser("u1", null, "Create a function"), makeAssistant("a1", "u1", "Here is the function")];
		expect(collectConversationHistory(branch as any)).toBe("");
	});

	it("includes 1 prior turn for self-contained message", () => {
		const branch = [
			makeUser("u1", null, "Create a CSV parser"),
			makeAssistant("a1", "u1", "Done, created parser.ts"),
			makeUser("u2", "a1", "Create a function that writes JSON output"),
			makeAssistant("a2", "u2", "Here is the JSON writer"),
		];
		const result = collectConversationHistory(branch as any);
		const turnBlocks = result.split("--- Prior turn ---").filter((s) => s.trim());
		expect(turnBlocks).toHaveLength(1);
		expect(result).toContain("Create a CSV parser");
	});

	it("includes 3 prior turns for referential message", () => {
		const branch = [
			makeUser("u1", null, "Create a CSV parser"),
			makeAssistant("a1", "u1", "Done with CSV parser"),
			makeUser("u2", "a1", "Add error handling"),
			makeAssistant("a2", "u2", "Added error handling"),
			makeUser("u3", "a2", "Write tests for it"),
			makeAssistant("a3", "u3", "Tests written"),
			makeUser("u4", "a3", "Build the Docker image"),
			makeAssistant("a4", "u4", "Docker image built"),
			makeUser("u5", "a4", "do that again"),
			makeAssistant("a5", "u5", "Rebuilding Docker image"),
		];
		const result = collectConversationHistory(branch as any);
		const turnBlocks = result.split("--- Prior turn ---").filter((s) => s.trim());
		expect(turnBlocks).toHaveLength(3);
	});

	it("summarizes tool actions", () => {
		const branch = [
			makeUser("u1", null, "Edit the file"),
			makeAssistant("a1", "u1", "", [{ name: "edit" }]),
			makeToolResult("tr1", "a1", "edit", "File edited"),
			makeUser("u2", "tr1", "Create a new component"),
			makeAssistant("a2", "u2", "Component created"),
		];
		const result = collectConversationHistory(branch as any);
		expect(result).toContain("edit(1)");
	});

	it("respects 2000 char budget", () => {
		// Build a branch with many turns of long messages
		const branch: ReturnType<typeof makeUser | typeof makeAssistant>[] = [];
		const longText = "x".repeat(600);
		let parentId: string | null = null;
		for (let i = 0; i < 10; i++) {
			const uid = `u${i}`;
			const aid = `a${i}`;
			branch.push(makeUser(uid, parentId, longText));
			branch.push(makeAssistant(aid, uid, longText));
			parentId = aid;
		}
		// Final user message is referential to get max window
		branch.push(makeUser("u-final", parentId, "do that again"));
		branch.push(makeAssistant("a-final", "u-final", "Done"));
		const result = collectConversationHistory(branch as any);
		expect(result.length).toBeLessThanOrEqual(2000);
	});

	it("detects backreference patterns", () => {
		expect(isReferentialMessage("as I said earlier")).toBe(true);
		expect(isReferentialMessage("do that again")).toBe(true);
		expect(isReferentialMessage("continue")).toBe(true);
		expect(isReferentialMessage("yes")).toBe(true);
		expect(isReferentialMessage("go back to the original approach")).toBe(true);
		expect(isReferentialMessage("same thing")).toBe(true);
		expect(isReferentialMessage("like you did before")).toBe(true);
		expect(isReferentialMessage("re-generate the output")).toBe(true);
		expect(isReferentialMessage("proceed")).toBe(true);
		expect(isReferentialMessage("ok")).toBe(true);
		// Self-contained messages with action verbs should not be referential
		expect(isReferentialMessage("Create a new React component that handles form validation")).toBe(false);
		expect(isReferentialMessage("Implement the authentication middleware for the Express server")).toBe(false);
	});

	it("shows [no tools] when turn has no tool usage", () => {
		const branch = [
			makeUser("u1", null, "What is TypeScript?"),
			makeAssistant("a1", "u1", "TypeScript is a typed superset of JavaScript"),
			makeUser("u2", "a1", "Create a new REST API endpoint for user management"),
			makeAssistant("a2", "u2", "Here is the endpoint"),
		];
		const result = collectConversationHistory(branch as any);
		expect(result).toContain("[no tools]");
	});

	it("shows tool error counts", () => {
		const branch = [
			makeUser("u1", null, "Run the build"),
			makeAssistant("a1", "u1", "", [{ name: "bash" }]),
			makeToolResult("tr1", "a1", "bash", "Build failed", true),
			makeUser("u2", "tr1", "Implement the database migration script with proper error handling"),
			makeAssistant("a2", "u2", "Done"),
		];
		const result = collectConversationHistory(branch as any);
		expect(result).toContain("bash(1, 1 error)");
	});

	it("shows [tool actions only] when assistant has no text", () => {
		const branch = [
			makeUser("u1", null, "Edit file.ts"),
			makeAssistant("a1", "u1", "", [{ name: "edit" }]),
			makeToolResult("tr1", "a1", "edit", "done"),
			makeUser("u2", "tr1", "Write a comprehensive test suite for the payment processing module"),
			makeAssistant("a2", "u2", "Tests written"),
		];
		const result = collectConversationHistory(branch as any);
		expect(result).toContain("[tool actions only]");
	});
});
