# WASC operation framework — exact build sequence recovered from claude-history

Date: 2026-06-22
Source: `claude-history` SQLite (`mcp__claude-history__execute_sql`), read-only SELECT over `sessions`, `file_operations`, `tool_executions`, `messages`.
Subject project: `/Users/david/Projects/wasc-school-wide-improvement-plan` (the "other project").
Deliverable goal: the exact chronological sequence of build steps and the output file each step produced, transposable to `workflowsPiExtension`.

## What "the operation framework now running" IS (determined from claude-history, not from the port bundle)

The WASC repo has TWO distinct bodies of work in claude-history:

1. The **Django application** (`school-improvement-plans/school`, `/plans`, `/planner`, `/ai`, `/users`, `/accreditation`) — the product. NOT the operation framework.
2. The **operation / process framework** — the agent-operating apparatus that drives how work is done in the repo. This is what runs the project. It comprises, by recovered creation evidence:
   - Root operating docs: `CLAUDE.md`, `MANDATES.md`, `NORTH-STAR.md`
   - `.claude/` Claude Code surface: `hooks/`, `hooks.json`, `settings.json`, `settings.local.json`, `agents/`, `commands/`, `skills/`, `workflows/`, `specs/`
   - Per-project behavioral memory: `~/.claude/projects/-Users-david-Projects-wasc-school-wide-improvement-plan/memory/feedback-*.md`
   - The **pi-context substrate** (`.context/` — config + schemas + block JSON), the project-state system, built by the `context-migration/` decomposition pipeline
   - `bin/verify-slice.sh` + `bin/test-verify-slice.sh` — the verification-slice runner

All build sessions are in the WASC project. Primary build session is `d7310007-aef3-4e05-a651-d218d1cfd12f` (first_seen 2026-05-14), which spans nearly the whole arc; later sessions `8c933c8b` (2026-06-14), `bd501b6f` (2026-06-15), `6e98b2bc` (2026-06-20) add the auditor, the skills, and the verify-slice runner.

Sessions referenced (all `project_path = /Users/david/Projects/wasc-school-wide-improvement-plan`):
- `d7310007-aef3-4e05-a651-d218d1cfd12f` — primary arc session (first_seen 2026-05-14T22:00:21Z)
- `8c933c8b-770a-4c3b-b6b7-7be63588f244` — context-currency auditor + command (first_seen 2026-06-14T01:48:39Z)
- `bd501b6f-4d77-4c99-ab21-3b1f5e497c5a` — run-prompt-workshop / update-context / validate-context skills (first_seen 2026-06-15T09:41:48Z)
- `6e98b2bc-7540-47e7-be51-97919a8cb9f2` — verify-slice runner + NORTH-STAR (first_seen 2026-06-20T02:42:48Z)
- `79b83e54-4e21-433a-895d-8517afbcd566` — worktree `wizardly-bose-1f49b1` phase-spec authoring (2026-05-18)

Every step below cites session id + timestamp (UTC, as stored) + the op type and `tool_use_id` (or, for substrate files, the recovered creating actor). Zero NOT-FOUND.

---

## Layer A — Root operating docs

| # | When (UTC) | Op | File produced | Session | tool_use_id |
|---|---|---|---|---|---|
| A1 | 2026-05-16T00:34:35.631Z | write (create) | `CLAUDE.md` | d7310007 | toolu_01AH3MZyUtN8VUd8FmU3zFUT |
| A2 | 2026-05-17T23:56:19.210Z | write (create) | `MANDATES.md` | d7310007 | toolu_019FjUSbdSRyXUZmhqUQES6d |
| A3 | 2026-05-18T00:52:46.155Z | write (rewrite) | `CLAUDE.md` | d7310007 | toolu_014NgnP3vUT3NojPcPmBWkP1 |
| A4 | 2026-05-18T21:53:42.115Z | write (rewrite) | `CLAUDE.md` | d7310007 | toolu_01WHSwe1mRvJ6oBhi5Qb8aS4 |
| A5 | 2026-06-20T04:06:38.237Z | write (create) | `NORTH-STAR.md` | 6e98b2bc | toolu_011vkSC1sDvTnPDKoDbXhLjK |

`CLAUDE.md` was authored once (A1) then twice fully rewritten (A3, A4) as the operating model matured; many subsequent in-place `edit` ops refine it (not enumerated — they are edits, not creations). `MANDATES.md` and `NORTH-STAR.md` are single-creation.

