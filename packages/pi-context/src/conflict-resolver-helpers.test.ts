import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { computeFileContentHash } from "./content-hash.js";
import { loadConfig } from "./context.js";
import { writeBootstrapPointer } from "./context-dir.js";
import {
	checkStatus,
	getConflictMergeInputs,
	installContext,
	refreshBaselineForSchema,
	renderConflicts,
} from "./index.js";
import { getObject } from "./object-store.js";

// Mirrors install-subcommand.test.ts makeProject — a tmp substrate at .project
// with the named schemas declared so installContext populates + baselines them.
let tmpRoot: string;

function makeProject(installedSchemas: string[] = []): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-context-resolver-"));
	writeBootstrapPointer(dir, ".project");
	fs.mkdirSync(path.join(dir, ".project", "schemas"), { recursive: true });
	const config = {
		schema_version: "1.0.0",
		root: ".project",
		block_kinds: [],
		lenses: [],
		installed_schemas: installedSchemas,
		installed_blocks: [],
	};
	fs.writeFileSync(path.join(dir, ".project", "config.json"), JSON.stringify(config, null, 2));
	return dir;
}

const TASKS_ITEM_PROPS = ["properties", "tasks", "items", "properties"] as const;
function deepGet(obj: Record<string, unknown>, segs: readonly string[]): Record<string, unknown> {
	let cur: Record<string, unknown> = obj;
	for (const seg of segs) cur = cur[seg] as Record<string, unknown>;
	return cur;
}

/**
 * Build a `both-diverged` tasks fixture (BASE ≠ baseline-catalog, OURS ≠ BASE) —
 * the SAME construction install-subcommand.test.ts's makeBothDivergedTasks uses.
 * `baseMut` forms BASE (re-installed → baselined, diverging from catalog THEIRS);
 * `oursMut` forms OURS on top. Returns the installed schema dest path.
 */
function makeBothDivergedTasks(
	baseMut: (p: Record<string, unknown>) => void,
	oursMut: (p: Record<string, unknown>) => void,
): string {
	const dest = path.join(tmpRoot, ".project", "schemas", "tasks.schema.json");
	installContext(tmpRoot);
	const baseObj = JSON.parse(fs.readFileSync(dest, "utf-8")) as Record<string, unknown>;
	baseMut(deepGet(baseObj, TASKS_ITEM_PROPS));
	fs.writeFileSync(dest, JSON.stringify(baseObj, null, 2));
	installContext(tmpRoot); // re-baseline FROM the edited body → BASE ≠ catalog (THEIRS)
	const oursObj = JSON.parse(fs.readFileSync(dest, "utf-8")) as Record<string, unknown>;
	oursMut(deepGet(oursObj, TASKS_ITEM_PROPS));
	fs.writeFileSync(dest, JSON.stringify(oursObj, null, 2));
	return dest;
}

