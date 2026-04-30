# pi-mono alignment audit

Audit date: 2026-04-28. Scope: bundled-content + runtime resource discovery surfaces in this monorepo vs. pi-mono `packages/coding-agent/src/core/`.

## 1. Three claims

### Claim 1 — "Examples are defaults, not templates" — CONFIRMED

`packages/pi-behavior-monitors/skill-narrative.md:29-41` states the customization model verbatim: "create `.pi/monitors/<name>.monitor.json`" and "the override fully replaces the bundled version by name." It also names the deprecated copy-on-first-run pattern explicitly: "This replaces the prior copy-on-first-run pattern that left seeded `.pi/monitors/` files frozen at the package version."

`packages/pi-behavior-monitors/README.md:15-20` repeats it: "Five example monitors ship bundled […] To customize one, create `.pi/monitors/<name>.monitor.json` in your project — the override fully replaces the bundled version by name."

`packages/pi-behavior-monitors/CHANGELOG.md:6-10` is explicit that `seedExamples()` was removed in v0.14.6 and the bundled tier now reads the package directly.

`grep -rnE "copyFileSync|cpSync" packages/pi-behavior-monitors/` returns zero hits in `index.ts`. No code path writes a same-name monitor JSON into `.pi/monitors/`.

Implication for cleanup: same-name `.monitor.json` / `.patterns.json` / `.instructions.json` in `.pi/monitors/` matching a bundled file in `examples/` is by construction a stale seeded copy. Unconditional deletion is sound; no hash-manifest required.

Caveat surfaced during the pass: present in `/Users/david/Projects/workflowsPiExtension/.pi/monitors/` are five `<name>.patterns.json` and five `<name>.instructions.json` sidecars (no `.monitor.json` files — those were already deleted earlier in the session). These sidecars are also stale seeded copies under the same logic.

### Claim 2 — pi-mono has no copy-then-shadow pattern — CONFIRMED

`pi-mono/packages/coding-agent/docs/skills.md` "Locations" section (lines 23-37) describes pure discovery: `~/.pi/agent/skills/`, `.pi/skills/`, `pi.skills` package fields, settings array, CLI `--skill`. Same shape in `prompt-templates.md:7-15`, `themes.md`, `extensions.md:7`. None mention seeding or copying.

`pi-mono/packages/coding-agent/src/core/resource-loader.ts` is the canonical loader (`DefaultResourceLoader`). All write/copy primitives are absent — the file contains zero `writeFileSync` / `copyFileSync` / `cpSync` invocations and no `mkdirSync` against user-config paths. Discovery proceeds via `loadSkills`, `loadPromptTemplates`, `loadThemes`, `loadExtensions` — pure read paths.

`grep -rnE "copyFileSync|cpSync|writeFileSync|mkdirSync" pi-mono/packages/coding-agent/src/`: every write site is one of (a) session persistence (`session-manager.ts`, `agent-session.ts:3160` for image attachments), (b) user-initiated config writes (`settings-manager.ts:199`, `keybindings.ts:268`), (c) auth file management (`auth-storage.ts`), (d) `migrations.ts` (one-time data structure migrations the user opts into via running pi), (e) `package-manager.ts:1599-1615` (npm install scaffolding for `pi install`). Zero of these copy package-bundled content into user dirs as a side effect of resource discovery.

`PiManifest` interface (`package-manager.ts:97-102`) recognises four contribution fields: `extensions`, `skills`, `prompts`, `themes` — all consumed via discovery, never seeded.

Implication: pi-mono is the canonical reference for bundled-content handling. Our `seedExamples()` (now removed for monitor JSONs) was a deviation. The corollary in §2.A below identifies a remaining deviation.

### Claim 3 — classifier `.md` template subdirs still trapped — CONFIRMED

`packages/pi-behavior-monitors/index.ts:1186-1207` (`createMonitorAgentTemplateEnv`) precedence:

```
1. projectMonitorsDir   (project .pi/monitors/)
2. userMonitorsDir      (~/.pi/agent/monitors/)
3. EXAMPLES_DIR         (package examples/)
```

Same precedence as `discoverMonitors`. A pre-existing project subdir (e.g. `.pi/monitors/fragility/classify.md`) wins over the bundled `examples/fragility/classify.md`.

