import assert from "node:assert";
import { describe, it } from "node:test";
import {
	DEFAULT_PROHIBITED_PATTERNS,
	RhetoricalValidationError,
	readRhetoricalCriteria,
	validateRhetoricalCriteriaForItems,
} from "./rhetorical-criteria.js";

/**
 * An item subschema in the shape `resolveBlockItemSchema` returns: a bare object
 * carrying `properties` (with per-field `x-prompt-budget`) and optionally an
 * `x-rhetorical-criteria` sibling keyword. No disk I/O — the pure functions take
 * the resolved item subschema directly.
 */
const itemSchemaWithBudget = {
	type: "object",
	properties: {
		id: { type: "string" },
		description: { type: "string", "x-prompt-budget": { tokens: 10, words: 5 } },
		title: { type: "string" },
	},
	"x-rhetorical-criteria": {
		downstream_consumer: "downstream subagents",
		register_notes: "terse, self-contained",
		prohibited_patterns: [],
	},
};

describe("readRhetoricalCriteria", () => {
	it("returns null when the keyword is absent", () => {
		assert.strictEqual(readRhetoricalCriteria({ properties: {} }), null);
	});

	it("returns null for a non-object / array argument", () => {
		assert.strictEqual(readRhetoricalCriteria(null), null);
		assert.strictEqual(readRhetoricalCriteria("x"), null);
		assert.strictEqual(readRhetoricalCriteria({ "x-rhetorical-criteria": [] }), null);
	});

	it("reads downstream_consumer / register_notes / prohibited_patterns", () => {
		const c = readRhetoricalCriteria(itemSchemaWithBudget);
		assert.ok(c);
		assert.strictEqual(c.downstream_consumer, "downstream subagents");
		assert.strictEqual(c.register_notes, "terse, self-contained");
		assert.deepStrictEqual(c.prohibited_patterns, []);
	});

	it("retains only well-formed prohibited_patterns entries", () => {
		const c = readRhetoricalCriteria({
			"x-rhetorical-criteria": {
				prohibited_patterns: [
					{ pattern: "\\bfoo\\b", applies_to: ["title", 5], reason: "no foo" },
					{ pattern: 123, applies_to: ["title"], reason: "bad pattern type" },
					{ applies_to: ["title"], reason: "missing pattern" },
				],
			},
		});
		assert.ok(c);
		assert.strictEqual(c.prohibited_patterns.length, 1);
		assert.deepStrictEqual(c.prohibited_patterns[0], { pattern: "\\bfoo\\b", applies_to: ["title"], reason: "no foo" });
	});

	it("drops non-string downstream_consumer / register_notes defensively", () => {
		const c = readRhetoricalCriteria({ "x-rhetorical-criteria": { downstream_consumer: 5, register_notes: {} } });
		assert.ok(c);
		assert.strictEqual(c.downstream_consumer, undefined);
		assert.strictEqual(c.register_notes, undefined);
	});
});

describe("DEFAULT_PROHIBITED_PATTERNS", () => {
	it("flags provenance / git / prior-state narration, not generic prose", () => {
		const hits = (s: string) => DEFAULT_PROHIBITED_PATTERNS.some((p) => p.pattern.test(s));
		assert.ok(hits("this was previously the case"));
		assert.ok(hits("originally the field held X"));
		assert.ok(hits("this used to be a string"));
		assert.ok(hits("the flag is no longer read"));
		assert.ok(hits("see commit a1b2c3d for context"));
		assert.ok(hits("the field was removed in a later pass"));
		// Compliant current-state prose is untouched.
		assert.ok(!hits("the field holds the canonical id"));
		assert.ok(!hits("a terse, signal-dense description of current behavior"));
	});

	it("patterns are non-global so .exec is stateless across reuse", () => {
		for (const { pattern } of DEFAULT_PROHIBITED_PATTERNS) {
			assert.ok(!pattern.global, `pattern ${pattern} must not carry the g flag`);
		}
	});
});

/**
 * A resolver stub for the top-level-only cases: these items carry no
 * `nestedArrayKey`, so the injected resolver is never consulted. It throws if
 * ever called, proving the top-level path does NOT resolve nested schemas.
 */
const unusedResolver = (): Record<string, unknown> | null => {
	throw new Error("resolver must not be consulted for a top-level (nestedArrayKey-less) item");
};

