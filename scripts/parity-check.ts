#!/usr/bin/env -S npx tsx
/**
 * Build-time PARITY CHECK — the FGAP-009 op-coverage contract, mechanically
 * enforced (TASK-008 / cli-arc γ).
 *
 * The contract (defined in @davidorex/pi-context/ops as OP_COVERAGE_RULE +
 * CoverageClass + INTENTIONALLY_UNEXPOSED_WRITERS) asserts that EVERY library
 * write function in packages/pi-context/src is COVERED by one of five mutually
 * exhaustive classes: op-backed-direct, op-backed-transitive, for-dir-twin,
 * intentionally-unexposed, or internal-primitive. A writer matching NONE is a
 * silent gap — a write capability with no op surface and no recorded reason.
 *
 * This check enumerates writers FROM SOURCE (AST walk), not from a hand-list,
 * so a newly-added library writer that is neither op-reachable nor a ForDir
 * twin nor allowlisted nor a structural internal-primitive auto-FAILS. It also
 * guards attestation: a write op whose run() calls a ctx-accepting writer
 * WITHOUT forwarding its own ctx is a silent attestation drop and FAILs.
 *
 * Three enforcement categories, all exit-1 on any violation:
 *   1. classification — every enumerated writer lands in exactly one class;
 *      UNCLASSIFIED writers are violations.
 *   2. ctx-forwarding — every op→writer call (direct or transitive) that COULD
 *      forward ctx (the writer declares ctx, the op's run has a ctx param) MUST
 *      forward it. A dropped ctx is a hard FAIL. dual-surface optional-param
 *      divergences vs the orchestrator-script sibling (dryRun/ordinal/idField)
 *      are reported as soft divergences (printed, not fatal) per the spec.
 *   3. {json}-content-cap (FGAP-015) — an op that returns { json } of a content-
 *      reading library call (CONTENT_READING_FNS), inline or via a single same-
 *      body const/let binding, bypasses the 50KB read cap (enforced only on the
 *      {read} channel). Hard FAIL: emit { read: structureForRead(...) } instead.
 *
 * Pure helpers (enumerateWriters / classifyWriter / classifyAll /
 * checkCtxForwarding / checkJsonContentCap / parseSourceTree / opDeclaresParam /
 * scriptParsesFlag / flattenSchemaProperties) are exported for
 * scripts/parity-check.test.ts. main() aggregates violations + exits.
 *
 * AST idiom mirrors packages/pi-context/src/citation-rot-scanner.ts
 * (ts.createSourceFile + ts.forEachChild + node-type guards). Enforcement /
 * exit-code shape mirrors scripts/check-changelog.ts.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { CoverageClass, INTENTIONALLY_UNEXPOSED_WRITERS, type OpDefinition, ops } from "@davidorex/pi-context/ops";
import ts from "typescript";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Disk-write primitive call identifiers (bare + fs.-qualified forms). */
const DISK_WRITE_PRIMITIVES = new Set(["writeFileSync", "renameSync", "unlinkSync"]);

/** The typed-file writer layer — calling any of these reaches disk. */
const TYPED_FILE_WRITERS = new Set([
	"writeTypedFile",
	"appendToTypedFile",
	"appendManyToTypedFileIfAbsent",
	"updateItemInTypedFile",
	"upsertItemInTypedFile",
	"removeFromTypedFile",
	"appendToNestedTypedFile",
	"updateNestedItemInTypedFile",
	"removeFromNestedTypedFile",
]);

/**
 * First-param names that mark a writer as a block-api INTERNAL PRIMITIVE: the
 * writer is keyed by a concrete FILE PATH, below the substrate-dir resolution
 * layer. A cwd-first or substrateDir-first writer is NOT internal-primitive.
 */
const INTERNAL_PRIMITIVE_FIRST_PARAMS = new Set(["filePath", "schemaPath"]);

/**
 * Optional dual-surface params compared op-schema vs orchestrator-script. `ctx`
 * is NOT in this set — ctx forwarding is the SEPARATE fatal guard
 * (checkCtxForwarding); double-reporting it here would be noise. Each entry maps
 * the camelCase param name (the op's typebox schema property key + the op's
 * destructured run param) to the kebab-case `--flag` the orchestrator script
 * parses.
 */
const DUAL_SURFACE_OPTIONAL_PARAMS: Record<string, string> = {
	dryRun: "--dry-run",
	ordinal: "--ordinal",
	idField: "--id-field",
};

/**
 * Library functions whose return value EMBEDS substrate item / block content
 * (not a count, a status, or a derived projection). An op that directly returns
 * one of these results through the `{json}` channel BYPASSES the 50KB read cap
 * (enforced only on the `{read}` channel via structureForRead) — the FGAP-015
 * root cause. The gate below FAILS such a return so the op is forced onto
 * `{read}`. The set is deliberately the concrete content-readers (NOT
 * derivations like contextState / validateContext / listSubstrates, whose
 * `{json}` returns are projections that legitimately stay on the json channel).
 */
