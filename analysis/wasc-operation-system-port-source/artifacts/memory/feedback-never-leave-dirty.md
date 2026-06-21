---
name: feedback-never-leave-dirty
description: "never leave the working tree dirty after a task; stage and commit (or remove) every produced artifact before reporting \"done\""
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

After any task that produces or modifies files, the working tree must be clean before the response is delivered. No untracked files left behind. No `M` or `??` lines in `git status`.

**Why:** The user has flagged dirty state twice in this session — once after the worktree merge ("you left a dirty git state") and again after committing test settings ("leave nothing dirty ever"). Untracked artifacts force the user to clean up after every interaction. Pattern is unacceptable.

**How to apply:**
- After any commit, run `git status` to verify the tree is clean.
- Tracked but uncommitted: stage and commit, or `git restore` if the change shouldn't land.
- Untracked artifacts: either stage and commit them, or delete them. Never leave them.
- Rendered prompts / generated files: by default commit them unless explicitly transient. The repo's `.gitignore` is the source of truth on what should be ignored; if a directory like `tmp/` is intentionally not ignored, its contents track.
- Tool runs that produce side-effects (`pytest --cache`, `.mypy_cache/`, etc.) belong in `.gitignore`. If they appear as untracked, fix `.gitignore`.
- "Done" is reported only after `git status` returns clean.
