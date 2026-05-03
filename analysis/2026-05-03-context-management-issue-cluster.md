# Context-Management Issue Cluster

**Date:** 2026-05-03
**Lens:** blocks as the foundational substrate for state that persists independent of LLM session.
**Source:** filtered enumeration of `.project/framework-gaps.json` and `.project/issues.json` open entries against the context-management lens.

The context-management space comprises every framework gap plus a substantial cluster of open issues. Organized by sub-concern:

## Substrate shape (how state is stored)

- FGAP-001 — Hierarchical / nested block storage
- FGAP-002 — Per-scope finding registries
- FGAP-003 — Materialized views over scoped blocks
- FGAP-006 — Schema versioning and evolution

## Substrate integrity / drift detection (state matches reality)

- FGAP-005 — State-machine validation on enum-field transitions
- issue-017 — No state coherence monitor (blocks drift from source)
- issue-021 — Architecture block manually maintained, derivable from package.json + source
- issue-022 — Domain block reference entries duplicate SDK queries, go stale
- issue-065 — pi-behavior-monitors write-action bypasses block-api → silent schema drift
- issue-061 — Staleness engine for research blocks (mirror of unfiled FGAP-007)

## Provenance / authorship / execution traces (who did what, when)

- FGAP-004 — Authorship attestation at write time
- issue-011 — Agent execution metadata (model, cost, duration) not persisted
- issue-036 — Execution trace debugger (full input→template→LLM→parse→result chain)
- issue-037 — SDK query surface for execution history (lastRunResult, stepTrace)
- issue-047 — Structured artifacts[] on StepResult (pointers to files a step produced)

## Automatic context capture (writeback as side-effect of work)

- issue-008 — No automatic decision recording during agent execution
- issue-028 — Agent steps should declare block write-back targets
- issue-030 — Writeback monitor — persist structured summaries to blocks
- issue-032 — Tool-use structured output for workflow agent steps with output.schema

## Context projection (how blocks reach agents)

- issue-020 — contextBlocks injection only reads static files, no computed blocks
- issue-029 — Artifact format rendering — editable surfaces from schema-validated blocks
- issue-041 — Scoped/filtered contextBlocks reads (subsets, not whole blocks)
- issue-043 — Summary/body output contract on StepResult
- issue-045 — Framework-level anti-injection wrapping for contextBlocks injection

## Context window control (token budget management)

- issue-035 — Per-monitor configurable collector parameters (window tunable from YAML)
- issue-042 — Token budgeting across DAG edges (upstream output interpolated verbatim)

## Context lifecycle linkage (state changes propagate)

- issue-009 — No phase-level verification rollup
- issue-010 — Issue lifecycle not connected to task completion

## Context identity / idempotence

- issue-044 — Semantic input hash for idempotent skip

## Substrate visibility / query surface

- issue-023 — Monitor classify produces no debug output (misfires uninspectable)
- issue-033 — Expression-level field validation in workflow step input blocks

## Substrate location / reachability

- issue-067 — Agent-spec discovery path split (pi-workflows vs pi-jit-agents)

## Notes

Duplicates: issues 055–061 are issue-tracker mirrors of FGAP-001 through FGAP-007. Listed once via the FGAP form above.

Out of scope under this lens (filtered out): composition reuse (002, 003, 034), workflow shape (004, 046), concurrency (005, 006), routing/config (007, 052, 062, 064), TUI (016), tooling (038, 039, 040), unrelated bugs (048, 049, 050, 066), monitor primitive (051), resource control (054), cleanup (063).

## Cluster density

Highest-density cluster: substrate shape (FGAPs 001/002/003/006) + automatic context capture (008, 028, 030, 032) + context projection (020, 029, 041, 043, 045). These are mutually-reinforcing — partition shape enables scoped reads enables typed writeback enables provenance enables drift detection.
