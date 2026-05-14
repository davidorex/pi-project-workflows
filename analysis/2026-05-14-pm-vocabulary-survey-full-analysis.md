# PM-vocabulary survey — exhaustive analysis

Source: `analysis/2026-05-05-pm-vocabulary-prior-art-survey.md` (L1-L914)
Investigation timestamp: 2026-05-14
Lines read: 914 / 914
Repo HEAD: 93a997ff3b3b02738e68172883c398be7fb735f7

**Plan-mode constraint note**: User task specified output path `analysis/2026-05-14-pm-vocabulary-survey-full-analysis.md`. The system-reminder activating plan mode at session start explicitly supersedes user instructions for writes and restricts the only permitted write to this plan-file path. Per the plan-mode directive, this analysis is being delivered here; the user may exit plan mode and authorize relocation to the analysis/ path explicitly.

---

## Step 1: Section table-of-contents

| Section heading | Lines | Vocabulary system covered |
|---|---|---|
| Front matter (title + scope statement) | L1-L5 | — |
| Part 1 — Canonical PM Bodies of Knowledge | L7-L8 | (part header) |
| PMBOK Guide — 7th Edition | L9-L27 | PMBOK 7e (+ 6e WBS lineage) |
| PRINCE2 (AXELOS 7e 2023) | L29-L45 | PRINCE2 |
| ITIL 4 (AXELOS 2019, updates 2023) | L47-L62 | ITIL 4 |
| ISO 21500 / 21502 / 21506 / 21503 family | L64-L78 | ISO 21500/21502/21503/21504/21506 |
| Part 2 — Agile / Lean Frameworks | L80-L82 | (part header) |
| Scrum Guide (Schwaber & Sutherland 2020) | L84-L98 | Scrum |
| Scaled Agile Framework — SAFe | L100-L118 | SAFe |
| Disciplined Agile (DA, PMI) | L120-L132 | DA / DAD |
| Kanban Method (Anderson; Kanban University) | L134-L144 | Kanban Method |
| Shape Up (Basecamp; Ryan Singer 2019) | L146-L161 | Shape Up |
| Large-Scale Scrum (LeSS) | L163-L176 | LeSS |
| Getting Things Done — GTD | L178-L190 | GTD |
| Part 3 — Software-Engineering Vocabulary Sources | L192-L194 | (part header) |
| Architecture Decision Records (ADR/MADR) | L196-L206 | ADR (Nygard), MADR |
| C4 Model (Simon Brown) | L208-L220 | C4 |
| Domain-Driven Design (Evans, Blue Book 2003) | L222-L236 | DDD |
| Event Storming (Brandolini ~2013) | L238-L248 | Event Storming |
| Semantic Versioning (semver.org) | L250-L263 | SemVer |
| Conventional Commits (v1.0.0) | L265-L273 | Conventional Commits |
| Keep a Changelog (v1.1.0) | L275-L282 | Keep a Changelog |
| IETF RFC Process (RFC 2026) | L284-L297 | IETF RFC |
| Python PEP Process (PEP 1) | L299-L307 | Python PEP |
| Rust RFC Process | L309-L316 | Rust RFC |
| Anthropic RFCs (publicly published) | L318-L321 | (empty/not found) |
| Part 4 — Issue Trackers and Commercial PM Products | L323-L325 | (part header) |
| GitHub Issues + Projects | L327-L343 | GitHub |
| Jira (Atlassian) | L345-L358 | Jira |
| Linear | L360-L376 | Linear |
| Asana | L378-L393 | Asana |
| Monday.com | L395-L409 | Monday.com |
| ClickUp | L411-L424 | ClickUp |
| Trello (Atlassian) | L426-L440 | Trello |
| Plane (plane.so, OSS) | L442-L455 | Plane |
| OpenProject (OSS) | L457-L468 | OpenProject |
| Taiga (OSS) | L470-L484 | Taiga |
| Wekan / Kanboard / Focalboard (OSS Kanban) | L486-L498 | Wekan / Kanboard / Focalboard |
| Notion (databases as PM substrate) | L500-L515 | Notion |
| Pivotal Tracker (sunset 2024) | L517-L535 | Pivotal Tracker |
| Part 5 — Anthropic / Claude Ecosystem | L537-L539 | (part header) |
| Anthropic Skills (SKILL.md) | L541-L552 | Anthropic Agent Skills |
| Superskills / claude-superskills | L554-L566 | claude-superskills |
| get-shit-done (gsd-build) | L568-L578 | GSD |
| Other High-Star Claude Code Skills Repos | L580-L584 | awesome-list catalogs |
| Part 6 — High-Star OSS Workflow / Agentic Frameworks | L586-L588 | (part header) |
| Backstage (Spotify) | L590-L604 | Backstage |
| Argo Workflows | L606-L620 | Argo Workflows |
| Temporal | L622-L635 | Temporal |
| Apache Airflow | L637-L651 | Airflow |
| LangGraph (LangChain) | L653-L663 | LangGraph |
| CrewAI | L665-L675 | CrewAI |
| AutoGen / Microsoft Agent Framework | L677-L688 | AutoGen / MS Agent Framework |
| GitHub Spec Kit | L690-L700 | Spec Kit |
| Part 7 — Cross-Cutting Concept Vocabularies | L702-L704 | (part header) |
| RACI / RASCI / DACI / RAPID | L706-L712 | RACI family |
| OKR — Objectives and Key Results | L714-L723 | OKR |
| Part 8 — Cross-Source Synthesis | L725-L727 | (part header) |
| Convergent Terms (5+ sources) | L729-L744 | (synthesis table) |
| Divergent Terms (same concept different names) | L746-L756 | (synthesis table) |
| Unique-to-One-Source Terms | L758-L786 | (synthesis table) |
| Identity-vs-Display-Label Split Observation | L787-L806 | (synthesis) |
| Lifecycle / Status Vocabulary Table — Normalized | L808-L834 | (synthesis table) |
| Prefix-Token-Namespace Patterns | L836-L861 | (synthesis) |
| Sources (URL bibliography) | L865-L914 | (bibliography) |

**Total sections counted: 50** (including part headers, system entries, synthesis blocks, and bibliography).
**Vocabulary system entries: 41** (PMBOK, PRINCE2, ITIL, ISO, Scrum, SAFe, DA, Kanban, Shape Up, LeSS, GTD, ADR, C4, DDD, Event Storming, SemVer, Conventional Commits, Keep a Changelog, IETF RFC, PEP, Rust RFC, Anthropic RFCs [empty], GitHub, Jira, Linear, Asana, Monday, ClickUp, Trello, Plane, OpenProject, Taiga, Wekan-family, Notion, Pivotal Tracker, Anthropic Skills, claude-superskills, GSD, awesome-skills, Backstage, Argo, Temporal, Airflow, LangGraph, CrewAI, AutoGen, Spec Kit, RACI, OKR).

---

## Step 2: Per-vocabulary-system content maps

### PMBOK Guide — 7th Edition (L9-L27)

- **Native vocabulary terms**:
  - Hierarchy: "Project / Phase / Deliverable / Work package / Activities" (L14-L18)
  - "12 *principles* and 8 *performance domains* (Stakeholders, Team, Development Approach and Life Cycle, Planning, Project Work, Delivery, Measurement, Uncertainty)" (L20)
  - Lifecycle: "Initiating, Planning, Executing, Monitoring & Controlling, Closing (process-group lineage from 6e)" (L22)
  - Roles: "Sponsor, Project Manager, Project Team, Stakeholders" (L23)
  - Decision: "Project charter (initiation authorization), Lessons learned register" (L24)
  - Distinguishing: "'Performance domain', 'tailoring', 'value delivery system', 'project artifact', 'stewardship principle'" (L26)
- **ID conventions**: "None standardized at the methodology level; identifiers are project-internal" (L25)
- **Lifecycle states**: Process-group names (Initiating/Planning/Executing/M&C/Closing) — not work-item-status (L22)
- **Relation kinds**: Not enumerated
- **Survey author commentary**: "Does NOT define vocabulary for: Software-specific work types (story, epic, bug); per-issue identifier prefix conventions; commit/version semantics." (L27)

### PRINCE2 (AXELOS 7e 2023) (L29-L45)

- **Native vocabulary terms**:
  - Hierarchy: "Programme / Project / Stage (management stage) / Work package / Product / Activity / task" (L32-L38)
  - 7 themes/practices: "Business Case, Organization, Quality, Plans, Risk, Change, Progress" (L39)
  - 7 processes: "Starting up a project (SU), Directing a project (DP), Initiating a project (IP), Controlling a stage (CS), Managing product delivery (MP), Managing stage boundaries (SB), Closing a project (CP)" (L40)
  - Roles: "Project Board (Executive, Senior User, Senior Supplier), Project Manager, Team Manager, Project Support, Project Assurance, Change Authority" (L41)
  - Distinguishing: "'Tolerance' (permitted deviation in time/cost/scope/quality/risk/benefit before escalation), 'exception report', 'highlight report', 'checkpoint report', 'issue register', 'lessons log', 'daily log', 'configuration item record', 'product description', 'product breakdown structure' (PBS, distinct from WBS)" (L43)
- **ID conventions**: "Process abbreviations (SU/DP/IP/CS/MP/SB/CP); product identifiers are project-defined" (L44)
- **Lifecycle states**: "Stage start → execution → stage end (with End Stage Report at gate); stage gates are go/no-go decision points" (L42)
- **Relation kinds**: Not formally enumerated; stage-gate decision-point pattern
- **Survey author commentary**: "Does NOT define vocabulary for: Iterative/sprint work units (PRINCE2 Agile is a separate companion guidance); commit/version semantics; software type taxonomies." (L45)

### ITIL 4 (L47-L62)

- **Native vocabulary terms**:
  - Hierarchy: "Service Value System (SVS) / Service Value Chain / SVC Activities (Plan, Engage, Design and Transition, Obtain/Build, Deliver and Support, Improve) / Practices (34) / Work item types — Incident, Problem, Change, Service Request, Event, Release" (L51-L55)
  - Lifecycle (incident): "New → Assigned → In Progress → Resolved → Closed" (L57)
  - "Change Authority, CAB (Change Advisory Board)" (L58)
  - Change classifications: "'standard change' / 'normal change' / 'emergency change'" (L58)
  - "General management practices (14), Service management practices (17), Technical management practices (3)" (L59)
  - "Four dimensions of service management (Organizations and people; Information and technology; Partners and suppliers; Value streams and processes); guiding principles (7): Focus on value, Start where you are, Progress iteratively with feedback, Collaborate and promote visibility, Think and work holistically, Keep it simple and practical, Optimize and automate" (L60)
- **ID conventions**: "Ticket-type prefixes are tool-specific; ITIL itself does not standardize prefixes" (L61)
- **Lifecycle states**: Incident: New / Assigned / In Progress / Resolved / Closed (L57)
- **Relation kinds**: Not enumerated (CAB approval is workflow, not edge)
- **Survey author commentary**: "Does NOT define vocabulary for: Source code/branch lifecycles; product backlog hierarchy (Scrum-style); decision-record formats." (L62)

### ISO 21500/21502/21506/21503 family (L64-L78)

- **Native vocabulary terms**:
  - Hierarchy: "Portfolio / Programme / Project / Phase / Work package / activity" (L68-L72)
  - "Vocabulary standard: ISO/TR 21506 (Vocabulary)" (L73)
  - Process counts: "ISO 21500:2012 defined 39 processes; ISO 21502:2020 expanded to 111 processes" (L74)
  - Distinguishing: "'Project context', 'project governance framework', 'project lifecycle approach' (predictive, iterative, incremental, adaptive)" (L75)
- **ID conventions**: "None defined at the standard level" (L76)
- **Lifecycle states**: Per-project lifecycle approaches enumerated (predictive/iterative/incremental/adaptive); no work-item status enum
- **Relation kinds**: Not enumerated (paywalled)
- **Survey author commentary**: "Full vocabulary tables are inside the paid PDF (ISO/TR 21506); only structural facts are publicly verifiable" (L77); "Does NOT define vocabulary for (publicly visible): Specific software-engineering work item types; commit semantics; agile sprint-level constructs." (L78)

