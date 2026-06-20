# Audit — TASK-072 proposed resolution (additive / expand-contract build gate for config-schema, FGAP-097)

Date: 2026-06-20
Scope: read-only audit of TASK-072's description + acceptance_criteria as a design (poisoned-assumption / over-complexity / non-best-practice lens). No implementation, no substrate mutation.

## Verdict: HAS-PROBLEMS

The intent is sound and the gate-family precedent (`scripts/check-changelog.ts`, `scripts/parity-check.ts`) is the right shape to reuse. But the proposed resolution carries TWO load-bearing wrong assumptions about the codebase's migration model, plus one over-broad scope point. Each makes an acceptance criterion as-written either unimplementable or wired to the wrong mechanism.

---

## What was verified against code

- **`config.schema.json` shape** (read via node, NOT cat): root `additionalProperties:false`, root `required:["schema_version","block_kinds"]`, carries its own `version` field (currently `1.7.0`, with a `^\d+\.\d+\.\d+$` pattern). Top-level has 18 property keys; nested `required` arrays live under `layers/block_kinds/relation_types/hierarchy/lenses/installed_from/tool_operations` (`*.items.required` or nested object `required`). So "new required field under root additionalProperties:false" is real, AND required-tightening can also happen NESTED (e.g. adding a 7th entry to `block_kinds.items.required`) — the criterion as worded ("under the root") under-scopes the break surface.
- **`version` field DOES evolve**: git `-p` on the file shows `1.2.0 → … → 1.6.0 → 1.7.0`. So config-schema is a versioned, evolving meta-schema — the premise that a diff gate has something to gate is correct.
- **Migration model** (`packages/pi-context/src/migration-registry-loader.ts`, `schema-migrations.ts`): a migration is a `MigrationRegistryEntry { schemaName, fromVersion, toVersion, migrate }`. The registry is **built from a SUBSTRATE's `migrations.json`** (`buildRegistryFromSubstrateForDir`) or from in-memory catalog `chain` edges (`buildFreshRegistryWithChain`). Migrations are keyed `(schemaName, fromVersion)`. `schemaName` "config" is named as a valid id in the doc comment (`schema-migrations.ts:49`).
- **Gate precedents**: `check-changelog.ts` reads OLD state via `git show <rev>:<path>` and NEW state from the working tree / `git show HEAD:` — a textual git-diff gate, exit-nonzero on violation, pure exported helpers + thin `main()`, registered as a husky/CI step. `parity-check.ts` is a heavyweight AST/in-process gate. The config-schema diff needs only the `check-changelog` weight class (JSON parse of two revisions + a structural predicate), NOT a `parity-check`-class AST engine.

---

## Problem 1 (WRONG ASSUMPTION, load-bearing) — "paired migration" is not a thing that exists for `config.schema.json` at build time

The criterion *"A non-additive config.schema.json diff absent a paired migration fails the build-time gate"* assumes a build-time-resolvable notion of "a registered migration paired with this config-schema diff." There is no such registry the gate can consult:

- The migration registry is constructed **per-substrate** from that substrate's `migrations.json` (or from catalog chain edges in-memory). It is NOT a package-level, build-time artifact that a `scripts/` gate can load to ask "is there a `config` migration from 1.7.0→1.8.0?"
- A package-side `config.schema.json` edit lives in `packages/pi-context/schemas/`; the matching migration (if the model even supports config-schema migrations as catalog chain edges — that path is the substrate-install-time `buildFreshRegistryWithChain`, not a checked-in package registry) has no co-located, gate-readable home today.

So "absent a paired migration" is unimplementable as written without first deciding WHERE a build-time-discoverable config-schema migration declaration lives. The gate would either (a) always fire on any non-additive diff (the "paired migration" escape hatch never resolvable), or (b) silently never fire (no registry to find a pairing in).

**Correction:** drop the "paired migration" coupling from the gate's pass condition. The gate's job per FGAP-097 is the CHEAP structural mitigation — flag the non-additive diff so it cannot ship *unnoticed*. The escape hatch should be an EXPLICIT, in-diff acknowledgement the gate can read textually (mirroring how `check-changelog` reads the CHANGELOG body, and how the repo already uses `# provenance-reviewed` / `--no-verify`-forbidden sentinels): a `version` bump on the schema PLUS a declared contract-release marker, OR a recorded allow-token in the changeset. Pairing to the runtime migration registry is FGAP-095's job (load-time migration), explicitly named as a *separate* gap in FGAP-097's own body — the build gate must not reach into it.

## Problem 2 (WRONG ASSUMPTION) — the break surface is under-scoped to "the root"

