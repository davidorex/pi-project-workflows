# Project-Management Vocabulary Prior-Art Survey

A descriptive enumeration of named work-unit hierarchies, lifecycle vocabularies, role/authority terms, prefix conventions, and decision/record vocabularies across canonical PM bodies of knowledge, agile/lean frameworks, software-engineering practices, RFC processes, issue trackers, agentic frameworks, and Anthropic-ecosystem skill systems. Per-source extraction first, then cross-source synthesis.

---

## Part 1 — Canonical Project-Management Bodies of Knowledge

### PMBOK Guide — 7th Edition (PMI, 2021)

- **Source:** [PMI Standards: PMBOK Guide](https://www.pmi.org/standards/pmbok); supplementary: [Standard for Project Management overview, MPUG](https://mpug.com/pmbok-principles-performance-domains-and-artifacts-how-do-they-work-together)
- **Year/version:** 7th edition, 2021 (full text behind PMI paywall; structural metadata public).
- **Hierarchy of work units (PMBOK 6e WBS lineage, retained as artifact in 7e):**
  1. Project (highest)
  2. Phase
  3. Deliverable
  4. Work package (lowest level for which cost and duration are estimated and managed)
  5. Activities (decomposed below work package for scheduling)
  - Source: [PMI WBS basic principles](https://www.pmi.org/learning/library/work-breakdown-structure-basic-principles-4883)
- **7th edition reframes around:** 12 *principles* and 8 *performance domains* (Stakeholders, Team, Development Approach and Life Cycle, Planning, Project Work, Delivery, Measurement, Uncertainty). Source: [Ricardo Vargas PMBOK 7 Performance Domains](https://ricardo-vargas.com/podcasts/pmbok-guide-7th-edition-performance-domains-part-3-3/)
- **Cross-cutting concepts:**
  - Lifecycle vocabulary: Initiating, Planning, Executing, Monitoring & Controlling, Closing (process-group lineage from 6e).
  - Role vocabulary: Sponsor, Project Manager, Project Team, Stakeholders.
  - Decision vocabulary: Project charter (initiation authorization), Lessons learned register.
- **Prefix conventions:** None standardized at the methodology level; identifiers are project-internal.
- **Distinguishing terminology:** "Performance domain", "tailoring", "value delivery system", "project artifact", "stewardship principle".
- **Does NOT define vocabulary for:** Software-specific work types (story, epic, bug); per-issue identifier prefix conventions; commit/version semantics.

### PRINCE2 (AXELOS, 7th edition 2023; previously UK Cabinet Office)

- **Source:** [PRINCE2.com USA: 7 Principles, Themes/Practices, Processes](https://www.prince2.com/usa/blog/the-7-principles-themes-and-processes-of-prince2); [PRINCE2 Wiki processes](https://prince2.wiki/processes/)
- **Hierarchy of work units:**
  1. Programme (above project; covered in MSP, sister method)
  2. Project
  3. Stage (management stage — between project board decision points)
  4. Work package (authorised by Project Manager to Team Manager)
  5. Product (deliverable artifact; PRINCE2 is product-focused)
  6. Activity / task (within work package)
- **7 themes (renamed "practices" in PRINCE2 7e):** Business Case, Organization, Quality, Plans, Risk, Change, Progress. Source: [Unpacking the seven themes](https://www.prince2.com/usa/blog/unpacking-the-seven-themes-of-the-prince2-methodology)
- **7 processes:** Starting up a project (SU), Directing a project (DP), Initiating a project (IP), Controlling a stage (CS), Managing product delivery (MP), Managing stage boundaries (SB), Closing a project (CP).
- **Role vocabulary:** Project Board (Executive, Senior User, Senior Supplier), Project Manager, Team Manager, Project Support, Project Assurance, Change Authority.
- **Lifecycle vocabulary (per stage):** Stage start → execution → stage end (with End Stage Report at gate); stage gates are go/no-go decision points.
- **Distinguishing terminology:** "Tolerance" (permitted deviation in time/cost/scope/quality/risk/benefit before escalation), "exception report", "highlight report", "checkpoint report", "issue register", "lessons log", "daily log", "configuration item record", "product description", "product breakdown structure" (PBS, distinct from WBS).
- **Prefix conventions:** Process abbreviations (SU/DP/IP/CS/MP/SB/CP); product identifiers are project-defined.
- **Does NOT define vocabulary for:** Iterative/sprint work units (PRINCE2 Agile is a separate companion guidance); commit/version semantics; software type taxonomies.

### ITIL 4 (AXELOS, 2019; updates through 2023)

- **Source:** [ITIL 4 Service Value Chain (ITSM.tools)](https://itsm.tools/itil-4-service-value-chain/); [ITIL 4 Glossary (ManageEngine)](https://www.manageengine.com/products/service-desk/itsm/itil-4-glossary-terms.html)
- **Hierarchy of work units (Service Value System):**
  1. Service Value System (SVS, top-level)
  2. Service Value Chain (operating model)
  3. Service Value Chain Activities: Plan, Engage, Design and Transition, Obtain/Build, Deliver and Support, Improve (six activities)
  4. Practices (34 management practices in ITIL 4)
  5. Work item types — Incident, Problem, Change, Service Request, Event, Release
- **Cross-cutting concepts:**
  - Lifecycle vocabulary (incident): New → Assigned → In Progress → Resolved → Closed (varies by tool implementing the practice).
  - Decision vocabulary: Change Authority, CAB (Change Advisory Board, retained from ITIL v3 vocabulary), "standard change" / "normal change" / "emergency change" classifications.
- **Practice categories (ITIL 4):** General management practices (14), Service management practices (17), Technical management practices (3).
- **Distinguishing terminology:** "Four dimensions of service management" (Organizations and people; Information and technology; Partners and suppliers; Value streams and processes); "guiding principles" (7 of them: Focus on value, Start where you are, Progress iteratively with feedback, Collaborate and promote visibility, Think and work holistically, Keep it simple and practical, Optimize and automate). Source: [ITSM.tools SVS explained](https://itsm.tools/the-itil-4-service-value-system-explained/)
- **Prefix conventions:** Ticket-type prefixes are tool-specific; ITIL itself does not standardize prefixes.
- **Does NOT define vocabulary for:** Source code/branch lifecycles; product backlog hierarchy (Scrum-style); decision-record formats.

### ISO 21500 / 21502 / 21506 / 21503 family

- **Source:** [ISO 21500:2021 — Context and concepts](https://www.iso.org/standard/75704.html); [ISO 21502:2020 — Guidance on project management](https://www.iso.org/standard/74947.html); standards behind paywall, abstract metadata public.
- **Hierarchy of work units (per ISO 21502:2020 abstract):**
  1. Portfolio (governed by ISO 21504)
  2. Programme (governed by ISO 21503)
  3. Project
  4. Phase
  5. Work package / activity (lowest)
- **Vocabulary standard:** ISO/TR 21506 (Vocabulary). Source: [Wikipedia ISO 21500](https://en.wikipedia.org/wiki/ISO_21500)
- **Process count:** ISO 21500:2012 defined 39 processes; ISO 21502:2020 expanded to 111 processes.
- **Distinguishing terminology:** "Project context", "project governance framework", "project lifecycle approach" (predictive, iterative, incremental, adaptive). Per ISO 21502:2020 abstract: addresses "managing benefits, business and societal change and information".
- **Prefix conventions:** None defined at the standard level.
- **Notes:** Full vocabulary tables are inside the paid PDF (ISO/TR 21506); only structural facts are publicly verifiable.
- **Does NOT define vocabulary for (publicly visible):** Specific software-engineering work item types; commit semantics; agile sprint-level constructs.

---

## Part 2 — Agile / Lean Frameworks

### Scrum Guide (Schwaber & Sutherland, 2020 edition)

- **Source:** [The 2020 Scrum Guide](https://scrumguides.org/scrum-guide.html); [PDF](https://scrumguides.org/docs/scrumguide/v2020/2020-Scrum-Guide-US.pdf)
- **Hierarchy of work units (3 official artifacts):**
  1. Product Backlog (commits to the *Product Goal*)
  2. Sprint Backlog (commits to the *Sprint Goal*) — set of Product Backlog items selected for the Sprint plus a plan
  3. Increment (commits to the *Definition of Done*)
  - Source: [Wrike Scrum Artifacts](https://www.wrike.com/scrum-guide/scrum-artifacts/)
- **Roles ("accountabilities" in 2020):** Product Owner, Scrum Master, Developers (the three accountabilities of the Scrum Team).
- **Events:** Sprint, Sprint Planning, Daily Scrum, Sprint Review, Sprint Retrospective.
- **Lifecycle vocabulary (item-level):** Not formally defined by the Guide; status enums are tool-specific.
- **Distinguishing terminology:** "Definition of Done", "Product Goal" (introduced 2020), "Sprint Goal", "increment", "empirical process control" (transparency / inspection / adaptation).
- **Note on Epic/Story/Task:** Per Aha! and multiple sources, the words "epic", "user story", and "task" are NOT in the Scrum Guide itself — they are common companion vocabulary popularized by XP and Mike Cohn. Source: [Aha! themes/epics/stories/tasks](https://www.aha.io/roadmapping/guide/agile/themes-vs-epics-vs-stories-vs-tasks); [Scrum Alliance epic article](https://resources.scrumalliance.org/Article/epic-agile)
- **Prefix conventions:** None; identifiers tool-defined.
- **Does NOT define vocabulary for:** Estimation units (story points are not in the Guide), portfolio/program scaling, work item type taxonomies.

### Scaled Agile Framework — SAFe (Scaled Agile Inc.)

- **Source:** [Scaled Agile Framework Epic](https://framework.scaledagile.com/epic); [SAFe Enablers](https://framework.scaledagile.com/enablers); [Atlassian SAFe overview](https://www.atlassian.com/agile/agile-at-scale/what-is-safe)
- **Hierarchy of work units (full SAFe):**
  1. Strategic Theme
  2. Portfolio Epic (Business Epic / Enabler Epic)
  3. Capability (Large Solution level — broken into multiple Features)
  4. Feature (Program / Essential level — fits in one PI, 8–12 weeks)
  5. User Story / Enabler Story (Team level — fits in one Iteration)
  6. Task
- **Configurations:** Essential SAFe, Large Solution SAFe, Portfolio SAFe, Full SAFe.
- **Levels:** Team, Program (Agile Release Train / ART), Large Solution, Portfolio.
- **Cadence vocabulary:** Iteration (2 weeks typical), Program Increment (PI, 8–12 weeks), PI Planning event.
- **Role vocabulary:** Release Train Engineer (RTE), Solution Train Engineer, Product Manager, Product Owner, System Architect, Solution Architect, Business Owner, Epic Owner, Lean Portfolio Management (LPM).
- **Lifecycle (for Portfolio Epic):** Funnel → Reviewing → Analyzing → Portfolio Backlog → Implementing → Done. (Kanban-style portfolio Kanban.)
- **Distinguishing terminology:** "Architectural Runway", "Lean Budget", "Value Stream" (operational vs. development), "Spike" (exploration enabler story), "Enabler" (4 types: Exploration, Architecture, Infrastructure, Compliance), "Weighted Shortest Job First (WSJF)", "Innovation and Planning (IP) iteration", "Continuous Delivery Pipeline". Source: [SAFe Enablers explained](https://agileseekers.com/blog/how-safe-enablers-help-build-the-architectural-runway)
- **Ten SAFe Lean-Agile Principles** including "Take an economic view", "Apply systems thinking", "Assume variability; preserve options", "Decentralize decision-making", "Organize around value". Source: [Wikipedia SAFe](https://en.wikipedia.org/wiki/Scaled_agile_framework)
- **Prefix conventions:** None standardized; tools (Jira+plugins) implement.
- **Does NOT define vocabulary for:** Decision-record formats (uses ADRs externally); commit semantics; per-skill micro-vocabularies.

### Disciplined Agile (DA, PMI)

- **Source:** [Disciplined Agile Glossary](https://www.pmi.org/disciplined-agile/glossary); [DA Lifecycles](https://www.pmi.org/disciplined-agile/lifecycle); [Wikipedia DAD](https://en.wikipedia.org/wiki/Disciplined_agile_delivery)
- **Hierarchy / phases (DAD lifecycle):**
  1. Inception phase (vision, scope, funding)
  2. Construction phase (iterations producing consumable solution)
  3. Transition phase (release/deployment)
- **Work item vocabulary:** "Work item list" (rather than product backlog) — includes requirements, defects, training, vacations, support to other teams. Source: [DA Agile Terminology](https://www.pmi.org/disciplined-agile/agile/agileterminology)
- **Lifecycle options:** DA explicitly supports multiple lifecycles (Agile/Scrum-based, Lean, Continuous Delivery: Agile, Continuous Delivery: Lean, Exploratory, Programme).
- **Distinguishing terminology:** "Way of Working (WoW)", "process goals" (rather than prescriptive practices), "process blade" (capability area), "MBI" (Minimum Business Increment), classes of service (Standard / Expedite / Fixed Date / Intangible — inherited from Kanban).
- **Mapping principle:** DA explicitly states it maps Scrum terms to its own vocabulary table; it is "agnostic" by design and there is "no standard terminology for agile, nor will there ever be".
- **Prefix conventions:** None standardized.
- **Does NOT define vocabulary for:** Specific status enums (delegates to chosen WoW); commit semantics.

### Kanban Method (David J. Anderson; Kanban University)

- **Source:** [Official Kanban Guide](https://kanban.university/kanban-guide/); [Kanban Glossary](https://kanban.university/glossary/)
- **Hierarchy of work units:** Kanban does not impose a hierarchy; it visualizes the flow of any "work item type" through a "service" (workflow). Implicit hierarchy: Service / System → Swimlane → Work item type → Work item.
- **6 Practices:** Visualize, Limit WIP, Manage Flow, Make policies explicit, Implement feedback loops, Improve collaboratively (evolve experimentally).
- **Lifecycle vocabulary:** "Work item state" (per workflow column); "lead time", "cycle time", "throughput", "blocker".
- **Classes of Service (CoS):** Standard, Expedite, Fixed Date, Intangible. Source: [Kanban Zone Classes of Service](https://kanbanzone.com/resources/kanban/classes-of-service/)
- **Cadence vocabulary:** Daily Kanban Meeting, Replenishment Meeting, Service Delivery Review, Risk Review, Operations Review, Strategy Review, Delivery Planning Meeting (the seven Kanban cadences).
- **Distinguishing terminology:** "Cumulative Flow Diagram (CFD)", "blocked work item", "definition of ready / done" per column, "STATIK" (Systems Thinking Approach to Introducing Kanban), "kanban maturity model" (KMM).
- **Prefix conventions:** None.
- **Does NOT define vocabulary for:** Hierarchical scope decomposition (no epic/story); commit semantics; decision records.

### Shape Up (Basecamp; Ryan Singer, 2019)

- **Source:** [basecamp.com/shapeup](https://basecamp.com/shapeup); [Shape Up appendix on implementing](https://basecamp.com/shapeup/4.0-appendix-01)
- **Hierarchy of work units:**
  1. Pitch (shaped concept; written by senior people during shaping)
  2. Bet (pitch chosen for the cycle by the betting table)
  3. Project / Cycle work (6 weeks)
  4. Scope (a chunk of work that can be built, integrated, and finished independently — represented as dots on the hill chart)
  5. Task (within a scope)
- **Cadence vocabulary:** 6-week cycle (Build), 2-week cool-down (between cycles).
- **Pitch ingredients (5):** Problem, Appetite, Solution, Rabbit holes, No-gos.
- **Role vocabulary:** Shapers, Betting Table (CEO/CTO/senior product/strategy), Builders (small integrated team: 1 designer + 1–2 programmers).
- **Tracking vocabulary:** "Hill chart" with two phases (Uphill = figuring it out; Downhill = making it happen); replaces burndown.
- **Distinguishing terminology:** "Appetite" (time budget *before* design — opposite of estimate), "circuit breaker" (cycle ends regardless; project is shipped or dropped, not extended), "scope hammering" (cutting scope to fit appetite), "imagined vs. discovered tasks".
- **Prefix conventions:** None standardized.
- **Does NOT define vocabulary for:** Backlog grooming (Shape Up explicitly rejects backlogs), portfolio scaling, defects (handled separately, not via pitches).

### Large-Scale Scrum (LeSS) — Bas Vodde & Craig Larman

- **Source:** [Less.works framework](https://less.works/less/framework); [LeSS Huge Requirement Areas](https://less.works/less/less-huge/requirement-areas.html); [Area Product Backlog](https://less.works/less/less-huge/area-product-backlog.html)
- **Hierarchy of work units:**
  1. Product (one product, one Product Backlog, one Product Owner)
  2. Requirement Area (LeSS Huge only; categorization of PBIs into customer-focused areas)
  3. Area Product Backlog (view into Product Backlog filtered by Requirement Area)
  4. Sprint Backlog (per Team)
  5. Backlog Items: User Stories, Technical Stories, Bugs, Spikes, Epics
- **Roles:** Product Owner, Area Product Owner (LeSS Huge), Scrum Master, Team.
- **Two configurations:** LeSS (2–8 teams), LeSS Huge (8+ teams; introduces Requirement Areas).
- **Distinguishing terminology:** "Multi-team Sprint Planning", "Multi-team PBR (Product Backlog Refinement)", "Overall Retrospective", "feature team" (vs. component team), "travelers", "communities".
- **Prefix conventions:** None.
- **Does NOT define vocabulary for:** Portfolio level (LeSS deliberately stays at single-product scope); commit semantics; ADR-style decisions.

### Getting Things Done — GTD (David Allen, 2001; revised 2015)

- **Source:** [gettingthingsdone.com](https://gettingthingsdone.com/); [GTD Approach to Linking Next Actions and Projects](https://gettingthingsdone.com/2020/06/the-gtd-approach-to-linking-next-actions-and-projects/); [Wikipedia GTD](https://en.wikipedia.org/wiki/Getting_Things_Done)
- **Hierarchy of work units:**
  1. Areas of Focus / Responsibility (life buckets — long-term)
  2. Project (any objective requiring more than one action to complete)
  3. Next Action (the next physical, visible activity that moves something toward completion)
- **Horizons of Focus (6 levels):** Ground (current actions) → Horizon 1 (current projects) → Horizon 2 (areas of focus) → Horizon 3 (1–2 year goals) → Horizon 4 (3–5 year vision) → Horizon 5 (life purpose).
- **5-step workflow:** Capture → Clarify → Organize → Reflect → Engage.
- **Lifecycle vocabulary (per item):** Inbox → Actionable / Non-actionable; if actionable: Do (2-min rule) / Delegate (Waiting For) / Defer (Calendar or Next Actions); if non-actionable: Trash / Reference / Someday-Maybe.
- **Distinguishing terminology:** "Context" (tag indicating where/with-what an action can be done — @home, @phone, @computer, @errands), "Tickler file", "Weekly Review" (the "critical factor for success"), "Someday/Maybe", "Waiting For", "Hard landscape" (calendar items that must happen on a specific day).
- **Prefix conventions:** Context tags use `@`-prefix convention (e.g., `@calls`, `@office`).
- **Does NOT define vocabulary for:** Software work item types, sprint cadences, decision records, version semantics.

---

## Part 3 — Software-Engineering Vocabulary Sources

### Architecture Decision Records (ADR) — Michael Nygard format + MADR

- **Source:** [Nygard's "Documenting Architecture Decisions" (2011)](https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions); [adr.github.io](https://adr.github.io/); [MADR site](https://adr.github.io/madr/)
- **Hierarchy:** Flat collection of ADRs per repository; each ADR is an immutable document.
- **Nygard template sections:** Title, Status, Context, Decision, Consequences.
- **MADR template sections:** Title, Status, Date, Deciders, Context and Problem Statement, Decision Drivers, Considered Options, Decision Outcome, Pros and Cons of the Options, Links.
- **Status vocabulary:** Proposed, Accepted, Rejected, Deprecated, Superseded (by ADR-NNN). Some variants add: Draft, Final. Source: [ADR overview / status states](https://ctaverna.github.io/adr/); [Decentraland ADR-277 introducing "Deprecated"](https://adr.decentraland.org/adr/ADR-277)
- **Prefix conventions:** `ADR-NNN` or `NNNN-title-with-dashes.md` (zero-padded sequential id). Source: [joelparkerhenderson/architecture-decision-record](https://github.com/joelparkerhenderson/architecture-decision-record)
- **Distinguishing terminology:** "Forces" (Alexandrian-pattern term for decision drivers), "consequences" (rather than "results" — emphasizes both positive and negative), "supersedes / superseded-by" link relationship between ADRs.
- **Adoption stat:** Per joelparkerhenderson survey, Nygard template ≈723 repos, MADR ≈129 repos.
- **Does NOT define vocabulary for:** Issue/task/story hierarchy, sprint cadences, commit semantics.

### C4 Model (Simon Brown, 2006–2011)

- **Source:** [c4model.com](https://c4model.com/); [Wikipedia C4 model](https://en.wikipedia.org/wiki/C4_model)
- **Hierarchy of diagrams (4 levels of zoom):**
  1. Level 1: System Context diagram
  2. Level 2: Container diagram (a "container" = independently deployable unit — webapp, API, mobile app, database, message broker, file system; NOT Docker container specifically)
  3. Level 3: Component diagram
  4. Level 4: Code diagram (UML class or similar; often omitted as auto-generatable)
- **Element vocabulary:** Person, Software System, Container, Component, Code element. Plus relationships and external systems.
- **Supplementary diagrams:** System Landscape, Dynamic, Deployment.
- **Distinguishing terminology:** "Notation-independent" (C4 prescribes content not visual style), "abstraction-first", "zoom-in relationship" between levels.
- **Prefix conventions:** None (diagram naming is project-defined).
- **Does NOT define vocabulary for:** Work item hierarchy, decision records (defers to ADR), lifecycle status, commit semantics.

### Domain-Driven Design (Eric Evans, "Blue Book", 2003)

- **Source:** [Eric Evans book on DDD](https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf); [Wikipedia DDD](https://en.wikipedia.org/wiki/Domain-driven_design); [Martin Fowler bliki: BoundedContext](https://martinfowler.com/bliki/BoundedContext.html)
- **Hierarchy (strategic patterns):**
  1. Domain (the problem space)
  2. Subdomain (Core / Supporting / Generic)
  3. Bounded Context (each with its own model and ubiquitous language)
  4. Module (within a context)
  5. Aggregate (consistency boundary)
  6. Entity / Value Object
- **Tactical patterns:** Entity, Value Object, Aggregate, Aggregate Root, Repository, Factory, Domain Service, Domain Event, Specification.
- **Strategic patterns / context relationships:** Partnership, Shared Kernel, Customer/Supplier Development, Conformist, Anticorruption Layer, Open Host Service, Published Language, Separate Ways, Big Ball of Mud. Source: [DDD Reference PDF](https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf)
- **Distinguishing terminology:** "Ubiquitous Language" (shared vocabulary between domain experts and developers), "Context Map" (diagram of bounded contexts and their relationships), "Anti-Corruption Layer (ACL)", "Conformist".
- **Prefix conventions:** None standardized; class/module naming follows ubiquitous language.
- **Does NOT define vocabulary for:** Work item tracking, sprint mechanics, decision records, version semantics.

### Event Storming (Alberto Brandolini, ~2013)

- **Source:** [Wikipedia Event Storming](https://en.wikipedia.org/wiki/Event_storming); [Eventstormingjournal](https://www.eventstormingjournal.com/software%20design/how-to-explain-design-level-event-storming-to-your-mother/)
- **Workshop levels (3):**
  1. Big Picture (cross-system overview)
  2. Process Level (specific workflow/process within a system)
  3. Design Level (implementable domain model)
- **Sticky-note color vocabulary:** Domain Event (orange), Command (blue), Aggregate (yellow), Actor / Person (small yellow), External System (pink), Read Model (green), Policy / Reaction (lilac), Hot Spot / Issue (red).
- **Distinguishing terminology:** "Pivotal event" (event that marks a significant business change), "swim lane", "narrative timeline".
- **Prefix conventions:** None (it's a sticky-note medium).
- **Does NOT define vocabulary for:** Work item tracking, status lifecycles, identifiers.

### Semantic Versioning (semver.org)

- **Source:** [semver.org](https://semver.org/); [GitHub semver/semver](https://github.com/semver/semver/blob/master/semver.md)
- **Hierarchy of version components:**
  1. MAJOR (X) — incompatible API changes
  2. MINOR (Y) — backward-compatible functionality additions
  3. PATCH (Z) — backward-compatible bug fixes
  4. Pre-release identifier (after `-`, dot-separated alphanumeric, e.g., `-alpha.1`, `-beta.2`, `-rc.1`)
  5. Build metadata (after `+`, ignored in precedence)
- **Lifecycle vocabulary:** Initial development (0.y.z — "anything may change"), 1.0.0 (defines the public API), pre-release (lower precedence than the same version without label).
- **Precedence rule example (from spec §11):** `1.0.0-alpha < 1.0.0-alpha.1 < 1.0.0-alpha.beta < 1.0.0-beta < 1.0.0-beta.2 < 1.0.0-beta.11 < 1.0.0-rc.1 < 1.0.0`.
- **Prefix conventions:** Optional `v` prefix in tags (`v1.0.0`) is common but explicitly NOT part of the SemVer spec.
- **Distinguishing terminology:** "Public API" (the contract that drives version bumps), "build metadata" (ignored when comparing versions).
- **Does NOT define vocabulary for:** Project-management hierarchy, work items, lifecycle states.

### Conventional Commits (conventionalcommits.org, v1.0.0)

- **Source:** [conventionalcommits.org/en/v1.0.0/](https://www.conventionalcommits.org/en/v1.0.0/)
- **Structure:** `<type>[optional scope]: <description>` + optional body + optional footer(s).
- **Types (spec mentions only `feat` and `fix` as required; others recommended via Angular convention):** `feat`, `fix`, `build`, `chore`, `ci`, `docs`, `style`, `refactor`, `perf`, `test`, `revert`. Source: [conventionalcommits.org](https://www.conventionalcommits.org/en/v1.0.0/); [@commitlint/config-conventional types](https://gist.github.com/qoomon/5dfcdf8eec66a051ecd85625518cfd13)
- **SemVer mapping:** `fix` → PATCH; `feat` → MINOR; `BREAKING CHANGE` (footer) or `!` after type/scope → MAJOR.
- **Distinguishing terminology:** "BREAKING CHANGE" (must be uppercase per spec; only token that is case-sensitive), `!` shorthand (e.g., `feat(api)!: …`), "scope" (optional noun in parens).
- **Prefix conventions:** Type tokens form structured commit-message prefix; scope is project-defined.
- **Does NOT define vocabulary for:** Issue tracking, decision records, branch lifecycles, project hierarchy.

### Keep a Changelog (keepachangelog.com, v1.1.0)

- **Source:** [keepachangelog.com/en/1.1.0/](https://keepachangelog.com/en/1.1.0/)
- **Section vocabulary (6 change types):** Added, Changed, Deprecated, Removed, Fixed, Security.
- **Structure:** Reverse-chronological. Top section is `[Unreleased]`. Each released version: `[X.Y.Z] - YYYY-MM-DD`.
- **Distinguishing terminology:** "Yanked" (for releases pulled due to severe issues; suffix `[YANKED]`).
- **Prefix conventions:** Version headers use `[X.Y.Z]` bracket-and-link convention.
- **Does NOT define vocabulary for:** Work items, status lifecycles, hierarchy.

### IETF RFC Process (RFC 2026)

- **Source:** [RFC 2026](https://datatracker.ietf.org/doc/html/rfc2026); [IETF RFCs page](https://www.ietf.org/process/rfcs/)
- **Document categories (5 statuses):**
  1. Standards Track (further subdivided): Proposed Standard → Draft Standard (no longer used for new) → Internet Standard
  2. Best Current Practice (BCP)
  3. Informational
  4. Experimental
  5. Historic
- **Pre-RFC stage:** "Internet-Draft" (I-D) — working document with 6-month expiration.
- **Lifecycle vocabulary:** Submission → Working Group adoption → IESG review → Last Call → Publication → (potentially) Maturity advancement.
- **Identifier convention:** `RFC-NNNN` (sequentially numbered; never reused; once published, immutable). BCPs and STDs have their own parallel numbering (`BCP-NN`, `STD-NN`) that points to one or more RFCs.
- **Distinguishing terminology:** "Rough consensus and running code", "humming" (informal vote), "Last Call", "IESG" (Internet Engineering Steering Group), "IAB" (Internet Architecture Board), "obsoletes" / "updates" / "obsoleted-by" / "updated-by" (RFC-to-RFC relationships).
- **Does NOT define vocabulary for:** Project tasks, sprint cadences, decision-record templates beyond RFC itself.

### Python PEP Process (PEP 1)

- **Source:** [PEP 1 — PEP Purpose and Guidelines](https://peps.python.org/pep-0001/); [PEP 0 index](https://peps.python.org/)
- **PEP types (3):** Standards Track, Informational, Process.
- **Status states:** Draft, Deferred, Accepted (Standards Track) / Active (Informational, Process), Provisional, Final, Rejected, Superseded, Withdrawn.
- **Identifier convention:** `PEP-NNN`; numbers below 100 are meta-PEPs (any meta-PEP is also a Process PEP); numbers below 1000 are reserved for community process.
- **Roles:** PEP Author / Sponsor / BDFL-Delegate (now Steering Council Delegate), Steering Council, Discussions-To venue.
- **Distinguishing terminology:** "BDFL-Delegate" (historical term for empowered decision-maker for a PEP), "Provisional" status (accepted but with caveat that user feedback may force changes), "Resolution".
- **Does NOT define vocabulary for:** Repository task tracking, software work units, sprint mechanics.

### Rust RFC Process

- **Source:** [Rust RFC Book](https://rust-lang.github.io/rfcs/); [github.com/rust-lang/rfcs](https://github.com/rust-lang/rfcs); [RFC Merge Procedure](https://forge.rust-lang.org/lang/rfc-merge-procedure.html)
- **Status / process states:** Open PR → Final Comment Period (FCP, 10 days) with disposition (merge / close / postpone) → Merged (becomes "active") OR Closed.
- **Identifier convention:** `NNNN-feature-name.md` under `text/`; assigned by PR number.
- **Distinguishing terminology:** "Final Comment Period (FCP)" with explicit "disposition: merge|close|postpone", "active RFC" (accepted, not yet implemented), "stabilization" (separate later step from RFC acceptance), "tracking issue" (links acceptance to implementation).
- **Roles:** Sub-team (Lang / Libs / Compiler / Cargo / etc.), shepherds.
- **Does NOT define vocabulary for:** Per-task tracking inside an active RFC implementation (tracking issues delegate that to GitHub Issues).

### Anthropic RFCs (publicly published)

- **Source attempted:** WebSearch on "Anthropic RFCs proposal process". No public RFC repository or process documentation was located on the org page [github.com/anthropics](https://github.com/anthropics) at the time of survey. Several third-party "RFC" repositories named in search were unrelated to Anthropic.
- **Status:** No publicly enumerated Anthropic-specific RFC vocabulary; this row is intentionally empty.

---

## Part 4 — Issue Trackers and Commercial PM Products

### GitHub Issues + Projects

- **Source:** [GitHub Docs: About Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects); [About milestones](https://docs.github.com/en/issues/using-labels-and-milestones-to-track-work/about-milestones); [Quickstart for Issues](https://docs.github.com/en/issues/tracking-your-work-with-issues/learning-about-issues/quickstart)
- **Hierarchy of work units:**
  1. Organization
  2. Repository
  3. Project (cross-repo possible; built on Issues + Pull Requests)
  4. Milestone (date-based grouping within a repo)
  5. Issue (or Pull Request, or Draft Issue inside a Project)
  6. Sub-issue (introduced 2024 — parent/child Issue relationship)
  7. Task list item (checkbox in Issue body)
- **Built-in metadata fields on Issues:** Assignees, Labels, Projects (membership), Milestone, Linked pull requests, Issue type (recently added: Feature / Bug / Task etc., still rolling out), Status (within a Project view).
- **Project custom fields:** Single-select, Number, Date, Iteration, Text.
- **Lifecycle vocabulary:** Open / Closed (with `closed_as: completed | not_planned | duplicate` reason — added later).
- **Identifier conventions:** `#NNN` per repository (auto-incremented; PR and Issue share number-space). Cross-repo: `org/repo#NNN`.
- **Distinguishing terminology:** "Saved view", "Group by", "Iteration field", "Roadmap view", "Insights".
- **Does NOT define vocabulary for:** Sprint ceremonies, formal estimation units (story points are a Project custom field convention, not built-in), decision records.

### Jira (Atlassian)

- **Source:** [Atlassian Issue hierarchy](https://www.atlassian.com/agile/project-management/epics-stories-themes); [Atlassian Support: Issue types](https://support.atlassian.com/jira-cloud-administration/docs/what-are-issue-types/); [Configuring initiatives in Advanced Roadmaps](https://confluence.atlassian.com/advancedroadmapsserver0329/configuring-initiatives-and-other-hierarchy-levels-1021218664.html)
- **Default hierarchy of work items:**
  1. Initiative (Premium/Advanced Roadmaps; not standard)
  2. Epic
  3. Story / Task / Bug / Improvement / New Feature (peers, "Standard" issue type level)
  4. Sub-task
- **Custom hierarchy:** Premium plans support custom levels above Epic (e.g., Theme, Initiative).
- **Lifecycle vocabulary (default Software workflow):** To Do → In Progress → Done (configurable per project; "workflow scheme").
- **Built-in fields:** Summary, Description, Reporter, Assignee, Priority (Highest/High/Medium/Low/Lowest), Resolution (Done / Won't Do / Duplicate / etc.), Labels, Components, Fix Versions, Affects Versions, Sprint, Story Points, Epic Link.
- **Identifier convention:** `PROJECTKEY-NNN` (e.g., `JRA-123`); the prefix is the Project Key (configurable, typically uppercase letters); auto-incremented per project.
- **Distinguishing terminology:** "Issue type", "workflow scheme", "screen scheme", "permission scheme", "issue link types" (blocks/is blocked by, clones/is cloned by, duplicates/is duplicated by, relates to, causes/is caused by), "Quickfilters", "JQL" (Jira Query Language), "epic color".
- **Does NOT define vocabulary natively for:** Story-as-parent-of-Tasks (Tasks and Stories are peers; sub-tasks are below both — well-documented limitation per Atlassian community).

### Linear

- **Source:** [Linear Concepts](https://linear.app/docs/conceptual-model); [Linear Issue status](https://linear.app/docs/configuring-workflows); [Linear Priority](https://linear.app/docs/priority); [Parent and sub-issues](https://linear.app/docs/parent-and-sub-issues); [Issue relations](https://linear.app/docs/issue-relations)
- **Hierarchy of work units:**
  1. Workspace
  2. Team
  3. Project (units of work with clear outcome / planned completion date; can span teams)
  4. Cycle (Linear's term for sprint; automated repeating time period)
  5. Issue (parent)
  6. Sub-issue
- **Default issue status workflow (5):** Backlog → Todo → In Progress → Done → Canceled. Each status belongs to a "type" (backlog, unstarted, started, completed, canceled).
- **Priority enum (5):** No priority, Urgent, High, Medium, Low. Same scale used for projects.
- **Issue properties:** Title (required), Status (required), priority, estimate, label, due date, assignee, parent, project, cycle.
- **Issue relation types:** Blocking, Blocked by, Related, Duplicate.
- **Identifier convention:** `TEAM-NNN` (team key prefix + auto-incremented number).
- **Distinguishing terminology:** "Triage" (intake state), "Initiatives" (above Projects, recently added), "Roadmap", "Views", "Insights".
- **Does NOT support:** Custom priority scales (deliberately; Linear states this is to "avoid carried-away specificity"); deeply nested sub-issues with status rollup beyond one level (status auto-rollup is opt-in).

### Asana

- **Source:** [Asana Object Hierarchy](https://developers.asana.com/docs/object-hierarchy); [Understanding the Asana hierarchy](https://help.asana.com/s/article/asana-hierarchy)
- **Hierarchy of work units:**
  1. Organization / Workspace
  2. Team
  3. Goal (workspace, team, or individual level; can be nested)
  4. Portfolio (collection of projects or other portfolios — supports nesting)
  5. Project
  6. Section
  7. Task
  8. Subtask (a Task whose parent is another Task — can itself live in a project)
- **Lifecycle vocabulary:** Custom statuses per project (Asana provides default, customizable). Project-level statuses: On track / At risk / Off track / On hold / Complete.
- **Identifier convention:** Numeric task GIDs (no human-friendly prefix); URLs use the GID.
- **Distinguishing terminology:** "Inbox" (Asana-specific notification + actionable feed), "My Tasks" (personal triage area), "Rules" (automation), "Forms" (intake), "Goals" (separate object class with KR-like progress).
- **Does NOT define vocabulary for:** Sprints/cycles natively (third-party templates); decision records.

### Monday.com

- **Source:** [Monday: Understanding structural hierarchy](https://support.monday.com/hc/en-us/articles/7278527605906-Understanding-monday-com-s-structural-hierarchy); [The basics of items](https://support.monday.com/hc/en-us/articles/115005319105-The-basics-of-items); [Multiple levels of subitems](https://support.monday.com/hc/en-us/articles/29810815287570-Multiple-levels-of-subitems-on-monday-com)
- **Hierarchy of work units:**
  1. Account
  2. Workspace
  3. Folder (one level of nesting allowed: Folder → Sub-folder; no sub-sub-folders)
  4. Board
  5. Group (color-coded section within a board)
  6. Item (row)
  7. Sub-item (now supports up to 4 nested levels per recent update)
- **Lifecycle vocabulary:** Status column values are entirely user-defined per board.
- **Distinguishing terminology:** "Column" (typed: Status, Date, People, Numbers, Timeline, Tags, Mirror, Connect Boards, Formula, etc.); "Connect Boards" column (cross-board relations); "Mirror" column (reflects another board's column value).
- **Identifier convention:** Item IDs are numeric / opaque; no human-readable prefix.
- **Does NOT define vocabulary for:** Standard SDLC concepts (epic/story/sprint); decision records.

### ClickUp

- **Source:** [ClickUp Intro to Hierarchy](https://help.clickup.com/hc/en-us/articles/13856392825367-Intro-to-the-Hierarchy); [ClickUp's Project Hierarchy](https://clickup.com/hierarchy-guide)
- **Hierarchy of work units (6 levels):**
  1. Workspace
  2. Space
  3. Folder (cannot contain other Folders; only Lists)
  4. List (only place tasks can live)
  5. Task
  6. Subtask (can be nested into deeper layers)
- **Lifecycle vocabulary:** "Statuses" — fully customizable per Space / Folder / List, grouped into 4 status categories: Not Started, Active, Done, Closed.
- **Distinguishing terminology:** "Custom Field", "Custom Task Type" (rename "Task" to "Bug" / "Story" / etc.), "Goals" + "Targets" (separate OKR-style structure), "Whiteboards", "Docs", "ClickApps" (toggleable features per Space).
- **Identifier convention:** `#NNN` per workspace; can prepend custom Task ID format.
- **Does NOT define vocabulary for:** Decision records, commit semantics.

### Trello (Atlassian)

- **Source:** [Trello 101](https://trello.com/guide/trello-101); [Basic Trello Terminologies](https://toolsofbusiness.com/basic-trello-terminologies/)
- **Hierarchy of work units:**
  1. Workspace
  2. Board
  3. List (column representing a workflow stage)
  4. Card
  5. Checklist (within a Card)
  6. Checklist item
- **Card features:** Members, Labels (color-coded), Due date, Attachments, Cover, Custom Fields (Power-Up).
- **Lifecycle vocabulary:** Implicit — defined by which List a Card sits in (e.g., "To Do", "Doing", "Done").
- **Distinguishing terminology:** "Power-Up" (Trello plugin/extension), "Butler" (built-in automation), "swimlanes" via vertical Lists.
- **Identifier convention:** Short URL slug; numeric internal ID.
- **Does NOT define vocabulary for:** Epic/story/sprint, formal estimation, decision records, hierarchical work breakdown beyond Checklist items.

### Plane (plane.so, OSS)

- **Source:** [Plane Core Concepts](https://docs.plane.so/introduction/core-concepts); [Plane Modules](https://docs.plane.so/core-concepts/modules); [Plane Cycles](https://plane.so/cycles)
- **Hierarchy of work units:**
  1. Workspace
  2. Project
  3. Module (focused grouping — feature, microservice, milestone)
  4. Cycle (time-boxed sprint)
  5. Work Item (formerly "Issue" in earlier docs)
  6. Sub-issue
- **Lifecycle vocabulary:** Backlog, Todo, In Progress, Done, Canceled (default; customizable).
- **Identifier convention:** `<PROJECT_ID>-NNN` (e.g., `PLN-123`).
- **Distinguishing terminology:** "Module" (used differently than SAFe — closer to feature-set / component), "Pages" (markdown docs alongside issues), "Views".
- **Does NOT define vocabulary for:** Decision records as first-class objects, commit semantics.

### OpenProject (OSS)

- **Source:** [OpenProject Work packages](https://www.openproject.org/docs/user-guide/work-packages/); [Work package types](https://www.openproject.org/docs/system-admin-guide/manage-work-packages/work-package-types/); [Project life cycle / phase gates](https://www.openproject.org/blog/openproject-16-1-release/)
- **Hierarchy of work units:**
  1. Project (can contain sub-projects)
  2. Project phase (with phase gates — go/no-go decision points)
  3. Work package (default types: Phase, Milestone, Task, Feature, Bug, Epic, User story — all configurable)
  4. Child work package (recursive parent/child)
- **Lifecycle vocabulary:** "Status" attribute on each work package — default chain: New → In Specification → Specified → Confirmed → To be scheduled → Scheduled → In Progress → Developed → In Testing → Tested → Test failed → Closed → Rejected → On hold (configurable).
- **Identifier convention:** `#NNN` global numeric ID.
- **Distinguishing terminology:** "Phase gate" (decision point between phases — recently added in v16.1), "relations" (follows / precedes / blocks / blocked by / includes / part of / requires / required by / parent / duplicates).
- **Does NOT define vocabulary for:** Decision records as separate object class (uses Wiki / work package types).

### Taiga (OSS)

- **Source:** [Taiga PM Working with Epics](https://taiga.pm/working-with-epics/); [User Stories and Tasks](https://taiga.pm/user-stories-and-tasks/)
- **Hierarchy of work units:**
  1. Project
  2. Epic
  3. User Story
  4. Task
  - Parallel track: Issue (bug / question / enhancement, can be promoted to User Story)
- **Lifecycle vocabulary (default):**
  - User Story status: New, Ready, In progress, Ready for test, Done, Archived.
  - Issue status: New, In progress, Ready for test, Closed, Needs Info, Rejected, Postponed.
- **Identifier convention:** `#NNN` per project, with type prefix in URL paths (`/epic/`, `/us/`, `/task/`, `/issue/`).
- **Distinguishing terminology:** "Backlog" + "Kanban" + "Sprint" views as toggles on same data; "Wiki" first-class.
- **Does NOT define vocabulary for:** Cross-project portfolios, decision records.

### Wekan / Kanboard / Focalboard (OSS Kanban)

- **Source:** [WeKan docs](https://wekan.github.io/); [Boards, Lists, and Swimlanes (Wekan DeepWiki)](https://deepwiki.com/wekan/wekan/2.1-boards-lists-and-swimlanes); [Focalboard via Cloudron Forum](https://forum.cloudron.io/topic/4713/focalboard)
- **Hierarchy of work units (shared across all three):**
  1. Board
  2. Swimlane (horizontal grouping; Wekan-specific term)
  3. List (column / workflow stage)
  4. Card
  5. Checklist + Checklist item
- **Lifecycle vocabulary:** Defined by List membership (Trello-style).
- **Identifier convention:** Opaque IDs.
- **Distinguishing terminology:** "Swimlane" (Wekan, Kanboard); Focalboard adds "View" types (Board / Table / Calendar / Gallery) over the same data.
- **Does NOT define vocabulary for:** Hierarchical work breakdown beyond checklist; epic/story; decision records.

### Notion (databases as PM substrate)

- **Source:** [Notion Database properties](https://www.notion.com/help/database-properties); [Relations & rollups](https://www.notion.com/help/relations-and-rollups)
- **Hierarchy of work units:** No prescribed PM hierarchy. Substrate vocabulary:
  1. Workspace
  2. Teamspace
  3. Page
  4. Database (collection of Pages with shared schema)
  5. Page-as-row (a Page that lives inside a Database)
- **Property types (data-model vocabulary):** Title, Text, Number, Select, Multi-select, Status, Date, Person, Files & media, Checkbox, URL, Email, Phone, Formula, Relation, Rollup, Created time, Created by, Last edited time, Last edited by, ID.
- **Relation vocabulary:** One-way relation, two-way relation (synced), Rollup (aggregates a property from related rows).
- **View types:** Table, Board, Timeline, Calendar, List, Gallery.
- **Lifecycle vocabulary:** Status property type has built-in groups: To-do, In progress, Complete (each containing user-defined options).
- **Identifier convention:** `ID` property type can be added; format is `prefix-NNN` (e.g., `TASK-12`); auto-incremented per database. Default URLs use opaque UUIDs.
- **Distinguishing terminology:** "Inline database" vs "full-page database", "linked view of database", "synced block", "filter / sort / group" composability.
- **Does NOT prescribe:** Any specific PM hierarchy or status taxonomy — the substrate is general-purpose.

### Pivotal Tracker (sunset 2024 but vocabulary endures)

- **Source:** [Tracker terminology](https://www.pivotaltracker.com/help/articles/terminology/); [Adding stories](https://www.pivotaltracker.com/help/articles/adding_stories/); [Story states](https://www.pivotaltracker.com/help/articles/story_states/)
- **Hierarchy of work units:**
  1. Project
  2. Epic (themed grouping of stories)
  3. Iteration (auto-calculated from velocity, not manually planned)
  4. Story (4 types: Feature / Bug / Chore / Release)
  5. Task (checklist within a story)
- **Story types:**
  - **Feature** — user-visible value; gets points (estimable).
  - **Bug** — unintended behavior; no points.
  - **Chore** — necessary, no direct customer value (e.g., "rotate certs"); no points; states are just unscheduled / unstarted / started / accepted.
  - **Release** — milestone marker with optional target date; no points; states unscheduled / started / accepted.
- **Lifecycle vocabulary (Feature/Bug):** Unscheduled → Unstarted → Started → Finished → Delivered → Accepted (or Rejected → back to Started).
- **Estimation:** Story points only on Features; Tracker auto-derives velocity.
- **Identifier convention:** `#NNNNNNNN` (8-digit numeric story ID, project-scoped).
- **Distinguishing terminology:** "Icebox" (unscheduled tray), "Current" (in-progress iteration), "Backlog" (auto-planned future iterations from velocity).
- **Does NOT define vocabulary for:** Above-project portfolio, decision records.

---

## Part 5 — Anthropic / Claude Ecosystem (publicly published only)

### Anthropic Skills (SKILL.md format) — Agent Skills standard

- **Source:** [Anthropic Skills repo](https://github.com/anthropics/skills); [SKILL.md Format Specification (DeepWiki)](https://deepwiki.com/anthropics/skills/2.2-skill.md-format-specification); [Claude Code Skills docs](https://code.claude.com/docs/en/skills); [Anthropic engineering blog: Equipping agents with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
- **Hierarchy of work units (skill substrate):**
  1. Skill (a folder)
  2. SKILL.md (required file with YAML frontmatter + markdown body)
  3. Optional sibling directories: `scripts/`, `references/`, `assets/`
- **Frontmatter fields (YAML):** `name` (must match folder name), `description` (primary trigger mechanism — must include both what + when to use), `allowed-tools` (optional). The Anthropic engineering blog notes descriptions should be "pushy" to combat undertriggering.
- **Distinguishing terminology:** "Progressive disclosure" (skills load only when triggered, then their bundled resources load on demand), "skill triggering", "skill discovery", "Agent Skills open standard" (cross-tool: Claude Code, Codex, Gemini CLI, Cursor, etc.).
- **Built-in Claude Code commands cited:** `/simplify`, `/batch`, `/debug`, `/loop`, `/claude-api`. Source: [Medium guide on Claude Code skills](https://medium.com/@unicodeveloper/10-must-have-skills-for-claude-and-any-coding-agent-in-2026-b5451b013051)
- **Distribution:** `npx skills add <org>/<repo>`; for official Anthropic skills `npx skills add anthropics/claude-code -- skill <name>`.
- **Does NOT define vocabulary for:** Project hierarchy, work item lifecycles, decision records.

### "Superskills" / claude-superskills (ericgandrade/claude-superskills, public repo)

- **Source:** [github.com/ericgandrade/claude-superskills](https://github.com/ericgandrade/claude-superskills); [Versioning guide](https://github.com/ericgandrade/claude-superskills/blob/main/VERSIONING.md)
- **Hierarchy of work units:** Flat skill catalog (55 skills) organized into named *categories*:
  - Content (youtube-summarizer, audio-transcriber, docling-converter)
  - Planning (brainstorming, writing-plans, executing-plans)
  - Product (abx-strategy, ai-native-product, product-strategy)
  - Career (resume-ats-optimizer, interview-prep, salary-negotiation)
  - Research (deep-research, us-program-research)
  - Obsidian (obsidian-markdown, links, frontmatter, automation)
- **Distribution:** Marketplace-style — `/plugin marketplace add ericgandrade/claude-superskills`, then `/plugin install`.
- **Distinguishing terminology:** "Universal AI skills" (cross-platform: claims compatibility with Claude Code, GitHub Copilot, +6 platforms), "no API keys required".
- **Does NOT define vocabulary for:** Project state, decision records, work item hierarchy — these are individual skill prompts, not a substrate.

### "get-shit-done" (gsd-build/get-shit-done, public repo)

- **Source:** [github.com/gsd-build/get-shit-done](https://github.com/gsd-build/get-shit-done); [USER-GUIDE](https://github.com/gsd-build/get-shit-done/blob/main/docs/USER-GUIDE.md); [Plugin Hub listing](https://www.claudepluginhub.com/plugins/glittercowboy-get-shit-done)
- **Hierarchy of work units (per public docs):**
  1. Six namespace meta-skills (top-level routing entry points)
  2. Sub-skills (concrete invocable skills)
- **Vocabulary:** "Meta-prompting", "context engineering", "subagent orchestration", "state management", "context rot" (the quality degradation problem GSD addresses), "spec-driven development".
- **Slash-command convention:** `/gsd:command-name` (colon namespace) on Claude Code; alternative hyphen form `/gsd-command-name` for cross-tool compatibility (Copilot, OpenCode, Kilo, Cursor, Windsurf, Augment, Antigravity, Trae).
- **Multi-runtime distribution:** `npx get-shit-done-cc` for OpenCode / Gemini CLI / Kilo / Codex.
- **Distinguishing terminology:** "TÂCHES" (the publisher; means "tasks" in French), "namespace meta-skills" (6 of them) as "first-stage entry points for hierarchical routing".
- **Does NOT define publicly:** A standardized work-item hierarchy or block-substrate vocabulary; the framework's full internals are command/skill prompts.

### Other High-Star Claude Code Skills Repos

- **Source:** [github.com/travisvn/awesome-claude-skills](https://github.com/travisvn/awesome-claude-skills); [github.com/ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills); [github.com/VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills); [github.com/obra/superpowers](https://github.com/obra/superpowers); [github.com/alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills)
- **Hierarchy:** All follow the SKILL.md folder convention; "awesome-list" repos are flat curated catalogs categorized by domain (engineering / marketing / product / compliance / etc.). VoltAgent claims 1000+ skills; alirezarezvani claims 232+. obra/superpowers describes itself as "an agentic skills framework & software development methodology".
- **Distinguishing terminology:** "Awesome list" (link-only catalog convention), "skill marketplace", "plugin".

---

## Part 6 — High-Star OSS Workflow / Agentic Frameworks

### Backstage (Spotify, backstage.io)

- **Source:** [Backstage Descriptor Format](https://backstage.io/docs/features/software-catalog/descriptor-format/); [Spotify portal version](https://backstage.spotify.com/docs/portal/core-features-and-plugins/catalog/well-known-relations); [Life of an Entity](https://backstage.spotify.com/docs/portal/core-features-and-plugins/catalog/life-of-an-entity)
- **Hierarchy of catalog entities (well-known kinds):**
  1. Domain
  2. System (collection of resources + components exposing public APIs)
  3. Component (unit of software with deployable/linkable artifact; types include `service`, `website`, `library`, `documentation`)
  4. API (interface boundary)
  5. Resource (physical/virtual infrastructure: DB, queue, etc.)
  6. Plus orthogonal: User, Group, Location, Template
- **Relations vocabulary:** `ownedBy` / `ownerOf`, `partOf` / `hasPart`, `providesApi` / `apiProvidedBy`, `consumesApi` / `apiConsumedBy`, `dependsOn` / `dependencyOf`, `memberOf` / `hasMember`, `parentOf` / `childOf`.
- **Lifecycle field on Component:** `experimental`, `production`, `deprecated` (and user-definable values).
- **Identifier convention:** Entity ref `kind:namespace/name` (e.g., `component:default/my-service`).
- **Distinguishing terminology:** "Software catalog", "entity descriptor" (`catalog-info.yaml`), "owner" (always a User or Group), "TechDocs" (companion docs system), "template" (Scaffolder-as-code).
- **Does NOT define vocabulary for:** Sprint cadences, decision records as catalog entities natively (uses ADR plugin).

### Argo Workflows (argoproj)

- **Source:** [Argo Workflows Core Concepts](https://argo-workflows.readthedocs.io/en/latest/workflow-concepts/); [DAG walkthrough](https://argo-workflows.readthedocs.io/en/latest/walk-through/dag/); [Workflow Templates](https://argo-workflows.readthedocs.io/en/latest/workflow-templates/)
- **Hierarchy of work units:**
  1. WorkflowTemplate (reusable definition)
  2. Workflow (an execution)
  3. Templates (functions, with `entrypoint`)
  4. Steps template (sequential stages, parallel within step) OR DAG template (explicit dependency graph)
  5. Task / step (a node in a DAG or step)
  6. Container / script (the executed unit)
- **Data-passing vocabulary:** Parameters (`{{workflow.parameters.X}}`), Artifacts, Outputs (`{{tasks.step-A.outputs.parameters.X}}`).
- **Lifecycle vocabulary (per pod/task):** Pending, Running, Succeeded, Failed, Error, Skipped, Omitted.
- **Distinguishing terminology:** "Entrypoint", "exit handler", "suspend template", "resource template", "withItems / withParam" (loop expansion), "retryStrategy".
- **Identifier convention:** Workflow names; templates referenced by name within a Workflow.
- **Does NOT define vocabulary for:** Project-management hierarchy beyond execution graphs; decision records.

### Temporal

- **Source:** [Temporal Glossary](https://docs.temporal.io/glossary); [Workflow Execution overview](https://docs.temporal.io/workflow-execution); [Tasks](https://docs.temporal.io/tasks); [Task Queues](https://docs.temporal.io/task-queue)
- **Hierarchy of work units:**
  1. Namespace
  2. Workflow Type (definition)
  3. Workflow Execution (one instance, identified by Workflow ID + Run ID)
  4. Activity (atomic unit of business logic invoked by a Workflow)
  5. Task (Workflow Task / Activity Task / Nexus Task)
- **Communication vocabulary:** Signal (asynchronous message into Workflow), Query (synchronous read), Update (synchronous mutation). "Signal-With-Start" combines signaling and starting in one operation.
- **Lifecycle vocabulary (Workflow Execution):** Running, Completed, Failed, Canceled, Terminated, ContinuedAsNew, TimedOut.
- **Identifier convention:** Workflow ID (user-supplied) + Run ID (server-generated UUID).
- **Distinguishing terminology:** "Worker" (process polling Task Queue), "Task Queue", "Event History" (deterministic log used for replay), "Heartbeat" (Activity progress signal), "Continue-As-New" (chain Workflows to keep history bounded), "Schedule", "Child Workflow".
- **Does NOT define vocabulary for:** PM hierarchy / sprints / decision records.

### Apache Airflow

- **Source:** [Airflow Concepts](https://airflow.apache.org/docs/apache-airflow/1.10.9/concepts.html); [XComs](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/xcoms.html); [TaskFlow](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/taskflow.html)
- **Hierarchy of work units:**
  1. Deployment
  2. DAG (directed acyclic graph; a collection of tasks with dependencies)
  3. DAG Run (one execution of a DAG, characterized by `execution_date` / `logical_date`)
  4. Task (an instantiated Operator becomes a Task — a node)
  5. Task Instance (one execution of a Task at a specific point in time)
  6. Operator / Sensor / Hook (templates: PythonOperator, BashOperator, KubernetesPodOperator, etc.)
- **Lifecycle vocabulary (Task Instance state):** none / scheduled / queued / running / success / failed / up_for_retry / up_for_reschedule / upstream_failed / skipped / removed / deferred.
- **Communication vocabulary:** XCom (Cross-Communication — small key/value passed between Tasks; auto-pushed from Task return values).
- **Identifier convention:** DAG ID (string), Task ID (string), `{dag_id}.{task_id}` for fully-qualified.
- **Distinguishing terminology:** "Pool" (concurrency limit), "Branching" (BranchPythonOperator), "Trigger Rule", "Backfill", "Catchup", "Dataset" (data-aware scheduling), "Sensor" (waits for external state).
- **Does NOT define vocabulary for:** PM-level hierarchy, decision records.

### LangGraph (LangChain)

- **Source:** [LangGraph workflows and agents](https://docs.langchain.com/oss/python/langgraph/workflows-agents); [IBM LangGraph overview](https://www.ibm.com/think/topics/langgraph)
- **Hierarchy of work units:**
  1. Graph (StateGraph)
  2. State (typed shared object flowing through nodes)
  3. Node (function: state → state-update)
  4. Edge (transition between nodes; types: Direct, Conditional)
- **Lifecycle vocabulary:** Implicit (graph traversal); checkpoints persist State.
- **Distinguishing terminology:** "Conditional edge", "interrupt" (human-in-the-loop pause point), "checkpoint", "thread" (a conversation history), "sub-graph", "send" (parallel fan-out).
- **Does NOT define vocabulary for:** PM hierarchy, decision records.

### CrewAI

- **Source:** [CrewAI Agents](https://docs.crewai.com/core-concepts/Agents/); [CrewAI Tasks](https://docs.crewai.com/core-concepts/Tasks/); [CrewAI Processes](https://docs.crewai.com/en/concepts/processes)
- **Hierarchy of work units:**
  1. Crew (collection of Agents + Tasks)
  2. Process (Sequential / Hierarchical / Consensual — orchestration mode)
  3. Agent (role + goal + backstory + tools + LLM)
  4. Task (description + assigned Agent + tools + expected output)
  5. Tool (callable capability)
- **Distinguishing terminology:** "Backstory" (agent persona text), "delegation" (agent-to-agent task handoff in Hierarchical process), "manager_llm" (in Hierarchical process — the orchestrator LLM).
- **Does NOT define vocabulary for:** Long-running PM substrate, decision records, status lifecycles.

### AutoGen / Microsoft Agent Framework

- **Source:** [AutoGen on GitHub](https://github.com/microsoft/autogen); [Multi-agent Conversation Framework](https://microsoft.github.io/autogen/0.2/docs/Use-Cases/agent_chat/); [AutoGen → Microsoft Agent Framework migration](https://learn.microsoft.com/en-us/agent-framework/migration-guide/from-autogen/)
- **Hierarchy of work units:**
  1. Application
  2. Team / GroupChat (multiple Agents)
  3. Agent (ConversableAgent; specialized: AssistantAgent, UserProxyAgent)
  4. Conversation / Message exchange
  5. Task (whatever the conversation is solving)
- **Distinguishing terminology:** "Conversable agent", "group chat manager", "Magentic-One" (Microsoft's multi-agent team for file/web tasks).
- **Status:** AutoGen is "in maintenance mode"; Microsoft Agent Framework is the current evolution.
- **Does NOT define vocabulary for:** Long-running PM substrate.

### GitHub Spec Kit (spec-driven development)

- **Source:** [github.com/github/spec-kit](https://github.com/github/spec-kit); [Spec Kit quickstart](https://github.github.com/spec-kit/quickstart.html); [Slash Commands Reference](https://deepwiki.com/github/spec-kit/5-slash-commands-reference); [Microsoft Developer blog](https://developer.microsoft.com/blog/spec-driven-development-spec-kit)
- **Hierarchy of work units:**
  1. Constitution (`constitution.md` — non-negotiable project principles)
  2. Spec (the "what and why" — produced by `/speckit.specify`)
  3. Plan (technical design — produced by `/speckit.plan`)
  4. Tasks (actionable list — produced by `/speckit.tasks`)
- **Slash command sequence:** `/speckit.constitution` → `/speckit.specify` → `/speckit.plan` → `/speckit.tasks`. Slash commands are installed into the project's agent folder (`.claude/`, `.github/prompts/`, `.pi/prompts/`, etc.) by `specify init`.
- **Distinguishing terminology:** "Constitution" (project-level principles document), "spec-driven development" (specs become *executable* — generate working implementations rather than just guide them).
- **Does NOT define vocabulary for:** Status lifecycles, work item types, decision records as separate kind.

---

## Part 7 — Cross-Cutting Concept Vocabularies (Standalone)

### RACI / RASCI / DACI / RAPID — Responsibility Assignment Matrices

- **Source:** [Wikipedia Responsibility Assignment Matrix](https://en.wikipedia.org/wiki/Responsibility_assignment_matrix); [RACI guide (project-management.com)](https://project-management.com/understanding-responsibility-assignment-matrix-raci-matrix/); [Cornell IT RACI/RASCI definitions](https://it.cornell.edu/it-service-management/raci-and-rasci-definitions)
- **RACI roles:** Responsible (does the work), Accountable (signs off; one per task), Consulted (two-way input), Informed (one-way notice).
- **Variants:** RASCI (adds Supportive), DACI (Driver/Approver/Contributors/Informed — Bain), RAPID (Recommend/Agree/Perform/Input/Decide — Bain), CARS (Communicate/Approve/Responsible/Support).
- **Distinguishing rule:** Per most theories, only one Accountable per row.
- **Does NOT define vocabulary for:** Work item hierarchy, lifecycles.

### OKR — Objectives and Key Results

- **Source:** [What Matters: What is an OKR](https://www.whatmatters.com/faqs/okr-meaning-definition-example); [Wikipedia OKR](https://en.wikipedia.org/wiki/Objectives_and_key_results)
- **Hierarchy of work units:**
  1. Objective (qualitative, ambitious, time-bound)
  2. Key Result (2–5 per Objective; quantitative, verifiable)
  3. Initiative (the work / project that aims to move a Key Result)
- **OKR types (3):** Committed (must achieve), Aspirational / Stretch (push beyond comfort), Learning (experimental, focused on insight).
- **Distinguishing terminology:** "KPI" (steady-state metric, distinct from KR), "scoring" (typically 0.0–1.0 or 0–10), "moonshot" / "roofshot".
- **Does NOT define vocabulary for:** Status lifecycles for KRs (varies by tool), work item types.

---

## Part 8 — Cross-Source Synthesis

### Convergent Terms (recurring across 5+ sources)

| Term | Sources |
|------|---------|
| **Task** | PMBOK, PRINCE2, Asana, ClickUp, Trello (checklist), Plane, OpenProject, Taiga, Pivotal Tracker (sub-Task), GitHub (task list), Linear, CrewAI, Airflow, Temporal, Argo, Spec Kit |
| **Project** | PMBOK, PRINCE2, ISO 21500, GTD, Asana, ClickUp, Linear, Plane, OpenProject, Taiga, Pivotal Tracker, Trello (board≈project), Notion (workspace ≈ project), Backstage |
| **Epic** | Scrum (companion), SAFe, Jira, GitHub (label), Linear (informal), Plane, OpenProject, Taiga, Pivotal Tracker, LeSS |
| **Story / User Story** | XP/Scrum companion, SAFe, Jira, LeSS, Pivotal Tracker, Taiga, OpenProject, Aha! |
| **Backlog** | Scrum (Product / Sprint), SAFe (Portfolio / Program / Team), LeSS (Product / Area), Linear (status), Plane (status), OpenProject (informal), Pivotal (Backlog), Trello (list label) |
| **Sprint / Iteration / Cycle** | Scrum (Sprint), SAFe (Iteration), Linear (Cycle), Plane (Cycle), Pivotal (Iteration), Airflow (DAG run), Temporal (run), Shape Up (Cycle, but 6w not 2w), GitHub Projects (Iteration field) |
| **Status / State** | Linear, Plane, Jira, OpenProject, GitHub, Notion, Trello (implicit via List), Airflow (Task Instance state), Temporal (Workflow state), ADR, PEP, RFC |
| **Milestone** | GitHub Issues, OpenProject (Milestone work-package type), Pivotal Tracker (Release ≈ milestone), Asana (informal), PRINCE2 (stage gate ≈ milestone) |
| **Workflow** | Airflow, Temporal, Argo, GitHub Actions, ITIL (Service Value Chain), Linear (issue workflow) |
| **Owner / Assignee** | All issue trackers; Backstage (`owner` field); RACI ("R"); ITIL (process owner) |
| **Label / Tag** | GitHub, Trello, Linear, Asana, Notion (Multi-select), GTD (`@context`) |
| **Dependency / Blocked-by** | Linear (issue relations), Jira (issue links), GitHub (linked issues), OpenProject (relations), Airflow (DAG edges), Argo (DAG dependencies), Temporal (Child Workflow / signals) |

### Divergent Terms (same concept, wildly different names across sources)

| Concept | Names by source |
|---------|-----------------|
| **Time-boxed iteration** | Sprint (Scrum), Iteration (SAFe, Pivotal), Cycle (Linear, Plane, Shape Up — but 6 weeks!), Program Increment / PI (SAFe — but 8–12 weeks), DAG Run (Airflow), Workflow Execution (Temporal) |
| **Highest-level ambition** | Strategic Theme (SAFe), Portfolio Epic (SAFe), Initiative (Jira, OKR), Goal (Asana, OKR), Objective (OKR), Project (GTD — but means *anything multi-step*), Vision (DAD), Mission (informal), Constitution (Spec Kit), Horizon 5 / Life Purpose (GTD), Domain (Backstage, DDD), Strategic Theme (SAFe) |
| **Smallest unit of work** | Activity (PMBOK), Sub-task (Jira, Asana, Monday, ClickUp, Linear), Task (Trello — but means whole story), Next Action (GTD), Checklist item (Trello, GitHub task list), Step (Argo), Operator/Task Instance (Airflow), Activity (Temporal — but means callable function!) |
| **Decision record** | ADR / MADR (Nygard), RFC (IETF, Rust), PEP (Python), Pitch (Shape Up — but pre-decision), Spec (Spec Kit), Constitution (Spec Kit — for principles) |
| **Stable identity vs. display label** | GitHub (numeric ID + title), Jira (PROJECTKEY-NNN + summary), Linear (TEAM-NNN + title), Asana (numeric GID + name; no human-friendly id), Monday (opaque ID + name), Notion (UUID + Title property; optional ID property), Plane (PLN-NNN + title), Pivotal (8-digit numeric + title), OpenProject (#NNN + subject), ADR (NNNN-slug + title), PEP (PEP-NNN + title), RFC (RFC NNNN + title), Backstage (`kind:namespace/name` ref + display name) |
| **"Phase" of project** | Phase (PMBOK, PRINCE2 stage, OpenProject, DAD), Stage (PRINCE2), Inception/Construction/Transition (DAD), Shaping/Betting/Building (Shape Up), Plan/Build/Operate (informal) |
| **Things you can't actually deliver to a user** | Chore (Pivotal), Enabler (SAFe), Spike (SAFe — exploration enabler; XP origin), Technical Story (LeSS), Refactoring (most), Investigation (informal) |

### Unique-to-One-Source Terms

| Term | Source |
|------|--------|
| Architectural Runway | SAFe |
| Hill chart / Appetite / Circuit breaker | Shape Up |
| Ubiquitous Language / Bounded Context / Aggregate Root | DDD |
| Class of Service / STATIK | Kanban |
| Process Goal / Way of Working (WoW) | DA |
| Tolerance / Highlight Report / Exception Report / Product Description | PRINCE2 |
| Performance Domain / Stewardship | PMBOK 7 |
| Service Value Chain / Four Dimensions | ITIL 4 |
| BREAKING CHANGE | Conventional Commits |
| Yanked | Keep a Changelog |
| Continue-As-New / Heartbeat / Run ID | Temporal |
| XCom | Airflow |
| Final Comment Period (FCP) / disposition | Rust RFC |
| Provisional / BDFL-Delegate | PEP |
| TechDocs / Scaffolder / catalog-info.yaml | Backstage |
| Hot Spot (red sticky) / Pivotal Event | Event Storming |
| Backstory / Manager LLM | CrewAI |
| Constitution (project principles file) | Spec Kit |
| Context (`@home`, `@calls`) | GTD |
| Power-Up / Butler | Trello |
| Mirror column / Connect Boards column | Monday |
| Rollup property | Notion |
| Anti-Corruption Layer (ACL) | DDD |
| Triage (as a status) | Linear |

### Identity-vs-Display-Label Split Observation

Sources that explicitly separate stable identity from human-readable display:

| Source | Stable identity | Display label |
|--------|-----------------|---------------|
| GitHub | `#NNN` (per-repo, also URL slug) | Issue title |
| Jira | `PROJECTKEY-NNN` | Summary |
| Linear | `TEAM-NNN` | Title |
| Plane | `PROJ-NNN` | Title |
| Pivotal Tracker | `#NNNNNNNN` (numeric only) | Title |
| OpenProject | `#NNN` | Subject |
| ADR | `NNNN-slug-with-dashes.md` (slug is part of id) | Title (often = slug words) |
| PEP | `PEP-NNN` | Title |
| RFC | `RFC NNNN` | Title; also category-specific aliases (`BCP-NN`, `STD-NN`) |
| Backstage | `kind:namespace/name` (entity ref) | `metadata.title` (optional, falls back to name) |
| Notion | UUID (URL); optional `ID` property type adds human-friendly `prefix-NNN` | Title property (one designated property) |
| Asana, Monday, Trello, ClickUp | Opaque numeric / GID | Name (no auto-generated human prefix) |

Sources that do NOT separate identity from display: Trello (uses URL slug derived from card name), Wekan / Kanboard / Focalboard (opaque IDs only), most Notion default usage.

### Lifecycle / Status Vocabulary Table — Normalized

Mapping every encountered status enum into shared buckets where possible. Bucket categories drawn from ClickUp's 4-category status grouping (Not Started / Active / Done / Closed) extended with intake and abandonment.

| Source | Intake | Not Started | Active | Review/Verify | Done | Abandoned |
|--------|--------|-------------|--------|---------------|------|-----------|
| Scrum (no formal lifecycle) | — | (Product Backlog item) | (Sprint Backlog selected) | — | (Increment, "Done" per DoD) | — |
| Linear | Triage | Backlog, Todo | In Progress | — | Done | Canceled |
| Plane | — | Backlog, Todo | In Progress | — | Done | Canceled |
| Jira (default Software) | — | To Do | In Progress | — | Done | (Resolution: Won't Do / Duplicate) |
| OpenProject (default) | New | In Specification, Specified, Confirmed, To be scheduled, Scheduled | In Progress, Developed | In Testing, Tested | Closed | Test failed, Rejected, On hold |
| GitHub Issues | (Open, no triage state) | Open + label "todo" | Open + label "in progress" | — | Closed (`completed`) | Closed (`not_planned` / `duplicate`) |
| Pivotal (Feature/Bug) | Unscheduled | Unstarted | Started | Finished, Delivered | Accepted | Rejected (back to Started) |
| Pivotal (Chore) | Unscheduled | Unstarted | Started | — | Accepted | — |
| Pivotal (Release) | Unscheduled | Started | — | — | Accepted | — |
| Trello / Wekan / Focalboard | (List "Inbox") | (List "To Do") | (List "Doing") | (List "Review") | (List "Done") | (List "Archive" or card archive) |
| ClickUp | (group: Not Started) | Not Started group | Active group | Active group | Done group | Closed group |
| Airflow Task Instance | none, scheduled, queued | scheduled, queued | running, deferred, up_for_reschedule | up_for_retry | success | failed, upstream_failed, skipped, removed |
| Temporal Workflow | — | Running (initial) | Running | — | Completed | Failed, Canceled, Terminated, TimedOut |
| ADR | — | Proposed | (in review) | — | Accepted | Rejected, Deprecated, Superseded |
| PEP | Draft | Deferred | Active (Inf./Process), Provisional (Std.) | — | Accepted, Final | Rejected, Withdrawn, Superseded |
| RFC (Standards Track) | Internet-Draft | Proposed Standard | Draft Standard (deprecated stage) | — | Internet Standard | Historic |
| ITIL Incident | New | Assigned | In Progress | Pending / Investigation | Resolved | Closed (after verification) |
| Asana project status | — | On track | At risk, Off track | — | Complete | On hold |
| Backstage Component lifecycle | — | experimental | production | — | — | deprecated |

Common bucket terms by frequency: "In Progress" / "Active" / "Started" / "Running" all denote the *Active* bucket; "Done" / "Completed" / "Closed" / "Resolved" / "Accepted" / "Final" all denote the *Done* bucket; "Canceled" / "Rejected" / "Withdrawn" / "Won't Do" / "not_planned" / "Terminated" / "Historic" / "Deprecated" all denote the *Abandoned* bucket.

### Prefix-Token-Namespace Patterns (cross-kind id collision handling)

| Source | Pattern | Example | Cross-kind disambiguation |
|--------|---------|---------|---------------------------|
| GitHub | `#NNN` per-repo, shared between Issues + PRs | `#42` | None — Issue and PR share number-space; `org/repo#NNN` for cross-repo |
| Jira | `PROJKEY-NNN` per-project, single number-space | `JRA-123` | Project key prefix; all issue types share number-space within a project |
| Linear | `TEAM-NNN` per-team, single number-space | `ENG-42` | Team key prefix |
| Plane | `PROJ-NNN` per-project | `PLN-7` | Project ID prefix |
| Pivotal Tracker | `#NNNNNNNN` global numeric | `#12345678` | None — story ID is global, no prefix |
| OpenProject | `#NNN` global | `#42` | None |
| ADR | `NNNN-slug.md` (filename) | `0042-use-postgres.md` | Slug + sequential number; all ADRs share number-space |
| PEP | `PEP-NNN` global | `PEP 8` | Type encoded by number range (sub-100 = meta) |
| RFC | `RFC NNNN` global | `RFC 2026` | Category aliases overlay (`BCP-26` may map to RFC 2026) |
| Backstage | `kind:namespace/name` | `component:default/auth-service` | Kind is part of the ref; namespace partitions; name is the identifier |
| Notion (with ID property) | `prefix-NNN` per-database | `TASK-12` | Prefix can be per-database; number-space is per-database |
| Conventional Commits | `type(scope):` | `feat(api):` | Type and scope namespace the commit |
| C4 / Backstage | Hierarchical naming | `system.container.component` | Dotted hierarchy |
| GTD | `@context` | `@calls`, `@home` | `@`-prefix marks context tag |
| Slash commands | `/namespace:command` (Spec Kit, GSD) or `/namespace-command` (cross-tool GSD) | `/speckit.specify`, `/gsd:plan` | Namespace token |

Three patterns dominate:
1. **Per-container sequential** with container-key prefix: `KEY-NNN` (Jira, Linear, Plane).
2. **Global sequential, no kind disambiguation**: GitHub `#NNN`, OpenProject `#NNN`, RFC.
3. **Kind-namespaced refs**: Backstage `kind:namespace/name`, Conventional Commits `type(scope):`.

ADR / PEP / RFC use sequential global numbering with the *kind* baked into the prefix word itself (`ADR`, `PEP`, `RFC`) rather than a separate field.

---

## Sources

All URLs cited inline above are the authoritative external references for each per-source entry. Selected anchor URLs:

- PMI / PMBOK: [pmi.org/standards/pmbok](https://www.pmi.org/standards/pmbok)
- PRINCE2: [prince2.com](https://www.prince2.com/usa)
- ITIL 4: [itsm.tools/itil-4-explained](https://itsm.tools/itil-4-explained/)
- ISO 21500/21502: [iso.org/standard/74947.html](https://www.iso.org/standard/74947.html)
- Scrum Guide: [scrumguides.org/scrum-guide.html](https://scrumguides.org/scrum-guide.html)
- SAFe: [framework.scaledagile.com](https://framework.scaledagile.com/)
- Disciplined Agile: [pmi.org/disciplined-agile/glossary](https://www.pmi.org/disciplined-agile/glossary)
- Kanban Method: [kanban.university/kanban-guide](https://kanban.university/kanban-guide/)
- Shape Up: [basecamp.com/shapeup](https://basecamp.com/shapeup)
- LeSS: [less.works/less/framework](https://less.works/less/framework)
- GTD: [gettingthingsdone.com](https://gettingthingsdone.com/)
- ADR: [adr.github.io](https://adr.github.io/)
- C4: [c4model.com](https://c4model.com/)
- DDD: [domainlanguage.com DDD Reference PDF](https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf)
- Event Storming: [en.wikipedia.org/wiki/Event_storming](https://en.wikipedia.org/wiki/Event_storming)
- SemVer: [semver.org](https://semver.org/)
- Conventional Commits: [conventionalcommits.org/en/v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)
- Keep a Changelog: [keepachangelog.com/en/1.1.0](https://keepachangelog.com/en/1.1.0/)
- IETF RFC 2026: [datatracker.ietf.org/doc/html/rfc2026](https://datatracker.ietf.org/doc/html/rfc2026)
- PEP 1: [peps.python.org/pep-0001](https://peps.python.org/pep-0001/)
- Rust RFCs: [rust-lang.github.io/rfcs](https://rust-lang.github.io/rfcs/)
- GitHub Issues+Projects: [docs.github.com/en/issues](https://docs.github.com/en/issues)
- Jira: [atlassian.com/agile/project-management/epics-stories-themes](https://www.atlassian.com/agile/project-management/epics-stories-themes)
- Linear: [linear.app/docs/conceptual-model](https://linear.app/docs/conceptual-model)
- Asana: [developers.asana.com/docs/object-hierarchy](https://developers.asana.com/docs/object-hierarchy)
- Monday: [support.monday.com structural hierarchy](https://support.monday.com/hc/en-us/articles/7278527605906-Understanding-monday-com-s-structural-hierarchy)
- ClickUp: [help.clickup.com hierarchy intro](https://help.clickup.com/hc/en-us/articles/13856392825367-Intro-to-the-Hierarchy)
- Trello: [trello.com/guide/trello-101](https://trello.com/guide/trello-101)
- Plane: [docs.plane.so/introduction/core-concepts](https://docs.plane.so/introduction/core-concepts)
- OpenProject: [openproject.org/docs/user-guide/work-packages](https://www.openproject.org/docs/user-guide/work-packages/)
- Taiga: [taiga.pm/working-with-epics](https://taiga.pm/working-with-epics/)
- Wekan: [wekan.github.io](https://wekan.github.io/)
- Notion: [notion.com/help/database-properties](https://www.notion.com/help/database-properties)
- Pivotal Tracker: [pivotaltracker.com/help/articles/terminology](https://www.pivotaltracker.com/help/articles/terminology/)
- Anthropic Skills: [github.com/anthropics/skills](https://github.com/anthropics/skills)
- claude-superskills: [github.com/ericgandrade/claude-superskills](https://github.com/ericgandrade/claude-superskills)
- get-shit-done: [github.com/gsd-build/get-shit-done](https://github.com/gsd-build/get-shit-done)
- Backstage: [backstage.io/docs/features/software-catalog/descriptor-format](https://backstage.io/docs/features/software-catalog/descriptor-format/)
- Argo Workflows: [argo-workflows.readthedocs.io](https://argo-workflows.readthedocs.io/en/latest/workflow-concepts/)
- Temporal: [docs.temporal.io/glossary](https://docs.temporal.io/glossary)
- Apache Airflow: [airflow.apache.org concepts](https://airflow.apache.org/docs/apache-airflow/1.10.9/concepts.html)
- LangGraph: [docs.langchain.com/oss/python/langgraph](https://docs.langchain.com/oss/python/langgraph/workflows-agents)
- CrewAI: [docs.crewai.com](https://docs.crewai.com/)
- AutoGen: [github.com/microsoft/autogen](https://github.com/microsoft/autogen)
- Spec Kit: [github.com/github/spec-kit](https://github.com/github/spec-kit)
- RACI / OKR: [Wikipedia RAM](https://en.wikipedia.org/wiki/Responsibility_assignment_matrix), [whatmatters.com OKR](https://www.whatmatters.com/faqs/okr-meaning-definition-example)
