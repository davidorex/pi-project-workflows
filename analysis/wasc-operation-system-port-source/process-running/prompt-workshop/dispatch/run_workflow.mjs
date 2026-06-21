#!/usr/bin/env node
/**
 * run_workflow.mjs — Claude-Code-invokable headless runner for pi-workflows.
 *
 * A PURE EXTERNAL CONSUMER of the pi-workflows engine. It makes NO change to
 * pi-workflows: it reaches the engine through absolute `file://` dynamic imports
 * of the built `dist/` modules (the package `exports` map is closed — only
 * `file://`/absolute-path imports bypass it; see PI-WORKFLOWS-RUNNER-SURFACE.md
 * §1). The runner productizes the ~40-line programmatic harness recorded in
 * WORKSHOPPING-WORKFLOW-RUNTIME-VERIFICATION.md §"Programmatic-harness reference"
 * and mirrors the flag / auth / exit envelope of
 * `@davidorex/pi-context-cli` (src/cli.ts, src/bin.ts).
 *
 * Commands (SURFACE §2.2):
 *   run    <workflow> [--input <json|@file>] [--fresh]   — auto-resume-or-fresh
 *   resume <workflow> <runId> [--input <json|@file>]     — fail-loud explicit resume
 *   status <workflow>                                     — incomplete-run summary
 *   list                                                  — discovered workflows
 *
 * Global flags (mirror pi-context-cli):
 *   --cwd <dir>            engine cwd; default the wasc project root (DEC-0002).
 *   --json                 single-line envelope on stdout; diagnostics to stderr.
 *   --yes / --force        pre-authorize a gated (side-effecting) run/resume.
 *   --help / -h            top-level or per-command help.
 *
 * Auth gate (SURFACE §2.1, mirrors pi-context-cli authDecision):
 *   `run`/`resume` are gated → allowed with --yes/--force; an interactive TTY
 *   prompts; a NON-INTERACTIVE context (no TTY — e.g. a Claude-Code Bash call)
 *   WITHOUT --yes REFUSES (exit 1). `status`/`list` are read-only, never gated.
 *
 * Exit codes (mirror pi-context-cli bin.ts): 0 success, 1 runtime/refusal,
 * 2 usage error.
 *
 * Agent-step pre-flight (SURFACE §3.4 / TASK-007 / DEC-0003 — agent steps are
 * IN v1): before executeWorkflow, if the spec contains ANY agent step (incl.
 * nested in loop/parallel/forEach), the runner verifies `pi` resolves on PATH
 * and aborts with a clear precondition error naming the offending step if not —
 * so a missing backend surfaces as a stated precondition, not an opaque mid-run
 * failure. Backend/model reachability beyond PATH is best-effort (a real probe
 * is the run itself).
 *
 * ENGINE PROPERTIES the runner does NOT (and must not) fix in pi-workflows,
 * documented here and in --help (SURFACE §2.4):
 *   1. A `command` SUB-STEP inside a `loop` is SILENTLY SKIPPED (step-loop.js
 *      handles only gate/transform/agent). Author command steps at top level.
 *   2. JSON inside a `command:` YAML value needs a single-quoted or block (`|`)
 *      scalar — bare `command: echo '{"ok":true}'` fails YAML parsing.
 *   3. A command step's stdout must be PURE JSON (diagnostics to stderr) or
 *      `.output.<field>` cross-step interpolation silently breaks.
 *   4. A `pause` step surfaces as `status: failed` on the FIRST pass (the
 *      engine's pause-abort races the next step's dispatch) and converges to
 *      `completed` on `resume`. The runner reports this engine behavior
 *      faithfully; it is not a runner defect.
 *
 * @module run_workflow
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline";

// ---------------------------------------------------------------------------
// Engine reachability (SURFACE §1.2 — absolute file:// deep import only)
// ---------------------------------------------------------------------------

/**
 * Default pi-workflows dist base, env-overridable via PI_WORKFLOWS_DIST.
 * The closed `exports` map means bare specifiers do not resolve from this repo;
 * a `file://` URL into the dist modules is the only external import path.
 */
