#!/usr/bin/env tsx
/**
 * compile-preamble-context — composer of the heavy preamble per
 * feedback_constraining_subagent_briefs. Mirrors pi-jit-agents compileAgent
 * vocabulary: this fragment is one piece of the compiled agent context.
 *
 * Per-type variants automatically include the right subset of mandates / DECs
 * / feedback. The composer invokes the atomic extractors as child processes
 * (extract-mandates, extract-decs, extract-feedback) — exact same surfaces
 * that exist as standalone scripts.
 *
 * Usage:
 *   tsx scripts/orchestrator/compile-preamble-context.ts \
 *       --type {implementation|explore|adversarial-probe|demo} \
 *       [--decs DEC-0014,DEC-0015,...] [--feedback names,...]
 *
 * Output goes to stdout — orchestrator captures + embeds in Agent prompt.
 */
import { execSync } from "node:child_process";
import path from "node:path";

type AgentType = "implementation" | "explore" | "adversarial-probe" | "demo";

interface Args {
	type: AgentType;
	extraDecs?: string[];
	extraFeedback?: string[];
}

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);

function parseArgs(argv: string[]): Args {
	const out: Partial<Args> = {};
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === "--type" && argv[i + 1]) {
			out.type = argv[i + 1] as AgentType;
			i++;
		} else if (argv[i] === "--decs" && argv[i + 1]) {
			out.extraDecs = argv[i + 1].split(",").map((s) => s.trim());
			i++;
		} else if (argv[i] === "--feedback" && argv[i + 1]) {
			out.extraFeedback = argv[i + 1].split(",").map((s) => s.trim());
			i++;
		}
	}
	if (!out.type) {
		console.error("Specify --type {implementation|explore|adversarial-probe|demo}");
		process.exit(2);
	}
	return out as Args;
}

function run(cmd: string): string {
	return execSync(cmd, { encoding: "utf-8" });
}

const TYPE_DECS: Record<AgentType, string[]> = {
	implementation: ["DEC-0014", "DEC-0015", "DEC-0017", "DEC-0018"],
	explore: ["DEC-0014", "DEC-0015"],
	"adversarial-probe": ["DEC-0014", "DEC-0015", "DEC-0017", "DEC-0018"],
	demo: ["DEC-0015", "DEC-0018"],
};

const TYPE_FEEDBACK: Record<AgentType, string[]> = {
	implementation: [
		"subagents_no_npm",
		"subagent_commits_per_step",
		"pipe_masks_exit_code",
		"runtime_demo_plus_adversarial_per_step",
		"constraining_subagent_briefs",
		"no_destructive_git_ops",
		"no_parallel_ungated_paths",
	],
	explore: ["concise_no_walls", "agent_output_to_file", "constraining_subagent_briefs"],
	"adversarial-probe": [
		"adversarial_audits_not_self_audits",
		"orchestrator_owns_subagent_output",
		"no_speculation_as_conclusion",
		"verify_before_assuming",
		"runtime_demo_plus_adversarial_per_step",
		"constraining_subagent_briefs",
	],
	demo: [
		"subagents_no_npm",
		"pipe_masks_exit_code",
		"tsx_eval_for_deterministic_state",
		"runtime_demo_plus_adversarial_per_step",
		"constraining_subagent_briefs",
	],
};

const TYPE_TOOL_SURFACE: Record<AgentType, string> = {
	implementation: `- NEVER run \`npm\`. Orchestrator owns all npm gates. tsx eval is fine.
- Use canonical surfaces only — no parallel ungated paths. AJV via canonical \`validate()\` from schema-validator.ts:108.
- Direct Edit/Write of \`.project/*.json\` is FORBIDDEN. Use block-api primitives via tsx eval.
- File outputs to \`/tmp/<filename>\` for reports.`,
	explore: `- READ-ONLY. NEVER modify any source / config / substrate file.
- Use Read + grep + git extensively. tsx for verification only.
- File outputs to \`/tmp/<filename>.md\`.`,
	"adversarial-probe": `- NEVER run \`npm\`. Use \`tsx\`, plain \`node --input-type=module\` against dist/, \`grep\`, \`git show\`, \`git log\` only.
- NO commits. NO source modifications. NO \`.project/*.json\` edits.
- File output to \`/tmp/<filename>.md\`.`,
	demo: `- NEVER run \`npm\`. tsx or plain node against dist/ only.
- NO commits, NO source modifications, NO \`.project/*.json\` edits.
- File output to \`/tmp/<filename>.md\`.
- Demos must invoke production code path end-to-end with verifiable assertion (DEC-0018).`,
};

