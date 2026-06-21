#!/usr/bin/env node
// decompose-phases.mjs — decomposition script #10 of the context-migration plan
// (context-migration/2026-05-30-context-migration-scripts.md).
//
// Source : phases/phase-00-*.md … phases/phase-15-*.md   (16 dev-increment directives)
// Output : context-migration/decomposed/phase.phases.json       (lossless block capture)
//          context-migration/decomposed/phase.phase-tasks.json  (derived task index)
//
// Unique among the sources: 16 files collapse to one `phase` basename. Each file
// is the same heterogeneous markdown shape as the checklist (`##`/`###` headings,
// numbered steps, fenced code, prose), so the same BLOCK parser applies, run per
// file with every element tagged by its source `phase` file.
//
// TWO OUTPUTS, distinct roles:
//   phase.phases.json       — the LOSSLESS capture: every non-blank, non-`---`
//                             line of all 16 files as a kind-tagged element
//                             (section/code/list-item/prose) + `phase` provenance.
//                             This is what the gate verifies coverage-complete
//                             (manifest uses sources[]: all 16 files).
//   phase.phase-tasks.json  — a DERIVED index of the numbered implementation steps
//                             (kind=="list-item" whose first line is `N. …`), with
//                             phase + nearest-section context. It is a SUBSET of
//                             content already proven lossless in phase.phases.json,
//                             so it is intentionally NOT independently coverage-
//                             gated (gating it would double-count the same source
//                             lines under a second owed-set). Its trustworthiness
//                             derives from phase.phases.json's gate pass + the fact
//                             that it is computed from the same element array.
//
// Field model — phase.phases.json element:
//   seq    1-based order across all files (file order = phase-00..15)
//   phase  source file basename (e.g. "phase-00-foundation.md") — provenance
//   kind   section | code | list-item | prose
//   text   first line's content, leading marker stripped; multi-line joined "\n"
//   raw    block verbatim ("\n"-joined). Zero-loss anchor.
//
// Field model — phase.phase-tasks.json element:
//   seq, phase  as above (seq re-numbered 1-based across tasks)
//   num         the step's integer
//   section     nearest enclosing heading text at the task's position
//   text, raw   from the source list-item element (verbatim)
//
// FAITHFUL SHAPE ONLY (mandate-002): no consumption schema assumed.

import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const PHASES_DIR = resolve(REPO_ROOT, "phases");
const OUT_DIR = resolve(REPO_ROOT, "context-migration", "decomposed");
const OUT_PHASES = resolve(OUT_DIR, "phase.phases.json");
const OUT_TASKS = resolve(OUT_DIR, "phase.phase-tasks.json");

const HEADING_RE = /^#{1,6}\s+(.*)$/;
const NUM_ITEM_RE = /^(\d+)\.\s+(.*)$/;
const BULLET_RE = /^[-*]\s+(.*)$/;

function isTopLevelBoundary(line) {
  return (
    HEADING_RE.test(line) ||
    NUM_ITEM_RE.test(line) ||
    BULLET_RE.test(line) ||
    line.startsWith("```") ||
    line.trim() === "---"
  );
}

// Block-parse ONE file's lines into kind-tagged elements (no seq/phase yet).
function parseBlocks(lines) {
  const out = [];
  let prose = [];
  const flushProse = () => {
    if (prose.length) {
      const raw = prose.join("\n");
      out.push({ kind: "prose", text: raw, raw });
      prose = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") { flushProse(); continue; }
    if (line.trim() === "---") { flushProse(); continue; } // ignored (manifest-declared)

    if (line.startsWith("```")) {
      flushProse();
      const block = [line];
      let j = i + 1;
      while (j < lines.length && !lines[j].startsWith("```")) { block.push(lines[j]); j++; }
      if (j < lines.length) block.push(lines[j]);
      i = j;
      const raw = block.join("\n");
      out.push({ kind: "code", text: raw, raw });
      continue;
    }

    const h = HEADING_RE.exec(line);
    if (h) { flushProse(); out.push({ kind: "section", text: h[1].trim(), raw: line }); continue; }

    const num = NUM_ITEM_RE.exec(line);
    const bul = BULLET_RE.exec(line);
    if (num || bul) {
      flushProse();
      const block = [line];
      let j = i + 1;
      while (j < lines.length && !isTopLevelBoundary(lines[j])) { block.push(lines[j]); j++; }
      while (block.length > 1 && block[block.length - 1].trim() === "") block.pop();
      i = j - 1;
      const raw = block.join("\n");
      const firstText = num ? num[2] : bul[1];
      out.push({ kind: "list-item", text: [firstText, ...block.slice(1)].join("\n"), raw, _num: num ? Number(num[1]) : null });
      continue;
    }

    prose.push(line);
  }
  flushProse();
  return out;
}

async function main() {
  let files;
  try {
    files = (await readdir(PHASES_DIR)).filter((f) => /^phase-\d{2}-.*\.md$/.test(f)).sort();
  } catch (e) {
    console.error(JSON.stringify({ items_parsed: 0, arrays_written: 0, errors: 1, detail: `readdir failed: ${e.message}` }));
    process.exitCode = 1;
    return;
  }

  const phaseElements = [];
  const taskElements = [];
  let seq = 0;
  let taskSeq = 0;

  for (const f of files) {
    const src = await readFile(resolve(PHASES_DIR, f), "utf8");
    const blocks = parseBlocks(src.split("\n"));
    let nearestSection = null;
    for (const b of blocks) {
      seq += 1;
      if (b.kind === "section") nearestSection = b.text;
      phaseElements.push({ seq, phase: f, kind: b.kind, text: b.text, raw: b.raw });
      // Derived task index: numbered list-items only.
      if (b.kind === "list-item" && typeof b._num === "number") {
        taskSeq += 1;
        taskElements.push({ seq: taskSeq, phase: f, num: b._num, section: nearestSection, text: b.text, raw: b.raw });
      }
    }
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_PHASES, JSON.stringify(phaseElements, null, 2) + "\n", "utf8");
  await writeFile(OUT_TASKS, JSON.stringify(taskElements, null, 2) + "\n", "utf8");

  const byKind = {};
  for (const el of phaseElements) byKind[el.kind] = (byKind[el.kind] ?? 0) + 1;
  console.error(JSON.stringify({
    sources: `${files.length} phase-*.md files`,
    outputs: {
      "phase.phases.json": phaseElements.length,
      "phase.phase-tasks.json": taskElements.length,
    },
    by_kind: byKind,
    arrays_written: 2,
    errors: 0,
  }, null, 2));
}

main();
