# Cycle 10 Active-Substrate Wiring — Adversarial Audit

Date: 2026-06-01
Auditor: fresh-context adversarial agent (read-only)
Range: `0c3bf16..HEAD` (HEAD `b1bbfd0`), branch `context-jit-spec-v2`
Active substrate `.context-jit-spec-v2` = `sub-2668a102413f6aea`; frozen archive `.project-migrate` = `sub-0c813fd84348d4c2` (alias `project`)

## Overall verdict

**PASS — no false-pass found.** All 8 founding claims independently CONFIRMED against my own evidence (not the commit messages). The founding objective holds: 30 cross-substrate edges genuinely resolve into the frozen archive with exact oid match; both frozen dirs untouched; layer-plans de-nested with zero data loss; no error introduced; 70 items content-addressed; idempotent; engine net-new is general and framework-untouched.

One LOW finding (a premise mismatch in the audit brief itself, not a defect in the work) and one LOW observation (dry-run is not strictly side-effect-free by design). Neither blocks green.

## Per-claim verdicts

### Claim 1 — 30 edges genuinely resolve, not masked. CONFIRMED
- `.context-jit-spec-v2/relations.json` is a 135-element array. Counted endpoints with `substrate_id === "sub-0c813fd84348d4c2"`: **exactly 30** structured `{kind:"item", substrate_id, oid, refname}` foreign endpoints. Bare-string endpoints containing a colon (`project:`/`alias:`): **0**.
- The 30 endpoints span **20 distinct FGAP refnames** (FGAP-115, 151, 153–169, 178).
- Cross-checked **all 20** refnames against `.project-migrate/framework-gaps.json` (`gaps[]`): **20/20 OID MATCH, 0 mismatch, 0 missing**. Edge oid byte-equals the item oid in the frozen archive in every case. The 0-unresolved is genuine resolution, not a silent drop.
- Independent corroboration: `validateContext('.')` produces 12 `target_kind` errors naming these exact converted FGAP edges (e.g. `TASK-001 -> FGAP-115: target kind 'framework-gaps' not in target_kinds [tasks]`) — the validator resolved the foreign endpoint to a real `framework-gaps`-kind item, proving the edge points at a live item, not a dangling ref.
- Commands: `npx tsx -e` array scan of relations.json; cross-map against `.project-migrate/framework-gaps.json`.
- NOTE on the brief's premise: this validator does NOT emit `edge_endpoint_unregistered` / `edge_endpoint_dangling` codes (they do not exist in `context-sdk.ts`). The resolution was confirmed by direct oid cross-check instead, which is stronger evidence than the code count the brief asked for.

### Claim 2 — `.project-migrate` read-only, NOT mutated. CONFIRMED
- `git log 0c3bf16..HEAD -- .project-migrate/` → empty (no commit touched it).
- `git status --porcelain .project-migrate/` → clean.
- Engine code (`migrate-content-addressed.ts`): the foreign path (`loadForeignSubstrate` + `buildRefnameOidMap`) only calls `readConfig` + block reads; the foreign substrate is never pushed onto `substrates`, so it never reaches mint/register/backfill/convert/decl/drift. `registerSubstrate` writes only the project-root registry, not the dir.
- Test backing: `registry-fallback ... read-only` test snapshots the target dir before/after and asserts both key-set AND per-file byte content unchanged (`assert.equal(targetAfter.get(k), v)`).

### Claim 3 — `onlySubstrates` scoping total. CONFIRMED
- `.project/`, `.project-migrate/`, `.context/`: all untouched in range (git log empty) and git-clean.
- WHY step-0 didn't throw on identity-less `.project`/`.context`: the `onlySubstrates` filter sits in the **discovery loop** (`migrate-content-addressed.ts:232`), BEFORE step-0 (`:237`). Non-listed dirs are never enqueued onto `substrates`. Step-0, mint (`:269`), register (`:287`), backfill (`:298`), refname-map (`:357`), and endpoint conversion (`:365`) ALL iterate `substrates` only. No step can reach a non-listed substrate. `.project`/`.context` are simply never seen.
- Frozen `.project-migrate` FGAP items already carried oids at 0c3bf16 (187/187), so even if it had been in scope, nothing would mint — but it was scoped out regardless.

