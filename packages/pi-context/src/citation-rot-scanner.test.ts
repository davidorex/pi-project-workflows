/**
 * Unit tests for citation-rot-scanner, the rigorous AST + JSON +
 * markdown/YAML scanner that replaces the naive line-by-line scan.
 *
 * Aim: validate that the AST + JSON + text scanner correctly discriminates
 * the four target surfaces:
 *   (1) AST tool/parameter description string literals — flagged;
 *   (2) AST JSDoc + line comments — NOT flagged;
 *   (3) JSON item-level structural id (under samples/blocks/ or .project/) —
 *       NOT flagged; JSON description-text values — flagged;
 *   (4) Markdown body text with multi-line citation straddle — flagged.
 *
 * Each test composes a synthetic input file under a tmp scratch directory
 * and asserts the scanner output. The scratch dir is per-test (mkdtemp) so
 * tests are independent.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { scanCommentsInFile, scanForCitationRot } from "./citation-rot-scanner.js";

function mkScratch(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "citation-rot-scanner-test-"));
}

describe("citation-rot-scanner — AST .ts surface", () => {
	it("flags pi.registerTool description string-literal", () => {
		const dir = mkScratch();
		const pkgDir = path.join(dir, "fake-pkg");
		fs.mkdirSync(pkgDir, { recursive: true });
		fs.writeFileSync(
			path.join(pkgDir, "src.ts"),
			`pi.registerTool({\n  description: "Implements FEAT-001 north-star",\n});`,
		);
		const hits = scanForCitationRot({ projectRoot: dir, packageDirs: [pkgDir] });
		assert.strictEqual(hits.length, 1);
		assert.strictEqual(hits[0].surface, "ast-string-literal");
		assert.strictEqual(hits[0].matched, "FEAT-001");
	});

	it("flags nested Type.Object/Type.String parameter description", () => {
		const dir = mkScratch();
		const pkgDir = path.join(dir, "fake-pkg");
		fs.mkdirSync(pkgDir, { recursive: true });
		fs.writeFileSync(
			path.join(pkgDir, "src.ts"),
			[
				`pi.registerTool({`,
				`  description: "outer",`,
				`  parameters: Type.Object({`,
				`    id: Type.String({ description: "ID of the work-order (e.g. WO-001)." }),`,
				`  }),`,
				`});`,
			].join("\n"),
		);
		const hits = scanForCitationRot({ projectRoot: dir, packageDirs: [pkgDir] });
		// Only the nested parameter description has a canonical_id; the outer
		// description string "outer" does not.
		assert.strictEqual(hits.length, 1);
		assert.strictEqual(hits[0].matched, "WO-001");
		assert.strictEqual(hits[0].surface, "ast-string-literal");
	});

	it("does NOT flag JSDoc comments referencing canonical_ids", () => {
		const dir = mkScratch();
		const pkgDir = path.join(dir, "fake-pkg");
		fs.mkdirSync(pkgDir, { recursive: true });
		fs.writeFileSync(
			path.join(pkgDir, "src.ts"),
			[
				`/**`,
				` * Implements DEC-0047 capability composition per FEAT-005.`,
				` * Also references TASK-091 + FGAP-102 in JSDoc.`,
				` */`,
				`export function foo() {}`,
				`// Trailing line comment also references REQ-001.`,
			].join("\n"),
		);
		const hits = scanForCitationRot({ projectRoot: dir, packageDirs: [pkgDir] });
		assert.strictEqual(hits.length, 0, `JSDoc + line comments must not be flagged; got: ${JSON.stringify(hits)}`);
	});

	it("does NOT flag string-literals OUTSIDE registerTool / Type.X / Error-constructor call trees", () => {
		const dir = mkScratch();
		const pkgDir = path.join(dir, "fake-pkg");
		fs.mkdirSync(pkgDir, { recursive: true });
		fs.writeFileSync(
			path.join(pkgDir, "src.ts"),
			[
				// Arbitrary string outside an operator-surface call tree — not
				// flagged. Protects against false-positives in internal helper
				// code that happens to mention canonical_ids in literal-bound
				// constants. NOTE: error-constructor messages ARE flagged (closing the
				// gap where thrown-error messages went unscanned); that case is covered
				// in the ast-error-message surface tests above.
				`const internalConstant = "DEC-0047";`,
				`const arr = ["FGAP-102 inside array literal"];`,
			].join("\n"),
		);
		const hits = scanForCitationRot({ projectRoot: dir, packageDirs: [pkgDir] });
		// Aim: AST surface narrowly targets the tool-registration + typebox
		// description fields + Error-constructor messages that ship to the
		// operator surface; other string literals are out of scope.
		assert.strictEqual(
			hits.length,
			0,
			`non-operator-surface string literals must not be flagged; got: ${JSON.stringify(hits)}`,
		);
	});
});

