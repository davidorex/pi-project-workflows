#!/usr/bin/env python3
"""
Erase the success-criteria / resolution fields from the active pi-context
substrate's tasks and gaps, replacing each with a placeholder that marks it for
re-derivation from the live codebase. Dry-run by default.

WHY IT DRIVES THE CLI, NOT A DIRECT JSON EDIT:
The substrate is content-addressed — every item carries a content_hash and its
body is mirrored in <substrate>/objects/. Editing <substrate>/<block>.json by
hand desyncs the hash from the object store and bypasses schema validation +
DispatchContext attestation. So every mutation goes through
`pi-context update-block-item`, which recomputes the hash, validates, and stamps.

TARGETS (the field per block, from the schemas):
  tasks            -> acceptance_criteria   (array[string])  -> [PLACEHOLDER]
  framework-gaps   -> proposed_resolution   (string, REQUIRED) -> PLACEHOLDER

The placeholder is non-empty, so the required `proposed_resolution` stays
schema-valid after the wipe. Issues are out of scope (handled separately).

Reads <substrate>/<block>.json directly ONLY to enumerate ids + current values
for the report; it never writes those files.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
PLACEHOLDER = "To be determined exactly from live codebase."

# block, array_key, field, replacement value (typed to the field's shape)
TARGETS = [
    {"block": "tasks", "file": "tasks.json", "array_key": "tasks",
     "field": "acceptance_criteria", "replacement": [PLACEHOLDER]},
    {"block": "framework-gaps", "file": "framework-gaps.json", "array_key": "gaps",
     "field": "proposed_resolution", "replacement": PLACEHOLDER},
]


def active_substrate_dir() -> Path:
    pointer = json.loads((REPO / ".pi-context.json").read_text())
    d = pointer.get("contextDir")
    if not d:
        sys.exit("error: .pi-context.json has no contextDir")
    return (REPO / d).resolve()


def value_summary(value) -> str:
    if isinstance(value, list):
        return f"array[{len(value)}]"
    if isinstance(value, str):
        return f"string[{len(value)} chars]"
    return type(value).__name__


def update_call(block: str, array_key: str, item_id: str, field: str,
                replacement, writer: str) -> list[str]:
    return [
        "pi-context", "update-block-item",
        "--block", block, "--arrayKey", array_key,
        "--match", json.dumps({"id": item_id}),
        "--updates", json.dumps({field: replacement}),
        "--writer", writer,
        "--json",
    ]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true",
                    help="execute the wipe (default is dry-run: report only)")
    ap.add_argument("--writer",
                    default='{"kind":"human","user":"davidryan@gmail.com"}',
                    help="WriterIdentity JSON stamped on each update")
    args = ap.parse_args()
    dry_run = not args.apply

    substrate = active_substrate_dir()
    print(f"active substrate: {substrate}")
    print(f"placeholder:      {PLACEHOLDER!r}")
    print(f"mode:             {'DRY-RUN (no writes)' if dry_run else 'APPLY (writes via update-block-item)'}\n")

    total = 0
    failed = 0
    for t in TARGETS:
        path = substrate / t["file"]
        if not path.exists():
            print(f"[{t['block']}] block file absent: {path} — skipped\n")
            continue
        items = json.loads(path.read_text()).get(t["array_key"], [])
        field = t["field"]
        hits = [it for it in items
                if field in it and it[field] not in (None, "", [], {})]
        print(f"[{t['block']}] field '{field}' — {len(hits)} of {len(items)} items carry it")
        for it in hits:
            iid = it.get("id", "<no-id>")
            print(f"    {iid}: {value_summary(it[field])} -> {t['replacement']!r}")
            total += 1
            if not dry_run:
                cmd = update_call(t["block"], t["array_key"], iid, field,
                                  t["replacement"], args.writer)
                res = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True)
                ok = res.returncode == 0
                if not ok:
                    failed += 1
                print(f"        {'OK' if ok else 'FAIL'}: {(res.stdout or res.stderr).strip()[:200]}")
        print()

    print(f"summary: {total} fields targeted" + (f", {failed} failed" if not dry_run else ""))
    if dry_run:
        print("dry-run: nothing written. Re-run with --apply to execute.")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
