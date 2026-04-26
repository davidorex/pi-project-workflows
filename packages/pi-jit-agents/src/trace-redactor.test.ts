import assert from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
	BUILTIN_PATTERNS,
	loadProjectRedactionConfig,
	redactLlmResponse,
	redactSensitiveData,
} from "./trace-redactor.js";

// --- Per-pattern positive/negative cases ----------------------------------------------------

describe("BUILTIN_PATTERNS coverage", () => {
	// Audit specified a 16-pattern set covering: anthropic, openai, google, aws_access,
	// aws_secret, gcp_service_account, github (ghp/gho/ghs/ghu), jwt, bearer, ssh_private,
	// postgres, mysql, mongodb. T2 added openrouter (`sk-or-`) ordered before openai so the
	// more-specific OpenRouter prefix wins precedence over the generic `sk-` OpenAI rule —
	// that addition is correctness-driven (without it, `sk-or-...` would be labeled as
	// openai_api_key). Total = 16 audit-mandated + 1 precedence-ordering = 17.
	it("ships with seventeen entries (16 audit-mandated + openrouter precedence ordering)", () => {
		assert.strictEqual(BUILTIN_PATTERNS.length, 17, "16 audit-mandated patterns + openrouter ordering fix = 17");
	});
});

describe("redactSensitiveData — anthropic_api_key", () => {
	it("redacts a sk-ant- prefixed key", () => {
		const input = "key=sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789";
		const out = redactSensitiveData(input);
		assert.ok(out.includes("[REDACTED:anthropic_api_key]"));
		assert.ok(!out.includes("sk-ant-api03"));
	});
	it("does not redact a similar non-anthropic prefix", () => {
		const input = "harmless string sk-antelope-zoo";
		assert.strictEqual(redactSensitiveData(input), input);
	});
});

describe("redactSensitiveData — openai_api_key", () => {
	it("redacts a sk- prefixed OpenAI key", () => {
		const input = "OPENAI_API_KEY=sk-ABCDEFghijKLmnopQRstUVwxyz0123456789";
		const out = redactSensitiveData(input);
		assert.ok(out.includes("[REDACTED:openai_api_key]"));
	});
	it("redacts a sk-proj- prefixed OpenAI project key", () => {
		const input = "key=sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
		const out = redactSensitiveData(input);
		assert.ok(out.includes("[REDACTED:openai_api_key]"));
	});
	it("does not redact a short sk- string below the length threshold", () => {
		const input = "stem cell sk-short";
		assert.strictEqual(redactSensitiveData(input), input);
	});
});

describe("redactSensitiveData — openrouter_api_key", () => {
	it("redacts a sk-or- prefixed OpenRouter key", () => {
		const input = "OPENROUTER_API_KEY=sk-or-v1-abcdefghijklmnopqrstuvwx0123456789";
		const out = redactSensitiveData(input);
		assert.ok(out.includes("[REDACTED:openrouter_api_key]"));
		assert.ok(!out.includes("sk-or-v1-"));
	});
	it("does not redact unrelated 'sk-or' literal occurrence", () => {
		const input = "discussing sk-orange a non-credential phrase";
		assert.strictEqual(redactSensitiveData(input), input);
	});
});

describe("redactSensitiveData — google_api_key", () => {
	it("redacts an AIza prefixed key of correct length", () => {
		const input = "GOOGLE_API_KEY=AIzaSyA-1234567890_abcdefghijklmnopqrst";
		const out = redactSensitiveData(input);
		assert.ok(out.includes("[REDACTED:google_api_key]"));
	});
	it("does not redact AIza prefix of wrong length", () => {
		const input = "AIzaShort";
		assert.strictEqual(redactSensitiveData(input), input);
	});
});

describe("redactSensitiveData — aws_access_key", () => {
	it("redacts an AKIA prefixed access key id", () => {
		const input = "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE";
		const out = redactSensitiveData(input);
		assert.ok(out.includes("[REDACTED:aws_access_key]"));
	});
	it("does not redact lowercase 'akia' or wrong-length prefix", () => {
		const input = "akiaTooShort and AKIA-only-prefix";
		assert.strictEqual(redactSensitiveData(input), input);
	});
});

describe("redactSensitiveData — aws_secret_key", () => {
	it("redacts the aws_secret_access_key=…' assignment shape", () => {
		const input = "aws_secret_access_key = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY00'";
		const out = redactSensitiveData(input);
		assert.ok(out.includes("[REDACTED:aws_secret_key]"));
	});
	it("does not redact the AWS access key id shape (different pattern)", () => {
		const input = "secret_unrelated = 'random_value_here'";
		assert.strictEqual(redactSensitiveData(input), input);
	});
});

describe("redactSensitiveData — gcp_service_account", () => {
	it("redacts a GCP service account JSON blob with private_key", () => {
		const input = '{"type": "service_account", "project_id": "x", "private_key": "-----PRIVATE-----"}';
		const out = redactSensitiveData(input);
		assert.ok(out.includes("[REDACTED:gcp_service_account]"));
	});
	it("does not redact unrelated JSON blobs without service_account marker", () => {
		const input = '{"type": "user_account", "private_key": "abc"}';
		assert.strictEqual(redactSensitiveData(input), input);
	});
});

