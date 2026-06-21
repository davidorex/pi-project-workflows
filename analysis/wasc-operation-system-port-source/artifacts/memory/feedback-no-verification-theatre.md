---
name: feedback-no-verification-theatre
description: "Never dress a bash check in self-authored echo labels/verdicts — the tool's raw output + exit code is the verification; prose interprets it"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

Never wrap a check in echo scaffolding: no `echo "=== label ==="`, no `|| echo "(clean)"`, no `&& echo ok`, no `echo "(clean if empty)"`, no `echo "--- N entries ---"`. Those are self-authored verdicts printed as if they were tool output — fakeable theatre that gives a false impression of rigor, because the echo proves nothing (I wrote the word "clean"; the command didn't). Run the BARE check; its raw output + exit code IS the verification. A grep that prints nothing (exit 1) is the clean signal — read the empty output, don't narrate "(clean)" into it. When a pass/fail verdict is genuinely needed, get it from a real deterministic mechanism (a tool's nonzero exit, `check-rename --gate`, `run-real-checks`), never from an echoed string.

**Why:** This is the same discipline as the project's run-real-checks / no-LLM-self-report / verify-don't-narrate, and the session-long thread that "a description of computing is not computing." Tools produce evidence; prose interprets it. Conflating the two — authoring the conclusion as tool output — is exactly the self-report anti-pattern the whole architecture exists to prevent.

**How to apply:** bare commands, raw output, real exit codes. Report the conclusion to the user in prose, derived from the raw evidence the command actually produced — never via a decorative echo. Related: [[feedback-use-designated-tooling-not-adhoc]] (use the real tool, not an ad-hoc stand-in) and the verify-don't-narrate principle.
