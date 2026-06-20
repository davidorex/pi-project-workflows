#!/usr/bin/env tsx
/**
 * audit-checker — deterministic gate for the `audit-task-resolution`
 * zero-tolerance loop.
 *
 * This is artifacts 1 + 2 of the approved plan
 * (`~/.claude/plans/wondrous-scribbling-pelican.md`): the deterministic
 * checker (C2 / C5 / C6 / identifier-resolution / hedge-scan / structural /
 * stall) AND the transcript-verified user-ratification gate (C1 / C3 / C4).
 *
 * It owns the machine-parseable MD contract the `audit-task-resolution` skill
 * emits (the skill is aligned to this contract in a later artifact). The
 * contract is documented at the bottom of this file and enforced here.
 *
 * Two invocation modes:
 *   1. Fixture / CLI mode —
 *        npx tsx .claude/hooks/audit-checker.ts --md <path> [--transcript <path>]
 *      Checks the named MD.
 *   2. Hook mode (no --md) — reads a Stop-hook stdin JSON payload
 *      ({ transcript_path, cwd, ... }), locates the in-flight task's audit MD
 *      under `analysis/`, and checks it.
 *
 * Exit semantics (Stop-hook convention): exit 2 BLOCKS the agent from ending
 * its turn and feeds stderr back to it; exit 0 lets the turn end. The script
 * is idempotent — it recomputes every invocation and owns its own stall logic
 * (there is no framework block-cap and no stop_hook_active dependency).
 *
 * Drives `@davidorex/pi-context` the way scripts/orchestrator/*.ts do:
 *   resolveContextDir (context-dir), resolveItemsByIds (context-sdk),
 *   findReferencesInRepo (lens-view), loadConfig (context).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "@davidorex/pi-context/context";
import { resolveContextDir } from "@davidorex/pi-context/context-dir";
import { resolveItemsByIds } from "@davidorex/pi-context/context-sdk";
import { findReferencesInRepo } from "@davidorex/pi-context/lens-view";

// ───────────────────────────── Types ──────────────────────────────────────

interface CorrectedBody {
	blockId: string;
	field: string;
	body: string; // the fenced code-block content
	provenance: string[]; // raw "- <element> — <CLASS>: <evidence>" bullet lines
	rawSection: string; // header + fenced + provenance, for offset reporting
}

interface ManifestRow {
	block: string;
	field: string;
	operation: string;
	guard: string;
	raw: string;
}

interface ParsedMd {
	bodies: CorrectedBody[];
	manifest: ManifestRow[];
	manifestParsed: boolean;
	noChangeIds: Set<string>; // ids declared via `no-change: <reason>` lines
	operativeText: string; // whole MD minus the delimited evidence/proof appendix
	fullText: string;
}

interface Violation {
	id: string; // a stable machine id for the stall set, e.g. "C2:bad-body-path"
	message: string; // human-facing detail appended to stderr
}

// ───────────────────────────── Arg parsing ─────────────────────────────────

interface Args {
	md: string | null;
	transcript: string | null;
}

function parseArgs(argv: string[]): Args {
	const out: Args = { md: null, transcript: null };
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === "--md" && argv[i + 1]) {
			out.md = argv[i + 1];
			i++;
		} else if (argv[i] === "--transcript" && argv[i + 1]) {
			out.transcript = argv[i + 1];
			i++;
		}
	}
	return out;
}

// ───────────────────────────── MD parsing ──────────────────────────────────

const BODIES_BEGIN = "<!-- BEGIN CORRECTED BODIES -->";
const BODIES_END = "<!-- END CORRECTED BODIES -->";
const MANIFEST_BEGIN = "<!-- BEGIN FILING MANIFEST -->";
const MANIFEST_END = "<!-- END FILING MANIFEST -->";
const APPENDIX_BEGIN = "<!-- BEGIN EVIDENCE APPENDIX -->";
const APPENDIX_END = "<!-- END EVIDENCE APPENDIX -->";

function sliceBetween(text: string, begin: string, end: string): string | null {
	const i = text.indexOf(begin);
	if (i === -1) return null;
	const j = text.indexOf(end, i + begin.length);
	if (j === -1) return null;
	return text.slice(i + begin.length, j);
}

/**
 * Parse the corrected-bodies section. Each entry:
 *   ### <BLOCK-ID> — `<field>`
 *   ```
 *   <body text>
 *   ```
 *   Provenance:
 *   - <element> — <VERBATIM|DIRECTED|DERIVABLE>: <evidence>
 *   - ...
 */
