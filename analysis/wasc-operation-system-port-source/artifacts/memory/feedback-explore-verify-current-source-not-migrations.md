---
name: explore-verify-current-source-not-migrations
description: "Explore/eval agents must verify CURRENT model/source state — a thing seeded in an old migration may have been deleted by a later one; grep the live class + delete migrations + tests, not historical seeds or .pyc"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

When an Explore/eval agent claims an entity (model, field, vocabulary) is live, it MUST verify against CURRENT source — not infer existence from a historical seed migration or a stale `.pyc` cache. Migrations are append-only history: a model seeded in migration N may have been DELETED by migration N+k.

**Why:** An Explore agent reported `school.MissionArea` ("Caring and safe community") as live, reasoning from `school/migrations/0011_seed_mission_areas.py` + `.pyc` caches. It had been deleted by DEC-45 (`school/migrations/0061_delete_missionarea.py` — DeleteModel; dependent FK dropped in plans/0047; `ai/0022`/`0025` removed the template blocks; tests assert its absence). The bad finding drove a plan to RE-ADD MissionArea — which would have failed to import AND reversed an enacted decision. The IMPL agent caught it (it grepped current source) where the Explore missed it. User: "that's stupid of the explore agent." Consequence: "Caring" is NOT a current DB-enumerated value, so its catalogue-gate rejection is correct under the very principle ([[catalogue-gate-no-db-enumerated-rejection]]).

**How to apply:**
- To confirm a model/vocabulary is live: `grep -rn "class <Name>" <app>/models/` AND check for a `*_delete_<name>.py` / `DeleteModel` migration AND look for tests asserting its absence — before building on it.
- Treat a hit found only in a seed migration or `.pyc` as NOT a confirmation.
- In Explore briefs, explicitly require "verify against current model definitions + check for later deletion migrations," not just "search the codebase."
- When an Explore finding underpins a plan, spot-verify its load-bearing claims against current source before approving/dispatching IMPL. The orchestrator's relay of an Explore claim is not a substitute for current-source verification.
