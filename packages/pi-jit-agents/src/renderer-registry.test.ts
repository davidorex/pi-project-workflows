import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createRendererRegistry } from "./renderer-registry.js";

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
			"{% macro render_decisions(d) %}{{ d.id }}{% endmacro %}",
		);

		const registry = createRendererRegistry({ cwd, userDir, builtinDir });
		const ref = registry.lookup("decisions");
		assert.ok(ref, "expected non-null ItemMacroRef from builtin tier");
		assert.strictEqual(ref.templatePath, expectedPath);
		assert.strictEqual(ref.macroName, "render_decisions");
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

	it("translates hyphens to underscores in the default macro name", (t) => {
		const cwd = tmpDir("project-empty");
		const userDir = tmpDir("user-empty");
		const builtinDir = tmpDir("builtin");
		t.after(() => {
			for (const d of [cwd, userDir, builtinDir]) fs.rmSync(d, { recursive: true, force: true });
		});

		writeItemMacro(builtinDir, "framework-gaps", "");

		const registry = createRendererRegistry({ cwd, userDir, builtinDir });
		const ref = registry.lookup("framework-gaps");
		assert.ok(ref);
		assert.strictEqual(ref.macroName, "render_framework_gaps");
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
