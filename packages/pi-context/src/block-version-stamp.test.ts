/**
 * TASK-073: envelope schema_version activation.
 *
 * The write path stamps `schema_version` onto every versioned-document
 * envelope (generic in writeTypedFile, self-gated on the schema declaring the
 * property + carrying a `version`), which arms the previously-dormant
 * read-time migration hook (readBlockForDir) and pre-write version gate
 * (writeBlockForDir). Covered here:
 *   - stamp-on-write: a fresh block write carries the schema's current version
 *     without the caller supplying it (stamped, not passed through)
 *   - stale-claim convergence: an incoming envelope claiming an old version is
 *     walked forward by the write gate (declared migration) and persisted at
 *     the CURRENT version
 *   - self-gate: a schema that does not declare the property leaves the
 *     envelope untouched (no stamp, no additionalProperties break)
 *   - criterion-4 cells: read-gate migrate / read-gate no-chain throw /
 *     write-gate migrate / write-gate no-chain throw with the block file
 *     byte-unchanged
 *   - append funnel: appendToBlock (typed-file wrapper route) stamps too
 *   - config convergence (FGAP-105 instance): writeConfigForDir persists the
 *     bundled config schema's version
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { appendToBlock, readBlock, writeBlock } from "./block-api.js";
import { type ConfigBlock, writeConfigForDir } from "./context.js";
import { writeBootstrapPointer } from "./context-dir.js";
import { writeSchemaChecked } from "./schema-write.js";
import { writeSchemaMigrationExecute } from "./write-schema-migration-tool.js";

const HUMAN = { kind: "human" as const, user: "test@example" };

function setup(): string {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "block-version-stamp-"));
	writeBootstrapPointer(cwd, ".project");
	fs.mkdirSync(path.join(cwd, ".project"), { recursive: true });
	return cwd;
}

/** Synthetic versioned block schema declaring the optional envelope property. */
function versionedSchema(version: string): Record<string, unknown> {
	return {
		version,
		type: "object",
		required: ["items"],
		additionalProperties: false,
		properties: {
			schema_version: { type: "string" },
			items: { type: "array", items: { type: "object" } },
		},
	};
}

function blockFile(cwd: string): string {
	return path.join(cwd, ".project", "thing.json");
}

function readRaw(cwd: string): Record<string, unknown> {
	return JSON.parse(fs.readFileSync(blockFile(cwd), "utf-8"));
}

describe("TASK-073 envelope schema_version stamp (write path)", () => {
	let cwd: string;
	beforeEach(() => {
		cwd = setup();
	});
	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it("stamps the schema's current version onto a fresh write that supplies none", () => {
		writeSchemaChecked(cwd, "thing", versionedSchema("1.0.0"), "create");
		writeBlock(cwd, "thing", { items: [] });
		assert.equal(readRaw(cwd).schema_version, "1.0.0");
	});

	it("overwrites a stale claim after the write gate migrates it forward (stamped, not passed through)", async () => {
		writeSchemaChecked(cwd, "thing", versionedSchema("2.0.0"), "create");
		await writeSchemaMigrationExecute(
			cwd,
			{
				operation: "create",
				schemaName: "thing",
				fromVersion: "1.0.0",
				toVersion: "2.0.0",
				kind: "identity",
				writer: HUMAN,
			},
			{ writer: HUMAN },
		);
		writeBlock(cwd, "thing", { schema_version: "1.0.0", items: [] });
		assert.equal(readRaw(cwd).schema_version, "2.0.0");
	});

	it("self-gate: a schema without the property leaves the envelope unstamped and valid", () => {
		writeSchemaChecked(
			cwd,
			"thing",
			{
				version: "1.0.0",
				type: "object",
				required: ["items"],
				additionalProperties: false,
				properties: { items: { type: "array", items: { type: "object" } } },
			},
			"create",
		);
		writeBlock(cwd, "thing", { items: [] });
		assert.equal("schema_version" in readRaw(cwd), false);
	});

	it("append funnel (typed-file wrapper route) stamps the envelope too", () => {
		writeSchemaChecked(cwd, "thing", versionedSchema("1.0.0"), "create");
		// Seed the file WITHOUT a version (raw write bypasses the API on purpose).
		fs.writeFileSync(blockFile(cwd), JSON.stringify({ items: [] }, null, 2), "utf-8");
		appendToBlock(cwd, "thing", "items", { note: "x" });
		const after = readRaw(cwd);
		assert.equal(after.schema_version, "1.0.0");
		assert.equal((after.items as unknown[]).length, 1);
	});
});

