#!/usr/bin/env -S npx tsx
/**
 * check-comment-citations — commit-time + CI delta-scoped comment-citation gate.
 *
 * The AST-based citation-rot-scanner (packages/pi-context/src/citation-rot-scanner.ts)
 * deliberately excludes comment trivia from its default operator-surface walk
 * (JSDoc/line comments never ship to an operator). scan-comment-citations.ts
 * is a separate, informational (non-gating) enumerator of every comment
 * citation in the tree, for cross-referencing which comments cite which
 * canonical_id — it is not wired into any commit-time or CI gate and reports
 * every citation, old and new alike.
 *
 * This script closes a narrower, gated slice of that surface: it flags ONLY a
 * comment citation NEWLY introduced by the change under review, never a
 * pre-existing one — so a commit that merely touches a file already carrying
 * long-standing tracker-ID comments (this monorepo's own source is full of
 * them) is never blocked, but a genuinely new internal canonical_id leaking
 * into a fresh comment is caught before it ships.
 *
 * Delta rule (existence-based, not per-line): for each changed .ts/.tsx file
 * under a discovered packages/<name>/src/ tree, this computes the SET of
 * distinct matched ids found in that file's comment trivia at the before
 * revision, and the set found at the after revision (via the shared
 * scanCommentsInFile from @davidorex/pi-context/citation-rot-scanner). An id
 * present after but absent before is flagged, once per file, at its first
 * after-scan occurrence. Existence (not exact file+line+id tuple matching) is
 * deliberate: an unrelated edit elsewhere in the same file that merely shifts
 * a pre-existing citation's line number must never register as "new". The
 * accepted trade-off: if an id already exists once in a file and a second,
 * genuinely new occurrence of that SAME id is introduced elsewhere in the
 * same file, it is not separately flagged — the gate's job is to catch ids
 * newly leaking into a file's comments, not to enumerate every additional
 * occurrence of an id the file already carries.
 *
 * Two modes, mirroring scripts/check-changelog.ts / scripts/check-config-schema.ts:
 *   - staged (default, no --base): changed paths = git diff --cached --name-only;
 *     before-state = git show HEAD:<path>; after-state = working-tree disk file.
 *   - range (--base <ref>): changed paths = git diff <ref>...HEAD --name-only;
 *     before-state = git show <ref>:<path>; after-state = git show HEAD:<path>.
 *
 * Package discovery is dynamic (discoverPackageDirs walks packages/*, never a
 * hardcoded package-name list), mirroring scripts/scan-comment-citations.ts.
 *
 * Pure helpers (discoverPackageDirs / isWatchedSourceFile / findNewCommentCitations)
 * are exported for scripts/check-comment-citations.test.ts.
 */
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { scanCommentsInFile } from "@davidorex/pi-context/citation-rot-scanner";

