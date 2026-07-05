#!/usr/bin/env node
/**
 * Driver for pi-project-workflows: build the monorepo, install the operator
 * CLI into a throwaway prefix, and drive both deployable surfaces — the
 * pi-context CLI binary and the pi-runtime tool dispatch — end-to-end against
 * the repo's live substrate (read-only).
 *
 * Usage (from repo root):
 *   node .claude/skills/run-pi-project-workflows/driver.mjs [--skip-promote] [--full]
 *
 *   --skip-promote  reuse the newest existing throwaway prefix from a prior
 *                   run (skips the ~90s build+pack+install)
 *   --full          also run the full test suite at the end
 *
 * Exit code 0 = every non-gated step passed. The pi-dispatch step is GATED
 * (skipped, not failed) when `pi` is not on PATH or ~/.pi/agent/auth.json is
 * absent — it spends real (haiku-priced) model credits when it runs.
 */

import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const args = new Set(process.argv.slice(2));
const results = [];

function step(name, fn) {
	process.stdout.write(`\n=== ${name} ===\n`);
	try {
		const detail = fn();
		results.push({ name, verdict: "PASS", detail });
		console.log(`PASS${detail ? ` — ${detail}` : ""}`);
	} catch (err) {
		results.push({ name, verdict: "FAIL", detail: String(err.message ?? err) });
		console.error(`FAIL — ${err.message ?? err}`);
		summarize();
		process.exit(1);
	}
}

function gated(name, reason) {
	process.stdout.write(`\n=== ${name} ===\n`);
	results.push({ name, verdict: "GATED", detail: reason });
	console.log(`GATED — ${reason}`);
}

function summarize() {
	console.log("\n=== Summary ===");
	for (const r of results) console.log(`  ${r.verdict.padEnd(5)} ${r.name}${r.detail ? ` (${r.detail})` : ""}`);
}

function sh(cmd, opts = {}) {
	return execSync(cmd, { encoding: "utf-8", stdio: "pipe", ...opts });
}

// ---------------------------------------------------------------------------
// 1. Promote the working tree into a throwaway prefix (builds everything).
const PREFIX_ROOT = join(tmpdir(), "run-pi-project-workflows");
let prefix;
if (args.has("--skip-promote")) {
	const prior = existsSync(PREFIX_ROOT) ? readdirSync(PREFIX_ROOT).sort() : [];
	if (prior.length === 0) {
		console.error("--skip-promote: no prior prefix found; run once without it first.");
		process.exit(1);
	}
	prefix = join(PREFIX_ROOT, prior[prior.length - 1]);
	console.log(`Reusing prefix: ${prefix}`);
} else {
	prefix = mkdtempSync(join(PREFIX_ROOT, "prefix-").replace(/^(.*)$/, (s) => {
		execSync(`mkdir -p ${PREFIX_ROOT}`);
		return s;
	}));
	step("promote: build + pack + install into throwaway prefix", () => {
		sh("npm run promote:cli", { env: { ...process.env, PROMOTE_PREFIX: prefix }, stdio: "pipe" });
		return prefix;
	});
}
const BIN = join(prefix, "bin", "pi-context");

// ---------------------------------------------------------------------------
// 2. CLI surface — the packed binary against the repo's live substrate (reads only).
step("cli: --version reports the tree version", () => {
	const v = sh(`${BIN} --version`).trim();
	const tree = JSON.parse(readFileSync("packages/pi-context-cli/package.json", "utf-8")).version;
	if (!v.includes(tree)) throw new Error(`binary reports '${v}', tree is ${tree}`);
	return v;
});

step("cli: context-bootstrap-state resolves the substrate", () => {
	const out = JSON.parse(sh(`${BIN} context-bootstrap-state --json`));
	if (out.ok !== true) throw new Error(JSON.stringify(out).slice(0, 200));
	return `state: ${out.output?.data?.state ?? out.output?.state ?? "reported"}`;
});

step("cli: context-validate returns a verdict", () => {
	const out = JSON.parse(sh(`${BIN} context-validate --json`));
	if (out.ok !== true) throw new Error(JSON.stringify(out).slice(0, 200));
	const status = out.output?.status;
	if (!["clean", "warnings", "invalid"].includes(status)) throw new Error(`unexpected status '${status}'`);
	return `status: ${status}`;
});

step("cli: read-config addresses one registry entry", () => {
	const out = JSON.parse(sh(`${BIN} read-config --registry block_kinds --id tasks --json`));
	if (out.ok !== true || out.output?.data?.canonical_id !== "tasks") throw new Error(JSON.stringify(out).slice(0, 200));
	return "block_kinds/tasks resolved";
});

// ---------------------------------------------------------------------------
// 3. Pi-runtime dispatch — the extensions loaded from THIS tree (package.json
//    `pi.extensions`), driven by a real model turn. Costs real credits; gated.
const piOnPath = spawnSync("pi", ["--version"], { encoding: "utf-8" }).status === 0;
const authPresent = existsSync(join(homedir(), ".pi", "agent", "auth.json"));
if (!piOnPath) {
	gated("pi dispatch: context-status tool via a live model turn", "`pi` not on PATH");
} else if (!authPresent) {
	gated("pi dispatch: context-status tool via a live model turn", "~/.pi/agent/auth.json absent");
} else {
	step("pi dispatch: context-status tool via a live model turn", () => {
		const out = sh(
			'pi -p "call the context-status tool once and then stop" --mode json --no-skills --model openrouter/anthropic/claude-haiku-4.5',
			{ timeout: 240_000 },
		);
		if (!out.includes('"toolName":"context-status"')) throw new Error("no context-status tool_call event in output");
		return "tool dispatched + result returned";
	});
}

// ---------------------------------------------------------------------------
// 4. Optional: full test suite.
if (args.has("--full")) {
	step("tests: npm test (full suite)", () => {
		sh("npm test", { stdio: "pipe", timeout: 900_000 });
		return "exit 0";
	});
}

summarize();
