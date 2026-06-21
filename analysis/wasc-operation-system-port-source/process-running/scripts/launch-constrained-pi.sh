#!/usr/bin/env bash
# launch-constrained-pi.sh — launch an interactive pi session whose agent tool surface is
# WHOLLY constrained to the canonical 5-extension surface (pi-context, pi-workflows,
# pi-behavior-monitors, pi-agent-dispatch as registered extensions; pi-jit-agents as a
# library consumed directly by the other consumers per narrowed DEC-0044).
#
# Per DEC-0014 the harness-confined orchestrator's positive clause is substrate-write +
# call-agent + author-agent-spec + run-real-checks + commit-attested + author-tool-grant +
# run-work-order-loop + declared composites; the negative clause forbids bash/edit/write.
# Per user directive 2026-05-29 the positive clause also includes pi's built-in read-only
# file-system tools (read / ls / grep / find) as Bucket-1 default-grant (no auth prompt).
# Per DEC-0047 capability widening goes through writer.kind=human via author-tool-grant.
# Per FEAT-006 the run-work-order-loop tool closes the end-to-end loop; per FEAT-010 the
# bounded-composite vocabulary is read from the target dir's config.tool_operations[].
#
# Per FGAP-134 (closed 2026-05-29) the pi-agent-dispatch extension factory registers a
# pi.on('tool_call') auth-gate handler. The 14 Bucket-2 sensitive tools below require an
# affirmative ctx.ui.confirm in interactive sessions, and are refused unconditionally in
# non-interactive contexts (ctx.hasUI=false). The gate operates at the pi-dispatch boundary
# regardless of caller-supplied writer.kind field values — the writer.kind spoof closed at
# the dispatch layer rather than at each tool's execute() body. Operators launching this
# script will see confirm prompts the first time any of these tools is invoked per session:
#   - author-agent-spec / author-tool-grant / commit-attested        (pi-agent-dispatch)
#   - write-schema / amend-config / write-block / rename-canonical-id
#   - context-init / context-accept-all                              (pi-context)
#   - workflow-execute / workflow-resume / workflow-init             (pi-workflows)
#   - monitors-control / monitors-rules                              (pi-behavior-monitors)
# Non-Bucket-2 tools (read-block, call-agent, run-real-checks, composites, bash, ...) pass
# through without prompting.
#
# Run from the target dir, e.g.:
#   cd /Users/david/Projects/may-22-2026 && /path/to/repo/scripts/launch-constrained-pi.sh
#
# Optional flags:
#   --grant <canonical_id>   — scope the dynamic composite surface to a subset of declared
#                              tool_operations[]. May be repeated. Default (no --grant) is
#                              all declared composites.
#
# Passthrough flags (anything not matching --grant is forwarded to pi via the ARGS catch-all):
#   --continue / -c          — pi's canonical resume-last-session flag, honored as
#                              first-class behavior of this script. pi's session manager
#                              resolves the most-recent session for the current working
#                              directory and resumes it; when none exists a new session
#                              begins. Note that pi does NOT persist per-session --tools
#                              restrictions: the allowlist this script composes (static
#                              SKILL.md-derived surface ∪ built-in read-only ∪ per-target
#                              composites, optionally scoped by --grant) must be re-derived
#                              and re-passed on every invocation, including resumes, to
#                              preserve the orchestrator's constrained tool surface across
#                              session continuations. Accordingly all pre-flight steps —
#                              `pi install -l <meta-package>`, composite discovery from
#                              the target's config.tool_operations[], --tools allowlist
#                              derivation, and the 4-extension symmetry verification —
#                              run unconditionally on every launch (resume or fresh).
#   <any other pi flag>      — likewise passed through unchanged.
#
# Presumes the repo is already built (pi loads extensions from dist/). Does:
#   1. pi install -l <meta-package>   — registers the 4 extensions into the target dir's .pi/
#   2. derive static --tools from SKILL.md + per-target composites from config.tool_operations[]
#   3. exec pi --tools <union> "$@"   — interactive session restricted to the composed surface
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
META="$REPO/packages/pi-project-workflows"
TARGET_CWD="$(pwd)"

# Pre-flight pointer check — composites + substrate ops require a bootstrapped substrate.
if [ ! -f "$TARGET_CWD/.pi-context.json" ]; then
	echo "launch-constrained-pi: WARNING — no .pi-context.json pointer in $TARGET_CWD; composites will be empty + substrate ops unavailable. Run /context init <substrate-dir> first OR proceed with limited capability." >&2
fi

# Parse --grant flags out before passing the remainder to pi
GRANTS=()
ARGS=()
while [ $# -gt 0 ]; do
	case "$1" in
		--grant) GRANTS+=("$2"); shift 2 ;;
		*) ARGS+=("$1"); shift ;;
	esac
done

pi install -l "$META"

# Derive the static --tools list from EVERY package's own generated SKILL.md (repo-absolute —
# the script runs from a target dir, so the glob must be $REPO-rooted, not cwd-relative).
# pi-context self-surfaces its skill via resources_discover (not the meta bundle), so we
# must read each package's own skills/ rather than the meta-bundled copies. sort -u dedups
# the meta's own + bundled copies; the meta's own SKILL.md has no <tool name=> tags.
TOOLS="$(grep -rhoE '<tool name="[a-z0-9-]+"' "$REPO"/packages/*/skills/*/SKILL.md \
  | sed -E 's/<tool name="//; s/"//' | sort -u | paste -sd, -)"

if [ -z "$TOOLS" ]; then
	echo "launch-constrained-pi: no tools derived from $REPO/packages/*/skills/*/SKILL.md — is the repo built + skills generated?" >&2
	exit 1
fi

# Bucket-1 default-grant: pi built-in read-only file-system tools (per user directive 2026-05-29).
# These pass through the FGAP-134 auth-gate as non-Bucket-2 tokens (no confirm prompt).
TOOLS="$TOOLS,read,ls,grep,find"

# Per-target composite discovery via the canonical helper (DEC-0019/0020 dual-surface).
# Run from $REPO so tsx resolves @davidorex/* + @earendil-works/* against the repo's
# node_modules; helper operates on the target via --cwd.
COMPOSITES_JSON="$(cd "$REPO" && npx tsx "$REPO/scripts/orchestrator/read-config-operations.ts" --cwd "$TARGET_CWD" --format json 2>/dev/null || echo '[]')"
COMPOSITES="$(echo "$COMPOSITES_JSON" | python3 -c 'import sys,json
try:
    print(",".join(json.load(sys.stdin)))
except Exception:
    pass' 2>/dev/null || echo '')"

# --grant <id> filters to the named subset; default (no --grant) keeps all declared.
if [ ${#GRANTS[@]} -gt 0 ]; then
	SELECTED="$(printf '%s\n' "${GRANTS[@]}" | tr '\n' ',' | sed 's/,$//')"
	COMPOSITES="$SELECTED"
fi

if [ -n "$COMPOSITES" ]; then
	TOOLS="$TOOLS,$COMPOSITES"
fi

# 4-extension symmetry verification — surfaces silently-absent extensions early.
SKILL_COUNT="$(ls "$REPO"/packages/*/skills/*/SKILL.md 2>/dev/null | wc -l | tr -d ' ')"
if [ "$SKILL_COUNT" -lt 4 ]; then
	echo "launch-constrained-pi: WARNING — only $SKILL_COUNT SKILL.md files found across packages; expected >= 4. Some extensions may be silently absent. Run 'npm run skills' from repo root." >&2
fi

exec pi --tools "$TOOLS" "${ARGS[@]+"${ARGS[@]}"}"