`git show f10e8bb -- packages/pi-behavior-monitors/index.ts`: the only edit at `createMonitorAgentTemplateEnv` was line 438 — `isDir(projectMonitorsDir)` replaced by a null-check on the new `findProjectMonitorsDir()` helper. Search-path order and tier semantics were untouched. v0.14.6 fixed the JSON-discovery tier but not the template-shadowing trap.

Direct verification: `/Users/david/Projects/workflowsPiExtension/.pi/monitors/` contains template subdirs `fragility/classify.md`, `hedge/classify.md`, and `_shared/iteration-grace.md` — all same-name as `packages/pi-behavior-monitors/examples/{fragility,_shared}/`. These are seeded copies frozen at the version they were seeded from. They currently shadow bundled equivalents.

Implication: any cleanup pass must include same-name template-subdir deletion alongside JSON deletion. The structural fix (vs. cleanup) would be either inverting precedence for bundled-named templates or moving bundled templates outside the user-overridable namespace; neither of those is what the user asked for in this audit.

## 2. Other deviations from pi-mono

### A. `pi-project/src/index.ts:182-228` `initProject` — copy-on-init seeder

`fs.copyFileSync` runs at `/project init` time, copying every file from `packages/pi-project/defaults/schemas/` and `packages/pi-project/defaults/blocks/` into `.project/`. Idempotent (skips existing), but once seeded the bundled file becomes the user's tier-1 file forever. A schema fix in a future package release does not propagate.

Pi-mono equivalent: there isn't one. Pi-mono never seeds `.pi/` from package defaults; it expects users (or `pi install`) to author their own files, with bundled tiers serving as live read-only fallback via `pi.skills`/`pi.prompts`/etc.

This is the same trap v0.14.6 closed for monitor JSONs, still open for project schemas and seed blocks. Recommendation: ship `defaults/schemas/` as a third discovery tier read live (mirrors `discoverMonitors`); reserve `/project init` for creating empty user-authored block files only. Schema files become package-bundled defaults, overridable by same-name file in `.project/schemas/`. No further code change needed for the override mechanism — `schema-validator.ts` already resolves from `.project/schemas/`; only the discovery side needs a tier-3 fallback.

### B. `pi.monitors` and `pi.agents` are not pi-mono contribution fields

`PiManifest` (`pi-mono/packages/coding-agent/src/core/package-manager.ts:97-102`) recognizes `extensions`, `skills`, `prompts`, `themes`. There is no `monitors` or `agents` key. Our `pi-behavior-monitors/package.json:28-33` declares only `extensions` and `skills`; `examples/` is loaded by absolute path inside our extension code via `EXAMPLES_DIR`, not declared as a contribution.

This is structurally fine — extensions can ship bundled assets read by their own code — but it means we lose the pi-mono-native discovery, source-tagging (`SourceInfo`/`PathMetadata`), CLI override (`--monitor <path>`), settings array (`monitors: ["~/some/dir"]`), and conflict diagnostics. Not a defect today; an expansion opportunity if the user wants monitors/agents to be first-class pi resources.

### C. Three independent multi-tier loaders — no shared abstraction

- `discoverMonitors` — `packages/pi-behavior-monitors/index.ts:325-351`
- `createMonitorAgentTemplateEnv` — `packages/pi-behavior-monitors/index.ts:1186-1207`
- `createAgentLoader` + `createTemplateEnv` — `packages/pi-jit-agents/src/agent-spec.ts:114-132`, `packages/pi-jit-agents/src/template.ts:33-49`

All four implement: (project tier walk-up to `.git`) > (user `~/.pi/agent/<x>`) > (package builtin). Each repeats the `existsSync`/`isDir` probe and array-push pattern. None share code.

Pi-mono uses `DefaultResourceLoader` as a single abstraction over four resource types (skills, prompts, themes, extensions) with shared dedup, conflict detection, source-info tagging, override hooks, and CLI/settings extension paths.

### D. No `ResourceDiagnostic`-equivalent for our shadowed files

