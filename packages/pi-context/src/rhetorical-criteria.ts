/**
 * Write-time enforcement of the two mechanically-checkable rhetorical-register
 * rules FGAP-043's decided resolution names:
 *
 *   1. Terseness — per-field word-count caps, read from the existing (until now
 *      dormant) `x-prompt-budget.words` field annotation.
 *   2. No provenance / git / prior-state narration in block bodies — a shared
 *      `DEFAULT_PROHIBITED_PATTERNS` regex set, applied to every budgeted field.
 *
 * The remaining four rhetorical-register rules (self-containment, exactness,
 * appropriateness-to-block-type, appropriateness-to-downstream-use) are prose
 * judgements with no mechanical test; they stay human-review-enforced, surfaced
 * through the `x-rhetorical-criteria.register_notes` string a schema carries.
 *
 * `x-rhetorical-criteria` is an AJV-ignored schema extension keyword sitting on
 * a block's item subschema (`properties.<arrayKey>.items`), sibling to the
 * established `x-identity` / `x-lifecycle` / `x-prompt-budget` extension
 * keywords. It carries `downstream_consumer` (who reads this block and why),
 * `register_notes` (block-type-specific elaboration of the register rules), and
 * `prohibited_patterns` (per-block regex bans beyond the universal defaults).
 *
 * Enforcement is diff-scoped by the caller: `validateRhetoricalCriteriaForItems`
 * receives only the item(s) a given write actually created or merged, never the
 * whole reconstructed file. This is the load-bearing safety property — it keeps
 * the check from bricking a future write to any block that already holds a
 * pre-existing (grandfathered) violator on an untouched item.
 */

/**
 * Raised when a write's changed item violates a mechanically-checkable
 * rhetorical-register rule (a word-cap overrun or a prohibited-pattern match).
 * Deliberately distinct from AJV's `ValidationError` — this is a different kind
 * of check (authoring register, not schema shape), so callers and tests can
 * discriminate. Carries the offending `field` and a human-readable `reason` in
 * addition to the composed message.
 */
export class RhetoricalValidationError extends Error {
	readonly label: string;
	readonly field: string;
	readonly reason: string;

	constructor(label: string, field: string, reason: string) {
		super(`${label}: rhetorical-criteria violation on field '${field}': ${reason}`);
		this.name = "RhetoricalValidationError";
		this.label = label;
		this.field = field;
		this.reason = reason;
	}
}

/**
 * The universal prohibited-pattern set enforced on every `x-prompt-budget`-
 * bearing field of every block, derived STRICTLY from rhetorical-register rule 5
 * ("No provenance, git, or prior-state narration in block bodies; never
 * assert-then-refute"). Scope is provenance / git / prior-state narration only —
 * NOT generic hedging. A named, exported constant (no inline hardcoded defaults
 * at the check site) so the enforced ban set is inspectable and testable.
 *
 * Each pattern is case-insensitive and NON-global (no `g` flag) so `.exec` is
 * stateless across reuse. `reason` is surfaced verbatim in the thrown error.
 */
export const DEFAULT_PROHIBITED_PATTERNS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
	{
		pattern: /\bpreviously\b/i,
		reason: "prior-state narration ('previously') — state current content, not its history",
	},
	{
		pattern: /\boriginally\b/i,
		reason: "prior-state narration ('originally') — state current content, not its history",
	},
	{
		pattern: /\bused to (be|say|read|state|have|do)\b/i,
		reason: "prior-state narration ('used to …') — state current content, not its history",
	},
	{
		pattern: /\bno longer\b/i,
		reason: "assert-then-refute / prior-state narration ('no longer') — state what is, not what stopped being",
	},
	{
		pattern: /\bcommit\s+[0-9a-f]{7,40}\b/i,
		reason: "git provenance narration (commit SHA) — block bodies carry current state, not change history",
	},
	{
		pattern: /\bwas (removed|replaced|renamed|deleted|added)\b/i,
		reason: "prior-state / change narration ('was removed/replaced/…') — state current content, not its edit history",
	},
];

