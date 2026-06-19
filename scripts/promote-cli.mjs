#!/usr/bin/env node
/**
 * Promote the operator `pi-context` binary to a publish-free LOCAL PACKED COPY
 * of the working tree.
 *
 * Usage:
 *   node scripts/promote-cli.mjs [--prefix <dir>]
 *   PROMOTE_PREFIX=<dir> node scripts/promote-cli.mjs
 *
 * Why this exists (the defect it retires):
 * The operator `pi-context` had been an `npm link` symlink into
 * packages/pi-context-cli/dist/bin.js — the repo's own build output. A routine
 * dev `npm run build` (`rm -rf dist && tsc …`) therefore transiently removed /
 * repointed the live operator binary. This script installs the operator as a
 * packed COPY of the working-tree CLI plus its @davidorex dependency set under
 * the prefix's lib/node_modules, reached via npm's standard bin shim, so the
 * operator resolves those deps from the co-installed packed set (CURRENT
 * working-tree code, not the stale registry release) and a subsequent repo
 * rebuild cannot touch the installed copy. It contains NO `npm link`.
 *
 * What it does:
 * 1. Resolve a TARGET PREFIX (default = the real global npm prefix; overridable
 *    via `--prefix <dir>` or `PROMOTE_PREFIX=<dir>` so the promote can be tested
 *    against a throwaway dir without touching the real global binary).
 * 2. Build the working tree (`npm run build`) so each packed `dist/` is current
 *    — `npm pack` does NOT build (only a publish fires `prepublishOnly`).
 * 3. Pack the @davidorex workspace set into a temp dir (one tarball per package).
 * 4. In ONE `npm i -g --prefix <prefix> <tarball...> --force`, install the whole
 *    packed set co-installed, so each package's `@davidorex/*@^0.31.0` deps
 *    resolve to the CO-INSTALLED packed siblings (not the registry). External
 *    deps (typebox etc.) come from the registry. When the target is the real
 *    global prefix, first `npm rm -g @davidorex/pi-context-cli` to retire any
 *    existing link.
 * 5. Verify + log: the installed `<prefix>/bin/pi-context` (npm's standard shim
 *    symlink) has a realpath resolving UNDER the prefix and NOT into this repo,
 *    and report the resolved prefix + what it did.
 */

