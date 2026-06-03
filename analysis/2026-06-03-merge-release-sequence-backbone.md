# Merge → Release Sequence — Process Backbone

**Date:** 2026-06-03. **Status:** governing process artifact (standing). **Scope:** the `context-jit-spec-v2` → `main` merge, lockstep version, npm publish, and return-to-branch sequence. Derived from read-only investigation of `scripts/release.mjs`, `scripts/bump-versions.js`, all package CHANGELOGs/package.jsons, and the branch divergence; every decision-gating fact independently re-verified. This is the backbone the process steps hang off; update it as stages are executed.

## Sequence: merge → build → version → publish → back to branch

### Stage 0 — preconditions (before `release:minor` can run) — ✅ DONE (`01f8f45`)
- **Untracked files cleared.** The two design docs (`analysis/2026-06-03-using-pi-spec-2.md`, `analysis/feat-using-pi-context-substrate.md`) were committed on the branch per operator direction; tree is clean. `release.mjs:77` aborts on any non-empty `git status --porcelain` (incl. `??` entries) — that condition is now satisfied.
- **No branch guard.** The script doesn't verify the current branch is `main` — operator/agent responsibility (the merge in Stage C lands us on main before `release:minor`).

> **Baseline correction (verified):** npm `latest` = **0.26.0** for all published packages; `v0.27.0` was tagged but never published. So each package's `[Unreleased]` covers `v0.26.0..HEAD` and the public backfill covers ≤ 0.26.0. The bump is still 0.27.0→0.28.0 locally; consumers jump 0.26.0→0.28.0.

### Stage 1 — merge to main
Fast-forward, **zero conflicts**, `f2668fc → 0de95bb`, **102 commits**, +80,819/−6,810 (~850 files are substrate data; ~134 are code/docs). Carries the `8d19ef5 feat: hello` + its removal in history (a FF preserves both nodes).

### Stage 2 — build
Passes (`release:minor` runs `npm run build` first per `54ec25b`).

### Stage 3 — version (`release:minor`)
0.27.0 → **0.28.0** lockstep across all 7 packages (incl. the two new ones); inter-package deps rewritten to `^0.28.0`; commit `Release v0.28.0` + tag `v0.28.0`. **The changelog step is a silent no-op** under current state — see below.

### Stage 4 — publish (`npm publish --workspaces --access public`)
**Mechanically succeeds** — none private; the `--access public` flag covers the fact that *no package declares `publishConfig.access`*; the two new packages are correctly configured (bin, `files`, `prepublishOnly`).

### Stage 5 — back to branch
After release, **main carries the version bumps + `Release v0.28.0` commit/tag; `context-jit-spec-v2` does not.** To keep working on the branch, merge `main` back into it (bringing 0.28.0), or the branch's package.jsons stay at 0.27.0 and diverge from main.

## The blocker: changelogs

`release.mjs` only renames `## [Unreleased]` → `## [version]`. Current reality:

| Package              | CHANGELOG   | `[Unreleased]`? | Top entry                           |
| -------------------- | ----------- | --------------- | ----------------------------------- |
| pi-context           | exists      | **none**        | `[0.3.0]` 2026-03-18                |
| pi-workflows         | exists      | **none**        | `[0.3.0]` 2026-03-18                |
| pi-behavior-monitors | exists      | **none**        | `[0.14.6]` 2026-04-27               |
| pi-jit-agents        | exists      | **none**        | empty (header only)                 |
| pi-agent-dispatch    | **missing** | —               | — (heaviest-changed: the auth-fold) |
| pi-context-cli       | **missing** | —               | — (new package)                     |
| pi-project-workflows | **missing** | —               | — (meta, 26 prior releases)         |

**Zero packages have an `[Unreleased]` section**, so `release:minor` stamps **nothing** (every file silently skipped), and 3 packages have no changelog to stamp at all. A publish in this state ships 0.28.0 with changelogs frozen months back, empty, or absent — the 102 commits of content-addressing, the op-registry refactor, the auth-fold, and the new CLI would be undocumented to consumers.

Root cause is known and documented: `analysis/2026-06-02-changelog-backfill-and-forward-discipline.md` diagnoses it (R1 — `release.mjs` never re-seeds `[Unreleased]`, so a changelog self-disables after one release; R2 — missing/empty sections are silently skipped; R3 — nothing enforces an entry). **That artifact is a plan, not yet executed.**

## What a changelog-bearing release requires first (per that artifact)
1. **Execute the backfill (Part A):** per-published-version entries for the packages with public history; **create the 3 missing changelogs** (pi-agent-dispatch, pi-context-cli, pi-project-workflows); put all 0.27.0+ work under `[Unreleased]` per package.
2. **Fix `release.mjs` (Part B):** re-seed a fresh `[Unreleased]` after stamping (R1); error instead of silently skipping when a package with published-surface changes has no section, and enumerate all packages incl. missing files (R2). Without this, the dormancy recurs next release.
3. **Confirm each `CHANGELOG.md` is in `files[]`** — the `*.md` glob covers the 3 new ones once created (D4).
4. **Add `publishConfig.access:"public"` to all 7** — latent fragility: this publish is saved only by the `--access public` flag; a future flag-less publish defaults to restricted.
5. **Clear the 2 untracked files** so the release precondition passes.

As stated, the bare sequence (merge → version → publish) would **not** produce changelogs; the backfill + `release.mjs` fix are the prerequisite for the "with changelogs" outcome, and they're the same coupled defect the governing artifact already scoped. The numbered prerequisites above are the work items that must land before a changelog-bearing 0.28.0.
