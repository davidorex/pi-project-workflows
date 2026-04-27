# Canonical pi-mono loader pattern replaces seedExamples()

Date: 2026-04-27
Status: planning context, awaiting user scope decision
Trigger: monitor false-positive fix at commit `affe992` did not propagate from the bundled `examples/` to already-seeded `.pi/monitors/` because `seedExamples()` short-circuits on existing files (`feedback_seed_examples_does_not_overwrite`).

## Source grounding

Read 2026-04-27 from `/Users/david/Projects/pi-mono/packages/coding-agent/docs/`:

- `skills.md` — skill loader resolves from a fixed location list, no copying
- `prompt-templates.md` — prompt-template loader same shape
- `extensions.md` — extension loader same shape
- `providers.md` — API-key resolution same shape (CLI > auth.json > env > models.json)

## Canonical pi-mono heuristic

**Multi-location loader with fixed precedence; no copying.** Pi-mono uses this same shape for every bundled-content surface.

| Surface | Locations resolved (in precedence order) |
|---|---|
| Skills | `~/.pi/agent/skills/`, `~/.agents/skills/`, `.pi/skills/`, `.agents/skills/` (and ancestors), packages via `pi.skills` in package.json, `skills` settings array, `--skill <path>` |
| Prompt templates | `~/.pi/agent/prompts/`, `.pi/prompts/`, packages via `pi.prompts`, `prompts` settings, `--prompt-template <path>` |
| Extensions | `~/.pi/agent/extensions/`, `.pi/extensions/`, `pi -e` |
| API keys | `--api-key` flag, `auth.json`, env var, `models.json` `apiKey` |

### Invariants

1. **Packages contribute via `package.json` `pi.<x>` entries or filesystem subdirectories** — they do not copy bundled content into user directories at first-run.
2. **Discovery, not duplication.** The loader resolves; the user's directory contains only what the user puts there.
3. **Name collisions warn + first-wins by precedence.** Explicit conflict semantics.
4. **`--no-<x>` opt-out is explicit; `--<x> <path>` is additive.** Composability lives at the loader, not in persistent state.
5. **Settings arrays are additive sources.** Third-party content registers without modifying user dirs.

### Why `seedExamples()` is the deviation

`seedExamples()` violates invariant 2 (duplicates instead of resolving) and invariant 1 (writes to user dirs from the package). The fragility — bundled fix at `affe992` not propagating — is the inevitable consequence: copying creates two sources of truth, drift is structural. Same anti-pattern that DEC-0003 eliminated for `normalizeToolChoice` at the consumer-vs-boundary axis: parallel ungated paths drift.

## Canonical action

**Replace `seedExamples()` with a multi-location monitor loader following pi-mono's exact precedence shape.**

Resolution order (matching skills/prompts):

1. `--monitor <path>` (CLI, repeatable, additive)
2. `monitors` settings array entries
3. `~/.pi/agent/monitors/` (global user override)
4. `.pi/monitors/` (project override)
5. Packages: `package.json` `pi.monitors` entries OR `monitors/` subdirectory in extension packages
6. `--no-monitors` disables 3-5 (1-2 still load)

Pi-behavior-monitors declares its bundled monitors via `pi.monitors: ["./examples"]` in its package.json (or registers them via the extension API at activate time). Package-bundled monitors are first-class loadable resources at their package location — never copied. User overrides are placed in user/project dirs by the user; framework never writes there.

Name collision rule: warn at startup, first-wins by precedence (matches pi-mono skills behavior).

### Why this is the canonical fix, not a parallel ungated path

It is the exact loader shape pi-mono itself uses for every bundled-content surface. We are not inventing a new pattern; we are removing a deviation and rejoining the framework's shape. DEC-0003's "boundary canonicality" principle plus pi-mono's "discovery, not duplication" pattern converge on this single answer.

## Filtered options (rejected)

