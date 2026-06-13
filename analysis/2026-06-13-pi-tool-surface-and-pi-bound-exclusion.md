# pi tool surface + how `pi-bound` bounds/excludes it

Scope: the full tool surface a pi (sub)agent sees, and the mechanism by which `pi-context pi-bound` narrows that surface. File:line evidence throughout. "not in this repo" marks anything that is pi-runtime-internal and not determinable from this codebase.

---

## Q1 — the `pi-bound` process mode

`pi-bound` is **not** a substrate op reflected from the op-registry. It is a CLI **process mode**: a bare verb branch in the `pi-context-cli` `main()`, implemented in `packages/pi-context-cli/src/pi-bound.ts`.

- Verb dispatch: `packages/pi-context-cli/src/cli.ts:963-965` — `if (first === "pi-bound") return runPiBound(argv.slice(1));`. It is intercepted before `resolveOp`, so it never goes through the op table.
- Help surfacing (static, not registry-driven): `packages/pi-context-cli/src/cli.ts:889-890` — the line `pi-bound — Launch an embedded pi agent in-process on a bounded tool surface` is hand-added under a static "Process modes" section (comment at `cli.ts:744`, `cli.ts:869`).
- Entry point + parameters: `packages/pi-context-cli/src/pi-bound.ts:202-310` (`runPiBound(argv, deps?)`).

Parameters / flags that bound the surface:
- `--grant <canonical_id>` (repeatable) — the only `pi-bound`-specific flag. Parsed/consumed at `pi-bound.ts:60-80` (`parsePiBoundArgs`); everything else is passthrough forwarded verbatim to `pi`. A trailing `--grant` with no value is a usage error, exit 2 (`pi-bound.ts:45-51`, `:70-72`).
- All other tokens (e.g. `-c` / `--continue`, `--model`, `--no-skills`, any pi flag) are passthrough — `pi-bound.ts:76-77` pushes them to `passthrough[]`, spawned at `pi-bound.ts:305`.

"Bounded tool surface" mechanically: `pi-bound` does **not** construct an in-process tool registry itself. It composes a tool-name allowlist string and launches a real `pi` child process with `pi --tools <csv> ...passthrough` (`pi-bound.ts:305`, `runCommand("pi", ["--tools", toolsCsv, ...passthrough], targetCwd, ...)`). The bounding is delegated to pi's own `--tools` allowlist. Despite the help string saying "in-process," the launch is a child `pi` subprocess with inherited stdio (`runCommand` at `pi-bound.ts:177-183`, `spawnFn(command, args, { cwd, stdio: "inherit" })`).

Launch sequence (every invocation, including resumes) — `pi-bound.ts:188-310`:
1. target cwd = `deps.cwd ?? process.cwd()` (`:219`)
2. parse `--grant` (`:226`)
3. warn if `<cwd>/.pi-context.json` absent (`:235-239`)
4. resolve meta-package `@davidorex/pi-project-workflows` root (`:244-252`)
5. `pi install -l <metaRoot>` in target cwd; non-zero exit aborts before launch (`:258-271`)
6. derive static tools from each skill package's `skills/*/SKILL.md` (`:273-282`)
7. fatal exit 1 if static set empty (`:284-289`)
8. warn if SKILL.md file count < 4 (`:291-295`)
9. read declared composites from active substrate config (`:297`)
10. compose CSV (`:298-299`)
11. spawn `pi --tools <csv> ...passthrough` (`:304-309`)

This is an in-process TypeScript port of `scripts/launch-constrained-pi.sh` (header `pi-bound.ts:2-22`; the shell original is preserved at `scripts/launch-constrained-pi.sh`, `exec pi --tools "$TOOLS" ...` at `:127`).

---

## Q2 — the exclusion mechanism

`pi-bound` excludes tools by **default-deny via an explicit allowlist** passed to `pi --tools`. Pi receives a comma-separated list of permitted tool names; anything not in that list is unavailable to the launched agent. There is no denylist and no "all minus X" form — the surface is the positive union of three sources, composed in `composePiBoundTools` (`pi-bound.ts:161-170`):

```
selectedComposites = grants.length > 0 ? grants : declaredComposites
all = [...staticTools, ...BUILTIN_READONLY_TOOLS, ...selectedComposites]
return [...new Set(all)].sort()
```

