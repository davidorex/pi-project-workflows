/**
 * citation-rot-scanner — rigorous AST + JSON + markdown/YAML body scanner that
 * surfaces pi-project-workflows-repo canonical_id citations (FGAP-NNN /
 * DEC-NNNN / FEAT-NNN / TASK-NNN / VER-NNN / REVIEW-N / RAT-N / CTX-N / WO-N /
 * STORY-N / PLAN-N / REQ-N / R-NNNN / ISSUE-N / issue-N / PHASE-NNN+ / JI-NNN)
 * inside shipped artifacts of all monorepo packages.
 *
 * Aim: replace the naive line-by-line CITATION_RE scan — introduced after
 * bundled/packaged schema field descriptions were found leaking this repo's
 * own internal development-substrate canonical-id citations verbatim into
 * operator-facing text a downstream consumer could never resolve (commit
 * 4fd28a6) — with an AST-aware enumerator that discriminates by node
 * type and JSON path. The naive scan carried six fragility classes:
 *   (a) multi-line strings not captured by line iteration,
 *   (b) JSDoc / comment exclusion based on line-prefix regex producing both
 *       false-negative and false-positive depending on indentation,
 *   (c) "e.g." + "NNN" heuristic ambiguous in both directions,
 *   (d) enum-value false-positive when a schema's enum legitimately encodes a
 *       canonical_id-shaped constraint,
 *   (e) path-suffix-only structural carve-out imprecise (whole-file exclusion
 *       loses per-item discrimination),
 *   (f) JSDoc-vs-tool-description string-literal ambiguity (both live in .ts
 *       text but only the latter ships to the operator surface).
 *
 * This module addresses each: TypeScript compiler API SyntaxKind discriminates
 * comment trivia from CallExpression string-literal arguments; the JSON walker
 * tracks JSONPath + carves out item-level `id` properties only when the path
 * matches the structural-seed-data shape; markdown + YAML body text is matched
 * via full-text regex (catches multi-line straddle).
 *
 * Failure-mode contract: scanner is purely enumerative. The calling test
 * renders results as hard refusal with full per-hit detail; the scanner itself
 * never warns, never suggests rewrites, and exposes no exclusion list at the
 * call site (carve-outs are coded internally per the aim above).
 *
 * Error-message construction-form audit (operator-facing error text). The
 * error-message surface is produced by more language forms than the original
 * `new XError("...")` NewExpression; each form found by a repo-wide audit is
 * either matched by an arm below or named here as a deliberate exclusion — no
 * silent holes:
 *
 * Matched arms:
 *   - NewExpression whose constructor identifier suffix-matches `Error`
 *     (`isErrorConstructorCall`) — first argument.
 *   - CallExpression whose callee is the `super` keyword inside a class-like
 *     declaration carrying an `extends` heritage clause
 *     (`isSuperConstructionCall`) — first argument. Conservative on purpose:
 *     ANY extends clause qualifies, not only an Error-suffixed base name,
 *     because an import rename or intermediate base class hides the suffix
 *     while the message still propagates to the operator through the Error
 *     prototype chain.
 *   - Assignment `this.message = <expr>` inside a class-like declaration with
 *     an `extends` heritage clause (`isThisMessageAssignment`) — right side.
 *     The repo audit found zero live instances; the arm exists so the idiom
 *     cannot become a hole later.
 *   - Within any of the above argument positions: plain string literals,
 *     no-substitution template literals, the STATIC text spans of
 *     substitution-carrying template literals (each span scanned as its own
 *     fragment), and both operands of `+`-concatenation chains, recursively
 *     (`collectErrorMessageExpression`). Live error constructors in this repo
 *     build messages via substitution templates and concatenated template
 *     chains, so literal-only extraction would leave the dominant real-world
 *     form unscanned.
 *
 * Deliberate exclusions (audited, not matched):
 *   - `Object.assign(this, { message: ... })` — repo audit found zero
 *     instances of message assignment through Object.assign; matching every
 *     Object.assign call would require receiver analysis with no current
 *     governance benefit. Pinned as excluded by a scanner test.
 *   - Compound append `this.message += <expr>` inside an extends-bearing
 *     class — zero-instance idiom at audit time; the assignment arm matches
 *     the EqualsToken operator only, so compound-assignment operators fall
 *     outside it deliberately rather than silently.
 *   - Message reassignment on a non-`this` receiver (`err.message = ...`) —
 *     zero shipped instances; a bare `.message` property write on an
 *     arbitrary receiver is not reliably an operator-facing error surface
 *     (data objects carry `message` fields too — e.g. a workflow completion
 *     record).
 *   - Error-factory helpers — every factory-shaped helper found constructs
 *     its error via a matched form internally (`new XError(...)`), so the
 *     construction site is already scanned; a factory call-site passing a
 *     message literal to a helper that constructs elsewhere has no live
 *     instance.
 *   - The substitution EXPRESSIONS inside a template literal (`${...}`) —
 *     dynamic values, not static citation text; and a citation token split
 *     across a substitution or concatenation boundary, which cannot match a
 *     whole-token regex per fragment. Static-text fragments on either side
 *     are scanned.
 */

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

