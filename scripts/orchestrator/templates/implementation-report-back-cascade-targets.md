TABLES-ONLY rule. NO prose summary. NO recommendations narrative. NO "executive summary" / "headline findings" / "in conclusion".

Return only:

```
| Row | Site | File:line | Applied |
|-----|------|-----------|---------|
| 1 | writeBootstrapPointer signature | project-dir.ts:162 | YES/SKIPPED |
| 2 | writeBootstrapPointer JSDoc | project-dir.ts:147-160 | YES/SKIPPED |
| 3 | project-dir.ts module-header JSDoc | project-dir.ts:13-15 | YES/SKIPPED |
| 4 | resolveContextDir JSDoc | project-dir.ts:97-99 | YES/SKIPPED |
| 5 | initProject signature | index.ts:227 | YES/SKIPPED |
| 6 | initProject body comment block | index.ts:228-235 | YES/SKIPPED |
| 7 | initProject body literal site | index.ts:237 | YES/SKIPPED |
| 8 | handleInit signature + body | index.ts:386-403 | YES/SKIPPED |
| 9 | PROJECT_SUBCOMMANDS init dispatch | index.ts:1237 | YES/SKIPPED |
| 10 | context-init tool parameters | index.ts:935 | YES/SKIPPED |
| 11 | context-init tool execute | index.ts:936-948 | YES/SKIPPED |

Commit SHA: <40-char>
Test counts post-commit: pi-context X/Y/Z; pi-jit-agents X/Y/Z; pi-workflows X/Y/Z; pi-behavior-monitors X/Y/Z
Anti-pattern check: PASS | FAIL with named violation
```

NO interpretation. NO commentary. NO closing summary.
