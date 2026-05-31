# Cycle-2 (Phases A+B) Content-Addressed Substrate Identity — Adversarial Audit

Date: 2026-05-31
Scope: `content-hash.ts`, `object-store.ts`, the new `block-api.ts` additions
(`DEFAULT_METADATA_FIELDS` / `metadataFieldsForSchema` / `readItemMetadataFieldsOverride` /
`collectArrayItemMetadataFields` / `contentProjection` / `SchemaCacheEntry.metadataFieldsByArrayKey`),
the three new test files, and `scripts/orchestrator/runtime-demo-content-addressing.ts`.
Method: source read + working-tree diff vs HEAD + runtime probes against built `dist/` and `tsx`-on-`src`.

Build state: `dist/{content-hash,object-store,block-api}.js` all newer than their sources (mtime
1780210369 > source mtimes). 25/25 Cycle-2 tests pass via tsx; runtime demo passes end-to-end.

**Overall verdict: CLEAN. Zero FLAGs. The content-hash identity guarantee holds and cannot silently
fail through any path exercised this cycle.** One LOW design-note (the override footgun) is documented
below — it is the intended, documented semantics, not a defect; recorded for Cycle-3 wiring awareness.

---

## Probe 1 — Exclusion set is EXACTLY the 10 fields — CLEAN

`block-api.ts:85-93`. `DEFAULT_METADATA_FIELDS` constructed from `...AUTHOR_FIELDS`
(`block-api.ts:66` = `created_by`/`created_at`/`modified_by`/`modified_at`) plus the explicit
`id`, `oid`, `content_hash`, `content_parent`, `closed_by`, `closed_at`.

Runtime enumeration of the built dist:
```
["closed_at","closed_by","content_hash","content_parent","created_at","created_by","id","modified_at","modified_by","oid"]  count: 10
```
Exact set match to the required {id, oid, content_hash, content_parent, created_by, created_at,
modified_by, modified_at, closed_by, closed_at}. No extra (no real content field would collide
distinct items), none missing (id present → a rename moves the hash, as intended). The four author
strings derive from `AUTHOR_FIELDS` (single source of truth, cannot drift from the stamping path) —
not a hand-duplicated copy. `content-projection.test.ts:63-76` asserts the same sorted 10.

## Probe 2 — `canonicalJson` is genuine RFC-8785, not `JSON.stringify` — CLEAN

`content-hash.ts:27-28` routes through `require("canonicalize")` (canonicalize 2.1.0, a CJS RFC-8785
JCS impl), never `JSON.stringify`. Runtime probe against dist:
- key-order independence: `canonicalJson({a:1,b:2}) === canonicalJson({b:2,a:1})` → `true`, both `{"a":1,"b":2}`
- `JSON.stringify` of the same two objects DIFFERS (insertion order) while `canonicalJson` matches → proves it is not stringify
- nested key-order: equal hash → `true`
- number normalization: `{n:1.0}`→`{"n":1}`, `{n:1e2}`→`{"n":100}` (matches the integer forms)
- content change differs: `computeContentHash({a:1}) !== computeContentHash({a:2})` → `true`
- `undefined`-return guard: `canonicalJson(undefined)` THROWS (`content-hash.ts:41-45`) rather than
  hashing the string "undefined". Also confirmed `{a:undefined,b:1}` canonicalizes to `{"b":1}`
  (JCS drops undefined-valued keys, same as JSON) — no string-"undefined" leak.

## Probe 3 — `contentProjection` no-mutate + correct subschema + replace semantics — CLEAN (1 LOW design-note)

`block-api.ts:304-315`: shallow-copies (`{ ...item }`) before `delete`. Runtime: input object retains
all keys after the call (`input-unmutated: true`); `content-projection.test.ts:142-155` asserts the
snapshot equality AND `Object.hasOwn` for id/oid/created_at AFTER the call (not before).

Subschema resolution (`metadataFieldsForSchema` → `collectArrayItemMetadataFields`, `block-api.ts:248-290`)
resolves per array key correctly for multi-array and deeply-nested schemas:
- multi-array `{tasks, notes}`: `tasks`→default set; `notes` (x-identity `["id"]`)→`["id"]`
- deep nesting `reviews.items.findings` (x-identity `["id","oid"]`): `findings`→`["id","oid"]`
- default fires when `x-identity` absent; unknown array key falls back to default (`metadataFieldsForSchema` line 289, `?? DEFAULT_METADATA_FIELDS`)

Override REPLACES, not augments (`block-api.ts:262` `override ?? DEFAULT_METADATA_FIELDS` — not a union):
`notes` override `["id"]` keeps `created_at` as content. Confirmed at runtime.

**LOW design-note (not a FLAG):** because override replaces, an override that omits `id` leaves `id`
in the projection, so a rename WOULD move the content hash. Runtime confirmed: schema with
`x-identity.metadata_fields:["created_at"]` projects `{id:"A",created_at...,title}` to
`{"id":"A","title":"foo"}` (id retained). This is the documented intended semantics
(`block-api.ts:217-236`, `278-290`) and the override is schema-author-controlled, not user-input —
so it is guarded by being a deliberate per-schema declaration. It is a footgun only for a schema author
who declares an override omitting `id`; there is no runtime guard forcing `id` into every override.
Worth a Cycle-3 awareness note if overrides get used; not a Cycle-2 defect (no override ships yet,
the set is dormant).

