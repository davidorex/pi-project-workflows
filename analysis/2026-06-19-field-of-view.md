# Field of View — 2026-06-19

Everything currently in play (open and unresolved) that this session surfaced or is acting on, with each thread's status and what it depends on / blocks. Verified against the live `.context` substrate, `git status`, `context-validate-relations`, and the session transcript. Read-only reconstruction; nothing was mutated.

Branch: `feat/task-020-config-derivation` (10 commits ahead of origin). HEAD `0bc9a3e`.
Active substrate: `.context`.
Uncommitted working tree: `.context/config.json` only (+71 lines).

Status vocabulary used below: in-progress / filed-not-fixed / unfiled / uncommitted / deferred / standing.

---

## A. Make a task's project-state derive from configuration (TASK-020) — IN PROGRESS

- **TASK-020** — Make the "what's the current state / what's next" computation read its rules from the project config instead of from values hardcoded in the code. *Status: in-progress.* This is the original goal of the current branch.
  - **Blocked by — its final remaining piece: the fix that makes the last hardcoded relationship-name in the deriver come from config (the "endpoint-direction" fix).** *Status: written this session, then REVERTED, because applying it changed the config-schema shape and that bricked the live project config (every config-loading operation began failing).* This piece cannot land until the recovery mechanism below exists.
    - **Blocked by — a way to carry an existing config across a config-schema shape change (config migration / recovery).** This does not exist today and must be built first; without it, re-applying the deriver fix would brick the config again. That mechanism = building the fixes for the three filed-but-unbuilt config-lifecycle gaps:
      - **FGAP-095** — When the config's schema changes shape, there is no step at load time to carry an older config forward; every config operation just fails validation. *Status: filed-not-fixed.* (This is the direct prerequisite for TASK-020's final piece.)
      - **FGAP-096** — Once a config is invalid for any reason, there is no sanctioned way to repair it, because the repair command itself first loads (and so re-validates and rejects) the broken config. *Status: filed-not-fixed.*
      - **FGAP-097** — Nothing prevents or flags a breaking (non-additive) config-schema change before it ships; an additive-only discipline plus a build-time check would make most config changes non-breaking by construction. *Status: filed-not-fixed.*

---

## B. Make an issue a first-class work item like a gap (TASK-068) — IN PROGRESS

- **TASK-068** — Make an *issue* behave like a *gap* throughout the system: a task can address an issue, an open issue shows up in "what's next," and completing a task is checked against whether its issue is resolved. *Status: in-progress.* This is the thread most actively being worked.
  - **Done so far:** the packaged catalog plus the additive issue-schema changes were committed and merged to the branch (commit `3f6a9a7`). The same new vocabulary (the task→issue link, the issue-relates-to-issue link, the "completed task but unresolved issue" check, ranking open issues in "what's next," and the two new issue lenses) has been applied to the **live** project config.
  - **In play — the live config carries that new vocabulary but is NOT committed.** *Status: uncommitted* (the only modified working-tree file).
  - **In play — one remaining build step: add two new fields (`resolved_at` and a lifecycle block) to the live issues SCHEMA file.** *Status: in-progress (not yet done).*
    - **Open decision/fork on HOW to do that step:**
      - Option 1 — write the issues schema file directly (only the issues schema changes; nothing else moves).
      - Option 2 — run the "update everything from the catalog" command (refreshes the issues schema, but also touches every other installed schema).
      - *Status: deferred — the user's call, unresolved.*
        - **If Option 2 is chosen, it pulls in as a prerequisite: the story-schema drift below** (running "update everything" would apply the narrowing story-schema change and invalidate the 14 live story items).
  - **Addresses FGAP-098** (below). **Once TASK-068 lands, it unblocks giving issue-004 a task** (issue-004 cannot be task-addressed until issues are task-addressable).
  - **Catalog back-port leg interacts with FGAP-094 / TASK-066 / TASK-067** (the standing concern that any new live-config vocabulary must also be in the packaged catalog, or a fresh install rejects edges using it). *Status: noted dependency; FGAP-094 and TASK-066/067 are pre-existing, not new this session.*

---

## C. Gaps and issues surfaced this session (filed, the fix is still owed)

