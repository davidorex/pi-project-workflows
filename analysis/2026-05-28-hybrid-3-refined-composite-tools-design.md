# Hybrid 3 Composite-Tools — Refined Design (post-canon-eval)

Date: 2026-05-28
Predecessor: `analysis/2026-05-28-hybrid-3-composite-tools-canon-eval.md` (commit 3b4b32d) — evaluated v1 Hybrid 3; surfaced two design-completeness items (DEC-0019/0020 dual-surface missing; forbidden-wholesale enforcement under-specified) AND identified that L5 substrate-canon forbidden-list was deferred-by-hedge (mandate-007 violation).

This file documents the REFINED design (v2) that closes both gaps. Substrate items DEC-0052 / FEAT-010 / FGAP-116 carry the canonical filing; this analysis is the design source-of-record.

---

## Refined design (v2)

### Per-KIND triple (DEC-0019 dual-surface)

Each composite KIND in pi-agent-dispatch lands as a TRIPLE — library function + Pi tool registration + CLI script — landing together as a unit per DEC-0019/0020.

For the proposed initial 4 KINDS — `read-files`, `git-log`, `grep-paths`, `command-allowlist` — that's 4 triples = 12 files:

| KIND | Library | Pi tool | CLI script |
|---|---|---|---|
| read-files | `packages/pi-agent-dispatch/src/composites/read-files.ts` exports `runReadFiles(cwd, instanceParams): Result` | extension-load registers `pi.registerTool({name: <instance.canonical_id>, params, execute: () => runReadFiles(...)})` per config.tool_operations[] entry of kind `read-files` | `scripts/orchestrator/composite-read-files.ts --allowed-roots <csv> --path <p>` invokes the same `runReadFiles` |
| git-log | `composites/git-log.ts` exports `runGitLog(cwd, params)` | analogous | `scripts/orchestrator/composite-git-log.ts --paths <csv> --since <iso> --limit <n>` |
| grep-paths | `composites/grep-paths.ts` exports `runGrepPaths(cwd, params)` | analogous | `scripts/orchestrator/composite-grep-paths.ts --pattern <p> --allowed-roots <csv>` |
| command-allowlist | `composites/command-allowlist.ts` exports `runCommandAllowlist(cwd, params)` | analogous | `scripts/orchestrator/composite-command-allowlist.ts --command <name> --args <csv>` |

Adding a 5th KIND in the future = same triple as a unit. Each new KIND's CLI-script writing surfaces extension-API gaps as FGAPs per DEC-0019's second clause.

### 5-layer forbidden-wholesale enforcement (no-hedge, all-required)

L1 — TS const at framework level:
```typescript
// packages/pi-agent-dispatch/src/operation-vocab.ts
export const FORBIDDEN_WHOLESALE_OPERATIONS = ["bash", "write", "edit", "shell", "execute"] as const;
```

L2 — engine test invariant in `operation-vocab.test.ts`:
```typescript
it("TOOL_OPERATION_DEFAULTS contains zero forbidden wholesale tokens", () => {
  for (const op of Object.values(TOOL_OPERATION_DEFAULTS)) {
    assert.ok(!FORBIDDEN_WHOLESALE_OPERATIONS.includes(op.canonical_id),
      `forbidden wholesale operation '${op.canonical_id}' in TOOL_OPERATION_DEFAULTS — must be a bounded composite (feedback_no_parallel_ungated_paths)`);
  }
});
```

L3 — runtime guard at extension load, reading L1 ∪ L5 union:
```typescript
// packages/pi-agent-dispatch/src/index.ts
const extension = (pi: ExtensionAPI) => {
  const projectForbidden = readConfig().tool_operations_forbidden ?? [];
  const forbidden = new Set([...FORBIDDEN_WHOLESALE_OPERATIONS, ...projectForbidden]);
  const violators = registeredOps.filter(op => forbidden.has(op.canonical_id));
  if (violators.length > 0) throw new Error(`pi-agent-dispatch refuses to load: forbidden wholesale operation(s) in registry: ${violators.join(", ")}`);
  // ... register tools
};
```

L4 — JSDoc citation in `operation-vocab.ts`:
```typescript
/**
 * Operations forbidden from TOOL_OPERATION_DEFAULTS AND from
 * config.tool_operations[] AND config.tool_operations_forbidden[] unions.
 * Wholesale tokens that, if granted, dissolve operation-granular bounds —
 * e.g. granting "bash" makes "git-log-recent" a gated alternative to an
 * unrestricted original (feedback_no_parallel_ungated_paths). Extending L1
 * = source change + release. L5 (config.tool_operations_forbidden[]) admits
 * project-specific additions under writer.kind=human.
 */
```

