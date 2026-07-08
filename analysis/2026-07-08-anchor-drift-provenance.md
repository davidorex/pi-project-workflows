# Provenance of pi-context's `content_pin` + `anchor-drift` mechanism — forensic determination

Read-only forensic investigation, 2026-07-08. Question: was the whole-file-hash citation-staleness design **user-directed** or **LLM-composed under filing authority**, and is it a copy (faithful or botched) of a mechanism from the "wasc" project (`/Users/david/Projects/wasc-school-wide-improvement-plan`) whose harness the user says works. Every load-bearing claim below is a quoted commit / message / file line with its identifier. Absences are recorded as absences, not inferred away.

---

## 1. The mechanism as-implemented

### Introducing commit

`8ef972a05481ebfc4eb646de727ec08af05eb2d4` — **2026-07-06 15:16:25 +0800**, author David Ryan. Subject: *"pi-context: declared-baseline currency machine-evaluable — typed staleness conditions + content pins (TASK-089 / FEAT-011 criterion 6)"*. This is the sole introducing commit of both `content_pin` and `anchor-drift` (`git log -S 'content_pin'` and `git log -S 'anchor-drift'` each return exactly this commit as the first/adding commit; one follow-up `5dc51d511e4f8baa63bb40333ef7a9ca3faa6be1`, 2026-07-06 15:34, narrows it).

### Write-path stamping (whole-file hash)

`packages/pi-context/src/block-api.ts` `stampDeclaredBaselines()` (docstring lines 665–688; logic 723–769). The pin is computed by `fileHashOrNull` → `computeFileBytesHash(abs)` over the **entire file bytes**:

```
// block-api.ts:748-751
if (pathField !== null && typeof rec.content_pin !== "string" && typeof rec[pathField] === "string") {
    const hash = fileHashOrNull(rec[pathField] as string);   // sha256 of WHOLE file
    if (hash !== null) return { ...rec, content_pin: hash };
}
```

The introducing commit message states why a *bytes* hash was used rather than the item's own `content_hash` helper: *"New `computeFileBytesHash` in content-hash: the existing `computeFileContentHash` parses the file as JSON and hashes the canonical form — it throws on arbitrary cited files, discovered when the first fixture pinned a text file; pins fingerprint exact bytes."* (`8ef972a0` body.) So the hash granularity is **the whole file**, deliberately, by both commits.

### Validate check (`anchor-drift`)

`packages/pi-context/src/context-sdk.ts` `evaluateStalenessCandidates()` (docstring 2439–2451; drift loop 2516–2543). It re-hashes the current file and compares to the stored pin:

```
// context-sdk.ts:2522-2530
if (typeof rec.content_pin !== "string") continue;
const rel = typeof rec.path === "string" ? rec.path : typeof rec.file === "string" ? rec.file : null;
if (rel === null || isSubstrateInternal(rel)) continue;
const now = fileHashOrNull(rel);
if (now === null) { driftReasons.push(`pin drift: '${field}' entry file '${rel}' is gone`); }
else if (now !== rec.content_pin) { driftReasons.push(`pin drift: '${field}' entry file '${rel}' changed since pinned`); }
```

The warning text (`context-sdk.ts:2794`): *"Item '…' (block '…') has drifted anchors — … Re-review the cited locations; the flag never rewrites."*

### Schema field descriptions (whole-file, explicit)

- `packages/pi-context/samples/schemas/framework-gaps.schema.json:105-109` — `evidence[].content_pin`: *"SHA-256 of the referenced file at write time. Stamped by the write path when `file` names a readable file OUTSIDE the substrate dir … context-validate flags a pinned evidence entry whose current file hash drifted (anchor drift — re-review, never rewritten)."* The same object also declares `lines` (90) and `reference` (93) — a line-range and a textual referent — yet the pin covers the whole `file`.
- `packages/pi-context/samples/schemas/research.schema.json:210-214` — `citations[].content_pin`: *"SHA-256 of the cited file at write time …"*. The same object declares `lines` (163).

**The known weakness is structural and visible in the schema itself:** a per-referent anchor (`lines`, `reference`) sits *beside* the pin, but the pin hashes the whole `file` — so any edit anywhere in a live source file fires drift regardless of whether the cited claim moved.

---

## 2. Provenance verdict — LLM-composed under filing authority, NOT user-directed at the granularity

### The design originated in an LLM investigation report

`analysis/2026-07-05-currency-foreclosure-shape.md`, committed `4c84ca4d245f8465b092e54441b1bd548b19c5cb` (2026-07-05 14:28:47 +0800), subject *"analysis: currency-foreclosure solution shape — **unprejudiced code-derived architecture determination**"*. This report is the design source. Its S5/S6 proposals are the content_pin/anchor-drift mechanism, and they model it **on pi-context's own internal precedents**, not on any external project:

