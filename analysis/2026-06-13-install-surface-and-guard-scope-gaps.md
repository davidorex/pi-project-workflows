# Install surface + enforcement-hook scope gaps (TASK-033 runtime-demo dogfooding)

Two experience gaps surfaced while running a TASK-033 runtime demo against a fresh `/tmp` substrate. Each below carries verified root cause (file:line re-opened and confirmed), shape, reproducible conditions, prior-art, and class verdict. Neither is filed; both are filing recommendations for the orchestrator to propose to the user.

---

## GAP A — the install ceremony has no reflected CLI op; a CLI-driven bootstrap cannot materialize schemas or block files

### Root cause (verified)

`installContext(cwd, { overwrite })` is the install engine: `packages/pi-context/src/index.ts:1211`. It copies `config.installed_schemas[]` schema bodies from the package samples catalog into `<substrate>/schemas/<name>.schema.json` (loop at `index.ts:1250-1357`), copies `config.installed_blocks[]` starters into `<substrate>/<name>.json` (loop at `index.ts:1299-1357`), and base-stamps each installed schema's as-installed body + content_hash into the object store and `config.installed_from.assets` (baseline loop at `index.ts:1359-1391`).

`installContext` is surfaced to the operator ONLY as a `/context` slash-command handler — the `install` entry of `CONTEXT_SUBCOMMANDS` at `packages/pi-context/src/index.ts:3098-3149` (the `CONTEXT_SUBCOMMANDS` object opens at `index.ts:3079`; its handler calls `installContext(ctx.cwd, { overwrite })` at `index.ts:3103`). It is NOT an `OpDefinition` in the op-registry: `packages/pi-context/src/ops-registry.ts` contains no `context-install`/`install` op. The absence is a recorded design choice, not an oversight — `installContext` is listed in `INTENTIONALLY_UNEXPOSED_WRITERS` at `ops-registry.ts:2171-2175` with the reason "the /context install command engine — operator-facing via the install command handler, not the op-registry; writes config.json to record the install baseline."

Because the reflecting CLI surfaces only op-registry ops, `install` is invisible to it. `pi-context --help` "Substrate lifecycle" lists exactly: `context-accept-all`, `context-archive`, `context-init`, `context-list`, `context-switch` — and no `context-install`. The five listed siblings ARE op-registry ops (`ops-registry.ts`: `context-init` :1460, `context-accept-all` :1480, `context-switch` :1539, `context-list` :1619, `context-archive` :1633).

### Shape

The CLI exposes `context-init` (bootstrap pointer + dirs + skeleton config) and `context-accept-all` (adopt the conception as config) but not the third lifecycle step that turns the declared `installed_schemas[]`/`installed_blocks[]` into on-disk schema files and block files. A CLI-only operator can reach a config-complete-but-unmaterialized substrate and has no CLI op to advance it; the only non-ad-hoc completion is dropping to a `pi -p "/context install"` subprocess (which loads the extension and runs the slash command).

### Reproducible conditions (run, observed)

```
rm -rf /tmp/gapAtest && mkdir -p /tmp/gapAtest
pi-context context-init --contextDir .context --cwd /tmp/gapAtest --yes --json
# -> {"ok":true,...,"created":[".context/",".context/schemas/",".context/config.json"]}
pi-context context-accept-all --cwd /tmp/gapAtest --yes --json
# -> {"ok":true,...,"adopted":true,"schemaCount":16,"blockCount":16}
ls -la /tmp/gapAtest/.context           # config.json (16556 bytes) + empty schemas/ dir
ls -la /tmp/gapAtest/.context/schemas   # EMPTY — no schema files materialized
                                        # no <block>.json files exist at all
```

After `init` + `accept-all`, `config.json` declares 16 schemas + 16 blocks but `schemas/` is empty and no block JSON exists. A subsequent `append-block-item --block tasks --arrayKey tasks --autoId true …` therefore cannot succeed: with `--autoId` the first failure is the schema lookup, throwing `nextId: schema not found for block '<block>' at <schemaFile>` (`block-api.ts:2311`), not the read-time `Block file not found: <filePath>` (`block-api.ts:764`) — that read-time message is what a non-autoId append or a block read raises once the schema exists but the block file does not. (The original finding cited "Block file not found"; for the `--autoId` repro the actual error is the `nextId: schema not found` throw, since `nextId` runs before the block read. Correction noted.)

The only completion path on the CLI surface is the in-pi subprocess seam:

```
pi -p "/context install" --cwd /tmp/gapAtest   # loads the extension, runs the slash-command handler -> installContext
```

This is the genuine seam. (Not separately re-run here — it requires a pi credentialed subprocess and would mutate the throwaway substrate; the slash-command-only surfacing is confirmed directly from `index.ts:3098-3149` + the op-registry absence + `--help`.)

