import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import extension from "./index.js";

describe("pi-agent-dispatch extension", () => {
	it("registers call-agent, author-agent-spec, run-real-checks, and commit-attested tools", () => {
		const registered: string[] = [];
		const pi = {
			registerTool: (tool: { name: string }) => {
				registered.push(tool.name);
			},
		} as unknown as ExtensionAPI;
		extension(pi);
		assert.ok(
			registered.includes("author-agent-spec"),
			`expected 'author-agent-spec' in ${JSON.stringify(registered)}`,
		);
		assert.ok(registered.includes("call-agent"), `expected 'call-agent' in ${JSON.stringify(registered)}`);
		assert.ok(registered.includes("run-real-checks"), `expected 'run-real-checks' in ${JSON.stringify(registered)}`);
		assert.ok(registered.includes("commit-attested"), `expected 'commit-attested' in ${JSON.stringify(registered)}`);
	});
});
