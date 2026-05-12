After your commit lands, the orchestrator runs (you do NOT run these):
- `npm run build; echo "BUILD_EXIT=$?"` — must exit 0 across all 4 packages
- `npm run check; echo "CHECK_EXIT=$?"` — must exit 0 (biome + tsc)
- `npm test 2>&1 > compiled-contexts/test-output.txt; echo "TEST_EXIT=$?"` — full suite (no `-w` filter); must exit 0; orchestrator reads full output, no pipe-mask
- Per-package test count regression check: pi-context, pi-jit-agents, pi-workflows, pi-behavior-monitors all at or above pre-commit counts
- Grep audit: `grep -n '= PROJECT_DIR' packages/pi-context/src/` returns 0; `grep -rn '"\.project"' packages/pi-context/src/ --include="*.ts" | grep -v ".test.ts" | grep -v project-dir.ts` returns 0
