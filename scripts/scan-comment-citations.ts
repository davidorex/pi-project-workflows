#!/usr/bin/env -S npx tsx
/**
 * scan-comment-citations — informational enumerator of canonical_id-shaped
 * citations (FGAP-NNN / DEC-NNNN / FEAT-NNN / TASK-NNN / etc.) found inside
 * TypeScript COMMENTS (JSDoc blocks, block comments, line comments) across the
 * monorepo's package src/ trees.
 *
 * TASK-107. Distinct in aim from packages/pi-context/src/citation-rot-scanner.ts:
 * that scanner enumerates citation-shaped strings on SHIPPED/operator-facing
 * surfaces (tool-registration description literals, error messages, JSON/MD/YAML
 * bodies) and deliberately does NOT walk comment trivia as a citation surface.
 * This script inverts that: it walks ONLY comment trivia (via the TS scanner,
 * skipTrivia=false) to answer a different question — which comments reference
 * which canonical_ids, and where — for cross-checking a substrate item's cited
 * code locations (the issue-012 investigation that motivated this task) against
 * what the comments in the tree actually say.
 *
 * Not a gate: this script produces a JSON report on stdout for human/agent
 * inspection. It never sets a non-zero exit code for "citations found" — only
 * an unhandled I/O error crashes it, which is not a designed failure mode.
 * Deliberately NOT wired into `npm run check`, husky, or CI (informational
 * tooling only, per this task's acceptance criteria). The separate,
 * gate-wired delta-scoped check lives at scripts/check-comment-citations.ts,
 * which flags only a NEWLY-introduced comment citation.
 */
import fs from "node:fs";
import path from "node:path";
import { CITATION_RE_G } from "@davidorex/pi-context/citation-rot-scanner";
import ts from "typescript";

/** Which lexical form of comment a citation was found inside. */
export type CommentKind = "jsdoc" | "block" | "line";

/** One enumerated citation occurrence. */
export interface Instance {
	/** Repo-relative path, forward-slash separated. */
	file: string;
	/** 1-based line number of the matched id's start. */
	line: number;
	/** The matched canonical_id token, e.g. "FEAT-006". */
	id: string;
	/** The lexical form of the comment the id was found inside. */
	commentKind: CommentKind;
	/** The full comment text (or a truncated excerpt for very long comments). */
	snippet: string;
}

/** Aggregate scan report shape emitted by main() as JSON. */
export interface ScanReport {
	/** Package-relative dirs discovered under packages/ (e.g. "packages/pi-context"). */
	scannedPackages: string[];
	totalInstances: number;
	totalFiles: number;
	byId: Record<string, number>;
	byFile: Record<string, number>;
	instances: Instance[];
}

/**
 * Reconciliation note: this file used to hand-duplicate a CITATION_RE_G copy
 * that had diverged from packages/pi-context/src/citation-rot-scanner.ts's
 * module-private CITATION_RE (that scanner's regex lacked MILE-\d{3,}
 * entirely and used the narrower PHASE-\d{3,} instead of PHASE-[A-Z0-9-]+ —
 * the 2026-07-10 investigation of issue-012 found live phase ids are
 * alphanumeric slugs, e.g. PHASE-PORT-OPS, never purely digit-suffixed, per
 * phase.schema.json's declared ^PHASE-[A-Z0-9-]+$ pattern). Both families are
 * now unioned onto citation-rot-scanner.ts's exported CITATION_RE, imported
 * here directly, so this file no longer carries a second,
 * independently-driftable copy.
 */

/** Max snippet length before truncating to an excerpt around the match. */
const MAX_SNIPPET_LEN = 300;

/** Classify a captured comment's raw text (including its delimiters). */
export function classifyComment(raw: string): CommentKind {
	if (raw.startsWith("//")) return "line";
	// A degenerate empty comment `/**/` starts with "/**" but is not a JSDoc
	// block — it carries no body distinguishing it from a plain block comment.
	if (raw.startsWith("/**") && raw !== "/**/") return "jsdoc";
	return "block";
}

/**
 * Truncate a long comment to a bounded excerpt centered on the match, so a
 * huge doc-comment doesn't blow up the output. Short comments pass through
 * unchanged.
 */
function excerpt(raw: string, matchIndex: number, matchLen: number): string {
	if (raw.length <= MAX_SNIPPET_LEN) return raw;
	const half = Math.floor(MAX_SNIPPET_LEN / 2);
	const start = Math.max(0, matchIndex - half);
	const end = Math.min(raw.length, matchIndex + matchLen + half);
	const prefix = start > 0 ? "…" : "";
	const suffix = end < raw.length ? "…" : "";
	return prefix + raw.slice(start, end) + suffix;
}

/**
 * Scan one file's already-read text for citation instances inside its
 * comments. `filePath` is used only as the label recorded on each instance
 * (repo-relative, forward-slash separated by convention of the caller) and as
 * the fileName fed to ts.createSourceFile for line-number lookup — it is not
 * itself read from disk here, which keeps this function synthetic-fixture
 * testable.
 *
 * Uses ts.createScanner (skipTrivia=false) to enumerate every comment token by
 * scanning the raw token stream, and a separate ts.createSourceFile purely for
 * its getLineAndCharacterOfPosition offset->line lookup (no tree walking).
 */
