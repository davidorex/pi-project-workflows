# FGAP-046 — preserving user schema edits across `pi-context update`: git-3-way reframed against the code

Date: 2026-06-07
Status: findings document for a `research` item (R-0008) + input to the FGAP-046 merge-route DECISION. Read-only investigation; nothing changed.

Two routes are on the table (FGAP-046 `proposed_resolution`): (1) deterministic 3-way merge / overlay, (2) agent-mediated reconciliation in `pi`. This document reframes the git-3-way-merge model against the code, corrects an over-claim, and frames the decision. All citations are file:line.

## The git-merge synthesis, scored against the code

| Synthesis claim | Verdict | Where the code lands it |
|---|---|---|
| Merge needs a base; we kept only a SHA-256 (irreversible); base-stamping is a precondition | **RIGHT** | `installed_from.assets` stores `{content_hash, version}` only (`context.ts:79`); the base body is not retained. |
| Merge by structure, not line; FEAT-002 exists to avoid line-mangled JSON | **RIGHT** | FEAT-002 AC "rather than line-mangled JSON". |
| Auto-merge disjoint, surface overlapping as a typed conflict set | **RIGHT** | DEC-0004 §8 "typed structured conflict set … not inline text markers". |
| Resolver is separate + pluggable → hybrid | **RIGHT in spirit, NET-NEW in fact** | The conflict *set* is designed (DEC-0004 §8); a *resolver* (agent/human mergetool) is designed nowhere — a new seam FGAP-046 introduces. |
| R1's merger is "largely not net-new"; FGAP-046 *consumes* FEAT-002's merge primitive | **PARTLY WRONG — code corrects it** | FEAT-002 is `proposed` and entirely unbuilt; its schema sub-strategy is named but unauthored. "Consume FEAT-002's merger" = co-design a not-yet-existing shared framework. |

## 1. FEAT-002 is design-only
FEAT-002 (`proposed`, L1) specifies a git merge driver consuming git's `%O/%A/%B`. **No implementation exists** — no merge driver, 3-way module, or merge-finalize command in any `packages/*/src`; no `.gitattributes` registers a `merge=pi-context` driver. Today's reality: the drift detector (`checkStatus`, `index.ts:858-949`) and the replace-based resync (`resyncSchema`, `index.ts:464-583`) exist; everything 3-way-merge is design-only. "Consume FEAT-002's merger" therefore means **design one shared merge framework that does not yet exist**, not reuse code.

## 2. The crux — schema-merge is a DISTINCT sub-strategy, not "the same primitive"
DEC-0004 / FEAT-002 specify a structure-aware 3-way merge **framework with per-file-TYPE strategies**: block `<name>.json` → items by stable id/oid (§2-3); `relations.json` → edge-set on `(parent,child,relation_type)` (§4); ordered ref-fields → the convergent sequence field-kind (DEC-0005/FGAP-005); `objects/` → git directory union (§5); **config/schema → "3-way; divergent redefinition of the same block_kind / relation_type / schema → surfaced conflict" (§6) — one clause, no algorithm**.

A schema file is a draft-07 JSON document (a `properties` map, a `required` array, enum arrays, `$ref`s) — **not** an id-keyed item array. Its merge sub-strategy is a **key/path-level recursive object merge** (objects merged by key; `required`/enum/`type`-union arrays as **sets**; scalar/`$ref` leaves as side-changed-vs-base), structurally distinct from the id-level block strategy. **DEC-0004 names schemas in scope but does not author the schema-merge algorithm.** The shared thing is the framework + the conflict-set shape; the schema sub-strategy is a distinct, to-be-designed piece.

FEAT-002 also assumes a different **base source**: git's `%O` (DEC-0004 consequence: "merge does NOT use content_parent for base-finding; git's %O is the base"). FGAP-046 has **no git base on the update axis** — the catalog ships outside the user's git history — so its base must come from base-stamping (§3). The catalog-update axis is **outside FEAT-002's stated same-repo scope**.

