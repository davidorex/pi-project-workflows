## Block Kind Specification: `using-pi-context`

### 1. Identity

| Property | Value |
|---|---|
| `canonical_id` | `using-pi-context` |
| `display_name` | `Using pi-context` |
| `prefix` | `GUIDE-` |
| `array_key` | `guides` |
| `data_path` | `using-pi-context.json` |
| `schema_path` | `schemas/using-pi-context.schema.json` |

---

### 2. Schema

File: `packages/pi-context/samples/schemas/using-pi-context.schema.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "pi-context://schemas/using-pi-context",
  "version": "1.0.0",
  "title": "Using pi-context",
  "description": "Self-teaching how-to guides for pi-context operations. Each guide demonstrates a specific tool or pattern via narrative and executable examples.",
  "type": "object",
  "required": ["guides"],
  "properties": {
    "guides": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "title", "topic", "level", "summary", "content", "examples"],
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^GUIDE-\\d{3,}$"
          },
          "title": {
            "type": "string"
          },
          "topic": {
            "type": "string",
            "enum": ["bootstrap", "querying", "writing", "relations", "validation", "schemas", "roadmaps", "advanced"]
          },
          "level": {
            "type": "string",
            "enum": ["beginner", "intermediate", "advanced"]
          },
          "summary": {
            "type": "string",
            "x-prompt-budget": {
              "tokens": 500,
              "words": 400
            }
          },
          "content": {
            "type": "string",
            "x-prompt-budget": {
              "tokens": 2000,
              "words": 1600
            }
          },
          "examples": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["tool", "params", "description"],
              "properties": {
                "tool": {
                  "type": "string"
                },
                "params": {
                  "type": "object"
                },
                "description": {
                  "type": "string"
                }
              }
            }
          },
          "prerequisites": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^GUIDE-\\d{3,}$"
            }
          },
          "related_blocks": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "related_tools": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "oid": {
            "type": "string",
            "pattern": "^[0-9a-f]{32}$",
            "description": "Content-independent substrate-stable item identity"
          },
          "content_hash": {
            "type": "string",
            "pattern": "^[0-9a-f]{64}$",
            "description": "SHA-256 of the RFC-8785-canonical content projection"
          },
          "content_parent": {
            "type": "string",
            "pattern": "^[0-9a-f]{64}$",
            "description": "content_hash of the immediately-prior version"
          }
        }
      }
    }
  }
}
```

---

### 3. Block Kind Registration

Insert this entry into `samples/conception.json` `block_kinds[]`:

```json
{
  "canonical_id": "using-pi-context",
  "display_name": "Using pi-context",
  "prefix": "GUIDE-",
  "schema_path": "schemas/using-pi-context.schema.json",
  "array_key": "guides",
  "data_path": "using-pi-context.json"
}
```

---

### 4. Seed Data

File: `packages/pi-context/samples/blocks/using-pi-context.json`

The seed contains exactly 17 items. Every item carries `summary`, `content`, `examples`, `related_blocks`, and `related_tools`. The `examples` array in every item contains at least one object with `tool`, `params`, and `description`.

| ID | Title | Topic | Level | Prerequisites |
|---|---|---|---|---|
| GUIDE-001 | Initialize a substrate | bootstrap | beginner | — |
| GUIDE-002 | Switch and archive substrates | bootstrap | beginner | GUIDE-001 |
| GUIDE-003 | Read blocks and items | querying | beginner | — |
| GUIDE-004 | Filter items by field | querying | beginner | GUIDE-003 |
| GUIDE-005 | Resolve IDs across blocks | querying | intermediate | GUIDE-003 |
| GUIDE-006 | Join blocks in one call | querying | intermediate | GUIDE-003, GUIDE-005 |
| GUIDE-007 | Append new items | writing | beginner | — |
| GUIDE-008 | Update existing items | writing | beginner | GUIDE-007 |
| GUIDE-009 | Remove items | writing | beginner | GUIDE-007 |
| GUIDE-010 | Create relations between items | relations | intermediate | GUIDE-007 |
| GUIDE-011 | Walk ancestors and descendants | relations | intermediate | GUIDE-010 |
| GUIDE-012 | Find references to an item | relations | intermediate | GUIDE-010 |
| GUIDE-013 | View items through lenses | lenses | intermediate | GUIDE-003 |
| GUIDE-014 | Validate substrate integrity | validation | intermediate | GUIDE-010 |
| GUIDE-015 | Schema versioning and migrations | schemas | advanced | GUIDE-007 |
| GUIDE-016 | Work with roadmaps | roadmaps | intermediate | GUIDE-003 |
| GUIDE-017 | Promote items across substrates | advanced | advanced | GUIDE-010, GUIDE-015 |

---

### 5. Relation Types

Insert into `samples/conception.json` `relation_types[]`:

```json
{
  "canonical_id": "guide_requires_guide",
  "display_name": "requires guide",
  "category": "ordering",
  "source_kinds": ["using-pi-context"],
  "target_kinds": ["using-pi-context"]
}
```

```json
{
  "canonical_id": "guide_informs_task",
  "display_name": "informs task",
  "category": "data_flow",
  "source_kinds": ["using-pi-context"],
  "target_kinds": ["tasks"]
}
```

---

### 6. Lenses

Insert into `samples/conception.json` `lenses[]`:

```json
{
  "id": "guides-by-topic",
  "kind": "target",
  "target": "using-pi-context",
  "derived_from_field": "topic",
  "bins": ["bootstrap", "querying", "writing", "relations", "validation", "schemas", "roadmaps", "advanced"]
}
```

```json
{
  "id": "guides-by-level",
  "kind": "target",
  "target": "using-pi-context",
  "derived_from_field": "level",
  "bins": ["beginner", "intermediate", "advanced"]
}
```

---

### 7. Install Manifest

Append `"using-pi-context"` to both `installed_schemas` and `installed_blocks` in `samples/conception.json`.

---

### 8. Generator Integration

`scripts/generate-skills.js` reads `samples/conception.json` for block kind metadata and `samples/schemas/*.schema.json` for field definitions. It does not read block data files.

The new block kind auto-populates three generated tables in `SKILL.md`:
- `<planning_vocabulary>`: row for `using-pi-context` with array key `guides` and item fields
- `<installable_blocks>`: row mapping `using-pi-context` → `samples/blocks/using-pi-context.json`
- `<installable_schemas>`: row mapping `using-pi-context` → `samples/schemas/using-pi-context.schema.json`

No generator code changes.

---

### 9. Runtime Query Patterns

These are the exact queries an agent executes to consume the block:

| Intent | Tool | Parameters |
|---|---|---|
| List beginner guides | `filter-block-items` | block=`using-pi-context`, field=`level`, op=`eq`, value=`beginner` |
| Read a specific guide | `read-block-item` | block=`using-pi-context`, id=`GUIDE-001` |
| Group guides by topic | `/context view` | `guides-by-topic` |
| Find tasks a guide informed | `join-blocks` | leftBlock=`tasks`, rightBlock=`using-pi-context`, relationType=`guide_informs_task`, leftEndpoint=`parent` |
| Find prerequisite guides | `walk-ancestors` | itemId=`GUIDE-002`, relationType=`guide_requires_guide` |
| Find guides that depend on a guide | `context-walk-descendants` | parentId=`GUIDE-001`, relationType=`guide_requires_guide` |

---

### 10. Validation Boundary

`context-validate` enforces cross-block referential integrity on `relations.json` edges. It does not validate inline string-array references such as `prerequisites`, `related_blocks`, or `related_tools`. Those arrays are advisory conventions resolved at query time by the consumer.