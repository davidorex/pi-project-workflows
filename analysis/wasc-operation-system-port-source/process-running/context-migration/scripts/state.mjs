#!/usr/bin/env node
// state.mjs — generic read/write accessor over the decomposed JSON state files.
//
// One script for all of context-migration/decomposed/*.json: each is a flat array
// of objects, so the operations are shape-agnostic. Per-file variation is only the
// key field (id where present, else seq) — handled by --key (auto-detected).
//
// The point of this layer: reads return a SLICE (one item / a filtered set / the
// tail), not the whole file — so a session pays context for the rows it needs, not
// the full document. This is the JSON-as-authoritative-state move: state lives here,
// not in the MD spine, and is touched through typed accessors instead of whole-file
// MD reads/writes.
//
// Commands:
//   read   <file> <keyval>                 print the one item whose key == keyval
//   filter <file> <field> <op> <value>     print items where field <op> value
//                                          ops: eq ne contains gt lt gte lte exists
//   tail   <file> [n]                      print the last n items (default 5)
//   append <file> @item.json | '<json>'    add an element (PRE-WRITE policy show)
//   upsert <file> @item.json | '<json>'    replace element by key, else append (PRE-WRITE)
//
// --key <field>   override the key field (default: "id" if items carry it, else "seq")
//
// append/upsert FIRST print the write-policies + the item to be written, THEN write.
// The policies are a forcing-function: the writer sees all of them against its own
// filing at the moment of writing. Soft and bypassable by design — show, then write.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, isAbsolute } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const POLICIES = resolve(REPO_ROOT, "context-migration", "write-policies.json");

function die(msg, code = 2) {
  console.error(msg);
  process.exit(code);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--key" && argv[i + 1]) { out.key = argv[i + 1]; i++; }
    else out._.push(argv[i]);
  }
  return out;
}

function resolveFile(f) {
  if (isAbsolute(f)) return f;
  // bare basename → decomposed/; otherwise relative to cwd/repo
  if (!f.includes("/")) return resolve(REPO_ROOT, "context-migration", "decomposed", f);
  return resolve(REPO_ROOT, f);
}

function loadArray(path) {
  let raw;
  try { raw = readFileSync(path, "utf8"); } catch (e) { die(`cannot read ${path}: ${e.message}`, 3); }
  let data;
  try { data = JSON.parse(raw); } catch (e) { die(`invalid JSON in ${path}: ${e.message}`, 3); }
  if (!Array.isArray(data)) die(`${path} is not a JSON array`, 3);
  return data;
}

function saveArray(path, arr) {
  writeFileSync(path, JSON.stringify(arr, null, 2) + "\n", "utf8");
}

function detectKey(arr, override) {
  if (override) return override;
  if (arr.length && "id" in arr[0]) return "id";
  if (arr.length && "seq" in arr[0]) return "seq";
  return "id";
}

function loadItem(arg) {
  const text = arg.startsWith("@") ? readFileSync(arg.slice(1), "utf8") : arg;
  let item;
  try { item = JSON.parse(text); } catch (e) { die(`invalid item JSON: ${e.message}`, 2); }
  if (typeof item !== "object" || Array.isArray(item) || item === null) die("item must be a JSON object", 2);
  return item;
}

function showPolicies(item) {
  let pol;
  try { pol = JSON.parse(readFileSync(POLICIES, "utf8")); } catch (e) { die(`cannot read write-policies: ${e.message}`, 3); }
  console.error("── write-policies (re-read your filing against each before it lands) ──");
  for (const p of pol.policies) console.error(`  • ${p.id}: ${p.assertion}`);
  console.error("── item being written ──");
  console.error(JSON.stringify(item, null, 2));
  console.error("──");
}

function matchOp(fieldVal, op, value) {
  switch (op) {
    case "eq": return String(fieldVal) === value;
    case "ne": return String(fieldVal) !== value;
    case "contains": return typeof fieldVal === "string" && fieldVal.includes(value);
    case "gt": return Number(fieldVal) > Number(value);
    case "lt": return Number(fieldVal) < Number(value);
    case "gte": return Number(fieldVal) >= Number(value);
    case "lte": return Number(fieldVal) <= Number(value);
    case "exists": return fieldVal !== undefined;
    default: die(`unknown op: ${op} (eq ne contains gt lt gte lte exists)`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const [cmd, file, ...rest] = args._;
  if (!cmd || !file) die("usage: state.mjs <read|filter|tail|append|upsert> <file> ...");
  const path = resolveFile(file);

  if (cmd === "read") {
    const arr = loadArray(path);
    const key = detectKey(arr, args.key);
    const keyval = rest[0];
    if (keyval === undefined) die("read: missing <keyval>");
    const hit = arr.find((x) => String(x[key]) === keyval);
    if (!hit) die(`no item with ${key}=${keyval} in ${file}`, 1);
    console.log(JSON.stringify(hit, null, 2));
    return;
  }

  if (cmd === "filter") {
    const arr = loadArray(path);
    const [field, op, value] = rest;
    if (!field || !op) die("filter: usage <file> <field> <op> <value>");
    const hits = arr.filter((x) => matchOp(x[field], op, value));
    console.log(JSON.stringify(hits, null, 2));
    console.error(`${hits.length} of ${arr.length} match ${field} ${op} ${value ?? ""}`);
    return;
  }

  if (cmd === "tail") {
    const arr = loadArray(path);
    const n = rest[0] ? Number(rest[0]) : 5;
    console.log(JSON.stringify(arr.slice(-n), null, 2));
    return;
  }

  if (cmd === "append" || cmd === "upsert") {
    const arr = loadArray(path);
    const key = detectKey(arr, args.key);
    const item = loadItem(rest[0] ?? die("append/upsert: missing @item.json|'<json>'"));
    showPolicies(item);
    if (cmd === "upsert") {
      if (!(key in item)) die(`upsert: item has no key field "${key}"`, 2);
      const idx = arr.findIndex((x) => String(x[key]) === String(item[key]));
      if (idx >= 0) { arr[idx] = item; saveArray(path, arr); console.log(`replaced ${key}=${item[key]} in ${file}`); return; }
      arr.push(item); saveArray(path, arr); console.log(`appended ${key}=${item[key]} to ${file} (no prior match)`); return;
    }
    arr.push(item); saveArray(path, arr); console.log(`appended to ${file} (now ${arr.length} items)`); return;
  }

  die(`unknown command: ${cmd}`);
}

main();
