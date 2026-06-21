**Required columns** for the Site Inventory table — every row MUST populate every column. Empty cells = audit failure:

| File | Line | Helper-or-Inline | Tmpdir-contents | First-resolver-cascading-call (file:line citation) | Classification | One-sentence justification citing the call chain |

**Worked examples** (one per classification):

CONFIG-REQUIRED example (transitive cascade via local import):
```
| src/step-block.test.ts | 15 | inline | .project/schemas/foo.schema.json + foo.json | step-block.ts:171 schemaPath(cwd, "foo") → project-dir.ts:51 schemasDir → project-dir.ts:43 resolveContextDir | config-required | step-block.ts:171 calls schemaPath which cascades through resolveContextDir at project-dir.ts:43 |
```

NOCONFIG-TEST example (intentional absent-config assertion):
```
| src/foo.test.ts | 67 | inline (noconfig variant) | .project/ dir only; no config.json | foo.ts:88 loadConfig(cwd) returns null (config.json absent) | noconfig-test | test asserts result.error matches /config\.json/; pointer-YES + config-NO preserves intent |
```

NO-RESOLVER-REACH example (genuine bypass):
```
| src/bar.test.ts | 22 | inline | trace JSONL only | bar.ts:42 writeJsonl (pure function; no pi-context import in chain) | no-resolver-reach | bar.ts imports only fs + path; no @davidorex/pi-context/* in import chain (verified file content); test exercises only writeJsonl |
```

INCONCLUSIVE example (audit budget exceeded):
```
| src/baz.test.ts | 99 | inline | varies per test | baz.ts:55 dynamicRequire(`./${var}.js`) | INCONCLUSIVE | dynamic require at baz.ts:55 prevents static trace of pi-context reach; orchestrator decides whether to write pointer defensively or split into separate audit |
```