The three contributing sets:

1. **`staticTools`** — every `<tool name="...">` parsed from `skills/<name>/SKILL.md` under the two skill packages (`SKILL_PACKAGES = ["@davidorex/pi-context", "@davidorex/pi-project-workflows"]`, `pi-bound.ts:38`; extraction regex `/<tool\s+name="([a-z0-9-]+)"/g` at `:107`, in `deriveSkillToolNames` `:103-131`). This is the extension-registered tool surface (the pi-context ops + pi-workflows + monitors + dispatch tools, whichever the generated SKILL.md files declare).
2. **`BUILTIN_READONLY_TOOLS = ["read", "ls", "grep", "find"]`** (`pi-bound.ts:32`) — always added unconditionally. These are pi's built-in read-only file-system tools (Bucket-1 default-grant per the shell-script header `launch-constrained-pi.sh:97-99`).
3. **composites** — the active substrate's `config.tool_operations[].canonical_id` (`readCompositeOperationIds` `pi-bound.ts:142-152`, returns `[]` when no config/pointer). Bounded composites are the config-declared vocabulary.

How a caller narrows the surface: **`--grant <id>` (repeatable)**. When ≥1 grant is present, the composite set is replaced by exactly the granted ids (`composePiBoundTools` `:167`, `grants.length > 0 ? grants : declaredComposites`). `--grant` scopes ONLY the composite portion — it does not narrow `staticTools` or `BUILTIN_READONLY_TOOLS`, which are always present. Default (no `--grant`) = all declared composites.

This is a **distinct mechanism from the pi-jit-agents grant-clamp**. `pi-bound` does NOT reuse `executeAgent`'s clamp. The pi-jit-agents clamp (`packages/pi-jit-agents/src/jit-runtime.ts:483-491`, `GrantViolationError` `:73-83`, `computeGrantViolation` `:90-95`) enforces *child ⊆ parent* subset at the in-process `executeAgent` dispatch boundary (DEC-0047), throwing before any LLM call. `pi-bound` instead hands a flat allowlist to a `pi --tools` child process; there is no parent/child subset relation and no `GrantViolationError` path. They are independent surface-bounding layers.

---

## Q3 — the full pi tool surface

Two categories: pi BUILT-IN tools (pi-runtime-internal) and EXTENSION-registered tools (this repo).

### (1) pi built-in tools — pi-internal, NOT in this repo

The pi built-in tool registry is **not in this repo** — there is no source defining `read`/`write`/`edit`/`bash` here. They are referenced by name only:
- read-only set granted by `pi-bound`: `read`, `ls`, `grep`, `find` (`pi-bound.ts:32`).
- broader built-ins named in dispatch/auth code: `bash`, `read`, `edit`, `write`, `grep`, `find`, `ls` (`packages/pi-agent-dispatch/src/auth-gate.ts:35` "built-ins bash/read/edit/write/grep/find/ls"; `FORBIDDEN_WHOLESALE_OPERATIONS = ["bash", "write", "edit", "shell", "execute"]` at `packages/pi-agent-dispatch/src/operation-vocab.ts:25`).
- The auth-gate passes built-ins through un-gated (`auth-gate.test.ts:190-192`, "returns void without invoking confirm for SDK built-in (bash)").

Determinable referenced built-ins: `read`, `write`, `edit`, `bash`, `grep`, `find`, `ls`, `shell`, `execute`. The authoritative complete pi built-in registry is pi-internal — not enumerable from this repo. `list-tools` (Q5) is the runtime way to enumerate it.

### (2) extension-registered tools — in this repo, via `pi.registerTool`

The four registered extensions and their tool counts/names:

