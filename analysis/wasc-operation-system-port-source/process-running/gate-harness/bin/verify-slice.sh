#!/usr/bin/env bash
# verify-slice.sh — the per-slice hard gate for the trio's dev loop (TASK-058).
#
# Invoked via `make verify-slice SLICE=<key>` from school-improvement-plans/.
# Its EXIT CODE is the SOLE verdict (acceptance criterion 6): 0 == this slice
# may land; nonzero == it may not. No prose parsing.
#
# Premise (RESOLVED MECHANISM): the slice branch starts from a GREEN main, so
# there are NO pre-existing real failures. Any genuine (reproducible) test or
# type failure is therefore THIS-slice-introduced and BLOCKS. The only
# NON-BLOCKING classes are:
#   - cosmetic/style (ruff format / ruff check --fix)  -> auto-fixed + warned
#   - language-register WARN (DEC-53)                  -> warned
#   - flaky (a test that FAILS then PASSES on a bounded re-run) -> warned
# Non-blocking items are emitted as structured warnings to stderr and kept
# OUT of the exit code.
#
# Slice behavioral-test selection convention (config-free; works with the
# existing --strict-markers pytest config since it uses -k, not a marker):
#   a slice's behavioral tests live in files named test_slice_<key>.py under
#   any app's tests/ dir, and are selected by `pytest -k "slice_<key>"`.
#
# Composition mirrors .claude/hooks/gate-before-commit.sh:29-38 and the
# Makefile `test` target — it REUSES those exact checks, it does not reinvent.

set -uo pipefail

SLICE="${SLICE:-}"
# Bounded re-run budget for flaky classification (a fail-then-pass within this
# many extra attempts is flaky, not a block).
FLAKY_RETRIES="${FLAKY_RETRIES:-2}"
# Scope: "full" (default; the production gate — runs every BLOCKING check) or
# "slice-only" (runs only the cosmetic-class + slice-behavioral-test
# classification). slice-only exists so the gate-first proof can assert the
# block/warn classification deterministically and cheaply against the SAME code
# paths the full target uses, without re-running the whole project gate per
# proof case. The production target (`make verify-slice`) always runs "full".
VERIFY_SLICE_SCOPE="${VERIFY_SLICE_SCOPE:-full}"

if [ -z "$SLICE" ]; then
  printf 'verify-slice: SLICE=<key> is required (e.g. make verify-slice SLICE=trio-orchestrator)\n' >&2
  exit 2
fi

# Run from the Django root regardless of caller cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SIP="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$SIP" || { printf 'verify-slice: cannot cd to %s\n' "$SIP" >&2; exit 2; }

OUT="$(mktemp)"
trap 'rm -f "$OUT"' EXIT

# --- structured stderr channels (non-blocking) ---------------------------
warn()  { printf 'verify-slice WARN  [%s]: %s\n' "$1" "$2" >&2; }
block() { printf 'verify-slice BLOCK [%s]: %s\n' "$1" "$2" >&2; }

# run_pytest <pytest-args...> : run pytest quietly and RETURN ITS EXIT CODE
# (0 == passed; nonzero == failed/collection-error; pytest exit 5 == no tests
# collected). Captures full output to $OUT for the caller to tail on a block
# and to inspect for the empty-selection case.
run_pytest() {
  uv run pytest -q "$@" >"$OUT" 2>&1
  return $?
}

# --- 1. cosmetic / style: auto-fix, never block (criterion 2) -------------
# ruff format and ruff check --fix mutate the tree to the canonical style;
# whether they CHANGED anything is reported as a warning, never an exit signal.
# Capture ONLY the exit code of --check (discard its stdout, which would
# otherwise contaminate a string compare): nonzero == files were unformatted.
if uv run ruff format --check . ../prompt-workshop/dispatch >/dev/null 2>&1; then
  fmt_dirty=0
else
  fmt_dirty=1
fi
uv run ruff format . ../prompt-workshop/dispatch >"$OUT" 2>&1
if [ "$fmt_dirty" = "1" ]; then
  warn cosmetic "ruff format reformatted files (style only; auto-fixed, not a block)"
fi

# ruff check: --fix the auto-fixable (cosmetic) lints, then re-check for any
# REMAINING (non-auto-fixable) lint. A remaining lint is a real code-quality
# failure and BLOCKS (the project gate runs `ruff check .` with no --fix).
uv run ruff check --fix . ../prompt-workshop/dispatch >"$OUT" 2>&1
if ! uv run ruff check . ../prompt-workshop/dispatch >"$OUT" 2>&1; then
  block ruff "ruff check still failing after --fix (non-cosmetic lint):"$'\n'"$(tail -8 "$OUT")"
  exit 1
fi

# --- 2. mypy: a type error is this-slice-introduced -> BLOCK (criterion 5) -
if [ "$VERIFY_SLICE_SCOPE" = "full" ]; then
  if ! uv run mypy . >"$OUT" 2>&1; then
    block mypy "mypy . failed (type error):"$'\n'"$(tail -8 "$OUT")"
    exit 1
  fi
