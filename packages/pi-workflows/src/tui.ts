/**
 * TUI progress widget for workflow execution.
 * Shows per-step colored bars with live activity, metrics, and a progress bar header.
 */
import type { Theme, ThemeColor } from "@mariozechner/pi-coding-agent";
import type { Component, TUI } from "@mariozechner/pi-tui";
import { formatCost, formatDuration, formatTokens } from "./format.js";
import type { ExecutionState, StepResult, WorkflowSpec } from "./types.js";

export interface StepActivity {
	tool: string; // "read", "edit", "bash", etc.
	preview: string; // "src/index.ts", "npm test", etc.
	timestamp: number;
}

export interface StepOutputSummary {
	tasks?: Array<{ name: string; status: string; files?: string[] }>;
	testCount?: number;
	note?: string;
}

export interface LiveUsageEntry {
	input: number;
	output: number;
	cost: number;
	turns: number;
	toolCount: number;
}

export interface ProgressWidgetState {
	spec: WorkflowSpec;
	state: ExecutionState;
	currentStep?: string; // name of the currently running step (comma-separated for parallel)
	startTime: number; // Date.now() when workflow started
	stepStartTimes: Map<string, number>; // stepName → Date.now() when step started
	parallelSubSteps?: Record<string, import("./types.js").StepResult>; // live sub-step results for parallel step
	resumedSteps?: number; // number of steps carried from a prior run (resume indicator)
	activities: Map<string, StepActivity[]>; // stepName → recent tool calls (ring buffer, last 5)
	outputSummaries: Map<string, StepOutputSummary>; // stepName → parsed output after completion
	liveUsage: Map<string, LiveUsageEntry>; // stepName → accumulating usage from message_end events
}

/** Truncate a rendered line to fit terminal width. */
function truncLine(line: string, maxWidth: number): string {
	// Rough truncation — ANSI codes make precise width hard, but this prevents overflow
	return line.length > maxWidth ? line.slice(0, maxWidth) : line;
}

/** Get the ThemeColor for a step, defaulting to "accent". */
function stepColor(spec: WorkflowSpec, stepName: string): ThemeColor {
	const color = spec.steps[stepName]?.color;
	if (color) return color as ThemeColor;
	return "accent";
}

/**
 * Create a widget factory for ctx.ui.setWidget().
 * Returns a function that pi calls to get the component.
 *
 * The returned component renders a progress view with per-step colored bars:
 *   ─────────────────────────────────────────────
 *   ● do-gap  ████████░░░░░░░░  3/7          1m32s
 *     ✓ load                           2s
 *     ✓ investigate    42s  $0.03  12k tok
 *     ▸ implement   3 turns  8k tok  $0.02   50s
 *       edit packages/pi-project/src/block-api.ts
 *     · verify
 *   ─────────────────────────────────────────────
 */
