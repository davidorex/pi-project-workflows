# CLI `--help` + UX Research — for the `pi-context` reflecting CLI render layer

**Date:** 2026-06-09 (all retrieval dates below)
**Purpose:** Grounded, cited intel to inform the design of a reusable help/UX render layer over the `pi-context` op-registry. `pi-context` is a globally-installed, **agent-invoked** reflecting CLI (`pi-context <op> [--flags]`) with ~48 auto-derived ops, each carrying `name` / `description` / `promptSnippet` / typed params. Primary consumer is an LLM agent reading terminal output; secondary is a human. This document is research/intel — it does NOT design the implementation or write code.

**Sourcing discipline:** Every external claim carries a URL + retrieval date. Claims are tagged **[GUIDELINE says]** (a published rule), **[EXEMPLAR does]** (an observed practice of a real tool), or **[SYNTHESIS]** (my inference for our case). Where a fetch failed, it is stated explicitly rather than filled from memory.

**Fetch failures (stated, not fabricated):**
- `docopt.org` direct fetch failed with a TLS cert-altname error (retrieved 2026-06-09). docopt's usage-pattern conventions below are instead sourced from a WebSearch result summarizing `docopt.org` and from `docopt.readthedocs.io` (cited inline).
- `cli.github.com/manual/` does not render the literal terminal `gh --help` block (it is a web manual index). The `gh` group-heading structure below is sourced from a WebSearch summary of the manual + the Codecademy/nearform tutorials and the `cmdutil.AddGroup` mechanism (cited inline). The exact heading strings (`CORE COMMANDS`, etc.) are corroborated across those secondary sources but were not read off a live terminal capture.

---

## 1. Executive summary — highest-leverage reusable patterns for OUR agent-invoked reflecting CLI

Each is one line; each is expanded + cited in §6.

1. **Grouped top-level command listing** sourcing a SHORT one-liner (our unused `promptSnippet`), not the multi-sentence `description` — group by name-prefix taxonomy (`read-*`, `append-*`, `update-*`, `config/schema`, process-mode like `pi-bound`). Backed by gh `CORE COMMANDS`, kubectl `Basic/Deploy/Cluster`, docker `Management Commands`, cobra `AddGroup`. (clig.dev, 12-factor, all §3 exemplars.)
2. **Per-op `<op> --help` with a fixed template**: SYNOPSIS line → one-line summary → DESCRIPTION → FLAGS (required vs optional explicit) → EXAMPLES (copy-pasteable) → RELATED → learn-more footer. (bettercli.org template; clap `help_template`; clig.dev "lead with examples".)
3. **Examples are the highest-value help content** — show common/complex invocations first, copy-pasteable. (clig.dev; 12-factor Factor 1; the agent-CLI articles: "agents learn patterns from examples faster than from flag descriptions.")
4. **`--version` (and `version`, `-V`)** — currently absent; a baseline. (clig.dev; 12-factor Factor 3.)
5. **Help on no-args + `-h`/`--help` after ANYTHING** — `pi-context` with no op shows grouped overview; `-h` works on any op. (clig.dev; 12-factor Factor 1.)
6. **Machine-readable help (`--help --json` / a `--format` knob)** — because the primary caller is an LLM agent, a structured, stable, parseable rendering of the same help is uniquely high-leverage here. (clig.dev `--json`/`--plain`; agent-CLI articles "dual-mode output… controlled by a flag.")
7. **Required-vs-optional flags shown explicitly + typed** — agents will not guess. (agent-CLI articles: "Show required vs optional clearly. Agents will not guess which flags are required.")
8. **TTY-aware sectioning/color that degrades to plain when piped/non-TTY**, honoring `NO_COLOR`/`TERM=dumb`/`--no-color`; help always to **stdout**. (clig.dev; 12-factor Factors 4/6; bettercli.org.)

---

## 2. Canonical guidelines distilled (cited)

### clig.dev — Command Line Interface Guidelines
Source: https://clig.dev/ — retrieved 2026-06-09. **[GUIDELINE says]**

