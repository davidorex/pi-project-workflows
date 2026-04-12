import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createAgentLoader, parseAgentYaml } from "./agent-spec.js";
import { AgentNotFoundError, AgentParseError } from "./errors.js";

const FIXTURES_DIR = path.resolve(import.meta.dirname, "..", "test-fixtures");
const FIXTURE_AGENTS_DIR = path.join(FIXTURES_DIR, "agents");

function tmpProject(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "jit-agent-test-"));
}

function writeAgent(dir: string, name: string, content: string): string {
	fs.mkdirSync(dir, { recursive: true });
	const filePath = path.join(dir, `${name}.agent.yaml`);
	fs.writeFileSync(filePath, content);
	return filePath;
}

describe("parseAgentYaml", () => {
	it("parses the minimal fixture and resolves taskPromptTemplate to an absolute path", () => {
		const spec = parseAgentYaml(path.join(FIXTURE_AGENTS_DIR, "minimal.agent.yaml"));
		assert.strictEqual(spec.name, "minimal");
		assert.strictEqual(spec.model, "anthropic/claude-test-model");
		assert.ok(spec.taskPromptTemplate);
		assert.ok(path.isAbsolute(spec.taskPromptTemplate), "taskPromptTemplate must be absolute per D1");
		assert.strictEqual(spec.loadedFrom, FIXTURE_AGENTS_DIR);
	});

	it("parses the classifier fixture and resolves outputSchema to an absolute path", () => {
		const spec = parseAgentYaml(path.join(FIXTURE_AGENTS_DIR, "classifier.agent.yaml"));
		assert.strictEqual(spec.outputFormat, "json");
		assert.ok(spec.outputSchema);
		assert.ok(path.isAbsolute(spec.outputSchema), "outputSchema must be absolute per D1");
		assert.ok(spec.outputSchema.endsWith("result.schema.json"));
	});

	it("throws AgentParseError for a malformed YAML file", (t) => {
		const dir = tmpProject();
		t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
		const filePath = path.join(dir, "bad.agent.yaml");
		fs.writeFileSync(filePath, "name: bad\n  broken: [unclosed");
		assert.throws(() => parseAgentYaml(filePath), AgentParseError);
	});

	it("throws AgentParseError when the file does not exist", () => {
		assert.throws(() => parseAgentYaml("/nonexistent/path/ghost.agent.yaml"), AgentParseError);
	});
});

describe("createAgentLoader", () => {
	it("finds an agent in the project tier (.project/agents/)", (t) => {
		const cwd = tmpProject();
		t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
		writeAgent(path.join(cwd, ".project", "agents"), "proj-agent", "name: proj-agent\nmodel: test/m\n");

		const load = createAgentLoader({ cwd });
		const spec = load("proj-agent");
		assert.strictEqual(spec.name, "proj-agent");
		assert.strictEqual(spec.loadedFrom, path.join(cwd, ".project", "agents"));
	});

	it("finds an agent in the user tier when project tier is empty", (t) => {
		const cwd = tmpProject();
		const userDir = tmpProject();
		t.after(() => {
			fs.rmSync(cwd, { recursive: true, force: true });
			fs.rmSync(userDir, { recursive: true, force: true });
		});
		writeAgent(userDir, "user-agent", "name: user-agent\nmodel: test/m\n");

		const load = createAgentLoader({ cwd, userDir });
		const spec = load("user-agent");
		assert.strictEqual(spec.name, "user-agent");
		assert.strictEqual(spec.loadedFrom, userDir);
	});

	it("finds an agent in the builtin tier when project and user tiers are empty", (t) => {
		const cwd = tmpProject();
		const userDir = tmpProject();
		const builtinDir = tmpProject();
		t.after(() => {
			for (const d of [cwd, userDir, builtinDir]) fs.rmSync(d, { recursive: true, force: true });
		});
		writeAgent(builtinDir, "builtin-agent", "name: builtin-agent\nmodel: test/m\n");

		const load = createAgentLoader({ cwd, userDir, builtinDir });
		const spec = load("builtin-agent");
		assert.strictEqual(spec.name, "builtin-agent");
		assert.strictEqual(spec.loadedFrom, builtinDir);
	});

	it("project tier takes precedence over user and builtin (first match wins)", (t) => {
		const cwd = tmpProject();
		const userDir = tmpProject();
		const builtinDir = tmpProject();
		t.after(() => {
			for (const d of [cwd, userDir, builtinDir]) fs.rmSync(d, { recursive: true, force: true });
		});
		writeAgent(path.join(cwd, ".project", "agents"), "override", "name: override\nmodel: from-project\n");
		writeAgent(userDir, "override", "name: override\nmodel: from-user\n");
		writeAgent(builtinDir, "override", "name: override\nmodel: from-builtin\n");

		const load = createAgentLoader({ cwd, userDir, builtinDir });
		const spec = load("override");
		assert.strictEqual(spec.model, "from-project");
	});

	it("does NOT search .pi/agents/ per D3", (t) => {
		const cwd = tmpProject();
		const userDir = tmpProject();
		t.after(() => {
			fs.rmSync(cwd, { recursive: true, force: true });
			fs.rmSync(userDir, { recursive: true, force: true });
		});
		writeAgent(path.join(cwd, ".pi", "agents"), "shadow", "name: shadow\nmodel: from-pi\n");

		const load = createAgentLoader({ cwd, userDir });
		assert.throws(() => load("shadow"), AgentNotFoundError);
	});

	it("throws AgentNotFoundError with all search paths listed", (t) => {
		const cwd = tmpProject();
		const userDir = tmpProject();
		const builtinDir = tmpProject();
		t.after(() => {
			for (const d of [cwd, userDir, builtinDir]) fs.rmSync(d, { recursive: true, force: true });
		});

		const load = createAgentLoader({ cwd, userDir, builtinDir });
		try {
			load("missing");
			assert.fail("should have thrown");
		} catch (err) {
			assert.ok(err instanceof AgentNotFoundError);
			assert.strictEqual(err.searchPaths.length, 3);
			assert.ok(err.searchPaths[0].startsWith(cwd));
			assert.ok(err.searchPaths[1].startsWith(userDir));
			assert.ok(err.searchPaths[2].startsWith(builtinDir));
		}
	});
});
