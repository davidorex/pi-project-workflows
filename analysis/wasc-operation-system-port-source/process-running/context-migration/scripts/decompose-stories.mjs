#!/usr/bin/env node
// decompose-stories.mjs — decomposition script #4 of the context-migration plan
// (context-migration/2026-05-30-context-migration-scripts.md).
//
// Source : phases/US-STATUS.md   (the user-story status tracker)
// Output : context-migration/decomposed/US-STATUS.json   (one JSON array; one element per story)
//          Output basename == source basename (1:1 source↔output correspondence).
//
// Structure (surveyed 2026-05-31): the "## Table" section is a single GitHub
// markdown table. Row 1 is the header `| US | Description (one-line) | Enabling
// phase | Vivifying commit | Status |`; row 2 is the `|---|---|...` delimiter;
// every subsequent `| ... |` row is one story. 104 story rows (US-1..US-22 with
// the US-16a..h sub-letters, US-ext, US-ext-milestone, US-ORG-1..20, US-ONB-1..5,
// US-UI-1..13, US-LLM-1..27, US-REV-1..5, US-DRAFT-1..3).
//
// Per the plan's per-script contract:
//   1. Reads ONE source MD (whole file; US-STATUS is ~128 lines, no pagination)
//   2. Parses its structure: the pipe-delimited table rows under "## Table"
//   3. Emits ONE JSON array file to decomposed/
//   4. Each element mirrors the source columns; a `raw` field preserves the
//      original row verbatim so the re-encoding is lossless (spec: "structural
//      re-encoding, not a summary")
//   5. Reports: items_parsed / arrays_written / errors
//   6. Never reads other MDs, never writes to .context, never modifies the source
//
// Field model per story (faithful to the SOURCE shape, not a consumption schema):
//   id        the `US` cell verbatim (e.g. "US-1", "US-16a", "US-ext-milestone")
//   description the "Description (one-line)" cell, trimmed
//   enabling_phase the "Enabling phase" cell, trimmed (free prose; may carry
//                  inline backtick SHAs/refs — kept verbatim, not parsed)
//   vivifying_commit the "Vivifying commit" cell, trimmed; the source em-dash
//                  placeholder "—" is kept as-is (a pending row's literal value)
//   status    the "Status" cell, trimmed (pending | enabled | vivified)
//   raw       the original table row line, untouched (the leading "| " is the
//             list marker the gate strips via rawStrip; lossless anchor)
//
// NOTE (no fabrication, mandate-002): the cells are emitted verbatim. The
// vivifying_commit "—" placeholder is NOT normalized to null and inline-backtick
// SHAs in enabling_phase/vivifying_commit are NOT stripped — that classification
// is consumption-phase work, recorded in the mapping note. The `id` cell is the
// faithful key; no zero-pad or re-key is applied.

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const SOURCE = resolve(REPO_ROOT, "phases", "US-STATUS.md");
const OUT_DIR = resolve(REPO_ROOT, "context-migration", "decomposed");
const OUT_FILE = resolve(OUT_DIR, "US-STATUS.json");

const TABLE_HEADING = "## Table";

// A data row of the table: opens with "| " and is neither the header row nor the
// "|---|" delimiter row. We slice the "## Table" section first, then filter.
const ROW_RE = /^\| /;
// The header row begins exactly "| US |".
const HEADER_RE = /^\| US \|/;
// The delimiter row is all dashes/pipes/colons/space.
const DELIM_RE = /^\|[\s\-:|]+\|$/;

// Split a markdown table row "| a | b | c |" into its trimmed cell values.
// Leading and trailing pipes are removed, then split on the interior pipes.
function splitCells(row) {
  // strip the single leading "| " and single trailing " |" then split on " | "
  const inner = row.replace(/^\|\s?/, "").replace(/\s?\|\s*$/, "");
  return inner.split(" | ").map((c) => c.trim());
}

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

  // Slice strictly between "## Table" and the next "## " heading.
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(TABLE_HEADING)) { start = i + 1; break; }
  }
  const errors = [];
  if (start < 0) {
    console.error(JSON.stringify({ items_parsed: 0, arrays_written: 0, errors: 1, detail: `section not found: ${TABLE_HEADING}` }));
    process.exitCode = 1;
    return;
  }
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) { end = i; break; }
  }
  const section = lines.slice(start, end);

  const stories = [];
  for (const line of section) {
    if (!ROW_RE.test(line)) continue;       // blank lines, stray prose
    if (HEADER_RE.test(line)) continue;     // the column-header row
    if (DELIM_RE.test(line)) continue;      // the |---|---| delimiter row

    const cells = splitCells(line);
    // The header declares 5 columns: US | Description | Enabling phase |
    // Vivifying commit | Status. One source row is genuinely irregular: the
    // `US-ext` row carries only 4 cells because its Vivifying-commit column is
    // empty (the two SHAs live inline in the Enabling-phase prose, and the row
    // omits the separate commit cell entirely). The cell SPLIT on " | " yields
    // 4 fields for that row. To capture it losslessly rather than drop it, map
    // positionally with INVARIANTS: cell[0] is always the id, the LAST cell is
    // always the status; the cells between fill description / enabling_phase /
    // vivifying_commit left-to-right, and a missing vivifying_commit becomes "".
    // `raw` keeps the full source row verbatim regardless, so nothing is lost.
    if (cells.length < 4) {
      errors.push({ reason: "fewer than 4 cells", raw: line });
      continue;
    }
    const id = cells[0];
    const status = cells[cells.length - 1];
    const middle = cells.slice(1, cells.length - 1); // description..vivifying_commit
    const description = middle[0] ?? "";
    const enabling_phase = middle[1] ?? "";
    const vivifying_commit = middle[2] ?? ""; // "" when the row omits the column (US-ext)
    stories.push({
      id,
      description,
      enabling_phase,
      vivifying_commit,
      status,
      raw: line,
    });
  }

  // Internal-consistency guard: ids should be unique.
  const seen = new Set();
  for (const s of stories) {
    if (seen.has(s.id)) errors.push(`duplicate id: ${s.id}`);
    seen.add(s.id);
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(stories, null, 2) + "\n", "utf8");

  console.error(JSON.stringify({
    source: "phases/US-STATUS.md",
    output: "context-migration/decomposed/US-STATUS.json",
    items_parsed: stories.length,
    by_status: {
      pending: stories.filter((s) => s.status === "pending").length,
      enabled: stories.filter((s) => s.status === "enabled").length,
      vivified: stories.filter((s) => s.status === "vivified").length,
    },
    arrays_written: 1,
    errors: errors.length,
    ...(errors.length ? { error_detail: errors } : {}),
  }, null, 2));
}

main();
