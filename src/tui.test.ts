import { describe, it } from "node:test";
import assert from "node:assert";
import type { Theme } from "@mariozechner/pi-coding-agent";
import type { TUI } from "@mariozechner/pi-tui";
import { createProgressWidget, type ProgressWidgetState } from "./tui.ts";
import type { WorkflowSpec, StepUsage } from "./types.ts";

/**
 * Minimal Theme mock — passes through text unchanged so we can assert on content
 * without dealing with ANSI codes. Mocks exactly the methods tui.ts calls.
 */
function mockTheme(): Theme {
  return {
    bold: (s: string) => s,
    fg: (_color: string, s: string) => s,
    dim: (s: string) => s,
  } as unknown as Theme;
}

/**
 * Minimal TUI mock — just needs requestRender().
 */
function mockTUI(): TUI {
  return {
    requestRender: () => {},
  } as unknown as TUI;
}

function zeroUsage(): StepUsage {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 };
}

function makeWidgetState(overrides: Partial<ProgressWidgetState> = {}): ProgressWidgetState {
  const spec: WorkflowSpec = {
    name: "test-workflow",
    description: "test",
    steps: {
      explore: { agent: "explorer" },
      analyze: { agent: "analyzer" },
      report: { agent: "reporter" },
    },
    source: "project",
    filePath: "/test.yaml",
  };

  return {
    spec,
    state: { input: {}, steps: {}, status: "running" },
    startTime: Date.now(),
    ...overrides,
  };
}