describe("citation-rot-scanner — comment-trivia surface (scanCommentsInFile, TASK-125, additive)", () => {
	it("flags a JSDoc comment containing a tracker-ID citation, with correct line + surface", () => {
		const src = [
			"/**",
			" * Placeholder function referencing TASK-999 in a JSDoc block.",
			" */",
			"export function foo() {}",
		].join("\n");
		const hits = scanCommentsInFile("src.ts", src);
		assert.strictEqual(hits.length, 1, `expected 1 hit; got: ${JSON.stringify(hits)}`);
		assert.strictEqual(hits[0].matched, "TASK-999");
		assert.strictEqual(hits[0].surface, "comment");
		assert.strictEqual(hits[0].line, 2);
	});

	it("flags a line comment containing a tracker-ID citation, with correct line + surface", () => {
		const src = ["const x = 1;", "const y = 2; // see TASK-999 for follow-up", "const z = 3;"].join("\n");
		const hits = scanCommentsInFile("src.ts", src);
		assert.strictEqual(hits.length, 1, `expected 1 hit; got: ${JSON.stringify(hits)}`);
		assert.strictEqual(hits[0].matched, "TASK-999");
		assert.strictEqual(hits[0].surface, "comment");
		assert.strictEqual(hits[0].line, 2);
	});

	it("does NOT flag description string-literals (this is a distinct, additive surface from scanTsFile)", () => {
		const src = `pi.registerTool({\n  description: "Implements TASK-999 north-star",\n});`;
		const hits = scanCommentsInFile("src.ts", src);
		assert.strictEqual(hits.length, 0, `expected 0 hits (no comment trivia present); got: ${JSON.stringify(hits)}`);
	});

	it("finds zero hits in a file with no citations, without crashing", () => {
		const src = ["/**", " * A perfectly ordinary doc comment.", " */", "export function noop(): void {}"].join("\n");
		assert.deepStrictEqual(scanCommentsInFile("src.ts", src), []);
	});
});

describe("citation-rot-scanner — AST error-message surface (FGAP-133)", () => {
	it("flags NewExpression on /Error$/ constructor with citation-bearing string-literal arg", () => {
		const dir = mkScratch();
		const pkgDir = path.join(dir, "fake-pkg");
		fs.mkdirSync(pkgDir, { recursive: true });
		fs.writeFileSync(path.join(pkgDir, "src.ts"), `function f() { throw new SomeError("per FGAP-999"); }`);
		const hits = scanForCitationRot({ projectRoot: dir, packageDirs: [pkgDir] });
		assert.strictEqual(hits.length, 1, `expected 1 hit; got: ${JSON.stringify(hits)}`);
		assert.strictEqual(hits[0].surface, "ast-error-message");
		assert.strictEqual(hits[0].matched, "FGAP-999");
	});

	it("does NOT flag NewExpression on /Error$/ constructor with non-citation message", () => {
		const dir = mkScratch();
		const pkgDir = path.join(dir, "fake-pkg");
		fs.mkdirSync(pkgDir, { recursive: true });
		fs.writeFileSync(path.join(pkgDir, "src.ts"), `function f() { throw new SomeError("hello world"); }`);
		const hits = scanForCitationRot({ projectRoot: dir, packageDirs: [pkgDir] });
		assert.strictEqual(hits.length, 0, `expected 0 hits; got: ${JSON.stringify(hits)}`);
	});

	it("does NOT flag NewExpression on constructor NOT ending in Error (even with citation)", () => {
		const dir = mkScratch();
		const pkgDir = path.join(dir, "fake-pkg");
		fs.mkdirSync(pkgDir, { recursive: true });
		fs.writeFileSync(
			path.join(pkgDir, "src.ts"),
			// Constructor name `Widget` does NOT end in `Error`; the error-constructor
			// visitor must skip it. Data classes / builders / value objects must not pollute
			// the operator-surface gate.
			`function f() { return new Widget("per FGAP-999"); }`,
		);
		const hits = scanForCitationRot({ projectRoot: dir, packageDirs: [pkgDir] });
		assert.strictEqual(
			hits.length,
			0,
			`non-/Error$/ constructor args must not be flagged; got: ${JSON.stringify(hits)}`,
		);
	});
});

