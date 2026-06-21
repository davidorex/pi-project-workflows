#!/usr/bin/env node
// search.mjs — full-text search across the decomposed JSON state files.
//
// Cross-file grep replacement: finds which item(s) in which file mention a term,
// returning a located hit (file + key + matching field + snippet), not a file dump.
// Searches every string-valued field of every element, recursively (so folded
// children/continuation/notes text is searched too).
//
// Usage:
//   search.mjs <query>                  search ALL decomposed/*.json
//   search.mjs <query> --file <name>    search one file (basename or path)
//   search.mjs <query> --field <f>      restrict matching to one field name
//   search.mjs <query> --regex          treat query as a regex (default: substring, case-insensitive)
//   search.mjs <query> --context <n>    snippet chars each side of the match (default 60)
//
// Output: one JSON array of hits {file, key, field, path, snippet}. Count to stderr.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, isAbsolute, basename } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const DECOMPOSED = resolve(REPO_ROOT, "context-migration", "decomposed");

function die(msg, code = 2) { console.error(msg); process.exit(code); }

function parseArgs(argv) {
  const out = { _: [], context: 60 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--file" && argv[i + 1]) { out.file = argv[++i]; }
    else if (a === "--field" && argv[i + 1]) { out.field = argv[++i]; }
    else if (a === "--regex") { out.regex = true; }
    else if (a === "--context" && argv[i + 1]) { out.context = Number(argv[++i]); }
    else out._.push(a);
  }
  return out;
}

function resolveFile(f) {
  if (isAbsolute(f)) return f;
  if (!f.includes("/")) return resolve(DECOMPOSED, f);
  return resolve(REPO_ROOT, f);
}

function keyOf(item) {
  if (item && typeof item === "object") {
    if ("id" in item) return item.id;
    if ("seq" in item) return item.seq;
  }
  return null;
}

// Walk an element, yielding [fieldPath, stringValue] for every string leaf.
function* stringLeaves(node, pathParts = []) {
  if (typeof node === "string") { yield [pathParts.join("."), node]; return; }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) yield* stringLeaves(node[i], [...pathParts, String(i)]);
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) yield* stringLeaves(v, [...pathParts, k]);
  }
}

function snippetAround(text, idx, len, ctx) {
  const start = Math.max(0, idx - ctx);
  const end = Math.min(text.length, idx + len + ctx);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const query = args._[0];
  if (!query) die("usage: search.mjs <query> [--file <name>] [--field <f>] [--regex] [--context <n>]");

  let files;
  if (args.file) files = [resolveFile(args.file)];
  else files = readdirSync(DECOMPOSED).filter((f) => f.endsWith(".json")).sort().map((f) => resolve(DECOMPOSED, f));

  let re;
  if (args.regex) { try { re = new RegExp(query, "i"); } catch (e) { die(`bad regex: ${e.message}`); } }
  const needle = query.toLowerCase();

  const hits = [];
  for (const path of files) {
    let arr;
    try { arr = JSON.parse(readFileSync(path, "utf8")); } catch { continue; }
    if (!Array.isArray(arr)) continue;
    const fname = basename(path);
    for (const item of arr) {
      for (const [fieldPath, value] of stringLeaves(item)) {
        const topField = fieldPath.split(".")[0];
        if (args.field && topField !== args.field) continue;
        let idx;
        if (re) { const m = re.exec(value); idx = m ? m.index : -1; }
        else idx = value.toLowerCase().indexOf(needle);
        if (idx >= 0) {
          hits.push({
            file: fname,
            key: keyOf(item),
            field: fieldPath,
            snippet: snippetAround(value, idx, query.length, args.context),
          });
        }
      }
    }
  }

  console.log(JSON.stringify(hits, null, 2));
  console.error(`${hits.length} hit(s) across ${files.length} file(s) for ${args.regex ? "/" + query + "/i" : JSON.stringify(query)}`);
}

main();