## Probe 4 — object-store path safety + idempotency + no-corruption — CLEAN

`object-store.ts`. `assertContentHash` (line 37-43, `/^[0-9a-f]{64}$/`) gates put/has/get. Runtime:
rejects `..`, `/etc/passwd`, uppercase-64, 63-char, 65-char, `../`+61×a, and an embedded `/../`
(all threw). `getObject`/`hasObject` also reject malformed (don't silently pass). Idempotent re-put
with DIFFERENT content under the same hash: bytes unchanged AND mtime unchanged (early `return` at
`object-store.ts:78-80` before any write). `getObject` on absent → `null` (line 106-108), no throw.
Hash-named write lands only at `<dir>/objects/<hash>.json`; objects dir after escape attempts contains
only the one legitimate `<64hex>.json` file — no escape. Atomic tmp+rename (`object-store.ts:84-87`)
with tmp cleanup on failure. `object-store.test.ts:44-57` captures bytes+mtime+size before/after with
a 10ms sleep so a real overwrite would have moved mtime — the no-op assertion is meaningful, not vacuous.

## Probe 5 — `SchemaCacheEntry` addition byte-identical for existing reads — CLEAN

`git diff HEAD` on block-api.ts is purely additive. The ONLY changes touching existing code are three
insertions of `metadataFieldsByArrayKey` (interface field at `:127`; the unreadable-JSON entry at `:353`;
the normal entry at `:375`) plus its population at `:360-361`. NOT ONE existing line of
`envelopeDeclares`, `perArrayKey`, `hasAuthorFields`, the cache key (`path.resolve`), or the mtime
compare (`hit.mtimeMs === mtimeMs`) was modified. `hasAuthorFields` still equals
`envelopeDeclares.size > 0 || anyArrayItemDeclares` (line 372). Author-field/stamping behavior is
untouched — the Cycle-1-class regression risk does not materialize here. (The new
`metadataFieldsByArrayKey` cache field is in fact never read anywhere — see Probe 6.)

## Probe 6 — Dormancy — CLEAN

Repo-wide grep (excluding the defining files, the three tests, the demo, and `.d.ts` build artifacts)
finds ZERO callers of `computeContentHash` / `contentProjection` / `putObject` / `getObject` /
`hasObject` / `canonicalJson` / `metadataFieldsForSchema` in any write path
(`writeBlock`/`appendToBlock`/`writeTypedFile`/upsert/update). The cache field
`metadataFieldsByArrayKey` is POPULATED at `getSchemaCacheEntry` but never READ — confirming the
declared "purely additive, nothing reads it until Cycle 3" claim. Fully dormant.

## Probe 7 — Test honesty (false-pass hunt) — CLEAN

- `content-hash.test.ts:14,18,35` compare two distinctly-built objects' computed hashes (not the same
  call twice). `:23-24` deterministic compares `c` vs spread `{...c}`. `:39` proves array order matters.
  `:48` proves the undefined throw.
- `content-projection.test.ts:105-123` metadata-only-change test builds `base` and a separately-spread
  `metadataMutated` (different oid/created_at/content_hash), projects BOTH, asserts the projections
  deep-equal AND the two computed hashes equal — through the projection path, comparing two different
  source items, not an item to itself.
- `:142-155` asserts input unmutated AFTER the call (snapshot taken before, compared after).
- `object-store.test.ts:44-57` idempotency captures bytes+stat before, sleeps 10ms, re-puts different
  content, compares bytes+mtime+size after — a real overwrite would fail it.
- Malformed-hash coverage exercises put (`:64-79`), AND get+has (`:81-84`).
No assertion found that fails to test its stated claim.

## Probe 8 — canonicalize interop / createRequire — CLEAN

`content-hash.ts:27` `const require = createRequire(import.meta.url)`; `:28`
`require("canonicalize") as (input:unknown)=>string|undefined`. canonicalize 2.1.0 is CJS
(`main: lib/canonicalize.js`, no `"type":"module"`, no `exports`) so `require` returns the function
directly — matching the cast. Compiled dist preserves it verbatim (`dist/content-hash.js:26-27`:
`createRequire(import.meta.url)` / `require("canonicalize")`). No leftover/broken default import
anywhere (`grep "import canonicalize"`/`from "canonicalize"` → none). Resolves at runtime under both
the built dist (node `--input-type=module`) AND `tsx`-on-`src` (`computeContentHash({a:1})` returned a
valid 64-hex digest in both). `import.meta.url` is valid under the package's `module:Node16` ESM setup.
`canonicalize` is declared in pi-context `dependencies` (`package.json:119`, `^2.0.0`), and
`./content-hash` + `./object-store` are declared subpath exports (`package.json:28-34`).

---

## Summary of FLAGs

None. One LOW design-note (Probe 3): override-replace semantics means a schema author who declares an
`x-identity.metadata_fields` override omitting `id` would let a rename move the content hash. Documented,
intended, schema-author-controlled, and dormant (no override ships). Recommend a Cycle-3 note when
overrides are first authored; no Cycle-2 code change warranted.

"Green" is real: build fresh, 25/25 tests pass for the right reasons, runtime demo passes against the
actual library surfaces, and the one existing-code change is verifiably additive with no regression to
the author-field/stamping path.
