# Substrate-filing precedents — tool-use archaeology

Investigation timestamp: 2026-05-13T21:53Z (commenced) / 2026-05-14 (per session date)
Repo HEAD: 93a997ff3b3b02738e68172883c398be7fb735f7 (branch `pi-context-rebuild`)
Sessions queried: 38 / Date range: 2026-03-13T08:08:37Z to live (current)
Database: claude-history SQLite via MCP `execute_sql` (read-only)

Scope: every Bash tool_executions row in sessions whose `project_path LIKE '%workflowsPiExtension%'` that touches `.project/*.json`.

## Q1: Tool-invocation patterns observed

All counts derive from `tool_executions` joined to `messages`/`sessions` filtered to this project. Counts below exclude `--dry-run` and `--show-schema` variants (those exercise the script without writing).

| Pattern | n | Earliest | Latest | Verbatim command shape (typed in subsequent rows) |
|---|---|---|---|---|
| `tsx -e` + block-api named imports (`appendToBlock` / `upsertItemInBlock` / `updateItemInBlock`) | 49 (success only) / 66 (incl. failures) | 2026-04-04T07:42:36Z | 2026-05-13T11:15:59Z | A1 |
| `scripts/orchestrator/file-block-item.ts --writer ... --item @/tmp/X.json` (canonical script) | 38 (success only) / 40 (incl. failures) | 2026-05-10T22:25:45Z | 2026-05-13T21:48:51Z | A2 |
| `pi -p "call append-block-item ..."` (Pi tool dispatch) | 8 | 2026-04-06T02:35:58Z | 2026-04-25T02:22:01Z | A3 |
| `Edit` tool on `.project/*.json` (forbidden per F-006 / DEC-0016 — enumerated, not endorsed) | 153 | 2026-03-16T09:49:08Z | 2026-05-13T21:41:51Z | A4 |
| `Write` tool on `.project/*.json` | 27 | 2026-03-16T09:50:23Z | 2026-04-18T01:13:21Z | A5 |
| `pi -p` other forms (no append-block-item) | 1 substrate-relevant | 2026-04-26T02:00:06Z | 2026-04-26T02:00:06Z | (commit-message text that contained `.project/`; not a write) |

### A1 — tsx-eval block-api (verbatim from session b62c055d, 2026-05-11T21:52:23Z, msg_uuid via tool_executions)

```
npx tsx -e "
import {updateItemInBlock} from '@davidorex/pi-context/block-api';
import type {DispatchContext} from '@davidorex/pi-context/dispatch-context';
const ctx: DispatchContext = { writer: { kind: 'human', user: 'davidryan@gmail.com' } };
updateItemInBlock(process.cwd(), 'tasks', 'tasks', (t) => t.id === 'TASK-021', {
  status: 'in-progress',
  notes: 'FGAP-026 phase 1.2 ...'
  ...
```

Earlier shape (session 214961af, 2026-04-04T07:42:36Z) used the pre-rename package name `@davidorex/pi-project/block-api` and `identifier` instead of `user` (schema migrated):

```
npx tsx -e '
import { appendToBlock } from "@davidorex/pi-project/block-api";
appendToBlock(".", "issues", "issues", {
  id: "issue-066",
  title: "workflow executor crashes with `name.replace is not a function` on any agent dispatch",
  ...
```

### A2 — orchestrator script file-block-item.ts (verbatim from session b62c055d, 2026-05-13T11:07:06Z)

```
cat > /tmp/task-041.json <<'EOF'
{
  "id": "TASK-041",
  "description": "Phase 4 sub-phase 4.1: ...",
  "status": "planned",
  ...
}
EOF
npx tsx scripts/orchestrator/file-block-item.ts --block tasks --writer human:davidryan@gmail.com --item @/tmp/task-041.json
```

Latest invocation pattern is unchanged through 2026-05-13T11:15:59Z (e.g. filing VER-014/VER-015 by `--block verification --writer human:davidryan@gmail.com --item @/tmp/ver-NNN.json`).