describe("TASK-073 criterion-4 cells: migrate AND throw at both gates", () => {
	let cwd: string;
	beforeEach(() => {
		cwd = setup();
	});
	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it("read gate MIGRATE: a v1-stamped file with a declared v1→v2 chain reads clean under the v2 schema", async () => {
		writeSchemaChecked(cwd, "thing", versionedSchema("2.0.0"), "create");
		await writeSchemaMigrationExecute(
			cwd,
			{
				operation: "create",
				schemaName: "thing",
				fromVersion: "1.0.0",
				toVersion: "2.0.0",
				kind: "identity",
				writer: HUMAN,
			},
			{ writer: HUMAN },
		);
		fs.writeFileSync(
			blockFile(cwd),
			JSON.stringify({ schema_version: "1.0.0", items: [{ ok: true }] }, null, 2),
			"utf-8",
		);
		const data = readBlock(cwd, "thing") as Record<string, unknown>;
		assert.equal((data.items as Record<string, unknown>[])[0]?.ok, true);
	});

	it("read gate THROW: a v1-stamped file with NO chain to the v2 schema fails the read", () => {
		writeSchemaChecked(cwd, "thing", versionedSchema("2.0.0"), "create");
		fs.writeFileSync(blockFile(cwd), JSON.stringify({ schema_version: "1.0.0", items: [] }, null, 2), "utf-8");
		assert.throws(() => readBlock(cwd, "thing"), /no migrations|no path/i);
	});

	it("write gate MIGRATE: an incoming v1 envelope with a declared chain lands, persisted at v2", async () => {
		writeSchemaChecked(cwd, "thing", versionedSchema("2.0.0"), "create");
		await writeSchemaMigrationExecute(
			cwd,
			{
				operation: "create",
				schemaName: "thing",
				fromVersion: "1.0.0",
				toVersion: "2.0.0",
				kind: "identity",
				writer: HUMAN,
			},
			{ writer: HUMAN },
		);
		writeBlock(cwd, "thing", { schema_version: "1.0.0", items: [{ ok: true }] });
		const after = readRaw(cwd);
		assert.equal(after.schema_version, "2.0.0");
		assert.equal((after.items as Record<string, unknown>[])[0]?.ok, true);
	});

	it("write gate THROW: an incoming v1 envelope with NO chain rejects, block file byte-unchanged", () => {
		writeSchemaChecked(cwd, "thing", versionedSchema("2.0.0"), "create");
		writeBlock(cwd, "thing", { items: [{ existing: true }] });
		const before = fs.readFileSync(blockFile(cwd), "utf-8");
		assert.throws(() => writeBlock(cwd, "thing", { schema_version: "1.0.0", items: [] }), /no migrations|no path/i);
		const after = fs.readFileSync(blockFile(cwd), "utf-8");
		assert.equal(after, before);
	});
});

describe("TASK-073 / FGAP-105: config write converges the persisted schema_version", () => {
	let cwd: string;
	beforeEach(() => {
		cwd = setup();
	});
	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it("writeConfigForDir stamps the bundled config schema's current version over a stale claim", () => {
		const bundled = JSON.parse(
			fs.readFileSync(path.join(import.meta.dirname, "..", "schemas", "config.schema.json"), "utf-8"),
		) as Record<string, unknown>;
		const current = bundled.version as string;
		const substrateDir = path.join(cwd, ".project");
		writeConfigForDir(substrateDir, { schema_version: "1.0.0", block_kinds: [] } as unknown as ConfigBlock);
		const onDisk = JSON.parse(fs.readFileSync(path.join(substrateDir, "config.json"), "utf-8"));
		assert.equal(onDisk.schema_version, current);
	});
});