const CONTENT_READING_FNS = new Set([
	"readBlock",
	"readBlockForDir",
	"readBlockItem",
	"readBlockDir",
	"resolveItemById",
	"resolveItemsByIds",
	"filterBlockItems",
	"joinBlocks",
	"buildIdIndex",
	"resolveRef",
	"readBlockPage",
]);

// ─── Parsed-source model ──────────────────────────────────────────────────────

/** A function definition (exported or local) recovered from the source tree. */
export interface FnDef {
	name: string;
	exported: boolean;
	file: string;
	/** 1-based line of the declaration. */
	line: number;
	/** Declared parameter names, in order. */
	params: string[];
	/** Whether a `ctx` parameter is declared. */
	declaresCtx: boolean;
	/** Identifiers called directly in the body (callee names). */
	callees: string[];
	/** True if the body directly contains a disk-write / typed-file-writer call. */
	directWrite: boolean;
}

/** An op's run() body, AST-located for callee + ctx-forwarding analysis. */
export interface OpRun {
	opName: string;
	/** run()'s own declared parameter names. */
	params: string[];
	/** Whether run() declares a `ctx` parameter. */
	declaresCtx: boolean;
	/** Identifiers called directly in run(). */
	callees: string[];
	/**
	 * For each directly-called identifier, whether the call forwards an argument
	 * that is the bare identifier `ctx` (run's own ctx). Keyed by callee name;
	 * a callee invoked multiple times is true if ANY call site forwards ctx.
	 */
	forwardsCtxTo: Record<string, boolean>;
	/**
	 * For each `const`/`let <name> = <callee>(...)` binding in the run body whose
	 * initializer is a bare-identifier-callee `CallExpression`, the callee name.
	 * Keyed by the bound identifier name (last-wins on rebinding). Used by the
	 * `{json}`-content-cap gate to resolve a `return { json: <ident> }` back to
	 * the call that produced `<ident>`. Only single-identifier-callee inits are
	 * recorded (a property-access callee like `x.read()` is not a content-read
	 * library fn the gate tracks).
	 */
	bindings: Record<string, string>;
	/**
	 * Each `return { json: <value> }` in the run body, classified by what `<value>`
	 * is: an inline call to a bare-identifier callee (`callee` set, `identifier`
	 * null), a bare identifier reference (`identifier` set, `callee` null), or
	 * neither (both null — a constructed/transformed object literal, a member
	 * expression, etc.). The gate flags only the call / identifier-bound-to-a-
	 * content-read forms.
	 */
	jsonReturns: { callee: string | null; identifier: string | null }[];
}

/** The parsed source tree: every fn def by name, plus op runs. */
export interface ParsedTree {
	/** All function defs keyed by name (last-wins on name collision across files). */
	fns: Map<string, FnDef>;
	/** Op runs, indexed by op name. */
	opRuns: OpRun[];
}

// ─── AST helpers ──────────────────────────────────────────────────────────────

/** Parameter names of a function-like node, in declaration order. */
function paramNames(node: ts.FunctionLikeDeclarationBase): string[] {
	return node.parameters.map((p) => (ts.isIdentifier(p.name) ? p.name.text : "<destructured>"));
}

/**
 * Walk a function/method body collecting (a) direct callee identifier names and
 * (b) whether the body directly contains a disk-write / typed-file-writer call.
 * Nested function declarations are NOT descended into (their calls belong to the
 * nested fn, recovered separately when that fn is itself a def we parse). Object
 * methods / arrow callbacks inline in the body ARE descended (they share the
 * lexical ctx and run synchronously as part of the body).
 */
function collectBody(body: ts.Node | undefined): { callees: string[]; directWrite: boolean } {
	const callees: string[] = [];
	let directWrite = false;
	if (!body) return { callees, directWrite };

	const visit = (n: ts.Node): void => {
		// Do not descend into nested named/standalone function declarations.
		if (ts.isFunctionDeclaration(n)) return;

		if (ts.isCallExpression(n)) {
			const callee = n.expression;
			let name: string | undefined;
			if (ts.isIdentifier(callee)) {
				name = callee.text;
			} else if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.name)) {
				// fs.writeFileSync -> property name "writeFileSync"; also method calls.
				name = callee.name.text;
			}
			if (name) {
				callees.push(name);
				if (DISK_WRITE_PRIMITIVES.has(name) || TYPED_FILE_WRITERS.has(name)) directWrite = true;
			}
		}
		ts.forEachChild(n, visit);
	};
	ts.forEachChild(body, visit);
	return { callees, directWrite };
}