describe("citation-rot-scanner — error-message construction-form arms (super / this.message / static-text shapes)", () => {
	it("flags a citation in an Error subclass's super(...) string-literal message, with correct line", () => {
		const dir = mkScratch();
		const pkgDir = path.join(dir, "fake-pkg");
		fs.mkdirSync(pkgDir, { recursive: true });
		fs.writeFileSync(
			path.join(pkgDir, "src.ts"),
			[
				`export class FakeNotFoundError extends Error {`,
				`  constructor() {`,
				`    super("no pointer found; see FGAP-998 for the policy");`,
				`    this.name = "FakeNotFoundError";`,
				`  }`,
				`}`,
			].join("\n"),
		);
		const hits = scanForCitationRot({ projectRoot: dir, packageDirs: [pkgDir] });
		assert.strictEqual(hits.length, 1, `expected 1 hit; got: ${JSON.stringify(hits)}`);
		assert.strictEqual(hits[0].surface, "ast-error-message");
		assert.strictEqual(hits[0].matched, "FGAP-998");
		assert.strictEqual(hits[0].line, 3);
	});

	it("does NOT flag a super(...) message without a citation", () => {
		const dir = mkScratch();
		const pkgDir = path.join(dir, "fake-pkg");
		fs.mkdirSync(pkgDir, { recursive: true });
		fs.writeFileSync(
			path.join(pkgDir, "src.ts"),
			`export class FakeError extends Error { constructor() { super("plain message, no tracker id"); } }`,
		);
		const hits = scanForCitationRot({ projectRoot: dir, packageDirs: [pkgDir] });
		assert.strictEqual(hits.length, 0, `expected 0 hits; got: ${JSON.stringify(hits)}`);
	});

	it("does NOT flag super(...) inside a class WITHOUT an extends clause (heritage requirement pin)", () => {
		const dir = mkScratch();
		const pkgDir = path.join(dir, "fake-pkg");
		fs.mkdirSync(pkgDir, { recursive: true });
		// Grammar-invalid TS (super call in a base class) the parser still
		// represents as AST — the heritage walk must skip it rather than treat
		// unreachable code as an operator surface.
		fs.writeFileSync(
			path.join(pkgDir, "src.ts"),
			`export class NotDerived { constructor() { super("per FGAP-998"); } }`,
		);
		const hits = scanForCitationRot({ projectRoot: dir, packageDirs: [pkgDir] });
		assert.strictEqual(hits.length, 0, `heritage-free super() must not be flagged; got: ${JSON.stringify(hits)}`);
	});

	it("flags a citation in the STATIC text of a substitution-carrying template in super(...)", () => {
		const dir = mkScratch();
		const pkgDir = path.join(dir, "fake-pkg");
		fs.mkdirSync(pkgDir, { recursive: true });
		// The live Error-subclass idiom in real sources builds messages via
		// template literals WITH substitutions; the static spans around the
		// substitution must be scanned.
		fs.writeFileSync(
			path.join(pkgDir, "src.ts"),
			[
				`export class FakePointerError extends Error {`,
				`  constructor(p: string) {`,
				"    super(`no pointer at ${p}; hard-throw per DEC-9998, no fallback`);",
				`  }`,
				`}`,
			].join("\n"),
		);
		const hits = scanForCitationRot({ projectRoot: dir, packageDirs: [pkgDir] });
		assert.strictEqual(hits.length, 1, `expected 1 hit; got: ${JSON.stringify(hits)}`);
		assert.strictEqual(hits[0].surface, "ast-error-message");
		assert.strictEqual(hits[0].matched, "DEC-9998");
		assert.strictEqual(hits[0].line, 3);
	});

	it("flags a citation in a +-concatenated string chain passed to an Error constructor", () => {
		const dir = mkScratch();
		const pkgDir = path.join(dir, "fake-pkg");
		fs.mkdirSync(pkgDir, { recursive: true });
		fs.writeFileSync(
			path.join(pkgDir, "src.ts"),
			`function f() { throw new SomeError("first part. " + "second part closes FGAP-997."); }`,
		);
		const hits = scanForCitationRot({ projectRoot: dir, packageDirs: [pkgDir] });
		assert.strictEqual(hits.length, 1, `expected 1 hit; got: ${JSON.stringify(hits)}`);
		assert.strictEqual(hits[0].surface, "ast-error-message");
		assert.strictEqual(hits[0].matched, "FGAP-997");
	});

	it("flags a citation in a this.message assignment inside an extends-bearing class", () => {
		const dir = mkScratch();
		const pkgDir = path.join(dir, "fake-pkg");
		fs.mkdirSync(pkgDir, { recursive: true });
		fs.writeFileSync(
			path.join(pkgDir, "src.ts"),
			[
				`export class FakeAssignError extends Error {`,
				`  constructor() {`,
				`    super();`,
				`    this.message = "rebuilt message citing TASK-996";`,
				`  }`,
				`}`,
			].join("\n"),
		);
		const hits = scanForCitationRot({ projectRoot: dir, packageDirs: [pkgDir] });
		assert.strictEqual(hits.length, 1, `expected 1 hit; got: ${JSON.stringify(hits)}`);
		assert.strictEqual(hits[0].surface, "ast-error-message");
		assert.strictEqual(hits[0].matched, "TASK-996");
		assert.strictEqual(hits[0].line, 4);
	});

	it("does NOT flag a message-field assignment in a class WITHOUT an extends clause", () => {
		const dir = mkScratch();
		const pkgDir = path.join(dir, "fake-pkg");
		fs.mkdirSync(pkgDir, { recursive: true });
		// A plain data class carrying a `message` field is not an
		// operator-facing error surface; the heritage requirement keeps it out.
		fs.writeFileSync(
			path.join(pkgDir, "src.ts"),
			[
				`export class Completion {`,
				`  message = "";`,
				`  fill() { this.message = "record body mentioning TASK-996"; }`,
				`}`,
			].join("\n"),
		);
		const hits = scanForCitationRot({ projectRoot: dir, packageDirs: [pkgDir] });
		assert.strictEqual(hits.length, 0, `heritage-free this.message must not be flagged; got: ${JSON.stringify(hits)}`);
	});

	it("does NOT flag Object.assign(this, { message: ... }) — deliberate-exclusion pin per the module header audit", () => {
		const dir = mkScratch();
		const pkgDir = path.join(dir, "fake-pkg");
		fs.mkdirSync(pkgDir, { recursive: true });
		fs.writeFileSync(
			path.join(pkgDir, "src.ts"),
			[
				`export class FakeAssignedError extends Error {`,
				`  constructor() {`,
				`    super();`,
				`    Object.assign(this, { message: "citing FGAP-995" });`,
				`  }`,
				`}`,
			].join("\n"),
		);
		const hits = scanForCitationRot({ projectRoot: dir, packageDirs: [pkgDir] });
		assert.strictEqual(
			hits.length,
			0,
			`Object.assign message form is a documented deliberate exclusion; got: ${JSON.stringify(hits)}`,
		);
	});
});

