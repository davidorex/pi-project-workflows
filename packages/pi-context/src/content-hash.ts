/**
 * Content-hash primitives for content-addressed substrate identity (Cycle 2,
 * Phase A). Pure functions with no schema or filesystem knowledge: they map an
 * arbitrary JSON value to a stable, canonical string and then to a SHA-256 hex
 * digest.
 *
 * Canonicalization is RFC 8785 (JSON Canonicalization Scheme) via the
 * `canonicalize` package, NOT `JSON.stringify`. JCS sorts object keys
 * lexicographically by UTF-16 code unit and normalizes number serialization,
 * so two structurally-equal values that differ only in key insertion order (or
 * in numeric formatting) canonicalize to the same string and therefore hash
 * identically. That property is what makes the content hash a faithful
 * identity for a value's content rather than its byte layout.
 *
 * Dormant this cycle: nothing in any write path calls these yet (Cycle 3 wires
 * `computeContentHash(contentProjection(...))`). This module is infrastructure
 * (like block-api) and is intentionally not re-exported from `index.ts`.
 */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

// `canonicalize` ships CJS (`module.exports = fn`) but types it as an ESM
// `export default function`, which the default import cannot bind as callable
// under module:Node16. Consume it via createRequire so the binding matches the
// CJS runtime (require returns the function directly), typed to its real call
// signature (RFC 8785 JCS; returns undefined for non-representable inputs).
const require = createRequire(import.meta.url);
const canonicalize = require("canonicalize") as (input: unknown) => string | undefined;

/**
 * RFC 8785 (JCS) canonical JSON serialization of `value`.
 *
 * `canonicalize` returns `undefined` for inputs JSON itself cannot represent
 * (e.g. a bare `undefined`); content hashing operates on concrete JSON
 * objects, so an `undefined` result is a programming error at the call site
 * rather than a representable content state — surface it loudly instead of
 * hashing the string "undefined".
 */
export function canonicalJson(value: unknown): string {
	const out = canonicalize(value);
	if (typeof out !== "string") {
		throw new Error(
			`canonicalJson: canonicalize() did not return a string (got ${typeof out}); value is not representable as canonical JSON`,
		);
	}
	return out;
}

/**
 * SHA-256 hex digest of an already-canonicalized string. Lowercase hex,
 * 64 characters. Kept separate from `canonicalJson` so callers that already
 * hold a canonical string (e.g. when composing a Merkle node) can hash without
 * re-canonicalizing.
 */
export function sha256Hex(canonical: string): string {
	return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Content hash of a JSON content object: `sha256Hex(canonicalJson(content))`.
 * Key-order- and number-format-insensitive by construction (JCS), so any two
 * objects with equal content produce the same hash regardless of how they were
 * built.
 */
export function computeContentHash(content: Record<string, unknown>): string {
	return sha256Hex(canonicalJson(content));
}