fi

# --- 3. slice behavioral tests (criterion 1) -------------------------------
# An empty/zero-match SLICE selection is a configuration block, not a pass and
# not a "reproducible failure": modern pytest returns exit code 5 ("no tests
# collected") and prints "<N> deselected" for a zero-match -k — it never prints
# "no tests ran". Detect that exit code deterministically and BLOCK with the
# correct message, WITHOUT burning the flaky-retry budget on a typo'd key.
SLICE_K="slice_${SLICE}"
run_pytest -k "$SLICE_K"
slice_rc=$?
if [ "$slice_rc" -eq 5 ]; then
  block slice "no behavioral tests matched SLICE=${SLICE} (-k '$SLICE_K'; expected file test_slice_${SLICE}.py)"
  exit 1
fi
# A slice behavioral test is the slice's ACCEPTANCE CONTRACT and must be
# deterministic. Unlike the unrelated/full-suite flaky class (section 4, which
# warns per DEC-53), a fail — even a fail-then-pass on a bounded re-run — of the
# slice's OWN selection BLOCKS: an intermittent acceptance test is a broken,
# non-deterministic contract, not trivia. No flaky exemption here.
if [ "$slice_rc" -ne 0 ]; then
  block slice "slice behavioral tests (-k '$SLICE_K') failed (acceptance contract must be deterministic; no flaky exemption):"$'\n'"$(tail -10 "$OUT")"
  exit 1
fi

if [ "$VERIFY_SLICE_SCOPE" != "full" ]; then
  # slice-only scope: cosmetic-class + slice-behavioral classification done.
  printf 'verify-slice: SLICE=%s (scope=slice-only) — slice + cosmetic checks passed\n' "$SLICE" >&2
  exit 0
fi

# --- 4. full pytest suite (criterion 1; flaky-aware criterion 4) -----------
if ! run_pytest; then
  flaky=0
  for _ in $(seq 1 "$FLAKY_RETRIES"); do
    if run_pytest; then flaky=1; break; fi
  done
  if [ "$flaky" = "1" ]; then
    warn flaky "full pytest suite failed then passed on re-run (flaky; not a block)"
  else
    block pytest "full pytest suite reproducibly failed:"$'\n'"$(tail -12 "$OUT")"
    exit 1
  fi
fi

# --- 5. JS behavioral suite (criterion 1) ----------------------------------
if ! make test-js >"$OUT" 2>&1; then
  block test-js "make test-js failed:"$'\n'"$(tail -10 "$OUT")"
  exit 1
fi

# --- 6. context-validate: 0 error-severity issues (criterion 1; CTX-13) ----
# Parse the COMPACT --json envelope with jq on .output.issues[].severity — the
# validate-context skill's mandated approach. status=="invalid" or any
# error-severity issue is a block; warnings never block.
#
# POSITIVE-PRESENCE GUARD: context-validate on a cwd with NO substrate returns
# {"status":"clean","issues":[]} exit 0 — a false "clean" reported on nothing.
# Before trusting any verdict, assert the substrate was actually located at the
# cwd we validate against (the repo root one level up from $SIP, where
# .pi-context.json + .context/ live). If it is not there, BLOCK: context-
# soundness must never be reported on an absent/empty substrate.
CV_CWD="$SIP/.."
if [ ! -f "$CV_CWD/.pi-context.json" ] || [ ! -d "$CV_CWD/.context" ]; then
  block context-validate "no pi-context substrate found at $CV_CWD (.pi-context.json + .context/ expected) — cannot report context-soundness on nothing"
  exit 1
fi
cv_json="$(pi-context context-validate --cwd "$CV_CWD" --json 2>/dev/null)"
cv_errors="$(printf '%s' "$cv_json" | jq '[.output.issues[]|select(.severity=="error")]|length' 2>/dev/null)"
cv_status="$(printf '%s' "$cv_json" | jq -r '.output.status' 2>/dev/null)"
if [ -z "$cv_errors" ]; then
  block context-validate "could not parse context-validate --json envelope (pi-context on PATH?)"
  exit 1
fi
if [ "$cv_status" = "invalid" ] || [ "$cv_errors" != "0" ]; then
  block context-validate "context-validate reports status=$cv_status, $cv_errors error-severity issue(s)"
  exit 1
fi

# --- 7. language-register WARN (DEC-53): reported, never blocking -----------
# The register/wording posture is WARN-only by DEC-53 (process-blockers-vs-
# end-changeable-language). This gate does not run a register linter as a
# blocking step; if a future register check is wired in, it emits here via
# warn register "<message>" and stays out of the exit code.

# All BLOCKING checks passed. Non-blocking warnings (if any) were emitted to
# stderr above and did not affect this verdict.
printf 'verify-slice: SLICE=%s — all blocking checks passed (context-validate status=%s)\n' "$SLICE" "$cv_status" >&2
exit 0
