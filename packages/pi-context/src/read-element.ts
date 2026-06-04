/**
 * read-element — ONE pure, DRY element-read primitive every JSON read surface
 * routes through (FGAP-103). No I/O: it operates only on already-loaded JS
 * values (callers do the file/substrate reads, then hand the value in). This
 * keeps the module unit-testable in isolation and mirrors the orientation.ts
 * precedent (pure transform, no substrate coupling).
 *
 * Two responsibilities:
 *
 *   serializeForRead(value, opts?) → ReadEnvelope
 *     Generalizes the ~13 duplicated `JSON.stringify(...) + truncateHead(...) +
 *     "[Truncated: N bytes…]"` blocks scattered across the tool handlers into
 *     a single serialize+cap path. When the value is a collection it pages by
 *     offset/limit and reports total/hasMore; the prose "[Truncated …]" note
 *     is replaced by a STRUCTURED, machine-parseable + human-readable footer
 *     (prefix `[read-element:`) carrying the same signal (FGAP-089).
 *
 *   addressInto(value, addr) → { found, value, resolved }
 *     Element addressing — fetch ONE registry / property / item / path out of
 *     an already-loaded value rather than read-all-or-nothing. Hand-rolled
 *     (no json-path/key getter exists in deps or repo). Never throws on a
 *     miss; returns { found:false, value:undefined, resolved } so callers can
 *     report a clean "not found" rather than crash.
 *
 * `discoverArrayKey` lives here (the lowest pure layer) and is re-imported by
 * context-sdk.ts so there is exactly ONE copy of the single-top-level-array
 * heuristic shared across filterBlockItems / readBlockPage / serializeForRead.
 */
import { truncateHead } from "./truncate.js";

/**
 * Discover the single top-level array key in a block/object payload. Returns
 * null when there are zero array properties; throws when ambiguous (two or
 * more array properties), since callers cannot proceed without an explicit
 * disambiguation policy. The single-array-key assumption is shared across
 * .project/ block writes (inject-context-items.ts) and the block read surface
 * (filterBlockItems / readBlockPage in context-sdk.ts, which imports this).
 */
export function discoverArrayKey(data: Record<string, unknown>): string | null {
	const arrayKeys = Object.entries(data).filter(([, v]) => Array.isArray(v));
	if (arrayKeys.length === 0) return null;
	if (arrayKeys.length === 1) return arrayKeys[0][0];
	throw new Error(
		`discoverArrayKey: payload has multiple top-level array properties (${arrayKeys
			.map(([k]) => k)
			.join(", ")}); single-array assumption violated`,
	);
}

/**
 * The readable envelope every read surface emits. `content` is the text for
 * the AgentToolResult (JSON body plus a structured footer when paged and/or
 * truncated). The structured fields (`total`/`hasMore`/`truncated`/
 * `totalBytes`) generalize readBlockPage's `{items,total,hasMore}` and add the
 * FGAP-089 truncation signal so consumers (or the agent) can react
 * programmatically rather than parse prose.
 */
export interface ReadEnvelope {
	/** Readable text for the tool result: JSON body + optional structured footer. */
	content: string;
	/** Full element count when `value` was treated as a collection (paged); absent for whole-object reads. */
	total?: number;
	/** Whether more elements exist past this page; absent for whole-object reads. */
	hasMore?: boolean;
	/** Whether truncateHead capped the serialized JSON (50KB / line cap). */
	truncated: boolean;
	/** Total bytes of the un-capped serialized JSON. */
	totalBytes: number;
	/**
	 * Whether the full content was returned (machine-checkable, FGAP-089). True
	 * for every non-over-cap return — including a paged-but-not-truncated page
	 * (the page itself is complete; `hasMore` signals more pages). False ONLY on
	 * the over-CAP fail-closed paths (directive-only refusal, or head-leading
	 * marked partial) where the serialized value did not fit and was either
	 * refused or returned as an explicitly-incomplete head.
	 */
	complete: boolean;
}

/** Stable, greppable footer prefix — keep in sync with consumers/tests. */
export const READ_ELEMENT_FOOTER_PREFIX = "[read-element:";

