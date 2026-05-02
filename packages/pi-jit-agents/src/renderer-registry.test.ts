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
		for (const [kind, expectedMacroName] of Object.entries(CANONICAL_MACRO_NAMES)) {
			const ref = registry.lookup(kind);
			assert.ok(ref, `expected non-null ref for shipped kind ${kind}`);
			assert.strictEqual(
				ref.macroName,
				expectedMacroName,
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