**pi-context** — registered from the op-registry `ops[]` (`packages/pi-context/src/ops-registry.ts`). 58 ops total; partitioned by a `surface` field (declared at `ops-registry.ts:233`, `surface: "use" | "process"`):
- **57 `surface: "use"`** (agent-callable) — these are the CLI-reflected ops. Canonical names (`ops-registry.ts`): `append-block-item`, `update-block-item`, `append-relation`, `remove-relation`, `replace-relation`, `append-relations`, `upsert-block-item`, `promote-item`, `append-block-nested-item`, `update-block-nested-item`, `remove-block-item`, `remove-block-nested-item`, `read-block-dir`, `read-block`, `write-block`, `context-status`, `context-check-status`, `context-validate`, `read-config`, `read-samples-catalog`, `read-catalog-schema`, `context-current-state`, `context-bootstrap-state`, `rename-canonical-id`, `amend-config`, `read-schema`, `write-schema`, `resolve-conflict`, `resolve-blocked`, `write-schema-migration`, `context-init`, `context-accept-all`, `context-install`, `update`, `validate-block-items`, `context-switch`, `context-list`, `context-archive`, `filter-block-items`, `resolve-item-by-id`, `read-block-item`, `read-block-page`, `join-blocks`, `resolve-items-by-id`, `complete-task`, `context-validate-relations`, `context-edges-for-lens`, `context-lens-view`, `context-walk-descendants`, `walk-ancestors`, `find-references`, `gather-execution-context`, `context-roadmap-load`, `context-roadmap-render`, `context-roadmap-validate`, `context-roadmap-list` (+ the `append-block-item` family).
- **1 `surface: "process"`** — `list-tools` (`ops-registry.ts:1034`, `surface: "process"` at `:1050`). It closes over the pi-runtime `boundPi` introspection handle (`ops-registry.ts:2312` `let boundPi`, bound at `:2350`) and throws for any out-of-pi caller (`:1056-1058`). The CLI partitions on `surface === "use"` (`cli.ts:53` `useOps = ops.filter((o) => o.surface === "use")`), so `list-tools` is the one op the CLI never reflects (`isProcessOnlyOp` `cli.ts:150-151`, error at `cli.ts:969-970`).

**pi-workflows** — 9 tools (`packages/pi-workflows/src/index.ts`): `workflow-execute` (`:495`), `workflow-resume` (`:575`), `workflow-list` (`:652`), `workflow-agents` (`:686`), `workflow-validate` (`:748`), `workflow-status` (`:782`), `workflow-init` (`:810`), `render-item-by-id` (`:838`), `enforce-budget` (`:871`).

**pi-agent-dispatch** — 6 tools (`packages/pi-agent-dispatch/src/index.ts:45-50`): `author-agent-spec`, `call-agent`, `run-real-checks`, `commit-attested`, `author-tool-grant`, `run-work-order-loop` (per-file `name:` at `author-agent-spec-tool.ts:19`, `call-agent-tool.ts:38`, `run-real-checks-tool.ts:27`, `commit-attested-tool.ts:14`, `author-tool-grant-tool.ts:27`, `run-work-order-loop-tool.ts:22`). Plus dynamically-registered composite tools loaded from config (`composite-loader.ts:192`).

**pi-behavior-monitors** — 5 tools (`packages/pi-behavior-monitors/index.ts`): `monitors-status` (`:1976`), `monitors-inspect` (`:2008`), `monitors-control` (`:2064`), `monitors-rules` (`:2123`), `monitors-patterns` (`:2204`).

`pi-jit-agents` registers no tools (library only — consumed by the other packages; per `launch-constrained-pi.sh:4-5`).

**`surface: "use"` vs `surface: "process"`**: `use` = agent-callable + CLI-reflected (the data-driven partition at `cli.ts:53`); `process` = lifecycle/dispatch ops that need the pi runtime handle and are excluded from the CLI surface (comment block `ops-registry.ts:104-108`, `:1044-1049`). Only `list-tools` is `process` today.

---

## Q4 — how `--tools` / `--no-skills` / `--model` flow into the bound surface

Two separate surface-bounding paths exist; they are **distinct mechanisms** that converge on the same pi `--tools` allowlist primitive.

- **`pi -p "..." --mode json --tools read --no-skills --model ...`** (CLAUDE.md "CLI Access from Other Agents") — these flags go *directly* to a `pi` subprocess the caller spawns. `--tools` IS pi's allowlist primitive; `--no-skills` and `--model` are pi flags the caller controls directly. This path does not involve `pi-context pi-bound` at all.

