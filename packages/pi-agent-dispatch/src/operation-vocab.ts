/**
 * Canonical operation-granular tool grant vocabulary (FEAT-005 / DEC-0047).
 * Each entry names a Pi tool that can be granted to a privileged JIT-agent.
 * Per DEC-0047: default grant is EMPTY; consumers must opt-in operations
 * per dispatch. Per-project config.tool_operations[] entries shadow these
 * defaults at resolve time via resolveOperationVocabulary().
 */

export interface OperationDescriptor {
	canonical_id: string;
	display_name?: string;
	category?: string;
}

/**
 * Operations forbidden from TOOL_OPERATION_DEFAULTS AND from
 * config.tool_operations[] AND config.tool_operations_forbidden[]
 * union. Wholesale tokens that, if granted, dissolve operation-granular
 * bounds — e.g. granting "bash" makes "git-log-recent" a gated
 * alternative to an unrestricted original (feedback_no_parallel_ungated_paths).
 * Extending L1 (this list) requires source change + release (release-
 * gated, not config-mutable). L5 (config.tool_operations_forbidden[])
 * admits project-specific additions under writer.kind=human per DEC-0047.
 */
export const FORBIDDEN_WHOLESALE_OPERATIONS = ["bash", "write", "edit", "shell", "execute"] as const;

export const TOOL_OPERATION_DEFAULTS: Record<string, OperationDescriptor> = {
	// pi-context (40)
	"amend-config": { canonical_id: "amend-config", category: "context" },
	"append-block-item": { canonical_id: "append-block-item", category: "context" },
	"append-block-nested-item": { canonical_id: "append-block-nested-item", category: "context" },
	"append-relation": { canonical_id: "append-relation", category: "context" },
	"complete-task": { canonical_id: "complete-task", category: "context" },
	"context-accept-all": { canonical_id: "context-accept-all", category: "context" },
	"context-bootstrap-state": { canonical_id: "context-bootstrap-state", category: "context" },
	"context-current-state": { canonical_id: "context-current-state", category: "context" },
	"context-edges-for-lens": { canonical_id: "context-edges-for-lens", category: "context" },
	"context-init": { canonical_id: "context-init", category: "context" },
	"context-roadmap-list": { canonical_id: "context-roadmap-list", category: "context" },
	"context-roadmap-load": { canonical_id: "context-roadmap-load", category: "context" },
	"context-roadmap-render": { canonical_id: "context-roadmap-render", category: "context" },
	"context-roadmap-validate": { canonical_id: "context-roadmap-validate", category: "context" },
	"context-status": { canonical_id: "context-status", category: "context" },
	"context-validate": { canonical_id: "context-validate", category: "context" },
	"context-validate-relations": { canonical_id: "context-validate-relations", category: "context" },
	"context-walk-descendants": { canonical_id: "context-walk-descendants", category: "context" },
	"filter-block-items": { canonical_id: "filter-block-items", category: "context" },
	"find-references": { canonical_id: "find-references", category: "context" },
	"gather-execution-context": { canonical_id: "gather-execution-context", category: "context" },
	"join-blocks": { canonical_id: "join-blocks", category: "context" },
	"list-tools": { canonical_id: "list-tools", category: "context" },
	"read-block": { canonical_id: "read-block", category: "context" },
	"read-block-dir": { canonical_id: "read-block-dir", category: "context" },
	"read-block-item": { canonical_id: "read-block-item", category: "context" },
	"read-block-page": { canonical_id: "read-block-page", category: "context" },
	"read-config": { canonical_id: "read-config", category: "context" },
	"read-samples-catalog": { canonical_id: "read-samples-catalog", category: "context" },
	"read-schema": { canonical_id: "read-schema", category: "context" },
	"remove-block-item": { canonical_id: "remove-block-item", category: "context" },
	"remove-block-nested-item": { canonical_id: "remove-block-nested-item", category: "context" },
	"rename-canonical-id": { canonical_id: "rename-canonical-id", category: "context" },
	"resolve-item-by-id": { canonical_id: "resolve-item-by-id", category: "context" },
	"resolve-items-by-id": { canonical_id: "resolve-items-by-id", category: "context" },
	"update-block-item": { canonical_id: "update-block-item", category: "context" },
	"update-block-nested-item": { canonical_id: "update-block-nested-item", category: "context" },
	"walk-ancestors": { canonical_id: "walk-ancestors", category: "context" },
	"write-block": { canonical_id: "write-block", category: "context" },
	"write-schema": { canonical_id: "write-schema", category: "context" },

	// pi-workflows (9)
	"enforce-budget": { canonical_id: "enforce-budget", category: "workflow" },
	"render-item-by-id": { canonical_id: "render-item-by-id", category: "workflow" },
	"workflow-agents": { canonical_id: "workflow-agents", category: "workflow" },
	"workflow-execute": { canonical_id: "workflow-execute", category: "workflow" },
	"workflow-init": { canonical_id: "workflow-init", category: "workflow" },
	"workflow-list": { canonical_id: "workflow-list", category: "workflow" },
	"workflow-resume": { canonical_id: "workflow-resume", category: "workflow" },
	"workflow-status": { canonical_id: "workflow-status", category: "workflow" },
	"workflow-validate": { canonical_id: "workflow-validate", category: "workflow" },

	// pi-behavior-monitors (5)
	"monitors-control": { canonical_id: "monitors-control", category: "monitor" },
	"monitors-inspect": { canonical_id: "monitors-inspect", category: "monitor" },
	"monitors-patterns": { canonical_id: "monitors-patterns", category: "monitor" },
	"monitors-rules": { canonical_id: "monitors-rules", category: "monitor" },
	"monitors-status": { canonical_id: "monitors-status", category: "monitor" },
};
