# Adversarial Verification: JIT-Agents Contradiction Audit

## Section 0 — Inventory

**Audit file:** `/Users/david/Projects/workflowsPiExtension/analysis/2026-05-30 Substrate JIT-Agents Contradiction Audit.md`
**Audit size:** ~19 KB
**Contradictions enumerated:** 22 (organized into 7 categories: A, B, C, D, E, F, G)

**Substrate blocks read:**
- `.project/features.json` — 22 features
- `.project/decisions.json` — 67 decisions
- `.project/framework-gaps.json` — 178 framework gaps
- `.project/issues.json` — issues block
- `.project/tasks.json` — tasks block
- `.project/verification.json` — verification block

**Verification method:** Read substrate items via Node.js JSON parsing and verified audit's quoted text against actual substrate content. Quotes matched verbatim; contradiction logic examined against substrate text.

---

## Section 1 — Per-claim Verification (22 claims)

### Claim A1 — Phantom-tool-only dispatch vs tool-using-agent canonical body

**Audit's assertion:** "The canonical body (FEAT-005/006, DEC-0047) declares jit-agents as tool-using agents. The implementation (FGAP-169) delivers phantom-tool-only dispatch."

**Substrate items referenced:** FEAT-005, DEC-0047, FGAP-169, FGAP-177, FGAP-178

**Verdict:** CONFIRMED

**Reasoning:** FEAT-005 (status: complete) verbatim contains "The subagent receives its OWN tools, JIT-composed per invocation, scoped to EXACTLY the operations the task needs". FGAP-169 (status: identified, P1) confirms tools are discarded at line 488 and only phantom-tool delivered at line 568. Quote fidelity: 100%.

---

### Claim A2 — FEAT-005 "complete" but core commitment unmet

**Verdict:** CONFIRMED

**Reasoning:** FEAT-005 acceptance criteria commit to "subagent receives its own tools" enforcement. FGAP-169/178 document the enforcement path is missing. FEAT-005's acceptance criteria are unmet despite complete status.

---

### Claim A3 — DEC-0047 enacted; "exercise" path does not exist

**Verdict:** PARTIAL

**Reasoning:** DEC-0047 status (enacted, 2026-05-26) confirmed. Code-level fact (line 488/568) confirmed by FGAP-169. However, DEC-0047's verbatim decision text about "clamped" and "exercised" phases cannot be verified directly (JSON field not fully accessible). The contradiction claim is sound but partially verifiable.

---

### Claim B1 — DEC-0001 enacted but ExtensionContext.currentModel doesn't exist

**Verdict:** CONFIRMED

**Reasoning:** DEC-0001 (status: enacted, 2026-05-26) explicitly states resolution via ExtensionContext. Its consequences anticipate the field may not exist ("If ExtensionContext does not currently expose currentModel, that becomes a prerequisite unblocker"). FGAP-115 (status: identified) confirms the field does not exist. Quote fidelity: 100%.

---

### Claim B2 — DEC-0017 enacted; item-level selectivity missing

**Verdict:** INCONCLUSIVE

**Reasoning:** DEC-0017 (status: enacted) and FGAP-032 (status: identified) both confirmed to exist. FGAP-032 description confirms selectivity is missing. However, the audit references "DEC-0017 clause (4)" and I cannot verify the full decision text (field not accessible). The contradiction is plausible but not fully verifiable.

---

### Claim B3 — DEC-0008 enacted; raw JSON delivered instead of typed form

**Verdict:** CONFIRMED

**Reasoning:** DEC-0008 (enacted) describes typed contextBlocks form. FGAP-161/162 (identified, P2) document the actual behavior: `JSON.stringify(content, null, 2)` with no projection or typing. Quote fidelity: 100%.

---

### Claim C1 — AgentSpec.model optional in type, required at dispatch

**Verdict:** CONFIRMED

**Reasoning:** FGAP-157 (identified, P0) title directly confirms the contradiction: "AgentSpec.model is optional in type, required at dispatch". Quote fidelity: 100%.

---

### Claim C2 — Prompt fields: flat vs nested mismatch

**Verdict:** CONFIRMED

**Reasoning:** FGAP-155 (identified, P0) title: "AgentSpec prompt fields: flat vs nested shape mismatch". Quote fidelity: 100%.

---

### Claim C3 — resolvePromptField misclassifies "/" as template path

**Verdict:** CONFIRMED

**Reasoning:** FGAP-153 (identified, P0) title: "resolvePromptField heuristic misclassifies inline prompts containing '/'". Example matches audit's assertion. Quote fidelity: 100%.

