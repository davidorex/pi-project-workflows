# FGAP-017 criterion-3 pain archaeology — "the cap hides the ready tasks"

Forensic recovery of the ACTUAL pain behind TASK-020 / FGAP-017 acceptance criterion 3
(config-declared next-actions head-size; "ready tasks no longer truncated below open gaps"),
and an adversarial challenge of the two contended resolutions (A: reorder `next_ranked`
tasks-first; B: per-entry `reserve` floor) against that recovered pain.

Method: claude-history (`search_messages` FTS5 + `execute_sql` against the session DB) cross-tied
to the actual conversation messages and the filing commit; deriver source read at
`packages/pi-context/src/context-sdk.ts`. Substrate `*.json` not read directly (per constraint);
the filed FGAP-017 text is recovered from the orchestrator's verbatim provenance-stop message at
filing time, which is the literal payload that was written.

---

## (a) Origin — where/when the concern was raised + filed

**The concern was first articulated by the ASSISTANT, not the user**, inside a "what are our next
steps" derivation, then interrogated and adopted by the user.

| When (ISO) | Session | Who | Event |
|---|---|---|---|
| 2026-06-17T00:13:54.655Z | `8490e49a-7509-477f-9cb5-92f16552090a` | assistant (`7cabe2c1`) | First utterance of the phrase. In a next-steps list: *"`nextActions` is saturated by 15 P2 open gaps (the cap hides the ready tasks beneath them)"* — an aside the assistant volunteered. |
| 2026-06-17T00:15:54.426Z | same | **user** (`383e7ec3`) | Quotes the assistant's phrase back as an interrogation: *"what cap: the cap hides the ready tasks beneath them"* — i.e. "what cap are you talking about?" |
| 2026-06-17T00:16:34.910Z | same | assistant (`fccc0624`) | Identifies `NEXT_ACTIONS_CAP = 15` at `context-sdk.ts:864-865`; explains the build order (gaps pushed `:813-833`, tasks appended `:859`, sliced to 15 `:864-865`); empirically: a live run returned 15 entries, all framework-gaps, 0 of 14 ready tasks. |
| 2026-06-17T00:17:38.530Z | same | **user** (`726c618a`) | *"do the file items include removing that hard-coded element?"* — then quotes the assistant's own proposed-fix language: *"a config-declared ranking/lens instead of the hardcoded gaps-first + fixed-15 slice."* |
| 2026-06-17T00:18:34.909Z | same | assistant (`311fc003`) | Reports the cap is NOT in FGAP-017/TASK-020 scope; surfaces it as a discovered un-filed element; "Your scope call." |
| 2026-06-17T00:23:05.500Z | same | **user** (`b7e98819`) | *"it should be in 017."* |
| 2026-06-17T00:23:52.290Z | same | assistant (`41f99820`) | Provenance-stop: presents the exact `description`/`evidence`/`proposed_resolution` additions it intends to write, plus the provenance table. |
| 2026-06-17T00:24:04.603Z | same | **user** (`352a4f9a`) | *"yes"* (then 00:24:36 "Granted"). |
| 2026-06-17T00:26:31.142Z | same | assistant (`e5bd4ead`) | Filed at commit **`6803486`** ("substrate(.context): fold the hardcoded NEXT_ACTIONS_CAP into FGAP-017 + TASK-020 scope"). The criterion-3 acceptance text + description + evidence + proposed_resolution were written here. |

Note on namespace collision: FTS returns three unrelated FGAP-017s (a `.context` registry-schema
gap closed 2026-05-09; a tenant-catalogue gap 2026-06-07; and this state-derivation FGAP-017).
The NEXT_ACTIONS_CAP fold-in is unambiguously the `8490e49a` / `context-jit-spec-v2` arc, commit
`6803486`. The 2026-05-25 `b62c055d` NEXT_ACTIONS_CAP hits are incidental greps during FGAP-089
(fail-closed reads) — in that arc the cap was **explicitly excluded** as "execution OUTPUT
(tail-keeping), not reads" (brief `815f0d19`, `6bda0f23`). So the cap was twice declared
out-of-scope before being folded in here.

---

## (b) The EXACT pain — verbatim, user words separated from LLM-composed criterion prose

### What the USER actually said (verbatim, every user utterance on this point)

1. `383e7ec3` 2026-06-17T00:15:54Z — **"what cap: the cap hides the ready tasks beneath them"**
   (this is the user QUOTING the assistant's own prior sentence back as a "what do you mean" probe,
   not an independent statement of felt pain).
