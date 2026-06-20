# Repo current state — 2026-06-20

Truth derived from the live machine, git, and the active `.context` substrate (not from any narrative). For a cold session opening this repo.

## Position

- **Active branch:** `feat/task-069-operator-binary-copy` (working tree clean). HEAD `6c0edf9`.
- **Integration status:** the branch is **60 commits ahead of `main`, 0 behind** — NOT merged to `main`, and NOT merged into `context-jit-spec-v2`. Its base is `e324d2a` (already on `main`). So `main` lacks the entire promote-cli arc + the FGAP-095..100 / issue-004..009 / TASK-068 substrate filings on this branch.
- **Active substrate:** `.context` (`.pi-context.json` `contextDir`). `previous_contextDir` is `.context-jit-spec-v2` (round-trip target). Two substrates on disk: `.context`, `.context-jit-spec-v2`.
- **Version:** `0.31.0` (lockstep, unchanged). Releases HELD; no `release:*` without per-release authorization.

## Operator binary (promote-cli arc — just completed)

The live operator `pi-context` is now a **packed COPY**, no longer an npm-link symlink into the repo:

- `/opt/homebrew/bin/pi-context` → `../lib/node_modules/@davidorex/pi-context-cli/dist/bin.js` (a real installed directory under the global prefix, NOT a symlink into `/Users/david/Projects/workflowsPiExtension`).
- Installed via `npm run promote:cli` (`scripts/promote-cli.mjs`): build → `npm pack` the `@davidorex` workspace set → `npm i -g --force <tarballs>` into the real global prefix.
- A repo `npm run build` (`rm -rf dist && tsc`) leaves the installed bin's inode + content hash unchanged — the dev build can no longer mutate or brick the operator (VER-055 criterion 4, verified on the real `/opt/homebrew`).

**Arc closure (all in `.context`, all consistent with the machine):**
- **TASK-069** `completed` — 14 acceptance criteria, all verified on the real global (VER-055).
- **issue-004** `resolved` (the npm-link coupling, critical) — resolved_by TASK-069, final fix `409a71d`.
- **issue-006** `resolved` (poisonable/unvalidated destructive target, critical) — fixed by `cleanNpmEnv()` scrub + pre-destruction containment validation; the inherited-prefix REFUSAL was removed in `409a71d` (it broke the documented `npm run promote:cli` path; the scrub, not refusal, is the non-poisonability mechanism).
- **issue-007** `resolved` (validate-vs-act TOCTOU, critical) — `60613cc` materializes + fully-resolves + re-validates the target, returns the resolved realpath consumed by every op.
- **issue-008** `resolved` (glued `--prefix=<dir>` mis-routed) — `8d4bdc7`.
- **issue-009** `resolved` (post-install guard path-representation divergence) — `8d4bdc7`.
- **VER-055** `passed` — iterate-5, all 14 criteria on the real global (the load-bearing verification).
- **VER-053** `partial`, **VER-054** `partial` — these are the iterate-2 / iterate-3 point-in-time verifications; their `partial`/`skipped`/`failed` criterion entries are HISTORICALLY ACCURATE records of those earlier iterates (real-global + docs skipped, leaf-TOCTOU `failed` then), later superseded by VER-055. They are not drift — do not "correct" them to passed.

## In-flight (derived `currentState` focus)

Two tasks are `in-progress` (the CLI reports both as in-flight):

- **TASK-020** — config-driven state-derivation registry + `currentState` rewire (closes FGAP-017 P2; advances FEAT-004). Note: TASK-021 is blocked on TASK-020.
- **TASK-068** — make `issues` a gap-sibling first-class open-work kind (addresses FGAP-098; prerequisite for ever addressing issue-004-class issues by a task). Interacts with FGAP-094 / TASK-066 / TASK-067 (catalog back-port).

Neither is mentioned in any prior CLAUDE.md status note — they are this branch's open work.

## Next-actions (derived, top of queue)

