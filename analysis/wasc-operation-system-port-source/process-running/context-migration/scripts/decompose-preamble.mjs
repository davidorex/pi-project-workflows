#!/usr/bin/env node
// decompose-preamble.mjs — decomposition script #6 of the context-migration plan
// (context-migration/2026-05-30-context-migration-scripts.md).
//
// Source : phases/00-preamble.md   (heterogeneous: section headers + inlined
//          user-story lists + top-level bullets + blockquotes + prose paragraphs)
// Output : context-migration/decomposed/00-preamble.json   (one JSON array)
//
// The original output (subagent-produced; its script was never persisted —
// decompose-preamble.mjs was an empty file) captured only list items and dropped
// every section header and prose paragraph — real content loss the hardened gate
// (total-line-coverage) exposes. This is a proper markdown BLOCK parser: every
// non-blank, non-`---` line becomes part of exactly one kind-tagged element, so
// nothing is dropped and nothing is fabricated.
//
// Block kinds (by the first line of the block):
//   section      `## ` or `### ` heading (single line)
//   list-item    a top-level numbered item `N. …` or bullet `- …`, PLUS any
//                immediately-following indented continuation lines (e.g. 16a–h
//                under step 16) folded into the same element
//   blockquote   a `> …` line (+ indented continuation)
//   prose        a paragraph: consecutive non-list, non-heading, non-blank lines
//
// Ignored (declared in the manifest, never silently): blank lines and `---` rules.
//
// Field model per element:
//   seq           1-based block order
//   kind          one of the kinds above
//   text          the element's content with the leading marker stripped from the
//                 first line (heading hashes / "N. " / "- " / "> "); multi-line
//                 blocks join lines with "\n". For prose, text == raw.
//   raw           the block verbatim (every source line, "\n"-joined). The
//                 zero-loss anchor — coverage checks every line of every raw.
//
// FAITHFUL SHAPE ONLY (mandate-002): no fields invented to fit a target schema;
// the consumption phase decides how kind-tagged blocks map into .context blocks.

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const SOURCE = resolve(REPO_ROOT, "phases", "00-preamble.md");
const OUT_DIR = resolve(REPO_ROOT, "context-migration", "decomposed");
const OUT_FILE = resolve(OUT_DIR, "00-preamble.json");

const HEADING_RE = /^#{2,6}\s+(.*)$/;
const NUM_ITEM_RE = /^(\d+)\.\s+(.*)$/;
const BULLET_RE = /^[-*]\s+(.*)$/;
const QUOTE_RE = /^>\s?(.*)$/;
const INDENTED_RE = /^\s+\S/;

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

    const h = HEADING_RE.exec(line);
    if (h) {
      flushProse();
      seq += 1;
      elements.push({ seq, kind: "section", text: h[1].trim(), raw: line });
      continue;
    }

    const num = NUM_ITEM_RE.exec(line);
    const bul = BULLET_RE.exec(line);
    const q = QUOTE_RE.exec(line);
    if (num || bul || q) {
      flushProse();
      const block = [line];
      let j = i + 1;
      while (j < lines.length && INDENTED_RE.test(lines[j])) { block.push(lines[j]); j++; }
      i = j - 1;
      const raw = block.join("\n");
      const kind = q ? "blockquote" : "list-item";
      const firstText = num ? num[2] : bul ? bul[1] : q[1];
      const text = [firstText, ...block.slice(1)].join("\n");
      seq += 1;
      elements.push({ seq, kind, text, raw });
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
    source: "phases/00-preamble.md",
    output: "context-migration/decomposed/00-preamble.json",
    items_parsed: elements.length,
    by_kind: byKind,
    arrays_written: 1,
    errors: 0,
  }, null, 2));
}

main();
