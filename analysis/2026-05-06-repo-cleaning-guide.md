Yes — several. Per substantive (not just trust-loop-shallow) review:

**`c5c4725` (step 1 schemas) — directly suspect**: introduced PLAN- prefix collision (issue-089) and four undeclared prefixes (ROADMAP-/PHASE-/MILESTONE-/STORY- per the audit) without surveying `ID_PREFIX_TO_BLOCK`. Under pi-context's config-driven `block_kinds[].prefix`, the schema content survives but the specific prefix-pattern constraints + block-name choices migrate to config rather than schema regex. This commit is the planning-failure root cause for the entire dirty-tree mess.

**`b7bf11b` (step 2 STATUS_VOCABULARY) — partly suspect**: hardcoded TS `STATUS_VOCABULARY` is the exact FGAP-013 antipattern that POC E + pi-context's `config.status_buckets` close structurally. The mapping content is suspect; topoSort + rollupPhaseStatus algorithms are clean and lens-agnostic.

**`5f852b1` (step 4 roadmap primitives) — suspect in implementation, valuable in algorithm**: PM-shape baked into pi-project namespace; validation codes (`roadmap_lens_missing` etc.) hardcoded as TS strings (display-string-as-identity antipattern POC A demonstrates is closeable); milestone-ordering choice open as issue-088. Under pi-context, ~80% of algorithm carries forward as "PM-lens module"; integration points + display strings get reworked.

**`428d29a` (DEC-0012 enacted) — partly suspect**: edges-only authoring is correct under any direction, but the decision's scope (only roadmap+plan ordering edges) is narrower than POC E's general `config.relation_types[]` registry pattern. DEC-0012 may need supersession or extension under pi-context to cover all relation_types as config-declared.

**`7f1596c` (envelope filing) — partly suspect**: FGAP-013 + FGAP-014 still relevant; FGAP-012 implementation done; issues 081-084 resolved (with caveats — 084 carries issue-088); issues 085-087 superseded by pi-context direction (would need rework not continuation).

**`048a2ac` (step 3 composition lens dispatch) — largely clean**: lens primitives (resolveComposition + loadLensView dispatch) are the foundation pi-context's config-driven lenses build on. FGAP-012 implementation closure was real architectural progress. Minor: LensSpec.kind discriminator may need redefinition but the algorithm + cycle detection survive.

**`dda80b0` / `6028a43` / `50e296f` / `09bb46a` / `d2f3d37` (chores) — not suspect**: small status transitions or issue filings via canonical block-api; forensic claims factually accurate; issue-088 is the same finding we're keeping.

**Cross-cutting concern**: the verification loop I ran during steps 1-4 was shallow (tests-pass + lint-clean + spot-check, not substantive design audit). The per-commit substantive trust audit I named as needed earlier in this session has STILL not been performed. Even the "largely clean" 048a2ac assessment above is partially uncorroborated against an adversarial review.

**Net**: roughly 4-5 of the 11 envelope commits carry forward suspect content that the pi-context direction would rework. The chores are clean. Step 3 is mostly clean. Steps 1, 2, 4 + the DEC-0012 + envelope-filing all have suspect surfaces. None are catastrophically wrong (build/test green; substrate functions); they're suspect against the structural-correctness standard the lens-reframe + config-driven architecture introduces.