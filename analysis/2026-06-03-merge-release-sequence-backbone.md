# Merge → Release Sequence — Process Backbone

**Date:** 2026-06-03. **Status:** governing process artifact (standing). **Scope:** the `context-jit-spec-v2` → `main` merge, lockstep version, npm publish, and return-to-branch sequence. Derived from read-only investigation of `scripts/release.mjs`, `scripts/bump-versions.js`, all package CHANGELOGs/package.jsons, and the branch divergence; every decision-gating fact independently re-verified. This is the backbone the process steps hang off; update it as stages are executed.

## Sequence: merge → build → version → publish → back to branch

### Stage 0 — preconditions (before `release:minor` can run) — ✅ DONE (`01f8f45`)
- **Untracked files cleared.** The two design docs (`analysis/2026-06-03-using-pi-spec-2.md`, `analysis/feat-using-pi-context-substrate.md`) were committed on the branch per operator direction; tree is clean. `release.mjs:77` aborts on any non-empty `git status --porcelain` (incl. `??` entries) — that condition is now satisfied.
- **No branch guard.** The script doesn't verify the current branch is `main` — operator/agent responsibility (the merge in Stage C lands us on main before `release:minor`).

> **Baseline correction (verified):** npm `latest` = **0.26.0** for all published packages; `v0.27.0` was tagged but never published. So each package's `[Unreleased]` covers `v0.26.0..HEAD` and the public backfill covers ≤ 0.26.0. The bump is still 0.27.0→0.28.0 locally; consumers jump 0.26.0→0.28.0.

### Stage 1 — merge to main — ✅ DONE (`32a2d05`)
Not a clean fast-forward in the event: `origin/main` had diverged from the `f2668fc` merge-base by one commit (`8afa483`, a README "musings" edit pushed directly). Reconciled by merging `origin/main` into the arc — merge commit `32a2d05`, README conflict resolved to the arc's superset (which already evolved the same intro). Merge (not rebase) preserved the arc commit SHAs the changelogs/ledgers cite, and integrated `8afa483` as a parent so the push was accepted. (History carries `8d19ef5 feat: hello` + its removal.)

### Stage 2 — build — ✅ DONE
`npm run build` green across all 6 building packages.

### Stage 3 — version (`release:minor`) — ✅ DONE (`abfb4d0`)
0.27.0 → **0.28.0** lockstep across all 7 packages; inter-package deps rewritten to `^0.28.0`; each `[Unreleased]` stamped to `## [0.28.0] - 2026-06-03` with a fresh empty `[Unreleased]` re-seeded above it (the Part B R1 fix); commit `Release v0.28.0` + tag `v0.28.0`. R2b pre-check passed.

### Stage 4 — publish — ✅ DONE (operator, OTP)
`npm publish --workspaces --access public`. Verified against the registry: all 7 at **0.28.0**, including the two first-time publishes (`pi-context-cli`, `pi-agent-dispatch`). `publishConfig.access: "public"` is now declared on all 7 (Part B), so the access is no longer flag-dependent.

### Stage 5 — back to branch — ✅ DONE
`main` (`abfb4d0`, Release v0.28.0 + tag) pushed to origin; `context-jit-spec-v2` fast-forwarded to `abfb4d0` — branch and main in sync.

## Changelog backfill (Part A) — landed; audit findings open

Part A of `analysis/2026-06-02-changelog-backfill-and-forward-discipline.md` is executed: seven per-package CHANGELOG commits `800958f`..`d1437a9` on `context-jit-spec-v2`. All seven packages now carry a CHANGELOG with an `[Unreleased]` section (the three previously-missing — pi-agent-dispatch, pi-context-cli, pi-project-workflows — were created). `release:minor`'s stamp step therefore has content to stamp.

Landed shape per package: pi-context consolidated `[0.26.0]` + `[Unreleased]`; pi-jit-agents `[0.14.6]` + `[0.26.0]` + `[Unreleased]`; pi-workflows + pi-behavior-monitors per-published-version (`0.1.x..0.26.0`) + `[Unreleased]`; pi-project-workflows per-published-version lockstep lines + `[Unreleased]`; pi-agent-dispatch + pi-context-cli `[Unreleased]`-only.

A deterministic adversarial audit ran against the landed content. **Open findings stand**, recorded in `analysis/2026-06-03-changelog-backfill-audit-state.md` (not yet orchestrator-re-verified): pi-workflows `[Unreleased]` advertises FGAP-099 work that `117b351` reverted (revert also undocumented); pi-context `[Unreleased]` omits `45dcf66` + `e1b7773`; pi-behavior-monitors pre-floor `[0.1.0]`/`[0.1.1]` headers. Audit-verified clean across all seven: `files[]` ships every CHANGELOG, no forbidden citation tokens, every "no-change" lockstep claim honest.

Root cause of the original dormancy (the Part B target, still pending): `release.mjs` never re-seeds `[Unreleased]` (R1), silently skips missing/empty sections (R2), and nothing enforces an entry (R3).

## Prerequisites for a changelog-bearing 0.28.0 — status
1. **Backfill (Part A)** — ✅ landed (`800958f`..`d1437a9`); audit findings all resolved (see `analysis/2026-06-03-changelog-backfill-audit-state.md`).
2. **Fix `release.mjs` (Part B)** — ✅ done: R1 re-seed + R2a missing-file error + R2b empty-with-surface-commits error (`fd597d0`); `check-changelog.ts` commit guard (`d8c24b9`) wired into husky + CI (`df2a62b`); guard growth-detection hardened to list-item count, closing the D1 reflow + D2 empty-new-file gaps (`f1a7106`).
3. **`CHANGELOG.md` in `files[]`** — ✅ audit-verified all seven ship (D4).
4. **`publishConfig.access:"public"` on all 7** — ✅ done (`2d513e3`).
5. **Clear the 2 untracked files** — ✅ done (`01f8f45`).

All prerequisites met and the Stage 1–5 release sequence executed — **0.28.0 is released**: `origin/main` at `abfb4d0` (Release v0.28.0 + tag `v0.28.0`), all 7 packages live on npm at 0.28.0 (registry-verified), `context-jit-spec-v2` synced to `abfb4d0`. This arc is complete.
