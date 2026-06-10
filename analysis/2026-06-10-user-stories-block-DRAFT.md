# DRAFT — user-stories block, proposed changes (for evaluation)

**Status: proposal, uncommitted, for your evaluation. Not filed.** Built on the existing `story` kind. Step by step.

## Step 1 — Relabel the existing kind
- `canonical_id`: `story` — unchanged (use existing).
- `display_name`: → "User Stories".
- id pattern: `STORY-NNN` — unchanged.

## Step 2 — Story text
- The user-story sentence ("As a `<user_kind>`, I want/expect …, so that …") goes in the existing `description` field. No new text field.

## Step 3 — Add one field
- `user_kind`: free-text string, no enum. Examples: `cli-user`, `in-pi-llm-user`, `in-pi-human-user`.

## Step 4 — Role 1: a user story as a starting point
- A downstream `research` / `framework-gaps` / `issues` / `tasks` item cites the story it came from with the **existing** `item_derived_from_item` edge (downstream item → story). No new relation.

## Step 5 — Role 2: a user story as success criteria
- Two new relation types:
  - `task_advances_story` (task → story)
  - `feature_advances_story` (feature → story)
- Two relations, not one combined story↔(task|feature): a story relates to a task, a feature, or both — kept separate so task-criteria and feature-criteria lens separately.

## Step 6 — when a story is met, and the completion rule
- A story is met when the task or feature advancing it has met its success criteria.
- A task or feature can't be complete until every story it advances is met.

Your two cases:
- A task advances 1 story → when that task meets its success criteria, the story is met.
- A feature advances 3 stories, 2 met → the set is not met → the feature can't be complete until all 3 are met.

## Not changing / dropped (my earlier inventions, removed)
- No new `statement` field — text lives in `description`.
- No `verification_verifies_item` requirement on stories.
- No `user-stories-by-status` lens.
- No id-prefix rename.
- No quantifier beyond "every" (Step 6).
- Existing edges `feature_contains_story` / `story_contains_task` / `story_depends_on_story` / `story_gated_by_item`: untouched, unused by these roles.

## Net new vocabulary
- 1 field (`user_kind`), 2 relation types (`task_advances_story`, `feature_advances_story`), and the enforcement of the Step 6 completion rule (one invariant). Everything else reused.
