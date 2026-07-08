import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { writeBootstrapPointer } from "@davidorex/pi-context/context-dir";
import {
	AgentNotFoundError,
	bundledTemplateDir,
	compileAgent,
	createAgentLoader,
	createTemplateEnv,
} from "@davidorex/pi-jit-agents";
import { dispatchLoadContext } from "./dispatch-loader.js";

// The user tier defaults to the developer machine's real ~/.pi/agent/agents/;
// tests pin it to an empty tmp dir (the documented LoadContext test hook) so
// resolution outcomes are machine-independent. builtinDir + cwd stay exactly
// what dispatchLoadContext produced.
function pinnedUserDir(tmpDir: string): string {
	const dir = path.join(tmpDir, "user-agents-empty");
	fs.mkdirSync(dir, { recursive: true });
	return dir;
}

describe("dispatchLoadContext", () => {
	let tmpDir: string;
	let substrateRoot: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-agent-dispatch-loader-"));
		const substrateName = "substrate";
		substrateRoot = path.join(tmpDir, substrateName);
		// Substrate with an EMPTY agents/ dir — the fresh-substrate shape the
		// builtin tier exists to serve.
		fs.mkdirSync(path.join(substrateRoot, "agents"), { recursive: true });
		writeBootstrapPointer(tmpDir, substrateName);
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("builtinDir points at the bundled pi-workflows agents/ dir on disk (investigator present)", () => {
		const loadCtx = dispatchLoadContext(tmpDir);
		assert.equal(loadCtx.cwd, tmpDir);
		assert.ok(loadCtx.builtinDir, "builtinDir must be set");
		assert.ok(fs.existsSync(loadCtx.builtinDir as string), `builtinDir missing on disk: ${loadCtx.builtinDir}`);
		assert.ok(fs.existsSync(path.join(loadCtx.builtinDir as string, "investigator.agent.yaml")));
	});

	it("resolves a bundled spec from a fresh substrate whose agents/ dir is empty", () => {
		const loadAgent = createAgentLoader({ ...dispatchLoadContext(tmpDir), userDir: pinnedUserDir(tmpDir) });
		const spec = loadAgent("investigator");
		assert.equal(spec.name, "investigator");
		assert.equal(spec.loadedFrom, dispatchLoadContext(tmpDir).builtinDir);
	});

	it("a local substrate spec of the same name wins over the bundled one", () => {
		const localBody = `name: investigator
role: sensor
description: local-override
prompt:
  system: "system"
  task: "task"
input:
  type: object
  properties:
    in: { type: string }
output:
  format: json
`;
		fs.writeFileSync(path.join(substrateRoot, "agents", "investigator.agent.yaml"), localBody, "utf8");
		const loadAgent = createAgentLoader({ ...dispatchLoadContext(tmpDir), userDir: pinnedUserDir(tmpDir) });
		const spec = loadAgent("investigator");
		assert.equal(spec.description, "local-override");
		assert.equal(spec.loadedFrom, path.join(substrateRoot, "agents"));
	});

	it("unknown name throws AgentNotFoundError carrying all three search tiers", () => {
		const loadAgent = createAgentLoader({ ...dispatchLoadContext(tmpDir), userDir: pinnedUserDir(tmpDir) });
		assert.throws(
			() => loadAgent("definitely-not-a-spec-anywhere"),
			(err: unknown) => {
				assert.ok(err instanceof AgentNotFoundError);
				assert.equal(err.searchPaths.length, 3);
				return true;
			},
		);
	});

	// End-to-end: a bundled spec loaded from a fresh substrate (empty agents/ dir)
	// must also COMPILE — its task/system templates have to resolve against the
	// bundled pi-jit-agents template tier (builtinDir = bundledTemplateDir()), the
	// way call-agent-tool.ts / work-order-loop.ts now build the env. A resolution
	// miss renders an empty prompt, which is what these assertions guard against.
	function pinnedTemplateUserDir(dir: string): string {
		const d = path.join(dir, "user-templates-empty");
		fs.mkdirSync(d, { recursive: true });
		return d;
	}

	it("bundled `investigator` compiles to a non-empty rendered task prompt via the bundled template tier", () => {
		const loadAgent = createAgentLoader({ ...dispatchLoadContext(tmpDir), userDir: pinnedUserDir(tmpDir) });
		const spec = loadAgent("investigator");
		const env = createTemplateEnv({
			cwd: tmpDir,
			builtinDir: bundledTemplateDir(),
			userDir: pinnedTemplateUserDir(tmpDir),
		});
		const compiled = compileAgent(spec, { env, input: {}, cwd: tmpDir });
		assert.equal(compiled.spec.name, "investigator");
		assert.ok(
			compiled.taskPrompt.trim().length > 0,
			"investigator task prompt must render non-empty from the bundled template",
		);
	});

	it("bundled `quality-analyzer` compiles non-empty — proves the extends chain resolves (quality.md extends analyzers/base-analyzer.md)", () => {
		const loadAgent = createAgentLoader({ ...dispatchLoadContext(tmpDir), userDir: pinnedUserDir(tmpDir) });
		const spec = loadAgent("quality-analyzer");
		const env = createTemplateEnv({
			cwd: tmpDir,
			builtinDir: bundledTemplateDir(),
			userDir: pinnedTemplateUserDir(tmpDir),
		});
		const compiled = compileAgent(spec, {
			env,
			input: { exploration: {}, path: "src" },
			cwd: tmpDir,
		});
		assert.equal(compiled.spec.name, "quality-analyzer");
		assert.ok(compiled.taskPrompt.trim().length > 0, "quality-analyzer task prompt must render non-empty");
		assert.ok(
			(compiled.systemPrompt ?? "").trim().length > 0,
			"quality-analyzer system prompt (extends base-analyzer) must render non-empty",
		);
	});

	// Dispatch-past-compile regression: a bundled spec's RELATIVE output-schema
	// ref must compile to an ABSOLUTE path that exists on disk. Both investigator
	// and quality-analyzer declare `schemas/<x>.schema.json`, whose file lives in
	// pi-workflows/schemas/ (the parent of agents/, the package-root sibling
	// convention). Without parse's sibling probe the ref survived as a bare name
	// and buildPhantomTool's readFileSync(process.cwd()) threw ENOENT at dispatch.
	// Asserting the compiled schema is an existing absolute path pins that class
	// without invoking a live LLM — it guarantees buildPhantomTool's read succeeds.
	it("bundled `investigator` compiles its relative outputSchema to an existing absolute path (dispatch-past-compile)", () => {
		const loadAgent = createAgentLoader({ ...dispatchLoadContext(tmpDir), userDir: pinnedUserDir(tmpDir) });
		const spec = loadAgent("investigator");
		const env = createTemplateEnv({
			cwd: tmpDir,
			builtinDir: bundledTemplateDir(),
			userDir: pinnedTemplateUserDir(tmpDir),
		});
		const compiled = compileAgent(spec, { env, input: {}, cwd: tmpDir });
		assert.ok(compiled.outputSchema, "investigator declares an output schema");
		assert.ok(
			path.isAbsolute(compiled.outputSchema as string),
			`investigator outputSchema must be absolute, got: ${compiled.outputSchema}`,
		);
		assert.ok(
			fs.existsSync(compiled.outputSchema as string),
			`investigator outputSchema must exist on disk: ${compiled.outputSchema}`,
		);
	});

	it("bundled `quality-analyzer` compiles its relative outputSchema to an existing absolute path (dispatch-past-compile)", () => {
		const loadAgent = createAgentLoader({ ...dispatchLoadContext(tmpDir), userDir: pinnedUserDir(tmpDir) });
		const spec = loadAgent("quality-analyzer");
		const env = createTemplateEnv({
			cwd: tmpDir,
			builtinDir: bundledTemplateDir(),
			userDir: pinnedTemplateUserDir(tmpDir),
		});
		const compiled = compileAgent(spec, { env, input: { exploration: {}, path: "src" }, cwd: tmpDir });
		// quality-analyzer declares `schemas/quality-analysis.schema.json` (checked
		// in the spec yaml) — so the resolved schema must be an existing absolute path.
		assert.ok(compiled.outputSchema, "quality-analyzer declares an output schema");
		assert.ok(
			path.isAbsolute(compiled.outputSchema as string),
			`quality-analyzer outputSchema must be absolute, got: ${compiled.outputSchema}`,
		);
		assert.ok(
			fs.existsSync(compiled.outputSchema as string),
			`quality-analyzer outputSchema must exist on disk: ${compiled.outputSchema}`,
		);
	});
});
