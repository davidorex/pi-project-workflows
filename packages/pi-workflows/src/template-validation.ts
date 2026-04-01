/**
 * Template-input alignment validation for workflow agent steps.
 *
 * Traces the full chain: workflow step → input expressions → source schemas → template field references.
 * Catches field name mismatches, missing inputs, and forEach variable naming errors that cause
 * Nunjucks to silently render empty strings.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { createAgentLoader } from "./agent-spec.js";
import { resolveSchemaPath } from "./step-shared.js";
import type { StepSpec, WorkflowSpec } from "./types.js";
import type { ValidationIssue } from "./workflow-sdk.js";

// Variables injected by the execution engine, not from workflow inputs
const INJECTED_VARIABLES = new Set(["output_schema", "loop"]);

export interface TemplateVariable {
	root: string; // "spec", "architecture"
	path: string; // "spec.intent", "spec.files_to_change"
	guarded: boolean; // inside {% if %} block
	usage: "output" | "loop" | "conditional";
}

export interface SchemaFields {
	properties: Record<string, { type: string }>;
	required: string[];
}

/** Resolved type for a step input — either structured (schema-traceable) or string (textOutput). */
export type ResolvedInputType = "string" | "object" | "unknown";

/** Describes a {% for x in source %} loop with the properties accessed on the loop variable. */
export interface TemplateLoop {
	loopVar: string; // "x" in {% for x in source.field %}
	source: string; // "source.field"
	sourceRoot: string; // "source"
	sourceField: string; // "field"
	accessedProps: string[]; // ["name", "path"] from {{ x.name }}, {{ x.path }}
}

/**
 * Extract all Nunjucks variable references from a template string.
 * Returns structured entries with full dotted paths and usage context.
 */
