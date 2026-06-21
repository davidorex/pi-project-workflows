#!/usr/bin/env bash
# Fast, backend-free smoke for the prompt-workshop dispatch pipeline.
# Confirms the pipeline boots Django against the dev DB, renders the corpus,
# and that snippet<->.workshopping render-parity holds 14/14 — WITHOUT calling
# the LLM backend (so it runs in ~30s, no network). The full 14-spec run that
# DOES call the backend is run_workflow.mjs (see SKILL.md "Full run").
#
# Usage:  bash .claude/skills/run-prompt-workshop/smoke.sh
# Exit 0 = pipeline launches + renders + parity 14/14. Nonzero = broken.
set -euo pipefail

# Resolve repo root from this script's location (skill dir is <repo>/.claude/skills/run-prompt-workshop/).
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SKILL_DIR/../../.." && pwd)"
DJ="$REPO/school-improvement-plans"          # uv project root; dispatch is ../prompt-workshop from here
: "${DATABASE_URL:=postgres://postgres:postgres@localhost:5433/school_improvement_plans}"
export DATABASE_URL

cd "$DJ"

echo "== 1/2 render-parity (snippet == .workshopping substrate, all 14 specs) =="
uv run python ../prompt-workshop/dispatch/verify-render-parity.py   # prints GATE: 14/14, exit 0 on pass

echo "== 2/2 single-spec render (boots Django + grounding + Django template) =="
uv run python ../prompt-workshop/dispatch/render_from_substrate.py --spec-key narrative-draft \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); p=d.get("rendered_prompt") or d.get("prompt",""); assert d.get("spec_key")=="narrative-draft" and len(p)>1000, "render too short / wrong spec"; print("render OK:", d.get("spec_key"), "->", len(p), "chars")'

echo "SMOKE OK"
