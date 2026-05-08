# POC F output — mode: fail

## error report

Cascade halted at step 3 due to render failure.

### items rendered before halt

- ITEM-001 — First valid item: Body text for item one. Plain prose with no special tokens.
- ITEM-002 — Second valid item: Body text for item two. Also plain prose.

---

## cascade-summary

- mode: fail
- total items: 5
- rendered: 2
- failed steps: 1
- halted at step 3

### failed-step diagnostics

- step 3 (ITEM-003): render: item ITEM-003 body contains forbidden token <<UNPARSEABLE>> — render aborted
