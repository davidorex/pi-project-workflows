// POC G — classifier stub.
//
// Reads the synthetic 5-turn session.jsonl and emits hardcoded candidate objects
// matching what a real LLM classifier WOULD extract from the session content.
// No LLM call: the mapping from session turns to candidate objects is fixed in
// this file so the POC focuses strictly on the AJV-gate behavior, not on
// classifier quality.
//
// The fixture is intentionally constructed so that:
//   - turn 2 yields a valid DEC-* candidate (DEC-0099)
//   - turn 4 yields a valid issue-* candidate (issue-091)
//   - turn 5 yields a malformed issue-* candidate (issue-XYZ) — id pattern
//     violates ^issue-\d{3}$ AND the required `body` field is absent. AJV
//     reports BOTH violations under allErrors:true.
//
// Real implementation (out of scope for POC G) would replace this stub with
// an LLM call constrained by a phantom-tool schema, with the same downstream
// AJV-gate stage in render.ts unchanged. That symmetry is the point.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const POC_DIR = path.dirname(fileURLToPath(import.meta.url));

export interface SessionTurn {
	turn: number;
	role: string;
	ts: string;
	content: string;
}

export interface Candidate {
	target_block: "decisions" | "issues";
	source_turn: number;
	payload: Record<string, unknown>;
}

export function loadSession(jsonlPath: string): SessionTurn[] {
	const raw = fs.readFileSync(jsonlPath, "utf8");
	const lines = raw.split("\n").filter((l) => l.trim().length > 0);
	return lines.map((l) => JSON.parse(l) as SessionTurn);
}

// Stub classifier: hardcoded extraction. In production this would be the
// per-turn LLM call producing structured output via the phantom-tool pattern.
export function classify(turns: SessionTurn[]): Candidate[] {
	const turnIndex = new Map(turns.map((t) => [t.turn, t]));

	// Touch the loaded turns so the stub demonstrably consumes session data
	// rather than ignoring it. A real classifier would read content; this
	// stub only verifies turns 2, 4, 5 are present in the input.
	for (const t of [2, 4, 5]) {
		if (!turnIndex.has(t)) {
			throw new Error(`Stub classifier expected turn ${t} in session, not found`);
		}
	}

	return [
		{
			target_block: "decisions",
			source_turn: 2,
			payload: {
				id: "DEC-0099",
				title: "Extend LensSpec with kind + members for lens-of-lenses composition",
				status: "enacted",
				body: "LensSpec gains `kind: atomic | composite` and `members: string[]` for composite lenses. Atomic lenses retain current shape; composite lenses reference member lens ids.",
				phase: "substrate-arc",
			},
		},
		{
			target_block: "issues",
			source_turn: 4,
			payload: {
				id: "issue-091",
				title: "AJV schema cache returns stale validation after schema-file mtime change",
				status: "open",
				body: "Reproduce: edit schemas/foo.schema.json, then re-run validation in the same process — AJV's compiled-schema cache returns errors against the prior schema version. Cache invalidation should key on schema-file mtime or content hash, not just $id.",
				priority: "medium",
			},
		},
		{
			target_block: "issues",
			source_turn: 5,
			payload: {
				// Malformed: id violates ^issue-\d{3}$ pattern AND `body` is absent.
				// AJV under allErrors:true reports both diagnostics.
				id: "issue-XYZ",
				title: "Post-step snapshot diff occasionally empty under write contention",
				status: "open",
			},
		},
	];
}

// CLI entry point so the classifier can be inspected standalone:
//   npx tsx classifier.ts
// Prints the candidate array as JSON; render.ts also imports classify() directly.
function main(): void {
	const sessionPath = path.join(POC_DIR, "data", "session.jsonl");
	const turns = loadSession(sessionPath);
	const candidates = classify(turns);
	console.log(JSON.stringify(candidates, null, 2));
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
