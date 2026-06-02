/**
 * The pi-behavior-monitors-owned set of tool names that require human-
 * authorization at the pi-agent-dispatch tool_call gate. Co-located with the
 * package whose tools it gates (at the package root, matching this package's
 * root-level source layout) so membership changes travel with the surface they
 * describe; the pi-agent-dispatch gate imports this via the `./auth-required`
 * subpath and folds it into the aggregated AUTH_REQUIRED_TOOLS. The gate remains
 * the enforcement point — this is the source of pi-behavior-monitors'
 * contribution to it.
 */
export const gatedTools = ["monitors-control", "monitors-rules"] as const;