function parseBodies(section: string): CorrectedBody[] {
	const bodies: CorrectedBody[] = [];
	const lines = section.split("\n");
	let i = 0;
	const headerRe = /^###\s+([A-Za-z][A-Za-z0-9-]*-\d+|[A-Za-z][A-Za-z0-9-]*)\s+—\s+`([^`]+)`\s*$/;
	while (i < lines.length) {
		const hm = lines[i].match(headerRe);
		if (!hm) {
			i++;
			continue;
		}
		const blockId = hm[1];
		const field = hm[2];
		const headerLine = lines[i];
		i++;
		// Skip blank lines to the opening fence.
		while (i < lines.length && lines[i].trim() === "") i++;
		let body = "";
		let haveFence = false;
		if (i < lines.length && /^```/.test(lines[i].trim())) {
			haveFence = true;
			i++;
			const bodyLines: string[] = [];
			while (i < lines.length && !/^```\s*$/.test(lines[i].trim())) {
				bodyLines.push(lines[i]);
				i++;
			}
			body = bodyLines.join("\n");
			if (i < lines.length) i++; // consume closing fence
		}
		// Collect provenance bullets.
		const provenance: string[] = [];
		while (i < lines.length && lines[i].trim() === "") i++;
		if (i < lines.length && /^Provenance:\s*$/.test(lines[i].trim())) {
			i++;
			while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
				provenance.push(lines[i].trim());
				i++;
			}
		}
		const raw = [headerLine, haveFence ? "```" : "", body, "```", "Provenance:", ...provenance].join("\n");
		bodies.push({ blockId, field, body, provenance, rawSection: raw });
	}
	return bodies;
}

/**
 * Parse the filing manifest. Each row:
 *   - <block> -> <field> -> <operation> -> <guard>
 */
function parseManifest(section: string): { rows: ManifestRow[]; parsed: boolean } {
	const rows: ManifestRow[] = [];
	let sawRow = false;
	let parsed = true;
	for (const rawLine of section.split("\n")) {
		const line = rawLine.trim();
		if (line === "") continue;
		if (!line.startsWith("-")) continue;
		sawRow = true;
		const cells = line
			.replace(/^-\s*/, "")
			.split("->")
			.map((c) => c.trim());
		if (cells.length !== 4 || cells.some((c) => c === "")) {
			parsed = false;
			continue;
		}
		rows.push({ block: cells[0], field: cells[1], operation: cells[2], guard: cells[3], raw: line });
	}
	// An empty manifest section (no rows at all) is a parse failure too.
	if (!sawRow) parsed = false;
	return { rows, parsed };
}

function parseMd(fullText: string): ParsedMd {
	const bodiesSection = sliceBetween(fullText, BODIES_BEGIN, BODIES_END);
	const manifestSection = sliceBetween(fullText, MANIFEST_BEGIN, MANIFEST_END);
	const bodies = bodiesSection === null ? [] : parseBodies(bodiesSection);
	const manifestResult = manifestSection === null ? { rows: [], parsed: false } : parseManifest(manifestSection);

	// no-change declarations: `no-change: <ID> — <reason>` or `no-change: <ID>: <reason>`.
	const noChangeIds = new Set<string>();
	const ncRe = /no-change:\s*([A-Za-z][A-Za-z0-9-]*-\d+)/gi;
	let m: RegExpExecArray | null;
	// biome-ignore lint/suspicious/noAssignInExpressions: canonical regex-exec loop
	while ((m = ncRe.exec(fullText)) !== null) {
		noChangeIds.add(m[1].toUpperCase());
	}

	// Operative text = the whole MD minus a clearly-delimited evidence/proof
	// appendix (so cited offending substrings in the proof appendix do not
	// trip the hedge scan). If no appendix delimiters exist, the whole MD is
	// operative.
	let operativeText = fullText;
	const appI = fullText.indexOf(APPENDIX_BEGIN);
	if (appI !== -1) {
		const appJ = fullText.indexOf(APPENDIX_END, appI + APPENDIX_BEGIN.length);
		const endIdx = appJ === -1 ? fullText.length : appJ + APPENDIX_END.length;
		operativeText = fullText.slice(0, appI) + fullText.slice(endIdx);
	}

	return {
		bodies,
		manifest: manifestResult.rows,
		manifestParsed: manifestResult.parsed,
		noChangeIds,
		operativeText,
		fullText,
	};
}

// ───────────────────────────── Checks ──────────────────────────────────────

