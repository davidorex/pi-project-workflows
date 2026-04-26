// trace-redactor: credential / sensitive-data redaction for monitor-classify trace records.
//
// Per DEC-0005 and the canonical-compliance audit for issue-023, trace records produced by
// the monitor-classify capture path may contain rendered LLM prompts and full assistant
// responses. Those payloads can carry credentials echoed by users (pasted API keys, OAuth
// tokens, secrets in code samples). Pi-mono's SessionManager performs no redaction; this
// module is the pre-write filter that aims to strip well-known sensitive shapes BEFORE
// trace records are persisted.
//
// Scope intent (not a guarantee):
//   - Match known credential surface shapes via the BUILTIN_PATTERNS set.
//   - Allow per-project augmentation via .workflows/monitors/<name>/trace-config.json.
//   - Preserve LLM message structure while redacting text fields recursively.
// Limits:
//   - Pattern-based redaction is best-effort; it cannot detect arbitrary opaque secrets.
//   - Operators remain responsible for reviewing trace output before sharing externally.

import { existsSync, readFileSync } from "node:fs";

export interface RedactionPattern {
	name: string;
	regex: RegExp;
	replacement: string;
}

export interface RedactionConfig {
	/** Additional patterns from project-extension config, applied after BUILTIN_PATTERNS in order. */
	patterns?: RedactionPattern[];
}

/**
 * Exhaustive built-in pattern set as of the audit. Order matters: more specific shapes
 * (e.g. `sk-or-` OpenRouter prefix) come before less specific (e.g. generic `sk-` OpenAI)
 * to keep replacement labels accurate where prefixes overlap.
 */
export const BUILTIN_PATTERNS: ReadonlyArray<RedactionPattern> = [
	{ name: "anthropic_api_key", regex: /sk-ant-[a-zA-Z0-9_-]{20,}/g, replacement: "[REDACTED:anthropic_api_key]" },
	{ name: "openrouter_api_key", regex: /sk-or-[a-zA-Z0-9_-]{20,}/g, replacement: "[REDACTED:openrouter_api_key]" },
	{ name: "openai_api_key", regex: /sk-(?:proj-)?[a-zA-Z0-9_-]{20,}/g, replacement: "[REDACTED:openai_api_key]" },
	{ name: "google_api_key", regex: /AIza[0-9A-Za-z\-_]{35}/g, replacement: "[REDACTED:google_api_key]" },
	{ name: "aws_access_key", regex: /AKIA[0-9A-Z]{16}/g, replacement: "[REDACTED:aws_access_key]" },
	{
		name: "aws_secret_key",
		// Matches the `aws_secret_access_key` field name followed by `=` or `:` separator and a
		// secret value, optionally wrapped in single or double quotes. Body uses `+` (1-or-more)
		// rather than `{40}` so we tolerate the canonical 40-char AWS shape AND test fixtures /
		// generated keys that diverge from that exact length. Case-insensitive to cover env-var
		// uppercasing (AWS_SECRET_ACCESS_KEY).
		regex: /aws_secret_access_key\s*[=:]\s*["']?[A-Za-z0-9/+=]{16,}["']?/gi,
		replacement: "[REDACTED:aws_secret_key]",
	},
	{
		name: "gcp_service_account",
		regex: /"type":\s*"service_account"[\s\S]*?"private_key":\s*"[^"]*"/g,
		replacement: "[REDACTED:gcp_service_account]",
	},
	{ name: "github_token_ghp", regex: /ghp_[a-zA-Z0-9_]{36,}/g, replacement: "[REDACTED:github_token_ghp]" },
	{ name: "github_token_gho", regex: /gho_[a-zA-Z0-9_]{36,}/g, replacement: "[REDACTED:github_token_gho]" },
	{ name: "github_token_ghs", regex: /ghs_[a-zA-Z0-9_]{36,}/g, replacement: "[REDACTED:github_token_ghs]" },
	{ name: "github_token_ghu", regex: /ghu_[a-zA-Z0-9_]{36,}/g, replacement: "[REDACTED:github_token_ghu]" },
	{ name: "jwt", regex: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, replacement: "[REDACTED:jwt]" },
	{
		name: "bearer_token",
		regex: /Authorization:\s*Bearer\s+([a-zA-Z0-9_\-.]+)/gi,
		replacement: "Authorization: Bearer [REDACTED:bearer_token]",
	},
	{
		name: "ssh_private_key",
		// PEM marker shape: `-----BEGIN <ALGO> PRIVATE KEY-----\n<base64 body, possibly multi-line>\n-----END <ALGO> PRIVATE KEY-----`.
		// The previous form omitted the closing `-----` of the BEGIN line and used `[^-]*` for
		// the body — neither admitted a real PEM block (the very next chars after `KEY` are
		// `-----`, hyphens). `[\s\S]*?` is non-greedy match-anything-including-newlines, which
		// stops at the first `-----END...KEY-----` sequence. Algorithm token kept optional so
		// PEM blocks without an explicit ALGO (rare, OpenSSH) still match.
		regex:
			/-----BEGIN\s+(?:RSA|DSA|EC|OPENSSH|PGP|ENCRYPTED)?\s*PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA|DSA|EC|OPENSSH|PGP|ENCRYPTED)?\s*PRIVATE\s+KEY-----/g,
		replacement: "[REDACTED:ssh_private_key]",
	},
	{ name: "postgres_conn_string", regex: /postgres:\/\/[^:]+:[^@]+@[^/]+\/\S+/g, replacement: "postgres://[REDACTED]" },
	{ name: "mysql_conn_string", regex: /mysql:\/\/[^:]+:[^@]+@[^/]+\/\S+/g, replacement: "mysql://[REDACTED]" },
	{
		name: "mongodb_conn_string",
		regex: /mongodb(?:\+srv)?:\/\/[^:]+:[^@]+@[^/]+/g,
		replacement: "mongodb://[REDACTED]",
	},
];