describe("redactSensitiveData — github_token_ghp", () => {
	it("redacts a ghp_ prefixed token", () => {
		const input = "GH_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123456789AB";
		const out = redactSensitiveData(input);
		assert.ok(out.includes("[REDACTED:github_token_ghp]"));
	});
	it("does not redact 'ghp_' prefix below length threshold", () => {
		const input = "ghp_short";
		assert.strictEqual(redactSensitiveData(input), input);
	});
});

describe("redactSensitiveData — github_token_gho", () => {
	it("redacts a gho_ prefixed token", () => {
		const input = "token=gho_abcdefghijklmnopqrstuvwxyz0123456789AB";
		const out = redactSensitiveData(input);
		assert.ok(out.includes("[REDACTED:github_token_gho]"));
	});
	it("does not redact short gho_ stub", () => {
		assert.strictEqual(redactSensitiveData("gho_x"), "gho_x");
	});
});

describe("redactSensitiveData — github_token_ghs", () => {
	it("redacts a ghs_ prefixed token", () => {
		const input = "token=ghs_abcdefghijklmnopqrstuvwxyz0123456789AB";
		const out = redactSensitiveData(input);
		assert.ok(out.includes("[REDACTED:github_token_ghs]"));
	});
	it("does not redact short ghs_ stub", () => {
		assert.strictEqual(redactSensitiveData("ghs_x"), "ghs_x");
	});
});

describe("redactSensitiveData — github_token_ghu", () => {
	it("redacts a ghu_ prefixed token", () => {
		const input = "token=ghu_abcdefghijklmnopqrstuvwxyz0123456789AB";
		const out = redactSensitiveData(input);
		assert.ok(out.includes("[REDACTED:github_token_ghu]"));
	});
	it("does not redact short ghu_ stub", () => {
		assert.strictEqual(redactSensitiveData("ghu_x"), "ghu_x");
	});
});

describe("redactSensitiveData — jwt", () => {
	it("redacts a three-part JWT", () => {
		const input = "Authorization-cookie: eyJhbGciOi.eyJzdWIiOi.signaturepart_-AB";
		const out = redactSensitiveData(input);
		assert.ok(out.includes("[REDACTED:jwt]"));
	});
	it("does not redact a single eyJ-prefixed segment", () => {
		const input = "eyJloneSegmentOnly";
		assert.strictEqual(redactSensitiveData(input), input);
	});
});

describe("redactSensitiveData — bearer_token", () => {
	it("redacts an Authorization Bearer header", () => {
		const input = "Authorization: Bearer abc123.def-456_ghi";
		const out = redactSensitiveData(input);
		assert.ok(out.includes("Authorization: Bearer [REDACTED:bearer_token]"));
		assert.ok(!out.includes("abc123.def-456_ghi"));
	});
	it("does not redact the word 'Bearer' in unrelated prose", () => {
		const input = "She is a Bearer of bad news.";
		assert.strictEqual(redactSensitiveData(input), input);
	});
});

describe("redactSensitiveData — ssh_private_key", () => {
	it("redacts a PEM-style SSH private key block", () => {
		const input = "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...lots of lines...\n-----END RSA PRIVATE KEY-----";
		const out = redactSensitiveData(input);
		assert.strictEqual(out, "[REDACTED:ssh_private_key]");
	});
	it("does not redact a PUBLIC key block", () => {
		const input = "-----BEGIN RSA PUBLIC KEY-----\nMIIBIjAN\n-----END RSA PUBLIC KEY-----";
		assert.strictEqual(redactSensitiveData(input), input);
	});
});

describe("redactSensitiveData — postgres_conn_string", () => {
	it("redacts a postgres connection URL", () => {
		const input = "DATABASE_URL=postgres://user:secret@host:5432/dbname";
		const out = redactSensitiveData(input);
		assert.ok(out.includes("postgres://[REDACTED]"));
		assert.ok(!out.includes("secret"));
	});
	it("does not redact a postgres URL without credentials", () => {
		const input = "see also postgres://localhost";
		assert.strictEqual(redactSensitiveData(input), input);
	});
});

describe("redactSensitiveData — mysql_conn_string", () => {
	it("redacts a mysql connection URL", () => {
		const input = "DB=mysql://root:hunter2@db.example/app";
		const out = redactSensitiveData(input);
		assert.ok(out.includes("mysql://[REDACTED]"));
	});
	it("does not redact a credential-free mysql URL", () => {
		const input = "see also mysql://localhost";
		assert.strictEqual(redactSensitiveData(input), input);
	});
});