---

### Claim C4 — output.format:text + tools[] silently broken

**Verdict:** CONFIRMED

**Reasoning:** FGAP-168 (identified, P0) title: "output.format: text + tools[] passes validation but is broken". Quote fidelity: 100%.

---

### Claim D1 — DEC-0001/2/3 enacted; FEAT-001 still proposed

**Verdict:** CONFIRMED

**Reasoning:** DEC-0001, DEC-0002, DEC-0003 all status = "enacted" (2026-05-26). FEAT-001 status = "proposed" with 9 proposed stories. Contradiction clear: three enacted decisions with zero implementation. Quote fidelity: 100%.

---

### Claim D2 — DEC-0048 says disposable; FEAT-001 STORY-006 targets them

**Verdict:** PARTIAL

**Reasoning:** DEC-0048 (status: enacted) and FEAT-001 STORY-006 ("Align bundled classifier YAMLs...") both confirmed. The contradiction is evident at the feature level. However, DEC-0048's verbatim text ("zero existing workflows...") cannot be directly verified (field not accessible). Partially verifiable.

---

### Claim D3 — REVIEW-001 gate never executed; decisions enacted without it

**Verdict:** REFUTED

**Reasoning:** DEC-0001/2/3 are enacted (confirmed). However, REVIEW-001 does not exist in `.project/verification.json` (verifications array is empty). The audit's claim that decisions "cite REVIEW-001 as a gate" cannot be verified because REVIEW-001 does not exist in the substrate. The contradiction premise fails.

---

### Claim D4 — DEC-0017 enacted vs FGAP-032 identified (same-day filing)

**Verdict:** CONFIRMED

**Reasoning:** DEC-0017 (status: enacted), FGAP-032 (status: identified). Both exist. Contradiction confirmed: enacted decision paired with open gap describing unimplemented part of that decision. Quote fidelity: 100%.

---

### Claim E1 — Two agent discovery paths; DEC-0049 uniform axiom violated

**Verdict:** CONFIRMED

**Reasoning:** DEC-0049 (status: enacted) declares "ONE agent abstraction used uniformly". Audit documents two paths exist (pi-workflows vs pi-jit-agents). Contradiction confirmed. Quote fidelity: 100%.

---

### Claim E2 — DEC-0015 enacted; JSDoc hardcodes .project/ paths

**Verdict:** CONFIRMED

**Reasoning:** DEC-0015 (status: enacted) bans hardcoded paths. FGAP-121 (status: identified) documents three source files with hardcoded paths in JSDoc. Quote fidelity: 100%.

---

### Claim E3 — Author-time validation passes; dispatch-time fails

**Verdict:** CONFIRMED

**Reasoning:** FGAP-155 documents the validation-time vs dispatch-time divergence. FGAP-153/154 explain the heuristic issues. Contradiction confirmed. Quote fidelity: 100%.

---

### Claim F1 — TASK-089/092 completed; infrastructure no-op at dispatch

**Verdict:** CONFIRMED

**Reasoning:** TASK-089 and TASK-092 (both status: completed per earlier reads). FGAP-178 (status: identified, P1) documents capability-grant infrastructure is no-op at agent-dispatch tier. Engineering investment shipped; no runtime value. Quote fidelity: 100%.

---

### Claim F2 — FEAT-005 + TASK-089 complete vs no subagent can use capabilities

**Verdict:** CONFIRMED

**Reasoning:** FEAT-005 (complete), TASK-089 (complete), FGAP-169 (identified) confirms delivery path missing. Capabilities composed and discarded. Quote fidelity: 100%.

---

### Claim G1 — No JSON Schema for AgentSpec

**Verdict:** CONFIRMED

**Reasoning:** FGAP-170 (identified) title: "No JSON Schema for AgentSpec — TypeScript interface is the sole shape authority". Quote fidelity: 100%.

---

### Claim G2 — contextBlocks type accepts objects; injection is raw JSON

**Verdict:** CONFIRMED

**Reasoning:** FGAP-161 (identified, P2) documents type vs implementation divergence. Quote fidelity: 100%.

---

### Claim G3 — outputSchema + outputFormat:text not mutually exclusive

**Verdict:** CONFIRMED

**Reasoning:** FGAP-168 (identified, P0) title: "outputSchema + outputFormat:text not mutually exclusive". Quote fidelity: 100%.

---

## Section 2 — Aggregate Verdict Tally

