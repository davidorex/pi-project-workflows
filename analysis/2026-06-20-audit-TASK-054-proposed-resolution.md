# Audit — TASK-054 proposed resolution (rawWriteBlockText helper)

**Date:** 2026-06-20
**Scope:** Audit the proposed resolution (description + acceptance_criteria) of TASK-054 for poisoned assumptions — WRONG / OVERLY-COMPLEX / NON-BEST-PRACTICE design. Read-only; no implementation.
**Verdict: SOUND** (with two precision corrections to the rationale text, and one criterion tightening — none change the task's design).

---

## What TASK-054 proposes

A behavior-preserving DRY refinement: extract the duplicated raw `tmp + rename` block-file write (two sites) into a small local helper `rawWriteBlockText(blockFile, text, verb)`, whose comment names why it bypasses the AJV-validating writer (`writeTypedFile`). Filed verbatim from a code-simplifier evaluation's optional finding #2; internal-only (no exported surface / op / schema change).

Upstream wiring: the only relation is `item_governed_by_convention -> feature-decomposition`. There is NO upstream gap/feature/decision carrying a separate proposed_resolution — the task body IS the proposed resolution (notes: "filed verbatim on user direction"). So the audit target is the task fields themselves against the cited code.

## Cited code — verified against current tree (branch `context-jit-spec-v2`)

The task flags its own line numbers as pre-TASK-053 and says "relocate by content." Relocated:

- **Mark site** — `packages/pi-context/src/index.ts:2080-2082` (inside `updateContext`, live validation-blocked marker inscription):
  ```ts
  const tmpPath = `${blockFile}.markers-${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, markerText);
  fs.renameSync(tmpPath, blockFile);
  ```
- **Unmark site** — `packages/pi-context/src/index.ts:2467-2469` (inside `resolveBlocked`, strip-on-pass before identity-stamping write):
  ```ts
  const tmpPath = `${blockFile}.unmark-${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, strippedText);
  fs.renameSync(tmpPath, blockFile);
  ```

The two are byte-for-byte the same three-line shape, differing only in (a) the tmp-path verb token (`markers` vs `unmark`) and (b) the source string (`markerText` vs `strippedText`). `rawWriteBlockText(blockFile, text, verb)` parameterizes exactly those two axes. The DRY target is real and the proposed signature fits it precisely.

- **`writeTypedFile`** — `packages/pi-context/src/block-api.ts:870` (signature) / validate at `:893-895` / write at `:925-928`.

## Audit findings

### (a) WRONG assumptions — NONE that invalidate the design; ONE imprecise rationale

The task says `writeTypedFile` "cannot be reused (it validates)." Read literally that is incomplete and slightly wrong: `writeTypedFile(filePath, schemaPath, …)` validates ONLY when `schemaPath` is non-null (`block-api.ts:893` `if (schemaPath)`), so a caller COULD pass `schemaPath = null` to skip AJV. The decisive blocker is a DIFFERENT one the task omits: `writeTypedFile` **JSON-serializes its payload** — `JSON.stringify(toWrite, null, 2)` at `block-api.ts:927`. The marker/stripped payload is already a raw pre-formatted multi-line STRING (`markerText` / `strippedText`); feeding it to `writeTypedFile` would JSON-encode the string (surrounding quotes + `\n`-escaped newlines), corrupting the on-disk block bytes. So the conclusion ("a dedicated raw helper is the right level") is CORRECT, but the stated reason ("it validates") is the wrong reason. The helper's why-comment should name the serialization mismatch, not (only) validation, or it will mis-document the bypass.

### (b) OVERLY COMPLEX vs a simpler existing approach — NO

There is no existing raw-string atomic-write util to reuse. The three atomic writers in the package (`writeTypedFile` block-api.ts:925, `object-store.ts:87`, `schema-write.ts:381`, `block-validation.ts:207`, `context-dir.ts:238/330`) each serialize a structured payload or write a different file class; none takes a caller-supplied raw string for an arbitrary block file. A 3-line local helper is the minimal correct abstraction — not over-engineered, not under-served by an existing one. The proposed scope (one local, non-exported helper) is appropriately small.

### (c) NON-BEST-PRACTICE / fragility / scope-creep — minor, two notes

1. **`utf-8` encoding arg.** Both current sites call `fs.writeFileSync(tmpPath, markerText)` with NO encoding argument (default utf-8), whereas `writeTypedFile` passes `"utf-8"` explicitly. A faithful behavior-preserving helper must reproduce the current default-encoding call (or add explicit `"utf-8"`, which is byte-identical for these string payloads). Either is fine; the criterion "same tmp path scheme, same atomic rename" should also bind "same write semantics (no JSON re-serialization, utf-8 text)".

2. **No error-cleanup divergence.** `writeTypedFile` wraps its write in try/catch that unlinks the orphan tmp on failure (block-api.ts:929-934). The two raw sites have NO such cleanup. "Behavior-preserving" means the helper must NOT add try/catch-unlink (that would be a behavior change — a scope-creep trap). The criteria correctly demand zero test edits / behavior-preserving, which forbids this; worth stating explicitly in the brief so an implementer does not "improve" it.

### Acceptance criteria — sound, one tightening

The three criteria are well-formed and testable (helper replaces both sites; comment states the bypass reason; same tmp scheme + atomic rename; full suite passes UNCHANGED with zero test edits; build/check/test + parity-check green; blocked→markers→resolve→in-sync runtime loop converges). The runtime-loop criterion is the right end-to-end proof for this exact code path.

Tighten criterion 1's comment requirement: the bypass comment must name the **JSON-serialization mismatch** (raw pre-formatted text vs `writeTypedFile`'s `JSON.stringify`), not merely "it validates" — see finding (a).