const TYPE_OUTPUT_DISCIPLINE: Record<AgentType, string> = {
	implementation: `- One forensic commit per logical step. NEVER bundle.
- Pre-commit hook is canonical. Fix root cause + create NEW commit on hook failure. NEVER \`--no-verify\`. NEVER \`--amend\`.
- Commit subject + forensic body per global CLAUDE.md. NO co-author claims. Speak to aims/intentions, not unwarranted certainties. NO "this ensures..." / "this fixes..." language.
- Terse facts. No commentary. No summaries.`,
	explore: `- Terse facts. No commentary. Cite file:line for every claim.
- No conclusions beyond what evidence supports.`,
	"adversarial-probe": `- VERDICT IS PASS OR FAIL. No YELLOW. No "ready with notes." No "minor concerns."
- NO hedging language. Forbidden phrases: "appears correct" / "likely works" / "could be a real issue if X" / "may not be" / "probably" / "seems to" / "audit said so".
- NO conditional verdicts. Commit to a verdict on observed evidence.
- NO trust in subagent self-reports — independently trace every cited claim against actual source/files.
- Cross-check escalation candidates against existing arc planning BEFORE flagging.`,
	demo: `- Per-demo report: COMMAND, OUTPUT (full, no truncation), VERDICT (pass/fail/inconclusive), JUSTIFICATION (what was proven).
- Differential traps preferred where applicable — observable can ONLY come from the intended mechanism.
- No pipe-to-tail (\`tail\` masks exit code). Use \`set -o pipefail\` or no pipe.
- macOS realpath: \`fs.realpathSync\` for tmpdir comparisons.`,
};

function buildPreamble(args: Args): string {
	const lines: string[] = [];
	lines.push("### Operating constraints (binding — failure halts work)");
	lines.push("");
	lines.push("**Mandates** (always):");
	const mandatesOutput = run(`tsx ${path.join(SCRIPT_DIR, "extract-mandates.ts")}`);
	lines.push(mandatesOutput.trim());
	lines.push("");

	const decIds = Array.from(new Set([...TYPE_DECS[args.type], ...(args.extraDecs ?? [])]));
	if (decIds.length > 0) {
		lines.push("**Substrate canon** (DECs):");
		const decsOutput = run(`tsx ${path.join(SCRIPT_DIR, "extract-decs.ts")} --ids ${decIds.join(",")}`);
		lines.push(decsOutput.trim());
		lines.push("");
	}

	const fbNames = Array.from(new Set([...TYPE_FEEDBACK[args.type], ...(args.extraFeedback ?? [])]));
	if (fbNames.length > 0) {
		lines.push("**Operating feedback** (load-bearing):");
		const fbOutput = run(`tsx ${path.join(SCRIPT_DIR, "extract-feedback.ts")} --names ${fbNames.join(",")}`);
		lines.push(fbOutput.trim());
		lines.push("");
	}

	lines.push("**Tool surface**:");
	lines.push(TYPE_TOOL_SURFACE[args.type]);
	lines.push("");

	lines.push("**Output discipline**:");
	lines.push(TYPE_OUTPUT_DISCIPLINE[args.type]);
	lines.push("");

	lines.push(
		"**Anti-hedge**: surface discovered issues; never defer silently. End reports with facts, not questions. Pass/fail commits, not 'likely' or 'appears correct'.",
	);
	return lines.join("\n");
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	console.log(buildPreamble(args));
}

main();
