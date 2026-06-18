# Proving-ground prior-art research — sandbox fit + external best-practice survey

Companion to `analysis/2026-06-18-isolated-proving-ground-method.md` (the proposed method:
isolate dev proofs by `--cwd` pointer-redirection through a harness + `tsx`-against-`src`, gating
`npm run build` behind a green proof). This document assesses (Part 1) whether sandbox
environments help or are redundant with that method, surveys (Part 2) external prior-art the
project has not yet considered, and derives (Part 3) the requisite remediation: the standing
requirement is that the dev process must NEVER expose the operator's live-resolving `pi-context`
binary or live `.context` to damage *structurally* — not by operator discipline. The incident root
is coupling (a): the operator's `pi-context` is an `npm link` symlink into the repo's own `dist/`,
so a routine dev `npm run build` (`rm -rf dist && tsc`) transiently deletes then repoints the very
binary the operator runs against live data. Part 3 derives the structural fix and proves the
load-bearing mechanic in `/tmp` (Part 4).

All external claims are cited with URLs and marked CITED; everything else is my synthesis against
this repo. This is research only — no repo file, substrate `*.json`, pointer, or `dist/`/global
link was mutated. The Part 5 mechanic-verification ran exclusively under a throwaway
`/tmp/binary-sourcing-proof/` custom prefix (the real `/opt/homebrew` global prefix and the live
`pi-context` symlink were never touched, confirmed below).

## The two couplings being defended against (re-verified against code, not re-derived)

- **(a) npm-link-into-`dist`.** `/opt/homebrew/bin/pi-context` is a symlink to
  `../lib/node_modules/@davidorex/pi-context-cli/dist/bin.js`, which `npm ls -g --link` resolves
  to `packages/pi-context-cli` in this repo (verified live). The package `build` script is
  `rm -rf dist && tsc -p tsconfig.build.json && chmod +x dist/bin.js`
  (`packages/pi-context-cli/package.json:31`). So `npm run build` not only repoints the
  live-resolving binary to the just-built code — it **deletes `dist/` first**, meaning the global
  binary is transiently absent mid-build. The dev build IS the prod binary; there is no separate
  installed copy.
