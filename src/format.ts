/**
 * Shared formatting utilities for duration and cost display.
 * Used by state.ts (formatResult), expression.ts (filters), and tui.ts (widget).
 */

/**
 * Format duration in milliseconds to human-readable string.
 * <60s -> "42s", <60m -> "1m32s", >=60m -> "1h02m"
 */
export function formatDuration(ms: number): string {
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
export function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}
