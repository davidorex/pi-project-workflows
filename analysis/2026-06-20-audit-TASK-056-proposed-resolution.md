# Audit — TASK-056 proposed resolution (resolve-blocked success report enrichment)

**Date:** 2026-06-20
**Scope:** Code-simplifier / design audit of TASK-056's description + acceptance_criteria (the proposed resolution) against the ACTUAL cited code. Read-only; no mutation, no implementation.
**Verdict: SOUND — with two precision corrections + one design-pattern correction that simplify the resolution and remove a false premise. Net: the task is well-conceived (right facts, right "no new op/flag" constraint), but its acceptance criteria slightly mis-state which facts are trivially in-scope and how the text surface should be produced.**

---

## What TASK-056 proposes

Enrich `resolve-blocked`'s SUCCESS report so a normal run prints a `git show --stat`-style change summary:
old-vs-new schema version, which items were forward-migrated (or left unchanged), and the merge-base advance from→to. Command surface untouched (no new op, no new flag). Cited as "facts already computed in memory at the success point and currently discarded." Cites FGAP-076 (update's partial-application legibility) as the same principle. D2's `--diff` flag spelling explicitly NOT adopted.

## Upstream provenance

- No gap/feature/decision edge on TASK-056 (`find-references` returns only `item_governed_by_convention → docs-surface-sync`). Origin is the operator-story think-out (D2 + G5, "confirmed duplicates; one filing"), recorded in `notes`, plus the FGAP-076 analogy. There is therefore no upstream `proposed_resolution` to diff against beyond FGAP-076's, which is a *sibling pattern* (for the `update` op), not a parent.

---

## Ground truth (verbatim from the cited code)

`resolveBlocked` — `packages/pi-context/src/index.ts:2338-2493`. Success return (line 2492):

```ts
return { schemaName: name, resolved: true, registeredMigrations, baseAdvancedTo };
```

Facts in scope at the success point (lines 2403-2490), each currently DISCARDED:

| Fact the task wants | In scope? | Variable / source |
|---|---|---|
| old schema version | YES | `entry.from` (`PendingBlockedEntry.from?`, pending-blocked-store.ts:62) |
| new schema version | YES | `entry.to` / `targetVersion` (index.ts:2407) |
| migration chain walked | YES | `entry.chain` (the decls); `registeredMigrations` (subset newly registered) |
| pre-migration block data | YES | `blockData` (index.ts:2391) |
| post-migration block data | YES | `migrated` (index.ts:2421-2430) |
| merge-base NEW hash | YES (returned) | `baseAdvancedTo` (index.ts:2485) |
| merge-base OLD hash (the "from") | NOT returned, but cheaply readable | `config.installed_from.assets[name].content_hash`, read inside `stampBaselineFromBody` (index.ts:2185-2186) immediately before overwrite |

CLI rendering: there is **no custom text surface** for resolve-blocked. The op returns `{ json: resolveBlocked(...) }` (ops-registry.ts:1400) and the default-text path JSON-pretty-prints it via `renderOpResultText` (cli.ts:1159). So today a success reads as the 4-field object above.

`update`'s readable text surface (the FGAP-076 sibling) is produced by an **op-specific CLI branch** (cli.ts:1172-1192): `if op.name === "update"` → call pure `renderConflicts` / `renderBlocked` helpers below the JSON. The structured facts live in the return object; the readable rendering is a pure `render*` helper invoked by a per-op branch.

---

## Findings

### Finding 1 — "which items were forward-migrated (or left unchanged)" is the ONE claim that is NOT a discarded in-scope fact. (NON-BEST-PRACTICE precision / latent scope-creep)

The task asserts ALL three reported facts are "already computed in memory at the success point and currently discarded." Two of three are (version pair: `entry.from`/`entry.to`; merge-base: `baseAdvancedTo` + the readable old hash). The third — a **per-item** migrated-vs-unchanged determination — is NOT computed anywhere. `runMigrations` (schema-migrations.ts:144) transforms the whole block; `resolveBlocked` never diffs `blockData` against `migrated` per item. Producing "which items migrated vs unchanged" requires NEW work: an item-by-item structural diff (by oid) between pre and post. That is a real computation with non-trivial edge cases (oid matching, the `hasItems`/no-items skip path at index.ts:2460, the `wasMarked` strip path at 2466), not a free read.

This matters because the task's own framing ("facts already computed … currently discarded", criterion-1) will hand a downstream implementer a FALSE premise — they will look for a per-item migrated set that does not exist, then either (a) over-build a per-item differ (scope-creep beyond a `--stat` summary) or (b) silently downgrade to a count. The honest, simpler `--stat` analog is **counts + the version delta that drove them**, not a per-item ledger: `git show --stat` reports `N files changed`, not a per-line list. The summary that is genuinely free is: item count, and whether migration ran (chain non-empty AND versions differed — exactly the guard at index.ts:2423-2428).

### Finding 2 — merge-base "from→to" needs the OLD baseline hash, which the return currently drops; the fix belongs in `stampBaselineFromBody`, not re-derived at the call site. (Mild design correction — keeps it DRY)

`baseAdvancedTo` is only the NEW hash. The "from" (old baseline `content_hash`) exists in scope ONLY inside `stampBaselineFromBody` (index.ts:2185-2186, `config.installed_from.assets[name]`). To report from→to without re-reading config redundantly at the resolve-blocked call site, the cleanest move is to have `stampBaselineFromBody` return `{ from, to }` (or `{ previous, hash }`) rather than the bare new hash — a one-line widening at its single computation point. Re-reading config a second time inside `resolveBlocked` purely to recover the old hash would be the non-DRY path and risks a TOCTOU mismatch against what the stamp actually overwrote. Note `stampBaselineFromBody` is shared with `resolve-conflict` (index.ts:2225+) and `refreshBaselineForSchema` (index.ts:2211) — widening its return is additive and benefits those too.

### Finding 3 — the text surface should reuse the established `update` precedent (op-specific CLI branch + pure `render*` helper), not a bespoke mechanism. (Simplification — removes the "must invent a formatter" framing)

Criterion-2 ("prints a summary that reads the way `git show --stat` reads") combined with criterion-3 ("command surface untouched — no new op, no new flag") is internally consistent ONLY if the readable text is produced the way `update` already does it: structured facts in the return, a pure `renderResolved`-style helper, and an op-specific branch at cli.ts (alongside the existing `update` branch). There is a direct template — `renderConflicts` / `renderBlocked` (index.ts:2507+, plus its CLI wiring at cli.ts:1172-1192). The task's surrounding think-out framing (and any implementer reading "no existing helper exists") risks inventing a parallel rendering path. The correction is to NAME that precedent in the resolution so the implementer follows it. This keeps "command surface untouched" literally true (no new op/flag; only an added field-set on the return + a sibling render branch).

### Finding 4 — `entry.from` / `entry.to` are OPTIONAL; the report must tolerate their absence. (Fragility — must be in the criteria)

`PendingBlockedEntry.from`/`.to` are `string | undefined` (pending-blocked-store.ts:62-63); the `validation-failed` / `no-migration-chain` reason can pin an entry with no version delta (a same-version validation block, where `entry.chain.length === 0` and the migration guard at index.ts:2423 is false). A "from→to schema version" line must degrade gracefully (e.g. "schema vN (unchanged)" / omit the arrow) rather than print `undefined→undefined`. The current criteria do not name this case; an implementer following the criteria literally would emit a malformed line for the most common block reason (validation-failed with no migration).

---

## Proposed corrected fields (ready to replace TASK-056's)

### description (replace)

> Enrich resolve-blocked's success report so a normal run prints a summary that reads the way `git show --stat` reads after a merge — what was written, the schema version delta, and the merge-base advance from→to. The command surface is untouched: no new op, no new flag. Three of the reported facts are already in scope at the success point and currently discarded — the old/new schema version (`entry.from` / `entry.to`, both optional), the migration chain that ran (`entry.chain` / the `registeredMigrations` subset), and the item count — surfaced alongside the merge-base advance. The merge-base "from" (the old baseline `content_hash`) is NOT currently returned: `stampBaselineFromBody` reads `config.installed_from.assets[name]` immediately before overwriting it (index.ts:2185-2186), so the from→to pair is recovered by widening that function's return to `{ from, to }` at its single computation point (additive; also benefits resolve-conflict + refreshBaselineForSchema), NOT by re-reading config at the resolve-blocked call site. A per-item "which items migrated vs unchanged" ledger is explicitly OUT of scope — like `git show --stat` it reports counts + the delta that drove them (did migration run = chain non-empty AND versions differed, the existing guard at index.ts:2423-2428), not a per-item diff. The readable text follows the established `update` precedent — a pure `render*` helper (sibling to `renderConflicts` / `renderBlocked`, index.ts:2507) invoked by an op-specific branch at cli.ts (alongside the `update` branch, cli.ts:1172-1192) — so "command surface untouched" stays literally true (only an added field-set on the return + a sibling render branch).

### acceptance_criteria (replace)

1. resolve-blocked's success RETURN object carries the discarded-but-in-scope facts: the old/new schema version pair (`entry.from` → `entry.to`, tolerating either being undefined), whether migration ran + the chain/`registeredMigrations` it registered, the item count, and the merge-base advance as `{ from, to }` content hashes — not just `resolved: true` + a single `baseAdvancedTo` hash.
2. `stampBaselineFromBody` is widened to return the old baseline hash alongside the new (`{ from, to }`) at its single computation point (index.ts:2169), so the from→to pair is reported without a redundant second config read; its other callers (resolve-conflict, refreshBaselineForSchema) are updated for the additive shape and stay green.
3. The non-json text surface prints a `git show --stat`-style summary via a pure `render*` helper invoked by an op-specific CLI branch (the `update`/`renderConflicts` precedent, cli.ts:1172-1192) — NOT a bespoke rendering path. No per-item migration ledger; counts + version-delta + merge-base from→to only.
4. The summary degrades gracefully when `entry.from`/`entry.to` are absent (the validation-failed / no-migration-chain entry: same-version, `chain.length === 0`) — "unchanged" / omitted arrow, never `undefined→undefined`.
5. The command surface is untouched — no new op, no new flag (only an enriched return object + a sibling CLI render branch).
6. Canonical pipeline green (build + check + full test; runtime demo of the blocked → fix → resolve-blocked loop showing the summary on BOTH a migration-bearing entry AND a same-version validation-failed entry; fresh adversarial probe). docs-surface-sync pass: the resolve-blocked `description`/`promptSnippet` in ops-registry.ts (it currently describes the commit behavior but says nothing of a change summary), the pi-context-cli README's resolve-blocked surface, and SKILL regen if an op string changed.

### notes (append)

> AUDIT 2026-06-20 (analysis/2026-06-20-audit-TASK-056-proposed-resolution.md): corrected three premises. (a) The per-item "migrated vs unchanged" claim was a false "already-computed" premise — no per-item diff exists; `runMigrations` transforms the whole block. Scoped to counts + did-migration-run, matching `git show --stat` semantics, to avoid scope-creep into an item differ. (b) The merge-base "from" hash is NOT returned today; recovered by widening `stampBaselineFromBody`'s return (one computation point) rather than a second config read. (c) Text surface bound to the existing `update`/`renderConflicts` precedent rather than an invented formatter. (d) Added the optional-version (validation-failed, no-chain) degradation case the original criteria omitted.

---

## Why still SOUND (not HAS-PROBLEMS)

The task's core is correct and not poisoned: the facts it wants ARE largely the discarded in-scope values; "no new op/flag" is the right constraint; the FGAP-076 legibility analogy is apt; declining D2's `--diff` flag is the right call (the summary is the default success output, not a mode). The corrections tighten precision (drop the one non-free fact, name the optional-version case), keep it DRY (widen the stamp, don't re-read config), and remove a "must invent a formatter" framing by pointing at the existing `update` rendering precedent. None of these change the task's intent or scope downward — they make it implementable without an implementer chasing a per-item migrated-set that does not exist or building a parallel render path.
