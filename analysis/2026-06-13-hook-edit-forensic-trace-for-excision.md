# Hook edit forensic trace for excision — TASK-060 `--cwd` scoping gate

Date: 2026-06-13
Files: `.claude/hooks/gap-register-guard.sh`, `.claude/hooks/block-pi-context-glue.sh` (both gitignored + untracked; no git history).
Source of record: Claude Code session history (`claude-history`), session `8490e49a-7509-477f-9cb5-92f16552090a`.
Scope: this report traces ONLY the TASK-060 work performed 2026-06-13 (the `--cwd` active-substrate scoping gate + its two fix rounds). All edits dated 2026-06-06 through 2026-06-10 predate this session's TASK-060 work and constitute the pre-session original against which excision is measured.

## Summary of what TASK-060 added (both files)

A single contiguous block inserted at the top of the trigger `if` body, before the existing block logic. It parses `--cwd` from the command, canonicalizes it against `$CLAUDE_PROJECT_DIR`, and `exit 0` (pass, no guard) when the resolved target is a directory OTHER than the project root. Three rounds:

- Round 1 (initial scoping gate) — string-compare prepend/strip gate. Timestamp 2026-06-13T09:51–09:52.
- Round 2 (canonicalization) — replaced string-compare with `cd … && pwd -P` canonicalization + null/empty fail-safes. Timestamp 2026-06-13T10:13.
- Round 2b/3 (extraction hardening) — added surrounding-quote-strip `case` + `--cwd` multiplicity guard. Timestamp 2026-06-13T10:46.

Net effect on disk after all three rounds is identical in both files (modulo file-specific comment wording and the trigger-condition line each block follows).

---

## FILE 1 — `.claude/hooks/gap-register-guard.sh`

### (a) Pre-session original (the TASK-060 baseline)

The state immediately before the first 2026-06-13 edit (after the 2026-06-10 register/provenance rewrites, op id 4741038). It has NO `--cwd` logic. The trigger `if` falls straight from its condition line into the sentinel check:

```
   && printf '%s' "$cmd" | grep -Eq -- '--block[[:space:]]+(framework-gaps|tasks|decisions|features|story|research|issues|conventions)|--arrayKey[[:space:]]+(gaps|tasks|decisions|features|stories|research|issues|rules)'; then
  # Already reviewed-and-acknowledged?
  if printf '%s' "$cmd" | grep -Eq 'provenance-reviewed'; then
    exit 0
  fi
  cat >&2 <<'MSG'
...
```

Seam to verify excision:
- Line BEFORE the inserted gate: the trigger condition line ending `...|rules)'; then`
- Line AFTER the inserted gate: `  # Already reviewed-and-acknowledged?`

### (b) Ordered edits (round / tool / verbatim old → new)

**Edit G1 — Round 1 (initial scoping gate).** op id 4742430, tool Edit, 2026-06-13T09:51:56Z, message `1efef1d8`.

old_string:
```
   && printf '%s' "$cmd" | grep -Eq -- '--block[[:space:]]+(framework-gaps|tasks|decisions|features|story|research|issues|conventions)|--arrayKey[[:space:]]+(gaps|tasks|decisions|features|stories|research|issues|rules)'; then
  # Already reviewed-and-acknowledged?
```

new_string:
```
   && printf '%s' "$cmd" | grep -Eq -- '--block[[:space:]]+(framework-gaps|tasks|decisions|features|story|research|issues|conventions)|--arrayKey[[:space:]]+(gaps|tasks|decisions|features|stories|research|issues|rules)'; then
  # Scope to the ACTIVE substrate: a write whose --cwd names a non-active substrate is outside the
  # convention this guard enforces (the active .pi-context.json lives at the project root). Pass it
  # through; only --cwd-absent or --cwd=<project-root> writes are guarded. (FGAP-089 / TASK-060)
  target_cwd="$CLAUDE_PROJECT_DIR"
  if printf '%s' "$cmd" | grep -Eq -- '--cwd[[:space:]]'; then
    target_cwd=$(printf '%s' "$cmd" | sed -E 's/.*--cwd[[:space:]]+([^[:space:]]+).*/\1/')
    case "$target_cwd" in
      /*) ;;
      *) target_cwd="$CLAUDE_PROJECT_DIR/$target_cwd" ;;
    esac
    target_cwd="${target_cwd%/}"
  fi
  if [ "$target_cwd" != "$CLAUDE_PROJECT_DIR" ]; then
    exit 0
  fi
  # Already reviewed-and-acknowledged?
```

**Edit G2 — Round 2 (canonicalization).** op id 4742463, tool Edit, 2026-06-13T10:13:32Z, message `1df80623`.

