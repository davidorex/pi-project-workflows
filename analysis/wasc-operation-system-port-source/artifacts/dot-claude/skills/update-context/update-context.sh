#!/usr/bin/env bash
# update-context.sh — read-only "verify-don't-narrate" read-back of the decomposed-JSON
# context spine. Runs the session-start orientation trio against
# context-migration/decomposed/*.json (via state.mjs), asserts each parses and returns
# at least one row, and prints the current focus + newest LOG event so an agent can
# confirm the spine reconstructs current reality after a state-changing write.
#
# This driver NEVER writes. It verifies. Recording a state change is done with
# `state.mjs append|upsert` (see SKILL.md); this is the read-back that proves it landed.
#
# Exit 0  → spine reads back coherently (all three reads parse, each non-empty,
#           a priority:next focus item exists).
# Exit !=0 → a read failed to parse, a file was empty, or no focus item was found.

set -euo pipefail

# Self-locate the repo root from this script's path:
#   <repo>/.claude/skills/update-context/update-context.sh  → up 3 dirs
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
STATE="$REPO_ROOT/context-migration/scripts/state.mjs"

if [[ ! -f "$STATE" ]]; then
  echo "FAIL: state.mjs not found at $STATE" >&2
  exit 2
fi

fail() { echo "FAIL: $1" >&2; exit 1; }

# --- 1. focus / open work --------------------------------------------------
# filter prints JSON to stdout, a count line to stderr; capture stdout only.
OPEN_JSON="$(node "$STATE" filter ORCHESTRATOR-STATE.pending-actions.json status eq open 2>/dev/null)" \
  || fail "could not run the pending-actions filter (state.mjs errored)"

node -e '
  const a = JSON.parse(require("fs").readFileSync(0, "utf8"));
  if (!Array.isArray(a) || a.length === 0) { console.error("no open pending-actions"); process.exit(1); }
  const f = a.find(x => x.priority === "next");
  if (!f) { console.error("no open item carries priority:next (the session-start focus query would miss active work)"); process.exit(1); }
  const label = f.item || f.action || f.title || f.task || f.summary || "(no label field)";
  console.log("focus      seq=" + f.seq + "  " + String(label).replace(/\s+/g, " ").slice(0, 100));
  console.log("open work  " + a.length + " item(s)");
' <<<"$OPEN_JSON" || fail "pending-actions did not parse or has no priority:next focus"

# --- 2. newest LOG event ---------------------------------------------------
# tail returns the last PHYSICAL rows = newest for append-chronological files
# (ORCHESTRATOR-LOG.json is written via state.mjs append, so tail = newest).
LOG_JSON="$(node "$STATE" tail ORCHESTRATOR-LOG.json 1)" \
  || fail "could not tail ORCHESTRATOR-LOG.json"

node -e '
  const a = JSON.parse(require("fs").readFileSync(0, "utf8"));
  if (!Array.isArray(a) || a.length === 0) { console.error("ORCHESTRATOR-LOG is empty"); process.exit(1); }
  const e = a[a.length - 1];
  console.log("log newest " + (e.raw || e.text || e.type || "(no raw)").replace(/\s+/g, " ").slice(0, 120));
' <<<"$LOG_JSON" || fail "ORCHESTRATOR-LOG did not parse or is empty"

# --- 3. newest subagent dispatch -------------------------------------------
INVOC_JSON="$(node "$STATE" tail ORCHESTRATOR-STATE.subagent-invocations.json 1)" \
  || fail "could not tail ORCHESTRATOR-STATE.subagent-invocations.json"

node -e '
  const a = JSON.parse(require("fs").readFileSync(0, "utf8"));
  if (!Array.isArray(a) || a.length === 0) { console.error("subagent-invocations is empty"); process.exit(1); }
  const e = a[a.length - 1];
  console.log("dispatch   " + (e.raw || e.task || "(no raw)").replace(/\s+/g, " ").slice(0, 120));
' <<<"$INVOC_JSON" || fail "subagent-invocations did not parse or is empty"

echo "OK: spine reads back coherently (focus + LOG + dispatch all present)"
