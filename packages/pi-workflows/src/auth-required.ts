/**
 * The pi-workflows-owned set of tool names that require human-authorization at
 * the pi-agent-dispatch tool_call gate. Co-located with the package whose tools
 * it gates so membership changes travel with the surface they describe; the
 * pi-agent-dispatch gate imports this via the `./auth-required` subpath and
 * folds it into the aggregated AUTH_REQUIRED_TOOLS. The gate remains the
 * enforcement point — this is the source of pi-workflows' contribution to it.
 */
export const gatedTools = ["workflow-execute", "workflow-resume", "workflow-init"] as const;