/**
 * The STRUCTURED read result (TASK-012 / FGAP-013). `data` is the un-stringified,
 * un-footered value — the actual page slice or whole object — so the CLI `--json`
 * envelope can emit a real JSON value instead of a stringified JSON string
 * (no double-encode). The metadata fields mirror {@link ReadEnvelope} exactly:
 * `total`/`hasMore` (paging), `truncated`/`totalBytes` (cap signal), `complete`
 * (machine-checkable full-content flag).
 *
 * The text-rendering inputs serializeForRead needs to reproduce its EXACT prior
 * `content` string (label / offset / overCapDirective / paged / the capped head)
 * are stashed under a private symbol so they are NOT enumerable: JSON.stringify
 * (the CLI `--json` envelope) skips symbol-keyed properties, so `--json` output
 * for a read op carries ONLY the six documented fields, never the render context.
 */
export interface ReadStructured {
	/** The un-stringified value: the page slice (collections) or the whole object. */
	data: unknown;
	/** Full element count when the value was treated as a paged collection; absent for whole-object reads. */
	total?: number;
	/** Whether more elements exist past this page; absent for whole-object reads. */
	hasMore?: boolean;
	/** Whether the serialized JSON exceeded the 50KB / line cap (over-cap fail-closed). */
	truncated: boolean;
	/** Total bytes of the un-capped serialized JSON. */
	totalBytes: number;
	/** Whether the full content was returned (false only on the over-cap fail-closed paths). */
	complete: boolean;
}

/**
 * Text-render context carried (non-enumerably) on a {@link ReadStructured} so
 * {@link renderReadText} can reproduce serializeForRead's exact prior `content`.
 * Not part of the structured `--json` surface.
 */
interface ReadRenderContext {
	/** Defaulted label (`opts.label ?? "result"`) — used in the over-cap REFUSAL/PARTIAL messages. */
	label: string;
	/** Raw `opts.label` (may be undefined/empty) — drives the paging-footer suffix truthiness, byte-for-byte as before. */
	rawLabel?: string;
	offset: number;
	paged: boolean;
	overCapDirective?: SerializeForReadOptions["overCapDirective"];
	/** The capped JSON head (truncateHead output) — used for both the under-cap body and the edge head-leading partial. */
	cappedContent: string;
}

/** Module-private key for the render context — symbol-keyed, so JSON.stringify ignores it. */
const RENDER_CONTEXT = Symbol("read-element:render-context");

/** Attach render context to a ReadStructured under the private symbol (non-enumerable to JSON). */
function withRenderContext(s: ReadStructured, ctx: ReadRenderContext): ReadStructured {
	(s as ReadStructured & { [RENDER_CONTEXT]?: ReadRenderContext })[RENDER_CONTEXT] = ctx;
	return s;
}

export interface SerializeForReadOptions {
	/** Force a specific array property to page over (else auto-discovered). */
	itemsKey?: string;
	/**
	 * Force whole-object serialization — skip collection discovery/paging even
	 * when the value is (or contains) an array. For callers handing in an
	 * ALREADY-paged result (e.g. readBlockPage's {items,total,hasMore}) that must
	 * not be re-paged, or any value whose array is intrinsic, not a page surface.
	 */
	whole?: boolean;
	/** Page start index (default 0). Only meaningful for collections. */
	offset?: number;
	/** Page size (default 50). Only meaningful for collections. */
	limit?: number;
	/** Optional human label included in the footer (e.g. the addressed thing). */
	label?: string;
	/**
	 * Fail-closed narrowing directive (FGAP-089). When set AND the serialized
	 * value exceeds the read cap, serializeForRead returns the DIRECTIVE ONLY —
	 * NO partial body — naming the narrowing tool + addressing the caller should
	 * use instead (a partial read would mislead a constrained agent into
	 * treating a truncated value as complete). Leave UNSET for edge surfaces
	 * that have no finer addressing: those get the unmissable head-leading
	 * marked partial instead.
	 */
	overCapDirective?: {
		/** The tool to call to narrow the read (e.g. "read-block-page"). */
		tool: string;
		/** Concrete params to suggest (rendered as `key=value` pairs). */
		params?: Record<string, string | number>;
		/** Extra free-text guidance appended after the directive. */
		hint?: string;
	};
}

export const DEFAULT_LIMIT = 50;

/** The single pagination result shape: a slice plus full-count metadata. */
export interface PageResult<T> {
	items: T[];
	total: number;
	hasMore: boolean;
}

/**
 * The ONE pagination implementation. Slices `arr` at offset(0)/limit(50) and
 * reports the FULL count as `total` plus `hasMore = offset + limit < total`.
 * Both serializeForRead (text envelope) and readBlockPage (structured page)
 * route through this so there is no parallel paging math.
 */
export function pageArray<T>(arr: T[], opts: { offset?: number; limit?: number } = {}): PageResult<T> {
	const offset = opts.offset ?? 0;
	const limit = opts.limit ?? DEFAULT_LIMIT;
	const total = arr.length;
	return { items: arr.slice(offset, offset + limit), total, hasMore: offset + limit < total };
}