old_string:
```
  # Scope to the ACTIVE substrate: a write whose --cwd names a non-active substrate is outside the
  # convention this guard enforces (the active .pi-context.json lives at the project root). Pass it
  # through; only --cwd-absent or --cwd=<project-root> writes are guarded. (FGAP-089 / TASK-060)
  target_cwd="$CLAUDE_PROJECT_DIR"
  if printf '%s' "$cmd" | grep -Eq -- '--cwd[[:space:]]'; then
    target_cwd=$(printf '%s' "$cmd" | sed -E 's/.*--cwd[[:space:]]+([^[:space:]]+).*/\1/')
    case "$target_cwd" in
      /*) ;;
      *) target_cwd="$CLAUDE_PROJECT_DIR/$target_cwd" ;;
    esac
    target_cwd="${target_cwd%/}"
  fi
  if [ "$target_cwd" != "$CLAUDE_PROJECT_DIR" ]; then
    exit 0
  fi
```

new_string:
```
  # Scope to the ACTIVE substrate (FGAP-089 / TASK-060): only a write whose --cwd resolves to the
  # project root (where the active .pi-context.json lives) is guarded; a --cwd naming any other
  # directory is a different substrate and passes. Canonicalize both sides so . / ./ / trailing-slash
  # / .. / symlinks cannot smuggle an active write past the comparison.
  cwd_val=""
  if printf '%s' "$cmd" | grep -Eq -- '--cwd[[:space:]]'; then
    cwd_val=$(printf '%s' "$cmd" | sed -E 's/.*--cwd[[:space:]]+([^[:space:]]+).*/\1/')
    # No real value (next token is a flag) -> treat as absent (fail-safe to guard the active substrate)
    case "$cwd_val" in -*) cwd_val="" ;; esac
  fi
  if [ -n "$cwd_val" ]; then
    proj=$( (cd "$CLAUDE_PROJECT_DIR" 2>/dev/null && pwd -P) )
    tgt=$( (cd "$cwd_val" 2>/dev/null && pwd -P) )
    # Present + real --cwd that resolves somewhere OTHER than the project root -> non-active -> pass.
    # (A non-existent dir yields empty tgt, which is also != proj -> pass: not the active substrate.)
    if [ "$tgt" != "$proj" ]; then
      exit 0
    fi
  fi
  # Fall through (active substrate, or --cwd absent/flag-valued) to the existing block logic below.
```

**Edit G3 — Round 2b/3 (extraction hardening: quote-strip + multiplicity guard).** op id 4742777, tool Edit, 2026-06-13T10:46:25Z, message `fc5c4979`.

old_string:
```
    cwd_val=$(printf '%s' "$cmd" | sed -E 's/.*--cwd[[:space:]]+([^[:space:]]+).*/\1/')
    # No real value (next token is a flag) -> treat as absent (fail-safe to guard the active substrate)
    case "$cwd_val" in -*) cwd_val="" ;; esac
  fi
```

new_string:
```
    cwd_val=$(printf '%s' "$cmd" | sed -E 's/.*--cwd[[:space:]]+([^[:space:]]+).*/\1/')
    # No real value (next token is a flag) -> treat as absent (fail-safe to guard the active substrate)
    case "$cwd_val" in -*) cwd_val="" ;; esac
    # Strip one surrounding matched quote pair so a quoted active path can't dodge canonicalization
    case "$cwd_val" in
      \"*\") cwd_val="${cwd_val#\"}"; cwd_val="${cwd_val%\"}" ;;
      \'*\') cwd_val="${cwd_val#\'}"; cwd_val="${cwd_val%\'}" ;;
    esac
    # Ambiguous targeting (>1 --cwd) must never open the guard — treat as active
    cwd_count=$(printf '%s' "$cmd" | grep -o -- '--cwd' | wc -l | tr -d '[:space:]')
    if [ "$cwd_count" -gt 1 ]; then cwd_val=""; fi
  fi
```

### (c) Current on-disk added block to EXCISE

Lines 22–49 inclusive (the comment block through the fall-through comment), sitting between the trigger condition line (21) and the `# Already reviewed-and-acknowledged?` line (50). Verbatim:

