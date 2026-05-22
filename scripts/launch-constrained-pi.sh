#!/usr/bin/env bash
# launch-constrained-pi.sh — launch an interactive pi session whose agent tool surface is
# WHOLLY constrained to the tools our extensions expose (no pi builtins, no other extensions).
#
# Run from the target dir, e.g.:
#   cd /Users/david/Projects/may-22-2026 && /path/to/repo/scripts/launch-constrained-pi.sh
#
# Presumes the repo is already built (pi loads extensions from dist/). Does two things:
#   1. pi install -l <meta-package>   — registers all three extensions into the cwd's .pi/
#   2. pi --tools <our tools>         — interactive session restricted to exactly our tools
# The --tools list is derived from the generated SKILL.md (not hardcoded) so it tracks the
# current tool set. Extra args ("$@") pass through to pi (e.g. an initial prompt or --model).
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
META="$REPO/packages/pi-project-workflows"

pi install -l "$META"

TOOLS="$(grep -rhoE '<tool name="[a-z0-9-]+"' "$META"/skills/*/SKILL.md \
  | sed -E 's/<tool name="//; s/"//' | sort -u | paste -sd, -)"

if [ -z "$TOOLS" ]; then
	echo "launch-constrained-pi: no tools derived from $META/skills/*/SKILL.md — is the repo built + skills generated?" >&2
	exit 1
fi

exec pi --tools "$TOOLS" "$@"
