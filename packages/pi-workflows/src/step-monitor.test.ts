import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { availableMonitors, findMonitorSpec } from "./step-monitor.js";

describe("findMonitorSpec", () => {
	it("finds monitor in .pi/monitors/ directory", () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "monitor-test-"));
		const monitorsDir = path.join(tmpDir, ".pi", "monitors");
		fs.mkdirSync(monitorsDir, { recursive: true });

		const spec = {
			name: "test-monitor",
			classify: {
				model: "claude-sonnet-4-20250514",
				context: ["tool_calls"],
				prompt: "Test prompt {patterns}",
			},
			patterns: { path: "test-monitor.patterns.json" },
			actions: {},
		};
		fs.writeFileSync(path.join(monitorsDir, "test-monitor.monitor.json"), JSON.stringify(spec));
		fs.writeFileSync(path.join(monitorsDir, "test-monitor.patterns.json"), "[]");

		const result = findMonitorSpec("test-monitor", tmpDir);
		assert.ok(result, "should find the monitor");
		assert.strictEqual(result.spec.name, "test-monitor");
		assert.strictEqual(result.spec.classify.model, "claude-sonnet-4-20250514");
		assert.strictEqual(result.dir, monitorsDir);

		// cleanup
		fs.rmSync(tmpDir, { recursive: true });
	});

	it("returns null for nonexistent monitor", () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "monitor-test-"));
		const result = findMonitorSpec("no-such-monitor", tmpDir);
		assert.strictEqual(result, null);
		fs.rmSync(tmpDir, { recursive: true });
	});

	it("parses promptTemplate field", () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "monitor-test-"));
		const monitorsDir = path.join(tmpDir, ".pi", "monitors");
		fs.mkdirSync(monitorsDir, { recursive: true });

		const spec = {
			name: "tmpl-monitor",
			classify: {
				model: "claude-sonnet-4-20250514",
				context: ["tool_calls", "assistant_text"],
				promptTemplate: "tmpl-monitor/classify.md",
				prompt: "fallback inline",
			},
			patterns: { path: "tmpl-monitor.patterns.json" },
		};
		fs.writeFileSync(path.join(monitorsDir, "tmpl-monitor.monitor.json"), JSON.stringify(spec));

		const result = findMonitorSpec("tmpl-monitor", tmpDir);
		assert.ok(result);
		assert.strictEqual(result.spec.classify.promptTemplate, "tmpl-monitor/classify.md");
		assert.strictEqual(result.spec.classify.prompt, "fallback inline");

		fs.rmSync(tmpDir, { recursive: true });
	});
});

describe("availableMonitors", () => {
	it("lists monitors in .pi/monitors/ directory", () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "monitor-test-"));
		const monitorsDir = path.join(tmpDir, ".pi", "monitors");
		fs.mkdirSync(monitorsDir, { recursive: true });

		fs.writeFileSync(path.join(monitorsDir, "alpha.monitor.json"), "{}");
		fs.writeFileSync(path.join(monitorsDir, "beta.monitor.json"), "{}");
		fs.writeFileSync(path.join(monitorsDir, "not-a-monitor.json"), "{}");

		const monitors = availableMonitors(tmpDir);
		assert.ok(monitors.includes("alpha"));
		assert.ok(monitors.includes("beta"));
		assert.ok(!monitors.includes("not-a-monitor"));

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("returns empty array when no monitors directory exists", () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "monitor-test-"));
		const monitors = availableMonitors(tmpDir);
		assert.ok(Array.isArray(monitors));
		fs.rmSync(tmpDir, { recursive: true });
	});
});
