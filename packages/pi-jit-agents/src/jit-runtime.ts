/**
 * In-process LLM dispatch with phantom-tool structured output enforcement.
 *
 * Implements D4 (jit-agents-spec.md §4): the unified `executeAgent` primitive
 * that both workflow agent steps and monitor classify calls consume. There is
 * one dispatch path across the framework — not one for workflows and another
 * for monitors.
 *
 * Phantom tool pattern: when a compiled agent declares an outputSchema, the
 * dispatch call passes a synthetic Tool constructed from the schema to pi-ai
 * with forced toolChoice. The LLM produces ToolCall.arguments matching the
 * schema; the arguments are extracted as the typed result. No text parsing,
 * no JSON.parse of free-form output.
 *
 * Thinking: NOT passed. Anthropic's API rejects thinking + forced toolChoice.
 * This is a documented active constraint. Agents that need thinking cannot use
 * schema-bound output in this release.
 */
import fs from "node:fs";
import { validateFromFile } from "@davidorex/pi-project/schema-validator";
import type { Api, AssistantMessage, Model, ProviderStreamOptions, Tool, ToolCall } from "@mariozechner/pi-ai";
import { complete as piAiComplete, Type } from "@mariozechner/pi-ai";
import { AgentDispatchError } from "./errors.js";
import {
	loadProjectRedactionConfig,
	type RedactionConfig,
	type RedactionPattern,
	redactLlmResponse,
	redactSensitiveData,
} from "./trace-redactor.js";
import { writeAgentTrace } from "./trace-writer.js";
import type { CompiledAgent, DispatchContext, JitAgentResult } from "./types.js";

/**
 * Minimal ULID generator (Crockford base32, 26 chars: 10 timestamp + 16 random).
 *
 * Inline rather than a dependency: ulid is not in this workspace, the algorithm
 * fits in a few lines, and the requirement is simply that ids be lexicographically
 * sortable across concurrent executeAgent calls (the agent-trace.schema.json
 * `traceId` pattern enforces 26-char Crockford base32).
 *
 * Monotonic-within-millisecond is approximated by the random-suffix component;
 * we do not implement the strict ULID monotonic-tiebreaker because the trace
 * pipeline tolerates rare same-ms collisions (entries are sorted by id, but
 * same-ms ties resolve consistently within a single-process run via the random
 * lower bits, and cross-process traces interleave at directory listing level).
 */
const CROCKFORD_BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function newUlid(now: number = Date.now()): string {
	// 48-bit timestamp → 10 base32 chars.
	let ts = now;
	const tsChars = new Array<string>(10);
	for (let i = 9; i >= 0; i--) {
		tsChars[i] = CROCKFORD_BASE32[ts % 32] ?? "0";
		ts = Math.floor(ts / 32);
	}
	// 80 random bits → 16 base32 chars. Math.random suffices (collision risk
	// is non-zero but the trace use-case does not require crypto-grade ids).
	const randChars = new Array<string>(16);
	for (let i = 0; i < 16; i++) {
		randChars[i] = CROCKFORD_BASE32[Math.floor(Math.random() * 32)] ?? "0";
	}
	return tsChars.join("") + randChars.join("");
}

/**
 * Recursively redact string leaves of an arbitrary value. Numbers, booleans,
 * null, and undefined pass through unchanged. Strings run through
 * redactSensitiveData. Arrays and plain objects are walked depth-first.
 *
 * Used for the `collectedValue` field of context_collection trace entries —
 * collectors may return strings, arrays, or objects, so a single string-only
 * redactor is insufficient.
 */
function deepRedact(value: unknown, config?: RedactionConfig): unknown {
	if (typeof value === "string") return redactSensitiveData(value, config);
	if (value === null || value === undefined) return value;
	if (Array.isArray(value)) return value.map((v) => deepRedact(v, config));
	if (typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			out[k] = deepRedact(v, config);
		}
		return out;
	}
	return value;
}

