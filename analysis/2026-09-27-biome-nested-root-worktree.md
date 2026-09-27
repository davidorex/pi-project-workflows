# Biome "nested root configuration" failure at pre-commit — `.worktrees/change-envelope`

Date: 2026-09-27 (machine offset `+0700`). Investigation only. Nothing in the repo was changed except this file. All scratch tests ran in the session scratchpad (`/private/tmp/claude-501/-Users-david-Projects-workflowsPiExtension/089487bd-ae46-4ae6-a54b-74110f8099b8/scratchpad`, abbreviated `$SP`). `$B` = `/Users/david/Projects/workflowsPiExtension/node_modules/.bin/biome` (the same binary `npx @biomejs/biome` resolves to).

## Verdict

- **Root cause.** `.worktrees/` is ignored only by `.git/info/exclude` (line 8). Biome 2.4.9's `vcs.useIgnoreFile: true` reads the root `.gitignore`, not `.git/info/exclude` (scratch T2 reproduces the error; T3, with the same entry in `.gitignore`, passes). The positive `files.includes` list does not stop biome's scanner from walking into `.worktrees/change-envelope/` and finding its `biome.json`. That `biome.json` is a full copy of the root config with no `"root": false`, so biome treats it as a second root and exits 1.
- **Why earlier commits passed.** The worktree was created 2026-07-26 09:19 (+0700), which git recorded as 10:19 +0800. The last commit in the repo (`ed8ef376`) was made 2026-07-25 12:28 +0800, before that. The reflog shows no commit since, so today's attempt is the first commit with the worktree on disk. `.gitignore` and `biome.json` have not changed since 2026-07-19 and 2026-04-25.
- **Class.** This is not a one-off. Biome 2.4.9 skips a nested root config only when the directory is excluded by a `files.includes` negation or by the root `.gitignore`. A git-level ignore it does not read (`.git/info/exclude`, `core.excludesFile`, and also a `.ignore` file) does not protect it. Every git worktree inside this repo carries the root `biome.json`, so any worktree placed at a path the root `.gitignore` does not cover breaks `npm run check`, and with it every commit. The CLAUDE.md statement describes the one path that `.gitignore`'s `.claude/*` happens to cover as if `useIgnoreFile` handled nested worktrees in general, so it is incomplete. The same failure happened on 2026-04-25 with `.claude/worktrees/pedantic-gauss-25a989` and was fixed for that path only.
- **Prior art.** No match in the active substrate `.context` (searches are listed in section 5).
- **Fixes that worked in scratch tests:** `.worktrees/` in the root `.gitignore` (T3); `"!**/.worktrees"` (T4) or `"!!**/.worktrees"` (T5) appended to `files.includes`; the checkout moved outside the repo tree (T10).
- **Fixes that did not work:** the entry in `.git/info/exclude` (T2, the current state), in `core.excludesFile` (T9), or in a root `.ignore` (T8).
- **`"root": false` in the nested `biome.json` (T6)** stops the error, but biome then lints the other checkout's files (`.worktrees/wt/scripts/b.ts`). It would also mean editing a tracked file on the worktree branch, so it is not a fix.

---

## 1. Root cause — commands and observed output

### Root `biome.json`, `.gitignore`, `.git/info/exclude`, date

```
$ cat biome.json
{
	"$schema": "https://biomejs.dev/schemas/2.4.9/schema.json",
	"vcs": {
		"enabled": true,
		"clientKind": "git",
		"useIgnoreFile": true
	},
	"files": {
		"includes": ["packages/*/src/**", "packages/*/index.ts", "packages/*/index.test.ts", "scripts/**"]
	},
	... (formatter / linter blocks; no ignore/exclude entries)
}

$ cat .gitignore
dist/
docs/
node_modules/
.claude/*
!.claude/hooks/
!.claude/settings.json
!.claude/agents/
!.claude/commands/
!.claude/skills/
!.claude/mandates.jsonl
.claude/skills/*
!.claude/skills/audit-task-resolution/
!.claude/skills/run-pi-project-workflows/
!.claude/skills/audit-substrate-currency/
!.claude/skills/release/
.pi/
.workflow/
.workflows/
CLAUDE.md
# Project schemas (.project/schemas/) and block data (.project/*.json) are both tracked in git
.project/phases/
.project/audits/
# Test artifacts — block-validation tests may create temp dirs in package dirs
packages/*/.workflow/
packages/*/.project/
packages/*/.workflows/
# Interim working files — prompts, helper scripts, candidates, dispatch outputs
tmp/
# Compiled agent contexts + agent-written dispatch outputs (mirrors pi-jit-agents compileAgent output)
compiled-contexts/
# Session-audit outputs
projects/

$ cat .git/info/exclude
# git ls-files --others --exclude-from=.git/info/exclude
# Lines that start with '#' are comments.
# For a project mostly in C, the following would be a good set of
# exclude patterns (uncomment them if you want to use them):
# *.[oa]
# *~
.claude/worktrees/
.worktrees/
.repo-notes/

$ date; date +%z
Sun Sep 27 10:29:21 +07 2026
+0700
```