- **`pi-context pi-bound [--grant <id>]... [...pi-args]`** — composes the allowlist for you (the static SKILL union + read-only built-ins + composites/grants) and then spawns `pi --tools <composed-csv> ...passthrough` (`pi-bound.ts:305`). Any `--model`, `--no-skills`, `--mode`, `-c` etc. you pass to `pi-bound` are NOT `pi-bound` parameters — they fall into `passthrough[]` (`pi-bound.ts:76-77`) and are forwarded verbatim to the same `pi` child. So `pi-context pi-bound --no-skills --model X` reaches pi as `pi --tools <composed> --no-skills --model X`.

Reconciliation: both paths bound the surface through the **same** pi `--tools` allowlist mechanism. The difference is who composes the list — `pi -p --tools X` is hand-specified by the caller; `pi-bound` derives it (SKILL union + read-only built-ins + composites, `--grant`-scoped). `--no-skills` and `--model` are orthogonal pi flags that pass through `pi-bound` unchanged; `pi-bound` does not set them. The bounded surface IS `pi --tools`; `pi-bound` is a composer + launcher over it, not a separate runtime gate.

(Note: the launched pi child also still sees the pi-agent-dispatch auth-gate — Q5 — which gates *execution* of sensitive tools even when they are in the `--tools` allowlist.)

---

## Q5 — default surface + verifying exclusion

**Default surface (no `--grant`):** `pi-bound` is never "full pi surface." Even with zero flags the launched agent is bounded to: every `<tool name>` declared across the two skill packages' SKILL.md files ∪ `read,ls,grep,find` ∪ all declared `config.tool_operations[]` composites (`composePiBoundTools` `:161-170`). A tool that is neither in a SKILL.md, nor one of the four read-only built-ins, nor a declared composite, is **excluded** — e.g. pi's built-in `write`/`edit`/`bash` are NOT in `BUILTIN_READONLY_TOOLS` and are not SKILL-declared, so they are absent from the allowlist unless surfaced as a composite. `--grant X` further narrows ONLY the composite portion to the named ids; the static + read-only portions are unconditional.

**Second exclusion layer (execution-time gate):** even tools *in* the allowlist can be blocked at call time by the pi-agent-dispatch auth-gate. `AUTH_REQUIRED_TOOLS` (`auth-gate.ts:91-96`) is the union of each package's owned `gatedTools` set (pi-context's is derived from the op-registry `authGated` flags, `auth-gate.ts:51`/`:74-75`). The handler (`authGateHandler` `auth-gate.ts:148-161`) blocks a gated tool unconditionally when `ctx.hasUI === false` (non-interactive: `block: true`, `:156-160`) and otherwise requires an affirmative `ctx.ui.confirm`. Built-ins pass through un-gated (`:152-153`; test `auth-gate.test.ts:190-192`). So in a non-interactive `pi-bound` (or `pi -p`) session, gated tools are effectively excluded from use even if allowlisted.

**Tests exercising the surface bounding** (`packages/pi-context-cli/src/pi-bound.test.ts`):
- `parsePiBoundArgs` consumes `--grant`, preserves passthrough (`:80`); rejects missing `--grant` value with exit 2 (`:95`).
- `deriveSkillToolNames` extracts `<tool name>` (`:116`); dedupes (`:130`).
- `composePiBoundTools` always includes `read,ls,grep,find` (`:207`); includes all declared composites when grants empty (`:215`); includes ONLY grants when grants present (`:227`).
- empty-static-tools fatal: install ran but no `pi --tools` launch happened (`:159-161`).

**How an operator confirms a tool is excluded:**
1. Launch `pi-context pi-bound [--grant ...]`, then from inside the session call the `list-tools` op (the `surface: "process"` introspection op, `ops-registry.ts:1034-1096`) — it returns the agent's *active* tool set (`getActiveTools`) vs all loaded (`getAllTools`), so a tool absent from the active set is confirmed excluded.
2. Or inspect the composed allowlist directly: run `composePiBoundTools`/`deriveSkillToolNames` (exported for exactly this, `pi-bound.ts:20-21`) and check membership; the `--tools <csv>` string passed to `pi` is the authoritative allowlist.
3. For execution-gating: a gated tool present in the allowlist but called in a non-interactive context returns `{ block: true, reason: "...ctx.hasUI=false" }` (`auth-gate.ts:156-160`).

---

## Tool surface → exclusion table

