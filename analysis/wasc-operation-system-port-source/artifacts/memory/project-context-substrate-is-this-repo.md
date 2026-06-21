---
name: context-substrate-is-this-repo
description: "the .context substrate in this repo IS wasc's own; pi-context-cli's install path + the blocks' pi-flavored schema text are not 'another project' — don't divert wasc records elsewhere over that"
metadata: 
  node_type: memory
  type: project
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

The working directory is `/Users/david/Projects/wasc-school-wide-improvement-plan`. The `.context/` substrate in this repo IS this project's (wasc's) own substrate — it holds wasc project state (the PHASE-PROMPTWORKSHOP-RUNNER phase PM, FEAT/STORY/TASK/VER items, and wasc bugs in `issues`).

Two things that look like "another project" but are NOT:
- `pi-context-cli` is installed at `/Users/david/Projects/workflowsPiExtension/packages/pi-context-cli/dist/bin.js` — that is only the tool's install path. It operates on `--cwd`, which DEFAULTS to the current dir (this repo). Use `--cwd .` or just omit `--cwd`; do NOT pass the long absolute repo path (it's noise, and implies not knowing where we are).
- The `.context` block schemas (`issues`, `framework-gaps`, etc.) carry pi-workflows-flavored example/description text (`package: pi-workflows`, locations like `packages/pi-workflows/src/dag.ts`) because the substrate was bootstrapped from pi-context templates. That example text does NOT make the block "another project's tracker." `issues` here = wasc's bug tracker; file wasc bugs/defects there.

**Why:** I twice mis-routed a wasc production bug — first reaching for the wrong block, then second-guessing `.context` entirely as "another project" and proposing to divert it to `discoveries.json`. The user corrected: "of course it should happen in this dir's .context block" and "do you not know we are in this dir?". Diverting wasc records away from `.context` over the schema's flavor text, or re-confirming the obvious cwd, wastes the user's time.

**How to apply:** Operate against this repo's `.context` directly (`--cwd .`). For a wasc bug/defect → `.context` `issues` block (not `framework-gaps`, which is for pi-framework capability gaps). For phase work → `feature`/`story`/`tasks`/`verification` (the PHASE-PROMPTWORKSHOP-RUNNER pattern). Don't pause to question whether `.context` is "ours" — it is. Relates to [[feedback-use-designated-tooling-not-adhoc]].
