---
name: validate-context
description: Validate context, check the .context substrate, query/read/write the context cascade, run context-validate, or read context-current-state for this repo's active-phase pi-context PM substrate. Use to gate the .context substrate (referential + relations integrity), query its tasks/features/gaps/verification blocks, or perform cascade writes.
---

# Validate & query the .context pi-context substrate

`.context/` is this repo's active-phase PM substrate: typed-JSON blocks (`tasks`, `features`, `story`, `phase`, `framework-gaps`, `verification`, `decisions`, `conventions`, …) with per-block schemas in `.context/schemas/`, cross-block edges in `.context/relations.json`, and config in `.context/config.json`. You operate it through the **`pi-context` CLI on PATH** (`which pi-context` → `/opt/homebrew/bin/pi-context`).

Use `pi-context <op> --cwd .` (or omit `--cwd`) to stay on THIS repo's substrate. Do **not** use the legacy `node …/pi-context-cli/dist/bin.js` raw-dist form — the PATH CLI is the mandated invocation.

## The driver (run this first)

```bash
bash .claude/skills/validate-context/validate-context.sh
```

A fast, read-only smoke: runs `context-validate` (asserts 0 referential errors; prints the warning count), `context-validate-relations` (asserts `clean`), and reports `context-current-state` (NOT gated — it is a known-degraded op here, see below). Self-locating (resolves repo root from its own path; runnable from any cwd).

Verified output in this container ends with `SMOKE OK: substrate validates clean (status=warnings, 0 errors, 5 warning(s) allowed; relations clean).`, exit 0. **Exit 0 = the substrate validates clean. Nonzero only on a real validate error** (a cross-block referential error or a non-clean relations status); warnings and the current-state regression never fail it.

## The canonical gate (what the driver runs)

The `--json` envelope is `{"ok":…,"op":…,"output":{"status":…,"issues":[…]}}`. Parse it with `jq` — `.output.status` is the machine verdict (`clean`/`warnings`/`invalid`), and each `.output.issues[]` carries a `severity` (`error`/`warning`). Gate on `status == "invalid"` or any `error`-severity issue:

```bash
# Cross-block referential integrity — error count from the structured envelope:
pi-context context-validate --cwd . --json | jq '[.output.issues[]|select(.severity=="error")]|length'    # -> 0 (clean)
pi-context context-validate --cwd . --json | jq -r '.output.status'                                         # -> warnings (5 warnings, 0 errors here)

# Substrate relations — status "clean" == pass:
pi-context context-validate-relations --cwd . --json | jq -r '.output.status'                               # -> clean
```

A completed task with no `verification_verifies_item` edge fails `context-validate` (the `completed-task-has-verification` invariant) — so the audit's verification is structurally required to mark a task done. After ANY `.context` write, re-run `context-validate` and confirm the result reconstructs what you wrote — verify, don't narrate.

## Query / read (no auth)

```bash
pi-context read-block-item --block tasks --id TASK-052 --cwd .
pi-context filter-block-items --block tasks --field status --op eq --value completed --cwd .
pi-context read-block --block features --cwd .
pi-context read-block-page --block framework-gaps --cwd . --json
pi-context read-schema --schemaName tasks --cwd . --json                 # whole schema; add --path <p> to address one node
pi-context find-references --itemId FGAP-007 --cwd .
pi-context context-current-state --cwd .                                 # see regression below
pi-context gather-execution-context --unitId TASK-052 --kind task --cwd .
pi-context read-config --cwd .                                           # vocabulary, lenses, relation_types, per-block array_key/data_path
```

## Cascade / write

Writes need an explicit `--arrayKey` and resolve `--block` by the **data-file stem** (read `read-config` for each block's `array_key`). Build the item to a scratch file and pass `@file`:

```bash
# append a framework-gap (block stem "framework-gaps", array_key "gaps"):
pi-context append-block-item --block framework-gaps --arrayKey gaps \
  --item @/tmp/gap.json --writer '{"kind":"agent","agent_id":"orchestrator"}' --cwd .

# update one item (match by id, updates from a file):
pi-context update-block-item --block tasks --arrayKey tasks \
  --match '{"id":"TASK-052"}' --updates @/tmp/updates.json \
  --writer '{"kind":"agent","agent_id":"orchestrator"}' --cwd .

# add a cascade edge, then complete a task against its verification:
pi-context append-relation --parent FEAT-003 --child TASK-052 --relation_type feature_contains_task --cwd .
pi-context complete-task --taskId TASK-052 --verificationId VER-052 --cwd .
```

## Gotchas (battle scars)

- **Use the `pi-context` PATH CLI, not `node …/dist/bin.js`** — the raw-dist form is legacy; CLAUDE.md mandates `pi-context <op> --cwd .`.
- **No echo-header theatre** — never wrap a check in `echo "==="`/`&& echo ok`. Parse the structured `--json` envelope with `jq` (`.output.status`, `.output.issues[].severity`); that is the verdict signal, not a self-authored echo.
- **`--cwd .` stays on the active `.context`** — a non-active sibling substrate (e.g. `.workshopping`) is NOT reachable by `--cwd <dir>`; the CLI resolves a substrate by its bootstrap pointer (`.pi-context.json`), so a sibling requires a transient `pi-context context-switch` of the root pointer and back, and `.pi-context.json` must end on `.context` (finding CTX-12).
- **Write `--block`/`--arrayKey` resolve differently from reads** — writes resolve `--block` by the data-file stem AND need an explicit `--arrayKey` (e.g. `--block framework-gaps --arrayKey gaps`, `--block features` not `feature`, `--block story --arrayKey stories`); reads accept the canonical_id. Read `read-config` for each block's `{data_path stem, array_key}` (findings CTX-3 / CTX-7).
- **Verify, don't narrate** — after any write, re-run `context-validate` (and `context-current-state`) and confirm it reconstructs what you created; never assert substrate state from memory.

## Known current regression: context-current-state

```bash
pi-context context-current-state --cwd .
# -> {"focus":"state-derivation not configured","inFlight":[],"nextActions":[],"blocked":[],"milestones":[]}
```

`context-current-state` returns **empty/degraded** here: since pi-context engine commit `99f45de` config-gated state derivation on a top-level `state_derivation` key, and this project's `.context/config.json` has none, the deriver short-circuits to `"state-derivation not configured"`. The fix path is to bring `state_derivation` in from the canonical conception (`pi-context update` + `resolve-blocked conventions`); see ORCHESTRATOR-LOG. Until then, **do not rely on current-state for rich status** — `context-validate` and `context-validate-relations` are unaffected and ARE the reliable gate. The driver reports current-state but never fails on this output.

## The driver, plainly

`.claude/skills/validate-context/validate-context.sh` — the committed read-only smoke (validate + validate-relations gate, current-state reported). Verified in this container (macOS): exit 0, `context-validate: status=warnings errors=0 warnings=5`, `context-validate-relations: status=clean`, current-state focus `state-derivation not configured`, `SMOKE OK`.
