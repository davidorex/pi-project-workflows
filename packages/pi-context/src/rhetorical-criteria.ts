/**
 * Write-time enforcement of the two mechanically-checkable rhetorical-register
 * rules this module's decided scope covers:
 *
 *   1. Terseness — word-count caps read from the `x-prompt-budget.words`
 *      annotation, declared either on a named string property or on a
 *      bare-string array's own `items` subschema (each string element is
 *      word-counted against the items cap individually).
 *   2. No provenance / git / prior-state narration in block bodies — a shared
 *      `DEFAULT_PROHIBITED_PATTERNS` regex set, applied to every budgeted
 *      string field and to every element of a budgeted bare-string array.
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

/**
 * Collect, from an item subschema's top-level `properties`, the per-ELEMENT word
 * cap declared on a budgeted bare-string array — a property of `type: "array"`
 * whose `items` subschema is itself `type: "string"` and carries a finite
 * numeric `x-prompt-budget.words`. The returned map's keys are exactly the
 * budgeted bare-string-array fields — the set whose string ELEMENTS the word
 * cap and the universal `DEFAULT_PROHIBITED_PATTERNS` apply to (mirroring how
 * `collectWordCaps`' key set doubles as the prohibited-checked set for scalar
 * fields). Kept a SIBLING of `collectWordCaps` rather than widening it: the two
 * maps feed different loops — scalar caps feed the per-field checks in
 * `checkFieldsAgainstSchema`, element caps feed the per-element loop in
 * `walkNestedArrays`. A bare-string `items` subschema carries no `$ref`, so the
 * budget is read directly off `properties.<key>.items` with no resolver.
 */