- **FGAP-098** — Issues are not a gap-sibling first-class work item: a task cannot address an issue, an open issue never appears in "what's next," and there is no closure check for issues. *Status: filed-not-fixed.* **Being addressed by TASK-068 (B above).**
- **FGAP-099** — Block data files carry no schema-version stamp, so read-time validation and read-time migration never run for any block; schema-evolution safety only happens on the explicit install/update path, never on read. *Status: filed-not-fixed.* (This is the "stories having no schema" point: a story item's stored data carries no schema_version, so nothing version-checks it on read. Distinct from the story-schema field-drift in section D.)
- **issue-005** — When "update" resyncs a schema whose catalog body changed at the *same* version, it overwrites the installed schema verbatim and never re-validates the existing items; a narrowing change (e.g. dropping a field) silently leaves existing items invalid, with no refusal or warning. *Status: filed-not-fixed.* (Names the story `user_kind` case as its concrete trigger.)
- **issue-004** — Installing the operator `pi-context` command via `npm link` points the live command at the in-development build, so a routine dev build can mutate or break the live operator command (this is what caused the config-bricking incident's binary side). *Status: filed-not-fixed.* **Queued behind TASK-068** — it gets a task only once issues are task-addressable.

## C2. The same-incident config-lifecycle gaps (also filed this session)

- **FGAP-095, FGAP-096, FGAP-097** — already placed under section A as the prerequisite chain for TASK-020's reverted final piece. *Status: filed-not-fixed.* They sit in the field of view both as TASK-020's blockers and as their own owed fixes.

---

## D. Surfaced this session but NOT filed

- **Story-schema field drift.** The packaged ("catalog") story schema has dropped the `user_kind` field, but 14 live story items still carry `user_kind`. Running the "update everything from the catalog" command would apply that narrowing schema and invalidate those 14 items. *Status: UNFILED* (confirmed: no issue or gap captures the drift itself; issue-005 only cites it as an example of its more general class). **This is the prerequisite that TASK-068's Option 2 (section B) would pull in.**

---

## E. Standing unresolved condition (pre-existing, untriaged)

- **29 story-advancer relationship-validation failures.** Running the relationship validator reports the substrate **invalid** with 29 issues, all of the same kind: a task or feature is linked as "advances story" to a story, but its endpoint is not present in the corresponding story-advancer view's bins (codes `edge_parent_not_in_bins`, relationship types `task_advances_story` / `feature_advances_story`). *Status: standing, untriaged* (pre-existing this session; not filed as a gap/issue, not being worked).

---

## F. A change to a filing made this session (the gap's prescribed fix was removed)

- **FGAP-043** — Block schemas carry no per-block rhetorical/authoring criteria, and block writes are not validated against any such criteria. *Status: filed-not-fixed (status: identified).* This session its prescribed solution was REMOVED from the gap; the gap now states only the deficiency, with resolution recorded as "not yet determined; to be filed as a separate decision."
  - **Owed: the separate decision** capturing the resolution the user directed — a **block-schema property object holding the rhetorical requirements for each block type** (the user-named shape). *Status: deferred / not yet filed* (owed as that separate decision, not as part of the gap).

---

## Nested dependency summary (plain links)

```
TASK-020 (in progress) — make project-state derivation config-driven
  └─ blocked by: its final piece, the endpoint-direction deriver fix (reverted this session — bricked the config)
       └─ blocked by: a config-migration / recovery mechanism (does not exist)
            └─ = build the fixes for: FGAP-095 (no load-time migration)
                                      FGAP-096 (no repair path once invalid)
                                      FGAP-097 (no additive-change discipline)   [all filed, not built]

TASK-068 (in progress) — make an issue a first-class work item like a gap
  ├─ done: catalog + additive issues-schema changes (committed, merged)
  ├─ uncommitted: the same new vocabulary applied to the LIVE config
  ├─ remaining step: add resolved_at + lifecycle to the live issues SCHEMA file
  │     └─ open fork: write the schema file directly  vs.  run "update everything"
  │            └─ if "update everything": pulls in the unfiled story-schema drift as a prerequisite
  ├─ addresses: FGAP-098 (issues not a gap-sibling)
  └─ unlocks: giving issue-004 a task (npm-link couples operator binary to dev build) — queued behind it

Story-schema drift (UNFILED): catalog dropped user_kind; 14 live story items still carry it
  └─ would be triggered/broken by TASK-068's "update everything" option
  └─ is the concrete example named by issue-005 (filed)

Filed-not-fixed, standing on their own (fixes owed):
  FGAP-099 (block data has no schema_version → read-time validation/migration inert)
  issue-005 (same-version resync silently invalidates items, no re-validation)
  issue-004 (npm-link couples operator binary to dev build)

FGAP-043 (no per-block rhetorical criteria) — solution removed this session
  └─ owed: a separate DECISION for the per-block-type rhetorical-requirements property object

Standing condition (untriaged):
  29 story-advancer relationship-validation failures (validator reports the substrate invalid)
```

## Verification notes

- Every gap/issue/task status above was read directly from the live `.context` substrate via read-only `pi-context` ops.
- The 29 failures and the "invalid" verdict are the live output of `context-validate-relations`; all 29 are `edge_parent_not_in_bins` on `task_advances_story`/`feature_advances_story`.
- The uncommitted state is `.context/config.json` only (TASK-068's live-config leg), confirmed by `git status` + `git diff`.
- The story-schema `user_kind` drift is confirmed UNFILED (no issue/gap captures it; issue-005 only cites it as an example). The 14-item count is from the session transcript/analysis, not independently re-counted here.
- The TASK-020 endpoint-direction revert and the config-bricking incident are confirmed from the session transcript and corroborated by FGAP-095's impact text.
```
