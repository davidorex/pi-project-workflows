#!/usr/bin/env tsx
/**
 * extract-task-progress — atomic-element extractor for .project/tasks.json
 *
 * Reads a specific TASK item by --id and renders id + status + description + notes
 * suitable for embedding in subagent briefs.
 *
 * Usage:
 *   tsx scripts/orchestrator/extract-task-progress.ts --id TASK-021
 */
import { readBlock } from "@davidorex/pi-context/block-api";

interface TaskItem {
	id: string;
	description: string;
	status: string;
	notes?: string;
	acceptance_criteria?: string[];
}

function parseArgs(argv: string[]): { id: string } {
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === "--id" && argv[i + 1]) return { id: argv[i + 1] };
	}
	console.error("Required: --id <TASK-NNN>");
	process.exit(2);
}

function main(): void {
	const { id } = parseArgs(process.argv.slice(2));
	const block = readBlock(process.cwd(), "tasks") as { tasks: TaskItem[] };
	const task = block.tasks.find((t) => t.id === id);
	if (!task) {
		console.error(`Task ${id} not found`);
		process.exit(3);
	}
	console.log(`### ${task.id} — ${task.status}`);
	console.log("");
	console.log(task.description);
	if (task.notes) {
		console.log("");
		console.log(`**Notes**: ${task.notes}`);
	}
	if (task.acceptance_criteria && task.acceptance_criteria.length > 0) {
		console.log("");
		console.log("**Acceptance criteria**:");
		for (const c of task.acceptance_criteria) console.log(`- ${c}`);
	}
}

main();
