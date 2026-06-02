# Changelog Backfill & Forward Discipline — Governing Artifact

Date: 2026-06-02
Repo: `/Users/david/Projects/workflowsPiExtension`
Scope: This is a **scoping + governance** deliverable. It does NOT perform the backfill. It (1) scopes the historical backfill and (2) establishes the durable forward discipline plus the enforcement mechanism that prevents re-dormancy. Implementers are dispatched from Part A; the binding convention is Part B.

All counts that drift over time are given as "as of `v0.27.0`..`HEAD` @ 2026-06-02" with a re-derive command. Re-run before acting.

---

## Context / current state

### The dormancy
The six packages version in lockstep at **0.27.0**. The last release tag is `v0.27.0` (2026-05-25). Since that tag there are **408 commits** (re-derive: `git rev-list v0.27.0..HEAD --count`). None of the four existing changelogs has recorded anything close to current state, and two packages have no changelog file at all.

### Per-package gap table (as of v0.27.0..HEAD @ 2026-06-02)

| Package | CHANGELOG exists | Top entry recorded | Last commit to its CHANGELOG | Dormancy span | src/ commits since v0.27.0 |
|---|---|---|---|---|---|
| `pi-context` | yes | `[0.3.0]` 2026-03-18 | `6eb5e8b` 2026-05-09 (rename only, not a release) | 0.3.0 → 0.27.0 (24 minor releases unrecorded) | 63 |
| `pi-workflows` | yes | `[0.3.0]` 2026-03-18 | `cbb8a84` 2026-03-19 (Release v0.3.0) | 0.3.0 → 0.27.0 | 12 |
| `pi-behavior-monitors` | yes | `[0.14.6]` 2026-04-27 | `3c75865` 2026-04-28 (Release v0.14.6) | jumps `[0.3.0]`→`[0.14.6]` (0.4.0–0.14.5 unrecorded), then `[0.14.6]`→0.27.0 dormant | 0 (5 non-src commits) |
| `pi-jit-agents` | yes (header only) | NONE — zero version entries | `239f718` 2026-04-12 (file created empty at extraction) | entire history (extracted ~0.4.x) → 0.27.0 | 12 |
| `pi-agent-dispatch` | **MISSING** | — | — | entire history (scaffolded `a1d8072` 2026-05-28 at 0.26.x) → 0.27.0 | 39 |
| `pi-project-workflows` (meta) | **MISSING** | — | — | entire history (created `b73e7ff` 2026-03-17) → 0.27.0 | n/a (re-export meta-package; no own src) |

Re-derive the table:
```bash
# current versions
for p in packages/*/; do node -e "const v=require('./$p/package.json'); console.log(v.name, v.version)"; done
# last commit touching each changelog
for f in packages/*/CHANGELOG.md; do echo "$f:"; git log -1 --format='  %h %ci %s' -- "$f"; done
# src/ commits per package since last tag
for p in pi-agent-dispatch pi-behavior-monitors pi-context pi-jit-agents pi-workflows; do echo "$p: $(git log v0.27.0..HEAD --oneline -- packages/$p/src/ | wc -l)"; done
```

### The two missing changelogs
- `pi-agent-dispatch` — scaffolded 2026-05-28 (`a1d8072`, TASK-089), 39 src commits since v0.27.0; the heaviest-changing package with no changelog at all.
- `pi-project-workflows` — meta-package re-exporting the other extensions; no own source. Still ships to npm under its own version, so consumers benefit from a changelog that at minimum summarizes "lockstep bump to X.Y.Z; see member-package changelogs."

### Root cause (mechanism, not symptom)
The release tooling never re-seeds an `[Unreleased]` section after consuming one. Verified end-to-end:

1. `scripts/release.mjs` flow: check uncommitted → `npm run version:<type>` (→ `scripts/bump-versions.js`, which bumps every `packages/*/package.json` in lockstep and syncs cross-refs; **does not touch changelogs**) → `updateChangelogsForRelease(version)` → `git add . && git commit -m "Release vX" && git tag vX`.
2. `getChangelogs()` (release.mjs:47) globs `packages/*/CHANGELOG.md` and **filters to existing files** — the two missing changelogs are silently absent from the loop forever.
3. `updateChangelogsForRelease()` (release.mjs:53) for each existing changelog: if it lacks `## [Unreleased]`, prints `Skipping … no [Unreleased] section` and continues; otherwise does a single `content.replace("## [Unreleased]", "## [version] - date")` (release.mjs:65) and writes. **It never inserts a fresh empty `## [Unreleased]` afterward, and it never generates entries from git — it only renames the heading.**

