# Merge → Release Sequence — Process Backbone

**Date:** 2026-06-03. **Status:** governing process artifact (standing). **Scope:** the `context-jit-spec-v2` → `main` merge, lockstep version, npm publish, and return-to-branch sequence. Derived from read-only investigation of `scripts/release.mjs`, `scripts/bump-versions.js`, all package CHANGELOGs/package.jsons, and the branch divergence; every decision-gating fact independently re-verified. This is the backbone the process steps hang off; update it as stages are executed.

## Sequence: merge → build → version → publish → back to branch

### Stage 0 — preconditions (before `release:minor` can run) — ✅ DONE (`01f8f45`)
- **Untracked files cleared.** The two design docs (`analysis/2026-06-03-using-pi-spec-2.md`, `analysis/feat-using-pi-context-substrate.md`) were committed on the branch per operator direction; tree is clean. `release.mjs:77` aborts on any non-empty `git status --porcelain` (incl. `??` entries) — that condition is now satisfied.
- **No branch guard.** The script doesn't verify the current branch is `main` — operator/agent responsibility (the merge in Stage C lands us on main before `release:minor`).

> **Baseline correction (verified):** npm `latest` = **0.26.0** for all published packages; `v0.27.0` was tagged but never published. So each package's `[Unreleased]` covers `v0.26.0..HEAD` and the public backfill covers ≤ 0.26.0. The bump is still 0.27.0→0.28.0 locally; consumers jump 0.26.0→0.28.0.

### Stage 1 — merge to main
**Fast-forward, zero conflicts.** `main`'s tip (`f2668fc`) is the merge-base, so `context-jit-spec-v2` is strictly linear ahead — `git merge --ff-only context-jit-spec-v2` from `main` advances it with no merge commit and no conflict possibility. The commit span and diffstat are point-in-time (the branch keeps advancing) — derive at merge time, do not trust a frozen count: `git rev-list --count main..context-jit-spec-v2` and `git diff --stat main...context-jit-spec-v2` (the bulk is substrate data; a smaller slice is code/docs). History carries `8d19ef5 feat: hello` + its removal (a FF preserves both nodes).

### Stage 2 — build
Passes (`release:minor` runs `npm run build` first per `54ec25b`).

### Stage 3 — version (`release:minor`)
0.27.0 → **0.28.0** lockstep across all 7 packages (incl. the two new ones); inter-package deps rewritten to `^0.28.0`; commit `Release v0.28.0` + tag `v0.28.0`. The changelogs now carry content (Part A landed, below); correct stamping depends on the Part B `release.mjs` re-seed fix (pending, below).

### Stage 4 — publish (`npm publish --workspaces --access public`)
**Mechanically succeeds** — none private; the `--access public` flag covers the fact that *no package declares `publishConfig.access`*; the two new packages are correctly configured (bin, `files`, `prepublishOnly`).

### Stage 5 — back to branch
After release, **main carries the version bumps + `Release v0.28.0` commit/tag; `context-jit-spec-v2` does not.** To keep working on the branch, merge `main` back into it (bringing 0.28.0), or the branch's package.jsons stay at 0.27.0 and diverge from main.

## Changelog backfill (Part A) — landed; audit findings open

Part A of `analysis/2026-06-02-changelog-backfill-and-forward-discipline.md` is executed: seven per-package CHANGELOG commits `800958f`..`d1437a9` on `context-jit-spec-v2`. All seven packages now carry a CHANGELOG with an `[Unreleased]` section (the three previously-missing — pi-agent-dispatch, pi-context-cli, pi-project-workflows — were created). `release:minor`'s stamp step therefore has content to stamp.

Landed shape per package: pi-context consolidated `[0.26.0]` + `[Unreleased]`; pi-jit-agents `[0.14.6]` + `[0.26.0]` + `[Unreleased]`; pi-workflows + pi-behavior-monitors per-published-version (`0.1.x..0.26.0`) + `[Unreleased]`; pi-project-workflows per-published-version lockstep lines + `[Unreleased]`; pi-agent-dispatch + pi-context-cli `[Unreleased]`-only.

A deterministic adversarial audit ran against the landed content. **Open findings stand**, recorded in `analysis/2026-06-03-changelog-backfill-audit-state.md` (not yet orchestrator-re-verified): pi-workflows `[Unreleased]` advertises FGAP-099 work that `117b351` reverted (revert also undocumented); pi-context `[Unreleased]` omits `45dcf66` + `e1b7773`; pi-behavior-monitors pre-floor `[0.1.0]`/`[0.1.1]` headers. Audit-verified clean across all seven: `files[]` ships every CHANGELOG, no forbidden citation tokens, every "no-change" lockstep claim honest.

Root cause of the original dormancy (the Part B target, still pending): `release.mjs` never re-seeds `[Unreleased]` (R1), silently skips missing/empty sections (R2), and nothing enforces an entry (R3).

## Prerequisites for a changelog-bearing 0.28.0 — status
1. **Backfill (Part A)** — ✅ landed (`800958f`..`d1437a9`); audit findings open (above, in the audit-state file).
2. **Fix `release.mjs` (Part B)** — ⏳ pending: re-seed a fresh `[Unreleased]` after stamping (R1); error instead of silently skipping when a package with published-surface changes has no section, and enumerate all packages incl. missing files (R2). Also the `check-changelog.mjs` commit guard + CI step (D2).
3. **`CHANGELOG.md` in `files[]`** — ✅ audit-verified all seven ship (D4).
4. **`publishConfig.access:"public"` on all 7** — ⏳ pending: this publish is saved only by the `--access public` flag; a future flag-less publish defaults to restricted.
5. **Clear the 2 untracked files** — ✅ done (`01f8f45`).

Remaining before a changelog-bearing 0.28.0: resolve the open audit findings, land Part B (release.mjs R1/R2 + guard), and add `publishConfig.access`. Then the Stage 1–5 sequence (merge → build → version → push → publish → back-to-branch).
