# Documentation Coherence Assessment — READMEs vs Skills (2026-06-13)

> Persisted for later decomposition + evaluation. Source: a full read of every package README and SKILL.md plus the root README. Findings are documentation-drift gaps (none functional). Decompose into FGAP/TASK filings under the docs-surface-sync arc after user evaluation.

---

## Coherence & Cohesion: READMEs vs Skills

**The documents are broadly coherent.** Each package's README and SKILL.md cover the same ground at different levels — READMEs are human-oriented entry points; SKILL.md files are in-pi machine references. The root README accurately reflects all package READMEs. Cross-references between packages (e.g., pi-workflows → pi-context dependency, pi-agent-dispatch → pi-jit-agents library relationship) are consistent everywhere.

Package coverage:

| Package | README quality | SKILL.md quality | Alignment |
|---|---|---|---|
| pi-context | Very thorough | Very thorough (805 lines) | Strong |
| pi-workflows | Thorough | Thorough (359 lines) | Strong |
| pi-behavior-monitors | Moderate | Extremely thorough (714 lines) | SKILL far more detailed; README is a brief overview |
| pi-agent-dispatch | Concise | Concise | Strong |
| pi-context-cli | Very thorough | None (not an extension) | Correct by design |
| pi-jit-agents | Concise | None (library, not extension) | Correct by design |
| pi-project-workflows | Minimal (meta-package) | Minimal | Correct by design |

---

## Documentation Gaps Found

### 1. Stale `.project/` references (2 locations)

**Root README**, "For LLMs" section:
> `.project/` contains this project's own block data

The active substrate is `.context`, not `.project/`. This is a stale reference from before the `.project` → `.context` rename.

**pi-agent-dispatch README**, `run-work-order-loop` parameter description:
> loads from .project/work-orders.json schema

Same — should be substrate-relative, not `.project/`-hardcoded.

**pi-agent-dispatch SKILL.md**, same tool entry:
> loads from .project/work-orders.json schema

Same stale reference.

### 2. Missing `accept-all` in pi-context README Getting Started

The pi-context README Getting Started code block shows:
```
/context init <substrate-dir>
/context install
/context check-status
/context update [--dryRun]
```

`/context accept-all` is missing between `init` and `install`. The text below explains accept-all in prose, but the Getting Started block itself implies you can go init → install directly, which won't work (a skeleton config has empty `installed_schemas`/`installed_blocks`). The root README's Quick Start **does** correctly show init → accept-all → install → check-status, so the two READMEs disagree on the bootstrap sequence.

### 3. pi-behavior-monitors README is underweight relative to its SKILL.md

The SKILL.md is a 714-line comprehensive reference covering every aspect of monitor creation, runtime behavior, bundled monitors, prompt templates, and creating-monitors workflow. The README is a ~70-line overview. This isn't a contradiction — just an asymmetry: someone reading only the README would not know that the SKILL.md has a complete step-by-step monitor-creation guide with a worked example and detailed field tables. The README says "Ask the LLM to read the `pi-behavior-monitors` skill for the full schema and examples" but doesn't signal what's IN that skill.

### 4. No pi-jit-agents SKILL.md (by design, but no pointer to its location)

pi-jit-agents is a library, not an extension — it correctly has no SKILL.md. But other documents that reference its concepts (grant clamping, `bundledTemplateDir()`, `CANONICAL_MACRO_NAMES`, `compileAgent`, `executeAgent`) point at the pi-jit-agents README. This is fine — the README is the documentation surface for a library package — but there's no central index telling a reader "pi-jit-agents concepts are in its README, not in a skill."

### 5. Root README "Architecture" section references `.project/` blocks

Same issue as gap #1 — the Architecture section's LLM guidance references `.project/` as the substrate directory. This section was written before the `.project` → `.context` rename and wasn't updated.

### 6. pi-project-workflows meta-package describes 3 extensions but ships 4

The pi-project-workflows SKILL.md and README both say "re-exports all three extensions" (pi-context, pi-workflows, pi-behavior-monitors) but actually re-exports four — pi-agent-dispatch is missing from that count. The included_extensions XML block in the SKILL.md DOES list pi-agent-dispatch, so the error is only in the prose description, not the actual extension registration. The SKILL.md description says:
> Meta-package re-exporting pi-context (schema-driven project state), pi-workflows (workflow orchestration), and pi-behavior-monitors (autonomous behavior monitoring). Install once to get all three extensions.

Should say "four extensions."

### 7. pi-context SKILL.md tool-entries don't replicate install-sequence guidance

The `<context_init>` section correctly says "Populate the substrate next with `/context accept-all` followed by `/context install`." But the individual tool entries for `context-init` and `context-accept-all` in `<tools_reference>` are bare parameter tables — they don't carry the onward-path guidance. An agent that reads only the tool entry for `context-init` could miss the accept-all prerequisite.

---

## Summary

The documentation is **coherent overall** — no contradictions between READMEs and skills, no package claiming capabilities another package actually owns, no conflicting terminology. The gaps are:

- **3 stale `.project/` references** across root README, pi-agent-dispatch README, and pi-agent-dispatch SKILL.md
- **1 missing bootstrap step** in pi-context README Getting Started (accept-all)
- **1 undercount** in pi-project-workflows prose (says "three" but ships four)
- **1 asymmetry** where pi-behavior-monitors README is brief while its SKILL.md is a full reference
- **1 structural pointer gap** (pi-jit-agents has no skill, which is correct, but no signpost explaining that)

None of these are functional — the system works. They're documentation drift from a rapidly-evolving codebase, concentrated in the substrate-directory rename (`.project` → `.context`) and the recent addition of pi-agent-dispatch as a fourth extension.

---

## Notes for decomposition (added at persistence; not part of the source assessment)

- SKILL.md files are generated artifacts (`npm run skills` from `skill-narrative.md` + op strings) — fixes to gaps #6 and #7 edit the SKILL **source** (`skill-narrative.md` / `included_extensions` source / op `description`+`promptSnippet` in `ops-registry.ts`), never SKILL.md by hand; then regen.
- READMEs are hand-authored — gaps #1/#2/#5 edit the README files directly.
- Several gaps cluster by root cause (the `.project` → `.context` rename: #1 + #5; the pi-agent-dispatch fourth-extension addition: #6, and the `.project` half of #1) — per `gap-explore-surfaces-class`, decompose by root-cause class, not by symptom location, when filing.
- The fixes are usage-doc corrections → docs-surface-sync (README + SKILL source + op strings); the correction framing belongs in CHANGELOG `[Unreleased]`, the READMEs/SKILLs carry only current truth.
