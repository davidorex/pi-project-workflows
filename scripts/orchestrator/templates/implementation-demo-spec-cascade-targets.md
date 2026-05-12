Per DEC-0018 (runtime demonstration + adversarial probe per implementation step):

After commit, orchestrator constructs the following demos:

(1) Runtime grep verification — proves no hardcoded substrate-dir literals remain in production source:
- `grep -n '= PROJECT_DIR' packages/pi-context/src/` returns 0 matches (signature-default elimination)
- `grep -rn '"\.project"' packages/pi-context/src/ --include="*.ts" | grep -v ".test.ts" | grep -v project-dir.ts` returns 0 matches (production-literal elimination)
- Grep audit hits ONLY @deprecated PROJECT_DIR/SCHEMAS_DIR const exports in project-dir.ts (Phase 7 cascade target, out of scope)

(2) TypeScript negative-demo — proves the signature change cascades compile-time errors to any missing-arg caller:
- Write `compiled-contexts/neg-demo.ts` containing `import { writeBootstrapPointer } from "@davidorex/pi-context/project-dir"; writeBootstrapPointer("/tmp/x");`
- Run `npx tsc --noEmit compiled-contexts/neg-demo.ts` → must error with `Expected 2 arguments, but got 1` (or equivalent missing-required-parameter error)
- If compile succeeds: the signature default was not actually removed; FAIL

(3) Round-trip positive-demo — proves writeBootstrapPointer accepts explicit contextDir + resolveContextDir reads it back:
- `npx tsx -e "import {writeBootstrapPointer, resolveContextDir} from '@davidorex/pi-context/project-dir'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; const d = fs.mkdtempSync(path.join(os.tmpdir(),'fgap035-demo-')); writeBootstrapPointer(d, '.substrate-demo'); console.log(resolveContextDir(d));"`
- Expected output: `<tmpdir>/.substrate-demo`
- Proves the cascade-through-pointer mechanism works with explicit caller-supplied name

(4) /project init UX demo — proves missing-arg path emits the declared ctx.ui.notify error:
- Demo inspection: `grep -n '/project init requires a substrate dir name' packages/pi-context/src/index.ts` returns 1 match (the new handleInit body's notify call)
- Demo inspection: `grep -n '(args, ctx) => handleInit(args, ctx)' packages/pi-context/src/index.ts` returns 1 match (PROJECT_SUBCOMMANDS dispatch fix)

These demos prove the FGAP-035 cascade is genuinely working post-commit, not passing for wrong reason via fallback / side-effect / no-op.
