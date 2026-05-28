# Launch-Script + Codebase Canonical-Intention Audit (2026-05-28)

Date: 2026-05-28
Anchor: `scripts/launch-constrained-pi.sh` + canonical-intention sources cited verbatim below.
Scope: empirical state of the launch-script + skills-generation + META-package + pi-agent-dispatch integration. Read-only audit; no edits.

---

## Canonical-intention anchor (verbatim citations)

**DEC-0014 — Harness-confined main LLM (decision text):**
> "Every Pi runtime invocation EXCLUDES bash/read/write/edit (the default Pi tools) from the main LLM's tool list. The main LLM operates ONLY through extension-registered tools (pi-context's 21 tools + pi-jit-agents / pi-workflows / pi-behavior-monitors registered tools). Out-of-substrate operations route through workflows that dispatch JIT agents whose .agent.yaml specs declare the required tool surface."

**DEC-0044 (narrowed) — pi-agent-dispatch scope:**
> "the agent-as-tool dispatch surface registers in a NEW dedicated pi-agent-dispatch extension whose ONLY scope is hosting the sub-agent→sibling-agent pi.registerTool site (FEAT-004) and the dispatch-boundary capability clamp (FEAT-005)... The extension is loaded peer-to-peer by any subprocess context whose sub-agents may invoke siblings — workflow subprocesses, monitor subprocesses, orchestrator if it ever runs agents that need agent-as-tool — symmetrically."

**DEC-0047 — Capability model (the operative form):**
> "(1) A dispatched agent's tools are declared in its .agent.yaml spec... default EMPTY (DEC-0015/0011 generalized). (2) The grant is OPERATION-GRANULAR, not tool-wholesale... (3) The dispatch path grants exactly the spec's declaration, CLAMPED to a subset of the dispatching parent's grant AT OPERATION SCOPE. (4) The orchestrator (DEC-0014: tools-only, no ambient bash/read/write/edit) is the SOLE spec/schema author... WIDENING the registry (a new tool/op/capability bundle) is a capability mutation requiring HUMAN ratification: writes to capability/registry fields require writer.kind=human. (5) The TERMINAL acceptance verdict on any executable artifact (code or substrate change) is produced by RUNNING THE REAL DETERMINISTIC CHECKS the executive cannot fake."

**FEAT-006 — North-star loop (status: proposed):**
> "a tools-only constrained in-pi orchestrator (DEC-0014, NO code/bash perms) authors a typed work-order/spec BLOCK via the substrate write tools; dispatches a privileged JIT-agent (spec-implementer-class: file write/edit + exactly-scoped command perms) that consumes the spec via contextBlocks; the agent makes ACTUAL source edits; the change is validated by REAL DETERMINISTIC CHECKS (build/check/test exit code + runtime-demo + adversarial-against-artifacts...); and the validated change is committed with DispatchContext agent-authorship attestation through husky."

**FEAT-005 — JIT capability composition + sandbox (status: proposed):**
> "The subagent receives its OWN tools, JIT-composed per invocation, scoped to EXACTLY the operations the task needs and no others — e.g. the right to run a specific command (`npm test`) rather than the `bash` tool wholesale; a specific file path to read/write rather than read/write generally. Default is EMPTY... Capabilities drawn from a tool+permission REGISTRY."

**FEAT-010 — Hybrid 3 composite-tool infrastructure (status: complete):**
> "pi-agent-dispatch's extension declares a small set of canonical composite KINDS in framework code (initial 4: read-files, git-log, grep-paths, command-allowlist); config.tool_operations[] declares INSTANCES of those kinds...; extension-load reads config + dynamically registers a Pi tool per instance... Adding a new KIND = source change + release; adding an INSTANCE of an existing KIND = config write under writer.kind=human (via new author-tool-grant Pi tool)."

**JI-021 (verbatim user):** "the orchestrator using jit-agents (which could be tasked bash and given it as a tool in its rendered prompt, e.g., or a file read, or a file write."

