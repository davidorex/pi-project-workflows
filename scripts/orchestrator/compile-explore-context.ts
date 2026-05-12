#!/usr/bin/env tsx
/**
 * compile-explore-context — full Explore-agent context composer
 *
 * Mirrors pi-jit-agents compileAgent vocabulary: assembles the agent's input
 * context mechanically (no orchestrator-LLM prose authoring). Sections:
 * preamble (via compile-preamble-context) + substrate-state + optional
 * context_items (via inject-context-items) + investigation question +
 * required-reading list + audit-grep targets + output-format scaffold (from
 * --output-schema fragment) + STOP triggers + anti-patterns (from
 * --anti-patterns fragment) + report-back format. XML-tag structured.
 *
 * Per-investigation parameterization: --output-schema and --anti-patterns
 * point to markdown fragment files under scripts/orchestrator/templates/.
 * Default fragments preserve FGAP-026 fixture-cascade audit behavior; new
 * investigations supply their own fragments. Removes the hardcode that
 * over-fit the script to its first use case (FGAP-039).
 *
 * Goal: orchestrator-side composition is mechanical; the dispatching LLM
 * never composes agent prompts as prose.
 *
 * Usage:
 *   tsx scripts/orchestrator/compile-explore-context.ts \
 *       --question @/tmp/c3-question.md \
 *       --target packages/pi-workflows \
 *       --output /tmp/explore-c3-fixtures.md \
 *       [--required-reading file1,file2] \
 *       [--audit-greps 'pattern1::desc1,pattern2::desc2'] \
 *       [--context-items 'block:itemId,block:itemId'] \
 *       [--output-schema scripts/orchestrator/templates/explore-output-schema-<shape>.md] \
 *       [--anti-patterns scripts/orchestrator/templates/explore-anti-patterns-<shape>.md]
 *
 * Output goes to stdout — orchestrator captures + embeds in Agent prompt.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

interface Args {
	question: string;
	target: string;
	outputPath: string;
	requiredReading?: string[];
	auditGreps?: Array<{ pattern: string; desc: string }>;
	contextItems?: string;
	outputSchemaPath?: string;
	antiPatternsPath?: string;
}

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const DEFAULT_OUTPUT_SCHEMA = path.join(SCRIPT_DIR, "templates", "explore-output-schema-fixture-cascade.md");
const DEFAULT_ANTI_PATTERNS = path.join(SCRIPT_DIR, "templates", "explore-anti-patterns-fixture-cascade.md");

function parseArgs(argv: string[]): Args {
	const out: Partial<Args> = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--question" && argv[i + 1]) {
			const v = argv[i + 1];
			out.question = v.startsWith("@") ? fs.readFileSync(v.slice(1), "utf-8").trim() : v;
			i++;
		} else if (a === "--target" && argv[i + 1]) {
			out.target = argv[i + 1];
			i++;
		} else if (a === "--output" && argv[i + 1]) {
			out.outputPath = argv[i + 1];
			i++;
		} else if (a === "--required-reading" && argv[i + 1]) {
			out.requiredReading = argv[i + 1].split(",").map((s) => s.trim());
			i++;
		} else if (a === "--audit-greps" && argv[i + 1]) {
			out.auditGreps = argv[i + 1].split(",").map((entry) => {
				const [pattern, desc] = entry.split("::");
				return { pattern: pattern?.trim() ?? "", desc: desc?.trim() ?? "" };
			});
			i++;
		} else if (a === "--context-items" && argv[i + 1]) {
			out.contextItems = argv[i + 1];
			i++;
		} else if (a === "--output-schema" && argv[i + 1]) {
			out.outputSchemaPath = argv[i + 1];
			i++;
		} else if (a === "--anti-patterns" && argv[i + 1]) {
			out.antiPatternsPath = argv[i + 1];
			i++;
		}
	}
	if (!out.question || !out.target || !out.outputPath) {
		console.error("Required: --question <text|@file> --target <package-or-files> --output </tmp/...md>");
		process.exit(2);
	}
	return out as Args;
}

function gitState(): { head: string; branch: string; statusShort: string } {
	const head = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
	const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
	const statusShort = execSync("git status --short", { encoding: "utf-8" }).trim();
	return { head, branch, statusShort };
}

function buildPreamble(): string {
	return execSync(`tsx ${path.join(SCRIPT_DIR, "compile-preamble-context.ts")} --type explore`, {
		encoding: "utf-8",
	}).trim();
}

function injectContextItems(items: string | undefined): string {
	if (!items) return "";
	const rendered = execSync(`tsx ${path.join(SCRIPT_DIR, "inject-context-items.ts")} --items "${items}" --format xml`, {
		encoding: "utf-8",
	}).trim();
	return `\n<context_items>\n${rendered}\n</context_items>\n`;
}

function readFragment(p: string | undefined, fallback: string): string {
	const resolved = p ?? fallback;
	if (!fs.existsSync(resolved)) {
		console.error(`compile-explore-context: fragment file not found: ${resolved}`);
		process.exit(3);
	}
	return fs.readFileSync(resolved, "utf-8").trim();
}

function buildBrief(args: Args): string {
	const state = gitState();
	const preamble = buildPreamble();
	const reading = args.requiredReading ?? [];
	const greps = args.auditGreps ?? [];
	const cwd = process.cwd();
	const outputSchema = readFragment(args.outputSchemaPath, DEFAULT_OUTPUT_SCHEMA);
	const antiPatterns = readFragment(args.antiPatternsPath, DEFAULT_ANTI_PATTERNS);

	return `<operating_constraints>
${preamble}
</operating_constraints>

<substrate_state>
- Working dir: ${cwd}
- Branch: ${state.branch}
- HEAD: \`${state.head}\`
- Working tree: ${state.statusShort ? "DIRTY (see below)" : "clean"}
${state.statusShort ? `\`\`\`\n${state.statusShort}\n\`\`\`` : ""}
</substrate_state>
${injectContextItems(args.contextItems)}
<investigation_question>
${args.question}
</investigation_question>

<target>
${args.target}
</target>

<required_reading>
${
	reading.length === 0
		? "(none specified — read source files in --target as needed)"
		: reading.map((f, i) => `${i + 1}. \`${f}\``).join("\n")
}
</required_reading>

<task>
Read the required-reading files in order. Then investigate the target to answer the investigation_question. Enumerate concretely — every site, every classification, every cross-reference. Cite file:line for every claim. No conclusions beyond evidence.

For each enumerated item, provide:
- File path + line number
- Verbatim code snippet (5 lines max context) where relevant
- Classification per the question's taxonomy
- Justification (one sentence)
</task>

<audit_greps>
${
	greps.length === 0
		? "(none specified — run only the greps the question implies)"
		: greps.map((g) => `- Pattern: \`${g.pattern}\` — ${g.desc}`).join("\n")
}

For each grep result, classify each hit. Don't trust prior classifications without independent re-trace.
</audit_greps>

<output_format>
Write findings to: \`${args.outputPath}\`

**TABLES-ONLY rule (binding)**: NO prose summary section. NO recommendations narrative. NO "executive summary" / "headline findings" / "key findings" / "tldr" / "in conclusion". Aggregation is the orchestrator's job; agent reports cells, orchestrator runs the math. Prose-summary is the layer where LLM aggregation hallucination contradicts the data — eliminated by structural ban.

Structure (use these section headers verbatim; NO additional sections):
- \`# <Title matching the investigation>\`
- \`## Site inventory\` — the full per-site table per output_schema_per_site. EVERY row populated. This is the data; aggregates are computed downstream.
- \`## Audit-grep results\` — one subsection per grep with exact hit count + per-hit classification (table format; no prose interpretation)
- \`## Cross-references\` — bullet list, ONE LINE per existing-arc match (e.g. \`- pi-workflows source PROJECT_DIR imports → Phase 7 cascade target\`). NO narrative.

Return only: file path + 1-line "anti-pattern check passed" or named violation. NO summary, NO counts (orchestrator computes from table), NO interpretation.
</output_format>

<stop_triggers>
- Investigation requires editing source/config — STOP, surface (Explore is read-only)
- A claim cannot be verified by file:line citation — STOP, do not include in report
- Cross-reference reveals existing arc covers the concern — note it; do not escalate as new
- Discovered scope larger than --target — STOP, surface (do not silently expand)
- Required reading file unreadable or missing — STOP, surface
</stop_triggers>

<anti_patterns>
${antiPatterns}
</anti_patterns>

<output_schema_per_site>
${outputSchema}
</output_schema_per_site>

<report_back_format>
Three terse lines:
1. Output file path
2. Headline finding (one sentence)
3. Anti-pattern check: PASS or FAIL (with named violation)
</report_back_format>
`;
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	console.log(buildBrief(args));
}

main();
