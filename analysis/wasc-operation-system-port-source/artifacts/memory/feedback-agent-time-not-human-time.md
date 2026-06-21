---
name: feedback-agent-time-not-human-time
description: "this is an LLM-executed coding project; all estimates are agent runtime / session count, never human developer days"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

This project is built around LLM execution. The entire workflow (IMPL subagent, AUDIT subagent, orchestrator, phase prompts) exists because Claude Code agents do the work. Human-developer time estimates ("a couple of weeks," "1-3 focused days") are the wrong frame and waste the user's attention.

**Why:** The user built an LLM coding pipeline for this project. Quoting human-engineer days when asked how long something takes inside that pipeline is a category error — it's like quoting horse-drawn-carriage hours to someone asking how long a flight takes. The user has to translate every answer and gets nothing useful.

**How to apply:**
- Estimate in agent runtime (minutes/hours of a Claude Code session) or session count (one focused session vs. multiple).
- If a task crosses agent capabilities (e.g., requires human browser observation for Part B verification), say so explicitly — don't pad with human hours to cover the gap.
- Never give a human-developer estimate as the primary answer.
- Never give one as a "for comparison" parenthetical either; the user doesn't need it.
- If genuinely uncertain (e.g., depends on a tool call's runtime), name what it depends on rather than inventing a number.