Pi-mono returns structured `ResourceCollision` records (`pi-mono/packages/coding-agent/src/core/resource-loader.ts:759-783, 785-810`) when same-name resources collide — surfaced as `diagnostics` to the user.

Our `discoverMonitors` returns `overrides[]` (a different shape) only for monitor JSON; `createMonitorAgentTemplateEnv` and the jit-agents loaders silently let the project tier win without surfacing the shadow. The asymmetry is noted in skill-narrative.md ("override is logged once at session_start") but only the monitor path actually emits the warning.

### E. `findProjectMonitorsDir` walk-up vs. pi-mono's resource walk-up

`packages/pi-behavior-monitors/index.ts:299-309` walks up looking for `.pi/monitors/`, stops at first `.git`. Pi-mono does the same kind of walk for AGENTS.md/CLAUDE.md context files (`resource-loader.ts:90-107`) but stops at filesystem root, not `.git`. The loaders for `.pi/skills`, `.pi/prompts`, etc. don't walk up at all — they consume settings/manifest paths, not `cwd` ancestors. Our walk-up is a local convention that is not consistent with pi-mono's resource discovery model. Behavior is sound but not aligned.

## 3. Simplification candidates (5)

**S1.** Replace `pi-project`'s `initProject` copy-seeder with a third discovery tier in the schema validator and block-API readers — same shape as `discoverMonitors` post-v0.14.6. `/project init` becomes "ensure `.project/` exists and write empty block files for missing kinds"; the `defaults/schemas/` directory is read live from the package as the fallback tier. Eliminates the same trap v0.14.6 closed for monitors, still open here. Single source of truth for default schemas: the bundled package version.

**S2.** Extract a `createTieredLoader<T>(opts)` factory in `pi-jit-agents` (it is already the substrate package) — collapses `createAgentLoader`, `discoverMonitors`, and the two template-env builders to one parameterised function that takes `{ projectDir, userDir, builtinDir, fileSuffix, parser, walkUp? }` and returns the discovered set plus a structured `overrides[]` array. Three separate three-tier implementations become one.

**S3.** Standardise on a single override-diagnostic shape (mirror pi-mono's `ResourceCollision`). All tiered loaders emit the same record. `session_start` shadow logging in pi-behavior-monitors becomes generic; the jit-agents agent + template loaders gain shadow visibility for free.

**S4.** Remove the `_shared/` and `<name>/` template subdir convention from `.pi/monitors/` as user-overridable namespace; keep them inside `examples/` only. User customisation happens at the monitor JSON's `classify.promptTemplate` field, which can already point anywhere via the search path. Templates as bundled-only assets removes the Claim-3 trap structurally without inverting precedence.

**S5.** Rename / scope `examples/` to `defaults/` (parallel to `pi-project/defaults/`). "Examples" implies "templates the user copies and edits"; "defaults" implies "live runtime fallbacks." The naming carries the wrong mental model for the post-v0.14.6 architecture and was the lexical root of the seeded-copy confusion.

## 4. Recommended next moves (smallness × clarity)

1. **(smallest)** Delete remaining stale sidecars in `.pi/monitors/` — `*.patterns.json`, `*.instructions.json`, and same-name template subdirs (`fragility/`, `hedge/`, `_shared/`). Unconditional same-name deletion per Claim 1 + Claim 3. Zero code change.
2. **(small)** S5 rename `examples/` → `defaults/` in `pi-behavior-monitors`. Updates ~6 string references in `index.ts`, README, skill-narrative, package.json `files`, CHANGELOG. Mental-model fix; zero behaviour change.
3. **(medium)** S1 — extend the discovery model in `pi-project` to read schemas live from `defaults/schemas/` as a third tier; downgrade `initProject` to scaffolding empty block files only. Closes the open seeder.
4. **(medium)** S4 — relocate `.pi/monitors/<name>/` template subdir convention to bundled-only. Documentation + skill-narrative edits + the precedence loop in `createMonitorAgentTemplateEnv` (drop the project-tier search of subdirs while keeping it for top-level `.monitor.json`).
5. **(larger)** S2 + S3 — collapse the three tiered loaders to one factory in `pi-jit-agents` with structured override diagnostics. Highest clarity gain; touches three packages; do last.

## Word count

~1,470 words.
