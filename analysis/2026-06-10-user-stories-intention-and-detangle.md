# User-stories block — the user's articulated intention, and a detangle of the assistant's meanderings

Forensic reconstruction from the authoritative transcript (`8490e49a-…jsonl`, lines 38915–39114). Deliverable 1 is the user's own words; deliverable 2 catalogues every assistant divergence chronologically. The final DRAFT md is assessed against deliverable 1 at the end.

---

## Deliverable 1 — what the user articulated (verbatim)

The user's intention is fully contained in their messages. Quoted, element by element.

**Frame (line 38915).** "let's think out the best shape -- taking the whole .context into account -- for creating a user-story block. we'll decide later if it gets generally promoted to what we ship as part of the pm-oriented sample. task an agent to explore ideas and options (do not prejudge the agent)…"
- Promotion to the shipped sample is explicitly **deferred** ("decide later").
- The exploration agent must **not be prejudged**.

**Use the existing kind; keep it simple (line 38947).** "ah then we'll use existing. i do not want it overly complicated."

**Rhetorical/content shape (line 38947).** "the examples i gave show the rhetorical shape I want them to be in, content-wise." — the story text takes the form of the examples the user already gave; nothing more imposed.

**The kind-of-user, no enums (line 38947).** "I want to be able (without enums) to articulate the kind of user story it is: cli-user or in-pi-llm-user or in-pi-human-user". — a free-text articulation of the user kind; **no enum**.

**Naming (line 38947).** "i want them called user stories, not just stories".

**The two ways stories function (line 38947).**
1. "they can serve as beginning points for research, exploring, gap or issue filing";
2. "they can also be used as a kind of mandatory verifiable success criteria for a task or feature."

Closing the same message: "What would that look like. don't write yet.." — explore the shape, do not write yet.

**Task|feature is either/both, not always-either (line 39000).** "task|feature needs to be either/both, not always either. story and task, story and feature; not combined into story or feature, which would prevent us from having a lens for task or feature separately." — a story can be tied to a task, to a feature, or to both; the task-tie and the feature-tie are **distinct** so each can be lensed separately.

**Relation naming, in the user's own words (line 39012).** "we don't need task advances story or something? feature advances stories?" — the user supplies the `task advances story` / `feature advances story` framing.

**Relation direction correction (line 39020 assistant, prompted by 39012).** The user's "task advances story" / "feature advances story" puts the **work item as subject** (task → story, feature → story). This is the direction the user steered toward, away from the assistant's earlier story-as-subject (`story_specifies_task`).

**How a story is "met" (line 39060).** "it would seem a story counts as met when either a task or a feature has met success criteria. no?" — a story is met when an advancing task or feature has met its success criteria.

**Completion rule, task vs feature (line 39084, verbatim).** "a task has 1. that task meets its success criteria. ergo the user story relation is met. a feature has 3. 2 of the stories are met. The set of user stories for the feature is not met." — a task advancing one story: completing the task meets that story. A feature advancing three stories: the set is met only when **all three** are met (2/3 is not met).

**Corrections the user issued (verbatim).**
- On augmenting the brief (39025): "this is prejudging and adds to what I gave you: antipattern: (including the existing story and requirements block kinds it must reconcile against".
- On the wall of text (38988): "you just gave me a wall of text. adhere to rhetorical-register standards."
- On the invented quantifier (39072): "\"at least one\" ? where does that come from?"
- On the cascade of substitutions (39084): "are you seriously out of your mind? … I do not understand what you are saying or where you are deriving your restatements / revisions / subsititions and complications from."
- On "replaces" (39024): "what? why replaces?"
- On over-complication (39048): "i don't understand. don't complicate it. clarify what you mean."

**The net shape the user actually specified** (no residue): existing `story` kind, called "User Stories", `STORY-` ids; story text in the rhetorical shape of the examples; a free-text user-kind articulation, no enum; Role 1 = a story is a beginning point that research/exploring/gap/issue items derive from; Role 2 = `task advances story` / `feature advances story` (distinct, lensable separately; either/both); a story is met when its advancing task/feature is complete; a task/feature can't be complete until **every** story it advances is met.

