/**
 * TUI progress widget for workflow execution.
 * Shows step status, timing, cost, and parallel execution indicators.
 */
import type { Theme } from "@mariozechner/pi-coding-agent";
import type { TUI, Component } from "@mariozechner/pi-tui";
import type { WorkflowSpec, ExecutionState, StepResult } from "./types.ts";
import { formatDuration, formatCost, formatTokens } from "./format.ts";

export interface ProgressWidgetState {
  spec: WorkflowSpec;
  state: ExecutionState;
  currentStep?: string;          // name of the currently running step (comma-separated for parallel)
  startTime: number;             // Date.now() when workflow started
  parallelSubSteps?: Record<string, import("./types.ts").StepResult>;  // live sub-step results for parallel step
  resumedSteps?: number;         // number of steps carried from a prior run (resume indicator)
}

/**
 * Create a widget factory for ctx.ui.setWidget().
 * Returns a function that pi calls to get the component.
 *
 * The returned component renders a compact progress view:
 *   ─────────────────────────────────────
 *   ● bugfix  step 2/3              1m32s
 *     ✓ diagnose     42s   $0.03  12k tok
 *     ▸ fix           50s   8k tok...
 *     · verify
 *   ─────────────────────────────────────
 */
export function createProgressWidget(
  widgetState: ProgressWidgetState,
): (tui: TUI, theme: Theme) => Component & { dispose?(): void } {
  return (tui: TUI, theme: Theme) => {
    /** Pulse interval (ms) for the elapsed-time ticker. Balances update frequency vs overhead. */
    const PULSE_INTERVAL_MS = 800;
    let pulseOn = true;
    const interval = setInterval(() => {
      pulseOn = !pulseOn;
      tui.requestRender();
    }, PULSE_INTERVAL_MS);

    return {
      render(width: number): string[] {
        const lines: string[] = [];
        const stepNames = Object.keys(widgetState.spec.steps);
        const totalSteps = stepNames.length;

        // Parse current steps (may be comma-separated for parallel)
        const currentSteps = widgetState.currentStep?.split(", ") ?? [];
        const parallelCount = currentSteps.length;

        // Determine current step number
        let currentStepNum = 0;
        if (currentSteps.length > 0 && currentSteps[0]) {
          const idx = stepNames.indexOf(currentSteps[0]);
          currentStepNum = idx >= 0 ? idx + 1 : 0;
        } else {
          // Count completed steps
          currentStepNum = Object.values(widgetState.state.steps).filter(
            (s) => s.status === "completed",
          ).length;
        }

        const elapsed = formatDuration(Date.now() - widgetState.startTime);
        const workflowName = theme.bold(widgetState.spec.name);
        const indicator = pulseOn
          ? theme.fg("accent", "\u25cf")
          : theme.fg("dim", "\u25cf");

        const parallelTag = parallelCount > 1 ? ` [${parallelCount} parallel]` : "";
        const headerLine = `${indicator} ${workflowName}  step ${currentStepNum}/${totalSteps}${parallelTag}  ${theme.fg("dim", elapsed)}`;
        lines.push(headerLine.length > width ? headerLine.slice(0, width) : headerLine);

        // Resumed indicator
        if (widgetState.resumedSteps) {
          const resumedLine = `  ${theme.fg("dim", "\u21bb")} Resumed: ${widgetState.resumedSteps} steps from prior run`;
          lines.push(resumedLine.length > width ? resumedLine.slice(0, width) : resumedLine);
        }

        // Paused indicator
        if (widgetState.state.status === "paused") {
          const pausedLine = `  ${theme.fg("accent", "\u23f8")} Paused`;
          lines.push(pausedLine.length > width ? pausedLine.slice(0, width) : pausedLine);
        }

        // Step lines
        for (const stepName of stepNames) {
          const stepResult: StepResult | undefined = widgetState.state.steps[stepName];
          let line: string;

          if (stepResult && stepResult.status === "skipped") {
            // Skipped step: ⊘ stepName [skipped]
            line = `  ${theme.fg("dim", "\u2298")} ${stepName} ${theme.fg("dim", "[skipped]")}`;
          } else if (stepResult && stepResult.status === "completed") {
            const dur = formatDuration(stepResult.durationMs);
            const cost = formatCost(stepResult.usage.cost);
            const tok = formatTokens(stepResult.usage.input + stepResult.usage.output);
            // Show step type indicator for gate/transform
            const typeTag = stepResult.agent === "gate" ? " [gate]" : stepResult.agent === "transform" ? " [transform]" : "";
            line = `  ${theme.fg("success", "\u2713")} ${stepName}${typeTag}  ${theme.fg("dim", dur)}  ${theme.fg("dim", cost)}  ${theme.fg("dim", tok)}`;
          } else if (stepResult && stepResult.status === "failed") {
            const dur = formatDuration(stepResult.durationMs);
            const errorPreview = stepResult.error || "Unknown error";
            line = `  ${theme.fg("error", "\u2717")} ${stepName}  ${theme.fg("dim", dur)}  ${errorPreview}`;
          } else if (stepResult && stepResult.agent === "parallel") {
            // Completed parallel step — show with sub-step count
            const dur = formatDuration(stepResult.durationMs);
            const cost = formatCost(stepResult.usage.cost);
            const tok = formatTokens(stepResult.usage.input + stepResult.usage.output);
            line = `  ${theme.fg("success", "\u2713")} ${stepName} [parallel]  ${theme.fg("dim", dur)}  ${theme.fg("dim", cost)}  ${theme.fg("dim", tok)}`;
          } else if (currentSteps.includes(stepName)) {
            const stepElapsed = formatDuration(Date.now() - widgetState.startTime);
            line = `  ${theme.fg("accent", "\u25b8")} ${theme.fg("accent", stepName)}  ${theme.fg("dim", stepElapsed + "...")}`;
          } else {
            line = `  ${theme.fg("dim", "\u00b7")} ${stepName}`;
          }

          lines.push(line.length > width ? line.slice(0, width) : line);
        }

        return lines;
      },
      dispose() {
        clearInterval(interval);
      },
    };
  };
}