### Scrum Guide 2020 (L84-L98)

- **Native vocabulary terms**:
  - 3 artifacts: "Product Backlog (commits to the *Product Goal*); Sprint Backlog (commits to the *Sprint Goal*); Increment (commits to the *Definition of Done*)" (L87-L90)
  - Accountabilities: "Product Owner, Scrum Master, Developers" (L92)
  - Events: "Sprint, Sprint Planning, Daily Scrum, Sprint Review, Sprint Retrospective" (L93)
  - Distinguishing: "'Definition of Done', 'Product Goal' (introduced 2020), 'Sprint Goal', 'increment', 'empirical process control' (transparency / inspection / adaptation)" (L95)
- **ID conventions**: "None; identifiers tool-defined" (L97)
- **Lifecycle states**: "Not formally defined by the Guide; status enums are tool-specific" (L94)
- **Relation kinds**: Not enumerated by Guide
- **Survey author commentary**: "the words 'epic', 'user story', and 'task' are NOT in the Scrum Guide itself — they are common companion vocabulary popularized by XP and Mike Cohn" (L96); "Does NOT define vocabulary for: Estimation units (story points are not in the Guide), portfolio/program scaling, work item type taxonomies." (L98)

### SAFe (L100-L118)

- **Native vocabulary terms**:
  - Hierarchy: "Strategic Theme / Portfolio Epic (Business Epic / Enabler Epic) / Capability / Feature (8–12 weeks) / User Story / Enabler Story / Task" (L104-L109)
  - Configurations: "Essential SAFe, Large Solution SAFe, Portfolio SAFe, Full SAFe" (L110)
  - Levels: "Team, Program (Agile Release Train / ART), Large Solution, Portfolio" (L111)
  - Cadence: "Iteration (2 weeks typical), Program Increment (PI, 8–12 weeks), PI Planning event" (L112)
  - Roles: "Release Train Engineer (RTE), Solution Train Engineer, Product Manager, Product Owner, System Architect, Solution Architect, Business Owner, Epic Owner, Lean Portfolio Management (LPM)" (L113)
  - Portfolio Epic lifecycle: "Funnel → Reviewing → Analyzing → Portfolio Backlog → Implementing → Done" (L114)
  - Distinguishing: "'Architectural Runway', 'Lean Budget', 'Value Stream' (operational vs. development), 'Spike' (exploration enabler story), 'Enabler' (4 types: Exploration, Architecture, Infrastructure, Compliance), 'Weighted Shortest Job First (WSJF)', 'Innovation and Planning (IP) iteration', 'Continuous Delivery Pipeline'" (L115)
  - "Ten SAFe Lean-Agile Principles including 'Take an economic view', 'Apply systems thinking', 'Assume variability; preserve options', 'Decentralize decision-making', 'Organize around value'" (L116)
- **ID conventions**: "None standardized; tools (Jira+plugins) implement" (L117)
- **Lifecycle states**: Portfolio Epic Kanban (L114); no Team-level status enum in survey
- **Relation kinds**: Not enumerated (parent-child implicit through hierarchy)
- **Survey author commentary**: "Does NOT define vocabulary for: Decision-record formats (uses ADRs externally); commit semantics; per-skill micro-vocabularies." (L118)

### Disciplined Agile (DA) (L120-L132)

- **Native vocabulary terms**:
  - DAD lifecycle phases: "Inception phase (vision, scope, funding); Construction phase (iterations producing consumable solution); Transition phase (release/deployment)" (L124-L126)
  - "'Work item list' (rather than product backlog) — includes requirements, defects, training, vacations, support to other teams" (L127)
  - Lifecycle options: "Agile/Scrum-based, Lean, Continuous Delivery: Agile, Continuous Delivery: Lean, Exploratory, Programme" (L128)
  - Distinguishing: "'Way of Working (WoW)', 'process goals' (rather than prescriptive practices), 'process blade' (capability area), 'MBI' (Minimum Business Increment), classes of service (Standard / Expedite / Fixed Date / Intangible — inherited from Kanban)" (L129)
- **ID conventions**: "None standardized" (L131)
- **Lifecycle states**: DAD phase-level (Inception/Construction/Transition); item-level "delegates to chosen WoW" (L132)
- **Relation kinds**: Not enumerated
- **Survey author commentary**: "DA explicitly states it maps Scrum terms to its own vocabulary table; it is 'agnostic' by design and there is 'no standard terminology for agile, nor will there ever be'" (L130). "Does NOT define vocabulary for: Specific status enums (delegates to chosen WoW); commit semantics." (L132)

### Kanban Method (L134-L144)

- **Native vocabulary terms**:
  - Implicit hierarchy: "Service / System → Swimlane → Work item type → Work item" (L137)
  - 6 Practices: "Visualize, Limit WIP, Manage Flow, Make policies explicit, Implement feedback loops, Improve collaboratively (evolve experimentally)" (L138)
  - "'Work item state' (per workflow column); 'lead time', 'cycle time', 'throughput', 'blocker'" (L139)
  - Classes of Service: "Standard, Expedite, Fixed Date, Intangible" (L140)
  - 7 cadences: "Daily Kanban Meeting, Replenishment Meeting, Service Delivery Review, Risk Review, Operations Review, Strategy Review, Delivery Planning Meeting" (L141)
  - Distinguishing: "'Cumulative Flow Diagram (CFD)', 'blocked work item', 'definition of ready / done' per column, 'STATIK' (Systems Thinking Approach to Introducing Kanban), 'kanban maturity model' (KMM)" (L142)
- **ID conventions**: "None" (L143)
- **Lifecycle states**: Per-workflow column-defined; "blocker" as orthogonal state
- **Relation kinds**: None formally; "blocker" as a non-edge property
- **Survey author commentary**: "Does NOT define vocabulary for: Hierarchical scope decomposition (no epic/story); commit semantics; decision records." (L144)

### Shape Up (L146-L161)

- **Native vocabulary terms**:
  - Hierarchy: "Pitch (shaped concept) / Bet (pitch chosen for the cycle by the betting table) / Project / Cycle work (6 weeks) / Scope / Task" (L150-L154)
  - Cadence: "6-week cycle (Build), 2-week cool-down (between cycles)" (L155)
  - Pitch ingredients (5): "Problem, Appetite, Solution, Rabbit holes, No-gos" (L156)
  - Roles: "Shapers, Betting Table (CEO/CTO/senior product/strategy), Builders (small integrated team: 1 designer + 1–2 programmers)" (L157)
  - "'Hill chart' with two phases (Uphill = figuring it out; Downhill = making it happen); replaces burndown" (L158)
  - Distinguishing: "'Appetite' (time budget *before* design — opposite of estimate), 'circuit breaker' (cycle ends regardless; project is shipped or dropped, not extended), 'scope hammering' (cutting scope to fit appetite), 'imagined vs. discovered tasks'" (L159)
- **ID conventions**: "None standardized" (L160)
- **Lifecycle states**: Hill-chart two-phase (Uphill/Downhill); plus implicit Pitch → Bet → In-Cycle → Shipped-or-Dropped at circuit breaker
- **Relation kinds**: Not formally enumerated; Pitch contains Scopes; Scope contains Tasks
- **Survey author commentary**: "Does NOT define vocabulary for: Backlog grooming (Shape Up explicitly rejects backlogs), portfolio scaling, defects (handled separately, not via pitches)." (L161)

### LeSS (L163-L176)

- **Native vocabulary terms**:
  - Hierarchy: "Product / Requirement Area (LeSS Huge only) / Area Product Backlog / Sprint Backlog (per Team) / Backlog Items: User Stories, Technical Stories, Bugs, Spikes, Epics" (L167-L171)
  - Roles: "Product Owner, Area Product Owner (LeSS Huge), Scrum Master, Team" (L172)
  - Configurations: "LeSS (2–8 teams), LeSS Huge (8+ teams; introduces Requirement Areas)" (L173)
  - Distinguishing: "'Multi-team Sprint Planning', 'Multi-team PBR (Product Backlog Refinement)', 'Overall Retrospective', 'feature team' (vs. component team), 'travelers', 'communities'" (L174)
- **ID conventions**: "None" (L175)
- **Lifecycle states**: Not enumerated by survey (delegates to Scrum)
- **Relation kinds**: Not enumerated
- **Survey author commentary**: "Does NOT define vocabulary for: Portfolio level (LeSS deliberately stays at single-product scope); commit semantics; ADR-style decisions." (L176)

### GTD (L178-L190)

- **Native vocabulary terms**:
  - Hierarchy: "Areas of Focus / Responsibility (life buckets — long-term) / Project (any objective requiring more than one action to complete) / Next Action" (L182-L184)
  - Horizons of Focus (6 levels): "Ground (current actions) → Horizon 1 (current projects) → Horizon 2 (areas of focus) → Horizon 3 (1–2 year goals) → Horizon 4 (3–5 year vision) → Horizon 5 (life purpose)" (L185)
  - 5-step workflow: "Capture → Clarify → Organize → Reflect → Engage" (L186)
  - Lifecycle: "Inbox → Actionable / Non-actionable; if actionable: Do (2-min rule) / Delegate (Waiting For) / Defer (Calendar or Next Actions); if non-actionable: Trash / Reference / Someday-Maybe" (L187)
  - Distinguishing: "'Context' (tag indicating where/with-what an action can be done — @home, @phone, @computer, @errands), 'Tickler file', 'Weekly Review' (the 'critical factor for success'), 'Someday/Maybe', 'Waiting For', 'Hard landscape'" (L188)
- **ID conventions**: "Context tags use `@`-prefix convention (e.g., `@calls`, `@office`)" (L189)
- **Lifecycle states**: Inbox / Actionable (Do/Delegate/Defer) / Non-actionable (Trash/Reference/Someday-Maybe) / Waiting For
- **Relation kinds**: Project → Next Action implicit; no other edges
- **Survey author commentary**: "Does NOT define vocabulary for: Software work item types, sprint cadences, decision records, version semantics." (L190)

### ADR / MADR (L196-L206)

- **Native vocabulary terms**:
  - Hierarchy: "Flat collection of ADRs per repository; each ADR is an immutable document" (L199)
  - Nygard template: "Title, Status, Context, Decision, Consequences" (L200)
  - MADR template: "Title, Status, Date, Deciders, Context and Problem Statement, Decision Drivers, Considered Options, Decision Outcome, Pros and Cons of the Options, Links" (L201)
  - Status: "Proposed, Accepted, Rejected, Deprecated, Superseded (by ADR-NNN). Some variants add: Draft, Final" (L202)
  - Distinguishing: "'Forces' (Alexandrian-pattern term for decision drivers), 'consequences' (rather than 'results' — emphasizes both positive and negative), 'supersedes / superseded-by' link relationship between ADRs" (L204)
  - Adoption stat: "Nygard template ≈723 repos, MADR ≈129 repos" (L205)
- **ID conventions**: "`ADR-NNN` or `NNNN-title-with-dashes.md` (zero-padded sequential id)" (L203)
- **Lifecycle states**: Proposed / Accepted / Rejected / Deprecated / Superseded; some +Draft, +Final
- **Relation kinds**: supersedes / superseded-by (L204)
- **Survey author commentary**: "Does NOT define vocabulary for: Issue/task/story hierarchy, sprint cadences, commit semantics." (L206)

### C4 Model (L208-L220)

- **Native vocabulary terms**:
  - 4 zoom levels: "System Context / Container / Component / Code" (L212-L215)
  - Elements: "Person, Software System, Container, Component, Code element. Plus relationships and external systems" (L216)
  - Supplementary diagrams: "System Landscape, Dynamic, Deployment" (L217)
  - Distinguishing: "'Notation-independent' (C4 prescribes content not visual style), 'abstraction-first', 'zoom-in relationship' between levels" (L218)
- **ID conventions**: "None (diagram naming is project-defined)" (L219)
- **Lifecycle states**: None (diagrams not workflow)
- **Relation kinds**: "zoom-in relationship between levels"; element-to-element relationships generic
- **Survey author commentary**: "Does NOT define vocabulary for: Work item hierarchy, decision records (defers to ADR), lifecycle status, commit semantics." (L220)