describe("citation-rot-scanner — JSON surface", () => {
	it("does NOT flag item-level id under samples/blocks/", () => {
		const dir = mkScratch();
		const pkgDir = path.join(dir, "fake-pkg");
		const blocksDir = path.join(pkgDir, "samples", "blocks");
		fs.mkdirSync(blocksDir, { recursive: true });
		fs.writeFileSync(
			path.join(blocksDir, "tasks.json"),
			JSON.stringify({
				tasks: [
					{ id: "TASK-001", description: "A task" },
					{ id: "TASK-002", description: "Another task" },
				],
			}),
		);
		const hits = scanForCitationRot({ projectRoot: dir, packageDirs: [pkgDir] });
		assert.strictEqual(hits.length, 0, `item-level id must be carved out; got: ${JSON.stringify(hits)}`);
	});

	it("does NOT flag item-level id under test-fixtures/blocks/", () => {
		const dir = mkScratch();
		const pkgDir = path.join(dir, "fake-pkg");
		const blocksDir = path.join(pkgDir, "test-fixtures", "blocks");
		fs.mkdirSync(blocksDir, { recursive: true });
		fs.writeFileSync(
			path.join(blocksDir, "decisions.json"),
			JSON.stringify({
				decisions: [
					{ id: "DEC-0001", title: "A decision" },
					{ id: "DEC-0002", title: "Another decision" },
				],
			}),
		);
		const hits = scanForCitationRot({ projectRoot: dir, packageDirs: [pkgDir] });
		assert.strictEqual(
			hits.length,
			0,
			`item-level id under test-fixtures/blocks/ must be carved out; got: ${JSON.stringify(hits)}`,
		);
	});

	it("DOES flag a canonical_id appearing as a citation in non-item-data JSON text (exemption not over-broad)", () => {
		const dir = mkScratch();
		const pkgDir = path.join(dir, "fake-pkg");
		// Path does NOT contain /test-fixtures/blocks/ — a plain data file — and
		// the canonical_id sits in a description-text value (a citation), not a
		// top-level item `id`. The exemption must not leak to this surface.
		fs.mkdirSync(pkgDir, { recursive: true });
		fs.writeFileSync(
			path.join(pkgDir, "decisions.json"),
			JSON.stringify({
				decisions: [{ id: "item-1", description: "Closes FGAP-099" }],
			}),
		);
		const hits = scanForCitationRot({ projectRoot: dir, packageDirs: [pkgDir] });
		assert.strictEqual(hits.length, 1, `citation in non-item-data text must still flag; got: ${JSON.stringify(hits)}`);
		assert.strictEqual(hits[0].matched, "FGAP-099");
		assert.strictEqual(hits[0].surface, "json-string-value");
	});

	it("DOES flag description text values containing canonical_ids", () => {
		const dir = mkScratch();
		const pkgDir = path.join(dir, "fake-pkg");
		const blocksDir = path.join(pkgDir, "samples", "blocks");
		fs.mkdirSync(blocksDir, { recursive: true });
		fs.writeFileSync(
			path.join(blocksDir, "tasks.json"),
			JSON.stringify({
				tasks: [{ id: "TASK-001", description: "Closes FGAP-099" }],
			}),
		);
		const hits = scanForCitationRot({ projectRoot: dir, packageDirs: [pkgDir] });
		assert.strictEqual(hits.length, 1);
		assert.strictEqual(hits[0].matched, "FGAP-099");
		assert.strictEqual(hits[0].surface, "json-string-value");
	});

	it("does NOT flag schema pattern / enum values in *.schema.json", () => {
		const dir = mkScratch();
		const pkgDir = path.join(dir, "fake-pkg");
		const schemasDir = path.join(pkgDir, "schemas");
		fs.mkdirSync(schemasDir, { recursive: true });
		fs.writeFileSync(
			path.join(schemasDir, "thing.schema.json"),
			JSON.stringify({
				properties: {
					id: { type: "string", pattern: "^TASK-\\d{3}$" },
					kind: { enum: ["FEAT-001", "FEAT-002"] },
				},
			}),
		);
		const hits = scanForCitationRot({ projectRoot: dir, packageDirs: [pkgDir] });
		assert.strictEqual(hits.length, 0, `schema pattern + enum must be carved out; got: ${JSON.stringify(hits)}`);
	});

	it("DOES flag schema description text", () => {
		const dir = mkScratch();
		const pkgDir = path.join(dir, "fake-pkg");
		const schemasDir = path.join(pkgDir, "schemas");
		fs.mkdirSync(schemasDir, { recursive: true });
		fs.writeFileSync(
			path.join(schemasDir, "thing.schema.json"),
			JSON.stringify({
				properties: {
					id: { type: "string", description: "Block ID per DEC-0026" },
				},
			}),
		);
		const hits = scanForCitationRot({ projectRoot: dir, packageDirs: [pkgDir] });
		assert.strictEqual(hits.length, 1);
		assert.strictEqual(hits[0].matched, "DEC-0026");
	});
});

