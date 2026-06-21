#!/usr/bin/env node
// verify-decomposed.mjs — deterministic losslessness gate for the decomposition phase.
//
// The trust anchor for outsourcing decompose-* scripts to subagents: it PROVES
// each output is a lossless line-level re-encoding of its source section, rather
// than trusting a writer's self-report. Zero-diff or it fails (exit 1).
//
// Per output it asserts, against a manifest entry:
//   FORWARD  — every captured element's `.raw` is an EXACT line in the source
//              section (modulo the leading list marker the parser strips). No
//              mutation, no fabrication, no paraphrase survives this.
//   REVERSE  — every source line in [section..next-section) that matches the
//              item-line pattern is captured by exactly one element. No drops,
//              no double-counts.
//   SHAPE    — every element's top-level keys are within the declared field set
//              (no smuggled-in fields); declared required keys are present.
//
// Lines the parser legitimately does not turn into items (blank lines, the
// section heading, sub-headers folded into a parent item, framing prose folded
// into a `notes`/`section-notes` element) are accounted for by the manifest's
// `itemLinePattern` (only matching lines are owed an element) plus an optional
// `notesText` collector for folded prose. A source item-line owed but uncaptured
// is a DROP; a captured raw not present in source is a MUTATION. Either fails.
//
// Usage:
//   node verify-decomposed.mjs            # verify every manifest entry
//   node verify-decomposed.mjs <output>   # verify one output basename
//
// Exit 0 = all verified zero-diff; exit 1 = any divergence (details printed).

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const DECOMPOSED = resolve(REPO_ROOT, "context-migration", "decomposed");
const MANIFESTS_DIR = resolve(REPO_ROOT, "context-migration", "manifests");

// ── Manifest (one JSON fragment per output under context-migration/manifests/) ─
// Each fragment is one manifest entry. Fragments (not a shared inline array) so
// parallel subagents each drop their own file with zero merge collision. Fields:
//   output            output filename under decomposed/
//   source            source MD path relative to repo root
//   section           heading line that opens the captured section (null/omitted = whole file)
//   sectionEndPrefix  prefix that closes the section (default "## "); null = EOF
//   itemLinePattern   regex SOURCE STRING matched against source lines to identify owed items
//   itemLineFlags     optional regex flags for itemLinePattern (default "")
//   rawStrip          regex SOURCE STRING stripped from a source line before comparing
//                     to .raw (the leading list marker the parser removes); default "^- "
//   arrayPath         dot path to the element array inside the JSON (default = the
//                     sole top-level array)
//   fields            allowed top-level element keys
//   required          required top-level element keys
//   foldsRaw          true if some elements legitimately hold MULTIPLE source
//                     lines or carry non-item lines (e.g. STATE pending-actions
//                     children + section-notes). When true, REVERSE matches a
//                     source item-line if it appears as ANY element's raw OR any
//                     child raw OR any notes raw; FORWARD allows element.raw to be
//                     a multi-line block whose first line is the item-line.
//
// Regex fields are JSON strings (JSON cannot hold regex literals) compiled here.
function loadManifest() {
  let files;
  try {
    files = readdirSync(MANIFESTS_DIR).filter((f) => f.endsWith(".json")).sort();
  } catch (e) {
    console.error(`Cannot read manifests dir ${MANIFESTS_DIR}: ${e.message}`);
    process.exit(2);
  }
  const entries = [];
  for (const f of files) {
    const raw = JSON.parse(readFileSync(resolve(MANIFESTS_DIR, f), "utf8"));
    raw.itemLinePattern = new RegExp(raw.itemLinePattern, raw.itemLineFlags ?? "");
    raw.rawStrip = new RegExp(raw.rawStrip ?? "^- ");
    raw.section = raw.section ?? null;
    // Optional: lines intentionally NOT turned into elements (section sub-headers,
    // table header/delimiter, framing prose the parser deliberately omits). Must
    // be declared explicitly so every non-capture is a visible decision, never a
    // silent drop. Anything non-blank, non-captured, non-ignored fails COVERAGE.
    if (raw.ignoreLinePattern) raw.ignoreLinePattern = new RegExp(raw.ignoreLinePattern, raw.ignoreLineFlags ?? "");
    entries.push(raw);
  }
  return entries;
}
const MANIFEST = loadManifest();

