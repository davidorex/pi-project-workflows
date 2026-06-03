/**
 * Skeleton-config coverage (FGAP-001 / DEC-0001).
 *
 * init / switch -c now write a minimal schema-valid SKELETON config (empty of
 * vocabulary) so a fresh substrate has a tool-driven config from bootstrap.
 * Covers:
 *   - isSkeletonConfig truth table (empty ⇒ true; any vocabulary ⇒ false;
 *     identity/scaffold-only ⇒ true)
 *   - writeSkeletonConfig / initProject writes a schema-valid skeleton and
 *     NEVER-CLOBBERS an existing (populated) config
 *   - switchAndCreate writes a skeleton config on the freshly-created substrate
 *   - the custom-vocabulary path end-to-end: a first amendConfigEntry add of a
 *     block_kinds entry on a skeleton config succeeds WITHOUT accept-all
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
	adoptConception,
	amendConfigEntry,
	type ConfigBlock,
	isSkeletonConfig,
	loadConfig,
	writeConfig,
	writeSkeletonConfig,
} from "./context.js";
import { SUBSTRATE_ID_PATTERN, writeBootstrapPointer } from "./context-dir.js";
import { loadRegistry } from "./context-registry.js";
import { initProject, switchAndCreate } from "./index.js";

/** mkdtemp + bootstrap pointer declaring `contextDir`. */
function mkTmp(contextDir: string): string {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-context-skeleton-"));
	writeBootstrapPointer(cwd, contextDir);
	return cwd;
}

describe("isSkeletonConfig", () => {
	it("an empty config is a skeleton", () => {
		const cfg = { schema_version: "1.0.0", block_kinds: [] } as ConfigBlock;
		assert.equal(isSkeletonConfig(cfg), true);
	});

	it("a config with a block_kinds entry is NOT a skeleton", () => {
		const cfg = {
			schema_version: "1.0.0",
			block_kinds: [
				{
					canonical_id: "task",
					display_name: "Task",
					prefix: "TASK",
					schema_path: "schemas/task.schema.json",
					array_key: "tasks",
					data_path: "task.json",
				},
			],
		} as ConfigBlock;
		assert.equal(isSkeletonConfig(cfg), false);
	});

	it("a config with only installed_schemas non-empty is NOT a skeleton", () => {
		const cfg = { schema_version: "1.0.0", block_kinds: [], installed_schemas: ["task"] } as ConfigBlock;
		assert.equal(isSkeletonConfig(cfg), false);
	});

	it("identity/scaffold-only fields do not make a config non-skeleton", () => {
		const cfg = {
			schema_version: "1.0.0",
			root: ".context",
			substrate_id: "sub-0123456789abcdef",
			block_kinds: [],
		} as ConfigBlock;
		assert.equal(isSkeletonConfig(cfg), true);
	});

	// Table-driven coverage: a config populated via ANY single registry must
	// classify as NON-skeleton. One minimal valid entry per registry (per
	// config.schema.json). Covers every registry — the five originally checked
	// plus the eight previously-unchecked (layers, status_buckets, naming,
	// display_strings, invariants, hierarchy, tool_operations,
	// tool_operations_forbidden) — closing the data-loss class to zero.
	const SINGLE_REGISTRY_CASES: Array<{ name: string; patch: Partial<ConfigBlock> }> = [
		{
			name: "block_kinds",
			patch: {
				block_kinds: [
					{
						canonical_id: "task",
						display_name: "Task",
						prefix: "TASK",
						schema_path: "schemas/task.schema.json",
						array_key: "tasks",
						data_path: "task.json",
					},
				],
			},
		},
		{
			name: "relation_types",
			patch: {
				relation_types: [{ canonical_id: "blocks", display_name: "Blocks", category: "ordering" }],
			},
		},
		{
			name: "lenses",
			patch: { lenses: [{ id: "by-status", bins: ["todo", "done"] }] },
		},
		{
			name: "layers",
			patch: { layers: [{ id: "core", display_name: "Core Layer" }] },
		},
		{
			name: "invariants",
			patch: {
				invariants: [
					{
						id: "task-needs-parent",
						class: "requires-edge",
						block: "task",
						relation_types: ["blocks"],
						direction: "as_child",
					},
				],
			},
		},
		{
			name: "hierarchy",
			patch: {
				hierarchy: [{ parent_block: "epic", child_block: "task", relation_type: "contains" }],
			},
		},
		{
			name: "status_buckets",
			patch: { status_buckets: { open: "todo" } },
		},
		{
			name: "display_strings",
			patch: { display_strings: { OK: "Looks good" } },
		},
		{
			name: "naming",
			patch: { naming: { task: "Work Item" } },
		},
		{
			name: "installed_schemas",
			patch: { installed_schemas: ["task"] },
		},
		{
			name: "installed_blocks",
			patch: { installed_blocks: ["task"] },
		},
		{
			name: "tool_operations",
			patch: { tool_operations: [{ canonical_id: "read-files" }] },
		},
		{
			name: "tool_operations_forbidden",
			patch: { tool_operations_forbidden: ["delete-all"] },
		},
	];

	for (const { name, patch } of SINGLE_REGISTRY_CASES) {
		it(`a config populated via ${name} is NOT a skeleton`, () => {
			const cfg = { schema_version: "1.0.0", block_kinds: [], ...patch } as ConfigBlock;
			assert.equal(isSkeletonConfig(cfg), false, `${name} content must defeat skeleton classification`);
		});
	}
});

