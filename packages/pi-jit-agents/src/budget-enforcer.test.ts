import assert from "node:assert";
import { describe, it } from "node:test";
import { enforceBudget } from "./budget-enforcer.js";

describe("enforceBudget", () => {
	it("returns pass-through when the field has no x-prompt-budget annotation", () => {
		const schema = {
			type: "object",
			properties: {
				something: { type: "string", description: "no annotation" },
			},
		};
		const result = enforceBudget("any text here", schema, "/properties/something");
		assert.strictEqual(result.output, "any text here");
		assert.strictEqual(result.warning, null);
	});

	it("returns pass-through when the field path does not resolve in the schema", () => {
		const schema = { type: "object", properties: {} };
		const result = enforceBudget("body", schema, "/properties/missing");
		assert.strictEqual(result.output, "body");
		assert.strictEqual(result.warning, null);
	});

	it("passes through unchanged when the rendered text is under budget", () => {
		const schema = {
			properties: {
				notes: {
					type: "string",
					"x-prompt-budget": { tokens: 100, words: 100 },
				},
			},
		};
		const text = "Three small words.";
		const result = enforceBudget(text, schema, "/properties/notes");
		assert.strictEqual(result.output, text);
		assert.strictEqual(result.warning, null);
	});

	it("tail-truncates and warns when token budget is exceeded", () => {
		const schema = {
			properties: {
				body: {
					type: "string",
					"x-prompt-budget": { tokens: 5 },
				},
			},
		};
		// 20 punctuation-separated tokens
		const text =
			"alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon";
		const result = enforceBudget(text, schema, "/properties/body");
		assert.ok(result.warning !== null, "warning should be present");
		assert.strictEqual(result.warning?.truncated, true);
		assert.strictEqual(result.warning?.field, "/properties/body");
		assert.deepStrictEqual(result.warning?.budget, { tokens: 5 });
		assert.ok(result.warning?.actual.tokens > 5, "actual.tokens reflects pre-truncation count");
		assert.ok(
			result.output.includes("[…truncated to budget]"),
			`output should include truncation marker, got: ${result.output}`,
		);
		// The truncated output itself must satisfy the budget.
		const truncatedTokens = result.output.split(/[\s\p{P}]+/u).filter(Boolean).length;
		assert.ok(truncatedTokens <= 5, `truncated token count ${truncatedTokens} must be <= 5`);
	});

	it("tail-truncates and warns when word budget is exceeded", () => {
		const schema = {
			properties: {
				body: {
					type: "string",
					"x-prompt-budget": { words: 4 },
				},
			},
		};
		const text = "one two three four five six seven eight nine ten";
		const result = enforceBudget(text, schema, "/properties/body");
		assert.ok(result.warning !== null);
		assert.strictEqual(result.warning?.truncated, true);
		assert.deepStrictEqual(result.warning?.budget, { words: 4 });
		assert.ok(result.output.includes("[…truncated to budget]"));
		const truncatedWords = result.output.split(/\s+/).filter(Boolean).length;
		assert.ok(truncatedWords <= 4, `truncated word count ${truncatedWords} must be <= 4`);
	});

	it("honors the more restrictive of tokens vs words when both are set", () => {
		const tokenRestrictive = {
			properties: {
				body: {
					type: "string",
					// tokens=3 is far tighter than words=100 here
					"x-prompt-budget": { tokens: 3, words: 100 },
				},
			},
		};
		const wordRestrictive = {
			properties: {
				body: {
					type: "string",
					// words=3 is far tighter than tokens=100 here
					"x-prompt-budget": { tokens: 100, words: 3 },
				},
			},
		};
		const text = "alpha beta gamma delta epsilon zeta eta theta iota kappa";
		const r1 = enforceBudget(text, tokenRestrictive, "/properties/body");
		const r2 = enforceBudget(text, wordRestrictive, "/properties/body");
		assert.ok(r1.warning?.truncated);
		assert.ok(r2.warning?.truncated);
		const r1Tokens = r1.output.split(/[\s\p{P}]+/u).filter(Boolean).length;
		assert.ok(r1Tokens <= 3, `tokens-restrictive truncation must satisfy tokens<=3, got ${r1Tokens}`);
		const r2Words = r2.output.split(/\s+/).filter(Boolean).length;
		assert.ok(r2Words <= 3, `words-restrictive truncation must satisfy words<=3, got ${r2Words}`);
	});

	it("throws with the field name in the message on a malformed annotation (negative tokens)", () => {
		const schema = {
			properties: {
				body: {
					type: "string",
					"x-prompt-budget": { tokens: -10 },
				},
			},
		};
		assert.throws(
			() => enforceBudget("anything", schema, "/properties/body"),
			(err: Error) => {
				assert.match(err.message, /\/properties\/body/);
				assert.match(err.message, /tokens/);
				return true;
			},
		);
	});

	it("throws when annotation declares neither tokens nor words", () => {
		const schema = {
			properties: {
				body: {
					type: "string",
					"x-prompt-budget": {},
				},
			},
		};
		assert.throws(
			() => enforceBudget("text", schema, "/properties/body"),
			(err: Error) => {
				assert.match(err.message, /\/properties\/body/);
				assert.match(err.message, /neither tokens nor words/);
				return true;
			},
		);
	});

	it("returns empty pass-through for empty rendered string regardless of annotation", () => {
		const schema = {
			properties: {
				body: { type: "string", "x-prompt-budget": { tokens: 1 } },
			},
		};
		const result = enforceBudget("", schema, "/properties/body");
		assert.strictEqual(result.output, "");
		assert.strictEqual(result.warning, null);
	});
});