/**
 * Canonical-id regex shared across all surfaces. Mirrors the regex from
 * samples-catalog.test.ts (commit 4fd28a6) extended with JI- (JIT-agents
 * intentions tracker prefix surfaced in pi-agent-dispatch substrate).
 *
 * Reconciliation note: this constant was, until now, module-private and had
 * diverged from a second hand-maintained copy in
 * scripts/scan-comment-citations.ts (that copy's own doc comment names the
 * divergence explicitly). The two families are unioned here rather than
 * either narrowed: `MILE-\d{3,}` is added (declared by
 * milestone.schema.json's `^MILE-\d{3,}$` pattern; live milestone items exist
 * in the active substrate) and `PHASE-\d{3,}` is widened to
 * `PHASE-[A-Z0-9]+(?:-[A-Z0-9]+)+` — NOT the fully-permissive
 * `PHASE-[A-Z0-9-]+` the other copy used (verified empirically: that fully
 * permissive form regresses the repo-wide zero-hits citation-rot assertion in
 * samples-catalog.test.ts, because it also matches this codebase's own
 * "PHASE-NNN" placeholder convention used in schema/doc description prose —
 * "NNN" satisfies `[A-Z0-9-]+` same as a real id would). Every live phase id
 * in `.context/phase.json` (phase.schema.json declares `^PHASE-[A-Z0-9-]+$`)
 * is a multi-segment dash-separated slug — e.g. two-plus segments after
 * `PHASE-` — so requiring at least one internal hyphen distinguishes a real
 * id from the single-segment `NNN` placeholder while matching every id
 * observed in the live substrate. Now exported (`export`) so
 * scripts/scan-comment-citations.ts's own regex can import this one instead
 * of hand-duplicating it, and so the new delta-scoped comment-citation
 * pre-commit gate script can reuse it directly for the comment-trivia
 * surface below.
 *
 * The regex deliberately does NOT carve out "e.g." prose context — at the
 * surface boundary the scanner is enumerative; carve-outs happen one level up
 * (JSONPath-aware skip for structural seed-data id, AST-aware skip for JSDoc
 * + line-comment nodes on the existing scanTsFile surface — scanCommentsInFile
 * below is a separate, additive surface that does the opposite: it scans
 * ONLY comment trivia).
 */
export const CITATION_RE =
	/\b(FGAP-\d{3}|DEC-\d{4}|FEAT-\d{3}|TASK-\d{3}|VER-\d{3}|REVIEW-\d+|RAT-\d+|CTX-\d+|WO-\d+|STORY-\d+|PLAN-\d+|REQ-\d+|R-\d{4}|ISSUE-\d+|issue-\d+|PHASE-[A-Z0-9]+(?:-[A-Z0-9]+)+|MILE-\d{3,}|JI-\d{3})\b/;

/** Global variant used to enumerate every occurrence in a multi-line body. */
export const CITATION_RE_G = new RegExp(CITATION_RE.source, "g");

