import assert from "node:assert/strict";
import type { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import fs, { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { SchemaConflict } from "@davidorex/pi-context";
import { checkStatus, installContext } from "@davidorex/pi-context";
import { computeContentHash } from "@davidorex/pi-context/content-hash";
import { writeBootstrapPointer } from "@davidorex/pi-context/context-dir";
import { resolveConflicts } from "./resolve-conflicts.js";

// ── Fake spawn ────────────────────────────────────────────────────────────────
// Records every invocation and resolves a clean exit-0 child on the next
// microtask (copied from pi-bound.test.ts:27). runPiBound spawns twice per
// dispatch: `pi install -l <metaRoot>` then `pi --tools <csv> ...passthrough`.
interface SpawnCall {
	command: string;
	args: string[];
	cwd?: string;
}
function makeFakeSpawn(): { spawn: typeof spawn; calls: SpawnCall[] } {
	const calls: SpawnCall[] = [];
	const fake = ((command: string, args: string[], opts: { cwd?: string }) => {
		calls.push({ command, args, cwd: opts?.cwd });
		const child = new EventEmitter();
		queueMicrotask(() => child.emit("exit", 0));
		return child;
	}) as unknown as typeof spawn;
	return { spawn: fake, calls };
}

// A writing fake spawn that, on the `pi -p` mergetool launch (NOT the prior
// `pi install -l` call), mutates the installed `tasks` schema file to a
// reconciled body BEFORE emitting exit-0 — modelling an agent that actually
// reconciled + wrote. `reconcile(installedPath)` performs the write and returns
// the reconciled body so the test can assert the re-stamped baseline hash.
function makeWritingFakeSpawn(reconcile: (installedPath: string) => Record<string, unknown>): {
	spawn: typeof spawn;
	calls: SpawnCall[];
	reconciledBody: () => Record<string, unknown> | null;
} {
	const calls: SpawnCall[] = [];
	let reconciled: Record<string, unknown> | null = null;
	const fake = ((command: string, args: string[], opts: { cwd?: string }) => {
		calls.push({ command, args, cwd: opts?.cwd });
		const child = new EventEmitter();
		// Only the `-p` launch represents the mergetool agent writing a draft; the
		// first spawn is `pi install -l <metaRoot>` and writes nothing.
		if (args.includes("-p") && opts?.cwd) {
			const installedPath = path.join(opts.cwd, ".project", "schemas", "tasks.schema.json");
			reconciled = reconcile(installedPath);
		}
		queueMicrotask(() => child.emit("exit", 0));
		return child;
	}) as unknown as typeof spawn;
	return { spawn: fake, calls, reconciledBody: () => reconciled };
}

// Read `config.installed_from.assets.tasks.content_hash` from the substrate's
// config — the recorded install baseline the resolver may (or may not) re-stamp.
function readBaselineHash(cwd: string): string | undefined {
	const config = JSON.parse(fs.readFileSync(path.join(cwd, ".project", "config.json"), "utf-8")) as {
		installed_from?: { assets?: Record<string, { content_hash?: string }> };
	};
	return config.installed_from?.assets?.tasks?.content_hash;
}

// A skillRoot with one SKILL.md declaring tools, so runPiBound's static-tool
// derivation is non-empty (the empty-set guard would otherwise abort) without
// depending on the built monorepo skill state (mirrors pi-bound.test.ts).
function seedSkillRoot(): string {
	const root = mkdtempSync(path.join(tmpdir(), "resolve-skill-"));
	const dir = path.join(root, "skills", "alpha");
	mkdirSync(dir, { recursive: true });
	writeFileSync(path.join(dir, "SKILL.md"), '<tool name="read-schema"></tool>\n<tool name="write-schema"></tool>');
	return root;
}

function captureStream(): { stream: NodeJS.WritableStream; text: () => string } {
	let buf = "";
	const stream = {
		write: (chunk: string) => {
			buf += chunk;
			return true;
		},
	} as unknown as NodeJS.WritableStream;
	return { stream, text: () => buf };
}

function sink(): NodeJS.WritableStream {
	return { write: () => true } as unknown as NodeJS.WritableStream;
}

// ── both-diverged tasks substrate (mirrors install-subcommand.test.ts) ─────────
// Forms BASE ≠ baseline-catalog and OURS ≠ BASE so getConflictMergeInputs
// resolves real base/ours/theirs bodies for the dispatched mergetool prompt.
const TASKS_ITEM_PROPS = ["properties", "tasks", "items", "properties"] as const;
function deepGet(obj: Record<string, unknown>, segs: readonly string[]): Record<string, unknown> {
	let cur: Record<string, unknown> = obj;
	for (const seg of segs) cur = cur[seg] as Record<string, unknown>;
	return cur;
}
function makeBothDivergedSubstrate(): string {
	const dir = mkdtempSync(path.join(tmpdir(), "resolve-substrate-"));
	writeBootstrapPointer(dir, ".project");
	mkdirSync(path.join(dir, ".project", "schemas"), { recursive: true });
	writeFileSync(
		path.join(dir, ".project", "config.json"),
		JSON.stringify(
			{
				schema_version: "1.0.0",
				root: ".project",
				block_kinds: [],
				lenses: [],
				installed_schemas: ["tasks"],
				installed_blocks: [],
			},
			null,
			2,
		),
	);
	const dest = path.join(dir, ".project", "schemas", "tasks.schema.json");
	installContext(dir);
	// Form BASE: change notes.type → "number" (diverging from catalog "string"),
	// re-install to re-baseline from it.
	const baseObj = JSON.parse(fs.readFileSync(dest, "utf-8")) as Record<string, unknown>;
	(deepGet(baseObj, TASKS_ITEM_PROPS).notes as Record<string, unknown>).type = "number";
	writeFileSync(dest, JSON.stringify(baseObj, null, 2));
	installContext(dir);
	// Form OURS: change the SAME node → "boolean". All three differ → conflict.
	const oursObj = JSON.parse(fs.readFileSync(dest, "utf-8")) as Record<string, unknown>;
	(deepGet(oursObj, TASKS_ITEM_PROPS).notes as Record<string, unknown>).type = "boolean";
	writeFileSync(dest, JSON.stringify(oursObj, null, 2));
	return dir;
}

const CONFLICT_PATH = "properties.tasks.items.properties.notes.type";
const oneConflict: Array<{ name: string; conflicts: SchemaConflict[] }> = [
	{ name: "tasks", conflicts: [{ path: CONFLICT_PATH, base: "number", ours: "boolean", theirs: "string" }] },
];

// ── 1. interactive + one conflict → dispatches pi -p with the prompt ──────────
test("interactive: dispatches pi-bound mergetool with a -p prompt embedding the schema name + conflict path", async () => {
	const cwd = makeBothDivergedSubstrate();
	const skillRoot = seedSkillRoot();
	const { spawn: fakeSpawn, calls } = makeFakeSpawn();
	try {
		assert.equal(
			checkStatus(cwd).perAsset.find((a) => a.name === "tasks")?.state,
			"both-diverged",
			"precondition: tasks must be both-diverged so merge inputs resolve",
		);
		const baselineBefore = readBaselineHash(cwd);
		const result = await resolveConflicts(oneConflict, {
			cwd,
			interactive: true,
			spawn: fakeSpawn,
			stderr: sink(),
			skillRoots: [skillRoot],
		});
		// The launch is the spawn whose args carry `-p` (the install call has no -p).
		const launch = calls.find((c) => c.args.includes("-p"));
		assert.ok(launch, "a `pi -p <prompt>` mergetool launch must have been spawned");
		assert.equal(launch.command, "pi", "the launch command is pi");
		const pIdx = launch.args.indexOf("-p");
		const prompt = launch.args[pIdx + 1];
		assert.match(prompt, /"tasks"/, "the prompt names the conflicting schema");
		assert.match(prompt, new RegExp(CONFLICT_PATH.replace(/\./g, "\\.")), "the prompt embeds the conflict path");
		assert.match(prompt, /write-schema/, "the prompt instructs writing via write-schema");
		// The no-op fake spawn writes NOTHING, so the installed body's on-disk hash is
		// identical before and after the session. The resolver decides from that
		// before/after snapshot — not from the body-vs-baseline comparison — so a
		// byte-unchanged session is `unresolved`, and the baseline is left at BASE (no
		// silent re-stamp of OURS). The conflict survives to the next update.
		assert.deepEqual(result.unresolved, ["tasks"], "a no-op (no-write) session is unresolved");
		assert.deepEqual(result.resolved, [], "nothing is resolved when the mergetool wrote nothing");
		assert.equal(readBaselineHash(cwd), baselineBefore, "the baseline must be UNCHANGED — no silent re-stamp");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
		rmSync(skillRoot, { recursive: true, force: true });
	}
});

// ── 1b. interactive + the mergetool WRITES a reconciled body → resolved ───────
test("interactive: a session that writes a reconciled body resolves + re-stamps the baseline to the new on-disk body", async () => {
	const cwd = makeBothDivergedSubstrate();
	const skillRoot = seedSkillRoot();
	// On the `-p` launch, mutate the installed body's conflicting node to a third
	// distinct value ("integer"; BASE=number / OURS=boolean / THEIRS=string), write
	// it back, and return the reconciled body for the re-stamp assertion.
	const { spawn: writingSpawn, reconciledBody } = makeWritingFakeSpawn((installedPath) => {
		const body = JSON.parse(fs.readFileSync(installedPath, "utf-8")) as Record<string, unknown>;
		(deepGet(body, TASKS_ITEM_PROPS).notes as Record<string, unknown>).type = "integer";
		fs.writeFileSync(installedPath, JSON.stringify(body, null, 2));
		return body;
	});
	try {
		const baselineBefore = readBaselineHash(cwd);
		const result = await resolveConflicts(oneConflict, {
			cwd,
			interactive: true,
			spawn: writingSpawn,
			stderr: sink(),
			skillRoots: [skillRoot],
		});
		assert.deepEqual(result.resolved, ["tasks"], "a session that changed the installed body resolves");
		assert.deepEqual(result.unresolved, [], "nothing falls into unresolved when the body changed");
		const body = reconciledBody();
		assert.ok(body, "the writing spawn must have run on the -p launch");
		// The baseline must be re-stamped to the NEW on-disk body's content hash, not
		// the old OURS hash and not the prior baseline.
		const expected = computeContentHash(body);
		assert.equal(readBaselineHash(cwd), expected, "the baseline is re-stamped to the reconciled body's hash");
		assert.notEqual(readBaselineHash(cwd), baselineBefore, "the re-stamped baseline differs from the prior baseline");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
		rmSync(skillRoot, { recursive: true, force: true });
	}
});

// ── 2. non-interactive → NO spawn, renders the report to stdout ───────────────
test("non-interactive: renders the conflict report to stdout and spawns nothing", async () => {
	const { spawn: fakeSpawn, calls } = makeFakeSpawn();
	const out = captureStream();
	const result = await resolveConflicts(oneConflict, {
		cwd: "/nonexistent-cwd-never-read",
		interactive: false,
		spawn: fakeSpawn,
		stdout: out.stream,
		stderr: sink(),
	});
	assert.equal(calls.length, 0, "the non-interactive surface must NOT spawn");
	assert.match(out.text(), /tasks \(1 conflict\)/, "the report names the schema");
	assert.match(out.text(), new RegExp(CONFLICT_PATH.replace(/\./g, "\\.")), "the report lists the conflict path");
	assert.deepEqual(result.reported, ["tasks"], "the schema is recorded as reported");
	assert.deepEqual(result.resolved, [], "non-interactive resolves nothing");
});

// ── 3. interactive but getConflictMergeInputs returns null → no throw ─────────
test("interactive: a schema with no retrievable merge inputs is reported, the loop never throws", async () => {
	// An empty tmp substrate with NO baseline for `tasks` → getConflictMergeInputs
	// returns null → the schema is reported + skipped (no spawn, no throw).
	const cwd = mkdtempSync(path.join(tmpdir(), "resolve-null-"));
	writeBootstrapPointer(cwd, ".project");
	mkdirSync(path.join(cwd, ".project", "schemas"), { recursive: true });
	writeFileSync(
		path.join(cwd, ".project", "config.json"),
		JSON.stringify({ schema_version: "1.0.0", root: ".project", block_kinds: [], lenses: [] }, null, 2),
	);
	const { spawn: fakeSpawn, calls } = makeFakeSpawn();
	const err = captureStream();
	try {
		const result = await resolveConflicts(oneConflict, {
			cwd,
			interactive: true,
			spawn: fakeSpawn,
			stderr: err.stream,
		});
		assert.equal(calls.length, 0, "no merge inputs → no mergetool dispatched");
		assert.deepEqual(result.reported, ["tasks"], "the schema falls back to reported");
		assert.deepEqual(result.resolved, [], "nothing resolved");
		assert.deepEqual(result.unresolved, [], "a reported-fallback is not unresolved");
		assert.match(err.text(), /no retrievable merge inputs/, "a diagnostic note is written");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

// ── 4. empty conflict set → empty result, no spawn ────────────────────────────
test("an empty conflict set returns an empty result and spawns nothing", async () => {
	const { spawn: fakeSpawn, calls } = makeFakeSpawn();
	const result = await resolveConflicts([], { cwd: "/unused", interactive: true, spawn: fakeSpawn, stderr: sink() });
	assert.equal(calls.length, 0);
	assert.deepEqual(result, { resolved: [], unresolved: [], reported: [] });
});
