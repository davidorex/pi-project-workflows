#!/usr/bin/env node
// decompose-source-gaps.mjs — decomposition script #7 of the context-migration plan
// (context-migration/2026-05-30-context-migration-scripts.md).
//
// Source : data/source-model-gaps.md   (catalogue of source↔model representational gaps:
//          section headers A–I + Consequence summary, framing prose paragraphs,
//          top-level gap bullets, nested sub-points)
// Output : context-migration/decomposed/source-model-gaps.json   (one JSON array)
//
// The original gap-centric parser captured only `- ` bullets and dropped every
// section header and framing-prose paragraph (the §H/§I intros, the DEC-18/19
// materialization framing, the Consequence-summary intro) — real content loss the
// hardened gate (total-line-coverage) exposes. This is the same markdown BLOCK
// parser as decompose-preamble.mjs: every non-blank, non-`---` line becomes part
// of exactly one kind-tagged element, so nothing is dropped and nothing fabricated.
//
// Block kinds (by the first line of the block):
//   section      `#`..`######` heading (single line). The `# ` title and the
//                `## <Letter>. <title>` category headers are all sections.
//   list-item    a top-level bullet `- …`, PLUS any immediately-following indented
//                continuation lines (the §H Evidence `1.`/`2.` sub-points + their
//                trailing prose, the §H Milestone `- ` continuation) folded in
//   prose        a paragraph: consecutive non-list, non-heading, non-blank lines
//
// Ignored (manifest-declared, never silent): blank lines and `---` rules.
//
// Field model per element:
//   seq    1-based block order
//   kind   section | list-item | prose
//   text   content with the first line's leading marker stripped (heading hashes /
//          "- "); multi-line blocks join with "\n". For prose, text == raw.
//   raw    the block verbatim (every source line, "\n"-joined). Zero-loss anchor.
//
// FAITHFUL SHAPE ONLY (mandate-002): the lettered-section grouping + [lossy]/
// [needs-value]/[mismatch] category tags live IN the section element's text
// verbatim; the consumption phase derives structured category/section fields from
// them. Deriving them here (as the old parser did) is a consumption concern, and
// the cost of doing it was dropping the prose — not worth it.

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const SOURCE = resolve(REPO_ROOT, "data", "source-model-gaps.md");
const OUT_DIR = resolve(REPO_ROOT, "context-migration", "decomposed");
const OUT_FILE = resolve(OUT_DIR, "source-model-gaps.json");

const HEADING_RE = /^#{1,6}\s+(.*)$/;
const BULLET_RE = /^[-*]\s+(.*)$/;
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

    const bul = BULLET_RE.exec(line);
    if (bul) {
      flushProse();
      const block = [line];
      let j = i + 1;
      while (j < lines.length && INDENTED_RE.test(lines[j])) { block.push(lines[j]); j++; }
      i = j - 1;
      const raw = block.join("\n");
      const text = [bul[1], ...block.slice(1)].join("\n");
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
    source: "data/source-model-gaps.md",
    output: "context-migration/decomposed/source-model-gaps.json",
    items_parsed: elements.length,
    by_kind: byKind,
    arrays_written: 1,
    errors: 0,
  }, null, 2));
}

main();