### Whether install SHOULD be a reflected op

The five sibling lifecycle commands are reflected; `install` is the lone unreflected one, and its non-reflection is asserted in `INTENTIONALLY_UNEXPOSED_WRITERS` on the rationale that it is "operator-facing via the install command handler." That rationale predates the closure of FGAP-030, which established the opposite precedent for a sibling: a command-only surface unreachable from the CLI was deemed a gap and resolved by adding the reflected op (see prior-art). `installContext` is a WRITER (writes config + materializes files), so unlike pure-read `checkStatus` it carries writer-classification concerns — but DEC-0006 already threaded a `ctx`/writer channel through the op-execution contract, and `context-init`/`context-accept-all` are themselves reflected writer ops, so the writer concern is not a structural blocker. The evidence points to install being the same class of gap as FGAP-030, with `INTENTIONALLY_UNEXPOSED_WRITERS:2171-2175` being the stale assertion the gap would correct.

### Prior-art

Not tracked as an open gap. Adjacent items:

- **FGAP-030** (CLOSED, VER-043/TASK-049): "check-status drift report is command-only — no context-check-status op, unreachable from the reflecting CLI." The canonical sibling: a command-only surface deemed unreachable-from-CLI and resolved by adding the reflected op. Its impact field names it "Same family as the FGAP-021..026 CLI-parity gaps."
- **FGAP-001** (CLOSED): "init / switch -c bootstrap leaves the substrate config-less." Adjacent but distinct — it closed the config-origination gap (why `init`+`accept-all` now write config), NOT schema/block materialization via the CLI.
- `analysis/2026-06-05-install-update-resync-prior-art.md` exists (install/update/resync prior-art) — present in the install design lineage; it does not file install-not-reflected as a gap.

No substrate item or analysis md tracks "install ceremony has no reflected CLI op / a CLI bootstrap cannot materialize schemas+blocks."

### Class verdict

Instance of a broader class: **substrate-lifecycle operations unevenly reflected to the CLI — the reflecting CLI cannot complete a full bootstrap without dropping to `pi -p`.** The class is the CLI-parity family FGAP-030 already named (FGAP-021..026 + FGAP-030). `install` is the last unreflected member of the `init -> accept-all -> install` bootstrap triad; with it absent, the CLI bootstrap is structurally incompletable on its own surface. The narrow symptom (no `context-install` op) is the triggering instance of "the bootstrap triad's third step is the only one not reflected."

### Filing recommendation (NOT yet filed)

File at the **class altitude**: an FGAP for "the install ceremony is command-only — no reflected `context-install` op, so a CLI-driven bootstrap reaches a config-complete-but-unmaterialized substrate with no CLI op to advance it; completion requires `pi -p \"/context install\"`," with the `INTENTIONALLY_UNEXPOSED_WRITERS:2171-2175` rationale named as the assertion to revisit and FGAP-030 cited as the resolution precedent. Symptom (the `nextId: schema not found` / unmaterialized-substrate repro) is the triggering instance. The orchestrator proposes the filing to the user; this report does not file it.

---

## GAP B — the planning-block provenance/register guard keys on op-name + block-name, never on the target substrate (`--cwd` / active-substrate pointer), so it fires on writes to throwaway substrates it does not protect

### Root cause (verified)

`.claude/hooks/gap-register-guard.sh` reads `tool_input.command` (`:15-17`) and its sole match test is `:20-21`:

```sh
if printf '%s' "$cmd" | grep -Eq '(append-block-item|update-block-item|upsert-block-item)' \
   && printf '%s' "$cmd" | grep -Eq -- '--block[[:space:]]+(framework-gaps|tasks|decisions|features|story|research|issues|conventions)|--arrayKey[[:space:]]+(gaps|tasks|decisions|features|stories|research|issues|rules)'; then
```

The predicate is purely (write-op name) AND (planning block-name or array-key). It never inspects `--cwd`, never resolves `.pi-context.json` `contextDir`, never compares the write target against the active substrate. The reviewed-acknowledgement carve-out (`:22-25`) keys only on the `provenance-reviewed` sentinel substring. On a match with no sentinel, it prints the provenance protocol to stderr and `exit 2` (block) at `:26-49`.

### Shape

The guard's purpose (the `filing-provenance` convention) is to gate planning-block filings that compose verbatim downstream into the ACTIVE substrate. Its trigger condition omits the one dimension that defines its scope — which substrate is being written. A write whose `--cwd` points at a throwaway/non-active substrate (a `/tmp` test dir, a non-active `.context*` sibling) is outside the convention's scope but matches the op-name+block-name predicate identically, so it blocks. The guard fires on shape, not on the resource it protects.

