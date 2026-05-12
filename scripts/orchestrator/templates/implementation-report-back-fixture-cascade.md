TABLES-ONLY rule applies. NO prose summary, NO recommendations narrative, NO "executive summary".

Return only:
1. Commit SHA: `<sha>`
2. Per-row applied-yes/skipped-no count from the cascade-target table (orchestrator will verify by re-counting; agent reports the integers it acted on)
3. Anti-pattern check: PASS or FAIL with named violation

Optional: write detailed per-row applied/skipped table to `compiled-contexts/c3-impl-applied.md`. NO interpretation, NO commentary.
