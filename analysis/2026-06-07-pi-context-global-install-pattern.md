# Making `pi-context` a globally installable command — grounded in pi's own pattern

Date: 2026-06-07
Branch: context-jit-spec-v2
Mode: read-only investigation (no edits to source/config, no installs, no substrate writes)

## Scope

Establish, grounded in the canonical `pi` runtime as the exemplar, how to ship `@davidorex/pi-context-cli` so the `pi-context` command (including the spec'd `pi-context --pi-bound` mode, `analysis/2026-06-07-pi-context-pi-bound-cli.md`) resolves on PATH from any directory — not only via in-repo `node packages/pi-context-cli/dist/bin.js`. Out of scope: implementing `--pi-bound` itself (that is R-0004's feasibility-confirmed spec); this is the packaging/distribution layer underneath it.

Sources used:
- Pi runtime (the exemplar): `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent` (resolved via `which pi` → `/opt/homebrew/bin/pi` symlink → `../lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js`).
- Our CLI: `packages/pi-context-cli/`.
- The meta-package: `packages/pi-project-workflows/`.
- The library the CLI depends on: `packages/pi-context/`.
- Spec + research: `analysis/2026-06-07-pi-context-pi-bound-cli.md`, substrate `research` R-0004.

---

## 1. Pi's global-install pattern (the exemplar)

How `pi` becomes a PATH command after a global install:

**Bin mapping** — single name→entry pair, ESM:
```text
@earendil-works/pi-coding-agent/package.json:9-11
  "bin": { "pi": "dist/cli.js" }
@earendil-works/pi-coding-agent/package.json:5
  "type": "module"
```
The bin target is the *built* artifact in `dist/`, not source. On `npm i -g`, npm creates `/opt/homebrew/bin/pi` as a symlink to `dist/cli.js` (verified: `/opt/homebrew/bin/pi -> ../lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js`).

**Shebang on the built entry** — the file npm links must be a node script:
```text
/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js:1
  #!/usr/bin/env node
```
(verified by reading the first line of the *installed* file). npm relies on this shebang on POSIX (it does not itself add one) plus the executable bit.

**Executable bit set during build**, explicitly:
```text
@earendil-works/pi-coding-agent/package.json:33
  "build": "tsgo -p tsconfig.build.json && shx chmod +x dist/cli.js && npm run copy-assets"
```
The `chmod +x dist/cli.js` is the load-bearing step that distinguishes pi's build from ours (verified: the *installed* `dist/cli.js` is `-rwxr-xr-x`).

**`files` whitelist controls the publish payload** — `dist/` is shipped; `src/` is not:
```text
@earendil-works/pi-coding-agent/package.json:24-30
  "files": ["dist", "docs", "examples", "CHANGELOG.md", "npm-shrinkwrap.json"]
```

**`exports` for library consumers** (separate concern from `bin`):
```text
@earendil-works/pi-coding-agent/package.json:14-23
  "." → ./dist/index.js ; "./hooks" → ./dist/core/hooks/index.js
```

**Dependency resolution at global-install time** — pi ships a *shrinkwrap* and its deps are physically nested under its own install tree:
```text
@earendil-works/pi-coding-agent/package.json:38-40
  "prepublishOnly": "npm run clean && npm run build && npm run shrinkwrap"
@earendil-works/pi-coding-agent/package.json:41-58  (runtime deps: pi-ai, pi-tui, pi-agent-core, …)
```
Verified at the install site: `…/pi-coding-agent/node_modules/` contains `@earendil-works`, `@anthropic-ai`, `@google`, `@mariozechner`, etc., and `npm-shrinkwrap.json` (60918 bytes) is present. So when `pi` runs from PATH, every `import` it makes resolves against its own nested `node_modules` — nothing in the user's cwd or a workspace is required. **This is the property our CLI must reproduce: a globally installed CLI's transitive deps must be resolvable from its own install tree, not from a monorepo workspace symlink.**

