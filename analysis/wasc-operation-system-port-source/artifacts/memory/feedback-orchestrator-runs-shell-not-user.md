---
name: feedback-orchestrator-runs-shell-not-user
description: "in Part B verification, the orchestrator runs all shell commands; only interactive/UI actions (createsuperuser prompts, browser checks) belong to the human"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

When walking through Part B / phase verification, the orchestrator runs the shell commands directly via Bash. The human only handles steps that genuinely require human interaction: `createsuperuser` (interactive email/password prompts), browser navigation, visual rendering checks.

**Why:** The user flagged that I was handing them a list of `docker compose up`, `migrate`, `runserver` commands as if they were the human's job. The orchestrator can run those non-interactively; the human is for the parts the orchestrator literally cannot do (interactive prompts, browser observation). Mixing them wastes the human's attention. Related: [[feedback-prompts-as-complete-directives]].

**How to apply:**
- Compose-up / database wait / migrate / runserver / curl probes: orchestrator runs via Bash (use `run_in_background: true` for long-running server processes).
- `createsuperuser`: human (interactive prompts).
- Browser checks (page renders, form fields present, language toggles): human.
- Report orchestrator-completed commands with their actual output; then tell the human only what's left for them.
- Never paste a shell-command block "for the human" when the orchestrator could have run it. If it's runnable, run it.
