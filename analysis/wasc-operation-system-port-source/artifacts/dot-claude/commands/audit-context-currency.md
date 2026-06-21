---
description: Read-only forensic audit of this project's on-file context currency + completeness (dispatches the context-currency-auditor agent; reports only, changes no context). Loop-friendly — /loop 10m /audit-context-currency.
allowed-tools: [Task, Bash(date:*), Bash(mkdir:*), Bash(git rev-parse:*), Read(tmp/context-audits/**), Write(tmp/context-audits/**), PushNotification]
---

<objective>
Dispatch the context-currency-auditor subagent to forensically determine whether this project's on-file context — the decomposed-JSON spine (the seq-6 focus item, ORCHESTRATOR-LOG, subagent-invocations) and the .context substrate — is wholly up-to-the-moment valid and complete, with git AND claude-history as evidence. Surface its report and persist a timestamped copy. Modify NO project or context file.
</objective>

<process>
1. Invoke the `context-currency-auditor` subagent via the Task tool. Directive: "Audit the project at the current working directory per your forensic method. Establish ground truth from git + the decomposed JSON + .context, diff the maintained records against it, attribute every discrepancy via claude-history, and return your structured report. Read-only — change nothing."
2. Persist the subagent's returned report verbatim to `tmp/context-audits/audit-<TS>.md`, where `<TS>` is `date -u +%Y%m%dT%H%M%SZ` (create `tmp/context-audits/` if absent). This is the ONLY write — gitignored scratch, not context.
3. Compute one predicate, **NON-CLEAN** = (the report's final line is `Currency findings: N` with N>0) OR (the report records any `UNVERIFIED` check / its verdict is not `CURRENT + COMPLETE`). Then surface to the session: the report's VERDICT line, its `Currency findings: N` line, and the persisted report path from step 2. If **NON-CLEAN**, also surface the full numbered findings list (each with its evidence + mandate) and any unverified checks.
4. **Notify if and only if NON-CLEAN.** When NON-CLEAN, call `PushNotification` exactly once — `status: "proactive"`, a one-line message under 200 chars leading with what to act on, embedding the **exact** report path written in step 2, e.g. `context audit: 3 currency findings — tmp/context-audits/audit-20260614T053000Z.md`. When NOT non-clean (`CURRENT + COMPLETE`, `Currency findings: 0`, no unverified checks), send NO notification — a clean run is silent. Never send more than one notification per run.
5. **Update the watermark** `tmp/context-audits/.watermark.json` — the only write besides the report. First read the existing watermark to recover the prior `last_clean_head` (if the file is missing or unparseable, treat the prior `last_clean_head` as null — a corrupt scratch file must never silently preserve a stale baseline); get `HEAD` = `git rev-parse HEAD` and `now` = `date -u +%Y-%m-%dT%H:%M:%SZ`. Write `{ "last_clean_head": <SHA|null>, "last_audit_head": "<HEAD>", "last_audit_ts": "<now>", "last_verdict": "CLEAN|FINDINGS|UNVERIFIED" }` where `last_clean_head = HEAD` **if and only if** the verdict was CLEAN (`CURRENT + COMPLETE`, `Currency findings: 0`, no unverified checks); on ANY findings or unverified check, carry the PRIOR `last_clean_head` forward UNCHANGED (or null if there was none). This advance-only-on-clean rule is the whole correctness guarantee — an open finding must never advance the baseline, so the next cycle re-audits the same window and the finding recurs until it is fixed.
</process>

<constraints>
- The subagent is READ-ONLY and has no Write/Edit tools; the ONLY write this command performs is the timestamped report file under `tmp/context-audits/`.
- NEVER modify any `.context`/`context-migration`/project file, and do NOT fix anything — this is report-only. The human decides on any correction.
- Do NOT invoke AskUserQuestion (this is fired non-interactively by /loop); just report.
- Relay the subagent's findings faithfully; do not soften, summarize away evidence, or add a verdict of your own.
- A PushNotification is sent ONLY on a non-clean verdict (findings > 0 or unverified checks). A clean audit (`Currency findings: 0`, no unverified checks) sends nothing — a notification the human did not need erodes the signal. One notification per run, maximum.
- The watermark's `last_clean_head` advances to HEAD ONLY on a CLEAN verdict; a findings or unverified run carries the prior baseline forward unchanged. NEVER advance the baseline past an unresolved finding — doing so would hide it from the next cycle (the silent-pass failure this whole tool exists to prevent).
</constraints>

<success_criteria>
- The context-currency-auditor ran and returned a forensic, evidence-cited report.
- The report was persisted to `tmp/context-audits/audit-<TS>.md` and its verdict + finding count + path surfaced.
- A PushNotification was sent IF AND ONLY IF the verdict was non-clean (findings > 0 or unverified checks); a clean run sent none.
- The watermark `tmp/context-audits/.watermark.json` was updated: `last_audit_head`/`last_audit_ts`/`last_verdict` always; `last_clean_head` advanced to HEAD only on a CLEAN verdict (carried forward unchanged otherwise).
- No `.context`/decomposed/project file was modified by the audit.
</success_criteria>
