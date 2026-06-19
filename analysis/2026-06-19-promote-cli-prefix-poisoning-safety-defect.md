# promote-cli prefix-poisoning safety defect — investigation

Date: 2026-06-19
Subject: `scripts/promote-cli.mjs` resolves a destructive-operation target from a poisonable ambient environment value and gates the destructive op too late to prevent it.
Status of this artifact: investigation report. No code changed, no substrate mutated. Surfaced by using the tooling (an `npm --prefix <repo> run promote:cli` invocation) — an experience gap.

---

## 1. Root cause

`resolveTargetPrefix()` (`scripts/promote-cli.mjs:93-113`) has three resolution arms in priority order: `--prefix <dir>` (line 96), `PROMOTE_PREFIX` env (line 104), else `npm prefix -g` (line 107). The third arm is the "real global" arm and is the only arm that sets `source` to `"npm prefix -g (real global)"`.

The defect is in that third arm:

- **`npm prefix -g` is not an authority on the real global prefix; it echoes whatever `npm_config_prefix` is in the process environment.** `npm` reads `npm_config_prefix` from the environment as a config override of the global prefix. So `run("npm prefix -g", …)` at line 107 returns the *inherited* `npm_config_prefix` when one is set, not the machine's true global prefix.

- **`npm run` and `npm --prefix` export `npm_config_prefix` into the child's environment.** An invocation `npm --prefix <repo> run promote:cli` sets `npm_config_prefix=<repo>` for the script process. The script's own `npm prefix -g` subprocess inherits it and dutifully reports `<repo>` as "the real global prefix."

- **`isRealGlobal` then mis-classifies the poisoned value.** `isRealGlobal` is derived purely from the `source` label (`scripts/promote-cli.mjs:116`):

  ```js
  const isRealGlobal = source === "npm prefix -g (real global)";
  ```

  Because the poisoned value still flows through the third arm, `source` is `"npm prefix -g (real global)"` and `isRealGlobal` becomes `true`. The flag asserts "this is the intended real global" while the resolved prefix is in fact an arbitrary inherited directory (the repo root in the surfacing incident).

Net: a safety-critical target (the prefix that the destructive `npm rm -g` and the `npm i -g` act on) is taken on trust from a poisonable ambient environment value, and the boolean that gates the destructive op is computed from a label that does not survive the poisoning.

## 2. Shape — the ordering defect

The destructive operation runs **before** any validation that the resolved prefix is a sane/intended global:

- `scripts/promote-cli.mjs:151-155` — gated only on `isRealGlobal`, runs `npm rm -g @davidorex/pi-context-cli` (with `ignoreError: true`). This is the destructive op. Under a poisoned prefix it removes the package from the poisoned prefix's `lib/node_modules`.
- `scripts/promote-cli.mjs:157-159` — then `npm i -g --prefix "<prefix>" <tarballs> --force`.
- `scripts/promote-cli.mjs:162-185` — ONLY THEN the verify guard: `lstatSync(binPath)`, and if the installed bin is a symlink, `realpathSync(binPath).startsWith(REPO_ROOT)` (lines 176-181). This guard is *post-install*, and it checks only one thing — that the installed bin does not resolve back into the repo (the retired npm-link arrangement). It is **post-rm and post-install**, so it cannot prevent a destructive removal against a wrong prefix; it can at best report a bad landing after the damage.

**What validation is missing and where:** between resolution (`resolveTargetPrefix()`, ~line 113) and the first destructive op (line 153) there is NO check that the resolved prefix is the intended global. Specifically missing, pre-rm:

1. **Poison detection / non-trust of `npm prefix -g`.** No check that `npm_config_prefix` is unset (or no use of a non-overridable source) before trusting the third arm's value.
2. **Prefix-sanity validation.** No check that the "real global" prefix is not the repo root / a project directory / a path under `REPO_ROOT` — the very `startsWith(REPO_ROOT)` family of check that exists post-install is absent pre-rm.
3. **No confirmation that the prefix actually looks like a global npm prefix** (e.g. exists, has/expects `lib/node_modules`, is the same value an independent non-overridable resolution yields).

