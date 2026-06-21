---
name: feedback-use-designated-tooling-not-adhoc
description: "When the user names the tooling/process to use, use ONLY that surface — never substitute an ad-hoc equivalent (direct file read, node one-liner)"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

When the user specifies the process or tooling for a task ("use the scripts referenced in claude.md", "use the X command", a named workflow), use EXACTLY that designated surface. Never substitute an ad-hoc equivalent — a direct file read, a `node -e` one-liner, a hand-rolled projection — even when it seems more convenient or you are unsure of the tool's arguments. If unsure of a script's CLI args, inspect the script or run it and read its usage; do not bypass it.

**Why:** It is not instinct or preference — the designated tooling is *designed* for the task and encodes contracts (item shapes, schemas, pagination, validation) the ad-hoc path doesn't know. Substituting an ad-hoc read both disobeys the directive AND produces errors. Concrete failure (2026-06-02): told to "use the scripts referenced in claude.md" to inspect `.context` blocks, I used `current-state` but then reached for `node -e` reads for the inventory + content peek; my hand-rolled projection read `summary`/`title` fields that session-notes items don't carry, so I reported them as empty — `read-block-page --block session-notes` returns the true shape (`focus`/`discoveries`/`decisions_made`/`next_steps`) and would have shown the rich content directly. Correct process produces correct outcomes; ad-hoc substitution is how you get both disobedience and wrong answers.

**How to apply:** When a directive names a tool/script/command, invoke exactly that. The `.context` query surface is the orchestrator scripts (`read-block-page`, `read-block-item`, `filter-block-items`, `current-state`, `find-references`), invoked `NODE_PATH=/Users/david/Projects/workflowsPiExtension/node_modules npx tsx scripts/orchestrator/<name>.ts`. Related: [[feedback-honor-literal-commands]], [[feedback-narrow-directive-parsing]], [[feedback-prompts-as-complete-directives]].
