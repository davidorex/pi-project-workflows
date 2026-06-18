# Isolated proving-ground method — validate dev work without exposing any live substrate

Durable remediation for a real incident: a dev `npm run build` rebuilt the globally-linked
`pi-context` CLI to a new config schema while `.context/config.json` was still the old shape,
bricking every read of the live substrate (exit 5, no migration path). This document
root-characterizes that exposure, inventories the isolation primitives the project already
ships, designs a generalized proving-ground method composed from them, and proves the method
end-to-end with a `/tmp` prototype that left the live substrate and global binary byte-identical.

All prototype work is under `/tmp/proving-ground-design/`. No repo file, no live substrate
`*.json`, no `.pi-context.json` pointer, and no `dist/`/global-link rebuild was touched.

---

## PART 1 — The exposure map (evidence-cited)

### 1A. The global-CLI / `dist` coupling (the incident mechanism, confirmed)

The globally-resolved `pi-context` binary is a **symlink into the repo's own `dist/`**:

```
$ which pi-context
/opt/homebrew/bin/pi-context
$ ls -la /opt/homebrew/bin/pi-context
... /opt/homebrew/bin/pi-context -> ../lib/node_modules/@davidorex/pi-context-cli/dist/bin.js
$ npm ls -g --link
└── @davidorex/pi-context-cli@0.31.0 -> ./../../../Users/david/Projects/workflowsPiExtension/packages/pi-context-cli
```

The global command is `npm link`ed to `packages/pi-context-cli`, and its bin target is that
package's **`dist/bin.js`**. Therefore `npm run build` (which `tsc`-compiles every package to
`dist/`) **instantly changes what the live-resolving binary executes and validates against** —
there is no separate "installed" copy. The binary the operator runs against the live `.context`
in dev IS the just-built code. That is the incident coupling, confirmed at the symlink level.

`bin.js` delegates to `main()` and maps its return to the process exit code
(`packages/pi-context-cli/src/bin.ts:1-12`):

```typescript
main(process.argv.slice(2))
	.then((code) => { process.exitCode = code; })
	.catch((err) => { process.stderr.write(`error: ...`); process.exitCode = 1; });
```

### 1B. The load-time coupling — config validated against the running binary's schema, NO migration

`loadConfigForDir` validates the on-disk config against the schema **bundled in the running
binary**, with no version check and no migration step
(`packages/pi-context/src/context.ts:564-581`):

```typescript
export function loadConfigForDir(substrateDir: string): ConfigBlock | null {
	const p = path.join(substrateDir, "config.json");
	if (!fs.existsSync(p)) return null;
	...
	validateFromFile(bundledSchemaPath("config"), data, `config.json (${p})`);
	return data as ConfigBlock;
}
```

Contrast with block data, which DOES migrate on version mismatch
(`validateBlockWithMigrationForDir`, `schema-validator.ts:205-242`). Config has **no
`schema_version`-driven migration registry entry** — `config.json` carries a `schema_version`
field, but the load path validates directly against `bundledSchemaPath("config")` and never
forward-migrates. The config schema's own constraints (`schemas/config.schema.json:8-9`) are
`required: ["schema_version", "block_kinds"]` and `additionalProperties: false`. A schema bump
that adds a required field, or removes/renames an existing field (so the old config carries a
now-unknown key), strands the on-disk config: validation throws `ValidationError`.

The CLI maps that throw to **exit code 5** (`packages/pi-context-cli/src/cli.ts:1213-1220`):

```typescript
let code = 1;
if (isValidationError(err)) code = 5;
else if (err.name === "BootstrapNotFoundError") code = 1;
else if (/schema (file )?not found/i.test(err.message)) code = 3;
else if (/nextId|id pattern|allocate/i.test(err.message)) code = 4;
return code;
```

This is the precise incident: rebuild advances `bundledSchemaPath("config")`; the live
`config.json` is now invalid against it; every config-loading op exits 5 with no recovery.

### 1C. Active-substrate resolution — every op acts on whatever the pointer names

`resolveContextDir(cwd)` reads `<cwd>/.pi-context.json`, validates the pointer, and returns
`path.join(cwd, contextDir)` (`packages/pi-context/src/context-dir.ts:104-143`). The active
substrate is **entirely a function of `cwd` + the pointer file at that cwd** — there is no
hardcoded `.context`. Critically, the CLI accepts `--cwd` (`cli.ts:263-267`):