/**
 * Map an executeAgent return value to the `verdictResult` shape required by
 * agent-trace.schema.json (`{ verdict, description?, severity?, newPattern? }`).
 *
 * The schema's `verdict` enum is `clean | flag | new | error`. Phantom-tool
 * outputs from monitor classifiers produce `CLEAN | FLAG | NEW` (uppercase) per
 * verdict.schema.json — we lowercase here. Non-classifier agents produce
 * arbitrary structured output or text; in that case we synthesize a `clean`
 * verdict and attach a description so the trace remains schema-valid.
 *
 * `error` is reserved for the failure path (set in the catch handler).
 */
function normalizeVerdict(output: unknown): {
	verdict: "clean" | "flag" | "new" | "error";
	description?: string;
	severity?: string;
	newPattern?: string;
} {
	if (output && typeof output === "object" && !Array.isArray(output)) {
		const obj = output as Record<string, unknown>;
		const rawVerdict = typeof obj.verdict === "string" ? obj.verdict.toLowerCase() : undefined;
		if (rawVerdict === "clean" || rawVerdict === "flag" || rawVerdict === "new" || rawVerdict === "error") {
			const result: ReturnType<typeof normalizeVerdict> = { verdict: rawVerdict };
			if (typeof obj.description === "string") result.description = obj.description;
			if (typeof obj.severity === "string") result.severity = obj.severity;
			if (typeof obj.newPattern === "string") result.newPattern = obj.newPattern;
			return result;
		}
	}
	// Non-verdict output (e.g. workflow agent step structured result, free text):
	// stamp as `clean` and stringify-describe for trace fidelity.
	const description =
		typeof output === "string" ? output : output === undefined ? "" : JSON.stringify(output).slice(0, 2_000);
	return { verdict: "clean", description };
}

/**
 * Extract token usage from an AssistantMessage in the shape required by the
 * trace schema's `usage` definition (camelCase, totalTokens summed).
 */
function traceUsageFromMessage(msg: AssistantMessage): {
	inputTokens: number;
	outputTokens: number;
	cacheRead?: number;
	cacheWrite?: number;
	totalTokens: number;
} {
	const u = msg.usage;
	const input = u?.input ?? 0;
	const output = u?.output ?? 0;
	const cacheRead = u?.cacheRead ?? 0;
	const cacheWrite = u?.cacheWrite ?? 0;
	return {
		inputTokens: input,
		outputTokens: output,
		cacheRead,
		cacheWrite,
		totalTokens: input + output,
	};
}

/**
 * Best-effort string identifier for a pi-ai Model<Api> instance. The Model
 * shape carries `id` (model id) and `provider` (provider id); the trace schema
 * wants a single string. Falls back to JSON.stringify for unrecognized shapes.
 */
function modelToString(model: unknown): string {
	if (model && typeof model === "object") {
		const m = model as { id?: unknown; provider?: unknown; api?: unknown };
		const provider = typeof m.provider === "string" ? m.provider : undefined;
		const id = typeof m.id === "string" ? m.id : undefined;
		if (provider && id) return `${provider}/${id}`;
		if (id) return id;
		if (provider) return provider;
	}
	return typeof model === "string" ? model : JSON.stringify(model);
}

/**
 * Wrap a writeAgentTrace call with a try/catch so trace failures cannot abort
 * dispatch (per DEC-0005's intentional independence of trace from classify).
 * Failures emit a stderr diagnostic prefixed with the pi-jit-agents tag and
 * are otherwise swallowed.
 */
function safeWriteTrace(entry: unknown, tracePath: string): void {
	try {
		writeAgentTrace(entry, { tracePath });
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		// eslint-disable-next-line no-console -- non-fatal diagnostic channel.
		console.error(`[pi-jit-agents] trace write failed (${tracePath}): ${msg}`);
	}
}

