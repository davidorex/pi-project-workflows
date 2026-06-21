#!/usr/bin/env node
// decompose-discs.mjs — decomposition script #5 of the context-migration plan
// (context-migration/2026-05-30-context-migration-scripts.md).
//
// Source : phases/discoveries.md   (the append-only cross-phase DISC memory)
// Output : context-migration/decomposed/discoveries.json   (one JSON array; one element per DISC row)
//          Output basename == source basename (1:1 source↔output correspondence).
//
// Per the plan's per-script contract:
//   1. Reads ONE source MD (whole file; ~46 lines, no pagination needed)
//   2. Parses its structure: a single GitHub-flavoured markdown TABLE. Each DISC is
//      one `| ... |` row whose first cell is a `DISC-...` id. The header row and the
//      `|---|---|...` separator row are NOT DISC rows and are skipped.
//   3. Emits ONE JSON array file to decomposed/
//   4. Each element mirrors the source's nine declared columns
//      (id | phase | iso_ts | category | summary | concerns | action_taken |
//       downstream_impact | resolved_by — the row format documented at the top of
//      the source). A `raw` field preserves the original row verbatim (only the
//      leading "| " table marker stripped) so the re-encoding is lossless
//      (spec: "structural re-encoding, not a summary").
//   5. Reports: items_parsed / arrays_written / errors
//   6. Never reads other MDs, never writes to .context, never modifies the source
//
// Field model per DISC (faithful to the SOURCE table shape, not any consumption schema):
//   id                 first column ("DISC-NN-MMDD-X")
//   phase              second column (phase number(s) as a string, faithful)
//   iso_ts             third column (ISO-8601 Asia/Shanghai timestamp string)
//   category           fourth column (one of the documented category enum strings)
//   summary            fifth column (prose blob)
//   concerns           sixth column (prose blob)
//   action_taken       seventh column (prose blob)
//   downstream_impact  eighth column (phase list / prose, faithful as a string)
//   resolved_by        ninth column ("" when unresolved; commit-sha + prose when filled)
//   raw                the original row with the leading "| " stripped (lossless anchor)
//
// COLUMN SPLITTING NOTE: cells are split on the markdown cell delimiter " | "
// (space-pipe-space), after stripping the row's leading "| " and trailing " |"
// boundary markers. 27 of the 28 DISC rows split cleanly into the nine columns.
// ONE row (DISC-27-0529-A) carries a literal " | " inside its prose body — an
// in-cell pipe that the GitHub-table renderer tolerates (it is not an escaped
// "\|", just an unescaped pipe with surrounding spaces inside a cell). A naive
// per-pipe split over-segments that row into ten fields. Rather than DROP the row
// (a losslessness failure) or guess which prose column the stray pipe belongs to
// (unknowable from structure alone), the parser maps the first eight " | " fields
// to the first eight columns and joins any overflow (fields 9..N) back with " | "
// into the ninth column (resolved_by). For DISC-27 the stray pipe lives in the
// resolved_by blob, so this rejoin reconstructs that cell's text verbatim; for any
// future stray-pipe row it keeps the row captured and the verbatim source line in
// `raw` (the gate's losslessness anchor). Per-column attribution of a stray pipe
// that lands in an EARLIER prose column would be approximate, which is recorded as
// a per-row note in the run report; `raw` remains exact regardless.
//
// DELIBERATELY NOT DONE (mandate-002 / spec "never invent data not in source"):
// no mapping onto a target .context schema, no normalization of the phase /
// downstream_impact lists into arrays, no parsing of the resolved_by commit SHA out
// of its prose. The source carries these as free-text cells; splitting them into
// discrete typed fields would be a consumption-phase determination, recorded in the
// mapping note, not fabricated here.

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const SOURCE = resolve(REPO_ROOT, "phases", "discoveries.md");
const OUT_DIR = resolve(REPO_ROOT, "context-migration", "decomposed");
const OUT_FILE = resolve(OUT_DIR, "discoveries.json");

// The nine declared columns, in source order (the documented row format).
const COLUMNS = [
  "id",
  "phase",
  "iso_ts",
  "category",
  "summary",
  "concerns",
  "action_taken",
  "downstream_impact",
  "resolved_by",
];

// A DISC row: a table row whose first non-empty cell begins with "DISC-".
// Matched against the whole line; the header row (first cell "id") and the
// separator row (cells of dashes) do not satisfy this.
const DISC_ROW_RE = /^\|\s*DISC-/;

// Split a markdown table row "| a | b | c |" into its N logical cells on the
// " | " cell delimiter, after stripping the leading "| " and trailing " |"
// boundary markers. Returns the array of trimmed cell strings (length may exceed
// COLUMNS.length when a cell carries an in-cell " | "; the caller folds overflow).
const ROW_DELIM = " | ";
function splitRow(line) {
  let s = line;
  if (s.startsWith("| ")) s = s.slice(2);
  if (s.endsWith(" |")) s = s.slice(0, -2);
  return s.split(ROW_DELIM).map((c) => c.trim());
}

// Map raw cell fields onto the nine declared columns. When the field count
// exceeds the column count (an in-cell " | "), the surplus is rejoined with the
// delimiter into the final column so the row is captured losslessly rather than
// dropped. Returns { columns, folded } where folded is true if a fold happened.
function foldToColumns(cells) {
  const n = COLUMNS.length;
  if (cells.length <= n) {
    return { columns: cells, folded: false };
  }
  const head = cells.slice(0, n - 1);
  const tail = cells.slice(n - 1).join(ROW_DELIM);
  return { columns: [...head, tail], folded: true };
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
  const discs = [];
  const errors = [];

  const folded = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!DISC_ROW_RE.test(line)) continue; // header, separator, prose, blanks
    const rawCells = splitRow(line);
    if (rawCells.length < COLUMNS.length) {
      // Fewer cells than columns is a genuine structural defect (a missing
      // delimiter), not the tolerated in-cell-pipe overflow case — report it.
      errors.push({
        line: i + 1,
        reason: `expected ${COLUMNS.length} cells, got ${rawCells.length} (missing delimiter?)`,
        raw: line,
      });
      continue;
    }
    const { columns, folded: didFold } = foldToColumns(rawCells);
    const el = {};
    for (let c = 0; c < COLUMNS.length; c++) el[COLUMNS[c]] = columns[c];
    // raw = the original row with the leading "| " table marker stripped, so the
    // verify gate's rawStrip (^\| ) recovers an exact in-source line match.
    el.raw = line.replace(/^\| /, "");
    discs.push(el);
    if (didFold) {
      folded.push({
        line: i + 1,
        id: el.id,
        cells_observed: rawCells.length,
        note: "in-cell ' | ' folded into final column (resolved_by); raw is verbatim",
      });
    }
  }

  if (discs.length === 0) errors.push("no DISC rows parsed (table shape changed?)");

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(discs, null, 2) + "\n", "utf8");

  console.error(JSON.stringify({
    source: "phases/discoveries.md",
    output: "context-migration/decomposed/discoveries.json",
    items_parsed: discs.length,
    resolved: discs.filter((d) => d.resolved_by !== "").length,
    unresolved: discs.filter((d) => d.resolved_by === "").length,
    arrays_written: 1,
    folded_rows: folded.length,
    ...(folded.length ? { folded_detail: folded } : {}),
    errors: errors.length,
    ...(errors.length ? { error_detail: errors } : {}),
  }, null, 2));
}

main();
