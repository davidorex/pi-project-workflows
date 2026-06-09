#!/usr/bin/env -S npx tsx
/**
 * Build-time PARITY CHECK — the in-pi op ↔ reflecting-CLI parity gate.
 *
 * This gate asserts that the two surfaces over the pi-context op-registry — the
 * in-pi ops (`@davidorex/pi-context/ops`) and the reflecting CLI that auto-
 * derives a command per op (`@davidorex/pi-context-cli`) — stay BEHAVIORALLY in
 * lockstep. The orchestrator scripts under `scripts/orchestrator/` are NOT a
 * parity reference; the only two surfaces compared here are the in-pi op and the
 * CLI command that reflects it. This file only OBSERVES both surfaces — it never
 * mutates op or CLI source.
 *
 * It retains the op-coverage contract (defined in @davidorex/pi-context/ops as
 * OP_COVERAGE_RULE + CoverageClass + INTENTIONALLY_UNEXPOSED_WRITERS): EVERY
 * library write function in packages/pi-context/src must be COVERED by one of
 * five mutually exhaustive classes (op-backed-direct, op-backed-transitive,
 * for-dir-twin, intentionally-unexposed, internal-primitive). A writer matching
 * NONE is a silent gap — a write capability with no op surface and no recorded
 * reason. Writers are enumerated FROM SOURCE (AST walk), not a hand-list.
 *
 * Five enforcement categories, all exit-1 on any violation:
 *   1. classification — every enumerated writer lands in exactly one class;
 *      UNCLASSIFIED writers are violations.
 *   2. ctx-forwarding — every op→writer call that COULD forward ctx (the writer
 *      declares ctx, the op's run has a ctx param) MUST forward it. A dropped
 *      ctx is a hard FAIL (silent attestation drop).
 *   3. {json}-content-cap — an op that returns { json } of a content-reading
 *      library call (CONTENT_READING_FNS), inline or via a single same-body
 *      const/let binding, bypasses the 50KB read cap (enforced only on the
 *      {read} channel). Hard FAIL: emit { read: structureForRead(...) } instead.
 *   4. required-but-derivable (op ↔ CLI input parity) — an op that declares a
 *      config-DERIVABLE param (arrayKey) required, where the CLI does not exempt
 *      that param from its required-field check, is a UX defect: the CLI would
 *      reject a caller who passes only `--block` even though the value is
 *      config-derivable. The set of CLI exemptions is parsed from cli.ts. Hard
 *      FAIL.
 *   5. output-shape parity (op ↔ CLI output parity) — `read-schema --path` run
 *      through the in-pi op vs the CLI command on a fixture substrate must yield
 *      the SAME read payload (.data + .complete + .total). A divergence is a hard
 *      FAIL.
 *
 * Pure helpers (enumerateWriters / classifyWriter / classifyAll /
 * checkCtxForwarding / checkJsonContentCap / parseSourceTree / opDeclaresParam /
 * checkRequiredButDerivable / diffReadPayload / extractStringLiterals /
 * flattenSchemaProperties) are exported for scripts/parity-check.test.ts. main()
 * aggregates violations + exits.
 *
 * AST idiom mirrors packages/pi-context/src/citation-rot-scanner.ts
 * (ts.createSourceFile + ts.forEachChild + node-type guards). Enforcement /
 * exit-code shape mirrors scripts/check-changelog.ts.
 *
 * The op ↔ CLI checks run IN-PROCESS: the CLI route imports the CLI's `main`
 * from `packages/pi-context-cli/src/cli.ts` (SOURCE, via tsx — NOT the built
 * dist) so the gate never observes a stale bin. No subprocess of dist/bin.js.
 */
import { deepEqual } from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { writeBootstrapPointer } from "@davidorex/pi-context/context-dir";
import { CoverageClass, INTENTIONALLY_UNEXPOSED_WRITERS, type OpDefinition, ops } from "@davidorex/pi-context/ops";
import { main as cliMain } from "@davidorex/pi-context-cli";
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
 * The set of op-required params the reflecting CLI is expected to DERIVE for the
 * caller rather than demand on the command line. Currently only `arrayKey`: the
 * 7 block-mutation ops declare `arrayKey` required (their in-pi schema + handler
 * are byte-unchanged and still receive + require it), but the CLI's
 * `injectArrayKey` derives it from `config.block_kinds[].array_key` after parse,
 * so the CLI's required-field check MUST exempt it. If a derivable-required param
 * is not exempted, a caller who passes only `--block` is wrongly rejected — that
 * is the op ↔ CLI input-parity defect this set anchors.
 */
