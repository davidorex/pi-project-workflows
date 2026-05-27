import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FORBIDDEN_WHOLESALE_OPERATIONS, TOOL_OPERATION_DEFAULTS } from "./operation-vocab.js";

describe("FORBIDDEN_WHOLESALE_OPERATIONS", () => {
	it("TOOL_OPERATION_DEFAULTS contains zero forbidden wholesale tokens", () => {
		const violators = Object.values(TOOL_OPERATION_DEFAULTS).filter((op) =>
			(FORBIDDEN_WHOLESALE_OPERATIONS as readonly string[]).includes(op.canonical_id),
		);
		assert.deepEqual(
			violators.map((v) => v.canonical_id),
			[],
			`TOOL_OPERATION_DEFAULTS must not contain wholesale tokens — found: ${violators.map((v) => v.canonical_id).join(", ")} (feedback_no_parallel_ungated_paths)`,
		);
	});
});