### DDD (L222-L236)

- **Native vocabulary terms**:
  - Strategic hierarchy: "Domain / Subdomain (Core / Supporting / Generic) / Bounded Context / Module / Aggregate / Entity / Value Object" (L226-L231)
  - Tactical patterns: "Entity, Value Object, Aggregate, Aggregate Root, Repository, Factory, Domain Service, Domain Event, Specification" (L232)
  - Strategic relationships: "Partnership, Shared Kernel, Customer/Supplier Development, Conformist, Anticorruption Layer, Open Host Service, Published Language, Separate Ways, Big Ball of Mud" (L233)
  - Distinguishing: "'Ubiquitous Language', 'Context Map', 'Anti-Corruption Layer (ACL)', 'Conformist'" (L234)
- **ID conventions**: "None standardized; class/module naming follows ubiquitous language" (L235)
- **Lifecycle states**: None
- **Relation kinds**: 9 named context-relationship patterns (L233)
- **Survey author commentary**: "Does NOT define vocabulary for: Work item tracking, sprint mechanics, decision records, version semantics." (L236)

### Event Storming (L238-L248)

- **Native vocabulary terms**:
  - 3 workshop levels: "Big Picture / Process Level / Design Level" (L242-L244)
  - Sticky colors: "Domain Event (orange), Command (blue), Aggregate (yellow), Actor / Person (small yellow), External System (pink), Read Model (green), Policy / Reaction (lilac), Hot Spot / Issue (red)" (L245)
  - Distinguishing: "'Pivotal event', 'swim lane', 'narrative timeline'" (L246)
- **ID conventions**: "None (it's a sticky-note medium)" (L247)
- **Lifecycle states**: None
- **Relation kinds**: Temporal (events on timeline); Command→Aggregate→Event causal
- **Survey author commentary**: "Does NOT define vocabulary for: Work item tracking, status lifecycles, identifiers." (L248)

### SemVer (L250-L263)

- **Native vocabulary terms**:
  - Components: "MAJOR (X) — incompatible API changes; MINOR (Y) — backward-compatible functionality additions; PATCH (Z) — backward-compatible bug fixes; Pre-release identifier (after `-`); Build metadata (after `+`)" (L254-L258)
  - Lifecycle: "Initial development (0.y.z — 'anything may change'), 1.0.0 (defines the public API), pre-release (lower precedence than the same version without label)" (L259)
  - Precedence example: "`1.0.0-alpha < 1.0.0-alpha.1 < 1.0.0-alpha.beta < 1.0.0-beta < 1.0.0-beta.2 < 1.0.0-beta.11 < 1.0.0-rc.1 < 1.0.0`" (L260)
  - Distinguishing: "'Public API', 'build metadata'" (L262)
- **ID conventions**: "Optional `v` prefix in tags (`v1.0.0`) is common but explicitly NOT part of the SemVer spec" (L261)
- **Lifecycle states**: 0.y.z (pre-API) → 1.0.0 (stable API); pre-release labels (alpha/beta/rc)
- **Relation kinds**: Precedence ordering between versions
- **Survey author commentary**: "Does NOT define vocabulary for: Project-management hierarchy, work items, lifecycle states." (L263)

### Conventional Commits v1.0.0 (L265-L273)

- **Native vocabulary terms**:
  - Structure: "`<type>[optional scope]: <description>` + optional body + optional footer(s)" (L268)
  - Types: "`feat`, `fix`, `build`, `chore`, `ci`, `docs`, `style`, `refactor`, `perf`, `test`, `revert`" (L269)
  - SemVer mapping: "`fix` → PATCH; `feat` → MINOR; `BREAKING CHANGE` (footer) or `!` after type/scope → MAJOR" (L270)
  - Distinguishing: "'BREAKING CHANGE' (must be uppercase per spec; only token that is case-sensitive), `!` shorthand, 'scope' (optional noun in parens)" (L271)
- **ID conventions**: "Type tokens form structured commit-message prefix; scope is project-defined" (L272)
- **Lifecycle states**: None (commits, not workflow)
- **Relation kinds**: None
- **Survey author commentary**: "Does NOT define vocabulary for: Issue tracking, decision records, branch lifecycles, project hierarchy." (L273)

### Keep a Changelog v1.1.0 (L275-L282)

- **Native vocabulary terms**:
  - 6 change types: "Added, Changed, Deprecated, Removed, Fixed, Security" (L278)
  - Structure: "Reverse-chronological. Top section is `[Unreleased]`. Each released version: `[X.Y.Z] - YYYY-MM-DD`" (L279)
  - Distinguishing: "'Yanked' (for releases pulled due to severe issues; suffix `[YANKED]`)" (L280)
- **ID conventions**: "Version headers use `[X.Y.Z]` bracket-and-link convention" (L281)
- **Lifecycle states**: Unreleased / X.Y.Z / Yanked
- **Relation kinds**: None
- **Survey author commentary**: "Does NOT define vocabulary for: Work items, status lifecycles, hierarchy." (L282)

### IETF RFC Process (L284-L297)

- **Native vocabulary terms**:
  - 5 categories: "Standards Track (Proposed Standard → Draft Standard (no longer used for new) → Internet Standard); Best Current Practice (BCP); Informational; Experimental; Historic" (L288-L292)
  - Pre-RFC: "'Internet-Draft' (I-D) — working document with 6-month expiration" (L293)
  - Lifecycle: "Submission → Working Group adoption → IESG review → Last Call → Publication → (potentially) Maturity advancement" (L294)
  - Distinguishing: "'Rough consensus and running code', 'humming', 'Last Call', 'IESG', 'IAB', 'obsoletes' / 'updates' / 'obsoleted-by' / 'updated-by' (RFC-to-RFC relationships)" (L296)
- **ID conventions**: "`RFC-NNNN` (sequentially numbered; never reused; once published, immutable). BCPs and STDs have their own parallel numbering (`BCP-NN`, `STD-NN`) that points to one or more RFCs" (L295)
- **Lifecycle states**: I-D / Proposed Standard / Draft Standard / Internet Standard / BCP / Informational / Experimental / Historic
- **Relation kinds**: obsoletes / updates / obsoleted-by / updated-by (L296)
- **Survey author commentary**: "Does NOT define vocabulary for: Project tasks, sprint cadences, decision-record templates beyond RFC itself." (L297)

### Python PEP Process (L299-L307)

- **Native vocabulary terms**:
  - 3 PEP types: "Standards Track, Informational, Process" (L302)
  - Statuses: "Draft, Deferred, Accepted (Standards Track) / Active (Informational, Process), Provisional, Final, Rejected, Superseded, Withdrawn" (L303)
  - Roles: "PEP Author / Sponsor / BDFL-Delegate (now Steering Council Delegate), Steering Council, Discussions-To venue" (L305)
  - Distinguishing: "'BDFL-Delegate', 'Provisional' status, 'Resolution'" (L306)
- **ID conventions**: "`PEP-NNN`; numbers below 100 are meta-PEPs (any meta-PEP is also a Process PEP); numbers below 1000 are reserved for community process" (L304)
- **Lifecycle states**: Draft / Deferred / Accepted / Active / Provisional / Final / Rejected / Superseded / Withdrawn
- **Relation kinds**: Superseded (implicit chain)
- **Survey author commentary**: "Does NOT define vocabulary for: Repository task tracking, software work units, sprint mechanics." (L307)

### Rust RFC Process (L309-L316)

- **Native vocabulary terms**:
  - States: "Open PR → Final Comment Period (FCP, 10 days) with disposition (merge / close / postpone) → Merged (becomes 'active') OR Closed" (L312)
  - Distinguishing: "'Final Comment Period (FCP)' with explicit 'disposition: merge|close|postpone', 'active RFC' (accepted, not yet implemented), 'stabilization' (separate later step from RFC acceptance), 'tracking issue' (links acceptance to implementation)" (L314)
  - Roles: "Sub-team (Lang / Libs / Compiler / Cargo / etc.), shepherds" (L315)
- **ID conventions**: "`NNNN-feature-name.md` under `text/`; assigned by PR number" (L313)
- **Lifecycle states**: Open PR / FCP / Merged (active) / Closed / Stabilized
- **Relation kinds**: tracking-issue link to implementation
- **Survey author commentary**: "Does NOT define vocabulary for: Per-task tracking inside an active RFC implementation (tracking issues delegate that to GitHub Issues)." (L316)

### Anthropic RFCs (L318-L321)

- **Native vocabulary terms**: None located.
- **ID conventions**: N/A
- **Lifecycle states**: N/A
- **Relation kinds**: N/A
- **Survey author commentary**: "No public RFC repository or process documentation was located on the org page [github.com/anthropics](https://github.com/anthropics) at the time of survey. Several third-party 'RFC' repositories named in search were unrelated to Anthropic." (L320); "No publicly enumerated Anthropic-specific RFC vocabulary; this row is intentionally empty." (L321)

### GitHub Issues + Projects (L327-L343)

- **Native vocabulary terms**:
  - Hierarchy: "Organization / Repository / Project (cross-repo possible) / Milestone (date-based grouping within a repo) / Issue (or Pull Request, or Draft Issue inside a Project) / Sub-issue (introduced 2024) / Task list item (checkbox in Issue body)" (L331-L337)
  - Built-in fields: "Assignees, Labels, Projects (membership), Milestone, Linked pull requests, Issue type (Feature / Bug / Task etc., still rolling out), Status (within a Project view)" (L338)
  - Project custom fields: "Single-select, Number, Date, Iteration, Text" (L339)
  - Lifecycle: "Open / Closed (with `closed_as: completed | not_planned | duplicate` reason — added later)" (L340)
  - Distinguishing: "'Saved view', 'Group by', 'Iteration field', 'Roadmap view', 'Insights'" (L342)
- **ID conventions**: "`#NNN` per repository (auto-incremented; PR and Issue share number-space). Cross-repo: `org/repo#NNN`" (L341)
- **Lifecycle states**: Open / Closed{completed | not_planned | duplicate}
- **Relation kinds**: Linked pull requests; Sub-issue parent/child; Project membership
- **Survey author commentary**: "Does NOT define vocabulary for: Sprint ceremonies, formal estimation units (story points are a Project custom field convention, not built-in), decision records." (L343)

### Jira (L345-L358)

- **Native vocabulary terms**:
  - Default hierarchy: "Initiative (Premium/Advanced Roadmaps) / Epic / Story / Task / Bug / Improvement / New Feature (peers) / Sub-task" (L349-L352)
  - Custom levels above Epic: "Theme, Initiative" (L353)
  - Lifecycle: "To Do → In Progress → Done (configurable per project; 'workflow scheme')" (L354)
  - Built-in fields: "Summary, Description, Reporter, Assignee, Priority (Highest/High/Medium/Low/Lowest), Resolution (Done / Won't Do / Duplicate / etc.), Labels, Components, Fix Versions, Affects Versions, Sprint, Story Points, Epic Link" (L355)
  - Distinguishing: "'Issue type', 'workflow scheme', 'screen scheme', 'permission scheme', 'issue link types' (blocks/is blocked by, clones/is cloned by, duplicates/is duplicated by, relates to, causes/is caused by), 'Quickfilters', 'JQL', 'epic color'" (L357)
- **ID conventions**: "`PROJECTKEY-NNN` (e.g., `JRA-123`); the prefix is the Project Key (configurable, typically uppercase letters); auto-incremented per project" (L356)
- **Lifecycle states**: To Do / In Progress / Done (configurable); Resolution: Done / Won't Do / Duplicate
- **Relation kinds**: blocks / is blocked by / clones / is cloned by / duplicates / is duplicated by / relates to / causes / is caused by; Epic Link; Sub-task parent (L355,L357)
- **Survey author commentary**: "Does NOT define vocabulary natively for: Story-as-parent-of-Tasks (Tasks and Stories are peers; sub-tasks are below both — well-documented limitation per Atlassian community)." (L358)

### Linear (L360-L376)

