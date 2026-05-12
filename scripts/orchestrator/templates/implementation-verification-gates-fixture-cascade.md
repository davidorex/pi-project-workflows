After your commit lands, the orchestrator runs (you do NOT run these):
- `npm run build; echo "BUILD_EXIT=$?"` — must exit 0
- `npm run check; echo "CHECK_EXIT=$?"` — must exit 0
- `npm test -w @davidorex/pi-workflows 2>&1 > /tmp/test-output.txt; echo "TEST_EXIT=$?"` — must exit 0; full output read; no pipe-mask
- Grep audit: zero new `.project` literals in production source; classification table sites cascaded as expected