describe("validateRhetoricalCriteriaForItems", () => {
	it("passes a compliant item", () => {
		assert.doesNotThrow(() =>
			validateRhetoricalCriteriaForItems(
				itemSchemaWithBudget,
				{},
				[{ arrayKey: "items", item: { id: "X-1", description: "short clear text", title: "ok" } }],
				"label",
				unusedResolver,
			),
		);
	});

	it("throws on a word-cap overrun, naming the field", () => {
		assert.throws(
			() =>
				validateRhetoricalCriteriaForItems(
					itemSchemaWithBudget,
					{},
					[{ arrayKey: "items", item: { id: "X-1", description: "one two three four five six seven" } }],
					"label",
					unusedResolver,
				),
			(err: unknown) => {
				assert.ok(err instanceof RhetoricalValidationError);
				assert.strictEqual(err.field, "description");
				assert.ok(err.message.includes("7 words"));
				assert.ok(err.message.includes("cap of 5"));
				return true;
			},
		);
	});

	it("throws on a DEFAULT_PROHIBITED_PATTERNS match on a budgeted field, naming the substring", () => {
		assert.throws(
			() =>
				validateRhetoricalCriteriaForItems(
					itemSchemaWithBudget,
					{},
					[{ arrayKey: "items", item: { id: "X-1", description: "no longer used" } }],
					"label",
					unusedResolver,
				),
			(err: unknown) => {
				assert.ok(err instanceof RhetoricalValidationError);
				assert.strictEqual(err.field, "description");
				assert.ok(err.message.toLowerCase().includes("no longer"));
				return true;
			},
		);
	});

	it("does not check non-budgeted fields against DEFAULT_PROHIBITED_PATTERNS", () => {
		// `title` carries no x-prompt-budget, so its content is not register-checked.
		assert.doesNotThrow(() =>
			validateRhetoricalCriteriaForItems(
				itemSchemaWithBudget,
				{},
				[{ arrayKey: "items", item: { id: "X-1", description: "fine", title: "previously named foo" } }],
				"label",
				unusedResolver,
			),
		);
	});

	it("enforces schema-authored prohibited_patterns on their applies_to fields", () => {
		const schema = {
			properties: { id: { type: "string" }, note: { type: "string" } },
			"x-rhetorical-criteria": {
				prohibited_patterns: [{ pattern: "\\bTODO\\b", applies_to: ["note"], reason: "no TODO markers" }],
			},
		};
		assert.throws(
			() =>
				validateRhetoricalCriteriaForItems(
					schema,
					{},
					[{ arrayKey: "items", item: { id: "X-1", note: "a todo here" } }],
					"label",
					unusedResolver,
				),
			(err: unknown) => {
				assert.ok(err instanceof RhetoricalValidationError);
				assert.strictEqual(err.field, "note");
				return true;
			},
		);
	});

	it("skips non-object changed items and non-string field values defensively", () => {
		assert.doesNotThrow(() =>
			validateRhetoricalCriteriaForItems(
				itemSchemaWithBudget,
				{},
				[
					{ arrayKey: "items", item: 42 as unknown as Record<string, unknown> },
					{ arrayKey: "items", item: { id: "X-1", description: 999 as unknown as string } },
				],
				"label",
				unusedResolver,
			),
		);
	});

	it("checks a nestedArrayKey entry against the resolver's returned subschema, not the top-level one", () => {
		// Top-level `description` cap is 5 words; the nested resolver returns a
		// subschema whose `blurb` cap is 2 words. A nested entry with a 3-word
		// `blurb` must be judged by the nested (2-word) cap the resolver returns.
		const nestedSubschema = {
			properties: { blurb: { type: "string", "x-prompt-budget": { words: 2 } } },
		};
		const resolver = (_top: Record<string, unknown>, _root: Record<string, unknown>, key: string) =>
			key === "subs" ? nestedSubschema : null;
		assert.throws(
			() =>
				validateRhetoricalCriteriaForItems(
					itemSchemaWithBudget,
					{},
					[{ arrayKey: "items", nestedArrayKey: "subs", item: { blurb: "one two three" } }],
					"label",
					resolver,
				),
			(err: unknown) => {
				assert.ok(err instanceof RhetoricalValidationError);
				assert.strictEqual(err.field, "blurb");
				assert.ok(err.message.includes("cap of 2"));
				return true;
			},
		);
	});

	it("skips a nestedArrayKey entry whose subschema does not resolve (defensive null)", () => {
		const resolver = () => null;
		assert.doesNotThrow(() =>
			validateRhetoricalCriteriaForItems(
				itemSchemaWithBudget,
				{},
				[{ arrayKey: "items", nestedArrayKey: "subs", item: { description: "one two three four five six seven" } }],
				"label",
				resolver,
			),
		);
	});
});

/**
 * A synthetic (novel — not one of the shipped catalog fields) item subschema
 * whose `criteria` property is a budgeted bare-string array: the budget sits on
 * the array's own `items` subschema, so each STRING element is the budgeted
 * value. Pins that enforcement is schema-driven — keyed off
 * `items.x-prompt-budget` on a `type: "string"` items subschema — not hardcoded
 * to any known field name.
 */
const itemSchemaWithArrayElementBudget = {
	type: "object",
	properties: {
		id: { type: "string" },
		criteria: {
			type: "array",
			items: { type: "string", "x-prompt-budget": { tokens: 10, words: 5 } },
		},
	},
};

