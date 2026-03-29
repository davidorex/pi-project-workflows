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
	}

	return issues;
}
