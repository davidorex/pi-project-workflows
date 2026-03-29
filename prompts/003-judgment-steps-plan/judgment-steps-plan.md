# Judgment Step Restructuring Plan

<metadata>
  <confidence>high — all 6 workflow YAMLs, the command step adequacy audit, prerequisite plans 1 and 2, existing agent specs, template patterns, monitor step type, and block step type design have been read and cross-referenced</confidence>
  <prerequisites>
    - Plan 1 (dependency alignment) complete — pi-project named exports available, block API importable from all packages
    - Plan 2 (block step type) complete — `block:` step type available with read, readDir, write, append, update operations; optional blocks return null; missing required blocks fail explicitly
  </prerequisites>
  <assumptions>
    - The block step type's `optional` field handles the "block may not exist" case by returning null — downstream agents see null and know the block was absent, not empty.
    - Agent steps dispatch via `pi --mode json` subprocess. Each new agent step costs one LLM invocation (~4k-20k tokens depending on context size). This is the explicit tradeoff: correctness of judgment vs token cost.
    - The `monitor:` step type classifies as CLEAN (step completes) or FLAG/NEW (step fails). This binary classification maps directly to pass/fail verification gates.
    - Template field names must match input variable names. The template-schema alignment validation (v0.7.0) will flag mismatches at workflow parse time.
    - The `context: string[]` field on agent steps inlines prior step `textOutput` as labeled markdown sections — useful for passing narrative context without expression wiring.
    - Existing tests cover the current behavior. Restructured steps must produce equivalent downstream data shapes to avoid breaking expression references in subsequent steps.
  </assumptions>
  <open_questions>
    <question id="1">
      **Monitor vs agent for verification gates**: The plan uses agent steps (not monitor steps) for judgment operations because the judgments require reading code, examining diffs, and producing structured reasoning — not just classifying a text pattern. Monitor steps are binary classifiers optimized for pattern matching. An agent step with the `verifier` role and a targeted prompt is the better fit. If the user prefers monitor gates for any specific step, the plan can be adapted.
    </question>
    <question id="2">
      **fix-audit route-results complexity**: The current `route-results` step performs 4 independent block routing operations in one command step. Restructuring this into validated operations means either: (a) 4 separate block steps with an agent pre-validation step, or (b) a new agent step that reasons about what to route, then block steps that execute the routing. The plan uses option (b) — one agent validates, then block steps write. This increases the step count but makes each step auditable.
    </question>
    <question id="3">
      **Gap resolution description**: The current `do-gap` route step writes `resolved_by: 'do-gap-workflow'` — a static string. The restructured version should capture a substantive resolution description from the verification agent. The agent produces this as part of its judgment output. User should confirm whether the `resolved_by` field should accept freeform text or remain a short identifier.
    </question>
  </open_questions>
</metadata>

---

## Design Principles

1. **Judgment operations require LLM reasoning.** No step that affects project state (marks a gap resolved, stamps an audit finding as passed, writes decisions to blocks) may rely solely on exit codes, grep patterns, or JSON parsability as a proxy for semantic correctness.

2. **Silent degradation becomes explicit failure.** Missing blocks fail the step (via block step type) unless explicitly marked optional — in which case the output contains `null` with the block name, giving downstream consumers an unambiguous signal.

3. **Mechanical operations remain mechanical.** Steps that are purely data formatting, file writes with no semantic judgment, or structural transformations do not get agent steps. Only operations that require "would a human need to think about this?" get LLM reasoning.

4. **Token cost is proportional to judgment value.** Each new agent invocation costs tokens. The plan minimizes new agent steps by combining related judgments into single agent calls where the context is shared, rather than creating one agent per micro-judgment.

---

## Workflow 1: do-gap

### Current steps affected

| Step | Classification | Issue |
|------|---------------|-------|
| `verify` | judgment-as-assumption | "Tests pass" treated as "gap's root cause addressed" |
| `route` | judgment-as-assumption | Marks gap resolved based on inadequate verification |

### Restructuring

The core problem: `verify` checks syntax/tests/lint but never evaluates whether the implementation addresses the gap's semantic description. `route` then unconditionally marks the gap as resolved based on verify's output.

**Solution**: Replace the command-step `verify` with an **agent step** that receives the gap description, the investigation findings, the implementation results, and test/lint output, then judges whether the gap's root cause is addressed. Replace the command-step `route` with a **block update step** that only runs when the agent's judgment is positive.

The mechanical verification (tests, lint, JSON parsability) should still run — but as a prerequisite command step whose output feeds into the agent's judgment context, not as the final verdict.

#### Before: steps `verify` and `route`

```yaml
verify:
  command: |
    node --experimental-strip-types -e "
      import fs from 'fs';
      import { execSync } from 'child_process';
      const errors = [];
      // Run tests
      try { execSync('node --experimental-strip-types --test src/*.test.ts', ...); }
      catch (e) { errors.push('Tests failed: ...'); }
      // Run linter on changed files
      try { ... } catch {}
      // Validate blocks (JSON parsability)
      try { ... } catch {}
      const passed = errors.length === 0;
      console.log(JSON.stringify({ status: passed ? 'passed' : 'failed', errors, passed }));
    "
  output:
    format: json

route:
  when: "${{ steps.verify.output.passed }}"
  command: |
    node --experimental-strip-types -e "
      import fs from 'fs';
      const gapId = process.argv[1];
      ...
      Object.assign(gap, { status: 'resolved', resolved_by: 'do-gap-workflow' });
      fs.writeFileSync(gapsPath, JSON.stringify(data, null, 2) + '\n');
      ...
    " '${{ input.gap_id }}'
  output:
    format: json
```

#### After: steps `run-checks`, `assess-resolution`, `route`

```yaml
run-checks:
  command: |
    node --experimental-strip-types -e "
      import fs from 'fs';
      import { execSync } from 'child_process';
      const errors = [];

      // Run tests
      try {
        execSync('node --experimental-strip-types --test src/*.test.ts', { stdio: 'pipe', timeout: 120000 });
      } catch (e) {
        errors.push('Tests failed: ' + (e.stderr?.toString().slice(-500) || 'unknown error'));
      }

      // Run linter on changed files
      try {
        const diff = execSync('git diff --name-only HEAD', { encoding: 'utf8' }).trim();
        const srcFiles = diff.split('\n').filter(f => f.startsWith('src/') && f.endsWith('.ts') && !f.endsWith('.test.ts'));
        for (const f of srcFiles) {
          try {
            execSync('/Users/david/Projects/pi-extension-linter/pi-extension-lint.sh ' + f, { stdio: 'pipe' });
          } catch (e) {
            const stderr = e.stderr?.toString() || e.stdout?.toString() || '';
            if (stderr.includes('error')) errors.push('Lint errors in ' + f);
          }
        }
      } catch (e) {
        errors.push('Could not determine changed files: ' + (e.message || 'unknown'));
      }

      // Validate blocks (JSON parsability)
      try {
        const schemasDir = '.project/schemas';
        if (fs.existsSync(schemasDir)) {
          for (const s of fs.readdirSync(schemasDir).filter(f => f.endsWith('.schema.json'))) {
            const blockName = s.replace('.schema.json', '');
            const blockPath = '.project/' + blockName + '.json';
            if (fs.existsSync(blockPath)) {
              try { JSON.parse(fs.readFileSync(blockPath, 'utf8')); }
              catch { errors.push('Block file is invalid JSON: ' + blockPath); }
            }
          }
        }
      } catch (e) {
        errors.push('Block validation error: ' + (e.message || 'unknown'));
      }

      const passed = errors.length === 0;
      console.log(JSON.stringify({ status: passed ? 'passed' : 'failed', errors, passed }));
    "
  output:
    format: json

assess-resolution:
  when: "${{ steps.run-checks.output.passed }}"
  agent: gap-resolution-assessor
  input:
    gap: "${{ steps.load.output.gap }}"
    investigation: "${{ steps.investigate.output }}"
    implementation_results: "${{ steps.implement.output }}"
    check_results: "${{ steps.run-checks.output }}"
  context: [implement]
  output:
    format: json
    schema: ../schemas/resolution-assessment.schema.json

route:
  when: "${{ steps.assess-resolution.output.resolved }}"
  block:
    update:
      name: gaps
      key: gaps
      match:
        id: "${{ input.gap_id }}"
      set:
        status: resolved
        resolved_by: "${{ steps.assess-resolution.output.resolution_summary }}"
  output:
    format: json
```