```
  # Scope to the ACTIVE substrate (FGAP-089 / TASK-060): only a write whose --cwd resolves to the
  # project root (where the active .pi-context.json lives) is guarded; a --cwd naming any other
  # directory is a different substrate and passes. Canonicalize both sides so . / ./ / trailing-slash
  # / .. / symlinks cannot smuggle an active write past the comparison.
  cwd_val=""
  if printf '%s' "$cmd" | grep -Eq -- '--cwd[[:space:]]'; then
    cwd_val=$(printf '%s' "$cmd" | sed -E 's/.*--cwd[[:space:]]+([^[:space:]]+).*/\1/')
    # No real value (next token is a flag) -> treat as absent (fail-safe to guard the active substrate)
    case "$cwd_val" in -*) cwd_val="" ;; esac
    # Strip one surrounding matched quote pair so a quoted active path can't dodge canonicalization
    case "$cwd_val" in
      \"*\") cwd_val="${cwd_val#\"}"; cwd_val="${cwd_val%\"}" ;;
      \'*\') cwd_val="${cwd_val#\'}"; cwd_val="${cwd_val%\'}" ;;
    esac
    # Ambiguous targeting (>1 --cwd) must never open the guard — treat as active
    cwd_count=$(printf '%s' "$cmd" | grep -o -- '--cwd' | wc -l | tr -d '[:space:]')
    if [ "$cwd_count" -gt 1 ]; then cwd_val=""; fi
  fi
  if [ -n "$cwd_val" ]; then
    proj=$( (cd "$CLAUDE_PROJECT_DIR" 2>/dev/null && pwd -P) )
    tgt=$( (cd "$cwd_val" 2>/dev/null && pwd -P) )
    # Present + real --cwd that resolves somewhere OTHER than the project root -> non-active -> pass.
    # (A non-existent dir yields empty tgt, which is also != proj -> pass: not the active substrate.)
    if [ "$tgt" != "$proj" ]; then
      exit 0
    fi
  fi
  # Fall through (active substrate, or --cwd absent/flag-valued) to the existing block logic below.
```

### (d) Cross-check verdict — FILE 1

History matches disk. Applying G1 → G2 → G3 to the pre-session baseline yields exactly the current on-disk lines 22–49. The block is one contiguous insertion delimited cleanly by line 21 (trigger condition) above and line 50 (`# Already reviewed-and-acknowledged?`) below. No on-disk content outside this block differs from the pre-session baseline; no traced edit is missing from disk. NO DISCREPANCY.

---

## FILE 2 — `.claude/hooks/block-pi-context-glue.sh`

### (a) Pre-session original (the TASK-060 baseline)

The state immediately before the first 2026-06-13 edit (after the 2026-06-09 echo-narration additions, op id 4739998). It has NO `--cwd` logic. The trigger `if` falls straight from its condition line into the first glue check:

```
if printf '%s' "$cmd" | grep -Eq 'pi-context-cli/dist/bin\.js|(^|[;&|]| )pi-context '; then
  # ...piped into post-processing glue, or stderr silenced?
  if printf '%s' "$cmd" | grep -Eq '\|[[:space:]]*(grep|jq|sed|awk|head|tail|cut|tr|wc|node)([[:space:]]|$)|2>[[:space:]]*/dev/null'; then
...
```

Seam to verify excision:
- Line BEFORE the inserted gate: `if printf '%s' "$cmd" | grep -Eq 'pi-context-cli/dist/bin\.js|(^|[;&|]| )pi-context '; then`
- Line AFTER the inserted gate: `  # ...piped into post-processing glue, or stderr silenced?`

### (b) Ordered edits (round / tool / verbatim old → new)

**Edit B1 — Round 1 (initial scoping gate).** op id 4742431, tool Edit, 2026-06-13T09:52:07Z, message `bc3f5318`.

old_string:
```
if printf '%s' "$cmd" | grep -Eq 'pi-context-cli/dist/bin\.js|(^|[;&|]| )pi-context '; then
  # ...piped into post-processing glue, or stderr silenced?
```

new_string:
```
if printf '%s' "$cmd" | grep -Eq 'pi-context-cli/dist/bin\.js|(^|[;&|]| )pi-context '; then
  # Scope to the ACTIVE substrate: an invocation whose --cwd names a non-active substrate is outside
  # the direct-drive convention this guard enforces (the active .pi-context.json lives at the project
  # root). Pass it through; only --cwd-absent or --cwd=<project-root> invocations are guarded. (FGAP-089 / TASK-060)
  target_cwd="$CLAUDE_PROJECT_DIR"
  if printf '%s' "$cmd" | grep -Eq -- '--cwd[[:space:]]'; then
    target_cwd=$(printf '%s' "$cmd" | sed -E 's/.*--cwd[[:space:]]+([^[:space:]]+).*/\1/')
    case "$target_cwd" in
      /*) ;;
      *) target_cwd="$CLAUDE_PROJECT_DIR/$target_cwd" ;;
    esac
    target_cwd="${target_cwd%/}"
  fi
  if [ "$target_cwd" != "$CLAUDE_PROJECT_DIR" ]; then
    exit 0
  fi
  # ...piped into post-processing glue, or stderr silenced?
```

