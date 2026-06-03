Here's how I'd think through designing a **"using pi-context"** help block — a living, queryable how-to source that teaches through being operated upon.

---

## Core Idea

The block is **self-demonstrating documentation**. Every interaction with it — reading, filtering, joining, relating, validating — is simultaneously a lesson in how pi-context works. An LLM (or human) learns the tool *by using the tool on the help content itself*.

---

## 1. Schema Design: `using-pi-context.schema.json`

A new block kind with array key `guides`. Each item is a discrete how-to topic.

```json
{
  "guides": [
    {
      "id": "GUIDE-001",
      "title": "Initialize a new substrate",
      "topic": "bootstrap",
      "level": "beginner",
      "summary": "Create the substrate skeleton, adopt the canonical config, and install schemas...",
      "content": "...detailed narrative with embedded example calls...",
      "examples": [
        {
          "tool": "context-init",
          "params": { "contextDir": ".context" },
          "description": "Bootstrap the substrate directory"
        }
      ],
      "prerequisites": [],
      "related_blocks": ["config", "phase"],
      "related_tools": ["context-init", "context-accept-all", "context-install"],
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

**Key fields:**

| Field | Purpose |
|-------|---------|
| `topic` | Category tag: `bootstrap`, `querying`, `relations`, `validation`, `schemas`, `roadmaps`, `advanced` |
| `level` | `beginner` / `intermediate` / `advanced` — enables filtered discovery |
| `examples` | Structured array of *actual tool calls* with params. Not just prose — machine-parseable demonstrations |
| `prerequisites` | Array of `GUIDE-NNN` IDs. Enables guided learning paths |
| `related_blocks` | Which block kinds this guide touches — useful for cross-referencing |
| `related_tools` | Which tools are demonstrated — enables "show me guides about `append-relation`" |

**Schema annotations:**
- `x-prompt-budget` on `content` and `summary` so agent prompts auto-truncate -- note: no auto-truncate: error-message-like-feedback: "limit of x chars; be concise, zero loss of signal"
- `pattern: "^GUIDE-\\d{3,}$"` on `id`
- `examples.items` as a strict subschema so every example is validateable

---

## 2. Block Kind Registration

```json
{
  "canonical_id": "using-pi-context",
  "display_name": "Using pi-context",
  "prefix": "GUIDE-",
  "array_key": "guides",
  "data_path": "using-pi-context.json",
  "schema_path": "schemas/using-pi-context.schema.json"
}
```

Register via `amend-config` → `block_kinds` add.

---

## 3. Content Strategy: What Goes In

Seed ~15-20 guides covering the full tool surface, organized so that **reading them in order exercises every major pi-context operation**:

| ID | Title | Topic | Level | What it teaches by doing |
|----|-------|-------|-------|--------------------------|
| GUIDE-001 | Initialize a substrate | bootstrap | beginner | `context-init`, `context-accept-all`, `context-install` |
| GUIDE-002 | Switch between substrates | bootstrap | beginner | `context-switch`, `context-list` |
| GUIDE-003 | Read project state | querying | beginner | `read-block`, `read-block-item`, `read-block-page` |
| GUIDE-004 | Query with filters | querying | beginner | `filter-block-items` |
| GUIDE-005 | Resolve IDs across blocks | querying | intermediate | `resolve-item-by-id`, `resolve-items-by-id` |
| GUIDE-006 | Join blocks efficiently | querying | intermediate | `join-blocks` (edge mode + field mode) |
| GUIDE-007 | Add work items | writing | beginner | `append-block-item`, `autoId` |
| GUIDE-008 | Update and mutate items | writing | beginner | `update-block-item` |
| GUIDE-009 | Create relations between items | relations | intermediate | `append-relation` |
| GUIDE-010 | Walk ancestors and descendants | relations | intermediate | `walk-ancestors`, `context-walk-descendants` |
| GUIDE-011 | Find references to an item | relations | intermediate | `find-references` |
| GUIDE-012 | View items through lenses | lenses | intermediate | `context-edges-for-lens`, `/context view` |
| GUIDE-013 | Validate substrate integrity | validation | intermediate | `context-validate`, `context-validate-relations` |
| GUIDE-014 | Schema versioning and migrations | schemas | advanced | `write-schema`, `write-schema-migration` |
| GUIDE-015 | Work with roadmaps | roadmaps | intermediate | `context-roadmap-list`, `context-roadmap-load`, `context-roadmap-render` |
| GUIDE-016 | Promote items across substrates | advanced | advanced | `promote-item` |
| GUIDE-017 | Compose execution context | advanced | advanced | `gather-execution-context` |

---

## 4. Relation Design: Connecting Guides to Work

Guides shouldn't be orphans. They should participate in the closure table:

**New relation types to register:**

| `canonical_id` | Purpose |
|----------------|---------|
| `task_addresses_guide` | A task is learning from / implementing a guide |
| `guide_prerequisite_for_guide` | Learning-path ordering (alternative: reuse `task_depends_on_task` pattern) |
| `guide_references_block` | A guide is about a specific block kind |

Or simply use the existing generic relations:
- `research_informs_item` — research informs a guide
- `item_derived_from_item` — guide v2 derived from guide v1

**Demonstration value:** When an LLM asks "what tasks are learning from the bootstrap guide?", it runs `join-blocks` with `relationType: task_addresses_guide` — which itself teaches `join-blocks`.

---

## 5. Lens Design: Grouped Views

Register a lens in `config.json`:

```json
{
  "id": "guides-by-topic",
  "kind": "target",
  "target": "using-pi-context",
  "derived_from_field": "topic",
  "bins": ["bootstrap", "querying", "writing", "relations", "validation", "schemas", "roadmaps", "advanced"],
  "render_uncategorized": false
}
```

**Demonstration value:** Running `/context view guides-by-topic` groups help content by topic — and the act of viewing it demonstrates what lenses are.

Optionally a second lens `guides-by-level` with `derived_from_field: "level"`.

---

## 6. Usage Patterns: How It Teaches

Here's the key meta-loop. An LLM encounters pi-context for the first time:

1. **Discovery**: LLM runs `context-status` → sees block summaries including `using-pi-context: { guides: { total: 17 } }`
2. **Browsing**: LLM runs `filter-block-items` on `using-pi-context` where `level` eq `beginner`
3. **Reading**: LLM runs `read-block-item` on `using-pi-context` / `GUIDE-001`
4. **The guide says**: "To initialize, run `/context init .context`" — but it ALSO says "the tool signature is `context-init` with param `contextDir`"
5. **Demonstration**: LLM executes `context-init` — and the substrate now has a new dir
6. **Cross-referencing**: LLM sees `prerequisites: []` and `see_also: ["GUIDE-002"]` — learns how guides chain

**For humans**: A user can `grep` the block file, or run `pi -p "show me beginner guides"` with `--tools filter-block-items,read-block-item`.

---

## 7. Packaging Question

Two paths:

**A. Project-local only** (immediate): Add the schema + block kind + seed content to this repo's active substrate (`.context-jit-spec-v2`). It becomes living documentation for this project.

**B. Packaged sample** (deeper): Add `using-pi-context` to `samples/conception.json` as an installable block kind. Every new project that runs `/context accept-all` gets a self-documenting substrate. This creates a virtuous cycle: the framework ships with its own help system.

The packaged-sample path is compelling because it makes pi-context **self-hosting** in a pedagogical sense. The SKILL.md could even be *generated* from the block (reverse of the current flow where skills are generated from source). `scripts/generate-skills.js` would query `using-pi-context.json` and emit SKILL.md sections.

---

## 8. Why This Beats Static Documentation

| Static (SKILL.md) | Substrate Block |
|-------------------|-----------------|
| Read-only | Queryable (`filter-block-items`, `join-blocks`) |
| Flat structure | Hierarchical via `prerequisites` + relations |
| No versioning | Content-addressed (`oid`, `content_hash`, `content_parent`) |
| No cross-references to work | Can relate tasks → guides, guides → decisions |
| Not validateable | Schema-enforced structure |
| Not discoverable via lenses | Lens-viewable by topic/level |
| Hand-edited | Edited via the same tools it documents |

---

## 9. Implementation Sequence (if we were to do it)

1. `write-schema` → create `using-pi-context.schema.json`
2. `amend-config` → register `block_kinds` entry
3. Seed initial `guides` array with ~17 items via `append-block-item` (or batch via `write-block` if empty)
4. `amend-config` → register `guides-by-topic` lens
5. Optionally register `task_addresses_guide` relation type
6. `context-validate` → ensure everything is clean
7. `npm run skills` → optionally wire `generate-skills.js` to pull from the block

---

The elegant thing is that **step 3 itself would be documented in GUIDE-007** ("Add work items"). The help system teaches you how to build the help system.