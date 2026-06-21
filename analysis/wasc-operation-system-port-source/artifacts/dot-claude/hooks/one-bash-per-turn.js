#!/usr/bin/env node
// one-bash-per-turn.js — PreToolUse(Bash) guard, transcript-based.
//
// Blocks a turn that emits MORE THAN ONE Bash tool_use block. Batching is the
// recurring failure: the first call's nonzero exit cancels the rest, producing
// cascade errors. A timing/lockfile guard cannot catch this — sibling Bash calls
// fire in parallel and race the lockfile (TOCTOU). This guard is deterministic
// under parallel firing: at PreToolUse time the full assistant message (with ALL
// its tool_use blocks) is already written to the transcript, so every sibling's
// hook reads the same message and counts the same N. If N > 1, every sibling
// exits 2 (block) — the whole batch is refused and must be re-issued one per turn.
//
// Input: hook JSON on stdin; we read `transcript_path`.
// Behavior: count tool_use blocks with name=="Bash" in the LAST assistant message.
//   N <= 1  → exit 0 (allow)
//   N  > 1  → exit 2 (block), reason on stderr (fed back to the model)
// Fail-open: any error (no transcript_path, unreadable file, parse failure) →
//   exit 0. A guard that can't read the turn must not wedge all Bash usage; the
//   behavioral rule still stands as backstop.

const fs = require("node:fs");

function allow() { process.exit(0); }

let input = "";
try {
  input = fs.readFileSync(0, "utf8");
} catch {
  allow();
}

let data;
try {
  data = JSON.parse(input);
} catch {
  allow();
}

const tp = data && data.transcript_path;
if (!tp || typeof tp !== "string") allow();

let raw;
try {
  raw = fs.readFileSync(tp, "utf8");
} catch {
  allow();
}

const lines = raw.split("\n").filter((l) => l.trim() !== "");
let lastAssistant = null;
for (let i = lines.length - 1; i >= 0; i--) {
  let obj;
  try {
    obj = JSON.parse(lines[i]);
  } catch {
    continue;
  }
  if (obj && obj.type === "assistant" && obj.message && Array.isArray(obj.message.content)) {
    lastAssistant = obj;
    break;
  }
}
if (!lastAssistant) allow();

const bashCount = lastAssistant.message.content.filter(
  (b) => b && b.type === "tool_use" && b.name === "Bash"
).length;

if (bashCount > 1) {
  process.stderr.write(
    `BLOCKED (one-bash-per-turn): this assistant turn emitted ${bashCount} Bash tool_use blocks. ` +
      `Batched Bash calls run in parallel and the first failure cancels the rest. ` +
      `Issue exactly ONE Bash call per turn: run it, read the result, then issue the next. ` +
      `Re-issue these commands one at a time across separate turns.\n`
  );
  process.exit(2);
}

allow();