**Edit B2 — Round 2 (canonicalization).** op id 4742464, tool Edit, 2026-06-13T10:13:40Z, message `e480703e`.

old_string:
```
  # Scope to the ACTIVE substrate: an invocation whose --cwd names a non-active substrate is outside
  # the direct-drive convention this guard enforces (the active .pi-context.json lives at the project
  # root). Pass it through; only --cwd-absent or --cwd=<project-root> invocations are guarded. (FGAP-089 / TASK-060)
  target_cwd="$CLAUDE_PROJECT_DIR"
  if printf '%s' "$cmd" | grep -Eq -- '--cwd[[:space:]]'; then
    target_cwd=$(printf '%s' "$cmd" | sed -E 's/.*--cwd[[:space:]]+([^[:space:]]+).*/\1/')
    case "$target_cwd" in
      /*) ;;
      *) target_cwd="$CLAUDE_PROJECT_DIR/$target_cwd" ;;
    esac
    target_cwd="${target_cwd%/}"
  fi
  if [ "$target_cwd" != "$CLAUDE_PROJECT_DIR" ]; then
    exit 0
  fi
```

new_string:
```
  # Scope to the ACTIVE substrate (FGAP-089 / TASK-060): only a write whose --cwd resolves to the
  # project root (where the active .pi-context.json lives) is guarded; a --cwd naming any other
  # directory is a different substrate and passes. Canonicalize both sides so . / ./ / trailing-slash
  # / .. / symlinks cannot smuggle an active write past the comparison.
  cwd_val=""
  if printf '%s' "$cmd" | grep -Eq -- '--cwd[[:space:]]'; then
    cwd_val=$(printf '%s' "$cmd" | sed -E 's/.*--cwd[[:space:]]+([^[:space:]]+).*/\1/')
    # No real value (next token is a flag) -> treat as absent (fail-safe to guard the active substrate)
    case "$cwd_val" in -*) cwd_val="" ;; esac
  fi
  if [ -n "$cwd_val" ]; then
    proj=$( (cd "$CLAUDE_PROJECT_DIR" 2>/dev/null && pwd -P) )
    tgt=$( (cd "$cwd_val" 2>/dev/null && pwd -P) )
    # Present + real --cwd that resolves somewhere OTHER than the project root -> non-active -> pass.
    # (A non-existent dir yields empty tgt, which is also != proj -> pass: not the active substrate.)
    if [ "$tgt" != "$proj" ]; then
      exit 0
    fi
  fi
  # Fall through (active substrate, or --cwd absent/flag-valued) to the existing block logic below.
```

**Edit B3 — Round 2b/3 (extraction hardening: quote-strip + multiplicity guard).** op id 4742778, tool Edit, 2026-06-13T10:46:29Z, message `307fa43f`.

old_string:
```
    cwd_val=$(printf '%s' "$cmd" | sed -E 's/.*--cwd[[:space:]]+([^[:space:]]+).*/\1/')
    # No real value (next token is a flag) -> treat as absent (fail-safe to guard the active substrate)
    case "$cwd_val" in -*) cwd_val="" ;; esac
  fi
```

new_string:
```
    cwd_val=$(printf '%s' "$cmd" | sed -E 's/.*--cwd[[:space:]]+([^[:space:]]+).*/\1/')
    # No real value (next token is a flag) -> treat as absent (fail-safe to guard the active substrate)
    case "$cwd_val" in -*) cwd_val="" ;; esac
    # Strip one surrounding matched quote pair so a quoted active path can't dodge canonicalization
    case "$cwd_val" in
      \"*\") cwd_val="${cwd_val#\"}"; cwd_val="${cwd_val%\"}" ;;
      \'*\') cwd_val="${cwd_val#\'}"; cwd_val="${cwd_val%\'}" ;;
    esac
    # Ambiguous targeting (>1 --cwd) must never open the guard — treat as active
    cwd_count=$(printf '%s' "$cmd" | grep -o -- '--cwd' | wc -l | tr -d '[:space:]')
    if [ "$cwd_count" -gt 1 ]; then cwd_val=""; fi
  fi
```

### (c) Current on-disk added block to EXCISE

Lines 23–50 inclusive (the comment block through the fall-through comment), sitting between the trigger condition line (22) and the `# ...piped into post-processing glue, or stderr silenced?` line (51). Verbatim:

