# WASC operation-system port source

> **Author's structural layer.** This README is the only authored connective text in this bundle. Everything under `artifacts/` is byte-verbatim (`cp`'d from the source repo) and every quote in `PROVENANCE.md` is verbatim from `claude-history`. Nothing in those two is paraphrased, synthesised, or cleaned up. Read the artifacts and provenance as primary source; read this file only for the map.

## What this bundle is

This is the **port's source-of-truth**: a durable, verbatim capture of the *operation system* of the WASC project (`/Users/david/Projects/wasc-school-wide-improvement-plan`) — the CLAUDE.md / mandates / north-star + the `.claude` harness (settings, hooks, slash command, agent, skills) + the distilled behavioral memory. It is the operation system ONLY; the WASC application code (the Django app under `school-improvement-plans/`, the prompt corpus, the data model) is deliberately NOT captured. A later port lifts the operation system into the current repo (`workflowsPiExtension`) and follows these files exactly.

Three layers, by trust:
- `artifacts/` — byte-verbatim copies (`cp`). Each cites its original absolute source path below.
- `PROVENANCE.md` — for each artifact, the verbatim originating user correction/genesis message mined from `claude-history`, with session id + ISO timestamp (+ write `message_uuid` where known). Items with no locatable origin are marked `VERBATIM ORIGIN NOT LOCATED` with what was searched — never invented.
- `README.md` (this file) — the author's thin index + one-line port dispositions.

## Bundle stats

- `artifacts/` total: 63 files, ~200,834 bytes. Byte integrity spot-checked with `cmp` against source (CLAUDE.md, hook, MEMORY.md — all identical).
- `artifacts/` (root): CLAUDE.md, MANDATES.md, NORTH-STAR.md.
- `artifacts/dot-claude/`: settings.json, settings.local.json; `hooks/` (2), `commands/` (1), `agents/` (1), `skills/` (3 skill dirs × 2 files).
- `artifacts/memory/`: 48 files — MEMORY.md (index) + 41 `feedback-*.md` + 6 `project-*.md`.

## Index — operation-system part → verbatim artifact → provenance → port disposition

Disposition vocabulary: **as-is** (lift unchanged, behavior is repo-agnostic) · **transpose-to-.context** (re-express against this repo's pi-context substrate + canonical pipeline rather than WASC's decomposed-JSON spine / Django gate) · **re-point** (lift the mechanism, but repath/retarget the WASC-specific paths, commands, or tenant before it runs here).

### Root operation docs

| Part | Artifact | Source path | Provenance | Port disposition |
|---|---|---|---|---|
| Project guidance / operating manual | `artifacts/CLAUDE.md` | `…/wasc-school-wide-improvement-plan/CLAUDE.md` | PROVENANCE §Root | **transpose-to-.context** — its canonical-pipeline + orchestrator-discipline core is the value; its decomposed-JSON spine, phase model, Django paths, and DEC/DISC vocabulary are WASC-specific and re-expressed against this repo's substrate. |
| The 9 binding mandates | `artifacts/MANDATES.md` | `…/MANDATES.md` | PROVENANCE §Root | **as-is** — the nine mandates are project-agnostic agent-conduct rules. |
| Single end-result statement | `artifacts/NORTH-STAR.md` | `…/NORTH-STAR.md` | PROVENANCE §Root | **re-point** — keep the "north star governs scope" pattern; the content is WASC product-specific and is replaced by this repo's own end-result statement. |

### .claude operation system