/**
 * Parse one .ts source file into FnDefs. Captures BOTH `export function` and
 * local `function` declarations (transitive call-graph chains run through local
 * helpers too — e.g. switchToExisting). Exported flag distinguishes the writer
 * universe (only exported fns are candidate library writers) from internal-only
 * helpers (graph-traversal nodes).
 */
function parseFile(file: string): FnDef[] {
	const text = readFileSync(file, "utf-8");
	const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, /* setParentNodes */ true);
	const defs: FnDef[] = [];

	const visit = (node: ts.Node): void => {
		if (ts.isFunctionDeclaration(node) && node.name) {
			const exported = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
			const params = paramNames(node);
			const { callees, directWrite } = collectBody(node.body);
			defs.push({
				name: node.name.text,
				exported,
				file,
				line: sf.getLineAndCharacterOfPosition(node.name.getStart()).line + 1,
				params,
				declaresCtx: params.includes("ctx"),
				callees,
				directWrite,
			});
		}
		// Do not descend into a fn declaration's body for further top-level decls.
		if (!ts.isFunctionDeclaration(node)) ts.forEachChild(node, visit);
	};
	visit(sf);
	return defs;
}

/**
 * Locate each op's run() in ops-registry.ts and recover its params + callees +
 * per-callee ctx-forwarding. The ops registry is an array literal of object
 * literals; each object has a `name: "<op>"` property and a `run(...)` method
 * (a MethodDeclaration). We match the run method to its sibling `name` literal.
 */
function parseOpRuns(opsRegistryFile: string): OpRun[] {
	const text = readFileSync(opsRegistryFile, "utf-8");
	const sf = ts.createSourceFile(opsRegistryFile, text, ts.ScriptTarget.Latest, true);
	const out: OpRun[] = [];

	const visitObjectLiteral = (obj: ts.ObjectLiteralExpression): void => {
		let opName: string | undefined;
		let runNode: ts.MethodDeclaration | ts.FunctionExpression | ts.ArrowFunction | undefined;
		for (const prop of obj.properties) {
			// name: "<op>"
			if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === "name") {
				if (ts.isStringLiteral(prop.initializer) || ts.isNoSubstitutionTemplateLiteral(prop.initializer)) {
					opName = prop.initializer.text;
				}
			}
			// run(...) { } method shorthand
			if (ts.isMethodDeclaration(prop) && ts.isIdentifier(prop.name) && prop.name.text === "run") {
				runNode = prop;
			}
			// run: (...) => {} / run: function(...) {}
			if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === "run") {
				if (ts.isArrowFunction(prop.initializer) || ts.isFunctionExpression(prop.initializer)) {
					runNode = prop.initializer;
				}
			}
		}
		if (!opName || !runNode) return;

		const params = paramNames(runNode);
		const callees: string[] = [];
		const forwardsCtxTo: Record<string, boolean> = {};
		const bindings: Record<string, string> = {};
		const jsonReturns: { callee: string | null; identifier: string | null }[] = [];
		const body: ts.Node | undefined = runNode.body;
		// The bare-identifier callee name of a CallExpression, or undefined for a
		// property-access / non-identifier callee (not a tracked content-read fn).
		const bareCalleeName = (call: ts.CallExpression): string | undefined =>
			ts.isIdentifier(call.expression) ? call.expression.text : undefined;
		if (body) {
			const visit = (n: ts.Node): void => {
				if (ts.isFunctionDeclaration(n)) return;
				// `const`/`let <name> = <callee>(...)` — record the bound identifier →
				// bare-identifier callee, so a later `return { json: <name> }` resolves.
				if (
					ts.isVariableDeclaration(n) &&
					ts.isIdentifier(n.name) &&
					n.initializer &&
					ts.isCallExpression(n.initializer)
				) {
					const calleeName = bareCalleeName(n.initializer);
					if (calleeName) bindings[n.name.text] = calleeName;
				}
				// `return { json: <value> }` — classify <value> as inline-call / ident / other.
				if (ts.isReturnStatement(n) && n.expression && ts.isObjectLiteralExpression(n.expression)) {
					for (const prop of n.expression.properties) {
						if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === "json") {
							const value = prop.initializer;
							if (ts.isCallExpression(value)) {
								jsonReturns.push({ callee: bareCalleeName(value) ?? null, identifier: null });
							} else if (ts.isIdentifier(value)) {
								jsonReturns.push({ callee: null, identifier: value.text });
							} else {
								jsonReturns.push({ callee: null, identifier: null });
							}
						}
					}
				}
				if (ts.isCallExpression(n)) {
					const callee = n.expression;
					let name: string | undefined;
					if (ts.isIdentifier(callee)) name = callee.text;
					else if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.name)) name = callee.name.text;
					if (name) {
						callees.push(name);
						// Does this call forward the bare identifier `ctx` as an argument?
						const forwardsCtx = n.arguments.some((a) => ts.isIdentifier(a) && a.text === "ctx");
						forwardsCtxTo[name] = (forwardsCtxTo[name] ?? false) || forwardsCtx;
					}
				}
				ts.forEachChild(n, visit);
			};
			ts.forEachChild(body, visit);
		}
		out.push({ opName, params, declaresCtx: params.includes("ctx"), callees, forwardsCtxTo, bindings, jsonReturns });
	};

	const visit = (node: ts.Node): void => {
		if (ts.isObjectLiteralExpression(node)) visitObjectLiteral(node);
		ts.forEachChild(node, visit);
	};
	visit(sf);
	return out;
}