```
  # Scope to the ACTIVE substrate (FGAP-089 / TASK-060): only a write whose --cwd resolves to the
  # project root (where the active .pi-context.json lives) is guarded; a --cwd naming any other
  # directory is a different substrate and passes. Canonicalize both sides so . / ./ / trailing-slash
  # / .. / symlinks cannot smuggle an active write past the comparison.
  cwd_val=""
  if printf '%s' "$cmd" | grep -Eq -- '--cwd[[:space:]]'; then
    cwd_val=$(printf '%s' "$cmd" | sed -E 's/.*--cwd[[:space:]]+([^[:space:]]+).*/\1/')
    # No real value (next token is a flag) -> treat as absent (fail-safe to guard the active substrate)
    case "$cwd_val" in -*) cwd_val="" ;; esac
    # Strip one surrounding matched quote pair so a quoted active path can't dodge canonicalization
    case "$cwd_val" in
      \"*\") cwd_val="${cwd_val#\"}"; cwd_val="${cwd_val%\"}" ;;
      \'*\') cwd_val="${cwd_val#\'}"; cwd_val="${cwd_val%\'}" ;;
    esac
    # Ambiguous targeting (>1 --cwd) must never open the guard — treat as active
    cwd_count=$(printf '%s' "$cmd" | grep -o -- '--cwd' | wc -l | tr -d '[:space:]')
    if [ "$cwd_count" -gt 1 ]; then cwd_val=""; fi
  fi
  if [ -n "$cwd_val" ]; then
    proj=$( (cd "$CLAUDE_PROJECT_DIR" 2>/dev/null && pwd -P) )
    tgt=$( (cd "$cwd_val" 2>/dev/null && pwd -P) )
    # Present + real --cwd that resolves somewhere OTHER than the project root -> non-active -> pass.
    # (A non-existent dir yields empty tgt, which is also != proj -> pass: not the active substrate.)
    if [ "$tgt" != "$proj" ]; then
      exit 0
    fi
  fi
  # Fall through (active substrate, or --cwd absent/flag-valued) to the existing block logic below.
```

### (d) Cross-check verdict — FILE 2

History matches disk. Applying B1 → B2 → B3 to the pre-session baseline yields exactly the current on-disk lines 23–50. The block is one contiguous insertion delimited cleanly by line 22 (trigger condition) above and line 51 (the first glue-check comment) below. The inserted block in FILE 2 is byte-identical to the inserted block in FILE 1 (the comment text, the parse, the canonicalization, the quote-strip, the multiplicity guard, the fall-through comment) — only the surrounding trigger condition and the following comment differ between files. No on-disk content outside the block differs from the pre-session baseline; no traced edit is missing from disk. NO DISCREPANCY.

---

## EXCISION RECIPE

The TASK-060 addition is, in each file, a single contiguous block whose first line is `  # Scope to the ACTIVE substrate (FGAP-089 / TASK-060): only a write whose --cwd resolves to the` and whose last line is `  # Fall through (active substrate, or --cwd absent/flag-valued) to the existing block logic below.`. Excision = delete that block in full, leaving the trigger condition line directly followed by the line that preceded the gate pre-session.

### `gap-register-guard.sh`
Delete current lines 22–49 inclusive (28 lines: the 4-line scope comment through the fall-through comment). Resulting structure — line 21 followed immediately by what is now line 50:
```
   && printf '%s' "$cmd" | grep -Eq -- '--block[[:space:]]+(framework-gaps|tasks|decisions|features|story|research|issues|conventions)|--arrayKey[[:space:]]+(gaps|tasks|decisions|features|stories|research|issues|rules)'; then
  # Already reviewed-and-acknowledged?
  if printf '%s' "$cmd" | grep -Eq 'provenance-reviewed'; then
```

### `block-pi-context-glue.sh`
Delete current lines 23–50 inclusive (28 lines: the 4-line scope comment through the fall-through comment). Resulting structure — line 22 followed immediately by what is now line 51:
```
if printf '%s' "$cmd" | grep -Eq 'pi-context-cli/dist/bin\.js|(^|[;&|]| )pi-context '; then
  # ...piped into post-processing glue, or stderr silenced?
  if printf '%s' "$cmd" | grep -Eq '\|[[:space:]]*(grep|jq|sed|awk|head|tail|cut|tr|wc|node)([[:space:]]|$)|2>[[:space:]]*/dev/null'; then
```

After excision both files return exactly to their respective pre-TASK-060 baselines (FILE 1 = the 2026-06-10 provenance/register guard; FILE 2 = the 2026-06-09 four-check direct-drive guard), with `$CLAUDE_PROJECT_DIR` no longer referenced anywhere in either file.
