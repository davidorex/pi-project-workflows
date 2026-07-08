import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { writeBootstrapPointer } from "@davidorex/pi-context/context-dir";
import { createAgentLoader, parseAgentYaml } from "./agent-spec.js";
import { AgentNotFoundError, AgentParseError } from "./errors.js";

const FIXTURES_DIR = path.resolve(import.meta.dirname, "..", "test-fixtures");
const FIXTURE_AGENTS_DIR = path.join(FIXTURES_DIR, "agents");

function tmpProject(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jit-agent-test-"));
	writeBootstrapPointer(dir, ".project");
	return dir;
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

describe("parseAgentYaml — existence-gated spec-path resolution", () => {
	it("absolutizes a relative template ref when the adjacent file EXISTS", (t) => {
		const dir = tmpProject();
		t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
		// Adjacent file present → absolutized against the spec dir.
		fs.writeFileSync(path.join(dir, "task.md"), "adjacent task template");
		const file = writeAgent(dir, "adj", "name: adj\nmodel: test/m\nprompt:\n  task:\n    template: task.md\n");
		const spec = parseAgentYaml(file);
		assert.ok(spec.taskPromptTemplate);
		assert.ok(path.isAbsolute(spec.taskPromptTemplate), "adjacent template must absolutize");
		assert.strictEqual(spec.taskPromptTemplate, path.join(dir, "task.md"));
	});

	it("adjacent probe wins over the sibling probe even when siblingProbe is enabled", (t) => {
		const dir = tmpProject();
		t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
		// Both an adjacent file AND a package-root sibling file exist for the same
		// relative ref. Adjacent is probed first and must win regardless of tier.
		const agentsDir = path.join(dir, "agents");
		const schemasDir = path.join(dir, "schemas");
		fs.mkdirSync(agentsDir, { recursive: true });
		fs.mkdirSync(schemasDir, { recursive: true });
		fs.mkdirSync(path.join(agentsDir, "schemas"), { recursive: true });
		fs.writeFileSync(path.join(agentsDir, "schemas", "findings.schema.json"), "{}");
		fs.writeFileSync(path.join(schemasDir, "findings.schema.json"), "{}");
		const file = writeAgent(
			agentsDir,
			"adjwins",
			"name: adjwins\nmodel: test/m\noutput:\n  format: json\n  schema: schemas/findings.schema.json\n",
		);
		const spec = parseAgentYaml(file, { siblingProbe: true });
		assert.strictEqual(spec.outputSchema, path.join(agentsDir, "schemas", "findings.schema.json"));
	});

	it("preserves a non-adjacent relative template ref as a loader-resolvable name", (t) => {
		const dir = tmpProject();
		t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
		// No `subdir/task.md` adjacent → the ref survives as a bare name for the
		// Nunjucks loader's three-tier search (the bundled-spec shape).
		const file = writeAgent(
			dir,
			"nonadj",
			"name: nonadj\nmodel: test/m\nprompt:\n  task:\n    template: subdir/task.md\n",
		);
		const spec = parseAgentYaml(file);
		assert.strictEqual(spec.taskPromptTemplate, "subdir/task.md");
		assert.ok(!path.isAbsolute(spec.taskPromptTemplate as string), "non-adjacent ref must stay relative");
	});

	it("absolutizes a relative schema ref against the spec dir's PARENT for a BUNDLED-tier spec (siblingProbe on)", (t) => {
		const dir = tmpProject();
		t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
		// Bundled layout: spec lives in agents/, its schema in a SIBLING schemas/
		// at the package root (the parent of agents/). The adjacent probe misses;
		// the parent probe finds it — but ONLY because the bundled tier enables it
		// (siblingProbe: true, the flag createAgentLoader threads for builtinDir).
		const agentsDir = path.join(dir, "agents");
		const schemasDir = path.join(dir, "schemas");
		fs.mkdirSync(agentsDir, { recursive: true });
		fs.mkdirSync(schemasDir, { recursive: true });
		fs.writeFileSync(path.join(schemasDir, "findings.schema.json"), "{}");
		const file = writeAgent(
			agentsDir,
			"sib",
			"name: sib\nmodel: test/m\noutput:\n  format: json\n  schema: schemas/findings.schema.json\n",
		);
		const spec = parseAgentYaml(file, { siblingProbe: true });
		assert.ok(spec.outputSchema);
		assert.ok(path.isAbsolute(spec.outputSchema), "sibling schema ref must absolutize for the bundled tier");
		assert.strictEqual(spec.outputSchema, path.join(schemasDir, "findings.schema.json"));
	});

	it("does NOT run the sibling probe for a LOCAL-tier spec — a same-basename sibling schema cannot shadow (siblingProbe off)", (t) => {
		const dir = tmpProject();
		t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
		// Same on-disk shape as the bundled case — a sibling schemas/x.schema.json
		// EXISTS at the parent of agents/ (in a real substrate this would be a
		// pi-context BLOCK schema). With the default (local/user tier) the parent
		// probe is OFF, so the ref must survive as a bare name rather than silently
		// absolutizing onto the block schema and mis-validating agent output.
		const agentsDir = path.join(dir, "agents");
		const schemasDir = path.join(dir, "schemas");
		fs.mkdirSync(agentsDir, { recursive: true });
		fs.mkdirSync(schemasDir, { recursive: true });
		fs.writeFileSync(path.join(schemasDir, "phase.schema.json"), "{}");
		const file = writeAgent(
			agentsDir,
			"local",
			"name: local\nmodel: test/m\noutput:\n  format: json\n  schema: schemas/phase.schema.json\n",
		);
		const spec = parseAgentYaml(file);
		assert.strictEqual(spec.outputSchema, "schemas/phase.schema.json");
		assert.ok(
			!path.isAbsolute(spec.outputSchema as string),
			"local-tier ref must stay a bare name, not shadow onto the sibling",
		);
	});

	it("preserves a relative schema ref that resolves at NEITHER probe as a bare name (bundled tier)", (t) => {
		const dir = tmpProject();
		t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
		// Bundled tier (siblingProbe on) but no adjacent and no parent-sibling file
		// → the ref survives unchanged; its read fails loudly downstream
		// (buildPhantomTool) rather than mis-resolving.
		const agentsDir = path.join(dir, "agents");
		const file = writeAgent(
			agentsDir,
			"noschema",
			"name: noschema\nmodel: test/m\noutput:\n  format: json\n  schema: schemas/absent.schema.json\n",
		);
		const spec = parseAgentYaml(file, { siblingProbe: true });
		assert.strictEqual(spec.outputSchema, "schemas/absent.schema.json");
		assert.ok(!path.isAbsolute(spec.outputSchema as string), "non-resolving schema ref must stay relative");
	});

	it("returns a `block:` sentinel unchanged", (t) => {
		const dir = tmpProject();
		t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
		const file = writeAgent(
			dir,
			"blk",
			"name: blk\nmodel: test/m\nprompt:\n  task:\n    template: 'block:task-context'\n",
		);
		const spec = parseAgentYaml(file);
		assert.strictEqual(spec.taskPromptTemplate, "block:task-context");
	});

	it("returns an absolute template ref unchanged (passthrough)", (t) => {
		const dir = tmpProject();
		t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
		const abs = path.join(dir, "elsewhere", "task.md");
		const file = writeAgent(dir, "absref", `name: absref\nmodel: test/m\nprompt:\n  task:\n    template: ${abs}\n`);
		const spec = parseAgentYaml(file);
		assert.strictEqual(spec.taskPromptTemplate, abs);
	});
});

describe("parseAgentYaml — contextBlocks union form", () => {
	function withSpec(t: { after: (fn: () => void) => void }, body: string): string {
		const dir = tmpProject();
		t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
		return writeAgent(dir, "ctx", `name: ctx\nmodel: test/m\n${body}`);
	}

	it("preserves bare-string array form (regression)", (t) => {
		const file = withSpec(t, "contextBlocks:\n  - requirements\n  - decisions\n");
		const spec = parseAgentYaml(file);
		assert.deepStrictEqual(spec.contextBlocks, ["requirements", "decisions"]);
	});

	it("parses a mixed array of strings and objects", (t) => {
		const file = withSpec(
			t,
			"contextBlocks:\n  - requirements\n  - name: features\n    item: FEAT-001\n    depth: 1\n",
		);
		const spec = parseAgentYaml(file);
		assert.deepStrictEqual(spec.contextBlocks, ["requirements", { name: "features", item: "FEAT-001", depth: 1 }]);
	});

	it("parses an object entry with all optional fields populated", (t) => {
		const file = withSpec(
			t,
			`${[
				"contextBlocks:",
				"  - name: features",
				"    item: FEAT-001",
				"    focus:",
				"      story: STORY-001",
				"    depth: 2",
			].join("\n")}\n`,
		);
		const spec = parseAgentYaml(file);
		assert.deepStrictEqual(spec.contextBlocks, [
			{ name: "features", item: "FEAT-001", focus: { story: "STORY-001" }, depth: 2 },
		]);
	});

	it("throws AgentParseError when an object entry is missing `name`", (t) => {
		const file = withSpec(t, "contextBlocks:\n  - item: FEAT-001\n");
		assert.throws(
			() => parseAgentYaml(file),
			(err: unknown) => {
				assert.ok(err instanceof AgentParseError);
				assert.match(err.message, /contextBlocks\[0\].*name/);
				return true;
			},
		);
	});

	it("throws AgentParseError when `depth` is negative", (t) => {
		const file = withSpec(t, "contextBlocks:\n  - name: features\n    depth: -1\n");
		assert.throws(
			() => parseAgentYaml(file),
			(err: unknown) => {
				assert.ok(err instanceof AgentParseError);
				assert.match(err.message, /contextBlocks\[0\]\.depth/);
				return true;
			},
		);
	});

	it("throws AgentParseError when an entry is neither string nor object", (t) => {
		const file = withSpec(t, "contextBlocks:\n  - 42\n");
		assert.throws(
			() => parseAgentYaml(file),
			(err: unknown) => {
				assert.ok(err instanceof AgentParseError);
				assert.match(err.message, /contextBlocks\[0\].*string or an object/);
				return true;
			},
		);
	});

	it("throws AgentParseError when `focus` has a non-string value", (t) => {
		const file = withSpec(t, "contextBlocks:\n  - name: features\n    focus:\n      story: 123\n");
		assert.throws(
			() => parseAgentYaml(file),
			(err: unknown) => {
				assert.ok(err instanceof AgentParseError);
				assert.match(err.message, /contextBlocks\[0\]\.focus\.story/);
				return true;
			},
		);
	});

	it("AgentContract projection inherits the union shape (type-only smoke)", (t) => {
		const file = withSpec(t, "contextBlocks:\n  - requirements\n  - name: features\n    item: FEAT-001\n");
		const spec = parseAgentYaml(file);
		// Assignment-compatibility check: AgentContract.contextBlocks is the same
		// union; if the type were narrowed, this would fail tsc in `npm run check`.
		const contract: { contextBlocks?: (string | { name: string; item?: string })[] } = {
			contextBlocks: spec.contextBlocks,
		};
		assert.strictEqual(contract.contextBlocks?.length, 2);
		assert.strictEqual(contract.contextBlocks?.[0], "requirements");
		assert.deepStrictEqual(contract.contextBlocks?.[1], { name: "features", item: "FEAT-001" });
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

	it("enables the sibling probe ONLY for a spec matched from the builtin tier", (t) => {
		const cwd = tmpProject();
		const userDir = tmpProject();
		const builtinRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jit-agent-builtin-"));
		t.after(() => {
			for (const d of [cwd, userDir, builtinRoot]) fs.rmSync(d, { recursive: true, force: true });
		});
		// Bundled package layout: agents/ and schemas/ as package-root siblings.
		const builtinAgents = path.join(builtinRoot, "agents");
		const builtinSchemas = path.join(builtinRoot, "schemas");
		fs.mkdirSync(builtinSchemas, { recursive: true });
		fs.writeFileSync(path.join(builtinSchemas, "out.schema.json"), "{}");
		writeAgent(
			builtinAgents,
			"bundled",
			"name: bundled\nmodel: test/m\noutput:\n  format: json\n  schema: schemas/out.schema.json\n",
		);

		const load = createAgentLoader({ cwd, userDir, builtinDir: builtinAgents });
		const spec = load("bundled");
		assert.strictEqual(spec.loadedFrom, builtinAgents);
		assert.ok(path.isAbsolute(spec.outputSchema as string), "builtin-tier spec must absolutize its sibling schema ref");
		assert.strictEqual(spec.outputSchema, path.join(builtinSchemas, "out.schema.json"));
	});

	it("does NOT enable the sibling probe for a project-tier spec even when a sibling schema exists", (t) => {
		const cwd = tmpProject();
		const userDir = tmpProject();
		t.after(() => {
			for (const d of [cwd, userDir]) fs.rmSync(d, { recursive: true, force: true });
		});
		// Project-tier layout mirroring the substrate: .project/agents/ spec with a
		// same-basename schema present in the sibling .project/schemas/. The probe
		// stays OFF for this tier, so the ref must survive as a bare name.
		const substrateRoot = path.join(cwd, ".project");
		fs.mkdirSync(path.join(substrateRoot, "schemas"), { recursive: true });
		fs.writeFileSync(path.join(substrateRoot, "schemas", "phase.schema.json"), "{}");
		writeAgent(
			path.join(substrateRoot, "agents"),
			"proj",
			"name: proj\nmodel: test/m\noutput:\n  format: json\n  schema: schemas/phase.schema.json\n",
		);

		const load = createAgentLoader({ cwd, userDir });
		const spec = load("proj");
		assert.strictEqual(spec.loadedFrom, path.join(substrateRoot, "agents"));
		assert.strictEqual(spec.outputSchema, "schemas/phase.schema.json");
		assert.ok(
			!path.isAbsolute(spec.outputSchema as string),
			"project-tier ref must not shadow onto the sibling block schema",
		);
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

	it("pointer-less cwd omits the project tier and throws AgentNotFoundError, not BootstrapNotFoundError (FGAP-074 C3)", (t) => {
		// Deliberately pointer-less mkdtemp — NO writeBootstrapPointer. The project
		// tier is omitted; the loader still searches user/builtin and ultimately
		// throws its normal not-found error rather than BootstrapNotFoundError.
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "jit-agent-noptr-"));
		const userDir = tmpProject();
		t.after(() => {
			fs.rmSync(cwd, { recursive: true, force: true });
			fs.rmSync(userDir, { recursive: true, force: true });
		});

		const load = createAgentLoader({ cwd, userDir });
		try {
			load("missing");
			assert.fail("should have thrown");
		} catch (err) {
			assert.ok(err instanceof Error);
			assert.notStrictEqual(err.name, "BootstrapNotFoundError");
			assert.ok(err instanceof AgentNotFoundError);
			// project tier omitted → only the user-tier search path remains
			assert.strictEqual(err.searchPaths.length, 1);
			assert.ok(err.searchPaths[0].startsWith(userDir));
		}
	});
});