```typescript
if (tok === "--cwd") {
	const v = argv[++i];
	out.cwd = path.isAbsolute(v) ? v : path.resolve(cwdBase, v);
	continue;
}
```

So `--cwd <dir>` redirects ALL substrate resolution to `<dir>/.pi-context.json`. **This is the
load-bearing isolation lever** (Part 2/3): point at a `/tmp` dir and the live `.context` is
never resolved. (There is no `--contextDir` flag; the pointer file at the cwd is the only
substrate-dir source.)

### 1D. Write/mutation surfaces against the active substrate

Every write op (`amend-config`, `update-block-item`, `append-*`, `append-relation`) and
`flipBootstrapPointer` act on whatever the pointer at the resolved cwd names.
`flipBootstrapPointer` (`context-dir.ts:283-342`) atomically rewrites `<cwd>/.pi-context.json`
(tmp + rename, `lines 329-330`) — the pointer-flip mutation. In normal dev with the default
cwd (repo root), all of these target the live `.context`. The same `--cwd` lever (1C) redirects
them away from live.

### 1E. Other paths

- **Direct `Edit`/`Write` on `.context/*.json`** — forbidden by project convention and the
  PreToolUse hooks; not a CLI path.
- **The install/update ceremony** (`installContext`, `index.ts:1211`; resolves its target via
  `resolveContextDir(cwd)`, `index.ts:1224`) writes config + materializes schemas/blocks into
  the **pointer-resolved** dir — so it, too, is redirected by `--cwd`. (`context-install` is now
  a reflected op as of TASK-059; the earlier "install has no CLI op" gap is closed.)
- **Hooks scoped to the live substrate (FGAP-089, open)** — `.claude/hooks/` PreToolUse guards
  (`block-pi-context-glue.sh`, `gap-register-guard.sh`) are not substrate-scoped; they fire on
  command text regardless of which substrate the op targets. They constrain HOW the CLI is
  driven, not WHICH substrate; they do not protect the live data from a rebuilt binary.

**Root class:** the live substrate's integrity depends on the running binary's schema matching
the on-disk config, AND dev rebuilds that binary in place (1A) against the live config (1C).
The two facts together are the brick. Breaking either coupling for dev removes the class.

---

## PART 2 — Isolation primitives that ALREADY exist (evidence-cited)

The project already ships everything a proving ground needs; the method composes, it does not invent.

| Primitive | Evidence | What it gives the proving ground |
|---|---|---|
| **`--cwd <dir>` on every CLI op** | `cli.ts:263-267`; resolves via `resolveContextDir(cwd)` `context-dir.ts:104-143` | Redirect ALL reads/writes to an arbitrary dir's pointer — never resolves live `.context`. Proven in Part 4. |
| **`initProject(cwd, contextDir)`** | `index.ts:273-331` — writes the pointer at `cwd`, then scaffolds dirs + skeleton config | Bootstrap a fresh substrate in ANY dir (incl. `/tmp`) — pointer written only inside that dir. |
| **`adoptConception(cwd)` (accept-all)** | `context.ts`; reflected op `context-accept-all` `ops-registry.ts:1482-1503` | Adopt the packaged `samples/conception.json` as the dir's config (full 17-kind vocabulary). |
| **`installContext(cwd, {overwrite})`** | `index.ts:1211`, target via `resolveContextDir(cwd)` `index.ts:1224`; catalog at `samples/conception.json` resolved `index.ts:614-624`; reflected op `context-install` `ops-registry.ts:1499-1525` | Materialize declared schemas + starter blocks from the catalog into the pointer-resolved dir. |
| **`listSubstrates` / per-arc dirs** | `context-switch-tool.ts` (via `index.ts`); scans cwd subdirs carrying `config.json` | Enumerate substrates without flipping; a `/tmp` dir's substrate is just another entry. |
| **`flipBootstrapPointer` is NOT required to target a dir** | `--cwd` (1C) targets a non-active dir directly; flip mutates the pointer (`context-dir.ts:283-342`) | The proving ground reads/writes an isolated substrate WITHOUT ever flipping the live pointer. |
| **tsx-against-`src` (no build)** | repo `package.json` has `tsx`; engine fns importable from `packages/*/src/*.ts` directly | Engine-level proofs without rebuilding `dist/` or the global link. Proven in Part 4. |
| **tmpdir fixture pattern in tests** | `context.test.ts:38-48` (`makeTmpDir` + `writeConfig`) | Canonical isolation pattern to reuse — quoted below. |
| **gitignored scratch dirs** | `.gitignore`: `tmp/`, `compiled-contexts/` | Project-sanctioned disposable locations (alongside `/tmp`). |

