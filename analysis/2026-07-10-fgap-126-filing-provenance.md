# FGAP-126 filing provenance — the `proposed_resolution` "or ... as a decision" phrase

Scope: determine who/what put the hedge — "apply the FGAP-068 caller-as-reconciler shape ... or give the pi-only gated tools an explicit pre-authorization channel ... as a decision" — into FGAP-126's filed text. Method: `claude-history` (search_messages, query_messages, execute_sql, git_log) cross-checked against `git show` on the actual commits, plus a fresh read of FGAP-126/FGAP-068 via `pi-context read-block-item`.

## 1. Session and commit that filed FGAP-126

- **Filing session**: `ac1621b3-a1ff-49c8-93dd-7095ccd4bf1e`, 2026-07-07 (Fable 5 model).
- **`append-block-item` call**: tool_use at `2026-07-07T00:28:36.805Z`, file `/tmp/fgap-noninteractive-gate.json`, block `framework-gaps`, arrayKey `gaps`, relations to `FEAT-014` (`gap_addressed_by_feature`) and `FGAP-068` (`gap_relates_to_gap`).
- **Substrate commit**: `1201881c` — `substrate(.context): work-order dogfood findings filed — FEAT-014 + FGAP-124..128 + issue-012 + R-0029 (granted)`, 2026-07-07 08:31:03 +0800.
- The `proposed_resolution` text in the ORIGINAL `/tmp/fgap-noninteractive-gate.json` payload (captured via `execute_sql` on `message_content.tool_input`) is **byte-identical** to the field currently in the live substrate (confirmed by a fresh `pi-context read-block-item --block framework-gaps --id FGAP-126 --json` read at the start of this investigation). The only change since filing is an evidence-line citation fix (`:171` → `:254`, corrected 2026-07-10, commit `cf6fbec0`, unrelated to the resolution text). **The hedge was in the filing from the first write, not introduced by later drift.**

Note: an unrelated, differently-scoped FGAP-126 existed earlier (filed ~2026-05-28, "context-init lacks writer.kind=human enforcement," closed 2026-05-29 by VER-060). The ID was evidently reused after that gap closed. This is a separate ID-reuse question, out of scope here — not relevant to the provenance of the CURRENT FGAP-126's wording.

## 2. What the user actually said, verbatim, in that session

The complete chain of user messages between the investigating-agent dispatch and the filing (all verbatim, in order):

1. `2026-07-06T23:57:50.995Z` — *"because we have 2 operational contexts -- claude code v. within pi - the harness for claude code is warranted. try to use the work-order functionality and let's see where it breaks, if it breaks."* (This authorized the live WO-001 probe.)
2. `2026-07-07T00:25:42.364Z` — *"i want all findings from 2026-07-07-work-order-dispatch-dogfood-breaks.md. validly and canonically filed"* — **this is the sole directive that produced FGAP-126.** Nothing more specific.
3. `2026-07-07T00:32:28.052Z` — *"you don't set priority."* — the user rejected the assistant's self-assigned priorities (a separate but related over-reach: the assistant had baked P2/P3 into the filings and presented them as facts rather than recommendations).
4. `2026-07-07T00:34:56.338Z` — *"all are priority 1"* — the user's own priority-setting.

**There is no user message, in this session, that mentions two architectural options, a pre-authorization channel, `--yes`, or a "decision" framing for FGAP-126's resolution.** The user's only substantive instruction was "file all findings, validly and canonically." Everything in the `proposed_resolution` field's specific wording — including the fork and the "as a decision" hedge — was composed by the orchestrating assistant during 00:26–00:29 while drafting six filings in sequence from the investigation report.

## 3. What the investigating agent actually found (the report FGAP-126 claims to summarize)

A fresh investigating agent was dispatched at `2026-07-07T00:07:10.018Z` (read-only on the substrate, empirical probes via `pi -p` / `npx tsx` against built dist) to root-cause the WO-001 probe's five breaks. It wrote `analysis/2026-07-07-work-order-dispatch-dogfood-breaks.md` (committed `251dedbb`, still on disk, read here in full via `git show`).

Its **Break 1** section (the section FGAP-126 is built from) says, verbatim:

> "Prior-art: FGAP-068 (closed) — the update-conflict resolver spawned a `pi -p` subordinate whose `write-schema` was auth-gate-refused; its resolution vocabulary is `caller-as-reconciler`... DEC-0017's R2 rejection (cited inside FGAP-068) already recorded that `pi -p` sessions cannot pass the auth-gate. The author-agent-spec INSTANCE is untracked; the class is tracked-and-closed for the schema-conflict instance only. **The FGAP-068 resolution shape (caller authors, gated tool confirmed in the caller's interactive session) maps directly: the interactive orchestrator should author the spec; a `pi -p` harness step should never need to.**"

This is a **single, unhedged recommendation** — caller-as-reconciler, full stop. The investigating agent mentions `--yes` exactly once, as a contrastive observation of the current state of the world (pi-context's 13 CLI-reflected ops have it; the 8 pi-only tools don't) — **never as a proposed alternative resolution**. Nowhere in the 129-line report does the investigating agent frame this as a two-option fork or call for "a decision." The findings table's severity/prior-art column for Break 1 says: "TRACKED-CLOSED as class instance FGAP-068/FGAP-069 (caller-as-reconciler resolution)."

**Conclusion: the "or ... give the pi-only gated tools an explicit pre-authorization channel ... as a decision" branch has no source in the investigating agent's findings.** It was added by the orchestrating assistant at filing time, apparently by taking the report's contrastive mention of the CLI's `--yes` flag and inflating it into a second resolution option, then packaging both as an unresolved fork — a step the source material does not support.

