---
name: run-pi-project-workflows
description: Build, run, and drive pi-project-workflows. Use when asked to run the pi-context CLI, start or smoke-test the monorepo, exercise the pi extensions via tool dispatch, verify a build end-to-end, or check that the substrate tooling works on this machine.
---

This monorepo ships two deployable surfaces from one lockstep build: the **pi-context CLI** (a binary) and a set of **pi-runtime extensions** (loaded by the `pi` agent runtime from this tree per `package.json` `pi.extensions`). Drive both via `.claude/skills/run-pi-project-workflows/driver.mjs` — it builds, installs the CLI into a throwaway prefix, and exercises each surface against the repo's live `.context` substrate, read-only.

All paths are relative to the repo root.

## Prerequisites

- Node 22 or 23 (`node --version`; CI matrix). No OS packages beyond that — the build is pure `tsc`.
- Optional, for the pi-dispatch step only: the `pi` CLI on PATH and `~/.pi/agent/auth.json` (model credentials). Without them that step reports GATED and everything else still runs.

## Setup

```bash
npm install
```

## Run (agent path) — the driver

```bash
node .claude/skills/run-pi-project-workflows/driver.mjs
```

What it does, in order (each step prints PASS/FAIL/GATED; exits non-zero on first FAIL):

1. **promote** — `npm run promote:cli` with `PROMOTE_PREFIX` at a throwaway dir: builds the whole tree and installs the packed CLI there (~90s). This is the same mechanism that installs the real operator binary; the throwaway prefix keeps the machine's global untouched.
2. **cli smoke** — drives the packed binary: `--version` (must match the tree version), `context-bootstrap-state` (substrate resolves, `state: ready`), `context-validate` (verdict returned), `read-config --registry block_kinds --id tasks` (one registry entry addressed).
3. **pi dispatch** — a real model turn (`pi -p "call the context-status tool once and then stop" --mode json --no-skills --model openrouter/anthropic/claude-haiku-4.5`) proving the extensions load from this tree and a tool round-trips. **Spends real (haiku-priced) credits**; GATED when `pi` or auth.json is absent.

Flags:

```bash
node .claude/skills/run-pi-project-workflows/driver.mjs --skip-promote   # reuse the last prefix (skips the ~90s build)
node .claude/skills/run-pi-project-workflows/driver.mjs --full           # also run the full test suite
```

## Direct invocation (internals, no CLI)

Most changes here touch library internals, not the binary. Call them straight off the built dist:

```bash
npm run build
npx tsx -e "import {contextState} from '@davidorex/pi-context/context-sdk'; console.log(JSON.stringify(contextState('.').position ?? 'ok'))"
```

Workspace subpath imports (`@davidorex/pi-context/context-sdk`, `/block-api`, …) resolve to this tree's `dist/` via workspaces — rebuild before invoking (pi and the CLI load `dist/`, never `src/`).

## Run (human path)

The operator installs the CLI into the real global prefix:

```bash
npm run promote:cli    # then: pi-context <op> --json
```

A `npm run release:*` run does this automatically as its final step.

## Test

```bash
npm test               # tsx --test + vitest across all packages; must be 0 failures
npm run check          # biome + tsc --noEmit
```

## Gotchas

- **`--tools read` on `pi -p` restricts to BUILTINS** — extension tools (context-status etc.) disappear and the model reports "I don't have that tool". Omit `--tools` for extension dispatch; pin `--model openrouter/anthropic/claude-haiku-4.5` and `--no-skills` for cost control.
- **The repo's `.context` is a live substrate with enforcement hooks** (PreToolUse guards fire repo-wide in Claude Code sessions). The driver is read-only against it by design; don't add write steps to it — sanctioned writes go through the `pi-context` ops with `--writer`, and planning-block writes are provenance-gated.
- **`execSync` + `stdio: "inherit"` returns null on success AND failure** — the driver pipes output instead so success is discriminable (the same hazard bit `scripts/release.mjs` step 5 during its implementation).
- **The globally-installed `pi-context` can lag the tree** after edits — it's a packed copy, not a link. Re-run `npm run promote:cli` (releases self-promote since v0.32.0).
- **`context-validate` returning `warnings` is the healthy steady state** here (a known pre-existing advisory backlog); `invalid` is the red flag.

## Troubleshooting

- `binary reports '…', tree is X` from the version step → a stale prefix was reused; run without `--skip-promote`.
- `--skip-promote: no prior prefix found` → first run must do the promote; drop the flag.
- pi-dispatch step GATED → install the `pi` CLI and/or provision `~/.pi/agent/auth.json`; everything else has already verified the build.
- `npm run promote:cli` fails with EACCES on a real-global install → your npm global prefix isn't writable; the driver never hits this (throwaway prefix), only the human path does.