const DIST_BASE =
	process.env.PI_WORKFLOWS_DIST ??
	"/Users/david/Projects/workflowsPiExtension/packages/pi-workflows/dist";

/** The wasc project root — the DEC-0002 default for ctx.cwd / --cwd. */
const DEFAULT_CWD = "/Users/david/Projects/wasc-school-wide-improvement-plan";

/**
 * Dynamically import a dist module by file name from DIST_BASE. A trailing
 * separator is appended so `new URL(name, base)` resolves the file under the
 * dist directory rather than replacing its last path segment.
 */
async function importDist(fileName) {
	const baseUrl = pathToFileURL(path.join(DIST_BASE, "/"));
	const moduleUrl = new URL(fileName, baseUrl);
	return import(moduleUrl.href);
}

/**
 * Load the engine function surface lazily (so `--help` and usage errors never
 * require the engine to be present). Returns the five functions the runner uses.
 */
async function loadEngine() {
	const [executor, spec, discovery, checkpoint, agentSpec] = await Promise.all([
		importDist("workflow-executor.js"),
		importDist("workflow-spec.js"),
		importDist("workflow-discovery.js"),
		importDist("checkpoint.js"),
		importDist("agent-spec.js"),
	]);
	return {
		executeWorkflow: executor.executeWorkflow,
		parseWorkflowSpec: spec.parseWorkflowSpec,
		findWorkflow: discovery.findWorkflow,
		discoverWorkflows: discovery.discoverWorkflows,
		findIncompleteRun: checkpoint.findIncompleteRun,
		validateResumeCompatibility: checkpoint.validateResumeCompatibility,
		createAgentLoader: agentSpec.createAgentLoader,
	};
}

// ---------------------------------------------------------------------------
// Headless ctx / pi literals (SURFACE §3.2 / §3.3 — verified hasUI-safe)
// ---------------------------------------------------------------------------

/**
 * Build the headless WorkflowContext. `hasUI:false` is verified safe — every
 * `ctx.ui.*` access in workflow-executor is hasUI-guarded (SURFACE §3.1). All
 * four ui methods are present (a typed literal must include `setWorkingMessage`,
 * which the engine's own `mockCtx` omits).
 */
function makeCtx(cwd) {
	return {
		cwd,
		hasUI: false,
		ui: {
			setWidget: () => {},
			notify: () => {},
			setStatus: () => {},
			setWorkingMessage: () => {},
		},
	};
}

/**
 * The pi handle is no-op for ALL run kinds. Its only use is the end-of-run
 * result hook (`pi.sendMessage`); it is never the model path — agent steps reach
 * the model by `spawn("pi", …)` as a subprocess (SURFACE §3.3 / §3.4).
 */
function makePi() {
	return { sendMessage: () => {} };
}

// ---------------------------------------------------------------------------
// Error classes + arg coercion (mirrors pi-context-cli cli.ts)
// ---------------------------------------------------------------------------

class UsageError extends Error {}
class RuntimeError extends Error {}

/**
 * Coerce an `--input` value: a leading `@` reads + JSON.parses a file;
 * otherwise the literal is JSON.parsed (pi-context-cli cli.ts:254-262).
 * A parse failure is a UsageError (exit 2).
 */
function coerceJsonArg(flag, value) {
	try {
		return value.startsWith("@")
			? JSON.parse(readFileSync(value.slice(1), "utf8"))
			: JSON.parse(value);
	} catch (err) {
		throw new UsageError(`${flag}: ${err instanceof Error ? err.message : String(err)}`);
	}
}

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

/** Commands that perform a side-effecting (gated) run. */
const GATED = new Set(["run", "resume"]);

/**
 * Parse the argv tail (after the command name) for a command. Returns the
 * parsed flags + positionals. Throws UsageError on unknown flags or missing
 * values. The auth gate is evaluated by the caller after parsing.
 */