// C2 — anchor leakage: filesystem paths or line refs inside a corrected body.
function checkC2(parsed: ParsedMd, violations: Violation[]): void {
	const anchorPatterns: { name: string; re: RegExp }[] = [
		{ name: "packages/ path", re: /\bpackages\/[^\s)`]+/ },
		{ name: ".ts filename", re: /[A-Za-z0-9._-]+\.ts\b/ },
		{ name: ".schema.json filename", re: /[A-Za-z0-9._-]+\.schema\.json\b/ },
		{ name: ".context dir", re: /(^|[^A-Za-z0-9_-])\.context\b/ },
		{ name: "/Users/ path", re: /\/Users\/[^\s)`]+/ },
		{ name: ":<line> ref", re: /[A-Za-z0-9_)\]]:\d+\b/ },
		{ name: "line-range", re: /\b\d+-\d+\b/ },
	];
	for (const b of parsed.bodies) {
		for (const p of anchorPatterns) {
			const mm = b.body.match(p.re);
			if (mm) {
				violations.push({
					id: `C2:${b.blockId}.${b.field}:${p.name}`,
					message: `C2 anchor leak in corrected body ${b.blockId} \`${b.field}\` — ${p.name}: matched "${mm[0]}". Bodies must be substrate-anchored prose, free of filesystem paths and line references.`,
				});
			}
		}
	}
}

// C5 — manifest bijection: corrected (BLOCK-ID, field) ↔ manifest (block-kind, field).
//
// A corrected body header names an item id (FEAT-001); a manifest row names the
// block KIND (features). To compare them the body id is resolved to its block
// kind via the substrate index. Each body therefore keys as `<block-kind>|<field>`;
// when the body id does not resolve (a convention slug, or a genuinely-unknown id)
// the raw id is used as the key AND an unresolved-id violation is raised so the
// mismatch is surfaced rather than silently keyed apart.
function checkC5(cwd: string, parsed: ParsedMd, violations: Violation[]): void {
	const bodyIds = parsed.bodies.map((b) => b.blockId);
	const resolved = resolveItemsByIds(cwd, bodyIds);
	const blockKindForBody = (id: string): string => {
		const loc = resolved.get(id) ?? null;
		if (loc !== null) return loc.block;
		// Unresolved id — surface it; key by the raw id so the bijection still flags.
		violations.push({
			id: `C5:unresolved-body-id:${id}`,
			message: `C5 bijection: corrected body id "${id}" does not resolve to a substrate item, so its block kind cannot be confirmed against the filing manifest.`,
		});
		return id;
	};
	const bodyKeys = new Map<string, number>();
	for (const b of parsed.bodies) {
		const k = `${blockKindForBody(b.blockId)}|${b.field}`;
		bodyKeys.set(k, (bodyKeys.get(k) ?? 0) + 1);
	}
	const manifestKeys = new Map<string, number>();
	for (const r of parsed.manifest) {
		const k = `${r.block}|${r.field}`;
		manifestKeys.set(k, (manifestKeys.get(k) ?? 0) + 1);
	}
	for (const [k, count] of bodyKeys) {
		const [blk, fld] = k.split("|");
		const mCount = manifestKeys.get(k) ?? 0;
		if (mCount === 0) {
			violations.push({
				id: `C5:body-orphan:${k}`,
				message: `C5 bijection: corrected body ${blk} \`${fld}\` has NO matching filing-manifest row.`,
			});
		} else if (mCount > 1) {
			violations.push({
				id: `C5:manifest-dup:${k}`,
				message: `C5 bijection: ${mCount} filing-manifest rows map to corrected body ${blk} \`${fld}\` (must be exactly one).`,
			});
		}
		if (count > 1) {
			violations.push({
				id: `C5:body-dup:${k}`,
				message: `C5 bijection: ${count} corrected bodies for ${blk} \`${fld}\` (must be exactly one).`,
			});
		}
	}
	for (const [k] of manifestKeys) {
		if (!bodyKeys.has(k)) {
			const [blk, fld] = k.split("|");
			violations.push({
				id: `C5:manifest-orphan:${k}`,
				message: `C5 bijection: filing-manifest row ${blk} -> ${fld} has NO matching corrected body.`,
			});
		}
	}
}

// C6 — cascade coverage: every block referenced by the task must be addressed
// as a corrected body OR an explicit no-change declaration.
function checkC6(cwd: string, taskId: string, parsed: ParsedMd, violations: Violation[]): void {
	let edges: ReturnType<typeof findReferencesInRepo>;
	try {
		edges = findReferencesInRepo(cwd, taskId, "both");
	} catch (err) {
		violations.push({
			id: "C6:findReferences-error",
			message: `C6 cascade: findReferencesInRepo failed for ${taskId} — ${err instanceof Error ? err.message : String(err)}`,
		});
		return;
	}
	const coveredAsBody = new Set(parsed.bodies.map((b) => b.blockId.toUpperCase()));
	// Only gap / decision / feature referenced ids require cascade coverage.
	const cascadeRe = /^(FGAP|DEC|FEAT)-\d+$/;
	const referenced = new Set<string>();
	for (const e of edges) {
		for (const ep of [e.parent, e.child]) {
			const ref = (ep as { refname?: string }).refname;
			if (typeof ref !== "string") continue;
			if (ref.toUpperCase() === taskId.toUpperCase()) continue;
			if (cascadeRe.test(ref.toUpperCase())) referenced.add(ref.toUpperCase());
		}
	}
	for (const ref of referenced) {
		if (!coveredAsBody.has(ref) && !parsed.noChangeIds.has(ref)) {
			violations.push({
				id: `C6:uncovered:${ref}`,
				message: `C6 cascade: ${ref} is referenced by ${taskId} but is neither a corrected body nor declared "no-change: ${ref} — <reason>".`,
			});
		}
	}
}