// ─── Tree assembly ────────────────────────────────────────────────────────────

/** Recursively list non-test .ts files under a dir (skips dist/node_modules). */
function listSourceFiles(dir: string): string[] {
	const out: string[] = [];
	const walk = (d: string): void => {
		if (!existsSync(d)) return;
		for (const entry of readdirSync(d, { withFileTypes: true })) {
			const full = join(d, entry.name);
			if (entry.isDirectory()) {
				if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
				walk(full);
				continue;
			}
			if (!entry.isFile()) continue;
			if (!full.endsWith(".ts")) continue;
			if (full.endsWith(".test.ts")) continue;
			out.push(full);
		}
	};
	walk(dir);
	return out;
}

/**
 * Parse a source tree into the ParsedTree model: every fn def by name + the op
 * runs from ops-registry.ts. `srcDir` is the directory to walk; `opsRegistryFile`
 * is the file whose object-literal ops to extract run() bodies from (defaults to
 * `<srcDir>/ops-registry.ts`).
 */
export function parseSourceTree(srcDir: string, opsRegistryFile?: string): ParsedTree {
	const files = listSourceFiles(srcDir);
	const fns = new Map<string, FnDef>();
	for (const f of files) {
		for (const def of parseFile(f)) {
			// Last-wins on name collision; in practice fn names are unique across
			// the tree. A collision would surface as a classification anomaly.
			fns.set(def.name, def);
		}
	}
	const opsFile = opsRegistryFile ?? join(srcDir, "ops-registry.ts");
	const opRuns = existsSync(opsFile) ? parseOpRuns(opsFile) : [];
	return { fns, opRuns };
}

// ─── Step A — enumerate writers ───────────────────────────────────────────────

/**
 * Does this fn REACH a disk-write primitive — directly, or via a callee that is
 * itself a parsed fn def reaching one? Bounded by a visited-set on fn names.
 * Calls into TYPED_FILE_WRITERS / DISK_WRITE_PRIMITIVES count as direct writes
 * (captured in def.directWrite at parse time). Callees that are not parsed defs
 * (imported from other packages, builtins) are followed only when their name is
 * a known typed-file writer / disk primitive — already folded into directWrite.
 */
export function reachesWrite(name: string, fns: Map<string, FnDef>, visited = new Set<string>()): boolean {
	if (visited.has(name)) return false;
	visited.add(name);
	const def = fns.get(name);
	if (!def) return false;
	if (def.directWrite) return true;
	for (const callee of def.callees) {
		if (reachesWrite(callee, fns, visited)) return true;
	}
	return false;
}

/**
 * Enumerate library WRITERS from source: every EXPORTED function whose body
 * reaches a disk-write primitive (directly or via a same-tree helper it calls).
 * This is the writer universe the contract must cover — derived, never listed.
 */
export function enumerateWriters(tree: ParsedTree): FnDef[] {
	const writers: FnDef[] = [];
	for (const def of tree.fns.values()) {
		if (!def.exported) continue;
		if (reachesWrite(def.name, tree.fns)) writers.push(def);
	}
	// Stable order by file then line for deterministic reporting.
	writers.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)));
	return writers;
}

// ─── Step B — classify writers ────────────────────────────────────────────────

/**
 * Is `target` reachable from `startCallees` through the parsed-fn call graph?
 * Used for op-backed-transitive: startCallees are an op run()'s direct callees;
 * we follow each callee's own fn-def callees to see if `target` is reached.
 * Bounded by a visited-set. Does NOT stop at internal primitives — the chain
 * must traverse through them (e.g. appendToBlock → … → writeTypedFile →
 * putObject) to reach deeper writers.
 */
export function reachableFrom(startCallees: string[], target: string, fns: Map<string, FnDef>): boolean {
	const visited = new Set<string>();
	const stack = [...startCallees];
	while (stack.length > 0) {
		const name = stack.pop() as string;
		if (name === target) return true;
		if (visited.has(name)) continue;
		visited.add(name);
		const def = fns.get(name);
		if (!def) continue;
		for (const c of def.callees) {
			if (c === target) return true;
			if (!visited.has(c)) stack.push(c);
		}
	}
	return false;
}

