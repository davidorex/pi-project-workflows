# POC G — auto-extract with AJV-gate

Schema-strict variant of pi-memctx's auto-learn. Empirically demonstrates that
session-derived candidate items can be gated by AJV against per-block JSON
Schemas, producing accept/reject verdicts with rich diagnostics for rejections.

## What this proves

1. A classifier (LLM in production, stub here) emits typed candidate objects
   tagged with their `target_block`.
2. An AJV-backed gate validates each candidate's payload against the JSON
   Schema for its target block.
3. Accepted candidates are eligible for downstream block-write surface;
   rejected candidates carry diagnostics naming the violated field/keyword.
4. The gate stage is a fixed downstream component independent of how the
   classifier was implemented — swapping the stub for a real LLM call leaves
   `render.ts` unchanged.

## Files

| Path | Purpose |
|------|---------|
| `README.md` | this file |
| `schemas/decisions.schema.json` | AJV target schema for `DEC-*` candidates (required: id, title, status; id pattern `^DEC-\d{3,4}$`) |
| `schemas/issues.schema.json` | AJV target schema for `issue-*` candidates (required: id, title, status, body; id pattern `^issue-\d{3}$`) |
| `data/session.jsonl` | synthetic 5-turn session with 1 valid decision + 1 valid issue + 1 malformed candidate |
| `classifier.ts` | stub classifier — reads session.jsonl, emits 3 hardcoded candidate objects (no LLM call) |
| `render.ts` | builds AJV schema registry, runs gate, writes report |
| `output/extract-result.md` | accept/reject report with per-rejection diagnostics |

## How to run

```bash
cd analysis/poc/pi-context-poc/G-auto-extract-ajv-gate
npx tsx render.ts
```

The classifier stub can also be inspected standalone:

```bash
npx tsx classifier.ts
```

## Expected results

- Stdout reports `2 ACCEPTED, 1 REJECTED`.
- `output/extract-result.md` contains:
  - Accepted: `DEC-0099` → decisions, `issue-091` → issues
  - Rejected: `issue-XYZ` → issues — diagnostic names BOTH the missing
    required `body` field AND the `id` pattern violation (AJV runs with
    `allErrors:true`).

## Verification

```bash
# 1. Run exits 0
npx tsx render.ts; echo "exit=$?"

# 2. ACCEPTED count == 2
grep -c "ACCEPTED" output/extract-result.md

# 3. REJECTED count == 1
grep -c "REJECTED" output/extract-result.md

# 4. Rejected candidate's diagnostic names the missing required field
grep -i "body" output/extract-result.md | grep -i "required"
```

## Scope boundaries

- AJV is the single third-party dep allowed for this POC, resolved via
  standard Node module resolution from the monorepo's existing install
  (`node_modules/ajv@8.18.0`). No new install added.
- Classifier is a stub — production would replace it with an LLM call
  constrained by a phantom-tool schema. The AJV gate stage is unchanged.
- No `packages/` or `.project/` files are touched. POC is self-contained.
- No commit/push by the POC implementation; outputs live under `output/`.
- Out of scope: write-side block append, idempotency over re-runs, multi-pass
  classifier disambiguation. POC G isolates the AJV-gate stage only.

## Relationship to other POCs

POC G's schema-strict gate is orthogonal to POC B (content-hash skip-detection),
POC C (token budget), POC D (coverage-rank), POC E (relation-type registry),
POC F (cascade fail-stop), and POC H (producer-vs-observer status). POC G
demonstrates the WRITE-side gate; POC D demonstrates the READ-side ranker.
Both are downstream of the classifier output stream in a complete pi-context
implementation.