The existing post-install guard is the right *kind* of check placed at the wrong *time*: it fires after both the rm and the install, when its only remaining power is to abort with the destruction already done.

## 3. Safe reproduction (observed output; throwaway prefix only)

All three sub-claims reproduced against throwaway `/tmp` dirs. The real global (`/opt/homebrew`) was never targeted; the destructive op was STUBBED (a faithful copy of the resolution + control-flow code, with `run()` not executing the rm/install).

### (a) A poisoned `npm prefix -g` resolves the target to the poisoned dir

```
$ npm_config_prefix=/tmp/poison-prefix-test npm prefix -g
/tmp/poison-prefix-test
```

`npm prefix -g` echoed the inherited `npm_config_prefix` verbatim — it is not an independent authority on the real global.

Surfacing mechanism confirmed (how the poison gets into the script's env via `npm`):

```
$ npm_config_prefix=/Users/david/Projects/workflowsPiExtension node /tmp/show-env.mjs
npm_config_prefix seen by script = "/Users/david/Projects/workflowsPiExtension"
```

(An `npm --prefix <repo> run …` / `npm run` invocation is exactly what sets `npm_config_prefix` for the child; the script inherits it.)

### (b) `isRealGlobal` becomes true for the poisoned prefix, and (c) the rm fires before the verify guard

A faithful copy of `resolveTargetPrefix()` + the `isRealGlobal` derivation + the lines 151-159 control flow, with the destructive `run()` calls stubbed, run with NO `--prefix` and NO `PROMOTE_PREFIX`, only the poisoned `npm_config_prefix`:

```
$ npm_config_prefix=/tmp/poison-prefix-test node /tmp/repro-resolve.mjs
resolved prefix : /tmp/poison-prefix-test
source          : npm prefix -g (real global)
isRealGlobal    : true
WOULD RUN (line 153): npm rm -g @davidorex/pi-context-cli  [STUBBED — not executed]
WOULD RUN (line 159): npm i -g --prefix "/tmp/poison-prefix-test" <tarballs> --force  [STUBBED]
THEN verify guard (lines 160-183): target.startsWith(REPO_ROOT="/Users/david/Projects/workflowsPiExtension") — runs AFTER the rm above
```

This proves: (a) the poisoned `npm prefix -g` resolved the target to the poisoned dir; (b) `source` stayed `"npm prefix -g (real global)"` so `isRealGlobal === true`; (c) under that flag the `npm rm -g` block (line 153) is reached and would fire BEFORE the post-install verify guard (lines 162-185) ever runs. The verify guard's `startsWith(REPO_ROOT)` check is structurally downstream of the destructive op.

Not reproduced (deliberately, per safety constraints): the actual `npm rm -g` / `npm i -g` execution. The control-flow reachability is what the stubbed repro establishes; executing the destructive op was never required to prove the ordering and is forbidden against the real global. No sub-claim was inferred — each is backed by observed output above.

## 4. Prior-art search (active substrate `.context`)

Searched via the pi-context CLI directly (`filter-block-items` with the documented `--field/--op/--value` flags; `read-block-page` whole-node reads). NB: an initial pass used a non-existent `--where` flag, which the op silently ignored (empty predicate → 0 matches) — a false-negative; re-run with the correct flags below. (That silent-ignore-of-unknown-flag behavior is itself a candidate experience gap, distinct from this investigation's subject.)

- **`framework-gaps`** (99 items): no gap tracks promote-cli safety, poisonable prefix resolution, or destructive-op-before-validation. `description ~ /prefix|promote|destructive|poison|npm rm|npm_config|ambient|precondition/` returned only incidental term-matches — FGAP-002 (substrate clone/import, "promoteItem"), FGAP-012/015/032/062/072/083/092 (CLI flag/help/dry-run/update-transaction topics) — none about this script. Adjacent-but-distinct: **FGAP-088** (closed; CLI install-op reflection), **FGAP-089** (PreToolUse hook scope), **FGAP-095/096/097** (config load-time migration / validate-before-repair / additive discipline) — referenced in issue-004 as explicitly *separate* from the binary-identity coupling.

- **`issues`** (5 items): **issue-004** — *"npm link couples the operator pi-context binary to the dev dist/ — a dev build mutates/bricks the live binary"* — status **open**, priority **critical**, package `pi-context-cli`, `location packages/pi-context-cli/package.json:31`. This is the PARENT item: it proposes the structural fix as *"make the operator binary a COPY via npm pack + npm i -g `<tarball>` (or a custom prefix), refreshed by an explicit publish-free local promote step"* — i.e. `promote-cli.mjs` is the remediation for issue-004. **issue-004 does NOT track a safety defect in that remediation script**; it predates and motivates the script. The other four issues (issue-001 resync refuse-path bytes, issue-002 layer-plans schema, issue-003 update-refusal, issue-005 same-version resync narrowing) are unrelated.

- **Analysis MDs**: `2026-06-18-proving-ground-prior-art-research.md` and `2026-06-19-task069-process-failure-audit.md` reference the promote mechanism; only the former mentions `npm prefix -g`, and only as the assumed-trusted real-global resolver (`# the REAL global prefix, left untouched throughout`) — neither documents the poisoning defect.

**Prior-art verdict: UNTRACKED.** No substrate item tracks the prefix-poisoning / destructive-before-validation safety defect. The closest item, **issue-004 (open, critical)**, tracks the upstream coupling and authored the promote-step approach; this finding is a NEW safety defect *in the issue-004 remediation* and should relate to issue-004 (e.g. as a child issue) rather than refile its coupling problem. A new filing is justified.

## 5. Class

This defect is an INSTANCE of (at least) two general classes; it is not atomic.

- **Class A — destructive operation executed before its precondition is validated (TOCTOU-of-ordering).** The precondition "the resolved target is the intended global prefix" is only ever checked *after* the destructive `npm rm -g` (and after install), so the validation cannot prevent the destruction. The general rule: any irreversible/destructive op must be gated by a *pre*-op validation of every value it acts on; a post-op verification is a detector, not a guard. This is the same family as the substrate-side issues already tracked (issue-001 "resync refuse path leaves stray decls" — a destructive/mutating step ordered before the validation that should have gated it; issue-005 "same-version resync verbatim-overwrites with no re-validation" — overwrite ordered before/without item re-validation). The promote-cli defect is the *script/shell-tooling* member of this class.

- **Class B — trusting ambient/poisonable environment for a safety-critical target.** `npm prefix -g` is treated as authoritative for "the real global," but its output is an environment-overridable value (`npm_config_prefix`) inherited from whoever launched the process. The general rule: a safety-critical target must be resolved from a non-poisonable source (or validated against an independent, non-overridable expectation), never taken on faith from ambient env. The `--prefix`/`PROMOTE_PREFIX` arms are *explicit* operator intent (acceptable as overrides because they cannot masquerade as "the real global"); the bug is that the implicit third arm both trusts ambient env AND labels the result as the trusted real-global, collapsing "explicitly chosen" and "ambiently inherited" into one `isRealGlobal=true`.

The specific symptom (an `npm --prefix <repo> run` invocation poisoning the prefix) is the triggering instance; filing at the class level (destructive-before-validation for tooling scripts, AND non-poisonable resolution of safety-critical targets) avoids leaving sibling instances (any other env-overridable resolver, any other destructive op in the orchestrator scripts) as latent debt.

## 6. Validly-established fix design (design only — not implemented)

Two coordinated corrections; both grounded in the existing code. The fix must hold this post-condition: **no destructive op (`npm rm -g`, `npm i -g`) runs until the resolved target prefix has passed a pre-op validation, and the implicit real-global arm cannot be silently driven by an inherited `npm_config_prefix`.**

### 6a. Make the real-global resolution non-poisonable (locus: `resolveTargetPrefix()`, lines 93-113)

- When the third (implicit) arm is taken, do not trust an inherited override. Either resolve the global prefix from a non-overridable source, or detect-and-refuse poisoning: if `process.env.npm_config_prefix` is set while neither `--prefix` nor `PROMOTE_PREFIX` was passed, the "real global" arm is being driven by ambient env — STOP with an explicit error directing the operator to pass `--prefix`/`PROMOTE_PREFIX` for an intended target, rather than silently adopting the inherited value. (An independent cross-check — e.g. compare `npm prefix -g` against `npm config get prefix` / a default-resolution that ignores the env override — can confirm the value is the machine's true global, not an inherited one.)
- Keep the explicit `--prefix`/`PROMOTE_PREFIX` arms unchanged: they are operator intent and are the safe override path the script already documents.

### 6b. Reorder/gate so the destructive op is preceded by prefix validation (locus: insert a guard between line 113 and line 151; reuse the line 176-181 check class)

- Introduce a single `assertSafeTargetPrefix(prefix, { isRealGlobal })` invoked immediately after resolution (before the build/pack, certainly before line 151), that refuses when the resolved prefix is unsafe to act on:
  - `prefix.startsWith(REPO_ROOT)` → refuse (this is the same `startsWith(REPO_ROOT)` guard currently at lines 177-181, hoisted to run *pre-destruction* against the prefix itself, not post-install against the bin realpath).
  - `prefix === REPO_ROOT` or prefix resolves to any project/working directory → refuse.
  - optionally: prefix does not exist / does not look like a global npm prefix (no `lib/node_modules` expectation) → refuse for the real-global arm.
- Only after `assertSafeTargetPrefix` passes may the `isRealGlobal` branch reach the `npm rm -g` (line 153). The post-install verify guard (lines 162-185) is retained as a defense-in-depth detector, not the primary gate.

### Precise change loci

| Locus | Change |
|---|---|
| `resolveTargetPrefix()` (93-113), third arm (107-112) | Refuse/cross-check the implicit real-global arm when `npm_config_prefix` is inherited; resolve from a non-poisonable source. |
| `isRealGlobal` (116) | Derive from a validated resolution, not from a label that survives poisoning (or keep the label but gate it behind 6a's refusal). |
| New `assertSafeTargetPrefix()` called after line 113, before line 131/151 | Pre-op refusal: prefix under/equal-to `REPO_ROOT`, prefix not a sane global. Hoists the lines 177-181 `startsWith(REPO_ROOT)` check to pre-destruction. |
| Verify guard (162-185) | Unchanged in intent; demoted to post-op detector behind the new pre-op gate. |

### Post-condition the fix must guarantee

For every code path that reaches `npm rm -g` (153) or `npm i -g` (159): the prefix those ops act on has been validated as the intended global (not a poisoned/inherited value, not under `REPO_ROOT`) by a check that ran strictly *before* the first destructive op. An inherited `npm_config_prefix` can no longer be silently adopted as "the real global." A wrong/poisoned prefix is refused (process exits non-zero) before anything is removed or installed.

### Project-compliance notes

- This is an `analysis/*.md` investigation, not the implementation. The fix itself, if pursued, runs the canonical pipeline: file issue-004-child issue + TASK/DEC via the pi-context CLI (provenance-reviewed), plan-mode + Explore, coding subagent, runtime demo + adversarial probe, docs-surface-sync (the script's header docstring + any README naming the promote step), then merge — none of which this report performs.
- `promote-cli.mjs` is an orchestrator script (a launch-support composer), consistent with `feedback_orchestrator_scripts_dual_surface`; the fix lives in that script, not in a reflected op.
- Per the analysis-MD → research heuristic, this is a grounded investigation/safety-defect analysis and is a candidate to surface as a `research` findings_document — to be proposed to the user, not auto-filed.
