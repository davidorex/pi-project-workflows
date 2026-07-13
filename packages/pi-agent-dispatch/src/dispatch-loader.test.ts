import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { installContext } from "@davidorex/pi-context";
import { adoptConception } from "@davidorex/pi-context/context";
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

	it("builtinDir points at the bundled agents dir on disk (investigator present)", () => {
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
	// and quality-analyzer declare `schemas/<x>.schema.json`, whose file sits
	// spec-adjacent in the bundled agents dir's own `schemas/` subdir (the
	// pi-context samples catalog ships specs and output schemas side by side).
	// Without parse's existence-gated probe the ref survived as a bare name
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

// End-to-end over a REAL install: adoptConception + installContext materialize
// all 26 declared agent specs (and their adjacent output schemas) into the
// project tier (<contextDir>/agents/). The dispatch loader must then resolve
// EVERY one from tier-1 (not the bundled tier), and each must compile from a
// fresh substrate against the bundled template tier. Because a tier-1 spec is
// parsed with the sibling probe OFF, its relative output-schema ref resolves
// ONLY via the materialized adjacent agents/schemas/ dir — this suite is the
// end-to-end proof that the leg-3 support-asset materialization makes tier-1
// specs dispatch. Precedence is exercised both ways: an edit to a materialized
// spec changes the compiled output, and deleting it falls back to the bundled tier.
describe("materialized project tier — all 26 specs load + compile from a real install", () => {
	let tmpDir: string;
	let substrateDir: string;

	function pinnedTemplateUserDir(dir: string): string {
		const d = path.join(dir, "user-templates-empty");
		fs.mkdirSync(d, { recursive: true });
		return d;
	}

	function loaderForTmp(): (name: string) => ReturnType<ReturnType<typeof createAgentLoader>> {
		return createAgentLoader({ ...dispatchLoadContext(tmpDir), userDir: pinnedUserDir(tmpDir) });
	}

	function envForTmp() {
		return createTemplateEnv({ cwd: tmpDir, builtinDir: bundledTemplateDir(), userDir: pinnedTemplateUserDir(tmpDir) });
	}

	/** The materialized tier-1 spec names (agents/*.agent.yaml, excluding the schemas/ subdir). */
	function materializedAgentNames(): string[] {
		return fs
			.readdirSync(path.join(substrateDir, "agents"))
			.filter((f) => f.endsWith(".agent.yaml"))
			.map((f) => f.replace(/\.agent\.yaml$/, ""))
			.sort();
	}

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-agent-dispatch-tier1-"));
		writeBootstrapPointer(tmpDir, ".context");
		substrateDir = path.join(tmpDir, ".context");
		// Real ceremony: adopt the packaged conception as config, then materialize
		// its declared schemas / blocks / agents into the substrate.
		const adopt = adoptConception(tmpDir);
		assert.equal(adopt.adopted, true, "precondition: accept-all must adopt the conception");
		const install = installContext(tmpDir);
		assert.equal(install.error, undefined, "precondition: install must complete");
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("materializes all 26 agent specs and the loader resolves EVERY one from the project tier", () => {
		const names = materializedAgentNames();
		assert.equal(names.length, 26, `expected 26 materialized specs, got ${names.length}`);
		const loadAgent = loaderForTmp();
		const tier1Dir = path.join(substrateDir, "agents");
		for (const name of names) {
			const spec = loadAgent(name);
			assert.equal(spec.name, name, `loaded spec name must match ${name}`);
			assert.equal(
				spec.loadedFrom,
				tier1Dir,
				`${name} must resolve from the materialized project tier, not the bundled tier`,
			);
		}
	});

	// End-to-end tier-1 COMPILE: a materialized (project-tier) spec must not only
	// parse but render to a non-empty task prompt through the bundled template
	// tier. quality-analyzer is the representative — its input (exploration/path)
	// is the one the bundled-tier compile test already exercises, so the only new
	// variable here is that the spec loaded from <contextDir>/agents/ rather than
	// the bundled dir. (Rendering ALL 26 with synthetic empty data would exercise
	// pi-jit-agents' template engine against data-shaped inputs the specs don't
	// declare — orthogonal to the agent-tier relocation; the tier-1-specific
	// compile concern is output-schema resolution, proven for all 26 below.)
	it("a materialized (tier-1) spec compiles end-to-end to a non-empty task prompt via the bundled template tier", () => {
		const spec = loaderForTmp()("quality-analyzer");
		assert.equal(spec.loadedFrom, path.join(substrateDir, "agents"), "precondition: spec loads from the project tier");
		const compiled = compileAgent(spec, { env: envForTmp(), input: { exploration: {}, path: "src" }, cwd: tmpDir });
		assert.ok(
			compiled.taskPrompt.trim().length > 0,
			"a tier-1 spec must compile to a non-empty task prompt through the bundled template tier",
		);
		assert.ok(
			(compiled.systemPrompt ?? "").trim().length > 0,
			"quality-analyzer's system prompt (extends base-analyzer) must render non-empty from the bundled tier",
		);
	});

	// The load-bearing leg-3 proof: a tier-1 (materialized project) spec is parsed
	// with the sibling probe OFF, so its relative `schemas/<x>.schema.json`
	// output-schema ref resolves ONLY via the adjacent agents/schemas/ dir that
	// installContext materialized. Resolution happens at parse time, so the loaded
	// spec's resolved outputSchema must already be an existing absolute path — no
	// compile (and no template input) is needed to prove it.
	it("every DECLARED output schema resolves to an existing absolute path (tier-1 adjacent resolution, sibling probe OFF)", () => {
		const loadAgent = loaderForTmp();
		const tier1SchemasDir = path.join(substrateDir, "agents", "schemas");
		const broken: string[] = [];
		let declaredCount = 0;
		for (const name of materializedAgentNames()) {
			const spec = loadAgent(name);
			const outSchema = spec.outputSchema;
			if (!outSchema) continue; // a spec with no declared schema is fine
			declaredCount++;
			if (!path.isAbsolute(outSchema) || !fs.existsSync(outSchema) || path.dirname(outSchema) !== tier1SchemasDir) {
				broken.push(`${name} -> ${outSchema}`);
			}
		}
		assert.deepEqual(
			broken,
			[],
			`every declared tier-1 output schema must resolve to an existing absolute path under the materialized agents/schemas/ dir; unresolved: ${broken.join(", ")}`,
		);
		assert.ok(declaredCount >= 15, `expected the bundled specs to declare output schemas, saw ${declaredCount}`);
	});

	it("precedence — editing a materialized spec changes the compiled output; deleting it falls back to the bundled tier", () => {
		const specPath = path.join(substrateDir, "agents", "investigator.agent.yaml");
		const sentinel = `SENTINEL-${Date.now()}-tier1-precedence`;
		// Replace the materialized spec with an inline-task body carrying the sentinel.
		const edited = `name: investigator\ndescription: tier-1 precedence probe\nprompt:\n  system: "sys"\n  task: "${sentinel}"\noutput:\n  format: json\n`;
		fs.writeFileSync(specPath, edited, "utf8");
		const editedCompiled = compileAgent(loaderForTmp()("investigator"), { env: envForTmp(), input: {}, cwd: tmpDir });
		assert.ok(
			editedCompiled.taskPrompt.includes(sentinel),
			"the compiled task prompt must reflect the edit to the materialized (tier-1) spec",
		);
		// Delete the materialized spec — the loader must fall back to the bundled tier.
		fs.rmSync(specPath);
		const fallbackSpec = loaderForTmp()("investigator");
		assert.equal(
			fallbackSpec.loadedFrom,
			dispatchLoadContext(tmpDir).builtinDir,
			"deleting the tier-1 spec must fall the loader back to the bundled tier",
		);
		assert.ok(
			!fallbackSpec.taskPrompt?.includes(sentinel),
			"the bundled fallback spec must not carry the tier-1 sentinel",
		);
	});
});
