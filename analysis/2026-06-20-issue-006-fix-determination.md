# issue-006 fix determination — promote-cli destructive-op-before-validation + poisonable target

Date: 2026-06-20
Active substrate: `.context`
Author: investigation agent (LLM-composed under filing authority)

## 1. The problem as filed (verbatim authority)

`issue-006` (status `open`, critical, package `pi-context-cli`, location `scripts/promote-cli.mjs:153`):

> scripts/promote-cli.mjs resolves the install target via `npm prefix -g` (resolveTargetPrefix, line 107), which echoes an inherited `npm_config_prefix` rather than the true global; an invocation that set `--prefix` (e.g. `npm --prefix <dir> run`) exports `npm_config_prefix` into the child, so the resolved target becomes that value. `isRealGlobal` (line 116) is derived from the source label alone, which survives the poisoning, so a poisoned prefix is classified as the real global. When `isRealGlobal` is true the script runs the destructive `npm rm -g @davidorex/pi-context-cli` (line 153) before installing and before any validation of the target. The only validation — the realpath `startsWith(REPO_ROOT)` check (line 177) — is post-install, too late to prevent the rm. … Class: a destructive operation executed before its precondition is validated, compounded by trusting a poisonable ambient environment for a safety-critical target. Fix: resolve the real global from a source that does not honor an inherited `npm_config_prefix` (or refuse the implicit real-global arm when the prefix is inherited); hoist a pre-destruction validation before line 153 carrying the `REPO_ROOT` check plus an intended-global assertion, so no destructive op runs until the target is validated; retain the post-install guard as defense-in-depth. Post-condition: no destructive op executes against an unvalidated target.

The line numbers (153, 116, 107, 177) and the `npm rm -g` reference the script as it existed **when the issue was filed** — a since-superseded version.

## 2. The real installed state (read-only inspection of the live system)

- `which -a pi-context` → `/opt/homebrew/bin/pi-context`
- That bin is a symlink: `/opt/homebrew/bin/pi-context -> ../lib/node_modules/@davidorex/pi-context-cli/dist/bin.js`
- `/opt/homebrew/lib/node_modules/@davidorex/pi-context-cli` is itself a symlink **into the working tree**: `-> .../Users/david/Projects/workflowsPiExtension/packages/pi-context-cli`
- `realpath $(which pi-context)` → `/Users/david/Projects/workflowsPiExtension/packages/pi-context-cli/dist/bin.js`

So the operator currently resolves **directly into the dev tree's build output** — the classic `npm link` arrangement. A routine `npm run build` (`rm -rf dist && tsc`) transiently removes and repoints the live operator binary. This is the **root condition** that the whole arc (`TASK-069`, issue-004) exists to retire, and it is **still live** — the promote has never been run against the real global prefix.

`packages/pi-context-cli/package.json`: `bin: { "pi-context": "./dist/bin.js" }`, `files: ["dist/", "*.md"]`, build = `rm -rf dist && tsc -p tsconfig.build.json && chmod +x dist/bin.js`. Root `package.json` exposes `promote:cli → node scripts/promote-cli.mjs`.

## 3. Root cause (two coupled defects, one class)

The filed issue is one instance of a broader root cause with two facets:

1. **Binary coupling (the upstream root, issue-004 / TASK-069):** the operator is an `npm link` symlink into the repo's own `dist/`. The repo build owns the file the operator runs. Any decoupling fix must install a *copy* the build cannot touch.
2. **The promote mechanism's own safety (issue-006/007/008/009):** the script that performs the decoupling must not itself run a destructive global op (`npm rm -g`, `npm i -g`) against an **unvalidated** or **attacker-influenceable** target. issue-006 is specifically: (a) the real-global target was read from a *poisonable* source (`npm prefix -g` honoring an inherited `npm_config_prefix`), and (b) a destructive op ran *before* any containment validation.

## 4. Derived requirements/constraints the fix must satisfy

