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
 *      Checks the named MD (ungated).
 *   2. Hook mode (no --md) — reads a SubagentStop-hook stdin JSON payload
 *      ({ transcript_path, cwd, ... }). The audit runs as a dispatched SUBAGENT;
 *      this hook fires when a subagent ends and gates on the ACTIVE SENTINEL's
 *      task(s): for each `tmp/audit-loop-state/active-<TASK-ID>`, that task's audit
 *      MD (analysis/<date>-audit-<TASK-ID>-proposed-resolution.md) must be present
 *      and machine-clean (C2/C5/C6/identifier/hedge/structural). A missing or
 *      unclean MD BLOCKS (a lazy subagent that produced nothing cannot escape). On
 *      machine-clean the sentinel is cleared so the subagent can exit; exit 0 only
 *      when EVERY active task is cleared. The hook does NOT gate on ratification —
 *      C1/C3/C4 are the human's grant in the MAIN conversation, surfaced by the
 *      audit-critic after a clean run; the subagent's own transcript can never carry
 *      it, so coupling it here would trap the subagent. The sentinel is established at
 *      INVOCATION by the UserPromptSubmit hook (audit-sentinel-engage.sh), before the
 *      authoring subagent runs — the agent never creates or owns it.
 *
 * Exit semantics (SubagentStop-hook convention): exit 2 BLOCKS the subagent from
 * ending and feeds stderr back to it; exit 0 lets it end. NO Stop hook is wired, so
 * the orchestrator's own turns are never gated and the project pays no per-turn tax.
 * The script is idempotent — it recomputes every invocation and owns its own stall
 * logic (there is no framework block-cap and no stop_hook_active dependency).
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
import { ops } from "@davidorex/pi-context/ops";

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
	proposedSymbols: Set<string>; // code-shaped tokens declared via `Proposed-symbols:` lines (greenfield exemptions)
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

	// Proposed-symbols declarations: `Proposed-symbols: <tok>, <tok>, ...` — the
	// comma-separated code-shaped tokens the audit proposes to CREATE (greenfield),
	// which correctly do not resolve yet. Each listed token is exempt from
	// identifier resolution. Multiple lines accumulate.
	const proposedSymbols = new Set<string>();
	for (const line of fullText.split("\n")) {
		const pm = line.match(/^\s*Proposed-symbols:\s*(.+)$/i);
		if (!pm) continue;
		for (const raw of pm[1].split(",")) {
			const tok = raw.trim().replace(/^`|`$/g, ""); // tolerate stray backticks
			if (tok !== "") proposedSymbols.add(tok);
		}
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
		proposedSymbols,
		operativeText,
		fullText,
	};
}

// ───────────────────────────── Checks ──────────────────────────────────────

