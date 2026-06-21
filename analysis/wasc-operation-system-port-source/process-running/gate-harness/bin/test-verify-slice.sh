#!/usr/bin/env bash
# test-verify-slice.sh — GATE-FIRST PROOF for the per-slice hard gate (TASK-058).
#
# Exercises bin/verify-slice.sh against a transient FIXTURE slice and asserts
# the block/warn two-class behavior the gate's acceptance criteria require:
#   (a) a deliberately-FAILING slice behavioral test -> gate exits NONZERO
#   (b) after FIXING that test                       -> gate exits 0
#   (c) a cosmetic/style issue alone (test passing)  -> gate exits 0 + WARN
#   (d) an empty/typo SLICE (zero -k match)          -> gate BLOCKS with the
#       "no behavioral tests matched SLICE=" message, NOT a "reproducibly
#       failed" message (pytest exit 5; F1)
#   (e) a flaky slice behavioral test (fail-then-pass on re-run) -> gate
#       BLOCKS: an acceptance contract must be deterministic, so the slice
#       selection gets no flaky exemption (F3)
#
# Runs the REAL bin/verify-slice.sh in VERIFY_SLICE_SCOPE=slice-only so the
# proof exercises the SAME cosmetic-class + slice-behavioral classification
# code paths the production target uses, without re-running the whole project
# gate per case. This script's own exit code is the proof verdict: 0 == all
# three assertions held.
#
# Self-cleaning: writes the fixture test to planner/tests/test_slice_<key>.py,
# always removes it (and restores it after the cosmetic mutation), even on
# failure, via a trap.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SIP="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$SIP" || { printf 'proof: cannot cd to %s\n' "$SIP" >&2; exit 2; }

# A PROOF-ONLY transient key, deliberately distinct from the committed fixture
# slice (verifyslicefixture) so this script's cleanup trap never deletes a
# tracked file. This file is written and removed within the proof run only.
KEY="verifysliceprooftransient"
FIXTURE="planner/tests/test_slice_${KEY}.py"

cleanup() { rm -f "$FIXTURE"; }
trap cleanup EXIT

fail() { printf 'PROOF FAIL: %s\n' "$1" >&2; exit 1; }

run_gate() {
  # Run the real gate, slice-only scope, suppress its own stderr noise into a
  # capture so we can assert on warnings; return its exit code.
  VERIFY_SLICE_SCOPE=slice-only SLICE="$KEY" bash bin/verify-slice.sh >"$GATE_OUT" 2>&1
  return $?
}

GATE_OUT="$(mktemp)"
trap 'cleanup; rm -f "$GATE_OUT"' EXIT

# --- (a) deliberately-failing behavioral test -> NONZERO -------------------
# NOTE: a literal `assert False` would trip ruff B011 and block on the RUFF
# step (the wrong reason), masking the slice-test path. Fail at RUNTIME via a
# value comparison that ruff cannot prove false statically, so the gate's
# slice-behavioral-test step is the thing that catches it.
cat >"$FIXTURE" <<'PY'
def test_slice_fixture_intentionally_fails():
    # Deliberate RUNTIME failure for the verify-slice gate-first proof (case a).
    produced = 1 + 1
    expected = 3
    assert produced == expected, "intentional fixture failure"
PY
run_gate
rc_a=$?
[ "$rc_a" -ne 0 ] || fail "(a) failing behavioral test did NOT make the gate exit nonzero (got $rc_a)"
printf 'PROOF (a) OK: failing slice test -> gate exit %s (nonzero)\n' "$rc_a" >&2

# --- (b) fixed test -> 0 ---------------------------------------------------
cat >"$FIXTURE" <<'PY'
def test_slice_fixture_now_passes():
    # Fixed (case b): the gate must now pass on this slice.
    assert True
PY
run_gate
rc_b=$?
[ "$rc_b" -eq 0 ] || { cat "$GATE_OUT" >&2; fail "(b) fixed behavioral test did NOT make the gate exit 0 (got $rc_b)"; }
printf 'PROOF (b) OK: fixed slice test -> gate exit 0\n' >&2

