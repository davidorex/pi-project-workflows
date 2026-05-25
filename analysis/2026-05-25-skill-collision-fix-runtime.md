# Skill-collision fix — runtime verification (TASK-077, 2026-05-25)

Two-part fix: (1) `generate-skills.js` stops bundling pi-context into the meta-package (it self-surfaces via resources_discover, FGAP-090) + clean-rebuilds the meta skills dir (idempotent); (2) `launch-constrained-pi.sh` derives `--tools` from every package's OWN skills (`"$REPO"/packages/*/skills/*/SKILL.md`, repo-absolute) instead of the meta-bundled copies.

## Static
- Derivation: `"$REPO"/packages/*/skills/*/SKILL.md` → 54 tools incl context-status/read-block/write-schema/read-config/list-tools/append-block-item (pi-context restored). `bash -n` clean. build/check/test green. generate-skills idempotent (2× run → only the 2 orphan deletions, no churn).

## Runtime — real load path (`launch-constrained-pi.sh` from a scratch cwd)
1. `-p "noop"`: EXIT 0, **no `[Skill conflicts]` / collision warning** (was the reported warning before the fix).
2. `-p "call the context-status tool"`: **context-status executed** in the constrained session (tool_execution_start+end, toolName=context-status) and returned the status JSON — i.e. pi-context tools are in the `--tools` allowlist + loaded + functional. No collision.

## Verdict
PASS. Collision eliminated AND the constrained session retains the full pi-context tool surface. The user's launch path is fixed end-to-end.