// Identifier resolution: every cited identifier token must resolve.
function checkIdentifiers(cwd: string, parsed: ParsedMd, violations: Violation[]): void {
	// Gather cited tokens from provenance bullets AND proof lines (lines that
	// begin with "Proof:" anywhere in the MD).
	const citationLines: string[] = [];
	for (const b of parsed.bodies) citationLines.push(...b.provenance);
	for (const line of parsed.fullText.split("\n")) {
		if (/^\s*Proof:/i.test(line)) citationLines.push(line);
	}

	// Token classes.
	const substrateIdRe = /\b((?:FGAP|DEC|TASK|FEAT|ISSUE|REQ|STORY|VER|RES|PHASE|MILE|REVIEW)-\d+)\b/g;
	const schemaRefRe = /\bblock:([a-z][a-z0-9-]*)\b/g; // block:<schema> references
	const schemaIdRe = /\bpi-context:\/\/schemas\/([a-z][a-z0-9-]*)\b/g;
	// backtick-quoted identifiers: relation_type / block name / function / type / schema name
	const backtickRe = /`([A-Za-z_][A-Za-z0-9_-]*)`/g;

	const cfg = loadConfig(cwd);
	const relationTypes = new Set((cfg?.relation_types ?? []).map((r) => r.canonical_id));
	const blockKinds = new Set((cfg?.block_kinds ?? []).map((b) => b.canonical_id));

	const substrateDir = resolveContextDir(cwd);
	const schemaIds = new Set<string>();
	const schemaNames = new Set<string>();
	const schemaDir = path.join(substrateDir, "schemas");
	if (fs.existsSync(schemaDir)) {
		for (const f of fs.readdirSync(schemaDir)) {
			if (!f.endsWith(".schema.json")) continue;
			schemaNames.add(f.replace(".schema.json", ""));
			try {
				const j = JSON.parse(fs.readFileSync(path.join(schemaDir, f), "utf-8")) as { $id?: string };
				if (typeof j.$id === "string") schemaIds.add(j.$id);
			} catch {
				/* unreadable schema — skip */
			}
		}
	}

	// Collect substrate-id tokens (resolve in bulk).
	const substrateIds = new Set<string>();
	for (const line of citationLines) {
		let m: RegExpExecArray | null;
		const re = new RegExp(substrateIdRe.source, "g");
		// biome-ignore lint/suspicious/noAssignInExpressions: canonical regex-exec loop
		while ((m = re.exec(line)) !== null) substrateIds.add(m[1]);
	}
	const resolved = resolveItemsByIds(cwd, [...substrateIds]);
	for (const [id, loc] of resolved) {
		if (loc === null) {
			violations.push({
				id: `ID:substrate:${id}`,
				message: `Identifier resolution: cited substrate id "${id}" does not resolve in the active substrate.`,
			});
		}
	}

	// Backtick-quoted identifiers — resolve against relation_types, block_kinds,
	// schema names, schema $ids, or source export/function/type/interface names.
	for (const line of citationLines) {
		// schema $id literals
		let sm: RegExpExecArray | null;
		const sidRe = new RegExp(schemaIdRe.source, "g");
		// biome-ignore lint/suspicious/noAssignInExpressions: canonical regex-exec loop
		while ((sm = sidRe.exec(line)) !== null) {
			const name = sm[1];
			if (!schemaNames.has(name) && !schemaIds.has(`pi-context://schemas/${name}`)) {
				violations.push({
					id: `ID:schema:${name}`,
					message: `Identifier resolution: cited schema "pi-context://schemas/${name}" has no matching schema file $id.`,
				});
			}
		}
		// block:<schema> references
		let bm: RegExpExecArray | null;
		const brefRe = new RegExp(schemaRefRe.source, "g");
		// biome-ignore lint/suspicious/noAssignInExpressions: canonical regex-exec loop
		while ((bm = brefRe.exec(line)) !== null) {
			const name = bm[1];
			if (!schemaNames.has(name)) {
				violations.push({
					id: `ID:block-ref:${name}`,
					message: `Identifier resolution: cited "block:${name}" has no matching schema file.`,
				});
			}
		}
		// generic backtick-quoted tokens
		let gm: RegExpExecArray | null;
		const gRe = new RegExp(backtickRe.source, "g");
		// biome-ignore lint/suspicious/noAssignInExpressions: canonical regex-exec loop
		while ((gm = gRe.exec(line)) !== null) {
			const tok = gm[1];
			if (resolveBacktickToken(tok, relationTypes, blockKinds, schemaNames, schemaIds, substrateDir, cwd)) continue;
			violations.push({
				id: `ID:token:${tok}`,
				message: `Identifier resolution: cited identifier \`${tok}\` resolves to no relation_type, block kind, schema, or exported source function/type.`,
			});
		}
	}
}

