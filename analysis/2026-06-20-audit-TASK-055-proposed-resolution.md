# Audit — TASK-055 proposed resolution (committed-substrate pre-flight + git-tag restore guidance)

Date: 2026-06-20
Scope: read-only audit of TASK-055's description + acceptance_criteria (the proposed resolution) against the cited code. No mutation, no implementation.
Verdict: **HAS-PROBLEMS** (sound in aim; two design defects + one underspecification that would poison the implementation brief).

---

## What the task proposes

Add a pre-flight committed-substrate check to the `update` op that, on a dirty substrate, **"warns or refuses"**, with a runtime message naming `git tag` as the restore-point workflow. Surface the guidance in three places: (1) the runtime dirty-substrate message, (2) the `update` op's `description`/`promptSnippet` in `ops-registry.ts`, (3) SKILL.md + READMEs via `docs-surface-sync`. No new doc artifact, no substrate-tag op (DEC-0004: git owns refs/snapshots; `git tag` + `git checkout <tag> -- <substrate-dir>` is the restore path).

## Code facts established (cited)

- `updateContext(cwd, { dryRun })` is defined at `packages/pi-context/src/index.ts:1818`; it returns `UpdateResult` (fields: `error?`, `dryRun`, `resynced[]`, `migrated[]`, `blocked[]`, `blockedDetail[]`, `refused[]`, `merged[]`, `conflicts[]`, `reported[]`, `inSync[]`, `registryAdditions`, `migrationsRegistered[]`). **No `warnings[]` field, no `report` string field.**
- The op surface is `ops-registry.ts:1529` (`name: "update"`), `surface: "use"`, sole param `dryRun?: boolean`. `run` calls `updateContext` and returns `result.error` as the op error or `{ json: result }`.
- `updateContext` does write on a live (non-dryRun) run: `writeSchemaCheckedForDir` (`index.ts:1980`), `putObject` (`:2072`), `fs.writeFileSync`+`fs.renameSync` for in-file markers (`:2081`–`:2082`), `reconcilePendingBlockedForDir` (`:2084`), `writeConfig` (`:2142`), plus baseline-stamp writes via `stampBaselineFromBody`/`refreshBaselineForSchema`. **All writes are gated by `dryRun` already; a dryRun preview writes nothing.**
- `updateContext` performs **no git interaction** today.
- An in-repo git idiom already exists: `cleanGitEnv()` (`packages/pi-context/src/git-env.ts:23`) + `execSync("git …", { cwd, encoding: "utf-8", env: cleanGitEnv() })` wrapped in `try/catch` for non-repo tolerance (`context-sdk.ts:443`–`452`). This is the correct reuse target — the task does not name it.
- The substrate's `objects/` IS git-tracked (70 tracked object files under the active substrate), so the DEC-0004-derived restore workflow (`git tag` then `git checkout <tag> -- <substrate-dir>`) is valid. **This assumption is sound.**
- `docs-surface-sync` (convention, severity error, enforcement review) requires the package README + monorepo README + changed op strings + SKILL.md be CHECKED for staleness, usage-only, with CHANGELOG `[Unreleased]` carrying any fix framing. The task's docs criteria are consistent with it.

---

## Problems

### P1 — "warn OR refuse" is an unresolved fork filed as a requirement (DESIGN defect; provenance defect)

The description and criterion 1 both say the op **"warns or refuses"**. This is a binary behavioral fork left open in the filing — and the two branches are not interchangeable:

- **Refuse** = a gate: `update` returns an error and writes nothing on a dirty substrate. This changes `update` from always-available to conditionally-blocked, and an operator mid-arc with legitimately-uncommitted substrate edits (the normal state during active work) is now hard-blocked from running `update` until they commit. That is a scope-creep behavioral change with real friction, and it has no opt-out flag in the proposed param surface (still only `dryRun`).
- **Warn** = advisory: `update` proceeds and surfaces a message. No blocking, no new failure mode.

A choice between a hard gate and an advisory is exactly the kind of qualifier that, per `filing-provenance`, "narrows what the user said … is never derivable — it is a cited user decision or absent." The task notes cite a "G1-derived operator-story think-out" as the source, but the criterion encodes BOTH options as acceptable, which means a downstream implementation brief (composed verbatim) could ship either — including the hard gate, which is the higher-impact, harder-to-reverse behavior. Filing an open fork as a criterion launders the unmade decision into authority.

The simpler, lower-risk, best-practice default — and the one the runtime message text itself implies ("commit or git tag first to keep a restore point" is advisory phrasing, not a refusal) — is **warn-only, non-blocking, no new failure mode, no new param**. If a refuse mode is genuinely wanted it is a separate, explicitly-flagged opt-in, not an "or".

### P2 — "warn or refuse" collides with `dryRun` and ignores that a dryRun preview is already side-effect-free (WRONG assumption / OVERLY broad)

The task frames the pre-flight as guarding "update mutates with no committed-baseline pre-flight" (notes). But `updateContext` already takes `dryRun`, and **every write is dryRun-gated** (`index.ts:1980, 2072, 2081-2082, 2084, 2142`). A `--dryRun true` invocation mutates nothing — there is nothing to protect there, and emitting a "commit first to keep a restore point" warning on a read-only preview is noise that trains operators to ignore it.