Reproducible recipe (pi's): `type:module` + `bin:{name:dist/entry.js}` + shebang on the built entry + `chmod +x` in build + `files:[dist,…]` + all runtime deps declared as real `dependencies` (locked via shrinkwrap) → `npm i -g` symlinks the name to the executable built entry, deps nested under the package.

---

## 2. Gap analysis for `pi-context-cli`

`packages/pi-context-cli/package.json` against pi's pattern:

| Requirement (pi exemplar) | pi-context-cli state | Gap |
|---|---|---|
| `type: "module"` | `package.json:10` `"type":"module"` | OK |
| `bin: {name: built-entry}` | `package.json:22-24` `"pi-context":"./dist/bin.js"` | OK |
| Shebang on built entry | `dist/bin.js:1` `#!/usr/bin/env node` (compiled from `src/bin.ts:1`) | OK |
| Executable bit on built entry | `dist/bin.js` is `-rw-r--r--` (verified) | **GAP — no `chmod +x` in build** (`package.json:31` `"build":"rm -rf dist && tsc -p tsconfig.build.json"`) |
| `files` ships dist | `package.json:25-28` `["dist/","*.md"]` | OK |
| `publishConfig.access:public` (scoped pkg) | `package.json:4-6` present | OK |
| All runtime deps declared | `package.json:35-38` deps: `@davidorex/pi-context`, `typebox` | Partial — see below |

Two structural gaps beyond the `chmod`:

**(a) Workspace dependency resolution after global install.** The CLI's only substantive runtime dep is `@davidorex/pi-context` (`package.json:36`, `"^0.30.0"`), which in turn depends on `@earendil-works/pi-coding-agent` + `ajv` + `canonicalize` + `proper-lockfile` (`packages/pi-context/package.json:134-141`). In the monorepo these resolve via the root workspace symlink (`node_modules/@davidorex/pi-context -> ../../packages/pi-context`, verified). After a *global* install they resolve from the registry. **All six `@davidorex/*` packages are published at 0.30.0** (verified via `npm view @davidorex/<pkg> version`): pi-context, pi-context-cli, pi-project-workflows, pi-behavior-monitors, pi-jit-agents, pi-agent-dispatch. (An earlier draft checked `/opt/homebrew/lib/node_modules/@davidorex` and found none — but that shows only that none is globally *installed on this machine*, which is distinct from unpublished.) So `npm i -g @davidorex/pi-context-cli` resolves `@davidorex/pi-context` from the registry today; the published dep tree is real, identical in shape to pi shipping pi-ai/pi-tui/pi-agent-core.

**(b) `--pi-bound` adds a meta-package dependency the CLI does not declare.** The spec (`analysis/2026-06-07-pi-context-pi-bound-cli.md:206-225`) requires `pi-context --pi-bound` to resolve `@davidorex/pi-project-workflows`'s install root via `require.resolve("@davidorex/pi-project-workflows/package.json")` to run `pi install -l <root>` and to read its bundled `skills/*/SKILL.md`. For `require.resolve` to succeed from a globally installed CLI, `@davidorex/pi-project-workflows` must be a declared dependency of `pi-context-cli` (spec calls for adding `"@davidorex/pi-project-workflows":"^0.30.0"`, `:221-225`) AND that meta-package + its four extension deps (`packages/pi-project-workflows/package.json:35-39`: pi-context, pi-workflows, pi-behavior-monitors, pi-agent-dispatch) must be installable — they are, all published at 0.30.0. The actual gap is that the **published 0.30.0 `pi-context-cli` does not declare `@davidorex/pi-project-workflows`** (its deps are pi-context + typebox, `:35-38`), so `--pi-bound`'s `require.resolve` needs that declaration added and a new release cut.

**Publish-unit question.** Two coherent shapes:
- *CLI as its own publish unit*: `@davidorex/pi-context-cli` published, depending on published `@davidorex/pi-context` (and for `--pi-bound`, `@davidorex/pi-project-workflows`). `npm i -g @davidorex/pi-context-cli` pulls the dep tree. Mirrors pi exactly.
- *bin folded into the meta-package*: the meta `@davidorex/pi-project-workflows` (`package.json`) could itself carry the `bin`. But the meta-package ships only `*.ts`/`*.md`/`skills/` (`packages/pi-project-workflows/package.json:19-23`) and has no `dist/` or built CLI entry, so this would require relocating the CLI build there. The CLI-as-own-unit shape is the lower-delta, pi-faithful choice and is what the spec assumes.

Monorepo-workspace publish implication: with lockstep versioning (`npm run release:*`, CLAUDE.md) all `@davidorex/*` move together at the same semver, so the `^0.30.0` ranges between CLI→pi-context→meta stay internally consistent. They are already published at 0.30.0; the remaining deltas are the build `chmod` (§3c) and the `--pi-bound` meta-dep declaration (which requires a new release) — not a publishing blocker or a version-skew risk.

---

## 3. Concrete path(s) to a global `pi-context`

### 3a. Local dogfooding (no registry) — `npm link`

Because the workspace already symlinks `@davidorex/*` under the root `node_modules` (verified), the dep graph is satisfiable on this machine without publishing. To get a PATH `pi-context`:

1. Build the CLI (it must exist in `dist/`): `npm run build` (root) — already produces `packages/pi-context-cli/dist/bin.js`.
2. Make the built entry executable — **required**, since `npm link` symlinks `pi-context` → `dist/bin.js` and npm needs the exec bit on POSIX. Today `dist/bin.js` is `-rw-r--r--`. Either fix the build (3c) or, transiently, `chmod +x packages/pi-context-cli/dist/bin.js`.
3. `npm link` from `packages/pi-context-cli/`. npm symlinks the global `pi-context` bin → this package, and the package's `@davidorex/pi-context` dep resolves through the existing workspace symlink chain.

This yields a global `pi-context` for dogfooding. `--pi-bound`'s `require.resolve("@davidorex/pi-project-workflows/package.json")` also resolves via the workspace symlink — but only because the CLI dir's resolution walks up into the repo's `node_modules`. Once the dep is *declared* (3c) this is robust; relying on it undeclared is the fragile path.

### 3b. Registry form — already publishable today

The lockstep set is published at 0.30.0, so `npm i -g @davidorex/pi-context-cli` works from anywhere now: npm symlinks `pi-context` → `dist/bin.js` and installs the dep tree (incl. published `@davidorex/pi-context`) under the global package's own `node_modules`, reproducing pi's self-contained resolution.

Two caveats on the *published 0.30.0* artifact:
1. The build never `chmod +x dist/bin.js` (§3c), so the published `dist/bin.js` may carry no stored exec bit. npm sets bin perms on install (so a registry `npm i -g` likely still works), but adding the chmod to `build` makes it unconditional and also fixes `npm link` (3a).
2. `--pi-bound` is NOT satisfiable from the published 0.30.0: `pi-context-cli` does not declare `@davidorex/pi-project-workflows` (§2b/§3c), so its `require.resolve` meta-path fails from a registry install. That declaration + a new release (≥0.30.1) is required.

Note CLAUDE.md `feedback_hold_releases_until_authorized`: any new release is gated on explicit user authorization + interactive OTP.

### 3c. Exact package.json / build deltas required (both paths benefit)

`packages/pi-context-cli/package.json`:
- **Build must set the exec bit on the bin entry.** Change `:31`
  `"build": "rm -rf dist && tsc -p tsconfig.build.json"`
  → add a `chmod +x dist/bin.js` step (pi uses `shx chmod +x dist/cli.js`, `pi/package.json:33`; `shx` keeps it cross-platform, or plain `chmod +x` POSIX-only). This is the single change that blocks both `npm link` and `npm i -g` today.
- **Declare the meta-package dependency for `--pi-bound`** (`:35-38` dep block) — add `"@davidorex/pi-project-workflows": "^0.30.0"` per spec `:221-225`. Without it, `require.resolve("@davidorex/pi-project-workflows/package.json")` from an installed CLI is unresolvable (it only works in-repo via the workspace symlink).

No change needed to `bin`, `files`, `type`, `exports`, or shebang — those already match pi's pattern. `prepublishOnly` (`:32`) already runs clean+build, so adding the chmod to `build` propagates to publish.

Dependency satisfaction per path:
- `npm link` (3a): `@davidorex/pi-context` and (once declared) `@davidorex/pi-project-workflows` resolve through the root workspace symlinks already present.
- `npm i -g` (3b): they resolve from the registry; requires the lockstep set to be published first.

---

## 4. How `--pi-bound` plugs in once `pi-context` is global

The spec routes `--pi-bound` inside `main(argv)` *before* op resolution (`analysis/2026-06-07-pi-context-pi-bound-cli.md:514-525`, integration at `cli.ts:435-443`); it is explicitly NOT a substrate op (it is excluded from the reflected `surface:"use"` set, `cli.ts:44`). So `--pi-bound` is purely a CLI process mode added to the same `bin.js`→`cli.ts main()` entry that global install exposes. Once `pi-context` resolves on PATH, `pi-context --pi-bound` is reachable from any cwd with zero additional wiring — the global-install work in §3 is exactly what makes the spec's entrypoint usable.

The **load-bearing global-install-specific concern** the spec itself flags (R-0004 findings, "the meta-path resolution strategy is the load-bearing open piece"):

The original `scripts/launch-constrained-pi.sh:63-64` computes the meta-package as a `$REPO`-relative path (`REPO/packages/pi-project-workflows`). An installed CLI has no `$REPO`. The spec's port replaces this with node resolution (`:175-186`):
```ts
path.dirname(require.resolve(`@davidorex/pi-project-workflows/package.json`))
```
This works **only if** `@davidorex/pi-project-workflows` is resolvable from the CLI's install location — i.e. exactly the declared-dependency requirement in §2(b)/§3c. The two paths differ:
- Global `npm i -g`: the meta-package and its four extension deps are nested under the CLI's own `node_modules` → `require.resolve` succeeds, `pi install -l <metaRoot>` points at the installed meta-package, and the skill-union glob reads the meta-package's bundled `skills/*/SKILL.md`. Self-contained, repo-independent — the intended end state.
- `npm link` from workspace: resolution walks into the repo's `node_modules` symlinks → works, but `<metaRoot>` is the in-repo `packages/pi-project-workflows`, so the "installed-package" abstraction is only simulated. Fine for dogfooding; not a substitute for verifying the published-package resolution.

Net: `--pi-bound` is producible once `pi-context` is global. The meta-package and its four extension deps are already published at 0.30.0; the single global-install-specific risk is whether `require.resolve("@davidorex/pi-project-workflows/package.json")` (and downstream `pi install -l`) resolves correctly from a *registry-installed* CLI — which reduces to "declare the dep in `pi-context-cli` (§3c) and cut a new release," then smoke-test. There is no second mechanism needed.

---

## Open questions / risks

1. **Exec-bit on the built bin is missing today** (`dist/bin.js` is `-rw-r--r--`). Blocks both `npm link` and `npm i -g` until `build` adds `chmod +x dist/bin.js`. Single highest-leverage delta.
2. **The published 0.30.0 `pi-context-cli` does not declare the `--pi-bound` meta-dep.** All six `@davidorex/*` ARE published at 0.30.0 (verified via `npm view`), so the registry path (3b) for the base `pi-context` command is available now. What is missing for `--pi-bound` is the `@davidorex/pi-project-workflows` dependency declaration in `pi-context-cli` + a new release (release-gated, `feedback_hold_releases_until_authorized`).
3. **`--pi-bound` meta-resolution unverifiable until the meta-dep ships.** `require.resolve("@davidorex/pi-project-workflows/package.json")` from a registry-installed CLI cannot be tested until `pi-context-cli` declares that dependency and a new release is published; `npm link` only proves the workspace-symlink path, which masks the missing declared dependency. The spec's "load-bearing open piece" is precisely this and remains open until a published-package smoke test runs.
4. **`pi install -l <metaRoot>` from an installed package** assumes `pi` itself is on PATH and that `-l <localPath>` accepts the installed meta-package root the same way it accepts the repo path. Behavior of `pi install -l` against a `node_modules`-nested package root (vs a repo dir) is not verified here — flag for the implementation's runtime demo.
5. **Publish unit not yet decided in code.** This analysis recommends CLI-as-own-unit (pi-faithful, lowest delta); the meta-package currently has no `dist`/bin (`packages/pi-project-workflows/package.json:19-23` ships only `*.ts`/`*.md`/`skills/`), so folding the bin there would be a larger restructure. Decision belongs to the user.
6. **shx vs plain chmod.** pi uses `shx chmod` (devDep) for cross-platform; `pi-context-cli` has no `shx` devDep. Either add `shx` or accept POSIX-only `chmod +x` (Windows global installs already unlikely given the `pi`/bash launcher heritage). Minor.
