/**
 * Test runner that works around Node.js v23.7.0 bug where --test flag
 * triggers "run() is being called recursively" and skips all files.
 *
 * Runs each test file as a subprocess without --test, parses the binary
 * TAP output for pass/fail counts, and reports results.
 */
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

const srcDir = path.join(import.meta.dirname, "src");
const files = readdirSync(srcDir)
	.filter((f) => f.endsWith(".test.ts"))
	.sort();

interface Result {
	file: string;
	tests: number;
	passed: number;
	failed: number;
	duration: string;
	error?: string;
}

const results: Result[] = [];
let totalTests = 0;
let totalPassed = 0;
let totalFailed = 0;

for (const file of files) {
	const filePath = path.join(srcDir, file);
	try {
		const output = execFileSync(process.execPath, ["--experimental-strip-types", filePath], {
			encoding: "utf8",
			timeout: 120_000,
			stdio: ["pipe", "pipe", "pipe"],
		});

		// Parse binary TAP output for diagnostics
		// Look for "tests N", "pass N", "fail N", "duration_ms N"
		const testsMatch = output.match(/tests (\d+)/);
		const passMatch = output.match(/pass (\d+)/);
		const failMatch = output.match(/fail (\d+)/);
		const durationMatch = output.match(/duration_ms ([\d.]+)/);

		const tests = testsMatch ? parseInt(testsMatch[1]) : 0;
		const passed = passMatch ? parseInt(passMatch[1]) : 0;
		const failed = failMatch ? parseInt(failMatch[1]) : 0;
		const duration = durationMatch ? `${parseFloat(durationMatch[1]).toFixed(1)}ms` : "?";

		results.push({ file, tests, passed, failed, duration });
		totalTests += tests;
		totalPassed += passed;
		totalFailed += failed;

		const icon = failed > 0 ? "✗" : "✓";
		console.log(`${icon} ${file} (${tests} tests, ${duration})`);
		if (failed > 0) {
			console.log(`  ${failed} failure(s)`);
		}
	} catch (err: any) {
		const stderr = err.stderr?.toString() || "";
		const stdout = err.stdout?.toString() || "";
		const combined = stdout + stderr;

		// Try to extract counts even from failed runs
		const failMatch = combined.match(/fail (\d+)/);
		const failed = failMatch ? parseInt(failMatch[1]) : 1;
		totalFailed += failed;

		// Extract failure details from binary output
		const failureDetails = combined
			.replace(/[^\x20-\x7E\n\r]/g, " ")
			.split("\n")
			.filter((line) => line.includes("FAIL") || line.includes("Error") || line.includes("assert"))
			.slice(0, 5)
			.join("\n  ");

		results.push({ file, tests: 0, passed: 0, failed, error: err.message?.slice(0, 200) });
		console.log(`✗ ${file} — FAILED`);
		if (failureDetails) {
			console.log(`  ${failureDetails}`);
		}
	}
}

console.log("\n" + "─".repeat(60));
console.log(`Total: ${totalTests} tests, ${totalPassed} passed, ${totalFailed} failed (${files.length} files)`);

if (totalFailed > 0) {
	process.exit(1);
}
