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
 *
 * After this script completes, the human must:
 *   npm publish --workspaces --access public   (requires npm login + OTP)
 *   git push origin main && git push origin v<version>
 */

import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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
	const pkg = JSON.parse(readFileSync("packages/pi-project/package.json", "utf-8"));
	return pkg.version;
}

function getChangelogs() {
	const packagesDir = "packages";
	const packages = readdirSync(packagesDir);
	return packages.map((pkg) => join(packagesDir, pkg, "CHANGELOG.md")).filter((path) => existsSync(path));
}

function updateChangelogsForRelease(version) {
	const date = new Date().toISOString().split("T")[0];
	const changelogs = getChangelogs();

	for (const changelog of changelogs) {
		const content = readFileSync(changelog, "utf-8");

		if (!content.includes("## [Unreleased]")) {
			console.log(`  Skipping ${changelog}: no [Unreleased] section`);
			continue;
		}

		const updated = content.replace("## [Unreleased]", `## [${version}] - ${date}`);
		writeFileSync(changelog, updated);
		console.log(`  Updated ${changelog}`);
	}
}

// Main flow
console.log("\n=== Release Script ===\n");

// 1. Check for uncommitted changes
console.log("Checking for uncommitted changes...");
const status = run("git status --porcelain", { silent: true });
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

// 3. Update changelogs
console.log("Updating CHANGELOG.md files...");
updateChangelogsForRelease(version);
console.log();

// 4. Commit and tag
console.log("Committing and tagging...");
run("git add .");
run(`git commit -m "Release v${version}"`);
run(`git tag v${version}`);
console.log();

console.log(`=== Tagged v${version} ===`);
console.log();
console.log("Next steps (human):");
console.log(`  npm publish --workspaces --access public`);
console.log(`  git push origin main && git push origin v${version}`);
