#!/usr/bin/env tsx
/**
 * extract-mandates — atomic-element extractor for project mandates
 *
 * POC: emits the 9 known mandates currently surfaced via the UserPromptSubmit
 * hook. SOURCE GAP (FILE AS FGAP): mandates have no canonical block-api home
 * — they live in the hook output payload only, with no project-side substrate
 * file (.project/mandates.json or similar). This POC hardcodes them as a
 * placeholder; a proper resolution moves the mandate list to substrate so this
 * script becomes a thin readBlock wrapper.
 *
 * Usage:
 *   tsx scripts/orchestrator/extract-mandates.ts [--ids mandate-001,mandate-007]
 */
interface Mandate {
	id: string;
	title: string;
	rule: string;
	tags: string[];
}

const MANDATES: Mandate[] = [
	{
		id: "mandate-001",
		title: "No Unauthorized Action",
		rule: "never act without user authorization",
		tags: ["communication"],
	},
	{
		id: "mandate-002",
		title: "No Augmentation",
		rule: "never augment or add to user-given specifications or text.",
		tags: ["communication"],
	},
	{
		id: "mandate-003",
		title: "No Ending Questions",
		rule: "never end your response with a question.",
		tags: ["communication"],
	},
	{
		id: "mandate-004",
		title: "No Negligent Fix Options",
		rule: "Never offer negligent fix options - Don't present options that leave known fragility unaddressed. If root causes identified, only paths that address them are acceptable. No llm laziness.",
		tags: ["anti-laziness", "validation"],
	},
	{
		id: "mandate-005",
		title: "No Manual Implementation Option",
		rule: "Never present manual implementation as option - Manual implementation bypasses workflow tooling. Only happens at explicit user direction, never as llm-suggested alternative.",
		tags: ["anti-laziness", "workflow"],
	},
	{
		id: "mandate-006",
		title: "Invoke Agents",
		rule: "when given a slash command with an agent invocation, invoke the agent. Never attempt to do the agent's work yourself.",
		tags: ["workflow", "anti-laziness"],
	},
	{
		id: "mandate-007",
		title: "No Deferring Discovered Issues",
		rule: "Do not favor deferring discovered issues to an unknown future. If a new issue or bug is found whose neglect creates architectural debt, do NOT claim it is out of scope. User decides scope.",
		tags: ["anti-laziness", "workflow"],
	},
	{
		id: "mandate-008",
		title: "Stop on Subagent Issues",
		rule: "If a subagent returns an issue, STOP. Report to user. User decides next action.",
		tags: ["workflow", "communication"],
	},
	{
		id: "mandate-009",
		title: "No Noise",
		rule: "Do not introduce noise in responses. Stay focused on user task and mandate-compliant action.",
		tags: ["communication", "anti-laziness"],
	},
];

function parseArgs(argv: string[]): { ids?: string[] } {
	const out: { ids?: string[] } = {};
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === "--ids" && argv[i + 1]) {
			out.ids = argv[i + 1].split(",").map((s) => s.trim());
			i++;
		}
	}
	return out;
}

function renderMandate(m: Mandate): string {
	return `- **${m.id} (${m.title})**: ${m.rule}`;
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	let mandates = MANDATES;
	if (args.ids) mandates = mandates.filter((m) => args.ids!.includes(m.id));
	for (const m of mandates) {
		console.log(renderMandate(m));
	}
}

main();