describe("getConflictMergeInputs (TASK-037)", () => {
	afterEach(() => {
		if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	it("returns base/ours/theirs for a both-diverged schema", () => {
		tmpRoot = makeProject(["tasks", "decisions"]);
		makeBothDivergedTasks(
			(p) => {
				(p.notes as Record<string, unknown>).type = "number";
			},
			(p) => {
				(p.notes as Record<string, unknown>).type = "boolean";
			},
		);
		assert.equal(
			checkStatus(tmpRoot).perAsset.find((a) => a.name === "tasks")?.state,
			"both-diverged",
			"precondition: tasks must be both-diverged",
		);
		const inputs = getConflictMergeInputs(tmpRoot, "tasks");
		assert.ok(inputs, "merge inputs must resolve for a both-diverged schema");
		// BASE was baselined from the "number" body; OURS is the on-disk "boolean"
		// body; THEIRS is the catalog "string" body. All three differ at notes.type.
		const baseType = (deepGet(inputs.base, TASKS_ITEM_PROPS).notes as Record<string, unknown>).type;
		const oursType = (deepGet(inputs.ours, TASKS_ITEM_PROPS).notes as Record<string, unknown>).type;
		const theirsType = (deepGet(inputs.theirs, TASKS_ITEM_PROPS).notes as Record<string, unknown>).type;
		assert.equal(baseType, "number", "BASE = the baselined body");
		assert.equal(oursType, "boolean", "OURS = the on-disk installed body");
		assert.equal(theirsType, "string", "THEIRS = the catalog body");
	});

	it("returns null when the base body is unstamped (object-store object deleted)", () => {
		tmpRoot = makeProject(["tasks", "decisions"]);
		installContext(tmpRoot);
		const substrateDir = path.join(tmpRoot, ".project");
		// Make tasks locally-modified so a baseline hash is recorded, then remove the
		// stamped BASE body → getObject(baseHash) returns null → no merge inputs.
		const dest = path.join(substrateDir, "schemas", "tasks.schema.json");
		const obj = JSON.parse(fs.readFileSync(dest, "utf-8")) as Record<string, unknown>;
		obj.__local_edit_marker = true;
		fs.writeFileSync(dest, JSON.stringify(obj, null, 2));
		const baseHash = loadConfig(tmpRoot)?.installed_from?.assets.tasks.content_hash;
		assert.ok(baseHash, "precondition: tasks must have a recorded baseline content_hash");
		fs.unlinkSync(path.join(substrateDir, "objects", `${baseHash}.json`));
		assert.equal(getObject(substrateDir, baseHash), null, "precondition: the base body must be gone");
		assert.equal(getConflictMergeInputs(tmpRoot, "tasks"), null, "no stamped base body → null inputs");
	});

	it("returns null for an unknown schema name (no catalog kind)", () => {
		tmpRoot = makeProject(["tasks"]);
		installContext(tmpRoot);
		assert.equal(getConflictMergeInputs(tmpRoot, "definitely-not-a-real-schema"), null);
	});
});

describe("refreshBaselineForSchema (TASK-037)", () => {
	afterEach(() => {
		if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	it("returns true + re-stamps after an on-disk edit", () => {
		tmpRoot = makeProject(["tasks", "decisions"]);
		installContext(tmpRoot);
		const substrateDir = path.join(tmpRoot, ".project");
		const dest = path.join(substrateDir, "schemas", "tasks.schema.json");
		const before = loadConfig(tmpRoot)?.installed_from?.assets.tasks.content_hash;
		assert.ok(before, "precondition: tasks must have a baseline content_hash");
		// Edit the installed body so its hash changes (simulating the mergetool write).
		const obj = JSON.parse(fs.readFileSync(dest, "utf-8")) as Record<string, unknown>;
		obj.__reconciled_marker = true;
		fs.writeFileSync(dest, JSON.stringify(obj, null, 2));
		assert.equal(refreshBaselineForSchema(tmpRoot, "tasks"), true, "a changed body must re-baseline (true)");
		const after = loadConfig(tmpRoot)?.installed_from?.assets.tasks.content_hash;
		assert.notEqual(after, before, "the baseline hash must move to the edited body's hash");
		assert.equal(after, computeFileContentHash(dest), "the refreshed hash must equal the on-disk body hash");
		const body = getObject(substrateDir, after as string);
		assert.ok(body, "the edited body must be stamped under the refreshed baseline hash");
		assert.equal((body as Record<string, unknown>).__reconciled_marker, true, "the stamped body is the edited one");
	});

	it("returns false (no-op) when the installed body is unchanged", () => {
		tmpRoot = makeProject(["tasks", "decisions"]);
		installContext(tmpRoot);
		// No on-disk edit: the current hash already equals the recorded baseline.
		assert.equal(refreshBaselineForSchema(tmpRoot, "tasks"), false, "an unchanged body is a no-op (false)");
	});

	it("returns false when the installed schema file is absent", () => {
		tmpRoot = makeProject(["tasks", "decisions"]);
		installContext(tmpRoot);
		fs.unlinkSync(path.join(tmpRoot, ".project", "schemas", "tasks.schema.json"));
		assert.equal(refreshBaselineForSchema(tmpRoot, "tasks"), false, "an absent file is a no-op (false)");
	});
});

describe("renderConflicts (TASK-037)", () => {
	it("renders the typed conflict set (pure, no I/O)", () => {
		const out = renderConflicts([
			{
				name: "tasks",
				conflicts: [
					{ path: "properties.tasks.items.properties.notes.type", base: "number", ours: "boolean", theirs: "string" },
				],
			},
		]);
		assert.match(out, /tasks \(1 conflict\)/, "section header names the schema + conflict count");
		assert.match(out, /properties\.tasks\.items\.properties\.notes\.type/, "the conflicting path is listed");
		assert.match(out, /base:\s+"number"/, "base value rendered");
		assert.match(out, /ours:\s+"boolean"/, "ours value rendered");
		assert.match(out, /theirs:\s+"string"/, "theirs value rendered");
	});

	it("renders an empty set as a no-conflicts line", () => {
		assert.match(renderConflicts([]), /\(no conflicts\)/);
	});
});