/**
 * One enumerated citation-rot hit. The `surface` discriminator names the
 * node-kind that surfaced the value; downstream test renders per-hit detail.
 *
 * `ast-error-message` — added 2026-05-29 to close the gap where the scanner
 * extracted string literals from description/registerTool fields but not from
 * `throw new Error(...)`-style constructor arguments, letting canonical-id
 * citations embedded in thrown error messages reach operators ungated — to
 * capture runtime error-message string-literals constructed at NewExpression sites where
 * the constructor identifier ends in `Error`. These flow to the operator
 * via exception propagation and constitute a separate shipped artifact
 * surface distinct from tool-description literals. The same surface kind is
 * emitted by the later construction-form arms (super-call in an extends-
 * bearing class; `this.message = ...` in such a class) — see the module
 * header's construction-form audit for the full arm/exclusion inventory.
 */
export interface ScanResult {
	/** Package-relative directory (e.g. "packages/pi-agent-dispatch"). */
	packageDir: string;
	/** Absolute file path of the hit. */
	file: string;
	/** 1-based line number. */
	line: number;
	/** Discriminator naming the AST / JSON / textual surface. */
	surface:
		| "ast-string-literal"
		| "ast-error-message"
		| "json-string-value"
		| "markdown-body"
		| "yaml-value"
		| "comment";
	/** JSONPath for json-string-value surface; absent otherwise. */
	path?: string;
	/** The full string value containing the matched canonical_id. */
	value: string;
	/** The matched canonical_id token. */
	matched: string;
}

/** Scanner options. */
export interface ScanOpts {
	/** Absolute project root (typically the monorepo root). */
	projectRoot: string;
	/**
	 * Absolute or repo-relative paths to package directories to scan. Each
	 * directory is walked recursively. node_modules + dist directories are
	 * always excluded; test files (*.test.ts, *.test.js) are always excluded.
	 */
	packageDirs: string[];
	/**
	 * Additional file path substrings to exclude (matched via String.includes).
	 * The caller can pin-exclude (e.g.) generated dist fixtures.
	 */
	sourceFileExclusions?: string[];
}

// ─── AST surface (.ts files) ───────────────────────────────────────────────

/**
 * AST predicate: identifies CallExpression nodes whose callee is either
 * `pi.registerTool(...)` (the canonical Pi tool registration site) or a bare
 * `registerTool(...)` identifier call. Only string-literal arguments inside
 * these call trees (and their nested Type.X({description: ...}) parameter
 * descriptors) are considered operator-facing.
 */
function isToolRegistrationCall(node: ts.CallExpression): boolean {
	const callee = node.expression;
	if (ts.isPropertyAccessExpression(callee)) {
		// pi.registerTool / context.registerTool / this.registerTool — any
		// PropertyAccessExpression whose right-hand identifier is registerTool.
		return ts.isIdentifier(callee.name) && callee.name.text === "registerTool";
	}
	if (ts.isIdentifier(callee)) {
		return callee.text === "registerTool";
	}
	return false;
}

/**
 * AST predicate: identifies CallExpression nodes whose callee is a member of
 * the `Type` namespace (typebox: Type.String, Type.Object, Type.Array, etc.).
 * These calls carry `{ description: <literal> }` argument objects that ship to
 * the tool-parameter operator surface.
 */
function isTypeBoxCall(node: ts.CallExpression): boolean {
	const callee = node.expression;
	if (!ts.isPropertyAccessExpression(callee)) return false;
	if (!ts.isIdentifier(callee.expression)) return false;
	return callee.expression.text === "Type";
}

/**
 * AST predicate — closes the gap where thrown-error constructor arguments
 * went unscanned by identifying NewExpression nodes whose constructor
 * identifier ends in `Error`. Matches both plain `new Error(...)` and custom
 * subclasses (e.g. `new CommitAttestedRefusedError(...)`). Constructor first
 * argument string-literal values flow to the operator surface via exception
 * propagation when the error is thrown.
 *
 * Deliberately narrow: only constructors whose name suffix-matches `Error`.
 * Non-Error constructors (data classes, builders) emit value objects that do
 * not necessarily reach an operator-visible surface; including them would
 * inflate noise without governance benefit.
 */
