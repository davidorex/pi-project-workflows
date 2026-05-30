## Self-documenting substrate — design space

The framing is the most consequential observation: the framework's docs become substrate the framework manages. Same readBlock surface; same schema-validation discipline; same relations + lens primitives; same migration mechanism when docs formats evolve. Dogfooding rather than maintaining parallel documentation infrastructure.

### Bootstrap problem (resolved by layering)

If docs live in a block, how does the operator learn about pi-context to query the block? Three-layer bootstrap:

| Layer | Source                                          | Audience                                                                   |
| ----- | ----------------------------------------------- | -------------------------------------------------------------------------- |
| 0     | SKILL.md (loaded when Pi invokes the extension) | First-encounter; names `/context status` + `/context help` as entry points |
| 1     | `/context status` (exists)                      | Substrate state + next-action suggestions                                  |
| 2     | NEW `/context help [topic]` slash command       | Queries the guide block; surfaces operator-facing how-tos                  |
| 3     | `readBlock("guides")` direct                    | In-pi agents + downstream substrate consumers                              |

SKILL.md becomes a thin pointer-and-bootstrap layer; the substantive docs live in queryable substrate.

### Block-kind shape — two design choices

**Single omnibus kind `usage-guides`** with a category enum:
```json
{
  "id": "GUIDE-001",
  "category": "command | tool | concept | runbook | pattern | error",
  "title": "...",
  "applies_to": ["pi-context", "pi-jit-agents", ...],
  "summary": "1-2 sentence",
  "content": "<markdown>",
  "version_added": "0.27.0",
  "deprecated_since": null,
  "related_decisions": [...],
  "related_features": [...]
}
```

**OR multiple specific kinds** partitioning by purpose:
- `commands` — one entry per slash command (description + examples + flags)
- `tools` — one entry per Pi tool (parameters + use cases)
- `runbooks` — one entry per operational how-to ("cutover .project to .context")
- `patterns` — canonical idioms (per-package atomic cascade, lazy migration, sentinel cross-references)
- `concepts` — vocabulary (block-kind, relation-type, lens, invariant, status-bucket)
- `errors` — error message reference (per error: explanation + remediation)
- `axioms` — load-bearing framework commitments (proposed earlier this session)

**Trade-off:**
- Single omnibus: smaller vocabulary; richer schema (the category enum); fewer block files
- Multiple specific: schema-per-purpose enables per-kind invariants (commands MUST cite their handler; tools MUST cite their schema; runbooks MUST have ordered steps); cleaner lens projections; easier per-kind staleness tracking

Multiple specific is more substrate-canon-aligned with how the rest of the substrate is designed (every block kind has a sharp purpose; mixing concerns under category enum is the LLM-laziness pattern pi-context normally avoids).

### Packaged vs project-specific

**Two-tier shape:**
1. **Packaged baseline guides** ship in the conception (pi-context's `samples/blocks/<guide-kind>.json`). Operators adopt via `/context install` per the existing install ceremony — same surface that ships standard blocks. Updated with framework releases.
2. **Project-specific guides** — operators add their own (e.g., this project's "how to file an FGAP under FEAT-001"). Authored via canonical block-write surfaces (`file-block-item.ts` per the established pattern). Lives in the project substrate alongside baseline guides.

The same install ceremony that brings packaged schemas + standard blocks brings packaged guides. Consumers immediately have framework-help on first install.

### Staleness — the real risk

Framework evolves; baseline guides become stale relative to actual surfaces. Citation-rot territory.

**Three solutions, additive:**

1. **Per-guide version stamps** — `version_added`, `version_last_verified`, `deprecated_since`. Lens projection surfaces "guides not verified since framework version X". Operators run a verification pass per release.
2. **Guide-rot scanner** (parallel to citation-rot scanner that already exists) — walks guide content for references to commands/tools/schemas/handlers; verifies each still exists at the named file:line. Fires at release-time per the same canonical pipeline pattern.
3. **Schema-migration-equivalent for guide format** — when framework surfaces rename, declarative-transform migrations rename references in guide content. write-schema-migration's `declarative-transform` kind already supports this for block items; same mechanism applies.

### Bootstrap implementation cost

**Minimum-viable surface** (file-and-query):
- N new schemas (one per guide kind chosen)
- N entries in config.block_kinds[]
- N new block files
- Per-guide entries authored as needed

That's the substrate-vocabulary-extension pattern this project has done multiple times this session. Plan-mode → small impl.

**Full-surface** adds:
- `/context help [topic]` slash command
- Lens projections per common query ("commands related to substrate-management"; "how do I X")
- Packaged baseline guides shipped in conception
- Guide-rot scanner
- Schema migrations for guide-format evolution

### What this displaces vs complements

| Existing home                                    | Status post-self-docs-substrate                                                                                              |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| SKILL.md (per-extension, Pi-loaded)              | THIN POINTER — names guide-block + `/context help` as entry points                                                           |
| CLAUDE.md (project-specific, Claude-Code-loaded) | UNCHANGED — carries binding-instructions + project-local discipline; not the framework's responsibility                      |
| README.md (package-level)                        | THIN POINTER + install-ceremony reference                                                                                    |
| skill-narrative.md (per-extension)               | Becomes guide block source-material (could be migrated to substrate)                                                         |
| Pi tool descriptions (at registration time)      | UNCHANGED — inline at registration is correct for Pi's tool-discovery; substrate is the deeper reference                     |
| Inline error messages                            | UNCHANGED — tactical inline help is correct at the friction point                                                            |
| analysis/ MDs (this session's deep dives)        | MIGRATE selectively as `investigations` items per the previously proposed custom kind; substantial ones become guide entries |
| feedback memories (operator-private)             | UNCHANGED — those are operator-discipline, not framework-help                                                                |

### The eat-own-dog-food shape

Three meta-properties this design enforces:
1. **The framework's docs benefit from the framework's invariants** — schemas validate guide shape; relations cite guides from features/decisions; lens projections surface guides by topic.
2. **Updating docs IS substrate work** — authored via canonical surfaces; attested via DispatchContext; auth-gate-confirmed for non-trivial changes; migrations declared when formats evolve.
3. **The framework's evolution carries its docs forward** — schema-migration mechanism applies; new framework versions ship updated guides via install ceremony.

The framework demonstrates its own correctness by using itself to document itself. If the substrate vocabulary can't carry good help, the substrate vocabulary needs sharpening — not separate documentation infrastructure.

### Sharp scope question that needs operator-direction

Whether `commands` / `tools` / `runbooks` / `patterns` / `concepts` / `errors` / `axioms` are 7 separate block kinds OR one `usage-guides` block with a category enum. The substrate-canon-discipline argument favors 7 separate kinds (each with sharp purpose + per-kind invariants). The implementation-cost argument favors 1. Both are filable; the choice shapes the rest of the design.