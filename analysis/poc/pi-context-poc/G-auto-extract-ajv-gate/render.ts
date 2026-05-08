// POC G — auto-extract with AJV-gate.
//
// Empirically demonstrates the schema-strict variant of pi-memctx's auto-learn:
// classifier emits typed candidate objects (stub here, LLM in production); each
// candidate is validated against its target block's JSON Schema via AJV; the
// gate decides accept vs reject per-candidate, surfacing diagnostic detail
// (including missing required fields, pattern violations, type mismatches)
// for rejected candidates.
//
// This is the only POC in the suite that uses a third-party dep. AJV resolves
// via standard Node module resolution from the monorepo root node_modules
// (same approach as analysis/poc-degree-zero-lens/render.ts:22-25). No new
// install was added. The CJS interop shim mirrors what pi-project's
// schema-validator.ts:7-8 does and what poc-degree-zero-lens uses.
//
// Pipeline:
//   session.jsonl → loadSession → classify (stub) → AJV.validate per candidate
//   → emit accept/reject report → write output/extract-result.md

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ErrorObject, ValidateFunction } from "ajv";
import _Ajv from "ajv";
import { type Candidate, classify, loadSession } from "./classifier.js";

// biome-ignore lint/suspicious/noExplicitAny: ESM/CJS interop for AJV — same shim pi-project uses
const Ajv = (_Ajv as any).default ?? _Ajv;

const POC_DIR = path.dirname(fileURLToPath(import.meta.url));

// ─── schema registry ───

interface SchemaRegistry {
	[targetBlock: string]: {
		schemaPath: string;
		validator: ValidateFunction;
	};
}

function buildSchemaRegistry(): SchemaRegistry {
	// allErrors:true so the malformed-candidate fixture surfaces BOTH the
	// pattern violation on `id` and the missing-required-field violation on
	// `body` in a single pass — the diagnostic richness is part of what the
	// AJV gate buys.
	const ajv = new Ajv({ allErrors: true, strict: false });
	const registry: SchemaRegistry = {};

	const decisionsPath = path.join(POC_DIR, "schemas", "decisions.schema.json");
	const issuesPath = path.join(POC_DIR, "schemas", "issues.schema.json");

	const decisionsSchema = JSON.parse(fs.readFileSync(decisionsPath, "utf8"));
	const issuesSchema = JSON.parse(fs.readFileSync(issuesPath, "utf8"));

	registry.decisions = { schemaPath: decisionsPath, validator: ajv.compile(decisionsSchema) };
	registry.issues = { schemaPath: issuesPath, validator: ajv.compile(issuesSchema) };
	return registry;
}

// ─── gate ───

interface GateResult {
	candidate: Candidate;
	accepted: boolean;
	errors: ErrorObject[];
}

function gate(candidates: Candidate[], registry: SchemaRegistry): GateResult[] {
	const out: GateResult[] = [];
	for (const c of candidates) {
		const entry = registry[c.target_block];
		if (!entry) {
			// No schema registered for the target block — treat as rejected
			// with a synthetic diagnostic. Production would surface this as
			// a classifier-misroute warning separate from AJV diagnostics.
			out.push({
				candidate: c,
				accepted: false,
				errors: [
					{
						instancePath: "",
						schemaPath: "",
						keyword: "no_schema_registered",
						params: { target_block: c.target_block },
						message: `no schema registered for target_block '${c.target_block}'`,
					} as ErrorObject,
				],
			});
			continue;
		}
		const valid = entry.validator(c.payload);
		out.push({
			candidate: c,
			accepted: valid === true,
			errors: valid === true ? [] : [...(entry.validator.errors ?? [])],
		});
	}
	return out;
}

// ─── report ───

function formatErrorRow(err: ErrorObject): string {
	const loc = err.instancePath || "(root)";
	const params = JSON.stringify(err.params ?? {});
	return `\`${loc}\` — ${err.message ?? ""} (keyword: \`${err.keyword}\`, params: \`${params}\`)`;
}