/**
 * Resolve the array to page over: the value itself if it is an array, else the
 * `itemsKey` property if given and array-valued, else the single discoverable
 * top-level array. Returns { collection: false } for whole-object values.
 * `discoverArrayKey` may throw on ambiguity; serializeForRead lets that
 * propagate (the caller's value is malformed for paging).
 */
function resolveCollection(
	value: unknown,
	itemsKey?: string,
): { collection: true; arr: unknown[] } | { collection: false } {
	if (Array.isArray(value)) return { collection: true, arr: value };
	if (value !== null && typeof value === "object") {
		const obj = value as Record<string, unknown>;
		if (itemsKey !== undefined) {
			const candidate = obj[itemsKey];
			if (Array.isArray(candidate)) return { collection: true, arr: candidate };
			return { collection: false };
		}
		// A single top-level array → page it; zero or AMBIGUOUS (multiple) arrays →
		// treat the value as a whole object. serializeForRead must not throw on a
		// multi-array wrapper (e.g. { tools[], active[] }); whole-object is the
		// correct fallback there (callers wanting one array pass itemsKey).
		let key: string | null;
		try {
			key = discoverArrayKey(obj);
		} catch {
			key = null;
		}
		if (key !== null) return { collection: true, arr: obj[key] as unknown[] };
	}
	return { collection: false };
}

/**
 * Serialize an already-loaded value for a read tool result. Collections are
 * paged (offset/limit) and report total/hasMore; non-collections serialize
 * whole. JSON text is capped via truncateHead.
 *
 * Over-CAP reads FAIL CLOSED (FGAP-089): a value that exceeds the 50KB read cap
 * does NOT return a partial body dressed as the whole value. Instead —
 *   - with `overCapDirective`: a directive-only REFUSAL (no body) naming the
 *     narrowing tool + addressing;
 *   - without it (edge surfaces, no finer addressing): an UNMISSABLE
 *     HEAD-LEADING marked partial (warning FIRST, then the head).
 * Both set `complete:false`. Under-cap returns set `complete:true`; a paged
 * (but not over-cap) page is complete and keeps the structured paging footer
 * (prefix `[read-element:`) since the next page is reachable via offset/limit.
 */
export function serializeForRead(value: unknown, opts: SerializeForReadOptions = {}): ReadEnvelope {
	const structured = structureForRead(value, opts);
	return {
		content: renderReadText(structured),
		total: structured.total,
		hasMore: structured.hasMore,
		truncated: structured.truncated,
		totalBytes: structured.totalBytes,
		complete: structured.complete,
	};
}

/**
 * The cap / pagination / metadata computation that previously lived inside
 * serializeForRead, returning the value UN-stringified (TASK-012 / FGAP-013).
 * `data` is the page slice (collections) or the whole object — never stringified,
 * never footered. The metadata fields mirror {@link ReadEnvelope}; the text-render
 * inputs (label / offset / overCapDirective / paged / capped head) ride along
 * under a private symbol so {@link renderReadText} can reproduce the exact prior
 * `content` while JSON.stringify (the CLI `--json` envelope) emits only the six
 * documented structured fields.
 */
export function structureForRead(value: unknown, opts: SerializeForReadOptions = {}): ReadStructured {
	const offset = opts.offset ?? 0;
	const resolved = opts.whole ? ({ collection: false } as const) : resolveCollection(value, opts.itemsKey);

	let serialized: unknown;
	let total: number | undefined;
	let hasMore: boolean | undefined;
	let paged = false;

	if (resolved.collection) {
		// Shared pagination math (pageArray) — no parallel slice/total/hasMore.
		const page = pageArray(resolved.arr, { offset, limit: opts.limit });
		total = page.total;
		hasMore = page.hasMore;
		serialized = page.items;
		// Page-footer only when the page does not show the whole collection.
		paged = offset > 0 || hasMore;
	} else {
		serialized = value;
	}

	const jsonStr = JSON.stringify(serialized, null, 2);
	const cap = truncateHead(jsonStr);
	const label = opts.label ?? "result";

	const renderCtx: ReadRenderContext = {
		label,
		rawLabel: opts.label,
		offset,
		paged,
		overCapDirective: opts.overCapDirective,
		cappedContent: cap.content,
	};

	// Over-cap fail-closed (FGAP-089) → complete:false; under-cap → complete:true.
	// The over-cap REFUSAL/PARTIAL *text* rendering is a renderReadText concern,
	// but the structured `data` must ALSO fail closed: on over-cap (cap.truncated)
	// `data` is bounded to null so the `--json` surface (which emits `data` directly
	// via JSON.stringify, never routing through cappedContent) cannot leak the full
	// un-truncated value past the cap, and a constrained agent never receives a
	// truncated value dressed as complete. Under-cap (incl. paged-but-not-over-cap)
	// keeps the full/page value unchanged. Metadata (truncated/totalBytes/total/
	// hasMore/complete) is unaffected.
	const complete = !cap.truncated;

	return withRenderContext(
		{
			data: cap.truncated ? null : serialized,
			total,
			hasMore,
			truncated: cap.truncated,
			totalBytes: cap.totalBytes,
			complete,
		},
		renderCtx,
	);
}

