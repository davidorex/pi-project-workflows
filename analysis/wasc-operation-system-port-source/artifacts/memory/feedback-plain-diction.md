---
name: feedback-plain-diction
description: "write in plain words; no elevated jargon, no abstract noun stacks, no Latinate filler; if a 12-year-old wouldn't follow a sentence, rewrite it"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

Write in plain words. Drop elevated diction, abstract noun stacks, and Latinate filler. If a sentence cannot be read aloud and understood on first hearing, rewrite it.

**Why:** The user flagged sentences like "scoped to the single phase MD it's rendered from, with nothing else from the cumulative end-state, the other phases' MDs, or cross-phase intent visible to the IMPL subagent" as opaque to the point of meaninglessness. Plain restatement: "each phase prompt shows the IMPL only one phase; the IMPL never sees the others or what the finished system should look like." Same information, half the words, no jargon. Related: [[feedback-no-meta-commentary]].

**How to apply:**
- Prefer short Anglo-Saxon verbs over Latinate nominalizations (use "shows," not "is rendered from"; "see," not "have visibility into").
- Don't stack abstract nouns ("cumulative end-state," "cross-phase intent," "structural context") — name the concrete thing.
- One idea per clause. Comma-chained qualifying phrases are usually a sign to start a new sentence.
- Technical terms are fine when they carry actual information (`HEAD`, `pre-commit hook`, `nullable FK`). They are not fine as ornament.
- The test: read the sentence aloud. If you'd be embarrassed to say it in conversation, rewrite it.