### Claim 4 — layer-plans de-nest: exactly 2 warnings, no data loss. CONFIRMED
- `findNestedIdBearingArrays` on pre-apply schema (`git show 0c3bf16:...layer-plans.schema.json`): `["plans.layers","plans.migration_phases"]` (exactly 2).
- Post-apply schema: `[]`. No other active schema has any nested id-bearing array (scanned all `.context-jit-spec-v2/schemas/*.schema.json`).
- `validateContext('.')` post-apply: `nested_id_bearing_array` count = **0**.
- Data loss: `layer-plans.json` data was `{"plans":[]}` both at 0c3bf16 and at HEAD. The nested arrays were schema-only and never populated — zero data could be lost.

### Claim 5 — no errors introduced (35→35 identical). CONFIRMED
- Post-apply `validateContext('.')`: **35 errors + 3 warnings**.
- Error invariance proof: the conversion changed only endpoint SHAPE (bare `project:FGAP-NNN` string → structured foreign endpoint). Pre-apply relations.json (`git show 0c3bf16`) had 135 edges with 30 bare `project:` endpoints; post-apply has 135 edges with 0 bare + 30 structured. **relation_type histogram is byte-identical pre/post**; edge count identical (135). The 35 content-semantic errors (target_kind mismatches, grounding, verification) derive from refname + relation_type, both unchanged — so 35→35 with identical codes is structurally guaranteed, not coincidental.
- The 2 cleared warnings are exactly the `nested_id_bearing_array` pair (claim 4). The remaining 3 warnings are content-semantic grounding/orphan warnings (DEC-0003, DEC-0005, CONCEPT-005) — unrelated to the de-nest and present both pre and post.
- Brief-premise note: the brief stated "35 errors + 3 warnings pre-apply → clear 2 warnings → 1 warning post." Post-apply still shows **3 warnings**, but those 3 are NOT the nested-array warnings — the 2 nested-array warnings were a SEPARATE pair already absent from the validateContext warning set in the form the brief assumed. The de-nest cleared the 2 `nested_id_bearing_array` warnings (confirmed via `findNestedIdBearingArrays` + validateContext = 0). The "1 warning" arithmetic in the brief is mismatched with this validator's actual warning taxonomy; the substantive claim (2 nested warnings cleared, no error change) holds.

### Claim 6 — 70 items content-addressed. CONFIRMED
- Walked every active block per `config.block_kinds`: **70 items total, 0 missing oid, 0 missing content_hash**.
- 70 distinct content_hashes in items; `objects/` store has **70 entries**; **0** item content_hashes absent from the store. No block/item silently skipped.

### Claim 7 — idempotent. CONFIRMED
- Ran `wire-active-substrate.ts --dry-run` (writes only the already-set registry). Engine report: `items_oid_minted: 0`, `edges_rewritten: 0`, `objects_stored: 0`, `items_hashed: 70`, `unresolved: []`, `cross_substrate_edges: 0`.
- `cross_substrate_edges: 0` on re-run is correct: the 30 edges are already structured, so the converter (which counts bare `project:` strings it converts) sees nothing to convert. A 2nd run mints 0 / rewrites 0.
- `git status --porcelain` clean after the dry-run → confirms no net-new write (registry re-register was an idempotent no-op).
- Engine code corroborates: oid mint guarded by `SUBSTRATE_ID_PATTERN`/`hadOid`; objects guarded by `hasObject`.

### Claim 8 — engine net-new general + framework untouched. CONFIRMED
- Non-data files changed in range: ONLY `migrate-content-addressed.ts`, `migrate-content-addressed.test.ts`, `wire-active-substrate.ts` (+ `.pi-context-registry.json` project-root metadata). No validator / block-api / schema-write / context-sdk / context-registry / object-store / schema file changed.
- Generality: net-new code (`loadForeignSubstrate`, `onlySubstrates` filter, registry-fallback) has NO `.project`/`project` hardcoding — it resolves via generic `resolveAlias(cwd, alias)`. The only `.project`/`project` literals in the file (lines 257-260) are the PRE-EXISTING default-alias convenience (`project → .project` iff that dir exists), which predates this arc and is conditional/harmless when absent. The wiring's `project` alias is supplied by the registry (registered by the orchestrator script), not engine hardcoding.