export function scanFile(filePath: string, text: string): Instance[] {
	const instances: Instance[] = [];
	const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, /* setParentNodes */ false);

	const scanner = ts.createScanner(ts.ScriptTarget.Latest, /* skipTrivia */ false);
	scanner.setText(text);

	// A bare scan() loop mis-tokenizes template literals carrying `${...}`
	// substitutions: after a TemplateHead, plain scan() treats the substitution
	// expression's own `}` as an ordinary CloseBraceToken and then resumes
	// normal-code scanning rather than template-tail scanning — so it can
	// mistake the NEXT literal backtick in the file for the start of a whole
	// new template, silently swallowing a large span of real source (including
	// its comments) as bogus "template text". `templateBraceDepths` is a stack
	// (one entry per currently-open template substitution) tracking nested
	// ordinary `{}` depth WITHIN that substitution's expression; when a
	// substitution's own closing `}` is reached (its tracked depth is 0),
	// `reScanTemplateToken` re-tokenizes from that `}` as TemplateMiddle/Tail
	// so the scanner correctly resumes inside the template literal.
	const templateBraceDepths: number[] = [];

	let kind = scanner.scan();
	while (kind !== ts.SyntaxKind.EndOfFileToken) {
		if (kind === ts.SyntaxKind.SingleLineCommentTrivia || kind === ts.SyntaxKind.MultiLineCommentTrivia) {
			const raw = scanner.getTokenText();
			const tokenStart = scanner.getTokenStart();
			const commentKind = classifyComment(raw);

			CITATION_RE_G.lastIndex = 0;
			let m: RegExpExecArray | null = CITATION_RE_G.exec(raw);
			while (m !== null) {
				const absOffset = tokenStart + m.index;
				const line = sourceFile.getLineAndCharacterOfPosition(absOffset).line + 1;
				instances.push({
					file: filePath,
					line,
					id: m[0],
					commentKind,
					snippet: excerpt(raw, m.index, m[0].length),
				});
				m = CITATION_RE_G.exec(raw);
			}
		} else if (kind === ts.SyntaxKind.TemplateHead) {
			templateBraceDepths.push(0);
		} else if (kind === ts.SyntaxKind.OpenBraceToken && templateBraceDepths.length > 0) {
			templateBraceDepths[templateBraceDepths.length - 1]++;
		} else if (kind === ts.SyntaxKind.CloseBraceToken && templateBraceDepths.length > 0) {
			const top = templateBraceDepths.length - 1;
			if (templateBraceDepths[top] === 0) {
				// This `}` closes the substitution itself, not a nested object
				// literal inside it — re-tokenize as template middle/tail.
				templateBraceDepths.pop();
				kind = scanner.reScanTemplateToken(/* isTaggedTemplate */ false);
				if (kind === ts.SyntaxKind.TemplateMiddle) templateBraceDepths.push(0);
				continue; // kind already advanced; skip the trailing scan() below
			}
			templateBraceDepths[top]--;
		}
		kind = scanner.scan();
	}

	return instances;
}

/** Discover package directories under packages/ (never a hardcoded list). */
export function discoverPackageDirs(repoRoot: string): string[] {
	const packagesDir = path.join(repoRoot, "packages");
	if (!fs.existsSync(packagesDir)) return [];
	return fs
		.readdirSync(packagesDir, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.map((e) => `packages/${e.name}`)
		.sort();
}

/**
 * Recursively collect .ts/.tsx files under dir, skipping node_modules/dist/.git
 * directories and *.test.ts/*.test.js files. Mirrors
 * packages/pi-context/src/citation-rot-scanner.ts's walkPackage skip-rules.
 */
function walkSrcFiles(dir: string, out: string[] = []): string[] {
	if (!fs.existsSync(dir)) return out;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
			walkSrcFiles(full, out);
			continue;
		}
		if (!entry.isFile()) continue;
		if (full.endsWith(".test.ts") || full.endsWith(".test.js")) continue;
		if (!(full.endsWith(".ts") || full.endsWith(".tsx"))) continue;
		out.push(full);
	}
	return out;
}

/**
 * Scan the full monorepo (every discovered packages/* dir that has a src/
 * subdirectory) and return the aggregate report.
 */
export function scanRepo(repoRoot: string): ScanReport {
	const scannedPackages = discoverPackageDirs(repoRoot);
	const instances: Instance[] = [];

	for (const pkgRel of scannedPackages) {
		const srcDir = path.join(repoRoot, pkgRel, "src");
		if (!fs.existsSync(srcDir)) continue;
		for (const abs of walkSrcFiles(srcDir)) {
			const rel = path.relative(repoRoot, abs).split(path.sep).join("/");
			const text = fs.readFileSync(abs, "utf-8");
			instances.push(...scanFile(rel, text));
		}
	}

	const byId: Record<string, number> = {};
	const byFile: Record<string, number> = {};
	for (const inst of instances) {
		byId[inst.id] = (byId[inst.id] ?? 0) + 1;
		byFile[inst.file] = (byFile[inst.file] ?? 0) + 1;
	}

	return {
		scannedPackages,
		totalInstances: instances.length,
		totalFiles: Object.keys(byFile).length,
		byId,
		byFile,
		instances,
	};
}

function main(): void {
	const report = scanRepo(process.cwd());
	console.log(JSON.stringify(report, null, 2));
}

// Run only as a CLI, not when imported by the test.
if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}
