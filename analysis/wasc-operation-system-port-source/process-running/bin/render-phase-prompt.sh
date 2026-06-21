#!/usr/bin/env bash
#
# render-phase-prompt.sh — deterministic prompt renderer for per-phase
# IMPL and AUDIT subagent invocations.
#
# Usage:
#   bin/render-phase-prompt.sh impl  <phase_number> [impl_commit_hash]
#   bin/render-phase-prompt.sh audit <phase_number> [impl_commit_hash]
#
# Output:
#   tmp/phase-<NN>-impl-prompt.md
#   tmp/phase-<NN>-audit-prompt.md
#
# Inputs:
#   - templates/{impl-static,audit-static,begin-block}.md
#   - MANDATES.md
#   - phases/phase-<NN>-<slug>.md
#   - impl_commit_hash for AUDIT mode (3rd arg, or derived from current HEAD)
#
# Behavior: cat + sed substitution. No judgment. No LLM. Deterministic.

set -euo pipefail

mode="${1:-}"
phase_number="${2:-}"
impl_commit_arg="${3:-}"

if [[ -z "$mode" || -z "$phase_number" ]]; then
    echo "usage: $0 {impl|audit} <phase_number> [impl_commit_hash]" >&2
    echo "       phase_number is two-digit zero-padded, e.g. 00, 01, 14" >&2
    exit 64
fi

if [[ "$mode" != "impl" && "$mode" != "audit" ]]; then
    echo "error: mode must be 'impl' or 'audit'; got: $mode" >&2
    exit 64
fi

if [[ ! "$phase_number" =~ ^[0-9]{2}$ ]]; then
    echo "error: phase_number must be two-digit zero-padded, e.g. 00, 01, 14; got: $phase_number" >&2
    exit 64
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
django_project_root="${repo_root}/school-improvement-plans"

templates_dir="${repo_root}/templates"
phases_dir="${repo_root}/phases"
tmp_dir="${repo_root}/tmp"
mandates_file="${repo_root}/MANDATES.md"

mkdir -p "${tmp_dir}"

phase_md=$(ls "${phases_dir}/phase-${phase_number}-"*.md 2>/dev/null | head -1 || true)
if [[ -z "$phase_md" ]]; then
    echo "error: no phase file found matching ${phases_dir}/phase-${phase_number}-*.md" >&2
    exit 65
fi
phase_slug=$(basename "$phase_md" .md | sed "s/^phase-${phase_number}-//")

for required in \
    "${mandates_file}" \
    "${templates_dir}/impl-static.md" \
    "${templates_dir}/audit-static.md" \
    "${templates_dir}/begin-block.md"
do
    if [[ ! -f "$required" ]]; then
        echo "error: required input missing: $required" >&2
        exit 66
    fi
done

if [[ "$mode" = "audit" ]]; then
    if [[ -n "$impl_commit_arg" ]]; then
        impl_commit_hash="$impl_commit_arg"
    else
        impl_commit_hash=$(git -C "${repo_root}" log -1 --format=%H 2>/dev/null || echo "UNKNOWN")
    fi
else
    impl_commit_hash=""
fi

substitute() {
    sed \
        -e "s|{{phase_number}}|${phase_number}|g" \
        -e "s|{{phase_slug}}|${phase_slug}|g" \
        -e "s|{{repo_root}}|${repo_root}|g" \
        -e "s|{{django_project_root}}|${django_project_root}|g" \
        -e "s|{{impl_commit_hash}}|${impl_commit_hash}|g"
}

inline_mandates() {
    awk -v mfile="${mandates_file}" '
        /\{\{mandates_inlined\}\}/ {
            while ((getline line < mfile) > 0) print line
            close(mfile)
            next
        }
        { print }
    '
}

case "$mode" in
    impl)
        out="${tmp_dir}/phase-${phase_number}-impl-prompt.md"
        {
            substitute < "${templates_dir}/impl-static.md" | inline_mandates
            echo
            echo '<phase_content>'
            cat "$phase_md"
            echo '</phase_content>'
            echo
            cat "${templates_dir}/begin-block.md"
        } > "$out"
        ;;

    audit)
        out="${tmp_dir}/phase-${phase_number}-audit-prompt.md"
        impl_prompt="${tmp_dir}/phase-${phase_number}-impl-prompt.md"
        if [[ ! -f "$impl_prompt" ]]; then
            echo "error: audit mode requires prior-rendered IMPL prompt at: $impl_prompt" >&2
            echo "       run: $0 impl ${phase_number}" >&2
            exit 68
        fi
        {
            substitute < "${templates_dir}/audit-static.md" | inline_mandates
            echo
            echo '<impl_prompt_verbatim>'
            cat "$impl_prompt"
            echo '</impl_prompt_verbatim>'
            echo
            cat "${templates_dir}/begin-block.md"
        } > "$out"
        ;;
esac

bytes=$(wc -c < "$out" | tr -d ' ')
lines=$(wc -l < "$out" | tr -d ' ')

echo "rendered: $out" >&2
echo "  mode:           $mode" >&2
echo "  phase:          ${phase_number} (${phase_slug})" >&2
echo "  bytes:          ${bytes}" >&2
echo "  lines:          ${lines}" >&2
if [[ "$mode" = "audit" ]]; then
    echo "  impl_commit:    ${impl_commit_hash}" >&2
fi

echo "$out"
