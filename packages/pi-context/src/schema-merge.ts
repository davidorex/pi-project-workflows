/**
 * Deterministic key/path-level draft-07 3-way schema merge (FEAT-006 T3 —
 * TASK-036). Pure, no I/O: given the recorded merge BASE (the installed-from
 * baseline schema body), OURS (the currently-installed, locally-edited body),
 * and THEIRS (the catalog's current body), produce a merged body plus the set of
 * irreconcilable per-path conflicts.
 *
 * Value equality throughout is canonical-JSON equality (`canonicalJson(a) ===
 * canonicalJson(b)`) so structurally-equal-but-key-reordered values compare
 * equal and the merge is order-insensitive + deterministic.
 *
 * The caller (`updateContext`) writes the merged body ONLY when the returned
 * conflict set is empty; a non-empty conflict set means the merged body is left
 * as OURS at the conflicting node(s) and the caller refrains from writing.
 */
import { canonicalJson } from "./content-hash.js";

/** An irreconcilable 3-way disagreement at a single dotted schema path. */
export interface SchemaConflict {
	/** Dotted path from the schema root (e.g. `properties.status.type`). */
	path: string;
	/** The value at this path in the recorded merge base. */
	base: unknown;
	/** The value at this path in the currently-installed (locally-edited) body. */
	ours: unknown;
	/** The value at this path in the catalog's current body. */
	theirs: unknown;
}

/**
 * Module-private absent-key sentinel. A unique object (referential identity) so
 * no representable JSON value can collide with "this key is absent on this
 * side"; distinct from `null`/`undefined`, both of which are legitimate present
 * values in a JSON document.
 */
const MISSING: unique symbol = Symbol("schema-merge:MISSING");
type Slot = unknown | typeof MISSING;

function isMissing(v: Slot): v is typeof MISSING {
	return v === MISSING;
}