- **Native vocabulary terms**:
  - Hierarchy: "Workspace / Team / Project (units of work with clear outcome / planned completion date; can span teams) / Cycle (sprint; automated repeating time period) / Issue (parent) / Sub-issue" (L364-L369)
  - 5-status workflow: "Backlog → Todo → In Progress → Done → Canceled. Each status belongs to a 'type' (backlog, unstarted, started, completed, canceled)" (L370)
  - 5-priority: "No priority, Urgent, High, Medium, Low" (L371)
  - Issue properties: "Title, Status, priority, estimate, label, due date, assignee, parent, project, cycle" (L372)
  - Relation types: "Blocking, Blocked by, Related, Duplicate" (L373)
  - Distinguishing: "'Triage' (intake state), 'Initiatives' (above Projects, recently added), 'Roadmap', 'Views', 'Insights'" (L375)
- **ID conventions**: "`TEAM-NNN` (team key prefix + auto-incremented number)" (L374)
- **Lifecycle states**: Triage (intake) / Backlog / Todo / In Progress / Done / Canceled; status-type categories: backlog/unstarted/started/completed/canceled
- **Relation kinds**: Blocking / Blocked by / Related / Duplicate (L373)
- **Survey author commentary**: "Does NOT support: Custom priority scales (deliberately; Linear states this is to 'avoid carried-away specificity'); deeply nested sub-issues with status rollup beyond one level (status auto-rollup is opt-in)." (L376)

### Asana (L378-L393)

- **Native vocabulary terms**:
  - Hierarchy: "Organization / Workspace / Team / Goal / Portfolio (supports nesting) / Project / Section / Task / Subtask" (L382-L389)
  - Lifecycle: "Custom statuses per project (Asana provides default, customizable). Project-level statuses: On track / At risk / Off track / On hold / Complete" (L390)
  - Distinguishing: "'Inbox', 'My Tasks', 'Rules', 'Forms', 'Goals' (separate object class with KR-like progress)" (L392)
- **ID conventions**: "Numeric task GIDs (no human-friendly prefix); URLs use the GID" (L391)
- **Lifecycle states**: Project-level: On track / At risk / Off track / On hold / Complete; task-level customizable
- **Relation kinds**: Subtask parent; Portfolio→Project membership; Goal→work attribution
- **Survey author commentary**: "Does NOT define vocabulary for: Sprints/cycles natively (third-party templates); decision records." (L393)

### Monday.com (L395-L409)

- **Native vocabulary terms**:
  - Hierarchy: "Account / Workspace / Folder (one level of nesting: Folder → Sub-folder) / Board / Group / Item (row) / Sub-item (up to 4 nested levels)" (L399-L405)
  - "Status column values are entirely user-defined per board" (L406)
  - Distinguishing: "'Column' (typed: Status, Date, People, Numbers, Timeline, Tags, Mirror, Connect Boards, Formula, etc.); 'Connect Boards' column (cross-board relations); 'Mirror' column (reflects another board's column value)" (L407)
- **ID conventions**: "Item IDs are numeric / opaque; no human-readable prefix" (L408)
- **Lifecycle states**: User-defined
- **Relation kinds**: Connect Boards column; Mirror column; Sub-item parent
- **Survey author commentary**: "Does NOT define vocabulary for: Standard SDLC concepts (epic/story/sprint); decision records." (L409)

### ClickUp (L411-L424)

- **Native vocabulary terms**:
  - Hierarchy: "Workspace / Space / Folder (cannot contain other Folders; only Lists) / List (only place tasks can live) / Task / Subtask (nested deeper)" (L415-L420)
  - Lifecycle: "'Statuses' — fully customizable per Space / Folder / List, grouped into 4 status categories: Not Started, Active, Done, Closed" (L421)
  - Distinguishing: "'Custom Field', 'Custom Task Type' (rename 'Task' to 'Bug' / 'Story' / etc.), 'Goals' + 'Targets' (separate OKR-style structure), 'Whiteboards', 'Docs', 'ClickApps' (toggleable features per Space)" (L422)
- **ID conventions**: "`#NNN` per workspace; can prepend custom Task ID format" (L423)
- **Lifecycle states**: 4 categories: Not Started / Active / Done / Closed (with user-defined options inside)
- **Relation kinds**: Subtask parent
- **Survey author commentary**: "Does NOT define vocabulary for: Decision records, commit semantics." (L424)

### Trello (L426-L440)

- **Native vocabulary terms**:
  - Hierarchy: "Workspace / Board / List / Card / Checklist / Checklist item" (L429-L435)
  - Card features: "Members, Labels (color-coded), Due date, Attachments, Cover, Custom Fields (Power-Up)" (L436)
  - Lifecycle: "Implicit — defined by which List a Card sits in (e.g., 'To Do', 'Doing', 'Done')" (L437)
  - Distinguishing: "'Power-Up', 'Butler' (built-in automation), 'swimlanes' via vertical Lists" (L438)
- **ID conventions**: "Short URL slug; numeric internal ID" (L439)
- **Lifecycle states**: List-membership (implicit)
- **Relation kinds**: Checklist parent
- **Survey author commentary**: "Does NOT define vocabulary for: Epic/story/sprint, formal estimation, decision records, hierarchical work breakdown beyond Checklist items." (L440)

### Plane (L442-L455)

- **Native vocabulary terms**:
  - Hierarchy: "Workspace / Project / Module (focused grouping — feature, microservice, milestone) / Cycle (time-boxed sprint) / Work Item (formerly 'Issue') / Sub-issue" (L446-L451)
  - Lifecycle: "Backlog, Todo, In Progress, Done, Canceled (default; customizable)" (L452)
  - Distinguishing: "'Module' (used differently than SAFe — closer to feature-set / component), 'Pages' (markdown docs alongside issues), 'Views'" (L454)
- **ID conventions**: "`<PROJECT_ID>-NNN` (e.g., `PLN-123`)" (L453)
- **Lifecycle states**: Backlog / Todo / In Progress / Done / Canceled
- **Relation kinds**: Sub-issue parent; Module / Cycle membership
- **Survey author commentary**: "Does NOT define vocabulary for: Decision records as first-class objects, commit semantics." (L455)

### OpenProject (L457-L468)

- **Native vocabulary terms**:
  - Hierarchy: "Project (can contain sub-projects) / Project phase (with phase gates — go/no-go decision points) / Work package (default types: Phase, Milestone, Task, Feature, Bug, Epic, User story — all configurable) / Child work package (recursive parent/child)" (L460-L464)
  - Lifecycle: "default chain: New → In Specification → Specified → Confirmed → To be scheduled → Scheduled → In Progress → Developed → In Testing → Tested → Test failed → Closed → Rejected → On hold (configurable)" (L465)
  - Distinguishing: "'Phase gate' (decision point between phases — recently added in v16.1), 'relations' (follows / precedes / blocks / blocked by / includes / part of / requires / required by / parent / duplicates)" (L467)
- **ID conventions**: "`#NNN` global numeric ID" (L466)
- **Lifecycle states**: 14-state chain (L465)
- **Relation kinds**: follows / precedes / blocks / blocked by / includes / part of / requires / required by / parent / duplicates (L467)
- **Survey author commentary**: "Does NOT define vocabulary for: Decision records as separate object class (uses Wiki / work package types)." (L468)

### Taiga (L470-L484)

- **Native vocabulary terms**:
  - Hierarchy: "Project / Epic / User Story / Task / Parallel track: Issue (bug / question / enhancement, can be promoted to User Story)" (L473-L478)
  - User Story status: "New, Ready, In progress, Ready for test, Done, Archived" (L480)
  - Issue status: "New, In progress, Ready for test, Closed, Needs Info, Rejected, Postponed" (L481)
  - Distinguishing: "'Backlog' + 'Kanban' + 'Sprint' views as toggles on same data; 'Wiki' first-class" (L483)
- **ID conventions**: "`#NNN` per project, with type prefix in URL paths (`/epic/`, `/us/`, `/task/`, `/issue/`)" (L482)
- **Lifecycle states**: See above (separate per kind)
- **Relation kinds**: Epic→Story parent; Story→Task parent; Issue→User Story promotion
- **Survey author commentary**: "Does NOT define vocabulary for: Cross-project portfolios, decision records." (L484)

### Wekan / Kanboard / Focalboard (L486-L498)

- **Native vocabulary terms**:
  - Hierarchy (shared): "Board / Swimlane (horizontal grouping; Wekan-specific) / List (column / workflow stage) / Card / Checklist + Checklist item" (L489-L494)
  - Distinguishing: "'Swimlane' (Wekan, Kanboard); Focalboard adds 'View' types (Board / Table / Calendar / Gallery) over the same data" (L497)
- **ID conventions**: "Opaque IDs" (L496)
- **Lifecycle states**: "Defined by List membership (Trello-style)" (L495)
- **Relation kinds**: Checklist parent
- **Survey author commentary**: "Does NOT define vocabulary for: Hierarchical work breakdown beyond checklist; epic/story; decision records." (L498)

### Notion (L500-L515)

- **Native vocabulary terms**:
  - Substrate hierarchy: "Workspace / Teamspace / Page / Database / Page-as-row" (L503-L508)
  - 20 property types: "Title, Text, Number, Select, Multi-select, Status, Date, Person, Files & media, Checkbox, URL, Email, Phone, Formula, Relation, Rollup, Created time, Created by, Last edited time, Last edited by, ID" (L509)
  - Relation vocab: "One-way relation, two-way relation (synced), Rollup (aggregates a property from related rows)" (L510)
  - View types: "Table, Board, Timeline, Calendar, List, Gallery" (L511)
  - Lifecycle: "Status property type has built-in groups: To-do, In progress, Complete (each containing user-defined options)" (L512)
  - Distinguishing: "'Inline database' vs 'full-page database', 'linked view of database', 'synced block', 'filter / sort / group' composability" (L514)
- **ID conventions**: "`ID` property type can be added; format is `prefix-NNN` (e.g., `TASK-12`); auto-incremented per database. Default URLs use opaque UUIDs" (L513)
- **Lifecycle states**: Status groups To-do / In progress / Complete (with user-defined inner options)
- **Relation kinds**: One-way / two-way / Rollup
- **Survey author commentary**: "Does NOT prescribe: Any specific PM hierarchy or status taxonomy — the substrate is general-purpose." (L515)

### Pivotal Tracker (L517-L535)

- **Native vocabulary terms**:
  - Hierarchy: "Project / Epic / Iteration (auto-calculated from velocity, not manually planned) / Story (4 types: Feature / Bug / Chore / Release) / Task (checklist within a story)" (L520-L525)
  - Story types: "Feature — user-visible value; gets points (estimable). Bug — unintended behavior; no points. Chore — necessary, no direct customer value; no points; states unscheduled / unstarted / started / accepted. Release — milestone marker with optional target date; no points; states unscheduled / started / accepted" (L527-L530)
  - Lifecycle (Feature/Bug): "Unscheduled → Unstarted → Started → Finished → Delivered → Accepted (or Rejected → back to Started)" (L531)
  - Distinguishing: "'Icebox' (unscheduled tray), 'Current' (in-progress iteration), 'Backlog' (auto-planned future iterations from velocity)" (L534)
- **ID conventions**: "`#NNNNNNNN` (8-digit numeric story ID, project-scoped)" (L533)
- **Lifecycle states**: Per kind (above); Release uses milestone-marker semantics
- **Relation kinds**: Epic→Story tagging; Iteration auto-assignment; Story→Task parent
- **Survey author commentary**: "Estimation: Story points only on Features; Tracker auto-derives velocity" (L532); "Does NOT define vocabulary for: Above-project portfolio, decision records." (L535)

### Anthropic Skills (SKILL.md) (L541-L552)

- **Native vocabulary terms**:
  - Hierarchy: "Skill (a folder) / SKILL.md (required file with YAML frontmatter + markdown body) / Optional sibling directories: `scripts/`, `references/`, `assets/`" (L544-L547)
  - Frontmatter: "`name` (must match folder name), `description` (primary trigger mechanism — must include both what + when to use), `allowed-tools` (optional)" (L548)
  - Distinguishing: "'Progressive disclosure', 'skill triggering', 'skill discovery', 'Agent Skills open standard'" (L549)
  - Built-in commands cited: "`/simplify`, `/batch`, `/debug`, `/loop`, `/claude-api`" (L550)
  - Distribution: "`npx skills add <org>/<repo>`; for official Anthropic skills `npx skills add anthropics/claude-code -- skill <name>`" (L551)