**JI-023 (verbatim user):** "Specific sub agent tool calls can be permed exactly for specific tasks in the prompt and no others. Eg A bash command. Not bash."

**JI-024 (verbatim user):** "No perms. No tools. Configs and schemas and macros bring all into existence from empty state."

**DEC-0019/0020 — orchestrator-scripts dual-surface canon:** every new substrate op = library + Pi tool + CLI script as a unit; agents block-write items, markdown is display-only.

---

## Current state snapshot (empirical)

**Launch script** (`scripts/launch-constrained-pi.sh:13-33`):
1. `pi install -l $REPO/packages/pi-project-workflows` (line 18)
2. `TOOLS="$(grep -rhoE '<tool name="[a-z0-9-]+"' "$REPO"/packages/*/skills/*/SKILL.md ...)"` (line 25-26)
3. `exec pi --tools "$TOOLS" "$@"` (line 33)

**META package** (`packages/pi-project-workflows/package.json:21-35`):
- `pi.extensions[]` = 3 entries: project / workflows / monitors only
- `dependencies` = 3 packages: pi-context / pi-workflows / pi-behavior-monitors only
- pi-agent-dispatch is ABSENT from both lists

**generate-skills.js** (`scripts/generate-skills.js:999`):
- `packageDirs = ["pi-context", "pi-workflows", "pi-behavior-monitors"]`
- pi-agent-dispatch is ABSENT

**pi-agent-dispatch package** (`packages/pi-agent-dispatch/`):
- `package.json:29-33` declares `pi.extensions[]` = `["./dist/index.js"]` — but no `pi.skills` field
- `package.json:25-28` `files[]` = `["dist/", "*.md"]` — no `skills/` entry
- No `skill-narrative.md` exists
- No `skills/` directory exists
- `src/index.ts:42-46` registers 5 static tools: `author-agent-spec` / `call-agent` / `run-real-checks` / `commit-attested` / `author-tool-grant`
- `src/index.ts:52` calls `loadComposites(process.cwd(), pi)` to dynamically register composite tools from `config.tool_operations[]`

**Launch-script tool surface** (empirical grep against current SKILL.md):
- 53 tools surfaced. Categories: 40 pi-context + 9 pi-workflows + 5 pi-behavior-monitors-control (`monitors-*`). Includes `read-block`, `read-config`, `read-schema`, etc.
- ZERO of pi-agent-dispatch's 5 static tools appear. ZERO composite tools appear.
- `bash` / `write` / `edit` NOT in the list (DEC-0014 line). ✓

**Composite CLI scripts** (DEC-0019 dual-surface):
- `scripts/orchestrator/composite-{read-files,git-log,grep-paths,command-allowlist}.ts` — all 4 present ✓
- Library `packages/pi-agent-dispatch/src/composites/*.ts` — all 4 present ✓
- Pi-tool registration via composite-loader.ts — present ✓
- Triple is COMPLETE in source; missing only the skills-generation/META-wiring leg.

**.project/config.json** state: `tool_operations: null`, `tool_operations_forbidden: null` — no composite instances declared in current project config.

**`loadContext(cwd)` behavior** (`packages/pi-context/src/context.ts` loadContext): returns `{ config: null, relations: [] }` when no `.pi-context.json` pointer exists (graceful degrade per FGAP-074 C3). composite-loader iterates `config?.tool_operations ?? []` → empty list → registers nothing. Mock-pi in generate-skills.js, if it ever ran the factory in a directory without `.pi-context.json`, would emit zero composite tools.

---

## Per-dimension audit

### Dimension A: extension integration with META package + launch chain