/**
 * Render a {@link ReadStructured} to the EXACT text serializeForRead's `content`
 * produced before the TASK-012 split: the stringified body + the structured
 * `[read-element:` paging footer, OR — on the over-cap fail-closed paths
 * (FGAP-089) — the directive-only REFUSAL (no body) when a narrowing tool was
 * named, else the head-leading marked PARTIAL. Reads its render inputs from the
 * private symbol attached by {@link structureForRead}.
 */
export function renderReadText(s: ReadStructured): string {
	const ctx = (s as ReadStructured & { [RENDER_CONTEXT]?: ReadRenderContext })[RENDER_CONTEXT];
	// Defensive: a ReadStructured constructed without structureForRead has no
	// render context — fall back to a plain stringify of the data.
	if (ctx === undefined) return JSON.stringify(s.data, null, 2);

	const { label, offset, paged, overCapDirective, cappedContent } = ctx;

	// ── FGAP-089 over-CAP fail-closed path ──────────────────────────────────
	// When the serialized value exceeds the read cap, a partial body must NOT be
	// returned as if it were the whole value — a constrained agent skimmed past
	// the old trailing `[read-element: truncated …]` footer and treated a
	// truncated catalog as complete (degraded info). So an over-cap read fails
	// closed: either a directive-only REFUSAL (when a narrowing tool exists) or
	// an UNMISSABLE HEAD-LEADING marked partial (edge surfaces with no finer
	// addressing). Either way the structured `complete` is false.
	if (s.truncated) {
		if (overCapDirective !== undefined) {
			// Narrowing available → DIRECTIVE ONLY, no serialized body at all.
			const { tool, params, hint } = overCapDirective;
			const paramsString =
				params && Object.keys(params).length > 0
					? Object.entries(params)
							.map(([k, v]) => `${k}=${v}`)
							.join(" ")
					: undefined;
			return (
				`⚠️ READ REFUSED — this ${label} is ${s.totalBytes} bytes, over the 50KB read cap. ` +
				`Nothing was returned (a partial read would mislead). ` +
				`Narrow your read: call \`${tool}\`${paramsString ? ` with ${paramsString}` : ""}.${hint ? ` ${hint}` : ""}`
			);
		}
		// No finer addressing (edge case) → UNMISSABLE HEAD-LEADING marked partial.
		return (
			`⚠️ PARTIAL READ — this ${label} is ${s.totalBytes} bytes, capped at 50KB, and has no finer addressing. ` +
			`The HEAD below is INCOMPLETE — do NOT treat it as the full value:\n\n${cappedContent}`
		);
	}

	// ── Not over-cap: full content (a paged-but-not-truncated page is complete;
	// `hasMore` signals further pages). Paging footer stays — paging is reachable
	// via offset/limit, so it does not fail closed.
	const footers: string[] = [];
	if (paged && s.total !== undefined) {
		// shown range is 1-based inclusive over the served slice
		const shownCount = Array.isArray(s.data) ? s.data.length : 0;
		const from = s.total === 0 ? 0 : offset + 1;
		const to = offset + shownCount;
		const labelSuffix = ctx.rawLabel ? ` · ${ctx.rawLabel}` : "";
		footers.push(
			`\n\n${READ_ELEMENT_FOOTER_PREFIX} showing ${from}-${to} of ${s.total} · hasMore=${s.hasMore}${labelSuffix} · narrow with an address]`,
		);
	}

	return cappedContent + footers.join("");
}

export interface AddressSpec {
	/** Find an element by `.id` (or `.canonical_id`) inside an array / single-array object. */
	id?: string;
	/** Object-property lookup (also matches a config-registry array entry by canonical_id). */
	key?: string;
	/** Dotted/bracket path walk, e.g. `a.b.c` or `a[0].b`. */
	path?: string;
}

