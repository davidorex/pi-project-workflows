---
name: update-context
description: Record a state change into this project's decomposed-JSON context spine. Use to append the ORCHESTRATOR-LOG event, update the context spine, upsert pending-actions / the focus item, log a subagent dispatch, file a discovery, and verify-don't-narrate (read the spine back). The mandatory closing step of every state-changing run — a commit, gate pass, seed/migration, settled decision, surfaced gap, or agent dispatch is not done until it is recorded here and read back.
---

# update-context

Project state lives in the decomposed JSON at `context-migration/decomposed/*.json` — one lossless array per former MD spine — operated through `node context-migration/scripts/state.mjs` (full-text reads via `search.mjs`). A state-changing action is **not complete until it is recorded**: a commit, a gate pass, a seed/migration, a decision settled, a gap surfaced, an agent dispatched. Flagging it in prose preserves nothing; the spine is the source of truth.

This routine is the **mandatory closing step of every other state-changing run.** Record the event, then read the spine back.

## Verify the spine reads back (the read-back driver)

After any write — and at session start to orient — run the read-only driver. It runs the orientation trio, asserts each parses and is non-empty, and prints the current focus + newest LOG event so you confirm the spine reconstructs the reality you just created. Exit 0 = coherent; nonzero = a parse failure / empty spine. It never writes.

```bash
.claude/skills/update-context/update-context.sh
```

## Orientation trio (what the driver runs; also session-start)

```bash
node context-migration/scripts/state.mjs filter ORCHESTRATOR-STATE.pending-actions.json status eq open
```
The current focus is the open item carrying `"priority": "next"`; the rest are the open backlog.

```bash
node context-migration/scripts/state.mjs tail ORCHESTRATOR-LOG.json
node context-migration/scripts/state.mjs tail ORCHESTRATOR-STATE.subagent-invocations.json
```

## Recording forms

`append`/`upsert` auto-detect the key (`id` if present, else `seq`) and **print `context-migration/write-policies.json` before writing** — re-read your filing against each policy before it lands (no performative noise, no meta-preamble, no unwarranted certainty, signal-dense, no git-reproducible cruft). Build the row to a scratch file and pass `@scratch.json`.

Append an event to the log — row shape `{timestamp, type, text, refs:[…], continuation:[], raw}` (`type` carries the substantive description, may include verbatim evidence: gate output, commit SHAs, counts; `raw` is the one-line summary):

```bash
node context-migration/scripts/state.mjs append ORCHESTRATOR-LOG.json @scratch.json
```

Append a subagent dispatch — row shape `{timestamp, task, agents, outcome, raw}`:

```bash
node context-migration/scripts/state.mjs append ORCHESTRATOR-STATE.subagent-invocations.json @scratch.json
```

Append a discovery (DISC):

```bash
node context-migration/scripts/state.mjs append discoveries.json @scratch.json
```

Upsert the focus / open work — read the whole item, change the one field, write the **whole object** back:

```bash
node context-migration/scripts/state.mjs read ORCHESTRATOR-STATE.pending-actions.json 6 > scratch.json
# edit scratch.json: e.g. status open→done + add an evidence field, or move priority:"next"
node context-migration/scripts/state.mjs upsert ORCHESTRATOR-STATE.pending-actions.json @scratch.json
```

## Gotchas

- **`upsert` REPLACES the whole matched element — it does not field-merge.** To amend one field, read the whole item, change that field, write the entire object back via `@scratch.json`. A partial object silently drops the unspecified fields.
- **`pending-actions.status` is exactly `open` or `done` — never a third value** (e.g. `in-progress`), or the session-start `filter status eq open` focus query misses active work. Mark `done` when committed (add an `evidence` field); move `priority:"next"` to the new focus.
- **`tail` returns the last PHYSICAL rows** = newest only for append-chronological files. `ORCHESTRATOR-LOG.json` and anything written via `append` are append-chronological, so `tail` = newest for them; a newest-first file returns oldest under `tail`.
- **`filter` prints JSON to stdout and the match count to stderr** — capture stdout only when piping.
- **Commit messages / row bodies with shell-special chars** (backticks, `$()`, `${}`) go through `git commit -F /tmp/file` (a file in the system `/tmp`, written via a quoted heredoc) — never `git commit -m "…"` (bash substitutes/drops those words silently). Keep the file out of the repo's tracked `tmp/`.
- **Verify, don't narrate.** After appending/upserting, RE-RUN the orientation trio (the driver above) and confirm it reconstructs the reality you just created. The run is not done until the spine reflects it and you have read it back — flagging is not persistence.