const DERIVABLE = new Set<string>(["arrayKey"]);

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

// ─── Step C — ctx-forwarding ──────────────────────────────────────────────────

/** A ctx-forwarding divergence (silent attestation drop). */
export interface ForwardingViolation {
	opName: string;
	writer: string;
	/** "ctx-drop" (hard FAIL). */
	kind: "ctx-drop";
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
 * Union of declared REQUIRED param names across the schema's object / allOf /
 * $ref forms — the `required` analogue of flattenSchemaProperties. Threads the
 * same `$defs`/`definitions` ref bag down and is cycle-guarded. Real ops are a
 * flat Type.Object carrying a top-level `required: string[]`.
 */
export function flattenSchemaRequired(
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
	for (const k of schema.required ?? []) keys.add(k);
	if (Array.isArray(schema.allOf)) {
		for (const member of schema.allOf) for (const k of flattenSchemaRequired(member, bag, seenRefs)) keys.add(k);
	}
	if (typeof schema.$ref === "string") {
		const m = /^#\/(?:\$defs|definitions)\/(.+)$/.exec(schema.$ref);
		if (m && !seenRefs.has(schema.$ref)) {
			seenRefs.add(schema.$ref);
			const target = bag[m[1]];
			if (target) for (const k of flattenSchemaRequired(target, bag, seenRefs)) keys.add(k);
		}
	}
	return keys;
}

/**
 * The op's REQUIRED param names — the same flattened `required` set the CLI reads
 * via `objectSchema(op).required` before its `writer`/`arrayKey` exemption.
 */
export function opRequiredParams(op: OpDefinition): Set<string> {
	const schema = (op.parameters as unknown as OpParamSchema) ?? {};
	return flattenSchemaRequired(schema);
}

/**
 * Collect every string-literal text appearing in a TypeScript source snippet, via
 * the AST (ts.createSourceFile, error-tolerant). Used to read the CLI's required-
 * field exemption list out of cli.ts: the required-filter is
 *   `(schema.required ?? []).filter((r) => r !== "writer" && r !== "arrayKey")`
 * — the exempted param names are exactly the string-literal operands of that
 * `r !== "<lit>"` chain. Parsing the source inherently ignores comments (trivia
 * carries no StringLiteral node). Both quote styles + template literals with no
 * substitution are captured; substitution-bearing templates are ignored (they
 * are not bare literals). The caller intersects the result with the small,
 * known DERIVABLE set, so unrelated literals elsewhere in the file are inert.
 */
export function extractStringLiterals(sourceText: string): Set<string> {
	const sf = ts.createSourceFile("snippet.ts", sourceText, ts.ScriptTarget.Latest, /* setParentNodes */ true);
	const out = new Set<string>();
	const visit = (n: ts.Node): void => {
		if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) out.add(n.text);
		ts.forEachChild(n, visit);
	};
	visit(sf);
	return out;
}

/**
 * op ↔ CLI INPUT parity — required-but-derivable.
 *
 * For each op, the params it declares REQUIRED that are also config-DERIVABLE
 * (the DERIVABLE set — currently just `arrayKey`) MUST be exempted by the CLI's
 * required-field check; otherwise the CLI rejects a caller who passes only the
 * surface flag (e.g. `--block`) even though the value is derivable post-parse
 * (injectArrayKey). The CLI exemptions come from `cliExemptions` — at the top-
 * level call this is parsed out of cli.ts's required-filter
 *   `(schema.required ?? []).filter((r) => r !== "writer" && r !== "arrayKey")`
 * via extractStringLiterals(cli source) ∩ DERIVABLE-relevant names.
 *
 * Two assertions:
 *   - GLOBAL: every member of DERIVABLE must be in cliExemptions. If `arrayKey`
 *     is ever dropped from the CLI filter, this bites once globally AND every
 *     arrayKey-requiring op bites below.
 *   - PER-OP: for each op, every param in (op.required ∩ DERIVABLE) must be in
 *     cliExemptions.
 *
 * `opsList` is injectable (mirrors the other checks) for unit tests. The op's
 * required params are read through opRequiredParams (the same flattened typebox
 * `required` array the CLI reads via objectSchema(op).required).
 */