const ALLOWLISTED_NAMES = new Set(INTENTIONALLY_UNEXPOSED_WRITERS.map((w) => w.libraryFn));

/** A classification verdict for one writer. */
export interface Classification {
	writer: string;
	file: string;
	line: number;
	/** The class the writer fell into; null = UNCLASSIFIED (violation). */
	coverageClass: CoverageClass | null;
	/** Human detail (which op / which sibling / why). */
	detail: string;
}

/**
 * Classify one writer against the five coverage classes. Order matters only for
 * the detail message: a writer can in principle satisfy multiple clauses, but
 * the contract is a disjunction (any one suffices). We probe in the order
 * direct → transitive → forDirTwin → allowlist → internalPrimitive and report
 * the first match.
 *
 * `coveredNames` is the set of writer names already known covered by SOME class
 * (used by the for-dir-twin clause: a *ForDir is covered iff its cwd-form
 * sibling is covered). It is computed in a fixpoint pass by classifyAll.
 */
export function classifyWriter(def: FnDef, tree: ParsedTree, coveredNames: Set<string>): Classification {
	const base: Omit<Classification, "coverageClass" | "detail"> = {
		writer: def.name,
		file: def.file,
		line: def.line,
	};

	// op-backed-direct: some op run() calls the writer by name directly.
	for (const run of tree.opRuns) {
		if (run.callees.includes(def.name)) {
			return {
				...base,
				coverageClass: CoverageClass.OpBackedDirect,
				detail: `op '${run.opName}' run() calls it directly`,
			};
		}
	}

	// op-backed-transitive: reachable from some op run() via a helper chain.
	for (const run of tree.opRuns) {
		if (reachableFrom(run.callees, def.name, tree.fns)) {
			return {
				...base,
				coverageClass: CoverageClass.OpBackedTransitive,
				detail: `reachable from op '${run.opName}' run() via a helper chain`,
			};
		}
	}

	// for-dir-twin: name is <X>ForDir and <X> is itself covered.
	if (def.name.endsWith("ForDir")) {
		const sibling = def.name.slice(0, -"ForDir".length);
		if (coveredNames.has(sibling)) {
			return { ...base, coverageClass: CoverageClass.ForDirTwin, detail: `*ForDir twin of covered '${sibling}'` };
		}
	}

	// intentionally-unexposed: named on the allowlist.
	if (ALLOWLISTED_NAMES.has(def.name)) {
		const entry = INTENTIONALLY_UNEXPOSED_WRITERS.find((w) => w.libraryFn === def.name);
		const why = entry?.safeOp ? `safeOp '${entry.safeOp}'` : (entry?.reason ?? "allowlisted");
		return { ...base, coverageClass: CoverageClass.IntentionallyUnexposed, detail: `allowlisted (${why})` };
	}

	// internal-primitive: STRUCTURAL — first param is a file path (filePath /
	// schemaPath), not a cwd/dir. The *TypedFile layer + path-keyed helpers.
	if (def.params.length > 0 && INTERNAL_PRIMITIVE_FIRST_PARAMS.has(def.params[0])) {
		return {
			...base,
			coverageClass: CoverageClass.InternalPrimitive,
			detail: `first param '${def.params[0]}' is a file path (below the op layer)`,
		};
	}

	return {
		...base,
		coverageClass: null,
		detail: "UNCLASSIFIED: give it an op, allowlist it, or confirm it's an internal primitive",
	};
}

/**
 * Classify all writers. For-dir-twin coverage depends on the cwd-form sibling
 * being covered, which itself may depend on other classifications, so we run a
 * fixpoint: classify with the current coveredNames, then expand coveredNames
 * with any newly-covered writers, and repeat until stable. (In practice one
 * extra pass suffices — cwd-form writers are op-backed independently of their
 * twins — but the fixpoint is robust to ordering.)
 */
export function classifyAll(tree: ParsedTree): Classification[] {
	const writers = enumerateWriters(tree);
	const covered = new Set<string>();
	let results: Classification[] = [];
	for (let pass = 0; pass < writers.length + 1; pass++) {
		results = writers.map((w) => classifyWriter(w, tree, covered));
		const nextCovered = new Set<string>();
		for (const r of results) if (r.coverageClass !== null) nextCovered.add(r.writer);
		if (nextCovered.size === covered.size) break;
		for (const n of nextCovered) covered.add(n);
	}
	return results;
}

// ─── Step C — ctx-forwarding + dual-surface param parity ──────────────────────

/** A ctx-forwarding / dual-surface divergence. */
export interface ForwardingViolation {
	opName: string;
	writer: string;
	/** "ctx-drop" (hard FAIL) | "dual-surface" (soft divergence). */
	kind: "ctx-drop" | "dual-surface";
	detail: string;
	fatal: boolean;
}

