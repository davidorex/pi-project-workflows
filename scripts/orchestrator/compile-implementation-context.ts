#!/usr/bin/env tsx
/**
 * compile-implementation-context — full implementation-class agent context composer
 *
 * Mirrors pi-jit-agents compileAgent vocabulary on the Claude Code side.
 * Assembles agent input mechanically: preamble (via compile-preamble-context
 * --type implementation) + substrate state (git + active task) + optional
 * context_items (via inject-context-items) + section_spec (phase row +
 * cascade-target table + audit-grep + cross-refs) + task block + four
 * parameter-supplied per-investigation fragments (verification gates / demo spec
 * / stop triggers / report-back format). XML-tag structured.
 *
 * Per-investigation parameterization: --verification-gates / --demo-spec /
 * --stop-triggers / --report-back-format point to markdown fragments under
 * scripts/orchestrator/templates/. Default fragments preserve FGAP-026
 * fixture-cascade audit behavior; new investigations supply their own.
 * Removes the hardcode that over-fit the script to its first use case
 * (extends FGAP-039 root-pattern fix to the implementation composer).
 *
 * Per DEC-0019 (scripts as canonical Claude Code-side composition surface).
 * Per the TABLES-ONLY rule (no prose summary; aggregation is orchestrator's job).
 *
 * Usage:
 *   tsx scripts/orchestrator/compile-implementation-context.ts \
 *       --section <X.Y> \
 *       --target packages/<pkg> \
 *       --explore-report compiled-contexts/<explore-report>.md \
 *       --task-id TASK-NNN \
 *       --task-template @compiled-contexts/<task-block>.md \
 *       [--section-spec-section "Phase 1.2"] \
 *       [--context-items 'block:itemId,block:itemId'] \
 *       [--verification-gates scripts/orchestrator/templates/implementation-verification-gates-<shape>.md] \
 *       [--demo-spec scripts/orchestrator/templates/implementation-demo-spec-<shape>.md] \
 *       [--stop-triggers scripts/orchestrator/templates/implementation-stop-triggers-<shape>.md] \
 *       [--report-back-format scripts/orchestrator/templates/implementation-report-back-<shape>.md]
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

interface Args {
	section: string;
	target: string;
	exploreReport: string;
	taskId: string;
	sectionSpecSection?: string;
	sectionSpecFile?: string;
	taskTemplate: string;
	contextItems?: string;
	verificationGatesPath?: string;
	demoSpecPath?: string;
	stopTriggersPath?: string;
	reportBackFormatPath?: string;
}

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const DEFAULT_VERIFICATION_GATES = path.join(
	SCRIPT_DIR,
	"templates",
	"implementation-verification-gates-fixture-cascade.md",
);
const DEFAULT_DEMO_SPEC = path.join(SCRIPT_DIR, "templates", "implementation-demo-spec-fixture-cascade.md");
const DEFAULT_STOP_TRIGGERS = path.join(SCRIPT_DIR, "templates", "implementation-stop-triggers-fixture-cascade.md");
const DEFAULT_REPORT_BACK_FORMAT = path.join(SCRIPT_DIR, "templates", "implementation-report-back-fixture-cascade.md");

function parseArgs(argv: string[]): Args {
	const out: Partial<Args> = {
		sectionSpecFile: "analysis/2026-05-10-fgap-026-closure-sub-phase-structure.md",
	};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--section" && argv[i + 1]) {
			out.section = argv[i + 1];
			i++;
		} else if (a === "--target" && argv[i + 1]) {
			out.target = argv[i + 1];
			i++;
		} else if (a === "--explore-report" && argv[i + 1]) {
			out.exploreReport = argv[i + 1];
			i++;
		} else if (a === "--task-id" && argv[i + 1]) {
			out.taskId = argv[i + 1];
			i++;
		} else if (a === "--section-spec-section" && argv[i + 1]) {
			out.sectionSpecSection = argv[i + 1];
			i++;
		} else if (a === "--section-spec-file" && argv[i + 1]) {
			out.sectionSpecFile = argv[i + 1];
			i++;
		} else if (a === "--task-template" && argv[i + 1]) {
			const v = argv[i + 1];
			out.taskTemplate = v.startsWith("@") ? fs.readFileSync(v.slice(1), "utf-8") : v;
			i++;
		} else if (a === "--context-items" && argv[i + 1]) {
			out.contextItems = argv[i + 1];
			i++;
		} else if (a === "--verification-gates" && argv[i + 1]) {
			out.verificationGatesPath = argv[i + 1];
			i++;
		} else if (a === "--demo-spec" && argv[i + 1]) {
			out.demoSpecPath = argv[i + 1];
			i++;
		} else if (a === "--stop-triggers" && argv[i + 1]) {
			out.stopTriggersPath = argv[i + 1];
			i++;
		} else if (a === "--report-back-format" && argv[i + 1]) {
			out.reportBackFormatPath = argv[i + 1];
			i++;
		}
	}
	if (!out.section || !out.target || !out.exploreReport || !out.taskId || !out.taskTemplate) {
		console.error(
			"Required: --section <X.Y> --target <pkg> --explore-report <path> --task-id <TASK-NNN> --task-template <text|@file>",
		);
		process.exit(2);
	}
	return out as Args;
}

function gitState(): { head: string; branch: string; statusShort: string; recentCommits: string } {
	const head = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
	const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
	const statusShort = execSync("git status --short", { encoding: "utf-8" }).trim();
	const recentCommits = execSync("git log --oneline -5", { encoding: "utf-8" }).trim();
	return { head, branch, statusShort, recentCommits };
}

function runScript(name: string, args: string): string {
	return execSync(`tsx ${path.join(SCRIPT_DIR, name)} ${args}`, { encoding: "utf-8" }).trim();
}

function readFragment(p: string | undefined, fallback: string): string {
	const resolved = p ?? fallback;
	if (!fs.existsSync(resolved)) {
		console.error(`compile-implementation-context: fragment file not found: ${resolved}`);
		process.exit(3);
	}
	return fs.readFileSync(resolved, "utf-8").trim();
}

function buildBrief(args: Args): string {
	const state = gitState();
	const preamble = runScript("compile-preamble-context.ts", "--type implementation");
	const taskProgress = runScript("extract-task-progress.ts", `--id ${args.taskId}`);
	const sectionSpec = args.sectionSpecSection
		? runScript("extract-markdown-section.ts", `--file ${args.sectionSpecFile} --section "${args.sectionSpecSection}"`)
		: "(no section-spec extraction requested)";
	const cascadeTable = runScript(
		"extract-markdown-section.ts",
		`--file ${args.exploreReport} --section "## Site inventory"`,
	);
	let auditGrepResults = "(no audit-grep section in explore report)";
	try {
		auditGrepResults = runScript(
			"extract-markdown-section.ts",
			`--file ${args.exploreReport} --section "## Audit-grep results"`,
		);
	} catch {
		// optional section
	}
	let crossRefs = "(no cross-references section in explore report)";
	try {
		crossRefs = runScript(
			"extract-markdown-section.ts",
			`--file ${args.exploreReport} --section "## Cross-references"`,
		);
	} catch {
		// optional
	}
	const contextItems = args.contextItems
		? `\n<context_items>\n${runScript("inject-context-items.ts", `--items "${args.contextItems}" --format xml`)}\n</context_items>\n`
		: "";

	const verificationGates = readFragment(args.verificationGatesPath, DEFAULT_VERIFICATION_GATES);
	const demoSpec = readFragment(args.demoSpecPath, DEFAULT_DEMO_SPEC);
	const stopTriggers = readFragment(args.stopTriggersPath, DEFAULT_STOP_TRIGGERS);
	const reportBackFormat = readFragment(args.reportBackFormatPath, DEFAULT_REPORT_BACK_FORMAT);

	return `<operating_constraints>
${preamble}
</operating_constraints>

<substrate_state>
- Working dir: ${process.cwd()}
- Branch: ${state.branch}
- HEAD: \`${state.head}\`
- Working tree: ${state.statusShort ? "DIRTY" : "clean"}
${state.statusShort ? `\`\`\`\n${state.statusShort}\n\`\`\`` : ""}

**Recent commits**:
\`\`\`
${state.recentCommits}
\`\`\`

**Active task** (${args.taskId}):
${taskProgress}
</substrate_state>
${contextItems}
<section_spec>
**Section**: ${args.section}
**Target package**: ${args.target}

**Canonical sub-phase row**:
${sectionSpec}

**Cascade target table** (from ${args.exploreReport} — agent acts on cells; orchestrator computes aggregates):
${cascadeTable}

**Audit-grep results** (from explore — for adversarial post-cascade verification):
${auditGrepResults}

**Cross-references** (existing arc planning that covers concerns; do NOT re-escalate):
${crossRefs}
</section_spec>

<task>
${args.taskTemplate}
</task>

<verification_gates_orchestrator_runs>
${verificationGates}
</verification_gates_orchestrator_runs>

<dec_0018_demo_spec>
${demoSpec}
</dec_0018_demo_spec>

<stop_triggers>
${stopTriggers}
</stop_triggers>

<report_back_format>
${reportBackFormat}
</report_back_format>
`;
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	console.log(buildBrief(args));
}

main();
