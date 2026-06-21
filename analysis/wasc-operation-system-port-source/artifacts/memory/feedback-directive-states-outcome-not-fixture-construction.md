---
name: feedback-directive-states-outcome-not-fixture-construction
description: "an IMPL/agent directive must state the OUTCOME, never prescribe test-fixture/build construction (the how); if you do prescribe a fixture, trace it against every whole-draft invariant/consumer it touches before writing it"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 8c933c8b-770a-4c3b-b6b7-7be63588f244
---

A directive (and the plan's criteria) states what must be TRUE, never how to build the test/fixture. Prescribing fixture construction reproduces the process failure: it smuggles in a "how" that carries latent contradictions you didn't trace.

Concrete failure (TASK-052): the IMPL directive said both "start from `_clean_draft()` (passes all structural checks)" AND "set its `domain_alignment` to [only] the two prose rows." A wholesale replace drops the `label` rows the `coverage` structural check reads → strict-exit gates. The two clauses silently contradicted; the IMPL had to reinterpret (augment vs replace) and disclose it, forcing the user to adjudicate a deviation my directive created.

**Why:** the user's recurring complaint — process deviation creates chaos and steals their focus. Over-specifying the "how" + not tracing it to its consumer is the same root as the audited failures (less verification than the process demands; consumer-chain not traced) applied to a TEST fixture instead of production code.

**How to apply:** (1) write criteria as outcomes — no fixture/file/build mechanics. (2) If you DO prescribe a fixture, trace it against EVERY whole-draft invariant/consumer it touches (e.g. coverage reads `domain_alignment` labels) BEFORE it ships, the same way you'd trace a changed return shape's callers. (3) A self-justifying agent reinterpretation is not validation — the separate adversarial audit (non-masking + non-vacuity) is. See [[feedback-corroborate-consumer-chain-of-changed-return-shape]], [[feedback-build-evaluation-into-execution]], [[feedback-dont-prejudice-the-investigating-agent]].