`.worktrees/` appears nowhere in `.gitignore`. It is only in `.git/info/exclude`.

### git ignore attribution, biome version, worktree list

```
$ git check-ignore -v .worktrees/change-envelope/biome.json
.git/info/exclude:8:.worktrees/	.worktrees/change-envelope/biome.json
exit=0
$ git check-ignore -v .worktrees
.git/info/exclude:8:.worktrees/	.worktrees
exit=0
$ ls -la .claude/worktrees
total 16
drwxr-xr-x   3 david  staff    96 Jul 13 16:01 .
drwxr-xr-x  11 david  staff   352 Jul 26 07:09 ..
-rw-r--r--@  1 david  staff  6148 Jun 21 03:53 .DS_Store
$ git check-ignore -v .claude/worktrees
.gitignore:4:.claude/*	.claude/worktrees
exit=0
$ npx @biomejs/biome --version
Version: 2.4.9
$ git worktree list
/Users/david/Projects/workflowsPiExtension                             ed8ef376 [codex/july-26]
/Users/david/Projects/workflowsPiExtension/.worktrees/change-envelope  ed8ef376 [codex/change-envelope-prototype]
```

Git ignores both paths, but from different sources. `.claude/worktrees` is covered by `.gitignore:4` (`.claude/*`), a file biome reads. `.worktrees` is covered by `.git/info/exclude:8`, which biome does not read (T2 below).

### Reproduction in the real repo (read-only, no `--write`)

```
$ npx @biomejs/biome check .
/Users/david/Projects/workflowsPiExtension/.worktrees/change-envelope/biome.json configuration ━━━━━━━━━━

  × Found a nested root configuration, but there's already a root configuration.

  i The other configuration was found in /Users/david/Projects/workflowsPiExtension.

  i Use the migration command from the root of the project to update the configuration.

  $ biome migrate --write


configuration ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  × Biome exited because the configuration resulted in errors. Please fix them.

exit=1
```

The only other `biome.json` in the tree outside `node_modules` is the root one:

```
$ find . -name biome.json -not -path '*/node_modules/*' -not -path './.worktrees/change-envelope/*'
./biome.json
$ find ./.worktrees/change-envelope -maxdepth 1 -name biome.json
./.worktrees/change-envelope/biome.json
```

### Scratch tests

Every fixture uses the real root `biome.json` at the root and a copy of `.worktrees/change-envelope/biome.json` at `.worktrees/wt/biome.json`. Each fixture also has `scripts/a.ts`, `.worktrees/wt/scripts/b.ts`, a fresh `git init` (no commits, nothing staged), and a root `.gitignore` containing `node_modules/`. The first attempt, with no root `.gitignore`, failed differently (`Biome couldn't find an ignore file in the following folder`), so every later fixture has one, as the real repo does.

**T2 — mirrors the real repo: `.worktrees/` only in `.git/info/exclude`**
```
$ git -C $SP/t2 check-ignore -v .worktrees/wt/biome.json
.git/info/exclude:7:.worktrees/	.worktrees/wt/biome.json
$ (cd $SP/t2 && $B check .)
$SP/t2/.worktrees/wt/biome.json configuration ━━━━━━━━━━
  × Found a nested root configuration, but there's already a root configuration.
  i The other configuration was found in $SP/t2.
  ...
  × Biome exited because the configuration resulted in errors. Please fix them.
exit=1
```

