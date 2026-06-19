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
 *    via `--prefix <dir>`, the glued `--prefix=<dir>` form, or `PROMOTE_PREFIX=
 *    <dir>` so the promote can be tested against a throwaway dir without touching
 *    the real global binary; both `--prefix` forms are honored, first occurrence
 *    wins). The real-global resolution is NON-POISONABLE: an inherited
 *    `npm_config_prefix` in ANY letter-case (npm honors case variants) is REFUSED
 *    as the real global (the caller must pass an explicit `--prefix`/
 *    `PROMOTE_PREFIX` for an intended target), and the `npm prefix -g` probe runs
 *    with all `npm_config_*` env scrubbed so the resolved prefix reflects the
 *    true global, not an inherited override. The resolved target is then
 *    VALIDATED (absolute; its REALPATH — nearest-existing-ancestor-resolved, so a
 *    symlink into the repo is caught even before the target dir exists — neither
 *    the realpath of the repo root nor under it; for the real-global arm, an
 *    existing dir with lib/node_modules, checked on the resolved realpath) BEFORE
 *    any destructive op runs — `npm i -g` is not reachable until the target
 *    passes validation. After the containment + existence checks pass the
 *    validated target is then MATERIALIZED (mkdir -p) and FULLY realpath-resolved,
 *    so the path validated is exactly the path installed into — the whole prefix
 *    exists at validation, leaving no literal leaf segment and no symlink to
 *    follow at install. The validator RETURNS that fully-resolved realpath, and
 *    the install and verify both consume it (so the path validated is exactly the
 *    path installed into — no second resolution downstream).
 * 2. Build the working tree (`npm run build`) so each packed `dist/` is current
 *    — `npm pack` does NOT build (only a publish fires `prepublishOnly`).
 * 3. Pack the @davidorex workspace set into a temp dir (one tarball per package).
 * 4. In ONE `npm i -g --prefix <prefix> <tarball...> --force`, run under an env
 *    with every `npm_config_*` scrubbed (so no ambient override can redirect the
 *    install; the explicit `--prefix` takes precedence), install the whole packed
 *    set co-installed, so each package's `@davidorex/*@^0.31.0` deps resolve to
 *    the CO-INSTALLED packed siblings (not the registry). External deps (typebox
 *    etc.) come from the registry. `--force` over an existing npm-link cleanly
 *    replaces it with a copied directory, so no separate `npm rm -g` precedes it
 *    (removing the only unpinned destructive op and the remove-then-install
 *    window in which a failed install could leave the operator uninstalled).
 * 5. Verify + log: the installed `<prefix>/bin/pi-context` (npm's standard shim
 *    symlink) has a realpath resolving UNDER the prefix and NOT into this repo —
 *    the post-install guard compares that realpath against the repo-root REALPATH
 *    with a path.sep boundary (the same realpath-normalized form the validation
 *    arm uses), and reports the resolved prefix + what it did.
 */

