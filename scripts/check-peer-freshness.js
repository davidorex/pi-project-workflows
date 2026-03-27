/**
 * Peer dependency freshness gate — verifies that the pi peer dependencies
 * installed in node_modules match the globally installed pi runtime version.
 *
 * TypeScript compiles against local node_modules types. If those are stale
 * relative to the pi version that actually loads extensions at runtime,
 * API changes (narrowed types, removed exports) compile clean but fail
 * at runtime. This script catches that drift.
 *
 * Wired into `npm run check` so it fires before lint and typecheck.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PEER_PKG = "node_modules/@mariozechner/pi-coding-agent/package.json";

// Local version: what TypeScript compiles against
let localVersion;
try {
	const pkg = JSON.parse(readFileSync(PEER_PKG, "utf-8"));
	localVersion = pkg.version;
} catch {
	console.error(`FAIL: Cannot read ${PEER_PKG} — run npm install`);
	process.exit(1);
}

// Runtime version: read directly from global npm install (fast, no side effects)
// pi --version is slow (~20s) because it triggers extension auto-updates.
let runtimeVersion;
try {
	const globalRoot = execSync("npm root -g", { encoding: "utf-8", timeout: 5_000 }).trim();
	const globalPkg = JSON.parse(readFileSync(join(globalRoot, "@mariozechner/pi-coding-agent/package.json"), "utf-8"));
	runtimeVersion = globalPkg.version;
} catch {
	console.log("SKIP: global pi-coding-agent not found — peer freshness check skipped");
	process.exit(0);
}

if (localVersion !== runtimeVersion) {
	console.error(
		`FAIL: Peer dep drift detected\n` +
		`  Local pi-coding-agent: ${localVersion} (what TypeScript compiles against)\n` +
		`  Global pi-coding-agent: ${runtimeVersion} (what loads extensions at runtime)\n` +
		`  Fix: npm update`
	);
	process.exit(1);
}