function formatReport(results: GateResult[]): string {
	const lines: string[] = [];
	lines.push("# POC G — auto-extract AJV-gate result");
	lines.push("");
	lines.push("Synthetic 5-turn session → stub classifier → AJV-gate per candidate.");
	lines.push("Each candidate is validated against its target block's JSON Schema.");
	lines.push("");

	const accepted = results.filter((r) => r.accepted);
	const rejected = results.filter((r) => !r.accepted);

	lines.push(`**Total candidates:** ${results.length}`);
	lines.push(`**Accepted:** ${accepted.length}`);
	lines.push(`**Rejected:** ${rejected.length}`);
	lines.push("");

	lines.push("## Per-candidate verdict");
	lines.push("");
	lines.push("| # | target_block | source_turn | candidate id | verdict |");
	lines.push("|---|--------------|-------------|--------------|---------|");
	results.forEach((r, i) => {
		const id = String(r.candidate.payload.id ?? "(no id)");
		const verdict = r.accepted ? "ACCEPTED" : "REJECTED";
		lines.push(`| ${i + 1} | ${r.candidate.target_block} | ${r.candidate.source_turn} | \`${id}\` | ${verdict} |`);
	});
	lines.push("");

	if (accepted.length > 0) {
		lines.push("## Accepted — payload detail");
		lines.push("");
		for (const r of accepted) {
			lines.push(`### \`${String(r.candidate.payload.id)}\` → \`${r.candidate.target_block}\``);
			lines.push("");
			lines.push("```json");
			lines.push(JSON.stringify(r.candidate.payload, null, 2));
			lines.push("```");
			lines.push("");
		}
	}

	if (rejected.length > 0) {
		lines.push("## Rejected — diagnostics");
		lines.push("");
		for (const r of rejected) {
			const id = String(r.candidate.payload.id ?? "(no id)");
			lines.push(`### \`${id}\` → \`${r.candidate.target_block}\``);
			lines.push("");
			lines.push("Payload:");
			lines.push("");
			lines.push("```json");
			lines.push(JSON.stringify(r.candidate.payload, null, 2));
			lines.push("```");
			lines.push("");
			lines.push(`Diagnostics (${r.errors.length}):`);
			lines.push("");
			for (const err of r.errors) {
				lines.push(`- ${formatErrorRow(err)}`);
			}
			lines.push("");
		}
	}

	lines.push("---");
	lines.push("");
	lines.push("Generated by `npx tsx render.ts` from `data/session.jsonl` via stub `classifier.ts`.");
	return lines.join("\n");
}

// ─── main ───

function main(): void {
	console.log("\n=== POC G — auto-extract AJV-gate ===");

	const sessionPath = path.join(POC_DIR, "data", "session.jsonl");
	const turns = loadSession(sessionPath);
	console.log(`Loaded ${turns.length} session turns from ${path.relative(POC_DIR, sessionPath)}`);

	const candidates = classify(turns);
	console.log(`Classifier emitted ${candidates.length} candidate(s):`);
	for (const c of candidates) {
		console.log(`  - turn ${c.source_turn} → ${c.target_block}: ${String(c.payload.id ?? "(no id)")}`);
	}

	const registry = buildSchemaRegistry();
	console.log(`Schema registry built for: [${Object.keys(registry).join(", ")}]`);

	const results = gate(candidates, registry);
	const accepted = results.filter((r) => r.accepted).length;
	const rejected = results.filter((r) => !r.accepted).length;
	console.log(`AJV gate: ${accepted} ACCEPTED, ${rejected} REJECTED`);

	for (const r of results) {
		const id = String(r.candidate.payload.id ?? "(no id)");
		const verdict = r.accepted ? "ACCEPTED" : "REJECTED";
		console.log(`  ${verdict}: ${id} (${r.candidate.target_block})`);
		for (const err of r.errors) {
			console.log(`    - ${err.instancePath || "(root)"} ${err.message} [${err.keyword}]`);
		}
	}

	const outputDir = path.join(POC_DIR, "output");
	fs.mkdirSync(outputDir, { recursive: true });
	const outPath = path.join(outputDir, "extract-result.md");
	fs.writeFileSync(outPath, formatReport(results));
	console.log(`\nWrote ${path.relative(POC_DIR, outPath)}`);
	console.log("POC G complete.");
}

main();
