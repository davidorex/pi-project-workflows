import { describe, it } from "node:test";
import assert from "node:assert";
import { createTemplateEnv, renderTemplateFile } from "./template.ts";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

describe("analyzer template inheritance", () => {
  const builtinDir = path.resolve(import.meta.dirname, "..", "templates");

  it("structure analyzer inherits base and overrides blocks", () => {
    const env = createTemplateEnv("/nonexistent", builtinDir);
    const result = renderTemplateFile(env, "analyzers/structure.md", {});
    assert.ok(result.includes("code structure analyst"));
    assert.ok(result.includes("Architecture"));
    assert.ok(result.includes("Module boundaries"));
    assert.ok(!result.includes("Test coverage"));
  });

  it("quality analyzer inherits base and overrides blocks", () => {
    const env = createTemplateEnv("/nonexistent", builtinDir);
    const result = renderTemplateFile(env, "analyzers/quality.md", {});
    assert.ok(result.includes("code quality analyst"));
    assert.ok(result.includes("Test coverage"));
    assert.ok(!result.includes("Architecture"));
  });

  it("pattern analyzer inherits base and overrides blocks", () => {
    const env = createTemplateEnv("/nonexistent", builtinDir);
    const result = renderTemplateFile(env, "analyzers/patterns.md", {});
    assert.ok(result.includes("design pattern analyst"));
    assert.ok(result.includes("Design patterns"));
    assert.ok(result.includes("Anti-patterns"));
  });

  it("all three produce different output from the same base", () => {
    const env = createTemplateEnv("/nonexistent", builtinDir);
    const s = renderTemplateFile(env, "analyzers/structure.md", {});
    const q = renderTemplateFile(env, "analyzers/quality.md", {});
    const p = renderTemplateFile(env, "analyzers/patterns.md", {});
    // All contain the shared preamble pattern
    assert.ok(s.includes("Given an exploration summary"));
    assert.ok(q.includes("Given an exploration summary"));
    assert.ok(p.includes("Given an exploration summary"));
    // But different identities
    assert.ok(s.includes("structure"));
    assert.ok(q.includes("quality"));
    assert.ok(p.includes("pattern"));
  });

  it("project template shadows builtin", () => {
    const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), "pi-tmpl-proj-"));
    const projectTemplates = path.join(tmpProject, ".pi", "templates", "analyzers");
    fs.mkdirSync(projectTemplates, { recursive: true });

    fs.writeFileSync(path.join(projectTemplates, "structure.md"), [
      '{% extends "analyzers/base-analyzer.md" %}',
      "{% block identity %}You are a CUSTOM structure analyst.{% endblock %}",
      "{% block checklist %}",
      "1. **Custom**: Project-specific check",
      "{% endblock %}",
    ].join("\n"));

    const env = createTemplateEnv(tmpProject, builtinDir);
    const result = renderTemplateFile(env, "analyzers/structure.md", {});
    assert.ok(result.includes("CUSTOM structure analyst"));
    assert.ok(result.includes("Project-specific check"));
    assert.ok(!result.includes("Module boundaries"));

    fs.rmSync(tmpProject, { recursive: true });
  });
});
