/**
 * Unit tests for verified-identity.
 *
 * Aim: exercise the resolution-source cascade (git config → USER env →
 * null+warning) + the module-level cache. Tests pass stub deps via the
 * dependency-injection surface so no real git invocation or process.env
 * mutation is needed; each test resets the cache via the exported helper
 * before invoking the resolver to keep tests order-independent.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { _resetVerifiedIdentityCache, getVerifiedOperatorIdentity } from "./verified-identity.js";

beforeEach(() => {
	_resetVerifiedIdentityCache();
});

describe("verified-identity — source cascade", () => {
	it("returns the git config email when the git surface yields a value (preferred source)", () => {
		const calls = { git: 0, env: 0, warn: 0 };
		const result = getVerifiedOperatorIdentity({
			runGitConfig: () => {
				calls.git += 1;
				return "tester@example.com";
			},
			getEnvUser: () => {
				calls.env += 1;
				return "fallback-user";
			},
			emitWarning: () => {
				calls.warn += 1;
			},
		});
		assert.strictEqual(result, "tester@example.com");
		assert.strictEqual(calls.git, 1);
		assert.strictEqual(calls.env, 0, "env fallback must NOT be probed when git succeeds");
		assert.strictEqual(calls.warn, 0, "no warning must be emitted on the happy path");
	});

	it("falls back to the USER env when git config returns null", () => {
		const calls = { warn: 0 };
		const result = getVerifiedOperatorIdentity({
			runGitConfig: () => null,
			getEnvUser: () => "envuser",
			emitWarning: () => {
				calls.warn += 1;
			},
		});
		assert.strictEqual(result, "envuser");
		assert.strictEqual(calls.warn, 0, "fallback to env is not a warning condition");
	});

	it("returns null and emits a structured warning when both sources are absent", () => {
		const warnings: string[] = [];
		const result = getVerifiedOperatorIdentity({
			runGitConfig: () => null,
			getEnvUser: () => null,
			emitWarning: (msg) => warnings.push(msg),
		});
		assert.strictEqual(result, null);
		assert.strictEqual(warnings.length, 1, "exactly one warning on resolution failure");
		assert.match(warnings[0], /verified-identity/);
		assert.match(warnings[0], /neither git config user\.email nor process\.env\.USER/);
	});

	it("treats empty-string returns as absent and falls through", () => {
		const result = getVerifiedOperatorIdentity({
			runGitConfig: () => "",
			getEnvUser: () => "envuser",
			emitWarning: () => {},
		});
		assert.strictEqual(result, "envuser");
	});
});

describe("verified-identity — module-level cache", () => {
	it("returns the cached value on second call without re-invoking the resolution surfaces", () => {
		const calls = { git: 0, env: 0, warn: 0 };
		const first = getVerifiedOperatorIdentity({
			runGitConfig: () => {
				calls.git += 1;
				return "first@example.com";
			},
			getEnvUser: () => {
				calls.env += 1;
				return null;
			},
			emitWarning: () => {
				calls.warn += 1;
			},
		});
		// Second call: even if deps would now return a different value, the cache wins.
		const second = getVerifiedOperatorIdentity({
			runGitConfig: () => {
				calls.git += 1;
				return "drifted@example.com";
			},
			getEnvUser: () => {
				calls.env += 1;
				return "drifted-user";
			},
			emitWarning: () => {
				calls.warn += 1;
			},
		});
		assert.strictEqual(first, "first@example.com");
		assert.strictEqual(second, "first@example.com");
		assert.strictEqual(calls.git, 1, "git surface invoked exactly once across both calls");
		assert.strictEqual(calls.env, 0);
		assert.strictEqual(calls.warn, 0);
	});

	it("caches null when both sources were absent on first resolution; warning fires only once", () => {
		const warnings: string[] = [];
		const first = getVerifiedOperatorIdentity({
			runGitConfig: () => null,
			getEnvUser: () => null,
			emitWarning: (msg) => warnings.push(msg),
		});
		const second = getVerifiedOperatorIdentity({
			runGitConfig: () => "now@example.com",
			getEnvUser: () => "now-user",
			emitWarning: (msg) => warnings.push(msg),
		});
		assert.strictEqual(first, null);
		assert.strictEqual(second, null, "cached-null wins over a later-recoverable identity until cache reset");
		assert.strictEqual(warnings.length, 1, "warning fires once on initial resolution, not on cached hits");
	});

	it("_resetVerifiedIdentityCache clears the cache for the next call", () => {
		const result1 = getVerifiedOperatorIdentity({
			runGitConfig: () => "first@example.com",
			getEnvUser: () => null,
			emitWarning: () => {},
		});
		_resetVerifiedIdentityCache();
		const result2 = getVerifiedOperatorIdentity({
			runGitConfig: () => "second@example.com",
			getEnvUser: () => null,
			emitWarning: () => {},
		});
		assert.strictEqual(result1, "first@example.com");
		assert.strictEqual(result2, "second@example.com");
	});
});