- **State:** META's `dependencies` (`package.json:32-34`) lists 3 packages; `pi.extensions[]` (`:22-26`) lists 3 shim files. pi-agent-dispatch is in neither. The shim trio (`project-extension.ts` / `workflows-extension.ts` / `monitors-extension.ts`) has no parallel `agent-dispatch-extension.ts`.
- **Canon ref:** DEC-0044 mandates pi-agent-dispatch as the agent-as-tool registration site loaded "peer-to-peer." FEAT-006 cannot run without `call-agent` / `run-real-checks` / `commit-attested` registered.
- **Verdict:** **CRITICAL GAP**
- **Evidence:** `packages/pi-project-workflows/package.json:21-35`; `ls packages/pi-project-workflows/` shows no agent-dispatch shim.
- **Gap:** `pi install -l $META` does not install pi-agent-dispatch — the launch chain's step 1 is broken vs DEC-0044/FEAT-006.

### Dimension B: skills generation + --tools derivation pipeline

- **State:** `scripts/generate-skills.js:999` hardcodes `packageDirs = ["pi-context", "pi-workflows", "pi-behavior-monitors"]`. pi-agent-dispatch has no `skills/`, no `skill-narrative.md`, no `pi.skills` in `package.json`, no `skills/` in `files[]`.
- For DYNAMIC composites: even if pi-agent-dispatch were in `packageDirs`, the factory invocation at `generate-skills.js:803` calls `factory(mockPi)` which would invoke `loadComposites(process.cwd(), pi)`. `process.cwd()` during `npm run skills` = repo root. Repo root has `.project/` (not `.pi-context.json`). `loadContext()` graceful-degrades to `config: null` → no composites registered → mock-pi captures zero composite names. Composite tools would NEVER appear in any generated SKILL.md under the current mechanism.
- For STATIC pi-agent-dispatch tools: would be captured if pi-agent-dispatch were added to `packageDirs` AND a SKILL.md were emitted, but the launch script's grep also requires the SKILL.md to land somewhere under `$REPO/packages/*/skills/*/SKILL.md` to be picked up.
- **Canon ref:** DEC-0014 requires that the main thread's tool surface be the union of extension-registered tools — including pi-agent-dispatch's. FEAT-010 explicitly designs the dynamic-composite registration to participate in the same surface.
- **Verdict:** **CRITICAL GAP** (static tools) + **HIGH GAP** (dynamic composites — mechanism architecturally incompatible with current skills-generation invocation site).
- **Evidence:** `scripts/generate-skills.js:999`, `:803`; `packages/pi-agent-dispatch/package.json:29` (no `pi.skills`); `packages/pi-context/src/context.ts` loadContext degrade path.
- **Gap:** 5 static tools invisible; dynamic composites have no skills-generation pathway by construction (per-project config is read against `process.cwd()` of the build runner, not the target dir of an eventual pi launch).

### Dimension C.1 — Tools-only main thread, NO bash/file-write (DEC-0014)

- **State:** `pi --tools "$TOOLS"` allowlist excludes `bash`/`read`/`write`/`edit`. ✓
- **Verdict:** **ALIGN** (the one canon dimension the script currently honors at the negative-allowlist level; though see C.4 — the positive side is empty for the FEAT-006 loop).
- **Evidence:** `scripts/launch-constrained-pi.sh:33` + empirical tool-name enumeration.

### Dimension C.2 — Orchestrator uses jit-agents directly (JI-021)

- **State:** No `call-agent` tool registered in the launched session (pi-agent-dispatch not installed). The orchestrator inside the launched session has no path to dispatch a jit-agent.
- **Verdict:** **CRITICAL GAP**
- **Evidence:** `packages/pi-agent-dispatch/src/index.ts:43` registers `callAgentTool`; tool absent from current SKILL.md surface.
- **Gap:** "orchestrator using jit-agents directly" (JI-021) is unreachable from inside `launch-constrained-pi.sh` today.

### Dimension C.3 — Operation-granular grants from empty (DEC-0047 + JI-024)

