# The op-registry is a lossy, attestation-blind projection of the pi-context library

**Date:** 2026-06-04. **Status:** analysis → gap-determination (pre-filing). **Scope:** the `ops-registry.ts` op surface that `pi-context-cli` reflects and that in-pi tools consume, versus the underlying library surface (`block-api` / `context` / `context-sdk` / `schema-write` / `context-registry` / `context-dir` / `promote-item`). **Method:** read-only investigation by a fresh agent; the load-bearing "contract" spine was independently re-verified by the orchestrator (citations marked ✓-verified).

## 1. The seed example

The cli/op `append-block-item` (`ops-registry.ts:154-177`) calls `appendToBlock(cwd, params.block, params.arrayKey, params.item)` at `:174` ✓-verified — dropping the 4th argument `ctx?: DispatchContext`. Its `parameters` schema declares no `writer`, and the global `--writer` flag is parsed by the cli but never reaches the handler. So no attestation stamping occurs (`stampItem`, `dispatch-context.ts:121-152`, only stamps `created_by`/`created_at` when given a writer), and on schemas that *require* those fields the cli filing fails AJV or lands unattested. The orchestrator script `scripts/orchestrator/file-block-item.ts` does NOT have this problem: it builds a `WriterIdentity`, stamps, and passes `ctx` as the 4th arg (`:233`, `:273`). The difference is the surface, not the library.

## 2. The class

The op-registry is a **lossy projection** of the library: every place the `run(cwd, params)` handler boundary narrows what the library can actually do. The dropped writer/`ctx` is one *parameter* of many; write ops are one op-*category* of many. Members are of two kinds:

- **(A) Missing capability** — an exported library function (a real operation one can perform with pi-context) has no op-registry entry, so it is unreachable from the cli / out-of-pi.
- **(B) Parameter under-projection** — an op exists, but its handler forwards only a subset of the parameters its underlying library function accepts, silently dropping the rest (`ctx`/writer, `dryRun`, `ordinal`, operation-modes, optional flags).

## 3. Root mechanism (one contract-level omission) — ✓-verified

This is not a set of per-handler slips; it is a single structural omission:

- `OpDefinition.run(cwd: string, params: P)` — **no `DispatchContext` channel** in the contract (`ops-registry.ts:104` ✓-verified).
- The in-pi registration passes only `ctx.cwd`: `op.run(ctx.cwd, params as never)` — the pi `ExtensionContext`'s identity is never threaded (`ops-registry.ts:1519` ✓-verified).
- The cli can deliver a writer ONLY by matching a `writer` property in an op's own `parameters` schema: `injectWriter` sets `params.writer` iff `props.writer !== undefined` (`cli.ts:292` ✓-verified), then `op.run(cwd, params)`.

Consequently: (A) any library write fn the registry never lists is unreachable; (B) any op whose schema omits `writer` structurally cannot forward the library's `ctx` — attestation is dropped *by construction*. Every library writer's `ctx?` is optional-and-last, so omitting it is silent and type-valid. The seed `append-block-item` drop is one deterministic instance of this one omission.

## 4. Member-type (B): ops that drop the library `ctx` (attestation-blind)

| Op (run @ ops-registry.ts) | Library fn | ctx slot |
|---|---|---|
| `append-block-item` (:174) | `appendToBlock` (block-api.ts:1881) | dropped |
| `update-block-item` (:202) | `updateItemInBlock` (:1916) | dropped |
| `append-block-nested-item` (:337) | `appendToNestedArray` (:2016) | dropped |
| `update-block-nested-item` (:382) | `updateNestedArrayItem` (:2067) | dropped |
| `remove-block-item` (:411) | `removeFromBlock` (:2112) | dropped |
| `remove-block-nested-item` (:448) | `removeFromNestedArray` (:2157) | dropped |
| `write-block` (:512) | `writeBlock` (:1822) | dropped (op is authGated yet never stamps) |
| `append-relation` (:237) | `appendRelationByRef` (context-sdk.ts:1384) | dropped (`ordinal` IS forwarded; ctx is not) |
| `amend-config` (:779) | `amendConfigEntry` (context.ts:919) | literal `undefined` passed at ctx slot (`dryRun` forwarded) |
| `write-schema` (:863) | `writeSchemaChecked` (schema-write.ts:483) | literal `undefined` at ctx slot (`dryRun` forwarded) |

Ten rows. Every cli filing or mutation lands unattested; on attested-required schemas it fails outright unless the caller hand-authors `created_by`/`created_at`.

## 5. Member-type (A): library capabilities with no op (unreachable from the cli)

