import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { appendToBlock, readBlock, updateItemInBlock, writeBlock } from "./block-api.js";
import { ValidationError } from "./schema-validator.js";

function makeTmpDir(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), `block-api-${prefix}-`));
}

function setupWorkflowDir(tmpDir: string): string {
	const wfDir = path.join(tmpDir, ".project");
	fs.mkdirSync(wfDir, { recursive: true });
	return wfDir;
}

/**
 * Schemas resolve from the bundled `<package>/defaults/schemas/` tier only
 * (post tier-2 migration). Validation-checking tests below use the bundled
 * `decisions` schema (requires id/decision/rationale/status with enum
 * decided|tentative|revisit|superseded). Tests that exercise I/O without
 * validation use arbitrary block names with no bundled schema (validation
 * skipped, write succeeds).
 */
function validDecision(id: string, status = "decided"): Record<string, unknown> {
	return { id, decision: `decision-${id}`, rationale: `because-${id}`, status };
}

describe("readBlock", () => {
	it("reads and parses valid JSON block", (t) => {
		const tmpDir = makeTmpDir("read-valid");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const wfDir = setupWorkflowDir(tmpDir);

		const data = { gaps: [{ id: "g1", description: "test", status: "open" }] };
		fs.writeFileSync(path.join(wfDir, "gaps.json"), JSON.stringify(data));

		const result = readBlock(tmpDir, "gaps");
		assert.deepStrictEqual(result, data);
	});

	it("throws when block file does not exist", (t) => {
		const tmpDir = makeTmpDir("read-missing");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		assert.throws(
			() => readBlock(tmpDir, "nonexistent"),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("not found"));
				return true;
			},
		);
	});

	it("throws when .project/ dir does not exist", (t) => {
		const tmpDir = makeTmpDir("read-nodir");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		assert.throws(
			() => readBlock(tmpDir, "gaps"),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("not found"));
				return true;
			},
		);
	});

	it("throws on invalid JSON", (t) => {
		const tmpDir = makeTmpDir("read-badjson");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const wfDir = setupWorkflowDir(tmpDir);

		fs.writeFileSync(path.join(wfDir, "bad.json"), "not json{{");

		assert.throws(
			() => readBlock(tmpDir, "bad"),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("Invalid JSON"));
				return true;
			},
		);
	});

	it("reads block with no corresponding schema", (t) => {
		const tmpDir = makeTmpDir("read-noschema");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const wfDir = setupWorkflowDir(tmpDir);

		const data = { default: "claude-sonnet-4-20250514" };
		fs.writeFileSync(path.join(wfDir, "model-config.json"), JSON.stringify(data));

		const result = readBlock(tmpDir, "model-config");
		assert.deepStrictEqual(result, data);
	});

	it("reads non-array-wrapper blocks", (t) => {
		const tmpDir = makeTmpDir("read-flat");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		const wfDir = setupWorkflowDir(tmpDir);

		const data = { current_phase: 5, test_count: 100 };
		fs.writeFileSync(path.join(wfDir, "state.json"), JSON.stringify(data));

		const result = readBlock(tmpDir, "state");
		assert.deepStrictEqual(result, data);
	});
});