function collectArrayElementCaps(itemSchema: Record<string, unknown>): Map<string, number> {
	const caps = new Map<string, number>();
	const props = itemSchema.properties;
	if (!props || typeof props !== "object") return caps;
	for (const [field, specRaw] of Object.entries(props as Record<string, unknown>)) {
		if (!specRaw || typeof specRaw !== "object") continue;
		const spec = specRaw as Record<string, unknown>;
		if (spec.type !== "array") continue;
		const items = spec.items;
		if (!items || typeof items !== "object" || Array.isArray(items)) continue;
		const itemsSpec = items as Record<string, unknown>;
		if (itemsSpec.type !== "string") continue;
		const budget = itemsSpec["x-prompt-budget"];
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
 * The injected nested-array subschema resolver — dereferences
 * `parentSchema.properties[nestedArrayKey].items` against `rootSchema`
 * (handling any `$ref`). Structurally identical to `block-api.ts`'s
 * `resolveNestedItemSchema`, injected (not imported) to keep this module a leaf
 * with no dependency on `block-api.ts`. Because it consumes only the FIRST
 * argument's `properties` bag, it is schema-shape-generic: it can be re-applied
 * with an already-resolved nested subschema as the new "parent" to descend a
 * further level, which is what the recursive `walkNestedArrays` below relies on.
 */
type NestedSchemaResolver = (
	parentSchema: Record<string, unknown>,
	rootSchema: Record<string, unknown>,
	nestedArrayKey: string,
) => Record<string, unknown> | null;

/**
 * Run the three mechanically-checkable rhetorical-register checks against ONE
 * item, governed by ONE resolved subschema (`effectiveSchema`):
 *   (1) word-count caps on every budgeted string field;
 *   (2) the universal `DEFAULT_PROHIBITED_PATTERNS` ban on every budgeted string
 *       field;
 *   (3) each schema-authored `x-rhetorical-criteria.prohibited_patterns` entry on
 *       exactly the fields its `applies_to` names.
 * The first violation throws `RhetoricalValidationError`. Non-string field values
 * are skipped (register-of-authored-prose, not shape). Extracted verbatim from
 * the former inline loop body so it can run both for a changed item against its
 * own effective subschema AND for each inline nested-array element during the
 * `walkNestedArrays` descent.
 */
function checkFieldsAgainstSchema(
	effectiveSchema: Record<string, unknown>,
	item: Record<string, unknown>,
	label: string,
): void {
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

/**
 * Recursively descend into any nested-array properties `item` carries inline,
 * enforcing each nested element against its OWN resolved subschema. For every
 * property of `schema` that is an array-of-items (`spec.type === "array"` with a
 * `spec.items`) AND is actually present as an array on the real `item`, the
 * nested item subschema is resolved via `resolveNested(schema, rootSchema, key)`
 * — re-using the same `resolveNestedItemSchema` resolver, applied with the
 * current level's `schema` as the new "parent" so no per-level resolution logic
 * is duplicated. Each element that is itself a plain object is checked
 * (`checkFieldsAgainstSchema`) and then recursed into — so a budgeted field
 * nested at ANY depth (2 levels today, 3+ in future schemas) is covered without
 * new code.
 *
 * A BUDGETED BARE-STRING array — one whose `items` subschema is `type: "string"`
 * carrying a finite `x-prompt-budget.words` (collected per level by
 * `collectArrayElementCaps`) — takes its own branch instead: each STRING element
 * is word-counted against the items cap and tested against the universal
 * `DEFAULT_PROHIBITED_PATTERNS`, throwing `RhetoricalValidationError` naming the
 * array field. The budget is read straight off `properties.<key>.items` (a bare
 * string items subschema carries no `$ref`, so no resolver pass is needed).
 * Non-string elements inside such an array are skipped — element TYPE is AJV's
 * job upstream, this check is register-of-authored-prose only. Because this
 * function runs both for the changed item itself and recursively for every
 * inline nested object, a budgeted bare-string array is enforced at any depth.
 *
 * Elements that are not plain objects (in the object-element branch), un-budgeted
 * bare-string arrays, and array properties whose subschema does not resolve, are
 * skipped defensively rather than throwing.
 */
function walkNestedArrays(
	schema: Record<string, unknown>,
	item: Record<string, unknown>,
	rootSchema: Record<string, unknown>,
	resolveNested: NestedSchemaResolver,
	label: string,
): void {
	const props = schema.properties;
	if (!props || typeof props !== "object") return;
	const elementCaps = collectArrayElementCaps(schema);
	for (const [key, specRaw] of Object.entries(props as Record<string, unknown>)) {
		if (!specRaw || typeof specRaw !== "object") continue;
		const spec = specRaw as Record<string, unknown>;
		if (spec.type !== "array" || !spec.items) continue;
		const value = item[key];
		if (!Array.isArray(value)) continue;
		const elementCap = elementCaps.get(key);
		if (elementCap !== undefined) {
			// Budgeted bare-string array: the elements themselves are the budgeted
			// values — word-cap and prohibited-pattern check each string directly.
			for (const element of value) {
				if (typeof element !== "string") continue;
				const count = wordCount(element);
				if (count > elementCap) {
					throw new RhetoricalValidationError(
						label,
						key,
						`array element is ${count} words, exceeding the x-prompt-budget cap of ${elementCap} — tighten to the register's terseness demand`,
					);
				}
				for (const { pattern, reason } of DEFAULT_PROHIBITED_PATTERNS) {
					const m = pattern.exec(element);
					if (m) {
						throw new RhetoricalValidationError(
							label,
							key,
							`array element matched prohibited pattern "${m[0]}" — ${reason}`,
						);
					}
				}
			}
			continue;
		}
		const nestedSchema = resolveNested(schema, rootSchema, key);
		if (!nestedSchema) continue;
		for (const element of value) {
			if (!element || typeof element !== "object" || Array.isArray(element)) continue;
			const el = element as Record<string, unknown>;
			checkFieldsAgainstSchema(nestedSchema, el, label);
			walkNestedArrays(nestedSchema, el, rootSchema, resolveNested, label);
		}
	}
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
 *     tested against exactly the fields it names in `applies_to`;
 *   - every element of a budgeted BARE-STRING array — an array property whose
 *     `items` subschema is `type: "string"` with `x-prompt-budget.words` (e.g.
 *     a tasks item's `acceptance_criteria`, a decisions item's `consequences`)
 *     — is word-counted against the items cap and tested against
 *     `DEFAULT_PROHIBITED_PATTERNS` directly, at any nesting depth.
 *
 * Enforcement additionally DESCENDS: after checking the changed item's own
 * fields, it recursively walks every nested-array property the item carries
 * INLINE (e.g. a whole `layer-plans` item written with its required `layers[]`
 * populated), checking each nested element against that nested array's OWN
 * resolved subschema at every depth — so a budgeted field on an inline nested
 * object is enforced even though the write went through the top-level writer,
 * not the dedicated nested-array writer. The descent re-uses the injected
 * resolver applied at each level, so any future 3rd-or-deeper nesting is covered
 * with no new code.
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

		// Check the changed item's own fields against its effective subschema, then
		// recursively descend into any nested-array content it carries inline — each
		// nested element checked against its OWN resolved subschema at every depth.
		checkFieldsAgainstSchema(effectiveSchema, item, label);
		walkNestedArrays(effectiveSchema, item, rootSchema, resolveNested, label);
	}
}