describe("writeSkeletonConfig + initProject", () => {
	it("initProject writes a schema-valid skeleton config carrying a minted substrate_id", (t) => {
		const cwd = mkTmp(".context");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const result = initProject(cwd, ".context");
		const config = loadConfig(cwd);
		assert.ok(config, "init must write a config.json");
		assert.ok(isSkeletonConfig(config!), "the init config must be a skeleton");
		assert.ok(
			typeof config!.substrate_id === "string" && SUBSTRATE_ID_PATTERN.test(config!.substrate_id),
			`skeleton must carry a minted substrate_id, got ${config!.substrate_id}`,
		);
		assert.equal(config!.root, ".context", "skeleton must carry root set to the resolved substrate dir");
		assert.ok(
			result.created.some((c) => c.endsWith("config.json")),
			"created list should report the written config.json",
		);
		// init also registers the minted id in the project-root registry.
		const reg = loadRegistry(cwd);
		assert.ok(reg, "init must write a substrate registry");
		assert.deepEqual(
			reg!.substrates[config!.substrate_id as string],
			{ dir: ".context", aliases: [] },
			"the minted skeleton id must be registered under the substrate dir",
		);
	});

	it("initProject NEVER-CLOBBERS a pre-existing populated config", (t) => {
		const cwd = mkTmp(".context");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		// First init lands a skeleton; populate it, then re-init must not clobber.
		initProject(cwd, ".context");
		const populated = {
			schema_version: "1.0.0",
			root: ".context",
			block_kinds: [
				{
					canonical_id: "task",
					display_name: "Task",
					prefix: "TASK",
					schema_path: "schemas/task.schema.json",
					array_key: "tasks",
					data_path: "task.json",
				},
			],
		} as ConfigBlock;
		writeConfig(cwd, populated);
		const beforeRaw = fs.readFileSync(path.join(cwd, ".context", "config.json"), "utf-8");
		initProject(cwd, ".context");
		const afterRaw = fs.readFileSync(path.join(cwd, ".context", "config.json"), "utf-8");
		assert.equal(afterRaw, beforeRaw, "re-init must not overwrite a populated config");
		assert.equal(isSkeletonConfig(loadConfig(cwd)!), false, "config must remain populated");
	});

	it("writeSkeletonConfig is a no-op when a config already exists", (t) => {
		const cwd = mkTmp(".context");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		const first = writeSkeletonConfig(cwd);
		assert.equal(first.written, true, "first write should write the skeleton");
		const second = writeSkeletonConfig(cwd);
		assert.equal(second.written, false, "second write must be a no-op (never-clobber)");
		assert.ok(isSkeletonConfig(loadConfig(cwd)!));
	});
});

describe("switchAndCreate", () => {
	it("writes a skeleton config on the freshly-created substrate", (t) => {
		const cwd = mkTmp(".context");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		// Seed the source substrate so there is a pointer to flip FROM.
		initProject(cwd, ".context");
		switchAndCreate(cwd, ".context-arc", "human:test@example.com");
		// Pointer now resolves to the new dir; its config must be a skeleton.
		const config = loadConfig(cwd);
		assert.ok(config, "switch -c must write a config on the new substrate");
		assert.ok(isSkeletonConfig(config!), "the new substrate's config must be a skeleton");
		assert.ok(fs.existsSync(path.join(cwd, ".context-arc", "config.json")));
	});
});

describe("substrate_id stability across init → accept-all (Option B)", () => {
	it("accept-all over a skeleton PRESERVES the init-minted id + registry entry", (t) => {
		const cwd = mkTmp(".context");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		// init mints id X, writes a skeleton, and registers X.
		initProject(cwd, ".context");
		const skeletonId = loadConfig(cwd)!.substrate_id;
		assert.ok(
			typeof skeletonId === "string" && SUBSTRATE_ID_PATTERN.test(skeletonId),
			`init must mint a valid id, got ${skeletonId}`,
		);
		const regBefore = loadRegistry(cwd);
		assert.deepEqual(regBefore!.substrates[skeletonId as string], { dir: ".context", aliases: [] });
		// accept-all overwrites the skeleton; identity must NOT change.
		adoptConception(cwd);
		const adoptedConfig = loadConfig(cwd);
		assert.equal(isSkeletonConfig(adoptedConfig!), false, "accept-all must populate the config (no longer a skeleton)");
		assert.equal(
			adoptedConfig!.substrate_id,
			skeletonId,
			"accept-all over a skeleton must preserve the init-minted substrate_id (no new id)",
		);
		const regAfter = loadRegistry(cwd);
		assert.deepEqual(
			regAfter!.substrates[skeletonId as string],
			{ dir: ".context", aliases: [] },
			"the project-root registry must still hold the original id under the substrate dir",
		);
		assert.equal(
			Object.keys(regAfter!.substrates).length,
			1,
			"no duplicate / replacement registry entry across init → accept-all",
		);
	});
});

describe("custom-vocabulary path (no accept-all)", () => {
	it("a first amendConfigEntry add of a block_kinds entry on a skeleton config succeeds", (t) => {
		const cwd = mkTmp(".context");
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		initProject(cwd, ".context");
		assert.ok(isSkeletonConfig(loadConfig(cwd)!), "precondition: starts as a skeleton");
		const entry = {
			canonical_id: "task",
			display_name: "Task",
			prefix: "TASK",
			schema_path: "schemas/task.schema.json",
			array_key: "tasks",
			data_path: "task.json",
		};
		const result = amendConfigEntry(cwd, "block_kinds", "add", "task", entry);
		assert.equal(result.modified, true);
		const config = loadConfig(cwd);
		assert.equal(config!.block_kinds.length, 1, "the block_kind must be added");
		assert.equal(isSkeletonConfig(config!), false, "config is no longer a skeleton after the add");
	});
});
