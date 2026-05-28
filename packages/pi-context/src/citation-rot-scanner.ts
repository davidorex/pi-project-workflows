/**
 * citation-rot-scanner — rigorous AST + JSON + markdown/YAML body scanner that
 * surfaces pi-project-workflows-repo canonical_id citations (FGAP-NNN /
 * DEC-NNNN / FEAT-NNN / TASK-NNN / VER-NNN / REVIEW-N / RAT-N / CTX-N / WO-N /
 * STORY-N / PLAN-N / REQ-N / R-NNNN / ISSUE-N / issue-N / PHASE-NNN+ / JI-NNN)
 * inside shipped artifacts of all monorepo packages.
 *
 * Aim: replace the naive line-by-line CITATION_RE scan that landed at FGAP-130
 * (commit 4fd28a6) with an AST-aware enumerator that discriminates by node
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
 */

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

/**
 * Canonical-id regex shared across all surfaces. Mirrors the regex from
 * samples-catalog.test.ts (commit 4fd28a6) extended with JI- (JIT-agents
 * intentions tracker prefix surfaced in pi-agent-dispatch substrate).
 *
 * The regex deliberately does NOT carve out "e.g." prose context — at the
 * surface boundary the scanner is enumerative; carve-outs happen one level up
 * (JSONPath-aware skip for structural seed-data id, AST-aware skip for JSDoc
 * + line-comment nodes).
 */
const CITATION_RE =
	/\b(FGAP-\d{3}|DEC-\d{4}|FEAT-\d{3}|TASK-\d{3}|VER-\d{3}|REVIEW-\d+|RAT-\d+|CTX-\d+|WO-\d+|STORY-\d+|PLAN-\d+|REQ-\d+|R-\d{4}|ISSUE-\d+|issue-\d+|PHASE-\d{3,}|JI-\d{3})\b/;

/** Global variant used to enumerate every occurrence in a multi-line body. */
const CITATION_RE_G = new RegExp(CITATION_RE.source, "g");

/**
 * One enumerated citation-rot hit. The `surface` discriminator names the
 * node-kind that surfaced the value; downstream test renders per-hit detail.
 */
export interface ScanResult {
	/** Package-relative directory (e.g. "packages/pi-agent-dispatch"). */
	packageDir: string;
	/** Absolute file path of the hit. */
	file: string;
	/** 1-based line number. */
	line: number;
	/** Discriminator naming the AST / JSON / textual surface. */
	surface: "ast-string-literal" | "json-string-value" | "markdown-body" | "yaml-value";
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
 * Walk a .ts source file and enumerate every CallExpression whose callee is
 * a tool-registration entry-point or a typebox descriptor; pull description
 * string-literal values out of those subtrees.
 */
function scanTsFile(file: string, packageDir: string): ScanResult[] {
	const text = fs.readFileSync(file, "utf-8");
	const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, /* setParentNodes */ true);
	const descriptionStrings: { line: number; value: string }[] = [];
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

	const visit = (node: ts.Node): void => {
		if (ts.isCallExpression(node)) {
			if (isToolRegistrationCall(node)) {
				for (const arg of node.arguments) collect(arg);
			} else if (isTypeBoxCall(node)) {
				// Typebox calls outside a registerTool tree still ship to the
				// operator surface when they appear in module-level exported
				// parameter schemas — scan their description args too.
				for (const arg of node.arguments) collect(arg);
			}
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
 *     defensively per FGAP-131 plan step 3 scope)
 */
function isItemsFile(file: string): boolean {
	const norm = file.replace(/\\/g, "/");
	return (
		norm.includes("/samples/blocks/") ||
		norm.includes("/.project/") ||
		norm.includes("/registry/blocks/") ||
		norm.includes("/defaults/blocks/")
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
 * citation references that the FGAP-130 naive line-by-line scan misses.
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
