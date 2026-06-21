---
name: feedback-flagging-is-not-persistence
description: "conversational \"flagging/noting\" is NOT persistence — it's lost when the session ends; write to a durable doc that turn or it's gone"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

Saying "I'll note/flag this so it isn't lost" in a response is NOT persistence — the response is ephemeral; the item is gone when the session ends. The user corrected: **"flagged = lost if not persisted."**

**Why:** anything that must survive the conversation has to land in a durable artifact (the `data/seed-round-plan.md` DEC log, `phases/discoveries.md`, `phases/US-STATUS.md`, `ORCHESTRATOR-LOG.md`/`STATE`, a memory file) — a conversational mention does nothing.

**How to apply:** the moment I'm about to "note", "flag", or "record so it isn't lost", actually WRITE it to its home doc that turn (and prefer a first-class trackable entry — its own DEC/DISC/US row — over burying it in another item's paragraph). Never use "flagged so it isn't lost" language as if mentioning preserved it. Concrete instance: cross-plan-coherence had been only a sub-paragraph of DEC-32 + a conversational "flag" → promoted to its own DEC-34. Reinforces [[feedback-noted-gap-is-a-work-item]] and the orchestrator's proactive-persistence discipline.