export function createProgressWidget(
	widgetState: ProgressWidgetState,
): (tui: TUI, theme: Theme) => Component & { dispose?(): void } {
	return (tui: TUI, theme: Theme) => {
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

				// Count completed + skipped steps for progress bar
				const completedCount = stepNames.filter((name) => {
					const r = widgetState.state.steps[name];
					return r && (r.status === "completed" || r.status === "skipped");
				}).length;

				// ── Header: progress bar ──
				const elapsed = formatDuration(Date.now() - widgetState.startTime);
				const workflowName = theme.bold(widgetState.spec.name);
				const indicator = pulseOn ? theme.fg("accent", "\u25cf") : theme.fg("dim", "\u25cf");
				const filledCount = Math.round((completedCount / totalSteps) * 16);
				const filledBar = theme.fg("accent", "\u2588".repeat(filledCount));
				const emptyBar = theme.fg("dim", "\u2591".repeat(16 - filledCount));
				const parallelTag = parallelCount > 1 ? `  [${parallelCount} parallel]` : "";
				const headerLine = `${indicator} ${workflowName}  ${filledBar}${emptyBar}  ${completedCount}/${totalSteps}${parallelTag}  ${theme.fg("dim", elapsed)}`;
				lines.push(truncLine(headerLine, width));

				// Resumed indicator
				if (widgetState.resumedSteps) {
					lines.push(
						truncLine(
							`  ${theme.fg("dim", "\u21bb")} Resumed: ${widgetState.resumedSteps} steps from prior run`,
							width,
						),
					);
				}

				// Paused indicator
				if (widgetState.state.status === "paused") {
					lines.push(truncLine(`  ${theme.fg("accent", "\u23f8")} Paused`, width));
				}

				// ── Step lines ──
				for (const stepName of stepNames) {
					const stepResult: StepResult | undefined = widgetState.state.steps[stepName];
					const color = stepColor(widgetState.spec, stepName);

					if (stepResult && stepResult.status === "skipped") {
						lines.push(
							truncLine(
								`  ${theme.fg("dim", "\u2298")} ${theme.fg("dim", stepName)} ${theme.fg("dim", "[skipped]")}`,
								width,
							),
						);
					} else if (stepResult && stepResult.status === "completed") {
						const dur = formatDuration(stepResult.durationMs);
						const cost = formatCost(stepResult.usage.cost);
						const tok = formatTokens(stepResult.usage.input + stepResult.usage.output);
						const typeTag =
							stepResult.agent === "gate"
								? " [gate]"
								: stepResult.agent === "transform"
									? " [transform]"
									: stepResult.agent === "parallel"
										? " [parallel]"
										: "";
						const truncTag = stepResult.truncated ? ` ${theme.fg("warning", "[truncated]")}` : "";
						lines.push(
							truncLine(
								`  ${theme.fg("success", "\u2713")} ${theme.fg(color, stepName)}${typeTag}  ${theme.fg("dim", dur)}  ${theme.fg("dim", cost)}  ${theme.fg("dim", tok)}${truncTag}`,
								width,
							),
						);

						// Output summary sub-lines (capped at 3)
						const summary = widgetState.outputSummaries?.get(stepName);
						if (summary) {
							let summaryLineCount = 0;
							const MAX_SUMMARY_LINES = 3;
							if (summary.tasks) {
								for (const task of summary.tasks) {
									if (summaryLineCount >= MAX_SUMMARY_LINES) break;
									const files = task.files?.join(", ") || "";
									const statusIcon = task.status === "done" ? "\u2713" : task.status === "failed" ? "\u2717" : "\u00b7";
									lines.push(
										truncLine(
											`      ${theme.fg("dim", statusIcon)} ${theme.fg("dim", task.name)}${files ? `  ${theme.fg("dim", files)}` : ""}`,
											width,
										),
									);
									summaryLineCount++;
								}
							}
							if (summary.testCount && summaryLineCount < MAX_SUMMARY_LINES) {
								lines.push(truncLine(`      ${theme.fg("dim", `${summary.testCount} tests pass`)}`, width));
								summaryLineCount++;
							}
							if (summary.note && summaryLineCount < MAX_SUMMARY_LINES) {
								lines.push(truncLine(`      ${theme.fg("dim", summary.note)}`, width));
							}
						}
					} else if (stepResult && stepResult.status === "failed") {
						const dur = formatDuration(stepResult.durationMs);
						const errorPreview = stepResult.error || "Unknown error";
						lines.push(
							truncLine(
								`  ${theme.fg("error", "\u2717")} ${theme.fg(color, stepName)}  ${theme.fg("dim", dur)}  ${errorPreview}`,
								width,
							),
						);
					} else if (currentSteps.includes(stepName)) {
						// ── Running step: show live metrics ──
						const stepStart = widgetState.stepStartTimes?.get(stepName) ?? widgetState.startTime;
						const stepElapsed = formatDuration(Date.now() - stepStart);
						const live = widgetState.liveUsage?.get(stepName);

						let metricsStr = "";
						if (live && (live.turns > 0 || live.toolCount > 0)) {
							const parts: string[] = [];
							if (live.turns > 0) parts.push(`${live.turns} turns`);
							if (live.toolCount > 0) parts.push(`${live.toolCount} tools`);
							const tok = live.input + live.output;
							if (tok > 0) parts.push(formatTokens(tok));
							if (live.cost > 0) parts.push(formatCost(live.cost));
							metricsStr = `  ${theme.fg("dim", parts.join("  "))}`;
						}

						lines.push(
							truncLine(
								`  ${theme.fg(color, "\u25b8")} ${theme.fg(color, stepName)}${metricsStr}  ${theme.fg("dim", `${stepElapsed}...`)}`,
								width,
							),
						);

						// Activity sub-line: latest tool call or command preview
						const activities = widgetState.activities?.get(stepName);
						if (activities && activities.length > 0) {
							const latest = activities[activities.length - 1];
							lines.push(truncLine(`      ${theme.fg("dim", latest.tool)} ${theme.fg("dim", latest.preview)}`, width));
						}
					} else {
						// Pending step
						lines.push(truncLine(`  ${theme.fg("dim", "\u00b7")} ${stepName}`, width));
					}
				}

				return lines;
			},
			invalidate() {
				/* no cached state to clear */
			},
			dispose() {
				clearInterval(interval);
			},
		};
	};
}