The proposed resolution does not scope the check to the live (writing) path. The check must fire **only when `dryRun !== true`** (the path that actually writes). The current text would, read verbatim, attach the warning unconditionally.

### P3 — the warning has nowhere to ride in the result, and the message-emission mechanism is unspecified (UNDERSPECIFIED → fragility)

Criterion 1 says "the runtime message says …" but `UpdateResult` has no `warnings[]` or `report` field, and the op `run` returns `{ json: result }` — there is no human-readable string channel on the result today (the existing report strings `renderBlocked`/`renderConflicts`/`renderCheckStatus` are separate render functions the CLI invokes, not fields on `UpdateResult`). The task says "the text rides the op's existing strings and the new warning" — but there is **no existing warning channel**; this is a NEW `UpdateResult` field (e.g. `warnings?: string[]`) plus a render/print site. Leaving that unspecified invites the implementer to either (a) `console.log`/`console.error` the message — which violates `feedback_no_stderr_diagnostics` (no ad-hoc stderr/stdout diagnostics; extend the canonical structured pipeline) — or (b) bolt the string onto `error`, conflating an advisory with a fatal. The corrected resolution must name the structured carrier explicitly.

### Non-problem confirmations (sound elements — keep)

- **No substrate-tag op / DEC-0004 deference**: correct. `objects/` is git-tracked (verified); git owns snapshots; a bespoke tag op would duplicate git. Keep.
- **Docs-surface-sync three-place surfacing**: consistent with the convention; the op `description`/`promptSnippet` and READMEs/SKILL are the right targets. Keep — with the refinement that a *new* `UpdateResult.warnings` field and the warn-only behavior are what the op strings describe.
- **Restore workflow text** (`git tag` before update, `git checkout <tag> -- <substrate-dir>` to restore): valid and the right guidance.

---

## Proposed corrected proposed-resolution (ready to replace TASK-055 fields)

### description (replacement)

> Add a pre-flight committed-substrate check to the live (writing) path of `update` — fires only when `dryRun !== true`. On a dirty substrate (uncommitted changes under the active substrate dir, detected via the in-repo `execSync`+`cleanGitEnv()` git idiom — `git status --porcelain -- <substrate-dir>`, wrapped in the same non-repo-tolerant try/catch as `context-sdk.ts:443`) it **WARNS — it does not refuse**: `update` proceeds normally and emits an advisory string carried on a NEW `UpdateResult.warnings: string[]` field (no `console.*` diagnostic; the warning rides the structured result the way `blockedDetail`/`conflicts` do, and the CLI renders it). The advisory reads: "Substrate has uncommitted changes — commit or `git tag` first to keep a restore point before update mutates the installed model." Guidance visible in three places per docs-surface-sync: (1) the runtime warning above; (2) the `update` op's `description`/`promptSnippet` in ops-registry, noting update warns (does not block) on a dirty substrate and naming the git-tag restore point; (3) SKILL.md + package/root READMEs via skill-narrative regen + the README update sections. No new doc artifact. No substrate-tag op: per DEC-0004 git owns refs/snapshots; the substrate including objects/ is git-tracked (verified), so `git tag` before update + `git checkout <tag> -- <substrate-dir>` is the restore workflow. A `dryRun` preview writes nothing and emits no dirty-substrate warning (nothing to protect).

### acceptance_criteria (replacement)

1. On a LIVE `update` (`dryRun !== true`) against a substrate with uncommitted changes, `UpdateResult.warnings` carries the advisory "Substrate has uncommitted changes — commit or `git tag` first to keep a restore point …"; `update` still proceeds and writes (warn-only, NOT a refusal); on a clean substrate `warnings` is empty.
2. A `dryRun: true` preview emits NO dirty-substrate warning (it writes nothing).
3. The dirty-state check uses the existing `execSync` + `cleanGitEnv()` idiom with the non-repo-tolerant try/catch; outside a git repo it is a silent no-op (no warning, no error).
4. The advisory is carried on the structured `UpdateResult` (a new `warnings: string[]` field) and rendered by the CLI — never via `console.error`/`console.log`.
5. The `update` op `description`/`promptSnippet` in ops-registry state update WARNS (does not block) on a dirty substrate and name the `git tag` / `git checkout <tag> -- <substrate-dir>` restore point (rendered by --help, reflection, SKILL.md).
6. SKILL.md + package and root READMEs carry the guidance via skill-narrative regen + README update sections, per docs-surface-sync; CHANGELOG [Unreleased] carries the entry.
7. No new doc artifact; no substrate-tag op.

### notes (addendum)

> Audit 2026-06-20: resolved the original "warn OR refuse" fork to WARN-ONLY (refuse is a higher-impact behavioral gate with no opt-out and would block legitimate mid-arc uncommitted work; not derivable per filing-provenance, so not filed). Scoped the check to the live path (dryRun already side-effect-free). Named the structured `UpdateResult.warnings` carrier (no ad-hoc stderr per feedback_no_stderr_diagnostics) and the existing cleanGitEnv idiom as the reuse target. DEC-0004 deference and objects/-is-git-tracked restore workflow confirmed sound.