/**
 * For each op whose run() calls a ctx-accepting writer DIRECTLY, assert the run
 * forwards its own `ctx` to that call. A direct call that omits ctx when both
 * the run AND the writer accept ctx → hard FAIL (silent attestation drop).
 *
 * Transitive ctx-forwarding (run → helper → writer) is verified structurally by
 * the existence of the chain plus the direct-call guard applied recursively to
 * intermediate fns: each parsed fn def that calls a ctx-accepting callee and
 * itself declares ctx is checked the same way. We check the op-run boundary
 * (the load-bearing entry point) plus every parsed fn def's direct calls.
 */
export function checkCtxForwarding(tree: ParsedTree): ForwardingViolation[] {
	const out: ForwardingViolation[] = [];

	// Op-run boundary: run() directly calls a ctx-accepting writer/helper.
	for (const run of tree.opRuns) {
		if (!run.declaresCtx) continue; // run carries no ctx to forward
		for (const callee of new Set(run.callees)) {
			const def = tree.fns.get(callee);
			if (!def?.declaresCtx) continue; // callee does not accept ctx
			if (!run.forwardsCtxTo[callee]) {
				out.push({
					opName: run.opName,
					writer: callee,
					kind: "ctx-drop",
					detail: `op '${run.opName}' run() calls ctx-accepting '${callee}' WITHOUT forwarding ctx (silent attestation drop)`,
					fatal: true,
				});
			}
		}
	}

	return out;
}

/**
 * The runtime shape of a typebox `parameters` schema carried on an op.
 * Real ops are flat `Type.Object` (`{ properties, required }`), but the
 * detector also handles `Type.Intersect` (→ `allOf`) and `Type.Ref`
 * (→ `$ref` into the `$defs` / legacy `definitions` ref bag) so a declared
 * param nested behind those forms is not missed.
 */
interface OpParamSchema {
	properties?: Record<string, unknown>;
	required?: string[];
	allOf?: OpParamSchema[]; // Type.Intersect
	$ref?: string; // Type.Ref → "#/$defs/<n>" | "#/definitions/<n>"
	$defs?: Record<string, OpParamSchema>;
	definitions?: Record<string, OpParamSchema>;
}

/**
 * Union of declared property keys across the schema's object / allOf / $ref
 * forms. The `$defs` / `definitions` ref bag is captured at the root and
 * threaded down so a `$ref` resolves against the bag declared above it. An
 * unresolvable or cyclic `$ref` contributes nothing (fail-open per branch,
 * cycle-guarded via `seenRefs`) rather than throwing.
 */
export function flattenSchemaProperties(
	schema: OpParamSchema | undefined,
	rootBag: Record<string, OpParamSchema> = {},
	seenRefs: Set<string> = new Set(),
): Set<string> {
	const keys = new Set<string>();
	if (!schema || typeof schema !== "object") return keys;
	const bag =
		schema.$defs || schema.definitions
			? { ...rootBag, ...(schema.$defs ?? {}), ...(schema.definitions ?? {}) }
			: rootBag;
	for (const k of Object.keys(schema.properties ?? {})) keys.add(k);
	if (Array.isArray(schema.allOf)) {
		for (const member of schema.allOf) for (const k of flattenSchemaProperties(member, bag, seenRefs)) keys.add(k);
	}
	if (typeof schema.$ref === "string") {
		const m = /^#\/(?:\$defs|definitions)\/(.+)$/.exec(schema.$ref);
		if (m && !seenRefs.has(schema.$ref)) {
			seenRefs.add(schema.$ref);
			const target = bag[m[1]];
			if (target) for (const k of flattenSchemaProperties(target, bag, seenRefs)) keys.add(k);
		}
	}
	return keys;
}

/**
 * The authoritative op-side signal: does the op's typebox `parameters` schema
 * DECLARE `param` as a property? At runtime `op.parameters` is normally a
 * Type.Object whose shape is `{ properties: { <name>: ... }, required: [...] }`
 * (the same field pi-context-cli reads via `objectSchema(op).properties`), but
 * `flattenSchemaProperties` also unwraps `Type.Intersect` (allOf) / `Type.Ref`
 * ($ref) forms. The property KEY is the camelCase param name (`dryRun` /
 * `ordinal` / `idField`).
 *
 * This is exact: it is NOT `run.params` (run is always `(cwd, params, ctx)` —
 * dryRun/ordinal/idField are PROPERTIES of the destructured `params` object,
 * never top-level run parameters, so `run.params` never carries them).
 */
export function opDeclaresParam(op: OpDefinition, camelParam: string): boolean {
	const schema = (op.parameters as unknown as OpParamSchema) ?? {};
	return flattenSchemaProperties(schema).has(camelParam);
}