function sliceSection(lines, entry) {
  if (!entry.section) return { lines, offset: 0 };
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(entry.section)) { start = i + 1; break; }
  }
  if (start < 0) return null;
  const endPrefix = entry.sectionEndPrefix === undefined ? "## " : entry.sectionEndPrefix;
  let end = lines.length;
  if (endPrefix !== null) {
    for (let i = start; i < lines.length; i++) {
      if (lines[i].startsWith(endPrefix)) { end = i; break; }
    }
  }
  return { lines: lines.slice(start, end), offset: start };
}

function getArray(json, entry) {
  if (entry.arrayPath) {
    return entry.arrayPath.split(".").reduce((o, k) => o?.[k], json);
  }
  if (Array.isArray(json)) return json;
  const key = Object.keys(json).find((k) => Array.isArray(json[k]));
  return key ? json[key] : null;
}

// Collect every `raw` string an element legitimately owns (its own raw, plus
// children/notes raws when foldsRaw), as a flat list of source-line strings.
function collectRaws(el, entry) {
  const out = [];
  if (typeof el.raw === "string") out.push(el.raw);
  if (entry.foldsRaw) {
    if (Array.isArray(el.children)) for (const c of el.children) if (typeof c.raw === "string") out.push(c.raw);
    if (Array.isArray(el.notes)) for (const n of el.notes) if (typeof n.raw === "string") out.push(n.raw);
  }
  return out;
}