- **State:** The 53 tools currently surfaced are the wholesale "pi-context 40 + workflow 9 + monitors 5" registry of substrate primitives. None are operation-granular bounded composites of bash/read/write. `config.tool_operations[]` is `null`. No composite instances declared.
- **Verdict:** **HIGH GAP** (the operation-granular mechanism exists — FEAT-010 complete in source — but is unwired into the launch surface AND empty in this repo's own config).
- **Evidence:** `.project/config.json:tool_operations:null`; SKILL.md grep returns zero composite names; `packages/pi-agent-dispatch/src/composite-loader.ts:92-104` registration path.
- **Gap:** "composed from empty" is observably the state, but composed-to-need is unreachable — no instances, no registration mechanism wired into launch.

### Dimension C.4 — FEAT-006 loop (author-agent-spec → call-agent → run-real-checks → commit-attested)

- **State:** All 4 tools exist in `pi-agent-dispatch/src/index.ts:43-46`. ZERO of them appear in the launch script's `--tools` allowlist.
- **Verdict:** **CRITICAL GAP** (the entire north-star loop is unreachable from the current launch script).
- **Evidence:** Empirical grep of SKILL.md returns none of the 4 names.
- **Gap:** Launching this script today produces a session that cannot execute the FEAT-006 north-star end-to-end loop.

### Dimension C.5 — author-tool-grant + composite-loader for capability vocabulary authoring (FEAT-010)

- **State:** `author-tool-grant` registered at `src/index.ts:46` — not in launch surface. composite-loader registered at `src/index.ts:52` — not loaded in launch (pi-agent-dispatch not installed). No path for human-ratified writes to `config.tool_operations[]` exists in the launched session.
- **Verdict:** **CRITICAL GAP**
- **Evidence:** Same as above.
- **Gap:** The full FEAT-010 author + dynamic-register pipeline ships but is invisible.

### Dimension D — Launch-script flag surface for additional perms

- **State:** Script accepts only `"$@"` passthrough to `pi` (line 33). No flags for `--allow-read <dir>` or `--composite <name>:<params>`. The user-stated need for scoped additional perms maps canonically to FEAT-010 config.tool_operations[] + author-tool-grant — but that mechanism (a) is unreachable from the current launch and (b) is per-target-dir config, not a launch-flag.
- **Verdict:** **HIGH GAP** (mechanism exists by design but unreached by the current launch surface; flag-surface vs config-surface is also a separate design choice not yet resolved).
- **Evidence:** `scripts/launch-constrained-pi.sh` whole file.
- **Gap:** No launch-time mechanism to ad-hoc bound additional perms; FEAT-010's per-project config requires that pi-agent-dispatch be installed AND that the cwd's `.pi-context.json` pointer + `config.json` already declare the instances pre-launch.

### Dimension E — README / documentation alignment

- **State:**
  - Launch-script header (`scripts/launch-constrained-pi.sh:2-12`) describes "WHOLLY constrained to the tools our extensions expose" + "three extensions" (line 10's "all three" comment). Post-FEAT-010 there are 4 extensions (counting pi-agent-dispatch). Header is stale.
  - META README (`packages/pi-project-workflows/README.md:6`) reads "Convenience meta-package that re-exports three Pi extensions plus a shared agent-runtime library" — pre-pi-agent-dispatch framing. Lists 4 constituent packages (the 3 extensions + jit-agents library) but does not include pi-agent-dispatch.
  - No DEC-0014/0044/0047/FEAT-006 citation in the launch script.
  - No `docs/launching-the-orchestrator.md` or equivalent.
- **Verdict:** **MEDIUM GAP** (documentation drift + missing canonical citations; correctness not blocked but operator orientation degraded).
- **Evidence:** As cited.

### Dimension F — Gaps surfaced by the audit itself (mandate-007 anti-deferral)

- **F.1 (HIGH):** generate-skills.js invokes the factory at `process.cwd()` = repo root, but the dynamic-composite mechanism is per-target-dir. There is no architectural answer (in current design) for how composite tools should appear in the published SKILL.md surface vs being registered only at launch-time in the target dir. The skill-discovery vs runtime-discovery split is not reconciled.
- **F.2 (MEDIUM):** Launch script step 1 (`pi install -l $META`) writes/mutates the target dir's `.pi/` settings. The user has a feedback entry `feedback_no_touch_pi_dir.md`. Launching this script against the working repo would write into `.pi/`. This may be intended (the script is documented as run from a NEW target dir), but the constraint isn't documented in-script.
- **F.3 (MEDIUM):** No verification step exists ensuring the 5-extension symmetry post-cascade. `npm run skills` succeeds even if pi-agent-dispatch is silently absent from generation, because the script only iterates its hardcoded list.
- **F.4 (HIGH):** `loadContext` graceful-degrades pointer-less; this means `loadComposites` silently registers nothing in any target-dir lacking `.pi-context.json`. The launch script does not assert pointer presence before launching — operator gets a "constrained" session with zero composites and may not notice.
- **F.5 (MEDIUM):** `pi.skills` field convention: pi-context / pi-workflows / pi-behavior-monitors each carry `pi.skills` for self-registration; pi-agent-dispatch's `package.json` has no `pi.skills` field, so even if pi installs it the skill won't auto-load via pi's own discovery (separate from the meta-bundled copy mechanism).
- **F.6 (MEDIUM):** FEAT-006 is status=`proposed`, FEAT-004 is `proposed`, FEAT-005 is `proposed` — yet FEAT-010 (`complete`) ships the implementation infrastructure for FEAT-005's bounded composites. The proposed-vs-complete asymmetry in the features block obscures arc readiness.
- **F.7 (LOW):** `monitors-control` and `monitors-status` etc. ARE in the launch surface (5 monitor tools), but their tool descriptions/usage is geared to background-monitor lifecycle, not orchestrator dispatch. They are tangential to the FEAT-006 loop.

---

## Gaps enumerated by severity

### CRITICAL (canonical-intention not met by current launch)

| # | Gap | Canon violated |
|---|-----|----------------|
| 1 | META package omits pi-agent-dispatch from `dependencies[]` + `pi.extensions[]`; `pi install -l $META` does not install it | DEC-0044, FEAT-006 |
| 2 | generate-skills.js `packageDirs` hardcoded list omits pi-agent-dispatch; SKILL.md never emitted; launch grep finds zero pi-agent-dispatch tools | DEC-0014, DEC-0044 |
| 3 | `call-agent` tool absent from launched session — orchestrator cannot dispatch jit-agents directly | JI-021, FEAT-006 |
| 4 | All 4 FEAT-006 loop tools (`author-agent-spec`, `call-agent`, `run-real-checks`, `commit-attested`) absent — north-star unreachable | FEAT-006 |
| 5 | `author-tool-grant` + dynamic composite-loader absent — capability-vocabulary authoring/composition unreachable | DEC-0047, FEAT-010 |

### HIGH (canonical-intention partially met; degraded)

| # | Gap | Canon |
|---|-----|-------|
| 6 | Operation-granular composites architecturally unreachable from skills-generation (composite-loader reads config at build-time `process.cwd()`, not at target launch) | DEC-0047, FEAT-010 |
| 7 | `.project/config.json` `tool_operations` / `tool_operations_forbidden` both `null` — even if pi-agent-dispatch loaded, zero composite instances exist | FEAT-010 |
| 8 | Launch script has no flag-surface for ad-hoc bounded grants; user stated need (2026-05-28) is not yet wired | FEAT-005, JI-023 |
| 9 | `loadContext` graceful-degrade on missing `.pi-context.json` means composite-loader silently registers nothing in pointerless target dirs — no operator signal | DEC-0014, FEAT-010 |

### MEDIUM (documentation / symmetry / hygiene)

| # | Gap | Note |
|---|-----|------|
| 10 | Launch-script header text says "three extensions" — stale post-DEC-0044 | scripts/launch-constrained-pi.sh:2-12 |
| 11 | META README lists 3 extensions + library — pi-agent-dispatch absent | packages/pi-project-workflows/README.md |
| 12 | Launch script cites no canonical anchors (DEC-0014/0044/0047/FEAT-006) | header comment |
| 13 | No verification that all extensions actually emitted SKILL.md (script trusts grep result; would silently launch with partial set) | hygiene |
| 14 | pi-agent-dispatch `package.json` lacks `pi.skills` field for self-discovery parity | package.json:29 |
| 15 | No `docs/launching-the-orchestrator.md` or equivalent orientation doc | F-006 mitigation surface |
| 16 | FEAT-004/005/006 status=`proposed` while FEAT-010 status=`complete` — arc-readiness gap not surfaced in roadmap | substrate hygiene |

---

## Resolution scope (per gap; canon-dictated shape only — not implementation prose)

- **Gaps 1, 2, 14:** META + skills-gen + package.json symmetry — pi-agent-dispatch must take the same META-bundling shape as the other three extensions per DEC-0044's "peer-to-peer" loading clause and DEC-0014's "union of extension-registered tools." Triple: META `dependencies` + `pi.extensions[]` add; `generate-skills.js packageDirs` add; pi-agent-dispatch `package.json` adds `pi.skills` + `files[]: skills/`; `skill-narrative.md` authored.
- **Gaps 3, 4, 5:** Direct consequence of #1+#2 closing — once SKILL.md is generated, the 5 static tools surface in the launch grep automatically. No separate fix.
- **Gap 6 (architectural — composite-loader vs skills-gen):** Canon does not currently dictate; FEAT-010 documents per-target-dir registration. Either (a) skills-generation reads pi-agent-dispatch's framework-declared KIND catalog (the 4 KINDs are static, instance scope is per-project) and surfaces those as a meta-vocabulary in the SKILL.md, OR (b) launch script enumerates composite tools from `loadContext(targetDir)` at launch time rather than from grep against build-time SKILL.md. Both are canon-coherent; the choice is a design decision not yet substrate-recorded — propose as FGAP.
- **Gap 7:** Per-project config authorship via `author-tool-grant` writer.kind=human — operator action, not framework gap.
- **Gap 8:** Launch-script flag surface — must route through FEAT-010 `author-tool-grant` (writer.kind=human required by DEC-0047) rather than a parallel ungated launch flag. Possible shape: launch flag composes a config-write call that then triggers re-load. Decision not yet substrate-recorded.
- **Gap 9:** Hard-assertion on `.pi-context.json` presence at launch (positive failure rather than silent degrade) per `feedback_no_parallel_ungated_paths`.
- **Gaps 10–13, 15:** Documentation lockstep updates per `feedback_operating_context_lockstep`.
- **Gap 16:** FEAT-004/005/006 status mutation via `update-block-item` once arc is empirically complete.

---

## Net judgement

Launching `scripts/launch-constrained-pi.sh` today produces a session that meets DEC-0014's NEGATIVE clause (no bash/read/write/edit) but FAILS DEC-0014's POSITIVE clause (the union of extension-registered tools — minus pi-agent-dispatch's 5 static tools + N composites). FEAT-006's north-star loop is unreachable from the launched session because none of its 4 tools surface. The mechanism to fix this is well-defined: pi-agent-dispatch needs the same META-bundling + skills-generation parity as the other three extensions (a triple of edits: META `dependencies` + `pi.extensions[]` + `generate-skills.js packageDirs` + pi-agent-dispatch `package.json` `pi.skills`/`files[]` + `skill-narrative.md`). After that, dynamic composites still face the structural question of build-time vs launch-time registration scope (Gap 6) — the smallest canon-coherent answer is to surface the 4 KIND catalog (static framework knowledge) in the generated SKILL.md and let launch-time `loadComposites` register concrete instances against the target dir's config. The current launch script can become canon-aligned with ~4 file edits + 1 new file (skill-narrative) on the symmetry side; Gap 6 remains a design-decision-to-be-substrate-recorded.