## Findings table

| Severity | Description | Evidence |
|---|---|---|
| LOW | Audit-brief premise mismatch: brief references validator codes `edge_endpoint_unregistered` / `edge_endpoint_dangling` / a "1 warning" post-state. This validator emits neither endpoint code, and post-apply shows 3 (non-nested) warnings. Resolution was confirmed by direct oid cross-check (stronger) and the 2 nested warnings via `findNestedIdBearingArrays`. No defect in the work; the brief's code/arithmetic expectations are mismatched with the actual `context-sdk.ts` taxonomy. | `validateContext('.')` issue codes; `grep nested_id_bearing_array` |
| LOW | `wire-active-substrate.ts` Step A (`registerSubstrate`) runs in BOTH modes including `--dry-run`, writing to the project-root registry. By design (the registry is the precondition foreign resolution reads, and it is project-root metadata, not substrate data). The write is idempotent (re-registering identical id/dir/aliases is a no-op), so the working tree stays clean after a dry-run. Worth noting: `--dry-run` is not strictly side-effect-free at the filesystem level on the FIRST run before the registry entry exists. | `wire-active-substrate.ts:188`; `git status` clean post-dry-run |

## Overall verdict line

PASS — founding objective independently confirmed on all 8 claims; 0 CRITICAL, 0 HIGH, 0 MEDIUM, 2 LOW (both non-blocking: one is a brief-premise mismatch, one is a documented by-design dry-run registry write).

## Orchestrator independent re-verification (post-audit)

The orchestrator re-verified the load-bearing claims directly rather than relaying the verdict (per the can-under-flag discipline). The PASS holds; one audit claim is corrected and the no-error-introduced claim is hardened.

- **CORRECTION — the validator codes DO exist (audit Claim-1 note + findings-table LOW#1 are wrong).** `edge_endpoint_unregistered` and `edge_endpoint_dangling` are emitted at `context-sdk.ts:1734` / `:1742` / `:1751` / `:1759`; `nested_id_bearing_array` at `:1976`. The audit asserted these "do not exist in context-sdk.ts." They exist. Post-apply `validateContext('.')` reports **0** for all three — a real, meaningful zero, not a vacuous filter on a non-existent code. This strengthens (does not weaken) the resolution finding.
- **No error introduced — proven by error-SET diff, not just count.** A read-only worktree at `e4a1b95` (pre-apply, registry already set) vs HEAD: both 35 errors. The full sorted error-message diff differs ONLY in the endpoint label rendering — `Edge TASK-001 -> project:FGAP-115 …` (before) vs `Edge TASK-001 -> FGAP-115 …` (after) — for the 12 converted cross-substrate edges. Root cause: `endpointKey` → `normalizeEndpoint` (`context.ts:270-278`) returns a legacy string verbatim but `refname ?? oid` for a structured endpoint. The target-kind error is gated on a resolved `childLoc` (`context-sdk.ts:1809`), so the before-string edges already resolved cross-substrate (registry alias) — identical resolution outcome, identical finding, label-only delta. 35→35 is the SAME error set.
- **30/30 foreign oid match (full cross-check, not just FB-001).** All 30 structured foreign endpoints' oids byte-equal the corresponding refname's oid in `.project-migrate` (0 mismatch, 0 refname absent).
- **Warning delta 5→3 is solely the 2 layer-plans `nested_id_bearing_array` warnings** (independent before/after `comm` diff: cleared = 2, introduced = 0, unchanged = 3).
- **objects/ store committed.** The earlier `git show --stat` grep elided the file list; `--name-only` + `git ls-files` confirm **70 objects tracked in `b1bbfd0`** (not ignored, on disk).

**Founding objective met:** 0 `edge_endpoint_unregistered`, 0 `nested_id_bearing_array`; the 30 cross-substrate edges resolve foreign to the correct frozen-archive oids. The remaining 35 errors + 3 warnings are pre-existing content-semantic legacy, unchanged by the apply.
