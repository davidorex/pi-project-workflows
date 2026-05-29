import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { CANONICAL_MACRO_NAMES, createRendererRegistry } from "./renderer-registry.js";

function tmpDir(label: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), `renderer-registry-${label}-`));
}

function writeItemMacro(baseDir: string, kind: string, body = ""): string {
	const itemsDir = path.join(baseDir, "items");
	fs.mkdirSync(itemsDir, { recursive: true });
	const filePath = path.join(itemsDir, `${kind}.md`);
	fs.writeFileSync(filePath, body);
	return filePath;
}

describe("createRendererRegistry", () => {
	it("returns null when no tier yields a file and no builtinDir is supplied", (t) => {
		const cwd = tmpDir("empty");
		const userDir = tmpDir("user-empty");
		t.after(() => {
			fs.rmSync(cwd, { recursive: true, force: true });
			fs.rmSync(userDir, { recursive: true, force: true });
		});

		const registry = createRendererRegistry({ cwd, userDir });
		assert.strictEqual(registry.lookup("decisions"), null);
	});

	it("resolves the builtin tier when only builtinDir contains the macro file", (t) => {
		const cwd = tmpDir("project-empty");
		const userDir = tmpDir("user-empty");
		const builtinDir = tmpDir("builtin");
		t.after(() => {
			for (const d of [cwd, userDir, builtinDir]) fs.rmSync(d, { recursive: true, force: true });
		});

		const expectedPath = writeItemMacro(
			builtinDir,
			"decisions",
			"{% macro render_decision(d) %}{{ d.id }}{% endmacro %}",
		);

		const registry = createRendererRegistry({ cwd, userDir, builtinDir });
		const ref = registry.lookup("decisions");
		assert.ok(ref, "expected non-null ItemMacroRef from builtin tier");
		assert.strictEqual(ref.templatePath, expectedPath);
		// Canonical Plan-6 macro name is the singular `render_decision` —
		// resolved via CANONICAL_MACRO_NAMES, no longer the registry-default
		// plural derivation.
		assert.strictEqual(ref.macroName, "render_decision");
		assert.ok(path.isAbsolute(ref.templatePath));
	});

	it("project tier overrides builtin (first match wins)", (t) => {
		const cwd = tmpDir("project");
		const userDir = tmpDir("user-empty");
		const builtinDir = tmpDir("builtin");
		t.after(() => {
			for (const d of [cwd, userDir, builtinDir]) fs.rmSync(d, { recursive: true, force: true });
		});

		const projectMacro = writeItemMacro(path.join(cwd, ".pi", "templates"), "decisions", "PROJECT");
		writeItemMacro(builtinDir, "decisions", "BUILTIN");

		const registry = createRendererRegistry({ cwd, userDir, builtinDir });
		const ref = registry.lookup("decisions");
		assert.ok(ref);
		assert.strictEqual(ref.templatePath, projectMacro);
	});

	it("user tier overrides builtin when project tier is empty", (t) => {
		const cwd = tmpDir("project-empty");
		const userDir = tmpDir("user");
		const builtinDir = tmpDir("builtin");
		t.after(() => {
			for (const d of [cwd, userDir, builtinDir]) fs.rmSync(d, { recursive: true, force: true });
		});

		const userMacro = writeItemMacro(userDir, "decisions", "USER");
		writeItemMacro(builtinDir, "decisions", "BUILTIN");

		const registry = createRendererRegistry({ cwd, userDir, builtinDir });
		const ref = registry.lookup("decisions");
		assert.ok(ref);
		assert.strictEqual(ref.templatePath, userMacro);
	});

	it("resolves canonical macro names for shipped block kinds via CANONICAL_MACRO_NAMES", (t) => {
		const cwd = tmpDir("project-empty");
		const userDir = tmpDir("user-empty");
		const builtinDir = tmpDir("builtin");
		t.after(() => {
			for (const d of [cwd, userDir, builtinDir]) fs.rmSync(d, { recursive: true, force: true });
		});

		// Exhaustive check across every kind in CANONICAL_MACRO_NAMES — adding a
		// new shipped kind requires extending the map and this test catches the
		// drift. Each kind's macro file is materialised so the registry's
		// three-tier file-existence check passes.
		for (const kind of Object.keys(CANONICAL_MACRO_NAMES)) {
			writeItemMacro(builtinDir, kind, "");
		}

		const registry = createRendererRegistry({ cwd, userDir, builtinDir });
		for (const [kind, expectedEntry] of Object.entries(CANONICAL_MACRO_NAMES)) {
			const ref = registry.lookup(kind);
			assert.ok(ref, `expected non-null ref for shipped kind ${kind}`);
			assert.strictEqual(
				ref.macroName,
				expectedEntry.macro_name,
				`canonical macro name mismatch for ${kind}: got ${ref.macroName}`,
			);
		}
	});

	it("falls back to render_<kind_underscored> for kinds not in CANONICAL_MACRO_NAMES", (t) => {
		const cwd = tmpDir("project-empty");
		const userDir = tmpDir("user-empty");
		const builtinDir = tmpDir("builtin");
		t.after(() => {
			for (const d of [cwd, userDir, builtinDir]) fs.rmSync(d, { recursive: true, force: true });
		});

		// `consumer-extension` is intentionally absent from CANONICAL_MACRO_NAMES.
		// The registry must still produce a stable macro-name derivation so that
		// downstream consumers can ship custom kinds without patching this map.
		writeItemMacro(builtinDir, "consumer-extension", "");

		const registry = createRendererRegistry({ cwd, userDir, builtinDir });
		const ref = registry.lookup("consumer-extension");
		assert.ok(ref);
		assert.strictEqual(ref.macroName, "render_consumer_extension");
	});

	it("register override takes precedence over filesystem resolution", (t) => {
		const cwd = tmpDir("project-empty");
		const userDir = tmpDir("user-empty");
		const builtinDir = tmpDir("builtin");
		t.after(() => {
			for (const d of [cwd, userDir, builtinDir]) fs.rmSync(d, { recursive: true, force: true });
		});

		// Filesystem also has a macro — register must win regardless.
		writeItemMacro(builtinDir, "decisions", "BUILTIN");

		const registry = createRendererRegistry({ cwd, userDir, builtinDir });
		registry.register("decisions", { templatePath: "/custom/path.md", macroName: "custom_render" });

		const ref = registry.lookup("decisions");
		assert.ok(ref);
		assert.strictEqual(ref.templatePath, "/custom/path.md");
		assert.strictEqual(ref.macroName, "custom_render");
	});

	it("observes filesystem additions made between lookups (lazy resolution)", (t) => {
		const cwd = tmpDir("project-empty");
		const userDir = tmpDir("user-empty");
		const builtinDir = tmpDir("builtin");
		t.after(() => {
			for (const d of [cwd, userDir, builtinDir]) fs.rmSync(d, { recursive: true, force: true });
		});

		const registry = createRendererRegistry({ cwd, userDir, builtinDir });
		assert.strictEqual(registry.lookup("decisions"), null);

		const added = writeItemMacro(builtinDir, "decisions", "");
		const ref = registry.lookup("decisions");
		assert.ok(ref);
		assert.strictEqual(ref.templatePath, added);
	});
});