---

## Layer B — Phase specifications (worktree `wizardly-bose-1f49b1`, 2026-05-18)

Session `79b83e54-4e21-433a-895d-8517afbcd566` authored the 17-file phase plan that drives the build pipeline. All `write` creations, in order:

| # | When (UTC) | File produced | tool_use_id |
|---|---|---|---|
| B1 | 2026-05-18T07:34:10.254Z | `phases/00-preamble.md` | toolu_01SNKNFuNSCizB6R8aSWnYT1 |
| B2 | 2026-05-18T07:35:12.816Z | `phases/phase-00-foundation.md` | toolu_019wuPt7G8TEkpb5597V4SDG |
| B3 | 2026-05-18T07:35:40.956Z | `phases/phase-01-custom-user.md` | toolu_01AacBuQYiV2b7uLcQVT4D9m |
| B4 | 2026-05-18T07:36:18.401Z | `phases/phase-02-school-app.md` | toolu_01Ndn23FvtV5cMZvXW8Xi1pS |
| B5 | 2026-05-18T07:36:35.269Z | `phases/phase-03-accreditation-app.md` | toolu_01CdP6abKBJ1NLxqyGqKQgYq |
| B6 | 2026-05-18T07:36:53.186Z | `phases/phase-04-planning-method.md` | toolu_01SKeeg2v1QdS8WMYdzfBJDu |
| B7 | 2026-05-18T07:37:35.091Z | `phases/phase-05-plans-scaffold.md` | toolu_01EusT56mpTLzRv6GL6ijyr9 |
| B8 | 2026-05-18T07:38:10.189Z | `phases/phase-06-plan-core.md` | toolu_017qmiTDsm7qa44SnGPsnLJS |
| B9 | 2026-05-18T07:38:40.053Z | `phases/phase-07-success-criterion-measurement.md` | toolu_019LtAQwe5Kduq1QhHDNjh2r |
| B10 | 2026-05-18T07:38:57.295Z | `phases/phase-08-phase-and-action-step-skeleton.md` | toolu_0176Fnq8epRBe8FmF1NEz4nd |
| B11 | 2026-05-18T07:39:31.347Z | `phases/phase-09-action-step-children.md` | toolu_01NMZnAtYWvsnsd5CvErs2zu |
| B12 | 2026-05-18T07:40:10.998Z | `phases/phase-10-outputs.md` | toolu_014VR9Svz3q81abVV1ThmFrh |
| B13 | 2026-05-18T07:40:33.897Z | `phases/phase-11-review-loop.md` | toolu_01TS82GhZw8KuAL5AWhUzsLs |
| B14 | 2026-05-18T07:40:59.426Z | `phases/phase-12-promotion-service.md` | toolu_01EVUxzznh5m7WEsefpUsQ9u |
| B15 | 2026-05-18T07:41:25.165Z | `phases/phase-13-i18n-initialization.md` | toolu_01QAkPngRwgQqyERbCzc6ZoQ |
| B16 | 2026-05-18T07:41:56.846Z | `phases/phase-14-extension-fields.md` | toolu_01MGgtN3N65LrQDGpgohLaWw |
| B17 | 2026-05-18T07:42:26.237Z | `phases/phase-15-final-validation.md` | toolu_01Ejje9wAVsXWmW4WYJjFf6E |

Phase specs 04, 12, 14 were rewritten the same day (toolu_01XK1PAKGKbaRL48WfcFjeF5 @ 10:59:16; toolu_012LNdgdAW5mabwD7s1m45pk @ 11:01:41; toolu_01TGMe9MumoBPM9BNzmvPCuW @ 11:02:05).

Stored under the worktree path `.claude/worktrees/wizardly-bose-1f49b1/phases/`; the framework's running copies are the non-worktree `phases/` equivalents.

---

## Layer C — `.claude/` Claude Code surface

### C1 — Pipeline + hooks (session d7310007)

