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
 *    against a throwaway dir without touching the real global binary). The
 *    real-global resolution is NON-POISONABLE: if an `npm_config_prefix` is
 *    inherited in the environment it is REFUSED as the real global (the caller
 *    must pass an explicit `--prefix`/`PROMOTE_PREFIX` for an intended target),
 *    and the `npm prefix -g` probe runs with all `npm_config_*` env scrubbed so
 *    the resolved prefix reflects the true global, not an inherited override.
 *    The resolved target is then VALIDATED (absolute; not the repo root or under
 *    it; for the real-global arm, an existing dir with lib/node_modules) BEFORE
 *    any destructive op runs — no `npm rm -g` / `npm i -g` is reachable until
 *    the target passes validation.
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
import { existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
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
 * A shallow copy of the current environment with every `npm_config_*` key
 * removed (case-insensitive). Used to probe the TRUE global npm prefix: with
 * an inherited `npm_config_prefix` present, `npm prefix -g` returns that
 * (poisoned) override; with all `npm_config_*` scrubbed it returns the true
 * global (e.g. /opt/homebrew). Returns a plain object suitable as `execSync`'s
 * `env`.
 */
function cleanNpmEnv() {
	const out = {};
	for (const [k, v] of Object.entries(process.env)) {
		if (/^npm_config_/i.test(k)) continue;
		out[k] = v;
	}
	return out;
}

/**
 * Resolve the target prefix: `--prefix <dir>` arg wins, then `PROMOTE_PREFIX`
 * env, else the real global npm prefix. The override path is what lets the
 * promote be exercised against a throwaway dir without touching the real binary.
 * The real-global arm is non-poisonable: an inherited `npm_config_prefix` is
 * refused (the caller must name an intended target explicitly), and the probe
 * runs with `npm_config_*` scrubbed so it reflects the true global.
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
	// Real-global arm. Refuse an inherited npm_config_prefix as the real global:
	// it would steer `npm prefix -g` to an arbitrary (possibly hostile) override
	// while still being labelled the real global. The caller must name an
	// intended override target explicitly (--prefix / PROMOTE_PREFIX).
	if (process.env.npm_config_prefix) {
		console.error(
			`Error: the global npm prefix is being driven by an inherited npm_config_prefix=${process.env.npm_config_prefix}.`,
		);
		console.error("Refusing to treat that inherited override as the real global prefix.");
		console.error("For an intended target, pass --prefix <dir> or PROMOTE_PREFIX=<dir> explicitly.");
		process.exit(1);
	}
	// Scrub npm_config_* from the probe env so the resolved prefix reflects the
	// TRUE global, never an inherited override.
	const real = run("npm prefix -g", { silent: true, env: cleanNpmEnv() })?.trim();
	if (!real) {
		console.error("Error: could not resolve the global npm prefix (npm prefix -g).");
		process.exit(1);
	}
	return { prefix: real, source: "npm prefix -g (real global)" };
}

/**
 * Refuse to proceed unless the resolved target prefix is safe to install into.
 * Called BEFORE any build/pack and BEFORE the destructive `npm rm -g` /
 * `npm i -g` so neither is reachable until the target passes. All arms require
 * an absolute path that is neither the repo root nor under it (path.sep-guarded
 * so a sibling dir sharing the repo-root prefix string does not match). The
 * real-global arm additionally requires the prefix to be an existing directory
 * whose lib/node_modules exists — a real global install root. Override arms
 * (--prefix / PROMOTE_PREFIX) deliberately do NOT require existence, so an
 * intended throwaway target (e.g. PROMOTE_PREFIX=/tmp/fresh) npm will create
 * still passes.
 */
function assertSafeTargetPrefix(p, { isRealGlobal }) {
	const refuse = (reason) => {
		console.error(`Error: refusing to promote into target prefix ${p}: ${reason}`);
		process.exit(1);
	};
	if (!isAbsolute(p)) refuse("not an absolute path.");
	if (p === REPO_ROOT) refuse("equals this repo's root.");
	if (p.startsWith(REPO_ROOT + sep)) refuse("is under this repo's root.");
	if (isRealGlobal) {
		let dirOk = false;
		try {
			dirOk = statSync(p).isDirectory();
		} catch {
			dirOk = false;
		}
		if (!dirOk) refuse("is not an existing directory (real-global target).");
		if (!existsSync(join(p, "lib", "node_modules"))) {
			refuse("has no lib/node_modules (not a real global install root).");
		}
	}
}

const { prefix, source } = resolveTargetPrefix();
const isRealGlobal = source === "npm prefix -g (real global)";
assertSafeTargetPrefix(prefix, { isRealGlobal });

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