Consequence chain (verified against git history):
- `56dc736` (2026-03-17) introduced `## [Unreleased]` sections in all three then-existing changelogs ("for the release script to target").
- `Release v0.3.0` (`cbb8a84`) consumed each `[Unreleased]` → `[0.3.0]`, leaving NO `[Unreleased]` behind.
- Every release after 0.3.0 therefore hit the `Skipping … no [Unreleased]` branch for pi-context and pi-workflows → frozen at `[0.3.0]` from 2026-03-19 onward.
- pi-behavior-monitors received one more hand-inserted `[Unreleased]` at `f10e8bb` (the seedExamples→three-tier-loader fix), consumed at `Release v0.14.6`, then went dormant again under the same no-reseed mechanism. (At `v0.14.6` ALL packages were genuinely at 0.14.6 — this was real lockstep, not pre-monorepo divergence. The `[0.3.0]`→`[0.14.6]` jump means releases 0.4.0–0.14.5 happened but were never recorded.)
- pi-jit-agents was extracted with an empty changelog (`239f718`) and never had an `[Unreleased]` added, so the script's first `if` always skips it → zero entries ever.

Root cause is therefore **three coupled defects**, all of which Part B must repair (no path may leave any in place):
- **R1 — no re-seed**: the script consumes `[Unreleased]` without writing a fresh empty one back. A correctly-formatted changelog self-disables after exactly one release.
- **R2 — silent skips**: both the missing-file filter (R2a) and the no-`[Unreleased]` branch (R2b) print a line to stdout and continue. A release with nothing to record looks identical to a release that silently dropped everything. There is no failure, no guard.
- **R3 — no enforcement**: nothing requires a user-facing code change to carry a changelog entry. A convention with no guard is exactly how this went dormant the first time; re-seeding alone (R1) would re-arm the section but not keep humans/agents filling it.

The substrate is NOT a usable comprehensive backfill source — see Part A grounding rule. The authoritative complete record of what changed per package is **git, attributed by changed-file path**.

---

## Part A — Backfill plan

### A.1 Scope decision (decisive)
**Backfill the dormant gap to the point each changelog last recorded truth — NOT full history.** Rationale: the pre-dormancy entries (0.1.0–0.3.0, and bm through 0.14.6) are already accurate hand-written Keep-a-Changelog records; re-deriving them from git would risk overwriting good content with lossier reconstructions. Backfill begins immediately after each package's last recorded version:

| Package | Backfill range (versions) | Backfill range (git) |
|---|---|---|
| `pi-context` | 0.4.0 → 0.27.0 (one consolidated block; see A.4) | `cbb8a84..HEAD` for paths `packages/pi-context/` (account for the pi-project→pi-context rename at 0.25.0: `git log --follow`) |
| `pi-workflows` | 0.4.0 → 0.27.0 | `cbb8a84..HEAD` for `packages/pi-workflows/` |
| `pi-behavior-monitors` | 0.4.0 → 0.14.5 (the skipped releases) AND 0.14.7 → 0.27.0 | `cbb8a84..3c75865` and `3c75865..HEAD` for `packages/pi-behavior-monitors/` |
| `pi-jit-agents` | extraction → 0.27.0 (full, file is empty) | `239f718..HEAD` for `packages/pi-jit-agents/` |
| `pi-agent-dispatch` | scaffold → 0.27.0 (full; create file first) | `a1d8072..HEAD` for `packages/pi-agent-dispatch/` |
| `pi-project-workflows` (meta) | create file; summarize lockstep history (full) | re-export bumps; one line per release noting "lockstep to X.Y.Z" |

