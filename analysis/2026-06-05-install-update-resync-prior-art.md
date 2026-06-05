# install/update catalog → installed-instance resync: prior-art survey (FGAP-029)

Survey of how best-of-breed tools reconcile an evolving vendor/template/schema into an already-populated instance without destroying user data, mapped onto pi-context's existing primitives. Surveyed 2026-06-05. The point is to pick a MINIMAL, CORRECT design that REUSES what pi-context already ships (migration registry, content_hash, model/instance split) rather than inventing net-new machinery. Three candidate designs are framed for the user to choose between; one minimal option is recommended with rationale. No decision is declared.

## Problem

pi-context ships a **catalog** (a "context model"): JSON-Schema files under `samples/schemas/` + a config vocabulary in `samples/conception.json`, keyed by `block_kinds[].canonical_id`. `/context install` copies the declared `installed_schemas[]` / `installed_blocks[]` assets into a project's substrate dir. The substrate then accumulates **user data** — typed items filed into per-kind block JSON files (`tasks.json`, `decisions.json`, …) plus a closure-table `relations.json`.

The catalog evolves: schema `version` fields bump, fields get added, new block kinds appear. The ONLY re-sync mechanism today is `/context install --update`, which sets `overwrite=true` and does `fs.copyFileSync(sourceFile, destFile)` over the installed copies (`src/index.ts:392`, `:414`).

The destructive defect: the catalog's block "starters" are EMPTY arrays — `samples/blocks/tasks.json` is literally `{"tasks": []}`, `decisions.json` is `{"decisions": []}` (verified by read). So `/context install --update` over a populated `tasks.json` **silently replaces every filed item with `[]`** — total user-data loss, no preview, no confirmation, reported only as a bland `Updated (N): tasks.json` line (`src/index.ts:923-926`).

Secondary gaps, all confirmed in source:
- **No safe schema refresh.** The same `--update` flag that would refresh a stale installed *schema* (`schemas/tasks.schema.json`) also nukes the block data via the block-copy loop — schema-refresh and data-destruction are welded to one flag.
- **No version-skew detection.** `config.schema.json` carries no `catalog_version` / `installed_from` field (verified — grep returns nothing), so the substrate records nothing about which catalog version it was installed from. There is no baseline to diff against; drift is undetectable.
- **No migration on re-sync.** A migration registry exists (`migrations.json` + `validateBlockWithMigration`) but it runs only at READ-validation time, never wired into install/update. A catalog schema bump from `1.0.0`→`2.0.0` does not trigger any forward migration of installed data on re-sync.
- **No preview / dry-run.** `installContext` mutates immediately; there is no plan/diff phase.

## Existing primitives (file-cited — the solution should REUSE these)

