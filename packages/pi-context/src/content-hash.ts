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
import fs from "node:fs";
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

/**
 * Content hash of the JSON value stored at `filePath`:
 * `sha256Hex(canonicalJson(JSON.parse(fs.readFileSync(filePath, "utf8"))))`.
 *
 * Reads the file, parses it as JSON, and hashes its CONTENT via JCS (RFC 8785),
 * so the digest is byte-layout-insensitive — two files whose JSON differs only
 * in key order or whitespace produce the same hash. Used to fingerprint an
 * installed schema file for the install baseline (`config.installed_from.assets`)
 * so later slices can detect installed-vs-catalog drift. Distinct from
 * `computeContentHash`, which takes an already-parsed record; this variant owns
 * the read + parse so callers pass a path.
 */
export function computeFileContentHash(filePath: string): string {
	return sha256Hex(canonicalJson(JSON.parse(fs.readFileSync(filePath, "utf8"))));
}

/**
 * Raw-bytes hash of the file at `filePath`: sha-256 over the exact bytes on
 * disk. The pin/baseline fingerprint for ARBITRARY referenced files (source,
 * markdown, text) — unlike {@link computeFileContentHash}, which parses the
 * file as JSON and hashes its canonical form (and therefore throws on
 * non-JSON). Byte-exact by design: a pinned citation is grounded in the file
 * as it stood, not in a normalization of it.
 */
export function computeFileBytesHash(filePath: string): string {
	return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}