export interface AddressResult {
	found: boolean;
	value: unknown;
	/** Human string describing what was addressed (for tool result / footer label). */
	resolved: string;
}

function asArrayOrSingleArray(value: unknown): unknown[] | null {
	if (Array.isArray(value)) return value;
	if (value !== null && typeof value === "object") {
		// Tolerate ambiguity (multiple top-level arrays) → no single addressable
		// array; the caller's other address forms (key/path) still apply.
		let key: string | null;
		try {
			key = discoverArrayKey(value as Record<string, unknown>);
		} catch {
			key = null;
		}
		if (key !== null) return (value as Record<string, unknown>)[key] as unknown[];
	}
	return null;
}

/** Find an array element whose `.id` or `.canonical_id` equals `id`. */
function findById(arr: unknown[], id: string): unknown | undefined {
	return arr.find((el) => {
		if (el === null || typeof el !== "object") return false;
		const o = el as Record<string, unknown>;
		return o.id === id || o.canonical_id === id;
	});
}

/**
 * Parse a dotted/bracket path into segments. `a.b[0].c` →
 * ["a","b","0","c"]. Array indices arrive as numeric-string segments.
 */
function parsePath(path: string): string[] {
	const segments: string[] = [];
	for (const dotPart of path.split(".")) {
		if (dotPart === "") continue;
		// split out bracket indices: `b[0][1]` → "b", "0", "1"
		const bracketRe = /\[([^\]]*)\]/g;
		const base = dotPart.replace(bracketRe, "");
		if (base !== "") segments.push(base);
		for (const m of dotPart.matchAll(bracketRe)) {
			segments.push(m[1]);
		}
	}
	return segments;
}

/**
 * Element addressing over an already-loaded value. Mutually-exclusive address
 * forms (id | key | path); the first present form wins. Never throws on a
 * miss — returns { found:false, value:undefined, resolved } so callers report
 * a clean "not found".
 */
export function addressInto(value: unknown, addr: AddressSpec): AddressResult {
	if (addr.id !== undefined) {
		const arr = asArrayOrSingleArray(value);
		if (arr === null) {
			return { found: false, value: undefined, resolved: `id=${addr.id} (value has no addressable array)` };
		}
		const hit = findById(arr, addr.id);
		return hit === undefined
			? { found: false, value: undefined, resolved: `id=${addr.id} (not found)` }
			: { found: true, value: hit, resolved: `id=${addr.id}` };
	}

	if (addr.key !== undefined) {
		if (value !== null && typeof value === "object" && !Array.isArray(value)) {
			const o = value as Record<string, unknown>;
			if (addr.key in o) return { found: true, value: o[addr.key], resolved: `key=${addr.key}` };
		}
		// Config-registry-style array: match an entry by canonical_id.
		const arr = asArrayOrSingleArray(value);
		if (arr !== null) {
			const hit = arr.find(
				(el) => el !== null && typeof el === "object" && (el as Record<string, unknown>).canonical_id === addr.key,
			);
			if (hit !== undefined) return { found: true, value: hit, resolved: `key=${addr.key} (by canonical_id)` };
		}
		return { found: false, value: undefined, resolved: `key=${addr.key} (not found)` };
	}

	if (addr.path !== undefined) {
		const segments = parsePath(addr.path);
		let cursor: unknown = value;
		const traversed: string[] = [];
		for (const seg of segments) {
			const at = traversed.join(".") || "(root)";
			if (cursor === null || cursor === undefined) {
				return { found: false, value: undefined, resolved: `path=${addr.path} (stopped at ${at})` };
			}
			if (Array.isArray(cursor)) {
				const idx = Number.parseInt(seg, 10);
				if (Number.isNaN(idx) || idx < 0 || idx >= cursor.length) {
					return { found: false, value: undefined, resolved: `path=${addr.path} (no index ${seg} at ${at})` };
				}
				cursor = cursor[idx];
			} else if (typeof cursor === "object") {
				const o = cursor as Record<string, unknown>;
				if (!(seg in o)) {
					return { found: false, value: undefined, resolved: `path=${addr.path} (no key ${seg} at ${at})` };
				}
				cursor = o[seg];
			} else {
				return { found: false, value: undefined, resolved: `path=${addr.path} (scalar at ${at})` };
			}
			traversed.push(seg);
		}
		return { found: true, value: cursor, resolved: `path=${addr.path}` };
	}

	return { found: false, value: undefined, resolved: "(no address provided)" };
}