### A.2 Per-package partition (one implementer per package — six partitions)
Each partition is a single package's changelog. Partitions are independent (no shared file) and dispatch in parallel. Each implementer's brief is bounded to ONE `packages/<name>/CHANGELOG.md` and the git history of `packages/<name>/`.

### A.3 Content source + grounding rule (anti-fabrication — load-bearing)
**Primary source: git commits, attributed by changed-file path, NOT by commit scope.** Verified rationale:
- Commit-scope tokens are mixed: the largest scope groups since v0.27.0 are `.project` (86), `.project/framework-gaps` (43), `substrate-identity` (15) — these are SUBSTRATE-maintenance commits with zero package-source impact. Scope alone would inject non-changes into changelogs.
- Path attribution is exact: a commit belongs in package P's changelog iff it touched `packages/P/` — and is **user-facing** iff it touched `packages/P/src/`, `packages/P/schemas/`, `packages/P/examples/`, `packages/P/templates/`, or `packages/P/skills/` (published surface per each package's `files` array). Commits touching only `test/`, `.claude/`, or internal scaffolding are NOT user-facing and are excluded.

**The substrate is a corroborating/enrichment source, NOT a primary or comprehensive one.** Verified: the active substrate `.context-jit-spec-v2` (per `.pi-context.json` `contextDir`) holds only the jit-agents spec arc — 11 DEC, 6 TASK, 1 FGAP, 5 FEAT — and the legacy `.context` substrate's DEC/TASK/FGAP blocks are empty. Neither spans the full dormancy across all six packages. An implementer who tried to ground entries in substrate items would invent entries it cannot ground for pi-context/pi-workflows/pi-behavior-monitors. Use substrate items ONLY to enrich wording of entries that already have a git-commit grounding (e.g., cite TASK-081 / DEC-0047 when a pi-jit-agents commit references them).

**Grounding rule (mandatory, per entry):** every changelog line MUST trace to at least one specific commit SHA touching that package's published surface. The implementer brief requires the working note (not committed) to map each drafted line → SHA(s). No line without a SHA. Where a commit references a substrate ID (TASK-/DEC-/FGAP-/FEAT-) in its subject, the ID MAY be cited in the entry as a label, but the semantic content is stated in plain English (per the always-plain-English mandate).

Per-package commit enumeration command (the implementer's raw material):
```bash
git log v0.27.0..HEAD --format='%h %s' -- \
  packages/<name>/src/ packages/<name>/schemas/ packages/<name>/examples/ \
  packages/<name>/templates/ packages/<name>/skills/
# for the full dormant range, swap v0.27.0 for the package's last-recorded anchor (A.1).
```

### A.4 Granularity decision (decisive)
**One consolidated `### Added/Changed/Fixed/Removed` block per package covering the whole backfilled range, headed `## [0.27.0] - 2026-05-25`** (the tag date), NOT one section per intervening version. Rationale: the 24-release lockstep span has no per-version release notes to reconstruct faithfully; manufacturing 24 dated sections would fabricate a granularity the record does not support. A single accurate consolidated entry at the current released version is honest and useful. (Future releases get their own dated sections via the forward discipline — Part B — which restores per-release granularity going forward.)

For pi-behavior-monitors, the genuinely-missing pre-0.14.6 releases (0.4.0–0.14.5) are folded into one note under the consolidated `[0.27.0]` block rather than reconstructed individually, for the same reason.

### A.5 Format
Keep-a-Changelog (existing convention): `## [x.y.z] - YYYY-MM-DD`, `### Added` / `### Changed` / `### Fixed` / `### Removed`. Categorize each line by the nature of the change (feat→Added/Changed, fix→Fixed, removal→Removed). Match the prose register of the existing pre-dormancy entries (terse, surface-describing, names the exported symbol/command/behavior).

### A.6 Create-the-two-missing-changelogs step
- `pi-agent-dispatch/CHANGELOG.md` — create with `# Changelog` header, then a consolidated `## [0.27.0] - 2026-05-25` block grounded in `a1d8072..HEAD` for `packages/pi-agent-dispatch/` (scaffold TASK-089 through current dispatch tool surface).
- `pi-project-workflows/CHANGELOG.md` — create with `# Changelog` header; this is a meta re-export package, so its entry is a short note: "Meta-package re-exporting the Pi extensions; versioned in lockstep. See member-package changelogs for surface changes," plus the lockstep version line.
- Both files must be added to each package's `files` array in `package.json` IF not already present (verify; do NOT assume) so they ship to npm. **Note: this `package.json` edit is the one place Part A touches package.json — flag it as an Open Decision (D4) because the MANDATES bar modifying package.json in THIS scoping artifact; the implementer dispatched from this plan performs it, not this document.**

### A.7 Sequencing
1. Implementers draft all six changelogs in parallel (independent files).
2. Each implementer commits its own changelog with a forensic message citing the grounding range and SHA set (per the per-step-commit discipline).
3. After all six land, run the forward-discipline tooling change (Part B) as a separate change so the backfill and the mechanism-repair are reviewable independently.

---

## Part B — Forward discipline (durable, always-followed)

### B.1 The convention (decisive — one approach, no menu)
**Per-commit `[Unreleased]` accumulation, enforced at commit time, consumed-and-reseeded at release time.**

- **Who writes & when:** the author of any commit that touches a package's **published surface** (`src/`, `schemas/`, `examples/`, `templates/`, `skills/` per that package's `files` array) adds a one-line entry under that package's `## [Unreleased]` section **in the same commit**. Per-commit (not per-arc, not per-PR) because: this repo commits in fine-grained per-step units (each subagent commits per step), there is no PR gate in the solo-maintainer + agent workflow, and the per-commit point is the only moment all three of {what changed, why, which package} are simultaneously in hand. Substrate-only / test-only / docs-only commits touching no published surface need NO entry (and the guard must not demand one — see B.3).

