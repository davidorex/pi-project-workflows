# pi CLI command-surface conventions → a heuristic for bare-subcommand vs flag

Date: 2026-06-07
Branch: context-jit-spec-v2
Mode: read-only audit (no source/config edits, no installs, no substrate writes, no git/npm mutation)

## Scope

Audit the canonical `pi` CLI's command-surface conventions and derive a principled rule that predicts, from the *nature of a capability*, whether pi makes it a **bare subcommand** (`pi update`), a **positional arg on a subcommand** (`pi update pi`), a **flag on a subcommand** (`pi update --self`), or a **top-level flag** (`pi --export`). Then apply that rule to pi-context's own surface — the existing reflected ops, the planned `pi-context --pi-bound` (DEC-0014 / FEAT-005), and the planned `pi-context update` (FEAT-006) — and resolve the user's tension: `pi-context update` (bare verb) vs `pi-context --pi-bound` (currently a flag), specifically whether `--pi-bound` should be re-cast as bare `pi-context pi-bound`.

Sources (all evidence grounded here):
- Installed pi: `which pi` → `/opt/homebrew/bin/pi` → realpath `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js` (v0.75.4).
- pi dispatch: `dist/main.js:322-381`, `dist/package-manager-cli.js` (full file), `pi --help`, `pi <sub> --help`.
- pi-context CLI: `packages/pi-context-cli/src/cli.ts` (reflection dispatch at `:435-520`, surface partition `:44`), `pi-context --help`.
- Substrate (`.context`, the active pointer per `.pi-context.json`): DEC-0014, FEAT-006.
- Prior specs: `analysis/2026-06-07-pi-context-pi-bound-cli.md`, `analysis/2026-06-07-pi-context-global-install-pattern.md`.

---

## 1. pi's complete command-surface enumeration

pi's `main()` dispatches in a fixed order (`dist/main.js:332-358`): **(1)** `handlePackageCommand(args)` — claims the argv iff `args[0]` ∈ {install, remove, uninstall, update, list} (`package-manager-cli.js:109-120`); **(2)** `handleConfigCommand(args)` — claims iff `args[0] === "config"` (`:341`); **(3)** otherwise `parseArgs(args)` — the default agent run-mode, where everything is `[@files…] [messages…]` plus `--flags`. So pi has exactly **two namespaces**: a small fixed set of **bare verbs consumed before the default mode** (the package/config commands), and the **flag space of the default mode** (everything else). There is no third registry; a capability is either a pre-dispatch bare verb or a flag.

