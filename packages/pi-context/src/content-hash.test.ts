/**
 * Content-hash primitive tests (Cycle 2 / Phase A). Pure-module shape (no fs).
 * Proves the JCS property that gives the content hash its identity meaning:
 * key insertion order does not affect the hash; equal content hashes equally;
 * different content hashes differently; nesting preserves key-order
 * insensitivity.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canonicalJson, computeContentHash, sha256Hex } from "./content-hash.js";

describe("content-hash", () => {
	it("canonicalJson sorts keys: {a,b} and {b,a} produce identical canonical strings", () => {
		assert.equal(canonicalJson({ a: 1, b: 2 }), canonicalJson({ b: 2, a: 1 }));
	});

	it("computeContentHash is key-order stable for a flat object", () => {
		assert.equal(computeContentHash({ a: 1, b: 2 }), computeContentHash({ b: 2, a: 1 }));
	});

	it("computeContentHash is deterministic across repeated calls", () => {
		const c = { title: "x", n: 3, list: [1, 2, 3] };
		assert.equal(computeContentHash(c), computeContentHash(c));
		assert.equal(computeContentHash(c), computeContentHash({ ...c }));
	});

	it("different content yields a different hash", () => {
		assert.notEqual(computeContentHash({ a: 1 }), computeContentHash({ a: 2 }));
		assert.notEqual(computeContentHash({ a: 1 }), computeContentHash({ a: 1, b: 1 }));
	});

	it("nested-object key-order is stable (recursive canonicalization)", () => {
		const x = { outer: { a: 1, b: { c: 2, d: 3 } }, tail: [{ p: 1, q: 2 }] };
		const y = { tail: [{ q: 2, p: 1 }], outer: { b: { d: 3, c: 2 }, a: 1 } };
		assert.equal(computeContentHash(x), computeContentHash(y));
	});

	it("array element order is significant (arrays are ordered, not sorted)", () => {
		assert.notEqual(computeContentHash({ list: [1, 2] }), computeContentHash({ list: [2, 1] }));
	});

	it("sha256Hex returns lowercase 64-char hex", () => {
		const h = sha256Hex(canonicalJson({ a: 1 }));
		assert.match(h, /^[0-9a-f]{64}$/);
	});

	it("canonicalJson throws on a value not representable as canonical JSON", () => {
		assert.throws(() => canonicalJson(undefined));
	});
});
