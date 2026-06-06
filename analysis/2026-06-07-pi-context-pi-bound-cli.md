Corrected, code-grounded specification follows.

## Objective

Replace the script entrypoint:

```bash
scripts/launch-constrained-pi.sh
```

with a canonical pi-context CLI process mode:

```bash
pi-context pi-bound
```

This launches a **pi coding-agent session** with the same bounded tool surface the script currently composes.

This is **not** a substrate op. It is a CLI process mode.

---

## Current script behavior to preserve

### 1. Target cwd is the process cwd

Grounding:

```bash
TARGET_CWD="$(pwd)"
```

Source:

```text
scripts/launch-constrained-pi.sh:65
```

Canonical port:

```ts
const targetCwd = deps.cwd ?? process.cwd();
```

`targetCwd` is used for:

- `.pi-context.json` pointer check
- reading active substrate composites
- running `pi install -l`
- launching `pi`

---

### 2. Missing `.pi-context.json` emits a warning, not a hard failure

Grounding:

```bash
if [ ! -f "$TARGET_CWD/.pi-context.json" ]; then
  echo "launch-constrained-pi: WARNING — no .pi-context.json pointer ..."
fi
```

Source:

```text
scripts/launch-constrained-pi.sh:68-70
```

Canonical port:

```ts
if (!existsSync(path.join(targetCwd, ".pi-context.json"))) {
  stderr.write("pi-context pi-bound: WARNING — no .pi-context.json pointer ...\n");
}
```

---

### 3. `--grant` is consumed by the launcher; all other args pass through to `pi`

Grounding:

```bash
GRANTS=()
ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --grant) GRANTS+=("$2"); shift 2 ;;
    *) ARGS+=("$1"); shift ;;
  esac
done
```

Source:

```text
scripts/launch-constrained-pi.sh:73-80
```

Canonical port:

```ts
parsePiBoundArgs(argv): {
  grants: string[];
  passthrough: string[];
}
```

Rules:

- `--grant <id>` appends `<id>` to `grants`
- every other token is preserved in `passthrough`
- missing value after `--grant` is a usage error, exit `2` — **NEW contract introduced by this port, not a preserved behavior.** The script does no such validation: `scripts/launch-constrained-pi.sh:77` is `--grant) GRANTS+=("$2"); shift 2 ;;`, so under `set -euo pipefail` (`:61`) a trailing `--grant` with no `$2` aborts on the unbound-variable expansion with a nonzero status, not a deliberate exit-2 usage error. The pi-bound CLI adds the explicit exit-2 contract.

---

### 4. `pi install -l <meta-package>` runs on every launch, including resume

Grounding:

```bash
pi install -l "$META"
```

Source:

```text
scripts/launch-constrained-pi.sh:82
```

Script comments explicitly state preflight runs on every fresh or resumed launch:

```text
scripts/launch-constrained-pi.sh:39-56
```

Canonical port:

```ts
await runCommand("pi", ["install", "-l", metaPackageRoot], {
  cwd: targetCwd,
  stdio: "inherit"
});
```

This must run even when passthrough contains:

```text
--continue
-c
```

because the script re-derives the allowlist on every invocation.

---

### 5. Meta-package path resolution

Current script computes a repo-local path:

```bash
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
META="$REPO/packages/pi-project-workflows"
```

Source:

```text
scripts/launch-constrained-pi.sh:63-64
```

Canonical CLI port cannot depend on repo layout. It should resolve the installed package root:

```ts
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

export function resolvePackageRoot(pkg: string): string {
  return path.dirname(require.resolve(`${pkg}/package.json`));
}

const metaPackageRoot = resolvePackageRoot("@davidorex/pi-project-workflows");
```

Package grounding:

- `@davidorex/pi-project-workflows` declares pi extensions at:
  ```text
  packages/pi-project-workflows/package.json:25-30
  ```
- It declares dependencies on:
  ```text
  @davidorex/pi-context
  @davidorex/pi-workflows
  @davidorex/pi-behavior-monitors
  @davidorex/pi-agent-dispatch
  ```
  at:
  ```text
  packages/pi-project-workflows/package.json:35-40
  ```

`packages/pi-context-cli/package.json` currently declares:

```text
@davidorex/pi-context
typebox
```

Grounding:

```text
packages/pi-context-cli/package.json:35-37
```

