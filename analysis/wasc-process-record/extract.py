#!/usr/bin/env python3
"""
Verbatim, complete extraction of the running of the process for the
claude-history project key /Users/david/Projects/wasc-school-wide-improvement-plan.

Source: ~/.claude/.claude-history.db (claude-history SQLite database).
Faithful, lossless: tool_input / agent prompts are emitted verbatim as parsed
from input_json (re-serialized canonically as JSON; no normalization of values).
No invention, no editorializing in the data files.

Reconciliation is asserted in-script: counts derived here must equal the
independently-measured totals (message_content tool_use blocks == tool_executions).
"""
import sqlite3, json, os, sys, collections

DB = os.path.expanduser("~/.claude/.claude-history.db")
OUT = os.path.dirname(os.path.abspath(__file__))
PSDIR = os.path.join(OUT, "per-session")
os.makedirs(PSDIR, exist_ok=True)

PROJECT = "/Users/david/Projects/wasc-school-wide-improvement-plan"

db = sqlite3.connect(DB)
db.row_factory = sqlite3.Row

# Sessions for the EXACT project key (the named claude-history project key).
sessions = db.execute(
    "SELECT session_id, project_path, first_seen_at, version, git_branch "
    "FROM sessions WHERE project_path = ? ORDER BY first_seen_at", (PROJECT,)
).fetchall()

short = {s["session_id"]: s["session_id"][:8] for s in sessions}

summary = {
    "project_key": PROJECT,
    "db_path": DB,
    "sessions": [],
    "grand_totals": {},
}

grand_tool = collections.Counter()
grand_tool_main = collections.Counter()
grand_tool_side = collections.Counter()
grand_agent_subtype = collections.Counter()
grand_msg = 0
grand_tool_calls = 0
grand_agent_calls = 0

for s in sessions:
    sid = s["session_id"]
    sh = short[sid]

    # --- message counts (full, incl sidechain) ---
    mc = db.execute(
        "SELECT type, is_sidechain, COUNT(*) c FROM messages WHERE session_id=? GROUP BY type, is_sidechain",
        (sid,)).fetchall()
    msg_total = sum(r["c"] for r in mc)
    grand_msg += msg_total

    # --- pull every tool_use block, joined to its tool_executions row for verbatim input/result ---
    rows = db.execute(
        """
        SELECT mc.message_uuid, mc.block_index, mc.tool_use_id, mc.tool_name AS mc_tool_name,
               te.id AS te_id, te.input_json, te.result_content, te.is_error,
               m.timestamp, m.is_sidechain, m.agent_id, m.type AS msg_type,
               m.parent_uuid, m.git_branch, m.version
        FROM message_content mc
        JOIN messages m ON mc.message_uuid = m.uuid
        LEFT JOIN tool_executions te
               ON te.message_uuid = mc.message_uuid AND te.tool_use_id = mc.tool_use_id
        WHERE m.session_id = ? AND mc.block_type = 'tool_use'
        ORDER BY m.timestamp, mc.block_index, te.id, mc.message_uuid
        """, (sid,)).fetchall()

    tool_path = os.path.join(PSDIR, f"{sh}-tool-calls.ndjson")
    agent_path = os.path.join(PSDIR, f"{sh}-agent-dispatches.ndjson")

    s_tool = collections.Counter()
    s_tool_main = collections.Counter()
    s_tool_side = collections.Counter()
    s_agent = 0
    seq = 0

    ftool = open(tool_path, "w")
    fagent = open(agent_path, "w")

    for r in rows:
        seq += 1
        tname = r["mc_tool_name"]
        # verbatim input: parse input_json, re-emit; if unparseable, keep raw string under _raw_input_json
        raw = r["input_json"]
        parsed = None
        if raw is not None:
            try:
                parsed = json.loads(raw)
            except Exception:
                parsed = None
        rec = {
            "seq": seq,
            "session": sid,
            "timestamp": r["timestamp"],
            "is_sidechain": r["is_sidechain"],
            "agent_id": r["agent_id"],
            "msg_type": r["msg_type"],
            "message_uuid": r["message_uuid"],
            "block_index": r["block_index"],
            "tool_use_id": r["tool_use_id"],
            "tool_name": tname,
            "is_error": r["is_error"],
        }
        if parsed is not None:
            rec["input"] = parsed
        else:
            rec["_raw_input_json"] = raw  # verbatim, no loss, even if non-JSON / null
        ftool.write(json.dumps(rec, ensure_ascii=False) + "\n")

        s_tool[tname] += 1
        (s_tool_side if r["is_sidechain"] else s_tool_main)[tname] += 1
        grand_tool[tname] += 1
        (grand_tool_side if r["is_sidechain"] else grand_tool_main)[tname] += 1

        if tname == "Agent":
            s_agent += 1
            grand_agent_calls += 1
            st = None
            if isinstance(parsed, dict):
                st = parsed.get("subagent_type") or parsed.get("subagentType")
            grand_agent_subtype[st if st else "(none/default)"] += 1
            arec = {
                "seq": seq,
                "session": sid,
                "timestamp": r["timestamp"],
                "is_sidechain": r["is_sidechain"],
                "dispatched_by_agent_id": r["agent_id"],
                "message_uuid": r["message_uuid"],
                "tool_use_id": r["tool_use_id"],
                "is_error": r["is_error"],
            }
            if parsed is not None:
                arec["input"] = parsed   # full verbatim: description, prompt, subagent_type, model, etc.
            else:
                arec["_raw_input_json"] = raw
            arec["result_content"] = r["result_content"]  # the agent's verbatim return, if recorded
            fagent.write(json.dumps(arec, ensure_ascii=False) + "\n")

    ftool.close()
    fagent.close()

    s_tool_total = sum(s_tool.values())
    grand_tool_calls += s_tool_total

    summary["sessions"].append({
        "session_id": sid,
        "short": sh,
        "project_path": s["project_path"],
        "first_seen_at": s["first_seen_at"],
        "version": s["version"],
        "git_branch": s["git_branch"],
        "message_total": msg_total,
        "message_breakdown": [{"type": r["type"], "is_sidechain": r["is_sidechain"], "count": r["c"]} for r in mc],
        "tool_calls_total": s_tool_total,
        "tool_calls_main_thread": sum(s_tool_main.values()),
        "tool_calls_sidechain": sum(s_tool_side.values()),
        "agent_dispatches": s_agent,
        "tool_histogram": dict(s_tool.most_common()),
        "tool_histogram_main": dict(s_tool_main),
        "tool_histogram_sidechain": dict(s_tool_side),
        "files": {"tool_calls": f"per-session/{sh}-tool-calls.ndjson",
                  "agent_dispatches": f"per-session/{sh}-agent-dispatches.ndjson"},
    })