function isErrorConstructorCall(node: ts.NewExpression): boolean {
	const callee = node.expression;
	if (ts.isIdentifier(callee)) {
		return /Error$/.test(callee.text);
	}
	if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.name)) {
		return /Error$/.test(callee.name.text);
	}
	return false;
}

/**
 * Walk up from `node` to the NEAREST enclosing class-like declaration
 * (ClassDeclaration or ClassExpression) and report whether that class carries
 * an `extends` heritage clause. Stops at the first class-like ancestor — a
 * heritage-free inner class nested inside an extends-bearing outer class does
 * NOT qualify (its own `super`/`this.message` semantics are the inner
 * class's). Requires the source file to be parsed with setParentNodes.
 */
function enclosingClassHasExtendsClause(node: ts.Node): boolean {
	let cur: ts.Node | undefined = node.parent;
	while (cur) {
		if (ts.isClassDeclaration(cur) || ts.isClassExpression(cur)) {
			return (cur.heritageClauses ?? []).some((h) => h.token === ts.SyntaxKind.ExtendsKeyword);
		}
		cur = cur.parent;
	}
	return false;
}

/**
 * AST predicate — the super-construction arm of the error-message surface: a
 * CallExpression whose callee is the `super` keyword inside a class that
 * extends ANY base. The standard Error-subclass idiom builds its
 * operator-facing message via `super(...)` in its own constructor — a
 * CallExpression, not a NewExpression, so the NewExpression arm never visits
 * it. Conservative on the base: any extends clause qualifies (see the module
 * header's construction-form audit for the rationale). A `super(...)` written
 * in a heritage-free class is a grammar error the parser still represents;
 * the heritage walk skips it rather than treating unreachable code as an
 * operator surface.
 */
function isSuperConstructionCall(node: ts.CallExpression): boolean {
	if (node.expression.kind !== ts.SyntaxKind.SuperKeyword) return false;
	return enclosingClassHasExtendsClause(node);
}

/**
 * AST predicate — the message-assignment arm of the error-message surface:
 * `this.message = <expr>` inside a class that extends ANY base. Zero live
 * instances at audit time; the arm exists so the idiom cannot become a
 * silent hole later. The heritage requirement keeps plain data classes with
 * a `message` field (not an operator-facing error surface) out of scope.
 */