## 3. Base-stamping — the exact change (the precondition)
`installContext` builds `assets` at `index.ts:738-754` (`{content_hash, version}` per schema, hashed from the dest file via `computeFileContentHash`, `content-hash.ts:82-84`) and writes `installed_from` at `:780-784`; asset type `context.ts:71-80` (body-less at `:79`).

**Preferred shape — reuse the content-addressed object store (no type change).** `object-store.ts` writes any JSON under `<substrateDir>/objects/<contentHash>.json` via `putObject` (`object-store.ts:76-97`), reads via `getObject` (`:103-110`), keyed by the **same** JCS/SHA-256 path (`content-hash.ts:82-84`) that the asset's `content_hash` already records (`index.ts:750`). So:
- At baseline time (`index.ts:747-753`), additionally `putObject(destRoot, assets[name].content_hash, schemaJson)` — one idempotent write; the asset's existing `content_hash` is the retrieval key. **No change to `context.ts:79`.**
- At merge time, the base body is `getObject(destRoot, baselineAsset.content_hash)`.

Caveat: `object-store.ts` is "dormant this cycle: nothing in any write path calls `putObject` yet" (`object-store.ts:21`) — this is a new but clean consumer; `objects/` is git-tracked. Base-stamping is **purely additive**: `checkStatus` is unchanged (still off `content_hash`, `:884-885`); base-stamping supplies the body its `locally-modified` verdict (`:926-927`) currently cannot act on beyond refuse/overwrite.

## 4. Hybrid wiring — the seam
Current: the resync replace is `resyncSchema(...)` at `index.ts:666`, reached on `destExists && overwrite` (`:662`), `overwrite` from `--update` (`:1474-1475`); `resyncSchema` has no drift awareness (blind copy `:478-481`; version-gap migrates item DATA not schema shape `:534-564`). FEAT-006 explicitly faults this ("update … overwrites locally-modified schemas … never consults the drift detector that already exists").

Hybrid slots into FEAT-006's update command: consult `checkStatus` (`index.ts:858`) **before** the replace, branch on `state`:
- `in-sync` / `catalog-ahead` → today's verbatim/migrate path (correct, no merge).
- **`locally-modified` / `both-diverged`** (`:926-930`) → run the deterministic schema-merge with **base** = base-stamped body (`getObject(destRoot, baselineAsset.content_hash)`), **ours** = installed dest (`installedSchemaDestPath`, hashed at `:905`), **theirs** = catalog source (hashed at `:892-894`). Auto-apply the clean merge (atomic schema write); route the typed conflict set to a resolver.

