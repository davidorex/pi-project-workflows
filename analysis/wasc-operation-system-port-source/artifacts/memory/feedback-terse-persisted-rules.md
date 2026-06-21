---
name: terse-persisted-rules
description: "rules/notes persisted for the LLM (CLAUDE.md, .context conventions, memories) must be terse — state the directive; the LLM infers the pattern. Don't write exhaustive prose walls."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

When writing a rule/note the LLM will later read (CLAUDE.md additions, `.context` `conventions` entries, persisted directives), keep it **terse** — a short directive naming the practice + the key fields, not an exhaustive paragraph. The LLM reads it and infers the pattern; spelling out every case, rationale, and edge bloats the doc for no gain.

**Why:** I added a verbose multi-sentence paragraph to CLAUDE.md's canonical pipeline for "file extension frictions in the ledger"; the user: "that's way too long a note for claude. the llm will read it and see the pattern." A one-line directive (practice + where + the fields to capture) carried the same instruction. Verbose rules also make the surrounding doc harder to scan and dilute the actually-load-bearing rules.

**How to apply:**
- State the rule as a directive + the minimum specifics (where it lands, the fields/shape). Trust the model to generalize.
- Don't enumerate every package/case/status-value/rationale in the rule body — one representative example is enough (e.g. "(pi-context-cli, pi-workflows, etc.)" not the full list).
- This applies to persisted RULES, not to forensic commit messages or the findings-ledger entries themselves (which are records, and warrant detail).
- Relates to [[feedback-plain-diction]], [[feedback-no-meta-commentary]], and mandate-009 (no noise).