The canonical test fixture, quoted (`packages/pi-context/src/context.test.ts:38-48`):

```typescript
function makeTmpDir(prefix: string): string {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `pcx-${prefix}-`));
	writeBootstrapPointer(cwd, ".project");
	return cwd;
}
function writeConfig(tmpDir: string, cfg: ConfigBlock | Record<string, unknown>): void {
	const dir = path.join(tmpDir, ".project");
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(cfg));
}
```

This is the proving-ground pattern in miniature: a fresh tmpdir, its OWN pointer, its OWN
config — the live substrate is never named.

---

## PART 3 — The generalized proving-ground method + infrastructure

### Core principle: isolation by pointer-redirection, proof by source binary

The exposure (Part 1) reduces to two couplings. The method severs both for dev:

1. **Substrate redirection through the harness.** All proofs run through
   `scripts/orchestrator/proving-ground.ts`, which targets the proving-ground dir on every
   invocation — CLI ops via `--cwd <proving-ground-dir>`, engine fns called against that dir.
   `resolveContextDir` resolves the substrate purely from the cwd's pointer file (1C), and the
   proving ground is a separate directory with its own `.pi-context.json`, so a proof run
   through the harness never resolves the live `.context`: the live pointer is never read, never
   flipped.

2. **Binary independence for schema-shape proofs.** Schema/shape changes are proven via
   `tsx`-against-`src` — engine fns and CLI `main()` imported directly from `packages/*/src`, no
   `dist/` compiled and no global symlink touched. `npm run build` (which repoints the global
   binary) runs only after the proving ground proves the change green on a snapshot of live (the
   schema-bump walkthrough below); that build is the compiled-artifact check.

### The harness (net-new, minimal): `scripts/orchestrator/proving-ground.ts`

A single composer script (fits the existing `scripts/orchestrator/*.ts` convention — composers,
not hand-authored briefs) exposing four verbs. **This is the only net-new code.** It composes
the Part 2 primitives; it adds no new engine capability.

- `materialize <pg-dir> [--from catalog|snapshot] [--snapshot-of <live-dir>]`
  - `catalog` (default): `initProject(pg, ".context")` → `adoptConception(pg)` →
    `installContext(pg)`. Fresh full-vocabulary substrate. (Proven: Part 4 §1.)
  - `snapshot`: `cp -R <live-dir> <pg-dir>/.context` (read-only of the source — copies, never
    mutates in place) + write a fresh pointer INTO `<pg-dir>` only. Realistic live data,
    isolated. (Proven: Part 4 §3.) **Never `cp -R` the live dir in place; always copy OUT to the pg.**
- `run <pg-dir> -- <op> [args...]` — drives the op against the pg by invoking CLI `main()` from
  `src` via `tsx` with `--cwd <pg-dir>`. (Proven: Part 4 §2, §4, §5.)
- `prove-schema-bump <pg-dir> <mutation>` — stages a config the running schema rejects in the
  pg copy, runs a config-loading op, asserts the failure, then restores the pg copy. The
  end-to-end schema-bump rehearsal. (Proven: Part 4 §5.)
- `teardown <pg-dir>` — `rm -rf <pg-dir>`. The pg is disposable by construction.

Reused (NOT net-new): `initProject`, `adoptConception`, `installContext`, `resolveContextDir`,
the `--cwd` flag, the `samples/conception.json` catalog, `tsx`, `cp -R`.

### Related: cross-process write protection

A substrate-scoped PreToolUse guard that refuses substrate WRITE ops resolving to the repo root
is tracked under FGAP-089 (the existing `.claude/hooks/` guards are not substrate-scoped). It is
separate from this method: the incident was a rebuild against the live config, not a write op,
and legitimate PM filings write the live substrate by design.

### Schema-bump case, end-to-end inside the proving ground (the durable remediation)

A future `config.schema.json` shape change is proven entirely in the pg BEFORE anything touches
live or the global binary:

1. `materialize <pg> --from snapshot --snapshot-of .context` — realistic live data, isolated.
2. Author the new schema + its migration in `src` (uncommitted is fine).
3. `prove-schema-bump <pg> ...` runs a config-loading op via tsx-`main()`-from-`src` against the
   pg. The NEW schema validates the OLD (snapshotted) config:
   - If no migration: reproduces exit 5 IN THE PG (Part 4 §5 proves this faithfully) — the
     incident, caught in isolation, live untouched.
   - With the migration wired: the op succeeds against the pg, proving the old→new bridge works
     on realistic data before the global binary ever carries the new schema.
4. Only after the pg proves green does `npm run build` (which repoints the global link) run —
   and by then the migration is proven to carry the live config forward. The brick cannot
   recur: the rebuild is gated on a proof that ran against a copy of the very config the rebuild
   will face.

The live substrate is read-mutated by nothing in the proof (the harness targets the pg), and the
global binary is rebuilt only after the pg has proven the schema transition on a snapshot of
live. A proof run through the harness has zero live exposure.

---

## PART 4 — The /tmp prototype (commands + pasted output)

Baseline recorded before any prototype step (live, read-only file hashing — the live CLI was
not run against live):

```
$ git status --short .context .context-jit-spec-v2     # (empty — clean)
$ shasum -a 256 .context/config.json
3f2d1f65445c00867e23a277f8b5129b776d4938e35608b6088fd52167b9148d  .context/config.json
$ shasum -a 256 .pi-context.json
af9cc6c910ebe61be3762aaa408af9971ed01827cc4ceb7c893182dd8a095223  .pi-context.json
```

### §1 — Materialize a fresh full-vocabulary substrate in /tmp via tsx-against-src (NO build)

`/tmp/proving-ground-design/materialize.ts` imports `initProject`, `installContext` from
`packages/pi-context/src/index.ts` and `adoptConception` from `.../src/context.ts` (direct src
paths, no `dist`), then runs the three-step ceremony against `/tmp/proving-ground-design/pg-fresh`:

```
$ npx tsx /tmp/proving-ground-design/materialize.ts /tmp/proving-ground-design/pg-fresh
init: {"created":[".context/",".context/schemas/",".context/config.json"],"skipped":[]}
accept-all: {"adopted":true,"configPath":".context/config.json","root":".context","schemaCount":17,"blockCount":17}
install error: none | keys: installed,updated,skipped,notFound,preserved,resynced,migrated,blocked
substrate top-level: config.json,context-contracts.json,conventions.json,decisions.json,features.json,framework-gaps.json,issues.json,layer-plans.json,milestone.json,objects,phase.json,rationale.json,requirements.json,research.json,schemas,spec-reviews.json,story.json,tasks.json,verification.json,work-orders.json
schema count: 17
pointer contextDir: .context
```

A complete substrate (17 schemas, all block files, full vocabulary) materialized in `/tmp` from
the packaged catalog, with no `npm run build`.

### §2 — The GLOBAL CLI reads the isolated substrate via --cwd (live never resolved)

```
$ pi-context context-status --cwd /tmp/proving-ground-design/pg-fresh --json
... {"ok":true,"op":"context-status","output":{... "block_kinds":{"total":17} ... "schemas":17 ...}}
```

The same global binary that resolves live `.context` by default resolves the `/tmp` substrate
when given `--cwd` — its `.pi-context.json` is the only pointer read.

### §3 — Snapshot of live (realistic data, isolated) read via the global CLI

```
$ cp -R .context /tmp/proving-ground-design/pg-snapshot/.context     # copies OUT; live in place untouched
$ (wrote /tmp/proving-ground-design/pg-snapshot/.pi-context.json -> contextDir ".context")
$ pi-context context-status --cwd /tmp/proving-ground-design/pg-snapshot --json
... "gaps":{"total":94,...}, "tasks":{"total":67,...}, "decisions":{"total":18,...}, "block_kinds":{"total":18},"relation_types":{"total":41} ...
```

The snapshot carries the real live data and the CLI reads it via `--cwd` against the COPY. (It
also surfaces the catalog⊇config drift: snapshot config has 18 kinds / 41 relation_types vs the
fresh catalog's 17 / 35 — i.e. FGAP-094 — which is exactly why snapshot-of-live is needed for
realistic proofs, not the catalog alone.)