- **ID conventions**: Folder-name = skill name
- **Lifecycle states**: None
- **Relation kinds**: None first-class
- **Survey author commentary**: "Does NOT define vocabulary for: Project hierarchy, work item lifecycles, decision records." (L552); "descriptions should be 'pushy' to combat undertriggering" (L548)

### claude-superskills (L554-L566)

- **Native vocabulary terms**:
  - "Flat skill catalog (55 skills) organized into named *categories*: Content / Planning / Product / Career / Research / Obsidian" (L557-L563)
  - Distribution: "Marketplace-style — `/plugin marketplace add ericgandrade/claude-superskills`, then `/plugin install`" (L564)
  - Distinguishing: "'Universal AI skills' (cross-platform), 'no API keys required'" (L565)
- **ID conventions**: None
- **Lifecycle states**: None
- **Relation kinds**: None
- **Survey author commentary**: "Does NOT define vocabulary for: Project state, decision records, work item hierarchy — these are individual skill prompts, not a substrate." (L566)

### get-shit-done (L568-L578)

- **Native vocabulary terms**:
  - Hierarchy: "Six namespace meta-skills (top-level routing entry points) / Sub-skills (concrete invocable skills)" (L572-L573)
  - Vocabulary: "'Meta-prompting', 'context engineering', 'subagent orchestration', 'state management', 'context rot', 'spec-driven development'" (L574)
  - Slash-command convention: "`/gsd:command-name` (colon namespace) on Claude Code; alternative hyphen form `/gsd-command-name` for cross-tool compatibility" (L575)
  - Distribution: "`npx get-shit-done-cc` for OpenCode / Gemini CLI / Kilo / Codex" (L576)
  - Distinguishing: "'TÂCHES' (the publisher; means 'tasks' in French), 'namespace meta-skills' (6 of them)" (L577)
- **ID conventions**: Namespace meta-skill name + sub-skill name; `/gsd:` colon-namespace
- **Lifecycle states**: None
- **Relation kinds**: meta-skill → sub-skill routing
- **Survey author commentary**: "Does NOT define publicly: A standardized work-item hierarchy or block-substrate vocabulary; the framework's full internals are command/skill prompts." (L578)

### Other High-Star Skills Repos (L580-L584)

- **Native vocabulary terms**: "'Awesome list', 'skill marketplace', 'plugin'" (L584)
- **Other content**: "VoltAgent claims 1000+ skills; alirezarezvani claims 232+. obra/superpowers describes itself as 'an agentic skills framework & software development methodology'" (L583)
- **ID/lifecycle/relations**: None first-class
- **Survey author commentary**: None beyond above

### Backstage (L590-L604)

- **Native vocabulary terms**:
  - Catalog entities: "Domain / System / Component (types: `service`, `website`, `library`, `documentation`) / API / Resource / User / Group / Location / Template" (L594-L599)
  - Relations: "`ownedBy` / `ownerOf`, `partOf` / `hasPart`, `providesApi` / `apiProvidedBy`, `consumesApi` / `apiConsumedBy`, `dependsOn` / `dependencyOf`, `memberOf` / `hasMember`, `parentOf` / `childOf`" (L600)
  - Lifecycle on Component: "`experimental`, `production`, `deprecated` (and user-definable values)" (L601)
  - Distinguishing: "'Software catalog', 'entity descriptor' (`catalog-info.yaml`), 'owner' (always a User or Group), 'TechDocs', 'template' (Scaffolder-as-code)" (L603)
- **ID conventions**: "Entity ref `kind:namespace/name` (e.g., `component:default/my-service`)" (L602)
- **Lifecycle states**: experimental / production / deprecated (+ user-definable)
- **Relation kinds**: 7 bidirectional pairs (L600)
- **Survey author commentary**: "Does NOT define vocabulary for: Sprint cadences, decision records as catalog entities natively (uses ADR plugin)." (L604)

### Argo Workflows (L606-L620)

- **Native vocabulary terms**:
  - Hierarchy: "WorkflowTemplate / Workflow / Templates (with `entrypoint`) / Steps template OR DAG template / Task / step / Container / script" (L610-L615)
  - Data-passing: "Parameters (`{{workflow.parameters.X}}`), Artifacts, Outputs (`{{tasks.step-A.outputs.parameters.X}}`)" (L616)
  - Lifecycle: "Pending, Running, Succeeded, Failed, Error, Skipped, Omitted" (L617)
  - Distinguishing: "'Entrypoint', 'exit handler', 'suspend template', 'resource template', 'withItems / withParam', 'retryStrategy'" (L618)
- **ID conventions**: "Workflow names; templates referenced by name within a Workflow" (L619)
- **Lifecycle states**: 7-state per pod/task (L617)
- **Relation kinds**: DAG edges (explicit), Steps sequence (implicit)
- **Survey author commentary**: "Does NOT define vocabulary for: Project-management hierarchy beyond execution graphs; decision records." (L620)

### Temporal (L622-L635)

- **Native vocabulary terms**:
  - Hierarchy: "Namespace / Workflow Type / Workflow Execution (Workflow ID + Run ID) / Activity / Task (Workflow Task / Activity Task / Nexus Task)" (L626-L630)
  - Communication: "Signal (asynchronous), Query (synchronous read), Update (synchronous mutation). 'Signal-With-Start'" (L631)
  - Lifecycle: "Running, Completed, Failed, Canceled, Terminated, ContinuedAsNew, TimedOut" (L632)
  - Distinguishing: "'Worker', 'Task Queue', 'Event History', 'Heartbeat', 'Continue-As-New', 'Schedule', 'Child Workflow'" (L634)
- **ID conventions**: "Workflow ID (user-supplied) + Run ID (server-generated UUID)" (L633)
- **Lifecycle states**: 7-state (L632)
- **Relation kinds**: Child Workflow; Signal chain
- **Survey author commentary**: "Does NOT define vocabulary for: PM hierarchy / sprints / decision records." (L635)

### Apache Airflow (L637-L651)

- **Native vocabulary terms**:
  - Hierarchy: "Deployment / DAG / DAG Run / Task / Task Instance / Operator / Sensor / Hook" (L641-L646)
  - Lifecycle: "none / scheduled / queued / running / success / failed / up_for_retry / up_for_reschedule / upstream_failed / skipped / removed / deferred" (L647)
  - Communication: "XCom (Cross-Communication — small key/value passed between Tasks; auto-pushed from Task return values)" (L648)
  - Distinguishing: "'Pool', 'Branching', 'Trigger Rule', 'Backfill', 'Catchup', 'Dataset', 'Sensor'" (L650)
- **ID conventions**: "DAG ID (string), Task ID (string), `{dag_id}.{task_id}` for fully-qualified" (L649)
- **Lifecycle states**: 12-state Task Instance enum (L647)
- **Relation kinds**: DAG edges; XCom pushes; Dataset triggers
- **Survey author commentary**: "Does NOT define vocabulary for: PM-level hierarchy, decision records." (L651)

### LangGraph (L653-L663)

- **Native vocabulary terms**:
  - Hierarchy: "Graph (StateGraph) / State (typed shared object) / Node (function: state → state-update) / Edge (types: Direct, Conditional)" (L657-L660)
  - Distinguishing: "'Conditional edge', 'interrupt' (human-in-the-loop pause point), 'checkpoint', 'thread' (a conversation history), 'sub-graph', 'send' (parallel fan-out)" (L662)
- **ID conventions**: Implicit (graph/node names)
- **Lifecycle states**: "Implicit (graph traversal); checkpoints persist State" (L661)
- **Relation kinds**: Direct / Conditional edges; sub-graph nesting; send (fan-out)
- **Survey author commentary**: "Does NOT define vocabulary for: PM hierarchy, decision records." (L663)

### CrewAI (L665-L675)

- **Native vocabulary terms**:
  - Hierarchy: "Crew / Process (Sequential / Hierarchical / Consensual) / Agent (role + goal + backstory + tools + LLM) / Task (description + assigned Agent + tools + expected output) / Tool" (L669-L673)
  - Distinguishing: "'Backstory', 'delegation' (agent-to-agent task handoff in Hierarchical process), 'manager_llm'" (L674)
- **ID conventions**: None
- **Lifecycle states**: None
- **Relation kinds**: Delegation; agent-task assignment
- **Survey author commentary**: "Does NOT define vocabulary for: Long-running PM substrate, decision records, status lifecycles." (L675)

### AutoGen / MS Agent Framework (L677-L688)

- **Native vocabulary terms**:
  - Hierarchy: "Application / Team / GroupChat / Agent (ConversableAgent; AssistantAgent, UserProxyAgent) / Conversation / Message exchange / Task" (L681-L685)
  - Distinguishing: "'Conversable agent', 'group chat manager', 'Magentic-One'" (L686)
- **ID conventions**: None
- **Lifecycle states**: None
- **Relation kinds**: Group/agent membership; conversation flow
- **Survey author commentary**: "AutoGen is 'in maintenance mode'; Microsoft Agent Framework is the current evolution" (L687); "Does NOT define vocabulary for: Long-running PM substrate." (L688)

### GitHub Spec Kit (L690-L700)

- **Native vocabulary terms**:
  - Hierarchy: "Constitution (`constitution.md` — non-negotiable project principles) / Spec ('what and why') / Plan (technical design) / Tasks (actionable list)" (L693-L697)
  - Slash sequence: "`/speckit.constitution` → `/speckit.specify` → `/speckit.plan` → `/speckit.tasks`" (L698)
  - Distinguishing: "'Constitution' (project-level principles document), 'spec-driven development'" (L699)
- **ID conventions**: Slash-namespace `/speckit.<command>`
- **Lifecycle states**: None
- **Relation kinds**: Sequenced pipeline (Constitution → Spec → Plan → Tasks)
- **Survey author commentary**: "Does NOT define vocabulary for: Status lifecycles, work item types, decision records as separate kind." (L700)

### RACI / RASCI / DACI / RAPID (L706-L712)

- **Native vocabulary terms**:
  - "Responsible (does the work), Accountable (signs off; one per task), Consulted (two-way input), Informed (one-way notice)" (L709)
  - Variants: "RASCI (adds Supportive), DACI (Driver/Approver/Contributors/Informed — Bain), RAPID (Recommend/Agree/Perform/Input/Decide — Bain), CARS (Communicate/Approve/Responsible/Support)" (L710)
  - Rule: "only one Accountable per row" (L711)
- **ID conventions**: None
- **Lifecycle states**: None
- **Relation kinds**: Role-to-work-item edge per role letter
- **Survey author commentary**: "Does NOT define vocabulary for: Work item hierarchy, lifecycles." (L712)

### OKR (L714-L723)

- **Native vocabulary terms**:
  - Hierarchy: "Objective (qualitative, ambitious, time-bound) / Key Result (2–5 per Objective; quantitative, verifiable) / Initiative (the work / project that aims to move a Key Result)" (L717-L720)
  - 3 OKR types: "Committed (must achieve), Aspirational / Stretch (push beyond comfort), Learning (experimental)" (L721)
  - Distinguishing: "'KPI' (steady-state metric, distinct from KR), 'scoring' (typically 0.0–1.0 or 0–10), 'moonshot' / 'roofshot'" (L722)
- **ID conventions**: None
- **Lifecycle states**: "varies by tool" (L723)
- **Relation kinds**: Objective → Key Result (1:many); Key Result → Initiative (many:many)
- **Survey author commentary**: "Does NOT define vocabulary for: Status lifecycles for KRs (varies by tool), work item types." (L723)

### Cross-Source Synthesis blocks (L727-L861)

(Not a vocabulary system; cross-reference content used in Step 3 and Step 4.)