/** A plain JSON object: not MISSING, not null, not an array. */
function isPlainObject(v: Slot): v is Record<string, unknown> {
	return !isMissing(v) && typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Present-and-an-array. */
function isArrayValue(v: Slot): v is unknown[] {
	return !isMissing(v) && Array.isArray(v);
}

/** Canonical-JSON value equality (both sides must be present). */
function valuesEqual(a: unknown, b: unknown): boolean {
	return canonicalJson(a) === canonicalJson(b);
}

/** `obj[key]` if the key is an own property, else MISSING. */
function get(obj: Record<string, unknown>, key: string): Slot {
	return Object.hasOwn(obj, key) ? obj[key] : MISSING;
}

/**
 * Whether the node at `path` (with the present sides all arrays) is a SET-ARRAY:
 * an array whose order/duplication is not semantically meaningful, mergeable as
 * a set. Applies when the LAST path segment is `required` or `enum`, OR when the
 * path's last segment is `type` (a `type` whose value is an array is a JSON
 * Schema type-union list — set-semantic).
 */
function isSetArrayPath(path: string): boolean {
	const last = path.includes(".") ? path.slice(path.lastIndexOf(".") + 1) : path;
	return last === "required" || last === "enum" || last === "type";
}

/**
 * 3-way set merge honoring adds AND removes, conflict-free:
 *   result = (ours ∩ theirs) ∪ (ours \ base) ∪ (theirs \ base)
 * Element identity is canonical-JSON. The result is returned as an array sorted
 * by each element's canonical JSON for determinism. A MISSING base is treated as
 * the empty set.
 */
function mergeSetArray(base: Slot, ours: unknown[], theirs: unknown[]): unknown[] {
	const baseArr = isArrayValue(base) ? base : [];
	const baseKeys = new Set(baseArr.map((e) => canonicalJson(e)));
	const oursByKey = new Map<string, unknown>();
	for (const e of ours) oursByKey.set(canonicalJson(e), e);
	const theirsByKey = new Map<string, unknown>();
	for (const e of theirs) theirsByKey.set(canonicalJson(e), e);

	const resultByKey = new Map<string, unknown>();
	// (ours ∩ theirs): survivors present on both edited sides.
	for (const [k, e] of oursByKey) {
		if (theirsByKey.has(k)) resultByKey.set(k, e);
	}
	// (ours \ base): additions ours made.
	for (const [k, e] of oursByKey) {
		if (!baseKeys.has(k)) resultByKey.set(k, e);
	}
	// (theirs \ base): additions theirs made.
	for (const [k, e] of theirsByKey) {
		if (!baseKeys.has(k)) resultByKey.set(k, e);
	}

	const keys = [...resultByKey.keys()].sort();
	return keys.map((k) => resultByKey.get(k));
}

/**
 * Recursive 3-way merge of one node. Pushes any irreconcilable disagreement onto
 * the shared `conflicts` array (tagged with `path`) and returns the merged value
 * (which may be the MISSING sentinel to signal a key deletion to the parent
 * object-merge).
 */
function merge3(base: Slot, ours: Slot, theirs: Slot, path: string, conflicts: SchemaConflict[]): Slot {
	const basePresent = !isMissing(base);
	const oursPresent = !isMissing(ours);
	const theirsPresent = !isMissing(theirs);

	// --- Add / remove handling (at least one side MISSING) ---------------------
	if (!(basePresent && oursPresent && theirsPresent)) {
		const presentCount = (basePresent ? 1 : 0) + (oursPresent ? 1 : 0) + (theirsPresent ? 1 : 0);
		if (presentCount === 0) return MISSING; // (cannot occur from a present parent)
		if (presentCount === 1) {
			// Present on exactly one side → take that side's value.
			return oursPresent ? ours : theirsPresent ? theirs : base;
		}
		// presentCount === 2: exactly one side is MISSING.
		if (!basePresent) {
			// Both ours + theirs added this key (base absent). Equal adds converge;
			// differing adds conflict.
			if (valuesEqual(ours, theirs)) return ours;
			conflicts.push({ path, base: undefined, ours, theirs });
			return ours;
		}
		// One of ours/theirs removed the key; the OTHER (non-base) side is present.
		const otherPresent = oursPresent ? ours : theirs;
		if (valuesEqual(base, otherPresent)) {
			// The surviving side left the value unchanged vs base ⇒ honor the removal.
			return MISSING;
		}
		// Delete-vs-modify: one side removed it while the other changed it → conflict.
		conflicts.push({ path, base, ours, theirs });
		return ours;
	}

	// --- All three present -----------------------------------------------------

	// Plain-object node: recurse per key over the sorted union.
	if (isPlainObject(base) && isPlainObject(ours) && isPlainObject(theirs)) {
		const keys = [...new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)])].sort();
		const out: Record<string, unknown> = {};
		for (const k of keys) {
			const childPath = path ? `${path}.${k}` : k;
			const merged = merge3(get(base, k), get(ours, k), get(theirs, k), childPath, conflicts);
			if (!isMissing(merged)) out[k] = merged; // omit deleted keys
		}
		return out;
	}

	// SET-ARRAY node: required / enum / type-union list, all-three-arrays.
	if (isSetArrayPath(path) && isArrayValue(base) && isArrayValue(ours) && isArrayValue(theirs)) {
		return mergeSetArray(base, ours, theirs);
	}

	// --- Atomic 3-way (scalars; non-set arrays like allOf/anyOf/oneOf/
	// x-lifecycle.transitions; object-vs-scalar kind mismatch) -----------------
	if (valuesEqual(base, ours)) return theirs; // ours unchanged → take theirs
	if (valuesEqual(base, theirs)) return ours; // theirs unchanged → take ours
	if (valuesEqual(ours, theirs)) return ours; // both changed the same way → converged
	conflicts.push({ path, base, ours, theirs });
	return ours; // leave the conflicting node as ours
}

/**
 * Deterministic 3-way merge of three draft-07 schema bodies.
 *
 * @param base   the recorded merge baseline body
 * @param ours   the currently-installed (locally-edited) body
 * @param theirs the catalog's current body
 * @returns `{ merged, conflicts }` — `merged` is the merged object (conflicting
 *          nodes left as OURS); `conflicts` is the per-path disagreement set. The
 *          caller writes `merged` only when `conflicts` is empty.
 */
export function mergeSchema(
	base: Record<string, unknown>,
	ours: Record<string, unknown>,
	theirs: Record<string, unknown>,
): { merged: Record<string, unknown>; conflicts: SchemaConflict[] } {
	const conflicts: SchemaConflict[] = [];
	const merged = merge3(base, ours, theirs, "", conflicts);
	// The top-level call is over three objects, so merge3 returns an object
	// (never MISSING — the three roots are present plain objects in every
	// caller path; a defensive empty-object fallback keeps the return typed).
	return {
		merged: isPlainObject(merged) ? (merged as Record<string, unknown>) : {},
		conflicts,
	};
}