> **S5** (line 78): *"capture content pins at write — for each `citations[]` entry with a `path`, stamp a `content_hash` of the cited file (machinery exists: `computeFileContentHash`, object store) **exactly as `installed_from.assets` pins schemas**"*

> **S6** (line 81): *"**Anchor-drift flagging for prose** (apply S5's pin mechanism to any item field carrying `{file, lines}` anchors — gap `evidence[]`, task `files[]`): pin at write, compare at validate, flag 'the code this text cites has changed since filing'."*

> line 40: *"**Already-pinned baselines as drift detectors (shipped precedent)**: `config.installed_from.assets` … records per-schema `content_hash` at install; `/context update` classifies in-sync / catalog-ahead / … — declare-baseline-then-diff."*

The provenance is unambiguous from the report: the whole-file hash was chosen because pi-context **already** whole-file-hashes schema assets (`installed_from.assets`) and already had `computeFileContentHash` "for hashing arbitrary FILES" (report line 39). The design is a generalization of pi-context's own `schema_version` currency template to citations — an internal, code-derived invention.

### The assistant proposed it; the user authorized at the directive level only

The assistant relayed the recommendation (session `ac1621b3-a1ff-49c8-93dd-7095ccd4bf1e`, assistant msg **2026-07-05T06:29:29Z**):

> *"3. **Declared-baseline currency** (research): typed `stale_conditions` … + **content-hash pins on citations** — the same declare-then-diff shape `installed_from.assets` already uses."*

Every user message across the design→file→implement window is a **directive-level authorization with no design content and no hash-granularity specification**:

- 2026-07-05 (session `ac1621b3`, after the recommendation): `"let's do audit corrections first"` (06:43), `"granted"` (06:52, 08:40, 08:55, 09:34), `"go"` (07:46, 08:51), `"let's proceed."` (08:36) — none mention pins, hashing, files, or lines.
- 2026-07-06 (implementation day, session `ac1621b3`): `"file it"` (14:02:25), `"as i said: file"` (15:04:01), `"canonical pipeline go"` (15:13:10) — the authorizations immediately preceding the 15:16 implementing commit. Terse; no design content.

**Verdict:** the whole-file-hash design is **LLM-composed under filing authority**. The user authorized *that the LLM-recommended shape be filed and implemented via the canonical pipeline*; the user did not specify — at any point in the record searched — that the pin should hash the whole file rather than the cited referent. Per this repo's own `filing-provenance` convention, hash granularity here is DERIVABLE-from-internal-precedent LLM composition, not a user-VERBATIM or user-DIRECTED qualifier. I found no user message specifying granularity; the searches that would have surfaced one are listed in the appendix and returned only directive-level authorizations.

---

## 3. Design reasoning at the time — whole-file vs referent, and the failure mode

### Why whole-file

Two cited reasons, both internal-precedent, both in the 2026-07-05 report and the introducing commit:
1. **Reuse of the shipped `installed_from.assets` pattern**, which pins whole schema files (report S5, line 40).
2. **Reuse of `computeFileContentHash` "for hashing arbitrary FILES"** (report line 39); during implementation this was swapped to a new `computeFileBytesHash` because the JSON-canonicalizing helper threw on non-JSON cited files (`8ef972a0` body) — but the granularity stayed whole-file.

### Was the false-positive-on-live-source failure mode considered? — No.

The report's S6 **frames the whole-file drift-fire as the intended feature**, not a hazard: *"flag 'the code this text cites has changed since filing'"* (line 81). The report enumerates the mechanism's limits explicitly and the false-positive-on-actively-developed-source case is **not among them**; the only stated ceiling for this class is semantic, e.g. S6: *"Cannot: semantic overstatement itself (no in-engine mechanism can know the title is now wrong)"* (line 82), and the residue section (line 111) lists only prose semantics, authored-status judgment, and external-world references. The report even had line-range anchors in hand — S6 literally names *"any item field carrying `{file, lines}` anchors"* — yet chose the whole-file pin without noting the resulting false-positive exposure.

### The failure mode was discovered in DOGFOODING, after shipping, not at design

