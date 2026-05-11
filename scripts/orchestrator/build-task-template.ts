#!/usr/bin/env tsx
/**
 * build-task-template — canonical implementer task-block composer
 *
 * Renders the implementation task-block from substrate inputs:
 *   - TASK-NNN id (reads description + acceptance_criteria + files[] from
 *     .project/tasks.json via @davidorex/pi-context/block-api readBlock)
 *   - Explore report path (cascade-target table source via extract-markdown-section)
 *   - Commit subject template (verbatim use as commit subject)
 *
 * Output: XML-structured task-block to stdout in the exact shape
 * build-implementation-brief.ts expects via `--task-template @<file>`.
 *
 * Closes FGAP-036 (hand-authored task-templates bypass DEC-0019 dual-surface).
 *
 * Usage:
 *   tsx scripts/orchestrator/build-task-template.ts \
 *       --task-id TASK-031 \
 *       --explore-report /tmp/explore-fgap035.md \
 *       --commit-subject 'feat(pi-context)!: ...' \
 *       [--required-reading-extra path1,path2]
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { readBlock } from "@davidorex/pi-context/block-api";

interface TaskItem {
	id: string;
	description: string;
	status: string;
	files?: string[];
	acceptance_criteria?: string[];
	notes?: string;
}

interface Args {
	taskId: string;
	exploreReport: string;
	commitSubject: string;
	requiredReadingExtra?: string[];
}

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);

function parseArgs(argv: string[]): Args {
	const out: Partial<Args> = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--task-id" && argv[i + 1]) {
			out.taskId = argv[i + 1];
			i++;
		} else if (a === "--explore-report" && argv[i + 1]) {
			out.exploreReport = argv[i + 1];
			i++;
		} else if (a === "--commit-subject" && argv[i + 1]) {
			out.commitSubject = argv[i + 1];
			i++;
		} else if (a === "--required-reading-extra" && argv[i + 1]) {
			out.requiredReadingExtra = argv[i + 1]
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);
			i++;
		}
	}
	if (!out.taskId || !out.exploreReport || !out.commitSubject) {
		console.error("Required: --task-id TASK-NNN --explore-report <path> --commit-subject <text>");
		console.error("Optional: --required-reading-extra path1,path2");
		process.exit(2);
	}
	if (!fs.existsSync(out.exploreReport)) {
		console.error(`Explore report not found: ${out.exploreReport}`);
		process.exit(3);
	}
	return out as Args;
}

function readTaskFromSubstrate(taskId: string): TaskItem {
	const block = readBlock(process.cwd(), "tasks") as { tasks: TaskItem[] };
	const found = block.tasks.find((t) => t.id === taskId);
	if (!found) {
		console.error(`Task ${taskId} not found in .project/tasks.json`);
		process.exit(4);
	}
	return found;
}

function extractCascadeTable(reportPath: string): string {
	try {
		return execSync(
			`tsx ${path.join(SCRIPT_DIR, "extract-markdown-section.ts")} --file ${reportPath} --section "## Site inventory" --no-header`,
			{ encoding: "utf-8" },
		).trim();
	} catch {
		return "(no '## Site inventory' section in explore report — orchestrator must regenerate report or pick a different section header)";
	}
}

function buildTemplate(args: Args): string {
	const task = readTaskFromSubstrate(args.taskId);
	const cascadeTable = extractCascadeTable(args.exploreReport);
	const extra = args.requiredReadingExtra ?? [];
	const filesList = task.files ?? [];

	const readingItems: string[] = [
		`\`${args.exploreReport}\` — full explore report (cascade-target table; site inventory)`,
		...filesList.map((f) => `\`${f}\` — substrate-declared scope file`),
		...extra.map((f) => `\`${f}\` — orchestrator-supplied additional reading`),
	];
	const reading = readingItems.map((r, i) => `${i + 1}. ${r}`).join("\n");

	const criteria = (task.acceptance_criteria ?? []).map((c, i) => `${i + 1}. ${c}`).join("\n");

	return `## Task: ${args.taskId} — ${task.description}

### Read first

${reading}

### Acceptance criteria (from substrate \`.project/tasks.json\` — verbatim)

${criteria || "(no acceptance_criteria declared in substrate — file as gap if scope unclear)"}

### Cascade-target table (from explore report — apply each row exactly)

${cascadeTable}

### Apply order

Apply each row of the cascade-target table in declared order. Do NOT introduce changes outside the table rows. Do NOT skip rows. Each row's "Required change" cell is binding — apply verbatim semantics.

### Commit

**Subject**: \`${args.commitSubject}\`

**Body** (forensic per global CLAUDE.md):
- WHY: state the root cause this fix addresses (cite the FGAP / DEC / observation that surfaced it)
- WHAT CHANGED: enumerate each cascade-table row applied
- TEST SURFACE: cite test count delta + per-package state
- BREAKING CHANGE: flag with \`!\` in subject if applicable; explain in body
- Status cascade: state pending (status cascade is a follow-on commit, NOT this commit)
- Do NOT include Co-Authored-By per global CLAUDE.md ("Do not pollute the semantics of the repository with author credit claims in commit messages")

Use HEREDOC for commit message.

### STOP triggers

- Pre-commit hook fails (husky runs check + test) → fix root cause; never \`--no-verify\`
- Any test count regression in any package → STOP, surface
- Discovery of any production-source site outside the cascade-target table → STOP, surface (mandate-007 — no deferring discovered issues)
- TypeScript compile error elsewhere → STOP, surface
- Any cascade-table row whose Required-change cell is ambiguous → STOP, do NOT guess; surface

### Report-back format

TABLES ONLY. NO prose summary. NO recommendations. NO closing remarks. Return:

\`\`\`
| Row | Site | Applied |
|-----|------|---------|
| 1 | ... | YES/SKIPPED |
| ... | ... | ... |

Commit SHA: <40-char>
Test counts post-commit: pi-context X/Y/Z; pi-jit-agents X/Y/Z; pi-workflows X/Y/Z; pi-behavior-monitors X/Y/Z
Anti-pattern check: PASS | FAIL with named violation
\`\`\`
`;
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	console.log(buildTemplate(args));
}

main();