2. `726c618a` 2026-06-17T00:17:38Z — **"do the file items include removing that hard-coded element?"**
   followed by a verbatim re-quote of the assistant's fix phrasing ("a config-declared ranking/lens
   instead of the hardcoded gaps-first + fixed-15 slice").
3. `b7e98819` 2026-06-17T00:23:05Z — **"it should be in 017."**
4. `352a4f9a` 2026-06-17T00:24:04Z — **"yes"** (granting the proposed filing).

That is the **entire** user-authored content. The user never independently described a felt
problem ("I keep losing my tasks," "I can't see what to work on"). The user's contribution is:
(i) an interrogation that echoes the assistant's words, (ii) a scoping directive that the
already-surfaced element be filed under FGAP-017, (iii) assent to a pre-composed payload.

### What was LLM-composed (the criterion prose, written under that authority)

The criterion-3 text under scrutiny —
> "The next-actions head-size is config-declared (replacing the hardcoded NEXT_ACTIONS_CAP=15
> slice at context-sdk.ts:864-865); with the shipped conception, ready tasks are no longer
> truncated below open gaps — a runtime demo against .context (>=15 open gaps) surfaces ready
> tasks in the ranked head"

— and the FGAP-017 description clause it mirrors —
> "…AND a fixed next-actions head-size — NEXT_ACTIONS_CAP = 15 (context-sdk.ts:864-865), slicing
> nextActions to the first 15 — which, combined with the gaps-pushed-before-tasks order
> (:813-833 then :859), truncates all ready tasks below the open gaps whenever ≥15 gaps are open."

— are **assistant-authored** (composed in `41f99820` 00:23:52, filed `6803486`). The assistant's
OWN provenance table at filing classified the split explicitly:

| Element | Class the assistant assigned | Basis |
|---|---|---|
| "Add the cap to FGAP-017" | user-DIRECTED | "it should be in 017" |
| The cap *fact* + the truncation *framing* ("≥15 gaps truncate every ready task") | **DERIVABLE** | code `:813-865` + the live 15-gaps/0-tasks run |

So by the project's own provenance discipline, the framing "ready tasks truncated below open
gaps" is **DERIVABLE-classed, LLM-composed**. The only user-DIRECTED semantic element is "put it
in FGAP-017." The pain statement is an LLM diagnosis the user assented to — not a user-originated
expression of need.

