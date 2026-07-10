import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import extension, { assertDefaultsClean } from "./index.js";

describe("pi-agent-dispatch extension", () => {
	it("registers 6 static tools: call-agent, author-agent-spec, run-real-checks, commit-attested, author-tool-grant, run-work-order-loop", () => {
		const registered: string[] = [];
		const events: string[] = [];
		const pi = {
			registerTool: (tool: { name: string }) => {
				registered.push(tool.name);
			},
			// The dispatch-layer writer-identity gate: registerAuthGate calls pi.on('tool_call', ...); the
			// extension factory now performs this registration so the smoke
			// test must mock the event-listener surface to avoid a
			// TypeError. The handler is exercised in dedicated coverage at
			// auth-gate.test.ts; this mock only captures registration shape.
			on: (event: string) => {
				events.push(event);
			},
		} as unknown as ExtensionAPI;
		extension(pi);
		assert.ok(
			events.includes("tool_call"),
			`expected 'tool_call' handler registered; got events ${JSON.stringify(events)}`,
		);
		for (const name of [
			"author-agent-spec",
			"call-agent",
			"run-real-checks",
			"commit-attested",
			"author-tool-grant",
			"run-work-order-loop",
		]) {
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
