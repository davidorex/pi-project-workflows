# pi-context CLI + `update` release-readiness audit (2026-06-07)

Standard: the monorepo is **best-of-breed with a superior user experience**, period. This audit enumerates the complete set of work to reach that bar for the `pi-context` CLI surface and the shipping `update` feature. Priorities order the *sequence*; nothing here is acceptable to ship against. Grounded by running the global `pi-context` (`/opt/homebrew/bin/pi-context` → published `@davidorex/pi-context-cli/dist/bin.js`, `0.30.0`) and reading the source at branch `context-jit-spec-v2`.

## Grounded runtime surface (real output + exit codes)

| Probe | Result | Exit |
|---|---|---|
| `pi-context --help` / no-args | flat list, one line per op rendering the **full multi-sentence `op.description`** (`deriveTopHelp` cli.ts:407-423; the `.split("\n")[0]` is inert — descriptions are newline-free), no grouping/sort, `promptSnippet` unused; **`pi-bound` absent** | 0 |
| `pi-context --version` / `-v` | **no version command** — falls through to `resolveOp` → `unknown command: --version` + help dump | 2 |
| `pi-context -h` | works | 0 |
| `pi-context <op> --help` | correct (description + per-field flags + types) | 0 |
| `find-references --id X` | `error: unknown flag: --id` (op declares `--itemId`) | 2 |
| `update --dry-run` | `error: unknown flag: --dry-run` (only `--dryRun` works) | 2 |
| bad append (validation) | `error: Validation failed …: /gaps/62: must have required property 'package'` — **raw AJV instancePath** | 1 |
| unknown op / missing flag / bad block | clean `error: <message>` (no stack trace) | 2 / 1 |

Error UX never leaks a stack trace; exit codes are coarse (success 0, usage 2, runtime/validation 1).

## CLI surface — the work to best-of-breed

The reflecting CLI is both the dogfooding surface and the new-user entry point. Every item below degrades that surface; all are tracked.

- **FGAP-062** — `--help` top-level listing is an unscannable paragraph dump (full `op.description` per line, no grouping/sort, `promptSnippet` unused), and `pi-bound` is structurally undiscoverable (a process-mode branch outside the registry, cli.ts:445). Data-driven fix in `deriveTopHelp` from existing `OpDefinition` fields: source `promptSnippet`, group by name-prefix, add a process-modes section.
- **FGAP-064** *(new)* — no kebab-case flag normalization: camelCase op-schema keys are surfaced as flags verbatim, so conventional `--dry-run`/`--id` fail. The headline `update --dry-run` is rejected (only `--dryRun`), though every spec/doc writes `--dry-run`. Fix: a kebab→camel normalization/alias layer in `parseOpArgs` (cli.ts:184-233).
- **FGAP-032** — the id-flag-specific instance of the same root: `--id` vs `--itemId`/`--parentId`/`--taskId`/`--unitId` diverge across id-taking ops; `find-references --id` mis-fires. Resolve as one flag-normalization layer with FGAP-064.
- **FGAP-023** — validation failures surface raw AJV instancePath strings rather than field-named guidance (cli.ts:537-542); the highest-traffic write footgun. Fix: translate AJV `.errors[]` into field-named messages in the catch.
- **FGAP-063** *(new)* — no `--version`/`-v` command; a globally-installed CLI cannot report its own version. Fix: a `--version` branch in `main()` printing the package version.
- **FGAP-026** — exit codes coarse (0/1/2) vs the op-twin scripts' 1–5 diagnostic granularity; CI/scripted consumers cannot branch on error class. Fix: map error classes to codes at the catch + UsageError sites.
- **FGAP-021** — no human render mode (`--format` table/terse / `--raw`); 15+ op-twin scripts provide it, the CLI gives only the `--json` envelope or terse op text. Fix: a CLI render layer + `--format` global.
- **FGAP-022** — no `--show-schema` contract preview before a block write (array_key + required fields + types + id-pattern), which the script provides. Fix: a `--show-schema` early branch.
- **FGAP-024** — `append-block-item` has no dry-run (the script and `upsert-block-item` do); no preview of the highest-traffic write. Fix: a CLI pre-call prospective-validation branch.
- **FGAP-025** — no input shorthands (`--writer kind:id`, `--where field:op:value`, CSV `--op in`) the scripts accept; CLI calls are more verbose/error-prone for the same ops. Fix: pre-call normalization in `parseOpArgs`.

The parity arc grounding is `analysis/2026-06-05-cli-ops-scripts-parity-survey.md` (GAP-3..8 → FGAP-021..026); FGAP-032/062/063/064 are the help/flag/version surface.

## `update` feature — completeness to its own guarantee (FEAT-006)

FEAT-006 advertises *"every mutation enumerated"* and *"config registries propagated/untouched."* The shipped `update --dryRun --json` result carries **schema-action buckets only** (`resynced/migrated/blocked/refused/merged/conflicts/reported/inSync`) — structurally incapable of the rest. Until these land, `update` does two of its three advertised jobs:

- **TASK-038 / FGAP-060** — config-registry additions (new catalog `relation_types`/`invariants`/`block_kinds`/`lenses`) are not propagated to an existing substrate and not reportable. Existing users never receive new catalog vocabulary on update.
- **TASK-039 / FGAP-050 + FGAP-051** — migration-declaration registrations into `migrations.json` and block-starter writes are not enumerated (no output field), and the unchanged-empty-block rewrite is unguarded.

FEAT-006 stays `in-progress` and `update` must not be presented as fulfilling its guarantee until both land. The schema-merge half (TASK-034..037) is built and verified.

## Record corrections made by this audit
- **FGAP-031** (invoke as `pi-context`, not `node bin.js`) → **closed**: the global command is on PATH (published bin) and docs/dogfooding switched to it (TASK-028/VER-017); the load-bearing asks are met.
- **FGAP-063** (no `--version`) and **FGAP-064** (flag normalization) → **filed** (this audit is their grounding).

## Adjacent (governance arc, not CLI/update)
**TASK-033 / FEAT-007** ships the convention-articulation governance vocabulary to the samples catalog (warning severity for fresh substrates). Gated behind FEAT-006; release-held.
