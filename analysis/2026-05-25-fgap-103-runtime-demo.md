# FGAP-103 runtime demo + adversarial (2026-05-25)

DEC-0018 gate for TASK-075 (one DRY element-read primitive; route every JSON read surface through it; subsumes FGAP-101). pi 0.75.4; model haiku; extension loaded via `--no-extensions --extension dist/index.js`.

## Static gates
- build/check/test all exit 0; 4 pkgs 0-fail. New unit tests pass: read-element (serializeForRead paging, truncation, pageArray shared-math, addressInto id/key/path/miss) + index.test FGAP-103 (read-config registry/id addressing; list-tools compact-default + name-detail).
- read-element.ts PURE (only import: truncateHead). Zero inline `[Truncated:` in index.ts; zero `truncateHead` in index.ts (all via serializeForRead — 23 call sites). One `discoverArrayKey` + one `pageArray` + one `addressInto` (no parallel paging/walker). readBlockItem→addressInto, readBlockPage→pageArray.

## Runtime demo (credentialed, end-to-end with FGAP-090 routing)
Prompt: "What relation_types does this project's config declare? Read exactly the relation_types registry and nothing else."
Result: the agent called `read-config` with `{"registry":"relation_types"}` (the new element-addressing param) and received ONLY that registry — relation_type names present (decision_supersedes_decision, task_positioned_in_phase, verification_verifies_item), no whole-config bloat. /tmp/fgap103-demo.log. Confirms the loop: FGAP-090 orientation routes the agent to read-config → it uses element addressing → gets the element, not a read-all-or-nothing blob.
Footer correctly ABSENT (the relation_types registry is < 50KB / single page → serializeForRead emits no footer; the structured footer path is covered deterministically by read-element.test.ts paging+truncation cases).

## Adversarial (orchestrator re-grep, not the probe's word)
- 23 serializeForRead sites; 0 `truncateHead`/`[Truncated:` left in index.ts → routing complete, no parallel serialize path.
- list-tools default = compact index (name·param-count·one-line); `name` → one full descriptor (FGAP-101 index→detail closed).
- addressInto shared (index.ts read-config + context-sdk readBlockItem); pageArray shared (readBlockPage). No duplicate paging/addressing math.

## Verdict
PASS. One DRY element-read primitive; every JSON read surface routed through it; element addressing works end-to-end; FGAP-101 subsumed. FGAP-089: the prose `[Truncated]` note is eliminated repo-wide in the read surface, replaced by a greppable structured footer (`[read-element: …total…hasMore…]`) + the ReadEnvelope carries truncated/total/hasMore — remainder = expose those as structured tool-result fields if the in-text footer proves insufficient.