function parseArgs(command, argv) {
	const out = {
		cwd: DEFAULT_CWD,
		json: false,
		yes: false,
		help: false,
		fresh: false,
		input: undefined,
		hasInput: false,
		positionals: [],
	};

	for (let i = 0; i < argv.length; i++) {
		const tok = argv[i];
		if (tok === "--help" || tok === "-h") {
			out.help = true;
			continue;
		}
		if (tok === "--json") {
			out.json = true;
			continue;
		}
		if (tok === "--yes" || tok === "--force") {
			out.yes = true;
			continue;
		}
		if (tok === "--fresh") {
			out.fresh = true;
			continue;
		}
		if (tok === "--cwd") {
			const v = argv[++i];
			if (v === undefined) throw new UsageError("--cwd requires a directory argument");
			out.cwd = path.isAbsolute(v) ? v : path.resolve(process.cwd(), v);
			continue;
		}
		if (tok === "--input") {
			const v = argv[++i];
			if (v === undefined) throw new UsageError("--input requires a JSON or @file argument");
			out.input = coerceJsonArg("--input", v);
			out.hasInput = true;
			continue;
		}
		if (tok.startsWith("--")) {
			throw new UsageError(`unknown flag: ${tok}`);
		}
		out.positionals.push(tok);
	}

	return out;
}

// ---------------------------------------------------------------------------
// Auth gate (mirrors pi-context-cli authDecision)
// ---------------------------------------------------------------------------

/**
 * Pure auth decision. `run`/`resume` are gated → `--yes`/`--force` allows; an
 * interactive TTY defers to a prompt; a non-interactive context without `--yes`
 * refuses. `status`/`list` are never gated.
 */
function authDecision(command, { yes, interactive }) {
	if (!GATED.has(command)) return { allow: true };
	if (yes) return { allow: true };
	if (interactive) return { allow: false, needsPrompt: true };
	return {
		allow: false,
		needsPrompt: false,
		reason: `${command} requires authorization; re-run with --yes in a non-interactive context`,
	};
}

/** Prompt on an interactive TTY. Resolves true on y/yes. */
function promptConfirm(command) {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	return new Promise((resolve) => {
		rl.question(`Authorize ${command}? [y/N] `, (answer) => {
			rl.close();
			const a = answer.trim().toLowerCase();
			resolve(a === "y" || a === "yes");
		});
	});
}

// ---------------------------------------------------------------------------
// Agent-step pre-flight (SURFACE §3.4 / TASK-007)
// ---------------------------------------------------------------------------

/**
 * Recursively collect the names of steps that carry an `agent` field, including
 * steps nested inside `loop.steps`, `parallel`, and a `forEach` body (a forEach
 * step's own `agent`/`gate`/etc. fields describe the per-item body). The keyed
 * step name is reported; nested names are qualified `<parent>.<child>`.
 */
function collectAgentSteps(steps, prefix = "") {
	const found = [];
	for (const [name, step] of Object.entries(steps ?? {})) {
		const qualified = prefix ? `${prefix}.${name}` : name;
		if (step && typeof step === "object") {
			if (typeof step.agent === "string" && step.agent.length > 0) {
				found.push(qualified);
			}
			if (step.loop && typeof step.loop === "object" && step.loop.steps) {
				found.push(...collectAgentSteps(step.loop.steps, `${qualified}.loop`));
			}
			if (step.parallel && typeof step.parallel === "object") {
				found.push(...collectAgentSteps(step.parallel, `${qualified}.parallel`));
			}
		}
	}
	return found;
}

/**
 * True if `pi` resolves on PATH. Uses a SHELL-LESS `execFileSync` so an absent
 * binary surfaces as ENOENT directly — a shell probe (`execSync("pi …")`) would
 * report a missing binary as exit 127 ("command not found") from the shell
 * itself, which is indistinguishable here from pi-exists-but-errored. A non-zero
 * exit from a real `pi` (e.g. `--version` unsupported) still proves presence and
 * returns true; only ENOENT (binary not found) / EACCES returns false.
 */