| # | When (UTC) | Op | File produced | tool_use_id |
|---|---|---|---|---|
| C1.1 | 2026-05-29T09:50:41.179Z | write (create) | `.claude/workflows/canonical-pipeline.js` | toolu_01Ad4MjqhazuMCo5QakWNKbu |
| C1.2 | 2026-05-31T03:57:00.207Z | write (create) | `.claude/hooks/one-bash-per-turn.sh` | toolu_01Bg2s6TLNnerH5W9ZUWS5at |
| C1.3 | 2026-05-31T03:57:31.384Z | write (create) | `.claude/hooks.json` | toolu_012vVaLfynWMFqNa1rX8qn8w |
| C1.4 | 2026-05-31T03:58:11.708Z | write (rewrite) | `.claude/hooks.json` | toolu_01GAA9Xg4KAbac21gqXoZZ4D |
| C1.5 | 2026-05-31T04:23:00.234Z | write (create) | `.claude/hooks/one-bash-per-turn.js` | toolu_01A4aT6MLAFNyZk8YF4SmFmh |
| C1.6 | 2026-05-31T04:23:23.830Z | write (create) | `.claude/settings.json` | toolu_01VWXFFQoDF4sAZRf2zyjQmU |
| C1.7 | 2026-05-31T04:24:58.201Z | bash_rm | removes `.claude/hooks/one-bash-per-turn.sh` (superseded by `.js`) | — |
| C1.8 | 2026-06-05T21:30:00.896Z | write (create) | `.claude/hooks/gate-before-commit.sh` | toolu_01STdL28NniFWL5SiYawmsND |
| C1.9 | 2026-06-14T00:25:43.663Z | write (create) | `.claude/specs/verification-discipline-guardrail-hook.spec.md` | toolu_015zEhQW5HS5LTGqw9NKoMTM |

Recovered content fingerprints (creating-write `input_json` first bytes):
- `one-bash-per-turn.sh` (C1.2): `#!/bin/bash` — "PreToolUse(Bash) guard … Blocks a second Bash call fired within WINDOW_MS of the previous one".
- `one-bash-per-turn.js` (C1.5): `#!/usr/bin/env node` — "PreToolUse(Bash) guard, transcript-based … Blocks a turn that emits MORE THAN ONE Bash tool_use block." This `.js` superseded the `.sh` (C1.7 deletes the shell version).
- `hooks.json` (C1.3/C1.4): `{"hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command", …`.
- `settings.json` (C1.6): same PreToolUse/Bash hook registration shape as `hooks.json`.
- `gate-before-commit.sh` (C1.8): `#!/usr/bin/env bash` — "PreToolUse(Bash) gate: deny any `git commit` unless the full project gate passes. Gate = the CI step set: ruff check + ruff format --check + m[ypy]…".

`settings.json` later edited 2026-06-05T21:30:48.338Z (registers the gate hook). `settings.local.json` is harness-managed: its first recorded op is an `edit` at 2026-06-13T01:44:10.203Z (session d7310007) — Claude Code creates/maintains it on permission grants, so its creating actor is the harness, not an in-session Write.

### C2 — Agent + command (session 8c933c8b, 2026-06-14)

| # | When (UTC) | Op | File produced | tool_use_id |
|---|---|---|---|---|
| C2.1 | 2026-06-14T05:24:36.360Z | write (create) | `.claude/agents/context-currency-auditor.md` | toolu_01Jk2L2V3eQWGQSoyAdWkFK4 |
| C2.2 | 2026-06-14T05:25:11.617Z | write (create) | `.claude/commands/audit-context-currency.md` | toolu_01Ssjzn4ecNJL4hvuG9jWtwx |

Both refined by many same-session `edit` ops (agent edits at 05:27:56, 05:28:13, 06:12:37…; command edits at 05:44:11 through 06:17:29) — refinements, not creations. The auditor was exercised in-session producing `~/.claude/audit-results/*.md` runtime outputs (e.g. 2026-06-14T05:26:55.352Z), confirming the component ran.

### C3 — Skills (session bd501b6f, 2026-06-19)

