# Decisions audit: open-but-decided (mis-statused) class

Date: 2026-06-14
Active substrate: `.context` (confirmed from `.pi-context.json` `contextDir`).
Read-only audit. No status was changed (status advancement is a user-directed, provenance-gated write).

## Authority — the status enum

Read verbatim via `pi-context read-schema --schemaName decisions --path properties.decisions.items.properties.status`:

- **open** = "decision needs to be made; gates work."
- **enacted** = "ratified by user authority; new constraint is in code and forward-looking constraint blocks."
- **superseded** = "withdrawn without enactment; the entry was filed under proliferation pressure or on incorrect framing and is acknowledged as not-a-real-decision."

## Method

Enumerated every decision via `pi-context read-block-page --block decisions` (three pages of 6; `total` = 18, no items past offset 12). Recorded `id` + `status` for all 18. The class under audit is decisions whose `status` is `open`.

## Enumeration — id + status (all 18)

| id | status |
|----|--------|
| DEC-0001 | enacted |
| DEC-0002 | enacted |
| DEC-0003 | enacted |
| DEC-0004 | enacted |
| DEC-0005 | enacted |
| DEC-0006 | enacted |
| DEC-0007 | enacted |
| DEC-0008 | enacted |
| DEC-0009 | enacted |
| DEC-0010 | enacted |
| DEC-0011 | enacted |
| DEC-0012 | enacted |
| DEC-0013 | enacted |
| DEC-0014 | enacted |
| DEC-0015 | enacted |
| DEC-0016 | enacted |
| DEC-0017 | enacted |
| DEC-0018 | enacted |

## Open-decision table (the audit target)

There are **zero** decisions with `status: open`. The table of every open decision is therefore empty:

| id | decision-gist | verdict | evidence |
|----|---------------|---------|----------|
| (none) | — | — | — |

## Reference-point confirmation (the four named in the brief)

The brief named DEC-0013, DEC-0014, DEC-0015, DEC-0018 as already advanced `open -> enacted` this session — confirm they now read `enacted` and are excluded from any remaining count.

| id | status now | confirmed |
|----|-----------|-----------|
| DEC-0013 (`pi-context` ships as own publish unit) | enacted | yes |
| DEC-0014 (`pi-bound` is a CLI process mode, not an op) | enacted | yes |
| DEC-0015 (`--pi-bound` composes via in-process `loadContext`) | enacted | yes |
| DEC-0018 (update transactional model: per-component) | enacted | yes |

All four read `enacted`. None remain `open`.

## Counts

- Total decisions in block: **18**
- Total `open` decisions: **0**
- Mis-statused (open-but-decided → should be `enacted`): **0**
- Genuinely open: **0**
- Should be `superseded`: **0**
- Ambiguous (flagged for user judgment): **0**

## Conclusion

The class is empty. No decision in `.context` is currently mis-statused as `open` while actually decided. The whole decisions block is `enacted` (DEC-0001..DEC-0018). There is no open-but-decided remediation to surface; no status change is proposed.