/** Resolve a single backtick token; true if it resolves to anything legitimate. */
function resolveBacktickToken(
	tok: string,
	relationTypes: Set<string>,
	blockKinds: Set<string>,
	schemaNames: Set<string>,
	schemaIds: Set<string>,
	_substrateDir: string,
	cwd: string,
): boolean {
	if (relationTypes.has(tok)) return true;
	if (blockKinds.has(tok)) return true;
	if (schemaNames.has(tok)) return true;
	if (schemaIds.has(`pi-context://schemas/${tok}`)) return true;
	// substrate-id-shaped tokens are handled by the substrate-id resolver; if a
	// backtick token is substrate-id-shaped, treat as already-handled.
	if (/^(?:FGAP|DEC|TASK|FEAT|ISSUE|REQ|STORY|VER|RES|PHASE|MILE|REVIEW)-\d+$/.test(tok)) return true;
	// source identifier — grep packages/*/src for an export/function/type/interface decl.
	return sourceSymbolExists(tok, cwd);
}

/** True if `name` is declared as an export/function/type/interface in packages/src. */
function sourceSymbolExists(name: string, cwd: string): boolean {
	// Guard: only treat plausible code identifiers as source symbols.
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return false;
	const patterns = [
		`export (async )?function ${name}\\b`,
		`export (const|let|var) ${name}\\b`,
		`export (class|interface|type|enum) ${name}\\b`,
		`(^|[^.])function ${name}\\b`,
		`(interface|type|class|enum) ${name}\\b`,
		`\\b${name}\\(`,
	].join("|");
	try {
		const out = execFileSync(
			"grep",
			["-rEl", patterns, "--include=*.ts", path.join(cwd, "packages")],
			{ encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
		);
		return out.trim().length > 0;
	} catch {
		// grep exits 1 (no match) → throw → not found.
		return false;
	}
}

// Hedge / punt scan — banned substrings in any corrected body or operative MD.
const HEDGE_PHRASES = [
	"out of scope",
	"as appropriate",
	"if needed",
	"todo",
	"cannot determine",
	"would need",
	"stop and report",
	"flag",
	"left as",
];

function checkHedges(parsed: ParsedMd, violations: Violation[]): void {
	const haystacks: { where: string; text: string }[] = [];
	for (const b of parsed.bodies) haystacks.push({ where: `corrected body ${b.blockId} \`${b.field}\``, text: b.body });
	haystacks.push({ where: "operative MD", text: parsed.operativeText });
	for (const h of haystacks) {
		const lc = h.text.toLowerCase();
		for (const phrase of HEDGE_PHRASES) {
			if (lc.includes(phrase)) {
				violations.push({
					id: `HEDGE:${h.where}:${phrase}`,
					message: `Hedge/punt scan: banned phrase "${phrase}" present in ${h.where}.`,
				});
			}
		}
	}
}

// Structural — non-empty fenced body + provenance per corrected body; manifest
// parses; at least one corrected body.
function checkStructural(parsed: ParsedMd, violations: Violation[]): void {
	if (parsed.bodies.length === 0) {
		violations.push({
			id: "STRUCT:no-bodies",
			message: "Structural: no corrected bodies found between the CORRECTED BODIES delimiters (at least one required).",
		});
	}
	for (const b of parsed.bodies) {
		if (b.body.trim() === "") {
			violations.push({
				id: `STRUCT:empty-body:${b.blockId}.${b.field}`,
				message: `Structural: corrected body ${b.blockId} \`${b.field}\` has an empty fenced block.`,
			});
		}
		if (b.provenance.length === 0) {
			violations.push({
				id: `STRUCT:no-provenance:${b.blockId}.${b.field}`,
				message: `Structural: corrected body ${b.blockId} \`${b.field}\` has no Provenance list.`,
			});
		}
	}
	if (!parsed.manifestParsed) {
		violations.push({
			id: "STRUCT:manifest-unparsed",
			message: "Structural: the filing manifest did not parse — each row must be `- <block> -> <field> -> <operation> -> <guard>`.",
		});
	}
}

// ───────────────────────────── Stall state ─────────────────────────────────

interface StallState {
	taskId: string;
	history: string[][]; // sorted violation-id sets, oldest→newest
}

function recordStall(cwd: string, taskId: string, violationIds: string[]): { stalled: boolean; persistent: string[] } {
	const dir = path.join(cwd, "tmp", "audit-loop-state");
	fs.mkdirSync(dir, { recursive: true });
	const file = path.join(dir, `${taskId}.json`);
	let state: StallState = { taskId, history: [] };
	if (fs.existsSync(file)) {
		try {
			state = JSON.parse(fs.readFileSync(file, "utf-8")) as StallState;
		} catch {
			state = { taskId, history: [] };
		}
	}
	const sorted = [...violationIds].sort();
	state.history.push(sorted);
	// Keep a bounded tail.
	if (state.history.length > 10) state.history = state.history.slice(-10);
	fs.writeFileSync(file, JSON.stringify(state, null, 2));

	// Stall = the last 3 sets are non-empty AND identical (no strict shrink).
	const h = state.history;
	if (sorted.length === 0 || h.length < 3) return { stalled: false, persistent: [] };
	const last3 = h.slice(-3);
	const key = JSON.stringify(last3[0]);
	const identical = last3.every((s) => JSON.stringify(s) === key) && last3[0].length > 0;
	return { stalled: identical, persistent: identical ? last3[0] : [] };
}

// ───────────────────────────── Ratification ────────────────────────────────

/**
 * Ratification gate (C1/C3/C4). Returns null when ratified, else a violation.
 *
 * Implementable rule (chosen for robustness): a `user`-role transcript message
 * whose text contains `RATIFY <TASK-ID> C1 C3 C4` (case-insensitive on the
 * keyword + criteria, exact on the task id), occurring at-or-after the audit
 * MD's last modification time. We anchor to the MD mtime rather than "the most
 * recent clean-pass assistant message" because the MD mtime is a filesystem
 * fact this checker can read deterministically without parsing assistant prose;
 * any edit to the corrected bodies bumps the mtime and invalidates a prior
 * ratification, which is the property we want (re-author ⇒ re-ratify).
 *
 * An assistant/agent-authored marker can NEVER satisfy this — only a
 * `user`-role transcript turn is consulted.
 */
function checkRatification(transcriptPath: string | null, taskId: string, mdMtimeMs: number): Violation | null {
	if (!transcriptPath || !fs.existsSync(transcriptPath)) {
		return {
			id: "RATIFY:no-transcript",
			message: `Awaiting user ratification of C1/C3/C4 (judgment criteria): no transcript available to verify a genuine "RATIFY ${taskId} C1 C3 C4" user turn.`,
		};
	}
	const grantRe = new RegExp(`RATIFY\\s+${escapeRe(taskId)}\\s+C1\\s+C3\\s+C4`, "i");
	let ratified = false;
	const raw = fs.readFileSync(transcriptPath, "utf-8");
	for (const line of raw.split("\n")) {
		const t = line.trim();
		if (t === "") continue;
		let rec: unknown;
		try {
			rec = JSON.parse(t);
		} catch {
			continue;
		}
		const role = extractRole(rec);
		if (role !== "user") continue;
		const ts = extractTimestampMs(rec);
		// Require the user turn to be at-or-after the MD's last modification.
		if (ts !== null && ts < mdMtimeMs) continue;
		const text = extractText(rec);
		if (grantRe.test(text)) {
			ratified = true;
			break;
		}
	}
	if (ratified) return null;
	return {
		id: "RATIFY:awaiting",
		message: `Awaiting user ratification of C1/C3/C4 (judgment criteria): no genuine user-role transcript turn containing "RATIFY ${taskId} C1 C3 C4" found dated at/after the audit MD's last modification.`,
	};
}

function escapeRe(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Extract the message role from a Claude Code transcript JSONL record. */
function extractRole(rec: unknown): string | null {
	if (!rec || typeof rec !== "object") return null;
	const r = rec as Record<string, unknown>;
	// Claude Code transcript: { type: "user"|"assistant", message: { role, content } }
	if (typeof r.type === "string" && (r.type === "user" || r.type === "assistant")) {
		// Prefer the inner message.role when present, else the top-level type.
		const msg = r.message as Record<string, unknown> | undefined;
		if (msg && typeof msg.role === "string") return msg.role;
		return r.type;
	}
	const msg = r.message as Record<string, unknown> | undefined;
	if (msg && typeof msg.role === "string") return msg.role;
	if (typeof r.role === "string") return r.role;
	return null;
}

/** Extract a millisecond timestamp from a transcript record, or null. */
function extractTimestampMs(rec: unknown): number | null {
	if (!rec || typeof rec !== "object") return null;
	const r = rec as Record<string, unknown>;
	const ts = r.timestamp;
	if (typeof ts === "string") {
		const ms = Date.parse(ts);
		return Number.isNaN(ms) ? null : ms;
	}
	if (typeof ts === "number") return ts;
	return null;
}

/** Flatten the text content of a transcript record (user or assistant). */
function extractText(rec: unknown): string {
	if (!rec || typeof rec !== "object") return "";
	const r = rec as Record<string, unknown>;
	const msg = (r.message as Record<string, unknown>) ?? r;
	const content = msg.content;
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		const parts: string[] = [];
		for (const part of content) {
			if (typeof part === "string") parts.push(part);
			else if (part && typeof part === "object") {
				const p = part as Record<string, unknown>;
				if (typeof p.text === "string") parts.push(p.text);
			}
		}
		return parts.join("\n");
	}
	return "";
}

// ───────────────────────── MD location (hook mode) ─────────────────────────

/**
 * Locate the in-flight task's audit MD under analysis/ by deriving the task id
 * from the most recent `analysis/<date>-audit-TASK-NNN-proposed-resolution.md`.
 * Returns { mdPath, taskId } or null.
 */
function locateAuditMd(cwd: string): { mdPath: string; taskId: string } | null {
	const analysisDir = path.join(cwd, "analysis");
	if (!fs.existsSync(analysisDir)) return null;
	const re = /^(\d{4}-\d{2}-\d{2})-audit-(TASK-\d+)-proposed-resolution\.md$/;
	let best: { mdPath: string; taskId: string; mtime: number } | null = null;
	for (const f of fs.readdirSync(analysisDir)) {
		const m = f.match(re);
		if (!m) continue;
		const full = path.join(analysisDir, f);
		const mtime = fs.statSync(full).mtimeMs;
		if (best === null || mtime > best.mtime) best = { mdPath: full, taskId: m[2], mtime };
	}
	return best ? { mdPath: best.mdPath, taskId: best.taskId } : null;
}

/** Derive the task id a given MD path is about. */
function taskIdFromMdPath(mdPath: string): string | null {
	const base = path.basename(mdPath);
	const m = base.match(/-(TASK-\d+)-proposed-resolution\.md$/);
	if (m) return m[1];
	// Fallback: any TASK-NNN in the filename.
	const m2 = base.match(/(TASK-\d+)/);
	return m2 ? m2[1] : null;
}

// ───────────────────────────── Main ────────────────────────────────────────

function readStdin(): string {
	try {
		return fs.readFileSync(0, "utf-8");
	} catch {
		return "";
	}
}

function fail(violations: Violation[], extraBlocks: string[] = []): never {
	const lines: string[] = [];
	lines.push(`audit-checker: ${violations.length} violation(s) — the audit-task-resolution loop CANNOT exit. Re-author and re-run.`);
	for (const v of violations) lines.push(`  • ${v.message}`);
	for (const block of extraBlocks) lines.push(block);
	process.stderr.write(`${lines.join("\n")}\n`);
	process.exit(2);
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	let cwd = process.cwd();
	let mdPath: string | null = args.md;
	let transcriptPath: string | null = args.transcript;

	if (mdPath === null) {
		// Hook mode — read stdin JSON.
		const stdin = readStdin();
		let payload: Record<string, unknown> = {};
		if (stdin.trim() !== "") {
			try {
				payload = JSON.parse(stdin) as Record<string, unknown>;
			} catch {
				/* malformed payload — fall through to cwd-based discovery */
			}
		}
		if (typeof payload.cwd === "string" && payload.cwd.length > 0) cwd = payload.cwd;
		if (typeof payload.transcript_path === "string") transcriptPath = payload.transcript_path;
		const located = locateAuditMd(cwd);
		if (located === null) {
			// No audit MD in flight → this Stop is not about an audit; allow exit.
			process.exit(0);
		}
		mdPath = located.mdPath;
	}

	if (!fs.existsSync(mdPath)) {
		fail([{ id: "MD:missing", message: `audit MD not found: ${mdPath}` }]);
	}

	const taskId = taskIdFromMdPath(mdPath);
	if (taskId === null) {
		fail([{ id: "MD:no-task-id", message: `cannot derive a TASK-NNN id from the audit MD filename: ${path.basename(mdPath)}` }]);
	}

	const fullText = fs.readFileSync(mdPath, "utf-8");
	const mdMtimeMs = fs.statSync(mdPath).mtimeMs;
	const parsed = parseMd(fullText);

	const violations: Violation[] = [];
	checkStructural(parsed, violations);
	checkC2(parsed, violations);
	checkC5(cwd, parsed, violations);
	checkC6(cwd, taskId, parsed, violations);
	checkIdentifiers(cwd, parsed, violations);
	checkHedges(parsed, violations);

	// Stall accounting — record this invocation's violation-id set.
	const stall = recordStall(cwd, taskId, violations.map((v) => v.id));

	if (violations.length > 0) {
		const extra: string[] = [];
		if (stall.stalled) {
			extra.push(
				[
					"",
					"╔══════════════════════ ESCALATE-TO-HUMAN ══════════════════════╗",
					`The same violation set has persisted across 3 consecutive checks for ${taskId}`,
					"with no strict shrink. The authoring agent is not converging.",
					"Surface these PERSISTENT violations to the user verbatim and request direction;",
					"the loop RE-ENTERS (it does not abort):",
					...stall.persistent.map((id) => `  - ${id}`),
					"╚════════════════════════════════════════════════════════════════╝",
				].join("\n"),
			);
		}
		fail(violations, extra);
	}

	// All deterministic checks clean — now the ratification gate (C1/C3/C4).
	const ratifyViolation = checkRatification(transcriptPath, taskId, mdMtimeMs);
	if (ratifyViolation !== null) {
		fail([ratifyViolation]);
	}

	// Clean + ratified → the loop may exit.
	process.exit(0);
}

main();

/*
 * ════════════════════════════ MD CONTRACT ════════════════════════════════
 * The `audit-task-resolution` skill MUST emit its proposed-resolution audit MD
 * at analysis/<YYYY-MM-DD>-audit-<TASK-ID>-proposed-resolution.md conforming to
 * the following machine-parseable contract (this checker is the authority):
 *
 * 1. CORRECTED BODIES — between the exact markers:
 *      <!-- BEGIN CORRECTED BODIES -->
 *      ... entries ...
 *      <!-- END CORRECTED BODIES -->
 *    Each entry is, in order:
 *      a) a header line: `### <BLOCK-ID> — \`<field>\``
 *         (em-dash U+2014 separator; <field> in backticks; BLOCK-ID like
 *          FGAP-002 / DEC-0002 / FEAT-001, or a convention slug).
 *      b) exactly one fenced code block (``` … ```) — the corrected body text.
 *         The body MUST be non-empty and substrate-anchored: NO filesystem
 *         paths (packages/…, *.ts, *.schema.json, .context, /Users/…) and NO
 *         line references (`:<n>` or `<n>-<n>`). (C2)
 *      c) a line `Provenance:` followed by one-or-more bullets:
 *         `- <element> — <VERBATIM|DIRECTED|DERIVABLE>: <evidence/citation>`
 *
 * 2. FILING MANIFEST — between the exact markers:
 *      <!-- BEGIN FILING MANIFEST -->
 *      - <block> -> <field> -> <operation> -> <guard>
 *      ...
 *      <!-- END FILING MANIFEST -->
 *    Exactly one row per corrected (BLOCK-ID, field) and vice-versa (C5
 *    bijection). Four `->`-separated non-empty cells per row.
 *
 * 3. CASCADE COVERAGE (C6) — every FGAP-/DEC-/FEAT- id that
 *    findReferencesInRepo(cwd, <TASK-ID>, "both") reports as referenced by the
 *    task MUST appear EITHER as a corrected-body BLOCK-ID OR as an explicit
 *    line `no-change: <ID> — <reason>` anywhere in the MD.
 *
 * 4. IDENTIFIER RESOLUTION — every identifier token cited in a Provenance
 *    bullet or a `Proof:` line must resolve:
 *      - substrate ids (TASK-/DEC-/FGAP-/FEAT-/…-NNN) via resolveItemsByIds
 *      - `block:<name>` references → a schemas/<name>.schema.json file
 *      - `pi-context://schemas/<name>` → a schema file with that $id
 *      - backtick-quoted tokens → a relation_type / block kind / schema name /
 *        schema $id / exported source function|type|interface in the packages src trees
 *
 * 5. HEDGE/PUNT — none of: "out of scope", "as appropriate", "if needed",
 *    "TODO", "cannot determine", "would need", "stop and report", "flag",
 *    "left as" — anywhere in a corrected body OR in operative MD text. A
 *    clearly-delimited evidence/proof appendix may be excluded from the
 *    operative-text hedge scan using:
 *      <!-- BEGIN EVIDENCE APPENDIX -->  …  <!-- END EVIDENCE APPENDIX -->
 *    (corrected bodies are NEVER exempt.)
 *
 * 6. RATIFICATION (C1/C3/C4) — after the deterministic checks pass, the loop
 *    exits only once a genuine `user`-role transcript turn contains
 *    `RATIFY <TASK-ID> C1 C3 C4`, dated at/after the audit MD's last
 *    modification time. An assistant/agent-authored marker never satisfies it.
 * ══════════════════════════════════════════════════════════════════════════
 */
