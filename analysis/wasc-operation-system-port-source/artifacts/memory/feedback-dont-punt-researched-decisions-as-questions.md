---
name: feedback-dont-punt-researched-decisions-as-questions
description: "don't AskUserQuestion a technical choice that research/investigation was tasked to determine; the user delegated it BECAUSE they are not the source of the answer"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 6e98b2bc-7540-47e7-be51-97919a8cb9f2
---

When you have researched or investigated to determine an answer, DECIDE it — do not AskUserQuestion the user to adjudicate a technically-determinable choice (loop driver, library, mechanism, A-vs-B). The user tasked the research precisely because they are NOT the source of the answer; bouncing the researched question back is the laziness they are fighting ("how the fuck am I supposed to know that? isn't that why we investigated? would I ask you to research if I were the source of the answer?").

**Why:** delegating research and then returning the conclusion as a question to the user wastes the delegation and reads as refusing to commit. The evidence is supposed to settle it; you are the one holding the evidence.

**How to apply:** after Explore/research, state the DECISION + the evidence that determines it. If several options survive the evidence equally, pick one and name the runners-up — do not fork. Reserve AskUserQuestion strictly for genuine preference / scope / priority calls only the user can make (and even then, only when a sensible default doesn't exist). Sharpens [[feedback-no-options-when-path-clear]] and [[feedback-options-proliferation-noise]].