**T3 — `.worktrees/` in root `.gitignore`**
```
$ git -C $SP/t3 check-ignore -v .worktrees/wt/biome.json
.gitignore:2:.worktrees/	.worktrees/wt/biome.json
$ (cd $SP/t3 && $B check .)
Checked 2 files in 19ms. No fixes applied.
exit=0
$ (cd $SP/t3 && $B check . --verbose)   # file list
  - scripts/a.ts
Checked 2 files in 938µs. No fixes applied.
```
The `.gitignore` entry works while uncommitted and unstaged, because biome reads the file from disk.

**T4 — `"!**/.worktrees"` appended to `files.includes`** (`.worktrees/` only in info/exclude)
- The first run flagged only a formatter diff on my rewritten `biome.json`; there was no nested-root error.
- After `biome format --write biome.json`, only in scratch:
```
9:		"includes": ["packages/*/src/**", "packages/*/index.ts", "packages/*/index.test.ts", "scripts/**", "!**/.worktrees"]
Checked 2 files in 1269µs. No fixes applied.
exit=0
  - scripts/a.ts
```

**T5 — `"!!**/.worktrees"` (force-ignore) appended to `files.includes`**
```
14:			"!!**/.worktrees"
Checked 2 files in 1306µs. No fixes applied.
exit=0
  - scripts/a.ts
```

**T6 — nested `biome.json` given `"root": false`** (`.worktrees/` only in info/exclude)
```
	"root": false
Checked 3 files in 1805µs. No fixes applied.
exit=0
verbose:
  - .worktrees/wt/scripts/b.ts
  - scripts/a.ts
Checked 3 files in 1076µs. No fixes applied.
```
The error is gone, but biome now lints the other checkout's files as a nested project. For this repo that also means changing the tracked `biome.json` on the worktree branch. Not a fix.

**T7 — control: nested root under `.claude/worktrees/wt/`, root `.gitignore` = `node_modules/`, `.claude/*`, `!.claude/hooks/`**
```
.gitignore:2:.claude/*	.claude/worktrees/wt/biome.json
Checked 2 files in 1289µs. No fixes applied.
exit=0
```
This confirms that the CLAUDE.md mechanism works for `.claude/worktrees`, and only because of the `.gitignore` coverage.

**T8 — `.worktrees/` in a root `.ignore` file (not `.gitignore`)**
```
$SP/t8/.worktrees/wt/biome.json configuration ━━━━━━━━━━
  × Found a nested root configuration, but there's already a root configuration.
  ...
exit=1
```