/**
 * The structured, schema-authored shape of `x-rhetorical-criteria` after a
 * defensive read. `prohibited_patterns` is always an array (empty when none /
 * malformed); the two free-text fields are present only when validly declared.
 */
export interface RhetoricalCriteria {
	downstream_consumer?: string;
	register_notes?: string;
	prohibited_patterns: Array<{ pattern: string; applies_to: string[]; reason: string }>;
}

/**
 * Read the `x-rhetorical-criteria` extension keyword off an item subschema, if
 * present. Modeled on `readItemMetadataFieldsOverride` (block-api.ts) — same
 * defensive-unwrap shape. Returns `null` when the keyword is absent or not an
 * object; otherwise returns the structured criteria, with only well-formed
 * `prohibited_patterns` entries (string `pattern`, string[] `applies_to`, string
 * `reason`) retained and the free-text fields carried through only when strings.
 */
export function readRhetoricalCriteria(itemSchema: unknown): RhetoricalCriteria | null {
	if (!itemSchema || typeof itemSchema !== "object") return null;
	const raw = (itemSchema as Record<string, unknown>)["x-rhetorical-criteria"];
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
	const rec = raw as Record<string, unknown>;

	const prohibited_patterns: Array<{ pattern: string; applies_to: string[]; reason: string }> = [];
	if (Array.isArray(rec.prohibited_patterns)) {
		for (const entry of rec.prohibited_patterns) {
			if (!entry || typeof entry !== "object") continue;
			const e = entry as Record<string, unknown>;
			if (typeof e.pattern === "string" && Array.isArray(e.applies_to) && typeof e.reason === "string") {
				const applies_to = e.applies_to.filter((f): f is string => typeof f === "string");
				prohibited_patterns.push({ pattern: e.pattern, applies_to, reason: e.reason });
			}
		}
	}

	return {
		downstream_consumer: typeof rec.downstream_consumer === "string" ? rec.downstream_consumer : undefined,
		register_notes: typeof rec.register_notes === "string" ? rec.register_notes : undefined,
		prohibited_patterns,
	};
}

/**
 * Collect, from an item subschema's top-level `properties`, the per-field word
 * cap declared by `x-prompt-budget.words`. Only fields carrying a finite numeric
 * `words` budget are recorded; the returned map's keys are exactly the
 * "budgeted" fields — the set the universal `DEFAULT_PROHIBITED_PATTERNS` also
 * applies to.
 */
function collectWordCaps(itemSchema: Record<string, unknown>): Map<string, number> {
	const caps = new Map<string, number>();
	const props = itemSchema.properties;
	if (!props || typeof props !== "object") return caps;
	for (const [field, specRaw] of Object.entries(props as Record<string, unknown>)) {
		if (!specRaw || typeof specRaw !== "object") continue;
		const budget = (specRaw as Record<string, unknown>)["x-prompt-budget"];
		if (!budget || typeof budget !== "object") continue;
		const words = (budget as Record<string, unknown>).words;
		if (typeof words === "number" && Number.isFinite(words)) {
			caps.set(field, words);
		}
	}
	return caps;
}

