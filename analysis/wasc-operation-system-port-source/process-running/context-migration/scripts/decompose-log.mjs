#!/usr/bin/env node
// decompose-log.mjs — decomposition script #1 of the context-migration plan
// (context-migration/2026-05-30-context-migration-scripts.md).
//
// Source : ORCHESTRATOR-LOG.md   (repo root; append-only event spine)
// Output : context-migration/decomposed/ORCHESTRATOR-LOG.json   (one JSON array; one element per event)
//          Output basename == source basename (1:1 source↔output correspondence).
//
// An event is a top-level list line `- <ISO-ts> · <type> · <text> · [refs]`
// OPTIONALLY followed by continuation lines (indented sub-bullets, `**bold**`
// blocks) up to the next event line. The whole block is one event. Earlier this
// parser captured only the first line and silently dropped continuations — a
// real losslessness defect the hardened gate (total-line-coverage) exposes.
//
// Field model per event:
//   seq           1-based position in the log (chronological = log order)
//   timestamp     leading ISO-8601 token (Asia/Shanghai, no offset in source)
//   type          first `·`-segment of the first line's body (canonical TYPE for
//                 early entries; a drifted headline later — captured faithfully)
//   text          remaining `·`-segments of the first line joined by " · "
//   refs          trailing [..]-bracket contents of the first line (SHAs sans
//                 backticks, doc arrows), comma-split within a bracket, source order
//   continuation  array of the event's continuation lines VERBATIM ([] if none)
//   raw           the full event block verbatim: first line with leading "- "
//                 stripped, then each continuation line, joined by "\n". The
//                 zero-loss anchor — every source line of the event lives here.
//
// The file header (title + preamble + the `---` rule) is framing prose, not an
// event; the manifest scopes the captured range to start AFTER the `---` so the
// header is an explicit, declared out-of-scope (not a silent drop).

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const SOURCE = resolve(REPO_ROOT, "ORCHESTRATOR-LOG.md");
const OUT_DIR = resolve(REPO_ROOT, "context-migration", "decomposed");
const OUT_FILE = resolve(OUT_DIR, "ORCHESTRATOR-LOG.json");

const SEP = " · "; // space, middot (U+00B7), space
const EVENT_PREFIX = "- ";
const EVENT_RE = /^- (\d{4}-\d{2}-\d{2}T\d{2}:\d{2})\b/;

// Peel a trailing run of [..] bracket groups off the body end (first line only).
// Right-to-left across brackets, left-to-right within a bracket, backticks
// stripped, so refs come out in source order. Mirrors decompose-decs.mjs.
function splitTrailingRefs(body) {
  const refs = [];
  let s = body;
  const trailing = /\s*\[([^\]]*)\]\s*$/;
  let m;
  while ((m = trailing.exec(s)) !== null) {
    const group = [];
    for (const part of m[1].trim().split(",")) {
      const t = part.trim().replace(/`/g, "");
      if (t) group.push(t);
    }
    refs.unshift(...group);
    s = s.slice(0, m.index);
  }
  return { head: s.replace(/\s+$/, ""), refs };
}

async function main() {
  let src;
  try {
    src = await readFile(SOURCE, "utf8");
  } catch (e) {
    console.error(JSON.stringify({ items_parsed: 0, arrays_written: 0, errors: 1, detail: `read failed: ${e.message}` }));
    process.exitCode = 1;
    return;
  }

  const lines = src.split("\n");
  const events = [];
  const errors = [];

  // Index every event start line; each event spans [start, nextStart).
  const starts = [];
  for (let i = 0; i < lines.length; i++) {
    if (EVENT_RE.test(lines[i])) starts.push(i);
  }

  for (let e = 0; e < starts.length; e++) {
    const startIdx = starts[e];
    const endIdx = e + 1 < starts.length ? starts[e + 1] : lines.length;
    const seq = e + 1;

    const firstLine = lines[startIdx];
    const timestamp = EVENT_RE.exec(firstLine)[1];

    // Continuation = lines after the first, up to the next event, with trailing
    // blank separator lines trimmed (blanks carry no content; coverage ignores
    // them, and trimming keeps `raw` to the event's actual body).
    let contEnd = endIdx;
    while (contEnd > startIdx + 1 && lines[contEnd - 1].trim() === "") contEnd--;
    const continuation = lines.slice(startIdx + 1, contEnd);

    // Parse the first line's body.
    const firstStripped = firstLine.slice(EVENT_PREFIX.length); // strip "- "
    const afterTs = firstStripped.slice(timestamp.length);
    const body = afterTs.startsWith(SEP) ? afterTs.slice(SEP.length) : afterTs.replace(/^\s*·?\s*/, "");
    const { head, refs } = splitTrailingRefs(body);
    const segments = head.split(SEP);
    const type = segments[0] ?? "";
    const text = segments.slice(1).join(SEP);
    if (!type) errors.push({ seq, line: startIdx + 1, reason: "empty type segment", raw: firstStripped });

    // raw = verbatim event block (first line de-marked, then continuations).
    const raw = [firstStripped, ...continuation].join("\n");

    events.push({ seq, timestamp, type, text, refs, continuation, raw });
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(events, null, 2) + "\n", "utf8");

  console.error(JSON.stringify({
    source: "ORCHESTRATOR-LOG.md",
    output: "context-migration/decomposed/ORCHESTRATOR-LOG.json",
    items_parsed: events.length,
    multiline_events: events.filter((e) => e.continuation.length > 0).length,
    arrays_written: 1,
    errors: errors.length,
    ...(errors.length ? { error_detail: errors } : {}),
  }, null, 2));
}

main();