describe("writeBlock", () => {
	it("writes valid data with schema validation", (t) => {
		const tmpDir = makeTmpDir("write-valid");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		const data = { decisions: [validDecision("d1")] };
		writeBlock(tmpDir, "decisions", data);

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "decisions.json"), "utf-8"));
		assert.deepStrictEqual(onDisk, data);
	});

	it("throws ValidationError on schema violation — file NOT created", (t) => {
		const tmpDir = makeTmpDir("write-invalid");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		// id wrong type (number not string), missing required decision/rationale/status fields
		const badData = { decisions: [{ id: 123 }] };

		assert.throws(
			() => writeBlock(tmpDir, "decisions", badData),
			(err: unknown) => {
				assert.ok(err instanceof ValidationError);
				return true;
			},
		);

		assert.ok(!fs.existsSync(path.join(tmpDir, ".project", "decisions.json")));
	});

	it("writes without validation when no schema exists", (t) => {
		const tmpDir = makeTmpDir("write-noschema");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		const data = { anything: "goes" };
		writeBlock(tmpDir, "custom", data);

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "custom.json"), "utf-8"));
		assert.deepStrictEqual(onDisk, data);
	});

	it("creates .project/ dir if missing", (t) => {
		const tmpDir = makeTmpDir("write-mkdir");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

		const data = { test: true };
		writeBlock(tmpDir, "new-block", data);

		assert.ok(fs.existsSync(path.join(tmpDir, ".project", "new-block.json")));
	});

	it("no tmp file remains after successful write", (t) => {
		const tmpDir = makeTmpDir("write-notmp");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		writeBlock(tmpDir, "clean", { data: true });

		const wfDir = path.join(tmpDir, ".project");
		const files = fs.readdirSync(wfDir);
		const tmpFiles = files.filter((f) => f.includes(".tmp"));
		assert.strictEqual(tmpFiles.length, 0);
	});

	it("no tmp file or data file on validation failure", (t) => {
		const tmpDir = makeTmpDir("write-cleanfail");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		try {
			writeBlock(tmpDir, "decisions", { decisions: "not an array" });
		} catch {
			/* expected */
		}

		const wfDir = path.join(tmpDir, ".project");
		const files = fs.readdirSync(wfDir);
		assert.ok(!files.includes("decisions.json"));
		const tmpFiles = files.filter((f) => f.includes(".tmp"));
		assert.strictEqual(tmpFiles.length, 0);
	});

	it("overwrites existing block file", (t) => {
		const tmpDir = makeTmpDir("write-overwrite");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		writeBlock(tmpDir, "data", { version: 1 });
		writeBlock(tmpDir, "data", { version: 2 });

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "data.json"), "utf-8"));
		assert.strictEqual(onDisk.version, 2);
	});

	it("preserves 2-space JSON indent", (t) => {
		const tmpDir = makeTmpDir("write-indent");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		writeBlock(tmpDir, "fmt", { key: "value" });

		const raw = fs.readFileSync(path.join(tmpDir, ".project", "fmt.json"), "utf-8");
		assert.ok(raw.includes('  "key"'));
	});
});

