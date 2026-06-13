#!/usr/bin/env bash
# PreToolUse(Bash) guard: present the PROVENANCE protocol + rhetorical-register requirements BEFORE
# any planning-block substrate write. A pi-context append/update/upsert-block-item targeting a
# planning block (tasks / decisions / features / framework-gaps / story / research / issues) is
# blocked and the protocol presented, until the writer reviews the payload against it and re-issues
# the SAME command with a trailing shell comment `# provenance-reviewed` (the CLI ignores it). The
# sentinel is a deliberate review checkpoint — it forces the protocol in front of the author at the
# write act, for inline AND @file payloads. Exit 2 => block, stderr fed back to the agent.
#
# Origin of the provenance half: a filing-time augmentation ("opt-in"/"marker-mode" on TASK-052 —
# never user-directed) laundered itself through verbatim composition into two explores, a plan, and
# an implementation before the user caught it. Self-attested register review alone did not stop it;
# the protocol below makes the provenance question explicit at every planning write.

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
[ -z "$cmd" ] && exit 0

# A pi-context WRITE (append/update/upsert) targeting a planning block?
if printf '%s' "$cmd" | grep -Eq '(append-block-item|update-block-item|upsert-block-item)' \
   && printf '%s' "$cmd" | grep -Eq -- '--block[[:space:]]+(framework-gaps|tasks|decisions|features|story|research|issues|conventions)|--arrayKey[[:space:]]+(gaps|tasks|decisions|features|stories|research|issues|rules)'; then
  # Already reviewed-and-acknowledged?
  if printf '%s' "$cmd" | grep -Eq 'provenance-reviewed'; then
    exit 0
  fi
  cat >&2 <<'MSG'
Blocked: a planning-block write. This is a USER-PERMISSION stop — do NOT re-issue in this same turn.

REQUIRED SEQUENCE:
  1. STOP. End your turn by presenting to the USER a per-element provenance table for the payload:
     element -> provenance class -> evidence (the user's verbatim words / the directing message / the cited fact, convention, or decision it derives from).
  2. The USER grants or refuses filing permission. Permission comes only from the user — never from your own review.
  3. Only after the user grants it, re-issue the SAME command with ` # provenance-reviewed` appended. The sentinel attests the USER's granted permission for this payload, nothing less.

PROVENANCE classes (mandate: no augmentation — filed text becomes verbatim downstream authority):
  P1. Every semantic element (each criterion, qualifier, mode, flag, scope word, default) is user-VERBATIM, user-DIRECTED, or DERIVABLE from a cited fact/convention/decision. Anything else is augmentation — STRIKE IT before presenting.
  P2. A qualifier that narrows or conditions what the user said (a mode, an opt-in, a flag, a tier, a deferral) is NEVER derivable — it is either the user's recorded decision (cite it) or it does not go in.
  P3. If the item advances or derives from user stories (task_advances_story / item_derived_from_item -> STORY-*): DIFF the payload against the stories' VERBATIM statements; present every delta with its citation.
  P4. Updates inherit the test for every element carried forward — inherited augmentation is still augmentation.

REGISTER (blocks are context atoms for verbatim downstream composition):
  R1. Declarative statements — not prose, not narration.
  R2. Terse, signal-dense — no perambulation, ceremony, recap, or hedging.
  R3. Self-contained — the literal context a consumer acts on, standing alone.
  R4. Exact and concrete — not opaque, not abstract.
  R5. CURRENT TRUTH ONLY — no provenance/git/process narration, no prior-state; never assert-then-refute.
  R6. Gaps carry description/evidence/impact/proposed_resolution — NO acceptance_criteria (tasks own the verifiable criteria).
MSG
  exit 2
fi
exit 0
