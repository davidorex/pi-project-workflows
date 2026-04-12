import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createTemplateEnv, renderTemplate, renderTemplateFile } from "./template.js";

function tmpDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "jit-template-test-"));
}

describe("createTemplateEnv", () => {
	it("returns a working environment with no tier directories (no-op loader)", (t) => {
		const cwd = tmpDir();
		const userDir = tmpDir();
		t.after(() => {
			fs.rmSync(cwd, { recursive: true, force: true });
			fs.rmSync(userDir, { recursive: true, force: true });
		});
		const env = createTemplateEnv({ cwd, userDir });
		const out = env.renderString("hello {{ name }}", { name: "world" });
		assert.strictEqual(out, "hello world");
	});

	it("first match wins across the three tiers", (t) => {
		const cwd = tmpDir();
		const userDir = tmpDir();
		const builtinDir = tmpDir();
		t.after(() => {
			for (const d of [cwd, userDir, builtinDir]) fs.rmSync(d, { recursive: true, force: true });
		});
		fs.mkdirSync(path.join(cwd, ".project", "templates"), { recursive: true });
		fs.writeFileSync(path.join(cwd, ".project", "templates", "greet.md"), "from-project");
		fs.writeFileSync(path.join(userDir, "greet.md"), "from-user");
		fs.writeFileSync(path.join(builtinDir, "greet.md"), "from-builtin");

		const env = createTemplateEnv({ cwd, userDir, builtinDir });
		assert.strictEqual(env.render("greet.md", {}), "from-project");
	});

	it("does NOT search .pi/templates/ per D3", (t) => {
		const cwd = tmpDir();
		const userDir = tmpDir();
		t.after(() => {
			fs.rmSync(cwd, { recursive: true, force: true });
			fs.rmSync(userDir, { recursive: true, force: true });
		});
		fs.mkdirSync(path.join(cwd, ".pi", "templates"), { recursive: true });
		fs.writeFileSync(path.join(cwd, ".pi", "templates", "shadow.md"), "from-pi");

		const env = createTemplateEnv({ cwd, userDir });
		assert.throws(() => env.render("shadow.md", {}));
	});
});

describe("renderTemplate", () => {
	it("protects ${{ }} workflow expressions from Nunjucks", (t) => {
		const cwd = tmpDir();
		const userDir = tmpDir();
		t.after(() => {
			fs.rmSync(cwd, { recursive: true, force: true });
			fs.rmSync(userDir, { recursive: true, force: true });
		});
		const env = createTemplateEnv({ cwd, userDir });
		const out = renderTemplate(env, "before ${{ steps.X }} after {{ name }}", { name: "world" });
		assert.strictEqual(out, "before ${{ steps.X }} after world");
	});
});

describe("renderTemplateFile", () => {
	it("reads an absolute-path template directly (bypasses loader)", (t) => {
		const cwd = tmpDir();
		const userDir = tmpDir();
		const tmplDir = tmpDir();
		t.after(() => {
			for (const d of [cwd, userDir, tmplDir]) fs.rmSync(d, { recursive: true, force: true });
		});
		const tmplPath = path.join(tmplDir, "abs.md");
		fs.writeFileSync(tmplPath, "hello {{ who }}");

		const env = createTemplateEnv({ cwd, userDir });
		const out = renderTemplateFile(env, tmplPath, { who: "jit" });
		assert.strictEqual(out, "hello jit");
	});
});