function isThisMessageAssignment(node: ts.BinaryExpression): boolean {
	if (node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return false;
	const left = node.left;
	if (!ts.isPropertyAccessExpression(left)) return false;
	if (left.expression.kind !== ts.SyntaxKind.ThisKeyword) return false;
	if (!ts.isIdentifier(left.name) || left.name.text !== "message") return false;
	return enclosingClassHasExtendsClause(node);
}

/**
 * Walk a .ts source file and enumerate every CallExpression whose callee is
 * a tool-registration entry-point or a typebox descriptor; pull description
 * string-literal values out of those subtrees. Additionally — closing the same
 * thrown-error-message scanning gap — enumerate the error-message
 * construction forms (NewExpression on an /Error$/ constructor; `super(...)`
 * inside an extends-bearing class; `this.message = ...` inside such a class
 * — see the module header's construction-form audit) — error messages are an
 * operator-visible surface via exception propagation.
 */
function scanTsFile(file: string, packageDir: string): ScanResult[] {
	const text = fs.readFileSync(file, "utf-8");
	const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, /* setParentNodes */ true);
	const descriptionStrings: { line: number; value: string }[] = [];
	const errorMessageStrings: { line: number; value: string }[] = [];
	// De-dup string-literal node positions: when an inner Type.X() call sits
	// inside an outer registerTool({ parameters: Type.Object(...) }) tree,
	// both the outer registerTool walk + the standalone module-level Type.X
	// walk would otherwise visit the same description literal. The seen-set
	// keys by literal-node start position (unique within a SourceFile).
	const seenLiteralStart = new Set<number>();

	const collect = (arg: ts.Node): void => {
		const buf: { line: number; value: string; start: number }[] = [];
		const inner = (n: ts.Node): void => {
			if (ts.isObjectLiteralExpression(n)) {
				for (const prop of n.properties) {
					if (!ts.isPropertyAssignment(prop)) continue;
					const name = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : undefined;
					if (name === "description") {
						if (ts.isStringLiteral(prop.initializer) || ts.isNoSubstitutionTemplateLiteral(prop.initializer)) {
							buf.push({
								line: sourceFile.getLineAndCharacterOfPosition(prop.initializer.getStart()).line + 1,
								value: prop.initializer.text,
								start: prop.initializer.getStart(),
							});
						}
						continue;
					}
					ts.forEachChild(prop.initializer, inner);
				}
				return;
			}
			if (ts.isCallExpression(n)) {
				for (const a of n.arguments) inner(a);
				return;
			}
			ts.forEachChild(n, inner);
		};
		inner(arg);
		for (const entry of buf) {
			if (seenLiteralStart.has(entry.start)) continue;
			seenLiteralStart.add(entry.start);
			descriptionStrings.push({ line: entry.line, value: entry.value });
		}
	};

	// Static-text extraction shared by every error-message construction arm.
	// Recurses through the shapes live error constructors actually use (see
	// the module header's construction-form audit): plain string literals,
	// no-substitution templates, the STATIC spans of substitution-carrying
	// templates (each span its own fragment, at its own line), and both
	// operands of `+`-concatenation chains. Substitution expressions
	// themselves are dynamic values, not static citation text — skipped.
	const collectErrorMessageExpression = (expr: ts.Expression | undefined): void => {
		if (!expr) return;
		if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
			errorMessageStrings.push({
				line: sourceFile.getLineAndCharacterOfPosition(expr.getStart()).line + 1,
				value: expr.text,
			});
			return;
		}
		if (ts.isTemplateExpression(expr)) {
			if (expr.head.text.length > 0) {
				errorMessageStrings.push({
					line: sourceFile.getLineAndCharacterOfPosition(expr.head.getStart()).line + 1,
					value: expr.head.text,
				});
			}
			for (const span of expr.templateSpans) {
				if (span.literal.text.length > 0) {
					errorMessageStrings.push({
						line: sourceFile.getLineAndCharacterOfPosition(span.literal.getStart()).line + 1,
						value: span.literal.text,
					});
				}
			}
			return;
		}
		if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.PlusToken) {
			collectErrorMessageExpression(expr.left);
			collectErrorMessageExpression(expr.right);
		}
	};

	const visit = (node: ts.Node): void => {
		if (ts.isCallExpression(node)) {
			if (isToolRegistrationCall(node)) {
				for (const arg of node.arguments) collect(arg);
			} else if (isTypeBoxCall(node)) {
				// Typebox calls outside a registerTool tree still ship to the
				// operator surface when they appear in module-level exported
				// parameter schemas — scan their description args too.
				for (const arg of node.arguments) collect(arg);
			} else if (isSuperConstructionCall(node)) {
				// super-construction arm: the Error-subclass constructor idiom
				// builds its message via super(...) — a CallExpression the
				// NewExpression arm never visits. Only the first arg is
				// examined, exactly as the NewExpression arm — the message
				// position by Error convention.
				if (node.arguments.length > 0) collectErrorMessageExpression(node.arguments[0]);
			}
		} else if (ts.isNewExpression(node) && isErrorConstructorCall(node)) {
			// Extract the first argument's static text from Error
			// constructors, closing the gap where thrown-error messages went
			// unscanned. Only the first arg is examined — Error subclasses
			// conventionally place the human-readable reason there.
			const args = node.arguments;
			if (args && args.length > 0) collectErrorMessageExpression(args[0]);
		} else if (ts.isBinaryExpression(node) && isThisMessageAssignment(node)) {
			// message-assignment arm: `this.message = ...` inside an
			// extends-bearing class writes the same operator-facing surface.
			collectErrorMessageExpression(node.right);
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);

	const hits: ScanResult[] = [];
	for (const entry of descriptionStrings) {
		const matches = entry.value.matchAll(CITATION_RE_G);
		for (const m of matches) {
			hits.push({
				packageDir,
				file,
				line: entry.line,
				surface: "ast-string-literal",
				value: entry.value,
				matched: m[0],
			});
		}
	}
	for (const entry of errorMessageStrings) {
		const matches = entry.value.matchAll(CITATION_RE_G);
		for (const m of matches) {
			hits.push({
				packageDir,
				file,
				line: entry.line,
				surface: "ast-error-message",
				value: entry.value,
				matched: m[0],
			});
		}
	}
	return hits;
}

