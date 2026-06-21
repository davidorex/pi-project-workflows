#!/usr/bin/env node
// decompose-checklist.mjs — decomposition script #8 of the context-migration plan
// (context-migration/2026-05-30-context-migration-scripts.md).
//
// Source : phases/PHASE-LAUNCH-CHECKLIST.md   (orchestrator operational procedure)
// Output : context-migration/decomposed/PHASE-LAUNCH-CHECKLIST.json   (one JSON array)
//
// The original step/convention parser captured only numbered steps + top-level
// bullets and dropped: the whole "## Post-IMPL cleanup patterns" section, the
// fenced bash code blocks + their rationale, the title, and all section-framing
// prose (adversary-confirmed). This is the same markdown BLOCK parser as
// decompose-preamble / decompose-source-gaps, extended with FENCED-CODE support:
// every non-blank, non-`---` line becomes part of exactly one kind-tagged element.
//
// Block kinds (by the first line of the block):
//   section      `#`..`######` heading (single line)
//   code         a standalone fenced block (a column-0 ``` … ```), captured verbatim
//   list-item    a top-level `N. …` step or `- …` bullet, PLUS its continuation up
//                to the next TOP-LEVEL boundary (heading / top-level item / column-0
//                fence / `---`). Continuation folds internal blank lines, indented
//                sub-items (e.g. item-2's `2a.`), and indented code fences (item-1's
//                DSN block) — so nothing between an item and the next boundary is lost.
//   prose        a paragraph: consecutive non-list, non-heading, non-fence, non-blank
//
// Ignored (manifest-declared, never silent): blank lines and `---` rules.
//
// Field model per element:
//   seq    1-based block order
//   kind   section | code | list-item | prose
//   text   first line's content with leading marker stripped (heading hashes /
//          "N. " / "- "); multi-line blocks join with "\n". For code/prose text==raw.
//   raw    the block verbatim (every source line, "\n"-joined). Zero-loss anchor.
//
// FAITHFUL SHAPE ONLY (mandate-002): no consumption schema assumed; the section
// grouping + step numbering live in the elements' text verbatim.

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const SOURCE = resolve(REPO_ROOT, "phases", "PHASE-LAUNCH-CHECKLIST.md");
const OUT_DIR = resolve(REPO_ROOT, "context-migration", "decomposed");
const OUT_FILE = resolve(OUT_DIR, "PHASE-LAUNCH-CHECKLIST.json");

const HEADING_RE = /^#{1,6}\s+(.*)$/;
const NUM_ITEM_RE = /^(\d+)\.\s+(.*)$/;
const BULLET_RE = /^[-*]\s+(.*)$/;

// Is `line` a TOP-LEVEL structural boundary that ends a list-item's continuation?
function isTopLevelBoundary(line) {
  return (
    HEADING_RE.test(line) ||
    NUM_ITEM_RE.test(line) ||
    BULLET_RE.test(line) ||
    line.startsWith("```") ||
    line.trim() === "---"
  );
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
  const elements = [];
  let seq = 0;

  let prose = [];
  const flushProse = () => {
    if (prose.length) {
      seq += 1;
      const raw = prose.join("\n");
      elements.push({ seq, kind: "prose", text: raw, raw });
      prose = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim() === "") { flushProse(); continue; }
    if (line.trim() === "---") { flushProse(); continue; } // ignored (manifest-declared)

    // Standalone (column-0) fenced code block.
    if (line.startsWith("```")) {
      flushProse();
      const block = [line];
      let j = i + 1;
      while (j < lines.length && !lines[j].startsWith("```")) { block.push(lines[j]); j++; }
      if (j < lines.length) { block.push(lines[j]); } // closing fence
      i = j;
      const raw = block.join("\n");
      seq += 1;
      elements.push({ seq, kind: "code", text: raw, raw });
      continue;
    }

    const h = HEADING_RE.exec(line);
    if (h) {
      flushProse();
      seq += 1;
      elements.push({ seq, kind: "section", text: h[1].trim(), raw: line });
      continue;
    }

    const num = NUM_ITEM_RE.exec(line);
    const bul = BULLET_RE.exec(line);
    if (num || bul) {
      flushProse();
      // Fold continuation up to the next TOP-LEVEL boundary (so internal blanks,
      // indented sub-items, and indented code fences all fold in). Trailing blank
      // lines are trimmed off the captured block.
      const block = [line];
      let j = i + 1;
      while (j < lines.length && !isTopLevelBoundary(lines[j])) { block.push(lines[j]); j++; }
      while (block.length > 1 && block[block.length - 1].trim() === "") block.pop();
      i = j - 1;
      const raw = block.join("\n");
      const firstText = num ? num[2] : bul[1];
      const text = [firstText, ...block.slice(1)].join("\n");
      seq += 1;
      elements.push({ seq, kind: "list-item", text, raw });
      continue;
    }

    prose.push(line);
  }
  flushProse();

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(elements, null, 2) + "\n", "utf8");

  const byKind = {};
  for (const el of elements) byKind[el.kind] = (byKind[el.kind] ?? 0) + 1;
  console.error(JSON.stringify({
    source: "phases/PHASE-LAUNCH-CHECKLIST.md",
    output: "context-migration/decomposed/PHASE-LAUNCH-CHECKLIST.json",
    items_parsed: elements.length,
    by_kind: byKind,
    arrays_written: 1,
    errors: 0,
  }, null, 2));
}

main();
