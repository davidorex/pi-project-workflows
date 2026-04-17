# Expression language — custom minimal evaluator vs CEL adoption

Date: 2026-04-15
Type: comparative research
Status: complete; standalone research. No decision entry exists because no forcing issue or gap currently requires resolving the CEL-adoption question. Per the convention that decisions (`.project/decisions.json`) must cite a forcing artifact (issue / gap / feature), this question stays as research until a forcing function emerges.
Grounding:
  - `packages/pi-workflows/src/expression.ts` at commit 8b184c6
  - `systeminit/swamp` main branch cloned to `/tmp/swamp-analysis/swamp/` 2026-04-15
  - `@marcbachmann/cel-js@7.5.1` as declared in swamp's `deno.json`
Stale conditions:
  - our expression.ts materially changes shape
  - swamp switches expression engines
  - cel-js is deprecated or replaced

This research surfaces CEL adoption as a possibility worth noting. Whether our expression language should remain the current bespoke property-access evaluator, adopt CEL wholesale, or adopt CEL hybrid is an open question that has not been promoted to a decision. Promotion requires either a forcing issue/gap or explicit user authorization to treat the question as a decision needing resolution.

---

## Our current expression language

**Location**: `packages/pi-workflows/src/expression.ts` (339 lines).

**Syntax**: `${{ path.to.value | filter }}`. Regex `EXPR_PATTERN = /\$\{\{\s*(.*?)\s*\}\}/g` at `expression.ts:4`.

**Scope roots** (`EXPRESSION_ROOTS` at `expression.ts:36`): `input`, `steps`. Plus the `CompletionScope` extensions used at workflow-completion time — `runId`, `runDir`, `totalUsage`, `totalDurationMs`.

**What the evaluator supports**:

- Property access split on `.` at `expression.ts:78`: `segments = pathExpr.split(".")`
- Whole-value vs interpolated resolution with type preservation at `expression.ts:160-178`
- Nine built-in filters registered as `FILTERS` at `expression.ts:12-31`: `duration`, `currency`, `json`, `length`, `keys`, `filter`, `first`, `last`, `slugify`, `shell`

**What it deliberately does not support** — per `docs/planning/workflow-extension.md:537-554`:

> `${{ }}` uses simple property access. No `eval()`, no general-purpose expression language. … No arithmetic, no string concatenation, no function calls, no ternary operators. If a workflow needs to transform data between steps, it uses a `transform` step (phase 2) with explicit logic, not expressions embedded in YAML values.

And at `workflow-extension.md:554`:

> Phase 2 may add `==`, `!=`, `>`, `<` if real workflows need them, but the bias is toward keeping the expression language minimal and pushing logic into transform steps.

And at `docs/planning/2026-03-14-parallel-analysis-review.md:30`:

> Expression engine: no eval, deliberate constraints, excellent error diagnostics

**Security posture** — documented in `project-architecture.md` memory under "Security":

> `shell` expression filter: prevents single-quote injection in command step expressions
> Property-access-only expressions (no eval, no arithmetic) — logic in transform steps

The `shell` filter at `expression.ts:24-28` is the concrete enactment: JSON-stringifies the value then escapes single quotes into the shell single-quote-context escape sequence `'\''`. Defensive against command-step expression injection.

**Error diagnostics**: `ExpressionError` class at `expression.ts:40-53` carries the original expression plus a traversal-aware reason string built by `buildErrorReason`. Misses report which segment failed, which are available, and what the scope looks like.

**Documented limitation**: `workflow-extension.md:253` — "Expression parser: adjacent `${{ }}${{ }}` in a single string — whole-value regex can misparse them. Pre-existing limitation. Severity: low."

---

## Swamp's expression language — CEL

**Adoption**: `@marcbachmann/cel-js@7.5.1` per `/tmp/swamp-analysis/swamp/deno.json`. CEL is Google's Common Expression Language — the expression engine used in Kubernetes validation rules, gRPC, Firebase Security Rules, and Envoy filter config.

**Syntax** per `/tmp/swamp-analysis/swamp/design/expressions.md`: same `${{ … }}` delimiter convention. Outer shape is identical to ours.

**What CEL supports that our evaluator does not**:

- Arithmetic: `a + b`, `a * 2`
- Comparisons: `==`, `!=`, `<`, `>`, `<=`, `>=`
- Logical operators: `&&`, `||`, `!`
- Ternary: `cond ? a : b`
- String operations: `"foo".startsWith("f")`, `"foo" + "bar"`
- List operations: `[1,2,3].exists(x, x > 1)`, `.filter(x, …)`, `.map(x, …)`
- Map operations: `{key: value}`, `map[key]`
- Function calls — typed, declared, with deterministic evaluation
- Typed values with runtime type checking
- Millisecond-bounded deterministic evaluation (CEL is non-Turing-complete by design)

**Security posture**: CEL was designed explicitly for untrusted-input evaluation. Non-Turing-complete, bounded evaluation cost, sandboxed function execution, adopted by Kubernetes admission controllers for policy evaluation. `cel-js` is a JavaScript implementation of that spec.

---

## Cost of the invented language

**Implementation cost**: 339 lines of bespoke code in `expression.ts`. Plus tests. Plus the `transform` step type invented specifically to compensate for the absent arithmetic/logic per `workflow-extension.md:546`:

> uses a `transform` step (phase 2) with explicit logic.

**Composition cost**: any workflow needing boolean logic, arithmetic, or multi-value composition must use a `transform` step. A CEL workflow keeps the same logic inline in the expression.