| Capability | Location | Note |
|---|---|---|
| edge removal | **`removeRelation` does not exist** | the library itself has no edge-removal fn; relations are append-only. The already-filed **FGAP-006** is exactly this cell. |
| whole-relations replace | `writeRelations` (context.ts:562) | the only way to delete/reorder edges; no op. |
| atomic find-or-replace | `upsertItemInBlock` (block-api.ts:1968) | race-safe upsert; no op (used only by pi-behavior-monitors directly). |
| whole-config write | `writeConfig` (context.ts:673) | no op (only scoped `amend-config`). |
| skeleton config write | `writeSkeletonConfig` (context.ts:745) | no op. |
| unchecked schema write / mutator | `writeSchema`, `updateSchema` (schema-write.ts:393,509) | no op. |
| registry writes | `writeRegistry`, `registerSubstrate` (context-registry.ts:157,194) | foreign-substrate registration unreachable from cli. |
| raw pointer writes | `writeBootstrapPointer`, `flipBootstrapPointer` (context-dir.ts:213,283) | no op (only higher-level init/switch). |
| bulk edge append | `appendRelations` (context.ts:613) | no op (only singular). |

## 6. Boundary / faithful counter-surfaces

These prove the loss is in the op projection, not the library:

- **Ops that smuggle a writer through their schema** (the only available channel): `promote-item` (schema `writer`, re-wrapped to ctx at run, `:289-298`), `write-schema-migration` (schema `writer` + auth-gate verified identity), `context-switch` (derives `writerIdentity` string, not a `DispatchContext`, `:1024`).
- **Partial-member wart:** `context-archive` *declares* `writer` in its schema (`:1066-1079`) but its handler calls `archiveSubstrate(cwd, params.target_dir)` and never reads `params.writer` (`:1083`) — the smuggle channel is itself dropped.
- **Direct-library consumers that attest correctly:** the orchestrator scripts (`file-block-item.ts:273`, `append-relation.ts:196`, `promote-item.ts`) and **pi-behavior-monitors** (`index.ts:1604-1612`, building `{writer:{kind:"monitor",…}}` and even reaching `upsertItemInBlock`, the primitive with no op).

## 7. Cross-package replication

The same drop recurs wherever a handler calls the library writers without threading ctx:

- **pi-workflows** `step-block.ts`: `writeBlock` (:161), `appendToBlock` (:203), `updateItemInBlock` (:219), `appendToNestedArray` (:233), `removeFromBlock` (:278), `removeFromNestedArray` (:301) — all drop ctx; `workflow-executor.ts:889` uses only `ctx.cwd`. Workflow-written substrate items are unattested.
- **pi-agent-dispatch / pi-jit-agents:** not substrate-array writers; construct their own dispatch contexts. Not class members.

## 8. Impact

- The cli is **not a faithful interface to pi-context**: out-of-pi callers cannot attest writes and cannot reach a large part of the library write surface (edge removal/replace, upsert, whole-config/schema/registry/pointer writes).
- Every cli- or workflow-written item is **unattested** — the DispatchContext attestation model (`created_by`/author stamping, monitor/agent/human/workflow writer kinds) is silently bypassed on those surfaces.
- The dual-surface principle ("library + tool + script as a unit") is **violated and unenforced** — orchestrator scripts and ops diverge for the same library fn, and nothing catches it.

## 9. Gaps to file (determination)

The class decomposes into the following fileable gaps. (The two already-filed items — **FGAP-006** edge-removal, and the un-filed append-block-item ctx-drop — are specific instances, named below.)

1. **GAP-α — attestation channel absent from the op-execution contract (the (B) root).** `OpDefinition.run(cwd, params)` carries no `DispatchContext`, so every cli/in-pi write op is attestation-blind and fails attested-required schemas. Spans the 10 (B) rows + the pi-workflows `step-block` writers + the `context-archive` declared-but-ignored wart. *Resolution direction:* thread a writer/`DispatchContext` through the op-execution contract itself (so all write ops stamp uniformly), not per-op schema smuggling. The append-block-item case is the named instance.

2. **GAP-β — op-registry does not cover the library write surface (the (A) root).** Library write capabilities have no op and are unreachable from the cli (§5 list). *Resolution direction:* a systematic op per library write capability + a parity check that fails when the registry omits a library writer. **FGAP-006 (no edge-removal op) is a specific instance** — and it has a sub-layer: the library lacks `removeRelation` entirely, so β includes adding the missing library primitive *and* its op.

3. **GAP-γ — no enforced parity across the library ↔ op-registry ↔ orchestrator-script surfaces.** The three surfaces silently drift (scripts attest + expose params the ops drop; the registry omits library fns). *Resolution direction:* a coverage/parity test (the dual-surface "unit" made checkable) so a library writer without an op, or an op that drops the ctx/params its script forwards, is caught at build/test.

These three are the parent class; **GAP-006 ⊂ GAP-β** and the append-block-item finding ⊂ GAP-α. A single governing decision (thread ctx through the op contract + a parity check + complete the op surface) plausibly covers α/β/γ; whether to file one class FGAP with three facets or three FGAPs + one DEC is the open call for the filing step.

## 10. Verification note

Spine independently re-verified by the orchestrator: `ops-registry.ts:104` (no ctx in run contract), `:1519` (registerAll passes only `ctx.cwd`), `cli.ts:292` (writer injected only when schema declares it), `:174` (append-block-item drops ctx). The §4/§5/§7 enumerations are the agent's full-surface map (cited but not each independently re-walked); the contract conclusion they rest on is verified.
