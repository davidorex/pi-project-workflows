---
name: no-resume-quiescent-agent
description: "you CANNOT resume a quiescent subagent — SendMessage to one is hook-blocked (feedback_no_background_agents); to continue an agent's work, spawn a FRESH foreground Agent with a self-contained prompt carrying all on-disk state"
metadata: 
  node_type: memory
  type: project
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

A subagent that has returned (quiescent) cannot be resumed. `SendMessage` to it is blocked by a PreToolUse hook (`~/.claude/hooks/block-sendmessage.sh`, `feedback_no_background_agents`) — resuming would run it in the background, which is forbidden. To continue that line of work, spawn a **fresh foreground `Agent`** with a fully self-contained prompt that carries every fact it needs: what is already changed on disk, prior commits, and the exact remaining steps (a fresh agent inherits no hidden state).

**Why:** I keep reaching for `SendMessage(to: <agentId>)` to continue an IMPL agent after it returned, and keep re-hitting the hook block — wasting a turn each time. Encoded in CLAUDE.md canonical-pipeline step 3.

**How to apply:** Never plan to "continue" or "message" a finished agent. Each dispatch = a new `Agent` call. When the next step builds on a prior agent's output, write the new prompt to stand alone (state-on-disk + remaining steps). Relates to [[run-the-whole-project-gate]].
