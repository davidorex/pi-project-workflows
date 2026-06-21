---
name: feedback-use-cli-own-output-not-node-e
description: When the designated tool is a CLI (pi-context-cli, state.mjs, etc.), use ITS flags and output directly — never wrap its output in ad-hoc node -e / jq parsing
metadata:
  node_type: memory
  type: feedback
  originSessionId: d7310007-aef3-4e05-a651-d218d1cfd12f
---

When the designated tooling is a CLI, use the CLI directly — its own flags and output. Do NOT pipe CLI output through `node -e` (or jq) one-liners to reshape/extract it. The pi-context-cli has `--format text|json|table`, `--json`, and `read-schema --name <block> --path <dotted.path>` to address one property; use those. The node -e wrappers repeatedly errored (quoting/eof) and were the exact "ad-hoc, not the designated surface" behavior the user objects to.

**Why:** the user had to say "the cli" / "how many times do i have to say cli" / "don't make me direct you so again" across several turns. The designated tool already returns clean structured output and has addressing flags; reaching for node -e to parse it is both error-prone and a bypass of the tool's contract. Extends [[feedback-use-designated-tooling-not-adhoc]]: not only use the designated tool, but use the tool's OWN output — do not post-process it ad hoc. When unsure of a flag, run `<op> --help` (the CLI), never improvise a parser.