/**
 * Injection point for the pi-ai `complete` function. Defaults to the real
 * implementation. Tests override via the optional `completeFn` parameter on
 * `executeAgent`.
 */
export type CompleteFn = typeof piAiComplete;

/**
 * Build a phantom Tool from a JSON Schema file for forced structured output.
 *
 * For the common shape (top-level `type: object` with `required` and
 * `properties` where each property has a primitive `type` and optional
 * `enum`), produces a TypeBox Type.Object matching the schema. Complex shapes
 * (allOf, anyOf, conditional) fall back to a relaxed Type.Object that accepts
 * any object — post-hoc validation via `validateFromFile` catches violations.
 *
 * The tool is never executed — it exists only as a schema constraint that
 * pi-ai enforces via forced toolChoice.
 */
export function buildPhantomTool(
	schemaPath: string,
	toolName = "jit_result",
	description = "Output the typed result",
): Tool {
	const raw = fs.readFileSync(schemaPath, "utf-8");
	const schema = JSON.parse(raw) as Record<string, unknown>;
	const parameters = jsonSchemaToTypeBox(schema);
	return {
		name: toolName,
		description,
		parameters: parameters as Tool["parameters"],
	};
}

/**
 * Provider-aware shape returned by `normalizeToolChoice`. The type union
 * covers every shape that any pi-ai 0.70.2 driver currently honors for
 * forced structured output:
 *
 *   - Anthropic-native object form (anthropic-messages, bedrock-converse-stream)
 *   - OpenAI-compatible function form (openai-completions, mistral-conversations,
 *     and the canonical shape for openai-responses / openai-codex-responses /
 *     azure-openai-responses if/when those drivers begin honoring toolChoice)
 *   - Google string-mode form (google-generative-ai, google-gemini-cli,
 *     google-vertex) — only `"any"` is emitted; specific-tool pinning is
 *     not exposed by the Google providers in pi-ai 0.70.2
 *
 * pi-ai itself accepts any `unknown` here (toolChoice rides on the
 * `Record<string, unknown>` half of `ProviderStreamOptions`); the explicit
 * union exists for callers that want compile-time discrimination of the
 * normalization output.
 */
export type NormalizedToolChoice =
	| { type: "tool"; name: string }
	| { type: "function"; function: { name: string } }
	| "any";

/**
 * Map a pi-ai `Api` kind plus a phantom tool name to the `toolChoice` shape
 * the corresponding driver expects.
 *
 * This is the architectural normalization point referenced by ADR-0003: the
 * forced-toolChoice protocol divergence across Anthropic / OpenAI-compatible
 * / Google providers is collapsed here, not at each consumer call site.
 *
 * Coverage map (pi-ai 0.70.2 — verified against
 * `node_modules/@mariozechner/pi-ai/dist/providers/*`):
 *
 *   - `anthropic-messages` — passes object through unchanged. Anthropic
 *     Messages API expects `{type:"tool", name}`.
 *   - `bedrock-converse-stream` — accepts `{type:"tool", name}` and translates
 *     internally to Bedrock Converse's `{tool:{name}}` shape (driver line
 *     611-612 of amazon-bedrock.js).
 *   - `openai-completions` — passthrough. OpenAI / OpenRouter / OpenAI-
 *     compatible gateways expect `{type:"function", function:{name}}` or
 *     string `"required"`. Mismatch here is the proximate cause of the
 *     "Tool '' not found in provided tools" 400 surfaced post-7edf3a2.
 *   - `mistral-conversations` — driver passes the object through its own
 *     `mapToolChoice` which reads `choice.function.name`, so the OpenAI-
 *     compatible function form is required.
 *   - `openai-responses`, `openai-codex-responses`, `azure-openai-responses`
 *     — pi-ai 0.70.2 drivers do NOT honor `options.toolChoice` (codex hard-
 *     codes `tool_choice: "auto"`; the other two drop it entirely). The
 *     OpenAI-compatible function form is emitted here as the canonical
 *     shape for the day pi-ai begins forwarding it; today the value is
 *     ignored and forced toolChoice is unenforceable on these drivers.
 *     Tracked as a pi-ai upstream gap; do not paper over here.
 *   - `google-generative-ai`, `google-gemini-cli`, `google-vertex` — drivers
 *     accept only string `"any" | "auto" | "none"` (mapped to FunctionCalling-
 *     ConfigMode). Specific-tool pinning is not exposed. `"any"` forces
 *     tool use; adequate for the phantom-tool single-tool pattern (the model
 *     has only one tool to call) but fails to pin a specific tool when
 *     multiple tools are present.
 *   - Unknown / custom api strings — Anthropic-format default. Matches the
 *     pre-fix behavior that worked end-to-end for `anthropic-messages` and
 *     preserves backward compatibility for any consumer that registered a
 *     custom api provider expecting that shape.
 */
