# POC F output — mode: skip

## injected context (wrapped block delivered to agent)

<<<INJECTED_CONTEXT>>>
- ITEM-001 — First valid item: Body text for item one. Plain prose with no special tokens.
- ITEM-002 — Second valid item: Body text for item two. Also plain prose.
- ITEM-004 — Fourth valid item: Body text for item four. Plain prose with no special tokens.
- ITEM-005 — Fifth valid item: Body text for item five. Plain prose with no special tokens.
<<<END_INJECTED_CONTEXT>>>

---

## cascade-summary

- mode: skip
- total items: 5
- rendered: 4
- failed steps: 1
- skipped 1 step

### failed-step diagnostics

- step 3 (ITEM-003): render: item ITEM-003 body contains forbidden token <<UNPARSEABLE>> — render aborted
