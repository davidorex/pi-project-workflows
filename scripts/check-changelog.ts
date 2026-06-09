#!/usr/bin/env -S npx tsx
/**
 * Commit-time + CI changelog guard (the R3 enforcement fix).
 *
 * For each of the seven lockstep packages: if a change touches that package's
 * published surface (derived from package.json files[], NOT a hardcoded list),
 * require that the package's CHANGELOG.md [Unreleased] body GREW in the same
 * change set. A published-surface change with no accompanying [Unreleased] line
 * is a violation and the guard exits nonzero.
 *
 * Two modes:
 *   - staged (default, no --base): compares the staged working tree against HEAD.
 *       changed paths  = git diff --cached --name-only
 *       before-state   = git show HEAD:packages/<p>/CHANGELOG.md
 *       after-state    = working-tree packages/<p>/CHANGELOG.md
 *   - range (--base <ref>): compares HEAD against <ref>.
 *       changed paths  = git diff <ref>...HEAD --name-only
 *       before-state   = git show <ref>:packages/<p>/CHANGELOG.md
 *       after-state    = git show HEAD:packages/<p>/CHANGELOG.md
 *
 * Pure helpers (watchDirsFromFiles / extractUnreleased / changedPackages /
 * unreleasedGrew) are exported for scripts/check-changelog.test.ts.
 *
 * Watch-set rule (must match release.mjs watchDirsFromFiles):
 *   - dist/ -> src/ for packages with a src/ tree, root *.ts for root-source
 *     packages (pi-behavior-monitors, pi-project-workflows).
 *   - data dirs (schemas/templates/skills/agents/workflows/examples/samples) keep.
 *   - *.ts (root-source files entry) keeps as root *.ts.
 *   - *.md / README.md / CHANGELOG.md dropped — docs are not feature surface.
 * dist/ is gitignored and never staged, so the ->src/ (or ->*.ts) map is the
 * surface actually watched in git diffs.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The seven lockstep packages (directory names under packages/). */
export const ALL_PACKAGES = [
	"pi-context",
	"pi-context-cli",
	"pi-jit-agents",
	"pi-workflows",
	"pi-behavior-monitors",
	"pi-agent-dispatch",
	"pi-project-workflows",
];

/**
 * Derive the watched published-surface entries for one package from its
 * package.json files[]. `pkgDir` is `packages/<name>`; `hasSrc` indicates a
 * src/ tree exists on disk (root-source packages have none).
 *
 * Returns plain strings: directory prefixes end with `/`; root *.ts globs are
 * returned as `packages/<name>/*.ts`.
 */
export function watchDirsFromFiles(files: string[], pkgDir: string, hasSrc?: boolean): string[] {
	const srcExists = hasSrc ?? existsSync(join(pkgDir, "src"));
	const out = new Set<string>();
	for (const raw of files) {
		const entry = raw.replace(/\/$/, "");
		if (entry === "dist") {
			out.add(srcExists ? `${pkgDir}/src/` : `${pkgDir}/*.ts`);
		} else if (entry === "*.ts") {
			out.add(`${pkgDir}/*.ts`);
		} else if (entry === "*.md" || entry === "README.md" || entry === "CHANGELOG.md") {
			// docs / changelog — not feature surface
		} else {
			out.add(`${pkgDir}/${entry}/`);
		}
	}
	return [...out];
}

/**
 * Is this path a non-shipping surface that should never flag a package? Subtractive
 * exemption applied before classification: build-excluded tests + monitor learned-pattern
 * stores — not shipped feature surface.
 */
export function isExemptSurface(path: string): boolean {
	return (
		/\.test\.[cm]?tsx?$/.test(path) ||
		(path.startsWith("packages/pi-behavior-monitors/examples/") && path.endsWith(".patterns.json"))
	);
}

/** Body text between `## [Unreleased]` and the next `## [` heading. Empty if none. */
export function extractUnreleased(changelogText: string): string {
	const start = changelogText.indexOf("## [Unreleased]");
	if (start === -1) return "";
	const afterHeading = start + "## [Unreleased]".length;
	const nextHeading = changelogText.indexOf("\n## [", afterHeading);
	return nextHeading === -1 ? changelogText.slice(afterHeading) : changelogText.slice(afterHeading, nextHeading);
}

