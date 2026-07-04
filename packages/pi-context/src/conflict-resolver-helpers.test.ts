import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { computeFileContentHash } from "./content-hash.js";
import { loadConfig } from "./context.js";
import { writeBootstrapPointer } from "./context-dir.js";
import { installContext, refreshBaselineForSchema, renderConflicts } from "./index.js";
import { getObject } from "./object-store.js";

// Mirrors install-subcommand.test.ts makeProject — a tmp substrate at .project
// with the named schemas declared so installContext populates + baselines them.
let tmpRoot: string;

function makeProject(installedSchemas: string[] = []): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-context-resolver-"));
	writeBootstrapPointer(dir, ".project");
	fs.mkdirSync(path.join(dir, ".project", "schemas"), { recursive: true });
	const config = {
		schema_version: "1.8.0",
		root: ".project",
		block_kinds: [],
		lenses: [],
		installed_schemas: installedSchemas,
		installed_blocks: [],
	};
	fs.writeFileSync(path.join(dir, ".project", "config.json"), JSON.stringify(config, null, 2));
	return dir;
}

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
		// The report carries the trailing guidance line telling the calling agent how to
		// apply a reconciliation: reconcile the paths into a schema, then commit via the
		// resolve-conflict op (writes the body AND advances the merge base to the catalog).
		assert.match(out, /To resolve each: reconcile the conflicting paths/, "guidance line names the reconcile step");
		assert.match(
			out,
			/resolve-conflict --schemaName <name> --schema <reconciled>/,
			"guidance line names the resolve-conflict apply path",
		);
		assert.match(
			out,
			/advances the merge base to the catalog so update stops re-reporting it/,
			"guidance line states the base-advance rationale",
		);
	});

	it("renders an empty set as a no-conflicts line", () => {
		assert.match(renderConflicts([]), /\(no conflicts\)/);
	});
});