| # | When (UTC) | Op | File produced | tool_use_id |
|---|---|---|---|---|
| C3.1 | 2026-06-19T01:07:03.751Z | write (create) | `.claude/skills/run-prompt-workshop/smoke.sh` | toolu_01YWgxzcDxneRV77gB3FQcmR |
| C3.2 | 2026-06-19T01:09:04.171Z | write (create) | `.claude/skills/run-prompt-workshop/SKILL.md` | toolu_013JGMns7koDBu8rhGMpNvuF |
| C3.3 | 2026-06-19T01:42:06.694Z | write (create) | `.claude/skills/update-context/update-context.sh` | toolu_017SreXnFJpC3BYWhfroXQXp |
| C3.4 | 2026-06-19T01:42:44.703Z | write (create) | `.claude/skills/update-context/SKILL.md` | toolu_012ThmYF42d7ibX8NVTfD8Gm |
| C3.5 | 2026-06-19T01:42:46.594Z | write (create) | `.claude/skills/validate-context/validate-context.sh` | toolu_01S4ncfQvkmegTsWsWtTTFpf |
| C3.6 | 2026-06-19T01:43:32.265Z | write (create) | `.claude/skills/validate-context/SKILL.md` | toolu_01SfdrUvshpiudPgYgqfX1yB |
| C3.7 | 2026-06-19T02:03:54.688Z | write (rewrite) | `.claude/skills/validate-context/validate-context.sh` | toolu_01NzA6xAxt7CiWVEV7iVQQ25 |

`validate-context/SKILL.md` further refined by edits at 02:06:26, 02:06:41, 02:06:54 (same session).

---

## Layer D — Behavioral memory (`feedback-*.md`)

Per-project Claude Code memory, stored at `~/.claude/projects/-Users-david-Projects-wasc-school-wide-improvement-plan/memory/`. All are `write` creations; session d7310007 except where noted. Chronological:

| # | When (UTC) | File produced | Session |
|---|---|---|---|
| D1 | 2026-05-15T11:33:06.856Z | feedback-narrow-directive-parsing.md | d7310007 |
| D2 | 2026-05-17T08:52:33.151Z | feedback-no-meta-commentary.md | d7310007 |
| D3 | 2026-05-18T04:45:33.844Z | feedback-no-awaiting-direction.md | d7310007 |
| D4 | 2026-05-18T04:47:22.797Z | feedback-honor-literal-commands.md | d7310007 |
| D5 | 2026-05-18T06:02:12.366Z | feedback-plain-diction.md | d7310007 |
| D6 | 2026-05-18T06:03:49.198Z | feedback-prompts-as-complete-directives.md | d7310007 |
| D7 | 2026-05-18T06:21:56.786Z | feedback-positive-statements-only.md | d7310007 |
| D8 | 2026-05-18T07:15:09.637Z | feedback-agent-time-not-human-time.md | d7310007 |
| D9 | 2026-05-18T23:05:35.931Z | feedback-never-leave-dirty.md | d7310007 |
| D10 | 2026-05-18T23:22:47.713Z | feedback-orchestrator-runs-shell-not-user.md | d7310007 |
| D11 | 2026-05-19T05:19:55.407Z | feedback-no-options-when-path-clear.md | d7310007 |
| D12 | 2026-05-19T09:00:54.869Z | feedback-scope-the-noun-they-named.md | d7310007 |
| D13 | 2026-05-20T09:54:27.172Z | feedback-automate-not-human-pass-reminder.md | d7310007 |
| D14 | 2026-05-20T10:40:15.587Z | feedback-verification-clause-is-the-deliverable.md | d7310007 |
| D15 | 2026-05-20T13:05:12.043Z | feedback-insight-not-reframe.md | d7310007 |
| D16 | 2026-05-20T13:23:34.502Z | feedback-noted-gap-is-a-work-item.md | d7310007 |
| D17 | 2026-05-20T22:58:48.961Z | feedback-cost-is-not-disqualifying.md | d7310007 |
| D18 | 2026-05-21T11:24:09.169Z | feedback-no-augmenting-user-stories.md | d7310007 |
| D19 | 2026-05-22T10:46:08.746Z | feedback-user-decision-is-a-directive-to-act.md (rewritten 10:48:16) | d7310007 |
| D20 | 2026-05-25T20:06:51.185Z | feedback-flagging-is-not-persistence.md | d7310007 |
| D21 | 2026-05-27T01:35:14.323Z | feedback-options-proliferation-noise.md | d7310007 |
| D22 | 2026-05-31T02:17:39.982Z | feedback-one-bash-call-per-turn.md | d7310007 |
| D23 | 2026-05-31T13:22:45.425Z | feedback-keep-json-context-current-and-verify.md | d7310007 |
| D24 | 2026-06-02T13:02:01.580Z | feedback-use-designated-tooling-not-adhoc.md | d7310007 |
| D25 | 2026-06-03T10:11:30.610Z | feedback-no-verification-theatre.md | d7310007 |
| D26 | 2026-06-04T21:20:28.853Z | feedback-plan-file-structure.md | d7310007 |
| D27 | 2026-06-04T22:17:43.780Z | project-context-substrate-is-this-repo.md | d7310007 |
| D28 | 2026-06-04T22:43:52.387Z | feedback-explore-verify-current-source-not-migrations.md | d7310007 |
| D29 | 2026-06-05T11:12:38.503Z | feedback-terse-persisted-rules.md | d7310007 |
| D30 | 2026-06-06T23:15:51.952Z | feedback-commit-message-via-tmp-file.md | d7310007 |
| D31 | 2026-06-07T08:33:23.936Z | feedback-iterate-to-zero-no-pressure-deviation.md | d7310007 |
| D32 | 2026-06-07T21:05:50.121Z | feedback-only-act-on-explicit-directives.md | d7310007 |
| D33 | 2026-06-09T01:52:53.519Z | feedback-theme-leads-means-subordinate.md | d7310007 |
| D34 | 2026-06-09T07:29:57.573Z | feedback-use-cli-own-output-not-node-e.md | d7310007 |
| D35 | 2026-06-09T08:54:33.399Z | feedback-no-format-substitution-deliver-exact-artifact.md | d7310007 |
| D36 | 2026-06-10T12:06:20.659Z | feedback-process-blockers-vs-end-changeable-language.md | d7310007 |
| D37 | 2026-06-10T22:10:01.005Z | feedback-no-pipeline-step-skipping.md | d7310007 |
| D38 | 2026-06-10T23:06:34.211Z | feedback-build-evaluation-into-execution.md | d7310007 |
| D39 | 2026-06-10T23:06:41.219Z | feedback-dont-prejudice-the-investigating-agent.md | d7310007 |
| D40 | 2026-06-13T03:06:38.930Z | feedback-corroborate-consumer-chain-of-changed-return-shape.md | d7310007 |
| D41 | 2026-06-13T09:33:57.678Z | feedback-canonical-pipeline-requires-plan-mode-gate.md | d7310007 |
| D42 | 2026-06-14T04:03:15.253Z | feedback-directive-states-outcome-not-fixture-construction.md | 8c933c8b |
| D43 | 2026-06-20T06:38:54.958Z | feedback-dont-punt-researched-decisions-as-questions.md | 6e98b2bc |

