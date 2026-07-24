# Documented user intent vs. the shipped monorepo — theme-level view

Date: 2026-07-24. Derived by an Explore agent (session 7303462d) from the 2026-07-19 audit
corpus's intent-specification stream (142 records, every one anchored to a user-verbatim
quote — zero report-authored, zero unanchored), cross-referenced against the corpus's 133
adjudicated verdicts, the 105 still-actionable findings (each with its own proof run), and
the shipped README surface. Load-bearing proofs spot-re-run at synthesis time: the
acceptance-criteria schema is still an array of plain strings; the workflow package still
carries its own duplicate agent-spec loader; the model-name parser is still copied across
three packages. Facts only; no recommendations. Themes ordered most-unmet first.

## Theme 1 — One uniform "agent," compiled from project state, reused as monitor and workflow step
Intent (~7 records): a single agent concept — context in, structured output out, composable
like a tool — identical whether used as a monitor or a workflow step, all from one
generalized framework. Anchors: "i want our concept of 'agents' to be consistent and
uniform. an 'agent' is the same thing whether it be used as a monitor or used in and by
workflows" (2026-04-09); "agents are seen as composed tools that take context input and
produce structured output, which itself then is composable later" (2026-04-06).
**Status: PARTIAL — the largest single body of unmet feature intent.** The canonical agent
runtime ships (pi-jit-agents compiles agent specs from project state with typed contracts
and forced structured output). Missing, grounded: the workflow package still carries its
full duplicate agent layer; the monitors package still builds a synthetic compiled agent;
the model-name parser is duplicated across three packages; the model-pin and
thinking-seam policies are not applied at the shared layer; the whole unification arc
(the frozen ledger's agent-layer feature and its task decomposition) sits dropped with no
live carrier.

## Theme 2 — The context substrate as the single source of truth
Intent (~24 records): one de-ephemeralized, schema-driven, JSON-first substrate that is
ground truth for any LLM entering the project; new block kinds arrive by declaring
schemas, not by code change; zero-loss reconstruction after any session. Anchors: "there
is one source of de-ephemeralized structured composable context, and that is .context.";
"no optional human readable md. json as source of truth." (2026-03-15); "rule must be
that after each step, exact context can be known were a fresh session to start"
(2026-05-11).
**Status: PARTIAL — core ships; a long tail of named schema pieces missing.** Shipping:
schema-validated block CRUD, content-addressed identity, closure-table relations, derived
state, substrate registry. Missing, each a grounded still-open finding: object-form
acceptance-criteria (criteria as addressable id/text/status objects — still plain
strings); no home for the rationale entries or project-identity facts; 16 code-invariant
conventions dropped in the store swap; the pre-decisions/contradictions block split
unbuilt; conventions schema lacks its relational/lifecycle facets; a newly-declared block
kind's data file is never materialized (false "not-installed" signal); no paused
lifecycle status; invalid stored config cannot be repaired (validate-before-mutate
deadlock); the packaged catalog drifts below live config.

## Theme 3 — Typed multi-step workflows that fail fast between steps
Intent (~4 records): data flows as typed JSON; each step's output is schema-validated at
the boundary before the next step consumes it. Anchors: "schema defines shape → agent
produces to shape → validator enforces shape → next step consumes typed fields... They're
not metadata — they're the enforcement boundary." (2026-03-16); "why parse verdict and
not constrain llm to valid output?" (2026-04-06).
**Status: PARTIAL — engine ships; advertised surface exceeds implemented surface.**
Shipping: DAG execution, typed step types, output-schema validation, expression engine,
checkpoint/resume. Missing, grounded: ~34 advertised expression filters vs 10
implemented; 8 of 15 bundled workflow specs invalid under the package's own validator;
the nested workflow-in-workflow step type declared but rejected at parse; no
expression-based loop termination ("repeat until X" / budget-remaining); no
workflow-level token budget; text-output + tools combination silently yields prose with
no conflict check; loop-step agents compile context-blind (no cwd); parallel steps share
one working tree; the task-execution loop phase unbuilt.

## Theme 4 — Mechanistic enforcement over trust
Intent (~11 records): rules enforced by the machine at write/validate time, never by
prompt discipline. Anchors: "'add a strong prompt' — as though llm's will not
psychotically disregard it." (2026-04-06); "We can't rely on llm's to know and read
conventions." (2026-06-06); "i want a loop until no violation of any requisite criteria
with zero tolerance."
**Status: PARTIAL — machinery ships; several gates leaky or retroactive.** Shipping:
write-time schema validation, human-identity auth gate on write-class tools, commit
guards, register budgets in schemas. Missing, grounded: the op boundary accepts unknown
or misspelled parameters silently on every op; the commit guard over-blocks quoted prose
while the shell-glue guard fails open on line-continuation grammar; every write-time
content gate is retroactive at item grain (a status flip re-judges the whole item's
grandfathered text); duplicate rollup entries load silently and skew derived state; the
dependency-freshness gate was dropped; the "encode every demonstrated LLM ignorance"
mandate has no built carrier.

## Theme 5 — Governance mandates carried as live, enforced policy substrate
Intent (~40 records — the corpus's largest bloc): absolute directive fidelity (add
nothing unsaid, omit nothing said); no hedging or deferral; no LLM-owned decisions;
terse register; balanced (never blind) policy application; no relitigation of settled
precedent. Anchors: "zero jugement calls. absolute adherence to clearly stated valid non
augmented non deviating directives that exactly transmit my stated intention."
(2026-06-21 — the most-repeated standard in the corpus); "Policies must be applied in a
balanced and rational way and not infinitely stupid blindly with no balance."
(2026-07-14).
**Status: PARTIAL — enforcement surfaces exist; the policy texts carrying these rules are
drifting.** Missing, grounded: the verbatim-directed iterate-to-zero four-rule policy has
no substrate item (it lives only in the instructions file); the user-rejected
iteration-cap language survived on binding surfaces past its removal ruling; the line-100
autonomous-loop paragraph the user ruled unreadable still stands as a single run-on line;
the dispatch-reachability stricture and the attribution correction ("only my words are
mine") have no substrate carrier; two in-window audit atoms still attribute
assistant-composed phrasing to the user.

## Theme 6 — Real verification and the autonomous iterate-to-zero loop
Intent (~14 records): success is a live runtime demonstration against binary success
criteria, driven by a bounded autonomous loop; the reference is the wasc project's
prompt-to-merge pipeline. Anchors: "passing tests does not equal meets working
intention." (2026-05-10); "the only way is that iterate to zero means of the fucking
success criteria." (2026-07-13); "This is the pattern I want." (2026-07-08, re the wasc
loop).
**Status: PARTIAL — check/attest tooling ships; the full loop has not operationally
succeeded here.** Shipping: real-check gate, attested commit, bounded work-order loop.
Missing, grounded: by the user's own statement the full-pipeline loop "has never
succeeded operationally as the wasc project's has"; criterion-grain addressability is
blocked on the unbuilt object-form criteria schema (Theme 2); several decisions/features
read stored-open although their deciding work completed — stored state diverges from the
derived done-ness the loop depends on.

## Theme 7 — Auto-derivation: docs, skills, SDK, CLI, dashboards track the code
Intent (~6 records): nothing hand-maintained that can be derived. Anchors: "i don't want
to have to update the cli when / if new things are added... cli commands track absolutely
to code as it is" (2026-06-02); "nothing in claude.md should be staleable." (2026-05-29).
**Status: PARTIAL.** The CLI is genuinely reflection-derived and the skill reference is
generated. Missing, grounded: the HTML substrate dashboard is stale with no regeneration
mechanism at all; a residuals filing that a closed gap's own text points at does not
exist.

## Theme 8 — Behavior monitors that classify and steer
Intent (~6 records): monitors classify against pattern libraries, demand re-output, never
block each other, and are tunable live. Anchor: "the tuning must be able to be done
on-the-fly... that's the overarching goal of the entire extension" (2026-04-07).
**Status: PARTIAL.** The monitors extension ships as designed. Missing, grounded: the
package's entire known-defect backlog (141 gaps, 12 issues in the frozen ledger) was
carried forward as zero items — its defect state is untracked in the live store; the
monitor-owns-its-domain-block design has no evidenced implementation.

## Theme 9 — Provenance, git hygiene, package cleanliness
Intent (~6 records, with one late reversal): forensic commit provenance, porcelain
status, no interim files in packages — then the attestation hooks ordered removed as
"ceremony playacting" (2026-07-08).
**Status: PARTIAL.** Attested commit and guards ship (guards leaky per Theme 4). Missing,
grounded: the two retroactive-migration phases (an 89-item issue corpus and a 114-item
gap corpus from the frozen ledger) stand pending; seven residual open items of the
audited packages appear in no live store.

## Theme 10 — Harness confinement; the CLI as the one non-pi surface
Intent (~7 records): zero non-harnessed LLM action; every action through extension tools;
the reflection-derived CLI as the only shell surface. Anchor: "zero non-harnessed llm
possibilities. Every action will only be through extension provided tools and jit-agents
/ workflows." (2026-05-10).
**Status: EXISTS — with minor parity residue.** The confinement model ships end to end
(tool-restricted pi-bound mode, human-identity gate, reflection-derived CLI; the
standalone CLI package realized the portability intent — that frozen task is adjudicated
superseded-by-realization). Residue: the human slash-command surface omits five operator
ops and the parity check is blind to that axis; one dry-run preview-optimism residual.

## Theme 11 — Architecture standards: primitives not features, consolidated packages
Intent (~11 records): clean and rational over path-of-least-resistance; primitives, not
features; no package proliferation. Anchors: "'path of least resistance' is not
intellectually rigorous or clean." (2026-04-07); "Primitives, not features" (2026-05-01).
**Status: EXISTS structurally.** Four focused extensions plus a meta-package; the library
agent runtime consumed, not separately registered. No still-open finding contradicts the
package structure; the remaining taxonomy-reduction pressure expresses through Theme 2's
schema tail.

## Theme 12 — North star: developer-independence, outcome-agnostic, working-not-filing
Intent (~7 records): users extend the system through use without waiting on developers;
the monorepo's own store is the gold-standard first instance; the aim is working
substrate, not filings. Anchors: "users need not wait for developers to implement changes
that they find through use that they need." (2026-03-24); "i want more than just filings.
this is not a project to file things. it is to create a fully functioning pi-context and
to use it." (2026-07-02).
**Status: PARTIAL — this theme is what the audit measures.** The framework ships as real
code; the 105 still-open findings are the quantified distance between "working" and
today.

## Overall numbers

- 142/142 intent records user-verbatim anchored; 0 report-authored; 0 unanchored.
- Themes fully met: 2 of 12 (harness confinement; architecture structure) — ~18 intents.
- Themes partially met: 10 of 12 — roughly 110+ intents, every one with a shipping core
  AND a proof-grounded named shortfall.
- No theme is entirely unbuilt; the discrete NOT-YET intents inside partial themes:
  the agent-layer unification arc; the object-form acceptance-criteria schema; the
  pre-decisions/contradictions block split; expression-based loop termination and the
  task-execution loop; the encode-demonstrated-ignorance mandate; the operationally
  successful full iterate-to-zero loop.
- Recurrence: the most-repeated intents are governance, not features — directive
  fidelity (7 anchor quotes across 2026-03..06), no-staleable-content (6), the canonical
  pipeline (5), process-primacy (9 repetitions), garbage-in/garbage-out ownership (~10).
  The most-restated intents are exactly the ones whose live policy carriers the audit
  found drifting (Theme 5).