- **2026-07-06 15:34** (`5dc51d51`, ~18 min after the introducing commit): the first live use already churn-flagged. Commit body: *"First live use stamped content pins on R-0012's citations to `.context/framework-gaps.json` and `.context/decisions.json` — block files that change on every substrate write, so those pins would drift immediately and flag anchor-drift forever."* The fix only excluded **substrate-internal** paths; it did not touch the whole-file-vs-referent problem for external source files.
- **2026-07-07 11:48:28** (session `ac1621b3`, assistant): the false positive recurs on a live *source/prose* file — *"it pins CLAUDE.md's \"Rhetorical situation for every block write\" prose, which my line-70 gate-enumeration edit did **not** touch — the whole-file content_pin drifted anyway."* This is the whole-file weakness firing exactly as the design guaranteed it would, encountered as a problem in use.
- **2026-07-07 / 2026-07-08** (sessions `53383be9`, `3e9b6b17`): `anchor-drift` on FGAP-125 / FGAP-127 / FGAP-031 appears as `check-context-currency` commit blockers in `context-validate` output — the mechanism actively obstructing work on actively-developed files.

---

## 4. The WASC "original" and the divergence — there is no wasc original of this mechanism

The user's premise is that this duplicates a mechanism from wasc's working harness. **The evidence contradicts that: wasc has no such mechanism.**

### wasc has no `content_pin` / `anchor-drift`

`grep -rn "content_pin|anchor-drift|drifted anchor"` across `/Users/david/Projects/wasc-school-wide-improvement-plan` (`.json`, `.py`, `.ts`, `.md`) returns **zero hits**. (The only `anchor` tokens in wasc are Django HTML anchor prefixes, e.g. `school-improvement-plans/planner/views.py:1477 "anchor_prefix": "cond-"` — unrelated.)

### wasc's citation shape has no pin

`wasc/.context/schemas/research.schema.json` `citations[].items` (lines 150–172) declares `label`, `path`, `lines`, `url`, `retrieved_at` — required `["label"]`. **No `content_pin`.** wasc's `framework-gaps.schema.json` `evidence[]` (lines 77–95) declares `file`, `lines`, `reference` — **no pin**. These are the *exact same shapes* pi-context started from; pi-context **added** `content_pin` on top of them.

### wasc's staleness engine is explicitly UNBUILT ("future")

wasc `research.schema.json` declares `stale_conditions` (line 140) as: *"Explicit list of conditions under which the research is no longer authoritative. **A future staleness engine will read this to transition status from complete to stale automatically.**"* (line 145). Line 265: *"this block is metadata reserved for **future** framework-level state-machine validation … **A future staleness engine** reads stale_conditions and fires the complete→stale transition automatically when conditions are met."* wasc's `content_hash` field (line 200) is the item's OWN canonical-projection hash, not a cited-file pin. wasc's harness renderer `prompt-workshop/dispatch/render_from_substrate.py` uses `hashlib.sha256` only for a `prompt_hash` of the rendered prompt (line 116) — no citation/file anchoring anywhere.

### The pi-context repo's own wasc-comparison analyses do not tie this mechanism to wasc

