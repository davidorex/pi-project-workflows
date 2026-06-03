# Changelog Backfill — Audit State (2026-06-03)

Captures the state established by the deterministic adversarial audit of the seven backfilled CHANGELOGs (Part A commits `800958f`..`d1437a9` on branch `context-jit-spec-v2`). The audit ran read-only (raw `git log`/`npm view`/`grep`, no narration). Findings are recorded flat and unranked. **None of the findings below have been independently re-verified by the orchestrator** — they are the audit agent's results, pending firsthand confirmation.

Baseline used by the audit: npm `latest` = 0.26.0 for published packages; `v0.27.0` tagged but unpublished; each package's `[Unreleased]` must equal the `v0.26.0..HEAD` published-surface commit set. Surface = a package's source + shipped data dirs; substrate/test/.claude/internal commits excluded.

## Findings

- **pi-workflows — `[Unreleased]` advertises a reverted feature.** The "Added" bullet describes the FGAP-099 `composeToolGrant` / parent-grant-threading work (feats `e702b87`, `9860360`, `7463138`). Commit `117b351` — present in the `v0.26.0..HEAD` workflows-surface range — reverted that work ("FGAP-099 work was built in the wrong layer (pi-workflows) — restore to pre-misfire state"); `git show 117b351 --stat` removes `dispatch.ts`/`dispatch.test.ts` additions; `grep -rn composeToolGrant packages/pi-workflows/src` reportedly returns nothing. The feature is advertised but absent from the tree.

- **pi-workflows — revert commit omitted.** `117b351` (the FGAP-099 revert, the operative net change for those lines) appears in the `v0.26.0..HEAD` range but no `[Unreleased]` bullet documents it.

- **pi-context — `45dcf66` omitted from `[Unreleased]`.** The auth-fold commit `45dcf66` modifies `packages/pi-context/src/ops-registry.ts` (in the `v0.26.0..HEAD` pi-context surface range). It is documented in pi-workflows' and pi-agent-dispatch's `[Unreleased]` but absent from pi-context's.

- **pi-context — `e1b7773` omitted from `[Unreleased]`.** `e1b7773` ("correct LLM-misleading reference + docstrings to current model") touches `src/block-api.ts`, `src/context-sdk.ts`, `src/context.ts`, `skills/pi-context/SKILL.md` — shipped source/docstring corrections — and is uncited in `[Unreleased]`.

- **pi-behavior-monitors — pre-floor version headers.** Headers `[0.1.0] - 2026-03-12` and `[0.1.1] - 2026-03-13` name versions below npm's published lower bound `0.1.2` (per `npm view @davidorex/pi-behavior-monitors versions`). Possibly genuine pre-registry origin releases; not confirmable against the npm result.

## Secondary observations (audit-noted, no false claim)

- **pi-workflows `[0.3.0]`** has an empty body though `git log v0.3.0 -- <workflows surface>` shows origin-history commits — an undocumented populated version (makes no false assertion).
- **pi-workflows `[Unreleased]`** carries zero SHA citations, unlike the other SHA-anchored packages — which is what allowed the advertised-but-reverted FGAP-099 content to go unchecked.

## Reported clean by the audit

- **pi-agent-dispatch**: npm 404 → `[Unreleased]`-only; every feat/fix source commit in range cited; no fabricated SHA; files[] ships CHANGELOG.md; no forbidden tokens.
- **pi-context-cli**: npm 404 → `[Unreleased]`-only; range = `{37f3f31, b0a831e}`, both cited, no extras.
- **pi-jit-agents**: full version coverage; `[0.14.6]`/`[0.26.0]`/`[Unreleased]` grounded; no source-commit fabrication or omission.

## Verified-by-audit, all packages

- **files[]**: every package ships `CHANGELOG.md` (explicit entry or `*.md` glob).
- **Forbidden citation tokens** (`FGAP-\d|DEC-\d|TASK-\d|issue-\d`): `grep` empty in all seven changelog bodies.
- **No-change / lockstep version claims** (pi-workflows, pi-behavior-monitors): every version entry asserting no surface change has an empty tag-range `git log` (honest).

## State

The seven changelog commits are landed and content-stable (history repair verified: tree `a048551`, byte-identical to pre-repair). The findings above stand against that landed content and are not yet orchestrator-re-verified.
