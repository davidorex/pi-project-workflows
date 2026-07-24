#!/usr/bin/env node
/**
 * Promote ALL @davidorex workspace packages to publish-free LOCAL PACKED COPIES
 * of the working tree under the global npm prefix, in one co-install.
 *
 * Usage:
 *   node scripts/promote-extensions.mjs [--prefix <dir>]
 *   PROMOTE_PREFIX=<dir> node scripts/promote-extensions.mjs
 *   npm run promote:all
 *
 * Why this exists:
 * The locally running pi loads the globally installed @davidorex packages
 * (packed copies under <prefix>/lib/node_modules/@davidorex/*), not this
 * working tree. Without a refresh step covering the WHOLE set, those installed
 * copies drift from the working tree and live surfaces (monitors, workflows,
 * extensions) keep running old code. `promote:cli` refreshes with the operator
 * `pi-context` binary in view; this script is the whole-set promote intended to
 * keep every running surface current — the standing rule is that the global
 * packed copies never drift from the working tree. It is invoked automatically
 * by the `.husky/post-commit` hook on any commit touching `packages/`.
 *
 * This script does NOT run `npm run build` — it packs whatever `dist/` is on
 * disk. The Completion Sequence builds before it runs (and the post-commit
 * hook fires after a gate-checked commit whose tree was built); running the
 * build here would duplicate that step on every commit.
 *
 * What it does:
 * 1. Resolve a TARGET PREFIX (default = the real global npm prefix; overridable
 *    via `--prefix <dir>`, the glued `--prefix=<dir>` form, or `PROMOTE_PREFIX=
 *    <dir>` so the promote can be tested against a throwaway dir without
 *    touching the real global install; both `--prefix` forms are honored, first
 *    occurrence wins). The real-global resolution is NON-POISONABLE via env
 *    scrub, NOT via refusal: `npm run promote:all` itself exports
 *    `npm_config_prefix=<true global>` into the script env, so refusing an
 *    inherited prefix would refuse the tool's own happy path. The
 *    `npm prefix -g` probe runs with all `npm_config_*` env scrubbed, so the
 *    resolved prefix reflects the true global regardless of any inherited
 *    override. The resolved target is then VALIDATED (absolute; its REALPATH —
 *    nearest-existing-ancestor-resolved, so a symlink into the repo is caught
 *    even before the target dir exists — neither the realpath of the repo root
 *    nor under it; for the real-global arm, an existing dir with
 *    lib/node_modules, checked on the resolved realpath) BEFORE any install is
 *    reachable, then MATERIALIZED (mkdir -p) and FULLY realpath-resolved so the
 *    path validated is exactly the path installed into.
 * 2. Enumerate the @davidorex workspace set from packages/* and pack it into a
 *    temp dir (os.tmpdir(); one tarball per package).
 * 3. In ONE `npm i -g --prefix <prefix> <tarball...> --force`, run under an env
 *    with every `npm_config_*` scrubbed, install the whole packed set
 *    co-installed — a SINGLE invocation so the meta-package's `@davidorex/*`
 *    workspace deps resolve to the co-installed packed siblings, not the
 *    registry. External deps come from the registry.
 * 4. Verify each packed package's directory exists under the prefix's
 *    lib/node_modules, then remove the temp tarball dir.
 *
 * Any step failure exits nonzero.
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Realpath of the repo root (REPO_ROOT always exists) so containment checks
// compare resolved paths, not literal strings — a symlink whose realpath is
// inside the repo cannot slip past a literal-string comparison.
const REPO_ROOT_REAL = realpathSync(REPO_ROOT);

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
		console.error(`Command failed: ${cmd}`);
		process.exit(1);
	}
}

/**
 * A shallow copy of the current environment with every `npm_config_*` key
 * removed (case-insensitive). Used both to probe the TRUE global npm prefix
 * (with an inherited `npm_config_prefix` present, `npm prefix -g` returns that
 * override; scrubbed, it returns the true global) and to run the install so no
 * ambient override can redirect it.
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
 * promote be exercised against a throwaway dir without touching the real
 * install. The real-global arm is non-poisonable via env scrub (not refusal):
 * the probe runs with `npm_config_*` scrubbed so it reflects the true global
 * regardless of any inherited `npm_config_prefix` (which `npm run` itself
 * injects).
 */