import { execSync } from "node:child_process";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	statSync,
} from "node:fs";
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
	// Honor BOTH the space form (`--prefix <dir>`) and the glued form
	// (`--prefix=<dir>`): scan for the first token that is exactly `--prefix`
	// (value = next argv token) or starts with `--prefix=` (value = the suffix).
	// First occurrence wins for repeats. The glued form previously fell through
	// to the real-global arm, which would silently install into the true global.
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
	// Real-global arm. Refuse an inherited npm_config_prefix as the real global:
	// it would steer `npm prefix -g` to an arbitrary (possibly hostile) override
	// while still being labelled the real global. The caller must name an
	// intended override target explicitly (--prefix / PROMOTE_PREFIX).
	// npm honors npm_config_prefix in any letter-case (NPM_CONFIG_PREFIX,
	// npm_config_prefix, etc.), so scan for any key whose lowercase matches
	// rather than checking the lowercase-exact name only.
	const inheritedPrefixKey = Object.keys(process.env).find((k) => k.toLowerCase() === "npm_config_prefix");
	if (inheritedPrefixKey) {
		console.error(
			`Error: the global npm prefix is being driven by an inherited ${inheritedPrefixKey}=${process.env[inheritedPrefixKey]}.`,
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
 * Realpath of the nearest existing ancestor of `p`, with the non-existent leaf
 * segments re-appended. If `p` exists, returns its realpath directly. Otherwise
 * walks up via dirname until realpathSync succeeds, then re-joins the segments
 * that did not exist. If the filesystem root is reached without success, returns
 * `p` unchanged. This lets containment checks resolve symlinks even for a target
 * that npm has not yet created (e.g. a throwaway PROMOTE_PREFIX).
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
 * Called BEFORE any build/pack and BEFORE the destructive `npm i -g` so it is
 * not reachable until the target passes. All arms require an absolute path whose
 * REALPATH (nearest-existing-ancestor-resolved, so a symlink-into-repo is caught
 * even before the target is created) is neither the realpath of the repo root
 * nor under it (path.sep-guarded so a sibling dir sharing the repo-root prefix
 * string does not match). The real-global arm additionally requires the prefix
 * to be an existing directory whose lib/node_modules exists — a real global
 * install root. Override arms (--prefix / PROMOTE_PREFIX) deliberately do NOT
 * require existence, so an intended throwaway target (e.g. PROMOTE_PREFIX=
 * /tmp/fresh) npm will create still passes.
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
		// Existence checks operate on the SAME resolved realpath that downstream
		// consumers (install --prefix, binPath) will use, not the literal `p` —
		// so a symlink component repointed in the build/pack window cannot redirect
		// the install to a target that was never validated (the TOCTOU window).
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
	// exactly the path installed into: nearestExistingRealpath(p) leaves the
	// non-existent leaf segments LITERAL (unresolved), so a leaf later
	// materialized as a symlink-into-repo between this validation and the install
	// would redirect npm to an unvalidated target. Creating the whole prefix now
	// (idempotent no-op for the pre-existing real-global root; the intended
	// throwaway for override arms) means it resolves with no literal leaf and no
	// symlink left to follow.
	mkdirSync(resolved, { recursive: true });
	const fullyResolved = realpathSync(resolved);
	// Re-run the containment refusals on the fully materialized + resolved path
	// (defense-in-depth: the materialized path is what every downstream consumer
	// uses, so it — not the partially-resolved `resolved` — must clear containment).
	if (fullyResolved === REPO_ROOT_REAL) refuse("resolves to this repo's root.");
	if (fullyResolved.startsWith(REPO_ROOT_REAL + sep)) refuse("resolves under this repo's root.");
	// Return the fully-resolved realpath of the materialized target so the caller
	// installs into exactly what was validated (one resolved representation,
	// validated == used, with no literal leaf and no symlink to follow at install).
	return fullyResolved;
}

const { prefix, source } = resolveTargetPrefix();
const isRealGlobal = source === "npm prefix -g (real global)";
// `safePrefix` is the validated resolved realpath; every post-validation consumer
// (install --prefix, binPath, the location logs) uses it, so the path that was
// validated is exactly the path installed into — no second resolution downstream.
const safePrefix = assertSafeTargetPrefix(prefix, { isRealGlobal });

console.log("\n=== Promote operator pi-context (publish-free local packed copy) ===\n");
console.log(`Target prefix: ${safePrefix}`);
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

// 4. Co-install the whole packed set in one install so inter-package @davidorex
//    deps resolve to the co-installed packed siblings rather than the registry.
//    No separate `npm rm -g`: `npm i -g --force` over an existing npm-link
//    cleanly replaces it with a real copied directory, so the removal is
//    redundant. The install runs under cleanNpmEnv() so no ambient npm_config_*
//    can redirect it; the explicit --prefix takes precedence over the scrubbed
//    environment.
const quotedTarballs = tarballs.map((t) => `"${t}"`).join(" ");
console.log("Installing the packed set into the target prefix (single co-install)...");
run(`npm i -g --prefix "${safePrefix}" ${quotedTarballs} --force`, { env: cleanNpmEnv() });
console.log();

// 5. Verify: the installed bin's realpath resolves UNDER the prefix and NOT into this repo.
const binPath = join(safePrefix, "bin", "pi-context");
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
	// Mirror validation's containment test: compare the realpath against the
	// repo-root REALPATH with a path.sep boundary (REPO_ROOT_REAL + sep), not
	// the literal REPO_ROOT via a bare startsWith — so a sibling dir sharing
	// the repo-root prefix string does not match and a symlinked repo root is
	// still caught (the guard now matches the validation arm's form).
	if (target === REPO_ROOT_REAL || target.startsWith(REPO_ROOT_REAL + sep)) {
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
console.log(`copy under ${safePrefix}. The operator pi-context now resolves the working-tree code from the`);
console.log(`packed set; a repo rebuild (rm -rf dist && tsc) no longer affects the operator binary.`);
if (!isRealGlobal) {
	console.log(`\nTarget was an override prefix (${source}); the real global binary was NOT touched.`);
}