# --- (c) cosmetic/style issue alone (test passes) -> 0 + WARN --------------
# Badly-formatted but functionally-passing test: extra spaces / no blank lines
# that `ruff format` will rewrite. The gate must auto-fix, WARN, and still
# exit 0 (cosmetic is never a block).
cat >"$FIXTURE" <<'PY'
def test_slice_fixture_cosmetic():
    x   =   1
    assert x == 1
PY
run_gate
rc_c=$?
[ "$rc_c" -eq 0 ] || { cat "$GATE_OUT" >&2; fail "(c) cosmetic-only issue made the gate exit nonzero (got $rc_c)"; }
grep -q "WARN  \[cosmetic\]" "$GATE_OUT" || { cat "$GATE_OUT" >&2; fail "(c) cosmetic issue did not emit a [cosmetic] WARN"; }
printf 'PROOF (c) OK: cosmetic-only issue -> gate exit 0 + [cosmetic] WARN\n' >&2

# --- (d) empty/typo SLICE (zero -k match) -> BLOCK, correct message (F1) ----
# Run the gate against a key with NO matching test_slice_<key>.py file at all.
# pytest returns exit 5 ("no tests collected") for the zero-match -k; the gate
# must BLOCK with the "no behavioral tests matched SLICE=" message and must NOT
# fall through to the "reproducibly failed" branch (the pre-fix behavior) nor
# burn the flaky-retry budget.
EMPTY_KEY="verifyslicenosuchkeytransient"
VERIFY_SLICE_SCOPE=slice-only SLICE="$EMPTY_KEY" bash bin/verify-slice.sh >"$GATE_OUT" 2>&1
rc_d=$?
[ "$rc_d" -ne 0 ] || { cat "$GATE_OUT" >&2; fail "(d) empty/typo SLICE did NOT block (got $rc_d)"; }
grep -q "no behavioral tests matched SLICE=${EMPTY_KEY}" "$GATE_OUT" \
  || { cat "$GATE_OUT" >&2; fail "(d) empty SLICE blocked, but not with the 'no behavioral tests matched SLICE=' message"; }
grep -q "reproducibly failed" "$GATE_OUT" \
  && { cat "$GATE_OUT" >&2; fail "(d) empty SLICE wrongly fell through to the 'reproducibly failed' branch"; }
printf 'PROOF (d) OK: empty/typo SLICE -> BLOCK "no behavioral tests matched SLICE=%s"\n' "$EMPTY_KEY" >&2

# --- (e) flaky slice behavioral test -> BLOCK (F3) -------------------------
# A slice test that FAILS on the first run then PASSES on re-run. The unrelated/
# full-suite flaky class warns (DEC-53), but a flaky SLICE acceptance test must
# BLOCK. Drive the fail-then-pass via a persistent counter file that the test
# increments+checks: process-1 (first run) fails, process-2 (the gate's bounded
# re-run, were one to occur) would pass. The gate must NOT re-run/exempt it.
FLAKE_STATE="$(mktemp)"
rm -f "$FLAKE_STATE"   # absent on first read == first attempt
cat >"$FIXTURE" <<PY
import os

_STATE = "${FLAKE_STATE}"


def test_slice_fixture_is_flaky():
    # Fail on the FIRST invocation, pass on every subsequent one — the classic
    # fail-then-pass flaky shape. A flaky SLICE acceptance test must BLOCK.
    first = not os.path.exists(_STATE)
    with open(_STATE, "w") as fh:
        fh.write("seen")
    assert not first, "intermittent slice acceptance failure (must block, not warn)"
PY
VERIFY_SLICE_SCOPE=slice-only SLICE="$KEY" bash bin/verify-slice.sh >"$GATE_OUT" 2>&1
rc_e=$?
rm -f "$FLAKE_STATE"
[ "$rc_e" -ne 0 ] || { cat "$GATE_OUT" >&2; fail "(e) flaky SLICE behavioral test did NOT block (got $rc_e) — slice tests must be deterministic"; }
grep -q "WARN  \[flaky\]" "$GATE_OUT" \
  && { cat "$GATE_OUT" >&2; fail "(e) flaky SLICE test was warn-exempted as flaky; it must BLOCK"; }
printf 'PROOF (e) OK: flaky slice behavioral test -> BLOCK (no flaky exemption)\n' >&2

printf 'PROOF GREEN: all five block/warn assertions held.\n' >&2
exit 0