### A3 — pi -p append-block-item (verbatim from session 1c8b1a5d, 2026-04-18T00:36:32Z)

```
ITEM_JSON=$(cat tmp/candidates/r-0001-compose-output.json | jq -c .) && pi -p "call the append-block-item tool with block research and arrayKey research and item ${ITEM_JSON}" --mode json --no-skills 2>&1 | tail -50
```

And session a3e5b874, 2026-04-07T21:44:02Z (heredoc form):

```
pi -p "call the append-block-item tool with name issues and key issues and item $(cat <<'JSONEOF'
{"id":"issue-043","title":"Duplicate schemas in pi-workflows/schemas/ and pi-jit-agents/schemas/ — no sync mechanism, will drift", ...
```

Last observed substrate-relevant `pi -p` call: 2026-04-25T02:22:01Z. **No `pi -p` substrate write has been used since 2026-04-25** — the pattern was retired in favor of `tsx -e` (DEC-0019/0020 era) and then `file-block-item.ts` (from 2026-05-10).

### A4 — Edit tool on `.project/*.json` (forbidden per F-006)

153 occurrences spanning 2026-03-16T09:49:08Z to 2026-05-13T21:41:51Z. The most recent invocations are concentrated in periods predating DEC-0016 (which formalized the bypass prohibition) and in transient orchestrator surgery (e.g. fixing schema-write tool defects). User feedback `feedback_tsx_eval_for_deterministic_state.md` explicitly forbids `Edit` on `.project/*.json` without authorization.

### A5 — Write tool on `.project/*.json`

27 occurrences; usage ceased on 2026-04-18T01:13:21Z. The pattern was retired with the same F-006 enforcement.

## Q2: Most-recent invocation per item kind via canonical filing surface