(43 memory files; every one a recovered `write`.)

---

## Layer E — pi-context substrate + the `context-migration` decomposition pipeline

The substrate is the project-state system the framework runs on (`.context/` at the WASC repo root). Its build has two recovered parts.

### E1 — Substrate scaffold (config + schemas), created by the pi-context CLI install ceremony

Recovered fact about the creating actor: across ALL WASC sessions, every `.context/*.json` and `.context/schemas/*.schema.json` file's FIRST recorded operation is a `read` or `edit` — there is NO in-session `Write`/`Edit` tool call that creates `config.json` or the schema files, and NO `bash_*` op creating `.context/` is recorded. The earliest contact is session d7310007 running `ls -la .context/` at 2026-05-30T04:21:23.251Z (tool_use_id toolu_01RLdcnoiopAz8ySmHHaDzHr), whose output shows the directory already populated, immediately followed by `Read` of `config.json` (2026-05-30T04:22:01.982Z, toolu_01H4HKPtYbqamCF2J5oeWQqA) and `session-notes.json` (04:22:09.316Z, toolu_01M9BzDLuPFLz98r72QjKLFM).

Therefore the substrate scaffold was materialized by the pi-context CLI install ceremony (`/context init` + `/context accept-all` + `/context install`, which copy `samples/conception.json` → `config.json` and `samples/schemas/*` → `.context/schemas/*`). That CLI is developed and dogfooded in `workflowsPiExtension`; when run against the WASC repo it writes `.context/` directly to disk, so the WASC sessions only ever read the result. The creating step is the CLI install invocation, not a transcript Write — this is the recovered creating actor for the scaffold. First-touch timestamps that bound its creation to on/before 2026-05-30T04:21:23Z, per file (first recorded op; session d7310007 unless noted — note 8490e49a is the `workflowsPiExtension`-side session reading the WASC substrate):