// ─── Comment-trivia surface (additive) ─────────────────────────────────────

/** Max excerpt length carried on a comment hit's `value` before truncating around the match. */
const MAX_COMMENT_EXCERPT_LEN = 300;

/**
 * Truncate a long comment to a bounded excerpt centered on the match, so a
 * huge doc-comment doesn't blow up a hit's `value`. Short comments pass
 * through unchanged. Mirrors scripts/scan-comment-citations.ts's `excerpt`.
 */
function commentExcerpt(raw: string, matchIndex: number, matchLen: number): string {
	if (raw.length <= MAX_COMMENT_EXCERPT_LEN) return raw;
	const half = Math.floor(MAX_COMMENT_EXCERPT_LEN / 2);
	const start = Math.max(0, matchIndex - half);
	const end = Math.min(raw.length, matchIndex + matchLen + half);
	const prefix = start > 0 ? "…" : "";
	const suffix = end < raw.length ? "…" : "";
	return prefix + raw.slice(start, end) + suffix;
}

/**
 * Additive comment-trivia surface: scans JSDoc + block + line comment tokens
 * in a .ts/.tsx file's source text for CITATION_RE matches. This is the
 * inverse of scanTsFile above, which deliberately walks only string-literal
 * AST nodes and never visits comment trivia (the "does NOT flag JSDoc
 * comments" contract that surface pins). This function is NOT wired into
 * scanForCitationRot's default surfaces — comments stay excluded from that
 * walk. It exists so a delta-scoped caller (the new
 * scripts/check-comment-citations.ts pre-commit gate) can compute a
 * before/after comment-citation set itself and flag only a citation newly
 * introduced by a change, never a pre-existing one.
 *
 * Uses ts.createScanner with skipTrivia=false to enumerate every comment
 * token from the raw token stream, rather than a line-prefix regex — this
 * module's own doc comment already names line-prefix regexing as a
 * known-bad approach (false positives/negatives from indentation). A
 * separate ts.createSourceFile is used purely for its
 * getLineAndCharacterOfPosition offset->line lookup (no tree walking).
 *
 * `packageDir` is optional (defaults to "") since this function's callers
 * (a delta-scoped gate diffing before/after comment text) generally care
 * about file+line+matched, not package attribution; supply it when the
 * caller wants a populated packageDir on the returned hits.
 */
export function scanCommentsInFile(filePath: string, sourceText: string, packageDir = ""): ScanResult[] {
	const hits: ScanResult[] = [];
	const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, /* setParentNodes */ false);

	const scanner = ts.createScanner(ts.ScriptTarget.Latest, /* skipTrivia */ false);
	scanner.setText(sourceText);

	// A bare scan() loop mis-tokenizes template literals carrying `${...}`
	// substitutions (see scripts/scan-comment-citations.ts's scanFile for the
	// full rationale); templateBraceDepths tracks nested ordinary `{}` depth
	// within each currently-open template substitution so the scanner
	// correctly resumes inside the template literal after a substitution's
	// closing `}`.
	const templateBraceDepths: number[] = [];

	let kind = scanner.scan();
	while (kind !== ts.SyntaxKind.EndOfFileToken) {
		if (kind === ts.SyntaxKind.SingleLineCommentTrivia || kind === ts.SyntaxKind.MultiLineCommentTrivia) {
			const raw = scanner.getTokenText();
			const tokenStart = scanner.getTokenStart();

			CITATION_RE_G.lastIndex = 0;
			let m: RegExpExecArray | null = CITATION_RE_G.exec(raw);
			while (m !== null) {
				const absOffset = tokenStart + m.index;
				const line = sourceFile.getLineAndCharacterOfPosition(absOffset).line + 1;
				hits.push({
					packageDir,
					file: filePath,
					line,
					surface: "comment",
					value: commentExcerpt(raw, m.index, m[0].length),
					matched: m[0],
				});
				m = CITATION_RE_G.exec(raw);
			}
		} else if (kind === ts.SyntaxKind.TemplateHead) {
			templateBraceDepths.push(0);
		} else if (kind === ts.SyntaxKind.OpenBraceToken && templateBraceDepths.length > 0) {
			templateBraceDepths[templateBraceDepths.length - 1]++;
		} else if (kind === ts.SyntaxKind.CloseBraceToken && templateBraceDepths.length > 0) {
			const top = templateBraceDepths.length - 1;
			if (templateBraceDepths[top] === 0) {
				templateBraceDepths.pop();
				kind = scanner.reScanTemplateToken(/* isTaggedTemplate */ false);
				if (kind === ts.SyntaxKind.TemplateMiddle) templateBraceDepths.push(0);
				continue; // kind already advanced; skip the trailing scan() below
			}
			templateBraceDepths[top]--;
		}
		kind = scanner.scan();
	}

	return hits;
}