| Part | Artifact | Source path | Provenance | Port disposition |
|---|---|---|---|---|
| Hook wiring | `artifacts/dot-claude/settings.json` | `…/.claude/settings.json` | PROVENANCE §.claude | **re-point** — same PreToolUse(Bash) wiring shape; `$CLAUDE_PROJECT_DIR` paths to the two hooks carry over once the hooks are placed. |
| Permission allowlist | `artifacts/dot-claude/settings.local.json` | `…/.claude/settings.local.json` | PROVENANCE §.claude (NOT LOCATED — CC-managed) | **re-point** — Claude-Code-accumulated permissions; do not lift verbatim, regenerate for this repo's command surface. |
| One-Bash-per-turn guard | `artifacts/dot-claude/hooks/one-bash-per-turn.js` | `…/.claude/hooks/one-bash-per-turn.js` | PROVENANCE §.claude | **as-is** — transcript-based, repo-agnostic; deterministic block of multi-Bash turns. |
| Commit gate | `artifacts/dot-claude/hooks/gate-before-commit.sh` | `…/.claude/hooks/gate-before-commit.sh` | PROVENANCE §.claude | **re-point** — keep the deny-commit-unless-gate-green mechanism; swap the WASC gate (ruff/mypy/pytest/make test-js from `school-improvement-plans/`) for this repo's gate (`npm run check && npm test`). |
| Context-currency audit command | `artifacts/dot-claude/commands/audit-context-currency.md` | `…/.claude/commands/audit-context-currency.md` | PROVENANCE §.claude | **transpose-to-.context** — keep the read-only forensic-audit + watermark + notify-only-on-non-clean design; retarget its ground-truth from the decomposed-JSON spine to this repo's `.context` substrate. |
| Context-currency auditor agent | `artifacts/dot-claude/agents/context-currency-auditor.md` | `…/.claude/agents/context-currency-auditor.md` | PROVENANCE §.claude | **transpose-to-.context** — same forensic method (git + claude-history as evidence); retarget the records it diffs to this repo's substrate. |
| `validate-context` skill | `artifacts/dot-claude/skills/validate-context/` (SKILL.md + .sh) | `…/.claude/skills/validate-context/` | PROVENANCE §.claude (skill SKILL.md NOT LOCATED) | **as-is** — already a thin man-page over the `pi-context` PATH CLI (`context-validate` / `-relations`); this repo IS pi-context, so it applies directly (re-verify the documented current-state regression note). |
| `update-context` skill | `artifacts/dot-claude/skills/update-context/` (SKILL.md + .sh) | `…/.claude/skills/update-context/` | PROVENANCE §.claude | **transpose-to-.context** — the verify-don't-narrate / record-then-read-back discipline is the value; its surface is WASC's decomposed-JSON `state.mjs` spine, re-expressed against this repo's block-api substrate writes. |
| `run-prompt-workshop` skill | `artifacts/dot-claude/skills/run-prompt-workshop/` (SKILL.md + smoke.sh) | `…/.claude/skills/run-prompt-workshop/` | PROVENANCE §.claude | **re-point** — WASC-application-specific (14-spec Django prompt pipeline against the Chiway dev DB); included for completeness of the harness, but is the most application-coupled piece — port only if the workshop pipeline itself is ported. |

### Memory — behavioral mandates

| Part | Artifact | Source path | Provenance | Port disposition |
|---|---|---|---|---|
| Memory index | `artifacts/memory/MEMORY.md` | `…/.claude/projects/-Users-david-Projects-wasc-school-wide-improvement-plan/memory/MEMORY.md` | PROVENANCE §Memory (LLM-authored index) | **transpose-to-.context** — regenerate the index over whichever feedback files port. |
| 41 `feedback-*.md` | `artifacts/memory/feedback-*.md` | `…/memory/feedback-*.md` | PROVENANCE §Memory (per-file) | **as-is** — these are distilled cross-project agent-conduct corrections; the large majority are repo-agnostic and bind directly. A handful encode WASC-specific mechanics (e.g. `feedback-orchestrator-runs-shell-not-user`, `feedback-keep-json…` lineage) and want **re-point** at port time. |
| 6 `project-*.md` | `artifacts/memory/project-*.md` | `…/memory/project-*.md` | PROVENANCE §Memory (per-file) | **re-point** — project-scoped facts (dev-DB grants, catalogue gate, substrate-is-this-repo, edge direction, run-the-whole-project gate, no-resume-quiescent-agent); WASC-coupled, lift only the ones whose mechanism recurs here. |

## Expected-but-not-found / not-located (recorded, not invented)

- **No `user_*.md` or `reference_*.md`** in the source memory dir (the deliverable structure anticipated them). The dir holds only MEMORY.md + `feedback-*.md` + `project-*.md`. Recorded as absent.
- **One extra skill** beyond the deliverable's guess: `run-prompt-workshop` (captured).
- **6 `VERBATIM ORIGIN NOT LOCATED`** entries in PROVENANCE.md, each with reasoning: `settings.local.json` (Claude-Code-managed permissions, no genesis message), the `validate-context` SKILL.md (covered by the shared context-currency directive cluster, no validate-specific user message), and 3 orchestrator-derived memory files (`feedback-commit-message-via-tmp-file`, `project-dev-db-reset-restores-socrates-grants`, `project-task-depends-edge-direction`).
