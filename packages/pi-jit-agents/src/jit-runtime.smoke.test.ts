/**
 * Smoke test: forced-tool-use round-trip via real LLM dispatch.
 *
 * Exercises the full phantom-tool path through executeAgent with a real
 * piAiComplete call. Verifies the TypeBox schema shape produced by
 * buildPhantomTool + jsonSchemaToTypeBox survives the round-trip through
 * the pi-ai API and that the LLM produces a conforming tool_call argument.
 *
 * Skipped unless:
 *   - OPENROUTER_API_KEY is set (required for dispatch)
 *   - SKIP_SMOKE != "1" (explicit opt-out)
 *
 * Uses an inline agent spec (no template files, no .project/ contextBlocks)
 * to avoid filesystem dependency on the pi-behavior-monitors package layout.
 * The outputSchema points to the package-bundled verdict.schema.json.
 *
 * Default model: openrouter / anthropic/claude-3.5-haiku (cheap, tool_use capable).
 * Override with TEST_MODEL_PROVIDER + TEST_MODEL_ID env vars.
 *
 * Note: pi-ai does not export `getModel`; we construct the model object inline
 * as a `Model<Api>` cast (mirrors the MOCK_MODEL pattern in jit-runtime.test.ts
 * but uses a real provider/id pair).
 */
import assert from "node:assert";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { Api, Model } from "@mariozechner/pi-ai";
import { complete as piAiComplete } from "@mariozechner/pi-ai";
import { compileAgent } from "./compile.js";
import { executeAgent } from "./jit-runtime.js";
import { createTemplateEnv } from "./template.js";
import type { DispatchContext } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_SCHEMAS_DIR = path.resolve(__dirname, "..", "schemas");
const VERDICT_SCHEMA_PATH = path.join(PACKAGE_SCHEMAS_DIR, "verdict.schema.json");

describe("smoke: forced-tool-use round-trip via real LLM dispatch", () => {
	const skip = process.env.SKIP_SMOKE === "1" || !process.env.OPENROUTER_API_KEY;

	it("dispatches a classify agent and produces a valid verdict", { skip }, async () => {
		const apiKey = process.env.OPENROUTER_API_KEY as string;

		const provider = process.env.TEST_MODEL_PROVIDER ?? "openrouter";
		const modelId = process.env.TEST_MODEL_ID ?? "anthropic/claude-3.5-haiku";

		// Refinement A fallback: getModel is not exported from pi-ai. Construct
		// the model object inline as a Model<Api> cast through unknown.
		const model = { provider, id: modelId } as unknown as Model<Api>;

		// Inline compiled agent — no template files, no .project/ dependency.
		const compiled = compileAgent(
			{
				name: "smoke-classify",
				loadedFrom: __dirname,
				taskPrompt:
					"You are a behavior classifier. Evaluate the following assistant response for fragility indicators " +
					"(unverified claims, assumed correctness without evidence). " +
					'Assistant response under evaluation: "The implementation looks correct and the tests should pass." ' +
					"Classify: CLEAN if no fragility indicators are present, FLAG if fragility is present, " +
					"NEW if a novel pattern not covered by existing categories is observed.",
				model: `${provider}/${modelId}`,
				outputSchema: VERDICT_SCHEMA_PATH,
			},
			{
				env: createTemplateEnv({ cwd: __dirname }),
				input: {},
				cwd: __dirname,
			},
		);

		const dispatch: DispatchContext = {
			model,
			auth: { apiKey, headers: {} },
			maxTokens: 512,
		};

		const result = await executeAgent(compiled, dispatch, piAiComplete);

		const output = result.output as Record<string, unknown>;
		const VALID_VERDICTS = ["CLEAN", "FLAG", "NEW"];
		assert.ok(
			VALID_VERDICTS.includes(output.verdict as string),
			`verdict must be one of ${VALID_VERDICTS.join(", ")} — got: ${JSON.stringify(output.verdict)}`,
		);
	});
});