summary["grand_totals"] = {
    "sessions": len(sessions),
    "messages": grand_msg,
    "tool_calls": grand_tool_calls,
    "agent_dispatches": grand_agent_calls,
    "tool_histogram": dict(grand_tool.most_common()),
    "tool_histogram_main_thread": dict(grand_tool_main.most_common()),
    "tool_histogram_sidechain": dict(grand_tool_side.most_common()),
    "agent_subagent_type_distribution": dict(grand_agent_subtype.most_common()),
}

# --- RECONCILIATION ASSERTIONS (independent re-measure) ---
ph = ",".join("?" for _ in sessions)
sids = [s["session_id"] for s in sessions]
ind_tool = db.execute(
    f"SELECT COUNT(*) FROM tool_executions te JOIN messages m ON te.message_uuid=m.uuid WHERE m.session_id IN ({ph})", sids
).fetchone()[0]
ind_block = db.execute(
    f"SELECT COUNT(*) FROM message_content mc JOIN messages m ON mc.message_uuid=m.uuid WHERE mc.block_type='tool_use' AND m.session_id IN ({ph})", sids
).fetchone()[0]
ind_agent = db.execute(
    f"SELECT COUNT(*) FROM tool_executions te JOIN messages m ON te.message_uuid=m.uuid WHERE te.tool_name='Agent' AND m.session_id IN ({ph})", sids
).fetchone()[0]

# count lines actually written
def linecount(p):
    n = 0
    with open(p) as f:
        for _ in f:
            n += 1
    return n
written_tool = sum(linecount(os.path.join(PSDIR, f"{short[s['session_id']]}-tool-calls.ndjson")) for s in sessions)
written_agent = sum(linecount(os.path.join(PSDIR, f"{short[s['session_id']]}-agent-dispatches.ndjson")) for s in sessions)

summary["reconciliation"] = {
    "independent_tool_executions_count": ind_tool,
    "independent_message_content_tool_use_block_count": ind_block,
    "independent_agent_tool_executions_count": ind_agent,
    "extracted_tool_call_lines_written": written_tool,
    "extracted_agent_dispatch_lines_written": written_agent,
    "tool_calls_match": (ind_tool == ind_block == grand_tool_calls == written_tool),
    "agent_calls_match": (ind_agent == grand_agent_calls == written_agent),
}

with open(os.path.join(OUT, "summary.json"), "w") as f:
    json.dump(summary, f, indent=2, ensure_ascii=False)

rc = summary["reconciliation"]
print(json.dumps({"grand_totals_min": {k: summary["grand_totals"][k] for k in ("sessions","messages","tool_calls","agent_dispatches")},
                  "reconciliation": rc}, indent=2))
assert rc["tool_calls_match"], "TOOL CALL COUNTS DO NOT RECONCILE"
assert rc["agent_calls_match"], "AGENT CALL COUNTS DO NOT RECONCILE"
print("RECONCILED OK")
