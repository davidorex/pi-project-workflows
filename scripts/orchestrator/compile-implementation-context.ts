#!/usr/bin/env tsx
/**
 * compile-implementation-context — full implementation-class agent context composer
 *
 * Mirrors pi-jit-agents compileAgent vocabulary on the Claude Code side.
 * Assembles agent input mechanically: preamble (via compile-preamble-context
 * --type implementation) + substrate state (git + active task) + section spec
 * (phase row + cascade-target table from explore report + audit-grep results) +
 * per-helper edit pattern + verification gates (orchestrator runs) + DEC-0018
 * demo spec + STOP triggers + tables-only report-back format. XML-tag structured.
 *
 * Per DEC-0019 (scripts as canonical Claude Code-side composition surface).
 * Per the TABLES-ONLY rule (no prose summary; aggregation is orchestrator's job).
 *
 * Usage:
 *   tsx scripts/orchestrator/compile-implementation-context.ts \
 *       --section C.3 \
 *       --target packages/pi-workflows \
 *       --explore-report /tmp/explore-c3-fixtures-v2.md \
 *       --task-id TASK-021 \
 *       --section-spec-section "Phase 1.2" \
 *       --task-template @/tmp/c3-task-template.md
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
}

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);

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
After your commit lands, the orchestrator runs (you do NOT run these):
- \`npm run build; echo "BUILD_EXIT=$?"\` — must exit 0
- \`npm run check; echo "CHECK_EXIT=$?"\` — must exit 0
- \`npm test -w @davidorex/pi-workflows 2>&1 > /tmp/test-output.txt; echo "TEST_EXIT=$?"\` — must exit 0; full output read; no pipe-mask
- Grep audit: zero new \`.project\` literals in production source; classification table sites cascaded as expected
</verification_gates_orchestrator_runs>

<dec_0018_demo_spec>
Per DEC-0018 (runtime demonstration + adversarial probe per implementation step):

After commit, orchestrator constructs differential-trap demo for this section:
- Write fresh tmpdir with non-default contextDir pointer (e.g. \`.context-c3-demo\`)
- Invoke a representative pi-workflows function (executeWorkflow / readBlock via workflow-executor) against that tmpdir
- Assert cascade reaches \`.context-c3-demo/\` substrate, NOT hardcoded \`.project/\`
- This proves cascade is genuinely working post-section, not passing for wrong reason via pointer side-effect
</dec_0018_demo_spec>

<stop_triggers>
- Pre-commit hook fails — fix root cause + create NEW commit; NEVER \`--no-verify\`
- Discovered cascade target NOT in the cascade-target table — cascade it; surface in commit body
- A test that previously passed now fails — STOP, surface (regression)
- Site classified config-required in table but cascade would change unrelated test semantics — STOP, surface
- Site classified no-resolver-reach but adding pointer doesn't break the test — leave it alone (preserves DEC-0018 intent: pointer is load-bearing only where cascade is needed)
</stop_triggers>

<report_back_format>
TABLES-ONLY rule applies. NO prose summary, NO recommendations narrative, NO "executive summary".

Return only:
1. Commit SHA: \`<sha>\`
2. Per-row applied-yes/skipped-no count from the cascade-target table (orchestrator will verify by re-counting; agent reports the integers it acted on)
3. Anti-pattern check: PASS or FAIL with named violation

Optional: write detailed per-row applied/skipped table to \`/tmp/c3-impl-applied.md\`. NO interpretation, NO commentary.
</report_back_format>
`;
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	console.log(buildBrief(args));
}

main();
