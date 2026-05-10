# tsx barrel-import flake via @earendil-works/pi-coding-agent missing exports map

Status: open
Date: 2026-05-10

## Symptom

`npx tsx -e` invocations that import from the `@davidorex/pi-context` index-barrel
fail at module-resolution time with `ERR_PACKAGE_PATH_NOT_EXPORTED` against
`@earendil-works/pi-coding-agent/package.json`. The error originates inside
tsx's CJS resolver shim, not the user code.

Captured error (from a fresh `npx tsx -e "import {initProject} from '@davidorex/pi-context';console.log(typeof initProject);"` invocation in repo root, 2026-05-10, Node v23.7.0):

```
Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: No "exports" main defined in
  /Users/david/Projects/workflowsPiExtension/node_modules/@earendil-works/pi-coding-agent/package.json
    at exportsNotFound (node:internal/modules/esm/resolve:314:10)
    at packageExportsResolve (node:internal/modules/esm/resolve:604:13)
    at resolveExports (node:internal/modules/cjs/loader:653:36)
    at Function._findPath (node:internal/modules/cjs/loader:742:31)
    at node:internal/modules/cjs/loader:1380:27
    at nextResolveSimple (.../tsx/dist/register-D46fvsV_.cjs:4:1004)
    ...
  code: 'ERR_PACKAGE_PATH_NOT_EXPORTED'
```

## Root cause

`@earendil-works/pi-coding-agent` (declared as a peer dependency of all four
pi-context-stack packages at `^0.74.0`) ships a `package.json` with no
`exports` field. Node's resolver, when invoked through tsx's loader shim,
applies strict subpath-resolution semantics and rejects the package because
it has neither an `exports` map nor a layout the shim can fall back to via
the legacy `main` path. Plain `node` against built `dist/index.js` does not
hit this code path; tsx's CJS-interop register stack does.

The `@davidorex/pi-context` index barrel transitively pulls in
`@earendil-works/pi-coding-agent` (extension-runtime types and helpers), so
any tsx import that transits the barrel triggers the failure even if the
user's import names a symbol unrelated to the pi-coding-agent surface.

## Reproduction

From repo root, with `node_modules/` populated:

```
npx tsx -e "import {initProject} from '@davidorex/pi-context';console.log(typeof initProject);"
```

Observed: `ERR_PACKAGE_PATH_NOT_EXPORTED` as above. Exit code non-zero.
No user-code line executes.

## Workarounds (proven viable in prior demos)

1. **Plain node against built dist** — skip tsx, use:
   ```
   node --input-type=module -e "import {initProject} from './packages/pi-context/dist/index.js';..."
   ```
   Used by AF.3 (installProject demo) in `/tmp/retroactive-demos.md`. Requires
   prior `npm run build`.

2. **Direct subpath imports that bypass the barrel** — pi-context declares
   named subpath exports in its `package.json` (e.g.
   `@davidorex/pi-context/project-dir`, `@davidorex/pi-context/block-api`,
   `@davidorex/pi-context/schema-validator`). Importing from a subpath that
   does not transitively reach pi-coding-agent loads cleanly under tsx.
   Used by most demos in `/tmp/retroactive-demos.md`.

## Impact

- Every future runtime-demo or tsx-eval ceremony that touches the pi-context
  index-barrel will hit this. Recurring fragility for the verification
  ceremony, not a project defect of the substrate code itself.
- Affects DEC-0018 demo construction patterns: tsx-eval-as-canonical-write-surface
  must always reach via subpath imports or fall back to plain node against
  `dist/`.
- Not a project defect within scope of FGAP-026 phase 1.2 verification —
  the FGAP-026 substrate work itself is unaffected; the fragility is in the
  demonstration tooling.
- Per `feedback_tsx_eval_retry`: this error is deterministic, not the
  Node-23.7-flake described there. Retry will not help.

## Resolution paths

1. **Upstream fix** at `@earendil-works/pi-coding-agent`: add an `exports`
   map to its `package.json`. Owner-controlled; out of repo scope.
2. **tsx resolver flag**: investigate whether tsx exposes a flag to relax
   strict exports resolution for legacy packages. Not surveyed.
3. **Project-side convention** (current): prefer direct subpath imports
   (`@davidorex/pi-context/<subpath>`) for tsx-eval ceremonies; fall back to
   plain `node --input-type=module` against `dist/index.js` when the
   index-barrel is unavoidable. Document in CLAUDE.md if recurrence rate
   warrants — currently catalogued here.

## References

- Source incident: `/tmp/retroactive-demos.md` Section "Cumulative gaps +
  recommendations" §1 (subagent identification, no filing — deferral).
- Demos affected: AF.3 (installProject) used the plain-node workaround;
  B.1 and most others used the subpath-import workaround.
- Related: `feedback_tsx_eval_retry.md` (separate flake, different cause —
  Node 23.7 non-determinism on local-subpath imports; this entry is a
  deterministic resolver-strictness issue, not the same class).
- peer-dep declaration site: each `packages/*/package.json`
  `peerDependencies."@earendil-works/pi-coding-agent": "^0.74.0"`.