- **(b) config validated against the bundled schema, no migration.** `loadConfigForDir`
  (`packages/pi-context/src/context.ts:564-581`) reads `config.json`, JSON-parses, then
  `validateFromFile(bundledSchemaPath("config"), data, …)` and returns — no `schema_version`
  branch, no migration call (contrast block data's `validateBlockWithMigrationForDir`). A schema
  bump that adds a required field or forbids an old key strands the live config; the CLI maps the
  throw to exit 5. Verified at source.

Breaking EITHER coupling for dev removes the brick class. The current method gates (a) behind a
green proof and severs (b)'s exposure by proving the transition on a snapshot first. The question
for both Parts: does any external technique sever a coupling more *structurally* (remove it, not
merely gate it)?

---

## PART 1 — Sandbox environments: help or not help

Verdict legend: **adopt** = closes a residual the current method leaves open; **partial** =
marginal/conditional value; **no** = redundant with `--cwd`+`tsx`+snapshot, or wrong tool.

| Technology | Severs (a)? | Severs (b)? | Adds beyond `--cwd`+`tsx` | Cost/friction here | Verdict |
|---|---|---|---|---|---|
| **OS containers (Docker/Podman)** | Yes if the repo + global install live INSIDE the container — the dev build can't touch the host's `/opt/homebrew` binary. But the current method already never rebuilds the host binary until proven, so containerizing only *enforces* that. | Indirectly — a container with its own substrate copy isolates the config, same as a snapshot dir. | Kernel-level FS/process isolation; the dev `npm run build` is physically incapable of repointing the host symlink. Reproducible base image. | Heavy: image build, volume mounts, the dogfooded global `pi-context` would have to be re-linked inside; macOS Docker is a VM with slow bind-mount IO. Breaks the "drive the real global CLI directly" dogfooding surface. | **partial** — only if a hard physical guarantee against host-binary mutation is wanted; otherwise redundant with gating the build. |
| **VMs** | Yes (strictly stronger host isolation than containers). | Indirectly, as above. | Full-machine isolation, snapshot/rollback of the entire env. | Heaviest; multi-GB, slow boot, full toolchain reinstall. Massive overkill for "don't rebuild the symlinked binary." | **no** — disproportionate; nothing here needs kernel/hardware isolation. |
| **Nix / nix-shell / flakes** | Partially: a flake devShell pins the toolchain (node, tsx) to exact hashes and gives each project an isolated env [CITED]. It does NOT by itself stop `npm run build` from repointing an `npm link` symlink — that symlink is outside Nix's purity model. | No. | Bit-for-bit reproducible toolchain; eliminates "works on my node version" drift; `flake.lock` pins inputs to git hashes [CITED]. | Steep learning curve, 5–10s env load, cryptic errors [CITED]; orthogonal to the substrate/binary couplings. | **no** for the coupling problem; **partial** as unrelated toolchain-reproducibility hygiene (not this incident). |
| **`tmpfs` / overlayfs / `chroot`** | overlayfs/chroot *could* present a copy-on-write view of the repo so a build writes to an upper layer, leaving the real `dist/` untouched — that genuinely severs (a) at the FS layer. | Indirectly (the overlay'd substrate copy). | COW means "build, observe, discard" with zero cleanup; tmpfs makes it RAM-fast. | Linux-centric; overlayfs/chroot are not first-class on macOS (the dev host here is darwin). Setup is fiddly and non-portable. | **no** on this host (darwin); the `cp -R` snapshot already gives the disposable-copy property portably. |
| **git worktrees** | **No** — and this is the key negative finding. A worktree shares the single `.git` object store but each worktree gets its OWN `node_modules`/`dist/` [CITED]. Crucially, the `npm link` global symlink points at ONE package dir; a worktree at a different path is not what `/opt/homebrew/bin/pi-context` resolves to, so building in a worktree does NOT touch the live binary — UNLESS you re-link, and most monorepo build tools write to shared caches that two builds can corrupt [CITED]. | No. | Cheap parallel checkouts sharing history; the project already gitignores `.claude/worktrees/*`. | The link-into-dist coupling means a worktree build is only safe *because it's not the linked dir* — which is the same property as "just don't rebuild the linked dir." Re-linking a worktree re-creates the coupling. | **no** — redundant with not rebuilding; actively risky if re-linked. Worktrees solve parallel-edit isolation, not binary/substrate isolation. |
| **process / user-namespace sandboxes** (bubblewrap, `sandbox-exec`, unshare) | Yes — can deny write to `/opt/homebrew` and the repo `dist/` for the build process, hard-failing an in-place rebuild. | Indirectly. | Lightweight per-process FS/network confinement without a full container. | Linux `bwrap`/`unshare` not native on darwin; macOS `sandbox-exec` is deprecated. Profile authoring is fiddly. | **partial** — a denylist on `dist/`+`/opt/homebrew` for the build process would *enforce* the gate, but the gate already exists in the method; low marginal value, real setup cost on darwin. |
| **"ephemeral environment" CI patterns** (per-PR throwaway env) | Yes in CI: each run provisions a fresh env, builds, tests, tears down — the build never touches a persistent live binary because there isn't one. | Yes in CI: a fresh substrate/DB per run [CITED, Testcontainers/Prisma shadow DB share this shape]. | Repeatability + automation: the proof runs on every push, not just when the dev remembers. | Requires the proof to be expressible as a CI job; the GH Actions CI here already runs check+build+test on Node 22/23. | **adopt (as a CI gate)** — see Part 3; the *concept* (build+prove in a throwaway env, never against a live persistent binary) is exactly the method, and CI is where it becomes non-optional. |

### Part 1 bottom line on the npm-link-into-dist coupling specifically

Only three things in the table actually *prevent* a dev build from touching the live-resolving
binary: (1) building inside a container/VM where the host binary isn't visible, (2) an
overlayfs/COW or namespace denylist over `dist/`+`/opt/homebrew`, (3) **simply not having the
live binary be the dev `dist/` at all** — i.e. a separate install prefix or a packed tarball
(Part 2C). Options (1) and (2) are heavyweight and darwin-hostile; they *enforce* a gate the
method already states. The structural fix is (3), which lives in Part 2, not in sandboxing.
Everything else in the table is either redundant with "don't rebuild the linked dir until proven"
(worktrees, the current `cp -R` snapshot) or solves a different problem (Nix → toolchain
reproducibility).

---

## PART 2 — External prior-art methods, surveyed and mapped

### 2A. Schema / migration safety

| Method | One-line | Canonical source (URL) | Applicability to this project |
|---|---|---|---|
| **Expand-contract (parallel change)** | Make breaking schema changes in 3 phases — expand (add new alongside old), migrate (dual-write/backfill), contract (drop old) — so old and new code/data coexist with zero downtime [CITED]. | Fowler, *ParallelChange* https://martinfowler.com/bliki/ParallelChange.html ; Prisma Data Guide https://www.prisma.io/dataguide/types/relational/expand-and-contract-pattern ; Wellhausen https://www.tim-wellhausen.de/papers/ExpandAndContract/ExpandAndContract.html | **Applicable, high value.** Coupling (b) is precisely a non-expand-contract change: a bump that *removes/renames* a key or *adds a required* field strands the old config instantly. An additive-only ("expand") config-schema discipline — new fields optional, old fields never removed until a later "contract" release — would make most config bumps non-bricking *by construction*, independent of any migration code. This is the cheapest structural mitigation of (b). |
| **Dual-write / backfill** | During expand, write both old and new shapes (often via a trigger) and backfill existing rows before the reader switches [CITED]. | Domenico Luciani https://domenicoluciani.com/2020/01/01/expand-contract.html | **Partially.** The substrate has one config per dir, not high-volume rows; "dual-write" maps to the config migration writing both shapes during a transition release. Lower leverage than the additive discipline above, but the backfill idea = the missing config-migration the doc flags. |
| **Migration dry-run + down-migration / rollback** | Run the migration in a non-committing/preview mode and author a reversible `down` so a bad migration can be undone [CITED]. | Alembic best practice: test `upgrade()`/`downgrade()` and run `alembic check` / `flyway validate` in CI [CITED] https://www.bytebase.com/blog/flyway-vs-liquibase/ | **Applicable.** This is exactly the project's own forward plan: TASK-057 (`read-schema-history` + applied-at), TASK-058 (`walk-migration-chain`, "the git bisect analog"), and the missing config-migration registry entry. A config `down`-migration + a `--dryRun` (which `/context update` already has for schemas) extended to config would make (b) reversible. |
| **"Test migrations against a copy of production"** | Before prod, apply the migration to a throwaway DB seeded from a prod snapshot to catch drift/locking/data-loss the dev data wouldn't surface [CITED]. | Expand-contract production-testing note https://www.prisma.io/dataguide/types/relational/expand-and-contract-pattern ; deployHQ https://www.deployhq.com/blog/database-migration-strategies-for-zero-downtime-deployments-a-step-by-step-guide | **Already the method's core.** `materialize --from snapshot --snapshot-of .context` + `prove-schema-bump` IS "test against a copy of production." The method independently re-derived an established practice — worth noting it has a name and canonical backing. |
| **Shadow database (Prisma Migrate)** | A second *temporary* DB created+deleted on every `migrate dev` run; existing migrations are replayed into it to detect schema *drift* and potential data loss before touching the dev DB [CITED]. Not used in prod. | Prisma docs https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/shadow-database ; mental model https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/mental-model | **Strong, directly-applicable analog for (b).** The shadow DB is the proving-ground's exact shape — a disposable copy where the *new* schema/migrations are exercised against the *current* state to catch drift before the live store is touched. Confirms the method's snapshot-proof design and names the drift-detection role (FGAP-094 "catalog⊇config drift" is the same drift class). The Prisma lesson is that this is *automatic per dev-iteration*, not a manual rehearsal — see Part 3. |
| **Flyway/Liquibase checksum-guard** | The tool records a checksum of each applied migration and *refuses to proceed* if an already-applied migration was edited [CITED]. | https://www.bytebase.com/blog/flyway-vs-liquibase/ | **Applicable, maps to existing intent.** This is the install-baseline `content_hash` the project already records (`/context update` 3-way merge base = "object-store body at the baseline `content_hash`"). TASK-055 ("update pre-flight committed-substrate check + git-tag restore-point") is the same guard family. |

### 2B. Ephemeral test environments

| Method | One-line | Canonical source (URL) | Applicability |
|---|---|---|---|
| **Testcontainers** | Spin up a real dependency (DB, broker) in a throwaway container per test run, fresh and isolated [CITED]. | https://golang.testcontainers.org/modules/postgres/ ; Node https://node.testcontainers.org/modules/postgresql/ | **Partially / conceptually only.** The substrate is local typed-JSON, not a networked service — there is no container-worthy dependency. The *pattern* (fresh isolated instance per run) is already met by `mkdtempSync` fixtures and `materialize`. Don't adopt the tool; the project's tmpdir fixture is the lightweight equivalent. |
| **pg-tmp / ephemeral DB-per-test + snapshot reset** | Per-test clean DB without recreating the container, via a snapshot-restore feature [CITED]. | Testcontainers postgres snapshot https://golang.testcontainers.org/modules/postgres/ | **Partially.** Maps to `materialize`/`teardown` per proof. The "snapshot then restore between cases" idea is exactly what `schema-bump-proof.ts` does (restores the pg copy after each mutation) — already present. |
| **Golden master / approval testing** | Capture a known-good output once ("golden"); a change that diffs against it must be explicitly approved [CITED, ApprovalTests family]. | https://approvaltests.com/ (canonical), referenced in snapshot-testing literature | **Applicable, novel here.** A proof could assert the *full* output of key ops against a checked-in golden (e.g. `context-status` JSON shape) so a schema bump that silently changes op output is caught, not just hard-fails. Complements the exit-5 check with a positive-shape check. |
| **Snapshot testing** | Serialize a value and compare to a stored snapshot; mismatches surface intended/unintended changes [CITED]. | Jest/Vitest snapshot docs (canonical) | **Partially.** The repo uses `tsx --test` + vitest already; snapshotting op outputs against a snapshot-of-live substrate would harden the proving-ground proofs. Low cost, additive. |
| **Contract testing (Pact)** | Consumer and provider independently verify a shared contract of expected requests/responses [CITED]. | https://prgrmmng.com/contract-testing-with-testcontainers-and-pact | **Mostly not — but one mapping.** No network consumer/provider boundary here. The nearest analog: the *catalog ⊇ consumed-vocabulary* relationship (FGAP-094, TASK-067 "build-time parity gate") is a contract between the shipped catalog (provider) and the deriver's needs (consumer). Frame TASK-067 as a contract test conceptually; don't adopt Pact. |
| **Property-based testing** | Generate many random inputs satisfying invariants instead of hand-picked cases [CITED]. | fast-check (canonical JS lib) | **Partially, opportunistic.** Could fuzz config/schema shapes against `loadConfigForDir` to find more bricking mutations than the two the prototype hand-picked (the doc only proved "removed key" + "missing required"). Not core to the couplings; a hardening nicety. |

### 2C. Tool / binary isolation in monorepos — the "dev build IS the prod binary" problem

This is the category most directly aimed at coupling (a).

| Method | One-line | Canonical source (URL) | Applicability to coupling (a) |
|---|---|---|---|
| **`npm pack` + install the tarball into a temp project** | Build a `.tgz` exactly as published and install it like a real consumer, instead of symlinking [CITED]. | npm docs https://docs.npmjs.com/cli/v11/commands/npm-pack/ ; Watmore https://jasonwatmore.com/npm-pack-for-local-package-dependency-testing | **Directly applicable — the structural fix.** A packed-tarball dev binary is a *copy*, not a symlink into live `dist/`, so building the repo does NOT change it. This removes coupling (a) rather than gating it. Caveat [CITED]: npm caches by version, so bump a pre-release version (`0.31.0-rc1`) before each pack or the tarball won't reinstall. |
| **`npx <tarball>` / run CLI from a built tarball** | Execute the CLI straight from a `.tgz` (local path or URL) without a global install [CITED]. | npm docs https://docs.npmjs.com/cli/v11/commands/npm-install/ (tarball install) ; npm-pack docs | **Applicable.** A throwaway `npx ./pi-context-cli-<ver>.tgz <op> --cwd <pg>` gives a *released-shape* binary for proofs with zero effect on the global symlink — stronger than `tsx`-against-`src` because it also validates packaging (`files`/`exports`/`bin`), which `npm link` notoriously does NOT [CITED]. |
| **Why `npm link` is the wrong tool for verification** | Symlinks have their own file tree → module-resolution discrepancies; linking doesn't test whether the package is correctly packaged for distribution [CITED]. | Vitullo, *Problems with npm link* https://medium.com/@vcarl/problems-with-npm-link-and-an-alternative-4dbdd3e66811 | **Names the root cause of (a).** The incident is the canonical `npm link` footgun: the link makes the dev tree the live resolver. Prior art's standard answer is "don't use `npm link` for the thing you depend on operationally; pack+install." |
| **Separate dev vs released binaries / custom global prefix** | Install global tools into a custom prefix so dev installs don't touch the system one: `npm config set prefix ~/.npm-custom` then `npm install -g <tarball>` [CITED]. | npm docs https://docs.npmjs.com/cli/v11/commands/npm-prefix/ ; https://docs.npmjs.com/cli/v11/configuring-npm/folders/ | **Directly applicable — the structural fix, variant.** Install the *released* `pi-context` from the registry (or a pinned tarball) into the real global prefix for operational/dogfooding use, and run dev proofs from a *separate* prefix or via `npx tarball`. Then there is no single symlink that is simultaneously the dogfooding binary and the dev build target. This severs (a) at the install topology. |
| **Version pinning / immutable releases** | Consume a fixed published version, not a moving local link [CITED, implied by tarball+version-bump discipline]. | npm semver/version docs | **Applicable.** If the dogfooding `pi-context` were a pinned published version (`@davidorex/pi-context-cli@0.31.0` from the registry, not a link), a dev build literally cannot alter it. The cost: every change the operator wants live requires a publish (OTP, currently the user's step) — a real workflow trade-off, hence the fork in Part 3. |
| **Staging vs prod separation** | Distinct environments so unproven changes never resolve in the operational path [CITED, general practice]. | deployHQ migration-strategies (general) https://www.deployhq.com/blog/database-migration-strategies-for-zero-downtime-deployments-a-step-by-step-guide | **Already the method's intent**, expressed as "live `.context` vs proving-ground dir." The binary-side equivalent (released vs dev binary) is the gap the tarball/prefix options fill. |

---

## PART 3 — The derived remediation

The standing requirement: the dev process must NEVER expose the operator's live-resolving
`pi-context` binary or live `.context` to damage **structurally** — not by operator discipline.
That requirement, plus mandate-004 (an option that leaves the identified root coupling intact is
inadmissible — `feedback_no_parallel_ungated_paths` / `feedback_process_is_success_metric`),
decides the binary-sourcing question. It is not a value-fork. The derivation:

- The incident root is coupling (a): the operator's *default* `pi-context` is an `npm link`
  symlink whose `dist/bin.js` resolves into the repo, so a routine `npm run build`
  (`rm -rf dist && tsc`) transiently deletes then repoints the operator's live binary. The
  requirement demands coupling (a) be removed **for the operator's default binary** — not gated by
  discipline, and not removed only-for-proofs.
- The prior framing posed "non-link operator binary" as forcing a registry **publish** (OTP,
  releases HELD). That is a false dilemma. `npm pack` + `npm i -g <tarball>` (or installing the
  tarball into a custom prefix) installs a **copy** into the prefix — a purely local operation,
  no registry, no OTP. Proven in Part 5: the installed package body is a real copied file; mutating
  the source after install does not change it (distinct inode), in direct contrast to `npm link`
  where the source mutation propagates instantly (that IS coupling (a)).
- Therefore there is a publish-free, symlink-free path that satisfies the requirement AND keeps
  fast iteration AND incurs no publish cadence. It dissolves the posed fork.

### The requisite element — structurally remove coupling (a) for the operator's default binary

**Make the operator's `pi-context` a COPY installed by an explicit local promote step, decoupled
from the in-place dev build.** Retire the `npm link`. The operator's binary is installed via
`npm pack` (in `packages/pi-context-cli`) + `npm i -g <tarball>` — into the real global prefix, or
into a dedicated custom prefix on PATH. Because that is a copy into the prefix's own
`node_modules` (Part 5 proves real-file, distinct-inode, source-mutation-immune), a routine
`npm run build` writes the dev `dist/` and **cannot touch the operator binary**. Refresh is an
explicit, deliberate promote step the operator runs when ready — never a side-effect of building.

Cost of the promote step (so it is known, not assumed): `npm pack` in `packages/pi-context-cli`
does **not** trigger a build — the only build hook is `prepublishOnly` (`npm publish` only); there
is no `prepack`/`prepare` script (`packages/pi-context-cli/package.json` `scripts`:
`clean`/`build`/`prepublishOnly`/`test`). So a promote is: `npm run build` (dev, when the operator
wants the new code live) → `npm pack` (packs the existing `dist/`, no rebuild) → `npm i -g`
the tarball. The promote is publish-free and registry-free; it is a local copy refreshed on the
operator's explicit command. npm caches tarballs by version, so a same-version refresh needs
`npm i -g --force` (or a pre-release version bump) to re-extract the new copy [CITED: npm-pack,
npm-install].

This delivers, simultaneously: (1) structural isolation of coupling (a) for the DEFAULT binary —
a dev build is physically incapable of repointing the operator's binary; (2) fast local iteration
— dev proofs still run `tsx`-against-`src` (`--cwd <pg>` redirection) with no install at all, and
the operator promotes only when wanting new code live; (3) no publish cadence — the promote is
local. As a bonus it fixes a second latent defect: `npm link` does not validate packaging
(`files`/`exports`/`bin`), so the linked binary could silently diverge from what `npm publish`
ships; pack+install exercises the real packaged shape [CITED: Vitullo].

### Two already-derivable augmentations (carried from the prior survey, sound)

These attack coupling (b) and the gate's automation; both are derivable, neither a fork:

1. **Additive ("expand") config-schema discipline + a config-migration registry entry.**
   Expand-contract [CITED: Fowler/Prisma] — new config fields land *optional*, existing fields are
   never removed/renamed until a later contract release — makes a config bump *non-bricking by
   construction*: `additionalProperties:false` won't strand it (nothing removed) and no new
   *required* field appears. Pair with the missing config-migration path (the load path validates
   directly against `bundledSchemaPath("config")` with no `schema_version` migration, unlike block
   data's `validateBlockWithMigrationForDir`); already on the roadmap (TASK-057/058 schema-history
   + chain-walk). Deepest fix to (b): it attacks the bricking mechanism, not just exposure.
2. **CI ephemeral-environment gate + golden/approval assertions.** The Prisma *shadow database*
   lesson [CITED] is that drift-detection runs on *every* iteration, not as a remembered rehearsal.
   Encode the proving-ground snapshot-proof as a CI job (the repo already runs check+build+test on
   Node 22/23): materialize a snapshot-of-fixture substrate, run the schema-bump proof, assert no
   exit-5 AND a golden-master match of key op outputs [CITED: approval/snapshot testing]. Converts
   the method from "discipline the operator follows" to "gate the pipeline enforces" — directly per
   `feedback_process_is_success_metric` / `feedback_no_parallel_ungated_paths`.

### What is REDUNDANT and should NOT be added

- **Docker/Podman, VMs, Nix, overlayfs/chroot, namespace sandboxes, git worktrees** as isolation
  for *these couplings*. Each either (i) merely *enforces* the build-gate the method already
  states (containers/namespaces), (ii) is darwin-hostile (overlayfs/chroot, bwrap), (iii) solves
  parallel-edit isolation, not binary/substrate isolation, and re-creates coupling (a) if the
  worktree is re-linked (git worktrees), or (iv) addresses toolchain reproducibility, a different
  problem than the incident (Nix). The portable disposable-copy property is already supplied by
  `cp -R` snapshot + `mkdtempSync`. With coupling (a) removed by the copied-binary promote step,
  these add cost without closing any residual.
- **Testcontainers / Pact as tools.** No networked dependency or consumer/provider boundary
  exists; the tmpdir fixture + the FGAP-094 parity gate are the lightweight equivalents. Adopt
  the *patterns* (fresh-instance-per-run, contract) conceptually, not the tooling.

### No residual value-fork remains

After removing coupling (a) for the default binary via the publish-free copied-binary promote
step, and dissolving the publish/OTP false dilemma, no irreducible value-laden choice survives.
The earlier "Option A (proof-only tarball, keep the live link) vs Option B (pinned published
binary)" framing was inadmissible on both ends: Option A leaves the operator's default binary
still brickable by a routine build (the root residual — disqualified by mandate-004), and Option B
asserted a publish/OTP cost that the local `pack && install -g` path does not incur. The single
derived answer above subsumes the legitimate goal of both (structural isolation of the default
binary) with none of their costs. Implementation variants (real global prefix vs a dedicated
custom prefix on PATH; same-version `--force` vs a pre-release version bump for refresh) are
mechanical configuration choices, decided by operator-environment facts, not value axes — they
do not constitute a fork to surface.

---

## PART 4 — Mechanic verification (the load-bearing copy-vs-symlink proof)

The Part 3 derivation rests on one mechanic: `npm i -g <tarball>` installs a COPY into the prefix
(decoupled from the source), whereas `npm link` installs a symlink (coupled — coupling (a)). Proven
with a trivial throwaway package under `/tmp/binary-sourcing-proof/`, against a custom prefix, with
the real `/opt/homebrew` global prefix never touched. Commands + pasted output:

**A trivial throwaway package with a `bin`, packed (no build involved):**

```
$ cat srcpkg/package.json
{ "name": "throwaway-binsrc", "version": "1.0.0",
  "bin": { "throwaway-binsrc": "./cli.js" } }
$ cat srcpkg/cli.js
#!/usr/bin/env node
console.log("VERSION-ORIGINAL");
$ (cd srcpkg && npm pack)
throwaway-binsrc-1.0.0.tgz
$ npm prefix -g                 # the REAL global prefix, left untouched throughout
/opt/homebrew
```

**Install the tarball into a CUSTOM prefix — the package body is a real COPY (not a link back to source):**

```
$ npm install -g --prefix /tmp/binary-sourcing-proof/customprefix \
      /tmp/binary-sourcing-proof/srcpkg/throwaway-binsrc-1.0.0.tgz
added 1 package in 110ms
$ ls -la customprefix/bin/throwaway-binsrc
... customprefix/bin/throwaway-binsrc -> ../lib/node_modules/throwaway-binsrc/cli.js
$ ls -la customprefix/lib/node_modules/throwaway-binsrc/cli.js
-rwxr-xr-x  ... customprefix/lib/node_modules/throwaway-binsrc/cli.js      # a REAL FILE, not a symlink
$ customprefix/bin/throwaway-binsrc
VERSION-ORIGINAL
```

The bin shim is a symlink into the prefix's OWN `node_modules`, but the package body
(`node_modules/throwaway-binsrc/cli.js`) is a real copied file inside the prefix — this is the
distinction from `npm link`, where `node_modules/<pkg>` itself is a symlink into the source tree.

**Mutate the SOURCE after install — the installed copy is unchanged (decoupled, distinct inode):**

```
$ printf '#!/usr/bin/env node\nconsole.log("VERSION-MUTATED-AFTER-INSTALL");\n' > srcpkg/cli.js
$ node srcpkg/cli.js
VERSION-MUTATED-AFTER-INSTALL                  # source now mutated
$ customprefix/bin/throwaway-binsrc
VERSION-ORIGINAL                               # installed copy UNAFFECTED
$ stat -f '%i %N' srcpkg/cli.js customprefix/lib/node_modules/throwaway-binsrc/cli.js
176592413 srcpkg/cli.js
176592445 customprefix/lib/node_modules/throwaway-binsrc/cli.js     # distinct inodes (not hardlinked)
```

**Contrast — `npm link` re-creates coupling (a): the source mutation propagates instantly:**

```
$ npm link --prefix /tmp/binary-sourcing-proof/customprefix /tmp/binary-sourcing-proof/srcpkg
added 1 package in 113ms
$ ls -la customprefix/lib/node_modules/throwaway-binsrc
... customprefix/lib/node_modules/throwaway-binsrc -> ../../../srcpkg     # node_modules IS a symlink to source
$ customprefix/bin/throwaway-binsrc
VERSION-MUTATED-AFTER-INSTALL                  # link reflects the mutated source — coupling (a)
```

**Custom-prefix isolation + the real global binary untouched throughout:**

```
$ ls /opt/homebrew/bin/throwaway-binsrc
ls: /opt/homebrew/bin/throwaway-binsrc: No such file or directory      # never installed to the real global
$ ls -la /opt/homebrew/bin/pi-context
... /opt/homebrew/bin/pi-context -> ../lib/node_modules/@davidorex/pi-context-cli/dist/bin.js   # unchanged
```

**The promote-step cost on the real package** (so the derivation's cost claim is grounded):
`npm pack --dry-run --ignore-scripts` in `packages/pi-context-cli` packs the existing `dist/` (19
files, the `files`: `["dist/", "*.md"]` set) and invokes no build. The package's only build hook is
`prepublishOnly` (fires on `npm publish` only); there is no `prepack`/`prepare`. So a promote is:
optional dev `npm run build` (only when new code should go live) → `npm pack` (no rebuild) →
`npm i -g <tarball>` — entirely local, no registry, no OTP.

---

## Sources (all external claims)

- Martin Fowler, *Parallel Change* — https://martinfowler.com/bliki/ParallelChange.html
- Prisma Data Guide, *Expand and Contract* — https://www.prisma.io/dataguide/types/relational/expand-and-contract-pattern
- Tim Wellhausen, *Expand and Contract* — https://www.tim-wellhausen.de/papers/ExpandAndContract/ExpandAndContract.html
- Domenico Luciani, *Expand/Contract migration* — https://domenicoluciani.com/2020/01/01/expand-contract.html
- deployHQ, *DB migration strategies for zero-downtime* — https://www.deployhq.com/blog/database-migration-strategies-for-zero-downtime-deployments-a-step-by-step-guide
- Bytebase, *Flyway vs Liquibase 2026* (validate/check-in-CI, checksum guard) — https://www.bytebase.com/blog/flyway-vs-liquibase/
- Prisma docs, *About the shadow database* — https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/shadow-database
- Prisma docs, *Mental model for Prisma Migrate* — https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/mental-model
- npm docs, *npm-pack* — https://docs.npmjs.com/cli/v11/commands/npm-pack/
- npm docs, *npm-install* (tarball install) — https://docs.npmjs.com/cli/v11/commands/npm-install/
- npm docs, *npm-prefix* / *folders* — https://docs.npmjs.com/cli/v11/commands/npm-prefix/ , https://docs.npmjs.com/cli/v11/configuring-npm/folders/
- Carl Vitullo, *Problems with npm link and an alternative* — https://medium.com/@vcarl/problems-with-npm-link-and-an-alternative-4dbdd3e66811
- Jason Watmore, *npm pack for local package dependency testing* — https://jasonwatmore.com/npm-pack-for-local-package-dependency-testing
- Testcontainers (postgres module, snapshot) — https://golang.testcontainers.org/modules/postgres/ , https://node.testcontainers.org/modules/postgresql/
- Contract testing with Testcontainers + Pact — https://prgrmmng.com/contract-testing-with-testcontainers-and-pact
- NixOS Wiki, *Flakes* — https://wiki.nixos.org/wiki/Flakes
- *Nix vs Docker* comparison — https://site.devzero.dev/blog/nix-vs-docker
- pnpm, *Git Worktrees* — https://pnpm.io/next/git-worktrees
- Zylos, *Git Worktree Isolation Patterns* — https://zylos.ai/research/2026-02-22-git-worktree-parallel-ai-development/
