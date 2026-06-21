---
name: catalogue-gate-no-db-enumerated-rejection
description: "the free-text catalogue-gate (planner/_freetext_audit.py) must NEVER reject a value enumerated in the school's DB; reject only genuine fabrications. Fix globally: union completeness + variant-tolerant admission, not per-entity patches"
metadata: 
  node_type: memory
  type: project
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

The DEC-40/DISC-31 free-text proper-name catalogue-gate (`school-improvement-plans/planner/_freetext_audit.py`, `CatalogueUnion` + `build_catalogue_union` + `admits`) exists to catch HALLUCINATED proper nouns — names NOT in the school's enumerated universe. Its binding correctness invariant (user directive, "think globally"): **it must never reject a value that IS enumerated in the school's DB.** A true DB value rejected is a false-positive bug. The gate rejects ONLY genuine fabrications (spans with no DB-enumerated source).

This has TWO failure modes, both of which the fix must close globally — not with narrow per-entity patches:
1. **Catalogue-union completeness** — `build_catalogue_union` must pull EVERY enumerable DB field that can legitimately appear in prose into the allowed union (school name + slug, divisions, positions, stakeholder groups, policies, accreditation standards, learner outcomes, areas for improvement, frequencies, improvement types, planning methods, year groups, mvv clauses, AND any value-word enumerations like learner-outcome values, e.g. "Caring"). A real DB value missing from the union → false rejection.
2. **Variant-tolerant admission** — `admits` must accept reasonable formatting/derivation variants of an enumerated value: hyphen↔space/underscore, casing, surrounding whitespace, possessives, and the school's **short/brand form** (e.g. "Chiway-Repton" for "Chiway Repton School Xiamen"). Exact-casefold-only membership false-rejects real values rendered in natural prose.

**Why:** Surfaced when the gate rejected the school's own name (hyphen vs space DB form), then its brand short form ("Chiway-Repton's"), then an enumerated value word ("Caring"). The user's correction: "of course the short-form of the school's name should be accepted. and any enumerated from db e.g. caring similarly cannot be rejected." A narrow school-name-only patch is the wrong shape — the principle is global.

**How to apply:** When touching the catalogue-gate, fix at the level of the principle: make the union complete against the DB enumerations and make admission variant-tolerant for enumerated values, while preserving rejection of non-DB fabrications. Verify with: every DB-enumerated value (and its natural-prose variants/short forms) admits; a genuinely non-DB span still rejects. Do not regress the anti-fabrication purpose. Relates to [[context-substrate-is-this-repo]].
