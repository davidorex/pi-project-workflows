---
name: feedback-build-evaluation-into-execution
description: Build evaluation criteria INTO execution (per-step/per-spec self-checks during the run), not only as a post-hoc output check; IMPL/generation steps need exact SUCCESS criteria AND PROCESS criteria so regressions are caught where they happen, not discovered at output
metadata:
  node_type: memory
  type: feedback
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

Do not rely on output-only verification. Every execution step (a per-spec generation, an IMPL agent's work) must carry exact **success criteria** (what the output must satisfy) AND **process criteria** (how it must be produced) and **self-evaluate against them DURING execution** — so a regression is caught at the step that caused it, not only when the final assembled artifact is checked.

When transposing a HOLISTIC process into a DECOMPOSED pipeline, the whole-system invariants (e.g. coverage across all items) do not map to any single component and fall through the decomposition seams unless they are re-injected as explicit per-step criteria + in-execution checks. Audit the transposition itself: for each source discipline, confirm it survived as a generation contract AND as an in-execution evaluation, not merely as a post-hoc check or (worse) nowhere.

**Why:** the workshopping 14-spec run produced a complete draft that failed whole-draft coverage (4 of 7 improvement areas silently dropped) — found only at the final check, because no per-spec execution step evaluated coverage. User: "ensure there are evaluation criteria built in during the execution, too; i don't want these only to be found upon output; the impl agent needs more exact success criteria and process criteria." Links: [[feedback-no-pipeline-step-skipping]], [[feedback-process-blockers-vs-end-changeable-language]].