Two resolver wirings (both NET-NEW; the hybrid's pluggable leg):
1. **User-facing conflict report** — render `{path, base, ours, theirs}` (analogous to `renderCheckStatus`, `:957`); leave the schema unmodified pending a human decision.
2. **`pi`-bound agent mergetool** — dispatch a bounded `pi` session (`runPiBound`, `pi-bound.ts:298-305`) granted `read-schema` (`ops-registry.ts:1141`, not auth-gated) + `write-schema` (`:1183`, `authGated:1201`, has `dryRun:1198`); the agent reconciles by judgement and writes via `write-schema`, forced through the auth-gate (`auth-gate.ts:148-211`) — **non-interactive context refuses unconditionally** (`:156-160`), interactive prompts `ctx.ui.confirm`; `dryRun` lets the agent meta-validate before the gated write. This is FGAP-046's route-2 "agent-mediated update in pi … by judgement".

No change to the auth-gate or pi-bound is required for resolver #2 — only a grant set + a dispatch call.

## 5. FGAP-046 ↔ FEAT-002 coupling + ordering
FGAP-046 (`identified`, P2) is addressed-by FEAT-006 (`proposed`, L4); FEAT-002 (`proposed`, L1) is the git-merge-driver feature under DEC-0004 (`enacted`).

**FGAP-046 does NOT depend on FEAT-002 shipping.** It depends on a to-be-built structure-aware-merge framework that FEAT-002 also needs. The two consume the same framework on **different axes with different base sources**: FEAT-002 merges two git branches (base = git `%O`); FGAP-046 merges installed-vs-catalog on update (base = base-stamping). The catalog-update axis is out of FEAT-002's stated same-repo scope.

**Ordering implication:** the schema-merge module (parse-3-way-classify-emit + schema sub-strategy + typed conflict set) can be built under **either** feature and consumed by both; it need not wait for FEAT-002's git-driver plumbing (`.gitattributes`, `%O/%A/%B`, edge-set/sequence strategies). FEAT-006 can decompose the **schema sub-strategy + base-stamping** as a standalone slice that lands independently of FEAT-002, designed so FEAT-002 later reuses the framework via its `%O` base. Restate the synthesis: *build the shared framework + schema sub-strategy once (whichever feature ships first); both consume it* — and FGAP-046 building the schema slice first is viable and natural.

## 6. Reframed decision frame (not picking a route)
**R1 — deterministic 3-way schema-merge.** Net-new = base-stamping (§3, small under the object-store option) **+ the entire schema-merge framework and sub-strategy** (FEAT-002 unbuilt, schema strategy unauthored). FEAT-002 sharing lowers *eventual program* cost (one framework, two axes), NOT *immediate first-slice* cost. Moderate-to-high build, mostly the merge engine. Deterministic, offline, no LLM; cannot resolve genuine semantic conflicts (overlapping edits to the same node) — those fall to the conflict set.

**R2 — agent-mediated.** Lowest net-new — reuses `pi-bound` + `read-schema`/`write-schema` + `dryRun` + auth-gate as-is; net-new is dispatch wiring + prompt. Still wants base-stamping to give the agent an ancestor. Handles semantic conflicts by judgement; non-deterministic; gated behind interactive auth-confirm (cannot run unattended `--update`).

**Hybrid (the git-shaped answer).** Deterministic merge for clean/disjoint cases (R1 engine, auto-apply) + a resolver (user report OR R2 agent) on the typed conflict set. Cost = R1's engine + the cheap resolver seam. Coverage = best — deterministic where possible, judgement where necessary, never silent-clobber.

**Synthesis right vs corrected:** right — the git mapping, base-stamping precondition, structure-not-line, typed conflict set, hybrid shape, pluggable resolver. Corrected — FEAT-002 unbuilt (co-design, not reuse); schema sub-strategy distinct + unauthored; base axis differs (git `%O` vs base-stamping; catalog axis out of FEAT-002 scope); R1's *immediate* cost is the merge engine; the resolver is genuinely net-new (only the conflict set is pre-designed).

## Key file:line anchors
- Replace-resync (the gap): `index.ts:464-583`; blind copy `:478-481`; item-data migrate `:534-564`; call site `:666`; `--update` flag `:1474-1475`.
- Drift detector: `checkStatus` `index.ts:858-949`; `locally-modified` `:926-927`; ours `:905`; theirs `:892-894`; baseline `:884-885`.
- Baseline write (base-stamping target): `index.ts:738-754`, `:780-784`; asset type `context.ts:71-80` (body-less `:79`).
- Content-addressing: `content-hash.ts:40-84`; object store `object-store.ts:59-110` (dormant `:21`).
- Merge ops: `read-schema` `ops-registry.ts:1141` (not gated); `write-schema` `:1183`, `dryRun:1198`, `authGated:1201`.
- Auth-gate: `auth-gate.ts:148-211` (non-interactive refusal `:156-160`).
- pi-bound: `pi-bound.ts:298-305`.
- Governing items: FEAT-002 (proposed, L1), FEAT-006 (proposed, L4), FGAP-046 (identified), DEC-0004 (enacted, §6 schema clause), DEC-0005/FGAP-005 (sequence field-kind).