| Primitive | Where | What it gives the resync problem |
|---|---|---|
| **Schema-migration registry** | `src/schema-migrations.ts` (`createRegistry`, `runMigrations`, linear `from→to` chain walk, cycle detection); `src/migrations-store.ts` (`migrations.json` append/replace/remove, `MigrationDecl` = `{schemaName, fromVersion, toVersion, kind, transform?}`, kinds `identity` \| `declarative-transform`); `src/schema-validator.ts:205` (`validateBlockWithMigrationForDir` — reads block `schema_version`, walks forward, validates against current). Transform ops: `rename` / `set` / `delete` / `coerce` on dotted paths (`migrations.schema.json:78-112`). | Forward-migrate installed data across a schema version bump **instead of copy-overwriting it**. This is the DB-migration-framework pattern, already built — just not wired to install. |
| **Content-addressed item identity** | `src/content-hash.ts` (`computeContentHash` = SHA-256 of RFC-8785 canonical JSON; key-order/number-format insensitive). Each item carries `oid` (immutable entity id) + `content_hash` (version fingerprint) + `content_parent` (prior version's hash → version chain). `src/block-api.ts:80-94, 329`. | Drift detection + 3-way merge primitive. `content_hash` is exactly the "did the user/vendor modify this?" fingerprint that dpkg computes with MD5 and Flyway with checksums — pi-context already has it, content-canonical (immune to key-order noise). |
| **Never-clobber install** | `src/index.ts:334` `installContext` — default `overwrite:false` is skip-if-exists (`destExists && !overwrite → skipped`, `:388`, `:410`). | The safe-by-default copy already exists for the absent-file case; the gap is purely the present-file (`--update`) path. |
| **Model / instance split** | `analysis/2026-06-01-pi-context-substrate-model-before-after.md`: schemas + config = portable MODEL (schema-valid + registry-consistent, no per-item content-addressing); block items + `relations.json` + `substrate_id` = INSTANCE (content-addressed entity graph). | The conceptual seam the fix runs along: **resync the MODEL, migrate (never overwrite) the INSTANCE.** kubectl/Terraform/copier all separate vendor-managed from user-owned; pi-context's split is already explicit. |
| **Catalog as keyed manifest** | `samples/conception.json` `block_kinds[]` (45 entries, each `{canonical_id, schema_path, data_path}`); `config.schema.json` carries `schema_version` (the config-file format version) but NO installed-catalog-version field. | The catalog is already a versioned, keyed manifest — half of a cruft-style `.cruft.json` baseline. The missing half is recording WHICH catalog version a substrate installed from. |

## Prior-art (per-tool, the 5 dimensions, web-cited)

For each tool: (a) vendor/user separation, (b) drift/version detection, (c) reconcile strategy, (d) preview-before-mutate, (e) idempotency + the never-without-consent invariant.

### 1. Template → project reconcilers

**copier (`copier update`)** — the closest analog (catalog ≈ template, substrate ≈ generated project).
- (a) Separates by *reconstruction*: it knows the template version the project was generated from (stored in `.copier-answers.yml`) and the user's answers, so template-origin vs user-edit is derivable.
- (b) Drift = template version in answers file vs current template ref.
- (c) **3-way merge**: regenerates the OLD template, computes the user's diff against it, replays that diff onto the NEW template. User edits preserved; template improvements merged where non-conflicting.
- (d) Conflicts surface as **inline Git-style conflict markers** (`<<<<<<< BEFORE / ======= / >>>>>>> AFTER`, default since v8) or `.rej` reject files — the user resolves genuine incompatibilities.
- (e) Never silently discards user edits; conflicts are surfaced, not auto-resolved.
([copier updating docs](https://copier.readthedocs.io/en/stable/updating/), [DeepWiki: Updating Projects](https://deepwiki.com/copier-org/copier/3.4-updating-projects))

**cruft (`cruft update` / `cruft check` / `cruft diff`)** — cookiecutter + drift management.
- (a) Stores `.cruft.json` at instance root carrying the **template commit hash** at instantiation time.
- (b) `cruft check` returns exit 1 if out-of-date (CI-friendly); drift = stored hash vs current template HEAD.
- (c) Computes the diff between the stored-hash template render and the current template render, applies that diff to the project.
- (d) `cruft diff` shows the drift like `git diff`; `cruft update` **has you review before applying** and only writes on accept.
- (e) Updates `.cruft.json` only after a successful apply; review-gated.
([cruft docs](https://cruft.github.io/cruft/), [cruft GitHub](https://github.com/cruft/cruft))

**cookiecutter / yeoman (contrast)** — cookiecutter has **no update path at all** (one-shot generation; cruft exists precisely to add the missing update story). yeoman regenerates and relies on per-file conflict prompts (keep/overwrite/diff) but has no persisted template-version baseline. The contrast confirms: *generation without a recorded baseline cannot safely update* — which is exactly pi-context's current state (no `installed_from`).

### 2. DB schema-migration frameworks

**Flyway**
- (a) Vendor = versioned SQL migration scripts on disk; user = the data IN the tables. Migrations transform structure around the data; data is never the migration's payload to replace.
- (b) `flyway_schema_history` table records each applied migration's version + description + **checksum** + timestamp; `migrate` compares disk scripts to the table and applies only pending ones.
- (c) **Forward-only versioned migration** (rollback is commercial). Data-preserving by design — migrations alter, never drop-recreate.
- (d) `flyway info` shows pending vs applied; checksum mismatch on an already-applied script **halts execution** rather than silently re-running.
- (e) Never silently re-applies or mutates an applied migration; baselining lets you adopt an existing populated DB without replaying history (explicitly to preserve production data).
([Flyway concepts/migrations](https://github.com/flyway/flywaydb.org/blob/gh-pages/documentation/concepts/migrations.md), [Baseline migrations explained](https://www.red-gate.com/hub/product-learning/flyway/flyways-baseline-migrations-explained-simply/), [Flyway info command](https://www.red-gate.com/hub/product-learning/flyway/the-flyway-info-command-explained-simply/))

**Alembic**
- (a) Vendor = revision scripts; user = table data.
- (b) `alembic_version` table records the current revision; Alembic computes the path from current → target through the `revision`/`down_revision`/`depends_on` graph.
- (c) Forward (and reversible) migrations; `autogenerate` *diffs models (desired) against the live DB (current)* to draft a candidate migration — but autogenerate output is **always reviewed/edited by hand**, never trusted blind.
- (d) The drafted migration IS the preview; the human edits it before `upgrade`.
- (e) "**No more drop-and-recreate**" — incremental alter preserving data is the headline invariant. The migration graph (`down_revision` chain, `depends_on`) is structurally identical to pi-context's per-`(schemaName, fromVersion)` linear chain.
([Alembic autogenerate](https://alembic.sqlalchemy.org/en/latest/autogenerate.html), [No more drop-and-recreate](https://medium.com/@newson190/no-more-drop-and-recreate-a-beginners-guide-to-alembic-with-postgresql-5a66b85cd840), [Alembic branches/depends_on](https://alembic.sqlalchemy.org/en/latest/branches.html))

**Django migrations / Rails ActiveRecord / Prisma Migrate** (same family) — migration-history table, dependency graph, forward-migrate-don't-recreate, data preserved. Prisma Migrate adds drift detection (compares migration history vs actual DB schema and warns). The whole family agrees on: *recorded version baseline + ordered forward migrations + data is the thing you protect, never the thing you replace.*

### 3. Declarative reconcilers (plan / apply)

**kubectl apply**
- (a) Field ownership: client-side stores a `last-applied-configuration` annotation (the prior desired state); server-side apply (SSA) tracks per-field ownership in `metadata.managedFields`, so vendor-set vs other-actor-set fields are distinguished at field granularity.
- (b) Drift = current live object vs last-applied vs new desired.
- (c) **3-way strategic merge**: diff (last-applied ↔ new desired) computed against the live object; SSA does field-level conflict detection and refuses to silently stomp a field another actor owns.
- (d) `kubectl diff` / `--dry-run=server` preview before mutating.
- (e) SSA refuses to overwrite a field owned by another manager without `--force-conflicts`.
([Server-Side Apply](https://kubernetes.io/docs/reference/using-api/server-side-apply/), [SSA Beta 2 blog](https://kubernetes.io/blog/2020/04/01/kubernetes-1.18-feature-server-side-apply-beta-2/))

**Terraform**
- (a) State file separates Terraform-managed resources from everything else; only what's in state is touched.
- (b) `plan` diffs desired config vs recorded state vs real-world.
- (c) plan → apply; reconcile computed and shown first.
- (d) **`plan` is a hard safety gate** — shows exactly what will create/change/destroy before anything happens; `prevent_destroy` lifecycle rule blocks destruction of protected resources entirely.
- (e) Never destroys without surfacing it in the plan.
([terraform plan](https://developer.hashicorp.com/terraform/cli/commands/plan), [Terraform core workflow](https://oneuptime.com/blog/post/2026-02-23-how-to-understand-the-terraform-core-workflow-write-plan-apply/view))

**Helm 3**
- (a) Vendor = chart manifest; user/cluster = live state.
- (b) Helm 3 moved from Helm 2's **two-way** merge (old manifest ↔ new manifest, blind to cluster edits) to a **three-way** merge (old manifest + **live state** + new manifest) — precisely so manual `kubectl edit` changes and injected sidecars survive an upgrade/rollback.
- (c) 3-way strategic merge patch.
- (d) `helm diff` (plugin) / `--dry-run`.
- (e) Caveat: Helm intentionally **does not manage CRDs on upgrade** — it refuses to touch them rather than risk cascade-deleting the custom resources (data) they define. A deliberate "won't reconcile the thing whose change could destroy data" carve-out.
([Changes since Helm 2](https://helm.sh/docs/v3/faq/changes_since_helm2/))

### 4. Package / OS config managers

**dpkg conffile handling** — the most direct "shipped asset the user edited" analog.
- (a) A *conffile* is a config the package ships into `/etc` that the user is expected to edit. dpkg tracks the **MD5 of the version it last shipped**.
- (b) On upgrade dpkg computes three MD5s: last-shipped, currently-installed (to detect user edits), newly-shipping. If neither side changed → leave alone. If only one changed → take the changed one. If BOTH changed → conflict.
- (c) On conflict, **prompt the user**: keep current / install new / show diff / drop to a shell with `$DPKG_CONFFILE_OLD` + `$DPKG_CONFFILE_NEW`. Non-interactive policy via `--force-confold` (keep, new lands as `.dpkg-dist`) / `--force-confnew` (replace, old kept as `.dpkg-old`) / `--force-confdef`.
- (d) The diff is offered before the keep/replace decision.
- (e) **Never silently overwrites a user-modified conffile** — the unmodified-file fast path is the only silent one; any user edit forces a decision and always preserves the discarded version under a suffix.
([Debian Wiki: DpkgConffileHandling](https://wiki.debian.org/DpkgConffileHandling), [Hertzog: conffiles](https://raphaelhertzog.com/2010/09/21/debian-conffile-configuration-file-managed-by-dpkg/))

**npm** — vendor (`node_modules`, regenerated from `package.json` + lockfile) is strictly separated from user source; npm **never touches files it doesn't own**. The lockfile records exact installed versions (the baseline); `package.json` is desired state. The invariant: clear ownership boundary, regenerate only the vendor tree.

## Common pattern (best-of-breed distillation)

Every tool above converges on the same four rules:

1. **Separate model-resync from user-data.** Vendor/template/schema is one thing; user data/edits is another. The reconcile touches the model freely and the data only through a data-preserving transform. (model/instance — all of them.)
2. **Record a version baseline and detect drift against it.** `.cruft.json` commit hash, `flyway_schema_history` version+checksum, `alembic_version`, last-applied annotation, Terraform state, dpkg's last-shipped MD5. *You cannot safely update what you have no recorded baseline for* — cookiecutter's missing update path is the negative proof.
3. **Forward-migrate rather than copy-overwrite.** Flyway/Alembic/Django: alter incrementally, never drop-recreate. Data is the protected payload, never the migration's replaceable content.
4. **ALWAYS preview before mutate; never overwrite user-owned/modified content without explicit consent.** Terraform plan, kubectl diff/dry-run, cruft diff+review, dpkg keep/replace/show-diff prompt, copier conflict markers. The unmodified-file fast path is the only thing that mutates silently.

## Mapping to pi-context

The four rules map onto already-built primitives with minimal new surface:

| Best-of-breed rule | pi-context primitive that already exists | What's missing |
|---|---|---|
| Separate model-resync from user-data | model/instance split is explicit (`2026-06-01` analysis); install already copies schemas (model) and blocks (data) in two separate loops (`index.ts:372`, `:396`) | The two loops share one `--update` flag. **Split them**: schema-refresh ≠ block-overwrite. |
| Record baseline + detect drift | catalog is a versioned keyed manifest (`conception.json` `block_kinds[]`, schema `version` fields); `content_hash` fingerprints every item; schema files carry `version` | `config.json` records **no `installed_from` catalog version** and no per-installed-schema version. Add a baseline field; then drift = installed schema `version` vs catalog schema `version`. |
| Forward-migrate not copy-overwrite | full migration registry: `migrations.json`, `runMigrations`, `validateBlockWithMigrationForDir`, `identity`/`declarative-transform` kinds, `rename`/`set`/`delete`/`coerce` ops | The registry runs at read-validation only. **Wire it into resync**: on schema version skew, refresh the schema file AND run the registered chain over the installed block data, writing migrated data back via block-api. |
| Preview + consent | `installContext` already classifies into installed/updated/skipped/notFound; never-clobber default exists | No `--dry-run`/plan that reports the would-be actions, and `--update` overwrites blocks with no consent. Add a plan phase + make block-data overwrite refuse-by-default (dpkg-style). |

The strongest reuse: pi-context already has *both* of the two hard pieces other ecosystems built from scratch — a **migration framework** (Flyway/Alembic) AND a **content fingerprint** (dpkg MD5 / Flyway checksum), content-canonical via RFC-8785. The only genuinely-absent primitive is the **recorded install baseline** (`.cruft.json` / `flyway_schema_history` equivalent): a small `config.json` field.

## Candidate designs + tradeoffs

### A — Migration-registry-driven schema-resync + block-starter-only-when-absent + dry-run (dpkg/copier-flavored)

**Shape.** Split `--update` into two orthogonal concerns:
- **Schema resync (model):** refresh installed `schemas/*.schema.json` from the catalog when the catalog schema `version` > installed schema `version`. On refresh, look up the registered migration chain for that schema and run it over the installed block data (via `validateBlockWithMigration` / `runMigrations`), writing migrated data back through block-api. Record the catalog version installed into a new `config.installed_from` (+ optionally per-schema installed versions).
- **Block data (instance):** copy a starter block ONLY when the destination is absent (the existing never-clobber path). A populated block is NEVER overwritten by install/update — period. New catalog block *kinds* get their empty starter; existing populated blocks are left and (if their schema bumped) migrated, not replaced.
- **Dry-run / plan:** `/context install --plan` reports per-asset {install | refresh-schema (v→v) | migrate-data (N items, chain steps) | skip (populated) | up-to-date} with no mutation. Mutation requires the un-`--plan` invocation; schema refresh that has no registered migration chain for a non-identity bump **refuses and names the missing migration** (Flyway checksum-halt analog).

**Reuses:** migration registry (whole), `validateBlockWithMigration`, never-clobber install path, the existing install result classification. **New:** `config.installed_from` baseline field (+ schema-version comparison), a `--plan` reporting pass, the schema-refresh-triggers-data-migration wiring, refuse-on-missing-migration.
**Failure modes:** a non-identity schema bump with no registered `MigrationDecl` blocks resync (correct — fail loud, matching Flyway). Identity-kind bumps need an explicit `identity` decl or they block; that's a small authoring burden but it's the consent record.
**Minimality:** highest reuse, smallest new surface; the only net-new is the baseline field + plan pass. Maps cleanly onto dpkg (refuse to clobber modified data, refresh the un-edited model) + Alembic (forward-migrate via recorded chain) + cruft (drift via recorded baseline, review before apply).

### B — Full `content_hash` 3-way merge (copier / kubectl / Helm-3 flavored)

**Shape.** For each installed asset, store the catalog's shipped `content_hash` at install time (the baseline). On resync, compute three hashes — shipped-baseline, current-installed, new-catalog — and apply dpkg/kubectl logic per asset: unchanged-by-user → take new; user-modified + catalog-unchanged → keep; both changed → 3-way merge (or conflict markers). For block *data*, this extends to per-item `content_hash`: items the user added (no catalog ancestry) are preserved; catalog-shipped items the user didn't touch can be refreshed; touched ones conflict.

**Reuses:** `content_hash` / `oid` / `content_parent` (deeply), canonicalization. **New:** per-asset baseline-hash storage, a 3-way merge engine (or conflict-marker emitter) for both schema text and block items, conflict-resolution UX.
**Failure modes:** schema files are JSON-Schema *text* — a structural 3-way merge of schema documents is genuinely hard and overlaps the migration registry's job (two ways to evolve a schema = drift risk). Conflict-marker UX inside JSON blocks is awkward (a block with markers is no longer valid JSON, breaking every reader).
**Minimality:** lowest — builds a merge engine pi-context doesn't have and partially duplicates the migration registry. Most powerful, least minimal; the schema-text-merge problem is exactly what migration frameworks exist to avoid.

### C — Version-skew detector + guided migrate command (cruft-check / flyway-info flavored)

**Shape.** Ship only *detection* + *guidance*, no automatic mutation. `/context doctor` (or `/context install --check`) compares installed schema `version`s against catalog `version`s (requires the `installed_from` baseline) and reports skew + whether a migration chain is registered for each. It then instructs the operator (or an agent) to author the missing `MigrationDecl`s and run an explicit, separately-authored migrate step. `--update` is hard-disabled for populated blocks regardless.

**Reuses:** migration-store authoring surface, `contextState` / status reporting, `validateBlockWithMigration`. **New:** the skew-detection report + `installed_from` baseline; no automatic resync at all.
**Failure modes:** leaves the actual data migration manual — correct schema refresh still needs a follow-on action, so a stale schema can linger. Lowest blast radius but also lowest automation; resync remains a multi-step human/agent loop.
**Minimality:** very high (mostly reporting), but solves "detect + don't destroy" without solving "resync" — it converts a footgun into a checklist.

## Recommended minimal option

**A** — migration-registry-driven schema-resync with never-overwrite-populated-blocks and a `--plan` preview — best satisfies *minimal AND correct AND best-of-breed*. It reuses the two hard primitives pi-context already ships (migration registry + content fingerprint baseline) and adds only a recorded `installed_from` baseline field and a plan/refuse pass — the same minimal additions cruft (one `.cruft.json` line) and Flyway (one history table) needed. It directly closes the destructive defect by making block-data overwrite refuse-by-default (dpkg invariant) while keeping the model (schemas) refreshable through the registry (Alembic/Flyway forward-migration invariant), and it never mutates without a plan the operator can read first (Terraform/kubectl/cruft invariant). B's 3-way schema-text merge is genuinely harder than the problem warrants and overlaps the migration registry; C is a safe subset of A (detection without resync) and can ship as A's `--plan`/`--check` phase rather than as a competing design. Recommend A, with C's detector folded in as A's preview surface; B's per-item `content_hash` merge reserved only if block-level (not just schema-level) catalog/user reconciliation later proves necessary.

(Recommendation framed for the user to choose; not a decision.)