export function extractTemplateVariables(content: string): TemplateVariable[] {
	const variables: TemplateVariable[] = [];
	const seen = new Set<string>();

	// Track which lines are inside {% if var %} guards
	const guardedRoots = new Set<string>();
	const ifStack: Array<{ root: string; depth: number }> = [];
	let depth = 0;

	const lines = content.split("\n");
	for (const line of lines) {
		// Track {% if var.field %} blocks
		const ifMatch = line.match(/\{%[-\s]*if\s+([\w.]+)/);
		if (ifMatch) {
			depth++;
			const root = ifMatch[1].split(".")[0];
			ifStack.push({ root, depth });
			guardedRoots.add(root);
		}
		const endifMatch = line.match(/\{%[-\s]*endif/);
		if (endifMatch) {
			while (ifStack.length > 0 && ifStack[ifStack.length - 1].depth === depth) {
				const popped = ifStack.pop();
				if (popped) guardedRoots.delete(popped.root);
			}
			depth--;
		}

		// Extract {{ var.field }} output expressions
		const outputPattern = /\{\{\s*([\w]+(?:\.[\w]+)*)\s*(?:\|[^}]*)?\}\}/g;
		let match: RegExpExecArray | null;
		match = outputPattern.exec(line);
		while (match !== null) {
			const fullPath = match[1];
			const root = fullPath.split(".")[0];
			if (!INJECTED_VARIABLES.has(root) && fullPath.includes(".") && !seen.has(fullPath)) {
				seen.add(fullPath);
				variables.push({
					root,
					path: fullPath,
					guarded: guardedRoots.has(root),
					usage: "output",
				});
			}
			match = outputPattern.exec(line);
		}

		// Extract {% for x in var.field %} loop sources
		const forPattern = /\{%[-\s]*for\s+\w+\s+in\s+([\w]+(?:\.[\w]+)*)\s*%\}/g;
		match = forPattern.exec(line);
		while (match !== null) {
			const fullPath = match[1];
			const root = fullPath.split(".")[0];
			if (!INJECTED_VARIABLES.has(root) && fullPath.includes(".") && !seen.has(fullPath)) {
				seen.add(fullPath);
				variables.push({
					root,
					path: fullPath,
					guarded: guardedRoots.has(root),
					usage: "loop",
				});
			}
			match = forPattern.exec(line);
		}
	}

	return variables;
}

/**
 * Extract all {% for x in root.field %} loops from a template, along with
 * the properties accessed on each loop variable (e.g. {{ x.name }}).
 */
export function extractTemplateLoops(content: string): TemplateLoop[] {
	const loops: TemplateLoop[] = [];

	// First pass: find all for-loop declarations and their variable names
	const forDeclPattern = /\{%[-\s]*for\s+(\w+)\s+in\s+([\w]+(?:\.[\w]+)*)\s*%\}/g;
	let declMatch: RegExpExecArray | null;
	declMatch = forDeclPattern.exec(content);
	while (declMatch !== null) {
		const loopVar = declMatch[1];
		const source = declMatch[2];
		const parts = source.split(".");
		if (parts.length >= 2) {
			loops.push({
				loopVar,
				source,
				sourceRoot: parts[0],
				sourceField: parts[1],
				accessedProps: [],
			});
		}
		declMatch = forDeclPattern.exec(content);
	}

	// Second pass: find properties accessed on each loop variable
	for (const loop of loops) {
		const propPattern = new RegExp(`\\{\\{\\s*${loop.loopVar}\\.(\\w+)`, "g");
		let propMatch: RegExpExecArray | null;
		const seenProps = new Set<string>();
		propMatch = propPattern.exec(content);
		while (propMatch !== null) {
			if (!seenProps.has(propMatch[1])) {
				seenProps.add(propMatch[1]);
				loop.accessedProps.push(propMatch[1]);
			}
			propMatch = propPattern.exec(content);
		}
	}

	return loops;
}

/**
 * Determine the resolved type of an input expression.
 * - Expressions ending in `.textOutput` resolve to "string"
 * - Expressions ending in `.output` (with or without subfield) resolve to "object"
 * - Unrecognized patterns resolve to "unknown"
 */
function resolveInputType(inputExpr: string): ResolvedInputType {
	const exprMatch = inputExpr.match(/\$\{\{\s*(.+?)\s*\}\}/);
	if (!exprMatch) return "unknown";
	const expr = exprMatch[1];

	if (/^steps\.[\w-]+\.textOutput$/.test(expr)) return "string";
	if (/^steps\.[\w-]+\.output(?:\.[\w]+)?$/.test(expr)) return "object";
	return "unknown";
}

/**
 * Given a step's input expression and the workflow spec, trace to a source schema
 * and return its field definitions. Returns null if unverifiable.
 */
function traceInputSchema(inputExpr: string, stepSpec: StepSpec, spec: WorkflowSpec, cwd: string): SchemaFields | null {
	// Extract the expression content from ${{ ... }}
	const exprMatch = inputExpr.match(/\$\{\{\s*(.+?)\s*\}\}/);
	if (!exprMatch) return null;
	const expr = exprMatch[1];

	// Case 1: forEach `as` variable — trace to the forEach source array's item schema
	if (stepSpec.forEach && stepSpec.as && expr === stepSpec.as) {
		return traceForEachItemSchema(stepSpec.forEach, spec, cwd);
	}

	// Case 2: ${{ steps.X.output }} or ${{ steps.X.output.field }}
	const stepsMatch = expr.match(/^steps\.([\w-]+)\.output(?:\.([\w]+))?$/);
	if (stepsMatch) {
		const [, stepName, subField] = stepsMatch;
		const sourceStep = spec.steps[stepName];
		if (!sourceStep?.output?.schema) return null;
		return loadSchemaFields(sourceStep.output.schema, spec.filePath, cwd, subField);
	}

	return null;
}

/**
 * Trace a forEach expression to the schema of each array item.
 * E.g. ${{ steps.decompose.output.specs }} → decomposition-specs schema → specs.items.properties
 */
function traceForEachItemSchema(forEachExpr: string, spec: WorkflowSpec, cwd: string): SchemaFields | null {
	const exprMatch = forEachExpr.match(/\$\{\{\s*(.+?)\s*\}\}/);
	if (!exprMatch) return null;
	const expr = exprMatch[1];

	// Match steps.X.output.arrayField
	const match = expr.match(/^steps\.([\w-]+)\.output\.([\w]+)$/);
	if (!match) return null;
	const [, stepName, arrayField] = match;

	const sourceStep = spec.steps[stepName];
	if (!sourceStep?.output?.schema) return null;

	const schemaPath = resolveSchemaPath(sourceStep.output.schema, spec.filePath, cwd);
	try {
		const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
		const arrayProp = schema.properties?.[arrayField];
		if (!arrayProp) return null;

		// Navigate to items schema
		const itemSchema = arrayProp.items;
		if (!itemSchema?.properties) return null;

		const properties: Record<string, { type: string }> = {};
		for (const [key, value] of Object.entries(itemSchema.properties)) {
			properties[key] = { type: (value as Record<string, unknown>).type as string };
		}
		return {
			properties,
			required: (itemSchema.required as string[]) ?? [],
		};
	} catch {
		return null;
	}
}

/**
 * Load a schema file and return its field definitions.
 * If subField is provided, navigates into that property's sub-schema.
 */
function loadSchemaFields(
	schemaRef: string,
	specFilePath: string,
	cwd: string,
	subField?: string,
): SchemaFields | null {
	const schemaPath = resolveSchemaPath(schemaRef, specFilePath, cwd);
	try {
		const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
		let target = schema;
		if (subField) {
			target = schema.properties?.[subField];
			if (!target) return null;
		}
		if (!target.properties) return null;

		const properties: Record<string, { type: string }> = {};
		for (const [key, value] of Object.entries(target.properties)) {
			properties[key] = { type: (value as Record<string, unknown>).type as string };
		}
		return {
			properties,
			required: (target.required as string[]) ?? [],
		};
	} catch {
		return null;
	}
}

/**
 * Load the item schema for an array field within a traced input's schema.
 * Used by Check E to validate loop variable property accesses.
 *
 * @param inputExpr - the full ${{ ... }} expression for the input root
 * @param stepSpec - the step spec containing the input
 * @param spec - the full workflow spec
 * @param cwd - working directory
 * @param arrayField - the field name within the schema that should be an array
 */
function loadArrayItemSchema(
	inputExpr: string,
	stepSpec: StepSpec,
	spec: WorkflowSpec,
	cwd: string,
	arrayField: string,
): SchemaFields | null {
	const exprMatch = inputExpr.match(/\$\{\{\s*(.+?)\s*\}\}/);
	if (!exprMatch) return null;
	const expr = exprMatch[1];

	// forEach `as` variable — trace through the forEach source to the item's sub-array
	if (stepSpec.forEach && stepSpec.as && expr === stepSpec.as) {
		const feMatch = stepSpec.forEach.match(/\$\{\{\s*(.+?)\s*\}\}/);
		if (!feMatch) return null;
		const feExpr = feMatch[1];
		const feStepsMatch = feExpr.match(/^steps\.([\w-]+)\.output(?:\.([\w]+))?$/);
		if (!feStepsMatch) return null;
		const sourceStep = spec.steps[feStepsMatch[1]];
		if (!sourceStep?.output?.schema) return null;
		const schemaPath = resolveSchemaPath(sourceStep.output.schema, spec.filePath, cwd);
		try {
			const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
			const feArrayField = feStepsMatch[2];
			let itemTarget = schema;
			if (feArrayField) {
				itemTarget = schema.properties?.[feArrayField]?.items;
			}
			if (!itemTarget?.properties) return null;
			// Find the arrayField within the forEach item schema
			const arrProp = itemTarget.properties?.[arrayField];
			if (!arrProp?.items?.properties) return null;
			const properties: Record<string, { type: string }> = {};
			for (const [key, value] of Object.entries(arrProp.items.properties)) {
				properties[key] = { type: (value as Record<string, unknown>).type as string };
			}
			return { properties, required: (arrProp.items.required as string[]) ?? [] };
		} catch {
			return null;
		}
	}

	// steps.X.output or steps.X.output.subField
	const stepsMatch = expr.match(/^steps\.([\w-]+)\.output(?:\.([\w]+))?$/);
	if (!stepsMatch) return null;
	const [, stepName, subField] = stepsMatch;
	const sourceStep = spec.steps[stepName];
	if (!sourceStep?.output?.schema) return null;

	const schemaPath = resolveSchemaPath(sourceStep.output.schema, spec.filePath, cwd);
	try {
		const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
		let target = schema;
		if (subField) {
			target = schema.properties?.[subField];
			if (!target) return null;
		}
		const arrProp = target.properties?.[arrayField];
		if (!arrProp?.items?.properties) return null;
		const properties: Record<string, { type: string }> = {};
		for (const [key, value] of Object.entries(arrProp.items.properties)) {
			properties[key] = { type: (value as Record<string, unknown>).type as string };
		}
		return { properties, required: (arrProp.items.required as string[]) ?? [] };
	} catch {
		return null;
	}
}

/**
 * Find the closest matching field name from a schema for a mismatched template reference.
 */
function suggestClosest(field: string, schemaFields: string[]): string | undefined {
	// Simple heuristic: check if one contains the other or shares a stem
	for (const sf of schemaFields) {
		if (sf.includes(field) || field.includes(sf)) return sf;
	}
	// Check common renames: underscore/camelCase, pluralization
	const normalized = field.toLowerCase().replace(/_/g, "");
	for (const sf of schemaFields) {
		const sfNorm = sf.toLowerCase().replace(/_/g, "");
		if (sfNorm === normalized) return sf;
		// Check if one is a prefix of the other
		if (sfNorm.startsWith(normalized) || normalized.startsWith(sfNorm)) return sf;
	}
	return undefined;
}

/**
 * Walk all agent steps in a workflow spec, including nested loop/parallel/forEach steps.
 * Yields [stepName, stepSpec, parentPrefix] tuples.
 */
function* walkAgentSteps(steps: Record<string, StepSpec>, prefix = ""): Generator<[string, StepSpec, string]> {
	for (const [name, step] of Object.entries(steps)) {
		const fullName = prefix ? `${prefix}.${name}` : name;
		if (step.agent) {
			yield [fullName, step, fullName];
		}
		if (step.loop?.steps) {
			yield* walkAgentSteps(step.loop.steps as Record<string, StepSpec>, `${fullName}.loop`);
		}
		if (step.parallel) {
			yield* walkAgentSteps(step.parallel as Record<string, StepSpec>, `${fullName}.parallel`);
		}
	}
}

/**
 * Validate template-input alignment for all agent steps in a workflow.
 * Returns validation issues for field mismatches, missing inputs, and naming errors.
 */
export function validateTemplateAlignment(spec: WorkflowSpec, cwd: string, builtinDir?: string): ValidationIssue[] {
	const issues: ValidationIssue[] = [];

	let loadAgent: (name: string) => import("./types.js").AgentSpec;
	try {
		loadAgent = createAgentLoader(cwd, builtinDir);
	} catch {
		return issues; // can't load agents — agent resolution check already handles this
	}

	// Template search mirrors createTemplateEnv() — project, user, builtin
	const builtinTemplateDir = builtinDir
		? path.resolve(builtinDir, "..", "templates")
		: path.resolve(import.meta.dirname, "..", "templates");
	const templateSearchPaths = [
		path.join(cwd, ".pi", "templates"),
		path.join(process.env.HOME ?? "", ".pi", "agent", "templates"),
		builtinTemplateDir,
	];

	for (const [stepName, stepSpec] of walkAgentSteps(spec.steps)) {
		if (!stepSpec.agent) continue;

		// Load agent spec
		let agentSpec: import("./types.js").AgentSpec;
		try {
			agentSpec = loadAgent(stepSpec.agent);
		} catch {
			continue; // agent resolution check handles this
		}

		if (!agentSpec.taskTemplate) continue;

		// Resolve and read template file
		let templateContent: string | null = null;
		for (const searchPath of templateSearchPaths) {
			const fullPath = path.join(searchPath, agentSpec.taskTemplate);
			try {
				templateContent = fs.readFileSync(fullPath, "utf-8");
				break;
			} catch {
				// try next path
			}
		}
		if (!templateContent) continue;

		const templateVars = extractTemplateVariables(templateContent);
		if (templateVars.length === 0) continue;

		const inputKeys = stepSpec.input ? new Set(Object.keys(stepSpec.input)) : new Set<string>();

		// Check 1: forEach `as` variable matches template root variables
		if (stepSpec.forEach && stepSpec.as) {
			const forEachRoots = new Set(templateVars.map((v) => v.root));
			// The `as` name should appear as a root in the template, OR a root that IS in the input
			// The common bug: template uses `spec.*` but forEach says `as: plan`
			if (!forEachRoots.has(stepSpec.as) && !inputKeys.has(stepSpec.as)) {
				// forEach variable is never referenced — find what the template uses instead
				const nonInputRoots = [...forEachRoots].filter((r) => !inputKeys.has(r) && !INJECTED_VARIABLES.has(r));
				if (nonInputRoots.length > 0) {
					issues.push({
						severity: "error",
						message: `Template '${agentSpec.taskTemplate}' uses '${nonInputRoots[0]}.*' but forEach binds as '${stepSpec.as}'. Template variables will be undefined.`,
						field: `steps.${stepName}.as`,
					});
				}
			}
		}

		// Check 2: Root variables exist in step inputs (or are injected)
		const uniqueRoots = new Set(templateVars.map((v) => v.root));
		for (const root of uniqueRoots) {
			if (INJECTED_VARIABLES.has(root)) continue;
			if (inputKeys.has(root)) continue;
			// forEach `as` variable counts as an input
			if (stepSpec.forEach && stepSpec.as === root) continue;

			// Find if any template var with this root is guarded
			const allGuarded = templateVars.filter((v) => v.root === root).every((v) => v.guarded);
			issues.push({
				severity: allGuarded ? "warning" : "error",
				message: `Template '${agentSpec.taskTemplate}' references '${root}' but step '${stepName}' does not declare it in input.${allGuarded ? " (guarded with conditional)" : ""}`,
				field: `steps.${stepName}.input`,
			});
		}

		// Check 3: Field-level alignment against source schemas
		for (const tv of templateVars) {
			if (INJECTED_VARIABLES.has(tv.root)) continue;
			const fieldParts = tv.path.split(".");
			if (fieldParts.length < 2) continue;
			const field = fieldParts[1]; // first-level field access on the root variable

			// Find the input expression for this root
			const inputExpr = stepSpec.input?.[tv.root] as string | undefined;
			// Also check if this is the forEach `as` variable
			const isForEachVar = stepSpec.forEach && stepSpec.as === tv.root;

			let exprToTrace: string | undefined;
			if (isForEachVar) {
				exprToTrace = `\${{ ${stepSpec.as} }}`;
			} else if (typeof inputExpr === "string") {
				exprToTrace = inputExpr;
			}

			if (!exprToTrace) continue;

			const schemaFields = traceInputSchema(exprToTrace, stepSpec, spec, cwd);
			if (!schemaFields) continue; // unverifiable

			if (!(field in schemaFields.properties)) {
				const closest = suggestClosest(field, Object.keys(schemaFields.properties));
				const suggestion = closest ? ` Did you mean '${closest}'?` : "";
				const available = Object.keys(schemaFields.properties).join(", ");
				issues.push({
					severity: tv.guarded ? "warning" : "error",
					message: `Template '${agentSpec.taskTemplate}' references '${tv.path}' but schema has no field '${field}'.${suggestion} Available: [${available}]`,
					field: `steps.${stepName}.input.${tv.root}`,
				});
			}
		}

		// Check 4: textOutput vs output type mismatch — template accesses fields on a string
		const textOutputWarned = new Set<string>();
		for (const tv of templateVars) {
			if (INJECTED_VARIABLES.has(tv.root)) continue;
			if (textOutputWarned.has(tv.root)) continue;
			const fieldParts = tv.path.split(".");
			if (fieldParts.length < 2) continue;

			const inputExpr = stepSpec.input?.[tv.root] as string | undefined;
			if (typeof inputExpr !== "string") continue;

			const inputType = resolveInputType(inputExpr);
			if (inputType === "string") {
				issues.push({
					severity: "warning",
					message: `Template accesses fields on '${tv.root}' which resolves from textOutput (string) — use output for structured data`,
					field: `steps.${stepName}.input.${tv.root}`,
				});
				textOutputWarned.add(tv.root); // one warning per root is sufficient
			}
		}

		// Check E: Type-level loop validation — for-loop sources must be arrays,
		// and loop variable property accesses must match schema item properties
		if (templateContent) {
			const templateLoops = extractTemplateLoops(templateContent);
			for (const loop of templateLoops) {
				if (INJECTED_VARIABLES.has(loop.sourceRoot)) continue;

				// Find the input expression for this loop source root
				const inputExpr = stepSpec.input?.[loop.sourceRoot] as string | undefined;
				const isForEachVar = stepSpec.forEach && stepSpec.as === loop.sourceRoot;

				let exprToTrace: string | undefined;
				if (isForEachVar) {
					exprToTrace = `\${{ ${stepSpec.as} }}`;
				} else if (typeof inputExpr === "string") {
					exprToTrace = inputExpr;
				}

				if (!exprToTrace) continue;

				// Trace to the schema for the root variable
				const schemaFields = traceInputSchema(exprToTrace, stepSpec, spec, cwd);
				if (!schemaFields) continue;

				// Check that the iterated field exists and is an array type
				const fieldDef = schemaFields.properties[loop.sourceField];
				if (!fieldDef) continue; // already caught by Check 3

				if (fieldDef.type === "object") {
					issues.push({
						severity: "warning",
						message: `Template iterates over '${loop.source}' with {% for %} but schema declares '${loop.sourceField}' as type 'object', not 'array'`,
						field: `steps.${stepName}.input.${loop.sourceRoot}`,
					});
				}

				// If it is an array, check accessed properties against array item schema
				if (fieldDef.type === "array" && loop.accessedProps.length > 0) {
					const itemSchema = loadArrayItemSchema(exprToTrace, stepSpec, spec, cwd, loop.sourceField);
					if (itemSchema) {
						for (const prop of loop.accessedProps) {
							if (!(prop in itemSchema.properties)) {
								const available = Object.keys(itemSchema.properties).join(", ");
								issues.push({
									severity: "warning",
									message: `Template accesses '${loop.loopVar}.${prop}' in loop over '${loop.source}' but schema items have no property '${prop}'. Available: [${available}]`,
									field: `steps.${stepName}.input.${loop.sourceRoot}`,
								});
							}
						}
					}
				}
			}
		}
	}

	return issues;
}