To resolve the meta-package root from `pi-context-cli`, add:

```json
"@davidorex/pi-project-workflows": "^0.30.0"
```

to `packages/pi-context-cli/package.json`.

---

### 6. Static tool allowlist is derived from generated SKILL.md files

Current script:

```bash
TOOLS="$(grep -rhoE '<tool name="[a-z0-9-]+"' "$REPO"/packages/*/skills/*/SKILL.md \
  | sed -E 's/<tool name="//; s/"//' | sort -u | paste -sd, -)"
```

Source:

```text
scripts/launch-constrained-pi.sh:89-90
```

Current repo glob resolves to 8 skill files:

```text
packages/pi-agent-dispatch/skills/pi-agent-dispatch/SKILL.md
packages/pi-behavior-monitors/skills/pi-behavior-monitors/SKILL.md
packages/pi-context/skills/pi-context/SKILL.md
packages/pi-project-workflows/skills/pi-agent-dispatch/SKILL.md
packages/pi-project-workflows/skills/pi-behavior-monitors/SKILL.md
packages/pi-project-workflows/skills/pi-project-workflows/SKILL.md
packages/pi-project-workflows/skills/pi-workflows/SKILL.md
packages/pi-workflows/skills/pi-workflows/SKILL.md
```

Canonical port:

```ts
deriveSkillToolNames(skillRoots: string[]): string[]
```

Runtime skill roots:

```ts
[
  resolvePackageRoot("@davidorex/pi-context"),
  resolvePackageRoot("@davidorex/pi-project-workflows")
]
```

Reason:

- `pi-context` supplies its own generated skill.
- `pi-project-workflows` bundles the workflow, monitor, dispatch, and meta skills.

Rules:

- read `skills/*/SKILL.md`
- extract `<tool name="...">`
- dedupe
- sort
- return tool names

---

### 7. Empty static tool list is fatal

Grounding:

```bash
if [ -z "$TOOLS" ]; then
  echo "launch-constrained-pi: no tools derived ..."
  exit 1
fi
```

Source:

```text
scripts/launch-constrained-pi.sh:92-95
```

Canonical port:

```ts
if (staticTools.length === 0) {
  stderr.write("pi-context pi-bound: no tools derived ...\n");
  return 1;
}
```

---

### 8. Built-in read-only tools are always added

Grounding:

```bash
TOOLS="$TOOLS,read,ls,grep,find"
```

Source:

```text
scripts/launch-constrained-pi.sh:99
```

Canonical port:

```ts
const builtinReadonlyTools = ["read", "ls", "grep", "find"];
```

Always add these to the tool set.

---

### 9. Composite operations come from `config.tool_operations[]`

Current launch script behavior has two parts.

Helper:

```ts
const ctx = loadContext(args.cwd);
if (ctx.config === null) process.exit(4);
const ids = (ctx.config.tool_operations ?? []).map((op) => op.canonical_id);
```

Grounding:

```text
scripts/orchestrator/read-config-operations.ts:60-67
```

Launch-script failure fold:

```bash
COMPOSITES_JSON="$(cd "$REPO" && npx tsx "$REPO/scripts/orchestrator/read-config-operations.ts" --cwd "$TARGET_CWD" --format json 2>/dev/null || echo '[]')"
```

Grounding:

```text
scripts/launch-constrained-pi.sh:104
```

Important correction: the helper itself exits `4` on absent config; the script’s `|| echo '[]'` turns that into empty composites.

Deliberate change — in-process replacement of a two-process pipeline, not a behavior-preserving port: the script's composite path is two shell stages — the tsx helper emits a JSON array (`scripts/launch-constrained-pi.sh:104`), then a `python3` one-liner converts that JSON to a CSV string (`scripts/launch-constrained-pi.sh:105-109`). The canonical port collapses both stages into a single in-process `loadContext(cwd)` call returning `string[]` (CSV joining happens later in `composePiBoundTools`), eliminating both subprocesses. Functionally equivalent; provenance is replacement, not preservation.

Canonical port should fold the combined behavior directly:

```ts
export function readCompositeOperationIds(cwd: string): string[] {
  try {
    const ctx = loadContext(cwd);
    if (ctx.config === null) return [];
    return (ctx.config.tool_operations ?? []).map((op) => op.canonical_id);
  } catch {
    return [];
  }
}
```

---