The fix direction is a `--cwd`/active-substrate scoping check, but with a subtlety to NOT over-specify: the hook input is only `tool_input.command` — the raw command string. `--cwd /tmp/X` IS present in that string (the hook could parse it textually), but resolving "is this the ACTIVE substrate" requires reading `.pi-context.json` `contextDir` relative to the command's cwd, and the hook receives no structured cwd — only the project-dir as its own process cwd. So a precise active-substrate check needs (a) parse `--cwd` from the command string (default to project cwd when absent), then (b) resolve the pointer at that cwd and compare. A coarser scoping (block only when `--cwd` is absent or names a `.context*` dir under the project) is the cheaper approximation. Whether to scope precisely or coarsely is for the investigating/implementing pass; the load-bearing fact is the hook DOES receive the `--cwd` text and currently ignores it.

### Reproducible conditions (run, observed)

```
printf '%s' '{"title":"x","status":"open","description":"y"}' > /tmp/gapAtest_item.json
pi-context append-block-item --block tasks --arrayKey tasks --autoId true \
  --item @/tmp/gapAtest_item.json --cwd /tmp/gapAtest \
  --writer '{"kind":"human","user":"davidryan@gmail.com"}' --json
# -> PreToolUse:Bash hook error [gap-register-guard.sh]:
#    "Blocked: a planning-block write. This is a USER-PERMISSION stop ..." (the full provenance protocol)
```

The write targets `/tmp/gapAtest` (a throwaway substrate, not the project's active `.context`), yet is blocked identically to an active-substrate planning write — confirming the trigger keys on `append-block-item --block tasks`, never on `--cwd /tmp/gapAtest`. This also blocked the GAP A repro from reaching the underlying CLI error. The hook receives the `--cwd /tmp/gapAtest` text inside `tool_input.command`; it does not parse it.

### Prior-art

Not tracked. Adjacent items:

- **FGAP-074** (IDENTIFIED, TASK-044): broadens the register guard's BLOCK COVERAGE (only `framework-gaps` originally -> all write-heavy blocks). Distinct axis — block-kind coverage, not target-substrate scope. (The installed `gap-register-guard.sh` already covers `framework-gaps|tasks|decisions|features|story|research|issues|conventions`, i.e. coverage past FGAP-074's stated starting point.)
- `analysis/2026-06-06-substrate-cli-bypass-prevention-hook-spec.md`: the spec for a DIFFERENT hook (`block-substrate-cli-bypass.sh`, NOT installed). That spec's §3.1 deliberately makes its recognizer RESOURCE-scoped — matching the whole `.context*` family by path. It is the contrasting design (resource-scoped), and it does not file the op-shape-scoping of the two installed hooks as a gap.

No substrate item or analysis md tracks "enforcement hook scoped by op-shape rather than target-substrate, firing outside the active substrate it protects."

### Class verdict

Instance of a broader class: **enforcement hooks scoped by op-shape rather than target-substrate, firing outside the active substrate they protect.** The sibling instance is confirmed: `.claude/hooks/block-pi-context-glue.sh` matches on the CLI invocation shape alone — its trigger (`:22`) is `grep -Eq 'pi-context-cli/dist/bin\.js|(^|[;&|]| )pi-context '`, and all four block tests (`:24`, `:29`, `:37`, `:42`) inspect only command-string glue (pipes, loops, redirects, echo/`$?`), never `--cwd` or the active substrate. So a direct-drive-discipline violation against a throwaway-substrate CLI invocation is blocked identically to one against the active substrate. Both installed Bash-matcher hooks (`gap-register-guard.sh`, `block-pi-context-glue.sh`) share the op-shape-not-resource pattern; the not-installed `block-substrate-cli-bypass.sh` spec is the resource-scoped counter-example. The class covers both installed hooks; the provenance-guard symptom is one triggering instance.

### Filing recommendation (NOT yet filed)

File at the **class altitude**: an FGAP for "the project's PreToolUse enforcement hooks (`gap-register-guard.sh`, `block-pi-context-glue.sh`) scope on op-shape + block-name, never on the target substrate (`--cwd` / `.pi-context.json` `contextDir`), so they fire on writes to throwaway/non-active substrates outside the convention they protect," with the provenance-guard `--cwd /tmp` block as the triggering instance and `block-pi-context-glue.sh` named as the confirmed sibling. Contrast the resource-scoped `block-substrate-cli-bypass.sh` spec as the available scoping pattern. Note the subtlety (hook input carries the `--cwd` text but not a structured active-substrate resolution) without over-specifying the fix. The orchestrator proposes the filing to the user; this report does not file it.