Filtered to `file-block-item.ts --writer` invocations (the canonical script per DEC-0019/0020), excluding `--dry-run`/`--show-schema`. (When the script wasn't available historically, the substitute was tsx-eval `appendToBlock` against the same library.)

| Item kind | Most recent filing | Tool pattern | Session | Date | Verbatim head |
|---|---|---|---|---|---|
| DEC | (via tsx-eval + updateItemInBlock; no recent file-block-item invocation against `decisions` block in last 30 days) | tsx-eval:block-api | 214961af / 1c8b1a5d / b62c055d | latest tsx-eval w/ DEC ref: 2026-05-10T11:45:50Z | `npx tsx -e "\nimport {appendToBlock} from '@davidorex/pi-context/block-api';\n... appendToBlock(process.cwd(), 'decisions', 'decisions', { id: 'DEC-0018', ...` |
| FGAP | 2026-05-13T10:56:25Z (FGAP-042..046 batch) | orchestrator-script:file-block-item | b62c055d | 2026-05-13 | `for F in fgap-042 fgap-043 fgap-044 fgap-045 fgap-046; do npx tsx scripts/orchestrator/file-block-item.ts --block framework-gaps --writer human:davidryan@gmail.com --item @/tmp/$F.json; done` |
| TASK | 2026-05-13T11:07:06Z (TASK-041) | orchestrator-script:file-block-item | b62c055d | 2026-05-13 | `npx tsx scripts/orchestrator/file-block-item.ts --block tasks --writer human:davidryan@gmail.com --item @/tmp/task-041.json` |
| VER | 2026-05-13T11:14:59Z (VER-014 + VER-015) | orchestrator-script:file-block-item + tsx-eval `updateItemInBlock` for status flip | b62c055d | 2026-05-13 | `npx tsx scripts/orchestrator/file-block-item.ts --block verification --writer human:davidryan@gmail.com --item @/tmp/ver-014.json` (then inline `tsx -e` invoking `updateItemInBlock` to close TASK-041) |

Across 27 latest filings on the script:

| Block target | Invocations (latest 30 days) |
|---|---|
| `--block tasks` (TASK + status flips) | 2 explicit filings; status flips done via tsx-eval `updateItemInBlock` (see e.g. 2026-05-13T11:14:59Z command) |
| `--block framework-gaps` (FGAP) | 4 |
| `--block verification` (VER) | ~9 across VER-005..VER-015 |
| `--block decisions` (DEC) | 0 in last 30 days via file-block-item; older filings used tsx-eval `appendToBlock` |

## Q3: file-block-item.ts usage history

| Date | Event |
|---|---|
| 2026-05-10T22:25:12Z | First runtime demo (`--show-schema` + `--dry-run` patterns) — session b62c055d |
| 2026-05-10T22:25:38Z | Commit landing the script (`scripts/orchestrator/file-block-item.ts`) via session b62c055d |
| 2026-05-10T22:25:45Z | First production filings begin (FGAP-035 et seq.) |
| 2026-05-13T21:48:51Z | Latest invocation (`cat scripts/orchestrator/file-block-item.ts` to inspect canonical signature) |

Counts: 38 successful filing invocations (excluding `--dry-run` / `--show-schema`) across 4 days (2026-05-10 to 2026-05-13). All filings live in session b62c055d. Zero `is_error=1` instances of the script's filing path (40 total invocations; 2 errors were unrelated heredoc-string-construction breakage upstream — see Q5 row 1).

Adoption velocity: from landing-day to last filing, **average ~10 filings/day** during the FGAP-026 closure arc.

## Q4: Last-10 substrate-write commits → tool invocation map

Source: `git log --grep='^substrate(\.project)'` (head 12 entries). All commits emit from the same session b62c055d (pi-context-rebuild branch, FGAP-026 closure arc).

| SHA | Date | Subject head | Filing tool invocation that produced the write (Bash tool_executions in same session, within ≤2 min of the commit) |
|---|---|---|---|
| 93a997f | 2026-05-13T11:16:28Z | close TASK-041 + TASK-024 (Phase 4 complete) — file VER-014 + VER-015 | `file-block-item.ts --block verification --writer human:davidryan@gmail.com --item @/tmp/ver-014.json` + `... @/tmp/ver-015.json`; then inline `tsx -e` `updateItemInBlock(... 'tasks', 'tasks', (t) => t.id === 'TASK-041', ...)` (2026-05-13T11:14:59Z) |
| bc29660 | 2026-05-13T11:08:57Z | file TASK-041 — Phase 4 sub-phase decomposition | `file-block-item.ts --block tasks --writer human:davidryan@gmail.com --item @/tmp/task-041.json` (2026-05-13T11:07:06Z) |
| c03bc0d | 2026-05-13T10:56:25Z | file FGAP-042..046 | `for F in fgap-042..fgap-046; do file-block-item.ts --block framework-gaps --writer human:davidryan@gmail.com --item @/tmp/$F.json; done` (2026-05-13T10:56:25Z, batch command) |
| 46dfc78 | 2026-05-13T10:06:54Z | close TASK-040 + TASK-023 (Phase 3 complete) | `file-block-item.ts --block verification --writer human:davidryan@gmail.com --item @/tmp/ver-012.json` (2026-05-13T10:06:00Z) + inline `tsx -e` `updateItemInBlock` for TASK-040/TASK-023 status |
| b3a90aa | 2026-05-13T09:42:27Z | close TASK-039 + file VER-011 | `file-block-item.ts --block verification --writer human:davidryan@gmail.com --item @/tmp/ver-011.json` (2026-05-13T09:35:25Z) + tsx-eval `updateItemInBlock` |
| 2b6c465 | 2026-05-13T02:56:32Z | close TASK-038 + file VER-010 | `file-block-item.ts --block verification --writer human:davidryan@gmail.com --item @/tmp/ver-010.json` (2026-05-13T02:52:23Z) + tsx-eval `updateItemInBlock` |
| 9a335dd | 2026-05-13T02:37:37Z | file TASK-038..040 | `file-block-item.ts --block tasks --writer human:davidryan@gmail.com --item @/tmp/task-038.json` (2026-05-13T02:30:02Z), then `task-039.json` + `task-040.json` |
| 17cb1a9 | 2026-05-12T23:00:17Z | close TASK-037 + TASK-022 (Phase 2 complete) | `file-block-item.ts --block verification --writer human:davidryan@gmail.com --item @/tmp/ver-008.json` (2026-05-12T22:58:53Z) + `ver-009.json` + tsx-eval `updateItemInBlock` |
| 9405d48 | 2026-05-12T22:49:56Z | close TASK-036 + file VER-007 | `file-block-item.ts --block verification --writer human:davidryan@gmail.com --item @/tmp/ver-007.json` (2026-05-12T22:46:15Z) + tsx-eval `updateItemInBlock` |
| 1037d59 | 2026-05-12T22:37:43Z | close TASK-035 + file VER-006 | `file-block-item.ts --block verification --writer human:davidryan@gmail.com --item @/tmp/ver-006.json` (2026-05-12T22:37:27Z) + tsx-eval `updateItemInBlock` |

**Uniformity**: 10/10 last-10 substrate commits used the `file-block-item.ts --writer human:davidryan@gmail.com --item @/tmp/X.json` filing pattern, with `tsx-eval` + `updateItemInBlock` used as the **status-flip / closure** complement for cases where the existing item required mutation rather than append. The two patterns are layered: append via script, mutate via tsx-eval. No commit in the last-10 set used `pi -p`, `Edit`, or `Write` for the substrate write.

## Q5: Failure modes / retired patterns

### F-A — heredoc multi-line tsx-eval string termination (2026-05-13T11:14:59Z, is_error=1)

```
Error: Transform failed with 1 error:
/eval.ts:12:256: ERROR: Unterminated string literal
```

A `tsx -e "..."` invocation embedded a multi-line `notes:` field with embedded quotes that broke the outer shell-string termination. The append portion (VER-014/VER-015 via file-block-item.ts) had **already succeeded** before the failure ("Appended VER-014 to verification.verifications / Appended VER-015 to verification.verifications" preceded the SyntaxError). Lesson: split append (script) from mutate (tsx-eval) into separate Bash invocations rather than chaining in one heredoc.

### F-B — AJV schema-validation pre-write failures via tsx-eval `appendToBlock` (2026-05-10T22:16:57Z, 22:17:23Z; 2026-05-10T11:44:59Z; 2026-05-03T00:24:28Z)

Examples (all is_error=1, all production substrate intact):

```
ValidationError: Validation failed for block file 'framework-gaps.json': /gaps/32/evidence: must be array
ValidationError: Validation failed for block file 'framework-gaps.json': /gaps/32/evidence/0: must be object; /gaps/32/evidence/1: ...
ValidationError: Validation failed for block file 'decisions.json': /decisions/17/related_findings: must NOT have fewer than 1 items
ValidationError: Validation failed for block file 'issues.json': /issues/65: must have required property 'title'; ...
```

These motivated landing `file-block-item.ts` (commit 2026-05-10T22:25:38Z) with `--show-schema` + `--dry-run` for schema-aware pre-validation. The pattern that replaced this loop: discover schema with `--show-schema framework-gaps`, validate item draft with `--dry-run`, then file.

### F-C — non-deterministic tsx-eval local-subpath import resolution (2026-05-03T00:23:50Z, session 70582df3)

```
ValidationError: Validation failed for block file 'issues.json': /issues/65: must have required property 'title'; ...
```

Preceded by a different error in adjacent invocations: `tsx -e` against `"./packages/pi-project/src/block-api.js"` (local-subpath import) failed non-deterministically on Node 23.7. Documented in `feedback_tsx_eval_retry.md` (retry once before diagnosing). Mitigation: import via the package's named export (`@davidorex/pi-context/block-api`), not local subpath.

### F-D — pi -p substrate-write retirement (last used 2026-04-25T02:22:01Z)

8 invocations of `pi -p "call append-block-item ..."` between 2026-04-06 and 2026-04-25. Zero have been used since. Replaced by `tsx -e` (deterministic / no LLM judgment cost / no model-pricing) per `feedback_tsx_eval_for_deterministic_state.md`. CLAUDE.md mandate: "for deterministic block-api mutations use `npx tsx -e` with `@davidorex/pi-project/block-api` imports; reserve `pi -p 'call ...'` for ops that genuinely need LLM judgement."

### F-E — direct Edit / Write on `.project/*.json` (forbidden but observed)

153 Edit + 27 Write invocations across 2026-03-16 → 2026-05-13 (Edit) / 2026-04-18 (Write). Forbidden per F-006 (pi-bypass arc fragility) / DEC-0016. Recent Edit invocations on `.project/*.json` files have been increasingly rare since DEC-0016 enactment but the pattern is not zero. User feedback explicitly mandates substitution by tsx-eval / file-block-item.ts.

## Synthesis (no hedging)

**The canonical substrate-filing pattern by usage evidence is**:

```
cat > /tmp/<id-slug>.json <<'EOF'
{ "id": "<KIND>-NNN", ... }
EOF
npx tsx scripts/orchestrator/file-block-item.ts --block <block-name> --writer human:davidryan@gmail.com --item @/tmp/<id-slug>.json
```

Cite: Q4 — all 10 most-recent substrate-write commits used this exact shape; Q3 — 38 invocations / 0 errors on the filing path over 4 days; Q2 — most recent filing per item kind (FGAP / TASK / VER) all use this command shape. Verbatim sample at 2026-05-13T11:07:06Z (session b62c055d): `npx tsx scripts/orchestrator/file-block-item.ts --block tasks --writer human:davidryan@gmail.com --item @/tmp/task-041.json`.

**Alternative patterns and when used**:

- **`npx tsx -e` + `updateItemInBlock` / `upsertItemInBlock` from `@davidorex/pi-context/block-api`** — used for *mutations* (status flips, closure annotations on existing items). Layered with the script (script appends, tsx-eval mutates) in the same commit. Cite: Q4 rows for SHAs 93a997f / 46dfc78 / b3a90aa / 2b6c465 / 17cb1a9 / 9405d48 / 1037d59 — every "close TASK-NNN + file VER-NNN" commit follows the layered pattern. Required imports: `import {updateItemInBlock} from '@davidorex/pi-context/block-api'; import type {DispatchContext} from '@davidorex/pi-context/dispatch-context';`. DispatchContext shape: `{ writer: { kind: 'human', user: 'davidryan@gmail.com' } }` (note: post-rename — earlier filings used `identifier` which has since been migrated).

- **`file-block-item.ts --show-schema <block>` + `--dry-run`** — used pre-filing for schema discovery and validation. Cite: Q3 first-runtime-demo at 2026-05-10T22:25:12Z.

**Failure-mode patterns that should NOT be used**:

- **`pi -p "call append-block-item ..."`** — retired 2026-04-25 (Q5 F-D). LLM-judgment cost without benefit for deterministic writes; replaced by `tsx -e` and `file-block-item.ts`.
- **Direct `Edit` or `Write` on `.project/*.json`** — forbidden per F-006 / DEC-0016 (Q5 F-E). Despite 153 + 27 historical occurrences these violate canon.
- **`tsx -e` against `./packages/pi-*/src/*.js` local subpath imports** — non-deterministic on Node 23.7 (Q5 F-C). Use the package's declared subpath export (`@davidorex/pi-context/block-api`) instead.
- **Chaining `file-block-item.ts` append + `tsx -e` mutate in the same Bash heredoc** — multi-line `notes:` quote termination breaks the outer shell string (Q5 F-A). Split into separate Bash invocations.
- **Raw `tsx -e appendToBlock` without `--show-schema` / `--dry-run` precheck** — produces AJV ValidationError loops (Q5 F-B). Pattern that motivated landing `file-block-item.ts`.
