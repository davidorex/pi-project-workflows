**Practical meaning of closing FGAP-026 / enacting DEC-0015:**

### What changes for a fresh-repo agent flow

1. Agent invokes `context-init` tool with required `dirName: string` arg (no default; prompt-required per DEC-0015).
2. Tool creates `<cwd>/<dirName>/` directory, writes `<cwd>/<dirName>/config.json` with `{root: "<dirName>", schema_version: "1.0.0"}`, writes `<cwd>/.pi-context.json` containing `{contextDir: "<dirName>"}` (typed JSON validated against `pi-context://schemas/bootstrap`).
3. Every subsequent context-* tool resolves substrate location via `resolveContextDir(cwd)` reading `.pi-context.json`. Agent never sees `.project/` or `.context/` in any tool surface — substrate dir is config; agent passes cwd, tools resolve.
4. `context-install` reads `<cwd>/<dirName>/config.json` for `installed_schemas[]` + `installed_blocks[]`, copies from package registry to `<cwd>/<dirName>/`.

### What changes for this repo (currently using `.project/`)

1. New `context-migrate` tool renames `<cwd>/.project/` → `<cwd>/<user-chosen-name>/` AND writes `<cwd>/.pi-context.json` containing the new name (or `--keep` flag preserves `.project/` location, just writes the pointer for backward-compat).
2. All `.project/` content carries forward unchanged — file contents already valid; just lives at a new path.

### Concrete code-cascade (every site that today knows `.project/` literally)

- **`packages/pi-context/src/project-dir.ts`** — `PROJECT_DIR` + `SCHEMAS_DIR` constants REMOVED. Replaced by `resolveContextDir(cwd): string` function reading the bootstrap pointer.
- **`packages/pi-context/src/block-api.ts`** — `blockFilePath(cwd, blockName)` and `blockSchemaPath(cwd, blockName)` call `resolveContextDir(cwd)` instead of using the constant. Cascades through every block-api primitive (16 of them) automatically since they all compose against these helpers.
- **`packages/pi-context/src/project-context.ts`** — `loadConfig(cwd)` reads `<cwd>/<resolveContextDir(cwd)>/config.json` (was hardcoded `<cwd>/.project/config.json`).
- **`packages/pi-context/src/index.ts`** — `PROJECT_SUBCOMMANDS` renames `project` → `context` namespace; pi tool registrations rename `project-*` → `context-*` (e.g., `project-status` → `context-status`, `project-validate` → `context-validate`, all 7 substrate tools + 4 PM-lens tools renamed).
- **`packages/pi-jit-agents/src/agent-spec.ts`** — three-tier agent loader's `.project/agents/` lookup cascades through resolver: `<cwd>/<resolveContextDir(cwd)>/agents/`. Same for template loader.
- **`packages/pi-jit-agents/src/compile.ts`** — `contextBlocks` injection reads from `<resolveContextDir(cwd)>` not `.project/`.
- **`packages/pi-workflows/src/...`** — any path-construction site referencing `.project/` (state paths, agent dispatch, schema lookup) cascades.
- **`packages/pi-behavior-monitors/index.ts`** — monitor write-action target-block resolution (`<cwd>/<resolveContextDir(cwd)>/<block>.json`) cascades; monitor side-car state at discovery dirs already routes through writeTypedFile post-Step-6.1.

### Schema authoring

- **NEW**: `packages/pi-context/schemas/bootstrap.schema.json` with `$id: "pi-context://schemas/bootstrap"`, `version: "1.0.0"`, schema for `.pi-context.json` (`{contextDir: string}` plus future-extensible fields like `version`, `created_at`, etc.). Pre-registered in schema-validator alongside the other 8 framework schemas.

### Test-fixture impact

Existing tests use `.project/` literal in fixture setup. Two coherent paths (per mandate-004 the latter is the only DEC-0015-compliant answer): (a) keep `.project/` as test-fixture default — re-introduces hardcode-via-default; rejected. (b) every test fixture writes `.pi-context.json` pointing to whatever dir the test wants — adheres to DEC-0015. **All tests get `.pi-context.json` setup helper** (likely a 2-line addition to existing `setupWorkflowDir` test helper).

`resolveContextDir(cwd)` behavior when `.pi-context.json` is absent: throws `BootstrapNotFoundError("Run context-init first")`. NO default fallback — defaulting reintroduces the hardcode pattern DEC-0015 rejects. Production first-use must run `context-init`. (For tests, fixture setup writes the pointer.)

### What the agent NEVER sees post-closure

- The string `.project/` anywhere in tool inputs or outputs — substrate dir is internal to the resolver.
- A "default substrate dir" — every substrate operation requires either a prior `context-init` + bootstrap pointer OR explicit fixture setup.
- Hardcoded paths in any error messages — paths are resolver-composed, so error messages reflect actual substrate location.

### What's load-bearing

- The bootstrap pointer (`.pi-context.json`) is the single canonical lookup mechanism — typed JSON, schema-validated, mtime-cacheable like config.
- `resolveContextDir(cwd)` is the sole resolver — every package imports it from `@davidorex/pi-context`. Zero parallel resolution logic anywhere.
- `context-init` is prompt-required for dirName — no default; user (or LLM) consciously chooses substrate dir name on every fresh-repo bootstrap.
- `context-migrate` provides zero-downtime migration for `.project/`-using repos — rename or pointer-only.

This is what "config drives substrate location" means structurally. After closure: from any tool's perspective, the substrate is wherever the bootstrap pointer says it is. From the resolver's perspective, that location is config. From the user's perspective, they picked the name once at init.