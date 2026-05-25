/**
 * Unit coverage for the pure read-element primitive (FGAP-103).
 *
 * serializeForRead: pages collections (correct total/hasMore), sets the
 * truncation signal on an over-cap value, and emits the structured greppable
 * footer ONLY when paged and/or truncated (absent otherwise). addressInto:
 * resolves id / key / path and returns a clean found:false on a miss without
 * throwing. No I/O — every assertion operates on inline JS values.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addressInto, READ_ELEMENT_FOOTER_PREFIX, serializeForRead } from "./read-element.js";

describe("read-element: serializeForRead paging", () => {
	it("pages a >limit array: hasMore true, correct total, structured footer", () => {
		const arr = Array.from({ length: 130 }, (_, i) => ({ id: `X-${i}`, n: i }));
		const env = serializeForRead(arr, { offset: 0, limit: 50 });
		assert.equal(env.total, 130);
		assert.equal(env.hasMore, true);
		const body = JSON.parse(env.content.split(READ_ELEMENT_FOOTER_PREFIX)[0]!) as unknown[];
		assert.equal(body.length, 50, "page slice should be limit-sized");
		assert.ok(env.content.includes(READ_ELEMENT_FOOTER_PREFIX), "footer present when paged");
		assert.ok(/showing 1-50 of 130 · hasMore=true/.test(env.content), "footer reports range + hasMore");
	});

	it("discovers the single top-level array on an object and pages it", () => {
		const obj = { tasks: Array.from({ length: 60 }, (_, i) => ({ id: `T-${i}` })) };
		const env = serializeForRead(obj, { limit: 25 });
		assert.equal(env.total, 60);
		assert.equal(env.hasMore, true);
		const body = JSON.parse(env.content.split(READ_ELEMENT_FOOTER_PREFIX)[0]!) as unknown[];
		assert.equal(body.length, 25);
	});

	it("last page: hasMore false; no page footer when the whole collection is shown", () => {
		const arr = Array.from({ length: 10 }, (_, i) => ({ id: `Y-${i}` }));
		const env = serializeForRead(arr, { offset: 0, limit: 50 });
		assert.equal(env.total, 10);
		assert.equal(env.hasMore, false);
		assert.ok(!env.content.includes(READ_ELEMENT_FOOTER_PREFIX), "no footer when whole collection fits");
	});

	it("honors itemsKey to page a named array", () => {
		const obj = { meta: { x: 1 }, rows: Array.from({ length: 40 }, (_, i) => i) };
		const env = serializeForRead(obj, { itemsKey: "rows", limit: 10 });
		assert.equal(env.total, 40);
		assert.equal(env.hasMore, true);
	});
});

describe("read-element: serializeForRead truncation", () => {
	it("sets truncated/totalBytes on an over-cap value and emits the truncation footer", () => {
		// Build a single object well past the 50KB byte cap (no array → whole-object path).
		const big: Record<string, string> = {};
		for (let i = 0; i < 4000; i++) big[`k${i}`] = "x".repeat(40);
		const env = serializeForRead(big);
		assert.equal(env.truncated, true);
		assert.ok(env.totalBytes > 50_000, "totalBytes reflects the un-capped size");
		assert.ok(env.content.includes(`${READ_ELEMENT_FOOTER_PREFIX} truncated at`), "truncation footer present");
	});

	it("no footer at all for a small whole object", () => {
		const env = serializeForRead({ a: 1, b: "two" });
		assert.equal(env.truncated, false);
		assert.equal(env.total, undefined);
		assert.ok(!env.content.includes(READ_ELEMENT_FOOTER_PREFIX), "no footer when neither paged nor truncated");
	});
});

describe("read-element: addressInto", () => {
	it("resolves an element by id inside an array", () => {
		const arr = [
			{ id: "A-1", v: 1 },
			{ id: "A-2", v: 2 },
		];
		const r = addressInto(arr, { id: "A-2" });
		assert.equal(r.found, true);
		assert.deepEqual(r.value, { id: "A-2", v: 2 });
	});

	it("resolves an element by id via canonical_id and through a single-array object", () => {
		const cfg = { relation_types: [{ canonical_id: "task_verified_by" }, { canonical_id: "phase_depends_on" }] };
		const r = addressInto(cfg, { id: "phase_depends_on" });
		assert.equal(r.found, true);
		assert.deepEqual(r.value, { canonical_id: "phase_depends_on" });
	});

	it("resolves an object property by key", () => {
		const cfg = { relation_types: [{ canonical_id: "x" }], status_buckets: { open: ["identified"] } };
		const r = addressInto(cfg, { key: "status_buckets" });
		assert.equal(r.found, true);
		assert.deepEqual(r.value, { open: ["identified"] });
	});

	it("resolves a config-registry entry by key matching canonical_id", () => {
		const registry = [{ canonical_id: "tasks", title: "Tasks" }];
		const r = addressInto(registry, { key: "tasks" });
		assert.equal(r.found, true);
		assert.deepEqual(r.value, { canonical_id: "tasks", title: "Tasks" });
	});

	it("walks a dotted/bracket path", () => {
		const schema = { properties: { tasks: { items: { properties: { status: { type: "string" } } } } } };
		const r = addressInto(schema, { path: "properties.tasks.items.properties.status" });
		assert.equal(r.found, true);
		assert.deepEqual(r.value, { type: "string" });

		const nested = { a: [{ b: { c: 42 } }] };
		const r2 = addressInto(nested, { path: "a[0].b.c" });
		assert.equal(r2.found, true);
		assert.equal(r2.value, 42);
	});

	it("returns found:false (no throw) on a miss for id / key / path", () => {
		assert.equal(addressInto([{ id: "A-1" }], { id: "A-9" }).found, false);
		assert.equal(addressInto({ x: 1 }, { key: "y" }).found, false);
		assert.equal(addressInto({ a: { b: 1 } }, { path: "a.c.d" }).found, false);
		// addressing a scalar / non-collection by id
		assert.equal(addressInto(42, { id: "anything" }).found, false);
	});
});