- **`-h`/`--help` everywhere, idempotently:** *"Ignore any other flags and arguments that are passed — you should be able to add `-h` to the end of anything and it should show help."* Support `myapp help`, `myapp help subcommand`, `myapp subcommand --help`, `myapp subcommand -h`.
- **Concise help when args required but none given:** show what the program does, one or two example invocations, flag descriptions, and "pass `--help` for full information" — *unless* the program is interactive by default (e.g. `npm init`).
- **Lead with examples:** *"Users tend to use examples over other forms of documentation, so show them first in the help page, particularly the common complex uses."*
- **Prioritize common commands:** *"Display the most common flags and commands at the start of the help text."* (cites git grouping its startup/frequent subcommands first).
- **Format for scannability:** *"Use formatting in your help text. Bold headings make it much easier to scan."* — but keep terminal-independence (don't litter escape codes when not a TTY).
- **Suggest next steps:** *"When several commands form a workflow, suggesting to the user commands they can run next helps them learn how to use your program and discover new functionality."*
- **Machine-readable output:** *"Display output as formatted JSON if `--json` is passed"*; provide `--plain` for `grep`/`awk`-friendly tabular text. Primary data → stdout, messages/errors → stderr (composability).
- **`--version`** flag to display program version.
- **`-h`/`--help` reserved exclusively for help** — don't overload.
- **Link to web docs** in help (and to a per-subcommand anchor if one exists); provide a **support path** (website/GitHub) in top-level help.
- **Suggest corrections** when you can guess intent (don't auto-run the correction).
- **Exit codes:** *"Return zero exit code on success, non-zero on failure."*
- **TTY/color:** disable color/animation when stdout/stderr isn't a TTY; honor `NO_COLOR`, `TERM=dumb`, `--no-color`.
- **Help to stdout** (corroborated by bettercli.org §below).

### 12-Factor CLI Apps — Jeff Dickey (Heroku/oclif)
Source: https://jdxcode.medium.com/12-factor-cli-apps-dd3c227a0e46 — retrieved 2026-06-09. **[GUIDELINE says]**

- **Factor 1 — Great help is essential.** ALL of `mycli`, `mycli --help`, `mycli help`, `mycli -h` must show help; subcommands honor `--help`/`-h`. Help must include *"description of the command, description of the arguments, description of all the flags, and most importantly: provide examples of common usage."* Reserve `-h`/`--help` exclusively for help.
- **Factor 2 — Prefer flags to args.** Flags are clearer than positionals: *"1 type of argument is fine, 2 types are very suspect, and 3 are never good."* Accept `--` to stop parsing.
- **Factor 3 — Version.** Support `mycli version`, `--version`, `-V` (`-v` only if not taken by `--verbose`).
- **Factor 4 — Mind the streams.** *"stdout is for output, stderr is for messaging."*
- **Factor 6 — Be fancy (TTY-aware).** No colors on stdout when not a TTY; respect `TERM=dumb`, `NO_COLOR`, `--no-color`.
- **Factor 8 — Tables.** *"Never output table borders. It's noisy and a huge pain for parsing."* One entry per row; support `--columns`, `--no-headers`, `--csv`, `--json`, `--filter`, `--sort`.

### docopt — "help text IS the spec"
Sources: WebSearch summary of http://docopt.org/ (direct fetch failed, TLS cert error, 2026-06-09); https://docopt.readthedocs.io/en/0.4.0/ — retrieved 2026-06-09. **[GUIDELINE says]**

Core idea: the **usage/help text is the formal interface description** — the parser is derived from the human-readable SYNOPSIS rather than vice versa. The usage-pattern conventions (a portable SYNOPSIS grammar worth mirroring in our per-op synopsis line):
- `[ ]` — optional element.
- `( )` — explicitly required grouping (elements are required by default unless bracketed).
- `|` — mutually exclusive alternatives, e.g. `(--up | --down)`.
- `...` — repetition: `FILE ...` = one-or-more; `[FILE ...]` = zero-or-more.
- An **Options section** below the usage patterns: every line beginning with `-`/`--` is an option description.
- `<lowercase>` or `UPPERCASE` denote positional arguments.

**[SYNTHESIS]** Even though we won't adopt docopt-the-parser, its SYNOPSIS notation is the de-facto lingua franca an LLM already recognizes — a per-op synopsis like `pi-context append-block-item --block <name> --arrayKey <key> (--item <json> | --item @<file>) [--autoId] --writer <json> [--json]` is instantly legible to the agent caller.

### bettercli.org — CLI help-page structure
Source: https://bettercli.org/design/cli-help-page/ — retrieved 2026-06-09. **[GUIDELINE says]**

Recommended section order for a help page:
1. **Name, Description, Version**
2. **Usage** + **Example Usage**
3. **Available Commands** and **Options**
4. **Configuration Options** (env vars, config files)

Concrete template observed:
```
multipush CLI v1.0.0 (2023-01-01)
Synchronize files between multiple repositories.

DESCRIPTION
  [extended explanation]
USAGE
  $ multipush COMMAND [OPTIONS]
EXAMPLE
  [usage examples]
COMMANDS
  [list with descriptions]
OPTIONS/FLAGS
  [flags + options]
```
- Provide both `-h` and `--help`, and consider a dedicated `help` command.
- Per-subcommand help via `multipush [COMMAND] --help`; footer line *"Use 'multipush [command] --help' for more information about a command."*
- **`--help` must print to stdout, not stderr.**
- Consider links to exit codes, homepage, docs.

---

## 3. Exemplar teardown — what loved CLIs do in `--help` (cited)

| Tool | Structural element it demonstrates | Source (retrieved 2026-06-09) |
|---|---|---|
| **gh** (GitHub CLI) | **Named command groups** in top-level help: `CORE COMMANDS`, `GITHUB ACTIONS COMMANDS`, `ALIAS COMMANDS`, `ADDITIONAL COMMANDS`; built via `cmdutil.AddGroup()`; per-command + per-subcommand `--help` (`gh issue --help`, `gh issue create --help`); top-level overview from bare `gh`. | https://cli.github.com/manual/ ; https://www.codecademy.com/article/github-cli-tutorial ; https://nearform.com/digital-community/the-pragmatic-programmers-guide-to-github-cli/ |
| **kubectl** | **Capability-tier grouping**: `Basic Commands (Beginner)`, `Basic Commands (Intermediate)`, `Deploy Commands`, `Cluster Management Commands` — groups by *workflow stage / skill*, not just resource. | https://kubernetes.io/docs/reference/kubectl/ |
| **docker** | **`Management Commands` vs flat `Commands`** split — noun-grouped management surface (e.g. `docker container …`) separated from common top-level verbs. (Noun-verb two-level pattern.) | clig.dev "two levels of subcommand… `docker container create`" — https://clig.dev/ |
| **cargo** | **Common-vs-all split + on-demand reference**: bare `cargo` lists common commands (`build`, `check`, `run`, `new`…) with footer *"See 'cargo help <command>' for more information on a specific command"*; `cargo help <cmd>` ≡ `cargo <cmd> --help`; man-page "see also" cross-refs. | https://doc.rust-lang.org/cargo/commands/cargo.html ; https://www.mankier.com/1/cargo |
| **git** | **Frequent commands first** — startup/everyday subcommands grouped ahead of the exhaustive listing (clig.dev's cited model for "prioritize common commands"). | https://clig.dev/ |
| **stripe / heroku / salesforce** | Built on **oclif** — examples-driven help: each command declares an `examples` property surfaced in help; `topicSeparator` controls `topic:cmd` vs `topic cmd`; nesting kept to 1–2 levels. | https://oclif.io/docs/topic_separator/ ; https://developer.salesforce.com/blogs/2022/10/building-a-cli-application-with-oclif |

**Cross-exemplar synthesis [SYNTHESIS]:** the loved ones converge on (a) a SYNOPSIS/usage line, (b) **named groups** with one-line summaries (gh, kubectl, docker), (c) a **common-first** ordering (git, cargo), (d) **examples surfaced as first-class help content** (oclif/stripe), (e) a **footer pointing to deeper per-command help** (cargo, bettercli), and (f) consistent flag naming across subcommands. The grouping *axis* differs — gh/docker group by **resource (noun)**, kubectl by **workflow stage** — which is the key provisional design call for us (§7).

---

## 4. Help-generation framework patterns (cited)

These matter because our help must be **generated by reflection over the op-registry**, exactly as these frameworks generate help from a command/flag registry.

### clap (Rust)
Source: https://docs.rs/clap/latest/clap/_derive/index.html — retrieved 2026-06-09. **[EXEMPLAR does]**
- **`help_template`** — a customizable template controlling overall help structure (placeholder-driven).
- **`next_help_heading`** — groups flags under custom section headings; scoped per struct when `flatten`ed. **Known limitation:** does NOT group *subcommands* under custom headings as of the issue thread (https://github.com/clap-rs/clap/issues/5828, retrieved 2026-06-09) — relevant because OUR primary grouping need is over *ops/subcommands*, so a clap-style flag-heading mechanism alone would be insufficient; subcommand grouping is the part we'd render ourselves.
- **`about` / `long_about`**, doc-comment short/long split (blank-line separated), `after_help` for examples, `Command::styles` for color.

### cobra (Go) — the gh/kubectl/docker engine
Source: https://pkg.go.dev/github.com/spf13/cobra ; https://github.com/spf13/cobra/pull/1003/files — retrieved 2026-06-09. **[EXEMPLAR does]**
- **`AddGroup()`** on the parent defines named command groups; each subcommand sets `GroupID`; groups render **in definition order**. This is the direct mechanism behind gh's `CORE COMMANDS` etc.
- **`SetUsageTemplate` / `SetHelpTemplate`** — `text/template`-driven usage/help rendering.
- `SetHelpCommandGroupId` / `SetCompletionCommandGroupId` to slot the generated help/completion commands into a group.

### oclif (Node) — stripe/heroku/salesforce engine
Source: https://oclif.io/docs/topic_separator/ ; https://developer.salesforce.com/blogs/2022/10/building-a-cli-application-with-oclif — retrieved 2026-06-09. **[EXEMPLAR does]**
- **Topics** = directory-of-commands; **`topicSeparator`** picks `topic:cmd` vs `topic cmd`.
- Each command declares an **`examples`** array used directly in generated help.
- Customizable **Help class**; nesting recommended to 1–2 levels.

### Click / Typer (Python)
Source: WebSearch corroboration + clig.dev exemplar references — retrieved 2026-06-09. **[EXEMPLAR does]** (lower-confidence; not deep-fetched)
- Help derived from decorators/docstrings; `epilog` for examples/after-text; groups via command-group objects; rich-formatted help is a common add-on.

**Framework synthesis [SYNTHESIS]:** the shared, mirrorable structure is — **(1) a help *template* with placeholder slots** (clap `help_template`, cobra `SetUsageTemplate`), **(2) a *group registry*** mapping each command to a named, ordered group (cobra `AddGroup`/`GroupID`), and **(3) a per-command *examples* field** surfaced verbatim in help (oclif `examples`, clap `after_help`, Click `epilog`). For us these map to: a render template + a group taxonomy keyed off op-name prefix + an `examples`/`synopsis` field we add to each registry entry (or derive). clap's subcommand-grouping limitation is the concrete warning that our *op grouping* is custom-render work, not a free framework feature.

---

## 5. Agent-facing CLI UX findings (cited)

Because the **primary caller is an LLM agent**, these are first-order, not secondary.

Source: https://dev.to/uenyioha/writing-cli-tools-that-ai-agents-actually-want-to-use-39no — retrieved 2026-06-09. **[GUIDELINE/EXEMPLAR — practitioner]**
- **Structured output mandatory:** *"JSON to stdout, everything else to stderr."*
- **Self-documenting:** *"Show required vs optional clearly. Agents will not guess which flags are required."* and *"Include realistic examples. Agents learn patterns from examples faster than from flag descriptions."*
- **Noun-verb help tree** = deterministic exploration: `myctl --help` → resources; `myctl <noun> --help` → verbs.
- **Meaningful exit codes:** 0 ok, 1 general, 2 usage, 3 not-found, 4 permission-denied, 5 conflict; pair with a **parseable error-type string** in JSON (e.g. `image_not_found`).
- **`--dry-run`** (preview destructive ops, structured) + **`--yes`/`--force`** (agents can't answer TTY prompts).

Source: https://archit15singh.github.io/posts/2026-02-28-designing-cli-tools-for-ai-agents/ — retrieved 2026-06-09. **[EXEMPLAR — practitioner, "Memori"]**
- **`--help` is the agent's primary documentation surface:** *"Agents read `--help` before they read documentation. Your help text is your most important documentation surface."*
- **Dual-mode + token-economy output:** human default, `--json` structured, **`--raw`** minified (*"strips whitespace and indentation, cutting output size by ~40%"*); `--compact` truncates IDs to 8 chars / content to 100 chars.
- **Error type + recovery hint** in JSON (e.g. type `no_embedding`, hint `"run 'memori embed'…"`).
- **Be liberal in inputs:** *"Agents often experiment with parameters, and rejecting valid-but-unexpected inputs forces unnecessary retries."*
- **Behavioral guidance injected into agent context** (CLAUDE.md-style) documents *when*, not just *how*.

Source (landscape, lower-confidence): WebSearch summaries — https://www.firecrawl.dev/blog/best-cli-tools ; https://medium.com/@unicodeveloper/10-must-have-clis-for-your-ai-agents-in-2026-51ba0d0881df — retrieved 2026-06-09. **[SYNTHESIS of secondary claims]**
- A comparative claim circulating in 2025-2026 writing: CLI-based agents reportedly beat MCP-based agents on token cost (≈10–32×) and reliability (≈100% vs ≈72%) for developer tasks. **Reported, not independently verified here** — cited as landscape signal, not load-bearing fact. It reinforces that a well-shaped agent-CLI surface (our case) is the right investment, but the specific multipliers should not be relied upon.

**Agent-facing synthesis [SYNTHESIS]:** for OUR CLI, the help layer should be **both human-scannable AND machine-parseable from the same source** — the registry already holds typed params + `description` + `promptSnippet`; a `--help --json` rendering of {synopsis, summary, flags[{name,type,required}], examples[], related[]} is nearly free off the registry and is exactly the "self-describing surface" the agent-CLI literature asks for. Required/optional/typed must be explicit because the caller will not guess.

---

## 6. The reusable-elements checklist — build once, apply across all ~48 ops + per-op help

Each row: **what it is** · **who backs it (guideline/exemplar)** · **how it fits reflection-over-op-registry** · **human-scannable + agent-legible payoff**.

1. **Grouped top-level listing (by name-prefix taxonomy), one-liner per op.**
   - Backs: gh `CORE COMMANDS`/cobra `AddGroup`; kubectl tiers; docker `Management Commands`; clig.dev "prioritize common / group"; 12-factor F1.
   - Registry fit: derive group from op-name prefix (`read-*`, `append-*`, `update-*`, `config/schema`, relations, process-mode `pi-bound`) or an added `group` field; print the **short `promptSnippet`** (currently unused) as the one-liner, NOT the multi-sentence `description`.
   - Payoff: fixes today's flat unscannable paragraph dump; agent gets a deterministic tree to descend; human scans groups.

2. **Per-op help template (fixed slot order).**
   - Backs: bettercli.org template; clap `help_template`; cobra `SetUsageTemplate`.
   - Registry fit: one render template with slots [synopsis · summary · description · flags · examples · related · footer], filled from registry fields.
   - Payoff: every `<op> --help` reads identically; agent parses by stable structure.

3. **SYNOPSIS / usage line per op (docopt notation).**
   - Backs: docopt conventions; bettercli `USAGE`; clig.dev usage.
   - Registry fit: generate from typed params — required → bare `--flag <type>`, optional → `[--flag <type>]`, `@file` alternation as `(… | @<file>)`.
   - Payoff: instantly legible call shape; LLM already knows docopt notation.

4. **EXAMPLES block (copy-pasteable, common-first).**
   - Backs: clig.dev "lead with examples"; 12-factor F1; oclif `examples`; agent-CLI "agents learn from examples faster than flag descriptions."
   - Registry fit: add an `examples: string[]` field per op (small authoring cost; high payoff). Canonical filing-pattern invocations already exist in CLAUDE.md and can seed them.
   - Payoff: the single highest-value help element for the agent caller.

5. **RELATED-ops hint ("see also").**
   - Backs: cargo man "see also"; clig.dev "suggest next steps"; agent noun-verb tree.
   - Registry fit: per-op `related: opName[]`, or derive within the same group (e.g. `append-block-item` ↔ `read-block-item`/`update-block-item`).
   - Payoff: workflow discoverability (e.g. surfacing `pi-bound`, currently undiscoverable); agent finds the next call.

6. **Required-vs-optional + typed FLAGS section.**
   - Backs: agent-CLI "agents will not guess which flags are required"; docopt; 12-factor F2 (flags over args).
   - Registry fit: typed params already encode name/type/required — render a two-tier flags list (required first).
   - Payoff: fewer agent retries from missing/guessed flags.

7. **`--version` (+ `version`, `-V`).**
   - Backs: clig.dev; 12-factor F3. Currently absent.
   - Registry fit: package version, not registry-derived; trivial.
   - Payoff: baseline expectation; lets the agent/human pin behavior to a version.

8. **Help on no-args + `-h`/`--help` after anything → stdout.**
   - Backs: clig.dev ("add `-h` to anything"); 12-factor F1; bettercli (help to stdout).
   - Registry fit: bare `pi-context` → grouped overview; any op + `-h` → its per-op template.
   - Payoff: zero dead-ends; agent always recovers help.

9. **Machine-readable help: `--help --json` (and/or `--format json`).**
   - Backs: clig.dev `--json`/`--plain`; agent-CLI dual-mode; "self-describing surface."
   - Registry fit: serialize the same {group, synopsis, summary, flags, examples, related} the human view renders — one source, two renderings.
   - Payoff: the agent parses help deterministically instead of scraping prose; uniquely high-value given our primary caller.

10. **TTY-aware sectioning/color, degrades to plain.**
    - Backs: clig.dev; 12-factor F6; bettercli.
    - Registry fit: a render concern in the layer; bold headings on TTY, plain otherwise; honor `NO_COLOR`/`TERM=dumb`/`--no-color`.
    - Payoff: scannable for humans on a TTY, clean for agents piping/capturing.

11. **Learn-more / support footer.**
    - Backs: clig.dev (link web docs + support path); cargo footer; bettercli.
    - Registry fit: static footer — pointer to the SKILL.md / repo / `<op> --help`.
    - Payoff: escape hatch to deeper docs.

12. **Consistent flag conventions + stable output across all ops.**
    - Backs: clig.dev "be consistent across subcommands"; 12-factor; agent-CLI stability.
    - Registry fit: because help is *generated*, consistency is enforced structurally rather than by per-op authoring.
    - Payoff: one learned shape transfers across all 48 ops — the core win of a render layer.

**Adjacent agent-output elements (related surface, beyond help proper — note, don't necessarily bundle):** structured errors with a parseable `error_type` + recovery hint; meaningful exit codes (0/1/2/3/4/5); `--raw`/`--compact` token-economy output; `--dry-run` + `--yes`. These are output/UX siblings the same literature recommends; flagged here so they're tracked, not silently dropped (Memori + dev.to articles, §5).

---

## 7. Resolved by derivation from the CLI + pi-context facts (not open user-calls)

The earlier framing of these as "design forks needing the user's call" was options-proliferation/hedging — each resolves from the system's own facts; none is a taste choice:

1. **Group taxonomy + ordering — DERIVED, not curated.** The op names already encode the partition: **Read/Query** (`read-*`, `resolve-*`, `find-references`, `filter-*`, `join-*`, `walk-*`), **Block writes** (`append/update/upsert/remove-block-item` + nested, `write-block`), **Relations** (`append/remove/replace-relation(s)`), **Schema & config** (`read/write-schema*`, `amend-config`, `read-config`, `rename-canonical-id`), **Substrate lifecycle** (`context-*`, `update`), **Workflow** (`complete-task`, `resolve-conflict`, `promote-item`), **Process mode** (`pi-bound`). The order is dictated by op semantics — read-before-mutate → vocabulary → lifecycle → process-mode last — not by frequency-guessing. Implement as a PURE CLASSIFIER over the op name (a new op auto-slots; the parity gate keeps it honest); never a hardcoded curated list (that would be the drift-prone parallel list `gap-arc-coherence` + the parity gate exist to prevent).
2. **Color default — plain.** Plain by default; honor `NO_COLOR`/`TERM=dumb`/`--no-color`. The agent-primary caller settles it: TTY-color has no upside for captured output.
3. **Machine help — through the existing `--format`.** `--format text|json|table` already shipped (the output layer); help participates in it. No parallel `--help --json` surface.
4. **One-liner source — reuse `promptSnippet`.** It exists, is short, is the op-surface one-liner; audit the ~48 and fix any that read poorly (maintained op-surface strings). No new field.
5. **Examples — author all ~48 now.** Seeded from the CLAUDE.md filing patterns. The standing best-of-breed/no-deferral mandate settles it; a synthetic floor is the rejected ship-after tier.
6. **`pi-bound` — its own discoverable group entry with authored help** (process-mode, not a reflected op).

Data caveat (not a fork): the circulating ~10–32× CLI-vs-MCP token/reliability multiplier (§5) is unverified landscape signal — do not cite it as load-bearing justification.

---

## Source list (URL · retrieval date · type)

- https://clig.dev/ · 2026-06-09 · guideline (fetched)
- https://jdxcode.medium.com/12-factor-cli-apps-dd3c227a0e46 · 2026-06-09 · guideline (fetched)
- https://bettercli.org/design/cli-help-page/ · 2026-06-09 · guideline (fetched)
- http://docopt.org/ · 2026-06-09 · guideline (**fetch FAILED — TLS cert error**; used WebSearch summary)
- https://docopt.readthedocs.io/en/0.4.0/ · 2026-06-09 · guideline (search-summarized)
- https://cli.github.com/manual/ · 2026-06-09 · exemplar (manual index; group strings via secondary sources)
- https://www.codecademy.com/article/github-cli-tutorial · 2026-06-09 · exemplar (gh structure, secondary)
- https://nearform.com/digital-community/the-pragmatic-programmers-guide-to-github-cli/ · 2026-06-09 · exemplar (gh, secondary)
- https://kubernetes.io/docs/reference/kubectl/ · 2026-06-09 · exemplar (kubectl groups)
- https://doc.rust-lang.org/cargo/commands/cargo.html · 2026-06-09 · exemplar (cargo)
- https://www.mankier.com/1/cargo · 2026-06-09 · exemplar (cargo man "see also")
- https://docs.rs/clap/latest/clap/_derive/index.html · 2026-06-09 · framework (clap, fetched)
- https://github.com/clap-rs/clap/issues/5828 · 2026-06-09 · framework (clap subcommand-grouping limitation, search-summarized)
- https://pkg.go.dev/github.com/spf13/cobra · 2026-06-09 · framework (cobra, search-summarized)
- https://github.com/spf13/cobra/pull/1003/files · 2026-06-09 · framework (cobra AddGroup, search-summarized)
- https://oclif.io/docs/topic_separator/ · 2026-06-09 · framework (oclif, search-summarized)
- https://developer.salesforce.com/blogs/2022/10/building-a-cli-application-with-oclif · 2026-06-09 · framework (oclif examples, search-summarized)
- https://dev.to/uenyioha/writing-cli-tools-that-ai-agents-actually-want-to-use-39no · 2026-06-09 · agent-CLI (fetched)
- https://archit15singh.github.io/posts/2026-02-28-designing-cli-tools-for-ai-agents/ · 2026-06-09 · agent-CLI (fetched)
- https://www.firecrawl.dev/blog/best-cli-tools · 2026-06-09 · landscape (search-summarized, low-confidence)
- https://medium.com/@unicodeveloper/10-must-have-clis-for-your-ai-agents-in-2026-51ba0d0881df · 2026-06-09 · landscape (search-summarized, low-confidence)
