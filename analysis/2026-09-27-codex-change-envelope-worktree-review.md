# Review: Codex `change-envelope` worktree (uncommitted experiment-isolation guard)

Date of review: 2026-09-27. Machine offset at review time: `+0700` (`date +%z`). All Codex log timestamps below are converted from UTC to `+0700`.

Subject: `/Users/david/Projects/workflowsPiExtension/.worktrees/change-envelope`, branch `codex/change-envelope-prototype`, HEAD `ed8ef376` (same commit as the main checkout's `codex/july-26`; worktree was created from `main`, also `ed8ef376`). No commits of its own. Review was read-only; nothing in the repo or worktree was changed except this file.

## 1. What the work does

### 1.1 Full diff (tracked files)

```diff
diff --git a/.husky/post-commit b/.husky/post-commit
index 1930522a..ea0f36ff 100755
--- a/.husky/post-commit
+++ b/.husky/post-commit
@@ -1,10 +1,5 @@
-# Refresh the globally installed @davidorex packed copies whenever a commit
-# touches packages/ — keeps the locally running pi's global install current
-# with the working tree (see scripts/promote-extensions.mjs). Commits that
-# touch no packages/ path skip silently. post-commit cannot fail the commit;
-# skip exits 0 by construction.
-if git diff-tree --no-commit-id --name-only -r HEAD | grep -q '^packages/'; then
-	npm run promote:all &&
-		echo "post-commit: refreshed the global @davidorex packed copies (promote:all)."
-fi
+# Experiment invariant: never mutate the globally installed operator or
+# extension set. The promotion programs independently refuse execution, so
+# bypassing this hook cannot reach a global write through repository tooling.
+echo "post-commit: global promotion disabled by experiment policy."
 exit 0
diff --git a/scripts/promote-cli.mjs b/scripts/promote-cli.mjs
index a21a2622..3458bc9d 100644
--- a/scripts/promote-cli.mjs
+++ b/scripts/promote-cli.mjs
@@ -75,6 +75,9 @@ import {
 import { tmpdir } from "node:os";
 import { dirname, isAbsolute, join, resolve, sep } from "node:path";
 import { fileURLToPath } from "node:url";
+import { denyGlobalMutation } from "./experiment-policy.mjs";
+
+denyGlobalMutation("operator CLI promotion");
 
 const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
 // Realpath of the repo root (REPO_ROOT always exists) so containment checks
diff --git a/scripts/promote-extensions.mjs b/scripts/promote-extensions.mjs
index 4061d1f6..b4bcda48 100644
--- a/scripts/promote-extensions.mjs
+++ b/scripts/promote-extensions.mjs
@@ -60,6 +60,9 @@ import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpath
 import { tmpdir } from "node:os";
 import { dirname, isAbsolute, join, resolve, sep } from "node:path";
 import { fileURLToPath } from "node:url";
+import { denyGlobalMutation } from "./experiment-policy.mjs";
+
+denyGlobalMutation("extension-set promotion");
 
 const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
 // Realpath of the repo root (REPO_ROOT always exists) so containment checks
diff --git a/scripts/release.mjs b/scripts/release.mjs
index 11f59c6a..6f7b8da2 100644
--- a/scripts/release.mjs
+++ b/scripts/release.mjs
@@ -23,6 +23,9 @@ import { execSync } from "node:child_process";
 import { existsSync, readFileSync, writeFileSync } from "node:fs";
 import { join } from "node:path";
 import { cleanGitEnv } from "@davidorex/pi-context/git-env";
+import { denyGlobalMutation } from "./experiment-policy.mjs";
+
+denyGlobalMutation("release");
 
 // The seven lockstep packages. release.mjs and check-changelog.ts both require
 // an exhaustive enumeration so a future package can never be silently skipped.
```

### 1.2 New file: `.experiment-policy.json` (mtime 2026-07-26 09:20:28 +0700)

```json
{
	"schema_version": 1,
	"experiment": "change-envelope-prototype",
	"global_promotion": "forbidden",
	"release": "forbidden",
	"reason": "This worktree is isolated from the operator's globally installed Pi packages."
}
```

### 1.3 New file: `scripts/experiment-policy.mjs` (mtime 2026-07-26 09:20:28 +0700)

```js
#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const policyPath = resolve(repoRoot, ".experiment-policy.json");
const policy = JSON.parse(readFileSync(policyPath, "utf8"));

export function denyGlobalMutation(action) {
	console.error(`Blocked by ${policy.experiment} policy: ${action} is forbidden in this isolated worktree.`);
	console.error(`Policy: ${policyPath}`);
	process.exit(78);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	denyGlobalMutation(process.argv.slice(2).join(" ") || "global mutation");
}
```

### 1.4 New file: `scripts/experiment-policy.test.ts` (mtime 2026-07-26 09:20:52 +0700)

```ts
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

for (const [name, args] of [
	["extension-set promotion", ["scripts/promote-extensions.mjs"]],
	["operator CLI promotion", ["scripts/promote-cli.mjs"]],
	["release", ["scripts/release.mjs", "patch"]],
] as const) {
	test(`experiment policy blocks ${name} before it can run`, () => {
		const result = spawnSync(process.execPath, args, {
			cwd: process.cwd(),
			encoding: "utf8",
		});

		assert.equal(result.status, 78);
		assert.match(result.stderr, /Blocked by change-envelope-prototype policy/);
	});
}
```

### 1.5 Outside the worktree: one change Codex made to shared git metadata

Codex also appended `.worktrees/` to `/Users/david/Projects/workflowsPiExtension/.git/info/exclude` (apply_patch at 09:21:44 +0700; file mtime 09:21:49 +0700) so the main checkout's `git status` would not list the nested worktree. Not tracked, not in the diff above. Current file tail:

```
.claude/worktrees/
.worktrees/
.repo-notes/
```

### 1.6 Plain-language behavior, file by file

- `scripts/experiment-policy.mjs` exports `denyGlobalMutation(action)`, which prints `Blocked by change-envelope-prototype policy: <action> is forbidden in this isolated worktree.` to stderr and exits with code 78. It is **unconditional**: it never reads the policy's `global_promotion` or `release` fields. The JSON file is read only for the `experiment` name in the message; if the JSON were missing, the import itself would throw (still blocking, with a crash instead of exit 78).
- `scripts/promote-cli.mjs`, `scripts/promote-extensions.mjs`, `scripts/release.mjs` each call `denyGlobalMutation(...)` as the first top-level statement after their imports. Every run of `npm run promote:cli`, `npm run promote:all`, `npm run release:*` (after its `npm run build`), or the direct `node scripts/...` form exits 78 before any of the script's own logic runs. That includes promotes to a throwaway `--prefix` / `PROMOTE_PREFIX` dir, which do not touch the global install, and the version bump / CHANGELOG / commit / tag part of release, which is not global either.
- `.husky/post-commit` has its conditional `npm run promote:all` replaced with a fixed message and `exit 0`.
- `.experiment-policy.json` is described as the configuration, but in practice it does not control anything: changing `"global_promotion"` to anything else changes nothing. The guard is the hard-coded call in each script.
- `scripts/experiment-policy.test.ts` spawns each of the three real scripts and asserts exit 78 + the message.

How the pieces connect: the JSON gives the message a name → `experiment-policy.mjs` is imported by the three scripts → they exit before doing anything → the hook edit removes the automatic call → the test checks the three exits.

Verified hook topology (this matters): the shared repo config sets `core.hooksPath=/Users/david/Projects/workflowsPiExtension/.husky/_` (absolute, from `.git/config`, and the worktree resolves the same value). Husky's launcher `.husky/_/h` runs `$(dirname "$(dirname "$0")")/<hook>`, meaning **main's** `.husky/<hook>`. So a commit made inside the worktree runs main's `pre-commit` and main's (unmodified) `post-commit`, not the worktree's edited `post-commit`. The worktree's hook edit therefore has no effect in the worktree. What actually blocks auto-promotion there: main's hook runs `npm run promote:all` with the worktree as cwd, which runs the worktree's guarded `promote-extensions.mjs` (exits 78, and the hook discards that). Codex ran `git config --get core.hooksPath` at 09:19:07 but still reported "The experimental post-commit hook never invokes promotion", which is true of the file and not of what runs.

## 2. Is it finished?

Observed checks (run from the worktree; the only things they write are temp/IPC files):

- `node --check` passes on all four `.mjs` files. `sh -n .husky/post-commit` passes.
- `biome check` (main's binary, run from the worktree) on the five changed/new script/JSON files: `Checked 5 files … No fixes applied.` exit 0.
- `node --test scripts/experiment-policy.test.ts` (Node v26.7.0): 3/3 pass, exit 0. Worktree `git status` was unchanged afterwards. Before running it I confirmed that in all three scripts the guard is the first top-level statement after the imports, so no script body could run. `release.mjs`'s import of `@davidorex/pi-context/git-env` resolved through the **parent** checkout's `node_modules` (the worktree has none), so the test got 78 and not a module-not-found exit.
- `node scripts/experiment-policy.mjs "manual probe"` exits 78 with the expected message.
- The test is picked up by `npm test` through the root `test:migration` glob `scripts/*.test.ts` (same in worktree and main `package.json`, which are identical). `tsconfig.json` excludes `**/*.test.ts`. `biome.json` includes `scripts/**`.

For its narrow purpose (blocking promotion from this worktree through repo tooling), it works. Open issues and incomplete wiring:

- There are no TODOs or stubs. The "configuration" is decorative, though: `global_promotion` / `release` are never read, and `schema_version` has no consumer.
- It over-blocks. Throwaway-prefix promotes (`--prefix`, `PROMOTE_PREFIX`) are refused, even though they never touch the global install. `.claude/skills/run-pi-project-workflows/driver.mjs:75` runs `npm run promote:cli` with `PROMOTE_PREFIX` set to a throwaway dir, so that skill's driver cannot run in the worktree. Release is refused in full, not only its promote tail.
- The hook edit does nothing, because of the absolute `core.hooksPath` (§1.6).
- The test design is hazardous. It launches the real promote and release scripts and relies on the guard to stop them. If the guard were ever removed or broken, `npm test` would do a real global `npm i -g` and a real version bump + commit + tag. It also depends on `process.cwd()` being the repo root.
- The "change envelope" itself does not exist. There is no envelope schema, no evidence records, no plan digest, no approval binding, no journal. The worktree holds only the isolation scaffolding Codex said was the first step. Codex's own list of remaining isolation steps (its 09:33:34 message) was not done: own `node_modules`, a worktree-local npm prefix, separate pi config/state, worktree-specific hooks, moving the worktree outside the parent dir.
- There is no commit, no CHANGELOG entry, and no substrate filing.

## 3. What it was for (provenance)

Source: Codex Desktop session `019f9bfd-499a-7d10-bbe5-69023326259a`, cwd `/Users/david/Projects/workflowsPiExtension`, file `~/.codex/sessions/2026/07/26/rollout-2026-07-26T09-14-55-019f9bfd-499a-7d10-bbe5-69023326259a.jsonl`. It started 2026-07-26 08:14:55 +0700; the rollout filename's clock reads one hour ahead, i.e. `+0800`. A second file, `rollout-2026-07-26T10-19-15-019f9c38-…jsonl`, is a Codex "guardian" approval subagent of the same session. It returned `allow` for the escalated actions, including the `.git/info/exclude` edit ("narrow, reversible local Git metadata change"). `~/.codex/history.jsonl` holds no entries for this session. No other Codex session file mentions `change-envelope`, `experiment-policy`, or `.worktrees`.

### 3.1 User's own words, verbatim (all 2026-07-26, +0700)

- 08:15:03: "tell me the status of this project"
- 08:17:59: "use claude-history cli -- BUT NEVER RUN SYNC -- to determine exact current and recent focus of the project."
- 08:26:04: "help me articulate the class of development problems we face as evidenced in the record. cleanly articulated the development problems we face is a precursor to narrowing toward actionable durable solutions in policy and tooling."
- 08:28:12: "certainly mine is not the only instance of this problem. now we research how this has been solved reliably and durably well by others."
- 08:31:43: "to what extent does the existing monorepo here -- including the incorporation of recorded facts in claude-history -- contain or not contain the necessary precursors and functionality for that durable direction. that's a way of evaluating the status of this monorepo project."
- 08:43:56: "you are currently in a checked out branch, correct? if correct, how might we work such that we have a wholly separated version in that branch to try to accomplish what you've outlined."
- **09:18:42 (the request that produced this work):** "yes this first: create the isolated worktree and experimental branch, leave the current untracked files untouched, add an experiment-local configuration that prevents global promotion. and ensure global promotion is impossible."
- 09:32:14: "what does the mean and imply: It cannot prevent someone from independently issuing an unrelated system-level npm install -g command outside the repository."
- 09:33:06: "is there anything in normal work in main branch that would impact here"

### 3.2 What Codex proposed, as distinct from what the user said

- The "Change Envelope" concept is Codex's (08:36:40). It described "a content-addressed Change Envelope—probably an evolution of the existing work-order record" binding intent evidence (including imported claude-history facts), desired outcome, allowed scope, a plan and expected diff, policy decisions, exact human approval, an append-only journal, check receipts, and the resulting commit hash. It grew out of Codex's 08:30:06 research answer (Terraform saved plans, Flyway checksums, in-toto, OPA, Temporal, protected branches, attestations).
- At 08:44:22 Codex proposed the worktree (at first at a sibling path, `/Users/david/Projects/workflowsPiExtension-change-envelope`) and said the post-commit promotion should be disabled or redirected. It ended with: "My recommendation is: create the isolated worktree and experimental branch, leave the current untracked files untouched, add an experiment-local configuration that prevents global promotion, and perform the first Change Envelope vertical slice there."
- The user's 09:18:42 message repeats Codex's recommendation almost word for word. It prefixes "yes this first:", drops "perform the first Change Envelope vertical slice there", and adds "and ensure global promotion is impossible." The user's own contributions are the ordering ("this first") and the "impossible" requirement.
- The following were Codex's choices, not asked for by the user:
  - blocking `release` entirely ("release scripts that can invoke promotion", 09:19:14);
  - placing the worktree inside the repo at `.worktrees/` ("under the writable project boundary", which is a Codex sandbox constraint);
  - the `codex/` branch prefix;
  - exit code 78;
  - the `.git/info/exclude` edit.
- Codex's closing claim (09:22:10) was "Global promotion is blocked through every repository entry point".

### 3.3 Claude Code history

- `claude-history search "experiment-policy"`: every hit is from this review session (`089487bd`, today). None are earlier.
- `change-envelope`, `"change envelope"`, `"experiment policy"`, `denyGlobalMutation`: no hits outside this review session.
- `"global promotion"`: one unrelated hit (session `008f72c5`, 2026-07-16 18:29 as displayed). It is about promoting a dispatch-skeleton fix globally, not package promotion.
- `promote AND worktree`, `"promote:all" AND worktree`, `post-commit AND worktree AND promote`: no hits outside this session.
- Conclusion: there is no Claude Code discussion of this idea.

## 4. Does main or the substrate already cover it?

Main checkout: main's `scripts/promote-cli.mjs`, `scripts/promote-extensions.mjs`, `scripts/release.mjs`, `.husky/post-commit` and `package.json` equal the worktree's HEAD versions; main's working tree only has untracked/staged `analysis/` files. Main has **no** experiment/worktree gating.
- Main's promote scripts do offer a non-global mode (`--prefix`, `--prefix=`, `PROMOTE_PREFIX`).
- They also have a containment guard that refuses a *target prefix* resolving into the repo.
- Neither checks which *source* checkout is being promoted. From main's code alone, `npm run promote:all` run inside any linked worktree would install that worktree's code as the global operator/extension set. So the underlying hazard is real and main does not cover it.

Active substrate: `.pi-context.json` → `contextDir: ".context"`. Searched via `pi-context filter-block-items` with `matches`:

- `tasks.title` for `[Ee]xperiment|[Ee]nvelope|[Pp]romot|[Ww]orktree|[Ii]solat`: no rows (tasks carry no title). `tasks.description` for `[Ee]xperiment[- ]?[Pp]olicy|[Cc]hange[- ][Ee]nvelope|[Ww]orktree|[Gg]lobal promot|promote:all|promote:cli|promote-cli|promote-extensions` matched only:
  - TASK-069 (completed): "Make the operator pi-context binary a publish-free local copy of the working tree, immune to dev builds …" (built `promote:cli`)
  - TASK-083 (completed): "scripts/release.mjs ends by running the operator promote step … after the tag …"
- `framework-gaps.title` and `.description` (same patterns) matched only:
  - FGAP-118 (closed, P2): "release:* bumps versions but never re-promotes — the globally-installed operator CLI silently lags the tree after every release" (closed by TASK-083 / VER-071)
- `decisions.context` (same pattern): no rows.
- `decisions.title`, `features.title`, `features.description`: no rows.
- `issues.title` matched issue-006, 007, 008, 009, all promote-cli target-prefix safety issues (poisonable prefix, realpath validation, `--prefix=` form, verify guard). None is about worktree or source gating.
- `framework-gaps.description` for broader change-envelope concepts (`[Pp]lan digest|[Aa]pproval (object|bound|binding)|filesystem scope|allowed_files.*enforc|isolated (worktree|checkout)|global (install|prefix)`): no rows.

Result: nothing in the substrate tracks an experiment policy, worktree isolation, or gating promotion by source checkout, and nothing tracks the Change Envelope concept. The matches found are the items that *built* the auto-promote/release-promote behavior this worktree disables, so they run in the opposite direction.

## 5. Risks of incorporating it

- **Merged as-is, it disables promote and release for everyone.** The guard is unconditional and lives in tracked scripts. It does not detect that it is running in a worktree, and it does not read the policy fields. On main, `promote:all`, `promote:cli`, `release:*` and the throwaway-prefix test mode would all exit 78, and the committed `.husky/post-commit` would stop auto-promotion.
- **That directly contradicts current binding surfaces:**
  - CLAUDE.md ("automatic on any commit touching `packages/` via the `.husky/post-commit` hook"; "a `release:*` run promotes automatically as its final step"; Completion Sequence step 2);
  - the memory rule that the locally running pi always reflects the working tree via `promote:all`;
  - the standing directive quoted in commit `a7e141cf` ("the locally running pi must always reflect the code on this machine");
  - TASK-083 / FGAP-118's closed release-promote behavior;
  - `README.md` and `packages/pi-context-cli/README.md` promote/release text.
- **The test is a hazard on any branch.** Its safety depends on the guard it tests. Remove or break the guard and `npm test` performs a real global install and a real release commit + tag.
- **It over-blocks.** It kills throwaway-prefix promotes, which the `run-pi-project-workflows` skill driver depends on, and all of release, not only its promote step.
- **Parts of it are ineffective.** The hook edit never runs, given the absolute `core.hooksPath` into main's `.husky/_`.
- **Shared-state coupling that Codex itself identified (09:33:34) is still there:**
  - the nested worktree resolves `@davidorex/*` and tools from the **parent** checkout's `node_modules`, which symlink to main's `packages/*`, so the worktree runs main's built `dist/` for cross-package imports;
  - main's hooks run for worktree commits;
  - the global pi/pi-context stay shared, and main's post-commit keeps re-promoting them.
- **Codex-specific or Codex-motivated parts** (the user does not want anything that exists only for Codex):
  - the `codex/` branch prefix;
  - the in-repo `.worktrees/` location, chosen for Codex's writable-sandbox boundary;
  - the `.worktrees/` line in `.git/info/exclude`;
  - the experiment name `change-envelope-prototype`, hard-coded in the policy JSON and the test regex;
  - the whole `.experiment-policy.json` / `denyGlobalMutation` mechanism as written, which exists only to fence this one Codex experiment.
  - The code has no Codex tooling calls, paths, or API dependencies. It is plain Node.
- **A general, tool-agnostic version of the underlying concern is real and not covered by main:** refusing *real-global* promotion when the source checkout is a linked worktree or not the primary checkout, while still allowing `--prefix` / `PROMOTE_PREFIX`. That would be a different change from this one, and the substrate does not track it (§4).
