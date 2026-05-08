// POC B — content-hash skip-detection: 28-line canonicalizer + SHA-256 wrapper.
// Adapted from gsd-build/context-packet src/hasher.ts (MIT). Pattern documented
// in analysis/2026-05-06-context-packet-comparison.md §"Pattern 2".
//
// canonicalize: recursively sort object keys so logically-equal objects with
// different key-insertion orders produce byte-identical JSON. Arrays preserve
// element order (sequence is semantically meaningful).
//
// stripForHash: remove non-semantic fields (timestamps) before hashing so
// that re-running with identical content at different times yields the same
// hash. POC convention: strip `created_at` only; keep id/title/body/status.
//
// computeContentHash: SHA-256 over canonical JSON of stripped item.

import { createHash } from "node:crypto";

export function canonicalize(value: unknown): unknown {
	if (value === null || typeof value !== "object") return value;
	if (Array.isArray(value)) return value.map(canonicalize);
	const obj = value as Record<string, unknown>;
	const sorted: Record<string, unknown> = {};
	for (const key of Object.keys(obj).sort()) sorted[key] = canonicalize(obj[key]);
	return sorted;
}

export function stripForHash(item: Record<string, unknown>): Record<string, unknown> {
	const { created_at: _ts, content_hash: _h, ...rest } = item;
	return rest;
}

export function computeContentHash(item: Record<string, unknown>): string {
	const canonical = JSON.stringify(canonicalize(stripForHash(item)));
	return createHash("sha256").update(canonical).digest("hex");
}