/** Whitespace-split word count; empty / whitespace-only string counts as 0. */
function wordCount(value: string): number {
	const trimmed = value.trim();
	return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

/**
 * Enforce the two mechanically-checkable rhetorical-register rules against ONLY
 * the changed item(s) of a write — never the untouched remainder of the file.
 *
 * Each changed entry names the array it lives in: a top-level append/update
 * carries only `arrayKey` and is checked against `topLevelItemSchema`; a
 * nested-array append/update additionally carries `nestedArrayKey`, and is
 * checked against that nested array's OWN item subschema — resolved per-entry
 * via the injected `resolveNested` (which dereferences any `$ref` against
 * `rootSchema`) — NOT the top-level subschema. Checking a nested item against
 * the top-level subschema would leave the nested field's own
 * `x-prompt-budget` / `x-rhetorical-criteria` entirely unenforced, and would
 * apply the wrong word cap to any nested field whose name collides with a
 * differently-budgeted top-level field.
 *
 * For each changed item, against its EFFECTIVE (top-level or nested) subschema:
 *   - every string field carrying `x-prompt-budget.words` is word-counted and
 *     rejected when it exceeds its cap;
 *   - every such budgeted string field is tested against `DEFAULT_PROHIBITED_
 *     PATTERNS` (the universal provenance/git/prior-state ban);
 *   - every schema-authored `x-rhetorical-criteria.prohibited_patterns` entry is
 *     tested against exactly the fields it names in `applies_to`.
 *
 * The first violation throws `RhetoricalValidationError`, naming the exact
 * matched substring / overrun and the reason. `changedItems` whose `item` is not
 * a plain object are skipped defensively (a scalar/array element carries no
 * checkable fields). Fields whose value is not a string are skipped (the check
 * is register-of-authored-prose, not shape — shape is AJV's job upstream).
 *
 * A nested entry whose subschema does not resolve (defensive — an actual nested
 * writer only sets `nestedArrayKey` for a path AJV already validated) is skipped
 * rather than throwing, matching the safe-fallback philosophy for unresolvable
 * schemas. The resolver is injected (rather than imported) to keep this module a
 * leaf with no dependency on `block-api.ts`, which imports from here.
 */
export function validateRhetoricalCriteriaForItems(
	topLevelItemSchema: Record<string, unknown>,
	rootSchema: Record<string, unknown>,
	changedItems: Array<{ arrayKey: string; nestedArrayKey?: string; item: Record<string, unknown> }>,
	label: string,
	resolveNested: (
		topLevelItemSchema: Record<string, unknown>,
		rootSchema: Record<string, unknown>,
		nestedArrayKey: string,
	) => Record<string, unknown> | null,
): void {
	for (const { item, nestedArrayKey } of changedItems) {
		if (!item || typeof item !== "object" || Array.isArray(item)) continue;

		// Resolve the subschema the item is actually governed by: its own nested
		// item subschema when it lives in a nested array, else the top-level one.
		const effectiveSchema = nestedArrayKey
			? resolveNested(topLevelItemSchema, rootSchema, nestedArrayKey)
			: topLevelItemSchema;
		if (!effectiveSchema) continue;

		const criteria = readRhetoricalCriteria(effectiveSchema);
		const wordCaps = collectWordCaps(effectiveSchema);
		const budgetedFields = [...wordCaps.keys()];
		const schemaPatterns = criteria?.prohibited_patterns ?? [];

		// (1) Word-count caps on budgeted string fields.
		for (const [field, cap] of wordCaps) {
			const value = item[field];
			if (typeof value !== "string") continue;
			const count = wordCount(value);
			if (count > cap) {
				throw new RhetoricalValidationError(
					label,
					field,
					`field is ${count} words, exceeding the x-prompt-budget cap of ${cap} — tighten to the register's terseness demand`,
				);
			}
		}

		// (2) Universal provenance/git/prior-state ban on every budgeted string field.
		for (const field of budgetedFields) {
			const value = item[field];
			if (typeof value !== "string") continue;
			for (const { pattern, reason } of DEFAULT_PROHIBITED_PATTERNS) {
				const m = pattern.exec(value);
				if (m) {
					throw new RhetoricalValidationError(label, field, `matched prohibited pattern "${m[0]}" — ${reason}`);
				}
			}
		}

		// (3) Schema-authored per-block prohibited patterns on their named fields.
		for (const { pattern, applies_to, reason } of schemaPatterns) {
			let re: RegExp;
			try {
				re = new RegExp(pattern, "i");
			} catch {
				// A malformed author-supplied pattern is a schema-authoring defect,
				// not a write to reject; skip it rather than block a compliant write.
				continue;
			}
			for (const field of applies_to) {
				const value = item[field];
				if (typeof value !== "string") continue;
				const m = re.exec(value);
				if (m) {
					throw new RhetoricalValidationError(label, field, `matched prohibited pattern "${m[0]}" — ${reason}`);
				}
			}
		}
	}
}