/**
 * Apply all redaction patterns to a string and return the redacted result.
 * Builtin patterns run first, then any additional patterns from `config.patterns` in order.
 * Idempotent: running the function on its own output produces an identical string, because
 * the replacement tokens (e.g. `[REDACTED:...]`) do not match any builtin pattern shape.
 */
export function redactSensitiveData(text: string, config?: RedactionConfig): string {
	if (typeof text !== "string" || text.length === 0) return text;
	let out = text;
	for (const pattern of BUILTIN_PATTERNS) {
		out = out.replace(pattern.regex, pattern.replacement);
	}
	if (config?.patterns) {
		for (const pattern of config.patterns) {
			out = out.replace(pattern.regex, pattern.replacement);
		}
	}
	return out;
}

/**
 * Apply redaction to an LLM AssistantMessage's content array. Preserves message structure
 * (returns same shape as input). For each content item:
 *   - if it has a string `text` field, that field is redacted.
 *   - if it has an array `content` field, recurse.
 *   - otherwise, the item is passed through unchanged.
 *
 * Type erased via `T extends { content: unknown[] }` so the helper composes with any
 * pi-ai content shape (text blocks, tool calls, thinking blocks, structured content).
 */
export function redactLlmResponse<T extends { content: unknown[] }>(message: T, config?: RedactionConfig): T {
	const redactedContent = message.content.map((item) => redactContentItem(item, config));
	return { ...message, content: redactedContent };
}

function redactContentItem(item: unknown, config?: RedactionConfig): unknown {
	if (item === null || typeof item !== "object") return item;
	const obj = item as Record<string, unknown>;
	const result: Record<string, unknown> = { ...obj };
	if (typeof obj.text === "string") {
		result.text = redactSensitiveData(obj.text, config);
	}
	if (Array.isArray(obj.content)) {
		result.content = obj.content.map((nested) => redactContentItem(nested, config));
	}
	return result;
}

interface RawConfigPattern {
	name: string;
	regex: string;
	replacement?: string;
	domain?: string;
}

interface RawConfigFile {
	patterns?: RawConfigPattern[];
}

/**
 * Load redaction patterns from a project-extension config file.
 * Expected shape: `{ patterns: [{ name, regex: "<string-pattern>", replacement?, domain? }] }`.
 * Compiles each `regex` string to a RegExp with the `g` flag.
 * Throws if the file does not exist, parses to invalid JSON, or contains malformed entries.
 */
export function loadProjectRedactionConfig(configPath: string): RedactionPattern[] {
	if (!existsSync(configPath)) {
		throw new Error(`trace redaction config not found: ${configPath}`);
	}
	const raw = readFileSync(configPath, "utf8");
	let parsed: RawConfigFile;
	try {
		parsed = JSON.parse(raw) as RawConfigFile;
	} catch (err) {
		throw new Error(`trace redaction config is not valid JSON: ${configPath}: ${(err as Error).message}`);
	}
	if (!parsed || typeof parsed !== "object") {
		throw new Error(`trace redaction config must be a JSON object: ${configPath}`);
	}
	const patterns = parsed.patterns;
	if (patterns === undefined) return [];
	if (!Array.isArray(patterns)) {
		throw new Error(`trace redaction config 'patterns' must be an array: ${configPath}`);
	}
	const out: RedactionPattern[] = [];
	for (let i = 0; i < patterns.length; i++) {
		const entry = patterns[i];
		if (!entry || typeof entry !== "object") {
			throw new Error(`trace redaction config patterns[${i}] must be an object: ${configPath}`);
		}
		if (typeof entry.name !== "string" || entry.name.length === 0) {
			throw new Error(`trace redaction config patterns[${i}].name must be a non-empty string: ${configPath}`);
		}
		if (typeof entry.regex !== "string" || entry.regex.length === 0) {
			throw new Error(`trace redaction config patterns[${i}].regex must be a non-empty string: ${configPath}`);
		}
		let compiled: RegExp;
		try {
			compiled = new RegExp(entry.regex, "g");
		} catch (err) {
			throw new Error(
				`trace redaction config patterns[${i}].regex did not compile: ${configPath}: ${(err as Error).message}`,
			);
		}
		const replacement =
			typeof entry.replacement === "string" && entry.replacement.length > 0
				? entry.replacement
				: `[REDACTED:${entry.name}]`;
		out.push({ name: entry.name, regex: compiled, replacement });
	}
	return out;
}