`FGAP-099` (P1) leads, then the P2 gap cluster (FGAP-017, 033-036, 038, 040, 042-045, 061, 071, 074). New high-priority gaps filed this branch:

- **FGAP-099** (P1, `identified`) — block data carries no `schema_version`, so read-time AJV validation + version-mismatch migration are inert for ALL blocks.
- **FGAP-098** (`identified`) — issues not a gap-sibling first-class open-work kind (→ TASK-068, in-flight).
- **FGAP-100** (`identified`) — a sub-element of a substrate item (nested-array part, e.g. an `acceptance_criteria` entry / `criteria_results` row) has no stable identity; resolution TBD (decision to be filed). Class-level.
- **FGAP-095 / 096 / 097** (`identified`) — config-schema evolution has no load-time migration (095); config repair impossible once stored config invalid, validate-before-mutate deadlock (096); no additive/expand-contract discipline + no breaking-diff gate (097). The config-side siblings of the binary-coupling incident that drove issue-004.

## Standing backlog (unchanged from prior tracker; spot-checked accurate)

- **FGAP-061** (P2, `identified`) — ready/blocked deriver honors only `task_gated_by_item` (NOW slice shipped via TASK-065); feature/story gates + config-declared all-kinds readiness remain FORWARD → **FEAT-004**.
- **FGAP-090** `closed` (VER-047/048/049 via TASK-061/062/063); **TASK-064** completed.
- **FGAP-091** `identified` — no forcing-function for warranted non-invariant closure edges.
- **FGAP-093** `identified` — write-time edge guard lacks full write↔validate parity (dangling/unregistered-endpoint + cycle accepted at write).
- **FGAP-094** (P2, `identified`) — packaged catalog relation_types is a strict subset of live config (6 live-only incl. `task_gated_by_item`); → TASK-066 (back-port, `planned`) + TASK-067 (build-time parity gate, `planned`).
- **FGAP-011** `accepted` — no release/version block kind.
- **FGAP-089** (P3, `identified`) — PreToolUse hooks scope on op-shape/block-name, not target substrate (develop against substrate copies, never the live guards).
- **Open issues (3):** issue-002 (layer-plans nested id-bearing arrays, low), issue-003 (operator-substrate refused-conventions resync, medium, not reproducible against this repo), issue-005 (same-version resync verbatim-overwrites without re-validation, high). None implicated by this session's work.

## Substrate aggregate (derived `context-status`)

tasks 69 (50 completed, 16 planned, 2 in-progress, 1 cancelled) · framework-gaps 100 (51 closed, 5 accepted, 44 identified) · issues 9 (6 resolved, 3 open) · verification 55 (53 passed, 2 partial) · decisions 18 (all enacted) · features 9 (5 complete, 4 proposed) · research 19 · stories 14 (all complete). Build: 2392 tests, 109 source files.

## Evidence pointers

- Promote-cli design + decoupling: `analysis/2026-06-18-proving-ground-prior-art-research.md`, `analysis/2026-06-18-isolated-proving-ground-method.md`.
- Promote-cli safety-defect chain: `analysis/2026-06-19-promote-cli-prefix-poisoning-safety-defect.md`, `analysis/2026-06-20-issue-006-fix-determination.md`, `analysis/2026-06-20-task069-status-and-failure-signal.md`, `analysis/2026-06-19-task069-process-failure-audit.md`.
- Config-schema-evolution gaps (095-097): `analysis/2026-06-19-config-schema-evolution-gap-decomposition.md`, `analysis/2026-06-18-config-migration-*.md`.
- Block schema_version (FGAP-099): `analysis/2026-06-19-block-schema-version-stamping.md`.
- Issues-as-gap-sibling (FGAP-098 / TASK-068): `analysis/2026-06-19-gaps-issues-sibling-parity-shape.md`, `analysis/2026-06-19-task068-update-impact.md`.
- Sub-element identity (FGAP-100): `analysis/2026-06-19-sub-element-identity-gap.md`.
