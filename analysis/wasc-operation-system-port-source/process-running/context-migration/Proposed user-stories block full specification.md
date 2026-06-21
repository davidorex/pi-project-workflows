## Proposed `user-stories` block — full specification

---

### Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["schema_version", "stories"],
  "additionalProperties": false,
  "properties": {
    "schema_version": { "type": "string" },
    "stories": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "description", "actor", "category", "status"],
        "additionalProperties": false,
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^US-[A-Z0-9a-z-]+$"
          },
          "description": {
            "type": "string",
            "description": "One-line summary of what the actor does or receives"
          },
          "actor": {
            "type": "string",
            "enum": ["human", "llm", "hybrid"],
            "description": "Who performs the primary action: human user, LLM agent, or collaborative loop"
          },
          "category": {
            "type": "string",
            "enum": [
              "plan_authoring",
              "org_management",
              "onboarding",
              "interface",
              "review",
              "draft_orchestration"
            ],
            "description": "Functional domain of the story"
          },
          "enabling_phase_label": {
            "type": "string",
            "description": "Free-text reference (Phase N, DISC-N, DEC-N, architecture, etc.)"
          },
          "vivifying_commit": {
            "type": "string",
            "pattern": "^[a-f0-9]{7,40}$",
            "description": "Git SHA that enabled the capability"
          },
          "status": {
            "type": "string",
            "enum": ["pending", "enabled", "vivified"]
          },
          "created_at": { "type": "string" }
        }
      }
    }
  }
}
```

---

### Actor/category mapping for all 104 existing stories

| Story range | Count | actor | category |
|-------------|-------|-------|----------|
| US-1..22, US-ext, US-ext-milestone | 26 | human | plan_authoring |
| US-ORG-1..20 | 20 | human | org_management |
| US-ONB-1..5 | 5 | human | onboarding |
| US-UI-1..13 | 13 | human | interface |
| US-REV-1..5 | 5 | human | review |
| US-LLM-1..22 | 22 | llm | plan_authoring |
| US-LLM-23, US-LLM-24, US-LLM-25 | 3 | hybrid | draft_orchestration |
| US-DRAFT-1..3 | 3 | hybrid | draft_orchestration |

---

### Lenses

**1. `user-stories-by-status`**
```json
{
  "id": "user-stories-by-status",
  "kind": "target",
  "target": "user-stories",
  "derived_from_field": "status",
  "bins": ["pending", "enabled", "vivified"]
}
```

**2. `user-stories-by-actor`**
```json
{
  "id": "user-stories-by-actor",
  "kind": "target",
  "target": "user-stories",
  "derived_from_field": "actor",
  "bins": ["human", "llm", "hybrid"]
}
```

**3. `user-stories-by-category`**
```json
{
  "id": "user-stories-by-category",
  "kind": "target",
  "target": "user-stories",
  "derived_from_field": "category",
  "bins": [
    "plan_authoring",
    "org_management",
    "onboarding",
    "interface",
    "review",
    "draft_orchestration"
  ]
}
```

---

### Relation types

| canonical_id | category | source_kinds | target_kinds | Purpose |
|--------------|----------|-------------|-------------|---------|
| `story_enabled_by_phase` | ordering | user-stories | phase | Clean link when enabling_phase_label resolves to PHASE-NNN |
| `story_vivified_by_commit` | data_flow | user-stories | * | Commit SHA that landed the capability |
| `story_traces_to_decision` | data_flow | user-stories | decisions | DEC referenced in description or label |
| `story_blocked_by_gap` | data_flow | user-stories | framework-gaps | Story pending due to a DISC |

---

### Migration path from MD

1. `write-schema create user-stories` — define the schema
2. `amend-config block_kinds add user-stories` — register the block kind
3. `amend-config relation_types add` ×4 — register edges
4. `amend-config lenses add` ×3 — register views
5. Decompose `phases/US-STATUS.md` via script — 104 JSON items into `user-stories.json`
6. Backfill `actor` and `category` fields via deterministic prefix-to-value mapping
7. Curation pass: add `story_enabled_by_phase` edges where `enabling_phase_label` cleanly matches a registered phase

---

### What this enables

- `filter-block-items --block user-stories --field actor --op eq --value llm` returns exactly the 22 LLM-proposal stories
- `filter-block-items --field category --op eq --value plan_authoring` returns all 48 stories (26 human + 22 llm) in the plan-authoring domain
- `context-view user-stories-by-actor` surfaces the LLM/human/hybrid split as a first-class project view
- The post-Phase-15 verification pass becomes a substrate query: count of `status == enabled && actor == human` stories awaiting human exercise