---
name: feedback-no-format-substitution-deliver-exact-artifact
description: Deliver the EXACT artifact type the user named (real .docx/.pdf/binary) — never silently substitute a degraded "dependency-free" form; and when told to do it via an agent, dispatch the agent (don't do its work inline)
metadata:
  node_type: memory
  type: feedback
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

When the user names a concrete artifact format (".doc", ".docx", a real Word/PDF/binary file), produce THAT exact artifact. Do NOT substitute a lookalike (e.g. Word-flavored HTML saved with a .doc extension) because it is dependency-free or convenient — that is a silent downgrade of the deliverable and reads as a mandate violation. If the obvious tool is missing, the agent installs/uses real tooling (python-docx, LibreOffice, pandoc) to produce the genuine format; a substitute is acceptable ONLY if explicitly offered and chosen, never defaulted to.

When the user says "do it via an agent": **dispatch the agent immediately** with a complete brief. Do not start doing the agent's work inline (e.g. detecting converters, reading files yourself) — that wastes the user's time and violates the use-the-agent directive (mandate-006-adjacent). Trust the agent to pick real tools and Python.

**Why:** the user asked for a `.doc`, I shipped HTML-as-.doc, then when re-tasked "via agent" I started running converter-detection myself. The user: "is word-flavored html what i asked for?" / "i told you to do it via agent. quit wasting my time and violating mandates." The faithful move was: dispatch the agent to render a REAL .docx (like data/'Sample - Schoolwide Action Plan 2.docx') with actual tools. Relates to [[feedback-honor-literal-commands]], [[feedback-use-designated-tooling-not-adhoc]].