### §4 — CLI-op-level proof WITHOUT the global symlink (tsx-against-src main())

`main()` invoked from `packages/pi-context-cli/src/cli.ts`, against the isolated substrate:

```
$ npx tsx /tmp/proving-ground-design/local-cli-proof.ts
... {"ok":true,"op":"context-status",...}
[local-cli (src, no global symlink) exit code = 0]
```

A proving-ground-owned binary (src via tsx) drives real CLI ops against the isolated substrate;
the global symlink is bypassed entirely.

### §5 — The schema-bump INCIDENT reproduced AND contained in isolation

Engine-level, against the bundled config schema's real constraints (`required:
[schema_version, block_kinds]`, `additionalProperties: false`), each mutation hitting only the
pg copy and restored after:

```
$ npx tsx /tmp/proving-ground-design/schema-bump-proof.ts /tmp/proving-ground-design/pg-fresh
BASELINE: load OK
A (stranded unknown key — schema field removed/renamed): THROW (incident reproduced, no migration) -> Validation failed for config.json (.../pg-fresh/.context/config.json): : must NOT have additional properties
B (missing newly-required field — block_kinds dropped): THROW (incident reproduced, no migration) -> Validation failed for config.json (.../pg-fresh/.context/config.json): : must have required property 'block_kinds'
```

CLI-op-level, the exact incident EXIT CODE 5 via the real GLOBAL CLI against a bumped pg copy
(`read-config` routes through the strict config load):

```
$ pi-context read-config --registry block_kinds --cwd /tmp/proving-ground-design/pg-bump --json
   [exit 5]
{"ok":false,"op":"read-config","error":"validation failed for config.json (/tmp/proving-ground-design/pg-bump/.context/config.json): `/`: unexpected property `legacy_removed_field`"}
```

The SAME global CLI + op against the CLEAN pg succeeds (proves the binary works; the pg isolates
the failure):

```
$ pi-context read-config --registry block_kinds --cwd /tmp/proving-ground-design/pg-fresh --json
{"ok":true,"op":"read-config","output":{"data":[ ...17 block kinds... ],...}}
```

### §6 — Live substrate + global binary byte-identical after all of the above

```
$ shasum -a 256 .context/config.json .pi-context.json
3f2d1f65445c00867e23a277f8b5129b776d4938e35608b6088fd52167b9148d  .context/config.json
af9cc6c910ebe61be3762aaa408af9971ed01827cc4ceb7c893182dd8a095223  .pi-context.json
$ git status --short .context .context-jit-spec-v2 .pi-context.json      # (empty — clean)
$ ls -la /opt/homebrew/bin/pi-context
... -> ../lib/node_modules/@davidorex/pi-context-cli/dist/bin.js          # unchanged symlink
```

Hashes identical to the §-baseline, git clean, symlink unchanged. The incident class was
reproduced (exit 5, no migration) AND fully contained to `/tmp`. Zero live exposure, proven by
hash equality, not asserted.

### Prototype file inventory (all under /tmp/proving-ground-design/)

- `materialize.ts` — catalog-fresh substrate via tsx-against-src
- `local-cli-proof.ts` — CLI `main()` from src against the isolated substrate
- `schema-bump-proof.ts` — engine-level incident reproduction (restores after each attempt)
- `bump-cli-proof.ts` — CLI-op invocations against a bumped pg
- `pg-fresh/`, `pg-snapshot/`, `pg-bump/` — three disposable proving-ground substrates

---

## Summary

The incident is two couplings: the global CLI is a symlink into the repo's `dist/` (rebuild =
live binary changes), and config is validated against the running binary's schema with no
migration. The proving-ground method severs both for dev — substrate isolation by the harness
targeting the pg via `--cwd` pointer-redirection (a proof through the harness never resolves the
live `.context`), and binary independence by `tsx`-against-`src` (the global link is never
repointed; `npm run build` runs only after a green proving-ground proof). The method composes
existing primitives (`initProject`, `adoptConception`, `installContext`, `--cwd`, the catalog,
`cp -R` snapshot, `tsx`); the only net-new code is one `scripts/orchestrator/proving-ground.ts`
composer. The /tmp prototype proves all of it end-to-end, including a faithful exit-5
reproduction of the incident, with the live substrate and global binary left byte-identical.
