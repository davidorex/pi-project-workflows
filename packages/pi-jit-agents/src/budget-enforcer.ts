/**
 * Render-time prompt-budget enforcement primitive.
 *
 * Reads `x-prompt-budget` annotations from a JSON Schema field and, when the
 * rendered output exceeds the declared budget, returns tail-truncated output
 * plus a structured warning. Annotation absence is pass-through; malformed
 * annotations throw with the field path named in the error.
 *
 * Plan 5 of the per-item-macros work ships this primitive plus the schema
 * annotations themselves (`.project/schemas/*.schema.json`). Per-item macros
 * (Plans 6 and 7) consume the primitive to gate field rendering.
 *
 * Token measurement is intentionally a coarse approximation: whitespace +
 * Unicode-punctuation split, not a tokenizer-accurate count tied to any
 * specific model. The aim is a render-time signal, not a billing surface.
 */

export interface PromptBudget {
	tokens?: number;
	words?: number;
}

export interface BudgetWarning {
	field: string;
	budget: PromptBudget;
	actual: { tokens: number; words: number };
	truncated: boolean;
}

export interface BudgetResult {
	output: string;
	warning: BudgetWarning | null;
}

const TRUNCATION_MARKER = "[…truncated to budget]";

/**
 * Approximate token count: split on Unicode whitespace + punctuation, drop empties.
 * Not tokenizer-accurate; meant as a render-time proxy for prompt-size signal.
 */
function countTokens(text: string): number {
	if (text === "") return 0;
	return text.split(/[\s\p{P}]+/u).filter(Boolean).length;
}

/**
 * Word count: whitespace split, drop empties.
 */
function countWords(text: string): number {
	if (text === "") return 0;
	return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Resolve a JSON-pointer-style path against a schema object.
 *
 * Path interpretation:
 * - Leading "/" is optional; treated as the root delimiter.
 * - Segments are split on "/" with no JSON Pointer escape handling
 *   (we do not encounter "~" or "/" inside schema keys in practice).
 * - Each segment is looked up as a property key on the current node.
 * - Returns null if any segment is missing.
 *
 * Example: "/properties/research/items/properties/findings_summary"
 */
function resolveSchemaField(schema: object, fieldPath: string): Record<string, unknown> | null {
	const trimmed = fieldPath.startsWith("/") ? fieldPath.slice(1) : fieldPath;
	if (trimmed === "") return schema as Record<string, unknown>;
	const segments = trimmed.split("/");
	let cursor: unknown = schema;
	for (const segment of segments) {
		if (cursor === null || typeof cursor !== "object") return null;
		const next = (cursor as Record<string, unknown>)[segment];
		if (next === undefined) return null;
		cursor = next;
	}
	if (cursor === null || typeof cursor !== "object") return null;
	return cursor as Record<string, unknown>;
}

/**
 * Validate a raw `x-prompt-budget` annotation into a typed PromptBudget.
 * Throws AgentBudgetError-style Error naming the field on malformed input.
 */
function parseBudget(raw: unknown, fieldPath: string): PromptBudget {
	if (raw === null || typeof raw !== "object") {
		throw new Error(`x-prompt-budget at ${fieldPath} must be an object, got ${typeof raw}`);
	}
	const obj = raw as Record<string, unknown>;
	const out: PromptBudget = {};
	if ("tokens" in obj) {
		const t = obj.tokens;
		if (typeof t !== "number" || !Number.isFinite(t) || t < 0 || !Number.isInteger(t)) {
			throw new Error(
				`x-prompt-budget at ${fieldPath}: tokens must be a non-negative integer, got ${JSON.stringify(t)}`,
			);
		}
		out.tokens = t;
	}
	if ("words" in obj) {
		const w = obj.words;
		if (typeof w !== "number" || !Number.isFinite(w) || w < 0 || !Number.isInteger(w)) {
			throw new Error(
				`x-prompt-budget at ${fieldPath}: words must be a non-negative integer, got ${JSON.stringify(w)}`,
			);
		}
		out.words = w;
	}
	if (out.tokens === undefined && out.words === undefined) {
		throw new Error(`x-prompt-budget at ${fieldPath} declares neither tokens nor words; at least one must be present`);
	}
	return out;
}

/**
 * Tail-truncate `text` so that it fits both `maxTokens` and `maxWords` (when set).
 * Strategy: binary-search the smallest character-prefix length whose token+word
 * counts (with the marker appended) satisfy both budgets. The marker itself
 * adds a small fixed cost that is included in the count.
 *
 * If `text` already fits, returns `text` unchanged with `truncated: false`.
 */
function tailTruncate(text: string, budget: PromptBudget): { output: string; truncated: boolean } {
	const fitsBudget = (s: string): boolean => {
		if (budget.tokens !== undefined && countTokens(s) > budget.tokens) return false;
		if (budget.words !== undefined && countWords(s) > budget.words) return false;
		return true;
	};

	if (fitsBudget(text)) {
		return { output: text, truncated: false };
	}

	// If even the marker alone is over budget, return just the marker (best effort).
	if (!fitsBudget(TRUNCATION_MARKER)) {
		return { output: TRUNCATION_MARKER, truncated: true };
	}

	// Binary-search the largest prefix length such that prefix + " " + marker fits.
	let lo = 0;
	let hi = text.length;
	let best = 0;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		const candidate = `${text.slice(0, mid).trimEnd()} ${TRUNCATION_MARKER}`;
		if (fitsBudget(candidate)) {
			best = mid;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}

	const output = `${text.slice(0, best).trimEnd()} ${TRUNCATION_MARKER}`;
	return { output, truncated: true };
}

/**
 * If the schema field at `fieldPath` declares `x-prompt-budget`, measure
 * `rendered` and return tail-truncated output + warning when over budget.
 * If the field has no annotation, return `{ output: rendered, warning: null }`.
 *
 * Empty `rendered` short-circuits to pass-through regardless of annotation —
 * there is nothing to measure or truncate.
 */
export function enforceBudget(rendered: string, schema: object, fieldPath: string): BudgetResult {
	if (rendered === "") {
		return { output: "", warning: null };
	}

	const fieldNode = resolveSchemaField(schema, fieldPath);
	if (fieldNode === null) {
		return { output: rendered, warning: null };
	}

	const annotation = fieldNode["x-prompt-budget"];
	if (annotation === undefined) {
		return { output: rendered, warning: null };
	}

	const budget = parseBudget(annotation, fieldPath);
	const actualTokens = countTokens(rendered);
	const actualWords = countWords(rendered);

	const overTokens = budget.tokens !== undefined && actualTokens > budget.tokens;
	const overWords = budget.words !== undefined && actualWords > budget.words;

	if (!overTokens && !overWords) {
		return { output: rendered, warning: null };
	}

	const { output, truncated } = tailTruncate(rendered, budget);
	const warning: BudgetWarning = {
		field: fieldPath,
		budget,
		actual: { tokens: actualTokens, words: actualWords },
		truncated,
	};
	return { output, warning };
}