describe("citation-rot-scanner — markdown body surface", () => {
	it("catches single-line citation", () => {
		const dir = mkScratch();
		const pkgDir = path.join(dir, "fake-pkg");
		fs.mkdirSync(pkgDir, { recursive: true });
		fs.writeFileSync(path.join(pkgDir, "README.md"), "This implements FEAT-006 north-star.\n");
		const hits = scanForCitationRot({ projectRoot: dir, packageDirs: [pkgDir] });
		assert.strictEqual(hits.length, 1);
		assert.strictEqual(hits[0].matched, "FEAT-006");
		assert.strictEqual(hits[0].surface, "markdown-body");
	});

	it("catches multi-line citation straddle (full-text scan vs naive line-by-line)", () => {
		const dir = mkScratch();
		const pkgDir = path.join(dir, "fake-pkg");
		fs.mkdirSync(pkgDir, { recursive: true });
		// Naive line-by-line scan would see "Implements\nDEC-0047 governance" as
		// two lines and only catch the DEC-0047 line — which is fine for one
		// hit but loses the surrounding sentence context. Here we verify the
		// scanner finds the citation regardless of straddle by full-text scan.
		fs.writeFileSync(
			path.join(pkgDir, "README.md"),
			"Implements\nDEC-0047 governance —\n\nalso TASK-091\nstraddles paragraph break.\n",
		);
		const hits = scanForCitationRot({ projectRoot: dir, packageDirs: [pkgDir] });
		assert.strictEqual(hits.length, 2);
		const matched = hits.map((h) => h.matched).sort();
		assert.deepStrictEqual(matched, ["DEC-0047", "TASK-091"]);
	});
});

