#!/usr/bin/env node
/**
 * Release script for pi-project-workflows monorepo
 *
 * Usage: node scripts/release.mjs <major|minor|patch>
 *
 * Steps:
 * 1. Check for uncommitted changes
 * 2. Bump version via npm run version:xxx
 * 3. Update CHANGELOG.md files: [Unreleased] -> [version] - date
 * 4. Commit and tag
 * 5. Promote the operator CLI (scripts/promote-cli.mjs) so the globally-
 *    installed pi-context binary is at the released version by construction.
 *    A promote failure does NOT un-release — the bump/changelog/commit/tag
 *    are already durable; the script exits non-zero naming the manual remedy.
 *
 * After this script completes, the human must:
 *   npm publish --workspaces --access public   (requires npm login + OTP)
 *   git push origin main && git push origin v<version>
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanGitEnv } from "@davidorex/pi-context/git-env";

// The seven lockstep packages. release.mjs and check-changelog.ts both require
// an exhaustive enumeration so a future package can never be silently skipped.
const ALL_PACKAGES = [
	"pi-context",
	"pi-context-cli",
	"pi-jit-agents",
	"pi-workflows",
	"pi-behavior-monitors",
	"pi-agent-dispatch",
	"pi-project-workflows",
];

/**
 * Derive the watched published-surface globs for one package from its
 * package.json `files[]`. Mirrors watchDirsFromFiles in check-changelog.ts
 * (duplicated here because release.mjs is plain node and does not run tsx).
 *
 * - `dist/` maps to its source dir: `src/` for packages with a src/ tree,
 *   or root `*.ts` for root-source packages (no src/ dir on disk).
 * - data dirs (schemas/templates/skills/agents/workflows/examples/samples) keep as-is.
 * - `*.ts` (root-source files entry) keeps as root `*.ts`.
 * - `*.md` / README.md / CHANGELOG.md are dropped — docs are not feature surface.
 *
 * Returns git pathspec strings rooted at packages/<name>/.
 */