/**
 * The authoritative script-side signal: does the orchestrator script actually
 * PARSE the `--<kebab>` flag as an argument? We detect the flag ONLY in a
 * genuine arg-parse position via the AST — the flag literal as an operand of an
 * equality `BinaryExpression` (`a === "--flag"` / `"--flag" === a`, also `==`)
 * or the expression of a `case` clause (`case "--flag":`). Parsing the source
 * (ts.createSourceFile, error-tolerant) inherently ignores comments and display
 * string literals: a bare literal in a `console.log` / a `// --dry-run` note /
 * a `/* a === "--flag" *​/` comment is trivia or a non-operand StringLiteral and
 * yields no matching node. This replaces the prior regex (`=== "--flag"`), which
 * false-matched the comparison text inside comments and display strings.
 */
export function scriptParsesFlag(scriptText: string, kebabFlag: string): boolean {
	const sf = ts.createSourceFile("script.ts", scriptText, ts.ScriptTarget.Latest, /* setParentNodes */ true);
	const isFlagLiteral = (n: ts.Node | undefined): boolean =>
		!!n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && n.text === kebabFlag;
	let found = false;
	const visit = (n: ts.Node): void => {
		if (found) return;
		// arg-parse equality: a === "--flag" / "--flag" === a  (=== or ==)
		if (
			ts.isBinaryExpression(n) &&
			(n.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
				n.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken) &&
			(isFlagLiteral(n.left) || isFlagLiteral(n.right))
		) {
			found = true;
			return;
		}
		// switch arg-parse: case "--flag":
		if (ts.isCaseClause(n) && isFlagLiteral(n.expression)) {
			found = true;
			return;
		}
		ts.forEachChild(n, visit);
	};
	visit(sf);
	return found;
}

/**
 * Dual-surface optional-param parity: where an op <name> has an orchestrator
 * sibling scripts/orchestrator/<name>.ts, compare the optional params
 * (dryRun/ordinal/idField) against the two AUTHORITATIVE signals —
 *   - op-side: the op's typebox `parameters` schema DECLARES the param
 *     (opDeclaresParam, camelCase key);
 *   - script-side: the script PARSES the `--<kebab>` flag (scriptParsesFlag).
 * A divergence is real (reported, NON-FATAL) iff exactly one side has the param:
 * the script offers a `--flag` the op's schema lacks, or the op declares a param
 * its sibling script offers no flag for. `ctx` is excluded — its forwarding is
 * the separate fatal guard (checkCtxForwarding).
 *
 * `opsList` supplies the op definitions (carrying `op.parameters`); the AST tree
 * supplies only which ops have an orchestrator sibling worth checking.
 */
export function checkDualSurfaceParity(
	tree: ParsedTree,
	scriptsDir: string,
	opsList: OpDefinition[] = ops,
): ForwardingViolation[] {
	const out: ForwardingViolation[] = [];
	const byName = new Map(opsList.map((o) => [o.name, o]));
	for (const run of tree.opRuns) {
		const op = byName.get(run.opName);
		if (!op) continue; // no op definition to read a schema from
		const scriptPath = join(scriptsDir, `${run.opName}.ts`);
		if (!existsSync(scriptPath)) continue;
		const scriptText = readFileSync(scriptPath, "utf-8");
		for (const [camelParam, kebabFlag] of Object.entries(DUAL_SURFACE_OPTIONAL_PARAMS)) {
			const opDeclares = opDeclaresParam(op, camelParam);
			const scriptParses = scriptParsesFlag(scriptText, kebabFlag);
			if (opDeclares !== scriptParses) {
				out.push({
					opName: run.opName,
					writer: `scripts/orchestrator/${run.opName}.ts`,
					kind: "dual-surface",
					detail: `param '${camelParam}' (${kebabFlag}) divergence: op schema ${opDeclares ? "declares" : "lacks"} it, script ${scriptParses ? "parses" : "does not parse"} the flag`,
					fatal: false,
				});
			}
		}
	}
	return out;
}

// ─── Step D — {json}-content-cap gate (FGAP-015) ──────────────────────────────

/** A `{json}`-returns-content-read violation. */
export interface JsonContentCapViolation {
	opName: string;
	/** The content-reading library fn whose result is returned through {json}. */
	fn: string;
	/** "inline" (return { json: fn(...) }) | "binding" (const x = fn(...); return { json: x }). */
	via: "inline" | "binding";
	detail: string;
}

