# FGAP-089 — fail-closed over-cap reads: runtime + audit (TASK-078, 2026-05-25)

Every over-cap READ across our extensions now fails closed: no satisficeable partial body. serializeForRead (read-element.ts) on over-cap returns a DIRECTIVE-ONLY refusal (when a narrowing tool exists — no serialized body) or an UNMISSABLE HEAD-LEADING partial marker (edge surfaces, no finer addressing). Replaces the trailing footer the agent skimmed past.

## Scope
IN (read truncation → fail-closed): pi-context serializeForRead (21 call sites) + pi-workflows read tools (workflow-list/agents/status/validate/init) routed through the same serializeForRead (import @davidorex/pi-context/read-element; 0 truncateHead left in those handlers).
OUT (output truncation — untouched): dispatch MAX_STDOUT_BYTES, workflow-executor:976 truncateTail (completion), jit-runtime verdict/error, budget-enforcer, context-sdk:764 nextActions.

## Static (orchestrator-verified)
- read-element over-cap directive branch builds content from label/totalBytes/tool/params/hint ONLY — cap.content (body) never referenced (no leak); edge branch prepends the warning (head-leading). complete:false on both; true otherwise.
- build/check/test 0-fail; new "serializeForRead over-cap fail-closed (FGAP-089)" + truncate tests pass.
- Only read-truncation path is serializeForRead (grep: no other truncateHead/truncateTail on a read result).

## Live regression gate (the original failure, via launch-constrained-pi.sh, scratch cwd)
Prompt: "Show me this project's full samples catalog — every block kind."
- read-samples-catalog (no kind) → **READ REFUSED** ("over the 50KB read cap · Nothing was returned") — fail-closed, no partial.
- The agent **followed the directive**: re-called read-samples-catalog with kind= across decisions/framework-gaps/issues/requirements/tasks/verification.
- NO false-complete claim. The exact pre-fix degradation (partial catalog presented as complete) does not recur.

## Audit (fresh-context adversarial, re-verified by orchestrator)
PASS A-F: no in-scope read returns a usable partial on over-cap; directive branch leaks no body; edge markers head-leading; pi-workflows routed; out-of-scope output-truncations untouched; complete flag correct. No bad route exists.

## Note (out of scope, surfaced by the audit)
Derived-state reads (context-status, context-current-state, context-validate, resolve-item-by-id, roadmap-validate) return FULL UNCAPPED bodies — they do NOT truncate, so no partial-as-complete risk (not a fail-closed regression), but a >50KB derived state would arrive whole (token-budget pressure). Outside FGAP-089; candidate future gap.

## Verdict
FGAP-089 closed: fail-closed comprehensive across all in-scope over-reads; verified by unit + live regression + adversarial audit.