**Critical finding:** the load-bearing phrase of criterion 3 ("ready tasks no longer truncated
below open gaps") traces to an assistant aside (`7cabe2c1`), not to any user statement of what
hurt. The user's role was interrogation + scoping + assent. This is exactly the
filing-time-augmentation-launders-into-authority pattern the project's own memory flags
(`feedback_story_anchored_criteria_no_filing_augmentation`).

---

## (c) The challenge — drift analysis (pain → criterion → resolutions)

### Pain → criterion

There is no independent user pain to drift FROM — the "pain" and the criterion share a single
LLM-authored source. But there IS a recoverable user INTENT, stated in `726c618a` and the
re-quoted fix language: the user endorsed **"a config-declared ranking/lens instead of the
hardcoded gaps-first + fixed-15 slice."** Two distinct hardcodings are named: (1) the gaps-first
ORDER, (2) the fixed-15 SLICE. The user's endorsed remedy is that **both become config-declared**
— not that any particular post-config ordering is correct.

The criterion then narrowed this to a single observable: *"ready tasks … surface … in the ranked
head."* That narrowing is a drift. "Make ordering+cap config-declared" (a mechanism deliverable)
became "ready tasks appear in the head on a ≥15-gap substrate" (a specific output state). The
config-declaration was already delivered (the code now reads `sd.next_ranked` in array order and
slices to `sd.head_size` — both config values; `context-sdk.ts:858,891`). So the criterion as
literally written is **about the stock conception's ORDERING choice**, not about the mechanism the
user endorsed. The mechanism is done; what's left is a data/ordering decision the criterion
smuggled in as if it were the gap.

### Criterion → resolution A (reorder `next_ranked` to tasks-first)

Reorder makes ready tasks appear in the head by pushing the tasks entry ahead of the gaps entry in
the stock array. It **literally satisfies criterion 3** ("ready tasks surface in the ranked head").
But weigh it against the recovered intent and the original observed situation:

- The original complaint context (`7cabe2c1`) was a "what's next, ordered by what-unlocks-most"
  question where the assistant noted the head was **all gaps, zero tasks**. The user's reaction
  treated all-gaps-no-tasks as wrong.
- Tasks-first reorder produces the **mirror failure**: on a task-heavy substrate the head fills
  with tasks and **gaps drop out below the cap**. The user's endorsed remedy was config-declared
  flexibility, not "swap which kind gets starved." Reorder solves the one observed instance by
  re-creating its symmetric twin — a class-incomplete fix by the project's own
  "fix the class, not the symptom" rule.
- Nothing in the record shows the user wanted gaps to LEAVE the head. The user wanted ready tasks
  to be VISIBLE; that is an additive want ("also show me the tasks"), and reorder satisfies it
  only by making the displacement run the other direction.

Verdict on A: satisfies the criterion's letter; does **not** faithfully serve the endorsed intent —
it is a same-shape regression hidden behind a one-line config change.

### Criterion → resolution B (per-entry `reserve` floor)

Reserve guarantees each `next_ranked` entry a minimum number of slots in the head (e.g. tasks
reserve N, gaps reserve M), so neither kind is fully starved regardless of volume. This matches the
recovered intent more closely: ready tasks become visible **without** evicting gaps — the head
shows BOTH, which is what "the cap hides the ready tasks beneath them" actually asks for (the tasks
were hidden; nothing in the user record asks for gaps to be hidden instead).

But challenge B too: it is code + schema + catalog + test — and the user never asked for a reserve
mechanism. The record's only mechanism-level user input is "config-declared ranking/lens." Reserve
is one such config-declared mechanism, so it is within the endorsed envelope; it is not an
augmentation the way a new unrequested FEATURE would be. The cost is scope: B is the larger build,
and the user has a standing aversion to scope-inflation framed as necessity.

Verdict on B: faithfully serves the recovered intent (both kinds visible, config-declared);
heavier than the user's words strictly compel.

### The faithful resolution on the evidence

The evidence supports neither A nor B as "the" answer, because **the criterion encodes a decision
the user never made**. What the user actually authorized is: (1) the ordering and the cap become
config-declared (DONE), and (2) ready tasks become visible in the head. The faithful resolution is
the one that makes ready tasks visible **without re-introducing the symmetric "now gaps are
hidden" defect** — i.e. a head that does not let one kind monopolize the cap. That is a *reserve /
interleave / floor* shape (B's family), NOT a *reorder that swaps the victim* (A). Reorder fails
the faithfulness test specifically because it re-creates the very class of defect the moment
prompted — it answers "are tasks visible?" yes while answering "is any actionable kind starved?"
also yes.

If the project wants to honor its own provenance discipline strictly, the correct move is not to
pick A or B silently but to surface to the user that criterion 3 baked in an ordering decision the
record does not contain, and to get the actual decision (always-tasks-first? guaranteed-floor for
both? interleave?) as a user-DIRECTED element — because per `feedback_derive_decisions...`, this
particular choice is NOT cleanly derivable from system facts (the stock conception's "right"
balance of gaps-vs-tasks visibility is a product judgment, not a registry fact).

---

## (d) Confidence + load-bearing evidence

**Confidence: high** on the provenance chain; **high** on the drift finding; **medium-high** on the
faithful-resolution conclusion (it rests on an absence — the user never asked for gaps to be hidden
— which is strong but is an argument from silence).

Load-bearing evidence (each tied to an actual message + the commit):
- The phrase originates with the assistant: `7cabe2c1` 00:13:54 (pre-dates every user mention).
- The user only ever interrogated/scoped/assented: `383e7ec3`, `726c618a`, `b7e98819`,
  `352a4f9a` — these four are the complete set of user utterances on the point.
- The criterion prose is LLM-composed-under-authority with the framing self-classified DERIVABLE:
  `41f99820` 00:23:52 provenance table; filed at commit **`6803486`**.
- The cap+ordering are already config-declared in current source (so the criterion's mechanism is
  delivered; only the ordering decision remains): `context-sdk.ts:858` (`sd.next_ranked` array-order
  loop), `:891` (`slice(0, sd.head_size)`).
- Reorder's symmetric-failure argument is structural, derived from the same build loop — it is a
  reasoned (not separately observed) consequence; flagged as such.

What I could NOT establish (stated explicitly, no inference): no user message anywhere expresses an
independent felt pain or a preference about whether gaps should remain visible. If such a statement
exists outside the searched sessions/terms it was not surfaced by the FTS terms tried
(NEXT_ACTIONS_CAP, next_ranked, "ready tasks", buried, truncated, FGAP-017) — within those, the
record shows the pain was assistant-originated and user-endorsed.
