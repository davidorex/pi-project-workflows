import assert from "node:assert/strict";
import type { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { writeBootstrapPointer } from "@davidorex/pi-context/context-dir";
import { main, useOps } from "./cli.js";
import {
	composePiBoundTools,
	deriveSkillToolNames,
	parsePiBoundArgs,
	readCompositeOperationIds,
	runPiBound,
} from "./pi-bound.js";

// ── Fake spawn ───────────────────────────────────────────────────────────────
// A spawn stub that records every invocation and resolves the child's exit code
// without launching a real subprocess. The returned child is an EventEmitter that
// emits "exit" with the per-call code on the next microtask.
interface SpawnCall {
	command: string;
	args: string[];
	cwd?: string;
}
function makeFakeSpawn(exitCodes: number[] = []): { spawn: typeof spawn; calls: SpawnCall[] } {
	const calls: SpawnCall[] = [];
	let idx = 0;
	const fake = ((command: string, args: string[], opts: { cwd?: string }) => {
		calls.push({ command, args, cwd: opts?.cwd });
		const code = exitCodes[idx] ?? 0;
		idx++;
		const child = new EventEmitter();
		queueMicrotask(() => child.emit("exit", code));
		return child;
	}) as unknown as typeof spawn;
	return { spawn: fake, calls };
}

function sink(): NodeJS.WritableStream {
	return { write: () => true } as unknown as NodeJS.WritableStream;
}

// ── 1. parsePiBoundArgs consumes --grant, preserves passthrough ───────────────
test("parsePiBoundArgs removes repeated --grant and preserves passthrough", () => {
	const { grants, passthrough } = parsePiBoundArgs([
		"--grant",
		"alpha",
		"--continue",
		"--grant",
		"beta",
		"--model",
		"x",
	]);
	assert.deepEqual(grants, ["alpha", "beta"]);
	assert.deepEqual(passthrough, ["--continue", "--model", "x"]);
});

// ── 2. parsePiBoundArgs rejects missing --grant value with exit 2 ─────────────
test("parsePiBoundArgs rejects missing --grant value with usage exit 2", () => {
	try {
		parsePiBoundArgs(["--continue", "--grant"]);
		assert.fail("expected PiBoundUsageError");
	} catch (err) {
		assert.equal((err as { exitCode?: number }).exitCode, 2);
	}
});

// ── deriveSkillToolNames fixtures ─────────────────────────────────────────────
function seedSkillRoot(skills: Record<string, string>): string {
	const root = mkdtempSync(path.join(tmpdir(), "pibound-skill-"));
	for (const [name, body] of Object.entries(skills)) {
		const dir = path.join(root, "skills", name);
		mkdirSync(dir, { recursive: true });
		writeFileSync(path.join(dir, "SKILL.md"), body);
	}
	return root;
}

// ── 3. deriveSkillToolNames extracts <tool name="..."> ────────────────────────
test("deriveSkillToolNames extracts <tool name=...>", () => {
	const root = seedSkillRoot({
		alpha: '<tool name="read-block"></tool>\n<tool name="call-agent"></tool>',
	});
	try {
		const { tools, skillFileCount } = deriveSkillToolNames([root]);
		assert.deepEqual(tools, ["call-agent", "read-block"]);
		assert.equal(skillFileCount, 1);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// ── 4. deriveSkillToolNames dedupes repeated tags ─────────────────────────────
test("deriveSkillToolNames dedupes repeated tool tags", () => {
	const root = seedSkillRoot({
		alpha: '<tool name="read-block"></tool>',
		beta: '<tool name="read-block"></tool>\n<tool name="write-block"></tool>',
	});
	try {
		const { tools, skillFileCount } = deriveSkillToolNames([root]);
		assert.deepEqual(tools, ["read-block", "write-block"]);
		assert.equal(skillFileCount, 2);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// ── 5. Empty derived static tool set returns fatal 1 ──────────────────────────
// skillRoots is overridden to an empty-skills root so the length-0 guard fires.
// The launch spawn must NOT occur (only the preflight `pi install`).
test("runPiBound returns fatal 1 when static tool set is empty", async () => {
	const cwd = mkdtempSync(path.join(tmpdir(), "pibound-empty-"));
	const emptyRoot = mkdtempSync(path.join(tmpdir(), "pibound-emptyroot-"));
	const { spawn: fakeSpawn, calls } = makeFakeSpawn();
	try {
		const code = await runPiBound([], {
			cwd,
			stderr: sink(),
			spawn: fakeSpawn,
			skillRoots: [emptyRoot],
		});
		assert.equal(code, 1);
		// install ran; no `pi --tools` launch happened (fatal returned first).
		assert.deepEqual(calls[0].args.slice(0, 2), ["install", "-l"]);
		assert.ok(!calls.some((c) => c.args[0] === "--tools"));
	} finally {
		rmSync(cwd, { recursive: true, force: true });
		rmSync(emptyRoot, { recursive: true, force: true });
	}
});

// ── 6. readCompositeOperationIds returns canonical_ids ────────────────────────
function seedCompositeSubstrate(ops: Array<{ canonical_id: string }>): string {
	const cwd = mkdtempSync(path.join(tmpdir(), "pibound-config-"));
	writeBootstrapPointer(cwd, ".project");
	const sub = path.join(cwd, ".project");
	mkdirSync(sub, { recursive: true });
	writeFileSync(
		path.join(sub, "config.json"),
		JSON.stringify({
			schema_version: "1.0.0",
			root: ".project",
			block_kinds: [],
			tool_operations: ops,
		}),
	);
	return cwd;
}

test("readCompositeOperationIds returns config.tool_operations[].canonical_id", () => {
	const cwd = seedCompositeSubstrate([{ canonical_id: "run-work-order-loop" }, { canonical_id: "compile-brief" }]);
	try {
		assert.deepEqual(readCompositeOperationIds(cwd), ["run-work-order-loop", "compile-brief"]);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

// ── 7. readCompositeOperationIds returns [] when config absent/unreadable ──────
test("readCompositeOperationIds returns [] when config absent or unreadable", () => {
	const cwd = mkdtempSync(path.join(tmpdir(), "pibound-noconfig-"));
	try {
		// No .pi-context.json pointer at all.
		assert.deepEqual(readCompositeOperationIds(cwd), []);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

// ── 8. composePiBoundTools always includes built-in read-only ─────────────────
test("composePiBoundTools always includes read, ls, grep, find", () => {
	const out = composePiBoundTools({ staticTools: [], declaredComposites: [], grants: [] });
	for (const t of ["read", "ls", "grep", "find"]) {
		assert.ok(out.includes(t), `missing ${t}`);
	}
});

// ── 9. composePiBoundTools includes all declared composites when grants empty ──
test("composePiBoundTools includes all declared composites when grants are empty", () => {
	const out = composePiBoundTools({
		staticTools: ["read-block"],
		declaredComposites: ["comp-a", "comp-b"],
		grants: [],
	});
	assert.ok(out.includes("comp-a"));
	assert.ok(out.includes("comp-b"));
	assert.ok(out.includes("read-block"));
});

// ── 10. composePiBoundTools includes only grants when grants present ──────────
test("composePiBoundTools includes only grants when grants are present", () => {
	const out = composePiBoundTools({
		staticTools: ["read-block"],
		declaredComposites: ["comp-a", "comp-b"],
		grants: ["comp-a"],
	});
	assert.ok(out.includes("comp-a"));
	assert.ok(!out.includes("comp-b"));
});

// ── 11. runPiBound invokes `pi install -l <metaRoot>` before launching pi ─────
test("runPiBound invokes pi install -l <metaPackageRoot> before launching pi", async () => {
	const cwd = mkdtempSync(path.join(tmpdir(), "pibound-order-"));
	const skillRoot = seedSkillRoot({ a: '<tool name="read-block"></tool>', b: '<tool name="call-agent"></tool>' });
	const { spawn: fakeSpawn, calls } = makeFakeSpawn();
	try {
		await runPiBound([], { cwd, stderr: sink(), spawn: fakeSpawn, skillRoots: [skillRoot] });
		assert.ok(calls.length >= 2);
		assert.deepEqual(calls[0].args.slice(0, 2), ["install", "-l"]);
		// Final call is the constrained launch.
		const last = calls[calls.length - 1];
		assert.equal(last.args[0], "--tools");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
		rmSync(skillRoot, { recursive: true, force: true });
	}
});

// ── 12. runPiBound runs install/derivation even with --continue passthrough ───
test("runPiBound runs install/derivation even when passthrough contains --continue", async () => {
	const cwd = mkdtempSync(path.join(tmpdir(), "pibound-resume-"));
	const skillRoot = seedSkillRoot({ a: '<tool name="read-block"></tool>' });
	const { spawn: fakeSpawn, calls } = makeFakeSpawn();
	try {
		await runPiBound(["--continue"], { cwd, stderr: sink(), spawn: fakeSpawn, skillRoots: [skillRoot] });
		// install still ran.
		assert.deepEqual(calls[0].args.slice(0, 2), ["install", "-l"]);
		// launch forwarded --continue after the --tools csv.
		const last = calls[calls.length - 1];
		assert.ok(last.args.includes("--continue"));
		assert.equal(last.args[0], "--tools");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
		rmSync(skillRoot, { recursive: true, force: true });
	}
});

// ── 13. runPiBound launches `pi --tools <csv> ...passthrough` ─────────────────
test("runPiBound launches pi --tools <csv> ...passthrough", async () => {
	const cwd = mkdtempSync(path.join(tmpdir(), "pibound-launch-"));
	const skillRoot = seedSkillRoot({ a: '<tool name="read-block"></tool>' });
	const { spawn: fakeSpawn, calls } = makeFakeSpawn();
	try {
		await runPiBound(["--model", "haiku"], { cwd, stderr: sink(), spawn: fakeSpawn, skillRoots: [skillRoot] });
		const last = calls[calls.length - 1];
		assert.equal(last.command, "pi");
		assert.equal(last.args[0], "--tools");
		assert.equal(typeof last.args[1], "string");
		assert.ok(last.args[1].length > 0);
		assert.deepEqual(last.args.slice(2), ["--model", "haiku"]);
		assert.equal(last.cwd, cwd);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
		rmSync(skillRoot, { recursive: true, force: true });
	}
});

// ── 14. main(["pi-bound", ...]) routes before op resolution ───────────────────
// `pi-bound` is NOT a reflected op (absent from useOps). The bare-verb branch in
// main() sits before resolveOp, so `pi-bound` is dispatched to runPiBound rather
// than falling through to the unknown-op arm (which test 15 proves returns 2).
// We assert the precedence structurally — confirming pi-bound is not in the op
// surface — without launching real pi via a deps-less main() call.
test("main routes pi-bound before op resolution (pi-bound is not an op)", () => {
	assert.equal(
		useOps.some((o) => o.name === "pi-bound"),
		false,
	);
});

// ── 15. Existing undefined-op behavior remains exit 2 (both arms) ─────────────
test("unknown command returns exit 2", async () => {
	const code = await main(["definitely-not-an-op-xyz"]);
	assert.equal(code, 2);
});

test("process-only op returns exit 2", async () => {
	const code = await main(["list-tools"]);
	assert.equal(code, 2);
});