// ─── JSON surface ────────────────────────────────────────────────────────

/**
 * Heuristic: is this JSON file a JSON-schema file (carves out `pattern` and
 * `enum` string values that legitimately encode canonical-id constraints)?
 */
function isSchemaFile(file: string): boolean {
	return file.endsWith(".schema.json");
}

/**
 * Heuristic: is this JSON file an array-of-items seed-data file (carves out
 * top-level `id` string values that legitimately encode each item's
 * canonical_id)? Covers:
 *   - samples/blocks/ — packaged conception seed data
 *   - .project/ — live substrate
 *   - registry/blocks/ + defaults/blocks/ — legacy on-disk fixtures
 *     (structurally identical to samples/blocks/; the scanner gates them
 *     defensively even though they are unshipped)
 *   - test-fixtures/blocks/ — per-package test-fixture block-data, the same
 *     item-data category as samples/blocks/ (array-of-items files whose
 *     top-level `id` values are canonical_ids, not citations)
 */
function isItemsFile(file: string): boolean {
	const norm = file.replace(/\\/g, "/");
	return (
		norm.includes("/samples/blocks/") ||
		norm.includes("/.project/") ||
		norm.includes("/registry/blocks/") ||
		norm.includes("/defaults/blocks/") ||
		norm.includes("/test-fixtures/blocks/")
	);
}

/**
 * Recursive JSON walker; tracks JSONPath; carves out per-file allowlist of
 * structural-value paths (id values in items files; pattern / enum string
 * values in schema files).
 */
function visitJsonNode(
	node: unknown,
	jsonPath: string,
	parentKey: string | null,
	file: string,
	packageDir: string,
	hits: ScanResult[],
): void {
	if (typeof node === "string") {
		// Item-level id at array-element top-level under samples/blocks/ or
		// .project/ — structural canonical_id, not a citation.
		if (parentKey === "id" && isItemsFile(file)) return;
		// Schema pattern / enum string values in *.schema.json — allowed to
		// encode canonical-id form as a constraint, not a citation.
		if (isSchemaFile(file) && (parentKey === "pattern" || parentKey === "enum")) return;
		const matches = node.matchAll(CITATION_RE_G);
		for (const m of matches) {
			hits.push({
				packageDir,
				file,
				line: 0,
				surface: "json-string-value",
				path: jsonPath || "$",
				value: node,
				matched: m[0],
			});
		}
		return;
	}
	if (Array.isArray(node)) {
		node.forEach((v, i) => {
			visitJsonNode(v, `${jsonPath}[${i}]`, null, file, packageDir, hits);
		});
		return;
	}
	if (node && typeof node === "object") {
		for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
			// Schema enum is an Array; the enum-string carve-out fires when
			// the parent property name is `enum` (the Array's parentKey was set
			// above for individual elements as `null` — re-attribute via
			// jsonPath suffix-check inside the string branch).
			visitJsonNode(v, jsonPath ? `${jsonPath}.${k}` : k, k, file, packageDir, hits);
		}
	}
}

