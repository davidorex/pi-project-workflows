/**
 * Agent trace read-side SDK for issue-023.
 *
 * Read-only query surface over JSONL trace files produced by TraceWriter (T4).
 * Each line of the trace file is a single TraceEntry per the schema at
 * `packages/pi-jit-agents/schemas/agent-trace.schema.json`.
 *
 * Per DEC-0004 the entry shape is a discriminated union with
 * `{ type, id, parentId, timestamp, ...extra }` mirroring pi-coding-agent's
 * SessionEntry structurally without literal inheritance. Per DEC-0005 entries
 * are produced by a push-write trace stream — this SDK is the corresponding
 * pull/replay surface that reads entries back for inspection and tree
 * traversal. The shape mirrors pi-coding-agent's SessionManager read API
 * (tree traversal, no free-form search) per the canonical-compliance audit.
 *
 * Read-only. No mutation helpers. No schema validation on read — entries are
 * trusted as validated at write time, matching SessionManager's pattern.
 */
import fs from "node:fs";
import path from "node:path";

/**
 * Query parameters for {@link agentTrace}.
 */
export interface AgentTraceQuery {
	/** Path to the JSONL trace file (or directory of date-rotated files). Required. */
	sessionPath: string;
	/** Inclusive lower bound on entry id. ULIDs are lexicographically sortable. Optional. */
	fromId?: string;
	/** Inclusive upper bound on entry id. Optional. */
	toId?: string;
}

/**
 * Read trace entries from a single JSONL file or a directory of date-rotated
 * `*.jsonl` files. Returns ordered records (by `id` ASC).
 *
 * File mode: when `sessionPath` is a regular file, the file is read directly.
 * Directory mode: when `sessionPath` is a directory, every entry matching
 * `*.jsonl` (case-sensitive) is read in lexicographic order — date-rotated
 * names like `2026-04-25.jsonl` sort naturally in chronological order.
 *
 * Each non-blank line is parsed as JSON. Blank lines (after `trim()`) are
 * ignored to tolerate trailing newlines. Parse errors throw with file path
 * and 1-based line number context. After collecting all entries the result
 * is filtered by `fromId`/`toId` (inclusive, lexicographic on the entry's
 * `id` field) and sorted by `id` ASC.
 *
 * Returned entries are typed as `unknown[]` — consumers cast or validate as
 * needed against the TraceEntry discriminated union.
 */
export function agentTrace(query: AgentTraceQuery): unknown[] {
	const entries = readEntries(query.sessionPath);
	const filtered = entries.filter((entry) => {
		const id = entryId(entry);
		if (id === undefined) return false;
		if (query.fromId !== undefined && id < query.fromId) return false;
		if (query.toId !== undefined && id > query.toId) return false;
		return true;
	});
	filtered.sort((a, b) => {
		const ia = entryId(a) ?? "";
		const ib = entryId(b) ?? "";
		if (ia < ib) return -1;
		if (ia > ib) return 1;
		return 0;
	});
	return filtered;
}

/**
 * Read all trace entries that share a given `parentId`. Returns one level of
 * the parent-chained tree, ordered by `id` ASC. Same file/directory read
 * semantics as {@link agentTrace}.
 */
export function agentTraceChildren(sessionPath: string, parentId: string): unknown[] {
	const entries = readEntries(sessionPath);
	const filtered = entries.filter((entry) => entryParentId(entry) === parentId);
	filtered.sort((a, b) => {
		const ia = entryId(a) ?? "";
		const ib = entryId(b) ?? "";
		if (ia < ib) return -1;
		if (ia > ib) return 1;
		return 0;
	});
	return filtered;
}

/**
 * Read a single trace entry by id. Returns the entry object if found,
 * otherwise `null`. Same file/directory read semantics as {@link agentTrace}.
 */
export function agentTraceEntry(sessionPath: string, entryId_: string): unknown | null {
	const entries = readEntries(sessionPath);
	for (const entry of entries) {
		if (entryId(entry) === entryId_) return entry;
	}
	return null;
}

/**
 * Resolve `sessionPath` to an ordered list of files to read. A file path
 * yields `[sessionPath]`; a directory path yields its `*.jsonl` children
 * sorted lexicographically.
 */
function resolveFiles(sessionPath: string): string[] {
	let stat: fs.Stats;
	try {
		stat = fs.statSync(sessionPath);
	} catch (err) {
		const cause = err instanceof Error ? err : new Error(String(err));
		throw new Error(`agent-trace: cannot stat sessionPath '${sessionPath}': ${cause.message}`);
	}
	if (stat.isDirectory()) {
		const children = fs.readdirSync(sessionPath);
		return children
			.filter((name) => name.endsWith(".jsonl"))
			.sort()
			.map((name) => path.join(sessionPath, name));
	}
	return [sessionPath];
}

/**
 * Read every JSONL line from the resolved file set into a flat list of
 * parsed entries. Blank lines are skipped; parse errors throw with file +
 * 1-based line context.
 */
function readEntries(sessionPath: string): unknown[] {
	const files = resolveFiles(sessionPath);
	const entries: unknown[] = [];
	for (const file of files) {
		let raw: string;
		try {
			raw = fs.readFileSync(file, "utf-8");
		} catch (err) {
			const cause = err instanceof Error ? err : new Error(String(err));
			throw new Error(`agent-trace: cannot read file '${file}': ${cause.message}`);
		}
		const lines = raw.split("\n");
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (!line || line.trim() === "") continue;
			try {
				entries.push(JSON.parse(line));
			} catch (err) {
				const cause = err instanceof Error ? err : new Error(String(err));
				throw new Error(`agent-trace: malformed JSON at ${file}:${i + 1}: ${cause.message}`);
			}
		}
	}
	return entries;
}

/**
 * Read the `id` field from a trace entry. Returns `undefined` for entries
 * that lack a string `id` — defensive against malformed entries that slipped
 * past write-time validation.
 */
function entryId(entry: unknown): string | undefined {
	if (entry && typeof entry === "object" && "id" in entry) {
		const id = (entry as { id: unknown }).id;
		if (typeof id === "string") return id;
	}
	return undefined;
}

/**
 * Read the `parentId` field from a trace entry. Returns `null` for the
 * root `session_start` entry, the literal value for chained entries, and
 * `undefined` if absent.
 */
function entryParentId(entry: unknown): string | null | undefined {
	if (entry && typeof entry === "object" && "parentId" in entry) {
		const pid = (entry as { parentId: unknown }).parentId;
		if (typeof pid === "string") return pid;
		if (pid === null) return null;
	}
	return undefined;
}