Criterion 1 names "a new required field under the root additionalProperties:false." Verified: `required`-tightening that bricks an existing config can occur at ANY level carrying `additionalProperties:false` + `required` — nested `*.items.required` (e.g. `block_kinds.items.required` has 6 entries today; a 7th is a break) and nested object `required` (`installed_from.required`). A key removal/rename likewise breaks wherever `additionalProperties:false` sits, not only at root.

**Correction:** the diff predicate must walk the schema tree, not just the root object. The "non-additive" predicate = at any schema node: (a) a `required[]` entry added, (b) a `properties` key removed or renamed, (c) `additionalProperties` flipped `true→false` (or a previously-absent default tightened). Recursive structural diff, not root-only.

## Problem 3 (SCOPE / FRAMING) — "Adopt the expand-contract discipline" is a human policy, not a gate deliverable; criterion 3 restates policy, not a checkable gate behavior

Criteria 1+2 are gate behaviors (testable: feed two schema revisions, assert pass/fail). Criterion 3 — *"New config fields land optional; a field removal or rename is gated to a contract release"* — is a restatement of the human discipline, not an additional gate-observable behavior. As an acceptance criterion it is unfalsifiable by the gate (it describes author intent). Leaving it in invites a fixer to "implement" something beyond the gate (a contract-release workflow), i.e. scope creep past FGAP-097's stated "cheapest structural mitigation."

**Correction:** demote criterion 3 from an acceptance criterion to the task description's framing (it already is, in the description's second sentence). The acceptance set should be only gate-observable behaviors. If a contract-release escape path is wanted, criterion it concretely as "the gate PASSES a non-additive diff iff the changeset carries `<explicit token>`" (the Problem-1 correction), which IS checkable.

## Not a problem (sound, with reasoning)

- **Reusing the gate-family precedent over a novel diff engine**: correct and already implied by `files:["scripts/"]` + the `notes` ("Build-time-gate family with FGAP-094 (TASK-067)"). The right weight class is `check-changelog.ts` (git-show two revisions + JSON parse + structural predicate + pure helpers + thin main + husky/CI registration), NOT a `parity-check.ts`-class AST walk. A recursive JSON structural diff is ~the complexity of `unreleasedGrew`/`watchDirsFromFiles`, not the AST machinery. No new dependency needed (`config.schema.json` is plain JSON; `git show <rev>:packages/pi-context/schemas/config.schema.json` yields the old text).
- **Additive-diff-passes criterion (criterion 2)**: sound and directly testable.
- **P2 priority / family linkage to FGAP-094 / pairing-with-FGAP-095/096**: consistent with FGAP-097's body, which already partitions build-time (this) vs load-time-migration (FGAP-095) vs recovery (FGAP-096). The audit's Problem 1 is precisely enforcing that partition the FGAP already declares.

---

## Proposed replacement text (ready to drop into TASK-072)

**description (replace):**
> Add a build-time gate (the `check-changelog.ts` gate-family weight class: git-show the prior `config.schema.json` revision + parse, structural-diff against the working tree, exit-nonzero on violation, pure exported helpers + thin main, husky pre-commit + CI step) that flags a NON-ADDITIVE `config.schema.json` diff at ANY schema node — a removed/renamed `properties` key, a newly-added `required[]` entry, or an `additionalProperties` tightened `true→false`. A flagged diff fails the gate UNLESS the changeset carries an explicit contract-release acknowledgement the gate reads textually (a `version` bump on the schema plus a declared allow-token in the changeset), mirroring the repo's existing sentinel-token escape pattern. The gate does NOT consult the runtime migration registry — that registry is built per-substrate (`buildRegistryFromSubstrateForDir`) and is not a build-time artifact; load-time migration is FGAP-095's separate scope. Adopt expand-contract discipline as the authoring convention this gate protects: new fields land optional; existing fields are not removed/renamed until a contract release.

**acceptance_criteria (replace with gate-observable only):**
1. A non-additive `config.schema.json` diff (a `required[]` addition, a `properties` key removal/rename, or an `additionalProperties` `true→false` flip, AT ANY schema node — root or nested) absent the explicit contract-release acknowledgement fails the gate (exit nonzero).
2. An additive diff (a new OPTIONAL property, with no `required[]` / `additionalProperties` tightening) passes the gate.
3. A non-additive diff PAIRED with the explicit contract-release acknowledgement the gate reads in-changeset (schema `version` bump + allow-token) passes the gate — the contract-release escape, resolvable purely from the changeset, with no reach into the runtime migration registry.

(The former criterion-3 human-discipline statement is folded into the description's framing, not carried as an unfalsifiable acceptance criterion.)