- **Hash-manifest reconciliation** — parallel-ungated-path mitigation, preserves the broken process. Rejected by invariant 2 and `feedback_no_parallel_ungated_paths`.
- **`/monitor materialize` command** — convenience scaffold that re-creates the same divergence intentionally; templates have no equivalent in pi-mono. Rejected by invariant 1.
- **Version-bump-to-invalidate-seed** — does not address root; user dirs remain authoritative copies. Rejected by invariant 2.
- **Documentation-only** — leaves fragility. Rejected by mandate-004.

## Discovered-issue scope (mandate-007)

The canonical fix applies to **framework-bundled overridable content**, not to user-data scaffolds. The distinction matters:

### Apply canonical pattern (overridable framework content)

- pi-behavior-monitors `seedExamples()` for monitor JSON specs (immediate trigger)
- pi-behavior-monitors monitor templates (`.md` Nunjucks files in `examples/<monitor>/`)
- pi-behavior-monitors classifier agent YAMLs (`agents/*-classifier.agent.yaml`)
- pi-workflows shared templates (`templates/shared/macros.md` and friends) if currently seeded — verify
- Any other seed sites discovered during audit

### Do NOT apply (user data, legitimately scaffolded once)

- pi-project blocks (`.project/*.json`) — these are the user's data, not overrides
- pi-workflows workflow specs (`.workflows/*.workflow.yaml`) — user-authored
- pi-project user schemas — user-customizable; scaffold-once is correct because schemas evolve with the project

Audit confirms which seed sites are which. Audit is part of the work, not deferrable.

## Legacy seeded files

Pi-mono's collision rule applies cleanly: at startup, scan `~/.pi/agent/monitors/` and `.pi/monitors/`; for each entry, if a same-name monitor exists in the package layer, log a warning ("override resolved from `.pi/monitors/foo.json`; package version is newer — delete to receive updates"). First-wins by precedence; user keeps their override; warning surfaces drift. This is exactly how pi-mono handles skill name collisions.

## Migration plan (no scope reduction)

1. **pi-behavior-monitors loader** — replace `seedExamples()` with multi-location loader matching pi-mono shape
2. **package.json contribution** — declare `pi.monitors: ["./examples"]` (or register via extension API)
3. **Settings schema** — add `monitors: string[]` to settings.json schema
4. **CLI flag** — add `--monitor <path>` and `--no-monitors`
5. **Collision warning** — startup scan + warning for stale seeds in user dirs
6. **Audit** the rest of the bundled-content surfaces in this monorepo against the canonical pattern; align each that's overridable framework content
7. **Document** the canonical pattern in CLAUDE.md as a framework principle (not a one-off fix)

## Immediate vs durable

- **Immediate (user action, in progress)**: edit `.pi/monitors/fragility.monitor.json` and `.pi/monitors/hedge.monitor.json` to set `event: agent_end`. Unblocks today's monitor false-positive symptom.
- **Durable (this plan)**: the loader replacement above. Prevents the next instance of bundled-vs-seeded drift, across all overridable framework surfaces.

## Open scope decisions

User decides:

- Monitors-only first as proof, or full audit + alignment in one arc
- Whether to land package.json `pi.monitors` contribution mechanism or extension-API registration (both are precedented in pi-mono; package.json is the lighter surface)
- Whether to introduce a `framework-gaps` entry covering the multi-package alignment, or treat as a single arc under FEAT-001's umbrella

## Cross-references

- `feedback_seed_examples_does_not_overwrite.md` — captured fragility this addresses
- `feedback_no_parallel_ungated_paths.md` — invariant violated by `seedExamples()`
- `feedback_normalizer_at_dispatch_boundary.md` — DEC-0003 precedent for boundary-canonicality
- `analysis/2026-04-25-pi-bypass-arc-fragilities.md` — fragility catalog (entry should be added once enacted)
- `/Users/david/Projects/pi-mono/packages/coding-agent/docs/skills.md` — canonical loader source
- `/Users/david/Projects/pi-mono/packages/coding-agent/docs/prompt-templates.md` — canonical loader source
- `/Users/david/Projects/pi-mono/packages/coding-agent/docs/extensions.md` — canonical loader source
