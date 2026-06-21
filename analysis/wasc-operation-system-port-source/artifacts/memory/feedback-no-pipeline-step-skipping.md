---
name: feedback-no-pipeline-step-skipping
description: Run EVERY canonical-pipeline step including the Explore-agent pass before IMPL, regardless of task size; "it's a snippet/small/obvious" is never a warrant to skip; don't substitute your own file-reading for the Explore dispatch
metadata:
  node_type: memory
  type: feedback
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

The canonical pipeline's steps exist to GUARANTEE the things an LLM would otherwise hedge, bypass, or punt on. Deviating from the steps — especially skipping step 1's **Explore-agent pass** and going straight to IMPL because the task looks small — predictably causes chaos via LLM short-sightedness and lazy hedging over the user's criteria. There is NO triviality exemption.

For EVERY `.context` task, in order: (1) dispatch Explore/eval agent(s) to investigate load-bearing facts against current source — do NOT substitute your own file-reading for this; then corroborate those facts yourself against source; then write the plan; (2) file the task in `.context`; (3) IMPL subagent; (4) a SEPARATE adversarial-audit subagent; (5) cascade + verify, iterate to zero.

**Why:** on TASK-031 (a one-snippet edit) I read the criteria + snippet myself and moved toward dispatching IMPL, skipping the Explore pass. User: "you didn't do the explore before impl… the pipeline exists to guarantee things you might hedge / bypass / punt on… deviation more predictably than not leads to chaos due to llm short-sightedness and favoring lazy hedging over the user's criteria." Links: [[feedback-explore-verify-current-source-not-migrations]], [[feedback-iterate-to-zero-no-pressure-deviation]], [[feedback-process-blockers-vs-end-changeable-language]].