- Convergent terms table (L729-L744): Task / Project / Epic / Story / Backlog / Sprint-Iteration-Cycle / Status / Milestone / Workflow / Owner-Assignee / Label-Tag / Dependency-Blocked-by (12 rows)
- Divergent terms table (L746-L756): Time-boxed iteration / Highest-level ambition / Smallest unit of work / Decision record / Stable identity vs display label / "Phase" of project / Things-not-deliverable-to-user (7 rows)
- Unique-to-one-source table (L758-L786): 27 entries — Architectural Runway (SAFe), Hill chart/Appetite/Circuit breaker (Shape Up), Ubiquitous Language (DDD), Class of Service/STATIK (Kanban), Process Goal/WoW (DA), Tolerance/Highlight Report (PRINCE2), Performance Domain (PMBOK 7), Service Value Chain (ITIL 4), BREAKING CHANGE (CC), Yanked (KaC), Continue-As-New/Heartbeat/Run ID (Temporal), XCom (Airflow), FCP (Rust RFC), Provisional/BDFL-Delegate (PEP), TechDocs/Scaffolder/catalog-info.yaml (Backstage), Hot Spot/Pivotal Event (Event Storming), Backstory/Manager LLM (CrewAI), Constitution (Spec Kit), Context @-prefix (GTD), Power-Up/Butler (Trello), Mirror/Connect Boards (Monday), Rollup (Notion), Anti-Corruption Layer (DDD), Triage (Linear)
- Identity-vs-display-label split (L787-L806): 12-source comparison table + note on sources that don't separate
- Lifecycle/status normalized table (L808-L834): 18 sources mapped to 6 buckets (Intake / Not Started / Active / Review-Verify / Done / Abandoned); plus bucket-vocabulary distillation (L834)
- Prefix-token-namespace patterns (L836-L861): 14-row pattern table; 3 dominant patterns identified at L856-L859; "ADR / PEP / RFC use sequential global numbering with the *kind* baked into the prefix word itself" (L861)

---

## Step 3: System × decision bearing matrix

The 7 decisions (cross-reference targets):
1. Block-kind set — which arc-tracking blocks to install + author
2. Arc scope
3. Dogfood depth
4. ID conventions — PHASE-NNN suffix style + binding to phase.json `number` integer
5. FK-as-field migration
6. Pre-existing `.project/phases/{1..4}.json` disposition
7. `config.lenses[]` content set