The same-day design-context analysis `analysis/2026-07-06-harness-exemplars-wasc-synth.md` (characterizing wasc's harness as the "first model of harness") documents wasc's enforcement as commit-gates, a deterministic prompt renderer, IMPL/AUDIT role split, and append-only event spines. It contains **no mention** of `content_pin`, `anchor`, `pin drift`, or citation staleness. Neither does `analysis/2026-07-07-harness-fitness-vs-wasc.md`. A cross-project claude-history search `wasc AND (pin OR citation OR staleness OR anchor OR content_hash)` returned **zero** messages.

### Conclusion on wasc

This is **not a copy — faithful or botched — of a working wasc mechanism, because no such wasc mechanism exists.** What is shared is *lineage*, not *implementation*: pi-context and wasc are sibling substrates from the same schema family (both have `research.schema.json` with `citations{path,lines}`, `stale_conditions`, `content_hash`, `oid`). wasc *declared* a "future staleness engine" and never built it; pi-context is the project that **first built** a machine-evaluable staleness/pin engine — and built it by generalizing **pi-context's own** `installed_from.assets` / `schema_version` whole-file-hash precedent, per the 2026-07-05 code-derived design report. If anything, pi-context implemented the *idea* wasc only reserved, and chose whole-file hashing from its own internal machinery — the divergence from a "precise" original is moot because the original was never implemented anywhere to diverge from.

The nearest thing to a "more precise" anchor available at design time was pi-context's *own* citation schema, which already carried `lines`/`reference` referents beside the file — and the whole-file pin ignored them. So the imprecision is self-inflicted against pi-context's own available referent data, not a mistranslation of a wasc design.

---

## 5. Evidence gaps (explicit)

- **No single message states "hash the whole file" in either direction.** The whole-file choice is documented in the *LLM design report* (S5/S6, `4c84ca4d`) and the *LLM commit message* (`8ef972a0`), both LLM-authored under the repo's authorship convention. I found **no user message** specifying granularity, and **no user message** contesting it. The user↔LLM exchange that would contain an explicit granularity directive, if it existed, would appear in session `ac1621b3` on 2026-07-05/06; the user turns there are the terse authorizations quoted in §2. Absence of a user granularity directive is the basis for the "LLM-composed" verdict; it is an absence, recorded as such.
- **The FEAT-011 "criterion 6" verbatim text** was read only via its derivative artifacts (commit subjects, the design report, tool-result snippets in history) — I did not read `.context/features.json` directly (dogfitting discipline forbids direct substrate reads and this task forbids substrate ops). The criterion's *design intent* is nonetheless fully established by the 2026-07-05 report S5/S6 and the assistant's 06:29 relay.
- **Whether the user ever, in a later session, endorsed the whole-file behavior as intended** is out of scope here; the 2026-07-06/07 record shows the LLM treating the resulting drift on live files as a problem to narrow (`5dc51d51`; the 07-07 CLAUDE.md observation), not as user-blessed behavior.
- **wasc private/uncommitted or other-machine state** cannot be inspected; the determination "wasc has no such mechanism" rests on the on-disk wasc working tree at `/Users/david/Projects/wasc-school-wide-improvement-plan` as of 2026-07-08 plus the cross-project claude-history index. If a wasc pin engine existed only in an un-indexed session or an unpushed branch, this investigation would not see it; nothing in the record hints that it does.

---

## Appendix — queries run and hit counts

Repo / filesystem:
- `grep -rn "content_pin"` (pi-context src+schemas) — hits in `block-api.ts`, `context-sdk.ts`, both sample schemas, tests.
- `grep -rn "anchor-drift|drifted anchor|anchor drift"` — hits in `context-sdk.ts`, `index.ts`, `ops-registry.ts`, `framework-gaps.schema.json`, tests.
- `git log -S 'content_pin'` → `8ef972a0`, `5dc51d51`. `git log -S 'anchor-drift'` → same two. `git log -S 'drifted anchors'` → `8ef972a0`.
- `git show -s 8ef972a0 / 5dc51d51 / 4c84ca4d` — full commit bodies + dates.
- `grep -rn "content_pin|anchor-drift|drifted anchor" <wasc>` (`*.json,*.py,*.ts,*.md`) — **0 hits**.
- `grep -rln "baseline_hash|content_pin|sha256|staleness|stale_condition" <wasc>` — hits in wasc `research.schema.json`, `verification.schema.json`, `render_from_substrate.py` (prompt_hash only), object-store files — none a citation/file pin.
- wasc `research.schema.json` lines 140–265 (stale_conditions "future staleness engine"), 147–172 (citations shape, no pin), 200 (own-item content_hash); `framework-gaps.schema.json` 77–95 (evidence: file/lines/reference, no pin).
- `grep -in "content_pin|anchor|pin drift|staleness engine|whole.file" analysis/2026-07-06-harness-exemplars-wasc-synth.md` and `…2026-07-07-harness-fitness-vs-wasc.md` — **0 relevant hits**.
- `analysis/2026-07-05-currency-foreclosure-shape.md` lines 39–43, 77–82, 105, 111 (S5/S6, `installed_from.assets`/`computeFileContentHash` precedent).

claude-history:
- `claude-history search "content_pin"` — 20 results (all `workflowsPiExtension`; earliest design-adjacent 2026-07-05).
- `claude-history search '"anchor-drift"'` — 20 results (validate/blocker output in sessions `ac1621b3`, `53383be9`, `3e9b6b17`).
- `claude-history search "wasc"` — 20 results; establishes project id `wasc-school-wide-improvement-plan` and an in-repo `analysis/wasc-operation-system-port-source/`.
- `search_messages "content pin whole file hash sha256 citation drift"` — 0. `search_messages '"staleness engine" OR "content pin" OR "pin the referent"'` — 0 (FTS underscore/tokenization).
- `search_messages '"declared-baseline currency"'` — 15 results; surfaced the origin chain: report `4c84ca4d`, assistant relay 2026-07-05T06:29:29 (`ae047548`), plan tool-result 2026-07-05T06:28:21 (`9978469b`), task-filing snippets.
- `search_messages "wasc AND (pin OR citation OR staleness OR anchor OR content_hash)"` — **0 results** (no message ties the pin mechanism to wasc).
- `execute_sql` user-text in session `ac1621b3`, 2026-07-06 12:00–15:20 → `"file it"` / `"as i said: file"` / `"canonical pipeline go"`; 2026-07-05 06:29–10:00 → directive authorizations only (`"granted"`/`"go"`/`"let's proceed."`).
- `execute_sql` full text of `ae047548` (assistant relay) and `9978469b` (the S1–S9 plan tool-result) — the design source quoted in §2/§3.
- `execute_sql` on `42176251` — returned empty (row was a user tool_result, not assistant text; harmless).