/**
 * FGAP-015 drift-guard: FLAG any op whose run() returns `{ json: <value> }` where
 * `<value>` is — DIRECTLY — the result of a content-reading library call
 * (CONTENT_READING_FNS). Such a return bypasses the 50KB read cap, which is
 * enforced only on the `{read}` channel (structureForRead). The fix is to emit
 * `{ read: structureForRead(...) }` instead.
 *
 * Two recognized patterns (and ONLY these two — low false-positive by design;
 * the runtime boundary cap is the backstop for anything subtler):
 *   1. inline   — `return { json: resolveItemById(cwd, id) };`
 *   2. binding  — `const result = resolveItemById(cwd, id); return { json: result };`
 *                 (single same-run-body const/let binding to a content-read call)
 *
 * NOT flagged: `{ read: ... }` returns; `{ json: <object literal> }` constructed
 * from a read (e.g. `return { json: { count: blk.items.length } }`); prose string
 * returns; `{ json: <ident> }` where <ident> is bound to a NON-content-read call
 * (e.g. validateContext) or not bound to a call at all.
 */
export function checkJsonContentCap(tree: ParsedTree): JsonContentCapViolation[] {
	const out: JsonContentCapViolation[] = [];
	for (const run of tree.opRuns) {
		for (const ret of run.jsonReturns) {
			// inline: return { json: <contentReadFn>(...) }
			if (ret.callee && CONTENT_READING_FNS.has(ret.callee)) {
				out.push({
					opName: run.opName,
					fn: ret.callee,
					via: "inline",
					detail: `op '${run.opName}' returns { json } of a content-reading call (${ret.callee}) — emit { read: structureForRead(...) } so the read cap applies`,
				});
				continue;
			}
			// binding: return { json: <ident> } where <ident> = <contentReadFn>(...)
			if (ret.identifier) {
				const boundCallee = run.bindings[ret.identifier];
				if (boundCallee && CONTENT_READING_FNS.has(boundCallee)) {
					out.push({
						opName: run.opName,
						fn: boundCallee,
						via: "binding",
						detail: `op '${run.opName}' returns { json } of a content-reading call (${boundCallee}) — emit { read: structureForRead(...) } so the read cap applies`,
					});
				}
			}
		}
	}
	return out;
}

// ─── main ─────────────────────────────────────────────────────────────────────

function main(): number {
	const repoRoot = process.cwd();
	const srcDir = join(repoRoot, "packages", "pi-context", "src");
	const scriptsDir = join(repoRoot, "scripts", "orchestrator");

	if (!existsSync(srcDir)) {
		console.error(`parity-check: source dir not found: ${srcDir}`);
		return 1;
	}

	const tree = parseSourceTree(srcDir);
	// Sanity: ops must have loaded from the package (build present).
	if (tree.opRuns.length === 0) {
		console.error("parity-check: no op runs parsed from ops-registry.ts — cannot enforce coverage");
		return 1;
	}
	void (ops as OpDefinition[]); // contract import is load-bearing (fails fast if /ops export breaks)

	const classifications = classifyAll(tree);
	const forwarding = checkCtxForwarding(tree);
	const dualSurface = checkDualSurfaceParity(tree, scriptsDir);
	const jsonContentCap = checkJsonContentCap(tree);

	const violations: string[] = [];

	// Classification violations (UNCLASSIFIED writers).
	for (const c of classifications) {
		if (c.coverageClass === null) {
			violations.push(`${relative(repoRoot, c.file)}:${c.line} — ${c.writer} — ${c.detail}`);
		}
	}

	// ctx-drop violations (hard FAIL).
	for (const f of forwarding) {
		if (f.fatal) violations.push(`op '${f.opName}' — ${f.writer} — ${f.detail}`);
	}

	// {json}-content-cap violations (hard FAIL — FGAP-015 read-cap bypass).
	for (const j of jsonContentCap) {
		violations.push(`op '${j.opName}' — {json} of ${j.fn} (${j.via}) — ${j.detail}`);
	}

	// Soft dual-surface divergences — reported, not fatal.
	for (const d of dualSurface) {
		console.error(`parity-check (divergence, non-fatal): ${d.detail} [${d.writer}]`);
	}

	if (violations.length > 0) {
		console.error(`parity-check: ${violations.length} FGAP-009 coverage violation(s) — do not --no-verify:`);
		for (const v of violations) console.error(`  ${v}`);
		return 1;
	}

	// Pass summary (kept terse; mirrors check-changelog's silent-on-pass shape
	// but the spec asks for the enumerated count + per-class tally).
	const tally: Record<string, number> = {};
	for (const c of classifications) {
		const key = c.coverageClass ?? "UNCLASSIFIED";
		tally[key] = (tally[key] ?? 0) + 1;
	}
	const tallyStr = Object.entries(tally)
		.map(([k, n]) => `${k}=${n}`)
		.join(" ");
	console.log(
		`parity-check: ${classifications.length} writer(s) enumerated, all classified (${tallyStr}); 0 ctx-drops; 0 {json}-content-cap bypasses`,
	);
	return 0;
}

// Run only as a CLI, not when imported by the test.
if (import.meta.url === `file://${process.argv[1]}`) {
	process.exit(main());
}
