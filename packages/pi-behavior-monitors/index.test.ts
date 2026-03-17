import { describe, it, expect } from "vitest";
import {
	parseMonitorsArgs,
	parseVerdict,
	parseModelSpec,
	generateFindingId,
} from "./index.ts";
import type { MonitorsCommand, ClassifyResult } from "./index.ts";

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

	it("returns clean for unknown / unrecognized text", () => {
		expect(parseVerdict("something random")).toEqual({ verdict: "clean" });
	});

	it("returns clean for empty string", () => {
		expect(parseVerdict("")).toEqual({ verdict: "clean" });
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

	it("handles whitespace-only input as clean", () => {
		expect(parseVerdict("   \n  ")).toEqual({ verdict: "clean" });
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