describe("redactSensitiveData — mongodb_conn_string", () => {
	it("redacts a mongodb URL with credentials", () => {
		const input = "MONGODB=mongodb://user:pw@cluster0.mongodb.net";
		const out = redactSensitiveData(input);
		assert.ok(out.includes("mongodb://[REDACTED]"));
	});
	it("redacts mongodb+srv URL with credentials", () => {
		const input = "MONGODB=mongodb+srv://user:pw@cluster0.mongodb.net";
		const out = redactSensitiveData(input);
		assert.ok(out.includes("mongodb://[REDACTED]"));
	});
	it("does not redact a credential-free mongodb URL", () => {
		const input = "mongodb://localhost-only";
		assert.strictEqual(redactSensitiveData(input), input);
	});
});

// --- Structural cases ------------------------------------------------------------------------

describe("redactSensitiveData idempotency", () => {
	it("running redaction twice yields identical output (no double-replacement creep)", () => {
		const input =
			"sk-ant-abcdefghij0123456789ABCD and ghp_abcdefghijklmnopqrstuvwxyz0123456789AB and Bearer xyz.abc-123";
		const once = redactSensitiveData(input);
		const twice = redactSensitiveData(once);
		assert.strictEqual(twice, once);
	});
});

describe("redactLlmResponse", () => {
	it("redacts text fields in a content array", () => {
		const message = {
			role: "assistant",
			content: [
				{ type: "text", text: "key=sk-ant-abcdefghij0123456789ABCDEFG" },
				{ type: "text", text: "no secret here" },
			],
		};
		const out = redactLlmResponse(message);
		assert.ok((out.content[0] as { text: string }).text.includes("[REDACTED:anthropic_api_key]"));
		assert.strictEqual((out.content[1] as { text: string }).text, "no secret here");
		// Original is not mutated.
		assert.ok((message.content[0] as { text: string }).text.includes("sk-ant-"));
	});

	it("preserves non-text content items unchanged (tool calls, etc.)", () => {
		const message = {
			role: "assistant",
			content: [
				{ type: "toolCall", id: "tc_1", name: "verdict", arguments: { verdict: "CLEAN" } },
				{ type: "text", text: "Authorization: Bearer abc.def-123" },
			],
		};
		const out = redactLlmResponse(message);
		assert.deepStrictEqual(out.content[0], {
			type: "toolCall",
			id: "tc_1",
			name: "verdict",
			arguments: { verdict: "CLEAN" },
		});
		assert.ok((out.content[1] as { text: string }).text.includes("[REDACTED:bearer_token]"));
	});

	it("recurses into nested content arrays", () => {
		const message = {
			role: "assistant",
			content: [
				{
					type: "wrapper",
					content: [{ type: "text", text: "leaked AKIAIOSFODNN7EXAMPLE inside wrapper" }],
				},
			],
		};
		const out = redactLlmResponse(message);
		const wrapper = out.content[0] as { content: Array<{ text: string }> };
		assert.ok(wrapper.content[0].text.includes("[REDACTED:aws_access_key]"));
	});
});

// --- Project config loader -------------------------------------------------------------------

describe("loadProjectRedactionConfig", () => {
	it("loads custom patterns and rehydrates regex strings into RegExp", () => {
		const dir = mkdtempSync(path.join(tmpdir(), "trace-redactor-test-"));
		try {
			const configPath = path.join(dir, "trace-config.json");
			writeFileSync(
				configPath,
				JSON.stringify({
					patterns: [
						{ name: "internal_token", regex: "INT-[A-Z]{6}", domain: "corp" },
						{ name: "custom_label", regex: "CUSTOM-\\d+", replacement: "[CUSTOM]" },
					],
				}),
			);
			const patterns = loadProjectRedactionConfig(configPath);
			assert.strictEqual(patterns.length, 2);
			assert.ok(patterns[0].regex instanceof RegExp);
			assert.strictEqual(patterns[0].regex.flags, "g");
			assert.strictEqual(patterns[0].replacement, "[REDACTED:internal_token]");
			assert.strictEqual(patterns[1].replacement, "[CUSTOM]");
			// Round-trip: a string matching INT- shape gets redacted.
			const redacted = redactSensitiveData("see INT-ABCDEF in logs", { patterns });
			assert.ok(redacted.includes("[REDACTED:internal_token]"));
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("throws when the config file does not exist", () => {
		assert.throws(() => loadProjectRedactionConfig("/nonexistent/path/trace-config.json"), /not found/);
	});

	it("composes custom patterns with builtin patterns (both apply)", () => {
		const dir = mkdtempSync(path.join(tmpdir(), "trace-redactor-test-"));
		try {
			const configPath = path.join(dir, "trace-config.json");
			// Custom pattern targets a different sensitive shape so both fire on one input.
			writeFileSync(
				configPath,
				JSON.stringify({
					patterns: [{ name: "session_id", regex: "SESS-[a-z0-9]{8}" }],
				}),
			);
			const patterns = loadProjectRedactionConfig(configPath);
			const input = "key=sk-ant-abcdefghij0123456789ABCDEFG and session=SESS-abcd1234 in transcript";
			const out = redactSensitiveData(input, { patterns });
			assert.ok(out.includes("[REDACTED:anthropic_api_key]"));
			assert.ok(out.includes("[REDACTED:session_id]"));
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
