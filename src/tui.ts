import type { Theme } from "@mariozechner/pi-coding-agent";
import type { TUI, Component } from "@mariozechner/pi-tui";
import type { WorkflowSpec, ExecutionState, StepResult } from "./types.ts";

export interface ProgressWidgetState {
  spec: WorkflowSpec;
  state: ExecutionState;
  currentStep?: string;          // name of the currently running step
  startTime: number;             // Date.now() when workflow started
}

/**
 * Format duration in milliseconds to human-readable string.
 * <60s -> "42s", <60m -> "1m32s", >=60m -> "1h02m"
 */
function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return `${minutes}m${seconds.toString().padStart(2, "0")}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h${remainingMinutes.toString().padStart(2, "0")}m`;
}

/**
 * Format cost as a dollar string.
 */
function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

/**
 * Create a widget factory for ctx.ui.setWidget().
 * Returns a function that pi calls to get the component.
 *
 * The returned component renders a compact progress view:
 *   ─────────────────────────────────────
 *   ● bugfix  step 2/3              1m32s
 *     ✓ diagnose     42s   $0.03
 *     ▸ fix           50s   $0.02
 *     · verify
 *   ─────────────────────────────────────
 */
export function createProgressWidget(
  widgetState: ProgressWidgetState,
): (tui: TUI, theme: Theme) => Component & { dispose?(): void } {
  return (tui: TUI, theme: Theme) => {
    let pulseOn = true;
    const interval = setInterval(() => {
      pulseOn = !pulseOn;
      tui.draw();
    }, 800);

    return {
      render(width: number): string[] {
        const lines: string[] = [];
        const stepNames = Object.keys(widgetState.spec.steps);
        const totalSteps = stepNames.length;

        // Determine current step number
        let currentStepNum = 0;
        if (widgetState.currentStep) {
          const idx = stepNames.indexOf(widgetState.currentStep);
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

        const headerLine = `${indicator} ${workflowName}  step ${currentStepNum}/${totalSteps}  ${theme.fg("dim", elapsed)}`;
        lines.push(headerLine.length > width ? headerLine.slice(0, width) : headerLine);

        // Step lines
        for (const stepName of stepNames) {
          const stepResult: StepResult | undefined = widgetState.state.steps[stepName];
          let line: string;

          if (stepResult && stepResult.status === "completed") {
            const dur = formatDuration(stepResult.durationMs);
            const cost = formatCost(stepResult.usage.cost);
            line = `  ${theme.fg("success", "\u2713")} ${stepName}  ${theme.fg("dim", dur)}  ${theme.fg("dim", cost)}`;
          } else if (stepResult && stepResult.status === "failed") {
            const dur = formatDuration(stepResult.durationMs);
            const errorPreview = stepResult.error || "Unknown error";
            line = `  ${theme.fg("error", "\u2717")} ${stepName}  ${theme.fg("dim", dur)}  ${errorPreview}`;
          } else if (stepName === widgetState.currentStep) {
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