describe("citation-rot-scanner — YAML surface", () => {
	it("catches yaml value referencing canonical_id", () => {
		const dir = mkScratch();
		const pkgDir = path.join(dir, "fake-pkg");
		fs.mkdirSync(pkgDir, { recursive: true });
		fs.writeFileSync(
			path.join(pkgDir, "thing.yaml"),
			["name: example", "description: |", "  Closes FGAP-131 + FGAP-132."].join("\n"),
		);
		const hits = scanForCitationRot({ projectRoot: dir, packageDirs: [pkgDir] });
		assert.strictEqual(hits.length, 2);
		const matched = hits.map((h) => h.matched).sort();
		assert.deepStrictEqual(matched, ["FGAP-131", "FGAP-132"]);
		assert.strictEqual(hits[0].surface, "yaml-value");
	});
});

describe("citation-rot-scanner — exclusion + walker behavior", () => {
	it("excludes node_modules + dist + .test.ts files", () => {
		const dir = mkScratch();
		const pkgDir = path.join(dir, "fake-pkg");
		fs.mkdirSync(path.join(pkgDir, "node_modules"), { recursive: true });
		fs.mkdirSync(path.join(pkgDir, "dist"), { recursive: true });
		fs.writeFileSync(path.join(pkgDir, "node_modules", "junk.md"), "DEC-0001\n");
		fs.writeFileSync(path.join(pkgDir, "dist", "out.md"), "DEC-0001\n");
		fs.writeFileSync(path.join(pkgDir, "foo.test.ts"), `const x = "DEC-0001";`);
		const hits = scanForCitationRot({ projectRoot: dir, packageDirs: [pkgDir] });
		assert.strictEqual(hits.length, 0, `node_modules + dist + .test.ts must be excluded; got: ${JSON.stringify(hits)}`);
	});

	it("respects sourceFileExclusions caller-pinned substring", () => {
		const dir = mkScratch();
		const pkgDir = path.join(dir, "fake-pkg");
		fs.mkdirSync(pkgDir, { recursive: true });
		fs.writeFileSync(path.join(pkgDir, "include.md"), "DEC-0001\n");
		fs.writeFileSync(path.join(pkgDir, "exclude.md"), "DEC-0002\n");
		const hits = scanForCitationRot({
			projectRoot: dir,
			packageDirs: [pkgDir],
			sourceFileExclusions: ["exclude.md"],
		});
		assert.strictEqual(hits.length, 1);
		assert.strictEqual(hits[0].matched, "DEC-0001");
	});
});
