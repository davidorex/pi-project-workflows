---
name: feedback-no-augmenting-user-stories
description: "when generating user stories/requirements, include ONLY what the user stated or what is strictly entailed; never add conventional/adjacent features (notifications, acknowledgments, reminders, dashboards…) because they're 'natural' or appear in prior-art tools"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

When writing user stories or a requirement set, generate **only** from what the user has actually stated or what is strictly entailed by it. Do NOT add conventional or adjacent capabilities just because they are common in similar tools, surfaced in prior-art research, or feel like a "natural" part of the lived experience. Inventing requirements is augmentation (mandate-002), and then parking the inventions as "scope decisions for the user" compounds it.

**Why:** I added `notifications` and `acknowledgment` stories to an org-model story set. The user: "no notifications/acknowledgment; never even considered or raised by me." They were my augmentation, not the user's intent — they were never on the table.

**How to apply:**
- The user's stated intent is the whole boundary. If they said "people can SEE what they're responsible for," that's pull (a view) — do not extrapolate to push (notifications) or handshakes (acknowledgment).
- Prior-art research informs *how* to build what's wanted; it is NOT a source of new requirements. Don't import features because Asana/monday/ClearPoint have them.
- If something genuinely seems missing, ask whether it's intended — don't silently fold it into the requirement set as built-in, and don't relabel it a "scope decision." Pairs with [[feedback-noted-gap-is-a-work-item]], [[feedback-cost-is-not-disqualifying]], [[feedback-no-options-when-path-clear]].
- Necessary-for-intended-use ⇒ in scope (not deferrable); not-raised-by-user ⇒ not a requirement at all (not "deferred"). Keep those two cleanly separate.