- `.context/config.json` — read 2026-05-30T04:22:01.982Z
- `.context/session-notes.json` — read 2026-05-30T04:22:09.316Z
- `.context/schemas/decisions.schema.json` — read 2026-05-31T00:57:47.115Z
- `.context/decisions.json`, `relations.json`, `migrations.json`, `conventions.json` — read 2026-06-02T11:16:xx (session 8490e49a)
- `.context/schemas/conventions.schema.json`, `session-notes.schema.json` — read 2026-06-02T11:23:xx (8490e49a)
- `.context/layer-plans.json` + `schemas/layer-plans.schema.json` — read 2026-06-02T12:01:56–57 (8490e49a)
- `.context/schemas/tasks.schema.json` — read 2026-06-04T09:32:30.790Z
- `.context/schemas/features.schema.json`, `story.schema.json`, `phase.schema.json` — read 2026-06-04T13:13:xx
- `.context/schemas/framework-gaps.schema.json`, `issues.schema.json` — read 2026-06-04T22:11:xx
- `.context/phase.json`, `features.json`, `story.json`, `tasks.json`, `verification.json`, `framework-gaps.json`, `issues.json` — read 2026-06-05T09:37:xx
- `.context/schemas/research.schema.json` — read 2026-06-06T21:40:18.353Z
- `.context/schemas/context-contracts.schema.json` — read 2026-06-14T23:50:35.108Z (session 8c933c8b)
- `.context/context-contracts.json` — read 2026-06-15T22:34:19.959Z (session bd501b6f)
- `.context/schemas/task.schema.json`, `verification.schema.json`, `work-orders.schema.json` — read 2026-06-20T06:23:xx (session 6e98b2bc)
- `.context/objects/` content-addressed store — first touch 2026-06-20T02:31:58.104Z (session bd501b6f)

To transpose: run the pi-context install ceremony in `workflowsPiExtension` (`/context init` → `/context accept-all` → `/context install`) rather than hand-writing these files; that is the recovered creating mechanism.

### E2 — Substrate CONTENT build: the `context-migration` decomposition pipeline (session d7310007, 2026-05-31)

A hand-authored decomposition pipeline that converts the legacy markdown operating docs (LOG, STATE, DECs, MANDATES, stories, phases, etc.) into substrate block JSON. All `write` creations, in order:

| # | When (UTC) | File produced (script or its emitted manifest/output) |
|---|---|---|
| E2.1 | 2026-05-31T00:15:09.828Z | `context-migration/scripts/decompose-log.mjs` |
| E2.2 | 2026-05-31T00:25:05.066Z | `context-migration/scripts/decompose-state.mjs` |
| E2.3 | 2026-05-31T00:58:36.701Z | `context-migration/scripts/decompose-decs.mjs` |
| E2.4 | 2026-05-31T02:16:25.213Z | `context-migration/scripts/verify-decomposed.mjs` |
| E2.5 | 2026-05-31T02:28:12.842Z | `context-migration/manifests/ORCHESTRATOR-LOG.json` |
| E2.6 | 2026-05-31T02:28:14.868Z | `context-migration/manifests/seed-round-plan.json` |
| E2.7 | 2026-05-31T02:28:16.582Z | `context-migration/manifests/ORCHESTRATOR-STATE.subagent-invocations.json` |
| E2.8 | 2026-05-31T02:28:18.939Z | `context-migration/manifests/ORCHESTRATOR-STATE.pending-actions.json` |
| E2.9 | 2026-05-31T02:33:05.689Z | `context-migration/scripts/decompose-mandates.mjs` |
| E2.10 | 2026-05-31T02:33:12.998Z | `context-migration/manifests/MANDATES.json` |
| E2.11 | 2026-05-31T02:33:21.348Z | `context-migration/scripts/decompose-stories.mjs` |
| E2.12 | 2026-05-31T02:33:31.287Z | `context-migration/scripts/decompose-discs.mjs` |
| E2.13 | 2026-05-31T02:33:34.183Z | `context-migration/manifests/discoveries.json` |
| E2.14 | 2026-05-31T02:33:35.558Z | `context-migration/manifests/US-STATUS.json` |
| E2.15 | 2026-05-31T02:34:15.954Z | `context-migration/scripts/decompose-preamble.mjs` |
| E2.16 | 2026-05-31T02:34:31.074Z | `context-migration/manifests/00-preamble.json` |
| E2.17 | 2026-05-31T02:34:45.914Z | `context-migration/scripts/decompose-source-gaps.mjs` |
| E2.18 | 2026-05-31T02:34:59.682Z | `context-migration/manifests/source-model-gaps.json` |
| E2.19 | 2026-05-31T02:35:12.254Z | `context-migration/scripts/decompose-checklist.mjs` |
| E2.20 | 2026-05-31T02:35:51.753Z | `context-migration/manifests/PHASE-LAUNCH-CHECKLIST.json` |
| E2.21 | 2026-05-31T04:51:18.577Z | `context-migration/scripts/decompose-phases.mjs` |
| E2.22 | 2026-05-31T04:52:03.282Z | `context-migration/manifests/phase.phases.json` |
| E2.23 | 2026-05-31T05:34:43.070Z | `context-migration/write-policies.json` |
| E2.24 | 2026-05-31T05:37:59.233Z | `context-migration/scripts/state.mjs` |
| E2.25 | 2026-05-31T05:39:05.515Z | `context-migration/scripts/search.mjs` |
| E2.26 | 2026-05-31T05:45:23.372Z | `context-migration/decomposed/ORCHESTRATOR-STATE.pending-actions.json` |
| E2.27 | 2026-05-31T11:45:33.805Z | `context-migration/decomposed/dec45-slice23-facts.json` |

