#!/usr/bin/env node
// decompose-decs.mjs — decomposition script #3 of the context-migration plan
// (context-migration/2026-05-30-context-migration-scripts.md).
//
// Source : data/seed-round-plan.md   (the DEC log)
// Output : context-migration/decomposed/seed-round-plan.json   (one JSON array; one element per DEC)
//
// Structure (surveyed 2026-05-31): the "## Decisions log" section holds 45
// entries `- **DEC-N** — [**headline**] body [refs]`. Most are one line; SOME
// span multiple lines (continuation sub-lists / **bold** blocks indented under
// the DEC, e.g. DEC-17/20/21/31/32). An earlier version captured only the first
// line and silently dropped continuations — a real losslessness defect the
// hardened gate (total-line-coverage) exposes. This version folds each DEC's
// continuation lines (up to the next `- **DEC-N**` line) into raw + continuation.
//
// 18 lead with a bold **headline** after the em-dash (→ title); 27 go straight to
// prose (→ title null). Untitled are DEC-1..25 plus 27 and 28 (the early prose
// form); DEC-26 onward (except 27/28) lead with a bold headline.
//
// Field model per DEC (faithful to the SOURCE shape, not the consumption schema):
//   id            "DEC-N"
//   num           N (integer; numeric sort independent of array order)
//   title         the bold **headline** text if present, else null
//   body          remaining first-line prose after headline (or after "— " when
//                 untitled), trailing [refs] removed
//   refs          trailing [..]-bracket contents of the FIRST line (SHAs sans
//                 backticks, cross-refs, migration paths), comma-split, source order
//   continuation  array of the DEC's continuation lines VERBATIM ([] if none)
//   raw           full DEC block verbatim: first line de-marked ("- " stripped),
//                 then continuation lines, joined "\n". The zero-loss anchor.
//
// DELIBERATELY NOT DONE (mandate-002): body/continuation stay prose blobs; the
// script does NOT split them into the decisions schema's discrete
// context/decision/consequences fields — that is consumption-phase work, and
// doing it here would be fabrication. See the plan's Consumption-phase mapping notes.

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const SOURCE = resolve(REPO_ROOT, "data", "seed-round-plan.md");
const OUT_DIR = resolve(REPO_ROOT, "context-migration", "decomposed");
const OUT_FILE = resolve(OUT_DIR, "seed-round-plan.json");

// A DEC entry: "- **DEC-<n>** — <rest>". Em-dash is U+2014.
const DEC_RE = /^- \*\*DEC-(\d+)\*\* — (.*)$/;

// Peel a trailing run of [..] bracket groups off the (first-line) body end.
// Right-to-left across brackets, left-to-right within a bracket, backticks
// stripped, so refs come out in source order. Mirrors decompose-log.mjs.
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

function splitTitle(rest) {
  const m = /^\*\*(.+?)\*\*\s*(.*)$/.exec(rest);
  if (!m) return { title: null, body: rest.trim() };
  return { title: m[1].trim(), body: m[2].trim() };
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
  const decs = [];
  const errors = [];

  // Index every DEC start line; each DEC spans [start, nextStart).
  const starts = [];
  for (let i = 0; i < lines.length; i++) {
    if (DEC_RE.test(lines[i])) starts.push(i);
  }

  for (let d = 0; d < starts.length; d++) {
    const startIdx = starts[d];
    const endIdx = d + 1 < starts.length ? starts[d + 1] : lines.length;

    const m = DEC_RE.exec(lines[startIdx]);
    const num = Number(m[1]);

    // Continuation = lines after the first, up to the next DEC, trailing blanks
    // trimmed. The closing "(Append new decisions here ...)" line and the "---"
    // rule after the last DEC are NOT continuations (they belong to no DEC) —
    // they live past the last start only when endIdx===lines.length, so trim any
    // line that is not indented/standalone-DEC-body. We trim trailing blanks and
    // stop the last DEC's continuation at the first post-DEC framing line.
    let contEnd = endIdx;
    while (contEnd > startIdx + 1 && lines[contEnd - 1].trim() === "") contEnd--;
    let continuation = lines.slice(startIdx + 1, contEnd);
    // For the final DEC, drop trailing framing lines that are not part of it:
    // the "(Append new decisions here ...)" footer and the "---" rule. These are
    // declared-ignorable in the manifest, not owned by any DEC.
    if (d === starts.length - 1) {
      continuation = continuation.filter(
        (l) => !/^\(Append new decisions here/.test(l) && l.trim() !== "---"
      );
      // re-trim trailing blanks after the filter
      while (continuation.length && continuation[continuation.length - 1].trim() === "") continuation.pop();
    }

    const { head, refs } = splitTrailingRefs(m[2]);
    const { title, body } = splitTitle(head);
    const firstStripped = lines[startIdx].slice(2); // strip "- "
    const rawBlock = [firstStripped, ...continuation].join("\n");

    decs.push({ id: `DEC-${num}`, num, title, body, refs, continuation, raw: rawBlock });
  }

  // Internal-consistency guard: ids should be the contiguous run DEC-1..DEC-N.
  const nums = decs.map((x) => x.num);
  for (let k = 1; k <= nums.length; k++) {
    if (!nums.includes(k)) errors.push(`missing DEC-${k} (gap in 1..${nums.length})`);
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(decs, null, 2) + "\n", "utf8");

  console.error(JSON.stringify({
    source: "data/seed-round-plan.md",
    output: "context-migration/decomposed/seed-round-plan.json",
    items_parsed: decs.length,
    titled: decs.filter((x) => x.title !== null).length,
    untitled: decs.filter((x) => x.title === null).length,
    multiline: decs.filter((x) => x.continuation.length > 0).length,
    arrays_written: 1,
    errors: errors.length,
    ...(errors.length ? { error_detail: errors } : {}),
  }, null, 2));
}

main();