- **Where it accumulates:** `## [Unreleased]` at the top of each of the **six** `packages/*/CHANGELOG.md`, with `### Added/Changed/Fixed/Removed` subsections created on demand.

### B.2 Completion-Sequence integration point (exact)
CLAUDE.md "Completion Sequence" currently runs Edit → Build → Check → Test → Runtime demo → Adversarial probe → Skills → **Commit** → Status cascade → Merge → Release. Insert a new step **between "Skills" (step 7) and "Commit" (step 8)**:

> **7.5 — Changelog**: if this change touched any package's published surface, add a line under that package's `## [Unreleased]` (`### Added/Changed/Fixed/Removed`). This is part of the commit, not a follow-up.

Codify the same rule in CLAUDE.md "Conventions" (one bullet) so it is loaded every session as binding, and in each `packages/*/CLAUDE.md` (the per-package files already have a "Commits"/"Releasing" section — replace the stale `maintained via changelogen` line in `pi-behavior-monitors/CLAUDE.md`, which is now inaccurate, with the `[Unreleased]`-per-commit rule).

### B.3 Enforcement guard (the root-cause fix — R3)
**A pre-commit guard (husky) plus a release-time guard (release.mjs), because the two catch different failure modes and neither alone closes the gap.**

- **Commit-time guard** (new `scripts/check-changelog.mjs`, invoked from `.husky/pre-commit` after `npm run check && npm test`): for each package whose **published surface** has staged changes (`git diff --cached --name-only` intersected with the package's `files`-derived published dirs), assert that the same staged change set includes an addition to that package's `## [Unreleased]` section (`git diff --cached packages/<name>/CHANGELOG.md` shows added lines under `[Unreleased]`). If a published-surface change has no accompanying `[Unreleased]` line, **exit non-zero with the package name and the missing-entry message**. This is the direct root-cause fix: a user-facing change cannot land without a changelog line. (Honors the no-`--no-verify` mandate; fix is to add the line, not bypass.)
  - The guard must be precise about "published surface" to avoid false positives on substrate/test/docs commits — derive the dir set from each `package.json` `files` array, not a hardcoded list.

- **Release-time guard** (modify `scripts/release.mjs`): turn the two silent skips into loud failures, and add the missing re-seed:
  - **R1 fix (re-seed):** after replacing `## [Unreleased]` → `## [version] - date`, insert a fresh empty `## [Unreleased]` block (with empty `### Added/Changed/Fixed/Removed` stubs or just the heading) at the top. The section can never self-disable again.
  - **R2a fix (missing-file → fail):** `getChangelogs()` must enumerate ALL six packages and **error** if any expected `CHANGELOG.md` is absent, rather than silently filtering. (After Part A both missing files exist; the guard prevents a future new package from slipping through changelog-less the way pi-agent-dispatch did.)
  - **R2b fix (empty-`[Unreleased]` → fail, conditional):** if a package's `[Unreleased]` is empty/absent at release time AND that package had published-surface commits since the last tag, **fail the release** with the package name. (A package with genuinely no surface change since last release legitimately has an empty `[Unreleased]` — that case prints an informational line and proceeds; the failure is specifically "had changes, recorded none.")

- **CI guard (optional reinforcement, recommended):** add a step to `.github/workflows/ci.yml` running `scripts/check-changelog.mjs` against the PR's diff range so the rule holds even if a local husky hook is bypassed or absent. Listed as Open Decision D2.

### B.4 The 6-package mapping (decisive)
**Per-package changelogs (six independent `[Unreleased]` sections), NOT one shared section.** Rationale: although versioning is lockstep, the *content* per release differs per package (a release may change pi-context heavily and pi-workflows not at all). Per-package `[Unreleased]` preserves that fidelity and matches the existing four-file structure. The lockstep version number is shared; the per-release notes are per-package. The meta-package `pi-project-workflows` keeps a thin changelog (lockstep line + pointer to members).

### B.5 Where this gets codified (binding, not advisory)
- `CLAUDE.md` — "Completion Sequence" step 7.5 + one "Conventions" bullet (per the operating-context-lockstep mandate: the rule and the surface land together).
- `scripts/check-changelog.mjs` — new commit-time guard (the binding enforcement).
- `.husky/pre-commit` — invoke the guard.
- `scripts/release.mjs` — R1/R2a/R2b fixes.
- each `packages/*/CLAUDE.md` — per-package "Releasing"/"Commits" note; correct the stale `changelogen` line in `pi-behavior-monitors/CLAUDE.md`.
- (optional) `.github/workflows/ci.yml` — CI reinforcement.

A convention in prose alone is what went dormant the first time. The husky guard (B.3 commit-time) is the load-bearing piece: it makes the rule mechanically unavoidable rather than a remembered habit.

---

## Open decisions for the user (scope calls)

- **D1 — Backfill granularity.** Part A.4 recommends ONE consolidated `[0.27.0]` block per package over the dormant span (honest; avoids fabricating 24 per-version sections). Alternative the user may prefer: reconstruct individual per-version sections for releases where commit grouping is clean enough. Recommendation stands at consolidated; user confirms.
- **D2 — CI reinforcement.** Whether to add the changelog guard to `.github/workflows/ci.yml` in addition to husky (B.3). Husky alone is bypassable with `--no-verify` (which the mandates forbid, but CI enforces it for actors outside this repo's mandates). Recommend: add it.
- **D3 — Guard severity during transition.** The commit-time guard, switched on before backfill completes, would block commits to packages whose backfill is mid-flight. Recommend: land backfill (Part A) first, then the guard (Part B) — sequencing already in A.7/B is ordered this way; user confirms the ordering.
- **D4 — `package.json` `files` edits for the two new changelogs.** A.6 requires the two new `CHANGELOG.md` files be in their package `files` arrays to ship to npm. This scoping artifact is barred from editing `package.json`; the Part-A implementer performs it. User confirms the implementer is authorized to touch those two `package.json` `files` arrays.
- **D5 — Empty-`[Unreleased]`-with-changes release behavior.** B.3 R2b recommends FAILING a release when a package had published-surface commits but recorded nothing. Confirm "fail" (vs "warn-and-proceed"). Recommend: fail — warn-and-proceed is how the dormancy persisted.

## Stated plainly: what could not be determined here
- Whether every one of the ~408 commits since v0.27.0 that touched a package's published surface represents a behavior change a consumer would care to read is a judgment the per-package implementer makes against the grounding rule (A.3); this artifact fixes the source and rule but does not pre-classify each commit.
- The exact wording of backfilled entries is left to implementers under the SHA-grounding rule; this artifact does not draft changelog prose.