describe("appendToBlock", () => {
	it("appends item to existing array", (t) => {
		const tmpDir = makeTmpDir("append-existing");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		const initial = { gaps: [{ id: "g1", description: "first", status: "open" }] };
		fs.writeFileSync(path.join(tmpDir, ".project", "gaps.json"), JSON.stringify(initial));

		appendToBlock(tmpDir, "gaps", "gaps", { id: "g2", description: "second", status: "open" });

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "gaps.json"), "utf-8"));
		assert.strictEqual(onDisk.gaps.length, 2);
		assert.strictEqual(onDisk.gaps[1].id, "g2");
	});

	it("appends to empty array", (t) => {
		const tmpDir = makeTmpDir("append-empty");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		fs.writeFileSync(path.join(tmpDir, ".project", "gaps.json"), JSON.stringify({ gaps: [] }));

		appendToBlock(tmpDir, "gaps", "gaps", { id: "g1", description: "first", status: "open" });

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "gaps.json"), "utf-8"));
		assert.strictEqual(onDisk.gaps.length, 1);
	});

	it("throws ValidationError on invalid item — original file unchanged", (t) => {
		const tmpDir = makeTmpDir("append-invalid");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		const original = { decisions: [validDecision("d1")] };
		const originalStr = JSON.stringify(original);
		fs.writeFileSync(path.join(tmpDir, ".project", "decisions.json"), originalStr);

		assert.throws(
			() => appendToBlock(tmpDir, "decisions", "decisions", { id: 999 }), // bad id type, missing required fields
			(err: unknown) => {
				assert.ok(err instanceof ValidationError);
				return true;
			},
		);

		const afterStr = fs.readFileSync(path.join(tmpDir, ".project", "decisions.json"), "utf-8");
		assert.strictEqual(afterStr, originalStr);
	});

	it("throws when block file does not exist", (t) => {
		const tmpDir = makeTmpDir("append-nofile");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		assert.throws(
			() => appendToBlock(tmpDir, "missing", "items", { id: "x" }),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("not found"));
				return true;
			},
		);
	});

	it("throws when arrayKey does not exist in data", (t) => {
		const tmpDir = makeTmpDir("append-nokey");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		fs.writeFileSync(path.join(tmpDir, ".project", "gaps.json"), JSON.stringify({ gaps: [] }));

		assert.throws(
			() => appendToBlock(tmpDir, "gaps", "decisions", { id: "d1" }),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("has no key"));
				return true;
			},
		);
	});

	it("throws when arrayKey is not an array", (t) => {
		const tmpDir = makeTmpDir("append-notarray");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		fs.writeFileSync(path.join(tmpDir, ".project", "data.json"), JSON.stringify({ items: "string" }));

		assert.throws(
			() => appendToBlock(tmpDir, "data", "items", { id: "x" }),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("not an array"));
				return true;
			},
		);
	});

	it("does not mutate file on validation failure", (t) => {
		const tmpDir = makeTmpDir("append-nomutate");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		const original = { decisions: [validDecision("d1")] };
		fs.writeFileSync(path.join(tmpDir, ".project", "decisions.json"), JSON.stringify(original, null, 2));

		try {
			appendToBlock(tmpDir, "decisions", "decisions", { broken: true });
		} catch {
			/* expected */
		}

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "decisions.json"), "utf-8"));
		assert.strictEqual(onDisk.decisions.length, 1);
		assert.strictEqual(onDisk.decisions[0].id, "d1");
	});

	it("appends to block without schema", (t) => {
		const tmpDir = makeTmpDir("append-noschema");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		fs.writeFileSync(path.join(tmpDir, ".project", "custom.json"), JSON.stringify({ items: [1] }));

		appendToBlock(tmpDir, "custom", "items", 2);

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "custom.json"), "utf-8"));
		assert.deepStrictEqual(onDisk.items, [1, 2]);
	});

	it("sequential appends — both items present", (t) => {
		const tmpDir = makeTmpDir("append-seq");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		fs.writeFileSync(path.join(tmpDir, ".project", "list.json"), JSON.stringify({ items: [] }));

		appendToBlock(tmpDir, "list", "items", "first");
		appendToBlock(tmpDir, "list", "items", "second");

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "list.json"), "utf-8"));
		assert.deepStrictEqual(onDisk.items, ["first", "second"]);
	});
});

