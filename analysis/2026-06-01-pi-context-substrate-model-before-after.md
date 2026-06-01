# pi-context substrate model — before → after (feeds README + skill + repo docs)

A pi-context **substrate** is a directory of typed JSON **blocks** (e.g. `decisions.json`, `tasks.json`) — each an array of items — plus `relations.json` (edges), `schemas/` (one JSON-Schema per block kind), and `config.json` (block_kinds / relation_types / invariants / substrate_id). The content-addressed-substrate-identity arc (Cycles 1–10) changed what a substrate fundamentally IS. This is the before→after.

## BEFORE — ad-hoc substrates (what the legacy substrates were)

- **Item identity = a human refname only** (`FGAP-153`, `TASK-021`) — a *mutable label* that collides across substrates. An edge naming `FGAP-153` is ambiguous (which substrate's? which version?).
- **Relationships expressed three inconsistent ways:** closure-table edges in `relations.json`, AND **embedded nested id-bearing arrays** (`features → stories → tasks`, `plans → layers / migration_phases`), AND **FK-like reference fields** (`depends_on`, `related_*`, `gates`). Same idea, three representations.
- **Cross-substrate references = fragile strings** (`project:FGAP-153`) that **don't resolve** — no stable identity to point at and no registry mapping the alias to a substrate. (This project carried 30 such broken edges — the founding FGAP-185.)
- **No content-addressing:** no version fingerprint, no version history, no integrity hash, no dedup.
- **Schemas drifted:** the same block kind shaped differently per substrate; `$ref`-into-`definitions` trees; missing `$id`/`version`; no identity fields.
- **No substrate identity:** no `substrate_id`, no project-root registry → cross-substrate edges structurally cannot resolve.

## AFTER — canonical pi-context (what is now enforced)

- **Three-layer item identity.** Each item carries: `refname` (the human label, mutable) + **`oid`** (a permanent, content-independent, immutable entity id, unique within its substrate, minted once at birth) + **`content_hash`** (SHA-256 of the item's content projection — a version fingerprint; identical content dedups) + **`content_parent`** (the prior version's content_hash — a per-item version chain). **Edges point at `oid`**, so a reference is unambiguous regardless of label collisions or which substrate it lives in.
- **One relationship form: closure-table edges** between `(substrate_id, oid)`-addressable entities. **No embedded nested id-bearing arrays** (a guard freezes them out) and **no FK-as-field**. Containment is a **membership edge** carrying `ordinal` (sibling order). Nested entities are **promoted to top-level blocks + membership-edged**.
- **Cross-substrate references = structured endpoints** `{kind:"item", substrate_id, oid, refname}` resolved through a **project-root registry** (`.pi-context-registry.json`: `substrate_id → { dir, aliases[] }`); `resolveRef` classifies each endpoint **active / foreign / dangling / unregistered**.
- **Content-addressing.** Every item has `oid` + `content_hash` + an immutable object at `<substrate>/objects/<content_hash>.json` — the content store + version history (via `content_parent`).
- **Substrate identity.** `config.substrate_id` (minted) + the registry + aliases, with a source-of-truth drift invariant.
- **Schemas declare the identity fields** and carry no nested id-bearing arrays. Legacy substrates are brought to this shape by a **one-time canonicalizer** that reads the *intent* (the data) and **emits clean canonical structure** — it never preserves the ad-hoc source shape (and is excised from the published package; it's migration tooling, not framework).

## One line

A substrate went from **"labeled rows in JSON files, with relationships embedded/duplicated three ways and no cross-substrate identity"** → **"a content-addressed entity graph: every item a content-addressed entity with a stable `oid` + version history, and every relationship a closure-table edge between addressable entities, resolvable across substrates via a registry."**

## The three substrates in THIS project (concrete)

| substrate | before | after |
|---|---|---|
| `.project` | the messiest legacy: ad-hoc accumulated, divergent schemas, `$ref` nested trees, FK-fields, no identity | **frozen pristine** (untouched); its *content* re-expressed canonically in a copy → `.project-migrate` |
| `.project-migrate` | (a `cp -r` of `.project`) | **canonicalized archive**: 588 content-addressed items, nested trees promoted to top-level entities + 55 membership edges, `conventions` registered, structurally canonical (0 nested-id / 0 dangling / 0 unregistered relation_types). Frozen; referenced by oid from new canonical substrates. |
| `.context-jit-spec-v2` (active, built during the arc) | mostly already canonical (22/22 identity schemas, structured endpoints, substrate_id) but items unstamped + 30 broken cross-substrate edges + a nested `layer-plans` schema | **active-wiring** (remaining): backfill its 70 items, convert its 30 `project:` edges into the registered `.project-migrate`, de-nest its empty `layer-plans` schema → 0 errors-from-the-30 + 0 nested-id |
| `.context` | minimal (8 `session-notes`), old shape (no substrate_id, identity-less schemas, empty `layer-plans` schema) | a going-forward substrate; **canonicalize (fold-in) or defer** — mint substrate_id + land identity + backfill + de-nest its empty layer-plans schema (no promotion — no nested data) |

## The `config.json` / `project.json` question (open-question answered)

`config.json` (block_kinds / relation_types / invariants / substrate_id / lenses) and a `project.json` (singleton project metadata) are substrate **metadata / singletons**, NOT entity-item blocks. They are "canonically structured" by being **schema-valid + registry-consistent + carrying a valid substrate_id** — which the canonicalizer already produces. **Content-addressing (per-item `oid`/`content_hash`) does not apply to them** — they are not arrays of entities. So "make config canonical" needs nothing beyond what the canonicalizer already does (write a schema-valid config with the minted substrate_id + the registered kinds/types); there is no separate content-addressing step for config or project metadata.
