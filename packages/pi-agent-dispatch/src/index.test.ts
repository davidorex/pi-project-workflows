import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import extension, { assertDefaultsClean } from "./index.js";

describe("pi-agent-dispatch extension", () => {
	it("registers 5 static tools: call-agent, author-agent-spec, run-real-checks, commit-attested, author-tool-grant", () => {
		const registered: string[] = [];
		const pi = {
			registerTool: (tool: { name: string }) => {
				registered.push(tool.name);
			},
		} as unknown as ExtensionAPI;
		extension(pi);
		for (const name of ["author-agent-spec", "call-agent", "run-real-checks", "commit-attested", "author-tool-grant"]) {
			assert.ok(registered.includes(name), `expected '${name}' in ${JSON.stringify(registered)}`);
		}
	});

	it("L3 runtime guard throws when defaults contain a forbidden wholesale token", () => {
		assert.throws(() => assertDefaultsClean({ bash: { canonical_id: "bash" } }), /L3 runtime guard tripped.*bash/);
	});

	it("L3 runtime guard accepts clean defaults", () => {
		assert.doesNotThrow(() => assertDefaultsClean({ "context-status": { canonical_id: "context-status" } }));
	});
});