**Cognitive cost**: contributors and LLM agents must learn our custom grammar. CEL is in training distributions (Kubernetes docs, gRPC spec, Firebase docs, Envoy config). An LLM writing a CEL expression has strong prior. Our `${{ path.field | filter }}` is project-specific and must be taught.

**Maintenance cost**: every extension (e.g. the `==`/`!=`/`>`/`<` hedged at `workflow-extension.md:554`) is our own code to write and defend. CEL extensions are drop-in against a published spec.

**Feature-parity gap**: our evaluator has nine filters. CEL has a substantially larger built-in operator and function set, plus typed functions callers can register with guaranteed isolation.

---

## Benefits we get by staying with the current evaluator

**Smaller surface, fewer footguns**: `workflow-extension.md:537-554` frames the minimalism as deliberate — "bias is toward keeping the expression language minimal and pushing logic into transform steps." Logic in YAML is hard to review, so force it into declared step code.

**Explicit error shape**: `ExpressionError` at `expression.ts:40-53` carries our own error structure with project-specific diagnostic reasons. CEL adoption would inherit `cel-js`'s error messages, which are less scoped to our domain. Preservable via wrapping.

**`shell` filter and security-reviewed surface**: our `shell` filter at `expression.ts:24` is specifically designed for our `command` step's single-quote shell context. Dropping in CEL means re-auditing expression-to-shell paths against CEL's surface — which includes string concatenation, potentially invalidating the single-quote-only escape strategy.

**No dependency**: 339 lines of in-repo code has zero supply-chain risk. `cel-js` is a third-party dependency; adoption requires a supply-chain audit.

---

## Where a CEL-adoption path would actually land

Not a wholesale replacement. The cleanest adoption:

1. **Keep `${{ … }}` delimiters** — our authored YAML stays readable and the regex stays the same (`expression.ts:4` `EXPR_PATTERN`)
2. **Expand the inside** — replace the property-access-split-on-`.` implementation (`expression.ts:78-107`) with a CEL evaluator call
3. **Keep our scope shape** — CEL accepts arbitrary objects as input scope; `input`, `steps`, `runId`, `runDir`, `totalUsage`, `totalDurationMs` remain the authoritative scope keys
4. **Retain our filters as CEL functions** — CEL supports caller-registered functions with type declarations. The nine built-in filters become registered CEL functions
5. **Retire the `transform` step's reason-for-being** — inline logic in expressions eliminates a class of step that existed only because expressions could not do it. `workflow-extension.md:546` states this explicitly; CEL removes the constraint
6. **Keep `ExpressionError` wrapping** — wrap cel-js evaluation errors with our own diagnostic class so downstream consumers (workflow validator, step executor) keep the existing error-reporting contract

---

## What this would resolve

- `workflow-extension.md:253` — adjacent `${{ }}${{ }}` parse limitation — CEL parse is substring-aware; this limitation goes away
- The `transform` step type at `packages/pi-workflows/src/step-transform.ts` becomes largely redundant. Simple transforms move inline; complex transforms stay as transform steps only when they actually warrant subprocess dispatch for cost reasons
- The deliberate "no arithmetic, no comparison" constraint at `workflow-extension.md:554` is lifted without hand-rolling our own precedence parser

---

## What this would introduce

- One new npm dependency on `@marcbachmann/cel-js` or equivalent
- One new attack surface (CEL evaluation of untrusted user-authored YAML) that must be audited against the sandboxing and bounded-evaluation guarantees of the chosen implementation
- One migration path for existing workflow YAML — today's simple property-access expressions remain valid CEL (they parse as field-selection operations), so most workflows migrate without change, but any that exploited our specific error-on-missing-intermediate behavior may need to be updated since CEL has different null-propagation semantics

---

## Citations

- `/Users/david/Projects/workflowsPiExtension/packages/pi-workflows/src/expression.ts` — current evaluator, 339 lines
- `/Users/david/Projects/workflowsPiExtension/docs/planning/workflow-extension.md:537-554` — minimalism rationale
- `/Users/david/Projects/workflowsPiExtension/docs/planning/workflow-extension.md:253` — adjacent `${{ }}${{ }}` parse limitation
- `/Users/david/Projects/workflowsPiExtension/docs/planning/2026-03-14-parallel-analysis-review.md:30` — "no eval, deliberate constraints, excellent error diagnostics"
- `/tmp/swamp-analysis/swamp/design/expressions.md` — swamp's expression system
- `/tmp/swamp-analysis/swamp/deno.json` — cel-js dependency declaration at `@marcbachmann/cel-js@7.5.1`

---

## Summary

Our expression language is a deliberate, minimal, security-audited, project-specific primitive sitting at 339 lines. Swamp's choice of CEL trades that bespoke minimalism for industry-standard syntax, much broader operator coverage, strong sandboxing guarantees, training-distribution familiarity, and the elimination of compensating complexity (the `transform` step type). The rationale against CEL adoption at project start (`workflow-extension.md:537-554`) remains philosophically coherent; the rationale for it emerges once cross-step arithmetic, comparisons, logical operators, or inline list/map manipulation become frequent enough that `transform` steps proliferate. At v0.14.4 with the workflow extension still early in real-world use, either direction remains available; the longer transforms accumulate the more expensive CEL adoption becomes.

No decision exists in `.project/decisions.json` for this question. The research stands on its own as grounding material; promotion to a live decision requires a forcing artifact or explicit user authorization.
