#!/usr/bin/env node
// decompose-state.mjs — decomposition script #2 of the context-migration plan
// (context-migration/2026-05-30-context-migration-scripts.md).
//
// Source : ORCHESTRATOR-STATE.md   (repo root; derived synthesis layer)
// Output : context-migration/decomposed/ORCHESTRATOR-STATE.subagent-invocations.json
//          context-migration/decomposed/ORCHESTRATOR-STATE.pending-actions.json
//          (two block-item kinds → two arrays; .kind infix on the source basename)
//
// Per the plan: ORCHESTRATOR-STATE.md carries unique state in two sections only —
// "Last subagent invocations" and "Pending orchestrator actions". Every other
// section is derived from git, the LOG, or the conventions block, so it is NOT
// extracted here. Both arrays carry a per-item `raw` field so the re-encoding is
// lossless (spec: "structural re-encoding, not a summary").
//
// SPEC DIVERGENCE (surfaced, not silently absorbed): the plan describes
// pending-actions as "~10 task-like items ... with completed items struck
// through". The actual section has NO strikethrough; completion is marked inline
// by the word "DONE". It is also not one flat list — it is framing prose + two
// numbered sub-lists under bold sub-headers ("Immediate next", "Remaining") with
// nested (a)/(b)/(c) children + trailing prose. This script captures that real
// structure losslessly (group, num, text, done, children, raw) + section notes;
// the consumption-phase schema decision for the pending-actions block is open.

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const SOURCE = resolve(REPO_ROOT, "ORCHESTRATOR-STATE.md");
const OUT_DIR = resolve(REPO_ROOT, "context-migration", "decomposed");
const OUT_INVOCATIONS = resolve(OUT_DIR, "ORCHESTRATOR-STATE.subagent-invocations.json");
const OUT_ACTIONS = resolve(OUT_DIR, "ORCHESTRATOR-STATE.pending-actions.json");

const INVOCATIONS_HEADING = "## Last subagent invocations";
const ACTIONS_HEADING = "## Pending orchestrator actions";

// Return the lines strictly between `## <heading...>` and the next `## ` heading.
function sliceSection(lines, headingPrefix) {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(headingPrefix)) { start = i + 1; break; }
  }
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) { end = i; break; }
  }
  return lines.slice(start, end);
}

// --- "Last subagent invocations" -------------------------------------------
// Each record is a top-level "- " bullet. Real records lead with **`<sha>`**
// then "(<context>):". One line is an italic placeholder with no sha.
function parseInvocations(sectionLines) {
  const items = [];
  let seq = 0;
  for (const line of sectionLines) {
    if (!line.startsWith("- ")) continue; // blank lines, stray prose
    seq += 1;
    const rawItem = line.slice(2); // strip "- "
    const shaMatch = /^\*\*`([0-9a-f]{6,40})`\*\*/.exec(rawItem);
    if (!shaMatch) {
      // e.g. the "*(Phases 1–6 IMPL ...: detail trimmed here ...)*" note
      items.push({ seq, sha: null, context: null, text: rawItem.trim(), kind: "note", raw: rawItem });
      continue;
    }
    const sha = shaMatch[1];
    let rest = rawItem.slice(shaMatch[0].length).replace(/^\s+/, "");
    let context = null;
    const ctxMatch = /^\(([^)]*)\)\s*:?\s*/.exec(rest);
    if (ctxMatch) {
      context = ctxMatch[1].trim();
      rest = rest.slice(ctxMatch[0].length);
    }
    items.push({ seq, sha, context, text: rest.trim(), kind: "invocation", raw: rawItem });
  }
  return items;
}

// --- "Pending orchestrator actions" ----------------------------------------
// Heterogeneous: framing prose + bold sub-headers introducing numbered lists +
// nested (a)/(b)/(c) children. Capture every numbered item as an action under
// its current group; nested bullets become children; non-list prose becomes a
// section note. `done` is the inline-DONE heuristic; `raw` is the source truth.
function parseActions(sectionLines) {
  const actions = [];
  const notes = [];
  let group = null;
  let current = null; // last numbered action, to attach nested children
  let seq = 0;

  for (const line of sectionLines) {
    if (line.trim() === "") continue;

    // Bold-only sub-header introducing a sub-list, e.g.
    // "**Immediate next (user-directed ...):**" or a plain "Remaining:" label.
    const boldHeader = /^\*\*(.+?)\*\*\s*$/.exec(line);
    const plainLabel = /^([A-Z][A-Za-z ]+):\s*$/.exec(line);
    if (boldHeader) { group = boldHeader[1].replace(/:$/, "").trim(); current = null; continue; }
    if (plainLabel) { group = plainLabel[1].trim(); current = null; continue; }

    // Numbered top-level action: "1. text"
    const numbered = /^(\d+)\.\s+(.*)$/.exec(line);
    if (numbered) {
      seq += 1;
      current = {
        seq,
        group,
        num: Number(numbered[1]),
        text: numbered[2].trim(),
        done: /\bDONE\b/.test(numbered[2]),
        children: [],
        raw: line,
      };
      actions.push(current);
      continue;
    }

    // Nested child bullet under a numbered action: "   - (a) text"
    const child = /^\s+-\s+(.*)$/.exec(line);
    if (child && current) {
      current.children.push({ text: child[1].trim(), done: /\bDONE\b/.test(child[1]), raw: line });
      continue;
    }

    // Anything else (framing prose, "Decisions persisted..." interstitial,
    // trailing template note) — preserved as a section note so nothing is lost.
    notes.push({ text: line.trim(), raw: line });
  }
  return { actions, notes };
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

  const invSection = sliceSection(lines, INVOCATIONS_HEADING);
  const actSection = sliceSection(lines, ACTIONS_HEADING);
  const errors = [];
  if (invSection === null) errors.push(`section not found: ${INVOCATIONS_HEADING}`);
  if (actSection === null) errors.push(`section not found: ${ACTIONS_HEADING}`);

  const invocations = invSection ? parseInvocations(invSection) : [];
  const { actions, notes } = actSection ? parseActions(actSection) : { actions: [], notes: [] };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_INVOCATIONS, JSON.stringify(invocations, null, 2) + "\n", "utf8");
  // pending-actions: array of actions, with section notes carried as a trailing
  // metadata element so the lossless framing prose travels with the payload.
  const actionsPayload = notes.length
    ? [...actions, { seq: null, kind: "section-notes", notes }]
    : actions;
  await writeFile(OUT_ACTIONS, JSON.stringify(actionsPayload, null, 2) + "\n", "utf8");

  console.error(JSON.stringify({
    source: "ORCHESTRATOR-STATE.md",
    outputs: {
      "ORCHESTRATOR-STATE.subagent-invocations.json": invocations.length,
      "ORCHESTRATOR-STATE.pending-actions.json": actions.length,
    },
    section_notes_captured: notes.length,
    items_parsed: invocations.length + actions.length,
    arrays_written: 2,
    errors: errors.length,
    ...(errors.length ? { error_detail: errors } : {}),
  }, null, 2));
}

main();
