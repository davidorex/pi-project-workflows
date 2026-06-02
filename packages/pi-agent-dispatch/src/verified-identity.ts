/**
 * verified-identity — terminal-operator identity discovered from process
 * environment, used by the auth-gate handler to overwrite caller-supplied
 * writer.user with a verified value at the canonical authorization point
 * (the pi-dispatch tool_call boundary).
 *
 * Aim: the auth-gate's interactive confirm verifies that SOMEONE at the
 * terminal authorized the call; this module supplies the identity of that
 * someone so the substrate attestation stamp reflects the actually-
 * confirming operator rather than a caller-claimed value. The intended
 * source chain is:
 *
 *   1. `git config user.email` — the typical canonical contributor identity
 *      anchored on this checkout's git configuration; preferred because it
 *      mirrors the identity the same operator commits under.
 *   2. `process.env.USER` — POSIX login name; coarser but always present in
 *      a normally-launched interactive shell.
 *   3. `null` + a structured warning trace — the operator-visible signal
 *      that no verifiable identity was discoverable; the auth-gate
 *      preserves the caller-supplied identity in that case (last-resort
 *      fall-through; auditable via the warning).
 *
 * The resolution is module-level cached. Caching means a config drift
 * mid-process does not change later attestations; tests cover the cache
 * via the exported `_resetVerifiedIdentityCache` helper.
 *
 * Dependency-injection design: `getVerifiedOperatorIdentity` accepts an
 * optional `deps` argument shaped `{ runGitConfig, getEnvUser, emitWarning }`
 * so tests can substitute stubs without spawning a real git or mutating
 * process.env. Production callers pass nothing; the defaults bind the real
 * execSync / process.env.USER / writeAgentTrace pipeline.
 */

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import { cleanGitEnv } from "@davidorex/pi-context/git-env";
import { writeAgentTrace } from "@davidorex/pi-jit-agents";

export interface VerifiedIdentityDeps {
	runGitConfig?: () => string | null;
	getEnvUser?: () => string | null;
	emitWarning?: (message: string) => void;
}

let cached: string | null | undefined; // undefined = not yet resolved

/**
 * Reset the module-level cache so a subsequent call re-resolves identity.
 * Test-only surface — production callers should never invoke this.
 */
export function _resetVerifiedIdentityCache(): void {
	cached = undefined;
}

/**
 * ULID-shape placeholder for the trace entry id. Mirrors the precedent in
 * composite-loader.ts: the trace pipeline schema requires a 26-character
 * Crockford-base32 ULID; we mint a regex-shaped value without taking a
 * dependency on a real ULID library. Identifier collisions on the trace
 * surface are tolerated by downstream consumers.
 */
function placeholderTraceId(): string {
	const hex = randomUUID().replace(/-/g, "");
	const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
	let out = "";
	for (let i = 0; i < 26; i++) {
		out += alphabet[Number.parseInt(hex[i % hex.length], 16) % alphabet.length];
	}
	return out;
}

function defaultTracePath(): string {
	const env = process.env.PI_AGENT_TRACE_PATH;
	if (env && env.length > 0) return env;
	return path.join(homedir(), ".pi", "traces", "extension-load.jsonl");
}

function defaultEmitWarning(message: string): void {
	try {
		writeAgentTrace(
			{
				type: "extension_load_warning",
				id: placeholderTraceId(),
				parentId: null,
				timestamp: new Date().toISOString(),
				extension_name: "pi-agent-dispatch",
				message,
				severity: "warning",
			},
			{ tracePath: defaultTracePath() },
		);
	} catch {
		// Trace failures are observability-only; never let them mask the
		// missing-identity condition or abort the gate.
	}
}

function defaultRunGitConfig(): string | null {
	try {
		const out = execSync("git config user.email", {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
			env: cleanGitEnv(),
		}).trim();
		return out.length > 0 ? out : null;
	} catch {
		return null;
	}
}

function defaultGetEnvUser(): string | null {
	const u = process.env.USER;
	return u && u.length > 0 ? u : null;
}

/**
 * Resolve a verified operator identity. Lazy-cached at module level on
 * first call; subsequent calls return the cached value (including a cached
 * null when both sources were absent on first resolution).
 *
 * Returns the discovered identity string, or null if neither source
 * yielded a value. When the result is null, a structured warning is
 * emitted via the supplied (or default) trace pipeline so the absence is
 * operator-visible rather than silent.
 */
export function getVerifiedOperatorIdentity(deps?: VerifiedIdentityDeps): string | null {
	if (cached !== undefined) return cached;

	const runGitConfig = deps?.runGitConfig ?? defaultRunGitConfig;
	const getEnvUser = deps?.getEnvUser ?? defaultGetEnvUser;
	const emitWarning = deps?.emitWarning ?? defaultEmitWarning;

	const fromGit = runGitConfig();
	if (fromGit !== null && fromGit.length > 0) {
		cached = fromGit;
		return cached;
	}

	const fromEnv = getEnvUser();
	if (fromEnv !== null && fromEnv.length > 0) {
		cached = fromEnv;
		return cached;
	}

	cached = null;
	emitWarning(
		"verified-identity: neither git config user.email nor process.env.USER yielded a value; auth-gate identity-stamp will preserve caller-supplied writer.user (unverified)",
	);
	return cached;
}
