#!/usr/bin/env node
// check-rename.mjs — rename-completeness checker.
//
// Enumerates every occurrence of an identifier across the git-tracked tree and,
// given an explicit allowlist of KEEP locations, reports which occurrences are
// LIVE (must be renamed) vs ALLOW (intentionally retained). One artifact serves
// two ends in a rename slice:
//   - run it BEFORE the rename to get the structured scoping list (file:line:text);
//   - run it AFTER with --gate to assert zero live occurrences remain — a machine
//     completeness gate that exits 1 on any live hit.
//
// This project renames an identifier in most slices (school/0029 Department->
// Division, school/0032 SubjectKind->ImprovementType, DEC-45 guiding_*->mvv_*), so
// the "no live references remain" predicate recurs; this is its reusable home. The
// allowlist encodes the KEEP decisions durably, so re-runs are automated rather
// than re-read each time.
//
// Usage:
//   node bin/check-rename.mjs <symbol> [options]
// Options:
//   --root <dir>         Limit the search to <dir> (repo-relative; default: whole repo).
//   --allow <path:line>  Mark one occurrence as an intentional KEEP. Repeatable.
//   --allow <path>       Mark every occurrence in <path> as KEEP (no :line).
//   --allow-file <path>  Read allow entries from a file (one per line; blank lines
//                        and lines starting with # are ignored).
//   --substring          Match <symbol> as a substring. Default is whole-word, so
//                        `guiding_clauses` does not match `guiding_statements`.
//   --gate               Exit 1 if any live (non-allowed) occurrence remains.
//   --json               Emit the result as JSON instead of the text report.
//
// Exit codes: 0 = ok (no live hits, or plain report mode); 1 = live hits remain
// under --gate; 2 = usage / environment error.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function fail(msg) {
  process.stderr.write(`check-rename: ${msg}\n`);
  process.exit(2);
}

const argv = process.argv.slice(2);
let symbol = null;
let root = null;
let wholeWord = true;
let gate = false;
let json = false;
const allow = new Set();

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--root") root = argv[++i];
  else if (a === "--allow") allow.add((argv[++i] ?? "").trim());
  else if (a === "--allow-file") {
    const body = readFileSync(argv[++i], "utf8");
    for (const line of body.split("\n")) {
      const t = line.trim();
      if (t && !t.startsWith("#")) allow.add(t);
    }
  } else if (a === "--substring") wholeWord = false;
  else if (a === "--gate") gate = true;
  else if (a === "--json") json = true;
  else if (a.startsWith("--")) fail(`unknown option ${a}`);
  else if (symbol === null) symbol = a;
  else fail(`unexpected argument ${a}`);
}

if (!symbol) fail("a <symbol> argument is required");

// Resolve the repo root so emitted paths are repo-relative and stable regardless
// of the caller's cwd.
let repoRoot;
try {
  repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim();
} catch {
  fail("not inside a git work tree");
}

// git grep over tracked files only: skips node_modules, tmp/, and other gitignored
// paths for free. -I skips binary files; -F treats <symbol> literally; -w bounds it
// to a whole word unless --substring was given.
const grepArgs = ["grep", "-n", "-I", "-F"];
if (wholeWord) grepArgs.push("-w");
grepArgs.push("-e", symbol, "--", root ?? ".");

let raw = "";
try {
  raw = execFileSync("git", grepArgs, { cwd: repoRoot, encoding: "utf8" });
} catch (e) {
  // git grep exits 1 with empty output when there are no matches — a clean zero.
  if (e.status === 1 && !e.stdout) raw = "";
  else if (e.stdout != null) raw = String(e.stdout);
  else fail(`git grep failed: ${e.message}`);
}

const matches = [];
for (const line of raw.split("\n")) {
  if (!line) continue;
  // git grep -n format: <path>:<line>:<text>
  const m = line.match(/^([^:]+):(\d+):(.*)$/);
  if (!m) continue;
  const [, file, lineNo, text] = m;
  const allowed = allow.has(`${file}:${lineNo}`) || allow.has(file);
  matches.push({ file, line: Number(lineNo), text, allowed });
}

const liveCount = matches.filter((x) => !x.allowed).length;

if (json) {
  process.stdout.write(
    JSON.stringify(
      {
        symbol,
        wholeWord,
        total: matches.length,
        allowed: matches.length - liveCount,
        live: liveCount,
        matches,
      },
      null,
      2,
    ) + "\n",
  );
} else {
  for (const x of matches) {
    process.stdout.write(
      `[${x.allowed ? "ALLOW" : "LIVE "}] ${x.file}:${x.line}: ${x.text.trim()}\n`,
    );
  }
  process.stdout.write(
    `\n${matches.length} occurrence(s) of "${symbol}": ` +
      `${matches.length - liveCount} allowed, ${liveCount} live\n`,
  );
}

process.exit(gate && liveCount > 0 ? 1 : 0);
