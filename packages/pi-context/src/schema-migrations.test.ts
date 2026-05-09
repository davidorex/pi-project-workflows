import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { createRegistry, runMigrations } from "./schema-migrations.js";

describe("createRegistry", () => {
	it("returns independent instances per call (no shared global state)", () => {
		const a = createRegistry();
		const b = createRegistry();
		a.register({ schemaName: "x", fromVersion: "1.0.0", toVersion: "1.1.0", migrate: (d) => d });
		assert.throws(() => b.resolve("x", "1.0.0", "1.1.0"), /no migrations registered/);
	});

	it("register + resolve a single edge produces a one-step chain", () => {
		const r = createRegistry();
		const fn = (d: unknown) => ({ ...(d as object), bumped: true });
		r.register({ schemaName: "config", fromVersion: "1.0.0", toVersion: "1.1.0", migrate: fn });
		const chain = r.resolve("config", "1.0.0", "1.1.0");
		assert.equal(chain.length, 1);
		assert.deepEqual(chain[0]({ a: 1 }), { a: 1, bumped: true });
	});

	it("resolves multi-step chain across registered edges", () => {
		const r = createRegistry();
		r.register({ schemaName: "x", fromVersion: "1.0.0", toVersion: "1.1.0", migrate: (d) => d });
		r.register({ schemaName: "x", fromVersion: "1.1.0", toVersion: "2.0.0", migrate: (d) => d });
		const chain = r.resolve("x", "1.0.0", "2.0.0");
		assert.equal(chain.length, 2);
	});

	it("currentVersion === targetVersion resolves to empty chain (no migration)", () => {
		const r = createRegistry();
		const chain = r.resolve("x", "1.0.0", "1.0.0");
		assert.equal(chain.length, 0);
	});

	it("rejects duplicate (schemaName, fromVersion) registration", () => {
		const r = createRegistry();
		r.register({ schemaName: "x", fromVersion: "1.0.0", toVersion: "1.1.0", migrate: (d) => d });
		assert.throws(
			() => r.register({ schemaName: "x", fromVersion: "1.0.0", toVersion: "1.2.0", migrate: (d) => d }),
			/duplicate edge/,
		);
	});

	it("throws when no path exists (unreachable target)", () => {
		const r = createRegistry();
		r.register({ schemaName: "x", fromVersion: "1.0.0", toVersion: "1.1.0", migrate: (d) => d });
		assert.throws(() => r.resolve("x", "1.0.0", "5.0.0"), /no path from/);
	});

	it("throws when schema has no registered migrations at all", () => {
		const r = createRegistry();
		assert.throws(() => r.resolve("nonexistent", "1.0.0", "2.0.0"), /no migrations registered/);
	});

	it("detects cycles (1.0.0 → 1.0.0 self-loop)", () => {
		const r = createRegistry();
		// can't register fromVersion === toVersion the way the registry walks,
		// but a 1.0.0 → 1.1.0 → 1.0.0 cycle is a realistic mistake
		r.register({ schemaName: "x", fromVersion: "1.0.0", toVersion: "1.1.0", migrate: (d) => d });
		r.register({ schemaName: "x", fromVersion: "1.1.0", toVersion: "1.0.0", migrate: (d) => d });
		assert.throws(() => r.resolve("x", "1.0.0", "2.0.0"), /cycle detected/);
	});
});

describe("runMigrations", () => {
	it("returns data unchanged when currentVersion === targetVersion (no-op)", () => {
		const r = createRegistry();
		const input = { a: 1 };
		const out = runMigrations(r, "x", "1.0.0", "1.0.0", input);
		assert.equal(out, input); // identity, not just deepEqual
	});

	it("applies a single migration when versions differ by one step", () => {
		const r = createRegistry();
		r.register({
			schemaName: "config",
			fromVersion: "1.0.0",
			toVersion: "1.1.0",
			migrate: (d) => ({ ...(d as object), v: "1.1.0" }),
		});
		const out = runMigrations(r, "config", "1.0.0", "1.1.0", { v: "1.0.0", payload: 7 });
		assert.deepEqual(out, { v: "1.1.0", payload: 7 });
	});

	it("chains 1.0.0 → 1.1.0 → 2.0.0 in order, accumulating transforms", () => {
		const r = createRegistry();
		r.register({
			schemaName: "x",
			fromVersion: "1.0.0",
			toVersion: "1.1.0",
			migrate: (d) => ({ ...(d as object), step1: true }),
		});
		r.register({
			schemaName: "x",
			fromVersion: "1.1.0",
			toVersion: "2.0.0",
			migrate: (d) => ({ ...(d as object), step2: true }),
		});
		const out = runMigrations(r, "x", "1.0.0", "2.0.0", { initial: true });
		assert.deepEqual(out, { initial: true, step1: true, step2: true });
	});

	it("propagates resolve errors when target is unreachable", () => {
		const r = createRegistry();
		r.register({ schemaName: "x", fromVersion: "1.0.0", toVersion: "1.1.0", migrate: (d) => d });
		assert.throws(() => runMigrations(r, "x", "1.0.0", "9.9.9", {}), /no path from/);
	});

	it("propagates resolve errors when schema is unknown", () => {
		const r = createRegistry();
		assert.throws(() => runMigrations(r, "nope", "1.0.0", "2.0.0", {}), /no migrations registered/);
	});
});