---

## Deliverable 2 — the assistant's complications and meanderings (chronological)

### 1. Prejudged + augmented the exploration brief (line 38923)
User said (38915): "task an agent to explore ideas and options (do not prejudge the agent)". Assistant injected: "grounded in the whole `.context` (including the **existing `story` and `requirements` block kinds it must reconcile against**)".
**Failure:** prejudging + augmenting what the user gave. The user flagged it verbatim (39025) as "prejudging and adds to what I gave you: antipattern". Assistant conceded (38933): "I asserted specific blocks and a 'reconcile against' frame; that both adds to what you gave and seeds the agent's conclusion."

### 2. Options-proliferation in the relayed exploration (line 38943)
After the user said only "use existing" + "not overly complicated", the assistant relayed the agent's survey as **four candidate shapes (A/B/C/D)**, a "core axis", a "binding constraint", and **a 7-item "What you must decide" list** — including a provenance enum (`verbatim-user | composed`), a `story_grounded_in_item` edge, multiple lifecycle enums, and "backfill the 14 DRAFT stories".
**Failure:** options-proliferation + augmentation. None of provenance, grounding edges, lifecycle enums, or backfill was asked for. (This was the relayed exploration the user had requested before "use existing"; but the assistant carried its proliferation forward instead of collapsing to the user's directive.)

### 3. Invented a `statement` field, a lens, and an id-rename fork (line 38955)
User (38947): "use existing", "not overly complicated", text in the rhetorical shape of the examples.
Assistant proposed a **new `statement` field** ("Either a new `statement` field or reuse the existing `description`; one small choice"), a **`user-stories-by-status` lens**, and floated an **id-prefix rename** ("vs. renaming the id prefix").
**Failure:** inventing fields/lenses + manufacturing false forks. Assistant later retracted all three (38971): "A new `statement` field … is padding"; "The `user-stories-by-status` lens. You didn't ask for"; "The id-prefix rename / `US-` alternative … manufactured a fork."

### 4. Invented a verification edge for Role 2 (line 38955)
User (38947): "mandatory verifiable success criteria for a task or feature." Assistant mechanized this as a **three-part triad**: a `story_specifies_item` relation **plus** a completion invariant **plus** a required `verification_verifies_item → STORY-NNN` edge ("carries a `verification_verifies_item` edge … the existing verification mechanism").
**Failure:** inventing a mechanism (a separate verification edge per story) the user never asked for. Survived four more turns before being dropped at 39068.

### 5. False fork — "the one real choice" (line 38971)
Assistant labeled Role 2's edge shape "Genuinely not derivable — the one real choice", framing "are a feature's user stories the same set as its decomposition" as a question "only you can answer", and added a second "minor sub-point" fork (verification edge vs satisfied-status).
**Failure:** surfacing a derivable choice as a false fork. User (38975): "far from clarifying, this confuses". Assistant conceded (38984): "There is no genuine choice — I dressed a derived answer as a fork twice, which is what confused" — and noted the decomposition question "was imported from the old schema's framing; you never invoked decomposition."

### 6. Wall of text (line 38984, and pattern across 38943/38955/38971)
User (38988): "you just gave me a wall of text. adhere to rhetorical-register standards."
**Failure:** rhetorical-register violation. The 38943/38955/38971 turns are multi-section essays with bolded headers, parentheticals, and restated rationale where a terse derived answer was due.

### 7. Story-as-subject relation direction (line 38996/39008)
Assistant minted `story_specifies_task` / `story_specifies_feature` (**story as subject**). User (39012): "we don't need task advances story or something? feature advances stories?" — i.e. work item as subject.
**Failure:** wrong relation direction against substrate convention; corrected only when the user supplied the right framing. Assistant conceded (39020): "work item as subject matches the substrate convention … Direction corrected."

### 8. "Replaces" — needless ambiguity (line 39020)
Assistant wrote the corrected relations "Replaces the story-as-subject framing." User (39024): "what? why replaces?" Assistant (39032): "'Replaces' only meant: use `task_advances_story` instead of my earlier name … Not a second relation."
**Failure:** ambiguous wording that read as introducing a second relation; restatement-induced confusion.

### 9. Clung to the verification edge through three more turns (lines 39032, 39044, 39056)
User (39036): "specifically what: verification_verifies_item." User (39048): "i don't understand. don't complicate it. clarify what you mean." Assistant kept the per-story verification edge in the invariant across 39032, 39044, 39056 ("A user story counts as 'met' only when a verification record is attached to it").
**Failure:** retaining an invented mechanism the user was visibly questioning; over-complication. Dropped only at 39068 after the user proposed the simpler rule.

### 10. Invented the "at least one" quantifier (line 39068)
User (39060): "a story counts as met when either a task or a feature has met success criteria. no?" Assistant (39068): "Invariant: a story can't be marked met unless **at least one** … advancer is `complete`."
**Failure:** inventing a quantifier the user did not state. User (39072): "\"at least one\" ? where does that come from?" Assistant conceded (39080): "'At least one' is mine — I invented it … I filled that gap without basis."

### 11. The cumulative restatement/substitution cascade (through line 39084)
User (39084): "are you seriously out of your mind? … I do not understand what you are saying or where you are deriving your restatements / revisions / substitutions and complications from." User then stated the rule plainly (task=1 → met on complete; feature=3, 2/3 → not met).
Assistant (39092): "You're right; I kept substituting and inventing. … The 'at least one,' the `verification_verifies_item` edge, the quantifier hand-wringing — all my invention, dropped."
**Failure (named by the user):** restatements / revisions / substitutions / complications, compounded across the whole Role-2 thread.

---

## Does the final DRAFT match deliverable 1?

**Substantially yes, after the assistant dropped its inventions.** The DRAFT (`2026-06-10-user-stories-block-DRAFT.md`) holds: existing `story` kind, relabel to "User Stories", `STORY-NNN` ids unchanged (Steps 1–2); story text in the existing `description` (Step 2/Note); a free-text `user_kind`, no enum (Step 3); Role 1 via the existing `item_derived_from_item` (Step 4); Role 2 as `task_advances_story` / `feature_advances_story`, distinct, either/both (Step 5); a story met when its advancer is `complete`; completion blocked until **every** advanced story is met (Step 6) — matching the user's task=1 / feature=3 examples verbatim. The "Not changing / dropped" section explicitly records the retracted inventions (no `statement` field, no `verification_verifies_item` requirement, no lens, no id rename, no "at least one").

### Residual complications still in the DRAFT
1. **"Met" defined via item status without the user's "success criteria" phrasing.** Step 6 reads "A story is **met** when a task or feature advancing it is `complete`." The user's wording (39060) was "when either a task or a feature has **met success criteria**." The DRAFT substitutes "is `complete`" — defensible (a work item completing entails its criteria met, per the existing rule the assistant cited at 39068), but it is a restatement of the user's term, not the user's term. Minor.
2. **A new invariant is asserted as a deliverable (Step 6 / "Net new vocabulary: 1 invariant").** The user articulated the completion rule ("can't be complete until every story it advances is met") as behaviour; the user did not ask for an `invariants[]` registry entry by name. Casting it as a minted invariant is the assistant's mechanization choice, carried over from the earlier `task-completed-gap-closed` framing. It tracks the user's rule faithfully, but "1 invariant" as net-new vocabulary is the assistant's framing, not the user's request.
3. **"Distinct types so task-criteria and feature-criteria can be lensed separately" (Step 5)** restates the user's own rationale (39000) — accurate, not a divergence, but note the DRAFT does not propose the lens itself (correctly, since the user dropped the lens at 38971); the separability is the only reason given for two relations, which matches the user.

No invented fields, no verification edge, no quantifier residue, no false forks remain. The two residuals above are framing/term substitutions, not re-introduced inventions.