describe("createProgressWidget", () => {
  it("returns a factory function", () => {
    const factory = createProgressWidget(makeWidgetState());
    assert.strictEqual(typeof factory, "function");
  });

  it("factory creates a component with render and dispose", () => {
    const factory = createProgressWidget(makeWidgetState());
    const component = factory(mockTUI(), mockTheme());
    assert.strictEqual(typeof component.render, "function");
    assert.strictEqual(typeof component.dispose, "function");
    component.dispose!();
  });

  it("renders header with workflow name and step count", () => {
    const widgetState = makeWidgetState({ currentStep: "explore" });
    const factory = createProgressWidget(widgetState);
    const component = factory(mockTUI(), mockTheme());
    const lines = component.render(120);
    component.dispose!();

    assert.ok(lines[0].includes("test-workflow"), "header should include workflow name");
    assert.ok(lines[0].includes("1/3"), "header should show step 1/3");
  });

  it("renders pending steps with dot indicator", () => {
    const widgetState = makeWidgetState();
    const factory = createProgressWidget(widgetState);
    const component = factory(mockTUI(), mockTheme());
    const lines = component.render(120);
    component.dispose!();

    assert.ok(lines.some(l => l.includes("·") && l.includes("explore")));
    assert.ok(lines.some(l => l.includes("·") && l.includes("analyze")));
    assert.ok(lines.some(l => l.includes("·") && l.includes("report")));
  });

  it("renders running step with triangle indicator", () => {
    const widgetState = makeWidgetState({ currentStep: "analyze" });
    const factory = createProgressWidget(widgetState);
    const component = factory(mockTUI(), mockTheme());
    const lines = component.render(120);
    component.dispose!();

    assert.ok(lines.some(l => l.includes("▸") && l.includes("analyze")));
  });

  it("renders completed step with checkmark, duration, cost, tokens", () => {
    const widgetState = makeWidgetState({ currentStep: "analyze" });
    widgetState.state.steps.explore = {
      step: "explore",
      agent: "explorer",
      status: "completed",
      usage: { input: 5000, output: 2000, cacheRead: 0, cacheWrite: 0, cost: 0.03, turns: 1 },
      durationMs: 42000,
    };
    const factory = createProgressWidget(widgetState);
    const component = factory(mockTUI(), mockTheme());
    const lines = component.render(120);
    component.dispose!();

    const exploreLine = lines.find(l => l.includes("explore"));
    assert.ok(exploreLine, "should have explore line");
    assert.ok(exploreLine.includes("✓"), "completed should have checkmark");
    assert.ok(exploreLine.includes("42s"), "should show duration");
    assert.ok(exploreLine.includes("$0.03"), "should show cost");
    assert.ok(exploreLine.includes("7.0k tok"), "should show token count");
  });

  it("renders failed step with X indicator and error", () => {
    const widgetState = makeWidgetState();
    widgetState.state.steps.explore = {
      step: "explore",
      agent: "explorer",
      status: "failed",
      usage: zeroUsage(),
      durationMs: 5000,
      error: "Agent crashed",
    };
    const factory = createProgressWidget(widgetState);
    const component = factory(mockTUI(), mockTheme());
    const lines = component.render(120);
    component.dispose!();

    const exploreLine = lines.find(l => l.includes("explore"));
    assert.ok(exploreLine, "should have explore line");
    assert.ok(exploreLine.includes("✗"), "failed should have X");
    assert.ok(exploreLine.includes("Agent crashed"), "should show error");
  });

  it("renders skipped step with circle indicator", () => {
    const widgetState = makeWidgetState();
    widgetState.state.steps.explore = {
      step: "explore",
      agent: "skipped",
      status: "skipped",
      usage: zeroUsage(),
      durationMs: 0,
    };
    const factory = createProgressWidget(widgetState);
    const component = factory(mockTUI(), mockTheme());
    const lines = component.render(120);
    component.dispose!();

    const exploreLine = lines.find(l => l.includes("explore"));
    assert.ok(exploreLine, "should have explore line");
    assert.ok(exploreLine.includes("⊘"), "skipped should have ⊘");
    assert.ok(exploreLine.includes("[skipped]"), "should show [skipped] tag");
  });

  it("renders gate step with [gate] tag", () => {
    const widgetState = makeWidgetState();
    widgetState.state.steps.explore = {
      step: "explore",
      agent: "gate",
      status: "completed",
      output: { passed: true, exitCode: 0, output: "ok" },
      usage: zeroUsage(),
      durationMs: 100,
    };
    const factory = createProgressWidget(widgetState);
    const component = factory(mockTUI(), mockTheme());
    const lines = component.render(120);
    component.dispose!();

    const exploreLine = lines.find(l => l.includes("explore"));
    assert.ok(exploreLine?.includes("[gate]"), "gate step should show [gate] tag");
  });

  it("renders transform step with [transform] tag", () => {
    const widgetState = makeWidgetState();
    widgetState.state.steps.explore = {
      step: "explore",
      agent: "transform",
      status: "completed",
      output: { merged: true },
      usage: zeroUsage(),
      durationMs: 1,
    };
    const factory = createProgressWidget(widgetState);
    const component = factory(mockTUI(), mockTheme());
    const lines = component.render(120);
    component.dispose!();

    const exploreLine = lines.find(l => l.includes("explore"));
    assert.ok(exploreLine?.includes("[transform]"), "transform step should show [transform] tag");
  });

  it("shows parallel count in header for multiple concurrent steps", () => {
    const widgetState = makeWidgetState({ currentStep: "explore, analyze" });
    const factory = createProgressWidget(widgetState);
    const component = factory(mockTUI(), mockTheme());
    const lines = component.render(120);
    component.dispose!();

    assert.ok(lines[0].includes("[2 parallel]"), "header should show parallel count");
  });

  it("shows multiple running indicators for parallel steps", () => {
    const widgetState = makeWidgetState({ currentStep: "explore, analyze" });
    const factory = createProgressWidget(widgetState);
    const component = factory(mockTUI(), mockTheme());
    const lines = component.render(120);
    component.dispose!();

    const runningLines = lines.filter(l => l.includes("▸"));
    assert.strictEqual(runningLines.length, 2, "should have 2 running step indicators");
  });

  it("renders correct number of lines (header + one per step)", () => {
    const widgetState = makeWidgetState();
    const factory = createProgressWidget(widgetState);
    const component = factory(mockTUI(), mockTheme());
    const lines = component.render(120);
    component.dispose!();

    // 1 header + 3 steps = 4 lines
    assert.strictEqual(lines.length, 4);
  });

  it("truncates lines to width", () => {
    const widgetState = makeWidgetState({ currentStep: "explore" });
    const factory = createProgressWidget(widgetState);
    const component = factory(mockTUI(), mockTheme());
    const lines = component.render(20);
    component.dispose!();

    for (const line of lines) {
      assert.ok(line.length <= 20, `line exceeds width: "${line}" (${line.length})`);
    }
  });

  it("renders resumed indicator when resumedSteps is set", () => {
    const widgetState = makeWidgetState({ resumedSteps: 3, currentStep: "report" });
    widgetState.state.steps.explore = {
      step: "explore",
      agent: "explorer",
      status: "completed",
      usage: zeroUsage(),
      durationMs: 10000,
    };
    widgetState.state.steps.analyze = {
      step: "analyze",
      agent: "analyzer",
      status: "completed",
      usage: zeroUsage(),
      durationMs: 20000,
    };
    const factory = createProgressWidget(widgetState);
    const component = factory(mockTUI(), mockTheme());
    const lines = component.render(120);
    component.dispose!();

    const resumedLine = lines.find(l => l.includes("Resumed"));
    assert.ok(resumedLine, "should have a resumed indicator line");
    assert.ok(resumedLine.includes("↻"), "should have ↻ symbol");
    assert.ok(resumedLine.includes("3 steps from prior run"), "should show step count");
    // Header + resumed line + 3 steps = 5 lines
    assert.strictEqual(lines.length, 5);
  });

  it("does not render resumed indicator when resumedSteps is not set", () => {
    const widgetState = makeWidgetState();
    const factory = createProgressWidget(widgetState);
    const component = factory(mockTUI(), mockTheme());
    const lines = component.render(120);
    component.dispose!();

    assert.ok(!lines.some(l => l.includes("Resumed")), "should not have resumed indicator");
  });

  it("dispose clears the pulse interval", () => {
    const widgetState = makeWidgetState();
    const factory = createProgressWidget(widgetState);
    const component = factory(mockTUI(), mockTheme());

    // Should not throw; if dispose didn't clear the interval,
    // the test process would hang (node:test waits for timers to drain)
    component.dispose!();
  });
});