describe("CANONICAL_MACRO_NAMES array_key column (FEAT-001 template-relocation arc)", () => {
	it("every entry carries both macro_name + array_key (registry shape extension)", () => {
		for (const [kind, entry] of Object.entries(CANONICAL_MACRO_NAMES)) {
			assert.strictEqual(typeof entry.macro_name, "string", `kind ${kind}: macro_name must be string`);
			assert.ok(entry.macro_name.length > 0, `kind ${kind}: macro_name must be non-empty`);
			assert.strictEqual(typeof entry.array_key, "string", `kind ${kind}: array_key must be string`);
			assert.ok(entry.array_key.length > 0, `kind ${kind}: array_key must be non-empty`);
		}
	});

	it("array_key values match conception.json verbatim for the 3 divergent kinds", () => {
		// Verbatim from packages/pi-context/samples/conception.json
		// block_kinds[]: framework-gaps→gaps, layer-plans→plans, spec-reviews→
		// reviews. These three are the load-bearing divergence the
		// original FGAP body never surfaced.
		assert.strictEqual(CANONICAL_MACRO_NAMES["framework-gaps"]?.array_key, "gaps");
		assert.strictEqual(CANONICAL_MACRO_NAMES["layer-plans"]?.array_key, "plans");
		assert.strictEqual(CANONICAL_MACRO_NAMES["spec-reviews"]?.array_key, "reviews");
	});

	it("array_key values match block_kind for the same-as-key entries", () => {
		// Per conception.json: decisions / features / issues / requirements /
		// research / tasks all use the block_kind as array_key. Asserting at
		// least the four named here (the four most-used in this repo's
		// substrate) — adding entries to the registry without sourcing
		// array_key from conception risks the divergence pattern recurring.
		assert.strictEqual(CANONICAL_MACRO_NAMES.decisions?.array_key, "decisions");
		assert.strictEqual(CANONICAL_MACRO_NAMES.features?.array_key, "features");
		assert.strictEqual(CANONICAL_MACRO_NAMES.research?.array_key, "research");
		assert.strictEqual(CANONICAL_MACRO_NAMES.tasks?.array_key, "tasks");
	});

	it("conventions entry uses array_key=rules per conception.json (additional divergence beyond the original-FGAP-named 3)", () => {
		// conventions schema's array_key is "rules" per
		// packages/pi-context/samples/conception.json — also divergent
		// from block_kind. Not in the original FGAP-named 6 (which were
		// the 6 new whole-block delegators landing in this arc), but
		// caught by the registry shape extension; asserting it here
		// guards against drift on the conventions delegator which already
		// existed in macros.md prior to this arc.
		assert.strictEqual(CANONICAL_MACRO_NAMES.conventions?.array_key, "rules");
	});
});