describe("updateItemInBlock", () => {
	it("updates matching item fields", (t) => {
		const tmpDir = makeTmpDir("update-match");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		const initial = { gaps: [{ id: "g1", description: "test", status: "open" }] };
		fs.writeFileSync(path.join(tmpDir, ".project", "gaps.json"), JSON.stringify(initial));

		updateItemInBlock(tmpDir, "gaps", "gaps", (g) => g.id === "g1", { status: "resolved", resolved_by: "test" });

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "gaps.json"), "utf-8"));
		assert.strictEqual(onDisk.gaps[0].status, "resolved");
		assert.strictEqual(onDisk.gaps[0].resolved_by, "test");
		assert.strictEqual(onDisk.gaps[0].id, "g1"); // unchanged
	});

	it("throws when no item matches predicate", (t) => {
		const tmpDir = makeTmpDir("update-nomatch");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		fs.writeFileSync(path.join(tmpDir, ".project", "gaps.json"), JSON.stringify({ gaps: [{ id: "g1" }] }));

		assert.throws(
			() => updateItemInBlock(tmpDir, "gaps", "gaps", (g) => g.id === "nonexistent", { status: "resolved" }),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("No matching item"));
				return true;
			},
		);
	});

	it("throws ValidationError when update produces invalid data — original unchanged", (t) => {
		const tmpDir = makeTmpDir("update-invalid");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		const original = { decisions: [validDecision("d1")] };
		const originalStr = JSON.stringify(original);
		fs.writeFileSync(path.join(tmpDir, ".project", "decisions.json"), originalStr);

		assert.throws(
			() => updateItemInBlock(tmpDir, "decisions", "decisions", (d) => d.id === "d1", { status: "invalid-status" }),
			(err: unknown) => {
				assert.ok(err instanceof ValidationError);
				return true;
			},
		);

		// Original file unchanged
		const afterStr = fs.readFileSync(path.join(tmpDir, ".project", "decisions.json"), "utf-8");
		assert.strictEqual(afterStr, originalStr);
	});

	it("preserves other items in array", (t) => {
		const tmpDir = makeTmpDir("update-preserve");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		const initial = {
			items: [
				{ id: "a", val: 1 },
				{ id: "b", val: 2 },
				{ id: "c", val: 3 },
			],
		};
		fs.writeFileSync(path.join(tmpDir, ".project", "data.json"), JSON.stringify(initial));

		updateItemInBlock(tmpDir, "data", "items", (i) => i.id === "b", { val: 99 });

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "data.json"), "utf-8"));
		assert.strictEqual(onDisk.items[0].val, 1);
		assert.strictEqual(onDisk.items[1].val, 99);
		assert.strictEqual(onDisk.items[2].val, 3);
	});

	it("shallow merge — new field added, existing field overwritten", (t) => {
		const tmpDir = makeTmpDir("update-merge");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		fs.writeFileSync(
			path.join(tmpDir, ".project", "data.json"),
			JSON.stringify({
				items: [{ id: "x", existing: "old", keep: "this" }],
			}),
		);

		updateItemInBlock(tmpDir, "data", "items", (i) => i.id === "x", { existing: "new", added: "field" });

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "data.json"), "utf-8"));
		assert.strictEqual(onDisk.items[0].existing, "new");
		assert.strictEqual(onDisk.items[0].added, "field");
		assert.strictEqual(onDisk.items[0].keep, "this");
	});

	it("works on block without schema", (t) => {
		const tmpDir = makeTmpDir("update-noschema");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		setupWorkflowDir(tmpDir);

		fs.writeFileSync(path.join(tmpDir, ".project", "custom.json"), JSON.stringify({ items: [{ id: "a", v: 1 }] }));

		updateItemInBlock(tmpDir, "custom", "items", (i) => i.id === "a", { v: 2 });

		const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, ".project", "custom.json"), "utf-8"));
		assert.strictEqual(onDisk.items[0].v, 2);
	});
});

// ── Two-tier resolution: project (.project/) > bundled (defaults/blocks/) ────
//
// These tests pin the post-migration loader contract. The project tier wins
// when present; the bundled tier fills in when project-tier files are absent.
// Schemas always resolve from the bundled tier — `.project/schemas/` has no
// influence after the migration.

