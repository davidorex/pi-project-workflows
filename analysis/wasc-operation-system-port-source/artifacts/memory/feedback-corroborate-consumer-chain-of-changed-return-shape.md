---
name: feedback-corroborate-consumer-chain-of-changed-return-shape
description: "when a plan changes what a function RETURNS (shape/type), corroborate the FULL consumer chain (callers, client branches, resolve/merge, tests) before the design enters the plan — verifying the function exists + its signature is not enough"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

A plan that changes a function's RETURN shape/type must, at step-1 corroboration, trace EVERY consumer of that return value and confirm the change is safe at each — production callers, client-side type branches, the resolve/merge chain, and existing tests — before the design is written. Confirming the function exists and reading its current signature is NOT corroboration of a return-shape change.

Carrier rule: to carry NEW data out of a function, add a NEW optional field; do NOT reshape a value other code consumes by type.

**Why:** the TASK-044 plan said "change `parse_suggest_feedback_channels` return shape to a dict `{channels, measurement_views}`." But C1's `prefill` is load-bearing as a LIST — `ai-assist.js:989` `Array.isArray(prefill)` routes the formset apply, `resolve_feedback_vocab` returns a non-list unchanged, and `test_c1_feedback.py` asserts `isinstance(result.prefill, list)`. A dict would silently break unchanged production + the C1 tests (a criterion-4 regression). The IMPL caught it via STOP-on-ambiguity; step-1 corroboration should have. User: "this is a failure in planning."

**How to apply:** when a plan step says "adjust/change the return shape" of any function, before that enters the plan, grep every caller + client consumer + test of that return value and confirm safety; prefer a new optional carrier field over a reshape. Links: [[project-run-the-whole-project-gate]] [[feedback-explore-verify-current-source-not-migrations]] [[feedback-no-pipeline-step-skipping]].