## Proposed corrected field text (ready to replace)

**description** (corrects the rationale; keeps everything else):

> Behavior-preserving refinement (code-simplifier finding #2). Duplicated raw tmp+rename marker-write block, 2 sites: `packages/pi-context/src/index.ts` mark site (inside `updateContext`, ~:2080-2082, locate by `${blockFile}.markers-${process.pid}.tmp`) and unmark site (inside `resolveBlocked`, ~:2467-2469, locate by `${blockFile}.unmark-${process.pid}.tmp`). Identical three-line shape: `const tmpPath = \`${blockFile}.<verb>-${process.pid}.tmp\`; fs.writeFileSync(tmpPath, text); fs.renameSync(tmpPath, blockFile);` — differing only in verb token (`markers`/`unmark`) and source string (`markerText`/`strippedText`). A local helper `rawWriteBlockText(blockFile, text, verb)` DRYs this and names why it bypasses `writeTypedFile` (block-api.ts:870): the payload is already raw pre-formatted multi-line block text, and `writeTypedFile` JSON-serializes its input (`JSON.stringify(…, null, 2)` at block-api.ts:927), which would quote/escape the text — so it is structurally unusable here, independent of its AJV validation. The dedicated raw helper is the right level. Behavior-preserving: same `${blockFile}.<verb>-${process.pid}.tmp` path scheme, same atomic rename, raw-string write with no JSON re-serialization and no added try/catch-cleanup (the current sites have none — adding it would be a behavior change).

**acceptance_criteria[0]** (tighten the comment requirement):

> A `rawWriteBlockText(blockFile, text, verb)` helper replaces both raw tmp+rename sites; its comment states why it bypasses `writeTypedFile` — specifically that `writeTypedFile` JSON-serializes its payload whereas these sites write pre-formatted raw block text (validation-bypass is secondary).

**acceptance_criteria[1]** (bind write semantics, not only path/rename):

> Same tmp path scheme, same atomic rename, same raw-string write semantics (no JSON re-serialization, no added error-cleanup) — behavior-preserving: the full test suite passes UNCHANGED (zero test edits).

acceptance_criteria[2] unchanged (build/check/test + parity + runtime loop convergence).

## Bottom line

The task's DESIGN is sound — the duplication is real, the proposed helper + signature fit it exactly, the scope is minimal, and there is no simpler existing util. The only poison is in the RATIONALE TEXT: it names "it validates" as the reuse blocker when the decisive blocker is JSON-serialization of an already-formatted raw string. Correct the description + criterion-1 comment requirement so the implemented helper documents the true bypass reason, and bind the behavior-preserving criterion to "no JSON re-serialization, no added cleanup" so an implementer cannot "improve" the raw write into a divergence.
