# Code methods for scored/ranked decomposition that avoid the wiki trap

## The wiki trap restated as anti-method

The wiki trap = synthesis becomes authoritative, original material gets paraphrased into the summary, contradictions smooth into prose, staleness reads as confident misinformation. Any decomposition that *paraphrases*, *replaces*, *rewrites*, or *resolves* source material is wiki-trap-shaped, regardless of how typed the output is.

So the methods below are constructed to make those operations structurally impossible — not just discouraged.

## Ten code methods

### 1. Reference-not-replace: source MDs remain canonical, immutable

Every atom carries `source: { path, anchor, span }` pointing into the analysis MD by file + section + line range. The MD is the *authority*; atoms are the *index*. The MD is never edited by decomposition. If you can't open the MD and find the cited span, the atom is malformed. This is the inverse of wiki-drift: synthesis cannot replace source if source is structurally upstream of synthesis.

### 2. Reversibility as the validity test

Given the set of atoms with `source.path == X`, regeneration must produce a synthesis-equivalent rendering of the relevant sections of X. If regeneration loses information, the decomposition is incomplete; the missing material stays as MD prose only. Lossiness is a fragility, not a fact-of-life. This is the operational definition of "well-formed decomposition."

### 3. Compositional extraction, not paraphrase

Atom content is *verbatim spans* from the MD, wrapped in typed metadata. A decision atom contains the decision sentence as written + typed slots (status, forcing-issue ref, score). The decomposer is a structural-classifier, not a writer. Bounds editorial license to zero. This is what schema-driven AJV validation is *for* — text fields hold quoted spans, not LLM-generated summaries.

### 4. Scoring lives on metadata, never bleeds into content

Confidence / freshness / relevance / provenance are typed metadata fields adjacent to the verbatim content. They never modify the content. They never appear in the MD. They are the *query layer*, not the *source layer*. Decomposition that writes its own confidence into the prose is wiki-shaped.

### 5. Schema-valid-or-fail (no best-effort)

Decomposition emits atoms that pass AJV against an existing block schema, or it doesn't emit. No "approximately matches" coercion. If the MD describes something with no schema home, two outcomes:
- Schema is missing → typed `framework-gap` atom emitted (mandate-007)
- Description doesn't belong as a typed atom → remains as MD prose, no atom at all

This makes "we extracted something but it's a bit off" structurally impossible.

### 6. Adversarial peer decomposition

Two independent decomposer agents (different priors, different tool surfaces, different models) emit atom-sets for the same MD. Set intersection → high-confidence atoms. Set difference → flagged for user adjudication. Set complement → ignored. Bounds at 2-3 peers (cost), no meta-validator. This is the same regress-termination from the curation arc, applied at decomposition time.

### 7. Append-only with status transitions, never overwrite

Re-running decomposition on the same MD never overwrites prior atoms. New runs produce new atoms with later timestamps; supersession is a typed `superseded_by` reference + status transition on the prior atom. This preserves the history of *how the decomposer's understanding evolved* — which is itself a substrate-level fact worth keeping.

### 8. Decomposition is itself a typed audit-trail-writing operation

The act of decomposing emits its own typed entry:

```
audit { agent, model, timestamp, source: <md-path>, 
        atoms_emitted: [<id>...], atoms_skipped: [{span, reason}...],
        schema_failures: [{span, schema, error}...],
        peer_agreement: <verdict-set> }
```

Now the *decomposition itself* is queryable. You can ask "what was decomposed when, by whom, with what skip-rate" — these are first-class facts. No invisible LLM judgment.

### 9. Empirical grounding bounds confidence ceilings

A decision atom's `confidence` is capped by whether its effect is observable (grep/test/git). A fragility atom's `confidence` is capped by whether it reproduces. A framework-gap atom's `confidence` is capped by whether the gap is reproducible in current code. The decomposer can't claim high confidence without grounding; high-confidence-without-grounding is structurally impossible.

### 10. Status starts at `proposed`, never auto-`enacted`

Decomposed atoms enter the substrate in `status: proposed`. They do not auto-validate. They require either:
- User adjudication (typed `adjudicate-atom` op)
- Empirical-grounding workflow that checks reality and transitions
- Adversarial peer agreement reaching threshold

This is the regress-termination at write time. The LLM emits synthesis → LLM decomposes synthesis → atoms enter as `proposed` → user/empirical/peer adjudicates. The loop terminates because the LLM cannot self-validate without the human or the empirical anchor.

## How these ten compose into a regeneration recipe

A workflow `decompose-analysis-md(path)`:

1. Reads MD, splits by section / heading anchor
2. For each section, two peer decomposer agents propose atoms (verbatim span + typed wrapper + score metadata)
3. Each proposed atom validated against AJV schemas
4. Schema-valid atoms with peer agreement → write to substrate as `status: proposed`
5. Schema-invalid spans → emit `framework-gap` atom with the failing schema name + span
6. Disagreement spans → emit `disputed` atom requiring user
7. Audit entry written tying everything to source path + session id
8. Reversibility check: regenerate MD-equivalent from emitted atoms; diff against source; emit `decomposition-incomplete` atom with missing-span list

The recipe is itself an atomic typed operation. Its inputs (MD path), behavior (peer extraction, schema validation, reversibility check), and outputs (atoms + audit + gaps) are all addressable. The synthesis MDs persist unmodified.

## Now: the scope question — monitors-only vs full audit

The framing is a false binary. Both options assume we already know which surfaces have the seed-trap shape. We don't. What we have is:

- One confirmed instance: `seedExamples()` for monitor JSON specs
- Suspected instances (from analysis): classifier YAMLs, classifier templates, shared workflow templates
- Other unknown surfaces

Both options skip the discovery operation that should run first. Mandate-004 + mandate-007 both apply: presenting "monitors-only" leaves an unknown number of identical traps unaddressed (negligent); presenting "full audit + alignment in one arc" overcommits before knowing the actual surface area.

The mandate-compliant path is the one the decomposition methods already prescribe: **make the scope decision data-driven by running the audit first**, where the audit *is* a typed-atom-emitting workflow with the same shape as the decomposition recipe.

### `audit-seed-sites` workflow

Same architectural shape as `decompose-analysis-md`:

1. Reads each `packages/<pkg>/` and finds candidate seed-shaped patterns (any code that copies bundled assets into user dirs at runtime, any extension that mutates `~/.pi/agent/` or `.pi/`)
2. For each site, classifies via peer agents:
   - **canonical-deviation**: write-on-first-run pattern that diverges from pi-mono multi-location resolution → emits `framework-gap` atom
   - **legitimate-scaffold**: user-data initialization (project blocks, workflow specs) that genuinely should run once → emits informational `audit` atom
   - **uncertain**: surface needs human review → emits `disputed` atom
3. Empirical grounding: each atom cross-references the actual filesystem behavior via observable trace
4. Output: typed inventory of every seed-shaped surface with classification + score + remediation hint
5. Audit-of-the-audit entry preserves provenance

The audit's output IS the scope decision. From the typed inventory, the user picks: align all canonical-deviations in one arc, or sequence them by package, or schedule each as its own commit. The data drives the choice; the choice isn't pre-baked into the question.

### Why this shape avoids the wiki trap at the scope-decision level

If we just answered "monitors-only vs full audit" without the audit step, we'd be doing exactly what Nate names: trusting an LLM's *synthesis* of the surface area instead of *checking the substrate*. The scope answer would be wiki-shaped (confident prose, possibly wrong, structurally unverifiable). Running the audit produces atomic typed inventory items the user can verify against actual code — empirical grounding, not LLM confidence.

## Convergence

The decomposition recipe and the seed-site audit are the same architectural pattern at different scopes:

|                         | scope                    | reads              | writes                                                  | scope-decision |
| ----------------------- | ------------------------ | ------------------ | ------------------------------------------------------- | -------------- |
| `decompose-analysis-md` | this conversation's MDs  | `analysis/*.md`    | typed atoms with provenance back to MD                  | per-MD         |
| `audit-seed-sites`      | the framework's surfaces | `packages/**/*.ts` | typed inventory atoms with provenance back to file:line | per-package    |

Both are **scored / ranked / typed / atomic / addressable / composable / audit-trail-emitting** workflows. Both are regeneration recipes. Both terminate the LLM-validates-LLM regress through empirical grounding + peer agreement + user-as-terminator + status-starts-at-proposed.

Neither has been authorized. The pattern is one architectural surface, instantiable at multiple scopes. The user-scope decisions remaining:

- Whether to land the architectural primitive (peer-decomposer + audit-trail-emitter + reversibility-check) before any specific instance
- Whether to instantiate it first against `analysis/2026-04-27-*.md` decomposition or against `audit-seed-sites`
- What block schemas need to land first to give the decomposer schema-valid-or-fail targets (likely `audit`, `framework-gap` already exists, `proposed-atom` lifecycle on relevant blocks)

The question becomes: not "monitors-only vs full audit," but **"land the audit primitive, then read the typed inventory it produces, then scope alignment work from data."** That's what mandate-007 prescribes when read together with the curation architecture: don't decide scope by guess; emit typed atoms; let the substrate determine the next move.