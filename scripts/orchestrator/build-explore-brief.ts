#!/usr/bin/env tsx
/**
 * build-explore-brief — full Explore-agent brief composer
 *
 * Programmatically assembles the COMPLETE Explore brief: preamble (mandates +
 * DECs + feedback + tool-surface + output discipline via build-subagent-preamble)
 * + substrate-state context + investigation question + required-reading list +
 * audit-grep targets + output-format scaffold + STOP triggers + anti-pattern
 * reminders. XML-tag structured per the prompt-quality dimension.
 *
 * Goal: dispatch isn't subject to LLM-main-context hedging or laziness.
 * Brief is canonically composed; not hand-typed.
 *
 * Usage:
 *   tsx scripts/orchestrator/build-explore-brief.ts \
 *       --question @/tmp/c3-question.md \
 *       --target packages/pi-workflows \
 *       --output /tmp/explore-c3-fixtures.md \
 *       [--required-reading file1,file2] \
 *       [--audit-greps 'pattern1::desc1,pattern2::desc2']
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
}

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);

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
	return execSync(`tsx ${path.join(SCRIPT_DIR, "build-subagent-preamble.ts")} --type explore`, {
		encoding: "utf-8",
	}).trim();
}

function buildBrief(args: Args): string {
	const state = gitState();
	const preamble = buildPreamble();
	const reading = args.requiredReading ?? [];
	const greps = args.auditGreps ?? [];
	const cwd = process.cwd();

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
- "No-cascade" / "no-resolver-reach" classifications must be independently traced via import chain. Never trust prior audits without re-trace.
- Any \`.project\` mention in production source = (c)/(d)/(e) violation per DEC-0015 strict. Conversation/documentation prose is OUT of scope (per established convention; code/config IS the focus).
- Conditional verdicts forbidden: "could be a real issue if..." / "may not be" / "appears correct" / "likely works". State observed evidence + verdict.
- Filed-then-closed pattern: cross-check escalation candidates against existing arc planning (Phase 6.3, Phase 7, Phase 1.3, etc.) before flagging. Re-litigating already-planned-fixes is anti-pattern.
- Pre-DEC-0015 \`.project\`-as-canon language in YOUR OWN report = self-reproduction of the violation. Use \`<contextDir>\` or \`<substrate dir>\` placeholder.
- **NO BLANKET CLASSIFICATION**: do NOT classify multiple sites with the same verdict for "consistency" / "to be safe" / "uniform application". Each site requires its own per-site trace evidence. The blanket-classification trap is itself a hedge that produces false-pass risk per DEC-0018 (pointer side-effect masks the actual feature being tested).
- **FORBIDDEN JUSTIFICATION PHRASES**: "for consistency" / "to be safe" / "blanket apply" / "all tests need pointer" / "uniform classification" / "applied across the file". If you find yourself reaching for these, classify as INCONCLUSIVE instead — orchestrator decides.
- **NO PATTERN CONTINUATION**: if N consecutive rows received the same classification, the N+1 row is NOT thereby presumed same. Trace the N+1 row independently. Pattern-completion is an LLM tendency that contaminates classification.
- **EXACT INTEGER COUNTS**: report exact counts of mkdtempSync sites, helper functions, etc. Forbidden: "194" when actual is 193; "80+" or "~10" or "approximately N". Exact integers only.
- **INCONCLUSIVE is a legitimate verdict**: when per-site trace cost exceeds your investigation budget, classify INCONCLUSIVE with one-line reason ("import chain ambiguous via dynamic require at line N"). Orchestrator decides next step. Defaulting to safest classification ("config-required because uncertain") is the hedge this rule forbids.
</anti_patterns>

<output_schema_per_site>
**Required columns** for the Site Inventory table — every row MUST populate every column. Empty cells = audit failure:

| File | Line | Helper-or-Inline | Tmpdir-contents | First-resolver-cascading-call (file:line citation) | Classification | One-sentence justification citing the call chain |

**Worked examples** (one per classification):

CONFIG-REQUIRED example (transitive cascade via local import):
\`\`\`
| src/step-block.test.ts | 15 | inline | .project/schemas/foo.schema.json + foo.json | step-block.ts:171 schemaPath(cwd, "foo") → project-dir.ts:51 schemasDir → project-dir.ts:43 resolveContextDir | config-required | step-block.ts:171 calls schemaPath which cascades through resolveContextDir at project-dir.ts:43 |
\`\`\`

NOCONFIG-TEST example (intentional absent-config assertion):
\`\`\`
| src/foo.test.ts | 67 | inline (noconfig variant) | .project/ dir only; no config.json | foo.ts:88 loadConfig(cwd) returns null (config.json absent) | noconfig-test | test asserts result.error matches /config\\.json/; pointer-YES + config-NO preserves intent |
\`\`\`

NO-RESOLVER-REACH example (genuine bypass):
\`\`\`
| src/bar.test.ts | 22 | inline | trace JSONL only | bar.ts:42 writeJsonl (pure function; no pi-context import in chain) | no-resolver-reach | bar.ts imports only fs + path; no @davidorex/pi-context/* in import chain (verified file content); test exercises only writeJsonl |
\`\`\`

INCONCLUSIVE example (audit budget exceeded):
\`\`\`
| src/baz.test.ts | 99 | inline | varies per test | baz.ts:55 dynamicRequire(\`./\${var}.js\`) | INCONCLUSIVE | dynamic require at baz.ts:55 prevents static trace of pi-context reach; orchestrator decides whether to write pointer defensively or split into separate audit |
\`\`\`
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