function resolveTargetPrefix() {
	const argv = process.argv.slice(2);
	// Honor BOTH the space form (`--prefix <dir>`) and the glued form
	// (`--prefix=<dir>`); first occurrence wins for repeats.
	const flagIdx = argv.findIndex((tok) => tok === "--prefix" || tok.startsWith("--prefix="));
	if (flagIdx !== -1) {
		const tok = argv[flagIdx];
		const val = tok.startsWith("--prefix=") ? tok.slice("--prefix=".length) : argv[flagIdx + 1];
		if (!val) {
			console.error("Error: --prefix requires a directory argument.");
			process.exit(1);
		}
		return { prefix: resolve(val), source: "--prefix" };
	}
	if (process.env.PROMOTE_PREFIX) {
		return { prefix: resolve(process.env.PROMOTE_PREFIX), source: "PROMOTE_PREFIX" };
	}
	const real = run("npm prefix -g", { silent: true, env: cleanNpmEnv() })?.trim();
	if (!real) {
		console.error("Error: could not resolve the global npm prefix (npm prefix -g).");
		process.exit(1);
	}
	return { prefix: real, source: "npm prefix -g (real global)" };
}

/**
 * Realpath of the nearest existing ancestor of `p`, with the non-existent leaf
 * segments re-appended. If `p` exists, returns its realpath directly. Otherwise
 * walks up via dirname until realpathSync succeeds, then re-joins the segments
 * that did not exist. If the filesystem root is reached without success,
 * returns `p` unchanged. This lets containment checks resolve symlinks even for
 * a target that npm has not yet created (e.g. a throwaway --prefix).
 */
function nearestExistingRealpath(p) {
	const trailing = [];
	let cur = p;
	for (;;) {
		try {
			const real = realpathSync(cur);
			return trailing.length === 0 ? real : join(real, ...trailing);
		} catch {
			const parent = dirname(cur);
			if (parent === cur) return p; // reached filesystem root, none existed
			trailing.unshift(cur.slice(parent.length + sep.length));
			cur = parent;
		}
	}
}

/**
 * Refuse to proceed unless the resolved target prefix is safe to install into.
 * Called BEFORE any pack and BEFORE the destructive `npm i -g` so it is not
 * reachable until the target passes. All arms require an absolute path whose
 * REALPATH (nearest-existing-ancestor-resolved, so a symlink-into-repo is
 * caught even before the target is created) is neither the realpath of the repo
 * root nor under it (path.sep-guarded so a sibling dir sharing the repo-root
 * prefix string does not match). The real-global arm additionally requires the
 * prefix to be an existing directory whose lib/node_modules exists — a real
 * global install root. Override arms (--prefix / PROMOTE_PREFIX) deliberately
 * do NOT require existence, so an intended throwaway target npm will create
 * still passes. Returns the fully materialized + realpath-resolved target so
 * the caller installs into exactly what was validated.
 */