/** Discover package directories under packages/ (never a hardcoded list). Mirrors scan-comment-citations.ts's discoverPackageDirs. */
export function discoverPackageDirs(repoRoot: string): string[] {
	const packagesDir = join(repoRoot, "packages");
	if (!existsSync(packagesDir)) return [];
	return readdirSync(packagesDir, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.map((e) => `packages/${e.name}`)
		.sort();
}

/**
 * Is this changed path a .ts/.tsx file under one of the discovered packages'
 * src/ tree? Filtering is purely by containment under a real, discovered
 * package's src/ dir plus extension — no hardcoded package-name list.
 */
export function isWatchedSourceFile(changedPath: string, packageDirs: string[]): boolean {
	if (!(changedPath.endsWith(".ts") || changedPath.endsWith(".tsx"))) return false;
	return packageDirs.some((pkgDir) => changedPath.startsWith(`${pkgDir}/src/`));
}

/** One newly-introduced comment-citation finding. */
export interface NewCitationFinding {
	file: string;
	line: number;
	matched: string;
}

/** The set of distinct matched ids found in a file's comment trivia. Empty when text is undefined (file absent at that revision). */
function commentIdSet(filePath: string, text: string | undefined): Set<string> {
	if (text === undefined) return new Set();
	return new Set(scanCommentsInFile(filePath, text).map((h) => h.matched));
}

/**
 * Existence-based before/after diff for one file: an id is a newly-introduced
 * comment citation iff it appears in the after-scan but was absent (as any
 * occurrence, anywhere in the file) from the before-scan. See the module
 * doc comment above for the line-shift + same-id-second-occurrence rationale
 * and accepted trade-off. Deduplicates: each newly-introduced id is reported
 * once per file, at its first after-scan occurrence.
 */
export function findNewCommentCitations(
	filePath: string,
	beforeText: string | undefined,
	afterText: string | undefined,
): NewCitationFinding[] {
	if (afterText === undefined) return []; // file deleted in this change — nothing new to flag
	const beforeIds = commentIdSet(filePath, beforeText);
	const afterHits = scanCommentsInFile(filePath, afterText);
	const findings: NewCitationFinding[] = [];
	const reported = new Set<string>();
	for (const hit of afterHits) {
		if (beforeIds.has(hit.matched)) continue;
		if (reported.has(hit.matched)) continue;
		reported.add(hit.matched);
		findings.push({ file: filePath, line: hit.line, matched: hit.matched });
	}
	return findings;
}

function git(cmd: string): string {
	return execSync(cmd, { encoding: "utf-8" });
}

/** `git show <rev>:<path>` returning undefined if the path does not exist there. */
function gitShow(rev: string, path: string): string | undefined {
	try {
		return execSync(`git show ${rev}:${path}`, { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
	} catch {
		return undefined;
	}
}

function main(): number {
	const argv = process.argv.slice(2);
	const baseIdx = argv.indexOf("--base");
	const base = baseIdx !== -1 ? argv[baseIdx + 1] : undefined;

	const repoRoot = process.cwd();
	const packageDirs = discoverPackageDirs(repoRoot);

	let changedPaths: string[];
	let beforeRev: string;
	let afterFromGit: boolean; // range mode reads after-state from HEAD via git show

	if (base) {
		let diffOut: string;
		try {
			diffOut = git(`git diff ${base}...HEAD --name-only`);
		} catch {
			console.error(
				`check-comment-citations: base ref '${base}' not resolvable — ensure the CI checkout uses fetch-depth: 0 (or fetch the base branch) before running the guard.`,
			);
			return 1;
		}
		changedPaths = diffOut.split("\n").filter(Boolean);
		beforeRev = base;
		afterFromGit = true;
	} else {
		changedPaths = git("git diff --cached --name-only").split("\n").filter(Boolean);
		beforeRev = "HEAD";
		afterFromGit = false;
	}

	const watched = changedPaths.filter((p) => isWatchedSourceFile(p, packageDirs));
	const allFindings: NewCitationFinding[] = [];

	for (const filePath of watched) {
		const before = gitShow(beforeRev, filePath);
		const after = afterFromGit
			? gitShow("HEAD", filePath)
			: existsSync(filePath)
				? readFileSync(filePath, "utf-8")
				: undefined;
		allFindings.push(...findNewCommentCitations(filePath, before, after));
	}

	if (allFindings.length > 0) {
		for (const f of allFindings) {
			console.error(
				`check-comment-citations: new citation '${f.matched}' introduced in a comment at ${f.file}:${f.line}`,
			);
		}
		console.error(
			`check-comment-citations: ${allFindings.length} newly-introduced tracker-ID citation(s) in code comments — an internal substrate canonical_id leaking into a comment on a surface this gate exists to catch. Rephrase the comment in plain language without the tracker id (do not --no-verify).`,
		);
		return 1;
	}
	return 0;
}

// Run only as a CLI, not when imported by the test.
if (import.meta.url === `file://${process.argv[1]}`) {
	process.exit(main());
}
