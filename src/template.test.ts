import { describe, it } from "node:test";
import assert from "node:assert";
import { createTemplateEnv, renderTemplate, renderTemplateFile } from "./template.ts";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("renderTemplate", () => {
  it("renders variable substitution", () => {
    const env = createTemplateEnv("/nonexistent");
    const result = renderTemplate(env, "Hello {{ name }}, you are {{ role }}", { name: "Alice", role: "analyst" });
    assert.strictEqual(result, "Hello Alice, you are analyst");
  });

  it("passes through plain text unchanged", () => {
    const env = createTemplateEnv("/nonexistent");
    const result = renderTemplate(env, "No templates here. Just markdown.", {});
    assert.strictEqual(result, "No templates here. Just markdown.");
  });

  it("renders if/else conditionals", () => {
    const env = createTemplateEnv("/nonexistent");
    const tmpl = "{% if verbose %}Detailed output{% else %}Brief output{% endif %}";
    assert.strictEqual(renderTemplate(env, tmpl, { verbose: true }), "Detailed output");
    assert.strictEqual(renderTemplate(env, tmpl, { verbose: false }), "Brief output");
  });

  it("renders for loops", () => {
    const env = createTemplateEnv("/nonexistent");
    const tmpl = "{% for item in items %}- {{ item }}\n{% endfor %}";
    const result = renderTemplate(env, tmpl, { items: ["a", "b", "c"] });
    assert.ok(result.includes("- a"));
    assert.ok(result.includes("- b"));
    assert.ok(result.includes("- c"));
  });

  it("handles undefined variables gracefully (empty string)", () => {
    const env = createTemplateEnv("/nonexistent");
    const result = renderTemplate(env, "Hello {{ name }}", {});
    assert.strictEqual(result, "Hello ");
  });

  it("preserves ${{ }} workflow expressions (not interpreted)", () => {
    const env = createTemplateEnv("/nonexistent");
    const result = renderTemplate(env, "Use ${{ steps.explore.output }}", {});
    assert.strictEqual(result, "Use ${{ steps.explore.output }}");
  });

  it("renders nested object access", () => {
    const env = createTemplateEnv("/nonexistent");
    const result = renderTemplate(env, "File: {{ context.file }}", { context: { file: "main.ts" } });
    assert.strictEqual(result, "File: main.ts");
  });
});

describe("renderTemplateFile", () => {
  it("renders a template file from the search path", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-tmpl-test-"));
    fs.writeFileSync(path.join(tmpDir, "test.md"), "Hello {{ name }}");

    const env = createTemplateEnv("/nonexistent", tmpDir);
    const result = renderTemplateFile(env, "test.md", { name: "World" });
    assert.strictEqual(result, "Hello World");

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("supports {% extends %} inheritance", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-tmpl-test-"));

    fs.writeFileSync(path.join(tmpDir, "base.md"), [
      "# {{ title }}",
      "{% block intro %}Default intro{% endblock %}",
      "{% block body %}Default body{% endblock %}",
    ].join("\n"));

    fs.writeFileSync(path.join(tmpDir, "child.md"), [
      '{% extends "base.md" %}',
      "{% block body %}Custom body for {{ focus }}{% endblock %}",
    ].join("\n"));

    const env = createTemplateEnv("/nonexistent", tmpDir);
    const result = renderTemplateFile(env, "child.md", { title: "Report", focus: "security" });
    assert.ok(result.includes("# Report"), "should render parent title");
    assert.ok(result.includes("Default intro"), "should inherit intro block");
    assert.ok(result.includes("Custom body for security"), "should override body block");
    assert.ok(!result.includes("Default body"), "should NOT include default body");

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("supports {% include %}", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-tmpl-test-"));

    fs.writeFileSync(path.join(tmpDir, "fragment.md"), "This is a reusable fragment.");
    fs.writeFileSync(path.join(tmpDir, "main.md"), [
      "# Main",
      '{% include "fragment.md" %}',
      "End.",
    ].join("\n"));

    const env = createTemplateEnv("/nonexistent", tmpDir);
    const result = renderTemplateFile(env, "main.md", {});
    assert.ok(result.includes("# Main"));
    assert.ok(result.includes("This is a reusable fragment."));
    assert.ok(result.includes("End."));

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("supports {% macro %}", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-tmpl-test-"));

    fs.writeFileSync(path.join(tmpDir, "macros.md"), [
      "{% macro greeting(name) %}Hello, {{ name }}!{% endmacro %}",
    ].join("\n"));
    fs.writeFileSync(path.join(tmpDir, "main.md"), [
      '{% from "macros.md" import greeting %}',
      "{{ greeting('Alice') }}",
      "{{ greeting('Bob') }}",
    ].join("\n"));

    const env = createTemplateEnv("/nonexistent", tmpDir);
    const result = renderTemplateFile(env, "main.md", {});
    assert.ok(result.includes("Hello, Alice!"));
    assert.ok(result.includes("Hello, Bob!"));

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("project templates shadow builtin templates", () => {
    const builtinDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-tmpl-builtin-"));
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-tmpl-project-"));

    const projectTemplates = path.join(projectDir, ".pi", "templates");
    fs.mkdirSync(projectTemplates, { recursive: true });

    fs.writeFileSync(path.join(builtinDir, "shared.md"), "BUILTIN version");
    fs.writeFileSync(path.join(projectTemplates, "shared.md"), "PROJECT version");

    const env = createTemplateEnv(projectDir, builtinDir);
    const result = renderTemplateFile(env, "shared.md", {});
    assert.strictEqual(result, "PROJECT version");

    fs.rmSync(builtinDir, { recursive: true });
    fs.rmSync(projectDir, { recursive: true });
  });
});

describe("createTemplateEnv", () => {
  it("creates an environment that renders plain text unchanged", () => {
    const env = createTemplateEnv("/nonexistent");
    const result = renderTemplate(env, "Just plain text", {});
    assert.strictEqual(result, "Just plain text");
  });

  it("works when no template directories exist", () => {
    const env = createTemplateEnv("/definitely/does/not/exist");
    const result = renderTemplate(env, "Still works: {{ x }}", { x: 42 });
    assert.strictEqual(result, "Still works: 42");
  });
});