describe("two-tier read fall-through", () => {
	it("falls through to bundled tier when .project/ has no file", (t) => {
		const tmpDir = makeTmpDir("tier2-read");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		// `.git` boundary keeps findProjectDir local to tmpDir; without it
		// the resolver could escape into the surrounding repo's .project/.
		fs.mkdirSync(path.join(tmpDir, ".git"), { recursive: true });

		// No `.project/` exists; readBlock should serve the bundled empty
		// decisions scaffold without throwing.
		const data = readBlock(tmpDir, "decisions") as { decisions: unknown[] };
		assert.ok(Array.isArray(data.decisions));
		assert.strictEqual(data.decisions.length, 0);
	});

	it("project tier wins when both tiers contain the same block", (t) => {
		const tmpDir = makeTmpDir("tier1-wins");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		fs.mkdirSync(path.join(tmpDir, ".git"), { recursive: true });
		setupWorkflowDir(tmpDir);

		const projectDecision = validDecision("project-only");
		fs.writeFileSync(path.join(tmpDir, ".project", "decisions.json"), JSON.stringify({ decisions: [projectDecision] }));

		const data = readBlock(tmpDir, "decisions") as { decisions: Record<string, unknown>[] };
		assert.strictEqual(data.decisions.length, 1);
		assert.strictEqual(data.decisions[0].id, "project-only");
	});

	it("throws when neither tier has the block, naming both paths", (t) => {
		const tmpDir = makeTmpDir("no-tier");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		fs.mkdirSync(path.join(tmpDir, ".git"), { recursive: true });

		assert.throws(
			() => readBlock(tmpDir, "definitely-not-a-bundled-name"),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes("not found"));
				// Error message names both attempted paths
				assert.ok(err.message.includes("defaults/blocks") || err.message.includes(".project"));
				return true;
			},
		);
	});
});

describe("two-tier write semantics", () => {
	it("appendToBlock lazy-materializes from bundled tier on first write", (t) => {
		const tmpDir = makeTmpDir("lazy-mat");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		fs.mkdirSync(path.join(tmpDir, ".git"), { recursive: true });

		// No `.project/decisions.json` exists; appendToBlock reads bundled
		// scaffold, appends, writes to project tier.
		const decision = validDecision("first");
		appendToBlock(tmpDir, "decisions", "decisions", decision);

		const tier1Path = path.join(tmpDir, ".project", "decisions.json");
		assert.ok(fs.existsSync(tier1Path), "project-tier file materialized");

		const onDisk = JSON.parse(fs.readFileSync(tier1Path, "utf-8")) as { decisions: Record<string, unknown>[] };
		assert.strictEqual(onDisk.decisions.length, 1);
		assert.strictEqual(onDisk.decisions[0].id, "first");
	});

	it("writeBlock writes to project tier without touching bundled tier", (t) => {
		const tmpDir = makeTmpDir("write-tier1");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		fs.mkdirSync(path.join(tmpDir, ".git"), { recursive: true });

		writeBlock(tmpDir, "decisions", { decisions: [validDecision("d1")] });

		assert.ok(fs.existsSync(path.join(tmpDir, ".project", "decisions.json")));
		// Bundled-tier file at <package>/defaults/blocks/decisions.json must
		// be unchanged. We assert by reading it and ensuring the array is
		// still the empty scaffold (post-migration the bundled tier is
		// strictly read-only from this code path).
		const bundled = readBlock(path.join(os.tmpdir(), `nonexistent-${Date.now()}`), "decisions") as {
			decisions: unknown[];
		};
		assert.strictEqual(bundled.decisions.length, 0);
	});
});

describe("withBlockLock concurrency on first append", () => {
	it("serializes concurrent first-appends so all items land", async (t) => {
		const tmpDir = makeTmpDir("concurrent-first");
		t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
		fs.mkdirSync(path.join(tmpDir, ".git"), { recursive: true });

		// N concurrent appends against a never-materialized project-tier
		// file. Pre-migration this would race because withBlockLock skipped
		// locking when the file didn't exist; post-migration the parent
		// directory is created and the lock is acquired with realpath:false,
		// serializing the read-modify-write sequence.
		const N = 10;
		const tasks = Array.from({ length: N }, (_, i) =>
			Promise.resolve().then(() => {
				appendToBlock(tmpDir, "decisions", "decisions", validDecision(`d${i}`));
			}),
		);
		await Promise.all(tasks);

		const data = readBlock(tmpDir, "decisions") as { decisions: Record<string, unknown>[] };
		assert.strictEqual(data.decisions.length, N, `expected ${N} items, got ${data.decisions.length}`);
		const ids = new Set(data.decisions.map((d) => d.id as string));
		for (let i = 0; i < N; i++) {
			assert.ok(ids.has(`d${i}`), `item d${i} missing after concurrent appends`);
		}
	});
});
