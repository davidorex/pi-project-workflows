---
name: run-the-whole-project-gate
description: "verify with the project's ACTUAL gate command (mypy . / make typecheck / full pytest), never a hand-picked file subset — a subset run hides errors in files you didn't name (esp. test files)"
metadata: 
  node_type: memory
  type: project
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

When running the gate to confirm a change, invoke the **project's actual gate command over its full scope** — `uv run --directory school-improvement-plans mypy .` (= the Makefile `typecheck` target, whole tree, 313 files incl. tests), `pytest planner` (not a 2-file subset), `ruff check planner`, `make test-js`. Do NOT hand-pick a file subset (`mypy a.py b.py`) as the gate.

**Why:** Doing A3 I ran `mypy planner/assist.py planner/specs.py planner/_freetext_audit.py planner/views.py` and reported "clean" — but the project gate is `mypy .`, which was RED with 2 errors in `test_a1_narrative.py` (the `parse_narrative → AssistResult` change made `result.prefill` a `dict | list` union that broke a subscript + a `.update`). The subset run named no test file, so it hid them; the adversarial audit caught it. A subset pass is not a gate pass.

**How to apply:**
- Type gate = `mypy .` (whole tree). Test gate = the full relevant suite (e.g. `pytest planner`), not the files you edited. A change to a function's return type ripples into its TEST callers — which a file-subset mypy never sees.
- Prefer the Makefile/CLAUDE.md-named command verbatim (`make typecheck`, `make test-js`) over an ad-hoc narrowed invocation. Relates to [[feedback-use-designated-tooling-not-adhoc]], [[feedback-no-verification-theatre]].