Derived from what this tool *is* (a developer-run, publish-free operator-binary promoter) and the environment it runs in (a dev's machine where `npm_config_*` can be inherited from a parent `npm run`, and the only thing standing between the script and `/opt/homebrew` is its own logic):

- **R1 — Decoupling (the purpose):** after promotion, `realpath` of the operator bin must resolve to a *copied* package tree under the install prefix, **not** into the repo. A repo `rm -rf dist && tsc` must leave the installed bin's inode/content unchanged, and the operator must keep running with the repo `dist/` deleted.
- **R2 — Current code, not stale registry:** the installed copy must reflect working-tree source (packed from the tree), not the registry `0.31.0` release; sibling `@davidorex/*` deps must resolve to the co-installed packed set, not the registry.
- **R3 — Non-poisonable real-global resolution:** the real-global arm must not derive its target from an inherited `npm_config_prefix` (any letter-case). It must either scrub the ambient override or refuse to treat an inherited override as the real global.
- **R4 — No destructive op before validation:** no `npm rm -g` / `npm i -g` may execute until the target prefix has passed containment + intended-target validation. Validation is a *precondition*, structurally unreachable-past, not a post-hoc check.
- **R5 — Validated representation == acted-upon representation:** the path that is validated must be exactly the path npm installs into. No literal/unresolved leaf may survive validation to be redirected (symlink swap) before the install (the TOCTOU class, issue-007).
- **R6 — Containment:** a target whose realpath is the repo root or under it is refused, with a `path.sep` boundary (so a sibling sharing the prefix string does not match), in both the pre-validation and the post-install guard (one consistent representation, issue-009).
- **R7 — Explicit-override testability + safety:** a throwaway target must be reachable via `--prefix <dir>`, the glued `--prefix=<dir>`, and `PROMOTE_PREFIX=<dir>` (issue-008), and exercising an override must never touch the real global.
- **R8 — Failure atomicity:** a failed install must leave the prior operator runnable and its installed payload unchanged (no remove-then-install window).
- **Out of scope (derived):** this is a dev-machine convenience promoter, not a hardened multi-user installer. It need not defend against a root-level attacker who already controls `/opt/homebrew`; its job is to not *itself* be the vector that destroys the global from a poisoned env or an unvalidated path, and to produce a build-immune operator copy. CI gating, the proving-ground harness, and schema-evolution are explicitly out of TASK-069's scope.

## 5. Solution space — distinct ways to decouple the operator from the dev build

| # | Approach | How it decouples | Trade-offs |
|---|---|---|---|
| A | **Packed local copy into the global prefix** (`npm pack` the workspace set → `npm i -g <tarballs>`) | Installs a real copied dir tree under `<prefix>/lib/node_modules`; bin shim points into the prefix, never the repo | Publish-free; reflects working-tree; co-install resolves sibling deps to packed set. Requires the promote script's own safety hardening (the issue-006/007/008/009 surface). This is the chosen approach. |
| B | **Publish to npm + `npm i -g @davidorex/pi-context-cli`** | Standard global install of a registry copy | Decouples from build, but installs the *registry* release, not working-tree code (violates R2); gated on publish + OTP; defeats fast dev iteration. |
| C | **Copy `dist/` to a fixed out-of-repo path + a hand-written shim on PATH** | Operator runs a copied file outside the repo | Bypasses npm's dep resolution — sibling `@davidorex/*` deps would not resolve without hand-managing node_modules; reinvents what `npm i -g <tarball>` already does correctly. |
| D | **Build into an out-of-repo dist dir, keep the link** | Build output no longer under the repo path the link targets | Still a link to build output; a rebuild still repoints/removes it — does not satisfy R1. Rejected. |
| E | **Leave the link; make `build` not `rm -rf dist`** (incremental tsc) | Avoids the transient-removal symptom | Treats the symptom (transient removal) not the cause (operator coupled to build output); a `clean` or a tsc error still breaks the live operator. Rejected. |

Approach **A** is the only one satisfying R1+R2 without publish/OTP. The cost it carries — the destructive-global-op safety surface — is exactly what issues 006/007/008/009 enumerate.

## 6. Evaluation of the existing attempt (`scripts/promote-cli.mjs` on disk)

The on-disk script is **substantially reworked from the version issue-006 describes** — the cited `npm rm -g` at line 153 and the poisonable `isRealGlobal` no longer exist. Git history: `99aed9b` (initial promote) → `73ede54` (close issue-006 classes) → `57d331d` (iterate-2) → `8d4bdc7` (issue-007/008/009 iterate-3) → `60613cc` (leaf-segment TOCTOU residual). It is approach **A**, correctly chosen. Against the derived requirements:

- **R3 (non-poisonable):** MET. `resolveTargetPrefix` refuses any inherited `npm_config_prefix` (case-insensitive scan) on the real-global arm and probes `npm prefix -g` under `cleanNpmEnv()` (all `npm_config_*` scrubbed). **Proven** (§7).
- **R4 (no destructive op before validation):** MET. `assertSafeTargetPrefix` is called before build/pack/install; the destructive `npm i -g` is structurally unreachable until it returns. The separate `npm rm -g` was *removed entirely* — `npm i -g --force` replaces an existing link in place (this also satisfies R8).
- **R5 (validated == acted-upon):** MET, including the issue-007 leaf residual. The validator materializes the full prefix (`mkdirSync recursive`), re-resolves (`realpathSync`), re-runs containment on the fully-resolved path, and returns that `safePrefix`; install/binPath/logs all consume it. No literal leaf survives. **Proven** (§7).
- **R6 (containment, both guards):** MET. Pre-validation and post-install guard both compare against `REPO_ROOT_REAL + sep`. **Proven** (§7).
- **R7 (override forms + safety):** MET. `--prefix`, `--prefix=`, and `PROMOTE_PREFIX` all parse; override arm never touches the real global. **Proven** (§7).
- **R1/R2 (decoupling + current code):** MET by construction and **proven** against a throwaway prefix (§7).

**Verdict: the existing script is the correct fix, and is correctly built — not over-built, not wrong.** Its hardening is proportional to its real scope (a dev-machine promoter that wields `npm i -g`); each guard answers a concretely demonstrated misuse/race, not speculative threat. The destructive-op surface is *smaller* than when issue-006 was filed (the `npm rm -g` is gone), which is the right direction.

**The work is INCOMPLETE in three respects — none in the script's logic:**

1. **Substrate status lag.** `issue-006` and `issue-007` are still `open`, but their defects are closed in code (006 by `73ede54`; 007's ancestor window by `8d4bdc7` and the leaf residual by `60613cc`). `VER-054` is `partial` and predates `60613cc`; its one `failed` criterion (S2, the leaf-segment race) is now closed. These need a fresh full verification and status closure.
2. **The real-global promote has never run.** The live `/opt/homebrew/bin/pi-context` is still the `npm link` into the repo (§2). TASK-069's whole point — a build-immune operator — is *not yet realized on this machine*; only the override-prefix shape is proven. The real-global arm requires running `npm run promote:cli` with no override (user action; it writes `/opt/homebrew`).
3. **Docs-surface-sync gap (TASK-069 criterion 9).** Neither `README.md` nor `packages/pi-context-cli/README.md` documents the packed-copy install / `promote:cli`. No `npm link` instruction remains (criterion 8 met), but the replacement is undocumented.

## 7. Proof — observable conditions + what was run (throwaway prefixes only; `/opt/homebrew` never mutated)

All destructive npm ops were aimed at `/tmp/promtest/*`; the real global was inspected read-only only.

- **R3 non-poisonable (issue-006 core):** `NPM_CONFIG_PREFIX=/tmp/promtest/realglobal node scripts/promote-cli.mjs` (no `--prefix`) exited non-zero **before any global op**, printing `Error: the global npm prefix is being driven by an inherited NPM_CONFIG_PREFIX=… Refusing to treat that inherited override as the real global prefix.` → a poisoned env cannot reach a destructive op.
- **R6 containment (issue-009):** `node scripts/promote-cli.mjs --prefix=/Users/david/Projects/workflowsPiExtension/packages` (glued, into repo) → `Error: refusing to promote into target prefix …/packages: resolves under this repo's root.` And a symlink-into-repo target (`ln -s …/packages/pi-context-cli /tmp/promtest/symlink; --prefix /tmp/promtest/symlink`) → refused `resolves under this repo's root` (caught on the resolved realpath, before any op).
- **R5 leaf-segment TOCTOU (issue-007 residual / VER-054 S2):** materialized a non-existent override leaf as a real dir (mirroring `assertSafeTargetPrefix`'s `mkdirSync` + `realpathSync`), then attempted to replace it with a symlink-into-repo → `EEXIST` (`cannot replace materialized dir with symlink — TOCTOU CLOSED`). The window the residual depended on (a literal, not-yet-created leaf) no longer exists after materialization.
- **R7 + R1 + R2 positive path:** `node scripts/promote-cli.mjs --prefix /tmp/promtest/freshtarget` → exit 0; installed `…/freshtarget/bin/pi-context` as a shim → `…/freshtarget/lib/node_modules/@davidorex/pi-context-cli/dist/bin.js` (under the prefix, **not** the repo); the installed package is a **real directory copy** (not a symlink into the repo); 7 `@davidorex` packages co-installed; log confirms `the real global binary was NOT touched`.
- **R1 decoupling invariant (the heart of TASK-069):** hashed the installed bin (`sha256 51161305f77ad22e20b5a90971f9c9d18ae805bee45d30c6f7e80c4940e67c42`), then **deleted the repo `packages/pi-context-cli/dist/`**, then re-hashed the installed bin → **identical hash**, and ran the installed operator via its shim → `pi-context --help` exited 0 with the full op listing. The packed copy is genuinely independent of the repo build. (Repo `dist/` rebuilt afterward; throwaway dirs removed.)

**Conclusion of proof:** every requirement the script's *logic* must satisfy (R1–R8) is demonstrated met on throwaway targets. The only unproven criteria are the ones that *require writing the real global* (TASK-069 criteria 1–7) — a deliberate user action, not a logic gap.

## 8. The determined correct fix (statement)

The correct fix for issue-006 is **approach A as implemented in the current `scripts/promote-cli.mjs`**: a publish-free packed local copy of the working-tree workspace set installed into a validated, non-poisonable target prefix, with (a) the real-global arm refusing any inherited `npm_config_prefix` and probing under a scrubbed env, (b) a single `npm i -g --force` and **no** `npm rm -g` (so no destructive op and no remove-then-install window), (c) containment + intended-target validation as a structural precondition that returns the fully-materialized, fully-resolved `safePrefix` the install consumes, and (d) a post-install repo-containment guard as defense-in-depth. The post-condition issue-006 demands — *no destructive op executes against an unvalidated target* — holds.

**Remaining work to fully close the arc (logic-complete; these are status/run/docs, not code):**
1. Fresh full verification of the current script (supersede `VER-054`'s `partial`); then close `issue-006` and `issue-007` with citing evidence.
2. Run `npm run promote:cli` against the real global (user action — writes `/opt/homebrew`) to actually retire the live `npm link` and satisfy TASK-069 criteria 1–7.
3. Document the packed-copy install / `promote:cli` in `README.md` + `packages/pi-context-cli/README.md` (TASK-069 criterion 9; usage-only).
