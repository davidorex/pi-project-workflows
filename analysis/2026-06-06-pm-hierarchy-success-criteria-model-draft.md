# Project-tracking model — current understanding (draft)

## How work is organized
- Work is tracked at three levels: milestone, then phase, then task.
- A task is the smallest piece of work.
- A phase is a group of tasks that belong together.
- A milestone is a checkpoint that a set of phases adds up to.

## Planning can start from any direction
- There is no single correct way to plan, and the same structure can be built from any direction.
- Top-down: a user picks the next priority, sets it as a milestone, then names the phases and tasks needed to reach it.
- Bottom-up: a user takes gaps and issues that already exist, groups their tasks into phases, and groups those phases into a milestone.
- From unmet stories: a user surveys the stories not yet met and organizes new phases and tasks to meet them.
- Planning does two things at once — organizing work that already exists and naming new work.

## How something counts as done
- Each level is done when the level directly beneath it is done.
- A task is done when all of its success criteria pass, a phase is done when its tasks are done, and a milestone is reached when its phases are done.
- You only ever check one level down, so done-ness adds up the chain on its own with no separate "is this finished?" step.
- This upward roll-up is the one fixed direction, even though planning itself can start from anywhere.

## Success criteria (only tasks have them)
- A task's success criterion is a short record holding a pass-or-fail statement, its current pass or fail, and who checked it, when, and what proved it.
- Because each criterion carries its own proof, there is no separate verification record — the criterion is the proof.
- Phases and milestones have no success criteria of their own and are done only when their children are done.
- A criterion's statement must be a plain, checkable yes-or-no claim, or it is not valid.

## Milestones
- A milestone has an id, a name, a status of either planned or reached, and an optional release tag.
- A milestone's status is worked out from its phases, never set by hand.
- The optional release tag (for example "0.30.1") groups everything that shipped together.

## Stories
- A story is a theme that cuts across the work, not a level in the done-ness chain.
- Stories are the main way work gets organized, sitting across every level rather than being a step in any one route.
- A story holds only an id, a one-sentence description, and a status of either draft or set.
- A story is connected to whatever tasks, phases, or milestones it touches, and a milestone can be described as the sum of certain stories.

## Roadmap
- A roadmap is a view, not a stored thing of its own.
- The only thing a roadmap needs stored is the order of the milestones.
- The roadmap view shows the milestones in order and lets a user drill from that big picture down to a single task's pass or fail.

## How everything connects
- Items are joined by links between them, not by lists written inside each item.
- One general "this story includes that item" link lets a story attach to a task, a phase, or a milestone alike.

## Context attached to the work
- Gaps, issues, and decisions attach to the specific item they concern, so they appear in context as a user drills down.

## What this changes about what we've already written down
- The earlier note that phases need their own success criteria no longer holds, because phases have none.
- Tasks still move from "acceptance criteria" to "success criteria," but each criterion becomes a record (statement, pass or fail, proof) rather than a line of text.
- The rule that criteria must be plain yes-or-no claims applies to the task-level statements.
- The plan to add a milestone type still stands, now with no "intent" field, no built-in query, a status that is derived, and the optional release tag.
- We should remove the separate verification type and fold its proof details into the criterion.

## Still open
- The link for the levels that exist is already there (a task is placed in a phase, and done-ness reads up that link), so nothing is missing at that level.
- What is unsettled is the milestone-to-phase link, which does not exist yet because the milestone level is not built, and whether done-ness reuses those plain placement links or gets its own dedicated link.