function watchDirsFromFiles(files, pkgDir) {
	const hasSrc = existsSync(join(pkgDir, "src"));
	const out = new Set();
	for (const raw of files) {
		const entry = raw.replace(/\/$/, "");
		if (entry === "dist") {
			out.add(hasSrc ? `${pkgDir}/src/` : `${pkgDir}/*.ts`);
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

/** Body text between `## [Unreleased]` and the next `## [` heading. */
function extractUnreleased(changelogText) {
	const start = changelogText.indexOf("## [Unreleased]");
	if (start === -1) return "";
	const afterHeading = start + "## [Unreleased]".length;
	const nextHeading = changelogText.indexOf("\n## [", afterHeading);
	const body = nextHeading === -1 ? changelogText.slice(afterHeading) : changelogText.slice(afterHeading, nextHeading);
	return body;
}

/** Non-blank content of the [Unreleased] body (used for emptiness checks). */
function unreleasedNonBlank(changelogText) {
	return extractUnreleased(changelogText)
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l.length > 0)
		.join("\n");
}

const BUMP_TYPE = process.argv[2];

if (!["major", "minor", "patch"].includes(BUMP_TYPE)) {
	console.error("Usage: node scripts/release.mjs <major|minor|patch>");
	process.exit(1);
}

function run(cmd, options = {}) {
	console.log(`$ ${cmd}`);
	try {
		return execSync(cmd, { encoding: "utf-8", stdio: options.silent ? "pipe" : "inherit", ...options });
	} catch (_e) {
		if (!options.ignoreError) {
			console.error(`Command failed: ${cmd}`);
			process.exit(1);
		}
		return null;
	}
}

function getVersion() {
	const pkg = JSON.parse(readFileSync("packages/pi-context/package.json", "utf-8"));
	return pkg.version;
}

/**
 * R2a: enumerate ALL seven packages' CHANGELOG.md and throw if any is absent.
 * No silent existsSync filter — a missing changelog is a release-blocking error
 * (the failure mode that let pi-agent-dispatch ship changelog-less).
 */
function getChangelogs() {
	const missing = [];
	const paths = ALL_PACKAGES.map((pkg) => {
		const p = join("packages", pkg, "CHANGELOG.md");
		if (!existsSync(p)) missing.push(p);
		return p;
	});
	if (missing.length > 0) {
		console.error(`Error: missing CHANGELOG.md for ${missing.length} package(s):`);
		for (const m of missing) console.error(`  ${m}`);
		console.error("Every package must carry a CHANGELOG.md before release.");
		process.exit(1);
	}
	return paths;
}

/**
 * R2b (pre-stamp): for each package, if it had published-surface commits since
 * the most-recent tag but its [Unreleased] body is empty, the release recorded
 * nothing for a change — collect it and fail. A package with no surface commits
 * in the range legitimately has an empty section and proceeds (info line).
 */
function checkUnreleasedAgainstChanges() {
	let lastTag;
	try {
		lastTag = execSync("git describe --tags --abbrev=0", { encoding: "utf-8", ...{ env: cleanGitEnv() } }).trim();
	} catch (_e) {
		console.log("  No prior tag found (git describe) — skipping pre-stamp [Unreleased] coverage check.");
		return;
	}

	const offenders = [];
	for (const pkg of ALL_PACKAGES) {
		const pkgDir = join("packages", pkg);
		const pkgJson = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf-8"));
		const watch = watchDirsFromFiles(pkgJson.files ?? [], pkgDir);
		if (watch.length === 0) continue;

		const logCmd = `git diff ${lastTag}..HEAD --name-only -- ${watch.join(" ")}`;
		const changedPaths = (run(logCmd, { silent: true, env: cleanGitEnv() })?.trim() ?? "").split("\n").filter(Boolean);
		// Exempt non-shipped surface — mirrors check-changelog.ts isExemptSurface:
		// build-excluded tests + monitor learned-pattern stores.
		const surfaceCommits = changedPaths
			.filter(
				(p) =>
					!(
						/\.test\.[cm]?tsx?$/.test(p) ||
						(p.startsWith("packages/pi-behavior-monitors/examples/") && p.endsWith(".patterns.json"))
					),
			)
			.join("\n");
		const changelog = readFileSync(join(pkgDir, "CHANGELOG.md"), "utf-8");
		const body = unreleasedNonBlank(changelog);

		if (surfaceCommits.length === 0) {
			console.log(`  ${pkg}: no published-surface commits since ${lastTag} — empty [Unreleased] OK.`);
		} else if (body.length === 0) {
			offenders.push(pkg);
		}
	}

	if (offenders.length > 0) {
		console.error(
			`Error: ${offenders.length} package(s) had published-surface changes since ${lastTag} but an empty [Unreleased]:`,
		);
		for (const o of offenders) console.error(`  ${o}`);
		console.error("Record the changes under each package's ## [Unreleased] before releasing (do not bypass).");
		process.exit(1);
	}
}

/**
 * R1: stamp [Unreleased] -> [version] - date, then re-seed a fresh bare
 * ## [Unreleased] above it so the section can never self-disable after one release.
 */
function updateChangelogsForRelease(version) {
	const date = new Date().toISOString().split("T")[0];
	const changelogs = getChangelogs();

	for (const changelog of changelogs) {
		const content = readFileSync(changelog, "utf-8");

		if (!content.includes("## [Unreleased]")) {
			console.error(`Error: ${changelog} has no [Unreleased] section to stamp.`);
			process.exit(1);
		}

		// Stamp then re-seed a bare [Unreleased] (blank line after, no ### stubs).
		const stamped = content.replace("## [Unreleased]", `## [Unreleased]\n\n## [${version}] - ${date}`);
		writeFileSync(changelog, stamped);
		console.log(`  Updated ${changelog}`);
	}
}

// Main flow
console.log("\n=== Release Script ===\n");

// 1. Check for uncommitted changes
console.log("Checking for uncommitted changes...");
const status = run("git status --porcelain", { silent: true, env: cleanGitEnv() });
if (status?.trim()) {
	console.error("Error: Uncommitted changes detected. Commit or stash first.");
	console.error(status);
	process.exit(1);
}
console.log("  Working directory clean\n");

// 2. Bump version
console.log(`Bumping version (${BUMP_TYPE})...`);
run(`npm run version:${BUMP_TYPE}`);
const version = getVersion();
console.log(`  New version: ${version}\n`);

// 3. Update changelogs (pre-stamp coverage check, then stamp + re-seed)
console.log("Checking [Unreleased] coverage against changed surface...");
checkUnreleasedAgainstChanges();
console.log();
console.log("Updating CHANGELOG.md files...");
updateChangelogsForRelease(version);
console.log();

// 4. Commit and tag
console.log("Committing and tagging...");
run("git add .", { env: cleanGitEnv() });
run(`git commit -m "Release v${version}"`, { env: cleanGitEnv() });
run(`git tag v${version}`, { env: cleanGitEnv() });
console.log();

console.log(`=== Tagged v${version} ===`);
console.log();

// 5. Promote the operator CLI so the global pi-context binary is at the
// released version by construction (the release run is the causal write that
// moves the version; without this the operator silently lags every release).
// A promote failure does NOT un-release — everything above is already durable
// — so report it loudly, name the manual remedy, and exit non-zero.
console.log("Promoting the operator CLI to the released version...");
// silent:true pipes output so run() returns a string on success and null on
// failure (stdio:"inherit" would return null either way, defeating the check).
const promoted = run("npm run promote:cli", { silent: true, ignoreError: true });
if (promoted === null) {
	console.error(
		`Error: operator promote failed — the release itself (bump/changelog/commit/tag v${version}) is intact.`,
	);
	console.error("Remedy: run `npm run promote:cli` manually, then continue with the human steps below.");
	console.log();
	console.log("Next steps (human):");
	console.log(`  npm run promote:cli   (retry the failed promote)`);
	console.log(`  npm publish --workspaces --access public`);
	console.log(`  git push origin main && git push origin v${version}`);
	process.exit(1);
}
console.log(`  Operator promoted to v${version}\n`);

console.log("Next steps (human):");
console.log(`  npm publish --workspaces --access public`);
console.log(`  git push origin main && git push origin v${version}`);
