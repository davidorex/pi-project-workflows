#!/usr/bin/env node
// decompose-mandates.mjs — decomposition script #9 of the context-migration plan
// (context-migration/2026-05-30-context-migration-scripts.md).
//
// Source : MANDATES.md   (repo root; the 9 binding mandates)
// Output : context-migration/decomposed/MANDATES.json   (one JSON array; one element per mandate)
//          Output basename == source basename (1:1 source↔output correspondence).
//
// Per the plan's per-script contract:
//   1. Reads ONE source MD (whole file; MANDATES.md is ~57 lines, no pagination)
//   2. Parses its structure: each mandate is a "## mandate-NNN — Title" heading,
//      followed (after a blank line) by a one-line body, a blank line, and a
//      "Tags: a, b." line. The structure is homogeneous across all 9 mandates.
//   3. Emits ONE JSON array file to decomposed/
//   4. Each element mirrors the SOURCE fields; a `raw` field holds the mandate's
//      full multi-line source block verbatim (heading + body + tags) so the
//      re-encoding is lossless (spec: "structural re-encoding, not a summary").
//   5. Reports: items_parsed / arrays_written / errors
//   6. Never reads other MDs, never writes to .context, never modifies the source
//
// Field model per mandate (faithful to the SOURCE shape, not a future schema):
//   id     "mandate-NNN" (the zero-padded id token from the heading)
//   num    NNN as integer (enables numeric sort independent of array order)
//   title  the heading text after the em-dash ("— ", U+2014)
//   body   the body prose line(s) between the heading and the "Tags:" line,
//          joined by "\n" when multi-line; "" when none present
//   tags   array of tag tokens parsed from the "Tags: a, b." line (trailing
//          period stripped, comma-split, trimmed); [] when no tags line
//   raw    the mandate's full source block (heading through the tags line, blank
//          interior lines preserved), with the leading "## " list/heading marker
//          stripped from the FIRST line only — mirroring the reference scripts'
//          policy of storing `raw` minus the marker the parser removes. Every
//          other character is verbatim, so the re-encoding stays lossless.
//
// The gate (verify-decomposed.mjs) runs with foldsRaw:true and rawStrip "^## " on
// this output: REVERSE normalizes each owed source heading by stripping "## ",
// and captured keys off el.raw's first line (already marker-stripped here) — the
// two match. FORWARD asserts that first line exists in the marker-stripped source
// view. The manifest's itemLinePattern "^## mandate-" owes exactly one element
// per heading. The full multi-line raw preserves every body/tags line losslessly.

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const SOURCE = resolve(REPO_ROOT, "MANDATES.md");
const OUT_DIR = resolve(REPO_ROOT, "context-migration", "decomposed");
const OUT_FILE = resolve(OUT_DIR, "MANDATES.json");

// A mandate heading: "## mandate-<NNN> — <title>". Em-dash is U+2014.
const HEADING_RE = /^## mandate-(\d+) — (.*)$/;
// The tags line: "Tags: <list>."
const TAGS_RE = /^Tags:\s*(.*)$/;

async function main() {
  let raw;
  try {
    raw = await readFile(SOURCE, "utf8");
  } catch (e) {
    console.error(JSON.stringify({ items_parsed: 0, arrays_written: 0, errors: 1, detail: `read failed: ${e.message}` }));
    process.exitCode = 1;
    return;
  }

  const lines = raw.split("\n");
  const mandates = [];
  const errors = [];

  // Find the start index of each mandate heading; a mandate spans from its
  // heading up to (but excluding) the next mandate heading or EOF.
  const heads = [];
  for (let i = 0; i < lines.length; i++) {
    const m = HEADING_RE.exec(lines[i]);
    if (m) heads.push({ i, num: m[1], title: m[2].trim() });
  }

  for (let h = 0; h < heads.length; h++) {
    const { i, num, title } = heads[h];
    const end = h + 1 < heads.length ? heads[h + 1].i : lines.length;
    // The block is [i, end); trim trailing blank lines that belong to the gap
    // before the next heading so `raw` ends on the tags line.
    let blockEnd = end;
    while (blockEnd > i + 1 && lines[blockEnd - 1].trim() === "") blockEnd -= 1;
    const block = lines.slice(i, blockEnd);
    // Strip the leading "## " heading marker from the first line only, mirroring
    // the reference scripts' rawStrip policy (and matching the gate's rawStrip).
    const rawBlock = [block[0].replace(/^## /, ""), ...block.slice(1)].join("\n");

    // Parse body (lines between heading and the Tags: line, excluding blanks at
    // the seams) and the tags line.
    let tags = [];
    const bodyLines = [];
    for (let k = 1; k < block.length; k++) {
      const tm = TAGS_RE.exec(block[k]);
      if (tm) {
        tags = tm[1]
          .replace(/\.\s*$/, "") // strip trailing period
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        continue;
      }
      if (block[k].trim() !== "") bodyLines.push(block[k]);
    }
    const body = bodyLines.join("\n");

    if (!body) errors.push(`mandate-${num}: empty body`);

    mandates.push({
      id: `mandate-${num}`,
      num: Number(num),
      title,
      body,
      tags,
      raw: rawBlock,
    });
  }

  if (mandates.length === 0) errors.push("no mandate headings matched");

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(mandates, null, 2) + "\n", "utf8");

  console.error(JSON.stringify({
    source: "MANDATES.md",
    output: "context-migration/decomposed/MANDATES.json",
    items_parsed: mandates.length,
    arrays_written: 1,
    errors: errors.length,
    ...(errors.length ? { error_detail: errors } : {}),
  }, null, 2));
}

main();