| System | Decision N | How it bears | Evidence (verbatim + L#) |
|---|---|---|---|
| PMBOK | 1 | Phase as named work-unit level above Deliverable; argues for separating Phase from Project | "Project / Phase / Deliverable / Work package / Activities" (L14-L18) |
| PMBOK | 2 | Phase as scope-of-arc unit (process-group lifecycle) | "Lifecycle vocabulary: Initiating, Planning, Executing, Monitoring & Controlling, Closing" (L22) |
| PMBOK | 4 | No prescription; identifiers project-internal | "None standardized at the methodology level; identifiers are project-internal" (L25) |
| PRINCE2 | 1 | Stage (=phase) as first-class management unit with End Stage Report — supports phase-as-block | "Stage (management stage — between project board decision points)" (L35); "Stage start → execution → stage end (with End Stage Report at gate)" (L42) |
| PRINCE2 | 4 | Process abbreviations (SU/DP/IP/CS/MP/SB/CP); product IDs project-defined — mixed model | "Process abbreviations (SU/DP/IP/CS/MP/SB/CP); product identifiers are project-defined" (L44) |
| PRINCE2 | 7 | "highlight report", "checkpoint report" — lens-style projection of stage state | "'highlight report', 'checkpoint report'" (L43) |
| ITIL 4 | 1 | "Change", "Release" as block kinds analogous to phase/release | "Work item types — Incident, Problem, Change, Service Request, Event, Release" (L55) |
| ITIL 4 | 2 | Service Value Chain Activities (Plan/Engage/Design and Transition/Obtain-Build/Deliver and Support/Improve) — alternative arc decomposition | "Plan, Engage, Design and Transition, Obtain/Build, Deliver and Support, Improve" (L53) |
| ISO 21500 | 1 | Portfolio / Programme / Project / Phase — 4-tier arc-tracking | "Portfolio / Programme / Project / Phase / Work package / activity" (L68-L72) |
| ISO 21500 | 2 | Predictive/iterative/incremental/adaptive — explicit lifecycle-approach taxonomy informs arc-scope question | "'project lifecycle approach' (predictive, iterative, incremental, adaptive)" (L75) |
| Scrum | 1 | No phase block; arc-tracking is sprint-bounded — argues against multi-level phase substrate at small scale | "the words 'epic', 'user story', and 'task' are NOT in the Scrum Guide itself" (L96) |
| Scrum | 2 | Sprint = atomic arc unit; arc scope = product / sprint dual | "Product Backlog (commits to the *Product Goal*); Sprint Backlog (commits to the *Sprint Goal*)" (L88-L89) |
| SAFe | 1 | Strategic Theme / Portfolio Epic / Capability / Feature / Story / Task — 6-level arc hierarchy | "Strategic Theme / Portfolio Epic ... / Capability / Feature ... / User Story / Enabler Story / Task" (L104-L109) |
| SAFe | 2 | PI = 8-12 week arc; Feature fits one PI | "Iteration (2 weeks typical), Program Increment (PI, 8–12 weeks)" (L112); "Feature (Program / Essential level — fits in one PI, 8–12 weeks)" (L107) |
| SAFe | 7 | Portfolio Kanban lens: "Funnel → Reviewing → Analyzing → Portfolio Backlog → Implementing → Done" | "Lifecycle (for Portfolio Epic): Funnel → Reviewing → Analyzing → Portfolio Backlog → Implementing → Done. (Kanban-style portfolio Kanban.)" (L114) |
| DA | 2 | Inception/Construction/Transition 3-phase arc model | "Inception phase ... Construction phase ... Transition phase" (L124-L126) |
| DA | 1 | "no standard terminology for agile, nor will there ever be" — bears on vocabulary-choice ethic | "DA explicitly states it maps Scrum terms to its own vocabulary table; it is 'agnostic' by design and there is 'no standard terminology for agile, nor will there ever be'" (L130) |
| Kanban | 5 | "Service / System → Swimlane → Work item type → Work item" — flat workflow not FK-heavy | "Kanban does not impose a hierarchy" (L137) |
| Kanban | 7 | 7 Kanban cadences as lens-style review meetings | "Daily Kanban Meeting, Replenishment Meeting, Service Delivery Review, Risk Review, Operations Review, Strategy Review, Delivery Planning Meeting" (L141) |
| Shape Up | 1 | Pitch / Bet / Project / Cycle / Scope / Task — arc-tracking via Pitch | "Pitch / Bet / Project / Cycle work / Scope / Task" (L150-L154) |
| Shape Up | 2 | 6-week cycle as arc atom; "circuit breaker" caps scope | "6-week cycle (Build), 2-week cool-down" (L155); "'circuit breaker' (cycle ends regardless; project is shipped or dropped, not extended)" (L159) |
| Shape Up | 3 | Pitch ingredients (5): Problem/Appetite/Solution/Rabbit holes/No-gos — candidate fields for arc-record block | "Pitch ingredients (5): Problem, Appetite, Solution, Rabbit holes, No-gos" (L156) |
| LeSS | 1 | Backlog Items: User Stories, Technical Stories, Bugs, Spikes, Epics — block-type set | "Backlog Items: User Stories, Technical Stories, Bugs, Spikes, Epics" (L171) |
| GTD | 1 | "Areas of Focus / Project / Next Action" — 3-tier light arc model | "Areas of Focus / Responsibility ... Project ... Next Action" (L182-L184) |
| GTD | 2 | Horizons of Focus (6) provides arc-scope hierarchy template | "Ground ... Horizon 1 (current projects) ... Horizon 5 (life purpose)" (L185) |
| GTD | 4 | `@context` prefix convention; non-numeric | "Context tags use `@`-prefix convention (e.g., `@calls`, `@office`)" (L189) |
| ADR | 4 | `ADR-NNN` OR `NNNN-title-with-dashes.md` two-form ID convention; kind baked into prefix word | "`ADR-NNN` or `NNNN-title-with-dashes.md` (zero-padded sequential id)" (L203); "ADR / PEP / RFC use sequential global numbering with the *kind* baked into the prefix word itself" (L861) |
| ADR | 5 | supersedes/superseded-by as edges — pure relation, not FK-as-field | "'supersedes / superseded-by' link relationship between ADRs" (L204) |
| Backstage | 5 | 7 bidirectional relation pairs (ownedBy/ownerOf, partOf/hasPart, etc.) — pure-relation model | "`ownedBy` / `ownerOf`, `partOf` / `hasPart`, ..." (L600) |
| Backstage | 4 | `kind:namespace/name` ref — kind-namespaced ID | "Entity ref `kind:namespace/name`" (L602); "Kind-namespaced refs" (L859) |
| Backstage | 7 | `lifecycle` field (experimental/production/deprecated) as cross-cutting view | "`experimental`, `production`, `deprecated` (and user-definable values)" (L601) |
| Jira | 4 | `PROJECTKEY-NNN` per-project namespace pattern | "`PROJECTKEY-NNN` (e.g., `JRA-123`)" (L356) |
| Jira | 5 | 10+ named issue link types as relations (not FKs) | "blocks/is blocked by, clones/is cloned by, duplicates/is duplicated by, relates to, causes/is caused by" (L357) |
| Linear | 4 | `TEAM-NNN` per-team namespace | "`TEAM-NNN` (team key prefix + auto-incremented number)" (L374) |
| Linear | 5 | 4 relation types (Blocking/Blocked by/Related/Duplicate) | "Blocking, Blocked by, Related, Duplicate" (L373) |
| Linear | 7 | Status-type categorization (backlog/unstarted/started/completed/canceled) as lens | "Each status belongs to a 'type' (backlog, unstarted, started, completed, canceled)" (L370) |
| Linear | 2 | Cycle (sprint) as auto-repeating time period | "Cycle (Linear's term for sprint; automated repeating time period)" (L367) |
| Plane | 4 | `<PROJECT_ID>-NNN` (e.g., `PLN-123`) — same pattern as Jira/Linear | "`<PROJECT_ID>-NNN` (e.g., `PLN-123`)" (L453) |
| Plane | 1 | "Module" as Plane-specific arc-block (feature/microservice/milestone grouping) | "Module (focused grouping — feature, microservice, milestone)" (L448) |
| OpenProject | 1 | Phase, Milestone as distinct work-package types; Phase gate as decision point | "default types: Phase, Milestone, Task, Feature, Bug, Epic, User story — all configurable" (L463); "'Phase gate' (decision point between phases — recently added in v16.1)" (L467) |
| OpenProject | 5 | 10 explicit relations (follows/precedes/blocks/blocked by/includes/part of/requires/required by/parent/duplicates) | "'relations' (follows / precedes / blocks / blocked by / includes / part of / requires / required by / parent / duplicates)" (L467) |
| OpenProject | 6 | Phase as work-package type — supports keeping phase items as instances of one schema | "Phase, Milestone, Task, Feature, Bug, Epic, User story" (L463) |
| OpenProject | 4 | `#NNN` global numeric | "`#NNN` global numeric ID" (L466) |
| Taiga | 4 | `#NNN` per project + type prefix in URL paths | "`#NNN` per project, with type prefix in URL paths (`/epic/`, `/us/`, `/task/`, `/issue/`)" (L482) |
| Notion | 4 | `prefix-NNN` ID property (e.g., `TASK-12`); auto-incremented per database — direct analog to our PHASE-NNN question | "`ID` property type can be added; format is `prefix-NNN` (e.g., `TASK-12`); auto-incremented per database" (L513) |
| Notion | 5 | One-way / two-way / Rollup relation kinds | "One-way relation, two-way relation (synced), Rollup" (L510) |
| Pivotal Tracker | 1 | "Release" story type as milestone marker — alternative to separate milestone block | "Release — milestone marker with optional target date; no points; states unscheduled / started / accepted" (L530) |
| Pivotal Tracker | 4 | `#NNNNNNNN` 8-digit numeric, no prefix | "`#NNNNNNNN` (8-digit numeric story ID, project-scoped)" (L533) |
| Pivotal Tracker | 7 | Icebox / Current / Backlog as lens views | "'Icebox' (unscheduled tray), 'Current' (in-progress iteration), 'Backlog'" (L534) |
| GitHub | 1 | Milestone as first-class arc-tracking block; Sub-issue 2024 | "Milestone (date-based grouping within a repo) / Issue / Sub-issue (introduced 2024)" (L334-L336) |
| GitHub | 4 | `#NNN` per repository (shared Issue+PR number-space) | "`#NNN` per repository (auto-incremented; PR and Issue share number-space). Cross-repo: `org/repo#NNN`" (L341) |
| GitHub | 7 | "Saved view", "Group by", "Iteration field", "Roadmap view" — built-in lens vocabulary | "'Saved view', 'Group by', 'Iteration field', 'Roadmap view', 'Insights'" (L342) |
| ADR | 7 | Status as cross-cutting view (Proposed/Accepted/Rejected/Deprecated/Superseded) | "Proposed, Accepted, Rejected, Deprecated, Superseded (by ADR-NNN)" (L202) |
| PEP | 4 | `PEP-NNN` global; sub-100 = meta — number-range semantics inform ID-design | "`PEP-NNN`; numbers below 100 are meta-PEPs; numbers below 1000 are reserved for community process" (L304) |
| IETF RFC | 4 | `RFC NNNN` global immutable + `BCP-NN`/`STD-NN` parallel aliases | "`RFC-NNNN` (sequentially numbered; never reused; once published, immutable). BCPs and STDs have their own parallel numbering" (L295) |
| IETF RFC | 5 | obsoletes/updates/obsoleted-by/updated-by — relation-pair pattern | "'obsoletes' / 'updates' / 'obsoleted-by' / 'updated-by' (RFC-to-RFC relationships)" (L296) |
| Rust RFC | 4 | `NNNN-feature-name.md` (slug as part of id) | "`NNNN-feature-name.md` under `text/`; assigned by PR number" (L313) |
| Spec Kit | 1 | Constitution / Spec / Plan / Tasks pipeline — Plan as named arc-tracking unit | "Constitution / Spec / Plan / Tasks" (L693-L697) |
| Spec Kit | 2 | Sequenced 4-step arc | "`/speckit.constitution` → `/speckit.specify` → `/speckit.plan` → `/speckit.tasks`" (L698) |
| RACI | 5 | Role-to-task edges (R/A/C/I/S) as explicit relations | "Responsible / Accountable / Consulted / Informed" (L709) |
| OKR | 1 | Objective / Key Result / Initiative — 3-tier arc-tracking; Initiative = arc unit | "Objective / Key Result / Initiative (the work / project that aims to move a Key Result)" (L717-L720) |
| OKR | 5 | KR ↔ Initiative many-to-many implicit edges | "Initiative (the work / project that aims to move a Key Result)" (L720) |
| Synthesis: convergent (L729-L744) | 1 | "Milestone" present in 5 sources (GitHub, OpenProject, Pivotal, Asana, PRINCE2 stage-gate) — supports milestone as candidate block | "Milestone — GitHub Issues, OpenProject (Milestone work-package type), Pivotal Tracker (Release ≈ milestone), Asana (informal), PRINCE2 (stage gate ≈ milestone)" (L740) |
| Synthesis: convergent (L729-L744) | 2 | "Sprint / Iteration / Cycle" convergence across 9 sources | "Sprint (Scrum), Iteration (SAFe, Pivotal), Cycle (Linear, Plane, Shape Up — but 6 weeks!), Program Increment (SAFe — but 8–12 weeks)" (L738) |
| Synthesis: convergent (L729-L744) | 5 | "Dependency / Blocked-by" convergence across 7 sources | "Linear (issue relations), Jira (issue links), GitHub (linked issues), OpenProject (relations), Airflow (DAG edges), Argo (DAG dependencies), Temporal (Child Workflow / signals)" (L744) |
| Synthesis: divergent (L746-L756) | 1 | "Phase of project" naming divergence — Phase (PMBOK/PRINCE2-stage/OpenProject/DAD), Stage (PRINCE2), Inception/Construction/Transition (DAD), Shaping/Betting/Building (Shape Up) | "Phase (PMBOK, PRINCE2 stage, OpenProject, DAD), Stage (PRINCE2), Inception/Construction/Transition (DAD), Shaping/Betting/Building (Shape Up), Plan/Build/Operate (informal)" (L755) |
| Synthesis: divergent (L746-L756) | 1 | "Highest-level ambition" naming divergence across 10 sources informs roadmap-block naming | "Strategic Theme (SAFe), Portfolio Epic (SAFe), Initiative (Jira, OKR), Goal (Asana, OKR), Objective (OKR), Project (GTD — but means *anything multi-step*), Vision (DAD), Mission (informal), Constitution (Spec Kit), Horizon 5 / Life Purpose (GTD), Domain (Backstage, DDD)" (L751) |
| Synthesis: identity-vs-display (L787-L806) | 4 | Direct comparison table for our PHASE-NNN choice | Full table L791-L803 |
| Synthesis: lifecycle table (L808-L834) | 7 | 6-bucket normalized lifecycle vocabulary | Full table L812-L832 |
| Synthesis: prefix patterns (L836-L861) | 4 | 3 dominant patterns identified — "Per-container sequential with container-key prefix: `KEY-NNN` (Jira, Linear, Plane); Global sequential, no kind disambiguation: GitHub, OpenProject, RFC; Kind-namespaced refs: Backstage, Conventional Commits" | "Three patterns dominate: 1. Per-container sequential with container-key prefix: `KEY-NNN` ... 2. Global sequential, no kind disambiguation ... 3. Kind-namespaced refs" (L856-L859) |

**Step 3 row count: 65 rows.**

Decisions with no Step 3 rows: **3 (Dogfood depth) and 6 (Pre-existing `.project/phases/{1..4}.json` disposition)** have minimal coverage — only Shape Up's pitch-ingredients (L156) maps to Decision 3, and OpenProject's phase-as-work-package-type (L463) is the closest the doc comes to Decision 6. These are project-internal questions about how to dogfood and what to do with existing files; an external prior-art survey does not directly bear except by analogy.

---

## Step 4: Decision-by-decision synthesis

### Decision 1: Block-kind set — which arc-tracking blocks to install + author

**Vocabulary candidates surfaced by the doc**:
- **Roadmap-shaped**: SAFe Strategic Theme / Portfolio Epic; OKR Objective; Spec Kit Constitution; GTD Horizon 3-5; DAD Vision; Backstage Domain; Linear Initiative
- **Phase-shaped**: PMBOK Phase; PRINCE2 Stage; ISO 21502 Phase; OpenProject Phase (work-package type) + Phase Gate; DAD Inception/Construction/Transition; Shape Up Shaping/Betting/Building; Spec Kit Constitution-Spec-Plan-Tasks (pipeline-as-phases)
- **Milestone-shaped**: GitHub Milestone; OpenProject Milestone (work-package type); Pivotal Release-as-milestone-marker; Asana informal; PRINCE2 stage-gate ≈ milestone
- **Plan-shaped**: Spec Kit Plan (between Spec and Tasks); SAFe PI Plan; PRINCE2 Plans (one of 7 themes); OKR Initiative
- **Epic/Feature-shaped (the rung above Task)**: Jira Epic / Initiative; SAFe Feature / Capability; Linear Project; Plane Module; Taiga Epic; LeSS Epic; OpenProject Epic (work-package type); Pivotal Epic
- **Iteration/cycle-shaped (time-boxed arc)**: Scrum Sprint; SAFe Iteration / PI; Linear Cycle; Plane Cycle; Pivotal Iteration; Shape Up Cycle (6 weeks); GitHub Iteration field

**Survey author's recommendation**: No explicit recommendation in doc.

**Sub-decisions raised**:
- Single phase block vs. separate phase + milestone blocks (OpenProject does both as work-package types L463)
- Roadmap-as-block vs. roadmap-as-lens-over-phases (SAFe Portfolio Kanban L114 is one-block-with-status-projection)
- Whether to include an iteration/cycle block (8 sources have one; Shape Up's 6-week cycle is a notable outlier)
- Whether arc-block needs explicit "type/kind" enum (OpenProject conflates types under one schema; Taiga separates URL paths per kind L482)

### Decision 2: Arc scope

**Vocabulary candidates surfaced by the doc**:
- 5-process-group arcs (PMBOK Initiating/Planning/Executing/M&C/Closing — L22)
- 3-phase arcs (DAD Inception/Construction/Transition — L124-L126)
- 4-step pipeline arcs (Spec Kit Constitution → Spec → Plan → Tasks — L698)
- Time-boxed cycle arcs (Shape Up 6-week — L155; Scrum Sprint; SAFe PI 8-12wk — L112; Linear Cycle auto-repeat — L367)
- Lifecycle-approach declarations (ISO 21502: predictive / iterative / incremental / adaptive — L75)
- Portfolio Kanban arc (SAFe: Funnel → Reviewing → Analyzing → Portfolio Backlog → Implementing → Done — L114)
- Workflow-execution arcs (Argo Pending→Succeeded; Temporal Running→Completed→ContinuedAsNew — L617, L632)

**Survey author's recommendation**: No explicit recommendation in doc.

**Sub-decisions raised**:
- Time-boxed vs. open-ended arc (Shape Up circuit-breaker L159 vs. PMBOK closing process group)
- Single-arc vs. nested-arc (PMBOK Project→Phase L14-L18 vs. flat Spec Kit pipeline)
- Whether arc-scope is declared up front (Shape Up appetite L159) or derived from work as it progresses

### Decision 3: Dogfood depth

**Vocabulary candidates surfaced by the doc**: Shape Up pitch-ingredients-as-fields candidate (Problem / Appetite / Solution / Rabbit holes / No-gos — L156); MADR fields (Title/Status/Date/Deciders/Context-and-Problem-Statement/Decision Drivers/Considered Options/Decision Outcome/Pros and Cons/Links — L201)

**Survey author's recommendation**: No explicit recommendation in doc. This decision is project-internal and not addressed by external survey.

**Sub-decisions raised**: None directly from doc.

### Decision 4: ID conventions — PHASE-NNN suffix style + binding to phase.json `number` integer

**Vocabulary candidates surfaced by the doc** (full table L787-L806 and patterns L856-L859):
- **Per-container sequential with container-key prefix**: `KEY-NNN` (Jira `JRA-123` L356, Linear `TEAM-NNN` L374, Plane `PLN-123` L453, Notion `prefix-NNN` per-database L513)
- **Global sequential, no kind disambiguation**: `#NNN` (GitHub L341, OpenProject L466, Pivotal `#NNNNNNNN` 8-digit L533)
- **Kind-namespaced refs**: Backstage `kind:namespace/name` (L602), Conventional Commits `type(scope):` (L851), Slash commands `/namespace:command` (L854)
- **Kind baked into prefix word + sequential**: ADR-NNN / PEP-NNN / RFC NNNN (L861 — "ADR / PEP / RFC use sequential global numbering with the *kind* baked into the prefix word itself")
- **Slug-as-id**: ADR `NNNN-title-with-dashes.md` (L203), Rust RFC `NNNN-feature-name.md` (L313)
- **Number-range semantics**: PEP "numbers below 100 are meta-PEPs; numbers below 1000 are reserved for community process" (L304)
- **Identity-vs-display split** explicitly enumerated for 12 sources at L791-L803
- **Stable vs. display label**: most sources separate `KEY-NNN` (or `#NNN` or UUID) from a human-readable title field

**Survey author's recommendation**: No explicit recommendation in doc. The doc enumerates patterns descriptively and identifies 3 dominant ones at L856-L859 without prescribing.

**Sub-decisions raised**:
- Whether `NNN` binds to a separate integer field (per-block) — survey shows Pivotal uses pure numeric, ADR/PEP/RFC use prefix-then-number-then-optional-slug
- Whether PHASE-NNN suffix is zero-padded (ADR uses 4-digit zero-pad L203; PEP no pad L304; Jira no pad L356)
- Whether per-container or global (per L856-L859 distinction — KEY-NNN vs. `#NNN`)
- Whether to follow ADR-style "kind baked into prefix word" precedent (PHASE-001 = the kind `PHASE`)

### Decision 5: FK-as-field migration

**Vocabulary candidates surfaced by the doc**:
- **Pure-relation-edge model** (closure-table-aligned, opposite of FK-as-field):
  - Backstage 7 bidirectional pairs (L600)
  - OpenProject 10 relations (L467)
  - Jira issue link types (10+) (L357)
  - Linear 4 relation types (L373)
  - Notion one-way / two-way / Rollup (L510)
  - ADR supersedes / superseded-by (L204)
  - RFC obsoletes / updates (L296)
  - DDD 9 strategic-context-relationship names (L233)
- **Field-encoded references / hybrid**:
  - Jira has both Epic Link (FK-ish field) AND issue link types (relations) (L355, L357) — coexistence pattern
  - SAFe parent hierarchy is implicit through level (no explicit field)
  - Asana Subtask parent field (L389)
  - LangGraph edges are first-class objects between nodes (L660)
- **Many-to-many KR↔Initiative** (OKR L720) — requires relation-table, not FK

**Survey author's recommendation**: No explicit recommendation in doc. Note: in the convergent table at L744, "Dependency / Blocked-by" is named as convergent across 7 sources, all of which model it as relation (not FK).

**Sub-decisions raised**:
- Whether to support bidirectional-pair convention (Backstage `ownedBy`/`ownerOf` L600; RFC `obsoletes`/`obsoleted-by` L296)
- Whether named relation-types must be registered/closed-set (OpenProject 10 fixed L467) or extensible per project (project-defined)
- Whether parent edges (a single common case) get a shortcut field while other edges go through relations (Backstage `partOf` is in the relation set; Asana parent is a field)

### Decision 6: Pre-existing `.project/phases/{1..4}.json` disposition

**Vocabulary candidates surfaced by the doc**: Only OpenProject directly addresses phase-as-work-package-type (L463), suggesting phase-instances live as items of one schema rather than separate files per phase. Notion's database-per-table model (L507) supports one-database-many-rows. Most other sources treat phases as embedded structure within a project rather than separate file-per-phase.

**Survey author's recommendation**: No explicit recommendation in doc (this is a project-internal file-layout question).

**Sub-decisions raised**: None directly from doc.

### Decision 7: `config.lenses[]` content set

**Vocabulary candidates surfaced by the doc** (lens-shaped projections present in surveyed systems):
- **Status-bucket lens**: ClickUp 4 categories (Not Started / Active / Done / Closed — L421); Linear status-types (backlog/unstarted/started/completed/canceled — L370); normalized 6-bucket lifecycle table L812-L832
- **Owner/role lens**: Backstage `owner` (L603); RACI matrix (L709); ITIL process owner (L742)
- **Lifecycle-stage lens**: Backstage `experimental`/`production`/`deprecated` (L601)
- **Iteration/cycle lens**: GitHub Iteration field (L339, L342); Linear Cycle (L367); Pivotal Current / Icebox / Backlog (L534)
- **Roadmap lens**: GitHub "Roadmap view" (L342); Linear "Roadmap" (L375); SAFe Portfolio Kanban (L114)
- **Saved-view / grouping lens**: GitHub "Saved view", "Group by" (L342); Notion view types Table/Board/Timeline/Calendar/List/Gallery (L511); Focalboard Board/Table/Calendar/Gallery (L497)
- **Cadence/meeting lens**: Kanban 7 cadences (Daily / Replenishment / Service Delivery Review / Risk Review / Operations Review / Strategy Review / Delivery Planning — L141); PRINCE2 highlight/checkpoint/exception reports (L43)
- **Decision-status lens**: ADR status enum (L202); PEP status enum (L303)
- **Class-of-Service lens**: Kanban / DA (Standard / Expedite / Fixed Date / Intangible — L129, L140)
- **Priority lens**: Linear (Urgent/High/Medium/Low/No) — L371; Jira (Highest/High/Medium/Low/Lowest) — L355
- **Triage lens**: Linear Triage state (L375); Pivotal Icebox (L534)

**Survey author's recommendation**: No explicit recommendation in doc.

**Sub-decisions raised**:
- Whether lens vocabulary is closed (Linear's 5 status types) or open (Notion view types extensible)
- Whether lenses map 1:1 to view types or are orthogonal grouping projections
- Whether to ship project-management cadence lenses (Kanban-style 7-cadence) vs. just-status lenses

---

## Step 5: Non-reified propositions

Survey-author observations or claims that go beyond pure external description and could be filed as substrate items. Each is checked against `.project/*.json` via grep for substantive coverage.

1. **"DA explicitly states it maps Scrum terms to its own vocabulary table; it is 'agnostic' by design and there is 'no standard terminology for agile, nor will there ever be'"** (L130).
   - **Substrate cross-check**: Grepped `.project/*.json` for "no standard terminology", "agnostic", "vocabulary table" — not present.
   - **Suggested filing**: R-NNNN (research finding) — supports a DEC about vocabulary-stability assumptions
   - **Verdict**: Not filed.

2. **"the words 'epic', 'user story', and 'task' are NOT in the Scrum Guide itself — they are common companion vocabulary popularized by XP and Mike Cohn"** (L96).
   - **Substrate cross-check**: Not present in `.project/*.json` (grep on "Mike Cohn", "Scrum Guide", "epic story task" — no match).
   - **Suggested filing**: R-NNNN
   - **Verdict**: Not filed.

3. **"Three patterns dominate: 1. Per-container sequential with container-key prefix: `KEY-NNN`. 2. Global sequential, no kind disambiguation. 3. Kind-namespaced refs"** (L856-L859) and **"ADR / PEP / RFC use sequential global numbering with the *kind* baked into the prefix word itself (`ADR`, `PEP`, `RFC`) rather than a separate field"** (L861).
   - **Substrate cross-check**: Decisions.json does not contain explicit DEC on ID-pattern selection; conventions.json may or may not (not enumerated in grep result for the survey vocabulary). The phase-tasks list (TASK-025 etc.) confirms this project already uses pattern-3-ish (kind baked into prefix word).
   - **Suggested filing**: DEC-NNNN making ID-pattern-3 explicit as canon (currently used in practice but undeclared as canon) — or R-NNNN documenting the pattern-survey conclusion.
   - **Verdict**: Pattern is in use, but the survey-grounded decision artifact is not filed.

4. **"Some sources DO NOT separate identity from display: Trello (uses URL slug derived from card name), Wekan / Kanboard / Focalboard (opaque IDs only), most Notion default usage"** (L806).
   - **Substrate cross-check**: No DEC or R citing this dichotomy.
   - **Suggested filing**: R-NNNN supporting Decision 4 sub-decisions.
   - **Verdict**: Not filed.

5. **"Common bucket terms by frequency: 'In Progress' / 'Active' / 'Started' / 'Running' all denote the *Active* bucket; 'Done' / 'Completed' / 'Closed' / 'Resolved' / 'Accepted' / 'Final' all denote the *Done* bucket; 'Canceled' / 'Rejected' / 'Withdrawn' / 'Won't Do' / 'not_planned' / 'Terminated' / 'Historic' / 'Deprecated' all denote the *Abandoned* bucket"** (L834).
   - **Substrate cross-check**: Status enums per schema exist in `.project/schemas/*.schema.json` but no overarching DEC normalizing them via this 6-bucket survey-grounding.
   - **Suggested filing**: R-NNNN supporting Decision 7 (lens-content set) — bucket normalization grounding.
   - **Verdict**: Not filed.

6. **"Adoption stat: Per joelparkerhenderson survey, Nygard template ≈723 repos, MADR ≈129 repos"** (L205).
   - **Substrate cross-check**: research.json contains R-0001..R-0011 (per memory) — survey did not confirm an R entry citing this adoption ratio.
   - **Suggested filing**: R-NNNN if ADR-format choice is on the table; otherwise informational only.
   - **Verdict**: Not filed.

7. **"AutoGen is 'in maintenance mode'; Microsoft Agent Framework is the current evolution"** (L687).
   - **Substrate cross-check**: Not in `.project/*.json`.
   - **Suggested filing**: None — not bearing on the 7 decisions.
   - **Verdict**: Not relevant to current decision set; not a candidate for filing.

8. **"Anthropic RFCs ... No publicly enumerated Anthropic-specific RFC vocabulary; this row is intentionally empty"** (L321).
   - **Substrate cross-check**: Not filed as a gap or research entry.
   - **Suggested filing**: R-NNNN (negative finding) — relevant if Anthropic-style RFC processes are being considered as model.
   - **Verdict**: Not filed; possibly not relevant.

9. **"OpenProject 'Phase gate' (decision point between phases — recently added in v16.1)"** (L467).
   - **Substrate cross-check**: Phase-gate vocabulary not in `.project/decisions.json` or schemas.
   - **Suggested filing**: R-NNNN if phase-gate as concept is relevant to Decision 2 (arc scope) — phase boundaries as decision points.
   - **Verdict**: Not filed.

10. **"Shape Up explicitly rejects backlogs"** (L161).
    - **Substrate cross-check**: Not in `.project/*.json`.
    - **Suggested filing**: R-NNNN if backlog-vs-pitch dichotomy informs Decision 1 or 3.
    - **Verdict**: Not filed.

11. **"Linear does NOT support: Custom priority scales (deliberately; Linear states this is to 'avoid carried-away specificity')"** (L376).
    - **Substrate cross-check**: Not filed.
    - **Suggested filing**: R-NNNN if priority-scale design is on the table.
    - **Verdict**: Not filed.

12. **"Jira does NOT define vocabulary natively for: Story-as-parent-of-Tasks (Tasks and Stories are peers; sub-tasks are below both — well-documented limitation per Atlassian community)"** (L358).
    - **Substrate cross-check**: Not filed.
    - **Suggested filing**: R-NNNN if parent-of-task design is on the table.
    - **Verdict**: Not filed.

**Total non-reified propositions: 12.**

---

## Verification block

- **Read total**: 914 lines / 914 (full file read across multiple paginated Read calls; offsets 1, 250, 600, 899).
- **Last 5 lines of source (verbatim)**:
```
- Plane: [docs.plane.so/introduction/core-concepts](https://docs.plane.so/introduction/core-concepts)
- OpenProject: [openproject.org/docs/user-guide/work-packages](https://www.openproject.org/docs/user-guide/work-packages/)
- Taiga: [taiga.pm/working-with-epics](https://taiga.pm/working-with-epics/)
- Wekan: [wekan.github.io](https://wekan.github.io/)
- Notion: [notion.com/help/database-properties](https://www.notion.com/help/database-properties)
```
(Lines 896-900; the file's final line is L914 which is the RACI/OKR bibliographic entry. The doc ends with a trailing newline at L915.)
- **Final 5 lines of source (verbatim L910-L914)**:
```
- LangGraph: [docs.langchain.com/oss/python/langgraph](https://docs.langchain.com/oss/python/langgraph/workflows-agents)
- CrewAI: [docs.crewai.com](https://docs.crewai.com/)
- AutoGen: [github.com/microsoft/autogen](https://github.com/microsoft/autogen)
- Spec Kit: [github.com/github/spec-kit](https://github.com/github/spec-kit)
- RACI / OKR: [Wikipedia RAM](https://en.wikipedia.org/wiki/Responsibility_assignment_matrix), [whatmatters.com OKR](https://www.whatmatters.com/faqs/okr-meaning-definition-example)
```
- **Sections in source**: 50 (8 Part headers + 41 vocabulary-system entries + 1 cross-source-synthesis container with 6 subsections + 1 Sources bibliography). Vocabulary system entries proper = 41.
- **Sections covered in Step 2**: 41 vocabulary-system content maps + 6 synthesis-block summaries = full coverage. (Part headers and Sources bibliography listed in Step 1 TOC but not given content maps in Step 2 since they are not vocabulary systems.)
- **Decisions with at least one Step 3 row**: 1, 2, 4, 5, 7 (also 3 and 6 if Shape Up pitch-ingredients/OpenProject phase-as-work-package count, but those are weak and noted under each decision's section).
- **Decisions with no Step 3 rows (substantive)**: 3 (Dogfood depth) and 6 (Pre-existing phases-file disposition) — both are project-internal questions not directly addressed by external prior-art survey, as the doc is explicitly scoped to external sources per the project's `feedback_survey_means_external_only.md` mandate.