function piOnPath() {
	try {
		execFileSync("pi", ["--version"], { stdio: ["ignore", "ignore", "ignore"] });
		return true;
	} catch (err) {
		const code = err && typeof err === "object" ? err.code : undefined;
		if (code === "ENOENT" || code === "EACCES") return false;
		return true;
	}
}

/**
 * If the spec contains any agent step, require `pi` on PATH. Throws a
 * RuntimeError naming the offending step(s) when absent — converting an opaque
 * mid-run spawn ENOENT into a stated precondition failure.
 */
function preflightAgentSteps(spec) {
	const agentSteps = collectAgentSteps(spec.steps);
	if (agentSteps.length === 0) return;
	if (!piOnPath()) {
		throw new RuntimeError(
			`agent step(s) [${agentSteps.join(", ")}] require the 'pi' CLI on PATH ` +
				`(agent steps spawn 'pi --mode json …' as a subprocess), but 'pi' did not ` +
				`resolve. Install/expose 'pi' and ensure a backend is configured in the ` +
				`environment, then re-run.`,
		);
	}
}

// ---------------------------------------------------------------------------
// Output envelopes
// ---------------------------------------------------------------------------

/** Emit the success envelope (--json) or write the human text (default). */
function emitOk(json, op, output, extra, humanText) {
	if (json) {
		process.stdout.write(`${JSON.stringify({ ok: true, op, ...extra, output })}\n`);
	} else {
		process.stdout.write(`${humanText}\n`);
	}
}

/** Emit the failure envelope (--json) or write the error to stderr (default). */
function emitErr(json, op, message) {
	if (json) {
		process.stdout.write(`${JSON.stringify({ ok: false, op, error: message })}\n`);
	} else {
		process.stderr.write(`error: ${message}\n`);
	}
}

// ---------------------------------------------------------------------------
// Command implementations
// ---------------------------------------------------------------------------

/** `list` — discover all workflows for cwd. Read-only; exit 0. */
async function cmdList(engine, parsed) {
	const specs = engine.discoverWorkflows(parsed.cwd);
	const output = specs.map((s) => ({
		name: s.name,
		description: s.description,
		source: s.source,
	}));
	const humanText =
		output.length === 0
			? "(no workflows found)"
			: output.map((w) => `${w.name}\t[${w.source}]\t${w.description ?? ""}`).join("\n");
	emitOk(parsed.json, "list", output, {}, humanText);
	return 0;
}

/** `status` — summarize the most recent incomplete run for a workflow. */
async function cmdStatus(engine, parsed) {
	const name = parsed.positionals[0];
	if (name === undefined) throw new UsageError("status requires a <workflow> argument");
	const run = engine.findIncompleteRun(parsed.cwd, name);
	const output = run; // IncompleteRun | null
	let humanText;
	if (run === null) {
		humanText = `no incomplete run for '${name}'`;
	} else {
		const failedInfo = run.failedStep ? ` at step '${run.failedStep}'` : "";
		const timeInfo = run.updatedAt ? ` (updated ${run.updatedAt})` : "";
		humanText =
			`incomplete run for '${name}': ${run.state.status}${failedInfo}, ` +
			`${run.completedSteps.length} step(s) completed${timeInfo}. runId: ${run.runId}`;
	}
	emitOk(parsed.json, "status", output, {}, humanText);
	return 0;
}

/**
 * Render a completed/failed/paused WorkflowResult to human text. Per-step lines
 * carry status so a skipped (resume) step is visible.
 */
function renderResultText(result) {
	const lines = [
		`workflow: ${result.workflow}`,
		`runId:    ${result.runId}`,
		`status:   ${result.status}`,
		`runDir:   ${result.runDir}`,
		`duration: ${result.totalDurationMs}ms  cost: ${result.totalUsage?.cost ?? 0}`,
		"steps:",
	];
	for (const [name, r] of Object.entries(result.steps ?? {})) {
		const err = r.error ? `  error: ${r.error}` : "";
		lines.push(`  - ${name}: ${r.status}${err}`);
	}
	if (Array.isArray(result.warnings) && result.warnings.length > 0) {
		lines.push("warnings:");
		for (const w of result.warnings) lines.push(`  - ${w}`);
	}
	return lines.join("\n");
}

