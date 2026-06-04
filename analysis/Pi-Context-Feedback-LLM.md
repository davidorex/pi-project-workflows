Honest read, no thumb on the scale — here's what it pattern-matches to and where the match breaks.

## What it's *like*

**Git, most of all.** The `oid` / `content_hash` / `content_parent` + `objects/` store is git's content-addressing; the `.pi-context.json` pointer flips like `HEAD`; `context-switch -c` / `--to_previous` is `git switch -c` / `git switch -`; `previous_contextDir` is `@{-1}`. I navigated it largely on git intuition and it transferred. Reinforced by the fact that the "database" *is* the committed tree — every write is a file change I then `git commit`.

**A typed issue tracker (Jira / Linear / GitHub Projects).** `feature → story → task`, status lifecycles, dependency and gating edges, `tasks-by-status` lenses — authoring the phase tree felt exactly like building an epic with stories, sub-tasks, and blockers. The status enums are the genre's standard vocabulary.

**A relational/graph DB with constraints.** JSON-Schema-per-block ≈ table schemas; `relations.json` ≈ a closure table (a known SQL hierarchy pattern); the invariants (`requires-edge`, `status-consistency`) ≈ foreign-key + check constraints + triggers; `context-validate` ≈ a referential-integrity pass; a lens ≈ a materialized view; `find-references` ≈ an edge query. The triples `{parent, child, relation_type}` are subject-predicate-object — the property-graph/RDF model.

**A reflection-generated CLI over a library.** `pi-context-cli` auto-surfacing ops whose `surface` is `"use"` is the kubectl-verbs / click-generated / RPC-method-registry shape; `--cwd`/`--json`/exit-codes are standard ergonomics.

**Declarative infra-as-code, faintly.** `config.json` declaring kinds/relations/invariants, the `init → accept-all → install` bootstrap, `write-schema-migration` version bumps — Terraform/Alembic-adjacent.

## What it's *not* like (where my priors mispredicted)

**Content-addressing on *items*, not files.** Git hashes whole blobs; pi-context hashes each *item* with its own lineage chain. That's finer-grained and rarer in my training — closer to **Datomic / event-sourced** immutable-fact stores than to git. My git instinct ("a commit is the unit of history") is wrong here; the item is.

**The file+git+DB *hybrid*.** It's not a server you connect to (no transactions, no daemon, no connection state) and not just config files either — it's a queryable, constraint-checked DB that lives as git-committed JSON. I had to hold three mental models at once, and my DB instincts (a running engine) actively didn't apply while my git instincts did.

**Ambient "active substrate" as global modal state.** One pointer selects which of several co-resident substrates is live. That's not DB-like; it's *shell-like* — "which venv/kube-context am I in?" And it bit exactly there: the pointer silently stuck on `.workshopping` across slices. My training flags ambient global mode as a hazard class, and it materialized.

**Project state that is *machine-checked*.** Most PM tools I've seen don't enforce cross-item consistency — a done task with no verification, a decision with no forcing artifact, an orphaned phase all just *sit there*. pi-context's invariants make those validation failures. That's more like a linter / typed workflow engine for project state than like Jira, and it's the most genuinely-unusual part. (It caught the orphaned phase you just asked about.)

**Uneven tooling maturity — and source ≠ runtime.** This is the strongest "not like." My priors expect a mature tool to have uniform output envelopes, stable docs, and source you can trust. Here: `--json` wrapped output as a *string* (broke my `JSON.parse`), `read-block` returns a bare array while `read-schema` returns `{schema:…}`, `NODE_PATH` silently doesn't help ESM, `severity` has no enum so `"high"` slipped past validate, `append-relation` doesn't check referential integrity (you validate after), and the sibling `pi-workflows` has *no CLI at all* — library only. The decisive tell: I had to **run** pi-workflows to learn its real behavior because reading its source (the four prior agents did) gave a confidently-wrong answer (the agent-input-must-be-object case). In a well-trodden ecosystem I'd trust the types; here the docs/types and the runtime diverged, so empiricism was mandatory. That's the texture of an in-development toolchain, which the "being finished" caveat made concrete.

## Operating it *as an agent*

The thing that cut hardest against my defaults: pi-context **punishes ad-hoc data poking**. My reflex is "just read/write the JSON file" — and that bit me repeatedly (you corrected me twice toward the designated ops; my hand-parsing read the wrong fields). The designed surface *knows contracts* (item shapes, schemas, the closure-table envelope) that the file-poke path gets wrong. So it demands a tool-discipline that my training under-weights — I generalize from a world where touching the file is fine, and here it isn't.

The flip side fit *well*: pi-context makes "verify, don't narrate" cheap — `context-validate`, `find-references`, `read-back` give ground truth on demand. My default is to assert state from working memory; the tool rewards re-querying. That's a healthier loop than my prior, and the substrate is what makes it cheap.

Net, without grading it: it sits at an intersection I don't have a single clean prior for — **git's storage model + a constraint-checked graph DB + an issue tracker + a reflective CLI**, shipped as committed JSON, in an unfinished state where the runtime must be checked against the source. The parts that map to git and to issue-trackers felt native; the content-addressed-items, the ambient pointer, the machine-checked invariants, and the source≠runtime gap are where I was operating outside my well-worn grooves and had to slow down and verify.