### 10. `--grant` scopes composites

Grounding:

```bash
if [ ${#GRANTS[@]} -gt 0 ]; then
  SELECTED="$(printf '%s\n' "${GRANTS[@]}" | tr '\n' ',' | sed 's/,$//')"
  COMPOSITES="$SELECTED"
fi
```

Source:

```text
scripts/launch-constrained-pi.sh:111-115
```

Canonical port:

```ts
const selectedComposites = grants.length > 0 ? grants : declaredComposites;
```

Rules:

- no `--grant`: expose all declared composite ids
- one or more `--grant`: expose only those ids

---

### 11. Skill-count warning is preserved

Grounding:

```bash
SKILL_COUNT="$(ls "$REPO"/packages/*/skills/*/SKILL.md 2>/dev/null | wc -l | tr -d ' ')"
if [ "$SKILL_COUNT" -lt 4 ]; then
  echo "launch-constrained-pi: WARNING — only $SKILL_COUNT SKILL.md files found ..."
fi
```

Source:

```text
scripts/launch-constrained-pi.sh:122-125
```

Canonical port:

```ts
if (skillFileCount < 4) {
  stderr.write("pi-context pi-bound: WARNING — only ... SKILL.md files found ...\n");
}
```

Current repo has 8 matching files, but the preserved invariant is the script’s `<4` warning threshold.

---

### 12. Launch command and exit behavior

Current script uses Unix `exec`:

```bash
exec pi --tools "$TOOLS" "${ARGS[@]+"${ARGS[@]}"}"
```

Source:

```text
scripts/launch-constrained-pi.sh:127
```

Canonical Node port cannot literally preserve shell `exec` with standard Node APIs. The port preserves:

- command invoked
- args passed
- inherited stdio
- exit code

Canonical implementation:

```ts
const child = spawn("pi", ["--tools", toolsCsv, ...passthrough], {
  cwd: targetCwd,
  stdio: "inherit"
});

return await childExitCode(child);
```

This is an intentional implementation difference from shell `exec`, not identical process replacement.

---

## CLI integration point

`pi-context` currently enters here:

```ts
export async function main(argv: string[]): Promise<number>
```

Grounding:

```text
packages/pi-context-cli/src/cli.ts:435
```

Current first-token flow:

- help:
  ```text
  packages/pi-context-cli/src/cli.ts:438-441
  ```
- op resolution:
  ```text
  packages/pi-context-cli/src/cli.ts:443
  ```
- undefined-op handling is a two-armed conditional, both arms returning exit `2`:
  ```text
  packages/pi-context-cli/src/cli.ts:444-450
  ```
  `:444` `if (op === undefined)`; `:445-446` `isProcessOnlyOp(first)` branch (process-only-op message); `:447-449` `else` (unknown-command message); `:450` `return 2;` for both arms. The `pi-bound` bare-verb branch inserted before op resolution does not collide with either arm.

Route the `pi-bound` bare verb before existing help/op resolution:

```ts
export async function main(argv: string[]): Promise<number> {
  const first = argv[0];

  if (first === "pi-bound") {
    return runPiBound(argv.slice(1));
  }

  // existing help/op flow unchanged
}
```

---

## Implementation files

### `packages/pi-context-cli/src/cli.ts`

Changes:

- import `runPiBound`
- branch on `first === "pi-bound"` before help/op resolution

Grounding:

```text
packages/pi-context-cli/src/cli.ts:435-443
```

---

### `packages/pi-context-cli/src/pi-bound.ts`

New module.

Exports:

```ts
parsePiBoundArgs
resolvePackageRoot
deriveSkillToolNames
readCompositeOperationIds
composePiBoundTools
runPiBound
```

This file is built because `tsconfig.build.json` includes:

```json
"include": ["src/**/*.ts"]
```

Grounding:

```text
packages/pi-context-cli/tsconfig.build.json:7
```

---

### `packages/pi-context-cli/src/pi-bound.test.ts`

New test file.

It is included by the package test script:

```json
"test": "tsx --test src/*.test.ts"
```

Grounding:

```text
packages/pi-context-cli/package.json:33
```

---

### `packages/pi-context-cli/package.json`

Add dependency:

```json
"@davidorex/pi-project-workflows": "^0.30.0"
```

Current dependency block is grounded at:

```text
packages/pi-context-cli/package.json:35-37
```