// C2 — anchor leakage: filesystem paths or line refs inside a corrected body.
function checkC2(parsed: ParsedMd, violations: Violation[]): void {
	// Genuine source-location anchors only. A line reference (`:<n>` or a
	// `<n>-<n>` range) flags ONLY when it is tied to a file/source token — a
	// filename (`name.ext`) or a path segment. A BARE numeric range or `:<n>` in
	// prose ("Node 22-23", "exit codes 0-2", "items 3-5", "v4.8") carries no
	// source context and is NOT an anchor, so it must not flag. Word-boundary /
	// context aware, the same precision standard as the hedge scan.
	const anchorPatterns: { name: string; re: RegExp }[] = [
		{ name: "packages/ path", re: /\bpackages\/[^\s)`]+/ },
		{ name: ".ts filename", re: /[A-Za-z0-9._-]+\.ts\b/ },
		{ name: ".schema.json filename", re: /[A-Za-z0-9._-]+\.schema\.json\b/ },
		{ name: ".context dir", re: /(^|[^A-Za-z0-9_-])\.context\b/ },
		{ name: "/Users/ path", re: /\/Users\/[^\s)`]+/ },
		// file/source line ref: a filename or path segment immediately followed by
		// `:<line>`, optionally extended to a `<line>-<line>` range (e.g.
		// `context-sdk.ts:1685`, `context-sdk.ts:1685-1690`, `src/foo:1685`).
		{ name: "file:line ref", re: /(?:[A-Za-z0-9._-]*\.[A-Za-z0-9]+|[A-Za-z0-9._-]*\/[A-Za-z0-9._-]+):\d+(?:-\d+)?\b/ },
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

// Resolution context: every vocabulary the identifier checks resolve against,
// loaded once per MD evaluation and threaded through the shared resolver so the
// backtick path and the shape-based path agree token-for-token.
interface ResolveCtx {
	relationTypes: Set<string>;
	blockKinds: Set<string>;
	schemaNames: Set<string>;
	schemaIds: Set<string>;
	opNames: Set<string>; // ops-registry op `name`s (e.g. promote-item)
	conventionSlugs: Set<string>; // conventions-block item ids/slugs (e.g. cli-command-form)
	cwd: string;
}

function buildResolveCtx(cwd: string): ResolveCtx {
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

	// Op names — the names registered in the pi-context ops registry. A token that
	// equals a registered op `name` resolves (legitimate citation of an op surface).
	const opNames = new Set(ops.map((o) => o.name));

	// Convention slugs — the ids of items in the substrate `conventions` block
	// (array_key `rules`, id field `id`; e.g. cli-command-form). Read through the
	// SDK-resolved contextDir, not the pi-context CLI. Absent/unreadable block →
	// empty set (a convention-slug citation then false-fails, surfacing the gap,
	// rather than silently passing).
	const conventionSlugs = new Set<string>();
	const conventionsFile = path.join(substrateDir, "conventions.json");
	if (fs.existsSync(conventionsFile)) {
		try {
			const j = JSON.parse(fs.readFileSync(conventionsFile, "utf-8")) as { rules?: { id?: string }[] };
			for (const r of j.rules ?? []) {
				if (typeof r.id === "string") conventionSlugs.add(r.id);
			}
		} catch {
			/* unreadable conventions block — leave empty */
		}
	}

	return { relationTypes, blockKinds, schemaNames, schemaIds, opNames, conventionSlugs, cwd };
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
	// Code-SHAPE tokens (detected with or without backticks) — these shapes are
	// essentially never English prose:
	//   camelCase: lower-run, then an uppercase, then more (e.g. cloneSubstrate).
	//   snake_case: lower-run, an underscore, then more (e.g. substrate_id_unregistered).
	const camelRe = /\b[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*\b/g;
	const snakeRe = /\b[a-z][a-z0-9]*_[a-z0-9_]+\b/g;

	const rc = buildResolveCtx(cwd);

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

	// Tokens already reported as unresolved (de-dup across the backtick path and the
	// two shape paths, which can match the same token).
	const reportedUnresolved = new Set<string>();
	const flagUnresolved = (tok: string): void => {
		if (parsed.proposedSymbols.has(tok)) return; // declared greenfield — exempt
		if (resolveCitedToken(tok, rc)) return;
		if (reportedUnresolved.has(tok)) return;
		reportedUnresolved.add(tok);
		violations.push({
			id: `ID:token:${tok}`,
			message: `Identifier resolution: cited identifier \`${tok}\` resolves to no relation_type, block kind, schema, op name, error-code literal, convention slug, or declared source symbol — and is not declared in a "Proposed-symbols:" line.`,
		});
	};

	for (const line of citationLines) {
		// schema $id literals
		let sm: RegExpExecArray | null;
		const sidRe = new RegExp(schemaIdRe.source, "g");
		// biome-ignore lint/suspicious/noAssignInExpressions: canonical regex-exec loop
		while ((sm = sidRe.exec(line)) !== null) {
			const name = sm[1];
			if (!rc.schemaNames.has(name) && !rc.schemaIds.has(`pi-context://schemas/${name}`)) {
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
			if (!rc.schemaNames.has(name)) {
				violations.push({
					id: `ID:block-ref:${name}`,
					message: `Identifier resolution: cited "block:${name}" has no matching schema file.`,
				});
			}
		}
		// generic backtick-quoted tokens — keeps single-word lowercase tokens (e.g.
		// `consequences`) covered, which the code-shape rules below do not match.
		let gm: RegExpExecArray | null;
		const gRe = new RegExp(backtickRe.source, "g");
		// biome-ignore lint/suspicious/noAssignInExpressions: canonical regex-exec loop
		while ((gm = gRe.exec(line)) !== null) flagUnresolved(gm[1]);
		// code-SHAPE tokens — caught whether or not backticked, so stripping the
		// backticks off a code identifier no longer hides it from resolution.
		let cm: RegExpExecArray | null;
		const cRe = new RegExp(camelRe.source, "g");
		// biome-ignore lint/suspicious/noAssignInExpressions: canonical regex-exec loop
		while ((cm = cRe.exec(line)) !== null) flagUnresolved(cm[0]);
		let snm: RegExpExecArray | null;
		const snRe = new RegExp(snakeRe.source, "g");
		// biome-ignore lint/suspicious/noAssignInExpressions: canonical regex-exec loop
		while ((snm = snRe.exec(line)) !== null) flagUnresolved(snm[0]);
	}
}

/** Resolve a single cited token; true if it resolves to anything legitimate. */
function resolveCitedToken(tok: string, rc: ResolveCtx): boolean {
	if (rc.relationTypes.has(tok)) return true;
	if (rc.blockKinds.has(tok)) return true;
	if (rc.schemaNames.has(tok)) return true;
	if (rc.schemaIds.has(`pi-context://schemas/${tok}`)) return true;
	if (rc.opNames.has(tok)) return true;
	if (rc.conventionSlugs.has(tok)) return true;
	// substrate-id-shaped tokens are handled by the substrate-id resolver; if a
	// token is substrate-id-shaped, treat as already-handled.
	if (/^(?:FGAP|DEC|TASK|FEAT|ISSUE|REQ|STORY|VER|RES|PHASE|MILE|REVIEW)-\d+$/.test(tok)) return true;
	// error-code string literal — a snake_case code emitted as a quoted literal in
	// source (e.g. "substrate_id_unregistered").
	if (tok.includes("_") && quotedLiteralExists(tok, rc.cwd)) return true;
	// source identifier — grep packages/*/src for an export/function/type/interface decl.
	return sourceSymbolExists(tok, rc.cwd);
}

/**
 * True if `name` appears as a double-quoted string literal anywhere in packages/src
 * (an error-code emission such as `return { code: "substrate_id_unregistered" }`).
 * Quoted-literal occurrence only — a bare token is NOT enough; the quotes are the
 * signal it is an emitted code, not an incidental word.
 */
function quotedLiteralExists(name: string, cwd: string): boolean {
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return false;
	try {
		const out = execFileSync(
			"grep",
			["-rlE", `"${name}"`, "--include=*.ts", path.join(cwd, "packages")],
			{ encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
		);
		return out.trim().length > 0;
	} catch {
		// grep exits 1 (no match) → throw → not found.
		return false;
	}
}

/**
 * True if `name` is DECLARED (not merely called) in packages/src. Declaration
 * patterns only — an incidental call-site (`name(`) must NOT resolve, or a lazy
 * audit could cite an invented-but-plausible name that happens to appear as a
 * call somewhere and pass. A real exported symbol still resolves via its
 * declaration form.
 */

/**
 * True if `name` is DECLARED (not merely called) in packages/src. Declaration
 * patterns only — an incidental call-site (`name(`) must NOT resolve, or a lazy
 * audit could cite an invented-but-plausible name that happens to appear as a
 * call somewhere and pass. A real exported symbol still resolves via its
 * declaration form.
 */
function sourceSymbolExists(name: string, cwd: string): boolean {
	// Guard: only treat plausible code identifiers as source symbols.
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return false;
	const patterns = [
		// exported declarations
		`export (async )?function ${name}\\b`,
		`export (const|let|var) ${name}\\b`,
		`export (abstract )?(class|interface|type|enum) ${name}\\b`,
		`export default (async )?(function |class )?${name}\\b`,
		`export \\{[^}]*\\b${name}\\b[^}]*\\}`, // re-export / named export list
		// non-exported declarations (still real symbols, not call-sites)
		`(^|[^.\\w])function ${name}\\b`,
		`(^|[^.\\w])(abstract )?(class|interface|type|enum) ${name}\\b`,
		`(^|[^.\\w])(const|let|var) ${name}\\s*=`,
		// member method/property DECLARATION with a body or type — the `{`/`:` after
		// the parameter list (or a typed property) distinguishes a declaration from a
		// free call. A bare `name(args)` call has neither and does NOT match.
		`^\\s+(async |readonly |static |public |private |protected |get |set )*${name}\\s*\\([^)]*\\)\\s*[:{]`,
		`^\\s+(readonly |static |public |private |protected )+${name}\\s*[:=]`,
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

// Hedge / punt scan — banned hedge phrases in any corrected body or operative MD.
//
// Word-boundary / context aware: a naive substring scan false-rejects genuine content
// (a body auditing a CLI `--flag`, the word "todo" inside "todos", etc.). Each phrase
// carries a regex with word boundaries; `flag` additionally excludes its CLI sense
// (a leading `-`/`--`, or the token enclosed in backticks) so real hedging ("we flag
// this", "flag for later") is still caught while `--flag` / `` `flag` `` is not.
const HEDGE_PHRASES: { phrase: string; re: RegExp }[] = [
	{ phrase: "out of scope", re: /\bout of scope\b/i },
	{ phrase: "as appropriate", re: /\bas appropriate\b/i },
	{ phrase: "if needed", re: /\bif needed\b/i },
	{ phrase: "todo", re: /\btodo\b/i },
	{ phrase: "cannot determine", re: /\bcannot determine\b/i },
	{ phrase: "would need", re: /\bwould need\b/i },
	{ phrase: "stop and report", re: /\bstop and report\b/i },
	// `flag` as a hedge verb/noun, but NOT `--flag`, `-flag`, or backtick-quoted `flag`.
	{ phrase: "flag", re: /(?<![-`\w])flags?(?!`)\b/i },
	{ phrase: "left as", re: /\bleft as\b/i },
];

function checkHedges(parsed: ParsedMd, violations: Violation[]): void {
	const haystacks: { where: string; text: string }[] = [];
	for (const b of parsed.bodies) haystacks.push({ where: `corrected body ${b.blockId} \`${b.field}\``, text: b.body });
	haystacks.push({ where: "operative MD", text: parsed.operativeText });
	for (const h of haystacks) {
		for (const { phrase, re } of HEDGE_PHRASES) {
			if (re.test(h.text)) {
				violations.push({
					id: `HEDGE:${h.where}:${phrase}`,
					message: `Hedge/punt scan: banned hedge phrase "${phrase}" present in ${h.where}.`,
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
 * A genuine user grant for this task: a `user`-role transcript turn that (a) names
 * the task id and (b) carries an approve/ratify/looks-good intent. Natural language —
 * the human does not type an exact incantation. Recognition is intentionally lenient on
 * wording; the unforgeable property is structural and kept: ONLY a `user`-role turn is
 * consulted, so an assistant/agent-authored line can never satisfy it.
 */
function checkRatification(transcriptPath: string | null, taskId: string): Violation | null {
	if (!transcriptPath || !fs.existsSync(transcriptPath)) {
		return {
			id: "RATIFY:no-transcript",
			message: `Awaiting user ratification of C1/C3/C4 (judgment criteria): no transcript available to verify a genuine user approval turn for ${taskId}.`,
		};
	}
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
		// Unforgeable: only a user-role turn counts (assistant/agent lines never do).
		if (extractRole(rec) !== "user") continue;
		const text = extractText(rec);
		if (userTurnGrantsRatification(text, taskId)) return null;
	}
	return {
		id: "RATIFY:awaiting",
		message: `Awaiting user ratification of C1/C3/C4 (judgment criteria): no genuine user-role transcript turn that names ${taskId} and grants approval (approve / ratify / looks good / lgtm / sign off) was found.`,
	};
}

/**
 * Natural-language recognition of a user ratification grant for `taskId`: the turn must
 * name the task AND express an approve/ratify intent. Both conditions in the same user
 * turn (a turn that mentions the task without approving, or approves without naming the
 * task, does not grant).
 */
function userTurnGrantsRatification(text: string, taskId: string): boolean {
	if (!new RegExp(`\\b${escapeRe(taskId)}\\b`, "i").test(text)) return false;
	const approveRe = /\b(ratif(?:y|ied|ies)|approve[ds]?|approval|sign(?:ed)?[ -]?off|looks? good|lgtm|ship it|good to go)\b/i;
	return approveRe.test(text);
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

// ───────────────────────── Sentinel-driven gating (hook mode) ──────────────

const SENTINEL_DIR = path.join("tmp", "audit-loop-state");

/**
 * Canonical task id: `TASK-` + the digit run zero-padded to a MINIMUM width of 3
 * (4 -> TASK-004, 21 -> TASK-021, 100 -> TASK-100, 1000 -> TASK-1000). Accepts a
 * `TASK-`/`task-`-prefixed or bare digit run; returns null when no digit run is found.
 * Id derivation is case-insensitive and tolerant so a stray lowercase sentinel or MD
 * still resolves to its canonical id rather than silently disengaging the gate.
 */
function canonicalTaskId(raw: string): string | null {
	const m = raw.match(/(\d+)/);
	if (!m) return null;
	const n = Number.parseInt(m[1], 10);
	if (!Number.isFinite(n)) return null;
	return `TASK-${String(n).padStart(3, "0")}`;
}

/** Active sentinel task ids — derived from `tmp/audit-loop-state/active-<TASK-ID>` filenames. */
function activeSentinelTaskIds(cwd: string): string[] {
	const dir = path.join(cwd, SENTINEL_DIR);
	if (!fs.existsSync(dir)) return [];
	const ids = new Set<string>();
	for (const f of fs.readdirSync(dir)) {
		// Tolerant: `active-TASK-NNN` / `active-task-NNN` (any case), normalized to canonical.
		const m = f.match(/^active-(?:task-)?0*(\d+)$/i);
		if (m) {
			const id = canonicalTaskId(m[1]);
			if (id) ids.add(id);
		}
	}
	return [...ids];
}

/**
 * The audit MD path a sentinel task gates on. Match is case-insensitive and
 * digit-tolerant: any `<date>-audit-task-<digits>-proposed-resolution.md` whose
 * canonical id equals `taskId` qualifies, so a lowercase or differently-padded MD
 * filename still satisfies a canonical sentinel.
 */
function auditMdPathForTask(cwd: string, taskId: string): string | null {
	const analysisDir = path.join(cwd, "analysis");
	if (!fs.existsSync(analysisDir)) return null;
	const canonical = canonicalTaskId(taskId);
	const re = /^\d{4}-\d{2}-\d{2}-audit-task-0*(\d+)-proposed-resolution\.md$/i;
	for (const f of fs.readdirSync(analysisDir)) {
		const m = f.match(re);
		if (m && canonicalTaskId(m[1]) === canonical) return path.join(analysisDir, f);
	}
	return null;
}

/**
 * Remove a task's active sentinel (called on clean+ratified release). Tolerant of
 * case/padding: any `active-<...>` file whose canonical id equals `taskId` is removed,
 * so a lowercase or differently-padded sentinel is still cleared rather than orphaned
 * (which would leave the gate engaged forever).
 */
function clearSentinel(cwd: string, taskId: string): void {
	const dir = path.join(cwd, SENTINEL_DIR);
	const canonical = canonicalTaskId(taskId);
	try {
		if (!fs.existsSync(dir)) return;
		for (const f of fs.readdirSync(dir)) {
			const m = f.match(/^active-(?:task-)?0*(\d+)$/i);
			if (!m) continue;
			if (canonicalTaskId(m[1]) !== canonical) continue;
			try {
				fs.unlinkSync(path.join(dir, f));
			} catch {
				/* best-effort */
			}
		}
	} catch {
		/* best-effort */
	}
}

/** Derive the canonical task id a given MD path is about (case-insensitive, tolerant). */
function taskIdFromMdPath(mdPath: string): string | null {
	const base = path.basename(mdPath);
	const m = base.match(/-task-0*(\d+)-proposed-resolution\.md$/i);
	if (m) return canonicalTaskId(m[1]);
	// Fallback: any TASK-NNN (any case) in the filename.
	const m2 = base.match(/task-0*(\d+)/i);
	return m2 ? canonicalTaskId(m2[1]) : null;
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

		// FIRST check in hook mode: the sentinel gate. No active audit run → exit 0
		// immediately, before any heavy logic, so this Stop hook never blocks an
		// unrelated turn-end. From here on a sentinel IS active, so any unexpected
		// internal error fails CLOSED (exit 2) rather than letting a broken run exit;
		// without an active sentinel the early return below already failed OPEN.
		const activeTasks = activeSentinelTaskIds(cwd);
		if (activeTasks.length === 0) {
			process.exit(0);
		}
		try {
			runHookChecks(cwd, activeTasks, transcriptPath);
		} catch (err) {
			fail([
				{
					id: "INTERNAL:checker-error",
					message: `audit-checker internal error during an active run (failing CLOSED): ${err instanceof Error ? err.message : String(err)}`,
				},
			]);
		}
		// runHookChecks always exits (0 when every active task is clean+ratified,
		// 2 on block). Defensive:
		process.exit(0);
	}

	// CLI / fixture mode (--md given) — run directly against the named MD, no sentinel
	// gate. Exercises the ratification gate too (requireRatification=true) so fixtures
	// can prove it. Exits 0 on clean (+ratified), 2 on any violation.
	const result = evaluateMd(cwd, mdPath, transcriptPath, true);
	if (result.violations.length > 0) fail(result.violations, result.extra);
	process.exit(0);
}

/**
 * Hook-mode body: gate on the SENTINEL's task(s), not "the most recent analysis MD".
 * For each active task: BLOCK if its audit MD is absent, unclean, or unratified. A task
 * that is clean+ratified has its sentinel cleared. Exit 0 only when EVERY active task is
 * clean+ratified (so every sentinel is cleared); else exit 2 with the aggregate violations.
 * Reached only when at least one sentinel is active; errors fail CLOSED via main's catch.
 */
function runHookChecks(cwd: string, activeTasks: string[], transcriptPath: string | null): never {
	const allViolations: Violation[] = [];
	const allExtra: string[] = [];
	for (const taskId of activeTasks) {
		const mdPath = auditMdPathForTask(cwd, taskId);
		if (mdPath === null) {
			// Sentinel active but no audit MD on disk → a lazy agent that produced
			// nothing then stops must NOT escape: this BLOCKS.
			allViolations.push({
				id: `MD:missing:${taskId}`,
				message: `audit MD for ${taskId} not found under analysis/ (expected analysis/<date>-audit-${taskId}-proposed-resolution.md) — the loop cannot exit with no audit produced.`,
			});
			continue;
		}
		const result = evaluateMd(cwd, mdPath, transcriptPath, false);
		if (result.violations.length > 0) {
			allViolations.push(...result.violations);
			allExtra.push(...result.extra);
		} else {
			// This task's MD is machine-clean → the authoring subagent has produced a
			// conformant audit; release the sentinel so it can exit. Human ratification
			// of C1/C3/C4 is the orchestrator-routed step in the main conversation.
			clearSentinel(cwd, taskId);
		}
	}
	if (allViolations.length > 0) fail(allViolations, allExtra);
	process.exit(0);
}

/**
 * Evaluate a named MD: run the full deterministic check set plus the ratification gate,
 * returning the accumulated violations (empty ⇒ clean + ratified). Does NOT exit — callers
 * decide (CLI mode exits directly; hook mode aggregates across active sentinels first).
 */
function evaluateMd(
	cwd: string,
	mdPath: string,
	transcriptPath: string | null,
	requireRatification: boolean,
): { violations: Violation[]; extra: string[] } {
	if (!fs.existsSync(mdPath)) {
		return { violations: [{ id: "MD:missing", message: `audit MD not found: ${mdPath}` }], extra: [] };
	}

	const taskId = taskIdFromMdPath(mdPath);
	if (taskId === null) {
		return {
			violations: [{ id: "MD:no-task-id", message: `cannot derive a TASK-NNN id from the audit MD filename: ${path.basename(mdPath)}` }],
			extra: [],
		};
	}

	const fullText = fs.readFileSync(mdPath, "utf-8");
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

	const extra: string[] = [];
	if (violations.length > 0) {
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
		return { violations, extra };
	}

	// Deterministic checks clean. Ratification (C1/C3/C4) is the human's grant and
	// lives in the MAIN conversation transcript, not the audit subagent's — so the
	// SubagentStop hook path does NOT gate on it (requireRatification=false): coupling
	// it there would trap the subagent forever, since its own transcript can never
	// carry the user's grant. The audit subagent exits once its MD is machine-clean;
	// the orchestrator then routes the audit-critic verdict to the user for ratification.
	// --md / fixture mode keeps the ratification gate to exercise it under test.
	if (requireRatification) {
		const ratifyViolation = checkRatification(transcriptPath, taskId);
		if (ratifyViolation !== null) return { violations: [ratifyViolation], extra };
	}

	// Clean (and ratified when required).
	return { violations: [], extra };
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
 *         file-tied line references (a `:<n>` or `<n>-<n>` range attached to a
 *         filename or path segment, e.g. `context-sdk.ts:1685`). A bare numeric
 *         range or `:<n>` in prose with NO file/source context ("Node 22-23",
 *         "exit codes 0-2", "items 3-5", "v4.8") is NOT an anchor and is
 *         permitted. (C2)
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
 *    bullet or a `Proof:` line must resolve. Two detection paths run over each
 *    citation line:
 *      a) BACKTICK path — every `` `token` `` (covers single-word lowercase
 *         tokens like `consequences` that the shape rules below do not catch).
 *      b) CODE-SHAPE path — every token matching a code shape, WHETHER OR NOT
 *         backticked (so stripping the backticks no longer hides it):
 *           - camelCase: a lower-run then an uppercase then more (e.g. cloneSubstrate)
 *           - snake_case: a lower-run then an underscore then more (e.g. substrate_id_unregistered)
 *         These shapes are essentially never English prose.
 *    A detected token resolves if it is ANY of:
 *      - a substrate id (TASK-/DEC-/FGAP-/FEAT-/…-NNN) via resolveItemsByIds
 *      - `block:<name>` → a schemas/<name>.schema.json file
 *      - `pi-context://schemas/<name>` → a schema file with that $id
 *      - a relation_type / block kind / schema name / schema $id
 *      - a registered ops-registry op `name` (e.g. promote-item)
 *      - an error-code string literal: a snake_case token that occurs as a
 *        double-quoted "<token>" in packages/*.ts (e.g. substrate_id_unregistered)
 *      - a conventions-block item id/slug (e.g. cli-command-form)
 *      - a source symbol DECLARED in the packages src trees (export / function /
 *        class / interface / type / const|let|var / member method|property
 *        declaration — NOT an incidental call-site)
 *      - DECLARED as greenfield in a `Proposed-symbols:` line (see 4a below).
 *
 * 4a. PROPOSED-SYMBOLS (greenfield exemption) — a code-shaped token the audit
 *    proposes to CREATE (which correctly does not resolve yet) must be declared
 *    on a single MD line:
 *      Proposed-symbols: <tok>, <tok>, ...
 *    (comma-separated; multiple lines accumulate; stray backticks tolerated).
 *    Exactly the listed tokens are exempted from resolution. A code-shaped token
 *    that neither resolves nor appears in a Proposed-symbols set is a violation.
 *
 * 5. HEDGE/PUNT — none of the hedge phrases ("out of scope", "as appropriate",
 *    "if needed", "TODO", "cannot determine", "would need", "stop and report",
 *    "flag", "left as") anywhere in a corrected body OR in operative MD text.
 *    Matching is word-boundary / context aware: `flag` in a CLI sense (`--flag`,
 *    `` `flag` ``) is NOT a hedge; "flag this for later" is. A
 *    clearly-delimited evidence/proof appendix may be excluded from the
 *    operative-text hedge scan using:
 *      <!-- BEGIN EVIDENCE APPENDIX -->  …  <!-- END EVIDENCE APPENDIX -->
 *    (corrected bodies are NEVER exempt.)
 *
 * 6. RATIFICATION (C1/C3/C4) — after the deterministic checks pass, the loop
 *    exits only once a genuine `user`-role transcript turn names <TASK-ID> AND
 *    grants approval (natural language: ratify / approve / looks good / lgtm /
 *    sign off / ship it / good to go). An assistant/agent-authored marker never
 *    satisfies it — only a `user`-role turn is consulted.
 * ══════════════════════════════════════════════════════════════════════════
 */