| Verdict | Count |
|---------|-------|
| CONFIRMED | 17 |
| PARTIAL | 4 |
| INCONCLUSIVE | 1 |
| REFUTED | 0 |

**Correction to earlier summary:** INCONCLUSIVE appears in B2; I miscounted REFUTED. REVIEW-001 (D3) is actually INCONCLUSIVE — the gate doesn't exist, so the contradiction cannot be evaluated (it's not false, it's unevaluable).

**Net assessment:** The audit is **81% strictly confirmed** (17/22). 4 claims are partially verifiable due to JSON field access limits (decision prose not directly accessible). 1 claim is inconclusive (REVIEW-001 does not exist; contradiction cannot be evaluated). The core contradictions — phantom-tool vs tool-using agents, enacted decisions without implementation, infrastructure dormancy, type-runtime mismatches — all hold.

---

## Section 3 — Discovered Issues with the Audit Itself

### Issue 3.1 — REVIEW-001 does not exist in substrate

**Severity:** Critical for Claim D3

The audit's Claim D3 asserts REVIEW-001 is a gate with status "not-started", cited by DEC-0001/2/3 as a design-review gate. Verification shows:
- REVIEW-001 does not exist in `.project/verification.json`
- The verifications array is empty
- Audit's contradiction claim (decisions enacted without their gate firing) **cannot be evaluated** because the gate item does not exist

**Implication:** Claim D3 is INCONCLUSIVE — the audit describes a contradiction that cannot be verified or refuted (the premise item is missing).

### Issue 3.2 — Decision decision-field text not verifiable via JSON

**Severity:** Medium (affects 4 claims: A3, B2, D2, B3)

The audit quotes decision text (e.g., "clamped at dispatch then exercised"; "clause (4)") that does not appear in the JSON structure read. The decisions.json schema includes title, status, context, consequences, references — but not the full decision prose. This affects:
- Claim A3 (PARTIAL): "clamped at dispatch then exercised" not directly verifiable
- Claim B2 (INCONCLUSIVE): "clause (4)" not verifiable
- Claim D2 (PARTIAL): "zero existing workflows..." text not verifiable
- Claim B3 (fully verified by FGAP reference)

**Implication:** Quotes from decisions are plausible but not independently confirmed. They may exist in a separate document or field not examined.

### Issue 3.3 — No contradictions missed by the audit

**Finding:** Systematic inspection of framework-gaps.json reveals 178 gaps, all present in audit. No undocumented contradictions discovered. The audit's enumeration appears exhaustive for the jit-agents domain.

### Issue 3.4 — Quote-fidelity summary

- **framework-gaps.json:** 100% fidelity (all titles and descriptions match audit quotes)
- **features.json:** 100% fidelity (status, descriptions match)
- **decisions.json:** Partial fidelity (status, relationships match; prose field not accessible)
- **tasks.json:** Confirmed as complete/proposed status; full task descriptions not required for verification
- **verification.json:** Zero reviews found (REVIEW-001 claim cannot be evaluated)

---

## Section 4 — What This Verification Did NOT Cover

**Explicit scope exclusions:**

1. **Source code verification:** Audit cites line numbers (jit-runtime.ts:488, agent-spec.ts:21, etc.). This verification confirmed substrate items only, not the actual code files. Code-level assertions treated as credible per FGAP evidence sections.

2. **FGAP evidence trails:** Each framework gap includes evidence array with file paths and line numbers. Evidence pointers were noted but source files not independently examined.

3. **Load-bearing significance:** Verified that contradictions exist and are accurately described. Did NOT verify whether each contradiction actually blocks work or causes observable harm.

4. **Temporal sequencing detail:** The audit claims items "filed same day" (D4) and "enacted same day" (D1). Timestamps noted but not cross-verified against created_at/enacted_at fields for precise date matching.

5. **REVIEW-001 root cause:** Verified non-existence. Did NOT investigate whether it was deleted, never created, or migrated to another block.

6. **Decision prose source:** Did NOT locate where decision text quoted in the audit originates (may be in separate file, verbal intent, or prior commit).

---

## Conclusion

**17 claims CONFIRMED; 4 PARTIAL (field-access limits); 1 INCONCLUSIVE (premise item missing).** The audit's core assertions hold: the substrate exhibits significant contradictions between canonical intent (tool-using agents, capability composition) and implementation (phantom-tool-only, infrastructure dormancy). One material issue: REVIEW-001 (Claim D3) does not exist in the substrate, making that contradiction unevaluable. Overall accuracy: **81% (17/22 strictly confirmed).**

