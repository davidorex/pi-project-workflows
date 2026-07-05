---
name: release
description: Cut a release of the pi-project-workflows monorepo — lockstep version bump, CHANGELOG roll, tag, operator promote, credentialed verification, and the publish/push handoff. Use when asked to release, cut a version, bump and tag the monorepo, or prepare a publish.
argument-hint: [patch|minor|major]
disable-model-invocation: true
---

<objective>
Run the monorepo's release process end-to-end up to the human-only publish/push handoff. Releases are HELD by standing policy: never start this process without the user's explicit per-release authorization in this conversation, and never run the publish or push steps yourself.
</objective>

<quick_start>
`$0` is the bump type (`patch` for fixes, `minor` for new features/structural changes, `major` for breaking). Steps in order, none skipped:

1. **Confirm authorization + preconditions.** Explicit user authorization for THIS release exists in the conversation. Working tree clean (`git status --porcelain` empty), on `main`. Review what ships: `git log --oneline <last-tag>..HEAD` and each package's `## [Unreleased]`.
2. **Cut it**: `npm run release:$0` — one command does all of: gate chain (check, test, changelog-coverage, parity, config-schema), lockstep bump across the seven packages, `[Unreleased]` → `[<version>] - <date>` roll with a fresh `[Unreleased]` re-seeded, release commit + `v<version>` tag, and (final step, since v0.32.0) the operator CLI promote — on success the global `pi-context` equals the released version. A promote failure at the tail does NOT un-release; the script names `npm run promote:cli` as the remedy and exits non-zero.
3. **Credentialed verification — arc-completion releases only** (new public surface shipped): execute the newest dated protocol in `docs/reports/` (currently `pi-internal-verification-protocol-2026-07-05.md`) — runtime + auth check, extension-source check, read/write/workflow dispatch through the real `pi` runtime, monitors observed. Append the executed record to that doc (or write a new dated successor if the surface moved). Routine bumps skip this — the step-2 gate chain covers them. The repo's `/run-pi-project-workflows` driver covers most of the protocol mechanically.
4. **Hand off — human-only, never run these yourself**:
   ```
   npm publish --workspaces --access public    # requires npm login + OTP
   git push origin main && git push origin v<version>
   ```
   Report the tag and stop. Publish and push are the user's actions.
</quick_start>

<success_criteria>
- The release script exited 0: version bumped, CHANGELOGs rolled, commit + tag present, operator promoted to the released version (`pi-context --version`).
- For arc-completion releases: the protocol's executed record shows PASS and is saved in `docs/reports/`.
- The publish/push commands were REPORTED, not executed.
</success_criteria>

<gotchas>
- `check-changelog` requires each published-surface commit to GROW a `[Unreleased]` list; the pre-stamp coverage check in the release script fails a package with surface commits and an empty section — record the change first, never `--no-verify`.
- The citation-rot gate forbids substrate ids (FGAP-NNN/TASK-NNN) in CHANGELOG text — reword, don't cite.
- The release script refuses a dirty tree; commit or stash first.
- `docs/` is gitignored — protocol records are on-disk-only by policy; CLAUDE.md step 12 points at the newest dated protocol.
</gotchas>
