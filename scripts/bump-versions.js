#!/usr/bin/env node
/**
 * Bump all workspace package versions in lockstep and sync inter-package deps.
 *
 * Replaces `npm version -ws` which fails on 0.x minor/major bumps because
 * npm runs peer dep resolution between bumping versions and syncing deps.
 * This script bumps all package.json files directly, then syncs cross-refs.
 *
 * Usage: node scripts/bump-versions.js <major|minor|patch>
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BUMP_TYPE = process.argv[2];
if (!["major", "minor", "patch"].includes(BUMP_TYPE)) {
	console.error("Usage: node scripts/bump-versions.js <major|minor|patch>");
	process.exit(1);
}

function bumpVersion(version, type) {
	const [major, minor, patch] = version.split(".").map(Number);
	if (type === "major") return `${major + 1}.0.0`;
	if (type === "minor") return `${major}.${minor + 1}.0`;
	return `${major}.${minor}.${patch + 1}`;
}

const packagesDir = join(process.cwd(), "packages");
const packageDirs = readdirSync(packagesDir, { withFileTypes: true })
	.filter((d) => d.isDirectory())
	.map((d) => d.name);

// Read current version from first package
const firstPkg = JSON.parse(readFileSync(join(packagesDir, packageDirs[0], "package.json"), "utf-8"));
const currentVersion = firstPkg.version;
const newVersion = bumpVersion(currentVersion, BUMP_TYPE);

console.log(`Bumping ${currentVersion} → ${newVersion} (${BUMP_TYPE})\n`);

// Phase 1: Bump all package versions
for (const dir of packageDirs) {
	const pkgPath = join(packagesDir, dir, "package.json");
	const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
	pkg.version = newVersion;
	writeFileSync(pkgPath, `${JSON.stringify(pkg, null, "\t")}\n`);
	console.log(`  ${pkg.name}@${newVersion}`);
}

// Phase 2: Sync all inter-package dependency references
const versionMap = {};
for (const dir of packageDirs) {
	const pkg = JSON.parse(readFileSync(join(packagesDir, dir, "package.json"), "utf-8"));
	versionMap[pkg.name] = pkg.version;
}

let synced = 0;
for (const dir of packageDirs) {
	const pkgPath = join(packagesDir, dir, "package.json");
	const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
	let updated = false;

	for (const depType of ["dependencies", "peerDependencies", "devDependencies"]) {
		if (!pkg[depType]) continue;
		for (const [dep, ver] of Object.entries(pkg[depType])) {
			if (versionMap[dep]) {
				const target = `^${versionMap[dep]}`;
				if (ver !== target) {
					pkg[depType][dep] = target;
					updated = true;
					synced++;
				}
			}
		}
	}

	if (updated) {
		writeFileSync(pkgPath, `${JSON.stringify(pkg, null, "\t")}\n`);
	}
}

console.log(`\n✅ All packages at ${newVersion}, ${synced} cross-reference(s) synced`);