#### Changes to `check` step

```yaml
# Before:
check:
  when: "${{ steps.route.output.routed }}"
  gate:
    check: "test '${{ steps.verify.output.status }}' = 'passed'"
    onFail: fail

# After:
check:
  when: "${{ steps.route.output.updated }}"
  gate:
    check: "test '${{ steps.assess-resolution.output.resolved }}' = 'true'"
    onFail: fail
```

#### Changes to `completion` section

```yaml
# Before:
completion:
  message: |
    Gap ${{ input.gap_id }} — ${{ steps.verify.output.status }}
    Investigation complexity: ${{ steps.investigate.output.complexity }}
    Specs implemented: ${{ steps.decompose.output.specs | length }}
  include:
    - steps.verify.output

# After:
completion:
  message: |
    Gap ${{ input.gap_id }} — ${{ steps.assess-resolution.output.verdict }}
    Investigation complexity: ${{ steps.investigate.output.complexity }}
    Specs implemented: ${{ steps.decompose.output.specs | length }}
    Resolution: ${{ steps.assess-resolution.output.resolution_summary }}
  include:
    - steps.assess-resolution.output
```

#### Silent degradation fix in `run-checks`

The original `verify` step had an empty `catch {}` around the linter's git-diff section. The restructured `run-checks` step propagates errors from git diff into the errors array instead of swallowing them.

### New artifacts needed

**Agent spec**: `packages/pi-workflows/agents/gap-resolution-assessor.agent.yaml`

```yaml
name: gap-resolution-assessor
role: quality
description: Assesses whether an implementation actually resolves a gap's described root cause — not just whether tests pass

tools: [read, bash, grep, find]

output:
  format: json
  schema: schemas/resolution-assessment.schema.json

prompt:
  system: |
    <objective>
    You assess whether an implementation addresses a gap's root cause. Tests passing and lint being clean are necessary but not sufficient — you must judge whether the actual code changes are semantically relevant to the gap description. You read code, examine diffs, and reason about whether the described problem is actually solved.
    </objective>

    <workflow>
    1. Read the gap description to understand the root cause being addressed
    2. Read the investigation findings to understand what was identified
    3. Review the implementation results to see what was done
    4. Examine the actual code changes (git diff) to verify they address the gap
    5. Check whether the check results (tests, lint) passed
    6. Judge: does the implementation address the gap's semantic root cause?
    7. If resolved, write a resolution_summary capturing what was done and why it addresses the gap
    8. If not resolved, explain what remains unaddressed
    </workflow>

    <constraints>
    - Output MUST be valid JSON conforming to the resolution-assessment schema
    - resolved MUST be true only if the implementation addresses the gap's described root cause
    - Tests passing alone is NOT sufficient for resolved: true
    - resolution_summary MUST reference specific code changes, not generic statements
    - unresolved_aspects MUST list specific remaining issues, not hypothetical concerns
    - Do NOT modify any files — read only
    </constraints>

    <anti_patterns>
    - Setting resolved: true because tests pass without examining the gap description
    - Writing a generic resolution_summary like "implementation complete" without specifics
    - Flagging hypothetical issues that aren't evidenced in the code
    - Ignoring the gap description and only looking at test results
    </anti_patterns>
  task: gap-resolution-assessor/task.md
```

**Template**: `packages/pi-workflows/templates/gap-resolution-assessor/task.md`

```markdown
Assess whether the implementation resolves this gap.

## Gap

**ID**: {{ gap.id }}
**Description**: {{ gap.description }}
**Category**: {{ gap.category | default("unspecified") }}
**Priority**: {{ gap.priority | default("unspecified") }}

## Investigation Findings

```json
{{ investigation | dump(2) }}
```

## Implementation Results

{% if implementation_results is iterable and implementation_results is not string %}
{% for result in implementation_results %}
### Spec: {{ result.spec_name | default("unnamed") }}
- Status: {{ result.status | default("unknown") }}
- Files changed: {{ result.files_changed | default([]) | join(", ") }}
{% if result.commit_hash %}- Commit: {{ result.commit_hash }}{% endif %}
{% endfor %}
{% else %}
```json
{{ implementation_results | dump(2) }}
```
{% endif %}

## Check Results

- Status: {{ check_results.status }}
{% if check_results.errors | length > 0 %}
- Errors:
{% for err in check_results.errors %}
  - {{ err }}
{% endfor %}
{% endif %}

## Instructions

1. Read the gap description above. Understand what root cause it identifies.
2. Examine the implementation results — what files were changed and what was the stated work.
3. Run `git diff HEAD~{{ implementation_results | length | default(1) }}` (or appropriate range) to see actual code changes.
4. Judge: do the code changes address the root cause described in the gap?
5. If tests failed or lint errors exist, the gap is NOT resolved regardless of code quality.
6. Produce your assessment as JSON.
```

**Schema**: `packages/pi-workflows/schemas/resolution-assessment.schema.json`

```json
{
  "type": "object",
  "required": ["resolved", "verdict", "resolution_summary", "evidence"],
  "properties": {
    "resolved": {
      "type": "boolean",
      "description": "true if the implementation addresses the gap's described root cause"
    },
    "verdict": {
      "type": "string",
      "enum": ["resolved", "partially_resolved", "not_resolved", "checks_failed"],
      "description": "Categorical verdict"
    },
    "resolution_summary": {
      "type": "string",
      "description": "What was done and why it addresses (or fails to address) the gap — references specific changes"
    },
    "evidence": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["claim", "source"],
        "properties": {
          "claim": { "type": "string" },
          "source": { "type": "string", "description": "File path, diff, or test output supporting the claim" }
        }
      },
      "description": "Observable evidence supporting the verdict"
    },
    "unresolved_aspects": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Specific aspects of the gap that remain unaddressed (empty if fully resolved)"
    }
  }
}
```

### Expected behavior change

**Before**: Gap marked resolved if tests pass + lint clean + JSON parses. No assessment of whether implementation addresses root cause. `resolved_by` is static string `'do-gap-workflow'`.

