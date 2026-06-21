#!/usr/bin/env bash
# Fast, read-only smoke for this repo's active .context pi-context substrate,
# via the `pi-context` PATH CLI:
#   1. context-validate           — cross-block referential gate; asserts 0 errors (warnings allowed).
#   2. context-validate-relations — substrate-relations gate; asserts status "clean".
#   3. context-current-state      — reported, not gated.
# Error detection parses the structured --json envelope (.output.status / the
# .output.issues[] severity field) with jq, so it is independent of output formatting.
#
# Usage:  bash .claude/skills/validate-context/validate-context.sh
# Exit 0 = 0 referential errors AND relations clean. Nonzero only on a real error.
set -uo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SKILL_DIR/../../.." && pwd)"
cd "$REPO"

rc=0

echo "== 1/3 context-validate (cross-block referential integrity) =="
validate_json="$(pi-context context-validate --cwd . --json)"
status="$(printf '%s' "$validate_json" | jq -r '.output.status')"
errors="$(printf '%s' "$validate_json" | jq '[.output.issues[]|select(.severity=="error")]|length')"
warnings="$(printf '%s' "$validate_json" | jq '[.output.issues[]|select(.severity=="warning")]|length')"
echo "context-validate: status=$status errors=$errors warnings=$warnings"
if [ "$status" = "invalid" ] || [ "$errors" -ne 0 ]; then
  echo "FAIL: context-validate reported $errors error(s):"
  printf '%s' "$validate_json" | jq -r '.output.issues[]|select(.severity=="error")|"  \(.code) \(.field): \(.message)"'
  rc=1
fi

echo
echo "== 2/3 context-validate-relations (substrate relations) =="
relations_json="$(pi-context context-validate-relations --cwd . --json)"
rel_status="$(printf '%s' "$relations_json" | jq -r '.output.status')"
echo "context-validate-relations: status=$rel_status"
if [ "$rel_status" != "clean" ]; then
  echo "FAIL: relations not clean:"
  printf '%s' "$relations_json" | jq '.output.issues'
  rc=1
fi

echo
echo "== 3/3 context-current-state (reported, NOT gated) =="
state_json="$(pi-context context-current-state --cwd . --json)"
printf '%s' "$state_json" | jq -r '.output.focus // .output.data.focus // .output // "?"' | sed 's/^/context-current-state focus: /'

echo
if [ "$rc" -eq 0 ]; then
  echo "SMOKE OK: substrate validates clean (status=$status, 0 errors, $warnings warning(s) allowed; relations clean)."
else
  echo "SMOKE FAIL: a real validate error stands (see above)."
fi
exit "$rc"