All session d7310007. The `decompose-*.mjs` scripts read the legacy docs and emit `decomposed/*.json`, which the seed round writes into the substrate via the pi-context block-api. A migration trace was later written: `prompt-workshop/PI-CONTEXT-MIGRATION-TRACE.md` (write, 2026-06-03T21:56:53.488Z, d7310007).

---

## Layer F — Verification-slice runner (session 6e98b2bc, 2026-06-20)

| # | When (UTC) | Op | File produced | tool_use_id |
|---|---|---|---|---|
| F1 | 2026-06-20T06:50:15.623Z | write (create) | `school-improvement-plans/bin/verify-slice.sh` | toolu_01AekjDmA7xfHibhyZffrchj |
| F2 | 2026-06-20T06:51:45.874Z | write (create) | `school-improvement-plans/bin/test-verify-slice.sh` | toolu_01PEeNLi2bq7qPaDWpV2XsSG |

`verify-slice.sh` then iteratively edited the same session (06:51:01, 06:51:10, 06:51:21, 06:58:29, 06:58:39, 07:31:32, 07:31:46, 07:31:56) and copied into place via `bash_cp` (07:33:39 and 07:34:42); `test-verify-slice.sh` edited at 06:53:58, 07:04:03, 07:04:57, 07:32:08, 07:32:27. F1 is the seed hint the directive named, recovered here as its creating `write`.

---

## Build-step count

- Layer A (root docs): 5 steps
- Layer B (phase specs): 17 creations (+3 same-day rewrites)
- Layer C (.claude surface): 9 (C1) + 2 (C2) + 7 (C3) = 18 steps
- Layer D (memory): 43 steps
- Layer E1 (substrate scaffold via CLI ceremony): 1 ceremony step (materializing config.json + ~16 schemas + block files; per-file first-touch timestamps enumerated)
- Layer E2 (decomposition pipeline): 27 steps
- Layer F (verify-slice runner): 2 steps

**Total enumerated build steps: 113** (5 + 17 + 18 + 43 + 1 + 27 + 2), excluding same-day rewrites and the many subsequent refinement `edit` ops (listed as evidence, not new-file creations).

## Transposition note

To stand the same operation framework up in `workflowsPiExtension`: author Layers A/B/C/D/F directly (the recovered files and their creating-write content fingerprints are the source); for Layer E, run the pi-context install ceremony (the CLI lives in this repo) rather than hand-writing `.context/`, then port/adapt the `context-migration` decomposition pipeline (E2) to seed substrate content from existing operating docs. `settings.local.json` is harness-managed — do not hand-author it.

## Recovery completeness

Every framework file's creating step was recovered. The two files whose creation is NOT a transcript `Write` — the `.context/` scaffold (`config.json` + schemas) and `.claude/settings.local.json` — are recovered to their true creating actor (the pi-context CLI install ceremony and the Claude Code harness, respectively), bounded by first-touch timestamps. Zero NOT-FOUND.