export function checkRequiredButDerivable(
	cliExemptions: Set<string>,
	opsList: OpDefinition[] = ops,
	derivable: Set<string> = DERIVABLE,
): string[] {
	const out: string[] = [];

	// GLOBAL: every derivable param must be exempted by the CLI, or the whole
	// class of derivable-required ops is broken.
	for (const d of derivable) {
		if (!cliExemptions.has(d)) {
			out.push(
				`parity: config-derivable param '${d}' is in DERIVABLE but the CLI required-filter does not exempt it (every op requiring '${d}' would be wrongly rejected; required-but-derivable, FGAP-019 class)`,
			);
		}
	}

	// PER-OP: an op that requires a derivable param the CLI does not exempt.
	for (const op of opsList) {
		const required = opRequiredParams(op);
		for (const p of required) {
			if (derivable.has(p) && !cliExemptions.has(p)) {
				out.push(
					`parity: op '${op.name}' requires config-derivable param '${p}' but the CLI does not exempt it (required-but-derivable, FGAP-019 class)`,
				);
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

// ─── Step E — op ↔ CLI output-shape parity (read-schema --path) ───────────────

/** The read payload shape both surfaces emit for a `{read}` op result. */
interface ReadPayloadLike {
	data?: unknown;
	complete?: boolean;
	total?: number;
}

/**
 * Compare the read payload produced by the in-pi op against the one the CLI
 * emits, for the same op invocation. PURE: no I/O. Asserts the `data` subtree is
 * deepEqual and that `.complete` / `.total` agree. Any divergence is a single
 * hard-FAIL violation string. This is the behavioral contract the CLI's
 * boundedJsonOutput must keep: for a `{read}` result it returns `r.read`, so the
 * CLI envelope's `output` must equal the op's `read` exactly.
 */
export function diffReadPayload(opRead: ReadPayloadLike, cliOutput: ReadPayloadLike): string[] {
	const out: string[] = [];
	try {
		deepEqual(opRead.data, cliOutput.data);
	} catch {
		out.push(
			`parity: read-schema --path op-vs-CLI output divergence (FGAP-020/027 class): .data differs between the in-pi op read and the CLI envelope output`,
		);
	}
	if (opRead.complete !== cliOutput.complete) {
		out.push(
			`parity: read-schema --path op-vs-CLI output divergence (FGAP-020/027 class): .complete differs (op=${String(opRead.complete)} cli=${String(cliOutput.complete)})`,
		);
	}
	if (opRead.total !== cliOutput.total) {
		out.push(
			`parity: read-schema --path op-vs-CLI output divergence (FGAP-020/027 class): .total differs (op=${String(opRead.total)} cli=${String(cliOutput.total)})`,
		);
	}
	return out;
}

/**
 * op ↔ CLI OUTPUT parity, executed end-to-end on a throwaway fixture substrate.
 * Runs `read-schema --path properties.tasks.items` through BOTH surfaces:
 *   - op route: `ops.find(o => o.name === "read-schema").run(cwd, {...})` → its
 *     `{ read }` payload (r.read).
 *   - CLI route: the CLI's `main([...])` imported from cli SOURCE (NOT dist),
 *     stdout captured (process.stdout.write swap), the `{ ok, output }` JSON
 *     envelope parsed → `envelope.output`.
 * diffReadPayload then asserts the two payloads agree (.data / .complete /
 * .total). The fixture mirrors cli.test.ts's read-schema fixture: an object node
 * (`properties.tasks.items`) carrying an array child (`required`) PLUS a sibling
 * object (`properties`), so paging the node would lose siblings — the exact case
 * the whole-subtree read must preserve identically on both surfaces. The tmp dir
 * is removed before return. Returns hard-FAIL violation strings.
 */
export async function checkOutputShapeParity(): Promise<string[]> {
	const out: string[] = [];
	const cwd = mkdtempSync(join(tmpdir(), "parity-readschema-"));
	try {
		writeBootstrapPointer(cwd, ".project");
		const sub = join(cwd, ".project");
		mkdirSync(join(sub, "schemas"), { recursive: true });
		writeFileSync(
			join(sub, "config.json"),
			JSON.stringify({ schema_version: "1.0.0", root: ".project", block_kinds: [] }),
		);
		const schema = {
			type: "object",
			properties: {
				tasks: {
					type: "array",
					items: {
						type: "object",
						required: ["id", "title", "status"],
						properties: { id: { type: "string" }, title: { type: "string" }, status: { type: "string" } },
					},
				},
			},
		};
		writeFileSync(join(sub, "schemas", "tasks.schema.json"), JSON.stringify(schema, null, 2));

		// op route — call read-schema's run() directly.
		const readSchemaOp = (ops as OpDefinition[]).find((o) => o.name === "read-schema");
		if (!readSchemaOp) {
			out.push("parity: read-schema op not found in the ops registry — cannot run op↔CLI output parity");
			return out;
		}
		const opResult = await readSchemaOp.run(cwd, { schemaName: "tasks", path: "properties.tasks.items" });
		if (typeof opResult === "string" || !("read" in opResult)) {
			out.push(
				`parity: read-schema op did not return a { read } payload (got ${typeof opResult}) — output parity unverifiable`,
			);
			return out;
		}
		const opRead = opResult.read as ReadPayloadLike;

		// CLI route — capture main()'s stdout JSON envelope.
		const orig = process.stdout.write;
		let captured = "";
		process.stdout.write = ((chunk: unknown): boolean => {
			captured += typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString("utf8");
			return true;
		}) as typeof process.stdout.write;
		let code: number;
		try {
			code = await cliMain([
				"read-schema",
				"--schemaName",
				"tasks",
				"--path",
				"properties.tasks.items",
				"--json",
				"--cwd",
				cwd,
			]);
		} finally {
			process.stdout.write = orig;
		}
		if (code !== 0) {
			out.push(`parity: CLI read-schema --path exited ${code} (expected 0) — output parity unverifiable`);
			return out;
		}
		let envelope: { ok?: boolean; output?: ReadPayloadLike };
		try {
			envelope = JSON.parse(captured);
		} catch {
			out.push("parity: CLI read-schema --path did not emit a parseable JSON envelope — output parity unverifiable");
			return out;
		}
		const cliOutput = (envelope.output ?? {}) as ReadPayloadLike;

		out.push(...diffReadPayload(opRead, cliOutput));
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
	return out;
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<number> {
	const repoRoot = process.cwd();
	const srcDir = join(repoRoot, "packages", "pi-context", "src");
	const cliFile = join(repoRoot, "packages", "pi-context-cli", "src", "cli.ts");

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
	const jsonContentCap = checkJsonContentCap(tree);

	// op ↔ CLI input parity: parse the CLI's required-field exemptions from cli.ts.
	if (!existsSync(cliFile)) {
		console.error(`parity-check: CLI source not found: ${cliFile} — cannot enforce op↔CLI input parity`);
		return 1;
	}
	const cliExemptions = extractStringLiterals(readFileSync(cliFile, "utf-8"));
	const requiredButDerivable = checkRequiredButDerivable(cliExemptions);

	// op ↔ CLI output parity: read-schema --path through both surfaces.
	const outputShape = await checkOutputShapeParity();

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

	// {json}-content-cap violations (hard FAIL — read-cap bypass).
	for (const j of jsonContentCap) {
		violations.push(`op '${j.opName}' — {json} of ${j.fn} (${j.via}) — ${j.detail}`);
	}

	// op ↔ CLI input-parity violations (hard FAIL — required-but-derivable).
	violations.push(...requiredButDerivable);

	// op ↔ CLI output-parity violations (hard FAIL — read-schema --path divergence).
	violations.push(...outputShape);

	if (violations.length > 0) {
		console.error(`parity-check: ${violations.length} op↔CLI parity violation(s) — do not --no-verify:`);
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
		`parity-check: ${classifications.length} writer(s) enumerated, all classified (${tallyStr}); 0 ctx-drops; 0 {json}-content-cap bypasses; op↔CLI input + output parity OK`,
	);
	return 0;
}

// Run only as a CLI, not when imported by the test.
if (import.meta.url === `file://${process.argv[1]}`) {
	main().then((code) => process.exit(code));
}
