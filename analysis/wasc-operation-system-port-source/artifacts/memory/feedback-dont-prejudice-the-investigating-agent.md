---
name: feedback-dont-prejudice-the-investigating-agent
description: When dispatching an agent to root-cause/investigate, give it the symptom + source locations but NOT your own hypothesis; let it reach independent conclusions; root-cause both process and results, not just the surface result
metadata:
  node_type: memory
  type: feedback
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

When dispatching an Explore/eval/audit agent to root-cause a problem, hand it the **symptom + where to look**, never your own hypothesis of the cause. Feeding the agent your theory prejudices what it finds (it confirms you instead of investigating). State the observed facts neutrally and ask it to establish the mechanism against current source and reach its own conclusion.

Root-cause **both the process and the results**: not only "why is this output wrong" (results regression) but "what about the method that produced it let the regression through" (process regression). Surface ALL regressions, not just the one that triggered the look.

**Why:** on the workshopping coverage failure I formed a hypothesis (a whole-draft invariant fell through the per-spec decomposition seam) and was about to brief the Explore with it. User: "yes on your explore idea, but also don't prejudice what the agent finds. we want transposition process + results regressions root caused." Links: [[feedback-explore-verify-current-source-not-migrations]], [[feedback-build-evaluation-into-execution]].
