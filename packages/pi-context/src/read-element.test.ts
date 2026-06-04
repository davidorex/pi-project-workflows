/**
 * Unit coverage for the pure read-element primitive (FGAP-103).
 *
 * serializeForRead: pages collections (correct total/hasMore), emits the
 * structured greppable paging footer ONLY when paged (absent otherwise), and
 * FAILS CLOSED on an over-cap value (FGAP-089) — directive-only refusal with NO
 * partial body when a narrowing tool is named, else an unmissable head-leading
 * marked partial; both set complete:false. addressInto: resolves id / key /
 * path and returns a clean found:false on a miss without throwing. No I/O —
 * every assertion operates on inline JS values.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	addressInto,
	pageArray,
	READ_ELEMENT_FOOTER_PREFIX,
	serializeForRead,
	structureForRead,
} from "./read-element.js";

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

	it("multi-array wrapper falls back to whole-object (no throw, no paging)", () => {
		const obj = { tools: [{ name: "a" }], active: ["a"], total: 1 };
		const env = serializeForRead(obj);
		assert.equal(env.total, undefined, "wrapper with two arrays is not paged");
		const parsed = JSON.parse(env.content) as Record<string, unknown>;
		assert.deepEqual(parsed.active, ["a"], "wrapper fields preserved");
		assert.equal((parsed.tools as unknown[]).length, 1);
	});

	it("whole:true forces whole-object serialization for an already-paged result", () => {
		const page = { items: Array.from({ length: 80 }, (_, i) => i), total: 80, hasMore: false };
		const env = serializeForRead(page, { whole: true });
		assert.equal(env.total, undefined, "whole skips re-paging");
		const parsed = JSON.parse(env.content) as Record<string, unknown>;
		assert.equal((parsed.items as unknown[]).length, 80, "items survive intact");
		assert.equal(parsed.hasMore, false);
	});
});

describe("read-element: serializeForRead over-cap fail-closed (FGAP-089)", () => {
	// A single object well past the 50KB byte cap whose values carry a unique,
	// greppable filler marker; the marker MUST be absent from a refusal body.
	const FILLER = "FAILCLOSED_FILLER_MARKER_";
	const buildBig = (): Record<string, string> => {
		const big: Record<string, string> = {};
		for (let i = 0; i < 4000; i++) big[`k${i}`] = FILLER + "x".repeat(40);
		return big;
	};

	it("over-cap WITH overCapDirective → REFUSAL, NO partial body, names the tool, complete:false", () => {
		const big = buildBig();
		const env = serializeForRead(big, {
			label: "samples catalog",
			overCapDirective: { tool: "read-samples-catalog", hint: "kind=<canonical_id>" },
		});
		assert.equal(env.truncated, true);
		assert.equal(env.complete, false, "over-cap is not complete");
		assert.ok(env.totalBytes > 50_000, "totalBytes reflects the un-capped size");
		assert.ok(env.content.includes("READ REFUSED"), "refusal marker present");
		assert.ok(env.content.includes("read-samples-catalog"), "names the narrowing tool");
		// THE load-bearing assertion: no serialized body leaked into the refusal.
		assert.ok(
			!env.content.includes(FILLER),
			"refusal must NOT contain any of the serialized payload (no partial body)",
		);
	});

	it("over-cap directive renders params as key=value pairs", () => {
		const big = buildBig();
		const env = serializeForRead(big, {
			label: "<substrate-dir>/framework-gaps.json",
			overCapDirective: {
				tool: "read-block-page",
				params: { block: "framework-gaps", offset: 0, limit: 50 },
				hint: "or read-block-item with id=<id>",
			},
		});
		assert.ok(env.content.includes("block=framework-gaps"), "params rendered as key=value");
		assert.ok(env.content.includes("offset=0"));
		assert.ok(env.content.includes("limit=50"));
		assert.ok(env.content.includes("read-block-item with id=<id>"), "hint appended");
		assert.ok(!env.content.includes(FILLER), "still no partial body");
	});

	it("over-cap WITHOUT directive (edge) → head-leading marked partial, complete:false", () => {
		const big = buildBig();
		const env = serializeForRead(big, { label: "resolved ids" });
		assert.equal(env.truncated, true);
		assert.equal(env.complete, false, "over-cap is not complete");
		// THE load-bearing assertion: the warning LEADS the content (head-leading,
		// not a trailing footer that gets skimmed past).
		assert.ok(env.content.startsWith("⚠️ PARTIAL READ"), "warning marker is head-leading");
		assert.ok(env.content.includes("INCOMPLETE"), "head explicitly marked incomplete");
		// The edge case still surfaces the head (structure visibility), so the
		// filler IS present here — but only AFTER the leading warning.
		assert.ok(env.content.includes(FILLER), "edge case surfaces the head after the warning");
	});

	it("under-cap → full content, complete:true, no warning", () => {
		const env = serializeForRead({ a: 1, b: "two" });
		assert.equal(env.truncated, false);
		assert.equal(env.complete, true, "under-cap is complete");
		assert.equal(env.total, undefined);
		assert.ok(!env.content.includes(READ_ELEMENT_FOOTER_PREFIX), "no footer when neither paged nor truncated");
		assert.ok(!env.content.includes("READ REFUSED") && !env.content.includes("PARTIAL READ"), "no warning markers");
	});

	it("paged-not-truncated → complete:true, paging footer present, hasMore correct", () => {
		const arr = Array.from({ length: 130 }, (_, i) => ({ id: `P-${i}`, n: i }));
		const env = serializeForRead(arr, { offset: 0, limit: 50 });
		assert.equal(env.truncated, false, "a normal page is not over-cap-truncated");
		assert.equal(env.complete, true, "the page itself is complete");
		assert.equal(env.hasMore, true, "more pages exist");
		assert.ok(env.content.includes(READ_ELEMENT_FOOTER_PREFIX), "paging footer present");
		assert.ok(/showing 1-50 of 130 · hasMore=true/.test(env.content), "footer reports range + hasMore");
	});

	// ── structured `data` MUST fail closed on over-cap (the `--json` leak guard) ──
	// structureForRead's `data` feeds the CLI `--json` envelope directly (it never
	// routes through cappedContent). Pre-fix it carried the FULL un-truncated value
	// past the 50KB cap, defeating the FGAP-089 fail-closed under `--json`. On
	// over-cap `data` must be null (no unbounded value, no misleading partial);
	// the metadata stays as computed.
	it("structureForRead over-cap WITH overCapDirective → data null, truncated true, complete false", () => {
		const big = buildBig();
		const s = structureForRead(big, {
			label: "samples catalog",
			overCapDirective: { tool: "read-samples-catalog", hint: "kind=<canonical_id>" },
		});
		assert.equal(s.data, null, "over-cap REFUSAL bounds data to null (no unbounded value under --json)");
		assert.equal(s.truncated, true);
		assert.equal(s.complete, false);
		assert.ok(s.totalBytes > 50 * 1024, "totalBytes reflects the un-capped size");
	});

	it("structureForRead over-cap WITHOUT directive (edge PARTIAL) → data null, truncated true, complete false", () => {
		const big = buildBig();
		const s = structureForRead(big, { label: "resolved ids" });
		assert.equal(s.data, null, "over-cap PARTIAL also bounds data to null on the --json surface");
		assert.equal(s.truncated, true);
		assert.equal(s.complete, false);
		assert.ok(s.totalBytes > 50 * 1024);
	});

	it("structureForRead under-cap → data deep-equals the full value, truncated false", () => {
		const value = { a: 1, b: "two", nested: { c: [1, 2, 3] } };
		const s = structureForRead(value);
		assert.deepEqual(s.data, value, "under-cap keeps the full value intact");
		assert.equal(s.truncated, false);
		assert.equal(s.complete, true);
	});
});

describe("read-element: pageArray (shared pagination math)", () => {
	it("windows with full total + hasMore (offset 10 limit 20 over 100)", () => {
		const arr = Array.from({ length: 100 }, (_, i) => i);
		const p = pageArray(arr, { offset: 10, limit: 20 });
		assert.equal(p.total, 100);
		assert.equal(p.items.length, 20);
		assert.equal(p.items[0], 10);
		assert.equal(p.hasMore, true);
	});

	it("partial last page → hasMore false; defaults offset 0 / limit 50", () => {
		const arr = Array.from({ length: 30 }, (_, i) => i);
		const p = pageArray(arr);
		assert.equal(p.total, 30);
		assert.equal(p.items.length, 30);
		assert.equal(p.hasMore, false);
	});

	it("offset >= total → empty items, correct total", () => {
		const p = pageArray([1, 2, 3], { offset: 5, limit: 10 });
		assert.deepEqual(p.items, []);
		assert.equal(p.total, 3);
		assert.equal(p.hasMore, false);
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