/** Count of changelog list-item lines (`- ` / `* ` entries) in a body. */
function listItemCount(body: string): number {
	return body.split("\n").filter((l) => {
		const t = l.trim();
		return t.startsWith("- ") || t.startsWith("* ") || t === "-" || t === "*";
	}).length;
}

/**
 * Does a changed path fall in this package's watch set? A directory entry
 * (`packages/p/src/`) matches any path under it; a root-*.ts entry
 * (`packages/p/*.ts`) matches a `.ts` file directly in `packages/p/` (no subdir).
 */
function pathInWatchSet(changedPath: string, watch: string[]): boolean {
	for (const w of watch) {
		if (w.endsWith("/*.ts")) {
			const dir = w.slice(0, -"/*.ts".length); // packages/<name>
			const rest = changedPath.startsWith(`${dir}/`) ? changedPath.slice(dir.length + 1) : "";
			if (rest.length > 0 && !rest.includes("/") && rest.endsWith(".ts")) return true;
		} else if (changedPath.startsWith(w)) {
			return true;
		}
	}
	return false;
}

/**
 * Given the changed paths, return the package names whose published surface was
 * touched. `watchFor` resolves a package -> its watch set (injected so the test
 * can supply synthetic files[] without touching disk).
 */
export function changedPackages(
	changedPaths: string[],
	watchFor: (pkg: string) => string[] = defaultWatchFor,
): string[] {
	const candidates = changedPaths.filter((p) => !isExemptSurface(p));
	const hit = new Set<string>();
	for (const pkg of ALL_PACKAGES) {
		const watch = watchFor(pkg);
		if (watch.length === 0) continue;
		if (candidates.some((p) => pathInWatchSet(p, watch))) hit.add(pkg);
	}
	return [...hit];
}

/**
 * Did [Unreleased] gain a list-item entry? Growth is measured by the count of
 * markdown list items (`- ` / `* `) in the [Unreleased] body, not by raw line
 * count — so reflowing one existing entry across two physical lines is not
 * growth (D1). A brand-new CHANGELOG (beforeText === undefined) requires at
 * least one real entry, not merely a present heading with an empty body (D2).
 */
export function unreleasedGrew(beforeText: string | undefined, afterText: string): boolean {
	const afterItems = listItemCount(extractUnreleased(afterText));
	// New CHANGELOG (no before-state): require a real entry, not just the heading. (D2)
	if (beforeText === undefined) return afterItems >= 1;
	// Existing: require more list-item entries than before — a reflow of one entry is not growth. (D1)
	const beforeItems = listItemCount(extractUnreleased(beforeText));
	return afterItems > beforeItems;
}

function defaultWatchFor(pkg: string): string[] {
	const pkgDir = join("packages", pkg);
	const pkgJsonPath = join(pkgDir, "package.json");
	if (!existsSync(pkgJsonPath)) return [];
	const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
	return watchDirsFromFiles(pkgJson.files ?? [], pkgDir);
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

	let changedPaths: string[];
	let beforeRev: string;
	let afterFromGit: boolean; // range mode reads after-state from HEAD via git show

	if (base) {
		let diffOut: string;
		try {
			diffOut = git(`git diff ${base}...HEAD --name-only`);
		} catch {
			console.error(
				`check-changelog: base ref '${base}' not resolvable — ensure the CI checkout uses fetch-depth: 0 (or fetch the base branch) before running the guard.`,
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

	const touched = changedPackages(changedPaths);
	const violations: string[] = [];

	for (const pkg of touched) {
		const clPath = join("packages", pkg, "CHANGELOG.md");
		const before = gitShow(beforeRev, clPath);
		const after = afterFromGit
			? gitShow("HEAD", clPath)
			: existsSync(clPath)
				? readFileSync(clPath, "utf-8")
				: undefined;
		if (after === undefined) {
			violations.push(pkg);
			continue;
		}
		if (!unreleasedGrew(before, after)) violations.push(pkg);
	}

	if (violations.length > 0) {
		for (const v of violations) {
			console.error(
				`${v}: published-surface change without a [Unreleased] entry — add a changelog line (do not --no-verify)`,
			);
		}
		return 1;
	}
	return 0;
}

// Run only as a CLI, not when imported by the test.
if (import.meta.url === `file://${process.argv[1]}`) {
	process.exit(main());
}
