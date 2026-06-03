# Changelog Backfill — Audit State (2026-06-03)

Captures the state established by the deterministic adversarial audit of the seven backfilled CHANGELOGs (Part A commits `800958f`..`d1437a9` on branch `context-jit-spec-v2`). The audit ran read-only (raw `git log`/`npm view`/`grep`, no narration). The findings below were firsthand re-verified by the orchestrator and resolved (corrections committed; two raised items were checked and dismissed as non-defects).

Baseline used by the audit: npm `latest` = 0.26.0 for published packages; `v0.27.0` tagged but unpublished; each package's `[Unreleased]` must equal the `v0.26.0..HEAD` published-surface commit set. Surface = a package's source + shipped data dirs; substrate/test/.claude/internal commits excluded.

## Findings — resolved

The three substantive findings are corrected, each in its own commit:
- **pi-workflows** — the `[Unreleased]` "Added" bullet advertised FGAP-099 `composeToolGrant`/parent-grant work that `117b351` reverted (net-zero across `v0.26.0..HEAD`; `composeToolGrant` absent from the tree). Bullet removed (`da866b3`); the revert needs no entry (no net change).
- **pi-context** — `[Unreleased]` omitted `45dcf66` (the auth-fold's pi-context surface: per-op `authGated` + the `gatedTools` export on `./ops`). Added (`ff7aba4`).
- **pi-context** — `[Unreleased]` omitted `e1b7773` (docstring/reference correction in `block-api`/`context-sdk`/`context` to the content-addressed model). Added (`3f3091d`).

Two items the audit raised were checked and are **not defects**: pi-project-workflows (its npm-404 was an erroneous result — `npm view` returns 26 published versions; the per-version lockstep backfill is correct) and pi-behavior-monitors `[0.1.0]`/`[0.1.1]`/`[0.2.0]` (accurate pre-publish dev history — no npm publish, no tags, publishing began at `0.1.2` — preserved per the governing artifact's D1; the audit also undercounted these, naming only `0.1.0`/`0.1.1`).

**No open findings.**

## Secondary observations (audit-noted, no false claim)

- **pi-workflows `[0.3.0]`** has an empty body though `git log v0.3.0 -- <workflows surface>` shows origin-history commits — an undocumented populated version (makes no false assertion).
- **pi-workflows `[Unreleased]`** carries no per-bullet SHA citations, unlike the other SHA-anchored packages.

## Reported clean by the audit

- **pi-agent-dispatch**: npm 404 → `[Unreleased]`-only; every feat/fix source commit in range cited; no fabricated SHA; files[] ships CHANGELOG.md; no forbidden tokens.
- **pi-context-cli**: npm 404 → `[Unreleased]`-only; range = `{37f3f31, b0a831e}`, both cited, no extras.
- **pi-jit-agents**: full version coverage; `[0.14.6]`/`[0.26.0]`/`[Unreleased]` grounded; no source-commit fabrication or omission.

## Verified-by-audit, all packages

- **files[]**: every package ships `CHANGELOG.md` (explicit entry or `*.md` glob).
- **Forbidden citation tokens** (`FGAP-\d|DEC-\d|TASK-\d|issue-\d`): `grep` empty in all seven changelog bodies.
- **No-change / lockstep version claims** (pi-workflows, pi-behavior-monitors): every version entry asserting no surface change has an empty tag-range `git log` (honest).

## State

The seven changelog commits are landed and content-stable (history repair verified: tree `a048551`, byte-identical to pre-repair). All audit findings are resolved (above); no open findings remain against the landed content.