**T9 — `.worktrees/` only in `core.excludesFile`** (set in the scratch repo's local config)
```
$ git -C $SP/t9 check-ignore -v .worktrees/wt/biome.json
$SP/t9-excludes:1:.worktrees/	.worktrees/wt/biome.json
$ (cd $SP/t9 && $B check .)
$SP/t9/.worktrees/wt/biome.json configuration ━━━━━━━━━━
  × Found a nested root configuration, but there's already a root configuration.
  ...
exit=1
```
The real machine has a global excludes file too: `git config --show-origin --get core.excludesFile` returns `file:/Users/david/.gitconfig	/Users/david/.gitignore_global`. Biome does not honor it either.

**T10 — the checkout as a sibling directory outside the repo root** (`$SP/t10/repo` + `$SP/t10/repo-wt`)
```
$ (cd $SP/t10/repo && $B check .)
Checked 2 files in 1322µs. No fixes applied.
exit=0
```

### Mechanism, from the tests

- Biome 2.4.9 discovers nested `biome.json` files while scanning, regardless of the positive `files.includes` list (T2: the includes cover only `packages/*` and `scripts/**`, yet the scan still reaches `.worktrees/wt/biome.json`).
- The scan is stopped by the root `.gitignore` (T3, T7) or by an includes negation, `!` or `!!` (T4, T5).
- It is not stopped by `.git/info/exclude` (T2), `core.excludesFile` (T9), or `.ignore` (T8).
- The nested `biome.json` is a verbatim copy of the root config (same branch commit `ed8ef376`) with no `"root": false`, so biome classifies it as a second root and errors.

## 2. What `.worktrees/change-envelope` is

```
$ ls -la .worktrees
drwxr-xr-x@  3 david  staff    96 Jul 26 09:19 .
drwxr-xr-x@ 28 david  staff   896 Jul 26 09:20 change-envelope
$ stat -f '%SB birth | %Sm mod | %N' .worktrees .worktrees/change-envelope
Jul 26 09:19:22 2026 birth | Jul 26 09:19:22 2026 mod | .worktrees
Jul 26 09:19:22 2026 birth | Jul 26 09:20:28 2026 mod | .worktrees/change-envelope
$ cat .git/worktrees/change-envelope/HEAD
ref: refs/heads/codex/change-envelope-prototype
$ stat -f '%SB birth | %N' .git/worktrees/change-envelope
Jul 26 09:19:22 2026 birth | .git/worktrees/change-envelope
$ git log -1 --format='%H %ci %s' codex/change-envelope-prototype
ed8ef376c69840cb60697cdf40b130c618bbd30e 2026-07-25 12:28:36 +0800 analysis: rebuild the product-intent corpus as a source-verified record; drop the superseded markdown
$ git reflog show codex/change-envelope-prototype --date=iso
ed8ef376 codex/change-envelope-prototype@{2026-07-26 10:19:22 +0800}: branch: Created from main
$ git -C .worktrees/change-envelope status --short
 M .husky/post-commit
 M scripts/promote-cli.mjs
 M scripts/promote-extensions.mjs
 M scripts/release.mjs
?? .experiment-policy.json
?? scripts/experiment-policy.mjs
?? scripts/experiment-policy.test.ts
$ stat -f '%SB birth | %Sm mod | %N' .git/info/exclude
Jul 18 18:05:11 2026 birth | Jul 26 09:21:49 2026 mod | .git/info/exclude
```

- **What it is.** A linked git worktree on branch `codex/change-envelope-prototype`, created from `main` at `ed8ef376`. The branch has no commits of its own. The worktree holds uncommitted edits: a promotion-block experiment policy (`.experiment-policy.json`, `scripts/experiment-policy.*`) and edits to the husky post-commit hook and the promote/release scripts.
- **When it was created.** 2026-07-26 09:19:22 +0700 (file birth time; the reflog records the same instant as 10:19:22 +0800).

**Who or what created it.** No repo tooling creates `.worktrees/`:
```
$ grep -rn "\.worktrees" scripts package.json .husky .claude/hooks .claude/skills .claude/agents .claude/commands .claude/settings.json CLAUDE.md packages/*/src packages/*/skills
(no output)
$ grep -rn "worktree" scripts package.json .husky
(no output)
```

It was created by a **Codex Desktop** session (OpenAI Codex, `cli_version 0.145.0-alpha.18`), not by Claude Code:
```
$ grep -rln "change-envelope" ~/.codex
~/.codex/sessions/2026/07/26/rollout-2026-07-26T10-19-15-019f9c38-2fed-72d0-9518-3aa6f9867437.jsonl   (guardian subagent that judged the action)
~/.codex/sessions/2026/07/26/rollout-2026-07-26T09-14-55-019f9bfd-499a-7d10-bbe5-69023326259a.jsonl   (parent user session, source "vscode")
```

Key events in the parent session `019f9bfd-499a-7d10-bbe5-69023326259a`. Stored timestamps are UTC; local times use +0700.

| UTC | Local (+0700) | Event |
|---|---|---|
| 01:43:56Z | 08:43:56 | User asks how to get "a wholly separated version in that branch". |
| 01:44:22Z | 08:44:22 | Codex proposes a sibling path: `git worktree add -b codex/change-envelope-prototype /Users/david/Projects/workflowsPiExtension-change-envelope main`. |
| 02:18:42Z | 09:18:42 | User message: "yes this first: create the isolated worktree and experimental branch, leave the current untracked files untouched, add an experiment-local configuration that prevents global promotion. and ensure global promotion is impossible." |
| 02:19:15Z | 09:19:15 | Codex runs `git worktree add -b codex/change-envelope-prototype /Users/david/Projects/workflowsPiExtension/.worktrees/change-envelope main`. This is an in-repo path, not the sibling path it had proposed. |
| 02:21:38Z | 09:21:38 | Codex message: "because the linked checkout lives beneath the project boundary, the baseline currently sees the `.worktrees/` container as untracked. I'm excluding only that container in repository-local Git metadata so the baseline returns exactly to its prior two-file status". |
| 02:21:44Z | 09:21:44 | Codex runs `apply_patch` on `.git/info/exclude`, adding `.worktrees/` after `.claude/worktrees/`. This matches the exclude file's mod time of 09:21:49 local. |

So the ignore Codex added was chosen to keep `git status` clean. It is a git-only ignore that biome does not read.

**claude-history.** The CLI displays times already converted to local.
```
$ claude-history search '"change-envelope"' --limit 20
10 result(s) — all in session 089487bd (this investigation, 2026-09-27 10:28–10:29 local). No earlier Claude Code session touches change-envelope.
$ claude-history search '"nested root configuration"' --limit 20
6 result(s): 5 in session 089487bd (this investigation), plus
214961af | 2026-04-25 09:17:58 | user | tool_result
  "> check\n> npx @biomejs/biome check . && tsc --noEmit\n\n/Users/david/Projects/workflowsPiExtension/.claude/worktrees/pedantic-gauss-25a989/biome.json configuration ━━━━━━━━━━\n\n  × Found a >>>nested root configuration<<<, but...
```
Claude Code has no record of creating `.worktrees/`, which is consistent with Codex being the creator. The 2026-04-25 hit is the earlier instance of the same failure (section 4).

## 3. Why earlier commits did not fail

```
$ git log --all -8 --format='%h %ci %D %s'
ed8ef376 2026-07-25 12:28:36 +0800 HEAD -> codex/july-26, main, codex/change-envelope-prototype analysis: rebuild the product-intent corpus ...
a7e141cf 2026-07-24 13:55:40 +0800 origin/main, origin/HEAD tooling: promote:all keeps every globally installed packed copy current ...
...
$ git reflog --date=iso   (top)
ed8ef376 HEAD@{2026-07-26 09:14:41 +0800}: checkout: moving from main to codex/july-26
ed8ef376 HEAD@{2026-07-25 21:20:14 +0800}: reset: moving to HEAD
ed8ef376 HEAD@{2026-07-25 12:28:36 +0800}: commit: analysis: rebuild the product-intent corpus ...
$ git log --format='%h %ci %s' -- .gitignore biome.json   (top)
258aeac0 2026-07-19 12:47:16 +0800 gitignore: exclude the session-audit output directory projects/
...
11a40694 2026-04-25 10:21:17 +0800 chore(deps): bump pi-mono ...   (added vcs.useIgnoreFile to biome.json)
```

- The newest commit in any ref, `ed8ef376`, was made 2026-07-25 12:28 +0800. That is about 22 hours before the worktree was created (2026-07-26 10:19 +0800).
- No commit has been made in the main checkout since, so the pre-commit hook has not run with `.worktrees/change-envelope` present until now.
- Neither `.gitignore` (last changed 2026-07-19) nor `biome.json` (last changed 2026-04-25) changed in that window. The trigger is the new directory, not a config regression.

## 4. Class

This is an instance of a general class, not an atomic defect.

**The class.** Biome 2.4.9 skips a nested root `biome.json` found during its scan only if one of these excludes the directory:
- a `files.includes` negation (`!` or `!!`), or
- the root `.gitignore`, read via `vcs.useIgnoreFile`.

These do not exclude it: `.git/info/exclude` (T2), `core.excludesFile` (T9), a `.ignore` file (T8), and the positive-only `files.includes` list (T2).

**Why it breaks every commit here:**
- Every checkout of this repo, including every linked git worktree, carries the root-level `biome.json` without `"root": false`.
- So any in-tree worktree, or any in-tree copy of the repo, at a path the root `.gitignore` does not cover makes `biome check .` exit 1.
- The pre-commit hook runs that check, so every commit in the main checkout fails.

**The class is broader than Codex's `.worktrees/`.** Different agents choose different in-repo locations:
- Claude Code uses `.claude/worktrees/`, which `.gitignore` covers.
- Codex used `.worktrees/`, which only `.git/info/exclude` covers.
- Other tools may pick other directory names.

A git-level ignore added so that `git status` stays clean does not reach biome.

**Evidence of recurrence.**
- 2026-04-25: `.claude/worktrees/pedantic-gauss-25a989/biome.json` (claude-history session `214961af`). Commit `11a40694` fixed it by adding `vcs.useIgnoreFile: true`. Its message says: "The vcs flag tells biome to consult .gitignore (which already excludes .claude/)".
- That fix worked only because `.gitignore` already covered `.claude/`. It was never generalized.
- The project CLAUDE.md sentence "`biome.json` declares `vcs.useIgnoreFile: true` so nested `.claude/worktrees/*` configs don't trigger nested-root errors" is accurate for that one path (T7). As a description of worktree safety in general it is incomplete: it holds only where `.gitignore` covers the path.

**A secondary facet of the same class (T6).** If a nested config is non-root, or later becomes non-root, biome treats it as a nested project and lints the other checkout's files. Silencing the error by marking configs non-root would widen `npm run check` to foreign checkouts.

## 5. Prior art in the active substrate

```
$ cat .pi-context.json
{ "contextDir": ".context", "version": "1.1.0", ..., "previous_contextDir": ".context-jit-spec-v2", ... }
```

Active substrate: `.context`. Field names were confirmed with `read-schema`:
- framework-gaps: `id,title,status,package,description,evidence,impact,proposed_resolution,...`
- issues: `id,title,body,location,status,category,priority,package`
- tasks: `id,description,status`
- decisions: `id,title,status,context,decision,consequences,...`

Searches, all `pi-context filter-block-items --op matches`, as block / field / pattern → result:
- `framework-gaps` / `description` / `[Bb]iome|[Ww]orktree` → (no rows)
- `framework-gaps` / `title` / `[Bb]iome|[Ww]orktree|nested` → FGAP-100 (a sub-element of a substrate item has no identity) and FGAP-123 (authoring-time shape projections flatten nested item shapes). Both match on "nested" in an unrelated sense. Not relevant.
- `framework-gaps` / `evidence` / `[Bb]iome|[Ww]orktree` → (no rows)
- `framework-gaps` / `proposed_resolution` / `[Bb]iome|[Ww]orktree` → FGAP-119 (a failing message-less assert under the tsx test loader spins node:assert's message reconstruction; status `identified`). It matches only on "biome/lint rule" as a possible enforcement for asserts. Not relevant.
- `issues` / `title` and `body` / `[Bb]iome|[Ww]orktree` → (no rows)
- `tasks` / `description` / `[Bb]iome|[Ww]orktree` → (no rows)
- `decisions` / `title` and `decision` / `[Bb]iome|[Ww]orktree` → (no rows)
- `conventions` / `description` / `[Bb]iome|[Ww]orktree` → (no rows)
- `research` / `title` / `[Bb]iome|[Ww]orktree` → (no rows)

Sanity check that the op works: `filter-block-items --block framework-gaps --field id --op matches --value '"FGAP-089"'` returns FGAP-089 (PreToolUse enforcement hooks scope on op-shape + block-name).

The `feature-branch-workflow` convention (read in full) covers branching but says nothing about worktree placement or lint-scan exclusion.

**Result: no existing item tracks this failure or its class.** The only record is commit `11a40694`'s message and the CLAUDE.md sentence, both scoped to `.claude/worktrees`.

## 6. Fix options

| Option | Scratch test | Result |
|---|---|---|
| Add `.worktrees/` to root `.gitignore` | T3 | exit 0. Works uncommitted, because biome reads it from disk, so the commit that adds it passes its own pre-commit. Covers only this directory name. |
| Append `"!**/.worktrees"` to `files.includes` | T4 | exit 0, once `biome.json` is in biome's own format. Covers only this directory name. |
| Append `"!!**/.worktrees"` (force-ignore) to `files.includes` | T5 | exit 0. Covers only this directory name. |
| Keep `.worktrees/` in `.git/info/exclude` only (current state) | T2 | exit 1. Does not work. |
| Put `.worktrees/` in `core.excludesFile` | T9 | exit 1. Does not work. |
| Put `.worktrees/` in a root `.ignore` | T8 | exit 1. Does not work. |
| Add `"root": false` to the nested `biome.json` | T6 | exit 0, but biome then lints the worktree's files, and it requires changing a tracked file on the worktree branch. Not a fix. |
| Place worktrees outside the repo tree (sibling directory) | T10 | exit 0. Codex had proposed this path (`/Users/david/Projects/workflowsPiExtension-change-envelope`) at 01:44Z before using the in-repo path. |

Each `.gitignore` or `files.includes` entry covers one named directory. Covering the class (any in-tree worktree location, whichever agent creates it) means either an enumerated list of every known worktree container or a placement rule that keeps worktrees out of the tree. The tests establish only which mechanisms biome honors; they do not choose between these.