**After**: Mechanical checks run first. If they pass, an agent reads the gap description, examines the actual code changes, and judges whether the root cause is addressed. Gap is only marked resolved if the agent determines the implementation is semantically adequate. `resolved_by` captures a substantive resolution summary.

### Token cost

+1 agent invocation (`gap-resolution-assessor`). Context includes gap description, investigation findings, implementation results, and check results — estimated ~8k-15k input tokens per invocation. This is the highest-value judgment in the system: it gates permanent state changes to the gaps block.

---

## Workflow 2: gap-to-phase

### Current steps affected

| Step | Classification | Issue |
|------|---------------|-------|
| `load-context` | silent-degradation | Corrupt files silently become empty context |

### Restructuring

**Solution**: Replace the command-step `load-context` with a **block step** using the `read` operation with `optional` blocks.

The key design decision: which blocks are required vs optional?

- **phases (readDir)**: Optional. A new project legitimately has no phases yet. The phase author should know it's starting from scratch.
- **architecture**: Optional. A project in early phases may not have architecture.json yet.
- **conventions**: Optional. Same reasoning.
- **gaps**: Required. This workflow is creating a phase from a gap — the gaps block must be readable. If it's corrupt, the workflow should fail rather than produce a phase from corrupted gap context.
- **inventory**: Optional. Project may not track inventory yet.

#### Before: step `load-context`

```yaml
load-context:
  command: |
    node --experimental-strip-types -e "
      import fs from 'fs';
      import path from 'path';
      const phases = [];
      const phasesDir = '.project/phases';
      if (fs.existsSync(phasesDir)) {
        for (const f of fs.readdirSync(phasesDir).filter(f => f.endsWith('.json')).sort()) {
          phases.push(JSON.parse(fs.readFileSync(path.join(phasesDir, f), 'utf8')));
        }
      }
      let architecture = {};
      try { architecture = JSON.parse(fs.readFileSync('.project/architecture.json', 'utf8')); } catch {}
      let conventions = {};
      try { conventions = JSON.parse(fs.readFileSync('.project/conventions.json', 'utf8')); } catch {}
      let gaps = { gaps: [] };
      try { gaps = JSON.parse(fs.readFileSync('.project/gaps.json', 'utf8')); } catch {}
      let inventory = {};
      try { inventory = JSON.parse(fs.readFileSync('.project/inventory.json', 'utf8')); } catch {}
      console.log(JSON.stringify({ phases, architecture, conventions, gaps: gaps.gaps.filter(g => g.status === 'open'), inventory }));
    "
  output:
    format: json
```

#### After: steps `load-phases` and `load-context`

```yaml
load-phases:
  block:
    readDir: phases
  output:
    format: json

load-context:
  block:
    read: [architecture, conventions, gaps, inventory]
    optional: [architecture, conventions, inventory]
  output:
    format: json
```

#### Impact on downstream `author` step

The `author` step's input references change shape:

```yaml
# Before:
author:
  agent: phase-author
  input:
    intent: "Implement gap ${{ steps.load-gap.output.gap.id }}: ${{ steps.load-gap.output.gap.description }}"
    gap: "${{ steps.load-gap.output.gap }}"
    phases: "${{ steps.load-context.output.phases }}"
    architecture: "${{ steps.load-context.output.architecture }}"
    conventions: "${{ steps.load-context.output.conventions }}"
    gaps: "${{ steps.load-context.output.gaps }}"
    inventory: "${{ steps.load-context.output.inventory }}"

# After:
author:
  agent: phase-author
  input:
    intent: "Implement gap ${{ steps.load-gap.output.gap.id }}: ${{ steps.load-gap.output.gap.description }}"
    gap: "${{ steps.load-gap.output.gap }}"
    phases: "${{ steps.load-phases.output }}"
    architecture: "${{ steps.load-context.output.architecture }}"
    conventions: "${{ steps.load-context.output.conventions }}"
    gaps: "${{ steps.load-context.output.gaps }}"
    inventory: "${{ steps.load-context.output.inventory }}"
```

Note: `phases` now references `steps.load-phases.output` (the readDir output is an array). The `gaps` field passes the entire gaps block object (including both open and resolved gaps) — the phase-author template should filter to open gaps. Alternatively, a transform step could filter, but the agent can handle this.