L5 — substrate `config.tool_operations_forbidden[]` for project-specific additions:
- Config schema extended: `config.schema.json` gains `tool_operations_forbidden: { type: "array", items: { type: "string" }, description: "Project-specific tokens forbidden from registration as composite operations (extends framework FORBIDDEN_WHOLESALE_OPERATIONS)." }`
- AmendRegistry descriptor: `tool_operations_forbidden: { kind: "string-array" }`
- Mutation surface: `amendConfigEntry(cwd, "tool_operations_forbidden", "add" | "remove", token)`
- Authoring gate: new `author-tool-grant` Pi tool (analogous to TASK-089 author-agent-spec) wraps the mutation + enforces writer.kind=human; refuses agent/monitor/workflow kinds
- L3 runtime guard reads the union of L1 (framework) + L5 (project) and throws on any registered operation in the union

### author-tool-grant Pi tool

New Pi tool in pi-agent-dispatch registering the human-only authoring surface for BOTH:
- `config.tool_operations[]` entries (the instance vocabulary — composite instances)
- `config.tool_operations_forbidden[]` entries (the project-specific forbidden additions)

Mirrors TASK-089's author-agent-spec pattern:
- `Type.Object({operation_kind, operation_id, instance_params, action: "add" | "remove", writer: {kind, user}})`
- Throws if `writer.kind !== "human"` per DEC-0047
- Throws if `operation_kind` references a KIND not registered in pi-agent-dispatch's framework KIND catalog
- Throws if `operation_id` is in `FORBIDDEN_WHOLESALE_OPERATIONS`
- Delegates to `amendConfigEntry` for the actual config mutation

### Net file count for first build

- 4 new files under `packages/pi-agent-dispatch/src/composites/` (one per KIND)
- 1 new file `packages/pi-agent-dispatch/src/operation-vocab.ts` MODIFIED (add `FORBIDDEN_WHOLESALE_OPERATIONS` + JSDoc)
- 1 new file `packages/pi-agent-dispatch/src/operation-vocab.test.ts` MODIFIED (add L2 invariant test)
- 1 new file `packages/pi-agent-dispatch/src/composite-loader.ts` — reads config.tool_operations[] at extension load + dispatches to KIND library functions
- 1 new file `packages/pi-agent-dispatch/src/composite-loader.test.ts`
- 1 new file `packages/pi-agent-dispatch/src/author-tool-grant-tool.ts` + `.test.ts`
- 1 modified `packages/pi-agent-dispatch/src/index.ts` (L3 runtime guard + composite-loader integration + register author-tool-grant)
- 4 new files under `scripts/orchestrator/` (composite-<kind>.ts per KIND)
- 2 modified config files: `.project/schemas/config.schema.json` + `packages/pi-context/samples/conception.json` (add `tool_operations_forbidden` property)
- 1 modified `packages/pi-context/src/context.ts` (add `tool_operations_forbidden` to AmendRegistry + REGISTRY_DESCRIPTORS)
- 1 modified `packages/pi-context/schemas/config.schema.json` (the packaged schema mirrored — per TASK-088/089 precedent that the packaged path also gates installation tests)

Net: ~14 new + ~5 modified files. Substrate state: DEC-0052 enacted (or open with drafted answer pending stamp) + FEAT-010 proposed + FGAP-116 identified.

## Canon mapping (refined)

| Refinement element | Canon item satisfied |
|---|---|
| Per-KIND triple (library + Pi tool + CLI script) | DEC-0019/0020 dual-surface |
| L1 framework forbidden-list (TS const) | feedback_no_parallel_ungated_paths; precedent: status-vocab.ts |
| L2 engine test invariant | DEC-0018 real-checks; DEC-0048 engine-tests-are-gates; precedent: status-vocab.test.ts |
| L3 runtime guard at extension load | feedback_no_parallel_ungated_paths defense-in-depth |
| L4 JSDoc citation | feedback_concise_zero_loss WHY-comments |
| L5 substrate forbidden-list (project-specific) | DEC-0040 substrate-single-source-of-truth; DEC-0047 writer.kind=human authoring |
| author-tool-grant Pi tool | DEC-0047 capability-authoring human-only; precedent: TASK-089 author-agent-spec |
| composite-loader + extension-load runtime composition | DEC-0040 derived state; FEAT-005 operation-granular grant from empty |
| config.tool_operations[] empty default | DEC-0047 default-empty; JI-024 |
| amendConfigEntry as mutation surface | DEC-0019/0020 canonical mutation pattern; precedent: TASK-089 |

Zero canon evolution required. All five layers + per-KIND triple + author-tool-grant are concrete enactments of existing canon.

## Companion artifacts

- `analysis/2026-05-28-hybrid-3-composite-tools-canon-eval.md` (commit 3b4b32d) — v1 evaluation; identified the two refinements applied here
- `.project/decisions.json` DEC-0052 — substrate filing of the design adoption
- `.project/features.json` FEAT-010 — substrate filing of the build
- `.project/framework-gaps.json` FGAP-116 — substrate filing of the operation-granular-capability-vocabulary gap this closes