export function normalizeToolChoice(api: Api, toolName: string): NormalizedToolChoice {
	switch (api) {
		case "anthropic-messages":
		case "bedrock-converse-stream":
			return { type: "tool", name: toolName };
		case "openai-completions":
		case "mistral-conversations":
		case "openai-responses":
		case "openai-codex-responses":
		case "azure-openai-responses":
			return { type: "function", function: { name: toolName } };
		case "google-generative-ai":
		case "google-gemini-cli":
		case "google-vertex":
			return "any";
		default:
			return { type: "tool", name: toolName };
	}
}

/**
 * Convert a JSON Schema object to a TypeBox schema.
 *
 * Handles the shape used by verdict.schema.json and the initial test fixtures.
 * Falls back to Type.Any() for unsupported constructs — the phantom tool
 * enforces structural shape; full validation is post-hoc.
 */
function jsonSchemaToTypeBox(schema: Record<string, unknown>): unknown {
	const type = schema.type;
	if (type !== "object") {
		return Type.Any();
	}

	const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
	const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);

	const props: Record<string, unknown> = {};
	for (const [key, propSchema] of Object.entries(properties)) {
		const propType = propertyToTypeBox(propSchema);
		props[key] = required.has(key) ? propType : Type.Optional(propType as Parameters<typeof Type.Optional>[0]);
	}

	return Type.Object(props as Record<string, Parameters<typeof Type.Optional>[0]>);
}

function propertyToTypeBox(propSchema: Record<string, unknown>): unknown {
	const t = propSchema.type;
	const enumValues = propSchema.enum;
	const description = typeof propSchema.description === "string" ? propSchema.description : undefined;
	const opts = description ? { description } : {};

	if (Array.isArray(enumValues) && enumValues.every((v) => typeof v === "string")) {
		return Type.Union(
			(enumValues as string[]).map((v) => Type.Literal(v)),
			opts,
		);
	}
	switch (t) {
		case "string":
			return Type.String(opts);
		case "number":
			return Type.Number(opts);
		case "integer":
			return Type.Integer(opts);
		case "boolean":
			return Type.Boolean(opts);
		case "array":
			return Type.Array(Type.Any(), opts);
		case "object":
			return jsonSchemaToTypeBox(propSchema);
		default:
			return Type.Any();
	}
}

/**
 * Extract concatenated text content from an AssistantMessage.
 */
function extractText(msg: AssistantMessage): string {
	return msg.content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text)
		.join("");
}

/**
 * Default usage object. Populated from AssistantMessage.usage when available.
 */
function emptyUsage() {
	return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
}

function usageFromMessage(msg: AssistantMessage): JitAgentResult["usage"] {
	const usage = emptyUsage();
	if (!msg.usage) return usage;
	usage.input = msg.usage.input ?? 0;
	usage.output = msg.usage.output ?? 0;
	usage.cacheRead = msg.usage.cacheRead ?? 0;
	usage.cacheWrite = msg.usage.cacheWrite ?? 0;
	usage.cost =
		(msg.usage.cost?.input ?? 0) +
		(msg.usage.cost?.output ?? 0) +
		(msg.usage.cost?.cacheRead ?? 0) +
		(msg.usage.cost?.cacheWrite ?? 0);
	return usage;
}

