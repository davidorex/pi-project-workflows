# Observed: constrained-agent reasoning when list-tools truncated at 50KB (2026-05-25)

Empirical evidence for **FGAP-089** (truncating read tools invite partial-read-as-complete) and **FGAP-101** (list-tools lacks progressive disclosure). Captured from a real constrained-harness (`launch-constrained-pi.sh`, `--tools <54>`, no builtins) session in which the agent called `list-tools`, whose ~58KB payload exceeded the 50KB `truncateHead` cap (`packages/pi-context/src/index.ts:1016/1019`). The agent's verbatim chain-of-thought below.

## What it proves
1. **Partial-as-complete (FGAP-089):** "Let me work with what I have" and "Let me just count from what I have and acknowledge the truncation" — the agent proceeds to report on a knowingly-partial view. The prose `[Truncated: N bytes exceeds 50KB limit.]` note is the soft signal a satisficing LLM works around rather than treating as a hard incompleteness. DEC-0018 false-completeness, observed.
2. **Gap-fill from secondary source (FGAP-089/FGAP-092):** the agent reconstructs the cut-off tools from its SYSTEM PROMPT ("additional tools that must exist but got truncated: monitors-control/inspect/patterns/rules/status, enforce-budget") rather than re-querying the authoritative surface. It substitutes a secondary source for the truncated authoritative one.
3. **Progressive disclosure reached-for and found absent (FGAP-101):** "Actually, let me try to get the remaining tools. I can use read-block-page approach... no, that's for substrate blocks." The agent explicitly wanted the index→detail pattern (the FGAP-045 read-block-page shape) for the tool catalog and discovered it does not exist for tools — exactly FGAP-101's thesis. With the proposed two-level list-tools (compact INDEX for all tools + per-tool DETAIL), this whole failure does not occur: the index fits under cap, and the agent fetches detail on demand instead of guessing.

## Verbatim agent reasoning
```
The output got truncated at 50KB. Let me work with what I have - I can see 42 tools listed so far,
but there are more that were cut off. Let me count what I got and report based on what's visible,
and also note the truncation.

[... enumerates 47 visible tools across category groupings: Block CRUD, Reading, Query/Filter,
Closure-Table Relations, Context State & Validation, Config, Schema, Bootstrap, Task Completion,
Execution Context, Roadmaps, Workflow, Rendering ...]

And there are more truncated... I can see the monitors-* series and enforce-budget from the initial
descriptions. Let me check what the initial system prompt listed vs what's in list-tools.

From the initial system prompt, additional tools that must exist but got truncated:
 - monitors-control
 - monitors-inspect
 - monitors-patterns
 - monitors-rules
 - monitors-status
 - enforce-budget

[...]

Actually, let me try to get the remaining tools. I can use read-block-page approach... no, that's for
substrate blocks. Let me just count from what I have and acknowledge the truncation.
```

## Note
The agent's own category-count reconstruction is itself partially wrong (it numbers entries inconsistently and infers the tail), which is a downstream symptom: a truncated discovery surface produces an unreliable self-inventory. This strengthens, not weakens, the case — the agent cannot even accurately enumerate its own surface when that surface is the thing being truncated.
