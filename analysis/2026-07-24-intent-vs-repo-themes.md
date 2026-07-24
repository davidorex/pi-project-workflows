# Documented user intent for the monorepo as a product — what exists, what doesn't

Date: 2026-07-24. Replaces this file's earlier method-lens draft per the user's ruling
(the ask was product features and usability, not development process). Derived by an
Explore agent (session 7303462d) from the 2026-07-19 audit corpus's intent stream
(142 user-anchored records, of which ~24 are product-facing; the ~118
development-process/governance records are excluded from this view), the corpus's
grounded verdicts and still-open findings, and the shipped code and READMEs. Load-bearing
claims spot-re-verified in the shipped source at synthesis time (the expression-filter
registry counted directly; the nested-workflow rejection, the count-only loop shape, and
the context-blind loop-step compile confirmed at their code sites). Facts only.

## The product promise (the user's words)

Developer-independence is the north star: "If pi-project-workflows is done right, users
need not wait for developers to implement changes that they find through use that they
need. The use of the tool shows you the shape of how to make the version of the tool
that you want." (2026-03-24). Pillars: declare-don't-code ("flexibility and
no-hard-coding and revisability is the key framing," 2026-05-20); agents composed like
typed tools ("agents are seen as composed tools that take context input and produce
structured output, which itself then is composable later," 2026-04-06); live tunability
("the tuning must be able to be done on-the-fly … that's the overarching goal of the
entire extension," 2026-04-07); the main conversation as the user's control panel
including "the user also must be able to say 'validate that workflow'" (2026-03-18);
and the bar: "my metric is the monorepo is best of breed and a superior user
experience, period."

## Feature map — per capability area

Markers: BROKEN = advertised on the product surface but not working. NEVER BUILT =
documented want with no implementation.

### The project-context store (declare, query, evolve)
Ships: drop a schema file into the substrate's schemas dir and it becomes an addressable
block type with write-time validation, discovery, and generic CRUD — no code changes.
Queries, paged reads, display-name/id decoupling, customization-preserving 3-way update.
- NEVER BUILT: using a newly declared block type in an existing project — nothing
  creates its data file, and the project then falsely reports not-installed. The
  axe-handle case itself fails at the last step.
- NEVER BUILT: repairing a config once invalid — the tool validates before it mutates,
  so a broken config is a dead end ("config-schema evolution has no safe-change path,"
  user, 2026-06-14).
- BROKEN: write-acceptance trust — a duplicate-kind rollup entry loads without complaint
  and skews derived state; the write-time edge guard accepts edges a later validate pass
  rejects; a status-only change re-judges an item's whole grandfathered body.

### Agents as composable typed tools
Ships: YAML agent specs compiled from project state (context blocks injected), typed
input/output contracts, in-process and subprocess dispatch, tool-grant clamping, the
bounded work-order loop. One agent concept across surfaces, per the package's own README.
- BROKEN: one spec, two dialects — an inline task string compiles on direct dispatch but
  crashes as a workflow step; the object form is silently dropped by both parsers.
- BROKEN: loop-step agents compile without the project directory, so their context
  blocks are silently skipped — looped agents run context-blind.

### Typed multi-step workflows
Ships: eight step types (agent, command, transform, gate, parallel, foreach, loop,
pause), DAG-inferred parallelism, checkpoint/resume, human-review pause, an expression
engine, validate-on-demand from the main conversation.
- BROKEN: the manual advertises ~44 expression filters; the shipped registry implements
  10 (counted directly), and several implemented ones are not in the advertised list.
- BROKEN: 8 of the 15 bundled example workflows fail the product's own validator.
- BROKEN: the workflow-inside-workflow step type is declared in the format and rejected
  by the parser at load.
- NEVER BUILT: condition-based loop termination ("repeat until X" / budget-remaining) —
  loops end on attempt-count only (confirmed in the shipped type).
- NEVER BUILT: worktree isolation for parallel steps — concurrent file-writing steps
  share one working tree.

### Monitors tuned live
Ships: monitors as typed JSON files (classify / patterns / actions / scope), three-tier
discovery with project-level override, five bundled, live per-monitor tuning via a slash
command — the "overarching goal" capability genuinely ships.
- Unproven: the documented companion-monitor-per-domain design ("for when code in its
  domain is updated, it updates the domain block," 2026-03-19) — no evidence of a shipped
  realization, none against; unconfirmed rather than confirmed-missing.

### The CLI and slash-command surfaces
Ships: a real globally-installable command whose command set is reflection-derived from
the op registry (auto-tracks code, per the 2026-06-02 intent); per-op help with usage
examples; kebab-case tolerance; id/where/writer shorthands; contract preview; dry-run;
text/json/table output; field-named validation errors; documented exit codes. The one
surface where the "superior UX" bar is visibly met.
- NEVER BUILT: typo protection at the op layer — an unknown or misspelled option is
  silently accepted, and mistyping the preview flag runs the LIVE write the caller meant
  to preview.
- BROKEN: dry-run previews report would-write for writes the live run refuses.
- BROKEN: slash-surface parity — five capabilities exist only as CLI ops and are
  invisible from the /context surface ("a profound ops parity fail," user).
- Open half of a direct ask: per-command usage examples ship, but the user's paired
  question — "how do we ensure that doesn't go stale?" (2026-06-14) — has no mechanism.

### Install and bootstrap
Ships: the full idempotent ceremony (init, accept-all, install, check-status, update
with 3-way merge, conflict resolution), per-extension and meta-package install, agent
specs materialized as editable project files.
- BROKEN: the packaged starter catalog drifts below the live configuration and ships
  retired planning vocabulary into every consuming project's installed schemas.
- Plus the new-block materialization gap above.

### Dashboards, hotkeys, docs
- Dashboards: the HTML overview generator works; BROKEN — the committed overview is
  stale (unregenerated across 8 subsequent substrate commits) and no regeneration
  mechanism exists.
- Hotkeys: pause/resume chords work; BROKEN — they shadow the editor's own newline and
  backspace keys.
- Docs: extensive per-package READMEs with explicit for-LLM consult lists (the
  2026-03-16 intent); BROKEN in five places where the docs assert what does not exist
  (filters, bundled specs, catalog vocabulary, dashboard currency) against "you can't
  leave a spec that contains inaccurate or out of date info" (2026-05-31).

## Usability ledger (how it feels to use)

- Sharpest hazard: a typo is not rejected but silently obeyed — including a preview
  flag typo that performs the live write.
- The manual promises filters that aren't there; the first bundled examples a new user
  runs fail validation.
- Capabilities invisible from the human slash surface that exist one layer down.
- A config error is unrecoverable in-tool.
- Loaded workflow extensions interfere with basic typing.
- Committed views (dashboard, catalog vocabulary) misrepresent current reality, against
  the user's "exactingly current" standard.
- Counter-example where the bar IS met: the installed CLI's ergonomics (examples,
  shorthands, previews, named errors, exit codes).

## Counts

- Product-facing intents: ~24 of 142 (the rest are development-process/governance,
  excluded here).
- All nine capability areas have a real shipping core.
- Promised-but-broken: 6 (expression filters; bundled specs; nested workflows; dashboard
  currency; hotkey clash; slash-surface parity).
- Never built: 5 (config repair; new-block materialization; loop conditions; parallel
  isolation; op-layer typo rejection).
- Correctness defects touching the user surface: ~6 (silent bad writes; optimistic
  previews; context-blind loops; two-dialect agent specs; duplicate-rollup acceptance;
  retroactive re-judging on status flips).
- Honesty flag: five corpus findings describe capabilities the shipped code now has
  (work-order retry policy, context-block/output-contract consumption, spec
  materialization on install, non-interactive work-order path, migration-declaration
  seeding) — stale trackers, not product gaps; counted as existing.

Pattern stated once: the product's promises outrun its surfaces in both directions —
the manual advertises what isn't implemented, and the trackers still claim gaps the
code has already closed.