---

## Required helper contracts

### `parsePiBoundArgs`

```ts
parsePiBoundArgs(argv: string[]): {
  grants: string[];
  passthrough: string[];
}
```

Preserves:

```text
scripts/launch-constrained-pi.sh:73-80
```

---

### `resolvePackageRoot`

```ts
resolvePackageRoot(pkg: string): string
```

Implementation:

```ts
path.dirname(require.resolve(`${pkg}/package.json`))
```

Used for:

- `@davidorex/pi-project-workflows`
- `@davidorex/pi-context`

---

### `deriveSkillToolNames`

```ts
deriveSkillToolNames(packageRoots: string[]): {
  tools: string[];
  skillFileCount: number;
}
```

Preserves:

```text
scripts/launch-constrained-pi.sh:89-95
scripts/launch-constrained-pi.sh:122-125
```

---

### `readCompositeOperationIds`

```ts
readCompositeOperationIds(cwd: string): string[]
```

Preserves combined behavior from:

```text
scripts/orchestrator/read-config-operations.ts:60-67
scripts/launch-constrained-pi.sh:104
```

---

### `composePiBoundTools`

```ts
composePiBoundTools(input: {
  staticTools: string[];
  declaredComposites: string[];
  grants: string[];
}): string[]
```

Rules:

```ts
[
  ...staticTools,
  "read",
  "ls",
  "grep",
  "find",
  ...(grants.length > 0 ? grants : declaredComposites)
]
```

Then dedupe and sort/stabilize.

Preserves:

```text
scripts/launch-constrained-pi.sh:99
scripts/launch-constrained-pi.sh:111-119
```

---

### `runPiBound`

```ts
runPiBound(argv: string[], deps?: {
  cwd?: string;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
  spawn?: typeof spawn;
}): Promise<number>
```

Sequence:

1. target cwd = `deps.cwd ?? process.cwd()`
2. parse `--grant`
3. warn if `<targetCwd>/.pi-context.json` absent
4. resolve meta package root
5. run `pi install -l <metaPackageRoot>` with `cwd: targetCwd`
6. derive static tools from package skill roots
7. fail if static tool set is empty
8. warn if skill file count `<4`
9. read declared composites from active substrate config
10. compose tool CSV
11. spawn `pi --tools <csv> ...passthrough` with `cwd: targetCwd`
12. return child exit code

Resume invariant:

- Steps 3-10 run every time, even if passthrough contains `--continue` or `-c`.

---

## Tests

1. `parsePiBoundArgs` removes repeated `--grant` and preserves passthrough.
2. `parsePiBoundArgs` rejects missing `--grant` value with usage exit `2`.
3. `deriveSkillToolNames` extracts `<tool name="...">`.
4. `deriveSkillToolNames` dedupes repeated tool tags.
5. Empty derived static tool set returns fatal code `1`.
6. `readCompositeOperationIds` returns `config.tool_operations[].canonical_id`.
7. `readCompositeOperationIds` returns `[]` when config is absent or unreadable, matching helper-plus-shell fallback behavior.
8. `composePiBoundTools` always includes `read`, `ls`, `grep`, `find`.
9. `composePiBoundTools` includes all declared composites when grants are empty.
10. `composePiBoundTools` includes only grants when grants are present.
11. `runPiBound` invokes `pi install -l <metaPackageRoot>` before launching `pi`.
12. `runPiBound` runs install/tool derivation even when passthrough contains `--continue`.
13. `runPiBound` launches `pi --tools <csv> ...passthrough`.
14. `main(["pi-bound", ...])` routes before op resolution.
15. Existing undefined-op behavior remains exit `2` for both arms — unknown command and process-only op (`cli.ts:444-450`).

---

## Non-goals

- Do not add `pi-bound` to the pi-context op registry.
  - CLI ops are reflected from:
    ```ts
    ops.filter((o) => o.surface === "use")
    ```
    grounded at:
    ```text
    packages/pi-context-cli/src/cli.ts:44
    ```

- Do not call `scripts/orchestrator/read-config-operations.ts`.
  - Its logic is folded directly through `loadContext(cwd)` plus the script’s `|| echo '[]'` fallback semantics.

- Do not preserve shell `exec` identity.
  - Preserve command, args, terminal attachment, and exit code via Node `spawn`.

- Do not use shell pipelines for tool extraction.