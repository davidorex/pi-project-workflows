// POC F — cascade fail-stop semantics: cascade pipeline.
//
// Multi-step injection pipeline (load → render → budget → wrap), each step
// returns a uniform `StepResult` so the orchestrator can apply a fail-stop mode
// (skip, fail, annotate) per failed step.

import fs from "node:fs";

// ─── Step result contract — uniform for every step in the cascade ───

export interface StepResult {
	status: "ok" | "fail";
	output: string;
	error?: string;
}

// ─── Per-item record loaded from data/items.json ───

export interface ItemRecord {
	id: string;
	title: string;
	body: string;
}

// ─── Step 1: load items from a JSON path. Fails if the file is unreadable
// or shape-invalid (no `items` array). ───

export function loadItems(jsonPath: string): StepResult {
	try {
		const raw = fs.readFileSync(jsonPath, "utf8");
		const parsed = JSON.parse(raw) as { items?: unknown };
		if (!Array.isArray(parsed.items)) {
			return {
				status: "fail",
				output: "",
				error: `load: ${jsonPath} contains no top-level 'items' array`,
			};
		}
		return {
			status: "ok",
			output: JSON.stringify(parsed.items),
		};
	} catch (err) {
		return {
			status: "fail",
			output: "",
			error: `load: ${(err as Error).message}`,
		};
	}
}

// ─── Step 2: render a single item to a markdown bullet line. The render rule
// rejects any body containing the literal `<<UNPARSEABLE>>` token — this is
// the deliberate failure surface for item 3 in the fixture. ───

export function renderItem(item: ItemRecord): StepResult {
	if (typeof item.body !== "string") {
		return {
			status: "fail",
			output: "",
			error: `render: item ${item.id} body is not a string`,
		};
	}
	if (item.body.includes("<<UNPARSEABLE>>")) {
		return {
			status: "fail",
			output: "",
			error: `render: item ${item.id} body contains forbidden token <<UNPARSEABLE>> — render aborted`,
		};
	}
	return {
		status: "ok",
		output: `- ${item.id} — ${item.title}: ${item.body}`,
	};
}

// ─── Step 3: budget enforcement — accept the rendered lines, reject if total
// character length exceeds a soft cap. Returns the joined block on ok. ───

export function applyBudget(renderedLines: string[], maxChars = 2000): StepResult {
	const joined = renderedLines.join("\n");
	if (joined.length > maxChars) {
		return {
			status: "fail",
			output: "",
			error: `budget: rendered block ${joined.length} chars exceeds cap ${maxChars}`,
		};
	}
	return {
		status: "ok",
		output: joined,
	};
}

// ─── Step 4: wrap the budgeted block in framework anti-injection delimiters
// matching the production agent-injection contract shape. ───

export function wrapDelimiters(block: string): StepResult {
	if (typeof block !== "string") {
		return {
			status: "fail",
			output: "",
			error: "wrap: input block is not a string",
		};
	}
	const wrapped = ["<<<INJECTED_CONTEXT>>>", block, "<<<END_INJECTED_CONTEXT>>>"].join("\n");
	return {
		status: "ok",
		output: wrapped,
	};
}