The `architecture`, `conventions`, and `inventory` fields may be `null` (if the blocks don't exist). The phase-author template already uses Nunjucks conditionals — the template should handle null values gracefully with `{% if architecture %}` guards (which are likely already present or should be added).

### New artifacts needed

None. The block step type and existing agent specs handle this restructuring.

### Expected behavior change

**Before**: Missing or corrupt architecture.json produces `{}`. Corrupt gaps.json produces `{ gaps: [] }`. One bad phase file zeroes all phases. No error signal.

**After**: Missing architecture/conventions/inventory produce `null` — the agent knows these blocks are absent. Missing or corrupt gaps.json fails the workflow (it's required). Corrupt individual phase files fail the readDir step with an error naming the corrupt file.

### Token cost

Net zero. Removed one command step, added two block steps (zero LLM cost).

---

## Workflow 3: create-phase

### Current steps affected

| Step | Classification | Issue |
|------|---------------|-------|
| `load-context` | silent-degradation | One bad phase file zeroes all phase context |

### Restructuring

Identical pattern to gap-to-phase. The `load-context` step has the same silent-degradation problem.

#### Before: step `load-context`

```yaml
load-context:
  command: |
    node --experimental-strip-types -e "
      import fs from 'fs';
      import path from 'path';
      const phasesDir = '.project/phases';
      let phases = [];
      try {
        phases = fs.readdirSync(phasesDir)
          .filter(f => f.endsWith('.json'))
          .map(f => JSON.parse(fs.readFileSync(path.join(phasesDir, f), 'utf8')));
      } catch {}
      let arch = {};
      try { arch = JSON.parse(fs.readFileSync('.project/architecture.json', 'utf8')); } catch {}
      let conv = {};
      try { conv = JSON.parse(fs.readFileSync('.project/conventions.json', 'utf8')); } catch {}
      let gapsData = { gaps: [] };
      try { gapsData = JSON.parse(fs.readFileSync('.project/gaps.json', 'utf8')); } catch {}
      let inv = {};
      try { inv = JSON.parse(fs.readFileSync('.project/inventory.json', 'utf8')); } catch {}
      console.log(JSON.stringify({ phases, architecture: arch, conventions: conv, gaps: gapsData.gaps, inventory: inv }));
    "
  output:
    format: json
```

#### After: steps `load-phases` and `load-context`

```yaml
load-phases:
  block:
    readDir: phases
  output:
    format: json

load-context:
  block:
    read: [architecture, conventions, gaps, inventory]
    optional: [architecture, conventions, gaps, inventory]
  output:
    format: json
```

Note: Unlike gap-to-phase, `create-phase` does not necessarily originate from a gap — it converts unstructured intent. Therefore `gaps` is optional here (the project may not have gaps.json at all).

#### Impact on downstream `author` step

```yaml
# Before:
author:
  agent: phase-author
  input:
    intent: "${{ input.intent }}"
    phases: "${{ steps.load-context.output.phases }}"
    architecture: "${{ steps.load-context.output.architecture }}"
    conventions: "${{ steps.load-context.output.conventions }}"
    gaps: "${{ steps.load-context.output.gaps }}"
    inventory: "${{ steps.load-context.output.inventory }}"

# After:
author:
  agent: phase-author
  input:
    intent: "${{ input.intent }}"
    phases: "${{ steps.load-phases.output }}"
    architecture: "${{ steps.load-context.output.architecture }}"
    conventions: "${{ steps.load-context.output.conventions }}"
    gaps: "${{ steps.load-context.output.gaps }}"
    inventory: "${{ steps.load-context.output.inventory }}"
```

### New artifacts needed

None. Same block step patterns as gap-to-phase.

### Expected behavior change

**Before**: One corrupt phase file causes `phases = []` (all phase context lost). Corrupt architecture/gaps/etc produce empty objects silently.

**After**: Corrupt phase file fails the readDir step naming the specific file. Optional blocks produce `null`. The agent knows exactly what context is available.

### Token cost

Net zero. Same as gap-to-phase.

---

## Workflow 4: fix-audit

### Current steps affected

| Step | Classification | Issue |
|------|---------------|-------|
| `load` | silent-degradation | "Latest" audit by sort order; conformance ref silently dropped |
| `cluster` | judgment-as-assumption | Grep-absence treated as "finding resolved" |
| `route-results` | judgment-as-assumption + silent-degradation | Unconditional data routing; missing blocks = silent data loss |
| `verify` | judgment-as-assumption | Grep-absence + needs_inspect folded into passing status |
| `update-audit` | judgment-as-assumption | Stamps findings "resolved" from heuristic grep check |

This is the most complex workflow to restructure — 5 of its steps have issues. The restructuring is presented as a coordinated set of changes.

### Step `load`: silent-degradation fix

The `load` step has two issues: (1) "latest by alphabetical sort" may pick wrong audit, (2) conformance reference silently defaults to null.

#### Before

```yaml
load:
  command: |
    node --experimental-strip-types -e "
      import fs from 'fs';
      const auditsDir = '.project/audits';
      const files = fs.readdirSync(auditsDir).filter(f => f.endsWith('.json')).sort();
      const latestFile = files[files.length - 1];
      const auditPath = auditsDir + '/' + latestFile;
      const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
      let conformance_reference = null;
      try { conformance_reference = JSON.parse(fs.readFileSync('.project/conformance-reference.json', 'utf8')); } catch {}
      console.log(JSON.stringify({ audit, conformance_reference, audit_path: auditPath }));
    "
  output:
    format: json
```

#### After

```yaml
load-audits:
  block:
    readDir: audits
  output:
    format: json

load-conformance:
  block:
    read: conformance-reference
    optional: [conformance-reference]
  output:
    format: json

select-audit:
  transform:
    mapping:
      audit: "${{ steps.load-audits.output | last }}"
      conformance_reference: "${{ steps.load-conformance.output }}"
      audit_index: "${{ steps.load-audits.output | length - 1 }}"
```

The `readDir` returns all audits sorted alphabetically. The `last` filter picks the last one — same behavior as before, but now the readDir step fails explicitly if the directory is missing or contains corrupt JSON. The conformance reference is optional (returns null if absent) but corrupt JSON fails explicitly.

**Note**: The "pick latest by sort" heuristic remains. A future enhancement could accept an `audit_name` input parameter to target a specific audit. This plan addresses silent degradation; the heuristic-selection issue is a separate concern.

### Steps `cluster` and `verify`: judgment-as-assumption fix

Both `cluster` and `verify` use the same anti-pattern: `grep -rn pattern files` exit code as proxy for "finding resolved." The cluster step filters out "already fixed" findings; the verify step stamps results as passed/failed.

**Solution**: Replace both grep-based verification steps with a single **agent step** (`audit-finding-verifier`) that runs after `implement`. This agent reads each finding's description, examines the current code state, and produces a structured judgment per finding.

The `cluster` step's pre-filtering ("skip already-fixed findings") is also replaced: instead of grep-filtering before implementation, all unresolved findings go to the implementation phase. The agent-based verification after implementation determines what's actually fixed.

#### Before: steps `cluster` and `verify`

```yaml
cluster:
  command: |
    node --experimental-strip-types -e "
      import fs from 'fs';
      import { execSync } from 'child_process';
      const audit = JSON.parse(fs.readFileSync('.project/audits/' + ...));
      const findings = audit.findings.filter(f => {
        if (!f.fix) return false;
        if (f.fix.verify_method === 'grep' && f.fix.verify_pattern) {
          try {
            execSync('grep -rn ' + JSON.stringify(f.fix.verify_pattern) + ' ' + f.locations.map(l => l.file).join(' '), { stdio: 'pipe' });
            return true;  // pattern still matches — needs fixing
          } catch { return false; }  // pattern gone — already fixed
        }
        if (f.resolution && f.resolution.status === 'passed') return false;
        return true;
      });
      // ... clustering logic ...
    "
  output:
    format: json

# ... implement step ...

verify:
  command: |
    node --experimental-strip-types -e "
      import fs from 'fs';
      import { execSync } from 'child_process';
      // ... grep-based verification ...
      const status = failed === 0 ? (inspect > 0 ? 'passed_with_inspect' : 'passed') : 'gaps_found';
      console.log(JSON.stringify({ status, score, passed, failed, needs_inspect, results }));
    "
  output:
    format: json
    path: .project/fix-audit-verify.json
```

#### After: steps `cluster`, `implement`, `verify-findings`

```yaml
cluster:
  command: |
    node --experimental-strip-types -e "
      import fs from 'fs';
      const audit = JSON.parse(process.argv[1]);

      // Filter to findings that have fixes and are not already resolved
      const findings = audit.findings.filter(f => {
        if (!f.fix) return false;
        if (f.resolution && f.resolution.status === 'passed') return false;
        return true;
      });

      if (findings.length === 0) {
        console.log(JSON.stringify({ tasks: [], message: 'All findings already resolved' }));
        process.exit(0);
      }

      const visited = new Set();
      const tasks = [];
      for (const f of findings) {
        if (visited.has(f.id)) continue;
        const cluster = [f];
        visited.add(f.id);
        if (f.related) {
          for (const rid of f.related) {
            if (!visited.has(rid)) {
              const r = findings.find(x => x.id === rid);
              if (r) { cluster.push(r); visited.add(rid); }
            }
          }
        }
        const files = [...new Set(cluster.flatMap(c => c.locations).map(l => l.file))];
        tasks.push({
          name: cluster[0].id,
          findings: cluster,
          files,
          principle: cluster[0].principle,
          category: cluster[0].category,
          severity: cluster.some(c => c.severity === 'error') ? 'error' : cluster[0].severity,
          acceptance_criteria: cluster.map(c => 'Fix: ' + (c.fix?.suggestion || c.description))
        });
      }
      console.log(JSON.stringify({ tasks }));
    " '${{ steps.select-audit.output.audit | json }}'
  output:
    format: json

# implement step remains unchanged

verify-findings:
  agent: audit-finding-verifier
  input:
    audit: "${{ steps.select-audit.output.audit }}"
    implementation_results: "${{ steps.implement.output }}"
    conformance_reference: "${{ steps.select-audit.output.conformance_reference }}"
  context: [implement]
  output:
    format: json
    schema: ../schemas/finding-verification.schema.json
    path: .project/fix-audit-verify.json
```

Key changes to `cluster`:
- Removed grep-based "already fixed" pre-filtering. Findings are filtered only by `resolution.status` (from prior verified runs) and presence of a `fix` field. This is a mechanical filter (string comparison on known field), not a judgment.
- The `acceptance_criteria` no longer include grep patterns — they use the fix suggestion or description text instead. The agent-based verifier will assess these semantically.
- The audit data comes from `select-audit.output.audit` instead of re-reading the file.

### Step `route-results`: judgment-as-assumption + silent-degradation fix

The current `route-results` step performs 4 block writes unconditionally (decisions, gaps, inventory, state) with `if (fs.existsSync(path))` guards that silently skip missing blocks.

**Solution**: Split into (1) an **agent step** that validates the implementation results and produces a structured routing manifest (what decisions to add, what gaps to create, etc.), and (2) **block steps** that perform the validated writes.

#### Before: step `route-results`

```yaml
route-results:
  command: |
    node --experimental-strip-types -e "
      import fs from 'fs';
      const raw = JSON.parse(fs.readFileSync('.project/fix-audit-results.json', 'utf8'));
      const items = Array.isArray(raw) ? raw : [raw];
      // ... decisions routing (unconditional) ...
      // ... issues-to-gaps routing (unconditional) ...
      // ... inventory update (monotonic increase only) ...
      // ... state update ('all tasks completed' regardless of actual result) ...
    "
  output:
    format: json
```

#### After: steps `prepare-routing` and `route-decisions`, `route-issues`

```yaml
prepare-routing:
  agent: audit-results-router
  input:
    implementation_results: "${{ steps.implement.output }}"
    verification: "${{ steps.verify-findings.output }}"
  context: [implement, verify-findings]
  output:
    format: json
    schema: ../schemas/audit-routing-manifest.schema.json

route-decisions:
  when: "${{ steps.prepare-routing.output.decisions | length > 0 }}"
  forEach: "${{ steps.prepare-routing.output.decisions }}"
  as: decision
  block:
    append:
      name: decisions
      key: decisions
      item: "${{ decision }}"
  output:
    format: json

route-issues:
  when: "${{ steps.prepare-routing.output.new_gaps | length > 0 }}"
  forEach: "${{ steps.prepare-routing.output.new_gaps }}"
  as: gap_item
  block:
    append:
      name: gaps
      key: gaps
      item: "${{ gap_item }}"
  output:
    format: json
```

The `prepare-routing` agent examines the implementation results and verification output, then produces a validated manifest of what should be routed where. The block append steps then execute the writes — and fail explicitly if the target block doesn't exist (no silent skip).

The inventory update and state update are removed from routing. Inventory should be updated through its own mechanism (not by taking the max of agent-reported test counts). State updates should reflect actual verification outcomes, not unconditional "completed" stamps.

### Step `update-audit`: judgment-as-assumption fix

#### Before

```yaml
update-audit:
  command: |
    node --experimental-strip-types -e "
      import fs from 'fs';
      // ... reads verify output, stamps findings as passed/failed based on grep ...
      audit.summary.resolved = passed;
      fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2) + '\n');
    "
  output:
    format: json
```

#### After

The `verify-findings` agent step (replacing the old `verify` command step) produces structured verification results with per-finding assessments. The `update-audit` step now writes these agent-validated results instead of grep-derived statuses.

```yaml
update-audit:
  command: |
    node --experimental-strip-types -e "
      import fs from 'fs';
      const auditsDir = '.project/audits';
      const auditFile = fs.readdirSync(auditsDir).filter(f => f.endsWith('.json')).sort().pop();
      if (!auditFile) { console.error('No audit files found'); process.exit(1); }
      const auditPath = auditsDir + '/' + auditFile;
      const verifyPath = '.project/fix-audit-verify.json';
      let verifyResults;
      try {
        verifyResults = JSON.parse(fs.readFileSync(verifyPath, 'utf8'));
      } catch (e) {
        console.error('Cannot read verification output: ' + e.message);
        process.exit(1);
      }

      const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
      let resolved = 0;
      for (const vr of verifyResults.findings || []) {
        const finding = audit.findings.find(f => f.id === vr.id);
        if (finding) {
          finding.resolution = {
            status: vr.status,
            verified_at: new Date().toISOString(),
            verified_by: 'agent',
            evidence: vr.evidence || null
          };
          if (vr.status === 'passed') resolved++;
        }
      }
      audit.summary.resolved = resolved;
      fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2) + '\n');
      console.log(JSON.stringify({ updated: auditPath, resolved, total: audit.findings.length }));
    "
  output:
    format: json
```

Key changes:
- `verified_by: 'agent'` added to distinguish agent-verified resolutions from the old grep-verified ones
- `evidence` field captured from the agent's verification output
- Silent `try/catch` on verify output replaced with explicit failure
- Resolution data comes from the agent's semantic judgment, not grep exit codes

### New artifacts needed

**Agent spec**: `packages/pi-workflows/agents/audit-finding-verifier.agent.yaml`

```yaml
name: audit-finding-verifier
role: quality
description: Verifies whether audit findings have been resolved by examining code changes against finding descriptions — replaces grep-based verification

tools: [read, bash, grep, find]

output:
  format: json
  schema: schemas/finding-verification.schema.json

prompt:
  system: |
    <objective>
    You verify whether audit findings have been resolved by examining the actual code changes. For each finding, you read the finding description, examine the current code state at the referenced locations, and judge whether the finding is addressed. You do NOT use grep pattern absence as a proxy for resolution — you assess semantic adequacy.
    </objective>

    <workflow>
    1. For each finding in the audit:
       a. Read the finding description and understand what it identifies
       b. Read the code at each referenced location
       c. If the finding has a fix suggestion, check whether the suggestion was implemented
       d. Judge: is this finding resolved, partially resolved, or unresolved?
       e. Record evidence (specific code observations, not just "pattern absent")
    2. Compute summary: total, passed, failed, needs_inspect
    3. Set overall status based on results
    </workflow>

    <constraints>
    - Output MUST conform to finding-verification schema
    - Every finding gets a verdict — do not skip any
    - Evidence must reference specific code observations (file:line, code snippets)
    - "Pattern absent" alone is NOT sufficient evidence for passed — the fix must address the finding's described issue
    - needs_inspect items MUST NOT be counted as passed
    - Do NOT modify any files — read only
    </constraints>

    <anti_patterns>
    - Running grep and using exit code as verdict
    - Marking a finding passed because the offending code was deleted without replacement
    - Skipping findings that don't have grep verify patterns
    - Counting needs_inspect as passed in the overall status
    </anti_patterns>
  task: audit-finding-verifier/task.md
```

**Template**: `packages/pi-workflows/templates/audit-finding-verifier/task.md`

```markdown
Verify whether the following audit findings have been resolved.

## Audit Findings

{% for finding in audit.findings %}
### Finding: {{ finding.id }}

**Description**: {{ finding.description }}
**Severity**: {{ finding.severity | default("unspecified") }}
**Category**: {{ finding.category | default("unspecified") }}
**Principle**: {{ finding.principle | default("unspecified") }}

**Locations**:
{% for loc in finding.locations %}
- `{{ loc.file }}` {% if loc.line %}line {{ loc.line }}{% endif %} {% if loc.description %} — {{ loc.description }}{% endif %}
{% endfor %}

{% if finding.fix %}
**Fix suggestion**: {{ finding.fix.suggestion | default("none") }}
{% endif %}

{% if finding.resolution and finding.resolution.status == 'passed' %}
*Previously marked as resolved — re-verify.*
{% endif %}
---
{% endfor %}

## Implementation Results

{% if implementation_results is iterable and implementation_results is not string %}
{% for result in implementation_results %}
- {{ result.spec_name | default(result.name | default("task")) }}: {{ result.status | default("unknown") }}
{% endfor %}
{% else %}
```json
{{ implementation_results | dump(2) }}
```
{% endif %}

{% if conformance_reference %}
## Conformance Reference

```json
{{ conformance_reference | dump(2) }}
```
{% endif %}

## Instructions

For EACH finding above:

1. Read the code at the referenced location(s)
2. Determine if the finding's described issue is addressed
3. Record your verdict: `passed`, `failed`, or `needs_inspect`
4. Provide specific evidence (code snippet, file:line reference)

Do NOT use grep exit codes as evidence. Read the code and assess whether the issue described in the finding is genuinely resolved.

Produce JSON output with a `findings` array containing one entry per finding, plus summary statistics.
```

**Schema**: `packages/pi-workflows/schemas/finding-verification.schema.json`

```json
{
  "type": "object",
  "required": ["status", "score", "findings"],
  "properties": {
    "status": {
      "type": "string",
      "enum": ["passed", "passed_with_inspect", "gaps_found"],
      "description": "Overall verification status"
    },
    "score": {
      "type": "string",
      "description": "Score in N/M format (passed/total)"
    },
    "findings": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "status"],
        "properties": {
          "id": { "type": "string" },
          "status": {
            "type": "string",
            "enum": ["passed", "failed", "needs_inspect"]
          },
          "evidence": { "type": "string", "description": "Specific code observation supporting the verdict" },
          "reason": { "type": "string", "description": "Why the finding is or is not resolved" }
        }
      }
    },
    "passed": { "type": "integer" },
    "failed": { "type": "integer" },
    "needs_inspect": { "type": "integer" }
  }
}
```

**Agent spec**: `packages/pi-workflows/agents/audit-results-router.agent.yaml`

```yaml
name: audit-results-router
role: reasoning
description: Validates implementation results from audit fixing and produces a routing manifest — determines which decisions, gaps, and state updates should be written to project blocks

tools: [read]

output:
  format: json
  schema: schemas/audit-routing-manifest.schema.json

prompt:
  system: |
    <objective>
    You examine audit fix implementation results and verification output to produce a validated routing manifest. You determine which decisions should be recorded, which new issues should become gaps, and what the accurate state summary is. You validate coherence before routing — not every agent output belongs in the project blocks.
    </objective>

    <workflow>
    1. Review implementation results for each task
    2. Review verification output to know which findings passed/failed
    3. For each decision emitted by the fixer agent: validate it has required fields and is relevant
    4. For each issue flagged: validate it describes a genuine problem, assign appropriate priority
    5. Generate stable IDs for new gaps (deterministic from description)
    6. Produce the routing manifest
    </workflow>

    <constraints>
    - Only include decisions that have complete required fields (id, description, rationale)
    - Only create gaps for genuine issues — not hypothetical concerns
    - Gap priorities must match actual severity, not arbitrary mappings
    - Do NOT invent decisions or issues not present in the implementation results
    - Output MUST conform to audit-routing-manifest schema
    </constraints>
  task: audit-results-router/task.md
```

**Template**: `packages/pi-workflows/templates/audit-results-router/task.md`

```markdown
Review the audit fix results and produce a routing manifest.

## Implementation Results

{% if implementation_results is iterable and implementation_results is not string %}
{% for result in implementation_results %}
### Task: {{ result.spec_name | default(result.name | default("unnamed")) }}

- Status: {{ result.status | default("unknown") }}
{% if result.decisions %}
- Decisions: {{ result.decisions | length }}
{% endif %}
{% if result.issues %}
- Issues flagged: {{ result.issues | length }}
{% endif %}
{% endfor %}
{% else %}
```json
{{ implementation_results | dump(2) }}
```
{% endif %}

## Verification Results

```json
{{ verification | dump(2) }}
```

## Instructions

Produce a routing manifest with:

1. **decisions** — validated decisions from implementation results (with complete id, description, rationale fields)
2. **new_gaps** — genuine issues that should be tracked (with stable id, description, status: "open", category, priority)
3. **summary** — accurate summary of what was completed, what failed, what needs inspection

Only include items that are well-formed and represent genuine project artifacts. Do not route items that are missing required fields or describe hypothetical concerns.
```

**Schema**: `packages/pi-workflows/schemas/audit-routing-manifest.schema.json`

```json
{
  "type": "object",
  "required": ["decisions", "new_gaps", "summary"],
  "properties": {
    "decisions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "description", "rationale"],
        "properties": {
          "id": { "type": "string" },
          "description": { "type": "string" },
          "rationale": { "type": "string" },
          "phase": { "type": "string" }
        }
      }
    },
    "new_gaps": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "description", "status", "priority"],
        "properties": {
          "id": { "type": "string" },
          "description": { "type": "string" },
          "status": { "type": "string", "enum": ["open"] },
          "category": { "type": "string" },
          "priority": { "type": "string", "enum": ["low", "medium", "high", "critical"] },
          "source": { "type": "string" }
        }
      }
    },
    "summary": {
      "type": "string",
      "description": "Accurate summary of the audit fix results — what was completed, what failed, what needs inspection"
    }
  }
}
```

### Expected behavior change

**Before**: Findings filtered by grep exit code. Verification by grep absence. Routing unconditional with silent skip on missing blocks. Audit records stamped "passed" from grep heuristic. State written as "all tasks completed" regardless.

**After**: Findings filtered only by explicit resolution status. Verification by agent reading code and assessing semantic resolution. Routing validated by agent before block writes — and block writes fail if blocks don't exist. Audit records stamped with agent-verified evidence. No unconditional "completed" stamp.

### Token cost

+2 agent invocations (`audit-finding-verifier`, `audit-results-router`). The verifier examines all findings (~5k-20k input tokens depending on audit size). The router examines implementation results (~3k-8k tokens). Total additional cost: ~8k-28k tokens per workflow run.

Removed: 2 command steps (`cluster`'s grep filter logic, `verify`'s grep verification). These had zero LLM cost but produced incorrect judgments. The tradeoff is justified: audit resolution records are permanent project state, and incorrect "passed" stamps create false auditability.

---

## Workflow 5: plan-from-requirements

### Current steps affected

| Step | Classification | Issue |
|------|---------------|-------|
| `load-context` | silent-degradation | Requirements default to empty — plan proceeds from nothing |

### Restructuring

This is the highest-severity silent-degradation finding. The workflow's purpose is "decompose accepted requirements into phases" — defaulting requirements to an empty list defeats the entire purpose.

**Solution**: Replace the command-step `load-context` with **block steps** that make `requirements` required and other context optional.

- **requirements**: Required. This is the primary input. If it's missing or corrupt, the workflow must fail.
- **architecture**: Optional. Planning can proceed without it, but the agent should know it's missing.
- **project**: Optional. Same reasoning.
- **existing_phases (readDir)**: Optional. No phases directory is normal for a first plan.

#### Before: step `load-context`

```yaml
load-context:
  command: |
    node -e "
      const fs = require('fs');
      const path = require('path');
      const projectDir = '.project';
      const context = {};
      try { context.requirements = JSON.parse(fs.readFileSync(path.join(projectDir, 'requirements.json'), 'utf-8')); } catch { context.requirements = { requirements: [] }; }
      try { context.architecture = JSON.parse(fs.readFileSync(path.join(projectDir, 'architecture.json'), 'utf-8')); } catch { context.architecture = null; }
      try { context.project = JSON.parse(fs.readFileSync(path.join(projectDir, 'project.json'), 'utf-8')); } catch { context.project = null; }
      try {
        const phasesDir = path.join(projectDir, 'phases');
        context.existing_phases = fs.readdirSync(phasesDir).filter(f => f.endsWith('.json')).map(f => {
          try { return JSON.parse(fs.readFileSync(path.join(phasesDir, f), 'utf-8')); } catch { return null; }
        }).filter(Boolean);
      } catch { context.existing_phases = []; }
      console.log(JSON.stringify(context));
    "
  output:
    format: json
```

#### After: steps `load-requirements`, `load-context`, `load-phases`

```yaml
load-requirements:
  block:
    read: requirements
  output:
    format: json

load-context:
  block:
    read: [architecture, project]
    optional: [architecture, project]
  output:
    format: json

load-phases:
  block:
    readDir: phases
  output:
    format: json
```

**Note**: `load-requirements` has no `optional` — missing requirements.json fails the workflow. This is correct: you cannot plan from requirements that don't exist.

The `load-phases` readDir will fail if the `phases` directory doesn't exist. For a first-time plan, this is problematic. Two options:

1. The block step type could treat a missing directory as an empty result for readDir (the plan 2 design says "if the directory does not exist, the step fails"). This would need a design change to plan 2.
2. Add a prerequisite command step that ensures the phases directory exists before readDir.

**Recommended**: Option 1 — the block step type should be amended to allow readDir to accept an `optional` flag or simply return `[]` when the directory doesn't exist (as distinct from corrupt files in an existing directory). This is a plan 2 amendment, not a plan 3 concern. Until plan 2 is amended, option 2 (command step mkdir) works as a bridge:

```yaml
ensure-phases-dir:
  command: |
    node -e "
      const fs = require('fs');
      fs.mkdirSync('.project/phases', { recursive: true });
      console.log(JSON.stringify({ ensured: true }));
    "
  output:
    format: json

load-phases:
  block:
    readDir: phases
  output:
    format: json
```

#### Impact on downstream `create-plan` step

```yaml
# Before:
create-plan:
  agent: plan-creator
  input:
    project: ${{ steps.load-context.output.project }}
    requirements: ${{ steps.load-context.output.requirements }}
    architecture: ${{ steps.load-context.output.architecture }}
    existing_phases: ${{ steps.load-context.output.existing_phases }}

# After:
create-plan:
  agent: plan-creator
  input:
    project: ${{ steps.load-context.output.project }}
    requirements: ${{ steps.load-requirements.output }}
    architecture: ${{ steps.load-context.output.architecture }}
    existing_phases: ${{ steps.load-phases.output }}
```

### New artifacts needed

None. Block step type handles the restructuring.

### Expected behavior change

**Before**: Corrupt or missing requirements.json produces `{ requirements: [] }`. The plan-creator agent receives empty requirements, produces an empty or nonsensical plan, and that plan is written to .project/tasks.json — potentially overwriting a valid existing plan.

**After**: Missing or corrupt requirements.json fails the workflow immediately with an explicit error. Optional blocks (architecture, project) produce `null` — the agent knows what context is available.

### Token cost

Net zero. Block steps replace a command step with no LLM cost.

---

## Workflow 6: create-handoff

### Current steps affected

| Step | Classification | Issue |
|------|---------------|-------|
| `load-state` | silent-degradation | Handoff silently omits unreadable blocks |

### Restructuring

The handoff is a trust document — a future agent relies on it to understand what context is available. Silently omitting blocks makes the handoff appear complete when it may be missing critical state.

**Solution**: Replace the command-step `load-state` with **block steps** that produce explicit null for optional blocks, plus a **transform step** that adds git activity and a `blocks_status` manifest telling the consuming agent exactly which blocks were loaded and which were absent.

Design decision on required vs optional blocks:
- **project**: Optional. A handoff during initial setup might not have project.json yet.
- **phases (readDir)**: Optional. Same reasoning.
- **gaps**: Optional. Project may not have gaps yet.
- **decisions**: Optional. Project may not have decisions yet.
- **tasks**: Optional. Project may not have tasks yet.

All blocks are optional because a handoff should work at any project lifecycle stage. The key change is: instead of silently omitting missing blocks (producing `undefined`), the output explicitly contains `null` for absent blocks, and a `blocks_status` manifest lists what was available.

#### Before: step `load-state`

```yaml
load-state:
  command: |
    node -e "
      const fs = require('fs');
      const path = require('path');
      const projectDir = '.project';
      const state = {};
      try { state.project = JSON.parse(fs.readFileSync(path.join(projectDir, 'project.json'), 'utf-8')); } catch {}
      try {
        const phasesDir = path.join(projectDir, 'phases');
        state.phases = fs.readdirSync(phasesDir).filter(f => f.endsWith('.json')).map(f => {
          try { return JSON.parse(fs.readFileSync(path.join(phasesDir, f), 'utf-8')); } catch { return null; }
        }).filter(Boolean);
      } catch { state.phases = []; }
      try { state.gaps = JSON.parse(fs.readFileSync(path.join(projectDir, 'gaps.json'), 'utf-8')); } catch {}
      try { state.decisions = JSON.parse(fs.readFileSync(path.join(projectDir, 'decisions.json'), 'utf-8')); } catch {}
      try { state.tasks = JSON.parse(fs.readFileSync(path.join(projectDir, 'tasks.json'), 'utf-8')); } catch {}
      try {
        const { execSync } = require('child_process');
        state.recent_commits = execSync('git log --oneline -10', { encoding: 'utf-8' }).trim().split('\n');
        state.changed_files = execSync('git diff --name-only HEAD~3 2>/dev/null || echo \"\"', { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
      } catch { state.recent_commits = []; state.changed_files = []; }
      console.log(JSON.stringify(state));
    "
  output:
    format: json
```

#### After: steps `load-blocks`, `load-phases`, `load-git`, `assemble-state`

```yaml
load-blocks:
  block:
    read: [project, gaps, decisions, tasks]
    optional: [project, gaps, decisions, tasks]
  output:
    format: json

load-phases:
  block:
    readDir: phases
  output:
    format: json

load-git:
  command: |
    node -e "
      const { execSync } = require('child_process');
      const git = {};
      try {
        git.recent_commits = execSync('git log --oneline -10', { encoding: 'utf-8' }).trim().split('\n');
      } catch (e) {
        git.recent_commits = [];
        git.commits_error = e.message || 'git log failed';
      }
      try {
        git.changed_files = execSync('git diff --name-only HEAD~3 2>/dev/null || echo \"\"', { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
      } catch (e) {
        git.changed_files = [];
        git.files_error = e.message || 'git diff failed';
      }
      console.log(JSON.stringify(git));
    "
  output:
    format: json

assemble-state:
  transform:
    mapping:
      project: "${{ steps.load-blocks.output.project }}"
      phases: "${{ steps.load-phases.output }}"
      gaps: "${{ steps.load-blocks.output.gaps }}"
      decisions: "${{ steps.load-blocks.output.decisions }}"
      tasks: "${{ steps.load-blocks.output.tasks }}"
      recent_commits: "${{ steps.load-git.output.recent_commits }}"
      changed_files: "${{ steps.load-git.output.changed_files }}"
      blocks_status:
        project: "${{ steps.load-blocks.output.project != null }}"
        gaps: "${{ steps.load-blocks.output.gaps != null }}"
        decisions: "${{ steps.load-blocks.output.decisions != null }}"
        tasks: "${{ steps.load-blocks.output.tasks != null }}"
        phases: "${{ steps.load-phases.output | length > 0 }}"
        git_commits: "${{ steps.load-git.output.commits_error == null }}"
        git_files: "${{ steps.load-git.output.files_error == null }}"
```

**Note on load-phases**: Same consideration as plan-from-requirements — readDir fails if directory doesn't exist. The `ensure-phases-dir` bridge pattern or plan 2 amendment applies here too. Alternatively, since all blocks are optional, a command step that creates the directory first would work:

```yaml
ensure-dirs:
  command: |
    node -e "
      const fs = require('fs');
      fs.mkdirSync('.project/phases', { recursive: true });
      console.log(JSON.stringify({ ensured: true }));
    "
  output:
    format: json
```

#### Impact on downstream `capture` step

```yaml
# Before:
capture:
  agent: handoff-writer
  input:
    project_state: ${{ steps.load-state.output }}
    path: "."

# After:
capture:
  agent: handoff-writer
  input:
    project_state: ${{ steps.assemble-state.output }}
    path: "."
```

The `project_state` shape changes: blocks that were previously `undefined` (silently omitted) are now `null` (explicitly absent). The `blocks_status` object is new — it tells the handoff-writer exactly which blocks were available.

The `handoff-writer` template (`templates/handoff-writer/task.md`) uses Nunjucks conditionals like `{% if project_state.project is defined %}`. Since `null` is defined (it's not undefined), the template guards need adjustment to check for truthiness: `{% if project_state.project %}`.

#### Template update needed

**File**: `packages/pi-workflows/templates/handoff-writer/task.md`

Add a blocks_status section to the template:

```markdown
{% if project_state.blocks_status %}
### Block Availability

| Block | Available |
|-------|-----------|
{% for name, available in project_state.blocks_status %}
| {{ name }} | {{ "yes" if available else "NO — absent" }} |
{% endfor %}

{% set missing = [] %}
{% for name, available in project_state.blocks_status %}
{% if not available %}{% set _ = missing.append(name) %}{% endif %}
{% endfor %}
{% if missing | length > 0 %}
**Warning**: The following blocks were not available: {{ missing | join(", ") }}. Your handoff should explicitly note which context is missing so the consuming session knows what it lacks.
{% endif %}
{% endif %}
```

And update existing guards from `is defined` to truthiness checks:

```markdown
# Change:
{% if project_state.project is defined %}
# To:
{% if project_state.project %}
```

### New artifacts needed

Template update to `packages/pi-workflows/templates/handoff-writer/task.md` (blocks_status section, guard fixes). No new agent specs.

### Expected behavior change

**Before**: Missing blocks produce `undefined` in the state object. The handoff-writer agent doesn't know which blocks were absent vs which are empty. The consuming session receives a handoff that appears complete but may be silently incomplete. Git errors cause both `recent_commits` and `changed_files` to be lost.

**After**: Missing blocks produce `null`. The `blocks_status` manifest tells the handoff-writer exactly which blocks were loaded and which weren't. The template explicitly warns about absent blocks. Git errors are independent (one failing doesn't lose the other). The consuming session sees which context the handoff includes and which it lacks.

### Token cost

Net zero. Block steps and transform steps replace a command step with no LLM cost. The handoff-writer agent invocation already existed — it just receives better-structured input now.

---

## New Artifacts Summary

### Agent specs (2 new)

| Agent | File | Role | Used by |
|-------|------|------|---------|
| `gap-resolution-assessor` | `agents/gap-resolution-assessor.agent.yaml` | quality | do-gap workflow |
| `audit-finding-verifier` | `agents/audit-finding-verifier.agent.yaml` | quality | fix-audit workflow |
| `audit-results-router` | `agents/audit-results-router.agent.yaml` | reasoning | fix-audit workflow |

### Templates (3 new)

| Template | File | Variables |
|----------|------|-----------|
| gap-resolution-assessor task | `templates/gap-resolution-assessor/task.md` | gap, investigation, implementation_results, check_results |
| audit-finding-verifier task | `templates/audit-finding-verifier/task.md` | audit, implementation_results, conformance_reference |
| audit-results-router task | `templates/audit-results-router/task.md` | implementation_results, verification |

### Schemas (3 new)

| Schema | File | Purpose |
|--------|------|---------|
| resolution-assessment | `schemas/resolution-assessment.schema.json` | do-gap verify output |
| finding-verification | `schemas/finding-verification.schema.json` | fix-audit verify output |
| audit-routing-manifest | `schemas/audit-routing-manifest.schema.json` | fix-audit routing manifest |

### Template updates (1 modified)

| Template | File | Change |
|----------|------|--------|
| handoff-writer task | `templates/handoff-writer/task.md` | Add blocks_status section, fix `is defined` → truthiness guards |

---

## Implementation Ordering

The workflows can be restructured independently — they share no agent specs or schemas. Recommended implementation order based on severity and complexity:

1. **plan-from-requirements** — highest-severity silent-degradation, simplest fix (block steps only, no new agents)
2. **create-handoff** — second-highest-severity silent-degradation, moderate complexity (block steps + transform + template update)
3. **gap-to-phase** + **create-phase** — identical pattern, can be done together (block steps only)
4. **do-gap** — requires new agent spec + schema + template
5. **fix-audit** — most complex, requires 3 new agent specs + schemas + templates + significant workflow restructuring

Steps 1-3 have zero new LLM cost. Steps 4-5 add LLM cost but target the highest-value judgments.

---

## Plan 2 Amendment: readDir optional directory

The restructuring of `plan-from-requirements`, `create-handoff`, and `create-phase` all encounter the same issue: `readDir: phases` fails if the `.project/phases/` directory doesn't exist. For new projects, this is a normal state.

The plan 2 design says readDir fails on missing directories. This is correct for directories that should exist (`.project/audits/` when running fix-audit — the audit must exist). But phases is legitimately absent in new projects.

**Proposed amendment to plan 2**: Add an `optional` parameter to readDir that returns `[]` when the directory doesn't exist (same semantics as optional blocks returning null):

```yaml
load-phases:
  block:
    readDir: phases
    optional: true
  output:
    format: json
```

When `optional: true`, a missing directory returns `[]`. A directory with corrupt files still fails. This preserves the distinction between "doesn't exist" (possibly normal) and "exists but corrupt" (always an error).

If this amendment is not adopted, the bridge pattern (command step `mkdir -p` before readDir) works for all three workflows.
