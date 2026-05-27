import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runRealChecks } from "./real-check-runner.js";

function makeTmp(prefix = "real-check-"): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

function writePackageJson(dir: string, checkCmd: string, testCmd: string): void {
	const pkg = {
		name: "real-check-fixture",
		version: "0.0.0",
		private: true,
		scripts: { check: checkCmd, test: testCmd },
	};
	writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2));
}

describe("runRealChecks", () => {
	it("empty criteria → passed true, details empty, total_duration_ms >= 0", async () => {
		const tmp = makeTmp();
		const result = await runRealChecks(tmp, "WO-001", {});
		assert.equal(result.passed, true);
		assert.deepEqual(result.details, {});
		assert.ok(result.total_duration_ms >= 0);
		assert.equal(result.work_order_id, "WO-001");
		assert.ok(result.timestamp.includes("T"));
	});

	it("build_check_test true + scripts exit 0 → passed=true, exit_code=0", async () => {
		const tmp = makeTmp();
		writePackageJson(tmp, "echo check-ok", "echo test-ok");
		const result = await runRealChecks(tmp, "WO-002", { build_check_test: true });
		assert.equal(result.passed, true);
		assert.ok(result.details.build_check_test);
		assert.equal(result.details.build_check_test?.passed, true);
		assert.equal(result.details.build_check_test?.exit_code, 0);
		assert.ok(result.details.build_check_test?.stdout.includes("check-ok"));
		assert.ok(result.details.build_check_test?.stdout.includes("test-ok"));
	});

	it("build_check_test true + check fails → passed=false, exit_code≠0, stderr preserved", async () => {
		const tmp = makeTmp();
		writePackageJson(tmp, "echo fake-error 1>&2 && exit 1", "echo never-reached");
		const result = await runRealChecks(tmp, "WO-003", { build_check_test: true });
		assert.equal(result.passed, false);
		assert.equal(result.details.build_check_test?.passed, false);
		assert.notEqual(result.details.build_check_test?.exit_code, 0);
		// npm surfaces script failure on stderr; our injected message appears in one of the streams
		const combined = `${result.details.build_check_test?.stdout}${result.details.build_check_test?.stderr}`;
		assert.ok(combined.includes("fake-error"));
	});

	it("runtime_demo with matching expected substring → passed=true", async () => {
		const tmp = makeTmp();
		const result = await runRealChecks(tmp, "WO-004", {
			runtime_demo: { invocation: "echo hello-world-marker", expected: "hello-world-marker" },
		});
		assert.equal(result.passed, true);
		assert.equal(result.details.runtime_demo?.passed, true);
		assert.ok(result.details.runtime_demo?.output.includes("hello-world-marker"));
	});

	it("runtime_demo with NON-matching expected substring → passed=false, output captured", async () => {
		const tmp = makeTmp();
		const result = await runRealChecks(tmp, "WO-005", {
			runtime_demo: { invocation: "echo actual-output", expected: "different-marker" },
		});
		assert.equal(result.passed, false);
		assert.equal(result.details.runtime_demo?.passed, false);
		assert.ok(result.details.runtime_demo?.output.includes("actual-output"));
		assert.equal(result.details.runtime_demo?.expected, "different-marker");
	});

	it("adversarial_probe with target present → per_target has hits, passed=true", async () => {
		const tmp = makeTmp();
		mkdirSync(join(tmp, "sub"), { recursive: true });
		writeFileSync(join(tmp, "sub", "file.txt"), "this contains MARKER_PRESENT_XYZ somewhere\n");
		const result = await runRealChecks(tmp, "WO-006", {
			adversarial_probe: { targets: ["MARKER_PRESENT_XYZ"] },
		});
		assert.equal(result.passed, true);
		assert.equal(result.details.adversarial_probe?.passed, true);
		assert.equal(result.details.adversarial_probe?.per_target.length, 1);
		assert.ok(result.details.adversarial_probe?.per_target[0]?.hits.includes("MARKER_PRESENT_XYZ"));
	});

	it("adversarial_probe with target absent → per_target.hits empty, passed=false", async () => {
		const tmp = makeTmp();
		writeFileSync(join(tmp, "irrelevant.txt"), "nothing here\n");
		const result = await runRealChecks(tmp, "WO-007", {
			adversarial_probe: { targets: ["MARKER_TOTALLY_ABSENT_QQQ"] },
		});
		assert.equal(result.passed, false);
		assert.equal(result.details.adversarial_probe?.passed, false);
		assert.equal(result.details.adversarial_probe?.per_target[0]?.hits, "");
	});

	it("multiple checks declared, one fails → aggregate passed=false", async () => {
		const tmp = makeTmp();
		const result = await runRealChecks(tmp, "WO-008", {
			runtime_demo: { invocation: "echo ok", expected: "ok" },
			adversarial_probe: { targets: ["MARKER_NOT_PRESENT_ZZZ"] },
		});
		assert.equal(result.passed, false);
		assert.equal(result.details.runtime_demo?.passed, true);
		assert.equal(result.details.adversarial_probe?.passed, false);
	});
});