import { execSync } from "node:child_process";
import { lstatSync, mkdtempSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// The @davidorex workspace set, enumerated from packages/* (each dir whose
// package.json is an @davidorex package). Lockstep-versioned; co-installed so
// inter-package `@davidorex/*` deps resolve to the packed siblings, not the
// registry. Enumerating from disk mirrors bump-versions.js (no hand-kept list).
function workspacePackages() {
	const packagesDir = join(REPO_ROOT, "packages");
	const out = [];
	for (const dir of readdirSync(packagesDir, { withFileTypes: true })) {
		if (!dir.isDirectory()) continue;
		const pkgPath = join(packagesDir, dir.name, "package.json");
		let pkg;
		try {
			pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
		} catch {
			continue;
		}
		if (typeof pkg.name === "string" && pkg.name.startsWith("@davidorex/")) {
			out.push({ name: pkg.name, dir: join(packagesDir, dir.name) });
		}
	}
	return out;
}

function run(cmd, options = {}) {
	console.log(`$ ${cmd}`);
	try {
		return execSync(cmd, {
			encoding: "utf-8",
			stdio: options.silent ? "pipe" : "inherit",
			cwd: options.cwd ?? REPO_ROOT,
			...options,
		});
	} catch (_e) {
		if (!options.ignoreError) {
			console.error(`Command failed: ${cmd}`);
			process.exit(1);
		}
		return null;
	}
}

/**
 * Resolve the target prefix: `--prefix <dir>` arg wins, then `PROMOTE_PREFIX`
 * env, else the real global npm prefix. The override path is what lets the
 * promote be exercised against a throwaway dir without touching the real binary.
 */
function resolveTargetPrefix() {
	const argv = process.argv.slice(2);
	const flagIdx = argv.indexOf("--prefix");
	if (flagIdx !== -1) {
		const val = argv[flagIdx + 1];
		if (!val) {
			console.error("Error: --prefix requires a directory argument.");
			process.exit(1);
		}
		return { prefix: resolve(val), source: "--prefix" };
	}
	if (process.env.PROMOTE_PREFIX) {
		return { prefix: resolve(process.env.PROMOTE_PREFIX), source: "PROMOTE_PREFIX" };
	}
	const real = run("npm prefix -g", { silent: true })?.trim();
	if (!real) {
		console.error("Error: could not resolve the global npm prefix (npm prefix -g).");
		process.exit(1);
	}
	return { prefix: real, source: "npm prefix -g (real global)" };
}

const { prefix, source } = resolveTargetPrefix();
const isRealGlobal = source === "npm prefix -g (real global)";

console.log("\n=== Promote operator pi-context (publish-free local packed copy) ===\n");
console.log(`Target prefix: ${prefix}`);
console.log(`  (resolved via ${source})\n`);

const packages = workspacePackages();
const cliPkg = packages.find((p) => p.name === "@davidorex/pi-context-cli");
if (!cliPkg) {
	console.error("Error: @davidorex/pi-context-cli not found among workspace packages.");
	process.exit(1);
}
console.log(`Packing ${packages.length} @davidorex package(s): ${packages.map((p) => p.name).join(", ")}\n`);

// 2. Build the working tree so each packed dist/ is current (npm pack does not build).
console.log("Building the working tree...");
run("npm run build");
console.log();

// 3. Pack the @davidorex workspace set into a temp dir (one tarball per package).
const packDir = mkdtempSync(join(tmpdir(), "promote-cli-"));
console.log(`Packing tarballs into ${packDir} ...`);
run(`npm pack --workspaces --pack-destination "${packDir}"`);
const tarballs = readdirSync(packDir)
	.filter((f) => f.endsWith(".tgz"))
	.map((f) => join(packDir, f));
if (tarballs.length === 0) {
	console.error(`Error: npm pack produced no tarballs in ${packDir}.`);
	process.exit(1);
}
console.log(`  ${tarballs.length} tarball(s) packed.\n`);

// 4. Retire any existing link (real-global target only), then co-install the
//    whole packed set in one install so inter-package @davidorex deps resolve
//    to the co-installed packed siblings rather than the registry.
if (isRealGlobal) {
	console.log("Retiring any existing global @davidorex/pi-context-cli (link or prior copy)...");
	run("npm rm -g @davidorex/pi-context-cli", { ignoreError: true });
	console.log();
}

const quotedTarballs = tarballs.map((t) => `"${t}"`).join(" ");
console.log("Installing the packed set into the target prefix (single co-install)...");
run(`npm i -g --prefix "${prefix}" ${quotedTarballs} --force`);
console.log();

// 5. Verify: the installed bin's realpath resolves UNDER the prefix and NOT into this repo.
const binPath = join(prefix, "bin", "pi-context");
console.log(`Verifying installed operator binary at ${binPath} ...`);
let st;
try {
	st = lstatSync(binPath);
} catch (_e) {
	console.error(`Error: expected installed binary not found at ${binPath}.`);
	process.exit(1);
}
if (st.isSymbolicLink()) {
	// A global bin is conventionally a shim that points into the installed
	// package tree under the prefix — acceptable — but it must NOT resolve back
	// into THIS repo (that would be the retired npm-link arrangement).
	const target = realpathSync(binPath);
	if (target.startsWith(REPO_ROOT)) {
		console.error(`Error: ${binPath} is a symlink resolving back into this repo (${target}).`);
		console.error("That is the retired npm-link arrangement, not a packed copy. Aborting.");
		process.exit(1);
	}
	console.log(`  bin is a shim → ${target} (under the prefix, not this repo) — OK.`);
} else {
	console.log("  bin is a regular file under the prefix (not resolving into this repo) — OK.");
}

console.log(`\n=== Done ===`);
console.log(`Installed @davidorex/pi-context-cli (+ ${packages.length - 1} sibling package(s)) as a packed`);
console.log(`copy under ${prefix}. The operator pi-context now resolves the working-tree code from the`);
console.log(`packed set; a repo rebuild (rm -rf dist && tsc) no longer affects the operator binary.`);
if (!isRealGlobal) {
	console.log(`\nTarget was an override prefix (${source}); the real global binary was NOT touched.`);
}