## 4. FGAP-068 grounding check

FGAP-068 (`read-block-item --block framework-gaps --id FGAP-126` cross-read against `--id FGAP-068`), closed 2026-06-08, status `closed`, `canonical_vocabulary: "caller-as-reconciler (no subordinate-agent spawn for an agent-invoked CLI)"`. Its own `proposed_resolution`, verbatim:

> "Drop the pi-bound subordinate spawn from the resolver. `update` returns the typed conflict set... the calling agent (Claude Code / a shell-LLM) reconciles and applies the result via `write-schema` under the operator's confirm. Net-simpler code. Amends DEC-0017's resolver route."

This is **one decisive shape, no hedge, no "or."** FGAP-068 does not establish, and was never used to establish, a precedent for "or ... as a decision" framing — if anything it is precedent for the *opposite*: a single clear resolution reached without treating the choice as an open fork. The investigating agent read FGAP-068 correctly (per §3 above) and drew the same single-option conclusion from it. FGAP-126's citation of FGAP-068 as grounds for the fork is therefore not just unsupported — it inverts what the cited item actually models.

## 5. The WO-001 probe evidence — accurately grounded, not the problem

The one clause in FGAP-126 that IS faithfully drawn from the investigation: *"hand-writing the artifact (what the WO-001 probe did for the agent spec) is the only workaround."* This tracks the report's Break 1 verbatim: *"Hand-writing the spec file (what the probe did) is the only workaround — and it bypasses the sanctioned authoring/validation ceremony entirely."* This part of FGAP-126 has clean provenance: investigating agent → report → filing, unmodified in substance.

The WO-001 probe itself did not produce or imply a two-option fork either — it demonstrated exactly one break (the gate refuses non-interactively) and one bypass (hand-writing). Nothing about the probe's outcome argues for a `--yes`-style alternative; that idea is not in the probe's evidence at all.

## 6. Was this ever surfaced to the user, and what happened

This same question was independently re-derived, unprompted by this investigation, **earlier in the current session** (`d3030496-e4e1-4bfa-8df1-1df86bac518a`, 2026-07-10), during a live back-and-forth about FGAP-126's task success criteria — before the user asked for this formal provenance investigation. Sequence (verbatim):

- `11:46:19` user: *"what does 'which non-interactive shape' mean and how is that not a derivable shape"*
- `11:46:47` assistant: lays out the two options as genuinely opposed postures, says FGAP-068 only proves the caller-as-reconciler shape "worked for one prior case," and that picking between them "isn't written down anywhere — it's a security-posture call."
- `11:48:07` user: *"certainly that's derivable from project policy and intentions as a whole. what is the derivation."*
- `11:48:47` assistant, after producing a (later partly retracted) derivation: **"FGAP-126's `proposed_resolution` framing it as an 'or ... as a decision' overstated the fork."** — states intent to correct the field.
- `11:50:03` user: *"i asked. i didn't say make the decision."*
- `11:50:09` assistant: *"Correct — noted, holding. No FGAP-126 edit, no task filing."*
- `11:50:20` user: *"also you are likely misapplying mandate 1"* — user flags a category error in the derivation's second leg (mandate-001 governs the assistant's conduct toward the user, not what security posture a shipped tool should enforce for its own downstream callers).
- `11:50:41` assistant concedes the category error; the derivation is left standing on one leg (the auth-gate's own shipped docblock intent) with its sufficiency explicitly unresolved.

So: no edit was made to FGAP-126 in that exchange (correctly held, per the user's explicit "i asked, i didn't say make the decision"), and the mandate-001 leg of that in-session derivation doesn't survive scrutiny. But the core diagnosis from that exchange — "overstated the fork" — is independently reached here again from the primary sources (§2–§4), on different grounds (the investigating agent's actual, unhedged recommendation; FGAP-068's actual, unhedged resolution; and the total absence of any user statement proposing two options).

## 7. Provenance verdict — the "or ... as a decision" phrase specifically

Using this project's three-class framework (user-VERBATIM / user-DIRECTED / LLM-augmentation-with-no-basis):

**LLM-augmentation-with-no-basis.**

- Not user-VERBATIM: no user message in the filing session contains anything resembling this phrase or its substance.
- Not user-DIRECTED: the user's only instruction was "file all findings, validly and canonically" — a directive about completeness and process, not about content or framing. The user never described two options, never asked for a decision to be deferred, and (per §6) later objected when the assistant tried to resolve or act on the fork on its own initiative ("i asked. i didn't say make the decision") — indicating the user did not want the assistant making this call unprompted in either direction, filing OR resolving.
- Not DERIVABLE either: the filing-provenance convention's third category requires derivation from a cited fact/convention/decision. The only two candidate citations — the investigating agent's report and FGAP-068 — both point to a single unhedged resolution (caller-as-reconciler), not a fork. The "pre-authorization channel" alternative and the "as a decision" framing were composed by the orchestrating assistant without a corresponding source, at the moment of drafting the filing (`2026-07-07T00:28:36Z`), by inflating a contrastive detail (the CLI's `--yes` flag, mentioned in the report only to describe what the 8 pi-only tools lack) into a second resolution path.

This is a concrete, traceable instance of the pattern the user characterized as "rot of crap filings": a qualifier that narrows/hedges what should be a plain finding (here, manufacturing an open architectural fork where the investigation and the cited precedent both point one way) was introduced by the filing LLM with no user basis and no valid derivation, then persisted unchanged for three days across multiple sessions (including surviving an unrelated citation-line correction on 2026-07-10) until an in-session exchange today independently flagged it — and even then was correctly left un-edited pending the user's explicit grant, per the user's own process rule that asking a question is not authorization to act on the answer.