function scanJsonFile(file: string, packageDir: string): ScanResult[] {
	const text = fs.readFileSync(file, "utf-8");
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		// Unparseable JSON — defer to the calling test to surface separately.
		return [];
	}
	const hits: ScanResult[] = [];
	visitJsonNode(parsed, "", null, file, packageDir, hits);
	// Augment line numbers via a coarse scan (the JSON walker doesn't track
	// source positions; line is derived by string-index search over the file
	// text on a best-effort basis — citation values are short + distinctive).
	if (hits.length > 0) {
		const lines = text.split("\n");
		for (const hit of hits) {
			for (let i = 0; i < lines.length; i++) {
				if (lines[i].includes(hit.matched)) {
					hit.line = i + 1;
					break;
				}
			}
		}
	}
	// JSON enum element strings — when the parent ARRAY's property name was
	// `enum` inside a schema file, the per-element walker lost the parent key.
	// Filter those out here via JSONPath suffix-check.
	return hits.filter((h) => {
		if (!isSchemaFile(file)) return true;
		// jsonPath like "...enum[0]" — strip trailing "[N]" and check.
		const stripped = (h.path ?? "").replace(/\[\d+\]$/, "");
		if (stripped.endsWith(".enum") || stripped === "enum") return false;
		return true;
	});
}

// ─── Markdown / YAML body surface ─────────────────────────────────────────

/**
 * Full-text body scan; catches multi-line straddle. Each match's line is
 * derived by counting newlines up to the match index — robust to multi-line
 * citation references that the naive line-by-line scan (which previously let
 * internal canonical-id citations leak into operator-facing text) misses.
 */
function scanTextBody(file: string, packageDir: string, surface: "markdown-body" | "yaml-value"): ScanResult[] {
	const text = fs.readFileSync(file, "utf-8");
	const hits: ScanResult[] = [];
	const matches = text.matchAll(CITATION_RE_G);
	for (const m of matches) {
		const idx = m.index ?? 0;
		const line = text.slice(0, idx).split("\n").length;
		// Carry only the surrounding ~120 chars for readability in the test
		// failure message.
		const start = Math.max(0, idx - 60);
		const end = Math.min(text.length, idx + 60);
		hits.push({
			packageDir,
			file,
			line,
			surface,
			value: text.slice(start, end),
			matched: m[0],
		});
	}
	return hits;
}

// ─── File walker ─────────────────────────────────────────────────────────

function walkPackage(dir: string, root: string, exclusions: string[], files: { abs: string; rel: string }[]): void {
	if (!fs.existsSync(dir)) return;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		// Always-exclude directories.
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
			walkPackage(full, root, exclusions, files);
			continue;
		}
		if (!entry.isFile()) continue;
		// Test files never ship to the operator surface; structural-data
		// fixtures live there + would generate noise.
		if (full.endsWith(".test.ts") || full.endsWith(".test.js")) continue;
		// Caller-pinned exclusions.
		if (exclusions.some((sub) => full.includes(sub))) continue;
		files.push({ abs: full, rel: path.relative(root, full) });
	}
}

/**
 * Entry point. Walks every packageDir; per-file dispatches to the
 * AST / JSON / markdown / YAML scanner; returns a flat ScanResult array.
 */
export function scanForCitationRot(opts: ScanOpts): ScanResult[] {
	const exclusions = opts.sourceFileExclusions ?? [];
	const results: ScanResult[] = [];

	for (const pkgDir of opts.packageDirs) {
		const abs = path.isAbsolute(pkgDir) ? pkgDir : path.join(opts.projectRoot, pkgDir);
		const packageDir = path.relative(opts.projectRoot, abs) || abs;
		const files: { abs: string; rel: string }[] = [];
		walkPackage(abs, opts.projectRoot, exclusions, files);

		for (const f of files) {
			const lower = f.abs.toLowerCase();
			if (lower.endsWith(".ts") || lower.endsWith(".tsx")) {
				results.push(...scanTsFile(f.abs, packageDir));
			} else if (lower.endsWith(".json")) {
				results.push(...scanJsonFile(f.abs, packageDir));
			} else if (lower.endsWith(".md")) {
				results.push(...scanTextBody(f.abs, packageDir, "markdown-body"));
			} else if (lower.endsWith(".yaml") || lower.endsWith(".yml")) {
				results.push(...scanTextBody(f.abs, packageDir, "yaml-value"));
			}
		}
	}

	return results;
}