| Category | Canonical names | In `pi-bound` default? | How `pi-bound` excludes |
|---|---|---|---|
| pi built-in read-only | `read`, `ls`, `grep`, `find` | YES (always) | Cannot be excluded — unconditional `BUILTIN_READONLY_TOOLS` (`pi-bound.ts:32`,`:168`) |
| pi built-in mutating | `write`, `edit`, `bash` (+`shell`/`execute` referenced) | NO | Excluded by omission — not in allowlist unless surfaced as a composite |
| pi-context ops (`surface:"use"`) | 57 ops (append/update/read/relation/schema/lens/roadmap/context-*) | YES if SKILL-declared | Whole-package presence via SKILL.md union; individual ops not `--grant`-scopable (grant scopes only composites) |
| pi-context `list-tools` (`surface:"process"`) | `list-tools` | runtime-only | Never CLI-reflected; available inside pi via the runtime handle |
| pi-workflows | `workflow-execute/resume/list/agents/validate/status/init`, `render-item-by-id`, `enforce-budget` | YES if SKILL-declared | Package presence via SKILL.md union |
| pi-agent-dispatch | `author-agent-spec`, `call-agent`, `run-real-checks`, `commit-attested`, `author-tool-grant`, `run-work-order-loop` (+ dynamic composites) | YES if SKILL-declared | Package presence via SKILL.md union |
| pi-behavior-monitors | `monitors-status/inspect/control/rules/patterns` | YES if SKILL-declared | Package presence via SKILL.md union |
| config-declared composites | `config.tool_operations[].canonical_id` | YES (all declared) | `--grant <id>` narrows to the named subset; omit a composite from grants to exclude it |
| Bucket-2 gated tools (subset of above) | `AUTH_REQUIRED_TOOLS` (per-package `authGated`/`gatedTools` union) | allowlisted, but execution-gated | Blocked at call time when `ctx.hasUI=false`; confirm-prompted when interactive |

---

## How to bound the surface (usage recipe)

```bash
# Full composed bounded surface (SKILL tools ∪ read-only built-ins ∪ ALL declared composites):
pi-context pi-bound

# Narrow the composite portion to one declared tool_operation (static + read-only still present):
pi-context pi-bound --grant grep-paths

# Multiple composites:
pi-context pi-bound --grant grep-paths --grant git-log-recent

# Resume the prior session — allowlist is re-derived + re-passed every launch (pi does not persist --tools):
pi-context pi-bound -c

# Pass any other pi flag through (forwarded verbatim to the launched pi child):
pi-context pi-bound --grant grep-paths --model openrouter/anthropic/claude-haiku-4.5 --no-skills
```

Bounding levers, exact:
- `--grant <canonical_id>` (repeatable) — the ONLY `pi-bound`-level lever; scopes the composite set only (`pi-bound.ts:60-80`, applied at `composePiBoundTools` `:167`).
- Everything else (`--model`, `--no-skills`, `--mode`, `-c`) is pi-passthrough (`pi-bound.ts:76-77`, `:305`), not a `pi-bound` parameter.
- Static SKILL-derived tools + `read,ls,grep,find` are unconditional — not removable via `pi-bound` flags.

To bound WITHOUT `pi-bound` (hand-specified allowlist), spawn pi directly: `pi -p "..." --mode json --tools read --no-skills --model <fast>` — same `--tools` primitive, list authored by the caller.

---

## Not determinable from this repo

- The authoritative complete pi built-in tool registry (all built-in tool names + their schemas). Only the names *referenced* in this repo are knowable: `read`, `write`, `edit`, `bash`, `grep`, `find`, `ls`, `shell`, `execute`. Enumerate the live set at runtime via the `list-tools` op (`getAllTools`/`getActiveTools`).
- The semantics of pi's `--tools` flag itself (exact match rules, prefix/glob support, how an unlisted tool is hidden vs refused) — pi-runtime-internal; `pi-bound` only constructs and passes the CSV.
- Whether `--no-skills` interacts with the SKILL-derived static-tool composition inside pi after launch — `pi-bound` derives static tools from SKILL.md files on disk (`deriveSkillToolNames`), independent of the runtime `--no-skills` flag it forwards; the interaction is pi-internal.