/**
 * `run` — findWorkflow → (unless --fresh) auto-resume a compatible incomplete
 * run, else fresh → executeWorkflow. Exit 0 iff status==="completed".
 *
 * findWorkflow returns the already-parsed WorkflowSpec (workflow-discovery
 * internally calls parseWorkflowSpec). The SURFACE §2.2 "findWorkflow →
 * parseWorkflowSpec" is satisfied by that internal parse; re-parsing the same
 * file content would be redundant and could diverge, so the runner uses the
 * spec findWorkflow returns. (This is the one literal-contract reconciliation;
 * see report.)
 */
async function cmdRun(engine, parsed) {
	const name = parsed.positionals[0];
	if (name === undefined) throw new UsageError("run requires a <workflow> argument");

	const spec = engine.findWorkflow(name, parsed.cwd);
	if (spec === undefined) {
		throw new RuntimeError(`workflow '${name}' not found under cwd ${parsed.cwd}`);
	}

	const input = parsed.hasInput ? parsed.input : {};

	// Auto-resume probe (skipped by --fresh). Silent fallback to fresh on an
	// incompatible incomplete run (SURFACE §2.2 auto-resume semantics).
	let resume;
	let resumed = false;
	if (!parsed.fresh) {
		const incomplete = engine.findIncompleteRun(parsed.cwd, name);
		if (incomplete !== null) {
			const incompat = engine.validateResumeCompatibility(incomplete.state, spec);
			if (incompat === null) {
				resume = {
					runId: incomplete.runId,
					runDir: incomplete.runDir,
					state: incomplete.state,
				};
				resumed = true;
			}
		}
	}

	preflightAgentSteps(spec);

	const ctx = makeCtx(parsed.cwd);
	const pi = makePi();
	const loadAgent = engine.createAgentLoader(ctx.cwd);

	const result = await engine.executeWorkflow(spec, input, {
		ctx,
		pi,
		loadAgent,
		signal: undefined,
		...(resume ? { resume } : {}),
	});

	emitOk(
		parsed.json,
		"run",
		result,
		{ resumed, runId: result.runId },
		renderResultText(result),
	);
	return result.status === "completed" ? 0 : 1;
}

/**
 * `resume` — fail-loud explicit resume of an exact runId. Errors (exit 1) on:
 * no incomplete run, runId mismatch, or incompatible state. Input defaults to
 * the original run's input.
 */
