/**
 * real-check-runner — deterministic verdict gate for agent-authored work-orders,
 * implementing the real-check verdict step and the attested-commit step that
 * follows a passing verdict, per the rule that tests passing alone is
 * insufficient (a runtime demonstration and an adversarial verification probe
 * are required too) and the rule that an agent's own self-reported status is
 * never the pass/fail verdict — only a real external command's exit code is,
 * as this project's capability-governance model requires. Runs the real-checks
 * declared in a work-order's `real_check_criteria`: build/check/test exit,
 * runtime-demo invocation + expected-substring presence, adversarial-probe
 * grep-based evidence enumeration. Returns a structured RealCheckResult; the
 * orchestrator (or `run-real-checks` Pi tool) interprets the verdict —
 * never the executing agent's self-report.
 *
 * The runner buffers full stdout/stderr (no truncation) and surfaces the
 * raw shell exit code so callers can diagnose. Timeouts terminate the
 * spawned shell via SIGTERM; the captured streams up to that point are
 * preserved and a non-zero exit code is reported.
 */

import { type ChildProcess, spawn } from "node:child_process";

export interface BuildCheckTestResult {
	passed: boolean;
	exit_code: number;
	stdout: string;
	stderr: string;
	duration_ms: number;
}

export interface RuntimeDemoResult {
	passed: boolean;
	output: string;
	expected: string;
	duration_ms: number;
}

export interface AdversarialProbeResult {
	passed: boolean;
	per_target: Array<{ target: string; hits: string }>;
	duration_ms: number;
}

export interface RealCheckCriteria {
	build_check_test?: boolean;
	runtime_demo?: { invocation: string; expected: string };
	adversarial_probe?: { targets: string[] };
}

export interface RealCheckResult {
	passed: boolean;
	work_order_id: string;
	details: {
		build_check_test?: BuildCheckTestResult;
		runtime_demo?: RuntimeDemoResult;
		adversarial_probe?: AdversarialProbeResult;
	};
	total_duration_ms: number;
	timestamp: string;
}

interface ShellResult {
	exitCode: number;
	stdout: string;
	stderr: string;
	durationMs: number;
}

/**
 * Run a shell command via `sh -c <cmd>`, buffering full stdout/stderr.
 * Resolves on close (regardless of exit code); rejects only on spawn-error.
 * Timeout terminates via SIGTERM, preserving captured streams; the eventual
 * non-zero exit code surfaces in the resolved result.
 */
function runShell(cwd: string, cmd: string, timeoutMs: number): Promise<ShellResult> {
	return new Promise((resolve, reject) => {
		const start = Date.now();
		let child: ChildProcess;
		try {
			child = spawn("sh", ["-c", cmd], { cwd, stdio: ["ignore", "pipe", "pipe"] });
		} catch (err) {
			reject(err);
			return;
		}

		let stdout = "";
		let stderr = "";
		child.stdout?.on("data", (chunk: Buffer) => {
			stdout += chunk.toString();
		});
		child.stderr?.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});

		const timer = setTimeout(() => {
			try {
				child.kill("SIGTERM");
			} catch {
				// child may have already exited between timer fire and kill
			}
		}, timeoutMs);

		child.on("error", (err) => {
			clearTimeout(timer);
			reject(err);
		});

		child.on("close", (code, signal) => {
			clearTimeout(timer);
			const durationMs = Date.now() - start;
			// when killed via SIGTERM (timeout), code is null + signal is set;
			// surface a synthetic non-zero exit so callers see a failure.
			const exitCode = code ?? (signal ? 124 : 1);
			resolve({ exitCode, stdout, stderr, durationMs });
		});
	});
}

async function runBCT(cwd: string, timeoutMs: number): Promise<BuildCheckTestResult> {
	// single shell call so the `&&` chain runs sequentially in one process
	const r = await runShell(cwd, "npm run check && npm test", timeoutMs);
	return {
		passed: r.exitCode === 0,
		exit_code: r.exitCode,
		stdout: r.stdout,
		stderr: r.stderr,
		duration_ms: r.durationMs,
	};
}

async function runRD(
	cwd: string,
	demo: { invocation: string; expected: string },
	timeoutMs: number,
): Promise<RuntimeDemoResult> {
	const r = await runShell(cwd, demo.invocation, timeoutMs);
	// pass requires BOTH clean exit and expected-substring presence in stdout —
	// covers the "side-effect masks feature" failure mode where the invocation
	// exits 0 but produces unexpected output, the same failure mode behind the
	// rule that tests passing alone is insufficient and a runtime demonstration
	// is also required.
	const passed = r.exitCode === 0 && r.stdout.includes(demo.expected);
	return {
		passed,
		output: r.stdout,
		expected: demo.expected,
		duration_ms: r.durationMs,
	};
}

async function runAP(cwd: string, targets: string[], timeoutMs: number): Promise<AdversarialProbeResult> {
	const start = Date.now();
	const per_target: Array<{ target: string; hits: string }> = [];
	for (const target of targets) {
		// grep -rn over cwd; exit 1 (no match) is data, not error — captured stdout
		// is the evidence enumeration the orchestrator inspects.
		const r = await runShell(cwd, `grep -rn ${JSON.stringify(target)} .`, timeoutMs);
		per_target.push({ target, hits: r.stdout });
	}
	const passed = per_target.length > 0 && per_target.every((t) => t.hits.length > 0);
	return {
		passed,
		per_target,
		duration_ms: Date.now() - start,
	};
}

/**
 * Run all declared real-checks for a work-order. The criteria object selects
 * which checks fire; absent fields are skipped (not failed). Aggregate
 * `passed` is the AND of every declared check; an empty criteria block
 * passes trivially (no gate declared).
 */
export async function runRealChecks(
	cwd: string,
	work_order_id: string,
	criteria: RealCheckCriteria,
	opts?: { max_check_time_ms?: number },
): Promise<RealCheckResult> {
	const timeoutMs = opts?.max_check_time_ms ?? 600_000;
	const start = Date.now();
	const timestamp = new Date(start).toISOString();
	const details: RealCheckResult["details"] = {};

	if (criteria.build_check_test === true) {
		details.build_check_test = await runBCT(cwd, timeoutMs);
	}
	if (criteria.runtime_demo) {
		details.runtime_demo = await runRD(cwd, criteria.runtime_demo, timeoutMs);
	}
	if (criteria.adversarial_probe?.targets && criteria.adversarial_probe.targets.length > 0) {
		details.adversarial_probe = await runAP(cwd, criteria.adversarial_probe.targets, timeoutMs);
	}

	const declared = [details.build_check_test, details.runtime_demo, details.adversarial_probe].filter(
		(d): d is BuildCheckTestResult | RuntimeDemoResult | AdversarialProbeResult => d !== undefined,
	);
	const passed = declared.every((d) => d.passed);

	return {
		passed,
		work_order_id,
		details,
		total_duration_ms: Date.now() - start,
		timestamp,
	};
}