describe("validateRhetoricalCriteriaForItems — budgeted bare-string arrays", () => {
	it("passes conforming bare-string-array elements", () => {
		assert.doesNotThrow(() =>
			validateRhetoricalCriteriaForItems(
				itemSchemaWithArrayElementBudget,
				{},
				[{ arrayKey: "items", item: { id: "X-1", criteria: ["short clear text", "second terse element"] } }],
				"label",
				unusedResolver,
			),
		);
	});

	it("throws on an over-cap element, naming the array field", () => {
		assert.throws(
			() =>
				validateRhetoricalCriteriaForItems(
					itemSchemaWithArrayElementBudget,
					{},
					[{ arrayKey: "items", item: { id: "X-1", criteria: ["ok here", "one two three four five six seven"] } }],
					"label",
					unusedResolver,
				),
			(err: unknown) => {
				assert.ok(err instanceof RhetoricalValidationError);
				assert.strictEqual(err.field, "criteria");
				assert.ok(err.message.includes("7 words"));
				assert.ok(err.message.includes("cap of 5"));
				return true;
			},
		);
	});

	it("throws on a DEFAULT_PROHIBITED_PATTERNS match in an element, naming the array field", () => {
		assert.throws(
			() =>
				validateRhetoricalCriteriaForItems(
					itemSchemaWithArrayElementBudget,
					{},
					[{ arrayKey: "items", item: { id: "X-1", criteria: ["this flag no longer applies"] } }],
					"label",
					unusedResolver,
				),
			(err: unknown) => {
				assert.ok(err instanceof RhetoricalValidationError);
				assert.strictEqual(err.field, "criteria");
				assert.ok(err.message.toLowerCase().includes("no longer"));
				return true;
			},
		);
	});

	it("skips non-string elements inside a budgeted bare-string array (element type is AJV's job)", () => {
		assert.doesNotThrow(() =>
			validateRhetoricalCriteriaForItems(
				itemSchemaWithArrayElementBudget,
				{},
				[
					{
						arrayKey: "items",
						item: { id: "X-1", criteria: [42, null, { note: "no longer relevant" }] as unknown as string[] },
					},
				],
				"label",
				unusedResolver,
			),
		);
	});

	it("does not check an un-budgeted bare-string array's elements", () => {
		// `tags` items carry no x-prompt-budget, so their content is not
		// register-checked; the array falls through to the object-element path,
		// whose resolver may return null (skipped defensively).
		const schema = {
			type: "object",
			properties: {
				id: { type: "string" },
				tags: { type: "array", items: { type: "string" } },
			},
		};
		assert.doesNotThrow(() =>
			validateRhetoricalCriteriaForItems(
				schema,
				{},
				[{ arrayKey: "items", item: { id: "X-1", tags: ["no longer used", "one two three four five six seven"] } }],
				"label",
				() => null,
			),
		);
	});

	it("enforces a NESTED bare-string array reached through the resolver (object array carrying a bare-string-array property)", () => {
		// The layer-plans shape: a top-level object array (`phases`) whose element
		// subschema — returned by the injected resolver — itself carries a budgeted
		// bare-string array (`exit_criteria`). The element check must fire at that
		// nested depth via the recursive walk.
		const nestedElementSchema = {
			type: "object",
			properties: {
				name: { type: "string" },
				exit_criteria: {
					type: "array",
					items: { type: "string", "x-prompt-budget": { words: 3 } },
				},
			},
		};
		const topSchema = {
			type: "object",
			properties: {
				id: { type: "string" },
				phases: { type: "array", items: { type: "object" } },
			},
		};
		const resolver = (_parent: Record<string, unknown>, _root: Record<string, unknown>, key: string) =>
			key === "phases" ? nestedElementSchema : null;
		assert.throws(
			() =>
				validateRhetoricalCriteriaForItems(
					topSchema,
					{},
					[
						{
							arrayKey: "items",
							item: { id: "X-1", phases: [{ name: "p1", exit_criteria: ["one two three four"] }] },
						},
					],
					"label",
					resolver,
				),
			(err: unknown) => {
				assert.ok(err instanceof RhetoricalValidationError);
				assert.strictEqual(err.field, "exit_criteria");
				assert.ok(err.message.includes("4 words"));
				assert.ok(err.message.includes("cap of 3"));
				return true;
			},
		);
	});

	it("diff-scoping: a violating element on an item NOT threaded in changedItems never blocks", () => {
		// A pre-existing item holding an over-cap + prohibited-pattern element sits
		// untouched in the block; only the clean item the write actually created is
		// threaded as changedItems — the write must pass.
		const preExistingViolator = {
			id: "X-0",
			criteria: ["this criterion is no longer valid", "one two three four five six seven eight"],
		};
		void preExistingViolator; // present in the block file, never threaded
		assert.doesNotThrow(() =>
			validateRhetoricalCriteriaForItems(
				itemSchemaWithArrayElementBudget,
				{},
				[{ arrayKey: "items", item: { id: "X-1", criteria: ["clean terse element"] } }],
				"label",
				unusedResolver,
			),
		);
	});
});