function verifyEntry(entry) {
  const problems = [];
  // Single source (entry.source) OR multi-source (entry.sources: array of paths
  // — for an output decomposed from many files collapsed to one basename, e.g.
  // the 16 phase-*.md → phase.*). For multi-source, every file is sliced by the
  // same section rule and the in-section lines are CONCATENATED into one corpus;
  // forward/coverage then run against the union, so an element from any of the
  // files validates, and every line of every file must be captured.
  const sourcePaths = Array.isArray(entry.sources) ? entry.sources : [entry.source];
  let secLines = [];
  for (const sp of sourcePaths) {
    const sLines = readFileSync(resolve(REPO_ROOT, sp), "utf8").split("\n");
    const s = sliceSection(sLines, entry);
    if (!s) return [`section not found in ${sp}: ${entry.section}`];
    secLines = secLines.concat(s.lines);
  }
  const sec = { lines: secLines, offset: 0 };

  const json = JSON.parse(readFileSync(resolve(DECOMPOSED, entry.output), "utf8"));
  const arr = getArray(json, entry);
  if (!Array.isArray(arr)) return [`no element array found in ${entry.output}`];

  const rawStrip = entry.rawStrip ?? /^- /;

  // Index of source item-lines (the lines that are OWED an element). FENCE-AWARE:
  // a line matching itemLinePattern INSIDE a fenced code block (``` … ```) is code
  // content, not a structural list item — the parsers capture it verbatim inside a
  // code element's raw (proven by COVERAGE), so it must not be owed its own element.
  // Counting it would false-positive reverse/drop. Skip lines while inside a fence.
  const owed = new Map(); // normalized source line -> count
  const owedOrder = [];
  let inFence = false;
  for (const line of sec.lines) {
    if (line.startsWith("```")) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (entry.itemLinePattern.test(line)) {
      const norm = line.replace(rawStrip, "");
      owed.set(norm, (owed.get(norm) ?? 0) + 1);
      owedOrder.push(norm);
    }
  }

  // Index of all source lines in-section (for FORWARD existence of every raw,
  // including folded child/notes lines which are not item-lines themselves).
  const inSection = new Set(sec.lines.map((l) => l));
  const inSectionStripped = new Set(sec.lines.map((l) => l.replace(rawStrip, "")));

  // FORWARD + SHAPE
  const captured = new Map(); // normalized first-line -> count
  for (let i = 0; i < arr.length; i++) {
    const el = arr[i];
    // SHAPE
    const keys = Object.keys(el);
    const extra = keys.filter((k) => !entry.fields.includes(k));
    if (extra.length) problems.push(`[shape] element ${i} has undeclared keys: ${extra.join(", ")}`);
    for (const r of entry.required) if (!(r in el)) problems.push(`[shape] element ${i} missing required key: ${r}`);

    // FORWARD: every owned raw line must exist verbatim in the section.
    for (const raw of collectRaws(el, entry)) {
      const firstLine = raw.split("\n")[0];
      const present = inSection.has(firstLine) || inSectionStripped.has(firstLine) || inSection.has(raw) || inSectionStripped.has(raw);
      if (!present) {
        problems.push(`[forward/mutation] element ${i} raw not found verbatim in source section: ${JSON.stringify(firstLine.slice(0, 80))}`);
      }
    }

    // Record this element's claim on an owed item-line. An element claims an
    // item-line only when its raw's FIRST line is itself an item-line (matches
    // itemLinePattern). Block-parser outputs legitimately contain elements whose
    // first line is NOT an item-line (a prose paragraph, a section heading); those
    // do not claim and are not bookkept here — their losslessness is proven by
    // FORWARD (verbatim in source) + COVERAGE (every source line captured) below,
    // which together are the complete proof. The section-notes collector (folded
    // framing prose, no item-line of its own) likewise does not claim.
    if (typeof el.raw === "string" && el.kind !== "section-notes") {
      const firstSrcLine = el.raw.split("\n")[0];
      // Re-attach the rawStrip-removed marker is unnecessary: owed keys are the
      // source item-lines with rawStrip applied, and el.raw stores the line with
      // the same marker already stripped by the parser, so compare directly.
      const isItemLine = entry.itemLinePattern.test(firstSrcLine) || owed.has(firstSrcLine);
      if (isItemLine) {
        captured.set(firstSrcLine, (captured.get(firstSrcLine) ?? 0) + 1);
      }
    }
  }

  // REVERSE (item-line count guard): every owed source item-line is captured
  // exactly once. Guards the table/list outputs against a dropped or duplicated
  // ROW. reverse/extra is intentionally absent: a captured raw that is not an
  // owed item-line is not a defect — FORWARD proves it exists verbatim in source
  // and COVERAGE proves every source line is captured, so an "extra" can only be
  // a legitimately-folded prose/heading line, never a fabrication.
  for (const [norm, n] of owed) {
    const c = captured.get(norm) ?? 0;
    if (c < n) problems.push(`[reverse/drop] source item-line not captured: ${JSON.stringify(norm.slice(0, 80))}`);
    if (c > n) problems.push(`[reverse/dup] source item-line captured ${c}x (source has ${n}): ${JSON.stringify(norm.slice(0, 80))}`);
  }

  // COVERAGE (total-line): every non-blank source line in-section must be
  // represented by SOME element's raw (own/children/notes), or match the
  // manifest's declared ignoreLinePattern. This is the check that makes silent
  // drops impossible independent of itemLinePattern — a line that is neither
  // captured nor explicitly declared-ignorable is an uncaptured DROP. (A weak
  // gate that only round-trips flagged item-lines passes vacuously when the
  // pattern matches nothing; this does not.)
  const capturedLines = new Set();
  for (const el of arr) {
    for (const raw of collectRaws(el, entry)) {
      for (const ln of raw.split("\n")) {
        capturedLines.add(ln);
        capturedLines.add(ln.replace(rawStrip, ""));
      }
    }
  }
  const ignoreRe = entry.ignoreLinePattern ?? null;
  for (const line of sec.lines) {
    if (line.trim() === "") continue;
    if (ignoreRe && ignoreRe.test(line)) continue;
    if (capturedLines.has(line) || capturedLines.has(line.replace(rawStrip, ""))) continue;
    problems.push(`[coverage/uncaptured] non-blank source line neither captured nor declared-ignorable: ${JSON.stringify(line.slice(0, 90))}`);
  }

  return problems;
}

function main() {
  const only = process.argv[2];
  const entries = only ? MANIFEST.filter((e) => e.output === only) : MANIFEST;
  if (only && entries.length === 0) {
    console.error(`No manifest entry for output: ${only}`);
    process.exit(2);
  }
  let failed = 0;
  for (const entry of entries) {
    let problems;
    try {
      problems = verifyEntry(entry);
    } catch (e) {
      problems = [`exception: ${e.message}`];
    }
    const srcLabel = Array.isArray(entry.sources)
      ? `${entry.sources.length} sources (${entry.sources[0]} … ${entry.sources[entry.sources.length - 1]})`
      : entry.source;
    if (problems.length === 0) {
      console.log(`PASS  ${entry.output}  (lossless vs ${srcLabel}${entry.section ? " §" + entry.section.replace(/^#+ /, "") : ""})`);
    } else {
      failed++;
      console.log(`FAIL  ${entry.output}  (${problems.length} problems)`);
      for (const p of problems) console.log(`        ${p}`);
    }
  }
  console.log(`\n${entries.length - failed}/${entries.length} outputs verified lossless.`);
  process.exit(failed ? 1 : 0);
}

main();