function assertSafeTargetPrefix(p, { isRealGlobal }) {
	const refuse = (reason) => {
		console.error(`Error: refusing to promote into target prefix ${p}: ${reason}`);
		process.exit(1);
	};
	if (!isAbsolute(p)) refuse("not an absolute path.");
	const resolved = nearestExistingRealpath(p);
	if (resolved === REPO_ROOT_REAL) refuse("resolves to this repo's root.");
	if (resolved.startsWith(REPO_ROOT_REAL + sep)) refuse("resolves under this repo's root.");
	if (isRealGlobal) {
		let dirOk = false;
		try {
			dirOk = statSync(resolved).isDirectory();
		} catch {
			dirOk = false;
		}
		if (!dirOk) refuse("is not an existing directory (real-global target).");
		if (!existsSync(join(resolved, "lib", "node_modules"))) {
			refuse("has no lib/node_modules (not a real global install root).");
		}
	}
	// Materialize the full target as real directories so the path validated is
	// exactly the path installed into (no literal leaf segment and no symlink
	// left to follow at install), then re-run containment on the fully resolved
	// path (defense-in-depth: the materialized path is what the install uses).
	mkdirSync(resolved, { recursive: true });
	const fullyResolved = realpathSync(resolved);
	if (fullyResolved === REPO_ROOT_REAL) refuse("resolves to this repo's root.");
	if (fullyResolved.startsWith(REPO_ROOT_REAL + sep)) refuse("resolves under this repo's root.");
	return fullyResolved;
}

const { prefix, source } = resolveTargetPrefix();
const isRealGlobal = source === "npm prefix -g (real global)";
// `safePrefix` is the validated resolved realpath; every post-validation
// consumer (install --prefix, the verify, the location logs) uses it, so the
// path that was validated is exactly the path installed into.
const safePrefix = assertSafeTargetPrefix(prefix, { isRealGlobal });

console.log("\n=== Promote @davidorex extension set (publish-free local packed copies) ===\n");
console.log(`Target prefix: ${safePrefix}`);
console.log(`  (resolved via ${source})\n`);

const packages = workspacePackages();
if (packages.length === 0) {
	console.error("Error: no @davidorex packages found under packages/.");
	process.exit(1);
}
console.log(`Packing ${packages.length} @davidorex package(s): ${packages.map((p) => p.name).join(", ")}\n`);

// Pack the workspace set into a temp dir (one tarball per package). NO build
// here — the working tree's dist/ is packed as-is (see header).
const packDir = mkdtempSync(join(tmpdir(), "promote-extensions-"));
try {
	console.log(`Packing tarballs into ${packDir} ...`);
	run(`npm pack --workspaces --pack-destination "${packDir}"`);
	const tarballs = readdirSync(packDir)
		.filter((f) => f.endsWith(".tgz"))
		.map((f) => join(packDir, f));
	if (tarballs.length !== packages.length) {
		console.error(`Error: expected ${packages.length} tarballs, npm pack produced ${tarballs.length} in ${packDir}.`);
		process.exit(1);
	}
	console.log(`  ${tarballs.length} tarball(s) packed.\n`);

	// Co-install the whole packed set in ONE install so inter-package @davidorex
	// deps (including the meta-package's) resolve to the co-installed packed
	// siblings rather than the registry. `--force` cleanly replaces any existing
	// install/link. The install runs under cleanNpmEnv() so no ambient
	// npm_config_* can redirect it; the explicit --prefix takes precedence.
	const quotedTarballs = tarballs.map((t) => `"${t}"`).join(" ");
	console.log("Installing the packed set into the target prefix (single co-install)...");
	run(`npm i -g --prefix "${safePrefix}" ${quotedTarballs} --force`, { env: cleanNpmEnv() });
	console.log();

	// Verify: every packed package's directory exists under the prefix.
	console.log("Verifying installed packages under the prefix ...");
	for (const pkg of packages) {
		const installedDir = join(safePrefix, "lib", "node_modules", ...pkg.name.split("/"));
		if (!existsSync(join(installedDir, "package.json"))) {
			console.error(`Error: ${pkg.name} not found at ${installedDir} after install.`);
			process.exit(1);
		}
		console.log(`  ${pkg.name} → ${installedDir} — OK.`);
	}
} finally {
	rmSync(packDir, { recursive: true, force: true });
}

console.log(`\n=== Done ===`);
console.log(`Installed ${packages.length} @davidorex package(s) as packed copies under ${safePrefix}.`);
console.log("The globally installed extension set now matches the working tree's built dist/.");
if (!isRealGlobal) {
	console.log(`\nTarget was an override prefix (${source}); the real global install was NOT touched.`);
}