async function cmdResume(engine, parsed) {
	const name = parsed.positionals[0];
	const runId = parsed.positionals[1];
	if (name === undefined || runId === undefined) {
		throw new UsageError("resume requires <workflow> and <runId> arguments");
	}

	const spec = engine.findWorkflow(name, parsed.cwd);
	if (spec === undefined) {
		throw new RuntimeError(`workflow '${name}' not found under cwd ${parsed.cwd}`);
	}

	const incomplete = engine.findIncompleteRun(parsed.cwd, name);
	if (incomplete === null) {
		throw new RuntimeError(`no incomplete run to resume for '${name}'`);
	}
	if (incomplete.runId !== runId) {
		throw new RuntimeError(
			`runId mismatch: most recent incomplete run is '${incomplete.runId}', not '${runId}'`,
		);
	}
	const incompat = engine.validateResumeCompatibility(incomplete.state, spec);
	if (incompat !== null) {
		throw new RuntimeError(`cannot resume '${runId}': ${incompat}`);
	}

	const input = parsed.hasInput ? parsed.input : incomplete.state.input;

	preflightAgentSteps(spec);

	const ctx = makeCtx(parsed.cwd);
	const pi = makePi();
	const loadAgent = engine.createAgentLoader(ctx.cwd);

	const result = await engine.executeWorkflow(spec, input, {
		ctx,
		pi,
		loadAgent,
		signal: undefined,
		resume: {
			runId: incomplete.runId,
			runDir: incomplete.runDir,
			state: incomplete.state,
		},
	});

	emitOk(
		parsed.json,
		"resume",
		result,
		{ resumed: true, runId: result.runId },
		renderResultText(result),
	);
	return result.status === "completed" ? 0 : 1;
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function topHelp() {
	return [
		"run_workflow.mjs <command> [flags] — headless pi-workflows runner",
		"",
		"Commands:",
		"  run    <workflow> [--input <json|@file>] [--fresh]   run (auto-resume unless --fresh)",
		"  resume <workflow> <runId> [--input <json|@file>]     explicit fail-loud resume",
		"  status <workflow>                                    summarize the incomplete run",
		"  list                                                 discovered workflows",
		"",
		"Global flags:",
		"  --cwd <dir>            engine cwd (default: wasc project root)",
		"  --json                 single-line { ok, op, output } envelope on stdout",
		"  --yes, --force         pre-authorize gated run/resume in a non-interactive context",
		"  --help, -h             this help, or per-command help after a command",
		"",
		"Auth: run/resume are gated; without a TTY they REFUSE unless --yes is passed.",
		"Exit: 0 success, 1 runtime/refusal, 2 usage error.",
		"",
		"Engine properties (NOT fixed here — author specs accordingly):",
		"  - a `command` SUB-STEP inside a `loop` is silently skipped (use top-level).",
		"  - JSON in a `command:` YAML value needs a single-quoted or block (|) scalar.",
		"  - a command step's stdout must be PURE JSON (diagnostics to stderr).",
		"  - a `pause` step reports status:failed on the first pass and converges to",
		"    completed on `resume` (engine pause-abort races the next dispatch).",
		"",
		`Engine dist: ${DIST_BASE} (override with PI_WORKFLOWS_DIST).`,
	].join("\n");
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

async function main(argv) {
	const command = argv[0];

	if (command === undefined || command === "--help" || command === "-h") {
		process.stdout.write(`${topHelp()}\n`);
		return 0;
	}

	const known = new Set(["run", "resume", "status", "list"]);
	if (!known.has(command)) {
		process.stderr.write(`unknown command: ${command}\n\n${topHelp()}\n`);
		return 2;
	}

	let parsed;
	try {
		parsed = parseArgs(command, argv.slice(1));
	} catch (err) {
		if (err instanceof UsageError) {
			process.stderr.write(`error: ${err.message}\n\n${topHelp()}\n`);
			return 2;
		}
		throw err;
	}

	if (parsed.help) {
		process.stdout.write(`${topHelp()}\n`);
		return 0;
	}

	// Auth gate (run/resume only) — evaluated before touching the engine.
	const decision = authDecision(command, {
		yes: parsed.yes,
		interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
	});
	if (decision.allow === false) {
		if (decision.needsPrompt) {
			const ok = await promptConfirm(command);
			if (!ok) {
				process.stderr.write(`declined: ${command} not authorized\n`);
				return 1;
			}
		} else {
			process.stderr.write(`${decision.reason}\n`);
			return 1;
		}
	}

	let engine;
	try {
		engine = await loadEngine();
	} catch (err) {
		const message = `failed to load pi-workflows engine from ${DIST_BASE}: ${
			err instanceof Error ? err.message : String(err)
		}`;
		emitErr(parsed.json, command, message);
		return 1;
	}

	try {
		switch (command) {
			case "list":
				return await cmdList(engine, parsed);
			case "status":
				return await cmdStatus(engine, parsed);
			case "run":
				return await cmdRun(engine, parsed);
			case "resume":
				return await cmdResume(engine, parsed);
			default:
				process.stderr.write(`unknown command: ${command}\n`);
				return 2;
		}
	} catch (err) {
		if (err instanceof UsageError) {
			process.stderr.write(`error: ${err.message}\n\n${topHelp()}\n`);
			return 2;
		}
		const message = err instanceof Error ? err.message : String(err);
		emitErr(parsed.json, command, message);
		return 1;
	}
}

main(process.argv.slice(2))
	.then((code) => {
		process.exitCode = code;
	})
	.catch((err) => {
		process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
		process.exitCode = 1;
	});