/**
 * Execute a compiled agent in-process.
 *
 * When `compiled.outputSchema` is set: build a phantom tool from the schema,
 * call pi-ai's `complete` with forced toolChoice, extract ToolCall.arguments,
 * and validate post-hoc against the schema file.
 *
 * When `compiled.outputSchema` is absent: call `complete` without tools and
 * return the extracted text as `output`.
 *
 * Test hook: `completeFn` overrides the pi-ai `complete` import for unit
 * tests that do not make real LLM calls.
 */
export async function executeAgent(
	compiled: CompiledAgent,
	dispatch: DispatchContext,
	completeFn: CompleteFn = piAiComplete,
): Promise<JitAgentResult> {
	// --- Trace bootstrap -----------------------------------------------------
	// Trace capture is gated on dispatch.tracePath being a non-empty string.
	// `undefined` and `null` both disable tracing. When disabled, every trace
	// emission below short-circuits via the `tracePath !== null` guard at the
	// safeWriteTrace call sites, leaving the pre-existing dispatch behavior
	// observably unchanged.
	const tracePath: string | null = typeof dispatch.tracePath === "string" ? dispatch.tracePath : null;
	const tracingEnabled = tracePath !== null;

	// Resolve the redaction config once per executeAgent call. Failure here
	// must not abort dispatch — a malformed config falls back to the builtin
	// pattern set with a stderr diagnostic.
	let redactionConfig: RedactionConfig | undefined;
	if (tracingEnabled && typeof dispatch.redactionConfigPath === "string") {
		try {
			const patterns: RedactionPattern[] = loadProjectRedactionConfig(dispatch.redactionConfigPath);
			redactionConfig = { patterns };
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			// eslint-disable-next-line no-console -- non-fatal diagnostic channel.
			console.error(`[pi-jit-agents] redaction config load failed (${dispatch.redactionConfigPath}): ${msg}`);
		}
	}

	const sessionStartMs = Date.now();
	const sessionStartId = newUlid(sessionStartMs);
	let classifyCallId: string | null = null;
	let classifyResponseId: string | null = null;

	if (tracingEnabled && tracePath !== null) {
		safeWriteTrace(
			{
				type: "session_start",
				id: sessionStartId,
				parentId: null,
				timestamp: new Date(sessionStartMs).toISOString(),
				sessionId: sessionStartId,
				monitorName: typeof dispatch.monitorName === "string" ? dispatch.monitorName : null,
				agentName: compiled.spec.name,
				model: modelToString(dispatch.model),
				cwd: process.cwd(),
			},
			tracePath,
		);
	}

	// --- Existing dispatch logic --------------------------------------------
	const messages = [
		{
			role: "user" as const,
			content: [{ type: "text" as const, text: compiled.taskPrompt }],
			timestamp: Date.now(),
		},
	];

	const systemPrompt = compiled.systemPrompt;
	const maxTokens = dispatch.maxTokens ?? 1024;

	// classify_call is emitted just before the LLM call: at this point the
	// rendered prompts (system + task) are fully available. Per the schema,
	// `renderedPrompt` is a single string — we concatenate system and task
	// with a delimiter so trace consumers see exactly what dispatch sent.
	if (tracingEnabled && tracePath !== null) {
		const renderedPromptRaw = systemPrompt
			? `[SYSTEM]\n${systemPrompt}\n[TASK]\n${compiled.taskPrompt}`
			: compiled.taskPrompt;
		classifyCallId = newUlid();
		safeWriteTrace(
			{
				type: "classify_call",
				id: classifyCallId,
				parentId: sessionStartId,
				timestamp: new Date().toISOString(),
				renderedPrompt: redactSensitiveData(renderedPromptRaw, redactionConfig),
				inputText: redactSensitiveData(compiled.taskPrompt, redactionConfig),
			},
			tracePath,
		);

		// One context_collection entry per resolved collector. Path A: the
		// CompiledAgent now carries `contextValues` populated by compileAgent.
		// We deep-redact each collected value and emit immediately after
		// classify_call so the parent chain is intact even when downstream
		// dispatch fails.
		const ts = new Date().toISOString();
		for (const [collectorId, collectedValue] of Object.entries(compiled.contextValues)) {
			safeWriteTrace(
				{
					type: "context_collection",
					id: newUlid(),
					parentId: classifyCallId,
					timestamp: ts,
					collectorId,
					collectedValue: deepRedact(collectedValue, redactionConfig),
					// Collection time is not yet measured at the compileAgent boundary;
					// reserved for a future instrumentation pass.
					collectionTimeMs: 0,
				},
				tracePath,
			);
		}
	}

	let response: AssistantMessage;
	try {
		const context: {
			messages: typeof messages;
			tools?: Tool[];
			systemPrompt?: string;
		} = { messages };
		if (systemPrompt) context.systemPrompt = systemPrompt;

		const options: ProviderStreamOptions = {
			apiKey: dispatch.auth.apiKey,
			headers: dispatch.auth.headers,
			maxTokens,
			signal: dispatch.signal,
		};

		if (compiled.outputSchema) {
			const phantomTool = buildPhantomTool(compiled.outputSchema);
			context.tools = [phantomTool];
			options.toolChoice = normalizeToolChoice(dispatch.model.api, phantomTool.name);
		}

		response = await completeFn(dispatch.model as Model<Api>, context, options);
	} catch (err) {
		// Dispatch itself failed — emit a synthetic verdict_decision + trace_end
		// with verdict=error so the trace remains parent-chain complete, then
		// rethrow per the original contract.
		if (tracingEnabled && tracePath !== null) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			const verdictId = newUlid();
			const errVerdict = {
				verdict: "error" as const,
				description: redactSensitiveData(errorMsg.slice(0, 2_000), redactionConfig),
			};
			safeWriteTrace(
				{
					type: "verdict_decision",
					id: verdictId,
					// classify_response did not happen — chain off classify_call when
					// available, otherwise off session_start.
					parentId: classifyCallId ?? sessionStartId,
					timestamp: new Date().toISOString(),
					finalResult: errVerdict,
					mappingDecisionRationale: redactSensitiveData("dispatch failed before LLM response", redactionConfig),
				},
				tracePath,
			);
			safeWriteTrace(
				{
					type: "trace_end",
					id: newUlid(),
					parentId: sessionStartId,
					timestamp: new Date().toISOString(),
					totalDurationMs: Date.now() - sessionStartMs,
					verdict: errVerdict,
				},
				tracePath,
			);
		}

		if (dispatch.signal?.aborted) {
			throw new AgentDispatchError(compiled.spec.name, "cancelled", {
				cause: err instanceof Error ? err : new Error(String(err)),
			});
		}
		const cause = err instanceof Error ? err : new Error(String(err));
		throw new AgentDispatchError(compiled.spec.name, cause.message, { cause });
	}

	// classify_response: emitted after the AssistantMessage is in hand. The
	// content array runs through redactLlmResponse to strip credentials echoed
	// in the model output; usage / stopReason are passthrough numerics/enums.
	if (tracingEnabled && tracePath !== null) {
		const redactedResponse = redactLlmResponse({ content: response.content }, redactionConfig);
		classifyResponseId = newUlid();
		const responseEntry: Record<string, unknown> = {
			type: "classify_response",
			id: classifyResponseId,
			parentId: classifyCallId ?? sessionStartId,
			timestamp: new Date().toISOString(),
			stopReason: response.stopReason ?? "unknown",
			usage: traceUsageFromMessage(response),
			content: redactedResponse.content,
		};
		if (typeof response.errorMessage === "string") {
			responseEntry.errorMessage = redactSensitiveData(response.errorMessage, redactionConfig);
		}
		safeWriteTrace(responseEntry, tracePath);
	}

	const usage = usageFromMessage(response);

	let result: JitAgentResult;
	try {
		if (compiled.outputSchema) {
			const toolCall = response.content.find((c): c is ToolCall => c.type === "toolCall");
			if (!toolCall) {
				const contentTypes = response.content.map((c) => c.type).join(", ");
				const errMsg = response.errorMessage ? ` error: ${response.errorMessage}` : "";
				throw new AgentDispatchError(
					compiled.spec.name,
					`no tool call in response (content types: [${contentTypes}]${errMsg})`,
					{ stopReason: response.stopReason },
				);
			}
			const args = toolCall.arguments as Record<string, unknown>;
			validateFromFile(compiled.outputSchema, args, `output for agent '${compiled.spec.name}'`);
			result = { output: args, raw: response, usage };
		} else {
			result = { output: extractText(response), raw: response, usage };
		}
	} catch (err) {
		// Output validation / tool-call extraction failed. Mirror the dispatch-
		// failure trace pattern so the parent chain remains complete, then
		// rethrow so callers see the original error.
		if (tracingEnabled && tracePath !== null) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			const errVerdict = {
				verdict: "error" as const,
				description: redactSensitiveData(errorMsg.slice(0, 2_000), redactionConfig),
			};
			safeWriteTrace(
				{
					type: "verdict_decision",
					id: newUlid(),
					parentId: classifyResponseId ?? classifyCallId ?? sessionStartId,
					timestamp: new Date().toISOString(),
					finalResult: errVerdict,
					mappingDecisionRationale: redactSensitiveData("output extraction or validation failed", redactionConfig),
				},
				tracePath,
			);
			safeWriteTrace(
				{
					type: "trace_end",
					id: newUlid(),
					parentId: sessionStartId,
					timestamp: new Date().toISOString(),
					totalDurationMs: Date.now() - sessionStartMs,
					verdict: errVerdict,
				},
				tracePath,
			);
		}
		throw err;
	}

	// Success path: verdict_decision + trace_end. The verdict normalizer maps
	// classifier output (CLEAN/FLAG/NEW) to the schema enum (clean/flag/new)
	// and synthesizes a `clean` verdict for non-classifier agents so the trace
	// remains schema-valid for both surfaces.
	if (tracingEnabled && tracePath !== null) {
		const finalResultRaw = normalizeVerdict(result.output);
		const finalResult: typeof finalResultRaw = { verdict: finalResultRaw.verdict };
		if (finalResultRaw.description !== undefined) {
			finalResult.description = redactSensitiveData(finalResultRaw.description, redactionConfig);
		}
		if (finalResultRaw.severity !== undefined) {
			finalResult.severity = finalResultRaw.severity;
		}
		if (finalResultRaw.newPattern !== undefined) {
			finalResult.newPattern = redactSensitiveData(finalResultRaw.newPattern, redactionConfig);
		}
		safeWriteTrace(
			{
				type: "verdict_decision",
				id: newUlid(),
				parentId: classifyResponseId ?? classifyCallId ?? sessionStartId,
				timestamp: new Date().toISOString(),
				finalResult,
				mappingDecisionRationale: redactSensitiveData("executeAgent returned", redactionConfig),
			},
			tracePath,
		);
		safeWriteTrace(
			{
				type: "trace_end",
				id: newUlid(),
				parentId: sessionStartId,
				timestamp: new Date().toISOString(),
				totalDurationMs: Date.now() - sessionStartMs,
				verdict: finalResult,
			},
			tracePath,
		);
	}

	return result;
}
