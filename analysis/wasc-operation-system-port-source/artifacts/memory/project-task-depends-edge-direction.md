---
name: task-depends-edge-direction
description: ".context task_depends_on_task is filed parent=PREREQUISITE (earlier task) → child=DEPENDENT (blocked task) — opposite the relation's name; the deriver reads it that way and context-validate won't catch a reversal"
metadata: 
  node_type: memory
  type: project
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

When filing a `task_depends_on_task` edge in the `.context` substrate, **parent = the prerequisite (the EARLIER task that must finish first); child = the dependent (the blocked task)**. To say "B depends on A," file `append-relation --parent A --child B`. This is OPPOSITE what the relation's name ("depends on task") implies, but it is how `context-current-state` derives blocked/unblocked and how the exemplar substrate (`workflowsPiExtension/.context`) files it.

**Why:** I filed all 9 wasc edges the intuitive way (parent=depender), which inverted `context-current-state` — it surfaced the *last* task in each chain as the unblocked "next." `context-validate-relations` stayed clean (direction is semantic, not a validation error), so nothing caught it but the wrong derivation. Confirmed correct direction against the exemplar (sane derivation), reversed all 9. This is the exemplar's FGAP-007 footgun (name vs deriver), logged as CTX-8 in `prompt-workshop/PI-WORKFLOWS-FINDINGS.md`.

**How to apply:**
- File `--parent <prerequisite> --child <dependent>` (earlier→later).
- After filing dep edges, VERIFY with `context-current-state` — confirm the unblocked frontier is the EARLIEST open tasks, not the latest. The deriver is the test; the validators won't flag a reversal.
- Same convention for the `.context` here and the exemplar. Relates to [[context-substrate-is-this-repo]].