| Command / token | Form | Kind of capability | Evidence |
|---|---|---|---|
| `pi install <source> [-l]` | bare verb + positional + flag | distinct top-level **action** (mutates settings/filesystem) | `package-manager-cli.js:37-38,411-414`; `<source>` positional `:197-199`; `-l/--local` flag `:138-146` |
| `pi remove <source> [-l]` | bare verb + positional + flag | distinct action (inverse of install) | `:39-40,415-424` |
| `pi uninstall <source>` | bare verb (**alias** → remove) | same action, alt spelling | `:112-114` normalizes to `remove` |
| `pi update [source\|self\|pi]` | bare verb + optional positional | distinct action (re-resolve + reinstall) | `:41-42,456-505` |
| `pi update <source>` | positional **arg** on the verb | the **object/target** the verb acts on (which package) | `:215-226` |
| `pi update self` / `pi update pi` | positional **arg** (sentinel value) | a named target value, not a separate verb | `:216-219` (`source==="self"\|\|"pi"` → self) |
| `pi update --self` | **flag** on the verb | a **modifier** selecting the verb's target *mode* (self vs ext vs all) | `:147-155,231-233` |
| `pi update --extensions` | flag on the verb | modifier (target mode) | `:156-164,234-236` |
| `pi update --extension <src>` | valued flag on the verb | modifier carrying one operand | `:174-192,206-214` |
| `pi update --force` | boolean flag on the verb | **toggle** altering how the action runs (reinstall even if current) | `:165-173,291-307` |
| `pi list` | bare verb (no args) | distinct action (read/enumerate) | `:43-44,425-455` |
| `pi config` | bare verb (no args) | distinct action — **opens a TUI** (an interactive mode, not request→response) | `:340-357` (`selectConfig(...)` then `process.exit(0)`) |
| `pi [@files] [msgs]` | **default mode**, positional | the agent run itself (the program's primary action) | `main.js:338,349` (`resolveAppMode`) |
| `pi -p / --print` | top-level flag | **mode selector** of the default run (non-interactive) | `pi --help` Options block |
| `pi --mode <text\|json\|rpc>` | valued top-level flag | mode selector of the default run | `pi --help` |
| `pi -c / --continue`, `-r / --resume`, `--session`, `--fork` | top-level flags | modifiers of the default run (session selection) | `pi --help` |
| `pi --provider / --model / --thinking / --tools / --system-prompt` | valued top-level flags | parameters/modifiers of the default run | `pi --help` |
| `pi --no-tools / --no-extensions / --no-skills / --offline / --verbose` | boolean top-level flags | toggles on the default run | `pi --help` |
| `pi --export <file>` | valued top-level flag | a one-shot **side action** that short-circuits the default run (`process.exit(0)` after) | `main.js:358-371` |
| `pi --list-models [search]` | top-level flag (optional operand) | one-shot side action short-circuiting the run | `pi --help`; resolved in `parseArgs` |
| `pi --version / -v`, `--help / -h` | top-level flags | meta-introspection short-circuits | `main.js:354-356`; `pi --help` |
| `pi --trace / --no-trace / --trace-dir / --trace-filter` | top-level flags (**extension-registered**) | toggles/params of the default run, contributed by an extension | `pi --help` "Extension CLI Flags" |

### What the enumeration shows

- **Every bare verb in pi is a settings/filesystem-mutating-or-enumerating action that is *not the default agent run*** and that runs to completion and exits without entering the agent loop (install/remove/update/list all `return`/exit inside `handlePackageCommand`; config exits in `handleConfigCommand`). They are intercepted *before* `parseArgs` ever runs.
- **`config` is the one bare verb that launches an interactive mode (a TUI), yet it is still a bare verb, not a flag.** This is the decisive datapoint for `--pi-bound`: pi makes a whole interactive *alternate mode* (`config`) a bare verb, not `pi --config`.
- **Flags are never distinct actions.** Top-level flags are exclusively (a) modifiers/parameters of the default run, (b) mode selectors of the default run, or (c) one-shot side-effects that *short-circuit* the default run (`--export`, `--list-models`, `--version`). Even these short-circuiting flags live in the default-run flag namespace and are parsed by `parseArgs`, not intercepted as verbs — they are framed as "do this instead of running, then exit," i.e. an option *of* the run command, not a sibling command.
- **Within a verb, the distinction is target-vs-mode**: the *object* the verb acts on is a **positional** (`update <source>`, including sentinel values `self`/`pi`); the *mode/toggle* of how it acts is a **flag** (`--self`, `--extensions`, `--force`). pi even offers both for the self-update (`update pi` positional ≡ `update --self` flag), confirming positional = "which target", flag = "which mode".

---

## 2. The derived heuristic (crisp discriminators)

Apply in order; first match wins:

1. **A distinct, self-completing action that is NOT the default run** (it does its thing and exits without entering the agent/op loop) → **bare subcommand** (`install`, `update`, `list`, **and `config` even though it opens an interactive TUI**). Interactivity does NOT demote a distinct mode to a flag.
2. **The object/target that such a verb operates on** → **positional arg on the verb** (`update <source>`; named sentinels like `self`/`pi` are positional values, not new verbs).
3. **A modifier of HOW a verb runs — its target-mode or a toggle** → **flag on that verb** (`update --self`, `update --extensions`, `update --force`).
4. **A modifier, parameter, or mode-selector of the DEFAULT run** (and one-shot "do-X-instead-then-exit" side actions of the run) → **top-level flag** (`--model`, `-p`, `--mode`, `--export`, `--list-models`, `--version`).

Litmus question for any new capability: **"Is this its own action that runs and exits, or is it an option/mode of an existing action?"** Own action → bare verb (rule 1), interactive or not. Option/mode of the run → flag (rule 4). Option/mode of another verb → flag on that verb (rule 3). Target of a verb → positional (rule 2).

The user's apparent tension resolves cleanly under this rule: **both** `pi-context update` **and** `pi-context --pi-bound` describe distinct self-completing actions that are not the default op-dispatch — so pi's own pattern makes **both bare verbs**. `update` is already framed correctly; `--pi-bound` is the misframed one (a flag standing in for what pi would express as a bare verb, exactly as pi expresses its interactive `config` mode as a bare verb, not `--config`).

---

## 3. Application to pi-context's surface

pi-context's `main()` (`cli.ts:435-520`) currently has only **two namespaces too**: the reflected op verbs (`ops.filter(o => o.surface==="use")`, `:44`) dispatched as `pi-context <op> [--flags]`, and the global flags (`--cwd`, `--json`, `--yes`, `--writer`, `--help`). Every reflected op is already a **bare verb** (`read-block`, `append-block-item`, …) — these are request→response substrate actions that run and return. That is heuristic rule 1, and it is conformant: pi-context's op verbs map exactly onto pi's package-command bare verbs.

| pi-context command | Current / planned form | Heuristic-correct form | Conformant? |
|---|---|---|---|
| `read-block`, `append-block-item`, `update-block-item`, … (all `surface:"use"` ops) | bare verb + `--flags` (reflected) | bare verb + `--flags` | **Yes** — distinct self-completing actions (rule 1); their schema fields are modifiers of the verb (rule 3, as `--flags`) |
| op operands (`--block`, `--id`, `--item`, `--match`, `--updates`) | `--flags` on the op | flags on the verb (rule 3) | **Yes** — though note pi would tend to make the *primary* operand a positional (`update <source>`); pi-context flags everything because the reflection derives flags from schema fields uniformly. Defensible (uniform machine-derived surface), not pi-identical |
| global `--cwd / --json / --yes / --writer` | top-level flags | top-level flags (rule 4 — modifiers of any run) | **Yes** |
| **`pi-context --pi-bound`** (DEC-0014, FEAT-005) | **top-level flag**, routed before op resolution | **bare verb `pi-context pi-bound`** (rule 1) | **NO — misframed.** It is a distinct self-completing action (launches a bounded `pi` subprocess and exits), explicitly *not* an op (DEC-0014) and *not* a modifier of the default op-dispatch. It is pi-context's exact analogue of `pi config`: a whole alternate/interactive run-mode, which pi expresses as a bare verb, never a flag |
| **`pi-context update`** (FEAT-006) | **bare verb** (`pi-context update [--dry-run]`) | **bare verb `pi-context update`** (rule 1); `--dry-run` is a mode toggle on the verb (rule 3) | **Yes** — directly mirrors `pi update`; `--dry-run` mirrors `pi update --force` as a how-it-runs toggle |
| (hypothetical) `pi-context update --dry-run` | flag on the verb | flag on the verb (rule 3) | **Yes** — previewing is a mode of the update action, not its own action |

### `--pi-bound` vs `pi-bound` — the call

**Recommendation: re-cast `pi-context --pi-bound` as the bare subcommand `pi-context pi-bound`.** It is heuristic-correct (rule 1), pi-faithful (it is the precise analogue of pi's bare `config` TUI verb), internally consistent with `pi-context update` (FEAT-006) being a bare verb, and — as the user notes — easier to type. The routing mechanics are unaffected: DEC-0014's load-bearing requirement is that the capability route inside `main()` **before** op resolution and stay **out of** the reflected `surface:"use"` set (`cli.ts:44`); a bare-verb `pi-bound` satisfies both — `main()` would test `first === "pi-bound"` exactly where the spec (`analysis/2026-06-07-pi-context-pi-bound-cli.md:514-525`) currently tests `first === "--pi-bound"`. The spec's entire pi-bound module (`parsePiBoundArgs`, `runPiBound`, the `--grant`/passthrough split, the `pi install -l` preflight) is unchanged; only the dispatch token changes from a `--`-prefixed flag to a bare word.

**DEC-0014 implication.** DEC-0014's *decision* and *consequences* are token-agnostic — they say "route before op resolution, exclude from the reflected op surface, contract is the CLI entry's not an op's," all of which a bare verb honors. But DEC-0014's **title and context use the flag spelling** ("pi-context **--pi-bound**", "`--pi-bound` launches…", "the `--pi-bound` branch"), and the pi-bound spec is written throughout in flag form. Re-casting to a bare verb is a **framing revision to DEC-0014** (and a token rename across the spec): the substance survives, but the decision text should be amended to the bare-verb spelling and should record *why* (pi's own `config`-as-bare-verb precedent for an interactive alternate mode), so the surface stays principled rather than ad-hoc. This is a decision for the user to file; the heuristic only establishes that the bare-verb form is the conformant one.

---

## Findings summary (liftable into a research record)

pi's CLI has exactly two surface namespaces: a fixed set of **bare verbs intercepted before the default agent run** (install/remove/uninstall/update/list/config — every one a distinct self-completing action that runs and exits without entering the agent loop) and the **flag space of the default run** (modifiers, mode-selectors, and one-shot short-circuit side-actions like --export/--list-models). Decisive evidence: `config` opens an interactive TUI yet is a **bare verb, not `--config`** — so interactivity does not demote a distinct mode to a flag. Within a verb, the **object/target is a positional** (`update <source>`, incl. sentinels `self`/`pi`) and **how-it-runs is a flag** (`update --self`/`--force`); pi offers `update pi` ≡ `update --self` to prove positional=target, flag=mode. Derived heuristic (first match wins): (1) distinct self-completing action ≠ default run → **bare verb** (interactive or not); (2) the verb's target → **positional**; (3) a modifier of how a verb runs → **flag on the verb**; (4) a modifier/mode/short-circuit-side-action of the default run → **top-level flag**. Litmus: "own action that runs-and-exits, or an option/mode of an existing action?" Applied to pi-context: all reflected `surface:"use"` ops are correctly bare verbs (rule 1); `pi-context update` (FEAT-006) is correctly a bare verb mirroring `pi update`, with `--dry-run` a correct mode-flag (rule 3); but **`pi-context --pi-bound` (DEC-0014) is misframed — it is a distinct self-completing action (launch a bounded `pi` subprocess and exit), the exact analogue of pi's bare `config` verb, and should be re-cast as the bare subcommand `pi-context pi-bound`**. Routing is unaffected: DEC-0014's load-bearing requirements (route in main() before op resolution; exclude from the reflected `surface:"use"` set, cli.ts:44) hold for a bare verb — `main()` tests `first === "pi-bound"` where the spec currently tests `first === "--pi-bound"`. DEC-0014's decision/consequences are token-agnostic and survive, but its title/context (and the pi-bound spec) use the flag spelling, so adopting the bare verb is a **framing revision to DEC-0014** the user must file — substance unchanged, spelling and rationale (pi's config-as-bare-verb precedent) updated.
